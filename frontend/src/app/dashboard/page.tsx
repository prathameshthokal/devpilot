"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type GithubUser = {
  username: string;
  avatar_url: string;
};

type Repo = {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
};

type FileEntry = {
  path: string;
  type: "blob" | "tree";
};

type PlanResult = {
  task: string;
  relevant_files: string[];
  plan: string[];
};

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

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:8000/auth/github/user/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setUser(data);
        }
      })
      .catch(() => setError("Could not reach backend"));
  }, [userId]);

  useEffect(() => {
    if (!userId || !user) return;

    setReposLoading(true);
    fetch(`http://localhost:8000/repos/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRepos(data);
        }
      })
      .finally(() => setReposLoading(false));
  }, [userId, user]);

  function handleSelectRepo(repoName: string) {
    if (!userId || !user) return;

    setSelectedRepo(repoName);
    setFiles([]);
    setTreeError(null);
    setFilesLoading(true);
    setPlan(null); // reset any previous plan when switching repos

    fetch(`http://localhost:8000/repos/${userId}/${user.username}/${repoName}/tree`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setTreeError("Couldn't load files for this repo (it may be empty).");
        } else {
          setFiles(data.files || []);
        }
      })
      .catch(() => setTreeError("Couldn't reach backend."))
      .finally(() => setFilesLoading(false));
  }

  function handleGeneratePlan() {
    if (!userId || !user || !selectedRepo || !task.trim()) return;

    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);

    fetch("http://localhost:8000/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        owner: user.username,
        repo: selectedRepo,
        task: task.trim(),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setPlanError(data.error);
        } else {
          setPlan(data);
        }
      })
      .catch(() => setPlanError("Couldn't reach backend."))
      .finally(() => setPlanLoading(false));
  }

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-lg">No user found. Please log in first.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-red-500">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center gap-8 py-12 px-4">
      {user ? (
        <div className="flex flex-col items-center gap-2">
          <img
            src={user.avatar_url}
            alt={user.username}
            className="w-20 h-20 rounded-full"
          />
          <h1 className="text-2xl font-bold">Welcome, {user.username} 👋</h1>
        </div>
      ) : (
        <p>Loading profile...</p>
      )}

      <div className="w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-4">Your Repositories</h2>

        {reposLoading && <p className="text-gray-500">Loading repos...</p>}

        <div className="grid gap-3">
          {repos.map((repo) => (
            <button
              key={repo.full_name}
              onClick={() => handleSelectRepo(repo.name)}
              className={`text-left px-4 py-3 rounded-lg border transition ${
                selectedRepo === repo.name
                  ? "border-white bg-gray-800"
                  : "border-gray-700 hover:bg-gray-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{repo.name}</span>
                {repo.private && (
                  <span className="text-xs px-2 py-0.5 rounded bg-yellow-700 text-yellow-100">
                    private
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-500">
                branch: {repo.default_branch}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedRepo && (
        <div className="w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-4">
            Files in {selectedRepo}
          </h2>

          {filesLoading && <p className="text-gray-500">Loading files...</p>}
          {treeError && <p className="text-red-400">{treeError}</p>}

          <ul className="font-mono text-sm space-y-1 max-h-64 overflow-y-auto border border-gray-800 rounded-lg p-3">
            {files.map((file) => (
              <li
                key={file.path}
                className={file.type === "tree" ? "text-blue-400" : "text-gray-300"}
              >
                {file.type === "tree" ? "📁" : "📄"} {file.path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Task input + Planner Agent trigger */}
      {selectedRepo && !filesLoading && !treeError && (
        <div className="w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-4">Describe a task</h2>

          <div className="flex flex-col gap-3">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder='e.g. "Add pagination to the products API"'
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 resize-none"
            />

            <button
              onClick={handleGeneratePlan}
              disabled={!task.trim() || planLoading}
              className="self-start px-6 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {planLoading ? "Thinking..." : "Generate Plan"}
            </button>
          </div>

          {planError && <p className="text-red-400 mt-3">{planError}</p>}
        </div>
      )}

      {/* Plan result */}
      {plan && (
        <div className="w-full max-w-2xl border border-gray-700 rounded-lg p-5">
          <h2 className="text-xl font-semibold mb-2">📋 Implementation Plan</h2>
          <p className="text-gray-400 mb-4 italic">&quot;{plan.task}&quot;</p>

          <h3 className="font-medium mb-2">Relevant files:</h3>
          <ul className="font-mono text-sm mb-4 space-y-1">
            {plan.relevant_files.map((f) => (
              <li key={f} className="text-blue-400">📄 {f}</li>
            ))}
          </ul>

          <h3 className="font-medium mb-2">Steps:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            {plan.plan.map((step, i) => (
              <li key={i} className="text-gray-200">{step}</li>
            ))}
          </ol>
        </div>
      )}
    </main>
  );
}