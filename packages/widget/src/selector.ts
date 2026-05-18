import type { PageElementMetadata } from "./types";

const sensitiveTypes = new Set(["password", "hidden", "file"]);
const metadataSelector =
  "button, a, input, textarea, select, label, th, td, tr, li, h1, h2, h3, h4, [role], [data-guide], [aria-label]";
const widgetIgnoreSelector = ".ai-guide-root, .ai-guide-edit-banner";
const maxMetadataElements = 90;
const sensitiveTextPattern =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s().-]{6,}\d)|([A-Za-z0-9_-]{18,})/gi;
const queryStopWords = new Set([
  "where",
  "what",
  "which",
  "please",
  "button",
  "click",
  "qayer",
  "qayerda",
  "qaer",
  "qaerda",
  "qanday",
  "nima",
  "kerak",
  "tugma",
  "bosing",
  "korsat",
  "ko'rsat"
]);

export function cssEscape(value: string) {
  if ("CSS" in window && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\#.:,[\]>+~*'=]/g, "\\$&");
}

export function stableSelector(element: Element) {
  const guide = element.getAttribute("data-guide");
  if (guide) {
    return `[data-guide="${cssEscape(guide)}"]`;
  }

  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (child): child is Element => child instanceof Element && child.tagName === currentTag
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }

  return parts.join(" > ");
}

function isWidgetElement(element: Element) {
  return Boolean(element.closest(widgetIgnoreSelector));
}

export function resolveTarget(target: string) {
  const trimmed = target.trim();

  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("[") && !trimmed.includes("#") && !trimmed.includes(".") && !trimmed.includes(" ")) {
    const dataGuide = Array.from(document.querySelectorAll(`[data-guide="${cssEscape(trimmed)}"]`)).find(
      (element) => element instanceof HTMLElement && !isWidgetElement(element)
    );
    if (dataGuide instanceof HTMLElement) {
      return dataGuide;
    }
  }

  try {
    const selected = Array.from(document.querySelectorAll(trimmed)).find(
      (element) => element instanceof HTMLElement && !isWidgetElement(element)
    );
    if (selected instanceof HTMLElement) {
      return selected;
    }
  } catch {
    // Fall through to semantic matching.
  }

  const normalized = trimmed.toLowerCase();
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(metadataSelector)
  ).filter((element) => !isWidgetElement(element));

  return (
    candidates.find((element) => {
      const label =
        element.getAttribute("aria-label") ||
        element.innerText ||
        element.getAttribute("placeholder") ||
        "";
      return label.toLowerCase().includes(normalized);
    }) ?? null
  );
}

function isMetadataVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function isSensitiveInput(element: HTMLElement) {
  return (
    element instanceof HTMLInputElement &&
    (sensitiveTypes.has(element.type) ||
      /password|token|secret|key|otp|code/i.test(
        `${element.name} ${element.id} ${element.getAttribute("aria-label") ?? ""}`
      ))
  );
}

