import json


class BrakemanParser:
    """
    Standalone Brakeman SAST JSON Parser.
    Converts Brakeman Rails scanner output directly into formatted Markdown.
    Groups identical warnings to prevent report bloat.
    """

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for Brakeman-specific signatures.
        """
        try:
            data = json.loads(file_content)

            # Brakeman JSON outputs consistently have 'scan_info' and 'warnings'
            if "scan_info" in data and "warnings" in data:
                if "brakeman_version" in data["scan_info"]:
                    return True

        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes a Brakeman JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            scan_info = data.get("scan_info", {})
            scan_date = scan_info.get("end_time", "Unknown Date")[:19]  # Trim to standard datetime
            app_path = scan_info.get("app_path", "Unknown Path")
            brakeman_version = scan_info.get("brakeman_version", "Unknown")

            warnings = data.get("warnings", [])

            for item in warnings:
                warning_type = item.get("warning_type", "Unknown Warning")
                message = item.get("message", "No message provided.")
                confidence = item.get("confidence", "Unknown").capitalize()
                link = item.get("link", "")

                file_path = item.get("file", "Unknown File")
                line = str(item.get("line", "0"))
                code = str(item.get("code", "") or "").replace("```", "\\`\\`\\`").strip()
                user_input = str(item.get("user_input", "") or "").strip()

                # Render paths can be lists or dicts, format them nicely
                render_path_raw = item.get("render_path")
                render_path = json.dumps(render_path_raw, indent=2) if render_path_raw else ""

                # Grouping Key: Groups identical rule violations
                group_key = f"{warning_type}_{message}"

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "warning_type": warning_type,
                        "message": message,
                        "link": link,
                        "occurrences": []
                    }

                grouped_findings[group_key]["occurrences"].append({
                    "file": file_path,
                    "line": line,
                    "confidence": confidence,
                    "code": code,
                    "user_input": user_input,
                    "render_path": render_path
                })

            # --- Generate the Markdown ---
            md_output = "### Brakeman (Rails SAST) Scan Results\n\n"
            md_output += f"**Scan Date:** `{scan_date}` | **Brakeman Version:** `{brakeman_version}` | **App Path:** `{app_path}`\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Brakeman SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['warning_type']}\n\n"

                md_output += f"**Message:** {f['message']}\n\n"

                if f['link']:
                    md_output += f"**Reference:** [Brakeman Documentation]({f['link']})\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['file']}` (Line {occ['line']}) — *Confidence: {occ['confidence']}*\n"
                md_output += "\n"

                # Check if we have extended evidence (Code, Input, Render Path)
                has_evidence = any(occ['code'] or occ['user_input'] or occ['render_path'] for occ in f['occurrences'])

                if has_evidence:
                    md_output += "<details>\n<summary><b>View Evidence & Render Paths</b></summary>\n\n"

                    for occ in f['occurrences']:
                        md_output += f"**File:** `{occ['file']}` **Line:** `{occ['line']}`\n"

                        if occ['user_input']:
                            md_output += f"> **User Input:** `{occ['user_input']}`\n\n"

                        if occ['code']:
                            md_output += f"```ruby\n{occ['code']}\n```\n"

                        if occ['render_path']:
                            md_output += "**Render Path:**\n"
                            md_output += f"```json\n{occ['render_path']}\n```\n"

                        md_output += "\n"

                    md_output += "</details>\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Brakeman SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Brakeman Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Brakeman: Parse Error"
            }