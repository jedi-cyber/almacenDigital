
import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { openReportWindow } from "./report-page.js";
import { SHELF_PALETTE, addDoorS01S02, addFloor, addLights, addWalls, buildScene, buildShelfMesh, collectBoardOffsets, getInstanceWorldPosition, localToWorld, setInstanceWorldPosition, updateShelfLabelSprite, updateShelfTransparency } from "./scene.js";
import { getProductMovedInsideShelfMessage, UI_COPY } from "./ui-copy.js";
import { buildHtml, populateShelves, setStatus, updateLegendCount, wireProductForm, wireSceneClick, wireSearchForm } from "./hud.js";
import type { PlacedItem, Shelf, WarehouseConfig } from "./types.js";
import { getSectionBoundaries } from "./canPlace.js";
import {
  createRuntime,
  loadPlacedProducts,
  loadWarehouseConfig,
  restoreItem,
  saveWarehouseConfig,
  setApiErrorHandler,
  updateItemPlacement,
  type WarehouseRuntime
} from "./warehouse.js";

/**
 * Inicializa la aplicación 3D del almacén dentro del contenedor indicado.
 */
export async function createWarehouseApp(container: HTMLElement): Promise<void> {
  const refs = buildHtml(container);

  // Propagar errores de red en background al status message del HUD.
  setApiErrorHandler((msg) => setStatus(refs.statusMessage, msg, true));

  // Indicar progreso en la pantalla de carga mientras las llamadas async resuelven.
  const loadingStatus = document.querySelector<HTMLParagraphElement>("#loading-status");
  const setLoadingText = (text: string) => { if (loadingStatus) loadingStatus.textContent = text; };

  setLoadingText(UI_COPY.status.loadingConfig);
  refs.statusMessage.textContent = UI_COPY.status.loadingConfig;
  refs.statusMessage.dataset.state = "loading";

  const config = await loadWarehouseConfig();

  const { scene, renderer, camera, controls } = buildScene(refs.canvas);
  const runtime = createRuntime(config);

  addLights(scene);
  addFloor(scene);
  addWalls(scene, config.shelves);
  const door = addDoorS01S02(scene, config.shelves);

  const shelfMeshes = new Map<string, THREE.Mesh>();
  const shelfSprites = new Map<string, THREE.Sprite>();

  config.shelves.forEach((shelf, index) => {
    // Garantizar que el estante descanse sobre el suelo (Y = altura/2).
    shelf.position.y = shelf.height / 2;

    const color = SHELF_PALETTE[index % SHELF_PALETTE.length];
    const { mesh, sprite } = buildShelfMesh(shelf, color);
    scene.add(mesh);
    scene.add(sprite);
    shelfMeshes.set(shelf.id, mesh);
    shelfSprites.set(shelf.id, sprite);
  });

  populateShelves(refs.legend, refs.shelfSelect, config.shelves);

  setLoadingText(UI_COPY.status.loadingProducts);
  refs.statusMessage.textContent = UI_COPY.status.loadingProducts;

  const savedProducts = await loadPlacedProducts();
  for (const { shelfId, item, localPosition } of savedProducts) {
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) continue;
    restoreItem(runtime, scene, shelfId, item, localPosition, shelfMesh);
    const count = runtime.productsByShelf.get(shelfId)?.length ?? 0;
    updateLegendCount(shelfId, count);
  }

  setStatus(refs.statusMessage, UI_COPY.status.initial, false);

  const { refreshShelfSummary, handleRemoveBoard } = wireProductForm({
    config,
    form: refs.productForm,
    runtime,
    scene,
    shelfMeshes,
    statusMessage: refs.statusMessage,
    shelfDimensions: refs.shelfDimensions,
    selectedShelfDisplay: refs.selectedShelfDisplay,
    shelfTotal: refs.shelfTotal,
    shelfOccupied: refs.shelfOccupied,
    shelfFree: refs.shelfFree,
    onShelfLabelUpdated: (shelfId, shelf) => {
      const sprite = shelfSprites.get(shelfId);
      if (!sprite) return;
      const idx = config.shelves.findIndex((entry) => entry.id === shelfId);
      const color = SHELF_PALETTE[(idx >= 0 ? idx : 0) % SHELF_PALETTE.length];
      updateShelfLabelSprite(sprite, shelf, color);
    },
    onShelfUpdated: () => saveWarehouseConfig(config),
    onShelfResized: (shelfId, shelf) => {
      const sprite = shelfSprites.get(shelfId);
      if (sprite) sprite.position.y = shelf.position.y + shelf.height / 2 + 0.7;
    }
  });

  const dragController = wireShelfDrag(
    refs.canvas,
    camera,
    controls,
    refs.editShelvesBtn,
    refs.statusMessage,
    shelfMeshes,
    shelfSprites,
    config,
    runtime
  );

  const selectProduct = wireSearchForm({
    searchForm: refs.searchForm,
    runtime,
    shelfMeshes,
    camera,
    controls,
    statusMessage: refs.statusMessage,
    config,
    scene,
    searchResult: refs.searchResult,
    searchResultSku: refs.searchResultSku,
    searchResultShelf: refs.searchResultShelf,
    moveProductBtn: refs.moveProductBtn,
    deleteProductBtn: refs.deleteProductBtn,
    transferProductBtn: refs.transferProductBtn,
    transferPanel: refs.transferPanel,
    transferShelfSelect: refs.transferShelfSelect,
    transferSectionSelect: refs.transferSectionSelect,
    transferConfirmBtn: refs.transferConfirmBtn,
    transferCancelBtn: refs.transferCancelBtn,
    productEditor: refs.productEditor,
    editorSkuDisplay: refs.editorSkuDisplay,
    editorForm: refs.editorForm,
    editorName: refs.editorName,
    editorWidth: refs.editorWidth,
    editorHeight: refs.editorHeight,
    editorDepth: refs.editorDepth,
    onMoveRequested: dragController.armProductMove,
    onProductRemoved: (shelfId: string) => {
      if (refs.shelfSelect.value === shelfId) {
        refreshShelfSummary(shelfId);
      }
    }
  });

  const clearSelectedProduct = () => {
    refs.productEditor.hidden = true;
  };

  wireSceneClick({
  canvas: refs.canvas,
  camera,
  runtime,
  config,
  clickInfo: refs.clickInfo,
  clickInfoSku: refs.clickInfoSku,
  clickInfoShelf: refs.clickInfoShelf,
  clickInfoDims: refs.clickInfoDims,
  isSuppressed: dragController.isSuppressed,

  onProductSelected: (product) => {
  selectProduct(product);

  const clickInfo = refs.clickInfo;
  const clickInfoSku = refs.clickInfoSku;
  const clickInfoShelf = refs.clickInfoShelf;
  const deleteBtn = refs.deleteProductBtn;

  clickInfoSku.textContent = `SKU: ${product.sku}`;
  clickInfoShelf.textContent = `Estante: ${product.shelfId}`;

  clickInfo.hidden = false;
  deleteBtn.hidden = false;
},

  onSelectionCleared: clearSelectedProduct
});
  // Abrir / cerrar la puerta al hacer clic sobre el panel
