import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ─────────────────────────────────────────────────────────────
// КОНСТАНТЫ СЦЕНЫ
// ─────────────────────────────────────────────────────────────
const ORBIT_TILT = 0.05 // Легкий наклон орбит для динамики кадра
const SHADOW_MAP_SIZE = 1024
const STAR_COUNT = 3500
const STAR_BOX = 320 // полуразмер куба, в котором живут звёзды (для бесконечной обёртки)

// Иллюзия полёта системы сквозь космос: система остаётся в центре,
// а звёзды стримятся навстречу, планеты оставляют винтовые следы
const MOTION_SPEED = 5.5 // скорость «полёта» (единиц/сек)

// Наклон всей системы в пространстве: плоскость орбит наклонена, поэтому видна
// как наклонённый диск (эллипсы), а не плоская «тарелка».
const SYSTEM_TILT_X = 0.15
const SYSTEM_TILT_Z = 0.6

// Направление полёта = нормаль плоскости орбит после наклона.
// Поэтому спиральные следы планет идут ПЕРПЕНДИКУЛЯРНО плоскости системы.
const MOTION_DIR = new THREE.Vector3(0, 1, 0)
  .applyEuler(new THREE.Euler(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z, 'XYZ'))
  .normalize()

// Описание планет: тип, радиус, расстояние от центра, скорость по орбите, скорость вращения вокруг оси.
// Дополнительно: axialTilt (наклон оси), atmosphere (fresnel-свечение),
//   moons — естественные спутники, artificial — искусственные аппараты.
// ─── [FEATURE:PLANETS+] добавлены Уран и Нептун ───
const PLANETS = [
  {
    type: 'sun',
    radius: 3.2,
    distance: 0,
    orbitSpeed: 0,
    spinSpeed: 0.0015
  },
  {
    type: 'mercury',
    radius: 0.42,
    distance: 5.8,
    orbitSpeed: 0.015,
    spinSpeed: 0.004
  },
  {
    type: 'venus',
    radius: 0.72,
    distance: 8.0,
    orbitSpeed: 0.012,
    spinSpeed: 0.003,
    atmosphere: { color: 0xffd9a0, intensity: 0.45 },
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Akatsuki', distance: 1.15, orbitSpeed: 0.07, inclination: 0.35 }
    ]
    // ───────────────────────────
  },
  {
    type: 'earth',
    radius: 0.85,
    distance: 11.2,
    orbitSpeed: 0.009,
    spinSpeed: 0.02,
    axialTilt: 0.41,
    atmosphere: { color: 0x5aa9ff, intensity: 0.9 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Луна', radius: 0.23, distance: 1.75, orbitSpeed: 0.03, color: 0xcfcac2 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'МКС', distance: 1.05, orbitSpeed: 0.06, inclination: 0.5 },
      { name: 'Hubble', distance: 1.28, orbitSpeed: 0.05, inclination: 0.22 }
    ]
    // ───────────────────────────
  },
  {
    type: 'mars',
    radius: 0.6,
    distance: 14.5,
    orbitSpeed: 0.007,
    spinSpeed: 0.018,
    axialTilt: 0.44,
    atmosphere: { color: 0xff9a6a, intensity: 0.28 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Фобос', radius: 0.09, distance: 1.05, orbitSpeed: 0.06, color: 0x9a8f82 },
      { name: 'Деймос', radius: 0.07, distance: 1.38, orbitSpeed: 0.045, color: 0x8a8073 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Mars Orbiter', distance: 0.95, orbitSpeed: 0.07, inclination: 0.7 }
    ]
    // ───────────────────────────
  },
  {
    type: 'jupiter',
    radius: 1.65,
    distance: 19.5,
    orbitSpeed: 0.003,
    spinSpeed: 0.03,
    axialTilt: 0.05,
    atmosphere: { color: 0xd8b48a, intensity: 0.35 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Ио', radius: 0.22, distance: 2.7, orbitSpeed: 0.04, color: 0xe8d868 },
      { name: 'Европа', radius: 0.19, distance: 3.2, orbitSpeed: 0.033, color: 0xd9cbb0 },
      { name: 'Ганимед', radius: 0.28, distance: 3.8, orbitSpeed: 0.026, color: 0xa89a86 },
      { name: 'Каллисто', radius: 0.26, distance: 4.4, orbitSpeed: 0.02, color: 0x8a7f70 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [{ name: 'Juno', distance: 2.3, orbitSpeed: 0.05, inclination: 0.9 }]
    // ───────────────────────────
  },
  {
    type: 'saturn',
    radius: 1.3,
    distance: 24.5,
    orbitSpeed: 0.002,
    spinSpeed: 0.025,
    axialTilt: 0.47,
    atmosphere: { color: 0xf0e0b4, intensity: 0.3 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Энцелад', radius: 0.13, distance: 3.5, orbitSpeed: 0.05, color: 0xe8eef0 },
      { name: 'Рея', radius: 0.16, distance: 3.95, orbitSpeed: 0.04, color: 0xc9c4bb },
      { name: 'Титан', radius: 0.28, distance: 4.5, orbitSpeed: 0.03, color: 0xd9a24a }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Cassini', distance: 3.7, orbitSpeed: 0.045, inclination: 0.6 }
    ]
    // ───────────────────────────
  },
  {
    type: 'uranus',
    radius: 1.0,
    distance: 29.0,
    orbitSpeed: 0.0016,
    spinSpeed: 0.028,
    axialTilt: 1.71,
    atmosphere: { color: 0x9fe8e6, intensity: 0.6 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Титания', radius: 0.14, distance: 1.75, orbitSpeed: 0.032, color: 0xbfc3c6 },
      { name: 'Оберон', radius: 0.13, distance: 2.15, orbitSpeed: 0.026, color: 0xa9a29a }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Voyager 2', distance: 1.45, orbitSpeed: 0.05, inclination: 1.2 }
    ]
    // ───────────────────────────
  },
  {
    type: 'neptune',
    radius: 0.97,
    distance: 33.0,
    orbitSpeed: 0.0012,
    spinSpeed: 0.03,
    axialTilt: 0.49,
    atmosphere: { color: 0x4a6bff, intensity: 0.75 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Тритон', radius: 0.16, distance: 1.85, orbitSpeed: 0.028, color: 0xd8ccc0 }
    ]
    // ───────────────────────
  }
]

// 1. НАСТРОЙКА КИНЕМАТОГРАФИЧНОГО РЕНДЕРЕРА
const scene = new THREE.Scene()

// Корневая группа всей солнечной системы: позволяет двигать/наклонять её целиком
const world = new THREE.Group()
world.rotation.set(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z)
scene.add(world)

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

let renderer
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  })
} catch (error) {
  // На устройствах без поддержки WebGL показываем понятное сообщение
  document.body.innerHTML =
    '<p style="color:#fff;font-family:sans-serif;padding:2rem">' +
    'WebGL недоступен в вашем браузере.</p>'
  throw error
}

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

