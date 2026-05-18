"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicGuideRule, PublicKnowledgeDocument, PublicWidgetConfig } from "@/lib/guide-types";

type AdminProjectPayload = {
  publicId: string;
  name: string;
  domain: string | null;
  theme: PublicWidgetConfig["theme"];
  guides: PublicGuideRule[];
  documents: PublicKnowledgeDocument[];
  events: Array<{
    id: string;
    type: string;
    guideSlug: string | null;
    stepIndex: number | null;
    path: string | null;
    createdAt: string;
  }>;
};

type AiProviderPayload = {
  requested: string;
  active: string;
  activeProvider: string | null;
  configured: boolean;
  model: string;
  lastError: string | null;
  providers: AiProviderConnection[];
};

type AiProviderConnection = {
  provider: string;
  name: string;
  shortName: string;
  description: string;
  defaultModel: string;
  model: string;
  enabled: boolean;
  hasToken: boolean;
  keyHint: string | null;
  active: boolean;
  baseUrl: string;
  protocol: string;
};

type AiProviderDraft = {
  apiKey: string;
  model: string;
  enabled: boolean;
};

type ProjectDraft = {
  name: string;
  domain: string;
  accent: string;
  logoText: string;
};

type AdminView = "overview" | "providers" | "knowledge" | "widget" | "settings" | "events";

const adminViews: Array<{ id: AdminView; label: string; hint: string; icon: string }> = [
  { id: "overview", label: "Overview", hint: "Health and next actions", icon: "fa-chart-simple" },
  { id: "providers", label: "AI providers", hint: "Models and tokens", icon: "fa-brain" },
  { id: "knowledge", label: "Knowledge", hint: "Source documents", icon: "fa-book-open" },
  { id: "widget", label: "Widget install", hint: "Embed and test", icon: "fa-code" },
  { id: "settings", label: "Settings", hint: "Identity and guardrails", icon: "fa-sliders" },
  { id: "events", label: "Events", hint: "Runtime activity", icon: "fa-clock-rotate-left" }
];

const adminViewMeta: Record<AdminView, { title: string; description: string }> = {
  overview: {
    title: "Workspace overview",
    description: "A clean command center for project health, knowledge coverage, AI status, and the next admin task."
  },
  providers: {
    title: "AI provider connections",
    description: "Connect a token for any supported provider, tune the model, and choose the active runtime."
  },
  knowledge: {
    title: "Knowledge base",
    description: "Edit the documents the assistant uses as its source of truth."
  },
  widget: {
    title: "Widget install",
    description: "Copy the embed snippet, test the widget, and confirm the active runtime before rollout."
  },
  settings: {
    title: "Project settings",
    description: "Keep workspace identity, domain access, accent color, and logo text consistent."
  },
  events: {
    title: "Recent events",
    description: "Review the latest widget activity and runtime guide events."
  }
};

const emptyDocument: PublicKnowledgeDocument = {
  id: "",
  title: "New knowledge document",
  content: "",
  tags: ["smartup"],
  enabled: true
};

function providerLabel(provider: AiProviderPayload | null) {
  if (!provider) return "Checking";
  if (!provider.configured) return provider.active.toLowerCase() === "rules" ? "Rules fallback" : `${provider.active} rules fallback`;
  if (provider.lastError) return `${provider.active} degraded`;
  return `${provider.active} live`;
}

function providerDetail(provider: AiProviderPayload | null) {
  if (!provider) return "Loading provider status";
  if (provider.lastError) return provider.lastError;
  return provider.model;
}

function providerTone(provider: AiProviderPayload | null) {
  if (!provider) return "neutral";
  if (provider.lastError) return "warning";
  if (!provider.configured) return "muted";
  return "success";
}

function documentMeta(document: PublicKnowledgeDocument) {
  const words = document.content.trim().split(/\s+/).filter(Boolean).length;
  return `${words.toLocaleString()} words`;
}

