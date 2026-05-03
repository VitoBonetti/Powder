from fastapi import APIRouter, HTTPException
from models.schemas import NoteData
from services import file_system

router = APIRouter()

@router.get("/notes")
def list_notes():
    notes = file_system.get_all_notes()
    return {"notes": notes}

@router.get("/notes/{file_path:path}")
def get_note(file_path: str):
    try:
        content = file_system.read_note_content(file_path)
        return {"content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")

@router.post("/notes/{file_path:path}")
def save_note(file_path: str, note: NoteData):
    final_path = file_system.save_note_content(file_path, note.content)
    return {"message": f"Note '{final_path}' saved successfully."}