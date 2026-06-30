/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — CINEMATIC HERO (WebGL)
   A glowing football-pitch wireframe floating in a dark void. On scroll the
   pitch lines fracture into GPU particles that swirl and disperse; volumetric
   yellow light breathes behind it; the whole field parallaxes to the cursor.

   Brand physics: Yellow #FFD100 = emissive light/energy · Green #1A5C32 =
   structure · Black #080808 = void. Yellow is treated as additive light, not a
   fill colour.

   SAFETY (never break the site): this is a PROGRESSIVE layer.
   • Loads three.js from a CDN as an ES module — if that fails, the existing
     hero simply shows (the canvas stays empty/transparent, pointer-events:none).
   • Skipped entirely under prefers-reduced-motion.
   • Particle counts + DPR scale down on mobile.
   • RAF pauses when the hero scrolls off-screen (IntersectionObserver) and when
     the tab is hidden — zero cost on the rest of the page.
   • Disposes GL resources on pagehide.
   ════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) || window.innerWidth < 760;

  // ── Background video — runs independent of WebGL. Attach + play only on
  // capable devices; mobile + reduced-motion keep the lightweight poster image.
  initHeroVideo(hero, reduce, isMobile);

  // ── Always-on: cinematic typography reveal + scroll parallax (cheap, DOM-only).
  initHeroType(hero);
  if (reduce) { initParallax(hero, null); return; }

  // ── WebGL feature-detect. No GL → existing hero stays, no canvas work.
  if (!hasWebGL()) { initParallax(hero, null); return; }

  // ── Canvas: sits BEHIND the hero content (left text z-index:2, right panel is
  // opaque) and ignores pointer events so every link/button still works.
  var canvas = document.createElement('canvas');
  canvas.id = 'hero-gl';
  canvas.setAttribute('aria-hidden', 'true');
  // z-index:0 keeps the canvas behind BOTH columns: the left text (z-index:2)
  // and the opaque right info panel both paint above it, so the pitch glows
  // behind the headline while the stats/history stay perfectly crisp.
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;' +
    'opacity:0;transition:opacity 1.2s ease';
  hero.insertBefore(canvas, hero.firstChild);

  var YELLOW = new THREE.Color('#FFD100');
  var GREEN  = new THREE.Color('#2A7D48');   // a touch brighter than chrome green so lines glow

  var renderer, scene, camera, pitchGroup, lines, points, atmos, glowSprites = [];
  var raf = 0, running = false, t0 = performance.now();
  var size = { w: hero.clientWidth, h: hero.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2) };

  // smoothed scroll progress (0 hero in view → 1 scrolled one hero-height away)
  var progress = 0, progressTarget = 0;
  // smoothed cursor in -1..1 hero space
  var mouse = { x: 0, y: 0 }, mouseT = { x: 0, y: 0 };

  build();
  bindEvents();
  // Reveal the canvas once the first frame is drawn.
  requestAnimationFrame(function () { canvas.style.opacity = '1'; });

  /* ───────────────────────── BUILD ───────────────────────── */
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(size.dpr);
    renderer.setSize(size.w, size.h, false);
    renderer.setClearColor(0x000000, 0); // transparent → page void shows through

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070a, 0.18);

    camera = new THREE.PerspectiveCamera(42, size.w / size.h, 0.1, 100);
    camera.position.set(0, 0.55, 3.25);
    camera.lookAt(0, -0.15, 0);

    pitchGroup = new THREE.Group();
    pitchGroup.rotation.x = -1.02;       // lay the pitch down in perspective
    scene.add(pitchGroup);

    var seg = buildPitchSegments();      // line endpoints (pairs)
    var samples = samplePitch(seg, isMobile ? 2400 : 5200); // dense points along the lines

    // 1) Glowing line wireframe — additive so it reads as light, not ink.
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    var lm = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    lines = new THREE.LineSegments(lg, lm);
    pitchGroup.add(lines);

    // 2) GPU particle field sampled from the same lines → fractures on scroll.
    points = buildPoints(samples);
    pitchGroup.add(points);

    // 3) Atmospheric drifting dust in the void.
    atmos = buildAtmos(isMobile ? 320 : 760);
    scene.add(atmos);

    // 4) Volumetric yellow light — additive radial sprites breathing behind the pitch.
    var tex = radialTexture();
    [[0, 0.1, -0.6, 4.2, 0.34], [-1.1, 0.4, -0.4, 2.4, 0.22], [1.2, -0.2, -0.5, 2.6, 0.2]].forEach(function (g) {
      var m = new THREE.SpriteMaterial({ map: tex, color: YELLOW, transparent: true, opacity: g[4], blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      var s = new THREE.Sprite(m);
      s.position.set(g[0], g[1], g[2]);
      s.scale.set(g[3], g[3], 1);
      s.userData = { base: g[4], seed: Math.random() * 6.28, scale: g[3] };
      scene.add(s); glowSprites.push(s);
    });
  }

  function buildPoints(samples) {
    var n = samples.length / 3;
    var g = new THREE.BufferGeometry();
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(samples, 3));
    g.setAttribute('position', new THREE.Float32BufferAttribute(samples.slice(), 3)); // unused but required
    var seeds = new Float32Array(n * 3);
    for (var i = 0; i < n * 3; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 3));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uProgress: { value: 0 },
        uSize: { value: (isMobile ? 5.0 : 7.0) * size.dpr },
        uColor: { value: YELLOW }
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader:
        'attribute vec3 aBase; attribute vec3 aSeed;' +
        'uniform float uTime,uProgress,uSize; varying float vA;' +
        'void main(){' +
        '  float p=uProgress; vec3 pos=aBase;' +
        '  pos.y += sin(uTime*0.8 + aSeed.x*12.0)*0.012;' +            // idle shimmer on the lines
        '  float ang = aSeed.y*6.2831 + uTime*0.25 + p*3.0;' +
        '  vec3 dir = normalize(vec3(cos(ang),(aSeed.z-0.5)*1.6,sin(ang)) + aBase*0.3);' +
        '  pos += dir * p * (0.6 + aSeed.x*2.2);' +                    // disperse outward
        '  pos.y += p*p*aSeed.z*0.8;' +                               // lift as they fly
        '  vec4 mv = modelViewMatrix*vec4(pos,1.0);' +
        '  gl_Position = projectionMatrix*mv;' +
        '  gl_PointSize = (uSize*(1.0+p*2.0)) * (1.0/max(0.05,-mv.z));' +
        '  vA = mix(0.5,0.95,p) * (1.0 - smoothstep(2.4,3.6,length(pos)));' +
        '}',
      fragmentShader:
        'varying float vA; uniform vec3 uColor;' +
        'void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c);' +
        '  float a=smoothstep(0.5,0.0,d)*vA; if(a<0.01) discard;' +
        '  gl_FragColor=vec4(uColor,a); }'
    });
    return new THREE.Points(g, mat);
  }

  function buildAtmos(n) {
    var pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 7;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4 + 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 0.6;
      seed[i] = Math.random();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 2.4 * size.dpr }, uColor: { value: new THREE.Color('#FFE375') } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader:
        'attribute float aSeed; uniform float uTime,uSize; varying float vA;' +
        'void main(){ vec3 p=position;' +
        '  p.y += sin(uTime*0.15 + aSeed*30.0)*0.4;' +
        '  p.x += cos(uTime*0.1 + aSeed*20.0)*0.3;' +
        '  vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;' +
        '  gl_PointSize=uSize*(1.0/max(0.1,-mv.z));' +
        '  vA=0.18+0.22*sin(uTime*0.6+aSeed*40.0); }',
      fragmentShader:
        'varying float vA; uniform vec3 uColor;' +
        'void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c);' +
        '  float a=smoothstep(0.5,0.0,d)*vA; if(a<0.01) discard;' +
        '  gl_FragColor=vec4(uColor,a); }'
    });
    return new THREE.Points(g, mat);
  }

  /* ───────────────────────── PITCH GEOMETRY ─────────────────────────
     Normalised pitch: x ∈ [-1,1], z ∈ [-0.62,0.62], y = 0. */
  function buildPitchSegments() {
    var X = 1, Z = 0.62, out = [];
    function L(x1, z1, x2, z2) { out.push(x1, 0, z1, x2, 0, z2); }
    // perimeter
    L(-X, -Z, X, -Z); L(X, -Z, X, Z); L(X, Z, -X, Z); L(-X, Z, -X, -Z);
    // halfway line
    L(0, -Z, 0, Z);
    // centre circle
    ring(0, 0, 0.2, 44, L);
    // penalty boxes
    box(-X, 0.3, 0.34, L, 1);   // left (opens to +x)
    box(X, 0.3, 0.34, L, -1);   // right (opens to -x)
    // goal areas
    box(-X, 0.12, 0.17, L, 1);
    box(X, 0.12, 0.17, L, -1);
    // goals (little frames poking out)
    L(-X, -0.07, -X - 0.05, -0.07); L(-X - 0.05, -0.07, -X - 0.05, 0.07); L(-X - 0.05, 0.07, -X, 0.07);
    L(X, -0.07, X + 0.05, -0.07); L(X + 0.05, -0.07, X + 0.05, 0.07); L(X + 0.05, 0.07, X, 0.07);
    return out;
  }
  function ring(cx, cz, r, n, L) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      L(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r);
    }
  }
  function box(edgeX, depth, halfH, L, dir) {
    var inner = edgeX - dir * depth;
    L(edgeX, -halfH, inner, -halfH); L(inner, -halfH, inner, halfH); L(inner, halfH, edgeX, halfH);
  }
  // Sample ~`target` points spread along every segment (proportional to length).
  function samplePitch(seg, target) {
    var lens = [], total = 0, i;
    for (i = 0; i < seg.length; i += 6) {
      var dx = seg[i + 3] - seg[i], dz = seg[i + 5] - seg[i + 2];
      var len = Math.hypot(dx, dz); lens.push(len); total += len;
    }
    var pts = [];
    for (i = 0; i < seg.length; i += 6) {
      var k = i / 6, count = Math.max(2, Math.round(target * (lens[k] / total)));
      for (var j = 0; j < count; j++) {
        var f = j / count;
        pts.push(
          seg[i] + (seg[i + 3] - seg[i]) * f,
          (Math.random() - 0.5) * 0.004,
          seg[i + 2] + (seg[i + 5] - seg[i + 2]) * f
        );
      }
    }
    return pts;
  }

  function radialTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,233,128,0.8)');
    g.addColorStop(1, 'rgba(255,209,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /* ───────────────────────── LOOP ───────────────────────── */
  function frame() {
    raf = requestAnimationFrame(frame);
    var t = (performance.now() - t0) / 1000;

    progress += (progressTarget - progress) * 0.07;
    mouse.x += (mouseT.x - mouse.x) * 0.06;
    mouse.y += (mouseT.y - mouse.y) * 0.06;

    // breathing + slow rotation + cursor parallax
    var breathe = 1 + Math.sin(t * 0.7) * 0.02;
    pitchGroup.scale.setScalar(breathe);
    pitchGroup.rotation.x = -1.02 + mouse.y * 0.14 - progress * 0.25;
    pitchGroup.rotation.z = Math.sin(t * 0.12) * 0.04 + mouse.x * 0.18;
    pitchGroup.position.y = -progress * 0.5; // sink a touch as it fractures

    lines.material.opacity = 0.9 * (1 - smooth(0.0, 0.45, progress)); // lines yield to particles
    points.material.uniforms.uTime.value = t;
    points.material.uniforms.uProgress.value = progress;
    atmos.material.uniforms.uTime.value = t;
    atmos.rotation.y = mouse.x * 0.1;
    atmos.position.x = mouse.x * 0.25;
    atmos.position.y = mouse.y * 0.15;

    for (var i = 0; i < glowSprites.length; i++) {
      var s = glowSprites[i];
      var pulse = 1 + Math.sin(t * 0.9 + s.userData.seed) * 0.12;
      s.scale.setScalar(s.userData.scale * pulse * (1 + progress * 0.4));
      s.material.opacity = s.userData.base * (0.7 + 0.3 * Math.sin(t * 0.9 + s.userData.seed)) * (1 - progress * 0.35);
    }

    camera.position.x += (mouse.x * 0.18 - camera.position.x) * 0.05;
    camera.lookAt(0, -0.15, 0);

    renderer.render(scene, camera);
  }
  function start() { if (!running) { running = true; t0 = performance.now() - 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ───────────────────────── EVENTS ───────────────────────── */
  function bindEvents() {
    // Pause when the hero leaves the viewport (free on the rest of the page).
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0.01 }).observe(hero);
    } else { start(); }

    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (!isMobile) {
      window.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        mouseT.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        mouseT.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      }, { passive: true });
    }

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });
    window.addEventListener('pagehide', dispose, { once: true });

    initParallax(hero, function () { return progress; });
  }

  function onScroll() {
    var h = hero.offsetHeight || window.innerHeight;
    progressTarget = Math.min(1, Math.max(0, window.scrollY / (h * 0.9)));
  }
  function resize() {
    size.w = hero.clientWidth; size.h = hero.clientHeight;
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
  }
  function dispose() {
    stop();
    scene && scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.map && m.map.dispose(); m.dispose(); }); }
    });
    renderer && renderer.dispose();
  }

  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function hasWebGL() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }
})();

