// ─────────────────────────────────────────────────────────────
// МАТЕМАТИКА ШУМА И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// Без DOM и без THREE — чистые функции, удобно тестировать отдельно.
// ─────────────────────────────────────────────────────────────

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// Повышаем контраст относительно середины (0.5)
export const contrast = (t, amount) => clamp01((t - 0.5) * amount + 0.5)

// Целочисленный хэш -> псевдослучайное [0, 1)
export const hash2 = (x, y, seed) => {
  let h =
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(seed, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Value-noise со сглаживанием, периодичный по X (periodX — в целых клетках).
// Периодичность по X даёт бесшовную развёртку по горизонтали (нет шва на сфере).
export const valueNoise = (x, y, periodX, seed) => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const wrap = (i) => ((i % periodX) + periodX) % periodX
  const a = hash2(wrap(x0), y0, seed)
  const b = hash2(wrap(x0 + 1), y0, seed)
  const c = hash2(wrap(x0), y0 + 1, seed)
  const d = hash2(wrap(x0 + 1), y0 + 1, seed)
  const ab = a + (b - a) * ux
  const cd = c + (d - c) * ux
  return ab + (cd - ab) * uy
}

// Фрактальный шум (fBm): сумма октав. u, v задаются в диапазоне [0, 1]
export const fbm = (u, v, octaves, baseFreq, seed) => {
  let amp = 1
  let freq = baseFreq
  let sum = 0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + o * 131)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

// ── Палитры ──
export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// gradient: список [позиция, '#hex'] -> [[pos, [r,g,b]], ...]
export const gradient = (stops) => stops.map(([pos, hex]) => [pos, hexToRgb(hex)])

export const sampleGradient = (stops, t) => {
  t = clamp01(t)
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0 || 1)
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k
      ]
    }
  }
  return stops[stops.length - 1][1]
}

// Пересчёт каждого пикселя текстуры по функции-шейдеру
export const paintPixels = (ctx, shader) => {
  const { width, height } = ctx.canvas
  const image = ctx.createImageData(width, height)
  const data = image.data
  let i = 0
  for (let y = 0; y < height; y++) {
    const v = y / height
    for (let x = 0; x < width; x++) {
      shader(x / width, v, data, i)
      i += 4
    }
  }
  ctx.putImageData(image, 0, 0)
}
