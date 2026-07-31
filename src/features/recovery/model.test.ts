import { describe, expect, it } from "vitest";

import { saveRecoveryInputSchema } from "./model";

const validInput = {
  operationId: "14200000-0000-4000-8000-000000000001",
  expectedRevision: 0,
  trigger: " Estrés ",
  moment: " Después del trabajo ",
  need: " Una pausa ",
  alternative: " Caminar cinco minutos ",
  privateNote: " Solo para mí ",
};

describe("saveRecoveryInputSchema", () => {
  it("accepts and normalizes the complete owner recovery contract", () => {
    expect(saveRecoveryInputSchema.parse(validInput)).toEqual({
      ...validInput,
      trigger: "Estrés",
      moment: "Después del trabajo",
      need: "Una pausa",
      alternative: "Caminar cinco minutos",
      privateNote: "Solo para mí",
    });
  });

  it.each([
    { ...validInput, operationId: "not-an-operation-id" },
    { ...validInput, expectedRevision: -1 },
    { ...validInput, trigger: " " },
    { ...validInput, moment: "x".repeat(201) },
    { ...validInput, need: "x".repeat(501) },
    { ...validInput, alternative: "x".repeat(501) },
    { ...validInput, privateNote: "x".repeat(4001) },
  ])("rejects an invalid or unbounded recovery payload", (input) => {
    expect(() => saveRecoveryInputSchema.parse(input)).toThrow();
  });

  it("rejects fields outside the versioned contract", () => {
    expect(() => saveRecoveryInputSchema.parse({ ...validInput, sharedNote: true })).toThrow();
  });
});
