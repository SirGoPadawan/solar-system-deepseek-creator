// ─────────────────────────────────────────────────────────────────────────────
//  modeController.js — переключение «Галактика ⇄ Система».
//
//  Режим 1: карта Галактики (Points + созвездия), клик по ключевой звезде.
//  Режим 2: вид изнутри выбранной системы, клик по планете.
//
//  Контроллер сам:
//    • создаёт карту и кладёт её в сцену;
//    • спавнит/уничтожает систему через createSystemSpawner;
//    • делает плавный перелёт камеры (easing, без GSAP);
//    • обрабатывает клики/ховер/Escape;
//    • отдаёт наружу события onModeChange / onHover / onPlanetClick.
//
//  Рендер и `controls.update()` остаются за вашим основным циклом.
//  Контроллер только двигает камеру во время перелёта.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:UNIVERSEMODES] ───

import * as THREE from 'three';
import { createGalaxyMap } from './galaxyMap.js';
import { createSystemSpawner } from './systemFactory.js';

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * @param {object} config
 * @param {THREE.Scene} config.scene
 * @param {THREE.PerspectiveCamera} config.camera
 * @param {object} [config.controls] — OrbitControls (нужен .target и .update())
 * @param {THREE.WebGLRenderer} [config.renderer]
 * @param {object} [config.mapOptions] — настройки createGalaxyMap
 * @param {object} [config.systemDefaults] — настройки generateSystem
 * @param {Function|null} [config.blackHoleFactory]
 * @param {(mode:string, star:object|null)=>void} [config.onModeChange]
 * @param {(star:object|null)=>void} [config.onHover]
 * @param {(planet:object, system:object)=>void} [config.onPlanetClick]
 * @param {boolean} [config.initializeCamera=true] — поставить камеру в обзор галактики
 * @param {boolean} [config.tuneControls=true] — расширить maxDistance под масштаб карты
 * @param {number} [config.speed=1]
 */
