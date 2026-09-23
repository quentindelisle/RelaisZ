/* RelaisZ – évaluation du relais en EPS · N'EPS by Quentin Delisle */
'use strict';

const KEY = 'relaisz_v1';
const PTS = { main: 3, noTurn: 3, faster: 4, equal: 3, slower: 0 };
const NB_PASSAGES = 4;

/* ---------------- état & stockage ---------------- */
const S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.classes) return d; } catch (e) {}
  return { settings: { total: 80, zt: 20, tol: 3 }, classes: [], cur: null };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Sauvegarde impossible (stockage plein ?)'); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms, d = 2) => (ms / 1000).toFixed(d).replace('.', ',');
const fnum = (n, d = 2) => n.toFixed(d).replace('.', ',');
const cls = () => S.classes.find(c => c.id === S.cur) || null;
const stu = (c, id) => c.students.find(s => s.id === id);
const fullName = s => s ? `${s.nom} ${s.prenom}`.trim() : '(élève supprimé)';

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- navigation ---------------- */
let view = 'classes';
function show(v) {
  if (['tiles', 'results'].includes(v) && !cls()) { toast('Importez ou choisissez une classe'); v = 'classes'; }
  view = v;
  $$('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v || (b.dataset.view === 'tiles' && ['chrono', 'eval'].includes(v))));
  $('#hdr-class').textContent = cls() ? '· ' + cls().name : '';
  ({ classes: renderClasses, tiles: renderTiles, results: renderResults, settings: renderSettings }[v] || (() => {}))();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(b => b.addEventListener('click', () => {
  if (['chrono', 'eval'].includes(view) && !confirm('Quitter le passage en cours ? Il ne sera pas enregistré.')) return;
  stopClock(); show(b.dataset.view);
}));

/* ---------------- scores ---------------- */
function passagesOf(c, sid) {
  return c.passages.filter(p => p.d === sid || p.r === sid).sort((a, b) => a.ts - b.ts);
}
function noteOf(c, sid) {
  const sc = passagesOf(c, sid).map(p => p.score);
  const kept = sc.length > NB_PASSAGES ? [...sc].sort((a, b) => b - a).slice(0, NB_PASSAGES) : sc;
  const sum = kept.reduce((a, b) => a + b, 0);
  return { n: sc.length, scores: sc, note: sum / NB_PASSAGES };
}
function speedPoints(vZt, vR, tol) {
  const diff = (vZt - vR) / vR * 100;
  if (Math.abs(diff) <= tol) return { pts: PTS.equal, key: 'equal', diff };
  return diff > 0 ? { pts: PTS.faster, key: 'faster', diff } : { pts: PTS.slower, key: 'slower', diff };
}

/* ---------------- import ---------------- */
let pending = null;
$('#imp-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const rows = /\.(csv|txt)$/i.test(f.name) ? await readCSV(f) : await readXLSX(f);
    const list = parseRows(rows);
    if (!list.length) { toast('Aucun élève trouvé dans le fichier'); return; }
    pending = list;
    if (!$('#imp-name').value.trim()) $('#imp-name').value = f.name.replace(/\.[^.]+$/, '');
    $('#imp-preview').innerHTML = `
      <p><b>${list.length} élèves détectés</b> – vérifiez le découpage Nom / Prénom :</p>
      <div class="preview-list">${list.map(s => `<div><b>${esc(s.nom)}</b> ${esc(s.prenom)}</div>`).join('')}</div>
      <div class="row gap wrap">
        <button class="btn primary" id="imp-ok">Créer la classe</button>
        ${cls() ? `<button class="btn ghost" id="imp-add">Ajouter à « ${esc(cls().name)} »</button>` : ''}
        <button class="btn ghost" id="imp-no">Annuler</button>
      </div>`;
    $('#imp-ok').onclick = () => {
      const name = $('#imp-name').value.trim() || 'Classe';
      const c = { id: uid(), name, students: pending.map(s => ({ id: uid(), ...s })), passages: [], created: Date.now() };
      S.classes.push(c); S.cur = c.id; save(); resetImport();
      toast(`Classe « ${name} » créée`); show('tiles');
    };
    if ($('#imp-add')) $('#imp-add').onclick = () => {
      const c = cls();
      const known = new Set(c.students.map(s => (s.nom + '|' + s.prenom).toLowerCase()));
      let n = 0;
      pending.forEach(s => { if (!known.has((s.nom + '|' + s.prenom).toLowerCase())) { c.students.push({ id: uid(), ...s }); n++; } });
      save(); resetImport(); toast(`${n} élève(s) ajouté(s)`); show('tiles');
    };
    $('#imp-no').onclick = resetImport;
  } catch (err) {
    console.error(err); toast('Lecture du fichier impossible');
  }
});
function resetImport() { pending = null; $('#imp-preview').innerHTML = ''; $('#imp-name').value = ''; }

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
const isUpper = w => /\p{L}/u.test(w) && w === w.toLocaleUpperCase('fr');
function splitName(full) {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 1) return { nom: parts[0], prenom: '' };
  let i = 0; while (i < parts.length && isUpper(parts[i])) i++;
  if (i === 0 || i === parts.length) i = 1; // pas de majuscules distinctives : 1er mot = nom
  return { nom: parts.slice(0, i).join(' '), prenom: parts.slice(i).join(' ') };
}
function parseRows(rows) {
  const out = [];
  rows.forEach((r, idx) => {
    const a = String(r[0] ?? '').trim(), b = String(r[1] ?? '').trim();
    if (!a) return;
    if (idx === 0 && /^(nom|noms|élève|eleve|élèves|eleves|name|identit)/i.test(a)) return; // en-tête
    // colonne B = prénom seulement si ce n'est pas un nombre / une date
    if (b && !/^[\d\s.,/:-]+$/.test(b)) out.push({ nom: a, prenom: b });
    else out.push(splitName(a));
  });
  return out.sort(byName);
}
const byName = (x, y) => (x.nom + ' ' + x.prenom).localeCompare(y.nom + ' ' + y.prenom, 'fr', { sensitivity: 'base' });

