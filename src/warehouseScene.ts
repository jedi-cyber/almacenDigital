import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { SHELF_PALETTE, addDoorS01S02, addFloor, addLights, addWalls, buildScene, buildShelfMesh, collectBoardOffsets, focusOnProductFromAisle, getInstanceWorldPosition, localToWorld, setInstanceWorldPosition, skuToColor, updateShelfLabelSprite, updateShelfTransparency } from "./scene.js";
import { getProductMovedInsideShelfMessage, UI_COPY } from "./ui-copy.js";
import { buildHtml, populateShelves, setStatus, updateLegendCount, wireProductForm, wireSceneClick, wireSearchForm } from "./hud.js";
import type { HudRefs } from "./hud.js";
import type { Item, PlacedItem, Shelf, WarehouseAisle, WarehouseConfig } from "./types.js";
import { getSectionBoundaries } from "./canPlace.js";
import {
	  createRuntime,
	  createManagedUser,
	  closeAllUserSessions,
	  closeUserSession,
	  createUserSession,
	  downloadExport,
	  loadActiveSessions,
	  loadManagedUsers,
	  loadProductHistory,
  loadPlacedProducts,
  loadUserSession,
  loadWarehouseConfig,
  restoreItem,
  saveWarehouseConfig,
	  setApiErrorHandler,
	  updateUserProfile,
	  updateManagedUser,
	  updateItemPlacement,
  type WarehouseRuntime
} from "./warehouse.js";

/**
 * Inicializa la aplicación 3D del almacén dentro del contenedor indicado.
 */
