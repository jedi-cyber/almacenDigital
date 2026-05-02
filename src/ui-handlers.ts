import { SHELF_PALETTE } from "./scene.js";
import type { Shelf } from "./types.js";
import { UI_COPY } from "./ui-copy.js";

let selectedSku: string | null = null;

/* =========================
   UI PRINCIPAL
========================= */
export function wireHudInteractions(container: HTMLElement): void {
  const appShell = container.querySelector<HTMLElement>(".app-shell");
  const hudToggleBtn = container.querySelector<HTMLButtonElement>("[data-hud-toggle]");
  const legendToggleBtn = container.querySelector<HTMLButtonElement>("[data-legend-toggle]");
  const legend = container.querySelector<HTMLElement>("#legend");
  const mobileQuery = window.matchMedia("(max-width: 900px)");

  // 🔥 NUEVO
  const deleteBtn = container.querySelector("#delete-product-btn") as HTMLButtonElement;
  const clickInfo = container.querySelector("#click-info") as HTMLDivElement;
  const clickInfoSku = container.querySelector("#click-info-sku") as HTMLElement;
  const clickInfoShelf = container.querySelector("#click-info-shelf") as HTMLElement;

  deleteBtn.hidden = true;
  clickInfo.hidden = true;

  /* =========================
     BOTÓN ELIMINAR
  ========================= */
  deleteBtn.addEventListener("click", async () => {
    if (!selectedSku) {
      alert("Selecciona un producto primero");
      return;
    }

    const confirmDelete = confirm(`¿Eliminar producto ${selectedSku}?`);
    if (!confirmDelete) return;

    try {
      await fetch(`/api/productos.php?sku=${selectedSku}`, {
        method: "DELETE"
      });

      alert("Producto eliminado correctamente");

      // reset UI
      selectedSku = null;
      clickInfo.hidden = true;
      deleteBtn.hidden = true;

      location.reload();

    } catch (err) {
      console.error(err);
      alert("Error al eliminar producto");
    }
  });

  /* =========================
     FUNCIONES EXISTENTES
  ========================= */

  const setCardState = (card: HTMLElement, button: HTMLButtonElement, collapsed: boolean) => {
    const body = card.querySelector<HTMLElement>("[data-card-body]");
    const sectionLabel = button.dataset.sectionLabel ?? "panel";
    if (!body) return;

    card.dataset.collapsed = collapsed ? "true" : "false";
    body.hidden = collapsed;
    body.style.display = collapsed ? "none" : "";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");

    const action = collapsed ? UI_COPY.toggles.open : UI_COPY.toggles.close;
    const label = `${action} ${sectionLabel}`;

    button.title = label;
    button.setAttribute("aria-label", label);

    const hiddenLabel = button.querySelector(".visually-hidden");
    if (hiddenLabel) hiddenLabel.textContent = label;
  };

  const setPanelState = (panel: HTMLElement, isOpen: boolean) => {
    panel.hidden = !isOpen;
    panel.style.display = isOpen ? "" : "none";
    panel.setAttribute("aria-hidden", isOpen ? "false" : "true");

    const openButton = container.querySelector<HTMLButtonElement>(`[data-panel-toggle="${panel.id}"]`);
    openButton?.classList.toggle("icon-action-btn--active", isOpen);
  };

  const setHudState = (isOpen: boolean) => {
    if (!appShell || !hudToggleBtn) return;

    appShell.dataset.hudOpen = isOpen ? "true" : "false";

    const label = isOpen ? UI_COPY.buttons.hidePanel : UI_COPY.buttons.showPanel;

    hudToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    hudToggleBtn.title = label;
    hudToggleBtn.setAttribute("aria-label", label);

    const hiddenLabel = hudToggleBtn.querySelector(".visually-hidden");
    if (hiddenLabel) hiddenLabel.textContent = label;
  };

  const setLegendState = (isOpen: boolean) => {
    if (!legend || !legendToggleBtn) return;

    legend.hidden = !isOpen;

    const label = isOpen ? UI_COPY.buttons.hideLegend : UI_COPY.buttons.showLegend;

    legendToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    legendToggleBtn.title = label;
    legendToggleBtn.setAttribute("aria-label", label);
    legendToggleBtn.textContent = label;
  };

  const syncHudStateWithViewport = () => {
    if (!appShell) return;

    if (mobileQuery.matches) {
      if (!appShell.dataset.hudOpen) {
        setHudState(false);
      }
      return;
    }

    setHudState(true);
  };

  syncHudStateWithViewport();
  mobileQuery.addEventListener("change", syncHudStateWithViewport);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // HUD móvil
    const hudToggle = target.closest<HTMLButtonElement>("[data-hud-toggle]");
    if (hudToggle) {
      event.preventDefault();
      if (!appShell) return;
      setHudState(appShell.dataset.hudOpen !== "true");
      return;
    }

    // Leyenda
    const legendToggle = target.closest<HTMLButtonElement>("[data-legend-toggle]");
    if (legendToggle) {
      event.preventDefault();
      if (!legend) return;
      setLegendState(legend.hidden);
      return;
    }

    // ── Botones de panel flotante (lápiz, layers) ──
    const panelToggle = target.closest<HTMLButtonElement>("[data-panel-toggle]");
    if (panelToggle) {
      event.preventDefault();
      const panelId = panelToggle.dataset.panelToggle;
      if (!panelId) return;
      const panel = container.querySelector<HTMLElement>(`#${panelId}`);
      if (!panel) return;
      const isCurrentlyOpen = !panel.hidden;
      // Cerrar todos los paneles flotantes primero
      container.querySelectorAll<HTMLElement>(".floating-panel").forEach((p) => {
        setPanelState(p, false);
      });
      // Si estaba cerrado, abrirlo
      if (!isCurrentlyOpen) setPanelState(panel, true);
      return;
    }

    // ── Botón X dentro de panel flotante ──
    const panelClose = target.closest<HTMLButtonElement>("[data-panel-close]");
    if (panelClose) {
      event.preventDefault();
      const panelId = panelClose.dataset.panelClose;
      if (!panelId) return;
      const panel = container.querySelector<HTMLElement>(`#${panelId}`);
      if (panel) setPanelState(panel, false);
      return;
    }

    // ── Registrar producto (card toggle) ──
    const cardToggle = target.closest<HTMLButtonElement>("[data-card-toggle]");
    if (cardToggle) {
      event.preventDefault();
      const cardId = cardToggle.dataset.cardId;
      if (!cardId) return;
      const card = container.querySelector<HTMLElement>(`#${cardId}`);
      if (!card) return;
      const isCollapsed = card.dataset.collapsed !== "false";
      setCardState(card, cardToggle, !isCollapsed);
      return;
    }
  });
}

