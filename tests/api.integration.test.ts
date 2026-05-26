/**
 * Pruebas de integración frontend ↔ API.
 *
 * Requieren XAMPP (Apache + MySQL) corriendo en http://127.0.0.1.
 * Si la API no responde, los tests se marcan como "skipped".
 *
 * Ejecución: npm run test:integration
 */

import { afterAll, beforeAll, describe, expect, it, type TaskContext } from "vitest";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1/almacenDigital/api";
const ADMIN_EMAIL = process.env.API_ADMIN_EMAIL ?? "admin@almacen.local";
const ADMIN_PASSWORD = process.env.API_ADMIN_PASSWORD ?? "admin123";
const TEST_SUFFIX = Date.now();
const TEST_SKU = `TEST-INTEG-${TEST_SUFFIX}`;
const TEST_USER_EMAIL = `consulta-${TEST_SUFFIX}@almacen.local`;

type ApiSession = {
  token: string;
  expiresAt: string;
  user: { id: number; name: string; email: string; role: string };
};

type ShelfConfig = {
  id: string;
  label: string;
  width: number;
  height: number;
  depth: number;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  sections?: number;
};

let apiReachable = false;
let adminSession: ApiSession | null = null;
let consultaSession: ApiSession | null = null;
let baseShelf: ShelfConfig | null = null;
let originalShelves: ShelfConfig[] = [];
let testUserId: number | null = null;

function authHeaders(token: string | null = adminSession?.token ?? null): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiGet(path: string, token: string | null = adminSession?.token ?? null): Promise<Response> {
  return fetch(`${BASE}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function apiPost(path: string, body: unknown, token: string | null = adminSession?.token ?? null): Promise<Response> {
  return fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

async function apiPatch(path: string, body: unknown, token: string | null = adminSession?.token ?? null): Promise<Response> {
  return fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

async function apiDelete(path: string, token: string | null = adminSession?.token ?? null): Promise<Response> {
  return fetch(`${BASE}/${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function login(email: string, password: string): Promise<ApiSession | null> {
  const res = await fetch(`${BASE}/sesion.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return null;
  const data = await res.json() as { session?: ApiSession };
  return data.session ?? null;
}

function requireApi(ctx: TaskContext): void {
  if (!apiReachable || !adminSession || !baseShelf) ctx.skip();
}

beforeAll(async () => {
  try {
    adminSession = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    apiReachable = Boolean(adminSession);
    if (!apiReachable) return;

    const config = await (await apiGet("config.php")).json() as { shelves: ShelfConfig[] };
    originalShelves = config.shelves ?? [];
    baseShelf = originalShelves[0] ?? null;
  } catch {
    apiReachable = false;
  }

  if (!apiReachable) {
    console.warn(
      "\n[integración] API no disponible o credenciales admin inválidas; se omiten pruebas.\n" +
      `URL: ${BASE}\n`
    );
  }
});

afterAll(async () => {
  if (!apiReachable || !adminSession) return;
  await apiDelete(`productos.php?sku=${encodeURIComponent(TEST_SKU)}`);
  if (testUserId) {
    await apiPatch("usuarios.php", { id: testUserId, active: false });
  }
  if (originalShelves.length > 0) {
    await apiPost("config.php", { shelves: originalShelves });
  }
  await apiDelete("sesion.php?scope=all");
});

describe("autenticación y perfil", () => {
  it("rechaza login con credenciales inválidas", async (ctx) => {
    requireApi(ctx);
    const res = await fetch(`${BASE}/sesion.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "incorrecta" }),
    });
    expect([401, 500]).toContain(res.status);
  });

  it("inicia sesión y devuelve token + usuario", async (ctx) => {
    requireApi(ctx);
    expect(adminSession?.token).toBeTruthy();
    expect(adminSession?.user.email).toBe(ADMIN_EMAIL);
  });

  it("actualiza perfil sin cambiar correo ni contraseña", async (ctx) => {
    requireApi(ctx);
    const res = await apiPatch("sesion.php", {
      name: adminSession!.user.name,
      email: adminSession!.user.email,
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { session?: ApiSession };
    expect(data.session?.user.email).toBe(ADMIN_EMAIL);
  });

  it("lista sesiones activas y marca la sesión actual", async (ctx) => {
    requireApi(ctx);
    const res = await apiGet("sesion.php?scope=active");
    expect(res.status).toBe(200);
    const data = await res.json() as { sessions: Array<{ current: boolean; expiresAt: string }> };
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(data.sessions.some((session) => session.current)).toBe(true);
  });
});