function safeText(text: string | null | undefined) {
  return (text ?? "")
    .replace(sensitiveTextPattern, (match) => {
      if (match.includes("@")) return "[redacted-email]";
      return "[redacted]";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function ariaLabelledByText(element: HTMLElement) {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids
    .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "")
    .filter(Boolean)
    .join(" ");
}

function associatedLabelText(element: HTMLElement) {
  const id = element.id;
  const explicit = id ? document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`) : null;
  const wrapping = element.closest("label");
  const fieldLabel = element.closest(".field, .form-field, .input-group, .control")?.querySelector("label");
  const previousLabel = element.previousElementSibling instanceof HTMLLabelElement ? element.previousElementSibling : null;

  return safeText(
    ariaLabelledByText(element) ||
      explicit?.innerText ||
      explicit?.textContent ||
      wrapping?.innerText ||
      wrapping?.textContent ||
      fieldLabel?.innerText ||
      fieldLabel?.textContent ||
      previousLabel?.innerText ||
      previousLabel?.textContent
  );
}

function elementLabel(element: HTMLElement) {
  const semanticParts = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    associatedLabelText(element),
    element.getAttribute("placeholder")
  ].filter(Boolean);

  if (!semanticParts.length) {
    semanticParts.push(element.getAttribute("data-guide"));
  }

  return safeText(semanticParts.join(" "));
}

function semanticRole(element: HTMLElement) {
  const role = element.getAttribute("role");
  if (role) return role;
  if (element instanceof HTMLButtonElement) return "button";
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLInputElement) return "textbox";
  if (element instanceof HTMLTextAreaElement) return "textbox";
  if (element instanceof HTMLSelectElement) return "combobox";
  if (element instanceof HTMLTableRowElement) return "row";
  if (element.tagName.toLowerCase() === "th") return "columnheader";
  if (element instanceof HTMLTableCellElement) return "cell";
  return undefined;
}

function metadataQueryWords(question: string) {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !queryStopWords.has(word))
    .slice(0, 24);
}

function isInteractiveMetadata(item: PageElementMetadata) {
  return (
    ["button", "a", "input", "textarea", "select"].includes(item.tagName) ||
    ["button", "link", "menuitem", "tab", "textbox", "combobox"].includes(item.role ?? "")
  );
}

function metadataRankScore(item: PageElementMetadata, words: string[]) {
  const label = (item.label ?? "").toLowerCase();
  const text = (item.text ?? "").toLowerCase();
  const selector = item.selector.toLowerCase();
  const haystack = `${label} ${text} ${(item.role ?? "").toLowerCase()} ${item.tagName} ${selector}`;
  const queryScore = words.reduce((score, word) => {
    if (label.includes(word)) return score + 22;
    if (text.includes(word)) return score + 12;
    if (selector.includes(word)) return score + 5;
    return score;
  }, 0);
  const interactiveScore = isInteractiveMetadata(item) ? 10 : 0;
  const headingScore = /^h[1-4]$/.test(item.tagName) ? 7 : 0;
  const guideScore = item.selector.includes("[data-guide=") ? 16 : 0;
  const menuScore = ["menuitem", "tab", "navigation"].includes(item.role ?? "") ? 7 : 0;
  const tablePenalty = ["td", "tr"].includes(item.tagName) && queryScore === 0 ? 14 : 0;
  const emptyContextPenalty = !haystack.trim() ? 20 : 0;

  return queryScore + interactiveScore + headingScore + guideScore + menuScore - tablePenalty - emptyContextPenalty;
}

function rankMetadata(items: PageElementMetadata[], question: string) {
  const words = metadataQueryWords(question);

  return items
    .map((item, index) => ({ item, index, score: metadataRankScore(item, words) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

export function collectSafeMetadata(question = ""): PageElementMetadata[] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(metadataSelector));
  const seen = new Set<string>();

  const metadata = elements
    .filter((element) => {
      if (isWidgetElement(element)) {
        return false;
      }

      if (isSensitiveInput(element)) {
        return false;
      }

      if (!isMetadataVisible(element)) {
        return false;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return true;
      }

      const text = safeText(element.innerText || element.textContent);
      return Boolean(text || element.getAttribute("aria-label") || element.getAttribute("data-guide"));
    })
    .map((element) => ({
      selector: stableSelector(element),
      role: semanticRole(element),
      label: elementLabel(element) || undefined,
      text:
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
          ? undefined
          : safeText(element.innerText || element.textContent) || undefined,
      tagName: element.tagName.toLowerCase()
    }))
    .filter((item) => {
      const key = `${item.selector}:${item.text ?? ""}:${item.label ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((item) => item.selector && (item.label || item.text || ["input", "textarea", "select"].includes(item.tagName)));

  return rankMetadata(metadata, question)
    .slice(0, maxMetadataElements)
    .map((item, index) => ({
      ...item,
      ref: `e${index + 1}`,
      label: item.label?.slice(0, 96),
      text: item.text?.slice(0, 120)
    }));
}
