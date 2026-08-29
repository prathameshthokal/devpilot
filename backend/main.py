import os
import json
import httpx
import base64
import subprocess
import tempfile
import shutil
import uuid
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
        plan_data = json.loads(raw_text, strict=False)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": raw_text}

    return {
        "task": request.task,
        "relevant_files": plan_data.get("relevant_files", []),
        "plan": plan_data.get("plan", []),
    }


class CodeRequest(BaseModel):
    user_id: str
    owner: str
    repo: str
    task: str
    relevant_files: list[str]
    plan: list[str]


@app.post("/code")
async def generate_code(request: CodeRequest):
    session = user_sessions.get(request.user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]

    file_contents = {}
    async with httpx.AsyncClient() as client:
        for path in request.relevant_files:
            file_response = await client.get(
                f"https://api.github.com/repos/{request.owner}/{request.repo}/contents/{path}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            file_data = file_response.json()

            if "content" not in file_data:
                file_contents[path] = ""
                continue

            decoded = base64.b64decode(file_data["content"]).decode("utf-8", errors="replace")
            file_contents[path] = decoded

    files_section = ""
    for path, content in file_contents.items():
        files_section += f"\n--- FILE: {path} ---\n{content}\n--- END FILE ---\n"

    prompt = f"""You are a senior software engineer's Coding Agent.

Task: "{request.task}"

Implementation plan already agreed:
{chr(10).join(f"- {step}" for step in request.plan)}

Current content of the relevant files:
{files_section}

Write the COMPLETE updated content for each file that needs to change, implementing the task and plan above.
Do not skip unchanged parts of a file — always return the FULL file content, not a diff or partial snippet.
Only include files that actually need changes.

Respond ONLY with valid JSON in this exact format, nothing else, no markdown fences:
{{
  "files": [
    {{
      "path": "exact/file/path.py",
      "new_content": "the complete new file content as a string"
    }}
  ],
  "summary": "One or two sentence summary of what changed"
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
        code_data = json.loads(raw_text, strict=False)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": raw_text}

    results = []
    for f in code_data.get("files", []):
        path = f.get("path")
        results.append({
            "path": path,
            "old_content": file_contents.get(path, ""),
            "new_content": f.get("new_content", ""),
        })

    return {
        "task": request.task,
        "summary": code_data.get("summary", ""),
        "files": results,
    }
class FileChange(BaseModel):
    path: str
    new_content: str


class TestRequest(BaseModel):
    user_id: str
    owner: str
    repo: str
    files: list[FileChange]


@app.post("/test")
async def run_tests(request: TestRequest):
    session = user_sessions.get(request.user_id)
    if not session:
        return {"error": "User not found. Please log in again."}

    access_token = session["access_token"]
    temp_dir = tempfile.mkdtemp(prefix="devpilot_")
    image_name = f"devpilot-test-{uuid.uuid4().hex[:8]}"

    try:
        # Step 1: Clone a fresh copy of the repo into the temp folder
        clone_url = f"https://{access_token}@github.com/{request.owner}/{request.repo}.git"
        clone_result = subprocess.run(
            ["git", "clone", "--depth", "1", clone_url, temp_dir],
            capture_output=True, text=True, timeout=60,
        )
        if clone_result.returncode != 0:
            return {"error": "Failed to clone repo", "details": clone_result.stderr}

        # Step 2: Apply the AI-generated file changes on top of the fresh clone
        for f in request.files:
            file_path = os.path.join(temp_dir, f.path)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as out:
                out.write(f.new_content)

        # Step 3: Write a Dockerfile that installs deps (if any) and runs pytest
        dockerfile_content = """FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN find . -name "requirements.txt" -exec pip install --no-cache-dir -r {} \\; || true
RUN pip install --no-cache-dir pytest
CMD ["pytest", "--maxfail=5", "-q"]
"""
        with open(os.path.join(temp_dir, "Dockerfile"), "w") as f:
            f.write(dockerfile_content)

        # Step 4: Build the Docker image
        build_result = subprocess.run(
            ["docker", "build", "-t", image_name, temp_dir],
            capture_output=True, text=True, timeout=300,
        )
        if build_result.returncode != 0:
            return {"error": "Docker build failed", "details": build_result.stderr[-3000:]}

        # Step 5: Run the tests inside the container
        run_result = subprocess.run(
            ["docker", "run", "--rm", image_name],
            capture_output=True, text=True, timeout=120,
        )

        output = run_result.stdout + run_result.stderr
        exit_code = run_result.returncode

        if exit_code == 0:
            status = "passed"
        elif exit_code == 5:
            status = "no_tests_found"
        else:
            status = "failed"

        return {
            "status": status,
            "exit_code": exit_code,
            "output": output[-5000:],
        }

    except subprocess.TimeoutExpired:
        return {"error": "Operation timed out"}
    finally:
        # Step 6: Clean up — remove the temp clone and the Docker image
        shutil.rmtree(temp_dir, ignore_errors=True)
        subprocess.run(["docker", "rmi", "-f", image_name], capture_output=True)