export async function createWarehouseApp(container: HTMLElement): Promise<void> {
  const refs = buildHtml(container);
  const appShell = container.querySelector<HTMLElement>(".app-shell");
  const isMobileRouteMode = document.documentElement.dataset.appMode === "mobile-route";
  if (appShell) appShell.dataset.authRequired = "true";
  refs.authPanel.hidden = false;
  refs.authPanel.setAttribute("aria-hidden", "false");
  refs.authLogoutBtn.hidden = true;
  refs.profileForm.hidden = true;

  // Propagar errores de red en background al status message del HUD.
  setApiErrorHandler((msg) => setStatus(refs.statusMessage, msg, true));

  // Indicar progreso en la pantalla de carga mientras las llamadas async resuelven.
  const loadingStatus = document.querySelector<HTMLParagraphElement>("#loading-status");
  const setLoadingText = (text: string) => { if (loadingStatus) loadingStatus.textContent = text; };

	  setLoadingText(UI_COPY.status.loadingConfig);
	  refs.statusMessage.textContent = UI_COPY.status.loadingConfig;
	  refs.statusMessage.dataset.state = "loading";

  let activeSession: Awaited<ReturnType<typeof loadUserSession>> = null;
  const applySession = (session: Awaited<ReturnType<typeof loadUserSession>>) => {
    activeSession = session;
    const hasSession = Boolean(session);
    if (appShell) appShell.dataset.authRequired = hasSession ? "false" : "true";
    refs.authPanel.hidden = hasSession;
    refs.authPanel.setAttribute("aria-hidden", hasSession ? "true" : "false");
    refs.adminName.textContent = session?.user.name ?? "Sin sesión";
    refs.adminRole.textContent = session?.user.role ?? "Inicia sesión";
    const profileButton = container.querySelector<HTMLButtonElement>("#admin-card-btn");
    if (profileButton) {
      profileButton.title = session ? `${session.user.name} · ${session.user.role}` : "Abrir mi perfil";
      profileButton.setAttribute("aria-label", session ? `Abrir perfil de ${session.user.name}` : "Abrir mi perfil");
    }
    const initials = getInitials(session?.user.name ?? session?.user.email ?? "SS");
    refs.adminInitials.textContent = initials;
	    container.querySelector<HTMLElement>("#profile-avatar")?.replaceChildren(document.createTextNode(initials));
	    container.querySelector<HTMLElement>("#profile-display-name")?.replaceChildren(document.createTextNode(session?.user.name ?? "-"));
	    container.querySelector<HTMLElement>("#profile-display-email")?.replaceChildren(document.createTextNode(session?.user.email ?? "-"));
	    refs.authLogoutBtn.hidden = !session;
	    refs.profileForm.hidden = !session;
	    container.querySelectorAll<HTMLElement>(".profile-utility-panel").forEach((panel) => { panel.hidden = !session; });
	    refs.authForm.hidden = hasSession;
    refs.profileStatus.hidden = true;
    if (session) {
      refs.authName.value = session.user.name;
      refs.authEmail.value = session.user.email;
      refs.profileName.value = session.user.name;
      refs.profileEmail.value = session.user.email;
      refs.profileRole.textContent = session.user.role;
      refs.profileUserId.textContent = `#${session.user.id}`;
      refs.profileSessionExpiry.textContent = formatSessionExpiry(session.expiresAt);
    }
  };

	  const initialSession = await loadUserSession();
	  applySession(initialSession);

  const setProfilePasswordSectionOpen = (isOpen: boolean) => {
    refs.profilePasswordSection.hidden = !isOpen;
    refs.profilePasswordToggleBtn.setAttribute("aria-expanded", String(isOpen));
    refs.profilePasswordToggleBtn.textContent = isOpen ? "Ocultar cambio de contraseña" : "Cambiar contraseña";
    if (!isOpen) {
      refs.profileCurrentPassword.value = "";
      refs.profileNewPassword.value = "";
      refs.profileConfirmPassword.value = "";
    }
  };

	  refs.profilePasswordToggleBtn.addEventListener("click", () => {
	    setProfilePasswordSectionOpen(refs.profilePasswordSection.hidden);
	  });

  const profileEditToggleBtn = container.querySelector<HTMLButtonElement>("#profile-edit-toggle-btn");
  const profileEditSection = container.querySelector<HTMLElement>("#profile-edit-section");
  const setProfileEditOpen = (isOpen: boolean) => {
    if (!profileEditSection || !profileEditToggleBtn) return;
    profileEditSection.hidden = !isOpen;
    profileEditToggleBtn.setAttribute("aria-expanded", String(isOpen));
    profileEditToggleBtn.textContent = isOpen ? "Ocultar edición" : "Editar perfil";
    if (!isOpen) setProfilePasswordSectionOpen(false);
  };
  profileEditToggleBtn?.addEventListener("click", () => {
    setProfileEditOpen(Boolean(profileEditSection?.hidden));
  });

  const activeSessionsList = container.querySelector<HTMLElement>("#active-sessions-list");
  const refreshSessionsBtn = container.querySelector<HTMLButtonElement>("#refresh-sessions-btn");
  const logoutAllSessionsBtn = container.querySelector<HTMLButtonElement>("#logout-all-sessions-btn");
  const renderActiveSessions = async () => {
    if (!activeSessionsList) return;
    activeSessionsList.textContent = "Cargando sesiones...";
    const sessions = await loadActiveSessions();
    activeSessionsList.replaceChildren();
    if (sessions.length === 0) {
      activeSessionsList.textContent = "No hay sesiones activas para mostrar.";
      return;
    }
    sessions.forEach((session) => {
      const row = document.createElement("div");
      row.className = "active-session-item";
      const device = document.createElement("strong");
      const meta = document.createElement("span");
      device.textContent = `${session.current ? "Este dispositivo" : "Otro dispositivo"} · ${session.ipAddress ?? "IP no disponible"}`;
      meta.textContent = `Última actividad: ${formatSessionExpiry(session.lastSeenAt ?? session.createdAt)} · Expira: ${formatSessionExpiry(session.expiresAt)}`;
      row.append(device, meta);
      activeSessionsList.append(row);
    });
  };
  refreshSessionsBtn?.addEventListener("click", () => void renderActiveSessions());
	  logoutAllSessionsBtn?.addEventListener("click", async () => {
	    const confirmed = await requestNotificationConfirm(
        "Se cerrara tu sesion en todos los dispositivos. Tendras que iniciar sesion otra vez.",
        "Cerrar todas"
      );
	    if (!confirmed) return;
	    await closeAllUserSessions();
	    window.location.reload();
  });
  container.querySelectorAll<HTMLButtonElement>("[data-export-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await downloadExport(button.dataset.exportType as "inventory-csv" | "inventory-pdf" | "config-backup");
        setProfileStatus(refs, "Exportacion generada correctamente.", false);
      } catch {
        setProfileStatus(refs, "No se pudo generar la exportacion.", true);
      }
    });
  });
  if (initialSession) void renderActiveSessions();

	  const userAdminPanel = container.querySelector<HTMLElement>("#user-admin-panel");
  const userAdminBtn = container.querySelector<HTMLButtonElement>("#user-admin-btn");
  const closeUserAdminPanelBtn = container.querySelector<HTMLButtonElement>("#close-user-admin-panel-btn");
  const userManagementPanel = container.querySelector<HTMLElement>("#user-management-panel");
  const userAdminStatus = container.querySelector<HTMLParagraphElement>("#user-admin-status");
  const createUserWizard = container.querySelector<HTMLElement>("#create-user-wizard");
  const openCreateUserWizardBtn = container.querySelector<HTMLButtonElement>("#open-create-user-wizard-btn");
  const cancelCreateUserBtn = container.querySelector<HTMLButtonElement>("#cancel-create-user-btn");
  const prevCreateUserStepBtn = container.querySelector<HTMLButtonElement>("#prev-create-user-step-btn");
  const nextCreateUserStepBtn = container.querySelector<HTMLButtonElement>("#next-create-user-step-btn");
	  const createUserBtn = container.querySelector<HTMLButtonElement>("#create-user-btn");
  const managedUsersList = container.querySelector<HTMLElement>("#managed-users-list");
  const refreshUsersBtn = container.querySelector<HTMLButtonElement>("#refresh-users-btn");
  const newUserName = container.querySelector<HTMLInputElement>("#new-user-name");
  const newUserEmail = container.querySelector<HTMLInputElement>("#new-user-email");
  const newUserRole = container.querySelector<HTMLSelectElement>("#new-user-role");
  const newUserPassword = container.querySelector<HTMLInputElement>("#new-user-password");
  let createUserWizardStep = 1;
  const setCreateUserWizardOpen = (isOpen: boolean) => {
    if (!createUserWizard) return;
    createUserWizard.hidden = !isOpen;
    if (isOpen) setCreateUserWizardStep(1);
    if (!isOpen) {
      if (newUserName) newUserName.value = "";
      if (newUserEmail) newUserEmail.value = "";
      if (newUserPassword) newUserPassword.value = "";
    }
  };
  const setCreateUserWizardStep = (step: number) => {
    createUserWizardStep = Math.max(1, Math.min(3, step));
    if (createUserWizard) createUserWizard.dataset.step = String(createUserWizardStep);
    if (prevCreateUserStepBtn) prevCreateUserStepBtn.hidden = createUserWizardStep === 1;
    if (nextCreateUserStepBtn) nextCreateUserStepBtn.hidden = createUserWizardStep === 3;
    if (createUserBtn) createUserBtn.hidden = createUserWizardStep !== 3;
  };
  const validateCreateUserStep = () => {
    if (createUserWizardStep === 1 && (!newUserName?.value.trim() || !newUserEmail?.value.trim())) {
      setPanelStatus(userAdminStatus, "Completa nombre y correo para continuar.", true);
      return false;
    }
    if (createUserWizardStep === 3 && (!newUserPassword || newUserPassword.value.length < 6)) {
      setPanelStatus(userAdminStatus, "La contraseña temporal debe tener al menos 6 caracteres.", true);
      return false;
    }
    return true;
  };

  const roleKey = (role: string) => role.trim().toLowerCase() === "administrador" ? "admin" : role.trim().toLowerCase();
  const canUse = (permission: "product:write" | "product:delete" | "shelf:write" | "report:read" | "user:manage") => {
    const role = roleKey(activeSession?.user.role ?? "");
    const permissions: Record<string, string[]> = {
      admin: ["product:write", "product:delete", "shelf:write", "report:read", "user:manage"],
      operador: ["product:write"],
      consulta: ["report:read"]
    };
    return permissions[role]?.includes(permission) ?? false;
  };

  const applyRoleAccess = () => {
    const canWriteProducts = canUse("product:write");
    const canDeleteProducts = canUse("product:delete");
    const canWriteShelves = canUse("shelf:write");
    const canReadReports = canUse("report:read");
    const canManageUsers = canUse("user:manage");

    container.querySelectorAll<HTMLElement>("[data-product-toggle]").forEach((el) => { el.hidden = !canWriteProducts; });
    container.querySelectorAll<HTMLElement>("[data-panel-toggle='shelf-manager-panel']").forEach((el) => { el.hidden = !canWriteShelves; });
    container.querySelectorAll<HTMLElement>("[data-report-toggle]").forEach((el) => { el.hidden = !canReadReports; });

    refs.productEditor.hidden = refs.productEditor.hidden || !canWriteProducts;
    refs.moveProductBtn.hidden = !canWriteProducts;
    refs.transferProductBtn.hidden = !canWriteProducts;
    refs.selectedProductEditBtn.hidden = !canWriteProducts;
    refs.deleteProductBtn.hidden = !canDeleteProducts;
    refs.editShelvesBtn.hidden = !canWriteShelves;
    refs.productForm.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select").forEach((el) => {
      el.disabled = !canWriteProducts;
    });
	    if (userAdminBtn) userAdminBtn.hidden = !canManageUsers;
	    if (!canManageUsers && userAdminPanel) userAdminPanel.hidden = true;
	  };

  applyRoleAccess();

  const openUserAdminPanel = async () => {
    if (!userAdminPanel || !canUse("user:manage")) return;
    refs.authPanel.hidden = true;
    refs.authPanel.setAttribute("aria-hidden", "true");
    userAdminPanel.hidden = false;
    await refreshManagedUsers();
  };

  const closeUserAdminPanel = () => {
    if (userAdminPanel) userAdminPanel.hidden = true;
    setCreateUserWizardOpen(false);
  };

  const refreshManagedUsers = async () => {
    if (!userManagementPanel || userAdminPanel?.hidden || !managedUsersList) return;
    managedUsersList.textContent = "Cargando usuarios...";
    renderManagedUsers(await loadManagedUsers());
  };

  const buildInput = (labelText: string, value: string, type = "text") => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const input = document.createElement("input");
    span.textContent = labelText;
    input.type = type;
    input.value = value;
    label.append(span, input);
    return { label, input };
  };

  const renderManagedUsers = (users: Awaited<ReturnType<typeof loadManagedUsers>>) => {
    if (!managedUsersList) return;
    managedUsersList.replaceChildren();
    if (users.length === 0) {
      managedUsersList.textContent = "No hay usuarios para mostrar.";
      return;
    }

	    users.forEach((user) => {
	      const card = document.createElement("article");
	      card.className = "managed-user-card";

      const head = document.createElement("div");
      head.className = "managed-user-head";
      const title = document.createElement("div");
      const name = document.createElement("strong");
      const email = document.createElement("small");
      const state = document.createElement("span");
      name.textContent = user.name;
      email.textContent = user.email;
      state.className = "managed-user-state";
      state.dataset.active = String(user.active);
	      state.textContent = user.active ? "Activo" : "Inactivo";
	      title.append(name, email);
	      head.append(title, state);

      const meta = document.createElement("div");
      meta.className = "managed-user-meta";
      meta.textContent = `${user.role} · Usuario #${user.id}`;

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "profile-secondary-btn";
      editBtn.textContent = "Editar";

	      const controls = document.createElement("div");
	      controls.className = "managed-user-controls";
      controls.hidden = true;
	      const nameInput = buildInput("Nombre", user.name);
      const emailInput = buildInput("Correo", user.email, "email");
      const roleLabel = document.createElement("label");
      const roleSpan = document.createElement("span");
      const roleSelect = document.createElement("select");
      roleSpan.textContent = "Rol";
      (["Admin", "Operador", "Consulta"] as const).forEach((role) => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        option.selected = role === user.role;
        roleSelect.append(option);
      });
      roleLabel.append(roleSpan, roleSelect);
      const passwordInput = buildInput("Nueva contraseña temporal", "", "password");
      passwordInput.input.placeholder = "Dejar vacio para no cambiar";

      const activeLabel = document.createElement("label");
      const activeSpan = document.createElement("span");
      const activeInput = document.createElement("input");
      activeSpan.textContent = "Cuenta activa";
      activeInput.type = "checkbox";
      activeInput.checked = user.active;
      activeLabel.append(activeSpan, activeInput);

      const actions = document.createElement("div");
      actions.className = "managed-user-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Guardar";
      saveBtn.addEventListener("click", async () => {
        const updated = await updateManagedUser({
          id: user.id,
          name: nameInput.input.value.trim(),
          email: emailInput.input.value.trim(),
          role: roleSelect.value as "Admin" | "Operador" | "Consulta",
          active: activeInput.checked,
          password: passwordInput.input.value
	        });
	        renderManagedUsers(updated);
	        setPanelStatus(userAdminStatus, "Usuario actualizado correctamente.", false);
	      });
	      actions.append(saveBtn);

	      controls.append(nameInput.label, emailInput.label, roleLabel, passwordInput.label, activeLabel, actions);
      editBtn.addEventListener("click", () => {
        controls.hidden = !controls.hidden;
        editBtn.textContent = controls.hidden ? "Editar" : "Cerrar edición";
      });
	      card.append(head, meta, editBtn, controls);
	      managedUsersList.append(card);
	    });
	  };

  openCreateUserWizardBtn?.addEventListener("click", () => setCreateUserWizardOpen(true));
  cancelCreateUserBtn?.addEventListener("click", () => setCreateUserWizardOpen(false));
  prevCreateUserStepBtn?.addEventListener("click", () => setCreateUserWizardStep(createUserWizardStep - 1));
  nextCreateUserStepBtn?.addEventListener("click", () => {
	    if (!validateCreateUserStep()) return;
    setCreateUserWizardStep(createUserWizardStep + 1);
    refs.profileStatus.hidden = true;
  });

	  createUserBtn?.addEventListener("click", async () => {
	    if (!newUserName || !newUserEmail || !newUserRole || !newUserPassword) return;
    if (!validateCreateUserStep()) return;
	    const users = await createManagedUser({
      name: newUserName.value.trim(),
      email: newUserEmail.value.trim(),
      role: newUserRole.value as "Admin" | "Operador" | "Consulta",
      password: newUserPassword.value
    });
	    newUserName.value = "";
	    newUserEmail.value = "";
	    newUserPassword.value = "";
	    setCreateUserWizardOpen(false);
		    renderManagedUsers(users);
	    setPanelStatus(userAdminStatus, "Usuario creado correctamente.", false);
	  });

  userAdminBtn?.addEventListener("click", () => void openUserAdminPanel());
  closeUserAdminPanelBtn?.addEventListener("click", closeUserAdminPanel);
	  refreshUsersBtn?.addEventListener("click", refreshManagedUsers);

	  refs.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = await createUserSession({
      email: refs.authEmail.value.trim(),
      password: refs.authPassword.value
    });
    if (!session) {
      setStatus(refs.statusMessage, "Correo o contraseña incorrectos.", true);
      return;
    }
    refs.authPassword.value = "";
    window.history.replaceState(null, "", window.location.pathname.replace(/\/LOGIN\/?$/i, "/"));
    window.location.hash = "";
    window.location.reload();
  });

  if (!initialSession) {
    window.history.replaceState(null, "", window.location.pathname.replace(/\/LOGIN\/?$/i, "/"));
    return;
  }

	  const config = await loadWarehouseConfig();
	  refs.summaryShelves.textContent = String(config.shelves.length);

  setLoadingText(UI_COPY.status.loadingScene);
  const { scene, renderer, camera, controls } = buildScene(refs.canvas);
  const runtime = createRuntime(config);

  addLights(scene);
  addFloor(scene);
  const wallMeshes = addWalls(scene, config.shelves);
  const door = addDoorS01S02(scene, config.shelves);
  const wallColliders = [...wallMeshes, ...(door?.wallMeshes ?? [])];
  const entrancePosition = getConfiguredEntrancePosition(config, door?.entrancePosition);
  let isEditCameraFree = false;
  let doorOpen = false;
  const setDoorOpen = (isOpen: boolean): void => {
    if (!door) return;
    doorOpen = isOpen;
    gsap.to(door.pivot.rotation, { y: doorOpen ? -Math.PI / 2 : 0, duration: 0.5, ease: "power2.inOut" });
  };
  const ensureDoorOpen = (): boolean => {
    if (!door || doorOpen) return false;
    setDoorOpen(true);
    return true;
  };
  setCameraAtEntrance(camera, controls, entrancePosition, refs.canvas.parentElement);
  const blockCameraAtWalls = createWallCollisionBlocker(
    camera,
    controls,
    wallColliders,
    () => isEditCameraFree
  );
	  const routeControls = createRouteStepControls(refs.canvas.parentElement);
	  let guidedRoute: GuidedRoute | null = null;
	  let guidedRouteSku: string | null = null;
	  let selectedProductSku: string | null = null;
	  let keepCurrentRouteUntilFinish = false;
  let routeNoticeTimer: number | null = null;
	  const showRouteNotice = (message: string): void => {
	    setStatus(refs.statusMessage, message, "warning");
	    refs.statusMessage.dataset.notice = "route";
    if (routeNoticeTimer !== null) window.clearTimeout(routeNoticeTimer);
    routeNoticeTimer = window.setTimeout(() => {
      if (refs.statusMessage.dataset.notice === "route") {
        setStatus(refs.statusMessage, "", false);
        delete refs.statusMessage.dataset.notice;
      }
      routeNoticeTimer = null;
	    }, 4200);
	  };

  const requestNotificationConfirm = (message: string, confirmLabel: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setStatus(refs.statusMessage, message, "warning");
      const actions = document.createElement("div");
      actions.className = "status-message-actions";
      const cancelBtn = document.createElement("button");
      const confirmBtn = document.createElement("button");
      cancelBtn.type = "button";
      confirmBtn.type = "button";
      cancelBtn.textContent = "Cancelar";
      confirmBtn.textContent = confirmLabel;
      cancelBtn.addEventListener("click", () => {
        setStatus(refs.statusMessage, "", "info");
        resolve(false);
      }, { once: true });
      confirmBtn.addEventListener("click", () => {
        setStatus(refs.statusMessage, "", "info");
        resolve(true);
      }, { once: true });
      actions.append(cancelBtn, confirmBtn);
      refs.statusMessage.append(actions);
    });
  };

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

  let retryProductsButton: HTMLButtonElement | null = null;
  const clearProductsBeforeRetry = (): void => {
    runtime.productsByShelf.forEach((_, shelfId) => {
      runtime.productsByShelf.set(shelfId, []);
      runtime.productSkusByShelf.set(shelfId, []);
      updateLegendCount(shelfId, 0);
    });
    runtime.productEntryBySku.clear();
    runtime.instanceOwner.clear();
    runtime.instancedMeshByGeo.forEach((mesh) => {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  };
  const restoreSavedProducts = async (): Promise<boolean> => {
    const result = await loadPlacedProducts();
    if (!result.ok) {
      setStatus(refs.statusMessage, UI_COPY.status.productsLoadFailed, true);
      if (!retryProductsButton) {
        retryProductsButton = document.createElement("button");
        retryProductsButton.type = "button";
        retryProductsButton.className = "status-retry-btn";
        retryProductsButton.textContent = UI_COPY.status.productsLoadRetry;
        refs.statusMessage.insertAdjacentElement("afterend", retryProductsButton);
        retryProductsButton.addEventListener("click", async () => {
          retryProductsButton?.setAttribute("disabled", "true");
          setStatus(refs.statusMessage, UI_COPY.status.loadingProducts, false);
          clearProductsBeforeRetry();
          const restored = await restoreSavedProducts();
          if (restored) {
            retryProductsButton?.remove();
            retryProductsButton = null;
            setStatus(refs.statusMessage, UI_COPY.status.initial, false);
          } else {
            retryProductsButton?.removeAttribute("disabled");
          }
        });
      }
      return false;
    }

    if (result.products.length === 0) {
      setStatus(refs.statusMessage, UI_COPY.status.productsEmpty, false);
      refs.statusMessage.dataset.state = "empty";
      return true;
    }

    for (const { shelfId, item, localPosition } of result.products) {
      const shelfMesh = shelfMeshes.get(shelfId);
      if (!shelfMesh) continue;
      restoreItem(runtime, scene, shelfId, item, localPosition, shelfMesh);
      const count = runtime.productsByShelf.get(shelfId)?.length ?? 0;
      updateLegendCount(shelfId, count);
    }
    updateDashboardSummary(refs, runtime, 0);
    return true;
  };

  const productsLoaded = await restoreSavedProducts();
  updateDashboardSummary(refs, runtime, 0);
  if (productsLoaded && refs.statusMessage.dataset.state !== "empty") {
    setStatus(refs.statusMessage, UI_COPY.status.initial, false);
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
    },
    onProductPlaced: () => updateDashboardSummary(refs, runtime, 0),
    enableGhostPreview: !isMobileRouteMode
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
    runtime,
    (enabled) => {
      isEditCameraFree = enabled;
    }
  );

  const canChangeRouteProduct = (sku: string): boolean => {
    if (!guidedRoute || !guidedRouteSku || guidedRouteSku === sku) return true;

	    if (keepCurrentRouteUntilFinish) {
      showRouteNotice(`Ruta protegida para ${guidedRouteSku}. Termina la ruta antes de cambiar de producto.`);
	      return false;
	    }

    showRouteNotice(`Ruta actualizada: ahora va hacia ${sku}.`);

    return true;
	  };

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
		    editorSerialNumber: refs.editorSerialNumber,
		    editorCategory: refs.editorCategory,
	    editorBrand: refs.editorBrand,
	    editorImageUrl: refs.editorImageUrl,
	    editorWidth: refs.editorWidth,
    editorHeight: refs.editorHeight,
    editorDepth: refs.editorDepth,
    onMoveRequested: dragController.armProductMove,
	    onProductRemoved: (shelfId: string) => {
	      if (refs.shelfSelect.value === shelfId) {
	        refreshShelfSummary(shelfId);
	      }
	      updateDashboardSummary(refs, runtime, 0);
	    },
	     beforeProductSelected: canChangeRouteProduct,
				    onProductLocated: (worldPos, shelfMesh, sku) => {
				      selectedProductSku = sku;
				      refs.selectedProductPanel.hidden = true;
				      guidedRouteSku = sku;
			      const routeEntry = runtime.productEntryBySku.get(sku);
	          if (isMobileRouteMode) {
	            makeShelvesReadableForMobileRoute(shelfMeshes, shelfMesh);
	            showMobileRouteProductMarker(scene, worldPos, routeEntry?.item);
	          }
			      const routeShelf = routeEntry ? config.shelves.find((shelf) => shelf.id === routeEntry.shelfId) : undefined;
	      const productLabel = routeEntry?.item.name ? `${routeEntry.item.name} (${sku})` : sku;
	      const destinationLabel = routeEntry
	        ? `${routeEntry.shelfId} · ${routeShelf?.label ?? routeEntry.shelfId} · ${getRouteSectionLabel(routeShelf, routeEntry.localPosition.y)}`
	        : "Destino no disponible";
	      guidedRoute = drawGuidedRoute(
	        scene,
	        camera,
        controls,
        entrancePosition,
        worldPos,
        shelfMesh,
        shelfMeshes,
        wallColliders,
        config.aisles ?? [],
		        guidedRoute,
		        routeControls,
		        ensureDoorOpen,
		        productLabel,
		        destinationLabel,
		        () => {
		          guidedRouteSku = null;
		          keepCurrentRouteUntilFinish = false;
		          routeControls.setLocked(false);
		          updateDashboardSummary(refs, runtime, 1);
		          setStatus(refs.statusMessage, `Llegaste al destino: ${productLabel}.`, false);
		        }
		      );
	    },
		    onSearchCleared: () => {
		      guidedRoute = clearGuidedRoute(scene, guidedRoute);
		      guidedRouteSku = null;
		      selectedProductSku = null;
		      refs.selectedProductPanel.hidden = true;
		      keepCurrentRouteUntilFinish = false;
		      routeControls.setLocked(false);
		      routeControls.hide();
		    }
		  });

	  routeControls.lockButton.onclick = () => {
    keepCurrentRouteUntilFinish = !keepCurrentRouteUntilFinish;
    routeControls.setLocked(keepCurrentRouteUntilFinish);
    setStatus(
      refs.statusMessage,
      keepCurrentRouteUntilFinish
        ? "Producto fijado: los clics accidentales no cambiaran la ruta hasta terminar."
        : "Producto liberado: puedes cambiar la ruta seleccionando otro producto.",
      false
    );
	  };

	  routeControls.cancelButton.onclick = () => {
	    guidedRoute = clearGuidedRoute(scene, guidedRoute);
	    guidedRouteSku = null;
	    keepCurrentRouteUntilFinish = false;
	    routeControls.setLocked(false);
	    setStatus(refs.statusMessage, "Ruta cancelada. Puedes buscar o seleccionar otro producto.", false);
	  };

  routeControls.detailButton.onclick = () => {
    if (!selectedProductSku) return;
    updateSelectedProductPanel(refs, runtime, config, selectedProductSku);
    refs.selectedProductPanel.hidden = false;
    refs.selectedProductPanel.dataset.minimized = "false";
  };

  const routeSku = new URLSearchParams(window.location.search).get("sku")?.trim();
  if (routeSku) {
    window.setTimeout(() => {
      selectProduct(routeSku);
    }, 450);
  }

		  refs.selectedProductHistoryBtn.addEventListener("click", async () => {
		    if (!selectedProductSku) return;
		    const history = await loadProductHistory(selectedProductSku);
		    const message = history.length > 0
		      ? history.slice(0, 3).map((entry) => {
	          const actor = entry.actor?.name
	            ? ` · Usuario: ${entry.actor.name}${entry.actor.role ? ` (${entry.actor.role})` : ""}`
	            : " · Usuario: no registrado";
	          return `${entry.createdAt} · ${entry.summary}${actor}`;
	        }).join(" | ")
		      : "Este producto aun no tiene historial registrado.";
		    setStatus(refs.statusMessage, message, history.length > 0 ? "info" : "warning");
		  });

  refs.selectedProductEditBtn.addEventListener("click", () => {
    if (!selectedProductSku) return;
    refs.canvas.parentElement?.querySelector<HTMLElement>("#search-card")?.setAttribute("hidden", "");
    refs.selectedProductPanel.hidden = true;
    refs.productEditor.hidden = false;
    refs.productEditor.dataset.minimized = "false";
  });

			  refs.profileForm.addEventListener("submit", async (event) => {
		    event.preventDefault();
		    const newPassword = refs.profileNewPassword.value.trim();
	    const confirmPassword = refs.profileConfirmPassword.value.trim();
		    const currentPassword = refs.profileCurrentPassword.value;
	    const emailChanged = activeSession ? refs.profileEmail.value.trim() !== activeSession.user.email : false;
		    if (emailChanged && !currentPassword) {
		      setProfilePasswordSectionOpen(true);
		      setProfileStatus(refs, "Para cambiar el correo, abre esta seccion e ingresa tu contraseña actual.", true);
		      refs.profileCurrentPassword.focus();
		      return;
		    }
		    if (newPassword && !currentPassword) {
		      setProfilePasswordSectionOpen(true);
		      setProfileStatus(refs, "Ingresa tu contraseña actual para cambiar la contraseña.", true);
		      refs.profileCurrentPassword.focus();
		      return;
		    }
	    if ((newPassword || confirmPassword) && newPassword !== confirmPassword) {
	      setProfilePasswordSectionOpen(true);
	      setProfileStatus(refs, "La confirmacion de contraseña no coincide.", true);
	      refs.profileConfirmPassword.focus();
	      return;
	    }
	    const session = await updateUserProfile({
	      name: refs.profileName.value.trim(),
      email: refs.profileEmail.value.trim(),
      currentPassword,
      newPassword
    });
    if (!session) {
      setProfileStatus(refs, "No se pudo actualizar el perfil. Revisa los datos.", true);
      return;
	    }
		    refs.profileCurrentPassword.value = "";
		    refs.profileNewPassword.value = "";
	    refs.profileConfirmPassword.value = "";
	    setProfilePasswordSectionOpen(false);
		    applySession(session);
	    applyRoleAccess();
	    setProfileEditOpen(false);
	    refs.authPanel.hidden = false;
	    setProfileStatus(refs, "Perfil actualizado correctamente.", false);
	  });

  refs.profileResetBtn.addEventListener("click", () => {
    if (!activeSession) return;
    refs.profileName.value = activeSession.user.name;
    refs.profileEmail.value = activeSession.user.email;
	    refs.profileCurrentPassword.value = "";
	    refs.profileNewPassword.value = "";
	    refs.profileConfirmPassword.value = "";
	    setProfilePasswordSectionOpen(false);
	    setProfileEditOpen(false);
	    setProfileStatus(refs, "Cambios descartados.", false);
	  });

		  refs.authLogoutBtn.addEventListener("click", async () => {
	    await closeUserSession();
	    refs.authPassword.value = "";
		    refs.profileCurrentPassword.value = "";
		    refs.profileNewPassword.value = "";
	    refs.profileConfirmPassword.value = "";
	    setProfilePasswordSectionOpen(false);
		    applySession(null);
	    applyRoleAccess();
		  });

  wireViewportControls({
    refs,
    camera,
    controls,
    entrancePosition,
    getSelectedSku: () => selectedProductSku,
    runtime,
    shelfMeshes
  });

  setupWarehouseRouteConfigPanel(config, camera, entrancePosition, refs.statusMessage);

  const clearSelectedProduct = () => {
    refs.productEditor.hidden = true;
    refs.selectedProductPanel.hidden = true;
    selectedProductSku = null;
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

  // Abrir / cerrar la puerta al hacer clic sobre el panel
  if (door) {
    const doorRaycaster = new THREE.Raycaster();
    const doorNdc = new THREE.Vector2();
    refs.canvas.addEventListener("click", (e: MouseEvent) => {
      if (dragController.isSuppressed()) return;
      const rect = refs.canvas.getBoundingClientRect();
      doorNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      doorRaycaster.setFromCamera(doorNdc, camera);
      if (doorRaycaster.intersectObject(door.panel).length > 0) {
        setDoorOpen(!doorOpen);
      }
    });
  }

  // Wire the edit-panel's "Eliminar piso" button
  const removeBoardBtn = document.querySelector<HTMLButtonElement>("#remove-board-btn");
  removeBoardBtn?.addEventListener("click", handleRemoveBoard);

  // ── Reporte completo ──
	  const openReport = async () => {
	    const history = await loadProductHistory(undefined, 200);
	    import("./report-page.js").then(({ openReportWindow }) => {
	      openReportWindow({
	        shelves: config.shelves,
	        productsBySku: runtime.productEntryBySku,
	        generatedAt: new Date(),
	        history,
	      });
	    });
	  };
  container.querySelectorAll<HTMLButtonElement>("[data-report-toggle]").forEach((button) => {
    button.addEventListener("click", openReport);
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
	  const targetFrameMs = isMobileRouteMode ? 1000 / 30 : 0;
	  let lastRenderAt = 0;

	  renderer.setAnimationLoop((time) => {
	    if (targetFrameMs > 0 && time - lastRenderAt < targetFrameMs) return;
	    lastRenderAt = time;
	    updateWASDMovement(clock.getDelta());
	    controls.update();
	    blockCameraAtWalls();
	    if (!isMobileRouteMode) {
	      updateShelfTransparency(camera, shelfMeshes);
	    }
	    renderer.render(scene, camera);
	  });
}

function updateDashboardSummary(refs: HudRefs, runtime: WarehouseRuntime, completedRouteDelta: number): void {
  const products = runtime.productEntryBySku.size;
  refs.summaryProducts.textContent = products.toLocaleString("es-PE");
  const currentRoutes = Number(refs.summaryRoutes.textContent || "0");
  refs.summaryRoutes.textContent = String(Math.max(0, currentRoutes + completedRouteDelta));
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "US";
  return parts[0][0].toUpperCase();
}

function setProfileStatus(refs: HudRefs, message: string, isError: boolean): void {
  setPanelStatus(refs.profileStatus, message, isError);
}

function setPanelStatus(element: HTMLParagraphElement | null, message: string, state: boolean | "success" | "error" | "warning" | "info"): void {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.dataset.state = typeof state === "boolean" ? (state ? "error" : "success") : state;
}

function formatSessionExpiry(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function updateSelectedProductPanel(
  refs: HudRefs,
  runtime: WarehouseRuntime,
  config: WarehouseConfig,
  sku: string
): void {
  const entry = runtime.productEntryBySku.get(sku);
  if (!entry) {
    refs.selectedProductPanel.hidden = true;
    return;
  }

  const shelf = config.shelves.find((candidate) => candidate.id === entry.shelfId);
  const section = getRouteSectionLabel(shelf, entry.localPosition.y);
  refs.selectedProductPanel.hidden = false;
  refs.selectedProductStatus.textContent = "Disponible";
  refs.selectedProductName.textContent = entry.item.name || sku;
	  refs.selectedProductSku.textContent = entry.item.serialNumber ? `Serie: ${entry.item.serialNumber}` : "Serie no asignada";
  refs.selectedProductImage.textContent = entry.item.imageUrl ? "" : "Sin imagen";
  refs.selectedProductImage.style.backgroundImage = entry.item.imageUrl ? `url("${entry.item.imageUrl.replace(/"/g, "%22")}")` : "";
  refs.selectedProductImage.dataset.hasImage = entry.item.imageUrl ? "true" : "false";
  refs.selectedProductLocation.textContent =
    `${entry.shelfId} · ${shelf?.label ?? entry.shelfId} · ${section} · Posición X ${formatRouteMetric(entry.localPosition.x)}, Y ${formatRouteMetric(entry.localPosition.y)}, Z ${formatRouteMetric(entry.localPosition.z)}`;
  refs.selectedProductDimensions.textContent =
    `${formatRouteMetric(entry.item.width)} x ${formatRouteMetric(entry.item.height)} x ${formatRouteMetric(entry.item.depth)} m`;
  refs.selectedProductStock.textContent =
    `${runtime.productSkusByShelf.get(entry.shelfId)?.length ?? 1} unidades en estante`;
  refs.selectedProductCategory.textContent =
    [entry.item.category, entry.item.brand].filter(Boolean).join(" / ") || "Sin catalogar";
}

function wireViewportControls(params: {
  refs: HudRefs;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  entrancePosition: THREE.Vector3;
  getSelectedSku: () => string | null;
  runtime: WarehouseRuntime;
  shelfMeshes: Map<string, THREE.Mesh>;
}): void {
  const { refs, camera, controls, entrancePosition, getSelectedSku, runtime, shelfMeshes } = params;
  let topView = false;

  const moveAlongView = (factor: number) => {
    const direction = camera.position.clone().sub(controls.target);
    const nextDistance = Math.min(Math.max(direction.length() * factor, 1.2), 42);
    direction.setLength(nextDistance);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  };

  refs.resetCameraBtn.addEventListener("click", () => {
    topView = false;
    refs.cameraModeBtn.textContent = "3D";
    setCameraAtEntrance(camera, controls, entrancePosition, refs.canvas.parentElement);
  });

	  refs.focusSelectedBtn.addEventListener("click", () => {
	    const sku = getSelectedSku();
	    const entry = sku ? runtime.productEntryBySku.get(sku) : null;
	    if (!entry) {
	      setStatus(refs.statusMessage, "Busca o selecciona un producto antes de enfocarlo.", true);
	      return;
	    }
	    const mesh = shelfMeshes.get(entry.shelfId);
	    const instancedMesh = runtime.instancedMeshByGeo.get(entry.geoKey);
	    if (!mesh || !instancedMesh) {
	      setStatus(refs.statusMessage, "No se pudo enfocar el producto seleccionado en la escena.", true);
	      return;
	    }
	    topView = false;
	    refs.cameraModeBtn.textContent = "3D";
	    focusOnProductFromAisle(getInstanceWorldPosition(instancedMesh, entry.instanceIndex), mesh, camera, controls, entry.item);
	    setStatus(refs.statusMessage, `Enfocando producto ${sku}.`, false);
	  });

  refs.cameraModeBtn.addEventListener("click", () => {
    topView = !topView;
    refs.cameraModeBtn.textContent = topView ? "TOP" : "3D";
    if (topView) {
      gsap.to(camera.position, {
        x: controls.target.x,
        y: 18,
        z: controls.target.z + 0.01,
        duration: 0.45,
        ease: "power2.inOut",
        onUpdate: () => {
          camera.lookAt(controls.target);
          controls.update();
        }
      });
      return;
    }
    setCameraAtEntrance(camera, controls, entrancePosition, refs.canvas.parentElement);
  });

  refs.zoomInBtn.addEventListener("click", () => moveAlongView(0.78));
  refs.zoomOutBtn.addEventListener("click", () => moveAlongView(1.28));
  refs.fullscreenBtn.addEventListener("click", () => {
    const viewport = refs.canvas.parentElement;
    if (!viewport) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void viewport.requestFullscreen();
    }
  });
}

function formatRouteMetric(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function setCameraAtEntrance(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  entrancePosition: THREE.Vector3,
  viewport: HTMLElement | null
): void {
  const viewportWidth = viewport?.clientWidth ?? window.innerWidth;
  const viewportHeight = viewport?.clientHeight ?? window.innerHeight;
  const isMobileViewport = viewportWidth <= 900 || viewportHeight > viewportWidth;
  const cameraOffsetX = isMobileViewport ? 4.2 : 0.55;
  const targetOffsetX = isMobileViewport ? -2.2 : -1.4;

  camera.fov = isMobileViewport ? 82 : 60;
  camera.position.set(entrancePosition.x + cameraOffsetX, 1.65, entrancePosition.z);
  controls.target.set(entrancePosition.x + targetOffsetX, 1.25, entrancePosition.z);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

interface RouteStepControls {
  container: HTMLDivElement;
  backButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  finishButton: HTMLButtonElement;
  detailButton: HTMLButtonElement;
  lockButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  setRouteInfo: (productLabel: string, destinationLabel: string) => void;
  setStep: (current: number, total: number) => void;
  setBusy: (isBusy: boolean) => void;
  setLocked: (isLocked: boolean) => void;
  show: () => void;
  hide: () => void;
}

interface GuidedRoute {
  points: THREE.Vector3[];
  productFocus: THREE.Vector3;
  activeSegment: THREE.Group | null;
  currentStep: number;
  controls: RouteStepControls;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  ensureDoorOpen: () => boolean;
  onFinished?: () => void;
}

function createRouteStepControls(viewport: HTMLElement | null): RouteStepControls {
  const container = document.createElement("div");
  container.className = "route-step-controls";
  container.dataset.minimized = "false";
  container.hidden = true;

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "route-step-minimize";
  minimizeButton.title = "Minimizar ruta";
  minimizeButton.setAttribute("aria-label", "Minimizar ruta");
  minimizeButton.textContent = "−";
  minimizeButton.addEventListener("click", () => {
    const isMinimized = container.dataset.minimized === "true";
    container.dataset.minimized = isMinimized ? "false" : "true";
    minimizeButton.textContent = isMinimized ? "−" : "+";
    minimizeButton.title = isMinimized ? "Minimizar ruta" : "Expandir ruta";
    minimizeButton.setAttribute("aria-label", minimizeButton.title);
  });

  const info = document.createElement("div");
  info.className = "route-step-info";

  const productText = document.createElement("strong");
  productText.textContent = "Ruta guiada";

  const destinationText = document.createElement("span");
  destinationText.textContent = "Destino pendiente";

  const progressText = document.createElement("small");
  progressText.textContent = "Paso 1 de 1";

  info.append(productText, destinationText, progressText);

  const actions = document.createElement("div");
  actions.className = "route-step-actions";

  const backButton = createRouteButton("Retroceder");
  const nextButton = createRouteButton("Avanzar ruta");
  const finishButton = createRouteButton("Ir al final");
  const detailButton = createRouteButton("Ver detalle");
  const lockButton = createRouteButton("Fijar");
  const cancelButton = createRouteButton("Cancelar");
  lockButton.classList.add("route-step-btn--lock");
  lockButton.setAttribute("aria-pressed", "false");
  cancelButton.classList.add("route-step-btn--cancel");

  actions.append(backButton, nextButton, finishButton, detailButton, lockButton, cancelButton);
  container.append(minimizeButton, info, actions);
  viewport?.append(container);

  let lastCurrent = 1;
  let lastTotal = 1;

  const applyStepState = () => {
    progressText.textContent = lastCurrent >= lastTotal
      ? `Llegaste al destino (${lastTotal}/${lastTotal})`
      : `Paso ${lastCurrent} de ${lastTotal}`;
    nextButton.textContent = lastCurrent >= lastTotal ? "Llegaste" : `Avanzar ${lastCurrent}/${lastTotal}`;
    backButton.disabled = lastCurrent <= 1;
    nextButton.disabled = lastCurrent >= lastTotal;
    finishButton.disabled = lastCurrent <= 1 || lastCurrent >= lastTotal;
  };

  return {
    container,
	    backButton,
	    nextButton,
	    finishButton,
      detailButton,
	    lockButton,
    cancelButton,
    setRouteInfo: (productLabel: string, destinationLabel: string) => {
      productText.textContent = productLabel;
      destinationText.textContent = destinationLabel;
    },
    setStep: (current: number, total: number) => {
      lastCurrent = current;
      lastTotal = total;
      applyStepState();
    },
    setBusy: (isBusy: boolean) => {
      if (!isBusy) {
        applyStepState();
        lockButton.disabled = false;
        return;
      }
      backButton.disabled = true;
      nextButton.disabled = true;
      finishButton.disabled = true;
      lockButton.disabled = isBusy;
    },
    setLocked: (isLocked: boolean) => {
      lockButton.dataset.locked = isLocked ? "true" : "false";
      lockButton.setAttribute("aria-pressed", isLocked ? "true" : "false");
      lockButton.textContent = isLocked ? "Fijado" : "Fijar";
    },
    show: () => {
      container.hidden = false;
    },
    hide: () => {
      container.hidden = true;
      container.dataset.minimized = "false";
      minimizeButton.textContent = "−";
      backButton.disabled = false;
      nextButton.disabled = false;
      finishButton.disabled = false;
      lockButton.disabled = false;
      cancelButton.disabled = false;
      backButton.onclick = null;
      nextButton.onclick = null;
      finishButton.onclick = null;
    }
  };
}

function createRouteButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "route-step-btn";
  button.textContent = label;
  return button;
}

let mobileRouteProductMarker: THREE.Group | null = null;

function makeShelvesReadableForMobileRoute(shelfMeshes: Map<string, THREE.Mesh>, targetShelf: THREE.Mesh): void {
  shelfMeshes.forEach((mesh) => {
    const isTarget = mesh === targetShelf;
    mesh.children
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === "__shelf_visual__")
      .forEach((part) => {
        const material = part.material as THREE.MeshStandardMaterial;
        gsap.killTweensOf(material);
        material.transparent = true;
        material.depthWrite = false;
        gsap.to(material, {
          opacity: isTarget ? 0.18 : 0.32,
          duration: 0.25,
          ease: "power1.out"
        });
      });
  });
}

function showMobileRouteProductMarker(scene: THREE.Scene, productWorldPos: THREE.Vector3, item?: Item): void {
  if (mobileRouteProductMarker) {
    scene.remove(mobileRouteProductMarker);
    mobileRouteProductMarker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

	  const group = new THREE.Group();
	  group.name = "__mobile_route_product_marker__";
	  group.position.copy(productWorldPos);

	  if (item) {
	    const productMaterial = new THREE.MeshBasicMaterial({
	      color: skuToColor(item.sku),
	      depthTest: false,
	      depthWrite: false,
	      transparent: true,
	      opacity: 0.98
	    });
	    const productProxy = new THREE.Mesh(
	      new THREE.BoxGeometry(item.width, item.height, item.depth),
	      productMaterial
	    );
	    productProxy.name = "__mobile_route_product_proxy__";
	    productProxy.renderOrder = 78;
	    group.add(productProxy);
	  }
	
	  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd43b,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.96
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.9
  });

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), markerMaterial);
  sphere.position.y = 0.34;
  sphere.renderOrder = 80;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.026, 12, 42), ringMaterial);
  ring.position.y = 0.34;
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 79;
  group.add(sphere, ring);
  scene.add(group);
  mobileRouteProductMarker = group;

  gsap.to(group.scale, {
    x: 1.25,
    y: 1.25,
    z: 1.25,
    duration: 0.7,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });
}

