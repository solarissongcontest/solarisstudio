export function renderMaintenanceDesktopV2Style() {
  return `
<style id="maintenance-desktop-v2">
  @media (min-width: 1100px) {
    body {
      background:
        radial-gradient(circle at 74% 8%, rgba(62, 135, 190, .11), transparent 31rem),
        #000;
    }

    .site-nav {
      width: min(calc(100% - 6rem), 1240px) !important;
      top: max(22px, env(safe-area-inset-top)) !important;
    }

    #terraos-release-local-nav {
      display: none !important;
    }

    /* Desktop geometry must be correct from first paint. The choreography
     * attribute enhances motion later; it must not own the initial layout. */
    .hero,
    html[data-terraos-release-choreography="v2"] .hero {
      min-height: 700px !important;
      height: auto !important;
      grid-template-columns: minmax(400px, 480px) minmax(520px, 650px) !important;
      grid-template-rows: 1fr !important;
      align-content: center !important;
      align-items: center !important;
      justify-content: center !important;
      justify-items: stretch !important;
      column-gap: clamp(3rem, 5vw, 5.5rem) !important;
      padding: max(6.1rem, calc(env(safe-area-inset-top) + 5.25rem)) clamp(3rem, 5vw, 5rem) 2.5rem !important;
      overflow: hidden;
    }

    .hero::before {
      background:
        radial-gradient(circle at 71% 44%, rgba(74,167,210,.17), transparent 25rem),
        radial-gradient(circle at 25% 40%, rgba(35,78,125,.10), transparent 28rem),
        linear-gradient(180deg, #03070b, #000 82%) !important;
    }

    .hero::after {
      top: 49% !important;
      left: 71% !important;
      width: min(650px, 44vw) !important;
    }

    .hero-copy,
    html[data-terraos-release-choreography="v2"] .hero-copy,
    .hero-stage,
    html[data-terraos-release-choreography="v2"] .hero-stage {
      position: relative !important;
      top: auto !important;
    }

    .hero-copy {
      grid-column: 1 !important;
      grid-row: 1 !important;
      justify-self: end !important;
      align-self: center !important;
      width: 100% !important;
      max-width: 480px !important;
      text-align: left !important;
      transform-origin: 0 30% !important;
    }

    .hero h1 {
      margin: 0 !important;
      font-size: clamp(4.8rem, 5.5vw, 6.5rem) !important;
      line-height: .88 !important;
      text-align: left !important;
    }

    .tagline {
      margin: .9rem 0 0 !important;
      font-size: clamp(1.15rem, 1.35vw, 1.42rem) !important;
    }

    .launch {
      width: 100% !important;
      margin: clamp(1.55rem, 2.4vh, 2rem) 0 0 !important;
      justify-items: start !important;
      gap: .42rem !important;
    }

    .countdown {
      max-width: 440px !important;
      margin-left: 0 !important;
      justify-content: flex-start !important;
      gap: clamp(.45rem, .9vw, .9rem) !important;
    }

    .countdown-value {
      font-size: clamp(2.55rem, 3vw, 3.35rem) !important;
    }

    .hero-stage {
      grid-column: 2 !important;
      grid-row: 1 !important;
      justify-self: start !important;
      align-self: center !important;
      width: min(640px, 43vw) !important;
      height: 460px !important;
      min-height: 0 !important;
      margin: 0 !important;
      overflow: visible !important;
      transform-origin: 50% 50% !important;
    }

    .phone {
      width: 218px !important;
      height: 472px !important;
      border-radius: 34px !important;
    }

    .phone-preview {
      transform: scale(.55897) !important;
    }

    .phone.center {
      transform: translate(-50%, -50%) !important;
    }

    .phone.left {
      transform: translate(calc(-148% - var(--hero-side-spread)), -42%) rotateY(15deg) rotateZ(-4deg) scale(.82) !important;
    }

    .phone.right {
      transform: translate(calc(48% + var(--hero-side-spread)), -42%) rotateY(-15deg) rotateZ(4deg) scale(.82) !important;
    }

    .hod-portal {
      width: min(calc(100% - 6rem), 1160px) !important;
      margin-top: 1rem !important;
      margin-bottom: clamp(3.75rem, 5vw, 5rem) !important;
      padding: clamp(1.6rem, 2.25vw, 2.15rem) !important;
      gap: clamp(2.25rem, 4vw, 4rem) !important;
      border-radius: 1.3rem !important;
    }

    .product-story {
      border-top: 1px solid rgba(255,255,255,.065);
      background:
        radial-gradient(circle at 78% 10%, rgba(45,103,164,.07), transparent 28rem),
        #000;
    }

    .product-story > .story,
    .product-story > .story:first-child {
      width: min(calc(100% - 6rem), 1240px) !important;
      margin-inline: auto !important;
      padding: clamp(4rem, 5vw, 5.5rem) 0 !important;
    }

    .product-story .story h2 {
      max-width: 8.5ch;
      font-size: clamp(3.25rem, 4vw, 4.7rem) !important;
      line-height: .92 !important;
    }

    .product-story > .story:first-child {
      display: grid !important;
      grid-template-columns: minmax(290px, .68fr) minmax(560px, 1.32fr) !important;
      align-items: center !important;
      gap: clamp(3rem, 5vw, 5.25rem) !important;
    }

    .first-look,
    html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .first-look {
      min-height: 470px !important;
    }

    .preview-device,
    html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .preview-device {
      width: min(268px, 18vw, 100%) !important;
      max-height: min(600px, 78svh) !important;
    }

    .product-story > .story:first-child .first-look {
      display: grid !important;
      grid-template-columns: minmax(220px, .82fr) minmax(250px, 1fr) !important;
      gap: clamp(1.6rem, 2.8vw, 3rem) !important;
      padding: clamp(1.65rem, 2.3vw, 2.35rem) !important;
      border-radius: 1.7rem !important;
      background:
        radial-gradient(circle at 78% 32%, rgba(52,123,205,.24), transparent 42%),
        linear-gradient(145deg, #0d1522, #07090d 72%) !important;
    }

    .story-touch,
    .participation-story .story-grid {
      display: grid !important;
      grid-template-columns: minmax(290px, .7fr) minmax(560px, 1.3fr) !important;
      gap: clamp(3rem, 5vw, 5.25rem) !important;
      align-items: start !important;
      text-align: left !important;
    }

    .story-touch[data-terra-scroll-scene="true"],
    html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] {
      min-height: 155svh !important;
    }

    .story-touch .story-heading,
    .participation-story .sticky-heading {
      position: sticky !important;
      top: 18svh !important;
      align-self: start !important;
    }

    .story-touch .interactive-device,
    html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] .interactive-device,
    .participation-device,
    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .participation-device {
      position: sticky !important;
      top: max(5.5rem, 10svh) !important;
      width: 100% !important;
      max-width: 640px !important;
      margin-top: 0 !important;
      justify-self: end !important;
      align-self: start !important;
    }

    .participation-story[data-terra-scroll-scene="true"],
    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] {
      min-height: 150svh !important;
    }

    .participation-story[data-terra-scroll-scene="true"] .story-grid,
    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .story-grid {
      min-height: 138svh !important;
    }

    .results-story[data-terra-scroll-scene="true"],
    html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] {
      min-height: 165svh !important;
    }

    .results-story .story-heading,
    .final-countdown {
      width: min(100%, 900px) !important;
      margin-inline: auto !important;
      text-align: center !important;
    }

    .results-reveal {
      width: min(800px, 72vw) !important;
      min-height: 570px !important;
      margin-top: 2rem !important;
    }

    .interface-details {
      width: min(960px, 100%) !important;
      margin: 1rem auto 0 !important;
    }

    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .story-touch[data-terra-scroll-scene="true"],
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"],
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-story[data-terra-scroll-scene="true"] .story-grid,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-story[data-terra-scroll-scene="true"] {
      min-height: auto !important;
    }

    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero-copy,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero-stage,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .story-touch .story-heading,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .interactive-device,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-story .sticky-heading,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .participation-device,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-story .story-heading,
    html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .results-reveal {
      position: static !important;
      top: auto !important;
    }

    footer {
      width: min(calc(100% - 6rem), 1240px) !important;
    }
  }

  @media (min-width: 1500px) {
    .hero,
    html[data-terraos-release-choreography="v2"] .hero {
      min-height: 720px !important;
      grid-template-columns: 480px 650px !important;
      column-gap: 5.5rem !important;
    }

    .product-story > .story,
    .product-story > .story:first-child {
      width: min(calc(100% - 10rem), 1320px) !important;
    }
  }

  @media (min-width: 1100px) and (max-height: 820px) {
    .hero,
    html[data-terraos-release-choreography="v2"] .hero {
      min-height: 620px !important;
      padding-top: 5.5rem !important;
      padding-bottom: 1.75rem !important;
    }

    .hero h1 {
      font-size: clamp(4.25rem, 5vw, 5.6rem) !important;
    }

    .hero-stage {
      height: 410px !important;
    }

    .phone {
      width: 194px !important;
      height: 420px !important;
    }

    .phone-preview {
      transform: scale(.49762) !important;
    }
  }
</style>`;
}
