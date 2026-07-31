import { describe, expect, it } from "vitest";

import { supportMessages, supportTypes } from "./model";

describe("support request contract", () => {
  it("keeps the exact five choices and bounded optional messages", () => {
    expect(supportTypes).toEqual(["distraction", "food_choice", "motivation", "conversation", "presence_no_advice"]);
    expect(supportMessages).toEqual(["not_urgent", "when_available", "no_reply_needed"]);
  });
});
