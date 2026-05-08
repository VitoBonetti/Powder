import json
import hashlib


class ClairParser:
    """
    Standalone Clair / ClairKlar JSON Parser.
    Converts Clair and Klar container image scanner outputs directly into formatted Markdown.
    Handles both standard Clair and Klar-wrapped JSON schemas.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Clair or ClairKlar JSON report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, dict):
                # Standard Clair signature
                if "image" in data and "vulnerabilities" in data:
                    return True
                # ClairKlar signature
                if "LayerCount" in data and "Vulnerabilities" in data:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Clair JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())
            findings = []

            # Route to the appropriate parsing strategy
            if "image" in data:
                findings = self._parse_clair(data.get("vulnerabilities", []))
                scanner_name = "Clair"
            elif "LayerCount" in data:
                findings = self._parse_klar(data.get("Vulnerabilities", {}))
                scanner_name = "ClairKlar"
            else:
                raise ValueError("Unrecognized Clair JSON format.")

            # Deduplicate findings (using CVE + Package Name)
            grouped_findings = {}
            for f in findings:
                dupe_key = hashlib.sha256(f"{f['id']}_{f['package']}".encode("utf-8")).hexdigest()
                if dupe_key not in grouped_findings:
                    grouped_findings[dupe_key] = f

            # --- Generate Markdown ---
            md_output = f"### {scanner_name} Container Vulnerability Scan\n\n"

            if not grouped_findings:
                md_output += f"*No vulnerabilities found in the {scanner_name} scan.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": f"{scanner_name} Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### [{f['id']}] {f['package']} (v{f['version']})\n\n"

                # Metadata Table
                md_output += "| Severity | Package | Version | Fixed By |\n"
                md_output += "|---|---|---|---|\n"

                fix_str = f"`{f['fixed_by']}`" if f['fixed_by'] and f[
                    'fixed_by'] != "No fix available" else "No fix available"
                md_output += f"| **{f['severity']}** | `{f['package']}` | `{f['version']}` | {fix_str} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['link']:
                    md_output += f"**Reference:** [{f['link']}]({f['link']})\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": f"{scanner_name} Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Clair Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Clair: Parse Error"
            }

    # ==========================================
    # Clair Parsing Logic
    # ==========================================
    def _parse_clair(self, vulns: list) -> list:
        findings = []
        for item in vulns:
            severity_raw = item.get("severity", "Unknown")
            # Map Clair legacy/negligible severities to standard forms
            severity = "Info" if severity_raw in ["Negligible", "Unknown"] else severity_raw.capitalize()

            findings.append({
                "id": item.get("vulnerability", "Unknown CVE"),
                "package": item.get("featurename", "Unknown Package"),
                "version": str(item.get("featureversion", "Unknown Version")),
                "severity": severity,
                "description": item.get("description", "No description provided."),
                "fixed_by": str(item.get("fixedby", "No fix available")),
                "link": item.get("link", "")
            })
        return findings

    # ==========================================
    # ClairKlar Parsing Logic
    # ==========================================
    def _parse_klar(self, vulns_dict: dict) -> list:
        findings = []
        # Klar groups vulnerabilities by severity keys
        for severity_group, items in vulns_dict.items():
            for item in items:
                severity_raw = item.get("Severity", "Unknown")

                # Map Klar-specific severities like 'Defcon1'
                if severity_raw == "Negligible":
                    severity = "Info"
                elif severity_raw in ["Unknown", "Defcon1"]:
                    severity = "Critical"
                else:
                    severity = severity_raw.capitalize()

                findings.append({
                    "id": item.get("Name", "Unknown CVE"),
                    "package": item.get("FeatureName", "Unknown Package"),
                    "version": str(item.get("FeatureVersion", "Unknown Version")),
                    "severity": severity,
                    "description": item.get("Description", "No description provided."),
                    "fixed_by": str(item.get("FixedBy", "No fix available")),
                    "link": item.get("Link", "")
                })
        return findings