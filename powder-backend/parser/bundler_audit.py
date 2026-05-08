import hashlib

class BundlerAuditParser:
    """
    Standalone Bundler-Audit Parser.
    Converts bundler-audit plain text output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Bundler-Audit plain text report.
        """
        try:
            # bundler-audit reports are text blocks starting with 'Name:'
            return "Name:" in file_content and ("Advisory:" in file_content or "CVE:" in file_content)
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses Bundler-Audit text and returns a formatted Markdown dictionary."""
        try:
            grouped_findings = {}
            warnings = file_content.strip().split("\n\n")

            for warning in warnings:
                if not warning.startswith("Name:"):
                    continue

                gem_name = "Unknown"
                gem_version = "Unknown"
                advisory_id = "Unknown ID"
                criticality = "Unknown"
                advisory_url = ""
                advisory_title = "Unknown Vulnerability"
                advisory_solution = "No solution provided."

                # Extract fields line by line
                for line in warning.splitlines():
                    line = line.strip()
                    if line.startswith("Name:"):
                        gem_name = line.replace("Name:", "").strip()
                    elif line.startswith("Version:"):
                        gem_version = line.replace("Version:", "").strip()
                    elif line.startswith("Advisory:"):
                        advisory_id = line.replace("Advisory:", "").strip()
                    elif line.startswith("CVE:"):
                        advisory_id = line.replace("CVE:", "").strip()
                    elif line.startswith("GHSA:") and advisory_id == "Unknown ID":
                        advisory_id = line.replace("GHSA:", "").strip()
                    elif line.startswith("Criticality:"):
                        criticality = line.replace("Criticality:", "").strip()
                    elif line.startswith("URL:"):
                        advisory_url = line.replace("URL:", "").strip()
                    elif line.startswith("Title:"):
                        advisory_title = line.replace("Title:", "").strip()
                    elif line.startswith("Solution:"):
                        advisory_solution = line.replace("Solution:", "").strip()

                # Normalize Severity
                severity = "Medium" if criticality.lower() == "unknown" else criticality.capitalize()

                # Deduplication Key
                group_key = hashlib.md5(
                    f"bundler-audit{gem_name}{gem_version}{advisory_id}{severity}".encode("utf-8")
                ).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f"[{gem_name} {gem_version}] {advisory_title}",
                        "gem_name": gem_name,
                        "gem_version": gem_version,
                        "advisory_id": advisory_id,
                        "severity": severity,
                        "url": advisory_url,
                        "solution": advisory_solution,
                        "occurrences": 1
                    }
                else:
                    grouped_findings[group_key]["occurrences"] += 1

            # --- Generate Markdown ---
            md_output = "### Bundler-Audit Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerable Ruby gems found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Bundler-Audit Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Ruby Gem | Version | Advisory ID |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['gem_name']}` | `{f['gem_version']}` | {f['advisory_id']} |\n\n"

                md_output += f"**Remediation:**\n{f['solution']}\n\n"

                if f['url']:
                    md_output += f"**Reference:** [{f['advisory_id']}]({f['url']})\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Bundler-Audit Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Bundler-Audit Results\n\n**Error:** Failed to parse text: {str(e)}",
                "command": "",
                "title": "Bundler-Audit: Parse Error"
            }