/* Zones Relais v4 – interface prof / élève, échanges QR (Kit N'EPS), 50 m + relais, barème /12
   N'EPS · by Quentin Delisle */
'use strict';

const KEY = 'relaisz_v2';
const APP = 'zr';            // identifiant des paquets QR (un QR d'une autre appli est refusé)
const BASE = 100;            // barème et cible établis sur 100 m (2 × 50 m)
const BONUS_MS = 300;        // relayeur : temps 50 m − 0,3 s

const DEFAULT_CRIT = [
  { k: 'repere', l: 'Départ à un repère visuel' },
  { k: 'signal', l: 'Signal sonore déclenche la transmission' },
  { k: 'noReacc', l: 'Relayeur ne réaccélère pas après la transmission' },
  { k: 'main', l: 'Passage de main optimal' }
];
const FAILS = [
  { k: 'temoin', label: 'Témoin tombé' },
  { k: 'zone', label: 'Transmission hors zone' },
  { k: 'autre', label: 'Autre (faux départ, arrêt…)' }
];
const GAP_BINS = [
  { label: 'Plus rapide dans la Zt', test: g => g > 0, cls: 'g4' },
  { label: '0 à −8 %', test: g => g >= -8, cls: 'g3' },
  { label: '−8 à −15 %', test: g => g >= -15, cls: 'g2' },
  { label: '−15 à −20 %', test: g => g >= -20, cls: 'g1' },
  { label: 'Au-delà de −20 %', test: () => true, cls: 'g0' }
];

/* ---------------- barèmes ---------------- */
const PTS16 = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3];
const B_IND = {
  F: [9.6, 9.4, 9.3, 9.1, 8.9, 8.8, 8.7, 8.5, 8.3, 8.2, 8.1, 8.0, 7.9, 7.8, 7.7, 7.6],
  G: [8.6, 8.3, 8.2, 8.0, 7.8, 7.7, 7.6, 7.4, 7.3, 7.2, 7.1, 7.0, 6.9, 6.8, 6.7, 6.6]
};
const B_COL = {
  F: [19.5, 19.0, 18.8, 18.4, 18.1, 17.9, 17.7, 17.5, 17.3, 16.9, 16.5, 16.2, 16.0, 15.8, 15.6, 15.4],
  G: [17.5, 17.0, 16.5, 16.2, 15.8, 15.6, 15.4, 15.0, 14.5, 14.3, 14.1, 13.8, 13.6, 13.4, 13.2, 13.0]
};
const DEGREES = [
  { n: 1, min: 0, max: 6, lv: [0, 0.5, 1, 1.2] },
  { n: 2, min: 7, max: 10, lv: [1.4, 1.8, 2.4, 2.8] },
  { n: 3, min: 11, max: 13, lv: [3, 3.8, 4.5] },
  { n: 4, min: 14, max: 16, lv: [5, 5.5, 6] }
];
function ptsFrom(table, sexe, ms) {
  const th = table[sexe]; if (!th || ms == null) return null;
  const t = Math.round(ms / 10) / 100; let pts = 0;
  th.forEach((lim, i) => { if (t <= lim + 1e-9) pts = PTS16[i]; });
  return pts;
}
function starsFromIT(it) { const r = Math.round(it * 10) / 10; return r <= 0 ? 4 : r <= 0.5 ? 3 : r <= 1.0 ? 2 : 1; }
function etNote(stars, rate, ov, real16) {
  const deg = DEGREES.find(d => stars >= d.min && stars <= d.max) || DEGREES[0];
  const allowed = deg.lv.filter(v => !(v === 6 && !(stars === 16 && real16)));
  const idx = Math.min(allowed.length - 1, Math.floor((rate || 0) * allowed.length));
  const auto = allowed[idx], manual = ov != null && allowed.includes(ov);
  return { deg, allowed, auto, note: manual ? ov : auto, manual };
}

/* ---------------- utilitaires ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms, d = 2) => ms == null ? '–' : (ms / 1000).toFixed(d).replace('.', ',');
const fnum = (n, d = 1) => n == null ? '–' : n.toFixed(d).replace('.', ',');
const fpt = n => n == null ? '–' : String(Math.round(n * 100) / 100).replace('.', ',');
const fgap = g => g == null ? '–' : (g > 0 ? '+' : '') + fnum(g) + ' %';
const fit = it => it == null ? '–' : (it > 0 ? '+' : '') + fnum(it, 2) + ' s';
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const mmss = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const starsHTML = n => n == null ? '–' : `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(4 - n)}</span></span>`;
const norm = w => String(w || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
const keyOf = (nom, prenom) => norm(nom) + '|' + norm(prenom);
const cap = w => w ? w.charAt(0).toLocaleUpperCase('fr') + w.slice(1).toLocaleLowerCase('fr') : '';
const dayOf = ts => new Date(ts).toISOString().slice(0, 10);
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const parseSex = v => { const s = norm(v); return /^(f|fille|féminin|feminin|femme)/.test(s) ? 'F' : /^(g|garçon|garcon|m|masculin|h|homme)/.test(s) ? 'G' : ''; };
const safeName = s => String(s).replace(/[^\p{L}\d _-]+/gu, '').trim().replace(/\s+/g, '_') || 'classe';

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  return root.querySelector('.modal');
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ---------------- état & stockage ---------------- */
const S = load();
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!d || !d.classes) d = { classes: [], cur: null, pending: null, settings: { total: 100 } };
  migrate(d); return d;
}
function migrate(d) {
  d.v = 4;
  d.settings = Object.assign({ total: 100, zt: 20, tablet: '', rec: 210 }, d.settings || {});
  if (!d.pin) d.pin = '0000';
  if (d.mode === undefined) d.mode = null;              // 'prof' | 'eleve' | null (premier lancement)
  d.classes.forEach(c => {
    c.sprints = c.sprints || []; c.passages = c.passages || []; c.group = c.group || []; c.overrides = c.overrides || {};
    c.crit = c.crit || DEFAULT_CRIT.map(x => ({ ...x }));
    c.grp = c.grp || {}; c.ng = c.ng || 0; c.b50ext = c.b50ext || {};
    if (c.myGroup === undefined) c.myGroup = null;
    c.students.forEach(s => { if (s.sexe === undefined) s.sexe = ''; });
  });
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Sauvegarde impossible (stockage plein ?)'); }
}
function dedupe(list) { const seen = new Set(); return list.filter(s => !seen.has(s.id) && seen.add(s.id)); }
const cls = () => S.classes.find(c => c.id === S.cur) || null;
const stu = (c, id) => c.students.find(s => s.id === id);
const isProf = () => S.mode === 'prof';
const tabletName = () => S.settings.tablet || (isProf() ? 'Tablette prof' : 'Tablette élève');
const crits = c => (c && c.crit && c.crit.length ? c.crit : DEFAULT_CRIT);

function dnStudent(c, s) {
  if (!s.prenom) return s.nom;
  const nom = s.nom.replace(/\s+/g, '');
  let k = 1;
  const twins = c.students.filter(o => o.id !== s.id && norm(o.prenom) === norm(s.prenom));
  while (k < nom.length && twins.some(o => norm(o.nom.replace(/\s+/g, '')).startsWith(norm(nom.slice(0, k))))) k++;
  return `${s.prenom} ${cap(nom.slice(0, k))}.`;
}
function dn(c, id, snap) {
  const s = stu(c, id);
  if (s) return dnStudent(c, s);
  if (snap) return dnStudent(c, { id, ...snap });
  return '(élève inconnu)';
}
const byFirst = (x, y) => ((x.prenom || x.nom) + ' ' + x.nom).localeCompare((y.prenom || y.nom) + ' ' + y.nom, 'fr', { sensitivity: 'base' });
const snap = (c, id) => { const s = stu(c, id); return s ? { nom: s.nom, prenom: s.prenom, sexe: s.sexe } : null; };
const sexBadge = sx => `<span class="sex ${sx || 'none'}">${sx || '?'}</span>`;

/* ---------------- performances ---------------- */
function best50(c, sid, list = c.sprints) {
  const t = list.filter(s => s.sid === sid && s.t != null).map(s => s.t);
  if (list === c.sprints && c.b50ext && c.b50ext[sid] != null) t.push(c.b50ext[sid]); // meilleur temps reçu du prof
  return t.length ? Math.min(...t) : null;
}
function cible100(c, d, r) {
  const a = best50(c, d), b = best50(c, r);
  return a == null || b == null ? null : a + b - BONUS_MS;
}
const distOf = p => (p.cfg && p.cfg.total) || S.settings.total;
const teqOf = p => p.tEnd == null ? null : p.tEnd * BASE / distOf(p);
function passStars(c, p) {
  if (p.fail) return 1;
  if (p.stars != null) return p.stars;
  const cb = p.cible ?? cible100(c, p.d, p.r), te = teqOf(p);
  return cb != null && te != null ? starsFromIT((te - cb) / 1000) : null;
}
function passIT(c, p) {
  if (p.fail) return null;
  if (p.it != null) return p.it;
  const cb = p.cible ?? cible100(c, p.d, p.r), te = teqOf(p);
  return cb != null && te != null ? Math.round((te - cb) / 10) / 100 : null;
}
function computeSpeed(tIn, tOut, tEnd, total, zt) {
  if ([tIn, tOut, tEnd].some(t => t == null)) return null;
  const tZt = tOut - tIn, tRest = tEnd - tZt;
  if (tZt <= 0 || tRest <= 0) return null;
  const vZt = zt / (tZt / 1000), vR = (total - zt) / (tRest / 1000);
  return { tZt, vZt, vR, gap: Math.round((vZt - vR) / vR * 1000) / 10 };
}
// vitesses, écart Zt, cible ramenée, IT et étoiles calculés à partir des temps bruts
function finalize(p) {
  const D = p.cfg.total, zt = p.cfg.zt;
  const sp = p.tIn != null && p.tZt != null && p.tEnd != null ? computeSpeed(p.tIn, p.tIn + p.tZt, p.tEnd, D, zt) : null;
  p.vZt = sp ? +sp.vZt.toFixed(3) : null; p.vR = sp ? +sp.vR.toFixed(3) : null; p.gap = sp ? sp.gap : null;
  p.tgt = p.cible != null ? Math.round(p.cible * D / BASE) : null;
  if (p.fail != null) { p.stars = 1; p.it = null; }
  else if (p.cible != null && p.tEnd != null) { p.it = Math.round((p.tEnd * BASE / D - p.cible) / 10) / 100; p.stars = starsFromIT(p.it); }
  else { p.it = null; p.stars = null; }
  return p;
}

