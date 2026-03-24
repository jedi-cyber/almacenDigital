import type { Dimensions } from "./types.js";

/**
 * Calcula el volumen de una entidad rectangular 3D.
 */
export function calcVolume(dimensions: Dimensions): number {
  return dimensions.width * dimensions.height * dimensions.depth;
}