function getConfiguredEntrancePosition(config: WarehouseConfig, fallback?: THREE.Vector3): THREE.Vector3 {
  const entrance = config.entrance?.position;
  if (entrance && Number.isFinite(entrance.x) && Number.isFinite(entrance.z)) {
    return new THREE.Vector3(entrance.x, entrance.y ?? 0.04, entrance.z);
  }

  return fallback?.clone() ?? new THREE.Vector3(5.6, 0.04, 1.7);
}

function setupWarehouseRouteConfigPanel(
  config: WarehouseConfig,
  camera: THREE.PerspectiveCamera,
  entrancePosition: THREE.Vector3,
  statusMessage: HTMLParagraphElement
): void {
  const entranceX = document.querySelector<HTMLInputElement>("#warehouse-entrance-x");
  const entranceZ = document.querySelector<HTMLInputElement>("#warehouse-entrance-z");
  const aislesInput = document.querySelector<HTMLTextAreaElement>("#warehouse-aisles-input");
  const useCameraButton = document.querySelector<HTMLButtonElement>("#use-camera-entrance-btn");
  const saveButton = document.querySelector<HTMLButtonElement>("#save-route-config-btn");
  if (!entranceX || !entranceZ || !aislesInput || !useCameraButton || !saveButton) return;

  const syncFields = () => {
    entranceX.value = entrancePosition.x.toFixed(2);
    entranceZ.value = entrancePosition.z.toFixed(2);
    aislesInput.value = JSON.stringify(config.aisles ?? [], null, 2);
  };

  useCameraButton.addEventListener("click", () => {
    entranceX.value = camera.position.x.toFixed(2);
    entranceZ.value = camera.position.z.toFixed(2);
    setStatus(statusMessage, "Entrada preparada desde la posicion actual de la camara. Guarda para aplicarla.", false);
  });

  saveButton.addEventListener("click", () => {
    const x = Number.parseFloat(entranceX.value);
    const z = Number.parseFloat(entranceZ.value);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      setStatus(statusMessage, "Ingresa coordenadas validas para la entrada del almacen.", true);
      return;
    }

    let aisles: WarehouseAisle[];
    try {
      const parsed = JSON.parse(aislesInput.value || "[]") as WarehouseAisle[];
      if (!Array.isArray(parsed)) throw new Error("Los pasillos deben ser una lista.");
      aisles = parsed.filter((aisle) => aisle?.from && aisle?.to);
    } catch {
      setStatus(statusMessage, "El JSON de pasillos no es valido.", true);
      return;
    }

    entrancePosition.set(x, 0.04, z);
    config.entrance = {
      label: config.entrance?.label ?? "Entrada principal",
      position: { x, y: 0.04, z }
    };
    config.aisles = aisles;
    saveWarehouseConfig(config);
    setStatus(statusMessage, `Ruta del almacen actualizada: entrada (${x.toFixed(2)}, ${z.toFixed(2)}) y ${aisles.length} pasillo(s).`, false);
  });

  syncFields();
}

