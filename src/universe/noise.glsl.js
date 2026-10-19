// ─────────────────────────────────────────────────────────────────────────────
//  noise.glsl.js — общая GLSL-библиотека шума.
//
//  Вставляется в фрагментные шейдеры звёзд и планет как строка:
//      fragmentShader: `${GLSL_NOISE}\n ...`
//
//  Все функции с префиксом pn_ (perlin noise), чтобы не пересекаться
//  с чанками three.js и пользовательским кодом.
//
//  Реализация — классический 3D gradient noise (Perlin) на hash-функции
//  без текстур. Работает в WebGL1/WebGL2 (GLSL ES 1.0), циклы с const-границей.
// ─────────────────────────────────────────────────────────────────────────────

export const GLSL_NOISE = /* glsl */ `
// Псевдослучайный градиент в кубе [-1, 1]^3 по целочисленной решётке.
vec3 pn_hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 3D Perlin noise, примерно [-0.75, 0.75].
float pn_perlin(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f); // сглаживание Перлина

  float n000 = dot(pn_hash33(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
  float n100 = dot(pn_hash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(pn_hash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(pn_hash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(pn_hash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(pn_hash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(pn_hash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(pn_hash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// Фрактальный шум (октавы). octaves: 1..6.
float pn_fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += pn_perlin(p) * amp;
    norm += amp;
    p = p * 2.02 + vec3(17.3, 9.1, 4.7);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-5);
}

// «Хребтовый» шум: острые гребни, хорош для гранул плазмы и гор.
float pn_ridged(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    sum += (1.0 - abs(pn_perlin(p))) * amp;
    norm += amp;
    p = p * 2.03 + vec3(11.0, 5.0, 23.0);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-5);
}

// Доменное искажение: возвращает смещение, которым можно «мять» координаты.
vec3 pn_warp(vec3 p, float strength) {
  return vec3(
    pn_perlin(p + vec3(13.1, 7.7, 1.9)),
    pn_perlin(p + vec3(3.4, 19.2, 8.6)),
    pn_perlin(p + vec3(9.8, 2.1, 15.3))
  ) * strength;
}

// Хеш для мерцания/случайности по индексу.
float pn_hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}
`;

// Палитры звёзд: cool — «тёмные» прожилки, warm — основной тон,
// hot — перегретые пятна, rim — свечение лимба.
export const STAR_PALETTES = {
  sun: {
    cool: 0x7a1e02,
    warm: 0xff9a1f,
    hot: 0xfff2cc,
    rim: 0xff6a12,
    noiseScale: 2.6,
    granulation: 9.0,
    speed: 0.55,
    brightness: 1.35,
    rimStrength: 0.85,
  },
  orangeDwarf: {
    cool: 0x4f0f02,
    warm: 0xff6a1a,
    hot: 0xffd9a0,
    rim: 0xff4a0a,
    noiseScale: 2.2,
    granulation: 8.0,
    speed: 0.45,
    brightness: 1.2,
    rimStrength: 0.7,
  },
  redDwarf: {
    cool: 0x2e0501,
    warm: 0xc92c0c,
    hot: 0xff9a62,
    rim: 0xff3a10,
    noiseScale: 3.1,
    granulation: 11.0,
    speed: 0.8,
    brightness: 1.05,
    rimStrength: 0.6,
  },
  blueGiant: {
    cool: 0x06153f,
    warm: 0x2f6cff,
    hot: 0xc9e2ff,
    rim: 0x5aa8ff,
    noiseScale: 3.4,
    granulation: 7.0,
    speed: 0.35,
    brightness: 1.55,
    rimStrength: 1.1,
  },
  whiteDwarf: {
    cool: 0x2b3a66,
    warm: 0xa8c8ff,
    hot: 0xffffff,
    rim: 0xcfe4ff,
    noiseScale: 3.8,
    granulation: 10.0,
    speed: 0.9,
    brightness: 1.5,
    rimStrength: 1.2,
  },
};
