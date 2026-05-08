import json
import re


class SarifParser:
    """
    Standalone SARIF (Static Analysis Results Interchange Format) Parser.
    Converts SARIF v2.1.0 outputs directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """Detects if the file is a valid SARIF JSON."""
        try:
            data = json.loads(file_content)
            # SARIF requires a 'version' and 'runs' array
            if "version" in data and "runs" in data:
                if str(data["version"]).startswith("2."):
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses the SARIF file and converts it to grouped Markdown."""
        try:
            data = json.loads(file_content)
            grouped_findings = {}
            tool_name = "SARIF Scanner"

            for run in data.get("runs", []):
                # 1. Extract Tool Name
                driver = run.get("tool", {}).get("driver", {})
                tool_name = driver.get("name", "SARIF Scanner")

                # 2. Extract Rules Dictionary (for quick lookup of descriptions/help)
                rules = {}
                for rule in driver.get("rules", []):
                    rules[rule.get("id")] = rule

                # 3. Process Results
                for result in run.get("results", []):
                    # Skip suppressed findings (False Positives)
                    if result.get("suppressions"):
                        continue

                    # Skip if it's explicitly not a failure (e.g., "pass" or "notApplicable")
                    if result.get("kind", "fail") != "fail":
                        continue

                    rule_id = result.get("ruleId", "UnknownRule")
                    rule = rules.get(rule_id, {})

                    title = self._get_title(result, rule)
                    severity = self._get_severity(result, rule)
                    cwe = self._get_cwe(result, rule)
                    description = self._get_description(result, rule)
                    mitigation = self._get_mitigation(result, rule)

                    # Grouping key to prevent duplicate bloat
                    group_key = f"{severity}_{rule_id}_{title}"

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": title,
                            "rule_id": rule_id,
                            "severity": severity,
                            "cwe": cwe,
                            "description": description,
                            "mitigation": mitigation,
                            "occurrences": []
                        }

                    # Extract Occurrences (Locations & Code Flows)
                    for location in result.get("locations", []):
                        phys_loc = location.get("physicalLocation", {})
                        uri = phys_loc.get("artifactLocation", {}).get("uri", "Unknown File")
                        region = phys_loc.get("region", {})
                        line = region.get("startLine", "0")

                        # Get Code Snippet
                        snippet = region.get("snippet", {}).get("text", "")
                        if not snippet and "contextRegion" in phys_loc:
                            snippet = phys_loc.get("contextRegion", {}).get("snippet", {}).get("text", "")

                        # Get Code Flows (Execution Paths)
                        code_flows = self._get_code_flows(result)

                        grouped_findings[group_key]["occurrences"].append({
                            "uri": uri,
                            "line": line,
                            "snippet": snippet.strip(),
                            "code_flows": code_flows
                        })

            # 4. Generate Markdown
            md_output = f"### {tool_name} (SARIF) Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": f"{tool_name} SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | CWE | Rule ID |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['cwe']} | `{f['rule_id']}` |\n\n"

                md_output += f"**Description:**\n{f['description']}\n\n"

                if f['mitigation']:
                    md_output += f"**Mitigation / Fix:**\n{f['mitigation']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['uri']}` (Line {occ['line']})\n"
                md_output += "\n"

                # Evidence & Code Flows inside collapsible block
                md_output += "<details>\n<summary><b>View Evidence & Code Flows</b></summary>\n\n"

                for idx, occ in enumerate(f['occurrences']):
                    md_output += f"**{idx + 1}. File:** `{occ['uri']}` **Line:** `{occ['line']}`\n"

                    if occ['snippet']:
                        md_output += f"```text\n{occ['snippet']}\n```\n"

                    if occ['code_flows']:
                        md_output += "**Code Flow (Execution Trace):**\n"
                        md_output += f"{occ['code_flows']}\n"

                    md_output += "\n"

                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": f"{tool_name} Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### SARIF Scan Results\n\n**Error:** Failed to parse SARIF output: {str(e)}",
                "command": "",
                "title": "SARIF: Parse Error"
            }

    # --- HELPER METHODS ---

    def _get_title(self, result: dict, rule: dict) -> str:
        if "shortDescription" in rule:
            return rule["shortDescription"].get("text", result.get("ruleId", "Unknown Finding"))
        if "name" in rule:
            return rule["name"]
        msg = result.get("message", {}).get("text", "")
        return msg.split("\n")[0] if msg else result.get("ruleId", "Unknown Finding")

    def _get_description(self, result: dict, rule: dict) -> str:
        desc = ""
        if "message" in result and "text" in result["message"]:
            desc += result["message"]["text"] + "\n\n"
        if "fullDescription" in rule and "text" in rule["fullDescription"]:
            desc += rule["fullDescription"]["text"] + "\n\n"
        if "help" in rule and "markdown" in rule["help"]:
            desc += rule["help"]["markdown"] + "\n\n"
        return desc.strip() or "No description provided."

    def _get_mitigation(self, result: dict, rule: dict) -> str:
        mitigation = ""
        # 1. Check for automated fixes
        if "fixes" in result:
            for fix in result["fixes"]:
                mitigation += fix.get("description", {}).get("text", "") + "\n"
        # 2. Check rule help URI
        if not mitigation and "helpUri" in rule:
            mitigation = f"[Remediation Guidance & Documentation]({rule['helpUri']})"

        return mitigation.strip()

    def _get_severity(self, result: dict, rule: dict) -> str:
        # Check for exact CVSS score embedded in properties (e.g., GitHub Advanced Security)
        props = rule.get("properties", {})
        if "security-severity" in props:
            try:
                cvss = float(props["security-severity"])
                if cvss >= 9.0: return "Critical"
                if cvss >= 7.0: return "High"
                if cvss >= 4.0: return "Medium"
                return "Low"
            except ValueError:
                pass

        # Default SARIF Levels
        level = result.get("level", rule.get("defaultConfiguration", {}).get("level", "warning"))
        if level == "error": return "High"
        if level == "warning": return "Medium"
        if level == "note": return "Info"
        return "Medium"

    def _get_cwe(self, result: dict, rule: dict) -> str:
        cwe_regex = r"CWE-(\d+)"

        # Check Rule ID
        match = re.search(cwe_regex, result.get("ruleId", ""), re.IGNORECASE)
        if match: return f"CWE-{match.group(1)}"

        # Check Tags
        tags = rule.get("properties", {}).get("tags", [])
        for tag in tags:
            match = re.search(cwe_regex, str(tag), re.IGNORECASE)
            if match: return f"CWE-{match.group(1)}"

        return "N/A"

    def _get_code_flows(self, result: dict) -> str:
        flow_md = ""
        for code_flow in result.get("codeFlows", []):
            for thread_flow in code_flow.get("threadFlows", []):
                for idx, location in enumerate(thread_flow.get("locations", [])):
                    phys_loc = location.get("location", {}).get("physicalLocation", {})
                    uri = phys_loc.get("artifactLocation", {}).get("uri", "Unknown")
                    line = phys_loc.get("region", {}).get("startLine", "?")
                    msg = location.get("location", {}).get("message", {}).get("text", "")

                    flow_md += f"> {idx + 1}. `{uri}` (Line {line})"
                    if msg: flow_md += f" - *{msg}*"
                    flow_md += "\n"
        return flow_md.strip()