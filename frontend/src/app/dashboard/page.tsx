"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type GithubUser = { username: string; avatar_url: string };
type Repo = { name: string; full_name: string; private: boolean; default_branch: string };
type FileEntry = { path: string; type: "blob" | "tree" };
type PlanResult = { task: string; relevant_files: string[]; plan: string[] };
type CodeFile = { path: string; old_content: string; new_content: string };
type CodeResult = { task: string; summary: string; files: CodeFile[] };
type TestResult = { status: "passed" | "failed" | "no_tests_found"; exit_code: number; output: string };
type PRResult = { pr_url: string; pr_number: number; branch: string };
type StageStatus = "done" | "active" | "pending";

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5v6M4 5c0 3 3 3 6.5 3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function DiffPane({
  label,
  content,
  tint,
}: {
  label: string;
  content: string;
  tint: "remove" | "add";
}) {
  const lines = content.split("\n");
  return (
    <div className={tint === "add" ? "bg-diff-add-bg" : ""}>
      <p
        className={`font-mono text-[10px] tracking-widest px-4 pt-3 pb-2 ${
          tint === "add" ? "text-diff-add" : "text-diff-remove"
        }`}
      >
        {label}
      </p>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="select-none text-right pr-3 pl-4 font-mono text-[11px] text-text-faint align-top w-10">
                  {i + 1}
                </td>
                <td className="font-mono text-xs text-text-dim whitespace-pre pr-4 align-top">
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");

  const [user, setUser] = useState<GithubUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [code, setCode] = useState<CodeResult | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [test, setTest] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [pr, setPr] = useState<PRResult | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`http://localhost:8000/auth/github/user/${userId}`)
      .then((res) => res.json())
      .then((data) => (data.error ? setError(data.error) : setUser(data)))
      .catch(() => setError("Could not reach backend"));
  }, [userId]);

  useEffect(() => {
    if (!userId || !user) return;
    setReposLoading(true);
    fetch(`http://localhost:8000/repos/${userId}`)
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setRepos(data))
      .finally(() => setReposLoading(false));
  }, [userId, user]);

  function resetPipeline() {
    setPlan(null);
    setCode(null);
    setTest(null);
    setPr(null);
    setPlanError(null);
    setCodeError(null);
    setTestError(null);
    setPrError(null);
  }

  function handleSelectRepo(repoName: string) {
    if (!userId || !user) return;
    setSelectedRepo(repoName);
    setFiles([]);
    setTreeError(null);
    setFilesLoading(true);
    setTask("");
    resetPipeline();

    fetch(`http://localhost:8000/repos/${userId}/${user.username}/${repoName}/tree`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setTreeError("No files found — this repository may be empty.");
        else setFiles(data.files || []);
      })
      .catch(() => setTreeError("Couldn't reach the backend."))
      .finally(() => setFilesLoading(false));
  }

  function handleGeneratePlan() {
    if (!userId || !user || !selectedRepo || !task.trim()) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    setCode(null);
    setTest(null);
    setPr(null);

    fetch("http://localhost:8000/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, owner: user.username, repo: selectedRepo, task: task.trim() }),
    })
      .then((res) => res.json())
      .then((data) => (data.error ? setPlanError(data.error) : setPlan(data)))
      .catch(() => setPlanError("Couldn't reach the backend."))
      .finally(() => setPlanLoading(false));
  }

  function handleGenerateCode() {
    if (!userId || !user || !selectedRepo || !plan) return;
    setCodeLoading(true);
    setCodeError(null);
    setCode(null);
    setTest(null);
    setPr(null);

    fetch("http://localhost:8000/code", {
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
    })
      .then((res) => res.json())
      .then((data) => (data.error ? setCodeError(data.error) : setCode(data)))
      .catch(() => setCodeError("Couldn't reach the backend."))
      .finally(() => setCodeLoading(false));
  }

  function handleRunTests() {
    if (!userId || !user || !selectedRepo || !code) return;
    setTestLoading(true);
    setTestError(null);
    setTest(null);

    fetch("http://localhost:8000/test", {
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

    fetch("http://localhost:8000/create-pr", {
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

  const stages: { label: string; status: StageStatus }[] = [
    { label: "Repository", status: selectedRepo ? "done" : "active" },
    { label: "Task", status: plan ? "done" : selectedRepo ? "active" : "pending" },
    { label: "Plan", status: code ? "done" : plan ? "active" : "pending" },
    { label: "Code", status: test || pr ? "done" : code ? "active" : "pending" },
    { label: "Tests", status: pr ? "done" : test ? "done" : code ? "active" : "pending" },
    { label: "Pull Request", status: pr ? "done" : test || code ? "active" : "pending" },
  ];

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border sticky top-0 bg-bg/80 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-lg text-signal">dev</span>
            <span className="font-display text-lg font-medium text-text">pilot</span>
            <span className="w-[2px] h-4 bg-signal cursor-blink ml-0.5" />
          </div>
          {user && (
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-text-dim hidden sm:inline">{user.username}</span>
              <img src={user.avatar_url} alt={user.username} className="w-8 h-8 rounded-full border border-border-strong" />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex gap-10">
        <nav className="hidden md:flex flex-col w-40 shrink-0 pt-2 sticky top-24 self-start">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center text-bg ${
                    stage.status === "done"
                      ? "bg-signal border-signal"
                      : stage.status === "active"
                      ? "border-signal pulse-node"
                      : "border-border-strong"
                  }`}
                >
                  {stage.status === "done" && <IconCheck />}
                </span>
                {i < stages.length - 1 && (
                  <span className={`w-px flex-1 min-h-8 ${stage.status === "done" ? "bg-signal" : "bg-border"}`} />
                )}
              </div>
              <span
                className={`font-mono text-xs pb-8 pt-0.5 ${
                  stage.status === "pending" ? "text-text-faint" : stage.status === "active" ? "text-signal" : "text-text-dim"
                }`}
              >
                {stage.label}
              </span>
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col gap-8">
          <section className="fade-in-up">
            <h2 className="font-display text-sm text-text-dim mb-3 tracking-wide">Choose a repository</h2>
            {reposLoading && <p className="font-mono text-xs text-text-faint">fetching repositories...</p>}
            <div className="grid gap-2">
              {repos.map((repo, i) => (
                <button
                  key={repo.full_name}
                  onClick={() => handleSelectRepo(repo.name)}
                  style={{ animationDelay: `${i * 0.05}s` }}
                  className={`card card-hover fade-in-up text-left px-4 py-3.5 flex items-center justify-between ${
                    selectedRepo === repo.name ? "border-signal!" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-signal shrink-0"><IconFolder /></span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-text truncate">{repo.name}</span>
                        {repo.private && (
                          <span className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-text-dim border border-border shrink-0">
                            <IconLock /> private
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-text-faint">{repo.default_branch}</span>
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
                      <span className="text-text-faint shrink-0">
                        {file.type === "tree" ? <IconFolder /> : <IconFile />}
                      </span>
                      <span className={file.type === "tree" ? "text-text-dim" : "text-text-faint"}>{file.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {selectedRepo && !filesLoading && !treeError && (
            <section className="fade-in-up">
              <h2 className="font-display text-sm text-text-dim mb-3 tracking-wide">Describe the task</h2>
              <div className="card overflow-hidden focus-within:border-border-strong transition-colors">
                <div className="flex px-4 pt-4 gap-2">
                  <span className="font-mono text-signal text-sm select-none">›</span>
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
                    className="px-5 py-2 bg-signal text-bg font-display text-sm font-medium rounded-md hover:bg-signal-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {planLoading ? "Planning..." : "Generate plan"}
                  </button>
                </div>
              </div>
              {planError && <p className="font-mono text-xs text-diff-remove mt-2">{planError}</p>}
            </section>
          )}

          {plan && (
            <section className="card overflow-hidden fade-in-up">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <span className="w-2 h-2 rounded-full bg-signal" />
                <span className="font-mono text-xs text-text-faint">plan</span>
              </div>
              <div className="p-5">
                <p className="font-mono text-xs text-text-faint mb-5">&quot;{plan.task}&quot;</p>

                <p className="font-display text-xs text-text-dim tracking-wide mb-2">Relevant files</p>
                <ul className="font-mono text-xs mb-6 space-y-1.5">
                  {plan.relevant_files.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-signal">
                      <IconFile /> {f}
                    </li>
                  ))}
                </ul>

                <p className="font-display text-xs text-text-dim tracking-wide mb-3">Steps</p>
                <div className="mb-6">
                  {plan.plan.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="w-5 h-5 rounded-full border border-border-strong flex items-center justify-center font-mono text-[10px] text-text-dim shrink-0">
                          {i + 1}
                        </span>
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
                  {codeLoading ? "Writing code..." : "Approve & write code"}
                </button>
                {codeError && <p className="font-mono text-xs text-diff-remove mt-3">{codeError}</p>}
              </div>
            </section>
          )}

          {code && (
            <section className="flex flex-col gap-4 fade-in-up">
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
                <div
                  className={`card p-4 ${
                    test.status === "passed"
                      ? "border-diff-add!"
                      : test.status === "no_tests_found"
                      ? "border-signal!"
                      : "border-diff-remove!"
                  }`}
                >
                  <p className="font-mono text-sm mb-2 text-text flex items-center gap-2">
                    {test.status === "passed" && <IconCheck />}
                    {test.status === "passed" && "tests passed"}
                    {test.status === "no_tests_found" && "no tests found in this repository"}
                    {test.status === "failed" && "tests failed"}
                    <span className="text-text-faint text-xs">exit {test.exit_code}</span>
                  </p>
                  <pre className="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto text-text-dim">
                    {test.output}
                  </pre>
                </div>
              )}

              {pr && (
                <div className="card border-signal! p-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-text mb-1 flex items-center gap-2">
                      <IconBranch /> pull request opened — {pr.branch}
                    </p>
                    <a href={pr.pr_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono text-sm text-signal hover:underline">
                      {pr.pr_url} <IconExternal />
                    </a>
                  </div>
                </div>
              )}

              {code.files.map((file) => (
                <div key={file.path} className="card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border font-mono text-xs text-text-dim">
                    <IconFile /> {file.path}
                  </div>
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
    </main>
  );
}