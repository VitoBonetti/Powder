import json
import hashlib


class TruffleHog3Parser:
    """
    Standalone TruffleHog3 JSON Parser.
    Converts TruffleHog3 secret scanner output directly into formatted Markdown.
    Supports both 'legacy' and 'current' JSON formats of TruffleHog3.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a TruffleHog3 JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if isinstance(first, dict):
                    # Legacy format uses 'reason', Current format uses 'rule'
                    if "reason" in first or "rule" in first:
                        return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses TruffleHog3 JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())
            grouped_findings = {}

            for item in data:
                if "reason" in item:
                    self._parse_legacy(item, grouped_findings)
                elif "rule" in item:
                    self._parse_current(item, grouped_findings)
                else:
                    continue  # Unrecognized format in this specific node

            # --- Generate Markdown ---
            md_output = "### TruffleHog3 Secret Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No hardcoded secrets or high entropy strings found in the repository.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "TruffleHog3 Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Rule / Reason | File Path |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['rule']}` | `{f['file']}` |\n\n"

                md_output += "**Mitigation:** Secrets and passwords should be removed from source control, rotated immediately, and stored in a secure vault.\n\n"

                # Render occurrences (affected commits/lines)
                occurrences = f['occurrences']
                md_output += f"**Exposure Details ({len(occurrences)} occurrences):**\n\n"

                for idx, occ in enumerate(occurrences[:20]):  # Cap at 20 to prevent massive walls of text
                    md_output += f"**Instance {idx + 1}:**\n"
                    if occ.get('line'):
                        md_output += f"- **Line:** {occ['line']}\n"
                    if occ.get('secret') or occ.get('strings'):
                        sec_val = occ.get('secret') or occ.get('strings')
                        md_output += f"- **Secret/String:** `{sec_val}`\n"
                    if occ.get('commit'):
                        md_output += f"- **Commit:** `{occ['commit']}` ({occ.get('date', 'Unknown Date')})\n"
                    if occ.get('branch'):
                        md_output += f"- **Branch:** `{occ['branch']}`\n"
                    if occ.get('commit_message'):
                        msg = occ['commit_message'].replace('\n', ' ')
                        md_output += f"- **Commit Message:** {msg}\n"
                    md_output += "\n"

                if len(occurrences) > 20:
                    md_output += f"*... and {len(occurrences) - 20} more exposure instances in this file.*\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "TruffleHog3 Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### TruffleHog3 Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "TruffleHog3: Parse Error"
            }

    # ==========================================
    # Parsing Strategies
    # ==========================================
    def _parse_legacy(self, item: dict, grouped_findings: dict):
        """Parses the older TruffleHog format."""
        file_path = item.get("path", "Unknown File")
        reason = item.get("reason", "Unknown Reason")

        # Severity Logic for Legacy
        severity = "High"
        if reason == "High Entropy":
            severity = "Info"
        elif any(x in reason for x in ["Oauth", "AWS", "Heroku"]):
            severity = "Critical"
        elif reason == "Generic Secret":
            severity = "Medium"

        strings_found = ", ".join(item.get("stringsFound", []))

        group_key = hashlib.sha256(f"{file_path}_{reason}".encode("utf-8")).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"Hardcoded {reason} in {file_path}",
                "rule": reason,
                "file": file_path,
                "severity": severity,
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "strings": strings_found,
            "commit": item.get("commitHash"),
            "date": item.get("date"),
            "branch": item.get("branch")
        })

    def _parse_current(self, item: dict, grouped_findings: dict):
        """Parses the current TruffleHog3 format."""
        rule_data = item.get("rule", {})
        message = rule_data.get("message", "Unknown Rule")
        severity_raw = rule_data.get("severity", "Medium")
        severity = self._normalize_severity(severity_raw)

        file_path = item.get("path", "Unknown File")
        line = item.get("line", 0)
        secret = item.get("secret", "Hidden")

        group_key = hashlib.sha256(f"{file_path}_{message}".encode("utf-8")).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"{message} found in {file_path}",
                "rule": message,
                "file": file_path,
                "severity": severity,
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "secret": secret,
            "line": line,
            "commit": item.get("commit"),
            "date": item.get("date"),
            "branch": item.get("branch"),
            "commit_message": item.get("message")
        })

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Medium"
        s = severity.strip().capitalize()
        if s in {"Critical", "High", "Medium", "Low", "Info"}:
            return s
        return "Medium"