import sqlite3
from pathlib import Path
import re
import json

DB_PATH = Path("vault_security.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Creates the tokens table for CLI access."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
           path UNINDEXED, content
        )
    """)

    conn.execute("""
       CREATE TABLE IF NOT EXISTS note_tags
       (
           path TEXT NOT NULL,
           tag TEXT NOT NULL,
           UNIQUE (path, tag)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS background_jobs
        (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("UPDATE background_jobs SET status = 'PENDING' WHERE status = 'PROCESSING'")

    conn.commit()
    conn.close()


def sync_search_index(vault_dir: Path):
    """
    Ensures the SQLite index matches the filesystem on startup.
    Runs a full sync for both text search and tags.
    """
    conn = get_db()

    # Clear the current indexes
    conn.execute("DELETE FROM search_index")
    conn.execute("DELETE FROM note_tags")  # <--- CLEAR OLD TAGS

    # Rebuild from source of truth
    for md_file in vault_dir.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
            rel_path = str(md_file.relative_to(vault_dir)).replace("\\", "/")

            # 1. Rebuild Text Search
            conn.execute(
                "INSERT INTO search_index (path, content) VALUES (?, ?)",
                (rel_path, content)
            )

            # 2. Rebuild Tags
            # Extract unique tags, convert to lowercase to prevent duplicates
            tags = set(re.findall(r'(?<![\w])#([a-zA-Z0-9_-]+)', content))
            for tag in tags:
                conn.execute(
                    "INSERT OR IGNORE INTO note_tags (path, tag) VALUES (?, ?)",
                    (rel_path, tag.lower())
                )

        except Exception as e:
            print(f"Failed to index {md_file}: {e}")

    conn.commit()
    conn.close()