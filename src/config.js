import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ СЦЕНЫ (все «крутилки» в одном месте)
// ─────────────────────────────────────────────────────────────

export const ORBIT_TILT = 0.05 // лёгкий наклон орбит для динамики кадра
export const SHADOW_MAP_SIZE = 1024
export const STAR_COUNT = 3500
export const STAR_BOX = 320 // полуразмер куба звёзд (период обёртки «бесконечного» неба)

// Иллюзия полёта системы сквозь космос (система в центре, стримятся звёзды, рисуются следы)
export const MOTION_SPEED = 5.5

// Наклон всей системы: плоскость орбит видна как наклонённый диск
export const SYSTEM_TILT_X = 0.15
export const SYSTEM_TILT_Z = 0.6

// ─── [FEATURE:TRAILS] параметры винтовых следов ───
export const TRAIL_TIME = 16 // «выдержка» следа (в условных секундах)
export const TRAIL_POINTS = 256 // число точек в линии следа

// Направление полёта = нормаль плоскости орбит после наклона,
// поэтому спиральные следы идут ПЕРПЕНДИКУЛЯРНО системе. Производная величина!
export const MOTION_DIR = new THREE.Vector3(0, 1, 0)
  .applyEuler(new THREE.Euler(SYSTEM_TILT_X, 0, SYSTEM_TILT_Z, 'XYZ'))
  .normalize()

// ─── [FEATURE:KEPLER] орбитальная механика ───
// Угловая скорость по третьему закону Кеплера: n = SPEED_FACTOR / sqrt(R³),
// где R — радиус орбиты (большая полуось a). SPEED_FACTOR — «гравитационный»
// множитель (аналог GM), подобранный под масштаб сцены.
export const SPEED_FACTOR = 0.21

