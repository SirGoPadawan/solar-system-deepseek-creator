import * as THREE from 'three'
import { GALAXY } from './config.js'
import { starTexture, glowTexture } from './textures.js'
import { createBlackHole } from './blackhole.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:STARGLOW] круглые светящиеся маски звёзд ───
//
// Почему маски рисуются отдельно для галактики:
//   1. PointsMaterial берёт АЛЬФУ из текстуры, а RGB умножает на цвет
//      вершины. Значит форма точки = круглая маска, а цвет — из буфера.
//   2. Мипмапы здесь вредят: точка на экране 2–4 px, а текстура 64 px,
//      поэтому GPU выбирает верхний мип-уровень — там весь градиент уже
//      усреднён в ровный полупрозрачный квадрат. Именно из-за этого звёзды
//      выглядели «серыми квадратами». Отключаем mipmaps и оставляем
//      линейную фильтрацию — точка остаётся круглой и с ярким центром.
//   3. `size` в three умножается на devicePixelRatio (`uniforms.size =
//      material.size * pixelRatio`), поэтому на retina 2.0 = 4 физических
//      пикселя. Отсюда же и «квадратность» вблизи.
// ─────────────────────────────────────────────────────────────
const makeRadialTexture = (stops, size = 64) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const r = size / 2
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r)
  stops.forEach(([at, alpha]) => grad.addColorStop(at, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false      // ← главный фикс «серых квадратов»
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

// Маски создаём лениво (и только в браузере): смоук-тесты гоняют этот файл
// на Node без canvas — там просто берём общие текстуры.
let starMaps = null
const getStarMaps = () => {
  if (starMaps) return starMaps
  if (typeof document === 'undefined') {
    starMaps = { star: starTexture, halo: glowTexture }
    return starMaps
  }
  starMaps = {
    // ядро звезды: белый центр, короткая «юбка», полностью прозрачные углы
    star: makeRadialTexture([
      [0, 1], [0.1, 1], [0.25, 0.55], [0.45, 0.16], [0.72, 0.03], [1, 0]
    ]),
    // ореол: широкое мягкое пятно для слоя свечения
    halo: makeRadialTexture([
      [0, 0.85], [0.2, 0.45], [0.45, 0.14], [0.75, 0.03], [1, 0]
    ])
  }
  return starMaps
}

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:GALAXY] спиральная галактика «Млечный Путь» ───
//
// Генерация — отдельная «чистая» функция `generateGalaxyPoints`
// (только математика и массивы, никаких THREE-объектов).
// `createGalaxy` собирает из неё THREE.Points (+ слой пыли + свечение ядра).
//
// Что воспроизводим у Млечного Пути:
//   • **мы внутри диска**, а не в ядре — галактика смещена так, чтобы
//     Солнечная система лежала в плоскости диска (см. `distance`);
//   • центральный **бар + балдж** (Млечный Путь — с баром);
//   • **2 главных рукава + 2 второстепенных** (разные вес и ширина);
//   • **голубые горячие звёзды и розовые области HII** кучками в рукавах;
//   • **тёмные пылевые полосы** по внутреннему краю рукавов.
//
// Вся геометрия — один BufferGeometry, рисуется одним вызовом, поэтому
// даже 100k звёзд почти ничего не стоят.
// ─────────────────────────────────────────────────────────────

// Палитры: ядро → середина рукава → конец рукава → молодые звёзды → HII → балдж
export const GALAXY_PRESETS = [
  {
    name: 'Млечный Путь',
    coreColor: 0xffe0a0,
    midColor: 0x9dc4ff,
    armColor: 0x5a86ff,
    youngColor: 0xeaf4ff,
    hiiColor: 0xff5f9e,
    bulgeColor: 0xffc072
  },
  {
    name: 'Ледяная',
    coreColor: 0xe8f2ff,
    midColor: 0x9fd8ff,
    armColor: 0x3f6fe0,
    youngColor: 0xf4faff,
    hiiColor: 0x7f9bff,
    bulgeColor: 0xcfe4ff
  },
  {
    name: 'Розовая',
    coreColor: 0xffe3c8,
    midColor: 0xff9ad0,
    armColor: 0x9b2bd6,
    youngColor: 0xffeaf6,
    hiiColor: 0xff4f8f,
    bulgeColor: 0xffb0d8
  },
  {
    name: 'Изумруд',
    coreColor: 0xf2fff8,
    midColor: 0x8fffd6,
    armColor: 0x1f9f7a,
    youngColor: 0xeafff5,
    hiiColor: 0xff6fd0,
    bulgeColor: 0xa8ffe0
  },
  {
    name: 'Уголёк',
    coreColor: 0xffd9a0,
    midColor: 0xff8a4a,
    armColor: 0xa02020,
    youngColor: 0xfff0d8,
    hiiColor: 0xff3a2a,
    bulgeColor: 0xffb060
  }
]

// Изолированная функция генерации звёздного скопления.
// Принимает только числа и цвета, возвращает типизированные массивы —
// её можно вызывать и отдельно от THREE.
//
//   branches        — число рукавов (чётные — главные, нечётные — второстепенные)
//   radius          — внешний радиус диска
//   innerRadius     — где начинаются рукава
//   spin            — закручивание (сколько оборотов делает рукав от центра к краю)
//   randomness      — разброс поперёк рукава (доля радиуса)
//   randomnessPower — насколько плотно звёзды жмутся к оси рукава
//   thickness       — толщина диска (доля радиуса)
//   bulgeShare      — доля звёзд в балдже/баре
//   youngShare      — доля горячих голубых звёзд (идут кучками по рукавам)
//   hiiShare        — доля розовых областей звездообразования
//   dustShare       — сколько точек пыли сгенерировать (отдельный массив)
//   brightnessBoost — общий множитель яркости цветов вершин (1 = как есть);
//                     >1 допустим: цвет — float-атрибут, а блендинг аддитивный
export const generateGalaxyPoints = (options = {}) => {
  const {
    count = 100000,
    branches = 4,
    radius = 620,
    innerRadius = 10,
    spin = 0.95,
    randomness = 0.24,
    randomnessPower = 2.2,
    thickness = 0.028,
    bulgeShare = 0.16,
    barLength = 0.22,
    barWidth = 0.09,
    bulgeHeight = 0.05,
    youngShare = 0.08,
    hiiShare = 0.02,
    dustShare = 0.16,
    brightnessBoost = 1,
    coreColor = 0xffe0a0,
    midColor = 0x9dc4ff,
    armColor = 0x5a86ff,
    youngColor = 0xeaf4ff,
    hiiColor = 0xff5f9e,
    bulgeColor = 0xffc072
  } = options

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const dustCount = Math.max(0, Math.round(count * dustShare))
  const dustPositions = new Float32Array(dustCount * 3)

  const cCore = new THREE.Color(coreColor)
  const cMid = new THREE.Color(midColor)
  const cArm = new THREE.Color(armColor)
  const cYoung = new THREE.Color(youngColor)
  const cHii = new THREE.Color(hiiColor)
  const cBulge = new THREE.Color(bulgeColor)
  const cWhite = new THREE.Color(0xffffff)
  const color = new THREE.Color()

  const span = Math.max(1e-6, radius - innerRadius)
  const TWO_PI = Math.PI * 2

  // Азимут точки рукава: угол самого рукава + закрутка, пропорциональная радиусу
  const armAngle = (b, r) => (b / branches) * TWO_PI + (r / radius) * spin * TWO_PI

  // Веса рукавов: чётные — главные (2 ярких рукава Млечного Пути),
  // нечётные — второстепенные: звездá в них и реже, и ближе к оси рукава
  const weights = []
  for (let b = 0; b < branches; b++) weights.push(b % 2 === 0 ? 1.55 : 0.55)
  const weightTotal = weights.reduce((s, w) => s + w, 0)
  const pickBranch = () => {
    let x = Math.random() * weightTotal
    for (let b = 0; b < branches; b++) {
      x -= weights[b]
      if (x <= 0) return b
    }
    return branches - 1
  }
  const isMajor = (b) => b % 2 === 0

  // Гнёзда звездообразования: молодые звёзды и HII рождаются не «ровным слоем»,
  // а кучками в нескольких пятнах вдоль рукавов — так и выглядит Млечный Путь
  const clumps = []
  for (let c = 0; c < branches * 7; c++) {
    clumps.push({
      b: pickBranch(),
      r: innerRadius + span * (0.14 + Math.random() * 0.82)
    })
  }
  const pickClump = () => clumps[Math.floor(Math.random() * clumps.length)]

  const nBulge = Math.round(count * bulgeShare)
  const nYoung = Math.round(count * youngShare)
  const nHii = Math.round(count * hiiShare)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    let brightness = 0.3 + Math.random() * 0.7
    // «выгорание» ярких звёзд в белый: иначе каждая точка остаётся просто
    // цветным пикселем, а не источником света (см. [FEATURE:STARGLOW])
    let whiten = 0

    if (i < nBulge) {
      // ── БАЛДЖ + БАР: вытянутое ядро (у Млечного Пути есть центральный бар) ──
      const rr = Math.pow(Math.random(), 1.8) // гуще к центру
      const th = Math.random() * TWO_PI
      const jitter = 0.015 * radius
      positions[i3] = Math.cos(th) * barLength * radius * rr + (Math.random() - 0.5) * 2 * jitter
      positions[i3 + 1] =
        (Math.random() - 0.5) * 2 * bulgeHeight * radius * rr
      positions[i3 + 2] = Math.sin(th) * barWidth * radius * rr + (Math.random() - 0.5) * 2 * jitter
      color.copy(cBulge)
      brightness = 0.5 + 0.9 * (1 - rr) // ядро горит ярче
    } else if (i < nBulge + nYoung + nHii) {
      // ── МОЛОДЫЕ ЗВЁЗДЫ И ОБЛАСТИ HII: кучками по гребням рукавов ──
      const isHii = i >= nBulge + nYoung
      const cl = pickClump()
      const r = cl.r * (1 + (Math.random() - 0.5) * 0.22)
      const ang = armAngle(cl.b, r) + (Math.random() - 0.5) * 0.2
      const sc = randomness * r * (isHii ? 0.14 : 0.22)
      const rnd = () =>
        Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * sc
      positions[i3] = Math.cos(ang) * r + rnd()
      positions[i3 + 1] = (Math.random() - 0.5) * 2 * thickness * 0.5 * r
      positions[i3 + 2] = Math.sin(ang) * r + rnd()
      color.copy(isHii ? cHii : cYoung)
      // HII — туманности, они светятся ровнее и ярче звёзд
      brightness = isHii ? 0.55 + Math.random() * 0.45 : 0.75 + Math.random() * 0.5
      whiten = isHii ? 0 : 0.35
    } else {
      // ── ОСНОВНОЕ НАСЕЛЕНИЕ РУКАВОВ ──
      const b = pickBranch()
      const t = Math.pow(Math.random(), 1.5)
      const r = innerRadius + span * t
      const ang = armAngle(b, r)
      const sc = randomness * r * (isMajor(b) ? 1 : 0.62)
      const rnd = () =>
        Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * sc
      positions[i3] = Math.cos(ang) * r + rnd()
      positions[i3 + 1] = (Math.random() - 0.5) * 2 * thickness * r
      positions[i3 + 2] = Math.sin(ang) * r + rnd()
      // Цвет: тёплое ядро → голубая середина → синий конец рукава.
      // ВАЖНО: в three r186 у Color нет `mix()`, ровно тот же смысл даёт `lerp()`
      const k = Math.pow(t, 0.75)
      if (k < 0.5) color.copy(cCore).lerp(cMid, k * 2)
      else color.copy(cMid).lerp(cArm, (k - 0.5) * 2)
      whiten = Math.min(0.45, Math.max(0, brightness - 0.72) * 1.5)
    }

    if (whiten) color.lerp(cWhite, whiten)

    const boost = brightness * brightnessBoost
    colors[i3] = color.r * boost
    colors[i3 + 1] = color.g * boost
    colors[i3 + 2] = color.b * boost
  }

  // ── ПЫЛЕВЫЕ ПОЛОСЫ: тёмные точки по ВНУТРЕННЕМУ краю рукавов
  //    (смещение против направления закрутки) + немного пыли в баре.
  //    Цвет не нужен — слой рисуется чёрным с обычным смешиванием и «гасит»
  //    свечение галактики, давая характерные тёмные прожилки.
  for (let i = 0; i < dustCount; i++) {
    const i3 = i * 3
    if (Math.random() < 0.25) {
      // пыль вдоль бара
      const rr = Math.pow(Math.random(), 1.6)
      const th = Math.random() * TWO_PI
      dustPositions[i3] = Math.cos(th) * barLength * radius * rr * 1.05
      dustPositions[i3 + 1] = (Math.random() - 0.5) * 2 * bulgeHeight * radius * rr * 0.6
      dustPositions[i3 + 2] = Math.sin(th) * barWidth * radius * rr * 0.5
    } else {
      const b = pickBranch()
      const major = isMajor(b)
      const t = Math.pow(Math.random(), 1.25)
      const r = innerRadius + span * t
      const ang = armAngle(b, r) - (major ? 0.1 : 0.07) // внутренний край рукава
      const sc = randomness * 0.55 * r * (major ? 1 : 0.6)
      const rnd = () =>
        Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * sc
      dustPositions[i3] = Math.cos(ang) * r + rnd()
      dustPositions[i3 + 1] = (Math.random() - 0.5) * 2 * thickness * 0.5 * r
      dustPositions[i3 + 2] = Math.sin(ang) * r + rnd()
    }
  }

  return { positions, colors, dustPositions }
}

