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
from datetime import datetime
import markdown2
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


# ==============================================================================
# PENTESTFLOW REPORTING & EXPORT
# ==============================================================================

def generate_pdf_from_html(html_content: str) -> bytes:
    try:
        from weasyprint import HTML, CSS
    except ImportError:
        raise HTTPException(status_code=500, detail="Weasyprint is not installed. Please run: pip install weasyprint")

    # A highly polished, modern CSS stylesheet for the Pentest Reports
    css = CSS(string="""
        @page { margin: 2cm; size: A4; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; line-height: 1.6; word-wrap: break-word; }
        h1 { color: #0f172a; border-bottom: 2px solid #0ea5e9; padding-bottom: 8px; font-size: 28px;}
        h2 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;}
        h3 { color: #334155; margin-top: 25px;}
        pre { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; overflow-wrap: break-word; white-space: pre-wrap; font-size: 13px; }
        code { font-family: 'Courier New', Courier, monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 13px; color: #db2777; }
        .finding-box { border: 1px solid #cbd5e1; padding: 20px; margin-bottom: 25px; border-radius: 8px; page-break-inside: avoid; background-color: #ffffff; }
        .page-break { page-break-before: always; }
        .status-dot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; margin-right: 10px; vertical-align: middle; }
        .status-vuln { background-color: #ef4444; }
        .status-path { background-color: #22c55e; }
        .status-rabbit { background-color: #94a3b8; }
        .status-action { background-color: #0ea5e9; }
        img { max-width: 100%; height: auto; border-radius: 6px; margin: 15px 0; border: 1px solid #e2e8f0; }

        /* --- FIXED TABLE CSS --- */
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 13px; table-layout: fixed; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; word-wrap: break-word; overflow-wrap: break-word; hyphens: auto; }
        th { background-color: #f1f5f9; font-weight: bold; }
    """)
    return HTML(string=html_content).write_pdf(stylesheets=[css])


def prepare_markdown_for_pdf(md_text: str) -> str:
    """Translates API image routes into absolute local file paths so Weasyprint can render them."""
    def repl(match):
        prefix = match.group(1)
        rel_path = match.group(2)
        if prefix == '/api/flow/images/':
            target = VAULT_DIR / rel_path
        else:
            target = VAULT_DIR / "assets" / rel_path.lstrip('/')
        # Returns an absolute file:// URI for Weasyprint
        return f"]({target.resolve().as_uri()})"

    return re.sub(r'\]\((/api/flow/images/|/assets/)([^)]+)\)', repl, md_text)


