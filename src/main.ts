import "./styles.css";

import { createWarehouseApp } from "./warehouseScene.js";

const root = document.querySelector<HTMLDivElement>("#app");
const loadingScreen = document.querySelector<HTMLDivElement>("#loading-screen");

if (!root) {
  throw new Error("No se encontro el contenedor principal de la aplicacion.");
}

function hideLoadingScreen(): void {
  if (!loadingScreen) return;
  loadingScreen.classList.add("is-hidden");
  setTimeout(() => loadingScreen.remove(), 350);
}

createWarehouseApp(root)
  .then(hideLoadingScreen)
  .catch((error: unknown) => {
    hideLoadingScreen();
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
