import xml.etree.ElementTree as ET
import json
import re


class NiktoParser:
    def detect(self, file_content: str) -> bool:
        return "<niktoscan" in file_content or '"niktoscan"' in file_content.lower()

    def parse(self, file_content: str) -> dict:
        """Surgically extracts only the valid XML/JSON blocks, handling Nikto appends."""

        # If it contains Nikto XML tags
        if "<niktoscan" in file_content:
            # Find ALL <niktoscan> blocks in the file (ignores the <?xml> header entirely)
            matches = re.findall(r'<niktoscan.*?</niktoscan>', file_content, re.IGNORECASE | re.DOTALL)

            if matches:
                # Grab the LAST scan in the file (in case Nikto appended multiple runs)
                clean_xml = matches[-1]
            else:
                return {
                    "markdown": "### Nikto Scan Results\n\n**Error:** Could not find a complete `</niktoscan>` block.",
                    "command": "", "title": "Nikto: Parse Error"}

            # Strip the DOCTYPE tag so Python doesn't crash
            clean_xml = re.sub(r'<!DOCTYPE[^>]*>', '', clean_xml)

            return self.parse_xml(clean_xml.strip())

        # If it doesn't have XML, assume JSON
        else:
            # Find ALL JSON objects in the file
            matches = re.findall(r'(\{.*\}|\[.*\])', file_content, re.DOTALL)

            if matches:
                clean_json = matches[-1]  # Grab the last one
            else:
                clean_json = file_content

            return self.parse_json(clean_json.strip())

    def parse_xml(self, clean_xml: str) -> dict:
        try:
            root = ET.fromstring(clean_xml)
            scan_details = root.find('scandetails')

            if scan_details is None:
                raise ValueError("No 'scandetails' tag found.")

            target_ip = scan_details.get('targetip', 'Target')
            target_port = scan_details.get('targetport', '')
            title = f"Nikto: {target_ip}:{target_port}"
            command = root.get('options', '')

            md_output = f"### Nikto Scan Results ({target_ip}:{target_port})\n\n"
            md_output += "| OSVDB | Method | URI | Description |\n"
            md_output += "|---|---|---|---|\n"

            items = scan_details.findall('item')
            if not items:
                md_output += "| - | - | - | No vulnerabilities found. |\n"

            detailed_findings = []

            for item in items:
                vuln_id = item.get('osvdbid', '0')
                method = item.get('method', 'GET')

                uri_elem = item.find('uri')
                desc_elem = item.find('description')

                uri = uri_elem.text if uri_elem is not None else '/'
                desc = desc_elem.text.strip() if desc_elem is not None else 'No description provided.'

                short_desc = desc.replace('\n', ' ')
                if len(short_desc) > 80:
                    short_desc = short_desc[:77] + "..."

                md_output += f"| {vuln_id} | {method} | `{uri}` | {short_desc} |\n"
                detailed_findings.append(f"**OSVDB: {vuln_id} | Method: {method} | URI: `{uri}`**\n{desc}\n")

            if detailed_findings:
                md_output += "\n#### Detailed Findings\n\n"
                md_output += "\n---\n\n".join(detailed_findings)

            return {
                "markdown": md_output,
                "command": command,
                "title": title
            }

        except Exception as e:
            # We print the exact error string so we know why it failed!
            return {"markdown": f"### Nikto Scan Results\n\n**Error:** Failed to parse Nikto XML: {str(e)}",
                    "command": "", "title": "Nikto: Parse Error"}

    def parse_json(self, clean_json: str) -> dict:
        try:
            data = json.loads(clean_json)

            if type(data) is list and len(data) > 0:
                scan_data = data[0]
            else:
                scan_data = data

            target_ip = scan_data.get('ip', 'Target')
            target_port = scan_data.get('port', '')
            title = f"Nikto: {target_ip}:{target_port}"
            command = ""

            md_output = f"### Nikto Scan Results ({target_ip}:{target_port})\n\n"
            md_output += "| OSVDB | Method | URI | Description |\n"
            md_output += "|---|---|---|---|\n"

            vulnerabilities = scan_data.get('vulnerabilities', [])
            if not vulnerabilities:
                md_output += "| - | - | - | No vulnerabilities found. |\n"

            detailed_findings = []

            for vuln in vulnerabilities:
                vuln_id = vuln.get('id', '0')
                method = vuln.get('method', 'GET')
                uri = vuln.get('url', '/')
                desc = vuln.get('msg', 'No description provided.')

                short_desc = desc.replace('\n', ' ')
                if len(short_desc) > 80:
                    short_desc = short_desc[:77] + "..."

                md_output += f"| {vuln_id} | {method} | `{uri}` | {short_desc} |\n"
                detailed_findings.append(f"**OSVDB: {vuln_id} | Method: {method} | URI: `{uri}`**\n{desc}\n")

            if detailed_findings:
                md_output += "\n#### Detailed Findings\n\n"
                md_output += "\n---\n\n".join(detailed_findings)

            return {
                "markdown": md_output,
                "command": command,
                "title": title
            }
        except Exception as e:
            return {"markdown": f"### Nikto Scan Results\n\n**Error:** Failed to parse Nikto JSON: {str(e)}",
                    "command": "", "title": "Nikto: Parse Error"}