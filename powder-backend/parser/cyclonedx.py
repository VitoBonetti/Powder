import json
import re
import hashlib
import xml.etree.ElementTree as ET


class CycloneDXParser:
    """
    Standalone CycloneDX Parser.
    Supports both JSON and XML SBOM formats (up to Schema v1.5).
    Converts vulnerabilities into a unified Markdown report.
    """

    def detect(self, file_content: str) -> bool:
        """Detects if the file is a CycloneDX JSON or XML report."""
        try:
            content = file_content.strip()
            # Try JSON detection
            if content.startswith("{"):
                data = json.loads(content)
                if data.get("bomFormat") == "CycloneDX" or "components" in data:
                    return True
            # Try XML detection
            elif content.startswith("<") and "cyclonedx" in content.lower():
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses CycloneDX and returns a formatted Markdown dictionary."""
        try:
            content = file_content.strip()
            findings = []

            # Route to the correct internal parser
            if content.startswith("{"):
                findings = self._parse_json(content)
            else:
                findings = self._parse_xml(content)

            # --- Generate Markdown ---
            md_output = "### CycloneDX SBOM Vulnerability Scan\n\n"

            # Filter out false positives and resolved issues for the main report count
            actionable_findings = [f for f in findings if not f['is_suppressed']]

            if not findings:
                md_output += "*No vulnerabilities found in the SBOM.*\n"
                return {"markdown": md_output, "command": "", "title": "CycloneDX Scan"}

            if not actionable_findings and findings:
                md_output += "*All vulnerabilities found in the SBOM have been marked as resolved, not affected, or false positives.*\n\n"

            # Group findings by Vuln ID to keep the report clean
            grouped = {}
            for f in findings:
                key = f"{f['vuln_id']}_{f['is_suppressed']}"
                if key not in grouped:
                    grouped[key] = f
                    grouped[key]['affected_components'] = [f['component']]
                else:
                    grouped[key]['affected_components'].append(f['component'])

            for f in grouped.values():
                title_prefix = "⚠️ [SUPPRESSED/RESOLVED] " if f['is_suppressed'] else ""
                md_output += f"#### {title_prefix}{f['vuln_id']}\n\n"

                # Metadata Table
                md_output += "| Severity | CVSS Vector | CWE |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['cvss_vector']}` | {f['cwe']} |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['mitigation']:
                    md_output += f"**Analysis & Mitigation:**\n{f['mitigation']}\n\n"

                md_output += "**Affected Components:**\n"
                for comp in f['affected_components']:
                    md_output += f"- `{comp['name']}` (v{comp['version']}) — PURL: `{comp['purl']}`\n"
                md_output += "\n"

                if f['references']:
                    md_output += f"**References:**\n{f['references']}\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "CycloneDX Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### CycloneDX Scan Results\n\n**Error:** Failed to parse SBOM: {str(e)}",
                "command": "",
                "title": "CycloneDX: Parse Error"
            }

    # ==========================================
    # JSON PARSING LOGIC
    # ==========================================
    def _parse_json(self, content: str) -> list:
        data = json.loads(content)
        comp_map = {}
        self._flatten_components_json(data.get("components", []), comp_map)

        findings = []
        for vuln in data.get("vulnerabilities", []):
            extracted = self._extract_vuln_core(vuln)

            for affect in vuln.get("affects", []):
                ref = affect.get("ref")
                comp = comp_map.get(ref, {"name": "Unknown", "version": "Unknown", "purl": "N/A"})

                finding = extracted.copy()
                finding['component'] = comp
                findings.append(finding)

        return findings

    def _flatten_components_json(self, components: list, comp_map: dict):
        for c in components:
            if "bom-ref" in c:
                comp_map[c["bom-ref"]] = c
            if "components" in c:
                self._flatten_components_json(c["components"], comp_map)

    # ==========================================
    # XML PARSING LOGIC
    # ==========================================
    def _parse_xml(self, content: str) -> list:
        # Strip namespaces from tags for easier querying across CycloneDX schema versions
        it = ET.iterparse(import_string_io(content))
        for _, el in it:
            _, _, el.tag = el.tag.rpartition('}')
        root = it.root

        comp_map = {}
        self._flatten_components_xml(root.findall(".//component"), comp_map)

        findings = []

        # Modern 1.4+ root level vulnerabilities
        for vuln in root.findall(".//vulnerabilities/vulnerability"):
            extracted = self._extract_vuln_core_xml(vuln)
            for target in vuln.findall(".//affects/target"):
                ref = target.findtext("ref")
                if ref:
                    comp = comp_map.get(ref, {"name": "Unknown", "version": "Unknown", "purl": "N/A"})
                    finding = extracted.copy()
                    finding['component'] = comp
                    findings.append(finding)

        return findings

    def _flatten_components_xml(self, components, comp_map: dict):
        for c in components:
            bom_ref = c.attrib.get("bom-ref")
            if bom_ref:
                comp_map[bom_ref] = {
                    "name": c.findtext("name", "Unknown"),
                    "version": c.findtext("version", "Unknown"),
                    "purl": c.findtext("purl", "N/A")
                }

    # ==========================================
    # SHARED EXTRACTION LOGIC
    # ==========================================
    def _extract_vuln_core(self, vuln: dict) -> dict:
        """Extracts agnostic vulnerability data from a JSON node."""
        vuln_id = vuln.get("id", "Unknown ID")
        description = vuln.get("description", "")
        detail = vuln.get("detail", "")
        desc_full = f"{description}\n\n{detail}".strip() or "No description provided."

        severity = "Medium"
        cvss_vector = "N/A"
        for rating in vuln.get("ratings", []):
            if rating.get("method", "").startswith("CVSSv3"):
                cvss_vector = rating.get("vector", "N/A")
                severity = rating.get("severity", severity)
                break
            severity = rating.get("severity", severity)

        severity = severity.capitalize() if severity else "Medium"

        cwes = vuln.get("cwes", [])
        cwe = f"CWE-{cwes[0]}" if cwes else "N/A"

        refs = []
        for adv in vuln.get("advisories", []):
            title = adv.get("title", "Advisory")
            url = adv.get("url", "")
            if url: refs.append(f"- [{title}]({url})")

        mitigation = vuln.get("recommendation", "")
        is_suppressed = False
        analysis = vuln.get("analysis", {})
        if analysis:
            state = analysis.get("state")
            if state in {"resolved", "resolved_with_pedigree", "not_affected", "false_positive"}:
                is_suppressed = True
                detail = analysis.get("detail", "")
                mitigation = f"**State: {state.upper()}**\n{detail}\n\n{mitigation}".strip()

        return {
            "vuln_id": vuln_id,
            "description": desc_full,
            "severity": severity,
            "cvss_vector": cvss_vector,
            "cwe": cwe,
            "mitigation": mitigation,
            "references": "\n".join(refs),
            "is_suppressed": is_suppressed
        }

    def _extract_vuln_core_xml(self, vuln) -> dict:
        """Extracts agnostic vulnerability data from an XML node."""
        vuln_id = vuln.findtext("id", "Unknown ID")
        desc = vuln.findtext("description", "")
        detail = vuln.findtext("detail", "")
        desc_full = f"{desc}\n\n{detail}".strip() or "No description provided."

        severity = "Medium"
        cvss_vector = "N/A"
        for rating in vuln.findall(".//rating"):
            if rating.findtext("method", "").startswith("CVSSv3"):
                cvss_vector = rating.findtext("vector", "N/A")
                severity = rating.findtext("severity", severity)
                break
            severity = rating.findtext("severity", severity)

        severity = severity.capitalize() if severity else "Medium"

        cwes = [cwe.text for cwe in vuln.findall(".//cwes/cwe")]
        cwe = f"CWE-{cwes[0]}" if cwes else "N/A"

        refs = []
        for adv in vuln.findall(".//advisories/advisory"):
            title = adv.findtext("title", "Advisory")
            url = adv.findtext("url", "")
            if url: refs.append(f"- [{title}]({url})")

        mitigation = vuln.findtext("recommendation", "")
        is_suppressed = False
        analysis = vuln.find(".//analysis")
        if analysis is not None:
            state = analysis.findtext("state")
            if state in {"resolved", "resolved_with_pedigree", "not_affected", "false_positive"}:
                is_suppressed = True
                analysis_detail = analysis.findtext("detail", "")
                mitigation = f"**State: {state.upper()}**\n{analysis_detail}\n\n{mitigation}".strip()

        return {
            "vuln_id": vuln_id,
            "description": desc_full,
            "severity": severity,
            "cvss_vector": cvss_vector,
            "cwe": cwe,
            "mitigation": mitigation,
            "references": "\n".join(refs),
            "is_suppressed": is_suppressed
        }


# Helper to support ElementTree memory parsing
import io


def import_string_io(content: str):
    return io.StringIO(content)