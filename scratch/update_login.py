import re

html_path = "templates/login.html"
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# Fix logo
oldLogoCss = """      .claro-logo-img {
        width: 76px;
        height: 76px;
        border-radius: 50%;
        object-fit: cover;
        margin-bottom: 14px;
        box-shadow: 0 8px 24px rgba(238, 44, 36, 0.45);
        border: 2px solid rgba(255, 255, 255, 0.15);
      }"""

newLogoCss = """      .claro-logo-img {
        width: 84px;
        height: auto;
        margin-bottom: 14px;
        filter: drop-shadow(0 8px 16px rgba(238, 44, 36, 0.35));
      }"""

html_content = html_content.replace(oldLogoCss, newLogoCss)

# Fix footer
html_content = re.sub(
    r'<div class="login-footer".*?>.*?</div>',
    '<div class="login-footer" style="text-align: center; margin-top: 24px; font-size: 0.75rem; color: #64748b;">\n      <p>&copy; 2026 Claro Brasil.</p>\n    </div>',
    html_content,
    flags=re.DOTALL
)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print("Updated login UI")
