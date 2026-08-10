import { WebSocket } from 'ws';

export interface WorkerPhotoSavedEvent {
  type: 'PHOTO_SAVED';
  photoId: string;
  stepId: string;
  slotIndex: number;
  photoUrl: string;
  manualOverride: boolean;
  aiQualityStatus: string;
  message: string;
}

export interface WorkerPhotoReceivedEvent {
  type: 'PHOTO_RECEIVED';
  stepId: string;
  slotIndex: number;
  message: string;
}

export interface WorkerAnalysisQueuedEvent {
  type: 'ANALYSIS_QUEUED';
  photoId: string;
  stepId: string;
  slotIndex: number;
  message: string;
}

export interface WorkerAnalysisCompletedEvent {
  type: 'ANALYSIS_COMPLETED';
  photoId: string;
  stepId: string;
  slotIndex: number;
  summaryText: string;
  resultJson: Record<string, unknown>;
  message: string;
}

export interface WorkerAnalysisFailedEvent {
  type: 'ANALYSIS_FAILED';
  photoId: string;
  stepId: string;
  slotIndex: number;
  message: string;
}

export interface WorkerPhotoQualityResultEvent {
  type: 'PHOTO_QUALITY_RESULT';
  photoId: string;
  stepId: string;
  slotIndex: number;
  photoUrl: string;
  status: 'APPROVED' | 'REJECTED' | 'UNAVAILABLE';
  message: string;
  manualOverrideAvailable?: boolean;
}

export type WorkerSessionEvent =
  | WorkerPhotoSavedEvent
  | WorkerPhotoReceivedEvent
  | WorkerAnalysisQueuedEvent
  | WorkerAnalysisCompletedEvent
  | WorkerAnalysisFailedEvent
  | WorkerPhotoQualityResultEvent
  | { type: 'READY' };

export class WorkerSessionRealtime {
  private readonly socketsByJobId = new Map<string, Set<WebSocket>>();

  add(jobId: string, socket: WebSocket) {
    const sockets = this.socketsByJobId.get(jobId) || new Set<WebSocket>();
    sockets.add(socket);
    this.socketsByJobId.set(jobId, sockets);

    socket.once('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) this.socketsByJobId.delete(jobId);
    });
  }

  publish(jobId: string, event: WorkerSessionEvent) {
    const payload = JSON.stringify(event);
    this.socketsByJobId.get(jobId)?.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    });
  }
}

export const workerSessionRealtime = new WorkerSessionRealtime();
