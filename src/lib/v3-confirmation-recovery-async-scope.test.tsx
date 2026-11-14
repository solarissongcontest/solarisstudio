import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  hook: 0,
  mounted: true,
  setAfterUnmount: [] as unknown[],
  cleanups: [] as Array<() => void>,
  refs: [] as any[],
  refCursor: 0,
  runEffects: true,
  auth: null as null | ((event: string, session: any) => void),
  preview: {
    editionId: "edition-A",
    submissionId: "submission-A",
    expectedVersion: 1,
    state: {
      editingAllowed: true,
      locked: false,
      roundEditingEnabled: true,
      editionEditingEnabled: true,
    },
    recoveryTokens: [],
    delete: { allowed: false, dependencies: {} },
  },
  resolve: null as null | ((value: unknown) => void),
}));
const api = vi.hoisted(() => ({
  preview: vi.fn(async () => state.preview),
  apply: vi.fn(
    () =>
      new Promise((resolve) => {
        state.resolve = resolve;
      }),
  ),
  clipboard: vi.fn(async () => {}),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.hook++;
    const value = index === 0 ? state.preview : index === 2 ? false : initial;
    return [
      value,
      (next: unknown) => {
        if (!state.mounted) state.setAfterUnmount.push(next);
      },
    ];
  },
  useRef: (value: unknown) => {
    const i = state.refCursor++;
    return state.refs[i] ?? (state.refs[i] = { current: value });
  },
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (fn: () => unknown) => {
    if (!state.runEffects) return;
    const cleanup = fn();
    if (typeof cleanup === "function") state.cleanups.push(cleanup as () => void);
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/system-operation.functions", () => ({ reconcileSystemOperation: vi.fn() }));
vi.mock("@/lib/system-error", () => ({ toSystemError: () => ({ retryable: false }) }));
vi.mock("@/lib/v3-organizer-confirmation-response-access", () => ({
  previewConfirmationResponseAccess: api.preview,
  applyConfirmationResponseAccessChange: api.apply,
  assertConfirmationResponseAccessScope: () => {},
  confirmationResponseAccessErrorMessage: (e: unknown) => String(e),
  createConfirmationResponseAccessCommand: () => ({
    operationId: "operation-A",
    idempotencyKey: "key-A",
  }),
  reauthenticateConfirmationResponseR3: vi.fn(),
}));
vi.mock("@/components/admin/AdminUI", () => ({
  AdminCard: "section",
  AdminCardHeader: "header",
  AdminConfirmSheet: "dialog",
  AdminStatus: "span",
}));
vi.mock("@/components/ui/label", () => ({ Label: "label" }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: "textarea" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/confirmations/client", () => ({
  confirmationsSupabase: {
    auth: {
      onAuthStateChange: (cb: any) => {
        state.auth = cb;
        cb("INITIAL_SESSION", { user: { id: "alice" } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
import { ConfirmationResponseRecoveryControls } from "@/components/admin/ConfirmationResponseRecoveryControls";
function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(3).flatMap(elements)];
}
function text(node: any): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(3).map(text).join("");
}
beforeEach(() => {
  state.hook = 0;
  state.refCursor = 0;
  state.refs = [];
  state.mounted = true;
  state.runEffects = true;
  state.setAfterUnmount = [];
  state.cleanups = [];
  state.auth = null;
  state.resolve = null;
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4173" } });
  vi.stubGlobal("navigator", { clipboard: { writeText: api.clipboard } });
});
const props = () => ({
  editionId: "edition-A",
  submissionId: "submission-A",
  country: "A",
  editionLabel: "A",
  roundName: "A",
  submittedAt: "2026-11-14",
  onChanged: vi.fn(),
  onDeleted: vi.fn(),
});
for (const scenario of [
  "unmount",
  "account switch",
  "edition switch",
  "submission switch",
  "same context",
  "same-actor reauthentication",
]) {
  it("does not leak an old issuance after " + scenario, async () => {
    const p = props();
    const tree = ConfirmationResponseRecoveryControls(p);
    const button = elements(tree).find(
      (node) => node.type === "button" && text(node).includes("Generate edit link"),
    );
    expect(button).toBeTruthy();
    expect(button.props.disabled).toBe(false);
    button.props.onClick();
    await vi.waitFor(() => expect(api.apply).toHaveBeenCalledTimes(1));
    if (scenario === "unmount") {
      state.mounted = false;
      for (const cleanup of state.cleanups) cleanup();
    }
    if (scenario === "account switch") state.auth!("SIGNED_IN", { user: { id: "bob" } });
    if (scenario === "same-actor reauthentication")
      state.auth!("SIGNED_IN", { user: { id: "alice" } });
    if (scenario === "edition switch" || scenario === "submission switch") {
      state.hook = 0;
      state.refCursor = 0;
      state.runEffects = false;
      ConfirmationResponseRecoveryControls({
        ...p,
        ...(scenario === "edition switch"
          ? { editionId: "edition-B" }
          : { submissionId: "submission-B" }),
      });
    }
    state.resolve!({ secretAvailable: true, token: "local-synthetic-old-actor-token" });
    // Drain the command continuation; no live network or actual clipboard.
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (scenario === "same context" || scenario === "same-actor reauthentication") {
      expect(api.clipboard).toHaveBeenCalledWith(
        "http://127.0.0.1:4173/confirmations/edit/local-synthetic-old-actor-token",
      );
      expect(p.onChanged).toHaveBeenCalledTimes(1);
    } else {
      expect(api.clipboard).not.toHaveBeenCalled();
      expect(p.onChanged).not.toHaveBeenCalled();
      expect(state.setAfterUnmount).not.toContain(
        "http://127.0.0.1:4173/confirmations/edit/local-synthetic-old-actor-token",
      );
    }
  });
}

for (const scenario of ["unmount", "account switch", "edition switch"]) {
  it("does not issue a command after a stale delayed preview: " + scenario, async () => {
    const p = props();
    const tree = ConfirmationResponseRecoveryControls(p);
    let finishPreview!: (value: typeof state.preview) => void;
    api.preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreview = resolve;
        }),
    );
    const button = elements(tree).find(
      (node) => node.type === "button" && text(node).includes("Generate edit link"),
    );
    button.props.onClick();
    if (scenario === "unmount") {
      state.mounted = false;
      for (const cleanup of state.cleanups) cleanup();
    } else if (scenario === "account switch") {
      state.auth!("SIGNED_IN", { user: { id: "bob" } });
    } else {
      state.hook = 0;
      state.refCursor = 0;
      state.runEffects = false;
      ConfirmationResponseRecoveryControls({ ...p, editionId: "edition-B" });
    }
    finishPreview(state.preview);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.apply).not.toHaveBeenCalled();
    expect(api.clipboard).not.toHaveBeenCalled();
    expect(p.onChanged).not.toHaveBeenCalled();
  });
}
