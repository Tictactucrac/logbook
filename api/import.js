// /api/import.js
// Reçoit une liste de sauts déjà filtrés (nouveaux uniquement, day_index déjà calculé
// côté frontend) et les insère en une seule requête groupée dans Supabase.

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non supportée' });
    return;
  }

  const rows = req.body && req.body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'Aucune ligne à importer' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const payload = rows.map(r => ({ ...r, source: 'import_ecole' }));

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sauts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json(data);
      return;
    }
    res.status(200).json({ inserted: Array.isArray(data) ? data.length : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
