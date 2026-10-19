import * as THREE from 'three'
import { SYSTEMS, GALAXY } from './config.js'
import { orbitLocal, orbitOrientation, orbitPolyline, meanMotion } from './orbit.js'
import { glowTexture, starTexture } from './textures.js'
import { createAtmosphere, createSaturnRings } from './bodies.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:SYSTEMS] другие звёздные системы в галактике ───
//
// Как в настоящем Млечном Пути: звёзды рождаются в рукавах, поэтому
// сгенерированные системы садятся именно туда. В каждую можно «провалиться»
// (см. навигацию в main.js): у системы есть звезда со свечением и от 1 до 5
// планет на кеплеровских орбитах — математика та же, что и у Солнечной
// системы (`src/orbit.js`), поэтому всё движется согласованно.
//
// Модуль отдаёт два уровня:
//   generateSystemSpecs() — «данные» систем (чисел и цветов), без THREE;
//   createStarSystems()   — сборка спеков в объекты сцены + анимация.
// ─────────────────────────────────────────────────────────────

// ── классы звёзд: цвет, размер и типичное число планет ──
// Веса подобраны «как в природе»: красных карликов больше всего.
const STAR_CLASSES = [
  { name: 'красный карлик', color: 0xff6a4a, radius: 1.5, weight: 24, planets: [1, 3] },
  { name: 'оранжевый карлик', color: 0xffa455, radius: 1.8, weight: 18, planets: [1, 4] },
  { name: 'жёлтый карлик', color: 0xffd27a, radius: 2.1, weight: 16, planets: [2, 5] },
  { name: 'белая звезда', color: 0xeaf2ff, radius: 2.3, weight: 12, planets: [1, 4] },
  { name: 'голубой гигант', color: 0x9fc8ff, radius: 3.0, weight: 8, planets: [2, 5] },
  { name: 'красный гигант', color: 0xff5a3a, radius: 3.6, weight: 8, planets: [1, 3] },
  { name: 'белый карлик', color: 0xf6fbff, radius: 0.9, weight: 6, planets: [1, 2] }
]

const GREEK = [
  'Альфа', 'Бета', 'Гамма', 'Дельта', 'Эпсилон', 'Дзета', 'Эта', 'Тета',
  'Йота', 'Каппа', 'Лямбда', 'Сигма', 'Тау', 'Омикрон'
]
const CONSTELLATIONS = [
  'Центавра', 'Лиры', 'Ориона', 'Дракона', 'Лебедя', 'Волопаса', 'Феникса',
  'Гидры', 'Кассиопеи', 'Пегаса', 'Андромеды', 'Карины', 'Весов', 'Тельца',
  'Змееносца', 'Журавля'
]
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI']

const ROCKY = [0xb9a38c, 0x9c8b7a, 0x8a7f70, 0xc2b280, 0x7d7466, 0xa8705a]
const GAS = [0xd8b48a, 0xe6d3a6, 0xc9a882, 0xa8bfd8, 0xcaa8d8, 0xbfa07a]
const ICE = [0xcfe8ff, 0xa8d8ff, 0xe8f4ff, 0xbcd8d8, 0xd8e8f0]
const HOT = [0xd85a3a, 0xb04a2a, 0xe08a4a, 0xc25a3a]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const between = (a, b) => a + Math.random() * (b - a)

const pickStarClass = () => {
  const total = STAR_CLASSES.reduce((s, c) => s + c.weight, 0)
  let x = Math.random() * total
  for (const c of STAR_CLASSES) {
    x -= c.weight
    if (x <= 0) return c
  }
  return STAR_CLASSES[0]
}

const makePlanets = (starClass) => {
  const [minP, maxP] = starClass.planets
  const n = Math.round(between(minP, maxP))
  const planets = []
  let a = between(3.5, 6.5) // первая планета близко к звезде
  for (let i = 0; i < n; i++) {
    // тип планеты зависит от того, далеко ли она от звезды
    const kind = i === 0 && Math.random() < 0.25 ? 'hot' : a < 13 ? 'rock' : a < 24 ? 'gas' : 'ice'
    const radius =
      kind === 'gas' ? between(1.0, 1.9) : kind === 'ice' ? between(0.6, 1.3) : between(0.22, 0.8)
    const color = pick(kind === 'hot' ? HOT : kind === 'gas' ? GAS : kind === 'ice' ? ICE : ROCKY)
    planets.push({
      name: 'Планета ' + (i + 1),
      kind,
      color,
      radius,
      distance: Math.round(a * 100) / 100,
      eccentricity: between(0, 0.22),
      inclination: between(-8, 8),
      node: between(0, 360),
      startAngle: between(0, 360),
      speedScale: between(0.7, 1.3),
      spinSpeed: between(-0.03, 0.03),
      // атмосфера — у каменистых и ледяных, кольца — у крупных газовых
      atmosphere:
        Math.random() < 0.5
          ? { color, intensity: between(0.15, 0.5) }
          : null,
      ring: kind === 'gas' && radius > 1.15 && Math.random() < 0.45
    })
    a *= between(1.45, 2.1)
  }
  return planets
}

