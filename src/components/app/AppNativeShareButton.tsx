import { Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AppNativeShareButton() {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy || typeof window === "undefined") return;

    const url = window.location.href;
    const title =
      document.title.split("—")[0]?.trim() || "Solaris Studio";

    setBusy(true);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied.");
        return;
      }

      toast.error("Sharing is not available on this device.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="solaris-app-toolbar-button"
      aria-label="Share this page"
      disabled={busy}
      onClick={() => void share()}
    >
      <Share2 className="size-5" aria-hidden="true" />
    </button>
  );
}