/* ---------------- classes ---------------- */
function renderClasses() {
  const el = $('#class-list');
  if (!S.classes.length) { el.innerHTML = '<div class="empty">Aucune classe pour l\'instant.</div>'; return; }
  el.innerHTML = S.classes.map(c => `
    <div class="list-item ${c.id === S.cur ? 'current' : ''}">
      <div class="grow"><b>${esc(c.name)}</b><div class="meta">${c.students.length} élèves · ${c.passages.length} passages</div></div>
      <button class="btn ${c.id === S.cur ? 'primary' : 'ghost'} small" data-open="${c.id}">${c.id === S.cur ? 'Ouverte' : 'Ouvrir'}</button>
      <button class="btn ghost small" data-ren="${c.id}">Renommer</button>
      <button class="btn danger-ghost small" data-del="${c.id}">Suppr.</button>
    </div>`).join('');
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { S.cur = b.dataset.open; save(); show('tiles'); });
  el.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.ren); const n = prompt('Nouveau nom :', c.name);
    if (n && n.trim()) { c.name = n.trim(); save(); renderClasses(); $('#hdr-class').textContent = cls() ? '· ' + cls().name : ''; }
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = S.classes.find(x => x.id === b.dataset.del);
    if (!confirm(`Supprimer la classe « ${c.name} » et tous ses passages ?`)) return;
    S.classes = S.classes.filter(x => x.id !== c.id); if (S.cur === c.id) S.cur = S.classes[0]?.id || null;
    save(); show('classes');
  });
}

