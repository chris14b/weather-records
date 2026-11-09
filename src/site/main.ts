import "./style.css";
import type { FactsFile } from "../shared/facts.ts";
import { locations } from "../shared/locations.ts";
import { sunPosition, type SunPosition } from "../shared/sun.ts";
import type { Weather } from "../shared/weather.ts";
import { addressFor, startingAddress, startingLocation } from "./address.ts";
import { sydneyDate } from "./naming.ts";
import { render } from "./render.ts";
import { forecastWeather, skyStyle } from "./sky.ts";
import type { SkyPreview } from "./sky-preview.ts";

const storageKey = "location";
const refreshEvery = 5 * 60_000;
const skyEvery = 60_000;

function rememberedId(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    // Storage can be blocked; the address or the first location will do.
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    // Storage can be blocked; the choice lasts until the page is reloaded.
  }
}

function replaceAddress(address: URL): void {
  if (address.href !== window.location.href) {
    history.replaceState(history.state, "", address);
  }
}

function drawSky(sun: SunPosition, weather: Weather | undefined): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(skyStyle(sun, weather))) {
    root.style.setProperty(name, value);
  }
  if (weather === undefined) delete root.dataset.weather;
  else root.dataset.weather = weather;
}

function isFactsFile(value: unknown): value is FactsFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "generatedAt" in value &&
    typeof value.generatedAt === "string" &&
    "locations" in value &&
    Array.isArray(value.locations)
  );
}

async function loadFacts(): Promise<FactsFile> {
  const response = await fetch(`${import.meta.env.BASE_URL}facts.json`);
  if (!response.ok) {
    throw new Error(`facts.json: ${String(response.status)}`);
  }
  const file: unknown = await response.json();
  if (!isFactsFile(file)) throw new Error("facts.json isn't a facts file");
  return file;
}

async function start(root: HTMLElement, file: FactsFile): Promise<void> {
  const address = startingAddress(new URL(window.location.href), locations);
  replaceAddress(address);
  let location = startingLocation(address, rememberedId(), locations);
  let preview: SkyPreview | undefined;
  let previewPanel: { refresh: () => void } | undefined;
  const paintSky = () => {
    const now = preview?.instant ?? new Date();
    const forecast =
      file.locations.find((l) => l.locationId === location.id)?.forecast ?? [];
    const weather =
      preview === undefined || preview.weather === "forecast"
        ? forecastWeather(forecast, sydneyDate(now))
        : preview.weather === "none"
          ? undefined
          : preview.weather;
    drawSky(sunPosition(now, location), weather);
    previewPanel?.refresh();
  };
  const show = () => {
    render(root, {
      file,
      location,
      now: new Date(),
      onSelect: (id) => {
        location = locations.find((l) => l.id === id) ?? location;
        remember(location.id);
        replaceAddress(addressFor(new URL(window.location.href), location));
        show();
        root
          .querySelector<HTMLInputElement>(`input[value="${location.id}"]`)
          ?.focus();
      },
    });
    paintSky();
  };
  show();
  setInterval(show, refreshEvery);
  setInterval(paintSky, skyEvery);

  // A panel for trying the sky at any time and in any weather, only with `npm run dev`.
  // The mode, unlike DEV, can't be switched on in a build by setting NODE_ENV.
  if (
    import.meta.env.MODE === "development" &&
    new URLSearchParams(window.location.search).has("sky")
  ) {
    const { mountSkyPreview } = await import("./sky-preview.ts");
    previewPanel = mountSkyPreview({
      place: () => location,
      onChange: (changed) => {
        preview = changed;
        paintSky();
      },
    });
  }
}

document.addEventListener("visibilitychange", () => {
  document.documentElement.toggleAttribute("data-paused", document.hidden);
});

const root = document.querySelector<HTMLElement>("#app");
if (root !== null) {
  try {
    await start(root, await loadFacts());
  } catch (error) {
    console.error(error);
    root.textContent =
      "The weather records couldn't be loaded. Try again later.";
  }
}
