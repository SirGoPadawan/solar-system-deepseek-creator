// ─────────────────────────────────────────────────────────────────────────────
//  src/universe/index.js — публичный API изолированного модуля «Вселенная».
//
//  Ничего из существующего проекта здесь не импортируется и не меняется.
//  Подключение — одной строкой:
//
//      import { createUniverseController } from './src/universe/index.js'
//
//  Слои:
//    seed.js                  — детерминированный рандом
//    kepler.js                — орбитальная математика (чистые функции)
//    noise.glsl.js            — GLSL-шум + палитры звёзд
//    shaders/starMaterial.js  — ShaderMaterial плазмы звезды
//    shaders/planetMaterial.js— универсальный ShaderMaterial планеты (u_seed)
//    galaxyMap.js             — карта Галактики: Points + созвездия + пикинг
//    systemFactory.js         — generateSystem(seed) + spawner (scene.remove/dispose)
//    fallbackBlackHole.js     — запасная ЧД (если не передали свою)
//    modeController.js        — режимы «галактика ⇄ система», клики, камера
// ─────────────────────────────────────────────────────────────────────────────

// Детерминированная случайность
export { hashSeed, mulberry32, createRng } from './seed.js';

// Орбитальная математика
export {
  TWO_PI,
  normalizeAngle,
  solveKepler,
  trueAnomaly,
  orbitalPosition,
  orbitPoint,
  meanMotion,
  orbitalPeriod,
  radiusAt,
} from './kepler.js';

// GLSL-шум и палитры
export { GLSL_NOISE, STAR_PALETTES } from './noise.glsl.js';

// Шейдеры
export {
  createStarMaterial,
  createStar,
  createStarCorona,
  updateStarMaterial,
} from './shaders/starMaterial.js';

export {
  createPlanetMaterial,
  createPlanetMesh,
  makePlanetPalette,
  updatePlanetMaterial,
} from './shaders/planetMaterial.js';

// Карта галактики и созвездия
export { createGalaxyMap } from './galaxyMap.js';
export { buildConstellations, CONSTELLATION_NAMES } from './constellations.js';

// Генератор систем
export {
  STAR_TYPES,
  generateSystem,
  createSystemSpawner,
  createOrbitLine,
} from './systemFactory.js';

// Чёрная дыра-заглушка
export { createFallbackBlackHole } from './fallbackBlackHole.js';

// Режимы и камера
export { createUniverseController } from './modeController.js';
