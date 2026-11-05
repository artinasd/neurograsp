import type { PasarGuardUserSnapshot } from "@/lib/panels/pasarguard";

export type OperationState = "queued" | "provisioning" | "partial" | "uncertain" | "completed" | "failed" | "reconciling";
export type PanelOperationState = "queued" | "in_flight" | "confirmed" | "failed" | "uncertain" | "needs_review";

export type ProvisioningOperation = {
  id: string;
  idempotencyKey: string;
  username: string;
  snapshot: PasarGuardUserSnapshot;
  panelIds: string[];
  state: OperationState;
  createdAt: number;
  updatedAt: number;
  reservationId?: string;
  results: Record<string, PanelOperationResult>;
};

export type PanelOperationResult = {
  panelId: string;
  state: PanelOperationState;
  attemptCount: number;
  startedAt?: number;
  updatedAt: number;
  remoteId?: string;
  remoteUsername?: string;
  evidence?: string;
  errorCode?: string;
};
