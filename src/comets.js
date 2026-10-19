import * as THREE from 'three'
import { COMETS, TESLA } from './config.js'
import { glowTexture } from './textures.js'
import { buildTesla, createEllipseOrbit } from './bodies.js'

// ─────────────────────────────────────────────────────────────
// «ГОСТИ» СИСТЕМЫ: кометы (лёд + газовый хвост от Солнца) и
// Tesla Roadster со Starman (запущен Илоном Маском на Falcon Heavy).
// ─────────────────────────────────────────────────────────────

const TAIL_POINTS = 44

// ─── [FEATURE:COMETS] ───
export const createComets = (parent) => {
  const comets = COMETS.map((cfg) => {
    const group = new THREE.Object3D()
    parent.add(group)

    const nucleus = new THREE.Mesh(
      new THREE.IcosahedronGeometry(cfg.size, 1),
      new THREE.MeshBasicMaterial({ color: 0xe6f6ff, toneMapped: false })
    )
    group.add(nucleus)

    const coma = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x9fe8ff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      })
    )
    coma.scale.setScalar(cfg.size * 10)
    group.add(coma)

    // Хвост — линия в локальных координатах кометы (группу НЕ вращаем,
    // поэтому направление хвоста совпадает с направлением от Солнца)
    const positions = new Float32Array(TAIL_POINTS * 3)
    const colors = new Float32Array(TAIL_POINTS * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)
    )
    const tail = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    )
    tail.frustumCulled = false
    group.add(tail)

    createEllipseOrbit(parent, cfg.a, cfg.e, cfg.inc, 0x66ccff, 0.1)

    return {
      cfg,
      group,
      nucleus,
      tail: { positions, colors, geometry },
      euler: new THREE.Euler(cfg.inc, 0, 0, 'XYZ'),
      nu: cfg.nu,
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3()
    }
  })

  const update = (timeScale) => {
    comets.forEach((c) => {
      const { a, e } = c.cfg
      let r = (a * (1 - e * e)) / (1 + e * Math.cos(c.nu))
      // Ближе к Солнцу — быстрее (грубо по закону площадей): ω ∝ 1/r².
      // Ограничиваем сверху, иначе у перигелия комета «проскакивает» кадр.
      const rNorm = r / a
      let rate = (0.006 * c.cfg.speed) / (rNorm * rNorm)
      rate = Math.min(rate, 0.03)
      c.nu = (c.nu + rate * timeScale) % (Math.PI * 2)

      r = (a * (1 - e * e)) / (1 + e * Math.cos(c.nu))
      c.pos.set(Math.cos(c.nu) * r, 0, Math.sin(c.nu) * r).applyEuler(c.euler)
      c.group.position.copy(c.pos)
      c.nucleus.rotation.y += 0.05 * timeScale

      // Хвост всегда направлен от Солнца и растёт при сближении
      c.dir.copy(c.pos).normalize()
      const len = c.cfg.tail * Math.min(4, Math.max(0.4, 2.6 - (r / a) * 1.9))
      const p = c.tail.positions
      const col = c.tail.colors
      for (let k = 0; k < TAIL_POINTS; k++) {
        const t = k / (TAIL_POINTS - 1)
        p[k * 3] = c.dir.x * len * t
        p[k * 3 + 1] = c.dir.y * len * t
        p[k * 3 + 2] = c.dir.z * len * t
        const f = Math.pow(1 - t, 1.6)
        col[k * 3] = 0.55 * f
        col[k * 3 + 1] = 0.85 * f
        col[k * 3 + 2] = 1.0 * f
      }
      c.tail.geometry.attributes.position.needsUpdate = true
      c.tail.geometry.attributes.color.needsUpdate = true
    })
  }

  return { update }
}

// ─── [FEATURE:TESLA] Tesla Roadster со Starman на гелиоцентрической орбите ───
export const createStarman = (parent) => {
  const { group, glowMat } = buildTesla(TESLA.scale)
  parent.add(group)

  createEllipseOrbit(parent, TESLA.a, TESLA.e, TESLA.inc, 0xff6a6a, 0.14)

  const euler = new THREE.Euler(TESLA.inc, 0, 0, 'XYZ')
  const pos = new THREE.Vector3()
  let nu = TESLA.nu

  const update = (timeScale, elapsed) => {
    const { a, e, speed } = TESLA
    let r = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
    const rNorm = r / a
    const rate = Math.min(0.03, speed / (rNorm * rNorm))
    nu = (nu + rate * timeScale) % (Math.PI * 2)

    r = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
    pos.set(Math.cos(nu) * r, 0, Math.sin(nu) * r).applyEuler(euler)
    group.position.copy(pos)
    // Лёгкое кувыркание в невесомости
    group.rotation.y += 0.25 * timeScale
    group.rotation.x += 0.05 * timeScale
    // Пульсирующая подсветка, чтобы Теслу было видно в кадре
    glowMat.opacity = 0.22 + 0.18 * Math.abs(Math.sin(elapsed * 2))
  }

  return { update, group }
}
