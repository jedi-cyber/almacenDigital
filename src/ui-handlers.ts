import { SHELF_PALETTE } from "./scene.js";
import type { Shelf } from "./types.js";
import { UI_COPY } from "./ui-copy.js";

export function wireHudInteractions(container: HTMLElement): void {
  const appShell = container.querySelector<HTMLElement>(".app-shell");
  const hudToggleBtn = container.querySelector<HTMLButtonElement>("[data-hud-toggle]");
  const legendToggleBtn = container.querySelector<HTMLButtonElement>("[data-legend-toggle]");
  const themeToggleBtn = container.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  const legend = container.querySelector<HTMLElement>("#legend");
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

  const getStoredTheme = (): "light" | "dark" | null => {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : null;
  };

  const getActiveTheme = (): "light" | "dark" => getStoredTheme() ?? (themeQuery.matches ? "dark" : "light");

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

    const cardButton = target.closest<HTMLButtonElement>("[data-card-toggle]");
    if (cardButton) {
      event.preventDefault();
      const cardId = cardButton.dataset.cardId;
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
  isError: boolean
): void {
  const text = message.trim();
  element.textContent = text;
  element.hidden = text.length === 0;
  if (!text) {
    delete element.dataset.state;
    return;
  }
  element.dataset.state = isError ? "error" : "success";
}

export function updateLegendCount(shelfId: string, count: number): void {
  const legendItem = document.querySelector<HTMLLIElement>(`#legend-${shelfId}`);
  const counter = legendItem?.querySelector("small");
  if (counter) {
    counter.textContent = `${count} producto${count === 1 ? "" : "s"}`;
  }
}
