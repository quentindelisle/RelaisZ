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
// Binôme mixte (une fille + un garçon) : barème moyen des barèmes filles et garçons
B_COL.M = B_COL.F.map((f, i) => Math.round((f + B_COL.G[i]) / 2 * 100) / 100);
const isMixed = (c, p) => { const a = (stu(c, p.d) || p.dSnap || {}).sexe, b = (stu(c, p.r) || p.rSnap || {}).sexe; return !!(a && b && a !== b); };
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
  const lo = Math.max(1, deg.min), pos = deg.max > lo ? (stars - lo) / (deg.max - lo) : 1;
  const idx = rate == null ? Math.max(0, Math.min(allowed.length - 1, Math.round(pos * (allowed.length - 1))))   // pas de critères (évaluation) : position dans le degré selon les étoiles
    : Math.min(allowed.length - 1, Math.floor(rate * allowed.length));
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
  if (!d.settings.vid) d.settings.vid = { rel: !!d.settings.video, tg: !!d.settings.video };
  if (!d.pin) d.pin = '0000';
  if (d.mode === undefined) d.mode = null;              // 'prof' | 'eleve' | null (premier lancement)
  d.classes.forEach(c => {
    c.sprints = c.sprints || []; c.passages = c.passages || []; c.group = c.group || []; c.overrides = c.overrides || {};
    c.crit = c.crit || DEFAULT_CRIT.map(x => ({ ...x }));
    c.grp = c.grp || {}; c.ng = c.ng || 0; c.b50ext = c.b50ext || {}; c.deleted = c.deleted || [];
    if (c.myGroup === undefined) c.myGroup = null;
    c.tg = c.tg || {}; c.tgN = c.tgN || 0;
    if (c.ng && !c.tgN) { c.tg = { ...c.grp }; c.tgN = c.ng; }   // v4.6 : un seul jeu de groupes
    c.myTg = Array.isArray(c.myTg) ? c.myTg : c.myTg != null ? [c.myTg] : [];   // une tablette peut suivre plusieurs groupes
    c.students.forEach(s => { if (s.sexe === undefined) s.sexe = ''; });
  });
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Sauvegarde impossible (stockage plein ?)'); }
}
function dedupe(list) { const seen = new Set(); return list.filter(s => !seen.has(s.id) && seen.add(s.id)); }
const cls = () => S.classes.find(c => c.id === S.cur) || null;
/* Appel du jour : les absents sont retirés des listes, groupes et binômes (l'appel repart à zéro chaque jour) */
const today = () => dayOf(Date.now());
const absIds = c => (c && c.absent && c.absent.day === today() ? c.absent.ids : []);
const isAbs = (c, id) => absIds(c).includes(id);
const present = c => c.students.filter(s => !isAbs(c, s.id));
const stu = (c, id) => c.students.find(s => s.id === id);
const isProf = () => S.mode === 'prof';
const tabletName = () => S.settings.tablet || (isProf() ? 'Tablette prof' : 'Tablette élève');
const crits = c => (c && c.crit && c.crit.length ? c.crit : DEFAULT_CRIT);
/* Types de critères : Oui / Non · échelle de 1 (moins bien) à 10 (parfait) · libre (cases définies par l'enseignant) */
const CTYPES = { yn: 'Oui / Non', scale: 'Échelle 1 à 10', free: 'Libre' };
const ctype = cr => cr.t || 'yn';
function critScore(cr, v) { // réussite ramenée entre 0 et 1 (null = ne compte pas)
  if (v === undefined || v === null) return null;
  const t = ctype(cr);
  if (t === 'yn') return v === true ? 1 : v === false ? 0 : null;
  if (t === 'scale') return (v - 1) / 9;
  if (t === 'free') return cr.ord && (cr.o || []).length > 1 ? v / (cr.o.length - 1) : null;
  return null;
}
function critText(cr, v) {
  if (v === undefined || v === null) return '';
  const t = ctype(cr);
  if (t === 'yn') return v ? 'Oui' : 'Non';
  if (t === 'scale') return v + '/10';
  return (cr.o || [])[v] ?? '?';
}
const scoreCls = x => x == null ? 'neutral' : x >= 0.7 ? 'hi' : x >= 0.4 ? 'mid' : 'lo';
function critSummary(cs) { // résumé d'un critère sur une liste de passages
  if (!cs.n) return { main: '–', sub: '' };
  if (cs.t === 'yn') return { main: pct(cs.yes, cs.n) + ' %', sub: `${cs.yes}/${cs.n} Oui` };
  if (cs.t === 'scale') return { main: fnum(cs.mean) + '/10', sub: `${cs.n} obs.` };
  const top = cs.dist.indexOf(Math.max(...cs.dist));
  return { main: (cs.o || [])[top] || '?', sub: `${cs.dist[top]}/${cs.n}` };
}

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
  if (c.man50 && c.man50[sid] != null) return c.man50[sid];      // temps saisi par le prof : prioritaire
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
  $$('.pair-card[data-d]').forEach(el => el.classList.toggle('resting', recLeft(c, el.dataset.d) > 0 || recLeft(c, el.dataset.r) > 0));
  if (view === 'chrono' && run && run.t0 === null) warnFor([run.d, run.r], $('#c-warn')); else $('#c-warn').classList.add('hidden');
  if (view === 'sprun' && sp && sp.t0 === null) warnFor(sp.runners.map(r => r.sid), $('#sp-warn')); else $('#sp-warn').classList.add('hidden');
}
setInterval(updateRec, 1000);

/* =====================================================================
   NAVIGATION · interface prof / élève
   ===================================================================== */
const PROF_ONLY = ['perf50', 'menu', 'classes', 'params', 'groupes', 'tgroupes', 'bilan', 'appel'];
const TITLES = {
  role: ['Zones Relais', 'Choix du rôle de la tablette'], menu: ['Espace enseignant', ''], eleve: ['Tablette élève', ''],
  classes: ['Classes', 'Import et choix de la classe'], params: ['Paramètres de la course', 'Distances, récupération, critères'],
  groupes: ['Groupes', 'Une tablette par groupe pour le relais'], send: ['Envoyer', ''], recv: ['Recevoir', ''],
  group: ['Élèves de la tablette', '50 m'], sprint: ['① 50 m départ arrêté', ''], sprun: ['① 50 m', 'Chronomètre'],
  appel: ['Appel', 'Présents et absents du jour'], perf50: ['Temps sur 50 m', 'Correction manuelle'], evl: ['Leçon d\'évaluation', 'Appel · 50 m · groupes · passages'],
  tgroupes: ['Groupes de travail', 'Glisser les élèves dans les groupes (3 ou 4)'], tg: ['③ Travail de groupe', ''],
  tiles: ['② Relais', ''], chrono: ['② Relais', 'Chronomètre'], eval: ['② Relais', 'Critères du passage'], bilan: ['Bilan chiffré', '']
};
let view = 'role';
const home = () => isProf() ? 'menu' : 'eleve';
function show(v) {
  if (!S.mode) v = 'role';
  else if (S.pending && v !== 'eval') v = 'eval';
  else if (!isProf() && PROF_ONLY.includes(v)) v = 'eleve';
  if (['tiles', 'bilan', 'group', 'sprint', 'groupes', 'params', 'tg', 'tgroupes', 'appel', 'perf50', 'evl'].includes(v) && !cls()) { toast(isProf() ? 'Importez ou choisissez une classe' : 'Recevez d\'abord la séance (QR du prof)'); v = isProf() ? 'classes' : 'eleve'; }
  if (view === 'recv' && v !== 'recv') stopScan();
  if (!['tiles', 'tg', 'chrono', 'eval'].includes(v)) vidOff();
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
     chrono: renderChrono, eval: renderEval, bilan: renderBilan, tg: renderTg, tgroupes: renderTgroupes, appel: renderAppel, perf50: renderPerf50, evl: renderEvl }[v] || (() => {}))();
  updateRec();
  window.scrollTo(0, 0);
}
let evlFlow = false;   // on vient de la leçon d'évaluation : retour direct après l'appel, les 50 m, les groupes
function renderTop() {
  const back = evlFlow && ['appel', 'perf50', 'tgroupes'].includes(view) ? `<button class="btn small tb-btn evl-back" data-go="evl">↩ Leçon d'évaluation</button>` : '';
  const homeBtn = back + (!['menu', 'eleve', 'role'].includes(view) ? `<button class="btn small tb-btn" data-nav="home">⌂ Accueil</button>` : '');
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
  if (nav) { if (leaveOk()) { evlFlow = false; show(home()); } }
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
  else if (g === 'tiles') { const c = cls(); if (c && !isProf() && c.tgN && !c.myTg.length) { show('eleve'); toast('Cochez d\'abord vos groupes'); } else show('tiles'); }
  else if (g === 'groupes') show('tgroupes');
  else if (g === 'evl') { const c = cls(); if (!isProf()) { if (!c || !c.tgN || !c.myTg.length) { show('eleve'); toast('Cochez d\'abord vos groupes'); return; } evlFlow = false; } else evlFlow = true; evSel = { g: null, d: null, r: null }; evRun = null; show('evl'); }
  else if (g === 'tg') { const c = cls(); if (c && !isProf() && !c.myTg.length) { show('eleve'); toast('Choisissez d\'abord votre groupe de travail'); } else show('tg'); }
  else if (g === 'bilan-tg') { $('#b-les').value = 'tg'; show('bilan'); setTimeout(() => { const e = $('#b-tg'); if (e) e.scrollIntoView({ behavior: 'smooth' }); }, 200); }
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
      <div class="row gap"><button class="btn ${absIds(c).length || c.absent?.day === today() ? 'ghost' : 'primary'} small" data-go="appel">📋 Appel${c.absent?.day === today() ? ` · ${present(c).length} présents${absIds(c).length ? `, ${absIds(c).length} absent${absIds(c).length > 1 ? 's' : ''}` : ''}` : ' du jour'}</button>
      <button class="btn ghost small" data-go="classes">Changer / importer</button></div></div>`
    : `<div class="row between wrap"><b>Aucune classe : commencez par importer la liste.</b><button class="btn primary" data-go="classes">Importer une classe</button></div>`;
  if (!c) { $('#menu-steps').innerHTML = ''; return; }
  const n50 = c.students.filter(s => best50(c, s.id) != null).length;
  const nRel = c.passages.length, tabs = new Set([...c.sprints, ...c.passages].filter(x => !x.local).map(x => x.tablet || '?')).size;
  const nGrp = c.tgN ? Object.keys(c.tg).length : 0;
  const step = (n, title, desc, btns, done) => `<div class="step ${done ? 'done' : ''}"><div class="step-n">${n}</div>
    <div class="step-body"><h3>${title}</h3><p class="meta">${desc}</p><div class="step-btns">${btns}</div></div></div>`;
  $('#menu-steps').innerHTML =
    step('0', 'Préparer la course', 'Distance, zone de transmission, récupération, critères observables, code enseignant.',
      `<button class="tile-btn" data-go="params"><span>⚙︎</span>Paramètres & critères</button>`, true) +
    step('1', '50 m départ arrêté · tablettes élèves', `Envoyez la séance aux tablettes, les élèves chronomètrent leurs 50 m, puis récupérez les QR. <b>${n50}/${c.students.length}</b> élèves chronométrés${tabs ? ` · ${tabs} tablette(s) reçue(s)` : ''}.`,
      `<button class="tile-btn blue" data-go="send-s"><span>📤</span>Envoyer la séance</button>
       <button class="tile-btn" data-go="recv-r"><span>📥</span>Récupérer les 50 m</button>
       <button class="tile-btn" data-go="perf50"><span>✏️</span>Voir / corriger les 50 m</button>`, n50 > 0) +
    step('2', 'Faire les groupes', c.tgN ? `<b>${c.tgN} groupes</b> validés (${nGrp} élèves). Les mêmes groupes servent au relais à deux et au travail de groupe. Envoyez-les : chaque tablette coche le ou les groupes qu'elle suit.` : 'Groupes par cliquer-glisser, ou proposés d\'après les 50 m (niveaux proches, mélangés ou aléatoires, mixité F/G). Ils servent au relais à deux et au travail de groupe.',
      `<button class="tile-btn" data-go="tgroupes"><span>👥</span>Faire les groupes</button>
       <button class="tile-btn blue" data-go="send-s" ${c.tgN ? '' : 'disabled'}><span>📤</span>Envoyer les groupes</button>`, c.tgN > 0) +
    step('3', 'Relais à deux · tablettes élèves', `Cible, indice technique, Zt chronométrée et critères. <b>${nRel}</b> relais reçus.`,
      `<button class="tile-btn" data-go="recv-r"><span>📥</span>Récupérer les relais</button>
       <button class="tile-btn orange" data-go="bilan"><span>📊</span>Bilan chiffré</button>`, nRel > 0) +
    step('4', 'Leçon Travail de groupe', `Mêmes groupes que l'étape 2. Les binômes du groupe sont proposés, les élèves choisissent ceux qu'ils courent ; caractéristiques de la transmission notées à chaque passage. <b>${c.passages.filter(p => p.les === 'tg').length}</b> passages reçus.`,
      `<button class="tile-btn" data-go="recv-r"><span>📥</span>Récupérer</button>
       <button class="tile-btn orange" data-go="bilan-tg"><span>📊</span>Bilan + PDF par groupe</button>`, c.passages.some(p => p.les === 'tg')) +
    step('5', 'Leçon d\'évaluation', `Appel, temps sur 50 m (mémorisés ou saisis), groupes, puis passages en ordre libre saisis sur cette tablette ou sur la fiche PDF. Ni critères ni vidéo. <b>${c.passages.filter(p => p.les === 'ev').length}</b> passages d'évaluation.`,
      `<button class="tile-btn orange" data-go="evl"><span>🏁</span>Ouvrir la leçon d'évaluation</button>`, c.passages.some(p => p.les === 'ev')) +
    `<div class="step local"><div class="step-n">⏱</div><div class="step-body"><h3>Chronométrer sur cette tablette</h3>
      <div class="step-btns"><button class="tile-btn" data-go="sprint"><span>①</span>50 m</button><button class="tile-btn" data-go="tiles"><span>②</span>Relais</button><button class="tile-btn" data-go="tg"><span>③</span>Travail de groupe</button></div></div></div>`;
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
  $('#el-body').innerHTML = `
    <div class="home-grid">
      <button class="home-btn" data-go="recv-s"><span class="ico">📷</span>Recevoir la séance<small>${c.tgN ? 'groupes reçus' : 'liste et paramètres reçus'} · rescanner si besoin</small></button>
      <button class="home-btn p1" data-go="sprint"><span class="ico">①</span>50 m départ arrêté<small>${c.sprints.filter(s => s.local).length} chrono(s) sur cette tablette</small></button>
      <button class="home-btn p2" data-go="tiles" ${c.tgN && c.myTg.length ? '' : 'disabled'}><span class="ico">②</span>Relais à deux<small>${c.tgN ? (c.myTg.length ? `Groupe${c.myTg.length > 1 ? 's' : ''} ${c.myTg.join(', ')}` : 'cochez vos groupes ci-dessous') : 'en attente des groupes du prof'}</small></button>
      <button class="home-btn p3" data-go="tg" ${c.tgN && c.myTg.length ? '' : 'disabled'}><span class="ico">③</span>Travail de groupe<small>${c.tgN ? (c.myTg.length ? `Groupe${c.myTg.length > 1 ? 's' : ''} ${c.myTg.join(', ')}` : 'cochez vos groupes ci-dessous') : 'en attente des groupes du prof'}</small></button>
      <button class="home-btn p4" data-go="evl" ${c.tgN && c.myTg.length ? '' : 'disabled'}><span class="ico">④</span>Évaluation<small>${c.tgN ? (c.myTg.length ? `passages chronométrés avec la zone · ${c.passages.filter(p => p.les === 'ev' && p.local).length} sur cette tablette` : 'cochez vos groupes ci-dessous') : 'en attente des groupes du prof'}</small></button>
      <button class="home-btn send ${unsent ? 'todo' : ''}" data-go="send-r"><span class="ico">📤</span>Envoyer mes résultats<small>${unsent ? unsent + ' nouveau(x) résultat(s) à envoyer' : 'tout a été envoyé'}</small></button>
    </div>
    ${c.tgN ? `<h2>Groupes suivis par cette tablette <small>touchez pour cocher / décocher (un ou plusieurs)</small></h2><div class="grp-pick">${Array.from({ length: c.tgN }, (_, i) => i + 1).map(g => {
      const mem = tgMembers(c, g);
      return `<button class="grp-btn tgb ${c.myTg.includes(g) ? 'on' : ''}" data-mytg="${g}"><b>${c.myTg.includes(g) ? '☑' : '☐'} ${gDot(c, g)}${gLbl(c, g)}</b><span>${mem.map(s => esc(dnStudent(c, s))).join(' · ') || '—'}</span></button>`;
    }).join('')}</div>${c.myTg.length ? `<div class="row gap center"><button class="btn primary big" data-go="tiles">② Relais à deux</button><button class="btn primary big" data-go="tg">③ Travail de groupe</button><button class="btn primary big" data-go="evl">④ Évaluation</button></div>` : ''}` : ''}`;
  $$('[data-mytg]').forEach(b => b.onclick = () => {
    const g = +b.dataset.mytg;
    c.myTg = c.myTg.includes(g) ? c.myTg.filter(x => x !== g) : [...c.myTg, g].sort((a, b) => a - b);
    save(); renderEleve();
  });
}

/* =====================================================================
   PAQUETS QR · S (prof → tablettes) et R (tablette → prof)
   ===================================================================== */
