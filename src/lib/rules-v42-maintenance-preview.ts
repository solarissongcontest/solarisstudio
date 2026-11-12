import { SSC_RULE_CHAPTERS } from "@/lib/ssc-rules/current";
import { withPlainLanguage } from "@/lib/ssc-rules/plain-language-v42";

/**
 * A zero-network reference copy of the v4.2 candidate during global maintenance.
 * The Worker serves this document directly: it does not initialize the app,
 * resolve an account, call Supabase, or change the official rulebook pointer.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(label: string, items: string[] | undefined) {
  if (!items?.length) return "";
  return `<section class="rule-list"><h4>${escapeHtml(label)}</h4><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></section>`;
}

const CHAPTERS = SSC_RULE_CHAPTERS.map((chapter) => ({
  number: chapter.number,
  title: chapter.title,
  rules: chapter.rules.map(withPlainLanguage),
}));

const TOTAL_RULES = CHAPTERS.reduce((count, chapter) => count + chapter.rules.length, 0);

export function renderV42MaintenancePreview(): string {
  const chapters = CHAPTERS.map(
    (chapter) => `<section class="chapter" id="chapter-${chapter.number}" aria-labelledby="chapter-title-${chapter.number}">
      <h2 id="chapter-title-${chapter.number}">Chapter ${chapter.number} · ${escapeHtml(chapter.title)}</h2>
      ${chapter.rules
        .map(
          (rule) => `<details class="rule" data-draft-rule="${escapeHtml(rule.id)}">
            <summary><span class="rule-id">${escapeHtml(rule.id)}</span><span>${escapeHtml(rule.title)}</span></summary>
            <div class="rule-body">
              <p class="summary">${escapeHtml(rule.summary)}</p>
              ${rule.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
              ${renderList("Additional conditions", rule.bullets)}
              ${renderList("Allowed", rule.allowed)}
              ${renderList("Not allowed", rule.prohibited)}
              ${rule.important ? `<p class="important"><strong>Important:</strong> ${escapeHtml(rule.important)}</p>` : ""}
              ${rule.examples?.length ? `<section class="rule-examples"><h4>Examples</h4>${rule.examples.map((example) => `<p><strong>${escapeHtml(example.title)}:</strong> ${escapeHtml(example.detail)}</p>`).join("")}</section>` : ""}
            </div>
          </details>`,
        )
        .join("")}
    </section>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="color-scheme" content="dark">
  <title>v4.2 SSC Regulations reference text · Solaris Studio</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #080e1c; color: #f0f5ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at top, #152748 0, #080e1c 480px); }
    main { max-width: 920px; margin: auto; padding: max(25px, env(safe-area-inset-top)) 18px calc(48px + env(safe-area-inset-bottom)); }
    a { color: #b2deff; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    a:focus-visible, summary:focus-visible { outline: 3px solid #a5d8ff; outline-offset: 4px; }
    .toplink { display: inline-block; min-height: 44px; padding-top: 10px; font-size: 13px; font-weight: 700; }
    .eyebrow { color: #c2d5ff; font-weight: 750; font-size: 12px; letter-spacing: .11em; text-transform: uppercase; margin-top: 24px; }
    h1 { font-size: clamp(28px, 6vw, 43px); margin: 9px 0 14px; line-height: 1.12; letter-spacing: -.035em; }
    .intro { max-width: 760px; line-height: 1.75; color: #c5d0e4; }
    .notice { border: 1px solid #a98e5c; background: rgba(139,96,36,.18); padding: 16px; border-radius: 14px; line-height: 1.7; margin: 22px 0; color: #fff0d8; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px 22px; color: #b8c9e6; font-size: 13px; margin: 22px 0; }
    .chapters-nav { display: flex; flex-wrap: wrap; gap: 7px; margin: 16px 0 34px; }
    .chapters-nav a { min-height: 38px; padding: 9px 12px; border: 1px solid #354760; border-radius: 12px; text-decoration: none; font-size: 12px; }
    .chapter { scroll-margin-top: 24px; margin-top: 32px; }
    .chapter h2 { font-size: 21px; line-height: 1.3; margin: 0 0 13px; }
    .rule { border: 1px solid rgba(194,215,255,.15); border-radius: 13px; margin: 8px 0; background: rgba(255,255,255,.025); }
    .rule[open] { background: rgba(21,39,72,.65); }
    summary { display: flex; align-items: baseline; gap: 15px; cursor: pointer; padding: 15px; font-size: 14px; font-weight: 700; min-height: 48px; }
    .rule-id { font-family: ui-monospace, monospace; color: #8bcbff; flex-shrink: 0; }
    .rule-body { padding: 5px 18px 20px; border-top: 1px solid rgba(194,215,255,.12); line-height: 1.7; font-size: 14px; color: #d2deef; }
    .rule-body p { margin: 12px 0; }
    .rule-body .summary { color: #b1dcff; font-weight: 700; }
    .rule-list ul { padding-left: 23px; }
    .rule-list li { margin: 6px 0; }
    .rule-body h4 { color: #f2f6ff; margin: 15px 0 6px; }
    .important { padding: 12px 14px; background: rgba(93,152,207,.11); border: 1px solid rgba(147,197,253,.25); border-radius: 10px; }
    footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid rgba(194,215,255,.16); font-size: 12px; line-height: 1.8; color: #acbed8; }
  </style>
</head>
<body>
  <main>
    <a class="toplink" href="/">← Solaris Studio maintenance</a>
    <div class="eyebrow">Public reference copy · Not a release record</div>
    <h1>SSC General Regulations v4.2</h1>
    <p class="intro">This static reading copy contains ${TOTAL_RULES} v4.2 rule texts across ${CHAPTERS.length} chapters. Expand a rule to read its text and examples. It is independent of the live rules database.</p>
    <div class="notice" role="status"><strong>REFERENCE COPY · NOT AUTHORITATIVE.</strong> Publication status and effective wording come from the governed Current Rules release, not this static page. A version may already have been published or superseded. This reference copy does not approve or publish changes.</div>
    <div class="meta"><span>${TOTAL_RULES} reference rules</span><span>${CHAPTERS.length} chapters</span><span>Read-only · No sign-in required</span></div>
    <nav aria-label="Reference rulebook chapters" class="chapters-nav">
      ${CHAPTERS.map((chapter) => `<a href="#chapter-${chapter.number}">${chapter.number} · ${escapeHtml(chapter.title)}</a>`).join("")}
    </nav>
    ${chapters}
    <footer>For binding obligations, consult the current official SSC rulebook once the full application returns. This preview never changes eligibility, scoring, release history or production database state.</footer>
  </main>
</body>
</html>`;
}
