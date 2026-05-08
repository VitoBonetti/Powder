import json
import html2text


class ArachniParser:
    def __init__(self):
        self.html_converter = html2text.HTML2Text()
        self.html_converter.ignore_links = False
        self.html_converter.body_width = 0

    def detect(self, file_content: str) -> bool:
        try:
            tree = json.loads(file_content)
            if "issues" in tree and isinstance(tree["issues"], list):
                version_info = str(tree.get("version", "")).lower()
                if "arachni" in version_info:
                    return True
                if len(tree["issues"]) > 0:
                    first_issue = tree["issues"][0]
                    if "digest" in first_issue and "vector" in first_issue:
                        return True
                if "arachni" in file_content[:1000].lower():
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        try:
            tree = json.loads(file_content)
            items = {}

            for node in tree.get("issues", []):
                item = self._extract_item(node)
                dupe_key = f"{item['severity']}_{item['title']}"

                if dupe_key in items:
                    if item['url'] not in items[dupe_key]['urls']:
                        items[dupe_key]['urls'].append(item['url'])
                    items[dupe_key]['req_resp'].extend(item['req_resp'])
                    items[dupe_key]['count'] += 1
                else:
                    item['urls'] = [item['url']]
                    item['count'] = 1
                    items[dupe_key] = item

            findings = list(items.values())

            md_output = "### Arachni Scan Results\n\n"
            if not findings:
                md_output += "*No vulnerabilities found.*\n"
            else:
                for f in findings:
                    md_output += f"#### {f['title']}\n\n"
                    md_output += "| Severity | CWE | Occurrences |\n"
                    md_output += "|---|---|---|\n"
                    md_output += f"| {f['severity']} | {f['cwe']} | {f['count']} |\n\n"
                    md_output += "**Description:**\n"
                    md_output += f"{f['description']}\n\n"
                    md_output += "**Remediation:**\n"
                    md_output += f"{f['remediation']}\n\n"
                    md_output += "**Affected URLs:**\n"
                    for u in f['urls']:
                        md_output += f"- `{u}`\n"
                    md_output += "\n"
                    if f['references'] != "N/A":
                        md_output += "**References:**\n"
                        md_output += f"{f['references']}\n\n"
                    if f['req_resp']:
                        md_output += "<details>\n<summary><b>View Evidence (Request / Response)</b></summary>\n\n"
                        evidence = f['req_resp'][0]
                        md_output += "**Request:**\n```http\n" + evidence['req'].strip()[:2000] + "\n```\n\n"
                        md_output += "**Response:**\n```http\n" + evidence['resp'].strip()[:2000] + "\n...[truncated]\n```\n\n"
                        md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Arachni Web Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Arachni Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Arachni: Parse Error"
            }


def _extract_item(self, item_node) -> dict:
    if "vector" in item_node and "action" in item_node["vector"]:
        url = item_node["vector"]["action"]
    else:
        url = item_node.get("response", {}).get("url", "Unknown URL")

    request = item_node.get("request", {})
    req_str = "".join([f"{k}: {v}\n" for k, v in request.items()])

    response = item_node.get("response", {})
    resp_str = "".join([f"{k}: {v}\n" for k, v in response.items() if k != "body"])
    resp_str += f"\n\n{response.get('body', '')}"

    description = self.html_converter.handle(item_node.get("description", "N/A")).strip()
    remedy = item_node.get("remedy_guidance", "")
    remediation = self.html_converter.handle(remedy).strip() if remedy else "N/A"

    references = item_node.get("references", {})
    ref_list = [f"- [{name}]({link})" for name, link in references.items()]
    references_md = "\n".join(ref_list) if ref_list else "N/A"

    severity = item_node.get("severity", "Info").capitalize()
    if severity == "Informational": severity = "Info"

    return {
        "title": item_node.get("name", "Unknown Finding"),
        "severity": severity,
        "description": description,
        "remediation": remediation,
        "references": references_md,
        "cwe": item_node.get("cwe", "N/A"),
        "url": url,
        "req_resp": [{"req": req_str, "resp": resp_str}] if request and response else []
    }