import { describe, expect, it } from "vitest";

import { resolveProductSearchQuery } from "../src/ui.js";
import type { ProductEntry } from "../src/warehouse.js";

function entry(sku: string, name: string): [string, ProductEntry] {
  return [
    sku,
    {
      geoKey: "1x1x1",
      instanceIndex: 0,
      shelfId: "A1",
      item: { sku, name, width: 1, height: 1, depth: 1 },
      localPosition: { x: 0, y: 0, z: 0 },
      labelSprite: undefined as unknown as ProductEntry["labelSprite"],
    },
  ];
}

describe("resolveProductSearchQuery", () => {
  it("prioriza el SKU exacto aunque exista un nombre parecido", () => {
    const products = new Map<string, ProductEntry>([
      entry("SKU-001", "Caja de tornillos"),
      entry("Caja de tornillos", "Otro producto"),
    ]);

    expect(resolveProductSearchQuery(products, "SKU-001")).toEqual({ sku: "SKU-001", matchCount: 1 });
  });

  it("encuentra productos por nombre aunque tengan SKU diferente", () => {
    const products = new Map<string, ProductEntry>([
      entry("SKU-001", "Caja de tornillos"),
      entry("SKU-002", "Caja de tornillos"),
    ]);

    expect(resolveProductSearchQuery(products, "caja de tornillos")).toEqual({ sku: "SKU-001", matchCount: 2 });
  });

  it("acepta busquedas parciales y sin acentos", () => {
    const products = new Map<string, ProductEntry>([
      entry("SKU-003", "Pintura acrilica grande"),
    ]);

    expect(resolveProductSearchQuery(products, "acrílica")).toEqual({ sku: "SKU-003", matchCount: 1 });
  });

  it("devuelve null cuando no hay coincidencias", () => {
    const products = new Map<string, ProductEntry>([
      entry("SKU-004", "Martillo"),
    ]);

    expect(resolveProductSearchQuery(products, "taladro")).toBeNull();
  });
});
