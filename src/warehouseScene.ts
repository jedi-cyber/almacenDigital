import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Shelf, WarehouseConfig } from "./types.js";

/**
 * Inicializa la aplicación 3D del almacén dentro del contenedor indicado.
 */
export async function createWarehouseApp(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <section class="app-shell">
      <aside class="hud">
        <span class="eyebrow">Fase 3</span>
        <h1>Infraestructura 3D del Almacen Digital</h1>
        <p>
          Los estantes se cargan desde <code>warehouse-config.json</code> y se renderizan
          con iluminacion, sombras y controles orbitales.
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

  if (!canvas || !legend) {
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

  addLights(scene);
  addFloor(scene);
  addShelves(scene, config.shelves, legend);

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
  legend: HTMLUListElement
): void {
  const palette = ["#8b5e34", "#a56f3a", "#6d8a4f", "#46646f", "#ad8446", "#7a5c58"];

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

    const label = document.createElement("li");
    label.innerHTML = `<strong>${shelf.id}</strong><span>${shelf.label}</span>`;
    legend.append(label);
  });
}
