import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { calcShelfStatus } from "./shelfStatus.js";
import { buildShelfMesh, focusOnShelf, pickMesh, SHELF_PALETTE } from "./scene.js";
import type { Item, Shelf, WarehouseConfig } from "./types.js";
import {
  type WarehouseRuntime,
  clearHighlight,
  highlightProduct,
  placeItem,
  removeItem
} from "./warehouse.js";

export interface HudRefs {
  canvas: HTMLCanvasElement;
  legend: HTMLUListElement;
  searchForm: HTMLFormElement;
  productForm: HTMLFormElement;
  shelfSelect: HTMLSelectElement;
  statusMessage: HTMLParagraphElement;
  shelfDimensions: HTMLParagraphElement;
  shelfTotal: HTMLSpanElement;
  shelfOccupied: HTMLSpanElement;
  shelfFree: HTMLSpanElement;
  searchResult: HTMLDivElement;
  searchResultSku: HTMLElement;
  searchResultShelf: HTMLElement;
  deleteProductBtn: HTMLButtonElement;
  clickInfo: HTMLDivElement;
  clickInfoSku: HTMLElement;
  clickInfoShelf: HTMLElement;
  clickInfoDims: HTMLElement;
  shelfForm: HTMLFormElement;
}

const HUD_TEMPLATE = `
  <section class="app-shell">
    <aside class="hud">
      <span class="eyebrow">Fase 5</span>
      <h1>Busqueda y Enfoque de Productos</h1>
      <p>
        Agrega productos con <code>canPlace()</code> y luego ubicalos por SKU con una
        busqueda que enfoca la camara y resalta el producto correcto.
      </p>
      <section class="nav-help">
        <strong>Como moverse</strong>
        <ul>
          <li>Click izquierdo + arrastrar: rotar vista</li>
          <li>Rueda del mouse: acercar o alejar</li>
          <li>Click derecho + arrastrar: desplazarse lateralmente</li>
        </ul>
      </section>
      <div class="click-info" id="click-info" hidden>
        <strong id="click-info-sku"></strong>
        <span id="click-info-shelf"></span>
        <span id="click-info-dims"></span>
      </div>
      <form class="search-form" id="search-form">
        <label class="search-label">
          <span>Buscar SKU</span>
          <div class="search-row">
            <input name="searchSku" type="text" placeholder="SKU-001" />
            <button type="submit" class="icon-button" aria-label="Buscar producto">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </label>
        <div class="search-result" id="search-result" hidden>
          <div class="search-result-meta">
            <strong id="search-result-sku"></strong>
            <span id="search-result-shelf"></span>
          </div>
          <button type="button" class="btn-danger" id="delete-product-btn">Eliminar producto</button>
        </div>
      </form>
      <form class="product-form" id="product-form">
        <label>
          <span>Estante</span>
          <select name="shelfId" id="shelfId"></select>
        </label>
        <section class="shelf-summary">
          <strong>Referencia del estante</strong>
          <p id="shelf-dimensions"></p>
          <div class="shelf-metrics">
            <span id="shelf-total"></span>
            <span id="shelf-occupied"></span>
            <span id="shelf-free"></span>
          </div>
        </section>
        <label>
          <span>SKU</span>
          <input name="sku" type="text" placeholder="SKU-001" required />
        </label>
        <div class="field-row">
          <label>
            <span>Ancho</span>
            <input name="width" type="number" min="0.1" step="0.1" value="0.8" required />
          </label>
          <label>
            <span>Alto</span>
            <input name="height" type="number" min="0.1" step="0.1" value="0.8" required />
          </label>
          <label>
            <span>Prof.</span>
            <input name="depth" type="number" min="0.1" step="0.1" value="0.8" required />
          </label>
        </div>
        <button type="submit">Registrar producto</button>
      </form>
      <details class="shelf-add">
        <summary>+ Agregar estante</summary>
        <form class="shelf-form" id="shelf-form">
          <label>
            <span>ID</span>
            <input name="shelfId" type="text" placeholder="S07" required />
          </label>
          <label>
            <span>Nombre</span>
            <input name="label" type="text" placeholder="Bodega Norte" required />
          </label>
          <div class="field-row">
            <label>
              <span>Ancho</span>
              <input name="width" type="number" min="0.5" step="0.1" value="2" required />
            </label>
            <label>
              <span>Alto</span>
              <input name="height" type="number" min="0.5" step="0.1" value="2" required />
            </label>
            <label>
              <span>Prof.</span>
              <input name="depth" type="number" min="0.5" step="0.1" value="0.8" required />
            </label>
          </div>
          <div class="field-row-2">
            <label>
              <span>Pos. X</span>
              <input name="x" type="number" step="0.1" value="0" required />
            </label>
            <label>
              <span>Pos. Z</span>
              <input name="z" type="number" step="0.1" value="0" required />
            </label>
          </div>
          <button type="submit">Agregar estante</button>
        </form>
      </details>
      <p class="status-message" id="status-message" aria-live="polite">
        Agrega un producto y luego buscalo por SKU para probar la fase 5.
      </p>
      <ul class="legend" id="legend"></ul>
    </aside>
    <div class="viewport">
      <canvas class="scene-canvas"></canvas>
    </div>
  </section>
`;

