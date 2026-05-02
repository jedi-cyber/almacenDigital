import { UI_COPY } from "./ui-copy.js";
import { wireHudInteractions } from "./ui-handlers.js";

export interface HudRefs {
  canvas: HTMLCanvasElement;
  legend: HTMLUListElement;
  searchForm: HTMLFormElement;
  productForm: HTMLFormElement;
  shelfSelect: HTMLSelectElement;
  statusMessage: HTMLParagraphElement;
  shelfDimensions: HTMLParagraphElement;
  selectedShelfDisplay: HTMLParagraphElement;
  shelfTotal: HTMLSpanElement;
  shelfOccupied: HTMLSpanElement;
  shelfFree: HTMLSpanElement;
  searchResult: HTMLDivElement;
  searchResultSku: HTMLElement;
  searchResultShelf: HTMLElement;
  moveProductBtn: HTMLButtonElement;
  deleteProductBtn: HTMLButtonElement;
  transferProductBtn: HTMLButtonElement;
  transferPanel: HTMLElement;
  transferShelfSelect: HTMLSelectElement;
  transferSectionSelect: HTMLSelectElement;
  transferConfirmBtn: HTMLButtonElement;
  transferCancelBtn: HTMLButtonElement;
  productEditor: HTMLElement;
  editorSkuDisplay: HTMLElement;
  editorForm: HTMLFormElement;
  editorName: HTMLInputElement;
  editorWidth: HTMLInputElement;
  editorHeight: HTMLInputElement;
  editorDepth: HTMLInputElement;
  clickInfo: HTMLDivElement;
  clickInfoSku: HTMLElement;
  clickInfoShelf: HTMLElement;
  clickInfoDims: HTMLElement;
  editShelvesBtn: HTMLButtonElement;
}

const ICON_PATHS = {
  chevron: "M8.47 10.97a.75.75 0 0 1 1.06 0L12 13.44l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z",
  edit: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.46 1.46 3.75 3.75 1.62-1.3Z",
  move: "M12 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9l3-3z",
  trash: "M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 9h2v8H6V9Z",
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-7 8.9 7 3.89 7-3.89V15l-7 4-7-4v-3.1Z",
  barcode: "M4 5h2v14H4V5Zm3 0h1v14H7V5Zm3 0h2v14h-2V5Zm4 0h1v14h-1V5Zm3 0h3v14h-3V5Z",
  close: "M6.7 5.3a1 1 0 0 1 1.4 0L12 9.17l3.9-3.88a1 1 0 1 1 1.4 1.42L13.4 10.6l3.9 3.89a1 1 0 0 1-1.4 1.42L12 12.01l-3.9 3.9a1 1 0 1 1-1.4-1.42l3.9-3.9-3.9-3.89a1 1 0 0 1 0-1.4Z"
} as const;

