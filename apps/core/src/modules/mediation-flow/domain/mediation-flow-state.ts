/**
 * T32 — Mediation flow domain types.
 *
 * Defines the state machine for mediation clarification and confirmation
 * flows. All types are readonly to prevent accidental mutation.
 *
 * Module isolation: this file imports ONLY from within the mediation-flow
 * module or from TypeScript built-ins. No cross-module domain imports.
 */

/** Current phase of the mediation flow. */
export type MediationFlowStatus = "idle" | "clarifying" | "confirming" | "paused" | "resolved";

/** What the system is waiting for from the user. */
export type PendingAction =
  | "clarify_recipient"
  | "clarify_message"
  | "clarify_both"
  | "confirm_mediation"
  | "edit_mediation"
  | "cancel_mediation";

/** Which fields are still missing from the mediation request. */
export type MissingMediationField = "recipient" | "message" | "confirmation";

/** The draft message being built during the flow. */
export type MediationDraft = {
  readonly id: string;
  readonly conversationId: string;
  readonly requesterPersonId: string;
  readonly recipientHint: string | null;
  readonly messageDraft: string | null;
  readonly sourceMessageId: string;
  readonly sourceText: string;
  readonly version: number;
  readonly status: "draft" | "confirmed" | "sent" | "cancelled";
};

/** A clarification question asked to the user. */
export type ClarificationQuestion = {
  readonly questionText: string;
  readonly fieldRequested: MissingMediationField;
  readonly relatedDraftId: string;
};

/** Complete flow state for a single conversation. */
export type MediationFlowState = {
  readonly conversationId: string;
  readonly personId: string;
  readonly status: MediationFlowStatus;
  readonly draft: MediationDraft | null;
  readonly pendingAction: PendingAction | null;
  readonly missingFields: readonly MissingMediationField[];
  readonly lastQuestion: ClarificationQuestion | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
