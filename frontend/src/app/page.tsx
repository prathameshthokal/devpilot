"use client";

import { useEffect, useState } from "react";

const bootLines = [
  "$ devpilot init",
  "→ reading repository...",
  "→ planning changes...",
  "→ writing code...",
  "→ running tests in sandbox...",
  "✓ ready",
];

function IconRepo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.2 1.5h6.2a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9Z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconWand() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14 9 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9 2v2M13 6h2M12 3l1.4-1.4M6 3l-1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2 4.75 8 8l6-3.25M8 8v6.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconGithub() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= bootLines.length) return;
    const delay = visibleLines === 0 ? 500 : 420;
    const t = setTimeout(() => setVisibleLines((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visibleLines]);

  function scrollToAuth() {
    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-bg">
      {/* Floating pill nav */}
      <div className="sticky top-4 z-20 flex justify-center px-4">
        <nav className="flex items-center gap-6 px-5 py-2.5 rounded-full border border-border bg-surface/90 backdrop-blur-sm">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-sm text-signal">dev</span>
            <span className="font-display text-sm font-medium text-text">pilot</span>
          </div>
          <span className="w-px h-4 bg-border" />
          <span className="font-mono text-xs text-text-dim hidden sm:inline">agent</span>
          <span className="font-mono text-xs text-text-dim hidden sm:inline">docs</span>
          <button
            onClick={scrollToAuth}
            className="font-mono text-xs px-3 py-1.5 rounded-full bg-signal text-bg font-medium hover:bg-signal-dim transition-colors"
          >
            Sign in
          </button>
        </nav>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 pt-16 pb-24">
        <div
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.12] blur-[130px] pointer-events-none"
          style={{ background: "var(--color-signal)" }}
        />

        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center relative">
          {/* Left: headline */}
          <div className="flex flex-col gap-6 fade-in-up">
            <span className="font-mono text-xs text-signal border border-signal/40 rounded-full px-3 py-1 w-fit">
              multi-agent · sandboxed · real PRs
            </span>

            <h1 className="font-display text-5xl sm:text-6xl font-medium text-text leading-[1.05]">
              Ship code
              <br />
              without touching
              <br />
              <span className="text-signal">the keyboard.</span>
            </h1>

            <p className="text-text-dim text-base leading-relaxed max-w-md">
              Describe a task in plain English. DevPilot reads your repository,
              plans the change, writes the code, tests it in an isolated
              sandbox, and opens a real pull request.
            </p>

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={scrollToAuth}
                className="flex items-center gap-2 px-6 py-3 bg-signal text-bg font-display font-medium rounded-lg hover:bg-signal-dim hover:scale-[1.02] active:scale-[0.98] transition-all glow-cta"
              >
                Get started <IconArrow />
              </button>
              <span className="font-mono text-xs text-text-faint">
                free · no credit card
              </span>
            </div>

            <div className="flex items-center gap-8 pt-6">
              <div>
                <p className="font-display text-2xl text-text">
                  3<span className="text-text-faint text-base"> hrs</span>
                </p>
                <p className="font-mono text-[10px] text-text-faint">by hand</p>
              </div>
              <IconArrow />
              <div>
                <p className="font-display text-2xl text-signal">
                  4<span className="text-text-faint text-base"> min</span>
                </p>
                <p className="font-mono text-[10px] text-text-faint">with devpilot</p>
              </div>
            </div>
          </div>

          {/* Right: live visual */}
          <div className="relative fade-in-up" style={{ animationDelay: "0.1s" }}>
            <div className="card overflow-hidden hover-float">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
                <span className="ml-2 font-mono text-xs text-text-faint">
                  routes.py
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border">
                <div className="p-3 bg-diff-remove-bg">
                  <p className="font-mono text-[9px] text-diff-remove mb-1.5 tracking-wide">
                    BEFORE
                  </p>
                  <pre className="font-mono text-[10px] text-text-faint whitespace-pre-wrap">
{`def home():
    items = Items.query.all()
    return render_template(
        'home.html',
        items=items
    )`}
                  </pre>
                </div>
                <div className="p-3 bg-diff-add-bg">
                  <p className="font-mono text-[9px] text-diff-add mb-1.5 tracking-wide">
                    AFTER
                  </p>
                  <pre className="font-mono text-[10px] text-text whitespace-pre-wrap">
{`def home():
    q = request.args.get('q','')
    items = Items.query.filter(
        Items.name.ilike(f'%{q}%')
    ).all()
    return render_template(
        'home.html',
        items=items,
        q=q
    )`}
                  </pre>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-border font-mono text-xs text-text-dim">
                &quot;Add a search bar to filter items by name&quot;
              </div>
            </div>

            {/* Floating PR badge */}
            <div className="absolute -bottom-5 -left-5 card px-4 py-3 flex items-center gap-2 pop-in" style={{ animationDelay: "1.2s" }}>
              <span className="w-5 h-5 rounded-full bg-diff-add flex items-center justify-center text-bg">
                <IconCheck />
              </span>
              <div>
                <p className="font-mono text-xs text-text">pull request opened</p>
                <p className="font-mono text-[10px] text-text-faint">devpilot/a1b2c3d4</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 fade-in-up" style={{ animationDelay: "0.2s" }}>
        <div className="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden">
          <div className="flex flex-col gap-2 px-6 py-6">
            <span className="text-signal"><IconRepo /></span>
            <p className="font-display text-sm text-text">Reads your repo</p>
            <p className="font-mono text-xs text-text-faint leading-relaxed">
              Understands your real file structure before touching anything.
            </p>
          </div>
          <div className="flex flex-col gap-2 px-6 py-6">
            <span className="text-signal"><IconWand /></span>
            <p className="font-display text-sm text-text">Plans & writes code</p>
            <p className="font-mono text-xs text-text-faint leading-relaxed">
              A step-by-step plan, then complete, working file changes.
            </p>
          </div>
          <div className="flex flex-col gap-2 px-6 py-6">
            <span className="text-signal"><IconBox /></span>
            <p className="font-display text-sm text-text">Tests in a sandbox</p>
            <p className="font-mono text-xs text-text-faint leading-relaxed">
              Runs in an isolated Docker container before anything ships.
            </p>
          </div>
        </div>
      </section>

      {/* Auth card */}
      <section id="auth" className="flex items-center justify-center px-4 pb-24">
        <div className="w-full max-w-md">
          <div className="card overflow-hidden fade-in-up">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
              <span className="ml-2 font-mono text-xs text-text-faint">devpilot / auth</span>
            </div>

            <div className="px-6 pt-5 pb-2 font-mono text-xs space-y-1.5 min-h-[104px]">
              {bootLines.slice(0, visibleLines).map((line, i) => (
                <p
                  key={i}
                  className={
                    i === bootLines.length - 1
                      ? "text-diff-add pop-in inline-block"
                      : line.startsWith("$")
                      ? "text-text"
                      : "text-text-faint"
                  }
                >
                  {line}
                  {i === visibleLines - 1 && i !== bootLines.length - 1 && (
                    <span className="cursor-blink">▍</span>
                  )}
                </p>
              ))}
            </div>

            <div className="px-8 pb-10 pt-4 flex flex-col items-center text-center gap-6">
              <a
                href="http://localhost:8000/auth/github/login"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-signal text-bg font-display font-medium rounded-lg hover:bg-signal-dim hover:scale-[1.02] active:scale-[0.98] transition-all glow-cta"
              >
                <IconGithub />
                Continue with GitHub
              </a>
              <p className="font-mono text-[11px] text-text-faint">
                read-only until you approve a change
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}