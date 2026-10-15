import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const reconcileSystemOperationSchema = z.object({
  operationId: z.string().uuid(),
});

export const reconcileSystemOperation = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => reconcileSystemOperationSchema.parse(value))
  .handler(async ({ data }) => {
    const { reconcileSystemOperationServer } =
      await import("@/lib/system-operation-reconciliation.server");
    return reconcileSystemOperationServer(data.operationId);
  });
