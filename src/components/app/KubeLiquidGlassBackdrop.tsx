import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Maps = {
  displacementUrl: string;
  specularUrl: string;
  scale: number;
  width: number;
  height: number;
};

const RAY_SAMPLE_COUNT = 127;

function isBlinkEngine() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: unknown }).userAgentData;
  return (
    uaData != null ||
    (/\b(?:Chrome|Chromium|Edg)\//.test(ua) &&
      !/\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/.test(ua) &&
      !/iPhone|iPad|iPod/.test(ua))
  );
}

function convexSquircle(x: number) {
  const clamped = Math.min(1, Math.max(0, x));
  return Math.pow(Math.max(0, 1 - Math.pow(1 - clamped, 4)), 0.25);
}

function squircleDerivative(x: number) {
  const delta = 0.001;
  const a = convexSquircle(Math.max(0, x - delta));
  const b = convexSquircle(Math.min(1, x + delta));
  return (b - a) / (2 * delta);
}

function buildRaySamples(
  bezel: number,
  glassThickness: number,
  scaleDown: number,
) {
  const samples = new Float32Array(RAY_SAMPLE_COUNT);
  const nAir = 1;
  const nGlass = 1.5;

  for (let index = 0; index < RAY_SAMPLE_COUNT; index += 1) {
    const t = index / (RAY_SAMPLE_COUNT - 1);
    if (t >= 0.999) {
      samples[index] = 0;
      continue;
    }

    const slope = Math.abs(squircleDerivative(t));
    const incidence = Math.atan(Math.min(32, slope));
    const refracted = Math.asin(
      Math.min(0.999, (nAir / nGlass) * Math.sin(incidence)),
    );
    const rayBend = Math.max(0, incidence - refracted);
    samples[index] = Math.min(
      28 / scaleDown,
      Math.tan(rayBend) * Math.min(bezel, glassThickness),
    );
  }

  return samples;
}

function roundedRectSdf(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - (width / 2 - radius);
  const qy = Math.abs(py) - (height / 2 - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

function roundedRectNormal(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const eps = 0.75;
  const dx =
    roundedRectSdf(x + eps, y, width, height, radius) -
    roundedRectSdf(x - eps, y, width, height, radius);
  const dy =
    roundedRectSdf(x, y + eps, width, height, radius) -
    roundedRectSdf(x, y - eps, width, height, radius);
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function buildMaps(width: number, height: number): Maps | null {
  if (typeof document === "undefined" || width < 2 || height < 2) return null;

  const scaleDown = Math.max(1, Math.max(width, height) / 420);
  const mapWidth = Math.max(2, Math.round(width / scaleDown));
  const mapHeight = Math.max(2, Math.round(height / scaleDown));
  const radius = Math.min(mapHeight / 2 - 1, 30 / scaleDown);
  const bezel = Math.max(8, Math.min(mapHeight * 0.42, 24 / scaleDown));
  const glassThickness = 18 / scaleDown;
  const raySamples = buildRaySamples(bezel, glassThickness, scaleDown);
  const lightAngle = (-60 * Math.PI) / 180;
  const light = { x: Math.cos(lightAngle), y: Math.sin(lightAngle) };

  const displacementCanvas = document.createElement("canvas");
  displacementCanvas.width = mapWidth;
  displacementCanvas.height = mapHeight;
  const displacementCtx = displacementCanvas.getContext("2d");
  const specularCanvas = document.createElement("canvas");
  specularCanvas.width = mapWidth;
  specularCanvas.height = mapHeight;
  const specularCtx = specularCanvas.getContext("2d");
  if (!displacementCtx || !specularCtx) return null;

  const displacement = displacementCtx.createImageData(mapWidth, mapHeight);
  const specular = specularCtx.createImageData(mapWidth, mapHeight);
  const vectors = new Float32Array(mapWidth * mapHeight * 2);
  let maximumDisplacement = 0;

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = y * mapWidth + x;
      const sdf = roundedRectSdf(x + 0.5, y + 0.5, mapWidth, mapHeight, radius);
      if (sdf > 0) continue;

      const distanceFromEdge = Math.min(bezel, Math.max(0, -sdf));
      const t = Math.min(1, distanceFromEdge / bezel);
      const sampleIndex = Math.min(
        RAY_SAMPLE_COUNT - 1,
        Math.max(0, Math.round(t * (RAY_SAMPLE_COUNT - 1))),
      );
      const magnitude = raySamples[sampleIndex];

      const normal = roundedRectNormal(
        x + 0.5,
        y + 0.5,
        mapWidth,
        mapHeight,
        radius,
      );

      const vx = -normal.x * magnitude;
      const vy = -normal.y * magnitude;
      vectors[index * 2] = vx;
      vectors[index * 2 + 1] = vy;
      maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(vx, vy));

      const edge = Math.pow(1 - t, 1.8);
      const directional = Math.max(0, normal.x * light.x + normal.y * light.y);
      const highlight = Math.min(1, edge * (0.16 + directional * 1.35));
      const specularOffset = index * 4;
      specular.data[specularOffset] = 255;
      specular.data[specularOffset + 1] = 255;
      specular.data[specularOffset + 2] = 255;
      specular.data[specularOffset + 3] = Math.round(highlight * 51);
    }
  }

  const max = maximumDisplacement || 1;
  for (let index = 0; index < mapWidth * mapHeight; index += 1) {
    const x = vectors[index * 2] / max;
    const y = vectors[index * 2 + 1] / max;
    const offset = index * 4;
    displacement.data[offset] = Math.round(128 + x * 127);
    displacement.data[offset + 1] = Math.round(128 + y * 127);
    displacement.data[offset + 2] = 128;
    displacement.data[offset + 3] = 255;
  }

  displacementCtx.putImageData(displacement, 0, 0);
  specularCtx.putImageData(specular, 0, 0);

  return {
    displacementUrl: displacementCanvas.toDataURL("image/png"),
    specularUrl: specularCanvas.toDataURL("image/png"),
    scale: max * scaleDown,
    width: mapWidth,
    height: mapHeight,
  };
}

