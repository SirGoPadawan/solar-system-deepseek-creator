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
//   2. **Фотонное кольцо** — тонкое яркое кольцо по краю силуэта
//      (спрайт, всегда смотрит в камеру; depthTest выключен, чтобы
//      кромка шара его не срезала).
//   3. **Аккреционный диск** — плоское кольцо с радиальным градиентом
//      «раскалённый внутренний край → оранжевый → красный → прозрачный».
//      UV у RingGeometry — плоская проекция, поэтому градиент ложится
//      ровными концентрическими полосами.
//   4. **Два слоя частиц** с разной скоростью вращения (дифференциальное
//      вращение, как у настоящего диска): внутренний слой крутится
//      примерно в 2 раза быстрее внешнего.
//
// Всё это — 5 draw call'ов и ни одного шейдера: дёшево и предсказуемо.
// ─────────────────────────────────────────────────────────────

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

// Аккреционный диск: внутренний край раскалён добела, дальше оранжевый,
// красный и полностью прозрачный. `innerRatio` = diskInner / diskOuter,
// потому что RingGeometry кладёт UV в диапазон [innerRatio, 1] от центра.
const makeDiskTexture = (innerRatio) => {
  const start = Math.min(0.92, Math.max(0.02, innerRatio))
  const at = (t) => start + (1 - start) * t
  return makeTexture([
    [0, 'rgba(0,0,0,0)'],
    [at(0.0), 'rgba(255,252,240,0.95)'], // раскалённая кромка
    [at(0.09), 'rgba(255,222,160,0.9)'],
    [at(0.26), 'rgba(255,150,60,0.72)'],
    [at(0.5), 'rgba(220,70,26,0.4)'],
    [at(0.74), 'rgba(150,24,12,0.16)'],
    [at(0.93), 'rgba(80,6,4,0.04)'],
    [1, 'rgba(0,0,0,0)']
  ])
}

// Фотонное кольцо: узкая яркая полоса на 0.68 радиуса спрайта.
const makePhotonRingTexture = () =>
  makeTexture([
    [0, 'rgba(0,0,0,0)'],
    [0.54, 'rgba(255,190,120,0)'],
    [0.61, 'rgba(255,236,200,0.5)'],
    [0.675, 'rgba(255,255,255,0.95)'], // само кольцо
    [0.73, 'rgba(255,176,96,0.42)'],
    [0.84, 'rgba(255,96,42,0.12)'],
    [1, 'rgba(0,0,0,0)']
  ])

// Слой частиц диска: плоское кольцо с толщиной и случайными цветами.
const makeRingParticles = ({
  count,
  rMin,
  rMax,
  height,
  size,
  opacity,
  spin,
  colorIn,
  colorOut
}) => {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const a = new THREE.Color(colorIn)
  const b = new THREE.Color(colorOut)
  const c = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    // больше частиц у внутреннего края (там диск ярче и плотнее)
    const r = rMin + Math.pow(Math.random(), 1.6) * (rMax - rMin)
    const angle = Math.random() * Math.PI * 2
    positions[i3] = Math.cos(angle) * r
    positions[i3 + 1] = (Math.random() - 0.5) * height * (0.4 + (r / rMax) * 0.6)
    positions[i3 + 2] = Math.sin(angle) * r

    // у внутреннего края — бело-жёлтый, у внешнего — красный
    c.copy(a).lerp(b, Math.max(0, Math.min(1, (r - rMin) / (rMax - rMin))))
    const boost = 0.7 + Math.random() * 0.6
    colors[i3] = c.r * boost
    colors[i3 + 1] = c.g * boost
    colors[i3 + 2] = c.b * boost
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      map: starTexture,
      vertexColors: true,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.01,
      sizeAttenuation: false,
      fog: false,
      toneMapped: false
    })
  )
  points.frustumCulled = false
  points.userData.spin = spin
  return points
}

export const createBlackHole = (options = {}) => {
  const {
    radius = 6.5,
    diskInner = 8.5,
    diskOuter = 34,
    diskSpin = 0.55,
    particles = 2600,
    photonScale = 2.9,
    glowScale = 5.2
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

  // ── 3. Фотонное кольцо по краю силуэта ──
  const photonTex = makePhotonRingTexture()
  const photon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: photonTex,
      color: 0xffc48a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // кромка сферы не должна срезать кольцо
      opacity: 0.9,
      fog: false,
      toneMapped: false
    })
  )
  photon.scale.setScalar(radius * photonScale)
  photon.renderOrder = 0.2
  root.add(photon)

  // ── 4. Аккреционный диск (плоское кольцо с размытым градиентом) ──
  const diskTex = makeDiskTexture(diskInner / diskOuter)
  const diskMaterial = new THREE.MeshBasicMaterial({
    map: diskTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  })
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(diskInner, diskOuter, 128, 1),
    diskMaterial
  )
  disk.rotation.x = -Math.PI / 2 // из XY в плоскость диска галактики (XZ)
  disk.renderOrder = 0.15
  root.add(disk)

  // ── 5. Быстро вращающиеся частицы: два слоя ──
  const inner = makeRingParticles({
    count: Math.round(particles * 0.46),
    rMin: diskInner,
    rMax: diskInner + (diskOuter - diskInner) * 0.38,
    height: radius * 0.16,
    size: 2.4,
    opacity: 0.9,
    spin: diskSpin * 3,
    colorIn: 0xfff4dc,
    colorOut: 0xff9a3c
  })
  const outer = makeRingParticles({
    count: Math.round(particles * 0.54),
    rMin: diskInner + (diskOuter - diskInner) * 0.3,
    rMax: diskOuter,
    height: radius * 0.26,
    size: 1.9,
    opacity: 0.72,
    spin: diskSpin * 1.35,
    colorIn: 0xffb066,
    colorOut: 0xc22c12
  })
  inner.renderOrder = 0.25
  outer.renderOrder = 0.24
  root.add(inner, outer)

  let t = 0
  const update = (delta, motionScale = 1) => {
    const k = delta * Math.max(0, motionScale)
    t += k
    inner.rotation.y += inner.userData.spin * k
    outer.rotation.y += outer.userData.spin * k
    // лёгкое «дыхание» диска — как будто вещество падает неравномерно
    diskMaterial.opacity = 0.84 + Math.sin(t * 2.7) * 0.07
    horizon.scale.setScalar(1 + Math.sin(t * 1.9) * 0.012)
  }

  const dispose = () => {
    horizon.geometry.dispose()
    horizon.material.dispose()
    disk.geometry.dispose()
    disk.material.dispose()
    inner.geometry.dispose()
    inner.material.dispose()
    outer.geometry.dispose()
    outer.material.dispose()
    glowMaterial.dispose()
    photon.material.dispose()
    if (diskTex) diskTex.dispose()
    if (photonTex) photonTex.dispose()
    // starTexture / glowTexture — общие, их не трогаем
    if (root.parent) root.parent.remove(root)
  }

  return { root, horizon, disk, photon, particles: [inner, outer], radius, update, dispose }
}
