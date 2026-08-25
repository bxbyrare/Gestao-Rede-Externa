import re

app_path = "app.py"
with open(app_path, "r", encoding="utf-8", errors='ignore') as f:
    app_content = f.read()

# Fix the corrupted string
app_content = re.sub(
    r'Efetuou login no sistema Claro Gest.*?o Rede',
    'Efetuou login no sistema Claro Gestão Rede',
    app_content
)

with open(app_path, "w", encoding="utf-8") as f:
    f.write(app_content)

print("Fixed app.py login string")
