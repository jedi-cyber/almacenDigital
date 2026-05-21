import type { Shelf } from "./types.js";
import type { ProductEntry, ProductHistoryEntry } from "./warehouse.js";

export interface ReportData {
  shelves: Shelf[];
  productsBySku: Map<string, ProductEntry>;
  generatedAt: Date;
  history?: ProductHistoryEntry[];
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

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function countByCatalog(
  products: ProductEntry[],
  getValue: (entry: ProductEntry) => string | undefined
): Array<{ name: string; count: number }> {
  const counts = new Map<string, { name: string; count: number }>();
  products.forEach((entry) => {
    const name = getValue(entry)?.trim() || "Sin definir";
    const key = name.toLowerCase();
    const current = counts.get(key) ?? { name, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

function getSectionBounds(shelf: Shelf): Array<{ section: number; label: string; min: number; max: number }> {
  const sections = Math.max(1, Math.floor(shelf.sections ?? 1));
  const offsets = shelf.boardOffsets && shelf.boardOffsets.length > 0
    ? shelf.boardOffsets.map((fraction) => fraction * shelf.height)
    : Array.from({ length: sections - 1 }, (_, index) => ((index + 1) * shelf.height) / sections);
  const bounds = [0, ...offsets, shelf.height].sort((a, b) => a - b);
  return bounds.slice(0, -1).map((min, index) => ({
    section: index + 1,
    label: shelf.sectionLabels?.[index] || `Piso ${index + 1}`,
    min,
    max: bounds[index + 1]
  }));
}

function getSectionForProduct(shelf: Shelf, product: ProductEntry): number {
  const sections = getSectionBounds(shelf);
  const y = product.localPosition.y;
  return sections.find((section, index) =>
    y >= section.min && (y < section.max || index === sections.length - 1)
  )?.section ?? 1;
}

function isIncompleteProduct(entry: ProductEntry, shelves: Shelf[]): boolean {
  const hasShelf = shelves.some((shelf) => shelf.id === entry.shelfId);
  const hasValidDims = entry.item.width > 0 && entry.item.height > 0 && entry.item.depth > 0;
  const hasValidPosition = Number.isFinite(entry.localPosition.x)
    && Number.isFinite(entry.localPosition.y)
    && Number.isFinite(entry.localPosition.z);
  const hasCatalog = Boolean(entry.item.category?.trim()) && Boolean(entry.item.brand?.trim());
  return !hasShelf || !hasValidDims || !hasValidPosition || !entry.item.name?.trim() || !hasCatalog;
}

function csvEscape(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildReportHtml(data: ReportData): string {
  const { shelves, productsBySku, generatedAt, history = [] } = data;
  const allProducts = [...productsBySku.values()];
  const movedSkus = new Set(history.filter((entry) => entry.action === "movido").map((entry) => entry.sku));
  const lastActivityBySku = new Map<string, string>();
  history.forEach((entry) => {
    if (!lastActivityBySku.has(entry.sku)) lastActivityBySku.set(entry.sku, entry.createdAt);
  });
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
  const categoryStats = countByCatalog(allProducts, (entry) => entry.item.category);
  const brandStats = countByCatalog(allProducts, (entry) => entry.item.brand);
  const incompleteProducts = allProducts.filter((entry) => isIncompleteProduct(entry, shelves));
  const productsWithoutImage = allProducts.filter((entry) => !entry.item.imageUrl);
  const categoryOptions = categoryStats.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  const brandOptions = brandStats.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  const shelfOptions = shelves.map((shelf) => `<option value="${esc(shelf.id)}">${esc(shelf.id)} · ${esc(shelf.label ?? shelf.id)}</option>`).join("");
  const productsCsv = [
    ["SKU", "Nombre", "Categoria", "Marca", "Estante", "Piso", "Ancho", "Alto", "Profundidad", "Volumen", "X", "Y", "Z"],
    ...allProducts.map((entry) => {
      const shelf = shelves.find((item) => item.id === entry.shelfId);
      const section = shelf ? getSectionForProduct(shelf, entry) : "";
      const volume = entry.item.width * entry.item.height * entry.item.depth;
      return [
        entry.item.sku,
        entry.item.name,
        entry.item.category ?? "Sin categoria",
        entry.item.brand ?? "Sin marca",
        entry.shelfId,
        section,
        fmt(entry.item.width),
        fmt(entry.item.height),
        fmt(entry.item.depth),
        fmt(volume),
        fmt(entry.localPosition.x),
        fmt(entry.localPosition.y),
        fmt(entry.localPosition.z)
      ];
    })
  ].map((row) => row.map(csvEscape).join(",")).join("\n");
  const catalogRowsHtml = categoryStats.slice(0, 5).map((category) =>
    `<div class="intel-row"><span class="intel-label">${category.name}</span><span class="intel-value">${category.count} prod.</span></div>`
  ).join("");
  const brandRowsHtml = brandStats.slice(0, 5).map((brand) =>
    `<div class="intel-row"><span class="intel-label">${brand.name}</span><span class="intel-value">${brand.count} prod.</span></div>`
  ).join("");
  const incompleteRowsHtml = incompleteProducts.slice(0, 8).map((entry) =>
    `<div class="intel-row"><span class="intel-label">${entry.item.sku}</span><span class="intel-value warn">${entry.item.name || "Sin nombre"} · ${entry.shelfId || "Sin estante"}</span></div>`
  ).join("");

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
    const floorRows = getSectionBounds(shelf).map((section) => {
      const floorProducts = products.filter((entry) => getSectionForProduct(shelf, entry) === section.section);
      const floorVolume = shelf.width * shelf.depth * Math.max(0, section.max - section.min);
      const floorUsed = floorProducts.reduce((sum, entry) => sum + entry.item.width * entry.item.height * entry.item.depth, 0);
      const floorPct = floorVolume > 0 ? (floorUsed / floorVolume) * 100 : 0;
      return `
        <div class="floor-row">
          <span>${section.label}</span>
          <div class="floor-bar"><i style="width:${Math.min(floorPct, 100).toFixed(1)}%;background:${occColor(floorPct)}"></i></div>
          <strong>${floorProducts.length} prod. · ${floorPct.toFixed(1)}%</strong>
        </div>`;
    }).join("");

	    const rows = products.length === 0
	      ? `<tr><td colspan="6" class="empty-row">Sin productos registrados en este estante.</td></tr>`
	      : products.map((e) => {
	          const vol = e.item.width * e.item.height * e.item.depth;
	          const pos = posLabel(e.localPosition.x, e.localPosition.y, e.localPosition.z, shelf);
          const category = e.item.category || "Sin categoria";
          const brand = e.item.brand || "Sin marca";
          const moved = movedSkus.has(e.item.sku);
          const hasImage = Boolean(e.item.imageUrl);
          const lastActivity = lastActivityBySku.get(e.item.sku) ?? "";
	          return `
	          <tr data-report-product-row data-shelf="${esc(e.shelfId)}" data-category="${esc(category)}" data-brand="${esc(brand)}" data-moved="${moved ? "true" : "false"}" data-has-image="${hasImage ? "true" : "false"}" data-last-activity="${esc(lastActivity)}">
	            <td><span class="sku-badge">${esc(e.item.sku)}</span></td>
	            <td>${esc(e.item.name || "—")}</td>
	            <td class="catalog-cell">${esc(category)}<br><small>${esc(brand)}</small></td>
	            <td class="dim-cell">${fmt(e.item.width)} × ${fmt(e.item.height)} × ${fmt(e.item.depth)}</td>
	            <td><span class="vol-chip">${fmt(vol)} m³</span></td>
	            <td class="pos-cell">${esc(pos)}${moved ? `<br><small class="moved-chip">Movido</small>` : ""}${!hasImage ? `<br><small class="missing-chip">Sin imagen</small>` : ""}</td>
	          </tr>`;
	        }).join("");

    return `
	    <div class="shelf-card" id="shelf-${esc(shelf.id)}" data-report-shelf-card data-shelf="${esc(shelf.id)}" data-occupancy="${occupancy.toFixed(2)}">
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
      <div class="floor-occupancy">
        <strong>Ocupación por piso</strong>
        ${floorRows}
      </div>
      ${wasteAlert}
      <table class="product-table">
        <thead><tr><th>SKU</th><th>NOMBRE</th><th>CAT./MARCA</th><th>DIMENSIONES (M)</th><th>VOLUMEN</th><th>UBICACIÓN</th></tr></thead>
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
	.report-filters{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin:1.5rem 0;padding:1rem;background:rgba(17,22,32,.96);border:1px solid var(--border);border-radius:14px;backdrop-filter:blur(14px)}
	.report-filters label{display:grid;gap:.35rem;color:var(--muted);font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
	.report-filters select,.report-filters input{min-height:36px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);padding:.4rem .55rem;font:inherit;font-size:.78rem}
	.filter-check{display:flex!important;align-items:center;gap:.5rem;text-transform:none;letter-spacing:0;font-size:.78rem}
	.filter-check input{min-height:auto}
	.filter-actions{display:flex;align-items:end;gap:.5rem}
	.filter-actions button{min-height:36px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);padding:0 .8rem;font-weight:700;cursor:pointer}
	.filter-summary{grid-column:1/-1;color:var(--muted);font-size:.78rem}
	@media(max-width:760px){body{padding:1rem}.report-filters{position:static;grid-template-columns:1fr}.product-table{display:block;overflow-x:auto}.shelf-card{padding:1rem}.shelf-card-head{display:grid}.occupancy-ring{width:52px;height:52px}}
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
.floor-occupancy{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:.7rem .8rem;margin-bottom:.85rem}
.floor-occupancy>strong{display:block;color:var(--text);font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;margin-bottom:.5rem}
.floor-row{display:grid;grid-template-columns:90px 1fr 120px;gap:.6rem;align-items:center;padding:.25rem 0}
.floor-row span{color:var(--muted);font-size:.72rem}
.floor-row strong{color:var(--text);font-size:.72rem;text-align:right}
.floor-bar{height:7px;background:var(--border);border-radius:999px;overflow:hidden}
.floor-bar i{display:block;height:100%;border-radius:999px}
@media(max-width:620px){.floor-row{grid-template-columns:1fr}.floor-row strong{text-align:left}}
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
	.moved-chip,.missing-chip{display:inline-block;margin-top:.2rem;border-radius:999px;padding:.1rem .4rem;font-size:.66rem;font-weight:800}
	.moved-chip{background:rgba(24,199,255,.12);color:var(--accent)}
	.missing-chip{background:rgba(255,212,92,.12);color:var(--warn)}
.dim-cell{color:var(--muted);font-size:.74rem}
.catalog-cell{color:var(--text);font-size:.74rem}
.catalog-cell small{color:var(--muted);font-size:.68rem}
.pos-cell{color:var(--muted);font-size:.72rem}
.empty-row{text-align:center;color:var(--muted);font-style:italic;padding:1.2rem!important}
/* ─── Sección print ─── */
.print-section{text-align:center;padding:2.5rem 0 1.5rem;border-top:1px solid var(--border);margin-top:2rem}
.print-section p{font-size:.78rem;color:var(--muted);margin-bottom:1rem}
.report-actions{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}
.btn-print{background:var(--accent);color:#000;border:none;border-radius:10px;padding:.7rem 2rem;font-size:.9rem;font-weight:700;cursor:pointer;letter-spacing:.04em;transition:opacity .2s}
.btn-export{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:.7rem 2rem;font-size:.9rem;font-weight:700;cursor:pointer;letter-spacing:.04em;transition:opacity .2s}
.btn-print:hover{opacity:.85}
.btn-export:hover{opacity:.85}
/* ─── Print media ─── */
@media print{
  body{background:#fff;color:#000;padding:1rem}
  :root{--bg:#fff;--surface:#f9f9f9;--surface2:#f0f0f0;--border:#ccc;--text:#111;--muted:#555;--accent:#0077aa;--warn:#b06000;--danger:#cc0000;--success:#006633}
  .tabs,.print-section,.btn-print,.btn-export{display:none!important}
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
	  <div class="kpi-card">
	    <p class="kpi-label">Datos Incompletos</p>
	    <p class="kpi-value ${incompleteProducts.length > 0 ? "danger" : "ok"}">${incompleteProducts.length}</p>
	    <p class="kpi-sub">productos por revisar</p>
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
	  <div class="analysis-card">
	    <p class="analysis-title">Categorias</p>
	    ${catalogRowsHtml || `<p style="color:var(--muted);font-size:.8rem">Sin categorias registradas.</p>`}
	  </div>
	  <div class="analysis-card">
	    <p class="analysis-title">Marcas</p>
	    ${brandRowsHtml || `<p style="color:var(--muted);font-size:.8rem">Sin marcas registradas.</p>`}
	  </div>
	  <div class="analysis-card">
	    <p class="analysis-title">Productos con datos incompletos</p>
	    ${incompleteRowsHtml || `<p style="color:var(--muted);font-size:.8rem">No se detectaron productos incompletos.</p>`}
	  </div>
	</div>
</div>

	<!-- Detalle por estante -->
	<section class="report-filters" aria-label="Filtros del reporte">
	  <label>Categoria
	    <select id="filter-category"><option value="">Todas</option>${categoryOptions}</select>
	  </label>
	  <label>Marca
	    <select id="filter-brand"><option value="">Todas</option>${brandOptions}</select>
	  </label>
	  <label>Estante
	    <select id="filter-shelf"><option value="">Todos</option>${shelfOptions}</select>
	  </label>
	  <label>Actividad desde
	    <input id="filter-date" type="date" />
	  </label>
	  <label>Capacidad usada
	    <select id="filter-capacity">
	      <option value="">Todos</option>
	      <option value="low">0% - 35%</option>
	      <option value="mid">36% - 70%</option>
	      <option value="high">Más de 70%</option>
	    </select>
	  </label>
	  <label class="filter-check"><input id="filter-moved" type="checkbox" /> Solo productos movidos</label>
	  <label class="filter-check"><input id="filter-no-image" type="checkbox" /> Solo productos sin imagen</label>
	  <div class="filter-actions">
	    <button type="button" id="clear-report-filters">Limpiar</button>
	  </div>
	  <p class="filter-summary" id="filter-summary">${totalProducts} productos visibles · ${productsWithoutImage.length} sin imagen · ${movedSkus.size} movidos</p>
	</section>
	<div class="tabs">${shelfTabs}</div>
${shelfCards}

	<!-- Botón imprimir -->
	<div class="print-section">
	  <p>Exporta el detalle para auditoría o guarda una copia en PDF desde impresión.</p>
	  <div class="report-actions">
	    <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
	    <button class="btn-export" onclick="downloadProductsCsv()">Exportar Excel CSV</button>
	  </div>
	</div>
	
		<script>
		const productsCsv = ${JSON.stringify(productsCsv)};
		const filters = {
		  category: document.getElementById("filter-category"),
		  brand: document.getElementById("filter-brand"),
		  shelf: document.getElementById("filter-shelf"),
		  date: document.getElementById("filter-date"),
		  capacity: document.getElementById("filter-capacity"),
		  moved: document.getElementById("filter-moved"),
		  noImage: document.getElementById("filter-no-image"),
		  summary: document.getElementById("filter-summary")
		};
		function matchesCapacity(card) {
		  const value = filters.capacity.value;
		  const pct = Number(card.dataset.occupancy || 0);
		  if (!value) return true;
		  if (value === "low") return pct <= 35;
		  if (value === "mid") return pct > 35 && pct <= 70;
		  return pct > 70;
		}
		function applyReportFilters() {
		  let visibleProducts = 0;
		  document.querySelectorAll("[data-report-shelf-card]").forEach((card) => {
		    let visibleInShelf = 0;
		    const shelfOk = !filters.shelf.value || card.dataset.shelf === filters.shelf.value;
		    const capacityOk = matchesCapacity(card);
		    card.querySelectorAll("[data-report-product-row]").forEach((row) => {
		      const dateOk = !filters.date.value || (row.dataset.lastActivity && row.dataset.lastActivity.slice(0, 10) >= filters.date.value);
		      const ok = shelfOk
		        && capacityOk
		        && (!filters.category.value || row.dataset.category === filters.category.value)
		        && (!filters.brand.value || row.dataset.brand === filters.brand.value)
		        && (!filters.moved.checked || row.dataset.moved === "true")
		        && (!filters.noImage.checked || row.dataset.hasImage === "false")
		        && dateOk;
		      row.hidden = !ok;
		      if (ok) {
		        visibleProducts += 1;
		        visibleInShelf += 1;
		      }
		    });
		    card.hidden = !shelfOk || !capacityOk || visibleInShelf === 0;
		  });
		  filters.summary.textContent = visibleProducts === 0
		    ? "Sin resultados con los filtros actuales."
		    : visibleProducts + " producto" + (visibleProducts === 1 ? "" : "s") + " visible" + (visibleProducts === 1 ? "" : "s");
		}
		Object.values(filters).forEach((control) => {
		  if (control && control.id !== "filter-summary") control.addEventListener("input", applyReportFilters);
		});
		document.getElementById("clear-report-filters")?.addEventListener("click", () => {
		  filters.category.value = "";
		  filters.brand.value = "";
		  filters.shelf.value = "";
		  filters.date.value = "";
		  filters.capacity.value = "";
		  filters.moved.checked = false;
		  filters.noImage.checked = false;
		  applyReportFilters();
		});
		function downloadProductsCsv() {
	  const blob = new Blob([productsCsv], { type: "text/csv;charset=utf-8" });
	  const url = URL.createObjectURL(blob);
	  const link = document.createElement("a");
	  link.href = url;
	  link.download = "reporte-productos-almacen.csv";
	  document.body.appendChild(link);
	  link.click();
	  link.remove();
	  URL.revokeObjectURL(url);
	}
	</script>
	</body>
	</html>`;
}
