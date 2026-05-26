import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Item, Shelf } from "./types.js";

export interface SceneObjects {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export interface DoorObjects {
  pivot: THREE.Object3D;
  panel: THREE.Mesh;
  entrancePosition: THREE.Vector3;
  wallMeshes: THREE.Mesh[];
}

const WALL_EXTRA_HEIGHT = 1.6;

/** Paleta de colores asignada a los estantes en orden de aparición. */
export const SHELF_PALETTE = ["#8b5e34", "#a56f3a", "#6d8a4f", "#46646f", "#ad8446", "#7a5c58"];

/**
 * Crea y configura la escena Three.js: fondo, fog, renderer con sombras, cámara y OrbitControls.
 */
export function buildScene(canvas: HTMLCanvasElement): SceneObjects {
  const isMobileRouteMode = document.documentElement.dataset.appMode === "mobile-route";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9dcc9");
  scene.fog = isMobileRouteMode ? null : new THREE.Fog("#e9dcc9", 14, 26);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobileRouteMode,
    powerPreference: isMobileRouteMode ? "low-power" : "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileRouteMode ? 1 : 2));
  renderer.shadowMap.enabled = !isMobileRouteMode;
  if (!isMobileRouteMode) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(5.6, 1.65, 1.7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 7;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.target.set(0.5, 1.35, 1.6);

  return { scene, renderer, camera, controls };
}

/**
 * Agrega iluminación ambiental, key light direccional con sombras y fill light a la escena.
 */
export function addLights(scene: THREE.Scene): void {
  const isMobileRouteMode = document.documentElement.dataset.appMode === "mobile-route";
  const ambientLight = new THREE.AmbientLight("#fff3d6", 0.9);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#fff2c4", 1.7);
  keyLight.position.set(8, 10, 6);
  keyLight.castShadow = !isMobileRouteMode;
  keyLight.shadow.mapSize.set(isMobileRouteMode ? 512 : 2048, isMobileRouteMode ? 512 : 2048);
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
 * Agrega una pared detrás de cada estante, a 10 cm de su cara trasera, y conecta
 * en esquina los pares indicados en JOIN_PAIRS para que no queden huecos.
 *
 * La cara trasera se determina por el vecino más cercano con la misma orientación:
 * el pasillo queda entre ambos, la pared va al lado opuesto.
 */
export function addWalls(scene: THREE.Scene, shelves: Shelf[]): THREE.Mesh[] {
  const wallMat = new THREE.MeshStandardMaterial({ color: "#c8bfa8", roughness: 0.88, metalness: 0.02 });
  const wallT = 0.20;
  const gap = 0.10;
  const wallMeshes: THREE.Mesh[] = [];

  // Pares de estantes cuyas paredes deben unirse en esquina.
  const JOIN_PAIRS: [string, string][] = [["S02", "S03"], ["S03", "S05"], ["S05", "S04"]];

  // Registro de la posición y extensión de la pared de cada estante.
  type WallRec = {
    isRotated: boolean;
    crossPos: number; // x (pared vertical) o z (pared horizontal)
    runMin: number;   // extremo menor a lo largo del eje corriente
    runMax: number;   // extremo mayor
    wallH: number;
  };
  const recs = new Map<string, WallRec>();

  // ── Paso 1: generar las paredes individuales ──────────────────────────────
  for (const shelf of shelves) {
    const rotY = shelf.rotationY ?? 0;
    const isRotated = Math.abs(Math.sin(rotY)) > 0.7;
    const wallH = shelf.position.y + shelf.height / 2 + WALL_EXTRA_HEIGHT;
    const wallY = wallH / 2;

    if (isRotated) {
      let nearestDx = Infinity;
      for (const other of shelves) {
        if (other.id === shelf.id) continue;
        if (Math.abs(Math.sin(other.rotationY ?? 0)) <= 0.7) continue;
        const dx = other.position.x - shelf.position.x;
        if (Math.abs(dx) < Math.abs(nearestDx)) nearestDx = dx;
      }
      const backSign = isFinite(nearestDx) ? (nearestDx > 0 ? -1 : 1) : (shelf.position.x <= 0 ? -1 : 1);
      const wallX = shelf.position.x + backSign * (shelf.depth / 2 + gap + wallT / 2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, shelf.width), wallMat.clone());
      wall.position.set(wallX, wallY, shelf.position.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      wall.userData.isWallCollider = true;
      scene.add(wall);
      wallMeshes.push(wall);
      recs.set(shelf.id, {
        isRotated: true,
        crossPos: wallX,
        runMin: shelf.position.z - shelf.width / 2,
        runMax: shelf.position.z + shelf.width / 2,
        wallH
      });
    } else {
      let nearestDz = Infinity;
      for (const other of shelves) {
        if (other.id === shelf.id) continue;
        if (Math.abs(Math.sin(other.rotationY ?? 0)) > 0.7) continue;
        const dz = other.position.z - shelf.position.z;
        if (Math.abs(dz) < Math.abs(nearestDz)) nearestDz = dz;
      }
      const backSign = isFinite(nearestDz) ? (nearestDz > 0 ? -1 : 1) : (shelf.position.z >= 0 ? 1 : -1);
      const wallZ = shelf.position.z + backSign * (shelf.depth / 2 + gap + wallT / 2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(shelf.width, wallH, wallT), wallMat.clone());
      wall.position.set(shelf.position.x, wallY, wallZ);
      wall.receiveShadow = true;
      wall.castShadow = true;
      wall.userData.isWallCollider = true;
      scene.add(wall);
      wallMeshes.push(wall);
      recs.set(shelf.id, {
        isRotated: false,
        crossPos: wallZ,
        runMin: shelf.position.x - shelf.width / 2,
        runMax: shelf.position.x + shelf.width / 2,
        wallH
      });
    }
  }

  // ── Paso 2: añadir conectores en esquina para los pares indicados ─────────
  const addConnectorBox = (
    w: number, h: number, d: number, x: number, y: number, z: number
  ) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat.clone());
    box.position.set(x, y, z);
    box.receiveShadow = true;
    box.castShadow = true;
    box.userData.isWallCollider = true;
    scene.add(box);
    wallMeshes.push(box);
  };

  for (const [idA, idB] of JOIN_PAIRS) {
    const rA = recs.get(idA);
    const rB = recs.get(idB);
    if (!rA || !rB) continue;
    if (rA.isRotated === rB.isRotated) continue; // mismo eje → no se unen en esquina

    // v = pared vertical (a lo largo de Z), h = pared horizontal (a lo largo de X)
    const v = rA.isRotated ? rA : rB;
    const h = rA.isRotated ? rB : rA;
    const maxH = Math.max(v.wallH, h.wallH);

    // El vértice de la esquina en plano XZ
    const cornerX = v.crossPos;
    const cornerZ = h.crossPos;

    // Extremo de la pared vertical más próximo a cornerZ
    const vEnd = Math.abs(v.runMax - cornerZ) < Math.abs(v.runMin - cornerZ) ? v.runMax : v.runMin;
    // Extremo de la pared horizontal más próximo a cornerX
    const hEnd = Math.abs(h.runMax - cornerX) < Math.abs(h.runMin - cornerX) ? h.runMax : h.runMin;

    // Extensión vertical (amplía la pared V hasta cornerZ)
    if (Math.abs(vEnd - cornerZ) > 0.01) {
      const extD = Math.abs(vEnd - cornerZ) + wallT / 2;
      const shift = cornerZ > vEnd ? wallT / 4 : -wallT / 4;
      addConnectorBox(wallT, maxH, extD, cornerX, maxH / 2, (vEnd + cornerZ) / 2 + shift);
    }

    // Extensión horizontal (amplía la pared H hasta cornerX)
    if (Math.abs(hEnd - cornerX) > 0.01) {
      const extW = Math.abs(hEnd - cornerX) + wallT / 2;
      const shift = cornerX > hEnd ? wallT / 4 : -wallT / 4;
      addConnectorBox(extW, maxH, wallT, (hEnd + cornerX) / 2 + shift, maxH / 2, cornerZ);
    }
  }

  return wallMeshes;
}

/**
 * Agrega una pared con puerta que conecta la pared de S01 con la pared de S02
 * por el lado derecho, 10 cm separada del extremo más ancho.
 * Las posiciones se calculan dinámicamente desde los datos de los estantes.
 */
export function addDoorS01S02(scene: THREE.Scene, shelves: Shelf[]): DoorObjects | undefined {
  const s01 = shelves.find(s => s.id === "S01");
  const s02 = shelves.find(s => s.id === "S02");
  if (!s01 || !s02) return;

  const wallMat  = new THREE.MeshStandardMaterial({ color: "#c8bfa8", roughness: 0.88, metalness: 0.02 });
  const doorMat  = new THREE.MeshStandardMaterial({ color: "#7a5230", roughness: 0.72, metalness: 0.06 });
  const frameMat = new THREE.MeshStandardMaterial({ color: "#a07840", roughness: 0.80, metalness: 0.04 });
  const wallMeshes: THREE.Mesh[] = [];

  const wallT = 0.20;
  const gap   = 0.10;

  // Altura de cada pared (misma fórmula que addWalls)
  const wallH1 = s01.position.y + s01.height / 2 + WALL_EXTRA_HEIGHT;
  const wallH2 = s02.position.y + s02.height / 2 + WALL_EXTRA_HEIGHT;
  const wallH  = Math.max(wallH1, wallH2);

  // Z de cada pared: S01 tiene a S02 en z+, así que su pared va al z- (backSign=-1)
  //                  S02 tiene a S01 en z-, así que su pared va al z+ (backSign=+1)
  const zWall1 = s01.position.z - (s01.depth / 2 + gap + wallT / 2);
  const zWall2 = s02.position.z + (s02.depth / 2 + gap + wallT / 2);

  // Extremo derecho de cada pared
  const xRight1 = s01.position.x + s01.width / 2;
  const xRight2 = s02.position.x + s02.width / 2;
  const xRightMax = Math.max(xRight1, xRight2);

  // Centro de la pared puerta: 10 cm + medio grosor más allá del extremo derecho
  const doorX = xRightMax + 0.10 + wallT / 2;

  // Parámetros de la puerta
  const doorW       = 1.45;
  const doorH       = 2.10;
  const doorCenterZ = (zWall1 + zWall2) / 2;
  const doorZMin    = doorCenterZ - doorW / 2;
  const doorZMax    = doorCenterZ + doorW / 2;

  const addBox = (w: number, h: number, d: number, px: number, py: number, pz: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.isWallCollider = mat !== doorMat;
    scene.add(mesh);
    if (mesh.userData.isWallCollider) {
      wallMeshes.push(mesh);
    }
  };

  // Conectores que unen la pared de cada estante con la pared-puerta
  const xDoorLeft = doorX - wallT / 2;
  if (xDoorLeft - xRight1 > 0.001) {
    const len = xDoorLeft - xRight1;
    addBox(len, wallH1, wallT, xRight1 + len / 2, wallH1 / 2, zWall1, wallMat.clone());
  }
  if (xDoorLeft - xRight2 > 0.001) {
    const len = xDoorLeft - xRight2;
    addBox(len, wallH2, wallT, xRight2 + len / 2, wallH2 / 2, zWall2, wallMat.clone());
  }

  // Tramo de pared izquierdo (zWall1 → doorZMin)
  const leftLen = doorZMin - zWall1;
  addBox(wallT, wallH, leftLen, doorX, wallH / 2, zWall1 + leftLen / 2, wallMat.clone());

  // Tramo de pared derecho (doorZMax → zWall2)
  const rightLen = zWall2 - doorZMax;
  addBox(wallT, wallH, rightLen, doorX, wallH / 2, doorZMax + rightLen / 2, wallMat.clone());

  // Travesaño superior sobre el hueco
  const transomH = wallH - doorH;
  addBox(wallT, transomH, doorW, doorX, doorH + transomH / 2, doorCenterZ, wallMat.clone());

  // Jambas (montantes verticales del marco)
  const jamb = 0.08;
  addBox(wallT + 0.02, doorH, jamb, doorX, doorH / 2, doorZMin + jamb / 2, frameMat.clone());
  addBox(wallT + 0.02, doorH, jamb, doorX, doorH / 2, doorZMax - jamb / 2, frameMat.clone());

  // Panel de la puerta (ligeramente abierta ~20°)
  const panelW = doorW - jamb * 2 - 0.02;
  const pivot  = new THREE.Object3D();
  pivot.position.set(doorX, 0, doorZMin + jamb);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH - 0.04, panelW), doorMat.clone());
  panel.name = "__door_panel__";
  panel.position.set(0, doorH / 2, panelW / 2);
  panel.castShadow = true;
  panel.receiveShadow = true;
  pivot.add(panel);
  pivot.rotation.y = 0;
  scene.add(pivot);

  return {
    pivot,
    panel,
    entrancePosition: new THREE.Vector3(doorX + 0.95, 0.04, doorCenterZ),
    wallMeshes
  };
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

