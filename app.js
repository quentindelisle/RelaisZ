/* RelaisZ v2 – observation du relais en EPS (sans note) · N'EPS by Quentin Delisle */
'use strict';

const KEY = 'relaisz_v2';
const OLD_KEY = 'relaisz_v1';

// Critères qualitatifs observés à chaque passage (Oui / Non, obligatoires)
const CRITERIA = [
  { k: 'repere', label: 'Départ à un repère visuel' },
  { k: 'signal', label: 'Signal sonore déclenche la transmission' },
  { k: 'noReacc', label: 'Relayeur ne réaccélère pas après la transmission' },
  { k: 'main', label: 'Passage de main optimal' }
];
const FAILS = [
  { k: 'temoin', label: 'Témoin tombé' },
  { k: 'zone', label: 'Transmission hors zone' },
  { k: 'autre', label: 'Autre (faux départ, arrêt…)' }
];
// Répartition des écarts (affichage du bilan uniquement, pas de note)
const GAP_BINS = [
  { label: 'Plus rapide dans la Zt', test: g => g > 0, cls: 'g4' },
  { label: '0 à −8 %', test: g => g >= -8, cls: 'g3' },
  { label: '−8 à −15 %', test: g => g >= -15, cls: 'g2' },
  { label: '−15 à −20 %', test: g => g >= -20, cls: 'g1' },
  { label: 'Au-delà de −20 %', test: () => true, cls: 'g0' }
];

/* ---------------- utilitaires ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms, d = 2) => ms == null ? '–' : (ms / 1000).toFixed(d).replace('.', ',');
const fnum = (n, d = 1) => n.toFixed(d).replace('.', ',');
const fgap = g => g == null ? '–' : (g > 0 ? '+' : '') + fnum(g) + ' %';
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const norm = w => String(w || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
const keyOf = (nom, prenom) => norm(nom) + '|' + norm(prenom); // identifiant stable, identique sur toutes les tablettes
const cap = w => w ? w.charAt(0).toLocaleUpperCase('fr') + w.slice(1).toLocaleLowerCase('fr') : '';
const dayOf = ts => new Date(ts).toISOString().slice(0, 10);
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------- état & stockage ---------------- */
const S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.classes) return d; } catch (e) {}
  const fresh = { v: 2, settings: { total: 80, zt: 20, tablet: '' }, classes: [], cur: null, pending: null };
  // reprise des classes de la v1 (élèves seulement ; l'ancien stockage n'est pas effacé)
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old && old.classes) {
      fresh.classes = old.classes.map(c => ({
        id: c.id, name: c.name, group: [], passages: [],
        students: dedupe(c.students.map(s => ({ id: keyOf(s.nom, s.prenom), nom: s.nom, prenom: s.prenom })))
      }));
      fresh.cur = old.cur;
      if (old.settings) { fresh.settings.total = old.settings.total || 80; fresh.settings.zt = old.settings.zt || 20; }
    }
  } catch (e) {}
  return fresh;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Sauvegarde impossible (stockage plein ?)'); }
}
function dedupe(list) { const seen = new Set(); return list.filter(s => !seen.has(s.id) && seen.add(s.id)); }
const cls = () => S.classes.find(c => c.id === S.cur) || null;
const stu = (c, id) => c.students.find(s => s.id === id);
const tabletName = () => S.settings.tablet || 'Cette tablette';

// « Prénom N. » ; si deux élèves ont le même prénom et la même initiale, on ajoute des lettres (Lucas Ma. / Lucas Mo.)
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

/* ---------------- navigation (bloquée tant qu'un passage n'est pas renseigné) ---------------- */
let view = 'classes';
function show(v) {
  if (S.pending && v !== 'eval') { v = 'eval'; }
  if (['tiles', 'bilan', 'group'].includes(v) && !cls()) { toast('Importez ou choisissez une classe'); v = 'classes'; }
  view = v;
  $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v || (b.dataset.view === 'tiles' && ['chrono', 'eval', 'group'].includes(v))));
  document.body.classList.toggle('locked', !!S.pending);
  $('#hdr-class').textContent = cls() ? '· ' + cls().name : '';
  ({ classes: renderClasses, tiles: renderTiles, group: renderGroup, bilan: renderBilan, settings: renderSettings, eval: renderEval }[v] || (() => {}))();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(b => b.addEventListener('click', () => {
  if (S.pending) { toast('Renseignez tous les critères du passage avant de continuer'); flashMissing(); return; }
  if (view === 'chrono' && run && run.t0 !== null && !confirm('Quitter le chrono ? Ce passage ne sera pas enregistré.')) return;
  stopClock(); run = null; show(b.dataset.view);
}));