function sanitizeClone(clone: HTMLElement) {
  clone.classList.add("solaris-kube-mirror-clone");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  clone.querySelectorAll("[for]").forEach((element) => element.removeAttribute("for"));
  clone
    .querySelectorAll("script, iframe, video, audio, .solaris-app-tabbar, .solaris-app-toolbar")
    .forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("input,button,select,textarea,a").forEach((node) => {
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
  });
  return clone;
}

export function KubeLiquidGlassBackdrop({
  className,
  sourceKey,
}: {
  className?: string;
  sourceKey?: string;
}) {
  const rawId = useId();
  const filterId = useMemo(
    () => `solaris-kube-liquid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId],
  );
  const surfaceRef = useRef<HTMLSpanElement | null>(null);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);
  const [maps, setMaps] = useState<Maps | null>(null);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    setBlink(isBlinkEngine());
  }, []);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        setMaps(buildMaps(Math.round(rect.width), Math.round(rect.height)));
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (blink) return;

    const surface = surfaceRef.current;
    const mirror = mirrorRef.current;
    const source = document.querySelector<HTMLElement>(".app-main");
    if (!surface || !mirror || !source) return;

    let currentClone: HTMLElement | null = null;
    let alignFrame = 0;
    let cloneTimer = 0;

    const align = () => {
      cancelAnimationFrame(alignFrame);
      alignFrame = requestAnimationFrame(() => {
        const clone = currentClone;
        if (!clone) return;
        const sourceRect = source.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();

        clone.style.width = `${sourceRect.width}px`;
        clone.style.minWidth = `${sourceRect.width}px`;
        clone.style.maxWidth = "none";
        clone.style.left = `${sourceRect.left - surfaceRect.left}px`;
        clone.style.top = `${sourceRect.top - surfaceRect.top}px`;
      });
    };

    const rebuild = () => {
      const clone = sanitizeClone(source.cloneNode(true) as HTMLElement);
      clone.style.position = "absolute";
      clone.style.margin = "0";
      clone.style.pointerEvents = "none";
      clone.style.userSelect = "none";
      currentClone = clone;
      mirror.replaceChildren(clone);
      align();
    };

    const scheduleRebuild = () => {
      window.clearTimeout(cloneTimer);
      cloneTimer = window.setTimeout(rebuild, 160);
    };

    rebuild();

    const resizeObserver = new ResizeObserver(align);
    resizeObserver.observe(surface);
    resizeObserver.observe(source);

    const mutationObserver = new MutationObserver(scheduleRebuild);
    mutationObserver.observe(source, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "src", "href", "hidden", "aria-hidden"],
    });

    window.addEventListener("scroll", align, { passive: true });
    window.addEventListener("resize", align, { passive: true });

    return () => {
      cancelAnimationFrame(alignFrame);
      window.clearTimeout(cloneTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", align);
      window.removeEventListener("resize", align);
      mirror.replaceChildren();
    };
  }, [blink, sourceKey]);

  const backdropFilter = blink && maps ? `url(#${filterId})` : "none";
  const mirrorFilter = !blink && maps ? `url(#${filterId})` : "none";

  return (
    <>
      {maps ? (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
          className="solaris-kube-liquid-filter"
        >
          <defs>
            <filter
              id={filterId}
              x="0"
              y="0"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="9.5" result="blurred" />
              <feImage
                href={maps.displacementUrl}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="displacement-map"
              />
              <feDisplacementMap
                in="blurred"
                in2="displacement-map"
                scale={maps.scale * 0.7}
                xChannelSelector="R"
                yChannelSelector="G"
                result="refracted"
              />
              <feImage
                href={maps.specularUrl}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="specular"
              />
              <feBlend in="refracted" in2="specular" mode="screen" />
            </filter>
          </defs>
        </svg>
      ) : null}

      <span
        ref={surfaceRef}
        aria-hidden="true"
        data-kube-liquid-glass={blink ? "svg-refraction" : "safari-mirrored-refraction"}
        className={cn("solaris-app-tabbar-backdrop", className)}
        style={
          blink
            ? {
                WebkitBackdropFilter: backdropFilter,
                backdropFilter,
              }
            : undefined
        }
      >
        {!blink ? (
          <span
            ref={mirrorRef}
            className="solaris-kube-safari-mirror"
            style={{
              WebkitFilter: mirrorFilter,
              filter: mirrorFilter,
            }}
          />
        ) : null}
      </span>
    </>
  );
}
