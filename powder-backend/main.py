from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from api.routes import router as api_router
import api.auth as auth_routes
from services.file_system import VAULT_DIR, BASE_DIR
from database import init_db, sync_search_index

init_db()
sync_search_index(VAULT_DIR)
app = FastAPI(title="Powder Backend")

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