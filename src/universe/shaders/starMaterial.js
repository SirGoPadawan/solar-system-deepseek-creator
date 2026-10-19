// ─────────────────────────────────────────────────────────────────────────────
//  shaders/starMaterial.js — процедурная плазма звезды.
//
//  Никаких текстур: всё считается во фрагментном шейдере 3D-шумом Перлина.
//  u_time двигает домен шума, поэтому поверхность «кипит» и переливается.
//
//  Модуль самодостаточен: принимает параметры, возвращает Mesh/Material.
//  Не знает ничего о сцене, камере и существующем коде проекта.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:STARSHADER] ───

import * as THREE from 'three';
import { GLSL_NOISE, STAR_PALETTES } from '../noise.glsl.js';
import { hashSeed } from '../seed.js';

export { STAR_PALETTES };

// Цвет из палитры. LinearSRGBColorSpace — как в остальном проекте:
// числа трактуются как линейные, шейдер получает яркие «неистовые» цвета.
const colorFrom = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

const STAR_VERTEX = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vObjPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    // Равномерный масштаб сферы, поэтому mat3(modelMatrix) достаточно.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uNoiseScale;
  uniform float uGranulation;
  uniform float uSpeed;
  uniform float uBrightness;
  uniform float uRimStrength;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform vec3 uHot;
  uniform vec3 uRim;

  varying vec3 vObjPos;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  ${GLSL_NOISE}

  void main() {
    // Нормированная позиция на сфере — узор не растягивается у полюсов.
    vec3 p = normalize(vObjPos) * uNoiseScale;
    vec3 offset = vec3(uSeed * 13.37, uSeed * 7.77, uSeed * 3.91);

    // Медленный дрейф домена: два слоя плывут в разные стороны.
    vec3 driftA = vec3(uTime * uSpeed, -uTime * uSpeed * 0.63, uTime * uSpeed * 0.41);
    vec3 driftB = vec3(-uTime * uSpeed * 0.35, uTime * uSpeed * 0.52, -uTime * uSpeed * 0.77);

    // Крупная конвекция + мелкая грануляция + острые гребни.
    float big = pn_fbm(p * 1.55 + offset + driftA * 0.35, 4);
    float gran = pn_fbm(p * uGranulation + offset * 1.7 + driftB, 3);
    float cells = pn_ridged(p * uGranulation * 0.85 + offset - driftA * 0.8, 3);

    // 0.5 — середина палитры; гранулы и гребни добавляют «жара».
    float heat = 0.5 + 0.55 * big;
    heat += 0.22 * gran;
    heat += 0.16 * pow(1.0 - clamp(cells, 0.0, 1.0), 2.0);

    vec3 col = mix(uCool, uWarm, smoothstep(0.12, 0.62, heat));
    col = mix(col, uHot, smoothstep(0.60, 0.98, heat));

    // Тёмные «поры» между гранулами.
    float pores = smoothstep(0.62, 0.92, cells);
    col *= 1.0 - pores * 0.35;

    // Лимб-даркенинг + горячая кромка (видно на краю диска).
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    col *= 0.42 + 0.78 * pow(ndv, 0.55);
    col += uRim * uRimStrength * pow(1.0 - ndv, 3.2);

    gl_FragColor = vec4(col * uBrightness, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * ShaderMaterial фотосферы звезды.
 *
 * @param {object} [options]
 * @param {number|string} [options.seed=1]
 * @param {string} [options.type='sun'] — ключ STAR_PALETTES
 * @param {object} [options.palette] — переопределение палитры
 * @returns {THREE.ShaderMaterial}
 */
export const createStarMaterial = (options = {}) => {
  const { seed = 1, type = 'sun', palette = null } = options;
  const preset = palette || STAR_PALETTES[type] || STAR_PALETTES.sun;
  const seedFloat = (hashSeed(seed) % 4096) / 4096;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seedFloat },
      uNoiseScale: { value: preset.noiseScale },
      uGranulation: { value: preset.granulation },
      uSpeed: { value: preset.speed },
      uBrightness: { value: preset.brightness },
      uRimStrength: { value: preset.rimStrength },
      uCool: { value: colorFrom(preset.cool) },
      uWarm: { value: colorFrom(preset.warm) },
      uHot: { value: colorFrom(preset.hot) },
      uRim: { value: colorFrom(preset.rim) },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    toneMapped: true,
  });
};

/**
 * Анимировать материал. Вызывать в цикле: update(elapsedSeconds).
 * @param {THREE.ShaderMaterial} material
 * @param {number} elapsed
 */
export const updateStarMaterial = (material, elapsed) => {
  if (material && material.uniforms && material.uniforms.uTime) {
    material.uniforms.uTime.value = elapsed;
  }
};

/**
 * Коронa-оболочка: fresnel по BackSide, аддитивная, чуть пульсирует.
 * @param {number} radius
 * @param {object} [preset] — палитра звезды
 * @returns {THREE.Mesh}
 */
export const createStarCorona = (radius, preset = STAR_PALETTES.sun) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: colorFrom(preset.rim) },
      uIntensity: { value: 0.65 + preset.rimStrength * 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
        float pulse = 0.86 + 0.14 * sin(uTime * 1.7);
        gl_FragColor = vec4(uColor * (1.0 + rim), rim * uIntensity * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });

  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.16, 48, 32), material);
};

/**
 * Готовая звезда: сфера с плазмой + корона.
 *
 * @param {object} [options]
 * @param {number|string} [options.seed=1]
 * @param {string} [options.type='sun']
 * @param {number} [options.radius=2.6]
 * @param {number} [options.segments=64]
 * @returns {{
 *   root: THREE.Group, mesh: THREE.Mesh, material: THREE.ShaderMaterial,
 *   corona: THREE.Mesh, type: string, radius: number,
 *   update: (elapsed:number)=>void, dispose: ()=>void
 * }}
 */
export const createStar = (options = {}) => {
  const { seed = 1, type = 'sun', radius = 2.6, segments = 64 } = options;
  const preset = STAR_PALETTES[type] || STAR_PALETTES.sun;

  const material = createStarMaterial({ seed, type });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75)), material);

  const corona = createStarCorona(radius, preset);
  const root = new THREE.Group();
  root.name = `star:${type}`;
  root.add(mesh, corona);

  const update = (elapsed) => {
    material.uniforms.uTime.value = elapsed;
    corona.material.uniforms.uTime.value = elapsed;
    corona.rotation.y = elapsed * 0.02;
  };

  const dispose = () => {
    mesh.geometry.dispose();
    material.dispose();
    corona.geometry.dispose();
    corona.material.dispose();
    root.removeFromParent();
  };

  return { root, mesh, material, corona, type, radius, update, dispose };
};
