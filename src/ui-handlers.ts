import { SHELF_PALETTE } from "./scene.js";
import type { Shelf } from "./types.js";
import { UI_COPY } from "./ui-copy.js";

const statusAutoCloseTimers = new WeakMap<HTMLParagraphElement, number>();
export type StatusKind = "success" | "error" | "warning" | "info" | "empty" | "loading";

export function wireHudInteractions(container: HTMLElement): void {
  const appShell = container.querySelector<HTMLElement>(".app-shell");
  const hudToggleBtn = container.querySelector<HTMLButtonElement>("[data-hud-toggle]");
  const legendToggleBtn = container.querySelector<HTMLButtonElement>("[data-legend-toggle]");
  const themeToggleBtn = container.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  const legend = container.querySelector<HTMLElement>("#legend");
  const productPanel = container.querySelector<HTMLElement>("#product-card");
  const productEditor = container.querySelector<HTMLElement>("#product-editor");
  const searchPanel = container.querySelector<HTMLElement>("#search-card");
	  const selectedProductPanel = container.querySelector<HTMLElement>("#selected-product-panel");
	  const authPanel = container.querySelector<HTMLElement>("#auth-panel");
	  const userAdminPanel = container.querySelector<HTMLElement>("#user-admin-panel");
  const globalSearchInput = container.querySelector<HTMLInputElement>(".global-search input");
  const globalClearSearchBtn = container.querySelector<HTMLButtonElement>("#global-clear-search-btn");
  const searchForm = container.querySelector<HTMLFormElement>("#search-form");
  const searchInput = searchForm?.querySelector<HTMLInputElement>('input[name="searchSku"]');
  const mobileQuery = window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse)");
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const themeStorageKey = "almacen-digital-theme";

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
    const visibleLabel = button.querySelector(".action-label");
    if (visibleLabel) visibleLabel.textContent = action;
  };

  const setPanelState = (panel: HTMLElement, isOpen: boolean) => {
    if (isOpen) {
      Array.from(container.querySelectorAll<HTMLElement>(".floating-panel")).forEach((otherPanel) => {
        if (otherPanel === panel) return;
        otherPanel.hidden = true;
        otherPanel.style.display = "none";
        otherPanel.setAttribute("aria-hidden", "true");
        const otherOpenButton = container.querySelector<HTMLButtonElement>(`[data-panel-toggle="${otherPanel.id}"]`);
        otherOpenButton?.classList.remove("icon-action-btn--active");
      });
    }
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

  const closeWorkspacePanels = (except?: HTMLElement | null) => {
    if (productPanel && productPanel !== except) {
      productPanel.hidden = true;
      if (appShell) appShell.dataset.productPanelOpen = "false";
    }
    if (productEditor && productEditor !== except) productEditor.hidden = true;
    if (searchPanel && searchPanel !== except) searchPanel.hidden = true;
    if (selectedProductPanel && selectedProductPanel !== except) selectedProductPanel.hidden = true;
    Array.from(container.querySelectorAll<HTMLElement>(".floating-panel")).forEach((panel) => {
      if (panel === except) return;
      panel.hidden = true;
      panel.style.display = "none";
      panel.setAttribute("aria-hidden", "true");
    });
  };

	  const setProductPanelState = (isOpen: boolean) => {
    if (!appShell || !productPanel) return;
    closeWorkspacePanels(productPanel);
    appShell.dataset.productPanelOpen = isOpen ? "true" : "false";
    productPanel.hidden = !isOpen;
    const body = productPanel.querySelector<HTMLElement>("[data-card-body]");
    const button = productPanel.querySelector<HTMLButtonElement>("[data-card-toggle]");
    if (body) body.hidden = false;
    productPanel.dataset.collapsed = "false";
    button?.setAttribute("aria-expanded", "true");
  };

  const setLegendState = (isOpen: boolean) => {
    if (!legend || !legendToggleBtn) return;
    legend.hidden = !isOpen;
    const label = isOpen ? UI_COPY.buttons.hideLegend : UI_COPY.buttons.showLegend;
    legendToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    legendToggleBtn.title = label;
    legendToggleBtn.setAttribute("aria-label", label);
    const visibleLabel = legendToggleBtn.querySelector<HTMLElement>("span:not(.visually-hidden)");
    if (visibleLabel) {
      visibleLabel.textContent = label;
    } else {
      legendToggleBtn.textContent = label;
    }
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

  const getStoredTheme = (): "light" | "dark" | null => {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : null;
  };

  const getActiveTheme = (): "light" | "dark" => getStoredTheme() ?? "dark";

  const setTheme = (theme: "light" | "dark", shouldStore = true) => {
    document.documentElement.dataset.theme = theme;
    if (shouldStore) {
      window.localStorage.setItem(themeStorageKey, theme);
    }

    const isDark = theme === "dark";
    const nextThemeLabel = isDark ? "claro" : "oscuro";
    const visibleLabel = themeToggleBtn?.querySelector<HTMLElement>("[data-theme-toggle-label]");
    if (themeToggleBtn) {
      themeToggleBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
      themeToggleBtn.setAttribute("aria-label", `Cambiar a modo ${nextThemeLabel}`);
      themeToggleBtn.title = `Cambiar a modo ${nextThemeLabel}`;
    }
    if (visibleLabel) {
      visibleLabel.textContent = isDark ? "Claro" : "Oscuro";
    }
  };

  Array.from(container.querySelectorAll<HTMLButtonElement>("[data-card-toggle]")).forEach((button) => {
    const cardId = button.dataset.cardId;
    const card = cardId ? container.querySelector<HTMLElement>(`#${cardId}`) : button.closest<HTMLElement>("[data-card]");
    if (!card) return;
    setCardState(card, button, card.dataset.collapsed === "true");
  });

  const floatingPanel = container.querySelector<HTMLElement>("#shelf-manager-panel");
  if (floatingPanel) {
    setPanelState(floatingPanel, false);
  }

  const editPanel = container.querySelector<HTMLElement>("#edit-panel");
  if (editPanel) {
    setPanelState(editPanel, false);
  }
  setLegendState(false);
  setTheme(getActiveTheme(), false);

  syncHudStateWithViewport();
  mobileQuery.addEventListener("change", syncHudStateWithViewport);
  themeQuery.addEventListener("change", () => {
    if (!getStoredTheme()) {
      setTheme(themeQuery.matches ? "dark" : "light", false);
    }
  });

	  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const hudToggle = target.closest<HTMLButtonElement>("[data-hud-toggle]");
    if (hudToggle) {
      event.preventDefault();
      if (!appShell) return;
      setHudState(appShell.dataset.hudOpen !== "true");
      return;
    }

    const legendToggle = target.closest<HTMLButtonElement>("[data-legend-toggle]");
    if (legendToggle) {
      event.preventDefault();
      if (!legend) return;
      setLegendState(legend.hidden === true);
      return;
    }

	    const themeToggle = target.closest<HTMLButtonElement>("[data-theme-toggle]");
    if (themeToggle) {
      event.preventDefault();
      setTheme(getActiveTheme() === "dark" ? "light" : "dark");
	      return;
	    }

	    const productToggle = target.closest<HTMLElement>("[data-product-toggle]");
	    if (productToggle) {
	      event.preventDefault();
	      setProductPanelState(appShell?.dataset.productPanelOpen !== "true");
	      return;
	    }

	    const minimizeButton = target.closest<HTMLButtonElement>("[data-minimize-panel]");
	    if (minimizeButton) {
	      event.preventDefault();
	      const panelId = minimizeButton.dataset.minimizePanel;
      const panel = panelId ? container.querySelector<HTMLElement>(`#${panelId}`) : null;
      if (!panel) return;
      const isMinimized = panel.dataset.minimized === "true";
      panel.dataset.minimized = isMinimized ? "false" : "true";
      minimizeButton.setAttribute("aria-label", isMinimized ? "Minimizar panel" : "Expandir panel");
      minimizeButton.title = isMinimized ? "Minimizar panel" : "Expandir panel";
      const icon = minimizeButton.querySelector<HTMLElement>("span");
	      if (icon) icon.textContent = isMinimized ? "−" : "+";
	      return;
	    }

    const closeButton = target.closest<HTMLButtonElement>("[data-close-panel]");
    if (closeButton) {
      event.preventDefault();
      const panelId = closeButton.dataset.closePanel;
      const panel = panelId ? container.querySelector<HTMLElement>(`#${panelId}`) : null;
      if (!panel) return;
      panel.hidden = true;
      panel.dataset.minimized = "false";
      panel.setAttribute("aria-hidden", "true");
      if (panelId === "product-card" && appShell) {
        appShell.dataset.productPanelOpen = "false";
      }
      return;
    }

	    const searchToggle = target.closest<HTMLElement>("[data-search-toggle]");
	    if (searchToggle) {
	      event.preventDefault();
      globalSearchInput?.focus();
      globalSearchInput?.select();
	      return;
	    }

    const editorToggle = target.closest<HTMLElement>("[data-editor-toggle]");
    if (editorToggle && productEditor) {
      event.preventDefault();
      const shouldOpen = productEditor.hidden;
      closeWorkspacePanels(productEditor);
      productEditor.hidden = !shouldOpen;
      if (shouldOpen) productEditor.dataset.minimized = "false";
      return;
    }

	    const adminToggle = target.closest<HTMLButtonElement>("#admin-card-btn");
	    if (adminToggle && authPanel) {
	      event.preventDefault();
		      if (appShell?.dataset.authRequired === "true") {
		        authPanel.hidden = false;
	        authPanel.setAttribute("aria-hidden", "false");
		        return;
		      }
	      if (userAdminPanel) userAdminPanel.hidden = true;
		      authPanel.hidden = !authPanel.hidden;
      authPanel.setAttribute("aria-hidden", authPanel.hidden ? "true" : "false");
	      return;
	    }

    const cardButton = target.closest<HTMLButtonElement>("[data-card-toggle]");
    if (cardButton) {
      event.preventDefault();
      const cardId = cardButton.dataset.cardId;
      if (cardId === "product-card") {
        setProductPanelState(false);
        return;
      }
      const card = cardId
        ? container.querySelector<HTMLElement>(`#${cardId}`)
        : cardButton.closest<HTMLElement>("[data-card]");
      if (!card) return;
      setCardState(card, cardButton, card.dataset.collapsed !== "true");
      return;
    }

    const openPanelButton = target.closest<HTMLButtonElement>("[data-panel-toggle]");
    if (openPanelButton) {
      event.preventDefault();
	      const panelId = openPanelButton.dataset.panelToggle;
	      const panel = panelId ? container.querySelector<HTMLElement>(`#${panelId}`) : null;
	      if (!panel) return;
      closeWorkspacePanels(panel);
	      setPanelState(panel, panel.hidden === true);
      return;
    }

    const closePanelButton = target.closest<HTMLButtonElement>("[data-panel-close]");
    if (closePanelButton) {
      event.preventDefault();
      const panelId = closePanelButton.dataset.panelClose;
      const panel = panelId ? container.querySelector<HTMLElement>(`#${panelId}`) : null;
      if (!panel) return;
      setPanelState(panel, false);
      return;
    }

    const viewport = target.closest<HTMLElement>(".viewport");
    if (viewport && mobileQuery.matches && appShell?.dataset.hudOpen === "true") {
      setHudState(false);
    }
  });

	  globalSearchInput?.addEventListener("keydown", (event) => {
	    if (event.key !== "Enter" || !searchForm || !searchInput) return;
	    event.preventDefault();
	    searchInput.value = globalSearchInput.value;
	    searchForm.requestSubmit();
	  });

  globalClearSearchBtn?.addEventListener("click", () => {
    if (globalSearchInput) globalSearchInput.value = "";
    if (searchInput) searchInput.value = "";
    searchForm?.querySelector<HTMLButtonElement>("#clear-search-btn")?.click();
    globalSearchInput?.focus();
  });
}

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

