/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — LIVING VOID (continuous WebGL scroll experience)

   ONE fixed, full-viewport canvas behind the entire page, driven by a single
   global scroll value (uProg 0→1). The same particles continuously MORPH as you
   travel down the page — they never cut off:

      pitch wireframe  →  explosion  →  club crest  →  drift into the void

   The club footage is rendered INSIDE the scene as a textured plane behind the
   particles, so the energy always rides over the video and travels with it.
   Yellow is treated as additive light (core + halo layers = bloom feel).

   SAFETY (never break the site):
   • three.js from CDN as an ES module — if it fails, the static hero shows.
   • Skipped under prefers-reduced-motion (poster shows).
   • Mobile runs a lighter particles-only scene (no video texture → no heavy
     decode / data); desktop gets the full thing.
   • Pauses on tab-hidden; disposes on pagehide. Content always sits above the
     canvas (body is a stacking context; canvas is z-index:-1), so text is never
     covered.
   ════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) || window.innerWidth < 760;

  initHeroType(hero);                 // cinematic headline reveal (DOM, cheap)
  if (reduce || !hasWebGL()) return;  // → poster fallback stays

  var docEl = document.documentElement;
  docEl.classList.add('gl-on');       // hide the poster fallback

  /* ── renderer / scene / camera ─────────────────────────────────────── */
  var canvas = document.createElement('canvas');
  canvas.id = 'hero-gl';
  canvas.setAttribute('aria-hidden', 'true');
  // Inline so nothing can override it: fixed, full-viewport, BEHIND all content
  // (body is isolation:isolate, so z-index:-1 stays above the page's black
  // backdrop but below every section → text is never covered).
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;' +
    'pointer-events:none;opacity:0;transition:opacity 1.4s ease';
  document.body.appendChild(canvas);

  var DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  var W = window.innerWidth, H = window.innerHeight;
  var N = isMobile ? 6000 : 14000;    // particle count (denser → the crest reads)

  var YELLOW = new THREE.Color('#FFE27A');
  var GREEN  = new THREE.Color('#2E8B4E');

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 100);
  camera.position.set(0, 0, 4.2);
  camera.lookAt(0, 0, 0);

  /* ── video plane (club footage, behind the particles) ──────────────── */
  var videoMesh = null, videoEl = null, VID_Z = -2.0;
  setupVideo(); // desktop AND mobile (mobile uses a lighter file for smooth GPU upload)

  /* ── particle formations ───────────────────────────────────────────── */
  var aPitch = pitchFormation(N);
  var aBurst = burstFormation(N);
  var aCrest = aBurst.slice();        // filled when the badge image loads
  var aDrift = driftFormation(N);
  var seeds  = new Float32Array(N * 3);
  for (var i = 0; i < N * 3; i++) seeds[i] = Math.random();

  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(aPitch.slice(), 3)); // required, unused
  geo.setAttribute('aPitch', new THREE.Float32BufferAttribute(aPitch, 3));
  geo.setAttribute('aBurst', new THREE.Float32BufferAttribute(aBurst, 3));
  var crestAttr = new THREE.Float32BufferAttribute(aCrest, 3);
  geo.setAttribute('aCrest', crestAttr);
  geo.setAttribute('aDrift', new THREE.Float32BufferAttribute(aDrift, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 3));

  loadCrest(function (arr) { crestAttr.copyArray(arr); crestAttr.needsUpdate = true; });

  var uniforms = {
    uTime: { value: 0 }, uProg: { value: 0 }, uBurst: { value: 0 }, uCrest: { value: 0 },
    uColor: { value: YELLOW }, uSize: { value: 0 }
  };
  // core (bright, tight) + halo (big, soft) share the same geometry → bloom feel
  var core = new THREE.Points(geo, particleMat(uniforms, (isMobile ? 7 : 9) * DPR, 0.5, 0.95));
  var halo = new THREE.Points(geo, particleMat(uniforms, (isMobile ? 20 : 26) * DPR, 0.2, 0.32));
  // particles are repositioned in the vertex shader, so the original bounding
  // sphere is meaningless — never let three cull them as they drift out.
  core.frustumCulled = false; halo.frustumCulled = false;
  scene.add(halo); scene.add(core);

  /* ── central glow sprite that flashes on the explosion ─────────────── */
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(), color: YELLOW, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  glow.scale.set(6, 6, 1); scene.add(glow);

  /* ── state ─────────────────────────────────────────────────────────── */
  var prog = 0, progT = 0, mouseX = 0, mouseXT = 0, mouseY = 0, mouseYT = 0;
  var t0 = performance.now(), raf = 0, running = false;
  // Short journey so the morph (pitch→burst→crest) completes while the DARK
  // hero still fills the viewport — the crest forms over the hero, not behind a
  // lower opaque section. Drift then continues as you scroll on.
  var journey = function () { return Math.max(1, (isMobile ? 0.7 : 0.75) * window.innerHeight); };

  bindEvents();
  start();
  requestAnimationFrame(function () { canvas.style.opacity = '1'; });

  /* ───────────────────────── loop ───────────────────────── */
  function frame() {
    raf = requestAnimationFrame(frame);
    var t = (performance.now() - t0) / 1000;

    prog   += (progT - prog) * 0.08;
    mouseX += (mouseXT - mouseX) * 0.05;
    mouseY += (mouseYT - mouseY) * 0.05;

    uniforms.uTime.value = t;
    uniforms.uProg.value = prog;
    // explosion energy peaks at ~0.15 → drives a size/brightness flash
    var burst = bump(prog, 0.06, 0.24);
    uniforms.uBurst.value = burst;
    // crest "hold" plateau (~0.30→0.58): particles sharpen + brighten into the badge
    var crestHold = Math.max(0, Math.min(smooth(0.28, 0.44, prog), 1 - smooth(0.58, 0.74, prog)));
    uniforms.uCrest.value = crestHold;

    // gentle cursor parallax + a slow autorotate of the whole field
    scene.rotation.y = mouseX * 0.25 + Math.sin(t * 0.08) * 0.05;
    scene.rotation.x = -mouseY * 0.15 + prog * 0.15;

    // camera dollies out as the field drifts (gentle, so the crest stays large)
    camera.position.z = 4.2 + prog * 0.9 + burst * -0.4;
    camera.position.x += (mouseX * 0.4 - camera.position.x) * 0.04;
    camera.lookAt(0, 0, 0);

    glow.material.opacity = burst * 0.5 + crestHold * 0.14; // bright flash on burst, soft aura on crest
    glow.scale.setScalar(5 + burst * 4 - crestHold * 1.5);  // tighten the aura around the badge

    if (videoMesh) {
      // footage visible in the hero, fades as the journey leaves it behind
      var vo = 1 - smooth(0.06, 0.24, prog);
      videoMesh.material.opacity = vo;
      videoMesh.visible = vo > 0.01;
      var scrim = videoMesh.userData.scrim;
      if (scrim) { scrim.material.opacity = 0.45 * vo; scrim.visible = vo > 0.01; }
    }

    renderer.render(scene, camera);
  }
  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); if (videoEl) playVideo(); } }
  function stop() { running = false; cancelAnimationFrame(raf); if (videoEl) videoEl.pause(); }

  /* ───────────────────────── formations ───────────────────────── */
  // Pitch lines sampled into points, then tilted into perspective + scaled.
  function pitchFormation(n) {
    var seg = pitchSegments();
    var pts = sampleSegments(seg, n);     // flat pitch points (xz plane)
    var tilt = -0.92, ct = Math.cos(tilt), st = Math.sin(tilt), SX = 1.7, SZ = 1.7;
    var out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var x = pts[i * 3] * SX, z = pts[i * 3 + 2] * SZ;
      out[i * 3]     = x - 0.15;        // nudge left, behind the headline
      out[i * 3 + 1] = -z * st;         // rotate X
      out[i * 3 + 2] = z * ct;
    }
    return out;
  }
  function burstFormation(n) {
    var out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random(), v = Math.random();
      var th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      var r = 2.0 + Math.random() * 1.8;
      out[i * 3]     = Math.sin(ph) * Math.cos(th) * r;
      out[i * 3 + 1] = Math.cos(ph) * r * 0.8;
      out[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r * 0.7;
    }
    return out;
  }
  function driftFormation(n) {
    var out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      out[i * 3]     = (Math.random() - 0.5) * 13;
      out[i * 3 + 1] = (Math.random() - 0.5) * 8;
      out[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;
    }
    return out;
  }
  // Sample the club badge into points → particles reform into the crest.
  // The badge is a YELLOW disc with GREEN linework (the "RAYNERS LANE FOOTBALL
  // CLUB" ring + heraldic emblem + EST 1933). The recognisable shape is the
  // GREEN detail, so we trace THAT (rendered in glowing yellow), not the fill.
  function loadCrest(cb) {
    var img = new Image();
    img.onload = function () {
      var S = 220, c = document.createElement('canvas'); c.width = c.height = S;
      var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, S, S);
      var data;
      try { data = ctx.getImageData(0, 0, S, S).data; } catch (e) { return; }
      var hits = [];
      for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
        var k = (y * S + x) * 4, r = data[k], g = data[k + 1], b = data[k + 2], a = data[k + 3];
        if (a < 60) continue;                      // transparent corners
        var sum = r + g + b;
        // green-dominant, mid-bright → the ring text + emblem (excludes the
        // bright-yellow fill where r>g, pure black, and white highlights).
        if (g >= r - 8 && g >= b - 8 && r < 200 && sum > 70 && sum < 540) hits.push([x, y]);
      }
      if (hits.length < 300) return;               // sampling failed → keep burst
      // big + lifted + nudged left so the full badge forms over the dark hero,
      // clear of the frosted info panel on the right.
      var out = new Float32Array(N * 3), SC = 2.85, YOFF = 0.18, XOFF = -0.45;
      for (var i = 0; i < N; i++) {
        var h = hits[(Math.random() * hits.length) | 0];
        out[i * 3]     = (h[0] / S - 0.5) * SC + XOFF;
        out[i * 3 + 1] = -(h[1] / S - 0.5) * SC + YOFF;
        out[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
      }
      cb(out);
    };
    img.src = 'img/badge.png';
  }

  /* ───────────────────────── pitch geometry ───────────────────────── */
  function pitchSegments() {
    var X = 1, Z = 0.62, out = [];
    function L(x1, z1, x2, z2) { out.push(x1, 0, z1, x2, 0, z2); }
    L(-X, -Z, X, -Z); L(X, -Z, X, Z); L(X, Z, -X, Z); L(-X, Z, -X, -Z);
    L(0, -Z, 0, Z);
    ring(0, 0, 0.2, 46, L);
    boxL(-X, 0.3, 0.34, L, 1); boxL(X, 0.3, 0.34, L, -1);
    boxL(-X, 0.12, 0.17, L, 1); boxL(X, 0.12, 0.17, L, -1);
    return out;
  }
  function ring(cx, cz, r, n, L) {
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      L(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r);
    }
  }
  function boxL(edgeX, depth, halfH, L, dir) {
    var inner = edgeX - dir * depth;
    L(edgeX, -halfH, inner, -halfH); L(inner, -halfH, inner, halfH); L(inner, halfH, edgeX, halfH);
  }
  function sampleSegments(seg, target) {
    var lens = [], total = 0, i;
    for (i = 0; i < seg.length; i += 6) { var dx = seg[i + 3] - seg[i], dz = seg[i + 5] - seg[i + 2]; var l = Math.hypot(dx, dz); lens.push(l); total += l; }
    var pts = [], made = 0;
    for (i = 0; i < seg.length && made < target; i += 6) {
      var k = i / 6, count = Math.max(2, Math.round(target * (lens[k] / total)));
      for (var j = 0; j < count && made < target; j++) {
        var f = j / count;
        pts.push(seg[i] + (seg[i + 3] - seg[i]) * f, 0, seg[i + 2] + (seg[i + 5] - seg[i + 2]) * f); made++;
      }
    }
    while (made < target) { pts.push(0, 0, 0); made++; } // pad
    return pts;
  }

  /* ───────────────────────── materials ───────────────────────── */
  function particleMat(u, size, soft, alpha) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, u, { uPx: { value: size }, uSoft: { value: soft }, uAlpha: { value: alpha } }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader:
        'attribute vec3 aPitch,aBurst,aCrest,aDrift,aSeed;' +
        'uniform float uTime,uProg,uBurst,uCrest,uPx; varying float vA;' +
        'float es(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);} ' +
        'void main(){' +
        '  float p=uProg; vec3 pos=aPitch;' +
        '  pos=mix(pos,aBurst,es(0.06,0.22,p));' +
        '  pos=mix(pos,aCrest,es(0.26,0.44,p));' +
        '  pos=mix(pos,aDrift,es(0.60,0.92,p));' +
        '  pos.y += sin(uTime*0.8+aSeed.x*12.0)*0.012*(1.0-es(0.0,0.2,p));' +   // idle shimmer (pitch)
        '  float ang=aSeed.y*6.2831+uTime*0.7;' +
        '  pos += vec3(cos(ang),sin(ang*1.3),sin(ang))*uBurst*(0.5+aSeed.z*0.9);' + // swirl in the blast
        '  vec4 mv=modelViewMatrix*vec4(pos,1.0);' +
        '  gl_Position=projectionMatrix*mv;' +
        '  float fl=1.0+uBurst*1.4;' +
        '  float sharp=1.0-uCrest*0.55;' +                  // shrink while forming the crest → detail reads
        '  gl_PointSize=uPx*(0.55+aSeed.x*0.8)*fl*sharp*(1.0/max(0.06,-mv.z));' +
        '  vA=1.0-es(7.0,11.0,length(pos));' +              // fade the far drifters
        '}',
      fragmentShader:
        'uniform vec3 uColor; uniform float uSoft,uAlpha,uBurst,uCrest; varying float vA;' +
        'void main(){ float d=length(gl_PointCoord-0.5);' +
        '  float a=smoothstep(0.5,uSoft,d)*uAlpha*vA*(1.0+uBurst*0.6+uCrest*0.5);' +
        '  if(a<0.01) discard;' +
        '  gl_FragColor=vec4(uColor,a); }'
    });
  }

  function setupVideo() {
    videoEl = document.getElementById('hero-video-src');
    if (!videoEl) return;
    // mobile loads the lighter encode (faster per-frame GPU upload = smoother)
    var src = (isMobile && videoEl.getAttribute('data-src-mobile')) || videoEl.getAttribute('data-src');
    if (src && !videoEl.src) videoEl.src = src;
    videoEl.muted = true; videoEl.playsInline = true; videoEl.load();

    var tex = new THREE.VideoTexture(videoEl);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false });
    // unit planes scaled in sizeVideo() so they always COVER the viewport
    videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    videoMesh.position.z = VID_Z; scene.add(videoMesh);
    var scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x080808, transparent: true, opacity: 0.45, depthWrite: false }));
    scrim.position.z = VID_Z + 0.01; scene.add(scrim);
    videoMesh.userData.scrim = scrim; videoMesh.userData.tex = tex;

    videoEl.addEventListener('loadedmetadata', sizeVideo);
    sizeVideo();

    // iOS Safari sometimes won't autoplay a muted inline video into a WebGL
    // texture until the first user gesture — kick it on the first touch/scroll.
    var kick = function () { playVideo(); };
    window.addEventListener('touchstart', kick, { once: true, passive: true });
    window.addEventListener('pointerdown', kick, { once: true, passive: true });
    window.addEventListener('scroll', kick, { once: true, passive: true });
  }
  // Scale the video plane to COVER the viewport and crop the texture to the
  // video's aspect (no squish on portrait phones).
  function sizeVideo() {
    if (!videoMesh) return;
    var dist = 4.2 - VID_Z; // size at the hero (where the footage is visible)
    var vh = 2 * Math.tan((46 * Math.PI / 180) / 2) * dist, vw = vh * (W / H);
    videoMesh.scale.set(vw * 1.12, vh * 1.12, 1);
    if (videoMesh.userData.scrim) videoMesh.userData.scrim.scale.set(vw * 1.12, vh * 1.12, 1);
    var tex = videoMesh.userData.tex;
    var tw = (videoEl && videoEl.videoWidth) || 16, th = (videoEl && videoEl.videoHeight) || 9;
    var imgA = tw / th, planeA = vw / vh;
    if (imgA > planeA) { tex.repeat.set(planeA / imgA, 1); tex.offset.set((1 - planeA / imgA) / 2, 0); }
    else { tex.repeat.set(1, imgA / planeA); tex.offset.set(0, (1 - imgA / planeA) / 2); }
    tex.needsUpdate = true;
  }
  function playVideo() { if (videoEl) { var p = videoEl.play(); if (p && p.catch) p.catch(function () {}); } }

  function radialTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, 'rgba(255,226,122,.55)'); g.addColorStop(1, 'rgba(255,209,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /* ───────────────────────── events ───────────────────────── */
  function bindEvents() {
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if (!isMobile) window.addEventListener('pointermove', function (e) {
      mouseXT = (e.clientX / window.innerWidth) * 2 - 1;
      mouseYT = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });
    window.addEventListener('pagehide', dispose, { once: true });
  }
  function onScroll() { progT = Math.min(1, Math.max(0, window.scrollY / journey())); }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    sizeVideo();
  }
  function dispose() {
    stop();
    scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.map && m.map.dispose(); m.dispose(); }); }
    });
    renderer.dispose();
  }

  /* helpers */
  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function bump(x, a, b) { var m = (a + b) / 2; return x < a || x > b ? 0 : 1 - Math.abs(x - m) / ((b - a) / 2); }
  function hasWebGL() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }
})();

