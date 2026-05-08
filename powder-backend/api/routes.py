from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Security, Depends, Response, BackgroundTasks, Request
from fastapi.security.api_key import APIKeyHeader
from fastapi.responses import FileResponse, StreamingResponse
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
import io
import zipfile
import time

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


# ==============================================================================
# POWDERFLOW INTEGRATION ROUTES
# ==============================================================================

@router.get("/flow/nodes")
def get_flow_nodes(user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    nodes = [dict(row) for row in conn.execute("SELECT * FROM flow_nodes").fetchall()]
    conn.close()

    for n in nodes:
        n["meta_tags"] = json.loads(n["meta_tags"]) if n["meta_tags"] else {}

        # FIX: READ THE ACTUAL MARKDOWN FILE TO POPULATE THE DRAWER
        try:
            content = file_system.read_note_content(n["file_path"])
            if n["type"] == "stickyNote":
                # Extract text below frontmatter
                body = content.split("---\n\n", 1)[-1]
                n["note"] = re.sub(r'^# .*?\n+', '', body).strip()
            else:
                # Extract everything after the Notes section
                if "## Notes & Evidence\n" in content:
                    n["markdown_result"] = content.split("## Notes & Evidence\n", 1)[-1].strip()
                else:
                    n["markdown_result"] = ""
        except Exception:
            n["markdown_result"] = ""
            n["note"] = ""

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
    short_id = node_id[:8]

    safe_title = re.sub(r'[^\w\s-]', '', node.get("title", "Node")).strip().replace(' ', '_')
    meta_tags = node.get("meta_tags", {})
    node_type = node.get("type", "actionNode")

    # 1. READ DB (Open and close quickly)
    if node_type == "triggerNode":
        folder_path = f"_Flows/{safe_title}_{short_id}"
        try:
            file_system.create_folder(folder_path)
        except:
            pass
        file_path = f"{folder_path}/_Scope.md"
    else:
        engagement_id = meta_tags.get("engagement_id")
        parent_folder = "_Flows"
        if engagement_id:
            conn = get_db()
            try:
                cursor = conn.execute("SELECT file_path FROM flow_nodes WHERE id=?", (engagement_id,))
                parent_row = cursor.fetchone()
                if parent_row:
                    parent_folder = parent_row[0].rsplit('/', 1)[0]
            finally:
                conn.close()  # Close immediately!

        file_path = f"{parent_folder}/{safe_title}_{short_id}.md"

    # 2. FILE SYSTEM OPERATIONS (Runs safely outside parent DB lock)
    command = node.get("command", "")
    status = node.get("status", "action")
    initial_content = f"---\ntype: {node_type}\nstatus: {status}\n---\n\n# {node.get('title', 'Node')}\n\n"
    if node_type != "stickyNote":
        if command: initial_content += f"**Command:**\n```bash\n{command}\n```\n\n---\n\n"
        initial_content += "## Notes & Evidence\n"

    file_system.save_note_content(file_path, initial_content)

    # 3. WRITE DB
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO flow_nodes (id, title, type, command, status, position_x, position_y, file_path, meta_tags) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            node_id, node.get("title"), node_type, command, status,
            node.get("position_x", 0), node.get("position_y", 0), file_path, json.dumps(meta_tags)
        ))
        conn.commit()
    finally:
        conn.close()

    node["id"] = node_id
    node["file_path"] = file_path
    return node


