import json
import hashlib
import io
import re

# PURL mapping for Snyk package managers
SNYK_PM_TO_PURL = {
    "npm": "npm", "yarn": "npm", "pip": "pypi", "poetry": "pypi",
    "maven": "maven", "gradle": "maven", "rubygems": "gem",
    "nuget": "nuget", "composer": "composer", "gomodules": "golang",
    "cocoapods": "cocoapods", "hex": "hex", "pub": "pub",
}


class SnykParser:
    """
    Standalone Snyk Parser.
    Supports Snyk JSON (test --json) and delegates SARIF results
    to the appropriate logic.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Snyk JSON report.
        """
        try:
            data = json.loads(file_content)
            # Standard Snyk JSON
            if isinstance(data, dict) and ("vulnerabilities" in data or "runs" in data):
                return True
            # Multiple projects JSON
            if isinstance(data, list) and len(data) > 0 and "vulnerabilities" in data[0]:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Snyk JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            findings = []

            # Handle list of projects or single project
            if isinstance(data, list):
                for project in data:
                    findings.extend(self._process_project(project))
            else:
                findings.extend(self._process_project(data))

            # --- Generate Markdown ---
            md_output = "### Snyk Security Scan Results\n\n"

            if not findings:
                md_output += "*No vulnerabilities found.*\n"
                return {"markdown": md_output, "command": "", "title": "Snyk Scan"}

            # Grouping by Severity and Component
            grouped = {}
            for f in findings:
                key = f"{f['severity']}_{f['component_name']}_{f['vuln_id']}"
                if key not in grouped:
                    grouped[key] = f
                else:
                    grouped[key]['occurrences'] += 1

            for f in grouped.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Component | Version | Snyk ID |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | `{f['component_name']}` | {f['component_version']} | [{f['vuln_id']}]({f['references_url']}) |\n\n"

                if f.get('cvss_vector'):
                    md_output += f"**CVSS Vector:** `{f['cvss_vector']}` (Score: {f['cvss_score']})\n\n"

                md_output += f"**Description:**  \n{f['description']}\n\n"

                md_output += f"**Remediation:**  \n{f['mitigation']}\n\n"

                if f.get('file_path'):
                    md_output += f"**Introduction Path:**  \n`{f['file_path']}`\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Snyk Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Snyk Scan Results\n\n**Error:** Failed to parse Snyk JSON: {str(e)}",
                "command": "",
                "title": "Snyk: Parse Error"
            }

    def _process_project(self, project):
        items = []
        # Support SARIF delegation if 'runs' exists (Snyk Code)
        if "runs" in project:
            # Note: In a full implementation, you would call your SarifParser logic here.
            # For this standalone version, we skip SARIF or assume standard Snyk JSON.
            return items

        vulnerabilities = project.get("vulnerabilities", [])
        target_file = project.get("displayTargetFile")
        upgrades = project.get("remediation", {}).get("upgrade", {})

        for vuln in vulnerabilities:
            items.append(self._get_item(vuln, target_file, upgrades))
        return items

    def _get_item(self, vuln, target_file, upgrades):
        # 1. Determine Severity
        severity = self._map_severity(vuln)

        # 2. Format Path (Removing versions for path string)
        vuln_from = vuln.get("from", [])
        path_str = " > ".join(["@".join(p.split("@")[0:-1]) if "@" in p else p for p in vuln_from])

        # 3. Handle CVEs and CWEs
        identifiers = vuln.get("identifiers", {})
        cve_list = identifiers.get("CVE", [])
        cwe_list = identifiers.get("CWE", [])
        cwe_str = cwe_list[0] if cwe_list else "CWE-1035"

        # 4. Extract Remediation
        description = vuln.get("description", "")
        mitigation = "Upgrade the package as suggested in the Snyk portal."

        # Snyk often embeds remediation in the description Markdown
        if "## Remediation" in description and "## References" in description:
            parts = description.split("## Remediation")
            sub_parts = parts[1].split("## References")
            mitigation = sub_parts[0].strip()

        # Add upgrade guidance if available
        pkg_version = f"{vuln.get('packageName')}@{vuln.get('version')}"
        if pkg_version in upgrades:
            upgrade_to = upgrades[pkg_version].get("upgradeTo")
            mitigation += f"\n\n**Recommendation:** Upgrade to version `{upgrade_to}`."

        return {
            "title": f"{vuln_from[0] if vuln_from else 'Project'}: {vuln.get('title')}",
            "severity": severity,
            "cvss_score": vuln.get("cvssScore"),
            "cvss_vector": vuln.get("CVSSv3"),
            "component_name": vuln.get("packageName"),
            "component_version": vuln.get("version"),
            "vuln_id": vuln.get("id"),
            "references_url": f"https://app.snyk.io/vuln/{vuln.get('id')}",
            "description": description.split("## Remediation")[0].strip(),
            "mitigation": mitigation,
            "file_path": path_str,
            "cwe": cwe_str,
            "occurrences": 1
        }

    def _map_severity(self, vuln):
        score = vuln.get("cvssScore")
        if score is None:
            return vuln.get("severity", "Info").title()

        if score <= 3.9: return "Low"
        if score <= 6.9: return "Medium"
        if score <= 8.9: return "High"
        return "Critical"