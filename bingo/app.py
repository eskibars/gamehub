from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env")

from gamehub_server import create_app  # noqa: E402


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("BINGO_PORT", 5001)),
        debug=os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"},
        threaded=True,
    )