// ── Генерация спеков: где система и из чего состоит ──
// `homeLocal` — позиция Солнечной системы В ЛОКАЛЬНЫХ КООРДИНАТАХ галактики
// (нужна, чтобы не поставить чужую систему прямо на Солнце).
export const generateSystemSpecs = (options = {}) => {
  const {
    count = SYSTEMS.count,
    branches = GALAXY.branches,
    radius = GALAXY.radius,
    innerRadius = GALAXY.innerRadius,
    spin = GALAXY.spin,
    thickness = GALAXY.thickness,
    homeLocal = new THREE.Vector3()
  } = options

  // те же веса рукавов, что и у звёзд галактики: 2 главных + 2 второстепенных
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

  const specs = []
  let guard = 0
  while (specs.length < count && guard++ < count * 80) {
    const starClass = pickStarClass()
    const r =
      innerRadius +
      (radius - innerRadius) * between(SYSTEMS.radiusMin, SYSTEMS.radiusMax)
    let ang
    if (Math.random() < SYSTEMS.armChance) {
      const b = pickBranch()
      ang =
        (b / branches) * Math.PI * 2 +
        (r / radius) * spin * Math.PI * 2 +
        (Math.random() - 0.5) * 0.3
    } else {
      ang = Math.random() * Math.PI * 2
    }

    const local = new THREE.Vector3(
      Math.cos(ang) * r,
      (Math.random() - 0.5) * 2 * thickness * 2.5 * r,
      Math.sin(ang) * r
    )
    // слишком близко к Солнечной системе — не селимся
    if (local.distanceTo(homeLocal) < SYSTEMS.minDistanceFromHome) continue

    const planets = makePlanets(starClass)
    const extent = planets.length
      ? planets[planets.length - 1].distance * 1.6 + 6
      : 12
    specs.push({
      name: `${pick(GREEK)} ${pick(CONSTELLATIONS)}${Math.random() < 0.5 ? ' ' + pick(NUMERALS) : ''}`,
      catalog: 'HD ' + (1000 + Math.floor(Math.random() * 8999)),
      starClass,
      planets,
      local,
      // у каждой системы своя ориентация плоскости орбит
      tilt: { x: between(-0.5, 0.5), z: between(-0.5, 0.5) },
      extent
    })
  }
  return specs
}

// ── Сборка одной системы в объекты сцены ──
const buildSystem = (spec) => {
  const group = new THREE.Group()
  group.position.copy(spec.local)
  group.rotation.set(spec.tilt.x, 0, spec.tilt.z)

  // ── звезда ──
  const starGeo = new THREE.SphereGeometry(spec.starClass.radius, 24, 16)
  const starMat = new THREE.MeshBasicMaterial({
    color: spec.starClass.color,
    fog: false, // иначе с расстояния галактики звезда утонула бы в тумане
    toneMapped: false
  })
  const star = new THREE.Mesh(starGeo, starMat)
  group.add(star)

  // ореол: именно он делает систему видимой «звездой» на карте галактики
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: spec.starClass.color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.75,
    fog: false,
    toneMapped: false
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(spec.starClass.radius * 4.2)
  glow.renderOrder = -0.4
  group.add(glow)

  // ── планеты ──
  const rigs = []
  const orbitLines = []
  spec.planets.forEach((p) => {
    const holder = new THREE.Object3D()
    const orientation = orbitOrientation(p.inclination, p.node)
    group.add(holder)

    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPolyline(p.distance, p.eccentricity, orientation, 96)),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: SYSTEMS.orbitLineOpacity,
        depthWrite: false
      })
    )
    orbitLines.push(orbitLine)
    group.add(orbitLine)

    const geo = new THREE.SphereGeometry(p.radius, 20, 14)
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: 0.8,
      metalness: 0.04,
      // лёгкое самосвечение: планеты читаются даже без света конкретной звезды
      emissive: p.color,
      emissiveIntensity: 0.4
    })
    const mesh = new THREE.Mesh(geo, mat)
    holder.add(mesh)

    if (p.atmosphere) holder.add(createAtmosphere(p.radius, p.atmosphere.color, p.atmosphere.intensity))
    if (p.ring) {
      const ring = createSaturnRings(p.radius)
      ring.rotation.x = 0.3 + Math.random() * 0.4
      holder.add(ring)
    }

    const nu = (p.startAngle * Math.PI) / 180
    orbitLocal(p.distance, p.eccentricity, nu, holder.position).applyEuler(orientation)

    rigs.push({
      holder,
      mesh,
      a: p.distance,
      e: p.eccentricity,
      nu,
      orientation,
      speedScale: p.speedScale,
      spinSpeed: p.spinSpeed
    })
  })

  return { group, star, glow, rigs, spec, orbitLines }
}

// ── Создание всех систем + анимация ──
export const createStarSystems = (parent, specs) => {
  const root = new THREE.Group()
  parent.add(root)

  const systems = specs.map((spec) => buildSystem(spec))
  systems.forEach((s) => root.add(s.group))

  const update = (orbitStep, spinStep) => {
    systems.forEach((s) => {
      s.rigs.forEach((r) => {
        r.nu += meanMotion(r.a, r.speedScale) * orbitStep
        orbitLocal(r.a, r.e, r.nu, r.holder.position).applyEuler(r.orientation)
        if (spinStep) r.mesh.rotation.y += r.spinSpeed * spinStep
      })
    })
  }

  // Тумблер «Орбиты» в панели распространяется и на чужие системы
  const setOrbitsVisible = (value) => {
    systems.forEach((s) => s.orbitLines.forEach((l) => (l.visible = value)))
  }

  // Освобождение ресурсов (важно: 🎲 пересоздаёт системы вместе с галактикой)
  const dispose = () => {
    const keepTextures = new Set([glowTexture, starTexture])
    systems.forEach((s) => {
      s.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        const mats = obj.material
          ? Array.isArray(obj.material)
            ? obj.material
            : [obj.material]
          : []
        mats.forEach((m) => {
          if (m.map && !keepTextures.has(m.map)) m.map.dispose()
          m.dispose()
        })
      })
    })
    if (root.parent) root.parent.remove(root)
  }

  return { root, systems, update, setOrbitsVisible, dispose }
}
