import json
import hashlib
from datetime import datetime


class DetectSecretsParser:
    """
    Standalone Detect-secrets JSON Parser.
    Converts detect-secrets scanner output directly into formatted Markdown.
    Groups occurrences and handles verification/active statuses.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a detect-secrets JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            # Check for standard detect-secrets root keys
            if isinstance(data, dict) and "results" in data and "version" in data:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses detect-secrets JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())

            # Extract scan timestamp
            scan_date = "N/A"
            if data.get("generated_at"):
                scan_date = data.get("generated_at")

            grouped_findings = {}
            results = data.get("results", {})

            for filename, findings in results.items():
                for item in findings:
                    item_type = item.get("type", "Unknown Secret Type")
                    line = item.get("line_number", 0)
                    hashed_secret = item.get("hashed_secret", "")
                    is_verified = item.get("is_verified", False)

                    # Status logic: Active if "is_secret" is missing or True
                    is_active = item.get("is_secret", True)
                    is_fp = not is_active

                    # Deduplication key based on original parser logic
                    dupe_key = hashlib.sha256(
                        (item_type + filename + str(line) + hashed_secret).encode("utf-8")
                    ).hexdigest()

                    if dupe_key not in grouped_findings:
                        grouped_findings[dupe_key] = {
                            "title": item_type,
                            "file_path": filename,
                            "line": line,
                            "severity": "High",  # detect-secrets doesn't provide severity; High is standard for secrets
                            "verified": is_verified,
                            "active": is_active,
                            "false_positive": is_fp,
                            "hashed_secret": hashed_secret,
                            "nb_occurrences": 1
                        }
                    else:
                        grouped_findings[dupe_key]["nb_occurrences"] += 1

            # --- Generate Markdown ---
            md_output = "### Detect-secrets Scan Results\n\n"
            md_output += f"**Scan Generated At:** `{scan_date}`\n\n---\n\n"

            if not grouped_findings:
                md_output += "*No secrets were detected in the provided source files.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Detect-secrets Scan"
                }

            # Sort by file path and then line number
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: (x['file_path'], x['line'])
            )

            for f in sorted_findings:
                status_tags = []
                if f['verified']: status_tags.append("✅ Verified")
                if f['false_positive']: status_tags.append("❌ False Positive")
                if not f['active']: status_tags.append("⚠️ Inactive")

                tag_str = f" ({', '.join(status_tags)})" if status_tags else ""

                md_output += f"#### {f['title']}{tag_str}\n\n"

                # Metadata Table
                md_output += "| Property | Value |\n"
                md_output += "|---|---|\n"
                md_output += f"| **File** | `{f['file_path']}` |\n"
                md_output += f"| **Line** | {f['line']} |\n"
                md_output += f"| **Severity** | {f['severity']} |\n"
                md_output += f"| **Occurrences** | {f['nb_occurrences']} |\n\n"

                md_output += "**Hashed Secret:**\n"
                md_output += f"```text\n{f['hashed_secret']}\n```\n"

                md_output += "**Mitigation:**\n"
                md_output += "If this is a valid secret, rotate it immediately and remove it from the version control history. "
                md_output += "Use environment variables or a secret management vault to provide secrets to your application.\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Detect-secrets Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Detect-secrets Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Detect-secrets: Parse Error"
            }