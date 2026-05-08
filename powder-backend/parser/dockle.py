import json


class DockleParser:
    """
    Standalone Dockle JSON Parser.
    Converts Dockle container image linter output directly into formatted Markdown.
    Groups specific alerts under their parent rule codes to produce a clean report.
    """

    # Dockle native levels: FATAL, WARN, INFO, IGNORE
    SEVERITY_MAP = {
        "FATAL": "High",
        "WARN": "Medium",
        "INFO": "Low"
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Dockle JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            # Dockle JSON wraps findings in a "details" list
            if isinstance(data, dict) and "details" in data:
                details = data.get("details", [])
                if isinstance(details, list) and len(details) > 0:
                    first = details[0]
                    if all(k in first for k in ("code", "level", "title", "alerts")):
                        return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Dockle JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())
            details = data.get("details", [])

            grouped_findings = {}

            for item in details:
                level = item.get("level", "INFO").upper()

                # Skip ignored findings
                if level == "IGNORE":
                    continue

                code = item.get("code", "Unknown Rule")
                title = item.get("title", "No description provided.")
                severity = self.SEVERITY_MAP.get(level, "Info")
                alerts = item.get("alerts", [])

                # Group by Rule Code to aggregate specific alerts
                if code not in grouped_findings:
                    grouped_findings[code] = {
                        "code": code,
                        "title": title,
                        "severity": severity,
                        "alerts": set()
                    }

                # Add specific alerts
                for alert in alerts:
                    grouped_findings[code]["alerts"].add(alert)

            # --- Generate Markdown ---
            md_output = "### Dockle Container Image Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found. The container image complies with all evaluated best practices.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Dockle Scan"
                }

            # Sort by severity (High -> Info)
            severity_order = {"High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### [{f['code']}] {f['title']}\n\n"

                # Severity Badge
                md_output += f"**Severity:** {f['severity']}\n\n"

                # Render specific alerts
                alerts = sorted(list(f['alerts']))
                if alerts:
                    md_output += f"**Audit Details ({len(alerts)} alerts):**\n"

                    for alert in alerts[:30]:  # Cap at 30 to prevent massive walls of text
                        md_output += f"- {alert}\n"

                    if len(alerts) > 30:
                        md_output += f"- *... and {len(alerts) - 30} more alerts.*\n"

                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Dockle Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Dockle Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Dockle: Parse Error"
            }