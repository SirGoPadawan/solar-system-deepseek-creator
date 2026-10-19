import * as THREE from 'three'
import { PLANET_INFO } from './planetInfo.js'

// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:CARD] карточка планеты над самой планетой ───
// Вместо меню слева вверху описание, факты и крутилки показываются
// прямо над выбранным телом и едут за ним по экрану. Карточку можно
// «пришпилить» (📌), тогда она остаётся на месте и не заставляет
// бегать за собой. Линия-поводырь всегда связывает карточку с планетой.
// ─────────────────────────────────────────────────────────────

const FALLBACK = { tag: 'Небесное тело', desc: '', facts: [] }
const MARGIN = 14
const GAP = 14 // зазор между планетой и низом карточки

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

const SCALE_ORBIT = 100 // слайдер 0..300  -> множитель 0..3
const SCALE_SPIN = 1000 // слайдер -80..80 -> вращение -0.08..0.08
const SCALE_SIZE = 100 // слайдер 50..250 -> размер 0.5..2.5

export const createPlanetCard = ({
  onParamInput = () => {},
  onParamDefaults = () => {},
  onClose = () => {}
}) => {
  const root = document.createElement('div')
  root.className = 'planet-card hidden'
  root.innerHTML = `
    <div class="pc-head">
      <div class="pc-titles">
        <span class="pc-name" data-role="name">Планета</span>
        <span class="pc-tag" data-role="tag"></span>
      </div>
      <div class="pc-actions">
        <button class="pc-mini" data-act="pin" title="Закрепить на месте">📌</button>
        <button class="pc-mini" data-act="close" title="Закрыть">×</button>
      </div>
    </div>
    <div class="pc-body">
      <p class="pc-desc" data-role="desc"></p>
      <ul class="pc-facts" data-role="facts"></ul>
      <div class="pc-params">
        <label class="pc-row">Скорость орбиты <b data-role="orbitVal"></b>
          <input type="range" data-role="orbit" min="0" max="300" step="5">
        </label>
        <label class="pc-row">Вращение вокруг оси <b data-role="spinVal"></b>
          <input type="range" data-role="spin" min="-80" max="80" step="1">
        </label>
        <label class="pc-row">Размер <b data-role="sizeVal"></b>
          <input type="range" data-role="size" min="50" max="250" step="5">
        </label>
        <button class="pc-reset" data-act="defaults">Сбросить планету</button>
      </div>
    </div>
  `
  document.body.appendChild(root)

  // Линия-поводырь «планета → карточка» (SVG поверх канваса)
  const link = document.createElement('div')
  link.className = 'card-link hidden'
  link.innerHTML =
    '<svg width="100%" height="100%"><line/><circle r="3"/></svg>'
  document.body.appendChild(link)
  const svgLine = link.querySelector('line')
  const svgDot = link.querySelector('circle')

  const q = (sel) => root.querySelector(sel)
  const els = {
    name: q('[data-role="name"]'),
    tag: q('[data-role="tag"]'),
    desc: q('[data-role="desc"]'),
    facts: q('[data-role="facts"]'),
    orbit: q('[data-role="orbit"]'),
    spin: q('[data-role="spin"]'),
    size: q('[data-role="size"]'),
    orbitVal: q('[data-role="orbitVal"]'),
    spinVal: q('[data-role="spinVal"]'),
    sizeVal: q('[data-role="sizeVal"]'),
    pin: q('[data-act="pin"]')
  }

  let rig = null
  let pinned = false
  const box = { left: 0, top: 0 }
  const dim = { w: 0, h: 0 }

  // Скрэтчи, чтобы не аллоцировать в кадре
  const world = new THREE.Vector3()
  const center = new THREE.Vector3()
  const top = new THREE.Vector3()
  const up = new THREE.Vector3()

  const refreshLabels = () => {
    els.orbitVal.textContent = '×' + (els.orbit.value / SCALE_ORBIT).toFixed(2)
    els.spinVal.textContent = (els.spin.value / SCALE_SPIN).toFixed(3)
    els.sizeVal.textContent = '×' + (els.size.value / SCALE_SIZE).toFixed(2)
  }
  const setSlider = (el, value) => {
    el.value = Math.round(value)
  }
  const measure = () => {
    dim.w = root.offsetWidth
    dim.h = root.offsetHeight
  }

  const show = (target) => {
    if (!target) return hide()
    rig = target
    const cfg = rig.config
    const info = PLANET_INFO[cfg.type] || FALLBACK

    els.name.textContent = cfg.name
    els.tag.textContent = info.tag
    els.desc.textContent = info.desc

    // Факты + живая строка про орбиту (наклон/эксцентриситет из config)
    const facts = info.facts.slice()
    if (cfg.distance > 0) {
      facts.push([
        'Орбита',
        `наклон ${cfg.inclination}° · эксцентриситет ${cfg.eccentricity}`
      ])
    }
    els.facts.innerHTML = facts
      .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
      .join('')

    setSlider(els.orbit, rig.orbit.speedScale * SCALE_ORBIT)
    setSlider(els.spin, cfg.spinSpeed * SCALE_SPIN)
    setSlider(els.size, rig.mesh.scale.x * SCALE_SIZE)
    refreshLabels()

    // Солнце стоит в центре — скорость орбиты ему не нужна
    const lockOrbit = cfg.distance <= 0
    els.orbit.disabled = lockOrbit
    els.orbit.closest('.pc-row').classList.toggle('disabled', lockOrbit)

    pinned = false
    els.pin.classList.remove('on')
    root.classList.remove('hidden')
    measure()
  }

  const hide = () => {
    rig = null
    root.classList.add('hidden')
    link.classList.add('hidden')
  }

  // Вызывается каждый кадр: держим карточку над планетой
  const update = (camera, renderer) => {
    if (!rig) return
    const rect = renderer.domElement.getBoundingClientRect()
    const vw = rect.width || window.innerWidth
    const vh = rect.height || window.innerHeight

    rig.mesh.updateWorldMatrix(true, false)
    rig.mesh.getWorldPosition(world)
    center.copy(world)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    top.copy(world).addScaledVector(up, rig.config.radius * rig.mesh.scale.x)

    center.project(camera)
    top.project(camera)
    const behind = center.z > 1

    const cx = (center.x * 0.5 + 0.5) * vw
    const cy = (-center.y * 0.5 + 0.5) * vh
    const tx = (top.x * 0.5 + 0.5) * vw
    const ty = (-top.y * 0.5 + 0.5) * vh

    if (!pinned) {
      box.left = clamp(tx - dim.w / 2, MARGIN, Math.max(MARGIN, vw - dim.w - MARGIN))
      box.top = clamp(ty - dim.h - GAP, MARGIN, Math.max(MARGIN, vh - dim.h - MARGIN))
    }
    root.style.transform = `translate(${Math.round(box.left)}px, ${Math.round(box.top)}px)`

    if (behind || !Number.isFinite(cx)) {
      link.classList.add('hidden')
      return
    }
    link.classList.remove('hidden')
    const ax = clamp(cx, box.left + 14, box.left + dim.w - 14)
    const ay = box.top + dim.h
    svgLine.setAttribute('x1', cx)
    svgLine.setAttribute('y1', cy)
    svgLine.setAttribute('x2', ax)
    svgLine.setAttribute('y2', ay)
    svgDot.setAttribute('cx', cx)
    svgDot.setAttribute('cy', cy)
  }

  // ── События ──
  root.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act
    if (act === 'close') return onClose()
    if (act === 'defaults') return onParamDefaults()
    if (act === 'pin') {
      pinned = !pinned
      els.pin.classList.toggle('on', pinned)
    }
  })

  els.orbit.addEventListener('input', () => {
    refreshLabels()
    onParamInput('orbit', els.orbit.value / SCALE_ORBIT)
  })
  els.spin.addEventListener('input', () => {
    refreshLabels()
    onParamInput('spin', els.spin.value / SCALE_SPIN)
  })
  els.size.addEventListener('input', () => {
    refreshLabels()
    onParamInput('size', els.size.value / SCALE_SIZE)
  })

  // при смене размера окна текст может переноситься иначе
  window.addEventListener('resize', () => {
    if (rig) measure()
  })

  return {
    root,
    show,
    hide,
    update,
    isOpen: () => !!rig,
    setParamValues: ({ speedScale, spinSpeed, scale }) => {
      if (speedScale !== undefined) setSlider(els.orbit, speedScale * SCALE_ORBIT)
      if (spinSpeed !== undefined) setSlider(els.spin, spinSpeed * SCALE_SPIN)
      if (scale !== undefined) setSlider(els.size, scale * SCALE_SIZE)
      refreshLabels()
    }
  }
}
