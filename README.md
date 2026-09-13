# DevPilot

**AI Software Engineering Agent** — describe a task in plain English, and DevPilot reads your repository, plans the change, writes the code, tests it in an isolated sandbox, and opens a real GitHub pull request.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Python](https://img.shields.io/badge/python-3.11-blue)
![Next.js](https://img.shields.io/badge/next.js-16-black)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## What it does

"Add a search bar to filter grocery items by name"
- Planner Agent → reads the repo, picks relevant files, writes a step-by-step plan
- Coder Agent → writes complete, working file changes
- Testing Agent → clones the repo fresh, applies changes, runs tests in an isolated Docker container
- Pull Request → opens a real PR on GitHub with the changes, ready for review

Every stage streams live — you watch the AI plan and write code token by token, not just a loading spinner.

## Features

- **GitHub OAuth** — connect any of your repositories
- **Repository indexing** — browse real file trees, filter/search repos
- **Planner Agent** — Gemini-powered, reads your codebase and proposes a concrete implementation plan
- **Coder Agent** — generates complete, working file changes with a syntax-highlighted before/after diff
- **Docker-sandboxed testing** — every test run happens in a fresh, isolated container, never on your real machine
- **Real pull requests** — DevPilot creates an actual branch, commits, and PR on GitHub
- **Live streaming UI** — watch the AI's output appear in real time

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python) |
| AI | Google Gemini API |
| Sandbox | Docker |
| Auth & Source | GitHub OAuth + REST API |

## Architecture

- frontend/ — Next.js app: dashboard, pipeline UI, streaming console, diff viewer
- backend/ — FastAPI server: OAuth, repo indexing, agent orchestration, Docker sandbox, PR creation

## Getting started

**Prerequisites:** Python 3.11+, Node.js 18+, Docker Desktop, a GitHub OAuth App, a Gemini API key.

Backend setup:
1. cd backend
2. python -m venv venv
3. venv\Scripts\Activate.ps1
4. pip install -r requirements.txt
5. uvicorn main:app --reload

Frontend setup:
1. cd frontend
2. npm install
3. npm run dev

Create backend/.env with:


GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GEMINI_API_KEY=your_gemini_key


Visit http://localhost:3000

## Roadmap

- [ ] Debugger Agent — auto-retry on test failure
- [ ] Reviewer Agent — security/quality checks before PR
- [ ] Persistent sessions (currently in-memory)
- [ ] Multi-repo dashboard

## License

MIT