// Настройка экспозиции для глубокого черного космоса и ярких планет
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 2.4
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
// Выставляем ракурс так, чтобы в кадр входила вся система (до пояса Койпера)
camera.position.set(0, 18, 42)
controls.target.set(0, -1, 0)
controls.enableDamping = true
controls.dampingFactor = 0.05
// Ограничиваем движение камеры, чтобы сцену нельзя было «потерять»
controls.minDistance = 5
controls.maxDistance = 200
controls.maxPolarAngle = Math.PI / 2.05

// Мягкая маска для звезд и солнечной короны
const createGlowTexture = () => {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const cx = c.getContext('2d')
  const g = cx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  cx.fillStyle = g
  cx.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}
const glowTexture = createGlowTexture()

// 2. БЕСКОНЕЧНЫЕ ЗВЕЗДЫ, СТРИМЯЩИЕСЯ НАВСТРЕЧУ (создают ощущение полёта системы)
const starsGeometry = new THREE.BufferGeometry()
const starPositions = new Float32Array(STAR_COUNT * 3) // «живые» позиции для рендера
const starBase = new Float32Array(STAR_COUNT * 3) // базовые позиции до сдвига
const starColors = new Float32Array(STAR_COUNT * 3)
const starColor = new THREE.Color()
for (let i = 0; i < STAR_COUNT; i++) {
  const i3 = i * 3
  // Равномерно в кубе — при прокрутке-обёртке небо бесконечное
  starBase[i3] = (Math.random() * 2 - 1) * STAR_BOX
  starBase[i3 + 1] = (Math.random() * 2 - 1) * STAR_BOX
  starBase[i3 + 2] = (Math.random() * 2 - 1) * STAR_BOX
  starPositions[i3] = starBase[i3]
  starPositions[i3 + 1] = starBase[i3 + 1]
  starPositions[i3 + 2] = starBase[i3 + 2]
  // Легкий разброс по температуре: от голубоватых до теплых звезд
  starColor.setHSL(
    0.55 + Math.random() * 0.12,
    0.4,
    0.75 + Math.random() * 0.25
  )
  starColors[i3] = starColor.r
  starColors[i3 + 1] = starColor.g
  starColors[i3 + 2] = starColor.b
}
starsGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(starPositions, 3)
)
starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
const starField = new THREE.Points(
  starsGeometry,
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
scene.add(starField)

// ─────────────────────────────────────────────────────────────
// 3. ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ПЛАНЕТ НА ОСНОВЕ ШУМА
// ─────────────────────────────────────────────────────────────

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// Повышаем контраст относительно середины (0.5)
const contrast = (t, amount) => clamp01((t - 0.5) * amount + 0.5)

// Целочисленный хэш -> псевдослучайное [0, 1)
const hash2 = (x, y, seed) => {
  let h =
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(seed, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Value-noise со сглаживанием, периодичный по X (periodX — в целых клетках)
const valueNoise = (x, y, periodX, seed) => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const wrap = (i) => ((i % periodX) + periodX) % periodX
  const a = hash2(wrap(x0), y0, seed)
  const b = hash2(wrap(x0 + 1), y0, seed)
  const c = hash2(wrap(x0), y0 + 1, seed)
  const d = hash2(wrap(x0 + 1), y0 + 1, seed)
  const ab = a + (b - a) * ux
  const cd = c + (d - c) * ux
  return ab + (cd - ab) * uy
}

// Фрактальный шум (fBm): сумма октав. u, v задаются в диапазоне [0, 1]
const fbm = (u, v, octaves, baseFreq, seed) => {
  let amp = 1
  let freq = baseFreq
  let sum = 0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + o * 131)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

// Палитры: список [позиция, '#hex']
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const gradient = (stops) => stops.map(([pos, hex]) => [pos, hexToRgb(hex)])
const sampleGradient = (stops, t) => {
  t = clamp01(t)
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0 || 1)
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k
      ]
    }
  }
  return stops[stops.length - 1][1]
}

