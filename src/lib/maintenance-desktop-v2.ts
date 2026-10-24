export function renderMaintenanceDesktopV2Style() {
  return `
<style id="maintenance-desktop-v2">
  @media (min-width: 1100px) {
    body {
      background:
        radial-gradient(circle at 72% 5%, rgba(62, 135, 190, .10), transparent 32rem),
        #000;
    }

    .site-nav {
      width: min(calc(100% - 6rem), 1240px);
    }

    #terraos-release-local-nav {
      display: none !important;
    }

    /*
     * The release choreography stylesheet is installed after the static page and
     * deliberately uses higher-specificity html[data-*] selectors. Desktop is a
     * different composition, so its structural geometry must explicitly outrank
     * those mobile-first scroll-scene rules while leaving the mobile choreography
     * untouched.
     */
    html[data-terraos-release-choreography="v2"] .hero {
      min-height: clamp(620px, 76svh, 700px) !important;
    }

    html[data-terraos-release-choreography="v2"] .hero-copy,
    html[data-terraos-release-choreography="v2"] .hero-stage {
      position: relative !important;
      top: auto !important;
    }

    .hero {
      grid-template-columns: minmax(420px, 500px) minmax(520px, 640px);
      grid-template-rows: 1fr;
      align-content: center;
      align-items: center;
      justify-content: center;
      justify-items: stretch;
      column-gap: clamp(2.5rem, 4.5vw, 5.25rem);
      padding: max(6.5rem, calc(env(safe-area-inset-top) + 5.5rem)) clamp(3rem, 5vw, 5rem) 3.25rem;
    }

    .hero::before {
      background:
        radial-gradient(circle at 70% 42%, rgba(74,167,210,.16), transparent 25rem),
        radial-gradient(circle at 27% 38%, rgba(35,78,125,.10), transparent 28rem),
        linear-gradient(180deg, #03070b, #000 78%);
    }

    .hero::after {
      top: 52%;
      left: 70%;
      width: min(680px, 46vw);
    }

    .hero-copy {
      grid-column: 1;
      grid-row: 1;
      justify-self: end;
      align-self: center;
      width: 100%;
      max-width: 500px;
      text-align: left;
      transform-origin: 0 30%;
    }

    .hero h1 {
      font-size: clamp(5.1rem, 6vw, 7rem);
      line-height: .87;
      text-align: left;
    }

    .tagline {
      margin: 1rem 0 0;
      font-size: clamp(1.2rem, 1.45vw, 1.5rem);
    }

    .launch {
      width: 100%;
      margin: clamp(1.7rem, 2.7vh, 2.35rem) 0 0;
      justify-items: start;
      gap: .5rem;
    }

    .countdown {
      max-width: 470px;
      margin-left: 0;
      justify-content: flex-start;
    }

    .countdown-value {
      font-size: clamp(2.7rem, 3.25vw, 3.55rem);
    }

    .hero-stage {
      grid-column: 2;
      grid-row: 1;
      justify-self: start;
      align-self: center;
      width: min(620px, 42vw);
      height: 520px;
      margin-top: 0;
      transform-origin: 50% 50%;
    }

    .phone {
      width: 232px;
      height: 502px;
      border-radius: 36px;
    }

    .phone-preview {
      transform: scale(.59487);
    }

    .phone.center {
      transform: translate(-50%, -50%);
    }

    .phone.left {
      transform: translate(calc(-146% - var(--hero-side-spread)), -42%) rotateY(16deg) rotateZ(-4deg) scale(.82);
    }

    .phone.right {
      transform: translate(calc(46% + var(--hero-side-spread)), -42%) rotateY(-16deg) rotateZ(4deg) scale(.82);
    }

    .hod-portal {
      width: min(calc(100% - 6rem), 1160px);
      margin-top: 1.25rem;
      margin-bottom: clamp(4rem, 6vw, 5.5rem);
      padding: clamp(1.7rem, 2.4vw, 2.25rem);
      gap: clamp(2.5rem, 4.5vw, 4.5rem);
      border-radius: 1.35rem;
    }

    .hod-portal h2 {
      font-size: clamp(1.8rem, 2.15vw, 2.3rem);
    }

    .product-story {
      border-top: 1px solid rgba(255,255,255,.065);
      background:
        radial-gradient(circle at 78% 10%, rgba(45, 103, 164, .07), transparent 28rem),
        #000;
    }

    .product-story > .story {
      width: min(calc(100% - 6rem), 1240px);
      padding: clamp(4.5rem, 6vw, 6.25rem) 0;
    }

    .product-story > .story + .story {
      border-top-color: rgba(255,255,255,.075);
    }

    .product-story .story h2 {
      max-width: 8.5ch;
      font-size: clamp(3.45rem, 4.4vw, 5rem);
      line-height: .91;
    }

    .product-story > .story:first-child {
      width: min(calc(100% - 6rem), 1240px);
      grid-template-columns: minmax(300px, .68fr) minmax(590px, 1.32fr);
      align-items: center;
      gap: clamp(3rem, 5vw, 5.5rem);
      padding: clamp(4.75rem, 6vw, 6.5rem) 0;
    }

    .product-story > .story:first-child > .story-heading {
      align-self: center;
      padding-top: 0;
    }

    .product-story > .story:first-child > .story-heading h2 {
      max-width: 7.5ch;
      font-size: clamp(3.7rem, 4.65vw, 5.25rem);
      line-height: .9;
    }

    html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .first-look {
      min-height: 500px !important;
    }

    .product-story > .story:first-child .first-look {
      min-height: 500px;
      grid-template-columns: minmax(230px, .8fr) minmax(280px, 1fr);
      gap: clamp(1.75rem, 3vw, 3.25rem);
      padding: clamp(1.8rem, 2.5vw, 2.5rem);
      border-radius: 1.85rem;
      background:
        radial-gradient(circle at 78% 32%, rgba(52,123,205,.24), transparent 42%),
        linear-gradient(145deg, #0d1522, #07090d 72%);
      box-shadow: 0 28px 80px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.035);
    }

    .product-story > .story:first-child .first-look-copy h3 {
      font-size: clamp(2.4rem, 2.8vw, 3.2rem);
      line-height: .95;
    }

    .product-story > .story:first-child .first-look-copy p {
      max-width: 24rem;
      font-size: 1rem;
    }

    .product-story > .story:first-child .preview-device {
      width: min(300px, 100%);
      justify-self: end;
    }

    html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] {
      min-height: 180svh !important;
    }

    html[data-terraos-release-choreography="v2"] .story-touch[data-terra-scroll-scene="true"] .interactive-device {
      position: sticky !important;
      top: max(6rem, 12svh) !important;
      margin-top: 0 !important;
    }

    .story-touch {
      grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr);
      gap: clamp(3rem, 5vw, 5.5rem);
      align-items: start;
      text-align: left;
    }

    .story-touch .story-heading {
      position: sticky;
      top: 20svh;
      align-self: start;
    }

    .story-touch .interactive-device {
      width: 100%;
      max-width: 650px;
      margin: 0;
      justify-self: end;
    }

    .story-touch .interactive-screen {
      min-height: 540px;
    }

    .story-touch .touch-hint {
      grid-column: 2;
      margin: -1.25rem 0 0;
      text-align: left;
    }

    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] {
      min-height: 165svh !important;
    }

    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .story-grid {
      min-height: 150svh !important;
    }

    html[data-terraos-release-choreography="v2"] .participation-story[data-terra-scroll-scene="true"] .participation-device {
      position: sticky !important;
      top: max(6rem, 12svh) !important;
      align-self: start !important;
    }

    .participation-story .story-grid {
      grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr);
      gap: clamp(3rem, 5vw, 5.5rem);
      align-items: start;
    }

    .participation-story .sticky-heading {
      position: sticky;
      top: 20svh;
      align-self: start;
    }

    .participation-device {
      width: 100%;
      max-width: 650px;
      justify-self: end;
    }

    html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] {
      min-height: 190svh !important;
    }

    html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .story-heading {
      top: max(5.5rem, 11svh) !important;
    }

    html[data-terraos-release-choreography="v2"] .results-story[data-terra-scroll-scene="true"] .results-reveal {
      top: max(9.5rem, 19svh) !important;
    }

    .results-story .story-heading,
    .final-countdown {
      width: min(100%, 900px);
      margin-inline: auto;
      text-align: center;
    }

    .results-story .story-heading h2 {
      margin-inline: auto;
    }

    .results-reveal {
      width: min(820px, 76vw);
      min-height: 600px;
      margin-top: 2.5rem;
    }

    .interface-details {
      width: min(980px, 100%);
      margin: 1rem auto 0;
    }

    footer {
      width: min(calc(100% - 6rem), 1240px);
    }
  }

  @media (min-width: 1500px) {
    .hero {
      grid-template-columns: 500px 640px;
      column-gap: 5.5rem;
    }

    .product-story > .story,
    .product-story > .story:first-child {
      width: min(calc(100% - 10rem), 1320px);
    }
  }
</style>`;
}
