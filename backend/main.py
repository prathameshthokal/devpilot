import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load secrets from backend/.env
from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")

app = FastAPI()

# Allow the frontend (running on localhost:3000) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary in-memory storage for user sessions (MVP only — replace with a database later)
user_sessions = {}


@app.get("/")
def read_root():
    return {"message": "DevPilot backend is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/auth/github/login")
def github_login():
    # Step 1: Send the user to GitHub's authorization page
    github_auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        "&scope=read:user repo"
    )
    return RedirectResponse(github_auth_url)


@app.get("/auth/github/callback")
async def github_callback(code: str):
    # Step 2: GitHub redirects back here with a temporary "code"
    # We exchange that code for a real access token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")

        if not access_token:
            return {"error": "Failed to get access token", "details": token_data}

        # Step 3: Use the access token to fetch the user's GitHub profile
        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        github_user = user_response.json()

    user_id = str(github_user["id"])
    username = github_user["login"]
    avatar_url = github_user["avatar_url"]

    # Step 4: Store the token + profile server-side (temporary, in-memory)
    user_sessions[user_id] = {
        "access_token": access_token,
        "username": username,
        "avatar_url": avatar_url,
    }

    # Step 5: Redirect back to the frontend dashboard, passing the user id
    return RedirectResponse(
        f"http://localhost:3000/dashboard?user_id={user_id}"
    )


@app.get("/auth/github/user/{user_id}")
def get_user(user_id: str):
    # Lets the frontend fetch profile info using the user_id from the redirect
    session = user_sessions.get(user_id)
    if not session:
        return {"error": "User not found"}
    return {"username": session["username"], "avatar_url": session["avatar_url"]}


@app.get("/repos/{user_id}")
async def list_repos(user_id: str):
    # Uses the stored access token to ask GitHub: "what repos can this user access?"
    session = user_sessions.get(user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user/repos",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"per_page": 100, "sort": "updated"},
        )
        repos = response.json()

    # GitHub can return an error object (e.g. bad/expired token) instead of a list.
    # Guard against that so we don't crash trying to loop over it like a list of repos.
    if not isinstance(repos, list):
        return {
            "error": "GitHub did not return a repo list",
            "github_response": repos,
        }

    # Return only the fields the frontend actually needs
    return [
        {
            "name": repo["name"],
            "full_name": repo["full_name"],
            "private": repo["private"],
            "default_branch": repo["default_branch"],
        }
        for repo in repos
    ]


@app.get("/repos/{user_id}/{owner}/{repo}/tree")
async def get_repo_tree(user_id: str, owner: str, repo: str):
    # Fetches the full file structure of one repo, so agents later know what files exist
    session = user_sessions.get(user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]

    async with httpx.AsyncClient() as client:
        # First get the repo's default branch info to find the latest commit SHA
        repo_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        repo_data = repo_response.json()
        default_branch = repo_data.get("default_branch", "main")

        branch_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/branches/{default_branch}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        branch_data = branch_response.json()

        if "commit" not in branch_data:
            return {
                "error": "Could not fetch branch info from GitHub",
                "github_response": branch_data,
            }

        tree_sha = branch_data["commit"]["sha"]

        # Now get the full recursive file tree using that commit
        tree_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{tree_sha}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"recursive": "1"},
        )
        tree_data = tree_response.json()

    files = [
        {"path": item["path"], "type": item["type"]}
        for item in tree_data.get("tree", [])
    ]

    return {"repo": f"{owner}/{repo}", "file_count": len(files), "files": files}