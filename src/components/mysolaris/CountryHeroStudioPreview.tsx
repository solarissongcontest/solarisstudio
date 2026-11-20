import { useCallback, useEffect, useRef, useState } from "react";

import { CinematicEditorialHero } from "@/components/v3/CinematicEditorialHero";
import type { CountryDesignV2 } from "@/lib/country-design-v2";
import {
  localHeroPreviewDimensionsError,
  localHeroPreviewFileError,
  localHeroPreviewNeedsHighResolutionWarning,
  readLocalHeroImageDimensions,
  sniffLocalHeroImageFormat,
} from "@/lib/country-hero-local-image";
import "@/styles/v3-country-hero-studio-preview.css";

type Experience = "app" | "mobile-web" | "desktop";
const EXPERIENCES: readonly { id: Experience; label: string }[] = [
  { id: "app", label: "Installed app" },
  { id: "mobile-web", label: "Mobile website" },
  { id: "desktop", label: "Desktop" },
];

/**
 * DESIGN PREVIEW ONLY. Read existing verified Country V2 background selection.
 * Do not turn local draft image URLs into publicly published V3 hero truth.
 * A canonical System/Media draft, publication and CAS contract is required first.
 */
export function CountryHeroStudioPreview({
  name,
  nativeName,
  region,
  code,
  flagImage,
  design,
}: {
  name: string;
  nativeName: string | null;
  region: string | null;
  code: string;
  flagImage: string | null;
  design: CountryDesignV2;
}) {
  const [experience, setExperience] = useState<Experience>("app");
  const [localPreview, setLocalPreview] = useState<{
    countryCode: string; url: string; name: string; width: number; height: number;
  } | null>(null);
  const selectionRef = useRef(0);
  const pendingDecodeUrlRef = useRef<string | null>(null);
  const currentCountryRef = useRef(code);
  currentCountryRef.current = code;
  const visibleLocalPreview = localPreview?.countryCode === code ? localPreview : null;
  const [fileError, setFileError] = useState<string | null>(null);
  const [checkingPreview, setCheckingPreview] = useState(false);
  const [draftFocus, setDraftFocus] = useState<[number, number]>([50, 50]);
  const currentImage = design.background.mode === "image"
    ? design.background.imageUrl
    : null;
  const focus = visibleLocalPreview
    ? [draftFocus[0] / 100, draftFocus[1] / 100] as const
    : [
        design.background.positionX / 100,
        design.background.positionY / 100,
      ] as const;

  const cancelPendingDecode = useCallback(() => {
    selectionRef.current += 1;
    const pending = pendingDecodeUrlRef.current;
    pendingDecodeUrlRef.current = null;
    if (pending) URL.revokeObjectURL(pending);
  }, []);

  // Only a browser-local object URL: never write, upload or publish the draft.
  // Revoke old blobs when a different local selection is made or editor unmounts.
  useEffect(() => {
    const url = localPreview?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [localPreview?.url]);

  // Invalidate unresolved decodes when the editor closes or a newer file is chosen.
  useEffect(() => () => { cancelPendingDecode(); }, [cancelPendingDecode]);
  // Country controller changes invalidate pending async reads and local blobs.
  useEffect(() => {
    cancelPendingDecode();
    setLocalPreview(null);
    setFileError(null);
    setCheckingPreview(false);
  }, [code, cancelPendingDecode]);

  const chooseLocalImage = async (file: File | undefined) => {
    if (!file) return;
    cancelPendingDecode();
    const generation = selectionRef.current;
    const selectedCountry = code;
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setFileError("Choose an image between 1 byte and 5 MB.");
      setCheckingPreview(false);
      return;
    }
    setFileError(null);
    setCheckingPreview(true);
    let blobUrl: string | null = null;
    try {
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (generation !== selectionRef.current || selectedCountry !== currentCountryRef.current) return;
      const validationError = localHeroPreviewFileError(file, sniffLocalHeroImageFormat(signature));
      if (validationError) {
        setFileError(validationError);
        return;
      }

      blobUrl = URL.createObjectURL(file);
      pendingDecodeUrlRef.current = blobUrl;
      const dimensions = await readLocalHeroImageDimensions(blobUrl);
      if (generation !== selectionRef.current || selectedCountry !== currentCountryRef.current) {
        URL.revokeObjectURL(blobUrl);
        if (pendingDecodeUrlRef.current === blobUrl) pendingDecodeUrlRef.current = null;
        return;
      }
      // The verified image is now owned by localPreview, not the pending decoder.
      if (pendingDecodeUrlRef.current === blobUrl) pendingDecodeUrlRef.current = null;
      const dimensionsError = localHeroPreviewDimensionsError(dimensions.width, dimensions.height);
      if (dimensionsError) {
        URL.revokeObjectURL(blobUrl);
        setFileError(dimensionsError);
        return;
      }

      setLocalPreview({ countryCode: selectedCountry, url: blobUrl, name: file.name, ...dimensions });
      setDraftFocus([50, 50]);
      setFileError(null);
    } catch {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        if (pendingDecodeUrlRef.current === blobUrl) pendingDecodeUrlRef.current = null;
      }
      if (generation === selectionRef.current && selectedCountry === currentCountryRef.current)
        setFileError("The image could not be decoded. Try another JPEG, PNG or WebP.");
    } finally {
      if (generation === selectionRef.current && selectedCountry === currentCountryRef.current)
        setCheckingPreview(false);
    }
  };

  return (
    <section className="country-hero-preview" aria-label="V3 Country Hero Studio preview">
      <p className="country-hero-preview__note">
        Design preview only. Your selected Country V2 background is shown here
        to test the new cinematic layout; this does not publish a V3 hero.
      </p>
      <div className="country-hero-preview__chooser" aria-busy={checkingPreview}>
        <label className="country-hero-preview__picker">
          Choose image for private preview
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void chooseLocalImage(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {checkingPreview ? (
          <button type="button" className="country-hero-preview__clear"
            onClick={() => { cancelPendingDecode(); setCheckingPreview(false); setFileError(null); }}>
            Cancel image check
          </button>
        ) : null}
        {visibleLocalPreview ? (
          <button type="button" className="country-hero-preview__clear"
            onClick={() => { cancelPendingDecode(); setLocalPreview(null); setFileError(null); setCheckingPreview(false); }}>
            Remove private preview
          </button>
        ) : null}
        <p className="country-hero-preview__upload-note">
          JPEG, PNG or WebP · up to 5 MB · local preview only. No upload or publication occurs.
        </p>
        {checkingPreview ? (
          <p className="country-hero-preview__upload-note" role="status">Checking the local image and its dimensions…</p>
        ) : null}
        {fileError ? <p className="country-hero-preview__error" role="alert">{fileError}</p> : null}
        {visibleLocalPreview ? (
          <>
            <p className="country-hero-preview__filename">
              Preview: {visibleLocalPreview.name} · {visibleLocalPreview.width} × {visibleLocalPreview.height} px
            </p>
            {localHeroPreviewNeedsHighResolutionWarning(visibleLocalPreview.width, visibleLocalPreview.height) ? (
              <p className="country-hero-preview__upload-note" role="status">
                This image may look soft on desktop. For future publication, choose roughly 1920 × 1080 px or larger.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {visibleLocalPreview ? (
        <div className="country-hero-preview__focus" aria-label="Private draft focal point controls">
          <label>
            Horizontal focal point <output>{draftFocus[0]}%</output>
            <input type="range" min="0" max="100" step="1" value={draftFocus[0]}
              onChange={(event) => setDraftFocus((current) => [Number(event.target.value), current[1]])} />
          </label>
          <label>
            Vertical focal point <output>{draftFocus[1]}%</output>
            <input type="range" min="0" max="100" step="1" value={draftFocus[1]}
              onChange={(event) => setDraftFocus((current) => [current[0], Number(event.target.value)])} />
          </label>
        </div>
      ) : null}
      <div className="country-hero-preview__switch" role="group" aria-label="Choose preview experience">
        {EXPERIENCES.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={variant.id === experience}
            onClick={() => setExperience(variant.id)}
          >
            {variant.label}
          </button>
        ))}
      </div>
      <div className="country-hero-preview__frame" data-experience={experience}>
        <div className="country-hero-preview__page">
          <CinematicEditorialHero
            kind="country"
            headingLevel={2}
            eyebrow="Terra Solaris · Country"
            title={name}
            subtitle={[nativeName !== name ? nativeName : null, region].filter(Boolean).join(" · ")}
            imageUrl={visibleLocalPreview?.url ?? currentImage}
            priority={false}
            focalPoint={focus}
            fallbackColors={[design.palette.accent, design.palette.backgroundSecondary]}
          />
          <div className="country-hero-preview__identity">
            <div className="country-hero-preview__flag">
              {flagImage ? (
                <img src={flagImage} alt={`Flag of ${name}`} loading="lazy" />
              ) : (
                <span aria-label={`Flag unavailable for ${name}`}>{code}</span>
              )}
            </div>
            <span className="country-hero-preview__country">{name}</span>
          </div>
          <div className="country-hero-preview__sections" aria-label="Sample section labels">
            <span>Overview</span>
            <span>Entries</span>
            <span>Results</span>
            <span>History</span>
            <span>World</span>
          </div>
          <p className="country-hero-preview__sample">
            Published country facts and participation will flow below this visual transition.
          </p>
        </div>
      </div>
    </section>
  );
}
