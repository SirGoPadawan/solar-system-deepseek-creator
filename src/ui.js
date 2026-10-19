// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:UI] панель управления (слева вверху) ───
// Чистый DOM, без THREE. Стили — в styles.css.
// Здесь только глобальные настройки: скорость системы, тумблеры
// движения/объектов, список планет (показать/скрыть, выбрать)
// и блоки галактики/навигации ([FEATURE:GALAXY], [FEATURE:SYSTEMS]).
// Параметры конкретной планеты живут в карточке над планетой (card.js).
// ─────────────────────────────────────────────────────────────

export const createControls = ({
  planets,
  systems = [],
  onSpeed = () => {},
  onToggle = () => {},
  onPlanetVisible = () => {},
  onPlanetSelect = () => {},
  onView = () => {},
  onNavigate = () => {}
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
        <label class="chk"><input type="checkbox" data-toggle="grid" checked> Сетка эклиптики</label>
        <label class="chk"><input type="checkbox" data-toggle="belts" checked> Пояса астероидов</label>
        <label class="chk"><input type="checkbox" data-toggle="comets" checked> Кометы</label>
        <label class="chk"><input type="checkbox" data-toggle="tesla" checked> Tesla / Starman</label>
        <label class="chk"><input type="checkbox" data-toggle="nebula" checked> Туманность</label>
        <label class="chk"><input type="checkbox" data-toggle="dust" checked> Космическая пыль</label>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Навигация <span class="ctl-note">(куда летим)</span></div>
        <select class="sys-select" data-role="sysSelect" title="Выбрать систему"></select>
        <div class="gal-info" data-role="sysInfo">…</div>
        <div class="gal-row">
          <button data-act="galRandom" title="Сгенерировать другую галактику">🎲 Другая галактика</button>
          <button data-act="galView" title="Отлететь и посмотреть галактику целиком">🌀 Вид галактики</button>
        </div>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Галактика</div>
        <label class="chk"><input type="checkbox" data-toggle="galaxy" checked> Показывать галактику</label>
        <div class="gal-info" data-role="galInfo">…</div>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Планеты <span class="ctl-note">(клик — карточка)</span></div>
        <div class="planet-list" data-role="planetList"></div>
      </div>

      <div class="ctl-hint">ЛКМ — вращать · колесо — зум · отлетел далеко — вернулся в галактику · клик по звезде системы — влететь в неё</div>
    </div>
  `
  document.body.appendChild(root)

  // Плавающая кнопка «выйти из системы» — видна, только когда мы внутри
  // чужой системы (см. [FEATURE:SYSTEMS]). Живёт отдельно от панели,
  // чтобы её нельзя было потерять, свернув панель.
  const exitBtn = document.createElement('button')
  exitBtn.className = 'sys-exit hidden'
  exitBtn.dataset.act = 'exitSystem'
  exitBtn.textContent = '⬅ Выйти в галактику'
  exitBtn.title = 'Вернуться к обзору галактики (Esc)'
  document.body.appendChild(exitBtn)

  const q = (sel) => root.querySelector(sel)

  // ── Список планет: чекбокс (видимость) + имя (выбор для карточки) ──
  const list = q('[data-role="planetList"]')
  planets.forEach((rig, i) => {
    const label = document.createElement('label')
    label.className = 'chk'
    label.innerHTML =
      `<input type="checkbox" data-planet="${i}" checked>` +
      `<span class="planet-name" data-select="${i}">${rig.config.name}</span>`
    list.appendChild(label)
  })

  const speedEl = q('[data-role="speed"]')
  const pauseBtn = q('[data-act="pause"]')
  const galInfoEl = q('[data-role="galInfo"]')
  const sysSelect = q('[data-role="sysSelect"]')
  const sysInfoEl = q('[data-role="sysInfo"]')

  // ── Список систем: «Обзор галактики» + Солнечная + сгенерированные ──
  const fillSystems = (entries) => {
    sysSelect.innerHTML = ''
    entries.forEach((e) => {
      const option = document.createElement('option')
      option.value = e.value
      option.textContent = e.label
      sysSelect.appendChild(option)
    })
  }
  fillSystems(systems)

  // ── События ──
  root.addEventListener('click', (e) => {
    const el = e.target
    if (el.dataset) {
      if (el.dataset.act === 'collapse') {
        root.classList.toggle('collapsed')
        return
      }
      if (el.dataset.act) {
        const act = el.dataset.act
        if (act === 'galRandom' || act === 'galView') return onView(act)
        return onSpeed(act)
      }
      if (el.dataset.select !== undefined) return onPlanetSelect(Number(el.dataset.select))
    }
  })

  exitBtn.addEventListener('click', () => onNavigate('galaxy'))
  sysSelect.addEventListener('change', () => onNavigate(sysSelect.value))

  root.addEventListener('change', (e) => {
    const el = e.target
    if (!el.dataset) return
    if (el.dataset.toggle) onToggle(el.dataset.toggle, el.checked)
    else if (el.dataset.planet !== undefined)
      onPlanetVisible(Number(el.dataset.planet), el.checked)
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
    setGalaxyInfo: (text) => {
      galInfoEl.textContent = text
    },
    setSystemInfo: (text) => {
      sysInfoEl.textContent = text
    },
    setSystemList: (entries) => fillSystems(entries),
    // Текущий пункт списка + видимость плавающей кнопки выхода
    setCurrent: (value) => {
      sysSelect.value = value
      exitBtn.classList.toggle('hidden', value === 'galaxy' || value === '0')
    },
    setPlanetChecked: (index, value) => {
      const box = root.querySelector(`input[data-planet="${index}"]`)
      if (box) box.checked = value
    }
  }
}
