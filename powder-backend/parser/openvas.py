import csv
import io
import re
import hashlib
import xml.etree.ElementTree as ET


class OpenVASParser:
    """
    Standalone Greenbone / OpenVAS Parser.
    Converts OpenVAS scanner output (both CSV and XML formats)
    directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an OpenVAS CSV or XML report.
        """
        try:
            content = file_content.strip()
            # XML Detection
            if content.startswith("<") and "<report" in content and "<results" in content:
                return True

            # CSV Detection
            if "nvt name" in content.lower() and "severity" in content.lower() and "cvss" in content.lower():
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses OpenVAS CSV/XML and returns a formatted Markdown dictionary."""
        try:
            content = file_content.strip()
            findings = []

            # Route to the correct format parser
            if content.startswith("<"):
                findings = self._parse_xml(content)
            else:
                findings = self._parse_csv(content)

            # Group findings by Vulnerability (NVT OID / Title) to prevent endpoint bloat
            grouped_findings = {}
            for f in findings:
                group_key = hashlib.sha256(f"{f['vuln_id']}_{f['title']}".encode("utf-8")).hexdigest()

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": f['title'],
                        "vuln_id": f['vuln_id'],
                        "severity": f['severity'],
                        "cvss": f['cvss'],
                        "cwe": f['cwe'],
                        "cves": f['cves'],
                        "description": f['description'],
                        "solution": f['solution'],
                        "endpoints": set()
                    }

                # Add endpoint to the set
                if f['host']:
                    ep_str = f"{f['host']}"
                    if f['port'] and f['port'] != "Unknown":
                        ep_str += f":{f['port']}"
                    if f['protocol'] and f['protocol'] != "Unknown":
                        ep_str += f" ({f['protocol']})"
                    grouped_findings[group_key]["endpoints"].add(ep_str)

            # --- Generate Markdown ---
            md_output = "### Greenbone / OpenVAS Vulnerability Scan\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found in the OpenVAS report.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "OpenVAS Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | CVSS Score | CVEs | CWE | NVT OID |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['cvss']} | {f['cves']} | {f['cwe']} | `{f['vuln_id']}` |\n\n"

                if f['description']:
                    md_output += f"**Description:**\n{f['description']}\n\n"

                if f['solution']:
                    md_output += f"**Solution/Mitigation:**\n{f['solution']}\n\n"

                # Render Endpoints
                eps = sorted(list(f['endpoints']))
                md_output += f"**Affected Endpoints ({len(eps)} occurrences):**\n"
                for ep in eps[:50]:  # Limit output to 50 endpoints to prevent massive walls of text
                    md_output += f"- `{ep}`\n"

                if len(eps) > 50:
                    md_output += f"- *... and {len(eps) - 50} more endpoints.*\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "OpenVAS Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### OpenVAS Results\n\n**Error:** Failed to parse report: {str(e)}",
                "command": "",
                "title": "OpenVAS: Parse Error"
            }

    # ==========================================
    # XML PARSING LOGIC
    # ==========================================
    def _parse_xml(self, content: str) -> list:
        findings = []
        root = ET.fromstring(content)

        for result in root.findall(".//result"):
            title = result.findtext("name", "Unknown Vulnerability")
            host = result.findtext("host", "Unknown Host")
            port_raw = result.findtext("port", "Unknown")

            port, protocol = "Unknown", "Unknown"
            if "/" in port_raw:
                port, protocol = port_raw.split("/", 1)
            else:
                port = port_raw

            # OpenVAS XML typically uses 'threat' for categorical severity and 'severity' for CVSS score
            threat = result.findtext("threat", "Info")
            severity = self._normalize_severity(threat)
            cvss = result.findtext("severity", "N/A")

            description = result.findtext("description", "").strip()

            nvt = result.find("nvt")
            nvt_oid = nvt.attrib.get("oid", "Unknown OID") if nvt is not None else "Unknown OID"

            cves = []
            cwe = "N/A"
            solution = ""

            if nvt is not None:
                # In modern OpenVAS XML, data is packed into a 'tags' pipe-separated string
                tags_str = nvt.findtext("tags", "")
                tags = self._parse_pipe_tags(tags_str)

                if not description and "summary" in tags:
                    description = tags["summary"]
                if "solution" in tags:
                    solution = tags["solution"]
                if "impact" in tags:
                    description += f"\n\n**Impact:**\n{tags['impact']}"

                # Extract CVEs from refs if present
                for ref in nvt.findall(".//ref"):
                    if ref.attrib.get("type") == "cve":
                        cves.append(ref.attrib.get("id"))

                # Extract solution if present as an explicit tag
                sol_tag = nvt.findtext("solution")
                if sol_tag:
                    solution = sol_tag

            cve_str = ", ".join(cves) if cves else "N/A"

            findings.append({
                "title": title,
                "vuln_id": nvt_oid,
                "severity": severity,
                "cvss": cvss,
                "cves": cve_str,
                "cwe": cwe,
                "description": description,
                "solution": solution,
                "host": host,
                "port": port,
                "protocol": protocol
            })

        return findings

    # ==========================================
    # CSV PARSING LOGIC
    # ==========================================
    def _parse_csv(self, content: str) -> list:
        findings = []
        reader = csv.DictReader(io.StringIO(content))

        # Normalize header keys to lower case and strip whitespace
        reader.fieldnames = [str(header).strip().lower() for header in reader.fieldnames or []]

        for row in reader:
            title = row.get("nvt name", "Unknown Vulnerability")
            nvt_oid = row.get("nvt oid", "Unknown OID")

            host = row.get("ip") or row.get("hostname", "Unknown Host")
            port = row.get("port", "Unknown")
            protocol = row.get("port protocol", "Unknown")

            severity_raw = row.get("severity", "Info")
            severity = self._normalize_severity(severity_raw)
            cvss = row.get("cvss", "N/A")

            cwe = row.get("cweid", "N/A")
            cwe = f"CWE-{cwe}" if cwe != "N/A" and cwe else "N/A"
            cves = row.get("cves", "N/A")

            description = row.get("summary", "")
            if row.get("vulnerability insight"):
                description += f"\n\n**Insight:**\n{row.get('vulnerability insight')}"

            solution = row.get("solution", "")

            findings.append({
                "title": title,
                "vuln_id": nvt_oid,
                "severity": severity,
                "cvss": cvss,
                "cves": cves,
                "cwe": cwe,
                "description": description.strip(),
                "solution": solution.strip(),
                "host": host,
                "port": port,
                "protocol": protocol
            })

        return findings

    # ==========================================
    # HELPERS
    # ==========================================
    def _parse_pipe_tags(self, text: str) -> dict:
        """Parses OpenVAS pipe-separated tags (e.g., summary=text|impact=High)."""
        tags = {}
        if not text:
            return tags

        for part in text.strip().split("|"):
            if "=" in part:
                key, val = part.split("=", 1)
                tags[key.strip().lower()] = val.strip()
        return tags

    def _normalize_severity(self, severity: str) -> str:
        """Maps OpenVAS 'threat' or raw severity strings to standard categories."""
        if not severity:
            return "Info"
        s = severity.strip().capitalize()
        # OpenVAS sometimes outputs "Log" instead of Info
        if s == "Log":
            return "Info"
        if s in {"Info", "Low", "Medium", "High", "Critical"}:
            return s
        return "Info"