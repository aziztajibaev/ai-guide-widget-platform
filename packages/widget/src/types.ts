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

export type GuideRule = {
  slug: string;
  title: string;
  intent: string;
  aliases: string[];
  urlPattern: string | null;
  steps: GuideStep[];
};

export type WidgetConfig = {
  projectId: string;
  projectName: string;
  theme: {
    accent: string;
    robotBaseUrl: string;
    robotAssetFormat?: "png" | "svg";
    logoText?: string;
  };
  guides: GuideRule[];
};

export type PageElementMetadata = {
  ref?: string;
  selector: string;
  role?: string;
  label?: string;
  text?: string;
  tagName: string;
};
