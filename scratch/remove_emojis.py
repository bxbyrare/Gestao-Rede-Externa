import sys
import re

html_path = "templates/dashboard.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# Remove the emoji spans inside the buttons
html_content = re.sub(r'<span>[^<]*</span>\s*', '', html_content)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)
print("Removed emojis from buttons")
