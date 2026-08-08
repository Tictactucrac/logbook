// /api/soufflerie.js
// API protégée par mot de passe. CRUD sur les sessions de soufflerie.
// Même modèle que jumps.js : table résolue selon le compte actif (x-account).

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  const TABLE = req.headers['x-account'] === 'marie' ? 'soufflerie_marie' : 'soufflerie';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const data = await fetchAll(SUPABASE_URL, headers, TABLE);
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body;
      const session_index = await nextSessionIndex(SUPABASE_URL, headers, TABLE, body.date);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...body, session_index, source: 'manuel' }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'PATCH') {
      const { id, ...fields } = req.body;
      if (!id) {
        res.status(400).json({ error: 'id manquant' });
        return;
      }

      if (fields.date) {
        const currentR = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}&select=date`,
          { headers }
        );
        const current = await currentR.json();
        if (current[0] && current[0].date !== fields.date) {
          fields.session_index = await nextSessionIndex(SUPABASE_URL, headers, TABLE, fields.date);
        }
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(fields),
      });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ error: 'id manquant' });
        return;
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      });
      res.status(r.status).json({ ok: r.ok });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function fetchAll(SUPABASE_URL, headers, table) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=date.asc,session_index.asc`,
      { headers: { ...headers, Range: `${from}-${from + pageSize - 1}` } }
    );
    const batch = await r.json();
    if (!Array.isArray(batch)) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function nextSessionIndex(SUPABASE_URL, headers, table, date) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?date=eq.${date}&select=session_index&order=session_index.desc&limit=1`,
    { headers }
  );
  const rows = await r.json();
  return rows.length ? rows[0].session_index + 1 : 1;
}