function buildS(c) {
  return { a: APP, t: 'S', v: 4, ts: Date.now(), cid: c.id, cn: c.name, pin: S.pin,
    set: { total: S.settings.total, zt: S.settings.zt, rec: S.settings.rec, vid: S.settings.vid, vdelay: S.settings.vdelay },
    txc: txAll(c),
    crit: crits(c).map(x => [x.k, x.l, ctype(x), x.o || [], x.ord ? 1 : 0]), ng: 0,
    tgN: c.tgN || 0, tgc: Array.from({ length: c.tgN || 0 }, (_, i) => gColIdx(c.tgCol, i + 1)), abs: { day: today(), ids: absIds(c).map(id => c.students.findIndex(s => s.id === id)).filter(i => i >= 0) },
    st: c.students.map(s => [s.nom, s.prenom, s.sexe || '', best50(c, s.id), 0, c.tgN ? (c.tg[s.id] || 0) : 0, c.man50 && c.man50[s.id] != null ? 1 : 0]) };
}
function applyS(p) {
  if (!p || p.a !== APP || p.t !== 'S') throw new Error('Ce QR n\'est pas une séance Zones Relais');
  let c = S.classes.find(x => x.id === p.cid);
  if (!c) { c = { id: p.cid, name: p.cn, students: [], passages: [], sprints: [], group: [], overrides: {}, crit: [], grp: {}, ng: 0, b50ext: {}, myGroup: null, tg: {}, tgN: 0, myTg: [] }; S.classes.push(c); }
  c.name = p.cn;
  p.st.forEach(([nom, prenom, sexe]) => {
    const id = keyOf(nom, prenom), ex = stu(c, id);
    if (ex) { ex.sexe = sexe || ex.sexe; ex.nom = nom; ex.prenom = prenom; } else c.students.push({ id, nom, prenom, sexe });
  });
  const tgChanged = (c.tgN || 0) !== (p.tgN || 0);
  c.tg = {}; c.tgN = p.tgN || 0; c.tgCol = {}; (p.tgc || []).forEach((v, i) => { c.tgCol[i + 1] = v; });
  p.st.forEach(([nom, prenom, , , , tg]) => { if (tg) c.tg[keyOf(nom, prenom)] = tg; });
  c.myTg = tgChanged ? [] : (c.myTg || []).filter(g => g <= c.tgN);
  if (p.abs) c.absent = { day: p.abs.day, ids: p.abs.ids.map(i => p.st[i]).filter(Boolean).map(([n, pr]) => keyOf(n, pr)) };
  c.man50 = {}; p.st.forEach(([nom, prenom, , b, , , man]) => { if (man && b != null) c.man50[keyOf(nom, prenom)] = b; });
  c.b50ext = {}; c.grp = {};
  p.st.forEach(([nom, prenom, , b, g]) => { const id = keyOf(nom, prenom); if (b != null) c.b50ext[id] = b; if (g) c.grp[id] = g; });
  const changed = c.ng !== p.ng;
  c.ng = p.ng || 0;
  if (changed || (c.myGroup != null && c.myGroup > c.ng)) c.myGroup = null;
  c.crit = p.crit.map(([k, l, t, o, ord]) => ({ k, l, t: t || 'yn', o: o || [], ord: !!ord }));
  if (p.txc) c.txc = p.txc;
  c.recvAt = Date.now();
  Object.assign(S.settings, p.set); S.pin = p.pin || S.pin;
  S.cur = c.id; save();
  return c;
}
function buildR(c) {
  const mineS = c.sprints.filter(s => s.local), mineP = c.passages.filter(p => p.local);
  const u = [...new Set([...mineS.map(s => s.sid), ...mineP.flatMap(p => [p.d, p.r])])];
  const ix = id => u.indexOf(id), ck = crits(c).map(x => x.k), tk = txAll(c).map(t => t.k);
  return { a: APP, t: 'R', v: 4, ts: Date.now(), cid: c.id, cn: c.name, tab: tabletName(), u, ck, tk: txAll(c).map(t => t.k), del: c.deleted || [],
    s: mineS.map(s => [s.id, ix(s.sid), s.t, s.ts, s.endAt || null]),
    p: mineP.map(p => [p.id, p.ts, p.endAt || null, ix(p.d), ix(p.r), p.tIn, p.tZt, p.tEnd, p.cible ?? null,
      p.fail ? FAILS.findIndex(f => f.k === p.fail) + 1 : 0, ck.map(k => { const v = p.c[k]; return v === true ? 1 : v === false ? 0 : v ?? null; }),
      p.cfg.total, p.cfg.zt, p.les === 'tg' ? 1 : p.les === 'ev' ? 2 : 0, p.grp || 0, p.tx ? tk.map(k => p.tx[k] ?? null) : null]) };
}
function mergeR(R) {
  if (!R || R.a !== APP || R.t !== 'R') throw new Error('Ce QR n\'est pas un envoi de résultats Zones Relais');
  let c = S.classes.find(x => x.id === R.cid);
  if (!c) { c = cls(); if (!c || !confirm(`Résultats de la classe « ${R.cn} » (tablette ${R.tab}). Les ajouter à « ${c ? c.name : '?'} » ?`)) throw new Error('Classe non trouvée'); }
  const sid = i => {
    const id = R.u[i]; if (id && !stu(c, id)) { const [n, p] = id.split('|'); c.students.push({ id, nom: (n || '').toUpperCase(), prenom: cap(p || ''), sexe: '' }); }
    return id;
  };
  // temps effacés sur la tablette élève : effacés aussi ici, et jamais réajoutés
  let nd = 0;
  (R.del || []).forEach(id => { nd += delRun(c, id, true); });
  const gone = new Set(c.deleted || []);
  const ks = new Set([...c.sprints.map(s => s.id), ...gone]), kp = new Set([...c.passages.map(p => p.id), ...gone]);
  let ns = 0, np = 0, dup = 0;
  R.s.forEach(([id, i, t, ts, endAt]) => {
    if (ks.has(id)) { dup++; return; }
    const s = sid(i); c.sprints.push({ id, sid: s, snap: snap(c, s), t, ts, endAt, tablet: R.tab, local: false }); ns++;
  });
  R.p.forEach(([id, ts, endAt, di, ri, tIn, tZt, tEnd, cible, fc, cs, total, zt, les, grp, tx]) => {
    if (kp.has(id)) { dup++; return; }
    const d = sid(di), r = sid(ri), cm = {};
    const crK = Object.fromEntries(crits(c).map(x => [x.k, x]));
    (R.ck || []).forEach((k, j) => {
      const v = typeof cs === 'string' ? (cs[j] === '1' ? 1 : cs[j] === '0' ? 0 : null) : cs[j];
      if (v == null) return;
      cm[k] = !crK[k] || ctype(crK[k]) === 'yn' ? v === 1 : v;
    });
    c.passages.push(finalize({ id, ts, endAt, tablet: R.tab, local: false, d, r, dSnap: snap(c, d), rSnap: snap(c, r),
      tIn, tZt, tEnd, cible, fail: fc ? FAILS[fc - 1].k : null, c: cm, cfg: { total, zt },
      les: les === 2 ? 'ev' : les ? 'tg' : null, grp: grp || null, tx: tx ? Object.fromEntries((R.tk || ['md', 'mr', 'sens', 'rep', 'mom']).map((k, j) => [k, tx[j]]).filter(([, v]) => v != null)) : undefined }));
    np++;
  });
  save();
  return { c, ns, np, dup, nd };
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
    $('#tb-main').textContent = c.tgN ? '📤 Envoyer les groupes' : '📤 Envoyer la séance';
    $('#send-info').innerHTML = `<b>${c.tgN ? `${c.tgN} groupes` : 'Étape 1 · 50 m'}</b> — ${esc(c.name)} · ${c.students.length} élèves · ${S.settings.total} m, Zt ${S.settings.zt} m · ${crits(c).length} critères${c.tgN ? ` · groupes inclus` : ''}.
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
    toast(`Séance reçue : ${c.name} · ${c.students.length} élèves${c.tgN ? ` · ${c.tgN} groupes` : ''}`, 3500);
    setTimeout(() => show('eleve'), 300);
    return 'stop';
  }
  const r = mergeR(p);
  recvLog.unshift(`✓ ${esc(p.tab)} : ${r.ns} chrono(s) 50 m, ${r.np} relais ajoutés${r.dup ? ` · ${r.dup} déjà reçus` : ''}${r.nd ? ` · ${r.nd} effacé(s)` : ''}`);
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
      const c = { id: uid(), name, students: pending, passages: [], sprints: [], group: [], overrides: {}, crit: DEFAULT_CRIT.map(x => ({ ...x })), grp: {}, ng: 0, b50ext: {}, myGroup: null, tg: {}, tgN: 0, myTg: [], created: Date.now() };
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
// Colonnes repérées par leur titre (export Pronote : Nom, Prénom, …, Sexe en E) ;
// sans ligne de titres : Nom en A, Prénom en B, et la colonne du sexe est trouvée d'après son contenu.
function parseRows(rows) {
  const clean = v => String(v ?? '').trim().replace(/\s+/g, ' ');
  const head = (rows[0] || []).map(v => norm(v));
  const hasHead = head.some(h => /^(nom|noms|nom de famille|élève|eleve|name)$/.test(h));
  let cN = 0, cP = 1, cS = -1;
  if (hasHead) {
    const find = re => head.findIndex(h => re.test(h));
    const n = find(/^(nom|noms|nom de famille|name)$/), pr = find(/^(prénom|prenom|prénoms|prenoms|first name)$/), sx = find(/^(sexe|genre|sex)$/);
    if (n >= 0) cN = n; if (pr >= 0) cP = pr; cS = sx;
  }
  const body = hasHead ? rows.slice(1) : rows;
  if (cS < 0) { // pas de titre « Sexe » : colonne où la plupart des valeurs sont F/G, Fille/Garçon, Féminin/Masculin
    let best = -1, bestN = 0;
    const width = Math.max(0, ...body.map(r => r.length));
    for (let j = 0; j < width; j++) {
      if (j === cN || j === cP) continue;
      const vals = body.map(r => clean(r[j])).filter(Boolean);
      const ok = vals.filter(v => /^(f|g|m|h|fille|garçon|garcon|féminin|feminin|masculin|femme|homme)$/i.test(v)).length;
      if (vals.length && ok / vals.length > 0.8 && ok > bestN) { best = j; bestN = ok; }
    }
    cS = best;
  }
  const out = [];
  body.forEach(r => {
    const nom = clean(r[cN]), prenom = clean(r[cP]);
    if (!nom) return;
    out.push({ id: keyOf(nom, prenom), nom, prenom, sexe: cS >= 0 ? parseSex(r[cS]) : '' });
  });
  return dedupe(out).sort(byFirst);
}
function renderClasses() {
  const el = $('#class-list');
  if (!S.classes.length) { el.innerHTML = '<div class="empty">Aucune classe pour l\'instant.</div>'; return; }
  el.innerHTML = S.classes.map(c => `
    <div class="list-item ${c.id === S.cur ? 'current' : ''}">
      <div class="grow"><b>${esc(c.name)}</b><div class="meta">${c.students.length} élèves · ${c.sprints.length} chronos 50 m · ${c.passages.length} relais${c.tgN ? ` · ${c.tgN} groupes` : ''}</div></div>
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
   PROF : LEÇON D'ÉVALUATION
   1 appel · 2 temps sur 50 m · 3 groupes · 4 passages en ordre libre (saisie tablette ou fiche PDF)
   Pas de critères ni de vidéo ; au-delà de 4 passages, les meilleurs sont retenus pour l'indice technique.
   ===================================================================== */
let evSel = { g: null, d: null, r: null }, evRun = null;
const evPass = c => c.passages.filter(p => p.les === 'ev');
/* couleurs des groupes (chasubles) */
const GCOL = [['Rouge', '#e53935'], ['Bleu', '#1e66d0'], ['Vert', '#2e9d4a'], ['Jaune', '#f2c200'], ['Orange', '#f57c00'], ['Violet', '#7e3ab5'],
  ['Rose', '#e84f9a'], ['Marron', '#8d5a2b'], ['Noir', '#222222'], ['Turquoise', '#00a3a3'], ['Gris', '#8a94a6'], ['Blanc', '#ffffff']];
const gColIdx = (map, g) => map && map[g] != null ? map[g] : (g - 1) % GCOL.length;
const gCol = (c, g) => g ? GCOL[gColIdx(c.tgCol, g)] : ['Sans groupe', '#8a94a6'];
const gDot = (c, g) => g ? `<i class="gdot" style="background:${gCol(c, g)[1]}"></i>` : '';
const gLbl = (c, g) => g ? `Groupe ${g} · ${gCol(c, g)[0]}` : 'Sans groupe';
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lightCol = h => { const [r, g, b] = hexRgb(h); return r * .299 + g * .587 + b * .114 > 170; };
/* ordre des binômes : on évite qu'un élève enchaîne deux passages */
function pairOrder(mem) {
  const all = []; mem.forEach(a => mem.forEach(b => { if (a.id !== b.id) all.push([a, b]); }));
  const out = [], cnt = {};
  while (all.length) {
    const last = out[out.length - 1], prev = out[out.length - 2];
    const hit = (pr, a, b, w) => pr ? ((pr.some(x => x.id === a.id) ? w : 0) + (pr.some(x => x.id === b.id) ? w : 0)) : 0;
    const score = ([a, b]) => hit(last, a, b, 10) + hit(prev, a, b, 3) + (cnt[a.id] || 0) + (cnt[b.id] || 0);
    let bi = 0; all.forEach((p, i) => { if (score(p) < score(all[bi])) bi = i; });
    const [p] = all.splice(bi, 1); out.push(p); p.forEach(x => { cnt[x.id] = (cnt[x.id] || 0) + 1; });
  }
  return out;
}
function evGroups(c) {
  const gs = Array.from({ length: c.tgN || 0 }, (_, i) => i + 1).filter(g => isProf() || (c.myTg || []).includes(g)).map(g => ({ g, mem: tgMembers(c, g) })).filter(x => x.mem.length);
  if (!isProf()) return gs;
  const rest = present(c).filter(s => !c.tg[s.id]).sort(byFirst);
  if (rest.length) gs.push({ g: 0, mem: rest });
  return gs;
}
function renderEvl() {
  const el = !isProf();
  $('#evl-steps').classList.toggle('hidden', el); $('.evl-actions').classList.toggle('hidden', el);
  if (el) { $('#tb-main').textContent = '④ Évaluation'; $('#tb-sub').textContent = `Groupe${cls().myTg.length > 1 ? 's' : ''} ${cls().myTg.join(', ')} · chrono 4 tops (zone de transmission)`; paintEvlEntry(); paintEvlGroups(); return; }
  const c = cls(), np = present(c).length, n50 = present(c).filter(s => best50(c, s.id) != null).length;
  const appelOk = c.absent && c.absent.day === today(), ng = c.tgN || 0, placed = present(c).filter(s => c.tg[s.id]).length;
  const st = (n, t, d, btn, ok) => `<div class="evl-step ${ok ? 'ok' : ''}"><span class="evl-n">${ok ? '✓' : n}</span><div><b>${t}</b><span class="meta">${d}</span></div>${btn}</div>`;
  $('#evl-steps').innerHTML =
    st(1, 'Appel', appelOk ? `${np} présents, ${absIds(c).length} absent(s)` : 'à faire', `<button class="btn ${appelOk ? 'ghost' : 'primary'} small" data-go="appel">📋 Appel</button>`, appelOk) +
    st(2, 'Temps sur 50 m', `${n50}/${np} présents ont un temps`, `<button class="btn ${n50 < np ? 'primary' : 'ghost'} small" data-go="perf50">✏️ Saisir / vérifier</button>`, np && n50 === np) +
    st(3, 'Groupes', ng ? `${ng} groupes · ${placed}/${np} présents placés` : 'à constituer', `<button class="btn ${placed < np ? 'primary' : 'ghost'} small" data-go="tgroupes">👥 Groupes</button>`, ng && placed === np);
  paintEvlEntry(); paintEvlGroups();
}
function evStats(c, sid) {
  const P = evPass(c).filter(p => p.d === sid || p.r === sid), stars = P.map(p => passStars(c, p)).filter(x => x != null).sort((a, b) => b - a);
  return { n: P.length, nd: P.filter(p => p.d === sid).length, nr: P.filter(p => p.r === sid).length, best: stars.slice(0, 4) };
}
function paintEvlGroups() {
  const c = cls(), D = S.settings.total, gs = evGroups(c);
  $('#evl-groups').innerHTML = gs.length ? gs.map(({ g, mem }) => {
    const P = evPass(c).filter(p => mem.some(s => s.id === p.d) && mem.some(s => s.id === p.r)).sort((a, b) => b.ts - a.ts);
    return `<div class="card evl-g" style="border-top:6px solid ${gCol(c, g)[1]}"><div class="row between wrap"><h3 style="margin:0">${gDot(c, g)}${gLbl(c, g)}</h3><span class="meta">${P.length} passage${P.length > 1 ? 's' : ''}</span></div>
      <div class="evl-mem">${mem.map(s => { const e = evStats(c, s.id), b = best50(c, s.id), role = evSel.d === s.id ? 'd' : evSel.r === s.id ? 'r' : '';
        return `<button class="tile ${role ? 'sel-' + role : ''} ${e.n >= 4 ? 'done4' : ''}" data-ev="${esc(s.id)}" data-evg="${g}">
          ${role ? `<span class="role ${role} badge">${role.toUpperCase()}</span>` : ''}
          <span class="top"><span class="nom">${esc(dnStudent(c, s))}</span>${sexBadge(s.sexe)}</span>
          <span class="perf">${b != null ? `50 m : <b>${fmt(b)} s</b>` : '<span class="flag">pas de 50 m</span>'}</span>
          <span class="foot"><span class="count">${e.n} passage${e.n > 1 ? 's' : ''}${e.n ? ` (D ${e.nd} · R ${e.nr})` : ''} ${e.best.length ? '· ' + e.best.map(x => '★'.repeat(x)).join(' ') : ''}</span><span class="rec" data-sid="${esc(s.id)}"></span></span>
        </button>`; }).join('')}</div>
      ${P.length ? `<div class="evl-hist">${P.map(p => { const it = passIT(c, p), sr = passStars(c, p);
        return `<div class="evl-row"><span><b>${esc(dn(c, p.d, p.dSnap))}</b> ➜ <b>${esc(dn(c, p.r, p.rSnap))}</b></span>
          <span>${p.fail ? '<span class="tag ko">raté</span>' : fmt(p.tEnd) + ' s'}</span><span class="meta">cible ${p.tgt != null ? fmt(p.tgt) + ' s' : '–'}</span>
          <span>IT ${fit(it)}${p.gap != null ? `<span class="sub zt">Zt ${fgap(p.gap)} · ${ztPts(p.gap)} pt${ztPts(p.gap) > 1 ? 's' : ''}</span>` : p.fail ? '<span class="sub zt">Zt 0 pt</span>' : ''}</span><span class="st">${sr != null ? '★'.repeat(sr) : ''}</span><button class="btn danger-ghost small" data-evdel="${p.id}">🗑</button></div>`; }).join('')}</div>` : ''}
    </div>`;
  }).join('') : '<div class="empty">Constituez d\'abord les groupes (étape 3).</div>';
  $$('#evl-groups [data-ev]').forEach(t => t.onclick = () => evPick(t.dataset.ev, +t.dataset.evg));
  $$('#evl-groups [data-evdel]').forEach(b => b.onclick = () => { if (confirm('Supprimer ce passage ?')) { delRun(c, b.dataset.evdel); paintEvlGroups(); } });
  updateRec();
}
function evPick(id, g) {
  if (evRun && evRun.t0 != null && evRun.t == null) { toast('Course en cours : arrivée ou annuler'); return; }
  if (evSel.g !== g) evSel = { g, d: null, r: null };
  if (evSel.d === id) { evSel.d = evSel.r; evSel.r = null; }
  else if (evSel.r === id) evSel.r = null;
  else if (!evSel.d) evSel.d = id;
  else evSel.r = id;
  evRun = null;
  if (evSel.d && evSel.r && !recCheck([evSel.d, evSel.r])) evSel.r = null;
  paintEvlEntry(); paintEvlGroups();
  if (evSel.d && evSel.r) $('#evl-entry').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function paintEvlEntry() {
  const c = cls(), box = $('#evl-entry');
  if (!(evSel.d && evSel.r)) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const D = S.settings.total, cb = cible100(c, evSel.d, evSel.r), tgt = cb != null ? cb * D / BASE : null;
  const t = evRun && evRun.t != null ? evRun.t : null;
  box.classList.remove('hidden');
  if (!isProf()) {
    box.innerHTML = `<div class="row between wrap"><div class="pc-names" style="font-size:1.15rem"><span class="role d">D</span> ${esc(dn(c, evSel.d))} <span class="arrow">➜</span> <span class="role r">R</span> ${esc(dn(c, evSel.r))}
        <button class="btn ghost small" id="ev-swap">⇄</button></div>
        <div class="target">🎯 Cible ${D} m : <b>${tgt != null ? fmt(tgt) + ' s' : '–'}</b></div></div>
      <div class="row gap wrap center"><button class="btn primary big" id="ev-run">⏱ Chronométrer (Début · Entrée Zt · Fin Zt · Fin)</button><button class="btn ghost" id="ev-cancel">Annuler</button></div>`;
    $('#ev-swap').onclick = () => { [evSel.d, evSel.r] = [evSel.r, evSel.d]; paintEvlEntry(); paintEvlGroups(); };
    $('#ev-cancel').onclick = () => { evSel = { g: evSel.g, d: null, r: null }; paintEvlEntry(); paintEvlGroups(); };
    $('#ev-run').onclick = evRun4;
    return;
  }
  box.innerHTML = `<div class="row between wrap"><div class="pc-names" style="font-size:1.15rem"><span class="role d">D</span> ${esc(dn(c, evSel.d))} <span class="arrow">➜</span> <span class="role r">R</span> ${esc(dn(c, evSel.r))}
      <button class="btn ghost small" id="ev-swap">⇄</button></div>
      <div class="target">🎯 Cible ${D} m : <b>${tgt != null ? fmt(tgt) + ' s' : '–'}</b></div></div>
    <div class="evl-chrono">
      <div class="clock small" id="ev-clock">${t != null ? fmt(t) : '0,00'}</div>
      <button class="cbtn ${!evRun || evRun.t0 == null ? 'next' : 'done'}" data-step="0" id="ev-go" ${evRun && evRun.t0 != null ? 'disabled' : ''}>Départ</button>
      <button class="cbtn ${evRun && evRun.t0 != null && t == null ? 'next' : ''}" data-step="3" id="ev-stop" ${evRun && evRun.t0 != null && t == null ? '' : 'disabled'}>Arrivée</button>
    </div>
    <div class="row gap wrap center">
      <label class="inline">Temps (s) <input id="ev-time" class="t50" type="text" inputmode="decimal" placeholder="ex. 14,52" value="${t != null ? fmt(t) : ''}"></label>
      <span id="ev-preview" class="meta"></span>
      <button class="btn primary big" id="ev-save">Enregistrer</button>
      <button class="btn fail" id="ev-fail">✗ Passage raté</button>
      <button class="btn ghost" id="ev-cancel">Annuler</button>
      <button class="btn ghost" id="ev-run">⏱ Chrono avec zone (4 tops)</button>
    </div>
    <p class="hint center">Chronométrez avec Départ / Arrivée, ou tapez le temps relevé sur la fiche papier. Le temps dans la zone (note EPS) n'est mesuré qu'avec le chrono 4 tops (tablettes élèves).</p>`;
  $('#ev-run').onclick = () => { if (evRun && evRun.t0 != null && evRun.t == null) { toast('Course en cours'); return; } evRun = null; evRun4(); };
  const prev = () => {
    const ms = parseTime($('#ev-time').value, 40);
    if (ms == null || cb == null) { $('#ev-preview').textContent = ''; return; }
    const it = Math.round((ms * BASE / D - cb) / 10) / 100;
    $('#ev-preview').innerHTML = `IT ${fit(it)} · <span class="st">${'★'.repeat(starsFromIT(it))}</span>`;
  };
  $('#ev-time').oninput = prev; prev();
  $('#ev-swap').onclick = () => { [evSel.d, evSel.r] = [evSel.r, evSel.d]; paintEvlEntry(); paintEvlGroups(); };
  $('#ev-go').addEventListener('pointerdown', e => { e.preventDefault(); evRun = { t0: performance.now(), t: null }; requestWake(); paintEvlEntry(); evTick(); });
  $('#ev-stop').addEventListener('pointerdown', e => { e.preventDefault(); if (!evRun || evRun.t0 == null) return; evRun.t = performance.now() - evRun.t0; evRun.endAt = Date.now(); cancelAnimationFrame(raf); releaseWake(); paintEvlEntry(); });
  $('#ev-cancel').onclick = () => { evSel = { g: evSel.g, d: null, r: null }; evRun = null; cancelAnimationFrame(raf); releaseWake(); paintEvlEntry(); paintEvlGroups(); };
  $('#ev-fail').onclick = () => evSave(true);
  $('#ev-save').onclick = () => evSave(false);
}
function evRun4() { const { d, r, g } = evSel; evSel = { g, d: null, r: null }; startRun(d, r, { les: 'ev', grp: g || null }); }
const ztPts = g => g == null ? null : g > 0 ? 4 : g >= -8 ? 3 : g >= -15 ? 2 : g >= -20 ? 1 : 0;
function evTick() { if (!evRun || evRun.t != null || view !== 'evl') return; const el = $('#ev-clock'); if (el) el.textContent = fmt(performance.now() - evRun.t0); raf = requestAnimationFrame(evTick); }
function evSave(failed) {
  const c = cls(), D = S.settings.total;
  const ms = failed ? null : parseTime($('#ev-time').value, 40);
  if (!failed && ms == null) { toast('Saisissez ou chronométrez le temps'); return; }
  if (failed && !confirm('Enregistrer un passage raté (1 ★) ?')) return;
  const p = finalize({ id: uid(), ts: Date.now(), endAt: (evRun && evRun.endAt) || Date.now(), tablet: S.settings.tablet, local: true,
    d: evSel.d, r: evSel.r, dSnap: snap(c, evSel.d), rSnap: snap(c, evSel.r), tIn: null, tZt: null, tEnd: ms,
    cible: cible100(c, evSel.d, evSel.r), fail: failed ? 'autre' : null, c: {}, cfg: { total: D, zt: S.settings.zt }, les: 'ev', grp: evSel.g || null });
  c.passages.push(p); save();
  toast(failed ? 'Passage raté enregistré (1 ★)' : `${fmt(ms)} s · IT ${fit(p.it)} · ${'★'.repeat(p.stars || 0)}`, 3000);
  evSel = { g: evSel.g, d: null, r: null }; evRun = null; paintEvlEntry(); paintEvlGroups();
}
$('#evl-notes').onclick = () => { $('#b-les').value = 'ev'; show('bilan'); };
/* Fiche PDF de saisie : une page par groupe, colonnes Démarreur / Relayeur et résultats à côté, sans pied de page */
$('#evl-pdf').onclick = () => {
  if (!window.jspdf) { toast('Module PDF indisponible'); return; }
  const c = cls(), D = S.settings.total, gs = evGroups(c);
  if (!gs.length) { toast('Constituez d\'abord les groupes'); return; }
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297, M = 12, navy = [2, 36, 98], grey = [91, 107, 134];
  const T = (t, x, y, o) => doc.text(pdfSafe(t), x, y, o);
  gs.forEach(({ g, mem }, gi) => {
    if (gi) doc.addPage();
    const [cn, hex] = gCol(c, g), rgb = hexRgb(hex), light = lightCol(hex), ink = light ? [20, 20, 20] : [255, 255, 255];
    // bande de couleur du groupe (haut + bord gauche)
    doc.setFillColor(...rgb); doc.rect(0, 0, W, 30, 'F'); doc.rect(0, 0, 5, H, 'F');
    if (light) { doc.setDrawColor(60); doc.setLineWidth(0.6); doc.line(0, 30, W, 30); doc.line(5, 30, 5, H); doc.setLineWidth(0.2); }
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
    T(g ? `GROUPE ${g} - ${cn.toUpperCase()}` : 'SANS GROUPE', M, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    T(`Évaluation relais ${D} m · ${c.name} · ${new Date().toLocaleDateString('fr-FR')}`, M, 22);
    T(`Cible = 50 m D + 50 m R - 0,3 s${D !== BASE ? ` (ramenée à ${D} m)` : ''}`, M, 27);
    // pastille couleur à droite
    doc.setFillColor(255); doc.roundedRect(W - M - 34, 5, 34, 20, 3, 3, 'F');
    doc.setFillColor(...rgb); doc.roundedRect(W - M - 32, 7, 30, 16, 2, 2, 'F'); doc.setDrawColor(60); doc.roundedRect(W - M - 32, 7, 30, 16, 2, 2, 'S');
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); T(cn.toUpperCase(), W - M - 17, 17, { align: 'center' });
    let y = 39;
    // coureurs + cases à cocher par passage
    doc.setTextColor(...navy); doc.setFontSize(11); T('Coureurs', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...grey); T('cochez une case à chaque passage (4 minimum)', M + 22, y); y += 2;
    mem.forEach(s => {
      const P = evPass(c).filter(p => p.d === s.id || p.r === s.id).length;
      doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); T(dnStudent(c, s), M + 1, y + 5.2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); T(`${s.sexe || '?'} · 50 m : ${best50(c, s.id) != null ? fmt(best50(c, s.id)) + ' s' : '-'}`, M + 48, y + 5.2);
      for (let k = 0; k < 8; k++) { const x = M + 95 + k * 9; doc.setDrawColor(120); doc.rect(x, y + 1.3, 5.5, 5.5); if (k < P) { doc.setDrawColor(...navy); doc.setLineWidth(0.6); doc.line(x + 1, y + 4, x + 2.4, y + 5.8); doc.line(x + 2.4, y + 5.8, x + 4.8, y + 2); doc.setLineWidth(0.2); } }
      y += 7.5;
    });
    y += 5;
    // tous les binômes possibles
    const order = pairOrder(mem);
    doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); T(`Binômes possibles (${order.length}) : choisissez la ligne du binôme qui passe`, M, y); y += 3;
    const cols = [['N°', 9], ['Démarreur', 40], ['Relayeur', 40], ['Cible', 22], ['Chrono', 28], ['2e essai', 28], ['Étoiles', 19]];
    const tw = cols.reduce((a, x) => a + x[1], 0);
    doc.setFillColor(...rgb); doc.rect(M, y, tw, 7.5, 'F'); if (light) { doc.setDrawColor(60); doc.rect(M, y, tw, 7.5); }
    doc.setTextColor(...ink); doc.setFontSize(9.5);
    let x = M; cols.forEach(([l, w]) => { T(l, x + 1.5, y + 5.1); x += w; }); y += 7.5;
    const RH = order.length > 12 ? 8 : 9.5, extra = Math.max(0, Math.min(4, Math.floor((H - 18 - y - order.length * RH) / RH)));
    const rows = [...order.map(([a, b]) => ({ a, b })), ...Array.from({ length: extra }, () => null)];
    rows.forEach((row, i) => {
      if (i % 2) { doc.setFillColor(246, 249, 253); doc.rect(M, y, tw, RH, 'F'); }
      doc.setDrawColor(190); doc.rect(M, y, tw, RH);
      x = M; cols.forEach(([, w]) => { doc.line(x, y, x, y + RH); x += w; });
      let v;
      if (row) {
        const cb = cible100(c, row.a.id, row.b.id), P = evPass(c).filter(p => p.d === row.a.id && p.r === row.b.id).sort((p, q) => p.ts - q.ts);
        const res = p => p ? (p.fail ? 'raté' : fmt(p.tEnd)) : '', st = P.map(p => passStars(c, p)).filter(z => z != null);
        v = [i + 1, dnStudent(c, row.a), dnStudent(c, row.b), cb != null ? fmt(cb * D / BASE) + ' s' : '-', res(P[0]), res(P[1]), st.length ? '*'.repeat(Math.max(...st)) : ''];
      } else v = ['', '', '', '', '', '', ''];
      x = M; v.forEach((val, j) => {
        doc.setTextColor(30, 30, 30); doc.setFont('helvetica', j === 1 || j === 2 || j === 3 ? 'bold' : 'normal'); doc.setFontSize(j === 3 ? 10.5 : 10);
        if (j === 3) doc.setTextColor(...navy);
        T(doc.splitTextToSize(pdfSafe(val), cols[j][1] - 2)[0] || '', x + 1.5, y + RH / 2 + 1.6); x += cols[j][1];
      });
      y += RH;
    });
    doc.setTextColor(...grey); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    if (y + 8 < H - 4) T('Étoiles : IT <= 0 : 4 * · de 0,1 à 0,5 : 3 * · de 0,6 à 1 : 2 * · >= 1,1 ou raté : 1 *   (IT = chrono ramené à 100 m - cible 100 m)', M, y + 6);
  });
  deliver(doc.output('blob'), `Evaluation_relais_fiche_${safeName(c.name)}.pdf`);
};

