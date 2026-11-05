export type ReservationState = "reserved" | "committed" | "released";

export interface WalletSnapshot {
  resellerId: string;
  availableMinor: number;
  reservedMinor: number;
  spentMinor: number;
}

export interface ReservationRecord {
  id: string;
  resellerId: string;
  amountMinor: number;
  state: ReservationState;
  memo: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface LedgerEntry {
  id: string;
  resellerId: string;
  reservationId?: string;
  kind: "funding" | "reserve" | "commit" | "release" | "adjustment";
  amountMinor: number;
  memo: string;
  createdAt: number;
  idempotencyKey: string;
}