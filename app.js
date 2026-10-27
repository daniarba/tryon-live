/* TryOn Live v1.1 - real-time garment overlay with MediaPipe Pose
   Realism upgrade: segmentation compositing so arms/hands appear in
   front of the garment, plus soft drop shadow under the garment. */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const video = document.createElement('video');
video.playsInline = true; video.muted = true;
const hint = document.getElementById('hint');
const statusEl = document.getElementById('status');
const fpsEl = document.getElementById('fps');

let garments = [];
let selected = -1;
let running = false, sending = false;
let lastT = 0, fpsAvg = 0;

const P = { scale: 1.65, offy: 0.12, offx: 0, rot: 0, op: 0.95 };

const els = {};
['s_scale','s_offy','s_offx','s_rot','s_op','v_scale','v_offy','v_offx','v_rot','v_op']
  .forEach(id => els[id] = document.getElementById(id));
function bindSlider(key) {
  const s = els['s_'+key], v = els['v_'+key];
  s.addEventListener('input', () => { P[key] = parseFloat(s.value); v.textContent = s.value; });
}
['scale','offy','offx','rot','op'].forEach(bindSlider);

/* ---------- garments ---------- */
const thumbs = document.getElementById('thumbs');
function renderThumbs() {
  thumbs.innerHTML = '';
  garments.forEach((g, i) => {
    const img = document.createElement('img');
    img.src = g.img.src; img.title = g.name;
    img.className = i === selected ? 'sel' : '';
    img.onclick = () => { selected = i; renderThumbs(); };
    thumbs.appendChild(img);
  });
}
function addGarmentFile(file) {
  if (!/image\//.test(file.type)) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    garments.push({ name: file.name, img });
    if (selected < 0) selected = 0;
    renderThumbs();
    hint.style.display = 'none';
  };
  img.src = url;
}
document.getElementById('file').addEventListener('change', e => {
  [...e.target.files].forEach(addGarmentFile); e.target.value = '';
});
window.addEventListener('dragover', e => { e.preventDefault(); cv.classList.add('drop'); });
window.addEventListener('dragleave', () => cv.classList.remove('drop'));
window.addEventListener('drop', e => {
  e.preventDefault(); cv.classList.remove('drop');
  [...e.dataTransfer.files].forEach(addGarmentFile);
});

/* preloaded sample garments */
(isExt ? ["shirt-white.png","shirt-black.png","shirt-blue.png","shirt-red.png"] : []).forEach(n => {
  const img = new Image();
  img.onload = () => { garments.push({ name: n, img }); if (selected < 0) selected = 0; renderThumbs(); };
  img.src = chrome.runtime.getURL('samples/' + n);
});

/* ---------- offscreen layers ---------- */
const W = cv.width, H = cv.height;
const personC = document.createElement('canvas'); personC.width = W; personC.height = H;
const personX = personC.getContext('2d');
const maskC = document.createElement('canvas'); maskC.width = W; maskC.height = H;
const maskX = maskC.getContext('2d');
const shadowC = document.createElement('canvas'); shadowC.width = W; shadowC.height = H;
const shadowX = shadowC.getContext('2d');

function drawMirrored(source) {
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0, W, H); ctx.restore();
}

/* ---------- camera ---------- */
const startBtn = document.getElementById('start');
const camSel = document.getElementById('cam');
const snapBtn = document.getElementById('snap');

async function listCams() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    camSel.innerHTML = '';
    devs.filter(d => d.kind === 'videoinput').forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || ('Camera ' + (i+1));
      camSel.appendChild(o);
    });
  } catch (e) {}
}
listCams();

startBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: camSel.value ? { exact: camSel.value } : undefined,
               width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
    startBtn.disabled = true; snapBtn.disabled = false;
    hint.textContent = '';
    startLoop();
  } catch (err) {
    statusEl.textContent = 'Camera nahi khuli: ' + err.message;
  }
};
camSel.addEventListener('change', () => { if (running) location.reload(); });

/* ---------- pose ---------- */
let modelReady = false;
statusEl.textContent = 'Body tracking model load ho raha hai…';
const isExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
const assetBase = isExt ? chrome.runtime.getURL('lib/') : 'lib/';
const pose = new Pose({ locateFile: f => assetBase + f });
pose.setOptions({
  modelComplexity: 0, smoothLandmarks: true, enableSegmentation: true,
  minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
});
pose.onResults(res => {
  if (!modelReady) { modelReady = true; statusEl.textContent = 'Model ready: kapay ab live shoulders pe track honge.'; }
  drawFrame(res); sending = false;
});

Promise.race([
  pose.initialize(),
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))
])
  .then(() => { modelReady = true; statusEl.textContent = 'Model ready: kapay ab live shoulders pe track honge.'; })
  .catch(e => { statusEl.textContent = 'Model load nahi hua (' + e.message + '). Page reload kar ke dobara koshish karein.'; });

