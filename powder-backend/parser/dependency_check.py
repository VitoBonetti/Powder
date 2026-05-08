import re
import hashlib
import xml.etree.ElementTree as ET


class DependencyCheckParser:
    """
    Standalone OWASP Dependency-Check XML Parser.
    Converts Dependency-Check scanner XML reports directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an OWASP Dependency-Check XML report.
        """
        try:
            # Check for the characteristic root tag and namespace
            return "<analysis" in file_content and "dependency-check" in file_content
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses Dependency-Check XML and returns a formatted Markdown dictionary."""
        try:
            root = ET.fromstring(file_content)

            # Dynamically extract the namespace (e.g., {https://jeremylong.github.io/DependencyCheck/dependency-check.2.7.xsd})
            match = re.match(r"\{.*\}", root.tag)
            ns = match.group(0) if match else ""

            # Extract Project Metadata
            project_info = root.find(f"{ns}projectInfo")
            project_name = project_info.findtext(f"{ns}name",
                                                 "Unknown Project") if project_info is not None else "Unknown Project"
            report_date = project_info.findtext(f"{ns}reportDate",
                                                "Unknown Date") if project_info is not None else "Unknown Date"

            grouped_findings = {}

            # Iterate through all dependencies
            for dep in root.findall(f".//{ns}dependency"):
                filename = dep.findtext(f"{ns}fileName", "Unknown File")
                filepath = dep.findtext(f"{ns}filePath", "Unknown Path")

                # Identify the component (PURL or CPE)
                identifiers = dep.find(f"{ns}identifiers")
                component_id = "Unknown Component"
                if identifiers is not None:
                    # Prefer PURL, fallback to CPE
                    pkg = identifiers.find(f".//{ns}package")
                    cpe = identifiers.find(
                        f".//{ns}identifier[@type='cwe']")  # typo in original schema sometimes, usually 'cpe'
                    if cpe is None:
                        cpe = identifiers.find(f".//{ns}identifier[@type='cpe']")

                    if pkg is not None:
                        component_id = pkg.findtext(f"{ns}id", "Unknown PURL")
                    elif cpe is not None:
                        component_id = cpe.findtext(f"{ns}name", "Unknown CPE")

                # Parse active and suppressed vulnerabilities
                vulns = dep.findall(f".//{ns}vulnerabilities/{ns}vulnerability")
                suppressed = dep.findall(f".//{ns}vulnerabilities/{ns}suppressedVulnerability")

                for vuln in (vulns + suppressed):
                    is_suppressed = vuln.tag.endswith("suppressedVulnerability")

                    name = vuln.findtext(f"{ns}name", "Unknown Vulnerability")
                    severity = vuln.findtext(f"{ns}severity", "Unassigned").capitalize()
                    description = vuln.findtext(f"{ns}description", "No description provided.")

                    # Extract CWE
                    cwes_node = vuln.find(f"{ns}cwes")
                    cwe = cwes_node.findtext(f"{ns}cwe", "CWE-1035") if cwes_node is not None else vuln.findtext(
                        f"{ns}cwe", "CWE-1035")

                    # Extract CVSS
                    cvss_score = "N/A"
                    if vuln.find(f"{ns}cvssV3") is not None:
                        cvss_score = vuln.find(f"{ns}cvssV3").findtext(f"{ns}baseScore", "N/A")
                    elif vuln.find(f"{ns}cvssV2") is not None:
                        cvss_score = vuln.find(f"{ns}cvssV2").findtext(f"{ns}score", "N/A")

                    # Extract References
                    refs_md = []
                    refs_node = vuln.find(f"{ns}references")
                    if refs_node is not None:
                        for ref in refs_node.findall(f"{ns}reference"):
                            ref_url = ref.findtext(f"{ns}url", "")
                            ref_name = ref.findtext(f"{ns}name", "Link")
                            if ref_url:
                                refs_md.append(f"- [{ref_name}]({ref_url})")

                    # Grouping Key
                    group_key = hashlib.sha256(f"{name}_{is_suppressed}".encode("utf-8")).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": name,
                            "severity": severity,
                            "cwe": cwe,
                            "cvss": cvss_score,
                            "description": description,
                            "is_suppressed": is_suppressed,
                            "references": "\n".join(refs_md),
                            "occurrences": []
                        }

                    # Add the dependency instance to the occurrences
                    grouped_findings[group_key]["occurrences"].append({
                        "filename": filename,
                        "filepath": filepath,
                        "component_id": component_id
                    })

            # --- Generate Markdown ---
            md_output = f"### OWASP Dependency-Check Scan Results\n\n"
            md_output += f"**Project:** `{project_name}` | **Scan Date:** `{report_date}`\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable dependencies found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": f"Dependency-Check: {project_name}"
                }

            for f in grouped_findings.values():
                # Add a Suppressed warning badge to the title if applicable
                title_prefix = "⚠️ [SUPPRESSED] " if f['is_suppressed'] else ""
                md_output += f"#### {title_prefix}{f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | CVSS Score | CWE | Suppressed |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['cvss']} | {f['cwe']} | `{f['is_suppressed']}` |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                md_output += f"**Affected Dependencies ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- **File:** `{occ['filename']}`\n"
                    md_output += f"  - **ID:** `{occ['component_id']}`\n"
                    md_output += f"  - **Path:** `{occ['filepath']}`\n"
                md_output += "\n"

                if f['references']:
                    md_output += f"**References:**\n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": f"Dependency-Check: {project_name}"
            }

        except Exception as e:
            return {
                "markdown": f"### Dependency-Check Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "Dependency-Check: Parse Error"
            }