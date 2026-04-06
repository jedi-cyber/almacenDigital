import type { Item, PlacedItem, Shelf, Vector3D } from "./types.js";

interface Box3D {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

const SEARCH_STEP = 1;

function toBox(position: Vector3D, item: Item): Box3D {
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    width: item.width,
    height: item.height,
    depth: item.depth
  };
}

function fitsInsideShelf(shelf: Shelf, item: Item): boolean {
  return (
    item.width <= shelf.width &&
    item.height <= shelf.height &&
    item.depth <= shelf.depth
  );
}

/**
 * Genera hasta 6 permutaciones únicas de las dimensiones de un ítem.
 */
function getItemPermutations(item: Item): Item[] {
  const { width, height, depth } = item;
  const permutations: [number, number, number][] = [
    [width, height, depth],
    [width, depth, height],
    [height, width, depth],
    [height, depth, width],
    [depth, width, height],
    [depth, height, width]
  ];

  // Usar un Set para solo incluir permutaciones de dimensiones únicas
  const uniquePermutationStrings = new Set(permutations.map(p => JSON.stringify(p)));

  return [...uniquePermutationStrings].map(pStr => {
    const [w, h, d] = JSON.parse(pStr);
    return {
      ...item,
      width: w,
      height: h,
      depth: d,
    };
  });
}

/**
 * Determina si dos cajas alineadas a los ejes se intersectan.
 */
export function aabbIntersects(a: Box3D, b: Box3D): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y &&
    a.z < b.z + b.depth &&
    a.z + a.depth > b.z
  );
}

/**
 * Devuelve los límites Y de cada sección usando las posiciones reales de los pisos (boardOffsets).
 * El resultado es un array de (numSections + 1) valores en coordenadas locales [0..shelf.height].
 */
export function getSectionBoundaries(shelf: Shelf): number[] {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  if (shelf.boardOffsets && shelf.boardOffsets.length > 0) {
    const sorted = [...shelf.boardOffsets].sort((a, b) => a - b);
    return [0, ...sorted.map((f) => f * shelf.height), shelf.height];
  }
  return Array.from({ length: sections + 1 }, (_, i) => (i * shelf.height) / sections);
}

/**
 * Busca la primera posición libre en un estante para ubicar un nuevo producto.
 * Prueba las 6 permutaciones de (width, height, depth) antes de retornar null.
 */
export function canPlace(
  shelf: Shelf,
  placed: PlacedItem[],
  newItem: Item,
  options?: { preferredSection?: number }
): PlacedItem | null {
  const itemPermutations = getItemPermutations(newItem);
  const boundaries = getSectionBoundaries(shelf);
  const numSections = boundaries.length - 1;
  const preferredSection = options?.preferredSection
    ? Math.min(Math.max(options.preferredSection, 1), numSections)
    : null;

  for (const itemVariant of itemPermutations) {
    if (!fitsInsideShelf(shelf, itemVariant)) {
      continue;
    }

    const sectionHeight = preferredSection !== null
      ? boundaries[preferredSection] - boundaries[preferredSection - 1]
      : shelf.height;

    if (preferredSection !== null && itemVariant.height > sectionHeight) {
      continue;
    }

    for (let x = 0; x <= shelf.width - itemVariant.width; x += SEARCH_STEP) {
      const minY = preferredSection !== null ? boundaries[preferredSection - 1] : 0;
      const maxY = preferredSection !== null
        ? boundaries[preferredSection] - itemVariant.height
        : shelf.height - itemVariant.height;

      for (let y = minY; y <= maxY; y += SEARCH_STEP) {
        for (let z = 0; z <= shelf.depth - itemVariant.depth; z += SEARCH_STEP) {
          const candidatePosition = { x, y, z };
          const candidateBox = toBox(candidatePosition, itemVariant);
          const collision = placed.some((placedItem) =>
            aabbIntersects(
              toBox(placedItem.localPosition, placedItem.item),
              candidateBox
            )
          );

          if (!collision) {
            return {
              item: itemVariant,
              localPosition: candidatePosition
            };
          }
        }
      }
    }
  }

  return null;
}
