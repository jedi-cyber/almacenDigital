import "./styles.css";

import { createWarehouseApp } from "./warehouseScene.js";

// Suprimir el warning inofensivo del navegador sobre listeners asíncronos
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = String(args[0] ?? "");
  if (message.includes("A listener indicated an asynchronous response")) {
    return; // Ignorar este warning específico
  }
  originalWarn.apply(console, args);
};

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = String(args[0] ?? "");
  if (message.includes("A listener indicated an asynchronous response")) {
    return; // Ignorar este error específico
  }
  originalError.apply(console, args);
};

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("mode") === "mobile-route") {
  document.documentElement.dataset.appMode = "mobile-route";
  const nativeToken = urlParams.get("nativeToken");
  if (nativeToken) {
    window.localStorage.setItem("almacen-digital-session-token", nativeToken);
  }
}

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