const SUN = gradient([
  [0.0, '#2a0200'],
  [0.3, '#8f1000'],
  [0.55, '#ff5200'],
  [0.78, '#ffb03a'],
  [1.0, '#fff6cf']
])
const MERCURY = gradient([
  [0.0, '#33312d'],
  [0.45, '#6b6862'],
  [1.0, '#b0aca2']
])
const VENUS = gradient([
  [0.0, '#5e3f18'],
  [0.35, '#b3863f'],
  [0.65, '#e2c580'],
  [1.0, '#f8eecb']
])
const OCEAN = gradient([
  [0.0, '#03102b'],
  [0.55, '#0a2a5e'],
  [1.0, '#155a9e']
])
const LAND = gradient([
  [0.0, '#1c4a22'],
  [0.35, '#2f6b2a'],
  [0.55, '#7c6a34'],
  [0.75, '#7a5836'],
  [1.0, '#e6e0d4']
])
const MARS = gradient([
  [0.0, '#45140a'],
  [0.4, '#8f3213'],
  [0.7, '#bd5522'],
  [1.0, '#e29a63']
])
const JUPITER_BANDS = [
  '#5a3a22',
  '#e6d4b0',
  '#7d5636',
  '#f3e9d2',
  '#6a4530',
  '#c9a878',
  '#4e3520',
  '#ecdcc0',
  '#7a5638'
].map(hexToRgb)
const SATURN_BANDS = [
  '#b9975f',
  '#f0e0b4',
  '#a17f4e',
  '#f6ecd0',
  '#b09063',
  '#8f7040',
  '#ecd9b4'
].map(hexToRgb)
// ─── [FEATURE:PLANETS+] палитры Урана и Нептуна ───
const URANUS_BANDS = [
  '#8fd8d6',
  '#bff0ee',
  '#7fc6c6',
  '#d8f7f5',
  '#9adcd8',
  '#bfe9e6'
].map(hexToRgb)
const NEPTUNE_BANDS = [
  '#1b3a8f',
  '#2a56c8',
  '#1a2f7a',
  '#3f74e0',
  '#223f9e',
  '#4a6fd6'
].map(hexToRgb)
// ────────────────────────────────────────────────

// Пересчёт каждого пикселя текстуры по функции-шейдеру
const paintPixels = (ctx, shader) => {
  const { width, height } = ctx.canvas
  const image = ctx.createImageData(width, height)
  const data = image.data
  let i = 0
  for (let y = 0; y < height; y++) {
    const v = y / height
    for (let x = 0; x < width; x++) {
      shader(x / width, v, data, i)
      i += 4
    }
  }
  ctx.putImageData(image, 0, 0)
}

const sunShader = (u, v, data, i) => {
  const granulation = fbm(u, v, 6, 16, 101)
  const large = fbm(u, v, 3, 4, 137)
  const [r, g, b] = sampleGradient(
    SUN,
    contrast(granulation * 0.62 + large * 0.38, 1.9)
  )
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = 255
}

const mercuryShader = (u, v, data, i) => {
  const basins = fbm(u, v, 5, 5, 151)
  const craters = fbm(u, v, 4, 26, 181)
  const t = contrast(basins * 0.55 + craters * 0.45, 1.5)
  const [r, g, b] = sampleGradient(MERCURY, t)
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = 255
}

