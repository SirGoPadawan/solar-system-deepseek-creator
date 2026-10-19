import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

import {
  PLANETS,
  SHADOW_MAP_SIZE,
  MOTION_SPEED,
  SYSTEM_TILT_X,
  SYSTEM_TILT_Z,
  ASTEROID_BELT,
  KUIPER_BELT,
  SPEED_STEPS,
  DEFAULT_SPEED_INDEX,
  GALAXY
} from './config.js'
import { createPlanet, createSunEffects } from './bodies.js'
import { createStarfield, createNebula, createSpaceGlow, createSpaceFog } from './sky.js'
import { createEclipticGrid } from './grid.js'
import { createGalaxy, randomGalaxyConfig } from './galaxy.js'
import { createStarSystems, generateSystemSpecs } from './systems.js'
import { glowTexture } from './textures.js'
import { meanMotion, orbitLocal } from './orbit.js'
import { makeBelt, updateBelt } from './belts.js'
import { createComets, createStarman } from './comets.js'
import { createTrails } from './trails.js'
import { createControls } from './ui.js'
import { createPlanetCard } from './card.js'
import { createHoverTooltip } from './tooltip.js'

// ─────────────────────────────────────────────────────────────
// ТОЧКА СБОРКИ СЦЕНЫ И ИГРОВОЙ ЦИКЛ
// ─────────────────────────────────────────────────────────────

// 1. Сцена, корневая группа системы, камера, рендерер
const scene = new THREE.Scene()

const world = new THREE.Group()
world.rotation.set(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z)
scene.add(world)

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.5,
  6000 // далеко: нужно, чтобы можно было отлететь и посмотреть галактику целиком
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
renderer.toneMapping = THREE.ACESFilmicToneMapping
// Экспозиция ниже прежней — космос должен читаться тёмным, а свет Солнца контрастным
renderer.toneMappingExposure = 2.0
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
camera.position.set(0, 18, 42)
controls.target.set(0, -1, 0)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 5
controls.maxDistance = 1600 // можно отлететь и рассмотреть галактику снаружи
controls.maxPolarAngle = Math.PI / 2.05

// ─── [FEATURE:POSTFX] пост-обработка: EffectComposer + UnrealBloomPass ───
// Сцена рисуется в HDR-таргет (HalfFloat), поэтому «ярче белого» значения
// (фотонная сфера ЧД, фотосфера Солнца) не обрезаются, а попадают в блум.
// Порядок важен: RenderPass → UnrealBloomPass → OutputPass (тонмаппинг
// ACES + перевод в sRGB делаются в конце, уже по готовой картинке).
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4 // MSAA: с композером canvas-сглаживание не работает
  })
)
composer.setPixelRatio(renderer.getPixelRatio())
composer.setSize(window.innerWidth, window.innerHeight)

composer.addPass(new RenderPass(scene, camera))
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  GALAXY.bloom.strength,
  GALAXY.bloom.radius,
  GALAXY.bloom.threshold
)
// threshold 1.12: обычные звёзды и планеты остаются чёткими, а HDR-кольцо
// чёрной дыры и раскалённая фотосфера Солнца получают мягкий ореол.
if (GALAXY.bloom.enabled) composer.addPass(bloomPass)
composer.addPass(new OutputPass())

// 2. Небо: звёзды + туманность + лёгкое свечение фона
// Всё небо лежит в одной группе, которую каждый кадр «возим» за камерой:
// так туманность и звёзды видны из любой точки галактики, а сферический
// скайбокс никогда не превращается в «стенку» (снаружи он выглядел бы
// именно ей — раньше такие сферы приходилось просто прятать).
const starfield = createStarfield()
const nebula = createNebula()
const spaceGlow = createSpaceGlow()

const skyRoot = new THREE.Group()
skyRoot.add(starfield.points, nebula, spaceGlow)
scene.add(skyRoot)

// ─── [FEATURE:DUST] объёмный туман космоса ───
const spaceFog = createSpaceFog()
scene.fog = spaceFog

// ─── [FEATURE:GALAXY] галактика «Млечный Путь»: мы внутри её диска ───
let galaxy = createGalaxy()
scene.add(galaxy.group)

