import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:GRID] сетка эклиптики ───
// Полупрозрачная полярная сетка в плоскости Солнца. По ней хорошо
// видно, что орбиты планет наклонены (0–7°) и не лежат в одной плоскости.
// Добавляется прямо в `world`, поэтому наследует наклон системы.
// ─────────────────────────────────────────────────────────────

export const createEclipticGrid = (radius = 36) => {
  const grid = new THREE.PolarGridHelper(radius, 16, 10, 96, 0x2f5a9e, 0x1d3a63)
  grid.material.transparent = true
  grid.material.opacity = 0.18
  grid.material.depthWrite = false
  grid.material.toneMapped = false
  grid.renderOrder = -0.2
  grid.raycast = () => {} // сетка не должна ловить клики
  return grid
}
