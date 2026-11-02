import type { CreateServicePayload, CreateTransferPayload } from '../services/technicianApi';

const DATABASE_NAME = 'em-cuentas-offline';
const DATABASE_VERSION = 2;
const DRAFT_STORE = 'drafts';
const QUEUE_STORE = 'queue';
const CACHE_STORE = 'cache';

export class QueuedOfflineError extends Error {
  constructor() {
    super('La orden quedó guardada en este dispositivo y se sincronizará cuando vuelva la conexión.');
    this.name = 'QueuedOfflineError';
  }
}

export type ServiceDraft = {
  numeroOrden: string;
  marcaSeleccionada: string;
  tipoId: string;
  descripcion: string;
  desmontoPuertas: boolean;
  puertasDesmontadas: number;
  requiereAyudante: boolean;
  motivoAyudante: string;
  fotosPuertas: string[];
  fotosAyudante: string[];
};

export type PendingOperation = {
  id: string;
  userId: string;
  createdAt: string;
  kind: 'service' | 'transfer';
  servicePayload?: CreateServicePayload;
  transferPayload?: CreateTransferPayload;
  status: 'pending' | 'failed';
  error?: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'userId' });
      }
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queue.createIndex('userId', 'userId', { unique: false });
      }
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar en este dispositivo.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('No se pudo guardar en este dispositivo.'));
    };
  });
}

export async function getServiceDraft(userId: string): Promise<ServiceDraft | null> {
  const record = await runTransaction<{ userId: string; draft: ServiceDraft } | undefined>(
    DRAFT_STORE,
    'readonly',
    (store) => store.get(userId),
  );
  return record?.draft ?? null;
}

export async function saveServiceDraft(userId: string, draft: ServiceDraft): Promise<void> {
  await runTransaction(DRAFT_STORE, 'readwrite', (store) =>
    store.put({ userId, draft, updatedAt: new Date().toISOString() }),
  );
}

export async function clearServiceDraft(userId: string): Promise<void> {
  await runTransaction(DRAFT_STORE, 'readwrite', (store) => store.delete(userId));
}

export async function getPendingOperations(userId: string): Promise<PendingOperation[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE, 'readonly');
    const request = transaction.objectStore(QUEUE_STORE).index('userId').getAll(userId);
    request.onsuccess = () => {
      database.close();
      resolve((request.result as PendingOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('No se pudo leer la cola local.'));
    };
  });
}

export async function enqueueOperation(operation: PendingOperation): Promise<void> {
  await runTransaction(QUEUE_STORE, 'readwrite', (store) => store.put(operation));
}

export async function removePendingOperation(id: string): Promise<void> {
  await runTransaction(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function clearPendingOperations(userId: string): Promise<void> {
  const operations = await getPendingOperations(userId);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);
    operations.forEach((operation) => store.delete(operation.id));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('No se pudo limpiar la cola local.'));
    };
  });
}

export async function getCachedValue<T>(key: string): Promise<T | null> {
  const record = await runTransaction<{ key: string; value: T } | undefined>(
    CACHE_STORE,
    'readonly',
    (store) => store.get(key),
  );
  return record?.value ?? null;
}

export async function setCachedValue<T>(key: string, value: T): Promise<void> {
  await runTransaction(CACHE_STORE, 'readwrite', (store) =>
    store.put({ key, value, updatedAt: new Date().toISOString() }),
  );
}
