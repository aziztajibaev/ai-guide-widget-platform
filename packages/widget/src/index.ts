import type { GuideRule, GuideStep, RobotState, WidgetConfig } from "./types";
import { collectSafeMetadata, resolveTarget, stableSelector } from "./selector";

type WidgetPosition = {
  x: number;
  y: number;
};

type ResolvedPlacement = GuideStep["placement"];

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

const currentScript = document.currentScript as HTMLScriptElement | null;
const projectId = currentScript?.dataset.projectId || "demo-project";
const scriptUrl = currentScript?.src ? new URL(currentScript.src) : new URL(window.location.href);
const apiBase = `${scriptUrl.protocol}//${scriptUrl.host}`;
const storageKey = `ai-guide-widget:${projectId}:position`;
const historyKey = `ai-guide-widget:${projectId}:history`;
const dockKey = `ai-guide-widget:${projectId}:docked`;
const editMode = new URLSearchParams(window.location.search).get("guideEdit") === "1";
const widgetName = "Smartup Guide";

type UiLocale = "uz" | "ru" | "en";

const uiText: Record<
  UiLocale,
  {
    initialMessage: string;
    inputPlaceholder: string;
    send: string;
    clear: string;
    emptyHistory: string;
    openChat: string;
    hideChat: string;
    dockRobot: string;
    back: string;
    done: string;
    stop: string;
    next: string;
    step: string;
    loading: string;
    thinkingShort: string;
    nextLoading: string;
    requestStopped: string;
    requestFailed: string;
    guideDone: string;
    guideStopped: string;
    targetMissing: string;
    configMissing: string;
  }
> = {
  uz: {
    initialMessage: "Savolingizni yozing. Kerak bo'lsa sahifadagi joyni ko'rsataman.",
    inputPlaceholder: "Savolingizni yozing...",
    send: "Yuborish",
    clear: "Tozalash",
    emptyHistory: "Hali suhbat yo'q",
    openChat: "Chatni ochish",
    hideChat: "Chatni yashirish",
    dockRobot: "Robotni chetga yashirish",
    back: "Orqaga",
    done: "Tayyor",
    stop: "To'xtatish",
    next: "Keyingi",
    step: "Qadam",
    loading: "Sahifa va hujjatlar bo'yicha o'ylayapman...",
    thinkingShort: "Javob tayyorlanmoqda",
    nextLoading: "Keyingi qadam uchun sahifani tekshiryapman...",
    requestStopped: "O'ylash to'xtatildi. Yangi savol yozishingiz mumkin.",
    requestFailed: "Javob olishda xatolik bo'ldi. Birozdan keyin qayta urinib ko'ring.",
    guideDone: "Tayyor. Shu joydan davom etishingiz mumkin.",
    guideStopped: "Guide to'xtatildi. Tayyor bo'lsangiz, yana savol bering.",
    targetMissing: "Bu elementni topa olmadim:",
    configMissing: "Widget sozlamasini yuklab bo'lmadi."
  },
  ru: {
    initialMessage: "Напишите вопрос. Если нужно, покажу нужное место на странице.",
    inputPlaceholder: "Напишите вопрос...",
    send: "Отправить",
    clear: "Очистить",
    emptyHistory: "Истории пока нет",
    openChat: "Открыть чат",
    hideChat: "Скрыть чат",
    dockRobot: "Спрятать робота у края",
    back: "Назад",
    done: "Готово",
    stop: "Стоп",
    next: "Далее",
    step: "Шаг",
    loading: "Изучаю страницу и документы...",
    thinkingShort: "Готовлю ответ",
    nextLoading: "Проверяю страницу для следующего шага...",
    requestStopped: "Запрос остановлен. Можно задать новый вопрос.",
    requestFailed: "Не удалось получить ответ. Попробуйте еще раз.",
    guideDone: "Готово. Можно продолжать отсюда.",
    guideStopped: "Гайд остановлен. Задайте новый вопрос, когда будете готовы.",
    targetMissing: "Не смог найти этот элемент:",
    configMissing: "Не удалось загрузить настройки виджета."
  },
  en: {
    initialMessage: "Ask a question. If needed, I will point to the right place on the page.",
    inputPlaceholder: "Ask a question...",
    send: "Send",
    clear: "Clear",
    emptyHistory: "No conversation yet",
    openChat: "Open chat",
    hideChat: "Hide chat",
    dockRobot: "Hide robot at the edge",
    back: "Back",
    done: "Done",
    stop: "Stop",
    next: "Next",
    step: "Step",
    loading: "Thinking through the page and documents...",
    thinkingShort: "Preparing the answer",
    nextLoading: "Checking the page for the next step...",
    requestStopped: "Thinking stopped. You can ask a new question.",
    requestFailed: "I could not get an answer. Please try again in a moment.",
    guideDone: "Done. You can keep working from here.",
    guideStopped: "Guide stopped. Ask another question when you are ready.",
    targetMissing: "I could not find this target:",
    configMissing: "Widget config could not be loaded."
  }
};

let config: WidgetConfig | null = null;
let activeGuide: GuideRule | null = null;
let activeStepIndex = 0;
let activeTarget: HTMLElement | null = null;
let activeStepCleanup: (() => void) | null = null;
let activeQuestion = "";
let completedSteps: GuideStep[] = [];
let widgetPosition: WidgetPosition = loadPosition();
let minimized = false;
let docked = loadDocked();
let dragStart: { x: number; y: number; baseX: number; baseY: number } | null = null;
let travellingTimer: number | null = null;
let chatHistory: ChatMessage[] = loadHistory();
let isThinking = false;
let activeRequest: { id: number; controller: AbortController } | null = null;
let requestSequence = 0;
let stepRunToken = 0;
let stepTimers: number[] = [];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadPosition(): WidgetPosition {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as WidgetPosition;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return parsed;
      }
    }
  } catch {
    // Ignore broken persisted state.
  }

  return {
    x: Number.MAX_SAFE_INTEGER,
    y: Math.max(120, window.innerHeight - 380)
  };
}

function savePosition() {
  localStorage.setItem(storageKey, JSON.stringify(widgetPosition));
}

function loadDocked() {
  try {
    return localStorage.getItem(dockKey) === "1";
  } catch {
    return false;
  }
}

function saveDocked() {
  localStorage.setItem(dockKey, docked ? "1" : "0");
}

