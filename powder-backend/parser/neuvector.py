import json
import hashlib


class NeuVectorParser:
    """
    Standalone NeuVector JSON Parser.
    Converts NeuVector container security scan REST API outputs directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a NeuVector JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, dict) and "report" in data:
                if "vulnerabilities" in data["report"]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses NeuVector JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())
            vulns = data.get("report", {}).get("vulnerabilities", [])

            grouped_findings = {}

            for v in vulns:
                vuln_id = v.get("name", "Unknown CVE")
                pkg_name = v.get("package_name", "Unknown Package")
                pkg_version = v.get("package_version", "Unknown Version")
                severity = self._normalize_severity(v.get("severity"))

                # Unique grouping key to deduplicate identical findings
                group_key = hashlib.sha256(
                    f"{vuln_id}_{pkg_name}_{pkg_version}_{severity}".encode("utf-8")
                ).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "id": vuln_id,
                        "package_name": pkg_name,
                        "package_version": pkg_version,
                        "severity": severity,
                        "cvss_score": v.get("score_v3", "N/A"),
                        "cvss_vector": v.get("vectors_v3", "N/A"),
                        "fixed_version": v.get("fixed_version", "No fix available"),
                        "description": v.get("description", "No description provided."),
                        "link": v.get("link", "")
                    }

            # --- Generate Markdown ---
            md_output = "### NeuVector Container Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found in the NeuVector scan report.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "NeuVector Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_vulns = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_vulns:
                md_output += f"#### [{f['id']}] {f['package_name']} (v{f['package_version']})\n\n"

                # Metadata Table
                md_output += "| Severity | CVSS v3 | Package | Version | Fixed Version |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['cvss_score']} | `{f['package_name']}` | `{f['package_version']}` | {f['fixed_version']} |\n\n"

                if f['cvss_vector'] != "N/A":
                    md_output += f"**CVSS Vector:** `{f['cvss_vector']}`\n\n"

                if f['description']:
                    md_output += f"**Description:**\n{f['description']}\n\n"

                if f['link']:
                    md_output += f"**Reference:** [View Advisory]({f['link']})\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "NeuVector Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### NeuVector Scan Results\n\n**Error:** Failed to parse report: {str(e)}",
                "command": "",
                "title": "NeuVector: Parse Error"
            }

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Info"
        s = severity.strip().capitalize()
        if s in {"Critical", "High", "Medium", "Low"}:
            return s
        return "Info"