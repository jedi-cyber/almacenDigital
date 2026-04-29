import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { HudRefs } from "./ui-builder.js";
import { buildHtml } from "./ui-builder.js";
import { calcShelfStatus } from "./shelfStatus.js";
import {
  addShelfBoard,
  collectBoardOffsets,
  flashShelfMesh,
  focusOnProductFromAisle,
  getInstanceWorldPosition,
  pickProduct,
  refreshShelfSections,
  removeShelfBoardAtSection,
  resizeShelfMesh,
  SHELF_PALETTE,
  updateShelfSectionPreview
} from "./three-helpers.js";
import type { Item, Shelf, WarehouseConfig } from "./types.js";
import {
  getDeleteSuccessMessage,
  getDuplicateSkuMessage,
  getMoveReadyMessage,
  getNoSpaceMessage,
  getPlacementSuccessMessage,
  getProductName,
  getSearchNotFoundMessage,
  getSearchShelfMissingMessage,
  getSearchSuccessMessage,
  getSectionNameUpdatedMessage,
  getShelfNameUpdatedMessage,
  getShelfSectionUpdatedMessage,
  getTransferNoSpaceMessage,
  getTransferSuccessMessage,
  UI_COPY
} from "./ui-copy.js";
import { populateShelves, setStatus, updateLegendCount } from "./ui-handlers.js";
import { type WarehouseRuntime, clearHighlight, highlightProduct, placeItem, removeItem, transferItem, updateItemDimensions } from "./warehouse.js";
import type { ProductEntry } from "./warehouse.js";
import { canPlace } from "./canPlace.js";

export { buildHtml, populateShelves, setStatus, updateLegendCount };
export type { HudRefs };

export interface ProductFormDeps {
  config: WarehouseConfig;
  form: HTMLFormElement;
  runtime: WarehouseRuntime;
  scene: THREE.Scene;
  shelfMeshes: Map<string, THREE.Mesh>;
  statusMessage: HTMLParagraphElement;
  shelfDimensions: HTMLParagraphElement;
  selectedShelfDisplay: HTMLParagraphElement;
  shelfTotal: HTMLSpanElement;
  shelfOccupied: HTMLSpanElement;
  shelfFree: HTMLSpanElement;
  onShelfLabelUpdated?: (shelfId: string, shelf: Shelf) => void;
  onShelfUpdated?: () => void;
  onShelfResized?: (shelfId: string, shelf: Shelf) => void;
}

export interface SearchFormDeps {
  searchForm: HTMLFormElement;
  runtime: WarehouseRuntime;
  shelfMeshes: Map<string, THREE.Mesh>;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  statusMessage: HTMLParagraphElement;
  config: WarehouseConfig;
  scene: THREE.Scene;
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
  onMoveRequested: (sku: string) => void;
  onProductRemoved: (shelfId: string) => void;
  onProductLocated?: (worldPos: THREE.Vector3, shelfMesh: THREE.Mesh) => void;
  onSearchCleared?: () => void;
}

export interface SceneClickDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  runtime: WarehouseRuntime;
  config: WarehouseConfig;
  clickInfo: HTMLDivElement;
  clickInfoSku: HTMLElement;
  clickInfoShelf: HTMLElement;
  clickInfoDims: HTMLElement;
  isSuppressed?: () => boolean;
  onProductSelected?: (sku: string) => void;
  onSelectionCleared?: () => void;
}


