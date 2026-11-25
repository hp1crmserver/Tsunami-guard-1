import { SEVERITY_META, type EsriLayerId, type TsunamiEvent } from '../types/tsunami';
import {
  formatCoordinates,
  formatLocalDateTime,
  getLocalTimeZoneLabel,
} from './formatters';

export type CardThemeStyle = 'ocean-dark' | 'editorial-light' | 'high-alert';

export interface Card45Options {
  themeStyle: CardThemeStyle;
  esriLayer: EsriLayerId;
  showPropagationRings: boolean;
  showSummary: boolean;
  customNote?: string;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '...';
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function renderEventCard45(
  canvas: HTMLCanvasElement,
  event: TsunamiEvent,
  options: Card45Options
): Promise<void> {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const sev = SEVERITY_META[event.severity];
  const isLight = options.themeStyle === 'editorial-light';
  const isAlertRed = options.themeStyle === 'high-alert';

  const bg = isLight ? '#F8FAFC' : isAlertRed ? '#12080A' : '#070B12';
  const panelBg = isLight ? '#FFFFFF' : isAlertRed ? '#1D0E12' : '#0F172A';
  const borderCol = isLight ? '#CBD5E1' : isAlertRed ? '#451A22' : '#1E293B';
  const textPrimary = isLight ? '#0F172A' : '#F8FAFC';
  const textSecondary = isLight ? '#475569' : '#94A3B8';

  // Canvas Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Top Severity Stripe
  ctx.fillStyle = sev.hex;
  ctx.fillRect(0, 0, CARD_WIDTH, 14);

  // Header Block
  const pad = 56;
  ctx.fillStyle = textSecondary;
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('TSUNAMI GUARD · BOLETÍN OCEANOGRÁFICO INTERNACIONAL', pad, 76);

  // Severity Label & Agency on top right
  ctx.fillStyle = sev.hex;
  ctx.font = '700 24px "JetBrains Mono", monospace';
  const sevBadgeText = `${sev.glyph} ${sev.label.toUpperCase()}`;
  const badgeWidth = ctx.measureText(sevBadgeText).width;
  ctx.fillText(sevBadgeText, CARD_WIDTH - pad - badgeWidth, 76);

  // Divider
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, 102);
  ctx.lineTo(CARD_WIDTH - pad, 102);
  ctx.stroke();

  // Event Headline
  ctx.fillStyle = textPrimary;
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  const titleLines = wrapTextLines(ctx, event.title, CARD_WIDTH - pad * 2, 2);
  let yCursor = 162;
  for (const line of titleLines) {
    ctx.fillText(line, pad, yCursor);
    yCursor += 54;
  }

  // Unboxed Metadata Row
  ctx.fillStyle = textSecondary;
  ctx.font = '500 22px "JetBrains Mono", monospace';
  const metaLine = `${event.agency}  ·  ${event.region}  ·  ${formatLocalDateTime(event.issuedAt)}`;
  ctx.fillText(metaLine, pad, yCursor + 8);

  // Map Viewport Box (Esri Tile Composite)
  const mapX = pad;
  const mapY = yCursor + 36;
  const mapW = CARD_WIDTH - pad * 2;
  const mapH = 490;