const venusShader = (u, v, data, i) => {
  // Растягиваем шум по вертикали -> горизонтальные вихри облаков
  const swirl = fbm(u, v * 2.4, 6, 5, 211)
  const detail = fbm(u, v * 3.0, 4, 12, 233)
  const [r, g, b] = sampleGradient(
    VENUS,
    contrast(swirl * 0.7 + detail * 0.3, 1.5)
  )
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = 255
}

const earthShader = (u, v, data, i) => {
  const height = fbm(u, v, 6, 5, 301)
  const seaLevel = 0.57
  let r
  let g
  let b
  if (height < seaLevel) {
    ;[r, g, b] = sampleGradient(OCEAN, height / seaLevel)
  } else {
    ;[r, g, b] = sampleGradient(
      LAND,
      contrast((height - seaLevel) / (1 - seaLevel), 1.3)
    )
  }
  // Полярные ледяные шапки
  const ice = Math.max(smoothstep(0.09, 0, v), smoothstep(0.91, 1, v)) * 0.9
  if (ice > 0) {
    r += (236 - r) * ice
    g += (242 - g) * ice
    b += (248 - b) * ice
  }
  // Облачный слой (растянут по вертикали -> атмосферные полосы)
  const clouds = fbm(u, v * 1.7, 5, 10, 333)
  const cloud = smoothstep(0.58, 0.84, clouds) * 0.78
  r += (255 - r) * cloud
  g += (255 - g) * cloud
  b += (255 - b) * cloud
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = 255
}

const marsShader = (u, v, data, i) => {
  const height = fbm(u, v, 6, 6, 401)
  const detail = fbm(u, v, 4, 20, 421)
  const [r0, g0, b0] = sampleGradient(
    MARS,
    contrast(height * 0.7 + detail * 0.3, 1.4)
  )
  let r = r0
  let g = g0
  let b = b0
  // Небольшие полярные шапки
  const ice = Math.max(smoothstep(0.05, 0, v), smoothstep(0.95, 1, v)) * 0.85
  r += (230 - r) * ice
  g += (235 - g) * ice
  b += (240 - b) * ice
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = 255
}

// Газовые гиганты: полосы, искажённые турбулентностью
const makeBandedShader =
  (
    bands,
    { warpSeed, warpAmount, smoothLo, streakSeed, streakAmount, polarDarken }
  ) =>
  (u, v, data, i) => {
    // Медленный крупный изгиб полос + мелкая турбулентность
    const warp =
      (fbm(u, v, 4, 4, warpSeed) - 0.5) * warpAmount +
      (fbm(u, v, 4, 10, warpSeed + 17) - 0.5) * warpAmount * 0.5
    const band = (v + warp) * bands.length
    const bi = Math.floor(band)
    const bt = band - bi
    const n = bands.length
    const c0 = bands[((bi % n) + n) % n]
    const c1 = bands[(((bi + 1) % n) + n) % n]
    // Узкая зона перехода -> более чёткие границы полос
    const k = smoothstep(smoothLo, 1, bt)
    let r = c0[0] + (c1[0] - c0[0]) * k
    let g = c0[1] + (c1[1] - c0[1]) * k
    let b = c0[2] + (c1[2] - c0[2]) * k
    // Зональные потоки: шум, растянутый по горизонтали внутри полос
    const streak = fbm(u, v * 6, 4, 16, streakSeed)
    const shade = 1 - streakAmount + streak * streakAmount * 2
    r *= shade
    g *= shade
    b *= shade
    // Затемнение к полюсам
    const polar = smoothstep(0.12, 0, v) + smoothstep(0.88, 1, v)
    const dark = 1 - polar * polarDarken
    data[i] = r * dark
    data[i + 1] = g * dark
    data[i + 2] = b * dark
    data[i + 3] = 255
  }

const jupiterShader = makeBandedShader(JUPITER_BANDS, {
  warpSeed: 61,
  warpAmount: 0.045,
  smoothLo: 0.88,
  streakSeed: 77,
  streakAmount: 0.16,
  polarDarken: 0.32
})
const saturnShader = makeBandedShader(SATURN_BANDS, {
  warpSeed: 83,
  warpAmount: 0.03,
  smoothLo: 0.9,
  streakSeed: 97,
  streakAmount: 0.1,
  polarDarken: 0.26
})
// ─── [FEATURE:PLANETS+] Уран почти без полос, Нептун — глубокий синий с потоками ───
const uranusShader = makeBandedShader(URANUS_BANDS, {
  warpSeed: 111,
  warpAmount: 0.02,
  smoothLo: 0.92,
  streakSeed: 127,
  streakAmount: 0.06,
  polarDarken: 0.16
})
const neptuneShader = makeBandedShader(NEPTUNE_BANDS, {
  warpSeed: 141,
  warpAmount: 0.05,
  smoothLo: 0.88,
  streakSeed: 157,
  streakAmount: 0.12,
  polarDarken: 0.28
})
// ─────────────────────────────────────────────────────────────────────────────────

