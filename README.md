# Provider Network Intelligence

A full-stack GTM dashboard I built to solve a problem I kept seeing in healthcare sales: teams trying to identify and activate independent medical practices across fragmented tools, with no shared system for scoring, tracking, or outreach.

I wanted to build something that felt like a real internal tool, not a demo, so I anchored it in live data from the NPPES NPI registry, designed the scoring model around Tandem's actual ICP, and embedded AI directly into the outreach workflow rather than treating it as an afterthought.

**Live:** [tandem-tech.vercel.app](https://tandem-tech.vercel.app)  
---

## The Problem

GTM teams at healthcare AI companies are often flying blind. There is no structured way to identify which independent practices are most likely to adopt a new product, no visibility into where providers drop off in the sales funnel, and no tooling that connects data enrichment, pipeline management, and outreach in one place. Most teams cobble this together across HubSpot, spreadsheets, and Clay with no single source of truth and no automation layer tying it together.

I built this to show what that system could look like.

---

## What I Built

**Real provider data** pulls live data from the NPPES NPI registry across 7 high prior authorization burden states (NY, CA, TX, FL, IL, PA, NJ), targeting Family Medicine, Internal Medicine, and General Practice providers. No mocked data anywhere.

**ICP scoring** scores each provider 0 to 100 based on specialty match, practice size, state PA burden, NPI type, and enumeration recency. The model is designed around Tandem's ideal customer: independent primary care practices with high prior authorization volume.

**HubSpot style pipeline** is a four stage CRM board (Discovered, Outreach Sent, Demo Booked, Activated) with inline stage transitions, rep assignment, and drop off visibility across the funnel.

**Workflow automation** consists of five trigger based rules that evaluate the full provider set, apply tags, assign reps, and log a full audit trail. Designed to mirror the kind of logic you would build in n8n or Clay.

**AI outreach generation** streams personalized cold outreach copy per provider using a multi provider LLM abstraction layer I built from scratch. Supports Anthropic, OpenAI, Groq, Gemini, and any OpenAI compatible endpoint including Cursor. The active provider is controlled by a single environment variable.

**GTM analytics** surfaces funnel drop off rates, average time to activate, outreach freshness, pipeline health by stage, and ICP score distribution in a dashboard that a GTM team could actually use day to day.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLModel |
| Database | SQLite (swappable to Postgres via `DATABASE_URL`) |
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| AI | Multi provider LLM abstraction (Anthropic, OpenAI, Groq, Gemini, Cursor) |
| Data | NPPES NPI Registry API, real, public, no auth required |
| Deployment | Vercel (frontend), Railway (backend) |

---

## Workflow Rules

| Rule | Trigger | Action |
|------|---------|--------|
| High Priority Flag | Score >= 80 AND Stage = Discovered | Tag HIGH PRIORITY |
| High Value Account | Provider count at address >= 5 | Tag HIGH VALUE ACCOUNT |
| Stale Re engagement | Stage = Outreach Sent AND no activity > 14 days | Tag STALE |
| Demo Auto assign | Stage = Demo Booked AND rep unassigned | Assign to outbound team |
| Outbound Escalation | Score >= 70 AND Stage = Discovered AND age > 7 days | Tag ESCALATED |

---

## ICP Scoring

| Signal | Points |
|--------|--------|
| Specialty match (Family Medicine, Internal Medicine, General Practice) | +35 |
| Solo or small practice (1 to 3 providers at address) | +25 |
| High PA burden state (NY, CA, TX, FL, IL, PA, NJ) | +20 |
| Individual NPI (Type 1) | +10 |
| Recently enumerated (within 3 years) | +10 |

---

## Local Setup

**Prerequisites:** Python 3.12+, Node.js 18+

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # fill in ANTHROPIC_API_KEY
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
# .env.local is already set to http://localhost:8000
npm run dev
```

Open `http://localhost:3000` and click "Fetch Providers" on the dashboard to pull live NPI data.

---

## Environment Variables

**Backend (`backend/.env`)**

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | Active LLM provider | `anthropic` |
| `ANTHROPIC_API_KEY` | Anthropic API key | required if using Anthropic |
| `OPENAI_API_KEY` | OpenAI API key | optional |
| `GROQ_API_KEY` | Groq API key | optional |
| `GEMINI_API_KEY` | Gemini API key | optional |
| `OPENAI_COMPATIBLE_BASE_URL` | Base URL for Cursor or any OpenAI compatible endpoint | optional |
| `OPENAI_COMPATIBLE_API_KEY` | API key for above | optional |
| `OPENAI_COMPATIBLE_MODEL` | Model name for above | optional |
| `DATABASE_URL` | Database connection string | `sqlite:///./tandem_gtm.db` |
| `ALLOWED_ORIGINS` | Comma separated list of allowed frontend origins | `http://localhost:3000` |

**Frontend (`frontend/.env.local`)**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

---

## Project Structure
```
tandem-gtm-dashboard/
  backend/
    main.py                   # FastAPI app entry point
    database.py               # SQLite engine and session
    models.py                 # SQLModel table definitions and schemas
    routers/
      providers.py            # Provider CRUD and NPI fetch
      pipeline.py             # Analytics endpoints
      workflow.py             # Workflow engine and event log
      ai.py                   # SSE streaming outreach generation
    services/
      npi.py                  # NPI registry API client
      scoring.py              # ICP scoring heuristics
      workflow_engine.py      # Automation rule evaluation
      llm.py                  # Multi provider LLM abstraction
    requirements.txt
    Dockerfile
    railway.toml
  frontend/
    app/
      dashboard/page.tsx      # Stat cards, funnel, freshness
      providers/page.tsx      # Paginated provider table
      pipeline/page.tsx       # Kanban pipeline board
      workflows/page.tsx      # Rule cards and event log
    components/
      Sidebar.tsx
      OutreachModal.tsx       # SSE streaming AI outreach
      Toast.tsx
      charts/
        FunnelChart.tsx
        DropoffChart.tsx
    lib/
      api.ts                  # Typed API client
      types.ts                # TypeScript interfaces
```

---

## Design

I wanted the UI to feel like a real internal tool, not a polished marketing site but just, clean. The design system is locked and applied consistently across every page.
