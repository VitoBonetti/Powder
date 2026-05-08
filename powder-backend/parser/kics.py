import json
import hashlib


class KICSParser:
    """
    Standalone KICS JSON Parser.
    Converts KICS Infrastructure-as-Code scanner output directly into formatted Markdown.
    Groups identical queries together and lists all affected files beneath them.
    """

    SEVERITY_MAP = {
        "HIGH": "High",
        "MEDIUM": "Medium",
        "LOW": "Low",
        "INFO": "Info",
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a KICS JSON report.
        """
        try:
            data = json.loads(file_content)
            if isinstance(data, dict) and "queries" in data:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses KICS JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            queries = data.get("queries", [])

            grouped_findings = {}

            for query in queries:
                name = query.get("query_name", "Unknown Query")
                url = query.get("query_url", "")
                severity_raw = query.get("severity", "INFO").upper()
                severity = self.SEVERITY_MAP.get(severity_raw, "Info")
                platform = query.get("platform", "Unknown")
                category = query.get("category", "General")
                description = query.get("description", "No description provided.")

                # Group by Query metadata to aggregate affected files
                group_key = hashlib.sha256(f"{name}_{platform}_{category}".encode("utf-8")).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f"[{category}] {name}",
                        "severity": severity,
                        "platform": platform,
                        "category": category,
                        "description": description,
                        "url": url,
                        "occurrences": []
                    }

                # Extract individual file violations
                for item in query.get("files", []):
                    file_name = item.get("file_name", "Unknown File")
                    line_number = item.get("line", 0)
                    issue_type = item.get("issue_type", "Unknown")
                    expected = item.get("expected_value", "")
                    actual = item.get("actual_value", "")

                    grouped_findings[group_key]["occurrences"].append({
                        "file": file_name,
                        "line": line_number,
                        "issue_type": issue_type,
                        "expected": expected,
                        "actual": actual
                    })

            # --- Generate Markdown ---
            md_output = "### KICS Infrastructure-as-Code Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No misconfigurations found in the KICS scan.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "KICS Scan"
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
                md_output += "| Severity | Platform | Category |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['platform']} | {f['category']} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['url']:
                    md_output += f"**Reference:** [{f['url']}]({f['url']})\n\n"

                # Render occurrences (affected files & specific values)
                if f['occurrences']:
                    md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"

                    for occ in f['occurrences'][:30]:  # Cap to prevent extreme report bloat
                        md_output += f"- `{occ['file']}` (Line: {occ['line']})\n"
                        if occ['actual'] or occ['expected']:
                            md_output += f"  - *Issue Type:* {occ['issue_type']}\n"
                            if occ['expected']:
                                md_output += f"  - *Expected:* `{occ['expected']}`\n"
                            if occ['actual']:
                                md_output += f"  - *Actual:* `{occ['actual']}`\n"

                    if len(f['occurrences']) > 30:
                        md_output += f"- *... and {len(f['occurrences']) - 30} more occurrences.*\n"

                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "KICS Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### KICS Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "KICS: Parse Error"
            }