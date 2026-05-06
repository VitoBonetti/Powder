from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Security, Depends, Response, BackgroundTasks
from fastapi.security.api_key import APIKeyHeader
from typing import List
from dotenv import load_dotenv
from models.schemas import NoteData, MoveData, InboxItem, RenameNote
from services import file_system
from services.file_system import VAULT_DIR
from api.auth import verify_access
import os
from database import sync_search_index


load_dotenv()
router = APIRouter()

SECRET_API_KEY = os.getenv("POWDER_API_KEY", "FAIL_IF_NOT_SET")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)

def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != SECRET_API_KEY or SECRET_API_KEY == "FAIL_IF_NOT_SET":
        raise HTTPException(status_code=403, detail="Access Denied: Invalid or Missing API Key")
    return api_key


@router.get("/notes")
def list_notes(user: str = Depends(verify_access)):
    notes = file_system.get_all_notes()
    return {"notes": notes}


@router.get("/notes/{file_path:path}")
def get_note(file_path: str, user: str = Depends(verify_access)):
    try:
        content = file_system.read_note_content(file_path)
        return {"content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/notes/{file_path:path}")
def save_note(file_path: str, note: NoteData, background_tasks: BackgroundTasks, user: str = Depends(verify_access)):
    final_path = file_system.save_note_content(file_path, note.content)
    return {"message": f"Note '{final_path}' saved successfully."}


@router.get("/tree")
def get_tree(user: str = Depends(verify_access)):
    """Returns the nested file tree for the frontend sidebar."""
    tree = file_system.get_file_tree()
    return tree


@router.post("/folders/{folder_path:path}")
def create_new_folder(folder_path: str, user: str = Depends(verify_access)):
    try:
        file_system.create_folder(folder_path)
        return {"message": f"Folder '{folder_path}' created."}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.delete("/notes/{file_path:path}")
def delete_vault_item(file_path: str, user: str = Depends(verify_access)):
    try:
        file_system.delete_item(file_path)
        return {"message": "Deleted successfully."}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.put("/move")
def move_vault_item(data: MoveData, user: str = Depends(verify_access)):
    try:
        file_system.move_item(data.source, data.destination)
        return {"message": "Moved successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def upload_files(
        target_path: str = Form(""),  # The folder where the files should go
        files: List[UploadFile] = File(...),  # The actual files
        user: str = Depends(verify_access)
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
def global_search(q: str = "", user: str = Depends(verify_access)):
    """Takes a query string 'q' and returns matching files and snippets."""
    try:
        results = file_system.search_vault(q)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-asset")
async def upload_asset_file(file: UploadFile = File(...), user: str = Depends(verify_access)):
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
def resolve_link(target: str, user: str = Depends(verify_access)):
    try:
        path = file_system.resolve_wiki_link(target)
        return {"path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inbox")
def add_to_inbox(item: InboxItem, background_tasks: BackgroundTasks, user: str = Depends(verify_access)):
    """The Universal Inbox receiver. Push data here from anywhere."""
    try:
        # Refactor save_to_inbox to return early and harvest images in background
        path = file_system.save_to_inbox_async(item.title, item.content, item.source, background_tasks)
        return {"message": "Successfully ingested into Inbox", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags")
def list_all_tags(user: str = Depends(verify_access)):
    """API Endpoint to fetch the tag cloud."""
    try:
        return file_system.get_all_tags()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/tag")
def search_by_tag(tag: str, user: str = Depends(verify_access)):
    """API Endpoint to fetch files matching a specific tag."""
    try:
        return file_system.get_files_by_tag(tag)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rename")
def rename_file_or_folder(req: RenameNote, user: str = Depends(verify_access)):
    try:
        new_path = file_system.rename_item(req.old_path, req.new_name)
        return {"status": "success", "new_path": new_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex")
def force_database_rebuild(user: str = Depends(verify_access)):
    """Wipes the SQLite database and rebuilds it from the actual files."""
    try:
        sync_search_index(VAULT_DIR)
        return {"status": "success", "message": "Database rebuilt perfectly."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph")
def get_knowledge_graph(user: str = Depends(verify_access)):
    """Returns the nodes and links for the interactive knowledge graph."""
    try:
        return file_system.build_knowledge_graph()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-scan")
async def import_pentest_scan(file: UploadFile = File(...), user: str = Depends(verify_access)):
    """Receives a raw scan file (XML/JSON), parses it, and creates a Vault Note."""
    try:
        content_bytes = await file.read()
        raw_content = content_bytes.decode('utf-8')

        saved_path = file_system.process_pentest_upload(raw_content)

        return {"message": "Scan parsed and saved to Vault successfully", "path": saved_path}
    except ValueError as ve:
        # Handles the "No suitable parser found" error
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process scan: {str(e)}")
