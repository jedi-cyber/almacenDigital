import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { canPlace } from "./canPlace.js";
import { calcShelfStatus } from "./shelfStatus.js";
import type { Item, PlacedItem, Shelf, WarehouseConfig } from "./types.js";

interface WarehouseRuntime {
  productsByShelf: Map<string, PlacedItem[]>;
  productMeshesByShelf: Map<string, THREE.Mesh[]>;
  productMeshBySku: Map<string, THREE.Mesh>;
  blinkIntervalId: number | null;
}

/**
 * Inicializa la aplicación 3D del almacén dentro del contenedor indicado.
 */
export async function createWarehouseApp(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <section class="app-shell">
      <aside class="hud">
        <span class="eyebrow">Fase 5</span>
        <h1>Busqueda y Enfoque de Productos</h1>
        <p>
          Agrega productos con <code>canPlace()</code> y luego ubicalos por SKU con una
          busqueda que enfoca la camara y resalta el producto correcto.
        </p>
        <form class="search-form" id="search-form">
          <label>
            <span>Buscar SKU</span>
            <input name="searchSku" type="text" placeholder="SKU-001" />
          </label>
          <button type="submit">Buscar</button>
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
          <button type="submit">Agregar</button>
        </form>
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
    !shelfFree
  ) {
    throw new Error("No se pudieron crear los elementos base de la escena.");
  }

  const config = await loadWarehouseConfig();
  console.log("Warehouse config loaded:", config);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9dcc9");
  scene.fog = new THREE.Fog("#e9dcc9", 14, 26);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(8, 6, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1.4, 0);

  const runtime: WarehouseRuntime = {
    productsByShelf: new Map(config.shelves.map((shelf) => [shelf.id, []])),
    productMeshesByShelf: new Map(config.shelves.map((shelf) => [shelf.id, []])),
    productMeshBySku: new Map(),
    blinkIntervalId: null
  };

  addLights(scene);
  addFloor(scene);
  const shelfMeshes = addShelves(scene, config.shelves, legend, shelfSelect);

  wireProductForm({
    config,
    form: productForm,
    runtime,
    scene,
    shelfMeshes,
    statusMessage,
    shelfDimensions,
    shelfTotal,
    shelfOccupied,
    shelfFree
  });

  wireSearchForm({
    searchForm,
    runtime,
    shelfMeshes,
    camera,
    controls,
    statusMessage
  });

  const resize = () => {
    const viewport = canvas.parentElement;
    if (!viewport) {
      return;
    }

    const { clientWidth, clientHeight } = viewport;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  };

  resize();
  window.addEventListener("resize", resize);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

/**
 * Carga la configuración serializada del almacén desde la carpeta pública.
 */
export async function loadWarehouseConfig(): Promise<WarehouseConfig> {
  const response = await fetch("/warehouse-config.json");
  if (!response.ok) {
    throw new Error(`No se pudo cargar la configuracion: ${response.status}`);
  }

  const config = (await response.json()) as WarehouseConfig;

  if (!Array.isArray(config.shelves) || config.shelves.length < 6) {
    throw new Error("La configuracion del almacen debe incluir al menos 6 estantes.");
  }

  return config;
}

