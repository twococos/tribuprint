from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Profile(SQLModel, table=True):
    __tablename__ = "profiles"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    emoji: str
    color: str
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: datetime | None = None


class Upload(SQLModel, table=True):
    __tablename__ = "uploads"
    id: str = Field(primary_key=True)
    original_name: str
    mime: str
    pdf_path: str | None = None
    pages: int
    size_bytes: int
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime


class Job(SQLModel, table=True):
    __tablename__ = "jobs"
    id: int | None = Field(default=None, primary_key=True)
    cups_job_id: int | None = Field(default=None, index=True)
    profile_id: int | None = Field(default=None, index=True)
    upload_id: str | None = None
    filename: str
    pages: int
    copies: int = 1
    options_json: str = "{}"
    color: bool = True
    # pending | held | processing | stopped | canceled | aborted | completed
    state: str = "pending"
    state_reason: str | None = None
    sheets_completed: int | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)
    completed_at: datetime | None = None
    duplex_batch_id: int | None = None
    duplex_stage: int | None = None  # 1 = senars, 2 = parells


class DuplexBatch(SQLModel, table=True):
    __tablename__ = "duplex_batches"
    id: int | None = Field(default=None, primary_key=True)
    upload_id: str
    odd_job_id: int | None = None
    even_job_id: int | None = None
    even_pdf_path: str | None = None
    # printing_odd | waiting_flip | printing_even | done | canceled
    status: str = "printing_odd"
