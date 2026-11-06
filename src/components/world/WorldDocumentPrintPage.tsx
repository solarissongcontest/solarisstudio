import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Printer } from "lucide-react";
import { useState } from "react";

import { getWorldDocumentDetail, isWorldSlug } from "@/lib/world-public-documents";
import { buildWorldPublicPrintModel } from "@/lib/world-public-document-print";

const STYLES = `
@page { size: A4 portrait; margin: 17mm 18mm; }
@media print {
  html,body { background: #fff !important; color: #111 !important; }
  .world-print-page { background: #fff !important; padding: 0 !important; min-height: 0 !important; color: #111 !important; }
  .world-print-toolbar, .world-print-actions, .world-print-screen-note { display: none !important; }
  .world-print-document { max-width: none !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
  .world-print-article { break-inside: auto; }
  .world-print-article h2 { break-after: avoid-page; }
  .world-print-article p { orphans: 3; widows: 3; }
  .world-print-meta { border-color: #777 !important; }
  a { color: #111 !important; text-decoration: none !important; }
}
`;

export function WorldDocumentPrintPage({
  organization, document, version,
}: { organization: string; document: string; version?: number | null }) {
  const [copy, setCopy] = useState<"idle" | "done" | "error">("idle");
  const valid = isWorldSlug(organization) && isWorldSlug(document) &&
    (version === undefined || (Number.isSafeInteger(version) && version > 0));
  const query = useQuery({
    queryKey: ["v3", "tg4", "public-document-print", organization, document, version ?? "current"],
    enabled: valid,
    queryFn: ({ signal }) => getWorldDocumentDetail({ organization, document, version: version ?? undefined }, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 90_000,
  });
  let sourceError = false;
  let model: ReturnType<typeof buildWorldPublicPrintModel> = null;
  // A cached legal version is not fresh publication authority. Verify after
  // every mount and hide it during background checks or failed refetches.
  if (query.isSuccess && query.isFetchedAfterMount && !query.isFetching && !query.isRefetchError) {
    try {
      model = buildWorldPublicPrintModel(query.data, { organization, document, version: version ?? undefined });
    } catch {
      sourceError = true;
    }
  }

  async function copyCitation(citation: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(citation);
      setCopy("done");
    } catch {
      setCopy("error");
    }
  }

  return (
    <div className="world-print-page min-h-screen bg-slate-100 py-6 text-slate-950 dark:bg-slate-950 sm:py-10">
      <style>{STYLES}</style>
      <div className="world-print-toolbar mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/world/documents/$organization/$document"
          params={{organization,document}}
          search={{version: version ?? undefined}}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2">
          <ArrowLeft aria-hidden="true" className="size-4" /> Document reader
        </Link>
        {model && <div className="world-print-actions flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyCitation(model.citation)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
            {copy==="done" ? <Check aria-hidden="true" className="size-4"/> : <Copy aria-hidden="true" className="size-4" />}
            Copy citation
          </button>
          <button type="button" onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2">
            <Printer aria-hidden="true" className="size-4" /> Print or save as PDF
          </button>
          {copy==="done" ? <span role="status" className="self-center text-xs text-slate-700">Citation copied</span> : null}
          {copy==="error" ? <span role="alert" className="self-center text-xs text-red-700">Clipboard unavailable. Select the citation below instead.</span> : null}
        </div>}
      </div>
      <main className="world-print-document mx-auto min-h-[60vh] max-w-4xl border border-slate-200 bg-white px-6 py-9 shadow-sm sm:px-12 sm:py-14">
        {!valid ? <p role="alert" className="text-sm">Invalid document link or Version number.</p>
        : query.isError || query.isRefetchError ? (
          <section role="alert" className="space-y-3">
            <h1 className="text-xl font-bold">The legal text could not be verified</h1>
            <p className="text-sm">The public document service may be unavailable. Nothing will be printed without canonical source data.</p>
            <button onClick={() => void query.refetch()} className="world-print-actions min-h-11 rounded-xl border border-slate-300 px-4 text-sm" type="button">Retry</button>
          </section>
        ) : query.isPending || query.isFetching || !query.isFetchedAfterMount ? (
          <p role="status" className="text-sm">Verifying the latest published legal text…</p>
        ) : sourceError || !model ? (
          <p role="status" className="text-sm">This document or Version is not publicly available for archival printing.</p>
        ) : (
          <>
            <header className="border-b-2 border-slate-900 pb-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">Terra Solaris · Public institutional document</p>
              <p className="mt-4 text-sm font-semibold">{model.institution}</p>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{model.title}</h1>
              {model.versionTitle !== model.title ? <p className="mt-2 text-lg text-slate-700">{model.versionTitle}</p> : null}
              <dl className="world-print-meta mt-6 grid gap-2 border-t border-slate-300 pt-4 text-xs sm:grid-cols-2">
                <div className="flex gap-3"><dt className="font-semibold">Version</dt><dd>{model.versionNumber} · {model.publicationState}</dd></div>
                {model.effectiveFrom && <div className="flex gap-3"><dt className="font-semibold">Effective</dt><dd>{model.effectiveFrom} UTC</dd></div>}
                {model.publishedAt && <div className="flex gap-3"><dt className="font-semibold">Published</dt><dd>{model.publishedAt} UTC</dd></div>}
                {model.effectiveTo && <div className="flex gap-3"><dt className="font-semibold">Effective until</dt><dd>{model.effectiveTo} UTC</dd></div>}
              </dl>
            </header>
            <div className="mt-8">
              {model.articles.length ? (
                <div className="space-y-8">
                  {model.articles.map((article)=>(
                    <section key={article.id} className="world-print-article border-b border-slate-200 pb-7 last:border-b-0">
                      {article.label && <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{article.label}</p>}
                      {article.heading && <h2 className="mt-1 text-lg font-bold leading-7">{article.heading}</h2>}
                      {article.status !== "active" ? (
                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-800">
                          {article.status === "repealed" ? "Repealed provision" : "Omitted provision"}
                        </p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7">
                        {article.text || "No text recorded for this provision."}
                      </p>
                    </section>
                  ))}
                </div>
              ) : model.plainText ? (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-7">{model.plainText}</p>
              ) : <p className="text-sm text-slate-600">This published Version has no public text.</p>}
            </div>
            <footer className="mt-12 border-t border-slate-400 pt-5">
              <p className="text-xs font-semibold">Source citation</p>
              <p className="mt-2 break-all text-xs leading-5 text-slate-600">{model.citation}</p>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                Read-only copy of an official published Version. This print does not amend, approve,
                certify or supersede the canonical document. Verify current effect in Solaris Studio.
              </p>
            </footer>
            <p className="world-print-screen-note mt-6 text-xs text-slate-600">
              Use “Print or save as PDF” above. Your browser's print dialog provides PDF saving where supported.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
