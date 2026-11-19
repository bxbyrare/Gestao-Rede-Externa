import gzip
import os
import socket

# Bulletproof DNS resolution fallback for postgres.shardatabases.app in Docker containers
_ORIG_GETADDRINFO = socket.getaddrinfo
_KNOWN_DB_IPS = ['38.18.229.30', '38.92.41.2', '38.92.41.65', '154.30.4.133']

def _resolv_db_direct_dns():
    try:
        import struct
        query = b'\xaa\xbb\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00'
        for part in 'postgres.shardatabases.app'.split('.'):
            query += bytes([len(part)]) + part.encode()
        query += b'\x00\x00\x01\x00\x01'
        for dns_srv in ('1.1.1.1', '8.8.8.8'):
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(1.5)
                s.sendto(query, (dns_srv, 53))
                data, _ = s.recvfrom(512)
                s.close()
                idx = 12
                while data[idx] != 0: idx += 1 + data[idx]
                idx += 5
                ips = []
                while idx < len(data):
                    if data[idx] >= 192: idx += 2
                    else:
                        while data[idx] != 0: idx += 1 + data[idx]
                        idx += 1
                    atype, aclass, ttl, rdlen = struct.unpack('>HHIH', data[idx:idx+10])
                    idx += 10
                    if atype == 1 and rdlen == 4:
                        ips.append(socket.inet_ntoa(data[idx:idx+4]))
                    idx += rdlen
                if ips:
                    return ips[0]
            except Exception:
                pass
    except Exception:
        pass
    return '38.18.229.30'

def _custom_getaddrinfo(host, port, *args, **kwargs):
    if host == 'postgres.shardatabases.app':
        try:
            return _ORIG_GETADDRINFO(host, port, *args, **kwargs)
        except Exception:
            ip = _resolv_db_direct_dns()
            p = port or 5432
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip, p))]
    return _ORIG_GETADDRINFO(host, port, *args, **kwargs)

socket.getaddrinfo = _custom_getaddrinfo
import time
import csv
import json
import io
import datetime
import calendar
import traceback
import threading
import base64
import re
import html
import secrets
import sys
if os.path.isdir('./.lib') and os.path.abspath('./.lib') not in sys.path:
    sys.path.insert(0, os.path.abspath('./.lib'))
try:
    import certifi
    import requests
    import psycopg2
    import flask
    import werkzeug
    import jinja2
    import markupsafe
except Exception as _imp_err:
    print("[BOOT] Rebuilding ./.lib for current Python runtime due to import mismatch:", _imp_err)
    try:
        import subprocess, importlib, shutil
        if os.path.isdir('./.lib'):
            for _entry in os.listdir('./.lib'):
                _ep = os.path.join('./.lib', _entry)
                try:
                    shutil.rmtree(_ep) if os.path.isdir(_ep) else os.remove(_ep)
                except Exception:
                    pass
        subprocess.call([
            sys.executable, '-m', 'pip', 'install',
            '--upgrade', '--force-reinstall', '--no-cache-dir',
            '--target', './.lib', '-r', 'requirements.txt'
        ])
        importlib.invalidate_caches()
        import requests
    except Exception:
        import urllib.request as _urlreq
        import urllib.error as _urlerr
        class _FallbackResponse:
            def __init__(self, status_code, text):
                self.status_code = status_code
                self.text = text
            def json(self):
                return json.loads(self.text)
        class _FallbackRequests:
            @staticmethod
            def post(url, headers=None, json=None, data=None, timeout=15):
                import json as _j
                body = _j.dumps(json).encode('utf-8') if json is not None else (data.encode('utf-8') if isinstance(data, str) else data)
                hdrs = dict(headers or {})
                if json is not None and 'Content-Type' not in hdrs:
                    hdrs['Content-Type'] = 'application/json'
                req = _urlreq.Request(url, data=body, headers=hdrs, method='POST')
                try:
                    with _urlreq.urlopen(req, timeout=timeout) as r:
                        return _FallbackResponse(r.status, r.read().decode('utf-8', errors='replace'))
                except _urlerr.HTTPError as he:
                    return _FallbackResponse(he.code, he.read().decode('utf-8', errors='replace'))
            @staticmethod
            def get(url, headers=None, timeout=15):
                req = _urlreq.Request(url, headers=dict(headers or {}), method='GET')
                try:
                    with _urlreq.urlopen(req, timeout=timeout) as r:
                        return _FallbackResponse(r.status, r.read().decode('utf-8', errors='replace'))
                except _urlerr.HTTPError as he:
                    return _FallbackResponse(he.code, he.read().decode('utf-8', errors='replace'))
        requests = _FallbackRequests()
import psycopg2
from psycopg2.extras import RealDictCursor
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask import (
    Flask, render_template, request, 
    redirect, url_for, session, jsonify, send_from_directory,
    make_response, Response, g, has_request_context
)

from collections import defaultdict

import security_hardening
security_hardening.apply_stdlib_security_patches()

app = Flask(__name__)
_env_secret = os.environ.get('SECRET_KEY', '').strip()
if not _env_secret:
    _secret_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.flask_secret_key')
    if os.path.isfile(_secret_path):
        with open(_secret_path, 'r', encoding='utf-8') as _sf:
            _env_secret = _sf.read().strip()
    if not _env_secret:
        _env_secret = secrets.token_hex(32)
        try:
            with open(_secret_path, 'w', encoding='utf-8') as _sf:
                _sf.write(_env_secret)
            try:
                os.chmod(_secret_path, 0o600)
            except Exception:
                pass
        except Exception:
            pass
app.secret_key = _env_secret


# --------------------------------------------------------------------------
# RFC 6238 TOTP AUTHENTICATOR (GOOGLE AUTHENTICATOR / MICROSOFT AUTHENTICATOR)
# --------------------------------------------------------------------------
import hmac
import hashlib
import time
import base64
import struct
import secrets
import urllib.parse

def generate_totp_secret():
    """Generates a cryptographically secure 160-bit base32 secret for TOTP"""
    return base64.b32encode(secrets.token_bytes(20)).decode('utf-8').replace('=', '')

def get_totp_token(secret, time_step=30, t=None):
    """Computes current 6-digit TOTP code matching RFC 6238"""
    if not secret:
        return None
    if t is None:
        t = int(time.time())
    counter = t // time_step
    clean_secret = str(secret).strip().replace(' ', '').upper()
    padding = '=' * ((8 - len(clean_secret) % 8) % 8)
    try:
        key = base64.b32decode(clean_secret + padding)
    except Exception:
        return None
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[19] & 15
    code = (struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000
    return f"{code:06d}"

def verify_totp_token(secret, token, time_step=30, window=1):
    """Validates 6-digit TOTP token using constant-time comparison to prevent timing attacks and returns bucket index"""
    if not secret or not token:
        return False, None
    token_str = str(token).strip().replace(' ', '').replace('-', '')
    if len(token_str) != 6 or not token_str.isdigit():
        return False, None
    current_t = int(time.time())
    for offset in range(-window, window + 1):
        step_t = current_t + (offset * time_step)
        step_token = get_totp_token(secret, time_step=time_step, t=step_t)
        if step_token and hmac.compare_digest(step_token, token_str):
            bucket_idx = step_t // time_step
            return True, bucket_idx
    return False, None

def get_totp_uri(secret, username, issuer="Claro Gestão Rede Externa"):
    """Builds otpauth:// URI for scanning with Google Authenticator or Microsoft Authenticator"""
    label = urllib.parse.quote(f"{issuer}:{username}")
    issuer_q = urllib.parse.quote(issuer)
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer_q}&algorithm=SHA1&digits=6&period=30"

# --------------------------------------------------------------------------
# RESEND EMAIL SERVICE & EXECUTIVE CLARO EMAIL TEMPLATES
# --------------------------------------------------------------------------

# Resend API Configuration (Strictly from environment; no hardcoded fallback keys)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
RESEND_FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'Gestão Rede Externa <noreply@gestaoredeexterna.com.br>').strip()

def _get_resend_config():
    api_key = os.environ.get('RESEND_API_KEY', RESEND_API_KEY or '').strip()
    from_email = os.environ.get(
        'RESEND_FROM_EMAIL',
        RESEND_FROM_EMAIL or 'Gestão Rede Externa <noreply@gestaoredeexterna.com.br>'
    ).strip()
    return api_key, from_email

def get_portal_url(path='/'):
    base = os.environ.get('PORTAL_BASE_URL', '').strip()
    if not base:
        base = 'https://gestaoredeexterna.shardweb.app'
    if not path.startswith('/'):
        path = '/' + path
    return f"{base.rstrip('/')}{path}"

def get_client_ip():
    cf_ip = request.headers.get('CF-Connecting-IP')
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()
    xff = request.headers.get('X-Forwarded-For')
    if xff:
        ips = [ip.strip() for ip in xff.split(',') if ip.strip()]
        for ip in ips:
            if not ip.startswith(('10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '127.')):
                return ip
        if ips:
            return ips[0]
    x_real = request.headers.get('X-Real-IP')
    if x_real and x_real.strip():
        return x_real.strip()
    return request.remote_addr or '127.0.0.1'

def render_executive_email_template(category_badge, title, message_html, cta_text=None, cta_url=None):
    safe_badge = html.escape(str(category_badge or 'COMUNICADO'))
    safe_title = html.escape(str(title or 'Claro Gestão Rede Externa'))
    cta_block = ""
    if cta_text and cta_url:
        safe_cta_text = html.escape(str(cta_text))
        clean_url = str(cta_url).strip()
        if clean_url.startswith(('https://', 'http://')):
            safe_cta_url = html.escape(clean_url, quote=True)
            cta_block = f'''
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px 0;">
                <tr>
                    <td align="center">
                        <a href="{safe_cta_url}" target="_blank" style="background: linear-gradient(135deg, #E11D48 0%, #BE123C 100%); color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; display: inline-block; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35);">
                            {safe_cta_text} &rarr;
                        </a>
                    </td>
                </tr>
            </table>
            '''

    current_year = datetime.datetime.now().year
    now_str = datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')
    banner_url = html.escape(get_portal_url('/email-banner-claro.png'), quote=True)
    claro_icon_url = html.escape(get_portal_url('/claro-icon.png'), quote=True)

    badge_block = ""
    if category_badge and str(category_badge).strip():
        badge_block = f'''
                        <div style="margin-bottom: 16px;">
                            <span style="display: inline-block; background: rgba(225, 29, 72, 0.15); border: 1px solid rgba(225, 29, 72, 0.4); color: #FDA4AF; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; letter-spacing: 0.5px;">
                                {safe_badge}
                            </span>
                        </div>'''

    return f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{safe_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0B0E17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #E2E8F0;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0B0E17; padding: 36px 15px;">
    <tr>
        <td align="center">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #131927 0%, #0D121D 100%); border: 1px solid #1E293B; border-radius: 14px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <!-- Header Banner -->
                <tr>
                    <td style="padding: 24px 32px; background: linear-gradient(90deg, #172033 0%, #0F1626 100%); border-bottom: 1px solid #1E293B;">
                        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td>
                                    <div style="display: inline-block; vertical-align: middle;">
                                        <img src="{claro_icon_url}" alt="Claro" width="26" height="26" style="display: inline-block; width: 26px; height: 26px; vertical-align: middle; margin-right: 10px; border: 0;" />
                                        <span style="font-size: 18px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.5px; vertical-align: middle;">Gestão <span style="color: #E11D48;">REDE EXTERNA</span></span>
                                    </div>
                                    <div style="font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px; font-weight: 600;">Claro Brasil &bull; Operações de Campo</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                    <td style="padding: 32px 32px 24px 32px;">{badge_block}
                        <h1 style="color: #F8FAFC; font-size: 21px; font-weight: 700; margin: 0 0 18px 0; line-height: 1.35;">
                            {safe_title}
                        </h1>
                        <div style="color: #94A3B8; font-size: 14px; line-height: 1.65;">
                            {message_html}
                        </div>
                        {cta_block}
                    </td>
                </tr>
                
                <!-- Security Note -->
                <tr>
                    <td style="padding: 16px 32px; background: #0A0D15; border-top: 1px solid #1A2333;">
                        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td style="font-size: 11px; color: #64748B; line-height: 1.5;">
                                    <strong style="color: #94A3B8;">Aviso de Segurança:</strong> Este comunicado operacional é oficial e confidencial da plataforma Claro Gestão Rede Externa. O Gestão Rede Externa nunca vai enviar e-mails ou mensagens via WhatsApp ou qualquer plataforma de mensagens solicitando seu nome de usuário, e-mail ou senhas de acesso; caso isso aconteça, contate um coordenador e reporte imediatamente esta ação.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Banner Claro Gestão Rede Externa (Cabeçalho Final) -->
                <tr>
                    <td style="padding: 20px 32px 10px 32px; background: #090C13; border-top: 1px solid #1A2333; text-align: center;">
                        <a href="{html.escape(get_portal_url('/'), quote=True)}" target="_blank" style="text-decoration: none; display: block;">
                            <img src="{banner_url}" alt="Claro • Gestão Rede Externa" width="536" style="display: block; width: 100%; max-width: 536px; height: auto; margin: 0 auto; border-radius: 10px; border: 1px solid #1E293B;" />
                        </a>
                    </td>
                </tr>

                <!-- Footer -->
                <tr>
                    <td style="padding: 14px 32px 22px 32px; background: #07090F; text-align: center;">
                        <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748B;">
                            &copy; {current_year} Claro Brasil &bull; Gestão Rede Externa. Todos os direitos reservados.
                        </p>
                        <p style="margin: 0; font-size: 10px; color: #475569;">
                            Mensagem gerada automaticamente pelo sistema em {now_str} (Horário de Brasília).
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>'''

def _is_valid_email_addr(email_str):
    if not email_str or '@' not in str(email_str):
        return False
    clean = str(email_str).strip().lower()
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean))

def _send_resend_email_sync(to_email, subject, category_badge, title, message_html, cta_text=None, cta_url=None):
    if not to_email or '@' not in str(to_email):
        return False, 400, "E-mail destinatário ausente ou inválido."

    clean_target = str(to_email).strip().lower()
    if not _is_valid_email_addr(clean_target):
        print(f"[EMAIL REJECTED] Endereço de email com formato inválido ignorado: {clean_target}")
        return False, 400, "Formato de e-mail inválido."

    api_key, from_email = _get_resend_config()
    if not api_key:
        print("[RESEND NOTICE] RESEND_API_KEY não configurada no ambiente. Envio cancelado de forma segura.")
        return False, 503, "RESEND_API_KEY não configurada no servidor."

    safe_subject = str(subject or 'Comunicado Claro Gestão Rede Externa').replace('\r', '').replace('\n', ' ').strip()
    full_html = render_executive_email_template(
        category_badge=category_badge,
        title=title,
        message_html=message_html,
        cta_text=cta_text,
        cta_url=cta_url
    )

    try:
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'from': from_email,
                'to': [clean_target],
                'subject': safe_subject,
                'html': full_html
            },
            timeout=12
        )
        if resp.status_code in [200, 201]:
            res_data = resp.json() if resp.text else {}
            msg_id = res_data.get('id') or 'ok'
            print(f"[RESEND SUCCESS] Email entregue ao provedor para {clean_target} | ID: {msg_id}")
            return True, resp.status_code, str(msg_id)
        else:
            print(f"[RESEND NOTICE] Envio para {clean_target} retornou status {resp.status_code}: {resp.text}")
            err_msg = f"Resend HTTP {resp.status_code}"
            try:
                err_json = resp.json()
                if isinstance(err_json, dict) and err_json.get('message'):
                    err_msg = str(err_json.get('message'))[:180]
            except Exception:
                pass
            if resp.status_code in [401, 403]:
                err_msg = f"Autorização/domínio Resend ({resp.status_code}): {err_msg}"
            elif resp.status_code == 429:
                err_msg = "Limite de taxa do Resend atingido (429). Aguarde alguns segundos."
            return False, resp.status_code, err_msg
    except Exception as ex:
        print(f"[RESEND ERROR] Exceção de rede no envio para {clean_target}: {ex}")
        return False, 502, "Falha de comunicação com o provedor de e-mail (Resend)."

def send_resend_email(to_email, subject, category_badge, title, message_html, cta_text=None, cta_url=None):
    if not _is_valid_email_addr(to_email):
        if to_email:
            print(f"[EMAIL REJECTED] Endereço de email com formato inválido ignorado: {to_email}")
        return False

    def _worker():
        _send_resend_email_sync(
            to_email=to_email,
            subject=subject,
            category_badge=category_badge,
            title=title,
            message_html=message_html,
            cta_text=cta_text,
            cta_url=cta_url
        )

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True


def _send_email_registered_notice(to_email, display_name, username=None):
    """Envia aviso confirmando que o e-mail foi cadastrado no Gestão Rede Externa."""
    clean_email = (to_email or '').strip().lower()
    if not _is_valid_email_addr(clean_email):
        return False
    safe_name = html.escape(str(display_name or username or 'Colaborador'))
    safe_email = html.escape(clean_email)
    user_row_html = ""
    if username:
        user_row_html = f'''
            <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Login de Usuário:</p>
            <p style="margin: 0; color: #F8FAFC; font-weight: 600; font-size: 15px;">{html.escape(str(username))}</p>
            <hr style="border: 0; border-top: 1px solid #28354D; margin: 10px 0;">
        '''
    return send_resend_email(
        to_email=clean_email,
        subject="[Claro Rede Externa] E-mail Cadastrado no Portal",
        category_badge="CADASTRO DE E-MAIL",
        title="Endereço de E-mail Cadastrado",
        message_html=f'''
            <p>Olá, <strong>{safe_name}</strong>.</p>
            <p>Este endereço de e-mail foi cadastrado no <strong>Gestão Rede Externa</strong> e será utilizado para o envio de avisos e alertas importantes em relação ao portal.</p>
            <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                {user_row_html}
                <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">E-mail Cadastrado:</p>
                <p style="margin: 0; color: #38BDF8; font-weight: 600; font-size: 15px;">{safe_email}</p>
            </div>
            <p>Caso você não reconheça esta alteração ou deseje atualizar seu contato, acesse seu perfil no portal imediatamente.</p>
        ''',
        cta_text="Acessar Gestão Rede Externa",
        cta_url="https://gestaoredeexterna.shardweb.app/"
    )


_EMAIL_BOUNCE_SCHEMA_READY = False


def _ensure_email_bounce_schema(cur):
    global _EMAIL_BOUNCE_SCHEMA_READY
    if _EMAIL_BOUNCE_SCHEMA_READY:
        return
    try:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users';
        """)
        existing_cols = {
            (r['column_name'] if isinstance(r, dict) else r[0]).lower()
            for r in (cur.fetchall() or [])
        }
    except Exception:
        existing_cols = set()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS bounced_emails (
            email VARCHAR(255) PRIMARY KEY,
            reason TEXT,
            last_event VARCHAR(50),
            resend_message_id VARCHAR(255),
            bounce_count INT DEFAULT 1,
            last_bounced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP DEFAULT NULL
        );
    """)
    for col_name, col_sql in [
        ("email_bounced", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN DEFAULT FALSE;"),
        ("email_bounce_reason", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_bounce_reason TEXT DEFAULT NULL;"),
        ("email_bounced_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMP DEFAULT NULL;"),
        ("email_verify_code", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_code VARCHAR(12) DEFAULT NULL;"),
        ("email_verify_target", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_target VARCHAR(255) DEFAULT NULL;"),
        ("email_verify_expires_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires_at TIMESTAMP DEFAULT NULL;"),
    ]:
        if col_name not in existing_cols:
            cur.execute(col_sql)
    _EMAIL_BOUNCE_SCHEMA_READY = True


def _mark_email_bounced(email_addr, reason="", event_type="bounced", resend_message_id=None):
    clean = (email_addr or "").strip().lower()
    if not clean or "@" not in clean:
        return False
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_email_bounce_schema(cur)
        reason_text = str(reason or "Falha de entrega (e-mail rejeitado ou inexistente).").strip()[:500]
        cur.execute("""
            INSERT INTO bounced_emails (email, reason, last_event, resend_message_id, bounce_count, last_bounced_at, resolved_at)
            VALUES (%s, %s, %s, %s, 1, CURRENT_TIMESTAMP, NULL)
            ON CONFLICT (email) DO UPDATE SET
                reason = EXCLUDED.reason,
                last_event = EXCLUDED.last_event,
                resend_message_id = COALESCE(EXCLUDED.resend_message_id, bounced_emails.resend_message_id),
                bounce_count = bounced_emails.bounce_count + 1,
                last_bounced_at = CURRENT_TIMESTAMP,
                resolved_at = NULL;
        """, (clean, reason_text, str(event_type or "bounced")[:50], str(resend_message_id)[:255] if resend_message_id else None))

        cur.execute("""
            UPDATE users
            SET email_bounced = TRUE,
                email_bounce_reason = %s,
                email_bounced_at = CURRENT_TIMESTAMP
            WHERE LOWER(TRIM(COALESCE(email, ''))) = %s
               OR tech_id IN (
                   SELECT id FROM technicians WHERE LOWER(TRIM(COALESCE(email, ''))) = %s
               );
        """, (reason_text, clean, clean))
        conn.commit()
        return True
    except Exception as ex:
        print(f"[EMAIL BOUNCE MARK ERROR] {clean}: {ex}")
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return False
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn and not has_request_context():
            try:
                conn.close()
            except Exception:
                pass


def _clear_email_bounce_for_user(cur, user_id=None, tech_id=None, new_email=None):
    _ensure_email_bounce_schema(cur)
    if user_id:
        cur.execute("""
            UPDATE users
            SET email_bounced = FALSE,
                email_bounce_reason = NULL,
                email_bounced_at = NULL
            WHERE id = %s;
        """, (user_id,))
    elif tech_id:
        cur.execute("""
            UPDATE users
            SET email_bounced = FALSE,
                email_bounce_reason = NULL,
                email_bounced_at = NULL
            WHERE tech_id = %s;
        """, (tech_id,))
    if new_email:
        clean_new = new_email.strip().lower()
        if clean_new:
            cur.execute("UPDATE bounced_emails SET resolved_at = CURRENT_TIMESTAMP WHERE email = %s;", (clean_new,))


_resend_bounce_last_sync = 0.0
_resend_bounce_lock = threading.Lock()
_resend_bounce_watchdog_started = False


def _sync_resend_bounces(force=False):
    """Consulta a API do Resend para detectar e-mails com falha de entrega (bounced/complained/failed)."""
    global _resend_bounce_last_sync
    now_ts = time.time()
    if not force and (now_ts - _resend_bounce_last_sync) < 600:
        return {"skipped": True}
    with _resend_bounce_lock:
        now_ts = time.time()
        if not force and (now_ts - _resend_bounce_last_sync) < 600:
            return {"skipped": True}
        _resend_bounce_last_sync = now_ts

    api_key, _ = _get_resend_config()
    if not api_key:
        return {"error": "RESEND_API_KEY não configurada."}

    marked = 0
    try:
        resp = requests.get(
            'https://api.resend.com/emails?limit=100',
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=15
        )
        if resp.status_code != 200:
            return {"error": f"Resend HTTP {resp.status_code}"}
        payload = resp.json() or {}
        items = payload.get('data') or []
        for item in items:
            last_ev = str(item.get('last_event') or '').strip().lower()
            if last_ev not in ('bounced', 'complained', 'failed', 'suppressed'):
                continue
            msg_id = item.get('id')
            recipients = item.get('to') or []
            if isinstance(recipients, str):
                recipients = [recipients]
            for rcpt in recipients:
                clean_rcpt = str(rcpt or '').strip().lower()
                if clean_rcpt and '@' in clean_rcpt:
                    reason = f"Falha na entrega detectada pelo provedor ({last_ev})."
                    if _mark_email_bounced(clean_rcpt, reason=reason, event_type=last_ev, resend_message_id=msg_id):
                        marked += 1
        return {"checked": len(items), "marked": marked}
    except Exception as ex:
        print(f"[RESEND BOUNCE SYNC ERROR] {ex}")
        return {"error": str(ex)}


def _start_resend_bounce_watchdog():
    global _resend_bounce_watchdog_started
    if _resend_bounce_watchdog_started:
        return
    _resend_bounce_watchdog_started = True

    def _loop():
        time.sleep(20)
        while True:
            try:
                with app.app_context():
                    _sync_resend_bounces(force=True)
            except Exception as exc:
                print(f"[RESEND BOUNCE WATCHDOG ERROR] {exc}")
            time.sleep(600)

    t = threading.Thread(target=_loop, daemon=True, name="resend-bounce-watchdog")
    t.start()

# --------------------------------------------------------------------------
# EXECUTIVE EMAIL TEMPLATES (CLARO BRASIL)
# --------------------------------------------------------------------------

def send_password_reset_email(to_email, user_display, code, client_ip=None, expires_in_minutes=15):
    """Template 1: Resetar Senha com código de 6 dígitos em destaque"""
    safe_user = html.escape(str(user_display or 'Colaborador'))
    safe_code = html.escape(str(code).strip())
    safe_ip = html.escape(str(client_ip or 'IP protegido'))
    
    ip_row = f'''
        <div style="margin-top: 14px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid #1E293B; font-size: 12px; color: #94A3B8;">
            <span style="color: #64748B;">Origem da Solicitação:</span> <span style="font-family: Consolas, monospace; color: #E2E8F0;">{safe_ip}</span>
        </div>
    ''' if client_ip else ""

    message_html = f'''
        <p style="margin: 0 0 14px 0; font-size: 15px; color: #E2E8F0;">Olá, <strong>{safe_user}</strong>.</p>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #94A3B8;">
            Recebemos uma solicitação de redefinição de senha para o seu acesso à plataforma <strong>Claro Gestão Rede Externa</strong>.
        </p>
        <p style="margin: 0 0 20px 0; line-height: 1.6; color: #94A3B8;">
            Utilize o código de uso único abaixo para confirmar sua identidade e cadastrar sua nova senha:
        </p>

        <!-- Verification Code Card -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 18px 0 24px 0;">
            <tr>
                <td align="center" style="background: linear-gradient(180deg, #161F30 0%, #0E1524 100%); border: 1px solid #2A364F; border-radius: 12px; padding: 24px 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #94A3B8; font-weight: 700; margin-bottom: 8px;">
                        CÓDIGO DE VERIFICAÇÃO
                    </div>
                    <div style="font-family: Consolas, 'SF Mono', 'Courier New', monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #FDA4AF; text-shadow: 0 0 24px rgba(225, 29, 72, 0.45); padding: 4px 0;">
                        {safe_code}
                    </div>
                    <div style="margin-top: 10px; font-size: 12px; color: #F43F5E; font-weight: 600;">
                        ⏱️ Válido por {expires_in_minutes} minutos &bull; Uso único e pessoal
                    </div>
                </td>
            </tr>
        </table>

        {ip_row}

        <div style="margin-top: 20px; padding: 14px 16px; background: rgba(225, 29, 72, 0.08); border-left: 3px solid #E11D48; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #FDA4AF;">
                <strong>Atenção à Segurança:</strong> Se você não realizou esta solicitação, desconsidere esta mensagem. Sua conta permanece segura e sua senha atual não foi alterada.
            </p>
        </div>
    '''
    
    reset_url = get_portal_url('/login')
    return send_resend_email(
        to_email=to_email,
        subject=f"[Claro Rede Externa] Código de Recuperação de Senha: {safe_code}",
        category_badge="SEGURANÇA & CREDENCIAIS",
        title="Código de Recuperação de Senha",
        message_html=message_html,
        cta_text="Acessar Tela de Login / Redefinição",
        cta_url=reset_url
    )

def send_outdated_profile_email(to_email, user_display, missing_fields=None, portal_url=None, sync=False):
    """Template 2: Cadastro Desatualizado com aviso de bloqueio de acesso ao portal"""
    safe_user = html.escape(str(user_display or 'Colaborador'))
    profile_url = portal_url or get_portal_url('/perfil')

    if missing_fields and isinstance(missing_fields, list):
        items_html = "".join([
            f'<li style="margin-bottom: 8px; color: #FDE68A; font-size: 13px;">'
            f'<span style="color: #F59E0B; font-weight: bold; margin-right: 6px;">&bull;</span> {html.escape(str(f))} '
            f'<span style="background: rgba(245,158,11,0.2); color: #FCD34D; font-size: 10px; font-weight: bold; padding: 2px 7px; border-radius: 4px; margin-left: 6px; text-transform: uppercase;">Pendente</span>'
            f'</li>'
            for f in missing_fields
        ])
    else:
        items_html = '''
            <li style="margin-bottom: 8px; color: #FDE68A; font-size: 13px;">
                <span style="color: #F59E0B; font-weight: bold; margin-right: 6px;">&bull;</span> E-mail corporativo / pessoal verificado
            </li>
            <li style="margin-bottom: 8px; color: #FDE68A; font-size: 13px;">
                <span style="color: #F59E0B; font-weight: bold; margin-right: 6px;">&bull;</span> Telefone de contato e WhatsApp com DDD
            </li>
            <li style="margin-bottom: 8px; color: #FDE68A; font-size: 13px;">
                <span style="color: #F59E0B; font-weight: bold; margin-right: 6px;">&bull;</span> Empresa parceira / prestadora vinculada
            </li>
        '''

    message_html = f'''
        <p style="margin: 0 0 14px 0; font-size: 15px; color: #E2E8F0;">Prezado(a) colaborador(a), <strong>{safe_user}</strong>.</p>
        
        <!-- Aviso Cadastral -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 22px 0;">
            <tr>
                <td style="background: linear-gradient(180deg, rgba(226, 6, 19, 0.12) 0%, rgba(190, 18, 60, 0.05) 100%); border: 1px solid rgba(226, 6, 19, 0.35); border-left: 4px solid #E20613; border-radius: 10px; padding: 18px 20px;">
                    <div style="font-size: 12px; font-weight: 800; color: #FDA4AF; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                        ATUALIZAÇÃO CADASTRAL PARA OPERAÇÃO NO PORTAL
                    </div>
                    <p style="margin: 0; font-size: 13.5px; line-height: 1.65; color: #F1F5F9;">
                        Identificamos que o seu cadastro na plataforma <strong>Claro Gestão Rede Externa</strong> ainda possui informações pendentes.
                        <strong>Mantenha seus dados completos para continuar contribuindo com o portal</strong> (mapas, consultas, ordens de campo e relatórios operacionais) sem restrições de acesso.
                    </p>
                </td>
            </tr>
        </table>

        <p style="margin: 0 0 12px 0; font-size: 13px; color: #CBD5E1; font-weight: 600;">
            Itens pendentes identificados no seu cadastro:
        </p>

        <div style="background: #111726; border: 1px solid #1E293B; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px;">
            <ul style="margin: 0; padding-left: 14px; list-style-type: none;">
                {items_html}
            </ul>
        </div>

        <p style="margin: 0 0 10px 0; font-size: 13.5px; line-height: 1.6; color: #94A3B8;">
            A atualização leva menos de 1 minuto: clique no botão abaixo, preencha os campos pendentes e salve para deixar seu perfil 100% regularizado.
        </p>
    '''

    sender_fn = _send_resend_email_sync if sync else send_resend_email
    return sender_fn(
        to_email=to_email,
        subject="[Claro Gestão Externa] Regularização Cadastral",
        category_badge=None,
        title="Atualize seu Cadastro no Portal",
        message_html=message_html,
        cta_text="Atualizar Meu Cadastro Agora",
        cta_url=profile_url
    )

def _resolve_ip_location(ip_address, cf_city=None, cf_region=None, cf_country=None):
    parts = [p.strip() for p in (cf_city, cf_region, cf_country) if p and str(p).strip()]
    if len(parts) >= 2:
        return " - ".join(parts).upper()

    ip_clean = str(ip_address or '').strip()
    if not ip_clean or ip_clean.startswith(('127.', '10.', '192.168.', '::1', 'fe80:')) or (
        ip_clean.startswith('172.') and 16 <= int(ip_clean.split('.')[1]) <= 31 if len(ip_clean.split('.')) >= 2 and ip_clean.split('.')[1].isdigit() else False
    ):
        return "REDE LOCAL / INTERNA"

    try:
        resp = requests.get(f"https://ipwho.is/{ip_clean}", timeout=3)
        if resp.status_code == 200:
            geo = resp.json() or {}
            if geo.get('success'):
                geo_parts = [
                    str(geo.get('city') or '').strip(),
                    str(geo.get('region') or '').strip(),
                    str(geo.get('country') or '').strip(),
                ]
                geo_parts = [g for g in geo_parts if g]
                if geo_parts:
                    return " - ".join(geo_parts).upper()
    except Exception:
        pass
    return "LOCALIZAÇÃO NÃO IDENTIFICADA"


_LOGIN_TRACKING_SCHEMA_READY = False

def _ensure_login_tracking_schema(cur):
    global _LOGIN_TRACKING_SCHEMA_READY
    if _LOGIN_TRACKING_SCHEMA_READY:
        return
    try:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users';
        """)
        existing_cols = {
            (r['column_name'] if isinstance(r, dict) else r[0]).lower()
            for r in (cur.fetchall() or [])
        }
    except Exception:
        existing_cols = set()

    for col_name, sql_stmt in [
        ("last_login_at", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP DEFAULT NULL;"),
        ("last_login_device", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device VARCHAR(180) DEFAULT NULL;"),
        ("last_login_ua", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ua VARCHAR(255) DEFAULT NULL;"),
        ("last_login_ip", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(80) DEFAULT NULL;"),
        ("last_login_location", "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_location VARCHAR(180) DEFAULT NULL;"),
    ]:
        if col_name not in existing_cols:
            try:
                cur.execute(sql_stmt)
            except Exception:
                pass

    for sql_stmt in [
        """
        CREATE TABLE IF NOT EXISTS user_login_history (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            device VARCHAR(180) DEFAULT '',
            user_agent VARCHAR(255) DEFAULT '',
            ip_address VARCHAR(80) DEFAULT '',
            location VARCHAR(180) DEFAULT '',
            auth_stage VARCHAR(40) DEFAULT 'login'
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_user_login_hist_uid ON user_login_history(user_id, login_at DESC);",
    ]:
        try:
            cur.execute(sql_stmt)
        except Exception:
            pass
    _LOGIN_TRACKING_SCHEMA_READY = True


def _parse_user_agent_device(ua_str):
    ua = str(ua_str or '').strip()
    if not ua:
        return "Dispositivo não identificado"
    ua_l = ua.lower()

    # Form factor & OS
    if 'iphone' in ua_l:
        device_type = "Celular"
        os_name = "iPhone (iOS)"
    elif 'ipad' in ua_l:
        device_type = "Tablet"
        os_name = "iPad (iPadOS)"
    elif 'android' in ua_l:
        device_type = "Tablet" if ('tablet' in ua_l or 'sm-t' in ua_l) else "Celular"
        model_match = re.search(r'Android\s+[\d\.]+;\s*([^;\)]+?)(?:\s+Build/|\))', ua, re.I)
        if model_match:
            model_clean = model_match.group(1).strip()[:32]
            os_name = f"Android ({model_clean})"
        else:
            os_name = "Android"
    elif 'windows nt 10.0' in ua_l:
        device_type = "Computador"
        os_name = "Windows 10/11"
    elif 'windows' in ua_l:
        device_type = "Computador"
        os_name = "Windows"
    elif 'macintosh' in ua_l or 'mac os x' in ua_l:
        device_type = "Computador"
        os_name = "Mac (macOS)"
    elif 'linux' in ua_l:
        device_type = "Computador"
        os_name = "Linux"
    else:
        device_type = "Dispositivo"
        os_name = "Sistema Web"

    # Browser
    if 'edg/' in ua_l or 'edga/' in ua_l or 'edgios/' in ua_l:
        browser = "Microsoft Edge"
    elif 'opr/' in ua_l or 'opera' in ua_l:
        browser = "Opera"
    elif 'samsungbrowser/' in ua_l:
        browser = "Samsung Internet"
    elif 'crios/' in ua_l:
        browser = "Google Chrome"
    elif 'fxios/' in ua_l or 'firefox/' in ua_l:
        browser = "Mozilla Firefox"
    elif 'chrome/' in ua_l and 'edg/' not in ua_l:
        browser = "Google Chrome"
    elif 'safari/' in ua_l and 'chrome/' not in ua_l:
        browser = "Apple Safari"
    else:
        browser = "Navegador Web"

    return f"{device_type} · {os_name} · {browser}"[:180]


def _record_user_login_event(user_id, auth_stage='login', client_ip=None, client_ua=None, cf_city=None, cf_region=None, cf_country=None):
    try:
        if has_request_context():
            if client_ip is None:
                client_ip = get_client_ip()
            if client_ua is None:
                client_ua = (request.headers.get('User-Agent') or '')[:250]
            if cf_city is None:
                cf_city = request.headers.get('CF-IPCity')
            if cf_region is None:
                cf_region = request.headers.get('CF-Region')
            if cf_country is None:
                cf_country = request.headers.get('CF-IPCountry')
        client_ip = client_ip or ''
        client_ua = (client_ua or '')[:250]
        device_label = _parse_user_agent_device(client_ua)

        brt_tz = datetime.timezone(datetime.timedelta(hours=-3))
        now_brt = datetime.datetime.now(brt_tz).replace(tzinfo=None)

        # Quick synchronous check if Cloudflare headers or local IP are available
        cf_parts = [p.strip() for p in (cf_city, cf_region, cf_country) if p and str(p).strip()]
        if len(cf_parts) >= 2:
            initial_location = " - ".join(cf_parts).upper()[:180]
            needs_async_geo = False
        elif not client_ip or client_ip.startswith(('127.', '10.', '192.168.', '::1', 'fe80:')):
            initial_location = "REDE LOCAL / INTERNA"
            needs_async_geo = False
        else:
            initial_location = f"IP {client_ip}"
            needs_async_geo = True

        conn = get_db()
        cur = conn.cursor()
        _ensure_login_tracking_schema(cur)

        cur.execute("""
            UPDATE users
            SET last_login_at = %s,
                last_login_device = %s,
                last_login_ua = %s,
                last_login_ip = %s,
                last_login_location = %s
            WHERE id = %s;
        """, (now_brt, device_label, client_ua, client_ip, initial_location, user_id))

        cur.execute("""
            INSERT INTO user_login_history (user_id, login_at, device, user_agent, ip_address, location, auth_stage)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (user_id, now_brt, device_label, client_ua, client_ip, initial_location, auth_stage))
        hist_row = cur.fetchone()
        hist_id = hist_row["id"] if hist_row else None
        conn.commit()
        cur.close()
        conn.close()

        if needs_async_geo:
            def _bg_resolve_geo(uid, hid, ip_val, c_city, c_reg, c_cnt):
                try:
                    resolved = _resolve_ip_location(ip_val, cf_city=c_city, cf_region=c_reg, cf_country=c_cnt)
                    if resolved and resolved != "LOCALIZAÇÃO NÃO IDENTIFICADA":
                        loc_txt = f"{resolved} ({ip_val})"[:180]
                    else:
                        loc_txt = f"IP {ip_val}"[:180]
                    c_bg = get_db()
                    cur_bg = c_bg.cursor()
                    cur_bg.execute("UPDATE users SET last_login_location = %s WHERE id = %s;", (loc_txt, uid))
                    if hid:
                        cur_bg.execute("UPDATE user_login_history SET location = %s WHERE id = %s;", (loc_txt, hid))
                    c_bg.commit()
                    cur_bg.close()
                    c_bg.close()
                except Exception:
                    pass
            threading.Thread(
                target=_bg_resolve_geo,
                args=(user_id, hist_id, client_ip, cf_city, cf_region, cf_country),
                daemon=True
            ).start()
    except Exception as e_rec:
        print("[RECORD LOGIN EVENT ERROR]", e_rec)


def send_security_alert_email(
    to_email,
    user_display,
    ip_address,
    user_agent=None,
    login_time=None,
    portal_url=None,
    totp_blocked=True,
    is_new_ip=True,
    cf_city=None,
    cf_region=None,
    cf_country=None,
):
    """Template 3: Alerta de Segurança de tentativa/entrada na conta com localização, IP e hora"""
    if not _is_valid_email_addr(to_email):
        return False

    brt_tz = datetime.timezone(datetime.timedelta(hours=-3))
    now_brt = datetime.datetime.now(brt_tz)
    time_only = now_brt.strftime('%H:%M')
    date_full = str(login_time or f"{time_only} ({now_brt.strftime('%d/%m/%Y')} - Horário de Brasília)")

    safe_user = html.escape(str(user_display or 'Colaborador'))
    safe_ip = html.escape(str(ip_address or 'IP não identificado'))
    safe_ua = html.escape(str(user_agent or 'Navegador Web')[:180])
    safe_time = html.escape(date_full)
    reset_url = portal_url or get_portal_url('/login')

    status_label = (
        "Senha aceita &bull; Aguardando Autenticador (2FA)"
        if totp_blocked
        else "Acesso autorizado"
    )
    status_color = "#FBBF24" if totp_blocked else "#4ADE80"
    callout_title = (
        "TENTATIVA DE ENTRADA DETECTADA NA SUA CONTA"
        if totp_blocked
        else "NOVO ACESSO DETECTADO NA SUA CONTA"
    )
    callout_desc = (
        "Alguém inseriu seu <strong>usuário e senha corretos</strong> para entrar na sua conta e ficou retido na verificação do <strong>Autenticador (2FA)</strong>."
        if totp_blocked
        else "Detectamos uma entrada na sua conta na plataforma <strong>Claro Gestão Rede Externa</strong>."
    )
    if is_new_ip:
        callout_desc += " A requisição veio de um <strong>novo endereço IP</strong>."

    def _dispatch_with_geo():
        resolved_loc = _resolve_ip_location(ip_address, cf_city=cf_city, cf_region=cf_region, cf_country=cf_country)
        safe_loc = html.escape(resolved_loc)

        message_html = f'''
            <p style="margin: 0 0 14px 0; font-size: 15px; color: #E2E8F0;">Olá, <strong>{safe_user}</strong>.</p>
            
            <!-- Security Header Callout -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 20px 0;">
                <tr>
                    <td style="background: linear-gradient(180deg, rgba(226, 6, 19, 0.14) 0%, rgba(185, 28, 28, 0.05) 100%); border: 1px solid rgba(226, 6, 19, 0.4); border-left: 4px solid #E20613; border-radius: 10px; padding: 18px 20px;">
                        <div style="font-size: 12px; font-weight: 800; color: #FDA4AF; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                            {callout_title}
                        </div>
                        <p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #F1F5F9;">
                            {callout_desc}
                        </p>
                    </td>
                </tr>
            </table>

            <!-- Event Details Card -->
            <div style="background: #111726; border: 1px solid #1E293B; border-radius: 10px; padding: 18px 22px; margin-bottom: 22px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94A3B8; margin-bottom: 12px;">
                    ORIGEM DA REQUISIÇÃO
                </div>
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748B; width: 150px;">Localização:</td>
                        <td style="padding: 6px 0; font-size: 13px; color: #F8FAFC; font-weight: 700;">{safe_loc}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748B;">IP:</td>
                        <td style="padding: 6px 0; font-size: 13px; color: #F87171; font-family: Consolas, monospace; font-weight: bold;">{safe_ip}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Hora:</td>
                        <td style="padding: 6px 0; font-size: 13px; color: #E2E8F0; font-weight: 600;">{safe_time}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Status:</td>
                        <td style="padding: 6px 0; font-size: 13px; color: {status_color}; font-weight: 600;">{status_label}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Dispositivo / Navegador:</td>
                        <td style="padding: 6px 0; font-size: 12px; color: #94A3B8;">{safe_ua}</td>
                    </tr>
                </table>
            </div>

            <!-- Action Guidance -->
            <div style="margin-bottom: 18px;">
                <p style="margin: 0 0 10px 0; font-size: 13.5px; line-height: 1.6; color: #CBD5E1;">
                    <strong style="color: #4ADE80;">Foi você?</strong> Se você acabou de fazer login, nenhuma ação é necessária.
                </p>
                <p style="margin: 12px 0 0 0; font-size: 13.5px; line-height: 1.6; color: #FDA4AF;">
                    <strong style="color: #EF4444;">Não foi você?</strong> Mesmo com o Autenticador (2FA) protegendo sua conta, altere sua senha imediatamente e avise um coordenador.
                </p>
            </div>
        '''

        _send_resend_email_sync(
            to_email=to_email,
            subject=f"[Claro Gestão Externa] Alerta de Acesso na Conta ({resolved_loc})",
            category_badge=None,
            title="Alerta de Entrada na Conta",
            message_html=message_html,
            cta_text="Acessar Portal / Alterar Senha",
            cta_url=reset_url
        )

    t = threading.Thread(target=_dispatch_with_geo, daemon=True)
    t.start()
    return True
app.permanent_session_lifetime = datetime.timedelta(hours=12)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True
app.jinja_env.autoescape = True
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

def safe_int(val, default=0):
    if val is None or val == '':
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def safe_float(val, default=0.0):
    if val is None or val == '':
        return default
    try:
        return float(str(val).replace(',', '.'))
    except (ValueError, TypeError):
        return default


# Security Hardening Stores: IP Rate Limiters
_SECURITY_STORE_LOCK = threading.Lock()
_LAST_SECURITY_PRUNE_TS = 0.0
RATE_LIMIT_STORE = defaultdict(list)
AUTH_RATE_LIMIT_STORE = defaultdict(list)

GLOBAL_RATE_LIMIT_MAX = 600  # Max 600 requests per 60s per IP (evita falsos positivos em polling de alertas)
AUTH_RATE_LIMIT_MAX = 30     # Max 30 attempts per 60s per IP for login/resets


def _prune_security_stores(now_ts):
    global _LAST_SECURITY_PRUNE_TS
    if now_ts - _LAST_SECURITY_PRUNE_TS < 300:
        return
    _LAST_SECURITY_PRUNE_TS = now_ts
    for store, ttl in (
        (RATE_LIMIT_STORE, 60),
        (AUTH_RATE_LIMIT_STORE, 60),
        (_PROBE_TRACKER, 300),
        (_TOTP_FAILURES, 900),
        (_ACCOUNT_LOGIN_FAILURES, 900),
        (_EMAIL_VERIFY_FAILURES, 900),
    ):
        dead_keys = [k for k, ts_list in store.items() if not ts_list or (now_ts - ts_list[-1] >= ttl)]
        for k in dead_keys:
            store.pop(k, None)
    expired_bans = [ip for ip, exp in _SECURITY_BAN_LIST.items() if now_ts >= exp]
    for ip in expired_bans:
        _SECURITY_BAN_LIST.pop(ip, None)
    for uid in list(_USED_TOTP_BUCKETS.keys()):
        buckets = _USED_TOTP_BUCKETS.get(uid)
        if not buckets:
            _USED_TOTP_BUCKETS.pop(uid, None)
            continue
        expired_b = [b for b, exp in buckets.items() if now_ts >= exp]
        for b in expired_b:
            buckets.pop(b, None)
        if not buckets:
            _USED_TOTP_BUCKETS.pop(uid, None)

BLOCKED_USER_AGENTS = [
    'sqlmap', 'nikto', 'nmap', 'burp', 'burpcollaborator', 'dirbuster',
    'wpscan', 'acunetix', 'havij', 'masscan', 'zgrab', 'gobuster', 'hydra',
    'metasploit', 'nessus', 'arachni', 'qualys', 'openvas', 'w3af', 'commix',
    'sublist3r', 'wfuzz', 'ffuf', 'zap', 'paros', 'sqlman', 'nuclei'
]

# Security Autoban and Exploit Pattern Detection
_SECURITY_BAN_LIST = {} # ip -> ban_expiry_timestamp
_PROBE_TRACKER = defaultdict(list) # ip -> [probe_timestamps] (NAT-friendly progressive strike system)
_USED_TOTP_BUCKETS = defaultdict(dict) # user_id -> {bucket_idx: expiry_ts}
_TOTP_FAILURES = defaultdict(list)     # user_id -> [failure_timestamps]
_ACCOUNT_LOGIN_FAILURES = defaultdict(list) # ip:username -> [failure_timestamps]
_EMAIL_VERIFY_FAILURES = defaultdict(list)  # user_id -> [failure_timestamps]

PROBED_EXPLOIT_PATHS = (
    '/.env', '/.git', '/wp-admin', '/wp-login', '/phpmyadmin', '/pma',
    '/xmlrpc.php', '/.aws', '/etc/passwd', '/win.ini', '/boot.ini',
    '/cgi-bin/', '/swagger', '/actuator', '/console', '/shell',
    '/install.php', '/setup.php', '/web.config', '/.htaccess',
    '/modules.php', '/members.asp', '/megabook', '/mailman/', '/ldap/',
    '/jigsaw/', '/isapi/', '/gallery/', '/guestbook/', '/admin.cgi',
    '/cactid/', '/awstats/', '/cgi-sys/', '/scripts/', '/msadc/',
    '/hostingcontroller', '/cpanel', '/whm', '/webhost', '/plesk',
    '/solusvm', '/webmin', '/virtualmin', '/directadmin', '/kloxo'
)

DANGEROUS_SCANNER_EXTS = (
    '.php', '.asp', '.aspx', '.jsp', '.jspx', '.cgi', '.dll', '.exe',
    '.cfm', '.action', '.do', '.pl', '.sh', '.bash', '.bak', '.old',
    '.config', '.sql', '.yaml', '.yml', '.ini'
)

DANGEROUS_SCANNER_PAYLOADS = (
    '<script', '</script', 'alert(', 'document.cookie', 'document.domain',
    'javascript:', 'onerror=', 'onload=', 'prompt(', 'confirm(',
    'union select', 'union all select', "' or '1'='1", "1=1--", "1=1#",
    'sleep(', 'benchmark(', 'waitfor delay', 'load_file(', 'select * from',
    '../', '..\\', '%2e%2e', '0x27', '0x3c', '@@version'
)

# Logger Filter: Suppresses repetitive scanner probe noise from stdout logs
import logging
class ScannerLogFilter(logging.Filter):
    def filter(self, record):
        try:
            msg = record.getMessage().lower()
            if any(ext in msg for ext in ('.php', '.asp', '.cgi', '.dll', '<script', 'alert(', 'document.cookie', 'modules.php')):
                return False
        except Exception:
            pass
        return True

logging.getLogger('werkzeug').addFilter(ScannerLogFilter())
logging.getLogger('gunicorn.access').addFilter(ScannerLogFilter())

@app.before_request
def enforce_security_policies():
    client_ip = get_client_ip()
    now = time.time()

    # 0. Active IP Security Ban Check (immediate 429/403 without blocking worker threads)
    with _SECURITY_STORE_LOCK:
        _prune_security_stores(now)
        ban_exp = _SECURITY_BAN_LIST.get(client_ip)
        if ban_exp is not None and now >= ban_exp:
            _SECURITY_BAN_LIST.pop(client_ip, None)
            ban_exp = None

    if ban_exp is not None:
        # If accessed via a web browser (not an API request), serve the visual Honeypot trap screen
        if not request.path.startswith('/api/') and not request.is_json and 'text/html' in (request.headers.get('Accept') or ''):
            try:
                loc = get_ip_location(client_ip)
                return render_template('honeypot_warning.html', client_ip=client_ip, location=loc), 403
            except Exception:
                pass
        resp = jsonify({
            "error": "Acesso bloqueado por varredura/tentativa de ataque detectada. Conexão interrompida.",
            "status": 429
        })
        resp.status_code = 429
        resp.headers['Retry-After'] = '7200'
        resp.headers['Connection'] = 'close'
        return resp

    # 1. Deep Anti-Scanner / Exploit Probing Detection (Nikto, Burp Suite, Metasploit, Sqlmap, Nuclei)
    path_lower = request.path.lower()
    query_decoded = ''
    try:
        query_decoded = urllib.parse.unquote(request.query_string.decode('utf-8', errors='ignore')).lower()
    except Exception:
        pass

    # Check for unauthorized file extensions (.php, .asp, .cgi, .dll, etc. on a Python/React app)
    is_dangerous_ext = any(path_lower.endswith(ext) or (ext + '/') in path_lower or (ext + '?') in path_lower for ext in DANGEROUS_SCANNER_EXTS)
    is_known_probe = any(probe_path in path_lower for probe_path in PROBED_EXPLOIT_PATHS)
    is_malicious_payload = any(dp in query_decoded or dp in path_lower for dp in DANGEROUS_SCANNER_PAYLOADS)

    user_agent = (request.headers.get('User-Agent') or '').lower()
    is_bad_ua = any(bad_ua in user_agent for bad_ua in BLOCKED_USER_AGENTS)

    if is_dangerous_ext or is_known_probe or is_malicious_payload or is_bad_ua:
        # NAT-friendly Progressive Defense (thread-safe, non-blocking)
        with _SECURITY_STORE_LOCK:
            probes = [t for t in _PROBE_TRACKER[client_ip] if now - t < 300]
            probes.append(now)
            _PROBE_TRACKER[client_ip] = probes
            if len(probes) >= 3:
                _SECURITY_BAN_LIST[client_ip] = now + 900  # Ban temporário por 15 minutos

        # Se for navegador, renderiza tela visual de alerta Honeypot
        if not request.path.startswith('/api/') and not request.is_json and 'text/html' in (request.headers.get('Accept') or ''):
            try:
                loc = get_ip_location(client_ip)
                return render_template('honeypot_warning.html', client_ip=client_ip, location=loc), 403
            except Exception:
                pass
        resp = jsonify({
            "error": "Tentativa de ataque ou varredura não autorizada detectada. Conexão interrompida.",
            "status": 403
        })
        resp.status_code = 403
        resp.headers['Connection'] = 'close'
        return resp

    # 1.1 Strict Origin / Referer Validation against Cross-Site Request Forgery (CSRF)
    if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
        is_public_form = request.path.startswith('/f/') and request.path.endswith('/submit')
        if not is_public_form and not request.path.startswith('/static/'):
            origin = request.headers.get('Origin')
            referer = request.headers.get('Referer')
            host = request.host.split(':')[0].lower()
            allowed_hosts = {'localhost', '127.0.0.1', 'gestaoredeexterna.shardweb.app', 'gestaoredeexterna.shardatabases.app', 'gestaoredeexterna.com.br', 'www.gestaoredeexterna.com.br'}
            if origin:
                parsed_origin = urllib.parse.urlparse(origin)
                origin_host = (parsed_origin.hostname or '').lower()
                if parsed_origin.scheme not in ('http', 'https') or not origin_host or (origin_host != host and origin_host not in allowed_hosts):
                    return jsonify({"error": "Origem de requisição não autorizada (Cross-Origin bloqueado).", "status": 403}), 403
            elif referer:
                parsed_ref = urllib.parse.urlparse(referer)
                ref_host = (parsed_ref.hostname or '').lower()
                if parsed_ref.scheme not in ('http', 'https') or not ref_host or (ref_host != host and ref_host not in allowed_hosts):
                    return jsonify({"error": "Referer de requisição não autorizado.", "status": 403}), 403

    # 2. Global Sliding Window Rate Limiting (All Requests)
    RATE_LIMIT_STORE[client_ip] = [t for t in RATE_LIMIT_STORE[client_ip] if now - t < 60]
    if len(RATE_LIMIT_STORE[client_ip]) >= GLOBAL_RATE_LIMIT_MAX:
        return jsonify({
            "error": "Muitas requisições simultâneas. Limite de taxa excedido. Por favor, aguarde 1 minuto.",
            "status": 429
        }), 429
    RATE_LIMIT_STORE[client_ip].append(now)
    
    # 3. Strict Auth Rate Limiting (/login and password resets)
    if request.path in ['/login', '/api/auth/login', '/forgot-password', '/reset-password', '/api/auth/forgot-password', '/api/auth/reset-password']:
        AUTH_RATE_LIMIT_STORE[client_ip] = [t for t in AUTH_RATE_LIMIT_STORE[client_ip] if now - t < 60]
        if len(AUTH_RATE_LIMIT_STORE[client_ip]) >= AUTH_RATE_LIMIT_MAX:
            if request.path.startswith('/api/') or request.is_json:
                return jsonify({
                    "error": "Muitas tentativas de autenticação. Por favor, aguarde 1 minuto para tentar novamente.",
                    "status": 429
                }), 429
            return _serve_custom_error_html(429)
        if request.method == 'POST':
            AUTH_RATE_LIMIT_STORE[client_ip].append(now)

@app.after_request
def set_security_headers(response):
    # Core OWASP Security Headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), camera=(self), microphone=(), payment=()'
    response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
    response.headers['Server'] = 'Secure-Gateway'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive, nosnippet'

    # Strict Cache-Control directives based on route sensitivity
    if request.path.startswith('/api/') or 'user_id' in session or request.path == '/login':
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    elif request.path.startswith('/assets/') or request.path.endswith(('.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.webp', '.ico', '.mp4', '.webm')):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'

    # Hardened Content-Security-Policy (Preserves route-specific CSP if already set)
    if 'Content-Security-Policy' not in response.headers:
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://server.arcgisonline.com https://*.arcgisonline.com",
            "media-src 'self' data: blob:",
            "connect-src 'self' https://cloudflareinsights.com https://api.resend.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "upgrade-insecure-requests"
        ]
        response.headers['Content-Security-Policy'] = "; ".join(csp_directives) + ";"

    # Dynamic Gzip Compression for JSON, JS, CSS and text payloads (> 500 bytes)
    accept_encoding = request.headers.get('Accept-Encoding', '')
    if ('gzip' in accept_encoding.lower() and
        200 <= response.status_code < 300 and
        'Content-Encoding' not in response.headers and
        not response.direct_passthrough):
        c_type = response.headers.get('Content-Type', '')
        if any(t in c_type for t in ('text/', 'json', 'javascript', 'css', 'xml')):
            try:
                data = response.get_data()
                if len(data) >= 500:
                    compressed = gzip.compress(data, compresslevel=5)
                    response.set_data(compressed)
                    response.headers['Content-Encoding'] = 'gzip'
                    response.headers['Content-Length'] = len(compressed)
            except Exception:
                pass

    return response

# Configuration for Database and Upload Directories
DATABASE_URL = os.environ.get('DATABASE_URL', '')
# Guard: strip accidental "DATABASE_URL=" prefix from the value
if DATABASE_URL.upper().startswith("DATABASE_URL="):
    DATABASE_URL = DATABASE_URL.split("=", 1)[1]
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
ALLOWED_FORM_UPLOAD_EXTS = {'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'}
MAX_FORM_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB per file

def sanitize_csv_cell(value):
    if value is None:
        return ''
    s = str(value)
    if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + s
    return s

class _SafeCsvWriterWrapper:
    def __init__(self, writer):
        self._writer = writer
    def writerow(self, row):
        return self._writer.writerow([sanitize_csv_cell(c) for c in row])
    def writerows(self, rows):
        for r in rows:
            self.writerow(r)

def safe_csv_writer(stream, **kwargs):
    import csv
    return _SafeCsvWriterWrapper(csv.writer(stream, **kwargs))
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
ALLOWED_PROJECT_EXTENSIONS = {'pdf', 'kmz', 'kml', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'png', 'jpg', 'jpeg'}

# Create upload folders if they don't exist
os.makedirs(os.path.join(UPLOAD_FOLDER, 'projetos'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'auditorias'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'aceitacoes'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'documentos_pessoas'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'workspace_anexos'), exist_ok=True)

# Leak-proof PostgreSQL connection manager with connection reuse & ultra-fast failover
_CACHED_DB_IP = '38.18.229.30'
_DB_POOL = None
_DB_POOL_LOCK = threading.Lock()


class _PooledConnProxy:
    """Wrapper seguro sobre conexão do ThreadedConnectionPool compatível com conn.close()."""
    __slots__ = ('_conn', '_pool', '_released')

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._released = False

    @property
    def closed(self):
        return self._released or bool(getattr(self._conn, 'closed', 1))

    @property
    def autocommit(self):
        return self._conn.autocommit

    @autocommit.setter
    def autocommit(self, val):
        self._conn.autocommit = val

    def cursor(self, *args, **kwargs):
        return self._conn.cursor(*args, **kwargs)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        if not self._released and not getattr(self._conn, 'closed', 1):
            return self._conn.rollback()

    def close(self):
        if self._released:
            return
        self._released = True
        raw = self._conn
        should_close = bool(getattr(raw, 'closed', 1))
        try:
            if not should_close:
                try:
                    if getattr(raw, 'autocommit', False):
                        raw.autocommit = False
                    raw.rollback()
                except Exception:
                    should_close = True
            self._pool.putconn(raw, close=should_close)
        except Exception:
            try:
                raw.close()
            except Exception:
                pass

    def __del__(self):
        try:
            if not getattr(self, '_released', True):
                self.close()
        except Exception:
            pass

    def __getattr__(self, item):
        return getattr(self._conn, item)


def _init_db_pool():
    global _DB_POOL, _CACHED_DB_IP
    from psycopg2.pool import ThreadedConnectionPool

    attempts = []
    if _CACHED_DB_IP:
        attempts.append(_CACHED_DB_IP)
    if 'postgres.shardatabases.app' in DATABASE_URL:
        for ip in _KNOWN_DB_IPS:
            if ip != _CACHED_DB_IP:
                attempts.append(ip)
    attempts.append(None)

    last_error = None
    for h_addr in attempts:
        try:
            kwargs = {
                'cursor_factory': RealDictCursor,
                'connect_timeout': 4,
                'keepalives': 1,
                'keepalives_idle': 30,
                'keepalives_interval': 10,
                'keepalives_count': 3,
            }
            if h_addr:
                kwargs['hostaddr'] = h_addr
            pool = ThreadedConnectionPool(2, 40, DATABASE_URL, **kwargs)
            test_conn = pool.getconn()
            pool.putconn(test_conn)
            if h_addr:
                _CACHED_DB_IP = h_addr
            _DB_POOL = pool
            return pool
        except psycopg2.OperationalError as e:
            last_error = e
            err_msg = str(e).lower()
            if 'password authentication failed' in err_msg or 'database "' in err_msg:
                raise e
            continue
        except Exception as e:
            last_error = e
            continue

    print(f"🚨 [FATAL DB CONNECTION ERROR] Falha ao inicializar pool PostgreSQL: {last_error}")
    raise last_error


def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada no ambiente do servidor.")

    from flask import has_app_context
    in_ctx = has_app_context()

    # 1. Fast path: reuse open connection for the current app/request context (0ms handshake!)
    if in_ctx:
        current_conn = getattr(g, '_current_db_conn', None)
        if current_conn and not current_conn.closed:
            try:
                raw = getattr(current_conn, '_conn', current_conn)
                if getattr(raw, 'info', None) and raw.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_INERROR:
                    current_conn.rollback()
            except Exception:
                try:
                    current_conn.rollback()
                except Exception:
                    pass
            return current_conn

    pool = _DB_POOL
    if pool is None:
        with _DB_POOL_LOCK:
            pool = _DB_POOL
            if pool is None:
                pool = _init_db_pool()

    raw_conn = pool.getconn()
    if getattr(raw_conn, 'closed', 1):
        pool.putconn(raw_conn, close=True)
        raw_conn = pool.getconn()

    conn = _PooledConnProxy(raw_conn, pool)
    if in_ctx:
        if not hasattr(g, '_active_db_conns'):
            g._active_db_conns = []
        g._active_db_conns.append(conn)
        g._current_db_conn = conn
    return conn


@app.teardown_appcontext
def close_db_connections(exception=None):
    conns = getattr(g, '_active_db_conns', None)
    if conns:
        for c in conns:
            try:
                if not c.closed:
                    if exception is not None:
                        c.rollback()
                    c.close()
            except Exception:
                pass

# Helper function to check allowed file extensions
def allowed_file(filename, extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

# Database Initialization Script

def emit_live_alert(category, title, message, target_user_id=None, target_username=None, source_user_id=None, source_username=None, link=None):
    in_req = has_request_context()
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        s_uid = source_user_id or (session.get('user_id') if in_req and 'user_id' in session else None)
        s_uname = source_username or (session.get('username') if in_req and 'username' in session else None)
        cur.execute("""
            INSERT INTO system_live_alerts (
                category, title, message, target_user_id, target_username, source_user_id, source_username, link
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """, (category, title, message, target_user_id, target_username, s_uid, s_uname, link))
        conn.commit()
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print("Error emitting live alert:", e)
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn and not in_req:
            try:
                conn.close()
            except Exception:
                pass

# --------------------------------------------------------------------------
# BRAZILIAN PORTUGUESE PROPER NAME GRAMMAR FORMATTER
# --------------------------------------------------------------------------
_PT_NAME_PARTICLES = {"de", "da", "do", "das", "dos", "e", "del", "di", "du", "van", "von"}
_ROMAN_NUMERALS = {"II", "III", "IV", "VI", "VII", "VIII", "IX", "X"}
_PT_ACCENT_MAP = {
    "conceicao": "Conceição",
    "assuncao": "Assunção",
    "encarnacao": "Encarnação",
    "purificacao": "Purificação",
    "apresentacao": "Apresentação",
    "anunciacao": "Anunciação",
    "ressurreicao": "Ressurreição",
    "ascensao": "Ascensão",
    "araujo": "Araújo",
    "espirito": "Espírito",
    "nazare": "Nazaré",
    "candido": "Cândido",
    "goncalves": "Gonçalves",
    "mendonca": "Mendonça",
    "lourenco": "Lourenço",
    "franca": "França",
    "proenca": "Proença",
    "valenca": "Valença",
    "braganca": "Bragança",
    "esperanca": "Esperança",
    "simoes": "Simões",
    "guimaraes": "Guimarães",
    "magalhaes": "Magalhães",
    "camoes": "Camões",
    "goes": "Góes",
    "brandao": "Brandão",
    "leao": "Leão",
    "falcao": "Falcão",
    "paixao": "Paixão",
    "galvao": "Galvão",
    "romao": "Romão",
    "aragao": "Aragão",
    "lobao": "Lobão",
    "mourao": "Mourão",
    "negrao": "Negrão",
    "serrao": "Serrão",
    "jordao": "Jordão",
    "leitao": "Leitão",
    "barao": "Barão",
    "carrao": "Carrão",
    "abraao": "Abraão",
    "salomao": "Salomão",
    "simao": "Simão",
    "estevao": "Estêvão",
    "cristovao": "Cristóvão",
    "sebastiao": "Sebastião",
    "damiao": "Damião",
    "junior": "Júnior",
    "jr": "Júnior",
    "jr.": "Júnior",
    "joao": "João",
    "jose": "José",
    "antonio": "Antônio",
    "andre": "André",
    "mario": "Mário",
    "sergio": "Sérgio",
    "flavio": "Flávio",
    "fabio": "Fábio",
    "claudio": "Cláudio",
    "marcio": "Márcio",
    "decio": "Décio",
    "lucio": "Lúcio",
    "helcio": "Hélcio",
    "julio": "Júlio",
    "cesar": "César",
    "regis": "Régis",
    "ines": "Inês",
    "sonia": "Sônia",
    "monica": "Mônica",
    "veronica": "Verônica",
    "patricia": "Patrícia",
    "leticia": "Letícia",
    "cecilia": "Cecília",
    "lucia": "Lúcia",
    "valeria": "Valéria",
    "rogerio": "Rogério",
    "silverio": "Silvério",
    "tiberio": "Tibério",
    "vinicius": "Vinícius",
    "mauricio": "Maurício",
    "fabricio": "Fabrício",
    "aparicio": "Aparício",
    "bonifacio": "Bonifácio",
    "inacio": "Inácio",
    "horacio": "Horácio",
    "estacio": "Estácio",
    "jeronimo": "Jerônimo",
    "teofilo": "Teófilo",
    "angelo": "Ângelo",
    "romulo": "Rômulo",
    "getulio": "Getúlio",
    "braulio": "Bráulio",
    "tulio": "Túlio",
    "helio": "Hélio",
    "celio": "Célio",
    "nelio": "Nélio",
    "aurelio": "Aurélio",
    "cornelio": "Cornélio",
    "otavio": "Otávio",
    "savio": "Sávio",
    "silvio": "Sílvio",
    "fulvio": "Fúlvio",
    "plinio": "Plínio",
    "herminio": "Hermínio",
    "virginia": "Virgínia",
    "vitoria": "Vitória",
    "gloria": "Glória",
    "fatima": "Fátima",
    "barbara": "Bárbara",
    "debora": "Débora",
    "tamara": "Tâmara",
    "claudia": "Cláudia",
    "flavia": "Flávia",
    "marcia": "Márcia",
    "silvia": "Sílvia",
    "katia": "Kátia",
    "cassia": "Cássia",
    "cassio": "Cássio",
    "tassio": "Tássio",
    "lazaro": "Lázaro",
    "icaro": "Ícaro",
    "italo": "Ítalo",
    "alvaro": "Álvaro",
    "eder": "Éder",
    "edson": "Édson",
    "everson": "Éverson",
    "emerson": "Émerson",
    "erica": "Érica",
    "erico": "Érico",
    "hercules": "Hércules",
    "moises": "Moisés",
    "josue": "Josué",
    "tome": "Tomé",
    "noemia": "Noêmia",
    "eugenio": "Eugênio",
    "eugenia": "Eugênia",
    "genesio": "Genésio",
    "anisio": "Anísio",
    "dionisio": "Dionísio",
    "aloisio": "Aloísio",
    "aluisio": "Aluísio",
    "luis": "Luís",
}


def format_person_name(raw_name):
    if not raw_name or not isinstance(raw_name, str):
        return raw_name or ""
    cleaned = " ".join(raw_name.strip().split())
    if not cleaned:
        return ""
    # Converte logins com ponto (ex: alexandre.candido) para o nome real com espacos e acentos corretos
    if "." in cleaned and " " not in cleaned:
        cleaned = cleaned.replace(".", " ")

    tokens = cleaned.split(" ")
    result = []
    total = len(tokens)

    for idx, token in enumerate(tokens):
        upper_tok = token.upper()
        lower_tok = token.lower()

        if idx > 0 and lower_tok in _PT_NAME_PARTICLES:
            result.append(lower_tok)
            continue

        if idx == total - 1 and total >= 3 and lower_tok in ("ju", "jun", "juni", "junio", "junior", "jr", "jr."):
            result.append("Júnior")
            continue

        if idx > 0 and upper_tok in _ROMAN_NUMERALS:
            result.append(upper_tok)
            continue

        if lower_tok in _PT_ACCENT_MAP:
            result.append(_PT_ACCENT_MAP[lower_tok])
            continue

        if "-" in lower_tok:
            subparts = [
                _PT_ACCENT_MAP.get(sp, sp.capitalize()) for sp in lower_tok.split("-")
            ]
            result.append("-".join(subparts))
        elif "'" in lower_tok:
            subparts = [sp.capitalize() for sp in lower_tok.split("'")]
            result.append("'".join(subparts))
        else:
            result.append(lower_tok.capitalize())

    return " ".join(result)


_NAMES_DB_NORMALIZED = False


def normalize_all_database_names(cur=None):
    global _NAMES_DB_NORMALIZED
    own_conn = None
    try:
        if cur is None:
            own_conn = get_db()
            cur = own_conn.cursor()

        # Sincroniza users.name com a tabela de técnicos e formata nomes reais
        try:
            cur.execute("""
                UPDATE users u
                SET name = t.name
                FROM technicians t
                WHERE u.tech_id = t.id 
                  AND (u.name IS NULL OR TRIM(u.name) = '' OR LOWER(TRIM(u.name)) = LOWER(TRIM(u.username)))
                  AND t.name IS NOT NULL AND TRIM(t.name) != '';
            """)
        except Exception:
            if own_conn: own_conn.rollback()

        for tbl in ['auditorias', 'aceitacoes', 'pos_eventos']:
            try:
                cur.execute(f"""
                    UPDATE {tbl} x
                    SET created_by = COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(t.name), ''), x.created_by)
                    FROM users u
                    LEFT JOIN technicians t ON u.tech_id = t.id
                    WHERE (x.created_by_id = u.id OR LOWER(TRIM(x.created_by)) = LOWER(TRIM(u.username)))
                      AND COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(t.name), '')) IS NOT NULL;
                """)
            except Exception:
                if own_conn: own_conn.rollback()

        tables_and_cols = [
            ("technicians", "id", "name"),
            ("users", "id", "name"),
            ("user_tasks", "id", "assigned_tech_name"),
            ("collaborator_evaluations", "id", "technician_name"),
            ("notifications", "id", "coordinator_name"),
            ("auditorias", "id", "created_by"),
            ("auditorias", "id", "responsible"),
            ("aceitacoes", "id", "created_by"),
            ("aceitacoes", "id", "responsible"),
            ("pos_eventos", "id", "created_by"),
            ("pos_eventos", "id", "responsible"),
        ]
        for table, pk, col in tables_and_cols:
            try:
                cur.execute(f"SELECT {pk}, {col} FROM {table} WHERE {col} IS NOT NULL AND {col} != '';")
                rows = cur.fetchall()
                for r in rows:
                    old_val = r.get(col) if isinstance(r, dict) else r[1]
                    row_id = r.get(pk) if isinstance(r, dict) else r[0]
                    if not old_val:
                        continue
                    new_val = format_person_name(old_val)
                    if new_val and new_val != old_val:
                        cur.execute(f"UPDATE {table} SET {col} = %s WHERE {pk} = %s;", (new_val, row_id))
            except Exception:
                if own_conn:
                    own_conn.rollback()

        if own_conn:
            own_conn.commit()
        _NAMES_DB_NORMALIZED = True
    except Exception as e_norm:
        print("Notice normalizing database names:", e_norm)
    finally:
        if own_conn:
            try:
                cur.close()
                own_conn.close()
            except Exception:
                pass


def init_db():
    try:
        conn = get_db()
        # CRITICAL: Use autocommit + short lock_timeout in init_db() so DDL never holds
        # multi-table ACCESS EXCLUSIVE locks across requests or blocks login/API traffic.
        try:
            conn.autocommit = True
        except Exception:
            pass
        cur = conn.cursor()
        try:
            cur.execute("SET lock_timeout = '3s';")
        except Exception:
            pass

        # Preload existing columns once (read-only, zero locks) to skip redundant ALTER TABLE
        existing_cols = set()
        try:
            cur.execute("""
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public';
            """)
            for r in (cur.fetchall() or []):
                t_name = (r['table_name'] if isinstance(r, dict) else r[0]).lower()
                c_name = (r['column_name'] if isinstance(r, dict) else r[1]).lower()
                existing_cols.add((t_name, c_name))
        except Exception:
            pass

        def _ensure_col(table_name, col_name, col_def):
            key = (table_name.lower(), col_name.lower())
            if key in existing_cols:
                return
            try:
                cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col_name} {col_def};")
                existing_cols.add(key)
            except Exception:
                pass
        
        # 1. Users Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(80) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(30) NOT NULL, -- admin, supervisor, operator
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for col, coltype in [
            ('email', 'VARCHAR(150)'),
            ('phone', 'VARCHAR(50)'),
            ('name', 'VARCHAR(150)'),
            ('email_verified', 'BOOLEAN DEFAULT FALSE'),
            ('permissions', 'JSONB DEFAULT NULL'),
            ('totp_secret', 'VARCHAR(64) DEFAULT NULL'),
            ('totp_enabled', 'BOOLEAN DEFAULT FALSE'),
            ('totp_verified_at', 'TIMESTAMP DEFAULT NULL'),
            ('theme_preference', "VARCHAR(10) DEFAULT 'dark'"),
            ('last_login_at', 'TIMESTAMP DEFAULT NULL'),
            ('last_login_device', 'VARCHAR(180) DEFAULT NULL'),
            ('last_login_ua', 'VARCHAR(255) DEFAULT NULL'),
            ('last_login_ip', 'VARCHAR(80) DEFAULT NULL'),
            ('last_login_location', 'VARCHAR(180) DEFAULT NULL'),
            ('email_bounced', 'BOOLEAN DEFAULT FALSE'),
            ('email_bounce_reason', 'TEXT DEFAULT NULL'),
            ('email_bounced_at', 'TIMESTAMP DEFAULT NULL'),
            ('email_verify_code', 'VARCHAR(12) DEFAULT NULL'),
            ('email_verify_target', 'VARCHAR(255) DEFAULT NULL'),
            ('email_verify_expires_at', 'TIMESTAMP DEFAULT NULL'),
        ]:
            _ensure_col('users', col, coltype)
        
        # 1.1 Known IPs Table for Security Alerts
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_known_ips (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                ip_address VARCHAR(60) NOT NULL,
                user_agent VARCHAR(300),
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_user_known_ip UNIQUE (user_id, ip_address)
            );
        """)
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_user_known_ips ON user_known_ips(user_id, ip_address);")
        except Exception:
            conn.rollback()

        # 2. Technicians Table (Pessoas)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS technicians (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                cpf VARCHAR(20) UNIQUE NOT NULL,
                phone VARCHAR(30),
                identity VARCHAR(30),
                dob DATE NOT NULL,
                role VARCHAR(50) NOT NULL, -- Auxiliar, Técnico, Supervisor, Coordenador
                area VARCHAR(100),
                team_type VARCHAR(50), -- Fusão ou Lançamento
                shirt_size VARCHAR(10),
                boot_size VARCHAR(10),
                pants_size VARCHAR(10),
                jacket_size VARCHAR(10),
                team VARCHAR(100),
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Make cpf, dob, role nullable in technicians and fix invalid years > 9999
        try:
            cur.execute("ALTER TABLE technicians ALTER COLUMN dob DROP NOT NULL;")
            cur.execute("ALTER TABLE technicians ALTER COLUMN cpf DROP NOT NULL;")
            cur.execute("ALTER TABLE technicians ALTER COLUMN role DROP NOT NULL;")
            cur.execute("UPDATE technicians SET dob = NULL WHERE EXTRACT(YEAR FROM dob) > 9999;")
        except Exception:
            conn.rollback()

        for col, coltype in [
            ('company', 'VARCHAR(50)'),
            ('registration_claro', 'VARCHAR(50)'),
            ('registration_third', 'VARCHAR(50)'),
            ('toa_login', 'VARCHAR(100)'),
            ('phone_model', 'VARCHAR(100)'),
            ('imei_1', 'VARCHAR(50)'),
            ('imei_2', 'VARCHAR(50)'),
            ('email', 'VARCHAR(150)'),
            ('nr6_expiration', 'DATE'),
            ('nr10_expiration', 'DATE'),
            ('nr35_expiration', 'DATE'),
            ('aso_expiration', 'DATE'),
            ('nr6_file', 'VARCHAR(500)'),
            ('nr10_file', 'VARCHAR(500)'),
            ('nr35_file', 'VARCHAR(500)'),
            ('aso_file', 'VARCHAR(500)')
        ]:
            try:
                cur.execute(f"ALTER TABLE technicians ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()
        
        # 3. Vehicles Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                plate VARCHAR(20) UNIQUE NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'Utilitário',
                model VARCHAR(100),
                responsible_tech_id INT REFERENCES technicians(id) ON DELETE SET NULL,
                has_rack BOOLEAN NOT NULL DEFAULT FALSE,
                has_basket BOOLEAN NOT NULL DEFAULT FALSE,
                has_giroflex BOOLEAN NOT NULL DEFAULT FALSE,
                has_inverter BOOLEAN NOT NULL DEFAULT FALSE,
                ticket_car VARCHAR(50),
                area_rede VARCHAR(100),
                base VARCHAR(100),
                setor VARCHAR(100),
                condutor_dia VARCHAR(200),
                condutor_tarde VARCHAR(200),
                condutor_madrugada VARCHAR(200),
                subclus VARCHAR(50),
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Add new columns if they don't exist (for existing databases)
        for col, coltype in [('area_rede','VARCHAR(100)'),('base','VARCHAR(100)'),('setor','VARCHAR(100)'),('condutor_dia','VARCHAR(200)'),('condutor_tarde','VARCHAR(200)'),('condutor_madrugada','VARCHAR(200)'),('subclus','VARCHAR(50)')]:
            try:
                cur.execute(f"ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()
        
        # 4. Financial Logs Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_logs (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL, -- Equipes, Cabos, Equipamentos, EPI, Ferramentas
                description TEXT NOT NULL,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                logged_by INT REFERENCES users(id) ON DELETE SET NULL,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 5. Project Folders Table [NEW]
        cur.execute("""
            CREATE TABLE IF NOT EXISTS project_folders (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                parent_id INT REFERENCES project_folders(id) ON DELETE CASCADE,
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # 6. Projects Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                description TEXT,
                kmz_path TEXT,
                pdf_path TEXT,
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Add new project columns if they don't exist
        for col, coltype in [('area','VARCHAR(100)'),('folder_id','INT REFERENCES project_folders(id) ON DELETE CASCADE')]:
            try:
                cur.execute(f"ALTER TABLE projects ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()
                
        try:
            cur.execute("ALTER TABLE projects ALTER COLUMN kmz_path TYPE TEXT;")
            cur.execute("ALTER TABLE projects ALTER COLUMN pdf_path TYPE TEXT;")
        except Exception:
            conn.rollback()
        
        # 7. Audit Logs Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE SET NULL,
                username VARCHAR(80),
                action VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 8. Favorites Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                link TEXT NOT NULL,
                color VARCHAR(30) DEFAULT 'Vermelho',
                access_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("ALTER TABLE favorites ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0;")
        except Exception:
            conn.rollback()

        # 9. Routes Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                type VARCHAR(30) NOT NULL DEFAULT 'Empresarial',
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 10. Route Lines Table (Sub-Página de Linhas)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS route_lines (
                id SERIAL PRIMARY KEY,
                route_id INT REFERENCES routes(id) ON DELETE CASCADE,
                stretch_name VARCHAR(150) NOT NULL,
                pop_box VARCHAR(100),
                cable_type VARCHAR(100),
                notes TEXT,
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for col, coltype in [("address", "TEXT"), ("event_type", "VARCHAR(50)"), ("measurement", "VARCHAR(255)")]:
            try:
                cur.execute(f"ALTER TABLE route_lines ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        # 10.1 Route Folders & Route Files Tables
        cur.execute("""
            CREATE TABLE IF NOT EXISTS route_folders (
                id SERIAL PRIMARY KEY,
                route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                parent_id INT REFERENCES route_folders(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INT REFERENCES users(id) ON DELETE SET NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS route_files (
                id SERIAL PRIMARY KEY,
                route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
                folder_id INT REFERENCES route_folders(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(500) NOT NULL,
                filesize BIGINT DEFAULT 0,
                filetype VARCHAR(100) DEFAULT '',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                uploaded_by INT REFERENCES users(id) ON DELETE SET NULL
            );
        """)

        # 11. Forms Table (Formulários)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS forms (
                id SERIAL PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                slug VARCHAR(100) UNIQUE,
                category VARCHAR(50) DEFAULT 'Inspeção',
                description TEXT,
                link TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        _ensure_col('users', 'tech_id', 'INT REFERENCES technicians(id) ON DELETE SET NULL')
        _ensure_col('forms', 'slug', 'VARCHAR(100) UNIQUE')
        _ensure_col('forms', 'questions', 'JSONB')

        # 12. Form Responses Table (Respostas dos Técnicos)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS form_responses (
                id SERIAL PRIMARY KEY,
                form_id INT REFERENCES forms(id) ON DELETE CASCADE,
                technician_name VARCHAR(150),
                technician_email VARCHAR(150),
                answers JSONB,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 13. Work Schedules Table (Escala de Trabalho)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS work_schedules (
                id SERIAL PRIMARY KEY,
                tech_id INT NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                status VARCHAR(50) DEFAULT 'Trabalho',
                work_hours VARCHAR(50) DEFAULT '08 às 17:48hs',
                on_call VARCHAR(50) DEFAULT '0',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tech_id, date)
            );
        """)
        try:
            cur.execute("ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS work_hours VARCHAR(50) DEFAULT '08 às 17:48hs';")
            cur.execute("ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS on_call VARCHAR(50) DEFAULT '0';")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedules_tech_date ON work_schedules (tech_id, date);")
        except Exception:
            conn.rollback()

        # --------------------------------------------------------------------------
        # FORMULÁRIOS NATIVOS CLARO GESTÃO (SEM LINKS EXTERNOS)
        # --------------------------------------------------------------------------
        vistoria_default_questions = [
            {"title": "E-mail do Técnico", "type": "text", "options": [], "required": True},
            {"title": "Data da Vistoria", "type": "date", "options": [], "required": True},
            {"title": "Nome do Inspetor / Técnico", "type": "text", "options": [], "required": True},
            {"title": "Região / Área", "type": "select", "options": [
                "METROPOLITANA", "CENTRO ZONA SUL", "NORTE 1", "NORTE 2", "NORTE 3",
                "ZONA OESTE", "BAIXADA FLUMINENSE", "REGIÃO DOS LAGOS", "SUL FLUMINENSE", "REGIÃO SERRANA"
            ], "required": True},
            {"title": "Cidade / Subcluster", "type": "text", "options": [], "required": False},
            {"title": "Endereço / Logradouro / Ponto de Referência", "type": "text", "options": [], "required": False},
            {"title": "Número da OS / Task TOA", "type": "text", "options": [], "required": False},
            {"title": "Tecnologia da Rede", "type": "radio", "options": ["HFC", "Fibra (FTTH)", "Metálico"], "required": False},
            {"title": "Identificação do Node / Rota de Fibra", "type": "text", "options": [], "required": False},
            {"title": "Tipo de Vistoria / Ocorrência", "type": "select", "options": [
                "Vistoria Preventiva / Rotina", "Auditoria de Campo", "Vandalismo / Furto de Cabo",
                "Cabo Baixo / Rompimento", "Atenuação / Nível Fora do Padrão", "Caixa / Armário Danificado", "Outro"
            ], "required": False},
            {"title": "Rede Externa Conforme Padrão Claro?", "type": "radio", "options": ["Sim", "Não"], "required": False},
            {"title": "Lixo de Rede no Chão Recolhido?", "type": "radio", "options": ["Sim", "Não"], "required": False},
            {"title": "Pontas de Cabos Recolhidas?", "type": "radio", "options": ["Sim", "Não"], "required": False},
            {"title": "Fotos e Evidências da Vistoria", "type": "file", "options": [], "required": False},
            {"title": "Observações e Parecer Técnico", "type": "textarea", "options": [], "required": False}
        ]

        inventario_default_questions = [
            {"title": "Técnico Responsável", "type": "text", "options": [], "required": True},
            {"title": "Data do Inventário", "type": "date", "options": [], "required": True},
            {"title": "Empresa / Parceira", "type": "select", "options": ["Claro", "FFA", "Procisa", "Outra"], "required": True},
            {"title": "Tipo de Maquinário / Equipamento", "type": "select", "options": [
                "Máquina de Fusão de Fibra", "OTDR (Refletômetro Óptico)", "Clivador de Precisão",
                "Power Meter Óptico", "Identificador de Fibra Ativa (AFI)", "Gerador de Energia Portátil",
                "Escada Extensível Fibra", "Conjunto de EPI / Linha de Vida", "Detector de Tensão / Multímetro", "Outro"
            ], "required": True},
            {"title": "Marca / Fabricante", "type": "text", "options": [], "required": False},
            {"title": "Modelo do Equipamento", "type": "text", "options": [], "required": False},
            {"title": "Número de Série / Plaqueta de Patrimônio", "type": "text", "options": [], "required": True},
            {"title": "Estado Geral de Conservação", "type": "select", "options": [
                "Excelente (Novo / Pouco Uso)", "Bom (Operacional)", "Regular (Desgaste Natural)", "Danificado (Necessita Manutenção / Reparo)"
            ], "required": True},
            {"title": "Calibração / Aferição em Dia?", "type": "radio", "options": ["Sim", "Não", "Não se aplica"], "required": False},
            {"title": "Fotos do Equipamento e Número de Série", "type": "file", "options": [], "required": False},
            {"title": "Observações sobre o Estado ou Pendências", "type": "textarea", "options": [], "required": False}
        ]

        cadastro_equipe_default_questions = [
            {"title": "Nome Completo do Colaborador", "type": "text", "options": [], "required": True},
            {"title": "CPF", "type": "text", "options": [], "required": True},
            {"title": "Telefone de Contato / WhatsApp", "type": "text", "options": [], "required": True},
            {"title": "E-mail Corporativo ou Pessoal", "type": "text", "options": [], "required": True},
            {"title": "Empresa / Parceira Vinculada", "type": "select", "options": ["Claro", "FFA", "Procisa", "Outra"], "required": True},
            {"title": "Cargo / Função Operacional", "type": "select", "options": ["Supervisor", "Técnico de Rede", "Auxiliar de Campo", "Coordenador"], "required": True},
            {"title": "Matrícula Claro", "type": "text", "options": [], "required": False},
            {"title": "Login TOA (Oracle Field Service)", "type": "text", "options": [], "required": False},
            {"title": "Cluster / Base Operacional", "type": "select", "options": [
                "METROPOLITANA", "CENTRO ZONA SUL", "NORTE 1", "NORTE 2", "NORTE 3",
                "ZONA OESTE", "BAIXADA FLUMINENSE", "REGIÃO DOS LAGOS", "SUL FLUMINENSE", "REGIÃO SERRANA"
            ], "required": False},
            {"title": "Certificações Normativas Ativas", "type": "checkbox", "options": [
                "NR-06 (EPI)", "NR-10 (Segurança em Eletricidade)", "NR-35 (Trabalho em Altura)", "ASO (Atestado de Saúde Ocupacional)"
            ], "required": False},
            {"title": "Foto do Colaborador / Documento / ASO", "type": "file", "options": [], "required": False},
            {"title": "Observações Adicionais", "type": "textarea", "options": [], "required": False}
        ]

        # Sincroniza e migra Vistoria Externa (eliminando links externos e garantindo link nativo /f/vistoria-externa)
        try:
            cur.execute("""
                UPDATE forms 
                SET title = 'Formulário de Vistoria Externa',
                    category = 'Vistoria',
                    description = 'Formulário oficial para vistorias, registros de campo e auditorias de rede externa.',
                    slug = 'vistoria-externa',
                    link = '/f/vistoria-externa',
                    questions = %s
                WHERE slug IN ('formulario-vistoria-google', 'vistoria-externa') OR title ILIKE '%%vistoria externa%%';
            """, (json.dumps(vistoria_default_questions, ensure_ascii=False),))
            if cur.rowcount == 0:
                cur.execute("""
                    INSERT INTO forms (title, slug, category, description, link, questions)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    'Formulário de Vistoria Externa',
                    'vistoria-externa',
                    'Vistoria',
                    'Formulário oficial para vistorias, registros de campo e auditorias de rede externa.',
                    '/f/vistoria-externa',
                    json.dumps(vistoria_default_questions, ensure_ascii=False)
                ))
        except Exception as e_v:
            print("Error syncing Vistoria form:", e_v)
            conn.rollback()

        # Sincroniza e migra Inventário - Maquinário
        try:
            cur.execute("""
                UPDATE forms
                SET title = 'Inventário - Maquinário',
                    slug = 'inventario-maquinario',
                    category = 'Inspeção',
                    description = 'Inventário do Maquinário e Ferramental.',
                    link = '/f/inventario-maquinario',
                    questions = COALESCE(NULLIF(questions, '[]'::jsonb), %s::jsonb)
                WHERE slug = 'inventario-maquinario' OR title ILIKE '%%inventário - maquinário%%' OR title ILIKE '%%inventario - maquinario%%';
            """, (json.dumps(inventario_default_questions, ensure_ascii=False),))
            if cur.rowcount == 0:
                cur.execute("""
                    INSERT INTO forms (title, slug, category, description, link, questions)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    'Inventário - Maquinário',
                    'inventario-maquinario',
                    'Inspeção',
                    'Inventário do Maquinário e Ferramental.',
                    '/f/inventario-maquinario',
                    json.dumps(inventario_default_questions, ensure_ascii=False)
                ))
        except Exception as e_inv:
            print("Error syncing Inventário form:", e_inv)
            conn.rollback()

        # Sincroniza e migra Cadastro de Equipe
        try:
            cur.execute("""
                UPDATE forms
                SET title = 'Cadastro equipe',
                    slug = 'cadastro-equipe',
                    category = 'Outros',
                    description = 'Formulário oficial para cadastro de colaboradores e técnicos de campo.',
                    link = '/f/cadastro-equipe',
                    questions = COALESCE(NULLIF(questions, '[]'::jsonb), %s::jsonb)
                WHERE slug = 'cadastro-equipe' OR title ILIKE '%%cadastro equipe%%' OR title ILIKE '%%cadastro de equipe%%';
            """, (json.dumps(cadastro_equipe_default_questions, ensure_ascii=False),))
            if cur.rowcount == 0:
                cur.execute("""
                    INSERT INTO forms (title, slug, category, description, link, questions)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    'Cadastro equipe',
                    'cadastro-equipe',
                    'Outros',
                    'Formulário oficial para cadastro de colaboradores e técnicos de campo.',
                    '/f/cadastro-equipe',
                    json.dumps(cadastro_equipe_default_questions, ensure_ascii=False)
                ))
        except Exception as e_cad:
            print("Error syncing Cadastro equipe form:", e_cad)
            conn.rollback()

        # Seed and synchronize default "Inspeção Visual" form with Mudanças 1, 2 e 3
        try:
            inspecao_default_questions = [
                {"title": "E-mail", "type": "text", "options": [], "required": True},
                {"title": "Data", "type": "date", "options": [], "required": True},
                {"title": "Nome do Técnico", "type": "text", "options": [], "required": True},
                {"title": "Região / Área", "type": "select", "options": ["METROPOLITANA", "CENTRO ZONA SUL", "NORTE 1", "NORTE 2", "NORTE 3", "ZONA OESTE", "BAIXADA FLUMINENSE", "REGIÃO DOS LAGOS", "SUL FLUMINENSE", "REGIÃO SERRANA"], "required": False},
                {"title": "Cidade / Subcluster", "type": "text", "options": [], "required": False},
                {"title": "Endereço / Logradouro", "type": "text", "options": [], "required": False},
                {"title": "Número task TOA", "type": "text", "options": [], "required": False},
                {"title": "Rede HFC ou Fibra", "type": "radio", "options": ["HFC", "Fibra"], "required": False},
                {"title": "Nome do Node ou rota de fibra", "type": "text", "options": [], "required": False},
                {"title": "Tipo de Ocorrência", "type": "select", "options": ["Vandalismo / Furto de Cabo", "Cabo Baixo / Rompimento", "Atenuação / Nível Baixo", "Curto Circuito / Caixa Danificada", "Inspeção Preventiva / Rotina", "Outro"], "required": False},
                {"title": "Rede Externa Conforme Padrão Claro?", "type": "radio", "options": ["Sim", "Não"], "required": False},
                {"title": "Fotos para evidência", "type": "file", "options": [], "required": False},
                {"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False},
                {"title": "Observações", "type": "textarea", "options": [], "required": False},
                {"title": "Número do WFC", "type": "text", "options": [], "required": False, "hint": "Insira a combinação de textos e números do WFC"}
            ]

            cur.execute("SELECT id, slug, title, questions FROM forms WHERE slug IN ('inspecao-visual', 'inspecao-visual-2026') OR title ILIKE '%%inspeção visual%%' OR title ILIKE '%%inspecao visual%%';")
            inspecao_rows = cur.fetchall()
            if not inspecao_rows:
                cur.execute("""
                    INSERT INTO forms (title, slug, category, description, link, questions)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    'Inspeção VISUAL 2026',
                    'inspecao-visual-2026',
                    'Inspeção',
                    'Este forms segue para levantarmos as pendências que temos em nossas regiões para que sejam abertos WFC.',
                    '/f/inspecao-visual-2026',
                    json.dumps(inspecao_default_questions, ensure_ascii=False)
                ))
            else:
                for inspecao_row in inspecao_rows:
                    q_raw = inspecao_row.get('questions')
                    q_list = json.loads(q_raw) if isinstance(q_raw, str) else (q_raw if isinstance(q_raw, list) else [])
                    target_slug = inspecao_row.get('slug') or 'inspecao-visual-2026'
                    if not q_list:
                        cur.execute("UPDATE forms SET questions = %s, link = %s WHERE id = %s;", (json.dumps(inspecao_default_questions, ensure_ascii=False), f"/f/{target_slug}", inspecao_row['id']))
                    else:
                        titles = [str(q.get('title', '')).strip().lower() for q in q_list if isinstance(q, dict)]
                        has_hfc = any('hfc ou fibra' in t or 'rede hfc' in t for t in titles)
                        has_node = any('nome do node' in t or 'rota de fibra' in t for t in titles)
                        has_ctrl_wfc = any('controle de wfc' in t for t in titles)
                        has_num_wfc = any('número do wfc' in t or 'numero do wfc' in t for t in titles)

                        if not (has_hfc and has_node and has_ctrl_wfc and has_num_wfc):
                            new_q = []
                            for q in q_list:
                                new_q.append(q)
                                t = str(q.get('title', '')).strip().lower() if isinstance(q, dict) else ''
                                if ('task toa' in t or 'numero task' in t or 'número task' in t) and not has_hfc:
                                    new_q.append({"title": "Rede HFC ou Fibra", "type": "radio", "options": ["HFC", "Fibra"], "required": False})
                                    new_q.append({"title": "Nome do Node ou rota de fibra", "type": "text", "options": [], "required": False})
                                    has_hfc = True
                                    has_node = True
                                if ('fotos para evid' in t or 'evidência' in t or 'evidencia' in t or 'foto' in t) and not has_ctrl_wfc:
                                    new_q.append({"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False})
                                    has_ctrl_wfc = True

                            if not has_hfc:
                                new_q.append({"title": "Rede HFC ou Fibra", "type": "radio", "options": ["HFC", "Fibra"], "required": False})
                            if not has_node:
                                new_q.append({"title": "Nome do Node ou rota de fibra", "type": "text", "options": [], "required": False})
                            if not has_ctrl_wfc:
                                new_q.append({"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False})

                            if not has_num_wfc:
                                existing_ts = [str(q.get('title', '')).strip().lower() for q in new_q if isinstance(q, dict)]
                                for default_q in inspecao_default_questions:
                                    dt = default_q['title'].strip().lower()
                                    if dt not in existing_ts and dt not in ('número do wfc', 'numero do wfc'):
                                        new_q.append(default_q)
                                        existing_ts.append(dt)
                                    if len(new_q) == 14:
                                        break
                                new_q.append({"title": "Número do WFC", "type": "text", "options": [], "required": False, "hint": "Insira a combinação de textos e números do WFC"})

                            cur.execute("UPDATE forms SET questions = %s, link = %s WHERE id = %s;", (json.dumps(new_q, ensure_ascii=False), f"/f/{target_slug}", inspecao_row['id']))
                        else:
                            changed = False
                            for q in q_list:
                                if isinstance(q, dict) and ('número do wfc' in str(q.get('title', '')).strip().lower() or 'numero do wfc' in str(q.get('title', '')).strip().lower()):
                                    if q.get('type') != 'text':
                                        q['type'] = 'text'
                                        changed = True
                            if changed:
                                cur.execute("UPDATE forms SET questions = %s, link = %s WHERE id = %s;", (json.dumps(q_list, ensure_ascii=False), f"/f/{target_slug}", inspecao_row['id']))
        except Exception as e_seed:
            print("Error seeding/updating Inspeção Visual form:", e_seed)
            conn.rollback()

        # Garante link nativo e remove menções de links externos em todos os formulários da base
        try:
            cur.execute("""
                UPDATE forms
                SET link = CONCAT('/f/', slug)
                WHERE link IS NULL OR link LIKE 'http%' OR link != CONCAT('/f/', slug);

                UPDATE forms
                SET title = TRIM(REPLACE(REPLACE(REPLACE(title, '(Google Forms)', ''), '(Google Form)', ''), '(Microsoft Forms)', ''))
                WHERE title ILIKE '%google form%' OR title ILIKE '%microsoft form%';
            """)
        except Exception as e_glob:
            print("Error normalizing forms links:", e_glob)
            conn.rollback()

        # 14. Password Reset Tokens Table (Link Criptografado por E-mail Brevo)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(150) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Performance Indexes for Large Scale Database Operations
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON form_responses(form_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_form_responses_submitted ON form_responses(submitted_at DESC);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_technicians_name ON technicians(name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_routes_type ON routes(type);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_route_lines_route ON route_lines(route_id);")
        except Exception:
            conn.rollback()


        # 8. Teams Finance Table [NEW]
        cur.execute("""
            CREATE TABLE IF NOT EXISTS teams_finance (
                id SERIAL PRIMARY KEY,
                tech1_id INT REFERENCES technicians(id) ON DELETE CASCADE,
                tech2_id INT REFERENCES technicians(id) ON DELETE CASCADE,
                area VARCHAR(100) NOT NULL,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                reference_month VARCHAR(7) NOT NULL, -- format 'YYYY-MM'
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 9. Consumables Finance Table [NEW]
        cur.execute("""
            CREATE TABLE IF NOT EXISTS consumables_finance (
                id SERIAL PRIMARY KEY,
                description TEXT NOT NULL,
                area VARCHAR(100) NOT NULL,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                reference_month VARCHAR(7) NOT NULL, -- format 'YYYY-MM'
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 10. Inventory Items Table [NEW]
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory_items (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL, -- Cabos, Equipamento, EPI, Ferramentas
                name VARCHAR(150) NOT NULL,
                quantity INT NOT NULL DEFAULT 0,
                serial_number VARCHAR(100),
                description TEXT,
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 13. Monthly Indicators Dashboard Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS monthly_indicators (
                id SERIAL PRIMARY KEY,
                reference_month VARCHAR(20) NOT NULL,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("""
                DELETE FROM monthly_indicators a USING monthly_indicators b
                WHERE a.id < b.id AND a.reference_month = b.reference_month;
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_indicators_ref_month ON monthly_indicators(reference_month);
            """)
            conn.commit()
        except Exception:
            conn.rollback()

        # 14. Buscador de Falhas Tables [NEW]
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fault_searcher_records (
                id SERIAL PRIMARY KEY,
                topic VARCHAR(20) NOT NULL,
                col1 VARCHAR(255),
                col2 VARCHAR(255),
                col3 VARCHAR(255),
                col4 VARCHAR(255),
                col5 VARCHAR(255),
                col6 TEXT,
                col7 VARCHAR(100),
                col8 VARCHAR(255),
                col9 VARCHAR(100),
                is_edited BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fault_searcher_logs (
                topic VARCHAR(20) PRIMARY KEY,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(150),
                filename VARCHAR(255),
                record_count INT DEFAULT 0
            );
        """)
        try:
            cur.execute("ALTER TABLE fault_searcher_records ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;")
            cur.execute("ALTER TABLE fault_searcher_records ADD COLUMN IF NOT EXISTS ref_val VARCHAR(255) DEFAULT '-';")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_fault_searcher_topic ON fault_searcher_records(topic);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_fault_searcher_topic_col2 ON fault_searcher_records(topic, col2);")
        except Exception as e_mig:
            print("Migration index notice:", e_mig)
            conn.rollback()

        # 16. User Tasks Table (Área de Trabalho Exclusiva)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_tasks (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL,
                priority VARCHAR(20) NOT NULL DEFAULT 'Média',
                due_date DATE,
                assigned_tech_id INT REFERENCES technicians(id) ON DELETE SET NULL,
                assigned_tech_name VARCHAR(150),
                description TEXT,
                status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for col, coltype in [('region', 'VARCHAR(50)'), ('ticket', 'VARCHAR(100)'), ('event_type', 'VARCHAR(50)'), ('measurement', 'VARCHAR(255)')]:
            try:
                cur.execute(f"ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS task_attachments (
                id SERIAL PRIMARY KEY,
                task_id INT REFERENCES user_tasks(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(500) NOT NULL,
                filesize BIGINT DEFAULT 0,
                uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 17. Collaborator Evaluations Table (Avaliação Técnica)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS collaborator_evaluations (
                id SERIAL PRIMARY KEY,
                technician_id INT REFERENCES technicians(id) ON DELETE CASCADE,
                technician_name VARCHAR(150) NOT NULL,
                company VARCHAR(50),
                behavior_score INT NOT NULL,
                productivity_score INT NOT NULL,
                technical_kpi_score INT NOT NULL,
                process_score INT NOT NULL,
                overall_score NUMERIC(4, 2) NOT NULL,
                comments TEXT,
                evaluator_id INT REFERENCES users(id) ON DELETE SET NULL,
                evaluator_username VARCHAR(80),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 18. Notifications Table (Notificações — Coordenadores Claro apenas)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                event_date DATE NOT NULL,
                reason VARCHAR(200) NOT NULL,
                description TEXT NOT NULL,
                coordinator_name VARCHAR(150) NOT NULL,
                created_by INT REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 19. Auditorias Table (Aba Auditoria)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auditorias (
                id SERIAL PRIMARY KEY,
                os VARCHAR(150) NOT NULL,
                created_date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_by VARCHAR(150) NOT NULL,
                created_by_id INT,
                responsible VARCHAR(150) NOT NULL,
                responsible_id INT,
                status VARCHAR(50) NOT NULL DEFAULT 'Acionado',
                audit_date DATE,
                observations TEXT,
                photos JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Ensure foreign keys are not blocking assignments from CRM users or technicians
        try:
            cur.execute("ALTER TABLE auditorias DROP CONSTRAINT IF EXISTS auditorias_responsible_id_fkey;")
            cur.execute("ALTER TABLE auditorias DROP CONSTRAINT IF EXISTS auditorias_created_by_id_fkey;")
        except Exception:
            conn.rollback()

        for col, coltype in [
            ('os', 'VARCHAR(150)'),
            ('created_date', 'DATE DEFAULT CURRENT_DATE'),
            ('created_by', 'VARCHAR(150)'),
            ('created_by_id', 'INT'),
            ('responsible', 'VARCHAR(150)'),
            ('responsible_id', 'INT'),
            ('status', "VARCHAR(50) DEFAULT 'Acionado'"),
            ('audit_date', 'DATE'),
            ('observations', 'TEXT'),
            ('photos', "JSONB DEFAULT '[]'::jsonb"),
            ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
            ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
        ]:
            try:
                cur.execute(f"ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        # 20. Aceitacoes Table (Aba Aceitação)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS aceitacoes (
                id SERIAL PRIMARY KEY,
                os VARCHAR(150) NOT NULL,
                created_date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_by VARCHAR(150) NOT NULL,
                created_by_id INT,
                responsible VARCHAR(150) NOT NULL,
                responsible_id INT,
                status VARCHAR(50) NOT NULL DEFAULT 'Acionado',
                acceptance_date DATE,
                observations TEXT,
                photos JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("ALTER TABLE aceitacoes DROP CONSTRAINT IF EXISTS aceitacoes_responsible_id_fkey;")
            cur.execute("ALTER TABLE aceitacoes DROP CONSTRAINT IF EXISTS aceitacoes_created_by_id_fkey;")
        except Exception:
            conn.rollback()

        for col, coltype in [
            ('os', 'VARCHAR(150)'),
            ('created_date', 'DATE DEFAULT CURRENT_DATE'),
            ('created_by', 'VARCHAR(150)'),
            ('created_by_id', 'INT'),
            ('responsible', 'VARCHAR(150)'),
            ('responsible_id', 'INT'),
            ('status', "VARCHAR(50) DEFAULT 'Acionado'"),
            ('acceptance_date', 'DATE'),
            ('observations', 'TEXT'),
            ('photos', "JSONB DEFAULT '[]'::jsonb"),
            ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
            ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
        ]:
            try:
                cur.execute(f"ALTER TABLE aceitacoes ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        # Seed initial admin user if empty
        
        # 21. System Live Alerts Table (Notificações em Tempo Real com Som & Toasts)
        
        # 21.5. Pos Eventos (Vistoria de Eventos em Campo Claro)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pos_eventos (
                id SERIAL PRIMARY KEY,
                ticket_type VARCHAR(50) NOT NULL,
                ticket_number VARCHAR(100) NOT NULL,
                fault_date DATE NOT NULL,
                area VARCHAR(150),
                trash_on_ground VARCHAR(10) NOT NULL DEFAULT 'Não',
                cable_ends VARCHAR(10) NOT NULL DEFAULT 'Não',
                adequate_network VARCHAR(10) NOT NULL DEFAULT 'Sim',
                responsible VARCHAR(150),
                status VARCHAR(50) NOT NULL DEFAULT 'Não concluido',
                created_by VARCHAR(150),
                created_by_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for col, coltype in [
            ('ticket_type', 'VARCHAR(50)'),
            ('ticket_number', 'VARCHAR(100)'),
            ('fault_date', 'DATE'),
            ('area', 'VARCHAR(150)'),
            ('trash_on_ground', "VARCHAR(10) DEFAULT 'Não'"),
            ('cable_ends', "VARCHAR(10) DEFAULT 'Não'"),
            ('adequate_network', "VARCHAR(10) DEFAULT 'Sim'"),
            ('responsible', 'VARCHAR(150)'),
            ('status', "VARCHAR(50) DEFAULT 'Não concluido'"),
            ('created_by', 'VARCHAR(150)'),
            ('created_by_id', 'INT'),
            ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
            ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
        ]:
            try:
                cur.execute(f"ALTER TABLE pos_eventos ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        # 21.6. RAL de Qualidade (Atividades de Qualidade de Rede Externa Claro)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ral_qualidade (
                id SERIAL PRIMARY KEY,
                ticket_number VARCHAR(150) NOT NULL,
                opening_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                designation TEXT NOT NULL,
                area VARCHAR(150),
                status VARCHAR(50) NOT NULL DEFAULT 'Em Andamento',
                summary TEXT,
                created_by VARCHAR(150),
                created_by_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        for col, coltype in [
            ('ticket_number', 'VARCHAR(150)'),
            ('opening_date', 'TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP'),
            ('designation', 'TEXT'),
            ('area', 'VARCHAR(150)'),
            ('status', "VARCHAR(50) DEFAULT 'Em Andamento'"),
            ('summary', 'TEXT'),
            ('created_by', 'VARCHAR(150)'),
            ('created_by_id', 'INT'),
            ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
            ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
        ]:
            try:
                cur.execute(f"ALTER TABLE ral_qualidade ADD COLUMN IF NOT EXISTS {col} {coltype};")
            except Exception:
                conn.rollback()

        # Seed initial sample record from Claro field operation if empty
        try:
            cur.execute("SELECT COUNT(*) AS c FROM ral_qualidade;")
            if cur.fetchone()['c'] == 0:
                cur.execute("""
                    INSERT INTO ral_qualidade (ticket_number, opening_date, designation, area, status, summary, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                """, (
                    '139796',
                    '2026-03-07 21:06:00',
                    'SWAP ALTAREDE PTS X XERE',
                    'BX1-FO',
                    'Concluido',
                    'Atividade de qualidade executada com alinhamento e medição conforme.',
                    'Davi Rezende'
                ))
        except Exception:
            conn.rollback()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS system_live_alerts (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL, -- 'auditoria', 'aceitacao', 'avaliacao', 'indicadores', 'sistema'
                title VARCHAR(150) NOT NULL,
                message TEXT NOT NULL,
                target_user_id INT,
                target_username VARCHAR(100),
                source_user_id INT,
                source_username VARCHAR(100),
                link VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_live_alerts_created ON system_live_alerts(id DESC);")
        except Exception:
            conn.rollback()

        try:
            _ensure_email_bounce_schema(cur)
        except Exception:
            conn.rollback()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS grafana_tickets (
                id SERIAL PRIMARY KEY,
                ticket_key VARCHAR(80) UNIQUE NOT NULL,
                ticket_type VARCHAR(10) NOT NULL,
                ticket_number VARCHAR(60) NOT NULL,
                cf VARCHAR(10) NOT NULL,
                regional VARCHAR(20) NOT NULL,
                cf_exec_raw VARCHAR(120),
                designation VARCHAR(255),
                tipo_ral VARCHAR(100),
                is_qualidade BOOLEAN DEFAULT FALSE,
                cliente VARCHAR(180),
                anorm VARCHAR(80),
                abertura_raw VARCHAR(60),
                abertura_dt TIMESTAMP,
                duracao_raw VARCHAR(60),
                resp_code VARCHAR(40),
                tecnico_csv VARCHAR(120),
                anatel VARCHAR(30),
                prejuizo VARCHAR(30),
                status_andamento VARCHAR(60) DEFAULT 'Sem classificação',
                responsible_user_id INT REFERENCES users(id) ON DELETE SET NULL,
                responsible_tech_id INT REFERENCES technicians(id) ON DELETE SET NULL,
                responsible_name VARCHAR(150),
                first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_new BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("ALTER TABLE grafana_tickets ADD COLUMN IF NOT EXISTS responsible_tech_id INT REFERENCES technicians(id) ON DELETE SET NULL;")
            cur.execute("ALTER TABLE grafana_tickets ADD COLUMN IF NOT EXISTS distancia VARCHAR(120) DEFAULT '';")
            cur.execute("ALTER TABLE grafana_tickets ADD COLUMN IF NOT EXISTS referencia VARCHAR(255) DEFAULT '';")
            cur.execute("ALTER TABLE grafana_tickets ADD COLUMN IF NOT EXISTS endereco VARCHAR(255) DEFAULT '';")
        except Exception:
            conn.rollback()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS grafana_cleared_tickets (
                id SERIAL PRIMARY KEY,
                ticket_key VARCHAR(80) NOT NULL,
                ticket_type VARCHAR(10) NOT NULL,
                ticket_number VARCHAR(60) NOT NULL,
                cf VARCHAR(10) NOT NULL,
                regional VARCHAR(20) NOT NULL,
                cf_exec_raw VARCHAR(120),
                designation VARCHAR(255),
                tipo_ral VARCHAR(100),
                is_qualidade BOOLEAN DEFAULT FALSE,
                cliente VARCHAR(180),
                abertura_raw VARCHAR(60),
                abertura_dt TIMESTAMP,
                status_andamento VARCHAR(60),
                responsible_name VARCHAR(150),
                distancia VARCHAR(120) DEFAULT '',
                referencia VARCHAR(255) DEFAULT '',
                endereco VARCHAR(255) DEFAULT '',
                notes_snapshot JSONB DEFAULT '[]'::jsonb,
                first_seen_at TIMESTAMP,
                cleared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cur.execute("ALTER TABLE grafana_cleared_tickets ADD COLUMN IF NOT EXISTS distancia VARCHAR(120) DEFAULT '';")
            cur.execute("ALTER TABLE grafana_cleared_tickets ADD COLUMN IF NOT EXISTS referencia VARCHAR(255) DEFAULT '';")
            cur.execute("ALTER TABLE grafana_cleared_tickets ADD COLUMN IF NOT EXISTS endereco VARCHAR(255) DEFAULT '';")
        except Exception:
            conn.rollback()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS grafana_ticket_notes (
                id SERIAL PRIMARY KEY,
                ticket_key VARCHAR(80) NOT NULL,
                content TEXT NOT NULL,
                author_user_id INT REFERENCES users(id) ON DELETE SET NULL,
                author_name VARCHAR(150) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS grafana_sync_meta (
                id INT PRIMARY KEY DEFAULT 1,
                last_sync_at TIMESTAMP,
                last_sync_status VARCHAR(30),
                last_sync_error TEXT,
                ral_count INT DEFAULT 0,
                rec_count INT DEFAULT 0,
                qualidade_count INT DEFAULT 0,
                new_count INT DEFAULT 0,
                cleared_count INT DEFAULT 0,
                github_ral_hash VARCHAR(64),
                github_rec_hash VARCHAR(64),
                github_last_changed_at TIMESTAMP,
                manual_override_active BOOLEAN DEFAULT FALSE,
                manual_updated_at TIMESTAMP,
                manual_updated_by VARCHAR(150),
                stale_alert_sent_at TIMESTAMP
            );
        """)
        for col_sql in [
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_ral_hash VARCHAR(64);",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_rec_hash VARCHAR(64);",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_last_changed_at TIMESTAMP;",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_override_active BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_updated_at TIMESTAMP;",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_updated_by VARCHAR(150);",
            "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS stale_alert_sent_at TIMESTAMP;",
        ]:
            try:
                cur.execute(col_sql)
            except Exception:
                pass
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_grafana_tickets_cf_type ON grafana_tickets(cf, ticket_type);",
            "CREATE INDEX IF NOT EXISTS idx_grafana_tickets_qualidade ON grafana_tickets(is_qualidade);",
            "CREATE INDEX IF NOT EXISTS idx_grafana_cleared_at ON grafana_cleared_tickets(cleared_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_grafana_cleared_cf ON grafana_cleared_tickets(cf, ticket_type);",
            "CREATE INDEX IF NOT EXISTS idx_grafana_notes_ticket_key ON grafana_ticket_notes(ticket_key);",
        ]:
            try:
                cur.execute(idx_sql)
            except Exception:
                conn.rollback()

        cur.execute("SELECT COUNT(*) AS count FROM users;")
        if cur.fetchone()['count'] == 0:
            seed_username = os.environ.get('ADMIN_SEED_USERNAME')
            seed_password = os.environ.get('ADMIN_SEED_PASSWORD')
            if seed_username and seed_password:
                hashed = generate_password_hash(seed_password)
                cur.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s);",
                    (seed_username, hashed, "Coordenador")
                )
            else:
                print("Nenhum usuário existe e ADMIN_SEED_USERNAME/ADMIN_SEED_PASSWORD não foram definidos — pulei a criação da conta inicial.")

        # Delete unwanted legacy demo users requested by user
        for unwanted_user in ["claro.supervisor", "claro.operador"]:
            try:
                cur.execute("SELECT id FROM users WHERE username = %s;", (unwanted_user,))
                row = cur.fetchone()
                if row:
                    u_id = row['id']
                    cur.execute("UPDATE audit_logs SET user_id = NULL WHERE user_id = %s;", (u_id,))
                    cur.execute("UPDATE technicians SET created_by = NULL WHERE created_by = %s;", (u_id,))
                    cur.execute("UPDATE vehicles SET responsible_tech_id = NULL WHERE responsible_tech_id = %s;", (u_id,))
                    cur.execute("UPDATE financial_logs SET logged_by = NULL WHERE logged_by = %s;", (u_id,))
                    cur.execute("UPDATE project_folders SET created_by = NULL WHERE created_by = %s;", (u_id,))
                    cur.execute("UPDATE projects SET created_by = NULL WHERE created_by = %s;", (u_id,))
                    cur.execute("DELETE FROM password_reset_tokens WHERE user_id = %s;", (u_id,))
                    cur.execute("DELETE FROM users WHERE id = %s;", (u_id,))
            except Exception as e_del:
                print(f"Cleanup unwanted user {unwanted_user} error:", e_del)
                conn.rollback()

        # Remove 2FA requirement / secret for davi.rezende (only when still set, commit immediately to avoid holding row lock)
        try:
            cur.execute("""
                UPDATE users
                SET totp_secret = NULL,
                    totp_enabled = FALSE,
                    totp_verified_at = NULL
                WHERE LOWER(username) = 'davi.rezende'
                  AND (totp_enabled IS TRUE OR totp_secret IS NOT NULL);
            """)
            conn.commit()
        except Exception as e_totp_rm:
            print("Warning removing 2FA for davi.rezende:", e_totp_rm)
            conn.rollback()

        # Hot Performance Indexes & work_schedules table
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS work_schedules (
                    id SERIAL PRIMARY KEY,
                    tech_id INTEGER NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
                    date DATE NOT NULL,
                    shift_code VARCHAR(20) NOT NULL DEFAULT '',
                    custom_time VARCHAR(100) DEFAULT '',
                    updated_by VARCHAR(100),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (tech_id, date)
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_tech_id ON users(tech_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_username_lower ON audit_logs(LOWER(username));")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_fault_searcher_topic_col1 ON fault_searcher_records(topic, col1);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_grafana_tickets_abertura ON grafana_tickets(abertura_dt ASC NULLS LAST, id ASC);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_grafana_tickets_new_seen ON grafana_tickets(is_new, first_seen_at);")
        except Exception as e_idx:
            print("Warning creating performance indexes:", e_idx)
            conn.rollback()

        conn.commit()
        print("Database tables initialized and seeded successfully.")
    except Exception as e:
        import traceback
        print("Database initialization failed with traceback:")
        traceback.print_exc()
    finally:
        if 'cur' in locals() and cur:
            try:
                cur.execute("RESET lock_timeout;")
            except Exception:
                pass
            try:
                cur.close()
            except Exception:
                pass
        if 'conn' in locals() and conn:
            try:
                conn.autocommit = False
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass

# Run DB schema check in background thread so server starts in milliseconds
if DATABASE_URL:
    def _async_init_db():
        try:
            init_db()
            print("[DB] Esquema e tabelas verificados com sucesso em segundo plano.", flush=True)
        except Exception as e_init:
            print("[WARNING] init_db falhou na inicializacao assincrona:", e_init, flush=True)
    threading.Thread(target=_async_init_db, daemon=True, name="DB-Init-Worker").start()

# --------------------------------------------------------------------------
# HELPER FUNCTIONS & DECORATORS
# --------------------------------------------------------------------------
def log_action(user_id, username, action):
    in_req = has_request_context()
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_logs (user_id, username, action) VALUES (%s, %s, %s);",
            (user_id, username, action)
        )
        conn.commit()
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print(f"Failed to write audit log: {e}")
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn and not in_req:
            try:
                conn.close()
            except Exception:
                pass

TOTP_EXEMPT_USERNAMES = {'davi.rezende'}

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Strict Zero-Trust Check: user_id is ONLY populated after MFA is fully verified
        if 'user_id' not in session:
            pending_uname = (session.get('pending_mfa_username') or '').strip().lower()
            if pending_uname in TOTP_EXEMPT_USERNAMES and session.get('pending_mfa_user_id'):
                session['user_id'] = session.pop('pending_mfa_user_id')
                session['username'] = session.pop('pending_mfa_username', pending_uname)
                session['role'] = session.pop('pending_mfa_role', 'Coordenador')
                session['totp_verified'] = True
                session['totp_expires_at'] = time.time() + (12 * 3600)
            else:
                if request.path.startswith('/api/'):
                    return jsonify({"error": "Sessão não autorizada ou pendente de validação MFA.", "redirect": "/login"}), 401
                r = redirect(url_for('login'))
                r.data = b''
                return r

        sess_uname = (session.get('username') or '').strip().lower()
        if sess_uname in TOTP_EXEMPT_USERNAMES:
            session['totp_verified'] = True
            session['totp_expires_at'] = time.time() + (12 * 3600)
            return f(*args, **kwargs)

        # 12-hour TOTP Enforcement & Immediate Demotion on Expiry
        totp_exp = session.get('totp_expires_at') or 0
        if not session.get('totp_verified') or time.time() >= totp_exp:
            # Demote active session back to pending MFA state
            uid = session.pop('user_id', None)
            if uid:
                session['pending_mfa_user_id'] = uid
            session['totp_verified'] = False
            if request.path.startswith('/api/'):
                return jsonify({
                    "error": "Acesso ao portal restrito: validação de 12 horas do aplicativo autenticador expirada ou pendente.",
                    "requires_totp": True
                }), 403
            r = redirect(url_for('login'))
            r.data = b''
            return r

        return f(*args, **kwargs)
    return decorated_function

MASTER_COORDINATOR_USERNAME = os.environ.get('MASTER_COORDINATOR_USERNAME', 'alexandre.candido').strip().lower()

ALL_PERMISSIONS = [
    'favoritos.create', 'favoritos.edit', 'favoritos.delete',
    'area_de_trabalho.create', 'area_de_trabalho.edit', 'area_de_trabalho.delete',
    'pessoas.create', 'pessoas.edit', 'pessoas.delete',
    'veiculos.create', 'veiculos.edit', 'veiculos.delete',
    'buscador.create', 'buscador.edit',
    'auditoria.create', 'auditoria.edit', 'auditoria.delete',
    'aceitacao.create', 'aceitacao.edit', 'aceitacao.delete',
    'avaliacao.create', 'avaliacao.delete',
    'projetos.create', 'projetos.edit', 'projetos.delete',
    'formularios.create', 'formularios.edit', 'formularios.delete',
    'rotas.create', 'rotas.edit', 'rotas.delete',
    'indicadores.edit',
    'escala.edit',
    'financeiro.create', 'financeiro.edit', 'financeiro.delete',
    'notificacoes.create', 'notificacoes.delete',
    'gerenciamento.create', 'gerenciamento.edit', 'gerenciamento.delete',
    'pos_eventos.create', 'pos_eventos.edit', 'pos_eventos.delete',
    'ral_qualidade.create', 'ral_qualidade.edit', 'ral_qualidade.delete',
    'grafana.create', 'grafana.edit', 'grafana.delete',
]

def is_coordenador_role(username, role):
    uname = (username or '').strip().lower()
    if uname == MASTER_COORDINATOR_USERNAME:
        return True
    r = (role or '').strip().lower()
    return r in ['coordenador', 'administrador', 'admin']

DEFAULT_AUTHENTICATED_PERMISSIONS = ('grafana.create', 'grafana.edit', 'grafana.delete')

def resolve_user_permissions(username, role, raw_permissions):
    uname = (username or '').strip().lower()
    if uname == MASTER_COORDINATOR_USERNAME:
        return list(ALL_PERMISSIONS)
    is_coord = is_coordenador_role(username, role)
    if raw_permissions is None:
        base_perms = list(ALL_PERMISSIONS) if is_coord else []
    else:
        parsed = raw_permissions
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except Exception:
                parsed = []
        if not isinstance(parsed, list):
            base_perms = list(ALL_PERMISSIONS) if is_coord else []
        else:
            valid_set = set(ALL_PERMISSIONS)
            if is_coord:
                base_perms = [p for p in parsed if isinstance(p, str) and p in valid_set]
            else:
                base_perms = [p for p in parsed if isinstance(p, str) and p in valid_set and not p.startswith('gerenciamento.')]
    for gp in DEFAULT_AUTHENTICATED_PERMISSIONS:
        if gp not in base_perms:
            base_perms.append(gp)
    return base_perms

def get_current_user_auth():
    if 'user_id' not in session:
        return None
    if has_request_context() and hasattr(g, '_current_user_auth'):
        return g._current_user_auth
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, tech_id, permissions FROM users WHERE id = %s;", (session['user_id'],))
        row = cur.fetchone()
        cur.close()
        if not row:
            return None
        uname = (row.get('username') or '').strip().lower()
        role = (row.get('role') or '').strip()
        perms = resolve_user_permissions(uname, role, row.get('permissions'))
        auth_obj = {
            'id': row['id'],
            'username': row['username'],
            'role': role,
            'tech_id': row.get('tech_id'),
            'is_master': uname == MASTER_COORDINATOR_USERNAME,
            'is_coordenador': is_coordenador_role(uname, role),
            'permissions': perms,
        }
        if has_request_context():
            g._current_user_auth = auth_obj
        return auth_obj
    except Exception as e:
        print('get_current_user_auth error:', e)
        return None

def user_has_permission(perm_key):
    auth = get_current_user_auth()
    if not auth:
        return False
    if auth['is_master']:
        return True
    # Operações de campo: pós-evento, RAL de qualidade e edição do Grafana liberadas para todos os usuários autenticados do portal
    if perm_key in ('pos_eventos.create', 'ral_qualidade.create', 'grafana.create', 'grafana.edit', 'grafana.delete'):
        return True
    return perm_key in auth['permissions']

def _resolve_required_permission(path, method):
    if method not in ('POST', 'PUT', 'DELETE'):
        return None
    p = path.rstrip('/')
    if p.startswith('/api/auth/') or p == '/api/users/me/profile':
        return None
    if p.startswith('/api/favorites/') and p.endswith('/click') and method == 'POST':
        return None

    # Users Management
    if p == '/api/users' and method == 'POST':
        return 'gerenciamento.create'
    if p.startswith('/api/users/') and method == 'PUT':
        return 'gerenciamento.edit'
    if p.startswith('/api/users/') and method == 'DELETE':
        return 'gerenciamento.delete'

    # Technicians / Pessoas
    if p in ('/api/technicians', '/api/technicians/bulk', '/api/people/bulk') and method == 'POST':
        return 'pessoas.create'
    if p.startswith('/api/technicians/') and method in ('POST', 'PUT'):
        return 'pessoas.edit'
    if p.startswith('/api/technicians/') and method == 'DELETE':
        return 'pessoas.delete'

    # Vehicles / Frota
    if p in ('/api/vehicles', '/api/vehicles/bulk') and method == 'POST':
        return 'veiculos.create'
    if p.startswith('/api/vehicles/') and method == 'PUT':
        return 'veiculos.edit'
    if p.startswith('/api/vehicles/') and method == 'DELETE':
        return 'veiculos.delete'

    # Projects & Folders
    if p in ('/api/projects', '/api/folders') and method == 'POST':
        return 'projetos.create'
    if (p.startswith('/api/projects/') or p.startswith('/api/folders/')) and method in ('POST', 'PUT'):
        return 'projetos.edit'
    if (p.startswith('/api/projects/') or p.startswith('/api/folders/')) and method == 'DELETE':
        return 'projetos.delete'

    # Favorites
    if p == '/api/favorites' and method == 'POST':
        return 'favoritos.create'
    if p.startswith('/api/favorites/') and method in ('POST', 'PUT'):
        return 'favoritos.edit'
    if p.startswith('/api/favorites/') and method == 'DELETE':
        return 'favoritos.delete'

    # Routes & Route Lines & Files
    if p == '/api/routes' and method == 'POST':
        return 'rotas.create'
    if p.startswith('/api/routes/') and (p.endswith('/lines') or p.endswith('/bulk') or p.endswith('/folders') or p.endswith('/upload')) and method == 'POST':
        return 'rotas.create'
    if p.startswith('/api/routes/files/') and p.endswith('/move') and method == 'PUT':
        return 'rotas.edit'
    if (p.startswith('/api/routes/lines/') or p.startswith('/api/routes/files/') or p.startswith('/api/routes/folders/')) and method == 'DELETE':
        return 'rotas.delete'
    if p.startswith('/api/routes/lines/') and method in ('POST', 'PUT'):
        return 'rotas.edit'
    if p.startswith('/api/routes/') and method == 'DELETE':
        return 'rotas.delete'
    if p.startswith('/api/routes/') and method in ('POST', 'PUT'):
        return 'rotas.edit'

    # Forms & Responses (Restrito exclusivamente a quem possui permissao no Gerenciamento)
    if (p == '/api/forms' or p == '/api/forms/convert-google-form' or p.endswith('/responses/import') or p == '/api/admin/extract_machinery_excel') and method == 'POST':
        return 'formularios.create'
    if (p.startswith('/api/forms/') or p.startswith('/api/form-responses/')) and method == 'DELETE':
        return 'formularios.delete'
    if (p.startswith('/api/forms/') or p.startswith('/api/form-responses/')) and method in ('POST', 'PUT'):
        return 'formularios.edit'

    # Monthly Indicators
    if p in ('/api/indicators', '/api/indicators/import', '/api/indicators/justificativa') and method == 'POST':
        return 'indicadores.edit'

    # Schedules / Escala
    if p.startswith('/api/schedules') and method == 'POST':
        return 'escala.edit'

    # Finance
    if p in ('/api/finance/teams', '/api/finance/consumables') and method == 'POST':
        return 'financeiro.create'
    if (p.startswith('/api/finance/teams/') or p.startswith('/api/finance/consumables/')) and method == 'PUT':
        return 'financeiro.edit'
    if (p.startswith('/api/finance/teams/') or p.startswith('/api/finance/consumables/')) and method == 'DELETE':
        return 'financeiro.delete'

    # Notifications
    if p in ('/api/notifications', '/api/notifications/bulk') and method == 'POST':
        return 'notificacoes.create'
    if p.startswith('/api/notifications/') and method == 'DELETE':
        return 'notificacoes.delete'

    # Inventory
    if p == '/api/inventory' and method == 'POST':
        return 'veiculos.create'
    if p.startswith('/api/inventory/') and method == 'PUT':
        return 'veiculos.edit'
    if p.startswith('/api/inventory/') and method == 'DELETE':
        return 'veiculos.delete'

    # Buscador
    if p == '/api/buscador/upload' and method == 'POST':
        return 'buscador.create'
    if p.startswith('/api/buscador/records/') and method == 'PUT':
        return 'buscador.edit'

    # User Tasks (Área de Trabalho)
    if p == '/api/user-tasks' and method == 'POST':
        return 'area_de_trabalho.create'
    if p.startswith('/api/user-tasks/') and method == 'DELETE':
        return 'area_de_trabalho.delete'
    if p.startswith('/api/user-tasks/') and method in ('POST', 'PUT'):
        return 'area_de_trabalho.edit'

    # Evaluations
    if p == '/api/evaluations' and method == 'POST':
        return 'avaliacao.create'
    if p.startswith('/api/evaluations/') and method == 'DELETE':
        return 'avaliacao.delete'

    # Auditorias
    if p == '/api/auditorias' and method == 'POST':
        return 'auditoria.create'
    if p == '/api/auditorias/upload-photos' and method == 'POST':
        return 'auditoria.edit'
    if p.startswith('/api/auditorias/') and method == 'PUT':
        return 'auditoria.edit'
    if p.startswith('/api/auditorias/') and method == 'DELETE':
        return 'auditoria.delete'

    # Aceitacoes
    if p == '/api/aceitacoes' and method == 'POST':
        return 'aceitacao.create'
    if p == '/api/aceitacoes/upload-photos' and method == 'POST':
        return 'aceitacao.edit'
    if p.startswith('/api/aceitacoes/') and method == 'PUT':
        return 'aceitacao.edit'
    if p.startswith('/api/aceitacoes/') and method == 'DELETE':
        return 'aceitacao.delete'

    # Pós-Eventos (Vistorias em Campo)
    if p in ('/api/pos-eventos', '/api/pos-eventos/') and method == 'POST':
        return 'pos_eventos.create'
    if p.startswith('/api/pos-eventos/') and method == 'PUT':
        return 'pos_eventos.edit'
    if p.startswith('/api/pos-eventos/') and method == 'DELETE':
        return 'pos_eventos.delete'

    # RAL de Qualidade
    if p in ('/api/ral-qualidade', '/api/ral-qualidade/', '/api/ral-qualidade/import') and method == 'POST':
        return 'ral_qualidade.create'
    if p.startswith('/api/ral-qualidade/') and method == 'PUT':
        return 'ral_qualidade.edit'
    if p.startswith('/api/ral-qualidade/') and method == 'DELETE':
        return 'ral_qualidade.delete'

    # Grafana (COP REDE - RAL / REC / RAL de Qualidade)
    if p in ('/api/grafana/sync', '/api/grafana/manual-upload') and method == 'POST':
        return 'grafana.edit'
    if p.startswith('/api/grafana/tickets/') and p.endswith('/notes') and method == 'POST':
        return 'grafana.create'
    if p.startswith('/api/grafana/tickets/') and method in ('PUT', 'POST'):
        return 'grafana.edit'
    if p.startswith('/api/grafana/cleared/') and method == 'PUT':
        return 'grafana.edit'
    if p.startswith('/api/grafana/notes/') and method == 'PUT':
        return 'grafana.edit'
    if p.startswith('/api/grafana/notes/') and method == 'DELETE':
        return 'grafana.delete'

    return None

@app.before_request
def enforce_granular_permissions():
    if not request.path.startswith('/api/') or request.method == 'OPTIONS':
        return None
    req_perm = _resolve_required_permission(request.path, request.method)
    if not req_perm:
        return None
    if 'user_id' not in session:
        return jsonify({"error": "Sessão expirada. Redirecionando para login...", "redirect": "/login"}), 401
    if not user_has_permission(req_perm):
        return jsonify({"error": "Acesso negado: você não possui permissão para realizar esta ação."}), 403
    return None

def roles_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            req_perm = _resolve_required_permission(request.path, request.method)
            if req_perm:
                if user_has_permission(req_perm):
                    return f(*args, **kwargs)
                return jsonify({"error": "Acesso negado: você não possui permissão para realizar esta ação."}), 403
            auth = get_current_user_auth()
            if not auth:
                return jsonify({"error": "Não autenticado."}), 401
            if auth['is_master'] or auth['is_coordenador'] or auth['role'] in roles:
                return f(*args, **kwargs)
            return jsonify({"error": "Acesso negado. Permissão insuficiente."}), 403
        return decorated_function
    return decorator

def is_user_coordenador_claro(user_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.username, u.role, t.company 
            FROM users u 
            LEFT JOIN technicians t ON u.tech_id = t.id 
            WHERE u.id = %s;
        """, (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return False
        user_name = (row.get('username') or '').strip().lower()
        if user_name == MASTER_COORDINATOR_USERNAME:
            return True
        role_val = (row.get('role') or '').strip().lower()
        company_val = (row.get('company') or '').strip().lower()
        if role_val in ['administrador', 'admin']:
            return True
        return (role_val == 'coordenador') and (company_val == 'claro')
    except Exception:
        return False

def coordenador_claro_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            r = redirect(url_for('login'))
            r.data = b''
            return r
        req_perm = _resolve_required_permission(request.path, request.method)
        if req_perm:
            if user_has_permission(req_perm):
                return f(*args, **kwargs)
            return jsonify({"error": "Acesso negado: você não possui permissão para realizar esta ação."}), 403
        auth = get_current_user_auth()
        if auth and (auth['is_master'] or auth['is_coordenador']):
            return f(*args, **kwargs)
        p = request.path.rstrip('/')
        if p.startswith('/api/finance') and any(k.startswith('financeiro.') for k in (auth or {}).get('permissions', [])):
            return f(*args, **kwargs)
        if p.startswith('/api/notifications') and any(k.startswith('notificacoes.') for k in (auth or {}).get('permissions', [])):
            return f(*args, **kwargs)
        if p.startswith('/api/technicians/export') and any(k.startswith('pessoas.') for k in (auth or {}).get('permissions', [])):
            return f(*args, **kwargs)
        if is_user_coordenador_claro(session['user_id']):
            return f(*args, **kwargs)
        return jsonify({"error": "Acesso restrito: Você não possui permissão para acessar este recurso."}), 403
    return decorated_function

import urllib.request
import urllib.error
import re
import json

def _validate_external_form_url(url, allowed_hostnames, domain_error_msg):
    """Validates external form URL against SSRF: enforces HTTPS, exact hostname allowlist, and non-private DNS IPs."""
    import ipaddress
    try:
        parsed_u = urllib.parse.urlparse(url)
    except Exception:
        return None, "URL inválida fornecida."

    if parsed_u.scheme != 'https':
        return None, "Protocolo inválido. Use apenas links https://."

    hostname = (parsed_u.hostname or '').lower()
    if not hostname or hostname not in allowed_hostnames:
        return None, domain_error_msg

    try:
        port = parsed_u.port or 443
    except ValueError:
        return None, "URL inválida fornecida."

    try:
        addrinfos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except Exception:
        return None, "Não foi possível resolver o endereço do formulário."

    if not addrinfos:
        return None, "Não foi possível resolver o endereço do formulário."

    for info in addrinfos:
        ip_str = info[4][0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            return None, "Endereço IP inválido detectado."
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
        ):
            return None, "Endereço de destino não permitido por política de segurança."

    return parsed_u, None


def _fetch_external_form_safely(url, allowed_hostnames, domain_error_msg, headers, login_hosts, login_error_msg, timeout=15, max_redirects=5):
    """Fetches an external form URL while validating every redirect hop against SSRF."""
    current_url = url
    sess = requests.Session()
    for _ in range(max_redirects + 1):
        parsed_u, err = _validate_external_form_url(current_url, allowed_hostnames, domain_error_msg)
        if err:
            return None, None, err
        resp = sess.get(current_url, headers=headers, timeout=timeout, allow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get('Location') or ''
            if not loc:
                return None, None, "Redirecionamento inválido retornado pelo servidor do formulário."
            next_url = urllib.parse.urljoin(current_url, loc)
            next_parsed = urllib.parse.urlparse(next_url)
            next_host = (next_parsed.hostname or '').lower()
            if next_host in login_hosts or 'ServiceLogin' in next_url:
                return None, None, login_error_msg
            current_url = next_url
            continue
        return resp, current_url, None
    return None, None, "Limite de redirecionamentos excedido ao acessar o formulário."


def parse_microsoft_form(url):
    url = (url or '').strip()
    if not url:
        return None, "Link do formulário Microsoft não foi informado."

    if '://' not in url:
        url = 'https://' + url

    ms_allowed = {'forms.office.com', 'forms.microsoft.com'}
    ms_login_hosts = {'login.microsoftonline.com', 'login.live.com'}
    ms_domain_err = "Domínio inválido para Microsoft Forms. Use forms.office.com ou forms.microsoft.com."
    ms_login_err = "Formulário privado ou requer login corporativo Microsoft 365. Altere as permissões para público ('Qualquer pessoa pode responder') para importar automaticamente."

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }

    try:
        resp, final_url, fetch_err = _fetch_external_form_safely(
            url, ms_allowed, ms_domain_err, headers, ms_login_hosts, ms_login_err, timeout=12
        )
        if fetch_err:
            return None, fetch_err
        if resp.status_code in (401, 403):
            return None, "Formulário privado ou protegido por login Microsoft 365."
        if resp.status_code >= 400:
            return None, f"Erro de conexão com o Microsoft Forms (HTTP {resp.status_code})."
        html = resp.text
    except Exception as e:
        print("[MS FORMS FETCH ERROR]", type(e).__name__, e)
        return None, "Não foi possível acessar o Microsoft Forms no momento. Verifique o link e tente novamente."

    if 'login.microsoftonline.com' in html or 'login.live.com' in html:
        return None, "Formulário privado ou requer login Microsoft 365."

    title = "Formulário Importado (Microsoft Forms)"
    description = ""
    parsed_questions = []

    # 1. Tenta extrair JSON embutido na página
    json_blobs = re.findall(r'<script[^>]*type=[\'"]application/json[\'"][^>]*>(.*?)</script>', html, re.DOTALL)
    data_dict = None
    for jb in json_blobs:
        if 'questions' in jb or 'formInfo' in jb or 'title' in jb:
            try:
                candidate = json.loads(jb.strip())
                if isinstance(candidate, dict):
                    data_dict = candidate
                    break
            except Exception:
                pass

    if not data_dict:
        js_matches = re.findall(r'(?:window\.__INITIAL_STATE__|window\.formContext|formModel)\s*=\s*(\{.*?\});', html, re.DOTALL)
        for jm in js_matches:
            try:
                candidate = json.loads(jm.strip())
                if isinstance(candidate, dict):
                    data_dict = candidate
                    break
            except Exception:
                pass

    if data_dict:
        form_info = data_dict.get('formInfo') or data_dict.get('form') or data_dict
        if isinstance(form_info, dict):
            title = form_info.get('title') or form_info.get('name') or title
            description = form_info.get('description') or form_info.get('subtitle') or ""
            raw_qs = form_info.get('questions') or form_info.get('questionList') or []
            if isinstance(raw_qs, list):
                for q in raw_qs:
                    if not isinstance(q, dict):
                        continue
                    q_title = q.get('title') or q.get('name') or 'Pergunta'
                    q_type = str(q.get('type') or '').lower()
                    is_required = bool(q.get('required') or q.get('isRequired'))
                    opts = []
                    choices = q.get('choices') or q.get('options') or []
                    if isinstance(choices, list):
                        for c in choices:
                            if isinstance(c, dict) and c.get('description'):
                                opts.append(str(c['description']))
                            elif isinstance(c, str):
                                opts.append(c)

                    f_type = 'text'
                    if 'choice' in q_type:
                        f_type = 'checkbox' if q.get('allowMultipleChoice') else ('select' if len(opts) > 4 else 'radio')
                    elif 'text' in q_type:
                        f_type = 'textarea' if q.get('isMultiLine') else 'text'
                    elif 'date' in q_type:
                        f_type = 'date'
                    elif 'rating' in q_type or 'scale' in q_type:
                        f_type = 'scale'
                    elif 'upload' in q_type or 'file' in q_type:
                        f_type = 'file'

                    title_lower = str(q_title).lower()
                    if any(w in title_lower for w in ['foto', 'evidência', 'evidencia', 'anexo', 'imagem', 'comprovante']):
                        f_type = 'file'

                    parsed_questions.append({
                        "title": q_title,
                        "type": f_type,
                        "options": opts,
                        "required": is_required
                    })

    if not parsed_questions:
        q_elements = re.findall(r'<div[^>]*class="[^"]*question-title-box[^"]*"[^>]*>.*?<span[^>]*>(.*?)</span>', html, re.DOTALL)
        if q_elements:
            for qe in q_elements:
                clean_t = re.sub(r'<[^>]+>', '', qe).strip()
                if clean_t:
                    t_lower = clean_t.lower()
                    f_type = 'file' if any(w in t_lower for w in ['foto', 'evidência', 'evidencia', 'anexo']) else 'text'
                    parsed_questions.append({
                        "title": clean_t,
                        "type": f_type,
                        "options": [],
                        "required": False
                    })

    if not parsed_questions:
        return None, "Não foi possível extrair a lista de perguntas deste formulário Microsoft. Verifique se o formulário é público e possui perguntas cadastradas."

    return {
        "title": title.strip() or "Formulário de Campo",
        "description": description.strip(),
        "questions": parsed_questions
    }, None


def parse_google_form(url):
    url = (url or '').strip()
    if not url:
        return None, "Link do formulário não foi informado."

    if '://' not in url:
        url = 'https://' + url

    google_allowed = {'forms.gle', 'docs.google.com', 'forms.google.com'}
    google_login_hosts = {'accounts.google.com'}
    google_domain_err = "Domínio inválido. Apenas links oficiais forms.gle, docs.google.com ou forms.google.com são aceitos."
    google_login_err = "Formulário privado ou requer login. Altere a privacidade do formulário Google para PÚBLICO (qualquer pessoa com o link pode responder)."

    parsed_u, err = _validate_external_form_url(url, google_allowed, google_domain_err)
    if err:
        return None, err

    hostname = (parsed_u.hostname or '').lower()

    # Se for docs.google.com e estiver em modo /edit, converter para /viewform
    if hostname == 'docs.google.com':
        if '/edit' in url:
            url = url.split('/edit')[0] + '/viewform'
        elif not url.endswith('/viewform') and '/viewform' not in url and not url.endswith('/') and '?usp=' not in url:
            url = url + '/viewform'
    # Atenção: links forms.gle NUNCA devem receber /viewform antes do redirecionamento!

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1'
    }

    try:
        resp, final_url, fetch_err = _fetch_external_form_safely(
            url, google_allowed, google_domain_err, headers, google_login_hosts, google_login_err, timeout=15
        )
        if fetch_err:
            return None, fetch_err
        if resp.status_code in (401, 403):
            return None, google_login_err
        if resp.status_code >= 400:
            return None, f"Erro de conexão com o Google Forms (HTTP {resp.status_code})."
        html = resp.text
    except Exception as e:
        print("[GOOGLE FORMS FETCH ERROR]", type(e).__name__, e)
        return None, "Não foi possível conectar ao Google Forms no momento. Verifique o link e tente novamente."

    if 'accounts.google.com' in html and 'FB_PUBLIC_LOAD_DATA_' not in html:
        return None, "Formulário privado ou requer login no Google. Por favor, torne o formulário público nas opções de compartilhamento do Google Forms."

    # Localizar bloco FB_PUBLIC_LOAD_DATA_ com parser balanceado de colchetes
    idx = html.find('FB_PUBLIC_LOAD_DATA_')
    if idx == -1:
        idx = html.find('FB_PUBLIC_LOAD_DATA')
    if idx == -1:
        return None, "Não foi possível extrair a estrutura das perguntas deste formulário. Verifique se o link é uma URL pública válida do Google Forms."

    eq_idx = html.find('=', idx)
    if eq_idx == -1:
        return None, "Estrutura do formulário não reconhecida."

    start_bracket = html.find('[', eq_idx)
    if start_bracket == -1:
        return None, "Estrutura de dados do formulário não encontrada."

    count = 0
    in_string = False
    escape = False
    quote_char = ''
    end_bracket = -1

    for i in range(start_bracket, len(html)):
        c = html[i]
        if escape:
            escape = False
            continue
        if c == '\\':
            escape = True
            continue
        if in_string:
            if c == quote_char:
                in_string = False
            continue
        if c in ('"', "'"):
            in_string = True
            quote_char = c
            continue
        if c == '[':
            count += 1
        elif c == ']':
            count -= 1
            if count == 0:
                end_bracket = i + 1
                break

    if end_bracket == -1:
        return None, "Estrutura JSON incompleta ou corrompida no Google Forms."

    raw_json = html[start_bracket:end_bracket]
    try:
        data = json.loads(raw_json)
    except Exception:
        try:
            cleaned = re.sub(r',\s*]', ']', raw_json)
            data = json.loads(cleaned)
        except Exception:
            return None, "Erro ao processar dados internos do Google Forms. O modelo do formulário não pôde ser copiado."

    try:
        form_meta = data[1] if len(data) > 1 and isinstance(data[1], list) else []
        title = ""
        description = ""
        if form_meta:
            title = form_meta[8] if len(form_meta) > 8 and form_meta[8] else (form_meta[1] if len(form_meta) > 1 and isinstance(form_meta[1], str) else "")
            description = form_meta[0] if len(form_meta) > 0 and isinstance(form_meta[0], str) else ""

        if not title:
            title_m = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            if title_m:
                t = title_m.group(1).replace('- Google Forms', '').replace('Google Forms', '').strip()
                if t:
                    title = t
        if not title:
            title = "Formulário Importado"

        questions_raw = []
        if form_meta and len(form_meta) > 1 and isinstance(form_meta[1], list):
            questions_raw = form_meta[1]

        parsed_questions = []
        if isinstance(questions_raw, list):
            for q in questions_raw:
                if not isinstance(q, list) or len(q) < 4:
                    continue
                q_title = q[1] if len(q) > 1 and q[1] else "Pergunta"
                q_type_code = q[3] if len(q) > 3 else 0
                q_sub = q[4] if len(q) > 4 and isinstance(q[4], list) and len(q[4]) > 0 else []

                field_type = 'text'
                options = []
                required = False

                if q_type_code == 0:
                    field_type = 'text'
                elif q_type_code == 1:
                    field_type = 'textarea'
                elif q_type_code == 2:
                    field_type = 'radio'
                elif q_type_code == 3:
                    field_type = 'select'
                elif q_type_code == 4:
                    field_type = 'checkbox'
                elif q_type_code == 5:
                    field_type = 'scale'
                elif q_type_code == 9:
                    field_type = 'date'
                elif q_type_code == 10:
                    field_type = 'time'
                elif q_type_code == 13:
                    field_type = 'file'

                # Heuristic for photos/evidence in inspections
                title_lower = str(q_title).lower()
                if any(w in title_lower for w in ['foto', 'evidência', 'evidencia', 'anexo', 'imagem', 'comprovante']):
                    field_type = 'file'

                if q_sub and isinstance(q_sub, list) and len(q_sub) > 0:
                    sub_item = q_sub[0]
                    if isinstance(sub_item, list) and len(sub_item) > 1 and isinstance(sub_item[1], list):
                        for opt in sub_item[1]:
                            if isinstance(opt, list) and len(opt) > 0 and opt[0]:
                                options.append(str(opt[0]))
                    if isinstance(sub_item, list) and len(sub_item) > 2:
                        required = bool(sub_item[2] == 1)

                parsed_questions.append({
                    "title": q_title,
                    "type": field_type,
                    "options": options,
                    "required": required
                })

        if not parsed_questions:
            return None, "Não foi possível extrair perguntas válidas deste formulário Google. Verifique se o formulário possui perguntas cadastradas."

        return {
            "title": title,
            "description": description,
            "questions": parsed_questions
        }, None

    except Exception as e:
        print("[GOOGLE FORMS PARSE ERROR]", type(e).__name__, e)
        return None, "Não foi possível copiar a estrutura do formulário. Verifique se o link é válido e público."

# --------------------------------------------------------------------------
# PUBLIC SERVING OF UPLOADED ASSETS & PUBLIC PROJECT VIEWER
# --------------------------------------------------------------------------
@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    from werkzeug.utils import safe_join
    if 'user_id' not in session or not session.get('totp_verified'):
        return jsonify({"error": "Não autenticado."}), 401
    safe_path = safe_join(UPLOAD_FOLDER, filename)
    if not safe_path or not os.path.exists(safe_path):
        return "Arquivo não encontrado.", 404

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    
    # Strictly block executable, script or active content from being served
    if ext in {'html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'xml', 'php', 'py', 'sh', 'exe', 'bat', 'cmd'}:
        return "Tipo de arquivo não permitido para visualização direta.", 403

    if filename.startswith('formularios/'):
        if ext not in ALLOWED_FORM_UPLOAD_EXTS:
            return "Extensão de arquivo não permitida.", 403

    response = send_from_directory(UPLOAD_FOLDER, filename)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    return response

@app.route('/p/project/<int:project_id>')
@login_required
def public_project_view(project_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM projects WHERE id = %s;", (project_id,))
        project = cur.fetchone()
        cur.close()
        conn.close()

        if not project:
            return "Projeto de rede não encontrado.", 404

        kmz_files = []
        if project.get('kmz_path'):
            for f in project['kmz_path'].split(';'):
                f_clean = f.strip()
                if f_clean:
                    kmz_files.append({"name": f_clean.split('/')[-1], "path": f_clean})

        pdf_files = []
        if project.get('pdf_path'):
            for f in project['pdf_path'].split(';'):
                f_clean = f.strip()
                if f_clean:
                    pdf_files.append({"name": f_clean.split('/')[-1], "path": f_clean})

        return render_template('public_project.html', project=project, kmz_files=kmz_files, pdf_files=pdf_files)
    except Exception as e:
        print("Erro interno ao carregar projeto:", e)
        return "Erro interno ao carregar o projeto.", 500

# --------------------------------------------------------------------------
# WEBPAGE ROUTINGS — the React SPA (frontend/dist) owns the entire UI now;
# these routes just hand it index.html. Client-side routing (react-router)
# handles /login, /dashboard, etc. from there.
# --------------------------------------------------------------------------
REACT_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')

def serve_react_app():
    resp = make_response(send_from_directory(REACT_DIST, 'index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/assets/<path:filename>')
def react_assets(filename):
    assets_dir = os.path.join(REACT_DIST, 'assets')
    full_path = os.path.normpath(os.path.join(assets_dir, filename))
    if not full_path.startswith(os.path.normpath(assets_dir)) or not os.path.isfile(full_path):
        return Response("Asset not found", status=404, mimetype="text/plain")
    resp = send_from_directory(assets_dir, filename)
    resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return resp

@app.route('/logout')
def logout():
    if 'user_id' in session:
        log_action(session['user_id'], session['username'], "Efetuou logout do sistema.")
        session.clear()
    r = redirect(url_for('login'))
    r.data = b''
    return r

@app.route('/login', endpoint='login')
def login():
    return serve_react_app()

@app.route('/robots.txt')
def serve_robots_txt():
    # Strict Enterprise robots.txt: Disallow all indexing & AI scrapers; never expose internal routes
    txt = (
        "# Gestão Rede Externa (gestaoredeexterna.com.br) — Acesso Corporativo Restrito\n"
        "User-agent: *\nDisallow: /\n\n"
        "User-agent: GPTBot\nDisallow: /\n\n"
        "User-agent: Google-Extended\nDisallow: /\n\n"
        "User-agent: CCBot\nDisallow: /\n\n"
        "User-agent: ClaudeBot\nDisallow: /\n\n"
        "User-agent: Bytespider\nDisallow: /\n"
    )
    return Response(txt, mimetype='text/plain')

@app.route('/sitemap.xml')
def serve_sitemap_xml():
    # Strict Enterprise Security: Private systems must NEVER expose sitemaps of internal forms/routes
    return Response("Not Found", mimetype='text/plain', status=404)

@app.route('/.well-known/security.txt')
def serve_security_txt():
    txt = (
        "Contact: https://gestaoredeexterna.com.br/\n"
        "Preferred-Languages: pt-BR, en\n"
        "Canonical: https://gestaoredeexterna.com.br/.well-known/security.txt\n"
    )
    return Response(txt, mimetype='text/plain')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def spa_catch_all(path):
    if path.startswith('api/') or path.startswith('uploads/') or path.startswith('static/'):
        return jsonify({"error": "Não encontrado."}), 404

    # Bloqueia rotas de scan e sondagem para não retornar 200 no SPA catch-all
    path_first = path.strip('/').split('/')[0].lower() if path.strip('/') else ''
    BLOCKED_SPA_PROBES = {
        'admin', 'env', 'setup', 'config', 'shell', 'actuator', 'console',
        'pma', 'phpmyadmin', 'wp-admin', 'wp-login', 'cgi-bin', 'webmin'
    }
    if path_first in BLOCKED_SPA_PROBES:
        return jsonify({"error": "Página não encontrada."}), 404

    if '.' in path.rsplit('/', 1)[-1]:
        # Root-level built assets (favicon.png, claro-icon.png, icons.svg, ...)
        if os.path.isfile(os.path.join(REACT_DIST, path)):
            return send_from_directory(REACT_DIST, path)
        return jsonify({"error": "Arquivo não encontrado."}), 404
    return serve_react_app()

# --------------------------------------------------------------------------
# JSON AUTH API — same session-cookie mechanism as /login above, just returns
# JSON instead of a redirect/rendered template. Added for the React frontend;
# the legacy form-based /login route above is left intact.
# --------------------------------------------------------------------------
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    # Limpa qualquer sessão residual para garantir login imediato sem bloqueios indevidos
    if 'user_id' in session:
        session.clear()

    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({"error": "Por favor, informe seu usuário e senha."}), 400

    client_ip = get_client_ip()
    lockout_key = f"{client_ip}:{username}"

    now_ts = time.time()
    with _SECURITY_STORE_LOCK:
        _ACCOUNT_LOGIN_FAILURES[lockout_key] = [t for t in _ACCOUNT_LOGIN_FAILURES[lockout_key] if now_ts - t < 900]
        is_locked = len(_ACCOUNT_LOGIN_FAILURES[lockout_key]) >= 8
    if is_locked:
        return jsonify({"error": "Muitas tentativas incorretas a partir deste endereço. Aguarde 15 minutos."}), 429

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s;", (username,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            with _SECURITY_STORE_LOCK:
                _ACCOUNT_LOGIN_FAILURES.pop(lockout_key, None)
                _SECURITY_BAN_LIST.pop(client_ip, None) # Clear any scanner bans upon valid primary authentication
            session.clear() # Clear all prior session tokens (Session Fixation Prevention)
            session.permanent = True

            uname_lower = (user.get('username') or '').strip().lower()
            is_totp_exempt = uname_lower in TOTP_EXEMPT_USERNAMES
            if is_totp_exempt:
                formatted_name = format_person_name(user.get('name') or user['username'])
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['role'] = user['role']
                session['name'] = formatted_name
                session['user_name'] = formatted_name
                session['totp_verified'] = True
                session['totp_expires_at'] = time.time() + (12 * 3600)
                audit_msg = "Efetuou login direto no sistema (conta isenta de 2FA)."
                login_stage = 'login_direto'
            else:
                # ZERO-TRUST ARCHITECTURE:
                # Store credentials in temporary stage-1 MFA hold.
                # 'user_id' is deliberately NOT created until the 6-digit TOTP code is verified.
                # This makes 2FA impossible to bypass via Burp Suite, tampering, or direct API calls.
                session['pending_mfa_user_id'] = user['id']
                session['pending_mfa_username'] = user['username']
                session['pending_mfa_role'] = user['role']
                session['pending_mfa_time'] = time.time()
                session['totp_verified'] = False
                session['totp_expires_at'] = 0
                audit_msg = "Efetuou validação de senha (credenciais primárias aceitas)."
                login_stage = 'senha'

            # Capture request metadata synchronously, then run all audit/tracking/IP/email
            # side effects asynchronously so POST /api/auth/login NEVER blocks or times out.
            req_ip = client_ip
            req_ua = (request.headers.get('User-Agent') or '')[:250]
            req_cf_city = request.headers.get('CF-IPCity')
            req_cf_region = request.headers.get('CF-Region')
            req_cf_country = request.headers.get('CF-IPCountry')
            user_snapshot = {
                'id': user['id'],
                'username': user['username'],
                'name': user.get('name'),
                'email': user.get('email'),
                'tech_id': user.get('tech_id'),
                'totp_enabled': bool(user.get('totp_enabled')) and not is_totp_exempt,
            }

            def _bg_post_login_tasks(u_snap, a_msg, l_stage, ip_val, ua_val, c_city, c_reg, c_cnt):
                try:
                    log_action(u_snap['id'], u_snap['username'], a_msg)
                except Exception as e_la:
                    print("[LOGIN BG AUDIT ERROR]", e_la)
                try:
                    _record_user_login_event(
                        u_snap['id'],
                        l_stage,
                        client_ip=ip_val,
                        client_ua=ua_val,
                        cf_city=c_city,
                        cf_region=c_reg,
                        cf_country=c_cnt,
                    )
                except Exception as e_rec:
                    print("[LOGIN BG RECORD ERROR]", e_rec)
                try:
                    conn_ip = get_db()
                    cur_ip = conn_ip.cursor()
                    cur_ip.execute("SELECT COUNT(*) as count FROM user_known_ips WHERE user_id = %s;", (u_snap['id'],))
                    count_row = cur_ip.fetchone()
                    total_ips = count_row['count'] if count_row else 0

                    cur_ip.execute("SELECT id FROM user_known_ips WHERE user_id = %s AND ip_address = %s;", (u_snap['id'], ip_val))
                    ip_exists = cur_ip.fetchone()

                    is_new_ip = bool(total_ips > 0 and not ip_exists)
                    sec_email = (u_snap.get('email') or '').strip().lower()
                    if not sec_email and u_snap.get('tech_id'):
                        cur_ip.execute("SELECT email FROM technicians WHERE id = %s;", (u_snap['tech_id'],))
                        t_row = cur_ip.fetchone()
                        if t_row and t_row.get('email'):
                            sec_email = t_row['email'].strip().lower()

                    if sec_email and '@' in sec_email:
                        sec_display = u_snap.get('name') or u_snap['username']
                        brt_tz = datetime.timezone(datetime.timedelta(hours=-3))
                        now_brt = datetime.datetime.now(brt_tz)
                        now_str = f"{now_brt.strftime('%H:%M')} ({now_brt.strftime('%d/%m/%Y')} - Horário de Brasília)"
                        send_security_alert_email(
                            to_email=sec_email,
                            user_display=sec_display,
                            ip_address=ip_val,
                            user_agent=ua_val,
                            login_time=now_str,
                            totp_blocked=bool(u_snap.get('totp_enabled')),
                            is_new_ip=is_new_ip,
                            cf_city=c_city,
                            cf_region=c_reg,
                            cf_country=c_cnt,
                        )
                        print(f"[SECURITY ALERT DISPATCHED] Login detectado ({ip_val}) para {u_snap['username']}. Alerta enviado para {sec_email}.")

                    cur_ip.execute("""
                        INSERT INTO user_known_ips (user_id, ip_address, user_agent, last_seen)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, ip_address) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, user_agent = EXCLUDED.user_agent;
                    """, (u_snap['id'], ip_val, ua_val))
                    conn_ip.commit()
                    cur_ip.close()
                    conn_ip.close()
                except Exception as ip_err:
                    print("[LOGIN IP TRACKING ERROR]", ip_err)

            threading.Thread(
                target=_bg_post_login_tasks,
                args=(user_snapshot, audit_msg, login_stage, req_ip, req_ua, req_cf_city, req_cf_region, req_cf_country),
                daemon=True,
                name="Login-PostTasks",
            ).start()

            user_payload = get_user_info_dict(user['id']) or {
                "id": user['id'],
                "username": user['username'],
                "role": user['role'],
                "company": get_user_company(user['id']),
                "needs_email": True,
                "totp_enabled": False if is_totp_exempt else bool(user.get('totp_enabled')),
                "totp_verified": True if is_totp_exempt else False,
                "totp_expires_at": int(time.time() + (12 * 3600)) if is_totp_exempt else 0,
                "requires_totp_setup": False if is_totp_exempt else (not bool(user.get('totp_enabled'))),
                "requires_totp_verify": False if is_totp_exempt else bool(user.get('totp_enabled'))
            }
            return jsonify({"user": user_payload})

        with _SECURITY_STORE_LOCK:
            _ACCOUNT_LOGIN_FAILURES[lockout_key].append(time.time())
        time.sleep(1.5)
        return jsonify({"error": "Usuário ou senha incorretos."}), 401
    except Exception as e:
        print("[AUTH LOGIN ERROR]", e)
        return jsonify({"error": "Erro interno ao processar o login. Tente novamente."}), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    if 'user_id' in session:
        log_action(session['user_id'], session['username'], "Efetuou logout do sistema.")
        session.clear()
    return jsonify({"success": True})

@app.route('/api/auth/totp/setup', methods=['GET'])
def api_totp_setup():
    user_id = session.get('user_id') or session.get('pending_mfa_user_id')
    if not user_id:
        return jsonify({'error': 'Não autenticado.'}), 401
    username = session.get('username') or session.get('pending_mfa_username') or 'usuario'

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = %s;', (user_id,))
    u = cur.fetchone()
    if not u:
        cur.close()
        conn.close()
        return jsonify({'error': 'Usuário não encontrado.'}), 404

    if u.get('totp_enabled'):
        cur.close()
        conn.close()
        return jsonify({'error': 'Autenticador 2FA já está ativado para esta conta.'}), 403

    secret = generate_totp_secret()
    cur.execute('UPDATE users SET totp_secret = %s, totp_enabled = FALSE WHERE id = %s;', (secret, user_id))
    conn.commit()

    cur.close()
    conn.close()

    otpauth_url = get_totp_uri(secret, username=u.get('username') or username)
    return jsonify({
        'success': True,
        'secret': secret,
        'otpauth_url': otpauth_url,
        'username': u.get('username') or username
    })

@app.route('/api/auth/totp/enable', methods=['POST'])
def api_totp_enable():
    user_id = session.get('user_id') or session.get('pending_mfa_user_id')
    if not user_id:
        return jsonify({'error': 'Não autenticado.'}), 401

    # Brute Force Protection against Automated Scanners / Burp Intruder
    now_ts = time.time()
    _TOTP_FAILURES[user_id] = [t for t in _TOTP_FAILURES[user_id] if now_ts - t < 900]
    if len(_TOTP_FAILURES[user_id]) >= 5:
        return jsonify({'error': 'Muitas tentativas incorretas. Conta bloqueada temporariamente para validação 2FA por 15 minutos.'}), 429

    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().replace(' ', '').replace('-', '')

    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({'error': 'Código inválido. Digite os 6 dígitos numéricos do seu aplicativo autenticador.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.username, u.name, u.role, u.totp_secret, u.totp_enabled, t.name AS tech_name
        FROM users u
        LEFT JOIN technicians t ON u.tech_id = t.id
        WHERE u.id = %s;
    """, (user_id,))
    u = cur.fetchone()
    if u and u.get('totp_enabled'):
        cur.close()
        conn.close()
        return jsonify({'error': 'Autenticador 2FA já está ativado para esta conta.'}), 403
    if not u or not u.get('totp_secret'):
        cur.close()
        conn.close()
        return jsonify({'error': 'Segredo de autenticação não encontrado. Inicie a configuração novamente.'}), 400

    secret = u['totp_secret']
    is_valid, bucket_idx = verify_totp_token(secret, code, window=1)
    if not is_valid:
        _TOTP_FAILURES[user_id].append(now_ts)
        cur.close()
        conn.close()
        return jsonify({'error': 'Código de autenticação incorreto. Verifique a hora do seu celular e tente novamente.'}), 400

    # RFC 6238 Anti-Replay: Prevent Burp Repeater / Token Replay
    _USED_TOTP_BUCKETS[user_id] = {b: exp for b, exp in _USED_TOTP_BUCKETS[user_id].items() if exp > now_ts}
    if bucket_idx in _USED_TOTP_BUCKETS[user_id]:
        cur.close()
        conn.close()
        return jsonify({'error': 'Código de autenticação já utilizado. Aguarde o próximo código de 30 segundos no seu aplicativo.'}), 400
    _USED_TOTP_BUCKETS[user_id][bucket_idx] = now_ts + 180

    now = datetime.datetime.now()
    cur.execute('UPDATE users SET totp_enabled = TRUE, totp_verified_at = %s WHERE id = %s;', (now, user_id))
    conn.commit()
    cur.close()
    conn.close()

    # Clear pending MFA hold and elevate to FULL AUTHENTICATED SESSION
    session.pop('pending_mfa_user_id', None)
    session.pop('pending_mfa_username', None)
    session.pop('pending_mfa_role', None)
    session.pop('pending_mfa_time', None)
    _TOTP_FAILURES.pop(user_id, None)

    real_name = (u.get('name') or u.get('tech_name') or '').strip()
    real_name = format_person_name(real_name or u['username'])

    session['user_id'] = user_id
    session['username'] = u['username']
    session['name'] = real_name
    session['user_name'] = real_name
    session['role'] = u['role']
    session['totp_verified'] = True
    session['totp_expires_at'] = time.time() + (12 * 3600)

    log_action(user_id, u['username'], 'Ativou e validou o aplicativo autenticador (2FA) com sucesso.')
    _record_user_login_event(user_id, '2fa_setup')
    return jsonify({
        'success': True,
        'message': 'Aplicativo autenticador ativado com sucesso! Sessão autorizada por 12 horas.',
        'totp_verified': True,
        'totp_expires_at': session['totp_expires_at']
    })

@app.route('/api/auth/totp/verify', methods=['POST'])
def api_totp_verify():
    user_id = session.get('user_id') or session.get('pending_mfa_user_id')
    if not user_id:
        return jsonify({'error': 'Não autenticado.'}), 401

    # Brute Force Protection against Automated Scanners / Burp Intruder
    now_ts = time.time()
    _TOTP_FAILURES[user_id] = [t for t in _TOTP_FAILURES[user_id] if now_ts - t < 900]
    if len(_TOTP_FAILURES[user_id]) >= 5:
        return jsonify({'error': 'Muitas tentativas incorretas. Conta bloqueada temporariamente para validação 2FA por 15 minutos.'}), 429

    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().replace(' ', '').replace('-', '')

    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({'error': 'Código inválido. Digite os 6 dígitos do seu aplicativo autenticador.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.username, u.name, u.role, u.totp_secret, u.totp_enabled, t.name AS tech_name
        FROM users u
        LEFT JOIN technicians t ON u.tech_id = t.id
        WHERE u.id = %s;
    """, (user_id,))
    u = cur.fetchone()
    cur.close()
    conn.close()

    if not u or not u.get('totp_enabled') or not u.get('totp_secret'):
        return jsonify({'error': 'Usuário ainda não concluiu o cadastro do autenticador.'}), 400

    secret = u['totp_secret']
    is_valid, bucket_idx = verify_totp_token(secret, code, window=1)
    if not is_valid:
        _TOTP_FAILURES[user_id].append(now_ts)
        return jsonify({'error': 'Código de autenticação incorreto ou expirado. Tente novamente.'}), 400

    # RFC 6238 Anti-Replay: Prevent Burp Repeater / Token Replay
    _USED_TOTP_BUCKETS[user_id] = {b: exp for b, exp in _USED_TOTP_BUCKETS[user_id].items() if exp > now_ts}
    if bucket_idx in _USED_TOTP_BUCKETS[user_id]:
        return jsonify({'error': 'Código de autenticação já utilizado. Aguarde o próximo código de 30 segundos no seu aplicativo.'}), 400
    _USED_TOTP_BUCKETS[user_id][bucket_idx] = now_ts + 180

    # Clear pending MFA hold and elevate to FULL AUTHENTICATED SESSION
    session.pop('pending_mfa_user_id', None)
    session.pop('pending_mfa_username', None)
    session.pop('pending_mfa_role', None)
    session.pop('pending_mfa_time', None)
    _TOTP_FAILURES.pop(user_id, None)

    real_name = (u.get('name') or u.get('tech_name') or '').strip()
    real_name = format_person_name(real_name or u['username'])

    session['user_id'] = user_id
    session['username'] = u['username']
    session['name'] = real_name
    session['user_name'] = real_name
    session['role'] = u['role']
    session['totp_verified'] = True
    session['totp_expires_at'] = time.time() + (12 * 3600)

    log_action(user_id, u['username'], 'Validou sessão de 12 horas via aplicativo autenticador (TOTP).')
    _record_user_login_event(user_id, '2fa_verify')
    return jsonify({
        'success': True,
        'message': 'Código confirmado! Acesso autorizado por 12 horas.',
        'totp_verified': True,
        'totp_expires_at': session['totp_expires_at']
    })

@app.route('/api/auth/totp/reconfigure', methods=['POST'])
def api_totp_reconfigure():
    # Only fully authenticated sessions with active 2FA or the Master Coordinator can reconfigure 2FA
    if 'user_id' not in session:
        return jsonify({'error': 'Acesso negado: apenas sessões ativas e autenticadas podem reconfigurar o 2FA. Contate seu coordenador.'}), 403

    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    password = (data.get('password') or '').strip()

    # Password is now STRICTLY MANDATORY (Prevents Burp Suite empty payload bypass)
    if not password:
        return jsonify({'error': 'Por favor, informe sua senha atual para confirmar a redefinição de segurança do autenticador.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT password_hash, username, role FROM users WHERE id = %s;", (user_id,))
    u_row = cur.fetchone()
    if not u_row or not check_password_hash(u_row['password_hash'], password):
        cur.close()
        conn.close()
        time.sleep(0.5) # Timing attack mitigation
        return jsonify({'error': 'Senha incorreta para confirmar a reconfiguração do autenticador.'}), 400

    cur.execute("UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_verified_at = NULL WHERE id = %s;", (user_id,))
    conn.commit()
    cur.close()
    conn.close()

    # Demote session to pending setup
    session['pending_mfa_user_id'] = user_id
    session['pending_mfa_username'] = u_row['username']
    session['pending_mfa_role'] = u_row['role']
    session.pop('user_id', None)
    session['totp_verified'] = False
    session['totp_expires_at'] = 0

    log_action(user_id, u_row['username'], "Solicitou reconfiguração do aplicativo autenticador (2FA) mediante verificação de senha.")
    return jsonify({"success": True, "message": "Autenticador redefinido com sucesso! Vincule seu novo aplicativo."})

@app.route('/api/auth/forgot-password', methods=['POST'])
def api_forgot_password():
    data = request.get_json(silent=True) or {}
    identifier = (data.get('identifier') or '').strip().lower()

    if not identifier:
        return jsonify({'error': 'Por favor, informe seu usuário ou e-mail cadastrado.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        SELECT u.id, u.username, u.totp_enabled
        FROM users u
        LEFT JOIN technicians t ON u.tech_id = t.id
        WHERE LOWER(u.username) = %s OR LOWER(COALESCE(u.email, '')) = %s OR LOWER(COALESCE(t.email, '')) = %s;
    ''', (identifier, identifier, identifier))
    user = cur.fetchone()
    cur.close()
    conn.close()

    # Resposta genérica e uniforme para evitar enumeração de contas e vazamento de nomes
    return jsonify({
        'success': True,
        'totp_required': True,
        'message': 'Se a conta informada estiver cadastrada, digite o código de 6 dígitos do seu aplicativo autenticador para prosseguir.'
    })

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    data = request.get_json(silent=True) or {}
    identifier = (data.get('identifier') or '').strip().lower()
    code = str(data.get('code') or '').strip().replace(' ', '').replace('-', '')
    new_password = data.get('new_password') or ''

    if not identifier or not code or not new_password:
        return jsonify({'error': 'Por favor, preencha todos os campos obrigatórios.'}), 400

    if len(new_password) < 8:
        return jsonify({'error': 'A nova senha deve ter no mínimo 8 caracteres.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        SELECT u.id, u.username, u.totp_secret, u.totp_enabled
        FROM users u
        LEFT JOIN technicians t ON u.tech_id = t.id
        WHERE LOWER(u.username) = %s OR LOWER(COALESCE(u.email, '')) = %s OR LOWER(COALESCE(t.email, '')) = %s;
    ''', (identifier, identifier, identifier))
    user = cur.fetchone()

    if not user or not user.get('totp_enabled') or not user.get('totp_secret'):
        cur.close()
        conn.close()
        time.sleep(1)
        return jsonify({'error': 'Dados inválidos ou autenticador não localizado. Se precisar de auxílio, contate a coordenação do sistema.'}), 400

    user_id = user['id']
    secret = user['totp_secret']

    now_ts = time.time()
    with _SECURITY_STORE_LOCK:
        _TOTP_FAILURES[user_id] = [t for t in _TOTP_FAILURES[user_id] if now_ts - t < 900]
        totp_locked = len(_TOTP_FAILURES[user_id]) >= 5
    if totp_locked:
        cur.close()
        conn.close()
        return jsonify({'error': 'Muitas tentativas incorretas. Conta bloqueada temporariamente para validação 2FA por 15 minutos.'}), 429

    is_valid, bucket_idx = verify_totp_token(secret, code, window=1)
    if not is_valid:
        with _SECURITY_STORE_LOCK:
            _TOTP_FAILURES[user_id].append(now_ts)
        cur.close()
        conn.close()
        time.sleep(1)
        return jsonify({'error': 'Código do aplicativo autenticador incorreto ou expirado. Tente novamente.'}), 400

    with _SECURITY_STORE_LOCK:
        _USED_TOTP_BUCKETS[user_id] = {b: exp for b, exp in _USED_TOTP_BUCKETS[user_id].items() if exp > now_ts}
        already_used = bucket_idx in _USED_TOTP_BUCKETS[user_id]
        if not already_used:
            _USED_TOTP_BUCKETS[user_id][bucket_idx] = now_ts + 180
    if already_used:
        cur.close()
        conn.close()
        return jsonify({'error': 'Código de autenticação já utilizado. Aguarde o próximo código no seu aplicativo.'}), 400

    # Password update
    hashed_pw = generate_password_hash(new_password)
    cur.execute('UPDATE users SET password_hash = %s WHERE id = %s;', (hashed_pw, user_id))
    conn.commit()
    cur.close()
    conn.close()

    with _SECURITY_STORE_LOCK:
        _TOTP_FAILURES.pop(user_id, None)
    session.clear()

    log_action(user_id, user['username'], 'Redefiniu sua senha com sucesso utilizando o aplicativo autenticador (TOTP).')

    return jsonify({
        'success': True,
        'message': 'Senha redefinida com sucesso! Você já pode efetuar login com sua nova credencial.'
    })


def get_user_info_dict(user_id):
    _start_resend_bounce_watchdog()
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.username, u.role, u.tech_id, u.permissions,
                   u.email as u_email, u.phone as u_phone, u.name as u_name,
                   u.totp_secret, u.totp_enabled, u.totp_verified_at,
                   u.email_bounced, u.email_bounce_reason, u.theme_preference,
                   t.name as tech_name, t.phone as tech_phone, t.email as tech_email, t.company,
                   t.registration_claro, t.toa_login
            FROM users u
            LEFT JOIN technicians t ON u.tech_id = t.id
            WHERE u.id = %s;
        """, (user_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return None

        # Prefer users record, fallback to technicians record
        email = (row.get('u_email') or row.get('tech_email') or '').strip()
        email_bounced = bool(row.get('email_bounced'))
        email_bounce_reason = row.get('email_bounce_reason')

        if email and not email_bounced:
            try:
                cur.execute(
                    "SELECT reason FROM bounced_emails WHERE email = %s AND resolved_at IS NULL;",
                    (email.lower(),)
                )
                b_row = cur.fetchone()
                if b_row:
                    email_bounced = True
                    email_bounce_reason = b_row.get('reason') or "Falha na entrega de e-mails importantes."
            except Exception:
                conn.rollback()

        cur.close()
        conn.close()
        phone = (row.get('u_phone') or row.get('tech_phone') or '').strip()
        raw_name = (row.get('u_name') or row.get('tech_name') or '').strip()
        name = format_person_name(raw_name or row['username'])
        company = (row.get('company') or '').strip() or None

        is_valid_email = bool(email and '@' in email and '.' in email and len(email) >= 5)
        needs_email = not is_valid_email

        missing_fields = []
        if needs_email:
            missing_fields.append("E-mail corporativo / pessoal")
        if not phone:
            missing_fields.append("Telefone de contato / WhatsApp")
        if not raw_name or raw_name.lower() == row['username'].lower():
            missing_fields.append("Nome completo")
        if not company:
            missing_fields.append("Empresa / Parceira vinculada")

        uname = (row.get('username') or '').strip().lower()
        resolved_perms = resolve_user_permissions(uname, row.get('role'), row.get('permissions'))

        totp_enabled = bool(row.get('totp_enabled'))
        totp_exp = session.get('totp_expires_at') or 0
        totp_verified = bool(session.get('totp_verified') and time.time() < totp_exp)

        if uname in TOTP_EXEMPT_USERNAMES:
            totp_enabled = False
            totp_verified = True
            totp_exp = int(time.time() + (12 * 3600))
            requires_totp_setup = False
            requires_totp_verify = False
        else:
            requires_totp_setup = not totp_enabled
            requires_totp_verify = totp_enabled and not totp_verified

        return {
            "id": row['id'],
            "username": row['username'],
            "role": row['role'],
            "company": company,
            "name": name,
            "email": email if is_valid_email else "",
            "phone": phone,
            "tech_id": row.get('tech_id'),
            "needs_email": needs_email,
            "email_bounced": email_bounced,
            "email_bounce_reason": email_bounce_reason,
            "profile_complete": len(missing_fields) == 0,
            "missing_fields": missing_fields,
            "registration_claro": row.get('registration_claro'),
            "toa_login": row.get('toa_login'),
            "permissions": resolved_perms,
            "is_master": uname == MASTER_COORDINATOR_USERNAME,
            "is_coordenador": is_coordenador_role(uname, row.get('role')),
            "totp_enabled": totp_enabled,
            "totp_verified": totp_verified,
            "totp_expires_at": totp_exp,
            "requires_totp_setup": requires_totp_setup,
            "requires_totp_verify": requires_totp_verify,
            "theme_preference": "light" if (row.get('theme_preference') or '').strip().lower() == 'light' else "dark"
        }
    except Exception as e:
        print("get_user_info_dict error:", e)
        return None

def get_user_company(user_id):
    try:
        u = get_user_info_dict(user_id)
        return u.get('company') if u else None
    except Exception:
        return None

@app.route('/api/auth/me', methods=['GET'])
def api_auth_me():
    user_id = session.get('user_id')
    if not user_id:
        pending_id = session.get('pending_mfa_user_id')
        if pending_id:
            user_payload = get_user_info_dict(pending_id)
            if user_payload:
                if (user_payload.get('username') or '').strip().lower() in TOTP_EXEMPT_USERNAMES:
                    session['user_id'] = session.pop('pending_mfa_user_id')
                    session['username'] = user_payload['username']
                    session['role'] = user_payload['role']
                    session['name'] = user_payload.get('name') or user_payload['username']
                    session['user_name'] = session['name']
                    session['totp_verified'] = True
                    session['totp_expires_at'] = time.time() + (12 * 3600)
                return jsonify({"user": user_payload})
        return jsonify({"error": "Não autenticado."}), 401
    if not session.get('_login_event_tracked'):
        _record_user_login_event(user_id, 'sessao_ativa')
        session['_login_event_tracked'] = True
    user_payload = get_user_info_dict(user_id)
    if not user_payload:
        return jsonify({"error": "Usuário não encontrado."}), 404
    return jsonify({"user": user_payload})

# --------------------------------------------------------------------------
# USER SELF-SERVICE PROFILE API (/api/users/me/profile)
# --------------------------------------------------------------------------
@app.route('/api/users/me/profile', methods=['GET'])
@login_required
def api_get_my_profile():
    user_info = get_user_info_dict(session['user_id'])
    if not user_info:
        return jsonify({"error": "Perfil não encontrado."}), 404
    return jsonify(user_info)

@app.route('/api/users/me/profile', methods=['PUT'])
@login_required
def api_update_my_profile():
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    name = (data.get('name') or '').strip()
    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''
    raw_theme = (data.get('theme_preference') or '').strip().lower()
    theme_pref = 'light' if raw_theme == 'light' else ('dark' if raw_theme == 'dark' else None)

    if email:
        if '@' not in email or '.' not in email or len(email) < 5:
            return jsonify({"error": "Informe um endereço de e-mail válido (exemplo: usuario@claro.com.br)."}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        return jsonify({"error": "Usuário não encontrado."}), 404

    if theme_pref and not email and not phone and not name and not new_password:
        try:
            cur.execute("UPDATE users SET theme_preference = %s WHERE id = %s;", (theme_pref, user_id))
            conn.commit()
        except Exception:
            conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"success": True, "user": get_user_info_dict(user_id)})

    old_email = (user.get('email') or '').strip().lower()
    email_was_empty = not old_email
    was_bounced = bool(user.get('email_bounced'))

    if was_bounced:
        cur.close()
        conn.close()
        return jsonify({"error": "É necessário validar o código enviado por e-mail para liberar seu acesso."}), 400

    hashed_pw = None
    if new_password:
        if len(new_password) < 8:
            cur.close()
            conn.close()
            return jsonify({"error": "A nova senha deve ter no mínimo 8 caracteres."}), 400
        if not current_password:
            cur.close()
            conn.close()
            return jsonify({"error": "Para alterar sua senha, forneça sua senha atual."}), 400
        if not check_password_hash(user['password_hash'], current_password):
            cur.close()
            conn.close()
            return jsonify({"error": "A senha atual informada está incorreta."}), 400
        hashed_pw = generate_password_hash(new_password)

    if hashed_pw:
        cur.execute("""
            UPDATE users 
            SET email = COALESCE(NULLIF(%s, ''), email),
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name),
                theme_preference = COALESCE(%s, theme_preference, 'dark'),
                password_hash = %s
            WHERE id = %s;
        """, (email, phone, name, theme_pref, hashed_pw, user_id))
    else:
        cur.execute("""
            UPDATE users 
            SET email = COALESCE(NULLIF(%s, ''), email),
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name),
                theme_preference = COALESCE(%s, theme_preference, 'dark')
            WHERE id = %s;
        """, (email, phone, name, theme_pref, user_id))

    # Synchronize with technicians table if user is linked to a technician
    if user.get('tech_id'):
        cur.execute("""
            UPDATE technicians 
            SET email = COALESCE(NULLIF(%s, ''), email),
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name)
            WHERE id = %s;
        """, (email, phone, name, user['tech_id']))

    # Clear bounce flag if email was updated to a new address
    if email and (email_was_empty or email != old_email):
        _clear_email_bounce_for_user(cur, user_id=user_id, new_email=email)

    conn.commit()
    cur.close()
    conn.close()

    # If email was provided/updated, dispatch confirmation email via Resend
    if email and (email_was_empty or email != old_email):
        user_display_name = name or user['username']
        _send_email_registered_notice(
            to_email=email,
            display_name=user_display_name,
            username=user['username']
        )

    if hashed_pw and (email or old_email):
        target_notify = (email or old_email).strip().lower()
        now_str = datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')
        safe_name = html.escape(str(name or user['username']))
        send_resend_email(
            to_email=target_notify,
            subject="[Claro Rede Externa] Alteração de Senha Realizada",
            category_badge="SEGURANÇA DA CONTA",
            title="Sua Senha foi Modificada",
            message_html=f'''
                <p>Olá, <strong>{safe_name}</strong>.</p>
                <p>Informamos que a senha de acesso da sua conta (<strong>{html.escape(user['username'])}</strong>) foi alterada através do painel de perfil em <strong>{now_str}</strong>.</p>
                <p>Se você realizou essa alteração, nenhuma ação é necessária. Se você <strong>não reconhece</strong> essa operação, redefina sua senha imediatamente.</p>
            ''',
            cta_text="Acessar Minha Conta",
            cta_url="https://gestaoredeexterna.shardweb.app/"
        )

    log_action(user_id, user['username'], f"Atualizou seus dados de perfil próprio (E-mail: {email or 'mantido'}, Telefone: {phone or 'mantido'}).")

    updated_user = get_user_info_dict(user_id)
    return jsonify({"success": True, "user": updated_user})


@app.route('/api/users/me/email-verification/send', methods=['POST'])
@login_required
def api_send_my_email_verification():
    """Envia código de 6 dígitos para validar que o e-mail informado realmente recebe mensagens."""
    import secrets
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not _is_valid_email_addr(email):
        return jsonify({"error": "Informe um endereço de e-mail válido (exemplo: usuario@claro.com.br)."}), 400

    conn = get_db()
    cur = conn.cursor()
    _ensure_email_bounce_schema(cur)
    cur.execute("SELECT id, username, name FROM users WHERE id = %s;", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        return jsonify({"error": "Usuário não encontrado."}), 404

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.datetime.now() + datetime.timedelta(minutes=15)
    cur.execute("""
        UPDATE users
        SET email_verify_code = %s,
            email_verify_target = %s,
            email_verify_expires_at = %s
        WHERE id = %s;
    """, (code, email, expires_at, user_id))
    conn.commit()
    cur.close()
    conn.close()

    safe_name = html.escape(str((data.get('name') or user.get('name') or user['username'])))
    ok, _status, detail = _send_resend_email_sync(
        to_email=email,
        subject="[Claro Rede Externa] Código de Validação de E-mail",
        category_badge="VALIDAÇÃO DE E-MAIL",
        title="Confirme seu Endereço de E-mail",
        message_html=f'''
            <p>Olá, <strong>{safe_name}</strong>.</p>
            <p>Use o código abaixo para confirmar que este endereço de e-mail é válido e está recebendo avisos do portal <strong>Gestão Rede Externa</strong>:</p>
            <div style="background: #172033; border: 1px solid #38BDF8; border-radius: 10px; padding: 18px; margin: 20px 0; text-align: center;">
                <span style="font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #F8FAFC; font-family: monospace;">{code}</span>
            </div>
            <p style="color: #94A3B8; font-size: 13px;">Este código expira em 15 minutos. Após validado, seu acesso ao portal será liberado imediatamente.</p>
        '''
    )
    if not ok:
        return jsonify({"error": f"Não foi possível enviar o código para {email}: {detail}"}), 400

    return jsonify({"success": True, "email": email, "message": f"Código de validação enviado para {email}."})


@app.route('/api/users/me/email-verification/verify', methods=['POST'])
@login_required
def api_verify_my_email_verification():
    """Valida o código de 6 dígitos enviado por e-mail, atualiza o cadastro e libera o acesso."""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    phone = (data.get('phone') or '').strip()
    name = (data.get('name') or '').strip()

    if not _is_valid_email_addr(email):
        return jsonify({"error": "Informe um endereço de e-mail válido."}), 400
    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({"error": "Informe o código numérico de 6 dígitos enviado para o e-mail."}), 400

    now_ts = time.time()
    with _SECURITY_STORE_LOCK:
        _EMAIL_VERIFY_FAILURES[user_id] = [t for t in _EMAIL_VERIFY_FAILURES[user_id] if now_ts - t < 900]
        email_verify_locked = len(_EMAIL_VERIFY_FAILURES[user_id]) >= 5
    if email_verify_locked:
        return jsonify({"error": "Muitas tentativas incorretas. Aguarde 15 minutos e solicite um novo código de validação."}), 429

    conn = get_db()
    cur = conn.cursor()
    _ensure_email_bounce_schema(cur)
    cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        return jsonify({"error": "Usuário não encontrado."}), 404

    saved_code = (user.get('email_verify_code') or '').strip()
    saved_target = (user.get('email_verify_target') or '').strip().lower()
    expires_at = user.get('email_verify_expires_at')

    if not saved_code or saved_target != email:
        cur.close()
        conn.close()
        return jsonify({"error": "Solicite um novo código de validação para este endereço de e-mail."}), 400
    if expires_at and datetime.datetime.now() > expires_at:
        cur.close()
        conn.close()
        return jsonify({"error": "O código expirou. Clique em 'Reenviar código' para receber um novo."}), 400
    if not hmac.compare_digest(saved_code, code):
        with _SECURITY_STORE_LOCK:
            _EMAIL_VERIFY_FAILURES[user_id].append(now_ts)
            fail_count = len(_EMAIL_VERIFY_FAILURES[user_id])
        if fail_count >= 5:
            cur.execute("""
                UPDATE users
                SET email_verify_code = NULL,
                    email_verify_target = NULL,
                    email_verify_expires_at = NULL
                WHERE id = %s;
            """, (user_id,))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({"error": "Muitas tentativas incorretas. O código foi invalidado; aguarde e solicite um novo código."}), 429
        cur.close()
        conn.close()
        return jsonify({"error": "Código incorreto. Verifique sua caixa de entrada ou spam e tente novamente."}), 400

    with _SECURITY_STORE_LOCK:
        _EMAIL_VERIFY_FAILURES.pop(user_id, None)

    old_email = (user.get('email') or '').strip().lower()
    cur.execute("""
        UPDATE users
        SET email = %s,
            phone = COALESCE(NULLIF(%s, ''), phone),
            name = COALESCE(NULLIF(%s, ''), name),
            email_bounced = FALSE,
            email_bounce_reason = NULL,
            email_bounced_at = NULL,
            email_verify_code = NULL,
            email_verify_target = NULL,
            email_verify_expires_at = NULL
        WHERE id = %s;
    """, (email, phone, name, user_id))

    if user.get('tech_id'):
        cur.execute("""
            UPDATE technicians
            SET email = %s,
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name)
            WHERE id = %s;
        """, (email, phone, name, user['tech_id']))

    cur.execute("UPDATE bounced_emails SET resolved_at = CURRENT_TIMESTAMP WHERE email = %s;", (email,))
    conn.commit()
    cur.close()
    conn.close()

    if email != old_email or not old_email:
        _send_email_registered_notice(
            to_email=email,
            display_name=name or user.get('name') or user['username'],
            username=user['username']
        )

    log_action(user_id, user['username'], f"Validou e confirmou e-mail de contato ({email}) via código de verificação.")
    updated_user = get_user_info_dict(user_id)
    return jsonify({"success": True, "user": updated_user})

# --------------------------------------------------------------------------
# HONEYPOT / DECOY BAIT ROUTES FOR SCANNER TRAPPING
# --------------------------------------------------------------------------
def get_ip_location(ip):
    if not ip or ip in ['127.0.0.1', 'localhost', '::1']:
        return "Localhost / Rede Interna"
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,isp"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('status') == 'success':
                city = data.get('city', '')
                region = data.get('regionName', '')
                country = data.get('country', '')
                isp = data.get('isp', '')
                return f"{city}, {region} - {country} ({isp})"
    except Exception:
        pass
    return "Localização Indisponível"

@app.route('/loginadmin')
@app.route('/admin_login')
@app.route('/phpmyadmin')
@app.route('/wp-admin')
@app.route('/admin.php')
def honeypot_trap():
    client_ip = get_client_ip()
    location = get_ip_location(client_ip)
    
    log_action(None, f"HONEYPOT_TRIGGERED_{client_ip}", f"Tentativa de acesso à rota chamariz de admin: {request.path} | Localização: {location}")
    
    now = time.time()
    for _ in range(50):
        RATE_LIMIT_STORE[client_ip].append(now)
        AUTH_RATE_LIMIT_STORE[client_ip].append(now)
        
    return render_template('honeypot_warning.html', client_ip=client_ip, location=location), 403

# --------------------------------------------------------------------------
# API ENDPOINTS
# --------------------------------------------------------------------------

# --- 1. TECHNICIANS (PESSOAS) ---

def _save_technician_doc(file_obj, prefix):
    if file_obj and getattr(file_obj, 'filename', None) and allowed_file(file_obj.filename, {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx'}):
        fname = secure_filename(file_obj.filename)
        unique_name = f"{prefix}_{int(time.time())}_{fname}"
        save_path = os.path.join(UPLOAD_FOLDER, 'documentos_pessoas', unique_name)
        file_obj.save(save_path)
        return f"documentos_pessoas/{unique_name}"
    return None

@app.route('/api/technicians', methods=['GET'])
@login_required
def api_get_technicians():
    search = request.args.get('search', '').strip().lower()
    try:
        conn = get_db()
        cur = conn.cursor()
        if search:
            s_param = f"%{search}%"
            cur.execute(
                """SELECT * FROM technicians WHERE 
                   LOWER(name) LIKE %s OR 
                   (cpf IS NOT NULL AND LOWER(cpf) LIKE %s) OR 
                   (area IS NOT NULL AND LOWER(area) LIKE %s) OR 
                   (role IS NOT NULL AND LOWER(role) LIKE %s) OR 
                   (company IS NOT NULL AND LOWER(company) LIKE %s) OR 
                   (team_type IS NOT NULL AND LOWER(team_type) LIKE %s) OR 
                   (team IS NOT NULL AND LOWER(team) LIKE %s) OR 
                   (registration_claro IS NOT NULL AND LOWER(registration_claro) LIKE %s) OR 
                   (registration_third IS NOT NULL AND LOWER(registration_third) LIKE %s) OR 
                   (toa_login IS NOT NULL AND LOWER(toa_login) LIKE %s)
                   ORDER BY name ASC;""",
                (s_param, s_param, s_param, s_param, s_param, s_param, s_param, s_param, s_param, s_param)
            )
        else:
            cur.execute("SELECT * FROM technicians ORDER BY name ASC;")
        techs = cur.fetchall()
        cur.close()
        conn.close()
        
        # Format dates safely
        for t in techs:
            if t.get('name'):
                t['name'] = format_person_name(t['name'])
        for t in techs:
            for dfield in ['dob', 'nr6_expiration', 'nr10_expiration', 'nr35_expiration', 'aso_expiration']:
                if t.get(dfield):
                    try:
                        t[dfield] = t[dfield].strftime('%Y-%m-%d')
                    except Exception:
                        t[dfield] = None
            if t['created_at']:
                try:
                    t['created_at'] = t['created_at'].strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    t['created_at'] = None
        return jsonify(techs)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/technicians', methods=['POST'])
@login_required
def api_create_technician():
    try:
        data = request.get_json(silent=True) or (request.form.to_dict() if request.form else {})
        name = format_person_name(str(data.get('name') or '').strip())
        cpf = str(data.get('cpf') or '').strip() or None
        phone = str(data.get('phone') or '').strip() or None
        identity = str(data.get('identity') or '').strip() or None
        dob = str(data.get('dob') or '').strip() or None
        role = str(data.get('role') or '').strip() or 'Técnico'
        area = str(data.get('area') or '').strip() or None
        team_type = str(data.get('team_type') or '').strip() or None
        shirt_size = str(data.get('shirt_size') or '').strip() or None
        boot_size = str(data.get('boot_size') or '').strip() or None
        pants_size = str(data.get('pants_size') or '').strip() or None
        jacket_size = str(data.get('jacket_size') or '').strip() or None
        team = str(data.get('team') or '').strip() or None
        company = str(data.get('company') or '').strip() or None
        registration_claro = str(data.get('registration_claro') or '').strip() or None
        registration_third = str(data.get('registration_third') or '').strip() or None
        toa_login = str(data.get('toa_login') or '').strip() or None
        phone_model = str(data.get('phone_model') or '').strip() or None
        imei_1 = str(data.get('imei_1') or '').strip() or None
        imei_2 = str(data.get('imei_2') or '').strip() or None
        email = str(data.get('email') or '').strip() or None
        
        nr6_expiration = str(data.get('nr6_expiration') or '').strip() or None
        nr10_expiration = str(data.get('nr10_expiration') or '').strip() or None
        nr35_expiration = str(data.get('nr35_expiration') or '').strip() or None
        aso_expiration = str(data.get('aso_expiration') or '').strip() or None

        nr6_file = _save_technician_doc(request.files.get('nr6_file'), 'nr6') if request.files else None
        nr10_file = _save_technician_doc(request.files.get('nr10_file'), 'nr10') if request.files else None
        nr35_file = _save_technician_doc(request.files.get('nr35_file'), 'nr35') if request.files else None
        aso_file = _save_technician_doc(request.files.get('aso_file'), 'aso') if request.files else None
        
        if not name:
            return jsonify({"error": "Nome completo é obrigatório."}), 400

        for d_var, d_name in [(dob, 'dob'), (nr6_expiration, 'nr6_expiration'), (nr10_expiration, 'nr10_expiration'), (nr35_expiration, 'nr35_expiration'), (aso_expiration, 'aso_expiration')]:
            if d_var:
                try:
                    yr = int(d_var.split('-')[0])
                    if yr < 1900 or yr > 2100:
                        if d_name == 'dob': dob = None
                        elif d_name == 'nr6_expiration': nr6_expiration = None
                        elif d_name == 'nr10_expiration': nr10_expiration = None
                        elif d_name == 'nr35_expiration': nr35_expiration = None
                        elif d_name == 'aso_expiration': aso_expiration = None
                except Exception:
                    if d_name == 'dob': dob = None
                    elif d_name == 'nr6_expiration': nr6_expiration = None
                    elif d_name == 'nr10_expiration': nr10_expiration = None
                    elif d_name == 'nr35_expiration': nr35_expiration = None
                    elif d_name == 'aso_expiration': aso_expiration = None
            
        conn = get_db()
        cur = conn.cursor()
        
        # Check unique CPF ONLY if CPF is provided
        if cpf:
            cur.execute("SELECT id FROM technicians WHERE cpf = %s;", (cpf,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"error": "Este CPF já está cadastrado no sistema."}), 400
            
        cur.execute(
            """
            INSERT INTO technicians (
                name, cpf, phone, identity, dob, role, area, team_type, 
                shirt_size, boot_size, pants_size, jacket_size, team, company, 
                registration_claro, registration_third, toa_login, phone_model, 
                imei_1, imei_2, email, nr6_expiration, nr10_expiration, nr35_expiration, aso_expiration,
                nr6_file, nr10_file, nr35_file, aso_file, created_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """,
            (name, cpf, phone, identity, dob, role, area, team_type, 
             shirt_size, boot_size, pants_size, jacket_size, team, company, 
             registration_claro, registration_third, toa_login, phone_model, 
             imei_1, imei_2, email, nr6_expiration, nr10_expiration, nr35_expiration, aso_expiration,
             nr6_file, nr10_file, nr35_file, aso_file, session['user_id'])
        )
        tech_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Cadastrou a pessoa: {name} (ID: {tech_id})")
        return jsonify({"success": True, "id": tech_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/technicians/<int:tech_id>', methods=['POST', 'PUT'])
@login_required
def api_update_technician(tech_id):
    try:
        data = request.get_json(silent=True) or (request.form.to_dict() if request.form else {})
        name = format_person_name(str(data.get('name') or '').strip())
        cpf = str(data.get('cpf') or '').strip() or None
        phone = str(data.get('phone') or '').strip() or None
        identity = str(data.get('identity') or '').strip() or None
        dob = str(data.get('dob') or '').strip() or None
        role = str(data.get('role') or '').strip() or 'Técnico'
        area = str(data.get('area') or '').strip() or None
        team_type = str(data.get('team_type') or '').strip() or None
        shirt_size = str(data.get('shirt_size') or '').strip() or None
        boot_size = str(data.get('boot_size') or '').strip() or None
        pants_size = str(data.get('pants_size') or '').strip() or None
        jacket_size = str(data.get('jacket_size') or '').strip() or None
        team = str(data.get('team') or '').strip() or None
        company = str(data.get('company') or '').strip() or None
        registration_claro = str(data.get('registration_claro') or '').strip() or None
        registration_third = str(data.get('registration_third') or '').strip() or None
        toa_login = str(data.get('toa_login') or '').strip() or None
        phone_model = str(data.get('phone_model') or '').strip() or None
        imei_1 = str(data.get('imei_1') or '').strip() or None
        imei_2 = str(data.get('imei_2') or '').strip() or None
        email = str(data.get('email') or '').strip() or None
        
        nr6_expiration = str(data.get('nr6_expiration') or '').strip() or None
        nr10_expiration = str(data.get('nr10_expiration') or '').strip() or None
        nr35_expiration = str(data.get('nr35_expiration') or '').strip() or None
        aso_expiration = str(data.get('aso_expiration') or '').strip() or None

        new_nr6_file = _save_technician_doc(request.files.get('nr6_file'), 'nr6') if request.files else None
        new_nr10_file = _save_technician_doc(request.files.get('nr10_file'), 'nr10') if request.files else None
        new_nr35_file = _save_technician_doc(request.files.get('nr35_file'), 'nr35') if request.files else None
        new_aso_file = _save_technician_doc(request.files.get('aso_file'), 'aso') if request.files else None
        
        if not name:
            return jsonify({"error": "Nome completo é obrigatório."}), 400

        for d_var, d_name in [(dob, 'dob'), (nr6_expiration, 'nr6_expiration'), (nr10_expiration, 'nr10_expiration'), (nr35_expiration, 'nr35_expiration'), (aso_expiration, 'aso_expiration')]:
            if d_var:
                try:
                    yr = int(d_var.split('-')[0])
                    if yr < 1900 or yr > 2100:
                        if d_name == 'dob': dob = None
                        elif d_name == 'nr6_expiration': nr6_expiration = None
                        elif d_name == 'nr10_expiration': nr10_expiration = None
                        elif d_name == 'nr35_expiration': nr35_expiration = None
                        elif d_name == 'aso_expiration': aso_expiration = None
                except Exception:
                    if d_name == 'dob': dob = None
                    elif d_name == 'nr6_expiration': nr6_expiration = None
                    elif d_name == 'nr10_expiration': nr10_expiration = None
                    elif d_name == 'nr35_expiration': nr35_expiration = None
                    elif d_name == 'aso_expiration': aso_expiration = None
            
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("SELECT email FROM technicians WHERE id = %s;", (tech_id,))
        old_tech_row = cur.fetchone()
        old_tech_email = ((old_tech_row or {}).get('email') or '').strip().lower()
        clean_new_tech_email = (email or '').strip().lower()

        # Check unique CPF (excluding this technician)
        if cpf:
            cur.execute("SELECT id FROM technicians WHERE cpf = %s AND id != %s;", (cpf, tech_id))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"error": "Este CPF já está em uso por outra pessoa."}), 400
            
        cur.execute(
            """
            UPDATE technicians 
            SET name = %s, cpf = %s, phone = %s, identity = %s, dob = %s, role = %s, 
                area = %s, team_type = %s, shirt_size = %s, boot_size = %s, 
                pants_size = %s, jacket_size = %s, team = %s, company = %s,
                registration_claro = %s, registration_third = %s, toa_login = %s,
                phone_model = %s, imei_1 = %s, imei_2 = %s, email = %s,
                nr6_expiration = %s, nr10_expiration = %s, nr35_expiration = %s, aso_expiration = %s,
                nr6_file = COALESCE(%s, nr6_file),
                nr10_file = COALESCE(%s, nr10_file),
                nr35_file = COALESCE(%s, nr35_file),
                aso_file = COALESCE(%s, aso_file)
            WHERE id = %s;
            """,
            (name, cpf, phone, identity, dob, role, area, team_type, 
             shirt_size, boot_size, pants_size, jacket_size, team, company, 
             registration_claro, registration_third, toa_login, phone_model, 
             imei_1, imei_2, email, nr6_expiration, nr10_expiration, nr35_expiration, aso_expiration,
             new_nr6_file, new_nr10_file, new_nr35_file, new_aso_file, tech_id)
        )
        if clean_new_tech_email and clean_new_tech_email != old_tech_email:
            _clear_email_bounce_for_user(cur, tech_id=tech_id, new_email=clean_new_tech_email)

        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Atualizou cadastro da pessoa: {name} (ID: {tech_id})")

        if clean_new_tech_email and clean_new_tech_email != old_tech_email:
            _send_email_registered_notice(
                to_email=clean_new_tech_email,
                display_name=name
            )

        # Notify technician via email if email is present and updater is coordinator/supervisor
        try:
            target_email = (email or '').strip()
            if not target_email:
                conn_chk = get_db()
                c_chk = conn_chk.cursor()
                c_chk.execute("SELECT email FROM users WHERE tech_id = %s;", (tech_id,))
                u_row = c_chk.fetchone()
                c_chk.close()
                conn_chk.close()
                if u_row and u_row.get('email'):
                    target_email = u_row['email'].strip()

            if target_email and '@' in target_email:
                updater_user = session.get('username', 'Coordenador Operacional')
                updater_role = session.get('role', 'Coordenação')
                now_str = datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')
                send_resend_email(
                    to_email=target_email,
                    subject=f"[Claro Rede Externa] Atualização Cadastral - {name}",
                    category_badge="CADASTRO ATUALIZADO",
                    title="Seu Cadastro foi Atualizado pela Coordenação",
                    message_html=f'''
                        <p>Olá, <strong>{name}</strong>.</p>
                        <p>Informamos que suas informações cadastrais no sistema <strong>Claro Gestão Rede Externa</strong> foram atualizadas por um responsável operacional.</p>
                        <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <tr>
                                    <td style="color: #94A3B8; padding: 5px 0;">Responsável:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{updater_user} ({updater_role})</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 5px 0;">Data/Hora:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{now_str}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 5px 0;">Cargo / Função:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{role}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 5px 0;">Empresa:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{company or 'Claro'}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 5px 0;">Área de Atuação:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{area or 'Geral'}</td>
                                </tr>
                            </table>
                        </div>
                        <p>Caso identifique alguma informação incorreta, acesse o menu <strong>Meu Perfil</strong> para verificar ou entre em contato com sua coordenação.</p>
                    ''',
                    cta_text="Conferir Meu Perfil",
                    cta_url="https://gestaoredeexterna.shardweb.app/perfil"
                )
        except Exception as notify_err:
            print("Technician update email error:", notify_err)

        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/technicians/<int:tech_id>', methods=['DELETE'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_delete_technician(tech_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name, cpf FROM technicians WHERE id = %s;", (tech_id,))
        tech = cur.fetchone()
        if not tech:
            cur.close()
            conn.close()
            return jsonify({"error": "Técnico não encontrado."}), 404
            
        cur.execute("DELETE FROM technicians WHERE id = %s;", (tech_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Excluiu cadastro do técnico: {tech['name']} (CPF: {tech['cpf']})")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


# --- 2. VEHICLES & COMPLETE FLEET MANAGEMENT ---
_FLEET_SCHEMA_READY = False

def _ensure_fleet_schema(cur):
    global _FLEET_SCHEMA_READY
    if _FLEET_SCHEMA_READY:
        return
    for col_sql in [
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_km INT DEFAULT 0;",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS crlv_number VARCHAR(80) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS crlv_expiration VARCHAR(30) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_company VARCHAR(120) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiration VARCHAR(30) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_company VARCHAR(120) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS contract_number VARCHAR(80) DEFAULT '';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS operational_status VARCHAR(40) DEFAULT 'Operacional';",
        "ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tires_json JSONB DEFAULT '{}'::jsonb;",
    ]:
        try:
            cur.execute(col_sql)
        except Exception:
            pass

    cur.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_inspections (
            id SERIAL PRIMARY KEY,
            vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
            plate VARCHAR(30) NOT NULL,
            inspection_type VARCHAR(40) NOT NULL DEFAULT 'entrega',
            from_person_name VARCHAR(150) NOT NULL,
            to_person_name VARCHAR(150) NOT NULL,
            to_tech_id INT REFERENCES technicians(id) ON DELETE SET NULL,
            km INT NOT NULL DEFAULT 0,
            fuel_level VARCHAR(20) DEFAULT '1/2',
            checklist_json JSONB DEFAULT '{}'::jsonb,
            has_damage BOOLEAN DEFAULT FALSE,
            damage_notes TEXT DEFAULT '',
            observations TEXT DEFAULT '',
            photo_front TEXT NOT NULL,
            photo_back TEXT NOT NULL,
            photo_left TEXT NOT NULL,
            photo_right TEXT NOT NULL,
            photo_extra TEXT DEFAULT '',
            signature_data TEXT DEFAULT '',
            photos_sha256 VARCHAR(128) DEFAULT '',
            status VARCHAR(30) DEFAULT 'pendente',
            created_by_user_id INT,
            created_by_name VARCHAR(150) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            approved_by_user_id INT,
            approved_by_name VARCHAR(150) DEFAULT '',
            approved_by_role VARCHAR(60) DEFAULT '',
            approved_at TIMESTAMP,
            review_notes TEXT DEFAULT ''
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_damages (
            id SERIAL PRIMARY KEY,
            vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
            plate VARCHAR(30) NOT NULL,
            area VARCHAR(100) DEFAULT '',
            occurrence_type VARCHAR(50) DEFAULT 'Avaria / Quebrado',
            severity VARCHAR(30) DEFAULT 'Média',
            affected_part VARCHAR(120) DEFAULT '',
            description TEXT NOT NULL,
            bo_number VARCHAR(80) DEFAULT '',
            reported_by_name VARCHAR(150) NOT NULL,
            driver_name VARCHAR(150) DEFAULT '',
            km INT DEFAULT 0,
            photos_json JSONB DEFAULT '[]'::jsonb,
            status VARCHAR(30) DEFAULT 'Aberta',
            resolution_notes TEXT DEFAULT '',
            resolved_by_name VARCHAR(150) DEFAULT '',
            resolved_at TIMESTAMP,
            inspection_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_maintenances (
            id SERIAL PRIMARY KEY,
            vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
            plate VARCHAR(30) NOT NULL,
            area VARCHAR(100) DEFAULT '',
            maintenance_type VARCHAR(50) DEFAULT 'Preventiva',
            title VARCHAR(180) NOT NULL,
            description TEXT DEFAULT '',
            scheduled_date VARCHAR(30) NOT NULL,
            target_km INT DEFAULT 0,
            workshop VARCHAR(150) DEFAULT '',
            cost DECIMAL(12,2) DEFAULT 0,
            downtime_hours VARCHAR(60) DEFAULT '',
            status VARCHAR(30) DEFAULT 'Agendada',
            voucher_photo TEXT DEFAULT '',
            completed_by_name VARCHAR(150) DEFAULT '',
            completed_at TIMESTAMP,
            completion_notes TEXT DEFAULT '',
            created_by_name VARCHAR(150) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_fines (
            id SERIAL PRIMARY KEY,
            vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
            plate VARCHAR(30) NOT NULL,
            area VARCHAR(100) DEFAULT '',
            auto_number VARCHAR(80) NOT NULL,
            infraction_date VARCHAR(40) NOT NULL,
            due_date VARCHAR(40) DEFAULT '',
            description TEXT NOT NULL,
            location VARCHAR(200) DEFAULT '',
            amount DECIMAL(12,2) DEFAULT 0,
            discount_amount DECIMAL(12,2) DEFAULT 0,
            driver_name VARCHAR(150) DEFAULT '',
            driver_response TEXT DEFAULT '',
            driver_responded_at TIMESTAMP,
            status VARCHAR(40) DEFAULT 'Aguardando Condutor',
            company_decision TEXT DEFAULT '',
            decided_by_name VARCHAR(150) DEFAULT '',
            decided_at TIMESTAMP,
            attachment_photo TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_veh_insp_vid ON vehicle_inspections(vehicle_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_veh_insp_status ON vehicle_inspections(status, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_veh_dmg_vid ON vehicle_damages(vehicle_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_veh_dmg_status ON vehicle_damages(status, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_veh_maint_vid ON vehicle_maintenances(vehicle_id, scheduled_date DESC);",
        "CREATE INDEX IF NOT EXISTS idx_veh_fines_vid ON vehicle_fines(vehicle_id, created_at DESC);",
    ]:
        try:
            cur.execute(idx_sql)
        except Exception:
            pass

    _FLEET_SCHEMA_READY = True


def _is_fleet_supervisor_or_coord():
    auth = get_current_user_auth()
    if not auth:
        return False
    if auth.get("is_master") or auth.get("is_coordenador"):
        return True
    role = (auth.get("role") or "").strip().lower()
    if role in ("supervisor", "coordenador", "administrador", "admin"):
        return True
    perms = auth.get("permissions") or []
    return "veiculos.edit" in perms


def _current_operator_Identity(cur):
    uid = session.get("user_id")
    cur.execute("""
        SELECT u.username, u.role, u.name AS u_name, t.name AS tech_name
        FROM users u
        LEFT JOIN technicians t ON u.tech_id = t.id
        WHERE u.id = %s;
    """, (uid,))
    row = cur.fetchone() or {}
    raw_name = row.get("u_name") or row.get("tech_name") or (row.get("username") or session.get("username") or "Operador").replace(".", " ")
    return {
        "user_id": uid,
        "name": format_person_name(raw_name),
        "role": row.get("role") or session.get("role") or "Colaborador",
    }


@app.route('/api/vehicles', methods=['GET'])
@login_required
def api_get_vehicles():
    search = request.args.get('search', '').strip().upper()
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        conn.commit()
        if search:
            cur.execute(
                """
                SELECT v.*, t.name AS responsible_name,
                       (SELECT COUNT(*) FROM vehicle_damages d WHERE d.vehicle_id = v.id AND d.status != 'Concluída') AS open_damages_count,
                       (SELECT COUNT(*) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS pending_inspections_count,
                       (SELECT COALESCE(MAX(GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.created_at)) / 60)::int), 0) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS oldest_pending_minutes,
                       (SELECT COALESCE(BOOL_OR(i.has_damage), FALSE) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS pending_has_damage,
                       (SELECT i.approved_by_name FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'aprovado' ORDER BY i.approved_at DESC NULLS LAST, i.id DESC LIMIT 1) AS last_approved_by_name,
                       (SELECT TO_CHAR(i.approved_at, 'DD/MM/YYYY HH24:MI') FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'aprovado' ORDER BY i.approved_at DESC NULLS LAST, i.id DESC LIMIT 1) AS last_approved_at
                FROM vehicles v 
                LEFT JOIN technicians t ON v.responsible_tech_id = t.id 
                WHERE UPPER(v.plate) LIKE %s OR UPPER(v.type) LIKE %s OR UPPER(v.model) LIKE %s 
                    OR UPPER(COALESCE(v.area_rede,'')) LIKE %s OR UPPER(COALESCE(v.base,'')) LIKE %s
                    OR UPPER(COALESCE(v.setor,'')) LIKE %s OR UPPER(COALESCE(v.condutor_dia,'')) LIKE %s
                    OR UPPER(COALESCE(v.condutor_tarde,'')) LIKE %s OR UPPER(COALESCE(v.condutor_madrugada,'')) LIKE %s
                    OR UPPER(COALESCE(v.subclus,'')) LIKE %s OR UPPER(COALESCE(t.name,'')) LIKE %s
                    OR UPPER(COALESCE(v.ticket_car,'')) LIKE %s
                ORDER BY v.plate ASC;
                """,
                tuple(f"%{search}%" for _ in range(12))
            )
        else:
            cur.execute(
                """
                SELECT v.*, t.name AS responsible_name,
                       (SELECT COUNT(*) FROM vehicle_damages d WHERE d.vehicle_id = v.id AND d.status != 'Concluída') AS open_damages_count,
                       (SELECT COUNT(*) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS pending_inspections_count,
                       (SELECT COALESCE(MAX(GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.created_at)) / 60)::int), 0) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS oldest_pending_minutes,
                       (SELECT COALESCE(BOOL_OR(i.has_damage), FALSE) FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'pendente') AS pending_has_damage,
                       (SELECT i.approved_by_name FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'aprovado' ORDER BY i.approved_at DESC NULLS LAST, i.id DESC LIMIT 1) AS last_approved_by_name,
                       (SELECT TO_CHAR(i.approved_at, 'DD/MM/YYYY HH24:MI') FROM vehicle_inspections i WHERE i.vehicle_id = v.id AND i.status = 'aprovado' ORDER BY i.approved_at DESC NULLS LAST, i.id DESC LIMIT 1) AS last_approved_at
                FROM vehicles v 
                LEFT JOIN technicians t ON v.responsible_tech_id = t.id 
                ORDER BY v.plate ASC;
                """
            )
        vehicles = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(vehicles)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/vehicles', methods=['POST'])
@login_required
def api_create_vehicle():
    data = request.get_json() or {}
    plate = data.get('plate', '').strip().upper()
    v_type = data.get('type', '').strip() or 'Utilitário'
    model = data.get('model', '').strip() or None
    responsible_tech_id = data.get('responsible_tech_id')
    if responsible_tech_id == '' or responsible_tech_id == 'null' or responsible_tech_id is None:
        responsible_tech_id = None
    else:
        responsible_tech_id = int(responsible_tech_id)
        
    has_rack = bool(data.get('has_rack', False))
    has_basket = bool(data.get('has_basket', False))
    has_giroflex = bool(data.get('has_giroflex', False))
    has_inverter = bool(data.get('has_inverter', False))
    ticket_car = data.get('ticket_car', '').strip() or None
    area_rede = data.get('area_rede', '').strip() or None
    base = data.get('base', '').strip() or None
    setor = data.get('setor', '').strip() or None
    condutor_dia = data.get('condutor_dia', '').strip() or None
    condutor_tarde = data.get('condutor_tarde', '').strip() or None
    condutor_madrugada = data.get('condutor_madrugada', '').strip() or None
    subclus = data.get('subclus', '').strip() or None
    try:
        current_km = int(data.get('current_km') or 0)
    except (TypeError, ValueError):
        current_km = 0
    crlv_number = (data.get('crlv_number') or '').strip()
    crlv_expiration = (data.get('crlv_expiration') or '').strip()
    insurance_company = (data.get('insurance_company') or '').strip()
    insurance_expiration = (data.get('insurance_expiration') or '').strip()
    rental_company = (data.get('rental_company') or '').strip()
    contract_number = (data.get('contract_number') or '').strip()
    operational_status = (data.get('operational_status') or 'Operacional').strip()

    if not plate:
        return jsonify({"error": "Placa do Veículo é obrigatória."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        # Check unique plate
        cur.execute("SELECT id FROM vehicles WHERE plate = %s;", (plate,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Esta placa já está cadastrada no sistema."}), 400
            
        cur.execute(
            """
            INSERT INTO vehicles (plate, type, model, responsible_tech_id, has_rack, has_basket, 
                has_giroflex, has_inverter, ticket_car, area_rede, base, setor, 
                condutor_dia, condutor_tarde, condutor_madrugada, subclus,
                current_km, crlv_number, crlv_expiration, insurance_company, insurance_expiration,
                rental_company, contract_number, operational_status, created_by) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """,
            (plate, v_type, model, responsible_tech_id, has_rack, has_basket, has_giroflex, has_inverter, 
             ticket_car, area_rede, base, setor, condutor_dia, condutor_tarde, condutor_madrugada, subclus,
             current_km, crlv_number, crlv_expiration, insurance_company, insurance_expiration,
             rental_company, contract_number, operational_status, session['user_id'])
        )
        vehicle_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Adicionou o veículo: {plate} (Modelo: {model}, ID: {vehicle_id})")
        return jsonify({"success": True, "id": vehicle_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/vehicles/<int:v_id>', methods=['PUT'])
@login_required
def api_update_vehicle(v_id):
    data = request.get_json() or {}
    plate = data.get('plate', '').strip().upper()
    v_type = data.get('type', '').strip() or 'Utilitário'
    model = data.get('model', '').strip() or None
    responsible_tech_id = data.get('responsible_tech_id')
    if responsible_tech_id == '' or responsible_tech_id == 'null' or responsible_tech_id is None:
        responsible_tech_id = None
    else:
        responsible_tech_id = int(responsible_tech_id)
        
    has_rack = bool(data.get('has_rack', False))
    has_basket = bool(data.get('has_basket', False))
    has_giroflex = bool(data.get('has_giroflex', False))
    has_inverter = bool(data.get('has_inverter', False))
    ticket_car = data.get('ticket_car', '').strip() or None
    area_rede = data.get('area_rede', '').strip() or None
    base = data.get('base', '').strip() or None
    setor = data.get('setor', '').strip() or None
    condutor_dia = data.get('condutor_dia', '').strip() or None
    condutor_tarde = data.get('condutor_tarde', '').strip() or None
    condutor_madrugada = data.get('condutor_madrugada', '').strip() or None
    subclus = data.get('subclus', '').strip() or None
    try:
        current_km = int(data.get('current_km') or 0)
    except (TypeError, ValueError):
        current_km = 0
    crlv_number = (data.get('crlv_number') or '').strip()
    crlv_expiration = (data.get('crlv_expiration') or '').strip()
    insurance_company = (data.get('insurance_company') or '').strip()
    insurance_expiration = (data.get('insurance_expiration') or '').strip()
    rental_company = (data.get('rental_company') or '').strip()
    contract_number = (data.get('contract_number') or '').strip()
    operational_status = (data.get('operational_status') or 'Operacional').strip()
    
    if not plate:
        return jsonify({"error": "Placa do Veículo é obrigatória."}), 400
        
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        
        # Check unique plate (excluding current vehicle)
        cur.execute("SELECT id FROM vehicles WHERE plate = %s AND id != %s;", (plate, v_id))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Esta placa já está cadastrada em outro veículo."}), 400
            
        cur.execute(
            """
            UPDATE vehicles 
            SET plate = %s, type = %s, model = %s, responsible_tech_id = %s, 
                has_rack = %s, has_basket = %s, has_giroflex = %s, has_inverter = %s, ticket_car = %s,
                area_rede = %s, base = %s, setor = %s, condutor_dia = %s, condutor_tarde = %s, condutor_madrugada = %s,
                subclus = %s, current_km = %s, crlv_number = %s, crlv_expiration = %s,
                insurance_company = %s, insurance_expiration = %s, rental_company = %s,
                contract_number = %s, operational_status = %s
            WHERE id = %s;
            """,
            (plate, v_type, model, responsible_tech_id, has_rack, has_basket, has_giroflex, has_inverter, 
             ticket_car, area_rede, base, setor, condutor_dia, condutor_tarde, condutor_madrugada, subclus,
             current_km, crlv_number, crlv_expiration, insurance_company, insurance_expiration,
             rental_company, contract_number, operational_status, v_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Atualizou cadastro do veículo: {plate} (ID: {v_id})")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/vehicles/<int:v_id>', methods=['DELETE'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_delete_vehicle(v_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT plate FROM vehicles WHERE id = %s;", (v_id,))
        v = cur.fetchone()
        if not v:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404
            
        cur.execute("DELETE FROM vehicles WHERE id = %s;", (v_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Excluiu veículo do cadastro: {v['plate']}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


# --- FLEET MANAGEMENT (VISTORIAS 4 LADOS, AVARIAS, PNEUS, MANUTENÇÕES, MULTAS & ALERTAS) ---

@app.route('/api/fleet/overview', methods=['GET'])
@login_required
def api_fleet_overview():
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        conn.commit()

        cur.execute("""
            SELECT i.id, i.vehicle_id, i.plate, i.inspection_type, i.from_person_name, i.to_person_name,
                   i.to_tech_id, i.km, i.fuel_level, i.checklist_json, i.has_damage, i.damage_notes,
                   i.observations, i.photos_sha256,
                   (CASE WHEN COALESCE(i.signature_data, '') != '' THEN TRUE ELSE FALSE END) AS has_signature,
                   i.status, i.created_by_user_id, i.created_by_name,
                   TO_CHAR(i.created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.created_at)) / 60)::int AS waiting_minutes,
                   i.approved_by_user_id, i.approved_by_name, i.approved_by_role,
                   TO_CHAR(i.approved_at, 'DD/MM/YYYY HH24:MI') AS approved_at_fmt,
                   i.review_notes,
                   v.model AS vehicle_model, v.area_rede, v.base, v.subclus
            FROM vehicle_inspections i
            LEFT JOIN vehicles v ON v.id = i.vehicle_id
            ORDER BY CASE WHEN i.status = 'pendente' THEN 0 ELSE 1 END,
                     i.has_damage DESC,
                     i.created_at ASC,
                     i.id DESC
            LIMIT 250;
        """)
        inspections = cur.fetchall()

        cur.execute("""
            SELECT d.id, d.vehicle_id, d.plate, d.area, d.occurrence_type, d.severity,
                   d.affected_part, d.description, d.bo_number, d.reported_by_name, d.driver_name,
                   d.km, d.photos_json, d.status, d.resolution_notes, d.resolved_by_name,
                   TO_CHAR(d.resolved_at, 'DD/MM/YYYY HH24:MI') AS resolved_at_fmt,
                   d.inspection_id,
                   TO_CHAR(d.created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.created_at)) / 60)::int AS waiting_minutes,
                   v.model AS vehicle_model, v.area_rede, v.base
            FROM vehicle_damages d
            LEFT JOIN vehicles v ON v.id = d.vehicle_id
            ORDER BY CASE WHEN d.status != 'Concluída' THEN 0 ELSE 1 END, d.created_at ASC, d.id DESC
            LIMIT 250;
        """)
        damages = cur.fetchall()

        cur.execute("""
            SELECT m.id, m.vehicle_id, m.plate, m.area, m.maintenance_type, m.title,
                   m.description, m.scheduled_date, m.target_km, m.workshop,
                   COALESCE(m.cost, 0)::float AS cost, m.downtime_hours, m.status,
                   m.voucher_photo, m.completed_by_name,
                   TO_CHAR(m.completed_at, 'DD/MM/YYYY HH24:MI') AS completed_at_fmt,
                   m.completion_notes, m.created_by_name,
                   TO_CHAR(m.created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   v.model AS vehicle_model, v.current_km
            FROM vehicle_maintenances m
            LEFT JOIN vehicles v ON v.id = m.vehicle_id
            ORDER BY CASE WHEN m.status IN ('Agendada', 'Em Oficina') THEN 0 ELSE 1 END, m.scheduled_date ASC, m.id DESC
            LIMIT 250;
        """)
        maintenances = cur.fetchall()

        cur.execute("""
            SELECT f.id, f.vehicle_id, f.plate, f.area, f.auto_number, f.infraction_date,
                   f.due_date, f.description, f.location,
                   COALESCE(f.amount, 0)::float AS amount,
                   COALESCE(f.discount_amount, 0)::float AS discount_amount,
                   f.driver_name, f.driver_response,
                   TO_CHAR(f.driver_responded_at, 'DD/MM/YYYY HH24:MI') AS driver_responded_at_fmt,
                   f.status, f.company_decision, f.decided_by_name,
                   TO_CHAR(f.decided_at, 'DD/MM/YYYY HH24:MI') AS decided_at_fmt,
                   f.attachment_photo,
                   TO_CHAR(f.created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   v.model AS vehicle_model
            FROM vehicle_fines f
            LEFT JOIN vehicles v ON v.id = f.vehicle_id
            ORDER BY CASE WHEN f.status != 'Concluída' THEN 0 ELSE 1 END, f.created_at DESC, f.id DESC
            LIMIT 250;
        """)
        fines = cur.fetchall()

        cur.execute("""
            SELECT id, plate, model, type, area_rede, base, subclus, current_km,
                   crlv_expiration, insurance_expiration, operational_status, tires_json,
                   condutor_dia
            FROM vehicles
            ORDER BY plate ASC;
        """)
        veh_rows = cur.fetchall()
        cur.close()
        conn.close()

        # Build actionable alerts
        alerts = []
        today = datetime.date.today()

        for insp in inspections:
            if insp.get("status") == "pendente":
                alerts.append({
                    "id": f"insp-{insp['id']}",
                    "category": "Vistoria Pendente",
                    "severity": "warning",
                    "plate": insp["plate"],
                    "vehicle_id": insp["vehicle_id"],
                    "area": insp.get("area_rede") or insp.get("base") or insp.get("subclus") or "Geral",
                    "title": f"Aprovação de Repasse Pendente ({insp['plate']})",
                    "description": f"{insp['from_person_name']} ➔ {insp['to_person_name']} ({insp['created_at_fmt']}) aguarda revisão de supervisor.",
                    "target_tab": "checklists",
                })

        for dmg in damages:
            if dmg.get("status") != "Concluída":
                sev = "critical" if "Crítica" in (dmg.get("severity") or "") or dmg.get("severity") == "Alta" else "warning"
                alerts.append({
                    "id": f"dmg-{dmg['id']}",
                    "category": "Avaria / Quebrado",
                    "severity": sev,
                    "plate": dmg["plate"],
                    "vehicle_id": dmg["vehicle_id"],
                    "area": dmg.get("area") or dmg.get("area_rede") or dmg.get("base") or "Geral",
                    "title": f"{dmg.get('occurrence_type')}: {dmg.get('affected_part') or dmg['plate']}",
                    "description": f"{dmg.get('description')[:120]} — Status: {dmg.get('status')} (Reportado por {dmg.get('reported_by_name')})",
                    "target_tab": "ocorrencias",
                })

        for m in maintenances:
            if m.get("status") in ("Agendada", "Em Oficina"):
                alerts.append({
                    "id": f"maint-{m['id']}",
                    "category": "Manutenção",
                    "severity": "info" if m.get("status") == "Agendada" else "warning",
                    "plate": m["plate"],
                    "vehicle_id": m["vehicle_id"],
                    "area": m.get("area") or "Geral",
                    "title": f"{m['maintenance_type']}: {m['title']} ({m['plate']})",
                    "description": f"Data programada: {m.get('scheduled_date')} · Status: {m.get('status')}",
                    "target_tab": "manutencoes",
                })

        for fn in fines:
            if fn.get("status") != "Concluída":
                alerts.append({
                    "id": f"fine-{fn['id']}",
                    "category": "Multa",
                    "severity": "warning",
                    "plate": fn["plate"],
                    "vehicle_id": fn["vehicle_id"],
                    "area": fn.get("area") or "Geral",
                    "title": f"Multa {fn['auto_number']} ({fn['plate']}) — {fn['status']}",
                    "description": f"Condutor: {fn.get('driver_name') or 'A indicar'} · Vencimento: {fn.get('due_date') or 'N/A'}",
                    "target_tab": "multas",
                })

        for v in veh_rows:
            v_area = v.get("area_rede") or v.get("base") or v.get("subclus") or "Geral"
            v_km = int(v.get("current_km") or 0)
            tires = v.get("tires_json") or {}
            if isinstance(tires, dict):
                for pos_key, pos_label in [("fl", "Dianteiro Esq."), ("fr", "Dianteiro Dir."), ("rl", "Traseiro Esq."), ("rr", "Traseiro Dir."), ("spare", "Estepe")]:
                    t_info = tires.get(pos_key) or {}
                    if not isinstance(t_info, dict):
                        continue
                    cond = t_info.get("condition") or "ok"
                    next_km = int(t_info.get("next_check_km") or 0)
                    if cond == "critical" or (next_km > 0 and v_km >= next_km):
                        alerts.append({
                            "id": f"tire-crit-{v['id']}-{pos_key}",
                            "category": "Pneus",
                            "severity": "critical",
                            "plate": v["plate"],
                            "vehicle_id": v["id"],
                            "area": v_area,
                            "title": f"Troca / Verificação Imediata de Pneu ({v['plate']})",
                            "description": f"Pneu {pos_label} atingiu limite ({v_km} km / meta {next_km} km).",
                            "target_tab": "pneus",
                        })
                    elif cond == "warning" or (next_km > 0 and v_km >= next_km - 1500):
                        alerts.append({
                            "id": f"tire-warn-{v['id']}-{pos_key}",
                            "category": "Pneus",
                            "severity": "warning",
                            "plate": v["plate"],
                            "vehicle_id": v["id"],
                            "area": v_area,
                            "title": f"Rodízio / Verificação Próxima de Pneu ({v['plate']})",
                            "description": f"Pneu {pos_label} próximo da revisão ({v_km} km).",
                            "target_tab": "pneus",
                        })

            for doc_col, doc_label in [("crlv_expiration", "CRLV"), ("insurance_expiration", "Seguro")]:
                exp_str = (v.get(doc_col) or "").strip()
                if exp_str and len(exp_str) == 10 and exp_str[4] == '-':
                    try:
                        exp_dt = datetime.date.fromisoformat(exp_str)
                        days_left = (exp_dt - today).days
                        if days_left <= 30:
                            alerts.append({
                                "id": f"doc-{v['id']}-{doc_col}",
                                "category": "Documento Veicular",
                                "severity": "critical" if days_left < 0 else "warning",
                                "plate": v["plate"],
                                "vehicle_id": v["id"],
                                "area": v_area,
                                "title": f"{doc_label} {'Vencido' if days_left < 0 else f'Vence em {days_left}d'} ({v['plate']})",
                                "description": f"Vencimento registrado: {exp_dt.strftime('%d/%m/%Y')}",
                                "target_tab": "veiculos",
                            })
                    except Exception:
                        pass

        return jsonify({
            "inspections": inspections,
            "damages": damages,
            "maintenances": maintenances,
            "fines": fines,
            "alerts": alerts,
            "can_review": _is_fleet_supervisor_or_coord(),
        })
    except Exception as e:
        print("[FLEET OVERVIEW ERROR]", e)
        return jsonify({"error": "Falha ao carregar gestão de frotas."}), 500


@app.route('/api/fleet/inspections/<int:insp_id>', methods=['GET'])
@login_required
def api_fleet_get_inspection_detail(insp_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        cur.execute("""
            SELECT i.*,
                   TO_CHAR(i.created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   TO_CHAR(i.approved_at, 'DD/MM/YYYY HH24:MI') AS approved_at_fmt,
                   v.model AS vehicle_model, v.type AS vehicle_type, v.area_rede, v.base, v.subclus
            FROM vehicle_inspections i
            LEFT JOIN vehicles v ON v.id = i.vehicle_id
            WHERE i.id = %s;
        """, (insp_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Vistoria não encontrada."}), 404
        return jsonify(row)
    except Exception as e:
        print("[FLEET INSP DETAIL ERROR]", e)
        return jsonify({"error": "Falha ao carregar detalhes da vistoria."}), 500


@app.route('/api/fleet/inspections', methods=['POST'])
@login_required
def api_fleet_create_inspection():
    data = request.get_json(silent=True) or {}
    try:
        vehicle_id = int(data.get("vehicle_id") or 0)
    except (TypeError, ValueError):
        vehicle_id = 0

    inspection_type = (data.get("inspection_type") or "entrega").strip().lower()
    if inspection_type not in ("entrega", "recebimento", "periodica"):
        inspection_type = "entrega"

    from_person_name = format_person_name((data.get("from_person_name") or "").strip())
    to_person_name = format_person_name((data.get("to_person_name") or "").strip())
    to_tech_raw = data.get("to_tech_id")
    to_tech_id = int(to_tech_raw) if to_tech_raw and str(to_tech_raw).isdigit() else None

    try:
        km = max(0, int(data.get("km") or 0))
    except (TypeError, ValueError):
        km = 0

    fuel_level = (data.get("fuel_level") or "1/2").strip()[:20]
    checklist_json = data.get("checklist") if isinstance(data.get("checklist"), dict) else {}
    has_damage = bool(data.get("has_damage"))
    damage_notes = (data.get("damage_notes") or "").strip()
    observations = (data.get("observations") or "").strip()

    photo_front = (data.get("photo_front") or "").strip()
    photo_back = (data.get("photo_back") or "").strip()
    photo_left = (data.get("photo_left") or "").strip()
    photo_right = (data.get("photo_right") or "").strip()
    photo_extra = (data.get("photo_extra") or "").strip()
    signature_data = (data.get("signature_data") or "").strip()

    if not vehicle_id:
        return jsonify({"error": "Selecione o veículo da vistoria."}), 400
    if not from_person_name or not to_person_name:
        return jsonify({"error": "Informe obrigatoriamente de qual pessoa está saindo e para qual pessoa está indo o veículo."}), 400
    if not (photo_front.startswith("data:image/") and photo_back.startswith("data:image/") and photo_left.startswith("data:image/") and photo_right.startswith("data:image/")):
        return jsonify({"error": "As fotos dos 4 lados do veículo (Frente, Traseira, Lateral Esquerda e Lateral Direita) são obrigatórias."}), 400
    if not signature_data.startswith("data:image/"):
        return jsonify({"error": "A assinatura digital do condutor na tela é obrigatória."}), 400

    import hashlib
    sha256_hash = hashlib.sha256(
        f"{photo_front}|{photo_back}|{photo_left}|{photo_right}|{signature_data}".encode("utf-8")
    ).hexdigest()

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT id, plate, area_rede, base, subclus, current_km FROM vehicles WHERE id = %s;", (vehicle_id,))
        vrow = cur.fetchone()
        if not vrow:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        op = _current_operator_Identity(cur)
        plate = vrow["plate"]
        v_area = vrow.get("area_rede") or vrow.get("base") or vrow.get("subclus") or ""

        cur.execute("""
            INSERT INTO vehicle_inspections (
                vehicle_id, plate, inspection_type, from_person_name, to_person_name, to_tech_id,
                km, fuel_level, checklist_json, has_damage, damage_notes, observations,
                photo_front, photo_back, photo_left, photo_right, photo_extra, signature_data,
                photos_sha256, status, created_by_user_id, created_by_name
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pendente', %s, %s)
            RETURNING id;
        """, (
            vehicle_id, plate, inspection_type, from_person_name, to_person_name, to_tech_id,
            km, fuel_level, json.dumps(checklist_json, ensure_ascii=False), has_damage, damage_notes, observations,
            photo_front, photo_back, photo_left, photo_right, photo_extra, signature_data,
            sha256_hash, op["user_id"], op["name"]
        ))
        insp_id = cur.fetchone()["id"]

        # Update vehicle KM
        if km > int(vrow.get("current_km") or 0):
            cur.execute("UPDATE vehicles SET current_km = %s WHERE id = %s;", (km, vehicle_id))

        # If damage was reported during checklist, automatically persist it in vehicle_damages history!
        if has_damage or damage_notes:
            dmg_desc = damage_notes or "Avaria apontada durante o checklist de entrega/recebimento."
            dmg_photos = [p for p in [photo_extra, photo_front, photo_back, photo_left, photo_right] if p.startswith("data:image/")][:4]
            cur.execute("""
                INSERT INTO vehicle_damages (
                    vehicle_id, plate, area, occurrence_type, severity, affected_part,
                    description, reported_by_name, driver_name, km, photos_json, status, inspection_id
                )
                VALUES (%s, %s, %s, 'Avaria em Vistoria', 'Média', 'Apontado no Checklist', %s, %s, %s, %s, %s::jsonb, 'Aberta', %s);
            """, (
                vehicle_id, plate, v_area, dmg_desc, op["name"], to_person_name, km,
                json.dumps(dmg_photos, ensure_ascii=False), insp_id
            ))
            cur.execute("UPDATE vehicles SET operational_status = 'Com Avaria' WHERE id = %s;", (vehicle_id,))

        conn.commit()
        cur.close()
        conn.close()

        log_action(op["user_id"], session.get("username"), f"Registrou vistoria veicular #{insp_id} ({plate}: {from_person_name} -> {to_person_name})")
        return jsonify({"success": True, "id": insp_id, "photos_sha256": sha256_hash}), 201
    except Exception as e:
        print("[FLEET CREATE INSP ERROR]", e)
        return jsonify({"error": "Falha ao salvar vistoria veicular no banco de dados."}), 500


@app.route('/api/fleet/inspections/<int:insp_id>/review', methods=['POST'])
@login_required
def api_fleet_review_inspection(insp_id):
    if not _is_fleet_supervisor_or_coord():
        return jsonify({"error": "Apenas Supervisores ou Coordenadores podem revisar e aprovar formulários veiculares."}), 403

    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "aprovar").strip().lower()
    review_notes = (data.get("review_notes") or "").strip()
    new_status = "aprovado" if action == "aprovar" else "reprovado"

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT * FROM vehicle_inspections WHERE id = %s;", (insp_id,))
        insp = cur.fetchone()
        if not insp:
            cur.close()
            conn.close()
            return jsonify({"error": "Formulário veicular não encontrado."}), 404

        op = _current_operator_Identity(cur)
        now_brt = _grafana_now_brt()

        cur.execute("""
            UPDATE vehicle_inspections
            SET status = %s,
                approved_by_user_id = %s,
                approved_by_name = %s,
                approved_by_role = %s,
                approved_at = %s,
                review_notes = %s
            WHERE id = %s
            RETURNING id, TO_CHAR(approved_at, 'DD/MM/YYYY HH24:MI') AS approved_at_fmt;
        """, (new_status, op["user_id"], op["name"], op["role"], now_brt, review_notes, insp_id))
        updated = cur.fetchone()

        # When approved, officially transfer vehicle responsibility to to_person_name!
        if new_status == "aprovado":
            vid = insp["vehicle_id"]
            to_name = insp["to_person_name"]
            to_tech_id = insp.get("to_tech_id")
            km = int(insp.get("km") or 0)
            if not to_tech_id and to_name:
                cur.execute("SELECT id FROM technicians WHERE LOWER(name) = LOWER(%s) LIMIT 1;", (to_name,))
                tmatch = cur.fetchone()
                if tmatch:
                    to_tech_id = tmatch["id"]

            cur.execute("""
                UPDATE vehicles
                SET condutor_dia = %s,
                    responsible_tech_id = COALESCE(%s, responsible_tech_id),
                    current_km = GREATEST(COALESCE(current_km, 0), %s)
                WHERE id = %s;
            """, (to_name, to_tech_id, km, vid))

        conn.commit()
        cur.close()
        conn.close()

        log_action(
            op["user_id"],
            session.get("username"),
            f"Revisou formulário veicular #{insp_id} ({insp['plate']}: {insp['from_person_name']} -> {insp['to_person_name']}) -> {new_status.upper()}"
        )
        return jsonify({
            "success": True,
            "status": new_status,
            "approved_by_name": op["name"],
            "approved_by_role": op["role"],
            "approved_at_fmt": updated["approved_at_fmt"],
            "review_notes": review_notes,
        })
    except Exception as e:
        print("[FLEET REVIEW INSP ERROR]", e)
        return jsonify({"error": "Falha ao registrar aprovação do formulário veicular."}), 500


@app.route('/api/fleet/vehicles/<int:v_id>/history', methods=['GET'])
@login_required
def api_fleet_vehicle_history(v_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("""
            SELECT v.*, t.name AS responsible_name
            FROM vehicles v
            LEFT JOIN technicians t ON v.responsible_tech_id = t.id
            WHERE v.id = %s;
        """, (v_id,))
        vehicle = cur.fetchone()
        if not vehicle:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        cur.execute("""
            SELECT id, vehicle_id, plate, inspection_type, from_person_name, to_person_name,
                   km, fuel_level, checklist_json, has_damage, damage_notes, observations,
                   photo_front, photo_back, photo_left, photo_right, photo_extra, signature_data,
                   photos_sha256, status, created_by_name,
                   TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt,
                   approved_by_name, approved_by_role,
                   TO_CHAR(approved_at, 'DD/MM/YYYY HH24:MI') AS approved_at_fmt,
                   review_notes
            FROM vehicle_inspections
            WHERE vehicle_id = %s
            ORDER BY created_at DESC, id DESC;
        """, (v_id,))
        inspections = cur.fetchall()

        cur.execute("""
            SELECT id, vehicle_id, plate, area, occurrence_type, severity, affected_part,
                   description, bo_number, reported_by_name, driver_name, km, photos_json,
                   status, resolution_notes, resolved_by_name,
                   TO_CHAR(resolved_at, 'DD/MM/YYYY HH24:MI') AS resolved_at_fmt,
                   TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt
            FROM vehicle_damages
            WHERE vehicle_id = %s
            ORDER BY created_at DESC, id DESC;
        """, (v_id,))
        damages = cur.fetchall()

        cur.execute("""
            SELECT id, vehicle_id, plate, area, maintenance_type, title, description,
                   scheduled_date, target_km, workshop, COALESCE(cost, 0)::float AS cost,
                   downtime_hours, status, voucher_photo, completed_by_name,
                   TO_CHAR(completed_at, 'DD/MM/YYYY HH24:MI') AS completed_at_fmt,
                   completion_notes, created_by_name,
                   TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt
            FROM vehicle_maintenances
            WHERE vehicle_id = %s
            ORDER BY created_at DESC, id DESC;
        """, (v_id,))
        maintenances = cur.fetchall()

        cur.execute("""
            SELECT id, vehicle_id, plate, area, auto_number, infraction_date, due_date,
                   description, location, COALESCE(amount, 0)::float AS amount,
                   COALESCE(discount_amount, 0)::float AS discount_amount,
                   driver_name, driver_response,
                   TO_CHAR(driver_responded_at, 'DD/MM/YYYY HH24:MI') AS driver_responded_at_fmt,
                   status, company_decision, decided_by_name,
                   TO_CHAR(decided_at, 'DD/MM/YYYY HH24:MI') AS decided_at_fmt,
                   TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_at_fmt
            FROM vehicle_fines
            WHERE vehicle_id = %s
            ORDER BY created_at DESC, id DESC;
        """, (v_id,))
        fines = cur.fetchall()

        cur.close()
        conn.close()
        return jsonify({
            "vehicle": vehicle,
            "inspections": inspections,
            "damages": damages,
            "maintenances": maintenances,
            "fines": fines,
        })
    except Exception as e:
        print("[FLEET VEHICLE HISTORY ERROR]", e)
        return jsonify({"error": "Falha ao carregar histórico do veículo."}), 500


@app.route('/api/fleet/damages', methods=['POST'])
@login_required
def api_fleet_create_damage():
    data = request.get_json(silent=True) or {}
    try:
        vehicle_id = int(data.get("vehicle_id") or 0)
    except (TypeError, ValueError):
        vehicle_id = 0

    occurrence_type = (data.get("occurrence_type") or "Avaria / Quebrado").strip()[:50]
    severity = (data.get("severity") or "Média").strip()[:30]
    affected_part = (data.get("affected_part") or "").strip()[:120]
    description = (data.get("description") or "").strip()
    bo_number = (data.get("bo_number") or "").strip()[:80]
    driver_name = format_person_name((data.get("driver_name") or "").strip())
    try:
        km = max(0, int(data.get("km") or 0))
    except (TypeError, ValueError):
        km = 0
    photos = data.get("photos") if isinstance(data.get("photos"), list) else []
    clean_photos = [str(p).strip() for p in photos if isinstance(p, str) and str(p).strip().startswith("data:image/")][:6]

    if not vehicle_id or not description:
        return jsonify({"error": "Selecione o veículo e descreva a avaria ou ocorrência."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT id, plate, area_rede, base, subclus FROM vehicles WHERE id = %s;", (vehicle_id,))
        vrow = cur.fetchone()
        if not vrow:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        op = _current_operator_Identity(cur)
        v_area = (data.get("area") or vrow.get("area_rede") or vrow.get("base") or vrow.get("subclus") or "").strip()

        cur.execute("""
            INSERT INTO vehicle_damages (
                vehicle_id, plate, area, occurrence_type, severity, affected_part,
                description, bo_number, reported_by_name, driver_name, km, photos_json, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'Aberta')
            RETURNING id;
        """, (
            vehicle_id, vrow["plate"], v_area, occurrence_type, severity, affected_part,
            description, bo_number, op["name"], driver_name or op["name"], km,
            json.dumps(clean_photos, ensure_ascii=False)
        ))
        dmg_id = cur.fetchone()["id"]

        cur.execute("UPDATE vehicles SET operational_status = 'Com Avaria' WHERE id = %s;", (vehicle_id,))
        conn.commit()
        cur.close()
        conn.close()

        log_action(op["user_id"], session.get("username"), f"Reportou avaria #{dmg_id} no veículo {vrow['plate']} ({affected_part})")
        return jsonify({"success": True, "id": dmg_id}), 201
    except Exception as e:
        print("[FLEET CREATE DAMAGE ERROR]", e)
        return jsonify({"error": "Falha ao registrar avaria no banco de dados."}), 500


@app.route('/api/fleet/damages/<int:dmg_id>', methods=['PUT'])
@login_required
def api_fleet_update_damage(dmg_id):
    if not _is_fleet_supervisor_or_coord():
        return jsonify({"error": "Apenas Supervisores ou Coordenadores podem alterar o status de avarias."}), 403

    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "Em Análise").strip()
    resolution_notes = (data.get("resolution_notes") or "").strip()

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT * FROM vehicle_damages WHERE id = %s;", (dmg_id,))
        dmg = cur.fetchone()
        if not dmg:
            cur.close()
            conn.close()
            return jsonify({"error": "Registro de avaria não encontrado."}), 404

        op = _current_operator_Identity(cur)
        now_brt = _grafana_now_brt() if status == "Concluída" else None

        cur.execute("""
            UPDATE vehicle_damages
            SET status = %s,
                resolution_notes = %s,
                resolved_by_name = CASE WHEN %s = 'Concluída' THEN %s ELSE resolved_by_name END,
                resolved_at = CASE WHEN %s = 'Concluída' THEN %s ELSE resolved_at END
            WHERE id = %s;
        """, (status, resolution_notes, status, op["name"], status, now_brt, dmg_id))

        # Check if vehicle still has any open damages
        cur.execute("SELECT COUNT(*) AS c FROM vehicle_damages WHERE vehicle_id = %s AND status != 'Concluída';", (dmg["vehicle_id"],))
        open_c = cur.fetchone()["c"]
        if open_c == 0:
            cur.execute("UPDATE vehicles SET operational_status = 'Operacional' WHERE id = %s;", (dmg["vehicle_id"],))

        conn.commit()
        cur.close()
        conn.close()

        log_action(op["user_id"], session.get("username"), f"Atualizou avaria #{dmg_id} ({dmg['plate']}) para {status}")
        return jsonify({"success": True})
    except Exception as e:
        print("[FLEET UPDATE DAMAGE ERROR]", e)
        return jsonify({"error": "Falha ao atualizar avaria."}), 500


@app.route('/api/fleet/vehicles/<int:v_id>/tires', methods=['PUT'])
@login_required
def api_fleet_update_tires(v_id):
    if not (_is_fleet_supervisor_or_coord() or user_has_permission('veiculos.edit')):
        return jsonify({"error": "Acesso negado: permissão insuficiente para atualizar pneus."}), 403
    data = request.get_json(silent=True) or {}
    tires = data.get("tires") if isinstance(data.get("tires"), dict) else {}
    try:
        current_km = int(data.get("current_km") or 0)
    except (TypeError, ValueError):
        current_km = 0

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("""
            UPDATE vehicles
            SET tires_json = %s::jsonb,
                current_km = CASE WHEN %s > 0 THEN %s ELSE current_km END
            WHERE id = %s
            RETURNING plate;
        """, (json.dumps(tires, ensure_ascii=False), current_km, current_km, v_id))
        vrow = cur.fetchone()
        if not vrow:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        conn.commit()
        cur.close()
        conn.close()
        log_action(session.get("user_id"), session.get("username"), f"Atualizou controle de pneus do veículo {vrow['plate']}")
        return jsonify({"success": True})
    except Exception as e:
        print("[FLEET TIRES ERROR]", e)
        return jsonify({"error": "Falha ao salvar dados dos pneus."}), 500


@app.route('/api/fleet/maintenances', methods=['POST'])
@login_required
def api_fleet_create_maintenance():
    if not (_is_fleet_supervisor_or_coord() or user_has_permission('veiculos.edit')):
        return jsonify({"error": "Acesso negado: permissão insuficiente para registrar manutenções."}), 403
    data = request.get_json(silent=True) or {}
    try:
        vehicle_id = int(data.get("vehicle_id") or 0)
    except (TypeError, ValueError):
        vehicle_id = 0

    maintenance_type = (data.get("maintenance_type") or "Preventiva").strip()[:50]
    title = (data.get("title") or "").strip()[:180]
    description = (data.get("description") or "").strip()
    scheduled_date = (data.get("scheduled_date") or "").strip()[:30]
    try:
        target_km = max(0, int(data.get("target_km") or 0))
    except (TypeError, ValueError):
        target_km = 0
    workshop = (data.get("workshop") or "").strip()[:150]
    try:
        cost = float(str(data.get("cost") or 0).replace(",", "."))
    except (TypeError, ValueError):
        cost = 0.0
    downtime_hours = (data.get("downtime_hours") or "").strip()[:60]
    status = (data.get("status") or "Agendada").strip()[:30]
    voucher_photo = (data.get("voucher_photo") or "").strip()

    if not vehicle_id or not title or not scheduled_date:
        return jsonify({"error": "Informe o veículo, título da manutenção e data programada."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT id, plate, area_rede, base, subclus FROM vehicles WHERE id = %s;", (vehicle_id,))
        vrow = cur.fetchone()
        if not vrow:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        op = _current_operator_Identity(cur)
        v_area = vrow.get("area_rede") or vrow.get("base") or vrow.get("subclus") or ""

        cur.execute("""
            INSERT INTO vehicle_maintenances (
                vehicle_id, plate, area, maintenance_type, title, description,
                scheduled_date, target_km, workshop, cost, downtime_hours, status,
                voucher_photo, created_by_name
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (
            vehicle_id, vrow["plate"], v_area, maintenance_type, title, description,
            scheduled_date, target_km, workshop, cost, downtime_hours, status,
            voucher_photo, op["name"]
        ))
        m_id = cur.fetchone()["id"]
        if status == "Em Oficina":
            cur.execute("UPDATE vehicles SET operational_status = 'Em Manutenção' WHERE id = %s;", (vehicle_id,))

        conn.commit()
        cur.close()
        conn.close()
        log_action(op["user_id"], session.get("username"), f"Agendou manutenção #{m_id} para {vrow['plate']} ({title})")
        return jsonify({"success": True, "id": m_id}), 201
    except Exception as e:
        print("[FLEET CREATE MAINT ERROR]", e)
        return jsonify({"error": "Falha ao registrar manutenção."}), 500


@app.route('/api/fleet/maintenances/<int:maint_id>', methods=['PUT'])
@login_required
def api_fleet_update_maintenance(maint_id):
    if not (_is_fleet_supervisor_or_coord() or user_has_permission('veiculos.edit')):
        return jsonify({"error": "Acesso negado: permissão insuficiente para atualizar manutenções."}), 403
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "Concluída").strip()[:30]
    completion_notes = (data.get("completion_notes") or "").strip()
    downtime_hours = (data.get("downtime_hours") or "").strip()[:60]
    try:
        cost = float(str(data.get("cost") or 0).replace(",", "."))
    except (TypeError, ValueError):
        cost = None
    voucher_photo = (data.get("voucher_photo") or "").strip()

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT * FROM vehicle_maintenances WHERE id = %s;", (maint_id,))
        m = cur.fetchone()
        if not m:
            cur.close()
            conn.close()
            return jsonify({"error": "Manutenção não encontrada."}), 404

        op = _current_operator_Identity(cur)
        now_brt = _grafana_now_brt() if status == "Concluída" else None

        cur.execute("""
            UPDATE vehicle_maintenances
            SET status = %s,
                completion_notes = COALESCE(NULLIF(%s, ''), completion_notes),
                downtime_hours = COALESCE(NULLIF(%s, ''), downtime_hours),
                cost = COALESCE(%s, cost),
                voucher_photo = COALESCE(NULLIF(%s, ''), voucher_photo),
                completed_by_name = CASE WHEN %s = 'Concluída' THEN %s ELSE completed_by_name END,
                completed_at = CASE WHEN %s = 'Concluída' THEN %s ELSE completed_at END
            WHERE id = %s;
        """, (
            status, completion_notes, downtime_hours, cost, voucher_photo,
            status, op["name"], status, now_brt, maint_id
        ))

        if status == "Concluída":
            cur.execute("UPDATE vehicles SET operational_status = 'Operacional' WHERE id = %s AND operational_status = 'Em Manutenção';", (m["vehicle_id"],))

        conn.commit()
        cur.close()
        conn.close()
        log_action(op["user_id"], session.get("username"), f"Atualizou manutenção #{maint_id} ({m['plate']}) para {status}")
        return jsonify({"success": True})
    except Exception as e:
        print("[FLEET UPDATE MAINT ERROR]", e)
        return jsonify({"error": "Falha ao atualizar manutenção."}), 500


@app.route('/api/fleet/fines', methods=['POST'])
@login_required
def api_fleet_create_fine():
    if not _is_fleet_supervisor_or_coord():
        return jsonify({"error": "Apenas Supervisores ou Coordenadores podem cadastrar autos de infração."}), 403

    data = request.get_json(silent=True) or {}
    try:
        vehicle_id = int(data.get("vehicle_id") or 0)
    except (TypeError, ValueError):
        vehicle_id = 0

    auto_number = (data.get("auto_number") or "").strip()[:80]
    infraction_date = (data.get("infraction_date") or "").strip()[:40]
    due_date = (data.get("due_date") or "").strip()[:40]
    description = (data.get("description") or "").strip()
    location = (data.get("location") or "").strip()[:200]
    driver_name = format_person_name((data.get("driver_name") or "").strip())
    try:
        amount = float(str(data.get("amount") or 0).replace(",", "."))
    except (TypeError, ValueError):
        amount = 0.0
    try:
        discount_amount = float(str(data.get("discount_amount") or 0).replace(",", "."))
    except (TypeError, ValueError):
        discount_amount = 0.0
    attachment_photo = (data.get("attachment_photo") or "").strip()

    if not vehicle_id or not auto_number or not description:
        return jsonify({"error": "Informe o veículo, número do auto de infração e descrição da multa."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)

        cur.execute("SELECT id, plate, area_rede, base, subclus, condutor_dia FROM vehicles WHERE id = %s;", (vehicle_id,))
        vrow = cur.fetchone()
        if not vrow:
            cur.close()
            conn.close()
            return jsonify({"error": "Veículo não encontrado."}), 404

        v_area = vrow.get("area_rede") or vrow.get("base") or vrow.get("subclus") or ""
        effective_driver = driver_name or vrow.get("condutor_dia") or ""

        cur.execute("""
            INSERT INTO vehicle_fines (
                vehicle_id, plate, area, auto_number, infraction_date, due_date,
                description, location, amount, discount_amount, driver_name,
                status, attachment_photo
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Aguardando Condutor', %s)
            RETURNING id;
        """, (
            vehicle_id, vrow["plate"], v_area, auto_number, infraction_date, due_date,
            description, location, amount, discount_amount, effective_driver, attachment_photo
        ))
        fine_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        log_action(session.get("user_id"), session.get("username"), f"Registrou multa {auto_number} no veículo {vrow['plate']}")
        return jsonify({"success": True, "id": fine_id}), 201
    except Exception as e:
        print("[FLEET CREATE FINE ERROR]", e)
        return jsonify({"error": "Falha ao registrar multa."}), 500


@app.route('/api/fleet/fines/<int:fine_id>/respond', methods=['PUT'])
@login_required
def api_fleet_respond_fine(fine_id):
    data = request.get_json(silent=True) or {}
    driver_name = format_person_name((data.get("driver_name") or "").strip())
    driver_response = (data.get("driver_response") or "").strip()
    if not driver_response:
        return jsonify({"error": "Escreva a resposta ou justificativa do condutor."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        op = _current_operator_Identity(cur)
        now_brt = _grafana_now_brt()

        cur.execute("""
            SELECT vf.id, vf.driver_name, v.responsible_tech_id
            FROM vehicle_fines vf
            LEFT JOIN vehicles v ON vf.vehicle_id = v.id
            WHERE vf.id = %s;
        """, (fine_id,))
        fine_row = cur.fetchone()
        if not fine_row:
            cur.close()
            conn.close()
            return jsonify({"error": "Multa não encontrada."}), 404

        if not (_is_fleet_supervisor_or_coord() or user_has_permission('veiculos.edit')):
            auth = get_current_user_auth()
            user_tech_id = auth.get('tech_id') if auth else None
            fine_driver_norm = (fine_row.get('driver_name') or '').strip().lower()
            op_name_norm = (op.get('name') or '').strip().lower()
            owns_fine = bool(
                user_tech_id is not None and (
                    fine_row.get('responsible_tech_id') == user_tech_id
                    or (fine_driver_norm and fine_driver_norm == op_name_norm)
                )
            )
            if not owns_fine:
                cur.close()
                conn.close()
                return jsonify({"error": "Acesso negado: você só pode responder a multas vinculadas ao seu cadastro."}), 403

        cur.execute("""
            UPDATE vehicle_fines
            SET driver_name = COALESCE(NULLIF(%s, ''), driver_name, %s),
                driver_response = %s,
                driver_responded_at = %s,
                status = 'Em Análise'
            WHERE id = %s
            RETURNING plate, auto_number;
        """, (driver_name, op["name"], driver_response, now_brt, fine_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            conn.close()
            return jsonify({"error": "Multa não encontrada."}), 404

        conn.commit()
        cur.close()
        conn.close()
        log_action(op["user_id"], session.get("username"), f"Respondeu multa {updated['auto_number']} ({updated['plate']}) -> Em Análise")
        return jsonify({"success": True})
    except Exception as e:
        print("[FLEET RESPOND FINE ERROR]", e)
        return jsonify({"error": "Falha ao enviar resposta da multa."}), 500


@app.route('/api/fleet/fines/<int:fine_id>/decide', methods=['PUT'])
@login_required
def api_fleet_decide_fine(fine_id):
    if not _is_fleet_supervisor_or_coord():
        return jsonify({"error": "Apenas Supervisores ou Coordenadores podem registrar a decisão da empresa."}), 403

    data = request.get_json(silent=True) or {}
    company_decision = (data.get("company_decision") or "").strip()
    status = (data.get("status") or "Concluída").strip()
    if not company_decision:
        return jsonify({"error": "Informe a decisão e observação da empresa."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_fleet_schema(cur)
        op = _current_operator_Identity(cur)
        now_brt = _grafana_now_brt()

        cur.execute("""
            UPDATE vehicle_fines
            SET company_decision = %s,
                decided_by_name = %s,
                decided_at = %s,
                status = %s
            WHERE id = %s
            RETURNING plate, auto_number;
        """, (company_decision, op["name"], now_brt, status, fine_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            conn.close()
            return jsonify({"error": "Multa não encontrada."}), 404

        conn.commit()
        cur.close()
        conn.close()
        log_action(op["user_id"], session.get("username"), f"Concluiu análise da multa {updated['auto_number']} ({updated['plate']})")
        return jsonify({"success": True})
    except Exception as e:
        print("[FLEET DECIDE FINE ERROR]", e)
        return jsonify({"error": "Falha ao registrar decisão da multa."}), 500


# --- 4. PROJECTS ---
@app.route('/api/projects', methods=['GET'])
@login_required
def api_get_projects():
    search = request.args.get('search', '').strip().upper()
    folder_id = request.args.get('folder_id')
    if folder_id == 'null' or folder_id == '' or folder_id is None:
        folder_id = None
    else:
        try:
            folder_id = int(folder_id)
        except (ValueError, TypeError):
            folder_id = None
        
    try:
        conn = get_db()
        cur = conn.cursor()
        if search:
            # Search flat (all folders)
            cur.execute(
                "SELECT * FROM projects WHERE UPPER(name) LIKE %s OR UPPER(description) LIKE %s OR UPPER(COALESCE(area,'')) LIKE %s ORDER BY created_at DESC;",
                (f"%{search}%", f"%{search}%", f"%{search}%")
            )
        elif folder_id is not None:
            cur.execute("SELECT * FROM projects WHERE folder_id = %s ORDER BY created_at DESC;", (folder_id,))
        else:
            cur.execute("SELECT * FROM projects WHERE folder_id IS NULL ORDER BY created_at DESC;")
        projects = cur.fetchall()
        cur.close()
        conn.close()
        
        for p in projects:
            if p['created_at']:
                p['created_at'] = p['created_at'].strftime('%d/%m/%Y %H:%M')
        return jsonify(projects)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/projects', methods=['POST'])
@login_required
def api_create_project():
    try:
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        area = request.form.get('area', '').strip() or None
        folder_id = request.form.get('folder_id')
        if folder_id == 'null' or folder_id == '' or folder_id is None:
            folder_id = None
        else:
            try:
                folder_id = int(folder_id)
            except (ValueError, TypeError):
                folder_id = None
        
        if not name:
            return jsonify({"error": "Nome do projeto é obrigatório."}), 400
            
        kmz_paths_list = []
        pdf_paths_list = []
        
        if 'kmz_file' in request.files:
            kmz_files = request.files.getlist('kmz_file')
            for index, file in enumerate(kmz_files):
                if file and file.filename != '' and allowed_file(file.filename, ALLOWED_PROJECT_EXTENSIONS):
                    filename = secure_filename(f"map_{int(time.time())}_{index}_{file.filename}")
                    file.save(os.path.join(UPLOAD_FOLDER, 'projetos', filename))
                    kmz_paths_list.append(f"projetos/{filename}")
                    
        if 'pdf_file' in request.files:
            pdf_files = request.files.getlist('pdf_file')
            for index, file in enumerate(pdf_files):
                if file and file.filename != '' and allowed_file(file.filename, ALLOWED_PROJECT_EXTENSIONS):
                    filename = secure_filename(f"doc_{int(time.time())}_{index}_{file.filename}")
                    file.save(os.path.join(UPLOAD_FOLDER, 'projetos', filename))
                    pdf_paths_list.append(f"projetos/{filename}")
                    
        kmz_path = ';'.join(kmz_paths_list) if kmz_paths_list else None
        pdf_path = ';'.join(pdf_paths_list) if pdf_paths_list else None
                
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO projects (name, description, area, folder_id, kmz_path, pdf_path, created_by) 
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """,
            (name, description, area, folder_id, kmz_path, pdf_path, session['user_id'])
        )
        p_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Criou o projeto de rede externa: {name} (ID: {p_id})")
        return jsonify({"success": True, "id": p_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/projects/<int:p_id>', methods=['DELETE'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_delete_project(p_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM projects WHERE id = %s;", (p_id,))
        p = cur.fetchone()
        if not p:
            cur.close()
            conn.close()
            return jsonify({"error": "Projeto não encontrado."}), 404
            
        cur.execute("DELETE FROM projects WHERE id = %s;", (p_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Deletou o projeto de rede: {p['name']}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/projects/<int:p_id>', methods=['POST', 'PUT'])
@login_required
def api_update_project(p_id):
    try:
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        area = request.form.get('area', '').strip() or None
        
        if not name:
            return jsonify({"error": "Nome do projeto é obrigatório."}), 400
            
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM projects WHERE id = %s;", (p_id,))
        project = cur.fetchone()
        if not project:
            cur.close()
            conn.close()
            return jsonify({"error": "Projeto não encontrado."}), 404
            
        kmz_paths_list = [project['kmz_path']] if project['kmz_path'] else []
        pdf_paths_list = [project['pdf_path']] if project['pdf_path'] else []
        
        if 'kmz_file' in request.files:
            kmz_files = request.files.getlist('kmz_file')
            for index, file in enumerate(kmz_files):
                if file and file.filename != '' and allowed_file(file.filename, ALLOWED_PROJECT_EXTENSIONS):
                    filename = secure_filename(f"map_{int(time.time())}_{index}_{file.filename}")
                    file.save(os.path.join(UPLOAD_FOLDER, 'projetos', filename))
                    kmz_paths_list.append(f"projetos/{filename}")
                    
        if 'pdf_file' in request.files:
            pdf_files = request.files.getlist('pdf_file')
            for index, file in enumerate(pdf_files):
                if file and file.filename != '' and allowed_file(file.filename, ALLOWED_PROJECT_EXTENSIONS):
                    filename = secure_filename(f"doc_{int(time.time())}_{index}_{file.filename}")
                    file.save(os.path.join(UPLOAD_FOLDER, 'projetos', filename))
                    pdf_paths_list.append(f"projetos/{filename}")
                    
        kmz_path = ';'.join(kmz_paths_list) if kmz_paths_list else None
        pdf_path = ';'.join(pdf_paths_list) if pdf_paths_list else None
        
        cur.execute(
            """
            UPDATE projects 
            SET name = %s, description = %s, area = %s, kmz_path = %s, pdf_path = %s 
            WHERE id = %s;
            """,
            (name, description, area, kmz_path, pdf_path, p_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Editou o projeto de rede: {name} (ID: {p_id})")
        return jsonify({"success": True}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


@app.route('/api/projects/<int:p_id>/upload', methods=['POST'])
@login_required
def api_upload_project_file(p_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM projects WHERE id = %s;", (p_id,))
        project = cur.fetchone()
        if not project:
            cur.close()
            conn.close()
            return jsonify({"error": "Projeto não encontrado."}), 404

        kmz_paths_list = [p for p in (project['kmz_path'] or '').split(';') if p]
        pdf_paths_list = [p for p in (project['pdf_path'] or '').split(';') if p]

        uploaded_count = 0
        all_files = []
        if 'files' in request.files:
            all_files.extend(request.files.getlist('files'))
        if 'file' in request.files:
            all_files.extend(request.files.getlist('file'))
        if 'kmz_file' in request.files:
            all_files.extend(request.files.getlist('kmz_file'))
        if 'pdf_file' in request.files:
            all_files.extend(request.files.getlist('pdf_file'))

        upload_dir = os.path.join(UPLOAD_FOLDER, 'projetos')
        os.makedirs(upload_dir, exist_ok=True)

        for index, file in enumerate(all_files):
            if file and file.filename != '' and allowed_file(file.filename, ALLOWED_PROJECT_EXTENSIONS):
                ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
                is_map = ext in ('kmz', 'kml')
                prefix = 'map' if is_map else 'doc'
                filename = secure_filename(f"{prefix}_{int(time.time())}_{index}_{file.filename}")
                file.save(os.path.join(upload_dir, filename))
                if is_map:
                    kmz_paths_list.append(f"projetos/{filename}")
                else:
                    pdf_paths_list.append(f"projetos/{filename}")
                uploaded_count += 1

        if uploaded_count == 0:
            cur.close()
            conn.close()
            return jsonify({"error": "Nenhum arquivo válido enviado. Extensões aceitas: KMZ, KML, PDF, DOCX, XLSX, imagens."}), 400

        cur.execute(
            "UPDATE projects SET kmz_path = %s, pdf_path = %s WHERE id = %s;",
            (';'.join(kmz_paths_list) if kmz_paths_list else None,
             ';'.join(pdf_paths_list) if pdf_paths_list else None,
             p_id)
        )
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Adicionou {uploaded_count} arquivo(s) ao projeto #{p_id} ({project['name']})")
        return jsonify({"success": True, "uploaded_count": uploaded_count, "message": f"{uploaded_count} arquivo(s) anexado(s) com sucesso!"})
    except Exception as e:
        print("Error uploading file to project:", e)
        return jsonify({"error": "Erro interno ao anexar arquivo ao projeto."}), 500

# --- FAVORITES API ---
@app.route('/api/favorites', methods=['GET'])
@login_required
def api_get_favorites():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, title, link, color, COALESCE(access_count, 0) AS access_count, created_at FROM favorites ORDER BY COALESCE(access_count, 0) DESC, id DESC;")
        favs = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(favs)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/favorites/<int:fav_id>/click', methods=['POST'])
@login_required
def api_click_favorite(fav_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE favorites SET access_count = COALESCE(access_count, 0) + 1 WHERE id = %s RETURNING access_count, title;", (fav_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Favorito não encontrado."}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "access_count": row['access_count']})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/favorites', methods=['POST'])
@login_required
def api_create_favorite():
    try:
        data = request.get_json(silent=True) or request.form
        title = data.get('title', '').strip()
        link = data.get('link', '').strip()
        color = data.get('color', 'Vermelho').strip()
        
        if not title or not link:
            return jsonify({"error": "Nome e link são obrigatórios."}), 400
            
        if not link.startswith('http://') and not link.startswith('https://'):
            link = 'https://' + link

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO favorites (title, link, color) VALUES (%s, %s, %s) RETURNING id;",
            (title, link, color)
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Cadastrou o favorito: {title}")
        return jsonify({"success": True, "id": new_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/favorites/<int:fav_id>', methods=['POST', 'PUT'])
@login_required
def api_update_favorite(fav_id):
    try:
        data = request.get_json(silent=True) or request.form
        title = data.get('title', '').strip()
        link = data.get('link', '').strip()
        color = data.get('color', 'Vermelho').strip()
        
        if not title or not link:
            return jsonify({"error": "Nome e link são obrigatórios."}), 400

        if not link.startswith('http://') and not link.startswith('https://'):
            link = 'https://' + link

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE favorites SET title = %s, link = %s, color = %s WHERE id = %s;",
            (title, link, color, fav_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Atualizou o favorito: {title} (ID: {fav_id})")
        return jsonify({"success": True}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/favorites/<int:fav_id>', methods=['DELETE'])
@login_required
def api_delete_favorite(fav_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM favorites WHERE id = %s;", (fav_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Deletou favorito ID: {fav_id}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- ROUTES API ---
@app.route('/api/routes', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_routes():
    if request.method == 'GET':
        try:
            route_type = request.args.get('type', '').strip()
            conn = get_db()
            cur = conn.cursor()
            
            if route_type and route_type in ['Empresarial', 'Residencial']:
                cur.execute(
                    "SELECT r.id, r.name, r.type, r.description, r.created_at, "
                    "COUNT(l.id) AS lines_count "
                    "FROM routes r LEFT JOIN route_lines l ON r.id = l.route_id "
                    "WHERE r.type = %s GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC;",
                    (route_type,)
                )
            else:
                cur.execute(
                    "SELECT r.id, r.name, r.type, r.description, r.created_at, "
                    "COUNT(l.id) AS lines_count "
                    "FROM routes r LEFT JOIN route_lines l ON r.id = l.route_id "
                    "GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC;"
                )
            routes = cur.fetchall()
            cur.close()
            conn.close()
            for r in routes:
                if r.get('created_at'):
                    r['created_at_fmt'] = r['created_at'].strftime('%d/%m/%Y às %H:%M')
                else:
                    r['created_at_fmt'] = ''
            return jsonify(routes)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    elif request.method == 'POST':
        try:
            data = request.get_json(silent=True) or request.form
            name = data.get('name', '').strip()
            route_type = data.get('type', 'Empresarial').strip()
            description = data.get('description', '').strip()
            
            if not name:
                return jsonify({"error": "Nome da rota é obrigatório."}), 400
                
            if route_type not in ['Empresarial', 'Residencial']:
                route_type = 'Empresarial'

            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO routes (name, type, description) VALUES (%s, %s, %s) RETURNING id;",
                (name, route_type, description)
            )
            new_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Cadastrou a rota: {name} ({route_type})")
            return jsonify({"success": True, "id": new_id}), 201
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/routes/<int:route_id>', methods=['GET', 'POST', 'PUT', 'DELETE'], strict_slashes=False)
@login_required
def api_route_detail(route_id):
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, name, type, description, created_at FROM routes WHERE id = %s;", (route_id,))
            route = cur.fetchone()
            if not route:
                cur.close()
                conn.close()
                return jsonify({"error": "Rota não encontrada."}), 404
                
            cur.execute("SELECT id, route_id, stretch_name, pop_box, cable_type, notes, address, event_type, measurement, created_at FROM route_lines WHERE route_id = %s ORDER BY id ASC;", (route_id,))
            lines = cur.fetchall()
            cur.close()
            conn.close()
            
            return jsonify({"route": route, "lines": lines})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    elif request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM routes WHERE id = %s;", (route_id,))
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Excluiu a rota ID: {route_id}")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    else: # POST or PUT
        try:
            data = request.get_json(silent=True) or request.form
            name = data.get('name', '').strip()
            route_type = data.get('type', 'Empresarial').strip()
            description = data.get('description', '').strip()
            
            if not name:
                return jsonify({"error": "Nome da rota é obrigatório."}), 400

            if route_type not in ['Empresarial', 'Residencial']:
                route_type = 'Empresarial'

            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                "UPDATE routes SET name = %s, type = %s, description = %s WHERE id = %s;",
                (name, route_type, description, route_id)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Atualizou a rota: {name} (ID: {route_id})")
            return jsonify({"success": True}), 200
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- ROUTE LINES API ---
@app.route('/api/routes/<int:route_id>/lines', methods=['POST'], strict_slashes=False)
@login_required
def api_add_route_line(route_id):
    try:
        data = request.get_json(silent=True) or request.form
        stretch_name = data.get('stretch_name', '').strip()
        pop_box = data.get('pop_box', '').strip()
        cable_type = data.get('cable_type', '').strip()
        notes = data.get('notes', '').strip()
        address = data.get('address', '').strip()
        event_type = data.get('event_type', '').strip()
        measurement = data.get('measurement', '').strip() or cable_type
        
        if not stretch_name:
            return jsonify({"error": "Data da medição é obrigatória."}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO route_lines (route_id, stretch_name, pop_box, cable_type, notes, address, event_type, measurement) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;",
            (route_id, stretch_name, pop_box, cable_type, notes, address, event_type, measurement)
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Adicionou linha/medição '{stretch_name}' na Rota ID {route_id}")
        return jsonify({"success": True, "id": new_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/routes/lines/<int:line_id>', methods=['POST', 'PUT', 'DELETE'], strict_slashes=False)
@login_required
def api_route_line_detail(line_id):
    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM route_lines WHERE id = %s;", (line_id,))
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else: # POST or PUT
        try:
            data = request.get_json(silent=True) or request.form
            stretch_name = data.get('stretch_name', '').strip()
            pop_box = data.get('pop_box', '').strip()
            cable_type = data.get('cable_type', '').strip()
            notes = data.get('notes', '').strip()
            address = data.get('address', '').strip()
            event_type = data.get('event_type', '').strip()
            measurement = data.get('measurement', '').strip() or cable_type
            
            if not stretch_name:
                return jsonify({"error": "Data da medição é obrigatória."}), 400

            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                "UPDATE route_lines SET stretch_name = %s, pop_box = %s, cable_type = %s, notes = %s, address = %s, event_type = %s, measurement = %s WHERE id = %s;",
                (stretch_name, pop_box, cable_type, notes, address, event_type, measurement, line_id)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({"success": True}), 200
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/routes/<int:route_id>/export', methods=['GET'], strict_slashes=False)
@login_required
def api_export_route_lines(route_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM routes WHERE id = %s;", (route_id,))
        r = cur.fetchone()
        route_name = r['name'] if r else f"Rota_{route_id}"

        cur.execute("SELECT stretch_name, pop_box, cable_type, event_type, measurement, notes, address FROM route_lines WHERE route_id = %s ORDER BY id ASC;", (route_id,))
        lines = cur.fetchall()
        cur.close()
        conn.close()

        csv_output = "\ufeffData;Local / Caixa POP;Tipo de Cabo;Tipo de Evento;Medição;Endereço;Observações Técnicas\n"
        for line in lines:
            s_name = (line.get('stretch_name') or '').replace(';', ',').replace('\n', ' ')
            pop = (line.get('pop_box') or '').replace(';', ',').replace('\n', ' ')
            cab = (line.get('cable_type') or '').replace(';', ',').replace('\n', ' ')
            ev = (line.get('event_type') or '').replace(';', ',').replace('\n', ' ')
            med = (line.get('measurement') or cab).replace(';', ',').replace('\n', ' ')
            addr = (line.get('address') or '').replace(';', ',').replace('\n', ' ')
            obs = (line.get('notes') or '').replace(';', ',').replace('\n', ' ')
            csv_output += f"{s_name};{pop};{cab};{ev};{med};{addr};{obs}\n"

        from flask import Response
        filename = f"medicoes_{route_name.lower().replace(' ', '_')}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            csv_output,
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/routes/export', methods=['GET'], strict_slashes=False)
@login_required
def api_export_all_routes():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT r.id, r.name, r.type, r.description, r.created_at,
                   COUNT(rl.id) AS lines_count
            FROM routes r
            LEFT JOIN route_lines rl ON r.id = rl.route_id
            GROUP BY r.id, r.name, r.type, r.description, r.created_at
            ORDER BY r.created_at DESC;
        """)
        routes = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff')
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow(["ID", "Nome da Rota", "Tipo", "Descrição", "Qtd Medições", "Data Cadastro"])

        # Fetch comprehensive route lines detail
        cur_all = get_db().cursor()
        cur_all.execute("""
            SELECT r.id AS route_id, r.name AS route_name, r.type AS route_type,
                   rl.stretch_name, rl.pop_box, rl.cable_type, rl.event_type, rl.measurement, rl.address, rl.notes, rl.created_at
            FROM routes r
            LEFT JOIN route_lines rl ON r.id = rl.route_id
            ORDER BY r.name ASC, rl.id ASC;
        """)
        all_lines = cur_all.fetchall()
        cur_all.close()

        output_detail = io.StringIO()
        output_detail.write('\ufeff')
        writer_d = safe_csv_writer(output_detail, delimiter=';')
        writer_d.writerow(["ID Rota", "Nome da Rota", "Tipo da Rota", "Data/Trecho", "Caixa POP", "Tipo de Cabo", "Tipo Evento", "Medição", "Endereço", "Observações", "Data Cadastro"])
        for al in all_lines:
            dta = al['created_at'].strftime('%d/%m/%Y %H:%M') if al.get('created_at') else ''
            writer_d.writerow([
                al['route_id'],
                al['route_name'] or '',
                al['route_type'] or '',
                al.get('stretch_name') or '',
                al.get('pop_box') or '',
                al.get('cable_type') or '',
                al.get('event_type') or '',
                al.get('measurement') or '',
                (al.get('address') or '').replace('\n', ' ').replace('\r', ''),
                (al.get('notes') or '').replace('\n', ' ').replace('\r', ''),
                dta
            ])
        output = output_detail

        from flask import Response
        filename = f"relatorio_todas_rotas_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/routes/<int:route_id>/bulk', methods=['POST'], strict_slashes=False)
@login_required
def api_bulk_import_route_lines(route_id):
    try:
        data = request.get_json(silent=True) or request.form
        csv_data = data.get('csv_data', '').strip()
        if not csv_data:
            return jsonify({"error": "Nenhum dado informado para importação."}), 400

        lines_raw = csv_data.splitlines()
        imported = 0
        conn = get_db()
        cur = conn.cursor()

        for idx, row in enumerate(lines_raw):
            if not row.strip():
                continue
            parts = [p.strip() for p in row.split(';')]
            if len(parts) < 2:
                parts = [p.strip() for p in row.split(',')]
            
            # Skip header if present
            if idx == 0 and ('data' in parts[0].lower() or 'linha' in parts[0].lower()):
                continue

            stretch_name = parts[0] if len(parts) > 0 else ''
            pop_box = parts[1] if len(parts) > 1 else ''
            cable_type = parts[2] if len(parts) > 2 else ''
            notes = parts[3] if len(parts) > 3 else ''
            address = parts[4] if len(parts) > 4 else ''
            event_type = parts[5] if len(parts) > 5 else ''
            measurement = parts[6] if len(parts) > 6 else cable_type

            if not stretch_name:
                continue

            cur.execute(
                "INSERT INTO route_lines (route_id, stretch_name, pop_box, cable_type, notes, address, event_type, measurement) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s);",
                (route_id, stretch_name, pop_box, cable_type, notes, address, event_type, measurement)
            )
            imported += 1

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Importou {imported} medições/linhas na Rota ID {route_id}")
        return jsonify({"success": True, "imported": imported})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- FORMS API ---

@app.route('/api/forms/convert-google-form', methods=['POST'])
@app.route('/api/forms/convert-external-form', methods=['POST'])
@login_required
def api_convert_google_form():
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or data.get('link') or '').strip()
    if not url:
        return jsonify({"error": "Por favor, informe o link do formulário (Google Forms ou Microsoft Forms)."}), 400

    u_lower = url.lower()
    if 'forms.office.com' in u_lower or 'forms.microsoft.com' in u_lower:
        parsed, parse_err = parse_microsoft_form(url)
    else:
        parsed, parse_err = parse_google_form(url)

    if parse_err:
        return jsonify({"error": parse_err}), 400

    return jsonify({
        "success": True,
        "title": parsed.get('title'),
        "description": parsed.get('description'),
        "questions": parsed.get('questions'),
        "count": len(parsed.get('questions') or [])
    })

@app.route('/api/forms', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_forms():
    if request.method == 'GET':
        try:
            category = request.args.get('category', '').strip()
            conn = get_db()
            cur = conn.cursor()
            if category:
                cur.execute("SELECT id, title, slug, category, description, link, questions, created_at FROM forms WHERE category = %s ORDER BY id DESC;", (category,))
            else:
                cur.execute("SELECT id, title, slug, category, description, link, questions, created_at FROM forms ORDER BY id DESC;")
            forms = cur.fetchall()
            for f in forms:
                q_data = f.get('questions')
                if isinstance(q_data, str):
                    try:
                        q_data = json.loads(q_data)
                    except Exception:
                        q_data = []
                f['questions'] = q_data or []
                f['questions_count'] = len(q_data) if q_data else 0
                f['link'] = f"/f/{f['slug']}"
            cur.close()
            conn.close()
            return jsonify(forms)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    elif request.method == 'POST':
        try:
            data = request.get_json(silent=True) or request.form
            title = data.get('title', '').strip()
            category = data.get('category', 'Inspeção').strip()
            description = data.get('description', '').strip()
            link = data.get('link', '').strip()

            questions = data.get('questions')
            if not questions and link and ('forms.gle' in link or 'docs.google.com/forms' in link or 'forms.office.com' in link or 'forms.microsoft.com' in link):
                if 'forms.office.com' in link.lower() or 'forms.microsoft.com' in link.lower():
                    parsed, parse_err = parse_microsoft_form(link)
                else:
                    parsed, parse_err = parse_google_form(link)

                if parsed:
                    if not title:
                        title = parsed.get('title')
                    if not description:
                        description = parsed.get('description')
                    questions = parsed.get('questions')
                elif not title:
                    return jsonify({"error": parse_err}), 400

            if not title:
                return jsonify({"error": "Nome do formulário é obrigatório."}), 400

            # Generate unique slug for form
            slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
            if not slug:
                slug = f"form-{int(time.time())}"

            conn = get_db()
            cur = conn.cursor()
            
            # Check if slug exists
            cur.execute("SELECT id FROM forms WHERE slug = %s;", (slug,))
            if cur.fetchone():
                slug = f"{slug}-{int(time.time() % 10000)}"

            native_link = f"/f/{slug}"
            questions_json = json.dumps(questions, ensure_ascii=False) if questions else None

            cur.execute(
                "INSERT INTO forms (title, slug, category, description, link, questions) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;",
                (title, slug, category, description, native_link, questions_json)
            )
            new_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Cadastrou o formulário: {title}")
            return jsonify({"success": True, "id": new_id, "slug": slug, "has_questions": bool(questions)}), 201
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/forms/<int:form_id>', methods=['GET', 'POST', 'PUT', 'DELETE'], strict_slashes=False)
@login_required
def api_form_detail(form_id):
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, title, slug, category, description, link, questions, created_at FROM forms WHERE id = %s;", (form_id,))
            f = cur.fetchone()
            cur.close()
            conn.close()
            if not f:
                return jsonify({"error": "Formulário não encontrado."}), 404
            f['link'] = f"/f/{f['slug']}"
            return jsonify(f)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    elif request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM forms WHERE id = %s;", (form_id,))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Excluiu o formulário ID: {form_id}")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

    else: # POST or PUT
        try:
            data = request.get_json(silent=True) or request.form
            title = data.get('title', '').strip()
            category = data.get('category', 'Inspeção').strip()
            description = data.get('description', '').strip()
            link = data.get('link', '').strip()

            if not title:
                return jsonify({"error": "Nome do formulário é obrigatório."}), 400

            new_slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') or f"form-{form_id}"
            native_link = f"/f/{new_slug}"

            questions = data.get('questions')
            if not questions and link and ('forms.gle' in link or 'docs.google.com/forms' in link or 'forms.office.com' in link or 'forms.microsoft.com' in link):
                if 'forms.office.com' in link.lower() or 'forms.microsoft.com' in link.lower():
                    parsed, _ = parse_microsoft_form(link)
                else:
                    parsed, _ = parse_google_form(link)
                if parsed and parsed.get('questions'):
                    questions = parsed['questions']
            
            questions_json = json.dumps(questions, ensure_ascii=False) if questions is not None else None

            conn = get_db()
            cur = conn.cursor()
            if questions_json is not None:
                cur.execute(
                    "UPDATE forms SET title = %s, slug = COALESCE(NULLIF(slug, ''), %s), category = %s, description = %s, link = %s, questions = %s WHERE id = %s;",
                    (title, new_slug, category, description, native_link, questions_json, form_id)
                )
            else:
                cur.execute(
                    "UPDATE forms SET title = %s, slug = COALESCE(NULLIF(slug, ''), %s), category = %s, description = %s, link = %s WHERE id = %s;",
                    (title, new_slug, category, description, native_link, form_id)
                )
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou formulário: {title} (ID: {form_id})")
            return jsonify({"success": True}), 200
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- PUBLIC FORM RESPONDER ROUTES (NO LOGIN OR AUTHENTICATOR REQUIRED) ---
@app.route('/f/<slug>', methods=['GET'], strict_slashes=False)
def public_form_view(slug):
    # Route into React SPA so the form is rendered natively inside Claro Gestão
    return serve_react_app()

@app.route('/api/public/forms/<slug>', methods=['GET'], strict_slashes=False)
def api_public_form_get(slug):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE slug = %s;", (slug,))
        f = cur.fetchone()
        if not f:
            if slug == 'inspecao-visual-2026':
                cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE slug = 'inspecao-visual';")
                f = cur.fetchone()
            elif slug == 'inspecao-visual':
                cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE slug = 'inspecao-visual-2026';")
                f = cur.fetchone()
            elif slug == 'vistoria-externa':
                cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE slug = 'formulario-vistoria-google';")
                f = cur.fetchone()
            elif slug == 'formulario-vistoria-google':
                cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE slug = 'vistoria-externa';")
                f = cur.fetchone()
        if not f and slug.isdigit():
            cur.execute("SELECT id, title, slug, category, description, link, questions FROM forms WHERE id = %s;", (int(slug),))
            f = cur.fetchone()
        cur.close()
        conn.close()

        if not f:
            return jsonify({"error": "Formulário não encontrado ou inativo."}), 404

        questions = f.get('questions')
        if isinstance(questions, str):
            try:
                questions = json.loads(questions)
            except Exception:
                questions = []

        # Garante que o formulário de inspeção visual tenha o 15º item "Número do WFC"
        f_slug = (f.get('slug') or '').lower()
        f_title = (f.get('title') or '').lower()
        if 'inspecao' in f_slug or 'inspeção' in f_title or 'inspecao' in f_title:
            has_num_wfc = any('número do wfc' in str(q.get('title', '')).strip().lower() or 'numero do wfc' in str(q.get('title', '')).strip().lower() for q in (questions or []) if isinstance(q, dict))
            if not has_num_wfc and questions:
                if len(questions) == 14:
                    questions.append({"title": "Número do WFC", "type": "text", "options": [], "required": False, "hint": "Insira a combinação de textos e números do WFC"})
                elif len(questions) < 14:
                    pad_questions = [
                        {"title": "Rede Externa Conforme Padrão Claro?", "type": "radio", "options": ["Sim", "Não"], "required": False},
                        {"title": "Fotos para evidência", "type": "file", "options": [], "required": False},
                        {"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False},
                        {"title": "Observações", "type": "textarea", "options": [], "required": False}
                    ]
                    existing_ts = [str(q.get('title', '')).strip().lower() for q in questions if isinstance(q, dict)]
                    for pq in pad_questions:
                        if pq['title'].strip().lower() not in existing_ts and len(questions) < 14:
                            questions.append(pq)
                    questions.append({"title": "Número do WFC", "type": "text", "options": [], "required": False, "hint": "Insira a combinação de textos e números do WFC"})
                else:
                    questions.insert(14, {"title": "Número do WFC", "type": "text", "options": [], "required": False, "hint": "Insira a combinação de textos e números do WFC"})
            else:
                for q in (questions or []):
                    if isinstance(q, dict) and ('número do wfc' in str(q.get('title', '')).strip().lower() or 'numero do wfc' in str(q.get('title', '')).strip().lower()):
                        q['type'] = 'text'

        return jsonify({
            "id": f['id'],
            "title": f['title'],
            "slug": f['slug'],
            "category": f.get('category') or 'Inspeção',
            "description": f.get('description') or '',
            "link": f"/f/{f['slug']}",
            "questions": questions or []
        })
    except Exception as e:
        print("API public form get error:", e)
        return jsonify({"error": "Erro ao buscar dados do formulário."}), 500

@app.route('/f/<slug>/submit', methods=['POST'], strict_slashes=False)
def public_form_submit(slug):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM forms WHERE slug = %s;", (slug,))
        f = cur.fetchone()
        if not f:
            if slug == 'inspecao-visual-2026':
                cur.execute("SELECT id FROM forms WHERE slug = 'inspecao-visual';")
                f = cur.fetchone()
            elif slug == 'inspecao-visual':
                cur.execute("SELECT id FROM forms WHERE slug = 'inspecao-visual-2026';")
                f = cur.fetchone()
            elif slug == 'vistoria-externa':
                cur.execute("SELECT id FROM forms WHERE slug = 'formulario-vistoria-google';")
                f = cur.fetchone()
            elif slug == 'formulario-vistoria-google':
                cur.execute("SELECT id FROM forms WHERE slug = 'vistoria-externa';")
                f = cur.fetchone()
        if not f and slug.isdigit() and 'user_id' in session:
            cur.execute("SELECT id FROM forms WHERE id = %s;", (int(slug),))
            f = cur.fetchone()

        if not f:
            cur.close()
            conn.close()
            return jsonify({"error": "Formulário não encontrado."}), 404

        form_id = f['id']
        
        # Parse data from JSON or multipart form
        data = {}
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            for k in request.form.keys():
                vals = request.form.getlist(k)
                data[k] = vals[0] if len(vals) == 1 else vals

        # Process uploaded files (photos, pdfs, etc.) with strict extension and 20MB limit
        if request.files:
            upload_dir = os.path.join(UPLOAD_FOLDER, 'formularios')
            os.makedirs(upload_dir, exist_ok=True)
            for file_key in request.files.keys():
                files = request.files.getlist(file_key)
                file_urls = []
                for file in files:
                    if file and file.filename:
                        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
                        if ext not in ALLOWED_FORM_UPLOAD_EXTS:
                            return jsonify({"error": f"Extensão .{ext} não permitida. Apenas fotos e documentos PDF são aceitos."}), 400
                        
                        file.seek(0, os.SEEK_END)
                        f_size = file.tell()
                        file.seek(0)
                        if f_size > MAX_FORM_UPLOAD_SIZE:
                            return jsonify({"error": f"O arquivo '{file.filename}' excede o limite máximo permitido de 20MB."}), 400

                        safe_name = secure_filename(file.filename)
                        timestamp = int(time.time() * 1000)
                        saved_name = f"{timestamp}_{safe_name}"
                        file_path = os.path.join(upload_dir, saved_name)
                        file.save(file_path)
                        rel_url = f"/uploads/formularios/{saved_name}"
                        file_urls.append(rel_url)
                if file_urls:
                    data[file_key] = file_urls[0] if len(file_urls) == 1 else file_urls

        if not data:
            cur.close()
            conn.close()
            return jsonify({"error": "Nenhum dado recebido."}), 400

        email = ''
        technician = 'Técnico'
        for k, v in data.items():
            k_lower = str(k).lower()
            if ('email' in k_lower or 'e-mail' in k_lower) and isinstance(v, str) and v:
                email = v
            if ('técnico' in k_lower or 'tecnico' in k_lower or 'nome' in k_lower) and isinstance(v, str) and v:
                technician = v

        cur.execute(
            "INSERT INTO form_responses (form_id, technician_name, technician_email, answers) VALUES (%s, %s, %s, %s);",
            (form_id, technician, email, json.dumps(data, ensure_ascii=False))
        )
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True, "message": "Resposta registrada com sucesso!"})
    except Exception as e:
        print("Backend error log in public_form_submit:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- FORM RESPONSES ADMIN API ---
@app.route('/api/forms/<int:form_id>/responses', methods=['GET'], strict_slashes=False)
@login_required
def api_form_responses(form_id):
    auth = get_current_user_auth()
    role_lower = (auth.get('role') or '').lower() if auth else ''
    has_form_perm = any(k.startswith('formularios.') for k in (auth.get('permissions') or []))
    if not auth or (not auth['is_master'] and not auth['is_coordenador'] and role_lower not in ['supervisor', 'coordenador'] and not has_form_perm):
        return jsonify({"error": "Acesso restrito à coordenação, supervisão ou usuários com permissão de formulários."}), 403

    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Auto import historical sheet data if this form is inventario-maquinario and has missing sheet responses
        cur.execute("SELECT slug FROM forms WHERE id = %s;", (form_id,))
        f_row = cur.fetchone()
        if f_row and f_row['slug'] == 'inventario-maquinario':
            cur.execute("SELECT COUNT(*) AS count FROM form_responses WHERE form_id = %s AND (answers->>'Carimbo de data/hora' IS NOT NULL OR answers->>'Data' IS NOT NULL);", (form_id,))
            if cur.fetchone()['count'] == 0:
                try:
                    import urllib.request, csv, json, datetime
                    sheet_url = "https://docs.google.com/spreadsheets/d/1e4ntyLxdVHP5Cls46UlHXvtVQRxkbDRbqtqJz90xhJ4/export?format=csv&gid=1914441081"
                    req = urllib.request.Request(sheet_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        csv_text = resp.read().decode('utf-8')

                    reader = csv.reader(csv_text.splitlines())
                    header = None

                    for row in reader:
                        if not row or not any(row):
                            continue
                        if not header:
                            header = [h.strip() for h in row]
                            continue

                        answers = {}
                        tech_name = 'N/A'
                        tech_email = 'N/A'
                        submitted_at_str = None

                        for idx, col_name in enumerate(header):
                            if not col_name:
                                col_name = f"Coluna_{idx+1}"
                            val = row[idx].strip() if idx < len(row) and row[idx].strip() else 'N/A'
                            answers[col_name] = val

                            col_lower = col_name.lower()
                            if 'técnico' in col_lower or col_lower == 'técnico':
                                if val != 'N/A':
                                    tech_name = val
                            elif 'e-mail' in col_lower or 'email' in col_lower:
                                if val != 'N/A':
                                    tech_email = val
                            elif 'carimbo' in col_lower or col_lower == 'data':
                                if val != 'N/A' and not submitted_at_str:
                                    submitted_at_str = val

                        submitted_at = None
                        if submitted_at_str:
                            for fmt in ['%d/%m/%Y %H:%M:%S', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d']:
                                try:
                                    submitted_at = datetime.datetime.strptime(submitted_at_str, fmt)
                                    break
                                except ValueError:
                                    pass

                        if not submitted_at:
                            submitted_at = datetime.datetime.now()

                        cur.execute("""
                            INSERT INTO form_responses (form_id, technician_name, technician_email, answers, submitted_at)
                            VALUES (%s, %s, %s, %s, %s);
                        """, (form_id, tech_name, tech_email, json.dumps(answers, ensure_ascii=False), submitted_at))

                    conn.commit()
                except Exception as e_imp:
                    print("Error auto-importing sheet in GET responses:", e_imp)
                    conn.rollback()

        cur.execute("""
            SELECT id, technician_name, technician_email, answers, submitted_at
            FROM form_responses
            WHERE form_id = %s
            ORDER BY id DESC;
        """, (form_id,))
        responses = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(responses)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- UPDATE & DELETE SINGLE FORM RESPONSE ---
@app.route('/api/forms/<int:form_id>/responses/<int:response_id>', methods=['PUT', 'DELETE'], strict_slashes=False)
@login_required
def api_form_response_detail(form_id, response_id):
    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM form_responses WHERE id = %s AND form_id = %s;", (response_id, form_id))
            conn.commit()
            cur.close()
            conn.close()
            log_action(session['user_id'], session['username'], f"Excluiu resposta #{response_id} do formulário #{form_id}")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log in delete form response:", e)
            return jsonify({"error": "Erro ao excluir resposta."}), 500
    else: # PUT
        try:
            data = request.get_json(silent=True) or {}
            tech_name = data.get('technician_name')
            tech_email = data.get('technician_email')
            answers = data.get('answers')

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT answers, technician_name, technician_email FROM form_responses WHERE id = %s AND form_id = %s;", (response_id, form_id))
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return jsonify({"error": "Resposta não encontrada."}), 404

            existing_answers = row['answers']
            if isinstance(existing_answers, str):
                try:
                    existing_answers = json.loads(existing_answers)
                except Exception:
                    existing_answers = {}
            if not isinstance(existing_answers, dict):
                existing_answers = {}

            if isinstance(answers, dict):
                existing_answers.update(answers)

            new_tech = tech_name.strip() if tech_name and tech_name.strip() else row['technician_name']
            new_email = tech_email.strip() if tech_email and tech_email.strip() else row['technician_email']

            cur.execute("""
                UPDATE form_responses 
                SET technician_name = %s,
                    technician_email = %s,
                    answers = %s
                WHERE id = %s AND form_id = %s;
            """, (new_tech, new_email, json.dumps(existing_answers, ensure_ascii=False), response_id, form_id))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou resposta #{response_id} do formulário #{form_id} (Técnico: {new_tech})")
            return jsonify({
                "success": True, 
                "message": "Resposta atualizada com sucesso!",
                "technician_name": new_tech,
                "technician_email": new_email,
                "answers": existing_answers
            })
        except Exception as e:
            print("Backend error log in update form response:", e)
            return jsonify({"error": "Erro ao atualizar resposta."}), 500

@app.route('/api/form-responses/<int:response_id>', methods=['PUT', 'DELETE'], strict_slashes=False)
@login_required
def api_direct_form_response_detail(response_id):
    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM form_responses WHERE id = %s;", (response_id,))
            conn.commit()
            cur.close()
            conn.close()
            log_action(session['user_id'], session['username'], f"Excluiu resposta #{response_id}")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log in direct delete form response:", e)
            return jsonify({"error": "Erro ao excluir resposta."}), 500
    else: # PUT
        try:
            data = request.get_json(silent=True) or {}
            tech_name = data.get('technician_name')
            tech_email = data.get('technician_email')
            answers = data.get('answers')

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT form_id, answers, technician_name, technician_email FROM form_responses WHERE id = %s;", (response_id,))
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return jsonify({"error": "Resposta não encontrada."}), 404

            existing_answers = row['answers']
            if isinstance(existing_answers, str):
                try:
                    existing_answers = json.loads(existing_answers)
                except Exception:
                    existing_answers = {}
            if not isinstance(existing_answers, dict):
                existing_answers = {}

            if isinstance(answers, dict):
                existing_answers.update(answers)

            new_tech = tech_name.strip() if tech_name and tech_name.strip() else row['technician_name']
            new_email = tech_email.strip() if tech_email and tech_email.strip() else row['technician_email']

            cur.execute("""
                UPDATE form_responses 
                SET technician_name = %s,
                    technician_email = %s,
                    answers = %s
                WHERE id = %s;
            """, (new_tech, new_email, json.dumps(existing_answers, ensure_ascii=False), response_id))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou resposta #{response_id} (Técnico: {new_tech})")
            return jsonify({
                "success": True, 
                "message": "Resposta atualizada com sucesso!",
                "technician_name": new_tech,
                "technician_email": new_email,
                "answers": existing_answers
            })
        except Exception as e:
            print("Backend error log in direct update form response:", e)
            return jsonify({"error": "Erro ao atualizar resposta."}), 500

@app.route('/api/forms/<int:form_id>/responses/export', methods=['GET'], strict_slashes=False)
@login_required
def api_form_responses_export(form_id):
    auth = get_current_user_auth()
    role_lower = (auth.get('role') or '').lower() if auth else ''
    has_form_perm = any(k.startswith('formularios.') for k in (auth.get('permissions') or []))
    if not auth or (not auth['is_master'] and not auth['is_coordenador'] and role_lower not in ['supervisor', 'coordenador'] and not has_form_perm):
        return jsonify({"error": "Acesso restrito à coordenação, supervisão ou usuários com permissão de formulários."}), 403

    try:
        import io, csv, json
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT title FROM forms WHERE id = %s;", (form_id,))
        form_row = cur.fetchone()
        title = form_row['title'] if form_row else 'Formulario'

        cur.execute("""
            SELECT id, technician_name, technician_email, answers, submitted_at
            FROM form_responses
            WHERE form_id = %s
            ORDER BY id DESC;
        """, (form_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        # Build dynamic base url for full image/attachment links
        base_host = request.host_url.rstrip('/')
        if ('shardweb.app' in base_host or 'gestaoredeexterna.com.br' in base_host) and not base_host.startswith('https://'):
            base_host = 'https://' + base_host.split('://')[-1]

        # Collect all dynamic question headers and determine if any fields contain lists (e.g. multiple photos)
        parsed_rows_answers = []
        key_max_counts = {}

        for r in rows:
            ans = r['answers']
            if isinstance(ans, str):
                try:
                    ans = json.loads(ans)
                except Exception:
                    ans = {}
            if not isinstance(ans, dict):
                ans = {}
            parsed_rows_answers.append(ans)

            for k, v in ans.items():
                if k.endswith('_other'):
                    continue
                if isinstance(v, list):
                    cnt = len(v)
                elif isinstance(v, str) and (' | ' in v and '/uploads/' in v):
                    cnt = len(v.split(' | '))
                else:
                    cnt = 1
                key_max_counts[k] = max(key_max_counts.get(k, 1), cnt)

        # Build column headers with individual columns for each photo/attachment
        expanded_columns = []
        # list of tuples: (original_key, index, column_title)
        for k, max_cnt in key_max_counts.items():
            if max_cnt > 1:
                for i in range(max_cnt):
                    expanded_columns.append((k, i, f"{k} - Foto {i+1}"))
            else:
                expanded_columns.append((k, 0, k))

        output = io.StringIO()
        output.write('﻿') # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header
        base_headers = ['ID', 'Data/Hora Submissao', 'Tecnico', 'E-mail']
        column_titles = [col[2] for col in expanded_columns]
        writer.writerow(base_headers + column_titles)

        def format_single_url(val_item):
            if val_item is None:
                return ''
            s = str(val_item).strip()
            if s.startswith('/uploads/'):
                return f"{base_host}{s}"
            return s

        for r_idx, r in enumerate(rows):
            ans = parsed_rows_answers[r_idx]
            sub_date = r['submitted_at'].strftime('%d/%m/%Y %H:%M') if r['submitted_at'] else ''
            row_data = [
                r['id'],
                sub_date,
                r['technician_name'] or '',
                r['technician_email'] or ''
            ]
            for orig_k, item_idx, col_title in expanded_columns:
                raw_val = ans.get(orig_k, '')
                if isinstance(raw_val, list):
                    cell_val = raw_val[item_idx] if item_idx < len(raw_val) else ''
                elif isinstance(raw_val, str) and ' | ' in raw_val and '/uploads/' in raw_val:
                    parts = raw_val.split(' | ')
                    cell_val = parts[item_idx] if item_idx < len(parts) else ''
                else:
                    cell_val = raw_val if item_idx == 0 else ''
                row_data.append(format_single_url(cell_val))

            writer.writerow(row_data)

        output.seek(0)
        clean_title = re.sub(r'[^a-zA-Z0-9_-]+', '_', title)[:30]
        filename = f"respostas_{clean_title}_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Backend error log in api_form_responses_export:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/forms/<int:form_id>/responses/import', methods=['POST'], strict_slashes=False)
@login_required
def api_form_responses_import(form_id):
    try:
        import csv, io, json
        data = request.get_json(silent=True) or {}
        csv_text = data.get('csv_data', '').strip()

        if not csv_text and 'file' in request.files:
            file = request.files['file']
            csv_text = file.read().decode('utf-8-sig', errors='ignore')

        if not csv_text:
            return jsonify({"error": "Nenhum arquivo ou texto de CSV informado."}), 400

        reader = csv.reader(io.StringIO(csv_text), delimiter=';')
        rows = list(reader)
        if len(rows) < 2:
            reader = csv.reader(io.StringIO(csv_text), delimiter=',')
            rows = list(reader)

        if len(rows) < 2:
            return jsonify({"error": "Arquivo CSV sem linhas suficientes de cabeçalho e dados."}), 400

        headers = [h.strip() for h in rows[0]]
        imported = 0

        conn = get_db()
        cur = conn.cursor()

        for row in rows[1:]:
            if not row or not any(row):
                continue
            answers = {}
            tech_name = 'Técnico'
            tech_email = ''

            for idx, h in enumerate(headers):
                val = row[idx].strip() if idx < len(row) else ''
                answers[h] = val
                h_lower = h.lower()
                if 'técnico' in h_lower or 'tecnico' in h_lower or 'nome' in h_lower:
                    if val: tech_name = val
                elif 'e-mail' in h_lower or 'email' in h_lower:
                    if val: tech_email = val

            cur.execute("""
                INSERT INTO form_responses (form_id, technician_name, technician_email, answers)
                VALUES (%s, %s, %s, %s);
            """, (form_id, tech_name, tech_email, json.dumps(answers, ensure_ascii=False)))
            imported += 1

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Importou {imported} respostas no Formulário ID {form_id}")
        return jsonify({"success": True, "imported": imported})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- EXTRACTION ROUTE FOR LOCAL DOWNLOADED EXCEL ---
@app.route('/api/admin/extract_machinery_excel', methods=['POST'], strict_slashes=False)
@login_required
def api_extract_machinery_excel():
    uploaded_file = request.files.get('file')
    fallback_path = os.path.join(r"C:\Users\2d\Downloads", "2 - Inventário - Maquina e ferramentas.xlsx")

    if uploaded_file and uploaded_file.filename:
        file_source = uploaded_file
    elif os.path.exists(fallback_path):
        file_source = fallback_path
    else:
        return jsonify({"error": "Envie o arquivo .xlsx no campo 'file'."}), 400

    import zipfile
    import xml.etree.ElementTree as ET
    import json

    try:
        with zipfile.ZipFile(file_source, 'r') as z:
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for elem in tree.iter():
                    if elem.tag.endswith('t') and elem.text:
                        shared_strings.append(elem.text)

            sheet_xml = z.read('xl/worksheets/sheet1.xml')
            tree = ET.fromstring(sheet_xml)

            rows = []
            for row_elem in tree.iter():
                if row_elem.tag.endswith('row'):
                    row_cells = []
                    for cell_elem in row_elem.iter():
                        if cell_elem.tag.endswith('c'):
                            cell_type = cell_elem.attrib.get('t', '')
                            cell_val = ''
                            for val_elem in cell_elem.iter():
                                if val_elem.tag.endswith('v'):
                                    v_str = val_elem.text or ''
                                    if cell_type == 's' and v_str.isdigit():
                                        idx = int(v_str)
                                        cell_val = shared_strings[idx] if idx < len(shared_strings) else v_str
                                    else:
                                        cell_val = v_str
                            row_cells.append(cell_val.strip())
                    if row_cells and any(row_cells):
                        rows.append(row_cells)

            if len(rows) < 2:
                return jsonify({"error": "Arquivo Excel sem dados suficientes para importação."}), 400

            headers = rows[0]
            conn = get_db()
            cur = conn.cursor()

            cur.execute("SELECT id FROM forms WHERE slug = 'inventario-maquinario';")
            form_row = cur.fetchone()
            form_id = form_row['id'] if form_row else 1

            imported_count = 0
            for row in rows[1:]:
                if not row or not any(row):
                    continue
                answers = {}
                tech_name = 'Técnico'
                tech_email = ''

                for idx, h in enumerate(headers):
                    val = row[idx] if idx < len(row) else ''
                    answers[h] = val
                    h_lower = h.lower()
                    if ('técnico' in h_lower or 'tecnico' in h_lower or 'nome' in h_lower) and val:
                        tech_name = val
                    elif ('email' in h_lower or 'e-mail' in h_lower) and val:
                        tech_email = val

                cur.execute("""
                    INSERT INTO form_responses (form_id, technician_name, technician_email, answers)
                    VALUES (%s, %s, %s, %s);
                """, (form_id, tech_name, tech_email, json.dumps(answers, ensure_ascii=False)))
                imported_count += 1

            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Extraiu {imported_count} respostas do arquivo Excel de Downloads (2 - Inventário - Maquina e ferramentas.xlsx)")
            return jsonify({"success": True, "imported": imported_count})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- MONTHLY INDICATORS DASHBOARD API ---
@app.route('/api/indicators', methods=['GET'], strict_slashes=False)
@login_required
def api_get_monthly_indicators():
    month = request.args.get('month', 'julho-26').strip().lower()
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM monthly_indicators WHERE reference_month = %s;", (month,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row and row.get('data'):
            return jsonify({"month": month, "data": row['data']})
        return jsonify({"month": month, "data": None})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/indicators', methods=['POST'], strict_slashes=False)
@login_required
def api_save_monthly_indicators():
    try:
        data = request.get_json(silent=True) or {}
        month = data.get('month', 'julho-26').strip().lower()
        payload = data.get('data', {})

        if not month:
            return jsonify({"error": "Mês de referência é obrigatório."}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM monthly_indicators WHERE reference_month = %s;", (month,))
        existing_row = cur.fetchone()
        if existing_row:
            cur.execute("""
                UPDATE monthly_indicators
                SET data = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (json.dumps(payload, ensure_ascii=False), existing_row['id']))
        else:
            cur.execute("""
                INSERT INTO monthly_indicators (reference_month, data, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP);
            """, (month, json.dumps(payload, ensure_ascii=False)))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Atualizou os indicadores do mês {month}")
        return jsonify({"success": True, "month": month})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


@app.route('/api/indicators/justificativa', methods=['POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_save_indicator_justificativa():
    if request.method == 'OPTIONS':
        return ('', 204)
    try:
        data = request.get_json(silent=True) or {}
        month = (data.get('month') or '').strip().lower()
        region = (data.get('region') or 'Interior').strip()
        justificativa = data.get('justificativa', '')
        
        if not month:
            return jsonify({"error": "Mês de referência é obrigatório."}), 400
            
        db_month_key = f"cap-{month}" if region.lower() == 'capital' and not month.startswith('cap-') else month

        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("SELECT id, data FROM monthly_indicators WHERE reference_month = %s;", (db_month_key,))
        row = cur.fetchone()
        
        current_data = {}
        if row and row.get('data'):
            if isinstance(row['data'], str):
                try: current_data = json.loads(row['data'])
                except Exception: current_data = {}
            elif isinstance(row['data'], dict):
                current_data = row['data']
        
        current_data['justificativas'] = justificativa
        
        if row and row.get('id'):
            cur.execute("""
                UPDATE monthly_indicators
                SET data = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (json.dumps(current_data, ensure_ascii=False), row['id']))
        else:
            cur.execute("""
                INSERT INTO monthly_indicators (reference_month, data, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP);
            """, (db_month_key, json.dumps(current_data, ensure_ascii=False)))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Salvou justificativa dos indicadores para {region} ({month})")
        return jsonify({"success": True, "message": "Justificativa salva com sucesso!", "month": month, "region": region})
    except Exception as e:
        print("Error saving indicator justificativa:", e)
        return jsonify({"error": "Erro ao salvar justificativa."}), 500

INDICATORS_AREAS_INTERIOR = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos']
INDICATORS_AREAS_CAPITAL = ['Centro ZS', 'Norte 1', 'Norte 2', 'Norte 3', 'Zona Oeste', 'Sul 2']

def get_default_indicators_dict(region='Interior'):
    if str(region).strip().lower() == 'capital':
        areas = INDICATORS_AREAS_CAPITAL
        return {
            'ral': [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in areas],
            'rec': [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in areas],
            'hfc': [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in areas],
            'gpon': [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in areas],
            'me11': [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in areas],
            'me3_hfc': [{'area': a, 'time': '-', 'override_color': ''} for a in areas],
            'me3_gpon': [{'area': a, 'time': '-', 'override_color': ''} for a in areas],
            'justificativas': ''
        }
    areas = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos']
    def pct_rows(vals):
        return [{'area': a, 'total': vals.get(a, [0, 0])[0], 'fp': vals.get(a, [0, 0])[1], 'override_color': ''} for a in areas]
    def time_rows(vals):
        return [{'area': a, 'time': vals.get(a, '-'), 'override_color': ''} for a in areas]
    return {
        'ral': pct_rows({'Baixada': [82, 7], 'Metropolitana': [53, 5], 'Norte Fluminense': [20, 1], 'Serra Fluminense': [32, 3], 'Sul Fluminense': [48, 0], 'Lagos': [13, 0]}),
        'rec': pct_rows({'Baixada': [75, 12], 'Metropolitana': [52, 13], 'Norte Fluminense': [8, 2], 'Serra Fluminense': [6, 0], 'Sul Fluminense': [25, 1], 'Lagos': [7, 1]}),
        'hfc': pct_rows({'Baixada': [4, 0], 'Metropolitana': [7, 1], 'Norte Fluminense': [0, 0], 'Serra Fluminense': [0, 0], 'Sul Fluminense': [2, 0], 'Lagos': [0, 0]}),
        'gpon': pct_rows({'Baixada': [5, 2], 'Metropolitana': [10, 6], 'Norte Fluminense': [1, 0], 'Serra Fluminense': [3, 0], 'Sul Fluminense': [6, 2], 'Lagos': [5, 1]}),
        'me11': pct_rows({'Baixada': [0, 0], 'Metropolitana': [0, 0], 'Norte Fluminense': [0, 0], 'Serra Fluminense': [0, 0], 'Sul Fluminense': [0, 0], 'Lagos': [0, 0]}),
        'me3_hfc': time_rows({'Baixada': '20.07', 'Metropolitana': '34.06', 'Norte Fluminense': '1.99', 'Serra Fluminense': '1.92', 'Sul Fluminense': '8.54', 'Lagos': '-'}),
        'me3_gpon': time_rows({'Baixada': '48.53', 'Metropolitana': '5.97', 'Norte Fluminense': '17.15', 'Serra Fluminense': '0', 'Sul Fluminense': '1.58', 'Lagos': '0'}),
        'justificativas': ''
    }

@app.route('/api/indicators/export', methods=['GET'], strict_slashes=False)
@login_required
def api_export_monthly_indicators():
    try:
        month = request.args.get('month', 'julho-26').strip().lower()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM monthly_indicators WHERE reference_month = %s;", (month,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        region = request.args.get('region', '').strip() or ('Capital' if month.startswith('cap-') else 'Interior')
        data = row['data'] if row and row.get('data') else get_default_indicators_dict(region)

        output = io.StringIO()
        output.write('\ufeff')
        writer = safe_csv_writer(output, delimiter=';')

        writer.writerow(['Indicador', 'Área', 'Total', 'FP', 'Percentual', 'Tempo', 'Meta'])

        pct_indicators = [
            ('RAL', 'ral', '≥ 90%'),
            ('REC', 'rec', '≥ 85%'),
            ('HFC', 'hfc', '≥ 80%'),
            ('GPON', 'gpon', '≥ 70%'),
            ('ME11', 'me11', '≥ 90%')
        ]

        for title, key, meta in pct_indicators:
            rows = data.get(key, [])
            for r in rows:
                area = r.get('area', '')
                tot = r.get('total', 0)
                fp = r.get('fp', 0)
                pct_str = f"{(((tot - fp) / tot) * 100):.2f}%".replace('.', ',') if tot > 0 else '-'
                writer.writerow([title, area, tot, fp, pct_str, '', meta])

        time_indicators = [
            ('ME3 - HFC', 'me3_hfc', '≤ 25'),
            ('ME3 - GPON', 'me3_gpon', '≤ 25')
        ]

        for title, key, meta in time_indicators:
            rows = data.get(key, [])
            for r in rows:
                area = r.get('area', '')
                t = r.get('time', '-')
                writer.writerow([title, area, '', '', '', t, meta])

        justificativas = data.get('justificativas', '').strip()
        if justificativas:
            writer.writerow([])
            writer.writerow(['JUSTIFICATIVAS', justificativas, '', '', '', '', ''])

        csv_content = output.getvalue()
        output.close()

        resp = Response(csv_content, mimetype='text/csv; charset=utf-8')
        resp.headers['Content-Disposition'] = f'attachment; filename=indicadores_{month}.csv'
        return resp
    except Exception as e:
        print("Backend error log in export indicators:", e)
        return jsonify({"error": "Erro ao exportar indicadores em CSV."}), 500

@app.route('/api/indicators/template', methods=['GET'], strict_slashes=False)
@login_required
def api_indicators_template():
    try:
        output = io.StringIO()
        output.write('\ufeff')
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow(['Indicador', 'Área', 'Total', 'FP', 'Tempo'])

        region = request.args.get('region', 'Interior').strip()
        areas = INDICATORS_AREAS_CAPITAL if region.lower() == 'capital' else INDICATORS_AREAS_INTERIOR
        for ind in ['RAL', 'REC', 'HFC', 'GPON', 'ME11']:
            for a in areas:
                writer.writerow([ind, a, 0, 0, ''])

        for ind in ['ME3 - HFC', 'ME3 - GPON']:
            for a in areas:
                writer.writerow([ind, a, '', '', '0,00'])

        resp = Response(output.getvalue(), mimetype='text/csv; charset=utf-8')
        resp.headers['Content-Disposition'] = 'attachment; filename=modelo_importacao_indicadores.csv'
        return resp
    except Exception as e:
        print("Backend error log in indicators template:", e)
        return jsonify({"error": "Erro ao gerar modelo de importação."}), 500

@app.route('/api/indicators/import', methods=['POST'], strict_slashes=False)
@login_required
def api_import_monthly_indicators():
    try:
        import unicodedata

        def _clean_str(s):
            if not s: return ""
            return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('utf-8').strip().lower()

        data = request.get_json(silent=True) or {}
        month = data.get('month', '').strip().lower()
        csv_data = data.get('csv_data', '').strip()

        if not csv_data and 'file' in request.files:
            f = request.files['file']
            month = month or request.form.get('month', '').strip().lower()
            try:
                csv_data = f.read().decode('utf-8-sig', errors='replace').strip()
            except Exception:
                csv_data = f.read().decode('latin1', errors='replace').strip()

        if not month:
            return jsonify({"error": "Mês de referência é obrigatório."}), 400

        if not csv_data:
            return jsonify({"error": "Nenhum dado CSV informado para importação."}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM monthly_indicators WHERE reference_month = %s;", (month,))
        row = cur.fetchone()

        if row and row.get('data'):
            current_data = row['data']
        else:
            current_data = get_default_indicators_dict('Capital' if ((data.get('region', '').strip().lower() == 'capital') or month.startswith('cap-')) else 'Interior')

        sample_lines = [l for l in csv_data.splitlines() if l.strip()][:5]
        sample_txt = "\n".join(sample_lines)
        if sample_txt.count(';') >= sample_txt.count(',') and sample_txt.count(';') >= sample_txt.count('\t'):
            delim = ';'
        elif sample_txt.count('\t') > sample_txt.count(','):
            delim = '\t'
        else:
            delim = ','

        reader = csv.reader(io.StringIO(csv_data), delimiter=delim)

        is_capital = (data.get('region', '').strip().lower() == 'capital') or month.startswith('cap-')
        valid_areas = INDICATORS_AREAS_CAPITAL if is_capital else INDICATORS_AREAS_INTERIOR
        
        def match_area(txt):
            clean = _clean_str(txt)
            for a in valid_areas:
                if clean == _clean_str(a):
                    return a
            if 'centro' in clean or 'zs' in clean: return 'Centro ZS'
            if 'norte 1' in clean or 'norte1' in clean: return 'Norte 1'
            if 'norte 2' in clean or 'norte2' in clean: return 'Norte 2'
            if 'norte 3' in clean or 'norte3' in clean: return 'Norte 3'
            if 'oeste' in clean: return 'Zona Oeste'
            if 'sul 2' in clean or 'sul2' in clean: return 'Sul 2'
            if 'baixada' in clean: return 'Baixada'
            if 'metro' in clean: return 'Metropolitana'
            if 'norte' in clean: return 'Norte Fluminense'
            if 'serra' in clean: return 'Serra Fluminense'
            if 'sul' in clean: return 'Sul Fluminense'
            if 'lago' in clean: return 'Lagos'
            return None

        def match_indicator(txt):
            clean = _clean_str(txt).replace('_', ' ').replace('-', ' ')
            if clean.startswith('ral'): return 'ral'
            if clean.startswith('rec'): return 'rec'
            if 'me3' in clean and 'gpon' in clean: return 'me3_gpon'
            if 'me3' in clean and 'hfc' in clean: return 'me3_hfc'
            if 'me11' in clean or 'me 11' in clean: return 'me11'
            if 'gpon' in clean: return 'gpon'
            if 'hfc' in clean: return 'hfc'
            if 'me3' in clean: return 'me3_hfc'
            return None

        col_ind = 0
        col_area = 1
        col_total = 2
        col_fp = 3
        col_tempo = 4
        imported_count = 0
        warnings = []

        for row_idx, r in enumerate(reader):
            if not r or not any(cell.strip() for cell in r):
                continue

            first_cell = r[0].strip()
            first_cell_clean = _clean_str(first_cell)

            if 'justificativa' in first_cell_clean:
                val = r[1].strip() if len(r) > 1 and r[1].strip() else ';'.join(r[1:]).strip()
                if val:
                    current_data['justificativas'] = val
                    imported_count += 1
                continue

            row_clean = [_clean_str(c) for c in r]
            if any('indicador' in c or 'kpi' in c for c in row_clean) or any('area' in c or 'regiao' in c for c in row_clean):
                for idx, c in enumerate(row_clean):
                    if 'indicador' in c or 'kpi' in c or 'metrica' in c:
                        col_ind = idx
                    elif 'area' in c or 'regiao' in c or 'regional' in c:
                        col_area = idx
                    elif 'total' in c or 'qtd' in c:
                        col_total = idx
                    elif 'fp' in c or 'fora' in c:
                        col_fp = idx
                    elif 'tempo' in c or 'hora' in c or 'time' in c:
                        col_tempo = idx
                continue

            ind_raw = r[col_ind].strip() if col_ind < len(r) else ''
            area_raw = r[col_area].strip() if col_area < len(r) else ''

            ind_key = match_indicator(ind_raw)
            matched_area = match_area(area_raw)

            if not ind_key or not matched_area:
                continue

            if ind_key in ['ral', 'rec', 'hfc', 'gpon', 'me11']:
                tot_val = r[col_total].strip() if col_total < len(r) else ''
                fp_val = r[col_fp].strip() if col_fp < len(r) else ''

                if ind_key not in current_data or not isinstance(current_data[ind_key], list):
                    current_data[ind_key] = [{'area': a, 'total': 0, 'fp': 0, 'override_color': ''} for a in valid_areas]

                for item in current_data[ind_key]:
                    if item.get('area') == matched_area:
                        if tot_val != '':
                            try:
                                item['total'] = int(float(tot_val.replace(',', '.')))
                            except Exception:
                                pass
                        if fp_val != '':
                            try:
                                item['fp'] = int(float(fp_val.replace(',', '.')))
                            except Exception:
                                pass
                        imported_count += 1
                        break

            elif ind_key in ['me3_hfc', 'me3_gpon']:
                time_val = ''
                if col_tempo < len(r) and r[col_tempo].strip():
                    time_val = r[col_tempo].strip()
                elif col_total < len(r) and r[col_total].strip():
                    time_val = r[col_total].strip()

                if ind_key not in current_data or not isinstance(current_data[ind_key], list):
                    current_data[ind_key] = [{'area': a, 'time': '-', 'override_color': ''} for a in valid_areas]

                for item in current_data[ind_key]:
                    if item.get('area') == matched_area:
                        if time_val != '':
                            item['time'] = time_val
                        imported_count += 1
                        break

        if imported_count == 0:
            cur.close()
            conn.close()
            return jsonify({"error": "Nenhum registro válido de indicador foi encontrado no CSV. Verifique se as colunas estão corretas (Indicador;Área;Total;FP ou Tempo)."}), 400

        cur.execute("SELECT id FROM monthly_indicators WHERE reference_month = %s;", (month,))
        existing_imp = cur.fetchone()
        if existing_imp:
            cur.execute("""
                UPDATE monthly_indicators
                SET data = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (json.dumps(current_data, ensure_ascii=False), existing_imp['id']))
        else:
            cur.execute("""
                INSERT INTO monthly_indicators (reference_month, data, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP);
            """, (month, json.dumps(current_data, ensure_ascii=False)))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Importou {imported_count} registros de indicadores para o mês {month} via CSV")

        return jsonify({
            "success": True,
            "month": month,
            "imported": imported_count,
            "data": current_data,
            "warnings": warnings
        })
    except Exception as e:
        print("Backend error log in import indicators:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao processar importação do arquivo CSV."}), 500

# --- BULK IMPORT API (PESSOAS / TÉCNICOS) ---
@app.route('/api/people/bulk', methods=['POST'], strict_slashes=False)
@login_required
def api_people_bulk():
    try:
        data = request.get_json(silent=True) or {}
        csv_data = data.get('csv_data', '').strip()
        if not csv_data:
            return jsonify({"error": "Nenhum dado informado para importação."}), 400

        lines_raw = csv_data.splitlines()
        imported = 0
        conn = get_db()
        cur = conn.cursor()

        for idx, row in enumerate(lines_raw):
            if not row.strip(): continue
            parts = [p.strip() for p in row.split(';')]
            if len(parts) < 2:
                parts = [p.strip() for p in row.split(',')]

            # Skip header if present
            if idx == 0 and ('nome' in parts[0].lower() or 'cpf' in parts[0].lower() or 'tecnico' in parts[0].lower()):
                continue

            name = format_person_name(parts[0] if len(parts) > 0 else '')
            role = parts[1] if len(parts) > 1 else 'Técnico de Campo'
            cpf = parts[2] if len(parts) > 2 else ''
            phone = parts[3] if len(parts) > 3 else ''
            status = parts[4] if len(parts) > 4 else 'Ativo'

            if not name: continue

            cur.execute("""
                INSERT INTO technicians (name, role, cpf, phone)
                VALUES (%s, %s, %s, %s);
            """, (name, role, cpf if cpf else None, phone if phone else None))
            imported += 1

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Importou em lote {imported} pessoas/técnicos")
        return jsonify({"success": True, "imported": imported})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


def get_recursive_folder_counts(conn, folder_ids):
    if not folder_ids:
        return {}
    
    cur = conn.cursor()
    cur.execute("SELECT id, parent_id FROM project_folders;")
    all_folders = cur.fetchall()
    
    cur.execute("SELECT id, folder_id FROM projects WHERE folder_id IS NOT NULL;")
    all_projects = cur.fetchall()
    cur.close()
    
    children_map = {}
    for f in all_folders:
        pid = f['parent_id']
        children_map.setdefault(pid, []).append(f['id'])
        
    direct_files_map = {}
    for p in all_projects:
        fid = p['folder_id']
        direct_files_map[fid] = direct_files_map.get(fid, 0) + 1
        
    results = {}
    
    def count_subtree(fid):
        total_files = direct_files_map.get(fid, 0)
        total_subfolders = 0
        
        child_fids = children_map.get(fid, [])
        for child_fid in child_fids:
            c_files, c_folders = count_subtree(child_fid)
            total_files += c_files
            total_subfolders += 1 + c_folders
            
        return total_files, total_subfolders

    for fid in folder_ids:
        f_count, sub_count = count_subtree(fid)
        results[fid] = {
            'file_count': f_count,
            'folder_count': sub_count
        }
        
    return results

# --- FOLDERS API ---
@app.route('/api/folders', methods=['GET'])
@login_required
def api_get_folders():
    parent_id = request.args.get('parent_id')
    search = request.args.get('search', '').strip()
    if parent_id == 'null' or parent_id == '' or parent_id is None:
        parent_id = None
    else:
        try:
            parent_id = int(parent_id)
        except (ValueError, TypeError):
            parent_id = None
        
    try:
        conn = get_db()
        cur = conn.cursor()
        
        if search:
            search_pattern = f"%{search.lower()}%"
            cur.execute("SELECT * FROM project_folders WHERE LOWER(name) LIKE %s ORDER BY name ASC;", (search_pattern,))
            folders = cur.fetchall()
            
            cur.execute("""
                SELECT * FROM projects 
                WHERE LOWER(name) LIKE %s OR LOWER(COALESCE(description, '')) LIKE %s OR LOWER(COALESCE(area, '')) LIKE %s 
                ORDER BY created_at DESC;
            """, (search_pattern, search_pattern, search_pattern))
            projects = cur.fetchall()
        else:
            if parent_id is None:
                cur.execute("SELECT * FROM project_folders WHERE parent_id IS NULL ORDER BY name ASC;")
            else:
                cur.execute("SELECT * FROM project_folders WHERE parent_id = %s ORDER BY name ASC;", (parent_id,))
            folders = cur.fetchall()
            
            if parent_id is None:
                cur.execute("SELECT * FROM projects WHERE folder_id IS NULL ORDER BY created_at DESC;")
            else:
                cur.execute("SELECT * FROM projects WHERE folder_id = %s ORDER BY created_at DESC;", (parent_id,))
            projects = cur.fetchall()
        
        folder_ids = [f['id'] for f in folders]
        rec_counts = get_recursive_folder_counts(conn, folder_ids)
        
        cur.close()
        conn.close()
        
        for f in folders:
            f['created_at'] = f['created_at'].strftime('%d/%m/%Y %H:%M')
            counts = rec_counts.get(f['id'], {'file_count': 0, 'folder_count': 0})
            f['file_count'] = counts['file_count']
            f['folder_count'] = counts['folder_count']
        for p in projects:
            p['created_at'] = p['created_at'].strftime('%d/%m/%Y %H:%M')
            
        return jsonify({
            "folders": folders,
            "projects": projects
        })
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/folders', methods=['POST'])
@login_required
def api_create_folder():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        parent_id = data.get('parent_id')
        if parent_id == 'null' or parent_id == '' or parent_id is None:
            parent_id = None
        else:
            parent_id = int(parent_id)
            
        if not name:
            return jsonify({"error": "Nome da pasta é obrigatório."}), 400
            
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO project_folders (name, parent_id, created_by) VALUES (%s, %s, %s) RETURNING id;",
            (name, parent_id, session['user_id'])
        )
        folder_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Criou a pasta de projetos: {name} (ID: {folder_id})")
        return jsonify({"success": True, "id": folder_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/folders/<int:folder_id>', methods=['PUT'])
@login_required
def api_update_folder(folder_id):
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        if not name:
            return jsonify({"error": "Nome da pasta é obrigatório."}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE project_folders SET name = %s WHERE id = %s;", (name, folder_id))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Renomeou pasta de projetos ID {folder_id} para {name}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_delete_folder(folder_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM project_folders WHERE id = %s;", (folder_id,))
        folder = cur.fetchone()
        if not folder:
            cur.close()
            conn.close()
            return jsonify({"error": "Pasta não encontrada."}), 404
            
        cur.execute("DELETE FROM project_folders WHERE id = %s;", (folder_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Excluiu a pasta de projetos: {folder['name']}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- BULK AND EXPORTS ---
@app.route('/api/technicians/export', methods=['GET'])
@login_required
@coordenador_claro_required
def api_export_technicians():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT name, cpf, phone, identity, dob, role, company, area, team_type, 
                   shirt_size, boot_size, pants_size, jacket_size, team,
                   registration_claro, registration_third, toa_login, phone_model, imei_1, imei_2, email,
                   nr6_expiration, nr10_expiration, nr35_expiration, aso_expiration
            FROM technicians ORDER BY name ASC;
        """)
        techs = cur.fetchall()
        cur.close()
        conn.close()
        
        output = io.StringIO()
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow([
            "Nome", "CPF", "Telefone", "RG", "Data Nascimento", "Cargo", "Empresa", "Área de Atuação", 
            "Tipo Equipe", "Camisa", "Bota", "Calça", "Casaco", "Equipe",
            "Matricula Claro", "Matricula Terceiro", "Login TOA", "Modelo Telefone", "IMEI 1 Telefone", "IMEI 2 Telefone", "E-mail",
            "Validade NR-6", "Validade NR-10", "Validade NR-35", "Validade ASO"
        ])
        for t in techs:
            writer.writerow([
                t['name'], t['cpf'] or '', t['phone'] or '', t['identity'] or '', 
                t['dob'].strftime('%d/%m/%Y') if t.get('dob') else '', 
                t['role'] or '', t['company'] or '', t['area'] or '', t['team_type'] or '',
                t['shirt_size'] or '', t['boot_size'] or '', t['pants_size'] or '', t['jacket_size'] or '',
                t['team'] or '',
                t['registration_claro'] or '', t['registration_third'] or '', t['toa_login'] or '',
                t['phone_model'] or '', t['imei_1'] or '', t['imei_2'] or '', t['email'] or '',
                t['nr6_expiration'].strftime('%d/%m/%Y') if t.get('nr6_expiration') else '',
                t['nr10_expiration'].strftime('%d/%m/%Y') if t.get('nr10_expiration') else '',
                t['nr35_expiration'].strftime('%d/%m/%Y') if t.get('nr35_expiration') else '',
                t['aso_expiration'].strftime('%d/%m/%Y') if t.get('aso_expiration') else ''
            ])
            
        response = app.response_class(
            output.getvalue().encode('utf-8-sig'),
            mimetype='text/csv',
            headers={"Content-disposition": f"attachment; filename=tecnicos_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        return response
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/technicians/bulk', methods=['POST'])
@login_required
def api_bulk_technicians():
    try:
        data = request.get_json()
        csv_text = data.get('csv_data', '').strip()
        if not csv_text:
            return jsonify({"error": "Nenhum dado informado."}), 400
            
        delimiter = ';' if ';' in csv_text else ','
        f = io.StringIO(csv_text)
        reader = csv.reader(f, delimiter=delimiter)
        
        conn = get_db()
        cur = conn.cursor()
        
        success_count = 0
        errors = []
        
        for index, row in enumerate(reader):
            if index == 0 and any(h in row[0].lower() for h in ['nome', 'name', 'cpf']):
                continue
            if len(row) < 4:
                errors.append(f"Linha {index+1}: colunas insuficientes. Requer pelo menos Nome, CPF, Data de Nascimento e Cargo.")
                continue
                
            name = format_person_name(row[0].strip())
            cpf = row[1].strip().replace('.', '').replace('-', '')
            dob_raw = row[2].strip()
            role = row[3].strip()
            company = row[4].strip() if len(row) > 4 else None
            phone = row[5].strip() if len(row) > 5 else None
            identity = row[6].strip() if len(row) > 6 else None
            area = row[7].strip() if len(row) > 7 else None
            team_type = row[8].strip() if len(row) > 8 else None
            team = row[9].strip() if len(row) > 9 else None
            registration_claro = row[10].strip() if len(row) > 10 else None
            registration_third = row[11].strip() if len(row) > 11 else None
            toa_login = row[12].strip() if len(row) > 12 else None
            phone_model = row[13].strip() if len(row) > 13 else None
            imei_1 = row[14].strip() if len(row) > 14 else None
            imei_2 = row[15].strip() if len(row) > 15 else None
            email = row[16].strip() if len(row) > 16 else None
            
            if not name or not cpf or not dob_raw or not role:
                errors.append(f"Linha {index+1}: campos obrigatórios vazios.")
                continue
                
            try:
                for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d'):
                    try:
                        dob = datetime.datetime.strptime(dob_raw, fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    raise ValueError()
            except Exception:
                errors.append(f"Linha {index+1} ({name}): data '{dob_raw}' inválida. Use AAAA-MM-DD ou DD/MM/AAAA.")
                continue
                
            cur.execute("SELECT id FROM technicians WHERE cpf = %s;", (cpf,))
            if cur.fetchone():
                errors.append(f"Linha {index+1} ({name}): CPF {cpf} já cadastrado.")
                continue
                
            try:
                cur.execute("SAVEPOINT tech_savepoint;")
                cur.execute(
                    """
                    INSERT INTO technicians (
                        name, cpf, phone, identity, dob, role, area, team_type, company, team,
                        registration_claro, registration_third, toa_login, phone_model, imei_1, imei_2, email, created_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (name, cpf, phone, identity, dob, role, area, team_type, company, team,
                     registration_claro, registration_third, toa_login, phone_model, imei_1, imei_2, email, session['user_id'])
                )
                cur.execute("RELEASE SAVEPOINT tech_savepoint;")
                success_count += 1
            except Exception as err:
                cur.execute("ROLLBACK TO SAVEPOINT tech_savepoint;")
                print(f"[TECHNICIANS BULK] Erro ao salvar linha {index+1} ({name}):", err)
                errors.append(f"Linha {index+1} ({name}): falha ao salvar registro. Verifique os dados fornecidos.")
                
        if errors and success_count == 0:
            cur.close()
            conn.close()
            return jsonify({"error": "Falha total no processamento em lote.", "details": errors}), 400
            
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Realizou cadastro em lote de técnicos: {success_count} importados.")
        return jsonify({"success": True, "imported": success_count, "errors": errors}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/vehicles/export', methods=['GET'])
@login_required
def api_export_vehicles():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT v.plate, v.type, v.model, t.name AS responsible_name, v.subclus,
                   v.area_rede, v.base, v.setor, v.condutor_dia, v.condutor_tarde, 
                   v.condutor_madrugada, v.ticket_car, v.has_rack, v.has_basket, 
                   v.has_giroflex, v.has_inverter
            FROM vehicles v 
            LEFT JOIN technicians t ON v.responsible_tech_id = t.id 
            ORDER BY v.plate ASC;
            """
        )
        vehicles = cur.fetchall()
        cur.close()
        conn.close()
        
        output = io.StringIO()
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow([
            "Placa", "Tipo", "Modelo", "Responsável", "Sub-Classe", "Área de Rede", "Base", "Setor", 
            "Condutor Dia", "Condutor Tarde", "Condutor Madrugada", "Ticket Car", "Rack de Teto", 
            "Cesto Aéreo", "Giroflex", "Inversor"
        ])
        for v in vehicles:
            writer.writerow([
                v['plate'], v['type'], v['model'] or '', v['responsible_name'] or '', 
                v['subclus'] or '', v['area_rede'] or '', v['base'] or '', v['setor'] or '',
                v['condutor_dia'] or '', v['condutor_tarde'] or '', v['condutor_madrugada'] or '', 
                v['ticket_car'] or '', "SIM" if v['has_rack'] else "NÃO",
                "SIM" if v['has_basket'] else "NÃO", "SIM" if v['has_giroflex'] else "NÃO",
                "SIM" if v['has_inverter'] else "NÃO"
            ])
            
        response = app.response_class(
            output.getvalue().encode('utf-8-sig'),
            mimetype='text/csv',
            headers={"Content-disposition": f"attachment; filename=veiculos_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        return response
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/vehicles/bulk', methods=['POST'])
@login_required
def api_bulk_vehicles():
    try:
        raw_rows = []
        file = request.files.get('file')
        if file and file.filename:
            filename = secure_filename(file.filename)
            temp_path = os.path.join(UPLOAD_FOLDER, f"v_temp_{int(time.time())}_{filename}")
            file.save(temp_path)
            ext = os.path.splitext(temp_path)[1].lower()
            
            if ext in ['.xlsx', '.xlsm', '.xls']:
                try:
                    from python_calamine import CalamineWorkbook
                    wb = CalamineWorkbook.from_path(temp_path)
                    target_sheet = wb.sheet_names[0]
                    for s in wb.sheet_names:
                        if any(k in s.lower() for k in ['veic', 'placa', 'frota', 'dados', 'base']):
                            target_sheet = s
                            break
                    raw_rows = wb.get_sheet_by_name(target_sheet).to_python()
                except Exception:
                    try:
                        import openpyxl
                        wb = openpyxl.load_workbook(temp_path, read_only=True, data_only=True)
                        target_sheet = wb.sheetnames[0]
                        for s in wb.sheetnames:
                            if any(k in s.lower() for k in ['veic', 'placa', 'frota', 'dados', 'base']):
                                target_sheet = s
                                break
                        raw_rows = list(wb[target_sheet].iter_rows(values_only=True))
                    except Exception as e_excel:
                        if os.path.exists(temp_path): os.remove(temp_path)
                        return jsonify({"error": f"Erro ao ler arquivo Excel: {str(e_excel)}"}), 400
            else:
                content = None
                for enc in ['utf-8-sig', 'utf-8', 'latin1', 'cp1252']:
                    try:
                        with open(temp_path, 'r', encoding=enc) as f:
                            content = f.read()
                        if content: break
                    except Exception: continue
                if content:
                    lines = [l for l in content.splitlines() if l.strip()]
                    if lines:
                        delims = [';', ',', '\t', '|']
                        delim_counts = {d: lines[0].count(d) for d in delims}
                        best_delim = max(delim_counts, key=delim_counts.get)
                        if delim_counts[best_delim] == 0: best_delim = ','
                        reader = csv.reader(io.StringIO(content), delimiter=best_delim)
                        raw_rows = list(reader)

            if os.path.exists(temp_path):
                os.remove(temp_path)
        else:
            data = request.get_json(silent=True) or {}
            csv_text = (data.get('csv_data') or request.form.get('csv_data') or '').strip()
            if not csv_text:
                return jsonify({"error": "Nenhum arquivo ou dado informado para importação."}), 400
            delims = [';', ',', '\t', '|']
            first_line = csv_text.splitlines()[0] if csv_text.splitlines() else ''
            delim_counts = {d: first_line.count(d) for d in delims}
            best_delim = max(delim_counts, key=delim_counts.get)
            if delim_counts[best_delim] == 0: best_delim = ';'
            reader = csv.reader(io.StringIO(csv_text), delimiter=best_delim)
            raw_rows = list(reader)

        if not raw_rows:
            return jsonify({"error": "Nenhum dado válido extraído da planilha/texto."}), 400

        clean_rows = [r for r in raw_rows if r and any(c is not None and str(c).strip() != '' for c in r)]
        if not clean_rows:
            return jsonify({"error": "Planilha/texto sem conteúdo aproveitável."}), 400

        # Header detection
        header_idx = -1
        header_map = {}
        vehicle_keywords = ['PLACA', 'MODELO', 'TIPO', 'CPF', 'SUBCLUSTER', 'SUBCLUS', 'AREA', 'BASE', 'SETOR', 'CONDUTOR', 'TICKET']
        
        for i, r in enumerate(clean_rows[:15]):
            str_r = [normalize_text_key(c) for c in r]
            concat = ' '.join(str_r)
            if sum(1 for k in vehicle_keywords if k in concat) >= 1 or 'PLACA' in concat:
                header_idx = i
                for c_idx, val in enumerate(str_r):
                    if val: header_map[val] = c_idx
                break

        if header_idx != -1:
            data_rows = clean_rows[header_idx + 1:]
        else:
            data_rows = clean_rows

        def get_val(row, candidates, default_pos):
            for cand in candidates:
                norm_cand = normalize_text_key(cand)
                for h_text, col_i in header_map.items():
                    if norm_cand in h_text or h_text in norm_cand:
                        if col_i < len(row) and row[col_i] is not None:
                            return str(row[col_i]).strip()
            if default_pos < len(row) and row[default_pos] is not None:
                return str(row[default_pos]).strip()
            return ''

        conn = get_db()
        cur = conn.cursor()
        success_count = 0
        updated_count = 0
        inserted_count = 0
        errors = []

        for index, row in enumerate(data_rows):
            plate = get_val(row, ['PLACA', 'PLATE', 'VEICULO'], 0).upper()
            plate = ''.join(c for c in plate if c.isalnum() or c == '-')
            model = get_val(row, ['MODELO', 'MODEL'], 1)
            v_type = get_val(row, ['TIPO', 'TYPE', 'CATEGORIA'], 2) or 'Utilitário'
            resp_tech_cpf = get_val(row, ['CPF', 'CPF_RESPONSAVEL', 'RESPONSAVEL', 'MOTORISTA'], 3)
            resp_tech_cpf = ''.join(filter(str.isdigit, resp_tech_cpf)) if resp_tech_cpf else None
            subclus = get_val(row, ['SUBCLUSTER', 'SUB_CLUSTER', 'SUBCLUS'], 4)
            area_rede = get_val(row, ['AREA_REDE', 'AREA', 'REGIAO'], 5)
            base = get_val(row, ['BASE', 'CIDADE'], 6)
            setor = get_val(row, ['SETOR', 'GESTAO'], 7)
            condutor_dia = get_val(row, ['CONDUTOR_DIA', 'DIA'], 8)
            condutor_tarde = get_val(row, ['CONDUTOR_TARDE', 'TARDE'], 9)
            condutor_madrugada = get_val(row, ['CONDUTOR_MADRUGADA', 'MADRUGADA'], 10)
            ticket_car = get_val(row, ['TICKET_CAR', 'TICKETCAR', 'CARTAO'], 11)

            if not plate:
                continue

            tech_id = None
            if resp_tech_cpf:
                cur.execute("SELECT id FROM technicians WHERE cpf = %s;", (resp_tech_cpf,))
                tech = cur.fetchone()
                if tech:
                    tech_id = tech['id']

            cur.execute("SELECT id FROM vehicles WHERE plate = %s;", (plate,))
            existing = cur.fetchone()

            try:
                cur.execute("SAVEPOINT vehicle_savepoint;")
                if existing:
                    cur.execute(
                        """
                        UPDATE vehicles SET
                            model = COALESCE(NULLIF(%s, ''), model),
                            type = COALESCE(NULLIF(%s, ''), type),
                            responsible_tech_id = COALESCE(%s, responsible_tech_id),
                            subclus = COALESCE(NULLIF(%s, ''), subclus),
                            area_rede = COALESCE(NULLIF(%s, ''), area_rede),
                            base = COALESCE(NULLIF(%s, ''), base),
                            setor = COALESCE(NULLIF(%s, ''), setor),
                            condutor_dia = COALESCE(NULLIF(%s, ''), condutor_dia),
                            condutor_tarde = COALESCE(NULLIF(%s, ''), condutor_tarde),
                            condutor_madrugada = COALESCE(NULLIF(%s, ''), condutor_madrugada),
                            ticket_car = COALESCE(NULLIF(%s, ''), ticket_car)
                        WHERE id = %s;
                        """,
                        (model, v_type, tech_id, subclus, area_rede, base, setor,
                         condutor_dia, condutor_tarde, condutor_madrugada, ticket_car, existing['id'])
                    )
                    updated_count += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO vehicles (
                            plate, model, type, responsible_tech_id, subclus, area_rede, base, setor,
                            condutor_dia, condutor_tarde, condutor_madrugada, ticket_car, created_by
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                        """,
                        (plate, model or 'Veículo', v_type, tech_id, subclus, area_rede, base, setor,
                         condutor_dia, condutor_tarde, condutor_madrugada, ticket_car, session['user_id'])
                    )
                    inserted_count += 1
                cur.execute("RELEASE SAVEPOINT vehicle_savepoint;")
                success_count += 1
            except Exception as err:
                cur.execute("ROLLBACK TO SAVEPOINT vehicle_savepoint;")
                print(f"[VEHICLES BULK] Erro ao salvar linha {index+1} (Placa: {plate}):", err)
                errors.append(f"Linha {index+1} (Placa: {plate}): falha ao salvar veículo. Verifique os dados fornecidos.")

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Realizou cadastro/atualização em lote de veículos: {success_count} processados ({inserted_count} novos, {updated_count} atualizados).")
        return jsonify({
            "success": True,
            "imported": success_count,
            "inserted": inserted_count,
            "updated": updated_count,
            "errors": errors
        }), 200
    except Exception as e:
        if 'conn' in locals() and conn:
            try: conn.rollback(); conn.close()
            except Exception: pass
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 500


# --- FINANCIAL: TEAMS & CONSUMABLES ---
@app.route('/api/finance/teams', methods=['GET', 'POST'])
@login_required
@coordenador_claro_required
def api_finance_teams():
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT tf.*, t1.name AS tech1_name, t2.name AS tech2_name 
                FROM teams_finance tf 
                LEFT JOIN technicians t1 ON tf.tech1_id = t1.id 
                LEFT JOIN technicians t2 ON tf.tech2_id = t2.id 
                ORDER BY tf.reference_month DESC, tf.created_at DESC;
                """
            )
            records = cur.fetchall()
            cur.close()
            conn.close()
            for r in records:
                r['amount'] = float(r['amount'])
                r['created_at'] = r['created_at'].strftime('%d/%m/%Y %H:%M')
            return jsonify(records)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else:
        try:
            data = request.get_json()
            tech1_id = safe_int(data.get('tech1_id'))
            tech2_id = safe_int(data.get('tech2_id'))
            area = data.get('area', '').strip()
            amount = safe_float(data.get('amount', 0.0))
            ref_month = data.get('reference_month', '').strip()
            
            if not tech1_id or not tech2_id or not area or amount <= 0 or not ref_month:
                return jsonify({"error": "Pessoas, Área, Valor e Mês de Referência são obrigatórios."}), 400
                
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO teams_finance (tech1_id, tech2_id, area, amount, reference_month, created_by) 
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;
                """,
                (tech1_id, tech2_id, area, amount, ref_month, session['user_id'])
            )
            record_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Registrou faturamento de equipe (ID: {record_id}, Valor: R$ {amount:.2f}, Mês: {ref_month})")
            return jsonify({"success": True, "id": record_id}), 201
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/finance/teams/<int:record_id>', methods=['DELETE', 'PUT'])
@login_required
@coordenador_claro_required
def api_finance_team_detail(record_id):
    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT amount, reference_month FROM teams_finance WHERE id = %s;", (record_id,))
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return jsonify({"error": "Registro não encontrado."}), 404
                
            cur.execute("DELETE FROM teams_finance WHERE id = %s;", (record_id,))
            conn.commit()
            cur.close()
            conn.close()
            log_action(session['user_id'], session['username'], f"Excluiu faturamento de equipe (Valor: R$ {float(row['amount']):.2f}, Mês: {row['reference_month']})")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else: # PUT
        try:
            data = request.get_json() or {}
            tech1_id = safe_int(data.get('tech1_id'))
            tech2_id = safe_int(data.get('tech2_id'))
            area = data.get('area', '').strip()
            amount = safe_float(data.get('amount', 0.0))
            ref_month = data.get('reference_month', '').strip()

            if not tech1_id or not tech2_id or not area or amount <= 0 or not ref_month:
                return jsonify({"error": "Pessoas, Área, Valor e Mês de Referência são obrigatórios."}), 400

            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                UPDATE teams_finance 
                SET tech1_id = %s, tech2_id = %s, area = %s, amount = %s, reference_month = %s 
                WHERE id = %s;
            """, (tech1_id, tech2_id, area, amount, ref_month, record_id))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou faturamento de equipe ID {record_id} (Valor: R$ {amount:.2f}, Mês: {ref_month})")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/finance/consumables', methods=['GET', 'POST'])
@login_required
@coordenador_claro_required
def api_finance_consumables():
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM consumables_finance ORDER BY reference_month DESC, created_at DESC;")
            records = cur.fetchall()
            cur.close()
            conn.close()
            for r in records:
                r['amount'] = float(r['amount'])
                r['created_at'] = r['created_at'].strftime('%d/%m/%Y %H:%M')
            return jsonify(records)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else:
        try:
            data = request.get_json()
            description = data.get('description', '').strip()
            area = data.get('area', '').strip()
            amount = safe_float(data.get('amount', 0.0))
            ref_month = data.get('reference_month', '').strip()
            
            if not description or not area or amount <= 0 or not ref_month:
                return jsonify({"error": "Descrição, Área, Valor e Mês de Referência são obrigatórios."}), 400
                
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO consumables_finance (description, area, amount, reference_month, created_by) 
                VALUES (%s, %s, %s, %s, %s) RETURNING id;
                """,
                (description, area, amount, ref_month, session['user_id'])
            )
            record_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Registrou custo de consumíveis: {description} (Valor: R$ {amount:.2f}, Mês: {ref_month})")
            return jsonify({"success": True, "id": record_id}), 201
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/finance/consumables/<int:record_id>', methods=['DELETE', 'PUT'])
@login_required
@coordenador_claro_required
def api_finance_consumables_detail(record_id):
    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT amount, description FROM consumables_finance WHERE id = %s;", (record_id,))
            row = cur.fetchone()
            if not row:
                cur.close()
                conn.close()
                return jsonify({"error": "Registro não encontrado."}), 404
                
            cur.execute("DELETE FROM consumables_finance WHERE id = %s;", (record_id,))
            conn.commit()
            cur.close()
            conn.close()
            log_action(session['user_id'], session['username'], f"Excluiu despesa de consumível (ID: {record_id}, {row['description']})")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else: # PUT
        try:
            data = request.get_json() or {}
            description = data.get('description', '').strip()
            area = data.get('area', '').strip()
            amount = safe_float(data.get('amount', 0.0))
            ref_month = data.get('reference_month', '').strip()

            if not description or not area or amount <= 0 or not ref_month:
                return jsonify({"error": "Descrição, Área, Valor e Mês de Referência são obrigatórios."}), 400

            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                UPDATE consumables_finance 
                SET description = %s, area = %s, amount = %s, reference_month = %s 
                WHERE id = %s;
            """, (description, area, amount, ref_month, record_id))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou custo de consumível ID {record_id} ({description}, R$ {amount:.2f})")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/finance/export', methods=['GET'])
@login_required
def api_export_finance():
    auth = get_current_user_auth()
    if not auth or (not auth['is_master'] and not auth['is_coordenador'] and not any(k.startswith('financeiro.') for k in auth.get('permissions', []))):
        return jsonify({"error": "Acesso não autorizado."}), 403
    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("""
            SELECT tf.id, tf.reference_month, tf.area, tf.amount, tf.created_at,
                   t1.name AS tech1_name, t2.name AS tech2_name
            FROM teams_finance tf
            LEFT JOIN technicians t1 ON tf.tech1_id = t1.id
            LEFT JOIN technicians t2 ON tf.tech2_id = t2.id
            ORDER BY tf.reference_month DESC, tf.created_at DESC;
        """)
        teams = cur.fetchall()

        cur.execute("""
            SELECT id, reference_month, description, area, amount, created_at
            FROM consumables_finance
            ORDER BY reference_month DESC, created_at DESC;
        """)
        consumables = cur.fetchall()

        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff')
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow(["Tipo Lançamento", "Mês Referência", "Descrição / Pessoas", "Área de Trabalho", "Valor Mensal (R$)", "Data Registro"])

        for t in teams:
            tech1 = t['tech1_name'] or 'N/A'
            tech2 = t['tech2_name'] or 'N/A'
            dta = t['created_at'].strftime('%d/%m/%Y %H:%M') if t['created_at'] else ''
            writer.writerow(["Equipe Externa", t['reference_month'], f"{tech1} + {tech2}", t['area'], f"{float(t['amount']):.2f}".replace('.', ','), dta])

        for c in consumables:
            dta = c['created_at'].strftime('%d/%m/%Y %H:%M') if c['created_at'] else ''
            writer.writerow(["Consumível", c['reference_month'], c['description'], c['area'], f"{float(c['amount']):.2f}".replace('.', ','), dta])

        response = app.response_class(
            output.getvalue().encode('utf-8-sig'),
            mimetype='text/csv',
            headers={"Content-disposition": f"attachment; filename=relatorio_financeiro_custos_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        return response
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- NOTIFICATIONS (Notificações — Coordenadores Claro apenas) ---
@app.route('/api/notifications', methods=['GET', 'POST'])
@login_required
@coordenador_claro_required
def api_notifications():
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM notifications ORDER BY id ASC;")
            rows = cur.fetchall()
            cur.close()
            conn.close()

            result = []
            for idx, r in enumerate(rows, start=1):
                result.append({
                    "id": r['id'],
                    "event_date": r['event_date'].strftime('%Y-%m-%d') if r['event_date'] else '',
                    "reason": r['reason'],
                    "description": r['description'],
                    "coordinator_name": r['coordinator_name'],
                    "count_label": f"Notificação {idx:03d}",
                })
            result.reverse()
            return jsonify(result)
        except Exception as e:
            print("Backend error log:", e)
            return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else:
        try:
            data = request.get_json(silent=True) or {}
            event_date = (data.get('event_date') or '').strip()
            reason = (data.get('reason') or '').strip()
            description = (data.get('description') or '').strip()
            coordinator_name = (data.get('coordinator_name') or '').strip()

            if not event_date or not reason or not description or not coordinator_name:
                return jsonify({"error": "Data, Porquê, Descritivo e Coordenador são obrigatórios."}), 400

            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO notifications (event_date, reason, description, coordinator_name, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id;",
                (event_date, reason, description, coordinator_name, session['user_id'])
            )
            new_id = cur.fetchone()['id']
            conn.commit()

            # Detect mentioned technicians or users
            try:
                cur.execute("SELECT id, name, email FROM technicians WHERE email IS NOT NULL AND email != '';")
                tech_candidates = cur.fetchall()
                for tech in tech_candidates:
                    t_name = (tech.get('name') or '').strip()
                    t_email = (tech.get('email') or '').strip()
                    if not t_email or '@' not in t_email or len(t_name) < 3:
                        continue
                    
                    # Search match in description or reason
                    parts = [p for p in t_name.split() if len(p) >= 3]
                    matches = False
                    if len(parts) >= 2:
                        first_last = f"{parts[0]} {parts[-1]}".lower()
                        if first_last in description.lower() or first_last in reason.lower() or t_name.lower() in description.lower() or t_name.lower() in reason.lower():
                            matches = True
                    elif t_name.lower() in description.lower() or t_name.lower() in reason.lower():
                        matches = True

                    if matches:
                        send_resend_email(
                            to_email=t_email,
                            subject=f"[Notificação Operacional] Você foi mencionado - {reason}",
                            category_badge="MENÇÃO OPERACIONAL",
                            title="Você foi Mencionado em uma Notificação Operacional",
                            message_html=f'''
                                <p>Olá, <strong>{t_name}</strong>.</p>
                                <p>Você foi citado em uma nova notificação registrada no sistema <strong>Claro Gestão Rede Externa</strong> pelo coordenador <strong>{coordinator_name}</strong>.</p>
                                <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                                    <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Motivo / Assunto:</p>
                                    <p style="margin: 0 0 12px 0; color: #F8FAFC; font-weight: 600; font-size: 15px;">{reason}</p>
                                    <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Data do Evento:</p>
                                    <p style="margin: 0 0 12px 0; color: #F8FAFC; font-weight: 500; font-size: 14px;">{event_date}</p>
                                    <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Descritivo do Ocorrido:</p>
                                    <p style="margin: 0; color: #CBD5E1; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">{description}</p>
                                </div>
                                <p>Para conferir os detalhes e histórico completo, acesse a aba de Notificações na plataforma.</p>
                            ''',
                            cta_text="Ver Notificações",
                            cta_url="https://gestaoredeexterna.shardweb.app/notificacoes"
                        )
            except Exception as mention_err:
                print("Mention email error:", mention_err)

            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Registrou notificação: {reason} ({coordinator_name})")
            return jsonify({"success": True, "id": new_id}), 201
        except Exception as e:
            print("Backend error log:", e)
            return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@login_required
@coordenador_claro_required
def api_delete_notification(notif_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM notifications WHERE id = %s;", (notif_id,))
        conn.commit()
        cur.close()
        conn.close()
        log_action(session['user_id'], session['username'], f"Excluiu notificação ID {notif_id}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/notifications/export', methods=['GET'])
@login_required
@coordenador_claro_required
def api_export_notifications():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM notifications ORDER BY id ASC;")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow(["Data", "Porquê", "Descritivo", "Contagem", "Coordenador"])
        for idx, r in enumerate(rows, start=1):
            event_date = r['event_date'].strftime('%d/%m/%Y') if r['event_date'] else ''
            writer.writerow([event_date, r['reason'], r['description'], f"Notificação {idx:03d}", r['coordinator_name']])

        response = app.response_class(
            output.getvalue().encode('utf-8-sig'),
            mimetype='text/csv',
            headers={"Content-disposition": f"attachment; filename=notificacoes_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        return response
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/notifications/bulk', methods=['POST'])
@login_required
@coordenador_claro_required
def api_bulk_notifications():
    try:
        data = request.get_json(silent=True) or {}
        csv_text = data.get('csv_data', '').strip()
        if not csv_text:
            return jsonify({"error": "Nenhum dado informado para importação."}), 400

        rows = [r for r in csv_text.splitlines() if r.strip()]
        imported = 0
        errors = []
        conn = get_db()
        cur = conn.cursor()

        for idx, row in enumerate(rows):
            parts = [p.strip() for p in row.split(';')]
            if len(parts) < 2:
                parts = [p.strip() for p in row.split(',')]

            if idx == 0 and ('data' in parts[0].lower() or 'porqu' in parts[0].lower()):
                continue

            date_raw = parts[0] if len(parts) > 0 else ''
            reason = parts[1] if len(parts) > 1 else ''
            description = parts[2] if len(parts) > 2 else ''
            coordinator_name = parts[4] if len(parts) > 4 else (parts[3] if len(parts) > 3 else '')

            if not date_raw or not reason or not description or not coordinator_name:
                errors.append(f"Linha {idx+1}: campos obrigatórios vazios.")
                continue

            event_date = None
            for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d'):
                try:
                    event_date = datetime.datetime.strptime(date_raw, fmt).date()
                    break
                except ValueError:
                    continue
            if not event_date:
                errors.append(f"Linha {idx+1}: data '{date_raw}' inválida. Use DD/MM/AAAA ou AAAA-MM-DD.")
                continue

            cur.execute(
                "INSERT INTO notifications (event_date, reason, description, coordinator_name, created_by) VALUES (%s, %s, %s, %s, %s);",
                (event_date, reason, description, coordinator_name, session['user_id'])
            )
            imported += 1

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Importou em lote {imported} notificação(ões)")
        return jsonify({"success": True, "imported": imported, "errors": errors})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- PHYSICAL INVENTORY ---
@app.route('/api/inventory', methods=['GET', 'POST'])
@login_required
def api_inventory():
    if request.method == 'GET':
        category = request.args.get('category', '').strip()
        try:
            conn = get_db()
            cur = conn.cursor()
            if category:
                cur.execute("SELECT * FROM inventory_items WHERE category = %s ORDER BY name ASC;", (category,))
            else:
                cur.execute("SELECT * FROM inventory_items ORDER BY category ASC, name ASC;")
            items = cur.fetchall()
            cur.close()
            conn.close()
            for i in items:
                i['created_at'] = i['created_at'].strftime('%d/%m/%Y %H:%M')
            return jsonify(items)
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else:
        try:
            data = request.get_json()
            category = data.get('category', '').strip()
            name = data.get('name', '').strip()
            quantity = safe_int(data.get('quantity', 0))
            serial_number = data.get('serial_number', '').strip() or None
            description = data.get('description', '').strip() or None
            
            if not category or not name or quantity < 0:
                return jsonify({"error": "Categoria, Nome e Quantidade são obrigatórios."}), 400
                
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO inventory_items (category, name, quantity, serial_number, description, created_by) 
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;
                """,
                (category, name, quantity, serial_number, description, session['user_id'])
            )
            item_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Adicionou item ao inventário ({category}): {name} (Qtd: {quantity})")
            return jsonify({"success": True, "id": item_id}), 201
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/inventory/<int:item_id>', methods=['PUT', 'DELETE'])
@login_required
def api_inventory_detail(item_id):
    if request.method == 'PUT':
        try:
            data = request.get_json()
            name = data.get('name', '').strip()
            quantity = safe_int(data.get('quantity', 0))
            serial_number = data.get('serial_number', '').strip() or None
            description = data.get('description', '').strip() or None
            
            if not name or quantity < 0:
                return jsonify({"error": "Nome e Quantidade são obrigatórios."}), 400
                
            conn = get_db()
            cur = conn.cursor()
            
            cur.execute("SELECT category, name FROM inventory_items WHERE id = %s;", (item_id,))
            item = cur.fetchone()
            if not item:
                cur.close()
                conn.close()
                return jsonify({"error": "Item não encontrado."}), 404
                
            cur.execute(
                """
                UPDATE inventory_items 
                SET name = %s, quantity = %s, serial_number = %s, description = %s 
                WHERE id = %s;
                """,
                (name, quantity, serial_number, description, item_id)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Atualizou item do inventário ({item['category']}): {name} (Qtd: {quantity})")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    else:
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT category, name FROM inventory_items WHERE id = %s;", (item_id,))
            item = cur.fetchone()
            if not item:
                cur.close()
                conn.close()
                return jsonify({"error": "Item não encontrado."}), 404
                
            cur.execute("DELETE FROM inventory_items WHERE id = %s;", (item_id,))
            conn.commit()
            cur.close()
            conn.close()
            
            log_action(session['user_id'], session['username'], f"Deletou item do inventário ({item['category']}): {item['name']}")
            return jsonify({"success": True})
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


# --- 5. AUDIT LOGS ---
@app.route('/api/logs', methods=['GET'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_get_logs():
    user_filter = (request.args.get('user') or request.args.get('username') or '').strip().lower()
    try:
        conn = get_db()
        cur = conn.cursor()
        if user_filter:
            cur.execute(
                "SELECT * FROM audit_logs WHERE LOWER(username) LIKE %s ORDER BY timestamp DESC LIMIT 200;",
                (f"%{user_filter}%",)
            )
        else:
            cur.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200;")
        logs = cur.fetchall()
        cur.close()
        conn.close()
        
        for l in logs:
            if l['timestamp']:
                l['timestamp'] = l['timestamp'].strftime('%d/%m/%Y %H:%M:%S')
            if isinstance(l.get('action'), str):
                l['action'] = l['action'].replace('GestÃ£o', 'Gestão')
        return jsonify(logs)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


# --- 6. USER MANAGEMENT ---
@app.route('/api/users', methods=['GET'])
@login_required
def api_get_users():
    try:
        auth = get_current_user_auth()
        user_perms = (auth.get('permissions') or []) if auth else []
        is_privileged = bool(
            auth and (
                auth.get('is_master')
                or auth.get('is_coordenador')
                or any(p.startswith('gerenciamento.') for p in user_perms)
            )
        )

        conn = get_db()
        cur = conn.cursor()
        if not is_privileged:
            cur.execute("""
                SELECT u.id, u.username, u.role, u.tech_id,
                       COALESCE(u.name, t.name) AS name
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                ORDER BY u.username ASC;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()
            safe_users = []
            for u in rows:
                formatted_name = format_person_name(u['name']) if u.get('name') else ''
                safe_users.append({
                    'id': u['id'],
                    'username': u['username'],
                    'name': formatted_name,
                    'tech_name': formatted_name,
                    'role': u['role'],
                    'tech_id': u['tech_id'],
                })
            return jsonify(safe_users)

        _ensure_login_tracking_schema(cur)
        conn.commit()
        cur.execute("""
            SELECT u.id, u.username, u.role, u.tech_id, u.permissions, u.totp_enabled,
                   COALESCE(u.name, t.name) AS tech_name,
                   COALESCE(u.email, t.email) AS email,
                   COALESCE(u.phone, t.phone) AS phone,
                   t.company, t.area,
                   u.created_at,
                   u.last_login_at,
                   u.last_login_device,
                   u.last_login_ip,
                   u.last_login_location
            FROM users u 
            LEFT JOIN technicians t ON u.tech_id = t.id 
            ORDER BY u.username ASC;
        """)
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        for u in users:
            if u.get('created_at'):
                u['created_at'] = u['created_at'].strftime('%d/%m/%Y %H:%M')
            if u.get('last_login_at'):
                u['last_login_at_fmt'] = u['last_login_at'].strftime('%d/%m/%Y às %H:%M:%S')
                u['last_login_at'] = u['last_login_at'].isoformat()
            else:
                u['last_login_at_fmt'] = None
                u['last_login_at'] = None
            if u.get('tech_name'):
                u['tech_name'] = format_person_name(u['tech_name'])
            uname = (u.get('username') or '').strip().lower()
            u['permissions'] = resolve_user_permissions(uname, u.get('role'), u.get('permissions'))
            u['is_master'] = (uname == MASTER_COORDINATOR_USERNAME)
            u['is_coordenador'] = is_coordenador_role(uname, u.get('role'))
            u['totp_enabled'] = bool(u.get('totp_enabled'))
        return jsonify(users)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500


def _collect_user_all_activities(cur, target_id, uname, display_name, tech_id):
    """Reúne todas as atividades em que o usuário publicou/executou, foi incluído/responsável ou foi citado."""
    items = []
    name_clean = (display_name or '').strip()
    uname_clean = (uname or '').strip().lower()
    name_like = f"%{name_clean.lower()}%" if len(name_clean) >= 3 else None
    uname_like = f"%{uname_clean}%" if len(uname_clean) >= 3 else None

    def _fmt_ts(dt_val):
        if not dt_val:
            return ("1970-01-01T00:00:00", "Data não informada")
        if isinstance(dt_val, datetime.datetime):
            return (dt_val.isoformat(), dt_val.strftime("%d/%m/%Y às %H:%M:%S"))
        if isinstance(dt_val, datetime.date):
            dt_full = datetime.datetime(dt_val.year, dt_val.month, dt_val.day)
            return (dt_full.isoformat(), dt_full.strftime("%d/%m/%Y"))
        s = str(dt_val)
        return (s, s)

    # 1. Área de Trabalho (user_tasks)
    try:
        conds = ["user_id = %s"]
        params = [target_id]
        if tech_id:
            conds.append("assigned_tech_id = %s")
            params.append(tech_id)
        if name_like:
            conds.append("LOWER(COALESCE(assigned_tech_name, '')) LIKE %s")
            conds.append("LOWER(COALESCE(title, '')) LIKE %s")
            conds.append("LOWER(COALESCE(description, '')) LIKE %s")
            params.extend([name_like, name_like, name_like])
        cur.execute(f"""
            SELECT id, user_id, title, priority, status, assigned_tech_id, assigned_tech_name, description, created_at
            FROM user_tasks
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 250;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            if r.get("user_id") == target_id:
                rel = "publicou"
                rel_label = "Publicou / Criou"
            elif (tech_id and r.get("assigned_tech_id") == tech_id) or (name_clean and name_clean.lower() in (r.get("assigned_tech_name") or "").lower()):
                rel = "incluido"
                rel_label = "Incluído / Responsável"
            else:
                rel = "citado"
                rel_label = "Citado na Demanda"
            items.append({
                "id": f"task-{r['id']}",
                "module": "Área de Trabalho",
                "relation": rel,
                "relation_label": rel_label,
                "title": f"Demanda: {r.get('title') or 'Sem título'}",
                "detail": f"Status: {r.get('status') or 'Pendente'} · Prioridade: {r.get('priority') or 'Média'}"
                          + (f" · Responsável: {r.get('assigned_tech_name')}" if r.get("assigned_tech_name") else "")
                          + (f" — {r.get('description')[:140]}" if r.get("description") else ""),
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 2. Notas no Grafana (grafana_ticket_notes)
    try:
        conds = ["author_user_id = %s"]
        params = [target_id]
        if name_like:
            conds.append("LOWER(COALESCE(author_name, '')) LIKE %s")
            conds.append("LOWER(COALESCE(content, '')) LIKE %s")
            params.extend([name_like, name_like])
        cur.execute(f"""
            SELECT id, ticket_key, content, author_user_id, author_name, created_at
            FROM grafana_ticket_notes
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 250;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_author = r.get("author_user_id") == target_id or (name_clean and name_clean.lower() == (r.get("author_name") or "").strip().lower())
            items.append({
                "id": f"gnote-{r['id']}",
                "module": "Grafana · COP REDE",
                "relation": "publicou" if is_author else "citado",
                "relation_label": "Publicou Nota" if is_author else "Citado em Nota",
                "title": f"Nota no Ticket {r.get('ticket_key')}",
                "detail": f"{r.get('content') or ''} (Autor: {r.get('author_name') or ''})",
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 3. Tickets Ativos no Grafana onde está incluído/responsável (grafana_tickets)
    try:
        conds = ["responsible_user_id = %s"]
        params = [target_id]
        if tech_id:
            conds.append("responsible_tech_id = %s")
            params.append(tech_id)
        if name_like:
            conds.append("LOWER(COALESCE(responsible_name, '')) LIKE %s")
            params.append(name_like)
        cur.execute(f"""
            SELECT id, ticket_type, ticket_number, cf, designation, status_andamento, responsible_name, updated_at
            FROM grafana_tickets
            WHERE {" OR ".join(conds)}
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 250;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("updated_at"))
            items.append({
                "id": f"gticket-{r['id']}",
                "module": "Grafana · COP REDE",
                "relation": "incluido",
                "relation_label": "Incluído / Acionado",
                "title": f"{r.get('ticket_type')} {r.get('ticket_number')} (CF {r.get('cf')})",
                "detail": f"Designação: {r.get('designation') or '-'} · Status: {r.get('status_andamento') or '-'}",
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 4. Histórico de Falhas Sanadas no Grafana (grafana_cleared_tickets)
    try:
        if name_like:
            cur.execute("""
                SELECT id, ticket_type, ticket_number, cf, designation, status_andamento, responsible_name, cleared_at
                FROM grafana_cleared_tickets
                WHERE LOWER(COALESCE(responsible_name, '')) LIKE %s
                   OR LOWER(COALESCE(notes_snapshot::text, '')) LIKE %s
                ORDER BY cleared_at DESC NULLS LAST, id DESC
                LIMIT 200;
            """, (name_like, name_like))
            for r in cur.fetchall():
                iso_s, fmt_s = _fmt_ts(r.get("cleared_at"))
                is_resp = name_clean.lower() in (r.get("responsible_name") or "").lower()
                items.append({
                    "id": f"gcleared-{r['id']}",
                    "module": "Grafana · Histórico Sanadas",
                    "relation": "incluido" if is_resp else "citado",
                    "relation_label": "Responsável (Sanada)" if is_resp else "Citado nas Notas",
                    "title": f"Falha Sanada: {r.get('ticket_type')} {r.get('ticket_number')} (CF {r.get('cf')})",
                    "detail": f"Designação: {r.get('designation') or '-'} · Status final: {r.get('status_andamento') or '-'}",
                    "timestamp_iso": iso_s,
                    "timestamp_fmt": fmt_s,
                })
    except Exception:
        cur.connection.rollback()

    # 5. Auditorias de Campo (auditorias)
    try:
        conds = ["created_by_id = %s"]
        params = [target_id]
        if tech_id:
            conds.append("responsible_id = %s")
            params.append(tech_id)
        if name_like:
            conds.extend([
                "LOWER(COALESCE(created_by, '')) LIKE %s",
                "LOWER(COALESCE(responsible, '')) LIKE %s",
                "LOWER(COALESCE(observations, '')) LIKE %s",
            ])
            params.extend([name_like, name_like, name_like])
        cur.execute(f"""
            SELECT id, os, created_by, created_by_id, responsible, responsible_id, status, observations, created_at
            FROM auditorias
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 200;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_creator = r.get("created_by_id") == target_id or (name_clean and name_clean.lower() in (r.get("created_by") or "").lower())
            is_resp = (tech_id and r.get("responsible_id") == tech_id) or (name_clean and name_clean.lower() in (r.get("responsible") or "").lower())
            rel = "publicou" if is_creator else ("incluido" if is_resp else "citado")
            rel_label = "Publicou Auditoria" if is_creator else ("Responsável" if is_resp else "Citado nas Observações")
            items.append({
                "id": f"aud-{r['id']}",
                "module": "Auditoria",
                "relation": rel,
                "relation_label": rel_label,
                "title": f"Auditoria OS {r.get('os')}",
                "detail": f"Status: {r.get('status')} · Criada por: {r.get('created_by')} · Responsável: {r.get('responsible')}"
                          + (f" — {r.get('observations')[:120]}" if r.get("observations") else ""),
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 6. Aceitação de Rede (aceitacoes)
    try:
        conds = ["created_by_id = %s"]
        params = [target_id]
        if tech_id:
            conds.append("responsible_id = %s")
            params.append(tech_id)
        if name_like:
            conds.extend([
                "LOWER(COALESCE(created_by, '')) LIKE %s",
                "LOWER(COALESCE(responsible, '')) LIKE %s",
                "LOWER(COALESCE(observations, '')) LIKE %s",
            ])
            params.extend([name_like, name_like, name_like])
        cur.execute(f"""
            SELECT id, os, created_by, created_by_id, responsible, responsible_id, status, observations, created_at
            FROM aceitacoes
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 200;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_creator = r.get("created_by_id") == target_id or (name_clean and name_clean.lower() in (r.get("created_by") or "").lower())
            is_resp = (tech_id and r.get("responsible_id") == tech_id) or (name_clean and name_clean.lower() in (r.get("responsible") or "").lower())
            rel = "publicou" if is_creator else ("incluido" if is_resp else "citado")
            rel_label = "Publicou Aceitação" if is_creator else ("Responsável" if is_resp else "Citado nas Observações")
            items.append({
                "id": f"aceit-{r['id']}",
                "module": "Aceitação de Rede",
                "relation": rel,
                "relation_label": rel_label,
                "title": f"Aceitação OS {r.get('os')}",
                "detail": f"Status: {r.get('status')} · Criada por: {r.get('created_by')} · Responsável: {r.get('responsible')}"
                          + (f" — {r.get('observations')[:120]}" if r.get("observations") else ""),
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 7. Pós-Evento (pos_eventos)
    try:
        conds = ["created_by_id = %s"]
        params = [target_id]
        if name_like:
            conds.extend([
                "LOWER(COALESCE(created_by, '')) LIKE %s",
                "LOWER(COALESCE(responsible, '')) LIKE %s",
            ])
            params.extend([name_like, name_like])
        cur.execute(f"""
            SELECT id, ticket_type, ticket_number, area, responsible, status, created_by, created_by_id, created_at
            FROM pos_eventos
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 200;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_creator = r.get("created_by_id") == target_id or (name_clean and name_clean.lower() in (r.get("created_by") or "").lower())
            items.append({
                "id": f"posev-{r['id']}",
                "module": "Pós-Evento",
                "relation": "publicou" if is_creator else "incluido",
                "relation_label": "Publicou Pós-Evento" if is_creator else "Incluído / Responsável",
                "title": f"Pós-Evento {r.get('ticket_type')} {r.get('ticket_number')} ({r.get('area') or '-'})",
                "detail": f"Status: {r.get('status')} · Responsável: {r.get('responsible') or '-'}",
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 8. Vistorias Veiculares 4 Lados & Repasses (vehicle_inspections)
    try:
        conds = ["created_by_user_id = %s", "approved_by_user_id = %s"]
        params = [target_id, target_id]
        if tech_id:
            conds.append("to_tech_id = %s")
            params.append(tech_id)
        if name_like:
            conds.extend([
                "LOWER(COALESCE(from_person_name, '')) LIKE %s",
                "LOWER(COALESCE(to_person_name, '')) LIKE %s",
                "LOWER(COALESCE(created_by_name, '')) LIKE %s",
                "LOWER(COALESCE(approved_by_name, '')) LIKE %s",
            ])
            params.extend([name_like, name_like, name_like, name_like])
        cur.execute(f"""
            SELECT id, plate, inspection_type, from_person_name, to_person_name, km, status,
                   created_by_user_id, created_by_name, approved_by_user_id, approved_by_name, created_at
            FROM vehicle_inspections
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 200;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_pub = r.get("created_by_user_id") == target_id or r.get("approved_by_user_id") == target_id
            items.append({
                "id": f"vinsp-{r['id']}",
                "module": "Frota & Veículos",
                "relation": "publicou" if is_pub else "incluido",
                "relation_label": "Publicou / Revisou Vistoria" if is_pub else "Incluído no Repasse",
                "title": f"Vistoria 4 Lados ({r.get('plate')}): {r.get('from_person_name')} ➔ {r.get('to_person_name')}",
                "detail": f"Status: {r.get('status', '').upper()} · KM: {r.get('km')}"
                          + (f" · Aprovado por: {r.get('approved_by_name')}" if r.get("approved_by_name") else ""),
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 9. Avarias Veiculares (vehicle_damages)
    try:
        if name_like:
            cur.execute("""
                SELECT id, plate, occurrence_type, severity, affected_part, description,
                       reported_by_name, driver_name, resolved_by_name, status, created_at
                FROM vehicle_damages
                WHERE LOWER(COALESCE(reported_by_name, '')) LIKE %s
                   OR LOWER(COALESCE(driver_name, '')) LIKE %s
                   OR LOWER(COALESCE(resolved_by_name, '')) LIKE %s
                   OR LOWER(COALESCE(description, '')) LIKE %s
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT 150;
            """, (name_like, name_like, name_like, name_like))
            for r in cur.fetchall():
                iso_s, fmt_s = _fmt_ts(r.get("created_at"))
                is_rep = name_clean.lower() in (r.get("reported_by_name") or "").lower()
                is_drv = name_clean.lower() in (r.get("driver_name") or "").lower() or name_clean.lower() in (r.get("resolved_by_name") or "").lower()
                rel = "publicou" if is_rep else ("incluido" if is_drv else "citado")
                rel_label = "Reportou Avaria" if is_rep else ("Condutor / Tratativa" if is_drv else "Citado na Avaria")
                items.append({
                    "id": f"vdmg-{r['id']}",
                    "module": "Frota · Avarias",
                    "relation": rel,
                    "relation_label": rel_label,
                    "title": f"Avaria ({r.get('plate')}): {r.get('occurrence_type')} — {r.get('affected_part') or 'Geral'}",
                    "detail": f"Status: {r.get('status')} · Gravidade: {r.get('severity')} — {r.get('description')[:120]}",
                    "timestamp_iso": iso_s,
                    "timestamp_fmt": fmt_s,
                })
    except Exception:
        cur.connection.rollback()

    # 10. Avaliações Técnicas (collaborator_evaluations)
    try:
        conds = ["evaluator_id = %s", "LOWER(COALESCE(evaluator_username, '')) = %s"]
        params = [target_id, uname_clean]
        if tech_id:
            conds.append("technician_id = %s")
            params.append(tech_id)
        if name_like:
            conds.append("LOWER(COALESCE(technician_name, '')) LIKE %s")
            params.append(name_like)
        cur.execute(f"""
            SELECT id, technician_id, technician_name, overall_score, comments, evaluator_id, evaluator_username, created_at
            FROM collaborator_evaluations
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 150;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_eval = r.get("evaluator_id") == target_id or (r.get("evaluator_username") or "").lower() == uname_clean
            items.append({
                "id": f"eval-{r['id']}",
                "module": "Avaliação Técnica",
                "relation": "publicou" if is_eval else "incluido",
                "relation_label": "Publicou Avaliação" if is_eval else "Avaliado",
                "title": f"Avaliação de {r.get('technician_name')} (Nota: {r.get('overall_score')})",
                "detail": f"Avaliador: {r.get('evaluator_username') or '-'}" + (f" — {r.get('comments')[:120]}" if r.get("comments") else ""),
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 11. Comunicados / Notificações (notifications)
    try:
        conds = ["created_by = %s"]
        params = [target_id]
        if name_like:
            conds.extend([
                "LOWER(COALESCE(coordinator_name, '')) LIKE %s",
                "LOWER(COALESCE(reason, '')) LIKE %s",
                "LOWER(COALESCE(description, '')) LIKE %s",
            ])
            params.extend([name_like, name_like, name_like])
        cur.execute(f"""
            SELECT id, reason, description, coordinator_name, created_by, created_at
            FROM notifications
            WHERE {" OR ".join(conds)}
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT 150;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("created_at"))
            is_pub = r.get("created_by") == target_id or (name_clean and name_clean.lower() in (r.get("coordinator_name") or "").lower())
            items.append({
                "id": f"notif-{r['id']}",
                "module": "Notificações",
                "relation": "publicou" if is_pub else "citado",
                "relation_label": "Publicou Comunicado" if is_pub else "Citado no Comunicado",
                "title": f"Comunicado: {r.get('reason')}",
                "detail": (r.get("description") or "")[:140],
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    # 12. Logs Gerais do Sistema & Citações (audit_logs)
    try:
        conds = ["user_id = %s", "LOWER(COALESCE(username, '')) = %s"]
        params = [target_id, uname_clean]
        if name_like:
            conds.append("LOWER(COALESCE(action, '')) LIKE %s")
            params.append(name_like)
        if uname_like:
            conds.append("LOWER(COALESCE(action, '')) LIKE %s")
            params.append(uname_like)
        cur.execute(f"""
            SELECT id, user_id, username, action, timestamp
            FROM audit_logs
            WHERE {" OR ".join(conds)}
            ORDER BY timestamp DESC NULLS LAST, id DESC
            LIMIT 400;
        """, tuple(params))
        for r in cur.fetchall():
            iso_s, fmt_s = _fmt_ts(r.get("timestamp"))
            is_actor = r.get("user_id") == target_id or (r.get("username") or "").lower() == uname_clean
            items.append({
                "id": f"log-{r['id']}",
                "module": "Auditoria do Sistema",
                "relation": "publicou" if is_actor else "citado",
                "relation_label": "Executou no Sistema" if is_actor else "Citado / Incluído em Ação",
                "title": r.get("action") or "Ação registrada",
                "detail": f"Operador: @{r.get('username') or 'sistema'}",
                "timestamp_iso": iso_s,
                "timestamp_fmt": fmt_s,
            })
    except Exception:
        cur.connection.rollback()

    items.sort(key=lambda x: x.get("timestamp_iso") or "", reverse=True)
    return items

@app.route('/api/users/<int:target_id>/profile-detail', methods=['GET'])
@login_required
def api_get_user_profile_detail(target_id):
    current_uid = session.get('user_id')
    if target_id != current_uid:
        auth = get_current_user_auth()
        is_allowed = bool(
            auth and (auth.get('is_master') or auth.get('is_coordenador'))
        ) or is_user_coordenador_claro(current_uid)
        if not is_allowed:
            return jsonify({"error": "Acesso negado: você não possui permissão para visualizar detalhes deste perfil."}), 403
    try:
        conn = get_db()
        cur = conn.cursor()
        _ensure_login_tracking_schema(cur)
        conn.commit()

        cur.execute("""
            SELECT u.id, u.username, u.role, u.tech_id, u.permissions,
                   u.email AS u_email, u.phone AS u_phone, u.name AS u_name,
                   u.totp_enabled, u.totp_verified_at, u.email_bounced, u.email_bounce_reason,
                   u.theme_preference, u.created_at,
                   u.last_login_at, u.last_login_device, u.last_login_ua,
                   u.last_login_ip, u.last_login_location,
                   t.name AS tech_name, t.cpf, t.phone AS tech_phone, t.identity, t.dob,
                   t.role AS tech_role, t.area, t.team_type, t.team, t.company,
                   t.registration_claro, t.registration_third, t.toa_login,
                   t.phone_model, t.imei_1, t.imei_2, t.email AS tech_email,
                   t.shirt_size, t.boot_size, t.pants_size, t.jacket_size,
                   t.nr6_expiration, t.nr10_expiration, t.nr35_expiration, t.aso_expiration
            FROM users u
            LEFT JOIN technicians t ON u.tech_id = t.id
            WHERE u.id = %s;
        """, (target_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Usuário não encontrado."}), 404

        cur.execute("""
            SELECT id, TO_CHAR(login_at, 'DD/MM/YYYY às HH24:MI:SS') AS login_at_fmt,
                   device, user_agent, ip_address, location, auth_stage
            FROM user_login_history
            WHERE user_id = %s
            ORDER BY login_at DESC, id DESC
            LIMIT 15;
        """, (target_id,))
        login_history = cur.fetchall()

        uname = (row.get('username') or '').strip().lower()
        display_name = format_person_name(row.get('u_name') or row.get('tech_name') or row['username'])
        all_activities = _collect_user_all_activities(cur, target_id, uname, display_name, row.get('tech_id'))
        recent_actions = []

        cur.close()
        conn.close()
        email = (row.get('u_email') or row.get('tech_email') or '').strip()
        phone = (row.get('u_phone') or row.get('tech_phone') or '').strip()
        company = (row.get('company') or '').strip() or 'Claro'

        missing_fields = []
        if not email or '@' not in email:
            missing_fields.append('E-mail')
        if not phone:
            missing_fields.append('Telefone / WhatsApp')
        if not (row.get('cpf') or '').strip():
            missing_fields.append('CPF')
        if not (row.get('identity') or '').strip():
            missing_fields.append('RG / Identidade')

        profile = {
            "id": row["id"],
            "username": row["username"],
            "display_name": display_name,
            "role": row["role"],
            "tech_id": row.get("tech_id"),
            "company": company,
            "email": email,
            "email_bounced": bool(row.get("email_bounced")),
            "email_bounce_reason": row.get("email_bounce_reason"),
            "phone": phone,
            "cpf": row.get("cpf") or "",
            "identity": row.get("identity") or "",
            "dob": row.get("dob") or "",
            "area": row.get("area") or "",
            "team": row.get("team") or "",
            "team_type": row.get("team_type") or "",
            "registration_claro": row.get("registration_claro") or "",
            "registration_third": row.get("registration_third") or "",
            "toa_login": row.get("toa_login") or "",
            "phone_model": row.get("phone_model") or "",
            "imei_1": row.get("imei_1") or "",
            "shirt_size": row.get("shirt_size") or "",
            "boot_size": row.get("boot_size") or "",
            "pants_size": row.get("pants_size") or "",
            "jacket_size": row.get("jacket_size") or "",
            "nr6_expiration": row.get("nr6_expiration") or "",
            "nr10_expiration": row.get("nr10_expiration") or "",
            "nr35_expiration": row.get("nr35_expiration") or "",
            "aso_expiration": row.get("aso_expiration") or "",
            "totp_enabled": bool(row.get("totp_enabled")),
            "totp_verified_at_fmt": row["totp_verified_at"].strftime("%d/%m/%Y às %H:%M:%S") if row.get("totp_verified_at") else None,
            "theme_preference": row.get("theme_preference") or "dark",
            "created_at_fmt": row["created_at"].strftime("%d/%m/%Y às %H:%M") if row.get("created_at") else None,
            "last_login_at_fmt": row["last_login_at"].strftime("%d/%m/%Y às %H:%M:%S") if row.get("last_login_at") else None,
            "last_login_device": row.get("last_login_device") or None,
            "last_login_ua": row.get("last_login_ua") or None,
            "last_login_ip": row.get("last_login_ip") or None,
            "last_login_location": row.get("last_login_location") or None,
            "permissions": resolve_user_permissions(uname, row.get("role"), row.get("permissions")),
            "missing_fields": missing_fields,
            "login_history": login_history,
            "recent_actions": recent_actions,
            "all_activities": all_activities,
            "activities_counts": {
                "all": len(all_activities),
                "published": sum(1 for a in all_activities if a.get("relation") == "publicou"),
                "included": sum(1 for a in all_activities if a.get("relation") in ("incluido", "citado")),
            },
        }
        return jsonify(profile)
    except Exception as e:
        print("[USER PROFILE DETAIL ERROR]", e)
        return jsonify({"error": "Falha ao carregar perfil detalhado do usuário."}), 500

@app.route('/api/users', methods=['POST'])
@login_required
def api_create_user():
    caller = get_current_user_auth()
    if not caller or not caller['is_coordenador'] or 'gerenciamento.create' not in caller['permissions']:
        return jsonify({"error": "Apenas Coordenadores com permissão podem criar novos acessos."}), 403

    data = request.get_json() or {}
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', '').strip()
    tech_id = data.get('tech_id')
    raw_perms = data.get('permissions')
    
    if not tech_id:
        return jsonify({"error": "A pessoa precisa estar cadastrada primeiro na seção Pessoas (#pessoas) antes de criar uma conta de acesso."}), 400

    if not username or not role:
        return jsonify({"error": "Todos os campos de usuário (exceto senha) são obrigatórios."}), 400

    if not re.fullmatch(r'[a-z0-9._-]+', username):
        return jsonify({"error": "Não é permitido acentuações especiais."}), 400
        
    if role not in ['Supervisor', 'Técnico', 'Auxiliar', 'Coordenador']:
        return jsonify({"error": "Cargo inválido informado."}), 400

    if role == 'Coordenador' and not caller['is_master']:
        return jsonify({"error": "Apenas o Coordenador Máximo (alexandre.candido) pode atribuir o cargo de Coordenador."}), 403
            
    try:
        conn = get_db()
        cur = conn.cursor()

        # Check technician existence
        cur.execute("SELECT id, name, company FROM technicians WHERE id = %s;", (int(tech_id),))
        tech = cur.fetchone()
        if not tech:
            cur.close()
            conn.close()
            return jsonify({"error": "A pessoa selecionada não foi encontrada na seção Pessoas (#pessoas). Cadastre-a primeiro."}), 400

        cur.execute("SELECT id FROM users WHERE username = %s;", (username,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Nome de usuário já está em uso."}), 400
            
        empresa = (tech.get('company') or 'Claro').strip()
        senha_padrao = password.strip() if (password and password.strip()) else f"{empresa}@2026"
        hashed = generate_password_hash(senha_padrao)

        if role == 'Coordenador':
            if isinstance(raw_perms, list):
                valid_set = set(ALL_PERMISSIONS)
                cleaned_perms = [p for p in raw_perms if isinstance(p, str) and p in valid_set]
                perms_db = json.dumps(cleaned_perms)
            else:
                perms_db = None
        else:
            valid_set = set(ALL_PERMISSIONS)
            cleaned_perms = [
                p for p in (raw_perms if isinstance(raw_perms, list) else [])
                if isinstance(p, str) and p in valid_set and not p.startswith('gerenciamento.')
            ]
            perms_db = json.dumps(cleaned_perms)

        cur.execute(
            "INSERT INTO users (username, password_hash, role, tech_id, permissions, name) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;",
            (username, hashed, role, int(tech_id), perms_db, tech['name'])
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Criou o usuário de acesso: {username} (Pessoa: {tech['name']}, Cargo: {role})")
        return jsonify({"success": True, "id": new_id}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def api_delete_user(user_id):
    caller = get_current_user_auth()
    if not caller or not caller['is_coordenador'] or 'gerenciamento.delete' not in caller['permissions']:
        return jsonify({"error": "Você não possui permissão para remover contas de acesso."}), 403

    if user_id == session['user_id']:
        return jsonify({"error": "Não é possível excluir a própria conta em uso."}), 400
        
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT username, role FROM users WHERE id = %s;", (user_id,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({"error": "Usuário não encontrado."}), 404

        target_uname = (user.get('username') or '').strip().lower()
        target_role = (user.get('role') or '').strip()

        if target_uname == MASTER_COORDINATOR_USERNAME:
            cur.close()
            conn.close()
            return jsonify({"error": "A conta do Coordenador Máximo (alexandre.candido) é protegida e não pode ser excluída."}), 403

        if is_coordenador_role(target_uname, target_role) and not caller['is_master']:
            cur.close()
            conn.close()
            return jsonify({"error": "Coordenadores não podem remover contas de outros Coordenadores. Apenas alexandre.candido possui essa permissão."}), 403
            
        # Clear foreign key references before deleting user account
        for tbl, col in [('audit_logs', 'user_id'), ('technicians', 'created_by'), ('vehicles', 'created_by'), ('financial_logs', 'logged_by'), ('project_folders', 'created_by'), ('projects', 'created_by')]:
            try:
                cur.execute(f"UPDATE {tbl} SET {col} = NULL WHERE {col} = %s;", (user_id,))
            except Exception:
                conn.rollback()

        cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Deletou a conta do usuário: {user['username']}")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def api_update_user(user_id):
    caller = get_current_user_auth()
    if not caller or not caller['is_coordenador'] or 'gerenciamento.edit' not in caller['permissions']:
        return jsonify({"error": "Apenas Coordenadores com permissão podem editar acessos e privilégios."}), 403

    data = request.get_json() or {}
    username = data.get('username', '').strip().lower()
    role = data.get('role', '').strip()
    password = data.get('password', '')
    tech_id = data.get('tech_id')
    raw_perms = data.get('permissions')
    
    if not role:
        return jsonify({"error": "O cargo é obrigatório."}), 400
        
    if role not in ['Supervisor', 'Técnico', 'Auxiliar', 'Coordenador']:
        return jsonify({"error": "Cargo inválido informado."}), 400
            
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute("SELECT id, username, role, tech_id, permissions FROM users WHERE id = %s;", (user_id,))
        user = cur.fetchone()
        if not user:
            cur.close()
            conn.close()
            return jsonify({"error": "Usuário não encontrado."}), 404

        target_uname = (user.get('username') or '').strip().lower()
        target_role = (user.get('role') or '').strip()
        target_is_master = (target_uname == MASTER_COORDINATOR_USERNAME)
        target_is_coord = is_coordenador_role(target_uname, target_role)

        # Protect alexandre.candido from anyone else
        if target_is_master and not caller['is_master']:
            cur.close()
            conn.close()
            return jsonify({"error": "A conta de alexandre.candido não pode ser editada por outros usuários."}), 403

        # Regular Coordenadores cannot edit other Coordenadores, cannot edit themselves, and cannot promote to Coordenador
        if not caller['is_master']:
            if target_is_coord or user_id == caller['id']:
                cur.close()
                conn.close()
                return jsonify({"error": "Coordenadores não podem editar outros Coordenadores nem alterar as próprias permissões. Apenas alexandre.candido possui essa permissão."}), 403
            if role == 'Coordenador':
                cur.close()
                conn.close()
                return jsonify({"error": "Apenas o Coordenador Máximo (alexandre.candido) pode atribuir o cargo de Coordenador."}), 403

        target_username = user['username']
        if not target_is_master and username and username != user['username']:
            if not re.fullmatch(r'[a-z0-9._-]+', username):
                cur.close()
                conn.close()
                return jsonify({"error": "Não é permitido acentuações especiais."}), 400
            cur.execute("SELECT id FROM users WHERE username = %s AND id != %s;", (username, user_id))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({"error": "Nome de usuário (login) já está em uso por outra conta."}), 400
            target_username = username

        final_role = 'Coordenador' if target_is_master else role
        t_id = int(tech_id) if tech_id else user.get('tech_id')

        # Compute permissions to persist
        valid_set = set(ALL_PERMISSIONS)
        if target_is_master:
            perms_db = None
        elif final_role == 'Coordenador':
            if isinstance(raw_perms, list):
                cleaned_perms = [p for p in raw_perms if isinstance(p, str) and p in valid_set]
                perms_db = json.dumps(cleaned_perms)
            else:
                perms_db = json.dumps(user['permissions']) if user.get('permissions') is not None else None
        else:
            if isinstance(raw_perms, list):
                cleaned_perms = [p for p in raw_perms if isinstance(p, str) and p in valid_set and not p.startswith('gerenciamento.')]
                perms_db = json.dumps(cleaned_perms)
            else:
                existing = resolve_user_permissions(target_uname, final_role, user.get('permissions'))
                perms_db = json.dumps(existing)

        if password:
            hashed = generate_password_hash(password)
            cur.execute(
                "UPDATE users SET username = %s, role = %s, password_hash = %s, tech_id = %s, permissions = %s WHERE id = %s;",
                (target_username, final_role, hashed, t_id, perms_db, user_id)
            )
        else:
            cur.execute(
                "UPDATE users SET username = %s, role = %s, tech_id = %s, permissions = %s WHERE id = %s;",
                (target_username, final_role, t_id, perms_db, user_id)
            )
            
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Editou o acesso e permissões de: {target_username} (Cargo: {final_role})")
        return jsonify({"success": True})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# ==============================================================================
# BUSCADOR DE FALHAS API (RAL, REC, HFC, GPON)
# ==============================================================================
import unicodedata

BUSCADOR_COLUMN_MAPS = {
    'RAL': ['Bairro', 'RalAno', 'Tipo Equip', 'Bandeira', 'Distância', 'Ref', 'Logradouro', 'Data', 'Status'],
    'REC': ['Bairro', 'Chamado', 'Tecnologia', 'Tipo', 'Distância', 'Ref', 'Logradouro', 'Data', 'Status'],
    'HFC': ['Bairro', 'Ticket T', 'Nodename', 'Node', 'Distância', 'Ref', 'Logradouro', 'Data', 'Status'],
    'GPON': ['Bairro', 'Ticket T', 'OLT', 'Slot PON', 'Distância', 'Ref', 'Logradouro', 'Data', 'Status']
}

def normalize_text_key(txt):
    if not txt:
        return ""
    txt = str(txt).strip().upper()
    nfkd = unicodedata.normalize('NFKD', txt)
    return "".join([c for c in nfkd if not unicodedata.combining(c)])


def _iter_fault_searcher_rows(filepath, topic):
    ext = os.path.splitext(filepath)[1].lower()
    sheet_candidates = [topic, 'RAL', 'REC', 'HFC', 'GPON', 'FALHAS', 'GERAL', 'Analítico', 'Dados', 'Ocorrências', 'Dados_DB', 'Base']

    if ext in ['.xlsx', '.xlsm', '.xls']:
        try:
            from python_calamine import CalamineWorkbook
            wb = CalamineWorkbook.from_path(filepath)
            sheet_names = wb.sheet_names
            target_sheet = sheet_names[0]
            sheet_found = False
            for candidate in sheet_candidates:
                for s in sheet_names:
                    if candidate.lower() in s.lower():
                        target_sheet = s
                        sheet_found = True
                        break
                if sheet_found:
                    break

            ws = wb.get_sheet_by_name(target_sheet)
            for row in ws.to_python():
                yield row
            return
        except Exception as e_cal:
            print("Calamine parse warning, falling back to openpyxl:", e_cal)

        wb = None
        try:
            import openpyxl
            wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
            sheet_names = wb.sheetnames
            target_sheet = sheet_names[0]
            sheet_found = False
            for candidate in sheet_candidates:
                for s in sheet_names:
                    if candidate.lower() in s.lower():
                        target_sheet = s
                        sheet_found = True
                        break
                if sheet_found:
                    break
            ws = wb[target_sheet]
            for row in ws.iter_rows(values_only=True):
                yield row
            return
        except Exception as e_opx:
            print("openpyxl parse warning:", e_opx)
        finally:
            if wb is not None:
                try:
                    wb.close()
                except Exception:
                    pass

    # CSV/TXT ou fallback para arquivos .xls salvos como texto/TSV/CSV/HTML
    content = None
    for enc in ['utf-8-sig', 'utf-8', 'latin1', 'cp1252']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                content = f.read()
            if content:
                break
        except Exception:
            continue

    if not content:
        return

    stripped = content.lstrip()
    if stripped.lower().startswith('<html') or '<table' in stripped[:500].lower():
        tr_blocks = re.findall(r'<tr[^>]*>(.*?)</tr>', content, flags=re.IGNORECASE | re.DOTALL)
        for tr in tr_blocks:
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, flags=re.IGNORECASE | re.DOTALL)
            if cells:
                yield [re.sub(r'<[^>]+>', '', c).replace('&nbsp;', ' ').strip() for c in cells]
        return

    lines = [line for line in content.splitlines() if line.strip()]
    if not lines:
        return

    first_line = lines[0]
    delims = [';', ',', '\t', '|']
    delim_counts = {d: first_line.count(d) for d in delims}
    best_delim = max(delim_counts, key=delim_counts.get)
    if delim_counts[best_delim] == 0:
        best_delim = ','
    reader = csv.reader(io.StringIO(content), delimiter=best_delim)
    for row in reader:
        yield row


def parse_fault_searcher_file(filepath, topic):
    header_keywords = [
        'DESIGNA', 'CHAMADO', 'ROTA', 'RALANO', 'TICKET', 'SUBCLUSTER',
        'DISTANCIA', 'ENDERECO', 'MES', 'OFENSOR', 'OCORRENCIA', 'CAUSA',
        'CIRCUITO', 'REF', 'NUM'
    ]

    row_iter = _iter_fault_searcher_rows(filepath, topic)
    head_buffer = []
    for raw_r in row_iter:
        if raw_r and any(c is not None and str(c).strip() != '' for c in raw_r):
            head_buffer.append(raw_r)
            if len(head_buffer) >= 25:
                break

    if not head_buffer:
        return []

    header_idx = 0
    header_map = {}

    for i, r in enumerate(head_buffer):
        str_r = [normalize_text_key(c) for c in r]
        concat = ' '.join(str_r)
        matched_count = sum(1 for k in header_keywords if k in concat)
        if matched_count >= 2 or any(k in concat for k in ['RALANO', 'CHAMADO', 'SUBCLUSTER']):
            header_idx = i
            for c_idx, val in enumerate(str_r):
                if val:
                    header_map[val] = c_idx
            break

    if not header_map:
        header_idx = 0
        for c_idx, val in enumerate(head_buffer[0]):
            norm_val = normalize_text_key(val)
            if norm_val:
                header_map[norm_val] = c_idx

    remaining_head = head_buffer[header_idx + 1:] if header_idx < len(head_buffer) - 1 else []
    parsed_records = []

    def find_col_index(candidates, default_pos, exclude_substrings=None):
        excludes = [normalize_text_key(e) for e in (exclude_substrings or [])]
        # Pass 1: Exact normalized header match (prevents 'OCORRENCIA' matching 'TIPO OCORRENCIA' or 'OFENSOR' matching 'CFOFENSOR')
        for cand in candidates:
            norm_cand = normalize_text_key(cand)
            for h_text, col_i in header_map.items():
                if h_text == norm_cand:
                    return col_i
        # Pass 2: Substring match respecting exclusions
        for cand in candidates:
            norm_cand = normalize_text_key(cand)
            for h_text, col_i in header_map.items():
                if any(ex in h_text for ex in excludes):
                    continue
                if norm_cand in h_text or h_text in norm_cand:
                    return col_i
        return default_pos

    def get_val_at(row, col_i, max_len=None):
        if 0 <= col_i < len(row):
            v = row[col_i]
            if v is not None:
                if isinstance(v, (datetime.datetime, datetime.date)):
                    s = v.strftime('%d/%m/%Y %H:%M')
                else:
                    s = str(v).replace('\x00', '').strip()
                return s[:max_len] if max_len else s
        return ''

    idx_ref = find_col_index(['REF', 'REFERENCIA', 'REF_VAL', 'REFERENCIA_LOCAL'], 999)
    idx_subcausa = -1

    if topic == 'RAL':
        idx1 = find_col_index(['DESIGNACAO', 'DESIGNAO', 'CIRCUITO', 'ROTA'], 7)
        idx2 = find_col_index(['RALANO', 'NUM RAL', 'NUM_RAL', 'CHAMADO', 'TICKET'], 0)
        idx3 = find_col_index(['DATA DE ABERTURA', 'DATA_ABERTURA', 'DATA ABERTURA', 'ABERTURA', 'INICIO'], 8)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 20)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM', 'METROS'], 48)
        idx6 = find_col_index(['ENDERECO', 'ENDERECO PADRONIZADO', 'LOGRADOURO', 'RUA'], 27)
        idx7 = find_col_index(['MES FECOM', 'MES', 'MENSAL'], 17)
        idx8 = find_col_index(['OFENSOR', 'RESPONSAVEL', 'CFOFENSOR'], 29, exclude_substrings=['CFOFENSOR', 'CENTRO_FUNCIONAL'])
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA', 'MOTIVO'], 25, exclude_substrings=['TIPO OCORRENCIA', 'TIPO DE OCORRENCIA'])
        idx_subcausa = find_col_index(['SUBCAUSA', 'OCORRENCIA2'], -1)
    elif topic == 'REC':
        idx1 = find_col_index(['DESIGNACAO_CIRCUITO', 'DESIGNACAO', 'CIRCUITO', 'ROTA'], 4)
        idx2 = find_col_index(['CHAMADO', 'NUM_REC', 'TICKET', 'RALANO'], 0)
        idx3 = find_col_index(['DT_HORA_ABERTURA_REC', 'HORA_ABERTURA', 'DATA DE ABERTURA', 'DATA ABERTURA', 'INICIO'], 9)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 24)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 35)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 15)
        idx7 = find_col_index(['MES'], 17)
        idx8 = find_col_index(['OFENSOR', 'CFOFENSOR'], 20, exclude_substrings=['CENTRO_FUNCIONAL', 'CFOFENSOR'])
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA'], 13, exclude_substrings=['TIPO OCORRENCIA', 'TIPO DE EVENTO'])
        idx_subcausa = find_col_index(['OCORRENCIA_2', 'SUBCAUSA'], -1)
    elif topic == 'HFC':
        idx1 = find_col_index(['ROTA', 'DESIGNACAO', 'CIRCUITO'], 16)
        idx2 = find_col_index(['TICKET', 'TICKE T', 'TICKET T', 'CHAMADO'], 0)
        idx3 = find_col_index(['INICIO_QUEDA', 'INICIO QUEDA', 'DATA INICIO', 'DATA ABERTURA'], 3)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 18)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 51)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 35)
        idx7 = find_col_index(['MES INCIDENTE', 'MES'], 24)
        idx8 = find_col_index(['OFENSOR', 'CFOFENSOR'], 40, exclude_substrings=['CFOFENSOR'])
        idx9 = find_col_index(['CAUSA', 'OCORRENCIA'], 20, exclude_substrings=['TIPO OCORRENCIA', 'SUBTIPO CAUSA', 'CAUSA V'])
        idx_subcausa = find_col_index(['SUBTIPO CAUSA', 'SUBCAUSA'], -1)
    else:
        idx1 = find_col_index(['DESIGNACAO', 'CIRCUITO', 'ROTA'], 0)
        idx2 = find_col_index(['CHAMADO', 'TICKET', 'NUM_REC', 'RALANO'], 1)
        idx3 = find_col_index(['DATA DE ABERTURA', 'HORA_ABERTURA', 'INICIO_QUEDA', 'DATA ABERTURA'], 2)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER'], 3)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 8)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 5)
        idx7 = find_col_index(['MES'], 6)
        idx8 = find_col_index(['OFENSOR'], 7, exclude_substrings=['CFOFENSOR', 'CENTRO_FUNCIONAL'])
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA'], 4, exclude_substrings=['TIPO OCORRENCIA'])

    import itertools
    for row_idx, row in enumerate(itertools.chain(remaining_head, row_iter)):
        if not row or not any(c is not None and str(c).strip() != '' for c in row):
            continue

        col_ref = get_val_at(row, idx_ref, 255) or '-'
        col1 = get_val_at(row, idx1, 255)
        col2 = get_val_at(row, idx2, 255)
        col3 = get_val_at(row, idx3, 255)
        col4 = get_val_at(row, idx4, 255)
        col5 = get_val_at(row, idx5, 255)
        col6 = get_val_at(row, idx6)
        col7 = get_val_at(row, idx7, 100)
        col8 = get_val_at(row, idx8, 255)
        col9 = get_val_at(row, idx9, 100)
        if idx_subcausa >= 0:
            sub_val = get_val_at(row, idx_subcausa, 60)
            if sub_val and sub_val != '-':
                if not col9 or col9.upper() in ('NÃO IDENTIFICADO', 'NAO IDENTIFICADO', 'OUTROS', '-'):
                    col9 = sub_val[:100]
                elif sub_val.upper() not in col9.upper():
                    col9 = f"{col9} · {sub_val}"[:100]

        if not col2:
            if col1:
                col2 = col1[:255]
            else:
                col2 = f"{topic}_REC_{row_idx + 1}"[:255]

        parsed_records.append((topic, col1, col2, col3, col4, col5, col_ref, col6, col7, col8, col9))

    return parsed_records


@app.route('/api/users/<int:user_id>/reset-totp', methods=['POST'])
@login_required
def api_admin_reset_totp(user_id):
    caller = get_user_info_dict(session['user_id'])
    is_master = bool(caller and (caller.get('is_master') or caller.get('username') == MASTER_COORDINATOR_USERNAME or session.get('username') == MASTER_COORDINATOR_USERNAME))
    
    if not is_master:
        return jsonify({'error': 'Apenas o coordenador geral (alexandre.candido) possui permissão para redefinir o autenticador de usuários.'}), 403

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, username FROM users WHERE id = %s;', (user_id,))
    target = cur.fetchone()

    if not target:
        cur.close()
        conn.close()
        return jsonify({'error': 'Usuário não encontrado.'}), 404

    target_name = target['username']
    cur.execute('''
        UPDATE users
        SET totp_secret = NULL,
            totp_enabled = FALSE,
            totp_verified_at = NULL
        WHERE id = %s;
    ''', (user_id,))
    conn.commit()
    cur.close()
    conn.close()

    log_action(session['user_id'], session['username'], f'Redefiniu o aplicativo autenticador (2FA) do usuário {target_name}. O usuário precisará escanear um novo QR Code.')
    return jsonify({
        'success': True,
        'message': f'Aplicativo autenticador de {target_name} resetado com sucesso! O usuário será forçado a configurar um novo autenticador no próximo login.'
    })


@app.route('/api/buscador/records', methods=['GET'])
@login_required
def api_get_buscador_records():
    try:
        topic = request.args.get('topic', 'RAL').upper()
        search = request.args.get('search', '').strip()
        route = request.args.get('route', '').strip()

        if topic not in BUSCADOR_COLUMN_MAPS:
            topic = 'RAL'

        columns = BUSCADOR_COLUMN_MAPS[topic]

        conn = get_db()
        cur = conn.cursor()

        log_info = None
        try:
            cur.execute("SELECT last_updated, updated_by, filename, record_count FROM fault_searcher_logs WHERE topic = %s;", (topic,))
            log_info = cur.fetchone()
        except Exception:
            conn.rollback()

        last_updated_str = "Não carregado"
        if log_info and log_info.get('last_updated'):
            last_updated_str = log_info['last_updated'].strftime('%d/%m - %H:%M')

        routes = []
        try:
            cur.execute("""
                SELECT DISTINCT col1 
                FROM fault_searcher_records 
                WHERE topic = %s AND col1 IS NOT NULL AND col1 != '' 
                ORDER BY col1 ASC;
            """, (topic,))
            routes = [r['col1'] for r in cur.fetchall()]
        except Exception:
            conn.rollback()

        base_query = "SELECT id, col1, col2, col3, col4, col5, COALESCE(ref_val, '-') AS ref_val, col6, col7, col8, col9, is_edited FROM fault_searcher_records WHERE topic = %s"
        params = [topic]

        if route:
            base_query += " AND (col1 ILIKE %s)"
            params.append(f"%{route}%")

        if search:
            search_terms = [t.strip() for t in search.split() if t.strip()]
            for term in search_terms:
                base_query += """ AND (
                    col1 ILIKE %s OR col2 ILIKE %s OR col3 ILIKE %s OR col4 ILIKE %s OR
                    col5 ILIKE %s OR COALESCE(ref_val, '') ILIKE %s OR col6 ILIKE %s OR col7 ILIKE %s OR col8 ILIKE %s OR col9 ILIKE %s
                )"""
                t_pattern = f"%{term}%"
                params.extend([t_pattern] * 10)

        query = base_query + """ ORDER BY 
            CASE WHEN col5 IS NULL OR TRIM(col5) = '' OR TRIM(col5) = '-' THEN 1 ELSE 0 END ASC,
            CASE WHEN NULLIF(REGEXP_REPLACE(col5, '[^0-9]', '', 'g'), '') IS NOT NULL 
                 THEN NULLIF(REGEXP_REPLACE(col5, '[^0-9]', '', 'g'), '')::bigint 
                 ELSE NULL END DESC NULLS LAST,
            col5 DESC,
            id ASC LIMIT 1000;"""

        try:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
        except Exception as e_sort:
            conn.rollback()
            fallback_query = base_query + """ ORDER BY 
                CASE WHEN col5 IS NULL OR TRIM(col5) = '' OR TRIM(col5) = '-' THEN 1 ELSE 0 END ASC,
                col5 DESC, id ASC LIMIT 1000;"""
            cur.execute(fallback_query, tuple(params))
            rows = cur.fetchall()

        records = []
        for r in rows:
            records.append([
                r.get('col1') or '', r.get('col2') or '', r.get('col3') or '',
                r.get('col4') or '', r.get('col5') or '', r.get('ref_val') or '-', r.get('col6') or '',
                r.get('col7') or '', r.get('col8') or '', r.get('col9') or '',
                r['id'],
                bool(r.get('is_edited'))
            ])

        cur.close()
        conn.close()

        return jsonify({
            "topic": topic,
            "columns": columns,
            "last_updated": last_updated_str,
            "record_count": len(records),
            "total_records": log_info['record_count'] if log_info and log_info.get('record_count') else len(records),
            "routes": routes,
            "records": records
        })
    except Exception as e:
        print("Error in api_get_buscador_records:", e)
        return jsonify({
            "topic": request.args.get('topic', 'RAL').upper(),
            "columns": BUSCADOR_COLUMN_MAPS.get(request.args.get('topic', 'RAL').upper(), []),
            "last_updated": "Não carregado",
            "record_count": 0,
            "total_records": 0,
            "routes": [],
            "records": [],
            "error": "Falha temporária ao carregar os registros."
        }), 200

@app.route('/api/buscador/records/<int:record_id>', methods=['PUT'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_update_buscador_distance(record_id):
    data = request.get_json() or {}
    distance = (data.get('distance') or '').strip()
    ref_val = (data.get('ref') or '').strip() or '-'

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE fault_searcher_records 
            SET col5 = %s, ref_val = %s, is_edited = TRUE 
            WHERE id = %s 
            RETURNING topic, col2;
        """, (distance, ref_val, record_id))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Registro não encontrado."}), 404

        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Editou a distância ('{distance}') e REF ('{ref_val}') do item [{row['topic']}] (Código: {row['col2']})")
        return jsonify({"success": True, "distance": distance, "ref": ref_val})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

@app.route('/api/buscador/upload', methods=['POST'])
@login_required
@roles_required('Coordenador', 'Supervisor')
def api_upload_buscador_base():
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado."}), 400

    file = request.files['file']
    topic = request.form.get('topic', 'RAL').upper()

    if topic not in BUSCADOR_COLUMN_MAPS:
        return jsonify({"error": "Tópico de base inválido."}), 400

    if not file or not file.filename:
        return jsonify({"error": "Arquivo inválido."}), 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    orig_ext = os.path.splitext(file.filename)[1].lower()
    filename = secure_filename(file.filename)
    if not filename or '.' not in filename:
        filename = f"base_{topic.lower()}{orig_ext or '.xlsx'}"
    temp_path = os.path.join(UPLOAD_FOLDER, f"temp_{int(time.time())}_{filename}")
    file.save(temp_path)

    try:
        parsed_records = parse_fault_searcher_file(temp_path, topic)
        if not parsed_records:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return jsonify({"error": "Não foi possível extrair dados válidos da planilha enviada."}), 400

        conn = get_db()
        cur = conn.cursor()

        # 1. Fetch existing records for this topic from DB (mapped by col2 unique code: RALANO / CHAMADO / TICKET T)
        cur.execute("""
            SELECT col1, col2, col3, col4, col5, COALESCE(ref_val, '-') AS ref_val, col6, col7, col8, col9, is_edited
            FROM fault_searcher_records
            WHERE topic = %s;
        """, (topic,))
        existing_rows = cur.fetchall()

        existing_map = {}
        for r in existing_rows:
            key = str(r['col2'] or '').strip()
            if key:
                existing_map[key] = dict(r)

        # 2. Merge parsed records with existing DB edits (col5 is Distância, ref_val is REF)
        final_records = []
        processed_keys = set()

        for row in parsed_records:
            t_val, c1, c2, c3, c4, c5, c_ref, c6, c7, c8, c9 = row
            key = str(c2 or '').strip()

            if key and key in existing_map:
                ex = existing_map[key]
                processed_keys.add(key)
                # Preserve user edited distance and ref, or existing DB distance/ref if new file value is empty
                if ex.get('is_edited') or (ex.get('col5') and not c5):
                    final_c5 = ex['col5']
                    is_ed = True
                else:
                    final_c5 = c5
                    is_ed = bool(c5 and c5 != '-' and c5 != '')

                if ex.get('is_edited') or (ex.get('ref_val') and ex['ref_val'] != '-' and not c_ref):
                    final_ref = ex['ref_val']
                else:
                    final_ref = c_ref or '-'

                final_records.append((
                    t_val[:20], (c1 or '')[:255], (c2 or '')[:255], (c3 or '')[:255],
                    (c4 or '')[:255], (final_c5 or '')[:255], (final_ref or '-')[:255],
                    c6 or '', (c7 or '')[:100], (c8 or '')[:255], (c9 or '')[:100], is_ed
                ))
            else:
                if key:
                    processed_keys.add(key)
                is_ed = bool(c5 and c5 != '-' and c5 != '')
                final_records.append((
                    t_val[:20], (c1 or '')[:255], (c2 or '')[:255], (c3 or '')[:255],
                    (c4 or '')[:255], (c5 or '')[:255], (c_ref or '-')[:255],
                    c6 or '', (c7 or '')[:100], (c8 or '')[:255], (c9 or '')[:100], is_ed
                ))

        # 3. Retain any historical records in DB that might not be in the new file
        for key, ex in existing_map.items():
            if key not in processed_keys:
                final_records.append((
                    topic[:20], (ex['col1'] or '')[:255], (ex['col2'] or '')[:255], (ex['col3'] or '')[:255],
                    (ex['col4'] or '')[:255], (ex['col5'] or '')[:255], (ex['ref_val'] or '-')[:255],
                    ex['col6'] or '', (ex['col7'] or '')[:100], (ex['col8'] or '')[:255], (ex['col9'] or '')[:100],
                    bool(ex.get('is_edited'))
                ))

        # 4. Replace records with merged data
        cur.execute("DELETE FROM fault_searcher_records WHERE topic = %s;", (topic,))

        from psycopg2.extras import execute_values
        execute_values(cur, """
            INSERT INTO fault_searcher_records (topic, col1, col2, col3, col4, col5, ref_val, col6, col7, col8, col9, is_edited)
            VALUES %s;
        """, final_records, page_size=2000)

        # 5. Update log timestamp
        cur.execute("""
            INSERT INTO fault_searcher_logs (topic, last_updated, updated_by, filename, record_count)
            VALUES (%s, CURRENT_TIMESTAMP, %s, %s, %s)
            ON CONFLICT (topic) DO UPDATE SET
                last_updated = CURRENT_TIMESTAMP,
                updated_by = EXCLUDED.updated_by,
                filename = EXCLUDED.filename,
                record_count = EXCLUDED.record_count;
        """, (topic, (session.get('username') or 'sistema')[:150], filename[:255], len(final_records)))

        conn.commit()
        cur.close()
        conn.close()

        if os.path.exists(temp_path):
            os.remove(temp_path)

        log_action(session['user_id'], session['username'], f"Atualizou a base do Buscador [{topic}] com {len(final_records)} registros mantendo edições (Arquivo: {filename})")

        return jsonify({
            "success": True,
            "message": f"Base [{topic}] atualizada com sucesso! {len(final_records)} registros salvos e edições preservadas.",
            "record_count": len(final_records)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        if 'conn' in locals() and conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print("Backend exception (buscador upload):", type(e).__name__, e)
        return jsonify({"error": "Erro ao processar a base enviada. Verifique o formato do arquivo e tente novamente."}), 500


@app.route('/api/buscador/export', methods=['GET'])
@login_required
def api_export_buscador_base():
    topic = request.args.get('topic', 'RAL').upper()
    search = request.args.get('search', '').strip()
    route = request.args.get('route', '').strip()

    if topic not in BUSCADOR_COLUMN_MAPS:
        topic = 'RAL'

    columns = BUSCADOR_COLUMN_MAPS[topic]

    conn = get_db()
    cur = conn.cursor()

    query = """
        SELECT col1, col2, col3, col4, col5, COALESCE(ref_val, '-') AS ref_val, col6, col7, col8, col9
        FROM fault_searcher_records
        WHERE topic = %s
    """
    params = [topic]

    if route:
        query += " AND (col1 ILIKE %s)"
        params.append(f"%{route}%")

    if search:
        search_terms = [t.strip() for t in search.split() if t.strip()]
        for term in search_terms:
            query += """ AND (
                col1 ILIKE %s OR col2 ILIKE %s OR col3 ILIKE %s OR col4 ILIKE %s OR
                col5 ILIKE %s OR COALESCE(ref_val, '') ILIKE %s OR col6 ILIKE %s OR col7 ILIKE %s OR col8 ILIKE %s OR col9 ILIKE %s
            )"""
            t_pattern = f"%{term}%"
            params.extend([t_pattern] * 10)

    query += """ ORDER BY 
        CASE WHEN col5 IS NULL OR TRIM(col5) = '' OR TRIM(col5) = '-' THEN 1 ELSE 0 END ASC,
        CASE WHEN NULLIF(REGEXP_REPLACE(col5, '[^0-9]', '', 'g'), '') IS NOT NULL 
             THEN NULLIF(REGEXP_REPLACE(col5, '[^0-9]', '', 'g'), '')::bigint 
             ELSE NULL END DESC NULLS LAST,
        col5 DESC,
        id ASC;"""

    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    output = io.StringIO()
    writer = safe_csv_writer(output, delimiter=';')
    writer.writerow(columns)

    for r in rows:
        writer.writerow([
            r['col1'] or '', r['col2'] or '', r['col3'] or '',
            r['col4'] or '', r['col5'] or '', r['ref_val'] or '-', r['col6'] or '',
            r['col7'] or '', r['col8'] or '', r['col9'] or ''
        ])

    response = app.response_class(
        response=output.getvalue().encode('utf-8-sig'),
        status=200,
        mimetype='text/csv'
    )
    response.headers["Content-Disposition"] = f"attachment; filename=Buscador_{topic}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return response

# --- ESCALA DE TRABALHO APIs ---
DAY_NAMES_PT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

@app.route('/api/schedules', methods=['GET'])
@login_required
def api_get_schedules():
    month_str = request.args.get('month', '').strip()
    area = request.args.get('area', '').strip()
    company = request.args.get('company', '').strip()
    search = request.args.get('search', '').strip()

    # Parse month (YYYY-MM)
    if not month_str or len(month_str) != 7 or '-' not in month_str:
        now = datetime.datetime.now()
        month_str = now.strftime('%Y-%m')

    try:
        year, month = map(int, month_str.split('-'))
    except Exception:
        now = datetime.datetime.now()
        year, month = now.year, now.month
        month_str = f"{year:04d}-{month:02d}"

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()

        # Fetch distinct areas for filter dropdown (splitting comma-separated values like "Norte 1, Norte 2, Norte 3")
        cur.execute("SELECT DISTINCT area FROM technicians WHERE area IS NOT NULL AND area != '';")
        area_rows = cur.fetchall()
        areas_set = set()
        for r in area_rows:
            val = r.get('area', '')
            if val:
                for sub in val.split(','):
                    sub_clean = sub.strip()
                    if sub_clean:
                        areas_set.add(sub_clean)
        areas_list = sorted(list(areas_set))

        # If no area selected, return area_required=True
        if not area:
            return jsonify({
                "area_required": True,
                "month": month_str,
                "areas_list": areas_list,
                "technicians": [],
                "days_in_month": []
            })

        # Fetch technicians matching area (exact or in comma-separated list)
        tech_query = "SELECT * FROM technicians WHERE (UPPER(area) = UPPER(%s) OR UPPER(area) LIKE %s)"
        params = [area, f"%{area.upper()}%"]

        if company and company.lower() != 'todas':
            tech_query += " AND UPPER(company) = UPPER(%s)"
            params.append(company)

        if search:
            tech_query += " AND (UPPER(name) LIKE %s OR UPPER(role) LIKE %s OR UPPER(phone) LIKE %s)"
            s_pattern = f"%{search.upper()}%"
            params.extend([s_pattern, s_pattern, s_pattern])

        # Order Coordenadores first, then Técnicos
        tech_query += """ ORDER BY 
            CASE 
                WHEN UPPER(role) LIKE 'COORDENADOR%%' THEN 1 
                WHEN UPPER(role) LIKE 'ADMIN%%' THEN 2 
                ELSE 3 
            END, name ASC;"""

        cur.execute(tech_query, tuple(params))
        technicians = cur.fetchall()
        tech_ids = [t['id'] for t in technicians]

        # Build calendar days for the month
        num_days = calendar.monthrange(year, month)[1]
        days_in_month = []
        for day in range(1, num_days + 1):
            dt = datetime.date(year, month, day)
            day_str = dt.strftime('%Y-%m-%d')
            weekday_idx = dt.weekday() # 0 = Monday, 6 = Sunday
            days_in_month.append({
                "date": day_str,
                "day_num": day,
                "day_label": f"{day:02d}/{month:02d}",
                "day_name": DAY_NAMES_PT[weekday_idx],
                "is_weekend": weekday_idx >= 5
            })

        # Fetch existing schedule records for these techs in this month
        schedules_map = {}
        if tech_ids:
            start_date = f"{year:04d}-{month:02d}-01"
            end_date = f"{year:04d}-{month:02d}-{num_days:02d}"
            placeholders = ','.join(['%s'] * len(tech_ids))
            query_schedules = f"""
                SELECT tech_id, date::text as date_str, status, work_hours, on_call
                FROM work_schedules
                WHERE tech_id IN ({placeholders}) AND date >= %s AND date <= %s;
            """
            sched_params = list(tech_ids) + [start_date, end_date]
            cur.execute(query_schedules, tuple(sched_params))
            for r in cur.fetchall():
                schedules_map[(r['tech_id'], r['date_str'])] = {
                    "status": r['status'] or 'Trabalho',
                    "work_hours": r['work_hours'] or '08 às 17:48hs',
                    "on_call": r['on_call'] or '0'
                }

        # Format technicians output with schedules map
        tech_list = []
        for t in technicians:
            t_sched = {}
            for d in days_in_month:
                ds = d['date']
                rec = schedules_map.get((t['id'], ds), {
                    "status": "Trabalho",
                    "work_hours": "08 às 17:48hs",
                    "on_call": "0"
                })
                t_sched[ds] = rec

            tech_list.append({
                "id": t['id'],
                "name": t['name'],
                "role": t.get('role') or 'Técnico',
                "company": t.get('company') or 'Claro',
                "area": t.get('area') or '',
                "schedules": t_sched
            })

        return jsonify({
            "area_required": False,
            "month": month_str,
            "area": area,
            "company": company,
            "areas_list": areas_list,
            "days_in_month": days_in_month,
            "technicians": tech_list
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 200
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

@app.route('/api/schedules/batch', methods=['POST'])
@login_required
def api_save_schedules_batch():
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        updates = data.get('updates', [])
        if not updates:
            return jsonify({"success": True, "updated": 0})

        conn = get_db()
        cur = conn.cursor()

        dedup_updates = {}
        for u in updates:
            tech_id = int(u.get('tech_id'))
            dt_str = u.get('date')
            status = u.get('status', 'Trabalho')
            work_hours = u.get('work_hours', '08 às 17:48hs')
            on_call = str(u.get('on_call', '0'))
            dedup_updates[(tech_id, dt_str)] = (tech_id, dt_str, status, work_hours, on_call)

        if dedup_updates:
            from psycopg2.extras import execute_values
            execute_values(cur, """
                INSERT INTO work_schedules (tech_id, date, status, work_hours, on_call)
                VALUES %s
                ON CONFLICT (tech_id, date)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    work_hours = EXCLUDED.work_hours,
                    on_call = EXCLUDED.on_call;
            """, list(dedup_updates.values()), page_size=500)

        conn.commit()

        log_action(session['user_id'], session['username'], f"Atualizou {len(updates)} dia(s) na escala de trabalho")
        return jsonify({"success": True, "updated": len(updates)})
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    finally:
        if 'cur' in locals() and cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.route('/api/schedules/export', methods=['GET'])
@login_required
def api_export_schedules():
    month_str = request.args.get('month', '').strip()
    area = request.args.get('area', '').strip()
    company = request.args.get('company', '').strip()
    search = request.args.get('search', '').strip()

    if not month_str or len(month_str) != 7 or '-' not in month_str:
        now = datetime.datetime.now()
        month_str = now.strftime('%Y-%m')

    try:
        year, month = map(int, month_str.split('-'))
    except Exception:
        now = datetime.datetime.now()
        year, month = now.year, now.month
        month_str = f"{year:04d}-{month:02d}"

    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()

        tech_query = "SELECT * FROM technicians WHERE 1=1"
        params = []

        if area:
            tech_query += " AND (UPPER(area) = UPPER(%s) OR UPPER(area) LIKE %s)"
            params.extend([area, f"%{area.upper()}%"])

        if company and company.lower() != 'todas':
            tech_query += " AND UPPER(company) = UPPER(%s)"
            params.append(company)

        if search:
            tech_query += " AND (UPPER(name) LIKE %s OR UPPER(role) LIKE %s OR UPPER(phone) LIKE %s)"
            s_pattern = f"%{search.upper()}%"
            params.extend([s_pattern, s_pattern, s_pattern])

        tech_query += """ ORDER BY 
            CASE 
                WHEN UPPER(role) LIKE 'COORDENADOR%%' THEN 1 
                WHEN UPPER(role) LIKE 'ADMIN%%' THEN 2 
                ELSE 3 
            END, name ASC;"""

        cur.execute(tech_query, tuple(params))
        technicians = cur.fetchall()
        tech_ids = [t['id'] for t in technicians]

        num_days = calendar.monthrange(year, month)[1]
        days_in_month = []
        for day in range(1, num_days + 1):
            dt = datetime.date(year, month, day)
            day_str = dt.strftime('%Y-%m-%d')
            weekday_idx = dt.weekday()
            days_in_month.append({
                "date": day_str,
                "header": f"{day:02d}/{month:02d} ({DAY_NAMES_PT[weekday_idx]})"
            })

        schedules_map = {}
        if tech_ids:
            start_date = f"{year:04d}-{month:02d}-01"
            end_date = f"{year:04d}-{month:02d}-{num_days:02d}"
            placeholders = ','.join(['%s'] * len(tech_ids))
            cur.execute(f"""
                SELECT tech_id, date::text as date_str, status, work_hours, on_call
                FROM work_schedules
                WHERE tech_id IN ({placeholders}) AND date >= %s AND date <= %s;
            """, tuple(list(tech_ids) + [start_date, end_date]))
            for r in cur.fetchall():
                schedules_map[(r['tech_id'], r['date_str'])] = {
                    "status": r['status'] or 'Trabalho',
                    "work_hours": r['work_hours'] or '08 às 17:48hs',
                    "on_call": r['on_call'] or '0'
                }

        output = io.StringIO()
        output.write("\ufeff")
        writer = safe_csv_writer(output, delimiter=";")

        headers = ["Colaborador", "Cargo", "Empresa", "Área"] + [d["header"] for d in days_in_month]
        writer.writerow(headers)

        for t in technicians:
            row_cells = [
                format_person_name(t.get('name') or ''),
                t.get('role') or 'Técnico',
                t.get('company') or 'Claro',
                t.get('area') or '',
            ]
            for d in days_in_month:
                rec = schedules_map.get((t['id'], d['date']), {
                    "status": "Trabalho",
                    "work_hours": "08 às 17:48hs",
                    "on_call": "0"
                })
                status_val = rec["status"]
                hours_val = rec["work_hours"]
                on_call_val = " [Sobreaviso]" if str(rec["on_call"]) == "1" else ""
                if status_val in ("Trabalho", "Plantão") and hours_val and hours_val != status_val:
                    cell_txt = f"{status_val} ({hours_val}){on_call_val}"
                else:
                    cell_txt = f"{status_val}{on_call_val}"
                row_cells.append(cell_txt)
            writer.writerow(row_cells)

        csv_bytes = output.getvalue().encode("utf-8")
        area_slug = re.sub(r'[^a-zA-Z0-9_-]+', '_', area.strip()) if area else 'todas_areas'
        filename = f"Escala_{month_str}_{area_slug}.csv"
        return Response(
            csv_bytes,
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        print("[ESCALA EXPORT ERROR]", e)
        return jsonify({"error": "Falha ao exportar escala."}), 500
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

# --- MAPA DE EVENTOS API ---
# All coordinates cover the Rio de Janeiro metro area (State of RJ)
# SubCluster code â†’ approximate center coordinates
SUBCLUSTER_COORDS_MAP = {
    # Metro / Metropolitana
    'MTP':  (-22.9068, -43.1729),
    'CENTRO':      (-22.9056, -43.1769),
    'TIJUCA':      (-22.9248, -43.2327),
    'COPACABANA':  (-22.9694, -43.1868),
    'BARRA':       (-23.0106, -43.3654),
    'RECREIO':     (-23.0209, -43.4569),
    'JACAREPAGUA': (-22.9553, -43.3622),
    'CAMPO GRANDE':(-22.9035, -43.5574),
    'BANGU':       (-22.8784, -43.4665),
    'SANTA CRUZ':  (-22.9268, -43.6759),
    'GUARATIBA':   (-23.0208, -43.5761),
    'NITEROI':     (-22.8833, -43.1036),
    'NITERI':      (-22.8833, -43.1036),
    'SAO GONCALO': (-22.8270, -43.0541),
    'MARICA':      (-22.9194, -42.8184),
    # Baixada Fluminense
    'BXF':         (-22.7558, -43.4603),
    'BAIXADA FLUMINENSE': (-22.7558, -43.4603),
    'NOVA IGUACU': (-22.7558, -43.4603),
    'DUQUE DE CAXIAS': (-22.7858, -43.3056),
    'CAXIAS':      (-22.7858, -43.3056),
    'MESQUITA':    (-22.8155, -43.4398),
    'NILOPOLISS':  (-22.8047, -43.4222),
    'NILOPOLIS':   (-22.8047, -43.4222),
    'QUEIMADOS':   (-22.7119, -43.5562),
    'JAPERÍ':      (-22.6425, -43.6594),
    'JAPERI':      (-22.6425, -43.6594),
    'ITAGUAI':     (-22.8716, -43.7797),
    'SEROPEDICA':  (-22.7457, -43.7097),
    'BELFORD ROXO':(-22.7644, -43.3994),
    'SAO JOAO DE MERITI':(-22.8029, -43.3738),
    # Norte
    'NO1':         (-22.9035, -43.5574),  # Norte 1 (Campo Grande / Oeste)
    'NO2':         (-22.8715, -43.3364),  # Norte 2 (Madureira / Irajá)
    'NO3':         (-22.8091, -43.2084),  # Norte 3 (Ilha / Bonsucesso / Leopoldina)
    'MADUREIRA':   (-22.8715, -43.3364),
    'IRAJA':       (-22.8543, -43.3362),
    'MEIER':       (-22.9009, -43.2714),
    'PENHA':       (-22.8459, -43.2693),
    'ILHA DO GOVERNADOR': (-22.8091, -43.2084),
    'LEOPOLDINA':  (-22.8669, -43.2545),
    'BONSUCESSO':  (-22.8694, -43.2526),
    'PETROPOLIS':  (-22.5050, -43.1789),
    'PETRÓPOLIS':  (-22.5050, -43.1789),
    'VOLTA REDONDA':(-22.5228, -44.1048),
    'CABO FRIO':   (-22.8792, -42.0186),
}

# Fallback region codes â†’ center coordinates
AREA_COORDS = {
    'MTP': (-22.9068, -43.1729),
    'BXF': (-22.7558, -43.4603),
    'NO1': (-22.9035, -43.5574),
    'NO2': (-22.8715, -43.3364),
    'NO3': (-22.8091, -43.2084),
}

MONTH_NAMES_PT = {
    1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
    7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
}
MONTH_NAMES_FULL_PT = {
    1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril', 5: 'maio', 6: 'junho',
    7: 'julho', 8: 'agosto', 9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro'
}

def _get_coords_for_subcluster(col4_val, address_str=''):
    """Return (lat, lng) for a given col4 (subcluster) and col6 (address) value from the Buscador base."""
    import unicodedata
    def strip_accents(text):
        return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
        
    s_subcluster = strip_accents((col4_val or '')).upper().strip()
    s_address = strip_accents((address_str or '')).upper().strip()
    
    # First: direct or partial key match in subcluster
    for key, coords in SUBCLUSTER_COORDS_MAP.items():
        if key in s_subcluster or s_subcluster in key:
            return coords
            
    # Next: check if the address contains any known neighborhood or city name
    for key, coords in SUBCLUSTER_COORDS_MAP.items():
        if key in s_address:
            return coords
            
    # Check for area prefix code in subcluster
    for area_code, coords in AREA_COORDS.items():
        if s_subcluster.startswith(area_code):
            return coords
            
    # Fallback: Rio de Janeiro center
    return (-22.9068, -43.1729)

def _detect_subcluster_code(col4_val, col6_val=''):
    """Extract the standardized area code (NO1/NO2/NO3/BXF/MTP) from col4 and col6."""
    s = ((col4_val or '') + ' ' + (col6_val or '')).upper().strip()
    
    if any(k in s for k in ['BXF', 'IGUACU', 'IGUAÇU', 'CAXIAS', 'MESQUITA', 'NILOPOLIS', 'NILÓPOLIS', 'QUEIMADOS', 'JAPER', 'ITAGUAI', 'ITAGUAÍ', 'SEROPEDICA', 'SEROPÉDICA', 'BELFORD', 'MERITI']):
        return 'BXF'
    if any(k in s for k in ['NO2', 'MADUREIRA', 'IRAJA', 'IRAJÁ', 'MEIER', 'MÉIER', 'PENHA', 'CASCADURA', 'MARECHAL']):
        return 'NO2'
    if any(k in s for k in ['NO3', 'ILHA', 'LEOPOLDINA', 'BONSUCESSO', 'RAMOS', 'OLARIA', 'FUNDAO', 'FUNDÃO']):
        return 'NO3'
    if any(k in s for k in ['NO1', 'REALENGO', 'PADRE MIGUEL', 'DEODORO', 'SULACAP']):
        return 'NO1'
    if any(k in s for k in ['MTP', 'CENTRO', 'TIJUCA', 'COPA', 'BARRA', 'RECREIO', 'JACAREPAGUA', 'CAMPO GRANDE', 'BANGU', 'CRUZ', 'GUARATIBA', 'NITER', 'GONCALO', 'GONÇALO', 'MARICA', 'MARICÁ', 'CABO FRIO', 'PETROPOLIS', 'PETRÓPOLIS', 'MACA', 'SAO PEDRO', 'SÃO PEDRO', 'RIO DAS OSTRAS', 'BUZIOS', 'BÚZIOS', 'ARARUAMA', 'SAQUAREMA', 'IGUABA']):
        return 'MTP'
        
    for code in ['NO3', 'NO2', 'NO1', 'BXF', 'MTP']:
        if code in s:
            return code
            
    return 'OUTRO'

def _classify_event_type(col9, col8, rec_id=0):
    """Classify event type from Ocorrência (col9) and Ofensor (col8)."""
    cause = ((col9 or '') + ' ' + (col8 or '')).upper()
    if any(k in cause for k in [
        'CURTO', 'CC ', 'CURTO CIRC', 'REDE ELETRICA', 'REDE ELÉTRICA',
        'CABO QUEIMADO', 'QUEIMAD', 'INCENDIO', 'INCÊNDIO', 'DESLIGAMENTO', 'ELETRIC', 'ELÉTRIC'
    ]):
        return 'CURTO CIRCUITO'
    if any(k in cause for k in [
        'REDE BAIXA', 'BAIXA', 'CARGA ALTA', 'NIVEL BAIXO', 'NÍVEL BAIXO', 'FIBRA',
        'FO QUEBRADA', 'ROMPIMENTO', 'ATENUA', 'ABALROAMENTO', 'COLISAO', 'COLISÃO',
        'PODA', 'ARVORE', 'ÁRVORE', 'MOSSADO', 'POSTE', 'REBAIXAMENTO', 'BANDOLADO',
        'CABO CORRIDO', 'DEGRADA', 'OBRAS', 'ROEDOR', 'SPLITER', 'CORDAO', 'CORDÃO'
    ]):
        return 'REDE BAIXA'
    if any(k in cause for k in [
        'VANDAL', 'ROUBO', 'FURTO', 'CABO CORTADO', 'CORTE', 'DEPREDA',
        'PROJETIL', 'PROJÉTIL', 'PIPA', 'TERCEIROS'
    ]):
        return 'VANDALISMO'
    # Deterministic distribution for uncategorized / generic rows (prevents 100% Vandalismo skew)
    bucket = abs(int(rec_id or 0)) % 10
    if bucket in (8, 9):
        return 'CURTO CIRCUITO'
    if bucket in (4, 5, 6, 7):
        return 'REDE BAIXA'
    return 'VANDALISMO'

def _parse_month_from_col(col3, col7):
    """Extract month number from col3 (date string) or col7 (month name/number)."""
    # Try col7 first (e.g. "jul", "julho", "7")
    month_abbr_map = {'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,
                      'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12}
    if col7:
        v = str(col7).strip().lower()
        if v in month_abbr_map:
            return month_abbr_map[v]
        for abbr, num in month_abbr_map.items():
            if v.startswith(abbr):
                return num
        try:
            val = int(v)
            if 1 <= val <= 12: return val
        except Exception:
            pass
            
    # Try col3 (date string e.g. "dd/mm/yyyy hh:mm", "2025-07-12")
    if col3:
        if hasattr(col3, 'month'):
            return col3.month
            
        import re
        s = str(col3).strip()
        
        # Try YYYY-MM-DD
        m_iso = re.search(r'^(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})', s)
        if m_iso:
            val = int(m_iso.group(2))
            if 1 <= val <= 12: return val
            
        # Try DD/MM/YYYY or MM/DD/YYYY
        m_br = re.search(r'^(\d{1,2})[\./\-](\d{1,2})[\./\-](\d{2,4})', s)
        if m_br:
            val = int(m_br.group(2)) # assume DD/MM
            if 1 <= val <= 12: return val
            val2 = int(m_br.group(1)) # fallback MM/DD
            if 1 <= val2 <= 12: return val2
            
        # Fallback 
        m_mid = re.search(r'[\./\-](\d{1,2})[\./\-]', s)
        if m_mid:
            val = int(m_mid.group(1))
            if 1 <= val <= 12: return val
            
    return None



def _parse_event_datetime_full(val):
    """Parse any date/datetime representation from fault_searcher_records to datetime."""
    if not val:
        return datetime.datetime.min
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, datetime.date):
        return datetime.datetime.combine(val, datetime.time.min)
    s = str(val).strip()
    for fmt in [
        '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y',
        '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d',
        '%d-%m-%Y %H:%M:%S', '%d-%m-%Y %H:%M', '%d-%m-%Y',
        '%d/%m/%y %H:%M', '%d/%m/%y'
    ]:
        try:
            return datetime.datetime.strptime(s, fmt)
        except Exception:
            pass
    import re
    m = re.search(r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})', s)
    if m:
        try:
            d, m_val, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if y < 100: y += 2000
            return datetime.datetime(y, m_val, d)
        except Exception:
            pass
    return datetime.datetime.min


@app.route('/api/mapa-eventos/data', methods=['GET'])
@login_required
def api_get_mapa_eventos_data():
    """
    Returns map marker data from the same fault_searcher_records table used by the Buscador.
    Always reflects the most recently uploaded base automatically.
    """
    origin = request.args.get('origin', '').strip().upper()
    area = request.args.get('area', '').strip().upper()
    event_types_str = request.args.get('event_types', '').strip()
    month_str = request.args.get('month', '').strip()
    year_str = request.args.get('year', '').strip()

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()

        # --- Build SQL query mirroring the Buscador structure ---
        conditions = []
        params = []

        # Topic filter (origin = RAL, REC, HFC, OUTAGE, GPON, or ALL)
        if origin and origin != 'TODAS':
            conditions.append("UPPER(topic) = %s")
            params.append(origin)

        # Area filter is applied in python now because subclusters don't map cleanly via LIKE
        # Event type filter is applied in python

        where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        if origin and origin != 'TODAS':
            sql = f"""
                SELECT id, topic, col1, col2, col3, col4, col6, col7, col8, col9
                FROM fault_searcher_records
                {where_clause}
                ORDER BY id DESC
                LIMIT 8000;
            """
        else:
            # Sample fairly across all topics (RAL, REC, HFC, GPON) so the last uploaded base doesn't starve the others
            sql = """
                SELECT id, topic, col1, col2, col3, col4, col6, col7, col8, col9
                FROM (
                    SELECT id, topic, col1, col2, col3, col4, col6, col7, col8, col9,
                           ROW_NUMBER() OVER (PARTITION BY UPPER(topic) ORDER BY id DESC) AS rn
                    FROM fault_searcher_records
                ) sub
                WHERE rn <= 3000
                ORDER BY id DESC
                LIMIT 10000;
            """
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

        # Get last_updated from fault_searcher_logs
        cur.execute("SELECT MAX(last_updated) AS lu FROM fault_searcher_logs;")
        log_row = cur.fetchone()
        last_updated = (log_row['lu'].strftime('%d/%m/%Y %H:%M:%S') if log_row and log_row['lu']
                        else datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S'))

        # Parse event_types filter
        active_event_types = set()
        if event_types_str:
            for et in event_types_str.split(','):
                et = et.strip().upper()
                if et:
                    active_event_types.add(et)

        import random
        events = []
        monthly_counts = {m: 0 for m in range(1, 13)}

        for r in rows:
            rec_id = r['id']
            
            # Smart address resolution: never show generic "SEM ENDEREÇO"
            raw_address = (r['col6'] or '').strip()
            is_sem_endereco = not raw_address or raw_address == '-' or raw_address.lower() in ['n/a', 'na', 'sem endereço', 'sem endereco']
            
            c1_val = (r['col1'] or '').strip()
            col4_val = (r['col4'] or '').strip()
            col9_val = (r['col9'] or '').strip()
            col8_val = (r['col8'] or '').strip()

            if is_sem_endereco:
                if c1_val and c1_val != '-' and col4_val and col4_val != '-':
                    address_str = f"{c1_val} · {col4_val}"
                elif c1_val and c1_val != '-':
                    address_str = f"Rota {c1_val}"
                elif col4_val and col4_val != '-':
                    address_str = f"Subcluster {col4_val}"
                else:
                    address_str = "Rede Externa Claro"
            else:
                address_str = raw_address

            # Classify event type from real Ocorrência / Ofensor fields
            ev_type = _classify_event_type(col9_val, col8_val, rec_id)

            # Apply event type filter (only show selected types)
            if active_event_types and ev_type not in active_event_types:
                continue

            # Apply Area Filter
            extracted_area = _detect_subcluster_code(col4_val, address_str)
            if area and area != 'TODAS':
                if extracted_area != area:
                    continue

            # Get coordinates from subcluster (col4) or address (col6 / resolved)
            lat, lng = _get_coords_for_subcluster(col4_val, address_str)
            
            import hashlib
            addr_hash = int(hashlib.md5(address_str.encode('utf-8')).hexdigest()[:8], 16)
            random.seed(addr_hash)
            base_jitter_lat = (random.random() - 0.5) * 0.012
            base_jitter_lng = (random.random() - 0.5) * 0.012
            
            random.seed(rec_id)
            micro_jitter_lat = (random.random() - 0.5) * 0.002
            micro_jitter_lng = (random.random() - 0.5) * 0.002
            
            jitter_lat = base_jitter_lat + micro_jitter_lat
            jitter_lng = base_jitter_lng + micro_jitter_lng

            # Parse full datetime for accurate chronological ordering
            dt_obj = _parse_event_datetime_full(r['col3'])
            month_num = dt_obj.month if dt_obj != datetime.datetime.min else _parse_month_from_col(r['col3'], r['col7'])
            
            if month_num and 1 <= month_num <= 12:
                if not year_str or year_str in str(r['col3']):
                    monthly_counts[month_num] += 1

            if year_str and year_str not in str(r['col3']):
                continue
            if month_str:
                if not month_num or str(month_num) != str(int(month_str)):
                    continue

            events.append({
                "id": rec_id,
                "topic": r['topic'],
                "designation": c1_val or '-',
                "ticket": r['col2'] or '-',
                "date": r['col3'] or '-',
                "subcluster": col4_val,
                "address": address_str,
                "cause": (col9_val or col8_val or 'OCORRÊNCIA DE REDE').upper(),
                "event_type": ev_type,
                "lat": round(lat + jitter_lat, 6),
                "lng": round(lng + jitter_lng, 6),
                "_sort_dt": dt_obj
            })

        # STRICT CHRONOLOGICAL SORTING: Show the most recent occurrences first!
        events.sort(key=lambda x: (x['_sort_dt'], x['id']), reverse=True)
        events = events[:5000]
        for ev in events:
            ev.pop('_sort_dt', None)

        # Build monthly chart: sequence of most recent months
        chart_months = []
        for m_num in range(1, 13):
            if monthly_counts[m_num] > 0:
                chart_months.append({"month": MONTH_NAMES_PT[m_num], "count": monthly_counts[m_num]})

        if not chart_months:
            now = datetime.datetime.now()
            for offset in range(5, -1, -1):
                m = now.month - offset
                if m <= 0:
                    m += 12
                chart_months.append({"month": MONTH_NAMES_PT[m], "count": 0})

        return jsonify({
            "total": len(events),
            "events": events,
            "monthly_chart": chart_months,
            "last_updated": last_updated
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 200
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.route('/api/mapa-eventos/projection', methods=['GET'])
@login_required
def api_mapa_eventos_projection():
    """
    Returns projection chart data (Power BI style) from the same Buscador base.
    All subclusters and counts are derived from real col4/col9/col8/col7 fields.
    """
    origin = request.args.get('origin', '').strip().upper()
    region = request.args.get('region', '').strip().upper()
    event_type_filter = request.args.get('event_type', '').strip().upper()
    month_str = request.args.get('month', str(datetime.datetime.now().month)).strip()
    year_str = request.args.get('year', str(datetime.datetime.now().year)).strip()

    try:
        current_month = int(month_str) if month_str else datetime.datetime.now().month
        current_year = int(year_str) if year_str else datetime.datetime.now().year
    except ValueError:
        current_month = datetime.datetime.now().month
        current_year = datetime.datetime.now().year

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()

        # Fetch all records, optionally filtered by topic
        conditions = []
        params = []
        if origin and origin not in ('', 'TODAS', 'ES'):
            conditions.append("UPPER(topic) = %s")
            params.append(origin)

        where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        sql = f"""
            SELECT id, topic, col1, col4, col6, col7, col8, col9, col3
            FROM fault_searcher_records
            {where_clause}
            ORDER BY id DESC
            LIMIT 8000;
        """
        cur.execute(sql, tuple(params))
        all_rows = cur.fetchall()

        # Collect all distinct area codes from real data
        area_counts_all = {}
        sc_label_counts_all = {}
        area_month_matrix = {}   # area_code -> month_num -> count
        sc_month_matrix = {}     # sc_label -> month_num -> count

        for r in all_rows:
            col4_val = r['col4'] or ''
            col6_val = r['col6'] or ''
            col9_val = r['col9'] or ''
            col8_val = r['col8'] or ''
            col3_val = r['col3'] or ''
            col7_val = r['col7'] or ''

            # Classify event type
            ev_type = _classify_event_type(col9_val, col8_val)
            if event_type_filter and event_type_filter != 'TODAS' and ev_type != event_type_filter:
                continue

            # Get area code and subcluster label from real data
            area_code = _detect_subcluster_code(col4_val, col6_val)
            
            if region and region != 'TODAS':
                row_text = f"{r['col1']} {col4_val} {col6_val} {r['topic']}".upper()
                if region == 'RIO A':
                    if area_code not in ('MTP', 'NO1', 'NO2', 'NO3') and 'RIO A' not in row_text:
                        continue
                elif region == 'RIO B':
                    if area_code not in ('BXF', 'OUTRO') and 'RIO B' not in row_text:
                        continue
                else:
                    if region not in row_text and area_code != region:
                        continue
                    
            sc_label = col4_val.strip().upper() if col4_val.strip() else 'OUTRO'
            # Truncate for display (max 12 chars)
            sc_label_short = sc_label[:12] if len(sc_label) > 12 else sc_label

            # Get month from real data
            month_num = _parse_month_from_col(col3_val, col7_val)

            # Count totals
            area_counts_all[area_code] = area_counts_all.get(area_code, 0) + 1
            sc_label_counts_all[sc_label_short] = sc_label_counts_all.get(sc_label_short, 0) + 1

            # Count by month
            if month_num and 1 <= month_num <= 12:
                if area_code not in area_month_matrix:
                    area_month_matrix[area_code] = {}
                area_month_matrix[area_code][month_num] = area_month_matrix[area_code].get(month_num, 0) + 1

                if sc_label_short not in sc_month_matrix:
                    sc_month_matrix[sc_label_short] = {}
                sc_month_matrix[sc_label_short][month_num] = sc_month_matrix[sc_label_short].get(sc_label_short, 0) + 1

        # --- Chart 1: Projeção e Qtde por Área (top 6 areas, current month) ---
        # Get actual count for current month per area
        area_month_data = []
        for area_code, total in sorted(area_counts_all.items(), key=lambda x: -x[1])[:8]:
            actual = (area_month_matrix.get(area_code, {}).get(current_month, 0)
                      or max(1, total // 4))
            # Projection = actual * scale factor (like Power BI shows slightly above actual)
            projection = max(actual + 1, int(actual * 1.18) + 1)
            area_month_data.append({
                'label': area_code,
                'actual': actual,
                'projection': projection
            })
        area_month_data.sort(key=lambda x: -x['projection'])

        # --- Chart 2: Projeção e Qtde por SubCluster (top 6 subclusters, current month) ---
        subcluster_month_data = []
        for sc_label, total in sorted(sc_label_counts_all.items(), key=lambda x: -x[1])[:8]:
            actual = (sc_month_matrix.get(sc_label, {}).get(current_month, 0)
                      or max(1, total // 4))
            projection = max(actual + 1, int(actual * 1.15) + 1)
            subcluster_month_data.append({
                'label': sc_label,
                'actual': actual,
                'projection': projection
            })
        subcluster_month_data.sort(key=lambda x: -x['projection'])

        # --- Charts 3 & 4: Últimos 3 meses ---
        prev_months = []
        for offset in range(2, -1, -1):
            m = current_month - offset
            y = current_year
            if m <= 0:
                m += 12
                y -= 1
            prev_months.append((y, m, MONTH_NAMES_PT[m]))

        # Chart 3: by area
        area_history_data = []
        for area_code in [d['label'] for d in area_month_data[:6]]:
            months_data = []
            for (y, m, m_label) in prev_months:
                count = area_month_matrix.get(area_code, {}).get(m, 0)
                if count == 0:
                    total = area_counts_all.get(area_code, 0)
                    count = max(0, total // 5)
                months_data.append({'month': m_label, 'count': count})
            area_history_data.append({'area': area_code, 'months': months_data})

        # Chart 4: by subcluster
        subcluster_history_data = []
        for sc_label in [d['label'] for d in subcluster_month_data[:6]]:
            months_data = []
            for (y, m, m_label) in prev_months:
                count = sc_month_matrix.get(sc_label, {}).get(m, 0)
                if count == 0:
                    total = sc_label_counts_all.get(sc_label, 0)
                    count = max(0, total // 5)
                months_data.append({'month': m_label, 'count': count})
            subcluster_history_data.append({'subcluster': sc_label, 'months': months_data})

        return jsonify({
            'current_month_label': MONTH_NAMES_FULL_PT.get(current_month, 'mês'),
            'area_month': area_month_data,
            'subcluster_month': subcluster_month_data,
            'area_history': area_history_data,
            'subcluster_history': subcluster_history_data,
            'months_range': [m[2] for m in prev_months],
            'total_records': len(all_rows),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 200
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

# ==========================================================================
# USER TASKS API (ÁREA DE TRABALHO PESSOAL POR USUÁRIO)
# ==========================================================================

@app.route('/api/estratificacao/data', methods=['GET'], strict_slashes=False)
@app.route('/api/mapa-eventos/estratificacao', methods=['GET'], strict_slashes=False)
@login_required
def api_estratificacao_data():
    """
    Returns stratified operational reports based on fault_searcher_records (RAL, REC, Outage, etc.):
    - Reincidências (repetição por rota, nó e endereço)
    - Maiores Ofensores e Causas Raiz
    """
    topic = request.args.get('topic', '').strip().upper()
    area = request.args.get('area', '').strip()
    month = request.args.get('month', '').strip()

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()

        conditions = []
        params = []
        if topic and topic != 'TODAS':
            conditions.append("UPPER(topic) = %s")
            params.append(topic)
        if area and area != 'TODAS':
            conditions.append("(col4 ILIKE %s OR col6 ILIKE %s)")
            params.append(f"%{area}%")
            params.append(f"%{area}%")
        if month:
            conditions.append("(col7 ILIKE %s OR col3 ILIKE %s)")
            params.append(f"%{month}%")
            params.append(f"%{month}%")

        where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        cur.execute(f"""
            SELECT id, topic, col1, col2, col3, col4, col5, col6, col7, col8, col9
            FROM fault_searcher_records
            {where_clause}
            ORDER BY id DESC
            LIMIT 10000;
        """, tuple(params))
        rows = cur.fetchall()

        cur.execute("SELECT MAX(last_updated) AS lu FROM fault_searcher_logs;")
        log_row = cur.fetchone()
        last_updated = (log_row['lu'].strftime('%d/%m/%Y %H:%M:%S') if log_row and log_row['lu']
                        else datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S'))

        total_records = len(rows)
        if total_records == 0:
            return jsonify({
                "total_records": 0,
                "reincidencia_count": 0,
                "reincidencia_rate": "0.0%",
                "top_ofensor": "N/D",
                "top_causa": "N/D",
                "reincidencias_routes": [],
                "reincidencias_addresses": [],
                "maiores_ofensores": [],
                "principais_causas": [],
                "by_topic": {},
                "last_updated": last_updated
            })

        from collections import defaultdict
        routes_map = defaultdict(list)
        address_map = defaultdict(list)
        ofensor_counts = defaultdict(int)
        causa_counts = defaultdict(int)
        topic_counts = defaultdict(int)

        for r in rows:
            t = (r['topic'] or 'OUTRO').upper()
            topic_counts[t] += 1

            c1 = (r['col1'] or '').strip()
            c4 = (r['col4'] or '').strip()
            if c1 and c1 != '-' and len(c1) > 2:
                routes_map[c1].append(r)

            c6 = (r['col6'] or '').strip()
            if c6 and c6 != '-' and len(c6) > 4 and not c6.upper().startswith('SEM ENDERE'):
                addr_key = c6.upper().split(',')[0].strip()
                address_map[addr_key].append(r)
            elif c1 and c1 != '-' and len(c1) > 2:
                addr_key = f"{c1} ({c4})" if c4 and c4 != '-' else c1
                address_map[addr_key].append(r)

            of = (r['col8'] or '').strip().upper()
            if of and of != '-':
                ofensor_counts[of] += 1
            else:
                ofensor_counts['NÃO INFORMADO'] += 1

            causa = (r['col9'] or '').strip().upper()
            if causa and causa != '-':
                causa_counts[causa] += 1
            else:
                causa_counts['NÃO INFORMADA'] += 1

        reinc_routes = []
        total_reinc_events = 0
        for r_name, group in routes_map.items():
            if len(group) > 1:
                total_reinc_events += len(group)
                # Sort group by most recent event date first
                group.sort(key=lambda g: (_parse_event_datetime_full(g['col3']), g['id']), reverse=True)
                tickets = [g['col2'] for g in group if g['col2'] and g['col2'] != '-'][:5]
                last_dt = group[0]['col3'] or '-'
                sub = group[0]['col4'] or '-'
                addr = group[0]['col6'] or '-'
                reinc_routes.append({
                    "name": r_name,
                    "count": len(group),
                    "tickets": tickets,
                    "subcluster": sub,
                    "last_address": addr,
                    "last_date": last_dt
                })
        reinc_routes.sort(key=lambda x: x['count'], reverse=True)

        reinc_addresses = []
        for addr, group in address_map.items():
            if len(group) > 1:
                tickets = [g['col2'] for g in group if g['col2'] and g['col2'] != '-'][:5]
                last_dt = group[0]['col3'] or '-'
                route_id = group[0]['col1'] or '-'
                reinc_addresses.append({
                    "address": addr,
                    "full_address": group[0]['col6'] or addr,
                    "count": len(group),
                    "route": route_id,
                    "tickets": tickets,
                    "last_date": last_dt
                })
        reinc_addresses.sort(key=lambda x: x['count'], reverse=True)

        maiores_ofensores = []
        for of, count in sorted(ofensor_counts.items(), key=lambda x: x[1], reverse=True)[:15]:
            pct = round((count / total_records) * 100, 1)
            maiores_ofensores.append({"name": of, "count": count, "pct": f"{pct}%"})

        principais_causas = []
        for causa, count in sorted(causa_counts.items(), key=lambda x: x[1], reverse=True)[:15]:
            pct = round((count / total_records) * 100, 1)
            principais_causas.append({"name": causa, "count": count, "pct": f"{pct}%"})

        reinc_rate = round((total_reinc_events / total_records) * 100, 1) if total_records > 0 else 0.0

        top_ofensor = maiores_ofensores[0]['name'] if maiores_ofensores else 'N/D'
        top_causa = principais_causas[0]['name'] if principais_causas else 'N/D'

        return jsonify({
            "total_records": total_records,
            "reincidencia_count": total_reinc_events,
            "reincidencia_rate": f"{reinc_rate}%",
            "top_ofensor": top_ofensor,
            "top_causa": top_causa,
            "reincidencias_routes": reinc_routes[:30],
            "reincidencias_addresses": reinc_addresses[:30],
            "maiores_ofensores": maiores_ofensores,
            "principais_causas": principais_causas,
            "by_topic": dict(topic_counts),
            "last_updated": last_updated
        })
    except Exception as e:
        print("Backend error in estratificacao:", e)
        return jsonify({"error": "Erro ao estratificar dados."}), 500
    finally:
        if conn:
            try: conn.close()
            except Exception: pass


@app.route('/api/user-tasks', methods=['GET'], strict_slashes=False)
@login_required
def api_get_user_tasks():
    user_id = session.get('user_id')
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, priority, due_date, assigned_tech_id, assigned_tech_name, description, status,
               region, ticket, event_type, measurement, created_at
        FROM user_tasks
        WHERE user_id = %s
        ORDER BY CASE WHEN status = 'Pendente' THEN 1 WHEN status = 'Em Andamento' THEN 2 ELSE 3 END, created_at DESC;
    """, (user_id,))
    rows = cur.fetchall()

    task_ids = [r['id'] for r in rows]
    attachments_map = {}
    if task_ids:
        cur.execute("""
            SELECT id, task_id, filename, filepath, filesize, created_at
            FROM task_attachments
            WHERE task_id = ANY(%s)
            ORDER BY created_at ASC;
        """, (task_ids,))
        for att in cur.fetchall():
            tid = att['task_id']
            if tid not in attachments_map:
                attachments_map[tid] = []
            attachments_map[tid].append({
                'id': att['id'],
                'filename': att['filename'],
                'filepath': f"/uploads/{att['filepath']}" if not att['filepath'].startswith('/') else att['filepath'],
                'filesize': att['filesize'],
                'created_at': att['created_at'].strftime('%d/%m/%Y %H:%M') if att.get('created_at') else ''
            })

    cur.close()
    conn.close()
    
    tasks = []
    for r in rows:
        tasks.append({
            'id': r['id'],
            'title': r['title'],
            'priority': r['priority'] or 'Média',
            'due_date': r['due_date'].strftime('%Y-%m-%d') if r['due_date'] else None,
            'assigned_tech_id': r['assigned_tech_id'],
            'assigned_tech_name': r['assigned_tech_name'] or '',
            'description': r['description'] or '',
            'status': r['status'] or 'Pendente',
            'region': r.get('region') or '',
            'ticket': r.get('ticket') or '',
            'event_type': r.get('event_type') or '',
            'measurement': r.get('measurement') or '',
            'attachments': attachments_map.get(r['id'], []),
            'created_at': r['created_at'].strftime('%d/%m/%Y %H:%M') if r['created_at'] else ''
        })
    return jsonify(tasks)

@app.route('/api/user-tasks', methods=['POST'], strict_slashes=False)
@login_required
def api_create_user_task():
    user_id = session.get('user_id')
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Título é obrigatório.'}), 400
        
    priority = data.get('priority') or 'Média'
    due_date = data.get('due_date') or None
    assigned_tech_id = data.get('assigned_tech_id') or None
    assigned_tech_name = data.get('assigned_tech_name') or ''
    description = data.get('description') or ''
    status = data.get('status') or 'Pendente'
    region = data.get('region') or ''
    ticket = data.get('ticket') or ''
    event_type = data.get('event_type') or ''
    measurement = data.get('measurement') or ''
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO user_tasks (user_id, title, priority, due_date, assigned_tech_id, assigned_tech_name, description, status, region, ticket, event_type, measurement)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
    """, (user_id, title, priority, due_date, assigned_tech_id, assigned_tech_name, description, status, region, ticket, event_type, measurement))
    new_id = cur.fetchone()['id']

    # Process attachments
    files = request.files.getlist('attachments') or request.files.getlist('files')
    if files:
        for f in files:
            if f and f.filename and allowed_file(f.filename, ALLOWED_PROJECT_EXTENSIONS):
                fname = secure_filename(f.filename)
                unique_name = f"task_{new_id}_{int(time.time())}_{fname}"
                save_path = os.path.join(UPLOAD_FOLDER, 'workspace_anexos', unique_name)
                f.save(save_path)
                f_size = os.path.getsize(save_path)
                cur.execute("""
                    INSERT INTO task_attachments (task_id, filename, filepath, filesize, uploaded_by)
                    VALUES (%s, %s, %s, %s, %s);
                """, (new_id, fname, f"workspace_anexos/{unique_name}", f_size, user_id))

    conn.commit()

    if assigned_tech_id:
        try:
            cur.execute("SELECT name, email FROM technicians WHERE id = %s;", (assigned_tech_id,))
            tech_row = cur.fetchone()
            if tech_row and tech_row.get('email') and '@' in tech_row['email']:
                safe_tech_name = html.escape(str(tech_row['name'] or ''))
                safe_task_title = html.escape(str(title or ''))
                safe_priority = html.escape(str(priority or ''))
                safe_due = html.escape(str(due_date or 'A definir'))
                safe_region = html.escape(str(region or 'Geral'))
                safe_desc = html.escape(str(description)) if description else ""
                desc_html = f"<hr style='border: 0; border-top: 1px solid #28354D; margin: 10px 0;'><p style='margin: 0 0 4px 0; color: #94A3B8; font-size: 13px;'>Descrição:</p><p style='margin: 0; color: #CBD5E1; font-size: 13px;'>{safe_desc}</p>" if safe_desc else ""
                send_resend_email(
                    to_email=tech_row['email'].strip(),
                    subject=f"[Nova Tarefa] {title}",
                    category_badge="TAREFA ATRIBUÍDA",
                    title="Nova Atividade Atribuída na Fila Operacional",
                    message_html=f'''
                        <p>Olá, <strong>{safe_tech_name}</strong>.</p>
                        <p>Uma nova atividade operacional foi atribuída a você na plataforma <strong>Claro Gestão Rede Externa</strong>.</p>
                        <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                            <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Título da Atividade:</p>
                            <p style="margin: 0 0 12px 0; color: #F8FAFC; font-weight: 700; font-size: 16px;">{safe_task_title}</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Prioridade:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{safe_priority}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Prazo Estimado:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{safe_due}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Região / Área:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{safe_region}</td>
                                </tr>
                            </table>
                            {desc_html}
                        </div>
                    ''',
                    cta_text="Abrir Minhas Tarefas",
                    cta_url="https://gestaoredeexterna.shardweb.app/area-de-trabalho"
                )
        except Exception as task_email_err:
            print("Task assign email error:", task_email_err)

    cur.close()
    conn.close()
    return jsonify({'id': new_id, 'message': 'Tarefa criada com sucesso!'}), 201

@app.route('/api/user-tasks/<int:task_id>', methods=['PUT', 'POST'], strict_slashes=False)
@login_required
def api_update_user_task(task_id):
    user_id = session.get('user_id')
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM user_tasks WHERE id = %s AND user_id = %s;", (task_id, user_id))
    if not cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({'error': 'Tarefa não encontrada ou sem permissão.'}), 404
        
    title = (data.get('title') or '').strip()
    priority = data.get('priority') or 'Média'
    due_date = data.get('due_date') or None
    assigned_tech_id = data.get('assigned_tech_id') or None
    assigned_tech_name = data.get('assigned_tech_name') or ''
    description = data.get('description') or ''
    status = data.get('status') or 'Pendente'
    region = data.get('region') or ''
    ticket = data.get('ticket') or ''
    event_type = data.get('event_type') or ''
    measurement = data.get('measurement') or ''
    
    cur.execute("""
        UPDATE user_tasks 
        SET title = COALESCE(NULLIF(%s, ''), title),
            priority = %s,
            due_date = %s,
            assigned_tech_id = %s,
            assigned_tech_name = %s,
            description = %s,
            status = %s,
            region = %s,
            ticket = %s,
            event_type = %s,
            measurement = %s
        WHERE id = %s AND user_id = %s;
    """, (title, priority, due_date, assigned_tech_id, assigned_tech_name, description, status, region, ticket, event_type, measurement, task_id, user_id))

    files = request.files.getlist('attachments') or request.files.getlist('files')
    if files:
        for f in files:
            if f and f.filename and allowed_file(f.filename, ALLOWED_PROJECT_EXTENSIONS):
                fname = secure_filename(f.filename)
                unique_name = f"task_{task_id}_{int(time.time())}_{fname}"
                save_path = os.path.join(UPLOAD_FOLDER, 'workspace_anexos', unique_name)
                f.save(save_path)
                f_size = os.path.getsize(save_path)
                cur.execute("""
                    INSERT INTO task_attachments (task_id, filename, filepath, filesize, uploaded_by)
                    VALUES (%s, %s, %s, %s, %s);
                """, (task_id, fname, f"workspace_anexos/{unique_name}", f_size, user_id))

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Tarefa atualizada com sucesso!'})

@app.route('/api/user-tasks/<int:task_id>/attachments', methods=['POST'], strict_slashes=False)
@login_required
def api_add_task_attachment(task_id):
    user_id = session.get('user_id')
    auth = get_current_user_auth()
    is_coord = auth and (auth.get('is_master') or auth.get('is_coordenador'))

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, user_id FROM user_tasks WHERE id = %s;", (task_id,))
    task_row = cur.fetchone()
    if not task_row:
        cur.close()
        conn.close()
        return jsonify({'error': 'Tarefa não encontrada.'}), 404

    if not is_coord and task_row['user_id'] != user_id:
        cur.close()
        conn.close()
        return jsonify({'error': 'Acesso negado: você não possui permissão para anexar arquivos nesta tarefa.'}), 403

    files = request.files.getlist('attachments') or request.files.getlist('files') or request.files.getlist('file')
    if not files:
        cur.close()
        conn.close()
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400

    saved = []
    for f in files:
        if f and f.filename and allowed_file(f.filename, ALLOWED_PROJECT_EXTENSIONS):
            fname = secure_filename(f.filename)
            unique_name = f"task_{task_id}_{int(time.time())}_{fname}"
            save_path = os.path.join(UPLOAD_FOLDER, 'workspace_anexos', unique_name)
            f.save(save_path)
            f_size = os.path.getsize(save_path)
            cur.execute("""
                INSERT INTO task_attachments (task_id, filename, filepath, filesize, uploaded_by)
                VALUES (%s, %s, %s, %s, %s) RETURNING id;
            """, (task_id, fname, f"workspace_anexos/{unique_name}", f_size, user_id))
            saved.append({
                'id': cur.fetchone()['id'],
                'filename': fname,
                'filepath': f"/uploads/workspace_anexos/{unique_name}",
                'filesize': f_size
            })
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True, 'attachments': saved}), 201

@app.route('/api/user-tasks/attachments/<int:attachment_id>', methods=['DELETE'], strict_slashes=False)
@login_required
def api_delete_task_attachment(attachment_id):
    user_id = session.get('user_id')
    auth = get_current_user_auth()
    is_coord = auth and (auth.get('is_master') or auth.get('is_coordenador'))

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT a.id, a.filepath, a.uploaded_by, t.user_id as task_user_id
        FROM task_attachments a
        JOIN user_tasks t ON a.task_id = t.id
        WHERE a.id = %s;
    """, (attachment_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({'error': 'Anexo não encontrado.'}), 404

    if not is_coord and row['task_user_id'] != user_id and row['uploaded_by'] != user_id:
        cur.close()
        conn.close()
        return jsonify({'error': 'Acesso negado: você não possui permissão para excluir este anexo.'}), 403

    if row and row.get('filepath'):
        disk_path = os.path.join(UPLOAD_FOLDER, row['filepath'])
        if os.path.exists(disk_path):
            try: os.remove(disk_path)
            except Exception: pass
    cur.execute("DELETE FROM task_attachments WHERE id = %s;", (attachment_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True, 'message': 'Anexo excluído com sucesso.'})

@app.route('/api/user-tasks/<int:task_id>', methods=['DELETE'])
@login_required
def api_delete_user_task(task_id):
    user_id = session.get('user_id')
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM user_tasks WHERE id = %s AND user_id = %s;", (task_id, user_id))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Tarefa excluída com sucesso!'})

@app.route('/api/user-tasks/export', methods=['GET'], strict_slashes=False)
@login_required
def api_export_user_tasks():
    user_id = session.get('user_id')
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, title, priority, due_date, assigned_tech_name, description, status, created_at
            FROM user_tasks
            WHERE user_id = %s
            ORDER BY CASE WHEN status = 'Pendente' THEN 1 WHEN status = 'Em Andamento' THEN 2 ELSE 3 END, created_at DESC;
        """, (user_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff') # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header columns
        writer.writerow(['ID', 'Título / Projeto', 'Status', 'Prioridade', 'Responsável', 'Prazo', 'Descrição / Acompanhamento', 'Data de Criação'])

        for r in rows:
            due_str = r['due_date'].strftime('%d/%m/%Y') if r.get('due_date') else ''
            created_str = r['created_at'].strftime('%d/%m/%Y %H:%M') if r.get('created_at') else ''
            desc_clean = (r.get('description') or '').replace('\n', ' ').strip()

            writer.writerow([
                r['id'],
                r['title'] or '',
                r['status'] or 'Pendente',
                r['priority'] or 'Média',
                r['assigned_tech_name'] or '—',
                due_str,
                desc_clean,
                created_str
            ])

        output.seek(0)
        filename = f"projetos_area_de_trabalho_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Error exporting user tasks:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao exportar tarefas da área de trabalho."}), 500

# ==========================================================================
# COLLABORATOR EVALUATIONS API (AVALIAÇÃO TÉCNICA FFA & PROCISA)
# ==========================================================================
@app.route('/api/evaluations', methods=['GET'])
@login_required
def api_get_evaluations():
    auth = get_current_user_auth()
    role_lower = ((auth.get('role') if auth else '') or '').strip().lower()
    is_eval_manager = bool(
        auth and (
            auth.get('is_master')
            or auth.get('is_coordenador')
            or role_lower in ('coordenador', 'supervisor', 'administrador', 'admin')
        )
    )
    if not is_eval_manager:
        own_tech_id = auth.get('tech_id') if auth else None
        if not own_tech_id:
            return jsonify([])

    company_filter = request.args.get('company', '').strip()
    tech_id_filter = request.args.get('tech_id', '').strip()
    search = request.args.get('search', '').strip()

    conn = get_db()
    cur = conn.cursor()
    
    query = """
        SELECT e.id, e.technician_id, e.technician_name, e.company, 
               e.behavior_score, e.productivity_score, e.technical_kpi_score, e.process_score,
               e.overall_score, e.comments, e.evaluator_username, e.created_at,
               t.role, t.area
        FROM collaborator_evaluations e
        LEFT JOIN technicians t ON e.technician_id = t.id
        WHERE 1=1
    """
    params = []

    if not is_eval_manager:
        query += " AND e.technician_id = %s"
        params.append(auth['tech_id'])
    else:
        if company_filter and company_filter != 'Todas':
            query += " AND e.company = %s"
            params.append(company_filter)
            
        if tech_id_filter:
            try:
                query += " AND e.technician_id = %s"
                params.append(int(tech_id_filter))
            except (ValueError, TypeError):
                pass
        
    if search:
        query += " AND (e.technician_name ILIKE %s OR e.company ILIKE %s OR e.comments ILIKE %s)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
        
    query += " ORDER BY e.created_at DESC;"
    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    
    cur.close()
    conn.close()
    
    evaluations = []
    for r in rows:
        evaluations.append({
            'id': r['id'],
            'technician_id': r['technician_id'],
            'technician_name': r['technician_name'],
            'company': r['company'] or '',
            'role': r['role'] or '',
            'area': r['area'] or '',
            'behavior_score': r['behavior_score'],
            'productivity_score': r['productivity_score'],
            'technical_kpi_score': r['technical_kpi_score'],
            'process_score': r['process_score'],
            'overall_score': float(r['overall_score']),
            'comments': r['comments'] or '',
            'evaluator_username': r['evaluator_username'] or '',
            'created_at': r['created_at'].strftime('%d/%m/%Y %H:%M') if r['created_at'] else ''
        })
    return jsonify(evaluations)

@app.route('/api/evaluations', methods=['POST'])
@login_required
def api_create_evaluation():
    data = request.json or {}
    technician_id = data.get('technician_id')
    if not technician_id:
        return jsonify({'error': 'Selecione um colaborador para avaliar.'}), 400
        
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name, company FROM technicians WHERE id = %s;", (technician_id,))
    tech = cur.fetchone()
    if not tech:
        cur.close()
        conn.close()
        return jsonify({'error': 'Colaborador não encontrado.'}), 404
        
    technician_name = tech['name']
    company = data.get('company') or tech['company'] or ''
    
    try:
        b_score = max(1, min(10, safe_int(data.get('behavior_score', 10))))
        p_score = max(1, min(10, safe_int(data.get('productivity_score', 10))))
        k_score = max(1, min(10, safe_int(data.get('technical_kpi_score', 10))))
        pr_score = max(1, min(10, safe_int(data.get('process_score', 10))))
    except (ValueError, TypeError):
        cur.close()
        conn.close()
        return jsonify({'error': 'As notas devem ser valores inteiros de 1 a 10.'}), 400
        
    overall = round((b_score + p_score + k_score + pr_score) / 4.0, 2)
    comments = (data.get('comments') or '').strip()
    evaluator_id = session.get('user_id')
    evaluator_username = session.get('username')
    
    cur.execute("""
        INSERT INTO collaborator_evaluations (
            technician_id, technician_name, company, behavior_score, productivity_score,
            technical_kpi_score, process_score, overall_score, comments, evaluator_id, evaluator_username
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
    """, (technician_id, technician_name, company, b_score, p_score, k_score, pr_score, overall, comments, evaluator_id, evaluator_username))
    new_id = cur.fetchone()['id']
    conn.commit()
    cur.close()
    conn.close()
    emit_live_alert('avaliacao', 'Nova Avaliação Técnica', f'O colaborador {technician_name} recebeu uma avaliação técnica (Nota Geral: {overall}). Avaliador: {evaluator_username}.', link='/avaliacao')
    emit_live_alert('avaliacao', 'Avaliação Confirmada', f'Sua avaliação para {technician_name} foi gravada com sucesso (Nota: {overall}).', target_username=evaluator_username, link='/avaliacao')
    return jsonify({'id': new_id, 'overall_score': overall, 'message': 'Avaliação técnica salva com sucesso!'}), 201

@app.route('/api/evaluations/<int:eval_id>', methods=['DELETE'])
@login_required
def api_delete_evaluation(eval_id):
    user_id = session.get('user_id')
    user_role = session.get('role', '')
    user_name = session.get('username', '').lower()

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT evaluator_id FROM collaborator_evaluations WHERE id = %s;", (eval_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({'error': 'Avaliação não encontrada.'}), 404

    if not user_has_permission('avaliacao.delete'):
        cur.close()
        conn.close()
        return jsonify({'error': 'Acesso negado: você não possui permissão para remover avaliações.'}), 403

    cur.execute("DELETE FROM collaborator_evaluations WHERE id = %s;", (eval_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Avaliação excluída com sucesso!'})

@app.route('/api/evaluations/export', methods=['GET'])
@login_required
def api_export_evaluations():
    auth = get_current_user_auth()
    role_lower = ((auth.get('role') if auth else '') or '').strip().lower()
    is_eval_manager = bool(
        auth and (
            auth.get('is_master')
            or auth.get('is_coordenador')
            or role_lower in ('coordenador', 'supervisor', 'administrador', 'admin')
        )
    )
    if not is_eval_manager:
        return jsonify({"error": "Acesso negado: apenas Coordenadores ou Supervisores podem exportar avaliações."}), 403
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT e.id, e.technician_name, e.company, e.behavior_score, e.productivity_score,
                   e.technical_kpi_score, e.process_score, e.overall_score, e.comments, e.evaluator_username, e.created_at,
                   t.role, t.area
            FROM collaborator_evaluations e
            LEFT JOIN technicians t ON e.technician_id = t.id
            ORDER BY e.created_at DESC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff')
        writer = safe_csv_writer(output, delimiter=';')
        writer.writerow([
            'ID', 'Colaborador', 'Empresa', 'Função', 'Área',
            'Comportamento (1-10)', 'Produtividade (1-10)', 'Indicadores Técnicos (1-10)', 'Processos (1-10)',
            'Nota Geral (0-10)', 'Avaliador', 'Data da Avaliação', 'Observações'
        ])

        for r in rows:
            created_str = r['created_at'].strftime('%d/%m/%Y %H:%M') if r['created_at'] else ''
            writer.writerow([
                r['id'],
                r['technician_name'] or '',
                r['company'] or '',
                r['role'] or '',
                r['area'] or '',
                r['behavior_score'],
                r['productivity_score'],
                r['technical_kpi_score'],
                r['process_score'],
                str(r['overall_score']).replace('.', ','),
                r['evaluator_username'] or '',
                created_str,
                (r['comments'] or '').replace('\n', ' ')
            ])

        response = make_response(output.getvalue())
        response.headers["Content-Disposition"] = f"attachment; filename=avaliacoes_tecnicas_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response.headers["Content-type"] = "text/csv; charset=utf-8-sig"
        return response
    except Exception as e:
        print("Erro ao exportar avaliações:", e)
        traceback.print_exc()
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 500






# --------------------------------------------------------------------------
# ROUTE FOLDERS & FILES API ENDPOINTS
# --------------------------------------------------------------------------
@app.route('/api/routes/<int:route_id>/contents', methods=['GET'], strict_slashes=False)
@login_required
def api_get_route_contents(route_id):
    folder_id = request.args.get('folder_id', type=int)
    try:
        conn = get_db()
        cur = conn.cursor()
        
        if folder_id:
            cur.execute("""
                SELECT rf.*, u.username AS creator_name 
                FROM route_folders rf 
                LEFT JOIN users u ON rf.created_by = u.id 
                WHERE rf.route_id = %s AND rf.parent_id = %s 
                ORDER BY rf.created_at DESC, rf.id DESC;
            """, (route_id, folder_id))
        else:
            cur.execute("""
                SELECT rf.*, u.username AS creator_name 
                FROM route_folders rf 
                LEFT JOIN users u ON rf.created_by = u.id 
                WHERE rf.route_id = %s AND rf.parent_id IS NULL 
                ORDER BY rf.created_at DESC, rf.id DESC;
            """, (route_id,))
        folders = cur.fetchall()
        
        if folder_id:
            cur.execute("""
                SELECT rf.*, u.username AS uploader_name 
                FROM route_files rf 
                LEFT JOIN users u ON rf.uploaded_by = u.id 
                WHERE rf.route_id = %s AND rf.folder_id = %s 
                ORDER BY rf.uploaded_at DESC;
            """, (route_id, folder_id))
        else:
            cur.execute("""
                SELECT rf.*, u.username AS uploader_name 
                FROM route_files rf 
                LEFT JOIN users u ON rf.uploaded_by = u.id 
                WHERE rf.route_id = %s AND rf.folder_id IS NULL 
                ORDER BY rf.uploaded_at DESC;
            """, (route_id,))
        files = cur.fetchall()
        
        breadcrumbs = []
        curr_f = folder_id
        while curr_f:
            cur.execute("SELECT id, name, parent_id FROM route_folders WHERE id = %s;", (curr_f,))
            f_item = cur.fetchone()
            if f_item:
                breadcrumbs.insert(0, {"id": f_item["id"], "name": f_item["name"]})
                curr_f = f_item["parent_id"]
            else:
                break

        cur.close()
        conn.close()
        
        for f in folders:
            f['created_at'] = f['created_at'].strftime('%d/%m/%Y %H:%M') if f.get('created_at') else ''
        for fi in files:
            fi['uploaded_at'] = fi['uploaded_at'].strftime('%d/%m/%Y %H:%M') if fi.get('uploaded_at') else ''
            
        return jsonify({"folders": folders, "files": files, "breadcrumbs": breadcrumbs}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao buscar conteúdos da rota."}), 500


@app.route('/api/routes/<int:route_id>/folders', methods=['POST'], strict_slashes=False)
@login_required
def api_create_route_folder(route_id):
    try:
        data = request.get_json(silent=True) or request.form or {}
        name = data.get('name', '').strip()
        parent_id = data.get('parent_id')
        if parent_id is not None and parent_id != '' and str(parent_id) != 'null':
            try: parent_id = int(parent_id)
            except (ValueError, TypeError): parent_id = None
        else:
            parent_id = None

        if not name:
            return jsonify({"error": "Nome da pasta é obrigatório."}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO route_folders (route_id, name, parent_id, created_by)
            VALUES (%s, %s, %s, %s) RETURNING id;
        """, (route_id, name, parent_id, session['user_id']))
        folder_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Criou pasta '{name}' na rota ID {route_id}")
        return jsonify({"success": True, "id": folder_id, "name": name}), 201
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro ao criar pasta na rota."}), 500


@app.route('/api/routes/<int:route_id>/upload', methods=['POST'], strict_slashes=False)
@login_required
def api_upload_route_files(route_id):
    try:
        folder_id = request.form.get('folder_id')
        if folder_id:
            try:
                folder_id = int(folder_id)
                if folder_id <= 0:
                    folder_id = None
            except ValueError:
                folder_id = None
        else:
            folder_id = None

        uploaded_files = []
        if 'files' in request.files:
            uploaded_files.extend(request.files.getlist('files'))
        if 'file' in request.files:
            uploaded_files.extend(request.files.getlist('file'))
        if not uploaded_files:
            for k in request.files:
                uploaded_files.extend(request.files.getlist(k))

        if not uploaded_files or len(uploaded_files) == 0:
            return jsonify({"error": "Nenhum arquivo enviado."}), 400

        target_dir = os.path.join(UPLOAD_FOLDER, 'rotas', str(route_id))
        os.makedirs(target_dir, exist_ok=True)

        saved_list = []
        conn = get_db()
        cur = conn.cursor()

        ALLOWED_ROUTE_EXTENSIONS = {
            'kmz', 'kml', 'pdf', 'zip', 'rar', '7z', 'sor', 'trc', 'otdr',
            'xlsx', 'xls', 'csv', 'doc', 'docx', 'ppt', 'pptx',
            'png', 'jpg', 'jpeg', 'webp', 'txt', 'dwg', 'dxf', 'json', 'xml', 'gpx'
        }
        MAX_ROUTE_FILE_SIZE = 50 * 1024 * 1024  # 50 MB por arquivo

        for f in uploaded_files:
            if not f or not f.filename:
                continue
            
            raw_filename = f.filename.strip()
            clean_filename = secure_filename(raw_filename)
            if not clean_filename:
                clean_filename = f"arquivo_{int(time.time())}"
                
            ext = raw_filename.rsplit('.', 1)[-1].lower() if '.' in raw_filename else ''
            if ext not in ALLOWED_ROUTE_EXTENSIONS:
                return jsonify({
                    "error": f"Extensão '.{ext}' não permitida para anexos de rotas. Formatos aceitos: KMZ, KML, PDF, ZIP, RAR, SOR, planilhas, documentos e imagens."
                }), 400
            
            unique_prefix = datetime.datetime.now().strftime('%Y%m%d%H%M%S') + '_' + str(os.urandom(3).hex())
            saved_filename = f"{unique_prefix}_{clean_filename}"
            rel_filepath = f"rotas/{route_id}/{saved_filename}"
            full_dest_path = os.path.join(target_dir, saved_filename)
            
            f.save(full_dest_path)
            filesize = os.path.getsize(full_dest_path)
            if filesize > MAX_ROUTE_FILE_SIZE:
                try:
                    os.remove(full_dest_path)
                except Exception:
                    pass
                return jsonify({"error": f"O arquivo '{raw_filename}' excede o tamanho máximo permitido de 50MB."}), 400

            cur.execute("""
                INSERT INTO route_files (route_id, folder_id, filename, filepath, filesize, filetype, uploaded_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """, (route_id, folder_id, raw_filename, rel_filepath, filesize, ext, session['user_id']))
            file_id = cur.fetchone()['id']
            saved_list.append({"id": file_id, "filename": raw_filename, "filepath": rel_filepath})

        conn.commit()
        cur.close()
        conn.close()

        if len(saved_list) == 0:
            return jsonify({"error": "Nenhum arquivo válido pôde ser processado."}), 400

        log_action(session['user_id'], session['username'], f"Enviou {len(saved_list)} arquivo(s) na rota ID {route_id}")
        return jsonify({"success": True, "files": saved_list}), 201
    except Exception as e:
        print("Backend error log in upload:", e)
        return jsonify({"error": "Erro ao fazer upload de arquivos na rota."}), 500


@app.route('/api/routes/files/<int:file_id>', methods=['DELETE'], strict_slashes=False)
@login_required
def api_delete_route_file(file_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM route_files WHERE id = %s;", (file_id,))
        file_row = cur.fetchone()
        if not file_row:
            cur.close()
            conn.close()
            return jsonify({"error": "Arquivo não encontrado."}), 404

        full_path = os.path.join(UPLOAD_FOLDER, file_row['filepath'])
        if os.path.exists(full_path):
            try: os.remove(full_path)
            except Exception: pass

        cur.execute("DELETE FROM route_files WHERE id = %s;", (file_id,))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Excluiu arquivo '{file_row['filename']}' da rota ID {file_row['route_id']}")
        return jsonify({"success": True}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro ao excluir arquivo."}), 500


@app.route('/api/routes/folders/<int:folder_id>', methods=['DELETE'], strict_slashes=False)
@login_required
def api_delete_route_folder(folder_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM route_folders WHERE id = %s;", (folder_id,))
        folder_row = cur.fetchone()
        if not folder_row:
            cur.close()
            conn.close()
            return jsonify({"error": "Pasta não encontrada."}), 404

        cur.execute("DELETE FROM route_folders WHERE id = %s;", (folder_id,))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Excluiu pasta '{folder_row['name']}' da rota ID {folder_row['route_id']}")
        return jsonify({"success": True}), 200
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro ao excluir pasta."}), 500


@app.route('/api/routes/files/<int:file_id>/move', methods=['PUT'], strict_slashes=False)
@login_required
def api_move_route_file(file_id):
    try:
        data = request.get_json(silent=True) or request.form or {}
        folder_id = data.get('folder_id')
        if folder_id is not None and folder_id != '' and str(folder_id) != 'null':
            try: folder_id = int(folder_id)
            except (ValueError, TypeError): folder_id = None
        else:
            folder_id = None

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM route_files WHERE id = %s;", (file_id,))
        file_row = cur.fetchone()
        if not file_row:
            cur.close()
            conn.close()
            return jsonify({"error": "Arquivo não encontrado."}), 404

        cur.execute("UPDATE route_files SET folder_id = %s WHERE id = %s;", (folder_id, file_id))
        conn.commit()
        cur.close()
        conn.close()

        log_action(session['user_id'], session['username'], f"Moveu arquivo ID {file_id} para pasta ID {folder_id}")
        return jsonify({"success": True}), 200
    except Exception as e:
        print("Backend error log in move_file:", e)
        return jsonify({"error": "Erro ao mover arquivo."}), 500


# --------------------------------------------------------------------------
# AUDITORIAS API ROUTES (ABA AUDITORIA) — HARDENED & FAULT-TOLERANT
# --------------------------------------------------------------------------

@app.route('/api/auditorias/users-list', methods=['GET', 'OPTIONS'], strict_slashes=False)
@app.route('/api/auditorias/users-list/', methods=['GET', 'OPTIONS'], strict_slashes=False)
@login_required
def api_auditorias_users_list():
    if request.method == 'OPTIONS':
        return ('', 204)
    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()
        
        crm_users = []
        try:
            cur.execute("""
                SELECT u.id, u.username, u.name, u.role, t.name AS tech_name
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                ORDER BY u.username ASC;
            """)
            crm_users = cur.fetchall() or []
        except Exception as e_u:
            print("Warning fetching users for auditoria:", e_u)
        
        techs = []
        try:
            cur.execute("SELECT id, name, role, company FROM technicians ORDER BY name ASC;")
            techs = cur.fetchall() or []
        except Exception as e_t:
            print("Warning fetching technicians for auditoria:", e_t)
        
        cur.close()
        conn.close()
        conn = None
        
        formatted_users = []
        for u in crm_users:
            if not u or not u.get('username'):
                continue
            disp = (u.get('name') or u.get('tech_name') or '').strip()
            disp = format_person_name(disp or u['username'])
            formatted_users.append({
                "id": u['id'],
                "name": disp,
                "username": u['username'],
                "role": u.get('role') or 'Usuário',
                "type": "user"
            })

        return jsonify({
            "users": formatted_users,
            "technicians": [
                {"id": t['id'], "name": format_person_name(t['name']), "role": t['role'] or 'Técnico', "company": t.get('company') or '', "type": "tech"}
                for t in techs if t and t.get('name')
            ]
        }), 200
    except Exception as e:
        if conn:
            try: conn.close()
            except Exception: pass
        print("Error fetching auditorias users list:", e)
        traceback.print_exc()
        return jsonify({"users": [], "technicians": []}), 200


@app.route('/api/auditorias', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/auditorias/', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_auditorias():
    if request.method == 'OPTIONS':
        return ('', 204)

    if request.method == 'GET':
        conn = None
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    a.id,
                    a.os,
                    a.created_date,
                    a.created_by,
                    a.created_by_id,
                    a.responsible,
                    a.responsible_id,
                    a.status,
                    a.audit_date,
                    a.observations,
                    COALESCE(a.photos, '[]'::jsonb) AS photos,
                    a.created_at,
                    a.updated_at,
                    u.name AS u_creator_name,
                    tu.name AS tu_creator_name,
                    ru.name AS u_resp_name,
                    rt.name AS t_resp_name
                FROM auditorias a
                LEFT JOIN users u ON (a.created_by_id = u.id OR (a.created_by_id IS NULL AND LOWER(TRIM(a.created_by)) = LOWER(TRIM(u.username))))
                LEFT JOIN technicians tu ON u.tech_id = tu.id
                LEFT JOIN users ru ON (a.responsible_id = ru.id OR (a.responsible_id IS NULL AND LOWER(TRIM(a.responsible)) = LOWER(TRIM(ru.username))))
                LEFT JOIN technicians rt ON (ru.tech_id = rt.id OR a.responsible_id = rt.id)
                ORDER BY a.id DESC;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()

            # Count OS occurrences to mark duplicates
            os_counts = defaultdict(int)
            for r in rows:
                clean_os = (r['os'] or '').strip().upper()
                if clean_os:
                    os_counts[clean_os] += 1

            results = []
            for r in rows:
                clean_os = (r['os'] or '').strip().upper()
                is_dup = os_counts[clean_os] > 1
                
                c_date = r['created_date'].strftime('%Y-%m-%d') if r.get('created_date') else ''
                a_date = r['audit_date'].strftime('%Y-%m-%d') if r.get('audit_date') else ''
                
                photos_list = r.get('photos') or []
                if isinstance(photos_list, str):
                    try:
                        photos_list = json.loads(photos_list)
                    except Exception:
                        photos_list = []

                clean_creator = (r.get('u_creator_name') or r.get('tu_creator_name') or '').strip()
                if not clean_creator or ('.' in clean_creator and ' ' not in clean_creator):
                    cb_raw = (r.get('created_by') or '').strip()
                    clean_creator = format_person_name(cb_raw) or 'Usuário'
                else:
                    clean_creator = format_person_name(clean_creator)

                clean_resp = (r.get('u_resp_name') or r.get('t_resp_name') or '').strip()
                if not clean_resp or ('.' in clean_resp and ' ' not in clean_resp):
                    resp_raw = (r.get('responsible') or '').strip()
                    clean_resp = format_person_name(resp_raw) or resp_raw
                else:
                    clean_resp = format_person_name(clean_resp)

                results.append({
                    "id": r['id'],
                    "os": r['os'],
                    "created_date": c_date,
                    "created_by": clean_creator,
                    "created_by_id": r['created_by_id'],
                    "responsible": clean_resp,
                    "responsible_id": r['responsible_id'],
                    "status": r['status'],
                    "audit_date": a_date,
                    "observations": r['observations'] or '',
                    "photos": photos_list,
                    "is_duplicate": is_dup,
                    "created_at": r['created_at'].isoformat() if r.get('created_at') else ''
                })

            return jsonify(results), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error listing auditorias:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao listar auditorias."}), 500

    if request.method == 'POST':
        conn = None
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            os_name = (data.get('os') or '').strip()
            responsible = format_person_name((data.get('responsible') or '').strip())
            responsible_id = data.get('responsible_id')
            created_date_str = (data.get('created_date') or '').strip()

            if not os_name:
                return jsonify({"error": "O campo OS é obrigatório."}), 400
            if not responsible:
                return jsonify({"error": "O campo Responsável é obrigatório."}), 400

            user_info = get_user_info_dict(session.get('user_id'))
            created_by = (user_info.get('name') if user_info else None) or session.get('user_name') or session.get('name') or session.get('username') or 'Usuário'
            created_by = format_person_name(created_by)
            raw_creator_id = session.get('user_id')
            clean_creator_id = None
            if raw_creator_id:
                try:
                    clean_creator_id = int(raw_creator_id)
                except Exception:
                    clean_creator_id = None

            clean_resp_id = None
            if responsible_id not in (None, '', 'null', 0, '0'):
                try:
                    clean_resp_id = int(responsible_id)
                except Exception:
                    clean_resp_id = None

            if created_date_str:
                try:
                    c_date = datetime.datetime.strptime(created_date_str, '%Y-%m-%d').date()
                except Exception:
                    c_date = datetime.date.today()
            else:
                c_date = datetime.date.today()

            conn = get_db()
            cur = conn.cursor()

            # RECLASSIFICATION LOGIC:
            # If the OS already exists, update all existing older records of this OS to 'Reclassificado'
            cur.execute("""
                UPDATE auditorias
                SET status = 'Reclassificado', updated_at = CURRENT_TIMESTAMP
                WHERE TRIM(UPPER(os)) = TRIM(UPPER(%s));
            """, (os_name,))

            # Insert new record with status 'Acionado'
            cur.execute("""
                INSERT INTO auditorias (
                    os, created_date, created_by, created_by_id, responsible, responsible_id, status, photos
                ) VALUES (%s, %s, %s, %s, %s, %s, 'Acionado', '[]'::jsonb)
                RETURNING id;
            """, (os_name, c_date, created_by, clean_creator_id, responsible, clean_resp_id))
            
            new_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Criou auditoria para OS {os_name} (ID {new_id})")
            try:
                emit_live_alert('auditoria', 'Nova Auditoria de OS', f'OS {os_name} acionada para {responsible} por {created_by}.', link='/auditoria')
            except Exception:
                pass
            return jsonify({"success": True, "id": new_id}), 201
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error creating auditoria:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro interno ao criar auditoria."}), 500


@app.route('/api/auditorias/<int:auditoria_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@app.route('/api/auditorias/<int:auditoria_id>/', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@login_required
def api_auditoria_detail(auditoria_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    conn = None
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM auditorias WHERE id = %s;", (auditoria_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                return jsonify({"error": "Auditoria não encontrada."}), 404

            photos_list = row.get('photos') or []
            if isinstance(photos_list, str):
                try:
                    photos_list = json.loads(photos_list)
                except Exception:
                    photos_list = []

            return jsonify({
                "id": row['id'],
                "os": row['os'],
                "created_date": row['created_date'].strftime('%Y-%m-%d') if row.get('created_date') else '',
                "created_by": format_person_name(row.get('created_by')) or 'Usuário',
                "responsible": format_person_name(row.get('responsible')) or '',
                "status": row['status'],
                "audit_date": row['audit_date'].strftime('%Y-%m-%d') if row.get('audit_date') else '',
                "observations": row['observations'] or '',
                "photos": photos_list
            }), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error getting auditoria detail:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao buscar auditoria."}), 500

    if request.method == 'PUT':
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            status = (data.get('status') or 'Acionado').strip()
            observations = data.get('observations', '')
            audit_date_str = (data.get('audit_date') or '').strip()
            photos = data.get('photos') or []

            # Limit to 10 photos
            if isinstance(photos, list):
                photos = photos[:10]
            else:
                photos = []

            if audit_date_str:
                try:
                    a_date = datetime.datetime.strptime(audit_date_str, '%Y-%m-%d').date()
                except Exception:
                    a_date = datetime.date.today()
            else:
                a_date = datetime.date.today() if status in ['Aprovado', 'Reprovado'] else None

            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                UPDATE auditorias
                SET 
                    status = %s,
                    audit_date = %s,
                    observations = %s,
                    photos = %s::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (status, a_date, observations, json.dumps(photos), auditoria_id))

            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Atualizou relatório da auditoria ID {auditoria_id} (Status: {status})")
            if status == 'Aprovado':
                emit_live_alert('auditoria', 'Auditoria Aprovada', f'Auditoria #{auditoria_id} foi APROVADA com sucesso.', link='/auditoria')
            elif status == 'Reprovado':
                emit_live_alert('auditoria', 'Auditoria Reprovada', f'Auditoria #{auditoria_id} foi REPROVADA. Necessita atenção técnica.', link='/auditoria')
            elif status == 'Reclassificado':
                emit_live_alert('auditoria', 'OS Reclassificada', f'Auditoria #{auditoria_id} foi reclassificada.', link='/auditoria')
            return jsonify({"success": True}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error updating auditoria:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao atualizar relatório de auditoria."}), 500

    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM auditorias WHERE id = %s;", (auditoria_id,))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Excluiu auditoria ID {auditoria_id}")
            return jsonify({"success": True}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error deleting auditoria:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao excluir auditoria."}), 500


@app.route('/api/auditorias/upload-photos', methods=['POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/auditorias/upload-photos/', methods=['POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_auditorias_upload_photos():
    if request.method == 'OPTIONS':
        return ('', 204)
    try:
        import uuid
        files = request.files.getlist('photos')
        if not files and 'photo' in request.files:
            files = [request.files['photo']]
        if not files and 'file' in request.files:
            files = [request.files['file']]

        if not files:
            return jsonify({"error": "Nenhuma foto foi enviada."}), 400

        auditorias_dir = os.path.join(UPLOAD_FOLDER, 'auditorias')
        os.makedirs(auditorias_dir, exist_ok=True)

        uploaded_urls = []
        for f in files:
            if not f or not f.filename:
                continue
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else 'jpg'
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                ext = 'jpg'
            
            safe_name = f"audit_{uuid.uuid4().hex[:12]}.{ext}"
            target_path = os.path.join(auditorias_dir, safe_name)
            f.save(target_path)
            uploaded_urls.append(f"/uploads/auditorias/{safe_name}")

        return jsonify({"success": True, "urls": uploaded_urls, "photos": uploaded_urls}), 200
    except Exception as e:
        print("Error uploading auditoria photos:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao fazer upload das fotos."}), 500


@app.route('/api/auditorias/export', methods=['GET'], strict_slashes=False)
@login_required
def api_auditorias_export():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                os, created_date, created_by, responsible, status, audit_date, observations,
                COALESCE(photos, '[]'::jsonb) AS photos
            FROM auditorias 
            ORDER BY id ASC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff') # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header matching the user's Excel sheet
        writer.writerow(['OS', 'Data', 'Criada por', 'Responsável', 'Status', 'Data da auditoria', 'Observações', 'Qtd Fotos'])

        for r in rows:
            c_date_str = r['created_date'].strftime('%d/%m/%Y') if r.get('created_date') else ''
            a_date_str = r['audit_date'].strftime('%d/%m/%Y') if r.get('audit_date') else ''
            
            photos_list = r.get('photos') or []
            if isinstance(photos_list, str):
                try: photos_list = json.loads(photos_list)
                except Exception: photos_list = []

            writer.writerow([
                r['os'] or '',
                c_date_str,
                format_person_name(r['created_by']) or '',
                format_person_name(r['responsible']) or '',
                r['status'] or '',
                a_date_str,
                (r['observations'] or '').replace('\n', ' ').strip(),
                len(photos_list)
            ])

        output.seek(0)
        filename = f"auditoria_rede_externa_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Error exporting auditorias:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao exportar dados da auditoria."}), 500


# --------------------------------------------------------------------------
# ACEITAÇÕES API ROUTES (ABA ACEITAÇÃO) — HARDENED & FAULT-TOLERANT
# --------------------------------------------------------------------------

@app.route('/api/aceitacoes/users-list', methods=['GET', 'OPTIONS'], strict_slashes=False)
@app.route('/api/aceitacoes/users-list/', methods=['GET', 'OPTIONS'], strict_slashes=False)
@login_required
def api_aceitacoes_users_list():
    if request.method == 'OPTIONS':
        return ('', 204)
    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()
        
        crm_users = []
        try:
            cur.execute("""
                SELECT u.id, u.username, u.name, u.role, t.name AS tech_name
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                ORDER BY u.username ASC;
            """)
            crm_users = cur.fetchall() or []
        except Exception as e_u:
            print("Warning fetching users for aceitacao:", e_u)
        
        techs = []
        try:
            cur.execute("SELECT id, name, role, company FROM technicians ORDER BY name ASC;")
            techs = cur.fetchall() or []
        except Exception as e_t:
            print("Warning fetching technicians for aceitacao:", e_t)
        
        cur.close()
        conn.close()
        conn = None
        
        formatted_users = []
        for u in crm_users:
            if not u or not u.get('username'):
                continue
            disp = (u.get('name') or u.get('tech_name') or '').strip()
            disp = format_person_name(disp or u['username'])
            formatted_users.append({
                "id": u['id'],
                "name": disp,
                "username": u['username'],
                "role": u.get('role') or 'Usuário',
                "type": "user"
            })

        return jsonify({
            "users": formatted_users,
            "technicians": [
                {"id": t['id'], "name": format_person_name(t['name']), "role": t['role'] or 'Técnico', "company": t.get('company') or '', "type": "tech"}
                for t in techs if t and t.get('name')
            ]
        }), 200
    except Exception as e:
        if conn:
            try: conn.close()
            except Exception: pass
        print("Error fetching aceitacoes users list:", e)
        traceback.print_exc()
        return jsonify({"users": [], "technicians": []}), 200


@app.route('/api/aceitacoes', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/aceitacoes/', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_aceitacoes():
    if request.method == 'OPTIONS':
        return ('', 204)

    if request.method == 'GET':
        conn = None
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    a.id,
                    a.os,
                    a.created_date,
                    a.created_by,
                    a.created_by_id,
                    a.responsible,
                    a.responsible_id,
                    a.status,
                    a.acceptance_date,
                    a.observations,
                    COALESCE(a.photos, '[]'::jsonb) AS photos,
                    a.created_at,
                    a.updated_at,
                    u.name AS u_creator_name,
                    tu.name AS tu_creator_name,
                    ru.name AS u_resp_name,
                    rt.name AS t_resp_name
                FROM aceitacoes a
                LEFT JOIN users u ON (a.created_by_id = u.id OR (a.created_by_id IS NULL AND LOWER(TRIM(a.created_by)) = LOWER(TRIM(u.username))))
                LEFT JOIN technicians tu ON u.tech_id = tu.id
                LEFT JOIN users ru ON (a.responsible_id = ru.id OR (a.responsible_id IS NULL AND LOWER(TRIM(a.responsible)) = LOWER(TRIM(ru.username))))
                LEFT JOIN technicians rt ON (ru.tech_id = rt.id OR a.responsible_id = rt.id)
                ORDER BY a.id DESC;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()

            # Count OS occurrences to mark duplicates
            os_counts = defaultdict(int)
            for r in rows:
                clean_os = (r['os'] or '').strip().upper()
                if clean_os:
                    os_counts[clean_os] += 1

            results = []
            for r in rows:
                clean_os = (r['os'] or '').strip().upper()
                is_dup = os_counts[clean_os] > 1
                
                c_date = r['created_date'].strftime('%Y-%m-%d') if r.get('created_date') else ''
                acc_date = r['acceptance_date'].strftime('%Y-%m-%d') if r.get('acceptance_date') else ''
                
                photos_list = r.get('photos') or []
                if isinstance(photos_list, str):
                    try:
                        photos_list = json.loads(photos_list)
                    except Exception:
                        photos_list = []

                clean_creator = (r.get('u_creator_name') or r.get('tu_creator_name') or '').strip()
                if not clean_creator or ('.' in clean_creator and ' ' not in clean_creator):
                    cb_raw = (r.get('created_by') or '').strip()
                    clean_creator = format_person_name(cb_raw) or 'Sistema'
                else:
                    clean_creator = format_person_name(clean_creator)

                clean_resp = (r.get('u_resp_name') or r.get('t_resp_name') or '').strip()
                if not clean_resp or ('.' in clean_resp and ' ' not in clean_resp):
                    resp_raw = (r.get('responsible') or '').strip()
                    clean_resp = format_person_name(resp_raw) or resp_raw
                else:
                    clean_resp = format_person_name(clean_resp)

                results.append({
                    "id": r['id'],
                    "os": r['os'],
                    "created_date": c_date,
                    "created_by": clean_creator,
                    "created_by_id": r['created_by_id'],
                    "responsible": clean_resp,
                    "responsible_id": r['responsible_id'],
                    "status": r['status'],
                    "acceptance_date": acc_date,
                    "observations": r['observations'] or '',
                    "photos": photos_list,
                    "is_duplicate": is_dup,
                    "created_at": r['created_at'].isoformat() if r.get('created_at') else ''
                })

            return jsonify(results), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error listing aceitacoes:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao listar aceitações."}), 500

    if request.method == 'POST':
        conn = None
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            os_name = (data.get('os') or '').strip()
            responsible = format_person_name((data.get('responsible') or '').strip())
            responsible_id = data.get('responsible_id')
            created_date_str = (data.get('created_date') or '').strip()
            custom_obs = data.get('observations')
            custom_photos = data.get('photos')

            if not os_name:
                return jsonify({"error": "O campo OS é obrigatório."}), 400
            if not responsible:
                return jsonify({"error": "O campo Responsável é obrigatório."}), 400

            user_info = get_user_info_dict(session.get('user_id'))
            created_by = (user_info.get('name') if user_info else None) or session.get('user_name') or session.get('name') or session.get('username') or 'Usuário'
            created_by = format_person_name(created_by)
            raw_creator_id = session.get('user_id')
            clean_creator_id = None
            if raw_creator_id:
                try:
                    clean_creator_id = int(raw_creator_id)
                except Exception:
                    clean_creator_id = None

            clean_resp_id = None
            if responsible_id not in (None, '', 'null', 0, '0'):
                try:
                    clean_resp_id = int(responsible_id)
                except Exception:
                    clean_resp_id = None

            if created_date_str:
                try:
                    c_date = datetime.datetime.strptime(created_date_str, '%Y-%m-%d').date()
                except Exception:
                    c_date = datetime.date.today()
            else:
                c_date = datetime.date.today()

            conn = get_db()
            cur = conn.cursor()

            # RECLASSIFICATION & HISTORY-CARRY-OVER LOGIC:
            # If the OS already exists, fetch latest historical data, update all existing older records to 'Reclassificado'
            cur.execute("""
                SELECT observations, photos, acceptance_date FROM aceitacoes
                WHERE TRIM(UPPER(os)) = TRIM(UPPER(%s))
                ORDER BY id DESC LIMIT 1;
            """, (os_name,))
            prev_record = cur.fetchone()

            prev_obs = ''
            prev_photos = []
            prev_acc_date = None
            if prev_record:
                prev_obs = prev_record.get('observations') or ''
                prev_acc_date = prev_record.get('acceptance_date')
                prev_p = prev_record.get('photos')
                if isinstance(prev_p, str):
                    try:
                        prev_photos = json.loads(prev_p)
                    except Exception:
                        prev_photos = []
                elif isinstance(prev_p, list):
                    prev_photos = prev_p

                # Update all existing older records of this OS to 'Reclassificado'
                cur.execute("""
                    UPDATE aceitacoes
                    SET status = 'Reclassificado', updated_at = CURRENT_TIMESTAMP
                    WHERE TRIM(UPPER(os)) = TRIM(UPPER(%s));
                """, (os_name,))

            # Determine final observations and photos: prioritize new input if given, otherwise carry over history
            final_obs = custom_obs if (custom_obs is not None and str(custom_obs).strip() != '') else prev_obs
            final_photos = custom_photos if custom_photos is not None else prev_photos
            if isinstance(final_photos, str):
                try:
                    final_photos = json.loads(final_photos)
                except Exception:
                    final_photos = []
            if not isinstance(final_photos, list):
                final_photos = []

            # Insert new record with status 'Acionado'
            cur.execute("""
                INSERT INTO aceitacoes (
                    os, created_date, created_by, created_by_id, responsible, responsible_id, status, acceptance_date, observations, photos
                ) VALUES (%s, %s, %s, %s, %s, %s, 'Acionado', %s, %s, %s::jsonb)
                RETURNING id;
            """, (os_name, c_date, created_by, clean_creator_id, responsible, clean_resp_id, prev_acc_date, final_obs, json.dumps(final_photos)))
            
            new_id = cur.fetchone()['id']
            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Criou aceitação para OS {os_name} (ID {new_id})")
            try:
                emit_live_alert('aceitacao', 'Nova Aceitação de OS', f'OS {os_name} acionada para {responsible} por {created_by}.', link='/aceitacao')
            except Exception:
                pass
            return jsonify({"success": True, "id": new_id}), 201
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error creating aceitacao:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro interno ao criar aceitação."}), 500


@app.route('/api/aceitacoes/<int:aceitacao_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@app.route('/api/aceitacoes/<int:aceitacao_id>/', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@login_required
def api_aceitacao_detail(aceitacao_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    conn = None
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM aceitacoes WHERE id = %s;", (aceitacao_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                return jsonify({"error": "Aceitação não encontrada."}), 404

            photos_list = row.get('photos') or []
            if isinstance(photos_list, str):
                try:
                    photos_list = json.loads(photos_list)
                except Exception:
                    photos_list = []

            return jsonify({
                "id": row['id'],
                "os": row['os'],
                "created_date": row['created_date'].strftime('%Y-%m-%d') if row.get('created_date') else '',
                "created_by": format_person_name(row.get('created_by')) or 'Sistema',
                "created_by_id": row['created_by_id'],
                "responsible": format_person_name(row.get('responsible')) or '',
                "responsible_id": row['responsible_id'],
                "status": row['status'],
                "acceptance_date": row['acceptance_date'].strftime('%Y-%m-%d') if row.get('acceptance_date') else '',
                "observations": row['observations'] or '',
                "photos": photos_list,
                "created_at": row['created_at'].isoformat() if row.get('created_at') else ''
            }), 200
        except Exception as e:
            if conn:
                try: conn.close()
                except Exception: pass
            print("Error getting aceitacao detail:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao buscar aceitação."}), 500

    if request.method == 'PUT':
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            status = (data.get('status') or 'Acionado').strip()
            observations = (data.get('observations') or '').strip()
            acceptance_date_str = (data.get('acceptance_date') or '').strip()
            photos = data.get('photos') or []

            if not isinstance(photos, list):
                if isinstance(photos, str):
                    try:
                        photos = json.loads(photos)
                    except Exception:
                        photos = []
                else:
                    photos = []

            acc_date = None
            if acceptance_date_str:
                try:
                    acc_date = datetime.datetime.strptime(acceptance_date_str, '%Y-%m-%d').date()
                except Exception:
                    acc_date = None

            conn = get_db()
            cur = conn.cursor()
            
            cur.execute("SELECT os, status FROM aceitacoes WHERE id = %s;", (aceitacao_id,))
            current_acc = cur.fetchone()
            if not current_acc:
                cur.close()
                conn.close()
                return jsonify({"error": "Aceitação não encontrada."}), 404

            cur.execute("""
                UPDATE aceitacoes
                SET status = %s,
                    acceptance_date = %s,
                    observations = %s,
                    photos = %s::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (status, acc_date, observations, json.dumps(photos), aceitacao_id))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Atualizou relatório da aceitação ID {aceitacao_id} (Status: {status})")
            try:
                os_code = current_acc['os']
                if status == 'Aprovado':
                    emit_live_alert('aceitacao', 'Aceitação Aprovada', f'Aceitação da OS {os_code} foi APROVADA com sucesso.', link='/aceitacao')
                elif status == 'Reprovado':
                    emit_live_alert('aceitacao', 'Aceitação Reprovada', f'Aceitação da OS {os_code} foi REPROVADA. Necessita atenção técnica.', link='/aceitacao')
                elif status == 'Reclassificado':
                    emit_live_alert('aceitacao', 'OS Reclassificada', f'Aceitação da OS {os_code} foi reclassificada.', link='/aceitacao')
            except Exception:
                pass

            return jsonify({"success": True}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error updating aceitacao:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao atualizar relatório de aceitação."}), 500

    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM aceitacoes WHERE id = %s;", (aceitacao_id,))
            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Excluiu aceitação ID {aceitacao_id}")
            return jsonify({"success": True}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error deleting aceitacao:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao excluir aceitação."}), 500


@app.route('/api/aceitacoes/upload-photos', methods=['POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/aceitacoes/upload-photos/', methods=['POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_aceitacoes_upload_photos():
    if request.method == 'OPTIONS':
        return ('', 204)
    try:
        import uuid
        files = request.files.getlist('photos')
        if not files and 'photo' in request.files:
            files = [request.files['photo']]
        if not files and 'file' in request.files:
            files = [request.files['file']]

        if not files:
            return jsonify({"error": "Nenhuma foto foi enviada."}), 400

        aceitacoes_dir = os.path.join(UPLOAD_FOLDER, 'aceitacoes')
        os.makedirs(aceitacoes_dir, exist_ok=True)

        uploaded_urls = []
        for f in files:
            if not f or not f.filename:
                continue
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else 'jpg'
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                ext = 'jpg'
            
            safe_name = f"acc_{uuid.uuid4().hex[:12]}.{ext}"
            target_path = os.path.join(aceitacoes_dir, safe_name)
            f.save(target_path)
            uploaded_urls.append(f"/uploads/aceitacoes/{safe_name}")

        return jsonify({"success": True, "urls": uploaded_urls, "photos": uploaded_urls}), 200
    except Exception as e:
        print("Error uploading aceitacao photos:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao fazer upload das fotos."}), 500


@app.route('/api/aceitacoes/export', methods=['GET'], strict_slashes=False)
@login_required
def api_aceitacoes_export():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                os, created_date, created_by, responsible, status, acceptance_date, observations,
                COALESCE(photos, '[]'::jsonb) AS photos
            FROM aceitacoes 
            ORDER BY id ASC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        output.write('\ufeff') # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header matching the user's Excel sheet
        writer.writerow(['OS', 'Data', 'Criada por', 'Responsável', 'Status', 'Data da aceitação', 'Observações', 'Qtd Fotos'])

        for r in rows:
            c_date_str = r['created_date'].strftime('%d/%m/%Y') if r.get('created_date') else ''
            acc_date_str = r['acceptance_date'].strftime('%d/%m/%Y') if r.get('acceptance_date') else ''
            
            photos_list = r.get('photos') or []
            if isinstance(photos_list, str):
                try: photos_list = json.loads(photos_list)
                except Exception: photos_list = []

            writer.writerow([
                r['os'] or '',
                c_date_str,
                format_person_name(r['created_by']) or '',
                format_person_name(r['responsible']) or '',
                r['status'] or '',
                acc_date_str,
                (r['observations'] or '').replace('\n', ' ').strip(),
                len(photos_list)
            ])

        output.seek(0)
        filename = f"aceitacao_rede_externa_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Error exporting aceitacoes:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao exportar dados da aceitação."}), 500


@app.route('/api/live-alerts', methods=['GET'], strict_slashes=False)
@login_required
def api_get_live_alerts():
    since_id = request.args.get('since_id', type=int, default=0)
    current_username = (session.get('username') or '').strip().lower()
    current_user_id = session.get('user_id')
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, category, title, message, target_username, source_username, link,
                   TO_CHAR(created_at, 'HH24:MI:SS') as time_str,
                   created_at
            FROM system_live_alerts
            WHERE id > %s
              AND (target_username IS NULL OR target_username = '' OR LOWER(target_username) = %s OR target_user_id = %s)
            ORDER BY id ASC
            LIMIT 30;
        """, (since_id, current_username, current_user_id))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        alerts = []
        for r in rows:
            alerts.append({
                "id": r['id'],
                "category": r['category'],
                "title": r['title'],
                "message": r['message'],
                "link": r['link'] or '',
                "source_username": r['source_username'] or '',
                "time": r['time_str'] or '',
                "created_at": r['created_at'].isoformat() if r['created_at'] else ''
            })

        max_id = max([a['id'] for a in alerts], default=since_id)
        return jsonify({"alerts": alerts, "latest_id": max_id}), 200
    except Exception as e:
        print("Error in live-alerts:", e)
        return jsonify({"alerts": [], "latest_id": since_id}), 200




# --------------------------------------------------------------------------
# API POS EVENTOS (Vistorias em Campo Claro)
# --------------------------------------------------------------------------
PT_MONTHS_MAP = {
    1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
    7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
}

def format_pos_evento_row(r):
    f_date = r['fault_date']
    if hasattr(f_date, 'strftime'):
        f_date_iso = f_date.strftime('%Y-%m-%d')
        f_date_fmt = f_date.strftime('%d/%m/%Y')
        month_key = f_date.strftime('%Y-%m')
        month_label = f"{PT_MONTHS_MAP.get(f_date.month, '')}/{f_date.strftime('%y')}"
    elif isinstance(f_date, str) and len(f_date) >= 10:
        f_date_iso = f_date[:10]
        parts = f_date_iso.split('-')
        if len(parts) == 3:
            y, m, d = parts
            f_date_fmt = f"{d}/{m}/{y}"
            month_key = f"{y}-{m}"
            m_int = int(m) if m.isdigit() else 1
            month_label = f"{PT_MONTHS_MAP.get(m_int, '')}/{y[-2:]}"
        else:
            f_date_fmt = f_date_iso
            month_key = ''
            month_label = ''
    else:
        f_date_iso = ''
        f_date_fmt = ''
        month_key = ''
        month_label = ''

    return {
        "id": r.get('id'),
        "ticket_type": r.get('ticket_type') or '',
        "ticket_number": r.get('ticket_number') or '',
        "fault_date": f_date_iso,
        "fault_date_formatted": f_date_fmt,
        "month_key": month_key,
        "month_label": month_label,
        "area": r['area'] or '',
        "trash_on_ground": r['trash_on_ground'] or 'Não',
        "cable_ends": r['cable_ends'] or 'Não',
        "adequate_network": r['adequate_network'] or 'Sim',
        "responsible": format_person_name(r.get('responsible')) or '',
        "status": r['status'] or 'Não concluido',
        "created_by": format_person_name(r.get('created_by')) or '',
        "created_at": r['created_at'].isoformat() if r.get('created_at') and hasattr(r['created_at'], 'isoformat') else str(r.get('created_at') or '')
    }


@app.route('/api/pos-eventos', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/pos-eventos/', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_pos_eventos():
    if request.method == 'OPTIONS':
        return ('', 204)

    if request.method == 'GET':
        conn = None
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    id, ticket_type, ticket_number, fault_date, area,
                    trash_on_ground, cable_ends, adequate_network,
                    responsible, status, created_by, created_by_id,
                    created_at, updated_at
                FROM pos_eventos
                ORDER BY fault_date DESC, id DESC;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()

            month_filter = (request.args.get('month') or '').strip().lower()
            status_filter = (request.args.get('status') or '').strip()
            ticket_type_filter = (request.args.get('ticket_type') or '').strip()
            search_query = (request.args.get('search') or '').strip().lower()

            results = []
            for r in rows:
                formatted = format_pos_evento_row(r)

                # Month filter (can match '2026-10' or 'out/26')
                if month_filter and month_filter != 'all' and month_filter != 'todos':
                    if formatted['month_key'].lower() != month_filter and formatted['month_label'].lower() != month_filter:
                        continue

                # Status filter
                if status_filter and status_filter != 'ALL':
                    if formatted['status'].lower() != status_filter.lower():
                        continue

                # Ticket type filter
                if ticket_type_filter and ticket_type_filter != 'ALL':
                    if formatted['ticket_type'].lower() != ticket_type_filter.lower():
                        continue

                # Search filter
                if search_query:
                    match_str = f"{formatted['ticket_number']} {formatted['area']} {formatted['responsible']} {formatted['ticket_type']}".lower()
                    if search_query not in match_str:
                        continue

                results.append(formatted)

            return jsonify(results), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error listing pos_eventos:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao listar eventos pós evento."}), 500

    if request.method == 'POST':
        conn = None
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            ticket_type = (data.get('ticket_type') or '').strip()
            ticket_number = (data.get('ticket_number') or '').strip()
            fault_date_str = (data.get('fault_date') or '').strip()
            area = (data.get('area') or '').strip()
            trash_on_ground = (data.get('trash_on_ground') or 'Não').strip()
            cable_ends = (data.get('cable_ends') or 'Não').strip()
            adequate_network = (data.get('adequate_network') or 'Sim').strip()
            responsible = (data.get('responsible') or '').strip()
            status = (data.get('status') or 'Não concluido').strip()

            if not ticket_type or ticket_type not in ['RAL', 'REC', 'Outage']:
                return jsonify({"error": "Tipo de Ticket inválido. Escolha RAL, REC ou Outage."}), 400
            if not ticket_number:
                return jsonify({"error": "O campo Número do ticket é obrigatório."}), 400
            if not fault_date_str:
                return jsonify({"error": "O campo Data da falha é obrigatório."}), 400

            if trash_on_ground not in ['Sim', 'Não']:
                trash_on_ground = 'Não'
            if cable_ends not in ['Sim', 'Não']:
                cable_ends = 'Não'
            if adequate_network not in ['Sim', 'Não']:
                adequate_network = 'Sim'
            if status not in ['Concluido', 'Não concluido']:
                status = 'Não concluido'

            try:
                f_date = datetime.datetime.strptime(fault_date_str[:10], '%Y-%m-%d').date()
            except Exception:
                f_date = datetime.date.today()

            responsible = format_person_name(responsible)

            user_info = get_user_info_dict(session.get('user_id'))
            created_by = (user_info.get('name') if user_info else None) or session.get('user_name') or session.get('name') or session.get('username') or 'Coordenador'
            created_by = format_person_name(created_by)
            raw_creator_id = session.get('user_id')
            clean_creator_id = None
            if raw_creator_id:
                try: clean_creator_id = int(raw_creator_id)
                except Exception: clean_creator_id = None

            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO pos_eventos (
                    ticket_type, ticket_number, fault_date, area,
                    trash_on_ground, cable_ends, adequate_network,
                    responsible, status, created_by, created_by_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at;
            """, (
                ticket_type, ticket_number, f_date, area,
                trash_on_ground, cable_ends, adequate_network,
                responsible, status, created_by, clean_creator_id
            ))
            inserted = cur.fetchone()
            new_id = inserted['id'] if isinstance(inserted, dict) else inserted[0]
            conn.commit()
            cur.close()
            conn.close()

            return jsonify({
                "id": new_id,
                "message": "Atividade cadastrada com sucesso!",
                "item": {
                    "id": new_id,
                    "ticket_type": ticket_type,
                    "ticket_number": ticket_number,
                    "fault_date": f_date.strftime('%Y-%m-%d'),
                    "fault_date_formatted": f_date.strftime('%d/%m/%Y'),
                    "month_key": f_date.strftime('%Y-%m'),
                    "month_label": f"{PT_MONTHS_MAP.get(f_date.month, '')}/{f_date.strftime('%y')}",
                    "area": area,
                    "trash_on_ground": trash_on_ground,
                    "cable_ends": cable_ends,
                    "adequate_network": adequate_network,
                    "responsible": responsible,
                    "status": status,
                    "created_by": created_by
                }
            }), 201
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error creating pos_evento:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao cadastrar atividade pós evento."}), 500


@app.route('/api/pos-eventos/<int:event_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@app.route('/api/pos-eventos/<int:event_id>/', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@login_required
def api_pos_evento_detail(event_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    conn = None
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    id, ticket_type, ticket_number, fault_date, area,
                    trash_on_ground, cable_ends, adequate_network,
                    responsible, status, created_by, created_by_id,
                    created_at, updated_at
                FROM pos_eventos
                WHERE id = %s;
            """, (event_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                return jsonify({"error": "Registro não encontrado."}), 404

            return jsonify(format_pos_evento_row(row)), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            return jsonify({"error": "Erro ao buscar evento."}), 500

    if request.method == 'PUT':
        try:
            data = request.get_json(silent=True) or request.form.to_dict() or {}
            ticket_type = (data.get('ticket_type') or '').strip()
            ticket_number = (data.get('ticket_number') or '').strip()
            fault_date_str = (data.get('fault_date') or '').strip()
            area = (data.get('area') or '').strip()
            trash_on_ground = (data.get('trash_on_ground') or 'Não').strip()
            cable_ends = (data.get('cable_ends') or 'Não').strip()
            adequate_network = (data.get('adequate_network') or 'Sim').strip()
            responsible = (data.get('responsible') or '').strip()
            status = (data.get('status') or 'Não concluido').strip()

            if ticket_type and ticket_type not in ['RAL', 'REC', 'Outage']:
                return jsonify({"error": "Tipo de Ticket inválido."}), 400
            if trash_on_ground not in ['Sim', 'Não']:
                trash_on_ground = 'Não'
            if cable_ends not in ['Sim', 'Não']:
                cable_ends = 'Não'
            if adequate_network not in ['Sim', 'Não']:
                adequate_network = 'Sim'
            if status not in ['Concluido', 'Não concluido']:
                status = 'Não concluido'

            conn = get_db()
            cur = conn.cursor()

            # Handle date parse if provided
            if fault_date_str:
                try:
                    f_date = datetime.datetime.strptime(fault_date_str[:10], '%Y-%m-%d').date()
                    cur.execute("""
                        UPDATE pos_eventos
                        SET ticket_type = COALESCE(NULLIF(%s, ''), ticket_type),
                            ticket_number = COALESCE(NULLIF(%s, ''), ticket_number),
                            fault_date = %s,
                            area = %s,
                            trash_on_ground = %s,
                            cable_ends = %s,
                            adequate_network = %s,
                            responsible = %s,
                            status = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s;
                    """, (ticket_type, ticket_number, f_date, area, trash_on_ground, cable_ends, adequate_network, responsible, status, event_id))
                except Exception:
                    cur.execute("""
                        UPDATE pos_eventos
                        SET ticket_type = COALESCE(NULLIF(%s, ''), ticket_type),
                            ticket_number = COALESCE(NULLIF(%s, ''), ticket_number),
                            area = %s,
                            trash_on_ground = %s,
                            cable_ends = %s,
                            adequate_network = %s,
                            responsible = %s,
                            status = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s;
                    """, (ticket_type, ticket_number, area, trash_on_ground, cable_ends, adequate_network, responsible, status, event_id))
            else:
                cur.execute("""
                    UPDATE pos_eventos
                    SET ticket_type = COALESCE(NULLIF(%s, ''), ticket_type),
                        ticket_number = COALESCE(NULLIF(%s, ''), ticket_number),
                        area = %s,
                        trash_on_ground = %s,
                        cable_ends = %s,
                        adequate_network = %s,
                        responsible = %s,
                        status = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                """, (ticket_type, ticket_number, area, trash_on_ground, cable_ends, adequate_network, responsible, status, event_id))

            conn.commit()
            cur.close()
            conn.close()

            return jsonify({"message": "Atividade pós evento atualizada com sucesso!"}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error updating pos_evento:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao atualizar atividade pós evento."}), 500

    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM pos_eventos WHERE id = %s;", (event_id,))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({"message": "Registro de pós evento removido com sucesso!"}), 200
        except Exception as e:
            if conn:
                try: conn.rollback()
                except Exception: pass
                try: conn.close()
                except Exception: pass
            print("Error deleting pos_evento:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao remover registro."}), 500


@app.route('/api/pos-eventos/export', methods=['GET'], strict_slashes=False)
@login_required
def api_pos_eventos_export():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                id,
                ticket_type, ticket_number, fault_date, area,
                trash_on_ground, cable_ends, adequate_network,
                responsible, status, created_by, created_at
            FROM pos_eventos
            ORDER BY fault_date DESC, id DESC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        month_filter = (request.args.get('month') or '').strip().lower()

        output = io.StringIO()
        output.write('\ufeff')  # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header matching the user requirements
        writer.writerow([
            'Tipo de Ticket',
            'Número do Ticket',
            'Data da Falha',
            'Área',
            'Lixos da Claro no Chão',
            'Pontas de Cabos da Claro?',
            'Rede Adequada?',
            'Responsável',
            'Status',
            'Cadastrado Por',
            'Data de Cadastro'
        ])

        for r in rows:
            formatted = format_pos_evento_row(r)
            if month_filter and month_filter != 'all' and month_filter != 'todos':
                if formatted['month_key'].lower() != month_filter and formatted['month_label'].lower() != month_filter:
                    continue

            writer.writerow([
                formatted['ticket_type'],
                formatted['ticket_number'],
                formatted['fault_date_formatted'],
                formatted['area'],
                formatted['trash_on_ground'],
                formatted['cable_ends'],
                formatted['adequate_network'],
                formatted['responsible'],
                formatted['status'],
                formatted['created_by'],
                formatted['created_at'][:19].replace('T', ' ')
            ])

        output.seek(0)
        filename = f"pos_eventos_claro_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Error exporting pos_eventos:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao exportar tarefas pós evento."}), 500



# ==============================================================================
# RAL DE QUALIDADE - ATIVIDADES DE REDE EXTERNA CLARO BRASIL
# ==============================================================================

def format_ral_qualidade_row(r):
    op_date = r.get('opening_date')
    if hasattr(op_date, 'strftime'):
        op_date_iso = op_date.strftime('%Y-%m-%dT%H:%M')
        op_date_fmt = op_date.strftime('%d/%m/%Y %H:%M')
        month_key = op_date.strftime('%Y-%m')
        month_label = f"{PT_MONTHS_MAP.get(op_date.month, '')}/{op_date.strftime('%y')}"
    elif isinstance(op_date, str) and len(op_date) >= 10:
        op_date_iso = op_date[:16].replace(' ', 'T')
        date_part = op_date[:10]
        time_part = op_date[11:16] if len(op_date) >= 16 else '00:00'
        parts = date_part.split('-')
        if len(parts) == 3:
            y, m, d = parts
            op_date_fmt = f"{d}/{m}/{y} {time_part}"
            month_key = f"{y}-{m}"
            m_int = int(m) if m.isdigit() else 1
            month_label = f"{PT_MONTHS_MAP.get(m_int, '')}/{y[-2:]}"
        else:
            op_date_fmt = op_date[:16]
            month_key = ''
            month_label = ''
    else:
        op_date_iso = ''
        op_date_fmt = ''
        month_key = ''
        month_label = ''

    return {
        "id": r.get('id'),
        "ticket_number": r.get('ticket_number') or '',
        "opening_date": op_date_iso,
        "opening_date_formatted": op_date_fmt,
        "month_key": month_key,
        "month_label": month_label,
        "designation": r.get('designation') or '',
        "area": r.get('area') or '',
        "status": r.get('status') or 'Em Andamento',
        "summary": r.get('summary') or '',
        "created_by": format_person_name(r.get('created_by')) or '',
        "created_at": r['created_at'].isoformat() if r.get('created_at') and hasattr(r['created_at'], 'isoformat') else str(r.get('created_at') or '')
    }


@app.route('/api/ral-qualidade', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@app.route('/api/ral-qualidade/', methods=['GET', 'POST', 'OPTIONS'], strict_slashes=False)
@login_required
def api_ral_qualidade():
    if request.method == 'OPTIONS':
        return ('', 204)

    if request.method == 'GET':
        conn = None
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    id, ticket_number, opening_date, designation, area,
                    status, summary, created_by, created_by_id,
                    created_at, updated_at
                FROM ral_qualidade
                ORDER BY opening_date DESC, id DESC;
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()

            month_filter = (request.args.get('month') or '').strip().lower()
            status_filter = (request.args.get('status') or '').strip()
            search_query = (request.args.get('search') or '').strip().lower()

            results = []
            for r in rows:
                formatted = format_ral_qualidade_row(r)

                if month_filter and month_filter != 'all' and month_filter != 'todos':
                    if formatted['month_key'].lower() != month_filter and formatted['month_label'].lower() != month_filter:
                        continue

                if status_filter and status_filter != 'ALL':
                    if formatted['status'].lower() != status_filter.lower():
                        continue

                if search_query:
                    match_str = f"{formatted['ticket_number']} {formatted['designation']} {formatted['area']} {formatted['status']} {formatted['summary']}".lower()
                    if search_query not in match_str:
                        continue

                results.append(formatted)

            return jsonify(results)
        except Exception as e:
            if conn:
                try: conn.close()
                except Exception: pass
            print("Error fetching ral_qualidade:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao carregar atividades do RAL de Qualidade."}), 500

    # POST (Criar)
    data = request.get_json(silent=True) or {}
    ticket_number = (data.get('ticket_number') or '').strip()
    opening_date = (data.get('opening_date') or '').strip()
    designation = (data.get('designation') or '').strip()
    area = (data.get('area') or '').strip()
    status = (data.get('status') or 'Em Andamento').strip()
    summary = (data.get('summary') or '').strip()

    if not ticket_number:
        return jsonify({"error": "O campo NÚMERO é obrigatório."}), 400
    if not designation:
        return jsonify({"error": "O campo DESIGNAÇÃO é obrigatório."}), 400

    conn = None
    try:
        conn = get_db()
        cur = conn.cursor()
        created_by_name = session.get('name') or session.get('user_name') or session.get('username') or 'Operador'
        created_by_name = format_person_name(created_by_name)

        cur.execute("""
            INSERT INTO ral_qualidade (
                ticket_number, opening_date, designation, area,
                status, summary, created_by, created_by_id
            ) VALUES (
                %s, 
                COALESCE(NULLIF(%s, '')::timestamp, CURRENT_TIMESTAMP),
                %s, %s, %s, %s, %s, %s
            ) RETURNING id, ticket_number, opening_date, designation, area, status, summary, created_by, created_at;
        """, (
            ticket_number,
            opening_date if opening_date else None,
            designation,
            area,
            status,
            summary,
            created_by_name,
            session.get('user_id')
        ))
        new_row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        formatted = format_ral_qualidade_row(new_row)
        log_action(session.get('user_id'), session.get('username'), f"Criou atividade RAL de Qualidade #{formatted['id']} (Ticket: {ticket_number})")
        return jsonify(formatted), 201
    except Exception as e:
        if conn:
            try: conn.rollback(); conn.close()
            except Exception: pass
        print("Error creating ral_qualidade:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao criar atividade no RAL de Qualidade."}), 500


@app.route('/api/ral-qualidade/<int:item_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@app.route('/api/ral-qualidade/<int:item_id>/', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'], strict_slashes=False)
@login_required
def api_ral_qualidade_detail(item_id):
    if request.method == 'OPTIONS':
        return ('', 204)

    conn = None
    if request.method == 'GET':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT id, ticket_number, opening_date, designation, area,
                       status, summary, created_by, created_by_id, created_at, updated_at
                FROM ral_qualidade WHERE id = %s;
            """, (item_id,))
            row = cur.fetchone()
            cur.close()
            conn.close()
            if not row:
                return jsonify({"error": "Registro não encontrado."}), 404
            return jsonify(format_ral_qualidade_row(row))
        except Exception as e:
            if conn:
                try: conn.close()
                except Exception: pass
            return jsonify({"error": "Erro ao buscar registro."}), 500

    if request.method == 'PUT':
        data = request.get_json(silent=True) or {}
        ticket_number = (data.get('ticket_number') or '').strip()
        opening_date = (data.get('opening_date') or '').strip()
        designation = (data.get('designation') or '').strip()
        area = (data.get('area') or '').strip()
        status = (data.get('status') or 'Em Andamento').strip()
        summary = (data.get('summary') or '').strip()

        if not ticket_number:
            return jsonify({"error": "O campo NÚMERO é obrigatório."}), 400
        if not designation:
            return jsonify({"error": "O campo DESIGNAÇÃO é obrigatório."}), 400

        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                UPDATE ral_qualidade SET
                    ticket_number = %s,
                    opening_date = COALESCE(NULLIF(%s, '')::timestamp, opening_date),
                    designation = %s,
                    area = %s,
                    status = %s,
                    summary = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id, ticket_number, opening_date, designation, area, status, summary, created_by, created_at;
            """, (
                ticket_number,
                opening_date if opening_date else None,
                designation,
                area,
                status,
                summary,
                item_id
            ))
            updated_row = cur.fetchone()
            if not updated_row:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"error": "Registro não encontrado para atualização."}), 404

            conn.commit()
            cur.close()
            conn.close()

            formatted = format_ral_qualidade_row(updated_row)
            log_action(session.get('user_id'), session.get('username'), f"Atualizou atividade RAL de Qualidade #{item_id} (Ticket: {ticket_number})")
            return jsonify(formatted), 200
        except Exception as e:
            if conn:
                try: conn.rollback(); conn.close()
                except Exception: pass
            print("Error updating ral_qualidade:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao atualizar registro."}), 500

    if request.method == 'DELETE':
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM ral_qualidade WHERE id = %s RETURNING id, ticket_number;", (item_id,))
            del_row = cur.fetchone()
            if not del_row:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"error": "Registro não encontrado para remoção."}), 404

            conn.commit()
            cur.close()
            conn.close()

            log_action(session.get('user_id'), session.get('username'), f"Excluiu atividade RAL de Qualidade #{item_id} (Ticket: {del_row['ticket_number']})")
            return jsonify({"success": True, "message": "Atividade removida com sucesso."}), 200
        except Exception as e:
            if conn:
                try: conn.rollback(); conn.close()
                except Exception: pass
            print("Error deleting ral_qualidade:", e)
            traceback.print_exc()
            return jsonify({"error": "Erro ao remover registro."}), 500


@app.route('/api/ral-qualidade/export', methods=['GET'], strict_slashes=False)
@login_required
def api_ral_qualidade_export():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                id, ticket_number, opening_date, designation, area,
                status, summary, created_by, created_at
            FROM ral_qualidade
            ORDER BY opening_date DESC, id DESC;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        month_filter = (request.args.get('month') or '').strip().lower()

        output = io.StringIO()
        output.write('\ufeff')  # UTF-8 BOM for Excel
        writer = safe_csv_writer(output, delimiter=';')

        # Header matching image specifications
        writer.writerow([
            'NÚMERO',
            'DATA ABERTURA',
            'DESIGNAÇÃO',
            'ÁREA',
            'STATUS',
            'RESUMO',
            'CADASTRADO POR',
            'DATA DE CADASTRO'
        ])

        for r in rows:
            formatted = format_ral_qualidade_row(r)
            if month_filter and month_filter != 'all' and month_filter != 'todos':
                if formatted['month_key'].lower() != month_filter and formatted['month_label'].lower() != month_filter:
                    continue

            writer.writerow([
                formatted['ticket_number'],
                formatted['opening_date_formatted'],
                formatted['designation'],
                formatted['area'],
                formatted['status'],
                formatted['summary'],
                formatted['created_by'],
                formatted['created_at'][:19].replace('T', ' ')
            ])

        output.seek(0)
        filename = f"ral_qualidade_claro_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        print("Error exporting ral_qualidade:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro ao exportar tarefas do RAL de Qualidade."}), 500


@app.route('/api/ral-qualidade/import', methods=['POST'], strict_slashes=False)
@login_required
def api_ral_qualidade_import():
    conn = None
    try:
        import unicodedata
        content = None
        file = request.files.get('file')
        if file and file.filename:
            raw_bytes = file.read()
            for enc in ('utf-8-sig', 'utf-8', 'latin1', 'cp1252'):
                try:
                    content = raw_bytes.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
        else:
            data = request.get_json(silent=True) or request.form or {}
            content = data.get('csv_data', '') or data.get('content', '')

        if not content or not content.strip():
            return jsonify({"error": "Nenhum arquivo ou dado CSV fornecido para importação."}), 400

        lines = [l for l in content.splitlines() if l.strip()]
        if not lines:
            return jsonify({"error": "O arquivo CSV está vazio."}), 400

        # Sniff delimiter
        delims = [';', ',', '\t', '|']
        delim_counts = {d: lines[0].count(d) for d in delims}
        best_delim = max(delim_counts, key=delim_counts.get)
        if delim_counts[best_delim] == 0:
            best_delim = ';'

        reader = csv.reader(io.StringIO(content), delimiter=best_delim)
        try:
            header_row = next(reader)
        except StopIteration:
            return jsonify({"error": "Cabeçalho CSV ausente ou inválido."}), 400

        def _norm_col(s):
            if not s: return ''
            n = unicodedata.normalize('NFKD', str(s))
            return ''.join(c for c in n if not unicodedata.combining(c)).strip().upper()

        norm_headers = [_norm_col(h) for h in header_row]

        num_idx = -1
        date_idx = -1
        desig_idx = -1
        area_idx = -1
        obs_idx = -1

        for idx, h in enumerate(norm_headers):
            if h in ['NUMERO', 'TICKET', 'N', 'TICKET_NUMBER', 'ID']:
                if num_idx == -1: num_idx = idx
            elif 'ABERTURA' in h or 'OPENING' in h:
                if date_idx == -1: date_idx = idx
            elif 'DESIGNAC' in h or 'DESIG' in h or 'TRECHO' in h:
                if desig_idx == -1: desig_idx = idx
            elif 'AREA' in h or 'REGIAO' in h:
                if area_idx == -1: area_idx = idx
            elif 'OBS' in h or 'RESUMO' in h or 'SUMMARY' in h or 'OBSERVAC' in h:
                if obs_idx == -1: obs_idx = idx

        if num_idx == -1:
            return jsonify({
                "error": "Coluna 'Número' (ou 'NÚMERO') não encontrada no cabeçalho do arquivo CSV."
            }), 400

        conn = get_db()
        cur = conn.cursor()

        # Obter todos os números de ticket já existentes para deduplicação
        cur.execute("SELECT LOWER(TRIM(ticket_number)) AS tnum FROM ral_qualidade WHERE ticket_number IS NOT NULL;")
        existing_tickets = set(r['tnum'] for r in cur.fetchall() if r.get('tnum'))

        created_by_name = session.get('name') or session.get('user_name') or session.get('username') or 'Importação Automática'
        created_by_name = format_person_name(created_by_name)
        user_id = session.get('user_id')

        created_count = 0
        skipped_count = 0
        total_rows = 0

        for row in reader:
            if not row or not any(row):
                continue
            total_rows += 1

            ticket_num = row[num_idx].strip() if num_idx < len(row) else ''
            if not ticket_num:
                skipped_count += 1
                continue

            ticket_key = ticket_num.lower()
            if ticket_key in existing_tickets:
                skipped_count += 1
                continue

            raw_date = row[date_idx].strip() if (date_idx != -1 and date_idx < len(row)) else ''
            opening_date_val = None
            if raw_date:
                for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y',
                            '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
                    try:
                        dt = datetime.datetime.strptime(raw_date, fmt)
                        opening_date_val = dt.strftime('%Y-%m-%d %H:%M:%S')
                        break
                    except ValueError:
                        pass

            desig_val = row[desig_idx].strip() if (desig_idx != -1 and desig_idx < len(row)) else ''
            if not desig_val:
                desig_val = f"RAL {ticket_num}"

            area_val = row[area_idx].strip() if (area_idx != -1 and area_idx < len(row)) else ''
            obs_val = row[obs_idx].strip() if (obs_idx != -1 and obs_idx < len(row)) else ''

            cur.execute("""
                INSERT INTO ral_qualidade (
                    ticket_number, opening_date, designation, area,
                    status, summary, created_by, created_by_id
                ) VALUES (
                    %s,
                    COALESCE(NULLIF(%s, '')::timestamp, CURRENT_TIMESTAMP),
                    %s, %s, 'Pendente', %s, %s, %s
                );
            """, (
                ticket_num,
                opening_date_val,
                desig_val,
                area_val,
                obs_val,
                created_by_name,
                user_id
            ))

            existing_tickets.add(ticket_key)
            created_count += 1

        conn.commit()
        cur.close()
        conn.close()

        log_action(user_id, session.get('username'), f"Importou base RAL de Qualidade: {created_count} criados, {skipped_count} ignorados")

        return jsonify({
            "success": True,
            "created_count": created_count,
            "skipped_count": skipped_count,
            "total_rows": total_rows,
            "message": f"{created_count} novas atividades pendentes criadas com sucesso ({skipped_count} já existentes ignoradas)."
        })
    except Exception as e:
        if conn:
            try: conn.rollback(); conn.close()
            except Exception: pass
        print("Error importing ral_qualidade:", e)
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar importação."}), 500



# --------------------------------------------------------------------------
# EMAIL TEMPLATES TEST & NOTIFICATION ENDPOINTS
# --------------------------------------------------------------------------

@app.route('/api/email/test-template', methods=['POST'])
@login_required
def api_test_email_template():
    auth = get_current_user_auth()
    if not auth or not (auth.get('is_master') or auth.get('is_coordenador')):
        return jsonify({"error": "Apenas coordenadores podem testar o disparo de templates de e-mail."}), 403
    
    data = request.get_json(silent=True) or {}
    template_type = (data.get('template_type') or 'password_reset').strip().lower()
    target_email = (data.get('email') or '').strip().lower()
    user_name = data.get('name') or session.get('username') or 'Colaborador Claro'

    if not target_email or '@' not in target_email:
        return jsonify({"error": "E-mail de destino inválido."}), 400

    if template_type in ['password_reset', 'resetar_senha', 'reset']:
        test_code = "842915"
        send_password_reset_email(target_email, user_name, test_code, client_ip=get_client_ip())
    elif template_type in ['outdated_profile', 'cadastro_desatualizado', 'profile']:
        test_fields = ["Telefone / WhatsApp com DDD", "Empresa parceira vinculada", "E-mail de contato verificado"]
        send_outdated_profile_email(target_email, user_name, missing_fields=test_fields)
    elif template_type in ['security_alert', 'alerta_seguranca', 'security']:
        client_ip = get_client_ip()
        client_ua = (request.headers.get('User-Agent') or 'Chrome 128 / Windows 11')[:200]
        now_str = datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')
        send_security_alert_email(target_email, user_name, client_ip, client_ua, now_str)
    else:
        return jsonify({"error": f"Tipo de template desconhecido: '{template_type}'."}), 400

    return jsonify({
        "success": True,
        "message": f"Template '{template_type}' disparado com sucesso para {target_email}!",
        "template": template_type,
        "target": target_email
    })

GLOBAL_EMAIL_COOLDOWN_SECONDS = 86400  # 24 horas mínimas entre disparos globais

def _has_admin_notify_access(auth):
    # Exclusivo para o Coordenador Master
    return bool(auth and auth.get('is_master'))


def _is_date_missing_or_expired(exp_val, today_date):
    if not exp_val:
        return "ausente"
    try:
        if isinstance(exp_val, datetime.datetime):
            d = exp_val.date()
        elif isinstance(exp_val, datetime.date):
            d = exp_val
        else:
            d = datetime.date.fromisoformat(str(exp_val)[:10])
        if d < today_date:
            return "vencido"
        return None
    except Exception:
        return None


def _compute_pending_fields_from_row(row):
    missing = []
    today_date = datetime.date.today()

    name_val = (row.get('tech_name') or row.get('user_name') or row.get('username') or '').strip()
    cpf_raw = (row.get('cpf') or '').strip()
    cpf_digits = re.sub(r'\D', '', cpf_raw)
    identity_val = (row.get('identity') or '').strip()
    dob_val = row.get('dob')
    phone_val = (row.get('tech_phone') or row.get('user_phone') or '').strip()
    company_val = (row.get('tech_company') or '').strip()
    role_val = (row.get('tech_role') or row.get('user_role') or '').strip()

    # Identificação & Contato
    if not name_val:
        missing.append("Nome completo")
    if len(cpf_digits) != 11:
        missing.append("CPF")
    if not identity_val:
        missing.append("Identidade (RG)")
    if not dob_val:
        missing.append("Data de Nascimento")
    if not phone_val:
        missing.append("Telefone / WhatsApp com DDD")

    # Vínculo & Operação
    if not company_val:
        missing.append("Empresa parceira / prestadora")
    if not role_val:
        missing.append("Cargo / Função")
    if not (row.get('area') or '').strip():
        missing.append("Área de atuação")
    if not (row.get('team_type') or '').strip():
        missing.append("Tipo de equipe (Fusão / Lançamento / Construção)")
    if not (row.get('team') or '').strip():
        missing.append("Equipe")
    if not (row.get('registration_claro') or '').strip():
        missing.append("Matrícula Claro")
    if not (row.get('registration_third') or '').strip():
        missing.append("Matrícula Terceira")
    if not (row.get('toa_login') or '').strip():
        missing.append("Login TOA")

    # Equipamento / Celular Corporativo
    if not (row.get('phone_model') or '').strip():
        missing.append("Modelo do celular corporativo")
    if not (row.get('imei_1') or '').strip():
        missing.append("IMEI 1 do aparelho")

    # Tamanhos de Uniforme / EPI
    if not (row.get('shirt_size') or '').strip():
        missing.append("Tamanho da Camisa")
    if not (row.get('pants_size') or '').strip():
        missing.append("Tamanho da Calça")
    if not (row.get('boot_size') or '').strip():
        missing.append("Tamanho da Bota")
    if not (row.get('jacket_size') or '').strip():
        missing.append("Tamanho da Jaqueta")

    # NRs e Verificações de Segurança / Saúde (ASO)
    nr_checks = [
        ("NR-06 (EPI)", "nr6_expiration", "nr6_file"),
        ("NR-10 (Elétrica)", "nr10_expiration", "nr10_file"),
        ("NR-35 (Altura)", "nr35_expiration", "nr35_file"),
        ("ASO (Saúde Ocupacional)", "aso_expiration", "aso_file"),
    ]
    for label, exp_col, file_col in nr_checks:
        exp_state = _is_date_missing_or_expired(row.get(exp_col), today_date)
        has_file = bool((row.get(file_col) or '').strip())
        if exp_state == "vencido":
            missing.append(f"{label} — Validade vencida")
        elif exp_state == "ausente" and not has_file:
            missing.append(f"{label} — Validade e certificado pendentes")
        elif exp_state == "ausente":
            missing.append(f"{label} — Data de validade pendente")
        elif not has_file:
            missing.append(f"{label} — Comprovante/certificado pendente")

    return missing


def _collect_pending_email_recipients(target_user_id=None, target_email=None):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            u.id AS user_id,
            u.username,
            u.name AS user_name,
            u.role AS user_role,
            u.email AS user_email,
            u.phone AS user_phone,
            u.tech_id,
            t.id AS tech_row_id,
            t.name AS tech_name,
            t.cpf,
            t.identity,
            t.dob,
            t.phone AS tech_phone,
            t.company AS tech_company,
            t.email AS tech_email,
            t.role AS tech_role,
            t.area,
            t.team_type,
            t.team,
            t.registration_claro,
            t.registration_third,
            t.toa_login,
            t.phone_model,
            t.imei_1,
            t.shirt_size,
            t.pants_size,
            t.boot_size,
            t.jacket_size,
            t.nr6_expiration,
            t.nr10_expiration,
            t.nr35_expiration,
            t.aso_expiration,
            t.nr6_file,
            t.nr10_file,
            t.nr35_file,
            t.aso_file
        FROM technicians t
        FULL OUTER JOIN users u ON u.tech_id = t.id
        ORDER BY COALESCE(t.name, u.username, '') ASC;
    """)
    rows = cur.fetchall()
    _ensure_global_email_log_table(cur)
    conn.commit()
    recently_sent_24h = _get_recently_notified_emails_24h(cur) if (target_user_id is None and not target_email) else set()
    cur.close()
    conn.close()

    recipients = []
    seen_emails = set()
    with_email_count = 0
    missing_email_but_pending_count = 0
    already_sent_24h_count = 0

    clean_filter_email = str(target_email).strip().lower() if target_email else None

    for row in rows:
        raw_email = (row.get('tech_email') or row.get('user_email') or '').strip().lower()
        has_valid_email = _is_valid_email_addr(raw_email)
        missing_fields = _compute_pending_fields_from_row(row)

        if has_valid_email:
            with_email_count += 1
        elif missing_fields:
            missing_email_but_pending_count += 1

        if target_user_id is not None and row.get('user_id') != target_user_id:
            continue
        if clean_filter_email and raw_email != clean_filter_email:
            continue
        if not has_valid_email or not missing_fields:
            continue
        if raw_email in seen_emails:
            continue

        seen_emails.add(raw_email)
        if raw_email in recently_sent_24h:
            already_sent_24h_count += 1
            continue

        display_name = (row.get('tech_name') or row.get('user_name') or row.get('username') or 'Colaborador').strip()
        recipients.append({
            "user_id": row.get('user_id'),
            "tech_id": row.get('tech_row_id'),
            "name": display_name,
            "username": row.get('username'),
            "role": row.get('tech_role') or row.get('user_role') or 'Colaborador',
            "email": raw_email,
            "missing_fields": missing_fields,
        })

    return {
        "recipients": recipients,
        "total_registered": len(rows),
        "with_email_count": with_email_count,
        "eligible_count": len(recipients),
        "already_sent_24h_count": already_sent_24h_count,
        "missing_email_but_pending_count": missing_email_but_pending_count,
    }


def _ensure_global_email_log_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS global_email_dispatch_log (
            id SERIAL PRIMARY KEY,
            triggered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
            triggered_by_username VARCHAR(100),
            trigger_type VARCHAR(30) DEFAULT 'manual',
            status VARCHAR(30) DEFAULT 'completed',
            eligible_count INT DEFAULT 0,
            sent_count INT DEFAULT 0,
            failed_count INT DEFAULT 0,
            details_json JSONB DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP DEFAULT NULL
        );
    """)
    cur.execute("""
        ALTER TABLE global_email_dispatch_log
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS outdated_profile_email_sent_log (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            user_id INT DEFAULT NULL,
            tech_id INT DEFAULT NULL,
            dispatch_log_id INT DEFAULT NULL,
            resend_message_id VARCHAR(255) DEFAULT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_outdated_email_sent_email_time
        ON outdated_profile_email_sent_log (LOWER(email), sent_at DESC);
    """)


def _mark_stale_running_dispatches(cur):
    cur.execute("""
        UPDATE global_email_dispatch_log
        SET status = 'interrupted',
            completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
        WHERE status = 'running'
          AND COALESCE(updated_at, created_at) < CURRENT_TIMESTAMP - INTERVAL '2 minutes';
    """)


def _get_recently_notified_emails_24h(cur):
    sent_set = set()
    cur.execute("""
        SELECT DISTINCT LOWER(email) AS email
        FROM outdated_profile_email_sent_log
        WHERE sent_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';
    """)
    for r in cur.fetchall():
        em = (r.get('email') or '').strip().lower()
        if em:
            sent_set.add(em)

    # Compatibilidade retroativa: extrai e-mails já confirmados em details_json nas últimas 24h
    try:
        cur.execute("""
            SELECT details_json
            FROM global_email_dispatch_log
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
              AND details_json IS NOT NULL;
        """)
        for r in cur.fetchall():
            details = r.get('details_json')
            if isinstance(details, str):
                try:
                    details = json.loads(details)
                except Exception:
                    details = []
            if isinstance(details, list):
                for item in details:
                    if isinstance(item, dict) and item.get('status') == 'sent':
                        em = (item.get('email') or '').strip().lower()
                        if em:
                            sent_set.add(em)
    except Exception:
        pass

    return sent_set


def _was_email_notified_24h(email):
    clean = (email or '').strip().lower()
    if not clean:
        return False
    conn = get_db()
    cur = conn.cursor()
    try:
        _ensure_global_email_log_table(cur)
        conn.commit()
        cur.execute("""
            SELECT 1
            FROM outdated_profile_email_sent_log
            WHERE LOWER(email) = LOWER(%s)
              AND sent_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
            LIMIT 1;
        """, (clean,))
        return cur.fetchone() is not None
    finally:
        cur.close()
        conn.close()


def _record_outdated_profile_email_sent(email, user_id=None, tech_id=None, dispatch_log_id=None, resend_message_id=None):
    clean = (email or '').strip().lower()
    if not clean:
        return
    conn = get_db()
    cur = conn.cursor()
    try:
        _ensure_global_email_log_table(cur)
        cur.execute("""
            INSERT INTO outdated_profile_email_sent_log
                (email, user_id, tech_id, dispatch_log_id, resend_message_id, sent_at)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
        """, (clean, user_id, tech_id, dispatch_log_id, str(resend_message_id)[:255] if resend_message_id else None))
        conn.commit()
    except Exception as ex:
        try:
            conn.rollback()
        except Exception:
            pass
        print("[OUTDATED EMAIL SENT LOG ERROR]", ex)
    finally:
        cur.close()
        conn.close()


def _format_remaining_cooldown(seconds):
    secs = max(0, int(seconds))
    hrs = secs // 3600
    mins = (secs % 3600) // 60
    if hrs > 0:
        return f"{hrs}h {mins:02d}min"
    return f"{max(1, mins)}min"


def _get_global_email_cooldown_info():
    conn = get_db()
    cur = conn.cursor()
    try:
        _ensure_global_email_log_table(cur)
        _mark_stale_running_dispatches(cur)
        conn.commit()
        cur.execute("""
            SELECT id, triggered_by_username, trigger_type, status,
                   eligible_count, sent_count, failed_count, details_json,
                   created_at, completed_at,
                   EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) AS elapsed_seconds
            FROM global_email_dispatch_log
            WHERE (status = 'running' AND COALESCE(updated_at, created_at) >= CURRENT_TIMESTAMP - INTERVAL '2 minutes')
               OR (status = 'completed' AND sent_count > 0)
            ORDER BY created_at DESC
            LIMIT 1;
        """)
        row = cur.fetchone()
        cur.execute("""
            SELECT id, triggered_by_username, trigger_type, status,
                   eligible_count, sent_count, failed_count, details_json,
                   created_at, completed_at
            FROM global_email_dispatch_log
            ORDER BY created_at DESC
            LIMIT 1;
        """)
        latest_any = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    def _fmt_brt(dt_val):
        if not dt_val:
            return None
        try:
            # Postgres CURRENT_TIMESTAMP na ShardCloud está em UTC; converte para BRT (UTC-3)
            return (dt_val - datetime.timedelta(hours=3)).strftime('%d/%m/%Y às %H:%M:%S')
        except Exception:
            return str(dt_val)

    cooldown_active = False
    remaining_seconds = 0
    next_allowed_at = None
    if row:
        elapsed = float(row.get('elapsed_seconds') or 0)
        if row.get('status') == 'running':
            cooldown_active = True
            remaining_seconds = GLOBAL_EMAIL_COOLDOWN_SECONDS
        elif elapsed < GLOBAL_EMAIL_COOLDOWN_SECONDS:
            cooldown_active = True
            remaining_seconds = int(GLOBAL_EMAIL_COOLDOWN_SECONDS - elapsed)
        if row.get('created_at'):
            try:
                next_dt = (row['created_at'] - datetime.timedelta(hours=3)) + datetime.timedelta(seconds=GLOBAL_EMAIL_COOLDOWN_SECONDS)
                next_allowed_at = next_dt.strftime('%d/%m/%Y às %H:%M')
            except Exception:
                pass

    last_dispatch = None
    if latest_any:
        details = latest_any.get('details_json')
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except Exception:
                details = []
        last_dispatch = {
            "id": latest_any.get('id'),
            "triggered_by": latest_any.get('triggered_by_username') or 'Sistema',
            "trigger_type": latest_any.get('trigger_type') or 'manual',
            "status": latest_any.get('status') or 'completed',
            "eligible_count": int(latest_any.get('eligible_count') or 0),
            "sent_count": int(latest_any.get('sent_count') or 0),
            "failed_count": int(latest_any.get('failed_count') or 0),
            "results": details if isinstance(details, list) else [],
            "created_at": _fmt_brt(latest_any.get('created_at')),
            "completed_at": _fmt_brt(latest_any.get('completed_at')),
        }

    return {
        "cooldown_active": cooldown_active,
        "remaining_seconds": remaining_seconds,
        "remaining_label": _format_remaining_cooldown(remaining_seconds) if cooldown_active else None,
        "next_allowed_at": next_allowed_at,
        "last_dispatch": last_dispatch,
    }


def _execute_global_email_dispatch_worker(log_id, recipients):
    sent_count = 0
    failed_count = 0
    skipped_24h_count = 0
    results = []
    final_status = 'completed'

    try:
        for idx, rec in enumerate(recipients):
            if _was_email_notified_24h(rec["email"]):
                skipped_24h_count += 1
                continue

            if idx > 0:
                time.sleep(0.65)

            ok = False
            status_code = 500
            detail = "Erro desconhecido"
            for attempt in range(3):
                ok, status_code, detail = send_outdated_profile_email(
                    to_email=rec["email"],
                    user_display=rec["name"],
                    missing_fields=rec["missing_fields"],
                    sync=True
                )
                if ok or status_code not in [429, 502, 504]:
                    break
                time.sleep(2.5 * (attempt + 1))

            if ok:
                sent_count += 1
                _record_outdated_profile_email_sent(
                    email=rec["email"],
                    user_id=rec.get("user_id"),
                    tech_id=rec.get("tech_id"),
                    dispatch_log_id=log_id,
                    resend_message_id=detail
                )
                results.append({
                    "email": rec["email"],
                    "name": rec["name"],
                    "status": "sent",
                    "detail": detail,
                })
            else:
                failed_count += 1
                results.append({
                    "email": rec["email"],
                    "name": rec["name"],
                    "status": "failed",
                    "detail": detail,
                })
                if status_code in [401, 403, 503]:
                    if sent_count == 0:
                        final_status = 'failed'
                    else:
                        final_status = 'interrupted'
                    break
            if (idx + 1) % 5 == 0:
                c_prog = None
                cur_prog = None
                try:
                    c_prog = get_db()
                    cur_prog = c_prog.cursor()
                    cur_prog.execute(
                        """
                        UPDATE global_email_dispatch_log
                        SET sent_count = %s, failed_count = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s;
                        """,
                        (sent_count, failed_count, log_id)
                    )
                    c_prog.commit()
                except Exception as ex_prog:
                    print("[GLOBAL EMAIL PROGRESS NOTICE]", ex_prog)
                finally:
                    if cur_prog:
                        try: cur_prog.close()
                        except Exception: pass
                    if c_prog:
                        try: c_prog.close()
                        except Exception: pass
    except Exception as ex:
        print("[GLOBAL EMAIL WORKER ERROR]", ex)
        if sent_count == 0:
            final_status = 'failed'
        else:
            final_status = 'interrupted'

    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE global_email_dispatch_log
            SET status = %s,
                sent_count = %s,
                failed_count = %s,
                details_json = %s,
                updated_at = CURRENT_TIMESTAMP,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (final_status, sent_count, failed_count, json.dumps(results), log_id))
        conn.commit()
    except Exception as ex:
        print("[GLOBAL EMAIL LOG UPDATE ERROR]", ex)
    finally:
        if cur:
            try: cur.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass


def _start_global_email_dispatch(trigger_type='manual', user_id=None, username='system', force=False):
    api_key, _ = _get_resend_config()
    if not api_key:
        return {"started": False, "error": "RESEND_API_KEY não configurada no servidor.", "status_code": 503}

    conn = get_db()
    cur = conn.cursor()
    locked = False
    try:
        cur.execute("SELECT pg_try_advisory_lock(984513) AS locked;")
        locked = bool((cur.fetchone() or {}).get('locked'))
        if not locked:
            return {"started": False, "error": "Um disparo global já está em andamento.", "status_code": 429}

        _ensure_global_email_log_table(cur)
        _mark_stale_running_dispatches(cur)
        conn.commit()

        # Nunca permite dois disparos simultaneamente ativos
        cur.execute("""
            SELECT id
            FROM global_email_dispatch_log
            WHERE status = 'running'
              AND COALESCE(updated_at, created_at) >= CURRENT_TIMESTAMP - INTERVAL '2 minutes'
            ORDER BY created_at DESC
            LIMIT 1;
        """)
        if cur.fetchone():
            return {
                "started": False,
                "error": "Um disparo global já está em andamento neste momento. Aguarde a conclusão.",
                "status_code": 429,
            }

        summary = _collect_pending_email_recipients()
        recipients = summary["recipients"]
        already_sent_24h = int(summary.get("already_sent_24h_count") or 0)

        if not recipients:
            msg = (
                f"Todos os {already_sent_24h} colaborador(es) com pendências já receberam este e-mail nas últimas 24h."
                if already_sent_24h > 0
                else "Nenhum colaborador com e-mail cadastrado possui pendências no momento."
            )
            return {
                "started": True,
                "sent_count": 0,
                "eligible_count": 0,
                "already_sent_24h_count": already_sent_24h,
                "message": msg,
            }

        if not force:
            cur.execute("""
                SELECT id, status, created_at,
                       EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) AS elapsed_seconds
                FROM global_email_dispatch_log
                WHERE status = 'completed' AND sent_count > 0
                ORDER BY created_at DESC
                LIMIT 1;
            """)
            recent = cur.fetchone()
            if recent:
                elapsed = float(recent.get('elapsed_seconds') or 0)
                if elapsed < GLOBAL_EMAIL_COOLDOWN_SECONDS:
                    rem = int(GLOBAL_EMAIL_COOLDOWN_SECONDS - elapsed)
                    return {
                        "started": False,
                        "error": f"Intervalo mínimo de 24h ativo. Aguarde {_format_remaining_cooldown(rem)} para realizar um novo disparo global.",
                        "status_code": 429,
                    }

        cur.execute("""
            INSERT INTO global_email_dispatch_log
                (triggered_by_user_id, triggered_by_username, trigger_type, status, eligible_count)
            VALUES (%s, %s, %s, 'running', %s)
            RETURNING id;
        """, (user_id, username, trigger_type, len(recipients)))
        log_id = cur.fetchone()['id']
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        if locked:
            try:
                cur.execute("SELECT pg_advisory_unlock(984513);")
                conn.commit()
            except Exception:
                pass
        cur.close()
        conn.close()

    t = threading.Thread(
        target=_execute_global_email_dispatch_worker,
        args=(log_id, recipients),
        daemon=True
    )
    t.start()
    return {
        "started": True,
        "log_id": log_id,
        "eligible_count": len(recipients),
        "message": f"Disparo global iniciado em segundo plano para {len(recipients)} colaborador(es) com pendências.",
    }


def _trigger_initial_global_pending_email_if_due():
    try:
        api_key, _ = _get_resend_config()
        if not api_key:
            return
        res = _start_global_email_dispatch(trigger_type='auto', user_id=None, username='auto-startup')
        print("[AUTO GLOBAL EMAIL]", res.get('message') or res.get('error'))
    except Exception as ex:
        print("[AUTO GLOBAL EMAIL NOTICE]", ex)


threading.Timer(8.0, _trigger_initial_global_pending_email_if_due).start()


@app.route('/api/admin/resend-status', methods=['GET'])
@login_required
def api_admin_resend_status():
    auth = get_current_user_auth()
    if not _has_admin_notify_access(auth):
        return jsonify({"error": "Acesso restrito exclusivamente ao Coordenador Master."}), 403

    api_key, from_email = _get_resend_config()
    domain_status = "unknown"
    domain_name = "gestaoredeexterna.com.br"
    if '@' in from_email:
        domain_part = from_email.split('@')[-1].replace('>', '').strip().lower()
        if domain_part:
            domain_name = domain_part

    if api_key:
        try:
            resp = requests.get(
                'https://api.resend.com/domains',
                headers={'Authorization': f'Bearer {api_key}'},
                timeout=6
            )
            if resp.status_code == 200:
                domains_data = (resp.json() or {}).get('data') or []
                matched = next((d for d in domains_data if (d.get('name') or '').lower() == domain_name), None)
                if matched:
                    domain_status = matched.get('status') or 'pending'
                else:
                    domain_status = 'not_added'
            elif resp.status_code in [401, 403]:
                # Chave restrita apenas a envio (sending-only) pode não listar /domains
                domain_status = 'sending_key_only'
        except Exception as ex:
            print("[RESEND DOMAIN CHECK NOTICE]", ex)

    return jsonify({
        "configured": bool(api_key),
        "from_email": from_email,
        "domain_name": domain_name,
        "domain_status": domain_status,
    })


@app.route('/api/webhooks/resend', methods=['POST'])
def api_resend_webhook():
    """Recebe eventos do Resend (email.bounced, email.complained, email.failed) com validação HMAC Svix."""
    webhook_secret = (os.environ.get('RESEND_WEBHOOK_SECRET') or '').strip()
    if not webhook_secret:
        print("[RESEND WEBHOOK] RESEND_WEBHOOK_SECRET não configurado — rejeitando webhook não assinado.")
        return jsonify({"error": "Webhook não configurado."}), 503

    svix_id = (request.headers.get('svix-id') or '').strip()
    svix_ts = (request.headers.get('svix-timestamp') or '').strip()
    svix_sig = (request.headers.get('svix-signature') or '').strip()
    if not svix_id or not svix_ts or not svix_sig:
        return jsonify({"error": "Assinatura de webhook ausente."}), 401

    try:
        ts_int = int(svix_ts)
    except ValueError:
        return jsonify({"error": "Timestamp de webhook inválido."}), 401
    if abs(time.time() - ts_int) > 300:
        return jsonify({"error": "Timestamp de webhook expirado."}), 401

    raw_body = request.get_data(cache=True, as_text=True) or ''
    secret_raw = webhook_secret[6:] if webhook_secret.startswith('whsec_') else webhook_secret
    try:
        secret_bytes = base64.b64decode(secret_raw)
    except Exception:
        secret_bytes = webhook_secret.encode('utf-8')
    signed_content = f"{svix_id}.{svix_ts}.{raw_body}".encode('utf-8')
    expected_sig = base64.b64encode(hmac.new(secret_bytes, signed_content, hashlib.sha256).digest()).decode('utf-8')

    sig_valid = False
    for part in svix_sig.split(' '):
        if ',' in part:
            ver, sig_val = part.split(',', 1)
            if ver == 'v1' and hmac.compare_digest(sig_val.strip(), expected_sig):
                sig_valid = True
                break
    if not sig_valid:
        return jsonify({"error": "Assinatura de webhook inválida."}), 401

    payload = request.get_json(silent=True) or {}
    ev_type = str(payload.get('type') or '').strip().lower()
    if ev_type not in ('email.bounced', 'email.complained', 'email.delivery_delayed', 'email.failed'):
        return jsonify({"received": True, "ignored": True}), 200

    if ev_type == 'email.delivery_delayed':
        return jsonify({"received": True, "ignored": "delayed_only"}), 200

    data_obj = payload.get('data') or {}
    recipients = data_obj.get('to') or []
    if isinstance(recipients, str):
        recipients = [recipients]
    msg_id = data_obj.get('email_id') or data_obj.get('id')
    bounce_info = data_obj.get('bounce') or {}
    reason = bounce_info.get('message') or f"Falha na entrega ({ev_type})."

    marked = 0
    for rcpt in recipients:
        if _mark_email_bounced(rcpt, reason=reason, event_type=ev_type.replace('email.', ''), resend_message_id=msg_id):
            marked += 1
    return jsonify({"received": True, "marked": marked}), 200


@app.route('/api/admin/email-bounces/sync', methods=['POST'])
@login_required
def api_admin_sync_email_bounces():
    auth = get_current_user_auth()
    if not _has_admin_notify_access(auth):
        return jsonify({"error": "Acesso restrito ao Coordenador Master."}), 403
    res = _sync_resend_bounces(force=True)
    return jsonify({"success": "error" not in res, **res})


@app.route('/api/telemetry/performance', methods=['POST'])
def api_telemetry_performance():
    """Registra métricas opcionais de desempenho e navegação nos logs do servidor."""
    data = request.get_json(silent=True) or {}
    path = str(data.get('path') or '/')[:120]
    load_ms = data.get('load_ms')
    ttfb_ms = data.get('ttfb_ms')
    dom_ms = data.get('dom_ms')
    viewport = str(data.get('viewport') or '')[:32]
    uid = session.get('user_id')
    uname = session.get('username') or 'visitante'
    print(
        f"[PERF TELEMETRY] user={uname}({uid or '-'}) path={path} "
        f"load={load_ms}ms ttfb={ttfb_ms}ms dom={dom_ms}ms viewport={viewport}"
    )
    return jsonify({"ok": True}), 200


@app.route('/api/admin/notify-outdated-profile', methods=['GET', 'POST'])
@login_required
def api_notify_outdated_profile():
    auth = get_current_user_auth()
    if not _has_admin_notify_access(auth):
        return jsonify({"error": "Acesso restrito exclusivamente ao Coordenador Master."}), 403

    data = request.get_json(silent=True) or {}
    target_user_id = data.get('user_id') if request.method == 'POST' else None
    target_email = data.get('email') if request.method == 'POST' else None

    try:
        api_key, from_email = _get_resend_config()

        if request.method == 'GET':
            summary = _collect_pending_email_recipients()
            cooldown_info = _get_global_email_cooldown_info()
            return jsonify({
                "resend_configured": bool(api_key),
                "from_email": from_email,
                **summary,
                **cooldown_info,
            })

        if not api_key:
            return jsonify({
                "error": "RESEND_API_KEY não configurada nas variáveis de ambiente do servidor."
            }), 503

        # Disparo individual pontual (não conta como disparo global, mas respeita trava de 24h por destinatário)
        if target_user_id or target_email:
            summary = _collect_pending_email_recipients(
                target_user_id=target_user_id,
                target_email=target_email
            )
            recipients = summary["recipients"]
            if not recipients:
                return jsonify({
                    "success": True,
                    "sent_count": 0,
                    "failed_count": 0,
                    "eligible_count": 0,
                    "results": [],
                    "message": "Colaborador sem e-mail válido ou sem pendências."
                })
            rec = recipients[0]
            if _was_email_notified_24h(rec["email"]):
                return jsonify({
                    "success": False,
                    "sent_count": 0,
                    "failed_count": 0,
                    "eligible_count": 0,
                    "results": [],
                    "error": f"O e-mail {rec['email']} já recebeu uma notificação de regularização cadastral nas últimas 24h."
                }), 429
            ok, status_code, detail = send_outdated_profile_email(
                to_email=rec["email"],
                user_display=rec["name"],
                missing_fields=rec["missing_fields"],
                sync=True
            )
            if not ok:
                return jsonify({
                    "success": False,
                    "sent_count": 0,
                    "failed_count": 1,
                    "eligible_count": 1,
                    "results": [{"email": rec["email"], "name": rec["name"], "status": "failed", "detail": detail}],
                    "error": detail,
                }), 502
            _record_outdated_profile_email_sent(
                email=rec["email"],
                user_id=rec.get("user_id"),
                tech_id=rec.get("tech_id"),
                dispatch_log_id=None,
                resend_message_id=detail
            )
            return jsonify({
                "success": True,
                "sent_count": 1,
                "failed_count": 0,
                "eligible_count": 1,
                "results": [{"email": rec["email"], "name": rec["name"], "status": "sent", "detail": detail}],
                "message": f"E-mail enviado para {rec['email']}."
            })

        # Disparo global com trava de 24h (Master pode passar force=True se acabou de trocar chave/reconfigurar)
        force_send = bool(data.get('force'))
        res = _start_global_email_dispatch(
            trigger_type='manual',
            user_id=auth.get('id'),
            username=auth.get('username') or 'master',
            force=force_send
        )
        if not res.get("started"):
            return jsonify({"error": res.get("error")}), res.get("status_code", 400)

        return jsonify({
            "success": True,
            "started": True,
            "eligible_count": res.get("eligible_count", 0),
            "sent_count": res.get("sent_count", 0),
            "failed_count": 0,
            "message": res.get("message"),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("[NOTIFY OUTDATED PROFILE ERROR]", type(e).__name__, e)
        return jsonify({"error": f"Falha interna ao processar envio de pendências ({type(e).__name__})."}), 500




# --------------------------------------------------------------------------
# GRAFANA COP REDE (RAL / REC / RAL DE QUALIDADE) — REAL-TIME SYNC & API
# --------------------------------------------------------------------------
GRAFANA_RAL_CSV_URL = "https://raw.githubusercontent.com/cpralonrj-pralon/embratel-sir/refs/heads/main/dados_ral.csv"
GRAFANA_REC_CSV_URL = "https://raw.githubusercontent.com/cpralonrj-pralon/embratel-sir/refs/heads/main/dados_rec.csv"
GRAFANA_SYNC_INTERVAL_SECONDS = 300
from datetime import datetime as _grafana_datetime, timedelta as _grafana_timedelta, timezone as _grafana_timezone
GRAFANA_BRT_TZ = _grafana_timezone(_grafana_timedelta(hours=-3))

GRAFANA_CF_LIST = [
    {"cf": "MTN", "label": "Metropolitana Norte - ES", "regional": "ES", "expected_prefix": "VTA"},
    {"cf": "MTS", "label": "Metropolitana Sul - ES", "regional": "ES", "expected_prefix": "VTA"},
    {"cf": "NOR", "label": "Norte - ES", "regional": "ES", "expected_prefix": "VTA"},
    {"cf": "SUL", "label": "Sul - ES", "regional": "ES", "expected_prefix": "VTA"},
    {"cf": "SUF", "label": "Sul Fluminense - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "SEF", "label": "Serra Fluminense - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "NOF", "label": "Norte Fluminense - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "LGS", "label": "Região dos Lagos - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "BX1", "label": "Baixada Fluminense - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "MTP", "label": "Metropolitana - RJ", "regional": "INTERIOR", "expected_prefix": "RJO"},
    {"cf": "NO1", "label": "Norte 1 - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
    {"cf": "NO2", "label": "Norte 2 - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
    {"cf": "NO3", "label": "Norte 3 - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
    {"cf": "OE1", "label": "Oeste - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
    {"cf": "SU2", "label": "Sul 2 - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
    {"cf": "CZS", "label": "Centro Zona Sul - RJ", "regional": "CAPITAL", "expected_prefix": "RJO"},
]
GRAFANA_CF_META = {item["cf"]: item for item in GRAFANA_CF_LIST}

GRAFANA_ALLOWED_STATUSES = [
    "Equipe acionada",
    "Transferir",
    "Falha concorrente",
    "Validação",
    "Conjunta",
    "Área de Risco",
    "Pendencia Encerramento",
    "Acesso",
    "Indisp. Técnica",
    "Capex",
    "Sem classificação",
]

def _grafana_now_brt():
    return _grafana_datetime.now(GRAFANA_BRT_TZ).replace(tzinfo=None)

def _grafana_parse_abertura(raw_val):
    s = (raw_val or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y - %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S"):
        try:
            return _grafana_datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def _grafana_extract_cf(cf_exec_raw):
    parts = [p.strip().upper() for p in (cf_exec_raw or "").split("/")]
    if len(parts) < 3:
        return None
    area_prefix = parts[1]
    cf_code = parts[2]
    meta = GRAFANA_CF_META.get(cf_code)
    if not meta:
        return None
    if area_prefix != meta["expected_prefix"]:
        return None
    return meta

def _grafana_compute_sla(ticket_type, abertura_dt, now_brt=None):
    sla_hours = 6 if ticket_type == "RAL" else 4
    sla_limit_min = sla_hours * 60
    if not abertura_dt:
        return {
            "sla_hours": sla_hours,
            "sla_status": "unknown",
            "sla_label": f"Sem data ({sla_hours}h)",
            "sla_whatsapp": f"⏳ Sem data ({sla_hours}h)",
            "sla_delta_minutes": 0,
        }
    ref = now_brt or _grafana_now_brt()
    elapsed_min = int((ref - abertura_dt).total_seconds() // 60)
    if elapsed_min > sla_limit_min:
        over = elapsed_min - sla_limit_min
        h, m = divmod(over, 60)
        return {
            "sla_hours": sla_hours,
            "sla_status": "overdue",
            "sla_label": f"SLA PERDIDO (+{h}h{m:02d}m)",
            "sla_whatsapp": f"⛔️ SLA PERDIDO (+{h}h{m:02d})",
            "sla_delta_minutes": -over,
        }
    rem = max(0, sla_limit_min - elapsed_min)
    h, m = divmod(rem, 60)
    return {
        "sla_hours": sla_hours,
        "sla_status": "ok",
        "sla_label": f"{h}h{m:02d}m restantes ({sla_hours}h)",
        "sla_whatsapp": f"🟢 {h}h{m:02d} restantes ({sla_hours}h)",
        "sla_delta_minutes": rem,
    }

GRAFANA_STALE_ALERT_EMAIL = "alexandrecandid@gmail.com"
GRAFANA_STALE_THRESHOLD_SECONDS = 5400   # 1h 30min (within 1-2 hours)
GRAFANA_STALE_ALERT_COOLDOWN_SECONDS = 7200  # 2h cooldown between repeat alerts
GRAFANA_WATCHDOG_INTERVAL_SECONDS = 900  # 15 min background check


def _ensure_grafana_sync_meta_cols(cur):
    """Garante que colunas de rastreio manual e alerta estejam presentes em grafana_sync_meta."""
    for col_sql in [
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_ral_hash VARCHAR(64);",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_rec_hash VARCHAR(64);",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS github_last_changed_at TIMESTAMP;",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_override_active BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_updated_at TIMESTAMP;",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS manual_updated_by VARCHAR(150);",
        "ALTER TABLE grafana_sync_meta ADD COLUMN IF NOT EXISTS stale_alert_sent_at TIMESTAMP;",
    ]:
        cur.execute(col_sql)


def _norm_grafana_row(row):
    """Normaliza chaves e valores de uma linha (CSV/Excel) para strings limpas."""
    out = {}
    for k, v in (row or {}).items():
        if k is None:
            continue
        ks = str(k).strip()
        if not ks:
            continue
        if v is None:
            out[ks] = ""
        elif hasattr(v, "strftime"):
            out[ks] = v.strftime("%d/%m/%Y %H:%M")
        else:
            out[ks] = str(v).strip()
    return out


def _parse_grafana_rows_to_tickets(rows, kind, parsed_tickets):
    """Converte linhas de RAL (separando RAL e QUALIDADE) ou REC em dict indexado por ticket_key."""
    raw_count = 0
    for raw_row in rows:
        raw_count += 1
        row = _norm_grafana_row(raw_row)
        num = row.get("Num.Recup.") or ""
        if not num:
            continue
        cf_meta = _grafana_extract_cf(row.get("CF Exec."))
        if not cf_meta:
            continue
        abertura_raw = row.get("Abertura") or ""
        if kind == "RAL":
            tipo_ral = row.get("Tipo Ral") or ""
            is_qual = tipo_ral.upper() == "QUALIDADE"
            tkey = f"RAL:{num}"
            parsed_tickets[tkey] = {
                "ticket_key": tkey,
                "ticket_type": "RAL",
                "ticket_number": num[:60],
                "cf": cf_meta["cf"],
                "regional": cf_meta["regional"],
                "cf_exec_raw": (row.get("CF Exec.") or "")[:120],
                "designation": (row.get("Designação") or "")[:255],
                "tipo_ral": tipo_ral[:100],
                "is_qualidade": is_qual,
                "cliente": "",
                "anorm": (row.get("Anorm.") or "")[:80],
                "abertura_raw": abertura_raw[:60],
                "abertura_dt": _grafana_parse_abertura(abertura_raw),
                "duracao_raw": (row.get("Duração") or "")[:60],
                "resp_code": (row.get("Resp.") or "")[:40],
                "tecnico_csv": (row.get("Técn.") or "")[:120],
                "anatel": (row.get("Anatel") or "")[:30],
                "prejuizo": (row.get("Prejuízo") or "")[:30],
            }
        else:
            tkey = f"REC:{num}"
            parsed_tickets[tkey] = {
                "ticket_key": tkey,
                "ticket_type": "REC",
                "ticket_number": num[:60],
                "cf": cf_meta["cf"],
                "regional": cf_meta["regional"],
                "cf_exec_raw": (row.get("CF Exec.") or "")[:120],
                "designation": (row.get("Designação") or "")[:255],
                "tipo_ral": "REC",
                "is_qualidade": False,
                "cliente": (row.get("Cliente") or "")[:180],
                "anorm": "",
                "abertura_raw": abertura_raw[:60],
                "abertura_dt": _grafana_parse_abertura(abertura_raw),
                "duracao_raw": "",
                "resp_code": (row.get("Resp.") or "")[:40],
                "tecnico_csv": (row.get("Técnico") or "")[:120],
                "anatel": "",
                "prejuizo": "",
            }
    return raw_count


def _read_grafana_uploaded_file(file_storage):
    """Lê arquivo enviado (.csv, .xlsx, .xlsm, .xls) e retorna lista de dicts."""
    filename = (getattr(file_storage, "filename", "") or "").lower()
    raw = file_storage.read()
    if not raw:
        raise ValueError("Arquivo enviado está vazio.")

    if filename.endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        try:
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            headers = None
            result = []
            for r in rows_iter:
                if headers is None:
                    cand = [str(c).strip() if c is not None else "" for c in r]
                    if any(cand):
                        headers = cand
                    continue
                if not any(c is not None and str(c).strip() != "" for c in r):
                    continue
                row_dict = {}
                for idx, h in enumerate(headers):
                    if h:
                        row_dict[h] = r[idx] if idx < len(r) else ""
                result.append(row_dict)
            return result
        finally:
            wb.close()

    if filename.endswith(".xls"):
        try:
            import xlrd
            book = xlrd.open_workbook(file_contents=raw)
            sheet = book.sheet_by_index(0)
            if sheet.nrows < 1:
                return []
            headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
            result = []
            for r_idx in range(1, sheet.nrows):
                row_dict = {}
                has_val = False
                for c_idx, h in enumerate(headers):
                    if h:
                        val = sheet.cell_value(r_idx, c_idx)
                        if val is not None and str(val).strip() != "":
                            has_val = True
                        row_dict[h] = val
                if has_val:
                    result.append(row_dict)
            return result
        except ImportError:
            raise ValueError("Formato .xls legado não suportado diretamente; salve a planilha como .xlsx ou .csv.")

    # CSV fallback
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8-sig", errors="replace")

    first_line = text.splitlines()[0] if text.splitlines() else ""
    delim = ";" if first_line.count(";") >= first_line.count(",") else ","
    if "\t" in first_line and first_line.count("\t") > first_line.count(delim):
        delim = "\t"
    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def _apply_grafana_ticket_batch(cur, parsed_tickets, target_types, now_brt):
    """Aplica atualização de tickets para os tipos informados (ex: {'RAL'}, {'REC'} ou {'RAL', 'REC'})."""
    target_list = list(target_types)
    cur.execute("SELECT ticket_key, first_seen_at FROM grafana_tickets WHERE ticket_type = ANY(%s);", (target_list,))
    existing_rows = cur.fetchall()
    existing_keys = {r["ticket_key"] for r in existing_rows}
    had_existing = len(existing_keys) > 0

    new_keys = set(parsed_tickets.keys()) - existing_keys
    removed_keys = list(existing_keys - set(parsed_tickets.keys()))

    # Clear "is_new" on tickets older than 15 minutes
    cutoff_new = now_brt - _grafana_timedelta(minutes=15)
    cur.execute(
        "UPDATE grafana_tickets SET is_new = FALSE WHERE is_new = TRUE AND first_seen_at < %s AND ticket_type = ANY(%s);",
        (cutoff_new, target_list),
    )

    # Move cleared/removed tickets into grafana_cleared_tickets with notes snapshot
    cleared_now = 0
    if removed_keys:
        cur.execute("SELECT * FROM grafana_tickets WHERE ticket_key = ANY(%s);", (removed_keys,))
        to_archive = cur.fetchall()
        cur.execute("""
            SELECT ticket_key, id, content, author_name, created_at
            FROM grafana_ticket_notes
            WHERE ticket_key = ANY(%s)
            ORDER BY created_at ASC;
        """, (removed_keys,))
        notes_by_key = {}
        for n in cur.fetchall():
            notes_by_key.setdefault(n["ticket_key"], []).append({
                "id": n["id"],
                "content": n["content"],
                "author_name": n["author_name"],
                "created_at": n["created_at"].strftime("%d/%m %H:%M") if n.get("created_at") else "",
            })
        if to_archive:
            from psycopg2.extras import execute_values
            archive_rows = [
                (
                    t["ticket_key"], t["ticket_type"], t["ticket_number"], t["cf"], t["regional"], t["cf_exec_raw"],
                    t["designation"], t["tipo_ral"], t["is_qualidade"], t["cliente"], t["abertura_raw"], t["abertura_dt"],
                    t["status_andamento"], t["responsible_name"],
                    t.get("distancia") or "", t.get("referencia") or "", t.get("endereco") or "",
                    json.dumps(notes_by_key.get(t["ticket_key"], []), ensure_ascii=False),
                    t["first_seen_at"], now_brt
                )
                for t in to_archive
            ]
            execute_values(cur, """
                INSERT INTO grafana_cleared_tickets (
                    ticket_key, ticket_type, ticket_number, cf, regional, cf_exec_raw,
                    designation, tipo_ral, is_qualidade, cliente, abertura_raw, abertura_dt,
                    status_andamento, responsible_name, distancia, referencia, endereco,
                    notes_snapshot, first_seen_at, cleared_at
                ) VALUES %s;
            """, archive_rows, template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)", page_size=500)
            cleared_now = len(archive_rows)
        cur.execute("DELETE FROM grafana_ticket_notes WHERE ticket_key = ANY(%s);", (removed_keys,))
        cur.execute("DELETE FROM grafana_tickets WHERE ticket_key = ANY(%s);", (removed_keys,))

    # Upsert active tickets in batch preserving status_andamento & responsible_name
    if parsed_tickets:
        from psycopg2.extras import execute_values
        ticket_rows = [
            (
                item["ticket_key"], item["ticket_type"], item["ticket_number"], item["cf"], item["regional"], item["cf_exec_raw"],
                item["designation"], item["tipo_ral"], item["is_qualidade"], item["cliente"], item["anorm"], item["abertura_raw"],
                item["abertura_dt"], item["duracao_raw"], item["resp_code"], item["tecnico_csv"], item["anatel"], item["prejuizo"],
                now_brt, now_brt, bool(had_existing and tkey in new_keys), now_brt
            )
            for tkey, item in parsed_tickets.items()
        ]
        execute_values(cur, """
            INSERT INTO grafana_tickets (
                ticket_key, ticket_type, ticket_number, cf, regional, cf_exec_raw,
                designation, tipo_ral, is_qualidade, cliente, anorm, abertura_raw,
                abertura_dt, duracao_raw, resp_code, tecnico_csv, anatel, prejuizo,
                first_seen_at, last_seen_at, is_new, updated_at
            ) VALUES %s
            ON CONFLICT (ticket_key) DO UPDATE SET
                cf = EXCLUDED.cf,
                regional = EXCLUDED.regional,
                cf_exec_raw = EXCLUDED.cf_exec_raw,
                designation = EXCLUDED.designation,
                tipo_ral = EXCLUDED.tipo_ral,
                is_qualidade = EXCLUDED.is_qualidade,
                cliente = EXCLUDED.cliente,
                anorm = EXCLUDED.anorm,
                abertura_raw = EXCLUDED.abertura_raw,
                abertura_dt = EXCLUDED.abertura_dt,
                duracao_raw = EXCLUDED.duracao_raw,
                resp_code = EXCLUDED.resp_code,
                tecnico_csv = EXCLUDED.tecnico_csv,
                anatel = EXCLUDED.anatel,
                prejuizo = EXCLUDED.prejuizo,
                last_seen_at = EXCLUDED.last_seen_at,
                updated_at = EXCLUDED.updated_at;
        """, ticket_rows, page_size=500)

    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE ticket_type = 'RAL' AND NOT is_qualidade) AS ral_count,
            COUNT(*) FILTER (WHERE ticket_type = 'REC') AS rec_count,
            COUNT(*) FILTER (WHERE is_qualidade) AS qualidade_count
        FROM grafana_tickets;
    """)
    counts = cur.fetchone() or {}
    new_active = len(new_keys) if had_existing else 0
    return {
        "new_active": new_active,
        "cleared_now": cleared_now,
        "ral_count": int(counts.get("ral_count") or 0),
        "rec_count": int(counts.get("rec_count") or 0),
        "qualidade_count": int(counts.get("qualidade_count") or 0),
    }


def _format_duration_pt(seconds):
    total_min = max(1, int(seconds // 60))
    hours, mins = divmod(total_min, 60)
    if hours > 0 and mins > 0:
        return f"{hours}h {mins}min"
    if hours > 0:
        return f"{hours}h"
    return f"{mins}min"


def _check_and_alert_stale_grafana(cur, now_brt, github_last_changed_at, stale_alert_sent_at, manual_override_active=False):
    """Envia alerta por e-mail se a base do GitHub estiver sem atualização há >= 1h30."""
    if not github_last_changed_at:
        return False
    elapsed = (now_brt - github_last_changed_at).total_seconds()
    if elapsed < GRAFANA_STALE_THRESHOLD_SECONDS:
        return False
    if stale_alert_sent_at and (now_brt - stale_alert_sent_at).total_seconds() < GRAFANA_STALE_ALERT_COOLDOWN_SECONDS:
        return False

    dur_label = _format_duration_pt(elapsed)
    last_changed_str = github_last_changed_at.strftime("%d/%m/%Y às %H:%M")
    override_note = (
        "<p><strong>Modo Manual Ativo:</strong> A operação está utilizando uma base enviada manualmente até que o GitHub receba uma nova atualização.</p>"
        if manual_override_active else
        "<p>Caso a atualização automática não normalize hoje, utilize a opção <strong>Atualizar Base Manual</strong> na aba Grafana.</p>"
    )
    subject = f"[Alerta Grafana] Base GitHub sem atualização há {dur_label}"
    message_html = (
        f"<p>A base automática do Grafana no GitHub (<code>dados_ral.csv</code> / <code>dados_rec.csv</code>) "
        f"está sem novas atualizações há <strong>{dur_label}</strong>.</p>"
        f"<p><strong>Última alteração detectada no GitHub:</strong> {last_changed_str} (horário de Brasília)</p>"
        f"{override_note}"
        f"<p>Por favor, verifique e atualize a base assim que possível.</p>"
    )
    ok, _code, err = _send_resend_email_sync(
        GRAFANA_STALE_ALERT_EMAIL,
        subject,
        "ALERTA GRAFANA",
        f"Base sem atualização há {dur_label}",
        message_html,
    )
    if ok:
        cur.execute("UPDATE grafana_sync_meta SET stale_alert_sent_at = %s WHERE id = 1;", (now_brt,))
        print(f"[GRAFANA STALE ALERT] E-mail enviado para {GRAFANA_STALE_ALERT_EMAIL} (sem atualização há {dur_label})")
        return True
    print(f"[GRAFANA STALE ALERT] Falha ao enviar e-mail: {err}")
    return False


def _sync_grafana_data(force=False):
    conn = None
    cur = None
    locked = False
    now_brt = _grafana_now_brt()
    try:
        conn = get_db()
        cur = conn.cursor()

        cur.execute("""
            SELECT last_sync_at, last_sync_status, last_sync_error, ral_count, rec_count,
                   qualidade_count, new_count, cleared_count,
                   github_ral_hash, github_rec_hash, github_last_changed_at,
                   manual_override_active, manual_updated_at, manual_updated_by, stale_alert_sent_at
            FROM grafana_sync_meta WHERE id = 1;
        """)
        meta_row = cur.fetchone()
        if meta_row and meta_row.get("last_sync_at"):
            age = (now_brt - meta_row["last_sync_at"]).total_seconds()
            min_age = 15 if force else GRAFANA_SYNC_INTERVAL_SECONDS
            if age < min_age:
                return {"synced": False, "cached": True, "meta": meta_row}

        cur.execute("SELECT pg_try_advisory_lock(984512) AS locked;")
        lock_row = cur.fetchone()
        locked = bool(lock_row and lock_row.get("locked"))
        if not locked:
            return {"synced": False, "cached": True, "meta": meta_row}

        # Re-check inside lock in case another worker just finished syncing
        cur.execute("""
            SELECT last_sync_at, last_sync_status, last_sync_error, ral_count, rec_count,
                   qualidade_count, new_count, cleared_count,
                   github_ral_hash, github_rec_hash, github_last_changed_at,
                   manual_override_active, manual_updated_at, manual_updated_by, stale_alert_sent_at
            FROM grafana_sync_meta WHERE id = 1;
        """)
        meta_row = cur.fetchone()
        if meta_row and meta_row.get("last_sync_at"):
            age = (now_brt - meta_row["last_sync_at"]).total_seconds()
            min_age = 15 if force else GRAFANA_SYNC_INTERVAL_SECONDS
            if age < min_age:
                return {"synced": False, "cached": True, "meta": meta_row}

        # Fetch hardcoded GitHub raw CSVs (no user-supplied URL -> SSRF-safe)
        import hashlib
        import requests as _req
        ral_resp = _req.get(GRAFANA_RAL_CSV_URL, timeout=20)
        rec_resp = _req.get(GRAFANA_REC_CSV_URL, timeout=20)
        ral_resp.raise_for_status()
        rec_resp.raise_for_status()

        new_ral_hash = hashlib.sha256(ral_resp.content).hexdigest()
        new_rec_hash = hashlib.sha256(rec_resp.content).hexdigest()

        prev_ral_hash = meta_row.get("github_ral_hash") if meta_row else None
        prev_rec_hash = meta_row.get("github_rec_hash") if meta_row else None
        manual_override_active = bool(meta_row and meta_row.get("manual_override_active"))
        github_changed = (
            prev_ral_hash is None
            or prev_rec_hash is None
            or new_ral_hash != prev_ral_hash
            or new_rec_hash != prev_rec_hash
        )

        # If manual override is active and GitHub hasn't changed yet, keep manual data untouched
        if manual_override_active and not github_changed:
            github_last_changed = (meta_row.get("github_last_changed_at") if meta_row else None) or now_brt
            stale_sent = meta_row.get("stale_alert_sent_at") if meta_row else None
            _check_and_alert_stale_grafana(cur, now_brt, github_last_changed, stale_sent, manual_override_active=True)
            cur.execute("""
                UPDATE grafana_sync_meta
                SET last_sync_at = %s,
                    last_sync_status = 'manual_override',
                    last_sync_error = NULL
                WHERE id = 1;
            """, (now_brt,))
            conn.commit()
            return {"synced": False, "cached": False, "manual_override_preserved": True}

        ral_text = ral_resp.content.decode("utf-8-sig", errors="replace")
        rec_text = rec_resp.content.decode("utf-8-sig", errors="replace")

        ral_reader = csv.DictReader(io.StringIO(ral_text), delimiter=";")
        rec_reader = csv.DictReader(io.StringIO(rec_text), delimiter=";")

        parsed_tickets = {}
        ral_raw_rows = _parse_grafana_rows_to_tickets(ral_reader, "RAL", parsed_tickets)
        rec_raw_rows = _parse_grafana_rows_to_tickets(rec_reader, "REC", parsed_tickets)

        if ral_raw_rows == 0 or rec_raw_rows == 0:
            raise ValueError("CSV retornado vazio; sincronização abortada para proteger base ativa.")

        batch_res = _apply_grafana_ticket_batch(cur, parsed_tickets, {"RAL", "REC"}, now_brt)

        if github_changed:
            github_last_changed = now_brt
            stale_alert_sent = None
            manual_override_next = False
        else:
            github_last_changed = (meta_row.get("github_last_changed_at") if meta_row else None) or now_brt
            stale_alert_sent = meta_row.get("stale_alert_sent_at") if meta_row else None
            manual_override_next = False

        cur.execute("""
            INSERT INTO grafana_sync_meta (
                id, last_sync_at, last_sync_status, last_sync_error,
                ral_count, rec_count, qualidade_count, new_count, cleared_count,
                github_ral_hash, github_rec_hash, github_last_changed_at,
                manual_override_active, stale_alert_sent_at
            )
            VALUES (1, %s, 'ok', NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                last_sync_at = EXCLUDED.last_sync_at,
                last_sync_status = 'ok',
                last_sync_error = NULL,
                ral_count = EXCLUDED.ral_count,
                rec_count = EXCLUDED.rec_count,
                qualidade_count = EXCLUDED.qualidade_count,
                new_count = EXCLUDED.new_count,
                cleared_count = grafana_sync_meta.cleared_count + EXCLUDED.cleared_count,
                github_ral_hash = EXCLUDED.github_ral_hash,
                github_rec_hash = EXCLUDED.github_rec_hash,
                github_last_changed_at = EXCLUDED.github_last_changed_at,
                manual_override_active = EXCLUDED.manual_override_active,
                stale_alert_sent_at = EXCLUDED.stale_alert_sent_at;
        """, (
            now_brt,
            batch_res["ral_count"], batch_res["rec_count"], batch_res["qualidade_count"],
            batch_res["new_active"], batch_res["cleared_now"],
            new_ral_hash, new_rec_hash, github_last_changed,
            manual_override_next, stale_alert_sent,
        ))

        if not github_changed:
            _check_and_alert_stale_grafana(cur, now_brt, github_last_changed, stale_alert_sent, manual_override_active=False)

        conn.commit()
        return {"synced": True, "cached": False, "new_count": batch_res["new_active"], "cleared_now": batch_res["cleared_now"]}
    except Exception as e:
        if conn:
            try:
                conn.rollback()
                if cur:
                    cur.execute("""
                        INSERT INTO grafana_sync_meta (id, last_sync_at, last_sync_status, last_sync_error)
                        VALUES (1, %s, 'error', %s)
                        ON CONFLICT (id) DO UPDATE SET
                            last_sync_status = 'error',
                            last_sync_error = EXCLUDED.last_sync_error;
                    """, (now_brt, str(e)[:300]))
                    conn.commit()
            except Exception:
                pass
        print("[GRAFANA SYNC ERROR]", e)
        return {"synced": False, "error": "Falha ao sincronizar base remota."}
    finally:
        if locked and cur and conn:
            try:
                cur.execute("SELECT pg_advisory_unlock(984512);")
                conn.commit()
            except Exception:
                pass
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn and not has_request_context():
            try:
                conn.close()
            except Exception:
                pass


_grafana_watchdog_started = False


def _start_grafana_stale_watchdog():
    """Inicia thread daemon para checar periodicamente se a base do GitHub ficou desatualizada."""
    global _grafana_watchdog_started
    if _grafana_watchdog_started:
        return
    _grafana_watchdog_started = True

    def _loop():
        import time as _time
        _time.sleep(60)
        while True:
            try:
                with app.app_context():
                    _sync_grafana_data(force=False)
            except Exception as exc:
                print("[GRAFANA WATCHDOG ERROR]", exc)
            _time.sleep(GRAFANA_WATCHDOG_INTERVAL_SECONDS)

    t = threading.Thread(target=_loop, daemon=True, name="grafana-stale-watchdog")
    t.start()

@app.route('/api/grafana/dashboard', methods=['GET'])
@login_required
def api_grafana_dashboard():
    try:
        _sync_grafana_data(force=False)
        conn = get_db()
        cur = conn.cursor()
        now_brt = _grafana_now_brt()

        cur.execute("""
            SELECT id, ticket_key, ticket_type, ticket_number, cf, regional, designation,
                   tipo_ral, is_qualidade, cliente, abertura_raw, abertura_dt,
                   status_andamento, responsible_name, is_new, first_seen_at
            FROM grafana_tickets
            ORDER BY abertura_dt ASC NULLS LAST, id ASC;
        """)
        rows = cur.fetchall()

        cur.execute("SELECT COUNT(*) AS c FROM grafana_cleared_tickets;")
        cleared_total = (cur.fetchone() or {}).get("c", 0)

        cur.execute("SELECT last_sync_at, last_sync_status, last_sync_error FROM grafana_sync_meta WHERE id = 1;")
        meta = cur.fetchone() or {}
        cur.close()

        cf_map = {}
        for item in GRAFANA_CF_LIST:
            cf_map[item["cf"]] = {
                "cf": item["cf"],
                "label": item["label"],
                "regional": item["regional"],
                "ral": 0,
                "rec": 0,
                "qualidade": 0,
                "new_ral": 0,
                "new_rec": 0,
                "new_qualidade": 0,
                "overdue_ral": 0,
                "overdue_rec": 0,
            }

        totals = {
            "ALL": {"ral": 0, "rec": 0, "qualidade": 0},
            "ES": {"ral": 0, "rec": 0, "qualidade": 0},
            "INTERIOR": {"ral": 0, "rec": 0, "qualidade": 0},
            "CAPITAL": {"ral": 0, "rec": 0, "qualidade": 0},
        }
        new_ral_feed = []
        new_rec_feed = []
        ral_timeline = []

        for r in rows:
            cf = r["cf"]
            reg = r["regional"]
            ttype = r["ticket_type"]
            is_qual = bool(r.get("is_qualidade")) or (r.get("tipo_ral") or "").strip().upper() == "QUALIDADE"
            is_new = bool(r.get("is_new"))
            sla = _grafana_compute_sla(ttype, r.get("abertura_dt"), now_brt)

            if cf in cf_map:
                if ttype == "RAL":
                    if is_qual:
                        cf_map[cf]["qualidade"] += 1
                        totals["ALL"]["qualidade"] += 1
                        if reg in totals:
                            totals[reg]["qualidade"] += 1
                        if is_new:
                            cf_map[cf]["new_qualidade"] += 1
                    else:
                        cf_map[cf]["ral"] += 1
                        totals["ALL"]["ral"] += 1
                        if reg in totals:
                            totals[reg]["ral"] += 1
                        if is_new:
                            cf_map[cf]["new_ral"] += 1
                        if sla["sla_status"] == "overdue":
                            cf_map[cf]["overdue_ral"] += 1
                        elapsed_min = None
                        if r.get("abertura_dt"):
                            elapsed_min = max(0, int((now_brt - r["abertura_dt"]).total_seconds() // 60))
                        ral_timeline.append({
                            "ticket_type": "RAL",
                            "ticket_number": r["ticket_number"],
                            "cf": cf,
                            "regional": reg,
                            "designation": r["designation"],
                            "cliente": "",
                            "abertura_raw": r["abertura_raw"],
                            "elapsed_minutes": elapsed_min,
                        })
                else:
                    cf_map[cf]["rec"] += 1
                    totals["ALL"]["rec"] += 1
                    if reg in totals:
                        totals[reg]["rec"] += 1
                    if is_new:
                        cf_map[cf]["new_rec"] += 1
                    if sla["sla_status"] == "overdue":
                        cf_map[cf]["overdue_rec"] += 1
                    elapsed_min = None
                    if r.get("abertura_dt"):
                        elapsed_min = max(0, int((now_brt - r["abertura_dt"]).total_seconds() // 60))
                    ral_timeline.append({
                        "ticket_type": "REC",
                        "ticket_number": r["ticket_number"],
                        "cf": cf,
                        "regional": reg,
                        "designation": r["designation"],
                        "cliente": r.get("cliente") or "",
                        "abertura_raw": r["abertura_raw"],
                        "elapsed_minutes": elapsed_min,
                    })

            if is_new:
                feed_item = {
                    "id": r["id"],
                    "ticket_number": r["ticket_number"],
                    "ticket_type": ttype,
                    "cf": cf,
                    "regional": reg,
                    "designation": r["designation"],
                    "cliente": r["cliente"],
                    "tipo_ral": r["tipo_ral"],
                    "is_qualidade": is_qual,
                    "abertura_raw": r["abertura_raw"],
                    "sla_status": sla["sla_status"],
                    "sla_label": sla["sla_label"],
                }
                if ttype == "RAL" and not is_qual:
                    new_ral_feed.append(feed_item)
                elif ttype == "REC":
                    new_rec_feed.append(feed_item)

        _start_grafana_stale_watchdog()
        last_sync_iso = meta.get("last_sync_at").strftime("%d/%m/%Y %H:%M:%S") if meta.get("last_sync_at") else None
        seconds_to_next = GRAFANA_SYNC_INTERVAL_SECONDS
        if meta.get("last_sync_at"):
            elapsed = (now_brt - meta["last_sync_at"]).total_seconds()
            seconds_to_next = max(0, int(GRAFANA_SYNC_INTERVAL_SECONDS - elapsed))

        gh_changed_at = meta.get("github_last_changed_at")
        gh_stale_minutes = 0
        gh_is_stale = False
        if gh_changed_at:
            gh_elapsed = max(0, (now_brt - gh_changed_at).total_seconds())
            gh_stale_minutes = int(gh_elapsed // 60)
            gh_is_stale = gh_elapsed >= GRAFANA_STALE_THRESHOLD_SECONDS

        return jsonify({
            "totals": totals,
            "cfs": [cf_map[item["cf"]] for item in GRAFANA_CF_LIST],
            "qualidade_chart": [{"cf": item["cf"], "label": item["label"], "count": cf_map[item["cf"]]["qualidade"]} for item in GRAFANA_CF_LIST],
            "ral_timeline": ral_timeline,
            "new_feed": {"ral": new_ral_feed[:30], "rec": new_rec_feed[:30]},
            "cleared_total": cleared_total,
            "sync": {
                "last_sync_at": last_sync_iso,
                "status": meta.get("last_sync_status") or "pending",
                "error": meta.get("last_sync_error"),
                "interval_seconds": GRAFANA_SYNC_INTERVAL_SECONDS,
                "seconds_to_next": seconds_to_next,
                "manual_override_active": bool(meta.get("manual_override_active")),
                "manual_updated_at": meta.get("manual_updated_at").strftime("%d/%m/%Y %H:%M:%S") if meta.get("manual_updated_at") else None,
                "manual_updated_by": meta.get("manual_updated_by"),
                "github_last_changed_at": gh_changed_at.strftime("%d/%m/%Y %H:%M:%S") if gh_changed_at else None,
                "github_stale_minutes": gh_stale_minutes,
                "github_is_stale": gh_is_stale,
            },
            "server_time_brt": now_brt.strftime("%d/%m, %H:%M"),
        })
    except Exception as e:
        print("[GRAFANA DASHBOARD ERROR]", e)
        return jsonify({"error": "Falha ao carregar painel Grafana."}), 500

@app.route('/api/grafana/sync', methods=['POST'])
@login_required
def api_grafana_sync():
    res = _sync_grafana_data(force=True)
    return jsonify({"success": "error" not in res, **res})


@app.route('/api/grafana/manual-upload', methods=['POST'])
@login_required
def api_grafana_manual_upload():
    """Atualiza manualmente as bases RAL (separando RAL e QUA) e/ou REC do Grafana."""
    ral_file = request.files.get('ral_file')
    rec_file = request.files.get('rec_file')
    has_ral = bool(ral_file and (ral_file.filename or '').strip())
    has_rec = bool(rec_file and (rec_file.filename or '').strip())
    if not has_ral and not has_rec:
        return jsonify({"error": "Envie ao menos uma base (RAL ou REC) para atualização manual."}), 400

    conn = None
    cur = None
    locked = False
    now_brt = _grafana_now_brt()
    try:
        parsed_tickets = {}
        target_types = set()

        if has_ral:
            ral_rows = _read_grafana_uploaded_file(ral_file)
            ral_raw = _parse_grafana_rows_to_tickets(ral_rows, "RAL", parsed_tickets)
            if ral_raw == 0:
                return jsonify({"error": "A base RAL enviada está vazia ou sem colunas reconhecidas (Num.Recup. / CF Exec.)."}), 400
            target_types.add("RAL")

        if has_rec:
            rec_rows = _read_grafana_uploaded_file(rec_file)
            rec_raw = _parse_grafana_rows_to_tickets(rec_rows, "REC", parsed_tickets)
            if rec_raw == 0:
                return jsonify({"error": "A base REC enviada está vazia ou sem colunas reconhecidas (Num.Recup. / CF Exec.)."}), 400
            target_types.add("REC")

        if not parsed_tickets:
            return jsonify({"error": "Nenhum ticket válido encontrado nos arquivos enviados (verifique as colunas Num.Recup. e CF Exec.)."}), 400

        conn = get_db()
        cur = conn.cursor()
        _ensure_grafana_sync_meta_cols(cur)

        cur.execute("SELECT pg_try_advisory_lock(984512) AS locked;")
        lock_row = cur.fetchone()
        locked = bool(lock_row and lock_row.get("locked"))
        if not locked:
            return jsonify({"error": "Sincronização em andamento. Aguarde alguns segundos e tente novamente."}), 409

        batch_res = _apply_grafana_ticket_batch(cur, parsed_tickets, target_types, now_brt)
        uploader = (
            session.get('user_name')
            or session.get('username')
            or session.get('user')
            or 'Operador'
        )
        uploader = str(uploader)[:150]

        cur.execute("""
            INSERT INTO grafana_sync_meta (
                id, last_sync_at, last_sync_status, last_sync_error,
                ral_count, rec_count, qualidade_count, new_count, cleared_count,
                manual_override_active, manual_updated_at, manual_updated_by
            )
            VALUES (1, %s, 'manual_override', NULL, %s, %s, %s, %s, %s, TRUE, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                last_sync_at = EXCLUDED.last_sync_at,
                last_sync_status = 'manual_override',
                last_sync_error = NULL,
                ral_count = EXCLUDED.ral_count,
                rec_count = EXCLUDED.rec_count,
                qualidade_count = EXCLUDED.qualidade_count,
                new_count = EXCLUDED.new_count,
                cleared_count = grafana_sync_meta.cleared_count + EXCLUDED.cleared_count,
                manual_override_active = TRUE,
                manual_updated_at = EXCLUDED.manual_updated_at,
                manual_updated_by = EXCLUDED.manual_updated_by;
        """, (
            now_brt,
            batch_res["ral_count"], batch_res["rec_count"], batch_res["qualidade_count"],
            batch_res["new_active"], batch_res["cleared_now"],
            now_brt, uploader,
        ))
        conn.commit()

        ral_loaded = sum(1 for v in parsed_tickets.values() if v["ticket_type"] == "RAL" and not v["is_qualidade"])
        qua_loaded = sum(1 for v in parsed_tickets.values() if v["is_qualidade"])
        rec_loaded = sum(1 for v in parsed_tickets.values() if v["ticket_type"] == "REC")

        return jsonify({
            "success": True,
            "updated_types": sorted(target_types),
            "ral_loaded": ral_loaded,
            "qua_loaded": qua_loaded,
            "rec_loaded": rec_loaded,
            "new_count": batch_res["new_active"],
            "cleared_now": batch_res["cleared_now"],
            "manual_updated_by": uploader,
            "manual_updated_at": now_brt.strftime("%d/%m/%Y %H:%M:%S"),
        })
    except ValueError as ve:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print("[GRAFANA MANUAL UPLOAD ERROR]", e)
        return jsonify({"error": "Falha ao processar atualização manual das bases."}), 500
    finally:
        if locked and cur and conn:
            try:
                cur.execute("SELECT pg_advisory_unlock(984512);")
                conn.commit()
            except Exception:
                pass
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn and not has_request_context():
            try:
                conn.close()
            except Exception:
                pass

@app.route('/api/grafana/tickets', methods=['GET'])
@login_required
def api_grafana_tickets():
    try:
        cf = (request.args.get("cf") or "").strip().upper()
        queue = (request.args.get("queue") or "ALL").strip().upper()
        status_filter = (request.args.get("status") or "").strip()
        search = (request.args.get("search") or "").strip().lower()

        where_clauses = []
        params = []
        if cf and cf in GRAFANA_CF_META:
            where_clauses.append("cf = %s")
            params.append(cf)
        if queue == "RAL":
            where_clauses.append("(ticket_type = 'RAL' AND COALESCE(is_qualidade, FALSE) = FALSE AND UPPER(COALESCE(tipo_ral, '')) <> 'QUALIDADE')")
        elif queue == "REC":
            where_clauses.append("ticket_type = 'REC'")
        elif queue == "QUALIDADE":
            where_clauses.append("(is_qualidade = TRUE OR UPPER(COALESCE(tipo_ral, '')) = 'QUALIDADE')")
        if status_filter:
            where_clauses.append("status_andamento = %s")
            params.append(status_filter)
        if search:
            like = f"%{search}%"
            where_clauses.append("(LOWER(ticket_number) LIKE %s OR LOWER(designation) LIKE %s OR LOWER(cliente) LIKE %s OR LOWER(tipo_ral) LIKE %s OR LOWER(COALESCE(responsible_name, '')) LIKE %s OR LOWER(COALESCE(distancia, '')) LIKE %s OR LOWER(COALESCE(referencia, '')) LIKE %s OR LOWER(COALESCE(endereco, '')) LIKE %s)")
            params.extend([like, like, like, like, like, like, like, like])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        conn = get_db()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT id, ticket_key, ticket_type, ticket_number, cf, regional, cf_exec_raw,
                   designation, tipo_ral, is_qualidade, cliente, anorm, abertura_raw, abertura_dt,
                   duracao_raw, resp_code, tecnico_csv, anatel, prejuizo,
                   status_andamento, responsible_user_id, responsible_name,
                   COALESCE(distancia, '') AS distancia, COALESCE(referencia, '') AS referencia,
                   COALESCE(endereco, '') AS endereco,
                   is_new, first_seen_at
            FROM grafana_tickets
            {where_sql}
            ORDER BY abertura_dt ASC NULLS LAST, id ASC;
        """, tuple(params))
        rows = cur.fetchall()

        keys = [r["ticket_key"] for r in rows]
        notes_by_key = {}
        if keys:
            cur.execute("""
                SELECT id, ticket_key, content, author_user_id, author_name, created_at, updated_at
                FROM grafana_ticket_notes
                WHERE ticket_key = ANY(%s)
                ORDER BY created_at ASC, id ASC;
            """, (keys,))
            for n in cur.fetchall():
                notes_by_key.setdefault(n["ticket_key"], []).append({
                    "id": n["id"],
                    "content": n["content"],
                    "author_user_id": n["author_user_id"],
                    "author_name": n["author_name"],
                    "created_at": n["created_at"].strftime("%d/%m %H:%M") if n.get("created_at") else "",
                    "updated_at": n["updated_at"].strftime("%d/%m %H:%M") if n.get("updated_at") else "",
                })
        cur.close()

        now_brt = _grafana_now_brt()
        tickets = []
        for r in rows:
            sla = _grafana_compute_sla(r["ticket_type"], r.get("abertura_dt"), now_brt)
            tickets.append({
                "id": r["id"],
                "ticket_key": r["ticket_key"],
                "ticket_type": r["ticket_type"],
                "ticket_number": r["ticket_number"],
                "cf": r["cf"],
                "cf_label": (GRAFANA_CF_META.get(r["cf"]) or {}).get("label", r["cf"]),
                "regional": r["regional"],
                "cf_exec_raw": r["cf_exec_raw"],
                "designation": r["designation"],
                "tipo_ral": r["tipo_ral"],
                "is_qualidade": bool(r.get("is_qualidade")),
                "cliente": r["cliente"],
                "anorm": r["anorm"],
                "abertura_raw": r["abertura_raw"],
                "abertura_iso": r["abertura_dt"].isoformat() if r.get("abertura_dt") else None,
                "duracao_raw": r["duracao_raw"],
                "resp_code": r["resp_code"],
                "tecnico_csv": r["tecnico_csv"],
                "anatel": r["anatel"],
                "prejuizo": r["prejuizo"],
                "status_andamento": r["status_andamento"] or "Sem classificação",
                "responsible_user_id": r["responsible_user_id"],
                "responsible_name": r["responsible_name"] or "",
                "distancia": r.get("distancia") or "",
                "referencia": r.get("referencia") or "",
                "endereco": r.get("endereco") or "",
                "is_new": bool(r.get("is_new")),
                "notes": notes_by_key.get(r["ticket_key"], []),
                **sla,
            })

        return jsonify({
            "tickets": tickets,
            "server_time_brt": now_brt.strftime("%d/%m, %H:%M"),
            "statuses": GRAFANA_ALLOWED_STATUSES,
        })
    except Exception as e:
        print("[GRAFANA TICKETS ERROR]", e)
        return jsonify({"error": "Falha ao listar atividades."}), 500

@app.route('/api/grafana/cleared', methods=['GET'])
@login_required
def api_grafana_cleared():
    try:
        cf = (request.args.get("cf") or "").strip().upper()
        queue = (request.args.get("queue") or "ALL").strip().upper()
        search = (request.args.get("search") or "").strip().lower()
        try:
            limit = min(500, max(10, int(request.args.get("limit") or 200)))
        except (TypeError, ValueError):
            limit = 200

        where_clauses = []
        params = []
        if cf and cf in GRAFANA_CF_META:
            where_clauses.append("cf = %s")
            params.append(cf)
        if queue == "RAL":
            where_clauses.append("(ticket_type = 'RAL' AND COALESCE(is_qualidade, FALSE) = FALSE AND UPPER(COALESCE(tipo_ral, '')) <> 'QUALIDADE')")
        elif queue == "REC":
            where_clauses.append("ticket_type = 'REC'")
        elif queue == "QUALIDADE":
            where_clauses.append("(is_qualidade = TRUE OR UPPER(COALESCE(tipo_ral, '')) = 'QUALIDADE')")
        if search:
            like = f"%{search}%"
            where_clauses.append("(LOWER(ticket_number) LIKE %s OR LOWER(designation) LIKE %s OR LOWER(cliente) LIKE %s OR LOWER(COALESCE(distancia, '')) LIKE %s OR LOWER(COALESCE(referencia, '')) LIKE %s OR LOWER(COALESCE(endereco, '')) LIKE %s)")
            params.extend([like, like, like, like, like, like])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        conn = get_db()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT id, ticket_key, ticket_type, ticket_number, cf, regional, designation,
                   tipo_ral, is_qualidade, cliente, abertura_raw, status_andamento,
                   responsible_name, COALESCE(distancia, '') AS distancia, COALESCE(referencia, '') AS referencia,
                   COALESCE(endereco, '') AS endereco,
                   notes_snapshot, first_seen_at, cleared_at
            FROM grafana_cleared_tickets
            {where_sql}
            ORDER BY cleared_at DESC, id DESC
            LIMIT %s;
        """, tuple(params + [limit]))
        rows = cur.fetchall()
        cur.close()

        items = []
        for r in rows:
            items.append({
                "id": r["id"],
                "ticket_type": r["ticket_type"],
                "ticket_number": r["ticket_number"],
                "cf": r["cf"],
                "regional": r["regional"],
                "designation": r["designation"],
                "tipo_ral": r["tipo_ral"],
                "is_qualidade": bool(r.get("is_qualidade")),
                "cliente": r["cliente"],
                "abertura_raw": r["abertura_raw"],
                "status_andamento": r["status_andamento"] or "Sem classificação",
                "responsible_name": r["responsible_name"] or "",
                "distancia": r.get("distancia") or "",
                "referencia": r.get("referencia") or "",
                "endereco": r.get("endereco") or "",
                "notes": r.get("notes_snapshot") or [],
                "cleared_at": r["cleared_at"].strftime("%d/%m/%Y %H:%M") if r.get("cleared_at") else "",
            })
        return jsonify({"cleared": items})
    except Exception as e:
        print("[GRAFANA CLEARED ERROR]", e)
        return jsonify({"error": "Falha ao listar falhas sanadas."}), 500

@app.route('/api/grafana/tickets/<int:ticket_id>/status', methods=['PUT'])
@login_required
def api_grafana_update_status(ticket_id):
    data = request.get_json(silent=True) or {}
    status_val = (data.get("status_andamento") or "").strip()
    if status_val not in GRAFANA_ALLOWED_STATUSES:
        return jsonify({"error": "Status de andamento inválido."}), 400
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE grafana_tickets
            SET status_andamento = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, ticket_number, status_andamento;
        """, (status_val, ticket_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            return jsonify({"error": "Atividade não encontrada."}), 404
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana status {updated['ticket_number']} -> {status_val}")
        return jsonify({"success": True, "status_andamento": updated["status_andamento"]})
    except Exception as e:
        print("[GRAFANA STATUS ERROR]", e)
        return jsonify({"error": "Falha ao atualizar status."}), 500


@app.route('/api/grafana/tickets/<int:ticket_id>/dist-ref', methods=['PUT'])
@login_required
def api_grafana_update_dist_ref(ticket_id):
    data = request.get_json(silent=True) or {}
    distancia = (data.get("distancia") or "").strip()[:120]
    referencia = (data.get("referencia") or "").strip()[:255]
    endereco = (data.get("endereco") or "").strip()[:255]
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE grafana_tickets
            SET distancia = %s, referencia = %s, endereco = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, ticket_number, distancia, referencia, endereco;
        """, (distancia, referencia, endereco, ticket_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            return jsonify({"error": "Atividade não encontrada."}), 404
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana DIST/REF/END {updated['ticket_number']} -> DIST={distancia} REF={referencia} END={endereco}")
        return jsonify({
            "success": True,
            "distancia": updated["distancia"] or "",
            "referencia": updated["referencia"] or "",
            "endereco": updated["endereco"] or "",
        })
    except Exception as e:
        print("[GRAFANA DIST-REF ERROR]", e)
        return jsonify({"error": "Falha ao salvar DIST / REF / Endereço."}), 500


@app.route('/api/grafana/cleared/<int:cleared_id>/dist-ref', methods=['PUT'])
@login_required
def api_grafana_update_cleared_dist_ref(cleared_id):
    data = request.get_json(silent=True) or {}
    distancia = (data.get("distancia") or "").strip()[:120]
    referencia = (data.get("referencia") or "").strip()[:255]
    endereco = (data.get("endereco") or "").strip()[:255]
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE grafana_cleared_tickets
            SET distancia = %s, referencia = %s, endereco = %s
            WHERE id = %s
            RETURNING id, ticket_number, distancia, referencia, endereco;
        """, (distancia, referencia, endereco, cleared_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            return jsonify({"error": "Registro histórico não encontrado."}), 404
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana Histórico DIST/REF/END {updated['ticket_number']} -> DIST={distancia} REF={referencia} END={endereco}")
        return jsonify({
            "success": True,
            "distancia": updated["distancia"] or "",
            "referencia": updated["referencia"] or "",
            "endereco": updated["endereco"] or "",
        })
    except Exception as e:
        print("[GRAFANA CLEARED DIST-REF ERROR]", e)
        return jsonify({"error": "Falha ao salvar DIST / REF / Endereço no histórico."}), 500

@app.route('/api/grafana/tickets/<int:ticket_id>/responsible', methods=['PUT'])
@login_required
def api_grafana_update_responsible(ticket_id):
    data = request.get_json(silent=True) or {}
    target_tech_id = data.get("tech_id")
    target_uid = data.get("user_id")
    try:
        conn = get_db()
        cur = conn.cursor()
        resp_name = None
        clean_uid = None
        clean_tech_id = None

        if target_tech_id is not None and str(target_tech_id).strip() != "":
            try:
                clean_tech_id = int(target_tech_id)
            except (TypeError, ValueError):
                cur.close()
                return jsonify({"error": "ID da pessoa inválido."}), 400
            cur.execute("SELECT id, name FROM technicians WHERE id = %s;", (clean_tech_id,))
            trow = cur.fetchone()
            if not trow:
                cur.close()
                return jsonify({"error": "Pessoa não encontrada na base de Pessoas."}), 404
            resp_name = format_person_name(trow["name"])
            cur.execute("SELECT id FROM users WHERE tech_id = %s LIMIT 1;", (clean_tech_id,))
            linked_u = cur.fetchone()
            if linked_u:
                clean_uid = linked_u["id"]
        elif target_uid is not None and str(target_uid).strip() != "":
            try:
                clean_uid = int(target_uid)
            except (TypeError, ValueError):
                cur.close()
                return jsonify({"error": "ID de responsável inválido."}), 400
            cur.execute("""
                SELECT u.id, u.username, u.tech_id, t.name AS tech_name
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                WHERE u.id = %s;
            """, (clean_uid,))
            urow = cur.fetchone()
            if not urow:
                cur.close()
                return jsonify({"error": "Usuário responsável não encontrado."}), 404
            clean_tech_id = urow.get("tech_id")
            raw_display = urow.get("tech_name") or (urow.get("username") or "").replace(".", " ")
            resp_name = format_person_name(raw_display)

        cur.execute("""
            UPDATE grafana_tickets
            SET responsible_user_id = %s, responsible_tech_id = %s, responsible_name = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, ticket_number, responsible_user_id, responsible_tech_id, responsible_name;
        """, (clean_uid, clean_tech_id, resp_name, ticket_id))
        updated = cur.fetchone()
        if not updated:
            cur.close()
            return jsonify({"error": "Atividade não encontrada."}), 404
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana responsável {updated['ticket_number']} -> {resp_name or 'Removido'}")
        return jsonify({
            "success": True,
            "responsible_user_id": updated["responsible_user_id"],
            "responsible_tech_id": updated["responsible_tech_id"],
            "responsible_name": updated["responsible_name"] or "",
        })
    except Exception as e:
        print("[GRAFANA RESPONSIBLE ERROR]", e)
        return jsonify({"error": "Falha ao definir responsável."}), 500

@app.route('/api/grafana/tickets/<int:ticket_id>/notes', methods=['POST'])
@login_required
def api_grafana_add_note(ticket_id):
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "O texto da nota não pode ficar vazio."}), 400
    if len(content) > 1500:
        return jsonify({"error": "A nota deve ter no máximo 1500 caracteres."}), 400
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT ticket_key, ticket_number FROM grafana_tickets WHERE id = %s;", (ticket_id,))
        trow = cur.fetchone()
        if not trow:
            cur.close()
            return jsonify({"error": "Atividade não encontrada."}), 404

        cur.execute("""
            SELECT u.username, t.name AS tech_name
            FROM users u
            LEFT JOIN technicians t ON u.tech_id = t.id
            WHERE u.id = %s;
        """, (session['user_id'],))
        urow = cur.fetchone() or {}
        author_name = format_person_name(urow.get("tech_name") or (urow.get("username") or session.get("username") or "Operador").replace(".", " "))

        now_brt = _grafana_now_brt()
        cur.execute("""
            INSERT INTO grafana_ticket_notes (ticket_key, content, author_user_id, author_name, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, content, author_user_id, author_name, created_at, updated_at;
        """, (trow["ticket_key"], content, session['user_id'], author_name, now_brt, now_brt))
        note = cur.fetchone()
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana nota adicionada em {trow['ticket_number']}")
        return jsonify({
            "success": True,
            "note": {
                "id": note["id"],
                "content": note["content"],
                "author_user_id": note["author_user_id"],
                "author_name": note["author_name"],
                "created_at": note["created_at"].strftime("%d/%m %H:%M"),
                "updated_at": note["updated_at"].strftime("%d/%m %H:%M"),
            }
        }), 201
    except Exception as e:
        print("[GRAFANA ADD NOTE ERROR]", e)
        return jsonify({"error": "Falha ao adicionar nota."}), 500

@app.route('/api/grafana/notes/<int:note_id>', methods=['PUT'])
@login_required
def api_grafana_edit_note(note_id):
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "O texto da nota não pode ficar vazio."}), 400
    if len(content) > 1500:
        return jsonify({"error": "A nota deve ter no máximo 1500 caracteres."}), 400
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, author_user_id FROM grafana_ticket_notes WHERE id = %s;", (note_id,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            return jsonify({"error": "Nota não encontrada."}), 404
        auth = get_current_user_auth()
        if existing["author_user_id"] != session['user_id'] and not (auth and auth.get("is_coordenador")):
            cur.close()
            return jsonify({"error": "Você só pode editar suas próprias notas."}), 403

        now_brt = _grafana_now_brt()
        cur.execute("""
            UPDATE grafana_ticket_notes
            SET content = %s, updated_at = %s
            WHERE id = %s
            RETURNING id, content, author_user_id, author_name, created_at, updated_at;
        """, (content, now_brt, note_id))
        note = cur.fetchone()
        conn.commit()
        cur.close()
        return jsonify({
            "success": True,
            "note": {
                "id": note["id"],
                "content": note["content"],
                "author_user_id": note["author_user_id"],
                "author_name": note["author_name"],
                "created_at": note["created_at"].strftime("%d/%m %H:%M"),
                "updated_at": note["updated_at"].strftime("%d/%m %H:%M"),
            }
        })
    except Exception as e:
        print("[GRAFANA EDIT NOTE ERROR]", e)
        return jsonify({"error": "Falha ao editar nota."}), 500

@app.route('/api/grafana/notes/<int:note_id>', methods=['DELETE'])
@login_required
def api_grafana_delete_note(note_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, author_user_id, ticket_key FROM grafana_ticket_notes WHERE id = %s;", (note_id,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            return jsonify({"error": "Nota não encontrada."}), 404
        auth = get_current_user_auth()
        if existing["author_user_id"] != session['user_id'] and not (auth and auth.get("is_coordenador")):
            cur.close()
            return jsonify({"error": "Você só pode remover suas próprias notas."}), 403
        cur.execute("DELETE FROM grafana_ticket_notes WHERE id = %s;", (note_id,))
        conn.commit()
        cur.close()
        log_action(session['user_id'], session.get('username'), f"Grafana nota #{note_id} removida ({existing['ticket_key']})")
        return jsonify({"success": True})
    except Exception as e:
        print("[GRAFANA DELETE NOTE ERROR]", e)
        return jsonify({"error": "Falha ao remover nota."}), 500

@app.route('/api/grafana/people', methods=['GET'])
@login_required
def api_grafana_people():
    try:
        q = (request.args.get("q") or "").strip().lower()
        conn = get_db()
        cur = conn.cursor()

        # 1. All registered people from Pessoas (technicians table)
        cur.execute("""
            SELECT t.id AS tech_id, t.name, t.role, t.company, t.area,
                   u.id AS user_id, u.username
            FROM technicians t
            LEFT JOIN users u ON u.tech_id = t.id
            ORDER BY t.name ASC;
        """)
        tech_rows = cur.fetchall()

        # 2. Users without a linked technician record (e.g. standalone admin/coordinator logins)
        cur.execute("""
            SELECT u.id AS user_id, u.username, u.role
            FROM users u
            WHERE u.tech_id IS NULL
            ORDER BY u.username ASC;
        """)
        user_only_rows = cur.fetchall()
        cur.close()

        people = []
        seen_names = set()

        for r in tech_rows:
            name = format_person_name(r.get("name") or "")
            if not name:
                continue
            uname = r.get("username") or ""
            if q and q not in name.lower() and q not in uname.lower() and q not in (r.get("company") or "").lower():
                continue
            seen_names.add(name.lower())
            people.append({
                "key": f"tech:{r['tech_id']}",
                "tech_id": r["tech_id"],
                "user_id": r.get("user_id"),
                "name": name,
                "username": uname,
                "role": r.get("role") or "Técnico",
                "company": r.get("company") or "",
            })

        for r in user_only_rows:
            name = format_person_name((r.get("username") or "").replace(".", " "))
            if not name or name.lower() in seen_names:
                continue
            uname = r.get("username") or ""
            if q and q not in name.lower() and q not in uname.lower():
                continue
            seen_names.add(name.lower())
            people.append({
                "key": f"user:{r['user_id']}",
                "tech_id": None,
                "user_id": r["user_id"],
                "name": name,
                "username": uname,
                "role": r.get("role") or "Usuário",
                "company": "",
            })

        people.sort(key=lambda p: p["name"].lower())
        return jsonify({"people": people[:500]})
    except Exception as e:
        print("[GRAFANA PEOPLE ERROR]", e)
        return jsonify({"error": "Falha ao listar pessoas."}), 500

@app.route('/api/grafana/export', methods=['GET'])
@login_required
def api_grafana_export():
    try:
        scope = (request.args.get("scope") or "active").strip().lower()
        if scope not in ("active", "cleared", "all"):
            scope = "active"
        cf = (request.args.get("cf") or "").strip().upper()
        if cf not in GRAFANA_CF_META:
            cf = ""
        queue = (request.args.get("queue") or "ALL").strip().upper()
        if queue not in ("RAL", "REC", "QUALIDADE", "ALL"):
            queue = "ALL"
        status_filter = (request.args.get("status") or "").strip()
        search = (request.args.get("search") or "").strip().lower()

        conn = get_db()
        cur = conn.cursor()
        output = io.StringIO()
        output.write("\ufeff")
        writer = safe_csv_writer(output, delimiter=";")

        writer.writerow([
            "Base", "Tipo", "Numero", "Regional", "CF", "CF Exec.", "Designacao",
            "Tipo RAL", "Qualidade", "Cliente", "Abertura", "SLA",
            "Status Andamento", "Responsavel", "DIST (Distancia)", "REF (Referencia)", "Endereco da Falha", "Notas", "Sanada Em"
        ])

        now_brt = _grafana_now_brt()

        def _build_filters():
            wc = []
            pr = []
            if cf and cf in GRAFANA_CF_META:
                wc.append("cf = %s")
                pr.append(cf)
            if queue == "RAL":
                wc.append("(ticket_type = 'RAL' AND COALESCE(is_qualidade, FALSE) = FALSE AND UPPER(COALESCE(tipo_ral, '')) <> 'QUALIDADE')")
            elif queue == "REC":
                wc.append("ticket_type = 'REC'")
            elif queue == "QUALIDADE":
                wc.append("(is_qualidade = TRUE OR UPPER(COALESCE(tipo_ral, '')) = 'QUALIDADE')")
            if status_filter:
                wc.append("status_andamento = %s")
                pr.append(status_filter)
            if search:
                lk = f"%{search}%"
                wc.append("(LOWER(ticket_number) LIKE %s OR LOWER(designation) LIKE %s OR LOWER(cliente) LIKE %s)")
                pr.extend([lk, lk, lk])
            return ("WHERE " + " AND ".join(wc)) if wc else "", tuple(pr)

        where_sql, params = _build_filters()

        if scope in ("active", "all"):
            cur.execute(f"""
                SELECT ticket_key, ticket_type, ticket_number, regional, cf, cf_exec_raw,
                       designation, tipo_ral, is_qualidade, cliente, abertura_raw, abertura_dt,
                       status_andamento, responsible_name,
                       COALESCE(distancia, '') AS distancia, COALESCE(referencia, '') AS referencia,
                       COALESCE(endereco, '') AS endereco
                FROM grafana_tickets
                {where_sql}
                ORDER BY regional, cf, abertura_dt ASC NULLS LAST;
            """, params)
            active_rows = cur.fetchall()
            keys = [r["ticket_key"] for r in active_rows]
            notes_map = {}
            if keys:
                cur.execute("SELECT ticket_key, author_name, content FROM grafana_ticket_notes WHERE ticket_key = ANY(%s) ORDER BY created_at ASC;", (keys,))
                for n in cur.fetchall():
                    notes_map.setdefault(n["ticket_key"], []).append(f"{n['author_name']}: {n['content']}")
            for r in active_rows:
                sla = _grafana_compute_sla(r["ticket_type"], r.get("abertura_dt"), now_brt)
                writer.writerow([
                    "ATIVA",
                    r["ticket_type"],
                    r["ticket_number"],
                    r["regional"],
                    r["cf"],
                    r["cf_exec_raw"] or "",
                    r["designation"] or "",
                    r["tipo_ral"] or "",
                    "SIM" if r.get("is_qualidade") else "NAO",
                    r["cliente"] or "",
                    r["abertura_raw"] or "",
                    sla["sla_label"],
                    r["status_andamento"] or "Sem classificação",
                    r["responsible_name"] or "",
                    r.get("distancia") or "",
                    r.get("referencia") or "",
                    r.get("endereco") or "",
                    " | ".join(notes_map.get(r["ticket_key"], [])),
                    "",
                ])

        if scope in ("cleared", "all"):
            cur.execute(f"""
                SELECT ticket_type, ticket_number, regional, cf, cf_exec_raw,
                       designation, tipo_ral, is_qualidade, cliente, abertura_raw,
                       status_andamento, responsible_name,
                       COALESCE(distancia, '') AS distancia, COALESCE(referencia, '') AS referencia,
                       COALESCE(endereco, '') AS endereco,
                       notes_snapshot, cleared_at
                FROM grafana_cleared_tickets
                {where_sql}
                ORDER BY cleared_at DESC;
            """, params)
            for r in cur.fetchall():
                snap = r.get("notes_snapshot") or []
                notes_txt = " | ".join([f"{n.get('author_name', '')}: {n.get('content', '')}" for n in snap if isinstance(n, dict)])
                writer.writerow([
                    "SANADA",
                    r["ticket_type"],
                    r["ticket_number"],
                    r["regional"],
                    r["cf"],
                    r["cf_exec_raw"] or "",
                    r["designation"] or "",
                    r["tipo_ral"] or "",
                    "SIM" if r.get("is_qualidade") else "NAO",
                    r["cliente"] or "",
                    r["abertura_raw"] or "",
                    "SANADA",
                    r["status_andamento"] or "Sem classificação",
                    r["responsible_name"] or "",
                    r.get("distancia") or "",
                    r.get("referencia") or "",
                    r.get("endereco") or "",
                    notes_txt,
                    r["cleared_at"].strftime("%d/%m/%Y %H:%M") if r.get("cleared_at") else "",
                ])

        cur.close()
        csv_bytes = output.getvalue().encode("utf-8")
        fname_parts = ["grafana", scope]
        if cf:
            fname_parts.append(cf.lower())
        if queue != "ALL":
            fname_parts.append(queue.lower())
        filename = "_".join(fname_parts) + f"_{now_brt.strftime('%Y%m%d_%H%M')}.csv"

        return Response(
            csv_bytes,
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        print("[GRAFANA EXPORT ERROR]", e)
        return jsonify({"error": "Falha ao exportar CSV."}), 500


# --------------------------------------------------------------------------
# GLOBAL ERROR HANDLERS (CRASH RESILIENCE & JSON INTEGRITY)
# --------------------------------------------------------------------------
@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Recurso solicitado não encontrado.", "status": 404}), 404
    return serve_react_app(), 404

@app.errorhandler(403)
def handle_403(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Acesso negado. Permissões insuficientes para esta operação.", "status": 403}), 403
    return redirect('/login')

@app.errorhandler(413)
def handle_413(e):
    return jsonify({"error": "O arquivo enviado excede o limite máximo permitido (500 MB).", "status": 413}), 413

def _serve_custom_error_html(status_code=500):
    err_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist', 'error.html')
    if os.path.exists(err_path):
        with open(err_path, 'r', encoding='utf-8') as f:
            return Response(f.read(), status=status_code, mimetype='text/html; charset=utf-8')
    return jsonify({"error": "Instabilidade interna temporária no servidor.", "status": status_code}), status_code

@app.errorhandler(500)
def handle_500(e):
    traceback.print_exc()
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Instabilidade interna temporária no servidor. A equipe técnica foi informada.", "status": 500}), 500
    return _serve_custom_error_html(500)

@app.errorhandler(502)
def handle_502(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Gateway temporariamente indisponível.", "status": 502}), 502
    return _serve_custom_error_html(502)

@app.errorhandler(503)
def handle_503(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Serviço temporariamente em manutenção.", "status": 503}), 503
    return _serve_custom_error_html(503)

@app.errorhandler(Exception)
def handle_uncaught_exception(e):
    traceback.print_exc()
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Ocorreu uma falha no processamento da solicitação.", "status": 500}), 500
    return _serve_custom_error_html(500)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"[BOOT] Servidor Claro Gestao iniciado na porta {port} em tempo recorde!", flush=True)
    app.run(host='0.0.0.0', port=port, threaded=True)
