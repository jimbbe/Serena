/**
 * Default prompt definitions for Serena's AI guide.
 *
 * This file is a thin index — each prompt lives in ./definitions/
 * and is exported from there for auding and modification.
 *
 * MVP focus: mediation bridge between two people.
 * Future: single-elder device, WhatsApp, roles and permissions.
 */
import { mediationUnderstandRequestV1 } from "./definitions/mediation-understand-request.v1.ts";
import { mediationClarifyV1 } from "./definitions/mediation-clarify.v1.ts";
import { conversationReplyV1 } from "./definitions/conversation-reply.v1.ts";
import { riskReviewV1 } from "./definitions/risk-review.v1.ts";
import { inboundClassifyIntentV1 } from "./definitions/inbound-classify-intent.v1.ts";

export const defaultPrompts = [
  mediationUnderstandRequestV1,
  mediationClarifyV1,
  conversationReplyV1,
  riskReviewV1,
  inboundClassifyIntentV1,
];
