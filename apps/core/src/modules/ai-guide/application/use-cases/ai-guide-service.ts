import type { GuideUseCaseId } from "../../domain/guide-use-case-id.ts";
import type { GuideResult } from "../../domain/guide-result.ts";
import type { UseCaseRegistry } from "./use-case-registry.ts";
import type { ExecutionPipeline } from "./execution-pipeline.ts";
import type { AiGuideInput } from "./ai-guide-input.ts";

export class AiGuideService {
  private readonly registry: UseCaseRegistry;
  private readonly pipeline: ExecutionPipeline;

  constructor(deps: { registry: UseCaseRegistry; pipeline: ExecutionPipeline }) {
    this.registry = deps.registry;
    this.pipeline = deps.pipeline;
  }

  async execute(
    useCaseId: GuideUseCaseId,
    input: AiGuideInput
  ): Promise<GuideResult> {
    const contract = this.registry.get(useCaseId);
    if (!contract) {
      throw new Error(`Use case not registered: ${useCaseId}`);
    }

    return this.pipeline.execute(contract, input);
  }
}
