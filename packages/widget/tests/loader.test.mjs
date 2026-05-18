import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.resolve(__dirname, "../../../apps/admin/public/widget/loader.js");
const adminDashboardPath = path.resolve(__dirname, "../../../apps/admin/app/admin-dashboard.tsx");
const readmePath = path.resolve(__dirname, "../../../README.md");
const landingPagePath = path.resolve(__dirname, "../../../apps/admin/app/page.tsx");

const loader = await readFile(loaderPath, "utf8");
const adminDashboard = await readFile(adminDashboardPath, "utf8");
const readme = await readFile(readmePath, "utf8");
const landingPage = await readFile(landingPagePath, "utf8");

assert.match(loader, /ai-guide-target-highlight/);
assert.match(loader, /AI_GUIDE_SELECTOR_PICKED/);
assert.match(loader, /collectSafeMetadata/);
assert.match(loader, /password/);
assert.match(loader, /ai-guide-chat-collapsed/);
assert.match(loader, /closest\("button, input, textarea, select, a"\)/);
assert.match(loader, /ai-guide-step-controls/);
assert.match(loader, /th, td, tr/);
assert.match(loader, /redacted-email/);
assert.match(loader, /ai-guide-root, \.ai-guide-edit-banner/);
assert.match(loader, /activeGuide = null/);
assert.match(loader, /activeQuestion = ""/);
assert.match(loader, /isThinking/);
assert.match(loader, /AbortController/);
assert.match(loader, /controller\.abort/);
assert.match(loader, /sendButton\.disabled = false/);
assert.match(loader, /ai-guide-stop/);
assert.match(loader, /ai-guide-minimize/);
assert.match(loader, /ai-guide-dock/);
assert.match(loader, /ai-guide-dock-logo/);
assert.match(loader, /fontawesome\/css\/all\.min\.css/);
assert.match(loader, /fa-comment-dots/);
assert.match(loader, /fa-trash-can/);
assert.match(loader, /fa-minus/);
assert.match(loader, /fa-down-left-and-up-right-to-center/);
assert.match(loader, /linear-gradient\(145deg,var\(--ai-accent\) 0%,#1d8bff 54%,#32d5ff 100%\)/);
assert.match(loader, /radial-gradient\(circle at 32% 50%,#fff 0 8%,transparent 9%\)/);
assert.match(loader, /Smartup<\/span><span>Guide/);
assert.match(loader, /radial-gradient\(ellipse at center,rgba\(15,39,70,\.18\)/);
assert.match(loader, /window\.innerHeight - dockHeight - dockMargin/);
assert.match(loader, /robot\.src = `\$\{base\}\/\$\{state\}\.png`/);
assert.doesNotMatch(loader, /ai-guide-glow/);
assert.doesNotMatch(loader, /data:image\/svg\+xml/);

assert.match(adminDashboard, /const projectId = project\?\.publicId \?\? ""/);
assert.match(adminDashboard, /data-project-id="\$\{projectId\}"/);
assert.match(adminDashboard, /disabled=\{!snippet\}/);
assert.doesNotMatch(adminDashboard, /data-project-id="\$\{project\?\.publicId \?\? "demo-project"\}"/);
assert.match(readme, /data-project-id="YOUR_PROJECT_ID"/);
assert.match(landingPage, /data-project-id="YOUR_PROJECT_ID"/);

console.log("platform regression checks passed");
