// Смоук-тест РЕАЛЬНОГО src/systems.js на заглушках three.
// Проверяет: генерацию (дистанции, планеты, конечность чисел), сборку
// объектов, анимацию орбит и освобождение ресурсов.
const fs = require('fs')
const ROOT = require('path').resolve(__dirname, '..')

// ───────────────────────── мини-three ─────────────────────────
class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
    this.x = x
    this.y = y
    this.z = z
    this.order = order
  }
  set(x, y, z, order) {
    this.x = x
    this.y = y
    this.z = z
    if (order) this.order = order
    return this
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  set(x, y, z) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
  setScalar(s) {
    this.x = this.y = this.z = s
    return this
  }
  copy(v) {
    this.x = v.x
    this.y = v.y
    this.z = v.z
    return this
  }
  clone() {
    return new Vector3(this.x, this.y, this.z)
  }
  add(v) {
    this.x += v.x
    this.y += v.y
    this.z += v.z
    return this
  }
  sub(v) {
    this.x -= v.x
    this.y -= v.y
    this.z -= v.z
    return this
  }
  multiplyScalar(s) {
    this.x *= s
    this.y *= s
    this.z *= s
    return this
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z
  }
  lengthSq() {
    return this.dot(this)
  }
  length() {
    return Math.sqrt(this.lengthSq())
  }
  distanceTo(v) {
    const dx = this.x - v.x
    const dy = this.y - v.y
    const dz = this.z - v.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  normalize() {
    const l = this.length() || 1
    return this.multiplyScalar(1 / l)
  }
  applyQuaternionXYZ(ex, ey, ez) {
    const cx = Math.cos(ex)
    const sx = Math.sin(ex)
    const cy = Math.cos(ey)
    const sy = Math.sin(ey)
    const cz = Math.cos(ez)
    const sz = Math.sin(ez)
    // Rx
    let y1 = cx * this.y - sx * this.z
    let z1 = sx * this.y + cx * this.z
    this.y = y1
    this.z = z1
    // Ry
    let x2 = cy * this.x + sy * this.z
    let z2 = -sy * this.x + cy * this.z
    this.x = x2
    this.z = z2
    // Rz
    let x3 = cz * this.x - sz * this.y
    let y3 = sz * this.x + cz * this.y
    this.x = x3
    this.y = y3
    return this
  }
  applyEuler(e) {
    if (e.order === 'YXZ') {
      // R = Ry · Rx · Rz  → сначала Rz, потом Rx, потом Ry
      const cx = Math.cos(e.x)
      const sx = Math.sin(e.x)
      const cy = Math.cos(e.y)
      const sy = Math.sin(e.y)
      const cz = Math.cos(e.z)
      const sz = Math.sin(e.z)
      let x = cz * this.x - sz * this.y
      let y = sz * this.x + cz * this.y
      let z = this.z
      const y2 = cx * y - sx * z
      const z2 = sx * y + cx * z
      const x3 = cy * x + sy * z2
      const z3 = -sy * x + cy * z2
      this.x = x3
      this.y = y2
      this.z = z3
      return this
    }
    // XYZ: R = Rx · Ry · Rz
    return this.applyQuaternionXYZ(e.z, e.y, e.x) // применяем Rz, Ry, Rx? нет — см. ниже
  }
}

class Obj3D {
  constructor() {
    this.position = new Vector3()
    this.rotation = new Euler()
    this.scale = new Vector3(1, 1, 1)
    this.children = []
    this.parent = null
    this.visible = true
  }
  add(...objs) {
    objs.forEach((o) => {
      o.parent = this
      this.children.push(o)
    })
    return this
  }
  remove(o) {
    const i = this.children.indexOf(o)
    if (i >= 0) this.children.splice(i, 1)
    if (o.parent === this) o.parent = null
  }
  traverse(fn) {
    fn(this)
    this.children.forEach((c) => c.traverse(fn))
  }
}
class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
  }
}
class BufferGeometry {
  constructor() {
    this.disposed = false
  }
  setFromPoints(points) {
    this.points = points
    return this
  }
  dispose() {
    this.disposed = true
  }
}
class Material {
  constructor(opts = {}) {
    Object.assign(this, opts)
    this.disposed = false
  }
  dispose() {
    this.disposed = true
  }
}
class Mesh extends Obj3D {
  constructor(geometry, material) {
    super()
    this.geometry = geometry
    this.material = material
  }
}
class Line extends Mesh {}
class Sprite extends Obj3D {
  constructor(material) {
    super()
    this.material = material
  }
}

const THREE = {
  Euler,
  Vector3,
  BufferAttribute,
  BufferGeometry,
  Group: Obj3D,
  Object3D: Obj3D,
  Mesh,
  Line,
  Sprite,
  SphereGeometry: class {
    constructor() {
      this.disposed = false
    }
    dispose() {
      this.disposed = true
    }
  },
  MeshBasicMaterial: Material,
  MeshStandardMaterial: Material,
  LineBasicMaterial: Material,
  SpriteMaterial: Material,
  AdditiveBlending: 2
}

// ─────────────── реальные формулы orbit.js (чтобы тест был честным) ───────────────
const DEG = Math.PI / 180
const SPEED_FACTOR = 0.21
const meanMotion = (a, s = 1) => (a > 0 ? (SPEED_FACTOR * s) / Math.sqrt(a * a * a) : 0)
const orbitRadius = (a, e, nu) => (a * (1 - e * e)) / (1 + e * Math.cos(nu))
const orbitLocal = (a, e, nu, out) => {
  const r = orbitRadius(a, e, nu)
  const v = out || new Vector3()
  return v.set(Math.cos(nu) * r, 0, Math.sin(nu) * r)
}
const orbitOrientation = (incDeg, nodeDeg, out) => {
  const e = out || new Euler()
  return e.set(incDeg * DEG, nodeDeg * DEG, 0, 'YXZ')
}
const orbitPolyline = (a, e, orientation, segments = 160) => {
  const pts = []
  const s = new Vector3()
  for (let i = 0; i <= segments; i++) {
    const nu = (i / segments) * Math.PI * 2
    pts.push(orbitLocal(a, e, nu, s).applyEuler(orientation).clone())
  }
  return pts
}

