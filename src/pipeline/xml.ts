import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { inContext } from "./errors.ts";

/** An XML element: its attributes as strings, its text, and its child elements by tag. */
export type XmlElement = Readonly<
  Record<string, string | readonly XmlElement[] | undefined>
>;

const textKey = "#text";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  alwaysCreateTextNode: true,
  textNodeName: textKey,
  isArray: (_tag, _path, _isLeaf, isAttribute) => !isAttribute,
});

/** Parses a UTF-8 XML document, returning a node whose children are its root elements. */
export function parseXml(bytes: Uint8Array, name: string): XmlElement {
  const text = new TextDecoder().decode(bytes);
  inContext(`${name} is not valid XML`, () => SyntaxValidator.validate(text));
  return parser.parse(text) as XmlElement;
}

export function children(node: XmlElement, tag: string): readonly XmlElement[] {
  const value = node[tag];
  if (typeof value === "string") {
    throw new Error(`Expected <${tag}> elements, found an attribute`);
  }
  return value ?? [];
}

/** The node's only child with this tag. */
export function child(node: XmlElement, tag: string): XmlElement {
  const found = children(node, tag);
  const [only] = found;
  if (only === undefined || found.length > 1) {
    throw new Error(
      `Expected one <${tag}> element, found ${String(found.length)}`,
    );
  }
  return only;
}

export function attribute(node: XmlElement, name: string): string {
  const value = node[name];
  if (typeof value !== "string") {
    throw new Error(`Expected a ${name} attribute`);
  }
  return value;
}

export function text(node: XmlElement): string {
  const value = node[textKey];
  return typeof value === "string" ? value : "";
}

/** The text of a path of single elements, such as `["product", "amoc", "identifier"]`. */
export function textAt(node: XmlElement, path: readonly string[]): string {
  return text(path.reduce(child, node));
}
