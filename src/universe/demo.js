// ─────────────────────────────────────────────────────────────────────────────
//  demo.js — автономная демонстрация модуля src/universe/.
//
//  Не импортирует ничего из существующего проекта, кроме three из vendor/.
//  Открывается отдельной страницей: /universe.html
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createUniverseController } from './index.js';

const canvas = document.getElementById('uni-canvas');
const badge = document.getElementById('uni-badge');
const backButton = document.getElementById('uni-back');
const randomButton = document.getElementById('uni-random');
const hoverLabel = document.getElementById('uni-hover');
const infoTitle = document.getElementById('uni-info-title');
const infoBody = document.getElementById('uni-info-body');

// ── Рендерер ──
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020308);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  40000
);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.9;
controls.minDistance = 6;
controls.maxDistance = 9000;

// ── Дальний звёздный фон (чтобы система не висела в пустоте) ──
const makeDotTexture = () => {
  const size = 64;
  const map = document.createElement('canvas');
  map.width = map.height = size;
  const ctx = map.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(map);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeStarfield = () => {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const radius = 4200 + Math.random() * 5200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    color.setHSL(0.55 + Math.random() * 0.1, 0.25 + Math.random() * 0.4, 0.6 + Math.random() * 0.4);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.7,
    map: makeDotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -5;
  return points;
};

scene.add(makeStarfield());

// ── Вселенная ──
const setInfo = (title, html) => {
  infoTitle.textContent = title;
  infoBody.innerHTML = html;
};

// Ошибки — прямо в карточку, чтобы демо не «молчало» чёрным экраном.
const showError = (message) => {
  setInfo('Ошибка', `<b style="color:#ff8f7a">${message}</b>`);
};
window.addEventListener('error', (event) => showError(event.message || 'JavaScript error'));
window.addEventListener('unhandledrejection', (event) => {
  showError(String(event.reason && event.reason.message ? event.reason.message : event.reason));
});

// Демо-ссылки для проверки без кликов:
//   /universe.html?star=star-7
//   /universe.html?star=star-7&type=blackHole
//   /universe.html?star=star-2&type=blueGiant
const params = new URLSearchParams(window.location.search);
const forcedType = params.get('type');
const instant = params.get('instant') === '1';

const controller = createUniverseController({
  scene,
  camera,
  controls,
  renderer,

  // Для скриншотов/тестов: ?instant=1 проматывает перелёты.
  flightDurationScale: instant ? 0.002 : 1,

  mapOptions: {
    seed: 'milky-way-demo',
    radius: 620,
    thickness: 26,
    starCount: 42000,
    keyStarCount: 18,
    rotateSpeed: 0.006,
  },

  systemDefaults: {
    minPlanets: 3,
    maxPlanets: 7,
    speed: 1,
    planetScale: 1.7,
    ...(forcedType ? { starType: forcedType } : {}),
  },

  // Здесь можно подключить готовую ЧД проекта:
  // blackHoleFactory: (opts) => createBlackHole(opts),
  blackHoleFactory: null,

  onModeChange: (mode, star) => {
    badge.textContent = mode === 'galaxy' ? 'Галактика' : star ? star.name : 'Система';
    backButton.hidden = mode !== 'system';
    randomButton.hidden = mode !== 'galaxy';
    hoverLabel.hidden = true;

    if (mode === 'galaxy') {
      setInfo(
        'Млечный Путь',
        'Клик по яркой звезде — войти в систему.<br /><b>Esc</b> или кнопка — вернуться на карту.'
      );
      return;
    }

    const system = controller.currentSystem;
    if (system) {
      setInfo(
        star.name,
        `<b>${system.starLabel}</b> · планет: <b>${system.planets.length}</b><br />` +
          'Клик по планете — её параметры.'
      );
    }
  },

  onHover: (star) => {
    if (!star) {
      hoverLabel.hidden = true;
      return;
    }
    hoverLabel.textContent = star.name;
    hoverLabel.hidden = false;
  },

  onPlanetClick: (planet) => {
    const kind = planet.kind === 'gas' ? 'Газовый гигант' : 'Землеподобная';
    setInfo(
      planet.name,
      `${kind}<br />` +
        `радиус <b>${planet.radius.toFixed(2)}</b> · ` +
        `a <b>${planet.a.toFixed(1)}</b> · ` +
        `e <b>${planet.e.toFixed(2)}</b><br />` +
        'Клик по другой планете — сравнить.'
    );
  },
});

controller.bindInput(canvas);

// Deep-link: сразу войти в систему (удобно для проверки и шаринга).
const linkedStar = params.get('star');
if (linkedStar) {
  const star = controller.map.getStar(linkedStar);
  if (star) controller.enterSystem(star);
}

// ── Кнопки ──
backButton.addEventListener('click', () => controller.enterGalaxy());

randomButton.addEventListener('click', () => {
  const stars = controller.map.keyStars;
  const star = stars[Math.floor(Math.random() * stars.length)];
  if (star) controller.enterSystem(star);
});

// ── Ресайз ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controller.map.setPixelRatio(renderer.getPixelRatio());
});

// ── Цикл ──
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  controller.update(delta);
  controls.update();
  renderer.render(scene, camera);
});
