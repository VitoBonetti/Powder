import datetime
import json
import hashlib


class WpscanParser:
    """
    Standalone WPScan JSON Parser.
    Converts WordPress security scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a WPScan JSON report.
        """
        try:
            data = json.loads(file_content)
            # WPScan reports typically include these core keys
            if "target_url" in data and ("plugins" in data or "version" in data):
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Takes a WPScan JSON string and returns a formatted Markdown dictionary."""
        try:
            tree = json.loads(file_content)
            dupes = {}

            # 1. Extract Report Metadata
            target_url = tree.get("target_url", "Unknown Target")
            report_date = "Unknown"
            if "start_time" in tree:
                report_date = datetime.datetime.fromtimestamp(
                    tree.get("start_time"), datetime.UTC
                ).strftime('%Y-%m-%d %H:%M:%S UTC')

            # 2. Manage plugin findings
            for plugin_name, node in tree.get("plugins", {}).items():
                self._process_vulnerabilities(
                    node.get("vulnerabilities", []),
                    dupes,
                    node=node,
                    plugin=plugin_name
                )

            # 3. Manage WordPress version findings
            version_node = tree.get("version")
            if version_node and version_node.get("vulnerabilities"):
                self._process_vulnerabilities(
                    version_node.get("vulnerabilities", []),
                    dupes,
                    node=version_node
                )

            # 4. Manage "Interesting Findings" (Exposed files, headers, etc.)
            for item in tree.get("interesting_findings", []):
                self._process_interesting_finding(item, dupes)

            # --- Generate the Markdown ---
            md_output = f"### WPScan Security Report\n\n"
            md_output += f"**Target:** `{target_url}`  \n"
            md_output += f"**Scan Date:** `{report_date}`\n\n"

            if not dupes:
                md_output += "*No vulnerabilities or interesting findings identified.*\n"
            else:
                for finding in dupes.values():
                    md_output += f"#### {finding['title']}\n\n"

                    md_output += "| Severity | Component | Version | Confidence |\n"
                    md_output += "|---|---|---|---|\n"
                    md_output += f"| {finding['severity']} | {finding['component']} | {finding['version']} | {finding['confidence']}/10 |\n\n"

                    md_output += f"**Description:**  \n{finding['description']}\n\n"

                    if finding.get('mitigation'):
                        md_output += f"**Mitigation:** {finding['mitigation']}\n\n"

                    if finding.get('references'):
                        md_output += f"**References:**  \n{finding['references']}\n"

                    md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": f"WPScan: {target_url}"
            }

        except Exception as e:
            return {
                "markdown": f"### WPScan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "WPScan: Parse Error"
            }

    def _process_vulnerabilities(self, vulnerabilities, dupes, node=None, plugin=None):
        """Processes core or plugin vulnerabilities into the dupes dictionary."""
        for vul in vulnerabilities:
            title = vul.get("title", "Unknown Vulnerability")

            # Use WPVDB ID as unique identifier for grouping
            unique_id = "unknown"
            if "wpvulndb" in vul.get("references", {}):
                unique_id = str(vul["references"]["wpvulndb"][0])

            description = f"Vulnerability identified in {'plugin `' + plugin + '`' if plugin else 'WordPress Core'}.\n"

            if node and node.get("location"):
                description += f"**Location:** `{node['location']}`\n"

            # Create group entry
            group_key = hashlib.sha256(f"vuln_{unique_id}_{title}".encode()).hexdigest()

            if group_key not in dupes:
                dupes[group_key] = {
                    "title": title,
                    "severity": "Medium",
                    "component": plugin if plugin else "WordPress Core",
                    "version": node.get("version", {}).get("number", "Unknown") if node else "Unknown",
                    "confidence": self._calc_confidence(node.get("confidence") if node else None),
                    "description": description,
                    "mitigation": f"Fixed in version {vul['fixed_in']}" if vul.get("fixed_in") else "",
                    "references": self._generate_references(vul.get("references", {}))
                }

    def _process_interesting_finding(self, item, dupes):
        """Processes non-vulnerability findings (headers, xmlrpc, etc.)."""
        title = f"Interesting finding: {item.get('to_s')}"
        url = item.get("url", "N/A")

        description = f"**Type:** `{item.get('type')}`  \n"
        description += f"**URL:** `{url}`  \n"

        if item.get("interesting_entries"):
            entries = ", ".join(item["interesting_entries"])
            description += f"**Details:** `{entries}`\n"

        group_key = hashlib.sha256(f"int_{title}_{url}".encode()).hexdigest()

        if group_key not in dupes:
            dupes[group_key] = {
                "title": title,
                "severity": "Info",
                "component": "N/A",
                "version": "N/A",
                "confidence": self._calc_confidence(item.get("confidence")),
                "description": description,
                "references": self._generate_references(item.get("references", {}))
            }

    def _generate_references(self, refs_node):
        references = ""
        for ref_type, items in refs_node.items():
            for item in items:
                if ref_type == "url":
                    references += f"* [{item}]({item})\n"
                elif ref_type == "wpvulndb":
                    references += f"* [WPScan WPVDB](https://wpscan.com/vulnerability/{item})\n"
                elif ref_type == "cve":
                    references += f"* [CVE-{item}](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-{item})\n"
                else:
                    references += f"* {item} ({ref_type})\n"
        return references

    def _calc_confidence(self, val):
        if val is None: return "Unknown"
        # Original logic: val 0-100. Dojo format 10 (certain) to 0 (wrong)
        try:
            val_raw = round(int(val) / 10)
            return 10 - (10 - val_raw)  # Simplified to direct 0-10 scale
        except:
            return "Unknown"