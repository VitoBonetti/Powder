import json
import hashlib


class GitleaksParser:
    """
    Standalone Gitleaks JSON Parser.
    Converts Gitleaks secret scanner output directly into formatted Markdown.
    Supports both 'legacy' and 'current' Gitleaks JSON report formats.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Gitleaks JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                # Legacy uses 'rule', Current uses 'Description'
                if "rule" in first or "Description" in first:
                    return True
            elif data is None:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Gitleaks JSON and returns a formatted Markdown dictionary."""
        try:
            issues = json.loads(file_content.strip())
            if issues is None:
                issues = []

            grouped_findings = {}

            for issue in issues:
                if issue.get("rule"):
                    self._process_legacy(issue, grouped_findings)
                elif issue.get("Description"):
                    self._process_current(issue, grouped_findings)
                else:
                    continue

            # --- Generate Markdown ---
            md_output = "### Gitleaks Secret Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No hardcoded secrets or leaks found in the repository metadata.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Gitleaks Scan"
                }

            # Sort by severity (Critical -> High)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                md_output += "| Severity | Rule ID | File Path |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['rule_id']}` | `{f['file_path']}` |\n\n"

                md_output += "**Mitigation:** Immediately rotate the compromised secret and remove it from the git history.\n\n"

                # Render unique occurrences (commits/lines)
                md_output += f"**Exposure Details ({len(f['occurrences'])} unique instances):**\n\n"

                for idx, occ in enumerate(f['occurrences'][:15]):
                    md_output += f"**Instance {idx + 1}:**\n"
                    if occ.get('line'): md_output += f"- **Line:** {occ['line']}\n"
                    if occ.get('commit'): md_output += f"- **Commit Hash:** `{occ['commit']}`\n"
                    if occ.get('date'): md_output += f"- **Date:** {occ['date']}\n"
                    if occ.get('msg'): md_output += f"- **Message:** {occ['msg'].strip()}\n"
                    if occ.get('url'): md_output += f"- **Leak URL:** [View Leak]({occ['url']})\n"

                    if occ.get('match'):
                        clean_match = occ['match'].replace('`', '\\`').strip()
                        md_output += f"- **Match Snippet:**\n  ```text\n  {clean_match}\n  ```\n"
                    md_output += "\n"

                if len(f['occurrences']) > 15:
                    md_output += f"- *... and {len(f['occurrences']) - 15} more instances.*\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Gitleaks Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Gitleaks Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Gitleaks: Parse Error"
            }

    # ==========================================
    # Processing Strategies
    # ==========================================

    def _process_legacy(self, issue: dict, grouped_findings: dict):
        file_path = issue.get("file", "Unknown")
        rule = issue.get("rule", "Unknown Rule")
        line = issue.get("lineNumber", 0)
        offender = issue.get("offender", "")

        severity = "High"
        if any(cloud in rule for cloud in ["Github", "AWS", "Heroku"]):
            severity = "Critical"

        group_key = hashlib.sha256(f"{rule}_{file_path}".encode()).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"Hardcoded {rule} in {file_path}",
                "rule_id": rule,
                "file_path": file_path,
                "severity": severity,
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "line": line,
            "commit": issue.get("commit"),
            "date": issue.get("date"),
            "msg": issue.get("commitMessage", ""),
            "url": issue.get("leakURL"),
            "match": issue.get("line", "").replace(offender, "REDACTED")
        })

    def _process_current(self, issue: dict, grouped_findings: dict):
        rule_id = issue.get("RuleID", "Unknown Rule")
        description = issue.get("Description", "Secret Leak")
        file_path = issue.get("File", "Unknown")
        line = issue.get("StartLine", 0)
        secret = issue.get("Secret", "")

        group_key = hashlib.sha256(f"{rule_id}_{file_path}".encode()).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"Hardcoded {description} in {file_path}",
                "rule_id": rule_id,
                "file_path": file_path,
                "severity": "High",  # Current Gitleaks JSON doesn't define severity levels
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "line": line,
            "commit": issue.get("Commit"),
            "date": issue.get("Date"),
            "msg": issue.get("Message", ""),
            "match": issue.get("Match", secret)
        })