import { z } from "zod";

const publicResultRowSchema = z
  .object({
    countryId: z.string().uuid().nullable(),
    contestEntityId: z.string().uuid().nullable(),
    totalPoints: z.number().int(),
    finalRank: z.number().int().positive(),
    juryPoints: z.number().int().nullable().optional(),
    televotePoints: z.number().int().nullable().optional(),
    televoteComponents: z.unknown().optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (!row.countryId && !row.contestEntityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published result row requires canonical country or contest entity identity",
      });
    }
  });

const publicResultSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    publicationState: z.literal("public"),
    publicationVersion: z.number().int().positive(),
    resultVersion: z.number().int().positive(),
    publicationUpdatedAt: z.string().datetime({ offset: true }),
    resultVersionCreatedAt: z.string().datetime({ offset: true }),
    show: z
      .object({
        id: z.string().uuid(),
        editionId: z.string().uuid(),
        name: z.string().min(1),
        kind: z.string().min(1),
      })
      .strict(),
    edition: z
      .object({
        id: z.string().uuid(),
        number: z.number().int().nullable(),
        name: z.string().min(1),
        slug: z.string().min(1),
      })
      .strict(),
    availability: z
      .object({
        results: z.literal(true),
        jury: z.boolean(),
        televote: z.boolean(),
        detailedVoting: z.boolean(),
      })
      .strict(),
    rowCount: z.number().int().nonnegative(),
    rows: z.array(publicResultRowSchema),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (snapshot.show.editionId !== snapshot.edition.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["show", "editionId"],
        message: "Published result Show must belong to the projected Edition",
      });
    }

    if (snapshot.rowCount !== snapshot.rows.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowCount"],
        message: "Published result rowCount must match immutable snapshot rows",
      });
    }

    if (
      snapshot.availability.detailedVoting &&
      (!snapshot.availability.jury || !snapshot.availability.televote)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availability", "detailedVoting"],
        message: "Detailed voting cannot be public while a split Result layer is hidden",
      });
    }

    const identities = new Set<string>();
    snapshot.rows.forEach((row, index) => {
      const identity = row.contestEntityId
        ? `entity:${row.contestEntityId}`
        : `country:${row.countryId}`;
      if (identities.has(identity)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index],
          message: "Published result snapshot contains duplicate canonical row identity",
        });
      }
      identities.add(identity);

      if (!snapshot.availability.jury && row.juryPoints !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "juryPoints"],
          message: "Unpublished Jury points must not be present in the Public snapshot",
        });
      }
      if (snapshot.availability.jury && row.juryPoints === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "juryPoints"],
          message: "Published Jury points must be present in the Public snapshot",
        });
      }
      if (!snapshot.availability.televote && row.televotePoints !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "televotePoints"],
          message: "Unpublished Televote points must not be present in the Public snapshot",
        });
      }
      if (snapshot.availability.televote && row.televotePoints === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "televotePoints"],
          message: "Published Televote points must be present in the Public snapshot",
        });
      }
      if (!snapshot.availability.detailedVoting && row.televoteComponents !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "televoteComponents"],
          message: "Unpublished detailed voting must not be present in the Public snapshot",
        });
      }
      if (snapshot.availability.detailedVoting && row.televoteComponents === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "televoteComponents"],
          message: "Published detailed voting must be present in the Public snapshot",
        });
      }
    });
  });

export type V3PublicResultRow = z.infer<typeof publicResultRowSchema>;
export type V3PublishedResultSnapshot = z.infer<typeof publicResultSnapshotSchema>;

/**
 * Parses the caller-invariant System projection. `null` is a legitimate
 * fail-closed answer for hidden, stale or historically unversioned Results.
 * Any non-null malformed payload is rejected rather than repaired in Public.
 */
export function parseV3PublishedResultSnapshot(
  value: unknown,
): V3PublishedResultSnapshot | null {
  if (value == null) return null;
  return publicResultSnapshotSchema.parse(value);
}
