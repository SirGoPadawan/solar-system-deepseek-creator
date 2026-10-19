#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Проверка проекта без браузера: `npm run check`
//
//  1. синтаксис всех JS-файлов (node --check);
//  2. связи import/export между модулями src/;
//  3. существование всего API three, которое мы используем;
//  4. существование вызываемых методов (`.метод()`) — в three или у нас.
//  5. вендорные аддоны three (EffectComposer, UnrealBloomPass): синтаксис
//     и разрешимость их относительных импортов.
//
// Пункты 3–4 появились после реального бага: в сцене использовался
// THREE.Color().mix(), которого в three r186 НЕТ — падала вся сцена
// ещё до первого кадра. Скрипт ловит такие вещи статически.
// ─────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failed = 0
const fail = (msg) => {
  failed++
  console.log('  ✗ ' + msg)
}
const ok = (msg) => console.log('  ✓ ' + msg)

const srcFiles = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .sort()
const rootFiles = ['index.js', 'server.js']
const allFiles = rootFiles.concat(srcFiles.map((f) => 'src/' + f))

// размер «кода» для счётчика проверок
let checked = 0

// ── 1. Синтаксис ─────────────────────────────────────────────
console.log('\n[1/5] синтаксис')
allFiles.forEach((f) => {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' })
  } catch (e) {
    fail(f + ': ' + String(e.stderr || e).trim().split('\n').slice(-3).join(' '))
  }
})
if (!failed) ok(allFiles.length + ' файлов разбираются')

// ── 2. import/export между модулями ──────────────────────────
console.log('\n[2/5] связи импортов')
let linkErrors = 0
const exportsOf = (code) => {
  const names = new Set()
  const re = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
  let m
  while ((m = re.exec(code))) names.add(m[1])
  const reList = /export\s*\{([^}]*)\}/g
  while ((m = reList.exec(code))) {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const as = part.split(/\s+as\s+/)
        names.add((as[1] || as[0]).trim())
      })
  }
  return names
}
const exportMap = {}
srcFiles.forEach((f) => (exportMap['./' + f] = exportsOf(read('src/' + f))))
allFiles.forEach((f) => {
  const code = read(f)
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(code))) {
    const clause = m[1]
    const source = m[2]
    // проверяем только свои относительные модули: three/, node-встроенные и
    // всё прочее (http, fs, path, url) — не наша зона ответственности
    if (!source.startsWith('.')) continue
    const avail = exportMap[source]
    if (!avail) {
      linkErrors++
      fail(f + ' импортирует неизвестный модуль ' + source)
      continue
    }
    const braces = clause.match(/\{([^}]*)\}/)
    if (!braces) continue
    braces[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const as = part.split(/\s+as\s+/)
        const name = (as[0] || '').trim()
        if (name && !avail.has(name)) {
          linkErrors++
          fail(f + ': ' + source + ' не экспортирует ' + name)
        }
      })
  }
})
if (!linkErrors) ok('все относительные импорты разрешаются')

