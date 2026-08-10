import { WorkerSessionEvent } from './workerRealtime.js';

export const WORKER_SESSION_EVENT_CHANNEL = 'worker_session_events';

export interface RealtimeQueryClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export interface RealtimeListenClient {
  on(event: 'notification', handler: (message: { channel: string; payload?: string }) => void): unknown;
  on(event: 'error', handler: (error: Error) => void): unknown;
  connect(): Promise<unknown>;
  query(text: string): Promise<unknown>;
  end(): Promise<unknown>;
}

export interface RealtimeRelayOptions {
  createClient: () => RealtimeListenClient;
  onEvent: (jobId: string, event: WorkerSessionEvent) => void;
  reconnectDelayMs?: number;
}

export interface RealtimeRelayHandle {
  stop: () => Promise<void>;
}

export async function publishWorkerSessionEvent(client: RealtimeQueryClient, jobId: string, event: WorkerSessionEvent): Promise<void> {
  await client.query(`SELECT pg_notify($1, $2)`, [WORKER_SESSION_EVENT_CHANNEL, JSON.stringify({ jobId, event })]);
}

export function startRealtimeRelay(options: RealtimeRelayOptions): Promise<RealtimeRelayHandle> {
  const { createClient, onEvent, reconnectDelayMs = 10_000 } = options;
  const state = {
    stopped: false,
    client: null as RealtimeListenClient | null,
    stop: async () => {
      state.stopped = true;
      if (state.client) await state.client.end();
    },
  };

  const connect = async () => {
    if (state.stopped) return;
    const client = createClient();
    state.client = client;
    client.on('notification', (message) => {
      if (message.channel !== WORKER_SESSION_EVENT_CHANNEL) return;
      try {
        const parsed = JSON.parse(String(message.payload || '{}')) as { jobId?: unknown; event?: unknown };
        if (typeof parsed.jobId === 'string' && parsed.event && typeof parsed.event === 'object') {
          onEvent(parsed.jobId, parsed.event as WorkerSessionEvent);
        }
      } catch {
        // Ignore malformed payloads; other subscribers own their own parsing.
      }
    });
    client.on('error', (error) => {
      console.error('Worker session realtime relay connection lost; reconnecting.', error);
      if (state.stopped) return;
      if (state.client === client) state.client = null;
      setTimeout(() => void connect(), reconnectDelayMs);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${WORKER_SESSION_EVENT_CHANNEL}`);
    } catch (error) {
      console.error('Worker session realtime relay connection failed; retrying later.', error);
      if (state.stopped) return;
      setTimeout(() => void connect(), reconnectDelayMs);
    }
  };

  return connect().then(() => ({ stop: state.stop }));
}