/* ---------------- récupération ---------------- */
function lastEnd(c, sid) {
  let m = 0;
  c.sprints.forEach(s => { if (s.sid === sid && (s.endAt || 0) > m) m = s.endAt; });
  c.passages.forEach(p => { if ((p.d === sid || p.r === sid) && (p.endAt || 0) > m) m = p.endAt; });
  if (S.pending && (S.pending.d === sid || S.pending.r === sid)) m = Math.max(m, S.pending.endAt || 0);
  return m || null;
}
const recMs = () => (S.settings.rec || 210) * 1000;
function recLeft(c, sid) { const e = lastEnd(c, sid); return e ? Math.max(0, recMs() - (Date.now() - e)) : 0; }
function recCheck(ids) {
  const c = cls(); const w = ids.filter(id => recLeft(c, id) > 0);
  if (!w.length) return true;
  return confirm(`⚠️ Récupération insuffisante (minimum ${mmss(recMs())}) :\n\n` +
    w.map(id => `• ${dn(c, id)} : ${mmss(Date.now() - lastEnd(c, id))} de récupération, encore ${mmss(recLeft(c, id))}`).join('\n') +
    '\n\nLancer quand même ?');
}
function updateRec() {
  const c = cls(); if (!c) return;
  $$('.rec[data-sid]').forEach(el => {
    const ms = recLeft(c, el.dataset.sid), tile = el.closest('.tile');
    if (ms > 0) { el.textContent = '⏱ ' + mmss(ms); el.className = 'rec wait'; tile && tile.classList.add('resting'); }
    else { el.textContent = lastEnd(c, el.dataset.sid) ? '✓ récupéré' : ''; el.className = 'rec ok'; tile && tile.classList.remove('resting'); }
  });
  const warnFor = (ids, el) => {
    const w = ids.filter(id => recLeft(c, id) > 0);
    el.classList.toggle('hidden', !w.length);
    el.innerHTML = w.length ? '⚠️ Récupération insuffisante : ' + w.map(id => `${esc(dn(c, id))} (encore ${mmss(recLeft(c, id))})`).join(' · ') : '';
  };
  if (view === 'chrono' && run && run.t0 === null) warnFor([run.d, run.r], $('#c-warn')); else $('#c-warn').classList.add('hidden');
  if (view === 'sprun' && sp && sp.t0 === null) warnFor(sp.runners.map(r => r.sid), $('#sp-warn')); else $('#sp-warn').classList.add('hidden');
}
setInterval(updateRec, 1000);

/* =====================================================================
   NAVIGATION · interface prof / élève
   ===================================================================== */
const PROF_ONLY = ['menu', 'classes', 'params', 'groupes', 'bilan'];
const TITLES = {
  role: ['Zones Relais', 'Choix du rôle de la tablette'], menu: ['Espace enseignant', ''], eleve: ['Tablette élève', ''],
  classes: ['Classes', 'Import et choix de la classe'], params: ['Paramètres de la course', 'Distances, récupération, critères'],
  groupes: ['Groupes', 'Une tablette par groupe pour le relais'], send: ['Envoyer', ''], recv: ['Recevoir', ''],
  group: ['Élèves de la tablette', '50 m'], sprint: ['① 50 m départ arrêté', ''], sprun: ['① 50 m', 'Chronomètre'],
  tiles: ['② Relais', ''], chrono: ['② Relais', 'Chronomètre'], eval: ['② Relais', 'Critères du passage'], bilan: ['Bilan chiffré', '']
};
let view = 'role';
const home = () => isProf() ? 'menu' : 'eleve';
function show(v) {
  if (!S.mode) v = 'role';
  else if (S.pending && v !== 'eval') v = 'eval';
  else if (!isProf() && PROF_ONLY.includes(v)) v = 'eleve';
  if (['tiles', 'bilan', 'group', 'sprint', 'groupes', 'params'].includes(v) && !cls()) { toast(isProf() ? 'Importez ou choisissez une classe' : 'Recevez d\'abord la séance (QR du prof)'); v = isProf() ? 'classes' : 'eleve'; }
  if (view === 'recv' && v !== 'recv') stopScan();
  if (view === 'send' && v !== 'send') { clearInterval(qrTimer); $('#send-qr').innerHTML = ''; }
  view = v;
  $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
  document.body.classList.toggle('locked', !!S.pending);
  document.body.classList.toggle('is-prof', isProf());
  const [t, sub] = TITLES[v] || ['Zones Relais', ''];
  $('#tb-main').textContent = t;
  $('#tb-sub').textContent = sub || (cls() ? cls().name + ' · ' + tabletName() : 'N\'EPS · Académie de Nantes');
  renderTop();
  ({ menu: renderMenu, eleve: renderEleve, classes: renderClasses, params: renderParams, groupes: renderGroupes,
     send: renderSend, recv: renderRecv, group: renderGroup, sprint: renderSprintTiles, sprun: renderSprun, tiles: renderTiles,
     chrono: renderChrono, eval: renderEval, bilan: renderBilan }[v] || (() => {}))();
  updateRec();
  window.scrollTo(0, 0);
}
function renderTop() {
  const homeBtn = !['menu', 'eleve', 'role'].includes(view) ? `<button class="btn small tb-btn" data-nav="home">⌂ Accueil</button>` : '';
  $('#tb-right').innerHTML = S.mode ? homeBtn + `<div class="role-sw" role="group" aria-label="Interface">
    <button class="${isProf() ? '' : 'on'}" data-sw="eleve"><span>🧒</span><b>Élève</b></button>
    <button class="${isProf() ? 'on' : ''}" data-sw="prof"><span>🧑‍🏫</span><b>Prof</b></button></div>` : '';
}
function leaveOk() {
  if (S.pending) { toast('Renseignez tous les critères du passage avant de continuer'); flashMissing(); return false; }
  if (view === 'chrono' && run && run.t0 !== null && !confirm('Quitter le chrono ? Ce passage ne sera pas enregistré.')) return false;
  if (view === 'sprun' && sp && sp.t0 !== null && !confirm('Quitter le 50 m en cours ? Les temps ne seront pas enregistrés.')) return false;
  stopClock(); run = null; sp = null; return true;
}
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]'), sw = e.target.closest('[data-sw]'), go = e.target.closest('[data-go]');
  if (nav) { if (leaveOk()) show(home()); }
  else if (sw) {
    const to = sw.dataset.sw; if (to === S.mode) return;
    if (!leaveOk()) return;
    if (to === 'eleve') { S.mode = 'eleve'; save(); show('eleve'); }
    else pinPad(() => { S.mode = 'prof'; save(); show('menu'); });
  }
  else if (go) { if (go.disabled) return; if (leaveOk()) openGo(go.dataset.go); }
});
$('#tb-home').onclick = () => { if (S.mode && leaveOk()) show(home()); };
$$('[data-role]').forEach(b => b.onclick = () => {
  const r = b.dataset.role;
  const doIt = () => { S.mode = r; save(); show(home()); };
  if (r === 'prof' && S.classes.length) pinPad(doIt); else doIt();
});
function openGo(g) {
  if (g === 'send-s') { sendKind = 'S'; show('send'); }
  else if (g === 'send-r') { sendKind = 'R'; show('send'); }
  else if (g === 'recv-r') { recvKind = 'R'; show('recv'); }
  else if (g === 'recv-s') { recvKind = 'S'; show('recv'); }
  else if (g === 'tiles') { const c = cls(); if (c && !isProf() && c.ng && c.myGroup == null) { show('eleve'); toast('Choisissez d\'abord votre groupe'); } else show('tiles'); }
  else show(g);
}

/* ---------------- code enseignant ---------------- */
function pinPad(onOk, title = '🔒 Code enseignant') {
  let code = '';
  const m = modal(`<h2 class="center">${title}</h2><div class="pin-dots">${'<span></span>'.repeat(4)}</div>
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✕'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
    <p class="center hint">Code par défaut : 0000 (modifiable dans Paramètres de la course)</p>`);
  const dots = m.querySelectorAll('.pin-dots span');
  m.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === '✕') return closeModal();
    if (k === '⌫') code = code.slice(0, -1); else if (code.length < 4) code += k;
    dots.forEach((d, i) => d.classList.toggle('f', i < code.length));
    if (code.length === 4) {
      if (code === String(S.pin || '0000')) { closeModal(); onOk(); }
      else { toast('Code incorrect'); code = ''; dots.forEach(d => d.classList.remove('f')); }
    }
  });
}

/* =====================================================================
   PROF : menu par étapes
   ===================================================================== */
function renderMenu() {
  const c = cls();
  $('#menu-class').innerHTML = c ? `
    <div class="row between wrap"><div><span class="meta">Classe</span><h2 style="margin:0">${esc(c.name)}</h2>
      <span class="meta">${c.students.length} élèves · ${S.settings.total} m (Zt ${S.settings.zt} m) · ${crits(c).length} critères · récupération ${mmss(recMs())}</span></div>
      <button class="btn ghost small" data-go="classes">Changer / importer</button></div>`
    : `<div class="row between wrap"><b>Aucune classe : commencez par importer la liste.</b><button class="btn primary" data-go="classes">Importer une classe</button></div>`;
  if (!c) { $('#menu-steps').innerHTML = ''; return; }
  const n50 = c.students.filter(s => best50(c, s.id) != null).length;
  const nRel = c.passages.length, tabs = new Set([...c.sprints, ...c.passages].filter(x => !x.local).map(x => x.tablet || '?')).size;
  const nGrp = c.ng ? Object.keys(c.grp).length : 0;
  const step = (n, title, desc, btns, done) => `<div class="step ${done ? 'done' : ''}"><div class="step-n">${n}</div>
    <div class="step-body"><h3>${title}</h3><p class="meta">${desc}</p><div class="step-btns">${btns}</div></div></div>`;
  $('#menu-steps').innerHTML =
    step('0', 'Préparer la course', 'Distance, zone de transmission, récupération, critères observables, code enseignant.',
      `<button class="tile-btn" data-go="params"><span>⚙︎</span>Paramètres & critères</button>`, true) +
    step('1', '50 m départ arrêté · tablettes élèves', `Envoyez la séance aux tablettes, les élèves chronomètrent leurs 50 m, puis récupérez les QR. <b>${n50}/${c.students.length}</b> élèves chronométrés${tabs ? ` · ${tabs} tablette(s) reçue(s)` : ''}.`,
      `<button class="tile-btn blue" data-go="send-s"><span>📤</span>Envoyer la séance</button>
       <button class="tile-btn" data-go="recv-r"><span>📥</span>Récupérer les 50 m</button>`, n50 > 0) +
    step('2', 'Faire les groupes', c.ng ? `<b>${c.ng} groupes</b> validés (${nGrp} élèves). Envoyez-les : chaque tablette choisit son groupe.` : 'Groupes construits d\'après les 50 m (homogènes, hétérogènes ou aléatoires, mixité F/G).',
      `<button class="tile-btn" data-go="groupes"><span>👥</span>Faire les groupes</button>
       <button class="tile-btn blue" data-go="send-s" ${c.ng ? '' : 'disabled'}><span>📤</span>Envoyer les groupes</button>`, c.ng > 0) +
    step('3', 'Relais à deux · tablettes élèves', `Cible, indice technique, Zt chronométrée et critères. <b>${nRel}</b> relais reçus.`,
      `<button class="tile-btn" data-go="recv-r"><span>📥</span>Récupérer les relais</button>
       <button class="tile-btn orange" data-go="bilan"><span>📊</span>Bilan chiffré</button>`, nRel > 0) +
    `<div class="step local"><div class="step-n">⏱</div><div class="step-body"><h3>Chronométrer sur cette tablette</h3>
      <div class="step-btns"><button class="tile-btn" data-go="sprint"><span>①</span>50 m</button><button class="tile-btn" data-go="tiles"><span>②</span>Relais</button></div></div></div>`;
}

/* =====================================================================
   ÉLÈVE : accueil
   ===================================================================== */
