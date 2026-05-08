import json
import hashlib


class TFSecParser:
    """
    Standalone TFSec Parser.
    Converts TFSec JSON scan reports directly into formatted Markdown.
    Groups identical rule violations to produce a clean, actionable report.
    """

    SEVERITY_MAP = {
        "CRITICAL": "Critical",
        "HIGH": "High",
        "ERROR": "High",
        "MEDIUM": "Medium",
        "WARNING": "Medium",
        "LOW": "Low",
        "INFO": "Info",
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a TFSec JSON report.
        """
        try:
            data = json.loads(file_content)
            if isinstance(data, dict) and "results" in data:
                results = data.get("results")
                if results and isinstance(results, list):
                    # Check for signature TFSec fields in the first result
                    first_item = results[0]
                    if "rule_id" in first_item and "location" in first_item:
                        return True
                elif results is None or len(results) == 0:
                    # Valid envelope but empty results
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses TFSec JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            results = data.get("results")

            if results is None:
                results = []

            grouped_findings = {}

            for item in results:
                # Skip passed checks
                if item.get("passed"):
                    continue

                rule_id = item.get("rule_id", "Unknown Rule")
                rule_desc = item.get("rule_description", "No description provided.")
                rule_provider = item.get("rule_provider", "Unknown Provider")
                description = item.get("description", "")
                impact = item.get("impact", "No impact provided.")
                resolution = item.get("resolution", "No resolution provided.")

                # Extract Links
                links = item.get("links", [])
                if not links and item.get("link"):
                    links = [item.get("link")]
                links = [link for link in links if link]

                # Severity Mapping
                severity_raw = item.get("severity", "LOW").upper()
                severity = self.SEVERITY_MAP.get(severity_raw, "Low")

                # Location Extraction
                loc = item.get("location", {})
                filename = loc.get("filename", "Unknown File")
                start_line = loc.get("start_line", 0)
                end_line = loc.get("end_line", 0)

                # Group by Rule ID and Provider to aggregate locations
                group_key = hashlib.sha256(f"{rule_id}_{rule_provider}".encode("utf-8")).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f"[{rule_id}] {rule_desc}",
                        "rule_id": rule_id,
                        "provider": rule_provider,
                        "severity": severity,
                        "description": description,
                        "impact": impact,
                        "resolution": resolution,
                        "links": links,
                        "occurrences": set()
                    }

                # Add location to occurrences
                loc_str = f"`{filename}` (Lines: {start_line} - {end_line})"
                grouped_findings[group_key]["occurrences"].add(loc_str)

            # --- Generate Markdown ---
            md_output = "### TFSec Infrastructure-as-Code Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found in the Terraform code.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "TFSec Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Provider | Rule ID |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['provider']} | `{f['rule_id']}` |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"
                md_output += f"**Impact:**\n{f['impact']}\n\n"
                md_output += f"**Resolution:**\n{f['resolution']}\n\n"

                # Render occurrences (affected files)
                occurrences = sorted(list(f['occurrences']))
                md_output += f"**Affected Terraform Files ({len(occurrences)}):**\n"
                for occ in occurrences:
                    md_output += f"- {occ}\n"
                md_output += "\n"

                # References
                if f['links']:
                    md_output += "**References:**\n"
                    for link in f['links']:
                        md_output += f"- [{link}]({link})\n"
                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "TFSec Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### TFSec Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "TFSec: Parse Error"
            }