export const createUniverseController = (config) => {
  const {
    scene,
    camera,
    controls = null,
    renderer = null,
    mapOptions = {},
    systemDefaults = {},
    blackHoleFactory = null,
    onModeChange = null,
    onHover = null,
    onPlanetClick = null,
    initializeCamera = true,
    tuneControls = true,
    speed = 1,
    flightDurationScale = 1,
  } = config;

  const map = createGalaxyMap(mapOptions);
  scene.add(map.group);

  const spawner = createSystemSpawner({ scene, blackHoleFactory, defaults: systemDefaults });

  let mode = 'galaxy';
  let currentStar = null;
  let currentSystem = null;
  let hoveredStar = null;
  let flight = null;
  let time = 0;
  let speedScale = speed;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const tmpVec = new THREE.Vector3();
  const pointerDown = { x: 0, y: 0, t: 0, valid: false };

  if (renderer) map.setPixelRatio(renderer.getPixelRatio());

  // ── Камера обзора галактики ──
  const galaxyView = () => {
    const r = map.radius;
    return {
      position: new THREE.Vector3(0, r * 1.35, r * 1.9),
      target: new THREE.Vector3(0, 0, 0),
    };
  };

  const original = {
    far: camera.far,
    maxDistance: controls ? controls.maxDistance : undefined,
    minDistance: controls ? controls.minDistance : undefined,
  };

  if (tuneControls && controls) {
    // Карта большая: стандартный maxDistance может не пустить камеру назад.
    if (Number.isFinite(controls.maxDistance)) {
      controls.maxDistance = Math.max(controls.maxDistance, map.radius * 3.2);
    }
    controls.minDistance = Math.min(controls.minDistance || 0, 1);
  }

  if (initializeCamera) {
    const view = galaxyView();
    camera.position.copy(view.position);
    if (controls) {
      controls.target.copy(view.target);
      controls.update();
    } else {
      camera.lookAt(view.target);
    }
  }

  // Дальняя плоскость должна видеть всю карту.
  if (initializeCamera && camera.far < map.radius * 6) {
    camera.far = map.radius * 6;
    camera.updateProjectionMatrix();
  }

  const emitMode = () => {
    if (onModeChange) onModeChange(mode, currentStar);
  };

  // ── Плавный перелёт ──
  const flyTo = (position, target, duration = 1.2, onArrive = null) => {
    flight = {
      fromPos: camera.position.clone(),
      toPos: position.clone(),
      fromTarget: controls ? controls.target.clone() : target.clone(),
      toTarget: target.clone(),
      elapsed: 0,
      duration: Math.max(0.001, duration * flightDurationScale),
      onArrive,
    };
    if (controls) controls.enabled = false;
  };

  /**
   * Войти в систему по звезде (объект из map.keyStars) или по её id.
   * @returns {object|null} созданная система
   */
  const enterSystem = (starOrId) => {
    const star =
      typeof starOrId === 'object' && starOrId
        ? starOrId
        : map.getStar(starOrId);

    if (!star) return null;

    const worldPos = map.getWorldPosition(star, new THREE.Vector3());

    currentSystem = spawner.spawn(star.seed, {
      ...(star.starType ? { starType: star.starType } : {}),
    });
    currentSystem.root.position.copy(worldPos);

    currentStar = star;
    hoveredStar = null;
    mode = 'system';
    emitMode();

    const extent = Math.max(currentSystem.extent, 18);
    const camPos = worldPos
      .clone()
      .add(new THREE.Vector3(0, extent * 0.38, extent * 0.95));

    // Карту прячем в конце перелёта: сначала красиво улетаем из неё.
    flyTo(camPos, worldPos, 1.35, () => {
      map.group.visible = false;
    });

    if (controls) {
      controls.maxDistance = Math.max(controls.maxDistance, extent * 14);
    }

    return currentSystem;
  };

  /**
   * Вернуться на карту галактики. Текущая система живёт до конца перелёта,
   * потом удаляется из сцены и освобождает память.
   */
  const enterGalaxy = () => {
    if (mode === 'galaxy' && !currentSystem) {
      // Просто вернуть камеру в обзор, если она улетела.
      const view = galaxyView();
      flyTo(view.position, view.target, 1.1);
      return;
    }

    mode = 'galaxy';
    hoveredStar = null;
    map.group.visible = true;
    emitMode();

    const view = galaxyView();
    flyTo(view.position, view.target, 1.5, () => {
      spawner.clear(); // scene.remove + dispose
      currentSystem = null;
      currentStar = null;
    });
  };

  const toggle = () => {
    if (mode === 'galaxy') {
      if (currentStar) enterSystem(currentStar);
    } else {
      enterGalaxy();
    }
  };

  // ── Интерактив ──
  let detachInput = null;

  /**
   * Подписаться на клики/ховер/Escape.
   * @param {HTMLElement} domElement — canvas или его контейнер
   * @returns {() => void} отписка
   */
  const bindInput = (domElement) => {
    if (detachInput) detachInput();

    const width = () => domElement.clientWidth || 1;
    const height = () => domElement.clientHeight || 1;

    const toNdc = (event) => {
      const rect = domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return { x, y, width: rect.width, height: rect.height };
    };

    const onPointerDown = (event) => {
      pointerDown.x = event.clientX;
      pointerDown.y = event.clientY;
      pointerDown.t = performance.now();
      pointerDown.valid = true;
    };

    const onPointerUp = (event) => {
      if (!pointerDown.valid) return;
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      const elapsed = performance.now() - pointerDown.t;
      pointerDown.valid = false;

      // Это был драг камеры, а не клик.
      if (moved > 6 || elapsed > 700) return;
      if (flight) return;

      const ndc = toNdc(event);
      pointerNdc.set(ndc.x, ndc.y);

      if (mode === 'galaxy') {
        const star = map.pickAt(ndc.x, ndc.y, camera, {
          width: ndc.width,
          height: ndc.height,
        });
        if (star) enterSystem(star);
        return;
      }

      if (!currentSystem) return;

      raycaster.setFromCamera(pointerNdc, camera);
      const meshes = currentSystem.planets.map((p) => p.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return;

      const planet = currentSystem.planets.find((p) => p.mesh === hits[0].object);
      if (planet && onPlanetClick) onPlanetClick(planet, currentSystem);
    };

    const onPointerMove = (event) => {
      if (mode !== 'galaxy' || flight) return;

      const ndc = toNdc(event);
      const star = map.pickAt(ndc.x, ndc.y, camera, {
        width: ndc.width,
        height: ndc.height,
      });

      if (star !== hoveredStar) {
        hoveredStar = star;
        if (onHover) onHover(star);
      }

      domElement.style.cursor = star ? 'pointer' : '';
    };

    const onPointerLeave = () => {
      if (hoveredStar) {
        hoveredStar = null;
        if (onHover) onHover(null);
      }
      domElement.style.cursor = '';
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && mode === 'system') enterGalaxy();
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);

    detachInput = () => {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      domElement.style.cursor = '';
      detachInput = null;
    };

    return detachInput;
  };

  // ── Кадр ──
  const update = (delta) => {
    const dt = Math.min(delta || 0, 0.1);
    time += dt;

    map.update(time);

    if (currentSystem) currentSystem.update(dt, speedScale);

    if (flight) {
      flight.elapsed += dt;
      const k = Math.min(1, flight.elapsed / flight.duration);
      const e = easeInOutCubic(k);

      camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
      tmpVec.lerpVectors(flight.fromTarget, flight.toTarget, e);

      if (controls) {
        controls.target.copy(tmpVec);
        controls.update();
      } else {
        camera.lookAt(tmpVec);
      }

      if (k >= 1) {
        const done = flight.onArrive;
        flight = null;
        if (controls) controls.enabled = true;
        if (done) done();
      }
    }
  };

  const setSpeed = (value) => {
    speedScale = Math.max(0, value);
  };

  const getMode = () => mode;

  const dispose = () => {
    if (detachInput) detachInput();
    spawner.clear();
    currentSystem = null;
    currentStar = null;
    map.dispose();

    // Возвращаем камере/контролам то, что меняли при старте.
    if (camera.far !== original.far) {
      camera.far = original.far;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      if (original.maxDistance !== undefined) controls.maxDistance = original.maxDistance;
      if (original.minDistance !== undefined) controls.minDistance = original.minDistance;
      controls.enabled = true;
    }
  };

  return {
    map,
    spawner,
    enterSystem,
    enterGalaxy,
    toggle,
    bindInput,
    update,
    setSpeed,
    getMode,
    get currentSystem() {
      return currentSystem;
    },
    get currentStar() {
      return currentStar;
    },
    get hoveredStar() {
      return hoveredStar;
    },
    get isFlying() {
      return flight !== null;
    },
    dispose,
  };
};
