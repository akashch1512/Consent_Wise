from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(
    title="FastAPI Starter",
    description="A minimal FastAPI starter application.",
    version="0.1.0",
)

# Mount the Gemini summarization API router at /api
app.include_router(router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}
