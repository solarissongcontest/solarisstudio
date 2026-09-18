import { useEffect, useMemo, useRef, useState } from "react";

import {
  hasVerifiedCountryGeography,
  type CountryGeography,
} from "@/lib/country-semantic-model";

const MAPLIBRE_VERSION = "6.10.0";
const MAPLIBRE_MODULE_URL =
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs`;
const MAPLIBRE_CSS_URL =
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

type MapLibreMap = {
  on: (event: string, callback: () => void) => void;
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: unknown) => void;
  remove: () => void;
};

type MapLibreModule = {
  Map: new (options: Record<string, unknown>) => MapLibreMap;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
  AttributionControl: new (options?: Record<string, unknown>) => unknown;
};

function ensureMapLibreCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[data-solaris-maplibre="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS_URL;
  link.dataset.solarisMaplibre = "true";
  document.head.appendChild(link);
}

function geoJsonBounds(geojson: Record<string, unknown>) {
  const values: Array<[number, number]> = [];

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      values.push([value[0], value[1]]);
      return;
    }
    value.forEach(visit);
  };

  const geometry =
    geojson.type === "Feature" && geojson.geometry && typeof geojson.geometry === "object"
      ? geojson.geometry as Record<string, unknown>
      : geojson;
  visit(geometry.coordinates);

  if (!values.length) return null;
  const longitudes = values.map(([longitude]) => longitude);
  const latitudes = values.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  if (![west, east, south, north].every(Number.isFinite)) return null;
  return [[west, south], [east, north]] as [[number, number], [number, number]];
}

async function loadMapLibre() {
  // Vite must leave this browser-only remote ESM import untouched. MapLibre's
  // own documentation supports direct, pinned CDN ESM loading.
  const dynamicImport = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<MapLibreModule>;
  return dynamicImport(MAPLIBRE_MODULE_URL);
}

export function AtlasMapModule({
  countryName,
  region,
  geography,
}: {
  countryName: string;
  region?: string | null;
  geography?: CountryGeography | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const hasGeography = hasVerifiedCountryGeography(geography);

  const explicitBounds = useMemo(() => {
    if (!geography?.bounds) return null;
    const [west, south, east, north] = geography.bounds;
    return [[west, south], [east, north]] as [[number, number], [number, number]];
  }, [geography?.bounds]);

  useEffect(() => {
    if (!hasGeography || !containerRef.current || typeof window === "undefined") return;

    let cancelled = false;
    let map: MapLibreMap | null = null;
    setState("loading");
    ensureMapLibreCss();

    void loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;

        const center = geography?.center ?? [0, 0];
        map = new maplibre.Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center,
          zoom: geography?.center ? 4 : 1,
          attributionControl: false,
          cooperativeGestures: true,
        });

        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");

        map.on("load", () => {
          if (cancelled || !map) return;

          if (geography?.geojson) {
            map.addSource("solaris-country", {
              type: "geojson",
              data: geography.geojson,
            });
            map.addLayer({
              id: "solaris-country-fill",
              type: "fill",
              source: "solaris-country",
              paint: {
                "fill-color": "#7f7f7f",
                "fill-opacity": 0.22,
              },
            });
            map.addLayer({
              id: "solaris-country-outline",
              type: "line",
              source: "solaris-country",
              paint: {
                "line-color": "#202020",
                "line-width": 2,
              },
            });
          }

          const bounds = explicitBounds ?? (geography?.geojson ? geoJsonBounds(geography.geojson) : null);
          if (bounds) {
            map.fitBounds(bounds, { padding: 28, maxZoom: 6, duration: 0 });
          }
          setState("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [explicitBounds, geography, hasGeography]);

  if (!hasGeography) {
    return (
      <div className="atlas-geographic-fallback" role="note" aria-label="Geographic information">
        <span className="atlas-geographic-kicker">Geographic record</span>
        <strong>{region || countryName}</strong>
        <span>No verified map geometry is stored for this country yet.</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="atlas-geographic-fallback" role="status">
        <span className="atlas-geographic-kicker">Map unavailable</span>
        <strong>{region || countryName}</strong>
        <span>The geographic record is preserved, but the interactive map could not load.</span>
      </div>
    );
  }

  return (
    <div className="atlas-map-shell" data-map-state={state}>
      <div
        ref={containerRef}
        className="atlas-map-canvas"
        role="region"
        aria-label={`Interactive map of ${countryName}`}
      />
      {state !== "ready" ? (
        <div className="atlas-map-loading" role="status" aria-live="polite">
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
