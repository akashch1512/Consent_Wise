# FastAPI Starter

A minimal FastAPI starter template.

## Run locally

1. Create a virtual environment:

```bash
python -m venv .venv
```

2. Activate the environment:

Windows:
```bash
.venv\Scripts\activate
```

macOS / Linux:
```bash
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Start the app:

```bash
uvicorn main:app --reload
```

## Endpoints

- `GET /health` - health check
- `GET /api/hello` - sample API route
