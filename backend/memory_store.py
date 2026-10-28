"""Browser-scoped, persistent conversation history and semantic recall."""

from __future__ import annotations

import os
import sqlite3
import stat
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from chromadb.errors import NotFoundError

from backend.config import positive_int_setting
from backend import rag_store


DEFAULT_DB = Path(__file__).resolve().parent.parent / "local-data" / "agent_memory.sqlite3"
DB_PATH = Path(os.getenv("AGENT_MEMORY_DB", str(DEFAULT_DB)))
COLLECTION = "nightreign_browser_memory"
MAX_EXCHANGES = positive_int_setting("AGENT_MEMORY_MAX_EXCHANGES", 5)
AGENT_MEMORY_RETENTION_DAYS = positive_int_setting("AGENT_MEMORY_RETENTION_DAYS", 90)
FEEDBACK_RETENTION = timedelta(days=90)


def _restrict_posix_file_permissions(path: Path, create: bool = False) -> None:
    if os.name != "posix":
        return

    flags = os.O_RDWR | getattr(os, "O_NONBLOCK", 0)
    nofollow = getattr(os, "O_NOFOLLOW", None)
    if nofollow is None and path.is_symlink():
        raise OSError(f"Refusing to change permissions on a symlink: {path}")
    if nofollow is not None:
        flags |= nofollow
    if create:
        flags |= os.O_CREAT

    try:
        descriptor = os.open(path, flags, 0o600) if create else os.open(path, flags)
    except FileNotFoundError:
        if create:
            raise
        return

    try:
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode):
            raise OSError(f"SQLite file must be a regular file: {path}")
        if nofollow is None:
            path_stat = path.lstat()
            if (file_stat.st_dev, file_stat.st_ino) != (path_stat.st_dev, path_stat.st_ino):
                raise OSError(f"SQLite file path changed while opening: {path}")
        os.fchmod(descriptor, 0o600)
    finally:
        os.close(descriptor)


def _secure_sqlite_file_permissions() -> None:
    if os.name != "posix":
        return
    _restrict_posix_file_permissions(DB_PATH, create=True)
    for suffix in ("-wal", "-shm", "-journal"):
        _restrict_posix_file_permissions(Path(f"{DB_PATH}{suffix}"))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    _secure_sqlite_file_permissions()
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    connection.execute("CREATE INDEX IF NOT EXISTS messages_by_session ON messages(session_id, id)")
    connection.execute("CREATE INDEX IF NOT EXISTS messages_by_created_at ON messages(created_at, id)")
    connection.execute("""CREATE TABLE IF NOT EXISTS ai_rate_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client TEXT NOT NULL,
        created_at REAL NOT NULL
    )""")
    connection.execute("CREATE INDEX IF NOT EXISTS ai_rate_events_by_client ON ai_rate_events(client, created_at)")
    connection.execute("CREATE INDEX IF NOT EXISTS ai_rate_events_by_created_at ON ai_rate_events(created_at)")
    connection.execute("""CREATE TABLE IF NOT EXISTS ai_daily_usage (
        day TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS feedback_daily_usage (
        day TEXT PRIMARY KEY,
        request_count INTEGER NOT NULL
    )""")
    connection.execute("CREATE TABLE IF NOT EXISTS pending_memory_deletions (id TEXT PRIMARY KEY)")
    connection.execute("""CREATE TABLE IF NOT EXISTS feedback_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('answer', 'suggestion')),
        message TEXT NOT NULL,
        email TEXT,
        question TEXT,
        answer TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    )""")
    connection.execute(
        "CREATE INDEX IF NOT EXISTS feedback_submissions_by_expiry ON feedback_submissions(expires_at)"
    )
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def recent(session_id: str, limit: int = 8) -> list[dict[str, str]]:
    _prune_session(session_id)
    with _connect() as connection:
        rows = connection.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, min(limit, MAX_EXCHANGES * 2)),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def history(session_id: str, limit: int = 80) -> list[dict[str, str]]:
    return recent(session_id, min(limit, MAX_EXCHANGES * 2))