if (door) {
    const doorRaycaster = new THREE.Raycaster();
    const doorNdc = new THREE.Vector2();
    let doorOpen = false;

    refs.canvas.addEventListener("click", (e: MouseEvent) => {
      if (dragController.isSuppressed()) return;
      if (dragController.getSelectedShelfId() !== null) return;

      const rect = refs.canvas.getBoundingClientRect();
      doorNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      doorRaycaster.setFromCamera(doorNdc, camera);

      if (doorRaycaster.intersectObject(door.panel).length > 0) {
        doorOpen = !doorOpen;
        gsap.to(door.pivot.rotation, {
          y: doorOpen ? -Math.PI / 2 : 0,
          duration: 0.5,
          ease: "power2.inOut"
        });
      }
    });
  }  // ← solo UN cierre aquí
  // Wire the edit-panel's "Eliminar piso" button
  const removeBoardBtn = document.querySelector<HTMLButtonElement>("#remove-board-btn");
  removeBoardBtn?.addEventListener("click", handleRemoveBoard);

  // ── Reporte completo ──
  document.getElementById("open-report-btn")?.addEventListener("click", () => {
    openReportWindow({
      shelves: config.shelves,
      productsBySku: runtime.productEntryBySku,
      generatedAt: new Date(),
    });
  });

  const resize = () => {
    const viewport = refs.canvas.parentElement;
    if (!viewport) return;
    const { clientWidth, clientHeight } = viewport;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  };

  resize();
  window.addEventListener("resize", resize);
  const updateWASDMovement = wireWASDMovement(camera, controls);
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    updateWASDMovement(clock.getDelta());
    controls.update();
    updateShelfTransparency(camera, shelfMeshes);
    renderer.render(scene, camera);
  });
}

