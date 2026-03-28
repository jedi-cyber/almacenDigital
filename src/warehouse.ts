import gsap from "gsap";
import * as THREE from "three";

import { canPlace } from "./canPlace.js";
import { animateProductAppearance, createProductMesh, disposeProductMesh } from "./scene.js";
import type { Item, PlacedItem, Shelf, WarehouseConfig } from "./types.js";


export interface WarehouseRuntime {
  productsByShelf: Map<string, PlacedItem[]>;
  productMeshesByShelf: Map<string, THREE.Mesh[]>;
  productMeshBySku: Map<string, THREE.Mesh>;
  highlightedMesh: THREE.Mesh | null;
}

const API = "/api";

/**
 * Guarda la configuración de estantes en la base de datos.
 */
export function saveWarehouseConfig(config: WarehouseConfig): void {
  fetch(`${API}/config.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  }).catch(console.error);
}

/**
 * Carga la configuración de estantes desde la base de datos.
 * Si la BD está vacía, usa warehouse-config.json como semilla inicial.
 */
export async function loadWarehouseConfig(): Promise<WarehouseConfig> {
  const response = await fetch(`${API}/config.php`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar la configuracion: ${response.status}`);
  }

  const config = (await response.json()) as WarehouseConfig;

  if (Array.isArray(config.shelves) && config.shelves.length >= 5) {
    return config;
  }

  // BD vacía → cargar desde archivo y sembrar la BD
  const fallback = await fetch("/warehouse-config.json");
  if (!fallback.ok) {
    throw new Error("No se pudo cargar la configuracion del archivo.");
  }
  const defaultConfig = (await fallback.json()) as WarehouseConfig;
  if (!Array.isArray(defaultConfig.shelves) || defaultConfig.shelves.length < 5) {
    throw new Error("La configuracion del almacen debe incluir al menos 5 estantes.");
  }

  saveWarehouseConfig(defaultConfig);
  return defaultConfig;
}

/**
 * Carga todos los productos almacenados en la base de datos.
 */
export async function loadPlacedProducts(): Promise<
  Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }>
> {
  try {
    const response = await fetch(`${API}/productos.php`);
    if (!response.ok) return [];
    const data = (await response.json()) as { products: Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }> };
    return data.products ?? [];
  } catch {
    return [];
  }
}

/**
 * Inicializa el estado del runtime con los mapas vacíos para cada estante.
 */
export function createRuntime(config: WarehouseConfig): WarehouseRuntime {
  return {
    productsByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    productMeshesByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    productMeshBySku: new Map(),
    highlightedMesh: null
  };
}

/**
 * Restaura un producto ya conocido en la escena sin ejecutar el algoritmo canPlace.
 * Usado al recargar la página para repoblar desde la base de datos.
 */
export function restoreItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  shelfId: string,
  item: Item,
  localPosition: { x: number; y: number; z: number },
  shelfMesh: THREE.Mesh
): void {
  const placedItem: PlacedItem = { item, localPosition };
  const mesh = createProductMesh(item, placedItem, shelfMesh);
  scene.add(mesh);

  const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
  placedItems.push(placedItem);
  runtime.productsByShelf.set(shelfId, placedItems);

  const meshes = runtime.productMeshesByShelf.get(shelfId) ?? [];
  meshes.push(mesh);
  runtime.productMeshesByShelf.set(shelfId, meshes);
  runtime.productMeshBySku.set(item.sku, mesh);
}

/**
 * Ejecuta canPlace y, si hay espacio, crea la malla, la agrega a la escena,
 * actualiza el runtime y persiste en la base de datos.
 * Devuelve el PlacedItem resultante, o null si no hubo lugar disponible.
 */
