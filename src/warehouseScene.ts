import * as THREE from "three";

import { SHELF_PALETTE, addFloor, addLights, buildScene, buildShelfMesh, updateShelfTransparency } from "./scene.js";
import { buildHtml, populateShelves, wireProductForm, wireSceneClick, wireSearchForm, wireShelfForm } from "./ui.js";
import { createRuntime, loadWarehouseConfig } from "./warehouse.js";

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
  config.shelves.forEach((shelf, index) => {
    const color = SHELF_PALETTE[index % SHELF_PALETTE.length];
    const { mesh, sprite } = buildShelfMesh(shelf, color);
    scene.add(mesh);
    scene.add(sprite);
    shelfMeshes.set(shelf.id, mesh);
  });

  populateShelves(refs.legend, refs.shelfSelect, config.shelves);

  const refreshShelfSummary = wireProductForm({
    config,
    form: refs.productForm,
    runtime,
    scene,
    shelfMeshes,
    statusMessage: refs.statusMessage,
    shelfDimensions: refs.shelfDimensions,
    shelfTotal: refs.shelfTotal,
    shelfOccupied: refs.shelfOccupied,
    shelfFree: refs.shelfFree
  });

  wireSearchForm({
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
    deleteProductBtn: refs.deleteProductBtn,
    onProductRemoved: (shelfId: string) => {
      if (refs.shelfSelect.value === shelfId) {
        refreshShelfSummary(shelfId);
      }
    }
  });

  wireShelfForm({
    form: refs.shelfForm,
    config,
    runtime,
    scene,
    shelfMeshes,
    legend: refs.legend,
    shelfSelect: refs.shelfSelect,
    statusMessage: refs.statusMessage
  });

  wireSceneClick({
    canvas: refs.canvas,
    camera,
    runtime,
    config,
    clickInfo: refs.clickInfo,
    clickInfoSku: refs.clickInfoSku,
    clickInfoShelf: refs.clickInfoShelf,
    clickInfoDims: refs.clickInfoDims
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

  renderer.setAnimationLoop(() => {
    controls.update();
    updateShelfTransparency(camera, shelfMeshes);
    renderer.render(scene, camera);
  });
}
