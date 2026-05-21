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
  /** Currently highlighted product, represented by a frame instead of changing its color. */
  highlighted: {
    sku: string;
    frame: THREE.LineSegments;
    pulseProxy: { scale: number; opacity: number };
  } | null;
}

function resolveApiBaseUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_API_URL;
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (
    typeof window !== "undefined" &&
    window.location.hostname === "appassets.androidplatform.net"
  ) {
    return "http://192.168.18.189/almacenDigital/api";
  }

  return "/api";
}

const API = resolveApiBaseUrl();
const sessionStorageKey = "almacen-digital-session-token";

function getSessionToken(): string | null {
  return window.localStorage.getItem(sessionStorageKey);
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getSessionToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export interface CatalogOption {
  id: number;
  name: string;
  slug: string;
}

export interface ProductCatalogs {
  categories: CatalogOption[];
  brands: CatalogOption[];
}

export interface UserSession {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
}

export interface UserProfileInput {
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface ActiveSessionInfo {
  id: number;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
}

export type ManagedUserRole = "Admin" | "Operador" | "Consulta";

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedUserInput {
  id?: number;
  name?: string;
  email?: string;
  role?: ManagedUserRole;
  active?: boolean;
  password?: string;
}

export interface ProductHistoryEntry {
  id: number;
  sku: string;
  action: string;
  summary: string;
  actor?: {
    id: number | null;
    name: string | null;
    email: string | null;
    role: string | null;
  };
  createdAt: string;
}

export type PlacedProductsLoadResult =
  | {
      ok: true;
      products: Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }>;
    }
  | {
      ok: false;
      products: [];
      message: string;
    };

// ── API error reporting ───────────────────────────────────────────────────────

let _apiErrorHandler: ((message: string) => void) | null = null;

/** Registra un callback que se invoca con un mensaje legible cuando falla
 *  una operación de red en background (persist, delete, transfer). */
export function setApiErrorHandler(fn: (message: string) => void): void {
  _apiErrorHandler = fn;
}

function reportApiError(context: string, error: unknown): void {
  console.error(`[API] ${context}:`, error);
  _apiErrorHandler?.(`Error al ${context}.`);
}

// ── Config persistence ────────────────────────────────────────────────────────

export function saveWarehouseConfig(config: WarehouseConfig): void {
  fetch(`${API}/config.php`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(config)
  }).catch((e) => reportApiError("guardar la configuracion del estante", e));
}