/**
 * Permite arrastrar estantes sobre el plano XZ con el botón izquierdo del mouse.
 * Mueve junto con el estante su sprite de etiqueta y todos sus productos.
 * Devuelve una función que indica si el siguiente click debe ignorarse (tras un drag).
 */
function wireShelfDrag(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  editShelvesBtn: HTMLButtonElement,
  statusMessage: HTMLParagraphElement,
  shelfMeshes: Map<string, THREE.Mesh>,
  shelfSprites: Map<string, THREE.Sprite>,
  config: WarehouseConfig,
  runtime: WarehouseRuntime
): { isSuppressed: () => boolean; armProductMove: (sku: string) => void; getSelectedShelfId: () => string | null } {
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const boardDragPlane = new THREE.Plane();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const intersectPoint = new THREE.Vector3();
  const lastIntersect = new THREE.Vector3();
  const rotatedBox = new THREE.Box3();
  const otherBox = new THREE.Box3();

  let selectedShelfId: string | null = null;
  let dragging = false;
  let activeShelfId: string | null = null;
  let activeProductSku: string | null = null;
  let pendingProductSku: string | null = null;
  let draggedProductLocalPosition: { x: number; y: number; z: number } | null = null;
  let activeBoardMesh: THREE.Mesh | null = null;
  let activeBoardShelfId: string | null = null;
  let pointerDownPos = { x: 0, y: 0 };
  let suppressClick = false;
  let editModeEnabled = false; // 👈 asegurate que sea false

  const toNdc = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  };

  /** Aplica o quita el resaltado amarillo sobre los hijos visuales del estante. */
  const setShelfEmissive = (mesh: THREE.Mesh | undefined, on: boolean) => {
    if (!mesh) return;
    mesh.children
      .filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === "__shelf_visual__")
      .forEach((c) => {
        const mat = c.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(on ? 0xffff00 : 0x000000);
        mat.emissiveIntensity = on ? 0.25 : 0;
      });
  };

  /** Resalta visualmente el estante seleccionado (amarillo) y limpia el anterior. */
  const applySelection = (id: string | null) => {
    if (selectedShelfId) setShelfEmissive(shelfMeshes.get(selectedShelfId), false);
    selectedShelfId = id;
    if (id) setShelfEmissive(shelfMeshes.get(id), true);
  };

  const syncEditButton = () => {
    const label = editModeEnabled ? UI_COPY.buttons.exitEdit : UI_COPY.buttons.moveShelf;
    editShelvesBtn.title = label;
    editShelvesBtn.setAttribute("aria-label", label);
    const hiddenLabel = editShelvesBtn.querySelector(".visually-hidden");
    if (hiddenLabel) hiddenLabel.textContent = label;
    editShelvesBtn.classList.toggle("edit-shelves-btn--active", editModeEnabled);
    canvas.classList.toggle("scene-canvas--edit-mode", editModeEnabled);
    console.log("UI actualizado, editMode:", editModeEnabled);
  };

  /** Configura dragPlane como un plano vertical que mira hacia la cámara,
   *  pasando por la posición del producto. Permite capturar movimiento vertical
   *  del mouse para cambiar de piso al arrastrar. */
  const setupProductDragPlane = (productPos: THREE.Vector3, shelfMesh: THREE.Mesh | undefined) => {
    if (shelfMesh) {
      const faceNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion);
      const toCam = new THREE.Vector3().subVectors(camera.position, productPos).normalize();
      if (faceNormal.dot(toCam) < 0) faceNormal.negate();
      dragPlane.setFromNormalAndCoplanarPoint(faceNormal, productPos);
    } else {
      dragPlane.normal.set(0, 1, 0);
      dragPlane.constant = -productPos.y;
    }
  };

  const armProductMove = (sku: string) => {
    pendingProductSku = sku;
    if (!editModeEnabled) {
      editModeEnabled = true;
      syncEditButton();
    }
  };

  editShelvesBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // 🔥 evita interferencias con canvas

  editModeEnabled = !editModeEnabled;

  console.log("EDIT MODE:", editModeEnabled);

  if (editModeEnabled) {
    // ACTIVAR modo edición
    controls.enabled = true; // 👈 importante, no lo desactives aquí
    canvas.style.cursor = "default";
  } else {
    // DESACTIVAR modo edición (reset total)
    dragging = false;
    activeShelfId = null;
    activeProductSku = null;
    pendingProductSku = null;
    draggedProductLocalPosition = null;

    controls.enabled = true;
    canvas.style.cursor = "";
    applySelection(null);
  }

  syncEditButton();

  setStatus(
    statusMessage,
    editModeEnabled
      ? "Modo edición ACTIVADO"
      : "Modo edición DESACTIVADO",
    false
  );
});

  syncEditButton();

  canvas.addEventListener("pointerdown", (event) => {
  console.log("CLICK canvas | editMode:", editModeEnabled);

  if (event.button !== 0) return;
  if (!editModeEnabled) return;

    if (pendingProductSku) {
      const pendingEntry = runtime.productEntryBySku.get(pendingProductSku);
      if (pendingEntry) {
        const pendingIMesh = runtime.instancedMeshByGeo.get(pendingEntry.geoKey);
        const pendingWorldPos = pendingIMesh
          ? getInstanceWorldPosition(pendingIMesh, pendingEntry.instanceIndex)
          : new THREE.Vector3();

        activeShelfId = pendingEntry.shelfId;
        activeProductSku = pendingProductSku;
        draggedProductLocalPosition = { ...pendingEntry.localPosition };
        pointerDownPos = { x: event.clientX, y: event.clientY };
        setupProductDragPlane(pendingWorldPos, shelfMeshes.get(activeShelfId));

        toNdc(event);
        raycaster.setFromCamera(pointerNdc, camera);
        if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
          lastIntersect.copy(intersectPoint);
        } else {
          lastIntersect.copy(pendingWorldPos);
        }

        dragging = true;
        controls.enabled = false;
        canvas.style.cursor = "grabbing";
        canvas.setPointerCapture(event.pointerId);
        applySelection(activeShelfId);
        pendingProductSku = null;
        return;
      }
      pendingProductSku = null;
    }

    toNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);

    const productHits = raycaster.intersectObjects([...runtime.instancedMeshByGeo.values()], false);
    if (productHits.length > 0) {
      const hit = productHits[0];
      const hitIMesh = hit.object as THREE.InstancedMesh;
      const hitInstanceId = hit.instanceId;
      if (hitInstanceId !== undefined) {
        const hitGeoKey = hitIMesh.userData.geoKey as string;
        const hitSku = runtime.instanceOwner.get(`${hitGeoKey}/${hitInstanceId}`);
        const hitEntry = hitSku ? runtime.productEntryBySku.get(hitSku) : undefined;
        if (hitEntry && hitSku) {
          const hitWorldPos = getInstanceWorldPosition(hitIMesh, hitInstanceId);
          activeShelfId = hitEntry.shelfId;
          activeProductSku = hitSku;
          draggedProductLocalPosition = { ...hitEntry.localPosition };
          pointerDownPos = { x: event.clientX, y: event.clientY };
          setupProductDragPlane(hitWorldPos, shelfMeshes.get(hitEntry.shelfId));

          if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
            lastIntersect.copy(intersectPoint);
          }

          dragging = true;
          controls.enabled = false;
          canvas.style.cursor = "grabbing";
          canvas.setPointerCapture(event.pointerId);
          applySelection(hitEntry.shelfId);
          return;
        }
      }
    }

    // Detectar clic sobre un piso arrastrable (búsqueda recursiva en hijos)
    const allBoardHits = raycaster.intersectObjects([...shelfMeshes.values()], true);
    const boardHit = allBoardHits.find((h) => (h.object as THREE.Mesh).userData.isDraggableBoard);
    if (boardHit) {
      const board = boardHit.object as THREE.Mesh;
      const shelfId = String(board.userData.shelfId);
      const shelfMesh = shelfMeshes.get(shelfId);
      if (shelfMesh) {
        activeBoardMesh = board;
        activeBoardShelfId = shelfId;
        pointerDownPos = { x: event.clientX, y: event.clientY };

        // Plano vertical que mira hacia la cámara, pasando por la posición mundial del piso
        const boardWorldPos = board.getWorldPosition(new THREE.Vector3());
        const camDir = new THREE.Vector3()
          .subVectors(camera.position, boardWorldPos)
          .setY(0)
          .normalize();
        boardDragPlane.setFromNormalAndCoplanarPoint(camDir, boardWorldPos);

        if (raycaster.ray.intersectPlane(boardDragPlane, intersectPoint)) {
          lastIntersect.copy(intersectPoint);
        }

        dragging = true;
        controls.enabled = false;
        canvas.style.cursor = "ns-resize";
        canvas.setPointerCapture(event.pointerId);
        applySelection(shelfId);
        return;
      }
    }

    const hits = raycaster.intersectObjects([...shelfMeshes.values()], false);

    if (hits.length === 0) {
      // Clic en espacio vacío → deseleccionar, OrbitControls mantiene control
      applySelection(null);
      return;
    }

    const clickedId = String((hits[0].object as THREE.Mesh).userData.shelfId);

    if (clickedId === selectedShelfId) {
      // Estante ya seleccionado → iniciar arrastre
      activeShelfId = clickedId;
      pointerDownPos = { x: event.clientX, y: event.clientY };

      // Elevar el plano de arrastre al centro del estante para que el rayo
      // lo intersecte aunque la cámara esté en ángulo bajo.
      groundPlane.constant = -(shelfMeshes.get(clickedId)?.position.y ?? 0);

      if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
        lastIntersect.copy(intersectPoint);
      }

      dragging = true;
      controls.enabled = false;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
    } else {
      // Primer clic sobre estante → solo seleccionar; OrbitControls sigue activo
      applySelection(clickedId);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!editModeEnabled) {
      if (!dragging) canvas.style.cursor = "";
      return;
    }

    toNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);

    if (dragging && activeProductSku && activeShelfId) {
      if (!raycaster.ray.intersectPlane(dragPlane, intersectPoint)) return;

      const dragEntry = runtime.productEntryBySku.get(activeProductSku);
      const shelfMesh = shelfMeshes.get(activeShelfId);
      const localPosition = draggedProductLocalPosition;
      const shelf = config.shelves.find((s) => s.id === activeShelfId);
      if (!dragEntry || !shelfMesh || !localPosition || !shelf) return;

      const nextLocalPosition = projectProductPositionInsideShelf(
        dragEntry.item,
        shelfMesh,
        intersectPoint,
        runtime.productsByShelf.get(activeShelfId) ?? [],
        shelf
      );

      if (!nextLocalPosition) return;

      draggedProductLocalPosition = nextLocalPosition;
      const newWorldPos = localToWorld(nextLocalPosition, dragEntry.item, shelfMesh);
      const dragIMesh = runtime.instancedMeshByGeo.get(dragEntry.geoKey);
      if (dragIMesh) {
        setInstanceWorldPosition(dragIMesh, dragEntry.instanceIndex, newWorldPos);
        dragEntry.labelSprite.position.set(
          newWorldPos.x,
          newWorldPos.y + dragEntry.item.height / 2 + 0.12,
          newWorldPos.z
        );
      }
      return;
    }

    if (dragging && activeBoardMesh && activeBoardShelfId) {
      if (!raycaster.ray.intersectPlane(boardDragPlane, intersectPoint)) return;

      const shelfMesh = shelfMeshes.get(activeBoardShelfId);
      const shelf = config.shelves.find((s) => s.id === activeBoardShelfId);
      if (!shelfMesh || !shelf) return;

      const boardT = Math.min(0.05, shelf.height / 22);
      const margin = boardT * 3;
      const minLocalY = -shelf.height / 2 + margin;
      const maxLocalY = shelf.height / 2 - margin;
      const rawLocalY = intersectPoint.y - shelfMesh.position.y;
      activeBoardMesh.position.y = Math.max(minLocalY, Math.min(maxLocalY, rawLocalY));

      lastIntersect.copy(intersectPoint);
      return;
    }

    if (dragging && activeShelfId) {
      if (!raycaster.ray.intersectPlane(groundPlane, intersectPoint)) return;

      const dx = intersectPoint.x - lastIntersect.x;
      const dz = intersectPoint.z - lastIntersect.z;
      lastIntersect.copy(intersectPoint);

      const draggedMesh = shelfMeshes.get(activeShelfId)!;
      draggedMesh.position.x += dx;
      draggedMesh.position.z += dz;

      // Comprobar colisión con otros estantes (contrae 0.01 para permitir contacto)
      const draggedBox = new THREE.Box3().setFromObject(draggedMesh);
      draggedBox.min.x += 0.01; draggedBox.min.z += 0.01;
      draggedBox.max.x -= 0.01; draggedBox.max.z -= 0.01;

      let collision = false;
      for (const [id, mesh] of shelfMeshes) {
        if (id === activeShelfId) continue;
        if (draggedBox.intersectsBox(new THREE.Box3().setFromObject(mesh))) {
          collision = true;
          break;
        }
      }

      if (collision) {
        // Revertir si hay superposición
        draggedMesh.position.x -= dx;
        draggedMesh.position.z -= dz;
      } else {
        shelfSprites.get(activeShelfId)?.position.add(new THREE.Vector3(dx, 0, dz));
        for (const sku of runtime.productSkusByShelf.get(activeShelfId) ?? []) {
          const entry = runtime.productEntryBySku.get(sku);
          if (!entry) continue;
          const iMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
          if (!iMesh) continue;
          const pos = getInstanceWorldPosition(iMesh, entry.instanceIndex);
          pos.x += dx;
          pos.z += dz;
          setInstanceWorldPosition(iMesh, entry.instanceIndex, pos);
          entry.labelSprite.position.x += dx;
          entry.labelSprite.position.z += dz;
        }
      }
      return;
    }

    // Cursor según estado
    const productHover = raycaster.intersectObjects([...runtime.instancedMeshByGeo.values()], false);
    if (productHover.length > 0) {
      canvas.style.cursor = "move";
      return;
    }

    // Piso arrastrable → cursor vertical
    const boardHover = raycaster.intersectObjects([...shelfMeshes.values()], true);
    if (boardHover.find((h) => (h.object as THREE.Mesh).userData.isDraggableBoard)) {
      canvas.style.cursor = "ns-resize";
      return;
    }

    const hover = raycaster.intersectObjects([...shelfMeshes.values()], false);
    if (hover.length > 0) {
      const hoveredId = String((hover[0].object as THREE.Mesh).userData.shelfId);
      canvas.style.cursor = hoveredId === selectedShelfId ? "grab" : "pointer";
    } else {
      canvas.style.cursor = "";
    }
  });

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;

    if (Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y) > 4) {
      suppressClick = true;
    }

    // Fin de arrastre de piso
    if (activeBoardMesh && activeBoardShelfId) {
      const shelfMesh = shelfMeshes.get(activeBoardShelfId);
      const shelf = config.shelves.find((s) => s.id === activeBoardShelfId);
      if (shelfMesh && shelf) {
        shelf.boardOffsets = collectBoardOffsets(shelfMesh, shelf.height);
        saveWarehouseConfig(config);
      }
      activeBoardMesh = null;
      activeBoardShelfId = null;
      dragging = false;
      controls.enabled = true;
      canvas.style.cursor = "";
      canvas.releasePointerCapture(event.pointerId);
      return;
    }

    if (!activeShelfId) {
      dragging = false;
      return;
    }

    if (activeProductSku && draggedProductLocalPosition) {
      updateItemPlacement(runtime, activeProductSku, draggedProductLocalPosition);
      setStatus(statusMessage, getProductMovedInsideShelfMessage(activeProductSku, activeShelfId), false);
    } else {
      const mesh = shelfMeshes.get(activeShelfId);
      const shelf = config.shelves.find((s) => s.id === activeShelfId);
      if (mesh && shelf) {
        shelf.position.x = mesh.position.x;
        shelf.position.z = mesh.position.z;
        saveWarehouseConfig(config);
      }
    }

    dragging = false;
    activeShelfId = null;
    activeProductSku = null;
    pendingProductSku = null;
    draggedProductLocalPosition = null;
    controls.enabled = true;
    canvas.style.cursor = "";
    canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (event) => {
    if (!editModeEnabled || (event.key !== "r" && event.key !== "R") || !selectedShelfId) return;

    const mesh = shelfMeshes.get(selectedShelfId);
    const shelf = config.shelves.find((s) => s.id === selectedShelfId);
    if (!mesh || !shelf) return;

    const angle = Math.PI / 2;
    const previousRotation = mesh.rotation.y;

    mesh.rotation.y += angle;

    rotatedBox.setFromObject(mesh);
    rotatedBox.min.x += 0.01;
    rotatedBox.min.z += 0.01;
    rotatedBox.max.x -= 0.01;
    rotatedBox.max.z -= 0.01;

    let collision = false;
    for (const [id, otherMesh] of shelfMeshes) {
      if (id === selectedShelfId) continue;
      otherBox.setFromObject(otherMesh);
      if (rotatedBox.intersectsBox(otherBox)) {
        collision = true;
        break;
      }
    }

    if (collision) {
      mesh.rotation.y = previousRotation;
      return;
    }

    shelf.rotationY = (shelf.rotationY ?? 0) + angle;
    saveWarehouseConfig(config);

    // Reposicionar los productos existentes rotando su offset alrededor del centro del estante
    const cx = mesh.position.x;
    const cz = mesh.position.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const sku of runtime.productSkusByShelf.get(selectedShelfId) ?? []) {
      const entry = runtime.productEntryBySku.get(sku);
      if (!entry) continue;
      const iMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
      if (!iMesh) continue;
      const pos = getInstanceWorldPosition(iMesh, entry.instanceIndex);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      pos.x = cx + dx * cos - dz * sin;
      pos.z = cz + dx * sin + dz * cos;
      setInstanceWorldPosition(iMesh, entry.instanceIndex, pos);
      const ldx = entry.labelSprite.position.x - cx;
      const ldz = entry.labelSprite.position.z - cz;
      entry.labelSprite.position.x = cx + ldx * cos - ldz * sin;
      entry.labelSprite.position.z = cz + ldx * sin + ldz * cos;
    }
  });

  return {
    isSuppressed: () => {
      const val = suppressClick;
      suppressClick = false;
      return val;
    },
    armProductMove,
    getSelectedShelfId: () => selectedShelfId
  };
}

