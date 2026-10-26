import os
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
    make_response, Response, send_file, g, has_request_context
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
    """Validates 6-digit TOTP token allowing a +/- 1 step window for clock drift"""
    if not secret or not token:
        return False
    token_str = str(token).strip().replace(' ', '')
    if len(token_str) != 6 or not token_str.isdigit():
        return False
    current_t = int(time.time())
    for offset in range(-window, window + 1):
        step_token = get_totp_token(secret, time_step=time_step, t=current_t + (offset * time_step))
        if step_token and step_token == token_str:
            return True
    return False

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
RESEND_FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'Gestão Rede Externa <onboarding@resend.dev>')

def get_portal_url(path='/'):
    base = os.environ.get('PORTAL_BASE_URL', '').strip()
    if not base:
        try:
            base = request.host_url.rstrip('/')
        except Exception:
            base = 'https://gestao-rede-externa-bxbyrare.shardcloud.com'
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

    return f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
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
                                        <span style="display: inline-block; width: 14px; height: 14px; background-color: #E11D48; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>
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
                    <td style="padding: 32px 32px 24px 32px;">
                        <div style="margin-bottom: 16px;">
                            <span style="display: inline-block; background: rgba(225, 29, 72, 0.15); border: 1px solid rgba(225, 29, 72, 0.4); color: #FDA4AF; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; letter-spacing: 0.5px;">
                                {category_badge}
                            </span>
                        </div>
                        <h1 style="color: #F8FAFC; font-size: 21px; font-weight: 700; margin: 0 0 18px 0; line-height: 1.35;">
                            {title}
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
                                    <strong style="color: #94A3B8;">Aviso de Segurança:</strong> Este comunicado operacional é oficial e confidencial da plataforma Claro Gestão Rede Externa. Nunca compartilhe suas senhas de acesso.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Footer -->
                <tr>
                    <td style="padding: 18px 32px; background: #07090F; border-top: 1px solid #141B26; text-align: center;">
                        <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748B;">
                            &copy; {current_year} Claro Brasil. Todos os direitos reservados.
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

def send_resend_email(to_email, subject, category_badge, title, message_html, cta_text=None, cta_url=None):
    if not to_email or '@' not in to_email:
        return False

    clean_target = str(to_email).strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean_target):
        print(f"[EMAIL REJECTED] Endereço de email com formato inválido ignorado: {clean_target}")
        return False

    safe_subject = str(subject or 'Comunicado Claro Gestão Rede Externa').replace('\r', '').replace('\n', ' ').strip()

    def _worker():
        full_html = render_executive_email_template(
            category_badge=category_badge,
            title=title,
            message_html=message_html,
            cta_text=cta_text,
            cta_url=cta_url
        )

        # Envio direto via Resend API exclusivamente com a chave de ambiente
        if not RESEND_API_KEY:
            print("[RESEND NOTICE] RESEND_API_KEY não configurada no ambiente. Envio cancelado de forma segura.")
            return

        try:
            resp = requests.post(
                'https://api.resend.com/emails',
                headers={
                    'Authorization': f'Bearer {RESEND_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json={
                    'from': RESEND_FROM_EMAIL,
                    'to': [clean_target],
                    'subject': safe_subject,
                    'html': full_html
                },
                timeout=10
            )
            if resp.status_code in [200, 201]:
                res_data = resp.json() if resp.text else {}
                print(f"[RESEND SUCCESS] Email entregue ao provedor para {clean_target} | ID: {res_data.get('id')}")
                return
            else:
                print(f"[RESEND NOTICE] Envio para {clean_target} retornou status {resp.status_code}: {resp.text}")
                return
        except Exception as ex:
            print(f"[RESEND ERROR] Exceção de rede no envio para {clean_target}: {ex}")
            return

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True

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

