import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  useCountryWorldProfile,
  useDeleteCountrySection,
  useMyCountryAccount,
} from "@/lib/country-account";
import {
  useSaveCountryPageSection,
  type CountryPageSection,
} from "@/lib/country-page-builder";
import { buildCountryFunFacts } from "@/lib/country-wiki";
import { useCountries } from "@/lib/data";

const SYSTEM_SLOT = "fun-facts";

function systemSlot(section: CountryPageSection) {
  const json = section.content_json;
  return json && typeof json === "object" ? String(json.systemSlot ?? "") : "";
}

export function CountrySystemFunFactsEditorAddon() {
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
      const heading = headings.find((node) => node.textContent?.trim() === "System-assisted writing");
      const panel = heading?.closest("section") ?? null;
      if (!panel) return setTarget(null);

      let host = panel.querySelector(":scope > [data-system-fun-facts-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-system-fun-facts-host", "true");
        panel.appendChild(host);
      }
      setTarget(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target || !country) return null;
  return createPortal(<FunFactsEditor countryId={country.id} country={country} />, target);
}

function FunFactsEditor({
  countryId,
  country,
}: {
  countryId: string;
  country: NonNullable<ReturnType<typeof useMyCountryAccount>["data"]>["country"];
}) {
  const world = useCountryWorldProfile(countryId);
  const save = useSaveCountryPageSection(countryId);
  const remove = useDeleteCountrySection(countryId);
  const sections = (world.data?.sections ?? []) as CountryPageSection[];
  const override = sections.find((section) => systemSlot(section) === SYSTEM_SLOT) ?? null;
  const generated = useMemo(
    () =>
      country
        ? buildCountryFunFacts({
            country,
            profile: world.data?.profile,
            sections: world.data?.sections,
            mediaCount: world.data?.media?.length ?? 0,
          })
        : [],
    [country, world.data?.media?.length, world.data?.profile, world.data?.sections],
  );

  const savedRows = useMemo(() => {
    const json = override?.content_json as Record<string, unknown> | null | undefined;
    const rows = Array.isArray(json?.customFacts) ? json.customFacts : [];
    return rows
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
      .map((row) => String(row.value ?? "").trim())
      .filter(Boolean);
  }, [override]);

  const [editing, setEditing] = useState(false);
  const [facts, setFacts] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setFacts(savedRows.length ? savedRows : generated);
  }, [editing, generated, savedRows]);

  const begin = () => {
    setFacts(savedRows.length ? savedRows : generated.length ? generated : [""]);
    setMessage(null);
    setEditing(true);
  };

  const saveFacts = async () => {
    const clean = facts.map((fact) => fact.trim()).filter(Boolean).slice(0, 8);
    if (!clean.length) {
      setMessage("Keep at least one fact, or reset to automatic facts.");
      return;
    }
    try {
      await save.mutateAsync({
        id: override?.id,
        heading: "System fun facts override",
        body: "",
        sectionType: "facts",
        contentMode: "manual",
        visibleOnCountry: false,
        visibleOnWiki: false,
        imageLayout: "wide",
        contentJson: {
          systemSlot: SYSTEM_SLOT,
          factMode: "manual",
          customFacts: clean.map((value, index) => ({
            label: `Fact ${String(index + 1).padStart(2, "0")}`,
            value,
          })),
        },
        sortOrder: 9999,
      });
      setMessage("Custom system fun facts saved.");
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fun facts could not be saved.");
    }
  };

  const reset = async () => {
    if (!override) {
      setFacts(generated);
      setEditing(false);
      setMessage("Automatic fun facts are already active.");
      return;
    }
    try {
      await remove.mutateAsync(override.id);
      setFacts(generated);
      setEditing(false);
      setMessage("Automatic Solaris fun facts restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automatic facts could not be restored.");
    }
  };

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">System fun facts</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Solaris still writes these automatically. Edit them only when you want your own wording; resetting switches back to the generated facts.
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={begin} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-[11px] font-semibold">
            Edit facts
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-3 space-y-1.5">
          {(savedRows.length ? savedRows : generated).slice(0, 4).map((fact, index) => (
            <p key={`${index}-${fact}`} className="rounded-lg bg-background/40 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              <strong className="mr-1 text-foreground">{index + 1}.</strong> {fact}
            </p>
          ))}
          {override && <p className="text-[10px] font-semibold text-primary">Using HOD-edited facts</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {facts.map((fact, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto] gap-2">
              <textarea
                value={fact}
                rows={2}
                onChange={(event) => setFacts((current) => current.map((row, i) => i === index ? event.target.value : row))}
                className="min-h-16 resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs"
                placeholder={`Fun fact ${index + 1}`}
              />
              <button
                type="button"
                aria-label="Remove fact"
                disabled={facts.length <= 1}
                onClick={() => setFacts((current) => current.filter((_, i) => i !== index))}
                className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground disabled:opacity-30"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {facts.length < 8 && (
            <button type="button" onClick={() => setFacts((current) => [...current, ""])} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold">
              <Plus className="size-3.5" /> Add fact
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => void reset()} disabled={remove.isPending} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold disabled:opacity-50">
              <RotateCcw className="size-3.5" /> Automatic
            </button>
            <button type="button" onClick={() => void saveFacts()} disabled={save.isPending} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save facts"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{message}</p>}
    </div>
  );
}
