import sys
import re

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# The buttons look like: <button class="escala-status-btn active" data-status="Folga" style="background: #ef4444; color: #ffffff; ...">
# We want to remove the style="..." attribute entirely.
html_content = re.sub(r'(<button[^>]+class="[^"]*escala-status-btn[^"]*"[^>]+)style="[^"]*"', r'\1', html_content)
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8") as f:
    js_content = f.read()

old_js = """        painterBtns.forEach(b => {
          b.classList.remove('active');
          b.style.border = '2px solid transparent';
          b.style.boxShadow = 'none';
        });
        btn.classList.add('active');
        btn.style.border = '2px solid #ffffff';"""
new_js = """        painterBtns.forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');"""

js_content = js_content.replace(old_js, new_js)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_content)
print("Updated HTML and JS")
