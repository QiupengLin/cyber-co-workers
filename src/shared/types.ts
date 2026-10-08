export type WorkerStatus = 'working' | 'idle' | 'waiting' | 'disconnected';
export interface WorkerSession {
  id: string;
  harness?: 'codex' | 'claude';
  title: string;
  project: string;
  source: 'desktop' | 'cli' | 'unknown';
  status: WorkerStatus;
  detail?: string;
  updatedAt: number;
  desk: number;
  focusUrl?: string;
}
export interface OfficeSnapshot {
  sessions: WorkerSession[];
  connected: boolean;
  message: string;
  demo: boolean;
}
export interface OfficeAPI {
  getSnapshot(): Promise<OfficeSnapshot>;
  onSnapshot(callback: (snapshot: OfficeSnapshot) => void): () => void;
  focusSession(id: string): Promise<{ok: boolean; message?: string}>;
  dismissSession(id: string): Promise<void>;
  setDemo(enabled: boolean): Promise<void>;
}
declare global { interface Window { office: OfficeAPI } }
