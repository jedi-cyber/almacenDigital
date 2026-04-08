/**
 * Pruebas de integración frontend ↔ API.
 *
 * Requieren XAMPP (Apache + MySQL) corriendo en http://127.0.0.1.
 * Si la API no responde, todos los tests se marcan como "skipped" automáticamente.
 *
 * Ejecución:  npm run test:integration
 */

import { afterAll, beforeAll, describe, expect, it, type TaskContext } from "vitest";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1/almacenDigital/api";
const TEST_SKU      = `TEST-INTEG-${Date.now()}`;
const TEST_SHELF_ID = `test-shelf-${Date.now()}`;

let apiReachable = false;

// ---------------------------------------------------------------------------
// Helpers HTTP
// ---------------------------------------------------------------------------

async function apiGet(path: string): Promise<Response> {
  return fetch(`${BASE}/${path}`);
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function apiDelete(path: string): Promise<Response> {
  return fetch(`${BASE}/${path}`, { method: "DELETE" });
}

/** Marca el test como skipped si la API no está disponible. */
function requireApi(ctx: TaskContext): void {
  if (!apiReachable) ctx.skip();
}

// ---------------------------------------------------------------------------
// Setup global
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/productos.php`, {
      signal: AbortSignal.timeout(3000),
    });
    apiReachable = res.status < 500;
  } catch {
    apiReachable = false;
  }

  if (!apiReachable) {
    console.warn(
      "\n[integración] API no disponible — se omiten todas las pruebas.\n" +
      `  URL: ${BASE}/productos.php\n` +
      "  Asegúrate de que XAMPP (Apache + MySQL) esté corriendo.\n"
    );
  }
});

// ===========================================================================
// /api/productos.php
// ===========================================================================

describe("GET /api/productos.php", () => {
  it("devuelve { products: Array }", async (ctx) => {
    requireApi(ctx);
    const res = await apiGet("productos.php");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("products");
    expect(Array.isArray(json.products)).toBe(true);
  });
});

describe("POST /api/productos.php", () => {
  const validPayload = {
    sku:           TEST_SKU,
    shelfId:       "S-01",
    name:          "Producto de integración",
    width:         1,
    height:        1,
    depth:         1,
    localPosition: { x: 0, y: 0, z: 0 },
  };

  it("acepta producto válido → 200 { ok: true }", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", validPayload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("el producto persiste: aparece en GET tras el POST", async (ctx) => {
    requireApi(ctx);
    const res  = await apiGet("productos.php");
    const { products } = await res.json() as { products: { item: { sku: string; width: number } }[] };
    const found = products.find((p) => p.item.sku === TEST_SKU);
    expect(found).toBeDefined();
    expect(found!.item.width).toBe(1);
  });

  it("upsert: re-POST actualiza dimensiones y persiste", async (ctx) => {
    requireApi(ctx);
    await apiPost("productos.php", { ...validPayload, width: 3, height: 3, depth: 3 });
    const { products } = await (await apiGet("productos.php")).json() as {
      products: { item: { sku: string; width: number; height: number; depth: number } }[];
    };
    const found = products.find((p) => p.item.sku === TEST_SKU);
    expect(found!.item.width).toBe(3);
    expect(found!.item.height).toBe(3);
  });

  it("rechaza payload sin campos obligatorios → 422 con campo 'code'", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", { sku: "X" });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(json).toHaveProperty("code");
  });

  it("rechaza dimensiones no positivas → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", { ...validPayload, sku: "BAD-DIM", width: -1 });
    expect(res.status).toBe(422);
  });

  it("rechaza sku vacío → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", { ...validPayload, sku: "   " });
    expect(res.status).toBe(422);
  });

  it("rechaza sku demasiado largo (> 64 chars) → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", { ...validPayload, sku: "A".repeat(65) });
    expect(res.status).toBe(422);
  });

  it("rechaza localPosition con valor no numérico → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", {
      ...validPayload,
      sku: "BAD-POS",
      localPosition: { x: "abc", y: 0, z: 0 },
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/productos.php", () => {
  it("elimina el producto de prueba → 200 { ok: true }", async (ctx) => {
    requireApi(ctx);
    const res = await apiDelete(`productos.php?sku=${TEST_SKU}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("el producto ya no aparece en GET tras DELETE", async (ctx) => {
    requireApi(ctx);
    const { products } = await (await apiGet("productos.php")).json() as {
      products: { item: { sku: string } }[];
    };
    expect(products.find((p) => p.item.sku === TEST_SKU)).toBeUndefined();
  });

  it("DELETE sin SKU → 400 { code: 'MISSING_SKU' }", async (ctx) => {
    requireApi(ctx);
    const res = await apiDelete("productos.php");
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("MISSING_SKU");
  });
});