function drawGuidedRoute(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
  entrancePosition: THREE.Vector3,
  productWorldPos: THREE.Vector3,
  shelfMesh: THREE.Mesh,
  shelfMeshes: Map<string, THREE.Mesh>,
  wallColliders: THREE.Mesh[],
  aisles: WarehouseAisle[],
  currentRoute: GuidedRoute | null,
  controls: RouteStepControls,
  ensureDoorOpen: () => boolean,
  productLabel: string,
  destinationLabel: string,
  onFinished?: () => void
): GuidedRoute {
  clearGuidedRoute(scene, currentRoute);

  const start = entrancePosition.clone().setY(0.055);
  const end = getShelfApproachPoint(productWorldPos, shelfMesh, entrancePosition);
  const obstacleMeshes = [...shelfMeshes.values(), ...wallColliders];
  const manualPoints = buildBackShelfRoutePoints(start, end, shelfMesh, shelfMeshes, entrancePosition);
  const configuredAislePoints = buildConfiguredAisleRoutePoints(start, end, aisles);
  const rawPoints = manualPoints ?? configuredAislePoints ?? buildAisleRoutePoints(start, end, obstacleMeshes) ?? buildFallbackRoutePoints(start, end);
  const points = orthogonalizeRoutePoints(rawPoints);

  const route: GuidedRoute = {
    points,
    productFocus: productWorldPos.clone(),
    activeSegment: null,
    currentStep: 0,
    controls,
    camera,
    orbitControls,
    ensureDoorOpen,
    onFinished
  };

  controls.backButton.onclick = () => retreatGuidedRoute(scene, route);
  controls.nextButton.onclick = () => advanceGuidedRoute(scene, route);
  controls.finishButton.onclick = () => finishGuidedRoute(scene, route);
  controls.setRouteInfo(productLabel, destinationLabel);
  controls.show();
  renderGuidedRouteStep(scene, route);
  moveCameraWithRoute(route, 0);
  return route;
}