/* =====================================================================
   PROF : temps sur 50 m (voir / corriger)
   ===================================================================== */
function parseTime(v, max = 30) { const x = parseFloat(String(v).trim().replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(x) && x > 3 && x < max ? Math.round(x * 1000) : null; }
function renderPerf50() {
  const c = cls(); c.man50 = c.man50 || {};
  const rows = [...c.students].sort(byFirst).map(s => {
    const tries = c.sprints.filter(x => x.sid === s.id && x.t != null).sort((a, b) => a.ts - b.ts);
    const meas = tries.length ? Math.min(...tries.map(x => x.t)) : null, man = c.man50[s.id], used = best50(c, s.id), pts = ptsFrom(B_IND, s.sexe, used);
    return `<tr class="${isAbs(c, s.id) ? 'none' : ''}"><td class="name">${esc(dnStudent(c, s))}${isAbs(c, s.id) ? ' <small>absent</small>' : ''}</td><td>${sexBadge(s.sexe)}</td>
      <td class="tries">${tries.map(x => `<span class="${x.t === meas ? 'best' : ''}">${fmt(x.t)}</span>`).join(' ') || '<span class="meta">aucun</span>'}</td>
      <td>${meas != null ? fmt(meas) + ' s' : '–'}</td>
      <td><input class="t50" type="text" inputmode="decimal" data-p50="${esc(s.id)}" value="${used != null ? fmt(used) : ''}" placeholder="ex. 7,45"></td>
      <td>${man != null ? `<span class="tag st">saisi</span> <button class="btn ghost small" data-p50r="${esc(s.id)}" title="Revenir au temps mesuré">↺</button>` : used != null ? '<span class="meta">mesuré</span>' : ''}</td>
      <td class="pts">${pts != null ? fpt(pts) : '–'}</td></tr>`;
  }).join('');
  $('#p50-table').innerHTML = `<tr><th style="text-align:left">Élève</th><th>Sexe</th><th>Essais</th><th>Meilleur mesuré</th><th>Temps retenu (s)</th><th></th><th>Vit. indiv. /3</th></tr>${rows}`;
  $$('#p50-table [data-p50]').forEach(inp => {
    const commit = () => {
      const id = inp.dataset.p50, raw = inp.value.trim(), cur = best50(c, id);
      if (raw === '') { if (c.man50[id] != null) { delete c.man50[id]; save(); toast('Temps saisi retiré'); } renderPerf50(); return; }
      const ms = parseTime(raw);
      if (ms == null) { toast('Temps invalide (ex. 7,45)'); inp.value = cur != null ? fmt(cur) : ''; return; }
      if (ms === cur) return;
      c.man50[id] = ms; save(); toast(`${dn(c, id)} : ${fmt(ms)} s retenu · renvoyez la séance aux tablettes`); renderPerf50();
    };
    inp.onchange = commit; inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
  });
  $$('#p50-table [data-p50r]').forEach(b => b.onclick = () => { delete c.man50[b.dataset.p50r]; save(); renderPerf50(); });
}

/* =====================================================================
   PROF : appel
   ===================================================================== */
let apDraft = new Set();
function renderAppel() { apDraft = new Set(absIds(cls())); paintAppel(); }
function paintAppel() {
  const c = cls(), n = c.students.length, a = apDraft.size;
  $('#ap-count').textContent = `${n - a} présent${n - a > 1 ? 's' : ''} · ${a} absent${a > 1 ? 's' : ''} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  $('#ap-list').innerHTML = [...c.students].sort(byFirst).map(s => `
    <div class="tile check ap ${apDraft.has(s.id) ? 'absent' : 'on'}" data-ap="${esc(s.id)}">
      <span class="box">${apDraft.has(s.id) ? '✕' : '✓'}</span><span class="nom">${esc(dnStudent(c, s))}<small>${apDraft.has(s.id) ? 'absent' : 'présent'}</small></span>
      <button class="sex ${s.sexe || 'none'}" data-apsex="${esc(s.id)}">${s.sexe || 'F/G ?'}</button>
    </div>`).join('');
  $$('#ap-list [data-ap]').forEach(t => t.onclick = e => {
    if (e.target.closest('[data-apsex]')) return;
    const id = t.dataset.ap; apDraft.has(id) ? apDraft.delete(id) : apDraft.add(id); paintAppel();
  });
  $$('#ap-list [data-apsex]').forEach(b => b.onclick = () => { const st = stu(c, b.dataset.apsex); st.sexe = st.sexe === 'F' ? 'G' : st.sexe === 'G' ? '' : 'F'; save(); paintAppel(); });
}
$('#ap-all').onclick = () => { apDraft = new Set(); paintAppel(); };
$('#ap-ok').onclick = () => {
  const c = cls(); c.absent = { day: today(), ids: [...apDraft] }; save();
  const inGrp = [...apDraft].filter(id => (c.grp || {})[id] || (c.tg || {})[id]).length;
  toast(`Appel enregistré · ${apDraft.size} absent(s)${inGrp && !evlFlow ? ' · renvoyez la séance aux tablettes' : ''}`, 3500); show(evlFlow ? 'evl' : 'menu');
};

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
  paintBulk(); renderTxEdit(); renderVidSettings();
  critDraft = crits(c).map(x => ({ ...x }));
  paintCrit();
  renderBareme();
}
function paintCrit() {
  $('#crit-edit').innerHTML = critDraft.map((cr, i) => {
    const t = ctype(cr);
    return `<div class="crit-box">
      <div class="crit-ed"><span class="ph">${i + 1}</span><input type="text" value="${esc(cr.l)}" data-ci="${i}" maxlength="90" placeholder="Nouveau critère observable">
        <button class="btn ghost small" data-cup="${i}" ${i ? '' : 'disabled'}>↑</button>
        <button class="btn danger-ghost small" data-cdel="${i}">✕</button></div>
      <div class="crit-opts">
        <div class="seg small">${Object.entries(CTYPES).map(([k, l]) => `<button data-ct="${i}" data-t="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${t === 'scale' ? '<span class="hint">1 = moins bien … 10 = parfait</span>' : ''}
        ${t === 'free' ? `<label class="inline">Nombre de cases <select data-cn="${i}">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === cr.o.length ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      </div>
      ${t === 'free' ? `<div class="free-opts">${cr.o.map((o, j) => `<input type="text" data-co="${i}" data-j="${j}" value="${esc(o)}" maxlength="40" placeholder="Case ${j + 1}">`).join('')}</div>
        <label class="check"><input type="checkbox" data-cord="${i}" ${cr.ord ? 'checked' : ''}> Cases rangées de la moins bonne à la meilleure : elles comptent dans le niveau d'efficacité technique</label>` : ''}
    </div>`;
  }).join('') || '<div class="empty">Aucun critère.</div>';
  $$('#crit-edit [data-ci]').forEach(inp => inp.oninput = () => { critDraft[+inp.dataset.ci].l = inp.value; });
  $$('#crit-edit [data-cdel]').forEach(b => b.onclick = () => { critDraft.splice(+b.dataset.cdel, 1); paintCrit(); });
  $$('#crit-edit [data-cup]').forEach(b => b.onclick = () => { const i = +b.dataset.cup; [critDraft[i - 1], critDraft[i]] = [critDraft[i], critDraft[i - 1]]; paintCrit(); });
  $$('#crit-edit [data-ct]').forEach(b => b.onclick = () => {
    const cr = critDraft[+b.dataset.ct]; cr.t = b.dataset.t;
    if (cr.t === 'free' && !(cr.o && cr.o.length >= 2)) { cr.o = ['', '', '']; cr.ord = true; }
    paintCrit();
  });
  $$('#crit-edit [data-cn]').forEach(sl => sl.onchange = () => {
    const cr = critDraft[+sl.dataset.cn], n = +sl.value;
    cr.o = Array.from({ length: n }, (_, j) => cr.o[j] || ''); paintCrit();
  });
  $$('#crit-edit [data-co]').forEach(inp => inp.oninput = () => { critDraft[+inp.dataset.co].o[+inp.dataset.j] = inp.value; });
  $$('#crit-edit [data-cord]').forEach(cb => cb.onchange = () => { critDraft[+cb.dataset.cord].ord = cb.checked; });
}
$('#crit-add').onclick = () => { critDraft.push({ k: 'c' + uid().slice(-6), l: '', t: 'yn', o: [], ord: false }); paintCrit(); const ins = $$('#crit-edit [data-ci]'); ins[ins.length - 1].focus(); };
$('#crit-reset').onclick = () => { critDraft = DEFAULT_CRIT.map(x => ({ ...x })); paintCrit(); };
$('#crit-save').onclick = () => {
  const orig = Object.fromEntries(crits(cls()).map(x => [x.k, x]));
  const list = critDraft.map(x => {
    const t = ctype(x), o = t === 'free' ? x.o.map((v, j) => v.trim() || 'Case ' + (j + 1)) : [];
    let k = x.k; const old = orig[k];
    // type ou nombre de cases changé : nouveau critère (les anciennes réponses ne sont pas mélangées)
    if (old && (ctype(old) !== t || (t === 'free' && (old.o || []).length !== o.length))) k = 'c' + uid().slice(-6);
    return { k, l: x.l.trim(), t, o, ord: t === 'free' ? !!x.ord : false };
  }).filter(x => x.l);
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
    ${tbl.M ? `<tr><th>Mixte</th>${tbl.M.map((t, i) => `<td class="${rowCls(i)}">${fnum(t, 2)}"</td>`).join('')}</tr>` : ''}
    <tr><th>Points</th>${PTS16.map((p, i) => `<td class="lv ${rowCls(i)}">${fpt(p)}</td>`).join('')}</tr></table></div>`;
  $('#bareme-box').innerHTML = `
    <h3>Vitesse individuelle /3 · meilleur 50 m départ arrêté</h3>${tb(B_IND)}
    <h3>Vitesse collective /3 · meilleur relais (100 m)</h3>${tb(B_COL)}<p class="hint" style="margin-top:-6px">Si le meilleur relais d'un élève a été couru avec un partenaire de l'autre sexe, il est lu dans le barème mixte (moyenne des barèmes filles et garçons).</p>
    <h3>Indice technique (par course)</h3>
    <p class="hint" style="margin-top:0">Cible = 50 m du démarreur + (50 m du relayeur − 0,3 s). IT = temps du relais − cible.</p>
    <ul class="bareme"><li>IT ≤ 0" : <b>4 ★</b></li><li>IT de 0,1" à 0,5" : <b>3 ★</b></li><li>IT de 0,6" à 1" : <b>2 ★</b></li><li>IT ≥ 1,1" (ou course ratée) : <b>1 ★</b></li></ul>
    <h3 style="margin-top:14px">Efficacité technique /6 · total d'étoiles sur 4 courses</h3>
    <div class="btable"><table>
      <tr>${DEGREES.map(d => `<th colspan="${d.lv.length}" class="r${d.n}">Degré ${d.n} : ${d.n === 1 ? '1' : d.min} à ${d.max} ★</th>`).join('')}</tr>
      <tr>${DEGREES.map(d => d.lv.map(v => `<td class="lv r${d.n}">${fpt(v)}</td>`).join('')).join('')}</tr></table></div>
    <p class="hint">Niveau dans le degré proposé selon le % de critères qualitatifs réussis ; 6 seulement avec 16 ★ obtenues sur 4 courses. Avec 2 ou 3 courses, total d'étoiles extrapolé sur 4.</p>`;
}
/* ---- caractéristiques de la transmission (éditeur) ---- */
let txDraft = [];
function renderTxEdit() { txDraft = JSON.parse(JSON.stringify(txAll(cls()))); paintTxEdit(); }
function paintTxEdit() {
  $('#tx-edit').innerHTML = txDraft.map((t, i) => `<div class="crit-box ${t.on === false ? 'off' : ''}">
    <div class="crit-ed"><label class="check obs"><input type="checkbox" data-xon="${i}" ${t.on !== false ? 'checked' : ''}> observée</label>
      <input type="text" value="${esc(t.l)}" data-xl="${i}" maxlength="60" placeholder="Nouvelle caractéristique">
      <button class="btn ghost small" data-xup="${i}" ${i ? '' : 'disabled'}>↑</button>
      <button class="btn danger-ghost small" data-xdel="${i}">✕</button></div>
    <div class="crit-opts">
      <div class="seg small"><button data-xt="${i}" data-t="choice" class="${t.t !== 'num' ? 'on' : ''}">Choix</button><button data-xt="${i}" data-t="num" class="${t.t === 'num' ? 'on' : ''}">Mesure</button></div>
      ${t.t === 'num' ? `<label class="inline">Unité <select data-xu="${i}">${['pieds', 'm', 'semelles', 'plots'].map(u => `<option ${u === t.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="inline">Pas <select data-xs="${i}">${[0.1, 0.25, 0.5, 1].map(v => `<option value="${v}" ${v === (t.step || 0.5) ? 'selected' : ''}>${String(v).replace('.', ',')}</option>`).join('')}</select></label>
        <label class="inline">Valeur de départ <input type="number" step="any" data-xdef="${i}" value="${t.def ?? ''}" style="width:90px"></label>` : ''}
    </div>
    ${t.t !== 'num' ? `<div class="free-opts">${(t.o || []).map(([v, l], j) => `<span class="opt-ed"><input type="text" data-xo="${i}" data-j="${j}" value="${esc(l)}" maxlength="30" placeholder="Choix ${j + 1}"><button class="btn danger-ghost small" data-xodel="${i}" data-j="${j}" ${(t.o || []).length > 2 ? '' : 'disabled'}>✕</button></span>`).join('')}
      <button class="btn ghost small" data-xoadd="${i}">+ choix</button></div>` : ''}
  </div>`).join('');
  const T = i => txDraft[+i];
  $$('#tx-edit [data-xon]').forEach(x => x.onchange = () => { T(x.dataset.xon).on = x.checked; paintTxEdit(); });
  $$('#tx-edit [data-xl]').forEach(x => x.oninput = () => { T(x.dataset.xl).l = x.value; });
  $$('#tx-edit [data-xup]').forEach(b => b.onclick = () => { const i = +b.dataset.xup; [txDraft[i - 1], txDraft[i]] = [txDraft[i], txDraft[i - 1]]; paintTxEdit(); });
  $$('#tx-edit [data-xdel]').forEach(b => b.onclick = () => { txDraft.splice(+b.dataset.xdel, 1); paintTxEdit(); });
  $$('#tx-edit [data-xt]').forEach(b => b.onclick = () => {
    const t = T(b.dataset.xt); t.t = b.dataset.t;
    if (t.t === 'num') { t.unit = t.unit || 'pieds'; t.step = t.step || 0.5; } else if (!(t.o && t.o.length >= 2)) t.o = [['a', ''], ['b', '']];
    paintTxEdit();
  });
  $$('#tx-edit [data-xu]').forEach(x => x.onchange = () => { T(x.dataset.xu).unit = x.value; });
  $$('#tx-edit [data-xs]').forEach(x => x.onchange = () => { T(x.dataset.xs).step = +x.value; });
  $$('#tx-edit [data-xdef]').forEach(x => x.oninput = () => { T(x.dataset.xdef).def = x.value === '' ? null : +x.value; });
  $$('#tx-edit [data-xo]').forEach(x => x.oninput = () => { T(x.dataset.xo).o[+x.dataset.j][1] = x.value; });
  $$('#tx-edit [data-xodel]').forEach(b => b.onclick = () => { T(b.dataset.xodel).o.splice(+b.dataset.j, 1); paintTxEdit(); });
  $$('#tx-edit [data-xoadd]').forEach(b => b.onclick = () => { const t = T(b.dataset.xoadd); t.o.push(['o' + uid().slice(-5), '']); paintTxEdit(); });
}
$('#tx-add').onclick = () => { txDraft.push({ k: 'x' + uid().slice(-6), l: '', on: true, t: 'choice', o: [['a', ''], ['b', '']] }); paintTxEdit(); };
$('#tx-reset').onclick = () => { txDraft = JSON.parse(JSON.stringify(DEFAULT_TX)); paintTxEdit(); };
$('#tx-save').onclick = () => {
  const list = txDraft.map(t => ({ ...t, l: (t.l || '').trim(), o: t.t === 'num' ? undefined : (t.o || []).map(([v, l], j) => [v, (l || '').trim() || 'Choix ' + (j + 1)]) })).filter(t => t.l);
  if (list.some(t => t.t !== 'num' && t.o.length < 2)) { toast('Chaque caractéristique à choix doit avoir au moins 2 choix'); return; }
  cls().txc = list; save(); toast('Caractéristiques enregistrées · renvoyez la séance aux tablettes'); renderTxEdit();
};
function renderVidSettings() {
  $('#vid-rel').checked = !!S.settings.vid.rel; $('#vid-tg').checked = !!S.settings.vid.tg;
  $('#vid-delay-p').value = String(S.settings.vdelay || 5);
}
$('#vid-save').onclick = () => {
  S.settings.vid = { rel: $('#vid-rel').checked, tg: $('#vid-tg').checked }; S.settings.vdelay = +$('#vid-delay-p').value; save();
  toast(`Vidéo : relais à deux ${S.settings.vid.rel ? 'oui' : 'non'} · travail de groupe ${S.settings.vid.tg ? 'oui' : 'non'} · renvoyez la séance aux tablettes`, 3500);
};

/* ---- suppression groupée des performances (classe ouverte) ---- */
function paintBulk() {
  const c = cls(); if (!c) return;
  const keep = $('#del-day').value || 'all';
  const days = [...new Set([...c.sprints, ...c.passages].map(x => dayOf(x.ts)))].sort().reverse();
  $('#del-day').innerHTML = `<option value="all">Toutes les séances</option>` + days.map(d => `<option value="${d}">${dayLabel(d)}</option>`).join('');
  if ([...$('#del-day').options].some(o => o.value === keep)) $('#del-day').value = keep;
  const d = $('#del-day').value, inDay = x => d === 'all' || dayOf(x.ts) === d;
  const R = c.passages.filter(inDay);
  $('#del-class').textContent = '· ' + c.name;
  $('#del-n50').textContent = ` · ${c.sprints.filter(inDay).length} chrono(s)`;
  $('#del-nrel').textContent = ` · ${R.filter(p => p.les !== 'tg').length} relais à deux · ${R.filter(p => p.les === 'tg').length} travail de groupe`;
}
$('#del-day').onchange = paintBulk;
$$('[data-bulk]').forEach(b => b.onclick = () => {
  const c = cls(), k = b.dataset.bulk, d = $('#del-day').value || 'all', inDay = x => d === 'all' || dayOf(x.ts) === d;
  const pick = k === 'spr' ? c.sprints.filter(inDay)
    : c.passages.filter(p => inDay(p) && (k === 'allrel' || (k === 'tg' ? p.les === 'tg' : p.les !== 'tg')));
  const what = { spr: 'chrono(s) sur 50 m', rel: 'relais à deux', tg: 'passage(s) du travail de groupe', allrel: 'relais (toutes leçons)' }[k];
  if (!pick.length) { toast('Rien à supprimer'); return; }
  if (!confirm(`Supprimer définitivement ${pick.length} ${what}${d !== 'all' ? ' de la séance du ' + dayLabel(d) : ''} pour « ${c.name} » ?`)) return;
  if (!confirm('Confirmer la suppression ? Cette action ne peut pas être annulée.')) return;
  pick.forEach(x => delRun(c, x.id, true));
  if (k === 'spr' && d === 'all') c.b50ext = {};
  save(); paintBulk(); toast(`${pick.length} ${what} supprimé(s)`);
});

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
  let list = present(c);
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
    return `<button class="g-chip ${gPick === s.id ? 'pick' : ''} ${isAbs(c, s.id) ? 'abs' : ''}" data-chip="${esc(s.id)}"><span class="sex ${s.sexe || 'none'}" data-sexid="${esc(s.id)}" title="Toucher pour changer F / G">${s.sexe || '?'}</span> <b>${esc(dnStudent(c, s))}</b><span>${b != null ? fmt(b) + ' s' : '–'}</span></button>`;
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
  $('#g-list').innerHTML = present(c).sort(byFirst).map(s => `
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
  return c.students.filter(s => (!g.size || g.has(s.id)) && !isAbs(c, s.id)).sort(byFirst);
}
function relayStudents(c) {
  if (c.tgN && c.myTg.length && !isProf()) return c.students.filter(s => c.myTg.includes(c.tg[s.id]) && !isAbs(c, s.id)).sort(byFirst);
  return c.students.filter(s => !isAbs(c, s.id)).sort(byFirst);
}

/* =====================================================================
   LEÇON TRAVAIL DE GROUPE : groupes de 3 ou 4, tous les binômes (chaque élève démarreur ET relayeur),
   cible, indice de transmission, caractéristiques de la transmission notées à chaque passage
   ===================================================================== */
const DEFAULT_TX = [
  { k: 'md', l: 'Main du donneur', on: true, t: 'choice', o: [['D', 'Droite'], ['G', 'Gauche']] },
  { k: 'mr', l: 'Main du receveur', on: true, t: 'choice', o: [['D', 'Droite'], ['G', 'Gauche']] },
  { k: 'sens', l: 'Transmission', on: true, t: 'choice', o: [['M', 'Montante'], ['D', 'Descendante']] },
  { k: 'rep', l: 'Distance du repère de démarrage', on: true, t: 'num', unit: 'pieds', step: 0.5, def: 15 },
  { k: 'mom', l: 'Moment de la transmission', on: true, t: 'choice', o: [['D', 'Début de zone'], ['M', 'Milieu de zone'], ['F', 'Fin de zone']] }
];
const txAll = c => (c && c.txc && c.txc.length ? c.txc : DEFAULT_TX);
const txs = c => txAll(c).filter(t => t.on !== false);            // caractéristiques observées
const fpied = v => v == null ? '–' : String(v).replace('.', ',');
const txVal = (t, v) => v == null ? '' : t.t === 'num' ? v : ((t.o || []).find(o => o[0] === v) || [, '?'])[1];
const txShow = (t, v) => v == null ? '–' : t.t === 'num' ? `${fpied(v)} ${t.unit || ''}`.trim() : txVal(t, v);
const txHas = (c, x) => !!(x && txs(c).some(t => x[t.k] != null));
const txText = (c, x) => txHas(c, x) ? txs(c).filter(t => x[t.k] != null).map(t => txShow(t, x[t.k])).join(' · ') : '—';
const txSame = (c, a, b) => !!(a && b && txs(c).every(t => t.t === 'num' ? Math.abs((a[t.k] ?? 0) - (b[t.k] ?? 0)) <= (t.step || 0.5) : a[t.k] === b[t.k]));
function tgMembers(c, g, withAbs) { return c.students.filter(s => c.tg[s.id] === g && (withAbs || !isAbs(c, s.id))).sort(byFirst); }
function tgPairs(c, g) { const m = tgMembers(c, g), out = []; m.forEach(a => m.forEach(b => { if (a.id !== b.id) out.push([a.id, b.id]); })); return out; }
const pairPass = (c, d, r, list = c.passages) => list.filter(p => p.les === 'tg' && p.d === d && p.r === r);
function lastTx(c, d, r) { const l = pairPass(c, d, r).filter(p => txHas(c, p.tx)).sort((a, b) => b.ts - a.ts)[0]; return l ? { ...l.tx } : null; }
function txModal(c, list) { // caractéristiques les plus fréquentes et constance
  const t = list.filter(p => txHas(c, p.tx));
  if (!t.length) return { tx: null, n: 0, same: 0 };
  let best = t[0].tx, bn = 0;
  t.forEach(p => { const n = t.filter(q => txSame(c, p.tx, q.tx)).length; if (n > bn) { bn = n; best = p.tx; } });
  return { tx: best, n: t.length, same: bn };
}
function pairStats(c, d, r, list) {
  const P = pairPass(c, d, r, list), ok = P.filter(p => !p.fail && p.tEnd != null);
  const its = P.map(p => passIT(c, p)).filter(x => x != null), st = P.map(p => passStars(c, p)).filter(x => x != null);
  const best = ok.length ? ok.reduce((a, p) => teqOf(p) < teqOf(a) ? p : a) : null;
  return { P, n: P.length, best, bestIT: its.length ? Math.min(...its) : null, beat: P.filter(p => !p.fail && passStars(c, p) === 4).length,
    bestStars: st.length ? Math.max(...st) : null, meanStars: st.length ? st.reduce((a, b) => a + b, 0) / st.length : null, mod: txModal(c, P) };
}

/* ---- prof : constitution des groupes par cliquer-glisser ---- */
let tgColDraft = {}, tgDraft = {}, tgCount = 0, tgSel = new Set();
function renderTgroupes() {
  const c = cls();
  tgDraft = { ...c.tg }; tgColDraft = { ...(c.tgCol || {}) }; tgCount = c.tgN || Math.max(1, Math.ceil(present(c).length / 4)); tgSel = new Set();
  paintTg();
}
function paintTg() {
  const c = cls(), board = $('#tg-board');
  const chip = s => {
    const b = best50(c, s.id);
    return `<div class="g-chip ${tgSel.has(s.id) ? 'pick' : ''} ${isAbs(c, s.id) ? 'abs' : ''}" data-tchip="${esc(s.id)}">${sexBadge(s.sexe)} <b>${esc(dnStudent(c, s))}</b><span>${b != null ? fmt(b) + ' s' : '–'}</span></div>`;
  };
  board.innerHTML = Array.from({ length: tgCount + 1 }, (_, g) => g).map(g => {
    const mem = c.students.filter(s => (tgDraft[s.id] || 0) === g).sort((a, b) => (level(c, b.id) ?? -1e9) - (level(c, a.id) ?? -1e9));
    const bad = g && mem.length && (mem.length < 3 || mem.length > 4);
    return `<div class="g-col ${g === 0 ? 'none' : ''} ${bad ? 'bad' : ''}" data-tcol="${g}" ${g ? `style="border-top:6px solid ${GCOL[gColIdx(tgColDraft, g)][1]}"` : ''}>
      <div class="g-head">${g ? `<button class="gswatch" data-gsw="${g}" style="background:${GCOL[gColIdx(tgColDraft, g)][1]}" title="Changer la couleur"></button>Groupe ${g} · ${GCOL[gColIdx(tgColDraft, g)][0]}` : 'À placer'} <span>${mem.length} élève${mem.length > 1 ? 's' : ''}${g && mem.length ? ` · ${mem.length * (mem.length - 1)} binômes possibles` : ''}${bad ? ' · ⚠ 3 ou 4 conseillés' : ''}</span>${tgSel.size ? `<em>⬇ déposer ${tgSel.size > 1 ? `les ${tgSel.size} élèves` : 'ici'}</em>` : ''}</div>
      <div class="g-list">${mem.map(chip).join('') || '<span class="meta">Glissez des élèves ici</span>'}</div></div>`;
  }).join('');
  enableDrag(board);
  const rest = present(c).filter(s => !tgDraft[s.id]).length;
  $('#tg-sel-info').innerHTML = tgSel.size ? `<b>${tgSel.size} élève${tgSel.size > 1 ? 's' : ''} sélectionné${tgSel.size > 1 ? 's' : ''}</b> : glissez-les ou touchez le titre d'un groupe · <button class="btn ghost small" id="tg-unsel">Désélectionner</button>` : '';
  if ($('#tg-unsel')) $('#tg-unsel').onclick = () => { tgSel = new Set(); paintTg(); };
  $('#tg-rest').disabled = !rest; $('#tg-rest').textContent = rest ? `🪄 Placer les ${rest} élève${rest > 1 ? 's' : ''} restant${rest > 1 ? 's' : ''}` : '🪄 Tous les élèves sont placés';
}
function enableDrag(board) {
  board.querySelectorAll('[data-tchip]').forEach(ch => ch.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    const id = ch.dataset.tchip, moving = tgSel.has(id) ? [...tgSel] : [id], r = ch.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
    let ghost = null, moved = false;
    const over = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('[data-tcol]'); };
    const mv = ev => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 8) {
        moved = true; ghost = ch.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.style.width = r.width + 'px';
        if (moving.length > 1) { const n = document.createElement('span'); n.className = 'drag-n'; n.textContent = moving.length; ghost.appendChild(n); }
        document.body.appendChild(ghost);
      }
      if (!ghost) return;
      ghost.style.left = (ev.clientX - ox) + 'px'; ghost.style.top = (ev.clientY - oy) + 'px';
      ghost.style.visibility = 'hidden'; const col = over(ev.clientX, ev.clientY); ghost.style.visibility = '';
      board.querySelectorAll('.g-col').forEach(cl => cl.classList.toggle('over', cl === col));
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (ghost) ghost.remove();
      if (!moved) { tgSel.has(id) ? tgSel.delete(id) : tgSel.add(id); paintTg(); return; }   // toucher = sélectionner (plusieurs possibles)
      const col = over(ev.clientX, ev.clientY);
      if (col) { moving.forEach(m => { tgDraft[m] = +col.dataset.tcol; }); tgSel = new Set(); }
      paintTg();
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }));
  board.querySelectorAll('[data-gsw]').forEach(b => b.onclick = e => {
    e.stopPropagation(); const g = +b.dataset.gsw, cur = gColIdx(tgColDraft, g);
    const used = new Set(Array.from({ length: tgCount }, (_, i) => i + 1).filter(x => x !== g).map(x => gColIdx(tgColDraft, x)));
    let n = cur; for (let k = 1; k <= GCOL.length; k++) { n = (cur + k) % GCOL.length; if (!used.has(n)) break; }
    tgColDraft[g] = n; paintTg();
  });
  board.querySelectorAll('[data-tcol] .g-head').forEach(hd => hd.onclick = () => {
    if (!tgSel.size) return; const g = +hd.closest('[data-tcol]').dataset.tcol; tgSel.forEach(m => { tgDraft[m] = g; }); tgSel = new Set(); paintTg();
  });
}
function tgPropose(mode) {
  const c = cls(), mix = $('#tg-mix').checked;
  let list = present(c).sort((a, b) => (level(c, b.id) ?? -1e9) - (level(c, a.id) ?? -1e9));
  if (mode === 'alea') list.sort(() => Math.random() - 0.5);
  if (mix && mode !== 'homo') list = [...list.filter(s => s.sexe === 'F'), ...list.filter(s => s.sexe === 'G'), ...list.filter(s => !s.sexe)];
  const k = Math.max(1, Math.ceil(list.length / 4)); tgCount = k; tgDraft = {}; tgSel = new Set();
  if (mode === 'homo') {
    const base = Math.floor(list.length / k), extra = list.length % k; let i = 0;
    for (let g = 1; g <= k; g++) { const n = base + (g <= extra ? 1 : 0); for (let j = 0; j < n; j++) tgDraft[list[i++].id] = g; }
  } else list.forEach((s, i) => { const r = Math.floor(i / k), j = i % k; tgDraft[s.id] = mode === 'hetero' && r % 2 ? k - j : j + 1; });
  paintTg();
}
// Placer automatiquement les élèves restants : dans les groupes les moins remplis (4 au plus), sinon dans de nouveaux groupes
function tgFillRest() {
  const c = cls(), size = g => Object.entries(tgDraft).filter(([id, x]) => x === g && !isAbs(c, id)).length;
  const rest = present(c).filter(s => !tgDraft[s.id]).sort((a, b) => (level(c, b.id) ?? -1e9) - (level(c, a.id) ?? -1e9));
  if (!rest.length) return;
  const need = Math.max(0, Math.ceil((rest.length - Array.from({ length: tgCount }, (_, i) => Math.max(0, 4 - size(i + 1))).reduce((a, b) => a + b, 0)) / 4));
  tgCount += need;
  rest.forEach(s => {
    let best = null;
    for (let g = 1; g <= tgCount; g++) { const n = size(g); if (n < 4 && (best === null || n < size(best))) best = g; }
    if (best === null) { tgCount++; best = tgCount; }
    tgDraft[s.id] = best;
  });
  tgSel = new Set(); paintTg();
  toast(`${rest.length} élève(s) placé(s)`);
}
$('#tg-rest').onclick = tgFillRest;
$('#tg-alea').onclick = () => tgPropose('alea');
$('#tg-add').onclick = () => { tgCount++; paintTg(); };
$('#tg-del').onclick = () => { if (tgCount <= 1) return; Object.keys(tgDraft).forEach(k => { if (tgDraft[k] === tgCount) tgDraft[k] = 0; }); tgCount--; paintTg(); };
$('#tg-homo').onclick = () => tgPropose('homo');
$('#tg-hetero').onclick = () => tgPropose('hetero');
$('#tg-clear').onclick = () => { if (confirm('Retirer tous les élèves des groupes ?')) { tgDraft = {}; tgSel = new Set(); paintTg(); } };
function saveTg() {
  const c = cls(), sizes = {};
  Object.values(tgDraft).forEach(g => { if (g) sizes[g] = (sizes[g] || 0) + 1; });
  if (!Object.keys(sizes).length) { toast('Aucun élève dans les groupes'); return false; }
  const bad = Object.entries(sizes).filter(([, n]) => n < 3 || n > 4).map(([g]) => g);
  if (bad.length && !confirm(`Groupe(s) ${bad.join(', ')} : pas 3 ou 4 élèves. Valider quand même ?`)) return false;
  // numéros de groupes sans trou
  const used = [...new Set(Object.values(tgDraft).filter(Boolean))].sort((a, b) => a - b), ren = Object.fromEntries(used.map((g, i) => [g, i + 1]));
  c.tg = {}; Object.entries(tgDraft).forEach(([k, g]) => { if (g) c.tg[k] = ren[g]; });
  c.tgCol = {}; used.forEach(g => { c.tgCol[ren[g]] = gColIdx(tgColDraft, g); });
  c.tgN = used.length; save(); toast(`${c.tgN} groupes de travail validés`); return true;
}
$('#tg-save').onclick = () => { if (saveTg()) show(evlFlow ? 'evl' : 'menu'); };
$('#tg-send').onclick = () => { if (saveTg()) { sendKind = 'S'; show('send'); } };

/* ---- tablette : les binômes du groupe ---- */
let tgProfG = 1;
function renderTg() {
  const c = cls(); paintVidSet();
  if (!c.tgN) { $('#tg-head').innerHTML = `<div class="empty">${isProf() ? 'Constituez d\'abord les groupes de travail.' : 'En attente des groupes de travail du prof (📷 Recevoir la séance).'}</div>`; $('#tg-pairs').innerHTML = ''; $('#tg-gsel').innerHTML = ''; return; }
  // groupes accessibles : tous côté prof, ceux cochés côté élève ; on bascule de l'un à l'autre à tout moment
  const avail = isProf() ? Array.from({ length: c.tgN }, (_, i) => i + 1) : c.myTg;
  if (!avail.length) { show('eleve'); return; }
  if (!avail.includes(tgProfG)) tgProfG = avail[0];
  const g = tgProfG;
  $('#tg-gsel').innerHTML = (avail.length > 1 ? `<div class="seg tg-tabs">${avail.map(n => {
      const np = c.passages.filter(p => p.les === 'tg' && (p.grp || c.tg[p.d]) === n).length;
      return `<button data-tgg="${n}" class="${n === g ? 'on' : ''}">${gDot(c, n)}Groupe ${n} <small>${np} passage${np > 1 ? 's' : ''}</small></button>`; }).join('')}</div>` : '')
    + (isProf() ? '' : `<button class="btn ghost small" data-go="eleve">Choisir les groupes</button>`);
  $$('[data-tgg]').forEach(b => b.onclick = () => { tgProfG = +b.dataset.tgg; renderTg(); });
  const mem = tgMembers(c, g), pairs = tgPairs(c, g);
  $('#tg-info').textContent = `· Groupe ${g} · ${mem.length} élèves · ${pairs.length} binômes proposés`;
  $('#tg-head').innerHTML = `<div class="tg-mem">${mem.map(s => { const b = best50(c, s.id);
    return `<div class="tile mini"><span class="top"><span class="nom">${esc(dnStudent(c, s))}</span>${sexBadge(s.sexe)}</span>
      <span class="perf">${b != null ? `50 m : <b>${fmt(b)} s</b>` : '<span class="flag">pas de 50 m</span>'}</span><span class="rec" data-sid="${esc(s.id)}"></span></div>`; }).join('')}</div>`;
  // binôme conseillé : le moins de passages, puis les deux coureurs les plus reposés
  const D = S.settings.total;
  const info = pairs.map(([d, r]) => ({ d, r, st: pairStats(c, d, r), rest: Math.min(Date.now() - (lastEnd(c, d) || 0), Date.now() - (lastEnd(c, r) || 0)) }));
  const next = [...info].sort((a, b) => a.st.n - b.st.n || b.rest - a.rest)[0];
  $('#tg-pairs').innerHTML = info.map(x => {
    const cb = cible100(c, x.d, x.r), st = x.st, last = lastTx(c, x.d, x.r);
    const cons = st.mod.n >= 2 ? pct(st.mod.same, st.mod.n) : null;
    return `<button class="pair-card ${x === next ? 'next' : ''}" data-d="${esc(x.d)}" data-r="${esc(x.r)}">
      ${x === next ? '<span class="nx">▶ conseillé</span>' : ''}
      <span class="pc-names"><span class="role d">D</span> ${esc(dn(c, x.d))} <span class="arrow">➜</span> <span class="role r">R</span> ${esc(dn(c, x.r))}</span>
      <span class="pc-row"><span>🎯 ${cb != null ? fmt(cb * D / BASE) + ' s' : '–'}</span><span>${st.n} passage${st.n > 1 ? 's' : ''}</span>
        ${st.best ? `<span>meilleur ${fmt(st.best.tEnd)} s</span>` : ''}</span>
      <span class="pc-row">${st.bestStars != null ? starsHTML(st.bestStars) : '<span class="meta">pas encore couru</span>'}
        ${st.bestIT != null ? `<span class="${st.bestIT <= 0 ? 'ok' : 'ko'}">IT ${fit(st.bestIT)}</span>` : ''}
        ${st.n ? `<span>cible battue ${st.beat}/${st.n}</span>` : ''}</span>
      <span class="pc-tx">${last ? '✋ ' + esc(txText(c, last)) : 'caractéristiques à définir au 1er passage'}${cons != null ? ` · <b class="${cons >= 75 ? 'ok' : cons >= 50 ? 'mid' : 'ko'}">constance ${cons} %</b>` : ''}</span>
    </button>`;
  }).join('') || '<div class="empty">Pas assez d\'élèves dans ce groupe.</div>';
  $$('#tg-pairs .pair-card').forEach(b => b.onclick = () => {
    const ids = [b.dataset.d, b.dataset.r];
    const no50 = ids.filter(id => best50(c, id) == null);
    if (no50.length && !confirm(`${no50.map(id => dn(c, id)).join(' et ')} n'a/ont pas de temps sur 50 m : pas de cible. Lancer quand même ?`)) return;
    if (!recCheck(ids)) return;
    startRun(ids[0], ids[1], { les: 'tg', grp: g });
  });
  updateRec();
}

/* ---- évaluation : caractéristiques de la transmission ---- */
function renderTx(p) {
  const box = $('#e-tx');
  if (p.les !== 'tg') { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  p.tx = p.tx || {};
  const prev = p.txPrev;
  const c = cls(), list = txs(c);
  if (!list.length) { box.classList.add('hidden'); return; }
  box.innerHTML = `<h3>Caractéristiques de la transmission ${prev ? '<span class="meta">· reprises du passage précédent du binôme : modifiez seulement ce qui a changé</span>' : '<span class="meta">· premier passage du binôme</span>'}</h3>` +
    list.map(t => {
      const v = p.tx[t.k], pv = prev ? prev[t.k] : null;
      const changed = prev && v != null && pv != null && (t.t === 'num' ? Math.abs(v - pv) > 1e-9 : v !== pv);
      const st = t.step || 0.5, f = x => String(x).replace('.', ',');
      const ctl = t.t === 'num'
        ? `<div class="rep-ctl"><button class="btn ghost" data-num="${t.k}" data-d="${-2 * st}">−${f(2 * st)}</button><button class="btn ghost" data-num="${t.k}" data-d="${-st}">−${f(st)}</button>
            <b>${v == null ? '–' : fpied(v)} <small>${esc(t.unit || '')}</small></b>
            <button class="btn ghost" data-num="${t.k}" data-d="${st}">+${f(st)}</button><button class="btn ghost" data-num="${t.k}" data-d="${2 * st}">+${f(2 * st)}</button></div>`
        : `<div class="yn">${(t.o || []).map(([val, l]) => `<button class="btn opt ${v === val ? 'chosen' : ''}" data-tx="${t.k}" data-val="${esc(val)}">${esc(l)}</button>`).join('')}</div>`;
      return `<div class="tx-row ${v == null ? 'todo' : ''} ${changed ? 'changed' : ''}"><span class="tx-lbl">${esc(t.l)}${changed ? ' <em>⚠ modifié</em>' : ''}</span>${ctl}</div>`;
    }).join('');
  box.querySelectorAll('[data-tx]').forEach(b => b.onclick = () => { p.tx[b.dataset.tx] = b.dataset.val; save(); renderEval(); });
  box.querySelectorAll('[data-num]').forEach(b => b.onclick = () => {
    const t = list.find(x => x.k === b.dataset.num), st = t.step || 0.5, cur = p.tx[t.k];
    p.tx[t.k] = cur == null ? (t.def ?? 0) : Math.max(0, Math.round((cur + +b.dataset.d) / st) * st);
    p.tx[t.k] = Math.round(p.tx[t.k] * 100) / 100; save(); renderEval();
  });
}

/* ---- bilan du travail de groupe ---- */
function renderTgBilan(c, list) {
  const T = list.filter(p => p.les === 'tg'), el = $('#b-tg');
  if (!T.length) { el.innerHTML = ''; return; }
  const groups = [...new Set([...T.map(p => p.grp || c.tg[p.d] || 0)])].sort((a, b) => a - b);
  el.innerHTML = `<div class="row between wrap"><h2>Travail de groupe <small>${T.length} passages</small></h2>
      <button class="btn primary small" data-pdf="all">📄 Récapitulatif PDF de tous les groupes</button></div>` + groups.map(g => {
    const P = T.filter(p => (p.grp || c.tg[p.d] || 0) === g);
    const pairs = [...new Set([...(c.tg && g ? tgPairs(c, g) : []).map(x => x.join('>')), ...P.map(p => p.d + '>' + p.r)])].map(k => k.split('>'));
    const its = P.map(p => passIT(c, p)).filter(x => x != null), st = P.map(p => passStars(c, p)).filter(x => x != null);
    const allMod = pairs.map(([d, r]) => txModal(c, pairPass(c, d, r, P))).filter(m => m.n >= 2);
    const cons = allMod.length ? pct(allMod.reduce((a, m) => a + m.same, 0), allMod.reduce((a, m) => a + m.n, 0)) : null;
    return `<div class="card tg-card"><div class="row between wrap"><h3 style="margin:0">${gDot(c, g)}${g ? gLbl(c, g) : 'Groupe ?'} <span class="meta">${tgMembers(c, g).map(s => esc(dnStudent(c, s))).join(' · ')}</span></h3>
      <div class="tg-kpi"><button class="btn ghost small" data-pdf="${g}">📄 PDF du groupe ${g}</button><span>🎯 cible battue <b>${P.filter(p => !p.fail && passStars(c, p) === 4).length}/${P.length}</b></span><span>★ moyennes <b>${st.length ? fnum(st.reduce((a, b) => a + b, 0) / st.length) : '–'}</b></span><span>✋ constance <b>${cons != null ? cons + ' %' : '–'}</b></span></div></div>
      <div class="table-wrap flat"><table><tr><th style="text-align:left">Binôme</th><th>Passages</th><th>Cible</th><th>Meilleur temps</th><th>Meilleur IT</th><th>Étoiles<br><small>meilleure · moy.</small></th><th>Cible battue</th><th style="text-align:left">Caractéristiques habituelles</th><th>Constance</th></tr>
      ${pairs.map(([d, r]) => { const s2 = pairStats(c, d, r, P), cb = cible100(c, d, r);
        const k = s2.mod.n >= 2 ? pct(s2.mod.same, s2.mod.n) : null;
        return `<tr class="${s2.n ? '' : 'none'}"><td class="name">${esc(dn(c, d))} ➜ ${esc(dn(c, r))}</td><td>${s2.n}</td>
          <td>${cb != null ? fmt(cb * S.settings.total / BASE) + ' s' : '–'}</td><td>${s2.best ? fmt(s2.best.tEnd) + ' s' : '–'}</td>
          <td>${s2.bestIT != null ? `<span class="chip ${s2.bestIT <= 0 ? 'hi' : s2.bestIT <= 0.5 ? 'mid' : 'lo'}">${fit(s2.bestIT)}</span>` : '–'}</td>
          <td>${s2.bestStars != null ? `<span class="st">${'★'.repeat(s2.bestStars)}</span> · ${fnum(s2.meanStars)}` : '–'}</td>
          <td>${s2.n ? `${s2.beat}/${s2.n}` : '–'}</td>
          <td style="text-align:left;white-space:normal">${esc(txText(c, s2.mod.tx))}</td>
          <td>${k != null ? `<span class="chip ${k >= 75 ? 'hi' : k >= 50 ? 'mid' : 'lo'}">${k} %</span>` : '–'}</td></tr>`; }).join('')}</table></div></div>`;
  }).join('');
  el.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => tgPdf(b.dataset.pdf === 'all' ? groups.filter(Boolean) : [+b.dataset.pdf]));
}
function tgPairRows(c, list) {
  const T = list.filter(p => p.les === 'tg'); const rows = [['Groupe', 'Binôme (démarreur ➜ relayeur)', 'Passages', 'Cible (s)', 'Meilleur temps (s)', 'Meilleur IT (s)', 'Meilleures étoiles', 'Étoiles moyennes', 'Cible battue', 'Caractéristiques habituelles', 'Constance (%)']];
  const keys = [...new Set(T.map(p => (p.grp || 0) + '§' + p.d + '>' + p.r))].sort();
  keys.forEach(k => { const [g, pr] = k.split('§'), [d, r] = pr.split('>'), s2 = pairStats(c, d, r, T.filter(p => String(p.grp || 0) === g)), cb = cible100(c, d, r);
    rows.push([+g || '', `${dn(c, d)} ➜ ${dn(c, r)}`, s2.n, cb != null ? +(cb * S.settings.total / BASE / 1000).toFixed(2) : '', s2.best ? +(s2.best.tEnd / 1000).toFixed(2) : '',
      s2.bestIT ?? '', s2.bestStars ?? '', s2.meanStars != null ? +s2.meanStars.toFixed(1) : '', `${s2.beat}/${s2.n}`, txText(c, s2.mod.tx), s2.mod.n >= 2 ? pct(s2.mod.same, s2.mod.n) : '']); });
  return rows;
}

/* ---- récapitulatif PDF des caractéristiques par groupe (pour les élèves, sans pied de page) ---- */
function pdfSafe(t) { return String(t ?? '').replace(/[➜→]/g, '->').replace(/[−–]/g, '-').replace(/★/g, '*').replace(/[✓✔]/g, 'v').replace(/[✗✕]/g, 'x').replace(/[^\x00-\xFF€’œŒ]/g, ''); }
function bestPass(c, P) { // passage de référence : meilleur indice technique (puis le plus récent)
  const ok = P.filter(p => !p.fail && passIT(c, p) != null && txHas(c, p.tx));
  return ok.length ? ok.reduce((a, p) => passIT(c, p) < passIT(c, a) || (passIT(c, p) === passIT(c, a) && p.ts > a.ts) ? p : a) : null;
}
function tgPdf(groups) {
  if (!window.jspdf) { toast('Module PDF indisponible'); return; }
  const c = cls(), D = S.settings.total, TXL = txs(c);
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14, navy = [2, 36, 98], blue = [5, 97, 209], orange = [242, 150, 70], grey = [91, 107, 134];
  let y = 0;
  const T = (txt, x, yy, o = {}) => doc.text(pdfSafe(txt), x, yy, o);
  const need = h => { if (y + h > 285) { doc.addPage(); y = 16; } };
  groups.forEach((g, gi) => {
    if (gi) doc.addPage();
    y = 16;
    const mem = tgMembers(c, g, true), all = c.passages.filter(p => p.les === 'tg' && (p.grp || c.tg[p.d]) === g);
    doc.setFillColor(...navy); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); T(`Groupe ${g} - Caractéristiques de la transmission`, M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); T(`${c.name} · Zones Relais · récapitulatif au ${new Date().toLocaleDateString('fr-FR')} · relais de ${D} m, zone de ${S.settings.zt} m`, M, 20);
    y = 34; doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); T('Coureurs du groupe', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); y += 6;
    T(mem.map(s => { const b = best50(c, s.id); return `${dnStudent(c, s)} (${b != null ? fmt(b) + ' s au 50 m' : 'pas de 50 m'})`; }).join('   ·   '), M, y, { maxWidth: W - 2 * M }); y += 8;
    doc.setTextColor(...grey); doc.setFontSize(9);
    T('Objectifs : battre la cible (50 m du démarreur + 50 m du relayeur - 0,3 s), obtenir le maximum d\'étoiles, garder les mêmes caractéristiques de transmission.', M, y, { maxWidth: W - 2 * M }); y += 14;
    const pairs = []; mem.forEach(a => mem.forEach(b => { if (a.id !== b.id) pairs.push([a.id, b.id]); }));
    pairs.sort((x, z) => pairPass(c, z[0], z[1], all).length - pairPass(c, x[0], x[1], all).length);
    pairs.forEach(([d, r]) => {
      const P = pairPass(c, d, r, all).sort((a, b) => a.ts - b.ts), st = pairStats(c, d, r, all), cb = cible100(c, d, r);
      const ref = bestPass(c, P), mod = st.mod, cons = mod.n >= 2 ? pct(mod.same, mod.n) : null;
      const rows = P.length + 1, h = 22 + (P.length ? 10 + TXL.length * 5 + rows * 5.5 : 6);
      need(Math.min(h, 120));
      doc.setFillColor(238, 244, 252); doc.roundedRect(M, y - 5, W - 2 * M, 9, 2, 2, 'F');
      doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      T(`${dn(c, d)}  ->  ${dn(c, r)}`, M + 3, y + 1.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...grey);
      T(`Démarreur -> relayeur · cible ${cb != null ? fmt(cb * D / BASE) + ' s' : '-'}`, W - M - 3, y + 1.5, { align: 'right' }); y += 10;
      if (!P.length) { doc.setTextColor(...grey); T('Pas encore couru : caractéristiques à définir.', M + 3, y); y += 8; return; }
      doc.setTextColor(...navy); doc.setFontSize(9.5);
      T(`${P.length} passage(s) · meilleur temps ${st.best ? fmt(st.best.tEnd) + ' s' : '-'} · meilleur IT ${fit(st.bestIT)} · meilleures étoiles ${st.bestStars ?? '-'}/4 · cible battue ${st.beat}/${st.n}${cons != null ? ` · constance ${cons} %` : ''}`, M + 3, y); y += 6;
      // réglages conseillés (passage au meilleur IT) et habituels
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...blue); T('Réglages à reprendre (meilleur passage)', M + 3, y);
      doc.setTextColor(...orange); T('Réglages habituels', M + 100, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      TXL.forEach(t => {
        T(`${t.l} : ${ref ? txShow(t, ref.tx[t.k]) : '-'}`, M + 5, y);
        T(`${mod.tx ? txShow(t, mod.tx[t.k]) : '-'}`, M + 102, y); y += 5;
      });
      y += 2;
      // tableau des passages
      const cols = [['Date', 22], ['Temps', 16], ['IT', 16], ['Étoiles', 14], ...TXL.map(t => [t.l, Math.max(18, (W - 2 * M - 68) / Math.max(1, TXL.length))])];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      const hl = cols.map(([l, w]) => doc.splitTextToSize(pdfSafe(l), w - 1.5)), hh = Math.max(...hl.map(a => a.length)) * 3.2 + 2.5;
      need(hh + 8);
      let x = M; doc.setFillColor(...navy); doc.rect(M, y - 4, W - 2 * M, hh, 'F'); doc.setTextColor(255);
      hl.forEach((lines, j) => { doc.text(lines, x + 1, y - 0.5); x += cols[j][1]; }); y += hh;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      P.forEach((p, i) => {
        const it = passIT(c, p), stars = passStars(c, p);
        const cells = [new Date(p.ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(p.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          p.fail ? 'raté' : fmt(p.tEnd) + ' s', fit(it), stars != null ? '*'.repeat(stars) : '-', ...TXL.map(t => p.tx ? txShow(t, p.tx[t.k]) : '-')];
        if (p === ref) doc.setFont('helvetica', 'bold');
        const cl = cells.map((v, j) => doc.splitTextToSize(pdfSafe(v), cols[j][1] - 1.5)), rh = Math.max(...cl.map(a => a.length)) * 3.3 + 2.2;
        need(rh);
        if (i % 2) { doc.setFillColor(246, 249, 253); doc.rect(M, y - 3.6, W - 2 * M, rh, 'F'); }
        x = M; doc.setTextColor(p === ref ? blue[0] : 30, p === ref ? blue[1] : 30, p === ref ? blue[2] : 30);
        cl.forEach((lines, j) => { doc.text(lines, x + 1, y); x += cols[j][1]; });
        doc.setFont('helvetica', 'normal'); y += rh;
      });
      y += 5;
    });
  });
  const name = groups.length === 1 ? `Transmission_Groupe${groups[0]}_${safeName(c.name)}.pdf` : `Transmission_groupes_${safeName(c.name)}.pdf`;
  deliver(doc.output('blob'), name);
}

/* =====================================================================
   EFFACER UN TEMPS (50 m ou relais) – depuis la tuile de l'élève ou le bilan
   ===================================================================== */
function delRun(c, id, silent) {
  const n0 = c.sprints.length + c.passages.length;
  c.sprints = c.sprints.filter(x => x.id !== id); c.passages = c.passages.filter(x => x.id !== id);
  c.deleted = c.deleted || []; if (!c.deleted.includes(id)) c.deleted.push(id);   // transmis au prof avec « Envoyer mes résultats »
  if (!silent) save();
  return n0 - (c.sprints.length + c.passages.length);
}
function runsModal(sid, after) {
  const c = cls();
  const paint = () => {
    const spr = c.sprints.filter(x => x.sid === sid).sort((a, b) => b.ts - a.ts);
    const rel = c.passages.filter(p => p.d === sid || p.r === sid).sort((a, b) => b.ts - a.ts);
    const best = best50(c, sid, c.sprints);
    const when = ts => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const m = modal(`<h2 style="margin-top:0">${esc(dn(c, sid))}</h2>
      <h3>① 50 m <small class="meta">${spr.length} essai(s)</small></h3>
      <div class="list">${spr.map(x => `<div class="list-item"><div class="grow"><b>${fmt(x.t)} s</b>${x.t === best ? ' <span class="tag st">meilleur</span>' : ''}
        <div class="meta">${when(x.ts)} · ${esc(x.tablet || 'tablette')}</div></div><button class="btn danger-ghost small" data-del="${x.id}">Effacer</button></div>`).join('') || '<span class="meta">Aucun temps.</span>'}</div>
      <h3 style="margin-top:14px">② Relais <small class="meta">${rel.length} course(s)</small></h3>
      <div class="list">${rel.map(p => { const st = passStars(c, p); return `<div class="list-item ${p.fail ? 'failed' : ''}"><div class="grow">
        <b>${p.fail ? 'Raté' : fmt(p.tEnd) + ' s'}</b> ${st != null ? `<span class="tag st">${'★'.repeat(st)}</span>` : ''}
        <div class="meta">${p.d === sid ? 'Démarreur' : 'Relayeur'} avec ${esc(dn(c, p.d === sid ? p.r : p.d, p.d === sid ? p.rSnap : p.dSnap))} · ${when(p.ts)} · ${esc(p.tablet || 'tablette')}</div></div>
        <button class="btn danger-ghost small" data-del="${p.id}">Effacer</button></div>`; }).join('') || '<span class="meta">Aucun relais.</span>'}</div>
      <p class="hint">Effacer un relais l'efface aussi pour le partenaire. ${isProf() ? '' : 'L\'effacement est transmis au prof au prochain « Envoyer mes résultats ».'}</p>
      <div class="row center"><button class="btn primary" data-close>Fermer</button></div>`);
    m.classList.add('wide');
    m.querySelector('[data-close]').onclick = () => { closeModal(); after && after(); };
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const isRel = c.passages.some(p => p.id === b.dataset.del);
      if (!confirm(isRel ? 'Effacer ce relais (pour les deux élèves) ?' : 'Effacer ce temps sur 50 m ?')) return;
      delRun(c, b.dataset.del); toast('Temps effacé'); paint();
    });
  };
  paint();
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
      ${n || c.passages.some(p => p.d === s.id || p.r === s.id) ? `<span class="tile-del" data-runs="${esc(s.id)}" title="Voir / effacer ses temps">🗑</span>` : ''}
    </button>`;
  }).join('') : '<div class="empty">Aucun élève.</div>';
  $$('#sp-tiles .tile').forEach(t => t.onclick = e => { const r = e.target.closest('[data-runs]'); if (r) runsModal(r.dataset.runs, renderSprintTiles); else spPick(t.dataset.id); });
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
  $('#group-info').innerHTML = c.tgN && c.myTg.length && !isProf() ? `· Groupe${c.myTg.length > 1 ? 's' : ''} ${c.myTg.join(', ')} · ${list.length} élèves` : `· ${list.length} élèves`;
  $('#rel-group').classList.toggle('hidden', isProf() || !c.tgN);
  paintVidSet();
  el.innerHTML = list.length ? list.map(s => {
    const n = c.passages.filter(p => p.d === s.id || p.r === s.id).length, b = best50(c, s.id);
    const role = sel.d === s.id ? 'd' : sel.r === s.id ? 'r' : '';
    return `<button class="tile ${role ? 'sel-' + role : ''}" data-id="${esc(s.id)}">
      ${role ? `<span class="role ${role} badge">${role.toUpperCase()}</span>` : ''}
      <span class="top"><span class="nom">${esc(dnStudent(c, s))}</span>${sexBadge(s.sexe)}</span>
      <span class="perf">${b != null ? `50 m : <b>${fmt(b)} s</b>` : '<span class="flag">pas de 50 m</span>'}</span>
      <span class="foot"><span class="count">${n}/4 course${n > 1 ? 's' : ''}</span><span class="rec" data-sid="${esc(s.id)}"></span></span>
      ${n || c.sprints.some(x => x.sid === s.id) ? `<span class="tile-del" data-runs="${esc(s.id)}" title="Voir / effacer ses temps">🗑</span>` : ''}
    </button>`;
  }).join('') : '<div class="empty">Aucun élève.</div>';
  el.querySelectorAll('.tile').forEach(t => t.onclick = e => { const r = e.target.closest('[data-runs]'); if (r) runsModal(r.dataset.runs, renderTiles); else pick(t.dataset.id); });
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

/* =====================================================================
   VIDÉO DIFFÉRÉE (facultative) : la tablette filme le relais, puis le rejoue
   après quelques secondes, critères incrustés sur la vidéo.
   La vidéo reste en mémoire le temps de l'évaluation : jamais enregistrée ni envoyée.
   ===================================================================== */
const VID = { stream: null, rec: null, chunks: [], t0: 0, url: null, marks: null, pid: null, busy: false, timer: null };
const vidOK = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const vidOn = r => !!(r && r.les !== 'ev' && S.settings.vid && (r.les === 'tg' ? S.settings.vid.tg : S.settings.vid.rel));
function paintVidSet() {
  $('#vid-flag-rel').classList.toggle('hidden', !(S.settings.vid && S.settings.vid.rel));
  $('#vid-flag-tg').classList.toggle('hidden', !(S.settings.vid && S.settings.vid.tg));
}
async function vidStart() {
  if (!vidOn(run) || !vidOK()) return;
  try {
    if (!VID.stream) VID.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const pv = $('#c-preview'); if (pv.srcObject !== VID.stream) { pv.srcObject = VID.stream; pv.play().catch(() => {}); }
    $('#c-camstate').textContent = run && run.t0 !== null ? '● enregistrement' : 'prête : l\'enregistrement démarre au top « Début »';
  } catch (e) {
    $('#c-camstate').textContent = 'caméra refusée ou indisponible : vidéo désactivée';
  }
}
function vidRecord() {
  if (!vidOn(run) || !VID.stream) return;
  vidDiscard();
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  try { VID.rec = new MediaRecorder(VID.stream, mime ? { mimeType: mime } : undefined); } catch (e) { return; }
  VID.chunks = []; VID.mime = VID.rec.mimeType || mime || 'video/mp4';
  VID.rec.ondataavailable = e => { if (e.data && e.data.size) VID.chunks.push(e.data); };
  VID.rec.start(250); VID.t0 = performance.now();
  $('#c-camstate').textContent = '● enregistrement';
}
function vidDiscard() { if (VID.rec && VID.rec.state !== 'inactive') { VID.rec.ondataavailable = null; VID.rec.onstop = null; try { VID.rec.stop(); } catch (e) {} } VID.rec = null; VID.chunks = []; }
function vidOff() { vidDiscard(); if (VID.stream) VID.stream.getTracks().forEach(t => t.stop()); VID.stream = null; }
function vidClear() { clearInterval(VID.timer); if (VID.url) URL.revokeObjectURL(VID.url); VID.url = null; VID.marks = null; VID.pid = null; VID.busy = false; $('#e-video').innerHTML = ''; delete $('#e-video').dataset.pid; }
function vidFinish(pid, r, failed) {
  vidClear();
  if (!VID.rec || VID.rec.state === 'inactive') return;
  const off = (r.t0 - VID.t0) / 1000, m = r.marks;
  VID.marks = { start: off, in: m[0] != null ? off + m[0] / 1000 : null, out: m[1] != null ? off + m[1] / 1000 : null,
    end: off + (m[2] != null ? m[2] : (performance.now() - r.t0)) / 1000 };
  VID.pid = pid; VID.busy = true;
  const rec = VID.rec;
  setTimeout(() => {   // on garde 1 s après l'arrivée
    rec.onstop = () => {
      VID.busy = false;
      if (VID.pid !== pid) return;
      VID.url = URL.createObjectURL(new Blob(VID.chunks, { type: VID.mime }));
      VID.rec = null;
      if (view === 'eval') renderEval();
    };
    try { rec.stop(); } catch (e) { VID.busy = false; }
  }, 1000);
}
function renderVideoBox(p) {
  const box = $('#e-video');
  if (VID.pid !== p.id || (!VID.url && !VID.busy)) { if (box.innerHTML) { box.innerHTML = ''; delete box.dataset.pid; } return; }
  if (!VID.url) { box.innerHTML = `<div class="vbox wait"><div class="v-count">🎥 Préparation de la vidéo…</div><div class="v-overlay" id="v-crit"></div></div>`; box.dataset.pid = ''; return; }
  if (box.dataset.pid === p.id) return;          // déjà en place : on ne relance pas la vidéo
  box.dataset.pid = p.id;
  const M = VID.marks, dur = M.end + 1;
  const pc = t => Math.max(0, Math.min(100, t / dur * 100));
  box.innerHTML = `<div class="vbox">
    <video id="e-vid" playsinline webkit-playsinline muted preload="auto" src="${VID.url}"></video>
    <div class="v-count" id="v-count"></div>
    <div class="v-top">
      <button class="vb" data-vj="start">↺ Revoir</button>
      ${M.in != null ? `<button class="vb" data-vj="zone">🐢 Zone au ralenti</button>` : ''}
      <button class="vb" data-vj="pause">⏯</button>
      <button class="vb" data-vj="hide">👁 Critères</button>
    </div>
    <div class="v-line"><div class="v-prog" id="v-prog"></div>
      <i style="left:${pc(M.start)}%" title="Début"></i>${M.in != null ? `<i class="z" style="left:${pc(M.in)}%;width:${M.out != null ? pc(M.out) - pc(M.in) : 1}%"></i>` : ''}<i style="left:${pc(M.end)}%" title="Arrivée"></i></div>
    <div class="v-overlay" id="v-crit"></div>
  </div>`;
  const v = $('#e-vid');
  let stopAt = null;
  // vidéo webm (Chrome/Android) : durée inconnue tant qu'on n'a pas sauté à la fin → on force le calcul
  let ready = false;
  const whenReady = fn => ready ? fn() : (v._q = (v._q || []).concat(fn));
  v.onloadedmetadata = () => {
    const done = () => { ready = true; (v._q || []).forEach(f => f()); v._q = []; };
    if (v.duration === Infinity || isNaN(v.duration)) {
      v.ondurationchange = () => { if (v.duration !== Infinity && !isNaN(v.duration)) { v.ondurationchange = null; v.currentTime = 0; done(); } };
      v.currentTime = 1e6;
    } else done();
  };
  v.ontimeupdate = () => {
    const pg = $('#v-prog'); if (!pg) return;
    pg.style.width = pc(v.currentTime) + '%';
    if (stopAt != null && v.currentTime >= stopAt) { v.pause(); v.playbackRate = 1; stopAt = null; }
  };
  const play = (from, rate = 1, until = null) => whenReady(() => { v.currentTime = Math.max(0, from); v.playbackRate = rate; stopAt = until; v.play().catch(() => {}); });
  box.querySelectorAll('[data-vj]').forEach(b => b.onclick = () => {
    clearInterval(VID.timer); $('#v-count').textContent = '';
    const j = b.dataset.vj;
    if (j === 'start') play(M.start - 0.5);
    else if (j === 'zone') play(M.in - 1, 0.5, (M.out ?? M.in + 2) + 1);
    else if (j === 'pause') v.paused ? v.play().catch(() => {}) : v.pause();
    else if (j === 'hide') box.querySelector('.vbox').classList.toggle('no-ov');
  });
  // relecture différée
  let n = S.settings.vdelay || 5;
  $('#v-count').textContent = `Relecture dans ${n} s`;
  VID.timer = setInterval(() => {
    n--;
    if (n > 0) { $('#v-count').textContent = `Relecture dans ${n} s`; return; }
    clearInterval(VID.timer); $('#v-count').textContent = ''; play(M.start - 0.5);
  }, 1000);
}

let run = null, raf = null, wake = null;
function startRun(d, r, opt = {}) { run = { d, r, t0: null, marks: [], les: opt.les || null, grp: opt.grp || null }; sel = { d: null, r: null }; show('chrono'); requestWake(); }
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
  if (run.les === 'tg') { $('#tb-main').textContent = '③ Travail de groupe'; $('#tb-sub').textContent = `Groupe ${run.grp} · chronomètre`; }
  if (run.les === 'ev') { $('#tb-main').textContent = '④ Évaluation'; $('#tb-sub').textContent = `${run.grp ? 'Groupe ' + run.grp + ' · ' : ''}chronomètre avec zone de transmission`; }
  $('#c-cam').classList.toggle('hidden', !vidOn(run));
  if (vidOn(run)) vidStart();
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
  if (run.t0 === null) { run.t0 = now; tick(); vidRecord(); } else run.marks.push(now - run.t0);
  if (navigator.vibrate) navigator.vibrate(30);
  renderChrono(); updateRec();
  if (run.marks.length === 3) { run.endAt = Date.now(); cancelAnimationFrame(raf); setTimeout(() => toEval(false), 350); }
}));
$('#c-fail').onclick = () => { if (run && run.t0 !== null) { run.endAt = Date.now(); cancelAnimationFrame(raf); toEval(true); } };
$('#c-undo').onclick = () => {
  if (!run) return;
  if (run.marks.length) run.marks.pop(); else if (run.t0 !== null) { run.t0 = null; vidDiscard(); }
  cancelAnimationFrame(raf); renderChrono(); if (run.t0 !== null) tick();
};
$('#c-reset').onclick = () => { if (!run) return; run.t0 = null; run.marks = []; cancelAnimationFrame(raf); vidDiscard(); renderChrono(); };
$('#c-cancel').onclick = () => {
  if (run && run.t0 !== null && !confirm('Revenir aux élèves sans enregistrer ? (si le passage a échoué, utilisez « Passage raté »)')) return;
  const back = run && run.les === 'tg' ? 'tg' : run && run.les === 'ev' ? 'evl' : 'tiles';
  run = null; stopClock(); vidDiscard(); show(back);
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
    cible: cible100(c, run.d, run.r), fail: failed ? '' : null, c: {}, cfg: { total, zt },
    ...(run.les === 'tg' ? { les: 'tg', grp: run.grp, tx: lastTx(c, run.d, run.r) || {}, txPrev: lastTx(c, run.d, run.r) } : run.les === 'ev' ? { les: 'ev', grp: run.grp } : {})
  });
  vidFinish(S.pending.id, run, failed);
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
    <div class="verdict ${gapCls(p.gap)}">Écart : ${fgap(p.gap)} ${p.gap > 0 ? '(plus rapide dans la zone)' : '(plus lent dans la zone)'}${p.les === 'ev' ? ` → <b>${ztPts(p.gap)}/4 pts</b> zone (note EPS)` : ''}</div>`
    : `<h3>Écart de vitesse dans la Zt</h3><p class="hint">Non calculable (chronométrage incomplet).</p>`;
  renderTx(p);
  if (p.les === 'tg') { $('#tb-main').textContent = '③ Travail de groupe'; $('#tb-sub').textContent = `Groupe ${p.grp} · critères et caractéristiques`; }
  if (p.les === 'ev') { $('#tb-main').textContent = '④ Évaluation'; $('#tb-sub').textContent = `${p.grp ? 'Groupe ' + p.grp + ' · ' : ''}résultat du passage`; }
  $('#e-fail').classList.toggle('hidden', p.fail === null);
  $('#fail-btns').innerHTML = FAILS.map(f => `<button class="btn no ${p.fail === f.k ? 'chosen' : ''}" data-fail="${f.k}">${f.label}</button>`).join('');
  $$('#fail-btns .btn').forEach(b => b.onclick = () => { p.fail = b.dataset.fail; save(); renderEval(); });
  const withVid = VID.pid === p.id && (VID.url || VID.busy);
  renderVideoBox(p);
  $('#e-crits').innerHTML = withVid || p.les === 'ev' ? '' : critHTML(c, p, false);
  if (withVid) $('#v-crit').innerHTML = critHTML(c, p, true) + `<div class="v-save">${missing(p).length ? `<span>🔒 ${missing(p).length} à renseigner</span>` : '<button class="btn primary" id="v-save">✓ Enregistrer le passage</button>'}</div>`;
  $$('#e-crits [data-k], #v-crit [data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    p.c[k] = b.dataset.v !== undefined ? b.dataset.v === '1' : b.dataset.s !== undefined ? +b.dataset.s : +b.dataset.o;
    save(); renderEval();
  });
  if ($('#v-save')) $('#v-save').onclick = () => $('#e-save').onclick();
  const miss = missing(p);
  $('#e-save').disabled = miss.length > 0;
  $('#e-status').innerHTML = miss.length
    ? `<span class="warn">🔒 Encore ${miss.length} élément${miss.length > 1 ? 's' : ''} à renseigner avant le binôme suivant</span>`
    : `<span class="okmsg">✓ Tout est renseigné</span>`;
}
function critHTML(c, p, compact) {
  return crits(c).map((cr, i) => {
    const v = p.c[cr.k], t = ctype(cr);
    let ctl;
    if (t === 'scale') ctl = `<div class="scale10">${Array.from({ length: 10 }, (_, j) => j + 1).map(n => `<button class="sc ${v === n ? 'chosen' : ''}" data-k="${cr.k}" data-s="${n}" style="--h:${(n - 1) * 13}">${n}</button>`).join('')}</div>
      ${compact ? '' : '<div class="scale-legend"><span>1 · moins bien</span><span>10 · parfait</span></div>'}`;
    else if (t === 'free') ctl = `<div class="yn free">${(cr.o || []).map((o, j) => `<button class="btn opt ${v === j ? 'chosen' : ''}" data-k="${cr.k}" data-o="${j}">${esc(o)}</button>`).join('')}</div>`;
    else ctl = `<div class="yn"><button class="btn yes ${v === true ? 'chosen' : ''}" data-k="${cr.k}" data-v="1">Oui</button>
        <button class="btn no ${v === false ? 'chosen' : ''}" data-k="${cr.k}" data-v="0">Non</button></div>`;
    return compact ? `<div class="v-row ${v === undefined ? 'todo' : ''}"><span class="v-lbl">${i + 1}. ${esc(cr.l)}</span>${ctl}</div>`
      : `<div class="card crit ${v === undefined ? 'todo' : ''}"><h3>${i + 1}. ${esc(cr.l)}</h3>${ctl}</div>`;
  }).join('');
}
function missing(p) {
  const m = p.les === 'ev' ? [] : crits(cls()).filter(cr => p.c[cr.k] === undefined).map(cr => cr.k);
  if (p.fail === '') m.unshift('fail');
  if (p.les === 'tg') txs(cls()).forEach(t => { if (!p.tx || p.tx[t.k] == null) m.push('tx'); });
  return m;
}
function flashMissing() {
  if (view !== 'eval') return;
  $$('#e-crits .crit.todo, #v-crit .v-row.todo, #e-tx .tx-row.todo, #e-fail').forEach(el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
  const first = $('#e-crits .crit.todo'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const gapCls = g => GAP_BINS.find(b => b.test(g)).cls;
$('#e-save').onclick = () => {
  const p = S.pending; if (!p) return;
  if (missing(p).length) { toast('Renseignez tous les critères'); flashMissing(); return; }
  cls().passages.push(p); S.pending = null; save(); vidClear();
  delete p.txPrev;
  toast(p.fail ? 'Passage raté enregistré (1 ★)' : `Passage enregistré${p.stars ? ' · ' + '★'.repeat(p.stars) : ''}`);
  show(p.les === 'tg' ? 'tg' : p.les === 'ev' ? 'evl' : 'tiles');
};
$('#e-redo').onclick = () => {
  const p = S.pending; if (!p) return;
  if (!confirm('Erreur de chronométrage ? Ce passage sera effacé et le chrono relancé pour le même binôme.')) return;
  S.pending = null; save(); vidClear(); startRun(p.d, p.r, { les: p.les, grp: p.grp });
};

/* =====================================================================
   PROF : BILAN CHIFFRÉ
   ===================================================================== */
function filtered(c) {
  const d = $('#b-date').value || 'all', t = $('#b-tab').value || 'all';
  const ok = x => (d === 'all' || dayOf(x.ts) === d) && (t === 'all' || (x.tablet || '') === t);
  const L = $('#b-les').value || 'all';
  return { rel: c.passages.filter(p => ok(p) && (L === 'all' || (p.les || 'rel') === L)), spr: c.sprints.filter(ok) };
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
$('#b-date').onchange = $('#b-tab').onchange = $('#b-les').onchange = () => renderBilan(true);
function critStats(c, list) {
  return crits(c).map(cr => {
    const t = ctype(cr), vals = list.map(p => p.c && p.c[cr.k]).filter(v => v !== undefined && v !== null);
    const sc = vals.map(v => critScore(cr, v)).filter(x => x != null);
    const dist = t === 'free' ? (cr.o || []).map((_, j) => vals.filter(v => v === j).length) : t === 'scale' ? Array.from({ length: 10 }, (_, j) => vals.filter(v => v === j + 1).length) : null;
    return { ...cr, label: cr.l, t, n: vals.length, yes: vals.filter(v => v === true).length, dist,
      mean: t === 'scale' && vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      score: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null, nScored: sc.length, sumScore: sc.reduce((a, b) => a + b, 0) };
  });
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
  const bestP = ok.length ? ok.reduce((a, p) => teqOf(p) < teqOf(a) ? p : a) : null;
  const bestRel = bestP ? teqOf(bestP) : null, bestRelReal = bestP ? bestP.tEnd : null;
  const mixed = !!(bestP && isMixed(c, bestP));          // meilleur relais en binôme mixte → barème moyen F/G
  const col = ptsFrom(B_COL, mixed ? 'M' : sexe, bestRel);
  // 4 passages retenus : plus d'étoiles, puis meilleur IT (les mêmes servent à la note Zt)
  const kept = mine.map(p => ({ p, st: passStars(c, p), it: passIT(c, p) })).filter(x => x.st != null)
    .sort((a, b) => b.st - a.st || (a.it ?? 99) - (b.it ?? 99)).slice(0, 4);
  const used = kept.map(x => x.st), n = used.length, sum = used.reduce((a, b) => a + b, 0);
  const stars = n ? Math.min(16, Math.round(sum * 4 / n)) : null;
  const cs = critStats(c, mine), y = cs.reduce((a, x) => a + x.sumScore, 0), o = cs.reduce((a, x) => a + x.nScored, 0);
  const rate = o ? y / o : null;
  const et = stars != null ? etNote(stars, rate, c.overrides[sid], n >= 4 && sum === 16) : null;
  const parts = [ind, col, et ? et.note : null];
  const total = parts.some(x => x != null) ? parts.reduce((a, x) => a + (x || 0), 0) : null;
  const its = mine.map(p => passIT(c, p)).filter(x => x != null);
  const zl = kept.map(x => x.p.fail ? 0 : ztPts(x.p.gap)).filter(x => x != null);
  const zt = zl.length ? zl.reduce((a, b) => a + b, 0) * 2 / zl.length : null;   // moyenne /4 → /8
  const eps = total != null && zt != null ? (total + zt) * 12 / 20 : null;
  return { zt, nZt: zl.length, eps, sid, s, sexe, b50, ind, mine, bestRel, bestRelReal, col, mixed, used, n, sum, stars, rate, et, total,
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
    <div><span>Moyenne note Bac</span><b>${fnum(avg(comp, r => r.total), 2)}<small style="display:inline">/12</small></b><small>${comp.length} élève(s) complet(s) / ${R.length}</small></div>
    <div><span>Moyenne note EPS</span><b>${fnum(avg(comp, r => r.eps), 2)}<small style="display:inline">/12</small></b><small>zone de transmission ${fnum(avg(R, r => r.zt), 2)} /8</small></div>
    <div><span>Vitesse indiv. · coll.</span><b>${fnum(avg(R, r => r.ind), 2)} · ${fnum(avg(R, r => r.col), 2)}</b><small>moyennes /3</small></div>
    <div><span>Étoiles moyennes</span><b>${fnum(avg(R, r => r.stars), 1)} ★</b><small>IT moyen ${allIT.length ? fit(allIT.reduce((a, b) => a + b, 0) / allIT.length) : '–'}</small></div>
    <div><span>Relais courus</span><b>${st.N}</b><small>${st.nFail} raté(s) · ${F.spr.length} chronos 50 m</small></div>`;
  $('#b-notes').innerHTML = `
    <tr><th style="text-align:left">Élève</th><th>Sexe</th><th>Groupe</th><th>50 m</th><th>Vit. indiv.<br><small>/3</small></th>
      <th>Meilleur relais<br><small>(équiv. 100 m)</small></th><th>Vit. coll.<br><small>/3</small></th>
      <th>Courses</th><th>Étoiles<br><small>/16</small></th><th>Degré</th><th>Eff. tech.<br><small>/6</small></th><th class="tot">Note Bac<br><small>/12</small></th><th title="Moyenne des points Zt (4/3/2/1/0) des 4 passages retenus, ×2">Zone Zt<br><small>/8</small></th><th class="tot eps">Note EPS<br><small>(Bac + Zt) /12</small></th></tr>
    ${R.map(r => `<tr class="${r.total == null ? 'none' : ''}">
      <td class="name">${esc(dnStudent(c, r.s))}</td><td>${sexBadge(r.sexe)}</td><td>${c.tg[r.sid] || '–'}</td>
      <td>${r.b50 != null ? fmt(r.b50) + ' s' : '–'}</td>
      <td class="pts">${r.ind != null ? fpt(r.ind) : (r.b50 != null && !r.sexe ? '<span class="flag">sexe ?</span>' : '–')}</td>
      <td>${r.bestRelReal != null ? fmt(r.bestRelReal) + ' s' + (Math.round(r.bestRel) !== r.bestRelReal ? `<span class="sub">${fmt(r.bestRel)} s</span>` : '') : '–'}</td>
      <td class="pts">${r.col != null ? fpt(r.col) + (r.mixed ? '<span class="sub">barème mixte</span>' : '') : (r.bestRel != null && !r.sexe ? '<span class="flag">sexe ?</span>' : '–')}</td>
      <td>${r.mine.length}${r.nFail ? `<span class="sub">dont ${r.nFail} ratée(s)</span>` : ''}</td>
      <td>${r.stars != null ? `<span class="st">${r.stars} ★</span><span class="sub">${r.used.join('+')}${r.n < 4 ? ` → ×4/${r.n}` : ''}</span>${r.n === 1 ? '<span class="flag">1 seule course</span>' : r.n < 4 ? '<span class="flag">extrapolé</span>' : ''}` : '–'}</td>
      <td>${r.et ? r.et.deg.n : '–'}</td>
      <td>${r.et ? `<select data-ov="${esc(r.sid)}" class="${r.et.manual ? 'manual' : ''}">${r.et.allowed.map(v => `<option value="${v}" ${v === r.et.note ? 'selected' : ''}>${fpt(v)}${v === r.et.auto ? ' (auto)' : ''}</option>`).join('')}</select><span class="sub">critères ${r.rate != null ? pct(r.rate, 1) + ' %' : '–'}</span>` : '–'}</td>
      <td class="tot">${r.total != null ? fpt(Math.round(r.total * 100) / 100) : '–'}${r.total != null && !r.complete ? '<span class="flag">incomplet</span>' : ''}</td>
      <td>${r.zt != null ? fpt(Math.round(r.zt * 100) / 100) + `<span class="sub">${r.nZt} passage${r.nZt > 1 ? 's' : ''}</span>` : '<span class="sub">pas de chrono Zt</span>'}</td>
      <td class="tot eps">${r.eps != null ? fpt(Math.round(r.eps * 100) / 100) : '–'}</td>
    </tr>`).join('')}`;
  $$('#b-notes [data-ov]').forEach(s => s.onchange = () => {
    const r = R.find(x => x.sid === s.dataset.ov), v = parseFloat(s.value);
    if (v === r.et.auto) delete c.overrides[r.sid]; else c.overrides[r.sid] = v;
    save(); renderBilan(true);
  });
  $('#b-crit').innerHTML = st.N ? st.crit.map(cr => {
    const sm = critSummary(cr), lbl = `<div class="bar-label">${esc(cr.label)}<small>${CTYPES[cr.t]}</small></div>`;
    if (cr.t === 'free') {
      const n = cr.o.length;
      return `<div class="bar-row">${lbl}
        <div class="stack">${cr.dist.map((k, j) => k ? `<div class="seg-f ${cr.ord ? 'o' + Math.round(j / Math.max(1, n - 1) * 4) : 'q' + (j % 6)}" style="width:${pct(k, cr.n)}%" title="${esc(cr.o[j])}">${pct(k, cr.n) >= 12 ? esc(cr.o[j]) + ' ' + pct(k, cr.n) + ' %' : ''}</div>` : '').join('')}</div>
        <div class="bar-val"><b>${esc(sm.main)}</b><small>${sm.sub}</small></div>
        <div class="stack-legend">${cr.o.map((o, j) => `<span><i class="${cr.ord ? 'o' + Math.round(j / Math.max(1, n - 1) * 4) : 'q' + (j % 6)}"></i>${esc(o)} : ${cr.dist[j]}</span>`).join('')}</div></div>`;
    }
    const w = cr.score != null ? Math.round(cr.score * 100) : 0;
    return `<div class="bar-row">${lbl}
      <div class="bar"><div class="fill ${scoreCls(cr.score)}" style="width:${w}%"></div></div>
      <div class="bar-val"><b>${sm.main}</b><small>${sm.sub}</small></div></div>`;
  }).join('') : '<div class="empty">Aucun relais pour ce filtre.</div>';
  const maxBin = Math.max(1, ...st.bins.map(b => b.n));
  $('#b-gap').innerHTML = st.gaps.length ? st.bins.map(b => `
    <div class="bar-row"><div class="bar-label">${b.label}</div>
      <div class="bar"><div class="fill ${b.cls}" style="width:${b.n / maxBin * 100}%"></div></div>
      <div class="bar-val"><b>${b.n}</b><small>${pct(b.n, st.gaps.length)} %</small></div></div>`).join('') +
    `<p class="hint">Écart moyen : <b>${fgap(st.mean)}</b>. Écart = (V Zt − V hors Zt) ÷ V hors Zt.</p>`
    : '<div class="empty">Aucun passage chronométré complet.</div>';
  renderTgBilan(c, list);
  $('#b-table').innerHTML = `
    <tr><th style="text-align:left">Élève</th><th>Relais<br><small>D / R</small></th><th>Écart Zt<br>moyen</th><th>IT moyen</th>
      ${crits(c).map(cr => `<th class="crit-h">${esc(cr.l)}</th>`).join('')}</tr>
    ${R.map(r => { const s2 = stats(c, r.mine); return `<tr class="${r.mine.length ? '' : 'none'}">
      <td class="name">${esc(dnStudent(c, r.s))}</td>
      <td>${r.mine.length ? `${r.mine.length} <small style="display:inline">(${r.mine.filter(p => p.d === r.sid).length} / ${r.mine.filter(p => p.r === r.sid).length})</small>` : '–'}</td>
      <td>${s2.mean != null ? fgap(s2.mean) : '–'}</td><td>${fit(r.itMean)}</td>
      ${s2.crit.map(cr => { const sm = critSummary(cr); return `<td>${cr.n ? `<span class="chip ${scoreCls(cr.score)}">${esc(cr.t === 'yn' ? `${cr.yes}/${cr.n}` : sm.main)}</span>${cr.t === 'free' ? `<span class="sub">${sm.sub}</span>` : ''}` : '–'}</td>`; }).join('')}
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
        <div class="crit-marks">${crits(c).map(cr => { const v = p.c[cr.k]; if (v === undefined) return ''; const sc = critScore(cr, v);
          return ctype(cr) === 'yn' ? `<span class="${v ? 'y' : 'n'}">${v ? '✓' : '✗'} ${esc(cr.l)}</span>` : `<span class="${sc == null ? 'nt' : sc >= 0.5 ? 'y' : 'n'}">${esc(cr.l)} : <b>${esc(critText(cr, v))}</b></span>`; }).join('')}</div>
      </div>
      <button class="btn danger-ghost small" data-delp="${p.id}">Suppr.</button>
    </div>`;
  }).join('') : '<div class="empty">Aucun relais.</div>';
  $$('#b-hist [data-delp]').forEach(b => b.onclick = () => {
    if (!confirm('Supprimer définitivement ce passage ?')) return;
    delRun(c, b.dataset.delp); renderBilan(true);
  });
  const h50 = [...F.spr].sort((a, b) => b.ts - a.ts);
  $('#h50-count').textContent = `(${h50.length})`;
  $('#b-hist50').innerHTML = h50.length ? h50.map(s => `
    <div class="list-item"><div class="grow"><b>${fmt(s.t)} s</b> · ${esc(dn(c, s.sid, s.snap))}
      <div class="meta">${new Date(s.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(s.tablet || 'tablette sans nom')}</div></div>
      <button class="btn danger-ghost small" data-dels="${s.id}">Suppr.</button></div>`).join('') : '<div class="empty">Aucun chrono 50 m.</div>';
  $$('#b-hist50 [data-dels]').forEach(b => b.onclick = () => {
    if (!confirm('Supprimer ce temps sur 50 m ?')) return;
    delRun(c, b.dataset.dels); renderBilan(true);
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
  const notes = [['Nom', 'Prénom', 'Sexe', 'Groupe', 'Meilleur 50 m (s)', 'Vitesse individuelle /3', 'Meilleur relais (s)', 'Relais équiv. 100 m (s)', 'Barème relais', 'Vitesse collective /3',
    'Courses', 'Ratées', 'Étoiles retenues', 'Total étoiles /16', 'Extrapolé', 'Degré', '% critères', 'Efficacité technique /6', 'Ajusté', 'NOTE BAC /12', 'Zt /8 (moy. 4 passages retenus)', 'NOTE EPS /12', 'Complet']]
    .concat([...R].sort((a, b) => (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr')).map(r => [
      r.s.nom, r.s.prenom, r.sexe, c.tg[r.sid] || '', sec(r.b50), r.ind ?? '', sec(r.bestRelReal), sec(r.bestRel), r.bestRel == null ? '' : r.mixed ? 'Mixte' : r.sexe === 'F' ? 'Filles' : r.sexe === 'G' ? 'Garçons' : '', r.col ?? '',
      r.mine.length, r.nFail, r.used.join('+'), r.stars ?? '', r.n && r.n < 4 ? `oui (${r.n} courses)` : '', r.et ? r.et.deg.n : '',
      r.rate != null ? pct(r.rate, 1) : '', r.et ? r.et.note : '', r.et && r.et.manual ? 'oui' : '',
      r.total != null ? Math.round(r.total * 100) / 100 : '', r.zt != null ? Math.round(r.zt * 100) / 100 : '', r.eps != null ? Math.round(r.eps * 100) / 100 : '', r.complete ? 'oui' : 'non']));
  const rel = [['Date', 'Tablette', 'Démarreur – Nom', 'Démarreur – Prénom', 'Relayeur – Nom', 'Relayeur – Prénom', 'Distance (m)', 'Statut', 'Cause',
    'Temps (s)', 'Cible (s)', 'IT équiv. 100 m (s)', 'Étoiles', 'Entrée Zt (s)', 'Temps Zt (s)', 'V Zt (m/s)', 'V hors Zt (m/s)', 'Écart Zt (%)', ...crits(c).map(cr => cr.l),
    'Leçon', 'Groupe de travail', ...txs(c).map(t => t.l + (t.unit ? ` (${t.unit})` : ''))]]
    .concat([...F.rel].sort((a, b) => a.ts - b.ts).map(p => [
      new Date(p.ts).toLocaleString('fr-FR'), p.tablet || '', ...nm(p.d, p.dSnap), ...nm(p.r, p.rSnap), distOf(p),
      p.fail ? 'Raté' : 'Réussi', p.fail ? (FAILS.find(f => f.k === p.fail) || {}).label : '',
      sec(p.tEnd), sec(p.tgt), passIT(c, p) ?? '', passStars(c, p) ?? '', sec(p.tIn), sec(p.tZt), p.vZt ?? '', p.vR ?? '', p.gap ?? '',
      ...crits(c).map(cr => critText(cr, p.c[cr.k])),
      p.les === 'tg' ? 'Travail de groupe' : p.les === 'ev' ? 'Évaluation' : 'Relais à deux', p.grp || '', ...txs(c).map(t => p.tx ? txVal(t, p.tx[t.k]) : '')]));
  const s50 = [['Date', 'Tablette', 'Nom', 'Prénom', 'Temps 50 m (s)']]
    .concat([...F.spr].sort((a, b) => a.ts - b.ts).map(s => [new Date(s.ts).toLocaleString('fr-FR'), s.tablet || '', ...nm(s.sid, s.snap), sec(s.t)]));
  const bil = [['Bilan de classe', c.name], ['Relais', st.N], ['Ratés', st.nFail], ...st.failBy.map(f => ['  ' + f.label, f.n]),
    ['Écart moyen vitesse Zt (%)', st.mean != null ? +st.mean.toFixed(1) : ''], [],
    ['Critère', 'Type', 'Observés', 'Résultat', 'Détail'], ...st.crit.map(cr => [cr.label, CTYPES[cr.t], cr.n, critSummary(cr).main, cr.t === 'free' ? cr.o.map((o, j) => `${o} : ${cr.dist[j]}`).join(' · ') : cr.t === 'scale' ? cr.dist.map((k, j) => `${j + 1}:${k}`).join(' ') : `${pct(cr.yes, cr.n)} % Oui`]), [],
    ['Écart vitesse Zt', 'Passages', '%'], ...st.bins.map(b => [b.label, b.n, pct(b.n, st.gaps.length)])];
  const wb = XLSX.utils.book_new();
  const add = (aoa, name, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((_, i) => ({ wch: w(i) })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add(notes, 'Notes', i => i < 2 ? 18 : 13);
  add(bil, 'Bilan critères', i => i === 0 ? 48 : 12);
  add(rel, 'Relais', i => i < 6 ? 18 : i < 18 ? 12 : 26);
  add(s50, '50 m', i => i < 4 ? 18 : 14);
  const tgRows = tgPairRows(c, F.rel);
  if (tgRows.length > 1) add(tgRows, 'Travail de groupe', i => i < 2 ? 22 : 14);
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