/* ---------------- tuiles ---------------- */
let sel = { d: null, r: null };
function renderTiles() {
  const c = cls(); const el = $('#tiles');
  if (!c.students.length) { el.innerHTML = '<div class="empty">Aucun élève.</div>'; updateSelBar(); return; }
  el.innerHTML = [...c.students].sort(byName).map(s => {
    const { n, note } = noteOf(c, s.id);
    const dots = Array.from({ length: Math.max(NB_PASSAGES, n) }, (_, i) =>
      `<span class="dot ${i < n ? (i < NB_PASSAGES ? 'on' : 'extra') : ''}"></span>`).join('');
    const role = sel.d === s.id ? 'd' : sel.r === s.id ? 'r' : '';
    return `<button class="tile ${n >= NB_PASSAGES ? 'done' : ''} ${role ? 'sel-' + role : ''}" data-id="${s.id}">
      ${role ? `<span class="role ${role} badge">${role.toUpperCase()}</span>` : ''}
      <span class="nom">${esc(s.nom)}</span><span class="prenom">${esc(s.prenom)}</span>
      <span class="foot"><span class="dots">${dots}</span><span class="avg">${n ? fnum(note, 1) : ''}</span></span>
    </button>`;
  }).join('');
  el.querySelectorAll('.tile').forEach(t => t.onclick = () => pick(t.dataset.id));
  updateSelBar();
}
function pick(id) {
  const c = cls();
  if (sel.d === id) { sel.d = sel.r; sel.r = null; }
  else if (sel.r === id) sel.r = null;
  else if (!sel.d) sel.d = id;
  else sel.r = id;
  renderTiles();
  if (sel.d && sel.r) {
    const full = [sel.d, sel.r].filter(x => noteOf(c, x).n >= NB_PASSAGES).map(x => fullName(stu(c, x)));
    if (full.length && !confirm(`${full.join(' et ')} a/ont déjà ${NB_PASSAGES} passages.\nContinuer ? (les ${NB_PASSAGES} meilleurs seront retenus)`)) { sel.r = null; renderTiles(); return; }
    setTimeout(startRun, 250);
  }
}
function updateSelBar() {
  const c = cls();
  [['d', 'Touchez le démarreur'], ['r', 'puis le relayeur']].forEach(([k, ph]) => {
    const slot = $('#slot-' + k);
    slot.classList.toggle('filled', !!sel[k]);
    slot.querySelector('.who').textContent = sel[k] ? fullName(stu(c, sel[k])) : ph;
  });
}
$('#sel-clear').onclick = () => { sel = { d: null, r: null }; renderTiles(); };
$('#add-student').onclick = () => {
  const v = prompt('NOM Prénom de l\'élève :'); if (!v || !v.trim()) return;
  cls().students.push({ id: uid(), ...splitName(v) }); save(); renderTiles();
};

/* ---------------- chrono ---------------- */
let run = null, raf = null, wake = null;
function startRun() {
  run = { d: sel.d, r: sel.r, t0: null, marks: [] }; // marks : [entréeZt, finZt, fin] en ms depuis le départ
  sel = { d: null, r: null };
  paintPair(); renderChrono(); show('chrono');
  requestWake();
}
function paintPair() {
  const c = cls();
  $('#c-d').textContent = $('#e-d').textContent = fullName(stu(c, run.d));
  $('#c-r').textContent = $('#e-r').textContent = fullName(stu(c, run.r));
}
$('#c-swap').onclick = () => { [run.d, run.r] = [run.r, run.d]; paintPair(); };

function step() { return run.t0 === null ? 0 : run.marks.length + 1; }
function renderChrono() {
  const st = step();
  $$('.cbtn').forEach(b => {
    const k = +b.dataset.step;
    b.classList.toggle('next', k === st); b.classList.toggle('done', k < st); b.disabled = k !== st;
  });
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
  if (run.marks.length === 3) { cancelAnimationFrame(raf); setTimeout(openEval, 350); }
}));
$('#c-undo').onclick = () => {
  if (!run) return;
  if (run.marks.length) run.marks.pop();
  else if (run.t0 !== null) { run.t0 = null; cancelAnimationFrame(raf); }
  renderChrono(); if (run.t0 !== null && run.marks.length < 3) { cancelAnimationFrame(raf); tick(); }
};
$('#c-reset').onclick = () => { if (!run) return; run.t0 = null; run.marks = []; cancelAnimationFrame(raf); renderChrono(); };
$('#c-cancel').onclick = () => { if (confirm('Abandonner ce passage ?')) { run = null; stopClock(); show('tiles'); } };