export function wireProductForm(params: ProductFormDeps): { refreshShelfSummary: (shelfId: string) => void; handleRemoveBoard: () => void } {
  const {
    config,
    form,
    runtime,
    scene,
    shelfMeshes,
    statusMessage,
    shelfDimensions,
    selectedShelfDisplay,
    shelfTotal,
    shelfOccupied,
    shelfFree,
    onShelfLabelUpdated,
    onShelfUpdated,
    onShelfResized
  } = params;

  const getShelfColor = (shelfId: string) => {
    const idx = config.shelves.findIndex((s) => s.id === shelfId);
    return SHELF_PALETTE[(idx >= 0 ? idx : 0) % SHELF_PALETTE.length];
  };

  const widthField = getNumberInput(form, "width");
  const heightField = getNumberInput(form, "height");
  const depthField = getNumberInput(form, "depth");
  const shelfField = form.elements.namedItem("shelfId");
  const sectionField = form.elements.namedItem("section");
  const productShelfField = form.querySelector<HTMLSelectElement>("#product-shelf-select");
  const productSectionField = form.querySelector<HTMLSelectElement>("#product-section-select");
  const sectionsField = getNumberInput(form, "shelfSections");
  const updateShelfSectionsBtn = document.querySelector<HTMLButtonElement>("#update-shelf-sections-btn");
  const addBoardBtn = document.querySelector<HTMLButtonElement>("#add-board-btn");
  const removeBoardSectionSelect = document.querySelector<HTMLSelectElement>("#remove-board-section-select");
  const shelfWidthInput = document.querySelector<HTMLInputElement>("#shelf-width-input");
  const shelfHeightInput = document.querySelector<HTMLInputElement>("#shelf-height-input");
  const shelfDepthInput = document.querySelector<HTMLInputElement>("#shelf-depth-input");
  const updateShelfSizeBtn = document.querySelector<HTMLButtonElement>("#update-shelf-size-btn");
  const shelfLabelInput = document.querySelector<HTMLInputElement>("#shelf-label-input");
  const updateShelfLabelBtn = document.querySelector<HTMLButtonElement>("#update-shelf-label-btn");
  const sectionLabelInput = document.querySelector<HTMLInputElement>("#section-label-input");
  const updateSectionLabelBtn = document.querySelector<HTMLButtonElement>("#update-section-label-btn");
  const dimensionHint = form.querySelector<HTMLDivElement>("#dimension-hint");

  attachMaxClamp(widthField);
  attachMaxClamp(heightField);
  attachMaxClamp(depthField);

  // ── Ghost product preview ─────────────────────────────────────────────────
  let ghostMesh: THREE.Mesh | null = null;

  const removeGhost = () => {
    if (!ghostMesh) return;
    scene.remove(ghostMesh);
    (ghostMesh.geometry as THREE.BufferGeometry).dispose();
    (ghostMesh.material as THREE.Material).dispose();
    ghostMesh.children.forEach((c) => {
      (c as THREE.LineSegments).geometry.dispose();
      ((c as THREE.LineSegments).material as THREE.Material).dispose();
    });
    ghostMesh = null;
  };

  const createOrUpdateGhost = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((s) => s.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    const w = Number(widthField.value);
    const h = Number(heightField.value);
    const d = Number(depthField.value);
    const preferredSection = sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1;

    removeGhost();

    if (!shelf || !shelfMesh || !(w > 0) || !(h > 0) || !(d > 0)) return;

    const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
    const tempItem: Item = { sku: "__ghost__", name: "", width: w, height: h, depth: d };
    const placement = canPlace(shelf, placedItems, tempItem, { preferredSection });

    if (!placement) return;

    const geo = shelfMesh.geometry as THREE.BoxGeometry;
    const p = geo.parameters;
    const localPoint = new THREE.Vector3(
      -p.width / 2 + placement.localPosition.x + placement.item.width / 2,
      -p.height / 2 + placement.localPosition.y + placement.item.height / 2,
      -p.depth / 2 + placement.localPosition.z + placement.item.depth / 2
    );
    shelfMesh.updateWorldMatrix(true, false);
    const worldPos = shelfMesh.localToWorld(localPoint);

    const boxGeo = new THREE.BoxGeometry(placement.item.width, placement.item.height, placement.item.depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    ghostMesh = new THREE.Mesh(boxGeo, mat);
    ghostMesh.position.copy(worldPos);
    ghostMesh.quaternion.copy(shelfMesh.quaternion);

    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x1166cc });
    const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
    ghostMesh.add(wireframe);

    scene.add(ghostMesh);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const refreshShelfSummary = (shelfId: string) => {
    const shelf = config.shelves.find((s) => s.id === shelfId);
    if (!shelf) return;
    const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
    ensureSectionLabels(shelf);
    const sectionHeight = shelf.height / sections;
    const shelfMesh = shelfMeshes.get(shelfId);
    const shelfLabel = shelf.label ?? shelf.id;

    const status = calcShelfStatus(shelf, runtime.productsByShelf.get(shelfId) ?? []);

    shelfDimensions.textContent =
      `Pisos ${sections} | Ancho ${shelf.width} | Alto ${shelf.height} | Profundidad ${shelf.depth}`;
    selectedShelfDisplay.textContent = `${UI_COPY.productForm.selectedShelfLabel}: ${shelf.id} · ${shelfLabel}`;
    shelfTotal.textContent = `Volumen total: ${formatMetric(status.total)}`;
    shelfOccupied.textContent = `Ocupado: ${formatMetric(status.occupied)}`;
    shelfFree.textContent = `Libre: ${formatMetric(status.free)}`;

    widthField.max = String(shelf.width);
    heightField.max = String(shelf.height);
    depthField.max = String(shelf.depth);
    sectionsField.value = String(sections);

    if (shelfWidthInput) shelfWidthInput.value = String(shelf.width);
    if (shelfHeightInput) shelfHeightInput.value = String(shelf.height);
    if (shelfDepthInput) shelfDepthInput.value = String(shelf.depth);
    if (shelfLabelInput) shelfLabelInput.value = shelfLabel;
    if (sectionLabelInput) {
      const activeSection = sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1;
      sectionLabelInput.value = getSectionLabel(shelf, activeSection);
    }

    widthField.placeholder = `Max ${formatInputValue(shelf.width)}`;
    heightField.placeholder = `Max ${formatInputValue(sectionHeight)}`;
    depthField.placeholder = `Max ${formatInputValue(shelf.depth)}`;

    widthField.value = clampInputValue(widthField.value, shelf.width);
    heightField.value = clampInputValue(heightField.value, sectionHeight);
    depthField.value = clampInputValue(depthField.value, shelf.depth);

    heightField.max = String(sectionHeight);

    if (sectionField instanceof HTMLSelectElement) {
      const previousValue = Number(sectionField.value || "1");
      const clampedValue = String(Math.min(Math.max(previousValue, 1), sections));
      const selects = [sectionField, productSectionField, removeBoardSectionSelect].filter((s): s is HTMLSelectElement => s != null);
      for (const select of selects) {
        select.replaceChildren();
        for (let section = 1; section <= sections; section += 1) {
          const option = document.createElement("option");
          option.value = String(section);
          option.textContent = getSectionLabel(shelf, section);
          select.append(option);
        }
        select.value = clampedValue;
      }
    }

    if (productShelfField) {
      if (productShelfField.options.length === 0) {
        config.shelves.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.id;
          option.textContent = `${entry.id} · ${entry.label}`;
          productShelfField.append(option);
        });
      }
      productShelfField.value = shelf.id;
    }

    if (dimensionHint) {
      const activeSection = sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1;
      dimensionHint.textContent =
        `${getSectionLabel(shelf, activeSection)} seleccionado. Maximo: ${formatInputValue(shelf.width)} x ${formatInputValue(sectionHeight)} x ${formatInputValue(shelf.depth)} m.`;
    }

    if (shelfMesh) {
      updateShelfSectionPreview(
        shelfMesh,
        sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1
      );
    }

    createOrUpdateGhost();
  };

  refreshShelfSummary(config.shelves[0]?.id ?? "");

  const handleShelfChange = () => {
    if (!(shelfField instanceof HTMLSelectElement)) return;
    if (productShelfField) {
      productShelfField.value = shelfField.value;
    }
    refreshShelfSummary(shelfField.value);
  };

  const handleProductShelfChange = () => {
    if (!(shelfField instanceof HTMLSelectElement) || !productShelfField) return;
    shelfField.value = productShelfField.value;
    refreshShelfSummary(productShelfField.value);
  };

  const handleSectionChange = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    if (productSectionField && sectionField instanceof HTMLSelectElement) {
      productSectionField.value = sectionField.value;
    }
    refreshShelfSummary(shelfId);
  };

  const handleProductSectionChange = () => {
    if (!productSectionField || !(sectionField instanceof HTMLSelectElement)) return;
    sectionField.value = productSectionField.value;
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    refreshShelfSummary(shelfId);
  };

  const handleUpdateShelfSections = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelf || !shelfMesh) {
      setStatus(statusMessage, UI_COPY.status.shelfNotFound, true);
      return;
    }

    const nextSections = Math.max(1, Math.floor(Number(sectionsField.value)));
    shelf.sections = nextSections;
    ensureSectionLabels(shelf);
    const shelfColor = getShelfColor(shelfId);

    // Al fijar secciones manualmente, descartar posiciones personalizadas
    shelf.boardOffsets = undefined;
    refreshShelfSections(shelfMesh, shelf, shelfColor);
    refreshShelfSummary(shelfId);
    onShelfUpdated?.();
    setStatus(statusMessage, getShelfSectionUpdatedMessage(shelf.id, nextSections), false);
  };

  const handleAddBoard = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelf || !shelfMesh) return;

    const color = getShelfColor(shelfId);

    // Insertar en el centro del espacio libre más grande entre pisos existentes
    const offsets = [0, ...(shelf.boardOffsets ?? Array.from(
      { length: Math.max(0, (shelf.sections ?? 1) - 1) },
      (_, i) => (i + 1) / (shelf.sections ?? 1)
    )), 1].sort((a, b) => a - b);

    let bestFraction = 0.5;
    let bestGap = 0;
    for (let i = 0; i < offsets.length - 1; i++) {
      const gap = offsets[i + 1] - offsets[i];
      if (gap > bestGap) { bestGap = gap; bestFraction = (offsets[i] + offsets[i + 1]) / 2; }
    }

    addShelfBoard(shelfMesh, shelf, color, bestFraction);
    shelf.sections = (shelf.sections ?? 1) + 1;
    ensureSectionLabels(shelf);
    shelf.boardOffsets = collectBoardOffsets(shelfMesh, shelf.height);
    refreshShelfSummary(shelfId);
    onShelfUpdated?.();
  };

  const handleUpdateShelfSize = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelf || !shelfMesh || !shelfWidthInput || !shelfHeightInput || !shelfDepthInput) return;

    const newWidth = parseFloat(shelfWidthInput.value);
    const newHeight = parseFloat(shelfHeightInput.value);
    const newDepth = parseFloat(shelfDepthInput.value);

    if (isNaN(newWidth) || isNaN(newHeight) || isNaN(newDepth) ||
        newWidth < 0.5 || newHeight < 0.5 || newDepth < 0.5) return;

    shelf.width = newWidth;
    shelf.height = newHeight;
    shelf.depth = newDepth;

    // Mantener el fondo del estante en Y=0 (posición.y = altura/2).
    shelf.position.y = newHeight / 2;
    shelfMesh.position.y = newHeight / 2;

    const shelfColor = getShelfColor(shelfId);

    resizeShelfMesh(shelfMesh, shelf, shelfColor);
    refreshShelfSummary(shelfId);
    onShelfResized?.(shelfId, shelf);
    onShelfUpdated?.();
  };

  const refreshShelfOptionLabels = () => {
    const selects = [shelfField, productShelfField].filter((select): select is HTMLSelectElement => select instanceof HTMLSelectElement);
    for (const select of selects) {
      for (const option of Array.from(select.options)) {
        const shelf = config.shelves.find((entry) => entry.id === option.value);
        if (shelf) option.textContent = `${shelf.id} · ${shelf.label}`;
      }
    }
  };

  const handleUpdateShelfLabel = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const nextLabel = shelfLabelInput?.value.trim() ?? "";

    if (!shelf || nextLabel === "") {
      setStatus(statusMessage, UI_COPY.status.invalidShelfName, true);
      return;
    }

    shelf.label = nextLabel;
    refreshShelfOptionLabels();
    refreshShelfSummary(shelfId);
    onShelfLabelUpdated?.(shelfId, shelf);
    onShelfUpdated?.();
    setStatus(statusMessage, getShelfNameUpdatedMessage(shelf.id, shelf.label), false);
  };

  const handleUpdateSectionLabel = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const section = sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1;
    const nextLabel = sectionLabelInput?.value.trim() ?? "";

    if (!shelf || nextLabel === "") {
      setStatus(statusMessage, UI_COPY.status.invalidSectionName, true);
      return;
    }

    ensureSectionLabels(shelf);
    shelf.sectionLabels![section - 1] = nextLabel;
    refreshShelfSummary(shelfId);
    onShelfUpdated?.();
    setStatus(statusMessage, getSectionNameUpdatedMessage(shelf.id, section, nextLabel), false);
  };

  const handleRemoveBoard = () => {
    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelf || !shelfMesh) return;

    const selectedSection = removeBoardSectionSelect ? Number(removeBoardSectionSelect.value || "1") : (sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1);
    const removed = removeShelfBoardAtSection(shelfMesh, selectedSection);

    if (removed) {
      shelf.sections = Math.max(1, (shelf.sections ?? 1) - 1);
      if (Array.isArray(shelf.sectionLabels)) {
        shelf.sectionLabels.splice(Math.max(0, selectedSection - 1), 1);
      }
      ensureSectionLabels(shelf);
      shelf.boardOffsets = collectBoardOffsets(shelfMesh, shelf.height);
      if (shelf.boardOffsets.length === 0) shelf.boardOffsets = undefined;
      refreshShelfSummary(shelfId);
      onShelfUpdated?.();
    }
  };

  const handleProductFormSubmit = (event: SubmitEvent) => {
    event.preventDefault();

    const data = new FormData(form);
    const shelfId = String(data.get("shelfId") ?? "");
    const sku = String(data.get("sku") ?? "").trim();
    const productName = String(data.get("productName") ?? "").trim() || getProductName(sku);
    const preferredSection = Number(data.get("section") ?? "1");
    const width = Number(data.get("width"));
    const height = Number(data.get("height"));
    const depth = Number(data.get("depth"));

    const shelf = config.shelves.find((s) => s.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);

    if (!shelf || !shelfMesh) {
      setStatus(statusMessage, UI_COPY.status.shelfNotFound, true);
      return;
    }

    if (!sku || width <= 0 || height <= 0 || depth <= 0) {
      setStatus(statusMessage, UI_COPY.status.invalidProductForm, true);
      return;
    }

    if (runtime.productEntryBySku.has(sku)) {
      setStatus(statusMessage, getDuplicateSkuMessage(sku), true);
      return;
    }

    const item: Item = { sku, name: productName, width, height, depth };
    const placement = placeItem(runtime, scene, item, shelf, shelfMesh, preferredSection);

    if (!placement) {
      setStatus(statusMessage, getNoSpaceMessage(sku, shelf.id, preferredSection), true);
      return;
    }

    const count = runtime.productsByShelf.get(shelfId)?.length ?? 0;
    updateLegendCount(shelfId, count);
    refreshShelfSummary(shelfId);
    flashShelfMesh(shelfMesh);
    setStatus(statusMessage, getPlacementSuccessMessage(sku, shelf.id, placement.localPosition, preferredSection), false);

    removeGhost();
    form.reset();
    if (shelfField instanceof HTMLSelectElement) {
      shelfField.value = shelfId;
    }
    refreshShelfSummary(shelfId);
  };

  if (shelfField instanceof HTMLSelectElement) {
    shelfField.addEventListener("change", handleShelfChange);
  }

  productShelfField?.addEventListener("change", handleProductShelfChange);
  productSectionField?.addEventListener("change", handleProductSectionChange);

  if (sectionField instanceof HTMLSelectElement) {
    sectionField.addEventListener("change", handleSectionChange);
  }

  widthField.addEventListener("input", createOrUpdateGhost);
  heightField.addEventListener("input", createOrUpdateGhost);
  depthField.addEventListener("input", createOrUpdateGhost);

  // Eliminar el fantasma cuando el card del formulario se cierra.
  const productCard = form.closest<HTMLElement>("[data-card]");
  if (productCard) {
    new MutationObserver(() => {
      if (productCard.dataset.collapsed === "true") removeGhost();
    }).observe(productCard, { attributes: true, attributeFilter: ["data-collapsed"] });
  }

  updateShelfSectionsBtn?.addEventListener("click", handleUpdateShelfSections);
  addBoardBtn?.addEventListener("click", handleAddBoard);
  updateShelfSizeBtn?.addEventListener("click", handleUpdateShelfSize);
  updateShelfLabelBtn?.addEventListener("click", handleUpdateShelfLabel);
  updateSectionLabelBtn?.addEventListener("click", handleUpdateSectionLabel);

  form.addEventListener("submit", handleProductFormSubmit);

  return { refreshShelfSummary, handleRemoveBoard };
}

