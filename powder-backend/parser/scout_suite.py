import json
import hashlib


class ScoutSuiteParser:
    """
    Standalone ScoutSuite Parser.
    Converts ScoutSuite JS/JSON scan outputs directly into formatted Markdown.
    Groups identical findings and collates affected cloud resources.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a ScoutSuite JS/JSON report.
        """
        try:
            content = file_content.strip()
            # ScoutSuite wraps JSON in a JS variable in the default HTML report
            if content.startswith("scoutsuite_results ="):
                raw_data = content.replace("scoutsuite_results =", "", 1).strip()
                if raw_data.endswith(";"):
                    raw_data = raw_data[:-1]
                data = json.loads(raw_data)
            else:
                data = json.loads(content)

            # Look for ScoutSuite signature keys
            if "provider_name" in data and "services" in data and "last_run" in data:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses ScoutSuite JSON and returns a formatted Markdown dictionary."""
        try:
            content = file_content.strip()

            # Clean JS wrapper if present
            if content.startswith("scoutsuite_results ="):
                raw_data = content.replace("scoutsuite_results =", "", 1).strip()
                if raw_data.endswith(";"):
                    raw_data = raw_data[:-1]
                data = json.loads(raw_data)
            else:
                data = json.loads(content)

            # Metadata Extraction
            provider = data.get("provider_name", "Unknown Provider")
            account_id = data.get("account_id", "Unknown Account")
            last_run = data.get("last_run", {})
            ruleset_name = last_run.get("ruleset_name", "Unknown Ruleset")

            grouped_findings = {}

            # Parse Configured Services
            services = data.get("services", {})
            for service_name, service_item in services.items():
                findings_dict = service_item.get("findings", {})

                for finding_id, finding in findings_dict.items():
                    title = finding.get("description", "Unknown Misconfiguration")
                    severity = self._get_criticality_rating(finding.get("level"))
                    rationale = finding.get("rationale", "")
                    remediation = finding.get("remediation", "")
                    refs = finding.get("references", [])

                    vuln_id = f"{data.get('provider_code', provider)}:{finding_id}"

                    group_key = hashlib.sha256(f"{vuln_id}_{title}".encode("utf-8")).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": title,
                            "vuln_id": vuln_id,
                            "service": service_name,
                            "severity": severity,
                            "rationale": rationale,
                            "remediation": remediation,
                            "references": refs,
                            "affected_items": []
                        }

                    # Collate Affected Resources (Items)
                    # The 'items' list contains dot-notation paths pointing back into the 'services' hierarchy.
                    # We will resolve them to grab the actual misconfigured JSON snippet.
                    for path in finding.get("items", []):
                        resolved_data = self._resolve_path(service_item, path)
                        formatted_resource = self._format_resource_data(resolved_data)

                        grouped_findings[group_key]["affected_items"].append({
                            "path": path,
                            "data": formatted_resource
                        })

            # --- Generate Markdown ---
            md_output = f"### ScoutSuite Cloud Security Scan ({provider})\n\n"
            md_output += f"**Account:** `{account_id}` | **Ruleset:** `{ruleset_name}`\n\n---\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found in this cloud environment.*\n"
                return {"markdown": md_output, "command": "", "title": "ScoutSuite Scan"}

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                md_output += "| Severity | Service | Rule ID |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['service']}` | `{f['vuln_id']}` |\n\n"

                md_output += f"**Rationale:**\n{f['rationale']}\n\n"

                if f['remediation']:
                    md_output += f"**Remediation:**\n{f['remediation']}\n\n"

                # References
                if f['references']:
                    md_output += "**References:**\n"
                    for ref in f['references']:
                        md_output += f"- [{ref}]({ref})\n"
                    md_output += "\n"

                # Affected Resources Dropdown
                if f['affected_items']:
                    count = len(f['affected_items'])
                    md_output += f"<details>\n<summary><b>View Affected Resources ({count})</b></summary>\n\n"

                    for item in f['affected_items']:
                        md_output += f"##### Path: `{item['path']}`\n"
                        if item['data']:
                            md_output += f"```text\n{item['data']}\n```\n"
                        md_output += "\n"
                    md_output += "</details>\n\n"
                md_output += "---\n\n"
            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": f"ScoutSuite Scan: {provider}"
            }
        except Exception as e:
            return {
                "markdown": f"### ScoutSuite Scan Results\n\n**Error:** Failed to parse output: {str(e)}",
                "command": "",
                "title": "ScoutSuite: Parse Error"
            }


# ==========================================
# HELPERS
# ==========================================
def _get_criticality_rating(self, rating: str) -> str:
    if rating == "warning": return "Medium"
    if rating == "danger": return "Critical"
    return "Info"


def _resolve_path(self, service_dict: dict, path: str):
    """
    Resolves a dot-notation path (e.g., 'regions.us-east-1.vpcs.vpc-123')
    against the top-level service dictionary.
    """
    keys = path.split(".")
    current = service_dict

    # We skip the first few keys if they lead into deeply nested policy documents
    # to prevent dumping megabytes of generic AWS data.
    # (This replicates the `break` logic from the original Dojo implementation).
    for i, key in enumerate(keys):
        if isinstance(current, dict) and key in current:
            current = current[key]
            if keys[i - 1] in ["security_groups", "PolicyDocument"]:
                break
        else:
            return f"Unable to resolve path segment: {key}"
    return current


def _format_resource_data(self, src, depth=0) -> str:
    """
    Recursively formats nested dictionaries/lists into a readable text tree.
    """
    out = ""
    indent = "  " * depth

    if isinstance(src, dict):
        for k, v in src.items():
            if isinstance(v, (dict, list)):
                out += f"{indent}{str(k).title()}:\n"
                out += self._format_resource_data(v, depth + 1)
            else:
                out += f"{indent}{str(k).title()}: {v}\n"
    elif isinstance(src, list):
        for item in src:
            if isinstance(item, (dict, list)):
                out += self._format_resource_data(item, depth + 1)
            else:
                out += f"{indent}- {item}\n"
    else:
        out += f"{indent}{src}\n"

    return out