async function requestWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

/* ---------------- évaluation ---------------- */
let ev = null;
function openEval() {
  const { total, zt, tol } = S.settings;
  const [tIn, tOut, tEnd] = run.marks;
  const tZt = tOut - tIn, tRest = tEnd - tZt;
  if (tZt <= 0 || tRest <= 0) { toast('Temps incohérents, recommencez'); $('#c-reset').onclick(); return; }
  const vZt = zt / (tZt / 1000), vR = (total - zt) / (tRest / 1000);
  const sp = speedPoints(vZt, vR, tol);
  ev = { main: null, noTurn: null, tZt, tRest, tEnd, tIn, vZt, vR, sp };
  stopClock();

  $('#e-times').innerHTML = `
    <div><span>Temps total (${total} m)</span><b>${fmt(tEnd)} s</b></div>
    <div><span>Entrée Zt</span><b>${fmt(tIn)} s</b></div>
    <div><span>Temps Zt (${zt} m)</span><b>${fmt(tZt)} s</b></div>
    <div><span>Hors Zt (${total - zt} m)</span><b>${fmt(tRest)} s</b></div>`;
  const labels = { faster: 'Vitesse Zt supérieure', equal: 'Vitesse Zt égale', slower: 'Vitesse Zt inférieure' };
  $('#speed-box').innerHTML = `
    <div class="speed">
      <div><span>Vitesse dans la Zt</span><b>${fnum(vZt)} m/s</b><span>${fnum(vZt * 3.6, 1)} km/h</span></div>
      <div><span>Vitesse hors Zt</span><b>${fnum(vR)} m/s</b><span>${fnum(vR * 3.6, 1)} km/h</span></div>
    </div>
    <div class="verdict p${sp.pts}">${labels[sp.key]} (${sp.diff >= 0 ? '+' : ''}${fnum(sp.diff, 1)} %) → ${sp.pts} pts</div>
    <p class="hint">Tolérance « égale » : ±${String(tol).replace('.', ',')} %</p>`;

  $$('#v-eval .yn .btn').forEach(b => b.classList.remove('chosen'));
  ['#q2', '#q3', '#e-total', '#e-save'].forEach(s => $(s).classList.add('hidden'));
  show('eval');
}
$$('#v-eval .yn .btn').forEach(b => b.onclick = () => {
  const q = b.dataset.q, v = b.dataset.v === '1';
  ev[q] = v;
  b.parentElement.querySelectorAll('.btn').forEach(x => x.classList.toggle('chosen', x === b));
  if (q === 'main') $('#q2').classList.remove('hidden');
  if (ev.main !== null && ev.noTurn !== null) {
    ['#q3', '#e-total', '#e-save'].forEach(s => $(s).classList.remove('hidden'));
    const pm = ev.main ? PTS.main : 0, pn = ev.noTurn ? PTS.noTurn : 0;
    ev.score = pm + pn + ev.sp.pts;
    $('#e-total').innerHTML = `Note du passage : <b>${ev.score}</b> / 10
      <div class="hint">Main ${pm} + Ne se retourne pas ${pn} + Vitesse ${ev.sp.pts}</div>`;
  }
  b.closest('.card').nextElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#e-save').onclick = () => {
  const c = cls();
  c.passages.push({
    id: uid(), ts: Date.now(), d: run.d, r: run.r,
    tIn: Math.round(ev.tIn), tZt: Math.round(ev.tZt), tEnd: Math.round(ev.tEnd),
    vZt: +ev.vZt.toFixed(3), vR: +ev.vR.toFixed(3),
    main: ev.main, noTurn: ev.noTurn, speed: ev.sp.key, ptsSpeed: ev.sp.pts, score: ev.score,
    cfg: { ...S.settings }
  });
  save();
  toast(`Passage enregistré : ${ev.score}/10`);
  run = null; ev = null; show('tiles');
};
$('#e-cancel').onclick = () => { if (confirm('Annuler ce passage sans l\'enregistrer ?')) { run = null; ev = null; show('tiles'); } };

/* ---------------- résultats ---------------- */
function resultRows(c) {
  return [...c.students].sort(byName).map(s => {
    const r = noteOf(c, s.id);
    const cells = Array.from({ length: Math.max(NB_PASSAGES, r.n) }, (_, i) => r.scores[i] ?? null);
    return { s, ...r, cells };
  });
}
function renderResults() {
  const c = cls(); $('#r-class').textContent = '· ' + c.name;
  const rows = resultRows(c);
  const maxP = Math.max(NB_PASSAGES, ...rows.map(r => r.n));
  const passes = rows.map(r => passagesOf(c, r.s.id));
  $('#r-table').innerHTML = `
    <tr><th style="text-align:left">Élève</th>${Array.from({ length: maxP }, (_, i) => `<th>P${i + 1}</th>`).join('')}<th>Note /10</th></tr>
    ${rows.map((r, ri) => `<tr>
      <td class="name">${esc(r.s.nom)} ${esc(r.s.prenom)}</td>
      ${Array.from({ length: maxP }, (_, i) => r.cells[i] == null
        ? `<td class="miss">${i < NB_PASSAGES ? '0' : ''}</td>`
        : `<td class="pbtn" data-p="${passes[ri][i].id}">${r.cells[i]}</td>`).join('')}
      <td class="note">${fnum(r.note, 2)}</td></tr>`).join('')}`;
  $('#r-table').querySelectorAll('[data-p]').forEach(td => td.onclick = () => passageDetail(td.dataset.p));

  const h = [...c.passages].sort((a, b) => b.ts - a.ts);
  $('#r-hist').innerHTML = h.length ? h.map(p => `
    <div class="list-item">
      <div class="grow"><b>${p.score}/10</b> · <span class="role d">D</span> ${esc(fullName(stu(c, p.d)))} → <span class="role r">R</span> ${esc(fullName(stu(c, p.r)))}
        <div class="meta">${new Date(p.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · total ${fmt(p.tEnd)} s · Zt ${fmt(p.tZt)} s ·
        main ${p.main ? '✓' : '✗'} · ne se retourne pas ${p.noTurn ? '✓' : '✗'} · vitesse ${p.ptsSpeed} pts</div></div>
      <button class="btn danger-ghost small" data-delp="${p.id}">Suppr.</button>
    </div>`).join('') : '<div class="empty">Aucun passage enregistré.</div>';
  $('#r-hist').querySelectorAll('[data-delp]').forEach(b => b.onclick = () => delPassage(b.dataset.delp));
}
function passageDetail(pid) {
  const c = cls(), p = c.passages.find(x => x.id === pid);
  const txt = `${fullName(stu(c, p.d))} (D) → ${fullName(stu(c, p.r))} (R)\n` +
    `Note : ${p.score}/10\nTemps total : ${fmt(p.tEnd)} s · Zt : ${fmt(p.tZt)} s\n` +
    `V Zt ${fnum(p.vZt)} m/s · V hors Zt ${fnum(p.vR)} m/s\n` +
    `Main : ${p.main ? 'valable' : 'non valable'} · Ne se retourne pas : ${p.noTurn ? 'oui' : 'non'}\n\nSupprimer ce passage (pour les 2 élèves) ?`;
  if (confirm(txt)) delPassage(pid, true);
}
function delPassage(pid, confirmed) {
  if (!confirmed && !confirm('Supprimer ce passage ? (il sera retiré pour les 2 élèves)')) return;
  const c = cls(); c.passages = c.passages.filter(p => p.id !== pid); save(); renderResults(); toast('Passage supprimé');
}

/* ---------------- export ---------------- */
function exportData() {
  const c = cls(); const rows = resultRows(c);
  const head = ['Nom', 'Prénom', ...Array.from({ length: NB_PASSAGES }, (_, i) => 'Passage ' + (i + 1)), 'Passages effectués', 'Note /10'];
  const notes = rows.map(r => [r.s.nom, r.s.prenom,
    ...Array.from({ length: NB_PASSAGES }, (_, i) => r.scores[i] ?? 0), r.n, +r.note.toFixed(2)]);
  const det = [['Date', 'Démarreur', 'Relayeur', 'Temps total (s)', 'Entrée Zt (s)', 'Temps Zt (s)', 'V Zt (m/s)', 'V hors Zt (m/s)',
    'Main valable', 'Ne se retourne pas', 'Pts vitesse', 'Note /10']]
    .concat([...c.passages].sort((a, b) => a.ts - b.ts).map(p => [
      new Date(p.ts).toLocaleString('fr-FR'), fullName(stu(c, p.d)), fullName(stu(c, p.r)),
      +(p.tEnd / 1000).toFixed(2), +(p.tIn / 1000).toFixed(2), +(p.tZt / 1000).toFixed(2), p.vZt, p.vR,
      p.main ? 'Oui' : 'Non', p.noTurn ? 'Oui' : 'Non', p.ptsSpeed, p.score]));
  return { head, notes, det, name: c.name };
}
const safeName = s => s.replace(/[^\p{L}\d _-]+/gu, '').trim() || 'classe';
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('#exp-xlsx').onclick = () => {
  const d = exportData(); const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([d.head, ...d.notes]); ws1['!cols'] = [{ wch: 20 }, { wch: 16 }, ...d.head.slice(2).map(() => ({ wch: 11 }))];
  const ws2 = XLSX.utils.aoa_to_sheet(d.det); ws2['!cols'] = d.det[0].map((_, i) => ({ wch: i < 3 ? 22 : 13 }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Notes'); XLSX.utils.book_append_sheet(wb, ws2, 'Passages');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  deliver(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Relais_${safeName(d.name)}.xlsx`);
};
$('#exp-csv').onclick = () => {
  const d = exportData();
  const csv = '﻿' + [d.head, ...d.notes].map(r => r.map(v => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  deliver(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `Relais_${safeName(d.name)}.csv`);
};

/* ---------------- réglages & sauvegarde ---------------- */
function renderSettings() {
  $('#set-total').value = S.settings.total; $('#set-zt').value = S.settings.zt; $('#set-tol').value = S.settings.tol;
}
$('#set-save').onclick = () => {
  const total = parseFloat($('#set-total').value), zt = parseFloat($('#set-zt').value), tol = parseFloat($('#set-tol').value);
  if (!(total > 0 && zt > 0 && zt < total && tol >= 0)) { toast('Valeurs invalides (Zt < distance totale)'); return; }
  S.settings = { total, zt, tol }; save(); toast('Réglages enregistrés');
};
$('#bk-export').onclick = () => {
  const d = new Date().toISOString().slice(0, 10);
  deliver(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `RelaisZ_sauvegarde_${d}.json`);
};
$('#bk-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.classes)) throw 0;
    if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
    Object.keys(S).forEach(k => delete S[k]); Object.assign(S, d);
    S.settings = S.settings || { total: 80, zt: 20, tol: 3 };
    save(); toast('Sauvegarde restaurée'); show('classes');
  } catch (err) { toast('Fichier de sauvegarde invalide'); }
});

/* ---------------- démarrage ---------------- */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view === 'chrono') requestWake(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
show(cls() ? 'tiles' : 'classes');
