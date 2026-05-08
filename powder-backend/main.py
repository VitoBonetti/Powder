from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from api.routes import router as api_router
import api.auth as auth_routes
from services.file_system import VAULT_DIR, BASE_DIR, process_inbox_background
import asyncio
import json
from pathlib import Path
from database import get_db, init_db, sync_search_index
from contextlib import asynccontextmanager
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class VaultWatchdogHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith(".md"):
            # Trigger a localized DB update (or full sync if easier for V1)
            # For performance, we should ideally write a `sync_single_file(path)` function.
            pass


async def sqlite_job_worker():
    """Polls SQLite for pending background tasks."""
    while True:
        try:
            conn = get_db()
            # Fetch the oldest pending job
            cursor = conn.execute(
                "SELECT id, task_type, payload FROM background_jobs WHERE status = 'PENDING' ORDER BY id ASC LIMIT 1"
            )
            job = cursor.fetchone()

            if job:
                job_id, task_type, payload_str = job['id'], job['task_type'], job['payload']

                # Mark as processing
                conn.execute("UPDATE background_jobs SET status = 'PROCESSING' WHERE id = ?", (job_id,))
                conn.commit()
                conn.close()  # Free the connection while the heavy task runs

                try:
                    # Execute the specific task
                    if task_type == "process_inbox":
                        data = json.loads(payload_str)
                        # Push the slow synchronous IO operation into a thread
                        await asyncio.to_thread(
                            process_inbox_background,
                            Path(data["file_path"]),
                            data["rel_path"],
                            data["content"],
                            data["source"]
                        )

                    # Mark as Completed
                    conn = get_db()
                    conn.execute("UPDATE background_jobs SET status = 'COMPLETED' WHERE id = ?", (job_id,))
                    conn.commit()
                    conn.close()

                except Exception as e:
                    print(f"Background Job {job_id} failed: {e}")
                    # Mark as Failed (You could add retry logic here later)
                    conn = get_db()
                    conn.execute("UPDATE background_jobs SET status = 'FAILED' WHERE id = ?", (job_id,))
                    conn.commit()
                    conn.close()
            else:
                conn.close()
                # Wait 3 seconds before polling again if the queue is empty
                await asyncio.sleep(3)

        except asyncio.CancelledError:
            # Graceful shutdown triggered by lifespan
            break
        except Exception as e:
            print(f"Worker polling error: {e}")
            await asyncio.sleep(5)


# --- 2. Update your Lifespan function ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB here so crash-recovery happens before the worker starts
    init_db()
    sync_search_index(VAULT_DIR)

    # Start the File System Watchdog
    observer = Observer()
    observer.schedule(VaultWatchdogHandler(), str(VAULT_DIR), recursive=True)
    observer.start()

    # Start the Background Job Worker
    worker_task = asyncio.create_task(sqlite_job_worker())

    yield

    # Shutdown gracefully
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

    observer.stop()
    observer.join()

init_db()
sync_search_index(VAULT_DIR)
app = FastAPI(title="Powder Backend", lifespan=lifespan)

(VAULT_DIR / "assets").mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=VAULT_DIR / "assets"), name="assets")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect all our routes under the "/api" prefix
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Auth"])
app.include_router(api_router, prefix="/api", tags=["Notes"])

# --- SERVE COMPILED REACT FRONTEND ---
frontend_dist = BASE_DIR / "frontend_dist"

if frontend_dist.exists():
    app.mount("/static", StaticFiles(directory=frontend_dist / "static"), name="frontend_static")


    @app.exception_handler(404)
    async def catch_all(request: Request, exc: HTTPException):
        # If it's a backend API call that failed, return standard JSON 404
        if request.url.path.startswith("/api") or request.url.path.startswith("/assets"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # Otherwise, let React handle the URL
        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        return JSONResponse({"detail": "Frontend not found"}, status_code=404)

if __name__ == "__main__":
    import uvicorn

    # Make sure to bind to 0.0.0.0 for Docker
    uvicorn.run(app, host="0.0.0.0", port=8000)