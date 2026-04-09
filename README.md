# interview_copilot

An opinionated AI interview copilot for high-signal technical prep and live interview assistance.

Built as a full-stack system instead of a prompt toy:

- `GLM-5 + structured schemas` for resume / JD parsing
- `Gemini Flash` for low-latency answer generation
- `FastAPI + async SQLAlchemy` for the backend control plane
- `React + Vite + TypeScript` for a fast local demo surface
- `Volcano / MiniMax STT` hooks for spoken interview workflows

## Why This Exists

Most interview tools either:

1. generate generic answers,
2. ignore the candidate's actual background,
3. or break down the moment the interaction becomes real-time.

`interview_copilot` is designed around a different loop:

`resume + JD -> structured context -> interview signal -> grounded answer generation`

The core bet is simple: if the system can compress candidate context and role context into a concise, reliable representation, then the live answer model can spend tokens on reasoning instead of reconstruction.

## System Shape

```text
resume / jd / uploaded files
        ->
FastAPI ingestion + parsing
        ->
GLM-5 structured extraction
        ->
concise interview context
        ->
real-time transcript / question detection
        ->
Gemini Flash response generation
        ->
operator-facing interview copilot UI
```

## Demo Surface

- Workspace for resume / JD analysis
- Interview page for live copilot interaction
- Session persistence for replay and iteration
- Local-first setup for rapid testing before deployment

## Stack

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind + shadcn/ui

### Backend

- FastAPI
- SQLAlchemy async
- SQLite for local dev
- PostgreSQL-ready data layer

### Model / AI Layer

- DashScope-compatible GLM-5 structured extraction
- Google Gemini Flash generation
- Optional STT integrations for voice-driven workflows

## Local Run

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

Backend:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn --env-file .env main:app --host 0.0.0.0 --port 8000
```

See `LOCAL_DEPLOYMENT_GUIDE.md` for the full local setup notes.

## What I’d Highlight In A Tech Interview

- The product is not “just prompting”; it explicitly separates extraction, compression, and generation.
- The backend is structured around typed schemas so model output is operationally usable.
- The UX is optimized for latency and operator flow, not just static report generation.
- The architecture leaves room for swapping models, STT vendors, and storage backends without rewriting the entire app.

## Status

Active prototype. Optimized for local demo, fast iteration, and architectural clarity.
