import json


class BearerCLIParser:
    """
    Standalone Bearer CLI SAST JSON Parser.
    Converts Bearer scanner output directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Attempts to parse the file as JSON and looks for Bearer-specific signatures.
        """
        try:
            data = json.loads(file_content)

            # Bearer JSON structures the root by severity keys
            valid_severities = {"critical", "high", "medium", "low", "warning", "info"}

            # Check if the root keys look like Bearer's severity buckets
            if any(k in valid_severities for k in data.keys()):
                # Dig into the first populated array to confirm it's Bearer
                for key, items in data.items():
                    if isinstance(items, list) and len(items) > 0:
                        first_item = items[0]
                        if "fingerprint" in first_item and "cwe_ids" in first_item:
                            return True
        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Takes a Bearer JSON string and returns a formatted Markdown dictionary."""
        try:
            data = json.loads(file_content)

            grouped_findings = {}
            dupes = set()

            # Bearer separates findings by severity at the root level
            for severity_key, items in data.items():
                if not isinstance(items, list):
                    continue

                severity = severity_key.capitalize()

                for finding in items:
                    fingerprint = finding.get("fingerprint")
                    if fingerprint in dupes:
                        continue
                    dupes.add(fingerprint)

                    # Group by the underlying rule/title to avoid cluttering the report
                    rule_id = finding.get("id", "unknown_rule")
                    title = finding.get("title", "Unknown Vulnerability")
                    group_key = f"{severity}_{rule_id}_{title}"

                    if group_key not in grouped_findings:
                        cwe_list = finding.get("cwe_ids", [])
                        cwe = cwe_list[0] if cwe_list else "N/A"

                        grouped_findings[group_key] = {
                            "title": title,
                            "severity": severity,
                            "rule_id": rule_id,
                            "cwe": cwe,
                            "description": finding.get("description", "No description provided."),
                            "reference": finding.get("documentation_url", ""),
                            "occurrences": []
                        }

                    # Extract snippet (Bearer sometimes uses 'snippet', sometimes 'code_extract')
                    code_snippet = finding.get("snippet", finding.get("code_extract", ""))
                    code_snippet = str(code_snippet).replace("```", "\\`\\`\\`").strip()

                    grouped_findings[group_key]["occurrences"].append({
                        "filename": finding.get("filename", "Unknown File"),
                        "line": finding.get("line_number", "Unknown"),
                        "snippet": code_snippet,
                        "source": finding.get("source", {}).get("start", ""),
                        "sink": finding.get("sink", "")
                    })

            # Generate the Markdown
            md_output = "### Bearer SAST Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "Bearer SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                # Metadata Table
                md_output += "| Severity | CWE | Rule ID |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['cwe']} | `{f['rule_id']}` |\n\n"

                md_output += "**Description:**\n"
                md_output += f"{f['description']}\n\n"

                if f["reference"]:
                    md_output += f"**Reference:** [Bearer Documentation]({f['reference']})\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['filename']}` (Line {occ['line']})\n"
                md_output += "\n"

                # Code Snippets in a collapsible details tag
                md_output += "<details>\n<summary><b>View Affected Code Snippets</b></summary>\n\n"
                for occ in f['occurrences']:
                    md_output += f"**File:** `{occ['filename']}` **Line:** `{occ['line']}`\n"

                    if occ["source"] or occ["sink"]:
                        md_output += f"> *Source:* `{occ['source']}` | *Sink:* `{occ['sink']}`\n\n"

                    if occ["snippet"]:
                        md_output += f"```text\n{occ['snippet']}\n```\n\n"

                md_output += "</details>\n\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "Bearer SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Bearer SAST Scan Results\n\n**Error:** Failed to parse JSON: {str(e)}",
                "command": "",
                "title": "Bearer: Parse Error"
            }