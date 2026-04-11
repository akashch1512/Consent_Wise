from fastapi import APIRouter

router = APIRouter(prefix="/api")

@router.get("/hello")
async def hello_world():
    return {"message": "Hello, FastAPI starter!"}
