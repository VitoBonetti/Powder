import json

class BanditParser:
    def detect(self, file_content: str) -> bool:
        try:
            data = json.loads(file_content)
            if "results" in data and "metrics" in data and "errors" in data:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        try:
            data = json.loads(file_content)
            results = data.get("results", [])
            generated_at = data.get("generated_at", "")

            md_output = "### Bandit SAST Scan Results\n\n"
            if generated_at:
                md_output += f"**Scan Generated:** `{generated_at}`\n\n"

            if not results:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Bandit SAST Scan"
                }

            grouped_findings = {}
            for item in results:
                group_key = f"{item.get('issue_severity', 'LOW')}_{item.get('test_id', 'UNKNOWN')}_{item.get('issue_text', 'Unknown Issue')}"
                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": item.get("issue_text", "Unknown Issue"),
                        "severity": item.get("issue_severity", "Low").capitalize(),
                        "confidence": item.get("issue_confidence", "Unknown").capitalize(),
                        "test_id": item.get("test_id", "N/A"),
                        "test_name": item.get("test_name", "N/A"),
                        "more_info": item.get("more_info", ""),
                        "occurrences": []
                    }
                code_snippet = str(item.get("code", "")).replace("```", "\\`\\`\\`").strip()
                grouped_findings[group_key]["occurrences"].append({
                    "filename": item.get("filename", "Unknown File"),
                    "line": item.get("line_number", "Unknown Line"),
                    "code": code_snippet
                })

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"
                md_output += "| Severity | Confidence | Test ID | Test Name |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['confidence']} | {f['test_id']} | {f['test_name']} |\n\n"

                if f["more_info"]:
                    md_output += f"**Reference:** [Bandit Documentation]({f['more_info']})\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['filename']}` (Line {occ['line']})\n"
                md_output += "\n"

                md_output += "<details>\n<summary><b>View Affected Code Snippets</b></summary>\n\n"
                for occ in f['occurrences']:
                    md_output += f"**File:** `{occ['filename']}` **Line:** `{occ['line']}`\n"
                    md_output += f"```python\n{occ['code']}\n```\n\n"
                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Bandit SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Bandit SAST Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Bandit: Parse Error"
            }