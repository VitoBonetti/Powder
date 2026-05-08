import json


class HadolintParser:
    """
    Standalone Hadolint JSON Parser.
    Converts Hadolint Dockerfile linter output directly into formatted Markdown.
    Groups identical rule violations to produce a clean, actionable report.
    """

    # Hadolint uses 'error', 'warning', 'info', and 'style'
    SEVERITY_MAP = {
        "error": "Critical",
        "warning": "High",
        "info": "Info",
        "style": "Low",
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Hadolint JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            # Hadolint outputs a flat list of dictionaries
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if all(k in first for k in ("code", "line", "level", "message")):
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Hadolint JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())
            grouped_findings = {}

            for item in data:
                code = item.get("code", "Unknown Rule")
                message = item.get("message", "No description provided.")
                level = item.get("level", "info")
                severity = self.SEVERITY_MAP.get(level.lower(), "Info")

                file_path = item.get("file", "Dockerfile")
                line = item.get("line", 0)
                column = item.get("column", 0)

                # Group by Rule Code to aggregate occurrences
                if code not in grouped_findings:
                    grouped_findings[code] = {
                        "code": code,
                        "message": message,
                        "severity": severity,
                        "occurrences": set()
                    }

                # Add specific file location
                loc_str = f"`{file_path}` (Line: {line}, Column: {column})"
                grouped_findings[code]["occurrences"].add(loc_str)

            # --- Generate Markdown ---
            md_output = "### Hadolint Dockerfile Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No Dockerfile misconfigurations found. All best practices are followed.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Hadolint Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### [{f['code']}] {f['message']}\n\n"

                # Severity Badge
                md_output += f"**Severity:** {f['severity']}\n\n"

                # Render occurrences (affected lines)
                occurrences = sorted(list(f['occurrences']))
                md_output += f"**Affected Locations ({len(occurrences)} occurrences):**\n"

                for occ in occurrences[:30]:  # Cap at 30 to prevent massive walls of text
                    md_output += f"- {occ}\n"

                if len(occurrences) > 30:
                    md_output += f"- *... and {len(occurrences) - 30} more locations.*\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Hadolint Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Hadolint Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Hadolint: Parse Error"
            }