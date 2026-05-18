import type { GuideStep, PublicGuideRule } from "./guide-types";

const robotStates = new Set([
  "idle",
  "talking",
  "pointing",
  "pointing-left",
  "pointing-right",
  "thinking",
  "success",
  "error"
]);
const placements = new Set(["auto", "top", "right", "bottom", "left"]);
const waitModes = new Set(["click", "focus", "visible", "manual"]);

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function toGuideSteps(value: unknown): GuideStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      target: typeof item.target === "string" ? item.target : "",
      message: typeof item.message === "string" ? item.message : "",
      robotState:
        typeof item.robotState === "string" && robotStates.has(item.robotState)
          ? (item.robotState as GuideStep["robotState"])
          : "talking",
      placement:
        typeof item.placement === "string" && placements.has(item.placement)
          ? (item.placement as GuideStep["placement"])
          : "auto",
      waitFor:
        typeof item.waitFor === "string" && waitModes.has(item.waitFor)
          ? (item.waitFor as GuideStep["waitFor"])
          : "manual"
    }))
    .filter((step) => step.target && step.message);
}

export function serializeGuide(rule: {
  slug: string;
  title: string;
  intent: string;
  aliases: unknown;
  urlPattern: string | null;
  steps: unknown;
}): PublicGuideRule {
  return {
    slug: rule.slug,
    title: rule.title,
    intent: rule.intent,
    aliases: toStringArray(rule.aliases),
    urlPattern: rule.urlPattern,
    steps: toGuideSteps(rule.steps)
  };
}
