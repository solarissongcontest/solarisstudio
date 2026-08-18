import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Palette } from "lucide-react";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions } from "@/lib/data";
import {
  DEFAULT_THEME,
  editionThemeToVisual,
  extractThemeFromImage,
  saveEditionVisualTheme,
  uploadEditionArtwork,
} from "@/lib/visual-theme";

const supabase = typedSupabase as any;

type EditionArtworkRow = {
  id: string;
  slug: string;
  name: string;
  edition_number: number | null;
  logo?: string | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
  theme_colors?: unknown;
};

export function EditionArtworkControl({ slug }: { slug: string }) {
  const { data: editions } = useEditions();
  const qc = useQueryClient();
  const edition = useMemo(() => (editions ?? []).find((item) => item.slug === slug) as EditionArtworkRow | undefined, [editions, slug]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!edition) return null;
  const artworkUrl = edition.artwork_url ?? null;

  const upload = async (file: File) => {
    setBusy(true);
    setMessage("Uploading artwork and reading its colours…");
    try {
      const extracted = await extractThemeFromImage(file);
      const asset = await uploadEditionArtwork(edition.id, file);
      await saveEditionVisualTheme({
        editionId: edition.id,
        artworkUrl: asset.publicUrl,
        artworkStoragePath: asset.storagePath,
        theme: extracted.theme,
        palette: extracted.palette,
        generatedFromArtwork: true,
      });

      const { error: compatibilityError } = await supabase.from("editions").update({ logo: asset.publicUrl }).eq("id", edition.id);
      if (compatibilityError) throw compatibilityError;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["editions"] }),
        qc.invalidateQueries({ queryKey: ["edition"] }),
        qc.invalidateQueries({ queryKey: ["themes"] }),
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["all-shows"] }),
      ]);
      setMessage("Official artwork saved. It will appear uncropped on the public edition page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artwork could not be uploaded.");
    } finally {
      setBusy(false);
    }
  };

  const currentTheme = editionThemeToVisual(edition.theme_colors) ?? DEFAULT_THEME;

  return (
    <section className="admin-card overflow-hidden">
      <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.7fr)]">
        <div className="min-w-0">
          <p className="admin-section-label">Official artwork</p>
          <h2 className="mt-1 text-base font-bold text-foreground sm:text-lg">Edition artwork</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">Upload the official {editionLabel(edition as any)} artwork. Solaris preserves the full image without cropping it and can use its colours as the starting point for the edition visual identity.</p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="admin-action-primary cursor-pointer">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {busy ? "Processing artwork…" : artworkUrl ? "Replace artwork" : "Upload artwork"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
            </label>
            <Link to="/admin/edition-theme/$slug" params={{ slug }} className="admin-action-secondary"><Palette className="size-4" /> Fine-tune colours</Link>
          </div>

          {message ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{message}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{[currentTheme.backgroundPrimary, currentTheme.backgroundSecondary, currentTheme.accent, currentTheme.surface].map((color) => <span key={color} className="h-5 w-10 rounded-full border border-white/10" style={{ background: color }} title={color} />)}</div>
        </div>

        <div className="grid min-h-44 place-items-center overflow-hidden rounded-2xl border border-white/[0.07] bg-black/10 p-3">
          {artworkUrl ? <img src={artworkUrl} alt={`${editionLabel(edition as any)} official artwork`} className="block h-auto max-h-64 w-auto max-w-full rounded-xl object-contain" /> : <div className="text-center text-xs text-muted-foreground"><ImagePlus className="mx-auto mb-2 size-6 opacity-60" />No official artwork uploaded yet</div>}
        </div>
      </div>
    </section>
  );
}
