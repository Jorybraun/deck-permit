import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import { createProjectSnapshot, isProjectSnapshot, ProjectRepository } from './projectRepository';

const state: AppState = {
  step: 'land',
  steps: [{ id: 'land', title: 'Start', subtitle: 'Enter address', status: 'active' }],
  property: { address: null, parcel: null, zoning: null, buildableEnvelope: null, snowLoad: 1, buildings: [], evidence: [] },
  deck: null, compliance: [], planset: null, structuralReport: null, submissionReadiness: null, permitManifest: null, verificationEvidence: [], reviewExchange: null, professionalReviewCycles: [], drawingIssueHistory: [], permitSubmissionHistory: [], sidneyApplication: null, loading: false, error: null,
};

describe('ProjectRepository', () => {
  it('round-trips a versioned project snapshot', async () => {
    const repository = new ProjectRepository(indexedDB, 'deck-permit-test-snapshot');
    const snapshot = createProjectSnapshot(state);
    await repository.saveProject(snapshot);
    expect(await repository.loadProject()).toEqual(snapshot);
    expect(isProjectSnapshot(snapshot)).toBe(true);
    expect(isProjectSnapshot({ schema: 'wrong' })).toBe(false);
  });

  it('stores evidence bytes and removes orphaned files', async () => {
    const repository = new ProjectRepository(indexedDB, 'deck-permit-test-evidence');
    await repository.putEvidenceFile('keep', new Blob(['sealed'], { type: 'application/pdf' }), 'sealed.pdf');
    await repository.putEvidenceFile('remove', new Blob(['old'], { type: 'application/pdf' }), 'old.pdf');
    expect((await repository.getEvidenceFile('keep'))?.fileName).toBe('sealed.pdf');
    await repository.deleteOrphanedEvidenceFiles(new Set(['keep']));
    expect(await repository.listEvidenceFileIds()).toEqual(['keep']);
    expect(await repository.getEvidenceFile('remove')).toBeNull();
  });
});
