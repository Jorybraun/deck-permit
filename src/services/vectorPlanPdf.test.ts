import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { assembleFixedPlanPdf } from './vectorPlanPdf';
import type { Property } from '../types';

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('fixed-size plan PDF assembly', () => {
  it('creates one complete 17×11 landscape page for every drawing sheet', async () => {
    const png = Uint8Array.from(atob(TINY_PNG_BASE64), (character) => character.charCodeAt(0));
    const property = { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [], existingConditions: null } satisfies Property;
    const blob = await assembleFixedPlanPdf(property, [png, png, png]);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(pdf.getPageCount()).toBe(3);
    for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: 1224, height: 792 });
  });
});
