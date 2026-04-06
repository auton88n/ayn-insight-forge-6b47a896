/**
 * ParticleCanvas — WebGL particle gravity simulator
 * Physics based on Im-Rises/ParticleSimulator (OpenGL/GLSL)
 * Recreated in raw WebGL2 with Transform Feedback for GPU-side physics.
 *
 * Physics: Each particle is attracted to the mouse cursor using
 * Newtonian gravity: F = G * M * m / r² * normalize(r)
 * Color is velocity-based (matches original frag shader logic).
 */
import React, { useEffect, useRef, useCallback } from 'react';

interface Props {
  particleCount?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Overlay content shown on top of the canvas */
  children?: React.ReactNode;
}

// Physics constants (tuned to match the original simulator feel)
const G          = 6.0;
const ATTRACTOR_MASS = 8.0;
const PARTICLE_MASS  = 1.0;
const DAMPING    = 0.98;
const SOFTENING  = 0.5;

// ── Vertex shader: physics update + render ────────────────────────────────────
// Uses Transform Feedback to update position/velocity on GPU each frame.
// Matches the logic of ParticleSimulator.vert exactly.
const UPDATE_VS = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_velocity;

uniform float u_dt;
uniform vec3  u_attractor;      // world-space attractor position
uniform float u_attracting;     // 0 or 1
uniform float u_gravity;
uniform float u_damping;
uniform float u_softening;
uniform float u_attractorMass;
uniform float u_particleMass;

out vec3 v_position;
out vec3 v_velocity;

void main() {
  vec3 r = u_attractor - a_position;
  float rSq = dot(r, r) + u_softening;
  vec3 force = (u_gravity * u_attractorMass * u_particleMass * normalize(r) / rSq) * u_attracting;
  vec3 accel = force / u_particleMass;

  vec3 pos = a_position + a_velocity * u_dt + 0.5 * accel * u_dt * u_dt;
  vec3 vel = (a_velocity + accel * u_dt) * u_damping;

  // Soft boundary wrap — keeps particles in view
  if (pos.x >  2.0) pos.x -= 4.0;
  if (pos.x < -2.0) pos.x += 4.0;
  if (pos.y >  1.2) pos.y -= 2.4;
  if (pos.y < -1.2) pos.y += 2.4;

  v_position = pos;
  v_velocity = vel;
}
`;

// ── Fragment shader for physics pass (not rendered) ───────────────────────────
const UPDATE_FS = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`;

// ── Render vertex shader ──────────────────────────────────────────────────────
const RENDER_VS = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_velocity;

uniform vec2 u_resolution;

out vec3 v_vel;

void main() {
  // Map NDC-like coords to clip space (positions are in [-2,2] x [-1.2,1.2])
  float aspect = u_resolution.x / u_resolution.y;
  vec2 clip = vec2(a_position.x / (2.0 * aspect), a_position.y / 1.2);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = 1.5;
  v_vel = a_velocity;
}
`;

// ── Render fragment shader — velocity-based color (matches original frag) ─────
const RENDER_FS = `#version 300 es
precision highp float;

in vec3 v_vel;
out vec4 fragColor;

