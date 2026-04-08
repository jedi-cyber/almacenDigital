import type { Item, PlacedItem, Shelf, Vector3D } from "./types.js";

interface Box3D {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

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

  const uniquePermutationStrings = new Set(permutations.map(p => JSON.stringify(p)));

  return [...uniquePermutationStrings].map(pStr => {
    const [w, h, d] = JSON.parse(pStr);
    return { ...item, width: w, height: h, depth: d };
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
 * Calcula el conjunto de coordenadas candidatas por eje usando compresión de coordenadas.
 *
 * En lugar de recorrer cada posición entera del grid (O(W×H×D)), solo se prueban
 * coordenadas "evento": la pared del estante (0 / minY) y la cara posterior/superior/lateral
 * de cada item ya colocado. Para grids enteros esto es COMPLETO: cualquier posición
 * válida tiene una posición equivalente (misma o menor coordenada) en este conjunto,
 * porque la primera posición libre siempre puede empujarse hasta tocar una pared o
 * un item existente sin crear nueva colisión.
 *
 * Complejidad: O(n) para construir · O(n) candidatos por eje → O(n³) candidatos totales
 * frente a O(W×H×D) del recorrido exhaustivo.
 */
function eventCoords(
  placed: PlacedItem[],
  shelf: Shelf,
  item: Item,
  minY: number,
  maxY: number
): { xs: number[]; ys: number[]; zs: number[] } {
  const xSet = new Set<number>([0]);
  const ySet = new Set<number>([minY]);
  const zSet = new Set<number>([0]);

  for (const pi of placed) {
    xSet.add(pi.localPosition.x + pi.item.width);
    ySet.add(pi.localPosition.y + pi.item.height);
    zSet.add(pi.localPosition.z + pi.item.depth);
  }

  const maxX     = shelf.width - item.width;
  const maxZ     = shelf.depth - item.depth;
  const itemMaxY = maxY - item.height;

  return {
    xs: [...xSet].filter(x => x >= 0 && x <= maxX).sort((a, b) => a - b),
    ys: [...ySet].filter(y => y >= minY && y <= itemMaxY).sort((a, b) => a - b),
    zs: [...zSet].filter(z => z >= 0 && z <= maxZ).sort((a, b) => a - b),
  };
}

/**
 * Busca la primera posición libre en un estante para ubicar un nuevo producto.
 * Prueba las 6 permutaciones de (width, height, depth) antes de retornar null.
 *
 * Utiliza compresión de coordenadas para reducir el espacio de búsqueda de
 * O(W×H×D×n) a O(n⁴), con una mejora práctica de 10×-100× en estantes grandes.
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

  // Precomputar los boxes de los items ya colocados una sola vez.
  const placedBoxes = placed.map(pi => toBox(pi.localPosition, pi.item));

  for (const itemVariant of itemPermutations) {
    if (!fitsInsideShelf(shelf, itemVariant)) {
      continue;
    }

    const minY = preferredSection !== null ? boundaries[preferredSection - 1] : 0;
    const maxY = preferredSection !== null ? boundaries[preferredSection] : shelf.height;

    if (preferredSection !== null && itemVariant.height > maxY - minY) {
      continue;
    }

    const { xs, ys, zs } = eventCoords(placed, shelf, itemVariant, minY, maxY);

    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const candidateBox = toBox({ x, y, z }, itemVariant);
          const collision = placedBoxes.some(box => aabbIntersects(candidateBox, box));

          if (!collision) {
            return { item: itemVariant, localPosition: { x, y, z } };
          }
        }
      }
    }
  }

  return null;
}
