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

    .hero {
      min-height: 720px;
      grid-template-columns: minmax(360px, 455px) minmax(500px, 640px);
      column-gap: clamp(3rem, 6vw, 6.5rem);
      padding: max(7rem, calc(env(safe-area-inset-top) + 5.5rem)) clamp(3rem, 6vw, 6rem) 5rem;
    }

    .hero::after {
      left: 70%;
      width: min(720px, 48vw);
    }

    .hero-copy {
      max-width: 455px;
      align-self: center;
    }

    .hero h1 {
      font-size: clamp(5rem, 6.2vw, 7.35rem);
      line-height: .88;
    }

    .tagline {
      margin-top: 1.05rem;
      font-size: clamp(1.2rem, 1.45vw, 1.5rem);
    }

    .launch {
      margin-top: clamp(2rem, 3.3vh, 2.7rem);
      gap: .55rem;
    }

    .countdown {
      max-width: 455px;
    }

    .countdown-value {
      font-size: clamp(2.75rem, 3.35vw, 3.65rem);
    }

    .hero-stage {
      width: min(640px, 43vw);
      height: 560px;
    }

    .phone {
      width: 250px;
      height: 541px;
      border-radius: 38px;
    }

    .phone-preview {
      transform: scale(.64103);
    }

    .phone.left {
      transform: translate(calc(-146% - var(--hero-side-spread)), -42%) rotateY(16deg) rotateZ(-4deg) scale(.82);
    }

    .phone.right {
      transform: translate(calc(46% + var(--hero-side-spread)), -42%) rotateY(-16deg) rotateZ(4deg) scale(.82);
    }

    .hod-portal {
      width: min(calc(100% - 6rem), 1160px);
      margin-top: 2rem;
      margin-bottom: clamp(4.5rem, 7vw, 6.5rem);
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
      padding: clamp(5rem, 6.5vw, 7rem) 0;
    }

    .product-story > .story + .story {
      border-top-color: rgba(255,255,255,.075);
    }

    .product-story .story h2 {
      max-width: 8.5ch;
      font-size: clamp(3.6rem, 4.65vw, 5.35rem);
      line-height: .91;
    }

    .product-story > .story:first-child {
      width: min(calc(100% - 6rem), 1240px);
      grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr);
      align-items: center;
      gap: clamp(3rem, 5vw, 5.5rem);
      padding: clamp(5.5rem, 7vw, 7.5rem) 0;
    }

    .product-story > .story:first-child > .story-heading {
      align-self: center;
      padding-top: 0;
    }

    .product-story > .story:first-child > .story-heading h2 {
      max-width: 7.5ch;
      font-size: clamp(3.9rem, 4.9vw, 5.6rem);
      line-height: .9;
    }

    .product-story > .story:first-child .first-look {
      min-height: 520px;
      grid-template-columns: minmax(230px, .78fr) minmax(290px, 1fr);
      gap: clamp(1.75rem, 3vw, 3.25rem);
      padding: clamp(1.8rem, 2.5vw, 2.5rem);
      border-radius: 1.85rem;
      background:
        radial-gradient(circle at 78% 32%, rgba(52,123,205,.24), transparent 42%),
        linear-gradient(145deg, #0d1522, #07090d 72%);
      box-shadow: 0 28px 80px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.035);
    }

    .product-story > .story:first-child .first-look-copy h3 {
      font-size: clamp(2.5rem, 3vw, 3.4rem);
      line-height: .95;
    }

    .product-story > .story:first-child .first-look-copy p {
      max-width: 24rem;
      font-size: 1rem;
    }

    .product-story > .story:first-child .preview-device {
      width: min(310px, 100%);
      justify-self: end;
    }

    .story-touch {
      min-height: 0;
      grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr);
      gap: clamp(3rem, 5vw, 5.5rem);
      align-items: center;
      text-align: left;
    }

    .story-touch .story-heading {
      align-self: center;
    }

    .story-touch .interactive-device {
      width: 100%;
      max-width: 650px;
      margin: 0;
      justify-self: end;
    }

    .story-touch .interactive-screen {
      min-height: 560px;
    }

    .story-touch .touch-hint {
      grid-column: 2;
      margin: -1.5rem 0 0;
      text-align: left;
    }

    .participation-story .story-grid {
      grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr);
      gap: clamp(3rem, 5vw, 5.5rem);
      align-items: center;
    }

    .participation-story .sticky-heading {
      position: relative;
      top: auto;
      align-self: center;
    }

    .participation-device {
      width: 100%;
      max-width: 650px;
      justify-self: end;
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
      min-height: 620px;
      margin-top: 3rem;
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
      grid-template-columns: 455px 650px;
      column-gap: 7rem;
    }

    .product-story > .story,
    .product-story > .story:first-child {
      width: min(calc(100% - 10rem), 1320px);
    }
  }
</style>`;
}
