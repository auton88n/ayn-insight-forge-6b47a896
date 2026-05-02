/**
 * HeroScroll — Three.js WebGL canvas with AdditiveBlending.
 * Black pixels = rgb(0,0,0) = mathematically invisible in additive blend.
 * Zero edges. Zero borders. Pure seamless float on black.
 *
 * Architecture:
 *   - Three.js renderer: alpha:true, background null
 *   - Plane geometry with frame texture
 *   - MeshBasicMaterial + AdditiveBlending → black = transparent
 *   - Scroll drives frame index via RAF
 *   - Subtle mesh Y rotation for 3D depth feel
 *   - 121 frames: robot (0) → helmet (120)
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
  {
    label: 'WORLD INTELLIGENCE',
    title: 'See every market\nbefore it moves.',
    body: 'AYN monitors 187 countries — geopolitical shifts, commodity flows, and live market signals.',
    stat: '187', unit: 'Countries',
    in: 0.35, out: 0.58,
  },
  {
    label: 'PREDICTIVE AI',
    title: 'Know what happens\nbefore it does.',
    body: '73 AI agents simulate how populations, governments, and markets respond — before events unfold.',
    stat: '73', unit: 'World Agents',
    in: 0.60, out: 0.78,
  },
  {
    label: 'AI AGENTS',
    title: 'Your team.\nNever sleeps.',
    body: 'Custom agents trained on your data. Intelligence delivered 24/7, in Arabic and English.',
    stat: '24/7', unit: 'Always On',
    in: 0.80, out: 0.94,
  },
];

// Preload all textures as Image objects (decoded once, reused)
let textureCache: HTMLImageElement[] | null = null;
function getTextureCache(): HTMLImageElement[] {
  if (!textureCache) {
    textureCache = HELMET_FRAMES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }
  return textureCache;
}

export const HeroScroll = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef(0);

  // DOM refs for text layers
  const headlineRef   = useRef<HTMLDivElement>(null);
  const chRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef        = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  // Three.js objects
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.OrthographicCamera | null>(null);
  const meshRef      = useRef<THREE.Mesh | null>(null);
  const materialRef  = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef   = useRef<THREE.Texture | null>(null);

  // Frame state
  const currentFrame = useRef(0);
  const targetFrame  = useRef(0);
  const images       = useRef<HTMLImageElement[]>([]);

  // Framer Motion scroll
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const rawFrame = useTransform(scrollYProgress, [0, 0.60], [0, FRAME_COUNT - 1]);
  const smoothFrame = useSpring(rawFrame, { stiffness: 500, damping: 45, restDelta: 0.3 });

  // Init Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    images.current = getTextureCache();

    // Renderer — alpha: true so canvas is transparent, we draw on top of #000 page
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // fully transparent clear
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Orthographic camera — no perspective distortion, clean product-page feel
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const frustum = 1;
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 10
    );
    camera.position.z = 2;
    cameraRef.current = camera;

    // Initial texture from first frame
    const firstImg = images.current[0];
    const tex = new THREE.Texture(firstImg);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (firstImg.complete) tex.needsUpdate = true;
    else firstImg.onload = () => { tex.needsUpdate = true; };
    textureRef.current = tex;

    // Plane — sized to fill the camera frustum
    const geo = new THREE.PlaneGeometry(2 * aspect, 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      blending: THREE.AdditiveBlending, // BLACK = TRANSPARENT. Always.
      depthWrite: false,
      transparent: true,
    });
    materialRef.current = mat;
    const mesh = new THREE.Mesh(geo, mat);
    meshRef.current = mesh;
    scene.add(mesh);

    // Resize handler
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      const a = w / h;
      camera.left   = -frustum * a;
      camera.right  =  frustum * a;
      camera.top    =  frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      // Resize plane to match
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(2 * a, 2);
    };
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    window.addEventListener('resize', onResize);

    // RAF render loop
    let animY = 0; // subtle bob
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);

      // Smooth frame
      const idx = clamp(Math.round(currentFrame.current), 0, FRAME_COUNT - 1);
      const img = images.current[idx];
      if (img?.complete && textureRef.current) {
        if (textureRef.current.image !== img) {
          textureRef.current.image = img;
          textureRef.current.needsUpdate = true;
        }
      }

      // Subtle idle animation — very slight Y oscillation for 3D depth feel
      animY = Math.sin(t * 0.0008) * 0.006;
      if (meshRef.current) {
        meshRef.current.position.y = animY;
        // Subtle rotation proportional to scroll progress — gives 3D parallax
        const prog = scrollYProgress.get();
        meshRef.current.rotation.y = lerp(prog, 0, 1, -0.04, 0.04);
        meshRef.current.rotation.x = lerp(prog, 0, 0.5, 0.02, -0.02);
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      tex.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, []);

  // Drive frame from spring
  useMotionValueEvent(smoothFrame, 'change', (v) => {
    currentFrame.current = clamp(v, 0, FRAME_COUNT - 1);
  });

  // Drive text from scroll
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (headlineRef.current) {
      const op = p < 0.10 ? 1 : lerp(p, 0.10, 0.24, 1, 0);
      headlineRef.current.style.opacity = `${op}`;
      headlineRef.current.style.transform = `translateY(${lerp(p, 0.10, 0.24, 0, -48)}px)`;
      headlineRef.current.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    }
    if (scrollHintRef.current) {
      scrollHintRef.current.style.opacity = `${lerp(p, 0, 0.07, 1, 0)}`;
    }
    CHAPTERS.forEach((ch, i) => {
      const el = chRefs.current[i];
      if (!el) return;
      const peak = ch.in + (ch.out - ch.in) * 0.28;
      let op = 0, ty = 36;
      if (p >= ch.in && p <= ch.out) {
        op = p < peak ? lerp(p, ch.in, peak, 0, 1) : lerp(p, peak, ch.out, 1, 0);
        ty = p < peak ? lerp(p, ch.in, peak, 36, 0) : lerp(p, peak, ch.out, 0, -36);
      }
      el.style.opacity = `${op}`;
      el.style.transform = `translateY(${ty}px)`;
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

          {/* THREE.JS CANVAS — covers full right half, transparent bg */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0, right: 0,
              width: '58%', height: '100%',
              display: 'block',
              background: 'transparent',
            }}
          />

          {/* TEXT COLUMN — left side */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '44%', height: '100%',
            display: 'flex', alignItems: 'center',
            padding: '80px clamp(32px, 4vw, 72px)',
            boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', width: '100%', height: 'min(600px, 75vh)' }}>

              {/* HEADLINE */}
              <div ref={headlineRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 18px' }}>
                  {isAr ? 'ذكاء الأعمال' : 'World Intelligence Platform'}
                </p>
                <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(58px,7vw,110px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 24px', letterSpacing: '-0.01em' }}>
                  {isAr ? 'تعرّف على ' : 'Meet '}
                  <span style={{ color: '#C9A84C' }}>{isAr ? 'عين' : 'AYN'}</span>
                </h1>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 300, lineHeight: 1.72, color: 'rgba(255,255,255,0.40)', maxWidth: 340, margin: '0 0 40px' }}>
                  {isAr ? 'ذكاء أعمال حقيقي. أسواق، مخاطر، وقرارات تهم.' : 'Real business intelligence. Scroll to watch AYN transform — and discover what it sees.'}
                </p>
                <div ref={scrollHintRef} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 28, height: 1, background: 'rgba(201,168,76,0.5)' }} />
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>
                    Scroll to explore
                  </span>
                </div>
              </div>

              {/* CHAPTERS */}
              {CHAPTERS.map((ch, i) => (
                <div key={i} ref={el => { chRefs.current[i] = el; }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A84C', margin: '0 0 16px' }}>{ch.label}</p>
                  <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(42px,5vw,78px)', fontWeight: 400, lineHeight: 0.92, color: '#fff', margin: '0 0 20px', whiteSpace: 'pre-line' }}>{ch.title}</h2>
                  <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)', maxWidth: 320, margin: '0 0 28px' }}>{ch.body}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.5vw,72px)', color: '#C9A84C', lineHeight: 1 }}>{ch.stat}</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>{ch.unit}</span>
                  </div>
                </div>
              ))}

              {/* CTA */}
              <div ref={ctaRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: 0, pointerEvents: 'none' }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)', margin: '0 0 14px' }}>Ready to see the world clearly?</p>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(46px,5.8vw,86px)', fontWeight: 400, lineHeight: 0.88, color: '#fff', margin: '0 0 32px' }}>
                  Start with <span style={{ color: '#C9A84C' }}>AYN</span>
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 34px', background: '#C9A84C', color: '#000', fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                    Get Started Free →
                  </a>
                  <a href="/features" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 30px', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.52)', fontFamily: "'DM Sans',sans-serif", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.52)'; }}>
                    See Features
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom hairline */}
          <div style={{ position: 'absolute', bottom: 0, left: '8%', right: '8%', height: 1, background: 'linear-gradient(to right, transparent, rgba(201,168,76,0.10), transparent)' }} />

        </div>
      </div>
    </div>
  );
});

HeroScroll.displayName = 'HeroScroll';