export function updateShelfLabelSprite(sprite: THREE.Sprite, shelf: Shelf, color: string): void {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  const replacement = createShelfLabelSprite(`${shelf.id} · ${shelf.label}`, shelf, color);
  const replacementMaterial = replacement.material as THREE.SpriteMaterial;
  material.map = replacementMaterial.map;
  material.needsUpdate = true;
  replacementMaterial.dispose();
  sprite.position.copy(replacement.position);
  sprite.scale.copy(replacement.scale);
}

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

export function highlightShelfSection(
  shelfMesh: THREE.Mesh,
  shelf: Shelf,
  section: number,
  color = 0x38bdf8
): THREE.Mesh {
  const existing = shelfMesh.getObjectByName("__located_section_highlight__");
  if (existing) {
    shelfMesh.remove(existing);
    const oldMesh = existing as THREE.Mesh;
    oldMesh.geometry.dispose();
    (oldMesh.material as THREE.Material).dispose();
  }

  const geometry = shelfMesh.geometry as THREE.BoxGeometry;
  const p = geometry.parameters;
  const bounds = getSectionLocalBounds(shelf, section);
  const sectionHeight = Math.max(0.04, bounds.max - bounds.min);
  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(p.width + 0.05, sectionHeight, p.depth + 0.05),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );

  highlight.name = "__located_section_highlight__";
  highlight.renderOrder = 3;
  highlight.position.set(0, -p.height / 2 + bounds.min + sectionHeight / 2, 0);
  shelfMesh.add(highlight);
  return highlight;
}

