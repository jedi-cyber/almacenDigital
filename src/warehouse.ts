import * as THREE from "three";

import { canPlace } from "./canPlace.js";
import {
  addProductInstance,
  animateInstanceAppearance,
  animateInstanceRemoval,
  getOrCreateInstancedMesh,
  makeProductGeoKey,
  removeProductInstance,
} from "./scene.js";
import type { Item, PlacedItem, Shelf, WarehouseConfig } from "./types.js";

// ── Runtime types ─────────────────────────────────────────────────────────────

export interface ProductEntry {
  geoKey: string;
  instanceIndex: number;
  shelfId: string;
  item: Item;
  localPosition: { x: number; y: number; z: number };
  labelSprite: THREE.Sprite;
}

export interface WarehouseRuntime {
  /** Logical placement data, consumed by canPlace. */
  productsByShelf: Map<string, PlacedItem[]>;
  /** Quick lookup of which SKUs live on each shelf. */
  productSkusByShelf: Map<string, string[]>;
  /** One InstancedMesh per unique (w×h×d) geometry group. */
  instancedMeshByGeo: Map<string, THREE.InstancedMesh>;
  /** Per-SKU render + metadata entry. */
  productEntryBySku: Map<string, ProductEntry>;
  /** Reverse raycasting map: "${geoKey}/${instanceIndex}" → sku. */
  instanceOwner: Map<string, string>;
  /** Currently highlighted product, with its original color and GSAP proxy. */
  highlighted: {
    sku: string;
    originalColor: THREE.Color;
    colorProxy: { r: number; g: number; b: number };
  } | null;
}

const API = "/api";

// ── Config persistence ────────────────────────────────────────────────────────

export function saveWarehouseConfig(config: WarehouseConfig): void {
  fetch(`${API}/config.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  }).catch(console.error);
}

export async function loadWarehouseConfig(): Promise<WarehouseConfig> {
  const response = await fetch(`${API}/config.php`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar la configuracion: ${response.status}`);
  }

  const config = (await response.json()) as WarehouseConfig;

  if (Array.isArray(config.shelves) && config.shelves.length >= 5) {
    return config;
  }

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

export async function loadPlacedProducts(): Promise<
  Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }>
> {
  try {
    const response = await fetch(`${API}/productos.php`);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      products: Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }>;
    };
    return data.products ?? [];
  } catch {
    return [];
  }
}

// ── Runtime lifecycle ─────────────────────────────────────────────────────────

