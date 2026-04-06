import { calcVolume } from "./volume.js";
import type { PlacedItem, Shelf, ShelfStatus } from "./types.js";

/**
 * Calcula el estado volumétrico actual de un estante.
 */
export function calcShelfStatus(
  shelf: Shelf,
  items: PlacedItem[]
): ShelfStatus {
  const total = calcVolume(shelf);
  const occupied = items.reduce((sum, placedItem) => {
    return sum + calcVolume(placedItem.item);
  }, 0);

  return {
    total,
    occupied,
    free: total - occupied,
    pct: total === 0 ? 0 : (occupied / total) * 100
  };
}
