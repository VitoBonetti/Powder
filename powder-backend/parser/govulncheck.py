import json


class GovulncheckParser:
    """
    Standalone Govulncheck Parser.
    Converts Govulncheck output (both old JSON and new NDJSON streams)
    directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Govulncheck output.
        Govulncheck often outputs NDJSON (stream of JSON objects).
        """
        try:
            data = self._load_data(file_content)

            # Check Old Format
            if isinstance(data, dict) and "Vulns" in data:
                return True

            # Check New Format (List of objects, looking for 'osv' or 'finding')
            if isinstance(data, list) and len(data) > 0:
                for elem in data:
                    if "osv" in elem or "finding" in elem or "Vulns" in elem:
                        return True

        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Parses the Govulncheck data and converts it to grouped Markdown."""
        try:
            data = self._load_data(file_content)
            grouped_findings = {}

            # --- PROCESS NEW FORMAT (NDJSON Stream) ---
            if isinstance(data, list):
                for elem in data:
                    if "osv" not in elem:
                        continue

                    osv_data = elem["osv"]
                    osv_id = osv_data.get("id", "Unknown OSV")
                    aliases = osv_data.get("aliases", [])
                    cve = aliases[0] if aliases else osv_id

                    affected = osv_data.get("affected", [{}])[0]
                    package = affected.get("package", {}).get("name", "Unknown Package")
                    ecosystem = affected.get("package", {}).get("ecosystem", "Go")

                    summary = osv_data.get("summary", "")
                    details = osv_data.get("details", "")
                    severity = osv_data.get("severity", "Medium")

                    # Version and Fix parsing
                    affected_ranges = affected.get("ranges", [])
                    introduced, fixed = self._get_versions(affected_ranges)

                    # Trace Information (Call stacks)
                    traces = self._get_finding_trace_info(data, osv_id)

                    if osv_id not in grouped_findings:
                        grouped_findings[osv_id] = {
                            "cve": cve,
                            "package": package,
                            "ecosystem": ecosystem,
                            "severity": severity,
                            "summary": summary,
                            "details": details,
                            "introduced": introduced,
                            "fixed": fixed,
                            "traces": []
                        }

                    if traces and traces not in grouped_findings[osv_id]["traces"]:
                        grouped_findings[osv_id]["traces"].extend(traces)

            # --- PROCESS OLD FORMAT (Single Dict with Vulns) ---
            elif isinstance(data, dict) and "Vulns" in data:
                for vuln in data.get("Vulns", []):
                    osv_data = vuln.get("OSV", {})
                    osv_id = osv_data.get("id", "Unknown OSV")
                    aliases = osv_data.get("aliases", [])
                    cve = aliases[0] if aliases else osv_id

                    affected = osv_data.get("affected", [{}])[0]
                    package = affected.get("package", {}).get("name", "Unknown Package")

                    summary = osv_data.get("summary", "No summary provided.")
                    details = osv_data.get("details", "")

                    if osv_id not in grouped_findings:
                        grouped_findings[osv_id] = {
                            "cve": cve,
                            "package": package,
                            "ecosystem": "Go",
                            "severity": "Medium",  # Old format rarely specified severity
                            "summary": summary,
                            "details": details,
                            "introduced": "Unknown",
                            "fixed": "Unknown",
                            "traces": []
                        }

            # --- GENERATE MARKDOWN ---
            md_output = "### Govulncheck Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No reachable vulnerabilities found in your Go code.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Govulncheck Scan"
                }

            for osv_id, f in grouped_findings.items():
                title_id = f"{osv_id} ({f['cve']})" if osv_id != f['cve'] else osv_id
                md_output += f"#### {title_id} in `{f['package']}`\n\n"

                # Metadata Table
                md_output += "| Package | Ecosystem | Introduced | Fixed In | Severity |\n"
                md_output += "|---|---|---|---|---|\n"
                md_output += f"| `{f['package']}` | {f['ecosystem']} | {f['introduced']} | {f['fixed']} | {f['severity']} |\n\n"

                if f['summary']:
                    md_output += f"**Summary:** {f['summary']}\n\n"
                if f['details']:
                    md_output += f"**Details:**\n{f['details']}\n\n"

                # Traces (Proof of reachability)
                if f['traces']:
                    md_output += "<details>\n<summary><b>View Vulnerable Call Traces (Reachability)</b></summary>\n\n"
                    for idx, trace in enumerate(f['traces']):
                        md_output += f"**Trace {idx + 1}:**\n"
                        md_output += f"- **Module:** `{trace['module']}@{trace['version']}`\n"
                        md_output += f"- **Function:** `{trace['function']}`\n"
                        md_output += f"- **File:** `{trace['filename']}:{trace['line']}`\n\n"
                    md_output += "</details>\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Govulncheck SAST/SCA Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Govulncheck Scan Results\n\n**Error:** Failed to parse output: {str(e)}",
                "command": "",
                "title": "Govulncheck: Parse Error"
            }

    # --- HELPER METHODS ---

    def _load_data(self, file_content: str):
        """Govulncheck outputs NDJSON (stream). This safely loads it into a list."""
        try:
            parsed = json.loads(file_content)
            return parsed
        except json.JSONDecodeError:
            data = []
            for line in file_content.splitlines():
                if not line.strip():
                    continue
                try:
                    data.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            if not data:
                raise ValueError("Invalid JSON or NDJSON format")
            return data

    def _get_versions(self, affected_ranges: list) -> tuple:
        """Extracts the 'introduced' and 'fixed' versions from OSV events."""
        introduced = "0.0.0"
        fixed = "Unknown"

        for r in affected_ranges:
            for event in r.get("events", []):
                if "introduced" in event:
                    introduced = event["introduced"]
                if "fixed" in event:
                    fixed = event["fixed"]
        return introduced, fixed

    def _get_finding_trace_info(self, data: list, osv_id: str) -> list:
        """Matches the OSV ID to the 'finding' traces to show code reachability."""
        traces = []
        for elem in data:
            if "finding" in elem:
                finding = elem["finding"]
                if finding.get("osv") == osv_id:
                    for trace in finding.get("trace", []):
                        traces.append({
                            "module": trace.get("module", "Unknown module"),
                            "version": trace.get("version", "Unknown version"),
                            "function": trace.get("function", "Unknown function"),
                            "filename": trace.get("position", {}).get("filename", "Unknown filename"),
                            "line": trace.get("position", {}).get("line", "Unknown line")
                        })
        return traces