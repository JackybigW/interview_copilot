# interview_copilot

An AI interview copilot built for one job: turn candidate context into better interview performance in real time.

Not a chatbot demo.
Not a resume prettifier.
Not a generic “answer generator”.

This project is a full-stack system that ingests messy candidate inputs, structures them into usable interview context, and uses that context to support live technical interview response generation.

## Product Thesis

Most interview products fail for the same reason: they treat the interview as a standalone prompt.

That misses the actual problem.

Interview quality is downstream of context quality.

If the system does not understand:

- what the candidate has actually done,
- what the role actually requires,
- what signal the interviewer is trying to extract,

then the generated answer is usually high-fluency, low-value output.

`interview_copilot` is built around a different loop:

```text
resume + jd + transcript
        ->
structured understanding
        ->
compressed interview context
        ->
live response generation
```

The bet is simple:

better context in -> better reasoning out.

## What It Does

### 1. Resume / JD understanding

The system parses resumes and job descriptions into structured schemas instead of leaving them as raw text blobs.

That makes the candidate profile operational:

- skills become queryable
- projects become explicit
- experience becomes compressible
- interview focus areas become derivable

### 2. Context compression

Structured data is converted into concise interview-ready context.

This matters because live systems cannot afford to waste latency and tokens reconstructing background every turn.

### 3. Live interview assistance

During the interview loop, the app can consume transcript signal and generate grounded answers with the candidate and role already loaded into context.

### 4. Session memory

Interview sessions are persisted so flows can be replayed, inspected, and iterated on.

That now includes:

- optional `company` and `job title` metadata before interview start
- a preflight warning when resume or JD is missing
- persisted history labels with inline rename

## Why This Is Interesting

This project is not just “LLM on top of a form”.

It has a real system boundary between:

- extraction
- schema validation
- context building
- live generation
- session persistence

That separation is deliberate.

It makes the stack easier to reason about, cheaper to evolve, and more robust when models or vendors change.

## Architecture

```text
candidate inputs
  - resume text / file
  - job description
  - live transcript

        ->

FastAPI backend
  - upload / parsing
  - orchestration
  - session APIs

        ->

structured extraction layer
  - Gemini Flash
  - typed Pydantic schemas

        ->

context layer
  - concise interview context
  - candidate / role grounding

        ->

generation layer
  - Gemini Flash
  - live answer generation

        ->

React operator surface
  - workspace
  - interview session UI
  - session history
  - session metadata + rename
```

## Stack

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind
- shadcn/ui

### Backend

- FastAPI
- async SQLAlchemy
- SQLite for local dev
- PostgreSQL-ready data layer

### AI Layer

- Gemini Flash for structured resume / JD extraction and iterative analysis refinement
- Gemini Flash for live answer generation
- optional Volcano / MiniMax STT integrations

## Demo Story

If I were demoing this in a final-round founder conversation, I would frame it like this:

1. Raw candidate data is noisy.
2. Interviews are high-pressure, low-latency environments.
3. So the right abstraction is not “chat”, it is “context infrastructure for interview performance”.

That is what this repo is trying to build.

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

Create `backend/.env` with the current model keys before starting the API:

```env
GOOGLE_API_KEY=your-google-ai-studio-key
GEMINI_API_KEY=your-google-ai-studio-key
DATABASE_URL=sqlite+aiosqlite:///./interview_copilot.db
```

`GOOGLE_API_KEY` is used for Gemini Flash structured extraction. `GEMINI_API_KEY` is used for Gemini Flash answer generation.

## What I’d Want A Technical Interviewer To Notice

- The product framing is workflow-first, not model-first.
- Structured extraction is treated as infrastructure, not UI garnish.
- The system is built to reduce token waste and latency during live interaction.
- The architecture is modular enough to swap models, prompts, or STT vendors without rewriting the whole application.
- The candidate experience and operator experience are both part of the design surface.

## Current Status

Prototype, but with real product shape.

Already useful as a demo of how to build a narrow AI workflow with:

- typed intermediate representations
- real-time assistance
- model orchestration
- local-first developer ergonomics