function renderEleve() {
  const c = cls();
  $('#el-head').innerHTML = `<div class="card class-card"><div class="row between wrap">
    <div><span class="meta">Séance</span><h2 style="margin:0">${c ? esc(c.name) : 'Aucune séance reçue'}</h2>
      ${c ? `<span class="meta">${S.settings.total} m · Zt ${S.settings.zt} m · récupération ${mmss(recMs())}${c.recvAt ? ' · reçue le ' + new Date(c.recvAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>` : ''}</div>
    <label class="inline">Tablette <input id="el-tab" type="text" value="${esc(S.settings.tablet || '')}" placeholder="ex : Tablette 3" style="width:150px"></label></div></div>`;
  $('#el-tab').onchange = e => { S.settings.tablet = e.target.value.trim(); S.classes.forEach(k => [...k.passages, ...k.sprints].forEach(p => { if (p.local) p.tablet = S.settings.tablet; })); save(); };
  if (!c) {
    $('#el-body').innerHTML = `<div class="home-grid one"><button class="home-btn prof" data-go="recv-s"><span class="ico">📷</span>Recevoir la séance<small>scannez le QR affiché par l'enseignant</small></button></div>`;
    return;
  }
  const mine = [...c.sprints, ...c.passages].filter(x => x.local);
  const unsent = mine.filter(x => !c.sentAt || x.ts > c.sentAt).length;
  const groups = c.ng ? Array.from({ length: c.ng }, (_, i) => i + 1) : [];
  $('#el-body').innerHTML = `
    <div class="home-grid">
      <button class="home-btn" data-go="recv-s"><span class="ico">📷</span>Recevoir la séance<small>${c.ng ? 'groupes reçus' : 'liste et paramètres reçus'} · rescanner si besoin</small></button>
      <button class="home-btn p1" data-go="sprint"><span class="ico">①</span>50 m départ arrêté<small>${c.sprints.filter(s => s.local).length} chrono(s) sur cette tablette</small></button>
      <button class="home-btn p2" data-go="tiles" ${c.ng && c.myGroup != null ? '' : 'disabled'}><span class="ico">②</span>Relais à deux<small>${c.ng ? (c.myGroup != null ? `Groupe ${c.myGroup}` : 'choisissez votre groupe ci-dessous') : 'en attente des groupes du prof'}</small></button>
      <button class="home-btn send ${unsent ? 'todo' : ''}" data-go="send-r"><span class="ico">📤</span>Envoyer mes résultats<small>${unsent ? unsent + ' nouveau(x) résultat(s) à envoyer' : 'tout a été envoyé'}</small></button>
    </div>
    ${groups.length ? `<h2>Choisir mon groupe pour le relais</h2><div class="grp-pick">${groups.map(g => {
      const mem = c.students.filter(s => c.grp[s.id] === g).sort(byFirst);
      return `<button class="grp-btn ${c.myGroup === g ? 'on' : ''}" data-mygrp="${g}"><b>Groupe ${g}</b><span>${mem.map(s => esc(dnStudent(c, s))).join(' · ') || '—'}</span></button>`;
    }).join('')}</div>` : ''}`;
  $$('[data-mygrp]').forEach(b => b.onclick = () => {
    c.myGroup = +b.dataset.mygrp; sel = { d: null, r: null }; save(); toast(`Groupe ${c.myGroup} : ${c.students.filter(s => c.grp[s.id] === c.myGroup).length} élèves`); show('tiles');
  });
}

/* =====================================================================
   PAQUETS QR · S (prof → tablettes) et R (tablette → prof)
   ===================================================================== */
function buildS(c) {
  return { a: APP, t: 'S', v: 4, ts: Date.now(), cid: c.id, cn: c.name, pin: S.pin,
    set: { total: S.settings.total, zt: S.settings.zt, rec: S.settings.rec },
    crit: crits(c).map(x => [x.k, x.l]), ng: c.ng || 0,
    st: c.students.map(s => [s.nom, s.prenom, s.sexe || '', best50(c, s.id), c.ng ? (c.grp[s.id] || 0) : 0]) };
}
function applyS(p) {
  if (!p || p.a !== APP || p.t !== 'S') throw new Error('Ce QR n\'est pas une séance Zones Relais');
  let c = S.classes.find(x => x.id === p.cid);
  if (!c) { c = { id: p.cid, name: p.cn, students: [], passages: [], sprints: [], group: [], overrides: {}, crit: [], grp: {}, ng: 0, b50ext: {}, myGroup: null }; S.classes.push(c); }
  c.name = p.cn;
  p.st.forEach(([nom, prenom, sexe]) => {
    const id = keyOf(nom, prenom), ex = stu(c, id);
    if (ex) { ex.sexe = sexe || ex.sexe; ex.nom = nom; ex.prenom = prenom; } else c.students.push({ id, nom, prenom, sexe });
  });
  c.b50ext = {}; c.grp = {};
  p.st.forEach(([nom, prenom, , b, g]) => { const id = keyOf(nom, prenom); if (b != null) c.b50ext[id] = b; if (g) c.grp[id] = g; });
  const changed = c.ng !== p.ng;
  c.ng = p.ng || 0;
  if (changed || (c.myGroup != null && c.myGroup > c.ng)) c.myGroup = null;
  c.crit = p.crit.map(([k, l]) => ({ k, l }));
  c.recvAt = Date.now();
  Object.assign(S.settings, p.set); S.pin = p.pin || S.pin;
  S.cur = c.id; save();
  return c;
}
function buildR(c) {
  const mineS = c.sprints.filter(s => s.local), mineP = c.passages.filter(p => p.local);
  const u = [...new Set([...mineS.map(s => s.sid), ...mineP.flatMap(p => [p.d, p.r])])];
  const ix = id => u.indexOf(id), ck = crits(c).map(x => x.k);
  return { a: APP, t: 'R', v: 4, ts: Date.now(), cid: c.id, cn: c.name, tab: tabletName(), u, ck,
    s: mineS.map(s => [s.id, ix(s.sid), s.t, s.ts, s.endAt || null]),
    p: mineP.map(p => [p.id, p.ts, p.endAt || null, ix(p.d), ix(p.r), p.tIn, p.tZt, p.tEnd, p.cible ?? null,
      p.fail ? FAILS.findIndex(f => f.k === p.fail) + 1 : 0, ck.map(k => p.c[k] === true ? '1' : p.c[k] === false ? '0' : '-').join(''),
      p.cfg.total, p.cfg.zt]) };
}
function mergeR(R) {
  if (!R || R.a !== APP || R.t !== 'R') throw new Error('Ce QR n\'est pas un envoi de résultats Zones Relais');
  let c = S.classes.find(x => x.id === R.cid);
  if (!c) { c = cls(); if (!c || !confirm(`Résultats de la classe « ${R.cn} » (tablette ${R.tab}). Les ajouter à « ${c ? c.name : '?'} » ?`)) throw new Error('Classe non trouvée'); }
  const sid = i => {
    const id = R.u[i]; if (id && !stu(c, id)) { const [n, p] = id.split('|'); c.students.push({ id, nom: (n || '').toUpperCase(), prenom: cap(p || ''), sexe: '' }); }
    return id;
  };
  const ks = new Set(c.sprints.map(s => s.id)), kp = new Set(c.passages.map(p => p.id));
  let ns = 0, np = 0, dup = 0;
  R.s.forEach(([id, i, t, ts, endAt]) => {
    if (ks.has(id)) { dup++; return; }
    const s = sid(i); c.sprints.push({ id, sid: s, snap: snap(c, s), t, ts, endAt, tablet: R.tab, local: false }); ns++;
  });
  R.p.forEach(([id, ts, endAt, di, ri, tIn, tZt, tEnd, cible, fc, cs, total, zt]) => {
    if (kp.has(id)) { dup++; return; }
    const d = sid(di), r = sid(ri), cm = {};
    (R.ck || []).forEach((k, j) => { if (cs[j] === '1') cm[k] = true; else if (cs[j] === '0') cm[k] = false; });
    c.passages.push(finalize({ id, ts, endAt, tablet: R.tab, local: false, d, r, dSnap: snap(c, d), rSnap: snap(c, r),
      tIn, tZt, tEnd, cible, fail: fc ? FAILS[fc - 1].k : null, c: cm, cfg: { total, zt } }));
    np++;
  });
  save();
  return { c, ns, np, dup };
}
/* ancien format fichier (v3) */
function mergeLegacy(d) {
  const c = cls(); let n = 0;
  (d.students || []).forEach(s => { if (!stu(c, s.id)) c.students.push({ id: s.id, nom: s.nom, prenom: s.prenom, sexe: s.sexe || '' }); });
  const kp = new Set(c.passages.map(p => p.id)), ks = new Set(c.sprints.map(s => s.id));
  d.passages.forEach(p => { if (!kp.has(p.id)) { c.passages.push({ ...p, local: false }); n++; } });
  (d.sprints || []).forEach(s => { if (!ks.has(s.id)) { c.sprints.push({ ...s, local: false }); n++; } });
  save(); return n;
}

/* ---------------- écran d'envoi ---------------- */
let sendKind = 'S', sendObj = null;
async function renderSend() {
  const c = cls(); if (!c) { show(home()); return; }
  sendObj = sendKind === 'S' ? buildS(c) : buildR(c);
  $('#send-qr').innerHTML = '';
  if (sendKind === 'S') {
    $('#tb-main').textContent = c.ng ? '📤 Envoyer les groupes' : '📤 Envoyer la séance';
    $('#send-info').innerHTML = `<b>${c.ng ? `Étape 2 · ${c.ng} groupes` : 'Étape 1 · 50 m'}</b> — ${esc(c.name)} · ${c.students.length} élèves · ${S.settings.total} m, Zt ${S.settings.zt} m · ${crits(c).length} critères.
      <div class="hint">Sur chaque tablette élève : <b>📷 Recevoir la séance</b>, puis laisser défiler les QR devant la caméra. La série tourne en boucle.</div>`;
  } else {
    const n = sendObj.s.length + sendObj.p.length;
    $('#tb-main').textContent = '📤 Envoyer mes résultats';
    $('#send-info').innerHTML = `<b>${esc(tabletName())}</b> — ${sendObj.s.length} chrono(s) 50 m · ${sendObj.p.length} relais.
      <div class="hint">L'enseignant scanne avec <b>📥 Récupérer</b>. Tous les résultats de la tablette sont renvoyés à chaque fois : les doublons sont ignorés.</div>`;
    if (!n) { $('#send-qr').innerHTML = '<div class="empty">Aucun résultat sur cette tablette pour l\'instant.</div>'; return; }
  }
  const payload = await encodePacket(sendObj);
  if (view !== 'send') return;
  showQRSeries(chunkQR(payload, sendKind, sendKind === 'S' ? QR_CHUNK : QR_CHUNK_R), $('#send-qr'), '');
  if (sendKind === 'R') { c.sentAt = Date.now(); save(); }
}
$('#send-file').onclick = () => {
  if (!sendObj) return;
  const c = cls(), name = sendKind === 'S' ? `ZonesRelais_seance_${safeName(c.name)}.json` : `ZonesRelais_${safeName(c.name)}_${safeName(tabletName())}_${dayOf(Date.now())}.json`;
  deliver(new Blob([JSON.stringify(sendObj)], { type: 'application/json' }), name);
};

/* ---------------- écran de réception ---------------- */
let recvKind = 'R', recvLog = [];
function renderRecv() {
  recvLog = [];
  $('#tb-main').textContent = recvKind === 'S' ? '📷 Recevoir la séance' : '📥 Récupérer les résultats';
  $('#recv-info').innerHTML = recvKind === 'S'
    ? `<b>Visez le QR affiché par l'enseignant.</b> <span class="hint">Laissez défiler la série devant la caméra jusqu'à 100 %.</span>`
    : `<b>Visez le QR « Envoyer mes résultats » de chaque tablette élève.</b> <span class="hint">La caméra reste allumée : enchaînez les tablettes.</span>`;
  $('#recv-log').innerHTML = '';
  startScan($('#recv-scan'), recvKind, async p => handlePacket(p));
}
function handlePacket(p) {
  if (recvKind === 'S') {
    const c = applyS(p);
    toast(`Séance reçue : ${c.name} · ${c.students.length} élèves${c.ng ? ` · ${c.ng} groupes` : ''}`, 3500);
    setTimeout(() => show('eleve'), 300);
    return 'stop';
  }
  const r = mergeR(p);
  recvLog.unshift(`✓ ${esc(p.tab)} : ${r.ns} chrono(s) 50 m, ${r.np} relais ajoutés${r.dup ? ` · ${r.dup} déjà reçus` : ''}`);
  $('#recv-log').innerHTML = `<div class="card log">${recvLog.map(l => `<div>${l}</div>`).join('')}</div>`;
  toast(`${p.tab} : ${r.ns + r.np} résultat(s) ajouté(s)`);
  return 'continue';
}
$('#recv-file').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    try {
      const d = JSON.parse(await f.text());
      if (d.type === 'relaisz-passages' && isProf()) { toast(`${mergeLegacy(d)} performance(s) ajoutée(s)`); continue; }
      if ((recvKind === 'S' && d.t !== 'S') || (recvKind === 'R' && d.t !== 'R')) { toast(`${f.name} : ce fichier n'est pas attendu ici`); continue; }
      handlePacket(d);
    } catch (err) { toast(`${f.name} : ${err.message || 'lecture impossible'}`); }
  }
});