// ─── [FEATURE:SYSTEMS] другие звёздные системы в рукавах галактики ───
// Живут детьми вращающегося диска (`galaxy.points`), поэтому едут вместе
// с рукавами. Солнечная система — нулевая, «настоящая».
let systems = null
const buildSystems = () => {
  galaxy.group.updateWorldMatrix(true, true)
  // где Солнечная система в локальных координатах галактики — чтобы не
  // поставить чужую систему прямо на Солнце
  const homeLocal = galaxy.points.worldToLocal(new THREE.Vector3(0, 0, 0))
  systems = createStarSystems(galaxy.points, generateSystemSpecs({ homeLocal }))
}
buildSystems()

// ─── [FEATURE:SYSTEMS] маркер «вы здесь»: мягкое пятно на месте Солнца,
//     чтобы на карте галактики было видно, откуда мы стартовали.
//     Показывается только издалека (внутри системы он не нужен).
const homeMarker = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x9fd8ff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.85,
    fog: false,
    toneMapped: false
  })
)
homeMarker.scale.setScalar(30)
homeMarker.visible = false
scene.add(homeMarker)

// 3. Свет (намеренно приглушённый — больше «темноты» и контраста)
const ambientLight = new THREE.AmbientLight(0x121522, 0.8)
scene.add(ambientLight)

const sunLight = new THREE.PointLight(0xfff3db, 30, 400)
sunLight.decay = 1
sunLight.castShadow = true
sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE
sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE
world.add(sunLight)

const rimLight = new THREE.DirectionalLight(0x5566ff, 0.4)
rimLight.position.set(10, 20, 10)
world.add(rimLight)

// ─── [FEATURE:SYSTEMS] «гостевой» свет: одна лампа, которая переезжает в ту
//     систему, куда мы влетели. Держим её всегда видимой (иначе three будет
//     заново компилировать все материалы) — когда не нужна, просто
//     «паркуем» далеко за пределами своего радиуса освещения. ───
const visitLight = new THREE.PointLight(0xfff3db, 30, 200)
visitLight.decay = 1
scene.add(visitLight)
visitLight.position.set(1e5, 0, 0)

// 4. Планеты (+ Солнце с короной), пояса, кометы и Тесла
const planets = PLANETS.map((config) => createPlanet(world, config))

// ─── [FEATURE:GRID] сетка эклиптики в плоскости Солнца ───
const eclipticGrid = createEclipticGrid(40)
world.add(eclipticGrid)

let sunRig = null
let sunFx = null
sunRig = planets.find((p) => p.config.type === 'sun') || null
if (sunRig) {
  sunFx = createSunEffects(sunRig.config.radius)
  sunRig.mesh.add(sunFx.glow)
  sunRig.mesh.add(sunFx.glowOuter)
  sunRig.mesh.add(sunFx.corona)
}

const asteroidBelt = makeBelt(world, ASTEROID_BELT)
const kuiperBelt = makeBelt(world, KUIPER_BELT)

const comets = createComets(world)
const starman = createStarman(world)

const trails = createTrails(scene, planets)

// Все линии орбит (планет, спутников, аппаратов, комет, Теслы) — одним списком
const orbitLines = []
planets.forEach((rig) => orbitLines.push(...rig.orbitLines))
orbitLines.push(...comets.orbitLines, ...starman.orbitLines)

// 5. Состояние сцены (скорость, пауза, тумблеры видимости)
let speedIndex = DEFAULT_SPEED_INDEX
let systemSpeed = SPEED_STEPS[speedIndex]
let paused = false

const options = {
  motion: true, // движение планет по орбитам
  spin: true, // вращение планет вокруг оси
  trails: true, // винтовые следы
  stars: true, // звёздное небо (полёт)
  orbits: true, // линии орбит
  grid: true, // сетка эклиптики
  belts: true, // пояса астероидов и Койпера
  comets: true, // кометы
  tesla: true, // Tesla / Starman
  nebula: true, // туманность
  galaxy: true, // фоновая спиральная галактика
  dust: true // космическая пыль (туман + свечение фона)
}
const planetVisible = planets.map(() => true)