@router.put("/flow/nodes/{node_id}")
async def update_flow_node(node_id: str, request: Request, user: str = Depends(verify_access)):
    node = await request.json()

    # 1. READ DB
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute("SELECT title, file_path FROM flow_nodes WHERE id=?", (node_id,))
        current_node = cursor.fetchone()
    finally:
        conn.close()

    if not current_node:
        raise HTTPException(status_code=404, detail="Node not found")

    current_title = current_node["title"]
    file_path = current_node["file_path"]
    new_title = node.get("title", current_title)

    # 2. FILE SYSTEM OPERATIONS
    if new_title != current_title:
        safe_title = re.sub(r'[^\w\s-]', '', new_title).strip().replace(' ', '_')
        new_filename = f"{safe_title}_{node_id[:8]}.md"
        try:
            file_path = file_system.rename_item(file_path, new_filename)
        except Exception as e:
            print(f"Rename failed: {e}")

    node_type = node.get("type", "actionNode")
    status = node.get("status", "action")
    command = node.get("command", "")
    markdown_result = node.get("markdown_result", "")
    note_text = node.get("note", "")

    content = f"---\ntype: {node_type}\nstatus: {status}\n---\n\n# {new_title}\n\n"
    if node_type == "stickyNote":
        content += note_text
    else:
        if command: content += f"**Command:**\n```bash\n{command}\n```\n\n---\n\n"
        content += f"## Notes & Evidence\n{markdown_result}"

    file_system.save_note_content(file_path, content)

    # 3. WRITE DB
    conn = get_db()
    try:
        conn.execute("""
            UPDATE flow_nodes 
            SET title=?, type=?, command=?, status=?, position_x=?, position_y=?, meta_tags=?, file_path=?
            WHERE id=?
        """, (
            new_title, node_type, command, status,
            node.get("position_x"), node.get("position_y"), json.dumps(node.get("meta_tags", {})),
            file_path, node_id
        ))
        conn.commit()
    finally:
        conn.close()

    node["file_path"] = file_path
    return node


@router.delete("/flow/nodes/{node_id}")
def delete_flow_node(node_id: str, user: str = Depends(verify_access)):
    # 1. READ DB
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute("SELECT type, file_path FROM flow_nodes WHERE id=?", (node_id,))
        row = cursor.fetchone()
        if not row:
            return {"status": "already_deleted"}

        node_type = row["type"]
        file_path = row["file_path"]
        to_delete = [node_id]

        if node_type == "triggerNode":
            cursor = conn.execute("SELECT id, meta_tags FROM flow_nodes")
            for r in cursor.fetchall():
                try:
                    mt = json.loads(r["meta_tags"])
                    if mt.get("engagement_id") == node_id:
                        to_delete.append(r["id"])
                except Exception:
                    pass
    finally:
        conn.close()  # Close DB before running deletions!

    # 2. FILE SYSTEM OPERATIONS
    if node_type == "triggerNode":
        folder_path = file_path.rsplit('/', 1)[0]
        try:
            file_system.delete_item(folder_path)
        except Exception:
            pass
    else:
        try:
            file_system.delete_item(file_path)
        except Exception:
            pass

    # 3. WRITE DB
    conn = get_db()
    try:
        for tid in to_delete:
            conn.execute("DELETE FROM flow_nodes WHERE id=?", (tid,))
            conn.execute("DELETE FROM flow_edges WHERE source=? OR target=?", (tid, tid))
        conn.commit()
    finally:
        conn.close()

    return {"status": "deleted"}


@router.post("/flow/edges")
async def create_flow_edge(request: Request, user: str = Depends(verify_access)):
    edge = await request.json()
    conn = get_db()
    conn.execute("INSERT INTO flow_edges (id, source, target, label) VALUES (?, ?, ?, ?)",
                 (edge["id"], edge["source"], edge["target"], edge.get("label", "")))
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


@router.post("/flow/nodes/{node_id}/upload")
async def upload_flow_image_to_node(node_id: str, file: UploadFile = File(...), user: str = Depends(verify_access)):
    # 1. Find which test folder this node belongs to
    conn = get_db()
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT file_path FROM flow_nodes WHERE id=?", (node_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Node not found")

    # 2. Create an 'assets' folder INSIDE that specific test folder
    folder_path = row["file_path"].rsplit('/', 1)[0]
    assets_dir = VAULT_DIR / folder_path / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # 3. Save the file
    safe_filename = f"{int(time.time())}_{file.filename.replace(' ', '_')}"
    file_path_on_disk = assets_dir / safe_filename

    content = await file.read()
    with open(file_path_on_disk, "wb") as f:
        f.write(content)

    rel_path = f"{folder_path}/assets/{safe_filename}"
    return {"path": rel_path}


