// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:UI] панель управления (слева вверху) ───
// Чистый DOM, без THREE. Стили — в index.html.
// Секции: скорость системы · тумблеры движения · тумблеры объектов ·
// список планет (показать/скрыть) · параметры выбранной планеты.
// ─────────────────────────────────────────────────────────────

const ORBIT_MAX = 40 // orbitSpeed 0..0.04
const SPIN_MAX = 80 //  spinSpeed 0..0.08

export const createControls = ({
  planets,
  onSpeed = () => {},
  onToggle = () => {},
  onPlanetVisible = () => {},
  onPlanetSelect = () => {},
  onParamInput = () => {},
  onParamDefaults = () => {},
  onParamClose = () => {}
}) => {
  const root = document.createElement('div')
  root.className = 'controls'
  root.innerHTML = `
    <div class="ctl-head">
      <span class="ctl-brand">Солнечная система</span>
      <button class="ctl-collapse" data-act="collapse" title="Свернуть/развернуть">–</button>
    </div>
    <div class="ctl-body">

      <div class="ctl-block">
        <div class="ctl-title">Скорость системы</div>
        <div class="speed-row">
          <button data-act="slower" title="Замедлить">−</button>
          <button data-act="pause" title="Пауза">⏸</button>
          <button data-act="faster" title="Ускорить">+</button>
          <span class="speed-val" data-role="speed">×1</span>
          <button data-act="reset" title="Сбросить скорость">⟲</button>
        </div>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Движение</div>
        <label class="chk"><input type="checkbox" data-toggle="motion" checked> Движение системы</label>
        <label class="chk"><input type="checkbox" data-toggle="spin" checked> Вращение вокруг оси</label>
        <label class="chk"><input type="checkbox" data-toggle="trails" checked> Винтовые следы</label>
        <label class="chk"><input type="checkbox" data-toggle="stars" checked> Звёзды (видимость)</label>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Объекты</div>
        <label class="chk"><input type="checkbox" data-toggle="orbits" checked> Орбиты</label>
        <label class="chk"><input type="checkbox" data-toggle="belts" checked> Пояса астероидов</label>
        <label class="chk"><input type="checkbox" data-toggle="comets" checked> Кометы</label>
        <label class="chk"><input type="checkbox" data-toggle="tesla" checked> Tesla / Starman</label>
        <label class="chk"><input type="checkbox" data-toggle="nebula" checked> Туманность</label>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Планеты <span class="ctl-note">(клик по имени — настройки)</span></div>
        <div class="planet-list" data-role="planetList"></div>
      </div>

      <div class="ctl-block params hidden" data-role="params">
        <div class="ctl-title">
          <span data-role="title">Планета</span>
          <button class="ctl-x" data-act="paramClose" title="Закрыть">×</button>
        </div>
        <label class="row">Орбитальная скорость <b data-role="orbitVal"></b>
          <input type="range" data-role="orbit" min="0" max="${ORBIT_MAX}" step="1">
        </label>
        <label class="row">Вращение вокруг оси <b data-role="spinVal"></b>
          <input type="range" data-role="spin" min="0" max="${SPIN_MAX}" step="1">
        </label>
        <label class="row">Размер <b data-role="sizeVal"></b>
          <input type="range" data-role="size" min="50" max="250" step="5">
        </label>
        <button class="ctl-btn" data-act="defaults">Сбросить планету</button>
      </div>

      <div class="ctl-hint">ЛКМ — вращать · колесо — зум · клик по планете — настройки</div>
    </div>
  `
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)

  // ── Список планет: чекбокс (видимость) + имя (выбор для настроек) ──
  const list = q('[data-role="planetList"]')
  planets.forEach((rig, i) => {
    const label = document.createElement('label')
    label.className = 'chk'
    label.innerHTML =
      `<input type="checkbox" data-planet="${i}" checked>` +
      `<span class="planet-name" data-select="${i}">${rig.config.name}</span>`
    list.appendChild(label)
  })

  // ── Элементы секции параметров ──
  const params = q('[data-role="params"]')
  const title = q('[data-role="title"]')
  const orbit = q('[data-role="orbit"]')
  const spin = q('[data-role="spin"]')
  const size = q('[data-role="size"]')
  const orbitVal = q('[data-role="orbitVal"]')
  const spinVal = q('[data-role="spinVal"]')
  const sizeVal = q('[data-role="sizeVal"]')
  const speedEl = q('[data-role="speed"]')
  const pauseBtn = q('[data-act="pause"]')

  const refreshLabels = () => {
    orbitVal.textContent = (orbit.value / 1000).toFixed(3)
    spinVal.textContent = (spin.value / 1000).toFixed(3)
    sizeVal.textContent = '×' + (size.value / 100).toFixed(2)
  }
  const setSlider = (el, value) => {
    el.value = Math.round(value * 100)
  }

  // ── События ──
  root.addEventListener('click', (e) => {
    const el = e.target
    if (el.dataset) {
      if (el.dataset.act === 'collapse') {
        root.classList.toggle('collapsed')
        return
      }
      if (el.dataset.act === 'paramClose') return onParamClose()
      if (el.dataset.act === 'defaults') return onParamDefaults()
      if (el.dataset.act) return onSpeed(el.dataset.act)
      if (el.dataset.select !== undefined) return onPlanetSelect(Number(el.dataset.select))
    }
  })

  root.addEventListener('change', (e) => {
    const el = e.target
    if (!el.dataset) return
    if (el.dataset.toggle) onToggle(el.dataset.toggle, el.checked)
    else if (el.dataset.planet !== undefined)
      onPlanetVisible(Number(el.dataset.planet), el.checked)
  })

  orbit.addEventListener('input', () => {
    refreshLabels()
    onParamInput('orbit', orbit.value / 1000)
  })
  spin.addEventListener('input', () => {
    refreshLabels()
    onParamInput('spin', spin.value / 1000)
  })
  size.addEventListener('input', () => {
    refreshLabels()
    onParamInput('size', size.value / 100)
  })

  return {
    root,
    setSpeed: (text) => {
      speedEl.textContent = text
    },
    setPaused: (paused) => {
      pauseBtn.textContent = paused ? '▶' : '⏸'
      pauseBtn.classList.toggle('active', paused)
    },
    setPlanetChecked: (index, value) => {
      const box = root.querySelector(`input[data-planet="${index}"]`)
      if (box) box.checked = value
    },
    showParams: ({ name, orbitSpeed, spinSpeed, scale, lockOrbit }) => {
      title.textContent = name
      setSlider(orbit, orbitSpeed)
      setSlider(spin, spinSpeed)
      setSlider(size, scale)
      refreshLabels()
      // У Солнца нет орбиты (оно в центре) — блокируем соответствующий слайдер
      orbit.disabled = !!lockOrbit
      const row = orbit.parentElement
      if (row) row.classList.toggle('disabled', !!lockOrbit)
      params.classList.remove('hidden')
    },
    hideParams: () => params.classList.add('hidden'),
    setParamValues: ({ orbitSpeed, spinSpeed, scale }) => {
      if (orbitSpeed !== undefined) setSlider(orbit, orbitSpeed)
      if (spinSpeed !== undefined) setSlider(spin, spinSpeed)
      if (scale !== undefined) setSlider(size, scale)
      refreshLabels()
    }
  }
}
