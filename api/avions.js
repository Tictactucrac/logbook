// /api/avions.js
// Lecture + écriture de la table `avions` (immat -> type_avion), pour afficher et
// éditer le type d'appareil associé à chaque immatriculation dans les pages de stats.

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  // Compte actif : "valentin" (par défaut) ou "marie" -> table dédiée.
  const AVIONS_TABLE = req.headers['x-account'] === 'marie' ? 'avions_marie' : 'avions';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${AVIONS_TABLE}?select=*&order=immat.asc`, { headers });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST') {
      const immat = (req.body && req.body.immat || '').trim();
      const type_avion = (req.body && req.body.type_avion || '').trim();
      if (!immat) {
        res.status(400).json({ error: 'Immatriculation manquante' });
        return;
      }
      // Upsert sur la clé primaire `immat` : crée la ligne si elle n'existe pas encore,
      // sinon met juste à jour type_avion.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${AVIONS_TABLE}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ immat, type_avion: type_avion || null }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
