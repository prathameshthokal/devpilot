"use client";

import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type GithubUser = { username: string; avatar_url: string };
type Repo = {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
};
type FileEntry = { path: string; type: "blob" | "tree" };
type PlanResult = { task: string; relevant_files: string[]; plan: string[] };
type CodeFile = { path: string; old_content: string; new_content: string };
type CodeResult = { task: string; summary: string; files: CodeFile[] };
type TestResult = { status: "passed" | "failed" | "no_tests_found"; exit_code: number; output: string };
type PRResult = { pr_url: string; pr_number: number; branch: string };
type StageStatus = "done" | "active" | "pending";

const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  "C++": "#f34b7d",
  Go: "#00ADD8",
};

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Fixes raw control characters (literal newlines/tabs) inside JSON string
// literals so JSON.parse doesn't choke on them — mirrors Python's strict=False.
function sanitizeJsonText(text: string) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function tryParseJson(raw: string): any | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    const parts = text.split("```");
    text = parts[1] || text;
    if (text.startsWith("json")) text = text.slice(4);
    text = text.trim();
  }
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(sanitizeJsonText(text));
    } catch {
      return null;
    }
  }
}

const KEYWORDS = /\b(def|class|import|from|return|if|else|elif|for|while|try|except|const|let|var|function|async|await|export|default)\b/g;
const STRINGS = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
const COMMENTS = /(#.*$|\/\/.*$)/gm;

function highlightLine(line: string) {
  const matches: { start: number; end: number; cls: string }[] = [];
  for (const m of line.matchAll(COMMENTS)) matches.push({ start: m.index!, end: m.index! + m[0].length, cls: "text-text-faint" });
  for (const m of line.matchAll(STRINGS)) matches.push({ start: m.index!, end: m.index! + m[0].length, cls: "text-diff-add" });
  for (const m of line.matchAll(KEYWORDS)) matches.push({ start: m.index!, end: m.index! + m[0].length, cls: "text-accent-2" });

  matches.sort((a, b) => a.start - b.start);
  const filtered: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  const tokens: { text: string; cls: string }[] = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor) tokens.push({ text: line.slice(cursor, m.start), cls: "" });
    tokens.push({ text: line.slice(m.start, m.end), cls: m.cls });
    cursor = m.end;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), cls: "" });
  return tokens.length ? tokens : [{ text: line || " ", cls: "" }];
}