/* =====================================================================
   PROF : classes / import
   ===================================================================== */
let pending = null;
$('#imp-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const rows = /\.(csv|txt)$/i.test(f.name) ? await readCSV(f) : await readXLSX(f);
    const list = parseRows(rows);
    if (!list.length) { toast('Aucun élève trouvé (Nom en A, Prénom en B)'); return; }
    pending = list;
    if (!$('#imp-name').value.trim()) $('#imp-name').value = f.name.replace(/\.[^.]+$/, '');
    const tmp = { students: list }, nNoSex = list.filter(s => !s.sexe).length;
    const existing = S.classes.find(c => norm(c.name) === norm($('#imp-name').value));
    $('#imp-preview').innerHTML = `
      <p><b>${list.length} élèves détectés</b>${nNoSex ? ` · <span class="flag">${nNoSex} sans sexe (à compléter dans Groupes)</span>` : ''}</p>
      <div class="preview-list">${list.map(s => `<div>${sexBadge(s.sexe)} <b>${esc(dnStudent(tmp, s))}</b> <span class="meta">(${esc(s.nom)} ${esc(s.prenom)})</span></div>`).join('')}</div>
      <div class="row gap wrap">
        <button class="btn primary" id="imp-ok">Créer la classe</button>
        ${existing ? `<button class="btn ghost" id="imp-add">Compléter « ${esc(existing.name)} »</button>` : ''}
        <button class="btn ghost" id="imp-no">Annuler</button>
      </div>`;
    $('#imp-ok').onclick = () => {
      const name = $('#imp-name').value.trim() || 'Classe';
      const c = { id: uid(), name, students: pending, passages: [], sprints: [], group: [], overrides: {}, crit: DEFAULT_CRIT.map(x => ({ ...x })), grp: {}, ng: 0, b50ext: {}, myGroup: null, created: Date.now() };
      S.classes.push(c); S.cur = c.id; save(); resetImport();
      toast(`Classe « ${name} » créée`); show('menu');
    };
    if ($('#imp-add')) $('#imp-add').onclick = () => {
      let n = 0; pending.forEach(s => { const ex = stu(existing, s.id); if (!ex) { existing.students.push(s); n++; } else if (!ex.sexe && s.sexe) ex.sexe = s.sexe; });
      S.cur = existing.id; save(); resetImport(); toast(`${n} élève(s) ajouté(s)`); show('menu');
    };
    $('#imp-no').onclick = resetImport;
  } catch (err) { console.error(err); toast('Lecture du fichier impossible'); }
});
function resetImport() { pending = null; $('#imp-preview').innerHTML = ''; $('#imp-name').value = ''; }
function readXLSX(f) {
  return f.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  });
}
async function readCSV(f) {
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
  txt = txt.replace(/^﻿/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const first = lines[0] || '';
  const sepc = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map(l => splitCSVLine(l, sepc));
}
function splitCSVLine(line, sepc) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sepc) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function parseRows(rows) {
  const out = [];
  rows.forEach((r, idx) => {
    const nom = String(r[0] ?? '').trim().replace(/\s+/g, ' ');
    const prenom = String(r[1] ?? '').trim().replace(/\s+/g, ' ');
    if (!nom) return;
    if (idx === 0 && /^(nom|noms|élève|eleve|élèves|eleves|name|identit)/i.test(nom)) return;
    out.push({ id: keyOf(nom, prenom), nom, prenom, sexe: parseSex(r[2]) });
  });
  return dedupe(out).sort(byFirst);
}
function renderClasses() {
  const el = $('#class-list');
  if (!S.classes.length) { el.innerHTML = '<div class="empty">Aucune classe pour l\'instant.</div>'; return; }
  el.innerHTML = S.classes.map(c => `
    <div class="list-item ${c.id === S.cur ? 'current' : ''}">
      <div class="grow"><b>${esc(c.name)}</b><div class="meta">${c.students.length} élèves · ${c.sprints.length} chronos 50 m · ${c.passages.length} relais${c.ng ? ` · ${c.ng} groupes` : ''}</div></div>
      <button class="btn ${c.id === S.cur ? 'primary' : 'ghost'} small" data-open="${c.id}">${c.id === S.cur ? 'Ouverte' : 'Ouvrir'}</button>
      <button class="btn ghost small" data-ren="${c.id}">Renommer</button>
      <button class="btn danger-ghost small" data-del="${c.id}">Suppr.</button>
    </div>`).join('');
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { S.cur = b.dataset.open; save(); show('menu'); });
  el.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.ren); const n = prompt('Nouveau nom :', c.name);
    if (n && n.trim()) { c.name = n.trim(); save(); show('classes'); }
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.del);
    if (!confirm(`Supprimer la classe « ${c.name} » et toutes ses performances ?`)) return;
    S.classes = S.classes.filter(x => x.id !== c.id); if (S.cur === c.id) S.cur = S.classes[0]?.id || null;
    save(); show('classes');
  });
}

/* =====================================================================
   PROF : paramètres + critères observables
   ===================================================================== */
let critDraft = [];
function renderParams() {
  const c = cls();
  $('#set-total').value = S.settings.total; $('#set-zt').value = S.settings.zt;
  $('#set-pin').value = S.pin; $('#set-tablet').value = S.settings.tablet || '';
  const opts = [120, 150, 180, 210, 240, 270, 300];
  $('#set-rec').innerHTML = opts.map(s => `<option value="${s}" ${s === S.settings.rec ? 'selected' : ''}>${mmss(s * 1000)}${s === 210 ? ' (recommandé)' : ''}</option>`).join('');
  $('#crit-class').textContent = '· ' + c.name;
  critDraft = crits(c).map(x => ({ ...x }));
  paintCrit();
  renderBareme();
}
function paintCrit() {
  $('#crit-edit').innerHTML = critDraft.map((cr, i) => `<div class="crit-ed">
    <span class="ph">${i + 1}</span><input type="text" value="${esc(cr.l)}" data-ci="${i}" maxlength="90" placeholder="Nouveau critère observable">
    <button class="btn ghost small" data-cup="${i}" ${i ? '' : 'disabled'}>↑</button>
    <button class="btn danger-ghost small" data-cdel="${i}">✕</button></div>`).join('') || '<div class="empty">Aucun critère.</div>';
  $$('#crit-edit [data-ci]').forEach(inp => inp.oninput = () => { critDraft[+inp.dataset.ci].l = inp.value; });
  $$('#crit-edit [data-cdel]').forEach(b => b.onclick = () => { critDraft.splice(+b.dataset.cdel, 1); paintCrit(); });
  $$('#crit-edit [data-cup]').forEach(b => b.onclick = () => { const i = +b.dataset.cup; [critDraft[i - 1], critDraft[i]] = [critDraft[i], critDraft[i - 1]]; paintCrit(); });
}
$('#crit-add').onclick = () => { critDraft.push({ k: 'c' + uid().slice(-6), l: '' }); paintCrit(); const ins = $$('#crit-edit input'); ins[ins.length - 1].focus(); };
$('#crit-reset').onclick = () => { critDraft = DEFAULT_CRIT.map(x => ({ ...x })); paintCrit(); };
$('#crit-save').onclick = () => {
  const list = critDraft.map(x => ({ k: x.k, l: x.l.trim() })).filter(x => x.l);
  if (!list.length) { toast('Gardez au moins un critère'); return; }
  cls().crit = list; save(); toast('Critères enregistrés · renvoyez la séance aux tablettes'); renderParams();
};
$('#set-save').onclick = () => {
  const total = parseFloat($('#set-total').value), zt = parseFloat($('#set-zt').value), rec = parseInt($('#set-rec').value, 10);
  const pin = $('#set-pin').value.trim(), tablet = $('#set-tablet').value.trim();
  if (!(total > 0 && zt > 0 && zt < total)) { toast('Valeurs invalides (Zt < distance du relais)'); return; }
  if (!/^\d{4}$/.test(pin)) { toast('Le code enseignant doit avoir 4 chiffres'); return; }
  const oldName = S.settings.tablet;
  Object.assign(S.settings, { total, zt, rec, tablet }); S.pin = pin;
  if (oldName !== tablet) S.classes.forEach(c => [...c.passages, ...c.sprints].forEach(p => { if (p.local) p.tablet = tablet; }));
  save(); toast(total !== BASE ? `Enregistré · relais de ${total} m extrapolé sur 100 m` : 'Paramètres enregistrés');
};
function renderBareme() {
  const rowCls = i => 'r' + (Math.floor(i / 4) + 1);
  const tb = tbl => `<div class="btable"><table>
    <tr><th>Filles</th>${tbl.F.map((t, i) => `<td class="${rowCls(i)}">${fnum(t)}"</td>`).join('')}</tr>
    <tr><th>Garçons</th>${tbl.G.map((t, i) => `<td class="${rowCls(i)}">${fnum(t)}"</td>`).join('')}</tr>
    <tr><th>Points</th>${PTS16.map((p, i) => `<td class="lv ${rowCls(i)}">${fpt(p)}</td>`).join('')}</tr></table></div>`;
  $('#bareme-box').innerHTML = `
    <h3>Vitesse individuelle /3 · meilleur 50 m départ arrêté</h3>${tb(B_IND)}
    <h3>Vitesse collective /3 · meilleur relais (100 m)</h3>${tb(B_COL)}
    <h3>Indice technique (par course)</h3>
    <p class="hint" style="margin-top:0">Cible = 50 m du démarreur + (50 m du relayeur − 0,3 s). IT = temps du relais − cible.</p>
    <ul class="bareme"><li>IT ≤ 0" : <b>4 ★</b></li><li>IT de 0,1" à 0,5" : <b>3 ★</b></li><li>IT de 0,6" à 1" : <b>2 ★</b></li><li>IT ≥ 1,1" (ou course ratée) : <b>1 ★</b></li></ul>
    <h3 style="margin-top:14px">Efficacité technique /6 · total d'étoiles sur 4 courses</h3>
    <div class="btable"><table>
      <tr>${DEGREES.map(d => `<th colspan="${d.lv.length}" class="r${d.n}">Degré ${d.n} : ${d.n === 1 ? '1' : d.min} à ${d.max} ★</th>`).join('')}</tr>
      <tr>${DEGREES.map(d => d.lv.map(v => `<td class="lv r${d.n}">${fpt(v)}</td>`).join('')).join('')}</tr></table></div>
    <p class="hint">Niveau dans le degré proposé selon le % de critères qualitatifs réussis ; 6 seulement avec 16 ★ obtenues sur 4 courses. Avec 2 ou 3 courses, total d'étoiles extrapolé sur 4.</p>`;
}
$('#bk-export').onclick = () => {
  deliver(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `ZonesRelais_sauvegarde_${safeName(tabletName())}_${dayOf(Date.now())}.json`);
};
$('#bk-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.classes) || !(d.v >= 2)) throw 0;
    if (!confirm('Remplacer toutes les données de cette tablette par cette sauvegarde ?')) return;
    const mode = S.mode; migrate(d); Object.keys(S).forEach(k => delete S[k]); Object.assign(S, d); S.mode = mode;
    save(); toast('Sauvegarde restaurée'); show('menu');
  } catch (err) { toast('Fichier de sauvegarde invalide'); }
});

