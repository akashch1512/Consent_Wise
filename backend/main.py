from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import page_router, router

app = FastAPI(
    title="ConsentGuard AI",
    description="Backend for the ConsentGuard AI Chrome extension — consent analysis, danger scoring, and site reputation.",
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

app.include_router(router)
app.include_router(page_router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}