/* =========================
   🔥 FUNCIÓN CLAVE (EXPORTADA)
========================= */
export function handleProductSelection(product: any, container: HTMLElement) {
  selectedSku = product.sku;

  const clickInfo = container.querySelector("#click-info") as HTMLDivElement;
  const clickInfoSku = container.querySelector("#click-info-sku") as HTMLElement;
  const clickInfoShelf = container.querySelector("#click-info-shelf") as HTMLElement;
  const deleteBtn = container.querySelector("#delete-product-btn") as HTMLButtonElement;

  clickInfoSku.textContent = `SKU: ${product.sku}`;
  clickInfoShelf.textContent = `Estante: ${product.shelfId}`;

  clickInfo.hidden = false;
  deleteBtn.hidden = false;
}

/* =========================
   RESTO (igual)
========================= */
export function populateShelves(
  legend: HTMLUListElement,
  shelfSelect: HTMLSelectElement,
  shelves: Shelf[]
): void {
  shelves.forEach((shelf, index) => {
    const color = SHELF_PALETTE[index % SHELF_PALETTE.length];

    const li = document.createElement("li");
    li.id = `legend-${shelf.id}`;
    li.innerHTML = `
      <div class="legend-head">
        <span class="legend-swatch" style="background:${color}"></span>
        <strong>${shelf.id}</strong>
      </div>
      <span>${shelf.label}</span>
      <small>0 productos</small>
    `;
    legend.append(li);

    const option = document.createElement("option");
    option.value = shelf.id;
    option.textContent = `${shelf.id} | ${shelf.label}`;
    shelfSelect.append(option);
  });
}

// 👇 PEGA ESTO AL FINAL DEL ARCHIVO

export function setStatus(el: HTMLElement, msg: string, isError = false) {
  el.textContent = msg;
  el.style.color = isError ? "red" : "green";
}

export function updateLegendCount(shelfId: string, count: number) {
  const el = document.querySelector(`#legend-${shelfId} small`);
  if (el) {
    el.textContent = `${count} productos`;
  }
}