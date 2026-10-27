/* TryOn Live - garment warp fitting (shared by app and test page) */
function lerp(a,b,t){ return a+(b-a)*t; }
function clamp01(v){ return v<0?0:(v>1?1:v); }
function smooth(t){ t=clamp01(t); return t*t*(3-2*t); }

/* lm: MediaPipe poseLandmarks (normalized). mirror flips x for selfie view.
   len: garment length multiplier (1 = regular top). flare: extra hem width.
   Warps the garment along the torso axis (shoulders -> hips) in strips. */
function drawGarmentWarp(ctx, img, fit, lm, W, H, mirror, len, flare){
  if(!img || !lm) return;
  len = len || 1; flare = flare || 0;
  const flip = mirror ? (l)=>({x:1-l.x, y:l.y}) : (l)=>({x:l.x, y:l.y});
  const ls=flip(lm[11]), rs=flip(lm[12]), lh=flip(lm[23]), rh=flip(lm[24]);
  if(!ls||!rs||!lh||!rh) return;
  const sx=(ls.x+rs.x)/2*W, sy=(ls.y+rs.y)/2*H;
  const hx=(lh.x+rh.x)/2*W, hy=(lh.y+rh.y)/2*H;
  const sw=Math.hypot((rs.x-ls.x)*W,(rs.y-ls.y)*H);
  const hw=Math.hypot((rh.x-lh.x)*W,(rh.y-lh.y)*H);
  const torso=Math.hypot(hx-sx,hy-sy);
  if(sw<6 || torso<6) return;
  const T=Math.atan2(hy-sy, hx-sx);
  const a=-0.08, span=1.15*len;
  const gh=span*torso*fit.size;
  const N=26;
  const iw=img.width, ih=img.height;
  const axis=T-Math.PI/2;
  const wEnd=hw*(1.30+flare);
  const sh=ih/N, dstH=gh/N*1.06;
  for(let i=0;i<N;i++){
    const t0=i/N, t1=(i+1)/N, tm=(t0+t1)/2;
    const tmm=a+span*tm;
    const cx=sx+(hx-sx)*tmm+fit.dx, cy=sy+(hy-sy)*tmm+fit.dy;
    const w=lerp(sw*1.14, wEnd, smooth((tmm-a)/span))*fit.size;
    ctx.save();
    ctx.globalAlpha=fit.opacity;
    ctx.translate(cx,cy);
    ctx.rotate(axis+fit.rot);
    ctx.drawImage(img, 0, t0*ih, iw, sh+1, -w/2, -dstH/2, w, dstH);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

/* Area of the person layer to erase (destination-out) so the garment drawn
   beneath shows through: torso interior + sleeve regions. */
function eraseUnderGarment(x, fit, lm, W, H, mirror, len, sleeve){
  if(!lm) return;
  len = len || 1;
  const flip = mirror ? (l)=>({x:1-l.x,y:l.y}) : (l)=>({x:l.x,y:l.y});
  const ls=flip(lm[11]), rs=flip(lm[12]), le=flip(lm[13]), re=flip(lm[14]),
        lw=flip(lm[15]), rw=flip(lm[16]), lh=flip(lm[23]), rh=flip(lm[24]);
  if(!ls||!rs||!lh||!rh) return;
  const S={x:(ls.x+rs.x)/2*W, y:(ls.y+rs.y)/2*H};
  const Hp={x:(lh.x+rh.x)/2*W, y:(lh.y+rh.y)/2*H};
  const sw=Math.hypot(rs.x-ls.x, rs.y-ls.y)*W;
  const torso=Math.hypot(Hp.x-S.x, Hp.y-S.y);
  if(sw<6||torso<6) return;
  const T=Math.atan2(Hp.y-S.y, Hp.x-S.x);
  const aX=Math.cos(T), aY=Math.sin(T);   /* along torso */
  const cX=Math.sin(T), cY=-Math.cos(T);  /* across torso */
  const span=1.15*len;
  /* torso polygon, slightly inside the garment silhouette */
  x.beginPath();
  x.moveTo(S.x+cX*sw*0.62-aX*sw*0.10, S.y+cY*sw*0.62-aY*sw*0.10);
  x.lineTo(S.x-cX*sw*0.62-aX*sw*0.10, S.y-cY*sw*0.62-aY*sw*0.10);
  const bx=S.x+aX*torso*span*0.94, by=S.y+aY*torso*span*0.94;
  x.lineTo(bx-cX*sw*0.55, by-cY*sw*0.55);
  x.lineTo(bx+cX*sw*0.55, by+cY*sw*0.55);
  x.closePath(); x.fill();
  /* sleeves */
  if(sleeve>0){
    const armErase=(sh,el,wr)=>{
      if(!sh||!el) return;
      const s={x:sh.x*W,y:sh.y*H}, e={x:el.x*W,y:el.y*H};
      let ex,ey;
      if(sleeve>=1 && wr){ const w={x:wr.x*W,y:wr.y*H}; ex=lerp(e.x,w.x,0.72); ey=lerp(e.y,w.y,0.72); }
      else { ex=lerp(s.x,e.x,Math.min(1,sleeve*1.7)); ey=lerp(s.y,e.y,Math.min(1,sleeve*1.7)); }
      const d=Math.hypot(ex-s.x,ey-s.y); if(d<4) return;
      const nx=-(ey-s.y)/d, ny=(ex-s.x)/d;
      const w0=sw*0.30, w1=sw*0.16;
      x.beginPath();
      x.moveTo(s.x+nx*w0, s.y+ny*w0);
      x.lineTo(ex+nx*w1, ey+ny*w1);
      x.lineTo(ex-nx*w1, ey-ny*w1);
      x.lineTo(s.x-nx*w0, s.y-ny*w0);
      x.closePath(); x.fill();
    };
    armErase(ls,le,lw);
    armErase(rs,re,rw);
  }
}