void main() {
  // Original: vec3(min(v_vel.y, 0.8), max(v_vel.x, 0.5), min(v_vel.z, 0.5))
  // We scale velocity to get nicer colors for lower-speed web simulation
  float speed = length(v_vel);
  vec3 slow  = vec3(0.05, 0.15, 0.35);   // deep blue — resting particles
  vec3 fast  = vec3(0.0,  0.85, 0.60);   // cyan-green — moving particles  
  vec3 hyper = vec3(1.0,  0.35, 0.10);   // orange-red — high velocity

  vec3 col = speed < 0.5
    ? mix(slow, fast, speed / 0.5)
    : mix(fast, hyper, clamp((speed - 0.5) / 2.0, 0.0, 1.0));

  float alpha = 0.6 + clamp(speed * 0.4, 0.0, 0.4);
  fragColor = vec4(col, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}\n${src.slice(0, 200)}`);
  }
  return s;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
  varyings?: string[]
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (varyings?.length) {
    gl.transformFeedbackVaryings(prog, varyings, gl.INTERLEAVED_ATTRIBS);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export default function ParticleCanvas({ particleCount = 60000, className, style, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<{
    gl: WebGL2RenderingContext;
    updateProg: WebGLProgram;
    renderProg: WebGLProgram;
    vaos:  [WebGLVertexArrayObject, WebGLVertexArrayObject];
    bufs:  [WebGLBuffer, WebGLBuffer]; // interleaved pos+vel
    tf:    [WebGLTransformFeedback, WebGLTransformFeedback];
    current: 0 | 1;
    count: number;
    mouse: { x: number; y: number; active: boolean };
    raf: number;
    attracting: boolean;
  } | null>(null);

  const init = useCallback((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) { console.warn('[ParticleCanvas] WebGL2 not supported'); return; }

    const W = canvas.width;
    const H = canvas.height;
    const aspect = W / H;

    // Build programs
    const updateVS = compileShader(gl, gl.VERTEX_SHADER,   UPDATE_VS);
    const updateFS = compileShader(gl, gl.FRAGMENT_SHADER, UPDATE_FS);
    const renderVS = compileShader(gl, gl.VERTEX_SHADER,   RENDER_VS);
    const renderFS = compileShader(gl, gl.FRAGMENT_SHADER, RENDER_FS);
    const updateProg = linkProgram(gl, updateVS, updateFS, ['v_position', 'v_velocity']);
    const renderProg = linkProgram(gl, renderVS, renderFS);

    // Initial particle data: positions in [-2,2]x[-1.2,1.2], random velocities
    const N = particleCount;
    // Buffer layout per particle: px py pz vx vy vz (6 floats = 24 bytes)
    const STRIDE = 6;
    const data = new Float32Array(N * STRIDE);
    for (let i = 0; i < N; i++) {
      const base = i * STRIDE;
      // Spread particles in a cluster pattern
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.5;
      data[base + 0] = Math.cos(angle) * r * aspect; // px
      data[base + 1] = Math.sin(angle) * r;           // py
      data[base + 2] = 0;                              // pz
      data[base + 3] = (Math.random() - 0.5) * 0.02; // vx
      data[base + 4] = (Math.random() - 0.5) * 0.02; // vy
      data[base + 5] = 0;                              // vz
    }

    // Create two ping-pong buffer sets
    const bufs: [WebGLBuffer, WebGLBuffer] = [gl.createBuffer()!, gl.createBuffer()!];
    const vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] = [gl.createVertexArray()!, gl.createVertexArray()!];
    const tf:   [WebGLTransformFeedback, WebGLTransformFeedback] = [gl.createTransformFeedback()!, gl.createTransformFeedback()!];

    for (let i = 0; i < 2; i++) {
      // Upload data
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
      gl.bufferData(gl.ARRAY_BUFFER, i === 0 ? data : new Float32Array(N * STRIDE), gl.DYNAMIC_DRAW);

      // VAO for rendering (uses the same interleaved buffer)
      gl.bindVertexArray(vaos[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
      // position: location 0, 3 floats, stride 24, offset 0
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      // velocity: location 1, 3 floats, stride 24, offset 12
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindVertexArray(null);

      // Transform feedback object points to the OTHER buffer (read from i, write to 1-i)
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf[i]);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs[1 - i]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    stateRef.current = {
      gl, updateProg, renderProg,
      vaos, bufs, tf,
      current: 0,
      count: N,
      mouse: { x: 0, y: 0, active: false },
      raf: 0,
      attracting: false,
    };
  }, [particleCount]);

  const startLoop = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const { gl, vaos, tf } = s;
    const canvas = canvasRef.current!;

    let last = performance.now();

    const frame = () => {
      const now = performance.now();
      const dt  = Math.min((now - last) / 1000, 0.033); // cap at ~30fps physics step
      last = now;

      const { current, count, mouse, updateProg, renderProg } = s;
      const next = (1 - current) as 0 | 1;

      // Resize if needed
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width  = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      // ── PHYSICS PASS (transform feedback, no rasterization) ──────────
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.useProgram(updateProg);

      // Set uniforms
      const uDt   = gl.getUniformLocation(updateProg, 'u_dt');
      const uAtt  = gl.getUniformLocation(updateProg, 'u_attractor');
      const uIsA  = gl.getUniformLocation(updateProg, 'u_attracting');
      const uG    = gl.getUniformLocation(updateProg, 'u_gravity');
      const uDamp = gl.getUniformLocation(updateProg, 'u_damping');
      const uSoft = gl.getUniformLocation(updateProg, 'u_softening');
      const uAM   = gl.getUniformLocation(updateProg, 'u_attractorMass');
      const uPM   = gl.getUniformLocation(updateProg, 'u_particleMass');

      // Map mouse from canvas pixels → world space
      const mx = (mouse.x / canvas.width  - 0.5) * 2 * (canvas.width / canvas.height) * 2;
      const my = -(mouse.y / canvas.height - 0.5) * 2.4;

      gl.uniform1f(uDt,   dt);
      gl.uniform3f(uAtt,  mx, my, 0);
      gl.uniform1f(uIsA,  mouse.active ? 1.0 : 0.4); // always slightly attracting
      gl.uniform1f(uG,    G);
      gl.uniform1f(uDamp, DAMPING);
      gl.uniform1f(uSoft, SOFTENING);
      gl.uniform1f(uAM,   ATTRACTOR_MASS);
      gl.uniform1f(uPM,   PARTICLE_MASS);

      // Bind READ vao (current) — transform feedback writes to next buffer
      gl.bindVertexArray(vaos[current]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf[current]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.endTransformFeedback();
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.bindVertexArray(null);
      gl.disable(gl.RASTERIZER_DISCARD);

      // ── RENDER PASS ──────────────────────────────────────────────────
      gl.clearColor(0, 0, 0, 0); // transparent background
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blending — key for glow effect

      gl.useProgram(renderProg);
      const uRes = gl.getUniformLocation(renderProg, 'u_resolution');
      gl.uniform2f(uRes, canvas.width, canvas.height);

      // Render the NEXT buffer (freshly updated positions)
      gl.bindVertexArray(vaos[next]);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);

      // Swap
      s.current = next;
      s.raf = requestAnimationFrame(frame);
    };

    s.raf = requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    try {
      init(canvas);
      startLoop();
    } catch (e) {
      console.warn('[ParticleCanvas] Init failed:', e);
    }

    // Mouse handlers
    const onMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const rect = canvas.getBoundingClientRect();
      s.mouse.x = e.clientX - rect.left;
      s.mouse.y = e.clientY - rect.top;
    };
    const onEnter = () => { if (stateRef.current) stateRef.current.mouse.active = true; };
    const onLeave = () => { if (stateRef.current) stateRef.current.mouse.active = false; };

    // Touch support
    const onTouch = (e: TouchEvent) => {
      const s = stateRef.current;
      if (!s || !e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      s.mouse.x = e.touches[0].clientX - rect.left;
      s.mouse.y = e.touches[0].clientY - rect.top;
      s.mouse.active = true;
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseenter', onEnter);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchstart', onTouch, { passive: true });
    canvas.addEventListener('touchend', () => { if (stateRef.current) stateRef.current.mouse.active = false; });

    const onResize = () => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const s = stateRef.current;
      if (s) s.gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      const s = stateRef.current;
      if (s) cancelAnimationFrame(s.raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseenter', onEnter);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('touchmove', onTouch);
      window.removeEventListener('resize', onResize);
    };
  }, [init, startLoop]);

  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={style}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block', background: 'transparent' }}
      />
      {/* Overlay content sits above canvas */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
