import type { StructuralTableSelection } from '../types';

export const CWC_DECK_GUIDE_URL = 'https://cwc.ca/wp-content/uploads/2019/03/Prescriptive-Residential-Exterior-Wood-Deck-Span-Guide.pdf';
export const CWC_DECK_GUIDE_TITLE = 'Canadian Wood Council Residential Prescriptive Exterior Wood Deck Span Guide';

export interface CwcFramingInput {
  joistSpanM: number;
  joistSpacingMm: 400;
  speciesGroup: 'S-P-F';
  grade: 'No.2 or better';
  treatment: 'incised' | 'not-incised';
  postSpacingM: 1.8;
  heightAboveGradeM: number;
  guardRequired: boolean;
  attachedSingleSpan: boolean;
  rectangular: boolean;
  snowLoadKpa: number;
}

export interface CwcFramingSelection {
  joistSize: string;
  beamSize: string;
  postSize: string;
  selection: StructuralTableSelection;
}

const JOIST_SPANS_400_SPF = {
  'not-incised': [
    { size: '2x4', spanM: 1.77 },
    { size: '2x6', spanM: 2.78 },
    { size: '2x8', spanM: 3.65 },
    { size: '2x10', spanM: 4.62 },
    { size: '2x12', spanM: 5.37 },
  ],
  incised: [
    { size: '2x4', spanM: 1.74 },
    { size: '2x6', spanM: 2.73 },
    { size: '2x8', spanM: 3.49 },
    { size: '2x10', spanM: 4.26 },
    { size: '2x12', spanM: 4.95 },
  ],
} as const;

// Table 5a, S-P-F, 1.8 m post spacing, incised, supporting one joist span.
const INCISED_BEAM_1_8_SPF = [
  { spanM: 1.2, beam: '1-2x6' },
  { spanM: 1.5, beam: '1-2x6' },
  { spanM: 1.8, beam: '2-2x6' },
  { spanM: 2.1, beam: '2-2x6' },
  { spanM: 2.4, beam: '2-2x6' },
  { spanM: 2.7, beam: '2-2x6' },
  { spanM: 3.0, beam: '2-2x6' },
  { spanM: 3.3, beam: '2-2x6' },
  { spanM: 3.7, beam: '2-2x8' },
  { spanM: 4.0, beam: '2-2x8' },
  { spanM: 4.3, beam: '2-2x8' },
  { spanM: 4.6, beam: '2-2x8' },
  { spanM: 4.9, beam: '2-2x8' },
] as const;

// Table 4a, S-P-F, 1.8 m post spacing, not incised, supporting one joist span.
const NOT_INCISED_BEAM_1_8_SPF = [
  { spanM: 1.2, beam: '1-2x6' },
  { spanM: 1.5, beam: '1-2x6' },
  { spanM: 1.8, beam: '1-2x6' },
  { spanM: 2.1, beam: '1-2x6' },
  { spanM: 2.4, beam: '2-2x6' },
  { spanM: 2.7, beam: '2-2x6' },
  { spanM: 3.0, beam: '2-2x6' },
  { spanM: 3.3, beam: '2-2x6' },
  { spanM: 3.7, beam: '2-2x6' },
  { spanM: 4.0, beam: '2-2x6' },
  { spanM: 4.3, beam: '2-2x6' },
  { spanM: 4.6, beam: '2-2x8' },
  { spanM: 4.9, beam: '2-2x8' },
] as const;

/**
 * Selects framing only inside the published CWC table scope.
 * Footings, guards, house attachment, and lateral bracing are intentionally excluded.
 */
export function selectCwcFraming(input: CwcFramingInput): CwcFramingSelection {
  const joistTable = input.treatment === 'incised' ? 'Table 3a' : 'Table 2a';
  const beamTable = input.treatment === 'incised' ? 'Table 5a' : 'Table 4a';
  const common = {
    sourceTitle: CWC_DECK_GUIDE_TITLE,
    sourceUrl: CWC_DECK_GUIDE_URL,
    sourceEdition: 'Revision 1 © 2016; current CWC download page dated June 6, 2025',
    joistTable,
    beamTable,
    assumptions: [
      'S-P-F, No.2 or better, wet service',
      '400 mm joist spacing; 1.8 m post spacing',
      '1.9 kPa live load plus 0.5 kPa dead load',
      `${input.treatment === 'incised' ? 'Incised' : 'Not-incised'} lumber table`,
      'Single joist span supported by the selected beam',
    ],
    exclusions: ['Footings', 'Guards and railings', 'Attachment to the house', 'Lateral bracing'],
  };
  const unsupportedReason = getUnsupportedReason(input);
  const joistRows = JOIST_SPANS_400_SPF[input.treatment];
  const minimumIndex = input.guardRequired ? 2 : 0;
  const joist = joistRows.find((row, index) => index >= minimumIndex && row.spanM >= input.joistSpanM);
  const beamRows = input.treatment === 'incised' ? INCISED_BEAM_1_8_SPF : NOT_INCISED_BEAM_1_8_SPF;
  const beam = beamRows.find((row) => row.spanM >= input.joistSpanM);

  if (unsupportedReason || !joist || !beam) {
    return {
      joistSize: joist?.size || '2x12',
      beamSize: beam?.beam || 'ENGINEER DESIGN',
      postSize: '6x6',
      selection: {
        ...common,
        status: 'engineering-required',
        joistMaxSpanM: joist?.spanM || null,
        beamLookupSpanM: beam?.spanM || null,
        reason: unsupportedReason || `The ${input.joistSpanM.toFixed(2)} m span exceeds the available table rows.`,
      },
    };
  }

  return {
    joistSize: joist.size,
    beamSize: beam.beam,
    postSize: input.heightAboveGradeM <= 2 && !beam.beam.startsWith('3-') ? '4x4' : '6x6',
    selection: {
      ...common,
      status: 'table-supported',
      joistMaxSpanM: joist.spanM,
      beamLookupSpanM: beam.spanM,
    },
  };
}

function getUnsupportedReason(input: CwcFramingInput): string | undefined {
  if (!input.rectangular) return 'The current table selector supports rectangular decks only.';
  if (!input.attachedSingleSpan) return 'The modeled support layout is not a single attached joist span represented by the selected beam table.';
  if (input.snowLoadKpa > 1.9) return `Site snow load ${input.snowLoadKpa.toFixed(2)} kPa exceeds the guide's 1.9 kPa live-load basis; engineering verification is required.`;
  return undefined;
}
