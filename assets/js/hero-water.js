/* =============================================================
   Secrets of Cint — hero backdrop
   A single candle flame floating on still, dark water: slow concentric
   ripples, silver ring highlights and a shimmering reflection.
   Drawn live in WebGL (no video file, no license, crisp at any size).
   Monochrome by default; set data-warm="1" on the canvas for amber.
   ============================================================= */
(function () {
  "use strict";
  var canvas = document.getElementById("heroCanvas");
  if (!canvas) return;
  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) { canvas.classList.add("no-gl"); return; }

  var VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes; uniform float uTime; uniform float uWarm; uniform vec2 uCandle; uniform float uScale;",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(float x){ float i = floor(x); float f = fract(x); return mix(hash(vec2(i, 1.0)), hash(vec2(i + 1.0, 1.0)), f*f*(3.0-2.0*f)); }",
    "void main(){",
    "  vec2 frag = gl_FragCoord.xy;",
    "  float H = uRes.y;",
    "  vec2 c = vec2(uRes.x * uCandle.x, H * uCandle.y);",       // candle base on screen (px)
    "  float s = H * uScale;",                                    // size unit (px)
    "  float t = uTime;",
    "  float horizon = c.y + s * 1.25;",
    "  vec3 col = vec3(0.0);",
    // --- far darkness: a faint haze that meets the water seamlessly at the horizon
    "  float above = max(frag.y - horizon, 0.0) / H;",
    "  col += vec3(0.024) * exp(-above * 14.0);",
    "  vec2 q = (frag - c) / s;",                                      // candle-local units
    "  float cupW = 0.62, cupH = 0.26;",
    "  vec2 fl = vec2(0.0, cupH + 0.36);",                             // flame centre
    // --- water plane in perspective
    "  float slope = 0.0;",
    "  if (frag.y < horizon) {",
    "    float dy = (horizon - frag.y) / s;",
    "    float depth = 1.0 / max(dy, 0.02);",
    "    vec2 w = vec2((frag.x - c.x) / s * depth, depth - 1.0 / max((horizon - c.y) / s, 0.02));",
    "    float r = length(w * vec2(1.0, 2.2));",
    "    float phase = r * 9.0 - t * 1.25;",
    "    float amp = exp(-r * 0.18) * smoothstep(0.35, 0.9, r);",
    "    slope = cos(phase) * amp;",
    "    float spec = pow(max(slope, 0.0), 3.0) + pow(max(-slope, 0.0), 12.0) * 0.12;",
    "    float nearFade = smoothstep(0.05, 0.8, dy);",
    "    float pool = exp(-length(q * vec2(0.42, 1.3)) * 0.7);",          // light pool around the candle
    "    float centre = exp(-abs(q.x) / 9.0);",
    "    col = vec3(0.010 + 0.014 * exp(-dy * 3.0));",                    // equals the haze at the horizon: no seam
    "    col += vec3(1.0) * spec * nearFade * (0.2 + 0.8 * centre) * (0.45 + 0.55 * pool);",
    "    col += vec3(0.10) * pool * nearFade;",
    // reflection of the flame, only in front of the candle, broken by the ripples
    "    float below = (c.y - frag.y) / s;",
    "    if (below > 0.0) {",
    "      float rx = q.x + slope * 0.28;",
    "      float column = exp(-rx * rx * 14.0);",
    "      float bands = 0.5 + 0.5 * sin(below * 11.0 + slope * 7.0 - t * 0.9);",
    "      col += vec3(1.0) * column * (0.35 + 0.65 * bands) * exp(-below * 0.45) * 0.6 * smoothstep(0.0, 0.25, below);",
    "    }",
    "  }",
    // --- the tealight: lit wax top, softly shaded cup
    "  float e = length(vec2(q.x / cupW, (q.y - cupH) / 0.14));",
    "  float body = smoothstep(cupW + 0.01, cupW - 0.01, abs(q.x)) * smoothstep(-0.01, 0.01, q.y) * step(q.y, cupH);",
    "  float bottom = 1.0 - smoothstep(0.98, 1.02, length(vec2(q.x / cupW, q.y / 0.14)));",
    "  body = max(body, bottom * step(q.y, 0.0));",
    "  float shade = 0.35 + 0.5 * pow(1.0 - abs(q.x / cupW), 0.6) + 0.15 * (q.y / cupH);",
    "  col = mix(col, vec3(0.62) * shade, body * 0.95);",
    "  float top = 1.0 - smoothstep(0.97, 1.03, e);",
    "  float waxGlow = 0.72 + 0.28 * exp(-e * 2.2);",
    "  col = mix(col, vec3(0.96) * waxGlow, top);",
    "  col += vec3(0.18) * (1.0 - smoothstep(0.0, 0.05, abs(e - 1.0)));",       // thin metal rim highlight
    // --- the flame: soft teardrop, hot core, gentle flicker
    "  float flick = (noise(t * 2.3) - 0.5) * 0.09 + (noise(t * 6.1 + 4.0) - 0.5) * 0.035;",
    "  float stretch = 1.0 + (noise(t * 1.7 + 9.0) - 0.5) * 0.12;",
    "  vec2 f = q - fl;",
    "  float h = 0.8 * stretch;",
    "  float u = clamp((f.y + h * 0.55) / h, 0.0, 1.0);",                  // 0 = base, 1 = tip
    "  f.x -= flick * u * u;",
    "  float halfW = 0.165 * pow(1.0 - u, 0.75) * smoothstep(0.0, 0.32, u + 0.02) + 0.004;",
    "  float inY = smoothstep(-0.05, 0.02, (f.y + h * 0.55) / h) * (1.0 - smoothstep(0.96, 1.02, (f.y + h * 0.55) / h));",
    "  float fd = abs(f.x) / halfW;",
    "  float flame = (1.0 - smoothstep(0.55, 1.0, fd)) * inY;",
    "  float core = (1.0 - smoothstep(0.0, 0.55, fd)) * smoothstep(0.05, 0.22, u) * (1.0 - smoothstep(0.45, 0.75, u)) * inY;",
    "  float baseDim = 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.18, u));",     // the dim blue zone at the root, in grey
    "  float wick = step(abs(q.x), 0.014) * step(cupH - 0.02, q.y) * step(q.y, cupH + 0.1);",
    "  float halo = exp(-length((q - fl - vec2(0.0, 0.15)) * vec2(1.0, 0.7)) * 2.2) * (0.9 + 0.1 * noise(t * 4.0));",
    "  vec3 flameCol = mix(vec3(0.97), vec3(1.0, 0.7, 0.32), uWarm);",
    "  vec3 coreCol  = mix(vec3(1.0), vec3(1.0, 0.96, 0.85), uWarm);",
    "  col += flameCol * halo * 0.42;",
    "  col = mix(col, vec3(0.06), wick);",
    "  col = mix(col, flameCol * baseDim, flame * 0.92);",
    "  col = mix(col, coreCol, core);",
    // --- vignette + fine grain
    "  vec2 uv = frag / uRes;",
    "  col *= 1.0 - 0.55 * pow(length((uv - vec2(0.5, 0.45)) * vec2(1.1, 1.3)), 2.2);",
    "  col += (hash(frag + fract(t) * 91.0) - 0.5) * 0.025;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function sh(type, src) {
    var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(o)); }
    return o;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { canvas.classList.add("no-gl"); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime"),
      uWarm = gl.getUniformLocation(prog, "uWarm"), uCandle = gl.getUniformLocation(prog, "uCandle"),
      uScale = gl.getUniformLocation(prog, "uScale");
  gl.uniform1f(uWarm, canvas.getAttribute("data-warm") === "1" ? 1 : 0);

  function layout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    var narrow = w < 700;
    gl.uniform2f(uCandle, 0.5, narrow ? 0.17 : 0.15);      // candle base, as a fraction of width/height (from bottom)
    gl.uniform1f(uScale, narrow ? 0.11 : 0.125);
  }

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var visible = true, raf = 0, start = performance.now();
  function frame(now) {
    raf = 0;
    gl.uniform1f(uTime, still ? 2.0 : (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!still && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  layout(); kick();
  canvas.classList.add("ready");
  window.addEventListener("resize", function () { layout(); kick(); });
  document.addEventListener("visibilitychange", kick);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; kick(); }).observe(canvas);
  }
})();
