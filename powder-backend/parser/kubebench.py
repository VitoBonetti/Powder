import json


class KubeBenchParser:
    """
    Standalone kube-bench JSON Parser.
    Converts Kubernetes CIS benchmark scan reports directly into formatted Markdown.
    Groups findings hierarchically by CIS Chapter and Section.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a kube-bench JSON report.
        """
        try:
            data = json.loads(file_content)
            # Check for either the wrapped "Controls" object or a flat list of chapters
            tree = data.get("Controls", data) if isinstance(data, dict) else data

            if isinstance(tree, list) and len(tree) > 0:
                first = tree[0]
                # kube-bench structure typically has "id", "text", and "tests" at the chapter level
                if "tests" in first and ("id" in first or "text" in first):
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses kube-bench JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            tree = data.get("Controls", data) if isinstance(data, dict) else data

            md_output = "### kube-bench CIS Benchmark Scan Results\n\n"
            has_findings = False

            for chapter in tree:
                chapter_id = chapter.get("id", "")
                chapter_text = chapter.get("text", "")
                chapter_title = f"{chapter_id} {chapter_text}".strip()

                chapter_findings = []

                for section in chapter.get("tests", []):
                    section_desc = section.get("desc", "")

                    for result in section.get("results", []):
                        status = result.get("status", "").upper()
                        reason = result.get("reason", "")

                        # Apply original filtering logic: Medium for FAIL, Info for actionable WARN
                        severity = None
                        if status == "FAIL":
                            severity = "Medium"
                        elif status == "WARN" and reason != "Test marked as a manual test":
                            severity = "Info"

                        if not severity:
                            continue

                        chapter_findings.append({
                            "section": section_desc,
                            "test_number": result.get("test_number", "N/A"),
                            "test_desc": result.get("test_desc", "No description provided."),
                            "status": status,
                            "severity": severity,
                            "audit": result.get("audit", ""),
                            "reason": reason,
                            "expected_result": result.get("expected_result", ""),
                            "actual_value": result.get("actual_value", ""),
                            "remediation": result.get("remediation", "")
                        })

                # Render Chapter if it contains actionable findings
                if chapter_findings:
                    has_findings = True
                    md_output += f"#### {chapter_title}\n\n"

                    for f in chapter_findings:
                        md_output += f"##### [{f['test_number']}] {f['test_desc']}\n\n"
                        md_output += f"- **Severity:** {f['severity']}\n"
                        md_output += f"- **Status:** `{f['status']}`\n"

                        if f['reason']:
                            md_output += f"- **Reason:** {f['reason']}\n"

                        md_output += "\n"

                        # Render comparisons if available
                        if f['expected_result'] or f['actual_value']:
                            md_output += "| Expected Result | Actual Value |\n"
                            md_output += "|---|---|\n"
                            md_output += f"| `{f['expected_result']}` | `{f['actual_value']}` |\n\n"

                        if f['audit']:
                            md_output += f"**Audit Command:**\n```bash\n{f['audit']}\n```\n\n"

                        if f['remediation']:
                            md_output += f"**Remediation:**\n{f['remediation']}\n\n"

                    md_output += "---\n\n"

            if not has_findings:
                md_output += "*No failing or warning CIS benchmark checks found. The cluster complies with evaluated policies.*\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "kube-bench Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### kube-bench Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "kube-bench: Parse Error"
            }