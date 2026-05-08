from pydantic import BaseModel
from typing import Optional, Dict, Any


# Pydantic model to expect JSON data when saving a note
class NoteData(BaseModel):
    content: str


class MoveData(BaseModel):
    source: str
    destination: str


class InboxItem(BaseModel):
    title: str
    content: str
    source: str = ""

class TokenRequest(BaseModel):
    name: str


class RenameNote(BaseModel):
    old_path: str
    new_name: str


class EdgeCreate(BaseModel):
    id: str  # We'll generate the ID on the frontend (e.g., e-source-target)
    source: str
    target: str
    label: Optional[str] = None


class NodeCreate(BaseModel):
    title: str
    type: str
    command: Optional[str] = None
    markdown_result: Optional[str] = None
    status: str = "draft"
    note: Optional[str] = None
    meta_tags: Optional[Dict[str, Any]] = None  # Flexible dictionary for MITRE/CWE
    position_x: float = 0.0
    position_y: float = 0.0