// Большое Красное Пятно Юпитера
const drawGreatRedSpot = (ctx) => {
  const { width, height } = ctx.canvas
  const cx = width * 0.3
  const cy = height * 0.63
  const rx = width * 0.075
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, 0.55)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, 'rgba(190, 72, 42, 0.95)')
  g.addColorStop(0.6, 'rgba(150, 55, 35, 0.65)')
  g.addColorStop(1, 'rgba(150, 60, 40, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const SHADERS = {
  sun: sunShader,
  mercury: mercuryShader,
  venus: venusShader,
  earth: earthShader,
  mars: marsShader,
  jupiter: jupiterShader,
  saturn: saturnShader,
  uranus: uranusShader,
  neptune: neptuneShader
}
const OVERLAYS = { jupiter: drawGreatRedSpot }

// Текстуры генерируются один раз на тип и переиспользуются
const textureCache = new Map()

// Разрешение текстуры зависит от размера планеты (экономит время генерации)
const textureSize = (radius) => (radius >= 3 ? 1024 : radius >= 1.2 ? 768 : 512)

function createProPlanetTexture(type, size) {
  const key = type + '@' + size
  if (textureCache.has(key)) return textureCache.get(key)

  const shader = SHADERS[type]
  if (!shader) throw new Error('Неизвестный тип планеты: ' + type)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size / 2
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('Не удалось создать 2D-контекст для текстуры планеты')

  paintPixels(ctx, shader)
  if (OVERLAYS[type]) OVERLAYS[type](ctx)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  textureCache.set(key, texture)
  return texture
}

// 3.5 ФОНОВАЯ ТУМАННОСТЬ (куполом вокруг всей сцены)
const NEBULA_HUE = gradient([
  [0.0, '#0d2b3a'],
  [0.4, '#2a1a52'],
  [0.7, '#5a2a66'],
  [1.0, '#a24f86']
])

const nebulaShader = (u, v, data, i) => {
  const base = fbm(u, v, 5, 3, 901)
  const ridge = 1 - Math.abs(2 * base - 1) // «гребни» дают волокнистые облака
  const detail = fbm(u, v, 4, 7, 937)
  const density = Math.pow(clamp01(ridge * 0.65 + detail * 0.35), 2.4)
  const [cr, cg, cb] = sampleGradient(NEBULA_HUE, fbm(u, v, 3, 2, 971))
  data[i] = cr * density
  data[i + 1] = cg * density
  data[i + 2] = cb * density
  data[i + 3] = 255
}

const createNebulaTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось создать контекст для туманности')
  paintPixels(ctx, nebulaShader)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const nebula = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 32),
  new THREE.MeshBasicMaterial({
    map: createNebulaTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  })
)
nebula.renderOrder = -1
scene.add(nebula)

// 4. СВЕТОВАЯ СХЕМА С КИНЕМАТОГРАФИЧНЫМ БЛИКОМ
const ambientLight = new THREE.AmbientLight(0x1a1a24, 2.0) // Космическая мягкая подсветка теней
scene.add(ambientLight)

// Освещение от Солнца. decay = 1 дает мягкое затухание,
// чтобы дальние планеты (Юпитер, Сатурн) не оставались черными
const sunLight = new THREE.PointLight(0xfff3db, 30, 400)
sunLight.decay = 1
sunLight.castShadow = true
sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE
sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE
world.add(sunLight)

// Дополнительный направленный свет под углом для красивого блика на краях сфер
const rimLight = new THREE.DirectionalLight(0x6688ff, 0.6)
rimLight.position.set(10, 20, 10)
world.add(rimLight)

// ОГНЕННЫЙ ОРЕОЛ СВЕЧЕНИЯ СОЛНЦА
// transparent + depthWrite:false убирают видимые границы квадрата вокруг спрайта
const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    blending: THREE.AdditiveBlending,
    color: 0xff8800,
    transparent: true,
    depthWrite: false
  })
)
sunGlow.scale.set(10.5, 10.5, 1)

// 5. ГЕНЕРАЦИЯ МИРОВ И ТОНКИХ ЛИНИЙ ОРБИТ
const planets = []

// ─── Вспомогательные билдеры тел: спутники, аппараты, кольца, атмосферы ───

