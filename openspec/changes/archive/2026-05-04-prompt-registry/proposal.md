# Proposal: Prompt Registry for AI Guide

## Intent

Replace fragile inline `systemPrompt` + `inputTemplate` strings in `UseCaseContract` with a formal versioned prompt layer. Each use case references a `promptId`, and a `PromptRegistry` + `ContextBuilder` resolve prompts deterministically. This eliminates the code smell of `MockLlmProvider` keying canned responses by exact prompt text.

## Scope

### In Scope
- 6 new files: domain types (`PromptId`, `ContextPolicy`, `OutputContract`), `PromptRegistry` port, `ContextBuilder`, `InMemoryPromptRegistry`
- 8 modified files: contract, result, ports (llm-provider, ai-invocation-audit), pipeline, contracts, mock-llm-provider, audit
- Tests for PromptRegistry, ContextBuilder, ContextPolicy validation
- Update all 28 existing tests to new contract shape
- Documentation in `docs/ai-guide-prompts.md`

### Out of Scope
- Real OpenAI/OpenRouter adapter
- DB-persisted prompts or admin panel
- Real message sending, WhatsApp, or semantic memory
- External tools or summarizer

## Capabilities

### New Capabilities
- `prompt-registry`: Versioned prompt definitions resolved by promptId, with ContextPolicy and OutputContract
- `context-builder`: Assembles user-facing context per ContextPolicy flags (history, identity, safety, contacts)

### Modified Capabilities
- `ai-guide-domain`: UseCaseContract replaces systemPrompt/inputTemplate with promptId; GuideResult metadata adds promptId/promptVersion
- `ai-guide-ports`: LlmProvider port changes from systemPrompt to promptId; AiInvocationAudit adds promptId/promptVersion to records
- `ai-guide-pipeline`: Resolves prompt from registry, uses ContextBuilder instead of inline template rendering
- `ai-guide-mocks`: MockLlmProvider keys by promptId/useCaseId instead of exact systemPrompt text; audit stores promptId/promptVersion

## Approach

**Clean break** — no dual code paths. Replace `systemPrompt`/`inputTemplate` directly with `promptId` in `UseCaseContract`.

Flow: `profileId → useCaseId → UseCaseContract → promptId → PromptRegistry → ContextBuilder → ExecutionPipeline → GuideResult`

PromptId format: `serena.conversation.reply.v1` (dot-notation with version suffix, string literal union).

ContextPolicy per use case:
| Use Case | OutputMode | Context Policy |
|----------|-----------|----------------|
| serena.conversation.reply | text | currentMessage, resolvedIdentity, channelMetadata, history (max 8), safetyMemory |
| serena.risk.review | json | currentMessage, resolvedIdentity, channelMetadata, history (max 5), safetyMemory |
| serena.mediation.understand_request | json | currentMessage, resolvedIdentity, channelMetadata, history (max 4), knownContacts |
| serena.mediation.clarify | json or text | currentMessage, resolvedIdentity, history (max 3), knownContacts |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `domain/prompt-id.ts` | New | Versioned prompt identifier type |
| `domain/context-policy.ts` | New | Context inclusion flags per use case |
| `domain/output-contract.ts` | New | Expected output format definition |
| `domain/use-case-contract.ts` | Modified | Replace systemPrompt/inputTemplate with promptId |
| `domain/guide-result.ts` | Modified | Add promptId/promptVersion to metadata |
| `application/ports/prompt-registry.ts` | New | Port interface for prompt resolution |
| `application/prompt/context-builder.ts` | New | Builds input per ContextPolicy |
| `application/ports/llm-provider.ts` | Modified | invoke({ promptId, userPrompt, policy }) |
| `application/ports/ai-invocation-audit.ts` | Modified | Add promptId/promptVersion to input |
| `application/use-cases/execution-pipeline.ts` | Modified | Resolve prompt, use ContextBuilder |
| `application/use-cases/contracts.ts` | Modified | Reference promptId instead of inline text |
| `infrastructure/memory/in-memory-prompt-registry.ts` | New | Default PromptRegistry implementation |
| `infrastructure/memory/mock-llm-provider.ts` | Modified | Key by promptId, not systemPrompt text |
| `infrastructure/memory/in-memory-ai-invocation-audit.ts` | Modified | Store promptId/promptVersion |
| `tests/` | Modified | Update all 28 tests to new contract shape |
| `docs/ai-guide-prompts.md` | New | Architecture documentation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| All 28 tests break simultaneously | High | Update makeContract helper first, then cascade |
| contracts.ts prompt text migration | Medium | Copy text verbatim — only location changes, not content |
| Template rendering logic moves to ContextBuilder | Medium | Keep interpolation mechanism identical |
| Circular dependency in ContextBuilder | Low | Keep in application/prompt/, pure logic, domain types only |

## Rollback Plan

Revert the git branch. Since this is a clean break with no dual code paths, partial rollback is not feasible — the entire change must be reverted atomically. No database migrations or external state changes are involved, so a simple `git revert` restores the previous state.

## Dependencies

- None — self-contained within the `ai-guide` module

## Success Criteria

- [ ] All 28 existing tests pass with new contract shape
- [ ] PromptRegistry tests cover registration and resolution
- [ ] ContextBuilder tests cover all 4 use case context policies
- [ ] ContextPolicy validation rejects invalid configurations
- [ ] MockLlmProvider keys by promptId, not systemPrompt text
- [ ] Audit records include promptId and promptVersion
- [ ] No references to systemPrompt or inputTemplate remain in ai-guide module
- [ ] `npm run check` passes with zero errors