// Скайбокс теперь возится за камерой, поэтому «внутри/снаружи» больше не
// различаем: небо видно везде. Плотность тумана постоянная.
const FOG_DENSITY = spaceFog.density // «настоящая» плотность тумана (см. sky.js)

const refreshVisibility = () => {
  starfield.points.visible = options.stars
  nebula.visible = options.nebula
  spaceGlow.visible = options.dust
  // Туман не выключаем (иначе пересборка всех материалов), а обнуляем плотность
  scene.fog = options.dust ? spaceFog : null
  if (options.dust) spaceFog.density = FOG_DENSITY
  galaxy.group.visible = options.galaxy
  eclipticGrid.visible = options.grid
  asteroidBelt.inst.visible = options.belts
  kuiperBelt.inst.visible = options.belts
  comets.root.visible = options.comets
  starman.root.visible = options.tesla
  orbitLines.forEach((line) => {
    line.visible = options.orbits
  })
  if (systems) systems.setOrbitsVisible(options.orbits)
  planets.forEach((rig, i) => {
    rig.orbitGroup.visible = planetVisible[i]
    trails.lines[i].visible = options.trails && planetVisible[i]
  })
}
refreshVisibility()

// 6. Интерфейс: панель слева вверху (глобальные настройки) + карточка планеты
let selected = null
let selectedIndex = -1

const HIGHLIGHT = new THREE.Color(0x24406e)
const setHighlight = (rig, on) => {
  if (!rig.emissive) return
  rig.mesh.material.emissive.copy(on ? HIGHLIGHT : rig.emissive)
}

// Исходные параметры планет — для кнопки «Сбросить планету»
const defaults = new WeakMap()
planets.forEach((rig) =>
  defaults.set(rig.config, {
    speedScale: rig.orbit.speedScale,
    spinSpeed: rig.config.spinSpeed,
    scale: 1
  })
)

const card = createPlanetCard({
  onParamInput: (param, value) => {
    if (!selected) return
    // ─── [FEATURE:KEPLER] множитель к кеплеровской скорости
    if (param === 'orbit') selected.orbit.speedScale = value
    else if (param === 'spin') selected.config.spinSpeed = value
    else if (param === 'size') selected.mesh.scale.setScalar(value)
  },
  onParamDefaults: () => {
    if (!selected) return
    const d = defaults.get(selected.config)
    selected.orbit.speedScale = d.speedScale
    selected.config.spinSpeed = d.spinSpeed
    selected.mesh.scale.setScalar(d.scale)
    card.setParamValues(d)
  },
  onClose: () => select(null)
})

const tooltip = createHoverTooltip()

// ─── [FEATURE:GALAXY] камера: вылет «наружу» посмотреть галактику и назад ───
const SYSTEM_CAM = {
  pos: new THREE.Vector3(0, 18, 42),
  target: new THREE.Vector3(0, -1, 0)
}
let camFlight = null
// ─── [FEATURE:FOCUS] объект, к которому «прилипла» камера ───
// Планета летит по орбите, поэтому недостаточно один раз навести target:
// каждый кадр сдвигаем камеру и цель на её смещение.
let camFocus = null
let focusFollowing = false
const focusPrev = new THREE.Vector3()
const focusNow = new THREE.Vector3()
const focusDelta = new THREE.Vector3()
const flightScratch = new THREE.Vector3()

const flyTo = (pos, target, duration = 1.4) => {
  camFlight = {
    fromPos: camera.position.clone(),
    toPos: pos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    t: 0,
    duration
  }
  controls.enabled = false // во время полёта управление временно отдаём анимации
}

// Подлёт к движущемуся объекту: конечная точка пересчитывается каждый кадр.
const flyToObject = (getWorld, distance, duration = 1.05) => {
  const startPos = camera.position.clone()
  const startTarget = controls.target.clone()
  const p = getWorld(new THREE.Vector3())
  const dir = startPos.clone().sub(p)
  if (dir.lengthSq() < 1e-6) dir.set(0.4, 0.7, 0.6)
  dir.normalize()
  dir.y = Math.max(dir.y, 0.32) // подходим чуть сверху — так читается объём
  dir.normalize()
  camFlight = {
    dynamic: true,
    getWorld,
    offset: dir.multiplyScalar(distance),
    fromPos: startPos,
    fromTarget: startTarget,
    t: 0,
    duration
  }
  controls.enabled = false
}