// Случайная галактика: берём палитру и разбрасываем форму/закрутку.
export const randomGalaxyConfig = () => {
  const palette = GALAXY_PRESETS[Math.floor(Math.random() * GALAXY_PRESETS.length)]
  const r2 = (v) => Math.round(v * 100) / 100
  return {
    ...GALAXY,
    ...palette,
    branches: 4, // держим 2 главных + 2 второстепенных, как у Млечного Пути
    spin: r2(0.6 + Math.random() * 0.9),
    randomness: r2(0.16 + Math.random() * 0.2),
    randomnessPower: r2(1.6 + Math.random() * 1.4),
    radius: Math.round(480 + Math.random() * 300),
    thickness: r2(0.02 + Math.random() * 0.03),
    youngShare: r2(0.05 + Math.random() * 0.07),
    hiiShare: r2(0.01 + Math.random() * 0.03),
    dustShare: r2(0.1 + Math.random() * 0.12),
    tiltX: r2(0.25 + Math.random() * 0.5),
    tiltZ: r2(Math.random() * 1.2)
  }
}

// ── Сборка галактики в объекты THREE ──
export const createGalaxy = (options = GALAXY) => {
  const {
    name = 'Галактика',
    count,
    branches,
    radius,
    innerRadius,
    distance,
    spin,
    randomness,
    randomnessPower,
    thickness,
    bulgeShare,
    barLength,
    barWidth,
    bulgeHeight,
    youngShare,
    hiiShare,
    dustShare,
    size,
    opacity,
    starBrightness,
    starGlow,
    haloSize,
    haloOpacity,
    coreColor,
    midColor,
    armColor,
    youngColor,
    hiiColor,
    bulgeColor,
    tiltX,
    tiltZ,
    coreGlow,
    coreScale,
    coreOpacity,
    rotationSpeed,
    dustSize,
    dustOpacity,
    blackHole: blackHoleOptions
  } = options

  const { positions, colors, dustPositions } = generateGalaxyPoints({
    count,
    branches,
    radius,
    innerRadius,
    spin,
    randomness,
    randomnessPower,
    thickness,
    bulgeShare,
    barLength,
    barWidth,
    bulgeHeight,
    youngShare,
    hiiShare,
    dustShare,
    brightnessBoost: starBrightness || 1,
    coreColor,
    midColor,
    armColor,
    youngColor,
    hiiColor,
    bulgeColor
  })

  // ── звёзды диска ──
  const maps = getStarMaps()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    // цвет-«множитель» белый: реальный цвет каждой звезды берётся из
    // вершинного буфера (vertexColors), иначе палитра галактики потеряется
    color: 0xffffff,
    size,
    map: maps.star,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.01,
    // ВАЖНО: затухание по расстоянию выключено. Мы находимся ВНУТРИ диска,
    // поэтому расстояния до звёзд различаются в сотни раз — с attenuation
    // ближние точки стали бы огромными кляксами. Постоянный размер в
    // экранных пикселях даёт ровную «космическую пыль» на любом плане.
    sizeAttenuation: false,
    fog: false,
    toneMapped: false,
    opacity
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false // галактика огромная — пусть рисуется всегда
  points.renderOrder = -0.6 // после туманности (-1), до свечения фона и звёзд

  // ── слой свечения: те же самые звёзды (общая геометрия — 0 лишней памяти),
  //    но крупной мягкой маской и с низкой прозрачностью. Аддитивное
  //    наложение даёт каждому источнику ореол, а в ядре — яркую вспышку. ──
  let halo = null
  if (starGlow) {
    const haloMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: haloSize,
      map: maps.halo,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.005,
      sizeAttenuation: false,
      fog: false,
      toneMapped: false,
      opacity: haloOpacity
    })
    halo = new THREE.Points(geometry, haloMaterial)
    halo.frustumCulled = false
    halo.renderOrder = -0.65 // ореолы под ядрами звёзд
  }

  // ── слой пыли: чёрные точки с обычным смешиванием гасят свечение рукавов ──
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const dustMaterial = new THREE.PointsMaterial({
    size: dustSize,
    map: maps.halo, // мягкое круглое пятно без мипмапов
    color: 0x000000,
    transparent: true,
    opacity: dustOpacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false
  })
  const dust = new THREE.Points(dustGeometry, dustMaterial)
  dust.frustumCulled = false
  dust.renderOrder = -0.55 // строго ПОСЛЕ звёзд галактики, иначе не «погасит» их
  points.add(dust) // внутри диска: вращается вместе со звёздами
  if (halo) points.add(halo) // ореолы — тоже часть диска

  // ── ориентация диска ──
  // Вращение живёт на `points` (вокруг нормали диска), наклон — на группе.
  // Центр галактики смещаем так, чтобы мировая точка (0,0,0) — Солнечная
  // система — лежала В ПЛОСКОСТИ диска. Тогда мы «внутри» Млечного Пути:
  // вокруг системы нет дырки, а сама галактика читается полосой в небе.
  const group = new THREE.Group()
  group.rotation.set(tiltX, 0, tiltZ)

  const normal = new THREE.Vector3(0, 1, 0).applyEuler(group.rotation).normalize()
  const back = new THREE.Vector3(0, 0, -1)
  const inPlane = back.clone().addScaledVector(normal, -back.dot(normal))
  if (inPlane.lengthSq() < 1e-6) inPlane.set(1, 0, 0).applyEuler(group.rotation)
  inPlane.normalize()
  group.position.copy(inPlane).multiplyScalar(distance || 0)

  group.add(points)

  // ── мягкое свечение ядра ──
  let core = null
  if (coreGlow) {
    core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture, // общая текстура — её НЕ диспозим
        color: bulgeColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: coreOpacity,
        fog: false,
        toneMapped: false
      })
    )
    core.scale.setScalar(coreScale)
    core.renderOrder = -0.5
    group.add(core) // в центре галактики (центр = начало координат группы)
  }

  // ── чёрная дыра в центре спирали ──
  // [FEATURE:BLACKHOLE] Сфера Шварцшильда + аккреционный диск + частицы.
  // Ставим в локальный (0,0,0) группы — это и есть центр галактики.
  let blackHole = null
  if (blackHoleOptions && blackHoleOptions.enabled !== false) {
    blackHole = createBlackHole(blackHoleOptions)
    group.add(blackHole.root)
  }

  // Медленное вращение диска (вместе со звёздами, пылью и системами-детьми)
  // [FEATURE:DOPPLER] камере нужен диск ЧД: доплер считается по направлению
  // на неё, поэтому переводим позицию камеры в локальные координаты группы.
  let invRotation = null
  const update = (delta, motionScale = 1, camera = null) => {
    points.rotation.y += rotationSpeed * delta * motionScale
    if (!blackHole) return
    if (camera) {
      if (!invRotation) {
        invRotation = new THREE.Quaternion().setFromEuler(group.rotation).invert()
      }
      blackHole.update(delta, motionScale, {
        camera,
        center: group.position,
        invRotation
      })
    } else {
      blackHole.update(delta, motionScale)
    }
  }

  // Нормаль диска — нужна, чтобы поставить камеру «в плане» (см. main.js)
  const getNormal = (out = new THREE.Vector3()) =>
    out.set(0, 1, 0).applyEuler(group.rotation).normalize()

  // Центр галактики в мировых координатах
  const getCenter = (out = new THREE.Vector3()) => out.copy(group.position)

  // Дистанция камеры, с которой видно диск целиком
  const viewDistance = radius * 2.3

  const info = `${name} · ${branches} рукава · звёзд: ${count.toLocaleString('ru-RU')}`

  // Освобождение ресурсов при генерации новой галактики
  const dispose = () => {
    geometry.dispose()
    material.dispose()
    dustGeometry.dispose()
    dustMaterial.dispose()
    if (halo) halo.material.dispose()
    if (core) core.material.dispose()
    if (blackHole) blackHole.dispose()
    if (group.parent) group.parent.remove(group)
  }

  return {
    group,
    points,
    dust,
    halo,
    core,
    blackHole,
    update,
    getNormal,
    getCenter,
    viewDistance,
    info,
    dispose
  }
}
