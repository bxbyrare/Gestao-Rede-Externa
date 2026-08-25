import sys

file_path = "static/js/main.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace painter cellEl.style.cssText
old_painter = """  // Update cell UI
  cellEl.style.cssText = getEscalaStatusStyle(currentEscalaActiveStatus) + 
    ' border-left: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.04); text-align: center; vertical-align: middle; padding: 10px 4px; cursor: pointer; user-select: none; font-size: 0.78rem; font-weight: 700;';
  
  cellEl.textContent = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 \ufffds 17:48hs') : currentEscalaActiveStatus;"""

old_painter2 = """  cellEl.textContent = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 \ufffds 17:48hs') : currentEscalaActiveStatus;"""
old_painter3 = """  cellEl.textContent = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 s 17:48hs') : currentEscalaActiveStatus;"""
old_painter4 = """  cellEl.textContent = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 às 17:48hs') : currentEscalaActiveStatus;"""

new_painter = """  // Update cell UI keeping the new div structure
  cellEl.style.cssText = 'border-left: 1px solid rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 6px; cursor: pointer; user-select: none; transition: transform 0.1s ease;';
  
  const textVal = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 às 17:48hs') : currentEscalaActiveStatus;
  const statusStyle = getEscalaStatusStyle(currentEscalaActiveStatus);
  
  cellEl.innerHTML = `<div style="${statusStyle} border-radius: 8px; width: 100%; height: 100%; min-height: 38px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; padding: 4px;">
    ${escapeHtml(textVal)}
  </div>`;"""

content = content.replace(old_painter, new_painter)
content = content.replace(old_painter2, new_painter)
content = content.replace(old_painter3, new_painter)
content = content.replace(old_painter4, new_painter)

old_oncall = """  // Update cell UI
  const onCallBg = nextVal !== '0' ? 'color: #38bdf8; font-weight: 800; background: rgba(56, 189, 248, 0.12);' : 'color: #64748b; font-weight: 600;';
  cellEl.style.cssText = onCallBg + ' border-left: 1px solid rgba(255,255,255,0.06); border-bottom: 2px solid rgba(255,255,255,0.08); text-align: center; vertical-align: middle; padding: 4px 2px; cursor: pointer; user-select: none; font-size: 0.76rem; font-family: monospace;';
  cellEl.textContent = nextVal;"""

new_oncall = """  // Update cell UI keeping div structure
  const onCallBg = nextVal !== '0' ? 'color: #38bdf8; font-weight: 800; background: rgba(56, 189, 248, 0.12); border-radius: 6px;' : 'color: #475569; font-weight: 600;';
  
  cellEl.style.cssText = 'border-left: 1px solid rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 4px; cursor: pointer; user-select: none; font-size: 0.76rem; font-family: monospace;';
  
  cellEl.innerHTML = `<div style="${onCallBg} padding: 2px 4px; display: inline-block; min-width: 24px;">${escapeHtml(nextVal)}</div>`;"""

content = content.replace(old_oncall, new_oncall)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
