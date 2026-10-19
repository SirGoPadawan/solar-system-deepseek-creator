import * as THREE from 'three'
import { SPEED_FACTOR } from './config.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:KEPLER] орбитальная механика ───
// 1. Угловая скорость по третьему закону Кеплера: n = SPEED_FACTOR / sqrt(R³)
// 2. Эллиптические орбиты (эксцентриситет e)
// 3. Наклон плоскости орбиты (inclination) + долгота узла (node) -> смещение по Y
// Модуль используется и для анимации (main.js), и для следов (trails.js),
// поэтому формулы живут в одном месте — рассинхрона не будет.
// ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180

// Средняя угловая скорость (рад/сек в «единицах delta*60»):
//   n = SPEED_FACTOR / sqrt(a³)
// a — радиус орбиты (большая полуось), speedScale — пользовательский множитель UI.
// У Солнца a = 0 — оно стоит в центре и не обращается.
export const meanMotion = (a, speedScale = 1) =>
  a > 0 ? (SPEED_FACTOR * speedScale) / Math.sqrt(a * a * a) : 0

// Радиус на эллипсе (фокус — в начале координат) по истинной аномалии ν:
//   r = a·(1 - e²) / (1 + e·cos ν)
export const orbitRadius = (a, e, nu) => (a * (1 - e * e)) / (1 + e * Math.cos(nu))

// Позиция в плоскости орбиты: x/z с учётом эксцентриситета.
// `out` можно передать, чтобы не мусорить аллокациями в кадре.
export const orbitLocal = (a, e, nu, out) => {
  const r = orbitRadius(a, e, nu)
  const v = out || new THREE.Vector3()
  return v.set(Math.cos(nu) * r, 0, Math.sin(nu) * r)
}

// Ориентация плоскости орбиты: наклон + долгота узла.
// Порядок 'YXZ' => Ry(node) · Rx(inclination): сначала наклоняем плоскость,
// потом разворачиваем её по азимуту. Из-за наклона у орбиты появляется
// смещение по Y (0–7° для планет).
export const orbitOrientation = (inclinationDeg, nodeDeg, out) => {
  const e = out || new THREE.Euler()
  return e.set(inclinationDeg * DEG, nodeDeg * DEG, 0, 'YXZ')
}

// Готовый эллипс для линии орбиты (уже с наклоном плоскости)
export const orbitPolyline = (a, e, orientation, segments = 160) => {
  const points = []
  const scratch = new THREE.Vector3()
  for (let i = 0; i <= segments; i++) {
    const nu = (i / segments) * Math.PI * 2
    points.push(orbitLocal(a, e, nu, scratch).applyEuler(orientation).clone())
  }
  return points
}
