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

/** Convierte coordenada local a etiqueta humana: Columna · Fila · Nivel */
function posLabel(x: number, y: number, z: number, shelf: Shelf): string {
  const col = Math.round(x / (shelf.width / Math.max(1, Math.round(shelf.width / 0.5)))) + 1;
  const row = Math.round(z / (shelf.depth / Math.max(1, Math.round(shelf.depth / 0.5)))) + 1;
  const lvl = Math.round(y / (shelf.height / Math.max(1, shelf.sections ?? 1))) + 1;
  return `Col ${col} · Fila ${row} · Nivel ${lvl}`;
}

/** Color según porcentaje de ocupación */
function occColor(pct: number): string {
  if (pct > 70) return "#ff6b6b";
  if (pct > 35) return "#ffd45c";
  return "#00e5a0";
}

/** Genera las barras SVG del gráfico de ocupación por estante */
function buildBarChart(
  shelves: Shelf[],
  allProducts: ProductEntry[]
): string {
  const barH = 28;
  const gap = 10;
  const labelW = 56;
  const chartW = 520;
  const totalH = shelves.length * (barH + gap) + 20;

  const bars = shelves.map((shelf, i) => {
    const products = allProducts.filter((e) => e.shelfId === shelf.id);
    const vol = shelf.width * shelf.height * shelf.depth;
    const used = products.reduce((s, e) => s + e.item.width * e.item.height * e.item.depth, 0);
    const pct = vol > 0 ? (used / vol) * 100 : 0;
    const barW = Math.max(2, ((chartW - labelW - 80) * pct) / 100);
    const y = i * (barH + gap) + 10;
    const col = occColor(pct);
    const name = shelf.label ?? shelf.id;
    const shortName = name.length > 8 ? name.slice(0, 7) + "…" : name;

    return `
      <text x="${labelW - 6}" y="${y + barH / 2 + 5}" text-anchor="end" fill="#64748b" font-size="11" font-family="'Segoe UI',sans-serif">${shortName}</text>
      <rect x="${labelW}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${col}" opacity="0.85"/>
      <text x="${labelW + barW + 8}" y="${y + barH / 2 + 5}" fill="${col}" font-size="12" font-weight="700" font-family="'Segoe UI',sans-serif">${pct.toFixed(0)}%</text>
    `;
  }).join("");

  return `<svg viewBox="0 0 ${chartW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${chartW}px;display:block">${bars}</svg>`;
}

/** Genera el gráfico donut de uso global */
function buildDonutChart(used: number, total: number): string {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const free = 100 - pct;
  const r = 60;
  const cx = 90;
  const cy = 90;
  const circ = 2 * Math.PI * r;
  const usedDash = (pct / 100) * circ;
  const freeDash = (free / 100) * circ;
  const col = occColor(pct);

  return `
  <svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" style="width:180px;height:180px;flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e2a3a" stroke-width="18"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="18"
      stroke-dasharray="${usedDash.toFixed(2)} ${(circ - usedDash).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${col}" font-size="22" font-weight="700" font-family="'Segoe UI',sans-serif">${pct.toFixed(1)}%</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#64748b" font-size="10" font-family="'Segoe UI',sans-serif">OCUPACIÓN</text>
    <circle cx="28" cy="148" r="6" fill="${col}"/>
    <text x="38" y="153" fill="#e2e8f0" font-size="10" font-family="'Segoe UI',sans-serif">Usado ${fmt(used)} m³</text>
    <circle cx="28" cy="165" r="6" fill="#1e2a3a"/>
    <text x="38" y="170" fill="#64748b" font-size="10" font-family="'Segoe UI',sans-serif">Libre ${fmt(total - used)} m³</text>
  </svg>`;
}