function loadHistory(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(historyKey);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved) as ChatMessage[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.text === "string" &&
          typeof item.createdAt === "number"
      )
      .slice(-30);
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(historyKey, JSON.stringify(chatHistory.slice(-30)));
}

function pageLanguage() {
  return (
    document.documentElement.getAttribute("lang") ||
    document.documentElement.lang ||
    navigator.language ||
    ""
  ).toLowerCase();
}

function uiLocale(): UiLocale {
  const language = pageLanguage();
  if (language.startsWith("ru")) return "ru";
  if (language.startsWith("en")) return "en";
  return "uz";
}

function t(key: keyof (typeof uiText)["uz"]) {
  return uiText[uiLocale()][key];
}

function escapeAttribute(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char] ?? char;
  });
}

function ensureFontAwesome() {
  if (document.getElementById("ai-guide-fontawesome")) {
    return;
  }

  const link = document.createElement("link");
  link.id = "ai-guide-fontawesome";
  link.rel = "stylesheet";
  link.href = `${apiBase}/fontawesome/css/all.min.css`;
  document.head.appendChild(link);
}

function injectStyles(accent: string) {
  const style = document.createElement("style");
  style.textContent = `
    .ai-guide-root{--ai-accent:${accent};--ai-ink:#07111f;--ai-muted:#526174;--ai-line:#dce5f0;--ai-soft:#f4f7fb;animation:ai-guide-root-enter 360ms ease-out both;position:fixed;left:0;top:0;width:min(590px,calc(100vw - 18px));z-index:2147483000;transform:translate(var(--ai-x),var(--ai-y));transition:transform 620ms cubic-bezier(.18,.9,.24,1);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ai-ink);user-select:none}
    .ai-guide-root *{box-sizing:border-box}
    .ai-guide-root.ai-guide-dragging{transition:none}
    .ai-guide-card{display:flex;align-items:flex-end;gap:12px;pointer-events:auto}
    .ai-guide-root.ai-guide-side-left .ai-guide-card{flex-direction:row-reverse}
    .ai-guide-root.ai-guide-side-top .ai-guide-card{align-items:center;flex-direction:column-reverse}
    .ai-guide-root.ai-guide-side-bottom .ai-guide-card{align-items:center;flex-direction:column}
    .ai-guide-robot-stage{height:150px;position:relative;width:130px;cursor:grab;flex:0 0 auto}
    .ai-guide-robot-stage:active{cursor:grabbing}
    .ai-guide-dock-logo{display:none}
    .ai-guide-robot-stage:before{background:radial-gradient(ellipse at center,rgba(15,39,70,.18) 0 24%,rgba(37,99,235,.1) 38%,transparent 72%);border-radius:999px;bottom:7px;content:"";height:18px;left:23px;position:absolute;width:84px;z-index:0}
    .ai-guide-robot{animation:ai-guide-float 3.4s ease-in-out infinite;height:142px;left:-6px;object-fit:contain;position:absolute;top:1px;width:142px;filter:drop-shadow(0 14px 16px rgba(15,39,70,.18));transform-origin:50% 76%;z-index:1}
    .ai-guide-root.ai-guide-travelling .ai-guide-robot{animation:ai-guide-fly 760ms cubic-bezier(.18,.9,.24,1),ai-guide-float 3.2s ease-in-out infinite 760ms}
    .ai-guide-chat-toggle{align-items:center;background:var(--ai-accent);border:2px solid white;border-radius:999px;bottom:6px;box-shadow:0 12px 26px rgba(37,99,235,.26);color:white;cursor:pointer;display:none;font:900 13px/1 Inter,system-ui,sans-serif;height:34px;justify-content:center;position:absolute;right:0;touch-action:manipulation;transition:box-shadow 150ms ease,transform 150ms ease;width:34px;z-index:5}
    .ai-guide-chat-toggle:hover{box-shadow:0 16px 32px rgba(37,99,235,.32);transform:translateY(-1px)}
    .ai-guide-root.ai-guide-chat-collapsed{width:126px}
    .ai-guide-root.ai-guide-chat-collapsed .ai-guide-card{display:block}
    .ai-guide-root.ai-guide-chat-collapsed .ai-guide-bubble{display:none}
    .ai-guide-root.ai-guide-chat-collapsed .ai-guide-chat-toggle{display:flex}
    .ai-guide-root.ai-guide-docked{width:52px}
    .ai-guide-root.ai-guide-docked .ai-guide-card{display:block}
    .ai-guide-root.ai-guide-docked .ai-guide-bubble,.ai-guide-root.ai-guide-docked .ai-guide-chat-toggle,.ai-guide-root.ai-guide-docked .ai-guide-robot{display:none}
    .ai-guide-root.ai-guide-docked .ai-guide-robot-stage{align-items:center;background:linear-gradient(135deg,var(--ai-accent),#13a89e);border:2px solid rgba(255,255,255,.96);border-radius:999px;box-shadow:0 12px 28px rgba(15,39,70,.22);cursor:pointer;display:flex;height:48px;justify-content:center;overflow:hidden;transition:box-shadow 150ms ease,transform 150ms ease;width:48px}
    .ai-guide-root.ai-guide-docked .ai-guide-robot-stage:before{display:none}
    .ai-guide-root.ai-guide-docked .ai-guide-robot-stage:hover{box-shadow:0 16px 34px rgba(15,39,70,.28);transform:translateY(-1px)}
    .ai-guide-root.ai-guide-docked .ai-guide-robot-stage:focus-visible{outline:3px solid rgba(37,99,235,.28);outline-offset:4px}
    .ai-guide-root.ai-guide-docked .ai-guide-dock-logo{background:linear-gradient(145deg,var(--ai-accent) 0%,#1d8bff 54%,#32d5ff 100%);border-radius:999px;box-shadow:0 7px 16px rgba(7,17,31,.12),inset 0 0 0 1px rgba(255,255,255,.26);display:block;height:30px;overflow:hidden;position:relative;width:30px}
    .ai-guide-root.ai-guide-docked .ai-guide-dock-logo:before{background:#fff;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(21,93,255,.07);content:"";inset:18%;position:absolute}
    .ai-guide-root.ai-guide-docked .ai-guide-dock-logo:after{background:radial-gradient(circle at 32% 50%,#fff 0 8%,transparent 9%),radial-gradient(circle at 68% 50%,#fff 0 8%,transparent 9%),linear-gradient(135deg,#075fff 0%,#0a73ff 100%);border-radius:999px;content:"";height:24%;left:24%;position:absolute;top:39%;width:52%}
    .ai-guide-bubble{animation:ai-guide-bubble-in 300ms ease-out both;background:#fff;border:1px solid var(--ai-line);border-radius:8px;box-shadow:0 26px 70px rgba(15,39,70,.22);display:flex;flex:1 1 auto;flex-direction:column;max-height:min(82vh,650px);min-width:0;overflow:hidden;padding:0;position:relative;width:min(432px,calc(100vw - 154px))}
    .ai-guide-bubble:after{background:inherit;border:inherit;content:"";height:14px;position:absolute;transform:rotate(45deg);width:14px;z-index:-1}
    .ai-guide-root.ai-guide-side-right .ai-guide-bubble:after{left:-7px;top:50%;margin-top:-7px}
    .ai-guide-root.ai-guide-side-left .ai-guide-bubble:after{right:-7px;top:50%;margin-top:-7px}
    .ai-guide-root.ai-guide-side-top .ai-guide-bubble:after{bottom:-7px;left:50%;margin-left:-7px}
    .ai-guide-root.ai-guide-side-bottom .ai-guide-bubble:after{left:50%;margin-left:-7px;top:-7px}
    .ai-guide-bubble.ai-guide-hidden{display:none}
    .ai-guide-row{align-items:center;background:var(--ai-accent);color:white;cursor:move;display:flex;gap:10px;justify-content:space-between;overflow:hidden;padding:11px 12px;position:relative}
    .ai-guide-row:before{display:none}
    .ai-guide-brand{align-items:center;background:#fff;border:1px solid rgba(255,255,255,.72);border-radius:999px;box-shadow:0 10px 22px rgba(7,17,31,.12),inset 0 0 0 1px rgba(7,95,255,.05);display:flex;gap:7px;min-width:0;padding:4px 10px 4px 5px}
    .ai-guide-brand-copy{display:block;min-width:0}
    .ai-guide-window-actions{display:flex;flex:0 0 auto;gap:6px;position:relative;z-index:1}
    .ai-guide-mark{background:linear-gradient(145deg,var(--ai-accent) 0%,#1d8bff 54%,#32d5ff 100%);border-radius:999px;box-shadow:0 8px 18px rgba(7,17,31,.14),inset 0 0 0 1px rgba(255,255,255,.26);flex:0 0 auto;height:22px;overflow:hidden;position:relative;width:22px}
    .ai-guide-mark:before{background:#fff;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(21,93,255,.07);content:"";inset:18%;position:absolute}
    .ai-guide-mark:after{background:radial-gradient(circle at 32% 50%,#fff 0 8%,transparent 9%),radial-gradient(circle at 68% 50%,#fff 0 8%,transparent 9%),linear-gradient(135deg,#075fff 0%,#0a73ff 100%);border-radius:999px;content:"";height:24%;left:24%;position:absolute;top:39%;width:52%}
    .ai-guide-title{align-items:baseline;color:#020b32;display:flex;font-weight:950;font-size:14px;gap:3px;letter-spacing:0;line-height:1;margin:0;white-space:nowrap}
    .ai-guide-title span:last-child{color:#075fff}
    .ai-guide-subtitle{display:none}
    .ai-guide-message{background:#f8fbff;border-bottom:1px solid #edf2f7;color:#3f526a;font-size:13px;font-weight:760;line-height:1.45;margin:0;padding:12px 14px}
    .ai-guide-history{background:linear-gradient(180deg,#f8fbff,#fff 45%,#f8fafc);display:grid;flex:1 1 auto;gap:10px;margin:0;max-height:min(330px,40vh);min-height:178px;overflow:auto;padding:14px;scrollbar-width:thin}
    .ai-guide-history:empty:before{align-self:center;color:#8a9ab1;content:attr(data-empty);font-size:13px;justify-self:center}
    .ai-guide-msg{animation:ai-guide-message-pop 160ms ease-out both;border-radius:8px;font-size:13px;line-height:1.5;max-width:92%;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
    .ai-guide-msg-user{background:#eaf1ff;border:1px solid #cfe0ff;color:#1746c6;justify-self:end}
    .ai-guide-msg-assistant{background:white;border:1px solid #dbe4f0;box-shadow:0 8px 18px rgba(20,40,70,.05);color:var(--ai-ink);justify-self:start}
    .ai-guide-form{align-items:flex-end;background:#fff;border-top:1px solid #edf2f7;display:flex;gap:8px;padding:12px}
    .ai-guide-input{background:#fff;border:1px solid #d7e0ec;border-radius:8px;color:var(--ai-ink);flex:1;font:inherit;font-size:13px;line-height:1.42;max-height:112px;min-height:42px;min-width:0;overflow:auto;padding:10px 11px;resize:none}
    .ai-guide-input:focus{border-color:var(--ai-accent);box-shadow:0 0 0 4px rgba(37,99,235,.12);outline:0}
    .ai-guide-input:disabled{background:#f3f7fc;color:#7b8da6;cursor:not-allowed}
    .ai-guide-button{align-items:center;background:var(--ai-accent);border:0;border-radius:8px;box-shadow:0 10px 22px rgba(37,99,235,.2);color:white;display:inline-flex;font:inherit;font-size:13px;font-weight:900;height:42px;justify-content:center;padding:0 16px;transition:box-shadow 150ms ease,filter 150ms ease,transform 150ms ease}
    .ai-guide-button:not(:disabled):hover{box-shadow:0 14px 28px rgba(37,99,235,.28);filter:saturate(1.08);transform:translateY(-1px)}
    .ai-guide-button:disabled{box-shadow:none;cursor:not-allowed;opacity:.62}
    .ai-guide-icon{align-items:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:7px;color:#fff;display:inline-flex;font:inherit;font-weight:900;height:28px;justify-content:center;line-height:1;padding:0;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease;width:28px}
    .ai-guide-icon:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.34);transform:translateY(-1px)}
    .ai-guide-icon.ai-guide-clear{font-size:12px}
    .ai-guide-icon.ai-guide-minimize,.ai-guide-icon.ai-guide-dock{position:relative}
    .ai-guide-icon-label{clip:rect(0 0 0 0);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}
    .ai-guide-icon.fa-solid,.ai-guide-chat-toggle.fa-solid{font-family:"Font Awesome 7 Free";font-weight:900}
    .ai-guide-icon.fa-solid:before,.ai-guide-chat-toggle.fa-solid:before{content:var(--fa) / "";position:static}
    .ai-guide-icon.fa-solid:after,.ai-guide-chat-toggle.fa-solid:after{content:none;display:none}
    .ai-guide-step-controls{align-items:center;background:#f8fafc;border-top:1px solid #edf2f7;display:flex;gap:7px;justify-content:space-between;margin:0;padding:8px 12px}
    .ai-guide-step-controls[hidden]{display:none}
    .ai-guide-step-status{color:var(--ai-muted);font-size:12px;font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ai-guide-step-actions{display:flex;flex:0 0 auto;gap:6px}
    .ai-guide-step-button{background:white;border:1px solid #cfe0f5;border-radius:7px;color:#1746a2;font:inherit;font-size:12px;font-weight:900;height:28px;padding:0 9px}
    .ai-guide-step-button:disabled{color:#94a3b8;cursor:not-allowed}
    .ai-guide-next{background:#f8fbff;border:1px solid #cfe0f5;border-radius:8px;color:#1746a2;font:inherit;font-size:12px;font-weight:800;height:32px;margin:0 12px 12px;padding:0 10px}
    .ai-guide-target-highlight{outline:3px solid var(--ai-accent)!important;outline-offset:4px!important;box-shadow:0 0 0 8px rgba(37,99,235,.14)!important;border-radius:8px!important}
    .ai-guide-overlay{height:100vh;left:0;pointer-events:none;position:fixed;top:0;width:100vw;z-index:2147482999}
    .ai-guide-pointer-line{background:var(--ai-accent);border-radius:999px;height:3px;left:0;opacity:.86;position:absolute;top:0;transform-origin:left center;width:0}
    .ai-guide-pointer-line:after{border-bottom:5px solid transparent;border-left:9px solid var(--ai-accent);border-top:5px solid transparent;content:"";position:absolute;right:-8px;top:-3.5px}
    .ai-guide-edit-hover{outline:3px solid #14b8a6!important;outline-offset:3px!important;cursor:crosshair!important}
    .ai-guide-edit-banner{background:#072342;border-radius:8px;box-shadow:0 16px 36px rgba(7,35,66,.2);color:white;font:700 14px Inter,system-ui,sans-serif;left:50%;padding:12px 16px;position:fixed;top:14px;transform:translateX(-50%);z-index:2147483001}
    @keyframes ai-guide-root-enter{from{opacity:0}to{opacity:1}}
    @keyframes ai-guide-bubble-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes ai-guide-message-pop{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ai-guide-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-8px) rotate(1.4deg)}}
    @keyframes ai-guide-fly{0%{transform:translateY(0) rotate(-8deg) scale(.98)}45%{transform:translateY(-18px) rotate(8deg) scale(1.04)}100%{transform:translateY(0) rotate(0) scale(1)}}
    @keyframes ai-guide-peek{0%,100%{transform:translateX(0) translateY(0)}50%{transform:translateX(-8px) translateY(-2px)}}
    @media (max-width:760px){.ai-guide-root{width:min(476px,calc(100vw - 18px))}.ai-guide-card{gap:8px}.ai-guide-robot-stage{height:122px;width:106px}.ai-guide-robot-stage:before{bottom:6px;height:15px;left:19px;width:68px}.ai-guide-robot{height:116px;width:116px}.ai-guide-bubble{width:min(360px,calc(100vw - 130px))}.ai-guide-history{max-height:min(260px,32vh);min-height:138px}.ai-guide-message{font-size:13px}.ai-guide-row{padding:10px}.ai-guide-form{padding:10px}.ai-guide-button{padding:0 13px}}
    @media (max-width:640px){.ai-guide-root.ai-guide-docked{width:52px}.ai-guide-root.ai-guide-chat-collapsed{width:118px}}
    @media (max-width:430px){.ai-guide-card{align-items:flex-start;flex-direction:column!important}.ai-guide-root{width:calc(100vw - 18px)}.ai-guide-bubble{width:100%}.ai-guide-bubble:after{display:none}.ai-guide-robot-stage{height:96px;width:92px}.ai-guide-robot-stage:before{bottom:3px;height:13px;left:17px;width:58px}.ai-guide-robot{height:102px;width:102px}.ai-guide-row{padding:10px}.ai-guide-history{min-height:128px}}
  `;
  document.head.appendChild(style);
}