export function clearShelfSectionHighlight(shelfMesh: THREE.Mesh): void {
  const existing = shelfMesh.getObjectByName("__located_section_highlight__");
  if (!existing) return;
  shelfMesh.remove(existing);
  const mesh = existing as THREE.Mesh;
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}

function getSectionLocalBounds(shelf: Shelf, section: number): { min: number; max: number } {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  const index = Math.min(Math.max(Math.floor(section), 1), bounds.length - 1) - 1;
  return { min: bounds[index], max: bounds[index + 1] };
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
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

// ── InstancedMesh helpers ────────────────────────────────────────────────────

const MAX_INSTANCES_PER_GEO = 256;
const _iMatrix = new THREE.Matrix4();
const _iPos = new THREE.Vector3();
const _iRot = new THREE.Quaternion();
const _iScl = new THREE.Vector3();
const _iColor = new THREE.Color();

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
  _pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  _raycaster.setFromCamera(_pointer, camera);
  const hits = _raycaster.intersectObjects(meshes, false);
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
 * Genera un color hexadecimal determinista a partir del SKU del producto.
 */
export function skuToColor(sku: string): string {
  let hash = 0;
  for (let i = 0; i < sku.length; i += 1) {
    hash = (hash * 31 + sku.charCodeAt(i)) >>> 0;
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
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

/**
 * Elimina el tablón que separa el piso indicado (1-based) del siguiente.
 * Si es el último piso, elimina el tablón inferior. Devuelve true si se eliminó alguno.
 */
export function removeShelfBoardAtSection(mesh: THREE.Mesh, section: number): boolean {
  const boards = mesh.children
    .filter((c) => c.userData.isDraggableBoard)
    .sort((a, b) => a.position.y - b.position.y);

  if (boards.length === 0) return false;

  const boardIndex = Math.min(section - 1, boards.length - 1);
  const target = boards[boardIndex];

  if (target instanceof THREE.Mesh) {
    target.geometry.dispose();
    (target.material as THREE.MeshStandardMaterial).dispose();
    mesh.remove(target);
    return true;
  }
  return false;
}

export function refreshShelfSections(mesh: THREE.Mesh, shelf: Shelf, color: string): void {
  mesh.userData = { ...mesh.userData, ...shelf, sections: shelf.sections ?? 1, shelfId: shelf.id };
  clearShelfHelpers(mesh);
  buildShelfStructure(mesh, shelf, color);
}

export function resizeShelfMesh(mesh: THREE.Mesh, shelf: Shelf, color: string): void {
  (mesh.geometry as THREE.BufferGeometry).dispose();
  mesh.geometry = new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth);
  refreshShelfSections(mesh, shelf, color);
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
  productPos: THREE.Vector3,
  shelfMesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  productSize?: { width: number; height: number; depth: number }
): void {
  const target = productPos.clone();
  const shelfParams = (shelfMesh.geometry as THREE.BoxGeometry).parameters;
  const localProductPos = shelfMesh.worldToLocal(productPos.clone());
  const productDepth = productSize?.depth ?? 0.35;
  const productHeight = productSize?.height ?? 0.25;
  const productBackRatio = (localProductPos.z + shelfParams.depth / 2) / Math.max(0.01, shelfParams.depth);
  const productHighRatio = (localProductPos.y + shelfParams.height / 2) / Math.max(0.01, shelfParams.height);
  const viewDistance = Math.max(2.1, Math.min(4.2, shelfParams.depth * 1.15 + productDepth * 2.2));
  const elevation = productHighRatio > 0.72 ? 0.42 : productHighRatio < 0.28 ? 0.82 : 0.62;
  const aisleNormal = getAisleFacingNormal(shelfMesh, camera.position);
  const sideOffset = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), aisleNormal).normalize();
  const backCompensation = (productBackRatio - 0.5) * Math.min(1.1, shelfParams.depth * 0.42);
  const camTarget = target
    .clone()
    .addScaledVector(aisleNormal, viewDistance)
    .addScaledVector(sideOffset, backCompensation)
    .setY(Math.max(0.75, target.y + elevation + productHeight * 0.5));
  const focusTarget = target.clone();
  focusTarget.y += Math.min(0.25, productHeight * 0.35);

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
    x: focusTarget.x,
    y: focusTarget.y,
    z: focusTarget.z,
    duration: 1.5,
    ease: "power2.inOut",
    onUpdate: () => {
      camera.lookAt(controls.target);
      controls.update();
    }
  });
}