export function wireSearchForm(params: SearchFormDeps): (sku: string) => void {
  const {
    searchForm,
    runtime,
    shelfMeshes,
    camera,
    controls,
    statusMessage,
    config,
    scene,
    searchResult,
    searchResultSku,
    searchResultShelf,
    moveProductBtn,
    deleteProductBtn,
    transferProductBtn,
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
    onMoveRequested,
    onProductRemoved,
    onProductLocated,
    onSearchCleared
  } = params;

  const clearSearchBtn = searchForm.querySelector<HTMLButtonElement>("#clear-search-btn");
  const reportList = searchResult.querySelector<HTMLElement>("#search-report-list");
  const reportMinimizeBtn = searchResult.querySelector<HTMLButtonElement>("#minimize-search-report-btn");
  const reportRestoreBtn = searchResult.querySelector<HTMLButtonElement>("#restore-search-report-btn");
  const reportMinimizedSummary = searchResult.querySelector<HTMLElement>("#search-result-minimized-summary");
  const reportCloseBtn = searchResult.querySelector<HTMLButtonElement>("#close-search-report-btn");
  const reportHead = searchResult.querySelector<HTMLElement>(".search-result-head");

  attachMaxClamp(editorWidth);
  attachMaxClamp(editorHeight);
  attachMaxClamp(editorDepth);

  let activeSku: string | null = null;
  let confirmPending = false;
  let confirmTimeout: number | null = null;
  productEditor.hidden = true;

  // ── Poblar el selector de estantes del panel de traslado ──────────────────
  config.shelves.forEach((shelf) => {
    const option = document.createElement("option");
    option.value = shelf.id;
    option.textContent = `${shelf.id} · ${shelf.label}`;
    transferShelfSelect.append(option);
  });

  const populateTransferSections = (shelfId: string) => {
    const shelf = config.shelves.find((s) => s.id === shelfId);
    const sections = Math.max(1, Math.floor(shelf?.sections ?? 1));
    if (shelf) ensureSectionLabels(shelf);
    transferSectionSelect.replaceChildren();
    for (let i = 1; i <= sections; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = shelf ? getSectionLabel(shelf, i) : `Piso ${i}`;
      transferSectionSelect.append(option);
    }
  };

  populateTransferSections(config.shelves[0]?.id ?? "");

  transferShelfSelect.addEventListener("change", () => {
    populateTransferSections(transferShelfSelect.value);
  });

  const setIconButtonLabel = (button: HTMLButtonElement, label: string) => {
    button.title = label;
    button.setAttribute("aria-label", label);
    const hiddenLabel = button.querySelector(".visually-hidden");
    if (hiddenLabel) hiddenLabel.textContent = label;
  };

  const applyEditorLimits = (shelf: Shelf, localPositionY: number) => {
    const sectionHeight = getSectionHeightForPosition(shelf, localPositionY);

    editorWidth.max = String(shelf.width);
    editorHeight.max = String(sectionHeight);
    editorDepth.max = String(shelf.depth);

    editorWidth.placeholder = `Max ${formatInputValue(shelf.width)}`;
    editorHeight.placeholder = `Max ${formatInputValue(sectionHeight)}`;
    editorDepth.placeholder = `Max ${formatInputValue(shelf.depth)}`;

    editorWidth.value = clampInputValue(editorWidth.value, shelf.width);
    editorHeight.value = clampInputValue(editorHeight.value, sectionHeight);
    editorDepth.value = clampInputValue(editorDepth.value, shelf.depth);
  };

  const productActions = moveProductBtn.closest<HTMLElement>("#product-actions");

  const resetDeleteBtn = () => {
    confirmPending = false;
    if (confirmTimeout !== null) {
      window.clearTimeout(confirmTimeout);
      confirmTimeout = null;
    }
    setIconButtonLabel(deleteProductBtn, UI_COPY.buttons.deleteProduct);
    deleteProductBtn.classList.remove("btn-danger--confirm");
  };

  const hideTransferPanel = () => {
    transferPanel.hidden = true;
  };

  const hideResult = () => {
    searchResult.hidden = true;
    searchResult.dataset.minimized = "false";
    if (productActions) productActions.hidden = true;
    productEditor.hidden = true;
    hideTransferPanel();
    activeSku = null;
    resetDeleteBtn();
    if (clearSearchBtn) clearSearchBtn.hidden = true;
    onSearchCleared?.();
  };

  const setReportMinimized = (isMinimized: boolean) => {
    if (searchResult.hidden) return;
    searchResult.dataset.minimized = isMinimized ? "true" : "false";
    reportMinimizeBtn?.setAttribute("aria-expanded", isMinimized ? "false" : "true");
  };

  const selectProduct = (sku: string, matches?: SearchMatch[]) => {
    const productEntry = runtime.productEntryBySku.get(sku);
    const reportMatches = matches && matches.length > 0
      ? matches
      : productEntry ? [{ sku, entry: productEntry }] : [];

    if (!productEntry) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, getSearchNotFoundMessage(sku), true);
      return;
    }

    const { shelfId, item, localPosition: localPos } = productEntry;
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, getSearchShelfMissingMessage(sku), true);
      return;
    }

    const shelfLabel = config.shelves.find((s) => s.id === shelfId)?.label ?? shelfId;
    const shelf = config.shelves.find((s) => s.id === shelfId);
    activeSku = sku;
    searchResultSku.textContent = item.name ? `${item.name} (${sku})` : sku;
    searchResultShelf.textContent = getReportSummary(reportMatches, shelfId, shelfLabel);
    renderSearchReport(reportMatches, sku);
    searchResult.hidden = false;
    setReportMinimized(false);
    if (productActions) productActions.hidden = false;
    if (clearSearchBtn) clearSearchBtn.hidden = false;

    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = item.name || sku;

    editorSkuDisplay.textContent = `SKU: ${sku}`;
    editorName.value = item.name ?? "";
    editorWidth.value = String(item.width);
    editorHeight.value = String(item.height);
    editorDepth.value = String(item.depth);
    if (shelf) {
      applyEditorLimits(shelf, localPos.y);
    }
    productEditor.hidden = false;

    const instancedMesh = runtime.instancedMeshByGeo.get(productEntry.geoKey);
    if (instancedMesh) {
      const worldPos = getInstanceWorldPosition(instancedMesh, productEntry.instanceIndex);
      onProductLocated?.(worldPos, shelfMesh);
    }
    highlightProduct(runtime, sku);
    setStatus(statusMessage, getSearchSuccessMessage(sku, shelfId, reportMatches.length), false);
  };

  const handleSearchSubmit = (event: SubmitEvent) => {
    event.preventDefault();

    const query = String(new FormData(searchForm).get("searchSku") ?? "").trim();

    if (!query) {
      hideResult();
      setStatus(statusMessage, UI_COPY.status.emptySearchSku, true);
      return;
    }

    const matches = resolveProductSearchMatches(runtime.productEntryBySku, query);
    selectProduct(matches[0]?.sku ?? query, matches);
  };

  const handleMoveProductClick = () => {
    if (!activeSku) return;
    onMoveRequested(activeSku);
    setStatus(statusMessage, getMoveReadyMessage(activeSku), false);
  };

  const handleDeleteProductClick = () => {
    if (!activeSku) return;

    if (!confirmPending) {
      confirmPending = true;
      setIconButtonLabel(deleteProductBtn, UI_COPY.buttons.confirmDelete);
      deleteProductBtn.classList.add("btn-danger--confirm");
      confirmTimeout = window.setTimeout(resetDeleteBtn, 3000);
      return;
    }

    const sku = activeSku;
    resetDeleteBtn();
    const removedShelfId = removeItem(runtime, scene, sku);
    hideResult();

    if (removedShelfId) {
      const remaining = runtime.productsByShelf.get(removedShelfId)?.length ?? 0;
      updateLegendCount(removedShelfId, remaining);
      onProductRemoved(removedShelfId);
      setStatus(statusMessage, getDeleteSuccessMessage(sku, removedShelfId), false);
    }

    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
  };

  const handleTransferProductClick = () => {
    if (!activeSku) return;
    const currentEntry = runtime.productEntryBySku.get(activeSku);
    if (currentEntry) {
      transferShelfSelect.value = currentEntry.shelfId;
      populateTransferSections(currentEntry.shelfId);
    }
    transferPanel.hidden = false;
  };

  const handleTransferConfirm = () => {
    if (!activeSku) return;

    const fromShelfId = runtime.productEntryBySku.get(activeSku)?.shelfId ?? "";
    const toShelfId = transferShelfSelect.value;
    const toSection = Number(transferSectionSelect.value);

    const result = transferItem(runtime, scene, config, shelfMeshes, activeSku, toShelfId, toSection);

    if (!result) {
      setStatus(statusMessage, getTransferNoSpaceMessage(activeSku, toShelfId, toSection), true);
      return;
    }

    const sku = activeSku;
    hideTransferPanel();
    hideResult();

    if (fromShelfId && fromShelfId !== toShelfId) {
      updateLegendCount(fromShelfId, runtime.productsByShelf.get(fromShelfId)?.length ?? 0);
      onProductRemoved(fromShelfId);
    }
    updateLegendCount(toShelfId, runtime.productsByShelf.get(toShelfId)?.length ?? 0);

    const newEntry = runtime.productEntryBySku.get(sku);
    const newShelfMesh = shelfMeshes.get(toShelfId);
    if (newEntry && newShelfMesh) {
      const newInstancedMesh = runtime.instancedMeshByGeo.get(newEntry.geoKey);
      if (newInstancedMesh) {
        const newWorldPos = getInstanceWorldPosition(newInstancedMesh, newEntry.instanceIndex);
        focusOnProductFromAisle(newWorldPos, newShelfMesh, camera, controls);
        onProductLocated?.(newWorldPos, newShelfMesh);
        highlightProduct(runtime, sku);
      }
    }

    setStatus(statusMessage, getTransferSuccessMessage(sku, fromShelfId, toShelfId, toSection), false);

    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
  };

  const handleTransferCancel = () => {
    hideTransferPanel();
  };

  const handleEditorSave = (event: SubmitEvent) => {
    event.preventDefault();
    if (!activeSku) return;

    const name = editorName.value.trim();
    const width = Number(editorWidth.value);
    const height = Number(editorHeight.value);
    const depth = Number(editorDepth.value);

    if (width <= 0 || height <= 0 || depth <= 0) {
      setStatus(statusMessage, UI_COPY.status.invalidProductForm, true);
      return;
    }

    const editorEntry = runtime.productEntryBySku.get(activeSku);
    const shelfId = editorEntry?.shelfId ?? "";
    const shelf = config.shelves.find((s) => s.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelf || !shelfMesh || !editorEntry) return;

    const widthMax = Number(editorWidth.max);
    const heightMax = Number(editorHeight.max);
    const depthMax = Number(editorDepth.max);

    if (width > widthMax || height > heightMax || depth > depthMax) {
      applyEditorLimits(shelf, editorEntry.localPosition.y);
      setStatus(statusMessage, UI_COPY.status.productTooLargeForShelf, true);
      return;
    }

    const ok = updateItemDimensions(runtime, scene, activeSku, { name, width, height, depth }, shelfMesh);
    if (ok) {
      highlightProduct(runtime, activeSku);
      setStatus(statusMessage, `Producto ${activeSku} actualizado correctamente.`, false);
    }
  };

  const handleClearSearch = () => {
    clearHighlight(runtime);
    hideResult();
    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
    setStatus(statusMessage, UI_COPY.status.initial, false);
  };

  const handleCloseReport = () => {
    searchResult.hidden = true;
    searchResult.dataset.minimized = "false";
  };

  const renderSearchReport = (matches: SearchMatch[], selectedSku: string) => {
    if (!reportList) return;

    reportList.replaceChildren();
    for (const match of matches) {
      const { sku: matchSku, entry } = match;
      const shelfLabel = config.shelves.find((s) => s.id === entry.shelfId)?.label ?? entry.shelfId;
      const shelf = config.shelves.find((s) => s.id === entry.shelfId);
      const item = entry.item;
      const section = getSectionNumberForPosition(shelf, entry.localPosition.y);
      const locationText = `${entry.shelfId} · ${shelfLabel} · ${getSectionLabel(shelf, section)}`;
      const dimensionsText = `${formatMetric(item.width)} x ${formatMetric(item.height)} x ${formatMetric(item.depth)} m`;
      const metaText = `Posicion local (${formatMetric(entry.localPosition.x)}, ${formatMetric(entry.localPosition.y)}, ${formatMetric(entry.localPosition.z)})`;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "search-report-item";
      row.dataset.selected = matchSku === selectedSku ? "true" : "false";
      row.dataset.sku = matchSku;
      row.innerHTML = `
        <span class="search-report-item-title">${escapeHtml(item.name || "Sin nombre registrado")}</span>
        <span>SKU: ${escapeHtml(matchSku)}</span>
        <span>${escapeHtml(locationText)}</span>
        <span>${escapeHtml(dimensionsText)}</span>
        <span>${escapeHtml(metaText)}</span>
      `;
      row.addEventListener("click", () => {
        selectProduct(matchSku, matches);
      });
      reportList.append(row);
    }

    if (reportMinimizedSummary) {
      reportMinimizedSummary.textContent = `${matches.length} producto${matches.length === 1 ? "" : "s"} encontrado${matches.length === 1 ? "" : "s"}`;
    }
  };

  reportMinimizeBtn?.addEventListener("click", () => setReportMinimized(true));
  reportRestoreBtn?.addEventListener("click", () => setReportMinimized(false));
  reportCloseBtn?.addEventListener("click", handleCloseReport);

  reportHead?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;

    const rect = searchResult.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const pointerId = event.pointerId;

    searchResult.dataset.dragging = "true";
    searchResult.style.left = `${startLeft}px`;
    searchResult.style.top = `${startTop}px`;
    searchResult.style.right = "auto";
    searchResult.style.bottom = "auto";
    reportHead.setPointerCapture(pointerId);

    const moveReport = (moveEvent: PointerEvent) => {
      const nextLeft = startLeft + moveEvent.clientX - startX;
      const nextTop = startTop + moveEvent.clientY - startY;
      const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
      const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
      searchResult.style.left = `${Math.min(Math.max(12, nextLeft), maxLeft)}px`;
      searchResult.style.top = `${Math.min(Math.max(12, nextTop), maxTop)}px`;
    };

    const stopDrag = () => {
      searchResult.dataset.dragging = "false";
      reportHead.releasePointerCapture(pointerId);
      reportHead.removeEventListener("pointermove", moveReport);
      reportHead.removeEventListener("pointerup", stopDrag);
      reportHead.removeEventListener("pointercancel", stopDrag);
    };

    reportHead.addEventListener("pointermove", moveReport);
    reportHead.addEventListener("pointerup", stopDrag);
    reportHead.addEventListener("pointercancel", stopDrag);
  });

  searchForm.addEventListener("submit", handleSearchSubmit);
  editorForm.addEventListener("submit", handleEditorSave);
  clearSearchBtn?.addEventListener("click", handleClearSearch);
  moveProductBtn.addEventListener("click", handleMoveProductClick);
  deleteProductBtn.addEventListener("click", handleDeleteProductClick);
  transferProductBtn.addEventListener("click", handleTransferProductClick);
  transferConfirmBtn.addEventListener("click", handleTransferConfirm);
  transferCancelBtn.addEventListener("click", handleTransferCancel);

  return selectProduct;
}

