// /shared/app.js
// Logique commune à toutes les pages : mot de passe, appels à l'API, petits helpers.
// Chaque page doit contenir dans son HTML : #authOverlay, #authInput, #authError,
// #authSubmit, #mainContent, #toast (voir index.html comme référence).

let APP_PW = localStorage.getItem('logbook_pw') || '';

const ACCOUNTS = [
  { id:'valentin', label:'Valentin' },
  { id:'marie',    label:'Marie' },
];
let ACCOUNT = localStorage.getItem('logbook_account') || 'valentin';

// Thème appliqué immédiatement (avant le premier rendu) pour éviter un flash de
// l'ancien thème au chargement — /shared/app.js est chargé en <head>, donc ceci
// s'exécute avant que le <body> ne soit peint.
const THEME_KEY = 'logbook_theme';
document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'dark');

const monthsFR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const fmtDate = d => { const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };

async function apiFetch(opts = {}){
  const endpoint = opts.endpoint || '/api/jumps';
  const res = await fetch(endpoint + (opts.query || ''), {
    method: opts.method || 'GET',
    headers: { 'Content-Type':'application/json', 'x-app-password': APP_PW, 'x-account': ACCOUNT },
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

// ---------- Export CSV générique ----------
function csvEscape(v){
  if(v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function toCSV(headers, rows){
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
  return lines.join('\r\n');
}
function downloadCSV(filename, csvText){
  const blob = new Blob(['\uFEFF' + csvText], { type:'text/csv;charset=utf-8;' }); // BOM -> accents OK dans Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Ouvre une modale générique de choix de colonnes puis télécharge un CSV.
// fields: [{ key, label, get:(row)=>valeur, default:bool (true si omis) }]
function openExportModal({ title, fields, rows, filename }){
  const existing = document.getElementById('exportModalOverlay');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'overlay open';
  modal.id = 'exportModalOverlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-head">
        <span class="modal-title">${title}</span>
        <button class="modal-close" id="exportModalClose">×</button>
      </div>
      <p style="color:var(--text-secondary); font-size:13px; margin-bottom:14px;">Choisis les colonnes à inclure (${rows.length} ligne(s)).</p>
      <div class="export-fields">
        ${fields.map(f => `
          <label class="export-field-row">
            <input type="checkbox" data-key="${f.key}" ${f.default === false ? '' : 'checked'}>
            ${f.label}
          </label>
        `).join('')}
      </div>
      <div class="modal-footer">
        <div style="display:flex; gap:10px; margin-left:auto;">
          <button type="button" class="btn btn-ghost" id="exportModalCancel">Annuler</button>
          <button type="button" class="btn btn-primary" id="exportModalConfirm">Télécharger le CSV</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = ()=> modal.remove();
  modal.querySelector('#exportModalClose').addEventListener('click', close);
  modal.querySelector('#exportModalCancel').addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target === modal) close(); });

  modal.querySelector('#exportModalConfirm').addEventListener('click', ()=>{
    const checked = fields.filter(f => modal.querySelector(`[data-key="${f.key}"]`).checked);
    if(!checked.length){ showToast('Choisis au moins une colonne'); return; }
    const headers = checked.map(f => f.label);
    const csvRows = rows.map(row => checked.map(f => f.get(row)));
    downloadCSV(filename, toCSV(headers, csvRows));
    close();
    showToast('Export téléchargé');
  });
}

// Initialise le verrou mot de passe. Appelle onReady(data) une fois authentifié
// (au chargement si un mot de passe est déjà mémorisé, sinon après saisie).
// endpoint : quel appel sert à la fois de vérification du mot de passe ET de première
// récupération de données (par défaut /api/jumps, ex: /api/soufflerie pour cette page-là).
function initAuth(onReady, endpoint){
  const overlay = document.getElementById('authOverlay');
  const input = document.getElementById('authInput');
  const err = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');
  const main = document.getElementById('mainContent');

  async function tryAuth(pw, silent){
    APP_PW = pw;
    if(!silent){ btn.disabled = true; btn.textContent = '...'; }
    try{
      const data = await apiFetch({ endpoint: endpoint || '/api/jumps' });
      localStorage.setItem('logbook_pw', pw);
      overlay.classList.remove('open');
      main.style.display = '';
      onReady(data);
    }catch(e){
      overlay.classList.add('open');
      err.style.display = 'block';
      localStorage.removeItem('logbook_pw');
    }finally{
      if(!silent){ btn.disabled = false; btn.textContent = 'Entrer'; }
    }
  }

  btn.addEventListener('click', ()=> tryAuth(input.value));
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter') tryAuth(e.target.value); });

  // Mot de passe déjà mémorisé : on vérifie en silence, sans montrer la modale.
  // Sinon (première visite, ou mémoire effacée) : on affiche la modale tout de suite.
  if(APP_PW){ tryAuth(APP_PW, true); } else { overlay.classList.add('open'); }
}

// Rend le prénom du brand (en haut à gauche) cliquable, avec un petit menu pour
// changer de compte (Valentin / Marie). Change de compte = recharge la page, pour
// repartir sur un état propre (jumps, avionsMap, graphiques déjà en mémoire, etc.)
function initAccountSwitcher(){
  const nameEl = document.querySelector('.brand-name');
  const wrapper = nameEl && nameEl.closest('.brand-text');
  if(!nameEl || !wrapper) return;

  const current = ACCOUNTS.find(a => a.id === ACCOUNT) || ACCOUNTS[0];
  nameEl.textContent = current.label.toUpperCase();
  nameEl.style.cursor = 'pointer';
  wrapper.style.position = 'relative';

  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.innerHTML = ACCOUNTS.map(a =>
    `<button data-account="${a.id}" class="${a.id === ACCOUNT ? 'active' : ''}">${a.label}</button>`
  ).join('');
  wrapper.appendChild(menu);

  nameEl.addEventListener('click', e=>{
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', ()=> menu.classList.remove('open'));

  menu.querySelectorAll('[data-account]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const acc = btn.dataset.account;
      if(acc === ACCOUNT) { menu.classList.remove('open'); return; }
      localStorage.setItem('logbook_account', acc);
      location.reload();
    });
  });
}

// Injecte le switch clair/sombre dans le topbar (visible sur toutes les pages,
// même quand les onglets sont cachés en mobile) et le relie au thème mémorisé.
function initThemeSwitch(){
  const topbar = document.querySelector('.topbar');
  if(!topbar) return;

  const wrap = document.createElement('div');
  wrap.className = 'theme-switch-wrap';
  wrap.title = 'Changer de thème';
  wrap.innerHTML = `
    <span class="theme-icon">☀</span>
    <label class="theme-toggle">
      <input type="checkbox" id="themeToggleInput">
      <span class="theme-toggle-track"><span class="theme-toggle-thumb"></span></span>
    </label>
    <span class="theme-icon">🌙</span>
  `;
  topbar.appendChild(wrap);

  const input = wrap.querySelector('#themeToggleInput');
  input.checked = document.documentElement.getAttribute('data-theme') === 'light';
  input.addEventListener('change', ()=>{
    const theme = input.checked ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('[data-soon]').forEach(t=>{
    t.addEventListener('click', ()=> showToast('Bientôt disponible'));
  });
  initAccountSwitcher();
  initThemeSwitch();
});
