import json


class ESLintParser:
    """
    Standalone ESLint JSON Parser.
    Converts ESLint scanner output directly into formatted Markdown.
    Groups identical rule violations to prevent report bloat.
    """

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for ESLint-specific signatures.
        ESLint JSON output is typically a list of file objects containing a 'messages' array.
        """
        try:
            data = json.loads(file_content)

            if isinstance(data, list) and len(data) > 0:
                first_item = data[0]
                if "filePath" in first_item and "messages" in first_item:
                    return True
        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes an ESLint JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for item in data:
                file_path = item.get("filePath", "Unknown File")
                messages = item.get("messages", [])

                if not messages:
                    continue

                for msg in messages:
                    rule_id = msg.get("ruleId") or "Unknown Rule"
                    message_text = msg.get("message", "No message provided.")
                    line = str(msg.get("line", "0"))

                    # Convert ESLint numeric severities (1=Warning/Medium, 2=Error/High)
                    severity_int = msg.get("severity", 0)
                    severity = self._convert_eslint_severity(severity_int)

                    # Grouping Key: Groups identical rule violations to avoid report bloat
                    group_key = f"{severity}_{rule_id}_{message_text}"

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": message_text,
                            "rule_id": rule_id,
                            "severity": severity,
                            "occurrences": []
                        }

                    grouped_findings[group_key]["occurrences"].append({
                        "file": file_path,
                        "line": line
                    })

            # --- Generate the Markdown ---
            md_output = "### ESLint Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No issues found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "ESLint Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | ESLint Rule ID |\n"
                md_output += "|---|---|\n"
                md_output += f"| {f['severity']} | `{f['rule_id']}` |\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"

                # If a linting rule is broken in dozens of files, wrap it in a details tag
                # to keep the PDF report clean and readable.
                if len(f['occurrences']) > 15:
                    md_output += "<details>\n<summary><b>View all affected files</b></summary>\n\n"
                    for occ in f['occurrences']:
                        md_output += f"- `{occ['file']}` (Line {occ['line']})\n"
                    md_output += "\n</details>\n\n"
                else:
                    for occ in f['occurrences']:
                        md_output += f"- `{occ['file']}` (Line {occ['line']})\n"
                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "ESLint Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### ESLint Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "ESLint: Parse Error"
            }

    def _convert_eslint_severity(self, eslint_severity: int) -> str:
        """Converts ESLint integer severities into standard text labels."""
        if eslint_severity == 2:
            return "High"
        if eslint_severity == 1:
            return "Medium"
        return "Info"