// ─── [FEATURE:SYSTEMS] навигация: галактика ↔ системы ───
// focus.index: 0 — Солнечная система, 1..N — сгенерированные, -1 — обзор галактики.
let focus = { kind: 'system', index: 0 }
// Галактика вращается, а мы «стоим» внутри системы: каждый кадр сдвигаем
// камеру и цель на столько же, на сколько уехала звезда системы.
let following = false
const followPrev = new THREE.Vector3()
const navScratch = new THREE.Vector3()
const navScratch2 = new THREE.Vector3()

// Мировая позиция звезды системы (0 — Солнце в начале координат)
const systemWorldPos = (index, out = new THREE.Vector3()) => {
  if (index <= 0) return out.set(0, 0, 0)
  const rig = systems && systems.systems[index - 1]
  if (!rig) return out.set(0, 0, 0)
  rig.group.updateWorldMatrix(true, false)
  return rig.group.getWorldPosition(out)
}

const sysRig = (index) => (systems && index > 0 ? systems.systems[index - 1] : null)

// Пункты выпадающего списка: обзор галактики + все системы
const systemEntries = () => {
  const list = [
    { value: 'galaxy', label: '🌀 Обзор галактики' },
    { value: 'core', label: '🕳 Центр галактики (ЧД)' },
    { value: '0', label: '🪐 Солнечная система' }
  ]
  ;(systems ? systems.systems : []).forEach((s, i) =>
    list.push({ value: String(i + 1), label: `★ ${s.spec.name}` })
  )
  return list
}

const describeSystem = (index) => {
  if (index <= 0) return 'Солнечная система · наш дом'
  const rig = sysRig(index)
  if (!rig) return ''
  return (
    `${rig.spec.catalog} · ${rig.spec.starClass.name} · ` +
    `планет: ${rig.spec.planets.length} · ESC — назад в галактику`
  )
}

// Переезд «гостевого» света: в чужой системе он встаёт в её звезду,
// иначе — паркуется далеко (и ничего не освещает)
const attachVisitLight = (index) => {
  if (index > 0) {
    const rig = sysRig(index)
    if (rig) {
      rig.group.add(visitLight)
      visitLight.position.set(0, 0, 0)
      visitLight.color.setHex(rig.spec.starClass.color)
      return
    }
  }
  scene.add(visitLight)
  visitLight.position.set(1e5, 0, 0)
}

// Провалиться в систему: летим к её звезде и дальше «едем» вместе с ней
const enterSystem = (index) => {
  focus = { kind: 'system', index }
  following = false
  camFocus = null
  select(null)
  attachVisitLight(index)
  const pos = systemWorldPos(index, new THREE.Vector3())
  if (index <= 0) {
    flyTo(SYSTEM_CAM.pos, SYSTEM_CAM.target)
  } else {
    const ext = (sysRig(index) && sysRig(index).spec.extent) || 40
    flyTo(pos.clone().add(new THREE.Vector3(0, ext * 0.45, ext * 1.5)), pos)
  }
  controlsUi.setCurrent(String(Math.max(0, index)))
  controlsUi.setSystemInfo(describeSystem(index))
}

const viewGalaxy = () => {
  const n = galaxy.getNormal() // нормаль диска галактики
  const center = galaxy.getCenter(new THREE.Vector3())
  // смотрим на диск «в три четверти» — чуть под углом к нормали
  const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const side = ref.clone().cross(n).normalize()
  n.applyAxisAngle(side, 0.55)
  // Держим камеру заметно выше плоскости: OrbitControls ограничивает угол снизу
  if (n.y < 0) n.negate()
  if (n.y < 0.25) {
    n.y = 0.25
    n.normalize()
  }
  flyTo(center.clone().addScaledVector(n, galaxy.viewDistance), center)
  focus = { kind: 'galaxy', index: -1 }
  following = false
  camFocus = null
  select(null) // карточка планеты не должна висеть поверх галактики
  attachVisitLight(-1)
  // у случайной галактики радиус больше — даём камере уехать подальше
  controls.maxDistance = Math.max(1600, galaxy.viewDistance * 1.2)
  controlsUi.setCurrent('galaxy')
  controlsUi.setSystemInfo(galaxy.info)
}

