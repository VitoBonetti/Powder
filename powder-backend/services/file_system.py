from pathlib import Path
import shutil
import time
import re
from datetime import datetime
import urllib.request
from urllib.parse import urlparse, urljoin


BASE_DIR = Path(__file__).resolve().parent.parent
# Define our vault directory
VAULT_DIR = BASE_DIR / "vault"
VAULT_DIR.mkdir(parents=True, exist_ok=True)


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
    """Saves a note and returns the final file path."""
    if not file_path.endswith(".md"):
        file_path += ".md"

    target_file = VAULT_DIR / file_path
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text(content, encoding="utf-8")

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
    """Deletes a file or an entire folder."""
    target = VAULT_DIR / item_path

    if not str(target.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    if not target.exists():
        raise FileNotFoundError("Item not found.")

    if target.is_file():
        target.unlink()  # Deletes a file
    elif target.is_dir():
        shutil.rmtree(target)  # Deletes a folder and everything inside it

    return True


def update_links(old_path: str, new_path: str):
    """Silently scans all markdown files and updates broken links."""
    old_link = old_path.replace("\\", "/")
    new_link = new_path.replace("\\", "/")

    # Recursively find every .md file
    for md_file in VAULT_DIR.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
            # If the old link exists in this file, replace it and save it!
            if old_link in content:
                new_content = content.replace(old_link, new_link)
                md_file.write_text(new_content, encoding="utf-8")
        except Exception as e:
            print(f"Error updating links in {md_file}: {e}")


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
    """Scans all markdown files for the given query and returns snippets."""
    results = []
    if not query or not query.strip():
        return results

    query_lower = query.lower()

    # .rglob("*.md") recursively finds all markdown files in all subfolders
    for md_file in VAULT_DIR.rglob("*.md"):
        try:
            # Read the file content
            content = md_file.read_text(encoding="utf-8")

            # Case-insensitive search
            if query_lower in content.lower():
                # Find exactly where the match happened
                match_index = content.lower().find(query_lower)

                # Grab 40 characters before and after the match for context
                start = max(0, match_index - 40)
                end = min(len(content), match_index + len(query) + 40)

                # Clean up the snippet so it's a single flat line
                snippet = content[start:end].replace('\n', ' ')

                if start > 0:
                    snippet = "..." + snippet
                if end < len(content):
                    snippet = snippet + "..."

                results.append({
                    "name": md_file.name,
                    "path": str(md_file.relative_to(VAULT_DIR)).replace("\\", "/"),
                    "snippet": snippet
                })
        except Exception as e:
            # If one file is corrupted, skip it and keep searching the rest
            print(f"Error reading {md_file}: {e}")
            continue

    return results


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
    """Scans markdown for external images, downloads them, and updates the links to local assets."""
    matches = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)

    for alt, url in matches:
        if url.startswith("assets/"):
            continue

        fetch_url = urljoin(source_url, url)
        if fetch_url.startswith("//"):
            fetch_url = "https:" + fetch_url

        try:
            req = urllib.request.Request(fetch_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                image_bytes = response.read()

            parsed_url = urlparse(fetch_url)
            filename = parsed_url.path.split("/")[-1]
            if not filename:
                filename = "harvested_image.png"

            local_path = save_asset(filename, image_bytes)

            old_markdown = f"![{alt}]({url})"
            new_markdown = f"![{alt}]({local_path})"
            content = content.replace(old_markdown, new_markdown)

        except Exception as e:
            print(f"Harvester failed to download {fetch_url}: {e}")

    return content


def save_to_inbox(title: str, content: str, source: str = "") -> str:
    """Ingests external text and saves it safely into the _Inbox folder."""
    inbox_dir = VAULT_DIR / "_Inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)

    # 1. Clean up the title so Windows/Mac doesn't crash on weird characters
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
    if not safe_title:
        safe_title = f"clip_{int(time.time())}"

    filename = f"{safe_title}.md"
    file_path = inbox_dir / filename

    # 2. Prevent overwriting if you clip two things with the same exact title
    if file_path.exists():
        filename = f"{safe_title}_{int(time.time())}.md"
        file_path = inbox_dir / filename

    content = harvest_external_images(content, source)

    # 3. Create a beautiful "Frontmatter" header with the metadata
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    header = f"---\nclipped: {timestamp}\nsource: {source}\n---\n\n"

    full_content = header + f"# {title}\n\n" + content

    # 4. Save to the hard drive
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(full_content)

    return f"_Inbox/{filename}"