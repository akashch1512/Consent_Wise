"""Document-grounded chatbot backed by the OpenAI chat API."""

from app.core.config import DEFAULT_TEXT_MODEL
from app.features.chat.schemas import ChatMessage
from app.integrations.openai_client import chat_completion

CHAT_MODEL = DEFAULT_TEXT_MODEL

_SYSTEM_INSTRUCTION_TEMPLATE = (
    "You are a helpful and polite document-assistant chatbot. "
    "Answer the user's questions strictly based on the following document context. "
    "If the answer is not contained in the context, politely say you don't know based "
    "on the provided document. Keep answers concise, clear, and easy to understand.\n\n"
    "--- DOCUMENT CONTEXT START ---\n{context}\n--- DOCUMENT CONTEXT END ---\n"
)


def _build_messages(
    document_context: str,
    question: str,
    history: list[ChatMessage],
) -> list[dict]:
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_INSTRUCTION_TEMPLATE.format(context=document_context)}
    ]
    for msg in history:
        role = "user" if msg.role.lower() == "user" else "assistant"
        messages.append({"role": role, "content": msg.text})
    messages.append({"role": "user", "content": question})
    return messages


async def generate_chat_response(
    document_context: str,
    question: str,
    history: list[ChatMessage],
) -> str:
    return await chat_completion(
        _build_messages(document_context, question, history),
        model=CHAT_MODEL,
        temperature=0.3,
        max_tokens=1024,
        label="OpenAI chat",
    )
