import test from "node:test";
import assert from "node:assert/strict";

import { RewordMessage } from "../application/use-cases/reword-message.ts";
import { IndirectRewording } from "../infrastructure/templates/indirect-rewording.ts";
import type { RewordingContext } from "../domain/rewording-context.ts";

function makeUseCase() {
  return new RewordMessage({ prudentRewording: new IndirectRewording() });
}

function introContext(
  from: string,
  to: string,
): RewordingContext {
  return { fromDisplayName: from, toDisplayName: to, isRecipientIntroduction: true };
}

function nonIntroContext(
  from: string,
  to: string,
): RewordingContext {
  return { fromDisplayName: from, toDisplayName: to, isRecipientIntroduction: false };
}

// ─── Core Tests ───

test("introduction template includes Hola, Serena, from name, and original text", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "llego tarde",
    context: introContext("María", "Carlos"),
  });

  assert.equal(result, "Hola Carlos, soy Serena. María me pidió decirte que llego tarde");
});

test("non-introduction template omits greeting and Serena", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "llego tarde",
    context: nonIntroContext("María", "Carlos"),
  });

  assert.equal(result, "María me pidió decirte que llego tarde");
});

test("introduction contains all required parts", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "ya voy",
    context: introContext("María", "Carlos"),
  });

  assert.ok(result.includes("Hola"));
  assert.ok(result.includes("soy Serena"));
  assert.ok(result.includes("María"));
  assert.ok(result.includes("me pidió decirte que"));
  assert.ok(result.includes("ya voy"));
});

test("non-introduction does NOT include Hola or soy Serena", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "ya voy",
    context: nonIntroContext("María", "Carlos"),
  });

  assert.ok(!result.includes("Hola"));
  assert.ok(!result.includes("soy Serena"));
});

test("original text punctuation is preserved literally", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "¡Hola! ¿cómo estás?",
    context: nonIntroContext("María", "Carlos"),
  });

  assert.ok(result.endsWith("¡Hola! ¿cómo estás?"));
});

test("both display names appear in correct positions", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "test message",
    context: introContext("Ana", "Pedro"),
  });

  // toDisplayName (Pedro) appears right after "Hola"
  assert.ok(result.includes("Hola Pedro"));
  // fromDisplayName (Ana) appears before "me pidió decirte que"
  assert.ok(result.includes("Ana me pidió decirte que"));
});

test("same context with same text produces identical output", async () => {
  const useCase = makeUseCase();
  const context = introContext("Luis", "Miguel");

  const result1 = await useCase.execute({ originalText: "hola", context });
  const result2 = await useCase.execute({ originalText: "hola", context });

  assert.equal(result1, result2);
});

test("different text with same context only changes text portion", async () => {
  const useCase = makeUseCase();
  const context = nonIntroContext("Luis", "Miguel");

  const result1 = await useCase.execute({ originalText: "primer mensaje", context });
  const result2 = await useCase.execute({ originalText: "segundo mensaje", context });

  // Both share the attribution prefix
  assert.ok(result1.startsWith("Luis me pidió decirte que"));
  assert.ok(result2.startsWith("Luis me pidió decirte que"));
  // Only the text portion differs
  assert.ok(result1.endsWith("primer mensaje"));
  assert.ok(result2.endsWith("segundo mensaje"));
  assert.notEqual(result1, result2);
});

// ─── Edge Case Tests ───

test("very long original text is not truncated", async () => {
  const useCase = makeUseCase();
  const longText = "a".repeat(300);

  const result = await useCase.execute({
    originalText: longText,
    context: nonIntroContext("María", "Carlos"),
  });

  assert.ok(result.endsWith(longText));
  assert.equal(result.length, "María me pidió decirte que ".length + longText.length);
});

test("original text containing the word Serena is treated literally", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "serena dijo que no puede",
    context: nonIntroContext("María", "Carlos"),
  });

  assert.equal(result, "María me pidió decirte que serena dijo que no puede");
});

test("display names with accents are preserved", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "llego en 10",
    context: introContext("José", "María"),
  });

  assert.ok(result.includes("José"));
  assert.ok(result.includes("María"));
});

test("display name with two words works correctly", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "buenos días",
    context: introContext("María José", "Carlos"),
  });

  assert.ok(result.includes("María José"));
});

test("original text with line breaks is preserved as-is", async () => {
  const useCase = makeUseCase();
  const multiLine = "línea 1\nlínea 2\nlínea 3";

  const result = await useCase.execute({
    originalText: multiLine,
    context: nonIntroContext("Ana", "Pedro"),
  });

  assert.ok(result.endsWith(multiLine));
});

test("original text with emojis is preserved as-is", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "estoy feliz 😊🎉",
    context: nonIntroContext("Ana", "Pedro"),
  });

  assert.ok(result.endsWith("estoy feliz 😊🎉"));
});

test("special characters in original text are preserved literally", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "lleva $500 @cliente #urgente",
    context: nonIntroContext("Ana", "Pedro"),
  });

  assert.ok(result.endsWith("lleva $500 @cliente #urgente"));
});

test("same sender and recipient name edge case still works", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "mensaje a mí mismo",
    context: nonIntroContext("Carlos", "Carlos"),
  });

  assert.equal(result, "Carlos me pidió decirte que mensaje a mí mismo");
});

test("single character original text is handled", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "h",
    context: nonIntroContext("Ana", "Pedro"),
  });

  assert.equal(result, "Ana me pidió decirte que h");
});

test("original text matching template phrase is treated literally", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "me pidió decirte que algo",
    context: nonIntroContext("María", "Carlos"),
  });

  assert.equal(result, "María me pidió decirte que me pidió decirte que algo");
});

test("empty display names with intro false do not crash", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "texto",
    context: { fromDisplayName: "", toDisplayName: "", isRecipientIntroduction: false },
  });

  // Should not throw — produces grammatically odd but complete output
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});

test("unicode characters in display names are handled without error", async () => {
  const useCase = makeUseCase();

  const result = await useCase.execute({
    originalText: "привет",
    context: introContext("Фёдор", "Анна"),
  });

  assert.ok(result.includes("Фёдор"));
  assert.ok(result.includes("Анна"));
  assert.ok(result.endsWith("привет"));
});
