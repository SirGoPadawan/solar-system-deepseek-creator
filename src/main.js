import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import {
  PLANETS,
  SHADOW_MAP_SIZE,
  MOTION_SPEED,
  SYSTEM_TILT_X,
  SYSTEM_TILT_Z,
  ASTEROID_BELT,
  KUIPER_BELT,
  SPEED_STEPS,
  DEFAULT_SPEED_INDEX
} from './config.js'
import { createPlanet, createSunEffects } from './bodies.js'
import { createStarfield, createNebula } from './sky.js'
import { makeBelt, updateBelt } from './belts.js'
import { createComets, createStarman } from './comets.js'
import { createTrails } from './trails.js'
import { createControls } from './ui.js'

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
controls.maxDistance = 200
controls.maxPolarAngle = Math.PI / 2.05

// 2. Небо: звёзды + туманность
const starfield = createStarfield()
scene.add(starfield.points)

const nebula = createNebula()
scene.add(nebula)

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

// 4. Планеты (+ Солнце с короной), пояса, кометы и Тесла
const planets = PLANETS.map((config) => createPlanet(world, config))

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
  belts: true, // пояса астероидов и Койпера
  comets: true, // кометы
  tesla: true, // Tesla / Starman
  nebula: true // туманность
}
const planetVisible = planets.map(() => true)

const refreshVisibility = () => {
  starfield.points.visible = options.stars
  nebula.visible = options.nebula
  asteroidBelt.inst.visible = options.belts
  kuiperBelt.inst.visible = options.belts
  comets.root.visible = options.comets
  starman.root.visible = options.tesla
  orbitLines.forEach((line) => {
    line.visible = options.orbits
  })
  planets.forEach((rig, i) => {
    rig.orbitGroup.visible = planetVisible[i]
    trails.lines[i].visible = options.trails && planetVisible[i]
  })
}
refreshVisibility()

// 6. Интерфейс: панель слева вверху (скорость, тумблеры, параметры планеты)
let selected = null
let selectedIndex = -1

const setHighlight = (rig, on) => {
  if (!rig.emissive) return
  rig.mesh.material.emissive.copy(on ? HIGHLIGHT : rig.emissive)
}
const HIGHLIGHT = new THREE.Color(0x24406e)

// Исходные параметры планет — для кнопки «Сбросить планету»
const defaults = new WeakMap()
planets.forEach((rig) =>
  defaults.set(rig.config, {
    orbitSpeed: rig.config.orbitSpeed,
    spinSpeed: rig.config.spinSpeed,
    scale: 1
  })
)

const select = (rig) => {
  if (selected && selected !== rig) setHighlight(selected, false)
  selected = rig
  selectedIndex = rig ? planets.indexOf(rig) : -1
  if (!rig) {
    controlsUi.hideParams()
    return
  }
  setHighlight(rig, true)
  controlsUi.showParams({
    name: rig.config.name,
    orbitSpeed: rig.config.orbitSpeed,
    spinSpeed: rig.config.spinSpeed,
    scale: rig.mesh.scale.x,
    lockOrbit: rig.config.type === 'sun'
  })
}

const controlsUi = createControls({
  planets,
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
  onParamInput: (param, value) => {
    if (!selected) return
    if (param === 'orbit') selected.config.orbitSpeed = value
    else if (param === 'spin') selected.config.spinSpeed = value
    else if (param === 'size') selected.mesh.scale.setScalar(value)
  },
  onParamDefaults: () => {
    if (!selected) return
    const d = defaults.get(selected.config)
    selected.config.orbitSpeed = d.orbitSpeed
    selected.config.spinSpeed = d.spinSpeed
    selected.mesh.scale.setScalar(d.scale)
    controlsUi.setParamValues({
      orbitSpeed: d.orbitSpeed,
      spinSpeed: d.spinSpeed,
      scale: d.scale
    })
  },
  onParamClose: () => select(null)
})
controlsUi.setSpeed('×' + systemSpeed)
controlsUi.setPaused(paused)

// 7. Клик/тап по планете (перетаскивание камеры кликом не считается)
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }
})
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!pointerDown) return
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y)
  const dt = performance.now() - pointerDown.t
  pointerDown = null
  if (moved > 6 || dt > 500) return // это было вращение камеры

  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const meshes = []
  planets.forEach((p, i) => {
    if (planetVisible[i]) meshes.push(p.mesh)
  })
  const hits = raycaster.intersectObjects(meshes, false)
  select(hits.length ? planets.find((p) => p.mesh === hits[0].object) : null)
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
    p.orbitGroup.rotation.y += p.config.orbitSpeed * orbitStep
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

  controls.update()
  renderer.render(scene, camera)
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
})