function createRoot() {
  const root = document.createElement("div");
  const strings = uiText[uiLocale()];
  root.className = "ai-guide-root ai-guide-side-right";
  root.innerHTML = `
    <div class="ai-guide-card">
      <div class="ai-guide-robot-stage">
        <span class="ai-guide-dock-logo" aria-hidden="true"></span>
        <img class="ai-guide-robot" alt="AI guide robot" draggable="false" />
        <button class="ai-guide-chat-toggle fa-solid fa-comment-dots" type="button" data-action="toggle-chat" aria-label="${escapeAttribute(strings.openChat)}"><span class="ai-guide-icon-label">${escapeHtml(strings.openChat)}</span></button>
      </div>
      <section class="ai-guide-bubble">
        <div class="ai-guide-row">
          <div class="ai-guide-brand" aria-label="${widgetName}"><span class="ai-guide-mark"></span><div class="ai-guide-brand-copy"><p class="ai-guide-title"><span>Smartup</span><span>Guide</span></p></div></div>
          <div class="ai-guide-window-actions">
            <button class="ai-guide-icon ai-guide-clear fa-solid fa-trash-can" type="button" data-action="clear-chat" aria-label="${escapeAttribute(strings.clear)}"><span class="ai-guide-icon-label">${escapeHtml(strings.clear)}</span></button>
            <button class="ai-guide-icon ai-guide-minimize fa-solid fa-minus" type="button" data-action="minimize" aria-label="${escapeAttribute(strings.hideChat)}"><span class="ai-guide-icon-label">${escapeHtml(strings.hideChat)}</span></button>
            <button class="ai-guide-icon ai-guide-dock fa-solid fa-down-left-and-up-right-to-center" type="button" data-action="dock" aria-label="${escapeAttribute(strings.dockRobot)}"><span class="ai-guide-icon-label">${escapeHtml(strings.dockRobot)}</span></button>
          </div>
        </div>
        <p class="ai-guide-message">${strings.initialMessage}</p>
        <div class="ai-guide-history" aria-live="polite"></div>
        <div class="ai-guide-step-controls" hidden>
          <span class="ai-guide-step-status"></span>
          <div class="ai-guide-step-actions">
            <button class="ai-guide-step-button" type="button" data-action="prev-step">${strings.back}</button>
            <button class="ai-guide-step-button" type="button" data-action="complete-step">${strings.done}</button>
            <button class="ai-guide-step-button" type="button" data-action="stop-guide">${strings.stop}</button>
          </div>
        </div>
        <form class="ai-guide-form">
          <textarea class="ai-guide-input" placeholder="${escapeAttribute(strings.inputPlaceholder)}" rows="1"></textarea>
          <button class="ai-guide-button" type="submit">${strings.send}</button>
        </form>
        <button class="ai-guide-next" type="button" data-action="next" hidden>${strings.next}</button>
      </section>
    </div>
  `;
  root.querySelector(".ai-guide-history")?.setAttribute("data-empty", strings.emptyHistory);
  document.body.appendChild(root);
  return root;
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "ai-guide-overlay";
  overlay.innerHTML = '<span class="ai-guide-pointer-line"></span>';
  document.body.appendChild(overlay);
  return overlay;
}

