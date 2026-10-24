import { describe, expect, it } from "vitest";
import {
  matchSolarisAssistantCommands,
  partitionSolarisAssistantCommandsByContext,
  SOLARIS_ASSISTANT_COMMANDS,
} from "./solaris-command-assistant";

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

  it("classifies every registered command with an explicit scope", () => {
    expect(SOLARIS_ASSISTANT_COMMANDS.length).toBeGreaterThan(0);
    for (const command of SOLARIS_ASSISTANT_COMMANDS) {
      expect(["global", "edition"]).toContain(command.scope);
    }
  });

  it("blocks edition-scoped matches until an exact edition is verified", () => {
    const matches = matchSolarisAssistantCommands("results");
    const partition = partitionSolarisAssistantCommandsByContext(matches, false);

    expect(partition.available).toEqual([]);
    expect(partition.blockedByEdition.map((command) => command.id)).toContain("results-status");
  });

  it("keeps genuinely global workflows available without an edition", () => {
    const matches = matchSolarisAssistantCommands("integrity cases inbox", 8);
    const partition = partitionSolarisAssistantCommandsByContext(matches, false);

    expect(partition.available.map((command) => command.id)).toEqual(
      expect.arrayContaining(["integrity-cases", "inbox"]),
    );
    expect(partition.available.every((command) => command.scope === "global")).toBe(true);
  });

  it("allows all matched workflows once the edition context is verified", () => {
    const matches = matchSolarisAssistantCommands("voting results", 8);
    const partition = partitionSolarisAssistantCommandsByContext(matches, true);

    expect(partition.available).toEqual(matches);
    expect(partition.blockedByEdition).toEqual([]);
  });
});