def save_feedback(
    kind: str,
    message: str,
    email: str | None,
    question: str | None = None,
    answer: str | None = None,
    daily_limit: int = 250,
) -> bool:
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        created_at = datetime.now(timezone.utc)
        expires_at = created_at + FEEDBACK_RETENTION
        day = created_at.date().isoformat()
        row = connection.execute(
            "SELECT request_count FROM feedback_daily_usage WHERE day = ?", (day,)
        ).fetchone()
        if row and row[0] >= daily_limit:
            return False
        connection.execute(
            "INSERT INTO feedback_daily_usage(day, request_count) VALUES (?, 1) "
            "ON CONFLICT(day) DO UPDATE SET request_count = request_count + 1",
            (day,),
        )
        connection.execute("DELETE FROM feedback_daily_usage WHERE day < ?", (day,))
        connection.execute(
            "DELETE FROM feedback_submissions WHERE expires_at <= ?",
            (created_at.isoformat(),),
        )
        connection.execute(
            """INSERT INTO feedback_submissions
               (kind, message, email, question, answer, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                kind,
                message,
                email,
                question,
                answer,
                created_at.isoformat(),
                expires_at.isoformat(),
            ),
        )
    return True


def purge_expired_feedback() -> int:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM feedback_submissions WHERE expires_at <= ?", (now,)
        )
        return cursor.rowcount


def list_feedback(limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
    purge_expired_feedback()
    with _connect() as connection:
        total = connection.execute(
            "SELECT COUNT(*) FROM feedback_submissions"
        ).fetchone()[0]
        rows = connection.execute(
            """SELECT id, kind, message, email, question, answer, created_at, expires_at
               FROM feedback_submissions ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
            (max(1, min(limit, 100)), max(0, offset)),
        ).fetchall()
    return [dict(row) for row in rows], total


def append_exchange(session_id: str, question: str, answer: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.executemany(
            "INSERT INTO messages(session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            [(session_id, "user", question, timestamp), (session_id, "assistant", answer, timestamp)],
        )
    _prune_session(session_id)
    try:
        _remember_semantically(session_id, question, answer)
    except Exception:
        # Durable SQLite history remains usable if semantic recall is temporarily unavailable.
        pass
    try:
        _flush_pending_memory_deletions()
    except Exception:
        # Pending IDs remain in SQLite and will be retried on later activity.
        pass


def record_ai_request(client: str, per_minute: int) -> bool:
    """Atomically enforce a shared per-client window across API endpoints/workers."""
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        now = time.time()
        connection.execute("DELETE FROM ai_rate_events WHERE created_at <= ?", (now - 60,))
        count = connection.execute(
            "SELECT COUNT(*) FROM ai_rate_events WHERE client = ? AND created_at > ?",
            (client, now - 60),
        ).fetchone()[0]
        if count >= per_minute:
            return False
        connection.execute(
            "INSERT INTO ai_rate_events(client, created_at) VALUES (?, ?)", (client, now)
        )
    return True


def consume_daily_ai_request(limit: int) -> bool:
    """Reserve one outbound model request against a persistent UTC daily cap."""
    day = datetime.now(timezone.utc).date().isoformat()
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT request_count FROM ai_daily_usage WHERE day = ?", (day,)
        ).fetchone()
        if row and row[0] >= limit:
            return False
        connection.execute(
            "INSERT INTO ai_daily_usage(day, request_count) VALUES (?, 1) "
            "ON CONFLICT(day) DO UPDATE SET request_count = request_count + 1",
            (day,),
        )
        connection.execute("DELETE FROM ai_daily_usage WHERE day < ?", (day,))
    return True


