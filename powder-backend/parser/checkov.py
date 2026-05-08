import json
import hashlib


class CheckovParser:
    """
    Standalone Checkov JSON Parser.
    Converts Checkov IaC scanner output directly into formatted Markdown.
    Groups identical checks together and lists all affected resources beneath them.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Checkov JSON report.
        """
        try:
            data = json.loads(file_content.strip())

            # Checkov can return a single dict or a list of dicts (for multiple frameworks)
            if isinstance(data, dict):
                data = [data]

            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if "check_type" in first and "results" in first:
                    if "failed_checks" in first["results"]:
                        return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Checkov JSON and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content.strip())

            # Normalize to a list to handle multi-framework reports cleanly
            if isinstance(data, dict):
                data = [data]

            grouped_findings = {}

            for report in data:
                check_type = report.get("check_type", "Unknown Framework")
                failed_checks = report.get("results", {}).get("failed_checks", [])

                for item in failed_checks:
                    check_id = item.get("check_id", "Unknown ID")
                    check_name = item.get("check_name", "Unknown Check")
                    description = item.get("description", "")

                    severity_raw = item.get("severity")
                    severity = self._normalize_severity(severity_raw)

                    file_path = item.get("file_path", "Unknown File")
                    resource = item.get("resource", "Unknown Resource")
                    guideline = item.get("guideline", "")

                    # Extract line range if available
                    lines = item.get("file_line_range", [])
                    line_str = f"{lines[0]}-{lines[1]}" if len(lines) >= 2 else str(lines[0]) if lines else "Unknown"

                    # Format benchmarks (mitigation mapping)
                    benchmarks_str = ""
                    benchmarks = item.get("benchmarks", {})
                    if benchmarks:
                        for bm_key, bm_list in benchmarks.items():
                            if bm_list:
                                for gl in bm_list:
                                    benchmarks_str += f"- **{bm_key}**: {gl.get('name', '')} - {gl.get('description', '')}\n"

                    # Group by Check ID and Framework Type
                    group_key = hashlib.sha256(f"{check_id}_{check_type}".encode("utf-8")).hexdigest()

                    if group_key not in grouped_findings:
                        grouped_findings[group_key] = {
                            "title": f"[{check_id}] {check_name}",
                            "check_type": check_type,
                            "severity": severity,
                            "description": description,
                            "guideline": guideline,
                            "benchmarks": benchmarks_str,
                            "occurrences": set()
                        }

                    # Add location to occurrences
                    loc_str = f"`{resource}` in `{file_path}` (Lines: {line_str})"
                    grouped_findings[group_key]["occurrences"].add(loc_str)

            # --- Generate Markdown ---
            md_output = "### Checkov IaC Security Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No security misconfigurations found. The infrastructure code complies with evaluated policies.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Checkov Scan"
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
                md_output += "| Severity | Framework |\n"
                md_output += "|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['check_type']}` |\n\n"

                if f['description']:
                    md_output += f"**Description:**\n{f['description']}\n\n"

                if f['guideline']:
                    md_output += f"**Guideline:** [View Checkov Documentation]({f['guideline']})\n\n"

                if f['benchmarks']:
                    md_output += f"**Benchmarks:**\n{f['benchmarks']}\n"

                # Render occurrences (affected resources)
                occurrences = sorted(list(f['occurrences']))
                md_output += f"**Affected Resources ({len(occurrences)} occurrences):**\n"

                for occ in occurrences[:30]:  # Cap output to prevent massive walls of text
                    md_output += f"- {occ}\n"

                if len(occurrences) > 30:
                    md_output += f"- *... and {len(occurrences) - 30} more affected resources.*\n"

                md_output += "\n---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Checkov Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Checkov Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Checkov: Parse Error"
            }

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        # Checkov doesn't always provide a native severity; default to Medium for failed checks
        if not severity:
            return "Medium"
        s = severity.strip().capitalize()
        if s in {"Critical", "High", "Medium", "Low"}:
            return s
        return "Info"