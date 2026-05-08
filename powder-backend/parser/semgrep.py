import json

class SemgrepParser:
    def detect(self, file_content: str) -> bool:
        """Detects if the file is a Semgrep JSON output."""
        try:
            data = json.loads(file_content)
            # Semgrep JSON typically contains a 'results' or 'vulns' array
            if "results" in data or "vulns" in data:
                return True
            return False
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses the Semgrep JSON and converts it to PentestFlow Markdown."""
        try:
            data = json.loads(file_content)
            md_output = "### Semgrep Code Analysis\n\n"

            findings = []
            is_vulns = False

            if "results" in data:
                findings = data.get("results", [])
            elif "vulns" in data:
                findings = data.get("vulns", [])
                is_vulns = True
            else:
                raise ValueError("No valid findings array found in JSON.")

            # 1. Build the Summary Table
            md_output += "| Severity | Title / Check ID | File | Line |\n"
            md_output += "|---|---|---|---|\n"

            if not findings:
                md_output += "| - | - | - | No vulnerabilities found. |\n"
                return {"markdown": md_output, "command": "", "title": "Semgrep Scan"}

            detailed_findings = []

            for item in findings:
                # Extract data based on whether it's a standard result or a dependency vuln
                if not is_vulns:
                    title = item.get("check_id", "Unknown")
                    severity_raw = item.get("extra", {}).get("severity", "INFO")
                    file_path = item.get("path", "Unknown")
                    line = item.get("start", {}).get("line", "0")
                    description = self.get_description(item)
                    mitigation = self.get_mitigation(item)
                else:
                    title = item.get("title", "Unknown")
                    severity_raw = item.get("advisory", {}).get("severity", "INFO")
                    file_path = item.get("dependencyFileLocation", {}).get("path", "Unknown")
                    line = item.get("dependencyFileLocation", {}).get("startLine", "0")
                    description = item.get("advisory", {}).get("description", "No description provided.")
                    mitigation = ""

                severity = self.convert_severity(severity_raw)

                # Add row to the summary table
                md_output += f"| {severity} | {title} | `{file_path}` | {line} |\n"

                # Build the detailed section for the bottom
                detail = f"**{title}**\n* **Severity:** {severity}\n* **File:** `{file_path}:{line}`\n\n"
                detail += f"{description}\n"
                if mitigation:
                    detail += f"\n**Mitigation:**\n{mitigation}\n"

                detailed_findings.append(detail)

            # 2. Append the Detailed Findings
            if detailed_findings:
                md_output += "\n#### Detailed Findings\n\n"
                md_output += "\n---\n\n".join(detailed_findings)

            return {
                "markdown": md_output,
                "command": "", # JSON outputs rarely include the exact CLI command
                "title": "Semgrep SAST Scan"
            }

        except Exception as e:
            return {"markdown": f"### Semgrep Scan Results\n\n**Error:** Failed to parse Semgrep JSON: {str(e)}", "command": "", "title": "Semgrep: Parse Error"}

    def convert_severity(self, val: str) -> str:
        """Converts Semgrep severities to standard labels."""
        if not val:
            return "Info"
        upper_value = str(val).upper()
        if upper_value == "CRITICAL":
            return "🔴 Critical"
        if upper_value in {"WARNING", "MEDIUM"}:
            return "🟠 Medium"
        if upper_value in {"ERROR", "HIGH"}:
            return "🔴 High"
        if upper_value in {"LOW", "INFO"}:
            return "🔵 Low"
        return "⚪ Info"

    def get_description(self, item: dict) -> str:
        """Extracts the message and the code snippet."""
        description = ""
        extra = item.get("extra", {})

        if "message" in extra:
            description += f"{extra['message']}\n\n"

        snippet = extra.get("lines")
        if snippet and snippet != "requires login":
            description += f"**Vulnerable Code Snippet:**\n```text\n{snippet}\n```\n"

        return description

    def get_mitigation(self, item: dict) -> str:
        """Extracts the recommended fix or regex."""
        extra = item.get("extra", {})
        if "fix" in extra:
            return f"```text\n{extra['fix']}\n```"
        elif "fix_regex" in extra:
            return f"**Automated Regex Fix Available:**\n```json\n{json.dumps(extra['fix_regex'])}\n```"
        return ""