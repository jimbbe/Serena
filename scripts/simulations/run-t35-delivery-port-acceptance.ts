/**
 * T35 — Acceptance simulation for outbound delivery port handoff.
 *
 * This script runs the server, then executes acceptance scenarios
 * against the simulation API to verify the full delivery cycle.
 *
 * Usage:
 *   ENABLE_SIMULATION_ENDPOINTS=true AI_PROVIDER=mock npm run start:simulation
 *   node --experimental-strip-types scripts/simulations/run-t35-delivery-port-acceptance.ts
 */

const BASE_URL = process.env.SERENA_CORE_URL ?? "http://localhost:3001";

type TestCase = {
  name: string;
  run: () => Promise<boolean>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const tests: TestCase[] = [
  {
    name: "1. Mediation confirm → preparedOutbound → delivery fake delivered",
    async run() {
      // Step 1: Start mediation
      const r1 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "avisale a Carlos que llego tarde",
      });
      assert(r1.status === 200, `Step 1 failed: ${r1.status}`);
      const result1 = r1.json as Record<string, unknown>;
      assert(result1.flowState !== undefined, "No flowState in step 1");
      const flowState1 = result1.flowState as Record<string, unknown>;
      assert(flowState1.status === "confirming", `Expected confirming, got ${flowState1.status}`);

      // Step 2: Confirm
      const r2 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "sí",
      });
      assert(r2.status === 200, `Step 2 failed: ${r2.status}`);
      const result2 = r2.json as Record<string, unknown>;
      assert(result2.preparedOutbound !== undefined, "No preparedOutbound in step 2");
      const prepared = result2.preparedOutbound as Record<string, unknown>;
      assert(prepared.status === "confirmed_pending_delivery", `Expected confirmed_pending_delivery, got ${prepared.status}`);
      assert(prepared.deliveryReady === true, "deliveryReady should be true");
      const draftId = prepared.id as string;

      // Step 3: Request delivery
      const r3 = await post("/dev/simulate/outbound-delivery", { outboundDraftId: draftId });
      assert(r3.status === 200, `Step 3 failed: ${r3.status}`);
      const delivery = r3.json as Record<string, unknown>;
      assert(delivery.delivery !== undefined, "No delivery in response");
      const deliveryResult = delivery.delivery as Record<string, unknown>;
      assert(deliveryResult.status === "delivered", `Expected delivered, got ${deliveryResult.status}`);
      assert((delivery.outboundDraft as Record<string, unknown>).status === "delivered", "Draft should be delivered");

      return true;
    },
  },
  {
    name: "2. Unresolved recipient → delivery rejected",
    async run() {
      // Step 1: Start mediation with unknown recipient
      const r1 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "avisale a Desconocido que llego tarde",
      });
      assert(r1.status === 200, `Step 1 failed: ${r1.status}`);
      const result1 = r1.json as Record<string, unknown>;
      assert(result1.flowState !== undefined, "No flowState");
      const flowState1 = result1.flowState as Record<string, unknown>;
      assert(flowState1.status === "confirming", `Expected confirming, got ${flowState1.status}`);

      // Step 2: Confirm
      const r2 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "sí",
      });
      assert(r2.status === 200, `Step 2 failed: ${r2.status}`);
      const result2 = r2.json as Record<string, unknown>;
      assert(result2.preparedOutbound !== undefined, "No preparedOutbound");
      const prepared = result2.preparedOutbound as Record<string, unknown>;
      assert(prepared.status === "needs_recipient_resolution", `Expected needs_recipient_resolution, got ${prepared.status}`);
      const draftId = prepared.id as string;

      // Step 3: Try delivery — should fail with 409
      const r3 = await post("/dev/simulate/outbound-delivery", { outboundDraftId: draftId });
      assert(r3.status === 409, `Expected 409, got ${r3.status}`);
      const error = r3.json as Record<string, unknown>;
      assert(error.error === "draft_not_ready", `Expected draft_not_ready, got ${error.error}`);

      return true;
    },
  },
  {
    name: "3. Cancel → no preparedOutbound → no delivery possible",
    async run() {
      // Step 1: Start mediation
      const r1 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "avisale a Carlos que llego tarde",
      });
      assert(r1.status === 200, `Step 1 failed: ${r1.status}`);

      // Step 2: Cancel
      const r2 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "mejor no",
      });
      assert(r2.status === 200, `Step 2 failed: ${r2.status}`);
      const result2 = r2.json as Record<string, unknown>;
      assert(result2.preparedOutbound === undefined, "preparedOutbound should NOT exist on cancel");

      // Step 3: Try delivery with fake ID — should fail with 404
      const r3 = await post("/dev/simulate/outbound-delivery", { outboundDraftId: "od_nonexistent" });
      assert(r3.status === 404, `Expected 404, got ${r3.status}`);

      return true;
    },
  },
  {
    name: "4. Risk signal → no preparedOutbound → no delivery",
    async run() {
      // Step 1: Start mediation
      const r1 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "avisale a Carlos que llego tarde",
      });
      assert(r1.status === 200, `Step 1 failed: ${r1.status}`);

      // Step 2: Send risk signal
      const r2 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5491155555555",
        text: "me caí y no puedo levantarme",
      });
      assert(r2.status === 200, `Step 2 failed: ${r2.status}`);
      const result2 = r2.json as Record<string, unknown>;
      assert(result2.preparedOutbound === undefined, "preparedOutbound should NOT exist on risk");
      const flowState2 = result2.flowState as Record<string, unknown> | undefined;
      assert(flowState2?.status === "paused", `Expected paused, got ${flowState2?.status}`);

      return true;
    },
  },
  {
    name: "5. Unknown sender → no mediation flow → no delivery",
    async run() {
      const r1 = await post("/dev/simulate/inbound-message", {
        channel: "whatsapp",
        externalSenderId: "5499999999999", // unknown number
        text: "avisale a Carlos que llego tarde",
      });
      assert(r1.status === 200, `Step 1 failed: ${r1.status}`);
      const result1 = r1.json as Record<string, unknown>;
      assert(result1.preparedOutbound === undefined, "preparedOutbound should NOT exist for unknown sender");
      assert(result1.flowState === undefined, "flowState should NOT exist for unknown sender");

      return true;
    },
  },
  {
    name: "6. Delivery endpoint validation — missing outboundDraftId returns 400",
    async run() {
      const r1 = await post("/dev/simulate/outbound-delivery", {});
      assert(r1.status === 400, `Expected 400, got ${r1.status}`);
      const error = r1.json as Record<string, unknown>;
      assert(error.error === "invalid_payload", `Expected invalid_payload, got ${error.error}`);

      return true;
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== T35 Outbound Delivery Port Acceptance ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of tests) {
    try {
      await tc.run();
      console.log(`✅ ${tc.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${tc.name}`);
      console.log(`   Error: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