  ctx.save();
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 12);
  ctx.clip();

  // Base fallback ocean grid
  ctx.fillStyle = isLight ? '#DCE8F2' : '#0B1A2C';
  ctx.fillRect(mapX, mapY, mapW, mapH);

  // Load 3x3 Esri tiles centered on event
  const zoom = 5;
  const n = Math.pow(2, zoom);
  const exactX = lonToTileX(event.longitude, zoom);
  const exactY = latToTileY(Math.max(-80, Math.min(80, event.latitude)), zoom);
  const centerTileX = Math.floor(exactX);
  const centerTileY = Math.floor(exactY);
  const offsetX = (exactX - centerTileX) * 256;
  const offsetY = (exactY - centerTileY) * 256;
  const centerScreenX = mapX + mapW / 2;
  const centerScreenY = mapY + mapH / 2;

  const tilePromises: Promise<void>[] = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = (((centerTileX + dx) % n) + n) % n;
      const ty = centerTileY + dy;
      if (ty < 0 || ty >= n) continue;

      const drawX = centerScreenX - offsetX + dx * 256;
      const drawY = centerScreenY - offsetY + dy * 256;
      const directEsriPaths: Record<EsriLayerId, string> = {
        ocean: 'Ocean/World_Ocean_Base',
        imagery: 'World_Imagery',
        'dark-gray': 'Canvas/World_Dark_Gray_Base',
        'light-gray': 'Canvas/World_Light_Gray_Base',
        topo: 'World_Topo_Map',
        natgeo: 'NatGeo_World_Map',
      };
      const proxySrc = `api/map-tile/${options.esriLayer}/${zoom}/${ty}/${tx}`;
      const directSrc = `https://server.arcgisonline.com/ArcGIS/rest/services/${directEsriPaths[options.esriLayer]}/MapServer/tile/${zoom}/${ty}/${tx}`;

      tilePromises.push(
        loadImage(proxySrc)
          .then((img) => img ?? loadImage(directSrc))
          .then((img) => {
            if (img) {
              ctx.drawImage(img, drawX, drawY, 256, 256);
            }
          })
      );
    }
  }
  await Promise.all(tilePromises);

  // Subtle coordinate graticule overlay
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(248, 250, 252, 0.12)';
  ctx.lineWidth = 1;
  for (let gx = mapX + 120; gx < mapX + mapW; gx += 160) {
    ctx.beginPath();
    ctx.moveTo(gx, mapY);
    ctx.lineTo(gx, mapY + mapH);
    ctx.stroke();
  }
  for (let gy = mapY + 90; gy < mapY + mapH; gy += 120) {
    ctx.beginPath();
    ctx.moveTo(mapX, gy);
    ctx.lineTo(mapX + mapW, gy);
    ctx.stroke();
  }

  // Concentric Tsunami Propagation Rings
  if (options.showPropagationRings) {
    const radii = [62, 130, 205];
    radii.forEach((r, idx) => {
      ctx.beginPath();
      ctx.arc(centerScreenX, centerScreenY, r, 0, Math.PI * 2);
      ctx.strokeStyle = sev.hex;
      ctx.globalAlpha = 0.72 - idx * 0.2;
      ctx.lineWidth = idx === 0 ? 3 : 2;
      if (idx > 0) ctx.setLineDash([8, 6]);
      else ctx.setLineDash([]);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Epicenter Marker
  ctx.beginPath();
  ctx.arc(centerScreenX, centerScreenY, 16, 0, Math.PI * 2);
  ctx.fillStyle = sev.hex;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  // Map HUD overlay pill-free footer
  ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
  ctx.fillRect(mapX, mapY + mapH - 46, mapW, 46);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '500 19px "JetBrains Mono", monospace';
  ctx.fillText(
    `EPICENTRO: ${formatCoordinates(event.latitude, event.longitude)}`,
    mapX + 20,
    mapY + mapH - 16
  );
  ctx.fillStyle = '#94A3B8';
  const layerLabel = `CAPA ESRI: ${options.esriLayer.toUpperCase()}`;
  const layerW = ctx.measureText(layerLabel).width;
  ctx.fillText(layerLabel, mapX + mapW - layerW - 20, mapY + mapH - 16);
  ctx.restore();

  // Map frame border
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 12);
  ctx.stroke();

  // Telemetry 4-Column Metric Strip
  const gridY = mapY + mapH + 28;
  const colW = (mapW - 36) / 4;
  const metrics = [
    {
      label: 'MAGNITUD',
      value: event.magnitude !== null ? `${event.magnitude.toFixed(1)} ${event.magnitudeType || 'M'}` : 'N/D',
    },
    {
      label: 'PROFUNDIDAD',
      value: event.depthKm !== null ? `${event.depthKm.toFixed(1)} km` : 'Superficial',
    },
    {
      label: 'ESTADO TSUNAMI',
      value: event.tsunamiFlag ? 'EVALUACIÓN ACTIVA' : 'SIN AMENAZA',
    },
    {
      label: 'AGENCIA EMISORA',
      value: event.agency,
    },
  ];

  metrics.forEach((m, i) => {
    const bx = pad + i * (colW + 12);
    ctx.fillStyle = panelBg;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, bx, gridY, colW, 112, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textSecondary;
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(m.label, bx + 16, gridY + 34);

    ctx.fillStyle = i === 2 && event.tsunamiFlag ? sev.hex : textPrimary;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    const valLines = wrapTextLines(ctx, m.value, colW - 32, 2);
    ctx.fillText(valLines[0] || '', bx + 16, gridY + 78);
  });

  // Summary / Official Note Panel
  const summaryY = gridY + 136;
  const summaryH = CARD_HEIGHT - summaryY - 94;
  ctx.fillStyle = panelBg;
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, pad, summaryY, mapW, summaryH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textSecondary;
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `${event.bulletinType.toUpperCase()} · ${event.agencyFullName.toUpperCase()}`,
    pad + 24,
    summaryY + 38
  );

  if (options.showSummary) {
    const bodyText = options.customNote?.trim() ? options.customNote.trim() : event.summary;
    ctx.fillStyle = textPrimary;
    ctx.font = '400 23px "DM Sans", sans-serif';
    const bodyLines = wrapTextLines(ctx, bodyText, mapW - 48, 5);
    let sy = summaryY + 80;
    for (const line of bodyLines) {
      ctx.fillText(line, pad + 24, sy);
      sy += 34;
    }
  }

  // Footer Attribution
  ctx.fillStyle = textSecondary;
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `ZONA LOCAL: ${getLocalTimeZoneLabel()}  ·  ID: ${event.id.slice(0, 22)}`,
    pad,
    CARD_HEIGHT - 40
  );
  const brandRight = '4:5 TSUNAMI GUARD TELEMETRY';
  const brW = ctx.measureText(brandRight).width;
  ctx.fillText(brandRight, CARD_WIDTH - pad - brW, CARD_HEIGHT - 40);
}