def purge_expired_memory() -> int:
    """Delete expired SQLite exchanges and flush their queued Chroma vector IDs."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=AGENT_MEMORY_RETENTION_DAYS)).isoformat()
    deleted_count = 0
    batch_size = 500

    while True:
        with _connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                """SELECT id, session_id, role FROM messages
                   WHERE created_at < ? ORDER BY created_at, id LIMIT ?""",
                (cutoff, batch_size),
            ).fetchall()
            if not rows:
                break

            vector_ids = [
                f"{row['session_id']}-{row['id']}"
                for row in rows
                if row["role"] == "assistant"
            ]
            if vector_ids:
                connection.executemany(
                    "INSERT OR IGNORE INTO pending_memory_deletions(id) VALUES (?)",
                    [(item,) for item in vector_ids],
                )
            connection.executemany(
                "DELETE FROM messages WHERE id = ?", [(row["id"],) for row in rows]
            )
            deleted_count += len(rows)

        if len(rows) < batch_size:
            break

    _flush_all_pending_memory_deletions()
    return deleted_count


def _prune_session(session_id: str) -> None:
    """Keep only the newest complete exchanges and queue matching vector deletions."""
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        stale = connection.execute(
            "SELECT id, role FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?",
            (session_id, MAX_EXCHANGES * 2),
        ).fetchall()
        if stale:
            stale_ids = [row["id"] for row in stale]
            vector_ids = [f"{session_id}-{row['id']}" for row in stale if row["role"] == "assistant"]
            if vector_ids:
                connection.executemany(
                    "INSERT OR IGNORE INTO pending_memory_deletions(id) VALUES (?)",
                    [(item,) for item in vector_ids],
                )
            placeholders = ",".join("?" for _ in stale_ids)
            connection.execute(f"DELETE FROM messages WHERE id IN ({placeholders})", stale_ids)
    try:
        _flush_pending_memory_deletions()
    except Exception:
        # Pending IDs remain in SQLite and will be retried on later activity.
        pass


def _flush_pending_memory_deletions() -> int:
    with _connect() as connection:
        pending = [row[0] for row in connection.execute(
            "SELECT id FROM pending_memory_deletions LIMIT 500"
        ).fetchall()]
    if not pending:
        return 0
    db = rag_store.chroma_client()
    try:
        collection = db.get_collection(name=COLLECTION)
        collection.delete(ids=pending)
    except NotFoundError:
        # The collection is confirmed absent; there are no vectors to retry.
        pass
    with _connect() as connection:
        connection.executemany(
            "DELETE FROM pending_memory_deletions WHERE id = ?", [(item,) for item in pending]
        )
    return len(pending)


def _flush_all_pending_memory_deletions() -> None:
    """Drain all queued vector IDs; failures propagate so the caller can retry later."""
    while _flush_pending_memory_deletions() > 0:
        pass


def clear(session_id: str) -> None:
    db = rag_store.chroma_client()
    collections = db.list_collections()
    collection_exists = any(
        getattr(collection, "name", collection) == COLLECTION
        for collection in collections
    )
    if collection_exists:
        collection = db.get_collection(name=COLLECTION)
        collection.delete(where={"session_id": session_id})

    # Keep SQLite history until vector deletion is confirmed. If this SQL
    # transaction fails after Chroma deletion, retrying the delete is safe.
    with _connect() as connection:
        connection.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        connection.execute(
            "DELETE FROM pending_memory_deletions WHERE id LIKE ?", (f"{session_id}-%",)
        )


def _memory_collection():
    return rag_store.chroma_client().get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine", "purpose": "browser_conversation_memory",
                  "embedding_model": rag_store.embedding_model_name()},
    )


def _remember_semantically(session_id: str, question: str, answer: str) -> None:
    vector = rag_store.embed_query(question)
    with _connect() as connection:
        row = connection.execute("SELECT max(id) AS id FROM messages WHERE session_id = ?", (session_id,)).fetchone()
    record_id = f"{session_id}-{row['id']}"
    _memory_collection().upsert(
        ids=[record_id], embeddings=[vector],
        documents=[f"用户曾问：{question}\n助手曾答：{answer[:4000]}"],
        metadatas=[{"session_id": session_id, "question": question, "answer": answer[:4000]}],
    )


def recall(session_id: str, question: str, limit: int = 3) -> list[str]:
    _prune_session(session_id)
    with _connect() as connection:
        active_ids = [
            f"{session_id}-{row[0]}"
            for row in connection.execute(
                "SELECT id FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT ?",
                (session_id, MAX_EXCHANGES),
            ).fetchall()
        ]
    if not active_ids:
        return []
    try:
        collection = rag_store.chroma_client().get_collection(name=COLLECTION)
    except Exception:
        return []
    if not active_ids:
        return []
    hits = collection.query(
        query_embeddings=[rag_store.embed_query(question)],
        n_results=min(len(active_ids), max(limit + 3, 1)),
        where={"session_id": session_id},
        include=["metadatas"],
    )
    recent_questions = {message["content"] for message in recent(session_id, 8) if message["role"] == "user"}
    metadata = hits.get("metadatas", [[]])[0]
    return [f"用户曾问：{row['question']}；助手曾答：{row['answer']}"
            for row in metadata if row.get("question") not in recent_questions][:limit]
