import { jsPDF } from 'jspdf';
import { SEVERITY_META, type HistoryFilters, type TsunamiEvent } from '../types/tsunami';
import {
  formatCoordinates,
  formatLocalDateInput,
  formatLocalDateTime,
  formatUtcDateTime,
} from './formatters';

export function exportSingleEventPdf(event: TsunamiEvent, cardDataUrl?: string | null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const sev = SEVERITY_META[event.severity];
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageWidth - margin * 2;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('TSUNAMI GUARD — REPORTE TÉCNICO DE TSUNAMI', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Emitido por sistema de monitoreo · ${formatLocalDateTime(new Date().toISOString())}`, margin, 19);

  // Severity Accent Banner
  const hex = sev.hex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  doc.setFillColor(r, g, b);
  doc.rect(margin, 32, contentW, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`NIVEL DE RIESGO: ${sev.label.toUpperCase()} (${event.bulletinType.toUpperCase()})`, margin + 4, 38);

  // Event Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const titleLines = doc.splitTextToSize(event.title, contentW);
  doc.text(titleLines, margin, 50);

  let y = 50 + titleLines.length * 6.5 + 2;

  // Metadata Grid
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentW, 38, 'FD');

  const rows: [string, string, string, string][] = [
    ['Agencia Emisora', `${event.agency} — ${event.agencyFullName}`, 'Magnitud', event.magnitude !== null ? `${event.magnitude.toFixed(1)} ${event.magnitudeType || 'M'}` : 'N/D'],
    ['Fecha / Hora Local', formatLocalDateTime(event.issuedAt), 'Profundidad', event.depthKm !== null ? `${event.depthKm.toFixed(1)} km` : 'No especificada'],
    ['Coordenadas', formatCoordinates(event.latitude, event.longitude), 'Región Oceánica', event.region],
    ['Hora UTC Ref.', formatUtcDateTime(event.issuedAt), 'Bandera Tsunami', event.tsunamiFlag ? 'SÍ (Evaluación Activa)' : 'No / Informativo'],
  ];

  doc.setFontSize(8.5);
  rows.forEach(([l1, v1, l2, v2], idx) => {
    const ry = y + 7 + idx * 8.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(`${l1}:`, margin + 3, ry);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(v1, 66)[0] || '', margin + 32, ry);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(`${l2}:`, margin + 102, ry);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(v2, 48)[0] || '', margin + 132, ry);
  });

  y += 45;

  // Embedded 4:5 Graphic Card if provided
  if (cardDataUrl) {
    const imgW = 72;
    const imgH = 90; // 4:5 exact ratio
    doc.addImage(cardDataUrl, 'PNG', margin, y, imgW, imgH);

    // Summary right next to the 4:5 graphic
    const textX = margin + imgW + 6;
    const textW = contentW - imgW - 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Resumen del Boletín', textX, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const sumLines = doc.splitTextToSize(event.summary, textW);
    doc.text(sumLines, textX, y + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Descripción del Nivel de Riesgo', textX, y + 52);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(sev.description, textW), textX, y + 58);

    y += imgH + 8;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Resumen del Evento', margin, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const sumLines = doc.splitTextToSize(event.summary, contentW);
    doc.text(sumLines, margin, y + 10);
    y += 14 + sumLines.length * 5;
  }

  // Verbatim Agency Bulletin Text if loaded
  if (event.bulletinText) {
    if (y > 235) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Texto Oficial del Boletín de Agencia', margin, y);
    y += 5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    const bLines = doc.splitTextToSize(event.bulletinText.slice(0, 3200), contentW);
    for (const line of bLines) {
      if (y > 282) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, margin, y);
      y += 3.6;
    }
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`ID Evento: ${event.id} · Generado por Tsunami Guard`, margin, 289);

  doc.save(`TsunamiGuard_Reporte_${event.agency}_${event.id.slice(0, 12)}.pdf`);
}

export function exportHistoryPdf(events: TsunamiEvent[], filters: HistoryFilters) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageWidth - margin * 2;

  const drawHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(248, 250, 252);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TSUNAMI GUARD — REPORTE HISTÓRICO DE BOLETINES Y EVENTOS DE TSUNAMI', margin, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    const filterInfo = `Región: ${filters.region === 'ALL' ? 'Todas' : filters.region} | Agencia: ${filters.agency === 'ALL' ? 'Todas' : filters.agency} | Severidades: ${filters.severities.map((s) => SEVERITY_META[s].shortLabel).join(', ')} | Total: ${events.length}`;
    doc.text(filterInfo, margin, 15.5);
  };

  drawHeader();

  // Summary counts strip
  const counts = {
    warning: events.filter((e) => e.severity === 'warning').length,
    watch: events.filter((e) => e.severity === 'watch').length,
    advisory: events.filter((e) => e.severity === 'advisory').length,
    information: events.filter((e) => e.severity === 'information').length,
  };

  let y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Resumen del Filtro — Alerta: ${counts.warning}   |   Vigilancia: ${counts.watch}   |   Aviso: ${counts.advisory}   |   Boletín Informativo: ${counts.information}   |   Generado: ${formatLocalDateTime(new Date().toISOString())}`,
    margin,
    y
  );

  y += 6;

  // Table Headers
  const cols = [
    { label: 'FECHA / HORA LOCAL', x: margin, w: 34 },
    { label: 'SEVERIDAD', x: margin + 34, w: 26 },
    { label: 'AGENCIA', x: margin + 60, w: 20 },
    { label: 'MAG', x: margin + 80, w: 16 },
    { label: 'PROF.', x: margin + 96, w: 18 },
    { label: 'REGIÓN OCEÁNICA', x: margin + 114, w: 36 },
    { label: 'UBICACIÓN / DESCRIPCIÓN', x: margin + 150, w: 78 },
    { label: 'COORDENADAS', x: margin + 228, w: 41 },
  ];

  const drawTableHeader = (topY: number) => {
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, topY, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    cols.forEach((c) => doc.text(c.label, c.x + 1.5, topY + 4.8));
    return topY + 7;
  };

  y = drawTableHeader(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  events.slice(0, 250).forEach((ev, index) => {
    if (y > pageHeight - 14) {
      doc.addPage();
      drawHeader();
      y = drawTableHeader(25);
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, 7, 'F');
    }

    const sev = SEVERITY_META[ev.severity];
    doc.setTextColor(15, 23, 42);
    doc.text(formatLocalDateTime(ev.issuedAt, false), cols[0].x + 1.5, y + 4.8);

    const hex = sev.hex.replace('#', '');
    doc.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    doc.setFont('helvetica', 'bold');
    doc.text(sev.shortLabel.toUpperCase(), cols[1].x + 1.5, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(ev.agency, cols[2].x + 1.5, y + 4.8);
    doc.text(ev.magnitude !== null ? ev.magnitude.toFixed(1) : '—', cols[3].x + 1.5, y + 4.8);
    doc.text(ev.depthKm !== null ? `${ev.depthKm.toFixed(0)} km` : '—', cols[4].x + 1.5, y + 4.8);
    doc.text(ev.region.slice(0, 21), cols[5].x + 1.5, y + 4.8);
    doc.text(ev.location.slice(0, 48), cols[6].x + 1.5, y + 4.8);
    doc.text(`${ev.latitude.toFixed(2)}, ${ev.longitude.toFixed(2)}`, cols[7].x + 1.5, y + 4.8);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 7, margin + contentW, y + 7);
    y += 7;
  });

  doc.save(`TsunamiGuard_Historial_${formatLocalDateInput(new Date())}.pdf`);
}
