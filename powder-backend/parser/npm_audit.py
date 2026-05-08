import json
import re


class NpmAuditParser:
    """
    Standalone NPM Audit Parser.
    Converts NPM Audit JSON outputs (v6 and below) into formatted Markdown.
    Note: npm7+ (auditReportVersion 2+) lacks the detailed advisory fields required here.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an NPM Audit JSON report (v6).
        """
        try:
            data = json.loads(file_content)
            # v6 format has an 'advisories' block and lacks auditReportVersion >= 2
            if "advisories" in data and data.get("auditReportVersion", 1) < 2:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses NPM Audit JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)

            # Check for unsupported version
            if data.get("auditReportVersion", 1) >= 2:
                return {
                    "markdown": "### NPM Audit Results\n\n**Error:** npm7+ (auditReportVersion 2 or higher) is not supported by this v6 parser as it lacks detailed advisory fields.",
                    "command": "",
                    "title": "NPM Audit: Unsupported Version"
                }

            # Check for NPM execution errors
            if "error" in data:
                err = data["error"]
                return {
                    "markdown": f"### NPM Audit Results\n\n**Error executing NPM Audit:** `{err.get('code')}` - {err.get('summary')}",
                    "command": "",
                    "title": "NPM Audit: Execution Error"
                }

            advisories = data.get("advisories", {})
            grouped_findings = {}

            for node in advisories.values():
                module_name = node.get("module_name", "Unknown Module")
                title = node.get("title", "Unknown Vulnerability")
                severity = self._translate_severity(node.get("severity"))

                vuln_id = str(node.get("id", "Unknown ID"))
                cves = node.get("cves", [])
                cve_str = ", ".join(cves) if cves else "N/A"
                cwe = str(node.get("cwe", "N/A"))

                url = node.get("url", "")
                overview = node.get("overview", "No description provided.")
                recommendation = node.get("recommendation", "")

                vuln_versions = str(node.get("vulnerable_versions", "Unknown"))
                patched_versions = str(node.get("patched_versions", "Unknown"))

                # Process findings and censor dynamic NPM git hashes
                paths = []
                component_version = "Unknown"

                for finding in node.get("findings", []):
                    if component_version == "Unknown" and "version" in finding:
                        component_version = finding["version"]

                    raw_paths = finding.get("paths", [])
                    # Censor random 64-character hashes to prevent duplicate reporting
                    clean_paths = [re.sub(r"[a-f0-9]{64}", "censored_by_npm_audit", p) for p in raw_paths]

                    paths_str = ", ".join(clean_paths[:25])
                    if len(clean_paths) > 25:
                        paths_str += " ... (truncated after 25 paths)"

                    paths.append(f"**v{finding.get('version', 'Unknown')}** introduced via: `{paths_str}`")

                # Unique Grouping Key
                group_key = f"{vuln_id}_{module_name}"

                grouped_findings[group_key] = {
                    "title": f"{title} ({module_name})",
                    "severity": severity,
                    "module_name": module_name,
                    "version": component_version,
                    "vuln_versions": vuln_versions,
                    "patched_versions": patched_versions,
                    "cwe": cwe,
                    "cve": cve_str,
                    "overview": overview,
                    "recommendation": recommendation,
                    "url": url,
                    "paths": paths
                }

            # --- Generate Markdown ---
            md_output = "### NPM Audit Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable dependencies found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "NPM Audit Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Module | Version | CVE | CWE |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| {f['severity']} | `{f['module_name']}` | {f['version']} | {f['cve']} | {f['cwe']} |\n\n"

                md_output += f"**Overview:**\n{f['overview']}\n\n"

                md_output += f"- **Vulnerable Versions:** `{f['vuln_versions']}`\n"
                md_output += f"- **Patched Versions:** `{f['patched_versions']}`\n\n"

                if f['recommendation']:
                    md_output += f"**Recommendation:**\n{f['recommendation']}\n\n"

                if f['paths']:
                    md_output += "**Dependency Paths:**\n"
                    for p in f['paths']:
                        md_output += f"- {p}\n"
                    md_output += "\n"

                if f['url']:
                    md_output += f"**Reference:** [NPM Advisory]({f['url']})\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "NPM Audit Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### NPM Audit Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "NPM Audit: Parse Error"
            }

    def _translate_severity(self, sev: str) -> str:
        """Converts NPM severities to standard labels."""
        mapping = {
            "low": "Low",
            "moderate": "Medium",
            "high": "High",
            "critical": "Critical"
        }
        return mapping.get(str(sev).lower(), "Info")