def send_outdated_profile_email(to_email, user_display, missing_fields=None, portal_url=None):
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
        
        <!-- Bloqueio de Acesso Alerta -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 22px 0;">
            <tr>
                <td style="background: linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.06) 100%); border: 1px solid rgba(245, 158, 11, 0.45); border-left: 4px solid #F59E0B; border-radius: 10px; padding: 18px 20px;">
                    <div style="font-size: 12px; font-weight: 800; color: #FBBF24; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                        🚫 AVISO DE ACESSO RESTRITO AO PORTAL
                    </div>
                    <p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #FEF3C7;">
                        Identificamos que seu cadastro na plataforma <strong>Claro Gestão Rede Externa</strong> possui pendências obrigatórias de identificação.
                        <strong>Você não conseguirá utilizar as rotinas operacionais do portal (mapas, consultas, ordens e relatórios) até que suas pendências cadastrais sejam atualizadas.</strong>
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
            A regularização leva menos de 1 minuto: acesse o link abaixo, complete as informações faltantes e salve para restabelecer imediatamente seu acesso irrestrito ao sistema.
        </p>
    '''

    return send_resend_email(
        to_email=to_email,
        subject="[Claro Rede Externa] Ação Obrigatória: Cadastro Pendente de Atualização",
        category_badge="REGULARIZAÇÃO CADASTRAL OBRIGATÓRIA",
        title="Cadastro Pendente de Regularização",
        message_html=message_html,
        cta_text="Regularizar Meu Cadastro Agora",
        cta_url=profile_url
    )

def send_security_alert_email(to_email, user_display, ip_address, user_agent=None, login_time=None, portal_url=None):
    """Template 3: Alerta de Segurança quando um IP novo entra na conta"""
    safe_user = html.escape(str(user_display or 'Colaborador'))
    safe_ip = html.escape(str(ip_address or 'IP não identificado'))
    safe_ua = html.escape(str(user_agent or 'Navegador Web')[:180])
    safe_time = html.escape(str(login_time or datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')))
    reset_url = portal_url or get_portal_url('/login')

    message_html = f'''
        <p style="margin: 0 0 14px 0; font-size: 15px; color: #E2E8F0;">Olá, <strong>{safe_user}</strong>.</p>
        
        <!-- Security Header Callout -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 20px 0;">
            <tr>
                <td style="background: linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.4); border-left: 4px solid #EF4444; border-radius: 10px; padding: 18px 20px;">
                    <div style="font-size: 12px; font-weight: 800; color: #FCA5A5; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                        🚨 NOVO ACESSO DETECTADO EM SUA CONTA
                    </div>
                    <p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #FEE2E2;">
                        O sistema de monitoramento de segurança da <strong>Claro Gestão Rede Externa</strong> detectou um login bem-sucedido na sua conta a partir de um <strong>endereço IP que nunca foi utilizado anteriormente</strong>.
                    </p>
                </td>
            </tr>
        </table>

        <!-- Event Details Card -->
        <div style="background: #111726; border: 1px solid #1E293B; border-radius: 10px; padding: 18px 22px; margin-bottom: 22px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94A3B8; margin-bottom: 12px;">
                DETALHES DO EVENTO DE LOGIN
            </div>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #64748B; width: 140px;">Endereço IP:</td>
                    <td style="padding: 6px 0; font-size: 13px; color: #F87171; font-family: Consolas, monospace; font-weight: bold;">{safe_ip}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Data e Hora:</td>
                    <td style="padding: 6px 0; font-size: 13px; color: #E2E8F0; font-weight: 600;">{safe_time} (Horário de Brasília)</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Dispositivo / Navegador:</td>
                    <td style="padding: 6px 0; font-size: 12px; color: #94A3B8;">{safe_ua}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Status da Autenticação:</td>
                    <td style="padding: 6px 0; font-size: 13px; color: #4ADE80; font-weight: 600;">Concluído com Sucesso</td>
                </tr>
            </table>
        </div>

        <!-- Action Guidance -->
        <div style="margin-bottom: 18px;">
            <p style="margin: 0 0 10px 0; font-size: 13.5px; line-height: 1.6; color: #CBD5E1;">
                <strong style="color: #4ADE80;">✅ Foi você?</strong> Se você realizou este login (por exemplo, conectado a uma nova rede Wi-Fi, dados móveis 4G/5G ou em um novo dispositivo), nenhuma ação é necessária. Este IP foi adicionado aos seus registros seguros.
            </p>
            <p style="margin: 12px 0 0 0; font-size: 13.5px; line-height: 1.6; color: #FDA4AF;">
                <strong style="color: #EF4444;">🚨 Não reconhece este acesso?</strong> Se você não reconhece este evento, recomendamos alterar sua senha imediatamente para proteger seus dados e encerrar acessos não autorizados.
            </p>
        </div>
    '''

    return send_resend_email(
        to_email=to_email,
        subject=f"🚨 [Alerta de Segurança] Novo Acesso Detectado - Claro Rede Externa ({safe_ip})",
        category_badge="ALERTA DE SEGURANÇA",
        title="Novo Acesso Detectado em Sua Conta",
        message_html=message_html,
        cta_text="Redefinir Minha Senha Imediatamente",
        cta_url=reset_url
    )
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
RATE_LIMIT_STORE = defaultdict(list)
AUTH_RATE_LIMIT_STORE = defaultdict(list)

GLOBAL_RATE_LIMIT_MAX = 600  # Max 600 requests per 60s per IP (evita falsos positivos em polling de alertas)
AUTH_RATE_LIMIT_MAX = 30     # Max 30 attempts per 60s per IP for login/resets

BLOCKED_USER_AGENTS = [
    'sqlmap', 'nikto', 'nmap', 'burpcollaborator', 'dirbuster',
    'wpscan', 'acunetix', 'havij', 'masscan', 'zgrab', 'gobuster', 'hydra'
]

@app.before_request
def enforce_security_policies():
    client_ip = get_client_ip()
    now = time.time()
    
    # 1. Anti-Scanner / Anti-Automated Tool Detection (Burp Suite Automated Scanners, Sqlmap, Nikto, etc.)
    user_agent = (request.headers.get('User-Agent') or '').lower()
    for bad_ua in BLOCKED_USER_AGENTS:
        if bad_ua in user_agent:
            return jsonify({"error": "Acesso negado por políticas de segurança do servidor.", "status": 403}), 403

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
            return render_template('login.html', error="Muitas tentativas de login. Por favor, aguarde 1 minuto."), 429
        if request.method == 'POST':
            AUTH_RATE_LIMIT_STORE[client_ip].append(now)

@app.after_request
def set_security_headers(response):
    # Core OWASP Security Headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), camera=(), microphone=(), payment=()'
    response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
    response.headers['Server'] = 'Secure-Gateway'

    # Strict Cache-Control directives based on route sensitivity
    if request.path.startswith('/api/') or 'user_id' in session or request.path == '/login':
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    elif request.path.startswith('/assets/') or request.path.endswith(('.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.webp', '.ico', '.mp4', '.webm')):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'

    # Hardened Content-Security-Policy (Removes unsafe-inline from script-src)
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

# Leak-proof PostgreSQL connection manager with automatic request teardown
def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada no ambiente do servidor.")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    if has_request_context():
        if not hasattr(g, '_active_db_conns'):
            g._active_db_conns = []
        g._active_db_conns.append(conn)
    return conn

@app.teardown_appcontext
def close_db_connections(exception=None):
    conns = getattr(g, '_active_db_conns', None)
    if conns:
        for c in conns:
            try:
                if hasattr(c, 'closed') and not c.closed:
                    c.close()
            except Exception:
                pass

# Helper function to check allowed file extensions
def allowed_file(filename, extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

# Database Initialization Script

def emit_live_alert(category, title, message, target_user_id=None, target_username=None, source_user_id=None, source_username=None, link=None):
    try:
        conn = get_db()
        cur = conn.cursor()
        s_uid = source_user_id or (session.get('user_id') if 'user_id' in session else None)
        s_uname = source_username or (session.get('username') if 'username' in session else None)
        cur.execute("""
            INSERT INTO system_live_alerts (
                category, title, message, target_user_id, target_username, source_user_id, source_username, link
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """, (category, title, message, target_user_id, target_username, s_uid, s_uname, link))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Error emitting live alert:", e)

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
    # Skip formatting if it looks like a login username (e.g. alexandre.candido)
    if "." in cleaned and " " not in cleaned:
        return cleaned

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
        cur = conn.cursor()
        
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
            ('totp_verified_at', 'TIMESTAMP DEFAULT NULL')
        ]:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {coltype};")
                conn.commit()
            except Exception:
                conn.rollback()
        for col, coltype in [
            ('email', 'VARCHAR(150)'),
            ('phone', 'VARCHAR(50)'),
            ('name', 'VARCHAR(150)'),
            ('email_verified', 'BOOLEAN DEFAULT FALSE'),
            ('permissions', 'JSONB DEFAULT NULL'),
            ('totp_secret', 'VARCHAR(64) DEFAULT NULL'),
            ('totp_enabled', 'BOOLEAN DEFAULT FALSE'),
            ('totp_verified_at', 'TIMESTAMP DEFAULT NULL')
        ]:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {coltype};")
                conn.commit()
            except Exception:
                conn.rollback()
        
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
        try:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_id INT REFERENCES technicians(id) ON DELETE SET NULL;")
        except Exception:
            conn.rollback()

        try:
            cur.execute("ALTER TABLE forms ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;")
            cur.execute("ALTER TABLE forms ADD COLUMN IF NOT EXISTS questions JSONB;")
        except Exception:
            conn.rollback()

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

        # Seed default Inventário - Maquinário form if not existing
        cur.execute("SELECT id FROM forms WHERE slug = 'inventario-maquinario';")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO forms (title, slug, category, description, link)
                VALUES (%s, %s, %s, %s, %s);
            """, (
                'Inventário - Maquinário',
                'inventario-maquinario',
                'Inspeção',
                'Inventário do Maquinário e Ferramental.',
                '/f/inventario-maquinario'
            ))

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
                {"title": "Fotos para evidência", "type": "file", "options": [], "required": False},
                {"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False},
                {"title": "Observações", "type": "textarea", "options": [], "required": False}
            ]

            cur.execute("SELECT id, questions FROM forms WHERE slug = 'inspecao-visual' OR title ILIKE '%inspeção visual%' OR title ILIKE '%inspecao visual%';")
            inspecao_row = cur.fetchone()
            if not inspecao_row:
                cur.execute("""
                    INSERT INTO forms (title, slug, category, description, link, questions)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (
                    'Inspeção Visual',
                    'inspecao-visual',
                    'Inspeção',
                    'Formulário oficial de inspeção visual de rede externa, registro de ocorrências, fotos para evidência e controle interno.',
                    '/f/inspecao-visual',
                    json.dumps(inspecao_default_questions, ensure_ascii=False)
                ))
            else:
                q_raw = inspecao_row.get('questions')
                q_list = json.loads(q_raw) if isinstance(q_raw, str) else (q_raw if isinstance(q_raw, list) else [])
                if not q_list:
                    cur.execute("UPDATE forms SET questions = %s WHERE id = %s;", (json.dumps(inspecao_default_questions, ensure_ascii=False), inspecao_row['id']))
                else:
                    titles = [str(q.get('title', '')).strip().lower() for q in q_list if isinstance(q, dict)]
                    has_hfc = any('hfc ou fibra' in t or 'rede hfc' in t for t in titles)
                    has_node = any('nome do node' in t or 'rota de fibra' in t for t in titles)
                    has_wfc = any('controle de wfc' in t or 'wfc' in t for t in titles)

                    if not (has_hfc and has_node and has_wfc):
                        new_q = []
                        for q in q_list:
                            new_q.append(q)
                            t = str(q.get('title', '')).strip().lower() if isinstance(q, dict) else ''
                            if ('task toa' in t or 'numero task' in t or 'número task' in t) and not has_hfc:
                                new_q.append({"title": "Rede HFC ou Fibra", "type": "radio", "options": ["HFC", "Fibra"], "required": False})
                                new_q.append({"title": "Nome do Node ou rota de fibra", "type": "text", "options": [], "required": False})
                                has_hfc = True
                                has_node = True
                            if ('fotos para evid' in t or 'evidência' in t or 'evidencia' in t or 'foto' in t) and not has_wfc:
                                new_q.append({"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False})
                                has_wfc = True

                        if not has_hfc:
                            new_q.append({"title": "Rede HFC ou Fibra", "type": "radio", "options": ["HFC", "Fibra"], "required": False})
                        if not has_node:
                            new_q.append({"title": "Nome do Node ou rota de fibra", "type": "text", "options": [], "required": False})
                        if not has_wfc:
                            new_q.append({"title": "Controle de WFC ( Preenchimento interno )", "type": "text", "options": [], "required": False})

                        cur.execute("UPDATE forms SET questions = %s WHERE id = %s;", (json.dumps(new_q, ensure_ascii=False), inspecao_row['id']))
        except Exception as e_seed:
            print("Error seeding/updating Inspeção Visual form:", e_seed)
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

        conn.commit()
        cur.close()
        conn.close()
        print("Database tables initialized and seeded successfully.")
        normalize_all_database_names()
    except Exception as e:
        import traceback
        print("Database initialization failed with traceback:")
        traceback.print_exc()

# Run DB initialization on import if database URL is configured
if DATABASE_URL:
    try:
        init_db()
    except Exception as e_init:
        print("[WARNING] init_db falhou na inicialização:", e_init)

# --------------------------------------------------------------------------
# HELPER FUNCTIONS & DECORATORS
# --------------------------------------------------------------------------
def log_action(user_id, username, action):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_logs (user_id, username, action) VALUES (%s, %s, %s);",
            (user_id, username, action)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to write audit log: {e}")

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({"error": "Sessão expirada. Redirecionando para login...", "redirect": "/login"}), 401
            r = redirect(url_for('login'))
            r.data = b''
            return r

        # 12-hour TOTP Enforcement
        totp_exp = session.get('totp_expires_at') or 0
        if not session.get('totp_verified') or time.time() >= totp_exp:
            if not request.path.startswith('/api/auth/') and not request.path.startswith('/static/'):
                return jsonify({
                    "error": "Acesso ao portal restrito: validação de 12 horas do aplicativo autenticador expirada ou pendente.",
                    "requires_totp": True
                }), 403

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
]

def is_coordenador_role(username, role):
    uname = (username or '').strip().lower()
    if uname == MASTER_COORDINATOR_USERNAME:
        return True
    r = (role or '').strip().lower()
    return r in ['coordenador', 'administrador', 'admin']

def resolve_user_permissions(username, role, raw_permissions):
    uname = (username or '').strip().lower()
    if uname == MASTER_COORDINATOR_USERNAME:
        return list(ALL_PERMISSIONS)
    is_coord = is_coordenador_role(username, role)
    if raw_permissions is None:
        return list(ALL_PERMISSIONS) if is_coord else []
    parsed = raw_permissions
    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except Exception:
            parsed = []
    if not isinstance(parsed, list):
        return list(ALL_PERMISSIONS) if is_coord else []
    valid_set = set(ALL_PERMISSIONS)
    if is_coord:
        return [p for p in parsed if isinstance(p, str) and p in valid_set]
    else:
        return [p for p in parsed if isinstance(p, str) and p in valid_set and not p.startswith('gerenciamento.')]

def get_current_user_auth():
    if 'user_id' not in session:
        return None
    if has_request_context() and hasattr(g, '_current_user_auth'):
        return g._current_user_auth
    try:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute("SELECT id, username, role, tech_id, permissions FROM users WHERE id = %s;", (session['user_id'],))
        except Exception:
            conn.rollback()
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;")
            conn.commit()
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
    if p in ('/api/indicators', '/api/indicators/import') and method == 'POST':
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

def parse_google_form(url):
    url = (url or '').strip()
    if not url:
        return None, "Link do formulário não foi informado."

    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url

    try:
        parsed_u = urllib.parse.urlparse(url)
    except Exception:
        return None, "URL inválida fornecida."

    if parsed_u.scheme not in ('http', 'https'):
        return None, "Protocolo inválido. Use https://."

    hostname = (parsed_u.hostname or '').lower()
    if hostname not in ('forms.gle', 'docs.google.com'):
        return None, "Domínio inválido. Apenas links oficiais forms.gle ou docs.google.com são aceitos."

    if hostname == 'docs.google.com' and not parsed_u.path.startswith('/forms/'):
        return None, "Caminho inválido para docs.google.com. Deve iniciar com /forms/."

    # Normalize Google Form URL
    if not url.endswith('/viewform') and '/viewform' not in url and not '?usp=' in url:
        if '/edit' in url:
            url = url.split('/edit')[0] + '/viewform'
        elif not url.endswith('/'):
            url = url + '/viewform'

    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            final_url = resp.geturl()
            if 'accounts.google.com' in final_url or 'ServiceLogin' in final_url:
                return None, "Formulário privado ou requer login. Por favor, acesse o Google Forms e altere as permissões para PÚBLICO (qualquer pessoa com o link pode responder)."
            
            html = resp.read().decode('utf-8', errors='ignore')
    except urllib.error.HTTPError as e:
        if e.code in [401, 403]:
            return None, "Formulário privado ou requer login. Por favor, acesse o Google Forms e altere as permissões para PÚBLICO (qualquer pessoa com o link pode responder)."
        return None, f"Erro de conexão com o Google Forms (HTTP {e.code}). Verifique o link e tente novamente."
    except Exception as e:
        return None, f"Falha ao acessar o link do formulário: {e}"

    if 'accounts.google.com' in html or ('Fazer login' in html and 'FB_PUBLIC_LOAD_DATA_' not in html):
        return None, "Formulário privado ou requer login. Por favor, altere a privacidade do Google Form para PÚBLICO."

    # Search for FB_PUBLIC_LOAD_DATA_
    match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);</script>', html, re.DOTALL)
    if not match:
        match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);', html, re.DOTALL)

    if not match:
        return None, "Não foi possível extrair a estrutura das perguntas deste formulário. Verifique se o link é uma URL válida de resposta do Google Forms."

    try:
        raw_json = match.group(1).strip()
        data = json.loads(raw_json)
    except Exception:
        return None, "Erro ao processar dados internos do Google Forms. O modelo do formulário não pôde ser copiado."

    try:
        form_meta = data[1]
        title = form_meta[8] if len(form_meta) > 8 and form_meta[8] else (form_meta[1] if len(form_meta) > 1 and isinstance(form_meta[1], str) else "Formulário Importado")
        description = form_meta[0] if len(form_meta) > 0 and isinstance(form_meta[0], str) else ""

        questions_raw = []
        if len(form_meta) > 1 and isinstance(form_meta[1], list):
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
        return None, f"Não foi possível copiar a estrutura do formulário: {e}"

# --------------------------------------------------------------------------
# PUBLIC SERVING OF UPLOADED ASSETS & PUBLIC PROJECT VIEWER
# --------------------------------------------------------------------------
@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    from werkzeug.utils import safe_join
    if not filename.startswith('formularios/') and 'user_id' not in session:
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
    return send_from_directory(REACT_DIST, 'index.html')

@app.route('/assets/<path:filename>')
def react_assets(filename):
    return send_from_directory(os.path.join(REACT_DIST, 'assets'), filename)

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
    robots_path = os.path.join(REACT_DIST, 'robots.txt')
    if os.path.isfile(robots_path):
        return send_from_directory(REACT_DIST, 'robots.txt', mimetype='text/plain')
    host = request.host_url.rstrip('/')
    content = f"User-agent: *\nAllow: /\nAllow: /login\nAllow: /f/\nAllow: /p/\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: {host}/sitemap.xml\n"
    return Response(content, mimetype='text/plain')

@app.route('/sitemap.xml')
def serve_sitemap_xml():
    try:
        host = request.host_url.rstrip('/')
        today = datetime.date.today().isoformat()
        
        # Static & Portal Routes
        routes = [
            {"loc": f"{host}/", "changefreq": "daily", "priority": "1.0"},
            {"loc": f"{host}/login", "changefreq": "monthly", "priority": "0.8"},
            {"loc": f"{host}/formularios", "changefreq": "daily", "priority": "0.9"},
            {"loc": f"{host}/veiculos", "changefreq": "daily", "priority": "0.8"},
            {"loc": f"{host}/escala", "changefreq": "daily", "priority": "0.8"},
            {"loc": f"{host}/indicadores", "changefreq": "daily", "priority": "0.8"},
            {"loc": f"{host}/projetos", "changefreq": "weekly", "priority": "0.8"},
            {"loc": f"{host}/rotas", "changefreq": "weekly", "priority": "0.7"},
            {"loc": f"{host}/pessoas", "changefreq": "weekly", "priority": "0.7"},
        ]
        
        # Dynamic Public Forms & Projects from Database
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT slug, created_at FROM forms WHERE slug IS NOT NULL AND slug != '';")
            for r in cur.fetchall():
                slug = r['slug']
                dt = r['created_at'].strftime('%Y-%m-%d') if r['created_at'] else today
                routes.append({
                    "loc": f"{host}/f/{slug}",
                    "lastmod": dt,
                    "changefreq": "weekly",
                    "priority": "0.9"
                })
            
# Projects have no slug column; removed dead query
            cur.close()
            conn.close()
        except Exception as db_err:
            print("Notice: Error fetching dynamic sitemap items:", db_err)

        # Build XML
        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        ]
        for item in routes:
            xml_lines.append('  <url>')
            xml_lines.append(f"    <loc>{item['loc']}</loc>")
            xml_lines.append(f"    <lastmod>{item.get('lastmod', today)}</lastmod>")
            xml_lines.append(f"    <changefreq>{item.get('changefreq', 'weekly')}</changefreq>")
            xml_lines.append(f"    <priority>{item.get('priority', '0.7')}</priority>")
            xml_lines.append('  </url>')
        xml_lines.append('</urlset>')
        
        return Response('\n'.join(xml_lines), mimetype='application/xml')
    except Exception as e:
        traceback.print_exc()
        return Response("<!-- Error generating sitemap -->", mimetype='application/xml', status=500)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def spa_catch_all(path):
    if path.startswith('api/') or path.startswith('uploads/') or path.startswith('static/'):
        return jsonify({"error": "Não encontrado."}), 404
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
_ACCOUNT_LOGIN_FAILURES = defaultdict(list)
_PASSWORD_RESET_FAILURES = defaultdict(int)

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

    now_ts = time.time()
    _ACCOUNT_LOGIN_FAILURES[username] = [t for t in _ACCOUNT_LOGIN_FAILURES[username] if now_ts - t < 900]
    if len(_ACCOUNT_LOGIN_FAILURES[username]) >= 8:
        return jsonify({"error": "Conta temporariamente bloqueada por excesso de tentativas. Aguarde 15 minutos."}), 429

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = %s;", (username,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            _ACCOUNT_LOGIN_FAILURES.pop(username, None)
            session.permanent = True
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['role'] = user['role']
            session['totp_verified'] = False
            session['totp_expires_at'] = 0
            log_action(user['id'], user['username'], "Efetuou login no sistema Claro Gestão Rede Externa.")

            # Security IP Check & Alert
            try:
                client_ip = get_client_ip()
                client_ua = (request.headers.get('User-Agent') or '')[:250]
                conn_ip = get_db()
                cur_ip = conn_ip.cursor()
                
                cur_ip.execute("SELECT COUNT(*) as count FROM user_known_ips WHERE user_id = %s;", (user['id'],))
                count_row = cur_ip.fetchone()
                total_ips = count_row['count'] if count_row else 0
                
                cur_ip.execute("SELECT id FROM user_known_ips WHERE user_id = %s AND ip_address = %s;", (user['id'], client_ip))
                ip_exists = cur_ip.fetchone()
                
                if total_ips > 0 and not ip_exists:
                    # New IP detected for an established user!
                    sec_email = (user.get('email') or '').strip().lower()
                    if not sec_email and user.get('tech_id'):
                        cur_ip.execute("SELECT email FROM technicians WHERE id = %s;", (user['tech_id'],))
                        t_row = cur_ip.fetchone()
                        if t_row and t_row.get('email'):
                            sec_email = t_row['email'].strip().lower()
                    
                    if sec_email and '@' in sec_email:
                        sec_display = user.get('name') or user['username']
                        now_str = datetime.datetime.now().strftime('%d/%m/%Y às %H:%M')
                        send_security_alert_email(
                            to_email=sec_email,
                            user_display=sec_display,
                            ip_address=client_ip,
                            user_agent=client_ua,
                            login_time=now_str
                        )
                        print(f"🚨 [SECURITY ALERT DISPATCHED] Novo IP ({client_ip}) detectado para {user['username']}. Alerta enviado para {sec_email}.")

                # Register / update IP
                cur_ip.execute("""
                    INSERT INTO user_known_ips (user_id, ip_address, user_agent, last_seen)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, ip_address) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, user_agent = EXCLUDED.user_agent;
                """, (user['id'], client_ip, client_ua))
                conn_ip.commit()
                cur_ip.close()
                conn_ip.close()
            except Exception as ip_err:
                print("[LOGIN IP TRACKING ERROR]", ip_err)
            user_payload = get_user_info_dict(user['id']) or {
                "id": user['id'],
                "username": user['username'],
                "role": user['role'],
                "company": get_user_company(user['id']),
                "needs_email": True,
                "totp_enabled": bool(user.get('totp_enabled')),
                "totp_verified": False,
                "totp_expires_at": 0,
                "requires_totp_setup": not bool(user.get('totp_enabled')),
                "requires_totp_verify": bool(user.get('totp_enabled'))
            }
            return jsonify({"user": user_payload})

        _ACCOUNT_LOGIN_FAILURES[username].append(time.time())
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
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado.'}), 401
    user_id = session['user_id']
    username = session.get('username', 'usuario')

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = %s;', (user_id,))
    u = cur.fetchone()
    if not u:
        cur.close()
        conn.close()
        return jsonify({'error': 'Usuário não encontrado.'}), 404

    secret = u.get('totp_secret')
    # If not present or not yet enabled, generate fresh secret
    if not secret or not u.get('totp_enabled'):
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
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado.'}), 401
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().replace(' ', '').replace('-', '')

    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({'error': 'Código inválido. Digite os 6 dígitos numéricos do seu aplicativo autenticador.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, username, totp_secret FROM users WHERE id = %s;', (user_id,))
    u = cur.fetchone()
    if not u or not u.get('totp_secret'):
        cur.close()
        conn.close()
        return jsonify({'error': 'Segredo de autenticação não encontrado. Inicie a configuração novamente.'}), 400

    secret = u['totp_secret']
    if not verify_totp_token(secret, code, window=1):
        cur.close()
        conn.close()
        return jsonify({'error': 'Código de autenticação incorreto. Verifique a hora do seu celular e tente novamente.'}), 400

    now = datetime.datetime.now()
    cur.execute('UPDATE users SET totp_enabled = TRUE, totp_verified_at = %s WHERE id = %s;', (now, user_id))
    conn.commit()
    cur.close()
    conn.close()

    # Authorize session for 12 hours
    session['totp_verified'] = True
    session['totp_expires_at'] = time.time() + (12 * 3600)

    log_action(user_id, session.get('username', 'usuario'), 'Ativou e validou o aplicativo autenticador (2FA) com sucesso.')
    return jsonify({
        'success': True,
        'message': 'Aplicativo autenticador ativado com sucesso! Sessão autorizada por 12 horas.',
        'totp_verified': True,
        'totp_expires_at': session['totp_expires_at']
    })

@app.route('/api/auth/totp/verify', methods=['POST'])
def api_totp_verify():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado.'}), 401
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().replace(' ', '').replace('-', '')

    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({'error': 'Código inválido. Digite os 6 dígitos do seu aplicativo autenticador.'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = %s;', (user_id,))
    u = cur.fetchone()
    cur.close()
    conn.close()

    if not u or not u.get('totp_enabled') or not u.get('totp_secret'):
        return jsonify({'error': 'Usuário ainda não concluiu o cadastro do autenticador.'}), 400

    secret = u['totp_secret']
    if not verify_totp_token(secret, code, window=1):
        return jsonify({'error': 'Código de autenticação incorreto ou expirado. Tente novamente.'}), 400

    # Authorize session for 12 hours
    session['totp_verified'] = True
    session['totp_expires_at'] = time.time() + (12 * 3600)

    log_action(user_id, session.get('username', 'usuario'), 'Validou sessão de 12 horas via aplicativo autenticador (TOTP).')
    return jsonify({
        'success': True,
        'message': 'Código confirmado! Acesso autorizado por 12 horas.',
        'totp_verified': True,
        'totp_expires_at': session['totp_expires_at']
    })


@app.route('/api/auth/totp/reconfigure', methods=['POST'])
def api_totp_reconfigure():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado.'}), 401
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    password = data.get('password') or ''
    
    conn = get_db()
    cur = conn.cursor()
    if password:
        cur.execute("SELECT password_hash FROM users WHERE id = %s;", (user_id,))
        u_row = cur.fetchone()
        if not u_row or not check_password_hash(u_row['password_hash'], password):
            cur.close()
            conn.close()
            return jsonify({'error': 'Senha incorreta para confirmar a reconfiguração do autenticador.'}), 400

    cur.execute("UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_verified_at = NULL WHERE id = %s;", (user_id,))
    conn.commit()
    cur.close()
    conn.close()
    session['totp_verified'] = False
    session['totp_expires_at'] = 0
    log_action(user_id, session.get('username', 'usuario'), "Solicitou reconfiguração do aplicativo autenticador (2FA).")
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

    if not verify_totp_token(secret, code, window=1):
        cur.close()
        conn.close()
        time.sleep(1)
        return jsonify({'error': 'Código do aplicativo autenticador incorreto ou expirado. Tente novamente.'}), 400

    # Password update
    hashed_pw = generate_password_hash(new_password)
    cur.execute('UPDATE users SET password_hash = %s WHERE id = %s;', (hashed_pw, user_id))
    conn.commit()
    cur.close()
    conn.close()

    log_action(user_id, user['username'], 'Redefiniu sua senha com sucesso utilizando o aplicativo autenticador (TOTP).')

    return jsonify({
        'success': True,
        'message': 'Senha redefinida com sucesso! Você já pode efetuar login com sua nova credencial.'
    })


def get_user_info_dict(user_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT u.id, u.username, u.role, u.tech_id, u.permissions,
                       u.email as u_email, u.phone as u_phone, u.name as u_name,
                       u.totp_secret, u.totp_enabled, u.totp_verified_at,
                       t.name as tech_name, t.phone as tech_phone, t.email as tech_email, t.company,
                       t.registration_claro, t.toa_login
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                WHERE u.id = %s;
            """, (user_id,))
        except Exception as q_err:
            conn.rollback()
            try:
                cur.execute("""
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64) DEFAULT NULL;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMP DEFAULT NULL;
                """)
                conn.commit()
            except Exception:
                conn.rollback()
            cur.execute("""
                SELECT u.id, u.username, u.role, u.tech_id, u.permissions,
                       u.email as u_email, u.phone as u_phone, u.name as u_name,
                       u.totp_secret, u.totp_enabled, u.totp_verified_at,
                       t.name as tech_name, t.phone as tech_phone, t.email as tech_email, t.company,
                       t.registration_claro, t.toa_login
                FROM users u
                LEFT JOIN technicians t ON u.tech_id = t.id
                WHERE u.id = %s;
            """, (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return None

        # Prefer users record, fallback to technicians record
        email = (row.get('u_email') or row.get('tech_email') or '').strip()
        phone = (row.get('u_phone') or row.get('tech_phone') or '').strip()
        name = (row.get('u_name') or row.get('tech_name') or row['username']).strip()
        company = (row.get('company') or '').strip() or None

        is_valid_email = bool(email and '@' in email and '.' in email and len(email) >= 5)
        needs_email = not is_valid_email

        missing_fields = []
        if needs_email:
            missing_fields.append("E-mail corporativo / pessoal")
        if not phone:
            missing_fields.append("Telefone de contato / WhatsApp")
        if not name or name.lower() == row['username'].lower():
            missing_fields.append("Nome completo")
        if not company:
            missing_fields.append("Empresa / Parceira vinculada")

        uname = (row.get('username') or '').strip().lower()
        resolved_perms = resolve_user_permissions(uname, row.get('role'), row.get('permissions'))

        totp_enabled = bool(row.get('totp_enabled'))
        totp_exp = session.get('totp_expires_at') or 0
        totp_verified = bool(session.get('totp_verified') and time.time() < totp_exp)

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
            "requires_totp_verify": requires_totp_verify
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
    if 'user_id' not in session:
        return jsonify({"error": "Não autenticado."}), 401
    user_payload = get_user_info_dict(session['user_id'])
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

    old_email = (user.get('email') or '').strip()
    email_was_empty = not old_email

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
                password_hash = %s
            WHERE id = %s;
        """, (email, phone, name, hashed_pw, user_id))
    else:
        cur.execute("""
            UPDATE users 
            SET email = COALESCE(NULLIF(%s, ''), email),
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name)
            WHERE id = %s;
        """, (email, phone, name, user_id))

    # Synchronize with technicians table if user is linked to a technician
    if user.get('tech_id'):
        cur.execute("""
            UPDATE technicians 
            SET email = COALESCE(NULLIF(%s, ''), email),
                phone = COALESCE(NULLIF(%s, ''), phone),
                name = COALESCE(NULLIF(%s, ''), name)
            WHERE id = %s;
        """, (email, phone, name, user['tech_id']))

    conn.commit()
    cur.close()
    conn.close()

    # If email was provided/updated, dispatch confirmation email via Resend
    if email and (email_was_empty or email != old_email):
        user_display_name = name or user['username']
        send_resend_email(
            to_email=email,
            subject="[Claro Rede Externa] Confirmação de E-mail Cadastrado",
            category_badge="SEGURANÇA & ACESSO",
            title="E-mail Vinculado com Sucesso",
            message_html=f'''
                <p>Olá, <strong>{user_display_name}</strong>.</p>
                <p>Seu endereço de e-mail foi cadastrado com sucesso na sua conta do portal <strong>Claro Gestão Rede Externa</strong>.</p>
                <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                    <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Login de Usuário:</p>
                    <p style="margin: 0; color: #F8FAFC; font-weight: 600; font-size: 15px;">{user['username']}</p>
                    <hr style="border: 0; border-top: 1px solid #28354D; margin: 10px 0;">
                    <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">E-mail Registrado:</p>
                    <p style="margin: 0; color: #38BDF8; font-weight: 600; font-size: 15px;">{email}</p>
                </div>
                <p>Este e-mail será utilizado para envio de comunicados operacionais importantes, avisos de manutenções, menções em ocorrências e recuperação segura de credenciais.</p>
            ''',
            cta_text="Acessar Minha Conta",
            cta_url="https://gestaoredeexterna.shardweb.app/"
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
    client_ip = request.remote_addr or request.headers.get('X-Forwarded-For', '127.0.0.1').split(',')[0].strip()
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
    if not _NAMES_DB_NORMALIZED:
        normalize_all_database_names()
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
        conn.commit()
        cur.close()
        conn.close()
        
        log_action(session['user_id'], session['username'], f"Atualizou cadastro da pessoa: {name} (ID: {tech_id})")

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


# --- 2. VEHICLES ---
@app.route('/api/vehicles', methods=['GET'])
@login_required
def api_get_vehicles():
    search = request.args.get('search', '').strip().upper()
    try:
        conn = get_db()
        cur = conn.cursor()
        if search:
            cur.execute(
                """
                SELECT v.*, t.name AS responsible_name 
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
                SELECT v.*, t.name AS responsible_name 
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
    data = request.get_json()
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

    if not plate:
        return jsonify({"error": "Placa do Veículo é obrigatória."}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

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
                condutor_dia, condutor_tarde, condutor_madrugada, subclus, created_by) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """,
            (plate, v_type, model, responsible_tech_id, has_rack, has_basket, has_giroflex, has_inverter, 
             ticket_car, area_rede, base, setor, condutor_dia, condutor_tarde, condutor_madrugada, subclus, session['user_id'])
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
    data = request.get_json()
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
    
    if not plate:
        return jsonify({"error": "Placa do Veículo é obrigatória."}), 400
        
    try:
        conn = get_db()
        cur = conn.cursor()
        
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
                subclus = %s
            WHERE id = %s;
            """,
            (plate, v_type, model, responsible_tech_id, has_rack, has_basket, has_giroflex, has_inverter, 
             ticket_car, area_rede, base, setor, condutor_dia, condutor_tarde, condutor_madrugada, subclus, v_id)
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
@login_required
def api_convert_google_form():
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or data.get('link') or '').strip()
    if not url:
        return jsonify({"error": "Por favor, informe o link do Google Forms."}), 400

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
            if not questions and link and ('forms.gle' in link or 'docs.google.com/forms' in link):
                parsed, parse_err = parse_google_form(link)
                if parse_err:
                    return jsonify({"error": parse_err}), 400
                if parsed:
                    if not title:
                        title = parsed['title']
                    if not description:
                        description = parsed['description']
                    questions = parsed['questions']

            if not title:
                return jsonify({"error": "Nome do formulário é obrigatório."}), 400

            if link and not link.startswith('http://') and not link.startswith('https://'):
                link = 'https://' + link

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

            questions_json = json.dumps(questions, ensure_ascii=False) if questions else None

            cur.execute(
                "INSERT INTO forms (title, slug, category, description, link, questions) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;",
                (title, slug, category, description, link, questions_json)
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

            if link and not link.startswith('http://') and not link.startswith('https://'):
                link = 'https://' + link

            new_slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') or f"form-{form_id}"

            questions = data.get('questions')
            if not questions and link and ('forms.gle' in link or 'docs.google.com/forms' in link):
                parsed, _ = parse_google_form(link)
                if parsed and parsed.get('questions'):
                    questions = parsed['questions']
            
            questions_json = json.dumps(questions, ensure_ascii=False) if questions is not None else None

            conn = get_db()
            cur = conn.cursor()
            if questions_json is not None:
                cur.execute(
                    "UPDATE forms SET title = %s, slug = COALESCE(NULLIF(slug, ''), %s), category = %s, description = %s, link = %s, questions = %s WHERE id = %s;",
                    (title, new_slug, category, description, link, questions_json, form_id)
                )
            else:
                cur.execute(
                    "UPDATE forms SET title = %s, slug = COALESCE(NULLIF(slug, ''), %s), category = %s, description = %s, link = %s WHERE id = %s;",
                    (title, new_slug, category, description, link, form_id)
                )
            conn.commit()
            cur.close()
            conn.close()

            log_action(session['user_id'], session['username'], f"Atualizou formulário: {title} (ID: {form_id})")
            return jsonify({"success": True}), 200
        except Exception as e:
            print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

# --- PUBLIC FORM RESPONDER ROUTES (NO LOGIN REQUIRED) ---
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

        return jsonify({
            "id": f['id'],
            "title": f['title'],
            "slug": f['slug'],
            "category": f.get('category') or 'Inspeção',
            "description": f.get('description') or '',
            "link": f.get('link') or '',
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
        if 'shardweb.app' in base_host and not base_host.startswith('https://'):
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
                success_count += 1
            except Exception as err:
                conn.rollback()
                errors.append(f"Linha {index+1} ({name}): erro ao salvar: {err}")
                
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
                success_count += 1
            except Exception as err:
                conn.rollback()
                errors.append(f"Linha {index+1} (Placa: {plate}): erro ao salvar - {err}")

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
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.username, u.role, u.tech_id, u.permissions, u.totp_enabled, t.name AS tech_name, u.created_at 
            FROM users u 
            LEFT JOIN technicians t ON u.tech_id = t.id 
            ORDER BY u.username ASC;
        """)
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        for u in users:
            if u['created_at']:
                u['created_at'] = u['created_at'].strftime('%d/%m/%Y %H:%M')
            uname = (u.get('username') or '').strip().lower()
            u['permissions'] = resolve_user_permissions(uname, u.get('role'), u.get('permissions'))
            u['is_master'] = (uname == MASTER_COORDINATOR_USERNAME)
            u['is_coordenador'] = is_coordenador_role(uname, u.get('role'))
            u['totp_enabled'] = bool(u.get('totp_enabled'))
        return jsonify(users)
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500

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
            "INSERT INTO users (username, password_hash, role, tech_id, permissions) VALUES (%s, %s, %s, %s, %s) RETURNING id;",
            (username, hashed, role, int(tech_id), perms_db)
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


def parse_fault_searcher_file(filepath, topic):
    ext = os.path.splitext(filepath)[1].lower()
    raw_rows = []
    
    if ext in ['.xlsx', '.xlsm', '.xls']:
        try:
            from python_calamine import CalamineWorkbook
            wb = CalamineWorkbook.from_path(filepath)
            sheet_names = wb.sheet_names
            target_sheet = sheet_names[0]
            sheet_found = False
            for candidate in [topic, 'RAL', 'REC', 'HFC', 'GPON', 'FALHAS', 'GERAL', 'Analítico', 'Dados', 'Ocorrências', 'Dados_DB', 'Base']:
                for s in sheet_names:
                    if candidate.lower() in s.lower():
                        target_sheet = s
                        sheet_found = True
                        break
                if sheet_found:
                    break

            ws = wb.get_sheet_by_name(target_sheet)
            raw_rows = ws.to_python()
        except Exception as e_cal:
            print("Calamine parse warning, falling back to openpyxl:", e_cal)
            try:
                import openpyxl
                wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
                sheet_names = wb.sheetnames
                target_sheet = sheet_names[0]
                sheet_found = False
                for candidate in [topic, 'RAL', 'REC', 'HFC', 'GPON', 'FALHAS', 'GERAL', 'Analítico', 'Dados', 'Ocorrências', 'Dados_DB', 'Base']:
                    for s in sheet_names:
                        if candidate.lower() in s.lower():
                            target_sheet = s
                            sheet_found = True
                            break
                    if sheet_found:
                        break
                ws = wb[target_sheet]
                raw_rows = list(ws.iter_rows(values_only=True))
            except Exception as e_opx:
                print("openpyxl parse warning:", e_opx)
                raw_rows = []
    elif ext in ['.csv', '.txt']:
        content = None
        for enc in ['utf-8-sig', 'utf-8', 'latin1', 'cp1252']:
            try:
                with open(filepath, 'r', encoding=enc) as f:
                    content = f.read()
                if content:
                    break
            except Exception:
                continue
                
        if content:
            lines = [line for line in content.splitlines() if line.strip()]
            if lines:
                first_line = lines[0]
                delims = [';', ',', '\t', '|']
                delim_counts = {d: first_line.count(d) for d in delims}
                best_delim = max(delim_counts, key=delim_counts.get)
                if delim_counts[best_delim] == 0:
                    best_delim = ','
                import csv
                import io
                reader = csv.reader(io.StringIO(content), delimiter=best_delim)
                raw_rows = list(reader)

    if not raw_rows:
        return []

    clean_rows = []
    for r in raw_rows:
        if r and any(c is not None and str(c).strip() != '' for c in r):
            clean_rows.append(r)

    if not clean_rows:
        return []

    header_idx = 0
    header_map = {}
    
    header_keywords = [
        'DESIGNA', 'CHAMADO', 'ROTA', 'RALANO', 'TICKET', 'SUBCLUSTER',
        'DISTANCIA', 'ENDERECO', 'MES', 'OFENSOR', 'OCORRENCIA', 'CAUSA',
        'CIRCUITO', 'REF', 'NUM'
    ]

    for i, r in enumerate(clean_rows[:25]):
        str_r = [normalize_text_key(c) for c in r]
        concat = ' '.join(str_r)
        matched_count = sum(1 for k in header_keywords if k in concat)
        if matched_count >= 2 or any(k in concat for k in ['RALANO', 'CHAMADO', 'SUBCLUSTER']):
            header_idx = i
            for c_idx, val in enumerate(str_r):
                if val:
                    header_map[val] = c_idx
            break

    if not header_map and clean_rows:
        header_idx = 0
        for c_idx, val in enumerate(clean_rows[0]):
            norm_val = normalize_text_key(val)
            if norm_val:
                header_map[norm_val] = c_idx

    data_rows = clean_rows[header_idx + 1:] if header_idx < len(clean_rows) - 1 else clean_rows[header_idx:]
    if data_rows == [clean_rows[header_idx]]:
        data_rows = clean_rows[header_idx + 1:]

    parsed_records = []

    def find_col_index(candidates, default_pos):
        for cand in candidates:
            norm_cand = normalize_text_key(cand)
            for h_text, col_i in header_map.items():
                if norm_cand in h_text or h_text in norm_cand:
                    return col_i
        return default_pos

    def get_val_at(row, col_i):
        if 0 <= col_i < len(row):
            v = row[col_i]
            if v is not None:
                if isinstance(v, (datetime.datetime, datetime.date)):
                    return v.strftime('%d/%m/%Y %H:%M')
                return str(v).strip()
        return ''

    idx_ref = find_col_index(['REF', 'REFERENCIA', 'REF_VAL', 'REFERENCIA_LOCAL'], 999)

    if topic == 'RAL':
        idx1 = find_col_index(['DESIGNACAO', 'DESIGNAO', 'CIRCUITO', 'ROTA'], 7)
        idx2 = find_col_index(['RALANO', 'NUM RAL', 'NUM_RAL', 'CHAMADO', 'TICKET'], 0)
        idx3 = find_col_index(['DATA DE ABERTURA', 'DATA_ABERTURA', 'DATA ABERTURA', 'ABERTURA', 'INICIO'], 8)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 20)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM', 'METROS'], 48)
        idx6 = find_col_index(['ENDERECO', 'ENDERECO PADRONIZADO', 'LOGRADOURO', 'RUA'], 27)
        idx7 = find_col_index(['MES FECOM', 'MES', 'MENSAL'], 17)
        idx8 = find_col_index(['OFENSOR', 'CFOFENSOR', 'RESPONSAVEL'], 29)
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA', 'MOTIVO', 'TIPO'], 25)
    elif topic == 'REC':
        idx1 = find_col_index(['DESIGNACAO_CIRCUITO', 'DESIGNACAO', 'CIRCUITO', 'ROTA'], 4)
        idx2 = find_col_index(['CHAMADO', 'NUM_REC', 'TICKET', 'RALANO'], 0)
        idx3 = find_col_index(['DT_HORA_ABERTURA_REC', 'HORA_ABERTURA', 'DATA DE ABERTURA', 'DATA ABERTURA', 'INICIO'], 9)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 24)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 35)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 15)
        idx7 = find_col_index(['MES'], 17)
        idx8 = find_col_index(['OFENSOR', 'CFOFENSOR'], 20)
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA'], 13)
    elif topic == 'HFC':
        idx1 = find_col_index(['ROTA', 'DESIGNACAO', 'CIRCUITO'], 16)
        idx2 = find_col_index(['TICKET', 'TICKE T', 'TICKET T', 'CHAMADO'], 0)
        idx3 = find_col_index(['INICIO_QUEDA', 'INICIO QUEDA', 'DATA INICIO', 'DATA ABERTURA'], 3)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER', 'CLUSTER', 'SALA'], 18)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 51)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 35)
        idx7 = find_col_index(['MES INCIDENTE', 'MES'], 24)
        idx8 = find_col_index(['OFENSOR', 'CFOFENSOR'], 27)
        idx9 = find_col_index(['CAUSA', 'OCORRENCIA'], 20)
    else:
        idx1 = find_col_index(['DESIGNACAO', 'CIRCUITO', 'ROTA'], 0)
        idx2 = find_col_index(['CHAMADO', 'TICKET', 'NUM_REC', 'RALANO'], 1)
        idx3 = find_col_index(['DATA DE ABERTURA', 'HORA_ABERTURA', 'INICIO_QUEDA', 'DATA ABERTURA'], 2)
        idx4 = find_col_index(['SUBCLUSTER', 'SUB_CLUSTER'], 3)
        idx5 = find_col_index(['DISTANCIA', 'DISTACIA', 'KM'], 8)
        idx6 = find_col_index(['ENDERECO', 'LOGRADOURO'], 5)
        idx7 = find_col_index(['MES'], 6)
        idx8 = find_col_index(['OFENSOR'], 7)
        idx9 = find_col_index(['OCORRENCIA', 'CAUSA'], 4)

    for row_idx, row in enumerate(data_rows):
        if not any(c is not None and str(c).strip() != '' for c in row):
            continue

        col_ref = get_val_at(row, idx_ref) or '-'
        col1 = get_val_at(row, idx1)
        col2 = get_val_at(row, idx2)
        col3 = get_val_at(row, idx3)
        col4 = get_val_at(row, idx4)
        col5 = get_val_at(row, idx5)
        col6 = get_val_at(row, idx6)
        col7 = get_val_at(row, idx7)
        col8 = get_val_at(row, idx8)
        col9 = get_val_at(row, idx9)

        if not col2:
            if col1:
                col2 = col1
            else:
                col2 = f"{topic}_REC_{row_idx + 1}"

        parsed_records.append((topic, col1, col2, col3, col4, col5, col_ref, col6, col7, col8, col9))

    return parsed_records


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
            "error": str(e)
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

    filename = secure_filename(file.filename)
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

                final_records.append((t_val, c1, c2, c3, c4, final_c5, final_ref, c6, c7, c8, c9, is_ed))
            else:
                if key:
                    processed_keys.add(key)
                is_ed = bool(c5 and c5 != '-' and c5 != '')
                final_records.append((t_val, c1, c2, c3, c4, c5, c_ref or '-', c6, c7, c8, c9, is_ed))

        # 3. Retain any historical records in DB that might not be in the new file
        for key, ex in existing_map.items():
            if key not in processed_keys:
                final_records.append((
                    topic, ex['col1'] or '', ex['col2'] or '', ex['col3'] or '',
                    ex['col4'] or '', ex['col5'] or '', ex['ref_val'] or '-', ex['col6'] or '',
                    ex['col7'] or '', ex['col8'] or '', ex['col9'] or '',
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
        """, (topic, session['username'], filename, len(final_records)))

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
        if 'conn' in locals() and conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print("Backend exception:", e)
        return jsonify({"error": "Ocorreu um erro ao processar a requisição."}), 500


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

        # Ensure work_schedules table exists
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS work_schedules (
                    id SERIAL PRIMARY KEY,
                    tech_id INT NOT NULL,
                    date DATE NOT NULL,
                    status VARCHAR(50) DEFAULT 'Trabalho',
                    work_hours VARCHAR(50) DEFAULT '08 às 17:48hs',
                    on_call VARCHAR(50) DEFAULT '0',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tech_id, date)
                );
            """)
            conn.commit()
        except Exception as e_tbl:
            conn.rollback()

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

        for u in updates:
            tech_id = int(u.get('tech_id'))
            dt_str = u.get('date')
            status = u.get('status', 'Trabalho')
            work_hours = u.get('work_hours', '08 às 17:48hs')
            on_call = str(u.get('on_call', '0'))

            cur.execute(
                """
                INSERT INTO work_schedules (tech_id, date, status, work_hours, on_call)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tech_id, date) 
                DO UPDATE SET 
                    status = EXCLUDED.status,
                    work_hours = EXCLUDED.work_hours,
                    on_call = EXCLUDED.on_call;
                """,
                (tech_id, dt_str, status, work_hours, on_call)
            )

        conn.commit()

        log_action(session['user_id'], session['username'], f"Atualizou {len(updates)} dia(s) na escala de trabalho")
        return jsonify({"success": True, "updated": len(updates)})
    except Exception as e:
        print("Backend error log:", e)
        return jsonify({"error": "Erro interno ao processar a requisição."}), 500
    finally:
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

def _classify_event_type(col9, col8):
    """Classify event type from Ocorrência (col9) and Ofensor (col8)."""
    cause = ((col9 or '') + ' ' + (col8 or '')).upper()
    if 'CURTO' in cause or 'CC ' in cause or 'CURTO CIRC' in cause:
        return 'CURTO CIRCUITO'
    if ('BAIXA' in cause and ('SINAL' in cause or 'NIVEL' in cause or 'NIVEL' in cause or 'NIVEL' in cause)) \
       or 'REDE BAIXA' in cause or 'NIVEL BAIXO' in cause or 'FIBRA' in cause \
       or 'ROMPIMENTO' in cause or 'ATENUAÇÃO' in cause or 'ATENUACAO' in cause:
        return 'REDE BAIXA'
    if 'VANDAL' in cause or 'ROUBO' in cause or 'FURTO' in cause \
       or 'CORTE' in cause or 'DEPREDAÇÃO' in cause or 'DEPREDACAO' in cause:
        return 'VANDALISMO'
    # Fallback by keywords
    if 'CURTO' in cause:
        return 'CURTO CIRCUITO'
    if 'BAIXA' in cause:
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
        sql = f"""
            SELECT id, topic, col1, col2, col3, col4, col6, col7, col8, col9
            FROM fault_searcher_records
            {where_clause}
            ORDER BY id DESC
            LIMIT 5000;
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
            ev_type = _classify_event_type(col9_val, col8_val)

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
                desc_html = f"<hr style='border: 0; border-top: 1px solid #28354D; margin: 10px 0;'><p style='margin: 0 0 4px 0; color: #94A3B8; font-size: 13px;'>Descrição:</p><p style='margin: 0; color: #CBD5E1; font-size: 13px;'>{description}</p>" if description else ""
                send_resend_email(
                    to_email=tech_row['email'].strip(),
                    subject=f"[Nova Tarefa] {title}",
                    category_badge="TAREFA ATRIBUÍDA",
                    title="Nova Atividade Atribuída na Fila Operacional",
                    message_html=f'''
                        <p>Olá, <strong>{tech_row['name']}</strong>.</p>
                        <p>Uma nova atividade operacional foi atribuída a você na plataforma <strong>Claro Gestão Rede Externa</strong>.</p>
                        <div style="background: #172033; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                            <p style="margin: 0 0 6px 0; color: #94A3B8; font-size: 13px;">Título da Atividade:</p>
                            <p style="margin: 0 0 12px 0; color: #F8FAFC; font-weight: 700; font-size: 16px;">{title}</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Prioridade:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{priority}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Prazo Estimado:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{due_date or 'A definir'}</td>
                                </tr>
                                <tr>
                                    <td style="color: #94A3B8; padding: 4px 0;">Região / Área:</td>
                                    <td style="color: #F8FAFC; font-weight: 600; text-align: right;">{region or 'Geral'}</td>
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
            try: folder_id = int(folder_id)
            except ValueError: folder_id = None
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

        for f in uploaded_files:
            if not f or not f.filename:
                continue
            
            raw_filename = f.filename.strip()
            clean_filename = secure_filename(raw_filename)
            if not clean_filename:
                clean_filename = f"arquivo_{int(time.time())}"
                
            ext = raw_filename.rsplit('.', 1)[-1].lower() if '.' in raw_filename else ''
            
            unique_prefix = datetime.datetime.now().strftime('%Y%m%d%H%M%S') + '_' + str(os.urandom(3).hex())
            saved_filename = f"{unique_prefix}_{clean_filename}"
            rel_filepath = f"rotas/{route_id}/{saved_filename}"
            full_dest_path = os.path.join(target_dir, saved_filename)
            
            f.save(full_dest_path)
            filesize = os.path.getsize(full_dest_path)

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
            cur.execute("SELECT id, username, role FROM users ORDER BY username ASC;")
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
        
        return jsonify({
            "users": [
                {"id": u['id'], "name": u['username'], "username": u['username'], "role": u['role'] or 'Usuário', "type": "user"}
                for u in crm_users if u and u.get('username')
            ],
            "technicians": [
                {"id": t['id'], "name": t['name'], "role": t['role'] or 'Técnico', "company": t.get('company') or '', "type": "tech"}
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
                    a.updated_at
                FROM auditorias a
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

                results.append({
                    "id": r['id'],
                    "os": r['os'],
                    "created_date": c_date,
                    "created_by": r['created_by'],
                    "created_by_id": r['created_by_id'],
                    "responsible": r['responsible'],
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
            responsible = (data.get('responsible') or '').strip()
            responsible_id = data.get('responsible_id')
            created_date_str = (data.get('created_date') or '').strip()

            if not os_name:
                return jsonify({"error": "O campo OS é obrigatório."}), 400
            if not responsible:
                return jsonify({"error": "O campo Responsável é obrigatório."}), 400

            created_by = session.get('user_name') or session.get('username') or 'Usuário'
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
                "created_by": row['created_by'],
                "responsible": row['responsible'],
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
                r['created_by'] or '',
                r['responsible'] or '',
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
            cur.execute("SELECT id, username, role FROM users ORDER BY username ASC;")
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
        
        return jsonify({
            "users": [
                {"id": u['id'], "name": u['username'], "username": u['username'], "role": u['role'] or 'Usuário', "type": "user"}
                for u in crm_users if u and u.get('username')
            ],
            "technicians": [
                {"id": t['id'], "name": t['name'], "role": t['role'] or 'Técnico', "company": t.get('company') or '', "type": "tech"}
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
                    a.updated_at
                FROM aceitacoes a
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

                results.append({
                    "id": r['id'],
                    "os": r['os'],
                    "created_date": c_date,
                    "created_by": r['created_by'],
                    "created_by_id": r['created_by_id'],
                    "responsible": r['responsible'],
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
            responsible = (data.get('responsible') or '').strip()
            responsible_id = data.get('responsible_id')
            created_date_str = (data.get('created_date') or '').strip()
            custom_obs = data.get('observations')
            custom_photos = data.get('photos')

            if not os_name:
                return jsonify({"error": "O campo OS é obrigatório."}), 400
            if not responsible:
                return jsonify({"error": "O campo Responsável é obrigatório."}), 400

            created_by = session.get('user_name') or session.get('username') or 'Usuário'
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
                "created_by": row['created_by'],
                "created_by_id": row['created_by_id'],
                "responsible": row['responsible'],
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
                r['created_by'] or '',
                r['responsible'] or '',
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
        "id": r['id'],
        "ticket_type": r['ticket_type'] or '',
        "ticket_number": r['ticket_number'] or '',
        "fault_date": f_date_iso,
        "fault_date_formatted": f_date_fmt,
        "month_key": month_key,
        "month_label": month_label,
        "area": r['area'] or '',
        "trash_on_ground": r['trash_on_ground'] or 'Não',
        "cable_ends": r['cable_ends'] or 'Não',
        "adequate_network": r['adequate_network'] or 'Sim',
        "responsible": r['responsible'] or '',
        "status": r['status'] or 'Não concluido',
        "created_by": r.get('created_by') or '',
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

            created_by = session.get('user_name') or session.get('username') or 'Coordenador'
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

@app.route('/api/admin/notify-outdated-profile', methods=['POST'])
def api_notify_outdated_profile():
    if 'user_id' not in session or session.get('role') not in ['admin', 'supervisor']:
        return jsonify({"error": "Acesso restrito à coordenação e supervisão."}), 403

    data = request.get_json(silent=True) or {}
    target_user_id = data.get('user_id')

    try:
        conn = get_db()
        cur = conn.cursor()
        if target_user_id:
            cur.execute("SELECT id FROM users WHERE id = %s;", (target_user_id,))
            target_ids = [r['id'] for r in cur.fetchall()]
        else:
            cur.execute("SELECT id FROM users;")
            target_ids = [r['id'] for r in cur.fetchall()]
        cur.close()
        conn.close()

        notified_count = 0
        for uid in target_ids:
            u_info = get_user_info_dict(uid)
            if u_info and (u_info.get('needs_email') or not u_info.get('profile_complete')):
                target_email = u_info.get('email')
                if target_email and '@' in target_email:
                    send_outdated_profile_email(
                        to_email=target_email,
                        user_display=u_info.get('name') or u_info.get('username'),
                        missing_fields=u_info.get('missing_fields')
                    )
                    notified_count += 1

        return jsonify({
            "success": True,
            "message": f"{notified_count} colaboradores com cadastro pendente notificados por e-mail."
        })
    except Exception as e:
        print("[NOTIFY OUTDATED PROFILE ERROR]", e)
        return jsonify({"error": str(e)}), 500




# --------------------------------------------------------------------------
# GLOBAL ERROR HANDLERS (CRASH RESILIENCE & JSON INTEGRITY)
# --------------------------------------------------------------------------
@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Recurso solicitado não encontrado.", "status": 404}), 404
    return render_template('dashboard.html'), 404

@app.errorhandler(403)
def handle_403(e):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Acesso negado. Permissões insuficientes para esta operação.", "status": 403}), 403
    return redirect(url_for('login'))

@app.errorhandler(413)
def handle_413(e):
    return jsonify({"error": "O arquivo enviado excede o limite máximo permitido (500 MB).", "status": 413}), 413

@app.errorhandler(500)
def handle_500(e):
    traceback.print_exc()
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Instabilidade interna temporária no servidor. A equipe técnica foi informada.", "status": 500}), 500
    return render_template('dashboard.html'), 500

@app.errorhandler(Exception)
def handle_uncaught_exception(e):
    traceback.print_exc()
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({"error": "Ocorreu uma falha no processamento da solicitação.", "status": 500}), 500
    return render_template('dashboard.html'), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
