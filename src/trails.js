import * as THREE from 'three'
import {
  TRAIL_TIME,
  TRAIL_POINTS,
  trailColors,
  ORBIT_TILT,
  SYSTEM_TILT_X,
  SYSTEM_TILT_Z,
  MOTION_SPEED,
  MOTION_DIR
} from './config.js'

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
  return { geometry, positions, colors, base: new THREE.Color(color) }
}

export const createTrails = (scene, rigs) => {
  const bodies = rigs.map((rig) => ({
    orbitGroup: rig.orbitGroup,
    distance: rig.config.distance,
    omega: rig.config.orbitSpeed * 60, // угловая скорость, рад/сек
    trail: createTrailLine(scene, trailColors[rig.config.type])
  }))

  const euler = new THREE.Euler()
  const systemTilt = new THREE.Euler(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z, 'XYZ')
  const vec = new THREE.Vector3()

  // systemSpeed — глобальный множитель скорости (крутилки UI): и орбита, и полёт
  const update = (systemSpeed) => {
    bodies.forEach((b) => {
      const theta0 = b.orbitGroup.rotation.y
      const t = b.trail
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const rel = k / (TRAIL_POINTS - 1) // 0 у планеты -> 1 на дальнем конце
        const age = rel * TRAIL_TIME * systemSpeed
        euler.set(ORBIT_TILT, theta0 - b.omega * age, 0, 'XYZ')
        vec
          .set(b.distance, 0, 0)
          .applyEuler(euler)
          .applyEuler(systemTilt)
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

  return { update }
}