function buildReportHtml(data: ReportData): string {
  const { shelves, productsBySku, generatedAt } = data;
  const allProducts = [...productsBySku.values()];
  const totalProducts = allProducts.length;
  const totalVolume = shelves.reduce((sum, s) => sum + s.width * s.height * s.depth, 0);
  const usedVolume = allProducts.reduce((sum, e) => sum + e.item.width * e.item.height * e.item.depth, 0);
  const freeVolume = totalVolume - usedVolume;
  const globalOccupancy = totalVolume > 0 ? (usedVolume / totalVolume) * 100 : 0;

  const dateStr = generatedAt.toLocaleString("es-PE", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  // ── Indicadores inteligentes ──
  const shelfStats = shelves.map((s) => {
    const prods = allProducts.filter((e) => e.shelfId === s.id);
    const vol = s.width * s.height * s.depth;
    const used = prods.reduce((sum, e) => sum + e.item.width * e.item.height * e.item.depth, 0);
    const pct = vol > 0 ? (used / vol) * 100 : 0;
    return { shelf: s, prods, vol, used, pct };
  });

  const busiest = shelfStats.reduce((a, b) => (b.pct > a.pct ? b : a), shelfStats[0]);
  const emptiest = shelfStats.reduce((a, b) => (b.pct < a.pct ? b : a), shelfStats[0]);

  const topProducts = [...allProducts]
    .sort((a, b) => {
      const va = a.item.width * a.item.height * a.item.depth;
      const vb = b.item.width * b.item.height * b.item.depth;
      return vb - va;
    })
    .slice(0, 3);

  const topProductsHtml = topProducts.map((e, i) => {
    const vol = e.item.width * e.item.height * e.item.depth;
    const medals = ["🥇", "🥈", "🥉"];
    return `<div class="top-item"><span class="top-rank">${medals[i]}</span><span class="top-name">${e.item.name || e.item.sku}</span><span class="top-vol">${fmt(vol)} m³</span></div>`;
  }).join("");

  const donutSvg = buildDonutChart(usedVolume, totalVolume);
  const barChartSvg = buildBarChart(shelves, allProducts);

  // ── Tabs de navegación ──
  const shelfTabs = shelves.map((s) =>
    `<button class="tab-btn" onclick="document.getElementById('shelf-${s.id}').scrollIntoView({behavior:'smooth'})">${s.id}</button>`
  ).join("");

  // ── Tarjetas de estantes ──
  const shelfCards = shelves.map((shelf) => {
    const products = allProducts.filter((e) => e.shelfId === shelf.id);
    const shelfVolume = shelf.width * shelf.height * shelf.depth;
    const shelfUsed = products.reduce((sum, e) => sum + e.item.width * e.item.height * e.item.depth, 0);
    const occupancy = shelfVolume > 0 ? (shelfUsed / shelfVolume) * 100 : 0;
    const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
    const oc = occColor(occupancy);

    const statusBadge = occupancy > 70
      ? `<span class="status-badge danger">⚠️ Lleno</span>`
      : occupancy > 35
      ? `<span class="status-badge warn">~ Moderado</span>`
      : `<span class="status-badge ok">✔ Disponible</span>`;

    // Alerta de espacio libre excesivo
    const wasteAlert = occupancy < 10 && products.length > 0
      ? `<div class="shelf-alert">💡 Espacio libre &gt; 90% — considera reubicar productos aquí.</div>`
      : "";

    const densityM3 = shelfUsed > 0 ? (products.length / shelfVolume).toFixed(2) : "0";

    const rows = products.length === 0
      ? `<tr><td colspan="5" class="empty-row">Sin productos registrados en este estante.</td></tr>`
      : products.map((e) => {
          const vol = e.item.width * e.item.height * e.item.depth;
          const pos = posLabel(e.localPosition.x, e.localPosition.y, e.localPosition.z, shelf);
          return `
          <tr>
            <td><span class="sku-badge">${e.item.sku}</span></td>
            <td>${e.item.name || "—"}</td>
            <td class="dim-cell">${fmt(e.item.width)} × ${fmt(e.item.height)} × ${fmt(e.item.depth)}</td>
            <td><span class="vol-chip">${fmt(vol)} m³</span></td>
            <td class="pos-cell">${pos}</td>
          </tr>`;
        }).join("");

    return `
    <div class="shelf-card" id="shelf-${shelf.id}">
      <div class="shelf-card-head">
        <div class="shelf-id-badge">${shelf.id}</div>
        <div class="shelf-info">
          <h2 class="shelf-name">${shelf.label ?? shelf.id} ${statusBadge}</h2>
          <p class="shelf-meta">${fmt(shelf.width)} × ${fmt(shelf.height)} × ${fmt(shelf.depth)} m &nbsp;·&nbsp; ${sections} piso${sections !== 1 ? "s" : ""} &nbsp;·&nbsp; ${products.length} producto${products.length !== 1 ? "s" : ""} &nbsp;·&nbsp; densidad: ${densityM3} prod/m³</p>
        </div>
        <div class="occupancy-ring">
          <svg viewBox="0 0 36 36">
            <circle class="ring-bg" cx="18" cy="18" r="15.9"/>
            <circle class="ring-fg" cx="18" cy="18" r="15.9" stroke="${oc}" stroke-dasharray="${occupancy.toFixed(1)} 100" transform="rotate(-90 18 18)"/>
          </svg>
          <span class="ring-label" style="color:${oc}">${occupancy.toFixed(0)}%</span>
          <span class="ring-sub">OCP.</span>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(occupancy,100).toFixed(1)}%;background:${oc}"></div></div>
      <p class="vol-label">${fmt(shelfUsed)} / ${fmt(shelfVolume)} m³ &nbsp;·&nbsp; libre: ${fmt(shelfVolume - shelfUsed)} m³</p>
      ${wasteAlert}
      <table class="product-table">
        <thead><tr><th>SKU</th><th>NOMBRE</th><th>DIMENSIONES (M)</th><th>VOLUMEN</th><th>UBICACIÓN</th></tr></thead>
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
:root{--bg:#0a0d14;--surface:#111620;--surface2:#181f2e;--border:#1e2a3a;--text:#e2e8f0;--muted:#64748b;--accent:#18c7ff;--warn:#ffd45c;--danger:#ff6b6b;--success:#00e5a0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;padding:2rem;max-width:1100px;margin:0 auto}
/* ─── Header ─── */
.report-brand{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem}
.brand-icon{width:2rem;height:2rem;flex-shrink:0}
.report-eyebrow{font-size:.7rem;letter-spacing:.18em;color:var(--accent);text-transform:uppercase}
.report-title{font-size:clamp(2rem,6vw,3.5rem);font-weight:700;letter-spacing:-.03em}
.report-title span{color:var(--accent)}
.report-meta{font-size:.8rem;color:var(--muted);margin-top:.5rem}
.report-meta b{color:var(--text)}
/* ─── KPIs ─── */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin:1.5rem 0}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.2rem 1.4rem}
.kpi-label{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem}
.kpi-value{font-size:1.9rem;font-weight:700;color:var(--accent)}
.kpi-value.warn{color:var(--warn)}
.kpi-value.ok{color:var(--success)}
.kpi-value.white{color:var(--text)}
.kpi-value.danger{color:var(--danger)}
.kpi-sub{font-size:.7rem;color:var(--muted);margin-top:.2rem}
/* ─── Sección de análisis ─── */
.analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.5rem 0}
@media(max-width:700px){.analysis-grid{grid-template-columns:1fr}}
.analysis-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.2rem 1.4rem}
.analysis-title{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.9rem}
.intel-row{display:flex;justify-content:space-between;align-items:center;padding:.45rem 0;border-bottom:1px solid var(--border)}
.intel-row:last-child{border-bottom:none}
.intel-label{font-size:.8rem;color:var(--muted)}
.intel-value{font-size:.85rem;font-weight:700;color:var(--accent)}
.intel-value.danger{color:var(--danger)}
.intel-value.warn{color:var(--warn)}
.intel-value.ok{color:var(--success)}
.top-item{display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border)}
.top-item:last-child{border-bottom:none}
.top-rank{font-size:1rem}
.top-name{flex:1;font-size:.82rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top-vol{font-size:.78rem;font-weight:700;color:var(--accent);white-space:nowrap}
/* ─── Gráficos ─── */
.charts-grid{display:grid;grid-template-columns:auto 1fr;gap:1rem;margin:1.5rem 0;align-items:center}
@media(max-width:600px){.charts-grid{grid-template-columns:1fr}}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.2rem 1.4rem}
.chart-title{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:1rem}
/* ─── Tabs ─── */
.tabs{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.8rem}
.tab-btn{background:var(--surface);border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.72rem;padding:.35rem .9rem;cursor:pointer}
.tab-btn:hover{background:var(--surface2);color:var(--accent);border-color:var(--accent)}
/* ─── Shelf cards ─── */
.shelf-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.5rem 1.8rem;margin-bottom:1.4rem;scroll-margin-top:1rem}
.shelf-card-head{display:flex;align-items:flex-start;gap:1rem;margin-bottom:1rem}
.shelf-id-badge{background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--accent);font-size:.7rem;font-weight:700;padding:.3rem .55rem;flex-shrink:0;margin-top:.3rem}
.shelf-info{flex:1}
.shelf-name{font-size:1.15rem;font-weight:700;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.shelf-meta{font-size:.75rem;color:var(--muted);margin-top:.25rem}
/* Status badge */
.status-badge{font-size:.65rem;font-weight:700;border-radius:999px;padding:.2rem .6rem;letter-spacing:.05em}
.status-badge.ok{background:rgba(0,229,160,.12);color:var(--success);border:1px solid rgba(0,229,160,.3)}
.status-badge.warn{background:rgba(255,212,92,.12);color:var(--warn);border:1px solid rgba(255,212,92,.3)}
.status-badge.danger{background:rgba(255,107,107,.12);color:var(--danger);border:1px solid rgba(255,107,107,.3)}
/* Occupancy ring */
.occupancy-ring{position:relative;width:60px;height:60px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.occupancy-ring svg{position:absolute;inset:0;width:100%;height:100%}
.ring-bg{fill:none;stroke:var(--border);stroke-width:3}
.ring-fg{fill:none;stroke-width:3;stroke-linecap:round}
.ring-label{position:absolute;font-size:.6rem;font-weight:700;top:38%;left:50%;transform:translate(-50%,-50%)}
.ring-sub{position:absolute;font-size:.38rem;color:var(--muted);top:62%;left:50%;transform:translate(-50%,-50%)}
.progress-bar{height:4px;background:var(--border);border-radius:999px;overflow:hidden;margin-bottom:.4rem}
.progress-fill{height:100%;border-radius:999px}
.vol-label{font-size:.72rem;color:var(--muted);text-align:right;margin-bottom:.75rem}
/* Alert */
.shelf-alert{background:rgba(255,212,92,.08);border:1px solid rgba(255,212,92,.25);border-radius:8px;color:var(--warn);font-size:.78rem;padding:.55rem .9rem;margin-bottom:.9rem}
/* Table */
.product-table{width:100%;border-collapse:collapse;font-size:.8rem}
.product-table th{text-align:left;font-size:.6rem;letter-spacing:.12em;color:var(--muted);padding:.5rem .7rem;border-bottom:1px solid var(--border)}
.product-table td{padding:.55rem .7rem;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle}
.product-table tr:last-child td{border-bottom:none}
.product-table tr:hover td{background:var(--surface2)}
.sku-badge{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--accent);font-size:.7rem;padding:.15rem .45rem}
.vol-chip{background:rgba(24,199,255,.1);color:var(--accent);border-radius:4px;font-size:.72rem;padding:.1rem .4rem}
.dim-cell{color:var(--muted);font-size:.74rem}
.pos-cell{color:var(--muted);font-size:.72rem}
.empty-row{text-align:center;color:var(--muted);font-style:italic;padding:1.2rem!important}
/* ─── Sección print ─── */
.print-section{text-align:center;padding:2.5rem 0 1.5rem;border-top:1px solid var(--border);margin-top:2rem}
.print-section p{font-size:.78rem;color:var(--muted);margin-bottom:1rem}
.btn-print{background:var(--accent);color:#000;border:none;border-radius:10px;padding:.7rem 2rem;font-size:.9rem;font-weight:700;cursor:pointer;letter-spacing:.04em;transition:opacity .2s}
.btn-print:hover{opacity:.85}
/* ─── Print media ─── */
@media print{
  body{background:#fff;color:#000;padding:1rem}
  :root{--bg:#fff;--surface:#f9f9f9;--surface2:#f0f0f0;--border:#ccc;--text:#111;--muted:#555;--accent:#0077aa;--warn:#b06000;--danger:#cc0000;--success:#006633}
  .tabs,.print-section,.btn-print{display:none!important}
  .shelf-card{break-inside:avoid;page-break-inside:avoid}
}
</style>
</head>
<body>

<!-- Header -->
<div class="report-brand">
  <svg class="brand-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 13h4v8H3v-8Zm6-6h4v14H9V7Zm6 3h4v11h-4V10Z" fill="#18c7ff"/>
  </svg>
  <p class="report-eyebrow">Almacén Digital 3D · Reporte de Inventario</p>
</div>
<h1 class="report-title">Estado del <span>almacén</span></h1>
<p class="report-meta">Generado: <b>${dateStr}</b> &nbsp;·&nbsp; <b>${shelves.length}</b> estantes &nbsp;·&nbsp; <b>${totalProducts}</b> productos</p>

<!-- KPIs -->
<div class="kpi-grid">
  <div class="kpi-card">
    <p class="kpi-label">Total Estantes</p>
    <p class="kpi-value white">${shelves.length}</p>
    <p class="kpi-sub">activos en escena</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Productos</p>
    <p class="kpi-value white">${totalProducts}</p>
    <p class="kpi-sub">registrados en BD</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Capacidad Total</p>
    <p class="kpi-value white">${fmt(totalVolume)}</p>
    <p class="kpi-sub">m³ capacidad bruta</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Volumen Usado</p>
    <p class="kpi-value warn">${fmt(usedVolume)}</p>
    <p class="kpi-sub">${globalOccupancy.toFixed(1)}% ocupación global</p>
  </div>
  <div class="kpi-card">
    <p class="kpi-label">Espacio Libre</p>
    <p class="kpi-value ok">${fmt(freeVolume)}</p>
    <p class="kpi-sub">m³ disponibles</p>
  </div>
</div>

<!-- Gráficos -->
<div class="charts-grid">
  <div class="chart-card">
    <p class="chart-title">Uso global (usado vs libre)</p>
    ${donutSvg}
  </div>
  <div class="chart-card">
    <p class="chart-title">Ocupación por estante</p>
    ${barChartSvg}
  </div>
</div>

<!-- Indicadores inteligentes -->
<div class="analysis-grid">
  <div class="analysis-card">
    <p class="analysis-title">Ranking de estantes</p>
    ${busiest ? `
    <div class="intel-row">
      <span class="intel-label">🔥 Más ocupado</span>
      <span class="intel-value danger">${busiest.shelf.label ?? busiest.shelf.id} (${busiest.pct.toFixed(0)}%)</span>
    </div>` : ""}
    ${emptiest ? `
    <div class="intel-row">
      <span class="intel-label">🧊 Más vacío</span>
      <span class="intel-value ok">${emptiest.shelf.label ?? emptiest.shelf.id} (${emptiest.pct.toFixed(0)}%)</span>
    </div>` : ""}
    ${shelfStats.map((s) => `
    <div class="intel-row">
      <span class="intel-label">${s.shelf.id}</span>
      <span class="intel-value ${s.pct > 70 ? "danger" : s.pct > 35 ? "warn" : "ok"}">${s.pct.toFixed(1)}% · ${fmt(s.used)}/${fmt(s.vol)} m³</span>
    </div>`).join("")}
  </div>
  <div class="analysis-card">
    <p class="analysis-title">Top 3 productos por volumen</p>
    ${topProductsHtml || `<p style="color:var(--muted);font-size:.8rem">Sin productos registrados.</p>`}
    <div style="margin-top:1rem">
      <p class="analysis-title" style="margin-bottom:.6rem">Eficiencia de almacenaje</p>
      <div class="intel-row">
        <span class="intel-label">Densidad global</span>
        <span class="intel-value">${totalVolume > 0 ? (totalProducts / totalVolume).toFixed(2) : "0"} prod/m³</span>
      </div>
      <div class="intel-row">
        <span class="intel-label">Volumen prom. por producto</span>
        <span class="intel-value">${totalProducts > 0 ? fmt(usedVolume / totalProducts) : "0"} m³</span>
      </div>
      <div class="intel-row">
        <span class="intel-label">Capacidad no usada</span>
        <span class="intel-value warn">${fmt(freeVolume)} m³</span>
      </div>
    </div>
  </div>
</div>

<!-- Detalle por estante -->
<div class="tabs">${shelfTabs}</div>
${shelfCards}

<!-- Botón imprimir -->
<div class="print-section">
  <p>Este reporte puede guardarse como PDF usando la función de impresión del navegador.</p>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</div>

</body>
</html>`;
}