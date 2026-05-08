import csv
import io
import xml.etree.ElementTree as ET


class VCGParser:
    """
    Standalone VCG (VisualCodeGrepper) Parser.
    Supports both XML and CSV outputs, converting them to formatted Markdown.
    """

    def __init__(self):
        # VCG uses a 1-7 priority scale. We map it to standard severities.
        self.priority_mapping = {
            1: "Critical",
            2: "High",
            3: "Medium",
            4: "Low",
            5: "Low",
            6: "Info",
            7: "Info"
        }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a VCG XML or CSV output.
        """
        # Check 1: Is it VCG XML?
        if "<CodeIssue>" in file_content and "<Priority>" in file_content:
            return True

        # Check 2: Is it VCG CSV?
        # VCG CSVs have 7 columns where the first column is a priority integer.
        try:
            reader = csv.reader(io.StringIO(file_content), delimiter=",", quotechar='"')
            first_row = next(reader, None)
            if first_row and len(first_row) >= 7:
                if first_row[0].isdigit() and int(first_row[0]) in self.priority_mapping:
                    return True
        except Exception:
            pass

        return False

    def parse(self, file_content: str) -> dict:
        """Parses the VCG file (XML or CSV) and converts it to Markdown."""
        try:
            if "<CodeIssue>" in file_content:
                grouped_findings = self._parse_xml(file_content)
            else:
                grouped_findings = self._parse_csv(file_content)

            md_output = "### VCG (VisualCodeGrepper) Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "VCG SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### {f['title']}\n\n"
                md_output += "| Severity | Occurrences |\n"
                md_output += "|---|---|\n"
                md_output += f"| {f['severity']} | {len(f['occurrences'])} |\n\n"

                if f['description']:
                    md_output += f"**Description:**\n{f['description']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"
                for occ in f['occurrences']:
                    md_output += f"- `{occ['filename']}` (Line {occ['line']})\n"
                md_output += "\n"

                # Group code snippets inside a collapsible detail tag
                has_code = any(occ['code_line'] for occ in f['occurrences'])
                if has_code:
                    md_output += "<details>\n<summary><b>View Affected Code Snippets</b></summary>\n\n"
                    for occ in f['occurrences']:
                        if occ['code_line']:
                            md_output += f"**File:** `{occ['filename']}` **Line:** `{occ['line']}`\n"
                            md_output += f"```text\n{occ['code_line'].strip()}\n```\n\n"
                    md_output += "</details>\n\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "VCG SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### VCG Scan Results\n\n**Error:** Failed to parse VCG output: {str(e)}",
                "command": "",
                "title": "VCG: Parse Error"
            }

    # --- HELPER: XML PARSING ---
    def _parse_xml(self, content: str) -> dict:
        grouped = {}
        # Parse XML tree safely
        root = ET.fromstring(content)

        # In VCG XML, <CodeIssue> tags hold the vulnerabilities
        for issue in root.findall(".//CodeIssue"):
            priority_text = self._get_xml_text(issue, "Priority")
            priority = int(float(priority_text)) if priority_text else 6

            severity = self.priority_mapping.get(priority, "Info")
            title = self._get_xml_text(issue, "Title") or "Unknown Vulnerability"
            description = self._get_xml_text(issue, "Description") or "No description provided."
            filename = self._get_xml_text(issue, "FileName") or "Unknown File"
            line = self._get_xml_text(issue, "Line") or "0"
            code_line = self._get_xml_text(issue, "CodeLine") or ""

            self._group_finding(grouped, severity, title, description, filename, line, code_line)

        return grouped

    def _get_xml_text(self, element, tag):
        found = element.find(tag)
        if found is not None and found.text:
            return found.text
        return None

    # --- HELPER: CSV PARSING ---
    def _parse_csv(self, content: str) -> dict:
        grouped = {}
        reader = csv.reader(io.StringIO(content), delimiter=",", quotechar='"')

        for row in reader:
            if not row or len(row) < 7:
                continue

            try:
                priority = int(float(row[0])) if row[0] else 6
            except ValueError:
                priority = 6

            severity = self.priority_mapping.get(priority, "Info")
            title = row[2] if row[2] else "Unknown Vulnerability"
            description = row[3] if row[3] else "No description provided."
            filename = row[4] if row[4] else "Unknown File"
            line = row[5] if row[5] else "0"
            code_line = row[6] if row[6] else ""

            self._group_finding(grouped, severity, title, description, filename, line, code_line)

        return grouped

    # --- HELPER: GROUPING LOGIC ---
    def _group_finding(self, grouped, severity, title, description, filename, line, code_line):
        """Groups findings by their Title to deduplicate the markdown report."""
        group_key = f"{severity}_{title}"

        if group_key not in grouped:
            grouped[group_key] = {
                "title": title,
                "severity": severity,
                "description": description,
                "occurrences": []
            }

        grouped[group_key]["occurrences"].append({
            "filename": filename,
            "line": line,
            "code_line": code_line
        })