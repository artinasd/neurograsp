import { PanelHttpError, PanelUncertainError, createPasarGuardUser, findExactPasarGuardUser, type PasarGuardUserSnapshot } from "@/lib/panels/pasarguard";
import { commitReservation, releaseReservation } from "@/lib/ledger/wallet";
import { getOperation, setOperationState, updatePanelResult } from "@/lib/provisioning/store";
import type { PanelOperationResult, ProvisioningOperation } from "@/lib/provisioning/types";

function matchesSnapshot(remote: Record<string, unknown>, intended: PasarGuardUserSnapshot): boolean {
  const remoteLimit = Number(remote.data_limit ?? remote.dataLimit ?? 0);
  const remoteExpire = typeof remote.expire === "string" ? Date.parse(remote.expire) / 1000 : Number(remote.expire ?? 0);
  const remoteStatus = String(remote.status ?? "");
  return remote.username === intended.username &&
    remoteLimit === intended.dataLimitBytes &&
    Math.floor(remoteExpire) === intended.expireAt &&
    remoteStatus.toLowerCase() === intended.status;
}

export async function runProvisioningOperation(operationId: string): Promise<ProvisioningOperation> {
  let operation = await getOperation(operationId);
  if (!operation) throw new Error("Provisioning operation not found.");
  if (operation.state === "completed" || operation.state === "failed") return operation;
  operation = await setOperationState(operationId, "provisioning");

  for (const panelId of operation.panelIds) {
    const prior = operation.results[panelId];
    if (prior?.state === "confirmed") continue;
    const startedAt = Date.now();
    const result: PanelOperationResult = { panelId, state: "in_flight", attemptCount: (prior?.attemptCount ?? 0) + 1, startedAt, updatedAt: startedAt };
    operation = await updatePanelResult(operationId, result, "provisioning");
    try {
      // Always inspect exact username before create. This is also the recovery path
      // after a timed-out mutation: never blindly replay the create request.
      const existing = await findExactPasarGuardUser(panelId, operation.username);
      if (existing) {
        if (matchesSnapshot(existing, operation.snapshot)) {
          operation = await updatePanelResult(operationId, { ...result, state: "confirmed", updatedAt: Date.now(), remoteId: String(existing.id), remoteUsername: operation.username, evidence: "Exact username and intended quota/expiry/status verified on remote panel." }, "provisioning");
          continue;
        }
        operation = await updatePanelResult(operationId, { ...result, state: "needs_review", updatedAt: Date.now(), remoteId: String(existing.id), evidence: "An existing exact-username user differs from the intended snapshot; no overwrite was attempted." }, "partial");
        continue;
      }

      await createPasarGuardUser(panelId, operation.snapshot);
      const verified = await findExactPasarGuardUser(panelId, operation.username);
      if (!verified || !matchesSnapshot(verified, operation.snapshot)) {
        operation = await updatePanelResult(operationId, { ...result, state: "uncertain", updatedAt: Date.now(), evidence: "Create returned, but exact remote fields could not be verified." }, "uncertain");
        continue;
      }
      operation = await updatePanelResult(operationId, { ...result, state: "confirmed", updatedAt: Date.now(), remoteId: String(verified.id), remoteUsername: operation.username, evidence: "Remote user verified after create." }, "provisioning");
    } catch (error) {
      const uncertainHttp = error instanceof PanelHttpError && error.status >= 500;
      const ambiguous = error instanceof PanelUncertainError || uncertainHttp || !(error instanceof PanelHttpError);
      const state = ambiguous ? "uncertain" : "failed";
      operation = await updatePanelResult(operationId, {
        ...result, state, updatedAt: Date.now(),
        errorCode: error instanceof PanelHttpError ? "HTTP_" + error.status : "TRANSPORT_OR_VERIFY_ERROR",
        evidence: error instanceof Error ? error.message.slice(0, 300) : "Unknown error"
      }, ambiguous ? "uncertain" : "partial");
    }
  }

  const states = Object.values(operation.results).map(result => result.state);
  if (states.length && states.every(state => state === "confirmed")) {
    operation = await setOperationState(operationId, "completed");
    if (operation.reservationId) await commitReservation(operation.reservationId, "operation:" + operation.id + ":commit");
    return operation;
  }
  if (states.length && states.every(state => state === "failed")) {
    operation = await setOperationState(operationId, "failed");
    if (operation.reservationId) await releaseReservation(operation.reservationId, "operation:" + operation.id + ":release");
    return operation;
  }
  if (states.some(state => state === "uncertain" || state === "in_flight")) return setOperationState(operationId, "uncertain");
  return setOperationState(operationId, "partial");
}
