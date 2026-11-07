/* Zones Relais – échanges entre tablettes par QR codes.
   Module repris du Kit N'EPS v1.3.1 (socle.js, bloc « Base45 » et « Échanges entre tablettes ») – Quentin Delisle · N'EPS numérique.
   JSON → compression deflate → Base45 (mode alphanumérique) → série de QR « NE:type:id:i:n:données » qui défile seule.
   Lecture : détecteur natif, sinon ZXing (WASM), sinon jsQR multi-échelles ; secours « Photo du QR ». */
'use strict';
const QR_PFX = 'NE';
const QR_CHUNK = 440;           // caractères base45 par QR (prof → tablettes)
const QR_CHUNK_R = 300;         // tablettes → prof
const APP_VERSION = '4.0.0';
function rnd(n){ const a='abcdefghijkmnpqrstuvwxyz23456789'; let s=''; for(let i=0;i<n;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }
/* Base45 : alphabet du mode « alphanumérique » des QR codes (≈ 30 % de données en plus par QR) */
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function b45enc(u8){ let s = '';
  for (let i = 0; i < u8.length; i += 2) {
    if (i + 1 < u8.length) { let x = u8[i]*256 + u8[i+1]; const c = x % 45; x = (x-c)/45; const d = x % 45; const e = (x-d)/45; s += B45[c] + B45[d] + B45[e]; }
    else { const x = u8[i], c = x % 45, d = (x-c)/45; s += B45[c] + B45[d]; }
  } return s; }
function b45dec(s){ const out = [];
  for (let i = 0; i < s.length; i += 3) {
    const c = B45.indexOf(s[i]), d = B45.indexOf(s[i+1]);
    if (i + 2 < s.length) { const x = c + d*45 + B45.indexOf(s[i+2])*2025; out.push(x >> 8, x & 255); }
    else out.push(c + d*45);
  } return new Uint8Array(out); }
async function streamBytes(u8, ts){ const st = new Blob([u8]).stream().pipeThrough(ts); return new Uint8Array(await new Response(st).arrayBuffer()); }
function chunkQR(payload, type, max=QR_CHUNK){
  const id = rnd(3).toUpperCase(), parts = [];
  const n = Math.max(1, Math.ceil(payload.length / max));
  const per = Math.ceil(payload.length / n);          // morceaux égaux = QR les moins denses possible
  for (let i = 0; i < n; i++) parts.push(`${QR_PFX}:${type}:${id}:${i+1}:${n}:` + payload.slice(i*per, (i+1)*per));
  return parts;
}
function qrDataURL(text){
  const qr = qrcode(0, 'L'); qr.addData(text, 'Alphanumeric'); qr.make();
  return qr.createDataURL(10, 40);   // marge blanche = 4 modules (zone de silence obligatoire)
}
/* Lecture d'un morceau scanné : « NE:F:ID:i:n:données » */
function parsePart(txt){
  if (!txt || !txt.startsWith(QR_PFX + ':')) return null;
  const f = txt.split(':');
  if (f.length < 6) return null;
  return { type:f[1], id:f[2], i:+f[3], n:+f[4], data:f.slice(5).join(':') };
}

/* Affichage d'une série de QR (défilement automatique) */
let qrTimer = null;
function showQRSeries(parts, container, title){
  let i = 0, auto = parts.length > 1, speed = 1000;          // 1 QR par seconde (la série tourne en boucle)
  const imgs = parts.map(qrDataURL);
  const draw = () => {
    container.innerHTML = `<div class="qr-box">
      ${title?`<h2 class="center">${title}</h2>`:''}
      <img src="${imgs[i]}" alt="QR code ${i+1}/${parts.length}">
      <div class="qr-part">${parts.length>1?`QR ${i+1} / ${parts.length}`:'QR unique'}</div>
      ${parts.length>1?`<div class="qr-nums">${parts.map((_,k)=>`<button class="${k===i?'on':''}" data-q="${k}">${k+1}</button>`).join('')}</div>
        <div class="btn-row"><button class="btn" data-q="prev">←</button>
        <button class="btn ${auto?'orange':''}" data-q="auto">${auto?'⏸ Pause':'▶ Défilement auto'}</button>
        <button class="btn" data-q="next">→</button></div>`:''}
      
    </div>`;
    container.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      const q = b.dataset.q;
      if (q === 'auto') auto = !auto;
      else if (q === 'prev') { auto = false; i = (i - 1 + parts.length) % parts.length; }
      else if (q === 'next') { auto = false; i = (i + 1) % parts.length; }
      else { auto = false; i = +q; }
      draw();
    });
  };
  clearInterval(qrTimer);
  qrTimer = setInterval(() => { if (!document.body.contains(container)) return clearInterval(qrTimer); if (auto) { i = (i+1) % parts.length; draw(); } }, speed);
  draw();
}

