import sys

js_path = "static/js/main.js"
with open(js_path, "r", encoding="utf-8") as f:
    js_content = f.read()

old_render = """  container.innerHTML = list.map(item => {
    const slug = item.slug || `form-${item.id}`;
    const linkToCopy = (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) 
      ? item.link 
      : `${window.location.origin}/f/${slug}`;

    return `
      <div class="route-card" style="border-top: 4px solid #cc1d15;">
        <div class="route-card-header">
          <span class="route-badge" style="background-color: rgba(204, 29, 21, 0.2); color: #f87171; border: 1px solid rgba(204, 29, 21, 0.4);">${escapeHtml(item.category || 'Inspeção')}</span>
          <div class="route-actions" onclick="event.stopPropagation();">
            <button class="btn-icon" onclick="openEditFormModal(${item.id})" title="Editar Formulário">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-delete" onclick="deleteForm(${item.id}, '${escapeHtml(item.title)}')" title="Excluir Formulário">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>

        <h4 class="route-card-title" style="margin-top: 8px;">${escapeHtml(item.title)}</h4>
        <p class="route-card-desc" style="margin-top: 4px;">${escapeHtml(item.description || 'Sem instruções adicionais.')}</p>

        <!-- Actions Bar -->
        <div style="display: flex; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <button class="btn" onclick="copyFormLink('${escapeHtml(linkToCopy)}')" style="flex: 1; font-size: 0.8rem; font-weight: 600; padding: 8px 10px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); color: #e2e8f0; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; margin-right: 6px; color: #60a5fa;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
            </svg>
            Copiar Link
          </button>

          <button class="btn" onclick="openFormResponsesModal(${item.id}, '${escapeHtml(item.title)}')" style="flex: 1.3; font-size: 0.8rem; font-weight: 600; padding: 8px 10px; background: rgba(204, 29, 21, 0.12); border: 1px solid rgba(204, 29, 21, 0.35); color: #f87171; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; margin-right: 6px; color: #f87171;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"/>
            </svg>
            Indicadores & Respostas
          </button>
        </div>
      </div>
    `;
  }).join('');"""

# Using brute force string replace because encoding might mess up the 'Inspeção' and 'Sem instruções adicionais' strings.
# Wait, python string replacement with proper UTF-8 will perfectly match it as long as I use the exact characters that are in the file! Let's read the file again to be sure what character it is.
