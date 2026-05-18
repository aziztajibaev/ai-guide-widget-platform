import Script from "next/script";

const featureCards = [
  {
    icon: "fa-database",
    title: "AI answers from your knowledge base",
    text: "Approved docs and policies stay close to every support answer."
  },
  {
    icon: "fa-location-arrow",
    title: "Points to the right control or setting",
    text: "Guide users toward the exact screen, button, or next action."
  },
  {
    icon: "fa-comments",
    title: "Built-in chat that stays inside your product",
    text: "Keep help in context instead of sending people to another tab."
  },
  {
    icon: "fa-chart-line",
    title: "Full visibility and actionable insights",
    text: "Track conversations, topics, accuracy, and unresolved moments."
  }
];

const workflowSteps = [
  {
    icon: "fa-cloud-arrow-up",
    tone: "source",
    meta: "Docs synced",
    title: "Connect knowledge",
    text: "Upload docs or connect trusted sources."
  },
  {
    icon: "fa-sliders",
    tone: "rules",
    meta: "Rules tuned",
    title: "Configure",
    text: "Set behavior, tone, provider, and widget settings."
  },
  {
    icon: "fa-code",
    tone: "embed",
    meta: "Snippet live",
    title: "Install",
    text: "Add the snippet to your app or site."
  },
  {
    icon: "fa-route",
    tone: "guide",
    meta: "Help delivered",
    title: "Guide users",
    text: "Answer questions and point to the next action."
  }
];

const adminRows = [
  ["Getting started guide", "PDF", "Ready", "May 12"],
  ["Account management", "DOCX", "Ready", "May 11"],
  ["Billing rules", "PDF", "Ready", "May 10"],
  ["API reference", "MD", "Processing", "May 09"]
];

const providerRows = [
  ["Top 10 AI", "bring your token", "Ready"],
  ["OpenAI / Claude / Gemini", "configured per workspace", "Live"],
  ["Groq / DeepSeek / Mistral", "fast guided help", "Live"],
  ["xAI / Cohere / Perplexity", "optional", "Idle"],
  ["OpenRouter", "multi-model routing", "Ready"]
];

const heroMetrics = [
  ["fa-rocket", "80%", "Faster resolution"],
  ["fa-ticket-simple", "35%", "Less tickets"],
  ["fa-robot", "24/7", "AI availability"],
  ["fa-bullseye", "98%", "Answer accuracy"]
];

const navItems = [
  ["Product", "#features", "product"],
  ["Features", "#features"],
  ["How it works", "#workflow"],
  ["Pricing", "#admin-preview"],
  ["Docs", "#workflow"],
  ["About", "#chat-preview"]
];