// ─── [FEATURE:BLACKHOLE] подлететь к чёрной дыре в центре спирали ───
// Дыра живёт в локальном (0,0,0) группы галактики, поэтому её мировая
// позиция — это центр галактики и она не двигается вместе с рукавами.
const viewCore = (distance = 100) => {
  const center = galaxy.getCenter(new THREE.Vector3())
  const n = galaxy.getNormal(new THREE.Vector3())
  if (n.y < 0) n.negate()
  // смотрим сверху и сбоку, чтобы аккреционный диск читался эллипсом,
  // а полярные джеты — вертикальными лучами
  const side = new THREE.Vector3(0, 0, 1).cross(n)
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
  side.normalize()
  const dir = n.clone().multiplyScalar(0.42).addScaledVector(side, 0.91).normalize()
  flyTo(center.clone().addScaledVector(dir, distance), center, 1.5)
  focus = { kind: 'core', index: -2 }
  following = false
  camFocus = null
  select(null) // если была открыта карточка планеты — закрываем
  attachVisitLight(-1)
  controls.maxDistance = Math.max(1600, galaxy.viewDistance * 1.2)
  controlsUi.setCurrent('core')
  controlsUi.setSystemInfo('🕳 Стрелец A* · сверхмассивная чёрная дыра · аккреционный диск')
}

// Пересоздать галактику — «другая галактика» (форма, палитра и её системы)
const regenerateGalaxy = () => {
  const visible = galaxy.group.visible
  if (systems) systems.dispose()
  galaxy.dispose()
  galaxy = createGalaxy(randomGalaxyConfig())
  galaxy.group.visible = visible
  scene.add(galaxy.group)
  buildSystems()
  refreshVisibility() // тумблеры (в т.ч. «Орбиты») применяем и к новым системам
  hoveredSystem = -1
  tooltip.hide()
  controlsUi.setGalaxyInfo(galaxy.info)
  controlsUi.setSystemList(systemEntries())
  viewGalaxy() // сразу показываем, что получилось
}

const select = (rig) => {
  if (selected && selected !== rig) setHighlight(selected, false)
  selected = rig
  selectedIndex = rig ? planets.indexOf(rig) : -1
  tooltip.hide()
  if (!rig) {
    card.hide()
    camFocus = null
    return
  }
  setHighlight(rig, true)
  card.show(rig)
  // ─── [FEATURE:FOCUS] плавный подлёт и «прилипание» камеры к планете ───
  camFocus = rig
  const scale = rig.mesh.scale.x || 1
  const dist = Math.max(5.5, rig.config.radius * scale * 7.5)
  flyToObject((out) => {
    rig.mesh.updateWorldMatrix(true, false)
    return rig.mesh.getWorldPosition(out)
  }, dist)
}

const controlsUi = createControls({
  planets,
  systems: systemEntries(),
  onSpeed: (act) => {
    if (act === 'faster') speedIndex = Math.min(SPEED_STEPS.length - 1, speedIndex + 1)
    else if (act === 'slower') speedIndex = Math.max(0, speedIndex - 1)
    else if (act === 'reset') {
      speedIndex = DEFAULT_SPEED_INDEX
      paused = false
    } else if (act === 'pause') paused = !paused
    systemSpeed = SPEED_STEPS[speedIndex]
    controlsUi.setSpeed('×' + systemSpeed)
    controlsUi.setPaused(paused)
  },
  onToggle: (key, value) => {
    if (key in options) options[key] = value
    refreshVisibility()
  },
  onPlanetVisible: (index, value) => {
    planetVisible[index] = value
    if (!value && selectedIndex === index) select(null)
    refreshVisibility()
  },
  onPlanetSelect: (index) => select(planets[index]),
  onView: (act) => {
    if (act === 'galRandom') regenerateGalaxy()
    else if (act === 'galView') viewGalaxy()
  },
  // [FEATURE:SYSTEMS] выбор в списке: 'galaxy' или номер системы
  onNavigate: (value) => {
    if (value === 'galaxy') viewGalaxy()
    else if (value === 'core') viewCore()
    else enterSystem(Number(value))
  }
})
controlsUi.setSpeed('×' + systemSpeed)
controlsUi.setPaused(paused)
controlsUi.setGalaxyInfo(galaxy.info)
controlsUi.setSystemInfo(describeSystem(0))
controlsUi.setCurrent('0') // стартуем внутри Солнечной системы

