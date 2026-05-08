import json
import hashlib
from urllib.parse import urlparse


class NucleiParser:
    """
    Standalone Nuclei Parser.
    Converts Nuclei JSON/NDJSON scanner outputs directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Nuclei JSON or NDJSON report.
        """
        try:
            # Check if it's a JSON array
            if file_content.strip().startswith("["):
                data = json.loads(file_content)
                if isinstance(data, list) and len(data) > 0:
                    return "template-id" in data[0] or "templateID" in data[0]

            # Check if it's NDJSON
            if file_content.strip().startswith("{"):
                first_line = file_content.splitlines()[0]
                data = json.loads(first_line)
                return "template-id" in data or "templateID" in data
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Nuclei output and returns a formatted Markdown dictionary."""
        try:
            data = self._load_data(file_content)
            grouped_findings = {}

            for item in data:
                template_id = item.get("templateID", item.get("template-id", "unknown"))
                info = item.get("info", {})
                name = info.get("name", "Unknown Nuclei Finding")
                severity = info.get("severity", "info").capitalize()

                matched = item.get("matched", item.get("matched-at", ""))
                host = item.get("host", "")
                matcher = item.get("matcher-name", item.get("matcher_name", ""))

                # Deduplication key consistent with your original logic
                dupe_host = urlparse(matched).hostname or host or "no-host"
                group_key = hashlib.sha256(
                    f"{template_id}{matcher}{dupe_host}".encode()
                ).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": name,
                        "template_id": template_id,
                        "severity": severity,
                        "description": info.get("description", "No description provided."),
                        "mitigation": info.get("remediation", "N/A"),
                        "references": info.get("reference", []),
                        "tags": info.get("tags", []),
                        "classification": info.get("classification", {}),
                        "occurrences": []
                    }

                grouped_findings[group_key]["occurrences"].append({
                    "matched": matched,
                    "curl": item.get("curl-command", ""),
                    "request": item.get("request", ""),
                    "response": item.get("response", ""),
                    "extracted": item.get("extracted-results", [])
                })

            # --- Generate Markdown ---
            md_output = "### Nuclei Vulnerability Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
            else:
                for f in grouped_findings.values():
                    md_output += f"#### {f['title']}\n\n"

                    # Metadata Table
                    cvss_score = f['classification'].get('cvss-score', 'N/A')
                    md_output += "| Severity | CVSS | Template ID | Tags |\n"
                    md_output += "|---|---|---|---|\n"
                    md_output += f"| {f['severity']} | {cvss_score} | `{f['template_id']}` | {', '.join(f['tags'][:5])} |\n\n"

                    md_output += f"**Description:**  \n{f['description']}\n\n"

                    if f['mitigation'] != "N/A":
                        md_output += f"**Mitigation:**  \n{f['mitigation']}\n\n"

                    # List Matched URLs
                    md_output += "**Matched Endpoints:**\n"
                    unique_matches = list(set(occ['matched'] for occ in f['occurrences']))
                    for m in unique_matches:
                        md_output += f"- `{m}`\n"
                    md_output += "\n"

                    # Evidence (Requests/Curls) in dropdown
                    md_output += "<details>\n<summary><b>View Reproduction Steps & Evidence</b></summary>\n\n"
                    for idx, occ in enumerate(f['occurrences']):
                        md_output += f"##### Occurrence {idx + 1}\n"
                        md_output += f"**Target:** `{occ['matched']}`\n"

                        if occ['extracted']:
                            md_output += f"**Extracted Results:** `{', '.join(occ['extracted'])}`  \n"

                        if occ['curl']:
                            md_output += f"**Reproduction:**\n```bash\n{occ['curl']}\n```\n"

                        if occ['request']:
                            md_output += f"<details><summary>Raw Request/Response</summary>\n\n"
                            md_output += f"**Request:**\n```http\n{occ['request']}\n```\n"
                            if occ['response']:
                                # Truncate massive responses
                                resp = occ['response'][:2000] + (
                                    "\n...[truncated]" if len(occ['response']) > 2000 else "")
                                md_output += f"**Response:**\n```http\n{resp}\n```\n"
                            md_output += "</details>\n\n"

                    if f['references']:
                        refs = f['references'] if isinstance(f['references'], list) else [f['references']]
                        md_output += f"**References:**  \n" + "\n".join([f"- {r}" for r in refs]) + "\n"

                    md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Nuclei Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Nuclei Scan Results\n\n**Error:** Failed to parse Nuclei output: {str(e)}",
                "command": "",
                "title": "Nuclei: Parse Error"
            }

    def _load_data(self, file_content: str) -> list:
        content = file_content.strip()
        if content.startswith("["):
            return json.loads(content)
        elif content.startswith("{"):
            return [json.loads(line) for line in content.splitlines() if line.strip()]
        return []