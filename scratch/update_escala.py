import sys

file_path = "static/js/main.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Header 1
content = content.replace(
    '<th style="position: sticky; left: 0; z-index: 20; background: #18181f; border-bottom: 1px solid var(--border); padding: 10px 14px; text-align: left; min-width: 220px; font-weight: 800; color: #ffffff;">',
    '<th style="position: sticky; left: 0; z-index: 20; background: rgba(22, 22, 26, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 14px; text-align: left; min-width: 220px; font-weight: 800; color: #ffffff;">'
)
content = content.replace(
    "const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.08);' : 'background: #16161a;';",
    "const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.05);' : 'background: rgba(255,255,255,0.02);';"
)
content = content.replace(
    'return `<th style="${bg} border-bottom: 1px solid var(--border); border-left: 1px solid rgba(255,255,255,0.06); padding: 8px 6px; text-align: center; font-size: 0.8rem; font-weight: 800; color: #f8fafc; min-width: 90px;">',
    'return `<th style="${bg} border-bottom: 1px solid rgba(255,255,255,0.05); border-left: 1px solid rgba(255,255,255,0.03); padding: 10px 6px; text-align: center; font-size: 0.8rem; font-weight: 800; color: #f8fafc; min-width: 90px;">'
)

# Replace Header 2
content = content.replace(
    '<th style="position: sticky; left: 0; z-index: 20; background: #18181f; border-bottom: 2px solid var(--border); padding: 6px 14px; text-align: left; font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase;">',
    '<th style="position: sticky; left: 0; z-index: 20; background: rgba(22, 22, 26, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 6px 14px 12px 14px; text-align: left; font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase;">'
)
content = content.replace(
    "const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.12); color: #60a5fa;' : 'background: #121216; color: #94a3b8;';",
    "const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.08); color: #60a5fa;' : 'background: rgba(255,255,255,0.01); color: #94a3b8;';"
)
content = content.replace(
    'return `<th style="${bg} border-bottom: 2px solid var(--border); border-left: 1px solid rgba(255,255,255,0.06); padding: 4px 6px; text-align: center; font-size: 0.72rem; font-weight: 700; text-transform: lowercase;">',
    'return `<th style="${bg} border-bottom: 1px solid rgba(255,255,255,0.05); border-left: 1px solid rgba(255,255,255,0.03); padding: 4px 6px 10px 6px; text-align: center; font-size: 0.72rem; font-weight: 700; text-transform: lowercase;">'
)

# Replace Row 1
content = content.replace(
    'html += `<tr style="border-top: 2px solid rgba(255,255,255,0.08);">`;',
    'html += `<tr style="background: transparent;">`;'
)
content = content.replace(
    '<td style="position: sticky; left: 0; z-index: 10; background: #16161c; border-right: 2px solid rgba(255,255,255,0.08); padding: 10px 14px; vertical-align: middle;">',
    '<td style="position: sticky; left: 0; z-index: 10; background: rgba(22, 22, 26, 0.95); backdrop-filter: blur(12px); border-right: 1px solid rgba(255,255,255,0.05); border-top: 1px solid rgba(255,255,255,0.05); padding: 12px 14px; vertical-align: middle;">'
)

content = content.replace(
    'style="${statusStyle} border-left: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.04); text-align: center; vertical-align: middle; padding: 10px 4px; cursor: pointer; user-select: none; font-size: 0.78rem; font-weight: 700; transition: transform 0.1s ease;"',
    'style="border-left: 1px solid rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 6px; cursor: pointer; user-select: none; transition: transform 0.1s ease;"'
)
content = content.replace(
    '${escapeHtml(textContent)}\n        </td>',
    '<div style="${statusStyle} border-radius: 8px; width: 100%; height: 100%; min-height: 38px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; padding: 4px;">\n            ${escapeHtml(textContent)}\n          </div>\n        </td>'
)

# Replace Row 2
content = content.replace(
    'html += `<tr style="background: rgba(0,0,0,0.15);">`;',
    'html += `<tr style="background: transparent;">`;'
)
content = content.replace(
    '<td style="position: sticky; left: 0; z-index: 10; background: #121216; border-right: 2px solid rgba(255,255,255,0.08); border-bottom: 2px solid rgba(255,255,255,0.08); padding: 4px 14px 6px 14px; text-align: right; vertical-align: middle;">',
    '<td style="position: sticky; left: 0; z-index: 10; background: rgba(18, 18, 22, 0.95); backdrop-filter: blur(12px); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px 14px 10px 14px; text-align: right; vertical-align: middle;">'
)
content = content.replace(
    'const onCallBg = onCallVal !== \'0\' ? \'color: #38bdf8; font-weight: 800; background: rgba(56, 189, 248, 0.12);\' : \'color: #64748b; font-weight: 600;\';',
    'const onCallBg = onCallVal !== \'0\' ? \'color: #38bdf8; font-weight: 800; background: rgba(56, 189, 248, 0.12); border-radius: 6px;\' : \'color: #475569; font-weight: 600;\';'
)
content = content.replace(
    'style="${onCallBg} border-left: 1px solid rgba(255,255,255,0.06); border-bottom: 2px solid rgba(255,255,255,0.08); text-align: center; vertical-align: middle; padding: 4px 2px; cursor: pointer; user-select: none; font-size: 0.76rem; font-family: monospace;"',
    'style="border-left: 1px solid rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 4px; cursor: pointer; user-select: none; font-size: 0.76rem; font-family: monospace;"'
)
content = content.replace(
    '${escapeHtml(onCallVal)}\n        </td>',
    '<div style="${onCallBg} padding: 2px 4px; display: inline-block; min-width: 24px;">${escapeHtml(onCallVal)}</div>\n        </td>'
)

# Add gap row at end of technician block
content = content.replace(
    '    html += `</tr>`;\n  });',
    '    html += `</tr>`;\n    html += `<tr><td style="padding: 3px;"></td></tr>`;\n  });'
)

# getEscalaStatusStyle rewrite (brute force)
old_style_fn = """function getEscalaStatusStyle(status) {
  switch (status) {
    case 'Folga':
      return 'background: #ef4444; color: #ffffff;';
    case 'FǸrias':
      return 'background: #0f172a; color: #ffffff; border: 1px solid rgba(255,255,255,0.15);';
    case 'BH':
      return 'background: #3b82f6; color: #ffffff;';
    case 'Feriado':
      return 'background: #10b981; color: #ffffff;';
    case 'Trabalho':
    default:
      return 'background: #1e293b; color: #e2e8f0;';
  }
}"""
new_style_fn = """function getEscalaStatusStyle(status) {
  switch (status) {
    case 'Folga':
      return 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444;';
    case 'FǸrias':
    case 'Férias':
      return 'background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8;';
    case 'BH':
      return 'background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa;';
    case 'Feriado':
      return 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399;';
    case 'Trabalho':
    default:
      return 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0;';
  }
}"""
content = content.replace(old_style_fn, new_style_fn)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
