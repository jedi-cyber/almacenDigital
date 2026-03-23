import { describe, expect, it } from "vitest";

import { calcShelfStatus } from "../src/shelfStatus";
import type { Item, PlacedItem, Shelf } from "../src/types";

const shelf: Shelf = {
  id: "S-01",
  label: "Estante Principal",
  width: 10,
  height: 10,
  depth: 10,
  position: { x: 0, y: 0, z: 0 }
};

function placedItem(
  sku: string,
  dimensions: Pick<Item, "width" | "height" | "depth">,
  position = { x: 0, y: 0, z: 0 }
): PlacedItem {
  return {
    item: {
      sku,
      name: `Producto ${sku}`,
      ...dimensions
    },
    localPosition: position
  };
}

describe("calcShelfStatus", () => {
  it("calcula correctamente un estante vacio", () => {
    const status = calcShelfStatus(shelf, []);

    expect(status).toEqual({
      total: 1000,
      occupied: 0,
      free: 1000,
      pct: 0
    });
  });

  it("calcula correctamente un estante lleno", () => {
    const items = [placedItem("FULL-001", { width: 10, height: 10, depth: 10 })];

    const status = calcShelfStatus(shelf, items);

    expect(status).toEqual({
      total: 1000,
      occupied: 1000,
      free: 0,
      pct: 100
    });
  });

  it("refleja sobreocupacion si el item es demasiado grande", () => {
    const items = [placedItem("OVERSIZE-001", { width: 11, height: 10, depth: 10 })];

    const status = calcShelfStatus(shelf, items);

    expect(status.total).toBe(1000);
    expect(status.occupied).toBe(1100);
    expect(status.free).toBe(-100);
    expect(status.pct).toBeCloseTo(110, 10);
  });
});