/* =====================================================================
   PROF : groupes
   ===================================================================== */
let gDraft = {}, gN = 4, gMode = 'homo', gPick = null;
function level(c, id) { // niveau = points de vitesse individuelle (compare filles et garçons), sinon temps
  const s = stu(c, id), b = best50(c, id);
  if (b == null) return null;
  const p = ptsFrom(B_IND, s.sexe, b);
  return p != null ? p * 1000 - b / 1000 : -b / 100;
}
function renderGroupes() {
  const c = cls();
  gDraft = { ...c.grp }; gN = c.ng || gN; gPick = null;
  $('#gr-n').innerHTML = [2, 3, 4, 5, 6, 7, 8].map(n => `<button data-n="${n}" class="${n === gN ? 'on' : ''}">${n}</button>`).join('');
  $$('#gr-n button').forEach(b => b.onclick = () => { gN = +b.dataset.n; $$('#gr-n button').forEach(x => x.classList.toggle('on', x === b)); Object.keys(gDraft).forEach(k => { if (gDraft[k] > gN) gDraft[k] = 0; }); paintBoard(); });
  $$('#gr-mode button').forEach(b => { b.classList.toggle('on', b.dataset.m === gMode); b.onclick = () => { gMode = b.dataset.m; $$('#gr-mode button').forEach(x => x.classList.toggle('on', x === b)); hintMode(); }; });
  hintMode(); paintBoard();
}
function hintMode() {
  $('#gr-hint').textContent = {
    homo: 'Homogènes : élèves de vitesse proche ensemble (niveau = points de vitesse individuelle, qui compare filles et garçons). Groupe 1 = les plus rapides.',
    hetero: 'Hétérogènes : chaque groupe reçoit des élèves rapides et moins rapides (répartition en serpentin).',
    alea: 'Aléatoires : tirage au sort.'
  }[gMode];
  $('#gr-mix').disabled = gMode === 'homo';
}
function propose() {
  const c = cls(), mix = $('#gr-mix').checked && gMode !== 'homo';
  const lv = id => level(c, id);
  let list = [...c.students];
  if (gMode === 'alea') list.sort(() => Math.random() - 0.5); else list.sort((a, b) => (lv(b.id) ?? -1e9) - (lv(a.id) ?? -1e9));
  if (mix) { const F = list.filter(s => s.sexe === 'F'), G = list.filter(s => s.sexe === 'G'), X = list.filter(s => !s.sexe); list = [...F, ...G, ...X]; }
  gDraft = {};
  if (gMode === 'homo') {
    const N = list.length, base = Math.floor(N / gN), extra = N % gN; let i = 0;
    for (let g = 1; g <= gN; g++) { const size = base + (g <= extra ? 1 : 0); for (let k = 0; k < size; k++) gDraft[list[i++].id] = g; }
  } else {
    list.forEach((s, i) => { const r = Math.floor(i / gN), k = i % gN; gDraft[s.id] = gMode === 'hetero' && r % 2 ? gN - k : k + 1; });
  }
  paintBoard();
}
function paintBoard() {
  const c = cls();
  const chip = s => {
    const b = best50(c, s.id);
    return `<button class="g-chip ${gPick === s.id ? 'pick' : ''}" data-chip="${esc(s.id)}"><span class="sex ${s.sexe || 'none'}" data-sexid="${esc(s.id)}" title="Toucher pour changer F / G">${s.sexe || '?'}</span> <b>${esc(dnStudent(c, s))}</b><span>${b != null ? fmt(b) + ' s' : '–'}</span></button>`;
  };
  $('#gr-board').innerHTML = Array.from({ length: gN + 1 }, (_, g) => g).map(g => {
    const mem = c.students.filter(s => (gDraft[s.id] || 0) === g).sort((a, b) => (level(c, b.id) ?? -1e9) - (level(c, a.id) ?? -1e9));
    if (g === 0 && !mem.length) return '';
    const nf = mem.filter(s => s.sexe === 'F').length, ngc = mem.filter(s => s.sexe === 'G').length;
    const times = mem.map(s => best50(c, s.id)).filter(x => x != null);
    return `<div class="g-col ${g === 0 ? 'none' : ''}">
      <button class="g-head" data-gcol="${g}">${g ? `Groupe ${g}` : 'Sans groupe'} <span>${mem.length} · ${nf} F / ${ngc} G${times.length ? ` · moy. ${fmt(times.reduce((a, b) => a + b, 0) / times.length)} s` : ''}</span>${gPick ? '<em>⬇ déplacer ici</em>' : ''}</button>
      <div class="g-list">${mem.map(chip).join('') || '<span class="meta">—</span>'}</div></div>`;
  }).join('');
  $$('#gr-board [data-chip]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const sx = e.target.closest('[data-sexid]');
    if (sx) { const st = stu(c, sx.dataset.sexid); st.sexe = st.sexe === 'F' ? 'G' : st.sexe === 'G' ? '' : 'F'; save(); paintBoard(); return; }
    const id = b.dataset.chip; gPick = gPick === id ? null : id; paintBoard();
  });
  $$('#gr-board [data-gcol]').forEach(b => b.onclick = () => { if (!gPick) return; gDraft[gPick] = +b.dataset.gcol; gPick = null; paintBoard(); });
}
$('#gr-propose').onclick = () => {
  const c = cls(), n50 = c.students.filter(s => best50(c, s.id) != null).length;
  if (gMode !== 'alea' && n50 < c.students.length && !confirm(`${c.students.length - n50} élève(s) sans temps sur 50 m : ils seront placés en fin de liste. Continuer ?`)) return;
  propose();
};
$('#gr-clear').onclick = () => { gDraft = {}; gPick = null; paintBoard(); };
function saveGroups() {
  const c = cls(), used = new Set(Object.values(gDraft).filter(Boolean));
  if (!used.size) { toast('Aucun groupe à valider'); return false; }
  c.grp = {}; Object.entries(gDraft).forEach(([k, g]) => { if (g) c.grp[k] = g; });
  c.ng = gN; save(); toast(`${gN} groupes validés`); return true;
}
$('#gr-save').onclick = () => { if (saveGroups()) show('menu'); };
$('#gr-send').onclick = () => { if (saveGroups()) { sendKind = 'S'; show('send'); } };

/* =====================================================================
   ÉLÈVES DE LA TABLETTE (50 m)
   ===================================================================== */
let gSel = new Set();
function renderGroup() { gSel = new Set(cls().group); paintGroup(); }
function paintGroup() {
  const c = cls();
  $('#g-list').innerHTML = [...c.students].sort(byFirst).map(s => `
    <div class="tile check ${gSel.has(s.id) ? 'on' : ''}" data-id="${esc(s.id)}">
      <span class="box">${gSel.has(s.id) ? '✓' : ''}</span><span class="nom">${esc(dnStudent(c, s))}</span>
      ${isProf() ? `<button class="sex ${s.sexe || 'none'}" data-sex="${esc(s.id)}">${s.sexe || 'F/G ?'}</button>` : sexBadge(s.sexe)}
    </div>`).join('');
  $$('#g-list .tile').forEach(t => t.onclick = e => {
    if (e.target.closest('[data-sex]')) return;
    gSel.has(t.dataset.id) ? gSel.delete(t.dataset.id) : gSel.add(t.dataset.id); paintGroup();
  });
  $$('#g-list [data-sex]').forEach(b => b.onclick = () => {
    const s = stu(c, b.dataset.sex); s.sexe = s.sexe === 'F' ? 'G' : s.sexe === 'G' ? '' : 'F'; save(); paintGroup();
  });
  $('#g-ok').textContent = `Valider (${gSel.size} élève${gSel.size > 1 ? 's' : ''})`;
}
$('#g-all').onclick = () => { gSel = new Set(cls().students.map(s => s.id)); paintGroup(); };
$('#g-none').onclick = () => { gSel = new Set(); paintGroup(); };
$('#g-ok').onclick = () => {
  if (gSel.size < 1) { toast('Cochez au moins 1 élève'); return; }
  cls().group = [...gSel]; save(); spSel = []; show('sprint');
};
$('#sp-group').onclick = () => show('group');
$('#rel-group').onclick = () => show('eleve');
function sprintStudents(c) {
  const g = new Set(c.group);
  return c.students.filter(s => !g.size || g.has(s.id)).sort(byFirst);
}
function relayStudents(c) {
  if (c.ng && c.myGroup != null && !isProf()) return c.students.filter(s => c.grp[s.id] === c.myGroup).sort(byFirst);
  return [...c.students].sort(byFirst);
}

/* =====================================================================
   ÉTAPE 1 : 50 m départ arrêté
   ===================================================================== */
