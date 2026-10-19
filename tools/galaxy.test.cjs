// Смоук-тест РЕАЛЬНОГО кода src/galaxy.js с минимальной, но честной
// реализацией классов three. Ловит то, что не видит `node --check`:
// несуществующие методы (как Color.mix), опечатки в переменных, NaN в
// массивах и — главное — нарушение геометрии: Солнечная система ОБЯЗАНА
// лежать в плоскости диска галактики.
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
  addScaledVector(v, s) {
    this.x += v.x * s
    this.y += v.y * s
    this.z += v.z * s
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
  normalize() {
    const l = this.length() || 1
    return this.multiplyScalar(1 / l)
  }
  // порядок 'XYZ': v' = Rx · Ry · Rz · v (как в three)
  applyEuler(e) {
    const cx = Math.cos(e.x)
    const sx = Math.sin(e.x)
    const cy = Math.cos(e.y)
    const sy = Math.sin(e.y)
    const cz = Math.cos(e.z)
    const sz = Math.sin(e.z)
    const x1 = cz * this.x - sz * this.y
    const y1 = sz * this.x + cz * this.y
    const z1 = this.z
    const x2 = cy * x1 + sy * z1
    const y2 = y1
    const z2 = -sy * x1 + cy * z1
    this.x = x2
    this.y = cx * y2 - sx * z2
    this.z = sx * y2 + cx * z2
    return this
  }
}

class Color {
  constructor(v = 0xffffff) {
    if (typeof v === 'number')
      this.setHex(v)
    else this.set(1, 1, 1)
  }
  setHex(v) {
    this.r = ((v >> 16) & 255) / 255
    this.g = ((v >> 8) & 255) / 255
    this.b = (v & 255) / 255
    return this
  }
  copy(c) {
    this.r = c.r
    this.g = c.g
    this.b = c.b
    return this
  }
  lerp(c, a) {
    this.r += (c.r - this.r) * a
    this.g += (c.g - this.g) * a
    this.b += (c.b - this.b) * a
    return this
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
    this.renderOrder = 0
    this.frustumCulled = true
    this.userData = {}
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
}

class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
  }
}
class BufferGeometry {
  constructor() {
    this.attributes = {}
    this.disposed = false
  }
  setAttribute(name, attr) {
    this.attributes[name] = attr
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
class Points extends Obj3D {
  constructor(geometry, material) {
    super()
    this.geometry = geometry
    this.material = material
  }
}
class Mesh extends Points {}
class SphereGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super()
    this.parameters = { radius }
  }
}
class RingGeometry extends SphereGeometry {
  constructor(inner = 0.5, outer = 1) {
    super(outer)
    this.innerRadius = inner
    this.outerRadius = outer
  }
}
class Sprite extends Obj3D {
  constructor(material) {
    super()
    this.material = material
  }
}
class CanvasTexture {
  constructor(canvas) {
    this.image = canvas
    this.disposed = false
  }
  dispose() {
    this.disposed = true
  }
}

const THREE = {
  Euler,
  Vector3,
  Color,
  BufferAttribute,
  BufferGeometry,
  PointsMaterial: Material,
  SpriteMaterial: Material,
  MeshBasicMaterial: Material,
  Points,
  Mesh,
  Sprite,
  Group: Obj3D,
  SphereGeometry,
  RingGeometry,
  CanvasTexture,
  AdditiveBlending: 2,
  NormalBlending: 1,
  DoubleSide: 2,
  LinearFilter: 1006,
  SRGBColorSpace: 'srgb'
}

// ───────────────────── загрузка реального кода ─────────────────────
const cfgTxt = fs.readFileSync(ROOT + '/src/config.js', 'utf8')
const galaxyLiteral = cfgTxt.match(/export const GALAXY = (\{[\s\S]*?\n\})/)[1]
const GALAXY = eval('(' + galaxyLiteral + ')')

let src = fs.readFileSync(ROOT + '/src/galaxy.js', 'utf8')
src = src.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ')