/* ---------------- import ---------------- */
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
    const tmp = { students: list };
    const existing = S.classes.find(c => norm(c.name) === norm($('#imp-name').value));
    $('#imp-preview').innerHTML = `
      <p><b>${list.length} élèves détectés</b> – affichage :</p>
      <div class="preview-list">${list.map(s => `<div><b>${esc(dnStudent(tmp, s))}</b> <span class="meta">(${esc(s.nom)} ${esc(s.prenom)})</span></div>`).join('')}</div>
      <div class="row gap wrap">
        <button class="btn primary" id="imp-ok">Créer la classe</button>
        ${existing ? `<button class="btn ghost" id="imp-add">Compléter « ${esc(existing.name)} »</button>` : ''}
        <button class="btn ghost" id="imp-no">Annuler</button>
      </div>`;
    $('#imp-ok').onclick = () => {
      const name = $('#imp-name').value.trim() || 'Classe';
      const c = { id: uid(), name, students: pending, passages: [], group: [], created: Date.now() };
      S.classes.push(c); S.cur = c.id; save(); resetImport();
      toast(`Classe « ${name} » créée`); show('group');
    };
    if ($('#imp-add')) $('#imp-add').onclick = () => {
      const n = mergeStudents(existing, pending);
      S.cur = existing.id; save(); resetImport(); toast(`${n} élève(s) ajouté(s)`); show('tiles');
    };
    $('#imp-no').onclick = resetImport;
  } catch (err) {
    console.error(err); toast('Lecture du fichier impossible');
  }
});
function resetImport() { pending = null; $('#imp-preview').innerHTML = ''; $('#imp-name').value = ''; }
function mergeStudents(c, list) {
  const known = new Set(c.students.map(s => s.id)); let n = 0;
  list.forEach(s => { if (!known.has(s.id)) { c.students.push(s); known.add(s.id); n++; } });
  return n;
}

function readXLSX(f) {
  return f.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  });
}
async function readCSV(f) {
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf); // CSV Excel FR
  txt = txt.replace(/^﻿/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const first = lines[0] || '';
  const sep = [';', '\t', ','].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map(l => splitCSVLine(l, sep));
}
function splitCSVLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
// Nom en colonne A, Prénom en colonne B
function parseRows(rows) {
  const out = [];
  rows.forEach((r, idx) => {
    const nom = String(r[0] ?? '').trim().replace(/\s+/g, ' ');
    const prenom = String(r[1] ?? '').trim().replace(/\s+/g, ' ');
    if (!nom) return;
    if (idx === 0 && /^(nom|noms|élève|eleve|élèves|eleves|name|identit)/i.test(nom)) return; // en-tête
    out.push({ id: keyOf(nom, prenom), nom, prenom });
  });
  return dedupe(out).sort(byFirst);
}

/* ---------------- classes ---------------- */
function renderClasses() {
  const el = $('#class-list');
  if (!S.classes.length) { el.innerHTML = '<div class="empty">Aucune classe pour l\'instant.</div>'; return; }
  el.innerHTML = S.classes.map(c => `
    <div class="list-item ${c.id === S.cur ? 'current' : ''}">
      <div class="grow"><b>${esc(c.name)}</b><div class="meta">${c.students.length} élèves · ${c.group.length ? c.group.length + ' sur cette tablette · ' : ''}${c.passages.length} passages</div></div>
      <button class="btn ${c.id === S.cur ? 'primary' : 'ghost'} small" data-open="${c.id}">${c.id === S.cur ? 'Ouverte' : 'Ouvrir'}</button>
      <button class="btn ghost small" data-ren="${c.id}">Renommer</button>
      <button class="btn danger-ghost small" data-del="${c.id}">Suppr.</button>
    </div>`).join('');
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { S.cur = b.dataset.open; save(); show('tiles'); });
  el.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.ren); const n = prompt('Nouveau nom :', c.name);
    if (n && n.trim()) { c.name = n.trim(); save(); show('classes'); }
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.del);
    if (!confirm(`Supprimer la classe « ${c.name} » et ses ${c.passages.length} passages ?`)) return;
    S.classes = S.classes.filter(x => x.id !== c.id); if (S.cur === c.id) S.cur = S.classes[0]?.id || null;
    save(); show('classes');
  });
}

