import * as THREE from 'three'
import { starTexture, glowTexture } from './textures.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:BLACKHOLE] сверхмассивная чёрная дыра в центре ───
//
// Живёт в локальном (0,0,0) группы галактики — это центр спирали
// (Млечного Пути), а не Солнце: Солнечная система смещена на
// GALAXY.distance и находится ВНУТРИ диска.
//
// Из чего состоит:
//   1. **Сфера Шварцшильда** — чёрный шар, который перекрывает свет ядра
//      и звёзд за собой. Именно силуэт делает дыру дырой.
//   2. **Фотонная сфера** — тонкое раскалённое кольцо по краю силуэта
//      (спрайт, всегда смотрит в камеру) + широкий неоновый ореол.
//   3. **Аккреционный диск** — ОДНА система частиц (THREE.Points) вместо
//      плоского меша. Частицы живут по кеплеровскому закону (ω ∝ r^-1.5),
//      поэтому диск «сдвигается» спиралью, а турбулентность (сумма
//      синусов со случайными фазами) заставляет вещество струиться.
//   4. **[FEATURE:DOPPLER] релятивистский доплер** — сторона диска,
//      которая летит на камеру, разгоняется в белый и вспыхивает,
//      уходящая — гаснет в глубокий оранжево-красный. Считается каждый
//      кадр по направлению на камеру (v · n) в локальных координатах.
//   5. **[FEATURE:JETS] полярные джеты** — два аддитивных конуса
//      голубой плазмы вдоль оси Y (нормаль диска), с мерцанием.
//
// Всё — несколько draw call'ов, без единого кастомного шейдера.
// ─────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2

// Круглая маска без мипмапов (иначе точка в 2–3 px усредняется
// в серый квадрат — та же история, что у звёзд галактики).
const makeTexture = (stops, size = 256) => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const r = size / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  stops.forEach(([at, color]) => g.addColorStop(at, color))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

// ─── [FEATURE:PHOTON] фотонная сфера: тонкое белое кольцо ───
// Полоса на 0.675 радиуса спрайта: при scale = radius * 2.9 это ровно
// радиус горизонта, то есть кольцо лежит на кромке силуэта.
const makePhotonRingTexture = () =>
  makeTexture([
    [0, 'rgba(0,0,0,0)'],
    [0.5, 'rgba(120,190,255,0)'],
    [0.58, 'rgba(190,230,255,0.18)'],
    [0.645, 'rgba(240,250,255,0.72)'],
    [0.675, 'rgba(255,255,255,1)'], // само кольцо
    [0.703, 'rgba(255,246,230,0.6)'],
    [0.745, 'rgba(255,196,130,0.12)'],
    [0.83, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0)']
  ])

// Широкий неоновый ореол вокруг кольца — «свет, застрявший на орбите».
const makePhotonHaloTexture = () =>
  makeTexture([
    [0, 'rgba(0,0,0,0)'],
    [0.4, 'rgba(90,150,255,0)'],
    [0.5, 'rgba(130,190,255,0.10)'],
    [0.59, 'rgba(170,220,255,0.26)'],
    [0.655, 'rgba(215,242,255,0.4)'],
    [0.715, 'rgba(150,205,255,0.2)'],
    [0.81, 'rgba(90,140,255,0.06)'],
    [1, 'rgba(0,0,0,0)']
  ])

// ─── [FEATURE:JETS] градиент вдоль конуса: плазма ярче у основания ───
// brightAtTop: true — основание у верхнего края канвы (нижний джет).
// CanvasTexture по умолчанию flipY, поэтому v=0 — низ канвы.
const makeJetTexture = (brightAtTop) => {
  if (typeof document === 'undefined') return null
  const W = 8
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createLinearGradient(0, 0, 0, H)
  const stops = [
    [0.0, 'rgba(225,242,255,0.95)'], // у основания
    [0.09, 'rgba(180,220,255,0.55)'],
    [0.32, 'rgba(135,185,255,0.24)'],
    [0.64, 'rgba(105,150,255,0.09)'],
    [1.0, 'rgba(85,115,255,0)']
  ]
  stops
    .map(([at, color]) => [brightAtTop ? at : 1 - at, color])
    .sort((a, b) => a[0] - b[0])
    .forEach(([at, color]) => g.addColorStop(at, color))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:DOPPLER] аккреционный диск: одна система частиц ───