// Чёрная дыра — отдельный модуль: грузим и его настоящий код, чтобы тест
// проверял и сборку диска/сферы, и dispose().
let bhSrc = fs.readFileSync(ROOT + '/src/blackhole.js', 'utf8')
bhSrc = bhSrc.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ')
const bhFactory = new Function(
  'THREE',
  'starTexture',
  'glowTexture',
  `"use strict";\n${bhSrc}\n return { createBlackHole }`
)
const { createBlackHole } = bhFactory(THREE, null, null)

const factory = new Function(
  'THREE',
  'GALAXY',
  'starTexture',
  'glowTexture',
  'createBlackHole',
  `"use strict";\n${src}\n
   return { generateGalaxyPoints, randomGalaxyConfig, createGalaxy, GALAXY_PRESETS }`
)
const api = factory(THREE, GALAXY, null, null, createBlackHole)

let failed = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => {
  failed++
  console.log('  ✗ ' + m)
}

// ── 0. сам «мини-three»: проверяем, что applyEuler считает как three ──
;(() => {
  const a = new Vector3(0, 1, 0).applyEuler(new Euler(Math.PI / 2, 0, 0))
  const b = new Vector3(0, 0, 1).applyEuler(new Euler(0, Math.PI / 2, 0))
  const eps = 1e-9
  if (Math.abs(a.z - 1) > eps) bad('стенд: Rx(90°) (0,1,0) → (0,0,1)')
  else if (Math.abs(b.x - 1) > eps) bad('стенд: Ry(90°) (0,0,1) → (1,0,0)')
  else ok('стенд-математика совпадает с three')
})()

// ── 1. генератор звёзд ──
const g = api.generateGalaxyPoints(GALAXY)
const count = GALAXY.count
const finite = (arr) => {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false
  return true
}
if (g.positions.length !== count * 3) bad('positions: ожидали ' + count * 3)
else if (!finite(g.positions)) bad('positions содержат NaN/Infinity')
else ok('звёзды: ' + count + ' позиций, все конечные')

if (!finite(g.colors)) bad('colors содержат NaN/Infinity')
else if (g.colors.some((v) => v < 0 || v > 2.5)) bad('colors вне допустимого диапазона')
else ok('цвета в норме')

const dustCount = Math.round(count * GALAXY.dustShare)
if (g.dustPositions.length !== dustCount * 3) bad('пыль: ожидали ' + dustCount * 3)
else if (!finite(g.dustPositions)) bad('пыль содержит NaN')
else ok('пыль: ' + dustCount + ' точек')

// ── 2. createGalaxy: сборка и геометрия ──
const galaxy = api.createGalaxy(GALAXY)
const n = galaxy.getNormal(new Vector3())
const P = galaxy.getCenter(new Vector3())

if (Math.abs(P.length() - GALAXY.distance) > 1e-6)
  bad(`центр галактики на ${P.length().toFixed(2)} вместо ${GALAXY.distance}`)
else ok('центр галактики — на расстоянии ' + GALAXY.distance + ' от Солнца')

// Солнце в плоскости диска: проекция (0 - P) на нормаль должна быть 0
const planeOffset = Math.abs(P.clone().multiplyScalar(-1).dot(n))
if (planeOffset > 1e-6)
  bad(`Солнце вне плоскости диска на ${planeOffset.toFixed(4)}`)
else ok('Солнечная система лежит В плоскости диска')

// в локальных координатах Солнце должно быть внутри радиуса диска
const local = P.clone().multiplyScalar(-1) // длина сохраняется при повороте
const localRadius = Math.sqrt(local.x * local.x + local.z * local.z)
if (localRadius > GALAXY.radius)
  bad(`Солнце снаружи диска: ${localRadius.toFixed(1)} > ${GALAXY.radius}`)
else ok(`Солнце внутри диска: ${localRadius.toFixed(1)} / ${GALAXY.radius}`)

// ось вращения диска и дитя-структура
if (!galaxy.points.children.includes(galaxy.dust)) bad('пыль не прицеплена к диску')
else ok('пыль вращается вместе с диском')
if (GALAXY.starGlow && (!galaxy.halo || galaxy.halo.parent !== galaxy.points))
  bad('слой ореола звёзд не добавлен в диск')
