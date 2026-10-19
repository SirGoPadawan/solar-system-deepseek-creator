// ─────────────────────────────────────────────────────────────────────────────
//  systemFactory.js — процедурный генератор звёздных систем.
//
//  generateSystem(starSeed) — чистая фабрика:
//    • детерминированно выбирает тип звезды (по весам);
//    • спавнит 3–8 планет на кеплеровских эллипсах (a, e, i, Ω, ω, M0);
//    • каждой планете — свой u_seed, палитра, размер и наклон;
//    • газовым гигантам иногда достаются кольца;
//    • возвращает { root, planets, update, dispose, extent, ... }.
//
//  createSystemSpawner({ scene }) — менеджер жизненного цикла:
//    старая система явно удаляется из сцены (scene.remove) и освобождает
//    GPU-память (dispose() всех geometry/material/texture).
//
//  Чёрную дыру можно подменить своей фабрикой:
//    createSystemSpawner({ scene, blackHoleFactory: createBlackHole })
//  — тогда используется ваш готовый src/blackhole.js со всеми джетами/доплером.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:SYSTEMSPAWNER] ───

import * as THREE from 'three';
import { createRng } from './seed.js';
import { orbitalPosition, orbitPoint, meanMotion, TWO_PI } from './kepler.js';
import { createStar } from './shaders/starMaterial.js';
import { createPlanetMesh, makePlanetPalette } from './shaders/planetMaterial.js';
import { createFallbackBlackHole } from './fallbackBlackHole.js';

// Веса подобраны так, чтобы чаще встречалось «обычное солнце»,
// но иногда попадались экзотика и чёрная дыра.
export const STAR_TYPES = {
  sun: {
    weight: 38,
    radius: 2.6,
    palette: 'sun',
    label: 'Жёлтый карлик',
  },
  orangeDwarf: {
    weight: 15,
    radius: 2.1,
    palette: 'orangeDwarf',
    label: 'Оранжевый карлик',
  },
  redDwarf: {
    weight: 17,
    radius: 1.5,
    palette: 'redDwarf',
    label: 'Красный карлик',
  },
  blueGiant: {
    weight: 14,
    radius: 4.3,
    palette: 'blueGiant',
    label: 'Голубой гигант',
  },
  whiteDwarf: {
    weight: 8,
    radius: 1.0,
    palette: 'whiteDwarf',
    label: 'Белый карлик',
  },
  blackHole: {
    weight: 8,
    radius: 2.4,
    palette: null,
    label: 'Чёрная дыра',
  },
};

// Гравитационный параметр для визуальных орбит.
// n = sqrt(μ / a³): внутренние планеты заметно обгоняют внешние,
// но внешние всё равно успевают двигаться за время демонстрации.
const DEFAULT_MU = 300;

/**
 * Линия орбиты — замкнутый эллипс с правильным наклоном/узлом/перицентром.
 * Точки сэмплируются по истинной аномалии (равномерно по эллипсу).
 */
export const createOrbitLine = (orbit, options = {}) => {
  const {
    color = 0x6f9ad6,
    opacity = 0.14,
    segments = 220,
    blending = THREE.AdditiveBlending,
  } = options;

  const positions = new Float32Array(segments * 3);
  const p = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < segments; i++) {
    const nu = (i / segments) * TWO_PI;
    orbitPoint(orbit, nu, p);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending,
    toneMapped: false,
  });

  return new THREE.LineLoop(geometry, material);
};

/**
 * Сгенерировать систему по сиду.
 *
 * @param {number|string} starSeed
 * @param {object} [options]
 * @param {string} [options.starType] — принудительный тип звезды
 * @param {number} [options.minPlanets=3]
 * @param {number} [options.maxPlanets=8]
 * @param {number} [options.speed=1] — глобальный множитель скорости
 * @param {number} [options.mu] — гравитационный параметр орбит
 * @param {number} [options.planetScale=1]
 * @param {(opts:object)=>{root:THREE.Object3D,update?:Function,dispose?:Function}} [options.blackHoleFactory]
 * @param {object} [options.blackHole] — доп. настройки для фабрики ЧД
 * @param {number} [options.pixelRatio=1]
 * @returns {object} system
 */
