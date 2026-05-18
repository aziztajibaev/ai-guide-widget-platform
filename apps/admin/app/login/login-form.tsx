"use client";

import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projectName, setProjectName] = useState("");
  const [status, setStatus] = useState("Sign in or create a workspace.");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(mode === "login" ? "Checking credentials" : "Creating workspace");

    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        projectName: projectName || undefined
      })
    });

    if (response.ok) {
      window.location.href = "/admin";
      return;
    }

    setLoading(false);
    if (response.status === 409) {
      setStatus("This email already has a workspace. Sign in instead.");
      return;
    }

    setStatus(mode === "login" ? "Email or password is incorrect." : "Could not create the workspace.");
  }

  return (
    <main className="login-shell">
      <section className="login-copy">
        <div className="login-brand inverse">
          <span className="brand-mark" />
          <div>
            <strong>Smartup Guide</strong>
            <span>AI onboarding for complex web apps</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">Admin console</span>
          <h1>Control your assistant before it reaches users.</h1>
          <p>
            Manage knowledge, provider status, domain access, and install snippets from a secured workspace.
          </p>
        </div>
        <div className="login-proof-grid">
          <span>Signed sessions</span>
          <span>Domain guard</span>
          <span>Provider fallback</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark" />
          <div>
            <strong>Smartup Guide</strong>
            <span>Secure admin access</span>
          </div>
        </div>
        <div>
          <h1>{mode === "login" ? "Sign in" : "Create workspace"}</h1>
          <p>
            {mode === "login"
              ? "Access your assistant settings, knowledge, and deployment snippets."
              : "Register a user account with its own project settings and widget ID."}
          </p>
        </div>
        <div className="auth-mode-toggle" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setStatus("Sign in to manage your workspace.");
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setStatus("Create a new workspace.");
            }}
            type="button"
          >
            Register
          </button>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@company.com"
              type="email"
              value={email}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "login" ? "Enter password" : "At least 8 characters"}
              type="password"
              value={password}
            />
          </div>
          {mode === "register" ? (
            <div className="field">
              <label>Workspace name</label>
              <input
                autoComplete="organization"
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="My company assistant"
                value={projectName}
              />
            </div>
          ) : null}
          <button className="btn primary login-submit" disabled={loading} type="submit">
            {loading ? (mode === "login" ? "Signing in" : "Creating") : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="credential-note">
          Each registered user receives a separate project ID and keeps their own widget settings.
        </div>
        <p className="login-status">{status}</p>
      </section>
    </main>
  );
}
