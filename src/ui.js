// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:UI] интерфейс: кнопки скорости системы и меню планеты ───
// Чистый DOM, без THREE. Стили — в index.html (классы .hud / .panel).
// ─────────────────────────────────────────────────────────────

// ── Нижняя панель: замедлить / пауза / ускорить / сброс ──
export const createHUD = () => {
  const root = document.createElement('div')
  root.className = 'hud'
  root.innerHTML = `
    <button data-act="slower" title="Замедлить систему">−</button>
    <button data-act="pause" title="Пауза">⏸</button>
    <button data-act="faster" title="Ускорить систему">+</button>
    <span class="hud-speed" data-role="speed">×1</span>
    <button data-act="reset" title="Сбросить скорость">⟲</button>
  `
  document.body.appendChild(root)

  const speed = root.querySelector('[data-role="speed"]')
  const pauseBtn = root.querySelector('[data-act="pause"]')

  return {
    root,
    onClick: (cb) =>
      root.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act
        if (act) cb(act)
      }),
    setSpeed: (text) => {
      speed.textContent = text
    },
    setPaused: (paused) => {
      pauseBtn.textContent = paused ? '▶' : '⏸'
      pauseBtn.classList.toggle('active', paused)
    }
  }
}

// ── Боковая панель параметров выбранной планеты ──
// Значения слайдеров целочисленные; наружу отдаём реальные величины.
const ORBIT_MAX = 40 // orbitSpeed 0..0.04
const SPIN_MAX = 80 //  spinSpeed 0..0.08

export const createPlanetPanel = () => {
  const root = document.createElement('div')
  root.className = 'panel hidden'
  root.innerHTML = `
    <button class="panel-close" data-act="close" title="Закрыть">×</button>
    <h2 data-role="title">Планета</h2>
    <label class="row">Орбитальная скорость <b data-role="orbitVal"></b>
      <input type="range" data-role="orbit" min="0" max="${ORBIT_MAX}" step="1">
    </label>
    <label class="row">Вращение вокруг оси <b data-role="spinVal"></b>
      <input type="range" data-role="spin" min="0" max="${SPIN_MAX}" step="1">
    </label>
    <label class="row">Размер <b data-role="sizeVal"></b>
      <input type="range" data-role="size" min="50" max="250" step="5">
    </label>
    <button class="panel-reset" data-act="defaults">Сбросить планету</button>
  `
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  const title = q('[data-role="title"]')
  const orbit = q('[data-role="orbit"]')
  const spin = q('[data-role="spin"]')
  const size = q('[data-role="size"]')
  const orbitVal = q('[data-role="orbitVal"]')
  const spinVal = q('[data-role="spinVal"]')
  const sizeVal = q('[data-role="sizeVal"]')

  const handlers = { input: () => {}, defaults: () => {}, close: () => {} }

  const refreshLabels = () => {
    orbitVal.textContent = (orbit.value / 1000).toFixed(3)
    spinVal.textContent = (spin.value / 1000).toFixed(3)
    sizeVal.textContent = '×' + (size.value / 100).toFixed(2)
  }

  orbit.addEventListener('input', () => {
    refreshLabels()
    handlers.input('orbit', orbit.value / 1000)
  })
  spin.addEventListener('input', () => {
    refreshLabels()
    handlers.input('spin', spin.value / 1000)
  })
  size.addEventListener('input', () => {
    refreshLabels()
    handlers.input('size', size.value / 100)
  })

  root.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act
    if (act === 'close') handlers.close()
    if (act === 'defaults') handlers.defaults()
  })

  const setSlider = (el, value) => {
    el.value = Math.round(value * 100)
  }

  return {
    root,
    onInput: (cb) => {
      handlers.input = cb
    },
    onDefaults: (cb) => {
      handlers.defaults = cb
    },
    onClose: (cb) => {
      handlers.close = cb
    },
    isOpen: () => !root.classList.contains('hidden'),
    show: ({ name, orbitSpeed, spinSpeed, scale, lockOrbit }) => {
      title.textContent = name
      setSlider(orbit, orbitSpeed)
      setSlider(spin, spinSpeed)
      setSlider(size, scale)
      refreshLabels()
      // У Солнца нет орбиты (оно в центре) — блокируем соответствующий слайдер
      orbit.disabled = !!lockOrbit
      if (orbit.parentElement) orbit.parentElement.classList.toggle('disabled', !!lockOrbit)
      root.classList.remove('hidden')
    },
    setValues: ({ orbitSpeed, spinSpeed, scale }) => {
      if (orbitSpeed !== undefined) setSlider(orbit, orbitSpeed)
      if (spinSpeed !== undefined) setSlider(spin, spinSpeed)
      if (scale !== undefined) setSlider(size, scale)
      refreshLabels()
    },
    hide: () => root.classList.add('hidden')
  }
}
