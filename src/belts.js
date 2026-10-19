import * as THREE from 'three'
import { ORBIT_TILT } from './config.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:BELTS] пояса малых тел через InstancedMesh ───
// Астероиды (между Марсом и Юпитером) и пояс Койпера (за Нептуном).
// ─────────────────────────────────────────────────────────────

export const makeBelt = (parent, cfg) => {
  const {
    count,
    inner,
    outer,
    ySpread,
    scaleMin,
    scaleMax,
    speedMin,
    speedMax,
    color
  } = cfg

  const group = new THREE.Group()
  group.rotation.x = ORBIT_TILT
  parent.add(group)

  const inst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true
    }),
    count
  )
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  inst.frustumCulled = false
  group.add(inst)

  const items = []
  for (let i = 0; i < count; i++) {
    items.push({
      radius: inner + Math.random() * (outer - inner),
      y: (Math.random() - 0.5) * ySpread,
      scale: scaleMin + Math.random() * (scaleMax - scaleMin),
      angle: Math.random() * Math.PI * 2,
      speed: speedMin + Math.random() * (speedMax - speedMin),
      rx: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2
    })
  }

  return { inst, items, dummy: new THREE.Object3D() }
}

export const updateBelt = (belt, timeScale) => {
  const d = belt.dummy
  for (let i = 0; i < belt.items.length; i++) {
    const a = belt.items[i]
    a.angle += a.speed * timeScale
    d.position.set(Math.cos(a.angle) * a.radius, a.y, Math.sin(a.angle) * a.radius)
    d.rotation.set(a.rx + a.angle, a.angle * 1.5, a.rz)
    d.scale.setScalar(a.scale)
    d.updateMatrix()
    belt.inst.setMatrixAt(i, d.matrix)
  }
  belt.inst.instanceMatrix.needsUpdate = true
}
