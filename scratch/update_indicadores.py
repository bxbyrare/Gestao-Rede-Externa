import sys
import re

# Update dashboard.html
html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# Replace all table container headers in the Indicadores section
old_header_1 = """            <div style="background: #18181c; border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
              <div style="background: #27272a; padding: 12px 16px; border-bottom: 1px solid var(--border); text-align: center;">"""

new_header_1 = """            <div style="background: rgba(22, 22, 26, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.2); border-radius: 16px; overflow: hidden;">
              <div style="background: rgba(255, 255, 255, 0.02); padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); text-align: center;">"""

html_content = html_content.replace(old_header_1, new_header_1)

# Replace the inner table headers
old_table_header = """                  <thead>
                    <tr style="background: #27272a;">"""
new_table_header = """                  <thead>
                    <tr style="background: rgba(255, 255, 255, 0.03);">"""
html_content = html_content.replace(old_table_header, new_table_header)

# Replace the month selector bar
old_month_selector = """            <!-- Modern Month Selector Control -->
            <div class="month-selector-bar" style="display: flex; align-items: center; gap: 8px; background: #16161a; padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(204, 29, 21, 0.4); box-shadow: 0 4px 14px rgba(0,0,0,0.3);">
              <label for="indicator-month-select" style="font-size: 0.8rem; font-weight: 800; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; margin-right: 4px;">📅 MÊS REFERÊNCIA:</label>
              <select id="indicator-month-select" style="background: #18181b; color: #ffffff; font-weight: 700; border: 1px solid rgba(255,255,255,0.12); font-size: 0.88rem; outline: none; cursor: pointer; padding: 6px 12px; border-radius: 6px; color-scheme: dark;">"""
              
new_month_selector = """            <!-- Modern Month Selector Control -->
            <div class="month-selector-bar" style="display: flex; align-items: center; gap: 8px; background: rgba(239, 68, 68, 0.1); backdrop-filter: blur(8px); padding: 8px 14px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);">
              <label for="indicator-month-select" style="font-size: 0.8rem; font-weight: 800; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; margin-right: 4px;">📅 MÊS REFERÊNCIA:</label>
              <select id="indicator-month-select" style="background: rgba(22, 22, 26, 0.8); color: #ffffff; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.88rem; outline: none; cursor: pointer; padding: 6px 12px; border-radius: 8px; color-scheme: dark; transition: all 0.2s ease;">"""

html_content = html_content.replace(old_month_selector, new_month_selector)

# Save dashboard.html
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

# Update style_v2.css
css_path = "static/css/style_v2.css"
with open(css_path, "r", encoding="utf-8") as f:
    css_content = f.read()

old_css = """/* Linha Amarela de Resumo da Região Interior */
.row-interior-total, tr.row-interior-total {
  background-color: #eab308 !important;
}

.row-interior-total td, .row-interior-total input {
  color: #0f172a !important;
  -webkit-text-fill-color: #0f172a !important;
  font-weight: 800 !important;
  background-color: transparent !important;
  border-color: rgba(15, 23, 42, 0.25) !important;
}"""

# A better regex replace for safety (sometimes line endings or spaces vary)
new_css = """/* Linha Amarela de Resumo da Região Interior Premium */
.row-interior-total, tr.row-interior-total {
  background: rgba(234, 179, 8, 0.12) !important;
}

.row-interior-total td, .row-interior-total input {
  color: #fde047 !important;
  -webkit-text-fill-color: #fde047 !important;
  font-weight: 800 !important;
  background-color: transparent !important;
  border-top: 1px solid rgba(234, 179, 8, 0.3) !important;
  border-bottom: 1px solid rgba(234, 179, 8, 0.3) !important;
  border-left: none !important;
  border-right: none !important;
  text-shadow: 0 0 10px rgba(234, 179, 8, 0.3);
}"""

if old_css in css_content:
    css_content = css_content.replace(old_css, new_css)
else:
    print("Could not find the exact old_css string. Attempting regex...")
    css_content = re.sub(
        r'/\* Linha Amarela.*?border-color: rgba\(15, 23, 42, 0\.25\) !important;\s*\}',
        new_css,
        css_content,
        flags=re.DOTALL
    )

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css_content)

print("Updated Indicadores Interior UI")