/* ---------------- groupe de la tablette ---------------- */
let gSel = new Set();
function renderGroup() {
  const c = cls(); gSel = new Set(c.group);
  paintGroup();
}
function paintGroup() {
  const c = cls();
  $('#g-list').innerHTML = [...c.students].sort(byFirst).map(s => `
    <button class="tile check ${gSel.has(s.id) ? 'on' : ''}" data-id="${esc(s.id)}">
      <span class="box">${gSel.has(s.id) ? '✓' : ''}</span><span class="nom">${esc(dnStudent(c, s))}</span>
    </button>`).join('');
  $$('#g-list .tile').forEach(t => t.onclick = () => {
    gSel.has(t.dataset.id) ? gSel.delete(t.dataset.id) : gSel.add(t.dataset.id); paintGroup();
  });
  $('#g-ok').textContent = `Valider le groupe (${gSel.size} élève${gSel.size > 1 ? 's' : ''})`;
}
$('#g-all').onclick = () => { gSel = new Set(cls().students.map(s => s.id)); paintGroup(); };
$('#g-none').onclick = () => { gSel = new Set(); paintGroup(); };
$('#g-ok').onclick = () => {
  if (gSel.size < 2) { toast('Cochez au moins 2 élèves'); return; }
  cls().group = [...gSel]; save(); sel = { d: null, r: null }; show('tiles');
};
$('#group-edit').onclick = () => show('group');

/* ---------------- tuiles ---------------- */
let sel = { d: null, r: null };
function groupStudents(c) {
  const g = new Set(c.group);
  return c.students.filter(s => !g.size || g.has(s.id)).sort(byFirst);
}
function renderTiles() {
  const c = cls(); const el = $('#tiles');
  const list = groupStudents(c);
  $('#group-info').innerHTML = c.group.length
    ? `<b>${esc(tabletName())}</b> · ${list.length} élève${list.length > 1 ? 's' : ''} dans le groupe`
    : `<b>Aucun groupe choisi</b> : toute la classe est affichée`;
  if (!list.length) { el.innerHTML = '<div class="empty">Aucun élève.</div>'; updateSelBar(); return; }
  const mine = c.passages.filter(p => p.tablet === S.settings.tablet || p.local);
  el.innerHTML = list.map(s => {
    const n = mine.filter(p => p.d === s.id || p.r === s.id).length;
    const role = sel.d === s.id ? 'd' : sel.r === s.id ? 'r' : '';
    return `<button class="tile ${role ? 'sel-' + role : ''}" data-id="${esc(s.id)}">
      ${role ? `<span class="role ${role} badge">${role.toUpperCase()}</span>` : ''}
      <span class="nom">${esc(dnStudent(c, s))}</span>
      <span class="foot"><span class="count">${n ? n + ' passage' + (n > 1 ? 's' : '') : ''}</span></span>
    </button>`;
  }).join('');
  el.querySelectorAll('.tile').forEach(t => t.onclick = () => pick(t.dataset.id));
  updateSelBar();
}
function pick(id) {
  if (sel.d === id) { sel.d = sel.r; sel.r = null; }
  else if (sel.r === id) sel.r = null;
  else if (!sel.d) sel.d = id;
  else sel.r = id;
  renderTiles();
  if (sel.d && sel.r) setTimeout(startRun, 250);
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

/* ---------------- chrono ---------------- */
let run = null, raf = null, wake = null;
function startRun(d, r) {
  run = { d: d || sel.d, r: r || sel.r, t0: null, marks: [] }; // marks : [entréeZt, finZt, fin] en ms depuis le départ
  sel = { d: null, r: null };
  paintPair(); renderChrono(); show('chrono');
  requestWake();
}
function paintPair() {
  const c = cls();
  $('#c-d').textContent = dn(c, run.d);
  $('#c-r').textContent = dn(c, run.r);
}
$('#c-swap').onclick = () => { [run.d, run.r] = [run.r, run.d]; paintPair(); };

function step() { return run.t0 === null ? 0 : run.marks.length + 1; }
function renderChrono() {
  const st = step();
  $$('.cbtn').forEach(b => {
    const k = +b.dataset.step;
    b.classList.toggle('next', k === st); b.classList.toggle('done', k < st); b.disabled = k !== st;
  });
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

// pointerdown = top immédiat (plus précis que click)
$$('.cbtn').forEach(b => b.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!run || +b.dataset.step !== step()) return;
  const now = performance.now();
  if (run.t0 === null) { run.t0 = now; tick(); }
  else run.marks.push(now - run.t0);
  if (navigator.vibrate) navigator.vibrate(30);
  renderChrono();
  if (run.marks.length === 3) { cancelAnimationFrame(raf); setTimeout(() => toEval(false), 350); }
}));
$('#c-fail').onclick = () => { if (run && run.t0 !== null) { cancelAnimationFrame(raf); toEval(true); } };
$('#c-undo').onclick = () => {
  if (!run) return;
  if (run.marks.length) run.marks.pop();
  else if (run.t0 !== null) { run.t0 = null; }
  cancelAnimationFrame(raf); renderChrono(); if (run.t0 !== null) tick();
};
$('#c-reset').onclick = () => { if (!run) return; run.t0 = null; run.marks = []; cancelAnimationFrame(raf); renderChrono(); };
$('#c-cancel').onclick = () => {
  if (run && run.t0 !== null && !confirm('Revenir aux élèves sans enregistrer ? (si le passage a eu lieu et a échoué, utilisez « Passage raté »)')) return;
  run = null; stopClock(); show('tiles');
};

