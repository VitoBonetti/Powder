import json
import hashlib


class CargoAuditParser:
    """
    Standalone Cargo Audit JSON Parser.
    Converts Rust Cargo Audit scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Cargo Audit JSON report.
        """
        try:
            data = json.loads(file_content)
            # Cargo audit JSON reports have a 'vulnerabilities' object containing a 'list'
            if "vulnerabilities" in data and isinstance(data["vulnerabilities"], dict):
                if "list" in data["vulnerabilities"]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Cargo Audit JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            vulnerabilities_list = data.get("vulnerabilities", {}).get("list", [])

            for item in vulnerabilities_list:
                advisory = item.get("advisory", {})
                pkg = item.get("package", {})

                vuln_id = advisory.get("id", "Unknown ID")
                pkg_name = pkg.get("name", "Unknown Package")
                pkg_version = pkg.get("version", "Unknown Version")
                date = advisory.get("date", "Unknown Date")

                # Combine base ID and aliases (like CVEs or GHSAs)
                vulnerability_ids = [vuln_id]
                for alias in advisory.get("aliases", []):
                    vulnerability_ids.append(alias)

                categories = advisory.get('categories', [])
                tags = advisory.get("keywords", [])

                # Determine Mitigation
                try:
                    patched_versions = item.get("versions", {}).get("patched", [])
                    if patched_versions:
                        mitigation = f"Update `{pkg_name}` to version(s): **{', '.join(patched_versions)}**"
                    else:
                        mitigation = "No patched versions are currently available."
                except AttributeError:
                    mitigation = "No information about patched versions provided."

                # Affected Functions
                affected_funcs = []
                affected_node = item.get("affected")
                if affected_node and "functions" in affected_node:
                    for func, versions in affected_node["functions"].items():
                        affected_funcs.append(f"`{func}` (versions: {', '.join(versions)})")

                # References
                references = []
                if advisory.get("url"):
                    references.append(f"- [Advisory URL]({advisory.get('url')})")
                for ref in advisory.get("references", []):
                    references.append(f"- {ref}")

                # Cargo Audit does not natively output a CVSS score in the standard CLI JSON,
                # so we default to High as per standard triage practices for vulnerable dependencies.
                severity = "High"

                # Unique Grouping Key
                group_key = hashlib.sha256(
                    f"{vuln_id}_{date}_{pkg_name}_{pkg_version}".encode("utf-8")
                ).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f"[{pkg_name} {pkg_version}] {advisory.get('title', 'Vulnerability')}",
                        "vuln_id": vuln_id,
                        "aliases": vulnerability_ids,
                        "pkg_name": pkg_name,
                        "pkg_version": pkg_version,
                        "publish_date": date,
                        "severity": severity,
                        "categories": categories,
                        "tags": tags,
                        "description": advisory.get("description", "No description provided."),
                        "affected_funcs": affected_funcs,
                        "mitigation": mitigation,
                        "references": "\n".join(references),
                        "occurrences": 1
                    }
                else:
                    grouped_findings[group_key]["occurrences"] += 1

            # --- Generate Markdown ---
            md_output = "### Cargo Audit Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable Rust dependencies found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Cargo Audit Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Package | Version | Advisory ID | Published |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['pkg_name']}` | `{f['pkg_version']}` | {f['vuln_id']} | {f['publish_date']} |\n\n"

                if len(f['aliases']) > 1:
                    md_output += f"**Aliases:** {', '.join(f['aliases'])}\n\n"

                if f['categories']:
                    md_output += f"**Categories:** {', '.join(f['categories'])}\n\n"

                if f['tags']:
                    md_output += f"**Tags:** {', '.join(f['tags'])}\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['affected_funcs']:
                    md_output += "**Affected Functions:**\n"
                    for func in f['affected_funcs']:
                        md_output += f"- {func}\n"
                    md_output += "\n"

                md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                if f['references']:
                    md_output += f"**References:**\n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Cargo Audit Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Cargo Audit Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Cargo Audit: Parse Error"
            }