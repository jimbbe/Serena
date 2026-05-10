/**
 * T32 — Acceptance simulation script.
 *
 * Tests the mediation flow state machine against the live simulation endpoint.
 * Uses real LLM provider (configured in .env).
 *
 * Usage: npx tsx scripts/simulations/run-t32-acceptance.ts
 * or:    node --experimental-strip-types scripts/simulations/run-t32-acceptance.ts
 */

const BASE_URL = "http://localhost:3000";
const MARIA = "5491111111111";
const TIMEOUT_MS = 60_000; // 60s for real LLM calls

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function postJson(path: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  } finally {
    clearTimeout(timer);
  }
}

function simStep(channel: string, sender: string, text: string, conversationId?: string) {
  return { channel, externalSenderId: sender, text, ...(conversationId ? { conversationId } : {}) };
}

async function simSingle(text: string, sender = MARIA, convId?: string): Promise<Record<string, unknown>> {
  const { status, body } = await postJson("/dev/simulate/inbound-message", simStep("whatsapp", sender, text, convId));
  if (status !== 200) {
    console.error(`  ❌ HTTP ${status}:`, JSON.stringify(body).slice(0, 200));
    return { _error: body };
  }
  return body as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

interface ScenarioStep {
  index: number;
  text: string;
  expected: string;
  check: (r: Record<string, unknown>) => boolean;
}

interface ScenarioResult {
  id: string;
  name: string;
  steps: { index: number; text: string; passed: boolean; expected: string; actual: string }[];
  passed: number;
  failed: number;
}

async function runScenario(
  id: string,
  name: string,
  steps: ScenarioStep[],
  sender = MARIA,
): Promise<ScenarioResult> {
  const result: ScenarioResult = { id, name, steps: [], passed: 0, failed: 0 };
  let convId: string | undefined;
  const scStart = Date.now();

  for (const step of steps) {
    const stepStart = Date.now();
    process.stdout.write(`  ⏳ Step ${step.index}: "${step.text.slice(0, 60)}" ... `);

    const r = await simSingle(step.text, sender, convId);
    if (!convId && (r as any).conversation?.id) {
      convId = (r as any).conversation.id;
    }

    const flow = (r as any).flowState;
    let actual = "no flow";
    if (flow) {
      actual = `status=${flow.status} pending=${flow.pendingAction ?? "null"} missing=${JSON.stringify(flow.missingFields ?? [])} msg="${(flow.draftMessageDraft ?? "").slice(0, 40)}"`;
    } else if ((r as any).profileId) {
      actual = `profile=${(r as any).profileId}`;
    }

    const passed = step.check(r);
    const ms = (Date.now() - stepStart);
    const icon = passed ? "✅" : "❌";
    process.stdout.write(`${icon} (${ms}ms) → ${actual}\n`);

    result.steps.push({
      index: step.index,
      text: step.text,
      passed,
      expected: step.expected,
      actual,
    });

    if (passed) result.passed++;
    else result.failed++;

    if (!passed) {
      console.log(`       Expected: ${step.expected}`);
    }
  }

  const elapsed = ((Date.now() - scStart) / 1000).toFixed(1);
  const pct = result.steps.length > 0 ? Math.round((result.passed / result.steps.length) * 100) : 0;
  const icon = result.failed === 0 ? "✅" : "❌";
  console.log(`  ${icon} ${result.passed}/${result.steps.length} passed (${pct}%) — ${elapsed}s\n`);
  return result;
}

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function flowSummary(r: Record<string, unknown>): string {
  const f = (r as any).flowState;
  if (!f) return `profile=${(r as any).profileId ?? "none"}`;
  const m = f.missingFields ?? [];
  return `${f.status} | action=${f.pendingAction ?? "—"} | missing=[${m.join(",")}] | msg="${(f.draftMessageDraft ?? "").slice(0, 30)}"`;
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

const SCENARIOS: { id: string; name: string; desc: string; steps: ScenarioStep[]; sender?: string }[] = [

  // ===== S1: Mediation with missing message → clarification → confirmation =====
  {
    id: "S1",
    name: "Avisale a X sin mensaje → clarification → confirmation",
    desc: "Pide mediación con destinatario pero sin mensaje. Serena pide el mensaje, lo recibe, pide confirmación, y confirma.",
    steps: [
      {
        index: 1, text: "avisale a Carlos",
        expected: "clarifying with clarify_message pending",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "clarifying" && f?.pendingAction === "clarify_message";
        },
      },
      {
        index: 2, text: "que voy a llegar tarde",
        expected: "confirming after providing message",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.pendingAction === "confirm_mediation";
        },
      },
      {
        index: 3, text: "sí, mandalo",
        expected: "resolved after confirmation",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved" && f?.pendingAction === null;
        },
      },
    ],
  },

  // ===== S2: Mediation with missing recipient → clarification → confirmation =====
  {
    id: "S2",
    name: "Decile que X sin destinatario → clarification → confirmation",
    desc: "Pide mediación con mensaje pero sin destinatario. Serena pide el destinatario, lo recibe, y confirma.",
    steps: [
      {
        index: 1, text: "decile que no venga",
        expected: "clarifying with clarify_recipient pending",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "clarifying" && f?.pendingAction === "clarify_recipient";
        },
      },
      {
        index: 2, text: "a Carlos",
        expected: "confirming after providing recipient",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.pendingAction === "confirm_mediation";
        },
      },
      {
        index: 3, text: "dale",
        expected: "resolved after confirmation",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S3: Both missing → clarify both → clarify message → confirm =====
  {
    id: "S3",
    name: "Avisale solo → clarify both → recipient → message → confirm",
    desc: "Pide mediación sin destinatario ni mensaje ('avisale'). Serena pide ambos, recibe destinatario, luego mensaje, luego confirma.",
    steps: [
      {
        index: 1, text: "avisale",
        expected: "clarifying with clarify_both",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "clarifying" && f?.pendingAction === "clarify_both";
        },
      },
      {
        index: 2, text: "a Carlos",
        expected: "still clarifying, now for message",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "clarifying" && f?.pendingAction === "clarify_message";
        },
      },
      {
        index: 3, text: "que llego tarde",
        expected: "confirming after completing fields",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.pendingAction === "confirm_mediation";
        },
      },
      {
        index: 4, text: "confirmo",
        expected: "resolved",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S4: Complete mediation → confirm → resolved =====
  {
    id: "S4",
    name: "Mediation complete → confirm → resolved",
    desc: "Mediación completa con destinatario y mensaje. Serena pide confirmación directamente, el usuario confirma.",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming immediately (has both fields)",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.pendingAction === "confirm_mediation";
        },
      },
      {
        index: 2, text: "sí, mandalo",
        expected: "resolved",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S5: Complete mediation → cancel =====
  {
    id: "S5",
    name: "Mediation complete → cancel → resolved (cancelled)",
    desc: "Mediación completa. El usuario dice 'mejor no' y cancela. Flujo resuelto sin envío.",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming";
        },
      },
      {
        index: 2, text: "mejor no",
        expected: "resolved (cancelled)",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved" && f?.pendingAction === null;
        },
      },
    ],
  },

  // ===== S6: Complete mediation → edit → re-confirm =====
  {
    id: "S6",
    name: "Mediation complete → edit → re-confirm → resolved",
    desc: "Mediación completa. Usuario edita el mensaje ('cambiá el mensaje, decile que...'), Serena actualiza el draft (v2) y pide re-confirmación.",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming v1",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.version === 1;
        },
      },
      {
        index: 2, text: "cambiá el mensaje, decile que voy mañana",
        expected: "confirming v2 with updated message",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming" && f?.version === 2;
        },
      },
      {
        index: 3, text: "sí",
        expected: "resolved after edit+confirm",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S7: Risk interruption =====
  {
    id: "S7",
    name: "Mediation → risk signal → flow paused",
    desc: "Mediación completa, luego el usuario manda señal de riesgo ('me caí'). El flujo se pausa inmediatamente.",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming";
        },
      },
      {
        index: 2, text: "me caí y no puedo levantarme",
        expected: "paused by risk",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "paused" || (r as any).warnings?.some((w: string) => w.includes("risk") || w.includes("pausa"));
        },
      },
    ],
  },

  // ===== S8: Conversation → mediation → confirmation =====
  {
    id: "S8",
    name: "Conversation → full mediation → confirmation → resolved",
    desc: "Empieza con conversación casual, luego mediación completa, y confirma. Verifica que el flow no interfiere con conversación normal.",
    steps: [
      {
        index: 1, text: "hola Serena, cómo estás?",
        expected: "conversation profile",
        check: (r) => !(r as any).flowState && (r as any).profileId === "conversation",
      },
      {
        index: 2, text: "avisale a Carlos que voy a llegar tarde",
        expected: "confirming mediation",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming";
        },
      },
      {
        index: 3, text: "dale, mandalo",
        expected: "resolved",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S9: No debe disparar mediación =====
  {
    id: "S9",
    name: "'Yo voy a llamar a Carlos' → conversation (not mediation)",
    desc: "Frase en primera persona que NO debería disparar mediación. Verifica que no haya falsos positivos.",
    steps: [
      {
        index: 1, text: "después voy a llamar a Carlos yo",
        expected: "conversation or clarification (not mediation_understanding)",
        check: (r) => {
          const pid = (r as any).profileId;
          return pid !== "mediation_understanding";
        },
      },
    ],
  },

  // ===== S10: Confirmation keywords without draft → no effect =====
  {
    id: "S10",
    name: "'sí' / 'no' without pending draft → no fake flow",
    desc: "Palabras de confirmación/cancelación SIN draft pendiente. Deben tratarse como conversación normal, no crear flows falsos.",
    steps: [
      {
        index: 1, text: "sí",
        expected: "conversation (no draft to resolve)",
        check: (r) => (r as any).profileId === "conversation",
      },
      {
        index: 2, text: "no",
        expected: "conversation",
        check: (r) => (r as any).profileId === "conversation",
      },
      {
        index: 3, text: "mandalo",
        expected: "conversation (no draft)",
        check: (r) => (r as any).profileId === "conversation",
      },
    ],
  },

  // ===== S11: Esperá pauses =====
  {
    id: "S11",
    name: "Mediation → 'esperá' → resolved (cancelled/paused)",
    desc: "Mediación completa. El usuario dice 'esperá, mejor no'. El flujo se resuelve (cancelado).",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming";
        },
      },
      {
        index: 2, text: "esperá, mejor no",
        expected: "resolved (cancelled)",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
    ],
  },

  // ===== S12: Multiple confirmations on same draft =====
  {
    id: "S12",
    name: "Mediation → confirm → re-confirm (no-op after resolved)",
    desc: "Mediación confirmada y resuelta. Un segundo 'sí' no debería tener efecto (flow ya resuelto).",
    steps: [
      {
        index: 1, text: "avisale a Carlos que llego tarde",
        expected: "confirming",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "confirming";
        },
      },
      {
        index: 2, text: "sí",
        expected: "resolved",
        check: (r) => {
          const f = (r as any).flowState;
          return f?.status === "resolved";
        },
      },
      {
        index: 3, text: "sí de nuevo",
        expected: "conversation (flow already resolved)",
        check: (r) => {
          const f = (r as any).flowState;
          return !f || f.status === "resolved";
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  T32 Mediation Flow — Acceptance Simulation");
  console.log("  Server:", BASE_URL);
  console.log("  Sender:", MARIA, "(María)");
  console.log("  Started:", new Date().toISOString());
  console.log("═══════════════════════════════════════════════════════════════\n");

  let totalPassed = 0;
  let totalFailed = 0;
  const allResults: ScenarioResult[] = [];

  for (let si = 0; si < SCENARIOS.length; si++) {
    const scenario = SCENARIOS[si]!;
    const progress = `[${si + 1}/${SCENARIOS.length}]`;
    console.log(`\n📋 ${progress} ${scenario.id}: ${scenario.name}`);
    console.log(`   ${scenario.desc}`);

    const result = await runScenario(scenario.id, scenario.name, scenario.steps, scenario.sender ?? MARIA);
    allResults.push(result);

    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  FINAL REPORT");
  console.log("═══════════════════════════════════════════════════════════════");

  for (const r of allResults) {
    const pct = r.steps.length > 0 ? Math.round((r.passed / r.steps.length) * 100) : 0;
    const icon = r.failed === 0 ? "✅" : "⚠️";
    console.log(`  ${icon} ${r.id}: ${r.name} — ${r.passed}/${r.steps.length} (${pct}%)`);
  }

  console.log(`\n  Total: ${totalPassed}/${totalPassed + totalFailed} steps passed`);
  console.log(`  Failed: ${totalFailed}`);
  console.log(`  Elapsed: ${totalElapsed}s`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Exit code
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
