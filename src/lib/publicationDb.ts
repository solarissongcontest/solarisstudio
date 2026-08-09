import {
  supabase,
} from "@/integrations/supabase/client";

import type {
  PublicationConfig,
} from "@/lib/publication";

/**
 * publication_config exists in Supabase, but Lovable's generated
 * Database type may temporarily lag behind the actual schema.
 *
 * Keep that compatibility workaround isolated here instead of
 * manually editing generated integration files.
 */

const showsTable =
  () =>
    (
      supabase as any
    ).from(
      "shows",
    );

export async function createShowWithPublication(
  values: {
    edition_id: string;
    name: string;
    kind: string;
    sort_order: number;
    status?: string;
    published?: boolean;
    publication_config: PublicationConfig;
  },
) {
  return showsTable()
    .insert(
      values,
    );
}

export async function updateShowWithPublication(
  showId: string,
  values: {
    published?: boolean;
    status?: string;
    publication_config?: PublicationConfig;
    [key: string]:
      unknown;
  },
) {
  return showsTable()
    .update(
      values,
    )
    .eq(
      "id",
      showId,
    );
}

export async function updateEditionShowsPublication(
  editionId: string,
  values: {
    published?: boolean;
    status?: string;
    publication_config?: PublicationConfig;
    [key: string]:
      unknown;
  },
) {
  return showsTable()
    .update(
      values,
    )
    .eq(
      "edition_id",
      editionId,
    );
}

export async function deleteShowRow(
  showId: string,
) {
  return showsTable()
    .delete()
    .eq(
      "id",
      showId,
    );
}