@router.get("/flow/report/{engagement_id}")
def get_engagement_report(engagement_id: str, type: str = "full", user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        # Get Root Node
        cursor = conn.execute("SELECT * FROM flow_nodes WHERE id=?", (engagement_id,))
        root_node = cursor.fetchone()
        if not root_node:
            raise HTTPException(status_code=404, detail="Engagement not found")

        # Get all related Project Nodes
        cursor = conn.execute("SELECT * FROM flow_nodes")
        project_nodes = []
        for r in cursor.fetchall():
            meta = json.loads(r["meta_tags"]) if r["meta_tags"] else {}
            if r["id"] == engagement_id or meta.get("engagement_id") == engagement_id:
                project_nodes.append(dict(r))
    finally:
        conn.close()

    # Extract the markdown content directly from actual files in the Vault
    for n in project_nodes:
        try:
            content = file_system.read_note_content(n["file_path"])
            if "## Notes & Evidence\n" in content:
                n["markdown_result"] = content.split("## Notes & Evidence\n", 1)[-1].strip()
            else:
                n["markdown_result"] = ""
        except Exception:
            n["markdown_result"] = ""

    # Sort chronologically
    project_nodes.sort(key=lambda x: x.get("created_at", ""))
    vulnerabilities = [n for n in project_nodes if n["status"] == 'vulnerability']

    html_parts = []
    engagement_title = root_node["title"]
    header_md = f"# Penetration Test Report: {engagement_title}\n"
    header_md += f"**Date Generated:** {datetime.now().strftime('%Y-%m-%d')}\n\n"
    header_md += "## Executive Summary\n"
    header_md += f"- **Total Findings:** {len(vulnerabilities)}\n"
    if type == "full":
        header_md += f"- **Total Actions Logged:** {len(project_nodes) - 1}\n"

    html_parts.append(markdown2.markdown(header_md, extras=["tables", "fenced-code-blocks"]))

    if type == "vulns":
        html_parts.append("<div class='page-break'></div><h2>Confirmed Vulnerabilities</h2>")
        for v in vulnerabilities:
            meta = json.loads(v["meta_tags"]) if v["meta_tags"] else {}
            severity = meta.get("severity", "Unrated").upper()

            v_md = f"### {v['title']} [{severity}]\n\n"
            if v.get("command"):
                v_md += f"**Execution / Payload:**\n```bash\n{v['command']}\n```\n\n"
            if v.get("markdown_result"):
                v_md += f"**Evidence:**\n{prepare_markdown_for_pdf(v['markdown_result'])}\n"

            v_html = markdown2.markdown(v_md, extras=["tables", "fenced-code-blocks"])
            html_parts.append(f"<div class='finding-box'>{v_html}</div>")
    else:
        html_parts.append("<div class='page-break'></div><h2>Chronological Engagement Log</h2>")
        for node in project_nodes:
            if node["id"] == engagement_id:
                continue

            status = node.get("status")
            if status == "vulnerability":
                status_class = "status-vuln"
            elif status == "path":
                status_class = "status-path"
            elif status == "rabbit_hole":
                status_class = "status-rabbit"
            else:
                status_class = "status-action"

            status_dot_html = f"<span class='status-dot {status_class}'></span>"
            n_md = f"### {status_dot_html} {node['title']}\n"
            # Extract clean date from timestamp
            clean_date = node.get('created_at', '')[:19]
            n_md += f"*Logged at: {clean_date}*\n\n"

            if node.get("command"):
                n_md += f"**Command:**\n```bash\n{node['command']}\n```\n\n"
            if node.get("markdown_result"):
                n_md += f"{prepare_markdown_for_pdf(node['markdown_result'])}\n"

            n_html = markdown2.markdown(n_md, extras=["tables", "fenced-code-blocks"])
            html_parts.append(f"<div class='finding-box'>{n_html}</div>")

    final_html_body = "".join(html_parts)
    pdf_bytes = generate_pdf_from_html(final_html_body)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Report_{type}_{engagement_id}.pdf"}
    )


