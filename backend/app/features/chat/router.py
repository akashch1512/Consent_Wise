from fastapi import APIRouter, HTTPException

from app.features.chat.schemas import ChatRequest, ChatResponse
from app.features.chat.service import generate_chat_response

chat_router = APIRouter(prefix="/api")


@chat_router.post("/chat", response_model=ChatResponse)
async def document_chatbot(request: ChatRequest):
    """
    Frontend Integration Guide:

    1. Endpoint: POST /api/chat
    2. Payload required:
       {
         "document_context": "The parsed document/terms the user is reading on the page.",
         "question": "What is the user asking right now?",
         "history": [
            {"role": "user", "text": "Previous question"},
            {"role": "model", "text": "Previous answer"}
         ]  // Optional, useful for follow-up questions
       }

    3. How it works:
       - The backend injects the `document_context` into the AI's system prompt.
       - The AI acts as an assistant and will *only* answer based on the provided context.
       - If a user asks something unrelated to the document, the AI will politely refuse.

    4. Note on State:
       - This is a *stateless* route. The backend doesn't store the chat history in a database.
       - The frontend *must* maintain the conversation history array and pass it in subsequent requests if you want the chatbot to remember previous messages.
    """
    doc_context = request.document_context.strip()
    question = request.question.strip()

    if not doc_context:
        raise HTTPException(status_code=400, detail="document_context cannot be empty.")
    if not question:
        raise HTTPException(status_code=400, detail="question cannot be empty.")

    answer_text = await generate_chat_response(
        document_context=doc_context, question=question, history=request.history
    )

    return ChatResponse(answer=answer_text)