// ===========================================================================
// /api/config.php
// ===========================================================================

describe("GET /api/config.php", () => {
  it("devuelve { shelves: Array }", async (ctx) => {
    requireApi(ctx);
    const res = await apiGet("config.php");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("shelves");
    expect(Array.isArray(json.shelves)).toBe(true);
  });

  it("cada estante tiene los campos requeridos", async (ctx) => {
    requireApi(ctx);
    const { shelves } = await (await apiGet("config.php")).json() as {
      shelves: Record<string, unknown>[];
    };
    if (shelves.length === 0) ctx.skip();
    const shelf = shelves[0];
    for (const field of ["id", "label", "width", "height", "depth", "position", "rotationY"]) {
      expect(shelf, `campo '${field}' ausente`).toHaveProperty(field);
    }
    const pos = shelf.position as Record<string, unknown>;
    expect(pos).toHaveProperty("x");
    expect(pos).toHaveProperty("y");
    expect(pos).toHaveProperty("z");
  });
});

describe("POST /api/config.php — round-trip de persistencia", () => {
  type ShelfConfig = Record<string, unknown>;
  let originalShelves: ShelfConfig[] = [];

  const testShelf: ShelfConfig = {
    id:        TEST_SHELF_ID,
    label:     "Estante de integración",
    width:     2,
    height:    2,
    depth:     2,
    position:  { x: 99, y: 0, z: 99 },
    rotationY: 0,
    sections:  1,
  };

  beforeAll(async () => {
    if (!apiReachable) return;
    const json = await (await apiGet("config.php")).json() as { shelves: ShelfConfig[] };
    originalShelves = json.shelves ?? [];
  });

  afterAll(async () => {
    if (!apiReachable) return;
    // Restaura el estado exacto anterior al test
    await apiPost("config.php", { shelves: originalShelves });
  });

  it("POST con estante de prueba añadido → 200 { ok: true }", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("config.php", {
      shelves: [...originalShelves, testShelf],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("el estante de prueba persiste en el GET siguiente", async (ctx) => {
    requireApi(ctx);
    const { shelves } = await (await apiGet("config.php")).json() as {
      shelves: { id: string; position: { x: number } }[];
    };
    const found = shelves.find((s) => s.id === TEST_SHELF_ID);
    expect(found).toBeDefined();
    expect(found!.position.x).toBe(99);
  });

  it("POST sin campo 'shelves' → 400", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("config.php", { data: [] });
    expect(res.status).toBe(400);
  });

  it("POST con estante con dimensión negativa → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("config.php", {
      shelves: [{ ...testShelf, id: "bad-shelf", width: -1 }],
    });
    expect(res.status).toBe(422);
  });

  it("POST con estante sin 'label' → 422", async (ctx) => {
    requireApi(ctx);
    const { label: _removed, ...noLabel } = testShelf;
    const res = await apiPost("config.php", {
      shelves: [{ ...noLabel, id: "no-label-shelf" }],
    });
    expect(res.status).toBe(422);
  });

  it("POST con position inválida → 422", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("config.php", {
      shelves: [{ ...testShelf, id: "bad-pos-shelf", position: { x: "abc", y: 0, z: 0 } }],
    });
    expect(res.status).toBe(422);
  });
});
