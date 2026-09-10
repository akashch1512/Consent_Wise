"""Extract and analyse text from an uploaded image or PDF, via the OpenAI vision API."""

import base64

from app.core.config import DEFAULT_VISION_MODEL
from app.core.json_utils import parse_json_response
from app.features.vision.schemas import VisionAnalysisResponse
from app.integrations.openai_client import chat_completion

VISION_MODEL = DEFAULT_VISION_MODEL

_VISION_PROMPT = (
    "Extract all readable text from this document/image, then reply with a single JSON "
    "object (no markdown) matching exactly:\n"
    "{\n"
    '  "extracted_text": "all readable text",\n'
    '  "summary": "simple-language summary",\n'
    '  "key_points": ["..."],\n'
    '  "risks": ["risks, penalties, obligations, or hidden clauses"],\n'
    '  "accessibility_hint": "easy explanation for low-literacy users",\n'
    '  "intent": "what this document is for"\n'
    "}"
)


def _file_content_part(file_bytes: bytes, mime_type: str) -> dict:
    data_url = f"data:{mime_type};base64," + base64.b64encode(file_bytes).decode("utf-8")
    if mime_type == "application/pdf":
        return {"type": "file", "file": {"filename": "document.pdf", "file_data": data_url}}
    return {"type": "image_url", "image_url": {"url": data_url}}


async def analyze_image(file_bytes: bytes, mime_type: str) -> VisionAnalysisResponse:
    text = await chat_completion(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _VISION_PROMPT},
                    _file_content_part(file_bytes, mime_type),
                ],
            }
        ],
        model=VISION_MODEL,
        temperature=0.1,
        max_tokens=4096,
        json_mode=True,
        timeout=90.0,
        label="OpenAI vision",
    )
    data = parse_json_response(
        text, error_detail="OpenAI vision response was not valid JSON. Ensure the file is clear."
    )
    return VisionAnalysisResponse(**data)
