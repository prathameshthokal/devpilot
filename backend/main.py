import os
import json
import httpx
import google.generativeai as genai
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from pathlib import Path

# Load secrets from backend/.env
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

user_sessions = {}


@app.get("/")
def read_root():
    return {"message": "DevPilot backend is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/auth/github/login")
def github_login():
    github_auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        "&scope=read:user repo"
    )
    return RedirectResponse(github_auth_url)


@app.get("/auth/github/callback")
async def github_callback(code: str):
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

        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        github_user = user_response.json()

    user_id = str(github_user["id"])
    username = github_user["login"]
    avatar_url = github_user["avatar_url"]

    user_sessions[user_id] = {
        "access_token": access_token,
        "username": username,
        "avatar_url": avatar_url,
    }

    return RedirectResponse(
        f"http://localhost:3000/dashboard?user_id={user_id}"
    )


@app.get("/auth/github/user/{user_id}")
def get_user(user_id: str):
    session = user_sessions.get(user_id)
    if not session:
        return {"error": "User not found"}
    return {"username": session["username"], "avatar_url": session["avatar_url"]}


@app.get("/repos/{user_id}")
async def list_repos(user_id: str):
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

    if not isinstance(repos, list):
        return {
            "error": "GitHub did not return a repo list",
            "github_response": repos,
        }

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
    session = user_sessions.get(user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]

    async with httpx.AsyncClient() as client:
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


class PlanRequest(BaseModel):
    user_id: str
    owner: str
    repo: str
    task: str


@app.post("/plan")
async def create_plan(request: PlanRequest):
    session = user_sessions.get(request.user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]

    async with httpx.AsyncClient() as client:
        repo_response = await client.get(
            f"https://api.github.com/repos/{request.owner}/{request.repo}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        repo_data = repo_response.json()
        default_branch = repo_data.get("default_branch", "main")

        branch_response = await client.get(
            f"https://api.github.com/repos/{request.owner}/{request.repo}/branches/{default_branch}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        branch_data = branch_response.json()

        if "commit" not in branch_data:
            return {"error": "Could not fetch branch info", "github_response": branch_data}

        tree_sha = branch_data["commit"]["sha"]

        tree_response = await client.get(
            f"https://api.github.com/repos/{request.owner}/{request.repo}/git/trees/{tree_sha}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"recursive": "1"},
        )
        tree_data = tree_response.json()

    file_paths = [
        item["path"] for item in tree_data.get("tree", []) if item["type"] == "blob"
    ]

    prompt = f"""You are a senior software engineer's Planner Agent.

Task from the developer: "{request.task}"

Here is the full list of files in the repository:
{json.dumps(file_paths, indent=2)}

Based on the task, decide:
1. Which files from the list above are relevant to this task (pick real paths from the list only)
2. A short step-by-step implementation plan (3-7 steps) explaining what changes are needed

Respond ONLY with valid JSON in this exact format, nothing else, no markdown fences:
{{
  "relevant_files": ["path/one.py", "path/two.py"],
  "plan": [
    "Step 1 description",
    "Step 2 description"
  ]
}}
"""

    model = genai.GenerativeModel("gemini-3.6-flash")
    response = model.generate_content(prompt)
    raw_text = response.text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        plan_data = json.loads(raw_text)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": raw_text}

    return {
        "task": request.task,
        "relevant_files": plan_data.get("relevant_files", []),
        "plan": plan_data.get("plan", []),
    }