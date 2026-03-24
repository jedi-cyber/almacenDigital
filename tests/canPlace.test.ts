import { describe, expect, it } from "vitest";

import { aabbIntersects, canPlace } from "../src/canPlace.js";
import type { Item, PlacedItem, Shelf, Vector3D } from "../src/types.js";

const shelf: Shelf = {
  id: "S-02",
  label: "Estante Fase 2",
  width: 4,
  height: 4,
  depth: 4,
  position: { x: 0, y: 0, z: 0 }
};

function createItem(
  sku: string,
  dimensions: Pick<Item, "width" | "height" | "depth">
): Item {
  return {
    sku,
    name: `Producto ${sku}`,
    ...dimensions
  };
}

function createPlacedItem(
  sku: string,
  dimensions: Pick<Item, "width" | "height" | "depth">,
  localPosition: Vector3D
): PlacedItem {
  return {
    item: createItem(sku, dimensions),
    localPosition
  };
}

describe("aabbIntersects", () => {
  it("detecta interseccion cuando dos cajas se traslapan", () => {
    expect(
      aabbIntersects(
        { x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2 },
        { x: 1, y: 1, z: 1, width: 2, height: 2, depth: 2 }
      )
    ).toBe(true);
  });

  it("permite cajas que solo se tocan por una cara", () => {
    expect(
      aabbIntersects(
        { x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2 },
        { x: 2, y: 0, z: 0, width: 2, height: 2, depth: 2 }
      )
    ).toBe(false);
  });
});

describe("canPlace", () => {
  it("coloca un item en el origen cuando el estante esta vacio", () => {
    const placement = canPlace(shelf, [], createItem("A-001", { width: 2, height: 2, depth: 2 }));

    expect(placement).toEqual(
      createPlacedItem("A-001", { width: 2, height: 2, depth: 2 }, { x: 0, y: 0, z: 0 })
    );
  });

  it("busca la siguiente posicion libre sobre el eje z", () => {
    const existingItems = [createPlacedItem("A-002", { width: 2, height: 2, depth: 2 }, { x: 0, y: 0, z: 0 })];

    const placement = canPlace(shelf, existingItems, createItem("A-003", { width: 2, height: 2, depth: 2 }));

    expect(placement?.localPosition).toEqual({ x: 0, y: 0, z: 2 });
  });

  it("busca espacio en el eje y cuando la base ya esta ocupada", () => {
    const existingItems = [createPlacedItem("A-004", { width: 4, height: 1, depth: 4 }, { x: 0, y: 0, z: 0 })];

    const placement = canPlace(shelf, existingItems, createItem("A-005", { width: 2, height: 2, depth: 2 }));

    expect(placement?.localPosition).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("busca espacio en el eje x cuando una pared lateral bloquea las primeras columnas", () => {
    const existingItems = [createPlacedItem("A-006", { width: 2, height: 4, depth: 4 }, { x: 0, y: 0, z: 0 })];

    const placement = canPlace(shelf, existingItems, createItem("A-007", { width: 2, height: 2, depth: 2 }));

    expect(placement?.localPosition).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("retorna null si el nuevo item es mas grande que el estante", () => {
    const placement = canPlace(shelf, [], createItem("A-008", { width: 5, height: 2, depth: 2 }));

    expect(placement).toBeNull();
  });

  it("retorna null cuando el estante esta completamente lleno", () => {
    const existingItems = [createPlacedItem("A-009", { width: 4, height: 4, depth: 4 }, { x: 0, y: 0, z: 0 })];

    const placement = canPlace(shelf, existingItems, createItem("A-010", { width: 1, height: 1, depth: 1 }));

    expect(placement).toBeNull();
  });

  it("retorna null cuando el volumen libre esta fragmentado y no hay espacio contiguo suficiente", () => {
    const fragmentedShelf: Shelf = {
      ...shelf,
      width: 3,
      height: 2,
      depth: 1
    };
    const existingItems = [
      createPlacedItem("A-011", { width: 1, height: 2, depth: 1 }, { x: 0, y: 0, z: 0 }),
      createPlacedItem("A-012", { width: 1, height: 2, depth: 1 }, { x: 2, y: 0, z: 0 })
    ];

    const placement = canPlace(
      fragmentedShelf,
      existingItems,
      createItem("A-013", { width: 2, height: 2, depth: 1 })
    );

    expect(placement).toBeNull();
  });

  it("encuentra un hueco exacto entre varios items sin superponerlos", () => {
    const existingItems = [
      createPlacedItem("A-014", { width: 2, height: 2, depth: 2 }, { x: 0, y: 0, z: 0 }),
      createPlacedItem("A-015", { width: 2, height: 2, depth: 2 }, { x: 0, y: 0, z: 2 }),
      createPlacedItem("A-016", { width: 2, height: 2, depth: 2 }, { x: 0, y: 2, z: 0 })
    ];

    const placement = canPlace(shelf, existingItems, createItem("A-017", { width: 2, height: 2, depth: 2 }));

    expect(placement?.localPosition).toEqual({ x: 0, y: 2, z: 2 });
  });

  it("puede reutilizar una posicion adyacente sin considerar colision por contacto", () => {
    const existingItems = [createPlacedItem("A-018", { width: 2, height: 2, depth: 2 }, { x: 0, y: 0, z: 0 })];

    const placement = canPlace(shelf, existingItems, createItem("A-019", { width: 2, height: 2, depth: 2 }));

    expect(placement).not.toBeNull();
    expect(placement?.localPosition).toEqual({ x: 0, y: 0, z: 2 });
  });

  it("retorna null si no existe ninguna posicion valida por bloqueo combinado en todos los ejes", () => {
    const blockedShelf: Shelf = {
      ...shelf,
      width: 2,
      height: 2,
      depth: 2
    };
    const existingItems = [
      createPlacedItem("A-020", { width: 2, height: 1, depth: 2 }, { x: 0, y: 0, z: 0 }),
      createPlacedItem("A-021", { width: 1, height: 1, depth: 2 }, { x: 0, y: 1, z: 0 }),
      createPlacedItem("A-022", { width: 1, height: 1, depth: 2 }, { x: 1, y: 1, z: 0 })
    ];

    const placement = canPlace(blockedShelf, existingItems, createItem("A-023", { width: 1, height: 1, depth: 1 }));

    expect(placement).toBeNull();
  });
});
