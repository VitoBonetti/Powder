import json
import hashlib


class KubescapeParser:
    """
    Standalone Kubescape JSON Parser.
    Converts Kubescape Kubernetes security scanner output directly into formatted Markdown.
    Groups findings by Security Control to consolidate affected cluster resources.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Kubescape JSON report.
        """
        try:
            data = json.loads(file_content)
            if isinstance(data, dict):
                # Check for standard Kubescape root keys
                if "resources" in data and "results" in data and "summaryDetails" in data:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Kubescape JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)

            # Create a lookup for control metadata
            summary_controls = data.get("summaryDetails", {}).get("controls", {})
            grouped_findings = {}

            for result in data.get("results", []):
                resource_id = result.get("resourceID", "Unknown Resource")

                for control in result.get("controls", []):
                    # Determine if control failed
                    is_retro = "status" not in control or "status" not in control.get("status", {})
                    failed_rules = [r for r in control.get("rules", []) if r.get("status") == "failed"]

                    # If it explicitly passed, or if retro-compatible mode found no failed rules, skip.
                    if not is_retro and control.get("status", {}).get("status") != "failed":
                        continue
                    if is_retro and not failed_rules:
                        continue

                    control_id = control.get("controlID", "Unknown ID")
                    control_name = control.get("name", "Unknown Control")

                    # Initialize the group if it doesn't exist
                    if control_id not in grouped_findings:
                        summary = summary_controls.get(control_id, {})

                        # Category mapping
                        cat_obj = summary.get("category", {})
                        cat_name = cat_obj.get("name", "General")
                        sub_cat = cat_obj.get("subCategory", {}).get("name")
                        category = f"{cat_name} > {sub_cat}" if sub_cat else cat_name

                        grouped_findings[control_id] = {
                            "id": control_id,
                            "name": control_name,
                            "severity": self._map_severity(summary.get("scoreFactor", 0)),
                            "category": category,
                            "description": summary.get("description", "No description provided."),
                            "mitigation": summary.get("mitigation", "No mitigation provided."),
                            "affected_resources": set()
                        }

                    # Add the failing resource to the set
                    grouped_findings[control_id]["affected_resources"].add(resource_id)

            # --- Generate Markdown ---
            md_output = "### Kubescape Cluster Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found. The cluster/manifests comply with all evaluated frameworks.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Kubescape Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_controls = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_controls:
                md_output += f"#### [{f['id']}] {f['name']}\n\n"

                # Metadata Table
                md_output += "| Severity | Category | Reference |\n"
                md_output += "|---|---|---|\n"

                ref_url = f"https://hub.armosec.io/docs/{f['id'].lower()}" if f['id'] != "Unknown ID" else "#"
                md_output += f"| **{f['severity']}** | {f['category']} | [ARMO Docs]({ref_url}) |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['mitigation']:
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                # Render affected Kubernetes resources
                resources = sorted(list(f['affected_resources']))
                md_output += f"**Affected Resources ({len(resources)}):**\n"
                for res in resources[:30]:  # Cap at 30 to prevent massive walls of text
                    md_output += f"- `{res}`\n"

                if len(resources) > 30:
                    md_output += f"- *... and {len(resources) - 30} more resources.*\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Kubescape Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Kubescape Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Kubescape: Parse Error"
            }

    # ==========================================
    # Helpers
    # ==========================================
    def _map_severity(self, score: float) -> str:
        """Maps Kubescape risk score to standard severities."""
        try:
            val = float(score)
            if val <= 4: return "Low"
            if val <= 7: return "Medium"
            if val <= 9: return "High"
            if val <= 10: return "Critical"
        except (ValueError, TypeError):
            pass
        return "Info"