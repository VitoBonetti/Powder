import json
import hashlib


class HarborParser:
    """
    Standalone Harbor Vulnerability Parser.
    Converts Harbor registry API JSON output directly into formatted Markdown.
    Supports both direct vulnerability arrays and nested artifact API responses.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Harbor JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, dict):
                # Standard array format
                if "vulnerabilities" in data:
                    return True
                # Nested artifact format (e.g., data["application/vnd..."]["vulnerabilities"])
                first_key = next(iter(data.keys()), None)
                if first_key and isinstance(data[first_key], dict) and "vulnerabilities" in data[first_key]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Harbor JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())

            # Extract vulnerabilities array safely
            vulns = data.get("vulnerabilities")
            if vulns is None and data:
                first_key = next(iter(data.keys()), None)
                if first_key and isinstance(data[first_key], dict):
                    vulns = data[first_key].get("vulnerabilities")

            if not vulns:
                vulns = []

            grouped_findings = {}

            for item in vulns:
                item_id = item.get("id", "Unknown ID")
                package_name = item.get("package", "Unknown Package")
                package_version = item.get("version", "Unknown Version")
                severity = self._normalize_severity(item.get("severity"))

                description = item.get("description", "No description provided.")
                fix_version = item.get("fix_version", "")
                links = item.get("links", [])

                cwe_ids = item.get("cwe_ids", [])
                cwe = cwe_ids[0] if cwe_ids and cwe_ids[0] else "N/A"

                # Deduplication key based on ID, package, and version
                dupe_key = hashlib.sha256(
                    f"{item_id}_{package_name}_{package_version}".encode("utf-8")
                ).hexdigest()

                if dupe_key not in grouped_findings:
                    grouped_findings[dupe_key] = {
                        "id": item_id,
                        "package": package_name,
                        "version": package_version,
                        "severity": severity,
                        "description": description.strip(),
                        "fix_version": fix_version,
                        "links": links,
                        "cwe": cwe
                    }

            # --- Generate Markdown ---
            md_output = "### Harbor Container Image Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found in the Harbor scan report.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Harbor Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_vulns = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_vulns:
                md_output += f"#### [{f['id']}] {f['package']} (v{f['version']})\n\n"

                # Metadata Table
                md_output += "| Severity | Package | Version | Fixed Version | CWE |\n"
                md_output += "|---|---|---|---|---|\n"

                fix_str = f"`{f['fix_version']}`" if f['fix_version'] else "No fix available"
                md_output += f"| **{f['severity']}** | `{f['package']}` | `{f['version']}` | {fix_str} | {f['cwe']} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['links']:
                    md_output += "**References:**\n"
                    for link in f['links']:
                        md_output += f"- [{link}]({link})\n"
                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Harbor Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Harbor Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Harbor: Parse Error"
            }

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Info"
        s = severity.strip().capitalize()
        if s in {"Critical", "High", "Medium", "Low"}:
            return s
        return "Info"