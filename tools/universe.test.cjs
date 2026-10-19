// ─────────────────────────────────────────────────────────────────────────────
//  universe.test.cjs — офлайн-проверка чистой математики src/universe/.
//
//  Node 12 не умеет импортировать three (r186), поэтому тестируем модули,
//  в которых three нет вообще: seed.js, kepler.js, constellations.js.
//  Исходники ESM разворачиваются в CommonJS-совместимую строку и исполняются
//  через new Function — тем же способом, что и остальные тесты проекта.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const loadPureModule = (relPath, exportNames) => {
  const file = path.join(ROOT, relPath);
  let src = fs.readFileSync(file, 'utf8');

  // Убираем только top-level export-синтаксис; внутри файлов нет import.
  src = src
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export \{[\s\S]*?\};?\s*$/gm, '');

  // eslint-disable-next-line no-new-func
  return new Function(`"use strict";\n${src}\nreturn { ${exportNames.join(', ')} };`)();
};

const seed = loadPureModule('src/universe/seed.js', [
  'hashSeed',
  'mulberry32',
  'createRng',
]);

const kepler = loadPureModule('src/universe/kepler.js', [
  'TWO_PI',
  'normalizeAngle',
  'solveKepler',
  'trueAnomaly',
  'orbitalPosition',
  'orbitPoint',
  'meanMotion',
  'orbitalPeriod',
  'radiusAt',
]);

const constellations = loadPureModule('src/universe/constellations.js', [
  'buildConstellations',
  'CONSTELLATION_NAMES',
]);

// ───────────────────────────── мини-ассерты ─────────────────────────────
let passed = 0;
const failures = [];

const check = (name, condition, extra = '') => {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ───────────────────────────── seed ─────────────────────────────
const h1 = seed.hashSeed('andromeda');
const h2 = seed.hashSeed('andromeda');
const h3 = seed.hashSeed('milky-way');

check('hashSeed детерминирован', h1 === h2);
check('hashSeed различает строки', h1 !== h3);
check('hashSeed(number) возвращает uint32', seed.hashSeed(42) === 42);

const rngA = seed.createRng('seed-a');
const rngB = seed.createRng('seed-a');
const rngC = seed.createRng('seed-b');

const seqA = Array.from({ length: 8 }, () => rngA.next());
const seqB = Array.from({ length: 8 }, () => rngB.next());
const seqC = Array.from({ length: 8 }, () => rngC.next());

check('createRng детерминирован', seqA.every((v, i) => v === seqB[i]));
check('createRng зависит от сида', seqA.some((v, i) => v !== seqC[i]));
check('next() в [0, 1)', seqA.every((v) => v >= 0 && v < 1));

const ranges = seed.createRng('ranges');
let intOk = true;
let weightedOk = true;

for (let i = 0; i < 300; i++) {
  const v = ranges.int(3, 8);
  if (v < 3 || v > 8 || Math.floor(v) !== v) intOk = false;

  const pick = ranges.weighted([
    ['sun', 5],
    ['blackHole', 1],
  ]);
  if (pick !== 'sun' && pick !== 'blackHole') weightedOk = false;
}

check('int(3, 8) всегда целое в диапазоне', intOk);
check('weighted возвращает только известные значения', weightedOk);

// ───────────────────────────── kepler ─────────────────────────────
check('normalizeAngle(3π) ≈ π', near(kepler.normalizeAngle(Math.PI * 3), Math.PI, 1e-9));
check('normalizeAngle(-π/2) ≈ 3π/2', near(kepler.normalizeAngle(-Math.PI / 2), (Math.PI * 3) / 2, 1e-9));

check('solveKepler(M, 0) = M', near(kepler.solveKepler(1.234, 0), 1.234, 1e-9));

const E = kepler.solveKepler(1.0, 0.6);
check(
  'уравнение Кеплера сходится',
  near(E - 0.6 * Math.sin(E), 1.0, 1e-7),
  `E=${E}`
);

const circular = { a: 10, e: 0, M: 0, inclination: 0, node: 0, argPeri: 0 };
const p0 = kepler.orbitalPosition(circular);
check(
  'круговая орбита: старт в (a, 0, 0)',
  near(p0.x, 10, 1e-6) && near(p0.y, 0, 1e-6) && near(p0.z, 0, 1e-6),
  JSON.stringify(p0)
);

const half = kepler.orbitalPosition({ ...circular, M: Math.PI });
check('половина периода: (-a, 0, 0)', near(half.x, -10, 1e-6) && near(half.y, 0, 1e-6));

const ellipse = { a: 10, e: 0.5, M: 0, inclination: 0, node: 0, argPeri: 0 };
const peri = kepler.orbitalPosition(ellipse);
const apo = kepler.orbitalPosition({ ...ellipse, M: Math.PI });

check('перицентр эллипса: a(1−e)', near(peri.x, 5, 1e-6), JSON.stringify(peri));
check('апоцентр эллипса: −a(1+e)', near(apo.x, -15, 1e-6), JSON.stringify(apo));

const inclined = kepler.orbitPoint(
  { a: 10, e: 0, inclination: Math.PI / 2, node: 0, argPeri: 0 },
  Math.PI / 2
);
check(
  'наклон 90°: орбита уходит в плоскость XZ',
  near(inclined.x, 0, 1e-6) && near(inclined.z, 10, 1e-6),
  JSON.stringify(inclined)
);

const out = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
kepler.orbitalPosition(circular, out);
check('out.set() поддерживается', near(out.x, 10, 1e-6));

check('meanMotion(10, 300) = sqrt(0.3)', near(kepler.meanMotion(10, 300), Math.sqrt(0.3), 1e-9));
check(
  'орбитальный период обратен частоте',
  near(kepler.orbitalPeriod(10, 300) * kepler.meanMotion(10, 300), kepler.TWO_PI, 1e-9)
);
check('radiusAt в перицентре', near(kepler.radiusAt(10, 0.5, 0), 5, 1e-9));

// Произвольные сиды: никаких NaN/Infinity в позициях.
const random = seed.createRng('orbits');
let finiteOk = true;
for (let i = 0; i < 500; i++) {
  const a = random.range(4, 200);
  const e = random.range(0, 0.7);
  const M = random.range(0, kepler.TWO_PI);
  const inc = random.range(-0.4, 0.4);
  const node = random.range(0, kepler.TWO_PI);
  const argPeri = random.range(0, kepler.TWO_PI);
  const p = kepler.orbitalPosition({ a, e, M, inclination: inc, node, argPeri });
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) finiteOk = false;
}
check('500 случайных орбит дают конечные координаты', finiteOk);

