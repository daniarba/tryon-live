/* TryOn Live v1.3 — product-page integration.
   Puts a "Try On" pill on product images on product pages (shadow-DOM aware,
   light DOM first so normal sites behave exactly as before). Click opens the
   TryOn Live studio with that garment preloaded. */
(function(){
  if(window.__TRYON_INTEGRATED__) return; window.__TRYON_INTEGRATED__=true;
  const MAX_BTN=40, MIN_PX=140, MAX_NODES=20000;
  let scanning=false, pending=false;

  const style=document.createElement('style');
  style.textContent='.tryonlive-btn-host{position:absolute;z-index:2147483000;}'
    +'.tryonlive-btn{font:600 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
    +'padding:6px 11px;border-radius:999px;border:none;cursor:pointer;color:#fff;'
    +'background:linear-gradient(135deg,#5b8cff,#8f6bff);box-shadow:0 4px 14px rgba(20,30,70,.45);}'
    +'.tryonlive-btn:hover{filter:brightness(1.12);}';
  (document.head||document.documentElement).appendChild(style);

  function visible(img){
    try{
      const r=img.getBoundingClientRect();
      if(r.width<MIN_PX || r.height<MIN_PX) return false;
      const st=getComputedStyle(img);
      return st.display!=='none' && st.visibility!=='hidden' && parseFloat(st.opacity||'1')>0.05;
    }catch(e){ return false; }
  }
  function tryOnable(img){
    try{
      const src=img.currentSrc||img.src||'';
      if(!/^https?:/i.test(src)) return false;
      if(/logo|icon|sprite|banner|placeholder|avatar|badge|payment|pixel|tracker/i.test(src)) return false;
      if(img.closest && img.closest('header,nav,footer,[role="navigation"]')) return false;
      const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      if(w<MIN_PX || h<MIN_PX) return false;
      const ar=w/Math.max(h,1);
      if(ar<0.3 || ar>2.6) return false;
      return visible(img);
    }catch(e){ return false; }
  }
  /* additive walk: on a shadow-free page the list is identical to document.images */
  function* walk(root){
    let n=0;
    for(const el of root.querySelectorAll('*')){
      if(++n>MAX_NODES) return;
      if(el.tagName==='IMG') yield el;
      if(el.shadowRoot) yield* walk(el.shadowRoot);
    }
  }
  function productPage(){
    try{
      if(/\/(product|products|p|dp|item|items|goods|shop)\//i.test(location.pathname)) return true;
      for(const s of document.querySelectorAll('script[type="application/ld+json"]')){
        if((s.textContent||'').indexOf('"Product"')>=0) return true;
      }
      if(document.querySelector('[itemtype*="schema.org/Product"]')) return true;
    }catch(e){}
    return false;
  }
  function buttonFor(img){
    try{
      if(img.__tryonBtn && img.__tryonBtn.isConnected) return false;
      const host=document.createElement('div');
      host.className='tryonlive-btn-host';
      const b=document.createElement('button');
      b.type='button'; b.textContent='Try On'; b.className='tryonlive-btn';
      b.addEventListener('click',e=>{
        e.preventDefault(); e.stopPropagation();
        const url=img.currentSrc||img.src;
        try{
          chrome.runtime.sendMessage({type:'TRYON_INTEGRATE_WEAR',url:url},()=>{ void chrome.runtime.lastError; });
        }catch(err){}
      });
      host.appendChild(b);
      const pos=img.getBoundingClientRect();
      host.style.left=(pos.left+window.scrollX+8)+'px';
      host.style.top=(pos.top+window.scrollY+8)+'px';
      (document.body||document.documentElement).appendChild(host);
      img.__tryonBtn=host;
      return true;
    }catch(e){ return false; }
  }
  function scan(){
    if(scanning){ pending=true; return; }
    scanning=true;
    requestAnimationFrame(()=>{
      try{
        document.querySelectorAll('.tryonlive-btn-host').forEach(h=>{
          if(!h.isConnected || !h.__forImg || !h.__forImg.isConnected) h.remove();
        });
        if(!productPage()){ scanning=false; if(pending){ pending=false; scan(); } return; }
        let made=0;
        for(const img of walk(document)){
          if(made>=MAX_BTN) break;
          if(tryOnable(img)){
            if(!img.__tryonBtn || !img.__tryonBtn.isConnected){
              if(buttonFor(img)){ img.__tryonBtn.__forImg=img; made++; }
            } else made++;
          }
        }
      }catch(e){}
      scanning=false;
      if(pending){ pending=false; scan(); }
    });
  }
  /* Chrome freezes :hover during a native drag; one synthetic mousemove lifts it */
  document.addEventListener('dragend',()=>{
    setTimeout(()=>{
      try{ document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:1,clientY:1})); }catch(e){}
    },50);
  },true);

  let moT=null;
  const mo=new MutationObserver(()=>{ clearTimeout(moT); moT=setTimeout(scan,600); });
  function boot(){
    scan();
    try{ mo.observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  }
  if(document.readyState==='complete') boot();
  else window.addEventListener('load',boot);
})();