function projectProductPositionInsideShelf(
  item: { sku: string; width: number; height: number; depth: number },
  shelfMesh: THREE.Mesh,
  worldPoint: THREE.Vector3,
  placedItems: PlacedItem[],
  shelf: Shelf
): { x: number; y: number; z: number } | null {
  const geometry = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const localPoint = shelfMesh.worldToLocal(worldPoint.clone());

  // Determinar el piso al que apunta el ratón usando las posiciones reales de los pisos
  const boundaries = getSectionBoundaries(shelf);
  const numSections = boundaries.length - 1;
  const bottomRelY = localPoint.y + geometry.height / 2;
  const canPlaceYRaw = bottomRelY - item.height / 2;
  let sectionIndex = 0;
  for (let i = numSections - 1; i >= 0; i--) {
    if (bottomRelY >= boundaries[i]) { sectionIndex = i; break; }
  }
  const sectionMinY = boundaries[sectionIndex];
  const sectionMaxY = Math.max(sectionMinY, boundaries[sectionIndex + 1] - item.height);
  const snappedY = clamp(canPlaceYRaw, sectionMinY, sectionMaxY);

  const nextLocalPosition = {
    x: clamp(localPoint.x + geometry.width / 2 - item.width / 2, 0, geometry.width - item.width),
    y: clamp(snappedY, 0, geometry.height - item.height),
    z: clamp(localPoint.z + geometry.depth / 2 - item.depth / 2, 0, geometry.depth - item.depth)
  };

  const collides = placedItems.some((placedItem) => {
    if (placedItem.item.sku === item.sku) return false;
    return boxesOverlap(nextLocalPosition, item, placedItem.localPosition, placedItem.item);
  });

  return collides ? null : nextLocalPosition;
}

