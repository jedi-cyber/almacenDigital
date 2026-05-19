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
  editorCategory: HTMLInputElement;
  editorBrand: HTMLInputElement;
  editorImageUrl: HTMLInputElement;
  editorWidth: HTMLInputElement;
  editorHeight: HTMLInputElement;
  editorDepth: HTMLInputElement;
  clickInfo: HTMLDivElement;
  clickInfoSku: HTMLElement;
  clickInfoShelf: HTMLElement;
  clickInfoDims: HTMLElement;
  editShelvesBtn: HTMLButtonElement;
  summaryProducts: HTMLElement;
  summaryShelves: HTMLElement;
  summaryRoutes: HTMLElement;
  adminInitials: HTMLElement;
  adminName: HTMLElement;
  adminRole: HTMLElement;
  selectedProductPanel: HTMLElement;
  selectedProductStatus: HTMLElement;
  selectedProductName: HTMLElement;
  selectedProductSku: HTMLElement;
  selectedProductImage: HTMLElement;
  selectedProductLocation: HTMLElement;
  selectedProductDimensions: HTMLElement;
  selectedProductStock: HTMLElement;
  selectedProductCategory: HTMLElement;
  selectedProductHistoryBtn: HTMLButtonElement;
  selectedProductEditBtn: HTMLButtonElement;
  resetCameraBtn: HTMLButtonElement;
  focusSelectedBtn: HTMLButtonElement;
  cameraModeBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomOutBtn: HTMLButtonElement;
  fullscreenBtn: HTMLButtonElement;
  authPanel: HTMLElement;
  authForm: HTMLFormElement;
  authName: HTMLInputElement;
  authEmail: HTMLInputElement;
  authPassword: HTMLInputElement;
  authLogoutBtn: HTMLButtonElement;
  profileForm: HTMLFormElement;
  profileName: HTMLInputElement;
  profileEmail: HTMLInputElement;
  profileCurrentPassword: HTMLInputElement;
  profileNewPassword: HTMLInputElement;
  profileConfirmPassword: HTMLInputElement;
  profileRole: HTMLElement;
  profileUserId: HTMLElement;
  profileSessionExpiry: HTMLElement;
  profileResetBtn: HTMLButtonElement;
  profileStatus: HTMLParagraphElement;
}

