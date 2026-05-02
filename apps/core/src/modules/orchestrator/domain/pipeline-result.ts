/**
 * Orchestrator — pipeline contracts (T10 architecture).
 *
 * The orchestrator wires the end-to-end mediation pipeline:
 *
 *   IncomingWhatsAppMessage
 *   → InboundGate (classify)
 *   → MediationUnderstanding (extract recipient + message)
 *   → ContactDirectory (resolve name → whatsappId)
 *   → SessionManager (resolve or create session)
 *   → MediationBridge (start/continue session, draft outbound)
 *   → PrudentRewording (reword with attribution)
 *   → WhatsAppGateway (send)
 *
 * Implementation is deferred until all modules are integrated.
 * Next PR should add:
 *   1. `OrchestratorPort` — defines the use case interface
 *   2. `MediationPipeline` use case — wires all module ports together
 *   3. Integration tests covering the full happy path and error cases
 *
 * Dependencies available:
 *   - InboundGate: EvaluateInboundMessage, ProcessInboundMessage use cases
 *   - MediationUnderstanding: ExtractMediationRequest use case
 *   - ContactDirectory: ResolveContact use case
 *   - SessionManager: ResolveSession use case (via ActiveSessionQuery port)
 *   - MediationBridge: StartMediationBridgeSession, RecordMediationBridgeReply, CloseMediationBridgeSession use cases
 *   - PrudentRewording: RewordMessage use case
 *   - WhatsAppGateway: port (adapter pending)
 */
export type PipelineResult =
  | { type: "message_sent"; toWhatsAppId: string; sessionId: string }
  | { type: "message_received_and_relayed"; sessionId: string }
  | { type: "blocked"; reason: string }
  | { type: "no_action_taken"; reason: string };

export type PipelineInput = {
  senderWhatsAppId: string;
  messageText: string;
  receivedAt: string;
};
