import json
import hashlib


class TruffleHogParser:
    """
    Standalone TruffleHog (v2 & v3) JSON-Lines Parser.
    Converts TruffleHog secret scanner output directly into formatted Markdown.
    Groups identical secrets by detector/reason and file path.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a TruffleHog v2 or v3 JSON-Lines report.
        """
        try:
            lines = file_content.strip().splitlines()
            if not lines:
                return False

            # TruffleHog outputs JSONL, so we just check the first line
            first_line = json.loads(lines[0])
            if isinstance(first_line, dict):
                # v3 uses SourceMetadata, v2 uses path at the root
                if "SourceMetadata" in first_line or "path" in first_line:
                    return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses TruffleHog JSON-Lines and returns a formatted Markdown dictionary."""
        try:
            lines = file_content.strip().splitlines()
            grouped_findings = {}

            for line in lines:
                if not line.strip():
                    continue

                data = json.loads(line)

                if "SourceMetadata" in data:
                    self._parse_v3(data, grouped_findings)
                elif "path" in data:
                    self._parse_v2(data, grouped_findings)

            # --- Generate Markdown ---
            md_output = "### TruffleHog Secret Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No hardcoded secrets or high entropy strings found in the repository.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "TruffleHog Scan"
                }

            # Sort by severity (Critical -> Info)
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}
            sorted_findings = sorted(
                grouped_findings.values(),
                key=lambda x: severity_order.get(x['severity'], 5)
            )

            for f in sorted_findings:
                verified_badge = " *(✅ Verified Active)*" if f.get('verified') else ""
                md_output += f"#### {f['title']}{verified_badge}\n\n"

                # Metadata Table
                md_output += "| Severity | Detector / Reason | File Path |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| **{f['severity']}** | `{f['detector']}` | `{f['file']}` |\n\n"

                md_output += "**Mitigation:** Secrets and passwords must be removed from source control, rotated immediately, and stored in a secure vault.\n\n"

                # Render occurrences (affected commits/lines)
                occurrences = f['occurrences']
                md_output += f"**Exposure Details ({len(occurrences)} occurrences):**\n\n"

                for idx, occ in enumerate(occurrences[:20]):  # Cap at 20 to prevent massive walls of text
                    md_output += f"**Instance {idx + 1}:**\n"

                    if occ.get('line'):
                        md_output += f"- **Line:** {occ['line']}\n"
                    if occ.get('redacted') or occ.get('strings'):
                        sec_val = occ.get('redacted') or occ.get('strings')
                        md_output += f"- **Secret/String:** `{sec_val}`\n"
                    if occ.get('commit'):
                        md_output += f"- **Commit:** `{occ['commit']}` ({occ.get('date', 'Unknown Date')})\n"
                    if occ.get('email'):
                        md_output += f"- **Committer:** {occ['email']}\n"
                    if occ.get('link'):
                        md_output += f"- **Link:** [View Commit]({occ['link']})\n"

                    # Print extra structured data if it exists (V3 specific)
                    if occ.get('structured_data') or occ.get('extra_data'):
                        md_output += "- **Additional Context:**\n"
                        if occ.get('structured_data'):
                            md_output += f"  ```json\n  {json.dumps(occ['structured_data'])}  \n```\n"
                        if occ.get('extra_data'):
                            md_output += f"  ```json\n  {json.dumps(occ['extra_data'])}  \n```\n"

                    md_output += "\n"

                if len(occurrences) > 20:
                    md_output += f"*... and {len(occurrences) - 20} more exposure instances in this file.*\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "TruffleHog Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### TruffleHog Results\n\n**Error:** Failed to parse JSON-Lines: {str(e)}",
                "command": "",
                "title": "TruffleHog: Parse Error"
            }

    # ==========================================
    # Parsing Strategies
    # ==========================================
    def _parse_v2(self, item: dict, grouped_findings: dict):
        """Parses the TruffleHog v2 JSON format."""
        file_path = item.get("path", "Unknown File")
        reason = item.get("reason", "Unknown Reason")

        # Severity Logic for V2
        severity = "High"
        if reason == "High Entropy":
            severity = "Info"
        elif any(x in reason for x in ["Oauth", "AWS", "Heroku"]):
            severity = "Critical"
        elif reason == "Generic Secret":
            severity = "Medium"

        strings_found = "\n".join(item.get("stringsFound", []))

        group_key = hashlib.sha256(f"v2_{file_path}_{reason}".encode("utf-8")).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"Hardcoded {reason} in {file_path}",
                "detector": reason,
                "file": file_path,
                "severity": severity,
                "verified": False,
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "strings": strings_found,
            "commit": item.get("commitHash"),
            "date": item.get("date"),
            "branch": item.get("branch")
        })

    def _parse_v3(self, item: dict, grouped_findings: dict):
        """Parses the TruffleHog v3 JSON format."""
        metadata = item.get("SourceMetadata", {}).get("Data", {})
        source_data = {}
        if metadata:
            source_key = list(metadata.keys())[0]
            source_data = metadata.get(source_key, {})

        file_path = source_data.get("file", "Unknown File")
        detector_name = item.get("DetectorName", "Unknown Detector")
        verified = item.get("Verified", False)

        # Severity Logic for V3
        severity = "Critical"
        if not verified:
            if any(x in detector_name for x in ["Oauth", "AWS", "Heroku"]):
                severity = "Critical"
            elif "PrivateKey" in detector_name:
                severity = "High"
            elif "Generic Secret" in detector_name:
                severity = "Medium"
            else:
                severity = "High"  # Default for unverified secrets in V3

        group_key = hashlib.sha256(f"v3_{file_path}_{detector_name}_{verified}".encode("utf-8")).hexdigest()

        if group_key not in grouped_findings:
            grouped_findings[group_key] = {
                "title": f"Hardcoded {detector_name} secret in {file_path}",
                "detector": detector_name,
                "file": file_path,
                "severity": severity,
                "verified": verified,
                "occurrences": []
            }

        grouped_findings[group_key]["occurrences"].append({
            "redacted": item.get("Redacted", ""),
            "line": source_data.get("line", 0),
            "commit": source_data.get("commit", ""),
            "date": source_data.get("timestamp", ""),
            "email": source_data.get("email", ""),
            "link": source_data.get("link", ""),
            "structured_data": item.get("StructuredData", {}),
            "extra_data": item.get("ExtraData", {})
        })