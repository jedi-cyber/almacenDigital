import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { SHELF_PALETTE, addFloor, addLights, buildScene, buildShelfMesh, collectBoardOffsets, localToWorld, updateShelfTransparency } from "./scene.js";
import { getProductMovedInsideShelfMessage, UI_COPY } from "./ui-copy.js";
import { buildHtml, populateShelves, setStatus, updateLegendCount, wireProductForm, wireSceneClick, wireSearchForm } from "./hud.js";
import type { PlacedItem, Shelf, WarehouseConfig } from "./types.js";
import {
  createRuntime,
  loadPlacedProducts,
  loadWarehouseConfig,
  restoreItem,
  saveWarehouseConfig,
  updateItemPlacement,
  type WarehouseRuntime
} from "./warehouse.js";

/**
 * Inicializa la aplicación 3D del almacén dentro del contenedor indicado.
 */
export async function createWarehouseApp(container: HTMLElement): Promise<void> {
  const refs = buildHtml(container);

  const config = await loadWarehouseConfig();
  console.log("Warehouse config loaded:", config);

  const { scene, renderer, camera, controls } = buildScene(refs.canvas);
  const runtime = createRuntime(config);

  addLights(scene);
  addFloor(scene);

  const shelfMeshes = new Map<string, THREE.Mesh>();
  const shelfSprites = new Map<string, THREE.Sprite>();

  config.shelves.forEach((shelf, index) => {
    const color = SHELF_PALETTE[index % SHELF_PALETTE.length];
    const { mesh, sprite } = buildShelfMesh(shelf, color);
    scene.add(mesh);
    scene.add(sprite);
    shelfMeshes.set(shelf.id, mesh);
    shelfSprites.set(shelf.id, sprite);
  });

  populateShelves(refs.legend, refs.shelfSelect, config.shelves);

  const savedProducts = await loadPlacedProducts();
  for (const { shelfId, item, localPosition } of savedProducts) {
    const shelfMesh = shelfMeshes.get(shelfId);
    if (!shelfMesh) continue;
    restoreItem(runtime, scene, shelfId, item, localPosition, shelfMesh);
    const count = runtime.productsByShelf.get(shelfId)?.length ?? 0;
    updateLegendCount(shelfId, count);
  }

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
    onShelfUpdated: () => saveWarehouseConfig(config)
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
    onProductSelected: selectProduct,
    onSelectionCleared: clearSelectedProduct
  });

  // Wire the edit-panel's "Eliminar piso" button
  const removeBoardBtn = document.querySelector<HTMLButtonElement>("#remove-board-btn");
  removeBoardBtn?.addEventListener("click", handleRemoveBoard);

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
  let editModeEnabled = false;

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
  };

  /** Configura dragPlane como un plano vertical que mira hacia la cámara,
   *  pasando por la posición del producto. Permite capturar movimiento vertical
   *  del mouse para cambiar de piso al arrastrar. */
  const setupProductDragPlane = (productMesh: THREE.Mesh, shelfMesh: THREE.Mesh | undefined) => {
    if (shelfMesh) {
      const faceNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion);
      const toCam = new THREE.Vector3().subVectors(camera.position, productMesh.position).normalize();
      if (faceNormal.dot(toCam) < 0) faceNormal.negate();
      dragPlane.setFromNormalAndCoplanarPoint(faceNormal, productMesh.position);
    } else {
      dragPlane.normal.set(0, 1, 0);
      dragPlane.constant = -productMesh.position.y;
    }
  };

  const armProductMove = (sku: string) => {
    pendingProductSku = sku;
    if (!editModeEnabled) {
      editModeEnabled = true;
      syncEditButton();
    }
  };

  editShelvesBtn.addEventListener("click", () => {
    editModeEnabled = !editModeEnabled;
    if (!editModeEnabled) {
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
      editModeEnabled ? UI_COPY.status.editModeEnabled : UI_COPY.status.editModeDisabled,
      false
    );
  });

  syncEditButton();

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!editModeEnabled) return;

    if (pendingProductSku) {
      const productMesh = runtime.productMeshBySku.get(pendingProductSku);
      if (productMesh) {
        activeShelfId = String(productMesh.userData.shelfId);
        activeProductSku = String(productMesh.userData.sku);
        draggedProductLocalPosition = { ...(productMesh.userData.localPosition as { x: number; y: number; z: number }) };
        pointerDownPos = { x: event.clientX, y: event.clientY };
        setupProductDragPlane(productMesh, shelfMeshes.get(activeShelfId));

        toNdc(event);
        raycaster.setFromCamera(pointerNdc, camera);
        if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
          lastIntersect.copy(intersectPoint);
        } else {
          lastIntersect.copy(productMesh.position);
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

    const productHits = raycaster.intersectObjects([...runtime.productMeshBySku.values()], false);
    if (productHits.length > 0) {
      const productMesh = productHits[0].object as THREE.Mesh;
      const shelfId = String(productMesh.userData.shelfId);
      const localPosition = productMesh.userData.localPosition as { x: number; y: number; z: number } | undefined;

      activeShelfId = shelfId;
      activeProductSku = String(productMesh.userData.sku);
      draggedProductLocalPosition = localPosition ? { ...localPosition } : null;
      pointerDownPos = { x: event.clientX, y: event.clientY };
      setupProductDragPlane(productMesh, shelfMeshes.get(shelfId));

      if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
        lastIntersect.copy(intersectPoint);
      }

      dragging = true;
      controls.enabled = false;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
      applySelection(shelfId);
      return;
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

      const productMesh = runtime.productMeshBySku.get(activeProductSku);
      const shelfMesh = shelfMeshes.get(activeShelfId);
      const localPosition = draggedProductLocalPosition;
      const shelf = config.shelves.find((s) => s.id === activeShelfId);
      if (!productMesh || !shelfMesh || !localPosition || !shelf) return;

      const nextLocalPosition = projectProductPositionInsideShelf(
        productMesh,
        shelfMesh,
        intersectPoint,
        runtime.productsByShelf.get(activeShelfId) ?? [],
        shelf
      );

      if (!nextLocalPosition) return;

      draggedProductLocalPosition = nextLocalPosition;
      productMesh.position.copy(localToWorld(nextLocalPosition, productMesh.userData as { width: number; height: number; depth: number }, shelfMesh));
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
        runtime.productMeshesByShelf.get(activeShelfId)?.forEach((pm) => {
          pm.position.x += dx;
          pm.position.z += dz;
        });
      }
      return;
    }

    // Cursor según estado
    const productHover = raycaster.intersectObjects([...runtime.productMeshBySku.values()], false);
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

    runtime.productMeshesByShelf.get(selectedShelfId)?.forEach((pm) => {
      const dx = pm.position.x - cx;
      const dz = pm.position.z - cz;
      pm.position.x = cx + dx * cos - dz * sin;
      pm.position.z = cz + dx * sin + dz * cos;
    });
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
  productMesh: THREE.Mesh,
  shelfMesh: THREE.Mesh,
  worldPoint: THREE.Vector3,
  placedItems: PlacedItem[],
  shelf: Shelf
): { x: number; y: number; z: number } | null {
  const geometry = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const localPoint = shelfMesh.worldToLocal(worldPoint.clone());
  const item = productMesh.userData as { sku: string; width: number; height: number; depth: number };

  // Determinar el piso al que apunta el ratón y hacer snap al centro del piso
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const sectionHeight = shelf.height / sections;
  const canPlaceYRaw = localPoint.y + geometry.height / 2 - item.height / 2;
  const sectionIndex = clamp(Math.floor((localPoint.y + geometry.height / 2) / sectionHeight), 0, sections - 1);
  const sectionMinY = sectionIndex * sectionHeight;
  const sectionMaxY = Math.max(sectionMinY, (sectionIndex + 1) * sectionHeight - item.height);
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