export function createRuntime(config: WarehouseConfig): WarehouseRuntime {
  return {
    productsByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    productSkusByShelf: new Map(config.shelves.map((s) => [s.id, []])),
    instancedMeshByGeo: new Map(),
    productEntryBySku: new Map(),
    instanceOwner: new Map(),
    highlighted: null,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Registers the SKU in instanceOwner and productEntryBySku after adding an instance. */
function registerInstance(
  runtime: WarehouseRuntime,
  sku: string,
  geoKey: string,
  instanceIndex: number,
  shelfId: string,
  item: Item,
  localPosition: { x: number; y: number; z: number },
  labelSprite: THREE.Sprite
): void {
  runtime.instanceOwner.set(`${geoKey}/${instanceIndex}`, sku);
  runtime.productEntryBySku.set(sku, { geoKey, instanceIndex, shelfId, item, localPosition, labelSprite });
}

/** Updates productEntryBySku when swap-with-last relocates an instance. */
function applySwap(
  runtime: WarehouseRuntime,
  movedSku: string | null,
  newInstanceIndex: number
): void {
  if (movedSku === null) return;
  const entry = runtime.productEntryBySku.get(movedSku);
  if (entry) entry.instanceIndex = newInstanceIndex;
}

function disposeLabelSprite(sprite: THREE.Sprite): void {
  (sprite.material as THREE.SpriteMaterial).map?.dispose();
  sprite.material.dispose();
}

// ── Product CRUD ──────────────────────────────────────────────────────────────

/**
 * Restores a product from the database into the scene without running canPlace.
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

  const instancedMesh = getOrCreateInstancedMesh(
    item.width, item.height, item.depth,
    runtime.instancedMeshByGeo, scene
  );
  const { instanceIndex, labelSprite } = addProductInstance(item, computeWorldPos(localPosition, item, shelfMesh), instancedMesh);
  scene.add(labelSprite);

  const geoKey = makeProductGeoKey(item.width, item.height, item.depth);
  registerInstance(runtime, item.sku, geoKey, instanceIndex, shelfId, item, localPosition, labelSprite);

  const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
  placedItems.push(placedItem);
  runtime.productsByShelf.set(shelfId, placedItems);

  const skus = runtime.productSkusByShelf.get(shelfId) ?? [];
  skus.push(item.sku);
  runtime.productSkusByShelf.set(shelfId, skus);
}

/**
 * Runs canPlace, creates the instance, and persists to the database.
 * Returns the PlacedItem on success, or null if there is no space.
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

  const instancedMesh = getOrCreateInstancedMesh(
    placement.item.width, placement.item.height, placement.item.depth,
    runtime.instancedMeshByGeo, scene
  );
  const worldPos = computeWorldPos(placement.localPosition, placement.item, shelfMesh);
  const { instanceIndex, labelSprite } = addProductInstance(placement.item, worldPos, instancedMesh);
  scene.add(labelSprite);
  animateInstanceAppearance(instancedMesh, instanceIndex);

  const geoKey = makeProductGeoKey(placement.item.width, placement.item.height, placement.item.depth);
  registerInstance(runtime, placement.item.sku, geoKey, instanceIndex, shelf.id, placement.item, placement.localPosition, labelSprite);

  placedItems.push(placement);
  runtime.productsByShelf.set(shelf.id, placedItems);

  const skus = runtime.productSkusByShelf.get(shelf.id) ?? [];
  skus.push(placement.item.sku);
  runtime.productSkusByShelf.set(shelf.id, skus);

  persistPlacedItem(shelf.id, placement.item, placement.localPosition);

  return placement;
}

export function updateItemPlacement(
  runtime: WarehouseRuntime,
  sku: string,
  localPosition: { x: number; y: number; z: number }
): boolean {
  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return false;

  entry.localPosition = { ...localPosition };

  const placedItems = runtime.productsByShelf.get(entry.shelfId) ?? [];
  const placedItem = placedItems.find((p) => p.item.sku === sku);
  if (placedItem) placedItem.localPosition = { ...localPosition };

  persistPlacedItem(entry.shelfId, entry.item, localPosition);
  return true;
}

/**
 * Animates the instance to scale 0, then removes it from the scene, runtime, and database.
 * Returns the shelfId of the affected shelf, or null if the SKU wasn't found.
 */
export function removeItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  sku: string
): string | null {
  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return null;

  const { geoKey, instanceIndex, shelfId, labelSprite } = entry;
  const instancedMesh = runtime.instancedMeshByGeo.get(geoKey);

  clearHighlight(runtime);

  scene.remove(labelSprite);
  disposeLabelSprite(labelSprite);

  runtime.productEntryBySku.delete(sku);

  runtime.productSkusByShelf.set(
    shelfId,
    (runtime.productSkusByShelf.get(shelfId) ?? []).filter((s) => s !== sku)
  );
  runtime.productsByShelf.set(
    shelfId,
    (runtime.productsByShelf.get(shelfId) ?? []).filter((p) => p.item.sku !== sku)
  );

  if (instancedMesh) {
    animateInstanceRemoval(instancedMesh, instanceIndex, () => {
      const movedSku = removeProductInstance(instancedMesh, instanceIndex, runtime.instanceOwner, geoKey);
      applySwap(runtime, movedSku, instanceIndex);
    });
  }

  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, { method: "DELETE" }).catch(console.error);

  return shelfId;
}

// ── Highlight ─────────────────────────────────────────────────────────────────

import gsap from "gsap";

