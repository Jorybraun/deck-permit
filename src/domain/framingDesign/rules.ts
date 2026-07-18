import type { FramingCodeProfile, FramingRuleSource } from './types';

export const CWC_DECK_GUIDE: FramingRuleSource = {
  id: 'cwc-deck-span-guide-2025-download',
  title: 'Canadian Wood Council Residential Prescriptive Exterior Wood Deck Span Guide',
  edition: 'Revision 1 © 2016; CWC publication page dated June 6, 2025',
  url: 'https://cwc.ca/publication/residential-prescriptive-exterior-wood-deck-span-guide/',
  scope: 'Preliminary screening of joist spans, built-up beam sizes, and supporting column sizes under the listed guide assumptions.',
  exclusions: ['Footings', 'Railings and guards', 'House attachment', 'Lateral bracing', 'Irregular or multi-span framing outside the tabulated configurations'],
};

const JOIST_SPANS = {
  'not-incised': [{ section: '38×89 (2×4)', spanMm: 1770 }, { section: '38×140 (2×6)', spanMm: 2780 }, { section: '38×184 (2×8)', spanMm: 3650 }, { section: '38×235 (2×10)', spanMm: 4620 }, { section: '38×286 (2×12)', spanMm: 5370 }],
  incised: [{ section: '38×89 (2×4)', spanMm: 1740 }, { section: '38×140 (2×6)', spanMm: 2730 }, { section: '38×184 (2×8)', spanMm: 3490 }, { section: '38×235 (2×10)', spanMm: 4260 }, { section: '38×286 (2×12)', spanMm: 4950 }],
} as const;

const BEAMS = {
  'not-incised': [{ maxJoistSpanMm: 2100, section: '1-38×140 (1-2×6)' }, { maxJoistSpanMm: 4300, section: '2-38×140 (2-2×6)' }, { maxJoistSpanMm: 4900, section: '2-38×184 (2-2×8)' }],
  incised: [{ maxJoistSpanMm: 1500, section: '1-38×140 (1-2×6)' }, { maxJoistSpanMm: 3300, section: '2-38×140 (2-2×6)' }, { maxJoistSpanMm: 4900, section: '2-38×184 (2-2×8)' }],
} as const;

export function selectPreliminarySections(spanMm: number, treatment: 'incised' | 'not-incised') {
  const joist = JOIST_SPANS[treatment].find((row) => row.spanMm >= spanMm);
  const beam = BEAMS[treatment].find((row) => row.maxJoistSpanMm >= spanMm);
  return { joistSection: joist?.section || 'Engineer design', joistMaxSpanMm: joist?.spanMm || null, beamSection: beam?.section || 'Engineer design' };
}

export function codeProfileForMunicipality(municipality: string): FramingCodeProfile {
  if (municipality.toLowerCase().includes('vancouver')) return {
    id: 'vbbl-2025', label: 'Vancouver Building By-law 2025 · By-law 14343', effectiveDate: '2025-09-15', jurisdiction: 'City of Vancouver',
    sourceUrl: 'https://vancouver.ca/your-government/vancouver-building-bylaw.aspx',
  };
  return {
    id: 'bcbc-2024', label: 'British Columbia Building Code 2024', effectiveDate: '2024-03-08', jurisdiction: municipality || 'British Columbia',
    sourceUrl: 'https://www2.gov.bc.ca/gov/content/industry/construction-industry/building-codes-standards/bc-codes/2024-bc-codes',
  };
}
