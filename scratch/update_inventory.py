import sys
import re

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# Replace the 4 inventory cards to remove inline styles
old_cards = """        <!-- Category cards -->
        <div class="financial-grid" style="margin-bottom: 25px;">
          <div class="inventory-card-btn active" data-category="Cabos" style="cursor: pointer; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <h4 style="font-weight: 700; color: #ffffff;">Cabos</h4>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">Fibras, drop, ópticos, coaxiais</p>
          </div>
          <div class="inventory-card-btn" data-category="Equipamento" style="cursor: pointer; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <h4 style="font-weight: 700; color: #ffffff;">Equipamento</h4>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">ONUs, roteadores, splitters, caixas CTO</p>
          </div>
          <div class="inventory-card-btn" data-category="EPI" style="cursor: pointer; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <h4 style="font-weight: 700; color: #ffffff;">EPI</h4>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">Capacetes, cintos, botas, óculos, luvas</p>
          </div>
          <div class="inventory-card-btn" data-category="Ferramentas" style="cursor: pointer; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <h4 style="font-weight: 700; color: #ffffff;">Ferramentas</h4>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">Máquinas de fusão, clivadores, OTDRs</p>
          </div>
        </div>"""

new_cards = """        <!-- Category cards -->
        <div class="financial-grid" style="margin-bottom: 25px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          <div class="inventory-card-btn active" data-category="Cabos">
            <h4 style="font-weight: 800; color: #ffffff;">Cabos</h4>
            <p style="font-size: 0.82rem; color: #94a3b8; margin-top: 6px;">Fibras, drop, ópticos, coaxiais</p>
          </div>
          <div class="inventory-card-btn" data-category="Equipamento">
            <h4 style="font-weight: 800; color: #ffffff;">Equipamento</h4>
            <p style="font-size: 0.82rem; color: #94a3b8; margin-top: 6px;">ONUs, roteadores, splitters, caixas CTO</p>
          </div>
          <div class="inventory-card-btn" data-category="EPI">
            <h4 style="font-weight: 800; color: #ffffff;">EPI</h4>
            <p style="font-size: 0.82rem; color: #94a3b8; margin-top: 6px;">Capacetes, cintos, botas, óculos, luvas</p>
          </div>
          <div class="inventory-card-btn" data-category="Ferramentas">
            <h4 style="font-weight: 800; color: #ffffff;">Ferramentas</h4>
            <p style="font-size: 0.82rem; color: #94a3b8; margin-top: 6px;">Máquinas de fusão, clivadores, OTDRs</p>
          </div>
        </div>"""

# Replace brute force matching (since accents vary)
html_content = re.sub(
    r'<!-- Category cards -->\s*<div class="financial-grid" style="margin-bottom: 25px;">.*?</div>\s*</div>',
    new_cards,
    html_content,
    flags=re.DOTALL
)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)
print("Updated Inventory HTML")
