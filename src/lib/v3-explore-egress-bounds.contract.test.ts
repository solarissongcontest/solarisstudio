import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/integrations/v3/explore-source.server.ts"),
    "utf8",
  );

describe("V3 Explore archive egress bounds", () => {
  it("keeps Edition discovery metadata limited to fields the root actually renders", () => {
    const implementation = source();

    expect(implementation).toContain(
      'const EDITION_COLUMNS =\n  "id,edition_number,name,year,slug,host_city,logo,artwork_url,status,published";',
    );
    expect(implementation).not.toContain("description,host_country_id");
    expect(implementation).not.toContain("host_country_id,host_city");
    expect(implementation).not.toContain("theme_id");
  });

  it("keeps rich broadcast metadata scoped to the current edition", () => {
    const implementation = source();

    expect(implementation).toContain(
      'const CURRENT_SHOW_COLUMNS =\n  "id,edition_id,name,kind,sort_order,status,published,publication_config,broadcast_config";',
    );
    expect(implementation).toContain('.eq("edition_id", currentEdition.id)');
    expect(implementation).toContain('.select(CURRENT_SHOW_COLUMNS)');
  });

  it("uses narrow final-show metadata for archive result availability", () => {
    const implementation = source();

    expect(implementation).toContain(
      'const ARCHIVE_RESULT_SHOW_COLUMNS =\n  "id,edition_id,kind,published,publication_config";',
    );
    expect(implementation).toContain('.select(ARCHIVE_RESULT_SHOW_COLUMNS)');
    expect(implementation).toContain('.in("kind", ["grand-final", "final"])');
    expect(implementation).not.toContain(
      'const ARCHIVE_RESULT_SHOW_COLUMNS =\n  "id,edition_id,kind,published,publication_config,broadcast_config";',
    );
  });

  it("loads only winner identity fields needed to establish public result availability", () => {
    const implementation = source();

    expect(implementation).toContain(
      'const WINNER_RESULT_COLUMNS = "edition_id,show_id,final_rank";',
    );
    expect(implementation).toContain('.select(WINNER_RESULT_COLUMNS)');
    expect(implementation).toContain('.eq("final_rank", 1)');
    expect(implementation).not.toContain("jury_points,televote_points,total_points");
  });

  it("retains publication gates instead of substituting archive heuristics", () => {
    const implementation = source();

    expect(implementation).toContain("resolveShowPublication(show).results");
    expect(implementation).toContain('.eq("published", true)');
    expect(implementation).toContain("resolvePublicEditionState({");
    expect(implementation).not.toContain("localStorage");
    expect(implementation).not.toContain("sessionStorage");
  });
});
