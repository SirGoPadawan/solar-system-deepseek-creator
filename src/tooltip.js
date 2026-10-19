import * as THREE from 'three'
import { PLANET_INFO } from './planetInfo.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:HOVER] футуристичная плашка при наведении ───
// Наводишь мышь на планету — рядом с ней всплывает 2D-окно
// с массой, температурой и составом атмосферы. Это отдельный слой
// поверх 3D, он не мешает клику (pointer-events: none).
// ─────────────────────────────────────────────────────────────

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export const createHoverTooltip = () => {
  const root = document.createElement('div')
  root.className = 'hover-tip hidden'
  root.innerHTML = `
    <div class="ht-head">
      <span class="ht-dot"></span>
      <span class="ht-name" data-role="name"></span>
    </div>
    <div class="ht-grid">
      <span class="ht-k">Масса</span><b class="ht-v" data-role="mass"></b>
      <span class="ht-k">Температура</span><b class="ht-v" data-role="temp"></b>
      <span class="ht-k">Атмосфера</span><b class="ht-v" data-role="atmo"></b>
    </div>
  `
  document.body.appendChild(root)

  const els = {
    name: root.querySelector('[data-role="name"]'),
    mass: root.querySelector('[data-role="mass"]'),
    temp: root.querySelector('[data-role="temp"]'),
    atmo: root.querySelector('[data-role="atmo"]')
  }

  let rig = null
  const anchor = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  const hide = () => {
    rig = null
    root.classList.add('hidden')
  }

  const show = (target) => {
    if (target === rig) return
    if (!target) return hide()
    rig = target
    const info = PLANET_INFO[target.config.type]
    const h = (info && info.hover) || { mass: '—', temp: '—', atmo: '—' }
    els.name.textContent = target.config.name
    els.mass.textContent = h.mass
    els.temp.textContent = h.temp
    els.atmo.textContent = h.atmo
    root.classList.remove('hidden')
  }

  // Плашка висит рядом с планетой (чуть в стороне от центра)
  const update = (camera, renderer) => {
    if (!rig) return
    const rect = renderer.domElement.getBoundingClientRect()
    const vw = rect.width || window.innerWidth
    const vh = rect.height || window.innerHeight

    rig.mesh.updateWorldMatrix(true, false)
    rig.mesh.getWorldPosition(scratch)
    scratch.project(camera)
    if (scratch.z > 1) return hide()

    const x = (scratch.x * 0.5 + 0.5) * vw
    const y = (-scratch.y * 0.5 + 0.5) * vh
    anchor.set(x + 18, y - 12, 0)

    const w = root.offsetWidth
    const h = root.offsetHeight
    const left = clamp(anchor.x, 10, Math.max(10, vw - w - 10))
    const top = clamp(anchor.y - h, 10, Math.max(10, vh - h - 10))
    root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  return { root, show, hide, update, current: () => rig }
}
