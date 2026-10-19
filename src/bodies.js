import * as THREE from 'three'
import { orbitLocal, orbitOrientation, orbitPolyline } from './orbit.js'
import {
  createProPlanetTexture,
  textureSize,
  glowTexture
} from './textures.js'

// ─────────────────────────────────────────────────────────────
// ТЕЛА СИСТЕМЫ: планеты, их спутники, аппараты, кольца, атмосферы,
// Солнце (корона/ореол) и Tesla Roadster со Starman.
// Все фабрики принимают родительскую группу (обычно `world`).
// ─────────────────────────────────────────────────────────────

// Тонкое светящееся кольцо орбиты (для спутников и аппаратов), в плоскости XZ
export const createOrbitRing = (radius, color, opacity) => {
  const points = []
  for (let i = 0; i <= 96; i++) {
    const theta = (i / 96) * Math.PI * 2
    points.push(
      new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius)
    )
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
}

// Эллиптическая орбита (для комет и Теслы), фокус в начале координат
export const createEllipseOrbit = (parent, a, e, inc, color, opacity) => {
  const points = []
  const euler = new THREE.Euler(inc, 0, 0, 'XYZ')
  for (let i = 0; i <= 180; i++) {
    const nu = (i / 180) * Math.PI * 2
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
    points.push(
      new THREE.Vector3(Math.cos(nu) * r, 0, Math.sin(nu) * r).applyEuler(euler)
    )
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  )
  parent.add(line)
  return line
}

// ─── [FEATURE:ATMOSPHERE] fresnel-свечение оболочки планеты ───
export const createAtmosphere = (radius, color, intensity) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) },
      uIntensity: { value: intensity }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  })
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 48, 48), material)
}

// ─── [FEATURE:RINGS] кольца Сатурна: несколько полос + щели между ними ───
export const createSaturnRings = (radius) => {
  const group = new THREE.Group()
  const bands = [
    { inner: 1.25, outer: 1.55, opacity: 0.55, color: 0xcbb083 },
    { inner: 1.6, outer: 1.95, opacity: 0.32, color: 0xb89a6a },
    { inner: 2.0, outer: 2.32, opacity: 0.5, color: 0xd8c39a },
    { inner: 2.36, outer: 2.5, opacity: 0.26, color: 0xa88d67 }
  ]
  bands.forEach((b) => {
    const geo = new THREE.RingGeometry(radius * b.inner, radius * b.outer, 96).rotateX(
      -Math.PI / 2
    )
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: b.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: b.opacity,
        roughness: 0.9,
        metalness: 0.0
      })
    )
    ring.receiveShadow = true
    group.add(ring)
  })
  return group
}

// ─── [FEATURE:MOONS] естественный спутник планеты ───
export const buildMoon = (moon) => {
  const orbit = new THREE.Object3D()
  orbit.rotation.x = (Math.random() - 0.5) * 0.35 // лёгкий наклон плоскости спутника
  orbit.rotation.z = (Math.random() - 0.5) * 0.2

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(moon.radius, 2),
    new THREE.MeshStandardMaterial({
      color: moon.color,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true
    })
  )
  mesh.position.x = moon.distance
  mesh.castShadow = true
  mesh.receiveShadow = true
  orbit.add(mesh)
  orbit.add(createOrbitRing(moon.distance, 0x8fa6ff, 0.07))
  return { orbit, mesh, speed: moon.orbitSpeed }
}

// ─── [FEATURE:SATELLITES] искусственный аппарат: корпус + панели + антенна + маяк ───
export const buildSatellite = (scale) => {
  const group = new THREE.Object3D()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.9 })
  )
  group.add(body)

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x24427f,
    roughness: 0.3,
    metalness: 0.6,
    emissive: 0x14306a,
    emissiveIntensity: 0.7
  })
  const panelGeo = new THREE.BoxGeometry(0.26, 0.012, 0.18)
  const left = new THREE.Mesh(panelGeo, panelMat)
  left.position.x = -0.24
  const right = new THREE.Mesh(panelGeo, panelMat)
  right.position.x = 0.24
  group.add(left)
  group.add(right)

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xe3e7ec, roughness: 0.4, metalness: 0.7 })
  )
  dish.rotation.x = Math.PI / 2
  dish.position.set(0, 0.1, 0.03)
  group.add(dish)

  // Мигающий маяк — его прозрачность анимируется в игровом цикле
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xff4040,
    transparent: true,
    toneMapped: false
  })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), beaconMat)
  beacon.position.set(0, -0.1, 0)
  group.add(beacon)

  group.scale.setScalar(scale)
  return { group, beaconMat }
}

