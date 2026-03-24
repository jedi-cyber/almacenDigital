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
 */
export function canPlace(
  shelf: Shelf,
  placed: PlacedItem[],
  newItem: Item
): PlacedItem | null {
  if (!fitsInsideShelf(shelf, newItem)) {
    return null;
  }

  for (let x = 0; x <= shelf.width - newItem.width; x += SEARCH_STEP) {
    for (let y = 0; y <= shelf.height - newItem.height; y += SEARCH_STEP) {
      for (let z = 0; z <= shelf.depth - newItem.depth; z += SEARCH_STEP) {
        const candidatePosition = { x, y, z };
        const candidateBox = toBox(candidatePosition, newItem);
        const collision = placed.some((placedItem) =>
          aabbIntersects(
            toBox(placedItem.localPosition, placedItem.item),
            candidateBox
          )
        );

        if (!collision) {
          return {
            item: newItem,
            localPosition: candidatePosition
          };
        }
      }
    }
  }

  return null;
}