// Тонкое светящееся кольцо орбиты (для спутников и аппаратов), лежит в плоскости XZ
const createOrbitRing = (radius, color, opacity) => {
  const points = []
  for (let i = 0; i <= 96; i++) {
    const theta = (i / 96) * Math.PI * 2
    points.push(
      new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius)
    )
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
}

// ─── [FEATURE:ATMOSPHERE] fresnel-свечение оболочки планеты ───
const createAtmosphere = (radius, color, intensity) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) },
      uIntensity: { value: intensity }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  })
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 48, 48), material)
}
// ───────────────────────────────────────────────────────────────

// ─── [FEATURE:RINGS] кольца Сатурна: несколько полос + щели между ними ───
const createSaturnRings = (radius) => {
  const group = new THREE.Group()
  const bands = [
    { inner: 1.25, outer: 1.55, opacity: 0.55, color: 0xcbb083 },
    { inner: 1.6, outer: 1.95, opacity: 0.32, color: 0xb89a6a },
    { inner: 2.0, outer: 2.32, opacity: 0.5, color: 0xd8c39a },
    { inner: 2.36, outer: 2.5, opacity: 0.26, color: 0xa88d67 }
  ]
  bands.forEach((b) => {
    const geo = new THREE.RingGeometry(
      radius * b.inner,
      radius * b.outer,
      96
    ).rotateX(-Math.PI / 2)
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: b.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: b.opacity,
        roughness: 0.9,
        metalness: 0.0
      })
    )
    ring.receiveShadow = true
    group.add(ring)
  })
  return group
}
// ──────────────────────────────────────────────────────────────────────────

// ─── [FEATURE:MOONS] естественный спутник планеты ───
const buildMoon = (moon) => {
  const orbit = new THREE.Object3D()
  orbit.rotation.x = (Math.random() - 0.5) * 0.35 // лёгкий наклон плоскости спутника
  orbit.rotation.z = (Math.random() - 0.5) * 0.2

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(moon.radius, 2),
    new THREE.MeshStandardMaterial({
      color: moon.color,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true
    })
  )
  mesh.position.x = moon.distance
  mesh.castShadow = true
  mesh.receiveShadow = true
  orbit.add(mesh)
  orbit.add(createOrbitRing(moon.distance, 0x8fa6ff, 0.07))
  return { orbit, mesh, speed: moon.orbitSpeed }
}
// ────────────────────────────────────────────────────

// ─── [FEATURE:SATELLITES] искусственный аппарат: корпус + панели + антенна + маяк ───
const buildSatellite = (scale) => {
  const group = new THREE.Object3D()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.9 })
  )
  group.add(body)

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x24427f,
    roughness: 0.3,
    metalness: 0.6,
    emissive: 0x14306a,
    emissiveIntensity: 0.7
  })
  const panelGeo = new THREE.BoxGeometry(0.26, 0.012, 0.18)
  const left = new THREE.Mesh(panelGeo, panelMat)
  left.position.x = -0.24
  const right = new THREE.Mesh(panelGeo, panelMat)
  right.position.x = 0.24
  group.add(left)
  group.add(right)

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xe3e7ec, roughness: 0.4, metalness: 0.7 })
  )
  dish.rotation.x = Math.PI / 2
  dish.position.set(0, 0.1, 0.03)
  group.add(dish)

  // Мигающий маяк — его прозрачность анимируется в игровом цикле
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xff4040,
    transparent: true,
    toneMapped: false
  })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), beaconMat)
  beacon.position.set(0, -0.1, 0)
  group.add(beacon)

  group.scale.setScalar(scale)
  return { group, beaconMat }
}
// ─────────────────────────────────────────────────────────────────────────────────

