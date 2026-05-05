import sqlite3
from pathlib import Path

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

    conn.commit()
    conn.close()


def sync_search_index(vault_dir: Path):
    """
    Ensures the SQLite index matches the filesystem on startup.
    Runs a full sync. In a massive vault, this might take a second on boot,
    but it guarantees consistency if files were modified outside the app.
    """
    conn = get_db()

    # Clear the current index
    conn.execute("DELETE FROM search_index")

    # Rebuild from source of truth
    for md_file in vault_dir.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
            rel_path = str(md_file.relative_to(vault_dir)).replace("\\", "/")
            conn.execute(
                "INSERT INTO search_index (path, content) VALUES (?, ?)",
                (rel_path, content)
            )
        except Exception as e:
            print(f"Failed to index {md_file}: {e}")

    conn.commit()
    conn.close()