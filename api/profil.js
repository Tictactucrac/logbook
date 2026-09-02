// /api/profil.js
// Lecture + écriture du "profil matériel" : une seule ligne par compte contenant tout ce
// qui ne peut pas être déduit de l'historique des sauts (dates de fabrication/révision/
// repliage, points de départ des compteurs de sauts). Le modèle/nom du matos reste, lui,
// déduit du dernier saut (comme dans materiel.html) — pas dupliqué ici.

module.exports = async function handler(req, res) {
  const password = req.headers['x-app-password'];
  if (!password || password !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe invalide' });
    return;
  }

  // Compte actif : "valentin" (par défaut) ou "marie" -> table dédiée.
  const TABLE = req.headers['x-account'] === 'marie' ? 'materiel_profil_marie' : 'materiel_profil';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      // Une seule ligne (id=1), qui peut ne pas encore exister -> objet vide par défaut.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*&id=eq.1`, { headers });
      const data = await r.json();
      res.status(r.status).json((Array.isArray(data) && data[0]) || {});
      return;
    }

    if (req.method === 'POST') {
      // Upsert sur id=1 : crée la ligne au premier enregistrement, sinon la met à jour.
      const body = { ...req.body, id: 1, updated_at: new Date().toISOString() };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      res.status(r.status).json(Array.isArray(data) ? data[0] : data);
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
