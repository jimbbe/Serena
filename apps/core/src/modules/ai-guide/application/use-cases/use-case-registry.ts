import type { GuideUseCaseId } from "../../domain/guide-use-case-id.ts";
import type { UseCaseContract } from "../../domain/use-case-contract.ts";

export class UseCaseRegistry {
  private readonly contracts = new Map<GuideUseCaseId, UseCaseContract>();

  register(contract: UseCaseContract): void {
    if (this.contracts.has(contract.id)) {
      throw new Error(`Use case contract already registered: ${contract.id}`);
    }
    this.contracts.set(contract.id, contract);
  }

  get(id: GuideUseCaseId): UseCaseContract | undefined {
    return this.contracts.get(id);
  }

  getAll(): readonly UseCaseContract[] {
    return Array.from(this.contracts.values());
  }
}
