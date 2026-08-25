import sys

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

old_table = """        <div class="table-container">
          <table class="data-table" id="inventory-table">"""

new_table = """        <div class="table-container" style="background: rgba(22, 22, 26, 0.5); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
          <table class="data-table" id="inventory-table">"""

html_content = html_content.replace(old_table, new_table)
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8") as f:
    js_content = f.read()

old_empty_row = """        <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Nenhum item cadastrado nesta categoria de estoque.
        </td>"""

new_empty_row = """        <td colspan="5" style="text-align: center; padding: 60px 20px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.05)); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 24px; transform: rotate(-5deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.1);">
            <div style="transform: rotate(5deg);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 34px; height: 34px;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
          </div>
          <h4 style="color: #ffffff; font-weight: 800; font-size: 1.2rem; margin-bottom: 8px;">Estoque Vazio</h4>
          <p style="color: #94a3b8; font-size: 0.95rem; max-width: 400px; margin: 0 auto;">Nenhum item cadastrado nesta categoria no momento. Adicione novos itens clicando no botão acima.</p>
        </td>"""

js_content = js_content.replace(old_empty_row, new_empty_row)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_content)
print("Updated Empty State Inventory UI")
