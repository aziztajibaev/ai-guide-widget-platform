# Embeddable AI Guide Widget

Embeddable robot guide widget platform with a configuration/admin site, provider-backed AI planning, safe DOM metadata collection, and a demo target page.

## Quick Start

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run build:widget
npm run dev
```

Open:

- Admin: `http://localhost:3000`
- Demo target page: `http://localhost:3000/demo`
- Widget script: `http://localhost:3000/widget/loader.js`

Admin access is protected by a signed HTTP-only session cookie. Configure these values before showing the project:

```env
ADMIN_EMAIL="admin@your-company.com"
ADMIN_PASSWORD="use-a-strong-password"
ADMIN_SESSION_SECRET="use-a-long-random-secret"
```

For local development only, the app falls back to `admin@smartup.local` / `smartup-admin` if credentials are not configured.
In production, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and one session secret (`ADMIN_SESSION_SECRET`, `AUTH_SECRET`, or `NEXTAUTH_SECRET`) must be configured; the local fallback is disabled.

Embed example. Use the project ID generated in the admin workspace for that user/project:

```html
<script src="https://your-domain.com/widget/loader.js" data-project-id="YOUR_PROJECT_ID"></script>
```

For local testing the admin page generates the same project-specific snippet with your local host:

```html
<script src="http://localhost:3000/widget/loader.js" data-project-id="YOUR_PROJECT_ID"></script>
```

`demo-project` is reserved for the built-in demo page and seed data.

## AI

Robot image states load from `apps/admin/public/robot/*.png` by default, so you can replace those PNG files with your own robot artwork.

Set `AI_PROVIDER` to `auto`, `openai`, `gemini`, `anthropic`, `claude`, or `rules`.
Use `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY` for live model-backed guide planning.
Without a configured key, the backend uses deterministic fallback rules and marks API responses with `source: "rules-fallback"`.

The AI receives only sanitized page metadata plus enabled knowledge documents from the admin site. Documents are site manuals for terminology, page behavior, and workflow rules. The AI does not receive input values, password fields, token fields, or the full DOM. It generates the next visual step from the current screen and completed steps; the widget never clicks or fills fields for the user.

## Sandbox Preview Server

If `next dev` is blocked by process restrictions, use the dependency-light preview server:

```bash
npm run preview
```
