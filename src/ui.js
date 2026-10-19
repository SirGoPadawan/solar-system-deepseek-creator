// ─────────────────────────────────────────────────────────────
// ─── [FEATURE:UI] панель управления (слева вверху) ───
// Чистый DOM, без THREE. Стили — в styles.css.
// Здесь только глобальные настройки: скорость системы, тумблеры
// движения/объектов, список планет (показать/скрыть, выбрать)
// и блок галактики (фон, «другая галактика», вид снаружи).
// Параметры конкретной планеты живут в карточке над планетой (card.js).
// ─────────────────────────────────────────────────────────────

export const createControls = ({
  planets,
  onSpeed = () => {},
  onToggle = () => {},
  onPlanetVisible = () => {},
  onPlanetSelect = () => {},
  onView = () => {}
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
        <div class="ctl-title">Галактика <span class="ctl-note">(фон)</span></div>
        <label class="chk"><input type="checkbox" data-toggle="galaxy" checked> Показывать</label>
        <div class="gal-info" data-role="galInfo">…</div>
        <div class="gal-row">
          <button data-act="galRandom" title="Сгенерировать другую галактику">🎲 Другая</button>
          <button data-act="galView" title="Отлететь и посмотреть галактику целиком">🌀 Вид</button>
          <button data-act="sysView" title="Вернуться к Солнечной системе">🪐 Система</button>
        </div>
      </div>

      <div class="ctl-block">
        <div class="ctl-title">Планеты <span class="ctl-note">(клик — карточка)</span></div>
        <div class="planet-list" data-role="planetList"></div>
      </div>

      <div class="ctl-hint">ЛКМ — вращать · колесо — зум · наведение — данные · клик по планете — карточка</div>
    </div>
  `
  document.body.appendChild(root)

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
        if (act === 'galRandom' || act === 'galView' || act === 'sysView') return onView(act)
        return onSpeed(act)
      }
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
    setPlanetChecked: (index, value) => {
      const box = root.querySelector(`input[data-planet="${index}"]`)
      if (box) box.checked = value
    }
  }
}
