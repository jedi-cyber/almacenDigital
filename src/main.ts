import "./styles.css";

import { createWarehouseApp } from "./warehouseScene.js";
import { buildScannerPanel } from "./ui-scanner.js";

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
  .then((app) => {
    hideLoadingScreen();

    // ── Panel de escáner ────────────────────────────────────────────────────
    // Crea el contenedor del panel y lo inserta después del HUD
    const scannerContainer = document.createElement("div");
    scannerContainer.id = "scanner-panel-container";
    scannerContainer.hidden = true;
    root.appendChild(scannerContainer);

    // Construye el panel con los estantes actuales del almacén
    let cleanupScanner = buildScannerPanel(scannerContainer, app.getShelves());

    // Abre / cierra el panel al pulsar el botón verde de barras
    const scanBtn = root.querySelector<HTMLButtonElement>("#barcode-scan-btn");
    scanBtn?.addEventListener("click", () => {
      const isOpen = !scannerContainer.hidden;
      if (isOpen) {
        scannerContainer.hidden = true;
        scanBtn.classList.remove("icon-button--active");
      } else {
        // Reconstruye por si los estantes cambiaron
        cleanupScanner();
        cleanupScanner = buildScannerPanel(scannerContainer, app.getShelves());
        scannerContainer.hidden = false;
        scanBtn.classList.add("icon-button--active");
      }
    });
    // ───────────────────────────────────────────────────────────────────────
  })
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