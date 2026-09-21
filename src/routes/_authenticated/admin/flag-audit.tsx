import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { FlagFrame, FlagMedia, clampFlagCrop, type FlagCrop } from "@/components/FlagMedia";
import { supabase } from "@/integrations/supabase/client";
import { useCountries, type Country } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/flag-audit")({
  head: () => ({ meta: [{ title: "Flag QA — Solaris Organizer" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FlagAudit,
});

function FlagAudit() {
  const { data: countries = [], isLoading, error } = useCountries();
  const [selected, setSelected] = useState<string | null>(null);
  const current = countries.find((country) => country.id === selected) ?? countries[0];
  return <AdminPage>
    <div className="mx-auto max-w-6xl px-4 py-8 text-foreground">
      <p className="text-xs uppercase tracking-[.18em] text-primary">Solaris Organizer · Media QA</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Country flags</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">The original image remains untouched. Standard flag views share this 3:2 crop. Check emblems at small sizes before saving.</p>
      {error ? <p role="alert" className="mt-5 text-red-300">Country flags could not be loaded.</p> : null}
      {isLoading ? <p className="mt-5">Loading flags…</p> : null}
      {current ? <CropEditor key={current.id} country={current} /> : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {countries.map((country) => <AuditCard key={country.id} country={country} active={country.id === current?.id} onSelect={() => setSelected(country.id)} />)}
      </div>
    </div>
  </AdminPage>;
}

function AuditCard({ country, active, onSelect }: { country: Country; active: boolean; onSelect: () => void }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ratio = size ? size.width / size.height : null;
  return <button type="button" onClick={onSelect} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-surface/70 hover:border-primary/50"}`}>
    <span className="mb-3 block font-semibold">{country.name} <span className="text-xs font-normal text-muted-foreground">{country.short_code}</span></span>
    <span className="grid grid-cols-2 items-center gap-3">
      <span className="min-w-0"><span className="mb-1 block text-[10px] uppercase tracking-wider">Original</span>{country.flag_image ? <img src={country.flag_image} alt="" loading="lazy" className="max-h-24 max-w-full rounded-md object-contain" onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /> : <span>Missing</span>}</span>
      <span className="min-w-0"><span className="mb-1 block text-[10px] uppercase tracking-wider">Solaris 3:2</span><FlagFrame image={country.flag_image} alt={`Flag of ${country.name}`} fallback={country.short_code} className="w-full rounded-lg" /></span>
    </span>
    <span className="mt-3 block text-xs text-muted-foreground">{ratio ? `${size?.width} × ${size?.height} · ${Math.abs(ratio - 1.5) < .015 ? "3:2" : "Review crop"}` : "Inspect original"}</span>
  </button>;
}

function CropEditor({ country }: { country: Country }) {
  const queryClient = useQueryClient();
  const [crop, setCrop] = useState<FlagCrop>({ x: country.flag_crop_x ?? 50, y: country.flag_crop_y ?? 50, zoom: country.flag_crop_zoom ?? 1 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pointer = useRef<{ x: number; y: number; crop: FlagCrop } | null>(null);
  const dirty = crop.x !== Number(country.flag_crop_x ?? 50) || crop.y !== Number(country.flag_crop_y ?? 50) || crop.zoom !== Number(country.flag_crop_zoom ?? 1);
  useEffect(() => { setCrop({ x: Number(country.flag_crop_x ?? 50), y: Number(country.flag_crop_y ?? 50), zoom: Number(country.flag_crop_zoom ?? 1) }); }, [country.id, country.flag_crop_x, country.flag_crop_y, country.flag_crop_zoom]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointer.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - pointer.current.x) / rect.width) * 100;
    const dy = ((event.clientY - pointer.current.y) / rect.height) * 100;
    setCrop(clampFlagCrop({ ...pointer.current.crop, x: pointer.current.crop.x - dx, y: pointer.current.crop.y - dy }));
  }
  async function save() {
    setSaving(true); setMessage("");
    const { error } = await supabase.from("countries").update({ flag_crop_x: crop.x, flag_crop_y: crop.y, flag_crop_zoom: crop.zoom }).eq("id", country.id).select("id").single();
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["countries"] });
    setMessage("Crop saved for every Solaris flag view.");
  }
  return <section className="mt-7 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-label={`Edit ${country.name} flag crop`}>
    <h2 className="text-xl font-semibold">{country.name} · display crop</h2>
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,.8fr)]">
      <div className="min-w-0">
        <div className="aspect-[3/2] w-full max-w-xl touch-none overflow-hidden rounded-xl border border-border" onPointerDown={(event) => { pointer.current = { x: event.clientX, y: event.clientY, crop }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}>
          {country.flag_image ? <FlagMedia image={country.flag_image} alt={`Display crop of ${country.name}`} crop={crop} className="h-full w-full" /> : <p className="p-4">Upload an original flag first.</p>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Drag to reposition. Recommended original: 3:2, at least 1500 × 1000. Source remains available at its original ratio.</p>
      </div>
      <div className="space-y-4">
        {(["x", "y", "zoom"] as const).map((key) => <label key={key} className="block text-sm font-medium">{key === "x" ? "Horizontal focus" : key === "y" ? "Vertical focus" : "Zoom"} · {crop[key]}{key === "zoom" ? "×" : "%"}<input type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 2 : 100} step={key === "zoom" ? .05 : 1} value={crop[key]} onChange={(event) => setCrop(clampFlagCrop({ ...crop, [key]: Number(event.target.value) }))} className="mt-2 block w-full" /></label>)}
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setCrop({ x: 50, y: 50, zoom: 1 })} className="min-h-11 rounded-lg border border-border px-4">Reset / center</button><button type="button" disabled={!dirty || saving || !country.flag_image} onClick={() => void save()} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save crop"}</button></div>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        <div className="flex items-end gap-4 rounded-xl border border-border p-3"><FlagFrame image={country.flag_image} crop={crop} alt={`Flag of ${country.name}`} fallback={country.short_code} className="h-16 w-24 rounded-lg" /><FlagFrame image={country.flag_image} crop={crop} alt={`Flag of ${country.name}`} fallback={country.short_code} className="h-8 w-12 rounded-md" /><FlagFrame image={country.flag_image} crop={crop} alt={`Flag of ${country.name}`} fallback={country.short_code} className="h-5 w-7.5 rounded-[3px]" /></div>
      </div>
    </div>
  </section>;
}