export function placeItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  item: Item,
  shelf: Shelf,
  shelfMesh: THREE.Mesh,
  preferredSection?: number
): PlacedItem | null {
  const placedItems = runtime.productsByShelf.get(shelf.id) ?? [];
  const placement = canPlace(shelf, placedItems, item, { preferredSection });
  if (!placement) return null;

  const mesh = createProductMesh(placement.item, placement, shelfMesh);
  scene.add(mesh);
  animateProductAppearance(mesh);

  placedItems.push(placement);
  runtime.productsByShelf.set(shelf.id, placedItems);

  const meshes = runtime.productMeshesByShelf.get(shelf.id) ?? [];
  meshes.push(mesh);
  runtime.productMeshesByShelf.set(shelf.id, meshes);
  runtime.productMeshBySku.set(placement.item.sku, mesh);

  persistPlacedItem(shelf.id, placement.item, placement.localPosition);

  return placement;
}

export function updateItemPlacement(
  runtime: WarehouseRuntime,
  sku: string,
  localPosition: { x: number; y: number; z: number }
): boolean {
  const mesh = runtime.productMeshBySku.get(sku);
  if (!mesh) return false;

  const shelfId = String(mesh.userData.shelfId);
  const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
  const placedItem = placedItems.find((entry) => entry.item.sku === sku);
  if (!placedItem) return false;

  placedItem.localPosition = { ...localPosition };
  mesh.userData.localPosition = { ...localPosition };
  persistPlacedItem(shelfId, placedItem.item, placedItem.localPosition);
  return true;
}

/**
 * Elimina un producto de la escena, del runtime y de la base de datos.
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

  runtime.productMeshBySku.delete(sku);

  gsap.to(mesh.scale, {
    x: 0,
    y: 0,
    z: 0,
    duration: 0.3,
    ease: "power2.in",
    onComplete: () => {
      scene.remove(mesh);
      disposeProductMesh(mesh);
    }
  });

  const meshList = runtime.productMeshesByShelf.get(shelfId) ?? [];
  runtime.productMeshesByShelf.set(shelfId, meshList.filter((m) => m !== mesh));

  const itemList = runtime.productsByShelf.get(shelfId) ?? [];
  runtime.productsByShelf.set(shelfId, itemList.filter((p) => p.item.sku !== sku));

  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, {
    method: "DELETE"
  }).catch(console.error);

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

  runtime.highlightedMesh = target;
  gsap.to(material, {
    emissiveIntensity: 0.1,
    duration: 0.7,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  return true;
}

/**
 * Limpia el efecto emisivo de todos los productos y cancela el intervalo de parpadeo.
 */
export function clearHighlight(runtime: WarehouseRuntime): void {
  if (runtime.highlightedMesh) {
    const material = runtime.highlightedMesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      gsap.killTweensOf(material);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
    runtime.highlightedMesh = null;
  }
}

/**
 * Traslada un producto de su estante/piso actual a otro estante y/o piso.
 * Devuelve el nuevo PlacedItem si tuvo éxito, o null si no hay espacio en el destino.
 */
export function transferItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  config: WarehouseConfig,
  shelfMeshes: Map<string, THREE.Mesh>,
  sku: string,
  targetShelfId: string,
  targetSection?: number
): PlacedItem | null {
  const mesh = runtime.productMeshBySku.get(sku);
  if (!mesh) return null;

  const currentShelfId = String(mesh.userData.shelfId);
  const currentPlacedItems = runtime.productsByShelf.get(currentShelfId) ?? [];
  const placedItem = currentPlacedItems.find((p) => p.item.sku === sku);
  if (!placedItem) return null;

  const { item } = placedItem;
  const targetShelf = config.shelves.find((s) => s.id === targetShelfId);
  const targetShelfMesh = shelfMeshes.get(targetShelfId);
  if (!targetShelf || !targetShelfMesh) return null;

  // Ítems del estante destino, excluyendo el producto actual (por si es el mismo estante)
  const targetPlacedItems = (runtime.productsByShelf.get(targetShelfId) ?? []).filter(
    (p) => p.item.sku !== sku
  );

  const placement = canPlace(targetShelf, targetPlacedItems, item, { preferredSection: targetSection });
  if (!placement) return null;

  // Limpiar resaltado antes de eliminar la malla
  clearHighlight(runtime);

  // Quitar del estante actual en runtime
  runtime.productMeshBySku.delete(sku);
  runtime.productMeshesByShelf.set(
    currentShelfId,
    (runtime.productMeshesByShelf.get(currentShelfId) ?? []).filter((m) => m !== mesh)
  );
  runtime.productsByShelf.set(
    currentShelfId,
    currentPlacedItems.filter((p) => p.item.sku !== sku)
  );

  // Eliminar la malla antigua de la escena
  scene.remove(mesh);
  disposeProductMesh(mesh);

  // Borrar del DB (registro antiguo)
  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, { method: "DELETE" }).catch(console.error);

  // Crear la nueva malla en el estante destino
  const newMesh = createProductMesh(placement.item, placement, targetShelfMesh);
  scene.add(newMesh);
  animateProductAppearance(newMesh);

  // Registrar en el estante destino
  const targetItems = runtime.productsByShelf.get(targetShelfId) ?? [];
  targetItems.push(placement);
  runtime.productsByShelf.set(targetShelfId, targetItems);

  const targetMeshes = runtime.productMeshesByShelf.get(targetShelfId) ?? [];
  targetMeshes.push(newMesh);
  runtime.productMeshesByShelf.set(targetShelfId, targetMeshes);
  runtime.productMeshBySku.set(sku, newMesh);

  // Persistir nueva ubicación
  persistPlacedItem(targetShelfId, placement.item, placement.localPosition);

  return placement;
}

