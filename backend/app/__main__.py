import logging

import uvicorn

from .config import get_settings


def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=settings.port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_graceful_shutdown=3,
    )


if __name__ == "__main__":
    main()