function getAisleFacingNormal(shelfMesh: THREE.Mesh, cameraPosition: THREE.Vector3): THREE.Vector3 {
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion).setY(0).normalize();
  const backward = forward.clone().multiplyScalar(-1);
  const toCamera = cameraPosition.clone().sub(shelfMesh.position).setY(0);

  if (toCamera.lengthSq() < 1e-4) {
    return forward;
  }

  return forward.dot(toCamera) >= backward.dot(toCamera) ? forward : backward;
}

/** Returns the string key used to group products by geometry. */
export function makeProductGeoKey(width: number, height: number, depth: number): string {
  return `${width}:${height}:${depth}`;
}

/**
 * Returns the InstancedMesh for the given dimensions, creating and adding it to
 * the scene if it doesn't exist yet. All instances share one geometry and one
 * material; per-instance color is applied via setColorAt.
 */
export function getOrCreateInstancedMesh(
  width: number,
  height: number,
  depth: number,
  instancedMeshByGeo: Map<string, THREE.InstancedMesh>,
  scene: THREE.Scene
): THREE.InstancedMesh {
  const key = makeProductGeoKey(width, height, depth);
  let mesh = instancedMeshByGeo.get(key);
	  if (!mesh) {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.08,
      vertexColors: true,
      emissive: 0x111827,
      emissiveIntensity: 0.18
    });
	    mesh = new THREE.InstancedMesh(
	      new THREE.BoxGeometry(width, height, depth),
	      material,
	      MAX_INSTANCES_PER_GEO
	    );
	    mesh.count = 0;
    mesh.frustumCulled = false;
	    mesh.castShadow = true;
	    mesh.receiveShadow = true;
    mesh.userData.geoKey = key;
    scene.add(mesh);
    instancedMeshByGeo.set(key, mesh);
  }
  return mesh;
}

