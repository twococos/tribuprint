from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    printer_backend: Literal["real", "mock"] = "real"
    cups_server: str = "/run/cups/cups.sock"
    cups_printer: str = "Canon_TS3350"
    # Nom que s'envia a CUPS; ha de coincidir amb l'uid del procés (PeerCred)
    cups_user: str = "coco"
    ippusb_url: str = "ipp://localhost:60000/ipp/print"
    port: int = 7007
    data_dir: Path = Path("/data")
    max_upload_mb: int = 50
    retention_hours: int = 24
    enable_office: bool = False
    cups_web_url: str = "http://192.168.1.200:631"
    tz: str = "Europe/Madrid"
    static_dir: Path = Path(__file__).resolve().parent.parent / "static"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "tribuprint.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
