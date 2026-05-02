import type { OutboundDraft } from "./outbound-draft.ts";

export type MediationBridgeTurn = {
  turnId: string;
  fromParticipantId: string;
  toParticipantId: string;
  originalText: string;
  outboundDraft: OutboundDraft;
  createdAt: string;
};