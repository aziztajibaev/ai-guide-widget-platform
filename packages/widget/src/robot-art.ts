import type { RobotState } from "./types";

const colors: Record<RobotState, string> = {
  idle: "#2563eb",
  talking: "#0ea5e9",
  pointing: "#14b8a6",
  "pointing-left": "#14b8a6",
  "pointing-right": "#14b8a6",
  thinking: "#7c3aed",
  success: "#16a34a",
  error: "#ea580c"
};

function smartupMark(accent: string) {
  return `
    <g transform="translate(105 139)">
      <path d="M0 6 C0 2 4 0 8 3 L23 16 L38 3 C42 0 46 2 46 6 V39 C46 43 42 46 38 43 L23 30 L8 43 C4 46 0 43 0 39 Z" fill="#13c8b5"/>
      <path d="M23 16 L38 3 C42 0 46 2 46 6 V39 C46 43 42 46 38 43 L23 30 Z" fill="${accent}"/>
      <path d="M8 10 L23 23 L38 10" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".92"/>
    </g>`;
}

export function robotSvg(state: RobotState, logoText = "smartup") {
  const accent = colors[state] ?? colors.idle;
  const isPointing = state === "pointing" || state === "pointing-right";
  const isPointingLeft = state === "pointing-left";
  const isTalking = state === "talking";
  const isThinking = state === "thinking";
  const isSuccess = state === "success";
  const isError = state === "error";
  const headTilt = isPointing ? "rotate(-7 128 76)" : isThinking ? "rotate(5 128 76)" : "";
  const leftArm = isTalking
    ? "M82 135 C58 138 42 150 31 169"
    : isPointingLeft
      ? "M82 134 C59 119 44 99 32 76"
    : isSuccess
      ? "M82 135 C61 122 51 106 46 86"
      : "M82 135 C60 147 46 161 36 180";
  const rightArm = isPointing
    ? "M174 134 C197 119 212 99 224 76"
    : isError
      ? "M174 134 C198 143 214 160 224 181"
      : "M174 134 C198 146 212 163 222 181";
  const rightHand = isPointing ? "224 75" : isError ? "224 181" : "222 181";
  const leftHand = isPointingLeft ? "32 75" : isTalking ? "31 169" : isSuccess ? "46 86" : "36 180";
  const mouth = isTalking
    ? '<path d="M105 94 C119 107 137 107 151 94" stroke="#dff8ff" stroke-width="5" fill="none" stroke-linecap="round"/>'
    : "";
  const thinkingDots = isThinking
    ? '<circle cx="189" cy="37" r="7" fill="#7c3aed"/><circle cx="211" cy="25" r="4.5" fill="#7c3aed"/><circle cx="227" cy="18" r="3" fill="#7c3aed"/>'
    : "";
  const success = isSuccess
    ? '<path d="M80 93 L108 119 L169 67" fill="none" stroke="#16a34a" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>'
    : "";
  const error = isError
    ? '<path d="M91 81 L165 117 M165 81 L91 117" fill="none" stroke="#ea580c" stroke-width="10" stroke-linecap="round" opacity=".9"/>'
    : "";

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs>
      <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="13" stdDeviation="9" flood-color="#061b5f" flood-opacity=".22"/>
      </filter>
      <linearGradient id="body" x1="76" y1="42" x2="184" y2="224" gradientUnits="userSpaceOnUse">
        <stop stop-color="#ffffff"/>
        <stop offset=".52" stop-color="#f6fbff"/>
        <stop offset="1" stop-color="#dcecff"/>
      </linearGradient>
      <linearGradient id="visor" x1="74" y1="69" x2="182" y2="112" gradientUnits="userSpaceOnUse">
        <stop stop-color="#081b5c"/>
        <stop offset="1" stop-color="#0b3b8f"/>
      </linearGradient>
    </defs>
    <g filter="url(#shadow)" stroke="#07175c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="128" cy="225" rx="64" ry="9" fill="#061b5f" opacity=".12" stroke="none"/>
      <g transform="${headTilt}">
        <path d="M76 67 C83 43 104 30 128 30 C152 30 173 43 180 67 L171 118 C157 135 100 135 85 118 Z" fill="url(#body)"/>
        <path d="M101 37 C115 29 143 29 155 37" fill="none" stroke="${accent}" stroke-width="7"/>
        <rect x="75" y="66" width="106" height="50" rx="24" fill="url(#visor)"/>
        <ellipse cx="108" cy="91" rx="17" ry="11" fill="#dff8ff"/>
        <ellipse cx="148" cy="91" rx="17" ry="11" fill="#dff8ff"/>
        ${mouth}
        <circle cx="68" cy="91" r="17" fill="#f6fbff"/>
        <circle cx="188" cy="91" r="17" fill="#f6fbff"/>
      </g>
      <path d="M92 127 C104 119 152 119 164 127 L178 188 C164 210 92 210 78 188 Z" fill="url(#body)"/>
      ${smartupMark(accent)}
      <path d="${leftArm}" fill="none"/>
      <path d="${rightArm}" fill="none"/>
      <circle cx="82" cy="135" r="16" fill="${accent}"/>
      <circle cx="174" cy="135" r="16" fill="${accent}"/>
      <ellipse cx="${leftHand.split(" ")[0]}" cy="${leftHand.split(" ")[1]}" rx="16" ry="19" fill="#ffffff"/>
      <ellipse cx="${rightHand.split(" ")[0]}" cy="${rightHand.split(" ")[1]}" rx="16" ry="19" fill="#ffffff"/>
      <path d="M103 194 L91 230 H69 L80 190" fill="url(#body)"/>
      <path d="M153 194 L165 230 H187 L176 190" fill="url(#body)"/>
      <path d="M91 231 H60 C62 214 76 211 99 216 Z" fill="#ffffff"/>
      <path d="M165 231 H196 C194 214 180 211 157 216 Z" fill="#ffffff"/>
      <rect x="99" y="124" width="58" height="78" rx="28" fill="none" opacity=".28"/>
      ${thinkingDots}
      ${success}
      ${error}
    </g>
    <text x="128" y="250" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="#0b2a67" opacity=".72">${logoText}</text>
  </svg>`;
}

export function fallbackRobotDataUrl(state: RobotState, logoText = "smartup") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(robotSvg(state, logoText))}`;
}
