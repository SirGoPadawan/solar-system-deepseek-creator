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
import { createHUD, createPlanetPanel } from './ui.js'

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
renderer.toneMappingExposure = 2.4
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

// 3. Свет
const ambientLight = new THREE.AmbientLight(0x1a1a24, 2.0)
scene.add(ambientLight)

const sunLight = new THREE.PointLight(0xfff3db, 30, 400)
sunLight.decay = 1
sunLight.castShadow = true
sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE
sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE
world.add(sunLight)

const rimLight = new THREE.DirectionalLight(0x6688ff, 0.6)
rimLight.position.set(10, 20, 10)
world.add(rimLight)

// 4. Планеты (+ Солнце с короной), пояса, кометы и Тесла
const planets = PLANETS.map((config) => createPlanet(world, config))

let sunFx = null
const sunRig = planets.find((p) => p.config.type === 'sun')
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

// 5. Глобальная скорость системы + UI
let speedIndex = DEFAULT_SPEED_INDEX
let systemSpeed = SPEED_STEPS[speedIndex]
let paused = false

const hud = createHUD()
const updateSpeedUI = () => {
  hud.setSpeed('×' + systemSpeed)
  hud.setPaused(paused)
}
hud.onClick((act) => {
  if (act === 'faster') speedIndex = Math.min(SPEED_STEPS.length - 1, speedIndex + 1)
  else if (act === 'slower') speedIndex = Math.max(0, speedIndex - 1)
  else if (act === 'reset') {
    speedIndex = DEFAULT_SPEED_INDEX
    paused = false
  } else if (act === 'pause') paused = !paused
  systemSpeed = SPEED_STEPS[speedIndex]
  updateSpeedUI()
})
updateSpeedUI()

// 6. Меню планеты по клику + подсветка выбранной
const panel = createPlanetPanel()
const HIGHLIGHT = new THREE.Color(0x24406e)
let selected = null

const setHighlight = (rig, on) => {
  if (!rig.emissive) return
  rig.mesh.material.emissive.copy(on ? HIGHLIGHT : rig.emissive)
}

const select = (rig) => {
  if (selected && selected !== rig) setHighlight(selected, false)
  selected = rig
  if (!rig) {
    panel.hide()
    return
  }
  setHighlight(rig, true)
  panel.show({
    name: rig.config.name,
    orbitSpeed: rig.config.orbitSpeed,
    spinSpeed: rig.config.spinSpeed,
    scale: rig.mesh.scale.x,
    lockOrbit: rig.config.type === 'sun'
  })
}

// Запоминаем исходные параметры для кнопки «Сбросить планету»
const defaults = new WeakMap()
planets.forEach((rig) =>
  defaults.set(rig.config, {
    orbitSpeed: rig.config.orbitSpeed,
    spinSpeed: rig.config.spinSpeed,
    scale: 1
  })
)

panel.onClose(() => select(null))
panel.onInput((param, value) => {
  if (!selected) return
  if (param === 'orbit') selected.config.orbitSpeed = value
  else if (param === 'spin') selected.config.spinSpeed = value
  else if (param === 'size') selected.mesh.scale.setScalar(value)
})
panel.onDefaults(() => {
  if (!selected) return
  const d = defaults.get(selected.config)
  selected.config.orbitSpeed = d.orbitSpeed
  selected.config.spinSpeed = d.spinSpeed
  selected.mesh.scale.setScalar(d.scale)
  panel.setValues({
    orbitSpeed: d.orbitSpeed,
    spinSpeed: d.spinSpeed,
    scale: d.scale
  })
})

// Клик/тап по планете (перетаскивание камеры не считается кликом)
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
  const hits = raycaster.intersectObjects(
    planets.map((p) => p.mesh),
    false
  )
  select(hits.length ? planets.find((p) => p.mesh === hits[0].object) : null)
})

// 7. Игровой цикл
const clock = new THREE.Clock()
let starTravel = 0

function animate() {
  requestAnimationFrame(animate)

  const delta = clock.getDelta()
  const elapsed = clock.elapsedTime
  const speed = paused ? 0 : systemSpeed
  const timeScale = delta * 60 * speed

  planets.forEach((p) => {
    p.orbitGroup.rotation.y += p.config.orbitSpeed * timeScale
    p.mesh.rotation.y += p.config.spinSpeed * timeScale

    // ─── [FEATURE:MOONS] ───
    p.moonRigs.forEach((m) => {
      m.orbit.rotation.y += m.speed * timeScale
    })

    // ─── [FEATURE:SATELLITES] ───
    p.satRigs.forEach((s, i) => {
      s.orbit.rotation.y += s.speed * timeScale
      s.satellite.group.rotation.y += 0.6 * timeScale
      s.satellite.beaconMat.opacity =
        0.15 + 0.85 * Math.abs(Math.sin(elapsed * 3 + i))
    })
  })

  // ─── [FEATURE:BELTS] ───
  updateBelt(asteroidBelt, timeScale)
  updateBelt(kuiperBelt, timeScale)

  // ─── [FEATURE:COMETS] / [FEATURE:TESLA] ───
  comets.update(timeScale)
  starman.update(timeScale, elapsed)

  // Полёт сквозь космос: звёзды стримятся навстречу
  starTravel += MOTION_SPEED * speed * delta
  starfield.update(starTravel)

  // ─── [FEATURE:SUN] корона «дышит» ───
  if (sunFx) sunFx.update(elapsed)

  // Винтовые следы (замирают на паузе, чтобы не «схлопываться»)
  if (!paused) trails.update(systemSpeed)

  // Медленный поворот скайбокса-туманности
  nebula.rotation.y += 0.0004 * timeScale

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
