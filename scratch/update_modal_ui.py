import re

# 1. Update dashboard.html Modal 5 HTML
html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# I will find the <!-- MODAL 5: USUÁRIOS --> block and replace it
# But there are encoding issues with "Usuǭrio" in the html_content read. 
# So I'll just use a regex between `MODAL 5` and the next `MODAL` or EOF

old_modal_start = r'<!-- ==========================================================================\s*MODAL 5:.*?</div>\s*</div>'

new_modal = """<!-- ==========================================================================
       MODAL 5: USUÁRIOS
       ========================================================================== -->
  <div class="modal-overlay" id="user-modal">
    <div class="modal-card modal-card-small">
      <div class="modal-header">
        <h3 id="user-modal-title">Adicionar Usuário</h3>
        <button class="btn-close-modal">&times;</button>
      </div>
      <form id="user-form" class="modal-form" style="padding-top: 16px;">
        <input type="hidden" id="user-id">

        <div class="form-group" style="margin-bottom: 20px;">
          <label for="user-tech-id" style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; display: block;">Vincular Pessoa Cadastrada *</label>
          <select id="user-tech-id" required style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-weight: 500; font-size: 0.95rem;">
            <option value="">Selecione uma pessoa...</option>
          </select>
          <small style="font-size: 0.75rem; color: #64748b; display: block; margin-top: 8px; line-height: 1.4;">É obrigatório cadastrar a pessoa na aba de <strong>#Pessoas</strong> antes de criar a conta de usuário.</small>
        </div>

        <div class="form-group" style="margin-bottom: 20px;">
          <label for="user-username" style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; display: block;">Nome de Usuário (Login)</label>
          <input type="text" id="user-username" required placeholder="ex: alexandre.candido" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-weight: 500; font-size: 0.95rem;">
        </div>

        <div class="form-group" id="password-group" style="margin-bottom: 20px;">
          <label for="user-password" style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; display: block;">Nova Senha (Opcional)</label>
          <input type="password" id="user-password" placeholder="Digite a nova senha..." style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-weight: 500; font-size: 0.95rem;">
          <small id="user-password-hint" style="font-size: 0.75rem; color: #64748b; display: block; margin-top: 8px; line-height: 1.4;">Deixe em branco para manter a senha atual. Em contas novas, será definida como <strong>NomeDaEmpresa@2026</strong> (ex: Claro@2026).</small>
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
          <label for="user-role" style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1; margin-bottom: 8px; display: block;">Cargo / Nível de Acesso</label>
          <select id="user-role" required style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-weight: 500; font-size: 0.95rem;">
            <option value="Coordenador">Coordenador</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Técnico">Técnico</option>
            <option value="Auxiliar">Auxiliar</option>
          </select>
        </div>

        <div class="modal-footer" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px; margin-top: 10px;">
          <button type="button" class="btn-cancel-modal" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;">Cancelar</button>
          <button type="submit" id="btn-save-user" style="background: rgba(238, 44, 36, 0.15); border: 1px solid rgba(238, 44, 36, 0.4); color: #fca5a5; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;">Salvar Usuário</button>
        </div>
      </form>
    </div>
  </div>"""

# Replace the specific MODAL 5 block
html_content = re.sub(r'<!-- ==========================================================================\s*MODAL 5:.*?</div>\s*</div>', new_modal, html_content, flags=re.DOTALL)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

# 2. Update style_v2.css to remove border-top: 4px solid var(--primary);
css_path = "static/css/style_v2.css"
with open(css_path, "r", encoding="utf-8") as f:
    css_content = f.read()

css_content = css_content.replace('border-top: 4px solid var(--primary);', 'border-top: 1px solid rgba(255, 255, 255, 0.15);')

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css_content)

print("Modal 5 HTML and CSS updated successfully")
