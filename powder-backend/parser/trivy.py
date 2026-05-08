import json
import hashlib


class TrivyParser:
    """
    Standalone Aquasecurity Trivy JSON Parser.
    Converts Trivy scanner outputs directly into formatted Markdown.
    Supports Vulnerabilities, Misconfigurations, Secrets, and Licenses across
    all Trivy JSON schema versions.
    """

    SEVERITY_MAP = {
        "CRITICAL": "Critical",
        "HIGH": "High",
        "MEDIUM": "Medium",
        "LOW": "Low",
        "UNKNOWN": "Info"
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Trivy JSON report.
        """
        try:
            data = json.loads(file_content)
            # Legacy format
            if isinstance(data, list) and len(data) > 0 and "Target" in data[0]:
                return True
            # Schema 2+ or K8s Cluster Format
            if isinstance(data, dict):
                if "SchemaVersion" in data or "ArtifactName" in data or "ClusterName" in data:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Trivy JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)

            vulns = {}
            misconfigs = {}
            secrets = {}
            licenses = {}

            # Handle different Trivy Schema structures
            if isinstance(data, list):
                self._process_results(data, vulns, misconfigs, secrets, licenses)
            elif isinstance(data, dict):
                if "Results" in data:
                    self._process_results(data["Results"], vulns, misconfigs, secrets, licenses)
                else:
                    # K8s Cluster format splits by categories at the root
                    for category in ["Vulnerabilities", "Misconfigurations", "Resources"]:
                        for item in data.get(category, []):
                            self._process_results(item.get("Results", []), vulns, misconfigs, secrets, licenses)

            # --- Generate Markdown ---
            md_output = "### Aquasecurity Trivy Scan Results\n\n"

            if not any([vulns, misconfigs, secrets, licenses]):
                md_output += "*No findings detected in the Trivy scan.*\n"
                return {"markdown": md_output, "command": "", "title": "Trivy Scan"}

            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}

            # 1. Vulnerabilities
            if vulns:
                md_output += "#### Software Vulnerabilities\n\n"
                sorted_vulns = sorted(vulns.values(), key=lambda x: severity_order.get(x['severity'], 5))
                for v in sorted_vulns:
                    md_output += f"##### [{v['id']}] {v['pkg_name']} (v{v['installed_ver']})\n\n"
                    md_output += "| Severity | Target | Status | Fixed Version |\n"
                    md_output += "|---|---|---|---|\n"
                    md_output += f"| **{v['severity']}** | `{v['target']}` | {v['status']} | `{v['fixed_ver']}` |\n\n"

                    md_output += f"**Description:**\n{v['description']}\n\n"
                    if v['references']:
                        md_output += f"**References:**\n{v['references']}\n\n"
                    md_output += "---\n\n"

            # 2. Misconfigurations
            if misconfigs:
                md_output += "#### Misconfigurations (IaC & Configs)\n\n"
                sorted_misc = sorted(misconfigs.values(), key=lambda x: severity_order.get(x['severity'], 5))
                for m in sorted_misc:
                    md_output += f"##### [{m['id']}] {m['title']}\n\n"
                    md_output += "| Severity | Target | Type |\n"
                    md_output += "|---|---|---|\n"
                    md_output += f"| **{m['severity']}** | `{m['target']}` | {m['type']} |\n\n"

                    md_output += f"**Description:**\n{m['description']}\n\n"
                    if m['message']:
                        md_output += f"**Message:**\n```text\n{m['message']}\n```\n\n"
                    if m['resolution']:
                        md_output += f"**Resolution:** {m['resolution']}\n\n"
                    if m['primary_url']:
                        md_output += f"**Reference:** [{m['primary_url']}]({m['primary_url']})\n\n"
                    md_output += "---\n\n"

            # 3. Secrets
            if secrets:
                md_output += "#### Hardcoded Secrets\n\n"
                sorted_secs = sorted(secrets.values(), key=lambda x: severity_order.get(x['severity'], 5))
                for s in sorted_secs:
                    md_output += f"##### {s['title']} in `{s['target']}`\n\n"
                    md_output += f"- **Severity:** {s['severity']}\n"
                    md_output += f"- **Category:** {s['category']}\n"
                    md_output += f"- **Match:** `{s['match']}` (Line: {s['line']})\n\n"
                    md_output += "---\n\n"

            # 4. Licenses
            if licenses:
                md_output += "#### License Compliance\n\n"
                sorted_lics = sorted(licenses.values(), key=lambda x: severity_order.get(x['severity'], 5))
                for l in sorted_lics:
                    md_output += f"##### {l['name']} in `{l['pkg_name']}`\n\n"
                    md_output += f"- **Severity:** {l['severity']}\n"
                    md_output += f"- **Category:** {l['category']}\n"
                    md_output += f"- **File Path:** `{l['filepath']}`\n"
                    if l['link']:
                        md_output += f"- **Reference:** [{l['link']}]({l['link']})\n\n"
                    md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Trivy Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Trivy Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Trivy: Parse Error"
            }


# ==========================================
# DATA ROUTING & EXTRACTION
# ==========================================
def _process_results(self, results: list, vulns: dict, misconfigs: dict, secrets: dict, licenses: dict):
    if not results:
        return

    for target_data in results:
        if not isinstance(target_data, dict) or "Target" not in target_data:
            continue

        target = target_data.get("Target", "Unknown Target")
        target_type = target_data.get("Type", "Unknown Type")

        # 1. Vulnerabilities
        for v in target_data.get("Vulnerabilities", []):
            vuln_id = v.get("VulnerabilityID", "Unknown ID")
            pkg_name = v.get("PkgName", "Unknown Package")
            installed_ver = v.get("InstalledVersion", "Unknown")

            # Filter out un-actionable VEX statuses if desired (matching Dojo logic)
            status = v.get("Status", "affected")
            if status in ["not_affected", "unknown"]:
                continue

            severity = self.SEVERITY_MAP.get(v.get("Severity"), "Info")
            fixed_ver = v.get("FixedVersion", "No fix available")

            refs = "\n".join([f"- {r}" for r in v.get("References", [])])

            group_key = hashlib.sha256(f"vuln_{vuln_id}_{pkg_name}_{installed_ver}_{target}".encode()).hexdigest()
            vulns[group_key] = {
                "id": vuln_id,
                "pkg_name": pkg_name,
                "installed_ver": installed_ver,
                "fixed_ver": fixed_ver,
                "severity": severity,
                "status": status.replace("_", " ").title(),
                "target": target,
                "description": v.get("Description", "No description provided."),
                "references": refs
            }

        # 2. Misconfigurations
        for m in target_data.get("Misconfigurations", []):
            misc_id = m.get("AVDID") or m.get("ID", "Unknown ID")
            severity = self.SEVERITY_MAP.get(m.get("Severity"), "Info")

            message = m.get("Message", "")
            # Format cause metadata lines if available
            cause_lines = m.get("CauseMetadata", {}).get("Code", {}).get("Lines", [])
            if cause_lines:
                message += "\n\n**Code Context:**\n"
                for line in cause_lines:
                    message += f"{line.get('Number', '?')}: {line.get('Content', '')}\n"

            group_key = hashlib.sha256(f"misc_{misc_id}_{target}".encode()).hexdigest()
            misconfigs[group_key] = {
                "id": misc_id,
                "title": m.get("Title", "Unknown Misconfiguration"),
                "severity": severity,
                "type": target_type,
                "target": target,
                "description": m.get("Description", "No description provided."),
                "message": message.strip(),
                "resolution": m.get("Resolution", ""),
                "primary_url": m.get("PrimaryURL", "")
            }

        # 3. Secrets
        for s in target_data.get("Secrets", []):
            title = s.get("Title", "Unknown Secret")
            severity = self.SEVERITY_MAP.get(s.get("Severity"), "Info")
            match = s.get("Match", "Hidden")
            line = s.get("StartLine", "Unknown")

            group_key = hashlib.sha256(f"secret_{title}_{target}_{line}".encode()).hexdigest()
            secrets[group_key] = {
                "title": title,
                "severity": severity,
                "category": s.get("Category", "Unknown"),
                "match": match,
                "line": line,
                "target": target
            }

        # 4. Licenses
        for l in target_data.get("Licenses", []):
            name = l.get("Name", "Unknown License")
            pkg_name = l.get("PkgName", "Unknown Package")
            severity = self.SEVERITY_MAP.get(l.get("Severity"), "Info")

            group_key = hashlib.sha256(f"license_{name}_{pkg_name}_{target}".encode()).hexdigest()
            licenses[group_key] = {
                "name": name,
                "pkg_name": pkg_name,
                "severity": severity,
                "category": l.get("Category", "Unknown"),
                "filepath": l.get("FilePath", target),
                "link": l.get("Link", "")
            }