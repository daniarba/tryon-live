'use strict';
/* TryOn Live v2.0 - catalog, drag & drop, torso fitting, ModNet matting, kiosk */
const isExt = (typeof chrome!=='undefined' && chrome.runtime && chrome.runtime.getURL);
const assetBase = isExt ? chrome.runtime.getURL('') : '';
const sampleBase = isExt ? chrome.runtime.getURL('samples/') : 'samples/';
const $=(id)=>document.getElementById(id);
const video=$('video'), cv=$('cv'), ctx=cv.getContext('2d');
const stTxt=$('stTxt'), stDot=document.querySelector('#status .dot'), fpsTxt=$('fpsTxt');
const camSel=$('cam'), qualSel=$('qual'), matteSel=$('matte');
const grid=$('grid'), searchEl=$('search'), chipsEl=$('chips'), cntEl=$('cnt'), uploadEl=$('upload');
const startBtn=$('start'), snapBtn=$('snap'), kioskBtn=$('kiosk'), kexit=$('kexit'), mirrorBtn=$('mirror');

let cameraOn=false, stream=null, mirrored=true, complexity=1;
let pose=null, modelReady=false;
let lastLm=null, lastLmAt=0, mpMask=null;
let ORT=null, ortS=null, matteOK=false, matBusy=false, matteC=null, matteX=null, prevMatte=null;
let garments=[], selected=null, activeCat='all', query='';
const personC=document.createElement('canvas'), personX=personC.getContext('2d');
let fpsN=0, fpsT=performance.now();

const CATS=[['all','All'],['tops','Tops'],['shirts','Shirts'],['kurta','Kurta'],['hoodie','Hoodie'],['jacket','Jackets'],['dress','Dresses'],['uploaded','Uploaded']];
const BUILTIN=[
 {id:'white', name:'White Tee',        cat:'tops',   src:sampleBase+'shirt-white.png', len:1,    sleeve:0.3,  flare:0},
 {id:'black', name:'Black Tee',        cat:'tops',   src:sampleBase+'shirt-black.png', len:1,    sleeve:0.3,  flare:0},
 {id:'red',   name:'Red Tee',          cat:'tops',   src:sampleBase+'shirt-red.png',   len:1,    sleeve:0.3,  flare:0},
 {id:'blue',  name:'Blue Shirt',       cat:'shirts', src:sampleBase+'shirt-blue.png',  len:1.05, sleeve:0.45, flare:0},
 {id:'kurta', name:'Teal Kurta',       cat:'kurta',  src:sampleBase+'kurta.png',       len:1.25, sleeve:1,    flare:0.05},
 {id:'hoodie',name:'Charcoal Hoodie',  cat:'hoodie', src:sampleBase+'hoodie.png',      len:1,    sleeve:1,    flare:0},
 {id:'jacket',name:'Denim Jacket',     cat:'jacket', src:sampleBase+'jacket.png',      len:0.95, sleeve:1,    flare:0},
 {id:'dress', name:'Green Dress',      cat:'dress',  src:sampleBase+'dress.png',       len:1.6,  sleeve:0.3,  flare:0.5},
];
function defFit(){ return {size:1, dy:0, dx:0, rot:0, opacity:0.96}; }

function status(t, ok){ stTxt.textContent=t; stDot.className='dot'+(ok?' ok':''); }

/* ---------- garment loading ---------- */
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
async function addBuiltins(){
  for(const g of BUILTIN){ g.img=await loadImg(g.src); g.fit=defFit(); if(g.img) garments.push(g); }
}
function idbOpen(){ return new Promise((res)=>{ const r=indexedDB.open('tryon-live',1);
  r.onupgradeneeded=()=>{ try{r.result.createObjectStore('g',{keyPath:'id'});}catch(e){} };
  r.onsuccess=()=>res(r.result); r.onerror=()=>res(null); }); }
async function idbAll(){ const d=await idbOpen(); if(!d) return [];
  return new Promise(res=>{ try{ const t=d.transaction('g').objectStore('g').getAll();
    t.onsuccess=()=>res(t.result||[]); t.onerror=()=>res([]); }catch(e){res([]);} }); }