/**
 * Actualiza las dimensiones de un producto existente en escena, runtime y BD.
 * Recrea la malla con las nuevas dimensiones manteniendo la posición actual.
 */
export function updateItemDimensions(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  sku: string,
  newDimensions: { name: string; width: number; height: number; depth: number },
  shelfMesh: THREE.Mesh
): boolean {
  const oldMesh = runtime.productMeshBySku.get(sku);
  if (!oldMesh) return false;

  const shelfId = String(oldMesh.userData.shelfId);
  const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
  const placedItem = placedItems.find((p) => p.item.sku === sku);
  if (!placedItem) return false;

  if (newDimensions.name) placedItem.item.name = newDimensions.name;
  placedItem.item.width = newDimensions.width;
  placedItem.item.height = newDimensions.height;
  placedItem.item.depth = newDimensions.depth;

  clearHighlight(runtime);
  scene.remove(oldMesh);
  disposeProductMesh(oldMesh);

  const newMesh = createProductMesh(placedItem.item, placedItem, shelfMesh);
  scene.add(newMesh);

  const meshList = runtime.productMeshesByShelf.get(shelfId) ?? [];
  const idx = meshList.indexOf(oldMesh);
  if (idx >= 0) meshList[idx] = newMesh;
  runtime.productMeshesByShelf.set(shelfId, meshList);
  runtime.productMeshBySku.set(sku, newMesh);

  persistPlacedItem(shelfId, placedItem.item, placedItem.localPosition);
  return true;
}

/**
 * Elimina un estante, todos sus productos y sus mallas de la escena.
 * La actualización de config y shelfMeshes/shelfSprites la hace el llamador.
 */
export function removeShelf(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  shelfId: string,
  shelfMesh: THREE.Mesh,
  shelfSprite: THREE.Sprite
): void {
  clearHighlight(runtime);

  const items = runtime.productsByShelf.get(shelfId) ?? [];
  items.forEach(({ item }) => {
    fetch(`${API}/productos.php?sku=${encodeURIComponent(item.sku)}`, { method: "DELETE" }).catch(console.error);
  });

  const meshes = runtime.productMeshesByShelf.get(shelfId) ?? [];
  meshes.forEach((mesh) => {
    runtime.productMeshBySku.delete(String(mesh.userData.sku));
    scene.remove(mesh);
    disposeProductMesh(mesh);
  });

  runtime.productsByShelf.delete(shelfId);
  runtime.productMeshesByShelf.delete(shelfId);

  scene.remove(shelfMesh);
  scene.remove(shelfSprite);
}

function persistPlacedItem(
  shelfId: string,
  item: Item,
  localPosition: { x: number; y: number; z: number }
): void {
  fetch(`${API}/productos.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku: item.sku,
      shelfId,
      name: item.name,
      width: item.width,
      height: item.height,
      depth: item.depth,
      localPosition
    })
  }).catch(console.error);
}
