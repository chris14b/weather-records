import type { Fact, FactsFile, ValueStatus } from "../shared/facts.ts";
import { locations, type Location } from "../shared/locations.ts";
import { arrange, headlineSize } from "./arrange.ts";
import { longDate, sentence, sydneyDate } from "./naming.ts";
import { forecastWeather, skyPhase, sydneyHour } from "./sky.ts";

type Children = (Node | string)[];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: Children = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

/** How the page shows a fact: the live feed counts as observed, like the daily files. */
type ShownStatus = Exclude<ValueStatus, "provisional">;

function shown(status: ValueStatus): ShownStatus {
  return status === "provisional" ? "confirmed" : status;
}

const statusLabels: Record<ShownStatus, string> = {
  confirmed: "Observed",
  forecast: "Forecast",
  conditional: "If it gets there",
};

function marker(status: ShownStatus): HTMLElement {
  return element("span", {
    class: "marker",
    "data-status": status,
    "aria-hidden": "true",
  });
}

function phrase(fact: Fact, today: string): Children {
  const { before, subject, after } = sentence(fact, today);
  return [before, element("strong", {}, [subject]), `${after}.`];
}

function factItem(fact: Fact, today: string): HTMLElement {
  const status = shown(fact.status);
  return element("li", { class: "fact", "data-status": status }, [
    marker(status),
    element("p", {}, phrase(fact, today)),
  ]);
}

function factList(
  facts: readonly Fact[],
  today: string,
  empty: string,
): HTMLElement {
  if (facts.length === 0) return element("p", { class: "empty" }, [empty]);
  return element(
    "ul",
    { class: "facts" },
    facts.map((fact) => factItem(fact, today)),
  );
}

function panel(id: string, title: string, children: Children): HTMLElement {
  return element("section", { class: "glass panel", "aria-labelledby": id }, [
    element("h2", { id }, [title]),
    ...children,
  ]);
}

function headline(fact: Fact | undefined, today: string): HTMLElement {
  if (fact === undefined) {
    return element("p", { class: "headline empty" }, [
      "Nothing notable yet today.",
    ]);
  }
  const node = element(
    "p",
    { class: "headline", "data-status": shown(fact.status) },
    phrase(fact, today),
  );
  const size = headlineSize(fact.score);
  node.style.fontSize = `min(${String(size)}rem, ${String(size * 3.2)}vw)`;
  return node;
}

function locationToggle(
  selected: Location,
  onSelect: (id: string) => void,
): HTMLElement {
  return element("fieldset", { class: "toggle" }, [
    element("legend", { class: "visually-hidden" }, ["Location"]),
    ...locations.map((location) => {
      const input = element("input", {
        type: "radio",
        name: "location",
        value: location.id,
      });
      input.checked = location.id === selected.id;
      input.addEventListener("change", () => {
        onSelect(location.id);
      });
      return element("label", {}, [
        input,
        element("span", {}, [location.name]),
      ]);
    }),
  ]);
}

function legend(): HTMLElement {
  const statuses: ShownStatus[] = ["confirmed", "forecast", "conditional"];
  return element(
    "ul",
    { class: "legend", "aria-label": "Kinds of fact" },
    statuses.map((status) =>
      element("li", { "data-status": status }, [
        marker(status),
        statusLabels[status],
      ]),
    ),
  );
}

const generatedFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

function footer(location: Location, generatedAt: string): HTMLElement {
  const notes: Children = [];
  if (location.id === "sydney-observatory-hill") {
    notes.push(
      element("p", {}, [
        "Observatory Hill's records join two stations: 066062 until 31 August 2020, then 066214. ",
        "The new station reads about 0.3°C warmer for maximums and 0.3°C cooler for minimums, so records that span the change are less exact.",
      ]),
    );
  }
  notes.push(
    element("p", {}, [
      `Updated ${generatedFormat.format(new Date(generatedAt))}. Data © `,
      element("a", { href: "https://www.bom.gov.au/" }, [
        "Bureau of Meteorology",
      ]),
      ", licensed under ",
      element("a", { href: "https://creativecommons.org/licenses/by/4.0/" }, [
        "CC BY 4.0",
      ]),
      ".",
    ]),
  );
  return element("footer", { class: "glass footer" }, [legend(), ...notes]);
}

export interface View {
  file: FactsFile;
  location: Location;
  now: Date;
  onSelect: (id: string) => void;
}

/** Builds the whole page for one location as it reads at `now`. */
export function render(
  root: HTMLElement,
  { file, location, now, onSelect }: View,
): void {
  const today = sydneyDate(now);
  const facts = file.locations.find((l) => l.locationId === location.id);

  const { dataset } = document.documentElement;
  dataset.sky = skyPhase(sydneyHour(now));
  const weather =
    facts === undefined ? undefined : forecastWeather(facts.forecast, today);
  if (weather === undefined) delete dataset.weather;
  else dataset.weather = weather;
  const page = facts === undefined ? undefined : arrange(facts, today);

  const header = element("header", { class: "top" }, [
    element("h1", {}, ["Sydney weather records"]),
    locationToggle(location, onSelect),
  ]);

  if (page === undefined) {
    root.replaceChildren(
      header,
      element("p", { class: "glass panel empty" }, [
        "There are no facts for this location yet.",
      ]),
    );
    return;
  }

  root.replaceChildren(
    header,
    element("section", { class: "glass today", "aria-labelledby": "today" }, [
      element("h2", { id: "today" }, [
        "Today",
        element("span", { class: "date" }, [longDate(page.date)]),
      ]),
      headline(page.headline, today),
      ...(page.today.length === 0 ? [] : [factList(page.today, today, "")]),
    ]),
    element("div", { class: "panels" }, [
      panel("coming-week", "Coming week", [
        factList(page.comingWeek, today, "Nothing notable in the forecast."),
      ]),
      panel("this-week", "This week", [
        factList(page.thisWeek, today, "Nothing notable this week."),
      ]),
      panel("this-month", "This month", [
        factList(page.thisMonth, today, "Nothing notable this month."),
      ]),
    ]),
    footer(location, file.generatedAt),
  );
}
