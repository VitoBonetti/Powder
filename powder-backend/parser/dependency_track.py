import json
import hashlib


class DependencyTrackParser:
    """
    Standalone OWASP Dependency-Track Parser.
    Converts Dependency-Track Finding Packaging Format (FPF) JSON
    directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Dependency-Track FPF JSON export.
        """
        try:
            data = json.loads(file_content)
            # FPF exports have a 'findings' array at the root
            if isinstance(data, dict) and "findings" in data:
                # Double check the structure of the first finding if it exists
                if len(data["findings"]) > 0:
                    first = data["findings"][0]
                    if "component" in first and "vulnerability" in first:
                        return True
                else:
                    # Empty findings array but matches root structure
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Dependency-Track JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for finding in data.get("findings", []):
                # 1. Check Analysis State (Skip False Positives)
                analysis = finding.get("analysis", {})
                if analysis.get("state") == "FALSE_POSITIVE":
                    continue

                # 2. Extract Component Info
                component = finding.get("component", {})
                comp_name = component.get("name", "Unknown Component")
                comp_version = component.get("version", "Unknown")
                comp_purl = component.get("purl", "N/A")

                # 3. Extract Vulnerability Info
                vuln = finding.get("vulnerability", {})
                vuln_id = vuln.get("vulnId", "Unknown ID")
                source = vuln.get("source", "Unknown Source")
                cwe = vuln.get("cweId", 1035)  # Default to 1035: Using Components with Known Vulnerabilities

                title = f"{vuln_id} in {comp_name}"

                # Severity Mapping
                raw_severity = vuln.get("severity", "Info")
                severity = self._map_severity(raw_severity)

                # Description Building
                desc = vuln.get("description", "No description provided.")
                if vuln.get("title"):
                    desc = f"**{vuln['title']}**\n\n{desc}"
                if vuln.get("subtitle"):
                    desc = f"*{vuln['subtitle']}*\n\n{desc}"

                # Aliases (e.g., GHSA mapping to CVE)
                aliases = set()
                for alias in vuln.get("aliases", []):
                    for k, v in alias.items():
                        if k.endswith("Id") and v != vuln_id:
                            aliases.add(v)
                aliases_str = ", ".join(aliases) if aliases else "None"

                # Scoring (CVSS & EPSS)
                cvss_score = vuln.get("cvssV3BaseScore") or vuln.get("cvssV4BaseScore", "N/A")
                cvss_vector = vuln.get("cvssV3Vector") or vuln.get("cvssV4Vector", "N/A")
                epss_score = vuln.get("epssScore")
                epss_percentile = vuln.get("epssPercentile")

                # References
                references = vuln.get("references", [])
                refs_md = "\n".join([f"- {r}" for r in references]) if references else "N/A"

                # Unique Grouping Key
                group_key = hashlib.sha256(f"{vuln_id}_{comp_name}_{comp_version}".encode()).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": title,
                        "vuln_id": vuln_id,
                        "source": source,
                        "severity": severity,
                        "component": comp_name,
                        "version": comp_version,
                        "purl": comp_purl,
                        "cwe": f"CWE-{cwe}",
                        "aliases": aliases_str,
                        "cvss_score": cvss_score,
                        "cvss_vector": cvss_vector,
                        "epss_score": epss_score,
                        "epss_percentile": epss_percentile,
                        "description": desc,
                        "references": refs_md
                    }

            # --- Generate Markdown ---
            md_output = "### OWASP Dependency-Track Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No actionable vulnerabilities found (or all findings were marked as False Positives).*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Dependency-Track Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Component | Version | CWE | Source |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['component']}` | `{f['version']}` | {f['cwe']} | {f['source']} |\n\n"

                # Scoring Details
                md_output += f"- **Vulnerability ID:** `{f['vuln_id']}`\n"
                if f['aliases'] != "None":
                    md_output += f"- **Aliases:** {f['aliases']}\n"
                md_output += f"- **Package URL (PURL):** `{f['purl']}`\n"

                if f['cvss_score'] != "N/A":
                    md_output += f"- **CVSS Score:** {f['cvss_score']} (`{f['cvss_vector']}`)\n"
                if f['epss_score']:
                    # Convert EPSS percentile to a readable percentage format
                    percentile_str = f"{float(f['epss_percentile']) * 100:.1f}%" if f['epss_percentile'] else "N/A"
                    md_output += f"- **EPSS Likelihood:** {f['epss_score']} ({percentile_str} percentile)\n"

                md_output += "\n"

                # Description and References
                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['references'] != "N/A":
                    md_output += f"**References:**\n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Dependency-Track Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Dependency-Track Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Dependency-Track: Parse Error"
            }

    def _map_severity(self, severity_str: str) -> str:
        """Maps Dependency-Track severities to standard labels."""
        sev = severity_str.lower()
        if sev == "critical": return "Critical"
        if sev == "high": return "High"
        if sev == "medium": return "Medium"
        if sev == "low": return "Low"
        return "Info"