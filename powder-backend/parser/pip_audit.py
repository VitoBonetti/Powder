import json
import hashlib


class PipAuditParser:
    """
    Standalone pip-audit JSON Parser.
    Converts pip-audit scanner output directly into formatted Markdown.
    Supports both legacy and modern pip-audit JSON structures.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a pip-audit JSON report.
        """
        try:
            data = json.loads(file_content)
            # Modern format: dict with a 'dependencies' key
            if isinstance(data, dict) and "dependencies" in data:
                return True
            # Legacy format: list of dependency objects
            if isinstance(data, list) and len(data) > 0:
                if "vulns" in data[0] and "name" in data[0]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses pip-audit JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            # Standardize data structure regardless of legacy or modern format
            dependencies = data.get("dependencies", []) if isinstance(data, dict) else data

            for item in dependencies:
                # If the item was skipped by pip-audit (e.g., skip_reason provided), ignore it
                if item.get("skip_reason"):
                    continue

                component_name = item.get("name", "Unknown Package")
                component_version = item.get("version", "Unknown Version")
                vulnerabilities = item.get("vulns", [])

                for vuln in vulnerabilities:
                    vuln_id = vuln.get("id", "Unknown ID")
                    description = vuln.get("description", "No description provided.")
                    fix_versions = vuln.get("fix_versions", [])

                    # pip-audit does not native output CVSS severities in standard json format.
                    # Defaulting to Medium to match original Dojo parser behavior.
                    severity = "Medium"

                    # Format Mitigation Instructions
                    if fix_versions:
                        if len(fix_versions) == 1:
                            mitigation = f"Upgrade to version: `{fix_versions[0]}`"
                        else:
                            mitigation = "**Upgrade to one of the following patched versions:**\n"
                            for fv in fix_versions:
                                mitigation += f"- `{fv}`\n"
                    else:
                        mitigation = "No patched versions are currently available."

                    # Unique Grouping Key
                    group_key = hashlib.sha256(
                        f"{vuln_id}_{component_name}_{component_version}".encode("utf-8")
                    ).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": f"{vuln_id} in {component_name}:{component_version}",
                            "vuln_id": vuln_id,
                            "severity": severity,
                            "component": component_name,
                            "version": component_version,
                            "description": description,
                            "mitigation": mitigation.strip(),
                            "occurrences": 1
                        }
                    else:
                        grouped_findings[group_key]["occurrences"] += 1

            # --- Generate Markdown ---
            md_output = "### pip-audit Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable Python dependencies found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "pip-audit Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Package | Version | Vulnerability ID | CWE |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['component']}` | `{f['version']}` | {f['vuln_id']} | CWE-1395 |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "pip-audit Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### pip-audit Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "pip-audit: Parse Error"
            }