async function requestWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

/* ---------------- calcul de l'écart de vitesse ---------------- */
function computeSpeed(tIn, tOut, tEnd, total, zt) {
  if ([tIn, tOut, tEnd].some(t => t == null)) return null;
  const tZt = tOut - tIn, tRest = tEnd - tZt;
  if (tZt <= 0 || tRest <= 0) return null;
  const vZt = zt / (tZt / 1000), vR = (total - zt) / (tRest / 1000);
  return { tZt, tRest, vZt, vR, gap: Math.round((vZt - vR) / vR * 1000) / 10 };
}

/* ---------------- critères (écran bloquant) ---------------- */
function toEval(failed) {
  stopClock();
  const c = cls(); const [tIn, tOut, tEnd] = run.marks;
  const { total, zt } = S.settings;
  const sp = failed ? computeSpeed(tIn, tOut, tEnd, total, zt) : computeSpeed(tIn, tOut, tEnd, total, zt);
  if (!failed && !sp) { toast('Temps incohérents : recommencez le chrono'); $('#c-reset').onclick(); return; }
  S.pending = {
    id: uid(), ts: Date.now(), tablet: S.settings.tablet, local: true,
    d: run.d, r: run.r,
    dSnap: snap(c, run.d), rSnap: snap(c, run.r),
    tIn: tIn != null ? Math.round(tIn) : null,
    tZt: sp ? Math.round(sp.tZt) : null,
    tEnd: tEnd != null ? Math.round(tEnd) : null,
    vZt: sp ? +sp.vZt.toFixed(3) : null, vR: sp ? +sp.vR.toFixed(3) : null, gap: sp ? sp.gap : null,
    fail: failed ? '' : null, // '' = raté, cause à préciser
    c: {}, cfg: { total, zt }
  };
  save(); run = null; show('eval');
}
const snap = (c, id) => { const s = stu(c, id); return s ? { nom: s.nom, prenom: s.prenom } : null; };

