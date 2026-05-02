import type { MediationRequest } from "../../domain/mediation-request.ts";

export type MediationUnderstanding = {
  extract(text: string, senderId: string): Promise<MediationRequest | null>;
};
