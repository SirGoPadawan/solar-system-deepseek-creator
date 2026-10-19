import * as THREE from 'three'
import { STAR_COUNT, STAR_BOX, MOTION_DIR } from './config.js'
import { glowTexture, createNebulaTexture } from './textures.js'

// ─────────────────────────────────────────────────────────────
// НЕБО: бесконечное звёздное поле (стримится навстречу) и туманность.
// ─────────────────────────────────────────────────────────────

// Обёртка координаты в диапазоне [-period/2, period/2) — для бесконечного неба
const wrapBox = (v, period) =>
  -period / 2 + ((((v + period / 2) % period) + period) % period)

export const createStarfield = () => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(STAR_COUNT * 3) // «живые» позиции для рендера
  const base = new Float32Array(STAR_COUNT * 3) // базовые позиции до сдвига
  const colors = new Float32Array(STAR_COUNT * 3)
  const color = new THREE.Color()

  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3
    base[i3] = (Math.random() * 2 - 1) * STAR_BOX
    base[i3 + 1] = (Math.random() * 2 - 1) * STAR_BOX
    base[i3 + 2] = (Math.random() * 2 - 1) * STAR_BOX
    positions[i3] = base[i3]
    positions[i3 + 1] = base[i3 + 1]
    positions[i3 + 2] = base[i3 + 2]
    // Разброс по температуре: от голубоватых до тёплых звёзд
    color.setHSL(0.55 + Math.random() * 0.12, 0.4, 0.75 + Math.random() * 0.25)
    colors[i3] = color.r
    colors[i3 + 1] = color.g
    colors[i3 + 2] = color.b
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.6,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  )

  const period = STAR_BOX * 2
  const update = (travel) => {
    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3
      positions[i3] = wrapBox(base[i3] - MOTION_DIR.x * travel, period)
      positions[i3 + 1] = wrapBox(base[i3 + 1] - MOTION_DIR.y * travel, period)
      positions[i3 + 2] = wrapBox(base[i3 + 2] - MOTION_DIR.z * travel, period)
    }
    geometry.attributes.position.needsUpdate = true
  }

  return { points, update }
}

// ─── [FEATURE:NEBULA] сфера-скайбокс вокруг всей сцены ───
export const createNebula = () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 48),
    new THREE.MeshBasicMaterial({
      map: createNebulaTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    })
  )
  mesh.renderOrder = -1
  return mesh
}
