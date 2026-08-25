import re

# 1. Update dashboard.html
html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

old_total_box = """            <div style="text-align: right; background: linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05)); padding: 12px 20px; border-radius: 14px; border: 1px solid rgba(234, 179, 8, 0.3); box-shadow: 0 4px 20px rgba(234, 179, 8, 0.15);">
              <span style="font-size: 0.75rem; color: #fde047; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Acumulado</span>
              <h2 id="financial-running-total" style="color: #fef08a; font-weight: 900; font-size: 1.85rem; text-shadow: 0 0 15px rgba(234, 179, 8, 0.4); margin: 0;">R$ 0,00</h2>
            </div>"""

new_total_box = """            <div style="text-align: right; background: rgba(255, 255, 255, 0.04); padding: 12px 20px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.06); box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);">
              <span style="font-size: 0.75rem; color: #cbd5e1; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 2px;">Total Acumulado</span>
              <h2 id="financial-running-total" style="color: #f8fafc; font-weight: 800; font-size: 1.85rem; margin: 0;">R$ 0,00</h2>
            </div>"""

html_content = html_content.replace(old_total_box, new_total_box)
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)


# 2. Update main.js
js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8") as f:
    js_content = f.read()

old_td = """<td style="padding: 16px 16px;"><strong style="color: #fef08a; font-size: 1.05rem; font-weight: 900; text-shadow: 0 0 15px rgba(234, 179, 8, 0.4);">R$ ${item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>"""
new_td = """<td style="padding: 16px 16px;"><strong style="color: #f8fafc; font-size: 1.0rem; font-weight: 700;">R$ ${item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>"""

js_content = js_content.replace(old_td, new_td)
with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_content)

print("Removed neon glow from finance UI")
