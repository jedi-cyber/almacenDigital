export const UI_COPY = {
  page: {
    title: "Almacen digital",
    description:
      "Localiza, registra y organiza productos desde una vista 3D del almacen.",
    legacyDescription:
      "Agrega productos con canPlace() y luego ubicalos por nombre con una busqueda que enfoca la camara y resalta el producto correcto."
  },
  help: {
    movementTitle: "Como moverse",
    movementItems: [
      "Click izquierdo + arrastrar: rotar vista",
      "Rueda del mouse: acercar o alejar",
      "La vista inicia en la puerta",
      "Usa el buscador para trazar la ruta al producto"
    ],
    shelvesTitle: "Estantes",
    shelfItems: [
      'Activa "Editar estantes" para moverlos',
      "Click sobre estante: seleccionar (brillo amarillo)",
      "Arrastrar estante seleccionado: moverlo",
      "Tecla R: rotar 90 grados"
    ]
  },
  buttons: {
    showPanel: "Mostrar panel",
    hidePanel: "Ocultar panel",
    showLegend: "Ver leyenda",
    hideLegend: "Ocultar leyenda",
    manageShelf: "Gestionar estante",
    edit: "Editar",
    exitEdit: "Desactivar entorno de edicion",
    moveProduct: "Mover producto",
    moveShelf: "Activar entorno de edicion",
    moveShelves: "Mover pisos",
    deleteShelf: "Eliminar estante",
    deleteBoard: "Eliminar piso",
    transferProduct: "Trasladar producto",
    deleteProduct: "Eliminar producto",
    confirmDelete: "Confirmar eliminacion",
    confirmTransfer: "Confirmar traslado",
    cancelTransfer: "Cancelar",
    registerProduct: "Registrar producto",
    legacyRegisterProduct: "Agregar",
    updateSections: "Aplicar total de pisos",
    addBoard: "Agregar piso manualmente",
    removeBoard: "Quitar piso",
    search: "Buscar producto",
    scanBarcode: "Escanear codigo de barras",
    stopBarcodeScan: "Detener escaneo",
    clearSearch: "Limpiar",
  },
  toggles: {
    open: "Abrir",
    close: "Cerrar",
    closeMenu: "Cerrar menu"
  },
  search: {
    title: "Buscar producto",
    description: "Encuentra por nombre o SKU y enfoca automaticamente la ruta en la escena.",
    label: "Nombre o SKU del producto",
    buttonAriaLabel: "Buscar producto",
    transferTitle: "Trasladar a otro estante",
    transferShelfLabel: "Estante destino",
    transferSectionLabel: "Piso destino"
  },
  productForm: {
    title: "Registrar producto",
    description: "Elige ubicacion, identifica el producto y valida sus medidas antes de guardarlo.",
    steps: {
      selectShelf: "Ubicacion",
      productCode: "2. Ingresa el SKU y nombre",
      productName: "Nombre del producto",
      measures: "3. Define medidas"
    },
    skuLabel: "SKU",
    sectionLabel: "Piso o nivel del estante",
    shelfManager: {
      title: "Gestionar estante",
      description: "",
      nameLabel: "Nombre del estante",
      updateNameBtn: "Guardar nombre",
      floorNameLabel: "Nombre del piso",
      updateFloorNameBtn: "Guardar piso"
    },
    shelfConfig: {
      title: "Pisos",
      description: "",
      totalSectionsLabel: "Total de pisos",
      updateHelp: "",
      addBoardHelp: ""
    },
    shelfSizeConfig: {
      title: "Tamaño del estante",
      updateHelp: "",
      updateBtn: "Aplicar tamaño"
    },
    routeConfig: {
      title: "Ruta y pasillos",
      description: "Define desde donde inicia la ruta y los pasillos transitables del almacen.",
      entranceLabel: "Entrada del almacen",
      entranceX: "Entrada X",
      entranceZ: "Entrada Z",
      aislesLabel: "Pasillos JSON",
      saveBtn: "Guardar ruta del almacen",
      useCameraBtn: "Usar camara como entrada"
    },
    shelfSummary: {
      title: "Capacidad del estante",
      legacyTitle: "Referencia del estante"
    },
    selectedShelfLabel: "Estante de registro",
    skuTip: "El SKU identifica una unidad unica. El nombre sirve como alias de busqueda y puede repetirse.",
    dimensions: {
      hint: "Todos los valores se registran en metros.",
      groupAriaLabel: "Tamanos sugeridos",
      presets: {
        small: "Pequeno",
        medium: "Mediano",
        large: "Grande"
      },
      defaultHint: "Selecciona un tamano sugerido o ajusta manualmente las medidas.",
      labels: {
        width: "Ancho (m)",
        height: "Alto (m)",
        depth: "Profundidad (m)"
      },
      legacyLabels: {
        width: "Ancho",
        height: "Alto",
        depth: "Prof."
      }
    }
  },
  productEditor: {
    title: "Editar producto",
    save: "Guardar cambios",
    nameLabel: "Nombre del producto",
  },
  editPanel: {
    title: "Herramientas de edicion",
    description: "Usa estas acciones despues de seleccionar un estante o producto.",
    moveSection: "Movimiento",
    deleteSection: "Eliminacion",
    movePisosHint: "Activa el entorno de edicion y luego arrastra los pisos directamente en la escena 3D.",
  },
  status: {
    loadingConfig: "Cargando configuracion del almacen...",
    loadingProducts: "Restaurando productos guardados...",
    loadingScene: "Preparando vista 3D del almacen...",
    productsEmpty: "Catalogo cargado correctamente. Aun no hay productos registrados en los estantes.",
    productsLoadFailed: "No se pudo conectar con la API de productos. La lista no esta vacia necesariamente; la carga fallo.",
    productsLoadRetry: "Reintentar carga",
    initial: "",
    legacyInitial: "Agrega un producto y luego buscalo por nombre o SKU para probar la fase 5.",
    shelfNotFound: "No se encontro el estante seleccionado.",
    emptySearchSku: "Ingresa un nombre o SKU para ejecutar la busqueda.",
    invalidProductForm: "Completa el nombre y las medidas con valores mayores a cero.",
    productTooLargeForShelf: "Las medidas no pueden superar los limites del estante y del piso actual.",
    invalidShelfName: "Ingresa un nombre valido para el estante.",
    invalidSectionName: "Ingresa un nombre valido para el piso.",
    legacyInvalidProductForm: "Ingresa un nombre y dimensiones validas mayores a cero.",
    editModeEnabled: "Modo edicion activado. Ahora puedes mover estantes y productos.",
    editModeDisabled: "Modo edicion desactivado. Los estantes y productos quedaron bloqueados.",
    barcodeUnsupported: "Este navegador no permite leer codigos de barras desde la camara.",
    barcodeCameraError: "No se pudo acceder a la camara para escanear el codigo de barras.",
    barcodeScanning: "Apunta la camara al codigo de barras del producto.",
    barcodeNotFound: "Codigo capturado, pero no existe un producto con ese SKU."
  }
} as const;

