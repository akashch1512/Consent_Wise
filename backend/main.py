from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router

app = FastAPI(
    title="FastAPI Starter",
    description="A minimal FastAPI starter application.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the Gemini summarization API router at /api
app.include_router(router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}