/**
 * Appends a new instance at worldPos with the product's color.
 * Returns the assigned instanceIndex and an internal label sprite kept for
 * compatibility with movement/removal flows. Product labels are not rendered.
 */
export function addProductInstance(
  item: Item,
  worldPos: THREE.Vector3,
  instancedMesh: THREE.InstancedMesh
): { instanceIndex: number; labelSprite: THREE.Sprite } {
  const instanceIndex = instancedMesh.count;
  _iMatrix.identity();
  _iMatrix.setPosition(worldPos);
  instancedMesh.setMatrixAt(instanceIndex, _iMatrix);
  instancedMesh.setColorAt(instanceIndex, _iColor.set(skuToColor(item.sku)));
  instancedMesh.count++;
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor!.needsUpdate = true;

  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 }));
  labelSprite.visible = false;
  labelSprite.position.set(worldPos.x, worldPos.y + item.height / 2 + 0.12, worldPos.z);

  return { instanceIndex, labelSprite };
}

/**
 * Removes an instance by swapping it with the last one (O(1) removal).
 * Updates instanceOwner. Returns the sku relocated from the last slot,
 * or null if the removed instance was already the last.
 */
export function removeProductInstance(
  instancedMesh: THREE.InstancedMesh,
  instanceIndex: number,
  instanceOwner: Map<string, string>,
  geoKey: string
): string | null {
  const lastIndex = instancedMesh.count - 1;
  let movedSku: string | null = null;

  if (instanceIndex !== lastIndex) {
    instancedMesh.getMatrixAt(lastIndex, _iMatrix);
    instancedMesh.setMatrixAt(instanceIndex, _iMatrix);

    if (instancedMesh.instanceColor) {
      instancedMesh.getColorAt(lastIndex, _iColor);
      instancedMesh.setColorAt(instanceIndex, _iColor);
    }

    movedSku = instanceOwner.get(`${geoKey}/${lastIndex}`) ?? null;
    if (movedSku !== null) {
      instanceOwner.set(`${geoKey}/${instanceIndex}`, movedSku);
    }
    instanceOwner.delete(`${geoKey}/${lastIndex}`);
  } else {
    instanceOwner.delete(`${geoKey}/${lastIndex}`);
  }

  instancedMesh.count--;
  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

  return movedSku;
}

