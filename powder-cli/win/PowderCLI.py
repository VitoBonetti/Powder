#!/usr/bin/env python3
import sys
import json
import urllib.request
import argparse
import os

# 1. Setup Arguments
parser = argparse.ArgumentParser(description="Pipe terminal output to Powder Vault")
parser.add_argument("title", nargs="?", default="Terminal Output", help="Title of the note")
parser.add_argument("-t", "--token", help="API Token for authentication")
args = parser.parse_args()

# 2. Token Hierarchy: Argument > Environment Variable
# Use the -t flag if provided, otherwise look for POWDER_TOKEN in the environment
token = args.token or os.environ.get("POWDER_TOKEN")

if not token:
    print("\n[-] Error: No API token provided.")
    print("    Use -t 'pwd_...' or set the POWDER_TOKEN environment variable.")
    sys.exit(1)

# 3. Read Piped Input
content = sys.stdin.read()
formatted_content = f"```text\n{content}\n```"

# 4. Build Payload
payload = {
    "title": args.title,
    "content": formatted_content,
    "source": "CLI Pipeline"
}

# 5. Execute Request
try:
    req = urllib.request.Request(
        "https://powder.vitobonetti.nl/api/inbox",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': token # Security header for the new SQLite system
        }
    )
    urllib.request.urlopen(req)
    print(f"\n[+] Successfully piped to Vault: '_Inbox/{args.title.replace(' ', '_')}.md'")
except Exception as e:
    print(f"\n[-] Failed to reach Powder Vault. Error: {e}")