const landingScript = `
(function () {
  var root = document.querySelector(".product-landing");
  if (!root) return;

  var progress = root.querySelector("[data-scroll-progress]");
  var navLinks = Array.prototype.slice.call(root.querySelectorAll("[data-nav-link]"));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute("href");
      return id && id.indexOf("#") === 0 ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  function updateProgress() {
    if (!progress) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var value = Math.min(1, Math.max(0, window.scrollY / max));
    progress.style.transform = "scaleX(" + value + ")";
  }

  function updateActiveNav() {
    if (!sections.length) return;
    var current = sections[0];
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top < 160) current = section;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + current.id);
    });
  }

  window.addEventListener("scroll", function () {
    updateProgress();
    updateActiveNav();
  }, { passive: true });
  window.addEventListener("resize", function () {
    updateProgress();
    updateActiveNav();
  });

  var canUsePointerEffects = !window.matchMedia || !window.matchMedia("(pointer: coarse)").matches;

  function scheduleFrame(callback) {
    if ("requestAnimationFrame" in window) {
      window.requestAnimationFrame(callback);
      return;
    }
    callback();
  }

  function bindPreviewMouseEffect() {
    var preview = root.querySelector(".hero-live-preview");
    if (!preview || !canUsePointerEffects) return;

    var frame = 0;
    var target = { x: 0, y: 0 };

    function apply() {
      frame = 0;
      var x = target.x;
      var y = target.y;
      preview.style.setProperty("--mouse-x", (x * 22).toFixed(2) + "px");
      preview.style.setProperty("--mouse-y", (y * 18).toFixed(2) + "px");
      preview.style.setProperty("--mouse-rx", (-y * 8).toFixed(2) + "deg");
      preview.style.setProperty("--mouse-ry", (x * 10).toFixed(2) + "deg");
      preview.style.setProperty("--panel-mouse-x", (x * 14).toFixed(2) + "px");
      preview.style.setProperty("--panel-mouse-y", (y * 10).toFixed(2) + "px");
      preview.style.setProperty("--panel-hover-rx", (-y * 3).toFixed(2) + "deg");
      preview.style.setProperty("--panel-hover-ry", (x * 4).toFixed(2) + "deg");
      preview.style.setProperty("--orbit-mouse-x", (x * 10).toFixed(2) + "px");
      preview.style.setProperty("--orbit-mouse-y", (y * 8).toFixed(2) + "px");
      preview.style.setProperty("--orbit-hover-rx", (-y * 4).toFixed(2) + "deg");
      preview.style.setProperty("--orbit-hover-ry", (x * 5).toFixed(2) + "deg");
    }

    function queueApply() {
      if (frame) return;
      frame = 1;
      scheduleFrame(apply);
    }

    preview.addEventListener("pointermove", function (event) {
      var rect = preview.getBoundingClientRect();
      target.x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
      target.y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
      preview.classList.add("is-pointer-active");
      queueApply();
    });

    preview.addEventListener("pointerleave", function () {
      target.x = 0;
      target.y = 0;
      preview.classList.remove("is-pointer-active");
      queueApply();
    });
  }

  function bindMetricMouseEffect() {
    if (!canUsePointerEffects) return;
    var metricCards = Array.prototype.slice.call(root.querySelectorAll(".hero-metric"));

    function resetMetricCard(card) {
      card.classList.remove("is-pointer-active");
      card.style.setProperty("--metric-hover-rx", "5deg");
      card.style.setProperty("--metric-hover-ry", "var(--metric-tilt)");
      card.style.setProperty("--metric-glow-x", "50%");
      card.style.setProperty("--metric-glow-y", "0%");
    }

    root.addEventListener("pointermove", function (event) {
      if (event.target && event.target.closest && event.target.closest(".hero-metric")) return;
      metricCards.forEach(resetMetricCard);
    }, { passive: true });

    metricCards.forEach(function (card) {
      var frame = 0;
      var target = { rx: "5deg", ry: "0deg", gx: "50%", gy: "0%" };

      function apply() {
        frame = 0;
        card.style.setProperty("--metric-hover-rx", target.rx);
        card.style.setProperty("--metric-hover-ry", target.ry);
        card.style.setProperty("--metric-glow-x", target.gx);
        card.style.setProperty("--metric-glow-y", target.gy);
      }

      function queueApply() {
        if (frame) return;
        frame = 1;
        scheduleFrame(apply);
      }

      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        var x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
        var y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
        metricCards.forEach(function (item) {
          if (item !== card) resetMetricCard(item);
        });
        target.rx = (-y * 9).toFixed(2) + "deg";
        target.ry = (x * 10).toFixed(2) + "deg";
        target.gx = (50 + x * 70).toFixed(2) + "%";
        target.gy = (12 + y * 70).toFixed(2) + "%";
        card.classList.add("is-pointer-active");
        queueApply();
      });

      card.addEventListener("pointerleave", function () {
        target.rx = "5deg";
        target.ry = "var(--metric-tilt)";
        target.gx = "50%";
        target.gy = "0%";
        resetMetricCard(card);
      });
    });
  }

  function bindChatMouseEffect() {
    var stage = root.querySelector(".chat-preview-stage");
    if (!stage || !canUsePointerEffects) return;

    var frame = 0;
    var target = { x: 0, y: 0 };

    function apply() {
      frame = 0;
      var x = target.x;
      var y = target.y;
      stage.style.setProperty("--chat-x", (x * 18).toFixed(2) + "px");
      stage.style.setProperty("--chat-y", (y * 14).toFixed(2) + "px");
      stage.style.setProperty("--chat-rx", (-y * 5).toFixed(2) + "deg");
      stage.style.setProperty("--chat-ry", (x * 7).toFixed(2) + "deg");
      stage.style.setProperty("--chat-panel-x", (x * 12).toFixed(2) + "px");
      stage.style.setProperty("--chat-panel-y", (y * 10).toFixed(2) + "px");
      stage.style.setProperty("--chat-panel-rx", (-y * 3).toFixed(2) + "deg");
      stage.style.setProperty("--chat-panel-ry", (x * 4).toFixed(2) + "deg");
    }

    function queueApply() {
      if (frame) return;
      frame = 1;
      scheduleFrame(apply);
    }

    stage.addEventListener("pointermove", function (event) {
      var rect = stage.getBoundingClientRect();
      target.x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
      target.y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
      stage.classList.add("is-pointer-active");
      queueApply();
    });

    stage.addEventListener("pointerleave", function () {
      target.x = 0;
      target.y = 0;
      stage.classList.remove("is-pointer-active");
      queueApply();
    });
  }

  updateProgress();
  updateActiveNav();
  bindPreviewMouseEffect();
  bindMetricMouseEffect();
  bindChatMouseEffect();

  var items = Array.prototype.slice.call(root.querySelectorAll("[data-reveal]"));
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (item) { item.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });

  items.forEach(function (item) {
    if (item.getBoundingClientRect().top < window.innerHeight * 0.94) {
      item.classList.add("is-visible");
      return;
    }
    observer.observe(item);
  });
})();
`;

