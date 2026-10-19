// ─────────────────────────────────────────────────────────────────────────────
//  shaders/planetMaterial.js — универсальный процедурный материал планеты.
//
//  Один шейдер на все планеты. Характер поверхности задаётся:
//    • uSeed        — случайное число, сдвигает домен шума;
//    • uKind        — 0: землеподобная (континенты/океаны), 1: газовый гигант (полосы);
//    • палитра      — цвета океана/суши/облаков или полос.
//
//  Планета освещается точечным источником uSunPos (позиция звезды в world space),
//  поэтому не зависит от светов сцены и работает в любой системе.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:PLANETSHADER] ───

import * as THREE from 'three';
import { GLSL_NOISE } from '../noise.glsl.js';
import { createRng, hashSeed } from '../seed.js';

const colorFromHsl = (h, s, l) =>
  new THREE.Color().setHSL(h, s, l, THREE.LinearSRGBColorSpace);

/**
 * Палитра планеты, выведенная из сида. Одинаковый сид → одинаковые цвета.
 *
 * @param {number|string} seed
 * @param {'terrestrial'|'gas'} [kind='terrestrial']
 * @returns {object}
 */
export const makePlanetPalette = (seed, kind = 'terrestrial') => {
  const rng = createRng(seed);

  if (kind === 'gas') {
    const hue = rng.next();
    const shift = rng.range(0.03, 0.14);
    return {
      kind: 'gas',
      bandA: colorFromHsl(hue, rng.range(0.42, 0.7), rng.range(0.42, 0.62)),
      bandB: colorFromHsl((hue + shift) % 1, rng.range(0.35, 0.65), rng.range(0.26, 0.44)),
      bandC: colorFromHsl((hue + shift * 0.5) % 1, rng.range(0.15, 0.4), rng.range(0.7, 0.9)),
      haze: colorFromHsl(hue, 0.55, 0.6),
      cloud: colorFromHsl(hue, 0.15, 0.92),
      ice: colorFromHsl(0.58, 0.15, 0.88),
      ocean: colorFromHsl(hue, 0.4, 0.3),
      land: colorFromHsl(hue, 0.4, 0.4),
      sand: colorFromHsl(hue, 0.4, 0.55),
      oceanLevel: 0,
      cloudAmount: 0,
      bandFreq: rng.range(9, 24),
      bandWarp: rng.range(0.35, 1.05),
      hazeStrength: rng.range(0.35, 0.7),
    };
  }

  // Вода — сине-бирюзовая, суша — от песочной до зелёно-бурой.
  const waterHue = rng.range(0.5, 0.67);
  const landHue = rng.range(0.06, 0.42);
  return {
    kind: 'terrestrial',
    ocean: colorFromHsl(waterHue, rng.range(0.55, 0.9), rng.range(0.16, 0.32)),
    land: colorFromHsl(landHue, rng.range(0.3, 0.65), rng.range(0.2, 0.38)),
    sand: colorFromHsl((landHue + 0.03) % 1, rng.range(0.35, 0.6), rng.range(0.42, 0.6)),
    ice: colorFromHsl(rng.range(0.54, 0.62), rng.range(0.05, 0.25), rng.range(0.82, 0.95)),
    cloud: colorFromHsl(0, 0, rng.range(0.88, 1)),
    haze: colorFromHsl(waterHue, rng.range(0.55, 0.85), rng.range(0.45, 0.62)),
    bandA: colorFromHsl(landHue, 0.4, 0.35),
    bandB: colorFromHsl(landHue, 0.35, 0.25),
    bandC: colorFromHsl(landHue, 0.3, 0.55),
    oceanLevel: rng.range(-0.12, 0.2),
    cloudAmount: rng.range(0.25, 0.85),
    bandFreq: 12,
    bandWarp: 0.6,
    hazeStrength: rng.range(0.55, 1.05),
  };
};