/* ───────────────── cinematic headline reveal (DOM, runs always) ───────────────── */
function initHeroType(hero) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var h1 = hero.querySelector('.hero__h1');
  if (!h1 || h1.dataset.split) return;
  h1.dataset.split = '1';
  h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
  var idx = 0;
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.nodeValue.split('').forEach(function (ch) {
          if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); return; }
          var s = document.createElement('span'); s.className = 'hch'; s.textContent = ch;
          s.style.transitionDelay = (idx * 0.035) + 's'; s.style.animationDelay = (idx * 0.12) + 's';
          idx++; frag.appendChild(s);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); }
    });
  })(h1);
  if (!document.getElementById('hero-type-css')) {
    var st = document.createElement('style'); st.id = 'hero-type-css';
    st.textContent =
      '.hero__h1 .hch{display:inline-block;opacity:0;transform:translateY(46px) rotateX(-40deg);filter:blur(8px);' +
      'transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1),filter .7s ease;will-change:transform,opacity}' +
      '.hero__h1.in .hch{opacity:1;transform:none;filter:none;animation:hchFloat 6s ease-in-out infinite alternate}' +
      '@keyframes hchFloat{from{transform:translateY(0)}to{transform:translateY(-4px)}}' +
      '@media(prefers-reduced-motion:reduce){.hero__h1 .hch{opacity:1;transform:none;filter:none;animation:none}}';
    document.head.appendChild(st);
  }
  requestAnimationFrame(function () { requestAnimationFrame(function () { h1.classList.add('in'); }); });
}
