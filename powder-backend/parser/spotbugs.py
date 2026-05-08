import re
import html2text
import xml.etree.ElementTree as ET


class SpotbugsParser:
    """
    Standalone SpotBugs XML Parser.
    Converts SpotBugs XML outputs directly into formatted Markdown.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a SpotBugs or FindBugs XML output.
        """
        # SpotBugs XML files wrap everything in <BugCollection>
        if "<BugCollection" in file_content and "<BugInstance" in file_content:
            return True
        return False

    def parse(self, file_content: str) -> dict:
        """Parses the SpotBugs XML and converts it to formatted Markdown."""
        html_parser = html2text.HTML2Text()
        html_parser.ignore_links = False
        html_parser.body_width = 0

        try:
            root = ET.fromstring(file_content)

            mitigation_patterns = {}
            reference_patterns = {}
            SEVERITY = {"1": "High", "2": "Medium", "3": "Low"}

            # 1. Parse <BugPattern> tags for mitigation & reference metadata
            for pattern in root.findall("BugPattern"):
                details_elem = pattern.find("Details")
                if details_elem is not None:
                    # Convert XML node back to HTML string, then parse to Markdown
                    raw_html = ET.tostring(details_elem, encoding="unicode")
                    html_text = html_parser.handle(raw_html)

                    mitigation = ""
                    reference = ""
                    lines = html_text.splitlines()
                    i = 0

                    # Replicating original split logic for Mitigation vs References
                    for line in lines:
                        i += 1
                        if "Reference" in line:
                            break
                        if any(phrase in line for phrase in
                               ["Vulnerable Code:", "Insecure configuration:", "Code at risk:"]):
                            mitigation += "\n\n#### Example\n"
                        mitigation += line + "\n"

                    # Collect remaining lines as references
                    for line in lines[i:]:
                        reference += line + " "

                    # Regex: turns ')  [' into ')\n[' to fix smashed markdown links
                    reference = re.sub(r"(?<=\))(.*?)(?=\[)", "\n- ", reference).strip()
                    if reference and not reference.startswith("-"):
                        reference = "- " + reference

                    mitigation_patterns[pattern.get("type")] = mitigation.strip()
                    reference_patterns[pattern.get("type")] = reference

            # 2. Parse <BugInstance> tags and group by Vulnerability Type
            grouped_findings = {}

            for bug in root.findall("BugInstance"):
                btype = bug.get("type", "Unknown")
                priority = bug.get("priority", "3")
                severity = SEVERITY.get(priority, "Info")
                cwe = bug.get("cweid", "0")

                short_msg_elem = bug.find("ShortMessage")
                title = short_msg_elem.text if short_msg_elem is not None else btype

                long_msg_elem = bug.find("LongMessage")
                description = long_msg_elem.text if long_msg_elem is not None else ""

                # Extract File / Line Info
                source_elem = bug.find("SourceLine")
                filename = "Unknown File"
                line = "0"
                classname = "UnknownClass"
                if source_elem is not None:
                    filename = source_elem.get("sourcepath", "Unknown File")
                    line = source_elem.get("start", "0")
                    classname = source_elem.get("classname", "UnknownClass")

                # Grouping Key (Prevents duplicates from bloating the report)
                group_key = f"{severity}_{btype}_{title}"

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "title": title,
                        "severity": severity,
                        "cwe": cwe,
                        "description": description,
                        "mitigation": mitigation_patterns.get(btype, ""),
                        "reference": reference_patterns.get(btype, ""),
                        "occurrences": []
                    }

                grouped_findings[group_key]["occurrences"].append({
                    "filename": filename,
                    "line": line,
                    "classname": classname,
                    "specific_desc": description  # Sometimes the long message includes variable names
                })

            # 3. Generate the Markdown Report
            md_output = "### SpotBugs SAST Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "SpotBugs SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"

                md_output += "| Severity | CWE | Occurrences |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['cwe']} | {len(f['occurrences'])} |\n\n"

                if f['mitigation']:
                    md_output += f"**Details & Mitigation:**\n{f['mitigation']}\n\n"

                if f['reference']:
                    md_output += f"**References:**\n{f['reference']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['filename']}` (Line {occ['line']}) — *Class: {occ['classname']}*\n"
                md_output += "\n---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "SpotBugs SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### SpotBugs Scan Results\n\n**Error:** Failed to parse XML: {str(e)}",
                "command": "",
                "title": "SpotBugs: Parse Error"
            }