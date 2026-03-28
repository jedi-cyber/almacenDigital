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
 * La malla raíz es un bounding box invisible usado para raycasting y cálculos de posición;
 * la geometría visual real (postes + tableros) se construye como hijos con nombre __shelf_visual__.
 */
export function buildShelfMesh(
  shelf: Shelf,
  color: string
): { mesh: THREE.Mesh; sprite: THREE.Sprite } {
  // Bounding box invisible: preserva la API de geometry.parameters para el resto del código
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  mesh.position.set(shelf.position.x, shelf.position.y, shelf.position.z);
  mesh.rotation.y = shelf.rotationY ?? 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = { shelfId: shelf.id, sections: shelf.sections ?? 1, ...shelf };
  buildShelfStructure(mesh, shelf, color);

  return { mesh, sprite: createShelfLabelSprite(`${shelf.id} · ${shelf.label}`, shelf, color) };
}

/**
 * Crea la malla 3D de un producto posicionada en coordenadas globales dentro del estante.
 */
export function updateShelfSectionPreview(shelfMesh: THREE.Mesh, section: number): void {
  const sections = Math.max(1, Math.floor(Number(shelfMesh.userData.sections ?? 1)));
  const targetSection = Math.min(Math.max(section, 1), sections);
  const geometry = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const sectionHeight = geometry.height / sections;
  const previewHeight = Math.max(0.04, sectionHeight * 0.22);
  const previewName = "__section_preview__";

  const existingPreview = shelfMesh.children.find((child) => child.name === previewName);
  if (existingPreview instanceof THREE.Mesh) {
    existingPreview.geometry.dispose();
    if (Array.isArray(existingPreview.material)) {
      existingPreview.material.forEach((material) => material.dispose());
    } else {
      existingPreview.material.dispose();
    }
    shelfMesh.remove(existingPreview);
  }

  const preview = new THREE.Mesh(
    new THREE.BoxGeometry(geometry.width * 0.88, previewHeight, geometry.depth * 0.88),
    new THREE.MeshStandardMaterial({
      color: "#f0c04a",
      transparent: true,
      opacity: 0.52,
      emissive: "#b07f10",
      emissiveIntensity: 0.35,
      depthWrite: false
    })
  );
  preview.name = previewName;
  preview.position.set(0, -geometry.height / 2 + sectionHeight * (targetSection - 0.5), 0);
  preview.renderOrder = 2;
  shelfMesh.add(preview);
}

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
  const localPoint = new THREE.Vector3(
    -p.width / 2 + localPosition.x + item.width / 2,
    -p.height / 2 + localPosition.y + item.height / 2,
    -p.depth / 2 + localPosition.z + item.depth / 2
  );
  return shelfMesh.localToWorld(localPoint);
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

/**
 * Anima la cámara suavemente hacia un producto concreto usando GSAP.
 * El zoom se ajusta al tamaño del producto para que siempre sea visible.
 */