function buildFallbackRoutePoints(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
  const corner = new THREE.Vector3(start.x, 0.055, end.z);
  return start.distanceTo(corner) < 0.15 || corner.distanceTo(end) < 0.15
    ? [start, end]
    : [start, corner, end];
}

function buildConfiguredAisleRoutePoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  aisles: WarehouseAisle[]
): THREE.Vector3[] | null {
  if (aisles.length === 0) return null;

  const validAisles = aisles
    .map((aisle) => ({
      from: vectorFromConfig(aisle.from),
      to: vectorFromConfig(aisle.to)
    }))
    .filter((aisle) => aisle.from.distanceTo(aisle.to) > 0.25);
  if (validAisles.length === 0) return null;

  let bestRoute: THREE.Vector3[] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  validAisles.forEach((startAisle) => {
    const startProjection = projectPointToSegment(start, startAisle.from, startAisle.to);
    validAisles.forEach((endAisle) => {
      const endProjection = projectPointToSegment(end, endAisle.from, endAisle.to);
      const junction = projectPointToSegment(endProjection, startAisle.from, startAisle.to);
      const points = compactRoutePoints([start, startProjection, junction, endProjection, end]);
      const distance = routeDistance(points);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = points;
      }
    });
  });

  const route = bestRoute as THREE.Vector3[] | null;
  return route && route.length > 1 ? route : null;
}

