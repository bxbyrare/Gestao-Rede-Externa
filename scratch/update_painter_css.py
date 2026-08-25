import re

# 1. Update style_v2.css with new painter button styles
css_path = "static/css/style_v2.css"
with open(css_path, "r", encoding="utf-8", errors='ignore') as f:
    css_content = f.read()

replacement = r'''/* Escala Status Painter Buttons - Glassmorphism */
.escala-status-btn {
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 30px;
  cursor: pointer;
  font-size: 0.82rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  color: #94a3b8;
}
.escala-status-btn:hover { background: rgba(255, 255, 255, 0.05); color: #cbd5e1; }

.escala-status-btn[data-status="Folga"] { color: #f87171; }
.escala-status-btn[data-status="Folga"].active { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); box-shadow: 0 4px 15px rgba(239, 68, 68, 0.2); color: #fca5a5; }

.escala-status-btn[data-status="Trabalho"] { color: #cbd5e1; }
.escala-status-btn[data-status="Trabalho"].active { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.3); box-shadow: 0 4px 15px rgba(255, 255, 255, 0.1); color: #ffffff; }

.escala-status-btn[data-status="Férias"], .escala-status-btn[data-status="FÃ©rias"], .escala-status-btn[data-status="F\ufffdrias"] { color: #facc15; }
.escala-status-btn[data-status="Férias"].active, .escala-status-btn[data-status="FÃ©rias"].active, .escala-status-btn[data-status="F\ufffdrias"].active { background: rgba(234, 179, 8, 0.15); border-color: rgba(234, 179, 8, 0.4); box-shadow: 0 4px 15px rgba(234, 179, 8, 0.2); color: #fef08a; }

.escala-status-btn[data-status="BH"] { color: #60a5fa; }
.escala-status-btn[data-status="BH"].active { background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.4); box-shadow: 0 4px 15px rgba(59, 130, 246, 0.2); color: #93c5fd; }

.escala-status-btn[data-status="Feriado"] { color: #34d399; }
.escala-status-btn[data-status="Feriado"].active { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2); color: #86efac; }'''

css_content = re.sub(
    r'\.escala-status-btn \{.*?\.escala-status-btn\[data-status="Feriado"\]\.active \{.*?\}',
    lambda m: replacement,
    css_content,
    flags=re.DOTALL
)

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css_content)

print("CSS updated successfully")

# 2. Update main.js getEscalaStatusStyle logic
js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8", errors='ignore') as f:
    js_content = f.read()

new_js = """function getEscalaStatusStyle(status) {
  switch (status) {
    case 'Folga':
      return 'background: rgba(239, 68, 68, 0.15); color: #fca5a5; font-weight: 700;';
    case 'Férias':
    case 'FÃ©rias':
    case 'F\ufffdrias':
      return 'background: rgba(234, 179, 8, 0.15); color: #fef08a; font-weight: 700; border: 1px solid rgba(234, 179, 8, 0.3);';
    case 'BH':
      return 'background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-weight: 700;';
    case 'Feriado':
      return 'background: rgba(16, 185, 129, 0.15); color: #86efac; font-weight: 700;';
    case 'Trabalho':
    default:
      return 'background: rgba(255, 255, 255, 0.05); color: #cbd5e1; font-weight: 700;';
  }
}"""

js_content = re.sub(
    r'function getEscalaStatusStyle\(status\) \{.*?\}',
    lambda m: new_js,
    js_content,
    flags=re.DOTALL
)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_content)

print("JS updated successfully")
