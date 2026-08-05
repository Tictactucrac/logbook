// /api/jumps.js
// API protégée par mot de passe. La clé secrète Supabase ne quitte jamais ce fichier
// (elle vit uniquement côté serveur, dans les variables d'environnement Vercel).

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/sauts?select=*&order=date.asc,day_index.asc`,
        { headers }
      );
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body;
      const day_index = await nextDayIndex(SUPABASE_URL, headers, body.date);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/sauts`, {
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
          `${SUPABASE_URL}/rest/v1/sauts?id=eq.${id}&select=date`,
          { headers }
        );
        const current = await currentR.json();
        if (current[0] && current[0].date !== fields.date) {
          fields.day_index = await nextDayIndex(SUPABASE_URL, headers, fields.date);
        }
      }

      const r = await fetch(`${SUPABASE_URL}/rest/v1/sauts?id=eq.${id}`, {
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/sauts?id=eq.${id}`, {
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

async function nextDayIndex(SUPABASE_URL, headers, date) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sauts?date=eq.${date}&select=day_index&order=day_index.desc&limit=1`,
    { headers }
  );
  const rows = await r.json();
  return rows.length ? rows[0].day_index + 1 : 1;
}