async function idbPut(g){ const d=await idbOpen(); if(!d) return;
  try{ d.transaction('g','readwrite').objectStore('g').put({id:g.id,name:g.name,src:g.src}); }catch(e){} }
async function idbDel(id){ const d=await idbOpen(); if(!d) return;
  try{ d.transaction('g','readwrite').objectStore('g').delete(id); }catch(e){} }

/* ---------- catalog UI ---------- */
function renderChips(){
  chipsEl.innerHTML='';
  for(const [id,label] of CATS){
    const b=document.createElement('button'); b.className='chip'+(id===activeCat?' on':''); b.textContent=label;
    b.onclick=()=>{ activeCat=id; renderChips(); renderCatalog(); };
    chipsEl.appendChild(b);
  }
}
function renderCatalog(){
  const list=garments.filter(g=>(activeCat==='all'||g.cat===activeCat)&&g.name.toLowerCase().includes(query));
  grid.innerHTML='';
  for(const g of list){
    const c=document.createElement('div');
    c.className='card'+(g===selected?' sel':'')+(g.cat==='uploaded'?' up':'');
    const im=document.createElement('img'); im.src=g.src; c.appendChild(im);
    const n=document.createElement('div'); n.className='nm'; n.textContent=g.name; c.appendChild(n);
    if(g.cat==='uploaded'){
      const d=document.createElement('button'); d.className='del'; d.textContent='x';
      d.onclick=(e)=>{ e.stopPropagation(); removeUploaded(g); };
      c.appendChild(d);
    }
    c.onclick=()=>wear(g);
    c.draggable=true;
    c.ondragstart=(e)=>{ try{ e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed='copy'; }catch(e2){} };
    grid.appendChild(c);
  }
  const up=document.createElement('div'); up.className='card upl'; up.textContent='+ Upload garment PNG';
  up.onclick=()=>uploadEl.click(); grid.appendChild(up);
  cntEl.textContent=garments.length+' items';
}
function wear(g){ if(!g||!g.img) return; selected=g; syncSliders(); renderCatalog(); }
function removeUploaded(g){ garments=garments.filter(x=>x!==g); if(selected===g) selected=null; idbDel(g.id); renderCatalog(); }
function syncSliders(){ const f=selected?selected.fit:defFit();
  $('sSize').value=f.size; $('sDy').value=f.dy; $('sDx').value=f.dx; $('sRot').value=f.rot; $('sOp').value=f.opacity; }
const SLMAP={size:'sSize',dy:'sDy',dx:'sDx',rot:'sRot',opacity:'sOp'};
for(const k in SLMAP){
  $(SLMAP[k]).addEventListener('input',()=>{ if(!selected) return;
    selected.fit[k]=parseFloat($(SLMAP[k]).value); });
}
searchEl.addEventListener('input',()=>{ query=searchEl.value.trim().toLowerCase(); renderCatalog(); });
uploadEl.addEventListener('change',async()=>{
  for(const f of uploadEl.files){
    const url=await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(f); });
    const img=await loadImg(url); if(!img) continue;
    const g={ id:'u'+Date.now()+Math.random().toString(36).slice(2,6), name:f.name.replace(/\.[^.]+$/,''),
      cat:'uploaded', src:url, img, len:1.1, sleeve:0.4, flare:0, fit:defFit() };
    garments.push(g); await idbPut(g);
  }
  uploadEl.value=''; renderCatalog();
});

/* ---------- pose ---------- */
function initPose(){
  pose=new Pose({locateFile:(f)=>assetBase+'lib/'+f});
  pose.setOptions({modelComplexity:complexity, smoothLandmarks:true, enableSegmentation:true,
    minDetectionConfidence:0.5, minTrackingConfidence:0.5});
  pose.onResults(onResults);
}
function onResults(r){
  if(r.poseLandmarks){ lastLm=r.poseLandmarks; lastLmAt=performance.now(); }
  if(!modelReady){ modelReady=true; status('Ready - catalog se kapay select karein', true); if(matteSel.value==='1') initModNet(); }
  if(r.segmentationMask && !matteOK){
    if(!mpMask){ mpMask=document.createElement('canvas'); mpMask.width=320; mpMask.height=240; }
    const mx=mpMask.getContext('2d'); mx.clearRect(0,0,320,240);
    try{ mx.drawImage(r.segmentationMask,0,0,320,240); }catch(e){}
  }
  if(matteOK) runMatte();
}