function addLights(scene: THREE.Scene): void {
  const ambientLight = new THREE.AmbientLight("#fff3d6", 0.9);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#fff2c4", 1.7);
  keyLight.position.set(8, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -14;
  keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 14;
  keyLight.shadow.camera.bottom = -14;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight("#b7d3ff", 0.5);
  fillLight.position.set(-6, 5, -4);
  scene.add(fillLight);
}

function addFloor(scene: THREE.Scene): void {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 20),
    new THREE.MeshStandardMaterial({
      color: "#c6b28f",
      roughness: 0.95,
      metalness: 0.05
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(28, 28, "#775b3a", "#a18d70");
  grid.position.y = 0.01;
  scene.add(grid);
}

function addShelves(
  scene: THREE.Scene,
  shelves: Shelf[],
  legend: HTMLUListElement,
  shelfSelect: HTMLSelectElement
): Map<string, THREE.Mesh> {
  const palette = ["#8b5e34", "#a56f3a", "#6d8a4f", "#46646f", "#ad8446", "#7a5c58"];
  const shelfMeshes = new Map<string, THREE.Mesh>();

  shelves.forEach((shelf, index) => {
    const geometry = new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth);
    const material = new THREE.MeshStandardMaterial({
      color: palette[index % palette.length],
      roughness: 0.72,
      metalness: 0.08
    });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(shelf.position.x, shelf.position.y, shelf.position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { shelfId: shelf.id, ...shelf };
    scene.add(mesh);
    shelfMeshes.set(shelf.id, mesh);

    const label = document.createElement("li");
    label.id = `legend-${shelf.id}`;
    label.innerHTML = `<strong>${shelf.id}</strong><span>${shelf.label}</span><small>0 productos</small>`;
    legend.append(label);

    const option = document.createElement("option");
    option.value = shelf.id;
    option.textContent = `${shelf.id} | ${shelf.label}`;
    shelfSelect.append(option);
  });

  return shelfMeshes;
}

function wireProductForm(params: {
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
}): void {
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
    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    if (!shelf) {
      return;
    }

    const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
    const shelfStatus = calcShelfStatus(shelf, placedItems);

    shelfDimensions.textContent =
      `Ancho ${shelf.width} | Alto ${shelf.height} | Profundidad ${shelf.depth}`;
    shelfTotal.textContent = `Volumen total: ${formatMetric(shelfStatus.total)}`;
    shelfOccupied.textContent = `Ocupado: ${formatMetric(shelfStatus.occupied)}`;
    shelfFree.textContent = `Libre: ${formatMetric(shelfStatus.free)}`;

    widthField.max = String(shelf.width);
    heightField.max = String(shelf.height);
    depthField.max = String(shelf.depth);

    widthField.value = clampInputValue(widthField.value, shelf.width);
    heightField.value = clampInputValue(heightField.value, shelf.height);
    depthField.value = clampInputValue(depthField.value, shelf.depth);
  };

  const initialShelfId = config.shelves[0]?.id ?? "";
  refreshShelfSummary(initialShelfId);

  if (shelfField instanceof HTMLSelectElement) {
    shelfField.addEventListener("change", () => {
      refreshShelfSummary(shelfField.value);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const shelfId = String(formData.get("shelfId") ?? "");
    const sku = String(formData.get("sku") ?? "").trim();
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    const depth = Number(formData.get("depth"));

    const shelf = config.shelves.find((entry) => entry.id === shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);

    if (!shelf || !shelfMesh) {
      setStatus(statusMessage, "No se encontro el estante seleccionado.", true);
      return;
    }

    if (!sku || width <= 0 || height <= 0 || depth <= 0) {
      setStatus(statusMessage, "Ingresa un SKU y dimensiones validas mayores a cero.", true);
      return;
    }

    const item: Item = {
      sku,
      name: `Producto ${sku}`,
      width,
      height,
      depth
    };
    const placedItems = runtime.productsByShelf.get(shelfId) ?? [];
    const placement = canPlace(shelf, placedItems, item);

    if (!placement) {
      setStatus(
        statusMessage,
        `No hay espacio para ${sku} en ${shelf.id}. El algoritmo no encontro una posicion valida.`,
        true
      );
      return;
    }

    const productMesh = addProductToScene(scene, item, placement, shelfMesh);
    placedItems.push(placement);
    runtime.productsByShelf.set(shelfId, placedItems);

    const productMeshes = runtime.productMeshesByShelf.get(shelfId) ?? [];
    productMeshes.push(productMesh);
    runtime.productMeshesByShelf.set(shelfId, productMeshes);
    runtime.productMeshBySku.set(item.sku, productMesh);

    updateLegendCount(shelf.id, placedItems.length);
    refreshShelfSummary(shelf.id);
    setStatus(
      statusMessage,
      `${sku} agregado en ${shelf.id} en local (${placement.localPosition.x}, ${placement.localPosition.y}, ${placement.localPosition.z}).`,
      false
    );

    form.reset();
    if (shelfField instanceof HTMLSelectElement) {
      shelfField.value = shelf.id;
    }
    refreshShelfSummary(shelf.id);
  });
}

function wireSearchForm(params: {
  searchForm: HTMLFormElement;
  runtime: WarehouseRuntime;
  shelfMeshes: Map<string, THREE.Mesh>;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  statusMessage: HTMLParagraphElement;
}): void {
  const { searchForm, runtime, shelfMeshes, camera, controls, statusMessage } = params;

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(searchForm);
    const sku = String(formData.get("searchSku") ?? "").trim();

    if (!sku) {
      setStatus(statusMessage, "Ingresa un SKU para ejecutar la busqueda.", true);
      return;
    }

    const targetMesh = runtime.productMeshBySku.get(sku);
    if (!targetMesh) {
      clearHighlight(runtime);
      setStatus(statusMessage, `No existe un producto registrado con SKU ${sku}.`, true);
      return;
    }

    const shelfId = String(targetMesh.userData.shelfId);
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) {
      clearHighlight(runtime);
      setStatus(statusMessage, `No se encontro el estante asociado al SKU ${sku}.`, true);
      return;
    }

    focusOnShelf(shelfMesh, camera, controls);
    highlightProduct(runtime, sku);
    setStatus(statusMessage, `SKU ${sku} encontrado en ${shelfId}. Camara enfocada y producto resaltado.`, false);
  });
}

