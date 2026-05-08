import json
from datetime import datetime


class DockerBenchParser:
    """
    Standalone Docker Bench JSON Parser.
    Converts Docker CIS benchmark scan reports directly into formatted Markdown.
    Groups findings hierarchically by CIS Section.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Docker Bench JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, dict) and "tests" in data:
                # Docker bench typically has 'id' and 'tests' at the root
                if "id" in data and isinstance(data["tests"], list):
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Docker Bench JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())

            # Optional scan metadata
            start_ts = data.get("start")
            end_ts = data.get("end")
            scan_date = ""
            if end_ts:
                try:
                    scan_date = datetime.fromtimestamp(int(end_ts)).strftime("%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError):
                    pass

            md_output = "### Docker Bench Security Scan Results\n\n"
            if scan_date:
                md_output += f"**Scan Completed:** `{scan_date}`\n\n"

            has_findings = False

            for section in data.get("tests", []):
                section_id = section.get("section", "")
                section_desc = section.get("desc", "")
                section_title = f"Section {section_id}: {section_desc}".strip()

                section_findings = []

                for result in section.get("results", []):
                    status = result.get("result", "").upper()
                    reason = result.get("desc", "")

                    # Original severity logic: FAIL -> Critical, WARN -> High, INFO -> Low, NOTE -> Info
                    # Skip PASS and any manual checks
                    severity = None
                    if status == "FAIL":
                        severity = "Critical"
                    elif status == "WARN" and "(Manual)" not in reason:
                        severity = "High"
                    elif status == "INFO" and "(Manual)" not in reason:
                        severity = "Low"
                    elif status == "NOTE" and "(Manual)" not in reason:
                        severity = "Info"

                    if not severity:
                        continue

                    section_findings.append({
                        "id": result.get("id", "N/A"),
                        "desc": reason,
                        "status": status,
                        "severity": severity,
                        "details": result.get("details", ""),
                        "audit": result.get("audit", ""),
                        "expected": result.get("expected_result", ""),
                        "actual": result.get("actual_value", ""),
                        "remediation": result.get("remediation", ""),
                        "remediation_impact": result.get("remediation-impact", "")
                    })

                # Render Section if it contains actionable findings
                if section_findings:
                    has_findings = True
                    md_output += f"#### {section_title}\n\n"

                    for f in section_findings:
                        md_output += f"##### [{f['id']}] {f['desc']}\n\n"
                        md_output += f"- **Severity:** {f['severity']}\n"
                        md_output += f"- **Status:** `{f['status']}`\n\n"

                        if f['details']:
                            md_output += f"**Details:**\n{f['details']}\n\n"

                        # Render comparisons if available
                        if f['expected'] or f['actual']:
                            md_output += "| Expected Result | Actual Value |\n"
                            md_output += "|---|---|\n"
                            md_output += f"| `{f['expected']}` | `{f['actual']}` |\n\n"

                        if f['audit']:
                            md_output += f"**Audit Command:**\n```bash\n{f['audit']}\n```\n\n"

                        if f['remediation']:
                            md_output += f"**Remediation:**\n{f['remediation']}\n\n"
                            if f['remediation_impact']:
                                md_output += f"**Remediation Impact:** {f['remediation_impact']}\n\n"

                    md_output += "---\n\n"

            if not has_findings:
                md_output += "*No failing or actionable warning checks found. The Docker daemon and containers comply with evaluated policies.*\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Docker Bench Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Docker Bench Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Docker Bench: Parse Error"
            }