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
 * Busca la primera posición libre en un estante para ubicar un nuevo producto.
 * Prueba las 6 permutaciones de (width, height, depth) antes de retornar null.
 */
export function canPlace(
  shelf: Shelf,
  placed: PlacedItem[],
  newItem: Item
): PlacedItem | null {
  const itemPermutations = getItemPermutations(newItem);

  for (const itemVariant of itemPermutations) {
    if (!fitsInsideShelf(shelf, itemVariant)) {
      continue;
    }

    for (let x = 0; x <= shelf.width - itemVariant.width; x += SEARCH_STEP) {
      for (let y = 0; y <= shelf.height - itemVariant.height; y += SEARCH_STEP) {
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