export function focusOnProduct(
  productMesh: THREE.Mesh,
  shelfMesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): void {
  const target = productMesh.position.clone();
  const VIEW_DIST = 2.5;
  const ELEVATION = 1.0;

  // Posicionar la cámara directamente frente a la cara accesible del estante,
  // siempre desde el interior del pasillo (nunca detrás de una pared).
  const isVertical = Math.abs(Math.sin(shelfMesh.rotation.y)) > 0.7; // rotación ~90°
  let camX: number, camZ: number;

  if (isVertical) {
    // Estante vertical (S03, S04): cara hacia +X → cámara desde la derecha
    camX = Math.min(1.5, target.x + VIEW_DIST);
    camZ = target.z;
  } else if (shelfMesh.position.z < 0) {
    // Estante horizontal en la pared norte (S05): cara hacia +Z → cámara desde el sur
    camX = target.x;
    camZ = Math.min(0.0, target.z + VIEW_DIST);
  } else {
    // Estante horizontal en la pared sur o entrada (S01, S02): cara hacia −Z → cámara desde el norte
    camX = target.x;
    camZ = Math.max(0.0, target.z - VIEW_DIST);
  }

  const camTarget = new THREE.Vector3(camX, target.y + ELEVATION, camZ);

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

    const visualParts = mesh.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === "__shelf_visual__"
    );

    visualParts.forEach((part) => {
      const mat = part.material as THREE.MeshStandardMaterial;
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
 * Hace un breve destello verde en el estante para indicar que se agregó un producto.
 * Restaura el estado emisivo previo al terminar.
 */
export function flashShelfMesh(mesh: THREE.Mesh): void {
  const visualParts = mesh.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === "__shelf_visual__"
  );

  visualParts.forEach((part) => {
    const mat = part.material as THREE.MeshStandardMaterial;
    const prevHex = mat.emissive.getHex();
    const prevIntensity = mat.emissiveIntensity;

    gsap.killTweensOf(mat);
    mat.emissive.setHex(0x44ff88);

    gsap.fromTo(
      mat,
      { emissiveIntensity: 0.55 },
      {
        emissiveIntensity: prevIntensity,
        duration: 0.7,
        ease: "power2.out",
        onComplete: () => {
          mat.emissive.setHex(prevHex);
        }
      }
    );
  });
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

/**
 * Construye la geometría visual del estante: 4 postes verticales en las esquinas
 * y tableros horizontales (base, techo y divisores de sección).
 * Todos los hijos llevan el nombre "__shelf_visual__" para que otras funciones
 * los identifiquen y manipulen sin tocar el bounding box raíz.
 */
function buildShelfStructure(mesh: THREE.Mesh, shelf: Shelf, color: string): void {
  const postW = Math.min(0.07, shelf.width * 0.06);
  const postD = Math.min(0.07, shelf.depth * 0.10);
  const boardT = Math.min(0.05, shelf.height / 22);
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));

  const postMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).offsetHSL(0, -0.04, -0.20),
    roughness: 0.82,
    metalness: 0.06
  });
  const boardMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).offsetHSL(0, 0, -0.07),
    roughness: 0.76,
    metalness: 0.05
  });

  // 4 postes en las esquinas
  const halfW = shelf.width / 2 - postW / 2;
  const halfD = shelf.depth / 2 - postD / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(postW, shelf.height, postD), postMat);
    post.name = "__shelf_visual__";
    post.position.set(sx * halfW, 0, sz * halfD);
    post.castShadow = true;
    post.receiveShadow = true;
    mesh.add(post);
  }

  const boardW = shelf.width - postW * 2;

  // Tableros fijos: base y techo
  for (const y of [-shelf.height / 2 + boardT / 2, shelf.height / 2 - boardT / 2]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardT, shelf.depth), boardMat);
    board.name = "__shelf_visual__";
    board.userData.isFixedBoard = true;
    board.position.set(0, y, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    mesh.add(board);
  }

  // Pisos intermedios: desde boardOffsets personalizados o uniformes por sections
  const intermediateOffsets: number[] =
    shelf.boardOffsets && shelf.boardOffsets.length > 0
      ? shelf.boardOffsets
      : Array.from({ length: sections - 1 }, (_, i) => (i + 1) / sections);

  intermediateOffsets.forEach((fraction, idx) => {
    const localY = -shelf.height / 2 + fraction * shelf.height;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(boardW, boardT, shelf.depth),
      boardMat.clone()   // material independiente para highlight individual
    );
    board.name = "__shelf_visual__";
    board.userData.isDraggableBoard = true;
    board.userData.boardIdx = idx;
    board.userData.shelfId = shelf.id;
    board.position.set(0, localY, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    mesh.add(board);
  });
}

/** Devuelve las fracciones [0..1] de los pisos intermedios arrastrables, ordenados de abajo a arriba. */
export function collectBoardOffsets(mesh: THREE.Mesh, shelfHeight: number): number[] {
  return mesh.children
    .filter((c) => c.userData.isDraggableBoard)
    .sort((a, b) => a.position.y - b.position.y)
    .map((c) => (c.position.y + shelfHeight / 2) / shelfHeight);
}

