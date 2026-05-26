import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { HudRefs } from "./ui-builder.js";
import { buildHtml } from "./ui-builder.js";
import { calcShelfStatus } from "./shelfStatus.js";
import {
  addShelfBoard,
  clearShelfSectionHighlight,
  collectBoardOffsets,
  flashShelfMesh,
  focusOnProductFromAisle,
  getInstanceWorldPosition,
  highlightShelfSection,
  pickProduct,
  refreshShelfSections,
  removeShelfBoardAtSection,
  resizeShelfMesh,
  SHELF_PALETTE
} from "./three-helpers.js";
import type { Item, Shelf, WarehouseConfig } from "./types.js";
import {
  getDeleteSuccessMessage,
  getDuplicateSkuMessage,
  getInvalidProductDimensionsMessage,
  getInvalidSkuMessage,
  getMoveReadyMessage,
  getNoSpaceMessage,
  getPlacementSuccessMessage,
  getProductTooLargeForSectionMessage,
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
import { populateShelves, setStatus } from "./ui-handlers.js";
import { type WarehouseRuntime, clearHighlight, highlightProduct, loadProductCatalogs, placeItem, removeItem, transferItem, updateItemDimensions, uploadProductImage } from "./warehouse.js";
import type { ProductEntry } from "./warehouse.js";
import { canPlace } from "./canPlace.js";

export { buildHtml, populateShelves, setStatus };
export type { HudRefs };

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

interface BarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

// Recent-serials history kept in localStorage so warehouse workers can repeat
// frequent lookups without retyping the serial.
const RECENT_SERIALS_KEY = "almacen-recent-serials";
const RECENT_SERIALS_MAX = 5;

function loadRecentSerials(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SERIALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentSerial(serial: string | null | undefined): string[] {
  const clean = (serial ?? "").trim();
  if (!clean) return loadRecentSerials();
  const list = [clean, ...loadRecentSerials().filter((s) => s.toLowerCase() !== clean.toLowerCase())]
    .slice(0, RECENT_SERIALS_MAX);
  try {
    window.localStorage.setItem(RECENT_SERIALS_KEY, JSON.stringify(list));
  } catch {
    // localStorage may fail in private modes — silently ignore.
  }
  return list;
}

function renderRecentSerials(container: HTMLElement, chipsHost: HTMLElement, onPick: (serial: string) => void): void {
  const list = loadRecentSerials();
  chipsHost.replaceChildren();
  if (list.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  list.forEach((serial) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-serial-chip";
    btn.textContent = serial;
    btn.title = `Buscar ${serial}`;
    btn.addEventListener("click", () => onPick(serial));
    chipsHost.appendChild(btn);
  });
}

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
  onProductPlaced?: () => void;
  enableGhostPreview?: boolean;
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
  editorSerialNumber: HTMLInputElement;
  editorCategory: HTMLInputElement;
  editorBrand: HTMLInputElement;
  editorImageUrl: HTMLInputElement;
  editorWidth: HTMLInputElement;
  editorHeight: HTMLInputElement;
  editorDepth: HTMLInputElement;
  onMoveRequested: (sku: string) => void;
  onProductRemoved: (shelfId: string) => void;
  beforeProductSelected?: (sku: string) => boolean;
  onProductLocated?: (worldPos: THREE.Vector3, shelfMesh: THREE.Mesh, sku: string) => void;
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
  onProductSelected?: (sku: string) => boolean | void;
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
    onShelfResized,
    onProductPlaced,
    enableGhostPreview = true
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
  const productCard = form.closest<HTMLElement>("[data-card]");

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
    if (!enableGhostPreview) {
      removeGhost();
      return;
    }

    const shelfId = shelfField instanceof HTMLSelectElement ? shelfField.value : "";
    const shelf = config.shelves.find((s) => s.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    const w = Number(widthField.value);
    const h = Number(heightField.value);
    const d = Number(depthField.value);
    const preferredSection = sectionField instanceof HTMLSelectElement ? Number(sectionField.value || "1") : 1;

    removeGhost();

    if (productCard?.dataset.collapsed === "true") return;
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

  const handleProductFormSubmit = async (event: SubmitEvent) => {
    event.preventDefault();

    const data = new FormData(form);
	    const shelfId = String(data.get("shelfId") ?? "");
	    const serialNumber = String(data.get("serialNumber") ?? "").trim();
	    const sku = buildInternalSkuFromSerial(serialNumber);
	    const productName = String(data.get("productName") ?? "").trim() || getProductName(serialNumber);
	    const category = String(data.get("category") ?? "").trim() || "Sin categoria";
    const brand = String(data.get("brand") ?? "").trim() || "Sin marca";
    const imageFile = data.get("imageFile");
    const imageUrl = imageFile instanceof File && imageFile.size > 0
      ? await uploadProductImage(imageFile)
      : null;
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

		    if (!serialNumber || !sku) {
		      setStatus(statusMessage, getInvalidSkuMessage(), true);
		      return;
		    }

		    const serialExists = [...runtime.productEntryBySku.values()].some(
		      (entry) => normalizeSearchText(entry.item.serialNumber) === normalizeSearchText(serialNumber)
		    );
		    if (serialExists) {
		      setStatus(statusMessage, `Ya existe un producto con el numero de serie "${serialNumber}".`, true);
		      return;
		    }
	
	    const skuExists = [...runtime.productEntryBySku.keys()].some(
	      (currentSku) => currentSku.trim().toLowerCase() === sku.toLowerCase()
	    );
	    if (skuExists) {
	      setStatus(statusMessage, getDuplicateSkuMessage(sku), true);
	      return;
	    }

	    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(depth) || width <= 0 || height <= 0 || depth <= 0) {
	      setStatus(statusMessage, getInvalidProductDimensionsMessage(), true);
	      return;
	    }

	    const sectionBounds = getSectionBounds(shelf, preferredSection);
	    const sectionHeight = sectionBounds.max - sectionBounds.min;
	    if (width > shelf.width || height > sectionHeight || depth > shelf.depth) {
	      setStatus(
	        statusMessage,
	        getProductTooLargeForSectionMessage(
	          shelf.id,
	          preferredSection,
	          roundMetric(shelf.width),
	          roundMetric(sectionHeight),
	          roundMetric(shelf.depth)
	        ),
	        true
	      );
	      return;
	    }
	
			    const item: Item = { sku, serialNumber, name: productName, category, brand, imageUrl, width, height, depth };
	    const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
		    const previewPlacement = canPlace(shelf, placedItems, item, { preferredSection });
		    if (!previewPlacement) {
		      setStatus(statusMessage, getNoSpaceMessage(serialNumber, shelf.id, preferredSection), true);
		      return;
		    }

	    const placement = placeItem(runtime, scene, item, shelf, shelfMesh, preferredSection);

	    if (!placement) {
	      setStatus(statusMessage, getNoSpaceMessage(serialNumber, shelf.id, preferredSection), true);
	      return;
	    }

    onProductPlaced?.();
    refreshShelfSummary(shelfId);
    flashShelfMesh(shelfMesh);
	    setStatus(statusMessage, getPlacementSuccessMessage(serialNumber, shelf.id, placement.localPosition, preferredSection), false);

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

  // Mostrar el fantasma solo cuando el card del formulario esta desplegado.
  if (productCard) {
    new MutationObserver(() => {
      if (productCard.dataset.collapsed === "true") {
        removeGhost();
        return;
      }
      createOrUpdateGhost();
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

export function wireSearchForm(params: SearchFormDeps): (sku: string) => boolean {
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
	    editorSerialNumber,
	    editorCategory,
    editorBrand,
    editorImageUrl,
    editorWidth,
    editorHeight,
    editorDepth,
    onMoveRequested,
    onProductRemoved,
    beforeProductSelected,
    onProductLocated,
    onSearchCleared
  } = params;

  const clearSearchBtn = searchForm.querySelector<HTMLButtonElement>("#clear-search-btn");
  const barcodeScanBtn = searchForm.querySelector<HTMLButtonElement>("#barcode-scan-btn");
  const barcodeScanner = document.querySelector<HTMLElement>("#barcode-scanner");
  const barcodeVideo = document.querySelector<HTMLVideoElement>("#barcode-video");
  const reportList = searchResult.querySelector<HTMLElement>("#search-report-list");
  const reportMinimizeBtn = searchResult.querySelector<HTMLButtonElement>("#minimize-search-report-btn");
  const reportRestoreBtn = searchResult.querySelector<HTMLButtonElement>("#restore-search-report-btn");
  const reportMinimizedSummary = searchResult.querySelector<HTMLElement>("#search-result-minimized-summary");
  const reportCloseBtn = searchResult.querySelector<HTMLButtonElement>("#close-search-report-btn");
  const reportHead = searchResult.querySelector<HTMLElement>(".search-result-head");
  const searchCategoryFilter = searchForm.querySelector<HTMLSelectElement>("#search-category-filter");
  const searchBrandFilter = searchForm.querySelector<HTMLSelectElement>("#search-brand-filter");
  const categoryDatalist = document.querySelector<HTMLDataListElement>("#category-options");
  const brandDatalist = document.querySelector<HTMLDataListElement>("#brand-options");
  const recentSerialsContainer = searchForm.querySelector<HTMLElement>("#recent-serials");
  const recentSerialsChips = searchForm.querySelector<HTMLElement>("#recent-serials-chips");
  const bulkSearchInput = searchForm.querySelector<HTMLTextAreaElement>("#bulk-search-input");
  const bulkSearchBtn = searchForm.querySelector<HTMLButtonElement>("#bulk-search-btn");
  const bulkSearchClearBtn = searchForm.querySelector<HTMLButtonElement>("#bulk-search-clear-btn");
  const bulkSearchResults = searchForm.querySelector<HTMLElement>("#bulk-search-results");
  const searchInput = searchForm.querySelector<HTMLInputElement>("input[name='searchSku']");

  const triggerSerialSearch = (serial: string) => {
    if (!searchInput) return;
    searchInput.value = serial;
    searchForm.requestSubmit();
  };

  const refreshRecentSerialsUi = () => {
    if (recentSerialsContainer && recentSerialsChips) {
      renderRecentSerials(recentSerialsContainer, recentSerialsChips, triggerSerialSearch);
    }
  };
  refreshRecentSerialsUi();

  attachMaxClamp(editorWidth);
  attachMaxClamp(editorHeight);
  attachMaxClamp(editorDepth);

	  let activeSku: string | null = null;
	  let confirmPending = false;
	  let confirmTimeout: number | null = null;
	  let barcodeStream: MediaStream | null = null;
	  let barcodeDetector: BarcodeDetector | null = null;
	  let barcodeScanFrame = 0;
	  let highlightedSectionShelf: THREE.Mesh | null = null;
	  productEditor.hidden = true;

	  const populateCatalogControls = (categories: string[], brands: string[]) => {
	    const fillSelect = (select: HTMLSelectElement | null, values: string[], allLabel: string) => {
	      if (!select) return;
	      const current = select.value;
	      select.replaceChildren(new Option(allLabel, ""));
	      values.forEach((value) => select.add(new Option(value, value)));
	      select.value = values.includes(current) ? current : "";
	    };
	    const fillDatalist = (list: HTMLDataListElement | null, values: string[]) => {
	      if (!list) return;
	      list.replaceChildren(...values.map((value) => {
	        const option = document.createElement("option");
	        option.value = value;
	        return option;
	      }));
	    };

	    fillSelect(searchCategoryFilter, categories, "Todas");
	    fillSelect(searchBrandFilter, brands, "Todas");
	    fillDatalist(categoryDatalist, categories);
	    fillDatalist(brandDatalist, brands);
	  };

	  const getRuntimeCatalogValues = () => {
	    const entries = [...runtime.productEntryBySku.values()];
	    return {
	      categories: getUniqueCatalogValues(entries.map((entry) => entry.item.category)),
	      brands: getUniqueCatalogValues(entries.map((entry) => entry.item.brand))
	    };
	  };

	  const fallbackCatalogs = getRuntimeCatalogValues();
	  populateCatalogControls(fallbackCatalogs.categories, fallbackCatalogs.brands);
	  loadProductCatalogs().then((catalogs) => {
	    const apiCategories = getUniqueCatalogValues(catalogs.categories.map((entry) => entry.name));
	    const apiBrands = getUniqueCatalogValues(catalogs.brands.map((entry) => entry.name));
	    populateCatalogControls(
	      apiCategories.length > 0 ? apiCategories : fallbackCatalogs.categories,
	      apiBrands.length > 0 ? apiBrands : fallbackCatalogs.brands
	    );
	  });

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

  const stopBarcodeScanner = () => {
    if (barcodeScanFrame) {
      window.cancelAnimationFrame(barcodeScanFrame);
      barcodeScanFrame = 0;
    }
    barcodeStream?.getTracks().forEach((track) => track.stop());
    barcodeStream = null;
    if (barcodeVideo) {
      barcodeVideo.pause();
      barcodeVideo.srcObject = null;
    }
    if (barcodeScanner) barcodeScanner.hidden = true;
    if (barcodeScanBtn) {
      barcodeScanBtn.dataset.scanning = "false";
      setIconButtonLabel(barcodeScanBtn, UI_COPY.buttons.scanBarcode);
    }
  };

  const searchByCapturedSku = (sku: string) => {
    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = sku;

    const exactMatch = resolveProductByExactSku(runtime.productEntryBySku, sku);
    if (!exactMatch) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, UI_COPY.status.barcodeNotFound, true);
      return;
    }

    selectProduct(exactMatch.sku, [{ sku: exactMatch.sku, entry: exactMatch.entry, score: 1000 }]);
  };

  const scanBarcodeFrame = async () => {
    if (!barcodeDetector || !barcodeVideo || !barcodeStream) return;

    if (barcodeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const codes = await barcodeDetector.detect(barcodeVideo);
        const rawValue = codes[0]?.rawValue?.trim();
        if (rawValue) {
          stopBarcodeScanner();
          searchByCapturedSku(rawValue);
          return;
        }
      } catch {
        // Algunos navegadores fallan en frames aislados mientras enfoca la camara.
      }
    }

    barcodeScanFrame = window.requestAnimationFrame(scanBarcodeFrame);
  };

  const startBarcodeScanner = async () => {
    if (!barcodeScanBtn || !barcodeScanner || !barcodeVideo) return;

    const Detector = window.BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setStatus(statusMessage, UI_COPY.status.barcodeUnsupported, true);
      return;
    }

    try {
      barcodeDetector = new Detector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "code_93", "upc_a", "upc_e", "itf", "codabar", "qr_code"]
      });
      barcodeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      barcodeVideo.srcObject = barcodeStream;
      await barcodeVideo.play();
      barcodeScanner.hidden = false;
      barcodeScanBtn.dataset.scanning = "true";
      setIconButtonLabel(barcodeScanBtn, UI_COPY.buttons.stopBarcodeScan);
      setStatus(statusMessage, UI_COPY.status.barcodeScanning, false);
      barcodeScanFrame = window.requestAnimationFrame(scanBarcodeFrame);
    } catch {
      stopBarcodeScanner();
      setStatus(statusMessage, UI_COPY.status.barcodeCameraError, true);
    }
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
    // Reset the advanced 3D placement section so it starts collapsed next time.
    transferPanel.querySelector<HTMLDetailsElement>(".transfer-advanced")?.removeAttribute("open");
  };

	  const hideResult = () => {
	    searchResult.hidden = true;
    searchResult.dataset.minimized = "false";
    delete searchResult.dataset.resultCount;
    if (productActions) productActions.hidden = true;
    productEditor.hidden = true;
    hideTransferPanel();
    activeSku = null;
	    resetDeleteBtn();
	    clearActiveSectionHighlight();
	    if (clearSearchBtn) clearSearchBtn.hidden = true;
	    onSearchCleared?.();
	  };

	  const clearActiveSectionHighlight = () => {
	    if (!highlightedSectionShelf) return;
	    clearShelfSectionHighlight(highlightedSectionShelf);
	    highlightedSectionShelf = null;
	  };

	  const setActiveSectionHighlight = (shelfMesh: THREE.Mesh, shelf: Shelf | undefined, localPositionY: number) => {
	    clearActiveSectionHighlight();
	    if (!shelf) return;
	    const section = getSectionNumberForPosition(shelf, localPositionY);
	    highlightShelfSection(shelfMesh, shelf, section);
	    highlightedSectionShelf = shelfMesh;
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
      : productEntry ? [{ sku, entry: productEntry, score: 1000 }] : [];

	    if (!productEntry) {
	      const suggestions = resolveProductSearchSuggestions(runtime.productEntryBySku, sku);
	      clearHighlight(runtime);
	      hideResult();
	      setStatus(statusMessage, getSearchNotFoundMessage(sku, suggestions), true);
	      return false;
	    }

    const { shelfId, item, localPosition: localPos } = productEntry;
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, getSearchShelfMissingMessage(sku), true);
      return false;
    }

    if (beforeProductSelected?.(sku) === false) return false;

	    const shelf = config.shelves.find((s) => s.id === shelfId);
	    const shelfLabel = shelf?.label ?? shelfId;
	    const section = getSectionNumberForPosition(shelf, localPos.y);
	    const locationText = formatProductLocation(shelfId, shelfLabel, getSectionLabel(shelf, section), localPos);
	    activeSku = sku;
		    searchResultSku.textContent = item.serialNumber
		      ? `Serie ${item.serialNumber} · ${item.name || "Producto sin nombre"}`
		      : item.name || "Producto sin serie";
	    searchResultShelf.textContent = reportMatches.length <= 1
	      ? locationText
	      : getReportSummary(reportMatches, shelfId, shelfLabel);
    renderSearchReport(reportMatches, sku);
    searchResult.dataset.resultCount = String(reportMatches.length);
    searchResult.hidden = reportMatches.length <= 1;
    setReportMinimized(false);
    if (productActions) productActions.hidden = false;
    if (clearSearchBtn) clearSearchBtn.hidden = false;

	    const input = searchForm.elements.namedItem("searchSku");
		    if (input instanceof HTMLInputElement) input.value = item.serialNumber || item.name || "";
	    const globalSearchInput = document.querySelector<HTMLInputElement>(".global-search input");
	    if (globalSearchInput) globalSearchInput.value = item.serialNumber || item.name || "";

	    editorSkuDisplay.textContent = "";
	    editorName.value = item.name ?? "";
	    editorSerialNumber.value = item.serialNumber ?? "";
	    editorCategory.value = item.category ?? "Sin categoria";
    editorBrand.value = item.brand ?? "Sin marca";
    editorWidth.value = String(item.width);
    editorHeight.value = String(item.height);
    editorDepth.value = String(item.depth);
    if (shelf) {
      applyEditorLimits(shelf, localPos.y);
    }
	    productEditor.hidden = true;

    const instancedMesh = runtime.instancedMeshByGeo.get(productEntry.geoKey);
	    if (instancedMesh) {
	      const worldPos = getInstanceWorldPosition(instancedMesh, productEntry.instanceIndex);
	      onProductLocated?.(worldPos, shelfMesh, sku);
	    }
	    highlightProduct(runtime, sku, scene);
	    setActiveSectionHighlight(shelfMesh, shelf, localPos.y);
    setStatus(statusMessage, getSearchSuccessMessage(item.serialNumber || item.name || sku, shelfId, reportMatches.length), false);
    if (item.serialNumber) {
      pushRecentSerial(item.serialNumber);
      refreshRecentSerialsUi();
    }
  };

  const handleSearchSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    stopBarcodeScanner();

    const query = String(new FormData(searchForm).get("searchSku") ?? "").trim();
    const categoryFilter = searchCategoryFilter?.value.trim() ?? "";
    const brandFilter = searchBrandFilter?.value.trim() ?? "";

    const globalSearchInput = document.querySelector<HTMLInputElement>(".global-search input");
    if (globalSearchInput && globalSearchInput.value.trim() !== query) {
      globalSearchInput.value = query;
    }

    if (!query && !categoryFilter && !brandFilter) {
      hideResult();
      setStatus(statusMessage, UI_COPY.status.emptySearchSku, true);
      return;
    }

    // Exact serial-number match → jump straight to the product, skip the
    // suggestions/picker step. Same for exact SKU. Most-common warehouse worker flow.
    if (query && !categoryFilter && !brandFilter) {
      const exactSerial = resolveProductByExactSerial(runtime.productEntryBySku, query);
      const exactSku = exactSerial ?? resolveProductByExactSku(runtime.productEntryBySku, query);
      if (exactSku) {
        selectProduct(exactSku.sku, [{ sku: exactSku.sku, entry: exactSku.entry, score: 1000 }]);
        return;
      }
    }

    const baseMatches = query
      ? resolveProductSearchMatches(runtime.productEntryBySku, query)
      : [...runtime.productEntryBySku.entries()].map(([sku, entry]) => ({ sku, entry, score: 1 }));
    const matches = filterSearchMatches(baseMatches, categoryFilter, brandFilter);
    selectProduct(matches[0]?.sku ?? query, matches);
  };

  const handleMoveProductClick = () => {
    if (!activeSku) return;
    const label = getProductDisplayCode(runtime.productEntryBySku.get(activeSku)?.item, activeSku);
    // Close the unified panel so the user can see the 3D scene to drop the product.
    hideTransferPanel();
    onMoveRequested(activeSku);
    setStatus(statusMessage, getMoveReadyMessage(label), false);
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
	    const label = getProductDisplayCode(runtime.productEntryBySku.get(sku)?.item, sku);
	    resetDeleteBtn();
    const removedShelfId = removeItem(runtime, scene, sku);
    hideResult();

    if (removedShelfId) {
      onProductRemoved(removedShelfId);
	      setStatus(statusMessage, getDeleteSuccessMessage(label, removedShelfId), false);
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

	    const label = getProductDisplayCode(runtime.productEntryBySku.get(activeSku)?.item, activeSku);
	    if (!result) {
	      setStatus(statusMessage, getTransferNoSpaceMessage(label, toShelfId, toSection), true);
	      return;
	    }

    const sku = activeSku;
    hideTransferPanel();
    hideResult();

    if (fromShelfId && fromShelfId !== toShelfId) {
      onProductRemoved(fromShelfId);
    }

    const newEntry = runtime.productEntryBySku.get(sku);
    const newShelfMesh = shelfMeshes.get(toShelfId);
    if (newEntry && newShelfMesh) {
      const newInstancedMesh = runtime.instancedMeshByGeo.get(newEntry.geoKey);
	      if (newInstancedMesh) {
	        const newWorldPos = getInstanceWorldPosition(newInstancedMesh, newEntry.instanceIndex);
	        focusOnProductFromAisle(newWorldPos, newShelfMesh, camera, controls, newEntry.item);
	        onProductLocated?.(newWorldPos, newShelfMesh, sku);
	        highlightProduct(runtime, sku, scene);
	        setActiveSectionHighlight(newShelfMesh, config.shelves.find((s) => s.id === toShelfId), newEntry.localPosition.y);
	      }
    }

	    setStatus(statusMessage, getTransferSuccessMessage(label, fromShelfId, toShelfId, toSection), false);

    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
  };

  const handleTransferCancel = () => {
    hideTransferPanel();
  };

  const handleEditorSave = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!activeSku) return;

	    const name = editorName.value.trim();
	    const serialNumber = editorSerialNumber.value.trim() || null;
	    const category = editorCategory.value.trim() || "Sin categoria";
    const brand = editorBrand.value.trim() || "Sin marca";
    const imageFile = editorImageUrl.files?.[0] ?? null;
    const imageUrl = imageFile ? await uploadProductImage(imageFile) : undefined;
    const width = Number(editorWidth.value);
    const height = Number(editorHeight.value);
    const depth = Number(editorDepth.value);

	    if (width <= 0 || height <= 0 || depth <= 0) {
	      setStatus(statusMessage, UI_COPY.status.invalidProductForm, true);
	      return;
	    }

	    if (!serialNumber) {
	      setStatus(statusMessage, getInvalidSkuMessage(), true);
	      return;
	    }

	    const duplicateSerial = [...runtime.productEntryBySku.entries()].some(
	      ([entrySku, entry]) => entrySku !== activeSku && normalizeSearchText(entry.item.serialNumber) === normalizeSearchText(serialNumber)
	    );
	    if (duplicateSerial) {
	      setStatus(statusMessage, `Ya existe otro producto con el numero de serie "${serialNumber}".`, true);
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

		    const ok = updateItemDimensions(runtime, scene, activeSku, { name, serialNumber, category, brand, imageUrl, width, height, depth }, shelfMesh);
	    if (ok) {
	      highlightProduct(runtime, activeSku, scene);
	      setActiveSectionHighlight(shelfMesh, shelf, editorEntry.localPosition.y);
		      setStatus(statusMessage, `Producto ${serialNumber} actualizado correctamente.`, false);
	    }
  };

  const handleClearSearch = () => {
    clearHighlight(runtime);
    stopBarcodeScanner();
    hideResult();
    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
    setStatus(statusMessage, UI_COPY.status.initial, false);
  };

  const handleBarcodeScanClick = () => {
    if (barcodeStream) {
      stopBarcodeScanner();
      return;
    }
    void startBarcodeScanner();
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
	      const locationText = formatProductLocation(
	        entry.shelfId,
	        shelfLabel,
	        getSectionLabel(shelf, section),
	        entry.localPosition
	      );
		      const dimensionsText = `${formatMetric(item.width)} x ${formatMetric(item.height)} x ${formatMetric(item.depth)} m`;
		      const serialText = item.serialNumber ? `Serie: ${item.serialNumber}` : "Serie no asignada";
	      const catalogText = [
	        item.category ? `Categoria: ${item.category}` : "",
	        item.brand ? `Marca: ${item.brand}` : ""
	      ].filter(Boolean).join(" · ");
	      const row = document.createElement("button");
      row.type = "button";
      row.className = "search-report-item";
      row.dataset.selected = matchSku === selectedSku ? "true" : "false";
      row.dataset.sku = matchSku;
      row.innerHTML = `
        <span class="search-report-item-title">${escapeHtml(item.name || "Sin nombre registrado")}</span>
		        <span>${escapeHtml(serialText)}</span>
	        ${catalogText ? `<span>${escapeHtml(catalogText)}</span>` : ""}
	        <span>${escapeHtml(locationText)}</span>
	        <span>${escapeHtml(dimensionsText)}</span>
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
	  searchCategoryFilter?.addEventListener("change", () => {
	    const hasQuery = String(new FormData(searchForm).get("searchSku") ?? "").trim().length > 0;
	    if (hasQuery || searchCategoryFilter.value || searchBrandFilter?.value) {
	      searchForm.requestSubmit();
	    }
	  });
	  searchBrandFilter?.addEventListener("change", () => {
	    const hasQuery = String(new FormData(searchForm).get("searchSku") ?? "").trim().length > 0;
	    if (hasQuery || searchBrandFilter.value || searchCategoryFilter?.value) {
	      searchForm.requestSubmit();
	    }
	  });

  const setSearchResultPosition = (left: number, top: number) => {
    searchResult.style.setProperty("left", `${left}px`, "important");
    searchResult.style.setProperty("top", `${top}px`, "important");
    searchResult.style.setProperty("right", "auto", "important");
    searchResult.style.setProperty("bottom", "auto", "important");
    searchResult.dataset.positioned = "true";
  };

  reportHead?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();

    const rect = searchResult.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const pointerId = event.pointerId;

    searchResult.dataset.dragging = "true";
    setSearchResultPosition(startLeft, startTop);
    reportHead.setPointerCapture(pointerId);

    const moveReport = (moveEvent: PointerEvent) => {
      const nextLeft = startLeft + moveEvent.clientX - startX;
      const nextTop = startTop + moveEvent.clientY - startY;
      const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
      const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
      setSearchResultPosition(
        Math.min(Math.max(12, nextLeft), maxLeft),
        Math.min(Math.max(12, nextTop), maxTop)
      );
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
  barcodeScanBtn?.addEventListener("click", handleBarcodeScanClick);

  const runBulkSearch = () => {
    if (!bulkSearchInput || !bulkSearchResults) return;
    const raw = bulkSearchInput.value;
    const queries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    bulkSearchResults.replaceChildren();
    if (queries.length === 0) {
      bulkSearchResults.hidden = true;
      return;
    }
    bulkSearchResults.hidden = false;

    const seen = new Set<string>();
    const rows = queries
      .filter((q) => {
        const key = q.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((query) => {
        const match = resolveProductByExactSerial(runtime.productEntryBySku, query)
          ?? resolveProductByExactSku(runtime.productEntryBySku, query);
        return { query, match };
      });

    const list = document.createElement("ul");
    list.className = "bulk-search-list";
    let foundCount = 0;
    rows.forEach(({ query, match }) => {
      const li = document.createElement("li");
      if (match) {
        foundCount++;
        const shelf = config.shelves.find((s) => s.id === match.entry.shelfId);
        const shelfLabel = shelf?.label || match.entry.shelfId;
        const section = getSectionNumberForPosition(shelf, match.entry.localPosition.y);
        const sectionLabel = shelf ? getSectionLabel(shelf, section) : `Piso ${section}`;
        const link = document.createElement("button");
        link.type = "button";
        link.className = "bulk-search-result bulk-search-result--found";
        link.textContent = `${query} · ${match.entry.item.name || "Sin nombre"} → ${shelfLabel} / ${sectionLabel}`;
        link.title = `Enfocar ${query}`;
        link.addEventListener("click", () => selectProduct(match.sku, [{ sku: match.sku, entry: match.entry, score: 1000 }]));
        li.appendChild(link);
      } else {
        const span = document.createElement("span");
        span.className = "bulk-search-result bulk-search-result--missing";
        span.textContent = `${query} · no encontrado`;
        li.appendChild(span);
      }
      list.appendChild(li);
    });

    const summary = document.createElement("p");
    summary.className = "bulk-search-summary";
    summary.textContent = `${foundCount} de ${rows.length} encontrados.`;
    bulkSearchResults.appendChild(summary);
    bulkSearchResults.appendChild(list);
  };

  bulkSearchBtn?.addEventListener("click", runBulkSearch);
  bulkSearchClearBtn?.addEventListener("click", () => {
    if (bulkSearchInput) bulkSearchInput.value = "";
    if (bulkSearchResults) {
      bulkSearchResults.hidden = true;
      bulkSearchResults.replaceChildren();
    }
  });
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

export function resolveProductByExactSku(
  productsBySku: Map<string, ProductEntry>,
  rawSku: string
): { sku: string; entry: ProductEntry } | null {
  const query = normalizeSearchText(rawSku);
  if (!query) return null;

  const sku = [...productsBySku.keys()].find((key) => normalizeSearchText(key) === query);
  const entry = sku ? productsBySku.get(sku) : undefined;
  return sku && entry ? { sku, entry } : null;
}

export function resolveProductByExactSerial(
  productsBySku: Map<string, ProductEntry>,
  rawSerial: string
): { sku: string; entry: ProductEntry } | null {
  const query = normalizeSearchText(rawSerial);
  if (!query) return null;

  for (const [sku, entry] of productsBySku) {
    const serial = entry.item.serialNumber;
    if (serial && normalizeSearchText(serial) === query) return { sku, entry };
  }
  return null;
}

interface SearchMatch {
  sku: string;
  entry: ProductEntry;
  score: number;
}

export function resolveProductSearchMatches(
  productsBySku: Map<string, ProductEntry>,
  rawQuery: string
): SearchMatch[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const entries = [...productsBySku.entries()];
  const matches = entries
    .map(([sku, entry]) => ({ sku, entry, score: getSearchScore(query, sku, entry) }))
    .filter((match) => match.score > 0);

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameCompare = a.entry.item.name.localeCompare(b.entry.item.name, "es", { sensitivity: "base" });
    return nameCompare || a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
  });

  return matches;
}

export function resolveProductSearchSuggestions(
  productsBySku: Map<string, ProductEntry>,
  rawQuery: string,
  limit = 3
): string[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  return [...productsBySku.entries()]
    .map(([sku, entry]) => {
      const candidates = getSearchCandidateLabels(sku, entry);
      const bestDistance = Math.min(
        ...candidates.map((candidate) => getSearchDistance(query, normalizeSearchText(candidate)))
      );
      const label = entry.item.name ? `${entry.item.name} (${sku})` : sku;
      return { label, bestDistance };
    })
    .sort((a, b) => a.bestDistance - b.bestDistance || a.label.localeCompare(b.label, "es", { sensitivity: "base" }))
    .filter((suggestion) => suggestion.bestDistance <= Math.max(2, Math.ceil(query.length * 0.45)))
    .slice(0, limit)
    .map((suggestion) => suggestion.label);
}

function filterSearchMatches(matches: SearchMatch[], category: string, brand: string): SearchMatch[] {
  const normalizedCategory = normalizeSearchText(category);
  const normalizedBrand = normalizeSearchText(brand);
  return matches.filter(({ entry }) => {
    const itemCategory = normalizeSearchText(entry.item.category);
    const itemBrand = normalizeSearchText(entry.item.brand);
    return (!normalizedCategory || itemCategory === normalizedCategory)
      && (!normalizedBrand || itemBrand === normalizedBrand);
  });
}

function getUniqueCatalogValues(values: Array<string | undefined>): string[] {
  const byKey = new Map<string, string>();
  values.forEach((value) => {
    const clean = value?.trim();
    if (!clean) return;
    const key = normalizeSearchText(clean);
    if (!key || byKey.has(key)) return;
    byKey.set(key, clean);
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function getSearchScore(query: string, sku: string, entry: ProductEntry): number {
  const item = entry.item;
	  const normalizedSku = normalizeSearchText(sku);
	  const normalizedSerial = normalizeSearchText(item.serialNumber);
	  const normalizedName = normalizeSearchText(item.name);
	  const normalizedCategory = normalizeSearchText(item.category);
	  const normalizedBrand = normalizeSearchText(item.brand);
	  const normalizedAll = [normalizedSku, normalizedSerial, normalizedName, normalizedCategory, normalizedBrand].filter(Boolean).join(" ");
  const tokens = query.split(/\s+/).filter(Boolean);

	  if (normalizedSku === query) return 1000;
	  if (normalizedSerial === query) return 980;
	  if (normalizedName === query) return 920;
  if (normalizedBrand === query) return 820;
  if (normalizedCategory === query) return 800;

  let score = 0;
	  if (normalizedSku.startsWith(query)) score = Math.max(score, 760);
	  if (normalizedSerial.startsWith(query)) score = Math.max(score, 740);
	  if (normalizedName.startsWith(query)) score = Math.max(score, 700);
  if (normalizedBrand.startsWith(query)) score = Math.max(score, 620);
  if (normalizedCategory.startsWith(query)) score = Math.max(score, 600);
	  if (normalizedSku.includes(query)) score = Math.max(score, 540);
	  if (normalizedSerial.includes(query)) score = Math.max(score, 520);
	  if (normalizedName.includes(query)) score = Math.max(score, 500);
  if (normalizedBrand.includes(query)) score = Math.max(score, 430);
  if (normalizedCategory.includes(query)) score = Math.max(score, 410);

  if (tokens.length > 1 && tokens.every((token) => normalizedAll.includes(token))) {
    score = Math.max(score, 360 + tokens.length * 12);
  }

  return score;
}

function getSearchCandidateLabels(sku: string, entry: ProductEntry): string[] {
  return [
	    sku,
	    entry.item.serialNumber,
	    entry.item.name,
    entry.item.category,
    entry.item.brand,
	    `${entry.item.name} ${sku} ${entry.item.serialNumber ?? ""}`.trim(),
    `${entry.item.category ?? ""} ${entry.item.brand ?? ""}`.trim()
  ].filter((value): value is string => Boolean(value && value.trim()));
}

function getSearchDistance(a: string, b: string): number {
  if (!a) return b.length;
  if (!b) return a.length;
  if (b.includes(a) || a.includes(b)) return Math.abs(a.length - b.length);

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildInternalSkuFromSerial(serialNumber: string): string {
  const clean = serialNumber
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!clean) return "";
  const hash = Array.from(serialNumber).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  const suffix = hash.toString(36).toUpperCase();
  const base = clean.slice(0, Math.max(1, 61 - suffix.length));
  return `S${base}-${suffix}`.slice(0, 64);
}

function getProductDisplayCode(item: Item | undefined, fallback: string): string {
  return item?.serialNumber || item?.name || fallback;
}

function getReportSummary(matches: SearchMatch[], shelfId: string, shelfLabel: string): string {
  if (matches.length <= 1) return `${shelfId} · ${shelfLabel}`;
	  return `${matches.length} coincidencias por numero de serie, nombre, categoria o marca. Selecciona una para enfocarla.`;
}

function formatProductLocation(
  shelfId: string,
  shelfLabel: string,
  sectionLabel: string,
  localPosition: { x: number; y: number; z: number }
): string {
  return `Estante ${shelfId} · ${shelfLabel} · ${sectionLabel} · Posicion X ${formatMetric(localPosition.x)}, Y ${formatMetric(localPosition.y)}, Z ${formatMetric(localPosition.z)}`;
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
  let clickInfoTimer: number | null = null;

  const hideClickInfo = () => {
    clickInfo.hidden = true;
    if (clickInfoTimer !== null) {
      window.clearTimeout(clickInfoTimer);
      clickInfoTimer = null;
    }
  };

  clickInfo.querySelector<HTMLButtonElement>(".click-info-close")?.addEventListener("click", hideClickInfo);

  const handleSceneClick = (event: MouseEvent) => {
    if (isSuppressed?.()) return;
    const sku = pickProduct(event, camera, canvas, [...runtime.instancedMeshByGeo.values()], runtime.instanceOwner);

    if (!sku) {
      hideClickInfo();
      onSelectionCleared?.();
      return;
    }

    const accepted = onProductSelected?.(sku);
    if (accepted === false) return;

    hideClickInfo();
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

function getSectionBounds(shelf: Shelf, section: number): { min: number; max: number } {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  const index = Math.min(Math.max(Math.floor(section), 1), bounds.length - 1) - 1;
  return { min: bounds[index], max: bounds[index + 1] };
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

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
