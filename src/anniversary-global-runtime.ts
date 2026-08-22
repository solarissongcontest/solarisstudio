import "@/anniversary-global.css";
import { getSolarisAnniversary } from "@/lib/anniversary";

const PREVIEW_KEY = "solaris:anniversary-preview";
const LAYER_ID = "solaris-anniversary-global-layer";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

let mounted = false;
let clickHandler: ((event: MouseEvent) => void) | null = null;

function previewEnabled() {
  const parameter = new URLSearchParams(window.location.search).get("anniversary");
  if (parameter === "preview") {
    window.sessionStorage.setItem(PREVIEW_KEY, "1");
    return true;
  }
  if (parameter === "off") {
    window.sessionStorage.removeItem(PREVIEW_KEY);
    return false;
  }
  return window.sessionStorage.getItem(PREVIEW_KEY) === "1";
}

function starMarkup() {
  return Array.from({ length: 64 }, (_, index) => {
    const left = `${(index * 37 + 11) % 100}%`;
    const size = `${13 + ((index * 19) % 31)}px`;
    const color = STAR_COLORS[index % STAR_COLORS.length];
    const opacity = 0.32 + ((index * 13) % 48) / 100;
    const duration = `${8.5 + ((index * 23) % 78) / 10}s`;
    const delay = `${-((index * 0.83) % 16)}s`;
    const drift = `${-120 + ((index * 47) % 240)}px`;
    const rotate = `${(index * 73) % 360}deg`;
    const scale = 0.72 + ((index * 17) % 48) / 100;
    return `<span class="solaris-anniversary-falling-star" style="left:${left};--star-size:${size};--star-color:${color};--star-opacity:${opacity};--star-duration:${duration};--star-delay:${delay};--star-drift:${drift};--star-rotate:${rotate};--star-scale:${scale}"></span>`;
  }).join("");
}

function createBurst(x: number, y: number) {
  const burst = document.createElement("span");
  burst.className = "solaris-anniversary-star-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < 14; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / 14) * index + ((index % 2) * 9)}deg`);
    star.style.setProperty("--burst-distance", `${40 + ((index * 17) % 58)}px`);
    star.style.setProperty("--burst-size", `${9 + ((index * 7) % 13)}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 820);
}

function mount() {
  if (mounted) return;
  mounted = true;
  const anniversary = getSolarisAnniversary();

  document.body.classList.add("solaris-anniversary-day");
  document.body.dataset.solarisAnniversary = String(anniversary.year);

  const layer = document.createElement("div");
  layer.id = LAYER_ID;
  layer.className = "solaris-anniversary-global";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <div class="solaris-anniversary-global-wash"></div>
    <div class="solaris-anniversary-global-stars">${starMarkup()}</div>
    <div class="solaris-anniversary-global-badge">
      <span class="solaris-anniversary-badge-star"></span>
      <span>17 September</span>
      <span class="solaris-anniversary-badge-divider">·</span>
      <strong>${anniversary.age} years of Solaris</strong>
    </div>
  `;
  document.body.appendChild(layer);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  clickHandler = (event: MouseEvent) => {
    if (reducedMotion.matches) return;
    const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
    if (!target) return;
    createBurst(event.clientX, event.clientY);
  };
  document.addEventListener("click", clickHandler, true);
}

function refreshMountedLabel() {
  if (!mounted) return;
  const anniversary = getSolarisAnniversary();
  document.body.dataset.solarisAnniversary = String(anniversary.year);
  const strong = document.querySelector<HTMLElement>(`#${LAYER_ID} .solaris-anniversary-global-badge strong`);
  if (strong) strong.textContent = `${anniversary.age} years of Solaris`;
}

function unmount() {
  if (!mounted) return;
  mounted = false;
  document.body.classList.remove("solaris-anniversary-day");
  delete document.body.dataset.solarisAnniversary;
  document.getElementById(LAYER_ID)?.remove();
  if (clickHandler) document.removeEventListener("click", clickHandler, true);
  clickHandler = null;
}

function syncAnniversary() {
  const shouldCelebrate = getSolarisAnniversary().active || previewEnabled();
  if (shouldCelebrate) {
    mount();
    refreshMountedLabel();
  } else {
    unmount();
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const start = () => {
    syncAnniversary();
    window.setInterval(syncAnniversary, 1000);
    window.addEventListener("focus", syncAnniversary);
    window.addEventListener("popstate", syncAnniversary);
    document.addEventListener("visibilitychange", syncAnniversary);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