const ICON_PATHS = {
  chevron: "M8.47 10.97a.75.75 0 0 1 1.06 0L12 13.44l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z",
  edit: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.46 1.46 3.75 3.75 1.62-1.3Z",
  move: "M12 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9l3-3z",
  trash: "M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 9h2v8H6V9Z",
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-7 8.9 7 3.89 7-3.89V15l-7 4-7-4v-3.1Z",
  report: "M3 13h4v8H3v-8Zm6-6h4v14H9V7Zm6 3h4v11h-4V10Z",
  barcode: "M4 5h2v14H4V5Zm3 0h1v14H7V5Zm3 0h2v14h-2V5Zm4 0h1v14h-1V5Zm3 0h3v14h-3V5Z",
  close: "M6.7 5.3a1 1 0 0 1 1.4 0L12 9.17l3.9-3.88a1 1 0 1 1 1.4 1.42L13.4 10.6l3.9 3.89a1 1 0 0 1-1.4 1.42L12 12.01l-3.9 3.9a1 1 0 1 1-1.4-1.42l3.9-3.9-3.9-3.89a1 1 0 0 1 0-1.4Z",
  theme: "M12 3a9 9 0 1 0 9 9c0-.36-.02-.72-.07-1.07A6.5 6.5 0 0 1 13.07 3.1 9.7 9.7 0 0 0 12 3Zm0 2.1a4.5 4.5 0 0 0 5.9 5.9A7 7 0 1 1 12 5.1Z"
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
      <span class="action-label" aria-hidden="true">${label}</span>
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
        <header class="hud-header">
          <span class="app-badge">3D</span>
          <div class="hud-title-group">
            <h1>Almacén <span>Digital 3D</span></h1>
            <p>${UI_COPY.page.description}</p>
          </div>
          <button
            type="button"
            id="theme-toggle-btn"
            class="theme-toggle-btn"
            data-theme-toggle
            aria-label="Cambiar a modo oscuro"
            aria-pressed="false"
            title="Cambiar a modo oscuro"
          >
            ${renderIcon(ICON_PATHS.theme)}
            <span data-theme-toggle-label>Oscuro</span>
          </button>
        </header>

        <nav class="side-nav" aria-label="Navegacion principal">
          <a class="side-nav-item side-nav-item--active" href="#">
            ${renderIcon(ICON_PATHS.layers)}
            <span>Inicio</span>
          </a>
          <button type="button" class="side-nav-item" data-product-toggle>
            ${renderIcon(ICON_PATHS.barcode)}
            <span>Registrar producto</span>
          </button>
          <button type="button" class="side-nav-item" data-panel-toggle="shelf-manager-panel">
            ${renderIcon(ICON_PATHS.layers)}
            <span>Gestionar estantes</span>
          </button>
          <button type="button" class="side-nav-item" data-panel-toggle="edit-panel">
            ${renderIcon(ICON_PATHS.move)}
            <span>Rutas y edición</span>
          </button>
          <button type="button" class="side-nav-item" id="open-report-btn" data-report-toggle>
            ${renderIcon(ICON_PATHS.report)}
            <span>Reportes</span>
          </button>
        </nav>

        <section class="quick-summary" aria-label="Resumen rapido">
          <div class="quick-summary-head">
            <strong>Resumen rápido</strong>
            <span>↗</span>
          </div>
          <dl>
            <div>
              <button type="button" class="quick-summary-action" data-report-toggle>
                <span class="quick-summary-label">Productos registrados</span>
                <span class="quick-summary-value"><strong id="summary-products">0</strong> <span id="summary-products-delta">Ver reporte</span></span>
              </button>
            </div>
            <div>
              <button type="button" class="quick-summary-action" data-panel-toggle="shelf-manager-panel">
                <span class="quick-summary-label">Estantes activos</span>
                <span class="quick-summary-value"><strong id="summary-shelves">0</strong> <span>Gestionar</span></span>
              </button>
            </div>
            <div>
              <button type="button" class="quick-summary-action" data-search-toggle>
                <span class="quick-summary-label">Rutas generadas (hoy)</span>
                <span class="quick-summary-value"><strong id="summary-routes">0</strong> <span>Buscar ruta</span></span>
              </button>
            </div>
          </dl>
        </section>

        <ol class="workflow-strip" aria-label="Flujo principal">
          <li>
            <span>1</span>
            <strong>Buscar</strong>
            <small>Ubicar ruta</small>
          </li>
          <li>
            <span>2</span>
            <strong>Registrar</strong>
            <small>Asignar espacio</small>
          </li>
          <li>
            <span>3</span>
            <strong>Gestionar</strong>
            <small>Editar estantes</small>
          </li>
        </ol>

        <p class="status-message" id="status-message" role="status" aria-live="polite" aria-atomic="true" data-testid="status-message" hidden>
          ${UI_COPY.status.initial}
        </p>

        <section class="form-card form-card--search" id="search-card" aria-labelledby="search-card-title" data-testid="search-card" hidden>
          <div class="form-card-head">
            <div class="form-card-head-copy">
              <strong id="search-card-title">${UI_COPY.search.title}</strong>
              <p>${UI_COPY.search.description}</p>
            </div>
            <div class="panel-head-actions">
              <button type="button" class="panel-minimize-btn" data-minimize-panel="search-card" aria-label="Minimizar buscador" title="Minimizar buscador">
                <span aria-hidden="true">−</span>
              </button>
              <button type="button" class="panel-minimize-btn" data-close-panel="search-card" aria-label="Cerrar buscador" title="Cerrar buscador">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
          <div class="form-card-body" id="search-card-body">
          <form class="search-form" id="search-form" aria-label="${UI_COPY.search.title}" data-testid="search-form">
            <label class="search-label">
              <span>${UI_COPY.search.label}</span>
              <div class="search-row">
		                <input name="searchSku" type="text" placeholder="SKU, nombre, categoria o marca" aria-describedby="search-result-shelf" data-testid="search-sku-input" />
                <button type="submit" class="icon-button" aria-label="${UI_COPY.search.buttonAriaLabel}" title="${UI_COPY.search.buttonAriaLabel}" data-testid="search-submit-btn">
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
	            <div class="catalog-filter-row" aria-label="Filtros de catalogo">
	              <label>
	                <span>Categoria</span>
	                <select id="search-category-filter" name="categoryFilter">
	                  <option value="">Todas</option>
	                </select>
	              </label>
	              <label>
	                <span>Marca</span>
	                <select id="search-brand-filter" name="brandFilter">
	                  <option value="">Todas</option>
	                </select>
	              </label>
	            </div>
	        </form>
        <div class="barcode-scanner" id="barcode-scanner" hidden>
          <video id="barcode-video" class="barcode-video" autoplay muted playsinline></video>
          <div class="barcode-frame" aria-hidden="true"></div>
        </div>
        </div>
        </section>

        <section class="floating-panel" id="shelf-manager-panel" hidden aria-hidden="true" aria-label="${UI_COPY.productForm.shelfManager.title}" data-testid="shelf-manager-panel">
          <div class="floating-panel-head">
            <div class="floating-panel-copy">
              <strong>${UI_COPY.productForm.shelfManager.title}</strong>
              ${UI_COPY.productForm.shelfManager.description ? `<p>${UI_COPY.productForm.shelfManager.description}</p>` : ""}
            </div>
            <div class="panel-head-actions">
              <button type="button" class="panel-minimize-btn" data-minimize-panel="shelf-manager-panel" aria-label="Minimizar gestor de estantes" title="Minimizar gestor de estantes">
                <span aria-hidden="true">−</span>
              </button>
              ${renderIconButton({
                id: "close-shelf-manager-btn",
                className: "icon-action-btn",
                label: UI_COPY.toggles.closeMenu,
                iconPath: ICON_PATHS.close,
                extraAttributes: 'data-panel-close="shelf-manager-panel"'
              })}
            </div>
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

          <section class="shelf-config">
            <div class="shelf-config-head">
              <strong>${UI_COPY.productForm.routeConfig.title}</strong>
              <span>${UI_COPY.productForm.routeConfig.description}</span>
            </div>
            <div class="shelf-config-row">
              <label>
                <span>${UI_COPY.productForm.routeConfig.entranceX}</span>
                <input id="warehouse-entrance-x" type="number" step="0.1" />
              </label>
              <label>
                <span>${UI_COPY.productForm.routeConfig.entranceZ}</span>
                <input id="warehouse-entrance-z" type="number" step="0.1" />
              </label>
            </div>
            <label class="manager-field">
              <span>${UI_COPY.productForm.routeConfig.aislesLabel}</span>
              <textarea id="warehouse-aisles-input" rows="5" spellcheck="false"></textarea>
            </label>
            <div class="shelf-config-actions">
              <button type="button" id="use-camera-entrance-btn" class="shelf-config-action-btn shelf-config-action-btn--soft">
                ${UI_COPY.productForm.routeConfig.useCameraBtn}
              </button>
              <button type="button" id="save-route-config-btn" class="shelf-config-action-btn">
                ${UI_COPY.productForm.routeConfig.saveBtn}
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
            <div class="panel-head-actions">
              <button type="button" class="panel-minimize-btn" data-minimize-panel="edit-panel" aria-label="Minimizar herramientas de edicion" title="Minimizar herramientas de edicion">
                <span aria-hidden="true">−</span>
              </button>
              ${renderIconButton({
                id: "close-edit-panel-btn",
                className: "icon-action-btn",
                label: UI_COPY.toggles.closeMenu,
                iconPath: ICON_PATHS.close,
                extraAttributes: 'data-panel-close="edit-panel"'
              })}
            </div>
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
          <div class="click-info-body">
            <strong id="click-info-sku"></strong>
            <span id="click-info-shelf"></span>
            <span id="click-info-dims"></span>
          </div>
          <button type="button" class="click-info-close" aria-label="Cerrar mensaje" title="Cerrar mensaje">
            ${renderIcon(ICON_PATHS.close)}
          </button>
        </div>

        <section class="form-card form-card--product" id="product-card" data-card data-collapsed="false" aria-labelledby="product-card-title" data-testid="product-card" hidden>
          <div class="form-card-head form-card-head--split">
            <div class="form-card-head-copy">
              <strong id="product-card-title">${UI_COPY.productForm.title}</strong>
              <p>${UI_COPY.productForm.description}</p>
            </div>
            <div class="panel-head-actions">
              <button type="button" class="panel-minimize-btn" data-minimize-panel="product-card" aria-label="Minimizar registro de producto" title="Minimizar registro de producto">
                <span aria-hidden="true">−</span>
              </button>
              <button type="button" class="panel-minimize-btn" data-close-panel="product-card" aria-label="Cerrar registro de producto" title="Cerrar registro de producto">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
          <div class="form-card-body" id="product-card-body" data-card-body>
          <form class="product-form" id="product-form" aria-label="${UI_COPY.productForm.title}" data-testid="product-form">
            <div class="form-step">
              <span>1</span>
              <strong>Ubicacion</strong>
            </div>
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
            <div class="form-step">
              <span>2</span>
              <strong>Identificacion</strong>
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
		            <div class="field-row">
		              <label>
		                <span>Categoria</span>
			                <input name="category" type="text" list="category-options" placeholder="Ej. Ferreteria" data-testid="product-category-input" />
		              </label>
		              <label>
		                <span>Marca</span>
			                <input name="brand" type="text" list="brand-options" placeholder="Ej. Generica" data-testid="product-brand-input" />
		              </label>
		              <label>
		                <span>Imagen del producto</span>
			                <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-testid="product-image-input" />
		              </label>
		            </div>

	            <section class="dimension-group">
              <div class="dimension-group-head">
                <div class="form-step form-step--inline">
                  <span>3</span>
                  <strong>${UI_COPY.productForm.steps.measures}</strong>
                </div>
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

        <section class="product-editor" id="product-editor" aria-labelledby="product-editor-title" data-testid="product-editor" data-minimized="false" hidden>
          <div class="panel-titlebar">
            <strong id="product-editor-title">${UI_COPY.productEditor.title}</strong>
            <div class="panel-head-actions">
              <button type="button" class="panel-minimize-btn" data-minimize-panel="product-editor" aria-label="Minimizar editor" title="Minimizar editor">
                <span aria-hidden="true">−</span>
              </button>
              <button type="button" class="panel-minimize-btn" data-close-panel="product-editor" aria-label="Cerrar editor" title="Cerrar editor">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
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
	                <span>Categoria</span>
		                <input id="editor-category" type="text" list="category-options" placeholder="Ej. Ferreteria" />
	              </label>
		              <label>
		                <span>Marca</span>
			                <input id="editor-brand" type="text" list="brand-options" placeholder="Ej. Generica" />
		              </label>
		              <label>
		                <span>Imagen del producto</span>
				                <input id="editor-image-url" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
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

	        <section class="auth-panel" id="auth-panel" hidden aria-label="Sesion de usuario">
          <form id="auth-form" class="auth-form">
            <input id="auth-name" name="name" type="hidden" value="Admin Almacén" />
            <label>
              <span>Correo</span>
              <input id="auth-email" name="email" type="email" value="admin@almacen.local" maxlength="180" required />
            </label>
            <label>
              <span>Contraseña</span>
              <input id="auth-password" name="password" type="password" autocomplete="current-password" required />
            </label>
            <button type="submit">Iniciar sesión</button>
          </form>
	          <form id="profile-form" class="profile-form" hidden>
	            <div class="profile-head">
	              <span id="profile-avatar" aria-hidden="true">AD</span>
	              <div>
	                <strong>Mi perfil</strong>
	                <small>Datos de la cuenta activa</small>
	              </div>
                <button type="button" class="panel-minimize-btn" data-close-panel="auth-panel" aria-label="Cerrar mi perfil" title="Cerrar mi perfil">
                  <span aria-hidden="true">×</span>
                </button>
	            </div>
              <dl class="profile-account-summary" aria-label="Resumen de cuenta">
                <div>
                  <dt>Rol</dt>
                  <dd id="profile-role">-</dd>
                </div>
                <div>
                  <dt>ID usuario</dt>
                  <dd id="profile-user-id">-</dd>
                </div>
                <div>
                  <dt>Sesión activa hasta</dt>
                  <dd id="profile-session-expiry">-</dd>
                </div>
              </dl>
	            <label>
	              <span>Nombre</span>
	              <input id="profile-name" name="name" type="text" maxlength="120" required />
            </label>
            <label>
              <span>Correo</span>
              <input id="profile-email" name="email" type="email" maxlength="180" required />
            </label>
            <div class="profile-password-grid">
              <label>
                <span>Contraseña actual</span>
                <input id="profile-current-password" name="currentPassword" type="password" autocomplete="current-password" />
              </label>
	              <label>
	                <span>Nueva contraseña</span>
	                <input id="profile-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="6" />
	              </label>
                <label>
                  <span>Confirmar nueva contraseña</span>
                  <input id="profile-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" />
                </label>
	            </div>
              <p class="profile-help">Para cambiar correo o contraseña, ingresa tu contraseña actual.</p>
	            <p id="profile-status" class="profile-status" aria-live="polite" hidden></p>
              <div class="profile-actions">
	              <button type="submit">Guardar perfil</button>
                <button type="button" id="profile-reset-btn" class="profile-reset-btn">Restaurar cambios</button>
              </div>
	          </form>
          <button type="button" id="auth-logout-btn" class="auth-logout-btn">Cerrar sesión</button>
        </section>

		      </aside>
	      <div class="search-result search-result--modal" id="search-result" aria-live="polite" data-testid="search-result" data-minimized="false" hidden>
	        <section class="search-result-panel" aria-label="Reporte de productos encontrados">
		          <div class="search-result-head" title="Arrastrar mensaje">
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
	          <strong>Producto ubicado</strong>
	          <span id="search-result-minimized-summary"></span>
	        </button>
	      </div>
		      <main class="viewport" data-testid="viewport">
        <header class="top-commandbar" aria-label="Cabecera del panel">
          <div class="breadcrumb">
            <span>Inicio</span>
            <b>/</b>
            <strong>Panel de navegación 3D</strong>
          </div>
	          <label class="global-search">
	            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" fill="currentColor"/></svg>
	            <input type="text" placeholder="Buscar SKU, producto o ubicación..." aria-label="Buscar SKU, producto o ubicación" />
	            <button type="button" id="global-clear-search-btn" aria-label="Cancelar búsqueda" title="Cancelar búsqueda">×</button>
	          </label>
          <div class="top-actions">
            <button type="button" data-legend-toggle aria-controls="legend" aria-expanded="false" title="${UI_COPY.buttons.showLegend}">
              ${renderIcon(ICON_PATHS.layers)}
              <span>Ver leyenda</span>
            </button>
            <button type="button" data-panel-toggle="edit-panel">
              ${renderIcon(ICON_PATHS.edit)}
              <span>Modo edición</span>
            </button>
	            <button type="button" class="top-register" data-product-toggle>
	              <span aria-hidden="true">+</span>
	              Registrar producto
	            </button>
            <button type="button" class="admin-card" id="admin-card-btn" aria-label="Abrir mi perfil" title="Abrir mi perfil">
              <span id="admin-initials">AD</span>
              <div class="admin-card-copy">
                <strong id="admin-name">Admin Almacén</strong>
                <small id="admin-role">Administrador</small>
              </div>
            </button>
	          </div>
        </header>
	        <canvas class="scene-canvas" aria-label="Vista 3D del almacen" data-testid="scene-canvas"></canvas>
        <section class="selected-product-panel" id="selected-product-panel" aria-live="polite" hidden>
	          <div class="selected-product-head">
	            <strong>Producto seleccionado</strong>
	            <div class="selected-product-head-actions">
	              <span id="selected-product-status">Disponible</span>
                <div class="panel-head-actions">
	                <button type="button" class="panel-minimize-btn" data-minimize-panel="selected-product-panel" aria-label="Minimizar producto seleccionado" title="Minimizar producto seleccionado">
	                  <span aria-hidden="true">−</span>
	                </button>
	                <button type="button" class="panel-minimize-btn" data-close-panel="selected-product-panel" aria-label="Cerrar producto seleccionado" title="Cerrar producto seleccionado">
	                  <span aria-hidden="true">×</span>
	                </button>
                </div>
	            </div>
	          </div>
          <div class="selected-product-main">
            <div class="selected-product-thumb" id="selected-product-image">Sin imagen</div>
            <div>
              <h2 id="selected-product-name">Producto</h2>
              <p id="selected-product-sku">SKU: -</p>
            </div>
          </div>
          <div class="selected-product-location">
            <span>Ubicación exacta</span>
            <strong id="selected-product-location">-</strong>
          </div>
          <dl class="selected-product-metrics">
            <div>
              <dt>Medidas</dt>
              <dd id="selected-product-dimensions">-</dd>
            </div>
            <div>
              <dt>Stock</dt>
              <dd id="selected-product-stock">-</dd>
            </div>
            <div>
              <dt>Categoría / marca</dt>
              <dd id="selected-product-category">-</dd>
            </div>
          </dl>
          <div class="selected-product-actions">
            <button type="button" id="selected-product-edit-btn">Editar producto</button>
            <button type="button" id="selected-product-history-btn">Ver historial</button>
          </div>
        </section>
        <div class="viewport-tools" aria-label="Controles de vista">
          <button type="button" id="reset-camera-btn" aria-label="Restablecer cámara" title="Restablecer cámara">↻</button>
          <button type="button" id="focus-selected-btn" aria-label="Enfocar producto seleccionado" title="Enfocar producto seleccionado">⌖</button>
          <button type="button" id="camera-mode-btn" aria-label="Cambiar vista 3D/superior" title="Cambiar vista 3D/superior">3D</button>
          <button type="button" id="zoom-in-btn" aria-label="Acercar" title="Acercar">+</button>
          <button type="button" id="zoom-out-btn" aria-label="Alejar" title="Alejar">−</button>
          <button type="button" id="fullscreen-btn" aria-label="Pantalla completa" title="Pantalla completa">⛶</button>
        </div>
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
	      <datalist id="category-options"></datalist>
	      <datalist id="brand-options"></datalist>
	    </section>
  `;
}

export function buildHtml(container: HTMLElement): HudRefs {
  container.innerHTML = buildHudTemplate();
  relocateViewportPanels(container);
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
  const editorCategory = container.querySelector<HTMLInputElement>("#editor-category");
  const editorBrand = container.querySelector<HTMLInputElement>("#editor-brand");
  const editorImageUrl = container.querySelector<HTMLInputElement>("#editor-image-url");
  const editorWidth = container.querySelector<HTMLInputElement>("#editor-width");
  const editorHeight = container.querySelector<HTMLInputElement>("#editor-height");
  const editorDepth = container.querySelector<HTMLInputElement>("#editor-depth");
  const clickInfo = container.querySelector<HTMLDivElement>("#click-info");
  const clickInfoSku = container.querySelector<HTMLElement>("#click-info-sku");
  const clickInfoShelf = container.querySelector<HTMLElement>("#click-info-shelf");
  const clickInfoDims = container.querySelector<HTMLElement>("#click-info-dims");
  const editShelvesBtn = container.querySelector<HTMLButtonElement>("#edit-shelves-btn");
  const summaryProducts = container.querySelector<HTMLElement>("#summary-products");
  const summaryShelves = container.querySelector<HTMLElement>("#summary-shelves");
  const summaryRoutes = container.querySelector<HTMLElement>("#summary-routes");
  const adminInitials = container.querySelector<HTMLElement>("#admin-initials");
  const adminName = container.querySelector<HTMLElement>("#admin-name");
  const adminRole = container.querySelector<HTMLElement>("#admin-role");
  const selectedProductPanel = container.querySelector<HTMLElement>("#selected-product-panel");
  const selectedProductStatus = container.querySelector<HTMLElement>("#selected-product-status");
  const selectedProductName = container.querySelector<HTMLElement>("#selected-product-name");
  const selectedProductSku = container.querySelector<HTMLElement>("#selected-product-sku");
  const selectedProductImage = container.querySelector<HTMLElement>("#selected-product-image");
  const selectedProductLocation = container.querySelector<HTMLElement>("#selected-product-location");
  const selectedProductDimensions = container.querySelector<HTMLElement>("#selected-product-dimensions");
  const selectedProductStock = container.querySelector<HTMLElement>("#selected-product-stock");
  const selectedProductCategory = container.querySelector<HTMLElement>("#selected-product-category");
  const selectedProductHistoryBtn = container.querySelector<HTMLButtonElement>("#selected-product-history-btn");
  const selectedProductEditBtn = container.querySelector<HTMLButtonElement>("#selected-product-edit-btn");
  const resetCameraBtn = container.querySelector<HTMLButtonElement>("#reset-camera-btn");
  const focusSelectedBtn = container.querySelector<HTMLButtonElement>("#focus-selected-btn");
  const cameraModeBtn = container.querySelector<HTMLButtonElement>("#camera-mode-btn");
  const zoomInBtn = container.querySelector<HTMLButtonElement>("#zoom-in-btn");
  const zoomOutBtn = container.querySelector<HTMLButtonElement>("#zoom-out-btn");
  const fullscreenBtn = container.querySelector<HTMLButtonElement>("#fullscreen-btn");
  const authPanel = container.querySelector<HTMLElement>("#auth-panel");
  const authForm = container.querySelector<HTMLFormElement>("#auth-form");
  const authName = container.querySelector<HTMLInputElement>("#auth-name");
  const authEmail = container.querySelector<HTMLInputElement>("#auth-email");
  const authPassword = container.querySelector<HTMLInputElement>("#auth-password");
  const authLogoutBtn = container.querySelector<HTMLButtonElement>("#auth-logout-btn");
  const profileForm = container.querySelector<HTMLFormElement>("#profile-form");
  const profileName = container.querySelector<HTMLInputElement>("#profile-name");
  const profileEmail = container.querySelector<HTMLInputElement>("#profile-email");
  const profileCurrentPassword = container.querySelector<HTMLInputElement>("#profile-current-password");
  const profileNewPassword = container.querySelector<HTMLInputElement>("#profile-new-password");
  const profileConfirmPassword = container.querySelector<HTMLInputElement>("#profile-confirm-password");
  const profileRole = container.querySelector<HTMLElement>("#profile-role");
  const profileUserId = container.querySelector<HTMLElement>("#profile-user-id");
  const profileSessionExpiry = container.querySelector<HTMLElement>("#profile-session-expiry");
  const profileResetBtn = container.querySelector<HTMLButtonElement>("#profile-reset-btn");
  const profileStatus = container.querySelector<HTMLParagraphElement>("#profile-status");

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
    !editorCategory ||
    !editorBrand ||
    !editorImageUrl ||
    !editorWidth ||
    !editorHeight ||
    !editorDepth ||
    !clickInfo ||
    !clickInfoSku ||
    !clickInfoShelf ||
    !clickInfoDims ||
    !editShelvesBtn ||
    !summaryProducts ||
    !summaryShelves ||
    !summaryRoutes ||
    !adminInitials ||
    !adminName ||
    !adminRole ||
    !selectedProductPanel ||
    !selectedProductStatus ||
    !selectedProductName ||
    !selectedProductSku ||
    !selectedProductImage ||
    !selectedProductLocation ||
    !selectedProductDimensions ||
    !selectedProductStock ||
    !selectedProductCategory ||
    !selectedProductHistoryBtn ||
    !selectedProductEditBtn ||
    !resetCameraBtn ||
    !focusSelectedBtn ||
    !cameraModeBtn ||
    !zoomInBtn ||
    !zoomOutBtn ||
    !fullscreenBtn ||
    !authPanel ||
    !authForm ||
    !authName ||
    !authEmail ||
    !authPassword ||
    !authLogoutBtn ||
    !profileForm ||
    !profileName ||
    !profileEmail ||
    !profileCurrentPassword ||
    !profileNewPassword ||
    !profileConfirmPassword ||
    !profileRole ||
    !profileUserId ||
    !profileSessionExpiry ||
    !profileResetBtn ||
    !profileStatus
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
    editorCategory,
    editorBrand,
    editorImageUrl,
    editorWidth,
    editorHeight,
    editorDepth,
    clickInfo,
    clickInfoSku,
    clickInfoShelf,
    clickInfoDims,
    editShelvesBtn,
    summaryProducts,
    summaryShelves,
    summaryRoutes,
    adminInitials,
    adminName,
    adminRole,
    selectedProductPanel,
    selectedProductStatus,
    selectedProductName,
    selectedProductSku,
    selectedProductImage,
    selectedProductLocation,
    selectedProductDimensions,
    selectedProductStock,
    selectedProductCategory,
    selectedProductHistoryBtn,
    selectedProductEditBtn,
    resetCameraBtn,
    focusSelectedBtn,
    cameraModeBtn,
    zoomInBtn,
    zoomOutBtn,
    fullscreenBtn,
    authPanel,
    authForm,
    authName,
    authEmail,
    authPassword,
    authLogoutBtn,
    profileForm,
    profileName,
    profileEmail,
    profileCurrentPassword,
    profileNewPassword,
    profileConfirmPassword,
    profileRole,
    profileUserId,
    profileSessionExpiry,
    profileResetBtn,
    profileStatus
  };
}

function relocateViewportPanels(container: HTMLElement): void {
  const appShell = container.querySelector<HTMLElement>(".app-shell");
  const viewport = container.querySelector<HTMLElement>(".viewport");
  if (!viewport) return;

  [
    "#status-message",
    "#search-card",
    "#shelf-manager-panel",
    "#edit-panel",
    "#click-info",
    "#product-card",
    "#product-editor",
    "#search-result"
  ].forEach((selector) => {
    const element = container.querySelector<HTMLElement>(selector);
    if (element && element.parentElement !== viewport) {
      viewport.append(element);
    }
  });

  const authPanel = container.querySelector<HTMLElement>("#auth-panel");
  if (appShell && authPanel && authPanel.parentElement !== appShell) {
    appShell.append(authPanel);
  }
}
