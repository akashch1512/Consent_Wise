import pytest
from fastapi import HTTPException

from app.core.config import get_openai_api_key, openai_headers, openai_url
from app.core.json_utils import parse_json_response, strip_code_fences


class TestStripCodeFences:
    def test_plain_json_untouched(self):
        assert strip_code_fences('{"a": 1}') == '{"a": 1}'

    def test_strips_json_fence(self):
        assert strip_code_fences('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_strips_bare_fence(self):
        assert strip_code_fences('```\n{"a": 1}\n```') == '{"a": 1}'


class TestParseJsonResponse:
    def test_parses_fenced_json(self):
        assert parse_json_response('```json\n{"x": 2}\n```', error_detail="bad") == {"x": 2}

    def test_invalid_json_raises_502(self):
        with pytest.raises(HTTPException) as exc:
            parse_json_response("not json", error_detail="bad json")
        assert exc.value.status_code == 502
        assert exc.value.detail == "bad json"


class TestConfig:
    def test_url_and_headers(self):
        assert openai_url("/chat/completions").endswith("/v1/chat/completions")
        assert openai_headers("abc")["Authorization"] == "Bearer abc"

    def test_api_key_present(self):
        assert get_openai_api_key() == "test-key"

    def test_missing_api_key_raises_500(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        with pytest.raises(HTTPException) as exc:
            get_openai_api_key()
        assert exc.value.status_code == 500