const createPlanet = (config) => {
  const { type, radius, distance, orbitSpeed, spinSpeed, axialTilt, moons, artificial } =
    config

  // Группа вращается вокруг Y — вместе с ней движется планета и её орбита
  const orbitGroup = new THREE.Object3D()
  orbitGroup.rotation.x = ORBIT_TILT
  world.add(orbitGroup)

  // Тонкая нить орбиты лежит в той же плоскости, что и траектория планеты
  if (distance > 0) {
    const points = []
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2
      points.push(
        new THREE.Vector3(
          Math.cos(theta) * distance,
          0,
          Math.sin(theta) * distance
        )
      )
    }
    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12
      })
    )
    orbitGroup.add(orbitLine)
  }

  // Точка планеты: к ней крепятся спутники и аппараты —
  // они НЕ наследуют наклон оси самой планеты
  const holder = new THREE.Object3D()
  holder.position.x = distance
  orbitGroup.add(holder)

  // Наклон оси: внутри живёт сама планета, её атмосфера и кольца
  const tiltGroup = new THREE.Object3D()
  if (axialTilt) tiltGroup.rotation.z = axialTilt
  holder.add(tiltGroup)

  const texture = createProPlanetTexture(type, textureSize(radius))
  const material =
    type === 'sun'
      ? new THREE.MeshBasicMaterial({ map: texture })
      : new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.65,
          metalness: 0.05
        })

  // Мелким планетам достаточно меньшего числа сегментов
  const segments = radius < 1 ? 32 : 64
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, segments),
    material
  )
  if (type !== 'sun') {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  tiltGroup.add(mesh)

  // ─── [FEATURE:ATMOSPHERE] ───
  if (config.atmosphere) {
    tiltGroup.add(
      createAtmosphere(
        radius,
        config.atmosphere.color,
        config.atmosphere.intensity
      )
    )
  }

  // ─── [FEATURE:RINGS] ───
  if (type === 'saturn') {
    tiltGroup.add(createSaturnRings(radius))
  }

  // ─── [FEATURE:MOONS] ───
  const moonRigs = []
  if (moons) {
    moons.forEach((m) => {
      const rig = buildMoon(m)
      holder.add(rig.orbit)
      moonRigs.push(rig)
    })
  }

  // ─── [FEATURE:SATELLITES] ───
  const satRigs = []
  if (artificial) {
    artificial.forEach((s) => {
      const orbit = new THREE.Object3D()
      orbit.rotation.x = s.inclination || 0
      orbit.rotation.z = (Math.random() - 0.5) * 0.25
      holder.add(orbit)

      const scale = Math.max(0.3, Math.min(0.7, radius * 0.5))
      const sat = buildSatellite(scale)
      sat.group.position.x = s.distance
      orbit.add(sat.group)
      orbit.add(createOrbitRing(s.distance, 0x66ffcc, 0.16))
      satRigs.push({ orbit, speed: s.orbitSpeed, satellite: sat })
    })
  }

  planets.push({ mesh, orbitGroup, holder, orbitSpeed, spinSpeed, moonRigs, satRigs })
  return mesh
}

let sunMesh = null
PLANETS.forEach((config) => {
  const mesh = createPlanet(config)
  if (config.type === 'sun') sunMesh = mesh
})

// Ореол привязываем к Солнцу, чтобы он двигался вместе с ним
if (sunMesh) sunMesh.add(sunGlow)

