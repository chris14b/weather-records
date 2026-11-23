import "./style.css";
import type { FactsFile } from "../shared/facts.ts";
import { locations } from "../shared/locations.ts";
import { sunPosition, type SunPosition } from "../shared/sun.ts";
import type { Weather } from "../shared/weather.ts";
import { addressFor, startingAddress, startingLocation } from "./address.ts";
import { sydneyDate } from "./naming.ts";
import { distanceText, nearestLocation } from "./nearest.ts";
import { type Locating, render } from "./render.ts";
import { forecastWeather, skyStyle } from "./sky.ts";
import type { SkyPreview } from "./sky-preview.ts";

const storageKey = "location";
const refreshEvery = 5 * 60_000;
const skyEvery = 60_000;
const findingAfter = 400;

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
  // Pages lets browsers reuse the file for 10 minutes; revalidating finds an update sooner.
  const response = await fetch(`${import.meta.env.BASE_URL}facts.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`facts.json: ${String(response.status)}`);
  }
  const file: unknown = await response.json();
  if (!isFactsFile(file)) throw new Error("facts.json isn't a facts file");
  return file;
}

async function start(root: HTMLElement, loaded: FactsFile): Promise<void> {
  let file = loaded;
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
  let locating: Locating | undefined;
  const show = () => {
    render(root, {
      file,
      location,
      now: new Date(),
      onSelect: (id) => {
        locating = undefined;
        choose(id, ".location-select");
      },
      onLocate: "geolocation" in navigator ? locate : undefined,
      locating,
    });
    paintSky();
  };
  const choose = (id: string, focus: string) => {
    location = locations.find((l) => l.id === id) ?? location;
    remember(location.id);
    replaceAddress(addressFor(new URL(window.location.href), location));
    show();
    root.querySelector<HTMLElement>(focus)?.focus();
  };
  let findingTimer: number | undefined;
  const finishLocating = (found: Locating, id?: string) => {
    clearTimeout(findingTimer);
    findingTimer = undefined;
    locating = found;
    if (id === undefined) {
      show();
      root.querySelector<HTMLElement>(".locate")?.focus();
    } else choose(id, ".locate");
  };
  const locate = () => {
    if (findingTimer !== undefined) return;
    // A cached or already allowed position arrives at once; saying so would only flash.
    findingTimer = window.setTimeout(() => {
      locating = { message: "Finding you…", state: "finding" };
      show();
    }, findingAfter);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = nearestLocation(coords, locations);
        if (nearest === undefined) return;
        finishLocating(
          {
            message: distanceText(nearest.kilometres),
            state: "found",
          },
          nearest.location.id,
        );
      },
      (error) => {
        finishLocating({
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location access was declined. Choose a station from the list."
              : "Couldn't find your location. Choose a station from the list.",
          state: "failed",
        });
      },
      { timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  };
  const refresh = async () => {
    try {
      file = await loadFacts();
    } catch (error) {
      // The page already has facts, so it keeps them until a later refresh succeeds.
      console.error(error);
    }
    show();
  };
  show();
  setInterval(() => void refresh(), refreshEvery);
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
