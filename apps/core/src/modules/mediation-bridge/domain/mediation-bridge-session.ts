import type { MediationBridgeTurn } from "./mediation-bridge-turn.ts";

export type Participant = {
  id: string;
  displayName: string;
};

export type MediationBridgeSessionStatus =
  | "awaiting_recipient_reply"
  | "awaiting_requester_reply"
  | "resolved_pending_close"
  | "stale_no_response"
  | "closed";

export type MediationBridgeSession = {
  sessionId: string;
  requester: Participant;
  recipient: Participant;
  status: MediationBridgeSessionStatus;
  turns: MediationBridgeTurn[];
  awaitingParticipantId: string;
  recipientIntroduced: boolean;
  createdAt: string;
  updatedAt: string;
  closeReason?: CloseReason;
};

export type CloseReason =
  | "explicit_done"
  | "cancelled_by_requester"
  | "safety_stop"
  | "timeout_after_resolved";