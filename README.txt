TryOn Live: Real-Time Virtual Try-On (free, v1.1)
==================================================

INSTALL (Chrome / Edge):
1. Chrome me chrome://extensions kholain.
2. Right-top "Developer mode" ON karein.
3. "Load unpacked" dabain aur ye poora folder select karein
   (zip extract kar ke, jis me manifest.json hai).
4. Toolbar me TryOn Live icon dabain, new tab khulega.
5. "Start camera" dabain, phir kapay ki photo (transparent PNG best hai)
   window pe drag kar ke chhoren. 4 demo shirts pehle se load hain.
6. Size / position / rotation / opacity sliders se adjust karein.
7. "Save photo" se screenshot save hota hai.

v1.1 REALISM UPGRADE:
- Segmentation compositing: aap ke haath, mun aur jism ke aage wale
  hissay kapay ke UPAR render hote hain, shirt ke neeche dabanay ke
  bajaye. Kapay body ke sath zyada naturally mil jata hai.
- Kapay ke neeche soft shadow bhi lagti hai.
- Sab kuch offline chalta hai: MediaPipe Pose model extension ke andar
  bundled hai, koi API, koi payment, koi internet zaroori nahi
  (sirf pehli install ke waqt files local hoti hain).

LIMIT (sach):
- Ye free overlay approach hai: kapay flat lag sakta hai, cloth physics
  nahi. Photoreal live try-on (Anywear jaisa) Decart ke paid AI model
  se banta hai (~$0.02/second).

FILES:
- manifest.json   Chrome extension manifest (v3)
- background.js   Icon click -> app tab
- app.html / app.js   UI, webcam, segmentation compositing
- lib/            MediaPipe Pose model (bundled, offline)
- samples/        4 demo garment PNGs
- icons/          Toolbar icons


TESTING ON LOCALHOST (ye asaan tareeqa hai, extension bar bar install nahi karni parti):
1. Ye folder kisi jagah extract karo.
2. Terminal me: ./start.sh   (ya: python3 -m http.server 8080)
3. Browser me kholo: http://localhost:8080/app.html
4. Camera permission Allow karo, garment drag-drop karo.
5. Har nayi testing ke liye sirf page refresh karo, bas.
   (Extension sirf Chrome Web Store publish ke waqt chahiye hogi.)
