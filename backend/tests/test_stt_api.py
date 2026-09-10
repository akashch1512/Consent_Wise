import base64

from app.features.stt import router as stt_router


def _b64(data: bytes = b"x") -> str:
    return base64.b64encode(data).decode()


def test_stt_requires_audio(client):
    assert client.post("/api/stt", json={"audio_base64": ""}).status_code == 400


def test_stt_returns_transcript(client, monkeypatch):
    async def _fake_transcribe(audio_base64, mime_type, language):
        return "hello there"

    monkeypatch.setattr(stt_router, "transcribe_audio", _fake_transcribe)
    resp = client.post("/api/stt", json={"audio_base64": _b64(), "language": "en-IN"})
    assert resp.status_code == 200
    assert resp.json() == {"transcript": "hello there", "language": "en-IN"}


def test_stt_no_speech_returns_empty_transcript(client, monkeypatch):
    async def _fake_transcribe(audio_base64, mime_type, language):
        raise ValueError("no-speech")

    monkeypatch.setattr(stt_router, "transcribe_audio", _fake_transcribe)
    resp = client.post("/api/stt", json={"audio_base64": _b64()})
    assert resp.status_code == 200
    assert resp.json()["transcript"] == ""


def test_stt_runtime_error_is_502(client, monkeypatch):
    async def _fake_transcribe(audio_base64, mime_type, language):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(stt_router, "transcribe_audio", _fake_transcribe)
    resp = client.post("/api/stt", json={"audio_base64": _b64()})
    assert resp.status_code == 502
