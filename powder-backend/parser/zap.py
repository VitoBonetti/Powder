import hashlib
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
import html2text


class ZapParser:
    """
    Standalone OWASP ZAP XML Parser.
    Converts ZAP scanner XML reports directly into formatted Markdown.
    """

    MAPPING_SEVERITY = {"0": "Info", "1": "Low", "2": "Medium", "3": "High"}

    # Maps ZAP riskcode/confidence to standard labels
    MAPPING_CONFIDENCE = {
        "1": "Tentative (Low)",
        "2": "Firm (Medium)",
        "3": "Certain (High)",
        "4": "Certain (User Confirmed)",
    }

    def __init__(self):
        self.html_converter = html2text.HTML2Text()
        self.html_converter.body_width = 0

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a ZAP XML report.
        """
        try:
            return "<OWASPZAPReport" in file_content or ("<site" in file_content and "<alerts" in file_content)
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses ZAP XML and returns a formatted Markdown dictionary."""
        try:
            root = ET.fromstring(file_content)
            grouped_findings = {}

            # ZAP reports are structured by 'site' then 'alerts'
            for site in root.findall("site"):
                site_name = site.get("name", "Unknown Site")

                for alert in site.findall("alerts/alertitem"):
                    category = alert.findtext("alert") or "Unknown Alert"
                    description = self.html_converter.handle(alert.findtext("desc") or "").strip()
                    severity = self.MAPPING_SEVERITY.get(alert.findtext("riskcode"), "Info")
                    confidence = self.MAPPING_CONFIDENCE.get(alert.findtext("confidence"), "Unknown")
                    mitigation = self.html_converter.handle(alert.findtext("solution") or "").strip()
                    references = self.html_converter.handle(alert.findtext("reference") or "").strip()
                    plugin_id = alert.findtext("pluginid") or "N/A"
                    cwe_id = alert.findtext("cweid") or "N/A"

                    # Grouping key to prevent duplicate categories in the report
                    group_key = hashlib.sha256(f"{category}{severity}{plugin_id}".encode()).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": category,
                            "severity": severity,
                            "confidence": confidence,
                            "cwe": f"CWE-{cwe_id}" if cwe_id != "N/A" else "N/A",
                            "plugin_id": plugin_id,
                            "description": description,
                            "mitigation": mitigation,
                            "references": references,
                            "occurrences": []
                        }

                    # ZAP lists every impacted URL as an 'instance'
                    for instance in alert.findall("instances/instance"):
                        uri = instance.findtext("uri") or ""
                        parsed_uri = urlparse(uri)

                        # Reconstruct Request/Response
                        if instance.findtext("requestheader") is not None:
                            request = (instance.findtext("requestheader") or "") + (
                                        instance.findtext("requestbody") or "")
                            response = (instance.findtext("responseheader") or "") + (
                                        instance.findtext("responsebody") or "")
                        else:
                            # Reconstruct from metadata if full traffic wasn't saved
                            request = f"Method: {instance.findtext('method')}\nParam: {instance.findtext('param')}\nAttack: {instance.findtext('attack')}\nQuery: {parsed_uri.query}"
                            response = f"Evidence: {instance.findtext('evidence')}"

                        grouped_findings[group_key]["occurrences"].append({
                            "uri": uri,
                            "clean_uri": parsed_uri._replace(query="", fragment="").geturl(),
                            "request": request,
                            "response": response
                        })

            # --- Generate Markdown ---
            md_output = "### OWASP ZAP Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
            else:
                for f in grouped_findings.values():
                    md_output += f"#### {f['title']}\n\n"

                    # Metadata Table
                    md_output += "| Severity | Confidence | CWE | Plugin ID |\n"
                    md_output += "|---|---|---|---|\n"
                    md_output += f"| {f['severity']} | {f['confidence']} | {f['cwe']} | `{f['plugin_id']}` |\n\n"

                    md_output += f"**Description:**\n{f['description']}\n\n"
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                    # Affected Endpoints
                    md_output += "**Impacted Endpoints:**\n"
                    unique_uris = sorted(list(set(occ['clean_uri'] for occ in f['occurrences'])))
                    for u in unique_uris:
                        md_output += f"- `{u}`\n"
                    md_output += "\n"

                    # Technical Evidence in dropdown
                    md_output += "<details>\n<summary><b>View Technical Evidence (Requests/Responses)</b></summary>\n\n"
                    for idx, occ in enumerate(f['occurrences']):
                        md_output += f"**Occurrence {idx + 1}:** `{occ['uri']}`\n"
                        md_output += f"```http\n{occ['request'].strip()}\n```\n"
                        if occ['response'].strip():
                            md_output += f"**Response/Evidence:**\n```http\n{occ['response'].strip()}\n```\n"
                        md_output += "\n"
                    md_output += "</details>\n\n"

                    if f['references']:
                        md_output += f"**References:**\n{f['references']}\n"

                    md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "OWASP ZAP Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### ZAP Scan Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "ZAP: Parse Error"
            }