function startLoop() {
  running = true;
  /* camera preview: video foran, model se pehle hi dikhta hai */
  const render = () => {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    if (video.videoWidth) drawMirrored(video);
    requestAnimationFrame(render);
  };
  render();

  /* body tracking: model ready hone ke baad frames bhejta hai */
  const track = async () => {
    if (!running) return;
    if (modelReady && !sending && video.readyState >= 2) {
      sending = true;
      try { await pose.send({ image: video }); } catch (e) { sending = false; }
    }
    requestAnimationFrame(track);
  };
  track();
}

/* ---------- geometry helpers ---------- */
function mirrored(lm, k) { return { x: (1 - lm[k].x) * W, y: lm[k].y * H }; }

function torsoQuad(lm, sw) {
  const L = mirrored(lm, 11), R = mirrored(lm, 12);
  const HL = mirrored(lm, 23), HR = mirrored(lm, 24);
  const e = 0.22 * sw;                      // widen past shoulders
  const dh = 0.45 * (Math.max(HL.y, HR.y) - Math.min(L.y, R.y)); // extend below hips
  const hipEx = 0.10 * Math.abs(HR.x - HL.x) + 10;
  const sL = { x: L.x - e, y: L.y - e*0.4 };
  const sR = { x: R.x + e, y: R.y - e*0.4 };
  const hR = { x: HR.x + hipEx, y: HR.y + dh };
  const hL = { x: HL.x - hipEx, y: HL.y + dh };
  return [sL, sR, hR, hL];
}

/* ---------- draw ---------- */
function drawFrame(res) {
  if (!video.videoWidth) return;

  const lm = res && res.poseLandmarks;
  if (!lm || selected < 0) {
    fpsEl.textContent = fpsAvg ? fpsAvg.toFixed(0) + ' fps' + (lm ? '' : '  •  body dhoond raha hoon…') : '';
    return;
  }

  const L = mirrored(lm, 11), R = mirrored(lm, 12);
  const dx = R.x - L.x, dy = R.y - L.y;
  const sw = Math.hypot(dx, dy);
  const cx = (L.x + R.x) / 2, cy = (L.y + R.y) / 2;
  const bodyAngle = Math.atan2(dy, dx);

  const g = garments[selected].img;
  const gw = sw * P.scale;
  const gh = gw * (g.height / g.width);
  const gx = cx + sw * P.offx;
  const gy = cy + sw * P.offy;

  /* soft shadow under garment */
  shadowX.clearRect(0, 0, W, H);
  shadowX.save();
  shadowX.translate(gx, gy);
  shadowX.rotate(-bodyAngle + P.rot * Math.PI / 180);
  shadowX.drawImage(g, -gw/2, -gh*0.10, gw, gh);
  shadowX.restore();
  shadowX.globalCompositeOperation = 'source-in';
  shadowX.fillStyle = 'rgba(0,0,0,1)';
  shadowX.fillRect(0, 0, W, H);
  shadowX.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.filter = 'blur(9px)';
  ctx.drawImage(shadowC, 6, 12);
  ctx.restore();
  ctx.filter = 'none';

  /* garment */
  ctx.save();
  ctx.globalAlpha = P.op;
  ctx.translate(gx, gy);
  ctx.rotate(-bodyAngle + P.rot * Math.PI / 180);
  ctx.drawImage(g, -gw/2, -gh*0.10, gw, gh);
  ctx.restore();

  /* arms / face / legs in front of the garment (segmentation compositing) */
  const mask = res.segmentationMask;
  if (mask) {
    personX.globalCompositeOperation = 'source-over';
    personX.clearRect(0, 0, W, H);
    personX.save(); personX.translate(W, 0); personX.scale(-1, 1);
    personX.drawImage(video, 0, 0, W, H);
    personX.restore();

    maskX.clearRect(0, 0, W, H);
    maskX.save(); maskX.translate(W, 0); maskX.scale(-1, 1);
    maskX.drawImage(mask, 0, 0, W, H);
    maskX.restore();

    personX.globalCompositeOperation = 'destination-in';
    personX.drawImage(maskC, 0, 0);
    personX.globalCompositeOperation = 'destination-out';
    personX.filter = 'blur(14px)';
    personX.fillStyle = '#fff';
    personX.beginPath();
    const q = torsoQuad(lm, sw);
    personX.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) personX.lineTo(q[i].x, q[i].y);
    personX.closePath();
    personX.fill();
    personX.filter = 'none';
    personX.globalCompositeOperation = 'source-over';

    ctx.filter = 'blur(1px)';
    ctx.drawImage(personC, 0, 0);
    ctx.filter = 'none';
  }

  fpsEl.textContent = fpsAvg ? fpsAvg.toFixed(0) + ' fps' : '';
}

/* ---------- snapshot ---------- */
snapBtn.onclick = () => {
  const a = document.createElement('a');
  a.download = 'tryon-' + Date.now() + '.png';
  a.href = cv.toDataURL('image/png');
  a.click();
};
