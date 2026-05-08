import csv
import io
import json
import hashlib


class ProwlerParser:
    """
    Standalone Prowler Parser.
    Converts Prowler Cloud Security outputs (CSV or JSON) directly into formatted Markdown.
    Supports AWS, Azure, GCP, and Kubernetes assessments.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Prowler CSV or JSON report.
        """
        try:
            content = file_content.strip()

            # JSON Detection
            if content.startswith("["):
                data = json.loads(content)
                if len(data) > 0 and isinstance(data[0], dict):
                    if "status_code" in data[0] and "finding_info" in data[0]:
                        return True

            # CSV Detection (Semicolon separated)
            if "PROVIDER;" in content and "CHECK_TITLE;" in content and "STATUS;" in content:
                return True

        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Prowler JSON/CSV and returns a formatted Markdown dictionary."""
        try:
            content = file_content.strip()

            if content.startswith("["):
                findings = self._parse_json(content)
            else:
                findings = self._parse_csv(content)

            # Group findings by the Check Title to aggregate affected resources
            grouped_findings = {}

            for f in findings:
                group_key = hashlib.sha256(
                    f"{f['title']}_{f['severity']}_{f['cloud_type']}".encode("utf-8")
                ).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f["title"],
                        "severity": f["severity"],
                        "cloud_type": f["cloud_type"],
                        "service": f["service"],
                        "description": f["description"],
                        "mitigation": f["mitigation"],
                        "references": f["references"],
                        "compliance": f.get("compliance", ""),
                        "affected_resources": set()
                    }

                # Add resource context (Region, Pod, Status Details)
                resource_context = f.get("resource_context", "")
                if resource_context:
                    grouped_findings[group_key]["affected_resources"].add(resource_context)

            # --- Generate Markdown ---
            md_output = "### Prowler Cloud Security Posture Results\n\n"

            if not grouped_findings:
                md_output += "*No active misconfigurations found. All checks passed.*\n"
                return {"markdown": md_output, "command": "", "title": "Prowler Scan"}

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Cloud | Service |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['cloud_type']} | `{f['service']}` |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['mitigation']:
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                if f['compliance']:
                    md_output += f"**Compliance Mappings:**\n{f['compliance']}\n\n"

                # Render Affected Resources
                resources = sorted(list(f['affected_resources']))
                if resources:
                    md_output += f"**Affected Resources ({len(resources)} occurrences):**\n"
                    for res in resources[:30]:  # Limit output to prevent extreme bloat
                        md_output += f"- {res}\n"

                    if len(resources) > 30:
                        md_output += f"- *... and {len(resources) - 30} more affected resources.*\n"
                    md_output += "\n"

                if f['references']:
                    md_output += f"**References:**\n{f['references']}\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Prowler Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Prowler Scan Results\n\n**Error:** Failed to parse report: {str(e)}",
                "command": "",
                "title": "Prowler: Parse Error"
            }

    # ==========================================
    # JSON Parsing Logic
    # ==========================================
    def _parse_json(self, content: str) -> list:
        data = json.loads(content)
        findings = []

        for node in data:
            if node.get("status_code") == "PASS":
                continue

            cloud_type = self._get_cloud_type(node)
            title = node.get("message", "Unknown Check")
            severity = self._normalize_severity(node.get("severity"))
            service = node.get("metadata", {}).get("product", {}).get("name", "N/A")

            # Resource Context Extraction
            status_detail = node.get("status_detail", "")
            resource_context = status_detail
            if cloud_type in {"GCP", "AWS", "AZURE"}:
                region = node.get("cloud", {}).get("region", "N/A")
                resource_context += f" (Region: {region})"
            elif cloud_type == "KUBERNETES":
                for res in node.get("resources", []):
                    pod = res.get("data", {}).get("metadata", {}).get("name")
                    ns = res.get("data", {}).get("metadata", {}).get("namespace")
                    if pod and ns:
                        resource_context += f" (Pod: {pod}, Namespace: {ns})"

            # Mitigation
            remediation = node.get("remediation", {})
            mitigation_desc = remediation.get("desc", "N/A")
            mitigation_refs = ", ".join(remediation.get("references", []))
            mitigation = mitigation_desc
            if mitigation_refs:
                mitigation += f"\n\n*Reference code/links:* {mitigation_refs}"

            # Compliance mappings
            compliance = ""
            comp_dict = node.get("unmapped", {}).get("compliance", {})
            for key, values in comp_dict.items():
                joined = ", ".join(values)
                compliance += f"- **{key}**: {joined}\n"

            # References
            references = ""
            rel_url = node.get("unmapped", {}).get("related_url", "")
            if rel_url:
                references = f"- [Related URL]({rel_url})\n"

            findings.append({
                "title": title,
                "severity": severity,
                "cloud_type": cloud_type,
                "service": service,
                "description": node.get("finding_info", {}).get("desc", "N/A"),
                "mitigation": mitigation,
                "compliance": compliance,
                "references": references,
                "resource_context": resource_context
            })

        return findings

    # ==========================================
    # CSV Parsing Logic
    # ==========================================
    def _parse_csv(self, content: str) -> list:
        findings = []
        reader = csv.DictReader(io.StringIO(content), delimiter=";")

        for row in reader:
            if row.get("STATUS") == "PASS":
                continue

            provider = row.get("PROVIDER", "N/A").upper()
            title = row.get("CHECK_TITLE", "Unknown Check")
            severity = self._normalize_severity(row.get("SEVERITY"))
            service = row.get("SERVICE_NAME", "N/A")

            # Resource Context Extraction
            region = row.get("REGION", "N/A")
            status_extended = row.get("STATUS_EXTENDED", "N/A")
            resource_context = f"{status_extended} (Region: {region})"

            # Mitigation
            mitigation = row.get("REMEDIATION_RECOMMENDATION_TEXT", "N/A")
            remediation_urls = row.get("REMEDIATION_RECOMMENDATION_URL", "")
            iac = row.get("REMEDIATION_CODE_NATIVEIAC", "")
            tf = row.get("REMEDIATION_CODE_TERRAFORM", "")
            cli = row.get("REMEDIATION_CODE_CLI", "")

            if remediation_urls and remediation_urls != "N/A":
                mitigation += f"\n\n*URL:* {remediation_urls}"
            if iac and iac != "N/A":
                mitigation += f"\n\n*Native IaC:* `{iac}`"
            if tf and tf != "N/A":
                mitigation += f"\n\n*Terraform:* `{tf}`"
            if cli and cli != "N/A":
                mitigation += f"\n\n*CLI:* `{cli}`"

            # References
            references = ""
            if row.get("RELATED_URL"):
                references += f"- [Related URL]({row.get('RELATED_URL')})\n"
            if row.get("ADDITIONAL_URLS"):
                references += f"- [Additional URL]({row.get('ADDITIONAL_URLS')})\n"

            # Compliance
            comp_raw = row.get("COMPLIANCE", "N/A")
            compliance = ""
            if comp_raw != "N/A":
                for part in comp_raw.split("|"):
                    compliance += f"- {part.strip()}\n"

            findings.append({
                "title": title,
                "severity": severity,
                "cloud_type": provider,
                "service": service,
                "description": row.get("DESCRIPTION", "N/A"),
                "mitigation": mitigation,
                "compliance": compliance,
                "references": references,
                "resource_context": resource_context
            })

        return findings

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Info"
        s = severity.strip().capitalize()
        if s in {"Critical", "High", "Medium", "Low"}:
            return s
        return "Info"

    def _get_cloud_type(self, node: dict) -> str:
        account_type = node.get("cloud", {}).get("provider", "").upper()
        if account_type in {"GCP", "AWS", "AZURE"}:
            return account_type

        for resource in node.get("resources", []):
            namespace = resource.get("data", {}).get("metadata", {}).get("namespace")
            if namespace is not None:
                return "KUBERNETES"

        return "N/A"