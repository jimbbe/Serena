/**
 * T20 — Response types for the channel-agnostic inbound pipeline.
 */

import type { InboundChannel } from "./inbound-message-command.ts";
import type { InboundDecision } from "./inbound-decision.ts";
import type { LlmProfileId } from "./llm-profile.ts";
import type { GuideUseCaseId } from "../../ai-guide/domain/guide-use-case-id.ts";
import type { GuideResult } from "../../ai-guide/domain/guide-result.ts";

/**
 * Simulated outbound draft included in the simulation result when
 * mediation is involved.  Mirrors {@link OutboundDraft} but is embedded
 * directly in the channel result for convenience.
 */
export type SimulatedOutbound = {
  /** Channel the outbound message would be sent through. */
  channel: InboundChannel;
  /** Tenant identifier. */
  tenantId: string;
  /** External identifier of the recipient. */
  toExternalId: string;
  /** Outbound message text. */
  text: string;
  /** Whether the message requires manual approval before sending. */
  requiresApproval?: boolean;
  /** Reason for requiring approval, if applicable. */
  reason?: string;
  /** Additional channel-specific metadata. */
  metadata?: Record<string, unknown>;
};

/**
 * Structured result returned by {@link ProcessChannelInboundMessage}.
 * Contains the full trace of the inbound pipeline execution:
 * decision → profile → AI guide result (or error).
 */
export type ChannelInboundResult = {
  /** Correlation ID for the entire execution. */
  traceId: string;
  /** Echo of the input channel. */
  channel: InboundChannel;
  /** Decision from the inbound gate. */
  inboundDecision: InboundDecision;
  /** Profile selected (undefined if discarded). */
  profileId: LlmProfileId | undefined;
  /** AI use case invoked (undefined if discarded). */
  useCaseId: GuideUseCaseId | undefined;
  /** AI guide output (undefined if discarded or error). */
  guideResult: GuideResult | undefined;
  /** Structured error if AI guide failed. */
  guideError?: { message: string; code?: string };
  /** Simulated outbound draft when mediation is involved. */
  simulatedOutbound?: SimulatedOutbound;
  /** Non-fatal issues encountered during execution. */
  warnings: string[];
  /** Fatal errors encountered during execution. */
  errors: string[];
};
