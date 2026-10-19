// ─────────────────────────────────────────────────────────────────────────────
//  constellations.js — построение созвездий поверх карты галактики.
//
//  Два режима:
//    1. Автоматический: ключевые звёзды группируются по азимуту,
//       внутри группы соединяются «цепочкой» по высоте (y) + одна диагональ.
//    2. Явный: передаёшь constellations = [{ name, stars: ['id1', 'id2', ...] }].
//
//  Модуль не импортирует three — работает с { id, position: {x,y,z} }.
//  Возвращает пары индексов, чтобы вызывающий код сам собрал LineSegments.
// ─────────────────────────────────────────────────────────────────────────────
// ─── [FEATURE:CONSTELLATIONS] ───

export const CONSTELLATION_NAMES = [
  'Орион',
  'Кассиопея',
  'Большая Медведица',
  'Лебедь',
  'Лира',
  'Скорпион',
  'Центавр',
  'Персей',
  'Андромеда',
  'Дракон',
  'Волопас',
  'Корма',
  'Пегас',
  'Кит',
  'Журавль',
  'Феникс',
];

/**
 * Собрать пары «звезда — звезда» для линий созвездий.
 *
 * @param {Array<{id: string|number, position: {x:number,y:number,z:number}}>} stars
 * @param {object} [options]
 * @param {Array<{name?:string, stars:Array<string|number>}>} [options.constellations] — явные созвездия по id
 * @param {number} [options.groupCount] — сколько созвездий при авто-режиме
 * @param {string[]} [options.names] — имена для авто-режима
 * @returns {{pairs: Array<[number, number]>, groups: Array<{name: string, indices: number[]}>}}
 */
export const buildConstellations = (stars, options = {}) => {
  const { constellations = null, groupCount = null, names = CONSTELLATION_NAMES } = options;

  if (!Array.isArray(stars) || stars.length < 2) return { pairs: [], groups: [] };

  // ── Явный режим ──
  if (Array.isArray(constellations) && constellations.length) {
    const indexById = new Map();
    stars.forEach((s, i) => indexById.set(String(s.id), i));

    const pairs = [];
    const seen = new Set();
    const groups = [];

    const addPair = (a, b) => {
      if (a === b || a == null || b == null) return;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push([a, b]);
    };

    for (const c of constellations) {
      const indices = [];
      for (const id of c.stars || []) {
        const idx = indexById.get(String(id));
        if (idx !== undefined && !indices.includes(idx)) indices.push(idx);
      }
      for (let i = 0; i + 1 < indices.length; i++) addPair(indices[i], indices[i + 1]);
      if (indices.length >= 4 && c.closed !== false) addPair(indices[0], indices[indices.length - 1]);
      groups.push({ name: c.name || `Созвездие ${groups.length + 1}`, indices });
    }

    return { pairs, groups };
  }

  // ── Авто-режим ──
  const count = stars.length;
  const groupsCount = Math.max(2, Math.min(count, groupCount || Math.round(count / 4)));

  // Сортируем по азимуту вокруг вертикальной оси и режем на сектора.
  const byAngle = stars
    .map((s, i) => {
      const p = s.position || { x: 0, y: 0, z: 0 };
      return { i, angle: Math.atan2(p.z, p.x) };
    })
    .sort((a, b) => a.angle - b.angle);

  const buckets = Array.from({ length: groupsCount }, () => []);
  byAngle.forEach((entry, k) => {
    const bucket = Math.min(groupsCount - 1, Math.floor((k * groupsCount) / count));
    buckets[bucket].push(entry.i);
  });

  const pairs = [];
  const seen = new Set();
  const groups = [];

  const addPair = (a, b) => {
    if (a === b || a == null || b == null) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  };

  buckets.forEach((bucket, gi) => {
    if (bucket.length < 2) return;

    // Внутри созвездия — цепочка по высоте: получаются «ломанные» фигуры.
    const sorted = bucket.slice().sort((a, b) => {
      const pa = stars[a].position || {};
      const pb = stars[b].position || {};
      return (pa.y || 0) - (pb.y || 0);
    });

    for (let i = 0; i + 1 < sorted.length; i++) addPair(sorted[i], sorted[i + 1]);

    // Дополнительная перекладина — созвездие перестаёт быть простой линией.
    if (sorted.length >= 4) addPair(sorted[0], sorted[2]);
    if (sorted.length >= 6) addPair(sorted[1], sorted[sorted.length - 1]);

    groups.push({
      name: names[gi % names.length],
      indices: sorted,
    });
  });

  return { pairs, groups };
};
