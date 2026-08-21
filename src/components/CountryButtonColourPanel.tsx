import { useRouterState } from "@tanstack/react-router";
import { Paintbrush } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  bestButtonText,
  deriveCountryButtonColor,
  resolveCountryButtonTheme,
  useSaveCountryButtonColour,
} from "@/lib/country-button-theme";
import { useCountries } from "@/lib/data";
import { useCountryTheme } from "@/lib/visual-theme";

export function CountryButtonColourPanel() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const onAppearancePage = location.pathname === "/country-hub/theme" || location.pathname === "/country-hub/theme/";
  const { data: accountData } = useMyCountryAccount();
  const { data: countries } = useCountries();

  const targetCountryId =
    location.search && typeof location.search === "object"
      ? (location.search as Record<string, unknown>).country
      : null;
  const adminTarget =
    accountData?.access.isOrganizer && typeof targetCountryId === "string"
      ? (countries ?? []).find((country) => country.id === targetCountryId)
      : null;
  const country = adminTarget ?? accountData?.country ?? null;
  const { data: row } = useCountryTheme(country?.id);
  const saveButton = useSaveCountryButtonColour(country?.id);

  const accent = row?.accent ?? country?.accent_color ?? "#86c9d7";
  const saved = useMemo(
    () => resolveCountryButtonTheme(row, accent),
    [row, accent],
  );
  const automaticColour = useMemo(() => deriveCountryButtonColor(accent), [accent]);
  const [custom, setCustom] = useState(false);
  const [colour, setColour] = useState("#86c9d7");
  const [message, setMessage] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCustom(saved.custom);
    setColour(saved.buttonColor);
  }, [saved.custom, saved.buttonColor]);

  const effective = custom ? colour : automaticColour;
  const foreground = bestButtonText(effective);

  useEffect(() => {
    if (!onAppearancePage) return;
    document.body.style.setProperty("--solaris-button", effective);
    document.body.style.setProperty("--solaris-button-foreground", foreground);
    return () => {
      document.body.style.removeProperty("--solaris-button");
      document.body.style.removeProperty("--solaris-button-foreground");
    };
  }, [onAppearancePage, effective, foreground]);

  useEffect(() => {
    if (!onAppearancePage) return;

    const panels = Array.from(document.querySelectorAll<HTMLElement>(".app-main .data-panel"));
    const coloursPanel = panels.find((panel) =>
      Array.from(panel.querySelectorAll("h2")).some(
        (heading) => heading.textContent?.trim().toLowerCase() === "colours",
      ),
    );
    const anchor = coloursPanel ?? document.querySelector<HTMLElement>(".app-main > .page-header");
    if (!anchor?.parentElement) return;

    const node = document.createElement("div");
    node.dataset.countryButtonColourPanel = "true";
    node.className = "mb-5";
    anchor.insertAdjacentElement("afterend", node);
    setHost(node);

    return () => {
      node.remove();
      setHost(null);
    };
  }, [onAppearancePage]);

  if (!onAppearancePage || !country || !host) return null;

  const save = async () => {
    setMessage(null);
    try {
      await saveButton.mutateAsync(custom ? colour : null);
      setMessage(
        custom
          ? "Button colour saved. Country and Wiki actions now use it."
          : "Buttons now use an automatic contrasting colour based on your page palette.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Button colour could not be saved.");
    }
  };

  return createPortal(
    <Panel
      title="Button colour"
      description="Choose how action buttons look on both your Country and Wiki pages. Automatic makes a contrasting colour from your page palette; Custom uses exactly the colour you choose."
      actions={
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
          <Paintbrush className="size-3.5" /> Country + Wiki
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,.72fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCustom(false)}
              className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${
                !custom ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"
              }`}
            >
              Automatic
            </button>
            <button
              type="button"
              onClick={() => {
                setCustom(true);
                if (!saved.custom) setColour(automaticColour);
              }}
              className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${
                custom ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"
              }`}
            >
              Custom colour
            </button>
          </div>

          {custom && (
            <label className="block rounded-xl border border-border bg-surface p-3">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                Your button colour
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colour}
                  onChange={(event) => setColour(event.target.value)}
                  className="h-11 w-14 rounded-lg border border-border bg-background p-1"
                />
                <input
                  value={colour}
                  onChange={(event) => {
                    if (/^#[0-9a-f]{0,6}$/i.test(event.target.value)) setColour(event.target.value);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs"
                />
              </div>
            </label>
          )}

          <button
            type="button"
            disabled={saveButton.isPending || (custom && !/^#[0-9a-f]{6}$/i.test(colour))}
            onClick={() => void save()}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-55"
          >
            {saveButton.isPending ? "Saving…" : "Save button style"}
          </button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>

        <div
          className="rounded-2xl border p-4"
          style={{
            background: row?.surface ?? "var(--surface)",
            borderColor: `${effective}66`,
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Live preview
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                background: effective,
                borderColor: effective,
                color: foreground,
              }}
            >
              Main action
            </span>
            <span
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                background: `color-mix(in srgb, ${effective} 68%, transparent)`,
                borderColor: `color-mix(in srgb, ${effective} 86%, white 14%)`,
                color: foreground,
              }}
            >
              Secondary
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This palette is used by Wiki, Compare, Follow, active tabs and selected navigation on your themed pages.
          </p>
        </div>
      </div>
    </Panel>,
    host,
  );
}