export function highlightProduct(runtime: WarehouseRuntime, sku: string): boolean {
  clearHighlight(runtime);

  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return false;

  const instancedMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
  if (!instancedMesh || !instancedMesh.instanceColor) return false;

  const originalColor = new THREE.Color();
  instancedMesh.getColorAt(entry.instanceIndex, originalColor);

  const cyan = new THREE.Color(0x00ffff);
  const colorProxy = { r: originalColor.r, g: originalColor.g, b: originalColor.b };

  gsap.to(colorProxy, {
    r: cyan.r,
    g: cyan.g,
    b: cyan.b,
    duration: 0.7,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    onUpdate: () => {
      instancedMesh.setColorAt(entry.instanceIndex, _tmpColor.setRGB(colorProxy.r, colorProxy.g, colorProxy.b));
      instancedMesh.instanceColor!.needsUpdate = true;
    }
  });

  runtime.highlighted = { sku, originalColor, colorProxy };
  return true;
}

const _tmpColor = new THREE.Color();

export function clearHighlight(runtime: WarehouseRuntime): void {
  if (!runtime.highlighted) return;

  const { sku, originalColor, colorProxy } = runtime.highlighted;
  gsap.killTweensOf(colorProxy);

  const entry = runtime.productEntryBySku.get(sku);
  if (entry) {
    const instancedMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
    if (instancedMesh && instancedMesh.instanceColor) {
      instancedMesh.setColorAt(entry.instanceIndex, originalColor);
      instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  runtime.highlighted = null;
}

// ── Transfer ──────────────────────────────────────────────────────────────────

export function transferItem(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  config: WarehouseConfig,
  shelfMeshes: Map<string, THREE.Mesh>,
  sku: string,
  targetShelfId: string,
  targetSection?: number
): PlacedItem | null {
  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return null;

  const { item, shelfId: currentShelfId, geoKey, instanceIndex, labelSprite } = entry;

  const targetShelf = config.shelves.find((s) => s.id === targetShelfId);
  const targetShelfMesh = shelfMeshes.get(targetShelfId);
  if (!targetShelf || !targetShelfMesh) return null;

  const targetPlacedItems = (runtime.productsByShelf.get(targetShelfId) ?? []).filter(
    (p) => p.item.sku !== sku
  );

  const placement = canPlace(targetShelf, targetPlacedItems, item, { preferredSection: targetSection });
  if (!placement) return null;

  clearHighlight(runtime);

  // ── Remove from current location ───────────────────────────────────────────
  const instancedMesh = runtime.instancedMeshByGeo.get(geoKey)!;
  scene.remove(labelSprite);
  disposeLabelSprite(labelSprite);

  runtime.productEntryBySku.delete(sku);
  runtime.instanceOwner.delete(`${geoKey}/${instanceIndex}`);

  runtime.productSkusByShelf.set(
    currentShelfId,
    (runtime.productSkusByShelf.get(currentShelfId) ?? []).filter((s) => s !== sku)
  );
  runtime.productsByShelf.set(
    currentShelfId,
    (runtime.productsByShelf.get(currentShelfId) ?? []).filter((p) => p.item.sku !== sku)
  );

  const movedSku = removeProductInstance(instancedMesh, instanceIndex, runtime.instanceOwner, geoKey);
  applySwap(runtime, movedSku, instanceIndex);

  // ── Add to target location ─────────────────────────────────────────────────
  const newInstancedMesh = getOrCreateInstancedMesh(
    placement.item.width, placement.item.height, placement.item.depth,
    runtime.instancedMeshByGeo, scene
  );
  const worldPos = computeWorldPos(placement.localPosition, placement.item, targetShelfMesh);
  const { instanceIndex: newIndex, labelSprite: newLabel } = addProductInstance(placement.item, worldPos, newInstancedMesh);
  scene.add(newLabel);
  animateInstanceAppearance(newInstancedMesh, newIndex);

  const newGeoKey = makeProductGeoKey(placement.item.width, placement.item.height, placement.item.depth);
  registerInstance(runtime, sku, newGeoKey, newIndex, targetShelfId, placement.item, placement.localPosition, newLabel);

  const targetItems = runtime.productsByShelf.get(targetShelfId) ?? [];
  targetItems.push(placement);
  runtime.productsByShelf.set(targetShelfId, targetItems);

  const targetSkus = runtime.productSkusByShelf.get(targetShelfId) ?? [];
  targetSkus.push(sku);
  runtime.productSkusByShelf.set(targetShelfId, targetSkus);

  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, { method: "DELETE" }).catch(console.error);
  persistPlacedItem(targetShelfId, placement.item, placement.localPosition);

  return placement;
}

// ── Dimension update ──────────────────────────────────────────────────────────

export function updateItemDimensions(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  sku: string,
  newDimensions: { name: string; width: number; height: number; depth: number },
  shelfMesh: THREE.Mesh
): boolean {
  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return false;

  const { geoKey, instanceIndex, shelfId, localPosition, labelSprite } = entry;
  const instancedMesh = runtime.instancedMeshByGeo.get(geoKey);
  if (!instancedMesh) return false;

  const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
  const placedItem = placedItems.find((p) => p.item.sku === sku);
  if (!placedItem) return false;

  clearHighlight(runtime);

  // Update logical item
  if (newDimensions.name) placedItem.item.name = newDimensions.name;
  placedItem.item.width = newDimensions.width;
  placedItem.item.height = newDimensions.height;
  placedItem.item.depth = newDimensions.depth;

  // Remove old instance
  scene.remove(labelSprite);
  disposeLabelSprite(labelSprite);
  runtime.productEntryBySku.delete(sku);
  runtime.instanceOwner.delete(`${geoKey}/${instanceIndex}`);

  const movedSku = removeProductInstance(instancedMesh, instanceIndex, runtime.instanceOwner, geoKey);
  applySwap(runtime, movedSku, instanceIndex);

  // Add new instance with updated dimensions
  const newInstancedMesh = getOrCreateInstancedMesh(
    placedItem.item.width, placedItem.item.height, placedItem.item.depth,
    runtime.instancedMeshByGeo, scene
  );
  const worldPos = computeWorldPos(localPosition, placedItem.item, shelfMesh);
  const { instanceIndex: newIdx, labelSprite: newLabel } = addProductInstance(placedItem.item, worldPos, newInstancedMesh);
  scene.add(newLabel);

  const newGeoKey = makeProductGeoKey(placedItem.item.width, placedItem.item.height, placedItem.item.depth);
  registerInstance(runtime, sku, newGeoKey, newIdx, shelfId, placedItem.item, localPosition, newLabel);

  persistPlacedItem(shelfId, placedItem.item, localPosition);
  return true;
}

// ── Shelf removal ─────────────────────────────────────────────────────────────

export function removeShelf(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  shelfId: string,
  shelfMesh: THREE.Mesh,
  shelfSprite: THREE.Sprite
): void {
  clearHighlight(runtime);

  const skus = [...(runtime.productSkusByShelf.get(shelfId) ?? [])];

  for (const sku of skus) {
    fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, { method: "DELETE" }).catch(console.error);

    const entry = runtime.productEntryBySku.get(sku);
    if (!entry) continue;

    scene.remove(entry.labelSprite);
    disposeLabelSprite(entry.labelSprite);

    const instancedMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
    if (instancedMesh) {
      const movedSku = removeProductInstance(instancedMesh, entry.instanceIndex, runtime.instanceOwner, entry.geoKey);
      applySwap(runtime, movedSku, entry.instanceIndex);
    }

    runtime.productEntryBySku.delete(sku);
  }

  runtime.productsByShelf.delete(shelfId);
  runtime.productSkusByShelf.delete(shelfId);

  scene.remove(shelfMesh);
  scene.remove(shelfSprite);
}

// ── Internal utils ────────────────────────────────────────────────────────────

function computeWorldPos(
  localPosition: { x: number; y: number; z: number },
  item: Pick<Item, "width" | "height" | "depth">,
  shelfMesh: THREE.Mesh
): THREE.Vector3 {
  const p = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const localPoint = new THREE.Vector3(
    -p.width / 2 + localPosition.x + item.width / 2,
    -p.height / 2 + localPosition.y + item.height / 2,
    -p.depth / 2 + localPosition.z + item.depth / 2
  );
  return shelfMesh.localToWorld(localPoint);
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