// ── 3. API three ─────────────────────────────────────────────
console.log('\n[3/5] API three (вендорный бандл)')
// рендерер и прочее живут в three.module.js, ядро — в three.core.js: смотрим оба
const bundle =
  fs.readFileSync(path.join(ROOT, 'vendor/three/three.core.js'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(ROOT, 'vendor/three/three.module.js'), 'utf8')

const exported = new Set()
const blocks = bundle.match(/export\s*\{[\s\S]*?\}/g) || []
blocks.forEach((block) => {
  // у первого имени в блоке остаётся префикс «export» — срезаем его
  block
    .replace(/^export\s*\{/, '')
    .replace(/\}/g, '')
    .split(',')
    .forEach((tok) => {
      const name = tok.trim().split(/\s+as\s+/).pop().trim()
      if (name) exported.add(name)
    })
})
const reDecl = /export\s+(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g
let md
while ((md = reDecl.exec(bundle))) exported.add(md[1])

// методы, определённые хоть где-то в бандле (по отступу определения)
const methods = new Set()
const reMethod = /^\s{1,3}(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/gm
let mm
while ((mm = reMethod.exec(bundle))) methods.add(mm[1])

// методы наших собственных объектов-фабрик и DOM-API — не проверяем
const own = new Set(['getNormal', 'info'])

let apiErrors = 0
srcFiles.forEach((f) => {
  const code = read('src/' + f)
  const re = /THREE\.([A-Za-z_$][\w$]*)/g
  const seen = new Set()
  let m
  while ((m = re.exec(code))) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    if (!exported.has(name) && !methods.has(name)) {
      apiErrors++
      fail('src/' + f + ': нет THREE.' + name)
    }
  }
})
if (!apiErrors) ok('все THREE.* из src/ есть в бандле (' + exported.size + ' имен)')

// ── 4. вызовы методов объектов three ─────────────────────────
// Тот самый случай с Color.mix(): класс есть, а метода нет — сцена падает
// целиком. Смотрим все `.имя(` в src/ и требуем, чтобы имя было либо
// методом бандла, либо нашим/браузерным (белый список ниже).
console.log('\n[4/5] методы объектов (вызовы .имя())')
const known = new Set([
  // наши собственные объекты-фабрики (card.js, ui.js, tooltip.js, main.js)
  'show', 'hide', 'update', 'setSpeed', 'setPaused', 'setGalaxyInfo', 'setSystemInfo',
  'setSystemList', 'setCurrent', 'setPlanetChecked', 'setParamValues', 'dispose',
  'setOrbitsVisible', 'getWorld', 'current', 'getNormal', 'getCenter',
  // EffectComposer (addon, не three.core) — цепочка проходов
  'addPass', 'setPixelRatio', 'getPixelRatio',
  // WebGLRenderer / OrbitControls (в бандле объявлены как `this.render = …`)
  'render', 'setPixelRatio', 'setSize', 'getPixelRatio', 'getSize', 'update',
  'getDistance', 'getAzimuthalAngle', 'getPolarAngle', 'setTarget', 'saveState', 'reset',
  // canvas 2D и DOM
  'getContext', 'fillRect', 'createImageData', 'putImageData', 'createRadialGradient',
  'createLinearGradient', 'addColorStop', 'beginPath', 'save', 'restore', 'closest', 'getBoundingClientRect',
  'addEventListener', 'removeEventListener', 'appendChild', 'createElement',
  'querySelector', 'querySelectorAll', 'preventDefault', 'stopPropagation',
  'requestAnimationFrame', 'classList', 'contains',
  // стандартные объекты JS
  'now', 'imul', 'isFinite', 'isArray', 'fromCharCode', 'toFixed', 'toString',
  'padStart', 'trim', 'split', 'join', 'slice', 'splice', 'push', 'pop', 'map',
  'filter', 'forEach', 'reduce', 'find', 'findIndex', 'some', 'every', 'includes',
  'indexOf', 'sort', 'reverse', 'concat', 'startsWith', 'endsWith', 'match',
  'replace', 'test', 'keys', 'values', 'entries', 'stringify', 'parse',
  'get', 'has', 'toLocaleString',
  'abs', 'min', 'max', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'random', 'sign',
  'sin', 'cos', 'tan', 'atan2', 'hypot', 'exp', 'log'
])

let methodErrors = 0
const reCall = /\.([A-Za-z_$][\w$]*)\s*\(/g
srcFiles.forEach((f) => {
  const code = read('src/' + f)
  const seen = new Set()
  let m
  while ((m = reCall.exec(code))) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    if (methods.has(name) || known.has(name) || exported.has(name)) continue
    methodErrors++
    fail('src/' + f + ': нет метода .' + name + '() ни в three, ни в наших объектах')
  }
})
if (!methodErrors) ok('все вызовы .метод() известны (' + known.size + ' своих/браузерных в белом списке)')

// ── 5. вендорные аддоны three ────────────────────────────────
// Пост-обработка живёт в examples/jsm и подключена через importmap.
// Проверяем, что файлы на месте, разбираются и их импорты разрешаются
// (иначе на GitHub Pages всё упадёт на 404 без единой ошибки в src/).
console.log('\n[5/5] вендорные аддоны')
const addonDirs = [
  'vendor/three/addons/postprocessing',
  'vendor/three/addons/shaders',
  'vendor/three/addons/controls'
]
const addonFiles = []
addonDirs.forEach((dir) => {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return
  fs.readdirSync(abs)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .forEach((f) => addonFiles.push(dir + '/' + f))
})

let addonErrors = 0
addonFiles.forEach((f) => {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' })
  } catch (e) {
    addonErrors++
    fail(f + ': синтаксис')
  }
  const code = read(f)
  const re = /from\s+['"](\.[^'"]+)['"]/g
  let m
  while ((m = re.exec(code))) {
    const target = path.normalize(path.join(path.dirname(f), m[1]))
    if (!fs.existsSync(path.join(ROOT, target))) {
      addonErrors++
      fail(f + ': нет модуля ' + target)
    }
  }
})
if (!addonErrors)
  ok(addonFiles.length + ' аддонов three: синтаксис и импорты в порядке')

// ── Итог ─────────────────────────────────────────────────────
console.log('')
if (failed) {
  console.log('ПРОВАЛЕНО проверок: ' + failed)
  process.exit(1)
}
console.log('ВСЁ ОК')
