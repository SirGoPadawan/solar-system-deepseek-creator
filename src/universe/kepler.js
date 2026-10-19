// ─────────────────────────────────────────────────────────────────────────────
//  kepler.js — орбитальная математика без зависимостей.
//
//  Здесь нет three: функции работают с обычными { x, y, z } и принимают
//  необязательный `out` (удобно передавать THREE.Vector3 — у него есть .set()).
//  Поэтому модуль тестируется в Node и легко переиспользуется в любом движке.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:KEPLER] ───

export const TWO_PI = Math.PI * 2;

/** Приводит угол к диапазону [0, 2π). */
export const normalizeAngle = (angle) => {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
};

/**
 * Уравнение Кеплера: M = E − e·sin(E).
 * Решаем методом Ньютона (5–6 итераций хватает для e < 0.9).
 *
 * @param {number} M — средняя аномалия, радианы
 * @param {number} e — эксцентриситет, 0..<1
 * @param {number} [iterations]
 * @returns {number} E — эксцентрическая аномалия
 */
export const solveKepler = (M, e, iterations = 6) => {
  const m = normalizeAngle(M);
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < iterations; i++) {
    const d = E - e * Math.sin(E) - m;
    const denom = 1 - e * Math.cos(E);
    if (Math.abs(denom) < 1e-9) break;
    const step = d / denom;
    E -= step;
    if (Math.abs(step) < 1e-8) break;
  }
  return E;
};

/**
 * Истинная аномалия ν по эксцентрической E.
 * Формула через atan2 устойчива при больших e.
 */
export const trueAnomaly = (E, e) =>
  2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E * 0.5), Math.sqrt(1 - e) * Math.cos(E * 0.5));

/**
 * Позиция на орбите в 3D.
 *
 * Порядок поворотов (стандартный, из небесной механики):
 *   1. перифокальная плоскость: x' = r·cos ν, y' = r·sin ν
 *   2. аргумент перицентра ω   — поворот в плоскости орбиты
 *   3. наклон i                — поворот вокруг оси X узлов
 *   4. долгота узла Ω          — поворот вокруг Y (нормали эклиптики)
 *
 * @param {object} orbit
 * @param {number} orbit.a — большая полуось
 * @param {number} orbit.e — эксцентриситет
 * @param {number} orbit.M — средняя аномалия
 * @param {number} [orbit.inclination] — наклон, радианы
 * @param {number} [orbit.node] — долгота восходящего узла, радианы
 * @param {number} [orbit.argPeri] — аргумент перицентра, радианы
 * @param {{set?:Function,x?:number,y?:number,z?:number}} [out]
 * @returns {{x:number,y:number,z:number}}
 */
export const orbitalPosition = (orbit, out) => {
  const e = orbit.e || 0;
  const E = solveKepler(orbit.M || 0, e);
  const nu = trueAnomaly(E, e);
  return orbitPoint(orbit, nu, out);
};

/**
 * Позиция на орбите по истинной аномалии ν.
 * Нужна для отрисовки самой линии орбиты (эллипс без решения Кеплера).
 *
 * @param {object} orbit — { a, e, inclination, node, argPeri }
 * @param {number} nu — истинная аномалия, радианы (0 = перицентр)
 * @param {{set?:Function,x?:number,y?:number,z?:number}} [out]
 */
export const orbitPoint = (orbit, nu, out) => {
  const a = orbit.a;
  const e = orbit.e || 0;
  const inc = orbit.inclination || 0;
  const node = orbit.node || 0;
  const argPeri = orbit.argPeri || 0;

  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
  const px = Math.cos(nu) * r;
  const py = Math.sin(nu) * r;

  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  // Строки матрицы Rz(Ω)·Rx(i)·Rz(ω), применённой к (px, py, 0).
  const x =
    (cosO * cosW - sinO * sinW * cosI) * px +
    (-cosO * sinW - sinO * cosW * cosI) * py;
  const y =
    (sinO * cosW + cosO * sinW * cosI) * px +
    (-sinO * sinW + cosO * cosW * cosI) * py;
  const z = sinW * sinI * px + cosW * sinI * py;

  if (!out) return { x, y, z };
  if (typeof out.set === 'function') {
    out.set(x, y, z);
    return out;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
};

/**
 * Среднее движение: n = sqrt(μ / a³).
 * μ — гравитационный параметр. Для визуалки μ подбирается «на глаз»:
 * чем больше μ, тем быстрее крутятся планеты.
 */
export const meanMotion = (a, mu = 1) => Math.sqrt(mu / Math.max(a * a * a, 1e-6));

/**
 * Период обращения по третьему закону Кеплера: T = 2π·sqrt(a³/μ).
 */
export const orbitalPeriod = (a, mu = 1) => TWO_PI * Math.sqrt(Math.max(a * a * a, 1e-6) / mu);

/**
 * Радиус в данной точке орбиты (уравнение эллипса в полярных координатах).
 */
export const radiusAt = (a, e, trueAnom) => (a * (1 - e * e)) / (1 + e * Math.cos(trueAnom));

/**
 * Копирует позицию в out (или возвращает новый объект).
 * Мелочь, но избавляет от трёх копий одного и того же кода.
 */
export const copyVec = (x, y, z, out) => {
  if (!out) return { x, y, z };
  if (typeof out.set === 'function') {
    out.set(x, y, z);
    return out;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
};
