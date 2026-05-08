import json


class SSHAuditParser:
    """
    Standalone ssh-audit JSON Parser.
    Converts ssh-audit scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is an ssh-audit JSON report.
        """
        try:
            data = json.loads(file_content)
            # Check for characteristic ssh-audit root keys
            if all(k in data for k in ("target", "banner", "cves", "kex", "key", "mac")):
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses ssh-audit JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)

            target = data.get("target", "Unknown:0")
            banner = data.get("banner", {}).get("raw", "Unknown Banner")

            cve_findings = []
            algo_findings = []

            # 1. Process CVEs
            for cve in data.get("cves", []):
                cve_name = cve.get("name", "Unknown CVE")
                description = cve.get("description", "No description provided.")
                cvss_score = cve.get("cvssv2", 0.0)
                severity = self._convert_cvss_score(cvss_score)

                cve_findings.append({
                    "title": cve_name,
                    "severity": severity,
                    "cvss_score": cvss_score,
                    "description": description
                })

            # 2. Process Cryptographic Algorithms (KEX, KEY, MAC)
            algo_findings.extend(self._process_algorithms(data.get("kex", []), "Key Exchange (KEX)"))
            algo_findings.extend(self._process_algorithms(data.get("key", []), "Host Key"))
            algo_findings.extend(self._process_algorithms(data.get("mac", []), "Message Authentication Code (MAC)"))

            # --- Generate Markdown ---
            md_output = "### ssh-audit Configuration Scan\n\n"
            md_output += f"**Target:** `{target}` | **Banner:** `{banner}`\n\n---\n\n"

            if not cve_findings and not algo_findings:
                md_output += "*No vulnerabilities or weak algorithms detected.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": f"ssh-audit: {target}"
                }

            # Render CVEs
            if cve_findings:
                md_output += "#### Software Vulnerabilities (CVEs)\n\n"
                for f in cve_findings:
                    md_output += f"##### {f['title']}\n"
                    md_output += f"**Severity:** {f['severity']} (CVSSv2: {f['cvss_score']})\n\n"
                    md_output += f"{f['description']}\n\n"
                md_output += "---\n\n"

            # Render Weak Algorithms
            if algo_findings:
                md_output += "#### Weak Cryptographic Algorithms\n\n"

                md_output += "| Severity | Category | Algorithm | Key Size |\n"
                md_output += "|---|---|---|---|\n"

                for f in algo_findings:
                    md_output += f"| **{f['severity']}** | {f['algo_type']} | `{f['algorithm']}` | {f['keysize']} |\n"

                md_output += "\n<details>\n<summary><b>View Detailed Algorithm Issues</b></summary>\n\n"

                for f in algo_findings:
                    md_output += f"##### `{f['algorithm']}` ({f['algo_type']})\n"
                    md_output += f"{f['issues']}\n\n"

                md_output += "</details>\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": f"ssh-audit: {target}"
            }

        except Exception as e:
            return {
                "markdown": f"### ssh-audit Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "ssh-audit: Parse Error"
            }

    # ==========================================
    # HELPERS
    # ==========================================
    def _convert_cvss_score(self, raw_value) -> str:
        """Converts CVSSv2 scores to standard categorical severities."""
        try:
            val = float(raw_value)
            if val == 0: return "Info"
            if val < 4.0: return "Low"
            if val < 7.0: return "Medium"
            if val < 9.0: return "High"
            return "Critical"
        except (ValueError, TypeError):
            return "Info"

    def _process_algorithms(self, algo_list: list, algo_type: str) -> list:
        """Extracts and formats weak algorithms based on ssh-audit failure/warning flags."""
        findings = []
        for item in algo_list:
            notes = item.get("notes", {})
            has_fail = "fail" in notes
            has_warn = "warn" in notes

            # ssh-audit flags strong algorithms without fail/warn notes; we skip those
            if not (has_fail or has_warn):
                continue

            severity = "High" if has_fail else "Medium"
            name = item.get("algorithm", "Unknown")

            issues = []
            if has_fail: issues.append(f"**Failure:** {notes['fail']}")
            if has_warn: issues.append(f"**Warning:** {notes['warn']}")
            if "info" in notes: issues.append(f"**Info:** {notes['info']}")

            keysize = item.get("keysize", "N/A")

            findings.append({
                "severity": severity,
                "algo_type": algo_type,
                "algorithm": name,
                "keysize": keysize,
                "issues": "\n".join(issues)
            })

        return findings