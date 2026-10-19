import * as THREE from 'three'
import { GALAXY } from './config.js'
import { starTexture, glowTexture } from './textures.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:GALAXY] процедурная спиральная галактика (фон) ───
// Фон вокруг Солнечной системы: десятки тысяч точек-звёзд в рукавах.
// Генерация — отдельная «чистая» функция `generateGalaxyPoints` (только
// математика, никаких THREE-объектов), а `createGalaxy` уже собирает
// из неё THREE.Points. Вся геометрия — один BufferGeometry, рисуется
// одним вызовом, поэтому даже 100k звёзд ничего не стоят.
// ─────────────────────────────────────────────────────────────

// Изолированная функция генерации звёздного скопления.
// Принимает только числа/цвета, возвращает типизированные массивы.
//
//   branches        — число рукавов
//   radius          — внешний радиус диска
//   innerRadius     — «дырка» в центре (чтобы рукава не лезли в планеты)
//   spin            — коэффициент закручивания (сколько оборотов делает рукав)
//   randomness      — разброс поперёк рукава (доля радиуса)
//   randomnessPower — насколько плотно звёзды жмутся к оси рукава
//   thickness       — толщина диска (доля радиуса)
export const generateGalaxyPoints = (options = {}) => {
  const {
    count = 60000,
    branches = 4,
    radius = 420,
    innerRadius = 70,
    spin = 1.15,
    randomness = 0.26,
    randomnessPower = 2.2,
    thickness = 0.045,
    coreColor = 0xfff1c9,
    midColor = 0x8fb4ff,
    armColor = 0x5b2bd6
  } = options

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  const cCore = new THREE.Color(coreColor)
  const cMid = new THREE.Color(midColor)
  const cArm = new THREE.Color(armColor)
  const color = new THREE.Color()

  const span = Math.max(1e-6, radius - innerRadius)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // Радиус звезды. Показатель > 1 сгущает звёзды к центру галактики,
    // а к краю рукава они естественно расходятся и редеют.
    const t = Math.pow(Math.random(), 1.7)
    const r = innerRadius + span * t

    // Угол рукава: (i % branches) распределяет звёзды по рукавам,
    // spin закручивает рукав пропорционально радиусу.
    const branchAngle = ((i % branches) / branches) * Math.PI * 2
    const spinAngle = (r / radius) * spin * Math.PI * 2

    // Случайное смещение поперёк и вдоль рукава. Степень `randomnessPower`
    // делает так, что мелких смещений много, а крупных — мало (живой рукав).
    const scatter = randomness * r
    const rnd = () =>
      Math.pow(Math.random(), randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      scatter

    const x = Math.cos(branchAngle + spinAngle) * r + rnd()
    const z = Math.sin(branchAngle + spinAngle) * r + rnd()
    // Толщина диска тоже растёт к краю — рукава «пухнут»
    const y = (Math.random() - 0.5) * 2 * thickness * r

    // Предохранитель: ни одна звезда не должна оказаться внутри Солнечной системы
    let px = x
    let pz = z
    const rr = Math.sqrt(x * x + z * z)
    if (rr < innerRadius && rr > 1e-6) {
      const fix = innerRadius / rr
      px *= fix
      pz *= fix
    }

    positions[i3] = px
    positions[i3 + 1] = y
    positions[i3 + 2] = pz

    // ─── Интерполяция цвета: ядро (ярко-белое/жёлтое) → середина (голубая) →
    //     концы рукавов (глубокий синий/фиолетовый) ───
    const k = Math.pow(t, 0.8)
    if (k < 0.5) color.copy(cCore).mix(cMid, k * 2)
    else color.copy(cMid).mix(cArm, (k - 0.5) * 2)

    // Каждая звезда чуть своего оттенка/яркости — скопление выглядит живым
    const brightness = 0.35 + Math.random() * 0.65
    colors[i3] = color.r * brightness
    colors[i3 + 1] = color.g * brightness
    colors[i3 + 2] = color.b * brightness
  }

  return { positions, colors }
}

// ── Сборка галактики в объекты THREE ──
export const createGalaxy = (options = GALAXY) => {
  const {
    count,
    branches,
    radius,
    innerRadius,
    spin,
    randomness,
    randomnessPower,
    thickness,
    size,
    opacity,
    coreColor,
    midColor,
    armColor,
    tiltX,
    tiltZ,
    coreGlow,
    coreScale,
    coreOpacity,
    rotationSpeed
  } = options

  const { positions, colors } = generateGalaxyPoints({
    count,
    branches,
    radius,
    innerRadius,
    spin,
    randomness,
    randomnessPower,
    thickness,
    coreColor,
    midColor,
    armColor
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      map: starTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.01,
      // без затухания по расстоянию: точка одинакова и вблизи, и вдали
      sizeAttenuation: false,
      fog: false,
      toneMapped: false,
      opacity
    })
  )
  points.frustumCulled = false // галактика огромная — пусть рисуется всегда
  points.renderOrder = -0.6 // после туманности (-1), до свечения фона и звёзд

  // Наклоняем диск целиком: вращение живёт на `points` (вокруг нормали диска),
  // а наклон — на группе, поэтому структура рукавов не деформируется.
  const group = new THREE.Group()
  group.rotation.set(tiltX, 0, tiltZ)
  group.add(points)

  // ─── мягкое свечение в центре галактики ───
  let core = null
  if (coreGlow) {
    core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: coreColor,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: coreOpacity,
        fog: false,
        toneMapped: false
      })
    )
    core.scale.setScalar(coreScale)
    core.renderOrder = -0.55
    group.add(core)
  }

  // Медленное вращение галактики (по умолчанию ~0.06 рад/сек ≈ 0.001 за кадр).
  const update = (delta, motionScale = 1) => {
    points.rotation.y += rotationSpeed * delta * motionScale
  }

  return { group, points, core, update }
}
