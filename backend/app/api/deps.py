from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from ..config import Settings
from ..db import get_session
from ..services.poller import Hub


def get_hub(request: Request) -> Hub:
    return request.app.state.hub


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


HubDep = Annotated[Hub, Depends(get_hub)]
SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
