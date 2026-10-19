import * as THREE from 'three'
import {
  clamp01,
  smoothstep,
  contrast,
  fbm,
  gradient,
  sampleGradient,
  paintPixels,
  hash2,
  hexToRgb
} from './noise.js'

// ─────────────────────────────────────────────────────────────
// ПРОЦЕДУРНЫЕ ТЕКСТУРЫ (планеты, туманность, мягкое свечение)
// Всё считается на CPU в обычный <canvas> — без внешних ассетов.
// ─────────────────────────────────────────────────────────────

// ── Палитры планет ──
// Тёплая «кипящая» фотосфера: от тёмно-бурого в гранулах до почти белого ядра
const SUN = gradient([
  [0.0, '#2e0700'],
  [0.22, '#a12a00'],
  [0.45, '#ff6a12'],
  [0.66, '#ffb02f'],
  [0.84, '#ffe487'],
  [1.0, '#fffdf2']
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

// ── Шейдеры планет (пиксельные функции) ──
// Фотосфера: мелкая грануляция + крупные «ячейки» + яркие факелы вокруг пятен
const sunShader = (u, v, data, i) => {
  const granulation = fbm(u, v, 7, 22, 101)
  const cells = fbm(u, v, 4, 6, 137)
  const faculae = fbm(u, v, 5, 9, 173)
  let t = contrast(granulation * 0.5 + cells * 0.5, 2.2)
  // Факелы (яркая сеть) — подмешиваем светлые горячие участки
  t = clamp01(t + Math.pow(clamp01((faculae - 0.5) * 1.6 + 0.5), 3) * 0.22)
  const [r, g, b] = sampleGradient(SUN, t)
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
  const ice = Math.max(smoothstep(0.09, 0, v), smoothstep(0.91, 1, v)) * 0.9
  if (ice > 0) {
    r += (236 - r) * ice
    g += (242 - g) * ice
    b += (248 - b) * ice
  }
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
    const warp =
      (fbm(u, v, 4, 4, warpSeed) - 0.5) * warpAmount +
      (fbm(u, v, 4, 10, warpSeed + 17) - 0.5) * warpAmount * 0.5
    const band = (v + warp) * bands.length
    const bi = Math.floor(band)
    const bt = band - bi
    const n = bands.length
    const c0 = bands[((bi % n) + n) % n]
    const c1 = bands[(((bi + 1) % n) + n) % n]
    const k = smoothstep(smoothLo, 1, bt)
    let r = c0[0] + (c1[0] - c0[0]) * k
    let g = c0[1] + (c1[1] - c0[1]) * k
    let b = c0[2] + (c1[2] - c0[2]) * k
    const streak = fbm(u, v * 6, 4, 16, streakSeed)
    const shade = 1 - streakAmount + streak * streakAmount * 2
    r *= shade
    g *= shade
    b *= shade
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
// ─── [FEATURE:PLANETS+] Уран почти без полос, Нептун — глубокий синий ───
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

// ── Оверлеи поверх готовой текстуры ──
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

// ─── [FEATURE:SUN] солнечные пятна: тёмная умбра + мягкая полутень (пенумбра) ───
const drawSunspots = (ctx) => {
  const { width, height } = ctx.canvas
  // Группы пятен: [x, y, radius] в долях текстуры
  const spots = [
    [0.17, 0.43, 0.026],
    [0.205, 0.49, 0.014],
    [0.23, 0.4, 0.009],
    [0.61, 0.35, 0.02],
    [0.645, 0.42, 0.012],
    [0.44, 0.67, 0.019],
    [0.475, 0.6, 0.01],
    [0.84, 0.54, 0.016],
    [0.87, 0.6, 0.008]
  ]
  ctx.save()
  spots.forEach(([px, py, pr]) => {
    const cx = width * px
    const cy = height * py
    const r = width * pr
    // Полутень (широкая, слабая)
    const pen = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r)
    pen.addColorStop(0, 'rgba(96, 30, 0, 0.55)')
    pen.addColorStop(0.7, 'rgba(120, 50, 0, 0.28)')
    pen.addColorStop(1, 'rgba(140, 70, 10, 0)')
    ctx.fillStyle = pen
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()
    // Умбра (тёмное ядро)
    const umb = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.45)
    umb.addColorStop(0, 'rgba(28, 6, 0, 0.92)')
    umb.addColorStop(0.6, 'rgba(58, 14, 0, 0.7)')
    umb.addColorStop(1, 'rgba(70, 20, 0, 0)')
    ctx.fillStyle = umb
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 0.45, r * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()
  })
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
const OVERLAYS = { jupiter: drawGreatRedSpot, sun: drawSunspots }

// Текстуры генерируются один раз на тип и переиспользуются
const textureCache = new Map()

// Разрешение текстуры зависит от размера планеты (экономит время генерации)
export const textureSize = (radius) =>
  radius >= 3 ? 1024 : radius >= 1.2 ? 768 : 512

export function createProPlanetTexture(type, size) {
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

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:NEBULA] туманность: галактическая полоса + волокна + ядра ───
// ─────────────────────────────────────────────────────────────
const NEBULA_HUE = gradient([
  [0.0, '#06182b'],
  [0.22, '#0f3f63'],
  [0.42, '#3a2a6e'],
  [0.62, '#7b3f86'],
  [0.82, '#c25a8f'],
  [1.0, '#ffb27a']
])

const nebulaShader = (u, v, data, i) => {
  // Галактическая полоса: диагональная, изогнутая низкочастотным шумом
  const warp = (fbm(u, v, 3, 2, 1101) - 0.5) * 0.5
  const bandY = 0.5 + Math.sin(u * Math.PI * 2) * 0.16
  const d = v - (bandY + warp)
  const band = Math.exp(-(d * d) / (2 * 0.07 * 0.07))

  // Волокнистые облака (гребневой шум)
  const base = fbm(u, v, 5, 3, 901)
  const ridge = 1 - Math.abs(2 * base - 1)
  const detail = fbm(u, v, 4, 7, 937)
  const density = Math.pow(clamp01(ridge * 0.6 + detail * 0.4), 2.7)

  // Яркие ядра
  const coreSrc = fbm(u, v, 4, 5, 1013)
  const core = Math.pow(clamp01((coreSrc - 0.5) * 2.2), 3)

  // Оттенок: низкочастотный шум + сдвиг к тёплым тонам внутри полосы
  const hue = clamp01(fbm(u, v, 3, 2, 971) * 0.75 + band * 0.45)
  const [cr, cg, cb] = sampleGradient(NEBULA_HUE, hue)

  // Немного «темноты»: слабые участки почти чёрные, яркие — контрастные
  let k = density * (0.32 + band * 1.2) + core * (0.26 + band * 0.9)

  // Вкраплённые далёкие звёзды прямо в туманности
  const s = hash2(Math.floor(u * 700), Math.floor(v * 700), 2003)
  const star = s > 0.9965 ? (s - 0.9965) / 0.0035 : 0

  data[i] = Math.min(255, cr * k + star * 255)
  data[i + 1] = Math.min(255, cg * k + star * 235)
  data[i + 2] = Math.min(255, cb * k + star * 255)
  data[i + 3] = 255
}

export const createNebulaTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 640
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось создать контекст для туманности')
  paintPixels(ctx, nebulaShader)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ── Мягкая маска-градиент (для звёзд, свечения Солнца, комет) ──
// ── Мягкая маска-градиент (для свечения Солнца, комет, Теслы) ──
export const createGlowTexture = (size = 64) => {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  const r = size / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ─── [FEATURE:STARS] отдельная маска для звёзд ───
// Компактное яркое ядро, гаснущее задолго до края квада. Раньше звёзды
// использовали «широкую» маску-ореол, из-за чего при увеличении читались
// как заблюренные квадраты — теперь ядро маленькое и круглое.
export const createStarTexture = () => {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  const r = size / 2
  const g = ctx.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.06, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.36, 'rgba(255,255,255,0.12)')
  g.addColorStop(0.6, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  // ВАЖНО: без мипмапов. Звёзды галактики и неба — это точки в 2–4 px;
  // с мипмапами GPU выбирает уровень, где весь градиент усреднён, и звезда
  // превращается в серый полупрозрачный квадрат. Линейный фильтр без
  // мипмапов оставляет её круглой с ярким центром.
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

// Единые экземпляры масок на всё приложение
export const glowTexture = createGlowTexture()
export const starTexture = createStarTexture()
