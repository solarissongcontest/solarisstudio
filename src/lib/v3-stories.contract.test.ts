import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Stories contract", () => {
  it("uses only the existing published Storytelling RPC projections", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");

    expect(source).toContain('client.rpc("studio2_public_storylines"');
    expect(source).toContain('client.rpc("studio2_public_storyline"');
    expect(source).toContain('client.rpc("studio2_anniversary_engine"');
    expect(source).not.toContain("studio2_storytelling_snapshot");
    expect(source).not.toContain("studio2_execute_story_operation");
  });

  it("keeps Stories read-only and excludes privileged mutation clients", () => {
    const combined = [
      read("src/integrations/v3/stories-source.server.ts"),
      read("src/lib/v3-stories.functions.ts"),
      read("src/lib/v3-stories-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
    expect(combined).not.toContain("executeStudio2StoryOperation");
  });

  it("derives the anniversary reference date on the server in Solaris time", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");

    expect(source).toContain("SOLARIS_TIME_ZONE");
    expect(source).toContain("todayInSolaris()");
    expect(source).toContain("p_reference_date: referenceDate");
    expect(source).not.toContain("window.");
  });

  it("resolves Explore rollout before loading Stories and only uses legacy before V3 is selected", () => {
    const gates = read("src/components/v3/V3StoriesGates.tsx");
    const indexRoute = read("src/routes/stories/index.tsx");
    const detailRoute = read("src/routes/stories/$editionSlug.tsx");

    expect(gates).toContain("useV3RolloutProbe");
    expect(gates).toContain("useV3EditionRolloutProbe");
    expect(gates).toContain("const v3Selected =");
    expect(gates).toContain("useV3StoriesIndexBundle(v3Selected)");
    expect(gates).toContain("useV3StoryDetailBundle(editionSlug, v3Selected)");
    expect(gates).toContain("if (!rollout.data || !v3Selected)");
    expect(gates).toContain("return <>{fallback}</>");
    expect(indexRoute).toContain("<V3StoriesIndexGate fallback={<LegacyStoriesArchivePage />} />");
    expect(detailRoute).toContain("<V3StoryDetailGate");
    expect(detailRoute).toContain("fallback={<LegacyEditionStoryPage editionSlug={editionSlug} />}");
  });

  it("fails closed after V3 rollout selection and retains cached V3 data on refetch errors", () => {
    const gates = read("src/components/v3/V3StoriesGates.tsx");

    expect(gates).toContain("StoriesUnavailable");
    expect(gates).toContain('data-v3-stories-state="error"');
    expect(gates).toContain("if (bundle.isLoading && !bundle.data)");
    expect(gates).toContain("if (!bundle.data)");
    expect(gates).not.toContain("if (bundle.isError || !bundle.data");
    expect(gates).not.toContain("rollout.isError || !rollout.data");
  });

  it("uses the shared spoiler preference authority for both Stories surfaces", () => {
    const gates = read("src/components/v3/V3StoriesGates.tsx");

    expect(gates).toContain("useAppExperiencePreferences");
    expect(gates).toContain("useNotificationPreferences");
    expect(gates).toContain("resolveV3ResultsSpoilerProtection");
    expect(gates).toContain("hideSpoilers={hideSpoilers}");
  });

  it("does not render story previews or timeline content in the protected branch", () => {
    const index = read("src/components/v3/V3StoriesIndexScreen.tsx");
    const detail = read("src/components/v3/V3StoryDetailScreen.tsx");

    expect(index).toContain('data-v3-stories-spoiler-protected=""');
    expect(index).toContain("Reveal published stories");
    expect(index).toContain("protectedView ? (");
    expect(detail).toContain('data-v3-story-spoiler-protected=""');
    expect(detail).toContain("Reveal edition story");
    expect(detail).toContain("if (hideSpoilers && !revealed)");
  });

  it("keeps route-head metadata generic so spoiler content does not enter document metadata", () => {
    const indexRoute = read("src/routes/stories/index.tsx");
    const detailRoute = read("src/routes/stories/$editionSlug.tsx");
    const detailHead = detailRoute.split("function EditionStoryPage")[0] ?? detailRoute;

    expect(indexRoute).toContain("Stories — Solaris Studio");
    expect(detailHead).toContain("Edition Story — Solaris Studio");
    expect(detailHead).not.toContain("story.title");
    expect(detailHead).not.toContain("story.subtitle");
    expect(detailHead).not.toContain("story.introduction");
  });
});