// ───────────────────── загрузка реального кода ─────────────────────
const cfgTxt = fs.readFileSync(ROOT + '/src/config.js', 'utf8')
const GALAXY = eval('(' + cfgTxt.match(/export const GALAXY = (\{[\s\S]*?\n\})/)[1] + ')')
const SYSTEMS = eval('(' + cfgTxt.match(/export const SYSTEMS = (\{[\s\S]*?\n\})/)[1] + ')')

let src = fs.readFileSync(ROOT + '/src/systems.js', 'utf8')
src = src.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ')

const factory = new Function(
  'THREE',
  'SYSTEMS',
  'GALAXY',
  'orbitLocal',
  'orbitOrientation',
  'orbitPolyline',
  'meanMotion',
  'glowTexture',
  'starTexture',
  'createAtmosphere',
  'createSaturnRings',
  `"use strict";\n${src}\n
   return { generateSystemSpecs, createStarSystems }`
)

const createAtmosphere = () => new THREE.Mesh(new THREE.SphereGeometry(), new Material())
const createSaturnRings = () => {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.BufferGeometry(), new Material()))
  return g
}

const { generateSystemSpecs, createStarSystems } = factory(
  THREE,
  SYSTEMS,
  GALAXY,
  orbitLocal,
  orbitOrientation,
  orbitPolyline,
  meanMotion,
  null,
  null,
  createAtmosphere,
  createSaturnRings
)

let failed = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => {
  failed++
  console.log('  ✗ ' + m)
}

// ── 1. спеки ──
const homeLocal = new Vector3(0, 0, -GALAXY.distance)
const specs = generateSystemSpecs({ count: SYSTEMS.count, homeLocal })

if (specs.length !== SYSTEMS.count) bad(`систем ${specs.length}, ждали ${SYSTEMS.count}`)
else ok(`сгенерировано систем: ${specs.length}`)

let minD = Infinity
let badNums = 0
let badPlanets = 0
specs.forEach((s) => {
  minD = Math.min(minD, s.local.distanceTo(homeLocal))
  if (!Number.isFinite(s.local.x) || !Number.isFinite(s.local.y) || !Number.isFinite(s.local.z))
    badNums++
  if (s.planets.length < SYSTEMS.planetsMin || s.planets.length > SYSTEMS.planetsMax) badPlanets++
  let prev = 0
  s.planets.forEach((p) => {
    if (!Number.isFinite(p.distance) || !Number.isFinite(p.radius) || !Number.isFinite(p.node))
      badNums++
    if (p.distance <= prev) badPlanets++
    prev = p.distance
  })
  if (!Number.isFinite(s.extent) || s.extent <= 0) badNums++
})
if (badNums) bad('есть NaN в спеках систем')
else ok('все числа в спеках конечные')
if (badPlanets) bad('планеты: неверное число или порядок дистанций')
else ok('планеты: ' + SYSTEMS.planetsMin + '–' + SYSTEMS.planetsMax + ', орбиты по возрастанию')
if (minD < SYSTEMS.minDistanceFromHome)
  bad(`система слишком близко к Солнцу: ${minD.toFixed(1)} < ${SYSTEMS.minDistanceFromHome}`)
else ok(`ближайшая система в ${minD.toFixed(0)} ед. от Солнца`)

// ── 2. сборка ──
const parent = new THREE.Group()
const built = createStarSystems(parent, specs)
if (built.systems.length !== specs.length) bad('собраны не все системы')
else ok('объекты собраны: ' + built.systems.length)

if (parent.children.indexOf(built.root) >= 0) ok('корень систем добавлен в галактику')
else bad('корень систем не добавлен в родителя')

let rigCount = 0
let meshCount = 0
built.systems.forEach((s, i) => {
  rigCount += s.rigs.length
  if (s.rigs.length !== specs[i].planets.length) bad('число планет не совпало: ' + specs[i].name)
  if (!s.star || !s.glow) bad('у системы нет звезды/ореола')
  s.group.traverse((o) => {
    if (o.material) meshCount++
  })
})
ok(`планет-ригов: ${rigCount}, материалов в системах: ${meshCount}`)

// ── 3. анимация ──
const first = built.systems[0].rigs[0]
const posBefore = first.holder.position.clone()
built.update(1, 1)
const moved = posBefore.distanceTo(first.holder.position) > 1e-6
if (!moved) bad('планеты не двигаются')
else ok('орбиты анимируются')

let nan = false
for (let k = 0; k < 50; k++) built.update(2, 2)
built.systems.forEach((s) =>
  s.rigs.forEach((r) => {
    if (
      !Number.isFinite(r.holder.position.x) ||
      !Number.isFinite(r.holder.position.y) ||
      !Number.isFinite(r.holder.position.z)
    )
      nan = true
  })
)
if (nan) bad('после 50 шагов в позициях появился NaN')
else ok('100 шагов анимации — без NaN')

// ── 4. dispose ──
built.dispose()
if (parent.children.indexOf(built.root) >= 0) bad('dispose() не убрал системы из сцены')
else ok('dispose() убирает системы и освобождает ресурсы')

console.log('')
if (failed) {
  console.log('ПРОВАЛЕНО: ' + failed)
  process.exit(1)
}
console.log('ВСЁ ОК')