//
// Каждая частица помнит радиус, угол, угловую скорость, высоту и фазу.
// Раз в кадр мы считаем:
//   a  = a0 + ω·t                      — кеплеровское вращение
//   r  = r0 + турбулентность(a, t)     — радиальные завихрения
//   y  = y0 + турбулентность(a, t)     — вертикальное «кипение»
//   dop = (v · dir) / |v|             — доплер по направлению на камеру
// Приближается → к белому и ярче, уходит → к тёмно-красному и тусклее.
// ─────────────────────────────────────────────────────────────
const createDisk = ({ count, rMin, rMax, radius, spin, dopplerBoost }) => {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseColors = new Float32Array(count * 3)

  const rad = new Float32Array(count)
  const ang = new Float32Array(count)
  const omega = new Float32Array(count)
  const yBase = new Float32Array(count)
  const yAmp = new Float32Array(count)
  const phase = new Float32Array(count)

  const cHot = new THREE.Color(0xfff8ec)
  const cWarm = new THREE.Color(0xffb257)
  const cCool = new THREE.Color(0x8e1406)
  const c = new THREE.Color()

  const span = rMax - rMin
  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    // плотнее у внутреннего края — там диск ярче и быстрее
    const k = Math.pow(Math.random(), 1.35)
    const r = rMin + k * span
    rad[i] = r
    ang[i] = Math.random() * TWO_PI
    // ω ∝ r^-1.5: внутренние частицы нарезают обороты в разы быстрее
    omega[i] = spin * Math.pow(rMin / r, 1.5) * 3.2
    yAmp[i] = radius * (0.022 + 0.085 * k)
    yBase[i] = (Math.random() - 0.5) * radius * (0.05 + 0.14 * k)
    phase[i] = Math.random() * TWO_PI

    // бело-жёлтый центр → оранжевый → тёмно-красный внешний край
    const m = Math.min(1, k * 1.12)
    if (m < 0.45) c.copy(cHot).lerp(cWarm, m / 0.45)
    else c.copy(cWarm).lerp(cCool, (m - 0.45) / 0.55)
    const bright = 1.12 - 0.42 * k
    baseColors[i3] = c.r * bright
    baseColors[i3 + 1] = c.g * bright
    baseColors[i3 + 2] = c.b * bright

    const x = Math.cos(ang[i]) * r
    const z = Math.sin(ang[i]) * r
    positions[i3] = x
    positions[i3 + 1] = yBase[i]
    positions[i3 + 2] = z
    colors[i3] = baseColors[i3]
    colors[i3 + 1] = baseColors[i3 + 1]
    colors[i3 + 2] = baseColors[i3 + 2]
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    map: starTexture,
    vertexColors: true,
    size: 2.2,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.01,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 0.25

  const posAttr = geometry.attributes.position
  const colAttr = geometry.attributes.color
  const camLocal = new THREE.Vector3()
  let t = 0

  // view = { camera, center, invRotation } — нужен только для доплера
  // (в офлайн-тестах камеры нет, тогда цвета остаются базовыми).
  const update = (dt, view) => {
    t += dt
    let hasView = false
    if (view && view.camera && view.invRotation) {
      camLocal
        .copy(view.camera.position)
        .sub(view.center)
        .applyQuaternion(view.invRotation)
      hasView = true
    }

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const r0 = rad[i]
      const a = ang[i] + omega[i] * t
      // случайные завихрения: два синуса с личными фазами дают
      // непериодичную «турбулентность» без шума Перлина
      const swirl = Math.sin(a * 2.3 + phase[i] + t * 0.9)
      const rr = r0 + swirl * 0.5 + Math.sin(r0 * 0.7 - t * 1.6 + phase[i]) * 0.22
      const x = Math.cos(a) * rr
      const z = Math.sin(a) * rr
      const y = yBase[i] + Math.sin(a * 3.1 + phase[i] * 1.7 + t * 1.3) * yAmp[i]

      positions[i3] = x
      positions[i3 + 1] = y
      positions[i3 + 2] = z

      const br = baseColors[i3]
      const bg = baseColors[i3 + 1]
      const bb = baseColors[i3 + 2]

      if (!hasView) {
        colors[i3] = br
        colors[i3 + 1] = bg
        colors[i3 + 2] = bb
        continue
      }

      // Скорость частицы: p = (r·cos a, y, r·sin a), a = … + ω·t
      //   dp/dt = (−ω·r·sin a, 0, ω·r·cos a) = (−ω·z, 0, ω·x)
      // (знак важен: с обратным знаком доплер перепутал бы стороны)
      const vx = -omega[i] * z
      const vz = omega[i] * x
      let dx = camLocal.x - x
      let dy = camLocal.y - y
      let dz = camLocal.z - z
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      dx /= dl
      dy /= dl
      dz /= dl
      const vl = Math.abs(omega[i]) * Math.sqrt(x * x + z * z) || 1
      const dop = (vx * dx + vz * dz) / vl // −1 уходит … +1 летит на камеру

      let gain
      let mix
      if (dop >= 0) {
        // приближается: белее + релятивистский буст яркости
        mix = Math.min(1, dop * 1.05)
        gain = 1 + dopplerBoost * mix
        colors[i3] = (br + (1.0 - br) * mix) * gain
        colors[i3 + 1] = (bg + (0.98 - bg) * mix) * gain
        colors[i3 + 2] = (bb + (0.95 - bb) * mix) * gain
      } else {
        // уходит: тусклее и в глубокий оранжево-красный
        mix = Math.min(1, -dop * 0.95)
        gain = 1 - 0.78 * mix
        colors[i3] = (br + (0.42 - br) * mix) * gain
        colors[i3 + 1] = (bg + (0.045 - bg) * mix) * gain
        colors[i3 + 2] = (bb + (0.012 - bb) * mix) * gain
      }
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  }

  return { points, update, count }
}