// 5.7 ПОЯСА МАЛЫХ ТЕЛ: астероиды (между Марсом и Юпитером) и пояс Койпера
// ─── [FEATURE:BELTS] ───
const makeBelt = ({
  count,
  inner,
  outer,
  ySpread,
  scaleMin,
  scaleMax,
  speedMin,
  speedMax,
  color
}) => {
  const group = new THREE.Group()
  group.rotation.x = ORBIT_TILT
  world.add(group)

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

const updateBelt = (belt, timeScale) => {
  const d = belt.dummy
  for (let i = 0; i < belt.items.length; i++) {
    const a = belt.items[i]
    a.angle += a.speed * timeScale
    d.position.set(
      Math.cos(a.angle) * a.radius,
      a.y,
      Math.sin(a.angle) * a.radius
    )
    d.rotation.set(a.rx + a.angle, a.angle * 1.5, a.rz)
    d.scale.setScalar(a.scale)
    d.updateMatrix()
    belt.inst.setMatrixAt(i, d.matrix)
  }
  belt.inst.instanceMatrix.needsUpdate = true
}

// Главный пояс астероидов (между Марсом 14.5 и Юпитером 19.5)
const asteroidBelt = makeBelt({
  count: 700,
  inner: 16.0,
  outer: 18.6,
  ySpread: 0.6,
  scaleMin: 0.03,
  scaleMax: 0.12,
  speedMin: 0.004,
  speedMax: 0.008,
  color: 0x8a8175
})

// Пояс Койпера (за Нептуном) — ледяной «мусор»
const kuiperBelt = makeBelt({
  count: 500,
  inner: 37,
  outer: 45,
  ySpread: 1.6,
  scaleMin: 0.04,
  scaleMax: 0.14,
  speedMin: 0.0012,
  speedMax: 0.0024,
  color: 0x7f8fa0
})
// ──────────────────────

// 5.5 ВИНТОВЫЕ СЛЕДЫ ПЛАНЕТ (спирали, как на референсе solar.jpg)
// След строится аналитически: берём орбиту планеты за прошедшее время («выдержка»)
// и сдвигаем точки против направления полёта -> получается винтовая (спиральная) кривая.
const TRAIL_TIME = 16 // «выдержка» следа в секундах
const TRAIL_POINTS = 256 // число точек на след

const trailColors = {
  sun: 0xffb347,
  mercury: 0x9fa4ad,
  venus: 0xe8c98a,
  earth: 0x5aa9ff,
  mars: 0xff7a4a,
  jupiter: 0xd8b48a,
  saturn: 0xe6d3a6,
  uranus: 0x9fe8e6,
  neptune: 0x4a6bff
}

const createTrailLine = (color) => {
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

// Следы для всех тел (Солнце — прямая золотая нить, планеты — спирали)
const trailBodies = planets.map((p, i) => {
  const cfg = PLANETS[i]
  return {
    orbitGroup: p.orbitGroup,
    distance: cfg.distance,
    omega: cfg.orbitSpeed * 60, // угловая скорость, рад/сек
    trail: createTrailLine(trailColors[cfg.type])
  }
})

const trailEuler = new THREE.Euler()
const systemTilt = new THREE.Euler(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z, 'XYZ')
const trailVec = new THREE.Vector3()
const updateTrails = () => {
  trailBodies.forEach((b) => {
    const theta0 = b.orbitGroup.rotation.y
    const t = b.trail
    for (let k = 0; k < TRAIL_POINTS; k++) {
      const rel = k / (TRAIL_POINTS - 1) // 0 у планеты -> 1 на дальнем конце
      const age = rel * TRAIL_TIME
      // Положение планеты в прошлом: орбита в группе + наклон всей системы
      trailEuler.set(ORBIT_TILT, theta0 - b.omega * age, 0, 'XYZ')
      trailVec
        .set(b.distance, 0, 0)
        .applyEuler(trailEuler)
        .applyEuler(systemTilt)
      // Смещение назад — как если бы система всё это время летела вперёд
      trailVec.addScaledVector(MOTION_DIR, -MOTION_SPEED * age)
      t.positions[k * 3] = trailVec.x
      t.positions[k * 3 + 1] = trailVec.y
      t.positions[k * 3 + 2] = trailVec.z
      const f = 1 - rel // у планеты ярко, к хвосту затухает
      t.colors[k * 3] = t.base.r * f
      t.colors[k * 3 + 1] = t.base.g * f
      t.colors[k * 3 + 2] = t.base.b * f
    }
    t.geometry.setDrawRange(0, TRAIL_POINTS)
    t.geometry.attributes.position.needsUpdate = true
    t.geometry.attributes.color.needsUpdate = true
  })
}

// 6. ИГРОВОЙ ЦИКЛ (АНИМАЦИЯ)
const clock = new THREE.Clock()
let starTravel = 0

function animate() {
  requestAnimationFrame(animate)

  // Прирост за кадр умножаем на delta, чтобы скорость не зависела от FPS
  const delta = clock.getDelta()
  const timeScale = delta * 60
  const elapsed = clock.elapsedTime

  planets.forEach((p) => {
    p.orbitGroup.rotation.y += p.orbitSpeed * timeScale // Вращение по орбитам
    p.mesh.rotation.y += p.spinSpeed * timeScale // Вращение вокруг своей оси

    // ─── [FEATURE:MOONS] спутники кружатся вокруг своей планеты ───
    p.moonRigs.forEach((m) => {
      m.orbit.rotation.y += m.speed * timeScale
    })

    // ─── [FEATURE:SATELLITES] аппараты + мигающий маяк ───
    p.satRigs.forEach((s, i) => {
      s.orbit.rotation.y += s.speed * timeScale
      s.satellite.group.rotation.y += 0.6 * timeScale
      s.satellite.beaconMat.opacity =
        0.15 + 0.85 * Math.abs(Math.sin(elapsed * 3 + i))
    })
  })

  // ─── [FEATURE:BELTS] движение малых тел по поясам ───
  updateBelt(asteroidBelt, timeScale)
  updateBelt(kuiperBelt, timeScale)

  // Полёт сквозь космос: звёзды стримятся навстречу, оборачиваясь в кубе (бесконечное небо)
  starTravel += MOTION_SPEED * delta
  const period = STAR_BOX * 2
  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3
    starPositions[i3] = wrapBox(
      starBase[i3] - MOTION_DIR.x * starTravel,
      period
    )
    starPositions[i3 + 1] = wrapBox(
      starBase[i3 + 1] - MOTION_DIR.y * starTravel,
      period
    )
    starPositions[i3 + 2] = wrapBox(
      starBase[i3 + 2] - MOTION_DIR.z * starTravel,
      period
    )
  }
  starsGeometry.attributes.position.needsUpdate = true

  // Винтовые следы
  updateTrails()

  controls.update()
  renderer.render(scene, camera)
}
animate()

// Обёртка координаты в диапазоне [-period/2, period/2) — для бесконечного неба
function wrapBox(v, period) {
  return -period / 2 + ((((v + period / 2) % period) + period) % period)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})
