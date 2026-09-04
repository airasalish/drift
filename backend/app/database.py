import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./watchlist.db")
# Render (and most managed Postgres providers) hand out "postgres://", but
# SQLAlchemy's psycopg2 dialect needs "postgresql://" — same database, just
# a URL scheme SQLAlchemy insists on.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """`Base.metadata.create_all()` only creates whole tables that don't
    exist yet -- it silently does nothing for a column added to a model
    whose table already exists in the database. That's exactly what broke
    production once: the `currency` column was added to SymbolQuote, but
    the already-running Postgres instance's table was never told about it,
    so every query touching that column threw a real 500.

    This is not a real migration system (no down-migrations, no handling
    for renamed/removed/retyped columns) -- it only covers the one thing
    this project has actually ever done to its schema: add a new nullable
    column. That's a deliberate, disclosed scope limit, not an oversight;
    see ENGINEERING_DECISIONS.md.
    """
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.tables.values():
        if table.name not in existing_tables:
            continue  # brand new table, create_all already handled it

        existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            col_type = column.type.compile(dialect=engine.dialect)
            logger.warning("adding missing column %s.%s (%s)", table.name, column.name, col_type)
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {col_type}'))
