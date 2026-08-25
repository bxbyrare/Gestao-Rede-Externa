import sys

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

old_notice = """        <div id="escala-empty-notice" style="background: rgba(15, 23, 42, 0.6); border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 50px 20px; text-align: center; margin-top: 10px;">
          <div style="width: 64px; height: 64px; background: rgba(59, 130, 246, 0.12); color: #60a5fa; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 32px; height: 32px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <h3 style="font-weight: 800; color: #ffffff; margin-bottom: 8px;">Nenhuma Área Selecionada</h3>
          <p style="font-size: 0.95rem; color: var(--text-muted); max-width: 500px; margin: 0 auto 20px auto;">
            Por favor, selecione primeiro a <strong>Área de Atuação</strong> no filtro acima para carregar a escala de trabalho da equipe.
          </p>
        </div>"""

new_notice = """        <div id="escala-empty-notice" style="background: rgba(22, 22, 26, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 8px 32px rgba(0,0,0,0.2); border-radius: 20px; padding: 60px 20px; text-align: center; margin-top: 20px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.05)); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 24px; transform: rotate(-5deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.1);">
            <div style="transform: rotate(5deg);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 34px; height: 34px;"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
          </div>
          <h3 style="font-weight: 800; color: #ffffff; margin-bottom: 12px; font-size: 1.4rem;">Nenhuma Área Selecionada</h3>
          <p style="font-size: 1rem; color: #94a3b8; max-width: 500px; margin: 0 auto 20px auto; line-height: 1.6;">
            Por favor, selecione primeiro a <strong style="color: #cbd5e1; font-weight: 700;">Área de Atuação</strong> no filtro acima para carregar a escala de trabalho da equipe correspondente.
          </p>
        </div>"""

old_wrapper = """        <!-- Schedule Grid Table Container -->
        <div id="escala-table-wrapper" style="display: none; background-color: #121216; border-radius: 14px; border: 1px solid var(--border); box-shadow: var(--shadow); overflow-x: auto;">
          <table class="data-table" id="escala-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0;">"""

new_wrapper = """        <!-- Schedule Grid Table Container -->
        <div id="escala-table-wrapper" style="display: none; background: rgba(22, 22, 26, 0.5); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px rgba(0,0,0,0.2); overflow-x: auto; margin-top: 16px; padding-bottom: 8px;">
          <table class="data-table" id="escala-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0;">"""

html_content = html_content.replace(old_notice, new_notice)
html_content = html_content.replace(old_wrapper, new_wrapper)

# Also update the "Horário Padrão" input to be glassmorphic
old_horario = """            <label for="escala-work-hours-input" style="font-weight: 800; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase;">Horário Padrão:</label>
            <input type="text" id="escala-work-hours-input" value="08 às 17:48hs" placeholder="Ex: 08 às 17:48hs" style="background: #0f172a; border: 1px solid var(--primary); color: #f8fafc; font-weight: 700; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; width: 160px;">"""

new_horario = """            <label for="escala-work-hours-input" style="font-weight: 800; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Horário Padrão:</label>
            <input type="text" id="escala-work-hours-input" value="08 às 17:48hs" placeholder="Ex: 08 às 17:48hs" style="background: rgba(22, 22, 26, 0.7); backdrop-filter: blur(8px); border: 1px solid rgba(59, 130, 246, 0.5); box-shadow: 0 0 10px rgba(59, 130, 246, 0.15); color: #f8fafc; font-weight: 700; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; width: 160px; outline: none; transition: all 0.2s ease;">"""

html_content = html_content.replace(old_horario, new_horario)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)
print("Updated Empty State UI")
