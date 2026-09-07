import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import "@/anniversary-interactive.css";
import "@/anniversary-result-lab.css";
import { useAllShows, useEditions } from "@/lib/data";

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  if (element instanceof HTMLInputElement) element.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectAfterLabel(labelText: string) {
  const labels = [...document.querySelectorAll<HTMLLabelElement>(".app-main label")];
  const label = labels.find((item) => item.textContent?.trim().toLowerCase() === labelText.toLowerCase());
  return label?.nextElementSibling instanceof HTMLSelectElement ? label.nextElementSibling : null;
}

function applyModel({
  juryWeight,
  blendMode,
  juryScheme,
  tieBreak,
}: {
  juryWeight: number;
  blendMode: "raw" | "normalized" | "rank";
  juryScheme: "original" | "classic" | "linear10" | "top5" | "winner";
  tieBreak: "televote" | "jury" | "official" | "alphabetical";
}) {
  const range = document.querySelector<HTMLInputElement>('.app-main input[type="range"]');
  if (range) setNativeValue(range, String(juryWeight));
  const blend = selectAfterLabel("Blend method");
  if (blend) setNativeValue(blend, blendMode);
  const jury = selectAfterLabel("Jury scoring");
  if (jury && !jury.disabled) setNativeValue(jury, juryScheme);
  const tie = selectAfterLabel("Tie-break");
  if (tie) setNativeValue(tie, tieBreak);
}

function chooseEdition(editionId: string | null) {
  if (!editionId) return;
  const editionSelect = selectAfterLabel("Edition");
  if (!editionSelect) return;
  setNativeValue(editionSelect, editionId);
  window.setTimeout(() => {
    const showSelect = selectAfterLabel("Show");
    if (!showSelect || showSelect.disabled) return;
    const option = [...showSelect.options].find((item) => /grand|final/i.test(item.text)) ?? [...showSelect.options].find((item) => Boolean(item.value));
    if (option?.value) setNativeValue(showSelect, option.value);
  }, 250);
}

export function AnniversaryResultLabPresets() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();

  const archiveTargets = useMemo(() => {
    const showEditionIds = new Set((shows ?? []).filter((show) => show.published).map((show) => show.edition_id));
    const available = (editions ?? [])
      .filter((edition) => edition.published && showEditionIds.has(edition.id))
      .sort((a, b) => (a.edition_number ?? 0) - (b.edition_number ?? 0));
    return { first: available[0]?.id ?? null, latest: available.at(-1)?.id ?? null };
  }, [editions, shows]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".app-main");
      if (!main) return;
      const mount = document.createElement("div");
      mount.className = "anniv-deep-host anniv-result-lab-host";
      const header = main.querySelector<HTMLElement>(".page-header");
      if (header?.parentElement) header.insertAdjacentElement("afterend", mount);
      else main.prepend(mount);
      setHost(mount);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      setHost((current) => {
        current?.remove();
        return null;
      });
    };
  }, []);

  const run = (
    title: string,
    editionId: string | null,
    model: Parameters<typeof applyModel>[0],
  ) => {
    chooseEdition(editionId);
    window.setTimeout(() => applyModel(model), 320);
    setMessage(`${title} loaded. The official result is untouched; only Result Lab changed.`);
  };

  if (!host) return null;

  return createPortal(
    <section className="anniv-deep anniv-deep--compact" aria-label="Anniversary Result Lab presets">
      <div className="anniv-deep-head">
        <div>
          <p>Anniversary Result Lab</p>
          <h2>Historic what-if presets</h2>
          <span>These shortcuts load an archive edge plus a voting model into the existing simulator. Nothing here changes an official scoreboard.</span>
        </div>
      </div>
      <div className="anniv-interactive-presets">
        <button type="button" onClick={() => run("First chapter · jury only", archiveTargets.first, { juryWeight: 100, blendMode: "raw", juryScheme: "original", tieBreak: "jury" })}>
          <small>First published chapter</small>
          <strong>What if juries decided everything?</strong>
          <span>Jury 100% · original ballots</span>
        </button>
        <button type="button" onClick={() => run("Latest chapter · televote only", archiveTargets.latest, { juryWeight: 0, blendMode: "raw", juryScheme: "original", tieBreak: "televote" })}>
          <small>Latest published chapter</small>
          <strong>What if the public decided everything?</strong>
          <span>Televote 100%</span>
        </button>
        <button type="button" onClick={() => run("Latest chapter · rank blend", archiveTargets.latest, { juryWeight: 50, blendMode: "rank", juryScheme: "classic", tieBreak: "official" })}>
          <small>Anniversary experiment</small>
          <strong>Modern 50/50 rank blend</strong>
          <span>Classic jury scale · official-rank tie-break</span>
        </button>
      </div>
      {message ? <p className="anniv-interactive-message">{message}</p> : null}
    </section>,
    host,
  );
}
