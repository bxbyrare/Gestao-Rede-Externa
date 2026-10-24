"""
Runtime stdlib security hardening for CPython 3.13.x CVEs.
Mitigates in-process:
- CVE-2026-0864 (configparser carriage return injection in write())
- CVE-2026-11940 / CVE-2026-4360 / CVE-2026-7774 / CVE-2026-82049 / CVE-2026-87910 (tarfile strict extraction filter without symlinks/hardlinks)
- CVE-2026-15806 (HTTPPasswordMgr strict scheme verification)
- CVE-2026-6019 (http.cookies.BaseCookie.js_output control character neutralization)
- CVE-2026-4786 (webbrowser.open disabled in server context)
- CVE-2026-8328 (ftplib PASV SSRF mitigation: ignore server-supplied PASV host address)
"""

import configparser
import ftplib
import http.cookies
import tarfile
import urllib.request
import webbrowser


def apply_stdlib_security_patches() -> None:
    # 1. CVE-2026-0864: Sanitize \r in configparser write()
    _orig_write_section = getattr(configparser.RawConfigParser, "_write_section", None)
    if _orig_write_section and not getattr(configparser.RawConfigParser, "_cve_2026_0864_patched", False):
        def _safe_write_section(self, fp, section_name, section_items, delimiter):
            if "\r" in str(section_name) or "\n" in str(section_name):
                raise ValueError("Invalid CR/LF in configparser section name")
            cleaned_items = []
            for key, value in section_items:
                if "\r" in str(key) or "\n" in str(key):
                    raise ValueError("Invalid CR/LF in configparser key")
                if value is not None:
                    value = str(value).replace("\r\n", "\n").replace("\r", "\n")
                cleaned_items.append((key, value))
            return _orig_write_section(self, fp, section_name, cleaned_items, delimiter)

        configparser.RawConfigParser._write_section = _safe_write_section
        configparser.RawConfigParser._cve_2026_0864_patched = True

    # 2. CVE-2026-11940 / 4360 / 7774 / 82049 / 87910: Strict tarfile extraction filter rejecting links & traversal
    if hasattr(tarfile, "data_filter"):
        def _strict_no_link_filter(member, dest_path):
            filtered = tarfile.data_filter(member, dest_path)
            if filtered is None or filtered.issym() or filtered.islnk():
                raise tarfile.FilterError("Symbolic and hard links are disallowed by security policy")
            return filtered

        tarfile.TarFile.extraction_filter = staticmethod(_strict_no_link_filter)

    # 3. CVE-2026-6019: Escape embedded control/script characters in BaseCookie.js_output
    _orig_js_output = getattr(http.cookies.BaseCookie, "js_output", None)
    if _orig_js_output and not getattr(http.cookies.BaseCookie, "_cve_2026_6019_patched", False):
        def _safe_js_output(self, attrs=None):
            raw = _orig_js_output(self, attrs=attrs)
            return raw.replace("\r", "\\r").replace("\n", "\\n").replace("</", "<\\/")

        http.cookies.BaseCookie.js_output = _safe_js_output
        http.cookies.BaseCookie._cve_2026_6019_patched = True

    # 4. CVE-2026-15806: Prevent HTTPPasswordMgr from sending HTTPS credentials over plain HTTP
    _orig_find_user_password = getattr(urllib.request.HTTPPasswordMgr, "find_user_password", None)
    if _orig_find_user_password and not getattr(urllib.request.HTTPPasswordMgr, "_cve_2026_15806_patched", False):
        def _safe_find_user_password(self, realm, authuri):
            if isinstance(authuri, str) and authuri.lower().startswith("http://"):
                return None, None
            return _orig_find_user_password(self, realm, authuri)

        urllib.request.HTTPPasswordMgr.find_user_password = _safe_find_user_password
        urllib.request.HTTPPasswordMgr._cve_2026_15806_patched = True

    # 5. CVE-2026-8328: Prevent FTP PASV SSRF by never trusting server-supplied PASV IP
    ftplib.FTP.trust_server_pasv_ipv4_address = False

    # 6. CVE-2026-4786: Block webbrowser.open on headless server runtime
    def _blocked_webbrowser_open(*_args, **_kwargs):
        return False

    webbrowser.open = _blocked_webbrowser_open
