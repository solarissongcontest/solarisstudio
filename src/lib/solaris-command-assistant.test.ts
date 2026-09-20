import { describe, expect, it } from "vitest";
import { matchSolarisAssistantCommands } from "./solaris-command-assistant";

describe("Solaris Command Assistant registry", () => {
  it("maps natural language onto a bounded registered command", () => {
    expect(matchSolarisAssistantCommands("show unresolved integrity cases")[0]?.id).toBe("integrity-cases");
  });

  it("does not invent arbitrary commands", () => {
    expect(matchSolarisAssistantCommands("DROP TABLE participants")).toEqual([]);
  });

  it("maps operational attention requests to the edition health workspace", () => {
    expect(matchSolarisAssistantCommands("what needs attention before the show")[0]?.id).toBe("edition-health");
  });
});