/**
 * Inyecta el HTML del HUD en el contenedor y devuelve referencias tipadas a los elementos del DOM.
 */
export function buildHtml(container: HTMLElement): HudRefs {
  container.innerHTML = HUD_TEMPLATE;

  const canvas = container.querySelector<HTMLCanvasElement>(".scene-canvas");
  const legend = container.querySelector<HTMLUListElement>("#legend");
  const searchForm = container.querySelector<HTMLFormElement>("#search-form");
  const productForm = container.querySelector<HTMLFormElement>("#product-form");
  const shelfSelect = container.querySelector<HTMLSelectElement>("#shelfId");
  const statusMessage = container.querySelector<HTMLParagraphElement>("#status-message");
  const shelfDimensions = container.querySelector<HTMLParagraphElement>("#shelf-dimensions");
  const shelfTotal = container.querySelector<HTMLSpanElement>("#shelf-total");
  const shelfOccupied = container.querySelector<HTMLSpanElement>("#shelf-occupied");
  const shelfFree = container.querySelector<HTMLSpanElement>("#shelf-free");
  const searchResult = container.querySelector<HTMLDivElement>("#search-result");
  const searchResultSku = container.querySelector<HTMLElement>("#search-result-sku");
  const searchResultShelf = container.querySelector<HTMLElement>("#search-result-shelf");
  const deleteProductBtn = container.querySelector<HTMLButtonElement>("#delete-product-btn");
  const clickInfo = container.querySelector<HTMLDivElement>("#click-info");
  const clickInfoSku = container.querySelector<HTMLElement>("#click-info-sku");
  const clickInfoShelf = container.querySelector<HTMLElement>("#click-info-shelf");
  const clickInfoDims = container.querySelector<HTMLElement>("#click-info-dims");
  const shelfForm = container.querySelector<HTMLFormElement>("#shelf-form");

  if (
    !canvas ||
    !legend ||
    !searchForm ||
    !productForm ||
    !shelfSelect ||
    !statusMessage ||
    !shelfDimensions ||
    !shelfTotal ||
    !shelfOccupied ||
    !shelfFree ||
    !searchResult ||
    !searchResultSku ||
    !searchResultShelf ||
    !deleteProductBtn ||
    !clickInfo ||
    !clickInfoSku ||
    !clickInfoShelf ||
    !clickInfoDims ||
    !shelfForm
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
    shelfTotal,
    shelfOccupied,
    shelfFree,
    searchResult,
    searchResultSku,
    searchResultShelf,
    deleteProductBtn,
    clickInfo,
    clickInfoSku,
    clickInfoShelf,
    clickInfoDims,
    shelfForm
  };
}

/**
 * Popula la leyenda visual y el selector de estantes con los datos de la configuración.
 */
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

/**
 * Conecta el formulario de registro de productos a la lógica de la aplicación.
 * Devuelve la función refreshShelfSummary para que el orquestador pueda invocarla externamente.
 */
