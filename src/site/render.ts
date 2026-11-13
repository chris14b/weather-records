import type { Fact, FactsFile, ValueStatus } from "../shared/facts.ts";
import { locations, type Location } from "../shared/locations.ts";
import {
  arrange,
  headlineSize,
  type Page,
  pageFor,
  type Standout,
} from "./arrange.ts";
import { daylightSentence, longDate, sentence, sydneyDate } from "./naming.ts";
import { locationNotes } from "./notes.ts";
import { updateNote } from "./updates.ts";

export type Children = (Node | string)[];

/** An element with its attributes and children. */
export function element<K extends keyof HTMLElementTagNameMap>(
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

/** How the page marks a fact: the live feed counts as observed, like the daily files. */
type ShownStatus = Exclude<ValueStatus, "provisional"> | "daylight";

function shown(fact: Fact): ShownStatus {
  if (fact.kind === "daylight") return "daylight";
  return fact.status === "provisional" ? "confirmed" : fact.status;
}

const statusLabels: Record<ShownStatus, string> = {
  confirmed: "Observed",
  partial: "So far",
  forecast: "Forecast",
  conditional: "If it gets there",
  daylight: "Daylight",
};

function marker(status: ShownStatus): HTMLElement {
  return element("span", {
    class: "marker",
    "data-status": status,
    "aria-hidden": "true",
  });
}

const standoutLabels: Record<Standout, string> = {
  notable: "Notable",
  exceptional: "Exceptional",
};

// Read out but not shown: the dot's glow shows it, and its shape that a value is still
// running, which the sentence doesn't say.
function spoken(fact: Fact, level: Standout | undefined): Children {
  const words = [
    ...(level === undefined ? [] : [standoutLabels[level]]),
    ...(fact.kind === "record" && fact.status === "partial"
      ? [statusLabels.partial]
      : []),
  ];
  if (words.length === 0) return [];
  return [
    element("span", { class: "visually-hidden" }, [`${words.join(", ")}: `]),
  ];
}

function phrase(
  fact: Fact,
  today: string,
  level: Standout | undefined,
): Children {
  const { before, subject, after } =
    fact.kind === "daylight"
      ? daylightSentence(fact, today)
      : sentence(fact, today);
  return [
    ...spoken(fact, level),
    before,
    element("strong", {}, [subject]),
    `${after}.`,
  ];
}

function factItem(
  fact: Fact,
  today: string,
  level: Standout | undefined,
): HTMLElement {
  const status = shown(fact);
  const attributes: Record<string, string> = {
    class: "fact",
    "data-status": status,
  };
  if (level !== undefined) attributes["data-standout"] = level;
  return element("li", attributes, [
    marker(status),
    element("p", {}, phrase(fact, today, level)),
  ]);
}

function factList(
  facts: readonly Fact[],
  page: Page,
  today: string,
  empty: string,
): HTMLElement {
  if (facts.length === 0) return element("p", { class: "empty" }, [empty]);
  return element(
    "ul",
    { class: "facts" },
    facts.map((fact) => factItem(fact, today, page.standouts.get(fact))),
  );
}

function panel(id: string, title: string, children: Children): HTMLElement {
  return element("section", { class: "glass panel", "aria-labelledby": id }, [
    element("h2", { id }, [title]),
    ...children,
  ]);
}

function headline(page: Page, today: string): HTMLElement {
  const fact = page.headline;
  if (fact === undefined) {
    return element("p", { class: "headline empty" }, [
      "Nothing notable yet today.",
    ]);
  }
  const status = shown(fact);
  const level = page.standouts.get(fact);
  // The headline has no dot, so a value still running says so beneath it, with the glow
  // its dot would have in a list.
  const markAttributes: Record<string, string> = {
    class: "headline-status",
    "aria-hidden": "true",
  };
  if (level !== undefined) markAttributes["data-standout"] = level;
  const mark =
    status === "partial"
      ? [
          element("span", markAttributes, [
            marker(status),
            statusLabels[status],
          ]),
        ]
      : [];
  const node = element("p", { class: "headline", "data-status": status }, [
    ...phrase(fact, today, level),
    ...mark,
  ]);
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
  const statuses: ShownStatus[] = [
    "confirmed",
    "partial",
    "forecast",
    "conditional",
    "daylight",
  ];
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

function footer(
  location: Location,
  generatedAt: string,
  now: Date,
): HTMLElement {
  const notes: Children = locationNotes(location.id).map((note) =>
    element("p", {}, [note]),
  );
  notes.push(
    element("p", {}, [
      `${updateNote(generatedAt, now)} Data © `,
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

  const pageFacts =
    facts === undefined ? undefined : pageFor(facts.pages, today);
  const page = pageFacts === undefined ? undefined : arrange(pageFacts);

  const header = element("header", { class: "top" }, [
    element("h1", {}, ["Sydney Weather Records"]),
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
      headline(page, today),
      ...(page.today.length === 0
        ? []
        : [factList(page.today, page, today, "")]),
    ]),
    element("div", { class: "panels" }, [
      panel("coming-week", "Coming week", [
        factList(
          page.comingWeek,
          page,
          today,
          "Nothing notable in the forecast.",
        ),
      ]),
      panel("past-week", "Past week", [
        factList(
          page.pastWeek,
          page,
          today,
          "Nothing notable in the past week.",
        ),
      ]),
      panel("past-month", "Past month", [
        factList(
          page.pastMonth,
          page,
          today,
          "Nothing notable in the past month.",
        ),
      ]),
    ]),
    footer(location, file.generatedAt, now),
  );
}