/**
 * Moves an instance to a new world position while preserving its current scale.
 * THREE.Matrix4.setPosition only modifies the translation column, so rotation
 * and scale stored in the matrix are untouched.
 */
export function setInstanceWorldPosition(
  instancedMesh: THREE.InstancedMesh,
  instanceIndex: number,
  pos: THREE.Vector3
): void {
  instancedMesh.getMatrixAt(instanceIndex, _iMatrix);
  _iMatrix.setPosition(pos);
  instancedMesh.setMatrixAt(instanceIndex, _iMatrix);
  instancedMesh.instanceMatrix.needsUpdate = true;
}

/** Extracts the world position of an instance from its matrix. */
export function getInstanceWorldPosition(
  instancedMesh: THREE.InstancedMesh,
  instanceIndex: number
): THREE.Vector3 {
  instancedMesh.getMatrixAt(instanceIndex, _iMatrix);
  return new THREE.Vector3().setFromMatrixPosition(_iMatrix);
}

/** Scales an instance from 0 to 1 using GSAP (appearance animation). */
export function animateInstanceAppearance(
  instancedMesh: THREE.InstancedMesh,
  instanceIndex: number
): void {
  const proxy = { scale: 0 };
  gsap.to(proxy, {
    scale: 1,
    duration: 0.4,
    ease: "power2.out",
    onUpdate: () => {
      instancedMesh.getMatrixAt(instanceIndex, _iMatrix);
      _iMatrix.decompose(_iPos, _iRot, _iScl);
      _iScl.setScalar(proxy.scale);
      _iMatrix.compose(_iPos, _iRot, _iScl);
      instancedMesh.setMatrixAt(instanceIndex, _iMatrix);
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  });
}

/** Scales an instance from 1 to 0 using GSAP, then calls onComplete. */
export function animateInstanceRemoval(
  instancedMesh: THREE.InstancedMesh,
  instanceIndex: number,
  onComplete: () => void
): void {
  const proxy = { scale: 1 };
  gsap.to(proxy, {
    scale: 0,
    duration: 0.3,
    ease: "power2.in",
    onUpdate: () => {
      instancedMesh.getMatrixAt(instanceIndex, _iMatrix);
      _iMatrix.decompose(_iPos, _iRot, _iScl);
      _iScl.setScalar(proxy.scale);
      _iMatrix.compose(_iPos, _iRot, _iScl);
      instancedMesh.setMatrixAt(instanceIndex, _iMatrix);
      instancedMesh.instanceMatrix.needsUpdate = true;
    },
    onComplete
  });
}

/**
 * Raycasts against all InstancedMeshes and returns the SKU of the hit instance,
 * or null if nothing was hit.
 */
export function pickProduct(
  event: MouseEvent,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  instancedMeshes: THREE.InstancedMesh[],
  instanceOwner: Map<string, string>
): string | null {
  const rect = canvas.getBoundingClientRect();
  _pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  _raycaster.setFromCamera(_pointer, camera);
  const hits = _raycaster.intersectObjects(instancedMeshes, false);
  if (hits.length === 0) return null;

  const hit = hits[0];
  if (hit.instanceId === undefined) return null;

  const geoKey = (hit.object as THREE.InstancedMesh).userData.geoKey as string | undefined;
  if (!geoKey) return null;

  return instanceOwner.get(`${geoKey}/${hit.instanceId}`) ?? null;
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
