// /shared/app.js
// Logique commune à toutes les pages : mot de passe, appels à l'API, petits helpers.
// Chaque page doit contenir dans son HTML : #authOverlay, #authInput, #authError,
// #authSubmit, #mainContent, #toast (voir index.html comme référence).

let APP_PW = localStorage.getItem('logbook_pw') || '';

const monthsFR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const fmtDate = d => { const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };

async function apiFetch(opts = {}){
  const endpoint = opts.endpoint || '/api/jumps';
  const res = await fetch(endpoint + (opts.query || ''), {
    method: opts.method || 'GET',
    headers: { 'Content-Type':'application/json', 'x-app-password': APP_PW },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if(res.status === 401){ const e = new Error('auth'); e.authError = true; throw e; }
  if(!res.ok){ throw new Error('Erreur serveur'); }
  return res.json();
}

function computeGlobalN(list){
  const sorted = [...list].sort((a,b)=> a.date===b.date ? a.day_index-b.day_index : a.date.localeCompare(b.date));
  sorted.forEach((j,i)=>{ j.global_n = i+1; });
  return sorted;
}

// Regroupe les sauts par une clé (ex: 'avion', 'lieu', 'principale').
// Retourne un tableau trié par nombre de sauts décroissant.
function groupStats(jumps, field){
  const map = {};
  jumps.forEach(j=>{
    const key = (j[field] || '').trim() || '—';
    if(!map[key]) map[key] = { key, count:0, first:j.date, last:j.date, altSum:0, altCount:0 };
    map[key].count++;
    if(j.date < map[key].first) map[key].first = j.date;
    if(j.date > map[key].last) map[key].last = j.date;
    if(j.altitude_m){ map[key].altSum += j.altitude_m; map[key].altCount++; }
  });
  const total = jumps.length || 1;
  return Object.values(map)
    .map(g => ({ ...g, pct: (g.count/total*100), avgAlt: g.altCount ? Math.round(g.altSum/g.altCount) : null }))
    .sort((a,b)=> b.count - a.count);
}

let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2800);
}

// Initialise le verrou mot de passe. Appelle onReady(jumps) une fois authentifié
// (au chargement si un mot de passe est déjà mémorisé, sinon après saisie).
function initAuth(onReady){
  const overlay = document.getElementById('authOverlay');
  const input = document.getElementById('authInput');
  const err = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');
  const main = document.getElementById('mainContent');

  async function tryAuth(pw){
    APP_PW = pw;
    btn.disabled = true; btn.textContent = '...';
    try{
      const data = await apiFetch();
      localStorage.setItem('logbook_pw', pw);
      overlay.classList.remove('open');
      main.style.display = '';
      onReady(data);
    }catch(e){
      err.style.display = 'block';
      localStorage.removeItem('logbook_pw');
    }finally{
      btn.disabled = false; btn.textContent = 'Entrer';
    }
  }

  btn.addEventListener('click', ()=> tryAuth(input.value));
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter') tryAuth(e.target.value); });
  if(APP_PW){ tryAuth(APP_PW); }
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('[data-soon]').forEach(t=>{
    t.addEventListener('click', ()=> showToast('Bientôt disponible'));
  });
});
