import type { Fact, FactsFile, ValueStatus } from "../shared/facts.ts";
import { locations, type Location } from "../shared/locations.ts";
import { arrange, headlineSize, type Page, pageFor } from "./arrange.ts";
import { locationChoices } from "./choices.ts";
import {
  daylightSentence,
  longDate,
  sentence,
  standoutWord,
  sydneyDate,
} from "./naming.ts";
import { locationNotes } from "./notes.ts";
import { type RainView, rainView } from "./rain.ts";
import { type Placed, type SwingView, swingView } from "./swing.ts";
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

// Read out but not shown: the dot's glow shows it, and its shape that a value is still
// running, which the sentence doesn't say.
function spoken(fact: Fact, standout: number | undefined): Children {
  const words = [
    ...(standout === undefined ? [] : [standoutWord(standout)]),
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
  standout: number | undefined,
): Children {
  const { before, subject, after } =
    fact.kind === "daylight"
      ? daylightSentence(fact, today)
      : sentence(fact, today);
  return [
    ...spoken(fact, standout),
    before,
    element("strong", {}, [subject]),
    `${after}.`,
  ];
}

function factItem(
  fact: Fact,
  today: string,
  standout: number | undefined,
): HTMLElement {
  const status = shown(fact);
  return element(
    "li",
    { class: "fact", "data-status": status, ...standoutAttributes(standout) },
    [marker(status), element("p", {}, phrase(fact, today, standout))],
  );
}

function standoutAttributes(
  standout: number | undefined,
): Record<string, string> {
  if (standout === undefined) return {};
  return {
    "data-standout": "",
    style: `--standout: ${String(standout)}`,
  };
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

interface PanelSpec {
  id: string;
  title: string;
  facts: readonly Fact[];
  empty: string;
}

function panelSpecs(page: Page): PanelSpec[] {
  return [
    {
      id: "coming-week",
      title: "Coming week",
      facts: page.comingWeek,
      empty: "Nothing notable in the forecast.",
    },
    {
      id: "past-week",
      title: "Past week",
      facts: page.pastWeek,
      empty: "Nothing notable in the past week.",
    },
    {
      id: "past-month",
      title: "Past month",
      facts: page.pastMonth,
      empty: "Nothing notable in the past month.",
    },
    {
      id: "past-year",
      title: "Past year",
      facts: page.thisYear,
      empty: "Nothing notable in the past year.",
    },
  ];
}

// What the viewer has opened lasts across the page's redraws, which come with every update.
let yearOpen = false;

/** Past year is the longest list, so it spans the page and is folded away until opened. */
function collapsiblePanel(
  { id, title, facts, empty }: PanelSpec,
  page: Page,
  today: string,
): HTMLElement {
  const details = element("details", { class: "glass panel year" }, [
    element("summary", {}, [
      element("h2", { id }, [title]),
      element("span", { class: "count" }, [String(facts.length)]),
    ]),
    factList(facts, page, today, empty),
  ]);
  details.open = yearOpen;
  details.addEventListener("toggle", () => {
    yearOpen = details.open;
  });
  return details;
}

function headline(page: Page, today: string): HTMLElement {
  const fact = page.headline;
  if (fact === undefined) {
    return element("p", { class: "headline empty" }, [
      "Nothing notable yet today.",
    ]);
  }
  const status = shown(fact);
  const standout = page.standouts.get(fact);
  // The headline has no dot, so a value still running says so beneath it, with the glow
  // its dot would have in a list.
  const mark =
    status === "partial"
      ? [
          element(
            "span",
            {
              class: "headline-status",
              "aria-hidden": "true",
              ...standoutAttributes(standout),
            },
            [marker(status), statusLabels[status]],
          ),
        ]
      : [];
  const node = element("p", { class: "headline", "data-status": status }, [
    ...phrase(fact, today, standout),
    ...mark,
  ]);
  const size = headlineSize(fact.score);
  node.style.fontSize = `min(${String(size)}rem, ${String(size * 3.2)}vw)`;
  return node;
}

function placed(
  kind: string,
  { text, at, side }: Placed,
  children: Children = [],
): HTMLElement {
  return element(
    "span",
    {
      class: "swing-value",
      "data-kind": kind,
      ...(side === undefined ? {} : { "data-side": side }),
      style: `left: ${String(at)}%`,
    },
    [text, ...children],
  );
}

function at(className: string, position: number, kind = ""): HTMLElement {
  return element("span", {
    class: className,
    ...(kind === "" ? {} : { "data-kind": kind }),
    style: `left: ${String(position)}%`,
  });
}

function between(
  className: string,
  { start, end }: { start: number; end: number },
): HTMLElement {
  return element("span", {
    class: className,
    style: `left: ${String(start)}%; width: ${String(end - start)}%`,
  });
}

function rainFigure(view: RainView): HTMLElement {
  return element(
    "section",
    { class: "rainfall", "aria-labelledby": "rainfall" },
    [
      element("h3", { id: "rainfall" }, [
        element("span", { class: "rainfall-icon", "aria-hidden": "true" }),
        view.title,
      ]),
      element("p", { class: "rainfall-value" }, [
        view.text,
        element("small", {}, ["since midnight"]),
      ]),
    ],
  );
}

function swingFigure(view: SwingView): HTMLElement {
  const { from, current, forecast, filled, toGo } = view;
  const bar = element(
    "div",
    {
      class: "swing-bar",
      role: "img",
      "aria-label": view.description,
      style: `--colours: ${view.colours}`,
    },
    [
      element("span", { class: "swing-track" }),
      ...(filled === undefined
        ? []
        : [
            element("span", {
              class: "swing-fill",
              style: `--start: ${String(filled.start)}%; --end: ${String(filled.end)}%`,
            }),
          ]),
      ...(toGo === undefined ? [] : [between("swing-to-go", toGo)]),
      ...(from === undefined ? [] : [at("swing-tick", from.at, "from")]),
      ...(forecast?.passed === true
        ? [at("swing-tick", forecast.at, "forecast")]
        : []),
      ...(current === undefined
        ? []
        : [at("swing-knob", current.at), placed("current", current)]),
      ...(from === undefined
        ? []
        : [placed("from", from, [element("small", {}, [from.label])])]),
      ...(forecast === undefined
        ? []
        : [placed("forecast", forecast, [element("small", {}, ["forecast"])])]),
    ],
  );
  return element(
    "section",
    {
      class: "swing",
      "data-measure": view.measure,
      "aria-labelledby": "swing",
    },
    [
      element("h3", { id: "swing" }, [
        element("span", { class: "swing-icon", "aria-hidden": "true" }),
        view.title,
      ]),
      bar,
    ],
  );
}

export interface Locating {
  /** What to tell the viewer: that it is looking, how far the station found is ("289 km"), or why it couldn't. */
  message: string;
  state: "finding" | "found" | "failed";
}

function locationSelect(
  selected: Location,
  onSelect: (id: string) => void,
  onLocate: (() => void) | undefined,
  locating: Locating | undefined,
): HTMLElement {
  const select = element(
    "select",
    { id: "location-select", class: "location-select" },
    locationChoices(locations, selected.id).map((choice) => {
      const option = element("option", { value: choice.id }, [choice.name]);
      option.selected = choice.selected;
      return option;
    }),
  );
  select.addEventListener("change", () => {
    onSelect(select.value);
  });

  const picker = element("div", { class: "location-picker" });
  if (locating !== undefined && locating.state !== "failed") {
    picker.append(
      element("span", { class: "distance", role: "status" }, [
        locating.message,
        ...(locating.state === "found"
          ? [element("span", { class: "away" }, [" away"])]
          : []),
      ]),
    );
  }
  picker.append(select);
  if (onLocate !== undefined) {
    const button = element("button", {
      type: "button",
      class: "locate",
      title: "Use my location",
      "aria-label": "Use my location",
    });
    button.disabled = locating?.state === "finding";
    button.addEventListener("click", onLocate);
    picker.append(button);
  }

  const children: Children = [
    element("label", { class: "visually-hidden", for: "location-select" }, [
      "Location",
    ]),
    picker,
  ];
  if (locating?.state === "failed") {
    children.push(
      element("p", { class: "locate-note", role: "status" }, [
        locating.message,
      ]),
    );
  }
  return element("div", { class: "locations" }, children);
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
  /** Absent where the browser can't find the viewer's location. */
  onLocate: (() => void) | undefined;
  locating: Locating | undefined;
}

/** Builds the whole page for one location as it reads at `now`. */
export function render(
  root: HTMLElement,
  { file, location, now, onSelect, onLocate, locating }: View,
): void {
  const today = sydneyDate(now);
  const facts = file.locations.find((l) => l.locationId === location.id);

  const pageFacts =
    facts === undefined ? undefined : pageFor(facts.pages, today);
  const page = pageFacts === undefined ? undefined : arrange(pageFacts);
  const swing = facts === undefined ? undefined : swingView(facts.swing, today);
  const rain =
    facts === undefined ? undefined : rainView(facts.rainToday, today);

  const header = element("header", { class: "top" }, [
    element("h1", {}, ["NSW Weather Records"]),
    locationSelect(location, onSelect, onLocate, locating),
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
      ...(swing === undefined && rain === undefined
        ? []
        : [
            element("div", { class: "figures" }, [
              ...(swing === undefined ? [] : [swingFigure(swing)]),
              ...(rain === undefined ? [] : [rainFigure(rain)]),
            ]),
          ]),
    ]),
    ...panelsFor(page, today),
    footer(location, file.generatedAt, now),
  );
}

function panelsFor(page: Page, today: string): HTMLElement[] {
  const specs = panelSpecs(page);
  const year = specs.pop();
  return [
    element(
      "div",
      { class: "panels" },
      specs.map(({ id, title, facts, empty }) =>
        panel(id, title, [factList(facts, page, today, empty)]),
      ),
    ),
    ...(year === undefined ? [] : [collapsiblePanel(year, page, today)]),
  ];
}