// ─── [FEATURE:SUN] корона-оболочка, «дышит» во времени ───
export const createSunCorona = (radius) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color().setHex(0xff7a1a, THREE.LinearSRGBColorSpace) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float pulse = 0.82 + 0.18 * sin(uTime * 2.2);
        gl_FragColor = vec4(uColor * (1.0 + rim), rim * 0.95 * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  })
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.22, 48, 48), material)
}

// Ореолы + корона Солнца с функцией анимации
export const createSunEffects = (radius) => {
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      color: 0xff8800,
      transparent: true,
      depthWrite: false
    })
  )
  glow.scale.set(10.5, 10.5, 1)

  const glowOuter = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      color: 0xff4400,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    })
  )
  glowOuter.scale.set(22, 22, 1)

  const corona = createSunCorona(radius)

  const update = (elapsed) => {
    corona.material.uniforms.uTime.value = elapsed
    corona.rotation.y += 0.0009
    const s1 = 10.5 + Math.sin(elapsed * 1.5) * 0.5
    glow.scale.set(s1, s1, 1)
    const s2 = 22 + Math.sin(elapsed * 1.1 + 1.0) * 1.6
    glowOuter.scale.set(s2, s2, 1)
  }

  return { glow, glowOuter, corona, update }
}

// ─── [FEATURE:SUN] материал фотосферы: лимб-даркенинг + «кипение» ───
// Берём тайл текстуры, смешиваем два слоя с небольшим взаимным смещением
// (даёт эффект бурлящей плазмы) и затемняем к краю диска (лимб-даркенинг).
export const createSunMaterial = (texture) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // Два слоя текстуры, медленно «плывущих» навстречу друг другу
        float t = uTime * 0.015;
        vec3 c1 = texture2D(uMap, vUv + vec2(t, t * 0.33)).rgb;
        vec3 c2 = texture2D(uMap, vUv - vec2(t * 0.8, t * 0.21)).rgb;
        vec3 tex = mix(c1, c2, 0.5);

        // Лимб-даркенинг: центр диска ярче, край темнее
        float ndv = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        float limb = 0.30 + 0.70 * pow(ndv, 0.5);

        vec3 col = tex * limb * 1.45;
        // Самые горячие участки подмешиваем к тёплому белому
        float hot = smoothstep(0.55, 1.0, dot(tex, vec3(0.3333)));
        col += vec3(0.32, 0.20, 0.05) * hot;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    toneMapped: true
  })