@router.get("/flow/images/{file_path:path}")
def serve_flow_image(file_path: str):
    """Serves the isolated images directly to the Markdown Editor."""
    target = VAULT_DIR / file_path
    if not target.exists() or not str(target.resolve()).startswith(str(VAULT_DIR.resolve())):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(target)


@router.post("/flow/nodes/{node_id}/parse")
async def parse_scan_file(node_id: str, file: UploadFile = File(...), user: str = Depends(verify_access)):
    try:
        raw_content = await file.read()
        try:
            content_str = raw_content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File must be a valid text file.")

        parsed_data = route_and_parse(content_str)

        return {
            "markdown_result": parsed_data.get("markdown", parsed_data.get("markdown_result", "")),
            "title": parsed_data.get("title", "Parsed Scan"),
            "command": parsed_data.get("command", "")
        }
    except ImportError:
        raise HTTPException(status_code=501, detail="Parser folder not found.")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")


@router.post("/flow/export/")
async def export_project(request: Request, user: str = Depends(verify_access)):
    payload = await request.json()
    nodes = payload.get("nodes", [])

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        # 1. Add the JSON data to the root of the ZIP
        zip_file.writestr("data.json", json.dumps(payload, indent=2))

        # 2. Scan the markdown for image links and add those files to the ZIP
        for node in nodes:
            md = node.get("markdown_result", "")
            if md:
                # Find NEW architecture images (/api/flow/images/_Flows/...)
                new_matches = re.findall(r'/api/flow/images/([a-zA-Z0-9_./-]+)', md)
                for file_path in new_matches:
                    target_file = VAULT_DIR / file_path
                    if target_file.exists():
                        # Save it cleanly as 'assets/filename.png' inside the ZIP
                        zip_file.write(target_file, f"assets/{target_file.name}")

                # Find OLD legacy PentestFlow images (/uploads/...)
                old_matches = re.findall(r'/uploads/([a-zA-Z0-9_.-]+)', md)
                for filename in old_matches:
                    # In case you manually migrated old uploads to assets
                    target_file = VAULT_DIR / "assets" / filename
                    if target_file.exists():
                        zip_file.write(target_file, f"uploads/{filename}")

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=pentest_backup.zip"}
    )


