// /api/jumps.js
// API protégée par mot de passe. La clé secrète Supabase ne quitte jamais ce fichier
// (elle vit uniquement côté serveur, dans les variables d'environnement Vercel).

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  // Compte actif : "valentin" (par défaut) ou "marie" -> table dédiée.
  const SAUTS_TABLE = req.headers['x-account'] === 'marie' ? 'sauts_marie' : 'sauts';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const data = await fetchAllSauts(SUPABASE_URL, headers, SAUTS_TABLE);
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body;
      const day_index = await nextDayIndex(SUPABASE_URL, headers, SAUTS_TABLE, body.date);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${SAUTS_TABLE}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...body, day_index, source: 'manuel' }),
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
          `${SUPABASE_URL}/rest/v1/${SAUTS_TABLE}?id=eq.${id}&select=date`,
          { headers }
        );
        const current = await currentR.json();
        if (current[0] && current[0].date !== fields.date) {
          fields.day_index = await nextDayIndex(SUPABASE_URL, headers, SAUTS_TABLE, fields.date);
        }
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/${SAUTS_TABLE}?id=eq.${id}`, {
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${SAUTS_TABLE}?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!r.ok) {
        const errText = await r.text();
        res.status(r.status).json({ error: errText || `Erreur Supabase (${r.status})` });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

async function fetchAllSauts(SUPABASE_URL, headers, table) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=date.asc,day_index.asc`,
      { headers: { ...headers, Range: `${from}-${from + pageSize - 1}` } }
    );
    const batch = await r.json();
    if (!Array.isArray(batch)) break; // erreur renvoyée par Supabase
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function nextDayIndex(SUPABASE_URL, headers, table, date) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?date=eq.${date}&select=day_index&order=day_index.desc&limit=1`,
    { headers }
  );
  const rows = await r.json();
  return rows.length ? rows[0].day_index + 1 : 1;
}
