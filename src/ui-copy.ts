export const UI_COPY = {
  page: {
    title: "Busqueda y Enfoque de Productos",
    description:
      "Usa el panel para buscar productos por nombre, registrar nuevos productos y revisar el estado de cada estante.",
    legacyDescription:
      "Agrega productos con canPlace() y luego ubicalos por nombre con una busqueda que enfoca la camara y resalta el producto correcto."
  },
  help: {
    movementTitle: "Como moverse",
    movementItems: [
      "Click izquierdo + arrastrar: rotar vista",
      "Rueda del mouse: acercar o alejar",
      "Click derecho + arrastrar: desplazarse lateralmente",
      "Teclas W, A, S, D: desplazarte por el almacen"
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
    exitEdit: "Salir del entorno de edicion",
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
    clearSearch: "Limpiar",
  },
  toggles: {
    open: "Abrir",
    close: "Cerrar",
    closeMenu: "Cerrar menu"
  },
  search: {
    title: "Buscar producto",
    description: "Escribe el nombre para encontrarlo rapido, enfocarlo en la escena o eliminarlo.",
    label: "Nombre del producto",
    buttonAriaLabel: "Buscar producto",
    transferTitle: "Trasladar a otro estante",
    transferShelfLabel: "Estante destino",
    transferSectionLabel: "Piso destino"
  },
  productForm: {
    title: "Registrar producto",
    description: "Registra el producto despues de elegir el estante y revisar el espacio disponible.",
    steps: {
      selectShelf: "1. Elige ubicacion",
      productCode: "2. Ingresa el nombre",
      measures: "3. Define medidas"
    },
    sectionLabel: "Piso o nivel del estante",
    shelfManager: {
      title: "Gestionar estante",
      description: "Primero elige el estante y ajusta sus pisos. Luego registra el producto debajo."
    },
    shelfConfig: {
      title: "Configurar pisos del estante",
      description: "Define cuántos pisos quieres en total o agrega uno nuevo entre los niveles existentes.",
      totalSectionsLabel: "Total de pisos",
      updateHelp: "Usa este valor para repartir el estante en pisos iguales.",
      addBoardHelp: "Agrega un piso extra sin reemplazar los niveles actuales."
    },
    shelfSummary: {
      title: "Resumen del estante seleccionado",
      legacyTitle: "Referencia del estante"
    },
    selectedShelfLabel: "Estante de registro",
    skuTip: "Usa un nombre claro para identificar el producto y buscarlo despues sin confundirte.",
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
    title: "Editar",
    description: "Selecciona un estante o producto antes de usar estas opciones.",
    moveSection: "Activacion de edicion",
    deleteSection: "Eliminar",
    movePisosHint: "Activa el entorno de edicion y luego arrastra los pisos directamente en la escena 3D.",
  },
  status: {
    initial:
      "Selecciona un estante, registra un producto y luego buscalo por nombre para ubicarlo en la escena.",
    legacyInitial: "Agrega un producto y luego buscalo por nombre para probar la fase 5.",
    shelfNotFound: "No se encontro el estante seleccionado.",
    emptySearchSku: "Ingresa un nombre para ejecutar la busqueda.",
    invalidProductForm: "Completa el nombre y las medidas con valores mayores a cero.",
    productTooLargeForShelf: "Las medidas no pueden superar los limites del estante y del piso actual.",
    legacyInvalidProductForm: "Ingresa un nombre y dimensiones validas mayores a cero.",
    editModeEnabled: "Modo edicion activado. Ahora puedes mover estantes y productos.",
    editModeDisabled: "Modo edicion desactivado. Los estantes y productos quedaron bloqueados."
  }
} as const;

export function getProductName(sku: string): string {
  return `Producto ${sku}`;
}

export function getSearchNotFoundMessage(sku: string): string {
  return `No existe un producto registrado con nombre ${sku}.`;
}

export function getSearchShelfMissingMessage(sku: string): string {
  return `No se encontro el estante asociado al nombre ${sku}.`;
}

export function getSearchSuccessMessage(sku: string, shelfId: string): string {
  return `Nombre ${sku} encontrado en ${shelfId}. Camara enfocada y producto resaltado.`;
}

export function getMoveReadyMessage(sku: string): string {
  return `Producto ${sku} listo para mover. Haz clic y arrastra dentro del estante.`;
}

export function getDeleteSuccessMessage(sku: string, shelfId: string): string {
  return `Producto ${sku} eliminado del estante ${shelfId}.`;
}

export function getDuplicateSkuMessage(sku: string): string {
  return `Ya existe un producto con nombre "${sku}". Usa un identificador diferente.`;
}

export function getNoSpaceMessage(sku: string, shelfId: string, section?: number): string {
  const sectionText = typeof section === "number" ? ` piso ${section}` : "";
  return `No hay espacio para ${sku} en ${shelfId}${sectionText}. El algoritmo no encontro una posicion valida.`;
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