/* ---------- ModNet matting (Hugging Face open model, web only) ---------- */
async function initModNet(){
  if(isExt || matteOK || matBusy) return;
  matBusy=true;
  try{
    await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.js');
    ORT=window.ort;
    if(!ORT) throw new Error('ort missing');
    ORT.env.wasm.numThreads=1;
    ortS=await ORT.InferenceSession.create('https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx',
      {executionProviders:['webgpu','wasm']});
    matteC=document.createElement('canvas'); matteC.width=256; matteC.height=256;
    matteX=matteC.getContext('2d');
    matteOK=true; status('AI matting chalu', true);
  }catch(e){ matteOK=false; }
  matBusy=false;
}
const matteTmp=document.createElement('canvas');
function runMatte(){
  if(!matteOK || matBusy || !ORT || !ortS) return;
  matBusy=true;
  try{
    const S=matteC.width;
    matteTmp.width=S; matteTmp.height=S;
    const tx=matteTmp.getContext('2d',{willReadFrequently:true});
    tx.drawImage(video,0,0,S,S);
    const d=tx.getImageData(0,0,S,S).data;
    const n=S*S, inp=new Float32Array(3*n);
    for(let i=0;i<n;i++){ inp[i]=d[i*4]/255; inp[n+i]=d[i*4+1]/255; inp[2*n+i]=d[i*4+2]/255; }
    const feeds={}; feeds[ortS.inputNames[0]]=new ORT.Tensor('float32',inp,[1,3,S,S]);
    ortS.run(feeds).then(out=>{
      const o=out[ortS.outputNames[0]], m=o.data;
      const id=matteX.createImageData(S,S);
      for(let i=0;i<n;i++){
        let a=m[i]; if(prevMatte) a=0.55*a+0.45*prevMatte[i];
        a=Math.max(0,Math.min(255,Math.round(a*255)));
        id.data[i*4+3]=a;
      }
      prevMatte=Float32Array.from(m);
      matteX.putImageData(id,0,0);
      matBusy=false;
    }).catch(()=>{ matBusy=false; matteOK=false; });
  }catch(e){ matBusy=false; matteOK=false; }
}

/* ---------- camera ---------- */
async function startCamera(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){ status('Camera nahi khuli: '+e.name, false); return; }
  video.srcObject=stream;
  try{ await video.play(); }catch(e){}
  cameraOn=true; startBtn.textContent='Stop camera';
  status('Body tracking model load ho raha hai…');
  listCams();
  if(!pose) initPose();
  sendLoop();
}
function stopCamera(){ cameraOn=false;
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  startBtn.textContent='Start camera'; status('Camera band'); }
async function listCams(){
  try{
    const ds=await navigator.mediaDevices.enumerateDevices();
    const cams=ds.filter(d=>d.kind==='videoinput');
    camSel.innerHTML='';
    cams.forEach((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId;
      o.textContent=c.label||('Camera '+(i+1)); camSel.appendChild(o); });
  }catch(e){}
}
camSel.addEventListener('change',async()=>{
  if(!cameraOn) return;
  try{
    if(stream){ stream.getTracks().forEach(t=>t.stop()); }
    stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:camSel.value},width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream; await video.play();
  }catch(e){ status('Camera switch nahi hui: '+e.name, false); }
});
qualSel.addEventListener('change',()=>{
  complexity=parseInt(qualSel.value,10)||1;
  if(pose){ try{ pose.close(); }catch(e){} pose=null; modelReady=false;
    if(cameraOn){ initPose(); status('Quality change: model dobara load ho raha hai…'); } }
});
matteSel.addEventListener('change',()=>{ if(matteSel.value==='1') initModNet(); else matteOK=false; });

async function sendLoop(){
  if(!cameraOn) return;
  if(video.readyState>=2 && pose){ try{ await pose.send({image:video}); }catch(e){} }
  if(cameraOn) setTimeout(sendLoop, 33);
}