const PLANET_VERTEX = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vObjPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const PLANET_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uKind;       // 0 — земля, 1 — газовый гигант
  uniform float uBrightness;

  uniform vec3 uSunPos;

  uniform vec3 uOcean;
  uniform vec3 uLand;
  uniform vec3 uSand;
  uniform vec3 uIce;
  uniform vec3 uCloud;
  uniform vec3 uHaze;
  uniform float uHazeStrength;

  uniform vec3 uBandA;
  uniform vec3 uBandB;
  uniform vec3 uBandC;
  uniform float uBandFreq;
  uniform float uBandWarp;

  uniform float uOceanLevel;
  uniform float uCloudAmount;

  varying vec3 vObjPos;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  ${GLSL_NOISE}

  // Землеподобная поверхность: континенты, шельф, горы, полярные шапки, облака.
  vec3 terrestrial(vec3 sp, vec3 so, out float landMask) {
    // Доменное искажение — береговые линии получаются извилистыми.
    vec3 q = sp * 2.35 + so;
    q += pn_warp(q * 1.35 + 2.7, 0.42);

    float elev = pn_fbm(q * 2.05, 5) + 0.3 * pn_fbm(q * 5.1, 3);

    // Маска суши + «высота» для биомов.
    landMask = smoothstep(uOceanLevel - 0.03, uOceanLevel + 0.03, elev);
    float h = smoothstep(uOceanLevel, uOceanLevel + 0.5, elev);

    // Океан: глубина темнее, шельф светлее.
    float shallow = smoothstep(uOceanLevel - 0.4, uOceanLevel, elev);
    vec3 col = mix(uOcean * 0.42, uOcean, shallow);

    // Суша: пляж → равнины → горы/снег.
    vec3 ground = mix(uSand, uLand, smoothstep(0.02, 0.3, h));
    ground = mix(ground, uLand * 1.2, smoothstep(0.45, 0.85, h));
    ground = mix(ground, uIce, smoothstep(0.68, 1.0, h) * 0.7);
    col = mix(col, ground, landMask);

    // Полярные шапки с рваной кромкой.
    float lat = abs(sp.y);
    float cap = pn_fbm(sp * 6.5 + so, 2) * 0.07;
    float ice = smoothstep(0.72, 0.92, lat + cap);
    col = mix(col, uIce, ice * 0.95);

    // Два слоя облаков, медленно дрейфуют относительно поверхности.
    float c1 = pn_fbm(sp * 3.2 + so * 1.7 + vec3(uTime * 0.006, 0.0, uTime * 0.003), 4);
    float c2 = pn_fbm(sp * 6.8 - so + vec3(-uTime * 0.004, uTime * 0.002, 0.0), 3);
    float cloud = smoothstep(0.26, 0.62, c1 + 0.35 * c2) * uCloudAmount;
    col = mix(col, uCloud, cloud * 0.85);

    return col;
  }

  // Газовый гигант: полосы по широте + вихри + «большое пятно».
  vec3 gasGiant(vec3 sp, vec3 so) {
    // Искажаем широту турбулентностью — полосы становятся волнистыми.
    vec3 q = vec3(sp.x * 1.3, sp.y * 3.2, sp.z * 1.3) + so;
    float warp = pn_fbm(q * 1.35 + vec3(uTime * 0.002, 0.0, 0.0), 3);

    float band = sin(sp.y * uBandFreq + warp * uBandWarp + uSeed * 6.2831);
    float t = 0.5 + 0.5 * band;

    float fine = pn_fbm(vec3(sp.x * 5.0, sp.y * 16.0, sp.z * 5.0) + so * 0.7, 3);
    t += fine * 0.22;

    vec3 col = mix(uBandA, uBandB, smoothstep(0.1, 0.55, t));
    col = mix(col, uBandC, smoothstep(0.63, 0.97, t));

    // Турбулентные завихрения вдоль полос.
    float swirl = pn_ridged(vec3(sp.x * 3.2, sp.y * 9.5, sp.z * 3.2) + so, 3);
    col *= 0.86 + 0.26 * swirl;

    // «Большое пятно»: сид задаёт его положение.
    vec3 spotDir = normalize(vec3(
      cos(uSeed * 6.2831),
      0.28 + 0.18 * sin(uSeed * 3.1416),
      sin(uSeed * 6.2831)
    ));
    float spot = 1.0 - smoothstep(0.0, 0.24, distance(sp, spotDir));
    col = mix(col, uBandC * 1.15, spot * 0.55);

    return col;
  }

  void main() {
    vec3 sp = normalize(vObjPos);
    vec3 so = vec3(uSeed * 17.13, uSeed * 9.71, uSeed * 4.37);

    float landMask = 1.0;
    vec3 col;
    if (uKind < 0.5) {
      float land;
      col = terrestrial(sp, so, land);
      landMask = land;
    } else {
      col = gasGiant(sp, so);
    }

    // ── Освещение от звезды ──
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunPos - vWorldPos);

    float ndl = max(dot(N, L), 0.0);
    float terminator = smoothstep(0.0, 0.25, ndl); // мягкая граница света

    col *= 0.035 + 0.965 * ndl;

    // Блик на воде.
    if (uKind < 0.5) {
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 52.0) * (1.0 - landMask);
      col += vec3(0.85, 0.92, 1.0) * spec * 0.55 * terminator;
    }

    // Атмосферный fresnel: голубая кайма по краю, сильнее на свету.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
    col += uHaze * fres * uHazeStrength * (0.12 + 0.88 * ndl);

    gl_FragColor = vec4(col * uBrightness, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * ShaderMaterial планеты.
 *
 * @param {object} [options]
 * @param {number|string} [options.seed=1]
 * @param {'terrestrial'|'gas'} [options.kind='terrestrial']
 * @param {object} [options.palette] — результат makePlanetPalette или свой
 * @param {THREE.Vector3} [options.sunPos] — позиция звезды в world space
 * @param {number} [options.brightness=1]
 * @returns {THREE.ShaderMaterial}
 */
export const createPlanetMaterial = (options = {}) => {
  const { seed = 1, kind = 'terrestrial', palette = null, sunPos = null, brightness = 1 } = options;
  const p = palette || makePlanetPalette(seed, kind);
  const seedFloat = (hashSeed(seed) % 8192) / 8192;
  const isGas = p.kind === 'gas' || kind === 'gas';

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seedFloat },
      uKind: { value: isGas ? 1 : 0 },
      uBrightness: { value: brightness },

      uSunPos: { value: sunPos ? sunPos.clone() : new THREE.Vector3(0, 0, 0) },

      uOcean: { value: p.ocean.clone() },
      uLand: { value: p.land.clone() },
      uSand: { value: p.sand.clone() },
      uIce: { value: p.ice.clone() },
      uCloud: { value: p.cloud.clone() },
      uHaze: { value: p.haze.clone() },
      uHazeStrength: { value: p.hazeStrength },

      uBandA: { value: p.bandA.clone() },
      uBandB: { value: p.bandB.clone() },
      uBandC: { value: p.bandC.clone() },
      uBandFreq: { value: p.bandFreq },
      uBandWarp: { value: p.bandWarp },

      uOceanLevel: { value: p.oceanLevel },
      uCloudAmount: { value: p.cloudAmount },
    },
    vertexShader: PLANET_VERTEX,
    fragmentShader: PLANET_FRAGMENT,
    toneMapped: true,
  });
};