let root!: HTMLDivElement;
let robotStage!: HTMLElement;
let robot!: HTMLImageElement;
let bubble!: HTMLElement;
let message!: HTMLElement;
let historyList!: HTMLElement;
let form!: HTMLFormElement;
let input!: HTMLTextAreaElement;
let sendButton!: HTMLButtonElement;
let nextButton!: HTMLButtonElement;
let minimizeButton!: HTMLButtonElement;
let dockButton!: HTMLButtonElement;
let clearButton!: HTMLButtonElement;
let chatToggle!: HTMLButtonElement;
let stepControls!: HTMLElement;
let stepStatus!: HTMLElement;
let prevStepButton!: HTMLButtonElement;
let completeStepButton!: HTMLButtonElement;
let stopGuideButton!: HTMLButtonElement;
let overlay: HTMLDivElement | null = null;

function mountRoot() {
  root = createRoot();
  robotStage = root.querySelector<HTMLElement>(".ai-guide-robot-stage")!;
  robot = root.querySelector<HTMLImageElement>(".ai-guide-robot")!;
  bubble = root.querySelector<HTMLElement>(".ai-guide-bubble")!;
  message = root.querySelector<HTMLElement>(".ai-guide-message")!;
  historyList = root.querySelector<HTMLElement>(".ai-guide-history")!;
  form = root.querySelector<HTMLFormElement>(".ai-guide-form")!;
  input = root.querySelector<HTMLTextAreaElement>(".ai-guide-input")!;
  sendButton = root.querySelector<HTMLButtonElement>(".ai-guide-button")!;
  nextButton = root.querySelector<HTMLButtonElement>("[data-action='next']")!;
  minimizeButton = root.querySelector<HTMLButtonElement>("[data-action='minimize']")!;
  dockButton = root.querySelector<HTMLButtonElement>("[data-action='dock']")!;
  clearButton = root.querySelector<HTMLButtonElement>("[data-action='clear-chat']")!;
  chatToggle = root.querySelector<HTMLButtonElement>("[data-action='toggle-chat']")!;
  stepControls = root.querySelector<HTMLElement>(".ai-guide-step-controls")!;
  stepStatus = root.querySelector<HTMLElement>(".ai-guide-step-status")!;
  prevStepButton = root.querySelector<HTMLButtonElement>("[data-action='prev-step']")!;
  completeStepButton = root.querySelector<HTMLButtonElement>("[data-action='complete-step']")!;
  stopGuideButton = root.querySelector<HTMLButtonElement>("[data-action='stop-guide']")!;
}

