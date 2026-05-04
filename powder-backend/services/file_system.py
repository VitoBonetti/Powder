from pathlib import Path
import shutil


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

    # Read the directory contents
    try:
        # Sort so folders appear first, then files alphabetically
        paths = sorted(current_dir.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))

        for path in paths:
            if path.is_file() and path.suffix == ".md":
                # It's a Markdown file
                tree["children"].append({
                    "name": path.name,
                    "type": "file",
                    # Convert Windows backslashes to standard URL forward slashes
                    "path": str(path.relative_to(base_dir)).replace("\\", "/")
                })
            elif path.is_dir():
                # It's a folder! Recursively call this exact function to dig inside
                tree["children"].append(get_file_tree(path, base_dir))

    except PermissionError:
        pass  # Silently skip any folders the system won't let us read

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


def move_item(source_path: str, destination_path: str) -> bool:
    """Moves a file or folder into a new directory."""
    src = VAULT_DIR / source_path

    # If destination_path is "", it means they dropped it on the root "Vault"
    dst_dir = VAULT_DIR / destination_path

    # Security: Ensure they aren't escaping the Vault
    if not str(src.resolve()).startswith(str(VAULT_DIR.resolve())) or \
            not str(dst_dir.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise PermissionError("Access denied.")

    if not src.exists():
        raise FileNotFoundError("Source item not found.")

    # Security: Prevent dropping a folder into itself
    if str(dst_dir.resolve()).startswith(str(src.resolve())):
        raise ValueError("Cannot move a folder into itself.")

    shutil.move(str(src), str(dst_dir))
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