function renderEval() {
  const p = S.pending, c = cls(); if (!p || !c) return;
  $('#e-d').textContent = dn(c, p.d, p.dSnap);
  $('#e-r').textContent = dn(c, p.r, p.rSnap);
  $('#e-times').innerHTML = `
    <div><span>Temps total (${p.cfg.total} m)</span><b>${p.tEnd != null ? fmt(p.tEnd) + ' s' : '–'}</b></div>
    <div><span>Entrée Zt</span><b>${p.tIn != null ? fmt(p.tIn) + ' s' : '–'}</b></div>
    <div><span>Temps Zt (${p.cfg.zt} m)</span><b>${p.tZt != null ? fmt(p.tZt) + ' s' : '–'}</b></div>
    <div><span>Hors Zt (${p.cfg.total - p.cfg.zt} m)</span><b>${p.tZt != null ? fmt(p.tEnd - p.tZt) + ' s' : '–'}</b></div>`;
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

  $('#e-crits').innerHTML = CRITERIA.map((cr, i) => `
    <div class="card crit ${p.c[cr.k] === undefined ? 'todo' : ''}" data-crit="${cr.k}">
      <h3>${i + 1}. ${cr.label}</h3>
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
  const m = CRITERIA.filter(cr => p.c[cr.k] === undefined).map(cr => cr.k);
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
  toast(p.fail ? 'Passage raté enregistré' : 'Passage enregistré');
  show('tiles');
};
$('#e-redo').onclick = () => {
  const p = S.pending; if (!p) return;
  if (!confirm('Erreur de chronométrage ? Ce passage sera effacé et le chrono relancé pour le même binôme.')) return;
  S.pending = null; save(); startRun(p.d, p.r);
};

/* ---------------- bilan ---------------- */
function filtered(c) {
  const d = $('#b-date').value, t = $('#b-tab').value;
  return c.passages.filter(p => (d === 'all' || dayOf(p.ts) === d) && (t === 'all' || (p.tablet || '') === t));
}
function fillFilters(c) {
  const days = [...new Set(c.passages.map(p => dayOf(p.ts)))].sort().reverse();
  const tabs = [...new Set(c.passages.map(p => p.tablet || ''))].sort();
  const keepD = $('#b-date').value, keepT = $('#b-tab').value;
  $('#b-date').innerHTML = `<option value="all">Toutes les séances</option>` + days.map(d => `<option value="${d}">${dayLabel(d)}</option>`).join('');
  $('#b-tab').innerHTML = `<option value="all">Toutes (${tabs.length})</option>` + tabs.map(t => `<option value="${esc(t)}">${esc(t || 'Sans nom')}</option>`).join('');
  if ([...$('#b-date').options].some(o => o.value === keepD)) $('#b-date').value = keepD;
  if ([...$('#b-tab').options].some(o => o.value === keepT)) $('#b-tab').value = keepT;
}
$('#b-date').onchange = $('#b-tab').onchange = () => renderBilan(true);

function stats(list) {
  const N = list.length, fails = list.filter(p => p.fail), gaps = list.map(p => p.gap).filter(g => g != null);
  return {
    N, nFail: fails.length,
    failBy: FAILS.map(f => ({ ...f, n: fails.filter(p => p.fail === f.k).length })),
    gaps, mean: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    crit: CRITERIA.map(cr => ({ ...cr, yes: list.filter(p => p.c[cr.k] === true).length, n: list.filter(p => p.c[cr.k] !== undefined).length })),
    bins: GAP_BINS.map(b => ({ ...b, n: 0 }))
  };
}
function binGaps(st) { st.gaps.forEach(g => st.bins.find(b => b.test(g)).n++); return st; }

function renderBilan(keepFilters) {
  const c = cls(); $('#b-class').textContent = '· ' + c.name;
  if (keepFilters !== true) fillFilters(c);
  const list = filtered(c);
  const st = binGaps(stats(list));

  $('#b-kpi').innerHTML = `
    <div><span>Passages</span><b>${st.N}</b></div>
    <div><span>Réussis</span><b>${st.N - st.nFail}</b><small>${pct(st.N - st.nFail, st.N)} %</small></div>
    <div><span>Ratés</span><b>${st.nFail}</b><small>${st.failBy.filter(f => f.n).map(f => `${f.label} : ${f.n}`).join(' · ') || '–'}</small></div>
    <div><span>Écart moyen Zt</span><b>${st.mean != null ? fgap(st.mean) : '–'}</b><small>${st.gaps.length} passages chronométrés</small></div>`;

  $('#b-crit').innerHTML = st.N ? st.crit.map(cr => {
    const p = pct(cr.yes, cr.n);
    return `<div class="bar-row">
      <div class="bar-label">${esc(cr.label)}</div>
      <div class="bar"><div class="fill ${p >= 70 ? 'hi' : p >= 40 ? 'mid' : 'lo'}" style="width:${p}%"></div></div>
      <div class="bar-val"><b>${p} %</b><small>${cr.yes}/${cr.n}</small></div>
    </div>`;
  }).join('') : '<div class="empty">Aucun passage pour ce filtre.</div>';

  const maxBin = Math.max(1, ...st.bins.map(b => b.n));
  $('#b-gap').innerHTML = st.gaps.length ? st.bins.map(b => `
    <div class="bar-row">
      <div class="bar-label">${b.label}</div>
      <div class="bar"><div class="fill ${b.cls}" style="width:${b.n / maxBin * 100}%"></div></div>
      <div class="bar-val"><b>${b.n}</b><small>${pct(b.n, st.gaps.length)} %</small></div>
    </div>`).join('') + `<p class="hint">Écart = (V Zt − V hors Zt) ÷ V hors Zt. Indicateur d'observation, aucune note n'est calculée.</p>`
    : '<div class="empty">Aucun passage chronométré complet.</div>';

  // par élève (rôle D ou R confondus)
  const ids = [...new Set([...c.students.map(s => s.id), ...list.flatMap(p => [p.d, p.r])])];
  const rows = ids.map(id => {
    const mine = list.filter(p => p.d === id || p.r === id);
    const snapP = list.find(p => p.d === id) ? list.find(p => p.d === id).dSnap : (list.find(p => p.r === id) || {}).rSnap;
    const s = stu(c, id) || (snapP ? { id, ...snapP } : null);
    return { id, s, mine, st: stats(mine), nD: mine.filter(p => p.d === id).length, nR: mine.filter(p => p.r === id).length };
  }).filter(r => r.s && (r.mine.length || stu(c, r.id))).sort((a, b) => byFirst(a.s, b.s));
  $('#b-table').innerHTML = `
    <tr><th style="text-align:left">Élève</th><th>Passages<br><small>D / R</small></th><th>Ratés</th><th>Écart<br>moyen</th>
      ${CRITERIA.map(cr => `<th class="crit-h">${esc(cr.label)}</th>`).join('')}</tr>
    ${rows.map(r => `<tr class="${r.mine.length ? '' : 'none'}">
      <td class="name">${esc(dnStudent(c, r.s))}</td>
      <td>${r.mine.length ? `${r.mine.length} <small class="meta">(${r.nD} / ${r.nR})</small>` : '–'}</td>
      <td>${r.st.nFail || (r.mine.length ? 0 : '–')}</td>
      <td>${r.st.mean != null ? fgap(r.st.mean) : '–'}</td>
      ${r.st.crit.map(cr => `<td>${cr.n ? `<span class="chip ${pct(cr.yes, cr.n) >= 70 ? 'hi' : pct(cr.yes, cr.n) >= 40 ? 'mid' : 'lo'}">${cr.yes}/${cr.n}</span>` : '–'}</td>`).join('')}
    </tr>`).join('')}`;

  // historique complet
  const h = [...list].sort((a, b) => b.ts - a.ts);
  $('#h-count').textContent = `(${h.length})`;
  $('#b-hist').innerHTML = h.length ? h.map(p => `
    <div class="list-item ${p.fail ? 'failed' : ''}">
      <div class="grow">
        ${p.fail ? `<span class="tag ko">Raté · ${esc((FAILS.find(f => f.k === p.fail) || {}).label || '')}</span>` : `<span class="tag ${gapCls(p.gap ?? -99)}">Écart ${fgap(p.gap)}</span>`}
        <span class="role d">D</span> ${esc(dn(c, p.d, p.dSnap))} → <span class="role r">R</span> ${esc(dn(c, p.r, p.rSnap))}
        <div class="meta">${new Date(p.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(p.tablet || 'tablette sans nom')} · total ${fmt(p.tEnd)} s · Zt ${fmt(p.tZt)} s</div>
        <div class="crit-marks">${CRITERIA.map(cr => `<span class="${p.c[cr.k] ? 'y' : 'n'}">${p.c[cr.k] ? '✓' : '✗'} ${esc(cr.label)}</span>`).join('')}</div>
      </div>
      <button class="btn danger-ghost small" data-delp="${p.id}">Suppr.</button>
    </div>`).join('') : '<div class="empty">Aucun passage.</div>';
  $('#b-hist').querySelectorAll('[data-delp]').forEach(b => b.onclick = () => {
    if (!confirm('Supprimer définitivement ce passage ?')) return;
    c.passages = c.passages.filter(p => p.id !== b.dataset.delp); save(); renderBilan(true);
  });
}

/* ---------------- fusion des tablettes ---------------- */
$('#m-export').onclick = () => {
  const c = cls(); if (!c.passages.length) { toast('Aucun passage à envoyer'); return; }
  const data = { type: 'relaisz-passages', v: 2, className: c.name, tablet: S.settings.tablet, exported: Date.now(), students: c.students, passages: c.passages };
  const name = `RelaisZ_${safeName(c.name)}_${safeName(S.settings.tablet || 'tablette')}_${dayOf(Date.now())}.json`;
  deliver(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
};
$('#m-import').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  const c = cls(); let added = 0, dup = 0, newS = 0;
  for (const f of files) {
    try {
      const d = JSON.parse(await f.text());
      if (d.type !== 'relaisz-passages' || !Array.isArray(d.passages)) { toast(`${f.name} : fichier non reconnu`); continue; }
      if (d.className && norm(d.className) !== norm(c.name) && !confirm(`Le fichier vient de la classe « ${d.className} ». Le fusionner dans « ${c.name} » ?`)) continue;
      newS += mergeStudents(c, (d.students || []).map(s => ({ id: s.id, nom: s.nom, prenom: s.prenom })));
      const known = new Set(c.passages.map(p => p.id));
      d.passages.forEach(p => { if (known.has(p.id)) dup++; else { c.passages.push({ ...p, local: false }); added++; } });
    } catch (err) { toast(`${f.name} : lecture impossible`); }
  }
  save(); renderBilan();
  toast(`${added} passage(s) ajouté(s)${dup ? ` · ${dup} déjà présent(s)` : ''}${newS ? ` · ${newS} élève(s) ajouté(s)` : ''}`);
});

/* ---------------- export ---------------- */
const safeName = s => String(s).replace(/[^\p{L}\d _-]+/gu, '').trim().replace(/\s+/g, '_') || 'classe';
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const yn = v => v === true ? 'Oui' : v === false ? 'Non' : '';
$('#exp-xlsx').onclick = () => {
  const c = cls(); const list = filtered(c).sort((a, b) => a.ts - b.ts);
  const st = binGaps(stats(list));
  const nm = (id, sn) => { const s = stu(c, id) || sn || {}; return [s.nom || '', s.prenom || '']; };

  const pass = [['Date', 'Tablette', 'Démarreur – Nom', 'Démarreur – Prénom', 'Relayeur – Nom', 'Relayeur – Prénom', 'Statut', 'Cause',
    'Temps total (s)', 'Entrée Zt (s)', 'Temps Zt (s)', 'V Zt (m/s)', 'V hors Zt (m/s)', 'Écart vitesse Zt (%)', ...CRITERIA.map(cr => cr.label)]]
    .concat(list.map(p => [
      new Date(p.ts).toLocaleString('fr-FR'), p.tablet || '', ...nm(p.d, p.dSnap), ...nm(p.r, p.rSnap),
      p.fail ? 'Raté' : 'Réussi', p.fail ? (FAILS.find(f => f.k === p.fail) || {}).label : '',
      p.tEnd != null ? +(p.tEnd / 1000).toFixed(2) : '', p.tIn != null ? +(p.tIn / 1000).toFixed(2) : '', p.tZt != null ? +(p.tZt / 1000).toFixed(2) : '',
      p.vZt ?? '', p.vR ?? '', p.gap ?? '', ...CRITERIA.map(cr => yn(p.c[cr.k]))]));

  const bil = [['Bilan de classe', c.name], ['Passages', st.N], ['Réussis', st.N - st.nFail], ['Ratés', st.nFail],
    ...st.failBy.map(f => ['  ' + f.label, f.n]), ['Écart moyen vitesse Zt (%)', st.mean != null ? +st.mean.toFixed(1) : ''], [],
    ['Critère', 'Oui', 'Observés', '% Oui'], ...st.crit.map(cr => [cr.label, cr.yes, cr.n, pct(cr.yes, cr.n)]), [],
    ['Écart vitesse Zt', 'Passages', '%'], ...st.bins.map(b => [b.label, b.n, pct(b.n, st.gaps.length)])];

  const ids = [...new Set([...c.students.map(s => s.id), ...list.flatMap(p => [p.d, p.r])])];
  const el = [['Nom', 'Prénom', 'Passages', 'Démarreur', 'Relayeur', 'Ratés', 'Écart moyen (%)', ...CRITERIA.map(cr => cr.label + ' (Oui/observés)')]]
    .concat(ids.map(id => {
      const mine = list.filter(p => p.d === id || p.r === id); const s2 = stats(mine);
      const sn = (mine.find(p => p.d === id) || {}).dSnap || (mine.find(p => p.r === id) || {}).rSnap;
      return [...nm(id, sn), mine.length, mine.filter(p => p.d === id).length, mine.filter(p => p.r === id).length, s2.nFail,
        s2.mean != null ? +s2.mean.toFixed(1) : '', ...s2.crit.map(cr => cr.n ? `${cr.yes}/${cr.n}` : '')];
    }).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0], 'fr')));

  const wb = XLSX.utils.book_new();
  const w1 = XLSX.utils.aoa_to_sheet(bil); w1['!cols'] = [{ wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const w2 = XLSX.utils.aoa_to_sheet(el); w2['!cols'] = el[0].map((_, i) => ({ wch: i < 2 ? 18 : i < 7 ? 11 : 26 }));
  const w3 = XLSX.utils.aoa_to_sheet(pass); w3['!cols'] = pass[0].map((_, i) => ({ wch: i < 6 ? 18 : i < 14 ? 12 : 26 }));
  XLSX.utils.book_append_sheet(wb, w1, 'Bilan classe');
  XLSX.utils.book_append_sheet(wb, w2, 'Par élève');
  XLSX.utils.book_append_sheet(wb, w3, 'Passages');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  deliver(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Relais_bilan_${safeName(c.name)}.xlsx`);
};

/* ---------------- réglages & sauvegarde ---------------- */
function renderSettings() {
  $('#set-tablet').value = S.settings.tablet || '';
  $('#set-total').value = S.settings.total; $('#set-zt').value = S.settings.zt;
  $('#crit-list').innerHTML = CRITERIA.map(cr => `<li>${esc(cr.label)}</li>`).join('') + '<li>+ écart de vitesse dans la Zt (calculé)</li>';
}
$('#set-save').onclick = () => {
  const total = parseFloat($('#set-total').value), zt = parseFloat($('#set-zt').value);
  const tablet = $('#set-tablet').value.trim();
  if (!(total > 0 && zt > 0 && zt < total)) { toast('Valeurs invalides (Zt < distance totale)'); return; }
  const oldName = S.settings.tablet;
  Object.assign(S.settings, { total, zt, tablet });
  // les passages faits sur cette tablette prennent le nouveau nom
  if (oldName !== tablet) S.classes.forEach(c => c.passages.forEach(p => { if (p.local) p.tablet = tablet; }));
  save(); toast('Réglages enregistrés');
};
$('#bk-export').onclick = () => {
  deliver(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `RelaisZ_sauvegarde_${safeName(S.settings.tablet || 'tablette')}_${dayOf(Date.now())}.json`);
};
$('#bk-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.classes) || d.v !== 2) throw 0;
    if (!confirm('Remplacer toutes les données de cette tablette par cette sauvegarde ?')) return;
    Object.keys(S).forEach(k => delete S[k]); Object.assign(S, d);
    save(); toast('Sauvegarde restaurée'); show('classes');
  } catch (err) { toast('Fichier de sauvegarde invalide (v2 attendue)'); }
});

/* ---------------- démarrage ---------------- */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view === 'chrono') requestWake(); });
window.addEventListener('beforeunload', e => { if (S.pending) { e.preventDefault(); e.returnValue = ''; } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
show(S.pending ? 'eval' : cls() ? 'tiles' : 'classes');
