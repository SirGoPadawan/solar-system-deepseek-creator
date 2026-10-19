// ─────────────────────────────────────────────────────────────────────────────
//  fallbackBlackHole.js — запасная чёрная дыра для generateSystem().
//
//  Если в проект не передали свой blackHoleFactory (например, готовую
//  createBlackHole() из src/blackhole.js), система соберёт эту:
//    • чёрная сфера (горизонт событий);
//    • билборд-кольцо фотонной сферы (шейдер, без текстур);
//    • диск из частиц с дифференциальным вращением (ω ∝ r^-1.5);
//    • два полярных джета.
//
//  Всё на чистом three — никаких зависимостей от существующего кода.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:BHFALLBACK] ───

import * as THREE from 'three';
import { createRng } from './seed.js';

const TWO_PI = Math.PI * 2;

const RING_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Билборд: берём позицию объекта в view space и раздвигаем углы квада.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy;
    gl_Position = projectionMatrix * mv;
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uRingColor;
  uniform vec3 uGlowColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    // Квад 1x1 → радиальные координаты [-1, 1].
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);

    // Тонкое яркое кольцо + мягкий ореол вокруг.
    float ring = 1.0 - smoothstep(0.0, 0.045, abs(d - 0.62));
    float glow = (1.0 - smoothstep(0.0, 0.22, abs(d - 0.62))) * 0.32;
    float pulse = 0.86 + 0.14 * sin(uTime * 1.6);

    vec3 col = mix(uGlowColor, uRingColor, ring);
    float alpha = (ring * 0.95 + glow) * pulse;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col * (1.0 + ring * 1.4) * uIntensity * pulse, alpha);
  }
`;

const DISK_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSpin;

  attribute float aRadius;
  attribute float aAngle;
  attribute float aY;
  attribute float aSpeed;
  attribute float aSize;
  attribute vec3 aColor;

  varying vec3 vColor;

  void main() {
    // Дифференциальное вращение: внутренние частицы обгоняют внешние.
    float angle = aAngle + uTime * uSpin * aSpeed;
    vec3 pos = vec3(cos(angle) * aRadius, aY, sin(angle) * aRadius);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vColor = aColor;
    // Без sizeAttenuation: диск остаётся читаемым и в масштабе системы.
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float alpha = 1.0 - smoothstep(0.1, 0.5, dist);
    if (alpha < 0.02) discard;
    float core = 1.0 - smoothstep(0.0, 0.25, dist);
    gl_FragColor = vec4(vColor * (0.8 + 0.6 * core), alpha * 0.8);
  }
`;

/**
 * @param {object} [options]
 * @param {number} [options.radius=2.2] — радиус горизонта событий
 * @param {number} [options.diskInner=1.8] — внутренний радиус диска (в радиусах)
 * @param {number} [options.diskOuter=6.0]
 * @param {number} [options.particles=1400]
 * @param {number} [options.jetLength=9]
 * @param {number} [options.spin=1.4] — скорость вращения диска
 * @param {string|number} [options.seed='bh']
 * @param {number} [options.pixelRatio=1]
 */
export const createFallbackBlackHole = (options = {}) => {
  const {
    radius = 2.2,
    diskInner = 1.8,
    diskOuter = 6.0,
    particles = 1400,
    jetLength = 10,
    jetRadius = 0.7,
    spin = 1.4,
    seed = 'bh',
    pixelRatio = 1,
  } = options;

  const rng = createRng(seed);
  const root = new THREE.Group();
  root.name = 'black-hole';

  // ── Горизонт событий ──
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
  );
  root.add(horizon);

  // ── Фотонная сфера: билборд с кольцом ──
  const photonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRingColor: { value: new THREE.Color(0xfff0d0) },
      uGlowColor: { value: new THREE.Color(0xffa040) },
      uIntensity: { value: 2.2 },
    },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const photonRing = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 4.4, radius * 4.4),
    photonMaterial
  );
  photonRing.renderOrder = 4;
  root.add(photonRing);

  // ── Аккреционный диск: частицы в кольце с дифференциальным вращением ──
  const count = Math.max(200, particles);
  const pos = new Float32Array(count * 3); // не используется шейдером, но нужно для bounds
  const aRadius = new Float32Array(count);
  const aAngle = new Float32Array(count);
  const aY = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const aSize = new Float32Array(count);
  const aColor = new Float32Array(count * 3);

  const inner = radius * diskInner;
  const outer = radius * diskOuter;
  const cold = new THREE.Color(0x501208);
  const hot = new THREE.Color(0xfff2cc);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const t = Math.pow(rng.next(), 0.65); // гуще к центру
    const r = inner + (outer - inner) * t;
    aRadius[i] = r;
    aAngle[i] = rng.next() * TWO_PI;
    aY[i] = (rng.next() - 0.5) * radius * 0.12 * (0.4 + t);
    // ω ∝ r^-1.5
    aSpeed[i] = 1.6 * Math.pow(inner / r, 1.5);
    aSize[i] = 1.4 + rng.next() * 2.6;

    tmp.copy(cold).lerp(hot, Math.pow(1 - t, 2.2));
    aColor[i * 3] = tmp.r;
    aColor[i * 3 + 1] = tmp.g;
    aColor[i * 3 + 2] = tmp.b;
  }

  const diskGeometry = new THREE.BufferGeometry();
  diskGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  diskGeometry.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
  diskGeometry.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
  diskGeometry.setAttribute('aY', new THREE.BufferAttribute(aY, 1));
  diskGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  diskGeometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  diskGeometry.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));

  const diskMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSpin: { value: spin },
    },
    vertexShader: DISK_VERTEX,
    fragmentShader: DISK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const disk = new THREE.Points(diskGeometry, diskMaterial);
  disk.frustumCulled = false;
  disk.renderOrder = 3;
  root.add(disk);

  // ── Полярные джеты ──
  const jetMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fc8ff,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const jetGeometry = new THREE.ConeGeometry(jetRadius, jetLength, 24, 1, true);
  const jetUp = new THREE.Mesh(jetGeometry, jetMaterial);
  jetUp.position.y = radius + jetLength * 0.5;
  jetUp.rotation.x = Math.PI; // вершина вниз, к дыре

  const jetDown = new THREE.Mesh(jetGeometry, jetMaterial);
  jetDown.position.y = -(radius + jetLength * 0.5);

  root.add(jetUp, jetDown);

  // ── Анимация ──
  let time = 0;

  const update = (delta, motionScale = 1) => {
    time += delta * motionScale;
    diskMaterial.uniforms.uTime.value = time;
    photonMaterial.uniforms.uTime.value = time;
  };

  const setPixelRatio = (ratio) => {
    diskMaterial.uniforms.uPixelRatio.value = ratio;
  };

  const dispose = () => {
    horizon.geometry.dispose();
    horizon.material.dispose();
    photonRing.geometry.dispose();
    photonMaterial.dispose();
    diskGeometry.dispose();
    diskMaterial.dispose();
    jetGeometry.dispose();
    jetMaterial.dispose();
    root.clear();
    root.removeFromParent();
  };

  return {
    root,
    horizon,
    photonRing,
    disk,
    radius,
    update,
    setPixelRatio,
    dispose,
  };
};
