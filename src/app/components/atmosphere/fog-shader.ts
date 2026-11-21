/**
 * Shaders GLSL ES 3.00 (WebGL2) de la niebla de fondo.
 *
 * Vértices: un único triángulo que cubre la pantalla, generado a partir de gl_VertexID (sin buffers).
 *
 * Fragmentos:
 * - Ruido de valor 2D con hash sin senos, y fbm de 5 octavas con una rotación entre octavas (evita que las capas se
 *   alineen con los ejes y se noten las costuras).
 * - Deformación de dominio en dos niveles (q → r → n): el campo de ruido se desplaza con otro campo de ruido, lo que
 *   da volutas que se enroscan. El tiempo entra con velocidades y direcciones distintas en cada nivel, así que la
 *   niebla se mueve siempre y no se repite (el ruido no es periódico y el tiempo no se reinicia).
 * - Forma en reposo: niebla densa en la parte baja, jirones suaves en los laterales y bruma tenue a media altura.
 *   `textSafe` la anula en la franja superior, donde hay texto directamente sobre el cielo (resumen, recuento,
 *   «Buscando…»), para no reducir su contraste.
 * - Oleada (uSurge 0→1): un frente que sube desde abajo con el borde ondulado por el propio ruido; en el pico cubre
 *   toda la pantalla con densidad 1 (opaca) para ocultar el cambio de tema.
 * - Color: crema cálido de día y azul grisáceo de noche con un brillo ámbar junto a la esquina inferior derecha
 *   (como --lt-glow), mezclados por uNight. Salida con alfa premultiplicado.
 */

export const FOG_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FOG_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSurge;
uniform float uNight;

out vec4 fragColor;

float hash(vec2 p) {
  vec3 h = fract(vec3(p.x, p.y, p.x) * vec3(0.1127, 0.1279, 0.0993));
  h += dot(h, h.yzx + 31.17);
  return fract((h.x + h.y) * h.z);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

const mat2 OCTAVE_TURN = mat2(0.866, 0.5, -0.5, 0.866);

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amplitude * valueNoise(p);
    p = OCTAVE_TURN * p * 2.03 + vec2(3.1, 1.7);
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.4;
  float t = uTime;

  vec2 q = vec2(fbm(p + vec2(0.0, 0.031 * t)), fbm(p + vec2(4.7, 1.9) - vec2(0.027 * t, 0.0)));
  vec2 r = vec2(
    fbm(p + 3.1 * q + vec2(1.3, 8.6) + vec2(0.043 * t, 0.011 * t)),
    fbm(p + 3.1 * q + vec2(7.9, 2.4) - vec2(0.019 * t, 0.037 * t))
  );
  float n = fbm(p + 2.6 * r + vec2(0.052 * t, 0.0));

  float textSafe = 1.0 - smoothstep(0.42, 0.66, uv.y);
  float low = 1.0 - smoothstep(0.0, 0.42, uv.y);
  float edge = 1.0 - smoothstep(0.0, 0.22, min(uv.x, 1.0 - uv.x));
  float haze = exp(-pow((uv.y - 0.44) / 0.11, 2.0));
  float shape = (low * 0.85 + edge * 0.45 + haze * 0.18) * textSafe;
  float density = 0.82 * shape * smoothstep(0.3, 0.8, n);

  float front = uSurge * 1.45 - 0.2;
  float wave = 1.0 - smoothstep(front - 0.3, front, uv.y + (n - 0.5) * 0.45);
  float body = mix(0.78, 1.0, smoothstep(0.35, 0.75, n));
  float surge = max(wave * body, smoothstep(0.82, 1.0, uSurge)) * smoothstep(0.0, 0.15, uSurge);
  density = clamp(max(density, surge), 0.0, 1.0);

  vec3 dayColor = mix(vec3(0.925, 0.898, 0.855), vec3(0.992, 0.965, 0.914), n);
  vec3 nightColor = mix(vec3(0.165, 0.212, 0.302), vec3(0.302, 0.357, 0.463), n);
  vec2 toCorner = (uv - vec2(1.0, 0.0)) * vec2(aspect * 0.9, 1.6);
  nightColor += vec3(1.0, 0.63, 0.32) * 0.32 * exp(-2.6 * length(toCorner));
  vec3 color = mix(dayColor, nightColor, uNight);

  fragColor = vec4(color * density, density);
}
`;
