import json
import hashlib


class YarnAuditParser:
    """
    Standalone Yarn Audit Parser.
    Converts Yarn Audit (v1/v2) and Audit-CI JSON outputs into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Yarn Audit or Audit-CI JSON report.
        """
        try:
            # Yarn v1/v2 often use NDJSON (newline-delimited JSON)
            if '"type"' in file_content or '"value"' in file_content or '"advisories"' in file_content:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses the content and returns a unified Markdown report."""
        try:
            findings = []

            if '"type"' in file_content:
                # Yarn v1 format (NDJSON)
                lines = file_content.split("\n")
                tree = (json.loads(line) for line in lines if "{" in line)
                findings = self._get_items_yarn_v1(tree)

            elif '"value"' in file_content:
                # Yarn v2 format (NDJSON)
                lines = file_content.split("\n")
                tree = (json.loads(line) for line in lines if "{" in line)
                findings = self._get_items_yarn_v2(tree)

            else:
                # Audit-CI format (Standard JSON)
                tree = json.loads(file_content)
                findings = self._get_items_auditci(tree)

            # --- Generate Markdown Report ---
            md_output = "### Yarn Audit Security Scan Results\n\n"

            if not findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Yarn Audit Scan"
                }

            # Group findings by Severity and Component to prevent report bloat
            grouped = {}
            for f in findings:
                key = f"{f['severity']}_{f['component']}"
                if key not in grouped:
                    grouped[key] = f
                else:
                    # Append new paths/versions if duplicate component found
                    grouped[key]['description'] += f"\n\n---\n\n**Additional Occurrence:**\n{f['description']}"

            for f in grouped.values():
                md_output += f"#### {f['title']}\n\n"
                md_output += "| Severity | Component | Version | CVE/ID |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | `{f['component']}` | {f['version']} | {f['vuln_id']} |\n\n"

                md_output += f"**Description:**  \n{f['description']}\n\n"

                if f.get('mitigation'):
                    md_output += f"**Recommendation:**  \n{f['mitigation']}\n\n"

                if f.get('references'):
                    md_output += f"**References:**  \n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Yarn Audit Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Yarn Audit Results\n\n**Error:** Failed to parse: {str(e)}",
                "command": "",
                "title": "Yarn Audit: Parse Error"
            }

    def _get_items_yarn_v1(self, tree):
        items = []
        for element in tree:
            if element.get("type") == "auditAdvisory":
                node = element.get("data").get("advisory")
                severity = self._translate_severity(node.get("severity"))

                # Format paths for description
                paths = ""
                for finding in node.get("findings", []):
                    paths += f"\n  - {finding['version']}: {','.join(finding['paths'][:10])}"
                    if len(finding["paths"]) > 10:
                        paths += " ... (truncated)"

                items.append({
                    "title": node["title"],
                    "severity": severity,
                    "component": node["module_name"],
                    "version": node["findings"][0]["version"],
                    "vuln_id": node.get("cves")[0] if node.get(
                        "cves") else f"GHSA-{node.get('github_advisory_id', node.get('id'))}",
                    "description": f"{node['overview']}\n\n**Vulnerable Paths:**{paths}",
                    "mitigation": node.get("recommendation"),
                    "references": node.get("url")
                })
        return items

    def _get_items_yarn_v2(self, tree):
        items = []
        for element in tree:
            child = element.get("children", {})
            value = element.get("value")
            severity = self._translate_severity(child.get("Severity"))

            items.append({
                "title": f"Advisory {child.get('ID')}",
                "severity": severity,
                "component": value,
                "version": ", ".join(set(child.get("Tree Versions", []))),
                "vuln_id": f"ID: {child.get('ID')}",
                "description": f"{child.get('Issue')}\n\n**Dependents:** {', '.join(set(child.get('Dependents', [])))}",
                "mitigation": "Upgrade the affected dependency.",
                "references": ""
            })
        return items

    def _get_items_auditci(self, tree):
        items = []
        advisories = tree.get("advisories", {})
        for adv_id, node in advisories.items():
            severity = self._translate_severity(node.get("severity"))
            items.append({
                "title": node.get("title", "Audit-CI Finding"),
                "severity": severity,
                "component": node.get("module_name"),
                "version": node.get("findings", [{}])[0].get("version", "N/A"),
                "vuln_id": node.get("cves")[0] if node.get("cves") else node.get("github_advisory_id", adv_id),
                "description": f"{node.get('overview')}\n\n**Vulnerable Versions:** {node.get('vulnerable_versions')}",
                "mitigation": node.get("recommendation"),
                "references": node.get("url")
            })
        return items

    def _translate_severity(self, sev):
        mapping = {
            "low": "Low",
            "moderate": "Medium",
            "high": "High",
            "critical": "Critical"
        }
        return mapping.get(str(sev).lower(), "Info")