export function getProductName(sku: string): string {
  return `Producto ${sku}`;
}

export function getSearchNotFoundMessage(query: string, suggestions: string[] = []): string {
  const base = `No se encontro un producto con nombre, SKU, categoria o marca "${query}".`;
  if (suggestions.length === 0) return base;
  return `${base} Sugerencias cercanas: ${suggestions.join(", ")}.`;
}

export function getSearchShelfMissingMessage(sku: string): string {
  return `No se encontro el estante asociado al producto ${sku}.`;
}

export function getSearchSuccessMessage(sku: string, shelfId: string, matchCount = 1): string {
  const matchText = matchCount > 1 ? ` Se encontraron ${matchCount} coincidencias ordenadas por relevancia; se muestra la mejor.` : "";
  return `Producto ${sku} encontrado en ${shelfId}. Sigue la ruta marcada desde la puerta hasta el estante.${matchText}`;
}

export function getMoveReadyMessage(sku: string): string {
  return `Producto ${sku} listo para mover. Haz clic y arrastra dentro del estante.`;
}

export function getDeleteSuccessMessage(sku: string, shelfId: string): string {
  return `Producto ${sku} eliminado del estante ${shelfId}.`;
}

export function getDuplicateSkuMessage(sku: string): string {
  return `Ya existe un producto con SKU "${sku}". Usa un identificador diferente.`;
}

export function getInvalidSkuMessage(): string {
  return "Ingresa un SKU valido antes de guardar el producto.";
}

export function getInvalidProductDimensionsMessage(): string {
  return "Las medidas del producto deben ser numeros mayores a cero.";
}

export function getProductTooLargeForSectionMessage(
  shelfId: string,
  section: number,
  maxWidth: number,
  maxHeight: number,
  maxDepth: number
): string {
  return `El producto no cabe en ${shelfId} piso ${section}. Maximo permitido: ${maxWidth} x ${maxHeight} x ${maxDepth} m.`;
}

export function getNoSpaceMessage(sku: string, shelfId: string, section?: number): string {
  const sectionText = typeof section === "number" ? ` piso ${section}` : "";
  return `Las medidas caben, pero no hay espacio libre para ${sku} en ${shelfId}${sectionText}. Selecciona otro piso, otro estante o reduce el tamano.`;
}

export function getPlacementSuccessMessage(
  sku: string,
  shelfId: string,
  localPosition: { x: number; y: number; z: number },
  section?: number
): string {
  const sectionText = typeof section === "number" ? ` piso ${section}` : "";
  return `${sku} agregado en ${shelfId}${sectionText} en local (${localPosition.x}, ${localPosition.y}, ${localPosition.z}).`;
}

export function getShelfSectionUpdatedMessage(shelfId: string, sections: number): string {
  return `${shelfId} ahora tiene ${sections} piso${sections === 1 ? "" : "s"}.`;
}

export function getShelfNameUpdatedMessage(shelfId: string, label: string): string {
  return `${shelfId} ahora se llama "${label}".`;
}

export function getSectionNameUpdatedMessage(shelfId: string, section: number, label: string): string {
  return `${shelfId} piso ${section} ahora se llama "${label}".`;
}

export function getTransferNoSpaceMessage(sku: string, shelfId: string, section: number): string {
  return `No hay espacio para trasladar ${sku} a ${shelfId} piso ${section}.`;
}

export function getTransferSuccessMessage(
  sku: string,
  fromShelfId: string,
  toShelfId: string,
  section: number
): string {
  return `Producto ${sku} trasladado de ${fromShelfId} a ${toShelfId} piso ${section}.`;
}

export function getProductMovedInsideShelfMessage(sku: string, shelfId: string): string {
  return `Producto ${sku} reubicado dentro de ${shelfId}.`;
}
