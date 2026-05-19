/**
 * Medidas tridimensionales de una entidad volumétrica. */
export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * Coordenada 3D genérica. */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Definición de un estante dentro de la escena.*/
export interface Shelf extends Dimensions {
  id: string;
  label: string;
  sections?: number;
  sectionLabels?: string[];
  /** Posiciones de pisos intermedios como fracción [0..1] de la altura (0=base, 1=techo).
   *  Cuando está presente, sobreescribe el espaciado uniforme de `sections`. */
  boardOffsets?: number[];
  position: Vector3D;
  rotationY?: number;
}

/**
 * Punto de entrada real desde donde inicia la navegación guiada.
 */
export interface WarehouseEntrance {
  label: string;
  position: Vector3D;
}

/**
 * Pasillo o zona transitable usada para construir rutas más realistas.
 */
export interface WarehouseAisle {
  id: string;
  label: string;
  from: Vector3D;
  to: Vector3D;
  width?: number;
}

/**
 * Configuración serializable del almacén. */
export interface WarehouseConfig {
  shelves: Shelf[];
  entrance?: WarehouseEntrance;
  aisles?: WarehouseAisle[];
}

/**
 * Definición de un producto almacenable. */
export interface Item {
  sku: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  category?: string;
  categoryId?: number | null;
  brand?: string;
  brandId?: number | null;
  imageUrl?: string | null;
}

/**
 * Producto con posición local relativa al estante. */
export interface PlacedItem {
  item: Item;
  localPosition: Vector3D;
}

/**
 * Resumen volumétrico de un estante. */
export interface ShelfStatus {
  total: number;
  occupied: number;
  free: number;
  pct: number;
}