export function resolveProductSearchQuery(
  productsBySku: Map<string, ProductEntry>,
  rawQuery: string
): { sku: string; matchCount: number } | null {
  const matches = resolveProductSearchMatches(productsBySku, rawQuery);
  if (matches.length === 0) return null;
  return { sku: matches[0].sku, matchCount: matches.length };
}

interface SearchMatch {
  sku: string;
  entry: ProductEntry;
}

export function resolveProductSearchMatches(
  productsBySku: Map<string, ProductEntry>,
  rawQuery: string
): SearchMatch[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const exactSku = [...productsBySku.keys()].find((sku) => normalizeSearchText(sku) === query);
  if (exactSku) {
    const entry = productsBySku.get(exactSku);
    return entry ? [{ sku: exactSku, entry }] : [];
  }

  const entries = [...productsBySku.entries()];
  const exactNameMatches = entries.filter(([, entry]) => normalizeSearchText(entry.item.name) === query);
  if (exactNameMatches.length > 0) {
    return exactNameMatches.map(([sku, entry]) => ({ sku, entry }));
  }

  const partialMatches = entries.filter(([sku, entry]) => {
    const normalizedSku = normalizeSearchText(sku);
    const normalizedName = normalizeSearchText(entry.item.name);
    return normalizedSku.includes(query) || normalizedName.includes(query);
  });

  if (partialMatches.length === 0) return [];

  partialMatches.sort(([skuA, entryA], [skuB, entryB]) => {
    const nameA = normalizeSearchText(entryA.item.name);
    const nameB = normalizeSearchText(entryB.item.name);
    const startsA = nameA.startsWith(query) ? 0 : 1;
    const startsB = nameB.startsWith(query) ? 0 : 1;
    if (startsA !== startsB) return startsA - startsB;
    return skuA.localeCompare(skuB);
  });

  return partialMatches.map(([sku, entry]) => ({ sku, entry }));
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getReportSummary(matches: SearchMatch[], shelfId: string, shelfLabel: string): string {
  if (matches.length <= 1) return `${shelfId} · ${shelfLabel}`;
  return `${matches.length} productos encontrados con ese nombre. Selecciona uno para enfocarlo.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wireSceneClick(params: SceneClickDeps): void {
  const { canvas, camera, runtime, config, clickInfo, clickInfoSku, clickInfoShelf, clickInfoDims, isSuppressed, onProductSelected, onSelectionCleared } =
    params;

  const handleSceneClick = (event: MouseEvent) => {
    if (isSuppressed?.()) return;
    const sku = pickProduct(event, camera, canvas, [...runtime.instancedMeshByGeo.values()], runtime.instanceOwner);

    if (!sku) {
      clickInfo.hidden = true;
      onSelectionCleared?.();
      return;
    }

    const hitEntry = runtime.productEntryBySku.get(sku);
    if (!hitEntry) return;
    const { item: { width, height, depth }, shelfId } = hitEntry;

    const shelf = config.shelves.find((s) => s.id === shelfId);
    clickInfoSku.textContent = sku;
    clickInfoShelf.textContent = shelf ? `${shelfId} · ${shelf.label}` : shelfId;
    clickInfoDims.textContent = `${width} × ${height} × ${depth} m`;
    clickInfo.hidden = false;

    onProductSelected?.(sku);
  };

  canvas.addEventListener("click", handleSceneClick);
}

function getNumberInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`No se encontro el campo ${name}.`);
  }
  return field;
}

function attachMaxClamp(input: HTMLInputElement): void {
  const clamp = () => {
    if (!input.value) return;

    const value = Number(input.value);
    if (!Number.isFinite(value)) return;

    const min = Number(input.min);
    const max = Number(input.max);
    let nextValue = value;

    if (Number.isFinite(min)) {
      nextValue = Math.max(nextValue, min);
    }

    if (Number.isFinite(max)) {
      nextValue = Math.min(nextValue, max);
    }

    if (nextValue !== value) {
      input.value = formatInputValue(nextValue);
    }
  };

  input.addEventListener("input", clamp);
  input.addEventListener("blur", clamp);
}

function getSectionHeightForPosition(shelf: Shelf, localPositionY: number): number {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  const safePositionY = clamp(localPositionY, 0, shelf.height);

  for (let index = 0; index < bounds.length - 1; index += 1) {
    const lowerBound = bounds[index];
    const upperBound = bounds[index + 1];
    const isInsideSection = safePositionY >= lowerBound && (safePositionY < upperBound || index === bounds.length - 2);
    if (isInsideSection) {
      return upperBound - lowerBound;
    }
  }

  return shelf.height / sections;
}

function getSectionNumberForPosition(shelf: Shelf | undefined, localPositionY: number): number {
  if (!shelf) return 1;

  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  const safePositionY = clamp(localPositionY, 0, shelf.height);

  for (let index = 0; index < bounds.length - 1; index += 1) {
    const lowerBound = bounds[index];
    const upperBound = bounds[index + 1];
    const isInsideSection = safePositionY >= lowerBound && (safePositionY < upperBound || index === bounds.length - 2);
    if (isInsideSection) {
      return index + 1;
    }
  }

  return 1;
}

function ensureSectionLabels(shelf: Shelf): void {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const current = Array.isArray(shelf.sectionLabels) ? shelf.sectionLabels : [];
  shelf.sectionLabels = Array.from({ length: sections }, (_, index) => {
    const label = current[index]?.trim();
    return label || `Piso ${index + 1}`;
  });
}

function getSectionLabel(shelf: Shelf | undefined, section: number): string {
  if (!shelf) return `Piso ${section}`;
  ensureSectionLabels(shelf);
  return shelf.sectionLabels?.[section - 1] || `Piso ${section}`;
}

function clampInputValue(currentValue: string, maxValue: number): string {
  const parsed = Number(currentValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(Math.min(0.8, maxValue));
  return String(Math.min(parsed, maxValue));
}

function formatInputValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatMetric(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