else if (galaxy.halo && galaxy.halo.renderOrder >= galaxy.points.renderOrder)
  bad('ореол рисуется после ядер звёзд (должен быть под ними)')
else ok('слой ореола звёзд на месте (' + GALAXY.haloSize + ' px)')
if (!galaxy.core || galaxy.core.renderOrder <= galaxy.dust.renderOrder)
  bad('свечение ядра перекрыло бы пыль (renderOrder)')
else ok('порядок отрисовки: диск → пыль → ядро')

if (Math.abs(galaxy.viewDistance - GALAXY.radius * 2.3) > 1e-6)
  bad('viewDistance не соответствует радиусу')
else ok('дистанция обзора: ' + Math.round(galaxy.viewDistance))

// ── [FEATURE:BLACKHOLE] чёрная дыра в центре спирали ──
const bh = galaxy.blackHole
if (!bh) bad('чёрная дыра не создана')
else {
  if (bh.root.parent !== galaxy.group) bad('чёрная дыра не в группе галактики')
  else if (bh.root.position.lengthSq() > 1e-9) bad('чёрная дыра не в локальном (0,0,0)')
  else ok('чёрная дыра в центре спирали (локальные 0,0,0)')

  const horizonR = bh.horizon.geometry.parameters.radius
  if (Math.abs(horizonR - GALAXY.blackHole.radius) > 1e-9)
    bad('радиус горизонта не совпадает с конфигом')
  else ok('сфера Шварцшильда: R = ' + horizonR)

  const parts = bh.particles.reduce((s, p) => s + p.geometry.attributes.position.array.length / 3, 0)
  if (parts !== GALAXY.blackHole.particles)
    bad('частиц диска ' + parts + ' вместо ' + GALAXY.blackHole.particles)
  else ok('частиц аккреционного диска: ' + parts)

  // диск должен реально вращаться (и быстрее галактики)
  const a0 = bh.particles[0].rotation.y
  bh.update(1, 1)
  const spin = Math.abs(bh.particles[0].rotation.y - a0)
  if (spin < 0.1) bad('частицы диска не вращаются')
  else if (spin <= GALAXY.rotationSpeed) bad('диск вращается не быстрее галактики')
  else ok('диск вращается быстро: ' + spin.toFixed(2) + ' рад/с')
}

// вращение
const before = galaxy.points.rotation.y
galaxy.update(1, 1)
if (Math.abs(galaxy.points.rotation.y - before - GALAXY.rotationSpeed) > 1e-9)
  bad('update() не вращает диск')
else ok('вращение диска: ' + GALAXY.rotationSpeed + ' рад/с')

// dispose не должен падать и должен освободить геометрию
const bhHorizon = galaxy.blackHole && galaxy.blackHole.horizon
galaxy.dispose()
if (!galaxy.points.geometry.disposed || !galaxy.dust.geometry.disposed)
  bad('dispose() не освободил геометрию')
else if (bhHorizon && !bhHorizon.geometry.disposed)
  bad('dispose() не освободил чёрную дыру')
else ok('dispose() освобождает ресурсы')

// ── 3. случайные галактики ──
for (let i = 0; i < 12; i++) {
  const cfg = api.randomGalaxyConfig()
  const gg = api.createGalaxy(cfg)
  const nn = gg.getNormal(new Vector3())
  const pp = gg.getCenter(new Vector3())
  if (Math.abs(pp.dot(nn)) > 1e-6) bad('случайная галактика: Солнце вне плоскости')
  if (cfg.branches !== 4) bad('случайная галактика: не 4 рукава')
  gg.dispose()
}
ok('12 случайных галактик собрались, Солнце всегда в плоскости')

// ── 4. палитры ──
ok('палитры: ' + api.GALAXY_PRESETS.map((p) => p.name).join(', '))

console.log('')
if (failed) {
  console.log('ПРОВАЛЕНО: ' + failed)
  process.exit(1)
}
console.log('ВСЁ ОК')
