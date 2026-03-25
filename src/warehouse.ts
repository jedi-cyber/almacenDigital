import * as THREE from "three";

import { canPlace } from "./canPlace.js";
import { animateProductAppearance, createProductMesh, disposeProductMesh } from "./scene.js";
import type { Item, PlacedItem, Shelf, WarehouseConfig } from "./types.js";

export interface WarehouseRuntime {
  productsByShelf: Map<string, PlacedItem[]>;
  productMeshesByShelf: Map<string, THREE.Mesh[]>;
  productMeshBySku: Map<string, THREE.Mesh>;
  blinkIntervalId: number | null;
}

/**
 * Carga la configuración serializada del almacén desde la carpeta pública.
 */
export async function loadWarehouseConfig(): Promise<WarehouseConfig> {
  const response = await fetch("/warehouse-config.json");
  if (!response.ok) {
    throw new Error(`No se pudo cargar la configuracion: ${response.status}`);
  }

  const config = (await response.json()) as WarehouseConfig;

  if (!Array.isArray(config.shelves) || config.shelves.length < 6) {
    throw new Error("La configuracion del almacen debe incluir al menos 6 estantes.");
  }

  return config;
}

/**
 * Inicializa el estado del runtime con los mapas vacíos para cada estante.
 */
export function createRuntime(config: WarehouseConfig): WarehouseRuntime {
  return {
    productsByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    productMeshesByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    productMeshBySku: new Map(),
    blinkIntervalId: null
  };
}

/**
 * Ejecuta canPlace y, si hay espacio, crea la malla, la agrega a la escena y actualiza el runtime.
 * Devuelve el PlacedItem resultante, o null si no hubo lugar disponible.
 */
export function placeItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  item: Item,
  shelf: Shelf,
  shelfMesh: THREE.Mesh
): PlacedItem | null {
  const placedItems = runtime.productsByShelf.get(shelf.id) ?? [];
  const placement = canPlace(shelf, placedItems, item);
  if (!placement) return null;

  const mesh = createProductMesh(item, placement, shelfMesh);
  scene.add(mesh);
  animateProductAppearance(mesh);

  placedItems.push(placement);
  runtime.productsByShelf.set(shelf.id, placedItems);

  const meshes = runtime.productMeshesByShelf.get(shelf.id) ?? [];
  meshes.push(mesh);
  runtime.productMeshesByShelf.set(shelf.id, meshes);
  runtime.productMeshBySku.set(item.sku, mesh);

  return placement;
}

/**
 * Elimina un producto de la escena y de todos los registros del runtime.
 * Devuelve el ID del estante afectado, o null si el SKU no existía.
 */
export function removeItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  sku: string
): string | null {
  const mesh = runtime.productMeshBySku.get(sku);
  if (!mesh) return null;

  const shelfId = String(mesh.userData.shelfId);

  clearHighlight(runtime);

  scene.remove(mesh);
  disposeProductMesh(mesh);

  runtime.productMeshBySku.delete(sku);

  const meshList = runtime.productMeshesByShelf.get(shelfId) ?? [];
  runtime.productMeshesByShelf.set(shelfId, meshList.filter((m) => m !== mesh));

  const itemList = runtime.productsByShelf.get(shelfId) ?? [];
  runtime.productsByShelf.set(shelfId, itemList.filter((p) => p.item.sku !== sku));

  return shelfId;
}

/**
 * Resalta un producto con efecto emisivo cian intermitente.
 * Limpia cualquier resaltado anterior antes de aplicar el nuevo.
 */
export function highlightProduct(runtime: WarehouseRuntime, sku: string): boolean {
  clearHighlight(runtime);

  const target = runtime.productMeshBySku.get(sku);
  if (!target) return false;

  const material = target.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;

  material.emissive.setHex(0x00ffff);
  material.emissiveIntensity = 0.8;

  let isBright = true;
  runtime.blinkIntervalId = window.setInterval(() => {
    isBright = !isBright;
    material.emissiveIntensity = isBright ? 0.8 : 0.15;
  }, 500);

  return true;
}

/**
 * Limpia el efecto emisivo de todos los productos y cancela el intervalo de parpadeo.
 */
export function clearHighlight(runtime: WarehouseRuntime): void {
  if (runtime.blinkIntervalId !== null) {
    window.clearInterval(runtime.blinkIntervalId);
    runtime.blinkIntervalId = null;
  }

  runtime.productMeshBySku.forEach((mesh) => {
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  });
}