function waitForBody() {
  if (document.body) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function setRobotState(state: RobotState) {
  root.dataset.state = state;
  const configuredBase = config?.theme.robotBaseUrl ?? "/robot";
  const base = configuredBase.startsWith("http")
    ? configuredBase
    : `${apiBase}${configuredBase}`;
  robot.src = `${base}/${state}.png`;
  robot.onerror = () => {
    robot.onerror = null;
    robot.src = `${apiBase}/robot/idle.png`;
  };
}

function directionalPointingState(
  target: HTMLElement,
  requestedState: RobotState,
  placement?: ResolvedPlacement
) {
  if (requestedState !== "pointing") {
    return requestedState;
  }

  if (placement === "right") {
    return "pointing-right";
  }

  if (placement === "left") {
    return "pointing-left";
  }

  const targetRect = target.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const targetCenter = targetRect.left + targetRect.width / 2;
  const rootCenter = rootRect.left + rootRect.width / 2;

  return targetCenter < rootCenter ? "pointing-left" : "pointing-right";
}

function renderPosition() {
  root.classList.toggle("ai-guide-docked", docked);
  if (docked) {
    robotStage.setAttribute("role", "button");
    robotStage.setAttribute("aria-label", t("openChat"));
    robotStage.setAttribute("tabindex", "0");
  } else {
    robotStage.removeAttribute("role");
    robotStage.removeAttribute("aria-label");
    robotStage.removeAttribute("tabindex");
  }

  if (docked) {
    const dockMargin = window.innerWidth <= 640 ? 12 : 16;
    const dockWidth = root.offsetWidth || 52;
    const dockHeight = root.offsetHeight || 48;
    const x = Math.max(dockMargin, window.innerWidth - dockWidth - dockMargin);
    const y = Math.max(dockMargin, window.innerHeight - dockHeight - dockMargin);
    root.style.setProperty("--ai-x", `${x}px`);
    root.style.setProperty("--ai-y", `${y}px`);
    if (overlay) {
      overlay.style.display = "none";
    }
    activeTarget?.classList.remove("ai-guide-target-highlight");
    return;
  }

  widgetPosition.x = clamp(widgetPosition.x, 12, Math.max(12, window.innerWidth - root.offsetWidth - 12));
  widgetPosition.y = clamp(widgetPosition.y, 12, Math.max(12, window.innerHeight - root.offsetHeight - 12));
  root.style.setProperty("--ai-x", `${widgetPosition.x}px`);
  root.style.setProperty("--ai-y", `${widgetPosition.y}px`);
  if (overlay) {
    overlay.style.display = "";
  }
  activeTarget?.classList.add("ai-guide-target-highlight");
  updatePointer();
}

function setDocked(nextDocked: boolean) {
  if (docked === nextDocked) {
    return;
  }

  if (nextDocked) {
    savePosition();
  }

  docked = nextDocked;
  saveDocked();
  renderPosition();
}

function animateTravel() {
  root.classList.add("ai-guide-travelling");
  if (travellingTimer) {
    window.clearTimeout(travellingTimer);
  }

  const started = performance.now();
  const tick = () => {
    updatePointer();
    if (performance.now() - started < 820) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  travellingTimer = window.setTimeout(() => root.classList.remove("ai-guide-travelling"), 820);
}

function setMessage(text: string, state: RobotState = "talking") {
  message.textContent = text;
  setRobotState(state);
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char] ?? char;
  });
}

