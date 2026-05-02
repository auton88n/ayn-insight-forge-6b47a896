/**
 * HeroScroll — Three.js WebGL with AdditiveBlending + glowing eye overlay.
 * Black pixels = transparent. Zero edges. Eye replaces brain icon.
 */

import { useEffect, useRef, memo } from 'react';
import * as THREE from 'three';
import { useScroll, useTransform, useSpring, useMotionValueEvent } from 'framer-motion';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';
import { useLanguage } from '@/contexts/LanguageContext';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(v: number, a: number, b: number, c: number, d: number) {
  return c + (clamp(v, a, b) - a) / (b - a) * (d - c);
}

const CHAPTERS = [
  { label: 'WORLD INTELLIGENCE', title: 'See every market\nbefore it moves.', body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals.', stat: '187', unit: 'Countries', in: 0.35, out: 0.58 },
  { label: 'PREDICTIVE AI', title: 'Know what happens\nbefore it does.', body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.', stat: '73', unit: 'World Agents', in: 0.60, out: 0.78 },
  { label: 'AI AGENTS', title: 'Your team.\nNever sleeps.', body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.', stat: '24/7', unit: 'Always On', in: 0.80, out: 0.94 },
];

let cachedImages: HTMLImageElement[] | null = null;
function getImages() {
  if (!cachedImages) {
    cachedImages = HELMET_FRAMES.map(src => { const i = new Image(); i.src = src; return i; });
  }
  return cachedImages;
}

// Draw a glowing eye on a canvas — used as Three.js texture
function createEyeTexture(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = size / 2, cy = size / 2;

  // Outer glow
  const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
  og.addColorStop(0, 'rgba(201,168,76,0.0)');
  og.addColorStop(0.5, 'rgba(201,168,76,0.04)');
  og.addColorStop(1, 'rgba(201,168,76,0.0)');
  ctx.fillStyle = og; ctx.fillRect(0, 0, size, size);

  // Iris
  const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.30);
  ig.addColorStop(0, 'rgba(255,200,60,0.0)');
  ig.addColorStop(0.4, 'rgba(220,150,30,0.6)');
  ig.addColorStop(0.75, 'rgba(180,100,10,0.85)');
  ig.addColorStop(1, 'rgba(100,50,0,0.3)');
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.30, 0, Math.PI * 2);
  ctx.fillStyle = ig; ctx.fill();

  // Iris detail lines
  ctx.strokeStyle = 'rgba(255,180,40,0.25)';
  ctx.lineWidth = 0.8;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.08, cy + Math.sin(a) * size * 0.08);
    ctx.lineTo(cx + Math.cos(a) * size * 0.28, cy + Math.sin(a) * size * 0.28);
    ctx.stroke();
  }

  // Pupil
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.09);
  pg.addColorStop(0, 'rgba(0,0,0,1)');
  pg.addColorStop(0.6, 'rgba(10,5,0,0.95)');
  pg.addColorStop(1, 'rgba(30,15,0,0.5)');
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = pg; ctx.fill();

  // Specular highlight
  const sg = ctx.createRadialGradient(cx - size*0.05, cy - size*0.05, 0, cx - size*0.05, cy - size*0.05, size*0.08);
  sg.addColorStop(0, 'rgba(255,240,200,0.9)');
  sg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.beginPath(); ctx.arc(cx - size*0.05, cy - size*0.05, size*0.06, 0, Math.PI*2);
  ctx.fillStyle = sg; ctx.fill();

  // Eyelids — top and bottom curves
  ctx.strokeStyle = 'rgba(180,140,60,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.38, size * 0.22, 0, Math.PI * 0.1, Math.PI * 0.9, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.38, size * 0.22, 0, Math.PI * 1.1, Math.PI * 1.9, false);
  ctx.stroke();

  // Outer ring
  ctx.strokeStyle = 'rgba(201,168,76,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.40, 0, Math.PI*2); ctx.stroke();

  return c;
}

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef(0);
  const headlineRef   = useRef<HTMLDivElement>(null);
  const chRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef        = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.OrthographicCamera | null>(null);
  const meshRef       = useRef<THREE.Mesh | null>(null);
  const eyeMeshRef    = useRef<THREE.Mesh | null>(null);
  const textureRef    = useRef<THREE.Texture | null>(null);
  const currentFrame  = useRef(0);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const rawFrame = useTransform(scrollYProgress, [0, 0.60], [0, FRAME_COUNT - 1]);
  const smoothFrame = useSpring(rawFrame, { stiffness: 500, damping: 45, restDelta: 0.3 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const images = getImages();

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Orthographic camera
    const getAspect = () => canvas.clientWidth / canvas.clientHeight;
    const frustum = 1;
    const camera = new THREE.OrthographicCamera(
      -frustum * getAspect(), frustum * getAspect(), frustum, -frustum, 0.1, 10
    );
    camera.position.z = 2;
    cameraRef.current = camera;

    // Robot frame texture
    const firstImg = images[0];
    const tex = new THREE.Texture(firstImg);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (firstImg.complete) tex.needsUpdate = true;
    else firstImg.onload = () => { tex.needsUpdate = true; };
    textureRef.current = tex;

    // Robot plane — slightly smaller than frustum for clean look
    const buildPlane = (a: number) => new THREE.PlaneGeometry(1.7 * a, 1.7);
    const mat = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(buildPlane(getAspect()), mat);
    meshRef.current = mesh;
    scene.add(mesh);

    // Eye overlay — positioned at center of helmet lens
    // The brain/lens is roughly at 50% horizontal, 46% vertical of the frame
    const eyeCanvas = createEyeTexture(512);
    const eyeTex = new THREE.CanvasTexture(eyeCanvas);
    eyeTex.minFilter = THREE.LinearFilter;
    const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    // Eye size: ~12% of frustum height
    const eyeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), eyeMat);
    // Position: center-right of scene (helmet lens position)
    // x=0 is center of canvas, y=0 is center. Lens is slightly right and slightly above center.
    eyeMesh.position.set(0.04, 0.06, 0.01);
    eyeMeshRef.current = eyeMesh;
    scene.add(eyeMesh);

    // Resize
    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      const a = w / h;
      camera.left = -frustum * a; camera.right = frustum * a;
      camera.top = frustum; camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      mesh.geometry.dispose();
      mesh.geometry = buildPlane(a);
    };
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    window.addEventListener('resize', onResize);

    // RAF
    let t0 = 0;
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = t - t0; t0 = t;

      // Swap frame texture
      const idx = clamp(Math.round(currentFrame.current), 0, FRAME_COUNT - 1);
      const img = images[idx];
      if (img?.complete && textureRef.current && textureRef.current.image !== img) {
        textureRef.current.image = img;
        textureRef.current.needsUpdate = true;
      }

      const prog = scrollYProgress.get();

      // Robot mesh: subtle rotation for 3D parallax
      if (mesh) {
        mesh.rotation.y = lerp(prog, 0, 1, -0.06, 0.06);
        mesh.rotation.x = lerp(prog, 0, 0.5, 0.015, -0.015);
        mesh.position.y = Math.sin(t * 0.0007) * 0.008;
      }

      // Eye: pulsing glow + subtle rotation
      if (eyeMesh) {
        const pulse = 0.85 + Math.sin(t * 0.0018) * 0.15;
        eyeMesh.scale.setScalar(pulse);
        eyeMesh.rotation.z += 0.0003;
        // Eye appears gradually as frames advance (helmet forms)
        const eyeOpacity = clamp(lerp(prog, 0.55, 0.70, 0, 1), 0, 1);
        (eyeMesh.material as THREE.MeshBasicMaterial).opacity = eyeOpacity;
        (eyeMesh.material as THREE.MeshBasicMaterial).transparent = true;
        // Eye position follows mesh slight rotation for parallax
        eyeMesh.position.x = 0.04 + mesh.rotation.y * 0.3;
        eyeMesh.position.y = 0.06 - mesh.rotation.x * 0.5;
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      tex.dispose(); eyeTex.dispose();
      mat.dispose(); eyeMat.dispose();
    };
  }, []);

  useMotionValueEvent(smoothFrame, 'change', (v) => { currentFrame.current = clamp(v, 0, FRAME_COUNT - 1); });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.24, 1, 0);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${lerp(p, 0.10, 0.24, 0, -48)}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
    if (scrollHintRef.current) scrollHintRef.current.style.opacity = `${lerp(p, 0, 0.07, 1, 0)}`;
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.28;
      let op = 0, ty = 36;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 36, 0) : lerp(p, peak, ch.out, 0, -36);
      }
      el.style.opacity = `${op}`; el.style.transform = `translateY(${ty}px)`;
      el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    });
    if (ctaRef.current) {
      const op = lerp(p, 0.92, 0.99, 0, 1);
      ctaRef.current.style.opacity = `${op}`;
      ctaRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
  });

  return (
    <div style={{ background: '#000', position: 'relative' }}>
      <div ref={containerRef} style={{ height: '400vh', position: 'relative' }}>
        <div className="sticky top-0" style={{ height: '100dvh', overflow: 'hidden', background: '#000' }}>

          {/* THREE.JS CANVAS — right 55%, transparent bg */}
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, right: 0, width: '55%', height: '100%', display: 'block', background: 'transparent' }} />

          {/* TEXT — left 42% */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '42%', height: '100%', display: 'flex', alignItems: 'center', padding: '80px clamp(32px,4vw,72px)', boxSizing: 'border-box' }}>
            <div style={{ position: 'relative', width: '100%', height: 'min(600px,75vh)' }}>

              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 18px' }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(58px,7vw,110px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 24px', letterSpacing: '-0.01em' }}>
                  {isAr ? 'تعرّف على ' : 'Meet '}<span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 300, lineHeight: 1.72, color: 'rgba(255,255,255,0.40)', maxWidth: 340, margin: '0 0 40px' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.' : 'Real business intelligence. Scroll to watch AYN transform — and discover what it sees.'}
                </p>
                <div ref={scrollHintRef} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 28, height: 1, background: 'rgba(201,168,76,0.5)' }} />
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>Scroll to explore</span>
                </div>
              </div>

              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 16px' }}>{ch.label}</p>
                  <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(42px,5vw,78px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px', whiteSpace: 'pre-line' }}>{ch.title}</h2>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 320, margin: '0 0 28px' }}>{ch.body}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.5vw,72px)', color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)', margin: '0 0 14px' }}>Ready to see the world clearly?</p>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.8vw,86px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 32px' }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 34px', background: '#C9A84C', color: '#000', fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>Get Started Free →</a>
                  <a href="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 30px', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.52)', fontFamily: "'DM Sans',sans-serif", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.52)'; }}>See Features</a>
                </div>
              </div>

            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 0, left: '8%', right: '8%', height: 1, background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.10), transparent)' }} />
        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
