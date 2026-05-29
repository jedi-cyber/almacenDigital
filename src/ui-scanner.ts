// ─────────────────────────────────────────────────────────────────────────────
// ui-scanner.ts
// Panel de escaneo: flujo completo → escanear SKU → pedir unidades
//                                  → elegir estante → registrar caja
// ─────────────────────────────────────────────────────────────────────────────
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { Shelf } from "./types.js";
import {
  escanearProducto,
  registrarCaja,
  registrarMovimiento,
  getCategorias,
  crearProducto,
  type ProductoEscaneado,
  type Categoria,
} from "./inventarioService.js";
// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────

type ScanStep = "idle" | "scanned" | "confirming" | "nuevo";
interface ScanState {
  step: ScanStep;
  producto: ProductoEscaneado | null;
  codigoCaja: string;
  categorias: Categoria[];
  tipoMovimiento: "ENTRADA" | "SALIDA";
}
// ===============================
// ZXing / Cámara
// ===============================
let zxingReader: BrowserMultiFormatReader | null = null;
let cameraStream: MediaStream | null = null;
// ─────────────────────────────────────────────────────────────────────────────
// buildScannerPanel
// Inserta el panel en el contenedor indicado y devuelve la función de limpieza
// ─────────────────────────────────────────────────────────────────────────────

