import json

import httpx
import respx

from tests.conftest import openai_text_response

CHAT_URL = "https://api.openai.com/v1/chat/completions"
SPEECH_URL = "https://api.openai.com/v1/audio/speech"
TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"


@respx.mock
def test_chat_returns_answer(client):
    respx.post(CHAT_URL).mock(
        return_value=httpx.Response(200, json=openai_text_response("The fee is $50."))
    )
    resp = client.post(
        "/api/chat",
        json={"document_context": "Late fee is $50.", "question": "What is the fee?"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"answer": "The fee is $50."}


def test_chat_rejects_empty_context(client):
    resp = client.post("/api/chat", json={"document_context": " ", "question": "hi"})
    assert resp.status_code == 400


@respx.mock
def test_chat_upstream_error_is_502(client):
    respx.post(CHAT_URL).mock(return_value=httpx.Response(500, text="boom"))
    resp = client.post("/api/chat", json={"document_context": "ctx", "question": "q"})
    assert resp.status_code == 502


@respx.mock
def test_generate_quiz(client):
    quiz_json = json.dumps(
        {
            "questions": [
                {
                    "question": "Penalty for late payment?",
                    "option_a": "$50",
                    "option_b": "Nothing",
                    "correct_option": "A",
                    "explanation": "The terms state a $50 fine.",
                }
            ]
        }
    )
    respx.post(CHAT_URL).mock(
        return_value=httpx.Response(200, json=openai_text_response(quiz_json))
    )
    resp = client.post("/api/generate-quiz", json={"document_context": "Late fee is $50."})
    assert resp.status_code == 200
    assert resp.json()["questions"][0]["correct_option"] == "A"


@respx.mock
def test_generate_quiz_invalid_json_is_502(client):
    respx.post(CHAT_URL).mock(
        return_value=httpx.Response(200, json=openai_text_response("not json"))
    )
    resp = client.post("/api/generate-quiz", json={"document_context": "text"})
    assert resp.status_code == 502


def test_generate_quiz_rejects_empty(client):
    assert client.post("/api/generate-quiz", json={"document_context": "  "}).status_code == 400


@respx.mock
def test_analyze_document(client):
    vision_json = json.dumps(
        {
            "extracted_text": "Sample contract text",
            "summary": "A simple contract.",
            "key_points": ["Point one"],
            "risks": ["A risk"],
            "accessibility_hint": "Read carefully.",
            "intent": "Contract",
        }
    )
    respx.post(CHAT_URL).mock(
        return_value=httpx.Response(200, json=openai_text_response(vision_json))
    )
    resp = client.post(
        "/api/analyze-document",
        files={"file": ("doc.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["intent"] == "Contract"


def test_analyze_document_rejects_bad_mime(client):
    resp = client.post(
        "/api/analyze-document",
        files={"file": ("doc.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


@respx.mock
def test_tts_returns_wav(client):
    respx.post(SPEECH_URL).mock(return_value=httpx.Response(200, content=b"RIFF....WAVEdata"))
    resp = client.post("/api/tts", json={"text": "Hello world.", "language_code": "en-IN"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mime_type"] == "audio/wav"
    import base64

    assert base64.b64decode(body["audio_base64"]).startswith(b"RIFF")


def test_tts_rejects_empty_text(client):
    assert client.post("/api/tts", json={"text": "   "}).status_code == 400


@respx.mock
def test_tts_upstream_error_is_502(client):
    respx.post(SPEECH_URL).mock(return_value=httpx.Response(500, text="nope"))
    resp = client.post("/api/tts", json={"text": "Hello.", "language_code": "en-IN"})
    assert resp.status_code == 502


@respx.mock
def test_stt_returns_transcript(client):
    respx.post(TRANSCRIBE_URL).mock(return_value=httpx.Response(200, json={"text": "hello there"}))
    import base64

    resp = client.post(
        "/api/stt",
        json={"audio_base64": base64.b64encode(b"webm-bytes").decode(), "language": "en-IN"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"transcript": "hello there", "language": "en-IN"}


@respx.mock
def test_stt_no_speech_returns_empty(client):
    respx.post(TRANSCRIBE_URL).mock(return_value=httpx.Response(200, json={"text": "  "}))
    import base64

    resp = client.post("/api/stt", json={"audio_base64": base64.b64encode(b"x").decode()})
    assert resp.status_code == 200
    assert resp.json()["transcript"] == ""
