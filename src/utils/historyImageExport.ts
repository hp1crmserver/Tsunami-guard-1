import { SEVERITY_META, type HistoryFilters, type TsunamiEvent } from '../types/tsunami';
import { formatLocalDateInput, formatLocalDateTime } from './formatters';

export function exportHistorySummaryPng(events: TsunamiEvent[], filters: HistoryFilters, isDark: boolean) {
  const width = 1440;
  const rowsToShow = events.slice(0, 14);
  const height = 300 + Math.max(rowsToShow.length, 1) * 50 + 70;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bg = isDark ? '#070B12' : '#F8FAFC';
  const surface = isDark ? '#0F172A' : '#FFFFFF';
  const border = isDark ? '#1E293B' : '#CBD5E1';
  const ink = isDark ? '#F8FAFC' : '#0F172A';
  const muted = isDark ? '#94A3B8' : '#475569';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(0, 0, width, 8);

  const pad = 48;
  ctx.fillStyle = ink;
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Tsunami Guard · Reporte Histórico de Eventos de Tsunami', pad, 62);

  ctx.fillStyle = muted;
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText(
    `Generado: ${formatLocalDateTime(new Date().toISOString())}  ·  Región: ${filters.region === 'ALL' ? 'Todas' : filters.region}  ·  Agencia: ${filters.agency === 'ALL' ? 'Todas' : filters.agency}  ·  Registros: ${events.length}`,
    pad,
    94
  );

  // Severity summary boxes
  const severities = (['warning', 'watch', 'advisory', 'information'] as const);
  const boxW = (width - pad * 2 - 36) / 4;
  severities.forEach((s, idx) => {
    const meta = SEVERITY_META[s];
    const count = events.filter((e) => e.severity === s).length;
    const bx = pad + idx * (boxW + 12);
    const by = 122;
    ctx.fillStyle = surface;
    ctx.fillRect(bx, by, boxW, 78);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, boxW, 78);

    ctx.fillStyle = meta.hex;
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText(`${meta.glyph} ${meta.shortLabel.toUpperCase()}`, bx + 18, by + 28);

    ctx.fillStyle = ink;
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillText(String(count), bx + 18, by + 62);
  });

  // Table header
  const tableTop = 226;
  ctx.fillStyle = isDark ? '#1E293B' : '#E2E8F0';
  ctx.fillRect(pad, tableTop, width - pad * 2, 42);
  ctx.fillStyle = ink;
  ctx.font = '600 14px "JetBrains Mono", monospace';

  const cols = [
    { label: 'FECHA LOCAL', x: pad + 14 },
    { label: 'SEVERIDAD', x: pad + 215 },
    { label: 'AGENCIA', x: pad + 355 },
    { label: 'MAG', x: pad + 465 },
    { label: 'REGIÓN', x: pad + 550 },
    { label: 'UBICACIÓN', x: pad + 755 },
    { label: 'COORDENADAS', x: pad + 1165 },
  ];
  cols.forEach((c) => ctx.fillText(c.label, c.x, tableTop + 26));

  // Rows
  rowsToShow.forEach((ev, idx) => {
    const ry = tableTop + 42 + idx * 50;
    ctx.fillStyle = idx % 2 === 0 ? surface : bg;
    ctx.fillRect(pad, ry, width - pad * 2, 50);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, ry + 50);
    ctx.lineTo(width - pad, ry + 50);
    ctx.stroke();

    const meta = SEVERITY_META[ev.severity];
    ctx.fillStyle = muted;
    ctx.font = '400 14px "JetBrains Mono", monospace';
    ctx.fillText(formatLocalDateTime(ev.issuedAt, false), cols[0].x, ry + 30);

    ctx.fillStyle = meta.hex;
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText(`${meta.glyph} ${meta.shortLabel.toUpperCase()}`, cols[1].x, ry + 30);

    ctx.fillStyle = ink;
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.fillText(ev.agency, cols[2].x, ry + 30);
    ctx.fillText(ev.magnitude !== null ? ev.magnitude.toFixed(1) : '—', cols[3].x, ry + 30);

    ctx.font = '400 15px "DM Sans", sans-serif';
    ctx.fillText(ev.region.slice(0, 22), cols[4].x, ry + 30);
    ctx.fillText(ev.location.slice(0, 42), cols[5].x, ry + 30);

    ctx.fillStyle = muted;
    ctx.font = '400 14px "JetBrains Mono", monospace';
    ctx.fillText(`${ev.latitude.toFixed(2)}, ${ev.longitude.toFixed(2)}`, cols[6].x, ry + 30);
  });

  // Footer
  ctx.fillStyle = muted;
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillText(
    events.length > rowsToShow.length
      ? `Mostrando los ${rowsToShow.length} eventos más recientes de ${events.length} filtrados. Exporte a PDF para listado completo.`
      : `Total de eventos exportados: ${events.length}`,
    pad,
    height - 26
  );

  const link = document.createElement('a');
  link.download = `TsunamiGuard_Historial_${formatLocalDateInput(new Date())}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
