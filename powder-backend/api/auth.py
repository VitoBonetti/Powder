import os
import httpx
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# --- CONFIGURATION ---
CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET", "fallback_secret")
ALGORITHM = "HS256"
ALLOWED_USERS_STR = os.getenv("ALLOWED_GITHUB_USERNAMES", "")
ALLOWED_USERS = [user.strip() for user in ALLOWED_USERS_STR.split(",") if user.strip()]
CLI_API_KEY = os.getenv("POWDER_API_KEY")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# --- THE SECURITY GATE (MIDDLEWARE) ---
def get_current_user(request: Request):
    """Reads the HttpOnly cookie and validates the JWT session."""
    token = request.cookies.get("powder_session")

    if not token:
        raise HTTPException(status_code=401, detail="No session cookie found.")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        username = payload.get("sub")

        if username not in ALLOWED_USERS:
            raise HTTPException(status_code=403, detail="Unauthorized user.")

        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session token.")


# --- OAUTH ROUTES ---

@router.get("/login")
def login_via_github():
    """Step 1: Redirects the user to GitHub's secure login page."""
    url = f"https://github.com/login/oauth/authorize?client_id={CLIENT_ID}&scope=read:user"
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str, response: Response):
    """Step 2: GitHub sends us a temporary code. We exchange it for the user's identity."""
    async with httpx.AsyncClient() as client:
        # Trade code for access token
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code
            },
            headers={"Accept": "application/json"}
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to authenticate with GitHub")

        # Ask GitHub who this token belongs to
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        github_username = user_res.json().get("login")

    # Step 3: THE BOUNCER
    if github_username not in ALLOWED_USERS:
        raise HTTPException(status_code=403, detail="Red Team Alert: You are not authorized to view this Vault.")

    # Step 4: Create the JWT payload
    expire = datetime.now(timezone.utc) + timedelta(days=7)  # 7-day session
    jwt_data = {"sub": github_username, "exp": expire}
    encoded_jwt = jwt.encode(jwt_data, JWT_SECRET, algorithm=ALGORITHM)

    # Step 5: Set the HttpOnly Cookie and Redirect back to React
    redirect = RedirectResponse("http://localhost:5173/")  # Back to React App
    redirect.set_cookie(
        key="powder_session",
        value=encoded_jwt,
        httponly=True,  # JS cannot read this! (Protects against XSS)
        secure=False,  # Set to True later when using HTTPS/Cloudflare
        samesite="lax",  # Prevents CSRF attacks
        max_age=7 * 24 * 60 * 60
    )
    return redirect


@router.get("/me")
def check_session(user: str = Depends(get_current_user)):
    """Used by React to check if you are currently logged in."""
    return {"authenticated": True, "user": user}


@router.get("/logout")
def logout():
    """Destroys the session cookie."""
    redirect = RedirectResponse("http://localhost:5173/login")
    redirect.delete_cookie("powder_session")
    return redirect


def verify_access(request: Request, api_key: str = Security(api_key_header)):
    """Universal lock: Accepts either a valid CLI header OR a valid Browser cookie."""

    # 1. Check for the CLI / Extension Key First
    if api_key and api_key == CLI_API_KEY:
        return "cli_agent"

    # 2. Check for the Browser Cookie
    token = request.cookies.get("powder_session")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            username = payload.get("sub")
            if username in ALLOWED_USERS:
                return username
        except Exception:
            pass  # Token invalid or expired, drop down to the 401 error

    # 3. If neither are valid, slam the door
    raise HTTPException(status_code=401, detail="Red Team Alert: Unauthorized Access")