// Esc — быстрый выход из системы в обзор галактики
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && focus.kind !== 'galaxy') viewGalaxy()
})

// 7. Мышь: клик по планете — карточка, наведение — подсказка
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null

const pickableMeshes = () => {
  const meshes = []
  planets.forEach((p, i) => {
    if (planetVisible[i]) meshes.push(p.mesh)
  })
  return meshes
}

// Ближайший объект под курсором: планета или горизонт чёрной дыры.
const rayHit = (e) => {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const meshes = pickableMeshes()
  const bh = galaxy.blackHole
  if (bh && galaxy.group.visible && bh.horizon.visible) meshes.push(bh.horizon)
  const hits = raycaster.intersectObjects(meshes, false)
  return hits.length ? hits[0].object : null
}

// ─── [FEATURE:SYSTEMS] карта галактики ───
// Когда камера далеко от цели, звёзды чужих систем — это точки в паре
// пикселей, рейкастом их не поймать. Поэтому ищем ближайшую по экрану:
// навёлся — увидел название, кликнул — провалился в систему.
const mapMode = () => camera.position.distanceTo(controls.target) > 260
let hoveredSystem = -1
const navDir = new THREE.Vector3()

const pickSystemAt = (e) => {
  if (!mapMode()) return -1
  const rect = renderer.domElement.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const forward = camera.getWorldDirection(navDir)
  let best = -1
  let bestDist = 26 // радиус захвата, px
  const total = 1 + (systems ? systems.systems.length : 0)
  for (let i = 0; i < total; i++) {
    systemWorldPos(i, navScratch)
    navScratch2.copy(navScratch).sub(camera.position)
    if (navScratch2.dot(forward) <= 0) continue // за спиной
    navScratch.project(camera)
    const sx = (navScratch.x * 0.5 + 0.5) * rect.width
    const sy = (-navScratch.y * 0.5 + 0.5) * rect.height
    const d = Math.hypot(sx - mx, sy - my)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

const systemTip = (index) => {
  const rig = sysRig(index)
  const color = rig ? rig.spec.starClass.color : 0xffd27a
  return {
    name: rig ? rig.spec.name : 'Солнечная система',
    dot: '#' + color.toString(16).padStart(6, '0'),
    rows: rig
      ? [
          ['Класс', rig.spec.starClass.name],
          ['Планет', String(rig.spec.planets.length)],
          ['Каталог', rig.spec.catalog]
        ]
      : [
          ['Класс', 'жёлтый карлик'],
          ['Планет', '8'],
          ['Каталог', 'наш дом']
        ],
    getWorld: (out) => systemWorldPos(index, out)
  }
}

// ─── [FEATURE:BLACKHOLE] подсказка на самом горизонте событий ───
const coreTip = () => ({
  name: 'Стрелец A*',
  dot: '#ffb070',
  rows: [
    ['Класс', 'сверхмассивная ЧД'],
    ['Горизонт', 'R = ' + (galaxy.blackHole ? galaxy.blackHole.radius : 6.5)],
    ['Диск', 'аккреционный, доплер']
  ],
  getWorld: (out) => galaxy.getCenter(out)
})

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }
})

renderer.domElement.addEventListener('pointerup', (e) => {
  if (!pointerDown) return
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y)
  const dt = performance.now() - pointerDown.t
  pointerDown = null
  if (moved > 6 || dt > 500) return // это было вращение камеры
  const sysIndex = pickSystemAt(e)
  if (sysIndex >= 0) {
    tooltip.hide()
    hoveredSystem = -1
    return enterSystem(sysIndex)
  }
  const obj = rayHit(e)
  if (galaxy.blackHole && galaxy.group.visible && obj === galaxy.blackHole.horizon) {
    // ─── [FEATURE:BLACKHOLE] клик по дыре — кинематографичный подлёт ───
    tooltip.hide()
    return viewCore(88)
  }
  select(obj ? planets.find((p) => p.mesh === obj) || null : null)
})

