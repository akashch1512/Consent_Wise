from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.api.schemas import (
    ExtensionAnalyzeRequest,
    ExtensionAnalyzeResponse,
    ExtensionConfigResponse,
    SummaryRequest,
    SummaryResponse,
)
from app.services.extension import (
    analyze_extension_payload,
    build_analysis_page_payload,
    build_dashboard_html,
    get_extension_config,
)
from app.services.gemini import generate_summary

router = APIRouter(prefix="/api")
page_router = APIRouter()


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.post("/summarize", response_model=SummaryResponse)
async def summarize_policy(request: SummaryRequest):
    cleaned_text = request.text.strip()
    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty.",
        )
    return await generate_summary(cleaned_text)


@router.get("/extension/config", response_model=ExtensionConfigResponse)
async def extension_config(request: Request):
    return get_extension_config(_base_url(request))


@router.post("/extension/analyze", response_model=ExtensionAnalyzeResponse)
async def extension_analyze(request: Request, payload: ExtensionAnalyzeRequest):
    cleaned_text = payload.text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    normalized = payload.model_copy(update={"text": cleaned_text})
    return await analyze_extension_payload(normalized, _base_url(request))


@router.get("/extension/analysis/{analysis_id}")
async def extension_analysis(analysis_id: str):
    page_payload = build_analysis_page_payload(analysis_id)
    if page_payload is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return page_payload


@page_router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_home(request: Request):
    config = get_extension_config(_base_url(request))
    return HTMLResponse(
        f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{config.product_name}</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #09111f;
      color: #eef4ff;
      font-family: Arial, sans-serif;
      text-align: center;
      padding: 24px;
    }}
    .card {{
      max-width: 620px;
      padding: 28px;
      border-radius: 18px;
      background: #101a2d;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }}
    p {{
      color: #94a3b8;
      line-height: 1.6;
    }}
  </style>
</head>
<body>
  <section class="card">
    <h1>{config.product_name}</h1>
    <p>No analysis has been opened yet from the extension.</p>
    <p>Trigger a consent interception or run a popup analysis to open a backend-served dashboard page.</p>
  </section>
</body>
</html>"""
    )


@page_router.get("/dashboard/{analysis_id}", response_class=HTMLResponse)
async def dashboard_analysis(analysis_id: str):
    page_payload = build_analysis_page_payload(analysis_id)
    if page_payload is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return HTMLResponse(build_dashboard_html(analysis_id))
