from .nikto import NiktoParser
from .nmap import NmapParser
from .semgrep import SemgrepParser
from .aracnhi import ArachniParser
from .bandit import BanditParser
from .bearer import BearerCLIParser
from .vcg import VCGParser
from .spotbugs import SpotbugsParser
from .sarif import SarifParser
from .rubocop import RubocopParser
from .pmd import PmdParser
from .horusec import HorusecParser
from .govulncheck import GovulncheckParser
from .gosec import GosecParser
from .eslint import ESLintParser
from .brakeman import BrakemanParser
from .burp import BurpParser
from .nuclei import NucleiParser
from .wapiti import WapitiParser
from .wpscan import WpscanParser
from .zap import ZapParser
from .yarn_audit import YarnAuditParser
from .snyk import SnykParser
from .retirejs import RetireJsParser
from .osv_scanner import OSVScannerParser
from .npm_audit import NpmAuditParser
from .dependency_track import DependencyTrackParser
from .dependency_check import DependencyCheckParser
from .cyclonedx import CycloneDXParser
from .cargo_audit import CargoAuditParser
from .bundler_audit import BundlerAuditParser
from .auditjs import AuditJSParser
from .pip_audit import PipAuditParser
from .pingcastle import PingCastleParser
from .wazuh import WazuhParser
from .ssl_labs import SslLabsParser
from .ssh_audit import SSHAuditParser
from .openvas import OpenVASParser
from .wiz import WizParser
from .twistlock import TwistlockParser
from .tfsec import TFSecParser
from .trivy import TrivyParser
from .terrascan import TerrascanParser
from .scout_suite import ScoutSuiteParser
from .prowler import ProwlerParser
from .neuvector import NeuVectorParser
from .kubescape import KubescapeParser
from .kubebench import KubeBenchParser
from .kics import KICSParser
from .harbor import HarborParser
from .hadolint import HadolintParser
from .dockle import DockleParser
from .dockerbench import DockerBenchParser
from .clair import ClairParser
from .checkov import CheckovParser
from .trufflehog3 import TruffleHog3Parser
from .trufflehog import TruffleHogParser
from .mobsf import MobSFParser
from .gitleaks import GitleaksParser
from .detect_secrets import DetectSecretsParser

# Register all your tool parsers here!
AVAILABLE_PARSERS = [
    NmapParser(),
    NiktoParser(),
    SemgrepParser(),
    ArachniParser(),
    BanditParser(),
    BearerCLIParser(),
    VCGParser(),
    SpotbugsParser(),
    SarifParser(),
    RubocopParser(),
    PmdParser(),
    HorusecParser(),
    GovulncheckParser(),
    GosecParser(),
    ESLintParser(),
    BrakemanParser(),
    BurpParser(),
    NucleiParser(),
    WapitiParser(),
    WpscanParser(),
    ZapParser(),
    YarnAuditParser(),
    SnykParser(),
    RetireJsParser(),
    OSVScannerParser(),
    NpmAuditParser(),
    DependencyTrackParser(),
    DependencyCheckParser(),
    CycloneDXParser(),
    CargoAuditParser(),
    BundlerAuditParser(),
    AuditJSParser(),
    PipAuditParser(),
    PingCastleParser(),
    WazuhParser(),
    SslLabsParser(),
    SSHAuditParser(),
    OpenVASParser(),
    WizParser(),
    TwistlockParser(),
    TFSecParser(),
    TrivyParser(),
    TerrascanParser(),
    ScoutSuiteParser(),
    ProwlerParser(),
    NeuVectorParser(),
    KubescapeParser(),
    KubeBenchParser(),
    KICSParser(),
    HarborParser(),
    HadolintParser(),
    DockleParser(),
    DockerBenchParser(),
    ClairParser(),
    CheckovParser(),
    TruffleHog3Parser(),
    TruffleHogParser(),
    MobSFParser(),
    GitleaksParser(),
    DetectSecretsParser(),
]


def route_and_parse(file_content: str) -> dict:
    """
    Loops through all available parsers.
    If a parser detects its specific format, it executes and returns the data.
    """
    for parser in AVAILABLE_PARSERS:
        if parser.detect(file_content):
            return parser.parse(file_content)

    # If we loop through every parser and none of them recognize the file:
    raise ValueError("Unrecognized tool format. No suitable parser found.")