function routeDistance(points: THREE.Vector3[]): number {
  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + point.distanceTo(points[index - 1]);
  }, 0);
}

function projectPointToSegment(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const segment = to.clone().sub(from);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return from.clone().setY(0.055);
  const t = THREE.MathUtils.clamp(point.clone().sub(from).dot(segment) / lengthSq, 0, 1);
  return from.clone().addScaledVector(segment, t).setY(0.055);
}

function vectorFromConfig(value: { x: number; y?: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y ?? 0.055, value.z);
}

function buildBackShelfRoutePoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  shelfMesh: THREE.Mesh,
  shelfMeshes: Map<string, THREE.Mesh>,
  entrancePosition: THREE.Vector3
): THREE.Vector3[] | null {
  const shelfId = String(shelfMesh.userData.shelfId ?? "");
  if (!["S03", "S04", "S05"].includes(shelfId)) return null;

  const guideShelf = shelfMeshes.get("S03") ?? shelfMesh;
  const guideGeometry = (guideShelf.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const guideNormal = getShelfAisleNormal(guideShelf, entrancePosition);
  const guideForward = new THREE.Vector3(0, 0, 1).applyQuaternion(guideShelf.quaternion).setY(0).normalize();
  const sideSign = guideForward.dot(guideNormal) >= 0 ? 1 : -1;
  const guideAislePoint = guideShelf.localToWorld(
    new THREE.Vector3(0, 0, sideSign * (guideGeometry.depth / 2 + 1.55))
  );

  const firstTurn = new THREE.Vector3(guideAislePoint.x, 0.055, start.z);
  const secondTurn = new THREE.Vector3(guideAislePoint.x, 0.055, end.z);

  return compactRoutePoints([start, firstTurn, secondTurn, end]);
}

function compactRoutePoints(points: THREE.Vector3[]): THREE.Vector3[] {
  return points.filter((point, index, list) => index === 0 || point.distanceTo(list[index - 1]) > 0.12);
}

function orthogonalizeRoutePoints(points: THREE.Vector3[]): THREE.Vector3[] {
  if (points.length < 2) return points;

  const orthogonalPoints: THREE.Vector3[] = [points[0].clone()];

  for (let index = 1; index < points.length; index += 1) {
    const from = orthogonalPoints[orthogonalPoints.length - 1];
    const to = points[index].clone();
    const hasXChange = Math.abs(to.x - from.x) > 0.12;
    const hasZChange = Math.abs(to.z - from.z) > 0.12;

    if (hasXChange && hasZChange) {
      const previous = orthogonalPoints[orthogonalPoints.length - 2];
      const continueX = previous ? Math.abs(from.x - previous.x) > Math.abs(from.z - previous.z) : false;
      const corner = continueX
        ? new THREE.Vector3(to.x, from.y, from.z)
        : new THREE.Vector3(from.x, from.y, to.z);
      orthogonalPoints.push(corner);
    }

    orthogonalPoints.push(to);
  }

  return compactRoutePoints(orthogonalPoints);
}

function getShelfApproachPoint(
  productWorldPos: THREE.Vector3,
  shelfMesh: THREE.Mesh,
  entrancePosition: THREE.Vector3
): THREE.Vector3 {
  const geometry = (shelfMesh.geometry as THREE.BoxGeometry).parameters as THREE.BoxGeometry["parameters"];
  const aisleNormal = getShelfAisleNormal(shelfMesh, entrancePosition);
  const shelfForward = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion).setY(0).normalize();
  const sideSign = shelfForward.dot(aisleNormal) >= 0 ? 1 : -1;
  const localProductPos = shelfMesh.worldToLocal(productWorldPos.clone());
  const sideMargin = 0.18;
  const localX = THREE.MathUtils.clamp(
    localProductPos.x,
    -geometry.width / 2 + sideMargin,
    geometry.width / 2 - sideMargin
  );
  const localZ = sideSign * (geometry.depth / 2 + 0.95);
  const approach = shelfMesh.localToWorld(new THREE.Vector3(localX, 0, localZ));

  return approach.setY(0.055);
}

function buildAisleRoutePoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  obstacleMeshes: THREE.Mesh[]
): THREE.Vector3[] | null {
  const cellSize = 0.35;
  const obstacleMargin = 0.26;
  const routeHeight = 0.08;
  const floorMinX = -13.5;
  const floorMaxX = 13.5;
  const floorMinZ = -9.5;
  const floorMaxZ = 9.5;
  const obstacleBoxes = obstacleMeshes
    .map((mesh) => new THREE.Box3().setFromObject(mesh).expandByScalar(obstacleMargin))
    .filter((box) => box.min.y <= routeHeight && box.max.y >= 0);
  const obstacles = obstacleBoxes.map((box) => ({
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z
  }));
  const bounds = obstacleBoxes.reduce(
    (acc, box) => {
      acc.minX = Math.min(acc.minX, box.min.x);
      acc.maxX = Math.max(acc.maxX, box.max.x);
      acc.minZ = Math.min(acc.minZ, box.min.z);
      acc.maxZ = Math.max(acc.maxZ, box.max.z);
      return acc;
    },
    {
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minZ: Math.min(start.z, end.z),
      maxZ: Math.max(start.z, end.z)
    }
  );

  const minX = Math.max(floorMinX, Math.floor((bounds.minX - 1.2) / cellSize) * cellSize);
  const maxX = Math.min(floorMaxX, Math.ceil((bounds.maxX + 1.2) / cellSize) * cellSize);
  const minZ = Math.max(floorMinZ, Math.floor((bounds.minZ - 1.2) / cellSize) * cellSize);
  const maxZ = Math.min(floorMaxZ, Math.ceil((bounds.maxZ + 1.2) / cellSize) * cellSize);
  const cols = Math.floor((maxX - minX) / cellSize) + 1;
  const rows = Math.floor((maxZ - minZ) / cellSize) + 1;
  if (cols < 2 || rows < 2 || cols * rows > 12000) return null;

  const toCell = (point: THREE.Vector3) => ({
    x: Math.min(cols - 1, Math.max(0, Math.round((point.x - minX) / cellSize))),
    z: Math.min(rows - 1, Math.max(0, Math.round((point.z - minZ) / cellSize)))
  });
  const toWorld = (cell: { x: number; z: number }) =>
    new THREE.Vector3(minX + cell.x * cellSize, 0.055, minZ + cell.z * cellSize);
  const keyOf = (cell: { x: number; z: number }) => `${cell.x},${cell.z}`;
  const isBlocked = (cell: { x: number; z: number }) => {
    const x = minX + cell.x * cellSize;
    const z = minZ + cell.z * cellSize;
    return obstacles.some((box) => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ);
  };
  const findNearestOpenCell = (seed: { x: number; z: number }) => {
    if (!isBlocked(seed)) return seed;
    for (let radius = 1; radius <= 8; radius += 1) {
      let best: { x: number; z: number } | null = null;
      let bestDistance = Infinity;
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const candidate = { x: seed.x + dx, z: seed.z + dz };
          if (candidate.x < 0 || candidate.x >= cols || candidate.z < 0 || candidate.z >= rows) continue;
          if (isBlocked(candidate)) continue;
          const dist = Math.abs(dx) + Math.abs(dz);
          if (dist < bestDistance) {
            best = candidate;
            bestDistance = dist;
          }
        }
      }
      if (best) return best;
    }
    return null;
  };

  const startCell = findNearestOpenCell(toCell(start));
  const endCell = findNearestOpenCell(toCell(end));
  if (!startCell || !endCell) return null;

  const open = new Set<string>([keyOf(startCell)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[keyOf(startCell), 0]]);
  const fScore = new Map<string, number>([
    [keyOf(startCell), Math.abs(startCell.x - endCell.x) + Math.abs(startCell.z - endCell.z)]
  ]);
  const directions = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];

  while (open.size > 0) {
    let currentKey = "";
    let currentF = Infinity;
    for (const key of open) {
      const value = fScore.get(key) ?? Infinity;
      if (value < currentF) {
        currentF = value;
        currentKey = key;
      }
    }

    const [currentX, currentZ] = currentKey.split(",").map(Number);
    if (currentX === endCell.x && currentZ === endCell.z) {
      return simplifyRouteCells(reconstructRouteCells(cameFrom, currentKey), toWorld, start, end);
    }

    open.delete(currentKey);
    const currentG = gScore.get(currentKey) ?? Infinity;
    for (const direction of directions) {
      const neighbor = { x: currentX + direction.x, z: currentZ + direction.z };
      if (neighbor.x < 0 || neighbor.x >= cols || neighbor.z < 0 || neighbor.z >= rows) continue;
      if (isBlocked(neighbor)) continue;

      const neighborKey = keyOf(neighbor);
      const tentativeG = currentG + 1;
      if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeG);
      fScore.set(
        neighborKey,
        tentativeG + Math.abs(neighbor.x - endCell.x) + Math.abs(neighbor.z - endCell.z)
      );
      open.add(neighborKey);
    }
  }

  return null;
}

function reconstructRouteCells(cameFrom: Map<string, string>, endKey: string): string[] {
  const route = [endKey];
  let current = endKey;
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    route.push(current);
  }
  return route.reverse();
}

function simplifyRouteCells(
  routeKeys: string[],
  toWorld: (cell: { x: number; z: number }) => THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3
): THREE.Vector3[] {
  const points = [start.clone()];
  let lastDirection = "";
  for (let i = 1; i < routeKeys.length - 1; i += 1) {
    const [prevX, prevZ] = routeKeys[i - 1].split(",").map(Number);
    const [cellX, cellZ] = routeKeys[i].split(",").map(Number);
    const [nextX, nextZ] = routeKeys[i + 1].split(",").map(Number);
    const direction = `${Math.sign(nextX - cellX)},${Math.sign(nextZ - cellZ)}`;
    const previousDirection = `${Math.sign(cellX - prevX)},${Math.sign(cellZ - prevZ)}`;
    if (i === 1) {
      lastDirection = previousDirection;
    }
    if (direction !== lastDirection) {
      points.push(toWorld({ x: cellX, z: cellZ }));
      lastDirection = direction;
    }
  }
  points.push(end.clone());
  return points.filter((point, index, list) => index === 0 || point.distanceTo(list[index - 1]) > 0.12);
}

function advanceGuidedRoute(scene: THREE.Scene, route: GuidedRoute): void {
  if (route.currentStep >= route.points.length - 1) return;
  route.currentStep += 1;

  if (route.currentStep >= route.points.length - 1) {
    showRouteArrival(scene, route);
    return;
  }

  renderGuidedRouteStep(scene, route);
  moveCameraWithRoute(route, route.currentStep);
}

function retreatGuidedRoute(scene: THREE.Scene, route: GuidedRoute): void {
  if (route.currentStep <= 0) return;
  route.currentStep -= 1;
  renderGuidedRouteStep(scene, route);
  moveCameraWithRoute(route, route.currentStep);
}

function finishGuidedRoute(scene: THREE.Scene, route: GuidedRoute): void {
  route.currentStep = route.points.length - 1;
  showRouteArrival(scene, route);
}

function showRouteArrival(scene: THREE.Scene, route: GuidedRoute): void {
  disposeRouteSegment(scene, route.activeSegment);
  route.activeSegment = createRouteArrivalMarker(route.points[route.points.length - 1]);
  scene.add(route.activeSegment);
  route.controls.setStep(route.points.length - 1, route.points.length - 1);
  moveCameraToRouteEnd(route);
}

function renderGuidedRouteStep(scene: THREE.Scene, route: GuidedRoute): void {
  disposeRouteSegment(scene, route.activeSegment);

  const from = route.points[route.currentStep];
  const to = route.points[route.currentStep + 1];
  route.activeSegment = createRouteSegment(from, to, route.currentStep === route.points.length - 2);
  scene.add(route.activeSegment);
  route.controls.setStep(route.currentStep + 1, route.points.length - 1);
}

function createRouteSegment(from: THREE.Vector3, to: THREE.Vector3, isFinalSegment: boolean): THREE.Group {
  const route = new THREE.Group();
  route.name = "__guided_route_step__";

  const mid = from.clone().lerp(to, 0.5);
  const direction = to.clone().sub(from).setY(0);
  const points = [from.clone(), mid.clone().setY(0.12), to.clone()];
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.05);
  const geometry = new THREE.TubeGeometry(curve, 28, 0.04, 8, false);
  const material = new THREE.MeshStandardMaterial({
    color: 0x18c7ff,
    emissive: 0x0b6f9b,
    emissiveIntensity: 0.75,
    roughness: 0.35
  });
  const tube = new THREE.Mesh(geometry, material);
  tube.name = "__guided_route_part__";
  route.add(tube);

  addRouteStepMarkers(route, from, to, direction, isFinalSegment);
  return route;
}

function moveCameraWithRoute(route: GuidedRoute, stepIndex: number, isArrival = false): void {
  const point = route.points[Math.min(stepIndex, route.points.length - 1)];
  const lookPoint = isArrival
    ? route.productFocus
    : route.points[Math.min(stepIndex + 1, route.points.length - 1)];

  const travelDirection = lookPoint.clone().sub(point).setY(0);
  if (travelDirection.lengthSq() < 0.001) {
    travelDirection.set(1, 0, 0);
  } else {
    travelDirection.normalize();
  }

  const cameraTarget = point.clone().addScaledVector(travelDirection, -0.35);
  cameraTarget.y = 1.55;
  const controlsTarget = lookPoint.clone();
  controlsTarget.y = isArrival
    ? Math.max(1.2, route.productFocus.y)
    : Math.max(1.25, Math.min(1.7, route.productFocus.y + 0.35));

  gsap.killTweensOf(route.camera.position);
  gsap.killTweensOf(route.orbitControls.target);
  route.controls.setBusy(true);
  const startDelay = route.ensureDoorOpen() ? 0.52 : 0;

  gsap.to(route.camera.position, {
    x: cameraTarget.x,
    y: cameraTarget.y,
    z: cameraTarget.z,
    duration: 0.85,
    delay: startDelay,
    ease: "power2.inOut"
  });

  gsap.to(route.orbitControls.target, {
    x: controlsTarget.x,
    y: controlsTarget.y,
    z: controlsTarget.z,
    duration: 0.85,
    delay: startDelay,
    ease: "power2.inOut",
    onUpdate: () => {
      route.camera.lookAt(route.orbitControls.target);
      route.orbitControls.update();
    },
	    onComplete: () => {
	      route.controls.setStep(
	        Math.min(route.currentStep + 1, route.points.length - 1),
	        route.points.length - 1
	      );
	      route.controls.setBusy(false);
	    }
	  });
}

