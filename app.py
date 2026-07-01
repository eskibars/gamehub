from __future__ import annotations

import os

from gamehub_server import create_app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 25001)))
