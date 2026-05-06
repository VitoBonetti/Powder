from .nmap import NmapParser

AVAILABLE_PARSERS = [
    NmapParser(),
]

def route_and_parse(file_content: str) -> dict:
    for parser in AVAILABLE_PARSERS:
        if parser.detect(file_content):
            return parser.parse(file_content)
    raise ValueError("Unrecognized tool format. No suitable parser found.")