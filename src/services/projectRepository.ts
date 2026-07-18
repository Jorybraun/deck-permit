import type { AppState, ComplianceIssue, Deck, DrawingIssueRecord, PermitManifest, PermitSubmissionRecord, PlanSheet, ProfessionalReviewCycle, Property, ReviewExchangePublication, SidneyApplicationData, Step, StepId, StructuralReport, SubmissionReadiness, VerificationEvidence } from '../types';

export const PROJECT_SNAPSHOT_SCHEMA = 'deck-permit-project/v1' as const;

export interface PersistedProjectState {
  step: StepId;
  steps: Step[];
  property: Property;
  deck: Deck | null;
  compliance: ComplianceIssue[];
  planset: PlanSheet[] | null;
  structuralReport: StructuralReport | null;
  submissionReadiness: SubmissionReadiness | null;
  permitManifest: PermitManifest | null;
  verificationEvidence: VerificationEvidence[];
  reviewExchange: ReviewExchangePublication | null;
  professionalReviewCycles: ProfessionalReviewCycle[];
  drawingIssueHistory: DrawingIssueRecord[];
  permitSubmissionHistory: PermitSubmissionRecord[];
  sidneyApplication: SidneyApplicationData | null;
}

export interface ProjectSnapshot {
  schema: typeof PROJECT_SNAPSHOT_SCHEMA;
  savedAt: string;
  state: PersistedProjectState;
}

export interface StoredEvidenceFile {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  blob: Blob;
}

export interface StoredCaptureFile {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  blob: Blob;
}

export function createProjectSnapshot(state: AppState): ProjectSnapshot {
  return {
    schema: PROJECT_SNAPSHOT_SCHEMA,
    savedAt: new Date().toISOString(),
    state: {
      step: state.step,
      steps: state.steps,
      property: state.property,
      deck: state.deck,
      compliance: state.compliance,
      planset: state.planset,
      structuralReport: state.structuralReport,
      submissionReadiness: state.submissionReadiness,
      permitManifest: state.permitManifest,
      verificationEvidence: state.verificationEvidence,
      reviewExchange: state.reviewExchange,
      professionalReviewCycles: state.professionalReviewCycles,
      drawingIssueHistory: state.drawingIssueHistory,
      permitSubmissionHistory: state.permitSubmissionHistory,
      sidneyApplication: state.sidneyApplication,
    },
  };
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ProjectSnapshot>;
  const state = snapshot.state as Partial<PersistedProjectState> | undefined;
  return snapshot.schema === PROJECT_SNAPSHOT_SCHEMA
    && typeof snapshot.savedAt === 'string'
    && !!state
    && typeof state.step === 'string'
    && Array.isArray(state.steps)
    && !!state.property
    && Array.isArray(state.compliance)
    && Array.isArray(state.verificationEvidence)
    && (state.reviewExchange === undefined || state.reviewExchange === null || typeof state.reviewExchange === 'object')
    && (state.professionalReviewCycles === undefined || Array.isArray(state.professionalReviewCycles))
    && (state.drawingIssueHistory === undefined || Array.isArray(state.drawingIssueHistory))
    && (state.permitSubmissionHistory === undefined || Array.isArray(state.permitSubmissionHistory))
    && (state.sidneyApplication === undefined || state.sidneyApplication === null || typeof state.sidneyApplication === 'object');
}

export class ProjectRepository {
  private database: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseFactory?: IDBFactory,
    private readonly databaseName = 'deck-permit-workspace',
  ) {}

  async loadProject(): Promise<ProjectSnapshot | null> {
    const value = await this.request('project-snapshots', 'readonly', (store) => store.get('active'));
    return isProjectSnapshot(value) ? value : null;
  }

  async saveProject(snapshot: ProjectSnapshot): Promise<void> {
    await this.request('project-snapshots', 'readwrite', (store) => store.put(snapshot, 'active'));
  }

  async putEvidenceFile(id: string, file: Blob, fileName: string): Promise<void> {
    const record: StoredEvidenceFile = { id, fileName, mimeType: file.type || 'application/pdf', byteSize: file.size, blob: file };
    await this.request('evidence-files', 'readwrite', (store) => store.put(record, id));
  }

  async getEvidenceFile(id: string): Promise<StoredEvidenceFile | null> {
    const value = await this.request('evidence-files', 'readonly', (store) => store.get(id));
    return value && typeof value === 'object' ? value as StoredEvidenceFile : null;
  }

  async deleteEvidenceFile(id: string): Promise<void> {
    await this.request('evidence-files', 'readwrite', (store) => store.delete(id));
  }

  async listEvidenceFileIds(): Promise<string[]> {
    const value = await this.request('evidence-files', 'readonly', (store) => store.getAllKeys());
    return (value as IDBValidKey[]).map(String);
  }

  async deleteOrphanedEvidenceFiles(keptIds: Set<string>): Promise<void> {
    const ids = await this.listEvidenceFileIds();
    await Promise.all(ids.filter((id) => !keptIds.has(id)).map((id) => this.deleteEvidenceFile(id)));
  }

  async putCaptureFile(id: string, file: Blob, fileName: string): Promise<void> {
    const record: StoredCaptureFile = { id, fileName, mimeType: file.type || 'application/octet-stream', byteSize: file.size, blob: file };
    await this.request('capture-files', 'readwrite', (store) => store.put(record, id));
  }

  async getCaptureFile(id: string): Promise<StoredCaptureFile | null> {
    const value = await this.request('capture-files', 'readonly', (store) => store.get(id));
    return value && typeof value === 'object' ? value as StoredCaptureFile : null;
  }

  async deleteCaptureFile(id: string): Promise<void> {
    await this.request('capture-files', 'readwrite', (store) => store.delete(id));
  }

  private async open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    const databaseFactory = this.databaseFactory || globalThis.indexedDB;
    if (!databaseFactory) throw new Error('IndexedDB is unavailable in this browser.');
    this.database = new Promise((resolve, reject) => {
      const request = databaseFactory.open(this.databaseName, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('project-snapshots')) request.result.createObjectStore('project-snapshots');
        if (!request.result.objectStoreNames.contains('evidence-files')) request.result.createObjectStore('evidence-files');
        if (!request.result.objectStoreNames.contains('capture-files')) request.result.createObjectStore('capture-files');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the project database.'));
      request.onblocked = () => reject(new Error('Project storage is blocked by another browser tab.'));
    });
    return this.database;
  }

  private async request(storeName: 'project-snapshots' | 'evidence-files' | 'capture-files', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error(`Project storage operation failed for ${storeName}.`));
      transaction.onabort = () => reject(transaction.error || new Error(`Project storage transaction was aborted for ${storeName}.`));
    });
  }
}
