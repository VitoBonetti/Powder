import json
import hashlib


class WazuhParser:
    """
    Standalone Wazuh JSON Parser.
    Converts Wazuh scanner output (supports both v4.7 and v4.8+ structures)
    directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Wazuh vulnerability JSON report.
        """
        try:
            data = json.loads(file_content)
            if isinstance(data, dict):
                # Wazuh 4.7 format
                if data.get("data") and "affected_items" in data["data"]:
                    return True
                # Wazuh 4.8 format (Elasticsearch hits structure)
                if data.get("hits") and "hits" in data["hits"]:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Wazuh JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)
            findings = []

            # Route to appropriate version parser
            if data.get("data"):
                findings = self._parse_v4_7(data)
            elif data.get("hits"):
                findings = self._parse_v4_8(data)

            # Group findings by Agent
            agents = {}
            for f in findings:
                agent = f["agent"]
                if agent not in agents:
                    agents[agent] = []
                agents[agent].append(f)

            # --- Generate Markdown ---
            md_output = "### Wazuh Vulnerability Scan Results\n\n"

            if not findings:
                md_output += "*No vulnerabilities found across scanned agents.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Wazuh Scan"
                }

            for agent, agent_findings in agents.items():
                md_output += f"#### Agent: `{agent}`\n\n"

                # Metadata Table for the Agent
                md_output += "| Severity | CVE | CVSS Score | Package | Version |\n"
                md_output += "|---|---|---|---|---|\n"

                for f in agent_findings:
                    md_output += f"| **{f['severity']}** | {f['cve']} | {f['cvss']} | `{f['package']}` | `{f['version']}` |\n"

                # Detailed evidence in a collapsible section
                md_output += "\n<details>\n<summary><b>View Detailed Vulnerability Information</b></summary>\n\n"

                for idx, f in enumerate(agent_findings):
                    md_output += f"##### {idx + 1}. {f['cve']} — `{f['package']}` (v{f['version']})\n"
                    md_output += f"**Description:**\n{f['description']}\n\n"

                    if f['references']:
                        md_output += "**References:**\n"
                        for ref in f['references']:
                            if ref.strip():
                                md_output += f"- {ref.strip()}\n"
                        md_output += "\n"

                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Wazuh Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Wazuh Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Wazuh: Parse Error"
            }

    # ==========================================
    # Wazuh 4.7 Parsing Logic
    # ==========================================
    def _parse_v4_7(self, data: dict) -> list:
        findings = []
        dupes = set()

        for item in data.get("data", {}).get("affected_items", []):
            # The vulnerabilities with condition "Package unfixed" are skipped
            # because there is no fix out yet. Untriaged are skipped.
            if item.get("condition") == "Package unfixed" or item.get("severity") == "Untriaged":
                continue

            cve = item.get("cve", "Unknown CVE")
            pkg_name = item.get("name", "Unknown Package")
            pkg_version = item.get("version", "Unknown Version")
            agent_name = item.get("agent_name") or item.get("agent_ip") or "Unknown Agent"

            # Deduplication
            dupe_key = hashlib.sha256(f"{cve}{agent_name}{pkg_name}{pkg_version}".encode()).hexdigest()
            if dupe_key in dupes:
                continue
            dupes.add(dupe_key)

            refs = item.get("external_references", [])

            findings.append({
                "cve": cve,
                "package": pkg_name,
                "version": pkg_version,
                "severity": self._map_severity(item.get("severity", "Info").capitalize()),
                "cvss": item.get("cvss3_score", "N/A"),
                "agent": agent_name,
                "description": item.get("condition", "No description provided."),
                "references": refs if isinstance(refs, list) else [refs]
            })

        return findings

    # ==========================================
    # Wazuh 4.8 Parsing Logic
    # ==========================================
    def _parse_v4_8(self, data: dict) -> list:
        findings = []
        dupes = set()

        for item_source in data.get("hits", {}).get("hits", []):
            item = item_source.get("_source", {})
            vuln = item.get("vulnerability", {})
            pkg = item.get("package", {})
            agent = item.get("agent", {})

            cve = vuln.get("id", "Unknown CVE")
            agent_id = agent.get("id", "Unknown ID")
            agent_name = agent.get("name") or agent_id

            # Deduplication
            dupe_key = f"{cve}-{agent_id}"
            if dupe_key in dupes:
                continue
            dupes.add(dupe_key)

            cvss_score = "N/A"
            if isinstance(vuln.get("score"), dict):
                cvss_score = vuln["score"].get("base", "N/A")

            ref = vuln.get("reference", "")

            findings.append({
                "cve": cve,
                "package": pkg.get("name", "Unknown Package"),
                "version": pkg.get("version", "Unknown Version"),
                "severity": self._map_severity(vuln.get("severity", "Info")),
                "cvss": cvss_score,
                "agent": agent_name,
                "description": vuln.get("description", "No description provided."),
                "references": [ref] if ref else []
            })

        return findings

    def _map_severity(self, sev: str) -> str:
        """Map Wazuh severity to standardized string."""
        mapping = {
            "Critical": "Critical",
            "High": "High",
            "Medium": "Medium",
            "Low": "Low",
            "Info": "Info",
            "Informational": "Info",
            "Untriaged": "Info",
        }
        return mapping.get(sev, "Info")