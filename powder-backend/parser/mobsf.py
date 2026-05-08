import json
import re
import hashlib


class MobSFParser:
    """
    Standalone MobSF JSON Parser.
    Converts MobSF API reports and mobsfscan CLI outputs directly into formatted Markdown.
    Supports Code Analysis, Binary Analysis, Manifest Analysis, Permissions, and Certificates.
    """

    MOBSFSCAN_SEV_MAP = {
        "ERROR": "High",
        "WARNING": "Medium",
        "INFO": "Low",
    }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a MobSF API report or mobsfscan report.
        """
        try:
            data = json.loads(file_content.strip())
            if isinstance(data, dict):
                # mobsfscan signature
                if "results" in data and isinstance(data["results"], dict):
                    first_key = next(iter(data["results"]), None)
                    if first_key and "metadata" in data["results"][first_key]:
                        return True

                # MobSF API report signature
                api_keys = ["permissions", "insecure_connections", "certificate_analysis", "code_analysis",
                            "manifest_analysis"]
                if any(k in data for k in api_keys) or "packagename" in data:
                    return True

            if isinstance(data, list):
                # Rare list format for some Android API reports
                if len(data) > 0 and "apk_exploit_dict" in data[0]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses MobSF JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())

            # Determine which parsing strategy to use
            if isinstance(data, dict) and data.get("results") is not None:
                if len(data.get("results", {})) == 0:
                    findings = []
                    app_info = ""
                else:
                    findings = self._parse_mobsfscan(data)
                    app_info = ""
            else:
                findings, app_info = self._parse_mobsf_api(data)

            # Deduplicate findings by title and category
            grouped_findings = {}
            for f in findings:
                dupe_key = hashlib.sha256(f"{f['category']}_{f['title']}".encode("utf-8")).hexdigest()
                if dupe_key not in grouped_findings:
                    grouped_findings[dupe_key] = f
                else:
                    # Merge occurrences
                    grouped_findings[dupe_key]["occurrences"].extend(f["occurrences"])

            # --- Generate Markdown ---
            md_output = "### MobSF Mobile Security Assessment\n\n"

            if app_info:
                md_output += f"{app_info}\n---\n\n"

            if not grouped_findings:
                md_output += "*No security vulnerabilities or misconfigurations detected in the mobile application.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "MobSF Scan"
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
                md_output += "| Severity | Category |\n"
                md_output += "|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['category']} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f.get('references'):
                    md_output += f"**References:**\n{f['references']}\n\n"

                # Render occurrences (files, lines, snippets)
                if f['occurrences']:
                    md_output += f"**Affected Locations ({len(f['occurrences'])} occurrences):**\n\n"

                    # Deduplicate occurrences for clean display
                    unique_occs = []
                    seen_occs = set()
                    for occ in f['occurrences']:
                        occ_hash = str(occ)
                        if occ_hash not in seen_occs and occ.get('file_path'):
                            seen_occs.add(occ_hash)
                            unique_occs.append(occ)

                    for idx, occ in enumerate(unique_occs[:20]):
                        md_output += f"- `{occ['file_path']}`"
                        if occ.get('line'):
                            md_output += f" (Line: {occ['line']})"
                        md_output += "\n"
                        if occ.get('snippet'):
                            snippet_clean = occ['snippet'].replace('\n', ' ')
                            md_output += f"  - *Snippet:* `{snippet_clean}`\n"

                    if len(unique_occs) > 20:
                        md_output += f"- *... and {len(unique_occs) - 20} more locations.*\n"
                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "MobSF Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### MobSF Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "MobSF: Parse Error"
            }

    # ==========================================
    # mobsfscan Parsing Logic (Static CLI)
    # ==========================================
    def _parse_mobsfscan(self, data: dict) -> list:
        findings = []
        for key, item in data.get("results", {}).items():
            metadata = item.get("metadata", {})
            cwe_raw = metadata.get("cwe", "CWE-0")

            masvs = metadata.get("masvs", "N/A")
            owasp_mobile = metadata.get("owasp-mobile", "N/A")

            desc_text = metadata.get("description", "No description provided.")
            description = f"{desc_text}\n\n**OWASP MASVS:** `{masvs}`\n**OWASP Mobile:** `{owasp_mobile}`"

            severity = self.MOBSFSCAN_SEV_MAP.get(metadata.get("severity", "INFO"), "Info")

            occurrences = []
            for f in item.get("files", []):
                occurrences.append({
                    "file_path": f.get("file_path", ""),
                    "line": f.get("match_lines", [0])[0] if f.get("match_lines") else 0,
                    "snippet": f.get("match_string", "")
                })

            findings.append({
                "title": key,
                "category": "Static Analysis",
                "severity": severity,
                "description": description,
                "references": metadata.get("reference", ""),
                "occurrences": occurrences
            })
        return findings

    # ==========================================
    # MobSF API Parsing Logic (Full Platform)
    # ==========================================
    def _parse_mobsf_api(self, data) -> tuple:
        findings = []
        app_info = ""

        # Flat list handler
        if isinstance(data, list):
            for finding in data:
                findings.append({
                    "title": finding.get("name", "Unknown Issue"),
                    "category": finding.get("category", "General"),
                    "severity": self._normalize_severity(finding.get("severity", "info")),
                    "description": finding.get("description", ""),
                    "occurrences": [{"file_path": finding.get("file_object", "")}]
                })
            return findings, app_info

        # Extract App Info Header
        if "name" in data or "packagename" in data:
            app_info += "#### App Information\n"
            if "name" in data: app_info += f"- **Name:** {data['name']}\n"
            if "packagename" in data: app_info += f"- **Package:** `{data['packagename']}`\n"
            if "pltfm" in data: app_info += f"- **Platform:** {data['pltfm']}\n"
            if "md5" in data: app_info += f"- **MD5:** `{data['md5']}`\n"
            if "sha256" in data: app_info += f"- **SHA-256:** `{data['sha256']}`\n"
            if "size" in data: app_info += f"- **Size:** {data['size']}\n"

        # 1. Permissions
        if "permissions" in data:
            perms = data["permissions"]
            if isinstance(perms, list):
                for p in perms:
                    self._add_finding(findings, "Mobile Permissions", p.get("name", "Unknown"),
                                      self._perm_severity(p.get("status")),
                                      f"**Status:** {p.get('status')}\n**Reason:** {p.get('reason')}\n{p.get('description', '')}")
            else:
                for p_name, details in perms.items():
                    self._add_finding(findings, "Mobile Permissions", p_name,
                                      self._perm_severity(details.get("status")),
                                      f"**Status:** {details.get('status')}\n{details.get('description', '')}")

        # 2. Insecure Connections
        if "insecure_connections" in data:
            for details in data["insecure_connections"]:
                urls = "\n".join([f"- {u}" for u in details.split(",")])
                self._add_finding(findings, "Network Security", "Insecure Connections Detected", "Low", urls)

        # 3. Certificate Analysis
        cert_data = data.get("certificate_analysis", {})
        if isinstance(cert_data, dict) and "certificate_findings" in cert_data:
            cert_info = cert_data.get("certificate_info", "")
            for cf in cert_data["certificate_findings"]:
                if len(cf) >= 3:
                    self._add_finding(findings, "Certificate Analysis", cf[2], cf[0].title(),
                                      f"{cf[1]}\n\n**Info:** {cert_info}")
                elif len(cf) == 2:
                    self._add_finding(findings, "Certificate Analysis", cf[1], cf[0].title(),
                                      f"{cf[1]}\n\n**Info:** {cert_info}")

        # 4. Manifest Analysis
        mani_data = data.get("manifest_analysis", {})
        if isinstance(mani_data, dict):
            findings_list = mani_data.get("manifest_findings", mani_data) if isinstance(mani_data, dict) else mani_data
            if isinstance(findings_list, list):
                for mf in findings_list:
                    title = mf.get("title", "Manifest Issue")
                    sev = mf.get("severity", mf.get("stat", "info")).title()
                    desc = mf.get("description", mf.get("desc", "")) + f"\n\n**Rule:** {mf.get('name', '')}"
                    self._add_finding(findings, "Manifest Analysis", title, sev, desc)

        # 5. Code Analysis
        code_data = data.get("code_analysis", {})
        if isinstance(code_data, dict):
            target = code_data.get("findings", code_data)
            for title, details in target.items():
                if "metadata" in details:
                    self._add_finding(findings, "Code Analysis", title,
                                      details["metadata"].get("severity", "info").title(),
                                      details["metadata"].get("description", ""))

        # 6. Binary Analysis
        bin_data = data.get("binary_analysis", {})
        if isinstance(bin_data, list):
            for details in bin_data:
                for bin_type, meta in details.items():
                    if bin_type != "name" and isinstance(meta, dict):
                        title = meta.get("description", "Binary Issue").split(".")[0]
                        self._add_finding(findings, "Binary Analysis", title, meta.get("severity", "info").title(),
                                          meta.get("description", ""), file_path=details.get("name"))
        elif isinstance(bin_data, dict):
            target = bin_data.get("findings", bin_data)
            for title, meta in target.items():
                if isinstance(meta, dict) and "detailed_desc" in meta:
                    self._add_finding(findings, "Binary Analysis", meta["detailed_desc"].split(".")[0][:100],
                                      meta.get("severity", "info").title(), meta["detailed_desc"])

        return findings, app_info

    # ==========================================
    # Helpers
    # ==========================================
    def _add_finding(self, findings_list, category, title, severity, description, file_path=None):
        findings_list.append({
            "category": category,
            "title": title[:150] if title else "Unknown Issue",
            "severity": self._normalize_severity(severity),
            "description": description.strip() if description else "No description provided.",
            "references": "",
            "occurrences": [{"file_path": file_path}] if file_path else []
        })

    def _normalize_severity(self, rating: str) -> str:
        if not rating: return "Info"
        r = rating.lower().strip()
        if r in ["critical", "danger"]: return "Critical"
        if r in ["high", "error"]: return "High"
        if r in ["medium", "warning", "vulnerability"]: return "Medium"
        if r == "low": return "Low"
        return "Info"

    def _perm_severity(self, status: str) -> str:
        if not status: return "Info"
        if status.lower() == "dangerous":
            return "High"
        return "Info"