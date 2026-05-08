import re
import xml.etree.ElementTree as ET


class PingCastleParser:
    """
    Standalone PingCastle XML Parser.
    Converts PingCastle Active Directory scanner output directly into formatted Markdown.
    Includes contextual severity calculation and Domain Controller enrichment.
    """

    CVE_REGEX = re.compile(r"(CVE-\d{4}-\d{4,7})", re.IGNORECASE)
    _SEVERITY_ORDER = ["Info", "Low", "Medium", "High", "Critical"]

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a PingCastle XML report.
        """
        try:
            return "<Healthcheck" in file_content and "<PingCastle" in file_content and "<RiskRules>" in file_content
        except Exception:
            return False

    def parse(self, file_content: str) -> dict:
        """Parses PingCastle XML and returns a formatted Markdown dictionary."""
        try:
            root = ET.fromstring(file_content)

            report_date = root.findtext("GenerationDate", "Unknown Date")[:10]
            domain_fqdn = root.findtext("DomainFQDN", "Unknown Domain")

            dc_infos, _ = self._collect_domain_controllers(root)
            grouped_findings = {}

            for rr in root.findall(".//RiskRules/HealthcheckRiskRule"):
                points = self._safe_int(rr.findtext("Points"))
                category = rr.findtext("Category") or "Unknown Category"
                model = rr.findtext("Model") or "Unknown Model"
                risk_id = rr.findtext("RiskId") or "Unknown RiskID"
                rationale = rr.findtext("Rationale") or "No rationale provided."

                # Calculate Severity
                base_severity = self._map_points_to_severity(points)
                severity = self._apply_contextual_bump(
                    severity=base_severity,
                    category=category,
                    model=model,
                    risk_id=risk_id,
                    rationale=rationale,
                )

                cves = list(set(self.CVE_REGEX.findall(rationale)))

                if risk_id not in grouped_findings:
                    grouped_findings[risk_id] = {
                        "title": f"[{risk_id}] {category} / {model}",
                        "risk_id": risk_id,
                        "category": category,
                        "model": model,
                        "points": points,
                        "severity": severity,
                        "cves": cves,
                        "rationale": rationale,
                        "enrichment": ""
                    }

                    # Apply specific enrichments based on Risk ID
                    if risk_id == "A-DC-Coerce":
                        grouped_findings[risk_id]["enrichment"] += self._enrich_coerce_with_rpc_interfaces(dc_infos)
                    if risk_id == "A-DC-Spooler":
                        grouped_findings[risk_id]["enrichment"] += self._enrich_spooler_status(dc_infos)
                    if risk_id == "A-MinPwdLen":
                        grouped_findings[risk_id]["enrichment"] += self._enrich_password_policy(root)
                else:
                    # If multiple instances of the same Risk ID appear, append the rationale
                    grouped_findings[risk_id]["rationale"] += f"\n\n---\n\n**Additional Rationale:** {rationale}"

            # --- Generate Markdown ---
            md_output = "### PingCastle Active Directory Security Assessment\n\n"
            md_output += f"**Target Domain:** `{domain_fqdn}` | **Scan Date:** `{report_date}`\n\n"

            if dc_infos:
                md_output += "<details>\n<summary><b>View Discovered Domain Controllers</b></summary>\n\n"
                for dc in dc_infos:
                    ips = ", ".join(dc.get("ips", []))
                    md_output += f"- **{dc['name']}** (OS: {dc.get('os', '?')}, IPs: {ips})\n"
                md_output += "</details>\n\n---\n\n"

            if not grouped_findings:
                md_output += "*No PingCastle healthcheck risks identified.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": f"PingCastle: {domain_fqdn}"
                }

            # Sort findings by severity (Critical down to Info)
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: self._SEVERITY_ORDER.index(x['severity']),
                reverse=True
            )

            for f in sorted_findings:
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | Points | Risk ID | Category | Model |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| **{f['severity']}** | {f['points']} | `{f['risk_id']}` | {f['category']} | {f['model']} |\n\n"

                if f['cves']:
                    md_output += f"**Identified CVEs:** {', '.join(f['cves'])}\n\n"

                md_output += f"**Rationale:**\n{f['rationale']}\n\n"

                if f['enrichment']:
                    md_output += f"{f['enrichment']}\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": f"PingCastle: {domain_fqdn}"
            }

        except Exception as e:
            return {
                "markdown": f"### PingCastle Scan Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "PingCastle: Parse Error"
            }

    # ==========================================
    # DATA EXTRACTION & ENRICHMENT
    # ==========================================
    def _collect_domain_controllers(self, root):
        dc_infos = []
        locations = []
        for dc in root.findall(".//DomainControllers/HealthcheckDomainController"):
            name = dc.findtext("DCName") or "Unknown DC"
            os = dc.findtext("OperatingSystem") or "Unknown OS"
            remote_spooler = dc.findtext("RemoteSpoolerDetected") or "false"
            ips = [ip.text for ip in dc.findall("IP/string") if ip.text]

            dc_info = {
                "name": name,
                "os": os,
                "remote_spooler": remote_spooler.lower() == "true",
                "ips": ips,
                "rpc_interfaces": []
            }

            for rpc in dc.findall("RPCInterfacesOpen/HealthcheckDCRPCInterface"):
                dc_info["rpc_interfaces"].append({
                    "ip": rpc.attrib.get("IP", ""),
                    "interface": rpc.attrib.get("Interface", ""),
                    "opnum": rpc.attrib.get("OpNum", ""),
                    "function": rpc.attrib.get("Function", ""),
                })
            dc_infos.append(dc_info)

            locations.append(name)
            locations.extend(ips)

        return dc_infos, locations

    def _enrich_coerce_with_rpc_interfaces(self, dc_infos) -> str:
        text = ""
        added_any = False
        for dc in dc_infos:
            if dc.get("rpc_interfaces"):
                if not added_any:
                    text += "**RPC Interfaces (potential coercion surface):**\n"
                    added_any = True
                text += f"\n*{dc['name']}*:\n"
                for ri in dc["rpc_interfaces"]:
                    text += f"- IP: `{ri['ip']}` | Interface: `{ri['interface']}` | OpNum: `{ri['opnum']}` | Function: `{ri['function']}`\n"
        return text

    def _enrich_spooler_status(self, dc_infos) -> str:
        any_remote_spooler = any(dc.get("remote_spooler") for dc in dc_infos)
        return f"**Remote spooler exposure detected:** `{any_remote_spooler}`\n"

    def _enrich_password_policy(self, root) -> str:
        min_len = None
        complexity = None
        for prop in root.findall(".//GPPPasswordPolicy/GPPSecurityPolicy/Properties/GPPSecurityPolicyProperty"):
            key = (prop.findtext("Property") or "").strip()
            val = (prop.findtext("Value") or "").strip()
            if key == "MinimumPasswordLength":
                min_len = val
            elif key == "PasswordComplexity":
                complexity = val

        text = ""
        if min_len is not None or complexity is not None:
            text += "**Observed Password Policy from GPO:**\n"
            if min_len is not None:
                text += f"- MinimumPasswordLength: `{min_len}`\n"
            if complexity is not None:
                friendly = {"0": "Disabled", "1": "Enabled"}.get(complexity, complexity)
                text += f"- PasswordComplexity: `{friendly}`\n"
        return text

    # ==========================================
    # SEVERITY CLASSIFICATION LOGIC
    # ==========================================
    def _safe_int(self, text):
        try:
            return int(text)
        except (TypeError, ValueError):
            return 0

    def _map_points_to_severity(self, points):
        if points <= 0: return "Info"
        if points <= 5: return "Low"
        if points <= 10: return "Medium"
        if points <= 15: return "High"
        return "Critical"

    def _is_dc_specific_risk(self, risk_id: str, model: str = "", rationale: str = "") -> bool:
        rid = (risk_id or "").strip()
        mod = (model or "").strip()
        rat = (rationale or "").strip().lower()

        if rid.startswith(("A-DC-", "S-DC-")): return True
        if rid in {"A-DC-Spooler", "A-DC-Coerce", "A-AuditDC", "S-DC-SubnetMissing"}: return True
        if mod == "Audit" and rid.endswith("DC"): return True

        dc_markers = (" from ", " dc", " dcs", " domain controller", " domain controllers")
        return bool(any(marker in rat for marker in dc_markers))

    def _apply_contextual_bump(self, severity: str, category: str = "", model: str = "",
                               risk_id: str = "", rationale: str = "") -> str:
        if not severity or severity not in self._SEVERITY_ORDER:
            severity = "Info"

        idx = self._SEVERITY_ORDER.index(severity)
        rat = (rationale or "").lower()
        cat = (category or "").strip().lower()

        # CVEs indicate known exploitability -> minimum Low, bumps current tier
        if self.CVE_REGEX.search(rationale or ""):
            idx = min(idx + 1, len(self._SEVERITY_ORDER) - 1)
            mitigation_markers = ("mitigation", "not set", "disabled", "missing", "not enabled", "enable")
            if any(m in rat for m in mitigation_markers):
                idx = max(idx, self._SEVERITY_ORDER.index("Medium"))

        # High value targets (DCs) warrant heightened priority
        if self._is_dc_specific_risk(risk_id, model, rationale):
            idx = min(idx + 1, len(self._SEVERITY_ORDER) - 1)

        # Exposure risks often indicate direct attack paths
        if cat == "exposure":
            idx = min(idx + 1, len(self._SEVERITY_ORDER) - 1)

        return self._SEVERITY_ORDER[idx]