import base64
import re
import html2text
import xml.etree.ElementTree as ET


class BurpParser:
    """
    Standalone Burp Suite XML Parser.
    Converts Burp scanner XML exports directly into formatted Markdown.
    Includes Base64 decoding for Request/Response pairs and Collaborator events.
    """

    def __init__(self):
        self.html_converter = html2text.HTML2Text()
        self.html_converter.body_width = 0

    def detect(self, file_content: str) -> bool:
        """Detects if the file is a Burp Suite XML export."""
        return "<issues" in file_content and "burpVersion" in file_content

    def parse(self, file_content: str) -> dict:
        """Parses Burp XML and returns a formatted Markdown dictionary."""
        try:
            root = ET.fromstring(file_content)
            grouped_findings = {}

            for node in root.findall("issue"):
                item = self._extract_item(node)

                # Grouping by 'type' (vuln_id) as per original logic
                group_key = item['vuln_id']

                if group_key in grouped_findings:
                    # Append new location info and details to the existing group
                    grouped_findings[group_key]['occurrences'].append(item)
                    grouped_findings[group_key]['combined_description'] += f"\n---\n{item['detail']}"
                else:
                    grouped_findings[group_key] = {
                        "title": item['title'],
                        "vuln_id": item['vuln_id'],
                        "severity": item['severity'],
                        "confidence": item['confidence'],
                        "impact": item['impact'],
                        "mitigation": item['mitigation'],
                        "references": item['references'],
                        "cwe": item['cwe'],
                        "combined_description": item['detail'],
                        "occurrences": [item]
                    }

            # --- Generate Markdown ---
            md_output = "### Burp Suite Professional Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
            else:
                for f in grouped_findings.values():
                    md_output += f"#### {f['title']}\n\n"

                    # Metadata Table
                    md_output += "| Severity | Confidence | CWE | Tool ID |\n"
                    md_output += "|---|---|---|---|\n"
                    md_output += f"| {f['severity']} | {f['confidence']} | {f['cwe']} | `{f['vuln_id']}` |\n\n"

                    md_output += f"**Issue Background (Impact):**\n{f['impact']}\n\n"
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                    md_output += f"**Affected Locations ({len(f['occurrences'])} occurrences):**\n"
                    for occ in f['occurrences']:
                        loc_str = f"`{occ['url_host']}{occ['path']}`"
                        if occ['param']:
                            loc_str += f" (Parameter: `{occ['param']}`)"
                        md_output += f"- {loc_str}\n"
                    md_output += "\n"

                    # Evidence (Request/Response)
                    md_output += "<details>\n<summary><b>View Technical Details & Evidence</b></summary>\n\n"
                    md_output += f"**Description & Analysis:**\n{f['combined_description']}\n\n"

                    for idx, occ in enumerate(f['occurrences']):
                        if occ['req_resp']:
                            md_output += f"##### Occurrence {idx + 1} Evidence\n"
                            for rr_idx, rr in enumerate(occ['req_resp']):
                                md_output += f"**Request {rr_idx + 1}:**\n```http\n{rr['req']}\n```\n"
                                if rr['resp']:
                                    md_output += f"**Response {rr_idx + 1}:**\n```http\n{rr['resp']}\n```\n"

                    if f['references']:
                        md_output += f"**References:**\n{f['references']}\n"

                    md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Burp Suite Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Burp Scan Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "Burp: Parse Error"
            }

    def _extract_item(self, node) -> dict:
        """Helper to extract and clean data from a single issue node."""

        # Basic metadata
        vuln_id = node.findtext("type", "Unknown")
        title = node.findtext("name", "Unknown Issue")
        url_host = node.findtext("host", "")
        path = node.findtext("path", "")

        # Confidence conversion
        raw_conf = node.findtext("confidence", "Tentative")
        conf_map = {"Certain": "Certain (High)", "Firm": "Firm (Medium)", "Tentative": "Tentative (Low)"}
        confidence = conf_map.get(raw_conf, raw_conf)

        # Severity cleaning
        severity = node.findtext("severity", "Information")
        if severity.lower() == "information": severity = "Info"

        # Parameter extraction
        location_text = node.findtext("location", "")
        param_match = re.search(r"(?<=\[)(.*)(\])", location_text)
        parameter = param_match.group(1) if param_match else None

        # Request/Response Handling (Base64)
        req_resp = []
        for rr_node in node.findall("requestresponse"):
            req = self._decode_base64(rr_node.findtext("request"))
            resp = self._decode_base64(rr_node.findtext("response"))
            req_resp.append({"req": req, "resp": resp})

        # Collaborator Handling
        collab_text = ""
        for event in node.findall("collaboratorEvent"):
            i_type = event.findtext("interactionType", "")
            origin = event.findtext("originIp", "")
            time = event.findtext("time", "")
            collab_text += f"\nCollaborator Server received a {i_type} interaction from {origin} at {time}. "
            # Grab extra req/resp if present in event
            for rr_node in event.findall("requestresponse"):
                req = self._decode_base64(rr_node.findtext("request"))
                resp = self._decode_base64(rr_node.findtext("response"))
                req_resp.append({"req": req, "resp": resp})

        # HTML to Markdown fields
        impact = self.html_converter.handle(node.findtext("issueBackground", "")).strip()
        detail = self.html_converter.handle(node.findtext("issueDetail", "") + collab_text).strip()

        remedy_base = self.html_converter.handle(node.findtext("remediationBackground", "")).strip()
        remedy_detail = self.html_converter.handle(node.findtext("remediationDetail", "")).strip()
        mitigation = f"{remedy_detail}\n\n{remedy_base}".strip() or "N/A"

        references = self.html_converter.handle(node.findtext("references", "")).strip()

        # CWE extraction
        cwe = "N/A"
        class_node = node.find("vulnerabilityClassifications")
        if class_node is not None:
            cwe_match = re.search(r"CWE-(\d+)", ET.tostring(class_node, encoding='unicode'))
            if cwe_match: cwe = f"CWE-{cwe_match.group(1)}"

        return {
            "title": title, "vuln_id": vuln_id, "severity": severity, "confidence": confidence,
            "url_host": url_host, "path": path, "param": parameter, "req_resp": req_resp,
            "impact": impact, "detail": detail, "mitigation": mitigation,
            "references": references, "cwe": cwe
        }

    def _decode_base64(self, value):
        if not value: return ""
        try:
            decoded = base64.b64decode(value)
            return decoded.decode("utf-8", "replace")
        except Exception:
            return "[Binary Data Redacted]"