export function wireProductForm(params: {
  config: WarehouseConfig;
  form: HTMLFormElement;
  runtime: WarehouseRuntime;
  scene: THREE.Scene;
  shelfMeshes: Map<string, THREE.Mesh>;
  statusMessage: HTMLParagraphElement;
  shelfDimensions: HTMLParagraphElement;
  shelfTotal: HTMLSpanElement;
  shelfOccupied: HTMLSpanElement;
  shelfFree: HTMLSpanElement;
}): (shelfId: string) => void {
  const {
    config,
    form,
    runtime,
    scene,
    shelfMeshes,
    statusMessage,
    shelfDimensions,
    shelfTotal,
    shelfOccupied,
    shelfFree
  } = params;

  const widthField = getNumberInput(form, "width");
  const heightField = getNumberInput(form, "height");
  const depthField = getNumberInput(form, "depth");
  const shelfField = form.elements.namedItem("shelfId");

  const refreshShelfSummary = (shelfId: string) => {
    const shelf = config.shelves.find((s) => s.id === shelfId);
    if (!shelf) return;

    const status = calcShelfStatus(shelf, runtime.productsByShelf.get(shelfId) ?? []);

    shelfDimensions.textContent =
      `Ancho ${shelf.width} | Alto ${shelf.height} | Profundidad ${shelf.depth}`;
    shelfTotal.textContent = `Volumen total: ${formatMetric(status.total)}`;
    shelfOccupied.textContent = `Ocupado: ${formatMetric(status.occupied)}`;
    shelfFree.textContent = `Libre: ${formatMetric(status.free)}`;

    widthField.max = String(shelf.width);
    heightField.max = String(shelf.height);
    depthField.max = String(shelf.depth);

    widthField.value = clampInputValue(widthField.value, shelf.width);
    heightField.value = clampInputValue(heightField.value, shelf.height);
    depthField.value = clampInputValue(depthField.value, shelf.depth);
  };

  refreshShelfSummary(config.shelves[0]?.id ?? "");

  if (shelfField instanceof HTMLSelectElement) {
    shelfField.addEventListener("change", () => refreshShelfSummary(shelfField.value));
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const shelfId = String(data.get("shelfId") ?? "");
    const sku = String(data.get("sku") ?? "").trim();
    const width = Number(data.get("width"));
    const height = Number(data.get("height"));
    const depth = Number(data.get("depth"));

    const shelf = config.shelves.find((s) => s.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);

    if (!shelf || !shelfMesh) {
      setStatus(statusMessage, "No se encontro el estante seleccionado.", true);
      return;
    }

    if (!sku || width <= 0 || height <= 0 || depth <= 0) {
      setStatus(statusMessage, "Ingresa un SKU y dimensiones validas mayores a cero.", true);
      return;
    }

    const item: Item = { sku, name: `Producto ${sku}`, width, height, depth };
    const placement = placeItem(runtime, scene, item, shelf, shelfMesh);

    if (!placement) {
      setStatus(
        statusMessage,
        `No hay espacio para ${sku} en ${shelf.id}. El algoritmo no encontro una posicion valida.`,
        true
      );
      return;
    }

    const count = runtime.productsByShelf.get(shelfId)?.length ?? 0;
    updateLegendCount(shelfId, count);
    refreshShelfSummary(shelfId);
    setStatus(
      statusMessage,
      `${sku} agregado en ${shelf.id} en local (${placement.localPosition.x}, ${placement.localPosition.y}, ${placement.localPosition.z}).`,
      false
    );

    form.reset();
    if (shelfField instanceof HTMLSelectElement) {
      shelfField.value = shelfId;
    }
    refreshShelfSummary(shelfId);
  });

  return refreshShelfSummary;
}

/**
 * Conecta el formulario de búsqueda a la lógica de foco de cámara y eliminación de productos.
 */
export function wireSearchForm(params: {
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
  deleteProductBtn: HTMLButtonElement;
  onProductRemoved: (shelfId: string) => void;
}): void {
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
    deleteProductBtn,
    onProductRemoved
  } = params;

  let activeSku: string | null = null;

  const hideResult = () => {
    searchResult.hidden = true;
    activeSku = null;
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const sku = String(new FormData(searchForm).get("searchSku") ?? "").trim();

    if (!sku) {
      hideResult();
      setStatus(statusMessage, "Ingresa un SKU para ejecutar la busqueda.", true);
      return;
    }

    const targetMesh = runtime.productMeshBySku.get(sku);
    if (!targetMesh) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, `No existe un producto registrado con SKU ${sku}.`, true);
      return;
    }

    const shelfId = String(targetMesh.userData.shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) {
      clearHighlight(runtime);
      hideResult();
      setStatus(statusMessage, `No se encontro el estante asociado al SKU ${sku}.`, true);
      return;
    }

    const shelfLabel = config.shelves.find((s) => s.id === shelfId)?.label ?? shelfId;
    activeSku = sku;
    searchResultSku.textContent = sku;
    searchResultShelf.textContent = `${shelfId} · ${shelfLabel}`;
    searchResult.hidden = false;

    focusOnShelf(shelfMesh, camera, controls);
    highlightProduct(runtime, sku);
    setStatus(
      statusMessage,
      `SKU ${sku} encontrado en ${shelfId}. Camara enfocada y producto resaltado.`,
      false
    );
  });

  deleteProductBtn.addEventListener("click", () => {
    if (!activeSku) return;

    const sku = activeSku;
    const removedShelfId = removeItem(runtime, scene, sku);
    hideResult();

    if (removedShelfId) {
      const remaining = runtime.productsByShelf.get(removedShelfId)?.length ?? 0;
      updateLegendCount(removedShelfId, remaining);
      onProductRemoved(removedShelfId);
      setStatus(statusMessage, `Producto ${sku} eliminado del estante ${removedShelfId}.`, false);
    }

    const input = searchForm.elements.namedItem("searchSku");
    if (input instanceof HTMLInputElement) input.value = "";
  });
}

