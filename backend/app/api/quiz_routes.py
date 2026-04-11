from fastapi import APIRouter

from app.api.quiz_schemas import QuizRequest, QuizResponse
from app.services.quiz import generate_quiz

quiz_router = APIRouter(prefix="/api")


@quiz_router.post("/generate-quiz", response_model=QuizResponse)
async def generate_interactive_quiz(request: QuizRequest):
    """
    Frontend Integration Guide:
    
    1. Endpoint: POST /api/generate-quiz
    2. Payload required:
       {
         "document_context": "The parsed document text or terms."
       }
       
    3. How it works:
       - The backend sends the document to Gemini and extracts 3-5 critical multiple-choice questions.
       - Each question has `option_a`, `option_b`, and one matching `correct_option` ('A' or 'B').
       - When the user answers incorrectly, you can immediately display the `explanation` string provided for the question.
       
    Example Response:
    {
      "questions": [
        {
          "question": "What is the penalty for late payment?",
          "option_a": "$50 charge",
          "option_b": "No penalty",
          "correct_option": "A",
          "explanation": "The terms explicitly state that late payments incur a $50 fine."
        }
      ]
    }
    """
    
    result = await generate_quiz(document_context=request.document_context, language_code=request.language_code)
    return result
