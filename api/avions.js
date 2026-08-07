// /api/avions.js
// Lecture seule de la table `avions` (immat -> type_avion), pour afficher le type
// d'appareil à côté de chaque immatriculation dans les pages de stats.

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non supportée' });
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
    const r = await fetch(`${SUPABASE_URL}/rest/v1/avions?select=*&order=immat.asc`, { headers });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
