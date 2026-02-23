from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import providers, pipeline, workflow, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Tandem Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

# Allowed origins -- tightened via env var in production
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(providers.router, prefix="/providers", tags=["providers"])
app.include_router(pipeline.router, prefix="/pipeline", tags=["pipeline"])
app.include_router(workflow.router, prefix="/workflows", tags=["workflows"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])


@app.get("/health")
def health():
    return {"status": "ok"}