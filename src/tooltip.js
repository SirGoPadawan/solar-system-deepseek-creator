import * as THREE from 'three'
import { PLANET_INFO } from './planetInfo.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:HOVER] футуристичная плашка при наведении ───
// Наводишь мышь на планету — рядом с ней всплывает 2D-окно
// с массой, температурой и составом атмосферы.
// С [FEATURE:SYSTEMS] та же плашка показывает и системы на карте
// галактики: просто другой набор строк (см. `rows` ниже).
// Это отдельный слой поверх 3D, он не мешает клику (pointer-events: none).
// ─────────────────────────────────────────────────────────────

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export const createHoverTooltip = () => {
  const root = document.createElement('div')
  root.className = 'hover-tip hidden'
  root.innerHTML = `
    <div class="ht-head">
      <span class="ht-dot" data-role="dot"></span>
      <span class="ht-name" data-role="name"></span>
    </div>
    <div class="ht-grid" data-role="grid"></div>
  `
  document.body.appendChild(root)

  const els = {
    name: root.querySelector('[data-role="name"]'),
    grid: root.querySelector('[data-role="grid"]'),
    dot: root.querySelector('[data-role="dot"]')
  }

  let target = null
  const anchor = new THREE.Vector3()
  const scratch = new THREE.Vector3()

  // Строки вида [[подпись, значение], ...] — ровно три, как в макете
  const setRows = (rows) => {
    els.grid.innerHTML = rows
      .map(([k, v]) => `<span class="ht-k">${k}</span><b class="ht-v">${v}</b>`)
      .join('')
  }

  const hide = () => {
    target = null
    root.classList.add('hidden')
  }

  // target — либо «риг» планеты (config + mesh), либо описание:
  //   { name, dot, rows, world | getWorld }
  const show = (next) => {
    if (!next || next === target) return
    if (!next) return hide()
    target = next

    if (next.rows) {
      els.name.textContent = next.name
      setRows(next.rows)
      els.dot.style.background = next.dot || '#8fd0ff'
      els.dot.style.boxShadow = `0 0 10px ${next.dot || '#8fd0ff'}`
    } else {
      const info = PLANET_INFO[next.config.type]
      const h = (info && info.hover) || { mass: '—', temp: '—', atmo: '—' }
      els.name.textContent = next.config.name
      setRows([
        ['Масса', h.mass],
        ['Температура', h.temp],
        ['Атмосфера', h.atmo]
      ])
      els.dot.style.background = ''
      els.dot.style.boxShadow = ''
    }

    root.classList.remove('hidden')
  }

  // Откуда брать якорь в мировых координатах
  const anchorOf = (out) => {
    if (target.getWorld) return target.getWorld(out)
    if (target.world) return out.copy(target.world)
    target.mesh.updateWorldMatrix(true, false)
    return target.mesh.getWorldPosition(out)
  }

  // Плашка висит рядом с объектом (чуть в стороне от центра)
  const update = (camera, renderer) => {
    if (!target) return
    const rect = renderer.domElement.getBoundingClientRect()
    const vw = rect.width || window.innerWidth
    const vh = rect.height || window.innerHeight

    anchorOf(scratch)
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

  return { root, show, hide, update, current: () => target }
}
