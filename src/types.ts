/**
 * Medidas tridimensionales de una entidad volumétrica.
 */
export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * Coordenada 3D genérica.
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Definición de un estante dentro de la escena.
 */
export interface Shelf extends Dimensions {
  id: string;
  label: string;
  sections?: number;
  /** Posiciones de pisos intermedios como fracción [0..1] de la altura (0=base, 1=techo).
   *  Cuando está presente, sobreescribe el espaciado uniforme de `sections`. */
  boardOffsets?: number[];
  position: Vector3D;
  rotationY?: number;
}

/**
 * Configuración serializable del almacén.
 */
export interface WarehouseConfig {
  shelves: Shelf[];
}

/**
 * Definición de un producto almacenable.
 */
export interface Item extends Dimensions {
  sku: string;
  name: string;
  weight?: number;
}

/**
 * Producto con posición local relativa al estante.
 */
export interface PlacedItem {
  item: Item;
  localPosition: Vector3D;
}

/**
 * Resumen volumétrico de un estante.
 */
export interface ShelfStatus {
  total: number;
  occupied: number;
  free: number;
  pct: number;
}
