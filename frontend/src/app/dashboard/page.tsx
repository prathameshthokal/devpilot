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

          <ul className="font-mono text-sm space-y-1">
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
    </main>
  );
}