let spSel = [], sp = null;
function renderSprintTiles() {
  const c = cls(), list = sprintStudents(c);
  $('#sp-info').innerHTML = c.group.length ? `· ${esc(tabletName())} · ${list.length} élève${list.length > 1 ? 's' : ''}` : (isProf() ? '· toute la classe' : '· <span class="flag">choisissez les élèves de la tablette</span>');
  if (!c.group.length && !isProf()) {
    $('#sp-tiles').innerHTML = `<div class="empty"><button class="btn primary big" id="sp-first">Choisir les élèves qui passent sur cette tablette</button></div>`;
    $('#sp-first').onclick = () => show('group');
  } else $('#sp-tiles').innerHTML = list.length ? list.map(s => {
    const b = best50(c, s.id), n = c.sprints.filter(x => x.sid === s.id).length, lane = spSel.indexOf(s.id);
    return `<button class="tile ${lane >= 0 ? 'sel-c' + (lane + 1) : ''}" data-id="${esc(s.id)}">
      ${lane >= 0 ? `<span class="role c${lane + 1} badge">${lane + 1}</span>` : ''}
      <span class="top"><span class="nom">${esc(dnStudent(c, s))}</span>${sexBadge(s.sexe)}</span>
      <span class="perf">${b != null ? `50 m : <b>${fmt(b)} s</b>` : 'pas encore de temps'}</span>
      <span class="foot"><span class="count">${n ? n + ' essai' + (n > 1 ? 's' : '') : ''}</span><span class="rec" data-sid="${esc(s.id)}"></span></span>
    </button>`;
  }).join('') : '<div class="empty">Aucun élève.</div>';
  $$('#sp-tiles .tile').forEach(t => t.onclick = () => spPick(t.dataset.id));
  [0, 1].forEach(i => {
    const slot = $('#sp-slot-' + i), id = spSel[i];
    slot.classList.toggle('filled', !!id);
    slot.querySelector('.who').textContent = id ? dn(c, id) : 'Couloir ' + (i + 1);
  });
  $('#sp-solo').classList.toggle('hidden', spSel.length !== 1);
  updateRec();
}
function spPick(id) {
  const i = spSel.indexOf(id);
  if (i >= 0) spSel.splice(i, 1); else if (spSel.length < 2) spSel.push(id); else spSel[1] = id;
  renderSprintTiles();
  if (spSel.length === 2) setTimeout(() => { if (spSel.length === 2) launchSprint(); }, 250);
}
function launchSprint() {
  if (!recCheck(spSel)) { spSel = []; renderSprintTiles(); return; }
  sp = { runners: spSel.map(id => ({ sid: id, t: null, endAt: null, keep: true })), t0: null };
  spSel = []; show('sprun'); requestWake();
}
$('#sp-solo').onclick = () => { if (spSel.length === 1) launchSprint(); };
$('#sp-clear').onclick = () => { spSel = []; renderSprintTiles(); };
function renderSprun() {
  if (!sp) { show('sprint'); return; }
  const c = cls();
  $('#sp-go').disabled = sp.t0 !== null;
  $('#sp-go').textContent = sp.t0 === null ? 'DÉPART' : sp.runners.every(r => r.t != null) ? 'COURSE TERMINÉE' : 'EN COURSE…';
  $('#sp-arr').innerHTML = sp.runners.map((r, i) => {
    const prev = best50(c, r.sid);
    return `<div>
      <button class="arr c${i + 1} ${r.t != null ? (r.keep ? 'stopped' : 'dropped') : ''}" data-i="${i}" ${sp.t0 === null || r.t != null ? 'disabled' : ''}>
        <span class="lane">Couloir ${i + 1} · ARRIVÉE</span><span class="who">${esc(dn(c, r.sid))}</span>
        <span class="t">${r.t != null ? fmt(r.t) + ' s' : '&nbsp;'}</span>
        <span class="lane">${r.t != null && prev != null && r.t < prev ? '🏅 nouveau record' : prev != null ? 'record : ' + fmt(prev) + ' s' : ''}</span>
      </button>
      ${r.t != null ? `<div class="arr-keep"><button class="btn ${r.keep ? 'ghost' : 'primary'} small" data-keep="${i}">${r.keep ? '✗ Ne pas garder ce temps' : '↺ Garder ce temps'}</button></div>` : ''}
    </div>`;
  }).join('');
  $$('#sp-arr .arr').forEach(b => b.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!sp) return; const r = sp.runners[+b.dataset.i];
    if (sp.t0 === null || r.t != null) return;
    r.t = performance.now() - sp.t0; r.endAt = Date.now();
    if (navigator.vibrate) navigator.vibrate(30);
    if (sp.runners.every(x => x.t != null)) { cancelAnimationFrame(raf); $('#sp-clock').textContent = fmt(Math.max(...sp.runners.map(x => x.t))); }
    renderSprun();
  }));
  $$('#sp-arr [data-keep]').forEach(b => b.onclick = () => { const r = sp.runners[+b.dataset.keep]; r.keep = !r.keep; renderSprun(); });
  $('#sp-save').disabled = !sp.runners.some(r => r.t != null && r.keep);
  if (sp.t0 === null) $('#sp-clock').textContent = '0,00';
}
function spTick() {
  if (!sp || sp.t0 === null || sp.runners.every(r => r.t != null)) return;
  $('#sp-clock').textContent = fmt(performance.now() - sp.t0);
  raf = requestAnimationFrame(spTick);
}
$('#sp-go').addEventListener('pointerdown', e => {
  e.preventDefault(); if (!sp || sp.t0 !== null) return;
  sp.t0 = performance.now(); if (navigator.vibrate) navigator.vibrate(40);
  renderSprun(); spTick(); updateRec();
});
$('#sp-reset').onclick = () => { if (!sp) return; cancelAnimationFrame(raf); sp.t0 = null; sp.runners.forEach(r => { r.t = null; r.endAt = null; r.keep = true; }); renderSprun(); };
$('#sp-back').onclick = () => {
  if (sp && sp.t0 !== null && sp.runners.some(r => r.t != null) && !confirm('Revenir sans enregistrer les temps ?')) return;
  sp = null; stopClock(); show('sprint');
};
$('#sp-save').onclick = () => {
  const c = cls(); const msgs = [];
  if (sp.runners.some(r => r.t == null) && !confirm('Un coureur n\'a pas de temps d\'arrivée : il ne sera pas enregistré. Continuer ?')) return;
  sp.runners.forEach(r => {
    if (r.t == null || !r.keep) return;
    const prev = best50(c, r.sid);
    c.sprints.push({ id: uid(), ts: Date.now(), tablet: S.settings.tablet, local: true, sid: r.sid, snap: snap(c, r.sid), t: Math.round(r.t), endAt: r.endAt });
    msgs.push(`${dn(c, r.sid)} ${fmt(r.t)} s${prev == null || r.t < prev ? ' 🏅' : ''}`);
  });
  save(); sp = null; stopClock(); toast(msgs.join(' · ') || 'Aucun temps gardé'); show('sprint');
};

/* =====================================================================
   ÉTAPE 2 : RELAIS
   ===================================================================== */
let sel = { d: null, r: null };
function renderTiles() {
  const c = cls(), el = $('#tiles'), list = relayStudents(c);
  $('#group-info').innerHTML = c.ng && c.myGroup != null && !isProf() ? `· Groupe ${c.myGroup} · ${list.length} élèves` : `· ${list.length} élèves`;
  $('#rel-group').classList.toggle('hidden', isProf() || !c.ng);
  el.innerHTML = list.length ? list.map(s => {
    const n = c.passages.filter(p => p.d === s.id || p.r === s.id).length, b = best50(c, s.id);
    const role = sel.d === s.id ? 'd' : sel.r === s.id ? 'r' : '';
    return `<button class="tile ${role ? 'sel-' + role : ''}" data-id="${esc(s.id)}">
      ${role ? `<span class="role ${role} badge">${role.toUpperCase()}</span>` : ''}
      <span class="top"><span class="nom">${esc(dnStudent(c, s))}</span>${sexBadge(s.sexe)}</span>
      <span class="perf">${b != null ? `50 m : <b>${fmt(b)} s</b>` : '<span class="flag">pas de 50 m</span>'}</span>
      <span class="foot"><span class="count">${n}/4 course${n > 1 ? 's' : ''}</span><span class="rec" data-sid="${esc(s.id)}"></span></span>
    </button>`;
  }).join('') : '<div class="empty">Aucun élève.</div>';
  el.querySelectorAll('.tile').forEach(t => t.onclick = () => pick(t.dataset.id));
  updateSelBar(); updateRec();
}
function pick(id) {
  if (sel.d === id) { sel.d = sel.r; sel.r = null; }
  else if (sel.r === id) sel.r = null;
  else if (!sel.d) sel.d = id;
  else sel.r = id;
  renderTiles();
  if (sel.d && sel.r) setTimeout(() => { if (sel.d && sel.r) launchRelay(); }, 250);
}
function launchRelay() {
  const c = cls(), ids = [sel.d, sel.r];
  const no50 = ids.filter(id => best50(c, id) == null);
  if (no50.length && !confirm(`${no50.map(id => dn(c, id)).join(' et ')} n'a/ont pas de temps sur 50 m : la cible et l'indice technique ne pourront pas être calculés.\nLancer quand même ?`)) { sel.r = null; renderTiles(); return; }
  if (!recCheck(ids)) { sel.r = null; renderTiles(); return; }
  startRun(sel.d, sel.r);
}
function updateSelBar() {
  const c = cls();
  [['d', 'Touchez le démarreur'], ['r', 'puis le relayeur']].forEach(([k, ph]) => {
    const slot = $('#slot-' + k);
    slot.classList.toggle('filled', !!sel[k]);
    slot.querySelector('.who').textContent = sel[k] ? dn(c, sel[k]) : ph;
  });
}
$('#sel-clear').onclick = () => { sel = { d: null, r: null }; renderTiles(); };

let run = null, raf = null, wake = null;
function startRun(d, r) { run = { d, r, t0: null, marks: [] }; sel = { d: null, r: null }; show('chrono'); requestWake(); }
function paintPair() {
  const c = cls();
  $('#c-d').textContent = dn(c, run.d); $('#c-r').textContent = dn(c, run.r);
  const cb = cible100(c, run.d, run.r), D = S.settings.total;
  $('#c-target').innerHTML = cb != null
    ? `🎯 Cible ${D} m : <b>${fmt(cb * D / BASE)} s</b> <span class="meta">(${fmt(best50(c, run.d))} + ${fmt(best50(c, run.r))} − 0,3${D !== BASE ? ` sur 100 m, ramené à ${D} m` : ''})</span>`
    : `<span class="flag">Pas de cible : temps 50 m manquant</span>`;
}
$('#c-swap').onclick = () => { [run.d, run.r] = [run.r, run.d]; paintPair(); };
function step() { return run.t0 === null ? 0 : run.marks.length + 1; }
function renderChrono() {
  if (!run) { show('tiles'); return; }
  paintPair();
  const st = step();
  $$('.cbtn').forEach(b => { const k = +b.dataset.step; b.classList.toggle('next', k === st); b.classList.toggle('done', k < st); b.disabled = k !== st; });
  $('#c-fail').disabled = run.t0 === null;
  const m = run.marks;
  $('#s1').textContent = m[0] != null ? fmt(m[0]) : '–';
  $('#s2').textContent = m[1] != null ? fmt(m[1] - m[0]) : '–';
  $('#s3').textContent = m[2] != null ? fmt(m[2]) : '–';
  if (run.t0 === null) $('#clock').textContent = '0,00';
  else if (m[2] != null) $('#clock').textContent = fmt(m[2]);
}
function tick() {
  if (!run || run.t0 === null || run.marks.length >= 3) return;
  $('#clock').textContent = fmt(performance.now() - run.t0);
  raf = requestAnimationFrame(tick);
}
function stopClock() { cancelAnimationFrame(raf); raf = null; releaseWake(); }
$$('.cbtn').forEach(b => b.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!run || +b.dataset.step !== step()) return;
  const now = performance.now();
  if (run.t0 === null) { run.t0 = now; tick(); } else run.marks.push(now - run.t0);
  if (navigator.vibrate) navigator.vibrate(30);
  renderChrono(); updateRec();
  if (run.marks.length === 3) { run.endAt = Date.now(); cancelAnimationFrame(raf); setTimeout(() => toEval(false), 350); }
}));
$('#c-fail').onclick = () => { if (run && run.t0 !== null) { run.endAt = Date.now(); cancelAnimationFrame(raf); toEval(true); } };
$('#c-undo').onclick = () => {
  if (!run) return;
  if (run.marks.length) run.marks.pop(); else if (run.t0 !== null) run.t0 = null;
  cancelAnimationFrame(raf); renderChrono(); if (run.t0 !== null) tick();
};
$('#c-reset').onclick = () => { if (!run) return; run.t0 = null; run.marks = []; cancelAnimationFrame(raf); renderChrono(); };
$('#c-cancel').onclick = () => {
  if (run && run.t0 !== null && !confirm('Revenir aux élèves sans enregistrer ? (si le passage a échoué, utilisez « Passage raté »)')) return;
  run = null; stopClock(); show('tiles');
};
async function requestWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

