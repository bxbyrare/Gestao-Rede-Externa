import re

# 1. Bump cache version in dashboard.html to pull the new style_v2.css
html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

html_content = html_content.replace('style_v2.css\') }}?v=6.0.0', 'style_v2.css\') }}?v=6.0.1')
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

# 2. Fix #DIV/0! in main.js
js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8") as f:
    js_content = f.read()

# I will replace #DIV/0! with -
js_content = js_content.replace("pctTotalEl.textContent = '#DIV/0!';", "pctTotalEl.textContent = '-';")

# I will replace #0f172a with transparent to let CSS inherit text color
js_content = js_content.replace("pctTotalEl.style.color = '#0f172a';", "pctTotalEl.style.color = '';")

# Let's also fix the time indicators summary logic which probably has #DIV/0! too, though it might just say -
# Wait, let's check if there are other '#DIV/0!' strings
if "'#DIV/0!'" in js_content:
    js_content = js_content.replace("'#DIV/0!'", "'-'")

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_content)

print("Updated dashboard cache and fixed DIV/0!")
