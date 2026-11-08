import "./style.css";
import type { FactsFile } from "../shared/facts.ts";
import { locations, type Location } from "../shared/locations.ts";
import { render } from "./render.ts";

const storageKey = "location";
const refreshEvery = 5 * 60_000;

function storedLocation(): Location {
  let id: string | null = null;
  try {
    id = localStorage.getItem(storageKey);
  } catch {
    // Storage can be blocked; the first location will do.
  }
  const location = locations.find((l) => l.id === id) ?? locations[0];
  if (location === undefined) throw new Error("No locations are configured");
  return location;
}

function remember(id: string): void {
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    // Storage can be blocked; the choice lasts until the page is reloaded.
  }
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

function start(root: HTMLElement, file: FactsFile): void {
  let location = storedLocation();
  const show = () => {
    render(root, {
      file,
      location,
      now: new Date(),
      onSelect: (id) => {
        location = locations.find((l) => l.id === id) ?? location;
        remember(location.id);
        show();
        root
          .querySelector<HTMLInputElement>(`input[value="${location.id}"]`)
          ?.focus();
      },
    });
  };
  show();
  setInterval(show, refreshEvery);
}

const root = document.querySelector<HTMLElement>("#app");
if (root !== null) {
  try {
    start(root, await loadFacts());
  } catch (error) {
    console.error(error);
    root.textContent =
      "The weather records couldn't be loaded. Try again later.";
  }
}
