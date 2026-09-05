from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
# Load before importing gamehub_server: it reads env vars at module import.
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())

from gamehub_server import create_app  # noqa: E402


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", 25001)),
        debug=os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"},
        threaded=True,
    )