function toEval(failed) {
  stopClock();
  const c = cls(); const [tIn, tOut, tEnd] = run.marks;
  const { total, zt } = S.settings;
  const sp2 = computeSpeed(tIn, tOut, tEnd, total, zt);
  if (!failed && !sp2) { toast('Temps incohérents : recommencez le chrono'); $('#c-reset').onclick(); return; }
  S.pending = finalize({
    id: uid(), ts: Date.now(), endAt: run.endAt || Date.now(), tablet: S.settings.tablet, local: true,
    d: run.d, r: run.r, dSnap: snap(c, run.d), rSnap: snap(c, run.r),
    tIn: tIn != null ? Math.round(tIn) : null, tZt: sp2 ? Math.round(sp2.tZt) : null, tEnd: !failed && tEnd != null ? Math.round(tEnd) : null,
    cible: cible100(c, run.d, run.r), fail: failed ? '' : null, c: {}, cfg: { total, zt }
  });
  save(); run = null; show('eval');
}
function renderEval() {
  const p = S.pending, c = cls(); if (!p || !c) return;
  const D = p.cfg.total;
  $('#e-d').textContent = dn(c, p.d, p.dSnap); $('#e-r').textContent = dn(c, p.r, p.rSnap);
  $('#e-perf').innerHTML = p.fail !== null
    ? `<div><span>Course</span><b style="color:var(--ko)">Ratée</b></div><div><span>Indice technique</span>${starsHTML(1)}</div><div class="note">Une course ratée compte 1 étoile.</div>`
    : `<div><span>Temps ${D} m</span><b>${fmt(p.tEnd)} s</b></div>
       <div><span>Cible ${D} m</span><b>${p.tgt != null ? fmt(p.tgt) + ' s' : '–'}</b></div>
       <div><span>IT${D !== BASE ? ' (ramené à 100 m)' : ''}</span><b>${fit(p.it)}</b></div>
       <div>${p.stars != null ? starsHTML(p.stars) : '<span class="flag">pas de cible</span>'}</div>
       ${D !== BASE ? `<div class="note">Course de ${D} m : temps ramené à 100 m (× ${fnum(BASE / D, 2)}) pour l'indice technique.</div>` : ''}`;
  $('#e-times').innerHTML = `
    <div><span>Entrée Zt</span><b>${p.tIn != null ? fmt(p.tIn) + ' s' : '–'}</b></div>
    <div><span>Temps Zt (${p.cfg.zt} m)</span><b>${p.tZt != null ? fmt(p.tZt) + ' s' : '–'}</b></div>
    <div><span>Hors Zt (${D - p.cfg.zt} m)</span><b>${p.tZt != null && p.tEnd != null ? fmt(p.tEnd - p.tZt) + ' s' : '–'}</b></div>`;
  $('#e-gap').innerHTML = p.gap != null ? `
    <h3>Écart de vitesse dans la Zt</h3>
    <div class="speed">
      <div><span>Vitesse dans la Zt</span><b>${fnum(p.vZt, 2)} m/s</b><span>${fnum(p.vZt * 3.6)} km/h</span></div>
      <div><span>Vitesse hors Zt</span><b>${fnum(p.vR, 2)} m/s</b><span>${fnum(p.vR * 3.6)} km/h</span></div>
    </div>
    <div class="verdict ${gapCls(p.gap)}">Écart : ${fgap(p.gap)} ${p.gap > 0 ? '(plus rapide dans la zone)' : '(plus lent dans la zone)'}</div>`
    : `<h3>Écart de vitesse dans la Zt</h3><p class="hint">Non calculable (chronométrage incomplet).</p>`;
  $('#e-fail').classList.toggle('hidden', p.fail === null);
  $('#fail-btns').innerHTML = FAILS.map(f => `<button class="btn no ${p.fail === f.k ? 'chosen' : ''}" data-fail="${f.k}">${f.label}</button>`).join('');
  $$('#fail-btns .btn').forEach(b => b.onclick = () => { p.fail = b.dataset.fail; save(); renderEval(); });
  $('#e-crits').innerHTML = crits(c).map((cr, i) => `
    <div class="card crit ${p.c[cr.k] === undefined ? 'todo' : ''}">
      <h3>${i + 1}. ${esc(cr.l)}</h3>
      <div class="yn">
        <button class="btn yes ${p.c[cr.k] === true ? 'chosen' : ''}" data-k="${cr.k}" data-v="1">Oui</button>
        <button class="btn no ${p.c[cr.k] === false ? 'chosen' : ''}" data-k="${cr.k}" data-v="0">Non</button>
      </div>
    </div>`).join('');
  $$('#e-crits .yn .btn').forEach(b => b.onclick = () => { p.c[b.dataset.k] = b.dataset.v === '1'; save(); renderEval(); });
  const miss = missing(p);
  $('#e-save').disabled = miss.length > 0;
  $('#e-status').innerHTML = miss.length
    ? `<span class="warn">🔒 Encore ${miss.length} élément${miss.length > 1 ? 's' : ''} à renseigner avant le binôme suivant</span>`
    : `<span class="okmsg">✓ Tout est renseigné</span>`;
}
function missing(p) {
  const m = crits(cls()).filter(cr => p.c[cr.k] === undefined).map(cr => cr.k);
  if (p.fail === '') m.unshift('fail');
  return m;
}
function flashMissing() {
  if (view !== 'eval') return;
  $$('#e-crits .crit.todo, #e-fail').forEach(el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
  const first = $('#e-crits .crit.todo'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const gapCls = g => GAP_BINS.find(b => b.test(g)).cls;
$('#e-save').onclick = () => {
  const p = S.pending; if (!p) return;
  if (missing(p).length) { toast('Renseignez tous les critères'); flashMissing(); return; }
  cls().passages.push(p); S.pending = null; save();
  toast(p.fail ? 'Passage raté enregistré (1 ★)' : `Passage enregistré${p.stars ? ' · ' + '★'.repeat(p.stars) : ''}`);
  show('tiles');
};
$('#e-redo').onclick = () => {
  const p = S.pending; if (!p) return;
  if (!confirm('Erreur de chronométrage ? Ce passage sera effacé et le chrono relancé pour le même binôme.')) return;
  S.pending = null; save(); startRun(p.d, p.r);
};

/* =====================================================================
   PROF : BILAN CHIFFRÉ
   ===================================================================== */
function filtered(c) {
  const d = $('#b-date').value || 'all', t = $('#b-tab').value || 'all';
  const ok = x => (d === 'all' || dayOf(x.ts) === d) && (t === 'all' || (x.tablet || '') === t);
  return { rel: c.passages.filter(ok), spr: c.sprints.filter(ok) };
}
function fillFilters(c) {
  const all = [...c.passages, ...c.sprints];
  const days = [...new Set(all.map(p => dayOf(p.ts)))].sort().reverse();
  const tabs = [...new Set(all.map(p => p.tablet || ''))].sort();
  const keepD = $('#b-date').value, keepT = $('#b-tab').value;
  $('#b-date').innerHTML = `<option value="all">Toutes les séances</option>` + days.map(d => `<option value="${d}">${dayLabel(d)}</option>`).join('');
  $('#b-tab').innerHTML = `<option value="all">Toutes (${tabs.length})</option>` + tabs.map(t => `<option value="${esc(t)}">${esc(t || 'Sans nom')}</option>`).join('');
  if ([...$('#b-date').options].some(o => o.value === keepD)) $('#b-date').value = keepD;
  if ([...$('#b-tab').options].some(o => o.value === keepT)) $('#b-tab').value = keepT;
}
$('#b-date').onchange = $('#b-tab').onchange = () => renderBilan(true);
function critStats(c, list) {
  return crits(c).map(cr => ({ ...cr, label: cr.l, yes: list.filter(p => p.c && p.c[cr.k] === true).length, n: list.filter(p => p.c && p.c[cr.k] !== undefined).length }));
}
function stats(c, list) {
  const fails = list.filter(p => p.fail), gaps = list.map(p => p.gap).filter(g => g != null);
  const bins = GAP_BINS.map(b => ({ ...b, n: 0 })); gaps.forEach(g => bins.find(b => b.test(g)).n++);
  return { N: list.length, nFail: fails.length, failBy: FAILS.map(f => ({ ...f, n: fails.filter(p => p.fail === f.k).length })),
    gaps, mean: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null, crit: critStats(c, list), bins };
}
function result(c, sid, F) {
  const s = stu(c, sid) || {}; const sexe = s.sexe || '';
  const b50 = best50(c, sid, F.spr), ind = ptsFrom(B_IND, sexe, b50);
  const mine = F.rel.filter(p => p.d === sid || p.r === sid);
  const ok = mine.filter(p => !p.fail && p.tEnd != null);
  const bestRel = ok.length ? Math.min(...ok.map(teqOf)) : null;
  const bestRelReal = ok.length ? ok.reduce((a, p) => teqOf(p) < teqOf(a) ? p : a).tEnd : null;
  const col = ptsFrom(B_COL, sexe, bestRel);
  const starsList = mine.map(p => passStars(c, p)).filter(x => x != null).sort((a, b) => b - a);
  const used = starsList.slice(0, 4), n = used.length, sum = used.reduce((a, b) => a + b, 0);
  const stars = n ? Math.min(16, Math.round(sum * 4 / n)) : null;
  const cs = critStats(c, mine), y = cs.reduce((a, x) => a + x.yes, 0), o = cs.reduce((a, x) => a + x.n, 0);
  const rate = o ? y / o : null;
  const et = stars != null ? etNote(stars, rate, c.overrides[sid], n >= 4 && sum === 16) : null;
  const parts = [ind, col, et ? et.note : null];
  const total = parts.some(x => x != null) ? parts.reduce((a, x) => a + (x || 0), 0) : null;
  const its = mine.map(p => passIT(c, p)).filter(x => x != null);
  return { sid, s, sexe, b50, ind, mine, bestRel, bestRelReal, col, used, n, sum, stars, rate, et, total,
    complete: parts.every(x => x != null) && n >= 2, nFail: mine.filter(p => p.fail).length,
    itMean: its.length ? its.reduce((a, b) => a + b, 0) / its.length : null };
}
function renderBilan(keepFilters) {
  const c = cls(); $('#b-class').textContent = '· ' + c.name;
  if (keepFilters !== true) fillFilters(c);
  const F = filtered(c), list = F.rel, st = stats(c, list);
  const ids = [...new Set([...c.students.map(s => s.id), ...list.flatMap(p => [p.d, p.r]), ...F.spr.map(s => s.sid)])].filter(id => stu(c, id));
  const R = ids.map(id => result(c, id, F)).sort((a, b) => byFirst(a.s, b.s));
  const comp = R.filter(r => r.complete);
  const avg = (arr, f) => { const v = arr.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const allIT = list.map(p => passIT(c, p)).filter(x => x != null);
  $('#b-kpi').innerHTML = `
    <div><span>Moyenne de la classe</span><b>${fnum(avg(comp, r => r.total), 2)}<small style="display:inline">/12</small></b><small>${comp.length} élève(s) complet(s) / ${R.length}</small></div>
    <div><span>Vitesse indiv. · coll.</span><b>${fnum(avg(R, r => r.ind), 2)} · ${fnum(avg(R, r => r.col), 2)}</b><small>moyennes /3</small></div>
    <div><span>Étoiles moyennes</span><b>${fnum(avg(R, r => r.stars), 1)} ★</b><small>IT moyen ${allIT.length ? fit(allIT.reduce((a, b) => a + b, 0) / allIT.length) : '–'}</small></div>
    <div><span>Relais courus</span><b>${st.N}</b><small>${st.nFail} raté(s) · ${F.spr.length} chronos 50 m</small></div>`;
  $('#b-notes').innerHTML = `
    <tr><th style="text-align:left">Élève</th><th>Sexe</th><th>Groupe</th><th>50 m</th><th>Vit. indiv.<br><small>/3</small></th>
      <th>Meilleur relais<br><small>(équiv. 100 m)</small></th><th>Vit. coll.<br><small>/3</small></th>
      <th>Courses</th><th>Étoiles<br><small>/16</small></th><th>Degré</th><th>Eff. tech.<br><small>/6</small></th><th class="tot">Total<br><small>/12</small></th></tr>
    ${R.map(r => `<tr class="${r.total == null ? 'none' : ''}">
      <td class="name">${esc(dnStudent(c, r.s))}</td><td>${sexBadge(r.sexe)}</td><td>${c.grp[r.sid] || '–'}</td>
      <td>${r.b50 != null ? fmt(r.b50) + ' s' : '–'}</td>
      <td class="pts">${r.ind != null ? fpt(r.ind) : (r.b50 != null && !r.sexe ? '<span class="flag">sexe ?</span>' : '–')}</td>
      <td>${r.bestRelReal != null ? fmt(r.bestRelReal) + ' s' + (Math.round(r.bestRel) !== r.bestRelReal ? `<span class="sub">${fmt(r.bestRel)} s</span>` : '') : '–'}</td>
      <td class="pts">${r.col != null ? fpt(r.col) : (r.bestRel != null && !r.sexe ? '<span class="flag">sexe ?</span>' : '–')}</td>
      <td>${r.mine.length}${r.nFail ? `<span class="sub">dont ${r.nFail} ratée(s)</span>` : ''}</td>
      <td>${r.stars != null ? `<span class="st">${r.stars} ★</span><span class="sub">${r.used.join('+')}${r.n < 4 ? ` → ×4/${r.n}` : ''}</span>${r.n === 1 ? '<span class="flag">1 seule course</span>' : r.n < 4 ? '<span class="flag">extrapolé</span>' : ''}` : '–'}</td>
      <td>${r.et ? r.et.deg.n : '–'}</td>
      <td>${r.et ? `<select data-ov="${esc(r.sid)}" class="${r.et.manual ? 'manual' : ''}">${r.et.allowed.map(v => `<option value="${v}" ${v === r.et.note ? 'selected' : ''}>${fpt(v)}${v === r.et.auto ? ' (auto)' : ''}</option>`).join('')}</select><span class="sub">critères ${r.rate != null ? pct(r.rate, 1) + ' %' : '–'}</span>` : '–'}</td>
      <td class="tot">${r.total != null ? fpt(Math.round(r.total * 100) / 100) : '–'}${r.total != null && !r.complete ? '<span class="flag">incomplet</span>' : ''}</td>
    </tr>`).join('')}`;
  $$('#b-notes [data-ov]').forEach(s => s.onchange = () => {
    const r = R.find(x => x.sid === s.dataset.ov), v = parseFloat(s.value);
    if (v === r.et.auto) delete c.overrides[r.sid]; else c.overrides[r.sid] = v;
    save(); renderBilan(true);
  });
  $('#b-crit').innerHTML = st.N ? st.crit.map(cr => {
    const p = pct(cr.yes, cr.n);
    return `<div class="bar-row"><div class="bar-label">${esc(cr.label)}</div>
      <div class="bar"><div class="fill ${p >= 70 ? 'hi' : p >= 40 ? 'mid' : 'lo'}" style="width:${p}%"></div></div>
      <div class="bar-val"><b>${p} %</b><small>${cr.yes}/${cr.n}</small></div></div>`;
  }).join('') : '<div class="empty">Aucun relais pour ce filtre.</div>';
  const maxBin = Math.max(1, ...st.bins.map(b => b.n));
  $('#b-gap').innerHTML = st.gaps.length ? st.bins.map(b => `
    <div class="bar-row"><div class="bar-label">${b.label}</div>
      <div class="bar"><div class="fill ${b.cls}" style="width:${b.n / maxBin * 100}%"></div></div>
      <div class="bar-val"><b>${b.n}</b><small>${pct(b.n, st.gaps.length)} %</small></div></div>`).join('') +
    `<p class="hint">Écart moyen : <b>${fgap(st.mean)}</b>. Écart = (V Zt − V hors Zt) ÷ V hors Zt.</p>`
    : '<div class="empty">Aucun passage chronométré complet.</div>';
  $('#b-table').innerHTML = `
    <tr><th style="text-align:left">Élève</th><th>Relais<br><small>D / R</small></th><th>Écart Zt<br>moyen</th><th>IT moyen</th>
      ${crits(c).map(cr => `<th class="crit-h">${esc(cr.l)}</th>`).join('')}</tr>
    ${R.map(r => { const s2 = stats(c, r.mine); return `<tr class="${r.mine.length ? '' : 'none'}">
      <td class="name">${esc(dnStudent(c, r.s))}</td>
      <td>${r.mine.length ? `${r.mine.length} <small style="display:inline">(${r.mine.filter(p => p.d === r.sid).length} / ${r.mine.filter(p => p.r === r.sid).length})</small>` : '–'}</td>
      <td>${s2.mean != null ? fgap(s2.mean) : '–'}</td><td>${fit(r.itMean)}</td>
      ${s2.crit.map(cr => `<td>${cr.n ? `<span class="chip ${pct(cr.yes, cr.n) >= 70 ? 'hi' : pct(cr.yes, cr.n) >= 40 ? 'mid' : 'lo'}">${cr.yes}/${cr.n}</span>` : '–'}</td>`).join('')}
    </tr>`; }).join('')}`;
  const h = [...list].sort((a, b) => b.ts - a.ts);
  $('#h-count').textContent = `(${h.length})`;
  $('#b-hist').innerHTML = h.length ? h.map(p => {
    const stars = passStars(c, p), it = passIT(c, p);
    return `<div class="list-item ${p.fail ? 'failed' : ''}">
      <div class="grow">
        ${p.fail ? `<span class="tag ko">Raté · ${esc((FAILS.find(f => f.k === p.fail) || {}).label || '')}</span>` : ''}
        ${stars != null ? `<span class="tag st">${'★'.repeat(stars)}</span>` : ''}
        ${p.gap != null ? `<span class="tag ${gapCls(p.gap)}">Zt ${fgap(p.gap)}</span>` : ''}
        <span class="role d">D</span> ${esc(dn(c, p.d, p.dSnap))} → <span class="role r">R</span> ${esc(dn(c, p.r, p.rSnap))}
        <div class="meta">${new Date(p.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(p.tablet || 'tablette sans nom')} · ${distOf(p)} m en ${fmt(p.tEnd)} s${p.tgt != null ? ` · cible ${fmt(p.tgt)} s` : ''} · IT ${fit(it)}</div>
        <div class="crit-marks">${crits(c).map(cr => p.c[cr.k] === undefined ? '' : `<span class="${p.c[cr.k] ? 'y' : 'n'}">${p.c[cr.k] ? '✓' : '✗'} ${esc(cr.l)}</span>`).join('')}</div>
      </div>
      <button class="btn danger-ghost small" data-delp="${p.id}">Suppr.</button>
    </div>`;
  }).join('') : '<div class="empty">Aucun relais.</div>';
  $$('#b-hist [data-delp]').forEach(b => b.onclick = () => {
    if (!confirm('Supprimer définitivement ce passage ?')) return;
    c.passages = c.passages.filter(p => p.id !== b.dataset.delp); save(); renderBilan(true);
  });
  const h50 = [...F.spr].sort((a, b) => b.ts - a.ts);
  $('#h50-count').textContent = `(${h50.length})`;
  $('#b-hist50').innerHTML = h50.length ? h50.map(s => `
    <div class="list-item"><div class="grow"><b>${fmt(s.t)} s</b> · ${esc(dn(c, s.sid, s.snap))}
      <div class="meta">${new Date(s.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(s.tablet || 'tablette sans nom')}</div></div>
      <button class="btn danger-ghost small" data-dels="${s.id}">Suppr.</button></div>`).join('') : '<div class="empty">Aucun chrono 50 m.</div>';
  $$('#b-hist50 [data-dels]').forEach(b => b.onclick = () => {
    if (!confirm('Supprimer ce temps sur 50 m ?')) return;
    c.sprints = c.sprints.filter(s => s.id !== b.dataset.dels); save(); renderBilan(true);
  });
  return R;
}
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const yn = v => v === true ? 'Oui' : v === false ? 'Non' : '';
const sec = ms => ms == null ? '' : +(ms / 1000).toFixed(2);
$('#exp-xlsx').onclick = () => {
  const c = cls(); const R = renderBilan(true); const F = filtered(c); const st = stats(c, F.rel);
  const nm = (id, sn) => { const s = stu(c, id) || sn || {}; return [s.nom || '', s.prenom || '']; };
  const notes = [['Nom', 'Prénom', 'Sexe', 'Groupe', 'Meilleur 50 m (s)', 'Vitesse individuelle /3', 'Meilleur relais (s)', 'Relais équiv. 100 m (s)', 'Vitesse collective /3',
    'Courses', 'Ratées', 'Étoiles retenues', 'Total étoiles /16', 'Extrapolé', 'Degré', '% critères', 'Efficacité technique /6', 'Ajusté', 'TOTAL /12', 'Complet']]
    .concat([...R].sort((a, b) => (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr')).map(r => [
      r.s.nom, r.s.prenom, r.sexe, c.grp[r.sid] || '', sec(r.b50), r.ind ?? '', sec(r.bestRelReal), sec(r.bestRel), r.col ?? '',
      r.mine.length, r.nFail, r.used.join('+'), r.stars ?? '', r.n && r.n < 4 ? `oui (${r.n} courses)` : '', r.et ? r.et.deg.n : '',
      r.rate != null ? pct(r.rate, 1) : '', r.et ? r.et.note : '', r.et && r.et.manual ? 'oui' : '',
      r.total != null ? Math.round(r.total * 100) / 100 : '', r.complete ? 'oui' : 'non']));
  const rel = [['Date', 'Tablette', 'Démarreur – Nom', 'Démarreur – Prénom', 'Relayeur – Nom', 'Relayeur – Prénom', 'Distance (m)', 'Statut', 'Cause',
    'Temps (s)', 'Cible (s)', 'IT équiv. 100 m (s)', 'Étoiles', 'Entrée Zt (s)', 'Temps Zt (s)', 'V Zt (m/s)', 'V hors Zt (m/s)', 'Écart Zt (%)', ...crits(c).map(cr => cr.l)]]
    .concat([...F.rel].sort((a, b) => a.ts - b.ts).map(p => [
      new Date(p.ts).toLocaleString('fr-FR'), p.tablet || '', ...nm(p.d, p.dSnap), ...nm(p.r, p.rSnap), distOf(p),
      p.fail ? 'Raté' : 'Réussi', p.fail ? (FAILS.find(f => f.k === p.fail) || {}).label : '',
      sec(p.tEnd), sec(p.tgt), passIT(c, p) ?? '', passStars(c, p) ?? '', sec(p.tIn), sec(p.tZt), p.vZt ?? '', p.vR ?? '', p.gap ?? '',
      ...crits(c).map(cr => yn(p.c[cr.k]))]));
  const s50 = [['Date', 'Tablette', 'Nom', 'Prénom', 'Temps 50 m (s)']]
    .concat([...F.spr].sort((a, b) => a.ts - b.ts).map(s => [new Date(s.ts).toLocaleString('fr-FR'), s.tablet || '', ...nm(s.sid, s.snap), sec(s.t)]));
  const bil = [['Bilan de classe', c.name], ['Relais', st.N], ['Ratés', st.nFail], ...st.failBy.map(f => ['  ' + f.label, f.n]),
    ['Écart moyen vitesse Zt (%)', st.mean != null ? +st.mean.toFixed(1) : ''], [],
    ['Critère', 'Oui', 'Observés', '% Oui'], ...st.crit.map(cr => [cr.label, cr.yes, cr.n, pct(cr.yes, cr.n)]), [],
    ['Écart vitesse Zt', 'Passages', '%'], ...st.bins.map(b => [b.label, b.n, pct(b.n, st.gaps.length)])];
  const wb = XLSX.utils.book_new();
  const add = (aoa, name, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((_, i) => ({ wch: w(i) })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add(notes, 'Notes', i => i < 2 ? 18 : 13);
  add(bil, 'Bilan critères', i => i === 0 ? 48 : 12);
  add(rel, 'Relais', i => i < 6 ? 18 : i < 18 ? 12 : 26);
  add(s50, '50 m', i => i < 4 ? 18 : 14);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  deliver(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ZonesRelais_bilan_${safeName(c.name)}.xlsx`);
};

/* ---------------- démarrage ---------------- */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ['chrono', 'sprun'].includes(view)) requestWake(); });
window.addEventListener('beforeunload', e => { if (S.pending) { e.preventDefault(); e.returnValue = ''; } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
// installation existante (v3) : cette tablette servait de tablette enseignant
if (!S.mode && S.classes.length) { S.mode = 'prof'; save(); }
show(S.pending ? 'eval' : S.mode ? home() : 'role');
