import type { PageElementMetadata, PublicGuideRule } from "./guide-types";

function normalize(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9а-яё' ]/gi, " ").replace(/\s+/g, " ").trim();
}

function scoreGuide(question: string, guide: PublicGuideRule, path: string) {
  const q = normalize(question);
  const candidates = [guide.title, guide.intent, ...guide.aliases].map(normalize);
  let score = 0;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (q === candidate) {
      score += 10;
    } else if (q.includes(candidate) || candidate.includes(q)) {
      score += 6;
    } else {
      const words = candidate.split(" ").filter(Boolean);
      score += words.filter((word) => q.includes(word)).length;
    }
  }

  if (guide.urlPattern && path.includes(guide.urlPattern)) {
    score += 3;
  }

  return score;
}

export function findBestGuide(question: string, guides: PublicGuideRule[], path = "") {
  const ranked = guides
    .map((guide) => ({ guide, score: scoreGuide(question, guide, path) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score > 1 ? ranked[0].guide : null;
}

export function safeMetadataSummary(metadata: PageElementMetadata[]) {
  return metadata.slice(0, 90).map((item, index) => ({
    ref: item.ref || `e${index + 1}`,
    role: item.role,
    label: item.label?.slice(0, 64),
    text: item.text?.slice(0, 110),
    tagName: item.tagName
  }));
}