function moveCameraToRouteEnd(route: GuidedRoute): void {
  const endIndex = route.points.length - 1;
  const point = route.points[endIndex];
  const previousPoint = route.points[Math.max(0, endIndex - 1)];
  const travelDirection = point.clone().sub(previousPoint).setY(0);
  if (travelDirection.lengthSq() < 0.001) {
    travelDirection.set(1, 0, 0);
  } else {
    travelDirection.normalize();
  }

  const isMobileRouteMode = document.documentElement.dataset.appMode === "mobile-route";
  const cameraTarget = point.clone().addScaledVector(travelDirection, isMobileRouteMode ? -2.15 : -0.75);
  cameraTarget.y = isMobileRouteMode ? Math.max(1.55, route.productFocus.y + 0.9) : 1.45;
  const controlsTarget = route.productFocus.clone();
  controlsTarget.y = isMobileRouteMode
    ? Math.max(0.95, route.productFocus.y + 0.22)
    : Math.max(1.2, route.productFocus.y);

  gsap.killTweensOf(route.camera.position);
  gsap.killTweensOf(route.orbitControls.target);
  route.controls.setBusy(true);
  const startDelay = route.ensureDoorOpen() ? 0.52 : 0;

  gsap.to(route.camera.position, {
    x: cameraTarget.x,
    y: cameraTarget.y,
    z: cameraTarget.z,
    duration: 0.85,
    delay: startDelay,
    ease: "power2.inOut"
  });

  gsap.to(route.orbitControls.target, {
    x: controlsTarget.x,
    y: controlsTarget.y,
    z: controlsTarget.z,
    duration: 0.85,
    delay: startDelay,
    ease: "power2.inOut",
    onUpdate: () => {
      route.camera.lookAt(route.orbitControls.target);
      route.orbitControls.update();
    },
	    onComplete: () => {
	      route.controls.setStep(endIndex, endIndex);
	      route.controls.setBusy(false);
	      route.onFinished?.();
	      route.onFinished = undefined;
	    }
	  });
}

function clearGuidedRoute(scene: THREE.Scene, route: GuidedRoute | null): null {
  if (!route) return null;

  gsap.killTweensOf(route.camera.position);
  gsap.killTweensOf(route.orbitControls.target);
  disposeRouteSegment(scene, route.activeSegment);
  route.controls.hide();
  return null;
}

function disposeRouteSegment(scene: THREE.Scene, segment: THREE.Group | null): void {
  if (!segment) return;

  scene.remove(segment);
  segment.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material.dispose();
    }
  });
}

function addRouteStepMarkers(
  route: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  direction: THREE.Vector3,
  isFinalSegment: boolean
): void {
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd45c,
    emissive: 0x8c5f00,
    emissiveIntensity: 0.55,
    roughness: 0.45
  });

  const startMarker = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), markerMaterial.clone());
  startMarker.position.copy(from).setY(0.095);
  route.add(startMarker);

  const endMarker = new THREE.Mesh(
    isFinalSegment
      ? new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24)
      : new THREE.SphereGeometry(0.1, 16, 10),
    markerMaterial.clone()
  );
  endMarker.position.copy(to).setY(0.095);
  route.add(endMarker);

  if (direction.lengthSq() >= 0.09) {
    direction.normalize();
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.28, 20),
      markerMaterial.clone()
    );
    arrow.position.copy(from).lerp(to, 0.55).setY(0.16);
    arrow.rotation.z = -Math.PI / 2;
    arrow.rotation.y = Math.atan2(direction.z, direction.x);
    route.add(arrow);
  }
}

function createRouteArrivalMarker(point: THREE.Vector3): THREE.Group {
  const route = new THREE.Group();
  route.name = "__guided_route_arrival__";
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28),
    new THREE.MeshStandardMaterial({
      color: 0x35d07f,
      emissive: 0x166b3d,
      emissiveIntensity: 0.7,
      roughness: 0.42
    })
  );
  marker.position.copy(point).setY(0.11);
  route.add(marker);
  return route;
}

function getShelfAisleNormal(shelfMesh: THREE.Mesh, entrancePosition: THREE.Vector3): THREE.Vector3 {
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shelfMesh.quaternion).setY(0).normalize();
  const backward = forward.clone().multiplyScalar(-1);
  const toEntrance = entrancePosition.clone().sub(shelfMesh.position).setY(0);

  if (toEntrance.lengthSq() < 1e-4) {
    return forward;
  }

  return forward.dot(toEntrance) >= backward.dot(toEntrance) ? forward : backward;
}

function createWallCollisionBlocker(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  wallMeshes: THREE.Mesh[],
  isDisabled: () => boolean = () => false
): () => void {
  const cameraRadius = 0.18;
  const minCameraY = cameraRadius;
  const wallBoxes = wallMeshes.map((mesh) =>
    new THREE.Box3().setFromObject(mesh).expandByScalar(cameraRadius)
  );
  const previousCameraPosition = camera.position.clone();
  const previousTarget = controls.target.clone();

  return () => {
    if (isDisabled()) return;

    const isBelowFloor = camera.position.y < minCameraY;
    const isBlocked = isBelowFloor || wallBoxes.some((box) => box.containsPoint(camera.position));
    if (isBlocked) {
      camera.position.copy(previousCameraPosition);
      controls.target.copy(previousTarget);
      camera.lookAt(controls.target);
      controls.update();
      return;
    }

    previousCameraPosition.copy(camera.position);
    previousTarget.copy(controls.target);
  };
}

function getShelfOverlapScore(
  draggedMesh: THREE.Mesh,
  shelfMeshes: Map<string, THREE.Mesh>,
  draggedShelfId: string
): number {
  const draggedBox = getShelfCollisionBox(draggedMesh);
  let overlapScore = 0;

  for (const [id, mesh] of shelfMeshes) {
    if (id === draggedShelfId) continue;
    const otherBox = getShelfCollisionBox(mesh);
    const overlapX = Math.min(draggedBox.max.x, otherBox.max.x) - Math.max(draggedBox.min.x, otherBox.min.x);
    const overlapZ = Math.min(draggedBox.max.z, otherBox.max.z) - Math.max(draggedBox.min.z, otherBox.min.z);
    if (overlapX > 0 && overlapZ > 0) {
      overlapScore += overlapX * overlapZ;
    }
  }

  return overlapScore;
}

function getShelfCollisionBox(mesh: THREE.Mesh): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(mesh);
  box.min.x += 0.01;
  box.min.z += 0.01;
  box.max.x -= 0.01;
  box.max.z -= 0.01;
  return box;
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
  runtime: WarehouseRuntime,
  onEditModeChange: (enabled: boolean) => void = () => {}
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
  const cameraHomePosition = camera.position.clone();
  const cameraHomeTarget = controls.target.clone();
  const cameraHomeFov = camera.fov;
  const defaultControlState = {
    enablePan: controls.enablePan,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    minPolarAngle: controls.minPolarAngle,
    maxPolarAngle: controls.maxPolarAngle
  };

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

  const applyFreeCameraMode = () => {
    controls.enablePan = true;
    controls.minDistance = 0.05;
    controls.maxDistance = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.enabled = true;
    onEditModeChange(true);
  };

  const restoreCameraHome = () => {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);

    camera.fov = cameraHomeFov;
    camera.updateProjectionMatrix();
    controls.enablePan = defaultControlState.enablePan;
    controls.minDistance = defaultControlState.minDistance;
    controls.maxDistance = defaultControlState.maxDistance;
    controls.minPolarAngle = defaultControlState.minPolarAngle;
    controls.maxPolarAngle = defaultControlState.maxPolarAngle;
    controls.enabled = true;
    onEditModeChange(false);

    gsap.to(camera.position, {
      x: cameraHomePosition.x,
      y: cameraHomePosition.y,
      z: cameraHomePosition.z,
      duration: 0.45,
      ease: "power2.inOut"
    });

    gsap.to(controls.target, {
      x: cameraHomeTarget.x,
      y: cameraHomeTarget.y,
      z: cameraHomeTarget.z,
      duration: 0.45,
      ease: "power2.inOut",
      onUpdate: () => {
        camera.lookAt(controls.target);
        controls.update();
      }
    });
  };

  const setEditMode = (enabled: boolean) => {
    if (editModeEnabled === enabled) return;
    editModeEnabled = enabled;

    if (editModeEnabled) {
      applyFreeCameraMode();
    } else {
      dragging = false;
      activeShelfId = null;
      activeProductSku = null;
      pendingProductSku = null;
      draggedProductLocalPosition = null;
      activeBoardMesh = null;
      activeBoardShelfId = null;
      canvas.style.cursor = "";
      applySelection(null);
      restoreCameraHome();
    }

    syncEditButton();
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
    setEditMode(true);
  };

  editShelvesBtn.addEventListener("click", () => {
    setEditMode(!editModeEnabled);
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

    const hits = raycaster.intersectObjects([...shelfMeshes.values()], false);

    if (hits.length === 0) {
      // Detectar clic sobre un piso arrastrable solo si no se apuntó al volumen del estante completo.
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

      // Clic en espacio vacío → deseleccionar, OrbitControls mantiene control
      applySelection(null);
      return;
    }

    const clickedId = String((hits[0].object as THREE.Mesh).userData.shelfId);
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
    applySelection(clickedId);
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
      const previousOverlap = getShelfOverlapScore(draggedMesh, shelfMeshes, activeShelfId);
      draggedMesh.position.x += dx;
      draggedMesh.position.z += dz;

      const currentOverlap = getShelfOverlapScore(draggedMesh, shelfMeshes, activeShelfId);
      const collisionIsWorse = currentOverlap > 0.0001 && currentOverlap >= previousOverlap - 0.0001;

      if (collisionIsWorse) {
        // Revertir si crea una superposición nueva o no ayuda a separar estantes ya encimados.
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

function getRouteSectionLabel(shelf: Shelf | undefined, localPositionY: number): string {
  const section = getRouteSectionNumber(shelf, localPositionY);
  const label = shelf?.sectionLabels?.[section - 1]?.trim();
  return label || `Piso ${section}`;
}

function getRouteSectionNumber(shelf: Shelf | undefined, localPositionY: number): number {
  if (!shelf) return 1;

  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  const safePositionY = clamp(localPositionY, 0, shelf.height);

  for (let index = 0; index < bounds.length - 1; index += 1) {
    const lowerBound = bounds[index];
    const upperBound = bounds[index + 1];
    if (safePositionY >= lowerBound && (safePositionY < upperBound || index === bounds.length - 2)) {
      return index + 1;
    }
  }

  return 1;
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
