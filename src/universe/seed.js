// ─────────────────────────────────────────────────────────────────────────────
//  seed.js — детерминированная случайность.
//
//  Один и тот же сид всегда даёт одну и ту же вселенную (звёзды, планеты,
//  цвета, орбиты). Это важно и для отладки, и для того, чтобы при возврате
//  в уже посещённую систему она выглядела так же.
//
//  Модуль намеренно не импортирует three — его можно тестировать в Node.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Превращает строку или число в uint32.
 * FNV-1a: быстро, стабильно, без зависимостей.
 * @param {number|string} seed
 * @returns {number}
 */
export const hashSeed = (seed) => {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * mulberry32 — компактный быстрый PRNG. Возвращает функцию, дающую [0, 1).
 * @param {number} a
 * @returns {() => number}
 */
export const mulberry32 = (a) => {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Готовый набор хелперов поверх PRNG.
 *
 * const rng = createRng('andromeda')
 * rng.int(3, 8)        // 3..8 включительно
 * rng.range(0.2, 0.9)  // float
 * rng.pick(['a', 'b'])
 * rng.gauss()          // нормальное распределение
 * rng.weighted([['sun', 5], ['blackHole', 1]])
 *
 * @param {number|string} seed
 */
export const createRng = (seed) => {
  const next = mulberry32(hashSeed(seed));

  const rng = {
    seed,
    next,

    /** float в [min, max) — либо [min] если max не задан. */
    range: (min, max) => (max === undefined ? min * next() : min + (max - min) * next()),

    /** Целое в [min, max] включительно. */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),

    /** -1 или +1. */
    sign: () => (next() < 0.5 ? -1 : 1),

    /** true с вероятностью p. */
    chance: (p) => next() < p,

    /** Случайный элемент массива. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],

    /** Случайный элемент + индекс. */
    pickIndexed: (arr) => {
      const index = Math.floor(next() * arr.length);
      return { item: arr[index], index };
    },

    /** Нормальное распределение (Box–Muller), среднее 0, sigma 1. */
    gauss: () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },

    /** Случайный цвет в HSL в виде [h, s, l], h в [0, 1). */
    hsl: (hue = 1, sat = 0.6, light = 0.5) => [next() * hue, sat, light],

    /**
     * Взвешенный выбор: entries = [[value, weight], ...].
     * Вес может быть числом > 0.
     */
    weighted: (entries) => {
      let total = 0;
      for (let i = 0; i < entries.length; i++) total += entries[i][1];
      let roll = next() * total;
      for (let i = 0; i < entries.length; i++) {
        roll -= entries[i][1];
        if (roll <= 0) return entries[i][0];
      }
      return entries[entries.length - 1][0];
    },

    /** Перемешивание копии массива (Fisher–Yates), не мутирует исходник. */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      return out;
    },
  };

  return rng;
};