describe("endpoints protegidos", () => {
  it.each([
    "productos.php",
    "config.php",
    "catalogos.php",
    "historial.php",
    "usuarios.php",
    "exportar.php?type=inventory-csv",
  ])("rechaza GET sin token en %s", async (path) => {
    const res = await apiGet(path, null);
    expect(res.status).toBe(401);
  });

  it("permite exportar inventario con token autorizado", async (ctx) => {
    requireApi(ctx);
    const res = await apiGet("exportar.php?type=inventory-csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/csv");
  });
});

describe("productos y auditoría", () => {
  function validProductPayload() {
	    return {
	      sku: TEST_SKU,
	      serialNumber: "SERIE-INTEGRACION-001",
	      shelfId: baseShelf!.id,
      name: "Producto de integración",
      width: Math.min(0.2, baseShelf!.width),
      height: Math.min(0.2, baseShelf!.height),
      depth: Math.min(0.2, baseShelf!.depth),
      category: "TEST",
      brand: "INTEGRACION",
      localPosition: { x: 0, y: 0, z: 0 },
    };
  }

	  it("crea producto válido con usuario autenticado", async (ctx) => {
	    requireApi(ctx);
	    const res = await apiPost("productos.php", validProductPayload());
	    expect(res.status).toBe(200);
	    expect(await res.json()).toEqual({ ok: true });
	  });

	  it("devuelve el numero de serie del producto", async (ctx) => {
	    requireApi(ctx);
	    await apiPost("productos.php", validProductPayload());
	    const res = await apiGet("productos.php");
	    expect(res.status).toBe(200);
	    const data = await res.json() as { products: Array<{ item: { sku: string; serialNumber?: string | null } }> };
	    const product = data.products.find((entry) => entry.item.sku === TEST_SKU);
	    expect(product?.item.serialNumber).toBe("SERIE-INTEGRACION-001");
	  });

	  it("permite crear producto sin exponer SKU si tiene numero de serie", async (ctx) => {
	    requireApi(ctx);
	    const serialNumber = `SERIE-SIN-SKU-${TEST_SUFFIX}`;
	    const res = await apiPost("productos.php", {
	      ...validProductPayload(),
	      sku: undefined,
	      serialNumber,
	    });
	    expect(res.status).toBe(200);
	    const list = await apiGet("productos.php");
	    const data = await list.json() as { products: Array<{ item: { sku: string; serialNumber?: string | null } }> };
	    const product = data.products.find((entry) => entry.item.serialNumber === serialNumber);
	    expect(product?.item.sku).toBeTruthy();
	    if (product?.item.sku) {
	      await apiDelete(`productos.php?sku=${encodeURIComponent(product.item.sku)}`);
	    }
	  });

	  it("rechaza productos sin numero de serie", async (ctx) => {
	    requireApi(ctx);
	    const res = await apiPost("productos.php", {
	      ...validProductPayload(),
	      serialNumber: undefined,
	    });
	    expect(res.status).toBe(422);
	    expect((await res.json() as { code: string }).code).toBe("SERIAL_NUMBER_REQUIRED");
	  });

	  it("rechaza numero de serie repetido en otro producto", async (ctx) => {
	    requireApi(ctx);
	    await apiPost("productos.php", validProductPayload());
	    const res = await apiPost("productos.php", {
	      ...validProductPayload(),
	      sku: `${TEST_SKU}-SERIE-DUP`,
	    });
	    expect(res.status).toBe(409);
	    expect((await res.json() as { code: string }).code).toBe("DUPLICATE_SERIAL_NUMBER");
	    await apiDelete(`productos.php?sku=${encodeURIComponent(`${TEST_SKU}-SERIE-DUP`)}`);
	  });

  it("rechaza producto fuera del estante desde backend", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("productos.php", {
      ...validProductPayload(),
      sku: `${TEST_SKU}-OUT`,
      localPosition: { x: baseShelf!.width + 1, y: 0, z: 0 },
    });
    expect(res.status).toBe(422);
    expect((await res.json() as { code: string }).code).toBe("PRODUCT_OUT_OF_SHELF");
  });

  it("registra en historial qué usuario creó/editó el producto", async (ctx) => {
    requireApi(ctx);
    await apiPost("productos.php", { ...validProductPayload(), name: "Producto de integración editado" });
    const res = await apiGet(`historial.php?sku=${encodeURIComponent(TEST_SKU)}&limit=5`);
    expect(res.status).toBe(200);
    const data = await res.json() as { history: Array<{ actor?: { email?: string | null }; action: string }> };
    expect(data.history.length).toBeGreaterThan(0);
    expect(data.history[0].actor?.email).toBe(ADMIN_EMAIL);
  });

  it("DELETE sin SKU devuelve 400 INVALID_SKU", async (ctx) => {
    requireApi(ctx);
    const res = await apiDelete("productos.php");
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("INVALID_SKU");
  });
});

