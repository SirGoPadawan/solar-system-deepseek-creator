import * as THREE from 'three'
import {
  TRAIL_TIME,
  TRAIL_POINTS,
  trailColors,
  SYSTEM_TILT_X,
  SYSTEM_TILT_Z,
  MOTION_SPEED,
  MOTION_DIR
} from './config.js'
import { meanMotion, orbitLocal } from './orbit.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:TRAILS] винтовые следы планет (спирали как на solar.jpg) ───
// След строится аналитически: берём орбиту тела за прошедшее время
// («выдержку») и сдвигаем точки против направления полёта -> спираль.
// ─────────────────────────────────────────────────────────────

const createTrailLine = (scene, color) => {
  const positions = new Float32Array(TRAIL_POINTS * 3)
  const colors = new Float32Array(TRAIL_POINTS * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)
  )
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  )
  line.frustumCulled = false
  scene.add(line)
  return { geometry, positions, colors, base: new THREE.Color(color), line }
}

export const createTrails = (scene, rigs) => {
  const bodies = rigs.map((rig) => ({
    orbit: rig.orbit,
    trail: createTrailLine(scene, trailColors[rig.config.type])
  }))

  // Ссылки на линии следов — для тумблера «Винтовые следы» и скрытия планеты
  const lines = bodies.map((b) => b.trail.line)

  const systemTilt = new THREE.Euler(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z, 'XYZ')
  const vec = new THREE.Vector3()

  // systemSpeed — глобальный множитель скорости (крутилки UI): и орбита, и полёт
  const update = (systemSpeed) => {
    bodies.forEach((b) => {
      const o = b.orbit
      // ─── [FEATURE:KEPLER] угловая скорость по формуле n = SPEED_FACTOR/sqrt(R³)
      const omega = meanMotion(o.a, o.speedScale) * 60 // рад/сек
      const t = b.trail
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const rel = k / (TRAIL_POINTS - 1) // 0 у планеты -> 1 на дальнем конце
        const age = rel * TRAIL_TIME * systemSpeed
        // Где планета БЫЛА: отступаем по аномалии на прошедшее время
        const nuPast = o.nu - omega * age
        orbitLocal(o.a, o.e, nuPast, vec).applyEuler(o.orientation).applyEuler(systemTilt)
        // Смещение назад — как если бы система всё это время летела вперёд
        vec.addScaledVector(MOTION_DIR, -MOTION_SPEED * age)
        t.positions[k * 3] = vec.x
        t.positions[k * 3 + 1] = vec.y
        t.positions[k * 3 + 2] = vec.z
        const f = 1 - rel
        t.colors[k * 3] = t.base.r * f
        t.colors[k * 3 + 1] = t.base.g * f
        t.colors[k * 3 + 2] = t.base.b * f
      }
      t.geometry.setDrawRange(0, TRAIL_POINTS)
      t.geometry.attributes.position.needsUpdate = true
      t.geometry.attributes.color.needsUpdate = true
    })
  }

  return { update, lines }
}
