from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Security, Depends, Response, BackgroundTasks, Request
from fastapi.security.api_key import APIKeyHeader
from typing import List
from dotenv import load_dotenv
from models.schemas import NoteData, MoveData, InboxItem, RenameNote, NodeCreate, EdgeCreate
from services import file_system
from services.file_system import VAULT_DIR
from api.auth import verify_access
from parser import route_and_parse
import os
import asyncio
from database import sync_search_index, get_db
import uuid
import json
import re
import sqlite3
import shutil


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
async def save_note(file_path: str, note: NoteData, background_tasks: BackgroundTasks, user: str = Depends(verify_access)):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Note: save_note_content is synchronous, so we run it in a thread pool to not block the event loop
            final_path = await asyncio.to_thread(file_system.save_note_content, file_path, note.content)
            return {"message": f"Note '{final_path}' saved successfully."}
        except PermissionError as e:
            if attempt == max_retries - 1:
                raise HTTPException(status_code=503, detail="File is currently locked. Try saving again in a moment.")
            await asyncio.sleep(0.5 * (2 ** attempt))


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
def add_to_inbox(item: InboxItem,  user: str = Depends(verify_access)):
    """The Universal Inbox receiver. Push data here from anywhere."""
    try:
        # Refactor save_to_inbox to return early and harvest images in background
        path = file_system.save_to_inbox_async(item.title, item.content, item.source)
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


@router.get("/flow/nodes")
def get_flow_nodes(user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    nodes = [dict(row) for row in conn.execute("SELECT * FROM flow_nodes").fetchall()]
    conn.close()

    # SQLite stores JSON as strings, React Flow needs it as an object
    for n in nodes:
        n["meta_tags"] = json.loads(n["meta_tags"]) if n["meta_tags"] else {}
    return nodes


@router.get("/flow/edges")
def get_flow_edges(user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    edges = [dict(row) for row in conn.execute("SELECT * FROM flow_edges").fetchall()]
    conn.close()
    return edges


@router.post("/flow/nodes")
async def create_flow_node(request: Request, user: str = Depends(verify_access)):
    node = await request.json()
    node_id = str(uuid.uuid4())

    # 1. THE BRIDGE: Create the dedicated Markdown file in Powder's Vault
    safe_title = re.sub(r'[^\w\s-]', '', node.get("title", "Node")).strip().replace(' ', '_')
    file_path = f"_Flows/{safe_title}_{node_id[:8]}.md"

    # Pre-populate the note with data
    command = node.get("command", "")
    status = node.get("status", "action")
    initial_content = f"---\ntype: flow-node\nstatus: {status}\n---\n\n# {node.get('title', 'Node')}\n\n"
    if command:
        initial_content += f"**Command:**\n```bash\n{command}\n```\n\n---\n\n## Notes\n"

    file_system.save_note_content(file_path, initial_content)

    meta_tags = node.get("meta_tags", {})

    # 2. THE POINTER: Save the graph node to SQLite
    conn = get_db()
    conn.execute("""
        INSERT INTO flow_nodes (id, title, type, command, status, position_x, position_y, file_path, meta_tags) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        node_id, node.get("title"), node.get("type"), command, status,
        node.get("position_x", 0), node.get("position_y", 0), file_path, json.dumps(meta_tags)
    ))
    conn.commit()
    conn.close()

    node["id"] = node_id
    node["file_path"] = file_path
    return node


@router.put("/flow/nodes/{node_id}")
async def update_flow_node(node_id: str, request: Request, user: str = Depends(verify_access)):
    node = await request.json()
    conn = get_db()
    conn.execute("""
        UPDATE flow_nodes 
        SET title=?, type=?, command=?, status=?, position_x=?, position_y=?, meta_tags=?
        WHERE id=?
    """, (
        node.get("title"), node.get("type"), node.get("command"), node.get("status"),
        node.get("position_x"), node.get("position_y"), json.dumps(node.get("meta_tags", {})),
        node_id
    ))
    conn.commit()
    conn.close()
    return node


@router.delete("/flow/nodes/{node_id}")
def delete_flow_node(node_id: str, user: str = Depends(verify_access)):
    conn = get_db()

    # First, get the file_path to delete the markdown file from the Vault
    cursor = conn.execute("SELECT file_path FROM flow_nodes WHERE id=?", (node_id,))
    row = cursor.fetchone()
    if row and row[0]:
        try:
            file_system.delete_item(row[0])
        except Exception:
            pass  # File might already be gone

    conn.execute("DELETE FROM flow_nodes WHERE id=?", (node_id,))
    conn.execute("DELETE FROM flow_edges WHERE source=? OR target=?", (node_id, node_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


@router.post("/flow/edges")
async def create_flow_edge(request: Request, user: str = Depends(verify_access)):
    edge = await request.json()
    conn = get_db()
    conn.execute("""
        INSERT INTO flow_edges (id, source, target, label) 
        VALUES (?, ?, ?, ?)
    """, (edge["id"], edge["source"], edge["target"], edge.get("label", "")))
    conn.commit()
    conn.close()
    return edge


@router.put("/flow/edges/{edge_id}")
async def update_flow_edge(edge_id: str, request: Request, user: str = Depends(verify_access)):
    edge = await request.json()
    conn = get_db()
    conn.execute("UPDATE flow_edges SET label=? WHERE id=?", (edge.get("label", ""), edge_id))
    conn.commit()
    conn.close()
    return edge


@router.delete("/flow/edges/{edge_id}")
def delete_flow_edge(edge_id: str, user: str = Depends(verify_access)):
    conn = get_db()
    conn.execute("DELETE FROM flow_edges WHERE id=?", (edge_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# --- File and Image Uploads within the Drawer ---
@router.post("/flow/upload/")
async def upload_flow_image(file: UploadFile = File(...), user: str = Depends(verify_access)):

    assets_dir = VAULT_DIR / "assets"
    assets_dir.mkdir(exist_ok=True)

    file_path = assets_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"url": f"/assets/{file.filename}"}


@router.post("/flow/nodes/{node_id}/parse")
async def parse_scan_file(node_id: str, file: UploadFile = File(...), user: str = Depends(verify_access)):
    try:
        # 1. Read bytes and safely decode to string (Your parsers expect a string)
        raw_content = await file.read()
        try:
            content_str = raw_content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File must be a valid UTF-8 encoded text/xml/json file.")

        # 2. Execute your exact PentestFlow parser logic (returns a dict)
        parsed_data = route_and_parse(content_str)

        # 3. Format the dictionary exactly as ResultDrawer.jsx expects it
        return {
            "markdown_result": parsed_data.get("markdown", parsed_data.get("markdown_result", "")),
            "title": parsed_data.get("title", "Parsed Scan"),
            "command": parsed_data.get("command", "")
        }

    except ImportError:
        raise HTTPException(status_code=501,
                            detail="Parser folder not found. Please copy the 'parser' folder from PentestFlow into powder-backend.")
    except ValueError as ve:
        # This catches the exact "Unrecognized tool format" error from your __init__.py
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")

