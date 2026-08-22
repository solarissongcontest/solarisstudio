import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useMyCountryAccount } from "@/lib/country-account";
import { useCountries } from "@/lib/data";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export function CountryFlagLayerEditorAddon() {
  const [target, setTarget] = useState<Element | null>(null);
  const { data: accountData } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const overrideId = params?.get("country") ?? null;
  const country =
    accountData?.access?.isOrganizer && overrideId
      ? (countries ?? []).find((item) => item.id === overrideId) ?? accountData?.country
      : accountData?.country;

  useEffect(() => {
    const locate = () => {
      const root = document.querySelector(".app-main");
      if (!root) return setTarget(null);
      const headings = Array.from(root.querySelectorAll("h1,h2,h3"));
      const heading = headings.find((node) => node.textContent?.trim() === "Decoration");
      const panel = heading?.closest("section") ?? null;
      if (!panel) return setTarget(null);

      let host = panel.querySelector(":scope > [data-country-flag-layer-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-country-flag-layer-host", "true");
        const grid = panel.querySelector(".grid");
        if (grid) panel.insertBefore(host, grid);
        else panel.appendChild(host);
      }
      setTarget(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target || !country) return null;
  return createPortal(<FlagLayerToggle countryId={country.id} hasFlag={Boolean(country.flag_image)} />, target);
}

function FlagLayerToggle({ countryId, hasFlag }: { countryId: string; hasFlag: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["country-flag-layer", countryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_themes")
        .select("flag_enabled,decoration_style")
        .eq("country_id", countryId)
        .maybeSingle();
      if (error) throw error;
      return (data as { flag_enabled?: boolean | null; decoration_style?: string | null } | null) ?? null;
    },
    staleTime: 10_000,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = data?.decoration_style === "flag" || data?.flag_enabled !== false;

  useEffect(() => {
    document.body.dataset.countryFlag = enabled ? "on" : "off";
    return () => {
      delete document.body.dataset.countryFlag;
    };
  }, [enabled]);

  const setEnabled = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("country_themes")
        .upsert({ country_id: countryId, flag_enabled: next }, { onConflict: "country_id" });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-flag-layer", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-theme", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-themes"] }),
      ]);
      setMessage(next ? "Flag layer on." : "Flag layer off.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Flag setting could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Flag layer</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The flag is separate from the decoration below. Keep it on with Orbits, Grid, Aurora or another object, or turn it off completely.
          </p>
        </div>
        <button
          type="button"
          disabled={isLoading || busy || !hasFlag}
          aria-pressed={enabled}
          onClick={() => void setEnabled(!enabled)}
          className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-45 ${
            enabled
              ? "border-primary/35 bg-primary/15 text-primary"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          {busy ? "Saving…" : enabled ? "Flag on" : "Flag off"}
        </button>
      </div>
      {!hasFlag && (
        <p className="mt-2 text-[11px] text-muted-foreground">Upload a flag first to use this layer.</p>
      )}
      {message && <p className="mt-2 text-[11px] text-muted-foreground">{message}</p>}
    </div>
  );
}
