from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
from models.schemas import NoteData, MoveData, InboxItem
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


@router.get("/tree")
def get_tree():
    """Returns the nested file tree for the frontend sidebar."""
    tree = file_system.get_file_tree()
    return tree


@router.post("/folders/{folder_path:path}")
def create_new_folder(folder_path: str):
    try:
        file_system.create_folder(folder_path)
        return {"message": f"Folder '{folder_path}' created."}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.delete("/notes/{file_path:path}")
def delete_vault_item(file_path: str):
    try:
        file_system.delete_item(file_path)
        return {"message": "Deleted successfully."}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.put("/move")
def move_vault_item(data: MoveData):
    try:
        file_system.move_item(data.source, data.destination)
        return {"message": "Moved successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def upload_files(
        target_path: str = Form(""),  # The folder where the files should go
        files: List[UploadFile] = File(...)  # The actual files
):
    try:
        saved_files = []
        for file in files:
            content = await file.read()
            # Send to the file system
            file_system.save_uploaded_file(target_path, file.filename, content)

            if file.filename.endswith(".md"):
                saved_files.append(file.filename)

        return {"message": "Successfully uploaded files.", "files": saved_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/search")
def global_search(q: str = ""):
    """Takes a query string 'q' and returns matching files and snippets."""
    try:
        results = file_system.search_vault(q)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-asset")
async def upload_asset_file(file: UploadFile = File(...)):
    try:
        # Ensure they are only uploading images
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image.")

        content = await file.read()
        path = file_system.save_asset(file.filename, content)

        return {"message": "Asset saved", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/resolve-link")
def resolve_link(target: str):
    try:
        path = file_system.resolve_wiki_link(target)
        return {"path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inbox")
def add_to_inbox(item: InboxItem):
    """The Universal Inbox receiver. Push data here from anywhere."""
    try:
        path = file_system.save_to_inbox(item.title, item.content, item.source)
        return {"message": "Successfully ingested into Inbox", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))