// ─── [FEATURE:HOVER] подсказка рядом с планетой или системой ───
renderer.domElement.addEventListener('pointermove', (e) => {
  if (pointerDown) return // тянем камеру — подсказку не трогаем
  if (mapMode()) {
    const index = pickSystemAt(e)
    if (index !== hoveredSystem) {
      hoveredSystem = index
      if (index >= 0) tooltip.show(systemTip(index))
      else tooltip.hide()
    }
    if (index >= 0) return // навёлся на систему — планетную подсказку не мешаем
  } else if (hoveredSystem !== -1) {
    hoveredSystem = -1
  }
  const obj = rayHit(e)
  if (!obj) {
    tooltip.hide()
    return
  }
  if (galaxy.blackHole && galaxy.group.visible && obj === galaxy.blackHole.horizon) {
    tooltip.show(coreTip())
    return
  }
  const rig = planets.find((p) => p.mesh === obj) || null
  // у выбранной планеты уже есть карточка — подсказка не нужна
  if (!rig || rig === selected) tooltip.hide()
  else tooltip.show(rig)
})
renderer.domElement.addEventListener('pointerleave', () => {
  hoveredSystem = -1
  tooltip.hide()
})

// 8. Игровой цикл
const clock = new THREE.Clock()
let starTravel = 0

