"""Generate a short comprehension quiz from a document, via the OpenAI chat API."""

from fastapi import HTTPException

from app.core.config import DEFAULT_TEXT_MODEL
from app.core.json_utils import parse_json_response
from app.features.quiz.schemas import QuizResponse
from app.integrations.openai_client import chat_completion

QUIZ_MODEL = DEFAULT_TEXT_MODEL

_LANGUAGE_NAMES = {
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "bn-IN": "Bengali",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "pa-IN": "Punjabi",
}


def _build_quiz_prompt(document_context: str, language_code: str) -> str:
    target_lang = _LANGUAGE_NAMES.get(language_code, "English")
    return (
        "Generate an interactive quiz based on the following document context to check "
        "if the user actually read it.\n\n"
        "1. Create exactly 3-5 multiple-choice questions focusing ONLY on the most critical "
        "sections: hidden risks, penalties, financial obligations, and unexpected clauses.\n"
        "2. For each question, provide exactly TWO options (option A and option B).\n"
        "3. Specify which option is correct ('A' or 'B').\n"
        "4. Provide a short, easy-to-understand explanation of the correct answer.\n"
        "5. If the document has no critical risks, generate questions based on the core rules.\n"
        f"6. CRITICAL: Provide your ENTIRE final output translated into {target_lang}. "
        f"The questions, options, and explanations MUST be naturally written in {target_lang}.\n\n"
        "Document Context:\n"
        f"{document_context}\n\n"
        "Return the response ONLY as a valid JSON object strictly matching this format "
        "(the keys must remain English):\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question": "...",\n'
        '      "option_a": "...",\n'
        '      "option_b": "...",\n'
        '      "correct_option": "A",\n'
        '      "explanation": "..."\n'
        "    }\n"
        "  ]\n"
        "}"
    )


async def generate_quiz(document_context: str, language_code: str = "en-IN") -> QuizResponse:
    if not document_context.strip():
        raise HTTPException(status_code=400, detail="Document context cannot be empty.")

    text = await chat_completion(
        [
            {
                "role": "system",
                "content": "You always reply with a single JSON object and nothing else.",
            },
            {"role": "user", "content": _build_quiz_prompt(document_context, language_code)},
        ],
        model=QUIZ_MODEL,
        temperature=0.2,
        max_tokens=2048,
        json_mode=True,
        label="OpenAI quiz",
    )
    data = parse_json_response(text, error_detail="OpenAI quiz response was not valid JSON.")
    return QuizResponse(**data)