/**
 * Convierte coordenadas locales del algoritmo a coordenadas globales de Three.js.
 */
export function localToWorld(
  localPosition: { x: number; y: number; z: number },
  item: Pick<Item, "width" | "height" | "depth">,
  shelfMesh: THREE.Mesh
): THREE.Vector3 {
  const geometryParameters = (
    shelfMesh.geometry as THREE.BoxGeometry
  ).parameters as THREE.BoxGeometry["parameters"];
  const shelfOrigin = shelfMesh.position.clone().sub(
    new THREE.Vector3(
      geometryParameters.width / 2,
      geometryParameters.height / 2,
      geometryParameters.depth / 2
    )
  );

  return shelfOrigin.add(new THREE.Vector3(localPosition.x, localPosition.y, localPosition.z)).add(
    new THREE.Vector3(item.width / 2, item.height / 2, item.depth / 2)
  );
}

function addProductToScene(
  scene: THREE.Scene,
  item: Item,
  placement: PlacedItem,
  shelfMesh: THREE.Mesh
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(item.width, item.height, item.depth),
    new THREE.MeshStandardMaterial({
      color: skuToColor(item.sku),
      roughness: 0.55,
      metalness: 0.14
    })
  );

  mesh.position.copy(localToWorld(placement.localPosition, item, shelfMesh));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    shelfId: shelfMesh.userData.shelfId,
    ...item,
    localPosition: placement.localPosition
  };
  scene.add(mesh);

  return mesh;
}

function focusOnShelf(
  shelfMesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): void {
  const target = shelfMesh.position.clone();
  const geometryParameters = (
    shelfMesh.geometry as THREE.BoxGeometry
  ).parameters as THREE.BoxGeometry["parameters"];
  const camOffset = new THREE.Vector3(
    Math.max(geometryParameters.width, 2.8),
    Math.max(geometryParameters.height * 0.9, 2),
    Math.max(geometryParameters.depth * 5, 4)
  );
  const camTarget = target.clone().add(camOffset);

  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);

  gsap.to(camera.position, {
    x: camTarget.x,
    y: camTarget.y,
    z: camTarget.z,
    duration: 1.5,
    ease: "power2.inOut"
  });

  gsap.to(controls.target, {
    x: target.x,
    y: target.y,
    z: target.z,
    duration: 1.5,
    ease: "power2.inOut",
    onUpdate: () => {
      camera.lookAt(controls.target);
      controls.update();
    }
  });
}

function highlightProduct(runtime: WarehouseRuntime, sku: string): boolean {
  clearHighlight(runtime);

  const target = runtime.productMeshBySku.get(sku);
  if (!target) {
    return false;
  }

  const material = target.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    return false;
  }

  material.emissive.setHex(0x00ffff);
  material.emissiveIntensity = 0.8;

  let isBright = true;
  runtime.blinkIntervalId = window.setInterval(() => {
    isBright = !isBright;
    material.emissiveIntensity = isBright ? 0.8 : 0.15;
  }, 500);

  return true;
}

function skuToColor(sku: string): string {
  let hash = 0;
  for (let index = 0; index < sku.length; index += 1) {
    hash = (hash * 31 + sku.charCodeAt(index)) >>> 0;
  }

  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
}

function setStatus(element: HTMLParagraphElement, message: string, isError: boolean): void {
  element.textContent = message;
  element.dataset.state = isError ? "error" : "success";
}

function clearHighlight(runtime: WarehouseRuntime): void {
  if (runtime.blinkIntervalId !== null) {
    window.clearInterval(runtime.blinkIntervalId);
    runtime.blinkIntervalId = null;
  }

  runtime.productMeshBySku.forEach((mesh) => {
    const material = mesh.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  });
}

function updateLegendCount(shelfId: string, count: number): void {
  const legendItem = document.querySelector<HTMLLIElement>(`#legend-${shelfId}`);
  const counter = legendItem?.querySelector("small");
  if (counter) {
    counter.textContent = `${count} producto${count === 1 ? "" : "s"}`;
  }
}

function getNumberInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) {
    throw new Error(`No se encontro el campo ${name}.`);
  }

  return field;
}

function clampInputValue(currentValue: string, maxValue: number): string {
  const parsedValue = Number(currentValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return String(Math.min(0.8, maxValue));
  }

  return String(Math.min(parsedValue, maxValue));
}

function formatMetric(value: number): string {
  return Number(value.toFixed(2)).toString();
}