/** Agrega un piso intermedio arrastrable al estante en la fracción indicada (0=base, 1=techo). */
export function addShelfBoard(mesh: THREE.Mesh, shelf: Shelf, color: string, fractionY = 0.5): void {
  const postW = Math.min(0.07, shelf.width * 0.06);
  const boardT = Math.min(0.05, shelf.height / 22);
  const boardW = shelf.width - postW * 2;
  const localY = -shelf.height / 2 + fractionY * shelf.height;

  const existingBoards = mesh.children.filter((c) => c.userData.isDraggableBoard);
  const idx = existingBoards.length;

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardT, shelf.depth),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).offsetHSL(0, 0, -0.07),
      roughness: 0.76,
      metalness: 0.05
    })
  );
  board.name = "__shelf_visual__";
  board.userData.isDraggableBoard = true;
  board.userData.boardIdx = idx;
  board.userData.shelfId = shelf.id;
  board.position.set(0, localY, 0);
  board.castShadow = true;
  board.receiveShadow = true;
  mesh.add(board);
}

/** Elimina el último piso intermedio arrastrable. Devuelve true si se eliminó alguno. */
export function removeLastShelfBoard(mesh: THREE.Mesh): boolean {
  const boards = mesh.children.filter((c) => c.userData.isDraggableBoard);
  if (boards.length === 0) return false;

  const last = boards.reduce((prev, cur) =>
    cur.userData.boardIdx > prev.userData.boardIdx ? cur : prev
  );

  if (last instanceof THREE.Mesh) {
    last.geometry.dispose();
    (last.material as THREE.MeshStandardMaterial).dispose();
    mesh.remove(last);
  }
  return true;
}

export function refreshShelfSections(mesh: THREE.Mesh, shelf: Shelf, color: string): void {
  mesh.userData = { ...mesh.userData, ...shelf, sections: shelf.sections ?? 1, shelfId: shelf.id };
  clearShelfHelpers(mesh);
  buildShelfStructure(mesh, shelf, color);
}

function clearShelfHelpers(mesh: THREE.Mesh): void {
  const removableChildren = mesh.children.filter(
    (child) => child.name === "__shelf_visual__" || child.name === "__section_preview__"
  );

  removableChildren.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
    mesh.remove(child);
  });
}

export function focusOnProductFromAisle(
  productMesh: THREE.Mesh,
  shelfMesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): void {
  const target = productMesh.position.clone();
  const viewDistance = 2.5;
  const elevation = 1.0;
  const aisleNormal = getAisleFacingNormal(shelfMesh, controls.target);
  const camTarget = target
    .clone()
    .addScaledVector(aisleNormal, viewDistance)
    .setY(target.y + elevation);

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

function getAisleFacingNormal(shelfMesh: THREE.Mesh, fallbackTarget: THREE.Vector3): THREE.Vector3 {
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion).setY(0).normalize();
  const backward = forward.clone().multiplyScalar(-1);
  const aislePoint = estimateAislePoint(shelfMesh, fallbackTarget);
  const toAisle = aislePoint.sub(shelfMesh.position).setY(0);

  if (toAisle.lengthSq() < 1e-4) {
    return forward;
  }

  return forward.dot(toAisle) >= backward.dot(toAisle) ? forward : backward;
}

function estimateAislePoint(shelfMesh: THREE.Mesh, fallbackTarget: THREE.Vector3): THREE.Vector3 {
  const parent = shelfMesh.parent;
  if (!parent) {
    return fallbackTarget.clone();
  }

  const shelfPositions = parent.children
    .filter(
      (child): child is THREE.Mesh =>
        child instanceof THREE.Mesh && typeof child.userData?.shelfId === "string"
    )
    .map((child) => child.position);

  if (shelfPositions.length === 0) {
    return fallbackTarget.clone();
  }

  const center = new THREE.Vector3();
  shelfPositions.forEach((position) => center.add(position));
  return center.multiplyScalar(1 / shelfPositions.length);
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
