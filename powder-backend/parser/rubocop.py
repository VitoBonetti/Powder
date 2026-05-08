import json


class RubocopParser:
    """
    Standalone RuboCop JSON Parser.
    Converts RuboCop scanner output directly into formatted Markdown.
    Filters exclusively for 'Security/*' cops to prevent linting noise.
    """

    def __init__(self):
        self.SEVERITY_MAPPING = {
            "info": "Info",
            "refactor": "Medium",
            "convention": "Medium",
            "warning": "Medium",
            "error": "High",
            "fatal": "Critical",
        }

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for RuboCop-specific signatures.
        """
        try:
            data = json.loads(file_content)

            # RuboCop JSONs usually have a metadata block with the version
            if "metadata" in data and "rubocop_version" in data["metadata"]:
                return True

            # Fallback: check for the summary and files array
            if "summary" in data and "files" in data and "offense_count" in data["summary"]:
                return True

        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes a RuboCop JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for vuln_file in data.get("files", []):
                path = vuln_file.get("path", "Unknown File")

                for offense in vuln_file.get("offenses", []):
                    cop_name = offense.get("cop_name", "UnknownCop")

                    # STRICT FILTER: We only care about security findings, not code style/linting!
                    if not cop_name.lower().startswith("security"):
                        continue

                    message = offense.get("message", "No message provided.")
                    severity_raw = offense.get("severity", "convention")
                    severity = self.SEVERITY_MAPPING.get(severity_raw.lower(), "Medium")
                    correctable = offense.get("correctable", False)
                    line = offense.get("location", {}).get("start_line", "0")

                    # Grouping Key: Groups the same exact issue to avoid bloating the report
                    group_key = f"{severity}_{cop_name}_{message}"

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": message,
                            "cop_name": cop_name,
                            "severity": severity,
                            "correctable": correctable,
                            "occurrences": []
                        }

                    grouped_findings[group_key]["occurrences"].append({
                        "path": path,
                        "line": line
                    })

            # Generate the Markdown
            md_output = "### RuboCop Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security vulnerabilities found. (Linting and style issues were ignored).*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "RuboCop Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['cop_name']}\n\n"

                # Metadata Table
                md_output += "| Severity | Auto-Correctable? | Cop Name |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | `{f['correctable']}` | `{f['cop_name']}` |\n\n"

                md_output += "**Message:**\n"
                md_output += f"{f['title']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['path']}` (Line {occ['line']})\n"
                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "RuboCop Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### RuboCop Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "RuboCop: Parse Error"
            }