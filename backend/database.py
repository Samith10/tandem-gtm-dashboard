from sqlmodel import SQLModel, Session, create_engine
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tandem_gtm.db")

# "check_same_thread" is SQLite-only -- safe to disable for FastAPI's async context
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session