function renderHistory() {
  historyList.innerHTML = chatHistory
    .map(
      (item) =>
        `<div class="ai-guide-msg ai-guide-msg-${item.role}">${escapeHtml(item.text)}</div>`
    )
    .join("");
  historyList.setAttribute("aria-busy", isThinking ? "true" : "false");
  historyList.scrollTop = historyList.scrollHeight;
  renderChatToggle();
}

function renderChatToggle() {
  chatToggle.innerHTML = `<span class="ai-guide-icon-label">${escapeHtml(t("openChat"))}</span>`;
  chatToggle.setAttribute("aria-label", t("openChat"));
  chatToggle.title = t("openChat");
}

function renderSendButton() {
  const label = isThinking ? t("stop") : t("send");
  sendButton.classList.toggle("ai-guide-stop", isThinking);
  sendButton.textContent = label;
  sendButton.setAttribute("aria-label", label);
  sendButton.title = label;
}

function appendHistory(role: ChatMessage["role"], text: string) {
  chatHistory = [...chatHistory, { role, text, createdAt: Date.now() }].slice(-30);
  saveHistory();
  renderHistory();
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
}

function setThinkingLock(locked: boolean) {
  isThinking = locked;
  root.classList.toggle("ai-guide-thinking", locked);
  bubble.setAttribute("aria-busy", locked ? "true" : "false");
  input.disabled = locked;
  sendButton.disabled = false;
  input.placeholder = locked ? t("loading") : t("inputPlaceholder");
  renderSendButton();
  renderHistory();
}

function beginRequest() {
  const request = { id: ++requestSequence, controller: new AbortController() };
  activeRequest = request;
  return request;
}

function isCurrentRequest(request: { id: number; controller: AbortController }) {
  return activeRequest?.id === request.id && !request.controller.signal.aborted;
}

function finishRequest(request: { id: number; controller: AbortController }) {
  if (activeRequest?.id !== request.id) {
    return;
  }

  activeRequest = null;
  setThinkingLock(false);
}

