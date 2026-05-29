// ─────────────────────────────────────────────────────────────────────────────
// inventarioService.ts
// Servicio que conecta el frontend con api/inventario.php
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "/api/inventario.php";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface Categoria {
  id: number;
  nombre: string;
  tipo_caja: "GRANDE" | "MEDIANO" | "PEQUEÑO";
  medida_caja: string;
  productos_x_caja: number;
  total_productos: number;
  cajas_necesarias: number;
}

export interface ProductoEscaneado {
  sku: string;
  ean: string | null;
  nombre: string;
  categoria_id: number;
  categoria_nombre: string;
  tipo_caja: "GRANDE" | "MEDIANO" | "PEQUEÑO";
  medida_caja: string;
  productos_x_caja: number;
  stock: number;
}

export interface CajaInventario {
  id: number;
  codigo_caja: string;
  shelf_id: string;
  unidades_actual: number;
  unidades_max: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  estado: "ACTIVA" | "LLENA" | "VACIA";
  created_at: string;
  categoria_nombre: string;
  tipo_caja: "GRANDE" | "MEDIANO" | "PEQUEÑO";
  medida_caja: string;
}

export interface ResumenEstante {
  shelf_id: string;
  total_cajas: number;
  total_unidades: number;
  capacidad_total: number;
  ocupacion_pct: number;
  cajas_llenas: number;
  cajas_activas: number;
  cajas_vacias: number;
}

export interface RegistrarCajaPayload {
  codigo_caja: string;
  categoria_id: number;
  shelf_id: string;
  unidades: number;
}

export interface RegistrarCajaResult {
  ok: boolean;
  caja_id: number;
  estado: "ACTIVA" | "LLENA" | "VACIA";
  unidades_max: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error ?? `Error ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escanear producto por SKU
// Devuelve categoría + tipo de caja que le corresponde
// ─────────────────────────────────────────────────────────────────────────────

export async function escanearProducto(sku: string): Promise<ProductoEscaneado> {
  const data = await apiFetch<{ producto: ProductoEscaneado }>(
    `${API_BASE}?action=escanear&sku=${encodeURIComponent(sku)}`
  );
  return data.producto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtener todas las categorías
// ─────────────────────────────────────────────────────────────────────────────

export async function getCategorias(): Promise<Categoria[]> {
  const data = await apiFetch<{ categorias: Categoria[] }>(
    `${API_BASE}?action=categorias`
  );
  return data.categorias;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtener cajas de un estante
// ─────────────────────────────────────────────────────────────────────────────

export async function getCajasPorEstante(shelfId: string): Promise<CajaInventario[]> {
  const data = await apiFetch<{ cajas: CajaInventario[] }>(
    `${API_BASE}?action=cajas&shelf_id=${encodeURIComponent(shelfId)}`
  );
  return data.cajas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtener resumen de ocupación de todos los estantes
// ─────────────────────────────────────────────────────────────────────────────

export async function getResumenEstantes(): Promise<ResumenEstante[]> {
  const data = await apiFetch<{ resumen: ResumenEstante[] }>(
    `${API_BASE}?action=resumen`
  );
  return data.resumen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registrar una caja escaneada en un estante
// ─────────────────────────────────────────────────────────────────────────────

export async function registrarCaja(
  payload: RegistrarCajaPayload
): Promise<RegistrarCajaResult> {
  const data = await apiFetch<RegistrarCajaResult>(`${API_BASE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "registrar_caja", ...payload }),
  });
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actualizar posición 3D de una caja en el estante
// ─────────────────────────────────────────────────────────────────────────────

export async function actualizarPosicionCaja(
  cajaId: number,
  pos: { x: number; y: number; z: number }
): Promise<void> {
  await apiFetch<{ ok: boolean }>(`${API_BASE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "actualizar_posicion",
      caja_id: cajaId,
      pos_x: pos.x,
      pos_y: pos.y,
      pos_z: pos.z,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos para stock y movimientos
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductoStock {
  sku: string;
  name: string;
  stock: number;
  shelf_id: string;
}

export interface RegistrarMovimientoPayload {
  sku: string;
  caja_id: number;
  unidades: number;
  tipo: "ENTRADA" | "SALIDA";
}

export interface RegistrarMovimientoResult {
  ok: boolean;
  sku: string;
  tipo: "ENTRADA" | "SALIDA";
  unidades: number;
  stock_nuevo: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtener stock actual de un producto
// ─────────────────────────────────────────────────────────────────────────────

export async function getStockProducto(sku: string): Promise<ProductoStock> {
  const data = await apiFetch<{ producto: ProductoStock }>(
    `${API_BASE}?action=stock&sku=${encodeURIComponent(sku)}`
  );
  return data.producto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registrar movimiento de ENTRADA o SALIDA
// ─────────────────────────────────────────────────────────────────────────────

export async function registrarMovimiento(
  payload: RegistrarMovimientoPayload
): Promise<RegistrarMovimientoResult> {
  const data = await apiFetch<RegistrarMovimientoResult>(`${API_BASE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "registrar_movimiento", ...payload }),
  });
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crear producto nuevo (cuando no existe en BD)
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearProductoPayload {
  sku: string;
  name: string;
  categoria_id: number;
  stock_inicial: number;
  shelf_id: string;
}

export async function crearProducto(
  payload: CrearProductoPayload
): Promise<{ ok: boolean }> {
  const data = await apiFetch<{ ok: boolean }>("/api/productos.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku:      payload.sku,
      name:     payload.name,
      shelfId:  payload.shelf_id,
      width:    0.1,
      height:   0.1,
      depth:    0.1,
      category: String(payload.categoria_id),
      localPosition: { x: 0, y: 0, z: 0 },
    }),
  });
  return data;
}

export interface RegistrarProductoNuevoPayload {
  ean: string;
  nombre: string;
  shelf_id: string;
  unidades: number;
}

export async function registrarProductoNuevo(
  payload: RegistrarProductoNuevoPayload
): Promise<{ ok: boolean; sku: string; ean: string; nombre: string; stock: number }> {
  const data = await apiFetch<{ ok: boolean; sku: string; ean: string; nombre: string; stock: number }>(
    `${API_BASE}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "registrar_producto_nuevo", ...payload }),
    }
  );
  return data;
}