export const generateSystem = (starSeed, options = {}) => {
  const {
    starType = null,
    minPlanets = 3,
    maxPlanets = 8,
    speed = 1,
    mu = DEFAULT_MU,
    planetScale = 1,
    blackHoleFactory = null,
    blackHole = {},
    pixelRatio = 1,
  } = options;

  const rng = createRng(starSeed);

  // ── Тип звезды ──
  const type =
    starType && STAR_TYPES[starType]
      ? starType
      : rng.weighted(Object.keys(STAR_TYPES).map((key) => [key, STAR_TYPES[key].weight]));

  const spec = STAR_TYPES[type];
  const starRadius = spec.radius;
  const sizeScale = Math.max(0.7, starRadius / 2.6) * planetScale;

  const root = new THREE.Group();
  root.name = `system:${starSeed}`;
  root.userData.starSeed = starSeed;
  root.userData.starType = type;

  // ── Звезда или чёрная дыра ──
  let star = null;
  let blackHoleHandle = null;

  if (type === 'blackHole') {
    const bhOptions = {
      radius: blackHole.radius !== undefined ? blackHole.radius : starRadius,
      seed: starSeed,
      pixelRatio,
      ...blackHole,
    };
    blackHoleHandle = blackHoleFactory
      ? blackHoleFactory(bhOptions)
      : createFallbackBlackHole(bhOptions);
    root.add(blackHoleHandle.root);
  } else {
    star = createStar({
      seed: starSeed,
      type,
      radius: starRadius,
      segments: starRadius > 3 ? 72 : 56,
    });
    root.add(star.root);
  }

  // ── Планеты ──
  const planetCount = rng.int(minPlanets, maxPlanets);
  const planets = [];
  const sunWorld = new THREE.Vector3();
  const tmp = { x: 0, y: 0, z: 0 };

  // Откуда начинать: у ЧД диск выедает внутреннюю зону.
  let a = type === 'blackHole' ? starRadius * 7 : starRadius * 3.4;

  for (let i = 0; i < planetCount; i++) {
    if (i > 0) a *= rng.range(1.42, 1.72);

    const e = rng.range(0.02, 0.23);
    const inclination = rng.range(-1, 1) * rng.range(0.02, 0.11);
    const node = rng.next() * TWO_PI;
    const argPeri = rng.next() * TWO_PI;
    const M0 = rng.next() * TWO_PI;

    // Газовый гигант — не в самой глубине системы.
    const isGas = rng.chance(0.34) && a > starRadius * 4.5;
    const kind = isGas ? 'gas' : 'terrestrial';

    const radius = (isGas ? rng.range(1.05, 2.2) : rng.range(0.26, 0.85)) * sizeScale;

    const planetSeed = `${starSeed}:planet:${i}`;
    const palette = makePlanetPalette(planetSeed, kind);

    const handle = createPlanetMesh({
      radius,
      seed: planetSeed,
      kind,
      sunPos: sunWorld,
      segments: isGas ? 64 : 48,
    });

    // Наклон оси: отдельная группа, чтобы вращение шло вокруг наклонённой оси.
    const tilt = new THREE.Group();
    tilt.rotation.z = rng.range(-0.38, 0.38);
    tilt.add(handle.mesh);

    const holder = new THREE.Group();
    holder.name = `planet:${i}`;
    holder.add(tilt);
    root.add(holder);

    // Кольца газовых гигантов.
    let rings = null;
    if (isGas && rng.chance(0.45)) {
      const inner = radius * rng.range(1.3, 1.5);
      const outer = radius * rng.range(1.9, 2.5);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: palette.bandC,
        transparent: true,
        opacity: rng.range(0.18, 0.4),
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      rings = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 1), ringMaterial);
      rings.rotation.x = -Math.PI * 0.5;
      tilt.add(rings);
    }

    const orbitColor = palette.haze.clone().multiplyScalar(0.9);
    const orbit = createOrbitLine(
      { a, e, inclination, node, argPeri },
      {
        color: orbitColor,
        opacity: isGas ? 0.15 : 0.11,
        segments: 220,
      }
    );
    root.add(orbit);

    const orbitData = { a, e, inclination, node, argPeri, M: M0 };

    planets.push({
      index: i,
      name: `Планета ${i + 1}`,
      kind,
      seed: planetSeed,
      radius,
      a,
      e,
      inclination,
      node,
      argPeri,
      M: M0,
      orbitData,
      // Кеплер: чем дальше, тем медленнее.
      n: meanMotion(a, mu) * rng.range(0.94, 1.06),
      spin: rng.range(0.06, 0.34) * (isGas ? 1.5 : 1),
      holder,
      tilt,
      mesh: handle.mesh,
      material: handle.material,
      orbit,
      rings,
    });
  }

  const extent = planets.reduce((max, p) => Math.max(max, p.a * (1 + p.e)), 0) * 1.18;

  let time = 0;

  /** Позиция звезды в мировых координатах (для шейдеров планет). */
  const getSunWorldPosition = (out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, false);
    return root.getWorldPosition(out);
  };

  /**
   * @param {number} delta — секунды
   * @param {number} [motionScale] — множитель скорости
   */
  const update = (delta, motionScale = speed) => {
    const dt = delta * motionScale;
    time += dt;

    root.updateWorldMatrix(true, false);
    root.getWorldPosition(sunWorld);

    if (star) star.update(time);

    if (blackHoleHandle && blackHoleHandle.update) {
      // Готовый createBlackHole принимает (delta, motionScale, view);
      // без камеры доплер просто остаётся в базовом состоянии.
      blackHoleHandle.update(dt, 1);
    }

    for (const p of planets) {
      p.M = (p.M + p.n * dt) % TWO_PI;
      p.orbitData.M = p.M;
      orbitalPosition(p.orbitData, tmp);
      p.holder.position.set(tmp.x, tmp.y, tmp.z);
      p.mesh.rotation.y += p.spin * dt;
      p.material.uniforms.uTime.value = time;
      p.material.uniforms.uSunPos.value.copy(sunWorld);
    }
  };

  const dispose = () => {
    const skip = blackHoleHandle && blackHoleHandle.dispose ? blackHoleHandle.root : null;
    const geometries = new Set();
    const materials = new Set();

    root.traverse((obj) => {
      // Поддерево чужой ЧД чистит её собственный dispose().
      if (skip) {
        let node = obj;
        while (node) {
          if (node === skip) return;
          node = node.parent;
        }
      }
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => materials.add(m));
        else materials.add(obj.material);
      }
    });

    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());

    if (blackHoleHandle && blackHoleHandle.dispose) blackHoleHandle.dispose();

    root.clear();
    root.removeFromParent();
  };

  // Применяем начальные позиции сразу, чтобы система не «прыгала» в кадре 1.
  update(0, 0);

  return {
    root,
    star,
    blackHole: blackHoleHandle,
    planets,
    seed: starSeed,
    starType: type,
    starLabel: spec.label,
    starRadius,
    extent,
    speed,
    mu,
    update,
    dispose,
    getSunWorldPosition,
  };
};

/**
 * Менеджер активной системы.
 *
 * spawn(seed) всегда сначала снимает со сцены и уничтожает предыдущую:
 *   scene.remove(old.root) + old.dispose()
 *
 * @param {object} config
 * @param {THREE.Scene} config.scene
 * @param {Function|null} [config.blackHoleFactory]
 * @param {object} [config.defaults] — настройки по умолчанию для generateSystem
 */
export const createSystemSpawner = (config) => {
  const { scene, blackHoleFactory = null, defaults = {} } = config;

  let current = null;

  const clear = () => {
    if (!current) return;
    // Явное удаление из сцены — до dispose(), чтобы не осталось ссылок.
    scene.remove(current.root);
    current.dispose();
    current = null;
  };

  const spawn = (seed, overrides = {}) => {
    clear();
    current = generateSystem(seed, {
      ...defaults,
      ...overrides,
      blackHoleFactory:
        overrides.blackHoleFactory !== undefined
          ? overrides.blackHoleFactory
          : blackHoleFactory,
    });
    scene.add(current.root);
    return current;
  };

  return {
    spawn,
    clear,
    dispose: clear,
    get current() {
      return current;
    },
  };
};
