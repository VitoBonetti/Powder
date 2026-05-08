import json
import hashlib


class RetireJsParser:
    """
    Standalone Retire.js Parser.
    Converts Retire.js scanner JSON outputs directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Retire.js JSON report.
        """
        try:
            data = json.loads(file_content)
            # Standard Retire.js output is either a list of file objects
            # or a dictionary with a 'data' key containing that list.
            if isinstance(data, dict) and "data" in data:
                data = data["data"]

            if isinstance(data, list) and len(data) > 0:
                # Check for the characteristic 'file' and 'results' keys
                if "file" in data[0] and "results" in data[0]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Retire.js JSON and returns a formatted Markdown dictionary."""
        try:
            tree = json.loads(file_content)
            if isinstance(tree, dict) and "data" in tree:
                tree = tree["data"]

            grouped_findings = {}

            for node in tree:
                file_path = node.get("file", "Unknown File")

                for result in node.get("results", []):
                    component = result.get("component", "Unknown Component")
                    version = result.get("version", "Unknown Version")

                    for vulnerability in result.get("vulnerabilities", []):
                        # Extract Severity
                        severity = vulnerability.get("severity", "info").capitalize()

                        # Extract Title from identifiers
                        title = self._get_title(vulnerability)
                        full_title = f"{title} ({component}, {version})"

                        # Create unique grouping key based on finding identity and file
                        group_key = hashlib.md5(
                            f"{full_title}{file_path}".encode()
                        ).hexdigest()

                        if group_key not in grouped_findings:
                            references = "\n".join([f"- {r}" for r in vulnerability.get("info", [])])

                            grouped_findings[group_key] = {
                                "title": full_title,
                                "component": component,
                                "version": version,
                                "severity": severity,
                                "file_path": file_path,
                                "references": references,
                                "description": f"Vulnerability identified in {component} version {version}.",
                                "raw_json": json.dumps(vulnerability, indent=2)
                            }

            # --- Generate Markdown ---
            md_output = "### Retire.js Vulnerability Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable JavaScript libraries were detected.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Retire.js Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Component | Version | CWE |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| {f['severity']} | `{f['component']}` | `{f['version']}` | CWE-1035 |\n\n"

                md_output += f"**Affected File:** `{f['file_path']}`\n\n"

                if f['references']:
                    md_output += f"**References:**\n{f['references']}\n\n"

                # Collapsible raw result for technical review
                md_output += "<details>\n<summary><b>View Raw Vulnerability Data</b></summary>\n\n"
                md_output += f"```json\n{f['raw_json']}\n```\n"
                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Retire.js Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Retire.js Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Retire.js: Parse Error"
            }

    def _get_title(self, vulnerability):
        """Extracts the best possible title from the identifiers block."""
        ids = vulnerability.get("identifiers", {})
        if "summary" in ids:
            return ids["summary"]
        if "CVE" in ids:
            return ", ".join(ids["CVE"]) if isinstance(ids["CVE"], list) else ids["CVE"]
        if "osvdb" in ids:
            return ", ".join(ids["osvdb"]) if isinstance(ids["osvdb"], list) else ids["osvdb"]
        return "Vulnerable Third Party Library"