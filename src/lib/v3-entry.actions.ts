import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { V3_ENTRY_EDITOR_SECTIONS } from "./v3-entry";

const editorInput = z
  .object({
    focus: z.enum(V3_ENTRY_EDITOR_SECTIONS).optional(),
  })
  .strict();

/**
 * The client may ask to open its current Entry editor and may provide only a
 * presentation-level correction section. It cannot choose the user,
 * delegation, edition, round or submission that authorizes that action.
 */
export const openCurrentV3EntryEditor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => editorInput.parse(input))
  .handler(async ({ data }) => {
    const { createCurrentV3EntryEditLink } = await import(
      "@/integrations/v3/entry-actions.server"
    );
    return createCurrentV3EntryEditLink(data.focus);
  });