function animate() {
  requestAnimationFrame(animate)

  const delta = clock.getDelta()
  const elapsed = clock.elapsedTime

  // Тумблеры «движение» и «вращение» независимо замораживают орбиты и вращение
  const motionScale = paused || !options.motion ? 0 : systemSpeed
  const spinScale = paused || !options.spin ? 0 : systemSpeed
  const orbitStep = delta * 60 * motionScale
  const spinStep = delta * 60 * spinScale

  planets.forEach((p) => {
    // ─── [FEATURE:KEPLER] движение по эллипсу: n = SPEED_FACTOR / sqrt(R³) ───
    const o = p.orbit
    if (o.a > 0) {
      o.nu += meanMotion(o.a, o.speedScale) * orbitStep
      orbitLocal(o.a, o.e, o.nu, p.holder.position).applyEuler(o.orientation)
    }

    // Осевое вращение (у Венеры spinSpeed < 0 — ретроградное)
    p.mesh.rotation.y += p.config.spinSpeed * spinStep

    // ─── [FEATURE:MOONS] ───
    p.moonRigs.forEach((m) => {
      m.orbit.rotation.y += m.speed * orbitStep
    })

    // ─── [FEATURE:SATELLITES] ───
    p.satRigs.forEach((s, i) => {
      s.orbit.rotation.y += s.speed * orbitStep
      s.satellite.group.rotation.y += 0.6 * orbitStep
      s.satellite.beaconMat.opacity =
        0.15 + 0.85 * Math.abs(Math.sin(elapsed * 3 + i))
    })
  })

  // ─── [FEATURE:BELTS] ───
  updateBelt(asteroidBelt, orbitStep)
  updateBelt(kuiperBelt, orbitStep)

  // ─── [FEATURE:COMETS] / [FEATURE:TESLA] ───
  comets.update(orbitStep)
  starman.update(orbitStep, elapsed)

  // Полёт сквозь космос: звёзды стримятся навстречу
  starTravel += MOTION_SPEED * motionScale * delta
  if (options.stars) starfield.update(starTravel)

  // ─── [FEATURE:SUN] «кипение» фотосферы + дыхание короны ───
  if (sunRig && sunRig.mesh.material.uniforms) {
    sunRig.mesh.material.uniforms.uTime.value = elapsed
  }
  if (sunFx) sunFx.update(elapsed)

  // Винтовые следы (замирают на паузе, чтобы не «схлопываться»)
  if (options.trails && !paused) trails.update(systemSpeed)

  // Медленный поворот скайбокса-туманности
  nebula.rotation.y += 0.0004 * delta * 60 * motionScale

  // ─── [FEATURE:GALAXY] галактика медленно «живёт» (вращается целиком) ───
  // Камеру отдаём в update: по ней считается доплер аккреционного диска ЧД.
  galaxy.update(delta, motionScale, camera)

  // ─── [FEATURE:SYSTEMS] планеты чужих систем — по тем же законам Кеплера ───
  if (systems) systems.update(orbitStep, spinStep)

  // Полёт камеры (наружу к галактике / внутрь системы / к объекту)
  if (camFlight) {
    camFlight.t += delta
    const k = Math.min(1, camFlight.t / camFlight.duration)
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2 // easeInOutQuad
    if (camFlight.dynamic) {
      // цель едет вместе с планетой — догоняем её, а не точку старта
      camFlight.getWorld(flightScratch)
      controls.target.lerpVectors(camFlight.fromTarget, flightScratch, e)
      flightScratch.add(camFlight.offset)
      camera.position.lerpVectors(camFlight.fromPos, flightScratch, e)
    } else {
      camera.position.lerpVectors(camFlight.fromPos, camFlight.toPos, e)
      controls.target.lerpVectors(camFlight.fromTarget, camFlight.toTarget, e)
    }
    camera.lookAt(controls.target)
    if (k >= 1) {
      camFlight = null
      controls.enabled = true
    }
  }

  // ─── [FEATURE:FOCUS] камера «прилипла» к выбранной планете ───
  // OrbitControls.target уже стоит на планете; сдвигаем камеру и цель на
  // её смещение за кадр, чтобы планета не уезжала из кадра по орбите.
  if (camFocus && !camFlight) {
    camFocus.mesh.updateWorldMatrix(true, false)
    camFocus.mesh.getWorldPosition(focusNow)
    if (focusFollowing) {
      focusDelta.copy(focusNow).sub(focusPrev)
      camera.position.add(focusDelta)
      controls.target.add(focusDelta)
    }
    focusPrev.copy(focusNow)
    focusFollowing = true
  } else {
    focusFollowing = false
  }

  // ─── [FEATURE:SYSTEMS] «едем» вместе с системой: галактика вращается,
  //     поэтому звезду системы надо держать на месте относительно камеры ───
  if (focus.kind === 'system' && focus.index > 0 && !camFlight && systems) {
    systemWorldPos(focus.index, navScratch)
    if (following) {
      navScratch2.copy(navScratch).sub(followPrev)
      camera.position.add(navScratch2)
      controls.target.add(navScratch2)
    }
    followPrev.copy(navScratch)
    following = true
  } else {
    following = false
  }

  const camDist = camera.position.distanceTo(controls.target)

  // ─── [FEATURE:SYSTEMS] отлетел от системы — вернулись к галактике ───
  if (
    (focus.kind === 'system' || focus.kind === 'core') &&
    !camFlight &&
    camDist > GALAXY.exitDistance
  )
    viewGalaxy()

  // ─── [FEATURE:GALAXY] пылевые полосы показываем только издалека:
  //     вблизи они мазали бы тёмными пятнами планеты ───
  const dustK = Math.min(
    1,
    Math.max(0, (camDist - GALAXY.dustNear) / (GALAXY.dustFar - GALAXY.dustNear))
  )
  galaxy.dust.visible = options.galaxy && dustK > 0.01
  galaxy.dust.material.opacity = GALAXY.dustOpacity * dustK

  // Маркер «вы здесь» — только на общем плане галактики
  homeMarker.visible = options.galaxy && camDist > 420

  controls.update()

  // Небо «возим» за камерой: скайбокс всегда вокруг нас
  skyRoot.position.copy(camera.position)

  // ─── [FEATURE:POSTFX] рендер через композер (RenderPass + Bloom + Output) ───
  composer.render()

  // ─── [FEATURE:CARD] / [FEATURE:HOVER] 2D-слой держим привязанным к 3D ───
  card.update(camera, renderer)
  tooltip.update(camera, renderer)
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  // композер живёт своей жизнью: размер и pixelRatio надо обновлять и ему
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(window.innerWidth, window.innerHeight)
})
