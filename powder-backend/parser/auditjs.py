import json
import re


class AuditJSParser:
    """
    Standalone AuditJS Parser.
    Converts AuditJS (Sonatype OSSIndex) JSON output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an AuditJS JSON report.
        """
        try:
            data = json.loads(file_content)
            # AuditJS reports are typically lists of dependency objects
            if isinstance(data, list) and len(data) > 0:
                first_item = data[0]
                # Look for the characteristic 'coordinates' (PURL) and 'vulnerabilities' keys
                if "coordinates" in first_item and "vulnerabilities" in first_item:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses AuditJS JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for dependency in data:
                purl = dependency.get("coordinates", "")
                if not purl:
                    continue

                # Parse the PURL: pkg:npm/PACKAGE_NAME@PACKAGE_VERSION
                # Or scoped: pkg:npm/@SCOPE/PACKAGE_NAME@PACKAGE_VERSION
                parts = purl.split("/")
                if len(parts) == 3:
                    full_pkg_name = f"{parts[1]}/{parts[2]}"
                elif len(parts) >= 2:
                    full_pkg_name = parts[1]
                else:
                    full_pkg_name = purl

                # Safely split from the right to handle scoped packages like @babel/core
                name_version = full_pkg_name.rsplit("@", 1)
                component_name = name_version[0] if len(name_version) > 0 else "Unknown"
                component_version = name_version[1] if len(name_version) > 1 else "Unknown"

                for vuln in dependency.get("vulnerabilities", []):
                    # Enforce mandatory attributes
                    if not all(k in vuln for k in ("id", "title", "description")):
                        continue

                    vuln_id = vuln["id"]
                    title = vuln["title"]
                    description = vuln["description"]

                    # Extract CWE from title if present (e.g., "CWE-1035: ...")
                    cwe = "N/A"
                    cwe_match = re.search(r"^CWE-[0-9]{1,4}", title)
                    if cwe_match:
                        cwe = cwe_match.group(0)

                    cvss_score = vuln.get("cvssScore", 0.0)
                    cvss_vector = vuln.get("cvssVector", "N/A")
                    severity = self._calculate_severity(cvss_score)

                    cve = vuln.get("cve", "N/A")
                    reference = vuln.get("reference", "")

                    # Group by vulnerability ID
                    if vuln_id not in grouped_findings:
                        grouped_findings[vuln_id] = {
                            "title": title,
                            "cve": cve,
                            "cwe": cwe,
                            "severity": severity,
                            "cvss_score": cvss_score,
                            "cvss_vector": cvss_vector,
                            "description": description,
                            "reference": reference,
                            "affected_components": []
                        }

                    # Add the component to this vulnerability's list
                    grouped_findings[vuln_id]["affected_components"].append({
                        "name": component_name,
                        "version": component_version,
                        "purl": purl
                    })

            # --- Generate Markdown ---
            md_output = "### AuditJS (Sonatype OSSIndex) Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found in dependencies.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "AuditJS Scan"
                }

            for f_id, f in grouped_findings.items():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | CVSS Score | CVE | CWE | OSSIndex ID |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['cvss_score']} | {f['cve']} | {f['cwe']} | `{f_id}` |\n\n"

                if f['cvss_vector'] != "N/A":
                    md_output += f"**CVSS Vector:** `{f['cvss_vector']}`\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                md_output += "**Affected Components:**\n"
                for comp in f['affected_components']:
                    md_output += f"- `{comp['name']}` (v{comp['version']})\n"
                md_output += "\n"

                if f['reference']:
                    md_output += f"**Reference:** [View Advisory]({f['reference']})\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "AuditJS Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### AuditJS Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "AuditJS: Parse Error"
            }

    def _calculate_severity(self, cvss: float) -> str:
        """Calculates categorical severity based on CVSS score."""
        try:
            cvss = float(cvss)
        except (ValueError, TypeError):
            return "Info"

        if 0 < cvss < 4:
            return "Low"
        if 4 <= cvss < 7:
            return "Medium"
        if 7 <= cvss < 9:
            return "High"
        if cvss >= 9:
            return "Critical"
        return "Info"