from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.routes import router as api_router
import api.auth as auth_routes
from services.file_system import VAULT_DIR
from database import init_db


init_db()
app = FastAPI(title="Powder Backend")

(VAULT_DIR / "assets").mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=VAULT_DIR / "assets"), name="assets")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "chrome-extension://phldinkeiemfggcaekcfkglndkdokjgj"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect all our routes under the "/api" prefix
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Auth"])
app.include_router(api_router, prefix="/api", tags=["Notes"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)