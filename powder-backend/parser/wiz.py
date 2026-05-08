import csv
import io
import json
import hashlib
from datetime import datetime


class WizParser:
    """
    Standalone Wiz CSV Parser.
    Converts Wiz Cloud Security and Vulnerability CSV exports directly into formatted Markdown.
    Supports both Issue (CSPM) and Vulnerability (SCA) CSV formats.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Wiz CSV report.
        """
        try:
            reader = csv.DictReader(io.StringIO(file_content.strip()))
            if not reader.fieldnames:
                return False
            # Detect Issue Format or Vulnerability Format
            if "Title" in reader.fieldnames and "Issue ID" in reader.fieldnames:
                return True
            if "Name" in reader.fieldnames and "DetailedName" in reader.fieldnames:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Wiz CSV and returns a formatted Markdown dictionary."""
        try:
            # Increase field size limit for large Wiz JSON fields
            import sys
            csv.field_size_limit(int(sys.maxsize / 10))

            reader = csv.DictReader(io.StringIO(file_content.strip()))

            # Route to the correct parsing strategy based on headers
            if "Title" in reader.fieldnames:
                findings = self._parse_issues(reader)
                report_type = "Cloud Security Issues"
            else:
                findings = self._parse_vulnerabilities(reader)
                report_type = "Vulnerabilities"

            # --- Generate Markdown ---
            md_output = f"### Wiz Scan Results ({report_type})\n\n"

            if not findings:
                md_output += "*No active findings detected in the export.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Wiz Scan"
                }

            # Filter out mitigated/resolved issues for the main table to reduce noise
            active_findings = [f for f in findings if not f['is_mitigated']]

            if not active_findings and findings:
                md_output += "*All findings in this report are marked as resolved or rejected.*\n\n"

            for f in findings:
                title_prefix = "✅ [RESOLVED] " if f['is_mitigated'] else ""
                md_output += f"#### {title_prefix}{f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Resource/Asset | Project | Created/Detected |\n"
                md_output += "|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['resource']}` | {f['project']} | {f['date']} |\n\n"

                if f['tags']:
                    md_output += f"**Tags:** {', '.join(f['tags'])}\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['mitigation']:
                    md_output += f"**Remediation:**\n{f['mitigation']}\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": f"Wiz Scan: {report_type}"
            }

        except Exception as e:
            return {
                "markdown": f"### Wiz Scan Results\n\n**Error:** Failed to parse CSV: {str(e)}",
                "command": "",
                "title": "Wiz: Parse Error"
            }

    # ==========================================
    # Parsing Strategies
    # ==========================================
    def _parse_issues(self, reader: csv.DictReader) -> list:
        """Parses CSPM / Cloud Configuration Issues."""
        findings = []

        description_fields = [
            "Description", "Resource Type", "Resource Region", "Resource Status",
            "Resource Platform", "Resource OS", "Subscription Name", "Wiz URL"
        ]

        for row in reader:
            title = row.get("Title", "Unknown Issue")
            issue_id = row.get("Issue ID", "Unknown ID")
            severity = self._normalize_severity(row.get("Severity"))

            # Status Check
            status = row.get("Status", "").upper()
            is_mitigated = status in ["RESOLVED", "REJECTED", "CLOSED"]

            # Mitigation
            mitigation = row.get("Remediation Recommendation", "")
            if row.get("Resolution"):
                mitigation += f"\n\n**Resolution Note:** {row.get('Resolution')}"

            # Description Builder
            desc = ""
            for field in description_fields:
                val = row.get(field)
                if val:
                    desc += f"**{field}:** {val}\n"

            findings.append({
                "title": title,
                "vuln_id": issue_id,
                "severity": severity,
                "resource": row.get("Resource Name", "Unknown Resource"),
                "project": row.get("Project Names", "N/A"),
                "date": self._clean_date(row.get("Created At")),
                "description": desc.strip(),
                "mitigation": mitigation.strip(),
                "tags": [],
                "is_mitigated": is_mitigated
            })

        return findings

    def _parse_vulnerabilities(self, reader: csv.DictReader) -> list:
        """Parses SCA / Workload Vulnerabilities."""
        findings = []

        description_fields = {
            "WizURL": "Wiz URL",
            "HasExploit": "Has Exploit",
            "LocationPath": "Location Path",
            "AssetRegion": "Asset Region",
            "CloudPlatform": "Cloud Platform",
            "OperatingSystem": "Operating System"
        }

        for row in reader:
            vuln_id = row.get("Name", "Unknown CVE")
            pkg_name = row.get("DetailedName", "Unknown Package")
            pkg_version = row.get("Version", "Unknown Version")

            severity = self._normalize_severity(row.get("VendorSeverity") or row.get("Severity"))

            # Status Check
            status = row.get("FindingStatus", "").upper()
            is_mitigated = status in ["RESOLVED", "REJECTED", "CLOSED", "IGNORED"]

            # Description Builder
            desc = ""
            for csv_col, pretty_name in description_fields.items():
                val = row.get(csv_col)
                if val:
                    desc += f"**{pretty_name}:** `{val}`\n"

            # Mitigation Builder
            mitigation = ""
            if row.get("FixedVersion"):
                mitigation += f"**Fixed Version:** `{row.get('FixedVersion')}`\n"
            if row.get("Remediation"):
                mitigation += f"**Remediation:** {row.get('Remediation')}\n"

            tags = self._parse_tags(row.get("Tags", "[]"))

            findings.append({
                "title": f"{pkg_name} (v{pkg_version}): {vuln_id}",
                "vuln_id": vuln_id,
                "severity": severity,
                "resource": row.get("AssetName", "Unknown Asset"),
                "project": row.get("Projects", "N/A"),
                "date": self._clean_date(row.get("FirstDetected")),
                "description": desc.strip(),
                "mitigation": mitigation.strip(),
                "tags": tags,
                "is_mitigated": is_mitigated
            })

        return findings

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Info"
        s = severity.strip().capitalize()
        if s == "Informational":
            return "Info"
        if s in ["Info", "Low", "Medium", "High", "Critical"]:
            return s
        return "Info"

    def _parse_tags(self, tags_str: str) -> list:
        try:
            if not tags_str or tags_str == "[]":
                return []
            tag_dict = json.loads(tags_str)
            return [f"{k}: {v}" for k, v in tag_dict.items()]
        except Exception:
            return []

    def _clean_date(self, date_str: str) -> str:
        """Extracts the YYYY-MM-DD portion from Wiz's verbose date strings."""
        if not date_str:
            return "Unknown Date"
        return date_str.split(" ")[0]