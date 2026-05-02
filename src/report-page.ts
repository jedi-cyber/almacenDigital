import type { Shelf } from "./types.js";

export interface ProductEntry {
  item: {
    name: string;
    width: number;
    height: number;
    depth: number;
  };
  shelfId: string;
  localPosition: { x: number; y: number; z: number };
}

export interface ReportData {
  shelves: Shelf[];
  productsBySku: Map<string, ProductEntry>;
  generatedAt?: Date;
}

function getShelfProducts(
  shelfId: string,
  productsBySku: Map<string, ProductEntry>
): Array<{ sku: string; entry: ProductEntry }> {
  return [...productsBySku.entries()]
    .filter(([, entry]) => entry.shelfId === shelfId)
    .map(([sku, entry]) => ({ sku, entry }));
}

function calcShelfVolume(shelf: Shelf): number {
  return shelf.width * shelf.height * shelf.depth;
}

function calcProductVolume(entry: ProductEntry): number {
  return entry.item.width * entry.item.height * entry.item.depth;
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function occupancyColor(pct: number): string {
  if (pct >= 85) return "#ff6b6b";
  if (pct >= 60) return "#ffd166";
  return "#06d6a0";
}

function buildReportHTML(data: ReportData): string {
  const { shelves, productsBySku, generatedAt = new Date() } = data;

  const totalProducts = productsBySku.size;
  const totalShelves = shelves.length;

  const shelfRows = shelves.map((shelf) => {
    const products = getShelfProducts(shelf.id, productsBySku);
    const shelfVol = calcShelfVolume(shelf);
    const usedVol = products.reduce((sum, { entry }) => sum + calcProductVolume(entry), 0);
    const pct = shelfVol > 0 ? Math.min(100, (usedVol / shelfVol) * 100) : 0;
    const color = occupancyColor(pct);
    const sections = Math.max(1, Math.floor(shelf.sections ?? 1));

    const productRows = products.map(({ sku, entry }) => {
      const vol = calcProductVolume(entry);
      return `
        <tr class="product-row">
          <td class="td-sku"><span class="sku-badge">${sku}</span></td>
          <td>${entry.item.name || "—"}</td>
          <td class="td-num">${fmt(entry.item.width)} × ${fmt(entry.item.height)} × ${fmt(entry.item.depth)}</td>
          <td class="td-num">${fmt(vol)} m³</td>
          <td class="td-pos">(${fmt(entry.localPosition.x)}, ${fmt(entry.localPosition.y)}, ${fmt(entry.localPosition.z)})</td>
        </tr>`;
    }).join("");

    const emptyRow = products.length === 0
      ? `<tr class="empty-row"><td colspan="5">Sin productos registrados en este estante.</td></tr>`
      : "";

    return `
      <section class="shelf-block" id="shelf-${shelf.id}">
        <div class="shelf-header">
          <div class="shelf-id-badge">${shelf.id}</div>
          <div class="shelf-meta">
            <h2 class="shelf-name">${shelf.label}</h2>
            <div class="shelf-specs">
              <span>${fmt(shelf.width)} × ${fmt(shelf.height)} × ${fmt(shelf.depth)} m</span>
              <span class="dot">·</span>
              <span>${sections} piso${sections !== 1 ? "s" : ""}</span>
              <span class="dot">·</span>
              <span>${products.length} producto${products.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div class="shelf-gauge">
            <div class="gauge-ring" style="--pct:${pct.toFixed(1)};--color:${color}">
              <svg viewBox="0 0 36 36" class="gauge-svg">
                <circle class="gauge-bg" cx="18" cy="18" r="15.9"/>
                <circle class="gauge-fill" cx="18" cy="18" r="15.9"
                  stroke="${color}"
                  stroke-dasharray="${(pct * 100 / 100).toFixed(1)} 100"
                  transform="rotate(-90 18 18)"/>
              </svg>
              <span class="gauge-label">${pct.toFixed(0)}%</span>
            </div>
            <span class="gauge-caption">Ocupación</span>
          </div>
        </div>

        <div class="vol-bar-wrap">
          <div class="vol-bar-track">
            <div class="vol-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="vol-text">${fmt(usedVol)} / ${fmt(shelfVol)} m³</span>
        </div>

        <div class="table-wrap">
          <table class="product-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Dimensiones (m)</th>
                <th>Volumen</th>
                <th>Posición local</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
              ${emptyRow}
            </tbody>
          </table>
        </div>
      </section>`;
  }).join("");

  const totalVol = shelves.reduce((s, sh) => s + calcShelfVolume(sh), 0);
  const usedVol = [...productsBySku.values()].reduce((s, e) => s + calcProductVolume(e), 0);
  const globalPct = totalVol > 0 ? Math.min(100, (usedVol / totalVol) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporte de Almacén — ${generatedAt.toLocaleDateString("es-PE")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #080c10;
      --surface: #0e1318;
      --surface2: #141b22;
      --border: rgba(255,255,255,0.07);
      --border2: rgba(255,255,255,0.12);
      --text: #e8edf2;
      --text2: #7a8898;
      --text3: #4a5668;
      --accent: #38bdf8;
      --accent2: #818cf8;
      --gold: #f59e0b;
      --radius: 12px;
      --radius-sm: 7px;
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      font-weight: 300;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── NOISE OVERLAY ── */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
      opacity: 0.4;
    }

    /* ── GLOW BLOBS ── */
    .blob {
      position: fixed;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      z-index: 0;
      opacity: 0.12;
    }
    .blob-1 { width: 600px; height: 600px; background: #38bdf8; top: -200px; left: -200px; }
    .blob-2 { width: 500px; height: 500px; background: #818cf8; bottom: -150px; right: -150px; }
    .blob-3 { width: 300px; height: 300px; background: #f59e0b; top: 40%; left: 50%; }

    /* ── LAYOUT ── */
    .page {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }

    /* ── HEADER ── */
    .page-header {
      margin-bottom: 56px;
      animation: fadeUp 0.6s ease both;
    }

    .header-eyebrow {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 400;
      color: var(--accent);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .header-title {
      font-family: 'Syne', sans-serif;
      font-size: clamp(36px, 6vw, 64px);
      font-weight: 800;
      line-height: 1.05;
      color: var(--text);
      margin-bottom: 16px;
    }

    .header-title span {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-meta {
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      color: var(--text3);
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }

    .header-meta span { color: var(--text2); }

    /* ── GLOBAL KPIs ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 56px;
      animation: fadeUp 0.6s 0.1s ease both;
    }

    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s;
    }

    .kpi-card:hover {
      border-color: var(--border2);
      transform: translateY(-2px);
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0.4;
    }

    .kpi-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text3);
      margin-bottom: 10px;
    }

    .kpi-value {
      font-family: 'Syne', sans-serif;
      font-size: 38px;
      font-weight: 700;
      color: var(--text);
      line-height: 1;
      margin-bottom: 4px;
    }

    .kpi-sub {
      font-size: 12px;
      color: var(--text3);
    }

    .kpi-accent { color: var(--accent); }
    .kpi-gold { color: var(--gold); }
    .kpi-violet { color: var(--accent2); }

    /* ── NAV PILLS ── */
    .shelf-nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 40px;
      animation: fadeUp 0.6s 0.15s ease both;
    }

    .shelf-pill {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 100px;
      border: 1px solid var(--border2);
      background: var(--surface);
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: var(--text2);
      text-decoration: none;
      transition: all 0.2s;
    }

    .shelf-pill:hover {
      background: var(--surface2);
      color: var(--accent);
      border-color: var(--accent);
    }

    /* ── SHELF BLOCKS ── */
    .shelf-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 24px;
      overflow: hidden;
      animation: fadeUp 0.5s ease both;
      transition: border-color 0.2s;
    }

    .shelf-block:hover { border-color: var(--border2); }

    .shelf-header {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 24px 28px;
      border-bottom: 1px solid var(--border);
      background: var(--surface2);
    }

    .shelf-id-badge {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      color: var(--accent);
      background: rgba(56,189,248,0.08);
      border: 1px solid rgba(56,189,248,0.2);
      border-radius: 6px;
      padding: 4px 10px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .shelf-meta { flex: 1; min-width: 0; }

    .shelf-name {
      font-family: 'Syne', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .shelf-specs {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: var(--text3);
      margin-top: 4px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }

    .dot { opacity: 0.3; }

    /* ── GAUGE ── */
    .shelf-gauge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .gauge-ring {
      position: relative;
      width: 56px;
      height: 56px;
    }

    .gauge-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .gauge-bg {
      fill: none;
      stroke: rgba(255,255,255,0.05);
      stroke-width: 3;
    }

    .gauge-fill {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dashoffset: 0;
      transition: stroke-dasharray 0.6s ease;
    }

    .gauge-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      color: var(--text);
    }

    .gauge-caption {
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text3);
    }

    /* ── VOL BAR ── */
    .vol-bar-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 28px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }

    .vol-bar-track {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.05);
      border-radius: 4px;
      overflow: hidden;
    }

    .vol-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.7s ease;
    }

    .vol-text {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: var(--text3);
      white-space: nowrap;
    }

    /* ── TABLE ── */
    .table-wrap {
      overflow-x: auto;
      padding: 20px 28px 24px;
    }

    .product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .product-table th {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text3);
      padding: 0 12px 12px 0;
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    .product-table td {
      padding: 11px 12px 11px 0;
      color: var(--text2);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      vertical-align: middle;
    }

    .product-row:last-child td { border-bottom: none; }

    .product-row:hover td { background: rgba(255,255,255,0.02); }

    .sku-badge {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      background: rgba(129,140,248,0.1);
      border: 1px solid rgba(129,140,248,0.2);
      color: var(--accent2);
      border-radius: 4px;
      padding: 2px 8px;
      white-space: nowrap;
    }

    .td-num {
      font-family: 'DM Mono', monospace;
      font-size: 12px;
    }

    .td-pos {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: var(--text3);
    }

    .td-sku { width: 1%; white-space: nowrap; }

    .empty-row td {
      color: var(--text3);
      font-style: italic;
      text-align: center;
      padding: 20px 0;
    }

    /* ── FOOTER ── */
    .page-footer {
      margin-top: 64px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: gap;
      gap: 12px;
    }

    .footer-label {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: var(--text3);
    }

    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #080c10;
      border: none;
      border-radius: 100px;
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
    }

    .print-btn:hover { opacity: 0.88; transform: translateY(-1px); }

    /* ── ANIMATIONS ── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .shelf-block:nth-child(1) { animation-delay: 0.18s; }
    .shelf-block:nth-child(2) { animation-delay: 0.24s; }
    .shelf-block:nth-child(3) { animation-delay: 0.30s; }
    .shelf-block:nth-child(4) { animation-delay: 0.36s; }
    .shelf-block:nth-child(5) { animation-delay: 0.42s; }

    @media print {
      body { background: #fff; color: #111; }
      .blob, body::before { display: none; }
      .print-btn { display: none; }
      .shelf-block { break-inside: avoid; border: 1px solid #ddd; }
    }

    @media (max-width: 600px) {
      .shelf-header { flex-wrap: wrap; }
      .shelf-gauge { display: none; }
    }
  </style>
</head>
<body>
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>

  <div class="page">
    <header class="page-header">
      <p class="header-eyebrow">Almacén Digital 3D · Reporte de inventario</p>
      <h1 class="header-title">Estado del <span>almacén</span></h1>
      <div class="header-meta">
        <span>Generado: ${generatedAt.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })}</span>
        <span>${totalShelves} estante${totalShelves !== 1 ? "s" : ""}</span>
        <span>${totalProducts} producto${totalProducts !== 1 ? "s" : ""} registrado${totalProducts !== 1 ? "s" : ""}</span>
      </div>
    </header>

    <div class="kpi-grid">
      <div class="kpi-card">
        <p class="kpi-label">Total estantes</p>
        <p class="kpi-value kpi-accent">${totalShelves}</p>
        <p class="kpi-sub">activos en escena</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Productos</p>
        <p class="kpi-value kpi-violet">${totalProducts}</p>
        <p class="kpi-sub">registrados en BD</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Volumen total</p>
        <p class="kpi-value">${fmt(totalVol)}</p>
        <p class="kpi-sub">m³ capacidad bruta</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Volumen usado</p>
        <p class="kpi-value kpi-gold">${fmt(usedVol)}</p>
        <p class="kpi-sub">${globalPct.toFixed(1)}% de ocupación global</p>
      </div>
    </div>

    <nav class="shelf-nav" aria-label="Ir a estante">
      ${shelves.map((s) => `<a class="shelf-pill" href="#shelf-${s.id}">${s.id} — ${s.label}</a>`).join("")}
    </nav>

    ${shelfRows}

    <footer class="page-footer">
      <span class="footer-label">Almacén Digital 3D · ${generatedAt.getFullYear()}</span>
      <button class="print-btn" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Imprimir / PDF
      </button>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Abre una nueva pestaña del navegador con el reporte completo del almacén.
 * Llama a esta función desde el botón "Ver reporte completo" en el HUD.
 */
export function openReportWindow(data: ReportData): void {
  const html = buildReportHTML(data);
  const win = window.open("", "_blank");
  if (!win) {
    alert("El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para este sitio.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}