export function setStatus(
  element: HTMLParagraphElement,
  message: string,
  state: boolean | StatusKind
): void {
  delete element.dataset.notice;
  const activeTimer = statusAutoCloseTimers.get(element);
  if (activeTimer !== undefined) {
    window.clearTimeout(activeTimer);
    statusAutoCloseTimers.delete(element);
  }
  const text = message.trim();
  element.textContent = "";
  element.hidden = text.length === 0;
  if (!text) {
    delete element.dataset.state;
    return;
  }

  const textNode = document.createElement("span");
  textNode.className = "status-message-text";
  textNode.textContent = text;
  element.append(textNode);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "status-message-close";
  closeButton.setAttribute("aria-label", "Cerrar notificacion");
  closeButton.title = "Cerrar notificacion";
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    element.hidden = true;
    element.textContent = "";
    delete element.dataset.state;
    delete element.dataset.notice;
    const timer = statusAutoCloseTimers.get(element);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      statusAutoCloseTimers.delete(element);
    }
  });
  element.append(closeButton);

  const nextState = typeof state === "boolean" ? (state ? "error" : "success") : state;
  element.dataset.state = nextState;
  if (nextState !== "error" && nextState !== "warning" && nextState !== "loading") {
    statusAutoCloseTimers.set(
      element,
      window.setTimeout(() => closeButton.click(), 5200)
    );
  }
}

export function updateLegendCount(shelfId: string, count: number): void {
  const legendItem = document.querySelector<HTMLLIElement>(`#legend-${shelfId}`);
  const counter = legendItem?.querySelector("small");
  if (counter) {
    counter.textContent = `${count} producto${count === 1 ? "" : "s"}`;
  }
}
