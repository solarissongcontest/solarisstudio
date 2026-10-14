import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const noSelectorInput = z.object({}).strict();

/**
 * The client may ask to open its current Entry editor, but it cannot choose the
 * user, delegation, edition, round or submission that authorizes that action.
 */
export const openCurrentV3EntryEditor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => noSelectorInput.parse(input))
  .handler(async () => {
    const { createCurrentV3EntryEditLink } = await import(
      "@/integrations/v3/entry-actions.server"
    );
    return createCurrentV3EntryEditLink();
  });
