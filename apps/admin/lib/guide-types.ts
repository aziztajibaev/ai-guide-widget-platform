export type RobotState =
  | "idle"
  | "talking"
  | "pointing"
  | "pointing-left"
  | "pointing-right"
  | "thinking"
  | "success"
  | "error";

export type GuideStep = {
  target: string;
  message: string;
  robotState: RobotState;
  placement: "auto" | "top" | "right" | "bottom" | "left";
  waitFor: "click" | "focus" | "visible" | "manual";
};

export type PublicGuideRule = {
  slug: string;
  title: string;
  intent: string;
  aliases: string[];
  urlPattern: string | null;
  steps: GuideStep[];
};

export type PublicKnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  enabled: boolean;
};

export type PublicWidgetConfig = {
  projectId: string;
  projectName: string;
  domain: string | null;
  theme: {
    accent: string;
    robotBaseUrl: string;
    robotAssetFormat?: "png" | "svg";
    logoText?: string;
  };
  guides: PublicGuideRule[];
};

export type PageElementMetadata = {
  ref?: string;
  selector: string;
  role?: string;
  label?: string;
  text?: string;
  tagName: string;
};

export type AiSource =
  | "lmstudio"
  | "groq"
  | "deepseek"
  | "gemini"
  | "openai"
  | "anthropic"
  | "mistral"
  | "xai"
  | "cohere"
  | "perplexity"
  | "openrouter"
  | "rules-fallback"
  | "none";

export type AiAskResponse = {
  type: "guide" | "answer" | "fallback";
  message: string;
  source?: AiSource;
  guide?: PublicGuideRule;
};
