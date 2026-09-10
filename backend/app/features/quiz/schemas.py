from pydantic import BaseModel, Field


class QuizRequest(BaseModel):
    document_context: str = Field(
        ..., description="The parsed document text or terms from the frontend"
    )
    language_code: str | None = Field(
        "en-IN", description="The requested display language for the quiz components"
    )


class QuizQuestion(BaseModel):
    question: str = Field(
        ..., description="The multiple-choice question focusing on critical risks or penalties"
    )
    option_a: str = Field(..., description="The first option")
    option_b: str = Field(..., description="The second option")
    correct_option: str = Field(..., description="The correct option, either 'A' or 'B'")
    explanation: str = Field(
        ..., description="A clear, short explanation for why this is the correct answer"
    )


class QuizResponse(BaseModel):
    questions: list[QuizQuestion] = Field(..., description="List of generated questions")