function renderIcon(path: string): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${path}" fill="currentColor" />
    </svg>
  `;
}

function renderIconButton(params: {
  id: string;
  className: string;
  label: string;
  iconPath: string;
  extraAttributes?: string;
}): string {
  const { id, className, label, iconPath, extraAttributes = "" } = params;
  return `
    <button type="button" id="${id}" class="${className}" aria-label="${label}" title="${label}" ${extraAttributes}>
      ${renderIcon(iconPath)}
      <span class="visually-hidden">${label}</span>
    </button>
  `;
}

function buildHudTemplate(): string {
  return `
    <section class="app-shell" data-testid="app-shell">
      <button
        type="button"
        id="mobile-hud-toggle"
        class="mobile-hud-toggle"
        data-hud-toggle
        aria-controls="control-panel"
        aria-expanded="false"
        title="${UI_COPY.buttons.showPanel}"
        data-testid="mobile-hud-toggle"
      >
        ${renderIcon(ICON_PATHS.layers)}
        <span class="visually-hidden">${UI_COPY.buttons.showPanel}</span>
      </button>
      <aside id="control-panel" class="hud" aria-label="Panel de control" data-testid="control-panel">
        <h1>${UI_COPY.page.title}</h1>
        <p>
          ${UI_COPY.page.description}
        </p>

        <p class="status-message" id="status-message" role="status" aria-live="polite" aria-atomic="true" data-testid="status-message" hidden>
          ${UI_COPY.status.initial}
        </p>

        <section class="form-card form-card--search" id="search-card" aria-labelledby="search-card-title" data-testid="search-card">
          <div class="form-card-head">
            <div class="form-card-head-copy">
              <strong id="search-card-title">${UI_COPY.search.title}</strong>
            </div>
          </div>
          <div class="form-card-body" id="search-card-body">
          <form class="search-form" id="search-form" aria-label="${UI_COPY.search.title}" data-testid="search-form">
            <label class="search-label">
              <span>${UI_COPY.search.label}</span>
              <div class="search-row">
                <input name="searchSku" type="text" placeholder="Ej. Producto A" aria-describedby="search-result-shelf" data-testid="search-sku-input" />
                <button type="submit" class="icon-button" aria-label="${UI_COPY.search.buttonAriaLabel}" data-testid="search-submit-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <button type="button" id="barcode-scan-btn" class="icon-button icon-button--scan" aria-label="${UI_COPY.buttons.scanBarcode}" title="${UI_COPY.buttons.scanBarcode}" data-testid="barcode-scan-btn">
                  ${renderIcon(ICON_PATHS.barcode)}
                  <span class="visually-hidden">${UI_COPY.buttons.scanBarcode}</span>
                </button>
                <button type="button" id="clear-search-btn" class="icon-button icon-button--ghost" aria-label="${UI_COPY.buttons.clearSearch}" title="${UI_COPY.buttons.clearSearch}" data-testid="clear-search-btn" hidden>
                  ${renderIcon(ICON_PATHS.close)}
                </button>
              </div>
            </label>
        </form>
        <div class="barcode-scanner" id="barcode-scanner" hidden>
          <video id="barcode-video" class="barcode-video" autoplay muted playsinline></video>
          <div class="barcode-frame" aria-hidden="true"></div>
        </div>
        </div>
        </section>

        <div class="hud-actions">
          ${renderIconButton({
            id: "open-shelf-manager-btn",
            className: "icon-action-btn icon-action-btn--soft icon-action-btn--wide-mobile",
            label: UI_COPY.buttons.manageShelf,
            iconPath: ICON_PATHS.layers,
            extraAttributes: 'data-panel-toggle="shelf-manager-panel"'
          })}
          ${renderIconButton({
            id: "open-edit-panel-btn",
            className: "icon-action-btn icon-action-btn--soft icon-action-btn--wide-mobile",
            label: UI_COPY.buttons.edit,
            iconPath: ICON_PATHS.edit,
            extraAttributes: 'data-panel-toggle="edit-panel"'
          })}
        </div>

        <section class="floating-panel" id="shelf-manager-panel" hidden aria-hidden="true" aria-label="${UI_COPY.productForm.shelfManager.title}" data-testid="shelf-manager-panel">
          <div class="floating-panel-head">
            <div class="floating-panel-copy">
              <strong>${UI_COPY.productForm.shelfManager.title}</strong>
              ${UI_COPY.productForm.shelfManager.description ? `<p>${UI_COPY.productForm.shelfManager.description}</p>` : ""}
            </div>
            ${renderIconButton({
              id: "close-shelf-manager-btn",
              className: "icon-action-btn",
              label: UI_COPY.toggles.closeMenu,
              iconPath: ICON_PATHS.close,
              extraAttributes: 'data-panel-close="shelf-manager-panel"'
            })}
          </div>

          <div class="manager-grid">
            <label class="manager-field">
              <span>${UI_COPY.productForm.steps.selectShelf}</span>
              <select name="shelfId" id="shelfId" form="product-form"></select>
            </label>

            <label class="manager-field">
              <span>${UI_COPY.productForm.sectionLabel}</span>
              <select name="section" id="section" form="product-form"></select>
            </label>
          </div>

          <section class="shelf-summary shelf-summary--manager">
            <strong>${UI_COPY.productForm.shelfSummary.title}</strong>
            <p id="shelf-dimensions"></p>
            <div class="shelf-metrics">
              <span id="shelf-total"></span>
              <span id="shelf-occupied"></span>
              <span id="shelf-free"></span>
            </div>
          </section>

          <section class="shelf-config">
            <div class="shelf-config-head">
              <strong>${UI_COPY.productForm.shelfManager.nameLabel}</strong>
            </div>
            <div class="shelf-config-row">
              <label>
                <span>${UI_COPY.productForm.shelfManager.nameLabel}</span>
                <input id="shelf-label-input" type="text" maxlength="100" />
              </label>
            </div>
            <div class="shelf-config-actions">
              <button type="button" id="update-shelf-label-btn" class="shelf-config-action-btn">
                ${UI_COPY.productForm.shelfManager.updateNameBtn}
              </button>
            </div>
          </section>

          <section class="shelf-config">
            <div class="shelf-config-head">
              <strong>${UI_COPY.productForm.shelfManager.floorNameLabel}</strong>
            </div>
            <div class="shelf-config-row">
              <label>
                <span>${UI_COPY.productForm.shelfManager.floorNameLabel}</span>
                <input id="section-label-input" type="text" maxlength="100" />
              </label>
            </div>
            <div class="shelf-config-actions">
              <button type="button" id="update-section-label-btn" class="shelf-config-action-btn">
                ${UI_COPY.productForm.shelfManager.updateFloorNameBtn}
              </button>
            </div>
          </section>

          <section class="shelf-config">
            <div class="shelf-config-head">
              <strong>${UI_COPY.productForm.shelfConfig.title}</strong>
              ${UI_COPY.productForm.shelfConfig.description ? `<span>${UI_COPY.productForm.shelfConfig.description}</span>` : ""}
            </div>
            <div class="shelf-config-row">
              <label>
                <span>${UI_COPY.productForm.shelfConfig.totalSectionsLabel}</span>
                <input name="shelfSections" form="product-form" type="number" min="1" step="1" value="1" />
              </label>
            </div>
            ${UI_COPY.productForm.shelfConfig.updateHelp ? `<p class="shelf-config-help">${UI_COPY.productForm.shelfConfig.updateHelp}</p>` : ""}
            <div class="shelf-config-actions">
              <button type="button" id="update-shelf-sections-btn" class="shelf-config-action-btn">
                ${UI_COPY.buttons.updateSections}
              </button>
            </div>
            <div class="shelf-config-row shelf-board-actions">
              <button type="button" id="add-board-btn" class="shelf-config-action-btn shelf-config-action-btn--soft">
                ${UI_COPY.buttons.addBoard}
              </button>
            </div>
            ${UI_COPY.productForm.shelfConfig.addBoardHelp ? `<p class="shelf-config-help">${UI_COPY.productForm.shelfConfig.addBoardHelp}</p>` : ""}
          </section>

          <section class="shelf-config">
            <div class="shelf-config-head">
              <strong>${UI_COPY.productForm.shelfSizeConfig.title}</strong>
              ${UI_COPY.productForm.shelfSizeConfig.updateHelp ? `<span>${UI_COPY.productForm.shelfSizeConfig.updateHelp}</span>` : ""}
            </div>
            <div class="shelf-config-row">
              <label>
                <span>${UI_COPY.productForm.dimensions.labels.width}</span>
                <input id="shelf-width-input" type="number" min="0.5" step="0.1" />
              </label>
              <label>
                <span>${UI_COPY.productForm.dimensions.labels.height}</span>
                <input id="shelf-height-input" type="number" min="0.5" step="0.1" />
              </label>
              <label>
                <span>${UI_COPY.productForm.dimensions.labels.depth}</span>
                <input id="shelf-depth-input" type="number" min="0.5" step="0.1" />
              </label>
            </div>
            <div class="shelf-config-actions">
              <button type="button" id="update-shelf-size-btn" class="shelf-config-action-btn">
                ${UI_COPY.productForm.shelfSizeConfig.updateBtn}
              </button>
            </div>
          </section>
        </section>

        <section class="floating-panel" id="edit-panel" hidden aria-hidden="true" aria-label="${UI_COPY.editPanel.title}" data-testid="edit-panel">
          <div class="floating-panel-head">
            <div class="floating-panel-copy">
              <strong>${UI_COPY.editPanel.title}</strong>
              <p>${UI_COPY.editPanel.description}</p>
            </div>
            ${renderIconButton({
              id: "close-edit-panel-btn",
              className: "icon-action-btn",
              label: UI_COPY.toggles.closeMenu,
              iconPath: ICON_PATHS.close,
              extraAttributes: 'data-panel-close="edit-panel"'
            })}
          </div>

          <div class="edit-group">
            <strong class="edit-group-title">${UI_COPY.editPanel.moveSection}</strong>
            <button type="button" id="edit-shelves-btn" class="shelf-config-action-btn shelf-config-action-btn--soft edit-shelves-btn">
              ${UI_COPY.buttons.moveShelf}
            </button>
            <button type="button" id="move-product-btn" class="shelf-config-action-btn shelf-config-action-btn--soft">
              ${UI_COPY.buttons.moveProduct}
            </button>
            <p class="edit-group-hint">${UI_COPY.editPanel.movePisosHint}</p>
          </div>

          <div class="edit-group">
            <strong class="edit-group-title">${UI_COPY.editPanel.deleteSection}</strong>
            <button type="button" id="delete-product-btn" class="shelf-config-action-btn shelf-config-action-btn--danger">
              ${UI_COPY.buttons.deleteProduct}
            </button>
            <label class="manager-field">
              <span>${UI_COPY.productForm.sectionLabel}</span>
              <select id="remove-board-section-select" aria-label="${UI_COPY.productForm.sectionLabel}"></select>
            </label>
            <button type="button" id="remove-board-btn" class="shelf-config-action-btn shelf-config-action-btn--soft">
              ${UI_COPY.buttons.removeBoard}
            </button>
          </div>
        </section>

        <div class="click-info" id="click-info" aria-live="polite" data-testid="click-info" hidden>
          <strong id="click-info-sku"></strong>
          <span id="click-info-shelf"></span>
          <span id="click-info-dims"></span>
        </div>

        <section class="form-card form-card--product" id="product-card" data-card data-collapsed="true" aria-labelledby="product-card-title" data-testid="product-card">
          <div class="form-card-head form-card-head--split">
            <div class="form-card-head-copy">
              <strong id="product-card-title">${UI_COPY.productForm.title}</strong>
            </div>
            <button
              type="button"
              class="card-toggle-btn"
              data-card-toggle
              data-card-id="product-card"
              data-section-label="${UI_COPY.productForm.title}"
              aria-expanded="false"
              aria-controls="product-card-body"
              title="${UI_COPY.toggles.open} ${UI_COPY.productForm.title}"
            >
              ${renderIcon(ICON_PATHS.chevron)}
              <span class="visually-hidden">${UI_COPY.toggles.open} ${UI_COPY.productForm.title}</span>
            </button>
          </div>
          <div class="form-card-body" id="product-card-body" data-card-body hidden>
          <form class="product-form" id="product-form" aria-label="${UI_COPY.productForm.title}" data-testid="product-form">
            <label>
              <span>${UI_COPY.productForm.steps.selectShelf}</span>
              <select id="product-shelf-select" aria-label="${UI_COPY.productForm.steps.selectShelf}" data-testid="product-shelf-select"></select>
            </label>
            <label>
              <span>${UI_COPY.productForm.sectionLabel}</span>
              <select id="product-section-select" aria-label="${UI_COPY.productForm.sectionLabel}" data-testid="product-section-select"></select>
            </label>
            <div class="dimension-hint" id="selected-shelf-display" aria-live="polite" data-testid="selected-shelf-display">
              ${UI_COPY.productForm.selectedShelfLabel}: -
            </div>
            <div class="sku-name-group">
              <label>
                <span>${UI_COPY.productForm.skuLabel}</span>
                <input name="sku" type="text" placeholder="Ej. SKU-001" required data-testid="product-sku-input" />
              </label>
              <div class="sku-name-divider" aria-hidden="true"></div>
              <label>
                <span>${UI_COPY.productForm.steps.productName}</span>
                <input name="productName" type="text" placeholder="Ej. Caja de tornillos" data-testid="product-name-input" />
              </label>
            </div>

            <section class="dimension-group">
              <div class="dimension-group-head">
                <strong>${UI_COPY.productForm.steps.measures}</strong>
                <span>${UI_COPY.productForm.dimensions.hint}</span>
              </div>
              <div class="dimension-hint" id="dimension-hint" aria-live="polite">
                ${UI_COPY.productForm.dimensions.defaultHint}
              </div>
              <div class="field-row">
                <label>
                  <span>${UI_COPY.productForm.dimensions.legacyLabels.width} (m)</span>
                  <input name="width" type="number" min="0.1" step="0.1" value="0.8" required />
                </label>
                <label>
                  <span>${UI_COPY.productForm.dimensions.legacyLabels.height} (m)</span>
                  <input name="height" type="number" min="0.1" step="0.1" value="0.8" required />
                </label>
                <label>
                  <span>${UI_COPY.productForm.dimensions.legacyLabels.depth} (m)</span>
                  <input name="depth" type="number" min="0.1" step="0.1" value="0.8" required />
                </label>
              </div>
            </section>

            <button type="submit" data-testid="register-product-btn">${UI_COPY.buttons.registerProduct}</button>
          </form>
          </div>
        </section>

        <section class="product-editor" id="product-editor" aria-labelledby="product-editor-title" data-testid="product-editor" hidden>
          <strong id="product-editor-title">${UI_COPY.productEditor.title}</strong>
          <form id="editor-form" class="editor-form" aria-label="${UI_COPY.productEditor.title}" data-testid="editor-form">
            <div class="sku-name-group">
              <p class="editor-sku" id="editor-sku-display" aria-live="polite"></p>
              <div class="sku-name-divider" aria-hidden="true"></div>
              <label>
                <span>${UI_COPY.productEditor.nameLabel}</span>
                <input id="editor-name" type="text" placeholder="Ej. Caja de tornillos" />
              </label>
            </div>
            <div class="field-row">
              <label>
                <span>${UI_COPY.productForm.dimensions.legacyLabels.width}</span>
                <input id="editor-width" type="number" min="0.01" step="0.01" />
              </label>
              <label>
                <span>${UI_COPY.productForm.dimensions.legacyLabels.height}</span>
                <input id="editor-height" type="number" min="0.01" step="0.01" />
              </label>
              <label>
                <span>${UI_COPY.productForm.dimensions.legacyLabels.depth}</span>
                <input id="editor-depth" type="number" min="0.01" step="0.01" />
              </label>
            </div>
            <button type="submit" id="editor-save-btn" class="editor-save-btn">
              ${UI_COPY.productEditor.save}
            </button>
          </form>
          <div class="editor-transfer">
            ${renderIconButton({
              id: "transfer-product-btn",
              className: "icon-action-btn icon-action-btn--soft icon-action-btn--wide",
              label: UI_COPY.buttons.transferProduct,
              iconPath: ICON_PATHS.layers
            })}
            <div class="transfer-panel" id="transfer-panel" aria-label="${UI_COPY.search.transferTitle}" data-testid="transfer-panel" hidden>
              <strong>${UI_COPY.search.transferTitle}</strong>
              <div class="transfer-fields">
                <label class="transfer-field">
                  <span>${UI_COPY.search.transferShelfLabel}</span>
                  <select id="transfer-shelf-select"></select>
                </label>
                <label class="transfer-field">
                  <span>${UI_COPY.search.transferSectionLabel}</span>
                  <select id="transfer-section-select"></select>
                </label>
              </div>
              <div class="transfer-actions">
                <button type="button" class="transfer-confirm-btn" id="transfer-confirm-btn">
                  ${UI_COPY.buttons.confirmTransfer}
                </button>
                <button type="button" class="transfer-cancel-btn" id="transfer-cancel-btn">
                  ${UI_COPY.buttons.cancelTransfer}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="nav-help" aria-label="Ayuda de navegacion">
          <strong>${UI_COPY.help.movementTitle}</strong>
          <ul>
            ${UI_COPY.help.movementItems.map((item) => `<li>${item}</li>`).join("")}
          </ul>
          <strong>${UI_COPY.help.shelvesTitle}</strong>
          <ul>
            ${UI_COPY.help.shelfItems.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </section>

	      </aside>
	      <div class="search-result search-result--modal" id="search-result" aria-live="polite" data-testid="search-result" data-minimized="false" hidden>
	        <section class="search-result-panel" aria-label="Reporte de productos encontrados">
		          <div class="search-result-head">
		            <div class="search-result-meta">
		              <strong id="search-result-sku"></strong>
		              <span id="search-result-shelf"></span>
		            </div>
		            <div class="search-result-head-actions">
		              <button type="button" id="close-search-report-btn" class="icon-button icon-button--ghost" aria-label="${UI_COPY.buttons.clearSearch}" title="${UI_COPY.buttons.clearSearch}">
		                ${renderIcon(ICON_PATHS.close)}
		                <span class="visually-hidden">${UI_COPY.buttons.clearSearch}</span>
		              </button>
		              <button type="button" id="minimize-search-report-btn" class="icon-button icon-button--ghost" aria-label="Minimizar reporte" title="Minimizar reporte">
		                ${renderIcon(ICON_PATHS.chevron)}
		              </button>
		            </div>
		          </div>
	          <div class="search-report-list" id="search-report-list" aria-label="Productos encontrados"></div>
	        </section>
	        <button type="button" id="restore-search-report-btn" class="search-result-minimized" aria-label="Abrir reporte de productos" title="Abrir reporte de productos">
	          <strong>Reporte de productos</strong>
	          <span id="search-result-minimized-summary"></span>
	        </button>
	      </div>
	      <main class="viewport" data-testid="viewport">
        <canvas class="scene-canvas" aria-label="Vista 3D del almacen" data-testid="scene-canvas"></canvas>
        <button
          type="button"
          id="legend-toggle-btn"
          class="legend-toggle-btn"
          data-legend-toggle
          aria-controls="legend"
          aria-expanded="false"
          title="${UI_COPY.buttons.showLegend}"
          data-testid="legend-toggle-btn"
        >
          ${UI_COPY.buttons.showLegend}
        </button>
        <ul class="legend" id="legend" aria-label="Lista de estantes" data-testid="legend" hidden></ul>
      </main>
    </section>
  `;
}

export function buildHtml(container: HTMLElement): HudRefs {
  container.innerHTML = buildHudTemplate();
  wireHudInteractions(container);

  const canvas = container.querySelector<HTMLCanvasElement>(".scene-canvas");
  const legend = container.querySelector<HTMLUListElement>("#legend");
  const searchForm = container.querySelector<HTMLFormElement>("#search-form");
  const productForm = container.querySelector<HTMLFormElement>("#product-form");
  const shelfSelect = container.querySelector<HTMLSelectElement>("#shelfId");
  const statusMessage = container.querySelector<HTMLParagraphElement>("#status-message");
  const shelfDimensions = container.querySelector<HTMLParagraphElement>("#shelf-dimensions");
  const selectedShelfDisplay = container.querySelector<HTMLParagraphElement>("#selected-shelf-display");
  const shelfTotal = container.querySelector<HTMLSpanElement>("#shelf-total");
  const shelfOccupied = container.querySelector<HTMLSpanElement>("#shelf-occupied");
  const shelfFree = container.querySelector<HTMLSpanElement>("#shelf-free");
  const searchResult = container.querySelector<HTMLDivElement>("#search-result");
  const searchResultSku = container.querySelector<HTMLElement>("#search-result-sku");
  const searchResultShelf = container.querySelector<HTMLElement>("#search-result-shelf");
  const moveProductBtn = container.querySelector<HTMLButtonElement>("#move-product-btn");
  const transferProductBtn = container.querySelector<HTMLButtonElement>("#transfer-product-btn");
  const deleteProductBtn = container.querySelector<HTMLButtonElement>("#delete-product-btn");
  const transferPanel = container.querySelector<HTMLElement>("#transfer-panel");
  const transferShelfSelect = container.querySelector<HTMLSelectElement>("#transfer-shelf-select");
  const transferSectionSelect = container.querySelector<HTMLSelectElement>("#transfer-section-select");
  const transferConfirmBtn = container.querySelector<HTMLButtonElement>("#transfer-confirm-btn");
  const transferCancelBtn = container.querySelector<HTMLButtonElement>("#transfer-cancel-btn");
  const productEditor = container.querySelector<HTMLElement>("#product-editor");
  const editorSkuDisplay = container.querySelector<HTMLElement>("#editor-sku-display");
  const editorForm = container.querySelector<HTMLFormElement>("#editor-form");
  const editorName = container.querySelector<HTMLInputElement>("#editor-name");
  const editorWidth = container.querySelector<HTMLInputElement>("#editor-width");
  const editorHeight = container.querySelector<HTMLInputElement>("#editor-height");
  const editorDepth = container.querySelector<HTMLInputElement>("#editor-depth");
  const clickInfo = container.querySelector<HTMLDivElement>("#click-info");
  const clickInfoSku = container.querySelector<HTMLElement>("#click-info-sku");
  const clickInfoShelf = container.querySelector<HTMLElement>("#click-info-shelf");
  const clickInfoDims = container.querySelector<HTMLElement>("#click-info-dims");
  const editShelvesBtn = container.querySelector<HTMLButtonElement>("#edit-shelves-btn");

  if (
    !canvas ||
    !legend ||
    !searchForm ||
    !productForm ||
    !shelfSelect ||
    !statusMessage ||
    !shelfDimensions ||
    !selectedShelfDisplay ||
    !shelfTotal ||
    !shelfOccupied ||
    !shelfFree ||
    !searchResult ||
    !searchResultSku ||
    !searchResultShelf ||
    !moveProductBtn ||
    !transferProductBtn ||
    !deleteProductBtn ||
    !transferPanel ||
    !transferShelfSelect ||
    !transferSectionSelect ||
    !transferConfirmBtn ||
    !transferCancelBtn ||
    !productEditor ||
    !editorSkuDisplay ||
    !editorForm ||
    !editorName ||
    !editorWidth ||
    !editorHeight ||
    !editorDepth ||
    !clickInfo ||
    !clickInfoSku ||
    !clickInfoShelf ||
    !clickInfoDims ||
    !editShelvesBtn
  ) {
    throw new Error("No se pudieron crear los elementos base de la escena.");
  }

  return {
    canvas,
    legend,
    searchForm,
    productForm,
    shelfSelect,
    statusMessage,
    shelfDimensions,
    selectedShelfDisplay,
    shelfTotal,
    shelfOccupied,
    shelfFree,
    searchResult,
    searchResultSku,
    searchResultShelf,
    moveProductBtn,
    transferProductBtn,
    deleteProductBtn,
    transferPanel,
    transferShelfSelect,
    transferSectionSelect,
    transferConfirmBtn,
    transferCancelBtn,
    productEditor,
    editorSkuDisplay,
    editorForm,
    editorName,
    editorWidth,
    editorHeight,
    editorDepth,
    clickInfo,
    clickInfoSku,
    clickInfoShelf,
    clickInfoDims,
    editShelvesBtn
  };
}