export async function loadWarehouseConfig(): Promise<WarehouseConfig> {
  try {
    const response = await fetch(`${API}/config.php`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      throw new Error(`No se pudo cargar la configuracion: ${response.status}`);
    }

    const config = (await response.json()) as WarehouseConfig;

    if (Array.isArray(config.shelves) && config.shelves.length >= 5) {
      return config;
    }
  } catch (error) {
    reportApiError("cargar la configuracion desde la API", error);
  }

  const fallback = await fetch(`${import.meta.env.BASE_URL}warehouse-config.json`);
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

export async function loadPlacedProducts(): Promise<PlacedProductsLoadResult> {
  try {
    const response = await fetch(`${API}/productos.php`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      throw new Error(`Respuesta HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      products: Array<{ shelfId: string; item: Item; localPosition: { x: number; y: number; z: number } }>;
    };
    return { ok: true, products: data.products ?? [] };
  } catch (error) {
    reportApiError("cargar productos guardados", error);
    const detail = error instanceof Error && error.message ? ` Detalle: ${error.message}` : "";
    return {
      ok: false,
      products: [],
      message: `No se pudo conectar con la API de productos.${detail}`
    };
  }
}

export async function loadProductCatalogs(): Promise<ProductCatalogs> {
  try {
    const response = await fetch(`${API}/catalogos.php`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error(`No se pudieron cargar catalogos: ${response.status}`);
    const data = (await response.json()) as ProductCatalogs;
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      brands: Array.isArray(data.brands) ? data.brands : []
    };
  } catch (error) {
    reportApiError("cargar categorias y marcas", error);
    return { categories: [], brands: [] };
  }
}

export async function loadUserSession(): Promise<UserSession | null> {
  const storedToken = getSessionToken();
  try {
    const response = await fetch(`${API}/sesion.php`, {
      headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {}
    });
    if (!response.ok) throw new Error(`No se pudo cargar sesion: ${response.status}`);
    const data = (await response.json()) as { session?: UserSession };
    if (data.session?.token) {
      window.localStorage.setItem(sessionStorageKey, data.session.token);
      return data.session;
    }
  } catch (error) {
    reportApiError("cargar la sesion de usuario", error);
  }
  return null;
}

export async function createUserSession(input: { email: string; password: string }): Promise<UserSession | null> {
  try {
    const response = await fetch(`${API}/sesion.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(`No se pudo iniciar sesion: ${response.status}`);
    const data = (await response.json()) as { session?: UserSession };
    if (data.session?.token) {
      window.localStorage.setItem(sessionStorageKey, data.session.token);
      return data.session;
    }
  } catch (error) {
    reportApiError("iniciar sesion", error);
  }
  return null;
}

export async function updateUserProfile(input: UserProfileInput): Promise<UserSession | null> {
  const storedToken = getSessionToken();
  if (!storedToken) return null;
  try {
    const response = await fetch(`${API}/sesion.php`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${storedToken}`
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(`No se pudo actualizar perfil: ${response.status}`);
    const data = (await response.json()) as { session?: UserSession };
    if (data.session?.token) {
      window.localStorage.setItem(sessionStorageKey, data.session.token);
      return data.session;
    }
  } catch (error) {
    reportApiError("actualizar mi perfil", error);
  }
  return null;
}

export async function closeUserSession(): Promise<void> {
  const storedToken = getSessionToken();
  window.localStorage.removeItem(sessionStorageKey);
  if (!storedToken) return;
  try {
    await fetch(`${API}/sesion.php`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${storedToken}` }
    });
  } catch (error) {
    reportApiError("cerrar sesion", error);
  }
}

export async function closeAllUserSessions(): Promise<void> {
  const storedToken = getSessionToken();
  window.localStorage.removeItem(sessionStorageKey);
  if (!storedToken) return;
  try {
    await fetch(`${API}/sesion.php?scope=all`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${storedToken}` }
    });
  } catch (error) {
    reportApiError("cerrar todas las sesiones", error);
  }
}

export async function loadActiveSessions(): Promise<ActiveSessionInfo[]> {
  try {
    const response = await fetch(`${API}/sesion.php?scope=active`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error(`No se pudieron cargar sesiones: ${response.status}`);
    const data = (await response.json()) as { sessions?: ActiveSessionInfo[] };
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch (error) {
    reportApiError("cargar sesiones activas", error);
    return [];
  }
}

export async function downloadExport(type: "inventory-csv" | "inventory-pdf" | "config-backup"): Promise<void> {
  const response = await fetch(`${API}/exportar.php?type=${encodeURIComponent(type)}`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error(`No se pudo exportar: ${response.status}`);
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `almacen-${type}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function loadManagedUsers(): Promise<ManagedUser[]> {
  try {
    const response = await fetch(`${API}/usuarios.php`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error(`No se pudieron cargar usuarios: ${response.status}`);
    const data = (await response.json()) as { users?: ManagedUser[] };
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    reportApiError("cargar usuarios", error);
    return [];
  }
}

export async function createManagedUser(input: Required<Pick<ManagedUserInput, "name" | "email" | "role" | "password">>): Promise<ManagedUser[]> {
  try {
    const response = await fetch(`${API}/usuarios.php`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(`No se pudo crear usuario: ${response.status}`);
    const data = (await response.json()) as { users?: ManagedUser[] };
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    reportApiError("crear usuario", error);
    return [];
  }
}

export async function updateManagedUser(input: ManagedUserInput & { id: number }): Promise<ManagedUser[]> {
  try {
    const response = await fetch(`${API}/usuarios.php`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(`No se pudo actualizar usuario: ${response.status}`);
    const data = (await response.json()) as { users?: ManagedUser[] };
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    reportApiError("actualizar usuario", error);
    return [];
  }
}

export async function loadProductHistory(sku?: string, limit = 8): Promise<ProductHistoryEntry[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sku) params.set("sku", sku);
    const response = await fetch(`${API}/historial.php?${params.toString()}`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error(`No se pudo cargar historial: ${response.status}`);
    const data = (await response.json()) as { history?: ProductHistoryEntry[] };
    return Array.isArray(data.history) ? data.history : [];
  } catch (error) {
    reportApiError("cargar historial del producto", error);
    return [];
  }
}

export async function uploadProductImage(file: File): Promise<string | null> {
  const body = new FormData();
  body.append("image", file);
  try {
    const response = await fetch(`${API}/imagenes.php`, {
      method: "POST",
      headers: authHeaders(),
      body
    });
    if (!response.ok) throw new Error(`No se pudo subir imagen: ${response.status}`);
    const data = (await response.json()) as { url?: string };
    return data.url ?? null;
  } catch (error) {
    reportApiError("subir imagen del producto", error);
    return null;
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

  // ✅ PRIMERO validar
  if (!placement) return null;

  // 🔥 Orden visual (grid suave)
  placement.localPosition.x =
    Math.round(placement.localPosition.x * 10) / 10;

  placement.localPosition.z =
    Math.round(placement.localPosition.z * 10) / 10;

  const instancedMesh = getOrCreateInstancedMesh(
    placement.item.width,
    placement.item.height,
    placement.item.depth,
    runtime.instancedMeshByGeo,
    scene
  );

  const worldPos = computeWorldPos(
    placement.localPosition,
    placement.item,
    shelfMesh
  );

  const { instanceIndex, labelSprite } = addProductInstance(
    placement.item,
    worldPos,
    instancedMesh
  );

  animateInstanceAppearance(instancedMesh, instanceIndex);

  const geoKey = makeProductGeoKey(
    placement.item.width,
    placement.item.height,
    placement.item.depth
  );

  registerInstance(
    runtime,
    placement.item.sku,
    geoKey,
    instanceIndex,
    shelf.id,
    placement.item,
    placement.localPosition,
    labelSprite
  );

  placedItems.push(placement);
  runtime.productsByShelf.set(shelf.id, placedItems);

  const skus = runtime.productSkusByShelf.get(shelf.id) ?? [];
  skus.push(placement.item.sku);
  runtime.productSkusByShelf.set(shelf.id, skus);

  persistPlacedItem(
    shelf.id,
    placement.item,
    placement.localPosition
  );

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

  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, {
    method: "DELETE",
    headers: authHeaders()
  })
    .catch((e) => reportApiError("eliminar el producto del servidor", e));

  return shelfId;
}

// ── Highlight ─────────────────────────────────────────────────────────────────

import gsap from "gsap";

export function highlightProduct(runtime: WarehouseRuntime, sku: string, scene: THREE.Scene): boolean {
  clearHighlight(runtime);

  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) return false;

  const instancedMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
  if (!instancedMesh) return false;

  instancedMesh.getMatrixAt(entry.instanceIndex, _highlightMatrix);
  _highlightMatrix.premultiply(instancedMesh.matrixWorld);
  _highlightPosition.setFromMatrixPosition(_highlightMatrix);

  const padding = 0.08;
  const geometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(entry.item.width + padding, entry.item.height + padding, entry.item.depth + padding)
  );
  const material = new THREE.LineBasicMaterial({
    color: 0xf8fafc,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const frame = new THREE.LineSegments(geometry, material);
  frame.name = `__product_highlight_frame_${sku}`;
  frame.position.copy(_highlightPosition);
  frame.renderOrder = 20;
  scene.add(frame);

  const pulseProxy = { scale: 1, opacity: 0.95 };
  gsap.to(pulseProxy, {
    scale: 1.06,
    opacity: 0.45,
    duration: 0.85,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    onUpdate: () => {
      frame.scale.setScalar(pulseProxy.scale);
      material.opacity = pulseProxy.opacity;
    }
  });

  runtime.highlighted = { sku, frame, pulseProxy };
  return true;
}

const _highlightMatrix = new THREE.Matrix4();
const _highlightPosition = new THREE.Vector3();

export function clearHighlight(runtime: WarehouseRuntime): void {
  if (!runtime.highlighted) return;

  const { frame, pulseProxy } = runtime.highlighted;
  gsap.killTweensOf(pulseProxy);
  frame.removeFromParent();
  frame.geometry.dispose();
  (frame.material as THREE.Material).dispose();

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
  animateInstanceAppearance(newInstancedMesh, newIndex);

  const newGeoKey = makeProductGeoKey(placement.item.width, placement.item.height, placement.item.depth);
  registerInstance(runtime, sku, newGeoKey, newIndex, targetShelfId, placement.item, placement.localPosition, newLabel);

  const targetItems = runtime.productsByShelf.get(targetShelfId) ?? [];
  targetItems.push(placement);
  runtime.productsByShelf.set(targetShelfId, targetItems);

  const targetSkus = runtime.productSkusByShelf.get(targetShelfId) ?? [];
  targetSkus.push(sku);
  runtime.productSkusByShelf.set(targetShelfId, targetSkus);

  // Primero eliminar el registro anterior y solo después guardar el nuevo,
  // para evitar que el DELETE llegue después del POST y borre el producto trasladado.
	  fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, {
      method: "DELETE",
      headers: authHeaders()
    })
    .then(() => persistPlacedItem(targetShelfId, placement.item, placement.localPosition))
    .catch((e) => reportApiError("transferir el producto en el servidor", e));

  return placement;
}

// ── Dimension update ──────────────────────────────────────────────────────────

export function updateItemDimensions(
  runtime: WarehouseRuntime,
  scene: THREE.Scene,
  sku: string,
  newDimensions: { name: string; category?: string; brand?: string; imageUrl?: string | null; width: number; height: number; depth: number },
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
  placedItem.item.category = newDimensions.category ?? placedItem.item.category ?? "Sin categoria";
  placedItem.item.brand = newDimensions.brand ?? placedItem.item.brand ?? "Sin marca";
  if ("imageUrl" in newDimensions) {
    placedItem.item.imageUrl = newDimensions.imageUrl ?? null;
  }
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
	    fetch(`${API}/productos.php?sku=${encodeURIComponent(sku)}`, {
        method: "DELETE",
        headers: authHeaders()
      })
      .catch((e) => reportApiError("eliminar producto del estante", e));

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
  const p = (shelfMesh.geometry as THREE.BoxGeometry).parameters;

  // 🔥 CONFIGURACIÓN DEL GRID
  const GRID_SIZE = 0.4; // tamaño de celda (ajústalo si quieres)
  const PADDING = 0.02;  // espacio entre productos

  // 🧠 SNAP A GRID (alineación automática)
  const snap = (value: number) =>
    Math.floor(value / GRID_SIZE) * GRID_SIZE;

  const snappedX = snap(localPosition.x);
  const snappedZ = snap(localPosition.z);

  const localPoint = new THREE.Vector3(
    -p.width / 2 + snappedX + item.width / 2 + PADDING,
    -p.height / 2 + localPosition.y + item.height / 2,
    -p.depth / 2 + snappedZ + item.depth / 2 + PADDING
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sku: item.sku,
      shelfId: shelfId,
      name: item.name,
      width: item.width,
      height: item.height,
      depth: item.depth,
      category: item.category ?? "Sin categoria",
      brand: item.brand ?? "Sin marca",
      imageUrl: item.imageUrl ?? null,
      localPosition: localPosition
    })
  }).catch((e) =>
    reportApiError("guardar el producto en el servidor", e)
  );
}
