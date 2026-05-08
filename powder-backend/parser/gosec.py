import json


class GosecParser:
    """
    Standalone Gosec SAST JSON Parser.
    Converts Gosec scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for Gosec-specific signatures.
        """
        try:
            data = json.loads(file_content)

            # Gosec JSON outputs consistently have 'Issues' and 'Stats' at the root
            if "Issues" in data and "Stats" in data:
                return True

        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes a Gosec JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            issues = data.get("Issues", [])

            for item in issues:
                rule_id = item.get("rule_id", "Unknown")
                details = item.get("details", "No details provided.")
                severity = item.get("severity", "Low").capitalize()
                confidence = item.get("confidence", "Unknown").capitalize()

                # Handle CWE Data
                cwe_data = item.get("cwe", {})
                cwe_id_str = cwe_data.get("id", "")
                cwe_id = f"CWE-{cwe_id_str}" if str(cwe_id_str).isdigit() else "N/A"

                # Handle References (CWE URL or Gosec Docs fallback)
                reference = cwe_data.get("url", "")
                if not reference:
                    reference = f"https://securego.io/docs/rules/{rule_id.lower()}.html"

                # Extract file and line info
                file_path = item.get("file", "Unknown File")
                line = str(item.get("line", "0"))
                # Gosec sometimes returns ranges like "25-30", just grab the start line
                if "-" in line:
                    line = line.split("-")[0]

                code = item.get("code", "").replace("```", "\\`\\`\\`").strip()

                # Grouping Key: Group identical issues to avoid report bloat
                group_key = f"{severity}_{rule_id}_{details}"

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": details,
                        "rule_id": rule_id,
                        "severity": severity,
                        "confidence": confidence,
                        "cwe": cwe_id,
                        "reference": reference,
                        "occurrences": []
                    }

                grouped_findings[group_key]["occurrences"].append({
                    "file": file_path,
                    "line": line,
                    "code": code
                })

            # Generate the Markdown
            md_output = "### Gosec SAST Scan Results\n\n"

            # Optionally extract some high-level stats from Gosec
            stats = data.get("Stats", {})
            if stats:
                files_scanned = stats.get("files", 0)
                lines_scanned = stats.get("lines", 0)
                md_output += f"**Scan Stats:** `{files_scanned}` files and `{lines_scanned}` lines scanned.\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Gosec SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']} (Rule `{f['rule_id']}`)\n\n"

                # Metadata Table
                md_output += "| Severity | Confidence | CWE |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['confidence']} | {f['cwe']} |\n\n"

                md_output += f"**Reference:** [Rule Documentation]({f['reference']})\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['file']}` (Line {occ['line']})\n"
                md_output += "\n"

                # Code Snippets in a collapsible details tag
                has_code = any(occ['code'] for occ in f['occurrences'])
                if has_code:
                    md_output += "<details>\n<summary><b>View Affected Code Snippets</b></summary>\n\n"
                    for occ in f['occurrences']:
                        if occ['code']:
                            md_output += f"**File:** `{occ['file']}` **Line:** `{occ['line']}`\n"
                            md_output += f"```go\n{occ['code']}\n```\n\n"
                    md_output += "</details>\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Gosec SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Gosec Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Gosec: Parse Error"
            }