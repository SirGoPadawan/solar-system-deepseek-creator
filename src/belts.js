import * as THREE from 'three'
import { ORBIT_TILT } from './config.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:BELTS] пояса малых тел через THREE.InstancedMesh ───
// Пояс астероидов (между Марсом и Юпитером, ~1000 камней) и пояс Койпера.
// Все камни — один InstancedMesh на пояс: рисуются в один вызов.
// Каждый камень летает по своей ЭЛЛИПТИЧЕСКОЙ орбите (эксцентриситет)
// с небольшим наклоном плоскости и «кувыркается» вокруг своей оси.
// ─────────────────────────────────────────────────────────────

// Неровный камень: берём икосаэдр и радиально «обгрызаем» его.
// Геометрия неиндексированная (у каждой грани свои вершины), поэтому шум
// считаем от координаты вершины — одинаковые вершины получают одинаковый
// сдвиг и меш не рвётся по швам.
const createAsteroidGeometry = () => {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453
    const n = 0.62 + 0.66 * (h - Math.floor(h)) // 0.62..1.28
    pos.setXYZ(i, v.x * n, v.y * n * 0.86, v.z * n)
  }
  geo.computeVertexNormals()
  return geo
}

export const makeBelt = (parent, cfg) => {
  const {
    count,
    inner,
    outer,
    ySpread,
    scaleMin,
    scaleMax,
    speedMin,
    speedMax,
    eccMin = 0,
    eccMax = 0,
    incMax = 0,
    color
  } = cfg

  const group = new THREE.Group()
  group.rotation.x = ORBIT_TILT
  parent.add(group)

  const inst = new THREE.InstancedMesh(
    createAsteroidGeometry(),
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
    // Большая полуось орбиты и её эксцентриситет (общий пояс, разные орбиты)
    const a = inner + Math.random() * (outer - inner)
    const e = eccMin + Math.random() * (eccMax - eccMin)
    const scale = scaleMin + Math.random() * (scaleMax - scaleMin)
    items.push({
      a,
      e,
      // наклон плоскости орбиты + долгота узла — пояс становится «толстым» в 3D
      orient: new THREE.Euler(
        (Math.random() - 0.5) * 2 * incMax,
        Math.random() * Math.PI * 2,
        0,
        'YXZ'
      ),
      y: (Math.random() - 0.5) * ySpread,
      angle: Math.random() * Math.PI * 2,
      speed: speedMin + Math.random() * (speedMax - speedMin),
      // неправильная форма: разные размеры по осям + своё кувыркание
      sx: scale * (0.7 + Math.random() * 0.6),
      sy: scale * (0.7 + Math.random() * 0.6),
      sz: scale * (0.7 + Math.random() * 0.6),
      rx: Math.random() * Math.PI * 2,
      rz: Math.random() * Math.PI * 2
    })
  }

  return { inst, items, dummy: new THREE.Object3D(), vec: new THREE.Vector3() }
}

export const updateBelt = (belt, timeScale) => {
  const d = belt.dummy
  const v = belt.vec
  for (let i = 0; i < belt.items.length; i++) {
    const a = belt.items[i]
    a.angle += a.speed * timeScale
    // Радиус на эллипсе: r = a·(1 - e²) / (1 + e·cos θ)
    const r = (a.a * (1 - a.e * a.e)) / (1 + a.e * Math.cos(a.angle))
    v.set(Math.cos(a.angle) * r, a.y, Math.sin(a.angle) * r).applyEuler(a.orient)
    d.position.copy(v)
    d.rotation.set(a.rx + a.angle, a.angle * 1.5, a.rz)
    d.scale.set(a.sx, a.sy, a.sz)
    d.updateMatrix()
    belt.inst.setMatrixAt(i, d.matrix)
  }
  belt.inst.instanceMatrix.needsUpdate = true
}
