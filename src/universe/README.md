# Процедурная Вселенная — изолированный модуль

Слой `src/universe/` — самостоятельная архитектура поверх Three.js r186.
Он **ничего не импортирует** из существующего кода проекта (`src/main.js`,
`src/bodies.js`, `index.js` и т.д.) и **ничего в нём не меняет**. Подключение —
только явное, через `createUniverseController` или отдельные фабрики.

```
src/universe/
├─ index.js                  публичный API (barrel)
├─ seed.js                   mulberry32 + hashSeed + createRng()
├─ kepler.js                 Кеплер: M → E → ν → 3D-позиция, meanMotion
├─ noise.glsl.js             GLSL: 3D Perlin, fbm, ridged, warp + палитры звёзд
├─ constellations.js         авто/явные созвездия → пары индексов
├─ galaxyMap.js              THREE.Points (галактика) + LineSegments + пикинг
├─ systemFactory.js          generateSystem(seed), createSystemSpawner()
├─ fallbackBlackHole.js      запасная ЧД: горизонт, кольцо, диск, джеты
├─ modeController.js         режимы «галактика ⇄ система», клики, перелёты
└─ shaders/
   ├─ starMaterial.js        ShaderMaterial плазмы звезды (u_time)
   └─ planetMaterial.js      универсальный ShaderMaterial планеты (u_seed)
```

## Поток данных

```
seed (строка/число)
   │
   ├─ createRng(seed) ──► generateSystem(seed)
   │                         ├─ тип звезды (веса STAR_TYPES)
   │                         ├─ 3..8 планет: a, e, i, Ω, ω, M0
   │                         ├─ u_seed для каждой планеты
   │                         └─ { root, planets, update, dispose, extent }
   │
   └─ createGalaxyMap({ seed }) ──► keyStars[i].seed ──► клик ──► enterSystem()

createUniverseController
   ├─ карта: scene.add(map.group)
   ├─ клик по звезде → spawner.spawn(seed) → scene.add(system.root)
   ├─ Escape / кнопка → enterGalaxy() → перелёт → scene.remove + dispose
   └─ update(delta): map.update(time) + system.update(dt)
```

## Быстрый старт (отдельная страница)

Готовое демо — `universe.html` + `src/universe/demo.js`:

```
npm start
# http://localhost:8000/universe.html
```

Клик по яркой звезде → система. `Esc` или кнопка «← В галактику» → назад.
Клик по планете → карточка с её параметрами.

## Встраивание в существующий проект

```js
import * as THREE from 'three';
import { createUniverseController } from './src/universe/index.js';

// scene, camera, renderer, controls уже созданы вашим кодом
const universe = createUniverseController({
  scene,
  camera,
  controls,                 // OrbitControls
  renderer,
  // ВАЖНО: false, чтобы не переставить камеру вашей текущей сцены
  initializeCamera: false,
  mapOptions: {
    seed: 'milky-way',
    radius: 620,
    starCount: 30000,
    keyStarCount: 18,
  },
  systemDefaults: {
    minPlanets: 3,
    maxPlanets: 8,
    speed: 1,
  },
  // Можно подключить вашу готовую ЧД со всеми джетами/доплером:
  // blackHoleFactory: (opts) => createBlackHole(opts),
  blackHoleFactory: null,
  onModeChange: (mode, star) => {
    // mode: 'galaxy' | 'system'
    console.log(mode, star?.name);
  },
  onHover: (star) => {
    // star === null — курсор ушёл со звезды
  },
  onPlanetClick: (planet, system) => {
    console.log(planet.name, planet.kind, planet.a, planet.e);
  },
});

universe.bindInput(renderer.domElement);

// В вашем animate():
const delta = clock.getDelta();
universe.update(delta);     // двигает карту, систему и камеру в перелёте
controls.update();
renderer.render(scene, camera);

// Кнопки интерфейса:
document.querySelector('#to-galaxy').onclick = () => universe.enterGalaxy();
document.querySelector('#to-system').onclick = () => universe.enterSystem('star-3');
```

`universe.update()` **не рендерит** и не вызывает `controls.update()` в обычном
режиме — это остаётся за вашим циклом. Во время перелёта контроллер сам двигает
камеру и `controls.target`, а `controls.enabled` временно выключает.

### Если встраиваете в текущую сцену

В проекте уже есть своя галактика и Солнечная система. Чтобы не смешивать два
масштаба, рекомендуется:

1. держать `universe` в отдельной сцене/режиме и переключать рендер;
2. либо заменить старую навигацию на `createUniverseController` и убрать
   старый `galaxy.points` из сцены.

`initializeCamera: true` (по умолчанию) ставит камеру в обзор карты и
поднимает `camera.far` до `map.radius * 6`; `dispose()` возвращает значения.

## API

### `generateSystem(starSeed, options)`

