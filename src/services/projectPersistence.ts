import { useStore } from '../state/store';
import { createProjectSnapshot, ProjectRepository } from './projectRepository';
import type { StoredEvidenceFile } from './projectRepository';

const repository = new ProjectRepository();
let initialized = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initializeProjectPersistence(): Promise<void> {
  if (initialized) return;
  initialized = true;
  useStore.setState({ persistenceStatus: 'loading' });
  try {
    const snapshot = await repository.loadProject();
    if (snapshot) useStore.setState({ ...snapshot.state, professionalReviewCycles: snapshot.state.professionalReviewCycles || [], drawingIssueHistory: snapshot.state.drawingIssueHistory || [], permitSubmissionHistory: snapshot.state.permitSubmissionHistory || [], lastSavedAt: snapshot.savedAt });
    useStore.setState({ persistenceStatus: 'saved' });
  } catch {
    useStore.setState({ persistenceStatus: 'error' });
  }

  useStore.subscribe((state, previous) => {
    const persistedStateChanged = state.step !== previous.step
      || state.steps !== previous.steps
      || state.property !== previous.property
      || state.deck !== previous.deck
      || state.compliance !== previous.compliance
      || state.planset !== previous.planset
      || state.structuralReport !== previous.structuralReport
      || state.submissionReadiness !== previous.submissionReadiness
      || state.permitManifest !== previous.permitManifest
      || state.verificationEvidence !== previous.verificationEvidence
      || state.reviewExchange !== previous.reviewExchange
      || state.professionalReviewCycles !== previous.professionalReviewCycles
      || state.drawingIssueHistory !== previous.drawingIssueHistory
      || state.permitSubmissionHistory !== previous.permitSubmissionHistory
      || state.sidneyApplication !== previous.sidneyApplication;
    if (!persistedStateChanged) return;
    const previousIds = new Set(previous.verificationEvidence.map((item) => item.id));
    const currentIds = new Set(state.verificationEvidence.map((item) => item.id));
    const removedIds = [...previousIds].filter((id) => !currentIds.has(id));
    removedIds.forEach((id) => void repository.deleteEvidenceFile(id));

    if (saveTimer) clearTimeout(saveTimer);
    useStore.setState({ persistenceStatus: 'saving' });
    saveTimer = setTimeout(async () => {
      try {
        const snapshot = createProjectSnapshot(useStore.getState());
        await repository.saveProject(snapshot);
        await repository.deleteOrphanedEvidenceFiles(new Set(snapshot.state.verificationEvidence.map((item) => item.id)));
        useStore.setState({ persistenceStatus: 'saved', lastSavedAt: snapshot.savedAt });
      } catch {
        useStore.setState({ persistenceStatus: 'error' });
      }
    }, 250);
  });
}

export async function saveEvidenceFile(id: string, file: File): Promise<void> {
  await repository.putEvidenceFile(id, file, file.name);
}

export async function downloadEvidenceFile(id: string, fallbackName: string): Promise<boolean> {
  const record = await repository.getEvidenceFile(id);
  if (!record) return false;
  const url = URL.createObjectURL(record.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = record.fileName || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function removeEvidenceFile(id: string): Promise<void> {
  await repository.deleteEvidenceFile(id);
}

export async function loadEvidenceFile(id: string): Promise<StoredEvidenceFile | null> {
  return repository.getEvidenceFile(id);
}
