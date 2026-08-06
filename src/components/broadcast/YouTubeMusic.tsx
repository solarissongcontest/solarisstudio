"use client";

/**
 * Background music for the broadcast, played from a YouTube video.
 * Rendered off-screen unless the organizer wants the player visible.
 */

import { useEffect, useRef } from "react";
import type { MusicConfig } from "@/lib/scoreboard";

/** Accepts a full YouTube URL (watch, youtu.be, embed, shorts) or a bare video id. */
export function youtubeId(input: string): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  if (/^[\w-]{11}$/.test(v)) return v;
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(v);
  return m ? m[1] : null;
}

export function YouTubeMusic({ music, playing }: { music: MusicConfig; playing: boolean }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const id = youtubeId(music.youtubeUrl);

  useEffect(() => {
    if (!id || !music.enabled) return;
    const win = frame.current?.contentWindow;
    if (!win) return;
    const send = (func: string, args: unknown[] = []) =>
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    send("setVolume", [music.volume]);
    send(playing ? "playVideo" : "pauseVideo");
  }, [playing, id, music.enabled, music.volume]);

  if (!id || !music.enabled) return null;

  const src =
    `https://www.youtube.com/embed/${id}?enablejsapi=1&controls=${music.showPlayer ? 1 : 0}` +
    `&autoplay=${music.autoplay ? 1 : 0}&loop=${music.loop ? 1 : 0}&playlist=${id}` +
    `&start=${Math.max(0, music.startSeconds)}&modestbranding=1&rel=0&playsinline=1`;

  return (
    <iframe
      ref={frame}
      title="Broadcast background music"
      src={src}
      allow="autoplay; encrypted-media"
      className={
        music.showPlayer
          ? "fixed bottom-3 right-3 z-40 h-[124px] w-[220px] rounded-xl border border-white/15"
          : "pointer-events-none fixed h-px w-px opacity-0"
      }
      style={music.showPlayer ? undefined : { left: -9999, top: -9999 }}
    />
  );
}
