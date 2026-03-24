import "./styles.css";

import { createWarehouseApp } from "./warehouseScene.js";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("No se encontro el contenedor principal de la aplicacion.");
}

createWarehouseApp(root).catch((error: unknown) => {
  console.error("No se pudo inicializar el almacen digital 3D.", error);
  root.innerHTML = `
    <section class="app-shell">
      <div class="hud">
        <span class="eyebrow">Error</span>
        <h1>La escena no pudo inicializarse.</h1>
        <p>Revisa la consola del navegador para mas detalles.</p>
      </div>
    </section>
  `;
});