export default function PresentationPage() {
  return (
    <main className="product-landing">
      <div className="landing-progress" data-scroll-progress />

      <header className="product-nav">
        <a className="product-brand" href="/">
          <span className="product-mark" />
          <span className="product-wordmark">
            <span>Smartup</span>
            <span>Guide</span>
          </span>
        </a>
        <nav className="product-links" aria-label="Landing page sections">
          {navItems.map(([label, href, variant]) => (
            <a className={variant === "product" ? "has-chevron" : undefined} data-nav-link href={href} key={label}>
              {label}
              {variant === "product" ? <i className="nav-chevron fa-solid fa-chevron-down" aria-hidden="true" /> : null}
            </a>
          ))}
        </nav>
        <div className="product-nav-actions">
          <a href="/login">Log in</a>
          <a className="product-button primary small" href="/demo">
            Open demo <i className="button-arrow fa-solid fa-arrow-right-long" aria-hidden="true" />
          </a>
        </div>
      </header>

      <section className="product-hero">
        <div className="product-hero-copy" data-reveal>
          <h1>
            Guide users inside the <span>workflow</span>
          </h1>
          <p>
            An AI assistant that answers from your knowledge base, points to the right control, and keeps
            every step inside the product.
          </p>
          <div className="product-hero-actions">
            <a className="product-button primary" href="/demo">
              Open demo <i className="button-arrow fa-solid fa-arrow-right-long" aria-hidden="true" />
            </a>
            <a className="product-button" href="/admin">
              <i className="button-shield fa-solid fa-gauge-high" aria-hidden="true" />
              Admin console
            </a>
          </div>
          <div className="hero-metrics" aria-label="Smartup Guide metrics">
            {heroMetrics.map(([icon, value, label]) => (
              <div className="hero-metric" key={label}>
                <i className={`hero-metric-icon fa-solid ${icon}`} aria-hidden="true" />
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="product-hero-art" data-reveal>
          <div className="hero-live-preview" aria-label="Animated Smartup Guide product preview">
            <div className="preview-orbit orbit-one" aria-hidden="true" />
            <div className="preview-orbit orbit-two" aria-hidden="true" />

            <div className="preview-panel preview-knowledge" aria-hidden="true">
              <div className="preview-panel-head">
                <i className="preview-mini-icon fa-solid fa-database" />
                <strong>Knowledge base</strong>
              </div>
              <span className="preview-search">Search articles...</span>
              <ul>
                <li><span /> Getting started</li>
                <li><span /> Account & billing</li>
                <li><span /> Integrations</li>
              </ul>
            </div>

            <div className="preview-panel preview-admin" aria-hidden="true">
              <div className="preview-panel-head">
                <i className="preview-mini-icon fa-solid fa-gauge-high" />
                <strong>Admin console</strong>
              </div>
              <div className="preview-stat">
                <small>Total conversations</small>
                <strong>24,578</strong>
              </div>
              <div className="preview-line-chart">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="preview-bars">
                <i />
                <i />
                <i />
              </div>
            </div>

            <div className="preview-panel preview-chat" aria-hidden="true">
              <div className="preview-panel-head">
                <span className="product-mark small-mark" />
                <strong>Smartup Guide</strong>
              </div>
              <p className="preview-user">How do I connect my domain?</p>
              <p className="preview-answer">Settings -&gt; Domains. I can show the next click.</p>
            </div>

            <div className="preview-robot-stage">
              <span className="preview-glow" aria-hidden="true" />
              <img className="preview-robot preview-robot-talking" src="/robot/talking.png" alt="Smartup Guide robot assistant" />
              <img className="preview-robot preview-robot-pointing" src="/robot/pointing.png" alt="" aria-hidden="true" />
              <img className="preview-robot preview-robot-thinking" src="/robot/thinking.png" alt="" aria-hidden="true" />
              <img className="preview-robot preview-robot-success" src="/robot/success.png" alt="" aria-hidden="true" />
            </div>

            <div className="preview-pointer" aria-hidden="true">
              <i className="preview-pointer-icon fa-solid fa-location-arrow" />
              Points to the next control
            </div>
          </div>
        </div>
      </section>

      <section className="feature-band" id="features">
        <div className="feature-band-heading" data-reveal>
          <h2>Everything your team needs to support at scale</h2>
        </div>
        <div className="feature-card-strip">
          {featureCards.map((item) => (
            <article className="feature-tile" data-reveal key={item.title}>
              <i className={`feature-icon fa-solid ${item.icon}`} aria-hidden="true" />
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-title" data-reveal>
          <h2>How it works</h2>
          <p>Four practical steps take the assistant from knowledge source to live guided help.</p>
        </div>
        <div className="workflow-track" data-reveal>
          {workflowSteps.map((step, index) => (
            <article className={`workflow-step step-${step.tone}`} key={step.title}>
              <div className="workflow-step-top">
                <span className="workflow-number">{index + 1}</span>
                <i className={`workflow-step-icon fa-solid ${step.icon}`} aria-hidden="true" />
              </div>
              <small>{step.meta}</small>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="preview-section" id="admin-preview">
        <div className="section-title" data-reveal>
          <h2>Admin console that stays operational.</h2>
          <p>
            The workspace puts knowledge, provider state, install snippets, project settings, and events on
            one scannable screen.
          </p>
        </div>
        <div className="landing-admin-preview" data-reveal>
          <aside>
            <strong>Smartup Guide</strong>
            <a className="active">Knowledge base</a>
            <a>Provider</a>
            <a>Widget install</a>
            <a>Project settings</a>
            <a>Events</a>
          </aside>
          <div className="admin-preview-main">
            <div className="preview-table">
              <div className="preview-heading">
                <h3>Knowledge base</h3>
                <button type="button">Add document</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell) => (
                        <td key={cell}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="preview-grid">
              <div>
                <h3>Provider</h3>
                {providerRows.map(([provider, model, status]) => (
                  <p key={provider}>
                    <span>{provider}</span>
                    <strong>{model}</strong>
                    <em>{status}</em>
                  </p>
                ))}
              </div>
              <code>{'<script src="/widget/loader.js" data-project-id="YOUR_PROJECT_ID"></script>'}</code>
            </div>
          </div>
        </div>
      </section>

      <section className="chat-preview-section" id="chat-preview">
        <div className="chat-preview-copy" data-reveal>
          <h2>Chat that feels like part of the product.</h2>
          <p>
            The widget keeps the robot friendly, the messages readable, and the step controls close to the
            action, without taking over the page.
          </p>
          <a className="product-button primary" href="/demo">
            Test the widget
          </a>
        </div>
        <div className="chat-preview-stage" data-reveal>
          <div className="chat-stage-orbit orbit-one" aria-hidden="true" />
          <div className="chat-stage-orbit orbit-two" aria-hidden="true" />
          <div className="chat-context-card chat-context-knowledge" aria-hidden="true">
            <span>Knowledge match</span>
            <strong>Team settings</strong>
          </div>
          <div className="chat-context-card chat-context-action" aria-hidden="true">
            <span>Next action</span>
            <strong>Open Team screen</strong>
          </div>
          <img className="chat-robot-cutout" src="/robot/talking.png" alt="" aria-hidden="true" />
          <div className="landing-chat-window">
            <div className="chat-titlebar">
              <span className="product-mark small-mark" />
              <strong>Smartup Guide</strong>
              <button type="button" aria-label="Minimize preview">
                <i className="fa-solid fa-minus" aria-hidden="true" />
              </button>
            </div>
            <div className="chat-body">
              <p className="assistant-message">Hi. How can I help you today?</p>
              <p className="user-message">How do I add a team member?</p>
              <div className="assistant-card">
                <strong>Follow these steps</strong>
                <ol>
                  <li>Go to Settings, then Team.</li>
                  <li>Click Add member.</li>
                  <li>Enter email and role.</li>
                </ol>
              </div>
            </div>
            <div className="chat-controls">
              <span>Step 1 of 3</span>
              <button type="button">Next</button>
              <button type="button">Done</button>
            </div>
            <form className="chat-input-preview">
              <input aria-label="Chat question preview" placeholder="Ask a question..." />
              <button type="button">Send</button>
            </form>
          </div>
        </div>
      </section>

      <section className="landing-cta" data-reveal>
        <div>
          <h2>Connect knowledge, tune the widget, and ship guided help.</h2>
          <p>Use the admin workspace to manage identity, provider settings, install snippets, and documents.</p>
        </div>
        <a className="product-button primary" href="/admin">
          Open admin console
        </a>
      </section>

      <Script id="product-landing" strategy="afterInteractive">
        {landingScript}
      </Script>
    </main>
  );
}
