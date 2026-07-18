import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Property } from '../types';
import { assembleFixedVectorPdf, LEDGER_HEIGHT_POINTS, LEDGER_WIDTH_POINTS } from './vectorPlanPdf';

describe('fixed-size vector plan PDF assembly', () => {
  it('creates one complete vector-only 17×11 page for every drawing sheet', async () => {
    const property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [], existingConditions: null } satisfies Property;
    const blob = await assembleFixedVectorPdf(property, 9, (pdf, pageIndex) => {
      pdf.setDrawColor(20, 80, 55);
      pdf.setLineWidth(1.25);
      pdf.line(36, 36 + pageIndex, 360, 180 + pageIndex);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`VECTOR SHEET ${pageIndex + 1}`, 54, 72);
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);

    expect(blob.type).toBe('application/pdf');
    expect(pdf.getPageCount()).toBe(9);
    for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: LEDGER_WIDTH_POINTS, height: LEDGER_HEIGHT_POINTS });
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('/Subtype /Image');
  });

  it('rejects an invalid page count before creating a document', async () => {
    const property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [], existingConditions: null } satisfies Property;
    await expect(assembleFixedVectorPdf(property, 0, () => undefined)).rejects.toThrow('At least one vector drawing page');
  });
});