/* ───────────────── Background video ─────────────────
   Poster paints immediately (already in the markup). On capable devices we
   attach the MP4 and fade it in over the poster. Skipped on mobile (data) and
   under reduced-motion — the poster stays. Pauses when the hero is offscreen. */
function initHeroVideo(hero, reduce, isMobile) {
  var vid = hero.querySelector('.hero__video-el');
  if (!vid) return;
  // Respect Save-Data if the browser exposes it.
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || isMobile || saveData) return; // poster only

  var src = vid.getAttribute('data-src');
  if (src && !vid.src) vid.src = src;
  vid.muted = true; // required for autoplay

  function tryPlay() { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
  vid.addEventListener('canplay', function () { vid.classList.add('playing'); tryPlay(); }, { once: false });
  vid.load();
  tryPlay();

  // Don't decode video while the hero is scrolled away.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.isIntersecting ? tryPlay() : vid.pause(); });
    }, { threshold: 0.05 }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? vid.pause() : tryPlay(); });
}

/* ───────────────── DOM motion: typography + scroll parallax ─────────────────
   Kept outside the WebGL closure so it also runs under reduced-motion / no-GL. */
function initHeroType(hero) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var h1 = hero.querySelector('.hero__h1');
  if (!h1 || h1.dataset.split) return;
  h1.dataset.split = '1';
  h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());

  // Wrap each character in a span while preserving <br> and <em> structure.
  var idx = 0;
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) { // text
        var frag = document.createDocumentFragment();
        n.nodeValue.split('').forEach(function (ch) {
          if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); return; }
          var s = document.createElement('span');
          s.className = 'hch'; s.textContent = ch;
          s.style.transitionDelay = (idx * 0.035) + 's';
          s.style.animationDelay = (idx * 0.12) + 's';
          idx++; frag.appendChild(s);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); }
    });
  })(h1);

  // inject styles once
  if (!document.getElementById('hero-type-css')) {
    var st = document.createElement('style');
    st.id = 'hero-type-css';
    st.textContent =
      '.hero__h1 .hch{display:inline-block;opacity:0;transform:translateY(46px) rotateX(-40deg);' +
      'filter:blur(8px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1),filter .7s ease;will-change:transform,opacity}' +
      '.hero__h1.in .hch{opacity:1;transform:none;filter:none;animation:hchFloat 6s ease-in-out infinite alternate}' +
      '@keyframes hchFloat{from{transform:translateY(0)}to{transform:translateY(-4px)}}' +
      '@media(prefers-reduced-motion:reduce){.hero__h1 .hch{opacity:1;transform:none;filter:none;animation:none}}';
    document.head.appendChild(st);
  }
  requestAnimationFrame(function () { requestAnimationFrame(function () { h1.classList.add('in'); }); });
}

function initParallax(hero, getProgress) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var left = hero.querySelector('.hero__left');
  if (!left || left.dataset.par) return;
  left.dataset.par = '1';
  left.style.willChange = 'transform,opacity';
  var raf;
  function tick() {
    raf = 0;
    var h = hero.offsetHeight || window.innerHeight;
    var p = getProgress ? getProgress() : Math.min(1, Math.max(0, window.scrollY / (h * 0.9)));
    left.style.transform = 'translate3d(0,' + (p * -64) + 'px,0)';
    left.style.opacity = String(1 - Math.max(0, p - 0.25) * 1.1);
  }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  tick();
}