export function buildScannerPanel(
  container: HTMLElement,
  shelves: Shelf[]
): () => void {
const state: ScanState = {
  step: "idle",
  producto: null,
  codigoCaja: "",
  categorias: [],
  tipoMovimiento: "ENTRADA",
};

// Precargar categorías en segundo plano
getCategorias().then(cats => { state.categorias = cats; }).catch(() => {});

  container.innerHTML = renderPanel(shelves);

  const refs = getRefs(container);
  bindEvents(refs, state, shelves);

  // Autofocus al abrir el panel
  setTimeout(() => refs.skuInput.focus(), 50);

  // Devuelve función de limpieza
  return () => {
    container.innerHTML = "";
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// HTML del panel
// ─────────────────────────────────────────────────────────────────────────────

function renderPanel(shelves: Shelf[]): string {
  const shelfOptions = shelves
    .map((s) => `<option value="${s.id}">${s.id} | ${s.label}</option>`)
    .join("");

  return `
    <section class="scanner-panel" id="scanner-panel" aria-label="Panel de registro de caja">

      <div class="scanner-panel-head">
        <strong class="scanner-panel-title">Registrar movimiento</strong>
      </div>

      <!-- Paso 1: ingresar / escanear SKU -->
      <div class="scanner-step" id="scanner-step-sku">
        <label class="scanner-label">
          <span>Código de barras / SKU</span>
          <div class="scanner-input-row">
  <button
    type="button"
    id="scanner-camera-btn"
    class="scanner-btn scanner-btn--soft"
  >
    📷 Cámara
  </button>
            <input
              id="scanner-sku-input"
              type="text"
              placeholder="Escanea o escribe el SKU"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              type="button"
              id="scanner-submit-btn"
              class="scanner-btn scanner-btn--primary"
              aria-label="Buscar producto"
            >
              Buscar
            </button>
          </div>
        </label>
        <p
          class="scanner-status"
          id="scanner-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          hidden
        ></p>

        <video
  id="scanner-video"
  class="scanner-video"
  autoplay
  playsinline
  hidden
></video>

      </div>

      <!-- Paso 2: producto encontrado → pedir unidades y estante -->
      <div class="scanner-step" id="scanner-step-confirm" hidden>

        <div class="scanner-product-info" id="scanner-product-info" aria-live="polite">
          <!-- se rellena dinámicamente -->
        </div>

        <div class="scanner-fields">

          <div class="scanner-tipo-row">
            <button type="button" id="scanner-tipo-entrada" class="scanner-btn scanner-btn--tipo scanner-btn--tipo-active" data-tipo="ENTRADA">
              📥 ENTRADA
            </button>
            <button type="button" id="scanner-tipo-salida" class="scanner-btn scanner-btn--tipo" data-tipo="SALIDA">
              📤 SALIDA
            </button>
          </div>

          <label class="scanner-label">
            <span>Cantidad</span>
            <input
              id="scanner-units-input"
              type="number"
              min="1"
              step="1"
              value="1"
              aria-describedby="scanner-units-hint"
            />
            <small id="scanner-units-hint" class="scanner-units-hint"></small>
          </label>

          <label class="scanner-label">
            <span>Estante destino</span>
            <select id="scanner-shelf-select">
              ${shelfOptions}
            </select>
          </label>
        </div>

        <div class="scanner-actions">
          <button
            type="button"
            id="scanner-confirm-btn"
            class="scanner-btn scanner-btn--primary"
          >
            ✅ Confirmar movimiento
          </button>
          <button
            type="button"
            id="scanner-cancel-btn"
            class="scanner-btn scanner-btn--ghost"
          >
            Cancelar
          </button>
        </div>
      </div>

      <!-- Paso 4: producto nuevo — formulario de registro rápido -->
      <div class="scanner-step" id="scanner-step-nuevo" hidden>
        <p class="scanner-status" data-state="warn">
          ⚠️ Producto no encontrado. Regístralo rápido:
        </p>
        <div class="scanner-fields">
          <label class="scanner-label">
            <span>Nombre del producto</span>
            <input id="scanner-nuevo-name" type="text" placeholder="Ej: Cable HDMI 2m" autocomplete="off" />
          </label>
          <label class="scanner-label">
            <span>Categoría</span>
            <select id="scanner-nuevo-categoria"></select>
          </label>
          <label class="scanner-label">
            <span>Stock inicial</span>
            <input id="scanner-nuevo-stock" type="number" min="1" value="1" />
          </label>
          <label class="scanner-label">
            <span>Estante destino</span>
            <select id="scanner-nuevo-shelf"></select>
          </label>
        </div>
        <p class="scanner-status" id="scanner-nuevo-status" hidden></p>
        <div class="scanner-actions">
          <button type="button" id="scanner-nuevo-guardar-btn" class="scanner-btn scanner-btn--primary">
            💾 Guardar producto
          </button>
          <button type="button" id="scanner-nuevo-cancelar-btn" class="scanner-btn scanner-btn--ghost">
            Cancelar
          </button>
        </div>
      </div>

      <!-- Paso 3: resultado del registro -->
      <div class="scanner-step" id="scanner-step-result" hidden>
        <p
          class="scanner-result"
          id="scanner-result"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        ></p>
        <button
          type="button"
          id="scanner-new-btn"
          class="scanner-btn scanner-btn--soft"
        >
          Escanear otra caja
        </button>
      </div>

    </section>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Referencias a elementos del DOM
// ─────────────────────────────────────────────────────────────────────────────

interface ScannerRefs {

  skuInput: HTMLInputElement;
  submitBtn: HTMLButtonElement;

  cameraBtn: HTMLButtonElement;
  video: HTMLVideoElement;

  statusMsg: HTMLParagraphElement;

  stepSku: HTMLElement;
  stepConfirm: HTMLElement;
  stepResult: HTMLElement;

  productInfo: HTMLElement;

  unitsInput: HTMLInputElement;
  unitsHint: HTMLElement;

  shelfSelect: HTMLSelectElement;

  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  tipoEntradaBtn: HTMLButtonElement;
  tipoSalidaBtn: HTMLButtonElement;

  resultMsg: HTMLParagraphElement;
  newBtn: HTMLButtonElement;

  // Paso 4
  stepNuevo: HTMLElement;
  nuevoName: HTMLInputElement;
  nuevoCategoria: HTMLSelectElement;
  nuevoStock: HTMLInputElement;
  nuevoShelf: HTMLSelectElement;
  nuevoStatus: HTMLParagraphElement;
  nuevoGuardarBtn: HTMLButtonElement;
  nuevoCancelarBtn: HTMLButtonElement;
}

function getRefs(container: HTMLElement): ScannerRefs {

  const q = <T extends HTMLElement>(selector: string): T => {

    const element = container.querySelector<T>(selector);

    if (!element) {
      throw new Error(
        `ui-scanner: no se encontró "${selector}"`
      );
    }

    return element;
  };

  return {

    // Paso 1
    skuInput: q<HTMLInputElement>("#scanner-sku-input"),
    submitBtn: q<HTMLButtonElement>("#scanner-submit-btn"),

    // Cámara
    cameraBtn: q<HTMLButtonElement>("#scanner-camera-btn"),
    video: q<HTMLVideoElement>("#scanner-video"),

    // Estado
    statusMsg: q<HTMLParagraphElement>("#scanner-status"),

    // Steps
    stepSku: q<HTMLElement>("#scanner-step-sku"),
    stepConfirm: q<HTMLElement>("#scanner-step-confirm"),
    stepResult: q<HTMLElement>("#scanner-step-result"),

    // Producto
    productInfo: q<HTMLElement>("#scanner-product-info"),

    // Inputs
    unitsInput: q<HTMLInputElement>("#scanner-units-input"),
    unitsHint: q<HTMLElement>("#scanner-units-hint"),

    shelfSelect: q<HTMLSelectElement>("#scanner-shelf-select"),

    // Botones
    confirmBtn: q<HTMLButtonElement>("#scanner-confirm-btn"),
    cancelBtn: q<HTMLButtonElement>("#scanner-cancel-btn"),
    tipoEntradaBtn: q<HTMLButtonElement>("#scanner-tipo-entrada"),
    tipoSalidaBtn: q<HTMLButtonElement>("#scanner-tipo-salida"),

    // Resultado
    resultMsg: q<HTMLParagraphElement>("#scanner-result"),

    // Nuevo escaneo
  newBtn: q<HTMLButtonElement>("#scanner-new-btn"),

  // Paso 4: producto nuevo
  stepNuevo: q<HTMLElement>("#scanner-step-nuevo"),
  nuevoName: q<HTMLInputElement>("#scanner-nuevo-name"),
  nuevoCategoria: q<HTMLSelectElement>("#scanner-nuevo-categoria"),
  nuevoStock: q<HTMLInputElement>("#scanner-nuevo-stock"),
  nuevoShelf: q<HTMLSelectElement>("#scanner-nuevo-shelf"),
  nuevoStatus: q<HTMLParagraphElement>("#scanner-nuevo-status"),
  nuevoGuardarBtn: q<HTMLButtonElement>("#scanner-nuevo-guardar-btn"),
  nuevoCancelarBtn: q<HTMLButtonElement>("#scanner-nuevo-cancelar-btn"),
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// Eventos
// ─────────────────────────────────────────────────────────────────────────────

function bindEvents(
  refs: ScannerRefs,
  state: ScanState,
  _shelves: Shelf[]
): void {

  // Buscar producto al hacer clic o presionar Enter
  refs.submitBtn.addEventListener("click", () => handleScan(refs, state, _shelves));
  refs.skuInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(refs, state, _shelves);
    }
  });

  // Botones ENTRADA / SALIDA
  refs.tipoEntradaBtn.addEventListener("click", () => {
    state.tipoMovimiento = "ENTRADA";
    refs.tipoEntradaBtn.classList.add("scanner-btn--tipo-active");
    refs.tipoSalidaBtn.classList.remove("scanner-btn--tipo-active");
  });
  refs.tipoSalidaBtn.addEventListener("click", () => {
    state.tipoMovimiento = "SALIDA";
    refs.tipoSalidaBtn.classList.add("scanner-btn--tipo-active");
    refs.tipoEntradaBtn.classList.remove("scanner-btn--tipo-active");
  });

  // Confirmar registro
  refs.confirmBtn.addEventListener("click", () => handleConfirm(refs, state));

  // Cancelar → volver al paso 1
  refs.cancelBtn.addEventListener("click", () => resetToSku(refs, state));

  // Escanear otra caja → volver al paso 1
  refs.newBtn.addEventListener("click", () => resetToSku(refs, state));

    // Abrir cámara y escanear código
  refs.cameraBtn.addEventListener("click", async () => {

    try {

      // Mostrar video
      refs.video.hidden = false;

      // Crear lector ZXing
      zxingReader = new BrowserMultiFormatReader();

      // Obtener cámaras disponibles
      const devices =
        await BrowserMultiFormatReader.listVideoInputDevices();

      // Validar cámara
      if (devices.length === 0) {

        showStatus(
          refs,
          "No se encontró ninguna cámara.",
          true
        );

        return;
      }

      // Primera cámara disponible
      const selectedDeviceId = devices[0].deviceId;

      // Iniciar escaneo
      await zxingReader.decodeFromVideoDevice(
        selectedDeviceId,
        refs.video,

        (result) => {

          // Si detecta código
          if (result) {

            // Colocar código en input
            refs.skuInput.value = result.getText();

            // Detener cámara
            zxingReader?.reset();

            // Ocultar video
            refs.video.hidden = true;

            // Buscar producto automáticamente
            handleScan(refs, state, _shelves);
          }
        }
      );

    } catch (error) {

      console.error(error);

      showStatus(
        refs,
        "No se pudo abrir la cámara.",
        true
      );
    }
  });

  // Botones del formulario de producto nuevo
  refs.nuevoGuardarBtn.addEventListener("click", () => handleGuardarNuevo(refs, state, _shelves));
  refs.nuevoCancelarBtn.addEventListener("click", () => resetToSku(refs, state));

// Validar unidades en tiempo real: solo permitir enteros positivos
  refs.unitsInput.addEventListener("input", () => {
    const val = refs.unitsInput.value;
    if (val === "" || val === "-" || val === "0") return;
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) refs.unitsInput.value = "1";
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// Paso 1 → escanear SKU y buscar producto
// ─────────────────────────────────────────────────────────────────────────────

async function handleScan(refs: ScannerRefs, state: ScanState, shelves: Shelf[]): Promise<void> {
  // Si el código escaneado contiene '|', extraer todos los segmentos
  // y quedarse con el que tenga formato EAN (8-14 dígitos numéricos)
  const raw = refs.skuInput.value.trim();
  const segmentos = raw.split("|").map(s => s.trim()).filter(Boolean);
  const ean = segmentos.find(s => /^\d{8,14}$/.test(s));
  const sku = ean ?? raw;

  console.log("SKU escaneado:", sku); // ← aquí

  if (!sku) {
    showStatus(refs, "Ingresa un SKU o escanea el código de barras.", true);
    return;
  }

  setLoading(refs, true);
  hideStatus(refs);

  try {
    const producto = await escanearProducto(sku);
    state.producto   = producto;
    state.codigoCaja = sku;
    state.step       = "scanned";
    showConfirmStep(refs, producto);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Producto no encontrado.") {
      state.codigoCaja = sku;
      state.step       = "nuevo";
      showNuevoProductoStep(refs, state, shelves);
    } else {
      showStatus(refs, msg || "Error al buscar el producto.", true);
    }
  } finally {
    setLoading(refs, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 2 → mostrar info del producto y pedir unidades + estante
// ─────────────────────────────────────────────────────────────────────────────

function showConfirmStep(refs: ScannerRefs, producto: ProductoEscaneado): void {
  refs.stepSku.hidden     = true;
  refs.stepResult.hidden  = true;
  refs.stepNuevo.hidden   = true;
  refs.stepConfirm.hidden = false;

  // Resetear botones ENTRADA/SALIDA al estado inicial
  refs.tipoEntradaBtn.classList.add("scanner-btn--tipo-active");
  refs.tipoSalidaBtn.classList.remove("scanner-btn--tipo-active");

  refs.productInfo.innerHTML = `
    <dl class="scanner-product-dl">
      <dt>Producto</dt><dd>${escHtml(producto.nombre)}</dd>
      <dt>SKU</dt><dd><code>${escHtml(producto.sku)}</code></dd>
      <dt>Categoría</dt><dd>${escHtml(producto.categoria_nombre)}</dd>
      <dt>Stock actual</dt><dd><strong>${producto.stock ?? 0}</strong> unidades</dd>
    </dl>
  `;

  refs.unitsInput.removeAttribute("max");
  refs.unitsInput.min   = "1";
  refs.unitsInput.value = "1";
  refs.unitsHint.textContent = "Ingresa la cantidad a registrar";
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 3 → confirmar y registrar la caja
// ─────────────────────────────────────────────────────────────────────────────

async function handleConfirm(refs: ScannerRefs, state: ScanState): Promise<void> {
  if (!state.producto) return;

  const unidades = parseInt(refs.unitsInput.value, 10);
  const shelfId  = refs.shelfSelect.value;

  if (!unidades || unidades < 1) {
    showStatus(refs, "Ingresa al menos 1 unidad.", true);
    return;
  }

  // Validar stock suficiente en SALIDA
  if (state.tipoMovimiento === "SALIDA" && unidades > (state.producto.stock ?? 0)) {
    const stockActual = state.producto.stock ?? 0;
    const stockResultante = stockActual - unidades;
    const esAdmin = (window as any).__isAdmin === true;

    if (!esAdmin) {
      showStatus(refs, `🔴 Stock insuficiente. Stock actual: ${stockActual}`, true);
      return;
    }

    // Admin: pedir confirmación antes de forzar
    const forzar = window.confirm(
      `⚠️ Stock insuficiente.\n\nStock actual: ${stockActual}\nCantidad solicitada: ${unidades}\nStock resultante: ${stockResultante}\n\n¿Forzar la salida y dejar el stock en negativo?`
    );
    if (!forzar) return;
  }

  setConfirmLoading(refs, true);

  try {
    const result = await registrarMovimiento({
      sku:      state.producto.sku,
      caja_id:  0,
      unidades,
      tipo:     state.tipoMovimiento,
    });

    state.step = "confirming";
    showResultStep(refs, state.tipoMovimiento, unidades, shelfId, state.producto, result.stock_nuevo);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al registrar el movimiento.";
    showStatus(refs, msg, true);
  } finally {
    setConfirmLoading(refs, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mostrar resultado final
// ─────────────────────────────────────────────────────────────────────────────

function showResultStep(
  refs: ScannerRefs,
  tipo: string,
  unidades: number,
  shelfId: string,
  producto: ProductoEscaneado,
  stockNuevo: number
): void {
  refs.stepConfirm.hidden = true;
  refs.stepSku.hidden     = true;
  refs.stepResult.hidden  = false;

  const esEntrada = tipo === "ENTRADA";
  refs.resultMsg.dataset.state = "success";
  refs.resultMsg.innerHTML = `
    <strong>${esEntrada ? "✅ ENTRADA registrada" : "✅ SALIDA registrada"}</strong><br/>
    <strong>${unidades}</strong> unidad${unidades !== 1 ? "es" : ""}
    de <strong>${escHtml(producto.nombre)}</strong><br/>
    Stock actualizado: <strong>${stockNuevo}</strong> unidades
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset al paso 1
// ─────────────────────────────────────────────────────────────────────────────

function resetToSku(refs: ScannerRefs, state: ScanState): void {
  state.step      = "idle";
  state.producto  = null;
  state.codigoCaja = "";

  refs.stepConfirm.hidden = true;
  refs.stepResult.hidden  = true;
  refs.stepNuevo.hidden   = true;
  refs.stepSku.hidden     = false;

  refs.skuInput.value = "";
  refs.skuInput.focus();
  hideStatus(refs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────────────────────

function showStatus(refs: ScannerRefs, msg: string, isError: boolean): void {
  refs.statusMsg.textContent  = msg;
  refs.statusMsg.dataset.state = isError ? "error" : "success";
  refs.statusMsg.hidden = false;
}

function hideStatus(refs: ScannerRefs): void {
  refs.statusMsg.textContent = "";
  refs.statusMsg.hidden = true;
  delete refs.statusMsg.dataset.state;
}

function setLoading(refs: ScannerRefs, loading: boolean): void {
  refs.submitBtn.disabled  = loading;
  refs.skuInput.disabled   = loading;
  refs.submitBtn.textContent = loading ? "Buscando…" : "Buscar";
}

function setConfirmLoading(refs: ScannerRefs, loading: boolean): void {
  refs.confirmBtn.disabled = loading;
  refs.cancelBtn.disabled  = loading;
  refs.confirmBtn.textContent = loading ? "Registrando…" : "✅ Confirmar movimiento";
}
// ─────────────────────────────────────────────────────────────────────────────
// Paso 4 → mostrar formulario de producto nuevo
// ─────────────────────────────────────────────────────────────────────────────

function showNuevoProductoStep(
  refs: ScannerRefs,
  state: ScanState,
  shelves: Shelf[]
): void {
  refs.stepSku.hidden     = true;
  refs.stepConfirm.hidden = true;
  refs.stepResult.hidden  = true;
  refs.stepNuevo.hidden   = false;

  // Poblar categorías
  refs.nuevoCategoria.innerHTML = state.categorias
    .map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`)
    .join("");

  // Poblar estantes
  refs.nuevoShelf.innerHTML = shelves
    .map(s => `<option value="${s.id}">${escHtml(s.id)} | ${escHtml(s.label)}</option>`)
    .join("");

  refs.nuevoName.value   = "";
  refs.nuevoStock.value  = "1";
  refs.nuevoStatus.hidden = true;
  setTimeout(() => refs.nuevoName.focus(), 50);
}

async function handleGuardarNuevo(
  refs: ScannerRefs,
  state: ScanState,
  shelves: Shelf[]
): Promise<void> {
  const name        = refs.nuevoName.value.trim();
  const categoriaId = parseInt(refs.nuevoCategoria.value, 10);
  const stock       = parseInt(refs.nuevoStock.value, 10);
  const shelfId     = refs.nuevoShelf.value;

  if (!name) {
    refs.nuevoStatus.textContent  = "El nombre es obligatorio.";
    refs.nuevoStatus.dataset.state = "error";
    refs.nuevoStatus.hidden = false;
    return;
  }

  refs.nuevoGuardarBtn.disabled     = true;
  refs.nuevoGuardarBtn.textContent  = "Guardando…";

  try {
    await crearProducto({ sku: state.codigoCaja, name, categoria_id: categoriaId, stock_inicial: stock, shelf_id: shelfId });

    // Ahora buscarlo de nuevo para continuar el flujo normal
    const producto = await escanearProducto(state.codigoCaja);
    state.producto = producto;
    state.step     = "scanned";
    refs.stepNuevo.hidden = true;
    showConfirmStep(refs, producto);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al guardar el producto.";
    refs.nuevoStatus.textContent   = msg;
    refs.nuevoStatus.dataset.state = "error";
    refs.nuevoStatus.hidden        = false;
  } finally {
    refs.nuevoGuardarBtn.disabled    = false;
    refs.nuevoGuardarBtn.textContent = "💾 Guardar producto";
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
