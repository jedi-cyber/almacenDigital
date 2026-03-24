import { aabbIntersects, canPlace } from "../src/canPlace.js";
import type { Item, PlacedItem, Shelf } from "../src/types.js";

const shelf: Shelf = {
  id: "S-DEMO",
  label: "Demo Fase 2",
  width: 5,
  height: 2,
  depth: 4,
  position: { x: 0, y: 0, z: 0 }
};

const demoItems: Item[] = Array.from({ length: 10 }, (_, index) => ({
  sku: `BOX-${String(index + 1).padStart(2, "0")}`,
  name: `Caja ${index + 1}`,
  width: 1,
  height: 1,
  depth: 1
}));

const placedItems: PlacedItem[] = [];

for (const item of demoItems) {
  const placement = canPlace(shelf, placedItems, item);

  if (!placement) {
    throw new Error(`La demo fallo: ${item.sku} no pudo colocarse.`);
  }

  placedItems.push(placement);
}

const intersections: string[] = [];

for (let index = 0; index < placedItems.length; index += 1) {
  for (let nextIndex = index + 1; nextIndex < placedItems.length; nextIndex += 1) {
    const current = placedItems[index];
    const next = placedItems[nextIndex];

    const currentBox = {
      ...current.localPosition,
      width: current.item.width,
      height: current.item.height,
      depth: current.item.depth
    };
    const nextBox = {
      ...next.localPosition,
      width: next.item.width,
      height: next.item.height,
      depth: next.item.depth
    };

    if (aabbIntersects(currentBox, nextBox)) {
      intersections.push(`${current.item.sku} colisiona con ${next.item.sku}`);
    }
  }
}

console.log("Demo F2: 10 cajas colocadas en el estante sin interseccion");
console.log(`Estante: ${shelf.id} (${shelf.width}x${shelf.height}x${shelf.depth})`);
console.table(
  placedItems.map((placedItem) => ({
    sku: placedItem.item.sku,
    x: placedItem.localPosition.x,
    y: placedItem.localPosition.y,
    z: placedItem.localPosition.z
  }))
);

if (intersections.length > 0) {
  console.error("Se detectaron colisiones:");
  intersections.forEach((entry) => console.error(`- ${entry}`));
  process.exitCode = 1;
} else {
  console.log("Validacion AABB: sin colisiones detectadas.");
}
