import xml.etree.ElementTree as ET


class NmapParser:
    def detect(self, file_content: str) -> bool:
        return "<nmaprun" in file_content

    def parse(self, file_content: str) -> dict:
        try:
            root = ET.fromstring(file_content)
            command = root.get('args', '')

            target_ip = "Target"
            host_elem = root.find('host')
            if host_elem is not None:
                addr_elem = host_elem.find('address')
                if addr_elem is not None:
                    target_ip = addr_elem.get('addr', 'Target')

            title = f"Nmap: {target_ip}"
            os_info = ""
            if host_elem is not None:
                os_match = host_elem.find('.//osmatch')
                if os_match is not None:
                    os_info = f"**Detected OS:** {os_match.get('name', 'Unknown')} ({os_match.get('accuracy', '')}% accuracy)\n\n"

            md_output = "### Nmap Scan Results\n\n"
            md_output += os_info
            md_output += "| Port | Protocol | State | Service | Version |\n"
            md_output += "|---|---|---|---|---|\n"

            script_outputs = []
            found_open = False

            for host in root.findall('host'):
                for ports in host.findall('ports'):
                    for port in ports.findall('port'):
                        state_elem = port.find('state')
                        if state_elem is not None and state_elem.get('state') == 'open':
                            found_open = True
                            port_id = port.get('portid', '')
                            protocol = port.get('protocol', '')
                            service_elem = port.find('service')
                            svc_name = service_elem.get('name', '') if service_elem is not None else ''
                            product = service_elem.get('product', '') if service_elem is not None else ''
                            version = service_elem.get('version', '') if service_elem is not None else ''
                            extrainfo = service_elem.get('extrainfo', '') if service_elem is not None else ''

                            full_version = f"{product} {version} {extrainfo}".strip()
                            md_output += f"| {port_id} | {protocol} | open | {svc_name} | {full_version} |\n"

                            for script in port.findall('script'):
                                script_id = script.get('id', 'unknown_script')
                                script_out = script.get('output', '').strip()
                                if script_out:
                                    script_outputs.append(
                                        f"**Port {port_id}/{protocol} - `{script_id}`:**\n```text\n{script_out}\n```\n")

            if not found_open:
                md_output += "| - | - | - | No open ports | - |\n"

            if script_outputs:
                md_output += "\n#### Detailed Script Output\n\n"
                md_output += "\n".join(script_outputs)

            return {"markdown": md_output, "command": command, "title": title}
        except ET.ParseError:
            return {"markdown": "**Error:** Failed to parse XML.", "command": "", "title": "Nmap: Parse Error"}