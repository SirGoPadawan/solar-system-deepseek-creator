// ─────────────────────────────────────────────────────────────────────────────
//  galaxyMap.js — глобальная карта Галактики (режим 1).
//
//  • Тысячи фоновых звёзд спиральными рукавами — один THREE.Points.
//  • Ключевые яркие звёзды — второй THREE.Points с крупными точками.
//  • Созвездия — THREE.LineSegments поверх ключевых звёзд.
//  • Пикинг по экранным координатам (клик/ховер) без рейкаста по точкам.
//
//  Модуль ничего не добавляет в сцену сам: вернули group — сами решаете,
//  куда её повесить. Никаких импортов из существующего кода проекта.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:GALAXYMAP] ───

import * as THREE from 'three';
import { createRng } from './seed.js';
import { buildConstellations } from './constellations.js';

const TWO_PI = Math.PI * 2;

const STAR_NAMES = [
  'Сириус', 'Канопус', 'Арктур', 'Вега', 'Капелла', 'Ригель', 'Процион',
  'Бетельгейзе', 'Альтаир', 'Альдебаран', 'Антарес', 'Спика', 'Поллукс',
  'Фомальгаут', 'Денеб', 'Регул', 'Полярная', 'Альфа Центавра', 'Мицар',
  'Алькор', 'Гакрукс', 'Мимоза', 'Ахернар', 'Беллатрикс', 'Эль-Нат',
  'Минтака', 'Альнилам', 'Саиф', 'Шаула', 'Джубба',
];

const KEY_COLORS = [0xffffff, 0xeaf2ff, 0xcfe0ff, 0xbcd4ff, 0xffe9c4, 0xffd2a1, 0xffb38a];

const linear = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

// ── Общий шейдер точек: размер в пикселях, мягкий круглый край, мерцание ──
const POINTS_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;

  attribute float aSize;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Размер задан в CSS-пикселях: карта читается с любого расстояния.
    float phase = position.x * 0.071 + position.z * 0.043 + position.y * 0.11;
    float tw = 1.0 + uTwinkle * 0.22 * sin(uTime * 2.1 + phase);
    vTwinkle = clamp(tw, 0.45, 1.45);

    gl_PointSize = aSize * uPixelRatio * vTwinkle;
  }
`;

const POINTS_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    // Круглая точка с мягким краем — без текстур и без «квадратов».
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float alpha = 1.0 - smoothstep(0.08, 0.5, dist);
    if (alpha < 0.01) discard;

    // Ядро ярче ореола.
    float core = 1.0 - smoothstep(0.0, 0.28, dist);
    vec3 col = vColor * (0.75 + 0.65 * core);
    gl_FragColor = vec4(col * vTwinkle * uOpacity, alpha);
  }
`;