export const createBlackHole = (options = {}) => {
  const {
    radius = 6.5,
    diskInner = 8.5,
    diskOuter = 34,
    diskSpin = 0.55,
    particles = 6000,
    dopplerBoost = 2.4,
    photonScale = 2.9,
    photonGlowScale = 3.35,
    glowScale = 5.2,
    jetLength = 120,
    jetRadius = 7,
    jetBaseRadius = 1.6
  } = options

  const root = new THREE.Group()
  root.name = 'black-hole'

  // ── 1. Сфера Шварцшильда ──
  // transparent: true нужен, чтобы three рисовал её в прозрачном проходе
  // ПОСЛЕ аддитивных звёзд (иначе чёрный шар оказался бы под ними).
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 40, 28),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      fog: false,
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthWrite: true
    })
  )
  horizon.renderOrder = 0
  root.add(horizon)

  // ── 2. Тёплое свечение вокруг дыры ──
  // Рисуется ДО сферы (renderOrder -0.45): центр спрайта прячется за
  // горизонтом, а наружу остаётся оранжевый ореол.
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff8a3c,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.34,
    fog: false,
    toneMapped: false
  })
  const glow = new THREE.Sprite(glowMaterial)
  glow.scale.setScalar(radius * glowScale)
  glow.renderOrder = -0.45
  root.add(glow)

  // ── 3. [FEATURE:PHOTON] фотонная сфера ──
  // Тонкое «неоновое» кольцо, светящееся заметно выше 1.0 (HDR), чтобы
  // UnrealBloomPass поймал именно его, а не весь диск.
  const photonTex = makePhotonRingTexture()
  const photonMaterial = new THREE.SpriteMaterial({
    map: photonTex,
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // кромка сферы не должна срезать кольцо
    opacity: 0.95,
    fog: false,
    toneMapped: false
  })
  photonMaterial.color.setScalar(2.6) // HDR: порог блума выше 1
  const photon = new THREE.Sprite(photonMaterial)
  photon.scale.setScalar(radius * photonScale)
  photon.renderOrder = 0.21
  root.add(photon)

  const photonHaloTex = makePhotonHaloTexture()
  const photonHaloMaterial = new THREE.SpriteMaterial({
    map: photonHaloTex,
    color: 0x9fd4ff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.55,
    fog: false,
    toneMapped: false
  })
  photonHaloMaterial.color.setScalar(1.5)
  const photonGlow = new THREE.Sprite(photonHaloMaterial)
  photonGlow.scale.setScalar(radius * photonGlowScale)
  photonGlow.renderOrder = 0.2
  root.add(photonGlow)

  // ── 4. [FEATURE:DOPPLER] аккреционный диск из частиц ──
  const disk = createDisk({
    count: particles,
    rMin: diskInner,
    rMax: diskOuter,
    radius,
    spin: diskSpin,
    dopplerBoost
  })
  root.add(disk.points)

  // ── 5. [FEATURE:JETS] полярные джеты вдоль оси Y ──
  // Цилиндр: uv.y = 0 внизу, 1 вверху. У верхнего джета основание внизу,
  // у нижнего — вверху, поэтому градиенты зеркальные.
  const jetTexUpper = makeJetTexture(false)
  const jetTexLower = makeJetTexture(true)
  const jetMaterialTop = new THREE.MeshBasicMaterial({
    map: jetTexUpper,
    color: 0xbcdcff,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false
  })
  const jetMaterialBottom = new THREE.MeshBasicMaterial({
    map: jetTexLower,
    color: 0xbcdcff,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false
  })
  // узкое основание у горизонта, широкий «раструб» наружу
  const jetTop = new THREE.Mesh(
    new THREE.CylinderGeometry(jetRadius, jetBaseRadius, jetLength, 28, 1, true),
    jetMaterialTop
  )
  jetTop.position.y = jetLength / 2
  jetTop.renderOrder = -0.44

  const jetBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(jetBaseRadius, jetRadius, jetLength, 28, 1, true),
    jetMaterialBottom
  )
  jetBottom.position.y = -jetLength / 2
  jetBottom.renderOrder = -0.44

  root.add(jetTop, jetBottom)

  // ── анимация ──
  let t = 0
  const view = { camera: null, center: null, invRotation: null }

  const update = (delta, motionScale = 1, cameraView = null) => {
    const k = delta * Math.max(0, motionScale)
    t += k

    if (cameraView && cameraView.camera) {
      view.camera = cameraView.camera
      view.center = cameraView.center
      view.invRotation = cameraView.invRotation
    }

    disk.update(k, view.camera ? view : null)

    // «дыхание» горизонта + мерцание джетов
    horizon.scale.setScalar(1 + Math.sin(t * 1.9) * 0.008)
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1)
    photon.material.opacity = 0.86 + 0.14 * pulse
    photonGlow.material.opacity = 0.42 + 0.18 * pulse
    jetMaterialTop.opacity = 0.3 + 0.05 * Math.sin(t * 4.3)
    jetMaterialBottom.opacity = 0.3 + 0.05 * Math.sin(t * 4.3 + 1.7)
    glowMaterial.opacity = 0.32 + 0.04 * Math.sin(t * 2.7)
  }

  const dispose = () => {
    horizon.geometry.dispose()
    horizon.material.dispose()
    disk.points.geometry.dispose()
    disk.points.material.dispose()
    glowMaterial.dispose()
    photonMaterial.dispose()
    photonHaloMaterial.dispose()
    jetTop.geometry.dispose()
    jetBottom.geometry.dispose()
    jetMaterialTop.dispose()
    jetMaterialBottom.dispose()
    if (photonTex) photonTex.dispose()
    if (photonHaloTex) photonHaloTex.dispose()
    if (jetTexUpper) jetTexUpper.dispose()
    if (jetTexLower) jetTexLower.dispose()
    // starTexture / glowTexture — общие, их не трогаем
    if (root.parent) root.parent.remove(root)
  }

  return {
    root,
    horizon,
    glow,
    photon,
    photonGlow,
    disk: disk.points,
    particleCount: disk.count,
    jets: [jetTop, jetBottom],
    radius,
    update,
    dispose
  }
}
