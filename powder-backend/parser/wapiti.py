import hashlib
import re
import xml.etree.ElementTree as ET


class WapitiParser:
    """
    Standalone Wapiti Web Scanner XML Parser.
    Converts Wapiti XML reports directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Wapiti XML report by checking the root tag.
        """
        try:
            # Check for the report tag which is characteristic of Wapiti XML
            return "<report" in file_content and "<vulnerabilities" in file_content
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses Wapiti XML and returns a formatted Markdown dictionary."""
        try:
            root = ET.fromstring(file_content)

            severity_mapping = {
                "4": "Critical",
                "3": "High",
                "2": "Medium",
                "1": "Low",
                "0": "Info",
            }

            # Extract the target URL from report_infos
            target_url = root.findtext('report_infos/info[@name="target"]') or "Unknown Target"

            grouped_findings = {}

            # Wapiti nests entries inside vulnerability categories
            for vulnerability in root.findall("vulnerabilities/vulnerability"):
                category = vulnerability.attrib.get("name", "Unknown Vulnerability")
                description = vulnerability.findtext("description") or "No description provided."
                mitigation = vulnerability.findtext("solution") or "No mitigation provided."

                # Extract CWE and References
                cwe = "N/A"
                references_list = []
                for reference in vulnerability.findall("references/reference"):
                    ref_title = reference.findtext("title")
                    ref_url = reference.findtext("url")

                    if ref_title and "CWE-" in ref_title:
                        cwe_match = re.search(r"CWE-(\d+)", ref_title, re.IGNORECASE)
                        if cwe_match:
                            cwe = f"CWE-{cwe_match.group(1)}"

                    if ref_title and ref_url:
                        references_list.append(f"- [{ref_title}]({ref_url})")

                references_md = "\n".join(references_list) if references_list else "No references provided."

                # Process individual entries (specific instances)
                for entry in vulnerability.findall("entries/entry"):
                    entry_info = entry.findtext("info") or ""
                    title = f"{category}: {entry_info}"
                    num_severity = entry.findtext("level")
                    severity = severity_mapping.get(num_severity, "Info")
                    http_request = entry.findtext("http_request") or ""

                    # Create a unique key for grouping identical finding types
                    group_key = hashlib.sha256(
                        f"{category}{description}{severity}".encode("utf-8")
                    ).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": category,
                            "severity": severity,
                            "cwe": cwe,
                            "description": description,
                            "mitigation": mitigation,
                            "references": references_md,
                            "occurrences": []
                        }

                    grouped_findings[group_key]["occurrences"].append({
                        "title_specific": title,
                        "request": http_request
                    })

            # --- Generate Markdown ---
            md_output = f"### Wapiti Web Scan Results\n\n"
            md_output += f"**Target:** `{target_url}`\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
            else:
                for f in grouped_findings.values():
                    md_output += f"#### {f['title']}\n\n"

                    # Metadata Table
                    md_output += "| Severity | CWE | Occurrences |\n"
                    md_output += "|---|---|---|\n"
                    md_output += f"| {f['severity']} | {f['cwe']} | {len(f['occurrences'])} |\n\n"

                    md_output += f"**Description:**\n{f['description']}\n\n"
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                    # Affected Endpoints / Specific Info
                    md_output += "**Findings & Evidence:**\n"
                    for occ in f['occurrences']:
                        md_output += f"- {occ['title_specific']}\n"

                    # Detailed HTTP Requests in dropdown
                    md_output += "\n<details>\n<summary><b>View HTTP Requests</b></summary>\n\n"
                    for idx, occ in enumerate(f['occurrences']):
                        if occ['request']:
                            md_output += f"**Occurrence {idx + 1}:**\n"
                            md_output += f"```http\n{occ['request']}\n```\n"
                    md_output += "</details>\n\n"

                    if f['references']:
                        md_output += f"**References:**\n{f['references']}\n"

                    md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Wapiti Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Wapiti Scan Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "Wapiti: Parse Error"
            }