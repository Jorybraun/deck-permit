import type { Deck, DrawingIssueRecord, PlanSheet, Property } from '../types';
import { computeDesignFingerprint } from './designFingerprint';

const SHEET_IDS: PlanSheet['id'][] = ['cover', 'site', 'framing', 'elevations', 'sections', 'details', 'calculations'];

/** Creates or reuses a controlled drawing issue for the exact parametric design state. */
export function resolveDrawingIssue(
  property: Property,
  deck: Deck,
  history: DrawingIssueRecord[],
  issuedAt = new Date().toISOString(),
): { issue: DrawingIssueRecord; history: DrawingIssueRecord[] } {
  const designFingerprint = computeDesignFingerprint(property, deck);
  const existing = history.find((record) => record.designFingerprint === designFingerprint);
  if (existing) return { issue: existing, history };

  const prior = [...history].sort((a, b) => b.revision - a.revision)[0];
  const revision = (prior?.revision || 0) + 1;
  const issue: DrawingIssueRecord = {
    id: `ISSUE-${String(revision).padStart(2, '0')}-${designFingerprint}`,
    revision,
    designFingerprint,
    issuedAt,
    purpose: 'professional-review',
    description: revision === 1 ? 'Initial issue for professional review' : 'Revised issue for professional review',
    sheetIds: [...SHEET_IDS],
    supersedesDesignFingerprint: prior?.designFingerprint,
  };
  return { issue, history: [...history, issue].sort((a, b) => a.revision - b.revision) };
}

export function formatRevision(revision: number): string {
  return `REV ${String(revision).padStart(2, '0')}`;
}