export const createGalaxyMap = (options = {}) => {
  const {
    seed = 'milky-way',
    radius = 620,
    thickness = 26,
    starCount = 30000,
    branches = 4,
    keyStarCount = 18,
    keyStars = null,
    constellations = null,
    constellationOpacity = 0.22,
    constellationColor = 0x8fc4ff,
    backgroundOpacity = 1,
    rotateSpeed = 0.006,
    pixelRatio = 1,
  } = options;

  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = 'galaxy-map';

  // ────────────────────────────── фоновые звёзды ──────────────────────────────
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);

  const inner = linear(0xffe6bd);
  const outer = linear(0x9fc2ff);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < starCount; i++) {
    let x;
    let y;
    let z;
    let brightness;

    if (rng.chance(0.14)) {
      // Центральное утолщение (bulge) — плотное тёплое ядро.
      const br = Math.pow(rng.next(), 2.2) * radius * 0.22;
      const theta = rng.next() * TWO_PI;
      const phi = Math.acos(2 * rng.next() - 1);
      x = br * Math.sin(phi) * Math.cos(theta);
      y = br * Math.cos(phi) * 0.7;
      z = br * Math.sin(phi) * Math.sin(theta);
      // Ядро не должно выжигать экран аддитивным блумом.
      brightness = rng.range(0.3, 0.65);
    } else {
      // Логарифмическая спираль: рукава с рассеянием.
      const r = Math.pow(rng.next(), 0.62) * radius;
      const arm = i % branches;
      const angle =
        arm * (TWO_PI / branches) +
        r * 0.0042 +
        rng.gauss() * (0.1 + 0.16 * (r / radius));

      x = Math.cos(angle) * r + rng.gauss() * thickness * 1.2;
      z = Math.sin(angle) * r + rng.gauss() * thickness * 1.2;
      y = rng.gauss() * thickness * (0.22 + 0.78 * Math.max(0, 1 - r / radius));
      brightness = rng.range(0.35, 1);
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const t = Math.min(1, Math.sqrt(x * x + z * z) / radius);
    tmpColor.copy(inner).lerp(outer, t);
    // Небольшой разброс оттенка, чтобы диск не был «плоским».
    tmpColor.offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.08, 0.08), 0);
    tmpColor.multiplyScalar(brightness);

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
    sizes[i] = rng.range(0.8, 2.4) * (1 + (1 - t) * 0.55);
  }

  const backgroundGeometry = new THREE.BufferGeometry();
  backgroundGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  backgroundGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  backgroundGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  backgroundGeometry.computeBoundingSphere();

  const pointsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uTwinkle: { value: 1 },
      uOpacity: { value: backgroundOpacity },
    },
    vertexShader: POINTS_VERTEX,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    opacity: backgroundOpacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const background = new THREE.Points(backgroundGeometry, pointsMaterial);
  background.name = 'galaxy-background';
  background.frustumCulled = false;
  background.renderOrder = -2;
  group.add(background);

  // ────────────────────────────── ключевые звёзды ──────────────────────────────
  const keyList = [];

  if (Array.isArray(keyStars) && keyStars.length) {
    // Пользовательские звёзды: [{ id, name, seed, position, color, size }]
    keyStars.forEach((s, i) => {
      let p;
      if (Array.isArray(s.position)) {
        p = new THREE.Vector3(s.position[0], s.position[1], s.position[2]);
      } else if (s.position && s.position.isVector3) {
        p = s.position.clone();
      } else {
        const src = s.position || {};
        p = new THREE.Vector3(src.x || 0, src.y || 0, src.z || 0);
      }

      keyList.push({
        id: s.id !== undefined ? s.id : `star-${i}`,
        name: s.name || STAR_NAMES[i % STAR_NAMES.length],
        seed: s.seed !== undefined ? s.seed : `sys:${seed}:${i}`,
        position: p,
        color: s.color !== undefined ? s.color : KEY_COLORS[i % KEY_COLORS.length],
        size: s.size !== undefined ? s.size : rng.range(9, 15),
        isCustom: true,
      });
    });
  } else {
    const count = Math.max(4, keyStarCount);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      // Золотой угол + кольцо: равномерно по диску, но не по кольцу.
      const angle = i * goldenAngle + rng.range(-0.1, 0.1);
      const r = radius * (0.26 + 0.64 * Math.sqrt((i + 0.5) / count));
      keyList.push({
        id: `star-${i}`,
        name: STAR_NAMES[i % STAR_NAMES.length],
        seed: `sys:${seed}:${i}`,
        position: new THREE.Vector3(
          Math.cos(angle) * r,
          rng.gauss() * thickness * 0.45,
          Math.sin(angle) * r
        ),
        color: KEY_COLORS[Math.floor(rng.next() * KEY_COLORS.length)],
        size: rng.range(9, 16),
        isCustom: false,
      });
    }
  }

  const keyPositions = new Float32Array(keyList.length * 3);
  const keyColors = new Float32Array(keyList.length * 3);
  const keySizes = new Float32Array(keyList.length);

  keyList.forEach((s, i) => {
    keyPositions[i * 3] = s.position.x;
    keyPositions[i * 3 + 1] = s.position.y;
    keyPositions[i * 3 + 2] = s.position.z;

    const c = linear(s.color);
    keyColors[i * 3] = c.r;
    keyColors[i * 3 + 1] = c.g;
    keyColors[i * 3 + 2] = c.b;
    keySizes[i] = s.size;
  });

  const keyGeometry = new THREE.BufferGeometry();
  keyGeometry.setAttribute('position', new THREE.BufferAttribute(keyPositions, 3));
  keyGeometry.setAttribute('aColor', new THREE.BufferAttribute(keyColors, 3));
  keyGeometry.setAttribute('aSize', new THREE.BufferAttribute(keySizes, 1));
  keyGeometry.computeBoundingSphere();

  const keyPoints = new THREE.Points(keyGeometry, pointsMaterial);
  keyPoints.name = 'galaxy-key-stars';
  keyPoints.frustumCulled = false;
  keyPoints.renderOrder = -1;
  group.add(keyPoints);

  // ────────────────────────────── созвездия ──────────────────────────────
  const { pairs, groups: constellationGroups } = buildConstellations(keyList, {
    constellations,
  });

  const linePositions = new Float32Array(pairs.length * 6);
  let lp = 0;
  for (const [a, b] of pairs) {
    const pa = keyList[a].position;
    const pb = keyList[b].position;
    linePositions[lp++] = pa.x;
    linePositions[lp++] = pa.y;
    linePositions[lp++] = pa.z;
    linePositions[lp++] = pb.x;
    linePositions[lp++] = pb.y;
    linePositions[lp++] = pb.z;
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.computeBoundingSphere();

  const lineMaterial = new THREE.LineBasicMaterial({
    color: linear(constellationColor),
    transparent: true,
    opacity: constellationOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.name = 'galaxy-constellations';
  lines.renderOrder = -1.5;
  group.add(lines);

  // ────────────────────────────── пикинг ──────────────────────────────
  const _v = new THREE.Vector3();
  const _toStar = new THREE.Vector3();
  const _camDir = new THREE.Vector3();

  /**
   * Найти ключевую звезду под курсором.
   *
   * @param {number} ndcX — [-1, 1]
   * @param {number} ndcY — [-1, 1]
   * @param {THREE.Camera} camera
   * @param {{width:number, height:number}} viewport — CSS-размер canvas
   * @param {number} [maxPx=30] — радиус попадания в пикселях
   * @returns {object|null} звезда из keyList
   */
  const pickAt = (ndcX, ndcY, camera, viewport, maxPx = 30) => {
    if (!camera || !viewport) return null;

    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(_camDir);

    const px = ndcX * 0.5 * viewport.width;
    const py = ndcY * 0.5 * viewport.height;

    let best = null;
    let bestDist = maxPx;

    for (const star of keyList) {
      _v.copy(star.position).applyMatrix4(group.matrixWorld);
      _toStar.copy(_v).sub(camera.position);
      if (_toStar.dot(_camDir) <= 0) continue; // за камерой

      _v.project(camera);
      if (_v.z < -1 || _v.z > 1) continue;

      const sx = _v.x * 0.5 * viewport.width;
      const sy = _v.y * 0.5 * viewport.height;
      const dist = Math.hypot(sx - px, sy - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = star;
      }
    }

    return best;
  };

  /** Мировая позиция звезды (карта может вращаться). */
  const getWorldPosition = (star, out = new THREE.Vector3()) => {
    group.updateMatrixWorld(true);
    return out.copy(star.position).applyMatrix4(group.matrixWorld);
  };

  const getStar = (id) => keyList.find((s) => String(s.id) === String(id)) || null;

  // ────────────────────────────── анимация / очистка ──────────────────────────────
  const update = (elapsed) => {
    pointsMaterial.uniforms.uTime.value = elapsed;
    if (rotateSpeed) group.rotation.y = elapsed * rotateSpeed;
  };

  const setPixelRatio = (ratio) => {
    pointsMaterial.uniforms.uPixelRatio.value = ratio;
  };

  const setConstellationsVisible = (visible) => {
    lines.visible = visible;
  };

  const dispose = () => {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => materials.add(m));
        else materials.add(obj.material);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
    group.removeFromParent();
  };

  return {
    group,
    background,
    keyPoints,
    lines,
    keyStars: keyList,
    constellations: constellationGroups,
    radius,
    thickness,
    material: pointsMaterial,
    pickAt,
    getStar,
    getWorldPosition,
    update,
    setPixelRatio,
    setConstellationsVisible,
    dispose,
  };
};
