import * as THREE from 'three'
import { STAR_COUNT, STAR_BOX, MOTION_DIR } from './config.js'
import { starTexture, createNebulaTexture } from './textures.js'

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
      // Звёзды неба — это «далёкая пыль», а не объекты с размером. Небо
      // теперь едет за камерой, поэтому ближние звёзды могут оказаться в
      // паре единиц от неё: с sizeAttenuation они раздувались в огромные
      // мягкие блобы («серые квадраты»). Постоянный размер в пикселях
      // убирает это полностью и заодно убирает мипмап-усреднение маски.
      size: 1.7,
      map: starTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.01,
      sizeAttenuation: false,
      // звёзды — «дальний фон»: объёмный туман на них не действует
      fog: false
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
      toneMapped: false,
      fog: false
    })
  )
  mesh.renderOrder = -1
  return mesh
}

// ─── [FEATURE:DUST] лёгкое свечение на задний план ───
// Очень слабый градиент (снизу фиолетовый, сверху синий) аддитивно
// подсвечивает космос, чтобы он не был абсолютно чёрным.
export const createSpaceGlow = () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x16264f) },
        uBottom: { value: new THREE.Color(0x2a173f) },
        uIntensity: { value: 0.16 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uIntensity;
        varying vec3 vDir;
        void main() {
          float t = vDir.y * 0.5 + 0.5;
          vec3 col = mix(uBottom, uTop, t);
          gl_FragColor = vec4(col * uIntensity, 1.0);
        }
      `
    })
  )
  mesh.renderOrder = -0.5
  return mesh
}

// ─── [FEATURE:DUST] объёмный «туман» космоса (THREE.FogExp2) ───
// Дальние объекты мягко уходят в темноту — сцена читается объёмнее.
export const createSpaceFog = () => new THREE.FogExp2(0x0a1024, 0.008)
