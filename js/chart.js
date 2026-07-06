import { formatMoney } from "./finance.js";

const PADDING = { top: 16, right: 12, bottom: 24, left: 56 };

// Draws two net-worth series on a canvas: gridlines, two colored lines, $ axis labels.
// Redrawn fully on every input change (cheap enough at <= 30 points) — no internal
// state, no memory of previous draws.
export function drawComparisonChart(canvas, { years, ownerSeries, renterSeries }) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || canvas.clientWidth || 320;
  const height = rect.height || canvas.clientHeight || 220;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const buyColor = styles.getPropertyValue("--buy").trim() || "#2563eb";
  const rentColor = styles.getPropertyValue("--rent").trim() || "#16a34a";
  const lineColor = styles.getPropertyValue("--line").trim() || "#e5e7eb";
  const mutedColor = styles.getPropertyValue("--muted").trim() || "#6b7280";

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const allValues = [...ownerSeries, ...renterSeries];
  const rawMax = Math.max(...allValues);
  const rawMin = Math.min(0, ...allValues);
  const yMax = rawMax * 1.1 || 1;
  const yMin = rawMin < 0 ? rawMin * 1.1 : 0;

  const xForIndex = (i) => PADDING.left + (i / (years.length - 1 || 1)) * plotW;
  const yForValue = (v) => PADDING.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  // Gridlines + Y labels
  const gridLines = 4;
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = mutedColor;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (let g = 0; g <= gridLines; g++) {
    const value = yMin + ((yMax - yMin) * g) / gridLines;
    const y = yForValue(value);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(width - PADDING.right, y);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatMoney(value, { compact: true }), PADDING.left - 8, y);
  }

  // Zero line, emphasized, if within range
  if (yMin < 0 && yMax > 0) {
    ctx.strokeStyle = mutedColor;
    ctx.lineWidth = 1.5;
    const y0 = yForValue(0);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y0);
    ctx.lineTo(width - PADDING.right, y0);
    ctx.stroke();
  }

  // X labels
  const stride = years.length > 16 ? 5 : years.length > 8 ? 2 : 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  years.forEach((yr, i) => {
    if (i % stride !== 0 && i !== years.length - 1) return;
    ctx.fillText(`${yr}y`, xForIndex(i), height - PADDING.bottom + 6);
  });

  drawLine(ctx, years, ownerSeries, xForIndex, yForValue, buyColor);
  drawLine(ctx, years, renterSeries, xForIndex, yForValue, rentColor);
}

function drawLine(ctx, years, series, xForIndex, yForValue, color) {
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = xForIndex(i);
    const y = yForValue(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}