// ───────────────────────────── созвездия ─────────────────────────────
const stars = Array.from({ length: 12 }, (_, i) => ({
  id: `star-${i}`,
  position: {
    x: Math.cos((i / 12) * Math.PI * 2) * 100,
    y: Math.sin(i) * 10,
    z: Math.sin((i / 12) * Math.PI * 2) * 100,
  },
}));

const auto = constellations.buildConstellations(stars, { groupCount: 3 });

check('авто-созвездия: пары построены', auto.pairs.length > 0);
check('авто-созвездия: 3 группы', auto.groups.length === 3, `groups=${auto.groups.length}`);

let pairsValid = true;
for (const [a, b] of auto.pairs) {
  if (a < 0 || b < 0 || a >= stars.length || b >= stars.length || a === b) pairsValid = false;
}
check('индексы пар валидны', pairsValid);

const explicit = constellations.buildConstellations(stars, {
  constellations: [
    { name: 'Тест', stars: ['star-0', 'star-1', 'star-2', 'star-3'] },
  ],
});

check('явное созвездие: 3 сегмента + замыкание', explicit.pairs.length === 4, `pairs=${explicit.pairs.length}`);
check('явное созвездие: имя сохранено', explicit.groups[0].name === 'Тест');
check(
  'явное созвездие: порядок индексов',
  explicit.groups[0].indices.join(',') === '0,1,2,3'
);

// ───────────────────────────── итог ─────────────────────────────
if (failures.length) {
  console.error(`\n❌ Провалено ${failures.length} проверок:`);
  for (const f of failures) console.error(`   • ${f}`);
  process.exit(1);
}

console.log(`\n✅ universe: ${passed} проверок пройдено (seed, kepler, constellations)`);
