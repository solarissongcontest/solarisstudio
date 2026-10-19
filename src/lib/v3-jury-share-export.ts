import {
  buildDefaultJuryShareModel,
  formatJuryShareText,
  type JuryShareFormat,
  type JuryShareProjection,
} from "./v3-jury-share-card-foundation";

export type JuryShareRenderedImage = {
  blob: Blob;
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  width: 1080;
  height: 1920;
};

type LoadedImage = {
  image: CanvasImageSource;
  dispose: () => void;
};

/**
 * This module is intentionally safe to import while TanStack builds the server
 * route graph. Browser globals are only touched after an explicit runtime
 * guard inside user-triggered export helpers.
 */
function ensureBrowser() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("Jury share export requires a browser canvas.");
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function sanitizeFilePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "solaris";
}

function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 700,
) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    if (ctx.measureText(value).width <= maxWidth) return size;
    size -= 2;
  }
  ctx.font = `${weight} ${minSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return minSize;
}

async function loadImage(url: string): Promise<LoadedImage> {
  ensureBrowser();
  const response = await fetch(url, { credentials: "omit", mode: "cors" });
  if (!response.ok) throw new Error(`Could not load share-card asset (${response.status}).`);
  const blob = await response.blob();

  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    return {
      image: bitmap,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  return {
    image,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = "width" in image ? Number(image.width) : width;
  const sourceHeight = "height" in image ? Number(image.height) : height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
  ctx.drawImage(image, sx, sy, cropWidth, cropHeight, x, y, width, height);
}

function canvasToBlob(canvas: HTMLCanvasElement, format: JuryShareFormat): Promise<Blob> {
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "jpeg" ? 0.92 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode jury share image."))),
      mimeType,
      quality,
    );
  });
}

export async function renderDefaultJuryShareImage(
  projection: JuryShareProjection,
  format: JuryShareFormat = "png",
): Promise<JuryShareRenderedImage> {
  ensureBrowser();
  const model = buildDefaultJuryShareModel(projection);
  const canvas = document.createElement("canvas");
  canvas.width = model.width;
  canvas.height = model.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");

  ctx.fillStyle = model.design.background;
  ctx.fillRect(0, 0, model.width, model.height);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  const stars = [
    [86, 122, 3], [182, 228, 2], [318, 104, 2], [491, 174, 3], [688, 118, 2],
    [870, 206, 3], [970, 108, 2], [946, 1732, 2], [774, 1804, 3], [226, 1772, 2],
    [108, 1648, 3], [520, 1826, 2],
  ] as const;
  for (const [x, y, radius] of stars) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = model.design.primaryForeground;
  ctx.font = '800 54px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(model.contestLabel, 86, 184);

  ctx.fillStyle = model.design.secondaryForeground;
  fitText(ctx, model.editionLabel, 908, 36, 28, 700);
  ctx.fillText(model.editionLabel, 86, 236);
  fitText(ctx, model.showLabel, 908, 29, 23, 600);
  ctx.fillText(model.showLabel, 86, 278);

  const rowX = 86;
  const rowWidth = 908;
  const rowHeight = 104;
  const rowGap = 16;
  const firstRowY = 348;
  const flagX = rowX + 24;
  const flagWidth = 112;
  const flagHeight = 74;
  const nameX = flagX + flagWidth + 28;
  const scoreX = rowX + rowWidth - 34;
  const loaded: LoadedImage[] = [];

  try {
    const flags = await Promise.all(
      model.rows.map(async (row) => {
        const asset = await loadImage(row.flagAsset.url);
        loaded.push(asset);
        return asset;
      }),
    );

    for (let index = 0; index < model.rows.length; index += 1) {
      const row = model.rows[index]!;
      const y = firstRowY + index * (rowHeight + rowGap);
      ctx.fillStyle = row.emphasized ? model.design.twelvePointRow : model.design.standardRow;
      roundedRect(ctx, rowX, y, rowWidth, rowHeight, model.design.rowRadius);
      ctx.fill();

      ctx.save();
      roundedRect(ctx, flagX, y + 15, flagWidth, flagHeight, 14);
      ctx.clip();
      drawImageCover(ctx, flags[index]!.image, flagX, y + 15, flagWidth, flagHeight);
      ctx.restore();

      const foreground = row.emphasized
        ? model.design.twelvePointForeground
        : model.design.standardRowForeground;
      ctx.fillStyle = foreground;
      ctx.textBaseline = "middle";
      fitText(ctx, row.country, 610, 36, 25, 750);
      ctx.fillText(row.country, nameX, y + rowHeight / 2);

      ctx.font = '800 42px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = "right";
      ctx.fillText(row.pointsLabel, scoreX, y + rowHeight / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    const footerY = 1668;
    ctx.fillStyle = model.design.secondaryForeground;
    ctx.font = '800 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(model.footerLabel, 86, footerY);

    ctx.fillStyle = model.design.primaryForeground;
    fitText(ctx, model.footerCountry, 650, 62, 38, 850);
    ctx.fillText(model.footerCountry, 86, footerY + 74);

    const sourceFlag = await loadImage(projection.source.flagAsset.url);
    loaded.push(sourceFlag);
    ctx.save();
    roundedRect(ctx, 790, footerY - 20, 204, 136, 22);
    ctx.clip();
    drawImageCover(ctx, sourceFlag.image, 790, footerY - 20, 204, 136);
    ctx.restore();

    ctx.fillStyle = "rgba(184,201,230,0.8)";
    ctx.font = '600 21px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText("Official published jury vote", 86, 1842);

    const blob = await canvasToBlob(canvas, format);
    const edition = projection.edition.number == null
      ? sanitizeFilePart(projection.edition.slug)
      : `ssc${projection.edition.number}`;
    const show = sanitizeFilePart(projection.show.name);
    const source = sanitizeFilePart(projection.source.displayName);
    const extension = format === "png" ? "png" : "jpg";

    return {
      blob,
      fileName: `solaris-${edition}-${show}-${source}-jury.${extension}`,
      mimeType: format === "png" ? "image/png" : "image/jpeg",
      width: 1080,
      height: 1920,
    };
  } finally {
    loaded.forEach((asset) => asset.dispose());
  }
}

export function downloadJuryShareImage(image: JuryShareRenderedImage) {
  ensureBrowser();
  const url = URL.createObjectURL(image.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = image.fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function shareJuryShareImage(
  image: JuryShareRenderedImage,
): Promise<"shared" | "download_fallback"> {
  ensureBrowser();
  const file = new File([image.blob], image.fileName, { type: image.mimeType });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: "Solaris jury votes" });
    return "shared";
  }

  downloadJuryShareImage(image);
  return "download_fallback";
}

export function buildJuryShareAltDescription(projection: JuryShareProjection) {
  const source = projection.source.shortDisplayName ?? projection.source.displayName;
  const voteSummary = projection.votes
    .slice()
    .sort((a, b) => b.points - a.points)
    .map((vote) => `${vote.points} points to ${vote.shortDisplayName ?? vote.displayName}`)
    .join(", ");
  return `${source} jury vote for ${projection.edition.name} · ${projection.show.name}. ${voteSummary}.`;
}

export async function copyJuryShareText(projection: JuryShareProjection) {
  ensureBrowser();
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable.");
  }
  await navigator.clipboard.writeText(formatJuryShareText(projection));
}