function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.2 1.5h6.2a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 1.5h5.5L12.5 4.5V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12A.5.5 0 0 1 4 1.5Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconExternal() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M6.5 3H13v6.5M13 3 3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBranch() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5v6M4 5c0 3 3 3 6.5 3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5h12v8H6.5l-3 3v-3H2v-8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="2.5" cy="4" r="0.9" fill="currentColor" />
      <circle cx="2.5" cy="8" r="0.9" fill="currentColor" />
      <circle cx="2.5" cy="12" r="0.9" fill="currentColor" />
      <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M5 4 1 8l4 4M11 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2 4.75 8 8l6-3.25M8 8v6.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconDot() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m14 14-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DiffPane({ label, content, tint }: { label: string; content: string; tint: "remove" | "add" }) {
  const lines = content.split("\n");
  return (
    <div className={tint === "add" ? "bg-diff-add-bg" : ""}>
      <p className={`font-mono text-[10px] tracking-widest px-4 pt-3 pb-2 ${tint === "add" ? "text-diff-add" : "text-diff-remove"}`}>
        {label}
      </p>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="select-none text-right pr-3 pl-4 font-mono text-[11px] text-text-faint align-top w-10">{i + 1}</td>
                <td className="font-mono text-xs whitespace-pre pr-4 align-top">
                  {highlightLine(line).map((tok, j) => (
                    <span key={j} className={tok.cls || "text-text-dim"}>{tok.text}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Live streaming console — shows raw text appearing token by token
function StreamConsole({ text, label }: { text: string; label: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [text]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="w-2 h-2 rounded-full bg-signal pulse-node" />
        <span className="font-mono text-xs text-text-faint">{label}</span>
      </div>
      <div className="p-4 max-h-72 overflow-y-auto">
        <pre className="font-mono text-[11px] text-text-dim whitespace-pre-wrap leading-relaxed">
          {text}
          <span className="cursor-blink text-signal">▍</span>
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");

  const [user, setUser] = useState<GithubUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState("");

  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planStream, setPlanStream] = useState("");

  const [code, setCode] = useState<CodeResult | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeStream, setCodeStream] = useState("");

  const [test, setTest] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [pr, setPr] = useState<PRResult | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/github/user/${userId}`)
      .then((res) => res.json())
      .then((data) => (data.error ? setError(data.error) : setUser(data)))
      .catch(() => setError("Could not reach backend"));
  }, [userId]);

  useEffect(() => {
    if (!userId || !user) return;
    setReposLoading(true);
    setReposError(null);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/repos/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRepos(data);
        else setReposError(data.error || "Couldn't load repositories.");
      })
      .catch(() => setReposError("Couldn't reach the backend."))
      .finally(() => setReposLoading(false));
  }, [userId, user]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  function resetPipeline() {
    setPlan(null);
    setCode(null);
    setTest(null);
    setPr(null);
    setPlanError(null);
    setCodeError(null);
    setTestError(null);
    setPrError(null);
    setPlanStream("");
    setCodeStream("");
  }

  function handleSelectRepo(repoName: string) {
    if (!userId || !user) return;
    setSelectedRepo(repoName);
    setFiles([]);
    setTreeError(null);
    setFilesLoading(true);
    setTask("");
    resetPipeline();

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/repos/${userId}/${user.username}/${repoName}/tree`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setTreeError("No files found — this repository may be empty.");
        else setFiles(data.files || []);
      })
      .catch(() => setTreeError("Couldn't reach the backend."))
      .finally(() => setFilesLoading(false));
  }

  async function handleGeneratePlan() {
    if (!userId || !user || !selectedRepo || !task.trim()) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    setCode(null);
    setTest(null);
    setPr(null);
    setPlanStream("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plan/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, owner: user.username, repo: selectedRepo, task: task.trim() }),
      });

      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setPlanStream(full);
      }

      if (full.startsWith("ERROR:")) {
        setPlanError(full.replace("ERROR:", "").trim());
        return;
      }

      const parsed = tryParseJson(full);
      if (!parsed) {
        setPlanError("Failed to parse AI response");
        return;
      }
      setPlan({
        task: task.trim(),
        relevant_files: parsed.relevant_files || [],
        plan: parsed.plan || [],
      });
    } catch {
      setPlanError("Couldn't reach the backend.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleGenerateCode() {
    if (!userId || !user || !selectedRepo || !plan) return;
    setCodeLoading(true);
    setCodeError(null);
    setCode(null);
    setTest(null);
    setPr(null);
    setCodeStream("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/code/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          owner: user.username,
          repo: selectedRepo,
          task: plan.task,
          relevant_files: plan.relevant_files,
          plan: plan.plan,
        }),
      });

      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;

        // Strip the hidden @@FILES@@...@@ENDFILES@@ prefix from what's displayed
        const endMarker = "@@ENDFILES@@\n";
        const endIdx = full.indexOf(endMarker);
        const display = endIdx >= 0 ? full.slice(endIdx + endMarker.length) : "";
        setCodeStream(display);
      }

      if (full.startsWith("ERROR:")) {
        setCodeError(full.replace("ERROR:", "").trim());
        return;
      }

      const endMarker = "@@ENDFILES@@\n";
      const startMarker = "@@FILES@@";
      const endIdx = full.indexOf(endMarker);
      let fileContents: Record<string, string> = {};
      let jsonPart = full;

      if (full.startsWith(startMarker) && endIdx >= 0) {
        const filesJson = full.slice(startMarker.length, endIdx);
        try {
          fileContents = JSON.parse(filesJson);
        } catch {
          fileContents = {};
        }
        jsonPart = full.slice(endIdx + endMarker.length);
      }

      const parsed = tryParseJson(jsonPart);
      if (!parsed) {
        console.log("RAW JSON PART THAT FAILED:", jsonPart);
        setCodeError("Failed to parse AI response — check browser console for raw text");
        return;
      }

      const resultFiles: CodeFile[] = (parsed.files || []).map((f: any) => ({
        path: f.path,
        old_content: fileContents[f.path] || "",
        new_content: f.new_content || "",
      }));

      setCode({
        task: plan.task,
        summary: parsed.summary || "",
        files: resultFiles,
      });
    } catch {
      setCodeError("Couldn't reach the backend.");
    } finally {
      setCodeLoading(false);
    }
  }

  function handleRunTests() {
    if (!userId || !user || !selectedRepo || !code) return;
    setTestLoading(true);
    setTestError(null);
    setTest(null);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        owner: user.username,
        repo: selectedRepo,
        files: code.files.map((f) => ({ path: f.path, new_content: f.new_content })),
      }),
    })
      .then((res) => res.json())
      .then((data) => (data.error ? setTestError(data.error) : setTest(data)))
      .catch(() => setTestError("Couldn't reach the backend."))
      .finally(() => setTestLoading(false));
  }

  function handleCreatePR() {
    if (!userId || !user || !selectedRepo || !code) return;
    setPrLoading(true);
    setPrError(null);
    setPr(null);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/create-pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        owner: user.username,
        repo: selectedRepo,
        task: code.task,
        summary: code.summary,
        files: code.files.map((f) => ({ path: f.path, new_content: f.new_content })),
      }),
    })
      .then((res) => res.json())
      .then((data) => (data.error ? setPrError(data.error) : setPr(data)))
      .catch(() => setPrError("Couldn't reach the backend."))
      .finally(() => setPrLoading(false));
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center px-4">
        <p className="text-text-dim font-mono text-sm">No session found — please sign in first.</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center px-4">
        <p className="text-diff-remove font-mono text-sm">{error}</p>
      </main>
    );
  }

  const stages: { label: string; status: StageStatus; icon: React.ReactNode }[] = [
    { label: "Repository", status: selectedRepo ? "done" : "active", icon: <IconFolder /> },
    { label: "Task", status: plan ? "done" : selectedRepo ? "active" : "pending", icon: <IconMessage /> },
    { label: "Plan", status: code ? "done" : plan ? "active" : "pending", icon: <IconList /> },
    { label: "Code", status: test || pr ? "done" : code ? "active" : "pending", icon: <IconCode /> },
    { label: "Tests", status: pr ? "done" : test ? "done" : code ? "active" : "pending", icon: <IconBox /> },
    { label: "Pull Request", status: pr ? "done" : test || code ? "active" : "pending", icon: <IconBranch /> },
  ];

  const currentStage = stages.find((s) => s.status === "active")?.label ?? (pr ? "Complete" : "Repository");

  return (
    <main className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.1] blur-[140px] pointer-events-none" style={{ background: "var(--color-signal)" }} />
      <div className="absolute top-[600px] left-0 w-[450px] h-[450px] rounded-full opacity-[0.09] blur-[130px] pointer-events-none" style={{ background: "var(--color-accent-2)" }} />
      <div className="absolute top-[1400px] right-0 w-[400px] h-[400px] rounded-full opacity-[0.08] blur-[130px] pointer-events-none" style={{ background: "var(--color-signal)" }} />

      <header className="border-b border-border sticky top-0 bg-bg/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-0.5">
              <span className="font-mono text-lg text-signal">dev</span>
              <span className="font-display text-lg font-medium text-text">pilot</span>
              <span className="w-[2px] h-4 bg-signal cursor-blink ml-0.5" />
            </div>
            <span className="w-px h-4 bg-border hidden sm:block" />
            <span className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-text-faint">
              <span className="w-1.5 h-1.5 rounded-full bg-diff-add" />
              GitHub connected
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-text-dim hidden sm:inline">{user.username}</span>
              <img src={user.avatar_url} alt={user.username} className="w-8 h-8 rounded-full border border-border-strong" />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 relative">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 fade-in-up">
          <div className="card px-5 py-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center text-signal shrink-0" style={{ background: "linear-gradient(135deg, var(--color-signal-soft), transparent)" }}>
              <IconGrid />
            </span>
            <div>
              <p className="font-display text-xl text-text leading-none">{reposLoading ? "—" : repos.length}</p>
              <p className="font-mono text-[10px] text-text-faint mt-1">repositories connected</p>
            </div>
          </div>
          <div className="card px-5 py-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center text-accent-2 shrink-0" style={{ background: "linear-gradient(135deg, var(--color-accent-2-soft), transparent)" }}>
              <IconDot />
            </span>
            <div>
              <p className="font-display text-xl text-text leading-none">{currentStage}</p>
              <p className="font-mono text-[10px] text-text-faint mt-1">current pipeline stage</p>
            </div>
          </div>
          <div className="card px-5 py-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center text-diff-add shrink-0" style={{ background: "linear-gradient(135deg, var(--color-diff-add-bg), transparent)" }}>
              <IconBox />
            </span>
            <div>
              <p className="font-display text-xl text-text leading-none">Isolated</p>
              <p className="font-mono text-[10px] text-text-faint mt-1">docker sandbox, per run</p>
            </div>
          </div>
        </div>

        <div className="flex gap-10">
          <nav className="hidden md:block w-56 shrink-0 sticky top-24 self-start fade-in-up">
            <div className="card p-2">
              <p className="font-mono text-[10px] text-text-faint px-3 pt-2 pb-3 tracking-widest">PIPELINE</p>
              {stages.map((stage) => (
                <div key={stage.label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 ${stage.status === "active" ? "bg-signal-soft text-signal" : stage.status === "done" ? "text-text-dim" : "text-text-faint"}`}>
                  <span className="shrink-0">{stage.icon}</span>
                  <span className="font-mono text-xs flex-1">{stage.label}</span>
                  {stage.status === "done" && <span className="text-diff-add shrink-0"><IconCheck /></span>}
                  {stage.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-signal pulse-node shrink-0" />}
                </div>
              ))}
            </div>
          </nav>

          <div className="flex-1 min-w-0 flex flex-col gap-10">
            <section className="fade-in-up border-l-2 border-signal pl-6">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono text-signal text-sm">01</span>
                <h2 className="font-display text-2xl text-text tracking-tight">Choose a repository</h2>
              </div>
              <p className="font-mono text-xs text-text-faint mb-4">devpilot will index the file structure of whichever repo you pick</p>

              {repos.length > 3 && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg border border-border bg-surface">
                  <span className="text-text-faint"><IconSearch /></span>
                  <input
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Filter repositories..."
                    className="flex-1 bg-transparent font-mono text-xs text-text placeholder-text-faint focus:outline-none"
                  />
                </div>
              )}

              {reposLoading && (
                <div className="flex items-center gap-2 font-mono text-xs text-text-faint mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal pulse-node" />
                  fetching repositories...
                </div>
              )}
              {reposError && <p className="font-mono text-xs text-diff-remove mb-3">{reposError}</p>}

              <div className="grid gap-2">
                {filteredRepos.map((repo, i) => (
                  <button
                    key={repo.full_name}
                    onClick={() => handleSelectRepo(repo.name)}
                    style={{ animationDelay: `${i * 0.05}s` }}
                    className={`card card-hover fade-in-up text-left px-4 py-3.5 flex items-center justify-between ${selectedRepo === repo.name ? "border-signal!" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-lg border border-signal/30 flex items-center justify-center text-signal shrink-0" style={{ background: "linear-gradient(135deg, var(--color-signal-soft), transparent)" }}>
                        <IconFolder />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-text truncate">{repo.name}</span>
                          {repo.private && (
                            <span className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-text-dim border border-border shrink-0">
                              <IconLock /> private
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-text-faint">
                          <span>{repo.default_branch}</span>
                          {repo.language && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full" style={{ background: LANG_COLORS[repo.language] || "var(--color-text-faint)" }} />
                                {repo.language}
                              </span>
                            </>
                          )}
                          {repo.updated_at && (
                            <>
                              <span>·</span>
                              <span>{timeAgo(repo.updated_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-text-faint shrink-0"><IconChevron /></span>
                  </button>
                ))}
              </div>
            </section>

            {selectedRepo && (
              <section className="card overflow-hidden fade-in-up">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <span className="text-text-faint"><IconFolder /></span>
                  <span className="font-mono text-xs text-text-faint">{selectedRepo}</span>
                </div>
                <div className="p-3 max-h-48 overflow-y-auto">
                  {filesLoading && <p className="font-mono text-xs text-text-faint px-1">reading file tree...</p>}
                  {treeError && <p className="font-mono text-xs text-diff-remove px-1">{treeError}</p>}
                  <ul className="font-mono text-xs space-y-1">
                    {files.map((file) => (
                      <li key={file.path} className="flex items-center gap-2 text-text-dim">
                        <span className="text-text-faint shrink-0">{file.type === "tree" ? <IconFolder /> : <IconFile />}</span>
                        <span className={file.type === "tree" ? "text-text-dim" : "text-text-faint"}>{file.path}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {selectedRepo && !filesLoading && !treeError && (
              <section className="fade-in-up border-l-2 border-accent-2 pl-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-accent-2 text-sm">02</span>
                  <h2 className="font-display text-2xl text-text tracking-tight">Describe the task</h2>
                </div>
                <p className="font-mono text-xs text-text-faint mb-5">plain english — devpilot will translate it into a plan</p>
                <div className="card overflow-hidden focus-within:border-accent-2 transition-colors">
                  <div className="flex px-4 pt-4 gap-2">
                    <span className="font-mono text-accent-2 text-sm select-none">›</span>
                    <textarea
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                      placeholder="Add pagination to the products API"
                      rows={3}
                      className="w-full bg-transparent font-mono text-sm text-text placeholder-text-faint resize-none focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end px-4 py-3 mt-1 border-t border-border">
                    <button
                      onClick={handleGeneratePlan}
                      disabled={!task.trim() || planLoading}
                      className="px-5 py-2 bg-accent-2 text-bg font-display text-sm font-medium rounded-md hover:bg-accent-2-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {planLoading ? "Streaming..." : "Generate plan"}
                    </button>
                  </div>
                </div>
                {planError && <p className="font-mono text-xs text-diff-remove mt-2">{planError}</p>}
              </section>
            )}

            {planLoading && <StreamConsole text={planStream} label="planner agent — live output" />}

            {plan && (
              <section className="card overflow-hidden fade-in-up border-l-2! border-signal!">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <span className="w-2 h-2 rounded-full bg-signal" />
                  <span className="font-mono text-xs text-text-faint">plan</span>
                </div>
                <div className="p-5">
                  <p className="font-mono text-xs text-text-faint mb-5">&quot;{plan.task}&quot;</p>
                  <p className="font-display text-xs text-text-dim tracking-wide mb-2">Relevant files</p>
                  <ul className="font-mono text-xs mb-6 space-y-1.5">
                    {plan.relevant_files.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-signal"><IconFile /> {f}</li>
                    ))}
                  </ul>
                  <p className="font-display text-xs text-text-dim tracking-wide mb-3">Steps</p>
                  <div className="mb-6">
                    {plan.plan.map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full border border-border-strong flex items-center justify-center font-mono text-[10px] text-text-dim shrink-0">{i + 1}</span>
                          {i < plan.plan.length - 1 && <span className="w-px flex-1 min-h-4 bg-border" />}
                        </div>
                        <p className="text-sm text-text pb-4">{step}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleGenerateCode}
                    disabled={codeLoading}
                    className="px-5 py-2 bg-signal text-bg font-display text-sm font-medium rounded-md hover:bg-signal-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {codeLoading ? "Streaming..." : "Approve & write code"}
                  </button>
                  {codeError && <p className="font-mono text-xs text-diff-remove mt-3">{codeError}</p>}
                </div>
              </section>
            )}

            {codeLoading && <StreamConsole text={codeStream} label="coder agent — live output" />}

            {code && (
              <section className="flex flex-col gap-4 fade-in-up border-l-2 border-accent-2 pl-6">
                <div className="card p-5">
                  <p className="font-display text-xs text-text-dim tracking-wide mb-2">Summary</p>
                  <p className="text-sm text-text mb-5">{code.summary}</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleRunTests}
                      disabled={testLoading}
                      className="px-5 py-2 border border-border-strong text-text font-display text-sm font-medium rounded-md hover:bg-surface-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {testLoading ? "Running in sandbox..." : "Run tests"}
                    </button>
                    <button
                      onClick={handleCreatePR}
                      disabled={prLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-signal text-bg font-display text-sm font-medium rounded-md hover:bg-signal-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <IconBranch />
                      {prLoading ? "Opening pull request..." : "Create pull request"}
                    </button>
                  </div>
                  {testError && <p className="font-mono text-xs text-diff-remove mt-3">{testError}</p>}
                  {prError && <p className="font-mono text-xs text-diff-remove mt-3">{prError}</p>}
                </div>

                {test && (
                  <div className={`card p-4 ${test.status === "passed" ? "border-diff-add!" : test.status === "no_tests_found" ? "border-signal!" : "border-diff-remove!"}`}>
                    <p className="font-mono text-sm mb-2 text-text flex items-center gap-2">
                      {test.status === "passed" && <IconCheck />}
                      {test.status === "passed" && "tests passed"}
                      {test.status === "no_tests_found" && "no tests found in this repository"}
                      {test.status === "failed" && "tests failed"}
                      <span className="text-text-faint text-xs">exit {test.exit_code}</span>
                    </p>
                    <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto text-text-dim">{test.output}</pre>
                  </div>
                )}

                {pr && (
                  <div className="card border-signal! p-4 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm text-text mb-1 flex items-center gap-2"><IconBranch /> pull request opened — {pr.branch}</p>
                      <a href={pr.pr_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-sm text-signal hover:underline">
                        {pr.pr_url} <IconExternal />
                      </a>
                    </div>
                  </div>
                )}

                {code.files.map((file) => (
                  <div key={file.path} className="card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border font-mono text-xs text-text-dim"><IconFile /> {file.path}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                      <DiffPane label="BEFORE" content={file.old_content || "(new file)"} tint="remove" />
                      <DiffPane label="AFTER" content={file.new_content} tint="add" />
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <p className="font-mono text-sm text-text-faint">loading...</p>
      </main>
    }>
      <DashboardContent />
    </Suspense>
  );
}
