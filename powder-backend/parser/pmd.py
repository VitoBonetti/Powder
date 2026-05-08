import csv
import io


class PmdParser:
    """
    Standalone PMD CSV Parser.
    Converts PMD scanner CSV outputs directly into formatted Markdown.
    """

    def __init__(self):
        # Note: Keeping the original priority mapping from DefectDojo
        self.priority_mapping = {
            "5": "Critical",
            "4": "High",
            "3": "Medium",
            "2": "Low",
            "1": "Info"
        }

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a PMD CSV output by checking the header row.
        """
        try:
            # Read just the first line/header
            reader = csv.reader(io.StringIO(file_content[:1000]), delimiter=",", quotechar='"')
            header = next(reader, [])

            # PMD CSVs reliably have these specific exact columns
            expected_headers = {"Problem", "Package", "File", "Priority", "Line", "Description", "Rule set", "Rule"}
            if expected_headers.issubset(set(header)):
                return True
        except Exception:
            return False

        return False

    def parse(self, file_content: str) -> dict:
        """Parses the PMD CSV file and converts it to grouped Markdown."""
        try:
            reader = list(csv.DictReader(io.StringIO(file_content), delimiter=",", quotechar='"'))
            grouped_findings = {}

            for row in reader:
                rule = row.get("Rule", "Unknown Rule").strip()
                priority = row.get("Priority", "1").strip()
                severity = self.priority_mapping.get(priority, "Info")

                description = row.get("Description", "No description provided.").strip()
                rule_set = row.get("Rule set", "Unknown").strip()
                problem = row.get("Problem", "Unknown Problem").strip()
                package = row.get("Package", "Unknown Package").strip()

                file_path = row.get("File", "Unknown File").strip()
                line = row.get("Line", "0").strip()

                # Group by Severity and Rule to prevent report bloat
                group_key = f"{severity}_{rule}"

                if group_key not in grouped_findings:
                    grouped_findings[group_key] = {
                        "rule": rule,
                        "severity": severity,
                        "rule_set": rule_set,
                        "description": description,
                        "problem": problem,
                        "package": package,
                        "occurrences": []
                    }

                grouped_findings[group_key]["occurrences"].append({
                    "file": file_path,
                    "line": line
                })

            # Generate the Markdown Report
            md_output = "### PMD SAST Scan Results\n\n"

            if not grouped_findings:
                md_output += "*No vulnerabilities or code smells found.*\n"
                return {
                    "markdown": md_output,
                    "command": "",
                    "title": "PMD SAST Scan"
                }

            for f in grouped_findings.values():
                md_output += f"#### PMD Rule: `{f['rule']}`\n\n"

                md_output += "| Severity | Rule Set | Package |\n"
                md_output += "|---|---|---|\n"
                md_output += f"| {f['severity']} | {f['rule_set']} | `{f['package']}` |\n\n"

                md_output += f"**Problem:** {f['problem']}\n\n"
                md_output += f"**Description:**\n{f['description']}\n\n"

                md_output += f"**Affected Files ({len(f['occurrences'])} occurrences):**\n"

                # If there are a massive amount of occurrences, we wrap them in a details tag
                # to prevent a single rule from taking up 10 pages in the PDF.
                if len(f['occurrences']) > 15:
                    md_output += "<details>\n<summary><b>View all affected files</b></summary>\n\n"
                    for occ in f['occurrences']:
                        md_output += f"- `{occ['file']}` (Line {occ['line']})\n"
                    md_output += "\n</details>\n\n"
                else:
                    for occ in f['occurrences']:
                        md_output += f"- `{occ['file']}` (Line {occ['line']})\n"
                    md_output += "\n"

                md_output += "---\n\n"

            return {
                "markdown": md_output,
                "command": "",
                "title": "PMD SAST Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### PMD Scan Results\n\n**Error:** Failed to parse CSV: {str(e)}",
                "command": "",
                "title": "PMD: Parse Error"
            }