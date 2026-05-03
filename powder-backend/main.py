from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router

app = FastAPI(title="Powder Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect all our routes under the "/api" prefix
app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "Powder Backend is explosive, structured, and ready."}