@router.post("/flow/import/")
async def import_project(file: UploadFile = File(...), user: str = Depends(verify_access)):
    contents = await file.read()
    zip_buffer = io.BytesIO(contents)
    imported_engagement_id = None

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            if "data.json" not in zip_file.namelist():
                raise HTTPException(status_code=400, detail="Invalid zip: data.json missing")

            data_bytes = zip_file.read("data.json")
            parsed_data = json.loads(data_bytes)

            nodes_data = parsed_data if isinstance(parsed_data, list) else parsed_data.get("nodes", [])
            edges_data = [] if isinstance(parsed_data, list) else parsed_data.get("edges", [])

            if isinstance(parsed_data, list):
                for node in nodes_data:
                    parent_id = node.get("meta_tags", {}).get("parent_id")
                    if parent_id:
                        edges_data.append(
                            {"id": f"e-{parent_id}-{node['id']}", "source": str(parent_id), "target": str(node["id"]),
                             "label": ""})

            # 1. Setup Folders
            folder_path = ""
            trigger_node = next((n for n in nodes_data if n.get("type") == "triggerNode"), None)

            if trigger_node:
                imported_engagement_id = trigger_node["id"]
                safe_title = re.sub(r'[^\w\s-]', '', trigger_node.get("title", "Imported_Test")).strip().replace(' ',
                                                                                                                 '_')
                folder_path = f"_Flows/{safe_title}_{imported_engagement_id[:8]}"
            else:
                imported_engagement_id = str(uuid.uuid4())
                folder_path = f"_Flows/Imported_{int(time.time())}"

            try:
                file_system.create_folder(folder_path)
            except:
                pass

            # 2. Extract Images securely
            assets_dir = VAULT_DIR / folder_path / "assets"
            assets_dir.mkdir(parents=True, exist_ok=True)

            image_map = {}
            for name in zip_file.namelist():
                if (name.startswith("uploads/") or name.startswith("assets/")) and not name.endswith("/"):
                    filename = name.split("/")[-1]
                    file_data = zip_file.read(name)
                    safe_filename = f"{int(time.time())}_{filename}"
                    with open(assets_dir / safe_filename, "wb") as f:
                        f.write(file_data)
                    image_map[filename] = f"/api/flow/images/{folder_path}/assets/{safe_filename}"

            # 3. PRE-PROCESS NODES (File IO safely completely outside of Database scope)
            for node in nodes_data:
                node_id = node["id"]
                title = node.get("title", "Imported Node")
                node_type = node.get("type", "actionNode")
                status = node.get("status", "action")
                command = node.get("command", "")
                md_res = node.get("markdown_result", "")

                for old_img, new_img in image_map.items():
                    md_res = re.sub(r'/uploads/' + re.escape(old_img), new_img, md_res)
                    md_res = re.sub(r'/api/flow/images/[a-zA-Z0-9_./-]+/assets/' + re.escape(old_img), new_img, md_res)

                safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
                file_path = f"{folder_path}/{safe_title}_{node_id[:8]}.md"

                content = f"---\ntype: {node_type}\nstatus: {status}\n---\n\n# {title}\n\n"
                if node_type == "stickyNote":
                    content += node.get("note", "")
                else:
                    if command: content += f"**Command:**\n```bash\n{command}\n```\n\n---\n\n"
                    content += f"## Notes & Evidence\n{md_res}"

                file_system.save_note_content(file_path, content)

                # Save computed path for the DB phase
                node["_file_path"] = file_path

            # 4. PROCESS DB ENTRIES (All File IO is completely finished)
            conn = get_db()
            try:
                for node in nodes_data:
                    meta_tags = node.get("meta_tags", {})
                    meta_tags.pop("parent_id", None)

                    cursor = conn.execute("SELECT id FROM flow_nodes WHERE id=?", (node["id"],))
                    if cursor.fetchone():
                        conn.execute("""
                            UPDATE flow_nodes SET title=?, type=?, command=?, status=?, position_x=?, position_y=?, meta_tags=?, file_path=? WHERE id=?
                        """, (node.get("title"), node.get("type"), node.get("command"), node.get("status"),
                              node.get("position_x", 0), node.get("position_y", 0), json.dumps(meta_tags),
                              node["_file_path"], node["id"]))
                    else:
                        conn.execute("""
                            INSERT INTO flow_nodes (id, title, type, command, status, position_x, position_y, file_path, meta_tags)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (node["id"], node.get("title"), node.get("type"), node.get("command"), node.get("status"),
                              node.get("position_x", 0), node.get("position_y", 0), node["_file_path"],
                              json.dumps(meta_tags)))

                for edge in edges_data:
                    cursor = conn.execute("SELECT id FROM flow_edges WHERE id=?", (edge["id"],))
                    if cursor.fetchone():
                        conn.execute("UPDATE flow_edges SET source=?, target=?, label=? WHERE id=?",
                                     (edge.get("source"), edge.get("target"), edge.get("label"), edge["id"]))
                    else:
                        conn.execute("INSERT INTO flow_edges (id, source, target, label) VALUES (?, ?, ?, ?)",
                                     (edge["id"], edge.get("source"), edge.get("target"), edge.get("label")))

                conn.commit()
            finally:
                conn.close()

        return {
            "message": "Project imported successfully!",
            "engagement_id": imported_engagement_id
        }

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file format")