// ── Одна планета + её орбита, спутники и аппараты ──
export const createPlanet = (parent, config) => {
  const {
    type,
    radius,
    distance,
    axialTilt,
    moons,
    artificial,
    eccentricity = 0,
    inclination = 0,
    node = 0,
    startAngle = 0,
    speedScale = 1
  } = config

  // ─── [FEATURE:KEPLER] большая полуось, эксцентриситет и наклон плоскости ───
  const a = distance
  const e = eccentricity
  const orientation = orbitOrientation(inclination, node)
  const nu0 = startAngle * (Math.PI / 180)

  // Контейнер планеты: позиция точки на эллипсе задаётся вручную (см. main.js),
  // поэтому группа больше не крутится вокруг Y.
  const orbitGroup = new THREE.Object3D()
  parent.add(orbitGroup)

  // Линия орбиты — тот же эллипс с наклоном плоскости (та же математика, что и у планеты)
  if (a > 0) {
    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPolyline(a, e, orientation)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
    )
    orbitGroup.add(orbitLine)
  }

  // Точка планеты: спутники/аппараты крепятся сюда, не наследуя наклон оси
  const holder = new THREE.Object3D()
  if (a > 0) orbitLocal(a, e, nu0, holder.position).applyEuler(orientation)
  orbitGroup.add(holder)

  // Наклон оси: внутри живёт сама планета, её атмосфера и кольца
  const tiltGroup = new THREE.Object3D()
  if (axialTilt) tiltGroup.rotation.z = axialTilt
  holder.add(tiltGroup)

  const texture = createProPlanetTexture(type, textureSize(radius))
  const material =
    type === 'sun'
      ? createSunMaterial(texture)
      : new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.65,
          metalness: 0.05
        })

  const segments = radius < 1 ? 32 : 64
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, segments),
    material
  )
  if (type !== 'sun') {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  tiltGroup.add(mesh)

  // ─── [FEATURE:ATMOSPHERE] ───
  if (config.atmosphere) {
    tiltGroup.add(
      createAtmosphere(radius, config.atmosphere.color, config.atmosphere.intensity)
    )
  }

  // ─── [FEATURE:RINGS] ───
  if (type === 'saturn') {
    tiltGroup.add(createSaturnRings(radius))
  }

  // ─── [FEATURE:MOONS] ───
  const moonRigs = []
  if (moons) {
    moons.forEach((m) => {
      const rig = buildMoon(m)
      holder.add(rig.orbit)
      moonRigs.push(rig)
    })
  }

  // ─── [FEATURE:SATELLITES] ───
  const satRigs = []
  if (artificial) {
    artificial.forEach((s) => {
      const orbit = new THREE.Object3D()
      orbit.rotation.x = s.inclination || 0
      orbit.rotation.z = (Math.random() - 0.5) * 0.25
      holder.add(orbit)

      const scale = Math.max(0.3, Math.min(0.7, radius * 0.5))
      const sat = buildSatellite(scale)
      sat.group.position.x = s.distance
      orbit.add(sat.group)
      orbit.add(createOrbitRing(s.distance, 0x66ffcc, 0.16))
      satRigs.push({ orbit, speed: s.orbitSpeed, satellite: sat })
    })
  }

  // Запоминаем исходный emissive — нужен для подсветки выбранной планеты в UI
  const emissive = mesh.material.emissive ? mesh.material.emissive.clone() : null

  // ─── [FEATURE:UI] линии орбит (планета + кольца спутников/аппаратов) — для тумблера «Орбиты»
  const orbitLines = []
  orbitGroup.traverse((obj) => {
    if (obj.isLine) orbitLines.push(obj)
  })

  return {
    config,
    mesh,
    orbitGroup,
    holder,
    moonRigs,
    satRigs,
    emissive,
    orbitLines,
    // ─── [FEATURE:KEPLER] состояние орбиты: большая полуось, эксцентриситет,
    // ориентация плоскости и текущая истинная аномалия (её двигает main.js)
    orbit: { a, e, orientation, nu: nu0, speedScale }
  }
}

// ─── [FEATURE:TESLA] Tesla Roadster со Starman за рулём ───
export const buildTesla = (scale) => {
  const group = new THREE.Object3D()

  const red = new THREE.MeshStandardMaterial({ color: 0xd01f2b, roughness: 0.35, metalness: 0.5 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x101a26, roughness: 0.15, metalness: 0.8 })
  const tyre = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9, metalness: 0.1 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.42), red)
  body.position.y = 0.16
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.36), glass)
  cabin.position.set(-0.05, 0.34, 0)
  group.add(cabin)

  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16)
  ;[
    [0.28, 0.11, 0.22],
    [0.28, 0.11, -0.22],
    [-0.3, 0.11, 0.22],
    [-0.3, 0.11, -0.22]
  ].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, tyre)
    w.rotation.x = Math.PI / 2
    w.position.set(x, y, z)
    group.add(w)
  })

  // Starman — фигурка в белом скафандре рядом с рулём
  const suit = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.07, 0.12, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 })
  )
  suit.position.set(-0.05, 0.5, 0)
  group.add(suit)

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.2,
      emissive: 0x8899aa,
      emissiveIntensity: 0.35
    })
  )
  helmet.position.set(-0.05, 0.62, 0)
  group.add(helmet)

  // Деликатное свечение, чтобы Теслу было видно издалека
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff5a5a,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    toneMapped: false
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(1.6)
  group.add(glow)

  group.scale.setScalar(scale)
  return { group, glowMat }
}
