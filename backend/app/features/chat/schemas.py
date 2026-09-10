from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Must be 'user' or 'model'")
    text: str = Field(..., description="The message content")


class ChatRequest(BaseModel):
    document_context: str = Field(
        ..., description="The parsed terms/policy text from the frontend."
    )
    question: str = Field(..., description="The user's latest question.")
    history: list[ChatMessage] = Field(
        default_factory=list, description="Array of previous messages to maintain chat history."
    )


class ChatResponse(BaseModel):
    answer: str = Field(..., description="The model's answer to the user's question.")
