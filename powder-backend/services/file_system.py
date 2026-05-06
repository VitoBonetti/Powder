from pathlib import Path
import httpx
import mimetypes
import base64
import shutil
import time
import re
import sqlite3
from datetime import datetime
import urllib.request
from urllib.parse import urlparse, urljoin
from database import get_db
from filelock import FileLock, Timeout
from fastapi import BackgroundTasks


BASE_DIR = Path(__file__).resolve().parent.parent
# Define our vault directory
VAULT_DIR = BASE_DIR / "vault"
VAULT_DIR.mkdir(parents=True, exist_ok=True)


def _get_lock(target_file: Path) -> FileLock:
    """
    Creates an OS-level lock file right next to the target file.
    Example: MyNote.md -> MyNote.md.lock
    Will wait up to 5 seconds to acquire the lock before raising a Timeout.
    """
    lock_path = target_file.with_name(target_file.name + ".lock")
    return FileLock(lock_path, timeout=5)


def get_all_notes() -> list[str]:
    """Returns a list of relative paths for all .md files."""
    notes = []
    for file_path in VAULT_DIR.rglob("*.md"):
        notes.append(str(file_path.relative_to(VAULT_DIR)))
    return notes


def read_note_content(file_path: str) -> str:
    """Reads a note, raising standard Python errors if it fails."""
    target_file = VAULT_DIR / file_path

    # Security check
    if not str(target_file.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    if not target_file.exists() or not target_file.is_file():
        raise FileNotFoundError("Note not found.")

    return target_file.read_text(encoding="utf-8")


def save_note_content(file_path: str, content: str) -> str:
    """Saves a note, returns final path, safely locked against concurrency."""
    if not file_path.endswith(".md"):
        file_path += ".md"

    target_file = VAULT_DIR / file_path
    target_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        # ATOMIC WRITE: Acquire lock before touching the file
        with _get_lock(target_file):
            target_file.write_text(content, encoding="utf-8")
    except Timeout:
        raise PermissionError(f"File {file_path} is currently locked by another process. Please try again.")

    # --- SQLITE INDEXING ---
    conn = get_db()

    # 1. Update Search Index
    conn.execute("DELETE FROM search_index WHERE path = ?", (file_path,))
    conn.execute("INSERT INTO search_index (path, content) VALUES (?, ?)", (file_path, content))

    # 2. Update Tags Index
    conn.execute("DELETE FROM note_tags WHERE path = ?", (file_path,))
    tags = set(re.findall(r'(?<![\w])#([a-zA-Z0-9_-]+)', content))
    for tag in tags:
        conn.execute("INSERT INTO note_tags (path, tag) VALUES (?, ?)", (file_path, tag.lower()))

    conn.commit()
    conn.close()

    return file_path


def get_file_tree(current_dir: Path = VAULT_DIR, base_dir: Path = VAULT_DIR) -> dict:
    if isinstance(current_dir, str):
        current_dir = Path(current_dir)

    rel_path = "" if current_dir == VAULT_DIR else str(current_dir.relative_to(VAULT_DIR)).replace("\\", "/")

    """Recursively builds a tree structure of the vault."""
    tree = {
        "name": "Vault" if current_dir == base_dir else current_dir.name,
        "type": "folder",
        "path": rel_path,
        "children": []
    }

    ALLOWED_EXTENSIONS = {".md", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

    # Read the directory contents
    try:
        # Sort folders first, then files
        paths = sorted(current_dir.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        for child in paths:
            # Hide system folders/files (like .git or .DS_Store)
            if child.name.startswith("."):
                continue

            if child.is_dir():
                tree["children"].append(get_file_tree(child))
            elif child.is_file() and child.suffix.lower() in ALLOWED_EXTENSIONS:
                tree["children"].append({
                    "name": child.name,
                    "type": "file",
                    "path": str(child.relative_to(VAULT_DIR)).replace("\\", "/")
                })
    except PermissionError:
        pass

    return tree


def create_folder(folder_path: str) -> str:
    """Creates a new empty directory."""
    target_dir = VAULT_DIR / folder_path

    # Security check
    if not str(target_dir.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    target_dir.mkdir(parents=True, exist_ok=True)
    return folder_path


def delete_item(item_path: str) -> bool:
    """Deletes a file/folder and removes it from the search index."""
    target = VAULT_DIR / item_path
    if not str(target.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")
    if not target.exists():
        raise FileNotFoundError("Item not found.")

    clean_path = item_path.replace("\\", "/")

    conn = get_db()

    if target.is_file():
        target.unlink()
        conn.execute("DELETE FROM search_index WHERE path = ?", (clean_path,))
        conn.execute("DELETE FROM note_tags WHERE path = ?", (clean_path,))
    elif target.is_dir():
        shutil.rmtree(target)
        # Delete all files in the index that start with this directory path
        conn.execute("DELETE FROM search_index WHERE path LIKE ?", (f"{clean_path}/%",))
        conn.execute("DELETE FROM note_tags WHERE path LIKE ?", (f"{clean_path}/%",))

    conn.commit()
    conn.close()
    return True


def update_links(old_path: str, new_path: str):
    """Safely updates links using the SQLite index and FileLocks."""
    old_link = old_path.replace("\\", "/")
    new_link = new_path.replace("\\", "/")

    conn = get_db()

    try:
        cursor = conn.execute(
            "SELECT path FROM search_index WHERE search_index MATCH ?",
            (f'"{old_link}"',)
        )
        affected_files = [row["path"] for row in cursor.fetchall()]

        for rel_path in affected_files:
            md_file = VAULT_DIR / rel_path
            if md_file.exists():
                try:
                    # ATOMIC READ/WRITE: Lock the file while we update links
                    with _get_lock(md_file):
                        content = md_file.read_text(encoding="utf-8")
                        new_content = content.replace(old_link, new_link)
                        md_file.write_text(new_content, encoding="utf-8")

                    # Update index outside the file lock to keep lock time minimal
                    conn.execute("UPDATE search_index SET content = ? WHERE path = ?", (new_content, rel_path))
                except Timeout:
                    print(f"Skipped link update for {rel_path}: File is locked.")

        conn.commit()
    finally:
        conn.close()


def move_item(source_path: str, destination_path: str) -> bool:
    """Moves a file or folder into a new directory and updates links."""
    src = VAULT_DIR / source_path
    dst_dir = VAULT_DIR / destination_path

    if not str(src.resolve()).startswith(str(VAULT_DIR.resolve())) or \
            not str(dst_dir.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    if not src.exists():
        raise FileNotFoundError("Source item not found.")

    if str(dst_dir.resolve()).startswith(str(src.resolve())):
        raise ValueError("Cannot move a folder into itself.")

    # --- NEW: Calculate the old and new paths BEFORE we move it ---
    old_rel = str(src.relative_to(VAULT_DIR)).replace("\\", "/")
    new_file_path = dst_dir / src.name
    new_rel = str(new_file_path.relative_to(VAULT_DIR)).replace("\\", "/")

    # Move the file on the hard drive
    shutil.move(str(src), str(dst_dir))

    # --- NEW: Trigger the link updater silently in the background ---
    update_links(old_rel, new_rel)

    return True


def save_uploaded_file(target_directory: str, filename: str, content: bytes) -> str:
    """Saves an uploaded file to the specified directory."""

    # FIX: Silently ignore non-markdown files instead of crashing the batch
    if not filename.endswith(".md"):
        return ""

    target_dir = VAULT_DIR / target_directory
    file_path = target_dir / filename

    # Security: Ensure they aren't escaping the Vault
    if not str(file_path.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    # FIX FOR THE 500 ERROR:
    # Create the specific parent directories for THIS file, not just the target_dir
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(content)

    return str(file_path.relative_to(VAULT_DIR)).replace("\\", "/")


def search_vault(query: str) -> list:
    """Queries the SQLite FTS5 index instead of reading files."""
    if not query or not query.strip():
        return []

    conn = get_db()
    results = []

    try:
        # FTS5 MATCH syntax. The snippet() function automatically extracts context
        # and wraps the matched term in HTML/Markdown tags.
        # snippet(table, col_idx, start_tag, end_tag, ellipsis, max_tokens)
        cursor = conn.execute("""
            SELECT 
                path, 
                snippet(search_index, 1, '**', '**', '...', 15) as snippet 
            FROM search_index 
            WHERE search_index MATCH ?
            ORDER BY rank
            LIMIT 50
        """, (query,))

        for row in cursor:
            results.append({
                "name": row["path"].split("/")[-1],
                "path": row["path"],
                "snippet": row["snippet"]
            })
    except sqlite3.OperationalError as e:
        # Handles malformed FTS queries (e.g., if user types unescaped quotes)
        print(f"Search error: {e}")
    finally:
        conn.close()

    return results


def get_all_tags() -> list:
    """Returns a list of all tags and how many files use them."""
    conn = get_db()
    try:
        cursor = conn.execute("""
                              SELECT tag, COUNT(path) as count
                              FROM note_tags
                              GROUP BY tag
                              ORDER BY count DESC
                              """)
        # Convert the SQLite rows into a list of dictionaries
        tags = [{"tag": row["tag"], "count": row["count"]} for row in cursor.fetchall()]
        return tags
    finally:
        conn.close()


def get_files_by_tag(tag: str) -> list:
    """Returns all files that contain a specific tag."""
    conn = get_db()
    results = []
    try:
        # Join the tags table with the search index so we can grab a preview of the content
        cursor = conn.execute("""
                              SELECT n.path, s.content
                              FROM note_tags n
                                       LEFT JOIN search_index s ON n.path = s.path
                              WHERE n.tag = ?
                              """, (tag.lower(),))

        for row in cursor:
            content = row["content"] or ""
            # Create a quick preview snippet of the first 100 characters
            snippet = content[:100].replace('\n', ' ').strip() + "..."
            results.append({
                "name": row["path"].split("/")[-1],
                "path": row["path"],
                "snippet": snippet
            })
        return results
    finally:
        conn.close()


def save_asset(filename: str, content: bytes) -> str:
    """Saves an image to the assets folder and returns the relative path."""
    assets_dir = VAULT_DIR / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Add a timestamp to the filename to prevent overwriting
    safe_filename = f"{int(time.time())}_{filename.replace(' ', '_')}"
    file_path = assets_dir / safe_filename

    # Write the bytes to the hard drive
    with open(file_path, "wb") as f:
        f.write(content)

    # Return the exact path that the Markdown file will use
    return f"assets/{safe_filename}"


def resolve_wiki_link(target: str) -> str:
    """Finds the full path of a note from a wiki-link target."""
    # Clean up the target just in case brackets get passed
    target = target.replace("[[", "").replace("]]", "")

    # Obsidian links usually don't include .md, so we add it if missing
    filename = target if target.endswith(".md") else f"{target}.md"

    # 1. Check if the exact path exists (e.g., if they typed "projects/Ideas.md")
    exact_path = VAULT_DIR / filename
    if exact_path.exists():
        return str(exact_path.relative_to(VAULT_DIR)).replace("\\", "/")

    # 2. If not, search the ENTIRE vault for that filename
    for md_file in VAULT_DIR.rglob("*.md"):
        if md_file.name == filename:
            return str(md_file.relative_to(VAULT_DIR)).replace("\\", "/")

    # 3. If it doesn't exist at all, return the filename so the frontend can create a "Ghost Note"
    return filename


def harvest_external_images(content: str, source_url: str) -> str:
    """Scans markdown for external images, downloads them via HTTPX, and updates links."""
    matches = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)

    for alt, url in matches:
        if url.startswith("assets/"):
            continue

        # 1. Base64 Data URIs (Lazy-load fallbacks)
        if url.startswith("data:image"):
            try:
                header, encoded = url.split(",", 1)
                mime_type = header.split(";")[0].split(":")[1]
                ext = mimetypes.guess_extension(mime_type) or ".png"
                image_bytes = base64.b64decode(encoded)

                # Check for empty decodes
                if len(image_bytes) > 100:
                    filename = f"embedded_data{ext}"
                    local_path = save_asset(filename, image_bytes)
                    content = content.replace(f"![{alt}]({url})", f"![{alt}]({local_path})")
            except Exception:
                pass
            continue

        # 2. Standard Web Images
        fetch_url = urljoin(source_url, url)
        if fetch_url.startswith("//"):
            fetch_url = "https:" + fetch_url

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }

            # Using HTTPX instead of urllib for robust TLS and redirect handling
            with httpx.Client(follow_redirects=True, verify=False) as client:
                response = client.get(fetch_url, headers=headers, timeout=10.0)

                if response.status_code != 200:
                    print(f"Blocked by server {fetch_url}: {response.status_code}")
                    continue

                content_type = response.headers.get('Content-Type', '')
                if not content_type.startswith('image/'):
                    print(f"Not an image {fetch_url}: {content_type}")
                    continue

                image_bytes = response.content

                # PREVENT EMPTY IMAGES
                if len(image_bytes) < 100:
                    print(f"Image too small/empty {fetch_url}")
                    continue

            # Clean filename
            parsed_url = urlparse(fetch_url)
            clean_path = urllib.parse.unquote(parsed_url.path)
            filename = clean_path.split("/")[-1]

            if not filename or '.' not in filename:
                ext = mimetypes.guess_extension(content_type) or ".png"
                filename = f"harvested_image{ext}"

            filename = re.sub(r'[\\/*?:"<>|]', "", filename)

            local_path = save_asset(filename, image_bytes)
            content = content.replace(f"![{alt}]({url})", f"![{alt}]({local_path})")

        except Exception as e:
            print(f"Harvester failed to download {fetch_url}: {str(e)}")
            # Fails gracefully: the markdown will just keep the original web URL

    return content


def save_to_inbox_async(title: str, content: str, source: str, background_tasks: BackgroundTasks) -> str:
    inbox_dir = VAULT_DIR / "_Inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)

    safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
    filename = f"{safe_title}_{int(time.time())}.md"
    file_path = inbox_dir / filename
    rel_path = f"_Inbox/{filename}"

    # 1. Initial Write (Fast)
    header = f"---\nclipped: {datetime.now()}\nsource: {source}\n---\n\n# {title}\n\n"
    file_path.write_text(header + content, encoding="utf-8")

    # 2. Schedule heavy I/O in the background
    background_tasks.add_task(process_inbox_background, file_path, rel_path, content, source)

    return rel_path


def process_inbox_background(file_path: Path, rel_path: str, content: str, source: str):
    # Move the slow harvesting here
    enriched_content = harvest_external_images(content, source)

    with _get_lock(file_path):
        # Re-read header to be safe, then overwrite with enriched content
        file_path.write_text(enriched_content, encoding="utf-8")

    # Re-index database
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO search_index (path, content) VALUES (?, ?)", (rel_path, enriched_content))
    conn.commit()
    conn.close()


def rename_item(old_path: str, new_name: str) -> str:
    """Renames a file or folder and updates the SQLite indexes."""
    old_target = VAULT_DIR / old_path
    if not old_target.exists():
        raise FileNotFoundError("Item not found.")

    # Make sure we keep the .md extension for files
    if old_target.is_file() and not new_name.endswith('.md'):
        new_name += '.md'

    new_target = old_target.parent / new_name
    new_path = str(new_target.relative_to(VAULT_DIR)).replace("\\", "/")

    # Rename on the hard drive
    old_target.rename(new_target)

    # Update the SQLite Database so search and tags don't break!
    conn = get_db()
    if old_target.is_file():
        conn.execute("UPDATE search_index SET path = ? WHERE path = ?", (new_path, old_path))
        conn.execute("UPDATE note_tags SET path = ? WHERE path = ?", (new_path, old_path))
    else:
        # If it's a folder, update ALL files inside it using string replacement
        conn.execute("UPDATE search_index SET path = REPLACE(path, ?, ?) WHERE path LIKE ?",
                     (old_path, new_path, f"{old_path}/%"))
        conn.execute("UPDATE note_tags SET path = REPLACE(path, ?, ?) WHERE path LIKE ?",
                     (old_path, new_path, f"{old_path}/%"))

    conn.commit()
    conn.close()

    return new_path