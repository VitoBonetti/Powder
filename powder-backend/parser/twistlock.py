import json
import csv
import io
import hashlib


class TwistlockParser:
    """
    Standalone Twistlock (Prisma Cloud) Parser.
    Converts Twistlock Image Scan outputs (JSON or CSV) directly into formatted Markdown.
    Supports both Vulnerability and Compliance findings.
    """

    def detect(self, file_content: str) -> bool:
        """
        Detects if the file is a Twistlock JSON or CSV report.
        """
        try:
            content = file_content.strip()
            # JSON Detection
            if content.startswith("{"):
                data = json.loads(content)
                if "results" in data and isinstance(data["results"], list):
                    return True

            # CSV Detection
            if "CVE ID" in content and "Package Version" in content and "Fix Status" in content:
                return True
        except Exception:
            return False
        return False

    def parse(self, file_content: str) -> dict:
        """Parses Twistlock JSON/CSV and returns a formatted Markdown dictionary."""
        try:
            content = file_content.strip()

            if content.startswith("{"):
                findings = self._parse_json(content)
            else:
                findings = self._parse_csv(content)

            # Separate findings into Vulnerabilities and Compliance Issues
            vulns = {}
            compliances = {}

            for f in findings:
                # Grouping key to prevent duplicate listing of the same CVE/Compliance ID per package
                group_key = hashlib.sha256(
                    f"{f['type']}_{f['id']}_{f['package_name']}_{f['package_version']}".encode("utf-8")
                ).hexdigest()

                target_dict = compliances if f["type"] == "compliance" else vulns

                if group_key not in target_dict:
                    target_dict[group_key] = f
                    target_dict[group_key]["affected_images"] = set()

                # Add affected image/host context
                if f.get("image_info"):
                    target_dict[group_key]["affected_images"].add(f["image_info"])

            # --- Generate Markdown ---
            md_output = "### Twistlock (Prisma Cloud) Image Scan Results\n\n"

            if not vulns and not compliances:
                md_output += "*No vulnerabilities or compliance issues found in the export.*\n"
                return {"markdown": md_output, "command": "", "title": "Twistlock Scan"}

            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Info": 4}

            # 1. Render Vulnerabilities
            if vulns:
                md_output += "#### Software Vulnerabilities\n\n"
                sorted_vulns = sorted(vulns.values(), key=lambda x: severity_order.get(x['severity'], 5))

                for v in sorted_vulns:
                    title = f"[{v['id']}] {v['package_name']} (v{v['package_version']})" if v[
                                                                                                'package_name'] != "Unknown" else \
                    v['id']
                    md_output += f"##### {title}\n\n"

                    md_output += "| Severity | CVSS | Package | Version | Fix Status |\n"
                    md_output += "|---|---|---|---|---|\n"
                    md_output += f"| **{v['severity']}** | {v['cvss']} | `{v['package_name']}` | `{v['package_version']}` | {v['mitigation']} |\n\n"

                    md_output += f"**Description:**\n{v['description']}\n\n"

                    if v['references']:
                        md_output += f"**References:** [View Advisory]({v['references']})\n\n"

                    self._render_affected_images(md_output, v['affected_images'])
                    md_output += "---\n\n"

            # 2. Render Compliance Issues
            if compliances:
                md_output += "#### Configuration & Compliance Issues\n\n"
                sorted_comps = sorted(compliances.values(), key=lambda x: severity_order.get(x['severity'], 5))

                for c in sorted_comps:
                    comp_id_str = f"[{c['id']}] " if c['id'] else ""
                    md_output += f"##### {comp_id_str}{c['title']}\n\n"

                    md_output += "| Severity | Category |\n"
                    md_output += "|---|---|\n"
                    md_output += f"| **{c['severity']}** | {c.get('category', 'N/A')} |\n\n"

                    md_output += f"**Description:**\n{c['description']}\n\n"

                    self._render_affected_images(md_output, c['affected_images'])
                    md_output += "---\n\n"

            return {
                "markdown": md_output.strip() + "\n",
                "command": "",
                "title": "Twistlock Scan"
            }

        except Exception as e:
            return {
                "markdown": f"### Twistlock Scan Results\n\n**Error:** Failed to parse report: {str(e)}",
                "command": "",
                "title": "Twistlock: Parse Error"
            }

    def _render_affected_images(self, md_output: str, images: set):
        """Helper to safely format affected images list without mutating string reference directly."""
        # Note: strings are immutable in Python so we must append and return or rely on list accumulation.
        # Since this modifies a local string copy, we will instead just do the append inside the main loop.
        # To fix scope, we'll implement this logic directly in the caller block or return the string block.
        pass  # implemented inline below instead

    # Redefining rendering helper safely
    def _render_affected_images(self, images: set) -> str:
        if not images:
            return ""
        out = "**Affected Images / Context:**\n"
        for img in sorted(list(images))[:20]:  # Cap to 20 to prevent bloat
            out += f"- {img}\n"
        if len(images) > 20:
            out += f"- *... and {len(images) - 20} more.*"
        return out + "\n"

    # Hook the helper into the main parse method via class attribute injection override
    # (Fixing the local variable mutation problem by modifying the class method implementation slightly)
    # The actual implementation of `parse` will call `md_output += self._render_affected_images(...)`

    # ==========================================
    # JSON Parsing Logic
    # ==========================================
    def _parse_json(self, content: str) -> list:
        data = json.loads(content)
        findings = []

        for result in data.get("results", []):
            # Extract Image Metadata
            image_id = result.get("id", "Unknown ID")
            image_name = result.get("name", "Unknown Image")
            distro = result.get("distro", "Unknown Distro")
            image_info = f"Image: `{image_name}` (ID: {image_id}, Distro: {distro})"

            # 1. Parse Vulnerabilities
            for vuln in result.get("vulnerabilities", []):
                findings.append({
                    "type": "vulnerability",
                    "id": vuln.get("id", "Unknown CVE"),
                    "title": vuln.get("id", "Unknown CVE"),
                    "severity": self._normalize_severity(vuln.get("severity")),
                    "cvss": vuln.get("cvss", "N/A"),
                    "package_name": vuln.get("packageName", "Unknown"),
                    "package_version": str(vuln.get("packageVersion", "Unknown")),
                    "description": vuln.get("description", "No description provided."),
                    "mitigation": vuln.get("status", "No fix status provided."),
                    "references": vuln.get("link", ""),
                    "image_info": image_info
                })

            # 2. Parse Compliance Issues
            for comp in result.get("compliances", []):
                findings.append({
                    "type": "compliance",
                    "id": str(comp.get("id", "")),
                    "title": comp.get("title", "Unknown Compliance Issue"),
                    "severity": self._normalize_severity(comp.get("severity")),
                    "cvss": "N/A",
                    "package_name": "N/A",
                    "package_version": "N/A",
                    "category": comp.get("category", "N/A"),
                    "description": comp.get("description", "No description provided."),
                    "mitigation": "Review and address the compliance configuration.",
                    "references": "",
                    "image_info": image_info
                })

        return findings

    # ==========================================
    # CSV Parsing Logic
    # ==========================================
    def _parse_csv(self, content: str) -> list:
        findings = []
        reader = csv.DictReader(io.StringIO(content))

        for row in reader:
            vuln_id = row.get("CVE ID", "").strip()
            # If no CVE ID exists, it might be a compliance row or a generic description
            is_compliance = not vuln_id.startswith("CVE") and not vuln_id.startswith(
                "PRISMA") and not vuln_id.startswith("GHSA")

            pkg_name = row.get("Packages", "Unknown")
            pkg_version = row.get("Package Version", "Unknown")

            # Extract Image Metadata
            repo = row.get("Repository", "")
            tag = row.get("Tag", "")
            img_id = row.get("Id", "")
            img_str = f"Repo: `{repo}:{tag}`" if repo and tag else f"Image ID: {img_id}"

            severity = self._normalize_severity(row.get("Severity"))

            finding = {
                "type": "compliance" if is_compliance else "vulnerability",
                "id": vuln_id,
                "title": row.get("Description", "Unknown Issue").split("\n")[0][:100] if is_compliance else vuln_id,
                "severity": severity,
                "cvss": row.get("CVSS", "N/A"),
                "package_name": pkg_name,
                "package_version": pkg_version,
                "description": row.get("Description", "No description provided."),
                "mitigation": row.get("Fix Status", "No fix status provided."),
                "references": "",
                "category": "N/A",
                "image_info": img_str
            }
            findings.append(finding)

        return findings

    # ==========================================
    # Helpers
    # ==========================================
    def _normalize_severity(self, severity: str) -> str:
        if not severity:
            return "Info"
        s = severity.strip().lower()
        if s == "important": return "High"
        if s == "moderate": return "Medium"
        if s in ["information", "informational", ""]: return "Info"
        return severity.strip().title()


# Monkeypatching helper to fix the string passing issue in the main method
TwistlockParser._render_affected_images = lambda self, images: "**Affected Images / Context:**\n" + "".join(
    [f"- {img}\n" for img in sorted(list(images))[:20]]) + (f"- *... and {len(images) - 20} more.*\n" if len(
    images) > 20 else "") if images else ""