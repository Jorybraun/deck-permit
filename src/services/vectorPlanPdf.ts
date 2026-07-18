import type { PermitManifest, PlanSheet, Property } from '../types';

const LEDGER_WIDTH_POINTS = 17 * 72;
const LEDGER_HEIGHT_POINTS = 11 * 72;
const SHEET_WIDTH_PX = 2550;
const SHEET_HEIGHT_PX = 1650;

/**
 * Converts the coordinated SVG drawing set into one fixed-media-box 11×17 PDF.
 *
 * The sheets are rendered at 150 dpi before embedding. This deliberately avoids
 * browser print-layout and SVG-to-PDF conversion differences that can crop the
 * right-hand schedule or leave an oversized blank portrait page.
 */
export async function buildVectorPlanPdf(property: Property, sheets: PlanSheet[], manifest?: PermitManifest | null): Promise<Blob> {
  if (!sheets.length) throw new Error('No drawing sheets are available.');
  const renderedSheets: Uint8Array[] = [];
  for (let index = 0; index < sheets.length; index += 1) renderedSheets.push(await renderSheetPng(sheets[index], index));
  return assembleFixedPlanPdf(property, renderedSheets, manifest);
}

/** Pure PDF assembly boundary, exported so fixed page geometry can be regression tested without a canvas. */
export async function assembleFixedPlanPdf(property: Property, renderedSheets: Uint8Array[], manifest?: PermitManifest | null): Promise<Blob> {
  if (!renderedSheets.length) throw new Error('No rendered drawing sheets are available.');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${property.address?.fullAddress || 'Deck'} — permit review drawings`);
  pdf.setSubject(`Professional review drawing issue Rev ${manifest?.revision || '—'} ${manifest?.designFingerprint || ''}`.trim());
  pdf.setAuthor('Permitly');
  pdf.setCreator('Permitly fixed-size drawing exporter');
  pdf.setKeywords(['deck', 'permit', 'architectural drawings', 'professional review']);

  for (const pngBytes of renderedSheets) {
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([LEDGER_WIDTH_POINTS, LEDGER_HEIGHT_POINTS]);
    page.drawImage(image, { x: 0, y: 0, width: LEDGER_WIDTH_POINTS, height: LEDGER_HEIGHT_POINTS });
  }
  if (pdf.getPageCount() !== renderedSheets.length) throw new Error(`PDF page count mismatch: expected ${renderedSheets.length}, generated ${pdf.getPageCount()}.`);
  const bytes = await pdf.save({ useObjectStreams: true });
  const stableBytes = Uint8Array.from(bytes);
  const blob = new Blob([stableBytes.buffer], { type: 'application/pdf' });
  if (blob.size < 1_000) throw new Error('The generated PDF is empty or invalid.');
  return blob;
}

async function renderSheetPng(sheet: PlanSheet, index: number): Promise<Uint8Array> {
  const documentNode = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
  const parseError = documentNode.querySelector('parsererror');
  if (documentNode.documentElement.nodeName.toLowerCase() !== 'svg' || parseError) {
    throw new Error(`Drawing sheet ${index + 1} is not valid SVG${parseError?.textContent ? `: ${parseError.textContent.replace(/\s+/g, ' ').slice(0, 180)}` : ''}.`);
  }
  const source = new Blob([sheet.svg], { type: 'image/svg+xml;charset=utf-8' });
  const sourceUrl = URL.createObjectURL(source);
  try {
    const image = await loadImage(sourceUrl, index);
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_WIDTH_PX;
    canvas.height = SHEET_HEIGHT_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Drawing sheet ${index + 1} could not create a rendering surface.`);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error(`Drawing sheet ${index + 1} could not be rendered.`)), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(url: string, index: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Drawing sheet ${index + 1} could not be loaded for PDF export.`));
    image.src = url;
  });
}

export async function downloadVectorPlanPdf(property: Property, sheets: PlanSheet[], manifest?: PermitManifest | null): Promise<void> {
  const blob = await buildVectorPlanPdf(property, sheets, manifest);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const civic = property.address?.civicNumber || 'project';
  const street = property.address?.streetName?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck';
  anchor.download = `deck-permit-drawings-${civic}-${street}-${manifest?.designFingerprint?.toLowerCase() || 'review'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
