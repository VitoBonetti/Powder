from pydantic import BaseModel


# Pydantic model to expect JSON data when saving a note
class NoteData(BaseModel):
    content: str


class MoveData(BaseModel):
    source: str
    destination: str


class InboxItem(BaseModel):
    title: str
    content: str
    source: str = ""

class TokenRequest(BaseModel):
    name: str