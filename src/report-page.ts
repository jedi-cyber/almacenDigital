import type { Shelf } from "./types.js";
import type { ProductEntry } from "./warehouse.js";

export interface ReportData {
  shelves: Shelf[];
  productsBySku: Map<string, ProductEntry>;
  generatedAt: Date;
}

export function openReportWindow(data: ReportData): void {
  const html = buildReportHtml(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function buildReportHtml(data: ReportData): string {
  const { shelves, productsBySku, generatedAt } = data;
  const allProducts = [...productsBySku.values()];
  const totalProducts = allProducts.length;
  const totalVolume = shelves.reduce((sum, s) => sum + s.width * s.height * s.depth, 0);
  const usedVolume = allProducts.reduce((sum, e) => sum + e.item.width * e.item.height * e.item.depth, 0);
  const globalOccupancy = totalVolume > 0 ? (usedVolume / totalVolume) * 100 : 0;
  const dateStr = generatedAt.toLocaleString("es-PE", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const shelfTabs = shelves.map((s) =>
    `<button class="tab-btn" onclick="document.getElementById('shelf-${s.id}').scrollIntoView({behavior:'smooth'})">${s.id} — ${s.label ?? s.id}</button>`
  ).join("");

  const shelfCards = shelves.map((shelf) => {
    const products = allProducts.filter((e) => e.shelfId === shelf.id);
    const shelfVolume = shelf.width * shelf.height * shelf.depth;
    const shelfUsed = products.reduce((sum, e) => sum + e.item.width * e.item.height * e.item.depth, 0);
    const occupancy = shelfVolume > 0 ? (shelfUsed / shelfVolume) * 100 : 0;
    const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
    const occupancyColor = occupancy > 75 ? "#ff6b6b" : occupancy > 40 ? "#ffd45c" : "#00e5a0";
    const rows = products.length === 0
      ? `<tr><td colspan="5" class="empty-row">Sin productos registrados en este estante.</td></tr>`
      : products.map((e) => `
        <tr>
          <td><span class="sku-badge">${e.item.sku}</span></td>
          <td>${e.item.name || "—"}</td>
          <td>${fmt(e.item.width)} × ${fmt(e.item.height)} × ${fmt(e.item.depth)}</td>
          <td>${fmt(e.item.width * e.item.height * e.item.depth)} m³</td>
          <td class="pos-cell">(${fmt(e.localPosition.x)}, ${fmt(e.localPosition.y)}, ${fmt(e.localPosition.z)})</td>
        </tr>`).join("");

    return `
      <div class="shelf-card" id="shelf-${shelf.id}">
        <div class="shelf-card-head">
          <div class="shelf-id-badge">${shelf.id}</div>
          <div class="shelf-info">
            <h2 class="shelf-name">${shelf.label ?? shelf.id}</h2>
            <p class="shelf-meta">${fmt(shelf.width)} × ${fmt(shelf.height)} × ${fmt(shelf.depth)} m · ${sections} piso${sections !== 1 ? "s" : ""} · ${products.length} producto${products.length !== 1 ? "s" : ""}</p>
          </div>
          <div class="occupancy-ring">
            <svg viewBox="0 0 36 36">
              <circle class="ring-bg" cx="18" cy="18" r="15.9"/>
              <circle class="ring-fg" cx="18" cy="18" r="15.9" stroke="${occupancyColor}" stroke-dasharray="${occupancy.toFixed(1)} 100" transform="rotate(-90 18 18)"/>
            </svg>
            <span class="ring-label" style="color:${occupancyColor}">${occupancy.toFixed(0)}%</span>
            <span class="ring-sub">OCUPACIÓN</span>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(occupancy,100).toFixed(1)}%;background:${occupancyColor}"></div></div>
        <p class="vol-label">${fmt(shelfUsed)} / ${fmt(shelfVolume)} m³</p>
        <table class="product-table">
          <thead><tr><th>SKU</th><th>NOMBRE</th><th>DIMENSIONES (M)</th><th>VOLUMEN</th><th>POSICIÓN LOCAL</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='4' fill='%230a0d14'/><path d='M3 13h4v8H3v-8Zm6-6h4v14H9V7Zm6 3h4v11h-4V10Z' fill='%2318c7ff'/></svg>"/>
<title>Reporte — Almacén Digital 3D</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0d14;--surface:#111620;--surface2:#181f2e;--border:#1e2a3a;--text:#e2e8f0;--muted:#64748b;--accent2:#18c7ff;--warn:#ffd45c}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;padding:2rem}
.report-brand{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem}
.brand-icon{width:2rem;height:2rem;flex-shrink:0}
.report-eyebrow{font-size:.7rem;letter-spacing:.18em;color:var(--accent2);text-transform:uppercase}
.report-title{font-size:clamp(2rem,6vw,4rem);font-weight:700;letter-spacing:-.03em}
.report-title span{color:var(--accent2)}
.report-meta{font-size:.8rem;color:var(--muted);margin-top:.6rem}
.report-meta b{color:var(--text)}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1.5rem 0}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.2rem 1.4rem}
.kpi-label{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem}
.kpi-value{font-size:2rem;font-weight:700;color:var(--accent2)}
.kpi-value.warn{color:var(--warn)}
.kpi-value.white{color:var(--text)}
.kpi-sub{font-size:.72rem;color:var(--muted);margin-top:.25rem}
.tabs{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.8rem}
.tab-btn{background:var(--surface);border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.72rem;padding:.35rem .9rem;cursor:pointer}
.tab-btn:hover{background:var(--surface2);color:var(--accent2);border-color:var(--accent2)}
.shelf-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.5rem 1.8rem;margin-bottom:1.4rem;scroll-margin-top:1rem}
.shelf-card-head{display:flex;align-items:flex-start;gap:1rem;margin-bottom:1rem}
.shelf-id-badge{background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--accent2);font-size:.7rem;font-weight:700;padding:.3rem .55rem;flex-shrink:0;margin-top:.2rem}
.shelf-info{flex:1}
.shelf-name{font-size:1.3rem;font-weight:700}
.shelf-meta{font-size:.78rem;color:var(--muted);margin-top:.2rem}
.occupancy-ring{position:relative;width:64px;height:64px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.occupancy-ring svg{position:absolute;inset:0;width:100%;height:100%}
.ring-bg{fill:none;stroke:var(--border);stroke-width:3}
.ring-fg{fill:none;stroke-width:3;stroke-linecap:round}
.ring-label{position:absolute;font-size:.65rem;font-weight:700;top:38%;left:50%;transform:translate(-50%,-50%)}
.ring-sub{position:absolute;font-size:.42rem;color:var(--muted);top:62%;left:50%;transform:translate(-50%,-50%)}
.progress-bar{height:4px;background:var(--border);border-radius:999px;overflow:hidden;margin-bottom:.4rem}
.progress-fill{height:100%;border-radius:999px}
.vol-label{font-size:.72rem;color:var(--muted);text-align:right;margin-bottom:1rem}
.product-table{width:100%;border-collapse:collapse;font-size:.8rem}
.product-table th{text-align:left;font-size:.62rem;letter-spacing:.12em;color:var(--muted);padding:.5rem .7rem;border-bottom:1px solid var(--border)}
.product-table td{padding:.6rem .7rem;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle}
.product-table tr:last-child td{border-bottom:none}
.product-table tr:hover td{background:var(--surface2)}
.sku-badge{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--accent2);font-size:.7rem;padding:.15rem .45rem}
.pos-cell{color:var(--muted);font-size:.72rem}
.empty-row{text-align:center;color:var(--muted);font-style:italic;padding:1.2rem!important}
</style>
</head>
<body>
<div class="report-brand">
  <svg class="brand-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 13h4v8H3v-8Zm6-6h4v14H9V7Zm6 3h4v11h-4V10Z" fill="#18c7ff"/>
  </svg>
  <p class="report-eyebrow">Almacén Digital 3D · Reporte de Inventario</p>
</div>
<h1 class="report-title">Estado del <span>almacén</span></h1>
<p class="report-meta">Generado: <b>${dateStr}</b> &nbsp; <b>${shelves.length}</b> estantes &nbsp; <b>${totalProducts}</b> productos</p>
<div class="kpi-grid">
  <div class="kpi-card"><p class="kpi-label">Total Estantes</p><p class="kpi-value white">${shelves.length}</p><p class="kpi-sub">activos en escena</p></div>
  <div class="kpi-card"><p class="kpi-label">Productos</p><p class="kpi-value white">${totalProducts}</p><p class="kpi-sub">registrados en BD</p></div>
  <div class="kpi-card"><p class="kpi-label">Volumen Total</p><p class="kpi-value white">${fmt(totalVolume)}</p><p class="kpi-sub">m³ capacidad bruta</p></div>
  <div class="kpi-card"><p class="kpi-label">Volumen Usado</p><p class="kpi-value warn">${fmt(usedVolume)}</p><p class="kpi-sub">${globalOccupancy.toFixed(1)}% ocupación global</p></div>
</div>
<div class="tabs">${shelfTabs}</div>
${shelfCards}
</body>
</html>`;
}