```js
const system = generateSystem('andromeda-42', {
  minPlanets: 3,
  maxPlanets: 8,
  speed: 1,          // множитель скорости орбит
  mu: 300,           // гравитационный параметр (n = sqrt(mu / a³))
  planetScale: 1,
  starType: null,    // принудительно: 'sun' | 'blueGiant' | 'blackHole' | ...
  blackHoleFactory: null,
});

system.root;        // THREE.Group — добавьте сами: scene.add(system.root)
system.planets;     // [{ name, kind, radius, a, e, M, mesh, material, ... }]
system.extent;      // радиус системы (для камеры)
system.update(dt);  // dt в секундах
system.dispose();   // геометрии, материалы, текстуры
```

Типы звёзд и веса (`STAR_TYPES`): `sun` 38, `redDwarf` 17, `orangeDwarf` 15,
`blueGiant` 14, `whiteDwarf` 8, `blackHole` 8.

### `createSystemSpawner({ scene, blackHoleFactory, defaults })`

```js
const spawner = createSystemSpawner({ scene });

const system = spawner.spawn('seed-1'); // старую снимет и уничтожит
spawner.clear();                        // scene.remove + dispose
```

Именно здесь выполняется требование про очистку памяти:

```js
scene.remove(current.root);
current.dispose();
current = null;
```

`dispose()` собирает все `geometry`/`material` в `Set` (без двойных вызовов) и
чистит поддерево. Если ЧД пришла извне (`blackHoleFactory`), её поддерево
исключается из обхода — у неё свой `dispose()`.

### `createGalaxyMap(options)`

```js
const map = createGalaxyMap({
  seed: 'milky-way',
  radius: 620,
  thickness: 26,
  starCount: 30000,
  branches: 4,
  keyStarCount: 18,
  // Явные созвездия по id звёзд:
  // constellations: [{ name: 'Орион', stars: ['star-0', 'star-1', 'star-2'] }],
  rotateSpeed: 0.006,
  pixelRatio: renderer.getPixelRatio(),
});

scene.add(map.group);
map.update(elapsedSeconds);
map.pickAt(ndcX, ndcY, camera, { width, height }); // звезда или null
map.getStar('star-3');
map.dispose();
```

Созвездия строятся автоматически (`buildConstellations`): звёзды сортируются
по азимуту, режутся на сектора, внутри сектора соединяются цепочкой по высоте
плюс одна перекладина. Можно передать свой список пар через `constellations`.

### Шейдеры

`createStarMaterial({ seed, type })` — плазма. Униформы: `uTime`, `uSeed`,
`uNoiseScale`, `uGranulation`, `uSpeed`, `uBrightness`, `uRimStrength`,
`uCool/uWarm/uHot/uRim`. Палитры: `STAR_PALETTES.sun`, `.redDwarf`,
`.orangeDwarf`, `.blueGiant`, `.whiteDwarf`.

`createPlanetMaterial({ seed, kind, palette, sunPos })` — поверхность.
`kind: 'terrestrial' | 'gas'`. Униформы: `uSeed`, `uKind`, `uSunPos`, `uOcean`,
`uLand`, `uSand`, `uIce`, `uCloud`, `uHaze`, `uOceanLevel`, `uCloudAmount`,
`uBandA/B/C`, `uBandFreq`, `uBandWarp`, `uTime`, `uBrightness`.

Оба материала включают `<tonemapping_fragment>` и `<colorspace_fragment>` —
работают и с `EffectComposer`, и при прямом рендере. Для блума звёзды светят
выше 1.0 (`uBrightness` 1.2–1.7), планеты — нет.

## Настройки, которые чаще всего крутят

| Что | Где |
|---|---|
| Количество звёзд карты | `mapOptions.starCount` |
| Размер/яркость карты | `mapOptions.radius`, `keyStarCount` |
| Скорость вращения карты | `mapOptions.rotateSpeed` |
| Плотность созвездий | `buildConstellations(..., { groupCount })` |
| Кол-во планет | `systemDefaults.minPlanets / maxPlanets` |
| Скорость орбит | `systemDefaults.speed`, `mu` |
| Частота газовых гигантов | `systemFactory.js` → `rng.chance(0.34)` |
| Частота чёрных дыр | `STAR_TYPES.blackHole.weight` |
| Цвета планет | `makePlanetPalette()` |

## Важные ограничения

* Карта использует **фиксированный размер точек в пикселях** — она читается
  с любого расстояния. При смене DPR вызовите `map.setPixelRatio()`.
* `camera.far` должен быть больше `map.radius * 6` (контроллер поднимает сам
  при `initializeCamera: true`).
* Клик отличается от драга по смещению > 6 px или удержанию > 700 мс.
* Всё детерминировано: один сид → одна и та же система и карта.
* Модуль не создаёт DOM и не подключает CSS. Интерфейс — ваш.