/* Scanner : caméra (détecteur natif si disponible, sinon jsQR sur le centre de l'image en pleine résolution)
   + secours « photo du QR » (appareil photo natif, mise au point automatique) */
let scan = null;
function stopScan(){
  if (!scan) return;
  scan.stopped = true;
  clearTimeout(scan.timer);
  if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
  scan = null;
}
let nativeDetector, scanCamIdx = 0, scanCamId = null;
async function getNativeDetector(){
  if (nativeDetector !== undefined) return nativeDetector;
  nativeDetector = null;
  try { if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) nativeDetector = new BarcodeDetector({ formats:['qr_code'] }); } catch(e){}
  return nativeDetector;
}
/* jsQR lit mal les images floues/bruitées en pleine résolution : on réduit l'image par moyennage
   (filtre « boîte », qui efface le bruit du capteur) à plusieurs échelles, en alternant d'une image à l'autre. */
const SCAN_SCALES = [0.4, 0.3, 0.5, 0.24, 0.62, 0.35, 0.8, 0.45];
function grabGray(ctx, cv, src, sx, sy, sw, sh, maxSide){
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw*k), h = Math.round(sh*k);
  cv.width = w; cv.height = h; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w*h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j]*0.3 + d[j+1]*0.59 + d[j+2]*0.11;
  return { g, w, h };
}
function boxDown(G, f){
  const { g, w, h } = G;
  if (f >= 0.999) return G;
  const nw = Math.max(1, Math.round(w*f)), nh = Math.max(1, Math.round(h*f));
  const o = new Float32Array(nw*nh), c = new Float32Array(nw*nh);
  for (let y = 0; y < h; y++) { const yy = Math.min(nh-1, (y*f)|0), row = yy*nw;
    for (let x = 0; x < w; x++) { const i = row + Math.min(nw-1, (x*f)|0); o[i] += g[y*w+x]; c[i]++; } }
  for (let i = 0; i < o.length; i++) o[i] /= c[i] || 1;
  return { g:o, w:nw, h:nh };
}
function jsqrGray(G, both){
  const { g, w, h } = G, d = new Uint8ClampedArray(w*h*4);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) { d[j] = d[j+1] = d[j+2] = g[i]; d[j+3] = 255; }
  const c = jsQR(d, w, h, { inversionAttempts: both ? 'attemptBoth' : 'dontInvert' });
  return c && c.data ? c.data : null;
}
function jsqrOn(ctx, w, h, both){
  const img = ctx.getImageData(0, 0, w, h);
  const c = jsQR(img.data, w, h, { inversionAttempts: both ? 'attemptBoth' : 'dontInvert' });
  return c && c.data ? c.data : null;
}
/* Lecteur ZXing (moteur de lecture professionnel, compilé en WebAssembly, embarqué dans l'appli) */
let zxReady = false;
try {
  if (window.ZXingWASM) ZXingWASM.prepareZXingModule({ overrides:{ locateFile:(path, prefix) => path.endsWith('.wasm') ? new URL('lib/' + path, document.baseURI).href : prefix + path }, fireImmediately:true })
    .then(() => { zxReady = true; }).catch(e => console.warn('ZXing', e));
} catch(e){}
async function zxRead(imgData, hard=true){
  if (!zxReady) return null;
  try { const r = await ZXingWASM.readBarcodes(imgData, { formats:['QRCode'], tryHarder:hard, maxNumberOfSymbols:1 });
    const ok = r.find(x => x.isValid && x.text); return ok ? ok.text : null; } catch(e){ return null; }
}
async function decodeImageSource(src, sw, sh, cv, ctx, frame, all=false){
  const det = await getNativeDetector();
  if (det) { try { const r = await det.detect(src); if (r && r.length) return r.map(x => x.rawValue); } catch(e){} }
  const side = Math.min(sw, sh) * 0.92, sx = (sw - side)/2, sy = (sh - side)/2;
  if (zxReady) {
    // ZXing : cadre central, puis image entière de temps en temps
    const k = Math.min(1, (all ? 1000 : 800) / side), w = Math.round(side*k);
    cv.width = w; cv.height = w; ctx.drawImage(src, sx, sy, side, side, 0, 0, w, w);
    let t = await zxRead(ctx.getImageData(0, 0, w, w), all || frame % 3 !== 1);
    if (t) return [t];
    if (all || frame % 3 === 2) {
      const k2 = Math.min(1, 1280 / Math.max(sw, sh)), w2 = Math.round(sw*k2), h2 = Math.round(sh*k2);
      cv.width = w2; cv.height = h2; ctx.drawImage(src, 0, 0, sw, sh, 0, 0, w2, h2);
      t = await zxRead(ctx.getImageData(0, 0, w2, h2));
      if (t) return [t];
    }
    if (!all && frame % 2 === 0) return [];        // une image sur deux : aussi jsQR (ci-dessous)
  }
  const G = grabGray(ctx, cv, src, sx, sy, side, side, 1100);
  const scales = all ? SCAN_SCALES : [SCAN_SCALES[frame % SCAN_SCALES.length], SCAN_SCALES[(frame+3) % SCAN_SCALES.length]];
  for (const f of scales) {
    const t = jsqrGray(boxDown(G, f * side / G.w), all || frame % 5 === 4);
    if (t) return [t];
  }
  if (all || frame % 4 === 3) {                      // image entière (QR hors du cadre)
    const F = grabGray(ctx, cv, src, 0, 0, sw, sh, 1100);
    for (const f of (all ? [0.35, 0.5, 0.7] : [0.5])) { const t = jsqrGray(boxDown(F, f), all); if (t) return [t]; }
  }
  return [];
}
async function startScan(container, expectType, onDone){
  stopScan();
  container.innerHTML = `<div class="scan-wrap"><video playsinline webkit-playsinline muted autoplay></video><div class="scan-frame"></div></div>
    <div style="max-width:560px;margin:12px auto">
      <div class="scan-parts"></div>
      <p class="center" style="font-weight:900;font-size:20px" id="scan-msg">Démarrage de la caméra…</p>
      <div class="btn-row" style="justify-content:center"><button class="btn" data-cam>🔄 Caméra</button><label class="btn orange">📷 Photo du QR<input type="file" accept="image/*" capture="environment" hidden class="scan-photo"></label></div>
      <p class="center" id="scan-diag" style="font-size:12px;color:var(--grey);margin-top:8px"></p></div>`;
  const video = container.querySelector('video'), msg = container.querySelector('#scan-msg'), partsEl = container.querySelector('.scan-parts');
  const me = scan = { stopped:false, parts:{}, id:null, n:0, frame:0 };
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently:true });
  const showParts = () => { const got = Object.keys(me.parts).length, pc = me.n ? Math.round(got / me.n * 100) : 0;
    partsEl.innerHTML = me.n > 1 ? `<div class="scan-prog"><div class="scan-bar" style="width:${pc}%"></div><span>${pc} %</span></div>` : ''; };
  let finished = false;
  const handle = async texts => {
    for (const txt of texts) {
      const pt = parsePart(txt);
      if (!pt) { msg.textContent = 'QR non reconnu (ce n\'est pas un QR Zones Relais).'; continue; }
      const okTypes = [].concat(expectType || []);
      if (okTypes.length && !okTypes.includes(pt.type)) { msg.textContent = okTypes.includes('R') ? 'Ce QR est destiné aux tablettes élèves (📷 Recevoir la séance).' : 'Ce QR est destiné à la tablette enseignant (📥 Récupérer les résultats).'; continue; }
      if (pt.id === me.doneId) continue;            // QR déjà traité (encore devant la caméra)
      if (me.id !== pt.id) { me.id = pt.id; me.parts = {}; me.n = pt.n; }
      if (!me.parts[pt.i]) { me.parts[pt.i] = pt.data; if (navigator.vibrate) navigator.vibrate(40); }
      const got = Object.keys(me.parts).length;
      showParts();
      const miss = Array.from({length:me.n},(_,k)=>k+1).filter(k=>!me.parts[k]);
      msg.textContent = me.n > 1 ? (got < me.n ? `Import : ${Math.round(got / me.n * 100)} % · laissez défiler les QR devant la caméra` : 'Import : 100 %') : 'QR reçu !';
      if (got === me.n && !finished) {
        finished = true;
        const payload = Array.from({length: me.n}, (_, k) => me.parts[k+1]).join('');
        me.doneId = me.id; me.id = null; me.parts = {};
        let r;
        try { r = await onDone(await decodePacket(payload)); }
        catch(e) { console.warn(e); toast('⚠️ ' + e.message, 3500); r = 'continue'; }
        if (r === 'continue' && scan === me && !me.stopped) {     // la caméra reste allumée pour le QR suivant
          finished = false; showParts(); msg.textContent = '✓ Reçu'; me.timer = setTimeout(tick, 400);
        } else if (scan === me) stopScan();
        return;
      }
    }
  };
  // secours photo
  container.querySelector('.scan-photo').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    msg.textContent = 'Lecture de la photo…';
    try {
      const bmp = await createImageBitmap(f);
      const pcv = document.createElement('canvas'), pctx = pcv.getContext('2d', { willReadFrequently:true });
      const r = await decodeImageSource(bmp, bmp.width, bmp.height, pcv, pctx, 0, true);
      if (r.length) await handle(r); else msg.textContent = '⚠️ QR non trouvé sur la photo : recommencez en cadrant le QR bien net, en entier.';
    } catch(err) { msg.textContent = '⚠️ Photo illisible'; }
  });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.innerHTML = '⚠️ Caméra indisponible : utilisez 📷 Photo du QR.'; return;
  }
  const diag = container.querySelector('#scan-diag');
  container.querySelector('[data-cam]').onclick = async () => {
    try { const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      if (cams.length < 2) return toast('Une seule caméra');
      scanCamIdx = (scanCamIdx + 1) % cams.length; scanCamId = cams[scanCamIdx].deviceId;
      startScan(container, expectType, onDone); } catch(e){}
  };
  // Plusieurs réglages essayés dans l'ordre (certains appareils donnent une image noire en haute résolution)
  const attempts = scanCamId
    ? [{ deviceId:{ exact: scanCamId } }]
    : [{ facingMode:'environment' }, { facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, true];
  let lastErr = null;
  for (const vc of attempts) {
    try { me.stream = await navigator.mediaDevices.getUserMedia({ video: vc, audio:false }); break; }
    catch(e) { lastErr = e; }
  }
  if (!me.stream) {
    const n = lastErr && lastErr.name;
    msg.innerHTML = n === 'NotAllowedError' ? '⚠️ Caméra refusée : autorisez la caméra pour ce site dans les réglages, ou utilisez 📷 Photo du QR.'
      : '⚠️ Caméra impossible à ouvrir (' + esc(n || 'erreur') + ') : utilisez 📷 Photo du QR.';
    return;
  }
  if (me.stopped) { me.stream.getTracks().forEach(t=>t.stop()); return; }
  const track = me.stream.getVideoTracks()[0];
  try { await track.applyConstraints({ advanced:[{ focusMode:'continuous' }] }); } catch(e){}
  video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.muted = true; video.autoplay = true;
  video.srcObject = me.stream;
  const playIt = () => video.play().catch(()=>{});
  video.onloadedmetadata = playIt; playIt();
  msg.textContent = 'Visez le QR code…';
  const reader = () => nativeDetector ? 'lecteur Android' : zxReady ? 'lecteur ZXing' : 'lecteur jsQR';
  const t0 = Date.now(); let lastDiag = 0, decodes = 0, dark = 0, switched = false;
  const probe = document.createElement('canvas'), pctx = probe.getContext('2d', { willReadFrequently:true }); probe.width = 32; probe.height = 18;
  const tick = async () => {
    if (me.stopped || finished) return;
    const now = Date.now();
    if (video.readyState >= 2 && video.videoWidth) {
      me.frame++;
      // image noire ? (mauvais objectif sur certains appareils) → on passe à une autre caméra
      if (me.frame % 10 === 1) {
        pctx.drawImage(video, 0, 0, 32, 18); const d = pctx.getImageData(0, 0, 32, 18).data; let m = 0;
        for (let i = 0; i < d.length; i += 4) m += d[i] + d[i+1] + d[i+2]; m /= (d.length/4*3);
        dark = m < 6 ? dark + 1 : 0;
        if (dark >= 4 && !switched) { switched = true; toast('Image noire : autre caméra…');
          try { const cams = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'videoinput');
            if (cams.length > 1) { const cur = track.getSettings().deviceId; const i = cams.findIndex(c => c.deviceId === cur);
              scanCamIdx = (i + 1) % cams.length; scanCamId = cams[scanCamIdx].deviceId; return startScan(container, expectType, onDone); } } catch(e){}
          msg.textContent = '⚠️ Image noire : touchez 🔄 Caméra ou utilisez 📷 Photo du QR.'; }
      }
      try { const r = await decodeImageSource(video, video.videoWidth, video.videoHeight, cv, ctx, me.frame); decodes++; if (r.length) await handle(r); } catch(e){ console.warn(e); }
    } else if (now - t0 > 4000 && me.frame === 0) {
      msg.textContent = '⚠️ La caméra ne renvoie pas d\'image : touchez 🔄 Caméra ou utilisez 📷 Photo du QR.';
      playIt();
    }
    if (diag && now - lastDiag > 1000) {
      const el = (now - (lastDiag || t0)) / 1000;
      diag.textContent = `Caméra ${video.videoWidth}×${video.videoHeight} · ${Math.round(decodes/el)} analyses/s · ${reader()} · v${APP_VERSION}`;
      lastDiag = now; decodes = 0;
    }
    if (!me.stopped && !finished) me.timer = setTimeout(tick, 60);
  };
  tick();
}
/* Paquets : JSON → deflate → Base45 */
async function encodePacket(obj){
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) { try { return 'Z' + b45enc(await streamBytes(raw, new CompressionStream('deflate-raw'))); } catch(e){} }
  return 'J' + b45enc(raw);
}
async function decodePacket(str){
  const flag = str[0], bytes = b45dec(str.slice(1));
  let raw = bytes;
  if (flag === 'Z') { if (!window.DecompressionStream) throw new Error('Appareil trop ancien pour décompresser'); raw = await streamBytes(bytes, new DecompressionStream('deflate-raw')); }
  return JSON.parse(new TextDecoder().decode(raw));
}