/* ---------- render ---------- */
function syncSize(){
  if(!video.videoWidth) return;
  const W=Math.min(1280, video.videoWidth);
  const H=Math.round(W*video.videoHeight/video.videoWidth);
  if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
  if(personC.width!==W||personC.height!==H){ personC.width=W; personC.height=H; }
}
function composite(mask,lm,W,H){
  personX.setTransform(1,0,0,1,0,0);
  personX.clearRect(0,0,W,H);
  personX.save();
  if(mirrored){ personX.translate(W,0); personX.scale(-1,1); }
  try{ personX.drawImage(video,0,0,W,H); }catch(e){}
  personX.restore();
  personX.globalCompositeOperation='destination-in';
  personX.imageSmoothingEnabled=true;
  personX.drawImage(mask,0,0,W,H);
  if(selected&&selected.img){
    personX.globalCompositeOperation='destination-out';
    personX.filter='blur('+Math.max(8,Math.round(W*0.012))+'px)';
    eraseUnderGarment(personX,selected.fit,lm,W,H,mirrored,selected.len,selected.sleeve);
    personX.filter='none';
  }
  personX.globalCompositeOperation='source-over';
  ctx.drawImage(personC,0,0);
}
function render(){
  requestAnimationFrame(render);
  const now=performance.now();
  fpsN++;
  if(now-fpsT>500){ fpsTxt.textContent=Math.round(fpsN*1000/(now-fpsT))+' FPS'; fpsN=0; fpsT=now; }
  if(!cameraOn||!stream||video.readyState<2) return;
  syncSize();
  const W=cv.width, H=cv.height;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if(mirrored){ ctx.translate(W,0); ctx.scale(-1,1); }
  try{ ctx.drawImage(video,0,0,W,H); }catch(e){}
  ctx.restore();
  const fresh=lastLm && (now-lastLmAt<700);
  if(fresh && selected && selected.img){
    drawGarmentWarp(ctx,selected.img,selected.fit,lastLm,W,H,mirrored,selected.len,selected.flare);
  }
  const mask=matteOK?matteC:(mpMask&&!matteOK?mpMask:null);
  if(fresh && mask) composite(mask,lastLm,W,H);
}

/* ---------- misc controls ---------- */
startBtn.addEventListener('click',()=>{ cameraOn?stopCamera():startCamera(); });
mirrorBtn.addEventListener('click',()=>{ mirrored=!mirrored; mirrorBtn.style.opacity=mirrored?1:0.55; });
snapBtn.addEventListener('click',()=>{
  if(!cameraOn) return;
  cv.toBlob(b=>{
    if(!b) return;
    const a=document.createElement('a'); a.href=URL.createObjectURL(b);
    a.download='tryon-'+Date.now()+'.png'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  },'image/png');
  const f=$('flash'); f.style.opacity=0.85; setTimeout(()=>f.style.opacity=0,130);
});
kioskBtn.addEventListener('click',async()=>{
  document.body.classList.add('kiosk');
  try{ await document.documentElement.requestFullscreen(); }catch(e){}
});
kexit.addEventListener('click',()=>{
  document.body.classList.remove('kiosk');
  if(document.fullscreenElement){ document.exitFullscreen().catch(()=>{}); }
});
cv.addEventListener('dragover',e=>{ e.preventDefault(); cv.classList.add('drag'); });
cv.addEventListener('dragleave',()=>cv.classList.remove('drag'));
cv.addEventListener('drop',e=>{
  e.preventDefault(); cv.classList.remove('drag');
  const id=e.dataTransfer.getData('text/plain');
  const g=garments.find(x=>x.id===id);
  if(g) wear(g);
});

/* ---------- boot ---------- */
(async function boot(){
  renderChips();
  await addBuiltins();
  const ups=await idbAll();
  for(const u of ups){
    const img=await loadImg(u.src);
    if(img) garments.push({id:u.id,name:u.name,cat:'uploaded',src:u.src,img,len:1.1,sleeve:0.4,flare:0,fit:defFit()});
  }
  renderCatalog();
  render();
})();
window.addEventListener('error',e=>status('Error: '+(e.message||'unknown'), false));
