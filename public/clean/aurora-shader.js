/* SwiflyTV v168 — actual noise-driven Aurora, rather than animated CSS blobs.
 * WebGL1, no libraries, no network images; GPU capped at 24fps / ~1MP.
 * Honors Studio colors/intensity/speed, watch pages, hidden tabs, reduced motion.
 * No animation loop at all if the canvas context is unavailable.
 */
(() => {
  'use strict';
  if (window.SwiflyAuroraShader) return;
  const vertex = `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const fragment = `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uStrength;
    uniform vec3 uColorA;
    uniform vec3 uColorB;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0,0.0)), f.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), f.x),
        f.y
      );
    }
    float fbm(vec2 p) {
      float total = 0.0;
      total += 0.52 * noise(p);
      total += 0.26 * noise(p * 2.08 + 7.31);
      total += 0.14 * noise(p * 4.14 + 12.9);
      total += 0.08 * noise(p * 8.17 + 24.7);
      return total;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      float t = uTime;
      // Organic, gently changing edges: noise distorts both aurora curtains.
      float broad = fbm(vec2(uv.x * 2.9 + t * 0.052, t * 0.043));
      float fold = fbm(vec2(uv.x * 5.2 - t * 0.035, uv.y * 2.1 + t * 0.061));
      float detail = fbm(vec2(uv.x * 9.1 + t * 0.055, t * 0.093 + uv.y * 2.0));
      float ridge = 0.81 + 0.11 * (broad - 0.5) + 0.060 * sin(uv.x * 5.8 + t * 0.16);
      ridge += 0.061 * (fold - 0.5);
      float dr = (uv.y - ridge) / (0.18 + 0.063 * broad);
      float curtain = exp(-2.0 * dr * dr);
      float ribbons = mix(0.67, 1.15, smoothstep(0.24,0.88,detail));
      curtain *= ribbons;

      float secondary = fbm(vec2(uv.x * 2.1 - t * 0.063 + 8.7, t * 0.054 + 18.1));
      float centerB = 0.91 - 0.18 * secondary + 0.044 * sin(uv.x * 7.2 - t * 0.22);
      float d2 = (uv.y - centerB) / 0.24;
      float veil = exp(-1.9 * d2 * d2) * (0.67 + 0.33 * fold);

      // A wide glimmer behind the curtains, with a smooth taper into black.
      float haze = smoothstep(0.40, 0.91, uv.y) * (0.32 + 0.3 * broad);
      float mask = smoothstep(0.31, 0.66, uv.y);
      float edge = smoothstep(0.0, 0.13, uv.x) * (1.0 - smoothstep(0.94, 1.08, uv.x));
      float wave = curtain * 0.63 + veil * 0.26 + haze * 0.22;
      float energy = wave * mask * edge * uStrength;

      float blend = clamp(uv.x * 0.7 + broad * 0.48 + 0.12 * sin(t * 0.13), 0.0, 1.0);
      vec3 tint = mix(uColorA, uColorB, blend);
      vec3 color = tint * (0.53 + 0.43 * curtain) * energy;
      float alpha = clamp(energy * 0.67, 0.0, 0.58);
      gl_FragColor = vec4(color, alpha);
    }
  `;
  const palettes = {
    glacier: [[0.02,0.83,0.43],[0.07,0.72,0.65]],
    violet: [[0.44,0.33,0.91],[0.16,0.56,0.87]],
    rose: [[0.92,0.32,0.53],[0.60,0.34,0.79]],
    mint: [[0.16,0.80,0.49],[0.07,0.72,0.68]]
  };
  const root = document.querySelector('.svAuroraBackground');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const body = document.body;
  let canvas, gl, program, buffer, uniforms;
  let failed = false, disposed = false, raf = 0, lastFrame = 0, lastTick = 0, time = 0;
  let observer, state = 'off', lastOptions = '';
  const targetFps = 24;
  const getState = () => body.dataset.svAuroraState || 'off';
  const settings = () => ({
    strength: Math.max(0, Math.min(1, parseFloat(body.style.getPropertyValue('--sv-aurora-strength')) || 0.8)),
    color: palettes[body.dataset.stAuroraColor] ? body.dataset.stAuroraColor : 'glacier',
    motion: body.dataset.stAuroraMotion || 'drift'
  });
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw Error(error || 'Shader compile failed');
    }
    return shader;
  }
  function init() {
    if (failed || gl || disposed) return Boolean(gl);
    try {
      canvas = document.createElement('canvas');
      canvas.className = 'svAuroraCanvas';
      canvas.setAttribute('aria-hidden', 'true');
      gl = canvas.getContext('webgl', {
        alpha:true, premultipliedAlpha:false, antialias:false,
        depth:false, stencil:false, powerPreference:'low-power'
      });
      if (!gl) throw Error('WebGL is unavailable');
      const vs = compile(gl.VERTEX_SHADER, vertex);
      const fs = compile(gl.FRAGMENT_SHADER, fragment);
      program = gl.createProgram();
      gl.attachShader(program, vs);gl.attachShader(program, fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      gl.useProgram(program);
      const location=gl.getAttribLocation(program,'aPosition');
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      uniforms={
        resolution:gl.getUniformLocation(program,'uResolution'),
        time:gl.getUniformLocation(program,'uTime'),
        strength:gl.getUniformLocation(program,'uStrength'),
        a:gl.getUniformLocation(program,'uColorA'),
        b:gl.getUniformLocation(program,'uColorB')
      };
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0,0,0,0);
      canvas.addEventListener('webglcontextlost',event=>{
        event.preventDefault();fallback();
      });
      root.appendChild(canvas);
      root.dataset.svRenderer='webgl';
      resize();
      return true;
    } catch (error) {
      if (window.console?.warn) console.warn('Swifly Aurora using CSS fallback:',error.message);
      fallback();
      return false;
    }
  }
  function fallback() {
    failed=true;cancelAnimationFrame(raf);raf=0;
    root.dataset.svRenderer='fallback';
    canvas?.remove();canvas=null;gl=null;
  }
  function resize() {
    if (!canvas || !gl) return;
    const width = window.innerWidth || root.clientWidth || 1;
    const height = window.innerHeight || root.clientHeight || 1;
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.25);
    const scale=Math.min(pixelRatio,1280/width,720/height);
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    if (canvas.width!==w || canvas.height!==h) {
      canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);
    }
  }
  function paint() {
    if (!gl || gl.isContextLost()) return;
    const opts=settings(),palette=palettes[opts.color];
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
    gl.uniform1f(uniforms.time,time);
    gl.uniform1f(uniforms.strength,opts.strength);
    gl.uniform3fv(uniforms.a,palette[0]);
    gl.uniform3fv(uniforms.b,palette[1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  function frame(now) {
    raf=0;
    if (state!=='live' || disposed) return;
    if (now-lastFrame>=1000/targetFps) {
      const delta=lastTick ? Math.min(80,now-lastTick) : 0;
      const speed=settings().motion==='slow' ? 0.48 : 1;
      time += delta*0.001*speed;
      lastFrame=now;lastTick=now;
      paint();
    }
    raf=requestAnimationFrame(frame);
  }
  function update() {
    if (disposed) return;
    const next=getState();
    const opts=settings();
    const canPlay=next==='live' && !document.hidden && !reduced.matches &&
      !body.classList.contains('reduceMotion') && opts.motion!=='still';
    const changed=next!==state || JSON.stringify(opts)!==lastOptions;
    state=next;
    lastOptions=JSON.stringify(opts);
    if (next==='off') {cancelAnimationFrame(raf);raf=0;lastTick=0;return;}
    if (!init()) return;
    if (changed || !raf) {resize();paint();}
    if (!canPlay) {cancelAnimationFrame(raf);raf=0;lastTick=0;return;}
    if (!raf) {lastTick=0;raf=requestAnimationFrame(frame);}
  }
  function destroy() {
    disposed=true;cancelAnimationFrame(raf);raf=0;
    observer?.disconnect();window.removeEventListener('resize',onResize);
    document.removeEventListener('visibilitychange',update);
    reduced.removeEventListener('change',update);
    if (gl) {gl.deleteBuffer(buffer);gl.deleteProgram(program);}
    canvas?.remove();canvas=null;gl=null;root.dataset.svRenderer='fallback';
  }
  function onResize(){resize();if(state!=='off')paint();}
  observer=new MutationObserver(update);
  observer.observe(body,{attributes:true,attributeFilter:[
    'class','style','data-st-backdrop','data-st-aurora-color',
    'data-st-aurora-motion','data-sv-aurora-state'
  ]});
  document.addEventListener('visibilitychange',update);
  reduced.addEventListener('change',update);
  window.addEventListener('resize',onResize,{passive:true});
  window.SwiflyAuroraShader=Object.freeze({refresh:update,destroy});
  update();
})();
