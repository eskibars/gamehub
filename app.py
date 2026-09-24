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
    ssl_context = None
    certfile = os.environ.get("GAMEHUB_SSL_CERTFILE")
    keyfile = os.environ.get("GAMEHUB_SSL_KEYFILE")
    if certfile and keyfile:
        # Tablets on the LAN need HTTPS before browsers allow service-worker
        # offline caching. Generate a self-signed pair with:
        #   openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
        #     -keyout gamehub-key.pem -out gamehub-cert.pem -subj "/CN=gamehub.local"
        ssl_context = (certfile, keyfile)
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", 25001)),
        debug=os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"},
        threaded=True,
        ssl_context=ssl_context,
    )