function cancelThinking(showMessage: boolean) {
  if (activeRequest) {
    activeRequest.controller.abort();
    activeRequest = null;
  }

  setThinkingLock(false);

  if (showMessage) {
    clearTarget();
    activeGuide = null;
    activeQuestion = "";
    activeStepIndex = 0;
    completedSteps = [];
    renderStepControls();
    const stoppedMessage = t("requestStopped");
    setMessage(stoppedMessage, "idle");
    appendHistory("assistant", stoppedMessage);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function parseAskResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        type: "guide" | "answer" | "fallback";
        message: string;
        guide?: GuideRule;
      }
    | null;

  if (!response.ok || !payload || typeof payload.message !== "string") {
    throw new Error("Invalid assistant response");
  }

  return payload;
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    let timer = 0;
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function submitQuestion() {
  if (isThinking) {
    cancelThinking(true);
    return;
  }

  const question = input.value.trim();
  if (!question) {
    return;
  }

  input.value = "";
  resizeInput();
  void ask(question);
}

function renderStepControls() {
  const step = activeGuide?.steps[activeStepIndex];
  if (!activeGuide || !step) {
    stepControls.hidden = true;
    return;
  }

  const total = activeGuide.slug === "ai-runtime-guide" ? completedSteps.length + 1 : activeGuide.steps.length;
  const current = activeGuide.slug === "ai-runtime-guide" ? completedSteps.length + 1 : activeStepIndex + 1;
  stepStatus.textContent = `${t("step")} ${current}${total > 1 ? ` / ${total}` : ""}: ${step.waitFor}`;
  prevStepButton.disabled = activeGuide.slug === "ai-runtime-guide" || activeStepIndex <= 0;
  completeStepButton.textContent = step.waitFor === "manual" ? t("next") : t("done");
  stepControls.hidden = false;
}

function clearStepTimers() {
  for (const timer of stepTimers) {
    window.clearTimeout(timer);
  }
  stepTimers = [];
}

function scheduleStepTimer(callback: () => void, delay: number, token = stepRunToken) {
  const timer = window.setTimeout(() => {
    stepTimers = stepTimers.filter((item) => item !== timer);
    if (token === stepRunToken) {
      callback();
    }
  }, delay);
  stepTimers.push(timer);
  return timer;
}

function clearTarget() {
  stepRunToken += 1;
  clearStepTimers();
  activeStepCleanup?.();
  activeStepCleanup = null;
  activeTarget?.classList.remove("ai-guide-target-highlight");
  activeTarget = null;
  nextButton.hidden = true;
  stepControls.hidden = true;
  overlay?.remove();
  overlay = null;
}

function updatePointer() {
  if (docked || !activeTarget || !overlay) {
    return;
  }

  const line = overlay.querySelector<HTMLElement>(".ai-guide-pointer-line");
  if (!line) {
    return;
  }

  const targetRect = activeTarget.getBoundingClientRect();
  const robotRect = robot.getBoundingClientRect();
  const startX = robotRect.left + robotRect.width * 0.78;
  const startY = robotRect.top + robotRect.height * 0.42;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const distance = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  line.style.left = `${startX}px`;
  line.style.top = `${startY}px`;
  line.style.width = `${distance}px`;
  line.style.transform = `rotate(${angle}deg)`;
}

function applyPlacementClass(placement: ResolvedPlacement) {
  root.classList.toggle("ai-guide-side-left", placement === "left");
  root.classList.toggle("ai-guide-side-right", placement === "right");
  root.classList.toggle("ai-guide-side-top", placement === "top");
  root.classList.toggle("ai-guide-side-bottom", placement === "bottom");
}

function resolveAutoPlacement(rect: DOMRect, width: number, height: number, margin: number): ResolvedPlacement {
  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft = rect.left;
  const spaceBottom = window.innerHeight - rect.bottom;
  const spaceTop = rect.top;

  if (spaceRight >= width + margin) {
    return "right";
  }

  if (spaceLeft >= width + margin) {
    return "left";
  }

  if (spaceBottom >= height + margin || spaceBottom >= spaceTop) {
    return "bottom";
  }

  return "top";
}

function moveNearTarget(target: HTMLElement, placement: GuideStep["placement"]) {
  if (docked) {
    setDocked(false);
  }

  const rect = target.getBoundingClientRect();
  const width = root.offsetWidth || 330;
  const height = root.offsetHeight || 180;
  const margin = window.innerWidth <= 640 ? 8 : 10;
  const chosen = placement === "auto" ? resolveAutoPlacement(rect, width, height, margin) : placement;
  applyPlacementClass(chosen);

  if (chosen === "right") {
    widgetPosition = { x: rect.right + margin, y: rect.top + rect.height / 2 - height / 2 };
  } else if (chosen === "left") {
    widgetPosition = { x: rect.left - width - margin, y: rect.top + rect.height / 2 - height / 2 };
  } else if (chosen === "top") {
    widgetPosition = { x: rect.left + rect.width / 2 - width / 2, y: rect.top - height - margin };
  } else {
    widgetPosition = { x: rect.left + rect.width / 2 - width / 2, y: rect.bottom + margin };
  }

  renderPosition();
  animateTravel();
  savePosition();
  return chosen;
}

function bindStepWaiter(step: GuideStep) {
  if (!activeTarget) {
    return;
  }

  if (step.waitFor === "manual") {
    renderStepControls();
    return;
  }

  if (step.waitFor === "visible") {
    scheduleStepTimer(completeCurrentStep, 1200);
    return;
  }

  const eventName = step.waitFor === "focus" ? "focusin" : "click";
  const token = stepRunToken;
  const handler = () => scheduleStepTimer(completeCurrentStep, 650, token);
  activeTarget.addEventListener(eventName, handler, { once: true });
  activeStepCleanup = () => activeTarget?.removeEventListener(eventName, handler);
}

function runtimeGuideStep(guide: GuideRule, excludeCompleted: boolean) {
  if (guide.slug !== "ai-runtime-guide") {
    return guide;
  }

  const completedTargets = new Set(completedSteps.map((step) => step.target));
  const seenTargets = new Set<string>();
  const nextStep = guide.steps.find((step) => {
    if (excludeCompleted && completedTargets.has(step.target)) {
      return false;
    }

    if (seenTargets.has(step.target)) {
      return false;
    }

    seenTargets.add(step.target);
    return true;
  });

  return nextStep ? { ...guide, steps: [nextStep] } : null;
}

function showStep(guide: GuideRule, index: number, attempt = 0) {
  clearTarget();
  const token = stepRunToken;
  activeGuide = guide;
  activeStepIndex = index;
  const step = guide.steps[index];
  renderStepControls();

  if (!step) {
    const doneMessage = t("guideDone");
    setMessage(doneMessage, "success");
    appendHistory("assistant", doneMessage);
    void track("guide_completed", guide.slug, index - 1);
    return;
  }

  const target = resolveTarget(step.target);

  if (!target) {
    if (attempt < 12) {
      scheduleStepTimer(() => showStep(guide, index, attempt + 1), 160, token);
      return;
    }

    const errorMessage = `${t("targetMissing")} ${step.target}`;
    setMessage(errorMessage, "error");
    appendHistory("assistant", errorMessage);
    void track("target_missing", guide.slug, index, { target: step.target });
    return;
  }

  activeTarget = target;
  activeTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  scheduleStepTimer(() => {
    if (activeGuide !== guide || activeStepIndex !== index) {
      return;
    }

    activeTarget?.classList.add("ai-guide-target-highlight");
    if (!overlay) {
      overlay = createOverlay();
    }
    const chosenPlacement = moveNearTarget(target, step.placement);
    setMessage(step.message, directionalPointingState(target, step.robotState, chosenPlacement));
    appendHistory("assistant", step.message);
    renderStepControls();
    updatePointer();
    bindStepWaiter(step);
    void track("step_started", guide.slug, index, { target: step.target });
  }, 320, token);
}

function nextStep() {
  if (!activeGuide) {
    return;
  }

  showStep(activeGuide, activeStepIndex + 1);
}

function previousStep() {
  if (!activeGuide || activeGuide.slug === "ai-runtime-guide" || activeStepIndex <= 0) {
    return;
  }

  showStep(activeGuide, activeStepIndex - 1);
}

function stopGuide() {
  const stoppedMessage = t("guideStopped");
  cancelThinking(false);
  clearTarget();
  activeGuide = null;
  activeQuestion = "";
  completedSteps = [];
  setMessage(stoppedMessage, "idle");
  appendHistory("assistant", stoppedMessage);
}

function completeCurrentStep() {
  if (!activeGuide) {
    return;
  }

  const currentStep = activeGuide.steps[activeStepIndex];
  if (currentStep) {
    completedSteps = [...completedSteps, currentStep].slice(-20);
  }

  if (activeGuide.slug === "ai-runtime-guide") {
    void askNextStep();
    return;
  }

  nextStep();
}

async function askNextStep() {
  if (!config || !activeQuestion) {
    nextStep();
    return;
  }

  clearTarget();
  const request = beginRequest();
  setThinkingLock(true);
  setMessage(t("nextLoading"), "thinking");
  try {
    await wait(420, request.controller.signal);

    const response = await fetch(`${apiBase}/api/ai/ask`, {
      method: "POST",
      signal: request.controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: config.projectId,
        question: activeQuestion,
        mode: "next",
        path: window.location.pathname,
        completedSteps,
        metadata: collectSafeMetadata(activeQuestion),
        pageLanguage: pageLanguage()
      })
    });

    const payload = await parseAskResponse(response);
    if (!isCurrentRequest(request)) {
      return;
    }

    if (payload.type === "guide" && payload.guide?.steps.length) {
      const guide = runtimeGuideStep(payload.guide, true);
      if (guide) {
        showStep(guide, 0);
        return;
      }

      setMessage(t("guideDone"), "success");
      appendHistory("assistant", t("guideDone"));
    } else if (payload.type === "answer") {
      setMessage(payload.message, "talking");
      appendHistory("assistant", payload.message);
    } else {
      setMessage(payload.message, "success");
      appendHistory("assistant", payload.message);
    }
  } catch (error) {
    if (isAbortError(error) || !isCurrentRequest(request)) {
      return;
    }

    const errorMessage = t("requestFailed");
    setMessage(errorMessage, "error");
    appendHistory("assistant", errorMessage);
  } finally {
    finishRequest(request);
  }
}

