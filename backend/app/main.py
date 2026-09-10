from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import page_router, router
from app.core.db import init_models
from app.features.chat.router import chat_router
from app.features.quiz.router import quiz_router
from app.features.stt.router import stt_router
from app.features.tts.router import tts_router
from app.features.users.router import users_router
from app.features.vision.router import vision_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create the user/history tables when DATABASE_URL is configured; no-op otherwise.
    await init_models()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="ConsentWise AI",
    description=(
        "Backend for the ConsentWise AI Chrome extension — consent analysis, "
        "danger scoring, and site reputation."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for feature_router in (
    router,
    page_router,
    tts_router,
    chat_router,
    vision_router,
    quiz_router,
    stt_router,
    users_router,
):
    app.include_router(feature_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