// ─── [FEATURE:PLANETS+] Уран и Нептун добавлены в систему ───
// Поля планеты:
//   name, type, radius, distance (=R — радиус орбиты / большая полуось),
//   speedScale  — множитель к кеплеровской скорости (1 = «как в природе»),
//   spinSpeed   — скорость вращения вокруг оси (минус = ретроградное),
//   eccentricity — эксцентриситет орбиты (0 = круг),
//   inclination  — наклон плоскости орбиты в ГРАДУСАХ (0–7°),
//   node         — долгота восходящего узла в ГРАДУСАХ,
//   startAngle   — начальная аномалия в ГРАДУСАХ,
//   axialTilt, atmosphere {color,intensity}, moons[], artificial[].
export const PLANETS = [
  {
    name: 'Солнце',
    type: 'sun',
    radius: 3.2,
    distance: 0,
    speedScale: 0,
    spinSpeed: 0.0015,
    eccentricity: 0,
    inclination: 0,
    node: 0,
    startAngle: 0
  },
  {
    name: 'Меркурий',
    type: 'mercury',
    radius: 0.42,
    distance: 5.8,
    speedScale: 1,
    spinSpeed: 0.004,
    eccentricity: 0.2056, // самая вытянутая орбита из планет
    inclination: 7.0,
    node: 48,
    startAngle: 20
  },
  {
    name: 'Венера',
    type: 'venus',
    radius: 0.72,
    distance: 8.0,
    speedScale: 1,
    spinSpeed: -0.003, // ─── [FEATURE:SPIN] ретроградное вращение (обратное) ───
    eccentricity: 0.0068,
    inclination: 3.39,
    node: 76,
    startAngle: 130,
    atmosphere: { color: 0xffd9a0, intensity: 0.45 },
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Akatsuki', distance: 1.15, orbitSpeed: 0.07, inclination: 0.35 }
    ]
    // ───────────────────────────
  },
  {
    name: 'Земля',
    type: 'earth',
    radius: 0.85,
    distance: 11.2,
    speedScale: 1,
    spinSpeed: 0.02,
    eccentricity: 0.0167,
    inclination: 0.0, // плоскость орбиты Земли — «нулевая» (экклиптика)
    node: 0,
    startAngle: 250,
    axialTilt: 0.41,
    atmosphere: { color: 0x5aa9ff, intensity: 0.9 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Луна', radius: 0.23, distance: 1.75, orbitSpeed: 0.03, color: 0xcfcac2 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'МКС', distance: 1.05, orbitSpeed: 0.06, inclination: 0.5 },
      { name: 'Hubble', distance: 1.28, orbitSpeed: 0.05, inclination: 0.22 }
    ]
    // ───────────────────────────
  },
  {
    name: 'Марс',
    type: 'mars',
    radius: 0.6,
    distance: 14.5,
    speedScale: 1,
    spinSpeed: 0.018,
    eccentricity: 0.0934,
    inclination: 1.85,
    node: 49,
    startAngle: 310,
    axialTilt: 0.44,
    atmosphere: { color: 0xff9a6a, intensity: 0.28 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Фобос', radius: 0.09, distance: 1.05, orbitSpeed: 0.06, color: 0x9a8f82 },
      { name: 'Деймос', radius: 0.07, distance: 1.38, orbitSpeed: 0.045, color: 0x8a8073 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Mars Orbiter', distance: 0.95, orbitSpeed: 0.07, inclination: 0.7 }
    ]
    // ───────────────────────────
  },
  {
    name: 'Юпитер',
    type: 'jupiter',
    radius: 1.65,
    distance: 19.5,
    speedScale: 1,
    spinSpeed: 0.03,
    eccentricity: 0.0489,
    inclination: 1.30,
    node: 100,
    startAngle: 75,
    axialTilt: 0.05,
    atmosphere: { color: 0xd8b48a, intensity: 0.35 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Ио', radius: 0.22, distance: 2.7, orbitSpeed: 0.04, color: 0xe8d868 },
      { name: 'Европа', radius: 0.19, distance: 3.2, orbitSpeed: 0.033, color: 0xd9cbb0 },
      { name: 'Ганимед', radius: 0.28, distance: 3.8, orbitSpeed: 0.026, color: 0xa89a86 },
      { name: 'Каллисто', radius: 0.26, distance: 4.4, orbitSpeed: 0.02, color: 0x8a7f70 }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [{ name: 'Juno', distance: 2.3, orbitSpeed: 0.05, inclination: 0.9 }]
    // ───────────────────────────
  },
  {
    name: 'Сатурн',
    type: 'saturn',
    radius: 1.3,
    distance: 24.5,
    speedScale: 1,
    spinSpeed: 0.025,
    eccentricity: 0.0565,
    inclination: 2.49,
    node: 113,
    startAngle: 190,
    axialTilt: 0.47,
    atmosphere: { color: 0xf0e0b4, intensity: 0.3 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Энцелад', radius: 0.13, distance: 3.5, orbitSpeed: 0.05, color: 0xe8eef0 },
      { name: 'Рея', radius: 0.16, distance: 3.95, orbitSpeed: 0.04, color: 0xc9c4bb },
      { name: 'Титан', radius: 0.28, distance: 4.5, orbitSpeed: 0.03, color: 0xd9a24a }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Cassini', distance: 3.7, orbitSpeed: 0.045, inclination: 0.6 }
    ]
    // ───────────────────────────
  },
  {
    name: 'Уран',
    type: 'uranus',
    radius: 1.0,
    distance: 29.0,
    speedScale: 1,
    spinSpeed: 0.028,
    eccentricity: 0.0457,
    inclination: 0.77,
    node: 74,
    startAngle: 340,
    axialTilt: 1.71, // Уран практически «лежит на боку»
    atmosphere: { color: 0x9fe8e6, intensity: 0.6 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Титания', radius: 0.14, distance: 1.75, orbitSpeed: 0.032, color: 0xbfc3c6 },
      { name: 'Оберон', radius: 0.13, distance: 2.15, orbitSpeed: 0.026, color: 0xa9a29a }
    ],
    // ───────────────────────
    // ─── [FEATURE:SATELLITES] ───
    artificial: [
      { name: 'Voyager 2', distance: 1.45, orbitSpeed: 0.05, inclination: 1.2 }
    ]
    // ───────────────────────────
  },
  {
    name: 'Нептун',
    type: 'neptune',
    radius: 0.97,
    distance: 33.0,
    speedScale: 1,
    spinSpeed: 0.03,
    eccentricity: 0.0113,
    inclination: 1.77,
    node: 131,
    startAngle: 45,
    axialTilt: 0.49,
    atmosphere: { color: 0x4a6bff, intensity: 0.75 },
    // ─── [FEATURE:MOONS] ───
    moons: [
      { name: 'Тритон', radius: 0.16, distance: 1.85, orbitSpeed: 0.028, color: 0xd8ccc0 }
    ]
    // ───────────────────────
  }
]

// Цвета винтовых следов по типу тела
export const trailColors = {
  sun: 0xffb347,
  mercury: 0x9fa4ad,
  venus: 0xe8c98a,
  earth: 0x5aa9ff,
  mars: 0xff7a4a,
  jupiter: 0xd8b48a,
  saturn: 0xe6d3a6,
  uranus: 0x9fe8e6,
  neptune: 0x4a6bff
}

// ─── [FEATURE:GALAXY] спиральная галактика «Млечный Путь» (процедурная) ───
// Считается в `src/galaxy.js`. Ключевая идея: **мы внутри диска**, а не в ядре.
// `distance` — расстояние от центра галактики до Солнечной системы (как у
// настоящего Солнца: ~2/3 радиуса). Галактика смещается целиком так, чтобы
// мировая точка (0,0,0) лежала В ПЛОСКОСТИ диска — иначе вокруг системы была бы
// дырка. Структура — как у Млечного Пути: балдж-бар, 2 главных рукава + 2
// второстепенных, голубые молодые звёзды в рукавах, розовые области HII и
// тёмные пылевые полосы.
export const GALAXY = {
  name: 'Млечный Путь',
  count: 100000, // 50k–100k звёзд-точек, один BufferGeometry
  branches: 4, // 2 главных рукава + 2 второстепенных
  radius: 620, // внешний радиус диска
  innerRadius: 10, // где начинаются рукава (почти от центра)
  distance: 400, // расстояние Солнца от центра галактики
  spin: 0.95, // закручивание рукавов (в оборотах)
  randomness: 0.24, // разброс поперёк рукава (доля радиуса)
  randomnessPower: 2.2, // плотность прижатия к оси рукава
  thickness: 0.028, // толщина диска (доля радиуса)
  // ── ядро: вытянутый бар + балдж (у Млечного Пути есть бар) ──
  bulgeShare: 0.16, // доля звёзд в балдже/баре
  barLength: 0.22, // длина бара (доля радиуса)
  barWidth: 0.09,
  bulgeHeight: 0.05,
  // ── население рукавов ──
  youngShare: 0.08, // горячие голубые звёзды (гнёзда вдоль рукавов)
  hiiShare: 0.02, // розовые области звездообразования (HII)
  dustShare: 0.16, // тёмные пылевые полосы (отдельный слой точек)
  size: 2.0, // размер ядра звезды, px (sizeAttenuation выключен)
  opacity: 0.95,
  // ── [FEATURE:STARGLOW] чтобы звёзды светились, а не были «тёмными пикселями» ──
  starBrightness: 1.35, // общий множитель яркости цветов вершин
  starGlow: true, // второй слой — мягкий ореол вокруг каждой звезды
  haloSize: 6, // размер ореола, px
  haloOpacity: 0.16, // насколько заметно свечение (0 — выключить визуально)
  coreColor: 0xffe0a0, // рукава у ядра — тёплые
  midColor: 0x9dc4ff, // середина — голубая
  armColor: 0x5a86ff, // концы рукавов — синие
  youngColor: 0xeaf4ff, // молодые горячие звёзды — почти белые
  hiiColor: 0xff5f9e, // области HII — розовые
  bulgeColor: 0xffc072, // балдж — жёлто-оранжевый
  rotationSpeed: 0.02, // рад/сек (полный оборот ~5 минут)
  tiltX: 0.38, // наклон диска (подбор: ядро видно «за» системой)
  tiltZ: 0.55,
  coreGlow: true, // мягкое свечение ядра
  coreScale: 95,
  coreOpacity: 0.55,
  // ── пылевые полосы: видны только когда смотрим на галактику извне ──
  dustSize: 7,
  dustOpacity: 0.6,
  dustNear: 130, // ближе — пыль гасим (иначе мазала бы планеты)
  dustFar: 330,
  // [FEATURE:SYSTEMS] отлетел от системы дальше этого — вернулись к галактике
  exitDistance: 640,
  // ── [FEATURE:BLACKHOLE] сверхмассивная чёрная дыра в центре спирали ──
  // Координаты — локальные (0,0,0) группы галактики, то есть ЦЕНТР Млечного
  // Пути (Солнце смещено на distance и находится внутри диска).
  blackHole: {
    enabled: true,
    radius: 6.5, // радиус горизонта событий (сфера Шварцшильда)
    diskInner: 8.5, // внутренний край аккреционного диска
    diskOuter: 34, // внешний край
    diskSpin: 0.55, // базовая скорость вращения диска, рад/сек
    particles: 2600, // частиц в двух слоях
    photonScale: 2.9, // диаметр фотонного кольца в радиусах горизонта
    glowScale: 5.2 // диаметр тёплого ореола в радиусах горизонта
  }
}

// ─── [FEATURE:SYSTEMS] другие звёздные системы в галактике ───
// Генерируются в `src/systems.js` и живут в рукавах галактики (как настоящие
// звёзды). В каждую можно «провалиться»: см. навигацию в `src/main.js`.
export const SYSTEMS = {
  count: 11, // сколько систем сгенерировать (плюс Солнечная — нулевая)
  minDistanceFromHome: 210, // не ставим систему рядом с Солнцем
  radiusMin: 0.26, // доля GALAXY.radius — где искать
  radiusMax: 0.95,
  armChance: 0.7, // вероятность, что система сядет НА рукав
  planetsMin: 1,
  planetsMax: 5,
  orbitLineOpacity: 0.09
}

// ─── [FEATURE:BELTS] параметры поясов малых тел ───
// Эллиптические орбиты: eccMin..eccMax — эксцентриситет, incMax — разброс
// наклона плоскости орбиты (рад). Камни летают по общему поясу, но каждый
// по своей слегка вытянутой и наклонённой орбите.
export const ASTEROID_BELT = {
  count: 1000, // ~1000 мелких астероидов между Марсом и Юпитером
  inner: 16.0,
  outer: 18.6,
  ySpread: 0.5,
  scaleMin: 0.028,
  scaleMax: 0.13,
  speedMin: 0.004,
  speedMax: 0.008,
  eccMin: 0.02,
  eccMax: 0.22,
  incMax: 0.16,
  color: 0x8a8175
}

export const KUIPER_BELT = {
  count: 800,
  inner: 37,
  outer: 45,
  ySpread: 1.3,
  scaleMin: 0.04,
  scaleMax: 0.14,
  speedMin: 0.0012,
  speedMax: 0.0024,
  eccMin: 0.03,
  eccMax: 0.25,
  incMax: 0.22,
  color: 0x7f8fa0
}

// ─── [FEATURE:COMETS] кометы: a — большая полуось, e — эксцентриситет,
// inc — наклон плоскости, speed — скорость обращения, tail — длина хвоста ───
export const COMETS = [
  { a: 21, e: 0.74, inc: 0.55, speed: 1.0, size: 0.16, tail: 6.0, nu: 0.6 },
  { a: 27, e: 0.82, inc: -0.35, speed: 0.8, size: 0.2, tail: 7.5, nu: 2.4 },
  { a: 15, e: 0.66, inc: 0.95, speed: 1.3, size: 0.13, tail: 5.0, nu: 4.2 }
]

// ─── [FEATURE:TESLA] Tesla Roadster со Starman (запущен Илоном Маском) ───
export const TESLA = {
  a: 17.5,
  e: 0.32,
  inc: 0.12,
  speed: 0.008,
  nu: 1.0,
  scale: 0.55
}

// ─── [FEATURE:UI] шаги глобальной скорости системы ───
export const SPEED_STEPS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 8]
export const DEFAULT_SPEED_INDEX = SPEED_STEPS.indexOf(1)