describe("roles y permisos", () => {
  it("admin puede crear usuario Consulta", async (ctx) => {
    requireApi(ctx);
    const password = "consulta123";
    const res = await apiPost("usuarios.php", {
      name: "Consulta Integración",
      email: TEST_USER_EMAIL,
      role: "Consulta",
      password,
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { users: Array<{ id: number; email: string; role: string }> };
    const created = data.users.find((user) => user.email === TEST_USER_EMAIL);
    expect(created).toBeDefined();
    expect(created!.role).toBe("Consulta");
    testUserId = created!.id;
    consultaSession = await login(TEST_USER_EMAIL, password);
    expect(consultaSession?.token).toBeTruthy();
  });

  it("Consulta puede leer productos pero no registrar", async (ctx) => {
    requireApi(ctx);
    if (!consultaSession) {
      ctx.skip();
      return;
    }
    const read = await apiGet("productos.php", consultaSession.token);
    expect(read.status).toBe(200);
    const write = await apiPost("productos.php", {
      sku: `${TEST_SKU}-NOPE`,
      shelfId: baseShelf!.id,
      name: "No permitido",
      width: 0.1,
      height: 0.1,
      depth: 0.1,
      localPosition: { x: 0, y: 0, z: 0 },
    }, consultaSession.token);
    expect(write.status).toBe(403);
  });

  it("Consulta no puede administrar usuarios", async (ctx) => {
    requireApi(ctx);
    if (!consultaSession) {
      ctx.skip();
      return;
    }
    const res = await apiGet("usuarios.php", consultaSession.token);
    expect(res.status).toBe(403);
  });
});

describe("configuración de almacén", () => {
  it("rechaza estantes duplicados", async (ctx) => {
    requireApi(ctx);
    const duplicate = { ...baseShelf!, label: "Duplicado" };
    const res = await apiPost("config.php", { shelves: [baseShelf, duplicate] });
    expect(res.status).toBe(422);
  });

  it("rechaza dimensiones fuera de rango", async (ctx) => {
    requireApi(ctx);
    const res = await apiPost("config.php", { shelves: [{ ...baseShelf!, width: 99 }] });
    expect(res.status).toBe(422);
  });
});
