FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . ./backend/

# Cloud Run sets $PORT at runtime (defaults to 8080); bind to it explicitly
# rather than hardcoding, so this also works unchanged if Cloud Run's default
# ever changes. Run as the `backend` package (not `main:app` directly) so
# main.py's `from backend.agents...` root-relative imports resolve — this
# mirrors start.sh's working invocation (`python -m uvicorn backend.main:app`
# from the repo root); /app is that "repo root" inside the image.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