/**
 * Обновить время и позицию звезды у материала.
 * @param {THREE.ShaderMaterial} material
 * @param {number} elapsed
 * @param {THREE.Vector3} [sunPos]
 */
export const updatePlanetMaterial = (material, elapsed, sunPos) => {
  if (!material || !material.uniforms) return;
  material.uniforms.uTime.value = elapsed;
  if (sunPos && material.uniforms.uSunPos) {
    material.uniforms.uSunPos.value.copy(sunPos);
  }
};

/**
 * Готовая планета: сфера + материал.
 *
 * @param {object} [options]
 * @param {number} [options.radius=1]
 * @param {number|string} [options.seed=1]
 * @param {'terrestrial'|'gas'} [options.kind='terrestrial']
 * @param {THREE.Vector3} [options.sunPos]
 * @param {number} [options.segments=64]
 * @returns {{
 *   mesh: THREE.Mesh, material: THREE.ShaderMaterial,
 *   update: (elapsed:number, sunPos?:THREE.Vector3)=>void,
 *   setSun: (sunPos:THREE.Vector3)=>void,
 *   dispose: ()=>void
 * }}
 */
export const createPlanetMesh = (options = {}) => {
  const { radius = 1, seed = 1, kind = 'terrestrial', sunPos = null, segments = 64 } = options;
  const material = createPlanetMaterial({ seed, kind, sunPos });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75)),
    material
  );

  const update = (elapsed, sun) => updatePlanetMaterial(material, elapsed, sun);
  const setSun = (sun) => {
    if (sun) material.uniforms.uSunPos.value.copy(sun);
  };

  const dispose = () => {
    mesh.geometry.dispose();
    material.dispose();
  };

  return { mesh, material, update, setSun, dispose };
};