/**
 * Registra el listener de click sobre el canvas para seleccionar mallas de producto
 * via raycasting y mostrar sus detalles en el panel de info.
 */
export function wireSceneClick(params: {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  runtime: WarehouseRuntime;
  config: WarehouseConfig;
  clickInfo: HTMLDivElement;
  clickInfoSku: HTMLElement;
  clickInfoShelf: HTMLElement;
  clickInfoDims: HTMLElement;
}): void {
  const { canvas, camera, runtime, config, clickInfo, clickInfoSku, clickInfoShelf, clickInfoDims } =
    params;

  canvas.addEventListener("click", (event) => {
    const meshes = [...runtime.productMeshBySku.values()];
    const hit = pickMesh(event, camera, canvas, meshes);

    if (!hit) {
      clickInfo.hidden = true;
      return;
    }

    const { sku, width, height, depth, shelfId } = hit.userData as {
      sku: string;
      width: number;
      height: number;
      depth: number;
      shelfId: string;
    };

    const shelf = config.shelves.find((s) => s.id === shelfId);
    clickInfoSku.textContent = sku;
    clickInfoShelf.textContent = shelf ? `${shelfId} · ${shelf.label}` : shelfId;
    clickInfoDims.textContent = `${width} × ${height} × ${depth} m`;
    clickInfo.hidden = false;
  });
}

/** Muestra un mensaje de estado con clase visual de éxito o error. */
export function setStatus(
  element: HTMLParagraphElement,
  message: string,
  isError: boolean
): void {
  element.textContent = message;
  element.dataset.state = isError ? "error" : "success";
}

/** Actualiza el contador de productos en la leyenda del estante indicado. */
export function updateLegendCount(shelfId: string, count: number): void {
  const legendItem = document.querySelector<HTMLLIElement>(`#legend-${shelfId}`);
  const counter = legendItem?.querySelector("small");
  if (counter) {
    counter.textContent = `${count} producto${count === 1 ? "" : "s"}`;
  }
}

/**
 * Conecta el formulario de creación de estantes: valida los campos, construye
 * la malla y el sprite, los añade a la escena y actualiza el runtime y el HUD.
 */
export function wireShelfForm(params: {
  form: HTMLFormElement;
  config: WarehouseConfig;
  runtime: WarehouseRuntime;
  scene: THREE.Scene;
  shelfMeshes: Map<string, THREE.Mesh>;
  legend: HTMLUListElement;
  shelfSelect: HTMLSelectElement;
  statusMessage: HTMLParagraphElement;
}): void {
  const { form, config, runtime, scene, shelfMeshes, legend, shelfSelect, statusMessage } = params;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);

    const id = String(data.get("shelfId") ?? "").trim();
    const label = String(data.get("label") ?? "").trim();
    const width = Number(data.get("width"));
    const height = Number(data.get("height"));
    const depth = Number(data.get("depth"));
    const x = Number(data.get("x"));
    const z = Number(data.get("z"));

    if (!id || !label) {
      setStatus(statusMessage, "Ingresa un ID y un nombre para el estante.", true);
      return;
    }

    if (config.shelves.some((s) => s.id === id)) {
      setStatus(statusMessage, `Ya existe un estante con ID "${id}".`, true);
      return;
    }

    if (width <= 0 || height <= 0 || depth <= 0) {
      setStatus(statusMessage, "Las dimensiones del estante deben ser mayores a cero.", true);
      return;
    }

    const shelf = { id, label, width, height, depth, position: { x, y: height / 2, z } };
    const color = SHELF_PALETTE[config.shelves.length % SHELF_PALETTE.length];
    const { mesh, sprite } = buildShelfMesh(shelf, color);
    scene.add(mesh);
    scene.add(sprite);

    config.shelves.push(shelf);
    shelfMeshes.set(id, mesh);
    runtime.productsByShelf.set(id, []);
    runtime.productMeshesByShelf.set(id, []);

    const li = document.createElement("li");
    li.id = `legend-${id}`;
    li.innerHTML = `
      <div class="legend-head">
        <span class="legend-swatch" style="background:${color}"></span>
        <strong>${id}</strong>
      </div>
      <span>${label}</span>
      <small>0 productos</small>
    `;
    legend.append(li);

    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${id} | ${label}`;
    shelfSelect.append(option);

    setStatus(statusMessage, `Estante ${id} "${label}" agregado en (${x}, ${z}).`, false);
    form.reset();
  });
}

function getNumberInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`No se encontro el campo ${name}.`);
  }
  return field;
}

function clampInputValue(currentValue: string, maxValue: number): string {
  const parsed = Number(currentValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(Math.min(0.8, maxValue));
  return String(Math.min(parsed, maxValue));
}

function formatMetric(value: number): string {
  return Number(value.toFixed(2)).toString();
}
