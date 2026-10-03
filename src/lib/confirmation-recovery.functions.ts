import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";


async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = createConfirmationPublicRuntimeClient();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const recoverSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        round_id: z.string().uuid(),
        country: z.string().trim().min(1).max(80),
        recovery_code: z.string().trim().min(6).max(32),
        browser_session_id: z.string().trim().min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    rpc<{
      ok: boolean;
      error?: string;
      submission_id?: string;
      country?: string;
      token?: string;
      can_edit?: boolean;
    }>("public_recover_submission", {
      _round_id: data.round_id,
      _country: data.country,
      _recovery_code: data.recovery_code,
      _browser_session_id: data.browser_session_id,
    }),
  );
