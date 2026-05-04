from pathlib import Path


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
    """Recursively builds a tree structure of the vault."""
    tree = {
        "name": current_dir.name if current_dir != base_dir else "vault",
        "type": "folder",
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