# ConsentWise AI — Backend

FastAPI backend for the ConsentWise AI browser extension: consent analysis,
danger scoring, site reputation, plus chat, quiz, document vision (OCR),
text-to-speech and speech-to-text — all backed by the **OpenAI API** — and
optional per-user persistence in **Postgres**.

## Layout

```
pyproject.toml            # ruff + pytest config, dependency list
alembic.ini               # migration config (DB URL read from env)
migrations/               # Alembic environment + versioned migrations
  env.py  versions/0001_initial.py
app/
  main.py                 # FastAPI app, CORS, router wiring, DB lifespan
  core/
    config.py             # OPENAI_API_KEY, model defaults, auth headers, .env load
    json_utils.py         # strip code fences, parse JSON responses
    db.py                 # async SQLAlchemy engine/session (enabled iff DATABASE_URL)
  api/
    router.py             # /api/summarize, /api/extension/*, /dashboard pages
    schemas.py            # summary + extension analysis models
  integrations/
    openai_client.py      # chat_completion / transcribe / text_to_speech
    summary.py            # danger + reputation scoring (JSON-mode chat)
  features/
    chat/ quiz/ vision/ tts/ stt/ extension/    # each: router.py, schemas.py, service.py
    users/                # profile + analysis-history persistence
      models.py  schemas.py  service.py  router.py
```

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then set OPENAI_API_KEY (and DATABASE_URL if wanted)
uvicorn app.main:app --reload
```

### Configuration (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | every AI feature |
| `OPENAI_TEXT_MODEL` / `OPENAI_VISION_MODEL` / `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` / `OPENAI_STT_MODEL` | no | model overrides |
| `OPENAI_API_BASE` | no | point at an Azure / proxy gateway |
| `DATABASE_URL` | no | `postgresql+asyncpg://user:pass@host:5432/consentwise` — enables `/api/users`; tables are auto-created on startup |

With `DATABASE_URL` unset, persistence is disabled: `/api/users` returns 503 and
every other endpoint works normally.

## Database migrations (Alembic)

Postgres schema is owned by Alembic. After setting `DATABASE_URL`:

```bash
alembic upgrade head            # apply migrations
alembic revision --autogenerate -m "add column x"   # after editing app/features/users/models.py
alembic downgrade -1            # roll back one
alembic check                   # fail if models drift from migrations
```

`migrations/env.py` reads `DATABASE_URL` (async engine, works for Postgres and
SQLite). For local SQLite the tables are also created directly on startup, so
`pytest` and quick demos need no `alembic` step.

## Lint & format (Ruff)

```bash
ruff check .            # lint
ruff check --fix .      # lint + autofix
ruff format .           # format
```

Config lives in `pyproject.toml` (`[tool.ruff]`).

## Tests

```bash
pip install -r requirements-dev.txt   # fastapi, pytest, ruff, alembic, …
pytest
```

No real network or database: OpenAI HTTP calls are intercepted with `respx`,
persistence runs against a throwaway SQLite file.

## Endpoints

| Method & path | Notes |
|---|---|
| `GET  /health` | |
| `POST /api/summarize` | `{text, title?, url?}` |
| `GET  /api/extension/config` | |
| `POST /api/extension/analyze` | `{text, title?, url?, source?, client_id?}` — saves to history when `client_id` is given |
| `GET  /api/extension/analysis/{id}` | |
| `GET  /dashboard`, `/dashboard/{id}` | HTML |
| `POST /api/chat` | `{document_context, question, history?}` |
| `POST /api/generate-quiz` | `{document_context, language_code?}` |
| `POST /api/analyze-document` | multipart `file` + optional `client_id` |
| `POST /api/tts` | `{text, language_code?, voice_name?}` → `{audio_base64, mime_type}` |
| `POST /api/stt` | `{audio_base64, mime_type?, language?}` → `{transcript, language}` |
| `POST /api/users` | upsert `{client_id, name?, email?, interests?, language?}` |
| `GET  /api/users/{client_id}` | profile + `analysis_count` + `recent_analyses` |

## Per-user data

The extension has no login. It generates a random `client_id` (UUID, stored in
`chrome.storage.local`) and sends it with profile updates and analyses.

- **Postgres (durable):** `users` (name, email, interests, language, timestamps)
  and `analysis_events` (kind, url, title, scores, summary, created_at).
- **`chrome.storage.local` (convenience only):** the `client_id` itself,
  `hasSeenWelcome`, selected language, a cached copy of the last analysis and
  the profile for instant re-render.
