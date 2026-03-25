import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Item, PlacedItem, Shelf } from "./types.js";

export interface SceneObjects {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

/** Paleta de colores asignada a los estantes en orden de aparición. */
export const SHELF_PALETTE = ["#8b5e34", "#a56f3a", "#6d8a4f", "#46646f", "#ad8446", "#7a5c58"];

/**
 * Crea y configura la escena Three.js: fondo, fog, renderer con sombras, cámara y OrbitControls.
 */
export function buildScene(canvas: HTMLCanvasElement): SceneObjects {
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

  return { scene, renderer, camera, controls };
}

/**
 * Agrega iluminación ambiental, key light direccional con sombras y fill light a la escena.
 */
export function addLights(scene: THREE.Scene): void {
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

/**
 * Agrega el plano de suelo y la grilla de referencia a la escena.
 */
export function addFloor(scene: THREE.Scene): void {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 20),
    new THREE.MeshStandardMaterial({ color: "#c6b28f", roughness: 0.95, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(28, 28, "#775b3a", "#a18d70");
  grid.position.y = 0.01;
  scene.add(grid);
}

/**
 * Crea la malla BoxGeometry y el sprite de etiqueta de un estante dado su color.
 */
export function buildShelfMesh(
  shelf: Shelf,
  color: string
): { mesh: THREE.Mesh; sprite: THREE.Sprite } {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 })
  );
  mesh.position.set(shelf.position.x, shelf.position.y, shelf.position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { shelfId: shelf.id, ...shelf };

  return { mesh, sprite: createShelfLabelSprite(`${shelf.id} · ${shelf.label}`, shelf, color) };
}

/**
 * Crea la malla 3D de un producto posicionada en coordenadas globales dentro del estante.
 */
export function createProductMesh(
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

  const label = createSkuLabelSprite(item.sku);
  label.position.set(0, item.height / 2 + 0.12, 0);
  mesh.add(label);

  return mesh;
}

/**
 * Libera la geometría, material y texturas del sprite hijo de una malla de producto.
 */
export function disposeProductMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }
  mesh.children.forEach((child) => {
    if (child instanceof THREE.Sprite) {
      (child.material as THREE.SpriteMaterial).map?.dispose();
      child.material.dispose();
    }
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
  const p = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const origin = shelfMesh.position
    .clone()
    .sub(new THREE.Vector3(p.width / 2, p.height / 2, p.depth / 2));
  return origin
    .add(new THREE.Vector3(localPosition.x, localPosition.y, localPosition.z))
    .add(new THREE.Vector3(item.width / 2, item.height / 2, item.depth / 2));
}

/**
 * Anima la cámara suavemente hacia el estante indicado usando GSAP.
 * Actualiza el target de OrbitControls en cada frame del tween.
 */
export function focusOnShelf(
  shelfMesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): void {
  const target = shelfMesh.position.clone();
  const p = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const camTarget = target.clone().add(
    new THREE.Vector3(
      Math.max(p.width, 2.8),
      Math.max(p.height * 0.9, 2),
      Math.max(p.depth * 5, 4)
    )
  );

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

const _camBox = new THREE.Box3();
const _insideState = new Map<THREE.Mesh, boolean>();

/**
 * Comprueba cada frame si la cámara está dentro de algún estante y aplica un fade
 * de opacidad con GSAP al entrar/salir, para no bloquear la vista de los productos.
 */
export function updateShelfTransparency(
  camera: THREE.PerspectiveCamera,
  shelfMeshes: Map<string, THREE.Mesh>
): void {
  shelfMeshes.forEach((mesh) => {
    _camBox.setFromObject(mesh);
    const inside = _camBox.containsPoint(camera.position);
    const wasInside = _insideState.get(mesh) ?? false;

    if (inside === wasInside) return;
    _insideState.set(mesh, inside);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    gsap.killTweensOf(mat);

    if (inside) {
      mat.transparent = true;
      mat.depthWrite = false;
    }

    gsap.to(mat, {
      opacity: inside ? 0.15 : 1,
      duration: 0.35,
      ease: "power1.inOut",
      onComplete: () => {
        if (!inside) {
          mat.transparent = false;
          mat.depthWrite = true;
        }
      }
    });
  });
}

/**
 * Lanza un rayo desde la posición del cursor y devuelve la primera malla impactada,
 * o null si no se tocó ninguna.
 */
export function pickMesh(
  event: MouseEvent,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  meshes: THREE.Mesh[]
): THREE.Mesh | null {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
}

/**
 * Anima la aparición de una malla de producto escalando de 0 a 1 con GSAP.
 */
export function animateProductAppearance(mesh: THREE.Mesh): void {
  mesh.scale.set(0, 0, 0);
  gsap.to(mesh.scale, {
    x: 1,
    y: 1,
    z: 1,
    duration: 0.4,
    ease: "power2.out"
  });
}

/**
 * Genera un color hexadecimal determinista a partir del SKU del producto.
 */
export function skuToColor(sku: string): string {
  let hash = 0;
  for (let i = 0; i < sku.length; i += 1) {
    hash = (hash * 31 + sku.charCodeAt(i)) >>> 0;
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
}

function createSkuLabelSprite(sku: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D para la etiqueta del producto.");

  ctx.fillStyle = "rgba(20, 14, 8, 0.80)";
  roundRect(ctx, 4, 4, 248, 56, 14);
  ctx.fill();

  ctx.fillStyle = "#fff8ec";
  ctx.font = "700 26px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sku, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  );
  sprite.scale.set(0.8, 0.2, 1);
  return sprite;
}

function createShelfLabelSprite(text: string, shelf: Shelf, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D para la etiqueta del estante.");

  ctx.fillStyle = "rgba(34, 28, 20, 0.78)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  roundRect(ctx, 8, 8, 496, 112, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff8ec";
  ctx.font = "700 34px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  );
  sprite.position.set(
    shelf.position.x,
    shelf.position.y + shelf.height / 2 + 0.7,
    shelf.position.z
  );
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
