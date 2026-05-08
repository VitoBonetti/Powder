import json


class HorusecParser:
    """
    Standalone Horusec SAST JSON Parser.
    Converts Horusec scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for Horusec-specific signatures.
        """
        try:
            data = json.loads(file_content)

            # Horusec JSON outputs reliably contain these root keys
            if "analysisVulnerabilities" in data and "createdAt" in data and "status" in data:
                return True

        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes a Horusec JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            # Extract Report Metadata
            report_date = data.get("createdAt", "Unknown Date")[:10]
            version = data.get("version", "Unknown").lstrip("v")
            status = data.get("status", "Unknown")
            errors = data.get("errors", "")

            # Iterate through vulnerabilities
            for node in data.get("analysisVulnerabilities", []):
                vuln = node.get("vulnerabilities", {})
                if not vuln:
                    continue

                # Horusec merges title and description in 'details' separated by newlines
                details_parts = vuln.get("details", "").strip().split("\n")
                title = details_parts[0] if details_parts else "Unknown Vulnerability"
                description = details_parts[-1] if len(details_parts) > 1 else "No additional description provided."

                severity = vuln.get("severity", "Low").capitalize()
                confidence = vuln.get("confidence", "Low").capitalize()

                # Grouping Key: Groups identical vulnerabilities to avoid report bloat
                group_key = f"{severity}_{title}"

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": title,
                        "severity": severity,
                        "confidence": confidence,
                        "description": description,
                        "occurrences": []
                    }

                # Clean up the code snippet and line numbers
                file_path = vuln.get("file", "Unknown File")
                line = vuln.get("line", "0")
                if not str(line).isdigit():
                    line = "0"

                code = vuln.get("code", "").replace("```", "\\`\\`\\`").replace("\x00", "").strip()
                language = vuln.get("language", "text")

                grouped_findings[group_key]["occurrences"].append({
                    "file_path": file_path,
                    "line": line,
                    "code": code,
                    "language": language
                })

            # --- Generate the Markdown ---
            md_output = "### Horusec SAST Scan Results\n\n"
            md_output += f"**Scan Date:** `{report_date}` | **Horusec Version:** `{version}` | **Status:** `{status}`\n\n"

            # Check if Horusec reported internal errors during the scan
            if errors:
                md_output += "**Scan Errors:**\n"
                md_output += f"```text\n{errors.replace('```', '``````')}\n```\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Horusec SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Confidence | Occurrences |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['confidence']} | {len(f['occurrences'])} |\n\n"

                md_output += "**Description:**\n"
                md_output += f"{f['description']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['file_path']}` (Line {occ['line']})\n"
                md_output += "\n"

                # Code Snippets in a collapsible details tag
                has_code = any(occ['code'] for occ in f['occurrences'])
                if has_code:
                    md_output += "<details>\n<summary><b>View Affected Code Snippets</b></summary>\n\n"
                    for occ in f['occurrences']:
                        if occ['code']:
                            md_output += f"**File:** `{occ['file_path']}` **Line:** `{occ['line']}`\n"
                            md_output += f"```{occ['language'].lower()}\n{occ['code']}\n```\n\n"
                    md_output += "</details>\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Horusec SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Horusec Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Horusec: Parse Error"
            }