function documentWordCount(document: PublicKnowledgeDocument) {
  return document.content.trim().split(/\s+/).filter(Boolean).length;
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function formatEventType(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function AdminDashboard({ userEmail }: { userEmail: string }) {
  const [project, setProject] = useState<AdminProjectPayload | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProviderPayload | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, AiProviderDraft>>({});
  const [selectedDocument, setSelectedDocument] = useState<PublicKnowledgeDocument | null>(null);
  const [documentFilter, setDocumentFilter] = useState("");
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [status, setStatus] = useState("Loading workspace");
  const [resetConfirm, setResetConfirm] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const appUrl =
    typeof window === "undefined"
      ? "http://localhost:3000"
      : `${window.location.protocol}//${window.location.host}`;
  const projectId = project?.publicId ?? "";

  const snippet = useMemo(() => {
    if (!projectId) return "";
    return `<script src="${appUrl}/widget/loader.js" data-project-id="${projectId}"></script>`;
  }, [appUrl, projectId]);

  const enabledDocuments = project?.documents.filter((document) => document.enabled).length ?? 0;
  const totalDocuments = project?.documents.length ?? 0;
  const eventCount = project?.events.length ?? 0;
  const connectedProviders = aiProvider?.providers.filter((provider) => provider.hasToken).length ?? 0;
  const totalProviders = aiProvider?.providers.length ?? 0;
  const activeViewMeta = adminViewMeta[activeView];
  const isDemoProject = project?.publicId === "demo-project";
  const resetReady = resetConfirm.trim() === "RESET_DEMO";
  const filteredDocuments = useMemo(() => {
    const query = documentFilter.trim().toLowerCase();
    const documents = project?.documents ?? [];
    if (!query) return documents;
    return documents.filter((document) =>
      `${document.title} ${document.tags.join(" ")}`.toLowerCase().includes(query)
    );
  }, [documentFilter, project?.documents]);
  const totalKnowledgeWords = useMemo(
    () => (project?.documents ?? []).reduce((sum, document) => sum + documentWordCount(document), 0),
    [project?.documents]
  );
  const activeProviderConnection = aiProvider?.providers.find((provider) => provider.active) ?? null;
  const latestEvent = project?.events[0] ?? null;
  const launchChecklist = [
    {
      icon: "fa-book-open",
      label: "Knowledge coverage",
      detail: totalDocuments ? `${enabledDocuments}/${totalDocuments} documents enabled` : "Add the first document",
      done: enabledDocuments > 0,
      view: "knowledge" as const
    },
    {
      icon: "fa-brain",
      label: "Runtime provider",
      detail: aiProvider?.configured ? `${aiProvider.active} ready` : "Rules fallback is active",
      done: Boolean(aiProvider?.configured && !aiProvider.lastError),
      view: "providers" as const
    },
    {
      icon: "fa-code",
      label: "Widget install",
      detail: projectId ? `Snippet points to ${projectId}` : "Waiting for project ID",
      done: Boolean(projectId),
      view: "widget" as const
    },
    {
      icon: "fa-shield-halved",
      label: "Domain guard",
      detail: project?.domain || "No domain lock configured",
      done: Boolean(project?.domain),
      view: "settings" as const
    }
  ];

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const next = window.location.hash.replace("#", "");
      const match = adminViews.find((view) => view.id === next);
      if (match) setActiveView(match.id);
    }

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  function openAdminView(view: AdminView) {
    setActiveView(view);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
    }
  }

  function syncProviderDrafts(payload: AiProviderPayload) {
    setProviderDrafts((current) => {
      const next: Record<string, AiProviderDraft> = {};
      for (const provider of payload.providers) {
        next[provider.provider] = {
          apiKey: current[provider.provider]?.apiKey ?? "",
          model: current[provider.provider]?.model || provider.model || provider.defaultModel,
          enabled: current[provider.provider]?.enabled ?? provider.enabled
        };
      }
      return next;
    });
  }

  async function loadWorkspace(preferredDocumentId?: string) {
    const response = await fetch("/api/admin/project");
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) {
      setStatus("Project seed data is missing");
      return;
    }

    const payload = (await response.json()) as AdminProjectPayload;
    setProject(payload);
    setProjectDraft({
      name: payload.name,
      domain: payload.domain ?? "",
      accent: payload.theme.accent,
      logoText: payload.theme.logoText ?? "smartup"
    });

    const nextDocument =
      payload.documents.find((document) => document.id === preferredDocumentId) ?? payload.documents[0] ?? emptyDocument;
    setSelectedDocument(nextDocument);

    const providerResponse = await fetch("/api/ai/provider");
    if (providerResponse.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (providerResponse.ok) {
      const providerPayload = (await providerResponse.json()) as AiProviderPayload;
      setAiProvider(providerPayload);
      syncProviderDrafts(providerPayload);
    }

    setStatus("Ready");
  }

  function updateDocument(patch: Partial<PublicKnowledgeDocument>) {
    setSelectedDocument((current) => (current ? { ...current, ...patch } : current));
  }

  function newDocument() {
    setSelectedDocument({ ...emptyDocument, tags: [...emptyDocument.tags] });
    setStatus("Draft document");
  }

  async function saveDocument() {
    if (!project || !selectedDocument) return;

    setStatus("Saving document");
    const response = await fetch("/api/admin/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.publicId,
        id: selectedDocument.id || undefined,
        title: selectedDocument.title,
        content: selectedDocument.content,
        tags: selectedDocument.tags,
        enabled: selectedDocument.enabled
      })
    });

    if (!response.ok) {
      setStatus("Document save failed");
      return;
    }

    const payload = (await response.json()) as { document: PublicKnowledgeDocument };
    await loadWorkspace(payload.document.id);
    setStatus("Document saved");
  }

  async function saveProjectSettings() {
    if (!projectDraft) return;

    setStatus("Saving project settings");
    const response = await fetch("/api/admin/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: projectDraft.name,
        domain: projectDraft.domain || null,
        theme: {
          accent: projectDraft.accent,
          logoText: projectDraft.logoText
        }
      })
    });

    if (!response.ok) {
      setStatus("Project settings save failed");
      return;
    }

    await loadWorkspace(selectedDocument?.id);
    setStatus("Project settings saved");
  }

  function clearDemoClientState() {
    if (typeof window === "undefined" || !project) return;

    try {
      const prefix = `ai-guide-widget:${project.publicId}:`;
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(prefix)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Local storage can be blocked in some browser contexts.
    }
  }

  async function resetDemoProject() {
    if (!project || !isDemoProject) {
      setStatus("Reset is available only for the demo project");
      return;
    }

    if (!resetReady) {
      setStatus("Type RESET_DEMO before resetting");
      return;
    }

    setIsResetting(true);
    setStatus("Resetting demo project");

    const response = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: resetConfirm.trim() })
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      setIsResetting(false);
      setStatus("Demo reset failed");
      return;
    }

    clearDemoClientState();
    setResetConfirm("");
    setDocumentFilter("");
    setProviderDrafts({});
    await loadWorkspace("doc_demo_overview");
    setIsResetting(false);
    setStatus("Demo reset to clean seed");
  }

  function updateProviderDraft(provider: string, patch: Partial<AiProviderDraft>) {
    setProviderDrafts((current) => {
      const fallback = aiProvider?.providers.find((item) => item.provider === provider)?.defaultModel ?? "";
      const existing = current[provider] ?? { apiKey: "", model: fallback, enabled: true };

      return {
        ...current,
        [provider]: {
          ...existing,
          ...patch
        }
      };
    });
  }

  async function saveAiProvider(provider: AiProviderConnection, makeActive = false) {
    const draft = providerDrafts[provider.provider] ?? {
      apiKey: "",
      model: provider.model || provider.defaultModel,
      enabled: provider.enabled
    };

    setStatus(makeActive ? `Connecting ${provider.name}` : `Saving ${provider.name}`);
    const response = await fetch("/api/ai/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: provider.provider,
        apiKey: draft.apiKey.trim() || undefined,
        model: draft.model.trim() || provider.defaultModel,
        enabled: draft.enabled,
        makeActive
      })
    });

    if (response.ok) {
      const payload = (await response.json()) as AiProviderPayload;
      setAiProvider(payload);
      syncProviderDrafts(payload);
      setProviderDrafts((current) => ({
        ...current,
        [provider.provider]: {
          ...(current[provider.provider] ?? draft),
          apiKey: ""
        }
      }));
      setStatus(makeActive ? `${provider.name} connected` : `${provider.name} saved`);
    } else {
      setStatus("Add a token before activating this provider");
    }
  }

  async function useRulesFallback() {
    setStatus("Switching to rules fallback");
    const response = await fetch("/api/ai/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "rules" })
    });

    if (response.ok) {
      const payload = (await response.json()) as AiProviderPayload;
      setAiProvider(payload);
      syncProviderDrafts(payload);
      setStatus("Rules fallback active");
    } else {
      setStatus("Provider switch failed");
    }
  }

  async function copySnippet() {
    if (!snippet) {
      setStatus("Project-specific snippet is still loading");
      return;
    }

    await navigator.clipboard.writeText(snippet);
    setStatus("Install snippet copied");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="admin-shell admin-console">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" />
          <div>
            <strong>Smartup Guide</strong>
            <span>Admin command center</span>
          </div>
        </div>
        <nav aria-label="Admin sections" className="sidebar-nav">
          {adminViews.map((view) => (
            <button
              aria-current={activeView === view.id ? "page" : undefined}
              className={activeView === view.id ? "active" : ""}
              key={view.id}
              onClick={() => openAdminView(view.id)}
              type="button"
            >
              <i className={`nav-icon fa-solid ${view.icon}`} aria-hidden="true" />
              <span className="nav-copy">
                <span className="nav-label">{view.label}</span>
                <small>{view.hint}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-insight">
          <span>Runtime</span>
          <strong>{providerLabel(aiProvider)}</strong>
          <small>{providerDetail(aiProvider)}</small>
        </div>
        <div className="sidebar-user">
          <span className="user-label">Signed in as</span>
          <span>{userEmail}</span>
          <button className="text-button" onClick={logout} type="button">
            Sign out
          </button>
        </div>
      </aside>

      <section className="workspace">
        <div className="admin-topbar">
          <div>
            <span>Workspace</span>
            <strong>{projectId || "Loading project"}</strong>
          </div>
          <div className="topbar-progress" aria-label="Admin setup progress">
            {launchChecklist.map((item) => (
              <span className={item.done ? "done" : ""} key={item.label}>
                {item.label}
              </span>
            ))}
          </div>
          <div className="topbar-actions">
            <span className={`status-pill ${providerTone(aiProvider)}`}>{providerLabel(aiProvider)}</span>
            <a className="btn" href="/demo" target="_blank">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              Open demo
            </a>
          </div>
        </div>

        <header className="workspace-header">
          <div className="workspace-identity">
            <span className="workspace-kicker">{project?.name ?? "Smartup SFA Assistant"}</span>
            <h1>{activeViewMeta.title}</h1>
            <p>{activeViewMeta.description}</p>
            <div className="admin-health-row" aria-label="Workspace summary">
              <span>{project?.domain || "No domain lock"}</span>
              <span>{enabledDocuments} enabled documents</span>
              <span>{totalKnowledgeWords.toLocaleString()} knowledge words</span>
              <span>{eventCount} events</span>
            </div>
          </div>
          <div className="workspace-header-side">
            <div className="workspace-snapshot">
              <div>
                <span>Active runtime</span>
                <strong>{activeProviderConnection?.name ?? providerLabel(aiProvider)}</strong>
              </div>
              <div>
                <span>Last activity</span>
                <strong>{latestEvent ? formatEventType(latestEvent.type) : "No events yet"}</strong>
              </div>
            </div>
            <div className="header-actions">
              {activeView === "overview" || activeView === "knowledge" ? (
                <button className="btn primary" onClick={newDocument} type="button">
                  <i className="fa-solid fa-plus" aria-hidden="true" />
                  New document
                </button>
              ) : null}
              {activeView === "providers" ? (
                <button className="btn" onClick={useRulesFallback} type="button">
                  <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                  Rules fallback
                </button>
              ) : null}
              {activeView === "widget" ? (
                <button className="btn primary" disabled={!snippet} onClick={copySnippet} type="button">
                  <i className="fa-solid fa-copy" aria-hidden="true" />
                  Copy snippet
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="admin-view-shell">
          {activeView === "overview" ? (
            <section className="admin-view" id="overview">
              <section className="metric-grid">
                <div className="metric-card">
                  <i className="metric-icon fa-solid fa-diagram-project" aria-hidden="true" />
                  <span className="metric-label">Project</span>
                  <strong>{projectId || "Loading project"}</strong>
                  <p>{project?.domain || "No domain lock"}</p>
                </div>
                <div className="metric-card">
                  <i className="metric-icon fa-solid fa-book-open" aria-hidden="true" />
                  <span className="metric-label">Knowledge</span>
                  <strong>
                    {enabledDocuments}/{totalDocuments}
                  </strong>
                  <p>{totalKnowledgeWords.toLocaleString()} indexed words</p>
                </div>
                <div className="metric-card">
                  <i className="metric-icon fa-solid fa-brain" aria-hidden="true" />
                  <span className="metric-label">AI provider</span>
                  <strong>{providerLabel(aiProvider)}</strong>
                  <p>{providerDetail(aiProvider)}</p>
                </div>
                <div className="metric-card">
                  <i className="metric-icon fa-solid fa-wave-square" aria-hidden="true" />
                  <span className="metric-label">Activity</span>
                  <strong>{eventCount}</strong>
                  <p>{latestEvent ? formatEventTime(latestEvent.createdAt) : status}</p>
                </div>
              </section>

              <section className="overview-workbench">
                <section className="surface launch-panel" aria-labelledby="launch-panel-title">
                  <div className="surface-header compact">
                    <div>
                      <h2 id="launch-panel-title">Launch readiness</h2>
                      <p>Fast path for the settings that affect the live widget.</p>
                    </div>
                    <span className="readiness-score">
                      {launchChecklist.filter((item) => item.done).length}/{launchChecklist.length}
                    </span>
                  </div>
                  <div className="task-stack">
                    {launchChecklist.map((item) => (
                      <button
                        className={`task-row ${item.done ? "done" : ""}`}
                        key={item.label}
                        onClick={() => openAdminView(item.view)}
                        type="button"
                      >
                        <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                        <em>{item.done ? "Ready" : "Review"}</em>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="surface activity-panel" aria-labelledby="activity-panel-title">
                  <div className="surface-header compact">
                    <div>
                      <h2 id="activity-panel-title">Recent activity</h2>
                      <p>Latest events from the embedded assistant.</p>
                    </div>
                    <button className="btn" onClick={() => openAdminView("events")} type="button">
                      View all
                    </button>
                  </div>
                  <div className="event-list compact-events">
                    {project?.events.length ? (
                      project.events.slice(0, 4).map((event) => (
                        <div className="event-row" key={event.id}>
                          <strong>{formatEventType(event.type)}</strong>
                          <span>{event.guideSlug ?? event.path ?? "runtime-ai"}</span>
                          <small>{formatEventTime(event.createdAt)}</small>
                        </div>
                      ))
                    ) : (
                      <p className="empty-state">No events yet. Open the demo to generate activity.</p>
                    )}
                  </div>
                </section>
              </section>

              <section className="admin-view-grid" aria-label="Admin workspace sections">
                <button className="admin-action-card" onClick={() => openAdminView("providers")} type="button">
                  <i className="admin-action-icon fa-solid fa-brain" aria-hidden="true" />
                  <strong>AI providers</strong>
                  <p>
                    {connectedProviders}/{totalProviders || 10} providers connected. Each workspace can use its own token.
                  </p>
                  <small>{providerLabel(aiProvider)}</small>
                </button>
                <button className="admin-action-card" onClick={() => openAdminView("knowledge")} type="button">
                  <i className="admin-action-icon fa-solid fa-book-open" aria-hidden="true" />
                  <strong>Knowledge base</strong>
                  <p>Edit approved documents, tags, and availability for the assistant.</p>
                  <small>{enabledDocuments} active documents</small>
                </button>
                <button className="admin-action-card" onClick={() => openAdminView("widget")} type="button">
                  <i className="admin-action-icon fa-solid fa-code" aria-hidden="true" />
                  <strong>Widget install</strong>
                  <p>Copy this workspace's embed snippet and test it on the demo page.</p>
                  <small>{projectId || "Loading project"}</small>
                </button>
                <button className="admin-action-card" onClick={() => openAdminView("settings")} type="button">
                  <i className="admin-action-icon fa-solid fa-gear" aria-hidden="true" />
                  <strong>Settings</strong>
                  <p>Manage project identity, domain guard, accent, and logo text.</p>
                  <small>{project?.domain || "No domain lock"}</small>
                </button>
                <button className="admin-action-card" onClick={() => openAdminView("events")} type="button">
                  <i className="admin-action-icon fa-solid fa-clock-rotate-left" aria-hidden="true" />
                  <strong>Events</strong>
                  <p>Open the latest runtime activity without scrolling through other tools.</p>
                  <small>{eventCount} recent events</small>
                </button>
                {isDemoProject ? (
                  <button className="admin-action-card danger-card" onClick={() => openAdminView("settings")} type="button">
                    <i className="admin-action-icon fa-solid fa-rotate-left" aria-hidden="true" />
                    <strong>Reset demo</strong>
                    <p>Clear changed settings, knowledge edits, events, guides, and provider tokens.</p>
                    <small>Available in Settings</small>
                  </button>
                ) : null}
              </section>
            </section>
          ) : null}

          {activeView === "providers" ? (
            <section className="admin-view surface ai-console-surface" id="providers">
              <div className="surface-header ai-console-header">
                <div>
                  <h2>AI provider connections</h2>
                  <p>Each workspace can bring its own API token and choose the active model.</p>
                </div>
                <div className="ai-console-actions">
                  <span className={`status-pill ${providerTone(aiProvider)}`}>{providerLabel(aiProvider)}</span>
                  <button className="btn" onClick={useRulesFallback} type="button">
                    <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                    Rules fallback
                  </button>
                </div>
              </div>
              <div className="provider-command-bar">
                <div className="runtime-summary-card">
                  <span className="metric-label">Current runtime</span>
                  <strong>{activeProviderConnection?.name ?? providerLabel(aiProvider)}</strong>
                  <p>{providerDetail(aiProvider)}</p>
                </div>
                <div className="provider-mini-stat">
                  <span>Connected</span>
                  <strong>
                    {connectedProviders}/{totalProviders || 10}
                  </strong>
                </div>
                <div className="provider-mini-stat">
                  <span>Available catalog</span>
                  <strong>{totalProviders || 10}</strong>
                </div>
                <div className="provider-mini-stat">
                  <span>Fallback</span>
                  <strong>Rules</strong>
                </div>
              </div>
              <div className="ai-provider-grid">
                {(aiProvider?.providers ?? []).map((provider) => {
                  const draft = providerDrafts[provider.provider] ?? {
                    apiKey: "",
                    model: provider.model || provider.defaultModel,
                    enabled: provider.enabled
                  };
                  const canActivate = provider.hasToken || draft.apiKey.trim().length > 0;

                  return (
                    <article className={`ai-provider-card ${provider.active ? "active" : ""}`} key={provider.provider}>
                      <div className="provider-card-head">
                        <span className="provider-mark">{provider.shortName.slice(0, 2)}</span>
                        <div>
                          <strong>{provider.name}</strong>
                          <span>{provider.description}</span>
                        </div>
                      </div>
                      <div className="provider-status-line">
                        <span className={`status-pill ${provider.active ? "success" : provider.hasToken ? "neutral" : "muted"}`}>
                          {provider.active ? "Active" : provider.hasToken ? "Connected" : "Token needed"}
                        </span>
                        <small>{provider.keyHint ?? provider.protocol}</small>
                      </div>
                      <div className="provider-capability">
                        <span>Protocol</span>
                        <strong>{provider.protocol}</strong>
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <input
                          value={draft.model}
                          onChange={(event) => updateProviderDraft(provider.provider, { model: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>API token</label>
                        <input
                          autoComplete="off"
                          placeholder={provider.hasToken ? "Saved token hidden" : "Paste provider token"}
                          type="password"
                          value={draft.apiKey}
                          onChange={(event) => updateProviderDraft(provider.provider, { apiKey: event.target.value })}
                        />
                      </div>
                      <div className="provider-card-actions">
                        <label className="check-row">
                          <input
                            checked={draft.enabled}
                            onChange={(event) => updateProviderDraft(provider.provider, { enabled: event.target.checked })}
                            type="checkbox"
                          />
                          Enabled
                        </label>
                        <div className="actions">
                          <button className="btn" onClick={() => void saveAiProvider(provider)} type="button">
                            Save
                          </button>
                          <button
                            className="btn primary"
                            disabled={!canActivate}
                            onClick={() => void saveAiProvider(provider, true)}
                            type="button"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activeView === "knowledge" ? (
            <section className="admin-view surface knowledge-surface" id="knowledge">
              <div className="surface-header">
                <div>
                  <h2>Knowledge base</h2>
                  <p>Enabled documents are the assistant source of truth.</p>
                </div>
                <div className="surface-actions">
                  <input
                    aria-label="Filter documents"
                    className="compact-input"
                    onChange={(event) => setDocumentFilter(event.target.value)}
                    placeholder="Filter documents"
                    value={documentFilter}
                  />
                  <button className="btn" onClick={newDocument} type="button">
                    New
                  </button>
                </div>
              </div>

              <div className="knowledge-stats-row">
                <div>
                  <span>Enabled</span>
                  <strong>{enabledDocuments}</strong>
                </div>
                <div>
                  <span>Total docs</span>
                  <strong>{totalDocuments}</strong>
                </div>
                <div>
                  <span>Words</span>
                  <strong>{totalKnowledgeWords.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Showing</span>
                  <strong>{filteredDocuments.length}</strong>
                </div>
              </div>

              <div className="knowledge-layout">
                <div className="document-list">
                  {filteredDocuments.map((document) => (
                    <button
                      className={`document-row ${selectedDocument?.id === document.id ? "active" : ""}`}
                      key={document.id}
                      onClick={() => setSelectedDocument(document)}
                      type="button"
                    >
                      <strong>{document.title}</strong>
                      <span>
                        {document.enabled ? "Enabled" : "Disabled"} - {documentMeta(document)}
                      </span>
                      <span className="document-tags">
                        {document.tags.slice(0, 4).map((tag) => (
                          <small key={tag}>{tag}</small>
                        ))}
                        {!document.tags.length ? <small>No tags</small> : null}
                      </span>
                    </button>
                  ))}
                  {!filteredDocuments.length ? <p className="empty-state">No matching documents.</p> : null}
                </div>

                <div className="editor-pane document-editor-panel">
                  {selectedDocument ? (
                    <>
                      <div className="editor-title-row">
                        <div>
                          <span className="metric-label">Selected document</span>
                          <h3>{selectedDocument.title || "Untitled document"}</h3>
                          <small>{documentMeta(selectedDocument)} in this source</small>
                        </div>
                        <span className={`status-pill ${selectedDocument.enabled ? "success" : "muted"}`}>
                          {selectedDocument.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <div className="grid two">
                        <div className="field">
                          <label>Title</label>
                          <input
                            value={selectedDocument.title}
                            onChange={(event) => updateDocument({ title: event.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Tags</label>
                          <input
                            value={selectedDocument.tags.join(", ")}
                            onChange={(event) =>
                              updateDocument({
                                tags: event.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean)
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label>Content</label>
                        <textarea
                          className="document-textarea"
                          value={selectedDocument.content}
                          onChange={(event) => updateDocument({ content: event.target.value })}
                        />
                      </div>
                      <div className="editor-footer">
                        <label className="check-row">
                          <input
                            checked={selectedDocument.enabled}
                            onChange={(event) => updateDocument({ enabled: event.target.checked })}
                            type="checkbox"
                          />
                          Enabled for AI
                        </label>
                        <div className="actions">
                          <button className="btn" onClick={newDocument} type="button">
                            New
                          </button>
                          <button className="btn primary" onClick={saveDocument} type="button">
                            Save document
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">Select or create a document.</p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {activeView === "widget" ? (
            <section className="admin-view admin-split-grid" id="widget">
              <section className="surface widget-install-panel">
                <div className="surface-header compact">
                  <div>
                    <h2>Widget install</h2>
                    <p>Paste this script before the closing body tag.</p>
                  </div>
                  <span className="status-pill success">Ready to embed</span>
                </div>
                <code className="snippet">{snippet || "Loading project-specific snippet..."}</code>
                <div className="install-checklist">
                  <span>
                    <i className="fa-solid fa-check" aria-hidden="true" />
                    Project ID: {projectId || "loading"}
                  </span>
                  <span>
                    <i className="fa-solid fa-check" aria-hidden="true" />
                    Loader hosted locally
                  </span>
                  <span className={project?.domain ? "done" : ""}>
                    <i className={`fa-solid ${project?.domain ? "fa-check" : "fa-lock-open"}`} aria-hidden="true" />
                    {project?.domain ? "Domain guard enabled" : "No domain guard"}
                  </span>
                </div>
                <div className="actions">
                  <button className="btn primary" disabled={!snippet} onClick={copySnippet} type="button">
                    <i className="fa-solid fa-copy" aria-hidden="true" />
                    Copy snippet
                  </button>
                  <a className="btn" href="/demo" target="_blank">
                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                    Test widget
                  </a>
                </div>
              </section>

              <section className="surface widget-runtime-panel">
                <div className="surface-header compact">
                  <div>
                    <h2>Runtime status</h2>
                    <p>Active model and fallback state.</p>
                  </div>
                </div>
                <div className="provider-status-row">
                  <span className={`status-pill ${providerTone(aiProvider)}`}>{providerLabel(aiProvider)}</span>
                  <small>{providerDetail(aiProvider)}</small>
                </div>
                <div className="widget-preview-card" aria-hidden="true">
                  <div className="chat-titlebar">
                    <span className="product-mark small-mark" />
                    <strong>{projectDraft?.logoText || "smartup"} Guide</strong>
                    <button type="button" tabIndex={-1}>
                      <i className="fa-solid fa-minus" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="widget-preview-body">
                    <p className="assistant-message">Hi. I can answer from your knowledge base.</p>
                    <div className="assistant-card">
                      <strong>Source ready</strong>
                      <span>{enabledDocuments} enabled documents</span>
                    </div>
                  </div>
                </div>
                <button className="btn" onClick={() => openAdminView("providers")} type="button">
                  <i className="fa-solid fa-brain" aria-hidden="true" />
                  Manage providers
                </button>
              </section>
            </section>
          ) : null}

          {activeView === "settings" ? (
            <section className="admin-view surface settings-surface" id="settings">
              <div className="surface-header compact">
                <div>
                  <h2>Project settings</h2>
                  <p>Keep rollout identity consistent.</p>
                </div>
              </div>
              {projectDraft ? (
                <div className="settings-layout">
                  <section className="settings-form-panel">
                    <div className="field">
                      <label>Project name</label>
                      <input
                        value={projectDraft.name}
                        onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Allowed domain</label>
                      <input
                        placeholder="example.com"
                        value={projectDraft.domain}
                        onChange={(event) => setProjectDraft({ ...projectDraft, domain: event.target.value })}
                      />
                    </div>
                    <div className="grid two compact-grid">
                      <div className="field">
                        <label>Accent</label>
                        <input
                          type="color"
                          value={projectDraft.accent}
                          onChange={(event) => setProjectDraft({ ...projectDraft, accent: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Logo text</label>
                        <input
                          value={projectDraft.logoText}
                          onChange={(event) => setProjectDraft({ ...projectDraft, logoText: event.target.value })}
                        />
                      </div>
                    </div>
                    <button className="btn primary" onClick={saveProjectSettings} type="button">
                      <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                      Save settings
                    </button>
                  </section>
                  <section className="settings-preview-card" aria-label="Workspace identity preview">
                    <span className="metric-label">Preview</span>
                    <div className="settings-preview-brand">
                      <span className="brand-mark" />
                      <div>
                        <strong>{projectDraft.logoText || "smartup"} Guide</strong>
                        <small>{projectDraft.name}</small>
                      </div>
                    </div>
                    <div className="settings-preview-accent" style={{ background: projectDraft.accent }} />
                    <p>{projectDraft.domain ? `Allowed on ${projectDraft.domain}` : "Runs without a domain lock."}</p>
                  </section>
                </div>
              ) : null}
              {isDemoProject ? (
                <section className="demo-reset-panel" aria-labelledby="demo-reset-title">
                  <div>
                    <span className="metric-label">Danger zone</span>
                    <h3 id="demo-reset-title">Reset demo project</h3>
                    <p>
                      Restores the demo back to the clean Northstar Retail seed. This clears knowledge edits, events,
                      guides, provider tokens, and project settings for the demo workspace.
                    </p>
                  </div>
                  <div className="demo-reset-actions">
                    <div className="field">
                      <label>Type RESET_DEMO</label>
                      <input
                        autoComplete="off"
                        data-testid="demo-reset-confirm"
                        onChange={(event) => setResetConfirm(event.target.value)}
                        placeholder="RESET_DEMO"
                        value={resetConfirm}
                      />
                    </div>
                    <button
                      className="btn danger"
                      data-testid="demo-reset-button"
                      disabled={!resetReady || isResetting}
                      onClick={() => void resetDemoProject()}
                      type="button"
                    >
                      {isResetting ? "Resetting" : "Reset demo"}
                    </button>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {activeView === "events" ? (
            <section className="admin-view surface events-surface" id="events">
              <div className="surface-header compact">
                <div>
                  <h2>Recent events</h2>
                  <p>Latest widget activity.</p>
                </div>
              </div>
              <div className="event-list event-timeline">
                {project?.events.length ? (
                  project.events.map((event) => (
                    <div className="event-row" key={event.id}>
                      <i className="fa-solid fa-bolt" aria-hidden="true" />
                      <strong>{formatEventType(event.type)}</strong>
                      <span>{event.guideSlug ?? event.path ?? "runtime-ai"}</span>
                      <small>{formatEventTime(event.createdAt)}</small>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">No events yet.</p>
                )}
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