@router.get("/flow/report/node/{node_id}")
def get_single_node_report(node_id: str, user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute("SELECT * FROM flow_nodes WHERE id=?", (node_id,))
        node = cursor.fetchone()
    finally:
        conn.close()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    node = dict(node)

    # Read the markdown from the physical file
    try:
        content = file_system.read_note_content(node["file_path"])
        if "## Notes & Evidence\n" in content:
            node["markdown_result"] = content.split("## Notes & Evidence\n", 1)[-1].strip()
        else:
            node["markdown_result"] = ""
    except Exception:
        node["markdown_result"] = ""

    meta_tags = json.loads(node["meta_tags"]) if node["meta_tags"] else {}

    md_lines = [f"# Finding Export: {node['title']}\n"]
    md_lines.append(f"**Exported:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

    if meta_tags.get("severity"):
        md_lines.append(f"**Severity:** {meta_tags.get('severity').upper()}\n\n")

    if node.get("command"):
        md_lines.append(f"## Command / Execution\n```bash\n{node['command']}\n```\n")

    if node.get("markdown_result"):
        md_lines.append(f"## Evidence & Notes\n{prepare_markdown_for_pdf(node['markdown_result'])}\n")

    raw_html = markdown2.markdown("\n".join(md_lines), extras=["tables", "fenced-code-blocks"])
    pdf_bytes = generate_pdf_from_html(raw_html)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=NodeExport_{node_id}.pdf"}
    )


# ==============================================================================
# PENTESTFLOW: TOOLS LIBRARY ROUTES
# ==============================================================================

@router.get("/flow/categories")
def get_all_categories(user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in conn.execute("SELECT * FROM tool_categories ORDER BY name").fetchall()]
    finally:
        conn.close()


@router.post("/flow/categories")
async def create_category(request: Request, user: str = Depends(verify_access)):
    cat = await request.json()
    conn = get_db()
    try:
        cursor = conn.execute("SELECT id FROM tool_categories WHERE name=?", (cat["name"],))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Category already exists")

        cat_id = str(uuid.uuid4())
        conn.execute("INSERT INTO tool_categories (id, name) VALUES (?, ?)", (cat_id, cat["name"]))
        conn.commit()
        return {"id": cat_id, "name": cat["name"]}
    finally:
        conn.close()


@router.delete("/flow/categories/{cat_id}")
def delete_category(cat_id: str, user: str = Depends(verify_access)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM tool_categories WHERE id=?", (cat_id,))
        # Optional: Delete associated tools or leave them orphaned. We'll delete them to stay clean.
        conn.execute("DELETE FROM tools WHERE category_id=?", (cat_id,))
        conn.commit()
        return {"message": "Category deleted"}
    finally:
        conn.close()


@router.get("/flow/tools")
def get_all_tools(user: str = Depends(verify_access)):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in conn.execute("SELECT * FROM tools ORDER BY name").fetchall()]
    finally:
        conn.close()


@router.post("/flow/tools")
async def create_tool(request: Request, user: str = Depends(verify_access)):
    tool = await request.json()
    tool_id = str(uuid.uuid4())
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO tools (id, name, category_id, description, install_linux, install_windows, pentest_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (tool_id, tool["name"], tool["category_id"], tool.get("description"), tool.get("install_linux"),
              tool.get("install_windows"), tool.get("pentest_notes")))
        conn.commit()
        tool["id"] = tool_id
        return tool
    finally:
        conn.close()


@router.put("/flow/tools/{tool_id}")
async def update_tool(tool_id: str, request: Request, user: str = Depends(verify_access)):
    tool = await request.json()
    conn = get_db()
    try:
        conn.execute("""
            UPDATE tools SET name=?, category_id=?, description=?, install_linux=?, install_windows=?, pentest_notes=?
            WHERE id=?
        """, (tool["name"], tool["category_id"], tool.get("description"), tool.get("install_linux"),
              tool.get("install_windows"), tool.get("pentest_notes"), tool_id))
        conn.commit()
        tool["id"] = tool_id
        return tool
    finally:
        conn.close()


@router.delete("/flow/tools/{tool_id}")
def delete_tool(tool_id: str, user: str = Depends(verify_access)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM tools WHERE id=?", (tool_id,))
        conn.commit()
        return {"message": "Tool deleted"}
    finally:
        conn.close()


# ==============================================================================
# DOWNLOAD UTILIES ROUTES
# ==============================================================================

# Create a helper function to zip folders in memory
def stream_zip(folder_path: str, zip_filename: str):
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail=f"Folder {folder_path} not found on server.")

    mem_zip = io.BytesIO()

    # Compress files into the memory buffer
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                # Keep the folder structure inside the zip clean
                arcname = os.path.relpath(file_path, folder_path)
                zf.write(file_path, arcname)

    # Reset the buffer position to the beginning before sending
    mem_zip.seek(0)

    # Stream the buffer directly to the user as a download
    return StreamingResponse(
        mem_zip,
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
    )


# --- Add these routes to your FastAPI app ---

@router.get("/api/download/clipper")  # Use @router.get if you are in routes.py
def download_clipper(user: str = Depends(verify_access)):
    # Adjust this path based on where powder-clipper is relative to your backend script
    folder_path = "/extensions/powder-clipper"
    return stream_zip(folder_path, "powder-clipper.zip")


@router.get("/api/download/cli")  # Use @router.get if you are in routes.py
def download_cli(user: str = Depends(verify_access)):
    # Adjust this path based on where powder-cli is relative to your backend script
    folder_path = "/extensions/powder-cli"
    return stream_zip(folder_path, "powder-cli.zip")
