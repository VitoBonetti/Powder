import json


class TerrascanParser:
    """
    Standalone Terrascan JSON Parser.
    Converts Terrascan IaC scanner output directly into formatted Markdown.
    Groups identical rule violations to produce a clean, actionable report.
    """

    SEVERITY_MAP = {
        "HIGH": "High",
        "MEDIUM": "Medium",
        "LOW": "Low",
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Terrascan JSON report.
        """
        try:
            data = json.loads(file_content)
            if isinstance(data, dict) and "results" in data:
                if "violations" in data["results"]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Terrascan JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            violations = data.get("results", {}).get("violations")

            if not violations:
                violations = []

            grouped_findings = {}

            for item in violations:
                rule_id = item.get("rule_id", "Unknown Rule")
                rule_name = item.get("rule_name", "Unknown Rule Name")
                category = item.get("category", "General")
                description = item.get("description", "No description provided.")
                severity_raw = item.get("severity", "LOW")
                severity = self.SEVERITY_MAP.get(severity_raw.upper(), "Info")

                resource_name = item.get("resource_name", "Unknown Resource")
                resource_type = item.get("resource_type", "Unknown Type")
                file_path = item.get("file", "Unknown File")
                line = item.get("line", 0)

                # Group by Rule ID
                if rule_id not in grouped_findings:
                    grouped_findings[rule_id] = {
                        "title": f"[{rule_id}] {rule_name}",
                        "category": category,
                        "severity": severity,
                        "description": description,
                        "occurrences": set()
                    }

                # Add location to occurrences
                loc_str = f"`{resource_type} / {resource_name}` in `{file_path}` (Line: {line})"
                grouped_findings[rule_id]["occurrences"].add(loc_str)

            # --- Generate Markdown ---
            md_output = "### Terrascan IaC Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found in the scanned infrastructure code.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Terrascan Scan"
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
                md_output += "| Severity | Category |\n"
                md_output += "|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['category']} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                # Render occurrences (affected resources)
                occurrences = sorted(list(f['occurrences']))
                md_output += f"**Affected Resources ({len(occurrences)}):**\n"

                for occ in occurrences[:50]:  # Limit output to prevent huge walls of text
                    md_output += f"- {occ}\n"

                if len(occurrences) > 50:
                    md_output += f"- *... and {len(occurrences) - 50} more affected resources.*\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Terrascan Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Terrascan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Terrascan: Parse Error"
            }