async function ask(question: string) {
  if (!config) {
    return;
  }

  clearTarget();
  activeQuestion = question;
  completedSteps = [];
  appendHistory("user", question);
  const request = beginRequest();
  setThinkingLock(true);
  setMessage(t("loading"), "thinking");

  try {
    const response = await fetch(`${apiBase}/api/ai/ask`, {
      method: "POST",
      signal: request.controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: config.projectId,
        question,
        mode: "start",
        completedSteps,
        path: window.location.pathname,
        metadata: collectSafeMetadata(question),
        pageLanguage: pageLanguage()
      })
    });

    const payload = await parseAskResponse(response);
    if (!isCurrentRequest(request)) {
      return;
    }

    if (payload.type === "guide" && payload.guide) {
      const guide = runtimeGuideStep(payload.guide, false);
      if (guide) {
        showStep(guide, 0);
        return;
      }

      setMessage(payload.message, "talking");
      appendHistory("assistant", payload.message);
    } else if (payload.type === "answer") {
      setMessage(payload.message, "talking");
      appendHistory("assistant", payload.message);
    } else {
      setMessage(payload.message, "talking");
      appendHistory("assistant", payload.message);
    }
  } catch (error) {
    if (isAbortError(error) || !isCurrentRequest(request)) {
      return;
    }

    const errorMessage = t("requestFailed");
    setMessage(errorMessage, "error");
    appendHistory("assistant", errorMessage);
  } finally {
    finishRequest(request);
  }
}

async function track(type: string, guideSlug?: string, stepIndex?: number, metadata?: Record<string, unknown>) {
  if (!config) {
    return;
  }

  try {
    await fetch(`${apiBase}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: config.projectId,
        type,
        guideSlug,
        stepIndex,
        path: window.location.pathname,
        metadata
      })
    });
  } catch {
    // Analytics should never block the guide.
  }
}

function setupDragging() {
  const startDrag = (event: PointerEvent, handle: HTMLElement) => {
    if (docked) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select, a")) {
      return;
    }

    event.preventDefault();
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      baseX: widgetPosition.x,
      baseY: widgetPosition.y
    };
    root.classList.add("ai-guide-dragging");
    handle.setPointerCapture?.(event.pointerId);
  };

  robotStage.addEventListener("pointerdown", (event) => startDrag(event, robotStage));
  robotStage.addEventListener("click", (event) => {
    if (!docked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDocked(false);
  });
  robotStage.addEventListener("keydown", (event) => {
    if (!docked || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDocked(false);
  });
  bubble.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(".ai-guide-history, .ai-guide-msg, .ai-guide-form, button, input, textarea, select, a")
    ) {
      return;
    }
    startDrag(event, bubble);
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragStart) {
      return;
    }

    widgetPosition = {
      x: dragStart.baseX + event.clientX - dragStart.x,
      y: dragStart.baseY + event.clientY - dragStart.y
    };
    renderPosition();
  });

  window.addEventListener("pointerup", () => {
    if (!dragStart) {
      return;
    }

    dragStart = null;
    root.classList.remove("ai-guide-dragging");
    savePosition();
  });
}

function setupEditMode() {
  const banner = document.createElement("div");
  banner.className = "ai-guide-edit-banner";
  banner.textContent = "Guide edit mode: click any element to capture its selector";
  document.body.appendChild(banner);

  let hovered: HTMLElement | null = null;

  document.addEventListener(
    "mouseover",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || root.contains(target) || banner.contains(target)) {
        return;
      }

      hovered?.classList.remove("ai-guide-edit-hover");
      hovered = target;
      hovered.classList.add("ai-guide-edit-hover");
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || root.contains(target) || banner.contains(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const selector = stableSelector(target);
      window.opener?.postMessage(
        {
          type: "AI_GUIDE_SELECTOR_PICKED",
          selector,
          text: target.innerText?.trim() || target.getAttribute("aria-label") || target.getAttribute("placeholder")
        },
        window.location.origin
      );
      setMessage(`Captured selector: ${selector}`, "success");
    },
    true
  );
}

async function init() {
  await waitForBody();
  ensureFontAwesome();
  mountRoot();

  const response = await fetch(`${apiBase}/api/widget/config?projectId=${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    setMessage(t("configMissing"), "error");
    renderPosition();
    return;
  }

  config = (await response.json()) as WidgetConfig;
  injectStyles(config.theme.accent);
  setRobotState("idle");
  renderHistory();
  renderPosition();
  setupDragging();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion();
  });

  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  });

  nextButton.addEventListener("click", completeCurrentStep);
  prevStepButton.addEventListener("click", previousStep);
  completeStepButton.addEventListener("click", completeCurrentStep);
  stopGuideButton.addEventListener("click", stopGuide);

  const setChatCollapsed = (collapsed: boolean) => {
    minimized = collapsed;
    root.classList.toggle("ai-guide-chat-collapsed", minimized);
    minimizeButton.innerHTML = `<span class="ai-guide-icon-label">${escapeHtml(t("hideChat"))}</span>`;
    renderChatToggle();
    window.requestAnimationFrame(renderPosition);
  };

  minimizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setChatCollapsed(true);
  });
  dockButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDocked(true);
  });
  sendButton.addEventListener("click", (event) => {
    if (!isThinking) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelThinking(true);
  });
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelThinking(false);
    clearTarget();
    activeGuide = null;
    activeQuestion = "";
    activeStepIndex = 0;
    completedSteps = [];
    input.value = "";
    resizeInput();
    chatHistory = [];
    saveHistory();
    renderHistory();
    renderStepControls();
    setMessage(t("initialMessage"), "idle");
  });
  chatToggle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  chatToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setChatCollapsed(false);
  });

  window.addEventListener("resize", renderPosition);
  window.addEventListener("scroll", updatePointer, { passive: true });

  if (editMode) {
    setupEditMode();
  }
}

void init();
