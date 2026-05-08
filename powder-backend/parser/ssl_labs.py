import json
import hashlib


class SslLabsParser:
    """
    Standalone SSL Labs JSON Parser.
    Converts Qualys SSL Labs CLI scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an SSL Labs JSON report.
        """
        try:
            data = json.loads(file_content)
            # ssllabs-scan outputs a list of host objects
            if isinstance(data, list) and len(data) > 0:
                if "host" in data[0] and "endpoints" in data[0]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses SSL Labs JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}

            for host in data:
                host_name = host.get("host", "Unknown Host")
                port = host.get("port", 443)

                for endpoint in host.get("endpoints", []):
                    grade = endpoint.get("grade", "Unrated")
                    ip_address = endpoint.get("ipAddress", "Unknown IP")
                    details = endpoint.get("details", {})

                    severity = self._get_criticality_rating(grade)

                    # Grouping Key: Group by Host and Grade
                    group_key = hashlib.sha256(f"{host_name}_{grade}".encode("utf-8")).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": f"TLS Grade '{grade}' for {host_name}",
                            "host_name": host_name,
                            "port": port,
                            "grade": grade,
                            "severity": severity,
                            "endpoints": [],
                            "protocols": [],
                            "vuln_flags": {},
                            "certs": [],
                            "suites": ""
                        }

                    group = grouped_findings[group_key]
                    group["endpoints"].append(ip_address)

                    # 1. Protocols
                    if not group["protocols"]:
                        protocols = details.get("protocols", [])
                        for p in protocols:
                            group["protocols"].append(f"{p.get('name', '')} {p.get('version', '')}".strip())

                    # 2. Certificates
                    if not group["certs"]:
                        if "cert" in details:
                            group["certs"].append(self._parse_cert(details["cert"]))
                        else:
                            for cert in host.get("certs", []):
                                group["certs"].append(self._parse_cert(cert))

                    # 3. Cipher Suites
                    if not group["suites"]:
                        suite_info = ""
                        suites = details.get("suites", {})
                        if isinstance(suites, dict) and "list" in suites:
                            for suite in suites["list"]:
                                suite_info += self._parse_suite(suite)
                        elif isinstance(suites, list):
                            for item in suites:
                                for suite in item.get("list", []):
                                    suite_info += self._parse_suite(suite)
                        group["suites"] = suite_info or "Not provided."

                    # 4. Vulnerabilities and Flags
                    if not group["vuln_flags"]:
                        flags = {
                            "Heartbleed": details.get("heartbleed"),
                            "POODLE": details.get("poodle"),
                            "POODLE TLS": details.get("poodleTls"),
                            "FREAK": details.get("freak"),
                            "OpenSSL CCS": details.get("openSslCcs"),
                            "OpenSSL LuckyMinus20": details.get("openSSLLuckyMinus20"),
                            "VulnBeast": details.get("vulnBeast"),
                            "Fallback SCSV": details.get("fallbackScsv"),
                            "Forward Secrecy": details.get("forwardSecrecy"),
                            "RC4 Supported": details.get("supportsRc4"),
                            "SNI Required": details.get("sniRequired"),
                            "Session Resumption": details.get("sessionResumption"),
                        }
                        # Filter out None values
                        group["vuln_flags"] = {k: v for k, v in flags.items() if v is not None}

            # --- Generate Markdown ---
            md_output = "### SSL Labs Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No endpoint data found in SSL Labs scan.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "SSL Labs Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Host | Port | Grade | Endpoints (IPs) |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['host_name']}` | `{f['port']}` | **{f['grade']}** | {', '.join(f['endpoints'])} |\n\n"

                # Protocols
                if f["protocols"]:
                    md_output += "**Supported Protocols:**\n"
                    for p in f["protocols"]:
                        md_output += f"- {p}\n"
                    md_output += "\n"

                # Vulnerability Flags
                if f["vuln_flags"]:
                    md_output += "**Security & Vulnerability Flags:**\n"
                    for flag_name, flag_val in f["vuln_flags"].items():
                        md_output += f"- {flag_name}: `{flag_val}`\n"
                    md_output += "\n"

                # Details Dropdown for Certs and Ciphers
                md_output += "<details>\n<summary><b>View Certificates & Cipher Suites</b></summary>\n\n"

                if f["certs"]:
                    md_output += "##### Certificates\n"
                    for cert in f["certs"]:
                        md_output += f"- **Subject:** `{cert['subject']}`\n"
                        md_output += f"- **Issuer:** `{cert['issuer']}`\n"
                        md_output += f"- **Signature Algorithm:** `{cert['sigAlg']}`\n\n"

                if f["suites"]:
                    md_output += "##### Cipher Suites\n```text\n"
                    md_output += f["suites"]
                    md_output += "```\n"

                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "SSL Labs Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### SSL Labs Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "SSL Labs: Parse Error"
            }

    # ==========================================
    # HELPERS
    # ==========================================
    def _get_criticality_rating(self, rating: str) -> str:
        """
        Grades: https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide
        A - Info, B - Medium, C - High, D/F/M/T - Critical, (unknown/other) - Critical
        """
        if not rating:
            return "Critical"
        rating = rating.upper()

        if "A" in rating: return "Info"
        if "B" in rating: return "Medium"
        if "C" in rating: return "High"
        if any(char in rating for char in ["D", "F", "M", "T"]): return "Critical"

        return "Critical"

    def _parse_cert(self, cert_node: dict) -> dict:
        return {
            "subject": cert_node.get("subject", "Unknown"),
            "issuer": cert_node.get("issuerSubject", "Unknown"),
            "sigAlg": cert_node.get("sigAlg", "Unknown")
        }

    def _parse_suite(self, suite: dict) -> str:
        s = f"- {suite.get('name', 'Unknown Cipher')}\n"
        s += f"  Cipher Strength: {suite.get('cipherStrength', 'Unknown')}\n"
        if "ecdhBits" in suite:
            s += f"  ecdhBits: {suite['ecdhBits']}\n"
        if "ecdhStrength" in suite:
            s += f"  ecdhStrength: {suite['ecdhStrength']}\n"
        return s + "\n"