from pydantic import BaseModel


# Pydantic model to expect JSON data when saving a note
class NoteData(BaseModel):
    content: str