function boxesOverlap(
  aPosition: { x: number; y: number; z: number },
  aSize: { width: number; height: number; depth: number },
  bPosition: { x: number; y: number; z: number },
  bSize: { width: number; height: number; depth: number }
): boolean {
  return (
    aPosition.x < bPosition.x + bSize.width &&
    aPosition.x + aSize.width > bPosition.x &&
    aPosition.y < bPosition.y + bSize.height &&
    aPosition.y + aSize.height > bPosition.y &&
    aPosition.z < bPosition.z + bSize.depth &&
    aPosition.z + aSize.depth > bPosition.z
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wireWASDMovement(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): (deltaSeconds: number) => void {
  const pressedKeys = new Set<string>();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const moveSpeed = 4.5;

  const isTypingInField = (): boolean => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return false;
    }

    const tagName = active.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      active.isContentEditable
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d"].includes(key)) return;
    if (isTypingInField()) return;

    pressedKeys.add(key);
    event.preventDefault();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key.toLowerCase());
  };

  const clearPressedKeys = () => {
    pressedKeys.clear();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearPressedKeys);

  return (deltaSeconds: number) => {
    if (pressedKeys.size === 0) return;

    forward.subVectors(controls.target, camera.position).setY(0);
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();

    right.crossVectors(forward, worldUp).normalize();

    movement.set(0, 0, 0);
    if (pressedKeys.has("w")) movement.add(forward);
    if (pressedKeys.has("s")) movement.sub(forward);
    if (pressedKeys.has("d")) movement.add(right);
    if (pressedKeys.has("a")) movement.sub(right);
    if (movement.lengthSq() < 1e-6) return;

    movement.normalize().multiplyScalar(moveSpeed * deltaSeconds);
    camera.position.add(movement);
    controls.target.add(movement);
  };
}
