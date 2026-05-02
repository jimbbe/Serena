import type { MediationUnderstanding } from "../ports/mediation-understanding.ts";
import type { MediationRequest } from "../../domain/mediation-request.ts";

export type ExtractMediationRequestInput = {
  text: string;
  senderId: string;
};

export type ExtractMediationRequestDependencies = {
  mediationUnderstanding: MediationUnderstanding;
};

export class ExtractMediationRequest {
  private deps: ExtractMediationRequestDependencies;
  
  constructor(deps: ExtractMediationRequestDependencies) {
    this.deps = deps;
  }

  async execute(input: ExtractMediationRequestInput): Promise<MediationRequest | null> {
    return this.deps.mediationUnderstanding.extract(input.text, input.senderId);
  }
}
