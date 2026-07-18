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

/** Owns private binary evidence. Canonical project metadata is persisted separately. */
export class PrivateFileVault {
  private database: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseFactory?: IDBFactory,
    private readonly databaseName = 'deck-permit-workspace',
  ) {}

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
        if (!request.result.objectStoreNames.contains('evidence-files')) request.result.createObjectStore('evidence-files');
        if (!request.result.objectStoreNames.contains('capture-files')) request.result.createObjectStore('capture-files');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the project database.'));
      request.onblocked = () => reject(new Error('Project storage is blocked by another browser tab.'));
    });
    return this.database;
  }

  private async request(storeName: 'evidence-files' | 'capture-files', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
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
