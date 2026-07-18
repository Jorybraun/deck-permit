import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { PermitManifest, PlanSheet, Property } from '../types';

export const LEDGER_WIDTH_POINTS = 17 * 72;
export const LEDGER_HEIGHT_POINTS = 11 * 72;

type RenderVectorPage = (pdf: JsPdfDocument, pageIndex: number) => Promise<void> | void;

/**
 * Converts the canonical SVG sheets directly into PDF path and text operators.
 * No canvas, PNG, JPEG, or other raster intermediary is used.
 */
export async function buildVectorPlanPdf(property: Property, sheets: PlanSheet[], manifest?: PermitManifest | null): Promise<Blob> {
  if (!sheets.length) throw new Error('No drawing sheets are available.');
  const parsedSheets = sheets.map((sheet, index) => parseSheetSvg(sheet, index));
  const { svg2pdf } = await import('svg2pdf.js');
  try {
    return await assembleFixedVectorPdf(property, parsedSheets.length, async (pdf, pageIndex) => {
      const svg = parsedSheets[pageIndex];
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      // Keep the SVG paintable for svg2pdf while moving it outside the viewport.
      // `visibility:hidden` is inherited by the SVG and produces a valid but blank PDF.
      host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1700px;height:1100px;opacity:0;pointer-events:none';
      host.appendChild(svg);
      document.body.appendChild(host);
      try {
        await svg2pdf(svg, pdf, { x: 0, y: 0, width: LEDGER_WIDTH_POINTS, height: LEDGER_HEIGHT_POINTS, loadExternalStyleSheets: false });
      } finally {
        host.remove();
      }
    }, manifest);
  } finally {
    parsedSheets.forEach((sheet) => sheet.remove());
  }
}

/** Fixed-page vector assembly boundary; tests can supply a small vector renderer without a browser DOM. */
export async function assembleFixedVectorPdf(
  property: Property,
  pageCount: number,
  renderPage: RenderVectorPage,
  manifest?: PermitManifest | null,
): Promise<Blob> {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('At least one vector drawing page is required.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [LEDGER_WIDTH_POINTS, LEDGER_HEIGHT_POINTS],
    compress: true,
    precision: 4,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: `${property.address?.fullAddress || 'Deck'} — permit review drawings`,
    subject: `Professional review drawing issue Rev ${manifest?.revision || '—'} ${manifest?.designFingerprint || ''}`.trim(),
    author: 'Permitly',
    creator: 'Permitly vector drawing exporter',
    keywords: 'deck, permit, architectural drawings, professional review, vector PDF',
  });

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage([LEDGER_WIDTH_POINTS, LEDGER_HEIGHT_POINTS], 'landscape');
    await renderPage(pdf, pageIndex);
  }
  if (pdf.getNumberOfPages() !== pageCount) throw new Error(`PDF page count mismatch: expected ${pageCount}, generated ${pdf.getNumberOfPages()}.`);
  const buffer = pdf.output('arraybuffer');
  const blob = new Blob([buffer], { type: 'application/pdf' });
  if (blob.size < 1_000) throw new Error('The generated vector PDF is empty or invalid.');
  return blob;
}

function parseSheetSvg(sheet: PlanSheet, index: number): SVGSVGElement {
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') throw new Error('Vector drawing export requires a browser document.');
  const parsed = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
  const parseError = parsed.querySelector('parsererror');
  if (parsed.documentElement.nodeName.toLowerCase() !== 'svg' || parseError) {
    throw new Error(`Drawing sheet ${index + 1} is not valid SVG${parseError?.textContent ? `: ${parseError.textContent.replace(/\s+/g, ' ').slice(0, 180)}` : ''}.`);
  }
  const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  svg.setAttribute('width', '1700');
  svg.setAttribute('height', '1100');
  svg.setAttribute('viewBox', '0 0 1700 1100');
  return svg;
}

export async function downloadVectorPlanPdf(property: Property, sheets: PlanSheet[], manifest?: PermitManifest | null): Promise<void> {
  const blob = await buildVectorPlanPdf(property, sheets, manifest);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const civic = property.address?.civicNumber || 'project';
  const street = property.address?.streetName?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck';
  anchor.download = `deck-permit-drawings-${civic}-${street}-${manifest?.designFingerprint?.toLowerCase() || 'review'}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking in the same task can invalidate the blob before Chromium starts
  // consuming it, especially for a large multi-sheet drawing set.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
