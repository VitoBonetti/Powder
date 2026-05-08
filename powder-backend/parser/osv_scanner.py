import json
import hashlib

# Mapping OSV ecosystems to standard PURL types
OSV_ECOSYSTEM_TO_PURL = {
    "npm": "npm", "pypi": "pypi", "go": "golang", "maven": "maven",
    "crates.io": "cargo", "rubygems": "gem", "nuget": "nuget",
    "packagist": "composer", "hex": "hex", "pub": "pub",
    "cocoapods": "cocoapods", "swifturl": "swift",
    "alpine": "apk", "debian": "deb",
}


class OSVScannerParser:
    """
    Standalone OSV-Scanner JSON Parser.
    Converts Google OSV-Scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """Detects if the file is an OSV-Scanner JSON report."""
        try:
            data = json.loads(file_content)
            # OSV reports always have a 'results' key at the root
            return isinstance(data, dict) and "results" in data
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses OSV JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for result in data.get("results", []):
                source_path = result.get("source", {}).get("path", "Unknown Source")
                source_type = result.get("source", {}).get("type", "Unknown")

                for package_node in result.get("packages", []):
                    pkg = package_node.get("package", {})
                    pkg_name = pkg.get("name", "Unknown")
                    pkg_version = pkg.get("version", "Unknown")
                    pkg_ecosystem = pkg.get("ecosystem", "Unknown")

                    for vuln in package_node.get("vulnerabilities", []):
                        vuln_id = vuln.get("id", "Unknown ID")
                        severity = self._classify_severity(vuln)

                        # Unique key to group identical vulnerabilities across the project
                        group_key = hashlib.sha256(f"{vuln_id}{pkg_name}".encode()).hexdigest()

                        if group_key not in grouped_findings:
                            grouped_findings[group_key] = {
                                "title": f"{vuln_id}: {pkg_name}",
                                "severity": severity,
                                "pkg_name": pkg_name,
                                "pkg_version": pkg_version,
                                "pkg_ecosystem": pkg_ecosystem,
                                "cwe": self._extract_cwe(vuln),
                                "summary": vuln.get("summary", "No summary provided."),
                                "details": vuln.get("details", "No details provided."),
                                "mitigation": self._extract_mitigation(vuln),
                                "references": "\n".join([f"- {r.get('url')}" for r in vuln.get("references", [])]),
                                "occurrences": []
                            }

                        grouped_findings[group_key]["occurrences"].append({
                            "source": source_path,
                            "type": source_type,
                            "version": pkg_version
                        })

            # --- Generate Markdown ---
            md_output = "### OSV-Scanner Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found by OSV-Scanner.*\n"
                return {"markdown": md_output, "command": "", "title": "OSV Scan"}

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Ecosystem | CWE | Component |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['pkg_ecosystem']} | {f['cwe']} | `{f['pkg_name']}` |\n\n"

                md_output += f"**Summary:**  \n{f['summary']}\n\n"
                md_output += f"**Details:**  \n{f['details']}\n\n"

                if f['mitigation']:
                    md_output += f"**Remediation:**  \n{f['mitigation']}\n\n"

                md_output += "**Affected Instances:**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['source']}` (Detected via {occ['type']})\n"

                if f['references']:
                    md_output += f"\n**References:**\n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "OSV-Scanner Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### OSV Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "OSV: Parse Error"
            }

    def _classify_severity(self, vuln):
        """Maps OSV/Database specific severity to standard levels."""
        sev = vuln.get("database_specific", {}).get("severity", "LOW")
        if sev == "MODERATE":
            return "Medium"
        return sev.lower().capitalize()

    def _extract_cwe(self, vuln):
        """Extracts CWE ID from the affected metadata."""
        affected = vuln.get("affected", [])
        if affected:
            cwes = affected[0].get("database_specific", {}).get("cwes", [])
            if cwes:
                return cwes[0].get("cweId", "N/A")
        return "N/A"

    def _extract_mitigation(self, vuln):
        """Extracts and formats fixed versions or commit URLs."""
        mitigations = []
        affected = vuln.get("affected", [])
        if not affected:
            return ""

        for range_item in affected[0].get("ranges", []):
            range_type = range_item.get("type", "")
            repo_url = range_item.get("repo", "")
            for event in range_item.get("events", []):
                if "fixed" in event:
                    fixed_val = event["fixed"]
                    if range_type == "GIT" and repo_url:
                        mitigations.append(f"GIT: {repo_url}/commit/{fixed_val}")
                    else:
                        mitigations.append(f"{range_type}: {fixed_val}")

        if mitigations:
            text = "**Upgrade to fixed versions:**\n"
            for m in mitigations:
                text += f"- {m}\n"
            return text
        return ""