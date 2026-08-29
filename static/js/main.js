function getElVal(id, defaultVal = '') {
  const el = document.getElementById(id);
  return el ? el.value : defaultVal;
}
function setElVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
/* ==========================================================================
   Gestão de Rede Externa - Claro
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initRouteFolderEvents();
  const originalFetch = window.fetch;
  window.fetch = async function() {
      const response = await originalFetch.apply(this, arguments);
      if (response.status === 401) {
          window.location.href = '/login';
          return new Promise(() => {}); 
      }
      return response;
  };
  const isDashboard = document.querySelector('.dash-sidebar') || document.querySelector('.sidebar-menu');
  if (isDashboard) {
    initDashboard();
  }
});
function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '24px';
    container.style.right = '24px';
    container.style.zIndex = '10000';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  toast.style.padding = '14px 22px';
  toast.style.borderRadius = '12px';
  toast.style.color = '#ffffff';
  toast.style.fontSize = '0.9rem';
  toast.style.fontWeight = '600';
  toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(100px)';
  toast.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
  let icon = '✓';
  let bg = '#30d158';
  if (type === 'error') {
    icon = '✗';
    bg = '#ff453a';
  } else if (type === 'info') {
    icon = 'ℹ';
    bg = '#007aff';
  }
  toast.style.backgroundColor = bg;
  toast.innerHTML = `<span style="font-size: 1.1rem;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 50);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, duration);
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function getUserRole() {
  const roleFromWin = window.currentUserRole || '';
  const roleFromDom = document.querySelector('.profile-role')?.textContent || '';
  return (roleFromWin || roleFromDom).trim().toLowerCase();
}
function isSupervisorOrCoordenador() {
  const r = getUserRole();
  return r.includes('coordenador') || r.includes('supervisor') || r.includes('admin');
}
function isCoordenador() {
  const r = getUserRole();
  return r.includes('coordenador') || r.includes('admin');
}
function getUserCompany() {
  const compFromWin = window.currentUserCompany || '';
  return compFromWin.trim().toLowerCase();
}
function isCoordenadorClaro() {
  const role = getUserRole();
  const company = getUserCompany();
  const isCoord = role.includes('coordenador') || role.includes('admin');
  const isClaro = company === 'claro';
  return isCoord && isClaro;
}
let currentFolderId = null;
let folderStack = []; 
let activeFinanceSubtab = 'fin-teams-subtab';
let activeInventoryCategory = 'Cabos';
let currentRouteLines = [];
function initDashboard() {
  const menuButtons = document.querySelectorAll('.menu-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  menuButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === 'data-tab') {
        if (!isSupervisorOrCoordenador()) {
          showToast('Você não tem permissão para isso', 'error', 3000);
          return;
        }
      }
      if (targetTab === 'financial-tab') {
        if (!isCoordenadorClaro()) {
          showToast('Você não é um Coordenador Claro, se isto é um erro contate nossa equipe de TI.', 'error', 4000);
          return;
        }
      }
      menuButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');
      if (targetTab === 'pessoas-tab') loadTechnicians();
      if (targetTab === 'veiculos-tab') loadVehicles();
      if (targetTab === 'buscador-tab') loadBuscadorTab();
      if (targetTab === 'mapa-eventos-tab') initMapaEventos();
      if (targetTab === 'financial-tab') loadFinancialTab();
      if (targetTab === 'escala-tab') loadEscalaTab();
      if (targetTab === 'workspace-tab') loadUserTasks();
      if (targetTab === 'evaluation-tab') loadEvaluations();
      if (targetTab === 'inventario-tab') loadInventory(activeInventoryCategory);
      if (targetTab === 'projects-tab') {
        currentFolderId = null;
        folderStack = [];
        loadFoldersAndProjects();
      }
      if (targetTab === 'data-tab') {
        loadLogs();
        loadUsers();
      }
      if (targetTab === 'metrics-tab') loadMetrics();
      if (targetTab === 'favorites-tab') loadFavorites();
      if (targetTab === 'notificacoes-tab') loadNotifications();
      if (targetTab === 'forms-tab') loadForms();
      if (targetTab === 'rotas-tab') loadRoutes();
    });
  });
  initFavoritesEvents();
  initNotificationsEvents();
  initFormsEvents();
  initRoutesEvents();
  initBuscadorEvents();
  initMapaEventosEvents();
  initEscalaEvents();
  initWorkspaceEvents();
  initEvaluationEvents();
  initProjectDragAndDropAndPaste();
  const subTabButtons = document.querySelectorAll('.sub-tab-btn');
  subTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSub = btn.getAttribute('data-subtab');
      subTabButtons.forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-muted)';
        b.style.borderBottomColor = 'transparent';
      });
      btn.classList.add('active');
      btn.style.color = '#ffffff';
      btn.style.borderBottomColor = 'var(--primary)';
      document.querySelectorAll('.subtab-pane').forEach(p => p.style.display = 'none');
      const targetElem = document.getElementById(targetSub);
      if (targetElem) {
        targetElem.style.display = 'block';
      }
      activeFinanceSubtab = targetSub;
      loadFinancialTab();
    });
  });
  const invCardButtons = document.querySelectorAll('.inventory-card-btn');
  invCardButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      invCardButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const category = btn.getAttribute('data-category');
      activeInventoryCategory = category;
      document.getElementById('inventory-selected-title').textContent = `Estoque: ${category}`;
      loadInventory(category);
    });
  });
  const btnExportTechs = document.getElementById('btn-export-techs');
  if (btnExportTechs) {
    btnExportTechs.addEventListener('click', () => {
      window.location.href = '/api/technicians/export';
    });
  }
  const btnBulkTechs = document.getElementById('btn-bulk-techs');
  const techBulkModal = document.getElementById('tech-bulk-modal');
  if (btnBulkTechs && techBulkModal) {
    btnBulkTechs.addEventListener('click', () => {
      document.getElementById('tech-bulk-data').value = '';
      techBulkModal.classList.add('active');
    });
  }
  const btnSaveTechBulk = document.getElementById('btn-save-tech-bulk');
  if (btnSaveTechBulk) {
    btnSaveTechBulk.addEventListener('click', () => {
      const csvText = document.getElementById('tech-bulk-data').value.trim();
      if (!csvText) {
        showToast("Por favor, cole os dados para importar.", "error");
        return;
      }
      fetch('/api/technicians/bulk', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ csv_data: csvText })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro na importação: ${data.error}`, 'error');
        } else {
          let msg = `${data.imported} técnicos importados com sucesso!`;
          if (data.errors && data.errors.length > 0) {
            msg += ` (${data.errors.length} falhas ignoradas)`;
          }
          showToast(msg, 'success');
          techBulkModal.classList.remove('active');
          loadTechnicians();
        }
      })
      .catch(err => {
        console.error("Bulk tech error:", err);
        showToast("Erro ao processar importação.", "error");
      });
    });
  }
  const btnExportVehicles = document.getElementById('btn-export-vehicles');
  if (btnExportVehicles) {
    btnExportVehicles.addEventListener('click', () => {
      window.location.href = '/api/vehicles/export';
    });
  }
  const btnBulkVehicles = document.getElementById('btn-bulk-vehicles');
  const vehicleBulkModal = document.getElementById('vehicle-bulk-modal');
  if (btnBulkVehicles && vehicleBulkModal) {
    btnBulkVehicles.addEventListener('click', () => {
      const txtInput = document.getElementById('vehicle-bulk-data');
      if (txtInput) txtInput.value = '';
      const fileInput = document.getElementById('vehicle-bulk-file');
      if (fileInput) fileInput.value = '';
      vehicleBulkModal.classList.add('active');
    });
  }
  const btnSaveVehicleBulk = document.getElementById('btn-save-vehicle-bulk');
  if (btnSaveVehicleBulk) {
    btnSaveVehicleBulk.addEventListener('click', () => {
      const fileInput = document.getElementById('vehicle-bulk-file');
      const csvTextarea = document.getElementById('vehicle-bulk-data');
      const file = fileInput && fileInput.files[0];
      const csvText = csvTextarea ? csvTextarea.value.trim() : '';
      if (!file && !csvText) {
        showToast("Por favor, selecione um arquivo Excel/CSV ou cole os dados para importar.", "error");
        return;
      }
      showToast("Processando arquivo em lote...", "info");
      let fetchPromise;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        fetchPromise = fetch('/api/vehicles/bulk', {
          method: 'POST',
          body: formData
        });
      } else {
        fetchPromise = fetch('/api/vehicles/bulk', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ csv_data: csvText })
        });
      }
      fetchPromise
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro na importação: ${data.error}`, 'error');
        } else {
          let msg = `${data.imported} veículos processados (${data.inserted || 0} cadastrados, ${data.updated || 0} atualizados)!`;
          if (data.errors && data.errors.length > 0) {
            msg += ` (${data.errors.length} falhas ignoradas)`;
          }
          showToast(msg, 'success');
          vehicleBulkModal.classList.remove('active');
          loadVehicles();
        }
      })
      .catch(err => {
        console.error("Bulk vehicle error:", err);
        showToast("Erro ao processar importação de veículos.", "error");
      });
    });
  }
  function applyCpfMask(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 11) value = value.slice(0, 11);
      if (value.length > 9) {
        value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
      } else if (value.length > 6) {
        value = value.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
      } else if (value.length > 3) {
        value = value.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
      }
      e.target.value = value;
    });
  }
  applyCpfMask(document.getElementById('tech-cpf'));
  const plateInput = document.getElementById('vehicle-plate');
  if (plateInput) {
    plateInput.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 7) val = val.slice(0, 7);
      if (val.length > 3) {
        val = val.slice(0, 3) + '-' + val.slice(3);
      }
      e.target.value = val;
    });
  }
  const modalOverlays = document.querySelectorAll('.modal-overlay');
  const closeButtons = document.querySelectorAll('.btn-close-modal, .btn-cancel-modal');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      modalOverlays.forEach(m => m.classList.remove('active'));
    });
  });
  modalOverlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
  const btnOpenTechModal = document.getElementById('btn-open-tech-modal');
  if (btnOpenTechModal) {
    btnOpenTechModal.addEventListener('click', () => {
      document.getElementById('tech-form').reset();
      document.getElementById('tech-id').value = '';
      document.getElementById('tech-modal-title').textContent = 'Cadastrar Novo Técnico';
      document.getElementById('tech-modal').classList.add('active');
    });
  }
  const btnOpenVehicleModal = document.getElementById('btn-open-vehicle-modal');
  if (btnOpenVehicleModal) {
    btnOpenVehicleModal.addEventListener('click', () => {
      populateResponsibleTechsDropdown();
      document.getElementById('vehicle-form').reset();
      document.getElementById('vehicle-id').value = '';
      document.getElementById('vehicle-modal-title').textContent = 'Adicionar Veículo à Frota';
      document.getElementById('vehicle-modal').classList.add('active');
    });
  }
  const btnOpenFinTeamModal = document.getElementById('btn-open-fin-team-modal');
  if (btnOpenFinTeamModal) {
    btnOpenFinTeamModal.addEventListener('click', () => {
      populateFinTeamTechsDropdowns();
      document.getElementById('fin-team-form').reset();
      document.getElementById('fin-team-record-id').value = '';
      const titleEl = document.getElementById('fin-team-modal-title');
      if (titleEl) titleEl.textContent = 'Registrar Faturamento da Equipe';
      const btnSub = document.getElementById('btn-submit-fin-team');
      if (btnSub) btnSub.textContent = 'Registrar Equipe';
      document.getElementById('fin-team-modal').classList.add('active');
    });
  }
  const btnOpenFinConsumableModal = document.getElementById('btn-open-fin-consumable-modal');
  if (btnOpenFinConsumableModal) {
    btnOpenFinConsumableModal.addEventListener('click', () => {
      document.getElementById('fin-consumable-form').reset();
      document.getElementById('fin-consumable-record-id').value = '';
      const titleEl = document.getElementById('fin-consumable-modal-title');
      if (titleEl) titleEl.textContent = 'Registrar Consumível';
      const btnSub = document.getElementById('btn-submit-fin-consumable');
      if (btnSub) btnSub.textContent = 'Registrar Despesa';
      document.getElementById('fin-consumable-modal').classList.add('active');
    });
  }
  const btnOpenInventoryModal = document.getElementById('btn-open-inventory-modal');
  if (btnOpenInventoryModal) {
    btnOpenInventoryModal.addEventListener('click', () => {
      document.getElementById('inventory-form').reset();
      document.getElementById('inventory-id').value = '';
      document.getElementById('inventory-category').value = activeInventoryCategory;
      document.getElementById('inventory-modal-title').textContent = `Adicionar Item: ${activeInventoryCategory}`;
      document.getElementById('inventory-modal').classList.add('active');
    });
  }
  const btnOpenFolderModal = document.getElementById('btn-open-folder-modal');
  if (btnOpenFolderModal) {
    btnOpenFolderModal.addEventListener('click', () => {
      document.getElementById('folder-form').reset();
      document.getElementById('folder-modal').classList.add('active');
    });
  }
  const kmzInput = document.getElementById('proj-kmz');
  const kmzLabel = document.getElementById('kmz-file-label');
  if (kmzInput && kmzLabel) {
    kmzInput.addEventListener('change', (e) => {
      const filesCount = e.target.files.length;
      const fileName = filesCount > 1 
        ? `${filesCount} arquivos selecionados`
        : (e.target.files[0] ? e.target.files[0].name : "Selecionar mapa do Google Earth (.kmz, .kml)...");
      kmzLabel.textContent = fileName;
      kmzLabel.style.color = filesCount > 0 ? "#ffffff" : "var(--text-muted)";
    });
  }
  const pdfInput = document.getElementById('proj-pdf');
  const pdfLabel = document.getElementById('pdf-file-label');
  if (pdfInput && pdfLabel) {
    pdfInput.addEventListener('change', (e) => {
      const filesCount = e.target.files.length;
      const fileName = filesCount > 1 
        ? `${filesCount} arquivos selecionados`
        : (e.target.files[0] ? e.target.files[0].name : "Selecionar arquivos técnicos (.pdf, .docx, .xlsx, .txt, .png)...");
      pdfLabel.textContent = fileName;
      pdfLabel.style.color = filesCount > 0 ? "#ffffff" : "var(--text-muted)";
    });
  }
  const techAreaInput = document.getElementById('tech-area');
  const areaModal = document.getElementById('area-modal');
  const btnCloseAreaModal = document.getElementById('btn-close-area-modal');
  const btnSaveAreas = document.getElementById('btn-save-areas');
  if (techAreaInput && areaModal) {
    techAreaInput.addEventListener('click', () => {
      const currentVal = techAreaInput.value.trim();
      const currentAreas = currentVal ? currentVal.split(',').map(s => s.trim()) : [];
      const checkboxes = areaModal.querySelectorAll('.area-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = currentAreas.includes(cb.value);
      });
      areaModal.classList.add('active');
    });
  }
  if (btnCloseAreaModal && areaModal) {
    btnCloseAreaModal.addEventListener('click', () => {
      areaModal.classList.remove('active');
    });
  }
  if (btnSaveAreas && areaModal && techAreaInput) {
    btnSaveAreas.addEventListener('click', () => {
      const checkboxes = areaModal.querySelectorAll('.area-checkbox');
      const selected = [];
      checkboxes.forEach(cb => {
        if (cb.checked) {
          selected.push(cb.value);
        }
      });
      techAreaInput.value = selected.join(', ');
      areaModal.classList.remove('active');
    });
  }
  const btnOpenProjModal = document.getElementById('btn-open-project-modal');
  if (btnOpenProjModal) {
    btnOpenProjModal.addEventListener('click', () => {
      document.getElementById('project-form').reset();
      document.getElementById('proj-id').value = '';
      document.getElementById('proj-folder-id').value = currentFolderId || '';
      if (kmzLabel) {
        kmzLabel.textContent = "Selecionar mapa do Google Earth (.kmz, .kml)...";
        kmzLabel.style.color = "var(--text-muted)";
      }
      if (pdfLabel) {
        pdfLabel.textContent = "Selecionar arquivos técnicos (.pdf, .docx, .xlsx, .txt, .png)...";
        pdfLabel.style.color = "var(--text-muted)";
      }
      document.getElementById('project-modal-title').textContent = 'Cadastrar Projeto de Rede';
      document.getElementById('project-modal').classList.add('active');
    });
  }
  const btnSendModalWa = document.getElementById('btn-send-tech-whatsapp');
  if (btnSendModalWa) {
    btnSendModalWa.addEventListener('click', () => {
      const nome = document.getElementById('tech-name').value.trim() || 'N/A';
      const cpf = document.getElementById('tech-cpf').value.trim() || 'N/A';
      const identidade = document.getElementById('tech-identity').value.trim() || 'N/A';
      const telefone = document.getElementById('tech-phone').value.trim() || 'N/A';
      const text = `*CADASTRO DE TÉCNICO - CLARO REDE EXTERNA*\n\n` +
                   `*Nome:* ${nome}\n` +
                   `*CPF:* ${cpf}\n` +
                   `*Identidade:* ${identidade}\n` +
                   `*Telefone:* ${telefone}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    });
  }
  const btnSendVehicleWa = document.getElementById('btn-send-vehicle-whatsapp');
  if (btnSendVehicleWa) {
    btnSendVehicleWa.addEventListener('click', () => {
      const placa = document.getElementById('vehicle-plate').value.trim() || 'N/A';
      const modelo = document.getElementById('vehicle-model').value.trim() || 'N/A';
      const respSelect = document.getElementById('vehicle-responsible');
      let responsavel = 'N/A';
      if (respSelect && respSelect.selectedIndex >= 0) {
        responsavel = respSelect.options[respSelect.selectedIndex].text || 'N/A';
        if (responsavel.includes('Selecione') || responsavel.includes('Sem responsável')) responsavel = 'N/A';
      }
      if (responsavel === 'N/A') {
        const condutor = document.getElementById('vehicle-condutor-dia').value.trim();
        if (condutor) responsavel = condutor;
      }
      const ticket = document.getElementById('vehicle-ticket-car').value.trim() || 'N/A';
      const text = `*CADASTRO DE VEÍCULO - CLARO REDE EXTERNA*\n\n` +
                   `*Placa:* ${placa}\n` +
                   `*Modelo:* ${modelo}\n` +
                   `*Responsável:* ${responsavel}\n` +
                   `*Número do Ticket:* ${ticket}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    });
  }
  const btnOpenUserModal = document.getElementById('btn-open-user-modal');
  if (btnOpenUserModal) {
    btnOpenUserModal.addEventListener('click', () => {
      if (!isCoordenador()) {
        showToast('Você não tem permissão para isso', 'error', 3000);
        return;
      }
      document.getElementById('user-form').reset();
      document.getElementById('user-id').value = '';
      document.getElementById('user-username').disabled = false;
      document.getElementById('user-password').required = false;
      document.getElementById('password-group').style.display = 'none';
      document.getElementById('user-modal-title').textContent = 'Criar Novo Usuário';
      loadTechniciansForUserSelect();
      document.getElementById('user-modal').classList.add('active');
    });
  }
  const userTechSelect = document.getElementById('user-tech-id');
  if (userTechSelect) {
    userTechSelect.addEventListener('change', function() {
      const selectedOpt = this.options[this.selectedIndex];
      if (selectedOpt && selectedOpt.value) {
        const name = selectedOpt.getAttribute('data-name') || '';
        const role = selectedOpt.getAttribute('data-role') || '';
        const usernameInput = document.getElementById('user-username');
        const roleSelect = document.getElementById('user-role');
        if (name && usernameInput && !usernameInput.disabled) {
          const cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).join('.');
          usernameInput.value = cleanName;
        }
        if (role && roleSelect) {
          if (['Coordenador', 'Supervisor', 'Técnico', 'Auxiliar'].includes(role)) {
            roleSelect.value = role;
          }
        }
      }
    });
  }
  const techSearch = document.getElementById('tech-search');
  if (techSearch) techSearch.addEventListener('input', loadTechnicians);
  const vehicleSearch = document.getElementById('vehicle-search');
  if (vehicleSearch) vehicleSearch.addEventListener('input', loadVehicles);
  const logSearch = document.getElementById('log-user-search');
  if (logSearch) logSearch.addEventListener('input', loadLogs);
  const projectSearch = document.getElementById('project-search');
  if (projectSearch) projectSearch.addEventListener('input', loadFoldersAndProjects);
  const techForm = document.getElementById('tech-form');
  if (techForm) {
    techForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const techId = document.getElementById('tech-id').value;
      const formData = new FormData(techForm);
      const url = techId ? `/api/technicians/${techId}` : '/api/technicians';
      fetch(url, {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(techId ? "Cadastro de técnico atualizado." : "Técnico cadastrado com sucesso!", 'success');
          document.getElementById('tech-modal').classList.remove('active');
          loadTechnicians();
        }
      })
      .catch(err => {
        console.error("Error submitting tech form:", err);
        showToast("Falha na comunicação com o servidor.", 'error');
      });
    });
  }
  const vehicleForm = document.getElementById('vehicle-form');
  if (vehicleForm) {
    vehicleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const vId = document.getElementById('vehicle-id').value;
      const payload = {
        plate: document.getElementById('vehicle-plate').value.trim(),
        model: document.getElementById('vehicle-model').value.trim(),
        responsible_tech_id: document.getElementById('vehicle-responsible').value || null,
        type: document.getElementById('vehicle-type').value,
        has_rack: document.getElementById('vehicle-rack').checked,
        has_basket: document.getElementById('vehicle-basket').checked,
        has_giroflex: document.getElementById('vehicle-giroflex').checked,
        has_inverter: document.getElementById('vehicle-inverter').checked,
        ticket_car: document.getElementById('vehicle-ticket-car').value.trim(),
        subclus: document.getElementById('vehicle-subclus').value,
        area_rede: document.getElementById('vehicle-area-rede').value.trim(),
        base: document.getElementById('vehicle-base').value.trim(),
        setor: document.getElementById('vehicle-setor').value.trim(),
        condutor_dia: document.getElementById('vehicle-condutor-dia').value.trim(),
        condutor_tarde: document.getElementById('vehicle-condutor-tarde').value.trim(),
        condutor_madrugada: document.getElementById('vehicle-condutor-madrugada').value.trim()
      };
      const url = vId ? `/api/vehicles/${vId}` : '/api/vehicles';
      const method = vId ? 'PUT' : 'POST';
      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(vId ? "Cadastro do veículo atualizado." : "Veículo adicionado com sucesso!", 'success');
          document.getElementById('vehicle-modal').classList.remove('active');
          loadVehicles();
        }
      })
      .catch(err => {
        console.error("Error submitting vehicle form:", err);
        showToast("Falha de conexão com o servidor.", 'error');
      });
    });
  }
  const finTeamForm = document.getElementById('fin-team-form');
  if (finTeamForm) {
    finTeamForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const recId = document.getElementById('fin-team-record-id').value;
      const payload = {
        tech1_id: document.getElementById('fin-team-tech1').value,
        tech2_id: document.getElementById('fin-team-tech2').value,
        area: document.getElementById('fin-team-area').value,
        reference_month: document.getElementById('fin-team-month').value, 
        amount: parseFloat(document.getElementById('fin-team-amount').value || 0.0)
      };
      const url = recId ? `/api/finance/teams/${recId}` : '/api/finance/teams';
      const method = recId ? 'PUT' : 'POST';
      fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(recId ? "Faturamento de equipe atualizado com sucesso." : "Faturamento de equipe registrado com sucesso.", 'success');
          document.getElementById('fin-team-modal').classList.remove('active');
          loadFinancialTab();
        }
      })
      .catch(err => {
        console.error("Error submitting team finance:", err);
        showToast("Erro ao contatar servidor.", 'error');
      });
    });
  }
  const finConsumableForm = document.getElementById('fin-consumable-form');
  if (finConsumableForm) {
    finConsumableForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const recId = document.getElementById('fin-consumable-record-id').value;
      const payload = {
        description: document.getElementById('fin-consumable-desc').value.trim(),
        area: document.getElementById('fin-consumable-area').value,
        reference_month: document.getElementById('fin-consumable-month').value, 
        amount: parseFloat(document.getElementById('fin-consumable-amount').value || 0.0)
      };
      const url = recId ? `/api/finance/consumables/${recId}` : '/api/finance/consumables';
      const method = recId ? 'PUT' : 'POST';
      fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(recId ? "Custo de consumível atualizado com sucesso." : "Custo de consumível registrado com sucesso.", 'success');
          document.getElementById('fin-consumable-modal').classList.remove('active');
          loadFinancialTab();
        }
      })
      .catch(err => {
        console.error("Error submitting consumable finance:", err);
        showToast("Erro ao contatar servidor.", 'error');
      });
    });
  }
  const btnExportFinance = document.getElementById('btn-export-finance');
  if (btnExportFinance) {
    btnExportFinance.addEventListener('click', () => {
      window.location.href = '/api/finance/export';
    });
  }
  const folderForm = document.getElementById('folder-form');
  if (folderForm) {
    folderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('folder-name').value.trim(),
        parent_id: currentFolderId
      };
      fetch('/api/folders', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast("Pasta criada com sucesso.", 'success');
          document.getElementById('folder-modal').classList.remove('active');
          loadFoldersAndProjects();
        }
      })
      .catch(err => console.error("Error creating folder:", err));
    });
  }
  const projectForm = document.getElementById('project-form');
  if (projectForm) {
    projectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const projId = document.getElementById('proj-id').value;
      const formData = new FormData(projectForm);
      const url = projId ? `/api/projects/${projId}` : '/api/projects';
      fetch(url, {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(projId ? "Projeto atualizado com sucesso." : "Projeto criado com sucesso!", 'success');
          document.getElementById('project-modal').classList.remove('active');
          loadFoldersAndProjects();
        }
      })
      .catch(err => {
        console.error("Error submitting project:", err);
        showToast("Erro ao contatar o servidor.", 'error');
      });
    });
  }
  const inventoryForm = document.getElementById('inventory-form');
  if (inventoryForm) {
    inventoryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const itemId = document.getElementById('inventory-id').value;
      const payload = {
        category: document.getElementById('inventory-category').value,
        name: document.getElementById('inventory-name').value.trim(),
        quantity: parseInt(document.getElementById('inventory-quantity').value || 0),
        serial_number: document.getElementById('inventory-serial').value.trim(),
        description: document.getElementById('inventory-description').value.trim()
      };
      const url = itemId ? `/api/inventory/${itemId}` : '/api/inventory';
      const method = itemId ? 'PUT' : 'POST';
      fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast("Item do estoque salvo com sucesso.", 'success');
          document.getElementById('inventory-modal').classList.remove('active');
          loadInventory(activeInventoryCategory);
        }
      })
      .catch(err => console.error("Error submitting inventory item:", err));
    });
  }
  const userForm = document.getElementById('user-form');
  if (userForm) {
    userForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!isCoordenador()) {
        showToast('Você não tem permissão para isso', 'error', 3000);
        return;
      }
      const uId = document.getElementById('user-id').value;
      const techId = document.getElementById('user-tech-id').value;
      const username = document.getElementById('user-username').value.trim().toLowerCase();
      const role = document.getElementById('user-role').value;
      const password = document.getElementById('user-password').value;
      if (!techId) {
        showToast("É obrigatório selecionar uma pessoa cadastrada em #pessoas.", "error");
        return;
      }
      if (!username) {
        showToast("O nome de usuário (login) é obrigatório.", "error");
        return;
      }
      const payload = { 
        username: username, 
        role: role, 
        tech_id: techId 
      };
      if (password) {
        payload.password = password;
      }
      const url = uId ? `/api/users/${uId}` : '/api/users';
      const method = uId ? 'PUT' : 'POST';
      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
        } else {
          showToast(uId ? "Conta de usuário atualizada com sucesso!" : "Usuário criado com sucesso!", 'success');
          document.getElementById('user-modal').classList.remove('active');
          loadUsers();
        }
      })
      .catch(err => {
        console.error("Error submitting user form:", err);
        showToast("Falha de conexão com o servidor.", 'error');
      });
    });
  }
  loadFavorites();
}
function loadTechnicians() {
  const searchVal = document.getElementById('tech-search').value.trim();
  const tableBody = document.getElementById('techs-table-body');
  if (!tableBody) return;
  const url = searchVal ? `/api/technicians?search=${encodeURIComponent(searchVal)}` : '/api/technicians';
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-error">Erro ao carregar dados: ${data.error}</td></tr>`;
        return;
      }
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Nenhum técnico localizado.</td></tr>`;
        return;
      }
      window.loadedTechniciansData = data;
      tableBody.innerHTML = data.map(t => {
        let details = [];
        if (t.registration_claro) details.push(`Matricula Claro: <strong>${escapeHtml(t.registration_claro)}</strong>`);
        if (t.registration_third) details.push(`Matricula Terceiro: <strong>${escapeHtml(t.registration_third)}</strong>`);
        if (t.toa_login) details.push(`Login TOA: <strong>${escapeHtml(t.toa_login)}</strong>`);
        if (t.phone_model) details.push(`Modelo Telefone: ${escapeHtml(t.phone_model)}`);
        if (t.imei_1) details.push(`IMEI 1 Telefone: ${escapeHtml(t.imei_1)}`);
        if (t.imei_2) details.push(`IMEI 2 Telefone: ${escapeHtml(t.imei_2)}`);
        const detailsHtml = details.length > 0 ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">${details.join(' | ')}</div>` : '';
        return `
          <tr>
            <td>
              <div><strong>${escapeHtml(t.name)}</strong></div>
              ${detailsHtml}
            </td>
            <td>${t.cpf}</td>
            <td><span style="font-size:0.8rem; font-weight:700; color:#ecc94b;">${escapeHtml(t.company || 'FFA')}</span></td>
            <td>
              <div>${escapeHtml(t.phone || 'N/A')}</div>
              ${t.email ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(t.email)}</div>` : ''}
            </td>
            <td><span style="font-weight:700; color:var(--primary); font-size: 0.85rem;">${t.role}</span></td>
            <td>${escapeHtml(t.area || 'N/A')}</td>
            <td><span class="text-muted" style="font-size:0.8rem;">Camisa: ${t.shirt_size || '-'} | Bota: ${t.boot_size || '-'}</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn" onclick="copyTechnicianWhatsapp(${t.id})" title="Copiar no Formato do WhatsApp (Zap)" style="background: rgba(37, 211, 102, 0.12); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.3); font-weight: 700; gap: 4px; padding: 4px 8px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span style="font-size: 0.72rem;">Zap</span>
                </button>
                <button class="action-btn" onclick="sendTechnicianWhatsapp(${t.id})" title="Abrir Conversa Direta no WhatsApp" style="background: rgba(37, 211, 102, 0.15); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.3);">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button class="action-btn edit-btn" onclick="editTechnician(${t.id})" title="Editar Técnico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteTechnician(${t.id})" title="Excluir Técnico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => {
      console.error("Error fetching techs:", err);
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-error">Erro crítico de comunicação.</td></tr>`;
    });
}

window.copyTechnicianWhatsapp = function(techId) {
  const techs = window.loadedTechniciansData || [];
  const t = techs.find(item => item.id === techId);
  if (!t) return;
  
  let lines = [
    `*DADOS DO COLABORADOR - CLARO REDE EXTERNA*`,
    ``,
    `👤 *Nome:* ${t.name || 'N/A'}`,
    `🆔 *CPF:* ${t.cpf || 'N/A'}`,
    `🪪 *RG / Identidade:* ${t.identity || 'N/A'}`,
    `📞 *Telefone:* ${t.phone || 'N/A'}`,
    `🏢 *Empresa:* ${t.company || 'FFA'}`,
    `💼 *Cargo:* ${t.role || 'Técnico'}`,
    `📍 *Área de Atuação:* ${t.area || 'N/A'}`
  ];
  
  if (t.registration_claro) lines.push(`🏷️ *Matrícula Claro:* ${t.registration_claro}`);
  if (t.registration_third) lines.push(`🏷️ *Matrícula Terceiro:* ${t.registration_third}`);
  if (t.toa_login) lines.push(`🔑 *Login TOA:* ${t.toa_login}`);
  if (t.phone_model) lines.push(`📱 *Modelo Telefone:* ${t.phone_model}`);
  if (t.imei_1) lines.push(`🔢 *IMEI 1:* ${t.imei_1}`);
  if (t.imei_2) lines.push(`🔢 *IMEI 2:* ${t.imei_2}`);
  if (t.email) lines.push(`✉️ *E-mail:* ${t.email}`);
  if (t.shirt_size || t.boot_size) lines.push(`👕 *Uniforme:* Camisa ${t.shirt_size || '-'} | Bota ${t.boot_size || '-'}`);

  const fullText = lines.join('\n');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(fullText).then(() => {
      showToast('Dados copiados no formato do WhatsApp com sucesso!', 'success');
    }).catch(() => fallbackCopyText(fullText));
  } else {
    fallbackCopyText(fullText);
  }
};

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-999999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Dados copiados no formato do WhatsApp!', 'success');
  } catch (err) {
    showToast('Não foi possível copiar automaticamente.', 'error');
  }
  document.body.removeChild(ta);
}

window.sendTechnicianWhatsapp = function(techId) {
  const techs = window.loadedTechniciansData || [];
  const t = techs.find(item => item.id === techId);
  if (!t) return;
  const nome = t.name || 'N/A';
  const cpf = t.cpf || 'N/A';
  const identidade = t.identity || 'N/A';
  const telefone = t.phone || 'N/A';
  const text = `*CADASTRO DE TÉCNICO - CLARO REDE EXTERNA*\n\n` +
               `*Nome:* ${nome}\n` +
               `*CPF:* ${cpf}\n` +
               `*Identidade:* ${identidade}\n` +
               `*Telefone:* ${telefone}`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
};
window.editTechnician = function(techId) {
  fetch('/api/technicians')
    .then(res => res.json())
    .then(data => {
      const t = data.find(item => item.id === techId);
      if (!t) return;
      document.getElementById('tech-id').value = t.id;
      document.getElementById('tech-name').value = t.name;
      document.getElementById('tech-cpf').value = t.cpf;
      document.getElementById('tech-phone').value = t.phone || '';
      document.getElementById('tech-identity').value = t.identity || '';
      document.getElementById('tech-dob').value = t.dob;
      document.getElementById('tech-role').value = t.role;
      document.getElementById('tech-area').value = t.area || '';
      document.getElementById('tech-team-type').value = t.team_type || '';
      document.getElementById('tech-shirt').value = t.shirt_size || '';
      document.getElementById('tech-boot').value = t.boot_size || '';
      document.getElementById('tech-pants').value = t.pants_size || '';
      document.getElementById('tech-jacket').value = t.jacket_size || '';
      document.getElementById('tech-team').value = t.team || '';
      document.getElementById('tech-company').value = t.company || '';
      document.getElementById('tech-reg-claro').value = t.registration_claro || '';
      document.getElementById('tech-reg-third').value = t.registration_third || '';
      document.getElementById('tech-toa-login').value = t.toa_login || '';
      document.getElementById('tech-phone-model').value = t.phone_model || '';
      document.getElementById('tech-imei1').value = t.imei_1 || '';
      document.getElementById('tech-imei2').value = t.imei_2 || '';
      document.getElementById('tech-email').value = t.email || '';
      document.getElementById('tech-modal-title').textContent = `Editar Técnico #${t.id}`;
      document.getElementById('tech-modal').classList.add('active');
    })
    .catch(err => console.error("Error loading technician for edit:", err));
};
window.deleteTechnician = function(techId) {
  if (confirm("Tem certeza de que deseja excluir permanentemente o cadastro deste técnico?")) {
    fetch(`/api/technicians/${techId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Técnico removido com sucesso.", 'success');
        loadTechnicians();
      }
    })
    .catch(err => {
      console.error("Error deleting tech:", err);
      showToast("Falha de conexão com o servidor.", 'error');
    });
  }
};
function loadVehicles() {
  const searchVal = document.getElementById('vehicle-search').value.trim();
  const tableBody = document.getElementById('vehicles-table-body');
  if (!tableBody) return;
  const url = searchVal ? `/api/vehicles?search=${encodeURIComponent(searchVal)}` : '/api/vehicles';
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="11" class="text-center text-error">Erro: ${data.error}</td></tr>`;
        return;
      }
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="11" class="text-center text-muted">Nenhum veículo localizado na frota.</td></tr>`;
        return;
      }
      window.loadedVehiclesData = data;
      tableBody.innerHTML = data.map(v => {
        let attribs = '';
        if (v.has_rack) {
          attribs += `
            <span class="attrib-icon-wrapper" title="Rack de Teto" style="margin-right: 4px; display: inline-flex; align-items: center; padding: 3px 6px; background: rgba(255,255,255,0.06); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; color: #a0aec0;"><line x1="8" y1="2" x2="8" y2="22"></line><line x1="16" y1="2" x2="16" y2="22"></line><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="16" y2="18"></line></svg>
            </span>`;
        }
        if (v.has_basket) {
          attribs += `
            <span class="attrib-icon-wrapper" title="Cesto Aéreo" style="margin-right: 4px; display: inline-flex; align-items: center; padding: 3px 6px; background: rgba(59,130,246,0.12); border-radius: 4px; border: 1px solid rgba(59,130,246,0.25);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; color: #60a5fa;"><rect x="4" y="8" width="16" height="12" rx="2"></rect><path d="M9 8V4h6v4"></path></svg>
            </span>`;
        }
        if (v.has_giroflex) {
          attribs += `
            <span class="attrib-icon-wrapper" title="Giroflex/Strobo" style="margin-right: 4px; display: inline-flex; align-items: center; padding: 3px 6px; background: rgba(239,68,68,0.12); border-radius: 4px; border: 1px solid rgba(239,68,68,0.25);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; color: #f87171;"><path d="M12 2v3M5.22 5.22l2.12 2.12M18.78 5.22l-2.12 2.12"></path><path d="M19 12a7 7 0 0 0-14 0v6h14v-6z"></path><rect x="3" y="18" width="18" height="3" rx="1"></rect></svg>
            </span>`;
        }
        if (v.has_inverter) {
          attribs += `
            <span class="attrib-icon-wrapper" title="Inversor de Tensão" style="margin-right: 4px; display: inline-flex; align-items: center; padding: 3px 6px; background: rgba(234,179,8,0.12); border-radius: 4px; border: 1px solid rgba(234,179,8,0.25);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; color: #fde047;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </span>`;
        }
        if (!attribs) attribs = '<span class="text-muted" style="font-size: 0.8rem;">-</span>';
        const subclusBg = (v.subclus || '').toUpperCase() === 'RIO CAPITAL' 
          ? 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);' 
          : 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);';
        const setorBg = (v.setor || '').toUpperCase().includes('CORRETIVO')
          ? 'background: rgba(220, 38, 38, 0.15); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.3);'
          : 'background: rgba(22, 163, 74, 0.15); color: #4ade80; border: 1px solid rgba(22, 163, 74, 0.3);';
        const formatDriver = (d) => {
          if (!d || d.trim() === 'N/A' || d.trim() === '-') return '<span class="text-muted" style="font-size: 0.76rem;">-</span>';
          return `<span style="font-size: 0.78rem; font-weight: 600; color: #e2e8f0; display: inline-block; max-width: 130px; word-break: break-word;">${escapeHtml(d)}</span>`;
        };
        return `
          <tr>
            <td>
              <span style="display: inline-block; background: #0f172a; border: 1.5px solid #3b82f6; color: #f8fafc; font-weight: 800; font-family: monospace; font-size: 0.85rem; padding: 3px 8px; border-radius: 5px; letter-spacing: 1px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: nowrap;">
                ${escapeHtml(v.plate)}
              </span>
            </td>
            <td>
              <div style="font-weight: 700; color: #ffffff; font-size: 0.88rem; white-space: nowrap;">${escapeHtml(v.model || 'N/A')}</div>
              <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-top: 1px; white-space: nowrap;">${v.type}</div>
            </td>
            <td><span style="display: inline-block; white-space: nowrap; font-size: 0.73rem; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; ${subclusBg}">${escapeHtml(v.subclus || 'N/A')}</span></td>
            <td>
              <div style="font-weight: 700; color: #f1f5f9; font-size: 0.85rem; white-space: nowrap;">${escapeHtml(v.area_rede || 'N/A')}</div>
              <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 500; white-space: nowrap;">${escapeHtml(v.base || 'N/A')}</div>
            </td>
            <td><span style="display: inline-block; white-space: nowrap; font-size: 0.73rem; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; ${setorBg}">${escapeHtml(v.setor || 'N/A')}</span></td>
            <td>${formatDriver(v.condutor_dia)}</td>
            <td>${formatDriver(v.condutor_tarde)}</td>
            <td>${formatDriver(v.condutor_madrugada)}</td>
            <td><div style="display: flex; gap: 2px; align-items: center; flex-wrap: wrap;">${attribs}</div></td>
            <td><span style="font-size: 0.78rem; font-weight: 600; color: #cbd5e1; font-family: monospace;">${escapeHtml(v.ticket_car || '-')}</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn" onclick="sendVehicleWhatsapp(${v.id})" title="Enviar Dados no WhatsApp (Placa, Modelo, Responsável, Ticket Car)" style="background: rgba(37, 211, 102, 0.15); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.3);">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button class="action-btn edit-btn" onclick="editVehicle(${v.id})" title="Editar Veículo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteVehicle(${v.id})" title="Remover Veículo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => {
      console.error("Error loading vehicles:", err);
      tableBody.innerHTML = `<tr><td colspan="11" class="text-center text-error">Erro na conexão.</td></tr>`;
    });
}
window.sendVehicleWhatsapp = function(vId) {
  const vehicles = window.loadedVehiclesData || [];
  const v = vehicles.find(item => item.id === vId);
  if (!v) return;
  const placa = v.plate || 'N/A';
  const modelo = v.model || 'N/A';
  const responsavel = v.responsible_name || v.condutor_dia || 'N/A';
  const ticket = v.ticket_car || 'N/A';
  const text = `*CADASTRO DE VEÍCULO - CLARO REDE EXTERNA*\n\n` +
               `*Placa:* ${placa}\n` +
               `*Modelo:* ${modelo}\n` +
               `*Responsável:* ${responsavel}\n` +
               `*Número do Ticket:* ${ticket}`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
};
window.editVehicle = function(vId) {
  fetch('/api/vehicles')
    .then(res => res.json())
    .then(data => {
      const v = data.find(item => item.id === vId);
      if (!v) return;
      populateResponsibleTechsDropdown(v.responsible_tech_id).then(() => {
        document.getElementById('vehicle-id').value = v.id;
        document.getElementById('vehicle-plate').value = v.plate;
        document.getElementById('vehicle-model').value = v.model || '';
        document.getElementById('vehicle-type').value = v.type;
        document.getElementById('vehicle-rack').checked = v.has_rack;
        document.getElementById('vehicle-basket').checked = v.has_basket;
        document.getElementById('vehicle-giroflex').checked = v.has_giroflex;
        document.getElementById('vehicle-inverter').checked = v.has_inverter;
        document.getElementById('vehicle-ticket-car').value = v.ticket_car || '';
        document.getElementById('vehicle-subclus').value = v.subclus || '';
        document.getElementById('vehicle-area-rede').value = v.area_rede || '';
        document.getElementById('vehicle-base').value = v.base || '';
        document.getElementById('vehicle-setor').value = v.setor || '';
        document.getElementById('vehicle-condutor-dia').value = v.condutor_dia || '';
        document.getElementById('vehicle-condutor-tarde').value = v.condutor_tarde || '';
        document.getElementById('vehicle-condutor-madrugada').value = v.condutor_madrugada || '';
        document.getElementById('vehicle-modal-title').textContent = `Editar Veículo Placa: ${v.plate}`;
        document.getElementById('vehicle-modal').classList.add('active');
      });
    })
    .catch(err => console.error("Error loading vehicle for edit:", err));
};
function populateResponsibleTechsDropdown(selectedId = null) {
  const dropdown = document.getElementById('vehicle-responsible');
  if (!dropdown) return Promise.resolve();
  return fetch('/api/technicians')
    .then(res => res.json())
    .then(data => {
      if (data.error) return;
      dropdown.innerHTML = '<option value="">Sem responsável cadastrado</option>' + 
        data.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.role})</option>`).join('');
      if (selectedId) {
        dropdown.value = selectedId;
      }
    })
    .catch(err => console.error("Error populating tech dropdown:", err));
}
window.deleteVehicle = function(vId) {
  if (confirm("Deseja realmente remover este veículo da frota cadastrada?")) {
    fetch(`/api/vehicles/${vId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Veículo removido da frota.", 'success');
        loadVehicles();
      }
    })
    .catch(err => {
      console.error("Error deleting vehicle:", err);
      showToast("Falha de conexão.", 'error');
    });
  }
};
function loadFinancialTab() {
  if (activeFinanceSubtab === 'fin-teams-subtab') {
    loadFinanceTeams();
  } else {
    loadFinanceConsumables();
  }
}
function loadFinanceTeams() {
  const tableBody = document.getElementById('fin-teams-table-body');
  if (!tableBody) return;
  fetch('/api/finance/teams')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-error">Erro ao carregar dados: ${data.error}</td></tr>`;
        return;
      }
      window.loadedFinanceTeams = data || [];
      let total = 0.0;
      data.forEach(item => total += item.amount);
      document.getElementById('financial-running-total').textContent = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhum faturamento de equipe registrado.</td></tr>`;
        return;
      }
      tableBody.innerHTML = data.map(item => {
        const [year, month] = item.reference_month.split('-');
        const formattedMonth = `${month}/${year}`;
        return `
          <tr style="background: rgba(255,255,255,0.015); border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 16px 16px;"><span style="color: #a1a1aa; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.5px;">${formattedMonth}</span></td>
            <td style="padding: 16px 16px;"><strong style="font-size: 0.95rem; color: #f4f4f5;">${escapeHtml(item.tech1_name || 'N/A')}</strong></td>
            <td style="padding: 16px 16px;"><strong style="font-size: 0.95rem; color: #f4f4f5;">${escapeHtml(item.tech2_name || 'N/A')}</strong></td>
            <td style="padding: 16px 16px;"><span style="background: rgba(238, 44, 36, 0.1); color: var(--primary); padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">${escapeHtml(item.area)}</span></td>
            <td style="padding: 16px 16px;"><strong style="color: #f8fafc; font-size: 1.0rem; font-weight: 700;">R$ ${item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
            <td style="padding: 16px 16px;">
              <div class="action-buttons" style="display: flex; gap: 8px;">
                <button class="action-btn edit-btn" onclick="editFinanceTeam(${item.id})" title="Editar Faturamento" style="background: rgba(255,255,255,0.05); border: none; border-radius: 6px; padding: 6px; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteFinanceTeam(${item.id})" title="Estornar lançamento" style="background: rgba(255,255,255,0.05); border: none; border-radius: 6px; padding: 6px; transition: background 0.2s;" onmouseover="this.style.background='rgba(238,44,36,0.2)'; this.style.color='var(--primary)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color=''">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => console.error("Error loading team finance:", err));
}
function loadFinanceConsumables() {
  const tableBody = document.getElementById('fin-consumables-table-body');
  if (!tableBody) return;
  fetch('/api/finance/consumables')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-error">Erro ao carregar dados: ${data.error}</td></tr>`;
        return;
      }
      window.loadedFinanceConsumables = data || [];
      let total = 0.0;
      data.forEach(item => total += item.amount);
      document.getElementById('financial-running-total').textContent = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Nenhum custo de consumíveis lançado.</td></tr>`;
        return;
      }
      tableBody.innerHTML = data.map(item => {
        const [year, month] = item.reference_month.split('-');
        const formattedMonth = `${month}/${year}`;
        return `
          <tr style="background: rgba(255,255,255,0.015); border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 16px 16px;"><span style="color: #a1a1aa; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.5px;">${formattedMonth}</span></td>
            <td style="padding: 16px 16px;"><strong style="font-size: 0.95rem; color: #f4f4f5;">${escapeHtml(item.description)}</strong></td>
            <td style="padding: 16px 16px;"><span style="background: rgba(238, 44, 36, 0.1); color: var(--primary); padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">${escapeHtml(item.area)}</span></td>
            <td style="padding: 16px 16px;"><strong style="color: #f8fafc; font-size: 1.0rem; font-weight: 700;">R$ ${item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
            <td style="padding: 16px 16px;">
              <div class="action-buttons" style="display: flex; gap: 8px;">
                <button class="action-btn edit-btn" onclick="editFinanceConsumable(${item.id})" title="Editar Consumível" style="background: rgba(255,255,255,0.05); border: none; border-radius: 6px; padding: 6px; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteFinanceConsumable(${item.id})" title="Estornar lançamento" style="background: rgba(255,255,255,0.05); border: none; border-radius: 6px; padding: 6px; transition: background 0.2s;" onmouseover="this.style.background='rgba(238,44,36,0.2)'; this.style.color='var(--primary)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color=''">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => console.error("Error loading consumable finance:", err));
}
function populateFinTeamTechsDropdowns() {
  const select1 = document.getElementById('fin-team-tech1');
  const select2 = document.getElementById('fin-team-tech2');
  if (!select1 || !select2) return;
  return fetch('/api/technicians')
    .then(res => res.json())
    .then(data => {
      const optionsHtml = '<option value="">Selecione o colaborador...</option>' +
        data.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.role})</option>`).join('');
      select1.innerHTML = optionsHtml;
      select2.innerHTML = optionsHtml;
    })
    .catch(err => console.error("Error populating team techs:", err));
}
window.editFinanceTeam = function(recordId) {
  const item = (window.loadedFinanceTeams || []).find(i => i.id === recordId);
  if (!item) return;
  populateFinTeamTechsDropdowns().then(() => {
    document.getElementById('fin-team-record-id').value = item.id;
    document.getElementById('fin-team-tech1').value = item.tech1_id;
    document.getElementById('fin-team-tech2').value = item.tech2_id;
    document.getElementById('fin-team-area').value = item.area;
    document.getElementById('fin-team-month').value = item.reference_month;
    document.getElementById('fin-team-amount').value = item.amount;
    const titleEl = document.getElementById('fin-team-modal-title');
    if (titleEl) titleEl.textContent = 'Editar Faturamento da Equipe';
    const btnSub = document.getElementById('btn-submit-fin-team');
    if (btnSub) btnSub.textContent = 'Salvar Alterações';
    document.getElementById('fin-team-modal').classList.add('active');
  });
};
window.editFinanceConsumable = function(recordId) {
  const item = (window.loadedFinanceConsumables || []).find(i => i.id === recordId);
  if (!item) return;
  document.getElementById('fin-consumable-record-id').value = item.id;
  document.getElementById('fin-consumable-desc').value = item.description;
  document.getElementById('fin-consumable-area').value = item.area;
  document.getElementById('fin-consumable-month').value = item.reference_month;
  document.getElementById('fin-consumable-amount').value = item.amount;
  const titleEl = document.getElementById('fin-consumable-modal-title');
  if (titleEl) titleEl.textContent = 'Editar Custo de Consumível';
  const btnSub = document.getElementById('btn-submit-fin-consumable');
  if (btnSub) btnSub.textContent = 'Salvar Alterações';
  document.getElementById('fin-consumable-modal').classList.add('active');
};
window.deleteFinanceTeam = function(recordId) {
  if (confirm("Deseja realmente estornar este faturamento de equipe permanentemente?")) {
    fetch(`/api/finance/teams/${recordId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Registro de faturamento estornado.", 'success');
        loadFinanceTeams();
      }
    })
    .catch(err => console.error("Error deleting finance team log:", err));
  }
};
window.deleteFinanceConsumable = function(recordId) {
  if (confirm("Deseja realmente estornar este custo de consumível?")) {
    fetch(`/api/finance/consumables/${recordId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Registro de consumível estornado.", 'success');
        loadFinanceConsumables();
      }
    })
    .catch(err => console.error("Error deleting finance consumable log:", err));
  }
};
function loadInventory(category) {
  const tableBody = document.getElementById('inventory-table-body');
  if (!tableBody) return;
  fetch(`/api/inventory?category=${encodeURIComponent(category)}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-error">Erro ao carregar dados: ${data.error}</td></tr>`;
        return;
      }
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 60px 20px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.05)); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 24px; transform: rotate(-5deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.1);">
            <div style="transform: rotate(5deg);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 34px; height: 34px;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
          </div>
          <h4 style="color: #ffffff; font-weight: 800; font-size: 1.2rem; margin-bottom: 8px;">Estoque Vazio</h4>
          <p style="color: #94a3b8; font-size: 0.95rem; max-width: 400px; margin: 0 auto;">Nenhum item cadastrado nesta categoria no momento. Adicione novos itens clicando no botão acima.</p>
        </td></tr>`;
        return;
      }
      tableBody.innerHTML = data.map(item => {
        return `
          <tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td><span style="font-weight: 800; font-size: 1.1rem; color: #ffffff;">${item.quantity}</span></td>
            <td><span class="text-muted" style="font-family: monospace; font-size: 0.82rem;">${escapeHtml(item.serial_number || 'N/A')}</span></td>
            <td>${escapeHtml(item.description || 'N/A')}</td>
            <td>
              <div class="action-buttons">
                <button class="action-btn edit-btn" onclick="editInventory(${item.id})" title="Editar Item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteInventory(${item.id})" title="Remover do Estoque">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => console.error("Error loading inventory:", err));
}
window.editInventory = function(itemId) {
  fetch(`/api/inventory?category=${encodeURIComponent(activeInventoryCategory)}`)
    .then(res => res.json())
    .then(data => {
      const item = data.find(i => i.id === itemId);
      if (!item) return;
      document.getElementById('inventory-id').value = item.id;
      document.getElementById('inventory-category').value = item.category;
      document.getElementById('inventory-name').value = item.name;
      document.getElementById('inventory-quantity').value = item.quantity;
      document.getElementById('inventory-serial').value = item.serial_number || '';
      document.getElementById('inventory-description').value = item.description || '';
      document.getElementById('inventory-modal-title').textContent = `Editar Item: ${item.category}`;
      document.getElementById('inventory-modal').classList.add('active');
    })
    .catch(err => console.error("Error loading inventory item:", err));
};
window.deleteInventory = function(itemId) {
  if (confirm("Tem certeza de que deseja remover este item do estoque?")) {
    fetch(`/api/inventory/${itemId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Item removido do estoque.", 'success');
        loadInventory(activeInventoryCategory);
      }
    })
    .catch(err => console.error("Error deleting inventory item:", err));
  }
};
function renderFilesHtml(pathsString, type) {
  if (!pathsString) return `<span class="text-muted">${type === 'kmz' ? 'Nenhum Mapa' : 'Sem Documento'}</span>`;
  const paths = pathsString.split(';').filter(p => p.trim() !== '');
  if (paths.length === 0) return `<span class="text-muted">${type === 'kmz' ? 'Nenhum Mapa' : 'Sem Documento'}</span>`;
  return `<div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">` + 
    paths.map((p, idx) => {
      const parts = p.split('/');
      const filename = parts[parts.length - 1];
      let displayName = filename;
      const match = filename.match(/^(?:map|doc|proj)_\d+_\d+_(.+)$/) || filename.match(/^(?:map|doc|proj)_\d+_(.+)$/);
      if (match) {
        displayName = match[1];
      }
      if (displayName.length > 25) {
        displayName = displayName.substring(0, 22) + '...';
      }
      const iconSvg = type === 'kmz'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px; vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      return `
        <a href="/uploads/${p}" class="doc-link" target="_blank" download title="Baixar ${escapeHtml(displayName)}" style="display: inline-flex; align-items: center; padding: 4px 8px; font-size: 0.78rem; background: rgba(255,255,255,0.04); border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); color: #ffffff; text-decoration: none; transition: all 0.2s; white-space: nowrap;">
          ${iconSvg}
          <span>${escapeHtml(displayName)}</span>
        </a>
      `;
    }).join('') + `</div>`;
}
function loadFoldersAndProjects() {
  const searchInput = document.getElementById('project-search');
  const searchVal = searchInput ? searchInput.value.trim() : '';
  const tableBody = document.getElementById('projects-table-body');
  if (!tableBody) return;
  renderBreadcrumbs();
  const url = searchVal 
    ? `/api/projects?search=${encodeURIComponent(searchVal)}` 
    : `/api/folders?parent_id=${currentFolderId || ''}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-error">Erro ao carregar dados.</td></tr>`;
        return;
      }
      let folders = [];
      let projects = [];
      if (Array.isArray(data)) {
        projects = data;
      } else {
        folders = data.folders || [];
        projects = data.projects || [];
      }
      window.loadedProjects = projects;
      let html = '';
      if (currentFolderId !== null && !searchVal) {
        html += `
          <tr style="cursor: pointer; background: rgba(255,255,255,0.01);" onclick="goUpFolder()">
            <td colspan="6" style="padding: 14px 20px;">
              <span style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 16px; height: 16px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Voltar para pasta anterior (..)
              </span>
            </td>
          </tr>
        `;
      }
      folders.forEach(f => {
        const fileCount = f.file_count || 0;
        const folderCount = f.folder_count || 0;
        const fileText = fileCount === 1 ? '1 arquivo' : `${fileCount} arquivos`;
        const folderText = folderCount === 1 ? '1 pasta' : `${folderCount} pastas`;
        const badgesHtml = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: rgba(255, 149, 0, 0.12); color: #ffab2e; font-weight: 700; padding: 3px 10px; border-radius: 12px; font-size: 0.74rem; border: 1px solid rgba(255, 149, 0, 0.25); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;" title="Total de ${fileCount} arquivo(s) nesta pasta e subpastas">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              ${fileText}
            </span>
            ${folderCount > 0 ? `
            <span style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; font-weight: 700; padding: 3px 10px; border-radius: 12px; font-size: 0.74rem; border: 1px solid rgba(59, 130, 246, 0.25); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;" title="Total de ${folderCount} subpasta(s) contidas dentro desta pasta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              ${folderText}
            </span>` : ''}
          </div>
        `;
        html += `
          <tr style="background: rgba(255, 149, 0, 0.02); border-left: 3px solid #ff9500; transition: background 0.2s ease;">
            <td style="cursor: pointer; padding: 14px 16px;" onclick="enterFolder(${f.id}, '${escapeHtml(f.name)}')">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <span style="display: inline-flex; align-items: center; gap: 10px; font-weight: 700; color: #ffffff; font-size: 0.93rem;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px; color: #ff9500; filter: drop-shadow(0 2px 4px rgba(255,149,0,0.25));"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  ${escapeHtml(f.name)}
                </span>
                ${badgesHtml}
              </div>
            </td>
            <td><span class="text-muted" style="font-size: 0.85rem;">Pasta de Projetos</span></td>
            <td><span class="text-muted">-</span></td>
            <td><span class="text-muted">-</span></td>
            <td><span class="text-muted">-</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn edit-btn" onclick="openEditFolderModal(${f.id}, '${escapeHtml(f.name)}')" title="Editar Nome da Pasta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteFolder(${f.id})" title="Excluir Pasta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      projects.forEach(p => {
        const kmzHtml = renderFilesHtml(p.kmz_path, 'kmz');
        const pdfHtml = renderFilesHtml(p.pdf_path, 'pdf');
        html += `
          <tr>
            <td>
              <span style="display: inline-flex; align-items: center; gap: 10px; font-weight: 600;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; color: var(--primary);"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <strong>${escapeHtml(p.name)}</strong>
              </span>
            </td>
            <td><span class="text-muted">${escapeHtml(p.description || 'N/A')}</span></td>
            <td><span style="font-size:0.8rem; font-weight:700; color:var(--primary);">${escapeHtml(p.area || 'N/A')}</span></td>
            <td>${kmzHtml}</td>
            <td>${pdfHtml}</td>
            <td>
              <div class="action-buttons">
                <button class="action-btn" onclick="shareProject(${p.id})" title="Encaminhar via WhatsApp" style="color: #25D366; background: rgba(37, 211, 102, 0.05); border: 1px solid rgba(37, 211, 102, 0.15);">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button class="action-btn edit-btn" onclick="editProject(${p.id})" title="Editar Projeto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn delete-btn" onclick="deleteProject(${p.id})" title="Deletar Projeto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      if (folders.length === 0 && projects.length === 0) {
        html = `<tr><td colspan="6" class="text-center text-muted">Esta pasta está vazia. Crie projetos ou subpastas para organizar.</td></tr>`;
      }
      tableBody.innerHTML = html;
    })
    .catch(err => {
      console.error("Error loading files/folders:", err);
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-error">Erro crítico de comunicação.</td></tr>`;
    });
}
window.enterFolder = function(folderId, name) {
  currentFolderId = folderId;
  folderStack.push({ id: folderId, name: name });
  loadFoldersAndProjects();
};
window.goUpFolder = function() {
  folderStack.pop();
  currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : null;
  loadFoldersAndProjects();
};
window.navigateToBreadcrumb = function(index) {
  if (index === -1) {
    currentFolderId = null;
    folderStack = [];
  } else {
    folderStack = folderStack.slice(0, index + 1);
    currentFolderId = folderStack[folderStack.length - 1].id;
  }
  loadFoldersAndProjects();
};
function renderBreadcrumbs() {
  const container = document.getElementById('project-breadcrumbs');
  if (!container) return;
  let html = `<span style="cursor: pointer; color: var(--primary); font-weight: 700;" onclick="navigateToBreadcrumb(-1)">Raiz</span>`;
  folderStack.forEach((f, idx) => {
    html += ` <span style="color: var(--text-muted)">/</span> <span style="cursor: pointer; color: #ffffff;" onclick="navigateToBreadcrumb(${idx})">${escapeHtml(f.name)}</span>`;
  });
  container.innerHTML = html;
}
window.deleteFolder = function(folderId) {
  if (confirm("Aviso: Deletar esta pasta removerá permanentemente TODOS os subprojetos e subpastas nela contidos. Deseja prosseguir?")) {
    fetch(`/api/folders/${folderId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Pasta excluída com sucesso.", 'success');
        loadFoldersAndProjects();
      }
    })
    .catch(err => console.error("Error deleting folder:", err));
  }
};
window.openEditFolderModal = function(folderId, currentName) {
  const newName = prompt("Editar nome da pasta:", currentName);
  if (!newName || !newName.trim()) return;
  fetch(`/api/folders/${folderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim() })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(`Erro: ${data.error}`, 'error');
    } else {
      showToast("Pasta renomeada com sucesso!", 'success');
      loadFoldersAndProjects();
    }
  })
  .catch(err => console.error("Error updating folder:", err));
};
window.editProject = function(pId) {
  let p = (window.loadedProjects || []).find(item => item.id == pId);
  if (!p) {
    fetch('/api/projects')
      .then(res => res.json())
      .then(projects => {
        const list = Array.isArray(projects) ? projects : (projects.projects || []);
        p = list.find(item => item.id == pId);
        if (p) populateProjectForm(p);
      })
      .catch(err => console.error("Error loading project detail:", err));
    return;
  }
  populateProjectForm(p);
};
function populateProjectForm(p) {
  document.getElementById('project-form').reset();
  document.getElementById('proj-id').value = p.id;
  document.getElementById('proj-folder-id').value = p.folder_id || '';
  document.getElementById('proj-name').value = p.name;
  document.getElementById('proj-desc').value = p.description || '';
  document.getElementById('proj-area').value = p.area || '';
  const kmzLabel = document.getElementById('kmz-file-label');
  const pdfLabel = document.getElementById('pdf-file-label');
  if (kmzLabel) {
    kmzLabel.textContent = p.kmz_path ? "Manter mapas existentes ou enviar mais..." : "Selecionar mapa do Google Earth (.kmz, .kml)...";
    kmzLabel.style.color = p.kmz_path ? "#ecc94b" : "var(--text-muted)";
  }
  if (pdfLabel) {
    pdfLabel.textContent = p.pdf_path ? "Manter documentos existentes ou enviar mais..." : "Selecionar arquivos técnicos (.pdf, .docx, .xlsx, .txt, .png)...";
    pdfLabel.style.color = p.pdf_path ? "#ecc94b" : "var(--text-muted)";
  }
  document.getElementById('project-modal-title').textContent = `Editar Projeto: ${p.name}`;
  document.getElementById('project-modal').classList.add('active');
}
window.deleteProject = function(pId) {
  if (confirm("Tem certeza de que deseja deletar permanentemente este projeto de rede e seus arquivos anexados?")) {
    fetch(`/api/projects/${pId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Projeto deletado.", 'success');
        loadFoldersAndProjects();
      }
    })
    .catch(err => console.error("Error deleting project:", err));
  }
};
window.shareProject = function(pId) {
  let p = (window.loadedProjects || []).find(item => item.id == pId);
  if (!p) {
    fetch('/api/projects')
      .then(res => res.json())
      .then(projects => {
        const list = Array.isArray(projects) ? projects : (projects.projects || []);
        p = list.find(item => item.id == pId);
        if (p) executeShare(p);
      })
      .catch(err => console.error("Error sharing project detail:", err));
    return;
  }
  executeShare(p);
};
function executeShare(p) {
  const origin = window.location.origin;
  let msg = `🚨 *PROJETO DE REDE EXTERNA - CLARO* 🚨\n`;
  msg += `==========================================\n`;
  msg += `📍 *PROJETO:* ${p.name.toUpperCase()}\n`;
  if (p.area) msg += `🏢 *Área:* ${p.area}\n`;
  if (p.description) msg += `📝 *Descrição:* ${p.description}\n`;
  msg += `==========================================\n\n`;
  msg += `🔗 *VISUALIZAÇÃO PÚBLICA (SEM LOGIN):*\n`;
  msg += `${origin}/p/project/${p.id}\n\n`;
  msg += `📁 *ARQUIVOS PARA DOWNLOAD DIRETO:*\n`;
  if (p.kmz_path) {
    const kmzFiles = p.kmz_path.split(';').filter(x => x.trim() !== '');
    kmzFiles.forEach((file) => {
      msg += `🔹 *Mapa:* ${origin}/uploads/${file}\n`;
    });
  }
  if (p.pdf_path) {
    const pdfFiles = p.pdf_path.split(';').filter(x => x.trim() !== '');
    pdfFiles.forEach((file) => {
      msg += `📄 *Documento:* ${origin}/uploads/${file}\n`;
    });
  }
  msg += `\n⚡ *Claro Gestão Rede Externa*`;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}
function loadLogs() {
  const searchVal = document.getElementById('log-user-search').value.trim();
  const tableBody = document.getElementById('logs-table-body');
  if (!tableBody) return;
  const url = searchVal ? `/api/logs?username=${encodeURIComponent(searchVal)}` : '/api/logs';
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-error">Erro ao carregar logs.</td></tr>`;
        return;
      }
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Nenhum log registrado.</td></tr>`;
        return;
      }
      tableBody.innerHTML = data.map(log => {
        return `
          <tr>
            <td style="white-space: nowrap;"><span class="text-muted">${log.timestamp}</span></td>
            <td><strong>${escapeHtml(log.username)}</strong></td>
            <td>${escapeHtml(log.action)}</td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => console.error("Error loading logs:", err));
}
const MONTHS_LIST = [
  'janeiro-26', 'fevereiro-26', 'março-26', 'abril-26', 'maio-26', 'junho-26',
  'julho-26', 'agosto-26', 'setembro-26', 'outubro-26', 'novembro-26', 'dezembro-26',
  'janeiro-27', 'fevereiro-27', 'março-27', 'abril-27', 'maio-27', 'junho-27',
  'julho-27', 'agosto-27', 'setembro-27', 'outubro-27', 'novembro-27', 'dezembro-27'
];
const TARGET_THRESHOLDS = {
  ral: 90.0,   
  rec: 85.0,   
  hfc: 80.0,   
  gpon: 70.0,  
  me11: 90.0,  
  me3_hfc: 25.0,  
  me3_gpon: 25.0  
};
function getCurrentMonthSlug() {
  const now = new Date();
  const monthNames = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const monthName = monthNames[now.getMonth()];
  const yearShort = String(now.getFullYear()).slice(-2);
  const currentSlug = `${monthName}-${yearShort}`;
  if (MONTHS_LIST.includes(currentSlug)) {
    return currentSlug;
  }
  return 'julho-26';
}
function loadMetrics() {
  initIndicatorMonthSelect();
}
function initIndicatorMonthSelect() {
  const select = document.getElementById('indicator-month-select');
  if (!select) return;
  const currentSlug = getCurrentMonthSlug();
  if (select.children.length === 0) {
    select.innerHTML = MONTHS_LIST.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('');
    select.value = currentSlug;
    select.addEventListener('change', () => {
      loadMonthlyIndicators(select.value);
    });
  } else {
    select.value = currentSlug;
  }
  loadMonthlyIndicators(select.value || currentSlug);
}
function loadMonthlyIndicators(month) {
  fetch(`/api/indicators?month=${encodeURIComponent(month)}`)
    .then(res => res.json())
    .then(res => {
      const data = res.data || getInitialDefaultIndicatorData();
      renderIndicatorTables(data);
    })
    .catch(err => {
      console.error('Erro ao carregar indicadores:', err);
      renderIndicatorTables(getInitialDefaultIndicatorData());
    });
}
function getInitialDefaultIndicatorData() {
  return {
    ral: [
      { area: 'Baixada', total: 82, fp: 7 },
      { area: 'Metropolitana', total: 53, fp: 5 },
      { area: 'Norte Fluminense', total: 20, fp: 1 },
      { area: 'Serra Fluminense', total: 32, fp: 3 },
      { area: 'Sul Fluminense', total: 48, fp: 0 },
      { area: 'Lagos', total: 13, fp: 0 }
    ],
    rec: [
      { area: 'Baixada', total: 75, fp: 12 },
      { area: 'Metropolitana', total: 52, fp: 13 },
      { area: 'Norte Fluminense', total: 8, fp: 2 },
      { area: 'Serra Fluminense', total: 6, fp: 0 },
      { area: 'Sul Fluminense', total: 25, fp: 1 },
      { area: 'Lagos', total: 7, fp: 1 }
    ],
    hfc: [
      { area: 'Baixada', total: 4, fp: 0 },
      { area: 'Metropolitana', total: 7, fp: 1 },
      { area: 'Norte Fluminense', total: 0, fp: 0 },
      { area: 'Serra Fluminense', total: 0, fp: 0 },
      { area: 'Sul Fluminense', total: 2, fp: 0 },
      { area: 'Lagos', total: 0, fp: 0 }
    ],
    gpon: [
      { area: 'Baixada', total: 5, fp: 2 },
      { area: 'Metropolitana', total: 10, fp: 6 },
      { area: 'Norte Fluminense', total: 1, fp: 0 },
      { area: 'Serra Fluminense', total: 3, fp: 0 },
      { area: 'Sul Fluminense', total: 6, fp: 2 },
      { area: 'Lagos', total: 5, fp: 1 }
    ],
    me3_hfc: [
      { area: 'Baixada', time: '20.07' },
      { area: 'Metropolitana', time: '34.06' },
      { area: 'Norte Fluminense', time: '1.99' },
      { area: 'Serra Fluminense', time: '1.92' },
      { area: 'Sul Fluminense', time: '8.54' },
      { area: 'Lagos', time: '-' }
    ],
    me3_gpon: [
      { area: 'Baixada', time: '48.53' },
      { area: 'Metropolitana', time: '5.97' },
      { area: 'Norte Fluminense', time: '17.15' },
      { area: 'Serra Fluminense', time: '0' },
      { area: 'Sul Fluminense', time: '1.58' },
      { area: 'Lagos', time: '0' }
    ],
    me11: [
      { area: 'Baixada', pct: '91.42%', total: 0, fp: 0 },
      { area: 'Metropolitana', pct: '95.37%', total: 0, fp: 0 },
      { area: 'Norte Fluminense', pct: '100.00%', total: 0, fp: 0 },
      { area: 'Serra Fluminense', pct: '100.00%', total: 0, fp: 0 },
      { area: 'Sul Fluminense', pct: '100.00%', total: 0, fp: 0 },
      { area: 'Lagos', pct: '-', total: 0, fp: 0 }
    ],
    justificativas: ''
  };
}
let autoSaveIndicatorTimer = null;
window.triggerAutoSaveIndicators = function() {
  const statusEl = document.getElementById('indicator-auto-save-status');
  if (statusEl) {
    statusEl.textContent = '⏳ Salvando...';
    statusEl.style.opacity = '1';
    statusEl.style.color = '#f59e0b';
  }
  if (autoSaveIndicatorTimer) clearTimeout(autoSaveIndicatorTimer);
  autoSaveIndicatorTimer = setTimeout(() => {
    saveMonthlyIndicators(true);
  }, 400);
};
function renderIndicatorTables(data) {
  renderPctTable('tbl-ral-body', 'ral', data.ral || [], TARGET_THRESHOLDS.ral);
  renderPctTable('tbl-rec-body', 'rec', data.rec || [], TARGET_THRESHOLDS.rec);
  renderPctTable('tbl-hfc-body', 'hfc', data.hfc || [], TARGET_THRESHOLDS.hfc);
  renderPctTable('tbl-gpon-body', 'gpon', data.gpon || [], TARGET_THRESHOLDS.gpon);
  renderPctTable('tbl-me11-body', 'me11', data.me11 || [], TARGET_THRESHOLDS.me11);
  renderTimeTable('tbl-me3-hfc-body', 'me3_hfc', data.me3_hfc || [], TARGET_THRESHOLDS.me3_hfc);
  renderTimeTable('tbl-me3-gpon-body', 'me3_gpon', data.me3_gpon || [], TARGET_THRESHOLDS.me3_gpon);
  const txtJust = document.getElementById('indicator-justificativas');
  if (txtJust) {
    txtJust.value = data.justificativas || '';
    txtJust.oninput = function() {
      triggerAutoSaveIndicators();
    };
  }
  recalculateTotalsAndFormatting();
}
window.toggleIndicatorCellColor = function(el) {
  if (!el) return;
  const currentOverride = el.getAttribute('data-override-color') || '';
  if (currentOverride === 'red') {
    el.setAttribute('data-override-color', 'green');
    el.classList.remove('cell-red');
    el.classList.add('cell-green');
  } else if (currentOverride === 'green') {
    el.setAttribute('data-override-color', 'black');
    el.classList.remove('cell-green');
    el.classList.remove('cell-red');
  } else if (currentOverride === 'black') {
    el.setAttribute('data-override-color', 'red');
    el.classList.remove('cell-green');
    el.classList.add('cell-red');
  } else {
    if (el.classList.contains('cell-red')) {
      el.setAttribute('data-override-color', 'green');
      el.classList.remove('cell-red');
      el.classList.add('cell-green');
    } else if (el.classList.contains('cell-green')) {
      el.setAttribute('data-override-color', 'black');
      el.classList.remove('cell-green');
      el.classList.remove('cell-red');
    } else {
      el.setAttribute('data-override-color', 'red');
      el.classList.remove('cell-green');
      el.classList.add('cell-red');
    }
  }
  recalculateTotalsAndFormatting();
  triggerAutoSaveIndicators();
};
function renderPctTable(tbodyId, keyPrefix, items, targetMin) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const defaultAreas = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos'];
  let html = '';
  defaultAreas.forEach((area, idx) => {
    const item = items.find(x => x.area === area) || { total: 0, fp: 0, pct: '', override_color: '' };
    const override = item.override_color || '';
    html += `
      <tr>
        <td style="text-align: left; font-weight: 600; padding: 6px 10px; color: #f1f5f9;">${area}</td>
        <td id="${keyPrefix}-pct-${idx}" 
            data-override-color="${override}" 
            onclick="toggleIndicatorCellColor(this)" 
            title="Clique para alternar entre Verde e Vermelho" 
            style="font-weight: 700; cursor: pointer; user-select: none;">-</td>
        <td><input type="number" class="indicator-input" id="${keyPrefix}-total-${idx}" value="${item.total || 0}" oninput="recalculateTotalsAndFormatting(); triggerAutoSaveIndicators();"></td>
        <td><input type="number" class="indicator-input" id="${keyPrefix}-fp-${idx}" value="${item.fp || 0}" oninput="recalculateTotalsAndFormatting(); triggerAutoSaveIndicators();"></td>
      </tr>
    `;
  });
  html += `
    <tr class="row-interior-total">
      <td style="text-align: left; padding: 8px 10px; font-weight: 800;">Interior</td>
      <td id="${keyPrefix}-pct-total" 
          onclick="toggleIndicatorCellColor(this)" 
          title="Clique para alternar entre Verde e Vermelho" 
          style="font-weight: 800; cursor: pointer; user-select: none;">-</td>
      <td id="${keyPrefix}-sum-total" style="font-weight: 800;">0</td>
      <td id="${keyPrefix}-sum-fp" style="font-weight: 800;">0</td>
    </tr>
  `;
  tbody.innerHTML = html;
}
function renderTimeTable(tbodyId, keyPrefix, items, targetMax) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const defaultAreas = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos'];
  let html = '';
  defaultAreas.forEach((area, idx) => {
    const item = items.find(x => x.area === area) || { time: '-', override_color: '' };
    const override = item.override_color || '';
    html += `
      <tr>
        <td style="text-align: left; font-weight: 600; padding: 6px 10px; color: #f1f5f9;">${area}</td>
        <td>
          <input type="text" 
                 class="indicator-input" 
                 id="${keyPrefix}-time-${idx}" 
                 data-override-color="${override}" 
                 onclick="toggleIndicatorCellColor(this)" 
                 title="Clique para alternar entre Verde e Vermelho" 
                 value="${item.time || '-'}" 
                 oninput="recalculateTotalsAndFormatting(); triggerAutoSaveIndicators();" 
                 style="max-width: 100px; cursor: pointer;">
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}
function recalculateTotalsAndFormatting() {
  calcPctTable('ral', TARGET_THRESHOLDS.ral);
  calcPctTable('rec', TARGET_THRESHOLDS.rec);
  calcPctTable('hfc', TARGET_THRESHOLDS.hfc);
  calcPctTable('gpon', TARGET_THRESHOLDS.gpon);
  calcPctTable('me11', TARGET_THRESHOLDS.me11);
  calcTimeTable('me3_hfc', TARGET_THRESHOLDS.me3_hfc);
  calcTimeTable('me3_gpon', TARGET_THRESHOLDS.me3_gpon);
}
function calcPctTable(keyPrefix, targetMin) {
  let sumTotal = 0;
  let sumFp = 0;
  for (let i = 0; i < 6; i++) {
    const totalEl = document.getElementById(`${keyPrefix}-total-${i}`);
    const fpEl = document.getElementById(`${keyPrefix}-fp-${i}`);
    const pctEl = document.getElementById(`${keyPrefix}-pct-${i}`);
    if (!totalEl || !fpEl || !pctEl) continue;
    const total = parseFloat(totalEl.value || 0);
    const fp = parseFloat(fpEl.value || 0);
    sumTotal += total;
    sumFp += fp;
    const override = pctEl.getAttribute('data-override-color');
    if (total > 0) {
      const pct = Math.max(0, ((total - fp) / total) * 100);
      const pctStr = pct.toFixed(2) + '%';
      pctEl.textContent = pctStr;
      if (override === 'green') {
        pctEl.className = 'cell-green';
      } else if (override === 'red') {
        pctEl.className = 'cell-red';
      } else if (override === 'black') {
        pctEl.className = '';
      } else {
        if (pct < targetMin) {
          pctEl.className = 'cell-red';
        } else {
          pctEl.className = '';
        }
      }
    } else {
      pctEl.textContent = '-';
      if (override === 'green') {
        pctEl.className = 'cell-green';
      } else if (override === 'red') {
        pctEl.className = 'cell-red';
      } else if (override === 'black') {
        pctEl.className = '';
      } else {
        pctEl.className = '';
      }
    }
  }
  const sumTotalEl = document.getElementById(`${keyPrefix}-sum-total`);
  const sumFpEl = document.getElementById(`${keyPrefix}-sum-fp`);
  const pctTotalEl = document.getElementById(`${keyPrefix}-pct-total`);
  if (sumTotalEl) sumTotalEl.textContent = sumTotal;
  if (sumFpEl) sumFpEl.textContent = sumFp;
  if (pctTotalEl) {
    const override = pctTotalEl.getAttribute('data-override-color');
    if (sumTotal > 0) {
      const pctTotal = Math.max(0, ((sumTotal - sumFp) / sumTotal) * 100);
      pctTotalEl.textContent = pctTotal.toFixed(2) + '%';
      if (override === 'green') {
        pctTotalEl.style.backgroundColor = '#16a34a';
        pctTotalEl.style.color = '#ffffff';
      } else if (override === 'red') {
        pctTotalEl.style.backgroundColor = '#dc2626';
        pctTotalEl.style.color = '#ffffff';
      } else if (override === 'black') {
        pctTotalEl.style.backgroundColor = 'transparent';
        pctTotalEl.style.color = '#ffffff';
      } else {
        if (pctTotal < targetMin) {
          pctTotalEl.style.backgroundColor = '#dc2626';
          pctTotalEl.style.color = '#ffffff';
        } else {
          pctTotalEl.style.backgroundColor = 'transparent';
          pctTotalEl.style.color = '';
        }
      }
    } else {
      pctTotalEl.textContent = '-';
      if (override === 'green') {
        pctTotalEl.style.backgroundColor = '#16a34a';
        pctTotalEl.style.color = '#ffffff';
      } else if (override === 'red') {
        pctTotalEl.style.backgroundColor = '#dc2626';
        pctTotalEl.style.color = '#ffffff';
      } else if (override === 'black') {
        pctTotalEl.style.backgroundColor = 'transparent';
        pctTotalEl.style.color = '#ffffff';
      } else {
        pctTotalEl.style.backgroundColor = 'transparent';
        pctTotalEl.style.color = '';
      }
    }
  }
}
function calcTimeTable(keyPrefix, targetMax) {
  for (let i = 0; i < 6; i++) {
    const inputEl = document.getElementById(`${keyPrefix}-time-${i}`);
    if (!inputEl) continue;
    const override = inputEl.getAttribute('data-override-color');
    const valStr = inputEl.value.trim().replace(',', '.');
    const valNum = parseFloat(valStr);
    if (override === 'green') {
      inputEl.classList.remove('cell-red');
      inputEl.classList.add('cell-green');
    } else if (override === 'red') {
      inputEl.classList.remove('cell-green');
      inputEl.classList.add('cell-red');
    } else if (override === 'black') {
      inputEl.classList.remove('cell-red');
      inputEl.classList.remove('cell-green');
    } else {
      if (!isNaN(valNum) && valNum > targetMax) {
        inputEl.classList.remove('cell-green');
        inputEl.classList.add('cell-red');
      } else {
        inputEl.classList.remove('cell-red');
        inputEl.classList.remove('cell-green');
      }
    }
  }
}
window.saveMonthlyIndicators = function(isAutoSave) {
  const select = document.getElementById('indicator-month-select');
  const month = select ? select.value : getCurrentMonthSlug();
  const defaultAreas = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos'];
  const getPctData = (keyPrefix) => {
    return defaultAreas.map((area, idx) => {
      const total = parseFloat(document.getElementById(`${keyPrefix}-total-${idx}`)?.value || 0);
      const fp = parseFloat(document.getElementById(`${keyPrefix}-fp-${idx}`)?.value || 0);
      const pctEl = document.getElementById(`${keyPrefix}-pct-${idx}`);
      const override_color = pctEl ? (pctEl.getAttribute('data-override-color') || '') : '';
      return { area, total, fp, override_color };
    });
  };
  const getTimeData = (keyPrefix) => {
    return defaultAreas.map((area, idx) => {
      const inputEl = document.getElementById(`${keyPrefix}-time-${idx}`);
      const time = inputEl ? (inputEl.value || '-') : '-';
      const override_color = inputEl ? (inputEl.getAttribute('data-override-color') || '') : '';
      return { area, time, override_color };
    });
  };
  const payload = {
    ral: getPctData('ral'),
    rec: getPctData('rec'),
    hfc: getPctData('hfc'),
    gpon: getPctData('gpon'),
    me11: getPctData('me11'),
    me3_hfc: getTimeData('me3_hfc'),
    me3_gpon: getTimeData('me3_gpon'),
    justificativas: document.getElementById('indicator-justificativas')?.value || ''
  };
  const btn = document.getElementById('btn-save-indicators');
  const statusEl = document.getElementById('indicator-auto-save-status');
  if (btn && !isAutoSave) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }
  fetch('/api/indicators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, data: payload })
  })
  .then(res => res.json())
  .then(res => {
    if (btn && !isAutoSave) {
      btn.disabled = false;
      btn.textContent = 'Salvar Alterações do Mês';
    }
    if (res.error) {
      if (isAutoSave && statusEl) {
        statusEl.textContent = '⚠ Falha ao salvar automaticamente';
        statusEl.style.color = '#f87171';
        statusEl.style.opacity = '1';
      } else {
        showToast(`Erro ao salvar: ${res.error}`, 'error');
      }
    } else if (isAutoSave && statusEl) {
      statusEl.textContent = `✓ Salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      statusEl.style.color = '#4ade80';
      statusEl.style.opacity = '1';
    } else {
      showToast(`Indicadores do mês "${month.toUpperCase()}" salvos com sucesso!`, 'success');
    }
  })
  .catch(err => {
    if (btn && !isAutoSave) {
      btn.disabled = false;
      btn.textContent = 'Salvar Alterações do Mês';
    }
    console.error('Erro ao salvar indicadores:', err);
    if (isAutoSave && statusEl) {
      statusEl.textContent = '⚠ Falha ao salvar automaticamente';
      statusEl.style.color = '#f87171';
      statusEl.style.opacity = '1';
    } else {
      showToast('Erro ao salvar indicadores no servidor.', 'error');
    }
  });
};
function loadTechniciansForUserSelect(selectedTechId) {
  const select = document.getElementById('user-tech-id');
  if (!select) return;
  fetch('/api/technicians')
    .then(res => res.json())
    .then(data => {
      if (data.error || !Array.isArray(data) || data.length === 0) {
        select.innerHTML = '<option value="">Nenhuma pessoa cadastrada em #pessoas. Cadastre primeiro!</option>';
        return;
      }
      let html = '<option value="">Selecione uma pessoa cadastrada em #pessoas...</option>';
      data.forEach(t => {
        const isSel = (selectedTechId && t.id == selectedTechId) ? 'selected' : '';
        html += `<option value="${t.id}" data-name="${escapeHtml(t.name)}" data-role="${escapeHtml(t.role || 'Técnico')}" ${isSel}>${escapeHtml(t.name)} ${t.role ? '(' + escapeHtml(t.role) + ')' : ''}</option>`;
      });
      select.innerHTML = html;
    })
    .catch(err => console.error("Error loading technicians for user select:", err));
}
function loadUsers() {
  const tableBody = document.getElementById('users-table-body');
  const btnCreateUser = document.getElementById('btn-open-user-modal');
  if (!tableBody) return;
  const userIsCoord = isCoordenador();
  if (btnCreateUser) {
    if (!userIsCoord) {
      btnCreateUser.style.display = 'none';
    } else {
      btnCreateUser.style.display = 'inline-flex';
    }
  }
  fetch('/api/users')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-error">Erro ao carregar usuários.</td></tr>`;
        return;
      }
      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Nenhum usuário cadastrado.</td></tr>`;
        return;
      }
      tableBody.innerHTML = data.map(u => {
        const linkedName = u.tech_name ? `<br><small class="text-muted" style="font-size: 0.76rem;">Pessoa: <strong>${escapeHtml(u.tech_name)}</strong></small>` : '';
        const actionsHtml = userIsCoord ? `
          <div class="action-buttons">
            <button class="action-btn edit-btn" onclick="editUser(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.role)}', ${u.tech_id || 'null'})" title="Editar Usuário">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')" title="Remover Usuário">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        ` : `<span class="text-muted" style="font-size: 0.8rem;">Somente Leitura</span>`;
        return `
          <tr>
            <td><strong>${escapeHtml(u.username)}</strong>${linkedName}</td>
            <td><span class="profile-role" style="font-size: 0.8rem; font-weight: 700; color: var(--primary); text-transform: uppercase;">${escapeHtml(u.role)}</span></td>
            <td><span class="text-muted">${u.created_at || 'N/A'}</span></td>
            <td>${actionsHtml}</td>
          </tr>
        `;
      }).join('');
    })
    .catch(err => {
      console.error("Error loading users:", err);
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-error">Erro na conexão.</td></tr>`;
    });
}
window.editUser = function(uId, username, role, techId) {
  if (!isCoordenador()) {
    showToast('Você não tem permissão para isso', 'error', 3000);
    return;
  }
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = uId;
  const usernameInput = document.getElementById('user-username');
  usernameInput.value = username;
  usernameInput.disabled = true;
  document.getElementById('user-role').value = role;
  loadTechniciansForUserSelect(techId);
  document.getElementById('password-group').style.display = 'block';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-password-hint').style.display = 'block';
  document.getElementById('user-modal-title').textContent = `Editar Usuário: ${username}`;
  document.getElementById('user-modal').classList.add('active');
};
window.deleteUser = function(uId, username) {
  if (!isCoordenador()) {
    showToast('Você não tem permissão para isso', 'error', 3000);
    return;
  }
  const confirmMsg = username
    ? `Tem certeza que deseja excluir permanentemente a conta do usuário "${username}"?`
    : "Tem certeza de que deseja excluir permanentemente esta conta de acesso?";
  if (confirm(confirmMsg)) {
    fetch(`/api/users/${uId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
      } else {
        showToast("Usuário removido do sistema.", 'success');
        loadUsers();
      }
    })
    .catch(err => {
      console.error("Error deleting user:", err);
      showToast("Falha de conexão.", 'error');
    });
  }
};
let globalFavorites = [];
function initFavoritesEvents() {
  const btnOpenModal = document.getElementById('btn-open-favorite-modal');
  const favModal = document.getElementById('favorite-modal');
  const favForm = document.getElementById('favorite-form');
  const searchInput = document.getElementById('fav-search');
  if (btnOpenModal && favModal) {
    btnOpenModal.addEventListener('click', () => {
      openFavoriteModal();
    });
  }
  if (favForm) {
    favForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveFavorite();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterFavorites(searchInput.value);
    });
  }
  const colorBtns = document.querySelectorAll('.color-option-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const radio = btn.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
}
function loadFavorites() {
  fetch('/api/favorites')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      globalFavorites = data;
      renderFavorites(globalFavorites);
    })
    .catch(err => {
      console.error('Erro ao carregar favoritos:', err);
      showToast('Erro ao carregar favoritos', 'error');
    });
}
window.trackFavoriteClick = function(favId) {
  fetch(`/api/favorites/${favId}/click`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success && globalFavorites) {
        const item = globalFavorites.find(f => f.id === favId);
        if (item) {
          item.access_count = data.access_count;
          globalFavorites.sort((a, b) => (b.access_count || 0) - (a.access_count || 0) || b.id - a.id);
          renderFavorites(globalFavorites);
        }
      }
    })
    .catch(err => console.error('Erro ao registrar clique no favorito:', err));
};
function renderFavorites(list) {
  const container = document.getElementById('favorites-container');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px; opacity: 0.5;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
        </svg>
        <h4 style="color: #ffffff; font-weight: 600; margin-bottom: 6px;">Nenhum favorito cadastrado</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Clique no botão "+ Cadastrar Favorito" acima para adicionar seus links úteis.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = list.map(item => {
    const color = item.color || 'Vermelho';
    const colorLower = color.toLowerCase();
    const clicks = item.access_count || 0;
    const clicksBadge = `<span style="font-size: 0.7rem; font-weight: 700; color: #cbd5e1; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); padding: 2px 7px; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px;" title="${clicks} acessos realizados pela equipe">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 11px; height: 11px; color: #ecc94b;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      ${clicks}x
    </span>`;
    return `
      <div class="favorite-card favorite-card-${colorLower}">
        <div class="favorite-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="fav-badge fav-badge-${colorLower}">${escapeHtml(color)}</span>
            ${clicksBadge}
          </div>
          <div class="fav-actions">
            <button class="btn-icon" onclick="openEditFavoriteModal(${item.id})" title="Editar Favorito">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-delete" onclick="deleteFavorite(${item.id}, '${escapeHtml(item.title)}')" title="Excluir Favorito">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
        <h4 class="fav-title">${escapeHtml(item.title)}</h4>
        <a href="${escapeHtml(item.link)}" onclick="trackFavoriteClick(${item.id})" target="_blank" rel="noopener noreferrer" class="fav-link-btn">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 14px; height: 14px; margin-right: 6px;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Acessar Link
        </a>
      </div>
    `;
  }).join('');
}
function filterFavorites(query) {
  const term = query.toLowerCase().trim();
  if (!term) {
    renderFavorites(globalFavorites);
    return;
  }
  const filtered = globalFavorites.filter(item => 
    (item.title && item.title.toLowerCase().includes(term)) ||
    (item.link && item.link.toLowerCase().includes(term)) ||
    (item.color && item.color.toLowerCase().includes(term))
  );
  renderFavorites(filtered);
}
function openFavoriteModal() {
  const modal = document.getElementById('favorite-modal');
  const modalTitle = document.getElementById('fav-modal-title');
  const favId = document.getElementById('fav-id');
  const favTitle = document.getElementById('fav-title');
  const favLink = document.getElementById('fav-link');
  if (modalTitle) modalTitle.textContent = 'Cadastrar Favorito';
  if (favId) favId.value = '';
  if (favTitle) favTitle.value = '';
  if (favLink) favLink.value = '';
  selectColorOption('Vermelho');
  if (modal) modal.classList.add('active');
}
window.openEditFavoriteModal = function(id) {
  const item = globalFavorites.find(f => f.id === id);
  if (!item) return;
  const modal = document.getElementById('favorite-modal');
  const modalTitle = document.getElementById('fav-modal-title');
  const favId = document.getElementById('fav-id');
  const favTitle = document.getElementById('fav-title');
  const favLink = document.getElementById('fav-link');
  if (modalTitle) modalTitle.textContent = 'Editar Favorito';
  if (favId) favId.value = item.id;
  if (favTitle) favTitle.value = item.title;
  if (favLink) favLink.value = item.link;
  selectColorOption(item.color || 'Vermelho');
  if (modal) modal.classList.add('active');
};
function selectColorOption(colorValue) {
  const colorBtns = document.querySelectorAll('.color-option-btn');
  colorBtns.forEach(btn => {
    btn.classList.remove('active');
    const radio = btn.querySelector('input[type="radio"]');
    if (radio && radio.value.toLowerCase() === colorValue.toLowerCase()) {
      radio.checked = true;
      btn.classList.add('active');
    }
  });
}
function saveFavorite() {
  const id = document.getElementById('fav-id').value;
  const title = document.getElementById('fav-title').value.trim();
  const link = document.getElementById('fav-link').value.trim();
  const selectedRadio = document.querySelector('input[name="fav-color"]:checked');
  const color = selectedRadio ? selectedRadio.value : 'Vermelho';
  if (!title || !link) {
    showToast('Preencha o nome e o link.', 'error');
    return;
  }
  const payload = { title, link, color };
  const url = id ? `/api/favorites/${id}` : '/api/favorites';
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(id ? 'Favorito atualizado!' : 'Favorito cadastrado com sucesso!', 'success');
    const modal = document.getElementById('favorite-modal');
    if (modal) modal.classList.remove('active');
    loadFavorites();
  })
  .catch(err => {
    console.error('Erro ao salvar favorito:', err);
    showToast('Erro ao salvar favorito', 'error');
  });
}
window.deleteFavorite = function(id, title) {
  if (!confirm(`Deseja realmente excluir o favorito "${title}"?`)) return;
  fetch(`/api/favorites/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast('Favorito removido!', 'success');
      loadFavorites();
    })
    .catch(err => {
      console.error('Erro ao deletar favorito:', err);
      showToast('Erro ao excluir favorito', 'error');
    });
};
let globalRoutes = [];
let currentActiveRouteId = null;
function initRoutesEvents() {
  const btnOpenModal = document.getElementById('btn-open-route-modal');
  const routeForm = document.getElementById('route-form');
  const typeFilter = document.getElementById('route-type-filter');
  const searchInput = document.getElementById('route-search');
  const btnBackRoutes = document.getElementById('btn-back-routes');
  const btnOpenLineModal = document.getElementById('btn-open-line-modal');
  const routeLineForm = document.getElementById('route-line-form');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => openRouteModal());
  }
  if (routeForm) {
    routeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveRoute();
    });
  }
  if (typeFilter) {
    typeFilter.addEventListener('change', () => loadRoutes());
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => filterRoutes(searchInput.value));
  }
  if (btnBackRoutes) {
    btnBackRoutes.addEventListener('click', () => backToRoutesList());
  }
  if (btnOpenLineModal) {
    btnOpenLineModal.addEventListener('click', () => openRouteLineModal());
  }
  if (routeLineForm) {
    routeLineForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveRouteLine();
    });
  }
}
function loadRoutes() {
  const typeFilter = document.getElementById('route-type-filter');
  const routeType = typeFilter ? typeFilter.value : '';
  const query = routeType ? `?type=${encodeURIComponent(routeType)}` : '';
  fetch(`/api/routes${query}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      globalRoutes = data;
      renderRoutes(globalRoutes);
    })
    .catch(err => {
      console.error('Erro ao carregar rotas:', err);
      showToast('Erro ao carregar rotas', 'error');
    });
}
function renderRoutes(list) {
  const container = document.getElementById('routes-container');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px; opacity: 0.5;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
        </svg>
        <h4 style="color: #ffffff; font-weight: 600; margin-bottom: 6px;">Nenhuma rota cadastrada</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Clique no botão "+ Incluir Rota" acima para cadastrar a primeira rota.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = list.map(item => {
    const isEmpresarial = item.type === 'Empresarial';
    const badgeClass = isEmpresarial ? 'route-badge-empresarial' : 'route-badge-residencial';
    const borderClass = isEmpresarial ? 'route-card-empresarial' : 'route-card-residencial';
    const linesCount = item.lines_count || 0;
    return `
      <div class="route-card ${borderClass}" onclick="openRouteSubpage(${item.id})">
        <div class="route-card-header">
          <span class="route-badge ${badgeClass}">${escapeHtml(item.type)}</span>
          <div class="route-actions" onclick="event.stopPropagation();">
            <button class="btn-icon" onclick="openEditRouteModal(${item.id})" title="Editar Rota">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-delete" onclick="deleteRoute(${item.id}, '${escapeHtml(item.name)}')" title="Excluir Rota">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
        <h4 class="route-card-title">${escapeHtml(item.name)}</h4>
        <p class="route-card-desc">${escapeHtml(item.description || 'Sem descrição cadastrada.')}</p>
        <div class="route-card-footer" style="flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 0.78rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 14px; height: 14px;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
            </svg>
            ${linesCount} ${linesCount === 1 ? 'linha' : 'linhas'}
          </span>
          ${item.created_at_fmt ? `<span style="font-size: 0.75rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px;">${escapeHtml(item.created_at_fmt)}</span>` : ''}
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary); display: inline-flex; align-items: center; gap: 4px; margin-left: auto;">
            Abrir Sub-Página &rarr;
          </span>
        </div>
      </div>
    `;
  }).join('');
}
function filterRoutes(query) {
  const term = query.toLowerCase().trim();
  if (!term) {
    renderRoutes(globalRoutes);
    return;
  }
  const filtered = globalRoutes.filter(r => 
    (r.name && r.name.toLowerCase().includes(term)) ||
    (r.description && r.description.toLowerCase().includes(term)) ||
    (r.type && r.type.toLowerCase().includes(term))
  );
  renderRoutes(filtered);
}
window.openRouteModal = function() {
  const modal = document.getElementById('route-modal');
  const title = document.getElementById('route-modal-title');
  const rId = document.getElementById('route-id');
  const rName = document.getElementById('route-name');
  const rType = document.getElementById('route-type');
  const rDesc = document.getElementById('route-description');
  if (title) title.textContent = 'Incluir Rota';
  if (rId) rId.value = '';
  if (rName) rName.value = '';
  if (rType) rType.value = 'Empresarial';
  if (rDesc) rDesc.value = '';
  if (modal) {
    modal.classList.add('active');
  }
};
window.openEditRouteModal = function(id) {
  const item = globalRoutes.find(r => r.id === id);
  if (!item) return;
  const modal = document.getElementById('route-modal');
  const title = document.getElementById('route-modal-title');
  const rId = document.getElementById('route-id');
  const rName = document.getElementById('route-name');
  const rType = document.getElementById('route-type');
  const rDesc = document.getElementById('route-description');
  if (title) title.textContent = 'Editar Rota';
  if (rId) rId.value = item.id;
  if (rName) rName.value = item.name;
  if (rType) rType.value = item.type;
  if (rDesc) rDesc.value = item.description || '';
  if (modal) modal.classList.add('active');
};
function saveRoute() {
  const id = document.getElementById('route-id').value;
  const name = document.getElementById('route-name').value.trim();
  const type = document.getElementById('route-type').value;
  const description = document.getElementById('route-description').value.trim();
  if (!name) {
    showToast('Informe o nome da rota.', 'error');
    return;
  }
  const payload = { name, type, description };
  const url = id ? `/api/routes/${id}` : '/api/routes';
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(id ? 'Rota atualizada!' : 'Rota incluída com sucesso!', 'success');
    const modal = document.getElementById('route-modal');
    if (modal) modal.classList.remove('active');
    loadRoutes();
  })
  .catch(err => {
    console.error('Erro ao salvar rota:', err);
    showToast('Erro ao salvar rota', 'error');
  });
}
window.deleteRoute = function(id, name) {
  if (!confirm(`Deseja excluir permanentemente a rota "${name}" e todas as suas linhas?`)) return;
  fetch(`/api/routes/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast('Rota excluída com sucesso!', 'success');
      if (currentActiveRouteId === id) {
        backToRoutesList();
      }
      loadRoutes();
    })
    .catch(err => {
      console.error('Erro ao excluir rota:', err);
      showToast('Erro ao excluir rota', 'error');
    });
};
window.openRouteSubpage = function(routeId) {
  currentActiveRouteId = routeId;
  const mainView = document.getElementById('routes-main-view');
  const subpageView = document.getElementById('route-detail-subpage');
  if (mainView) mainView.style.display = 'none';
  if (subpageView) subpageView.style.display = 'block';
  fetch(`/api/routes/${routeId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        backToRoutesList();
        return;
      }
      const r = data.route;
      const lines = data.lines || [];
      const titleEl = document.getElementById('subpage-route-title');
      const badgeEl = document.getElementById('subpage-route-type-badge');
      const descEl = document.getElementById('subpage-route-description');
      if (titleEl) titleEl.textContent = r.name;
      if (badgeEl) {
        badgeEl.textContent = r.type;
        badgeEl.className = r.type === 'Empresarial' ? 'route-badge route-badge-empresarial' : 'route-badge route-badge-residencial';
      }
      if (descEl) descEl.textContent = r.description || 'Nenhuma descrição fornecida para esta rota.';
      renderRouteLines(lines);
      loadRouteContents(routeId, null);
    })
    .catch(err => {
      console.error('Erro ao carregar detalhes da rota:', err);
      showToast('Erro ao carregar sub-página da rota', 'error');
      backToRoutesList();
    });
};
function backToRoutesList() {
  currentActiveRouteId = null;
  const mainView = document.getElementById('routes-main-view');
  const subpageView = document.getElementById('route-detail-subpage');
  if (mainView) mainView.style.display = 'block';
  if (subpageView) subpageView.style.display = 'none';
  loadRoutes();
}
function renderRouteLines(lines) {
  currentRouteLines = lines || [];
  const tbody = document.getElementById('route-lines-table-body');
  if (!tbody) return;
  if (!lines || lines.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Nenhuma medição cadastrada para esta rota.<br>
          Clique no botão "+ Adicionar Linha" acima para registrar uma medição ou "Importar" para enviar em lote.
        </td>
      </tr>
    `;
    return;
  }
  tbody.innerHTML = lines.map(line => {
    return `
      <tr>
        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(line.stretch_name)}</td>
        <td>${escapeHtml(line.pop_box || '-')}</td>
        <td style="color: #60a5fa; font-weight: 600;">${escapeHtml(line.cable_type || '-')}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(line.notes || '-')}</td>
        <td style="color: #e2e8f0; font-size: 0.85rem;">${escapeHtml(line.address || '-')}</td>
        <td>
          <div class="action-buttons">
            <button class="action-btn edit-btn" onclick="openEditRouteLineModal(${line.id}, '${escapeHtml(line.stretch_name)}', '${escapeHtml(line.pop_box || '')}', '${escapeHtml(line.cable_type || '')}', '${escapeHtml(line.notes || '')}', '${escapeHtml(line.address || '')}')" title="Editar Medição">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteRouteLine(${line.id}, '${escapeHtml(line.stretch_name)}')" title="Excluir Medição">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.openRouteLineModal = function() {
  const modal = document.getElementById('route-line-modal');
  const title = document.getElementById('route-line-modal-title');
  const lId = document.getElementById('route-line-id');
  const lStretch = document.getElementById('line-stretch-name');
  const lPop = document.getElementById('line-pop-box');
  const lCable = document.getElementById('line-cable-type');
  const lNotes = document.getElementById('line-notes');
  const lAddr = document.getElementById('line-address');
  if (title) title.textContent = 'Adicionar Medição na Rota';
  if (lId) lId.value = '';
  if (lStretch) lStretch.value = '';
  if (lPop) lPop.value = '';
  if (lCable) lCable.value = '';
  if (lNotes) lNotes.value = '';
  if (lAddr) lAddr.value = '';
  if (modal) {
    modal.classList.add('active');
  }
};
window.openEditRouteLineModal = function(id, stretch, pop, cable, notes, address) {
  const modal = document.getElementById('route-line-modal');
  const title = document.getElementById('route-line-modal-title');
  const lId = document.getElementById('route-line-id');
  const lStretch = document.getElementById('line-stretch-name');
  const lPop = document.getElementById('line-pop-box');
  const lCable = document.getElementById('line-cable-type');
  const lNotes = document.getElementById('line-notes');
  const lAddr = document.getElementById('line-address');
  if (title) title.textContent = 'Editar Medição da Rota';
  if (lId) lId.value = id;
  if (lStretch) lStretch.value = stretch;
  if (lPop) lPop.value = pop;
  if (lCable) lCable.value = cable;
  if (lNotes) lNotes.value = notes;
  if (lAddr) lAddr.value = address || '';
  if (modal) modal.classList.add('active');
};
function saveRouteLine() {
  if (!currentActiveRouteId) {
    showToast('Nenhuma rota ativa selecionada.', 'error');
    return;
  }
  const id = document.getElementById('route-line-id').value;
  const stretch_name = document.getElementById('line-stretch-name').value.trim();
  const pop_box = document.getElementById('line-pop-box').value.trim();
  const cable_type = document.getElementById('line-cable-type').value.trim();
  const notes = document.getElementById('line-notes').value.trim();
  const address = document.getElementById('line-address') ? document.getElementById('line-address').value.trim() : '';
  if (!stretch_name) {
    showToast('Informe a data da medição.', 'error');
    return;
  }
  const payload = { stretch_name, pop_box, cable_type, notes, address };
  const url = id ? `/api/routes/lines/${id}` : `/api/routes/${currentActiveRouteId}/lines`;
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(id ? 'Medição atualizada!' : 'Medição adicionada com sucesso!', 'success');
    const modal = document.getElementById('route-line-modal');
    if (modal) modal.classList.remove('active');
    openRouteSubpage(currentActiveRouteId);
  })
  .catch(err => {
    console.error('Erro ao salvar medição:', err);
    showToast('Erro ao salvar medição', 'error');
  });
}
window.deleteRouteLine = function(lineId, stretch) {
  if (!confirm(`Deseja excluir a medição/linha "${stretch}"?`)) return;
  fetch(`/api/routes/lines/${lineId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast('Medição excluída!', 'success');
      if (currentActiveRouteId) {
        openRouteSubpage(currentActiveRouteId);
      }
    })
    .catch(err => {
      console.error('Erro ao excluir medição:', err);
      showToast('Erro ao excluir medição', 'error');
    });
};
window.exportRouteLines = function() {
  if (!currentActiveRouteId) {
    showToast('Nenhuma rota ativa para exportação.', 'error');
    return;
  }
  window.location.href = `/api/routes/${currentActiveRouteId}/export`;
};
window.shareRouteOnWhatsApp = function() {
  if (!currentActiveRouteId) {
    showToast('Nenhuma rota ativa selecionada.', 'error');
    return;
  }
  const titleEl = document.getElementById('subpage-route-title');
  const badgeEl = document.getElementById('subpage-route-type-badge');
  const descEl = document.getElementById('subpage-route-description');
  const routeTitle = titleEl ? titleEl.textContent.trim() : 'ROTA';
  const routeType = badgeEl ? badgeEl.textContent.trim() : '';
  const routeDesc = descEl ? descEl.textContent.trim() : '';
  const totalLines = currentRouteLines ? currentRouteLines.length : 0;
  const dateNow = new Date();
  const dateStr = dateNow.toLocaleDateString('pt-BR');
  const timeStr = dateNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let txt = `🚨 *RELATÓRIO TÉCNICO DE ROTA - CLARO GESTÃO REDE EXTERNA* 🚨\n`;
  txt += `==========================================\n`;
  txt += `📍 *ROTA:* ${routeTitle.toUpperCase()} ${routeType ? '[' + routeType.toUpperCase() + ']' : ''}\n`;
  if (routeDesc && routeDesc !== 'Nenhuma descrição fornecida para esta rota.') {
    txt += `ℹ️ *Descrição:* ${routeDesc}\n`;
  }
  txt += `📊 *TOTAL DE MEDIÇÕES:* ${totalLines} registro(s)\n`;
  txt += `*EMISSÃO:* ${dateStr} às ${timeStr}\n`;
  txt += `==========================================\n\n`;
  if (totalLines === 0) {
    txt += `⚠️ *Nenhuma medição registrada para esta rota até o momento.*\n\n`;
  } else {
    currentRouteLines.forEach((line, idx) => {
      txt += `📌 *MEDIÇÃO #${idx + 1}*\n`;
      txt += `*Data:* ${line.stretch_name || '-'}\n`;
      txt += `🏢 *Local da Medição:* ${line.pop_box || '-'}\n`;
      txt += `📏 *Medição:* ${line.cable_type || '-'}\n`;
      txt += `📝 *Observações Técnicas:* ${line.notes || '-'}\n`;
      txt += `📍 *Endereço / Ações:* ${line.address || '-'}\n`;
      txt += `------------------------------------------\n\n`;
    });
  }
  txt += `⚡ *Claro Gestão Rede Externa*`;
  const encodedText = encodeURIComponent(txt);
  const waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).catch(() => {});
  }
  window.open(waUrl, '_blank');
  showToast('Relatório da Rota gerado e aberto no WhatsApp (e copiado para a Área de Transferência)!', 'success');
};
window.openRouteLinesImportModal = function() {
  const modal = document.getElementById('route-lines-import-modal');
  const txt = document.getElementById('route-lines-bulk-data');
  if (txt) txt.value = '';
  if (modal) modal.classList.add('active');
};
document.addEventListener('DOMContentLoaded', () => {
  initRouteFolderEvents();
  const btnSaveBulk = document.getElementById('btn-save-route-lines-bulk');
  if (btnSaveBulk) {
    btnSaveBulk.addEventListener('click', () => {
      if (!currentActiveRouteId) {
        showToast('Nenhuma rota ativa para importação.', 'error');
        return;
      }
      const csvText = document.getElementById('route-lines-bulk-data').value.trim();
      if (!csvText) {
        showToast('Cole o conteúdo para importar.', 'error');
        return;
      }
      fetch(`/api/routes/${currentActiveRouteId}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvText })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        showToast(`${data.imported} medições importadas com sucesso!`, 'success');
        const modal = document.getElementById('route-lines-import-modal');
        if (modal) modal.classList.remove('active');
        openRouteSubpage(currentActiveRouteId);
      })
      .catch(err => {
        console.error('Erro na importação em lote:', err);
        showToast('Erro ao processar importação em lote', 'error');
      });
    });
  }
});
let globalForms = [];
function initFormsEvents() {
  const btnOpenModal = document.getElementById('btn-open-form-modal');
  const formsForm = document.getElementById('forms-form');
  const categoryFilter = document.getElementById('forms-category-filter');
  const searchInput = document.getElementById('forms-search');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => openFormModal());
  }
  if (formsForm) {
    formsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveForm();
    });
  }
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => loadForms());
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => filterForms(searchInput.value));
  }
}
function loadForms() {
  const catFilter = document.getElementById('forms-category-filter');
  const cat = catFilter ? catFilter.value : '';
  const query = cat ? `?category=${encodeURIComponent(cat)}` : '';
  fetch(`/api/forms${query}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      globalForms = data;
      renderForms(globalForms);
    })
    .catch(err => {
      console.error('Erro ao carregar formulários:', err);
      showToast('Erro ao carregar formulários', 'error');
    });
}
function renderForms(list) {
  const container = document.getElementById('forms-container');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px; opacity: 0.5;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <h4 style="color: #ffffff; font-weight: 600; margin-bottom: 6px;">Nenhum formulário cadastrado</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Clique no botão "+ Cadastrar Formulário" acima para registrar o primeiro formulário.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = list.map(item => {
    const slug = item.slug || `form-${item.id}`;
    const linkToCopy = (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) 
      ? item.link 
      : `${window.location.origin}/f/${slug}`;
    return `
      <div class="route-card" style="background: rgba(22, 22, 26, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; border-top: 4px solid #ef4444; box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: all 0.3s ease;">
        <div class="route-card-header">
          <span class="route-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; letter-spacing: 0.5px; box-shadow: 0 0 10px rgba(239, 68, 68, 0.1);">${escapeHtml(item.category || 'Inspeção')}</span>
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
        <div style="display: flex; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.04);">
          <button class="btn" onclick="copyFormLink('${escapeHtml(linkToCopy)}')" style="flex: 1; font-size: 0.8rem; font-weight: 600; padding: 10px 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); color: #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" onmouseover="this.style.background='rgba(255,255,255,0.06)'; this.style.borderColor='rgba(255,255,255,0.15)';" onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.08)';">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; margin-right: 6px; color: #60a5fa;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
            </svg>
            Copiar Link
          </button>
          <button class="btn" onclick="openFormResponsesModal(${item.id}, '${escapeHtml(item.title)}')" style="flex: 1.3; font-size: 0.8rem; font-weight: 600; padding: 10px 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);" onmouseover="this.style.background='rgba(239,68,68,0.2)'; this.style.boxShadow='0 4px 15px rgba(239,68,68,0.3)';" onmouseout="this.style.background='rgba(239,68,68,0.1)'; this.style.boxShadow='0 4px 12px rgba(239,68,68,0.15)';">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; margin-right: 6px; color: #f87171;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"/>
            </svg>
            Indicadores & Respostas
          </button>
        </div>
      </div>
    `;
  }).join('');
}
function filterForms(term) {
  if (!term) {
    renderForms(globalForms);
    return;
  }
  term = term.toLowerCase();
  const filtered = globalForms.filter(f =>
    (f.title && f.title.toLowerCase().includes(term)) ||
    (f.description && f.description.toLowerCase().includes(term)) ||
    (f.category && f.category.toLowerCase().includes(term))
  );
  renderForms(filtered);
}
let currentActiveFormId = null;
let currentFormResponses = [];
window.copyFormLink = function(url) {
  if (!url) return;
  navigator.clipboard.writeText(url)
    .then(() => {
      showToast('Link do formulário copiado para a área de transferência!', 'success');
    })
    .catch(() => {
      prompt('Copie o link do formulário:', url);
    });
};
window.copyPublicFormLink = window.copyFormLink;
window.openFormResponsesModal = function(formId, formTitle) {
  currentActiveFormId = formId;
  const modal = document.getElementById('form-responses-modal');
  const titleEl = document.getElementById('form-responses-modal-title');
  if (titleEl) titleEl.textContent = `Indicadores e Respostas - ${formTitle}`;
  const tabAnalytics = document.getElementById('tab-btn-form-analytics');
  const tabIndividual = document.getElementById('tab-btn-form-individual');
  const viewAnalytics = document.getElementById('form-view-analytics');
  const viewIndividual = document.getElementById('form-view-individual');
  if (tabAnalytics && tabIndividual && viewAnalytics && viewIndividual) {
    tabAnalytics.onclick = () => {
      tabAnalytics.classList.add('active');
      tabAnalytics.style.background = 'var(--primary)';
      tabAnalytics.style.color = '#ffffff';
      tabAnalytics.style.borderColor = 'var(--primary)';
      tabIndividual.classList.remove('active');
      tabIndividual.style.background = 'transparent';
      tabIndividual.style.color = 'var(--text-muted)';
      tabIndividual.style.borderColor = 'var(--border)';
      viewAnalytics.style.display = 'block';
      viewIndividual.style.display = 'none';
    };
    tabIndividual.onclick = () => {
      tabIndividual.classList.add('active');
      tabIndividual.style.background = 'var(--primary)';
      tabIndividual.style.color = '#ffffff';
      tabIndividual.style.borderColor = 'var(--primary)';
      tabAnalytics.classList.remove('active');
      tabAnalytics.style.background = 'transparent';
      tabAnalytics.style.color = 'var(--text-muted)';
      tabAnalytics.style.borderColor = 'var(--border)';
      viewAnalytics.style.display = 'none';
      viewIndividual.style.display = 'block';
    };
  }
  fetch(`/api/forms/${formId}/responses`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      currentFormResponses = data || [];
      const countEl = document.getElementById('form-responses-count');
      if (countEl) countEl.textContent = currentFormResponses.length;
      renderFormAnalytics(currentFormResponses);
      renderFormIndividualResponses(currentFormResponses);
      if (modal) modal.classList.add('active');
    })
    .catch(err => {
      console.error('Erro ao carregar respostas:', err);
      showToast('Erro ao carregar respostas', 'error');
    });
};
function renderFormAnalytics(responses) {
  const kpiTotal = document.getElementById('kpi-total-responses');
  const kpiTechs = document.getElementById('kpi-unique-techs');
  const kpiRegions = document.getElementById('kpi-unique-regions');
  const listRegions = document.getElementById('analytics-regions-list');
  const listReasons = document.getElementById('analytics-reasons-list');
  if (kpiTotal) kpiTotal.textContent = responses.length;
  const techsSet = new Set();
  const regionsMap = {};
  const reasonsMap = {};
  responses.forEach(r => {
    if (r.technician_name) techsSet.add(r.technician_name.trim().toLowerCase());
    const ans = r.answers || {};
    let regVal = ans.region || ans.REGIÃO || ans.Região || '';
    if (Array.isArray(regVal)) regVal = regVal.join(', ');
    if (regVal) {
      regionsMap[regVal] = (regionsMap[regVal] || 0) + 1;
    }
    let reasVal = ans.reason || ans['Motivo do inventário'] || '';
    if (Array.isArray(reasVal)) reasVal = reasVal.join(', ');
    if (reasVal) {
      reasonsMap[reasVal] = (reasonsMap[reasVal] || 0) + 1;
    }
  });
  if (kpiTechs) kpiTechs.textContent = techsSet.size;
  if (kpiRegions) kpiRegions.textContent = Object.keys(regionsMap).length;
  if (listRegions) {
    const regEntries = Object.entries(regionsMap).sort((a, b) => b[1] - a[1]);
    if (regEntries.length === 0) {
      listRegions.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhuma região computada ainda.</span>`;
    } else {
      listRegions.innerHTML = regEntries.map(([reg, cnt]) => {
        const pct = responses.length ? Math.round((cnt / responses.length) * 100) : 0;
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.82rem;">
              <span style="color: #ffffff; font-weight: 600;">${escapeHtml(reg)}</span>
              <span style="color: #60a5fa; font-weight: 700;">${cnt} envios (${pct}%)</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  if (listReasons) {
    const reasEntries = Object.entries(reasonsMap).sort((a, b) => b[1] - a[1]);
    if (reasEntries.length === 0) {
      listReasons.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum motivo registrado ainda.</span>`;
    } else {
      listReasons.innerHTML = reasEntries.map(([reas, cnt]) => {
        const pct = responses.length ? Math.round((cnt / responses.length) * 100) : 0;
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.82rem;">
              <span style="color: #ffffff; font-weight: 600;">${escapeHtml(reas)}</span>
              <span style="color: #34d399; font-weight: 700;">${cnt} envios (${pct}%)</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}
function renderFormIndividualResponses(responses) {
  const tbody = document.getElementById('form-responses-table-body');
  if (!tbody) return;
  if (!responses || responses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Nenhuma resposta registrada para este formulário ainda.
        </td>
      </tr>
    `;
    return;
  }
  tbody.innerHTML = responses.map((r, idx) => {
    const dt = r.submitted_at ? new Date(r.submitted_at).toLocaleString('pt-BR') : '-';
    const ans = r.answers || {};
    const summary = ans.reason || ans['Motivo do inventário'] || ans.vehicle_location || 'Submissão de dados';
    return `
      <tr>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${dt}</td>
        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(r.technician_name || '-')}</td>
        <td style="color: #60a5fa; font-size: 0.85rem;">${escapeHtml(r.technician_email || '-')}</td>
        <td style="font-size: 0.85rem; color: #e2e8f0;">${escapeHtml(String(summary))}</td>
        <td>
          <button class="btn btn-outline" onclick="openSingleResponseModal(${idx})" style="font-size: 0.78rem; padding: 4px 10px;">
            👁️ Ver Ficha
          </button>
        </td>
      </tr>
    `;
  }).join('');
}
const FORM_FIELD_LABELS = {
  'email': 'E-mail',
  'date': 'Data',
  'region': 'REGIÃO',
  'region_other': 'Outra Região',
  'reason': 'Motivo do inventário',
  'reason_other': 'Outro Motivo do Inventário',
  'technician': 'Técnico',
  'vehicle_location': 'Carro ou Local',
  'ladder_qty': 'Quantidade de escada no carro',
  'ladder_other': 'Outro Detalhe de Escada',
  'inverter': 'Carro tem inversor ?',
  'inverter_other': 'Outro Detalhe de Inversor',
  'tent': 'Barraca para fusão',
  'tent_other': 'Outro Detalhe de Barraca',
  'table_chairs': 'Carro tem mesa e duas cadeiras',
  'table_chairs_other': 'Outro Detalhe de Mesa/Cadeiras',
  'fusion_machine': 'Máquina de fusão',
  'fusion_owner': 'Proprietário da Máquina de fusão',
  'cleaver': 'CLIVADOR',
  'cleaver_owner': 'Proprietário do Clivador',
  'stripper_pliers': 'Carro tem alicate decapador?',
  'vfl_light': 'Carro tem luz visivel?',
  'vfl_owner': 'Proprietário da luz visivel',
  'otdr': 'OTDR',
  'otdr_owner': 'Proprietário do OTDR',
  'power_meter': 'POWER METER',
  'power_meter_owner': 'Proprietário do Power Meter',
  'slitter': 'Roletador',
  'active_fiber_tester': 'Testador de Fibra ativa',
  'active_fiber_tester_owner': 'Proprietário do Testador de Fibra Ativa',
  'meter_details': 'Medidor - Marca / Modelo /Número de Serie',
  'label_maker': 'Etiquetadora',
  'label_maker_other': 'Outro Detalhe de Etiquetadora',
  'items_to_buy': 'O que precisamos comprar ou providenciar?',
  'photos': 'Foto importante quando solicitado',
  'notes': 'Observação :'
};
window.openSingleResponseModal = function(idx) {
  const r = currentFormResponses[idx];
  if (!r) return;
  const modal = document.getElementById('form-single-response-modal');
  const title = document.getElementById('single-response-title');
  const content = document.getElementById('single-response-content');
  if (title) title.textContent = `Ficha do Técnico: ${r.technician_name || 'Técnico'}`;
  const ans = r.answers || {};
  let html = `<table class="data-table" style="width: 100%;">
    <thead>
      <tr>
        <th style="width: 45%; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">PERGUNTA / CAMPO</th>
        <th style="width: 55%; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">RESPOSTA REGISTRADA</th>
      </tr>
    </thead>
    <tbody>`;
  Object.entries(ans).forEach(([k, v]) => {
    if (k === 'form_slug' || k.endsWith('_other')) return; 
    const label = FORM_FIELD_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Check if value contains images/photos
    let isPhotoField = false;
    let photoUrls = [];
    
    if (Array.isArray(v)) {
      photoUrls = v.filter(item => typeof item === 'string' && (item.startsWith('/uploads/') || item.match(/\.(png|jpg|jpeg|webp|gif)$/i)));
      if (photoUrls.length > 0) isPhotoField = true;
    } else if (typeof v === 'string' && (v.startsWith('/uploads/') || v.match(/\.(png|jpg|jpeg|webp|gif)$/i))) {
      isPhotoField = true;
      photoUrls = [v];
    } else if (typeof v === 'string' && v.includes('/uploads/')) {
      isPhotoField = true;
      photoUrls = v.split(/\s*\|\s*|\s*,\s*/).filter(item => item.startsWith('/uploads/'));
    }

    let cellContent = '';
    if (isPhotoField && photoUrls.length > 0) {
      cellContent = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-top: 4px;">
          ${photoUrls.map((pUrl, pIdx) => `
            <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span style="font-size: 0.72rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Foto ${pIdx + 1}</span>
              <a href="${pUrl}" target="_blank" style="width: 100%; height: 90px; border-radius: 6px; overflow: hidden; display: block; border: 1px solid rgba(255,255,255,0.1); background: #000;">
                <img src="${pUrl}" alt="Foto ${pIdx + 1}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              </a>
              <a href="${pUrl}" target="_blank" class="btn btn-outline" style="font-size: 0.72rem; padding: 3px 8px; width: 100%; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                👁️ Ver Foto ${pIdx + 1}
              </a>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      let valStr = Array.isArray(v) ? v.join(', ') : String(v || '-');
      if (!valStr.trim()) valStr = '-';
      cellContent = valStr === '-' ? '<span style="color: var(--text-muted);">-</span>' : escapeHtml(valStr);
    }

    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="font-weight: 600; color: #e2e8f0; font-size: 0.85rem; padding: 12px 14px; vertical-align: top;">${escapeHtml(label)}</td>
        <td style="color: #ffffff; font-size: 0.88rem; font-weight: 500; padding: 12px 14px;">
          ${cellContent}
        </td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  if (content) content.innerHTML = html;
  if (modal) modal.classList.add('active');
};
window.exportCurrentFormResponses = function() {
  if (!currentActiveFormId) {
    showToast('Nenhum formulário selecionado para exportação.', 'error');
    return;
  }
  window.location.href = `/api/forms/${currentActiveFormId}/responses/export`;
};
window.openFormResponsesImportModal = function() {
  const modal = document.getElementById('form-responses-import-modal');
  const txt = document.getElementById('form-responses-csv-text');
  const fileInput = document.getElementById('form-responses-file-input');
  if (txt) txt.value = '';
  if (fileInput) fileInput.value = '';
  if (modal) modal.classList.add('active');
};
window.extractDownloadsExcel = function() {
  const btn = document.getElementById('btn-extract-downloads-excel');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extraindo dados da planilha...';
  }
  fetch('/api/admin/extract_machinery_excel', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Importar Direto: "2 - Inventário - Maquina e ferramentas.xlsx" (Downloads)';
      }
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast(`Sucesso! ${data.imported} respostas foram extraídas do arquivo Excel de Downloads!`, 'success');
      const modal = document.getElementById('form-responses-import-modal');
      if (modal) modal.classList.remove('active');
      if (currentActiveFormId) {
        openFormResponsesModal(currentActiveFormId, 'Formulário');
      }
    })
    .catch(err => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Importar Direto: "2 - Inventário - Maquina e ferramentas.xlsx" (Downloads)';
      }
      console.error('Erro na extração:', err);
      showToast('Erro ao processar extração do arquivo Excel', 'error');
    });
};
document.addEventListener('DOMContentLoaded', () => {
  initRouteFolderEvents();
  const fileInput = document.getElementById('form-responses-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (window.XLSX) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet], { FS: ';' });
            const txt = document.getElementById('form-responses-csv-text');
            if (txt) {
              txt.value = csv;
              showToast(`Arquivo "${file.name}" carregado! Clique em 'Processar Importação'.`, 'success');
            }
          } catch (err) {
            console.error('Erro ao ler Excel:', err);
            showToast('Erro ao ler arquivo Excel. Tente salvar como CSV.', 'error');
          }
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }
  const btnSaveImport = document.getElementById('btn-save-form-responses-import');
  if (btnSaveImport) {
    btnSaveImport.addEventListener('click', () => {
      if (!currentActiveFormId) {
        showToast('Nenhum formulário ativo para importação.', 'error');
        return;
      }
      const csvText = document.getElementById('form-responses-csv-text').value.trim();
      if (!csvText) {
        showToast('Selecione um arquivo Excel (.xlsx, .xls) ou cole os dados.', 'error');
        return;
      }
      btnSaveImport.disabled = true;
      btnSaveImport.textContent = 'Processando...';
      fetch(`/api/forms/${currentActiveFormId}/responses/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvText })
      })
      .then(res => res.json())
      .then(data => {
        btnSaveImport.disabled = false;
        btnSaveImport.textContent = 'Processar Importação';
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        showToast(`${data.imported} respostas do Excel importadas com sucesso!`, 'success');
        const modal = document.getElementById('form-responses-import-modal');
        if (modal) modal.classList.remove('active');
        openFormResponsesModal(currentActiveFormId, 'Formulário');
      })
      .catch(err => {
        btnSaveImport.disabled = false;
        btnSaveImport.textContent = 'Processar Importação';
        console.error('Erro na importação de respostas:', err);
        showToast('Erro ao processar importação de respostas', 'error');
      });
    });
  }
});
window.openFormModal = function() {
  const modal = document.getElementById('form-modal');
  const title = document.getElementById('form-modal-title');
  const fId = document.getElementById('form-id');
  const fTitle = document.getElementById('form-title');
  const fCat = document.getElementById('form-category');
  const fLink = document.getElementById('form-link');
  const fDesc = document.getElementById('form-description');
  if (title) title.textContent = 'Cadastrar Formulário';
  if (fId) fId.value = '';
  if (fTitle) fTitle.value = '';
  if (fCat) fCat.value = 'Inspeção';
  if (fLink) fLink.value = '';
  if (fDesc) fDesc.value = '';
  if (modal) modal.classList.add('active');
};
window.openEditFormModal = function(id) {
  const item = globalForms.find(f => f.id === id);
  if (!item) return;
  const modal = document.getElementById('form-modal');
  const title = document.getElementById('form-modal-title');
  const fId = document.getElementById('form-id');
  const fTitle = document.getElementById('form-title');
  const fCat = document.getElementById('form-category');
  const fLink = document.getElementById('form-link');
  const fDesc = document.getElementById('form-description');
  if (title) title.textContent = 'Editar Formulário';
  if (fId) fId.value = item.id;
  if (fTitle) fTitle.value = item.title;
  if (fCat) fCat.value = item.category || 'Inspeção';
  if (fLink) fLink.value = item.link || '';
  if (fDesc) fDesc.value = item.description || '';
  if (modal) modal.classList.add('active');
};
function saveForm() {
  const id = document.getElementById('form-id').value;
  const title = document.getElementById('form-title').value.trim();
  const category = document.getElementById('form-category').value;
  const link = document.getElementById('form-link').value.trim();
  const description = document.getElementById('form-description').value.trim();
  if (!title) {
    showToast('Informe o nome do formulário.', 'error');
    return;
  }
  const payload = { title, category, link, description };
  const url = id ? `/api/forms/${id}` : '/api/forms';
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(id ? 'Formulário atualizado!' : 'Formulário cadastrado com sucesso!', 'success');
    const modal = document.getElementById('form-modal');
    if (modal) modal.classList.remove('active');
    loadForms();
  })
  .catch(err => {
    console.error('Erro ao salvar formulário:', err);
    showToast('Erro ao salvar formulário', 'error');
  });
}
window.deleteForm = function(id, title) {
  if (!confirm(`Deseja excluir permanentemente o formulário "${title}"?`)) return;
  fetch(`/api/forms/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast('Formulário excluído com sucesso!', 'success');
      loadForms();
    })
    .catch(err => {
      console.error('Erro ao excluir formulário:', err);
      showToast('Erro ao excluir formulário', 'error');
    });
};
let activeBuscadorTopic = 'RAL';
let buscadorSearchTimeout = null;
let currentBuscadorData = { columns: [], records: [] };
function initBuscadorEvents() {
  const topicBtns = document.querySelectorAll('.btn-buscador-topic');
  topicBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.getAttribute('data-topic');
      if (topic === activeBuscadorTopic) return;
      activeBuscadorTopic = topic;
      topicBtns.forEach(b => {
        if (b.getAttribute('data-topic') === activeBuscadorTopic) {
          b.classList.add('active');
          b.style.background = '#23232b';
          b.style.color = '#ffffff';
        } else {
          b.classList.remove('active');
          b.style.background = '#16161a';
          b.style.color = 'var(--text-muted)';
        }
      });
      const searchInput = document.getElementById('buscador-search-input');
      if (searchInput) searchInput.value = '';
      const routeSelect = document.getElementById('buscador-route-select');
      if (routeSelect) routeSelect.value = '';
      loadBuscadorTab();
    });
  });
  const searchInput = document.getElementById('buscador-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(buscadorSearchTimeout);
      buscadorSearchTimeout = setTimeout(() => {
        loadBuscadorTab();
      }, 300);
    });
  }
  const routeSelect = document.getElementById('buscador-route-select');
  if (routeSelect) {
    routeSelect.addEventListener('change', () => {
      loadBuscadorTab();
    });
  }
  const btnOpenUpload = document.getElementById('btn-open-buscador-upload');
  if (btnOpenUpload) {
    btnOpenUpload.addEventListener('click', () => {
      const modal = document.getElementById('buscador-upload-modal');
      const title = document.getElementById('buscador-upload-title');
      const topicInput = document.getElementById('buscador-upload-topic');
      const fileInput = document.getElementById('buscador-file-input');
      if (title) title.textContent = `Carregar Nova Base (${activeBuscadorTopic})`;
      if (topicInput) topicInput.value = activeBuscadorTopic;
      if (fileInput) fileInput.value = '';
      if (modal) modal.classList.add('active');
    });
  }
  const uploadForm = document.getElementById('buscador-upload-form');
  if (uploadForm) {
    uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('buscador-file-input');
      if (!fileInput || !fileInput.files.length) {
        showToast('Selecione uma planilha para carregar.', 'error');
        return;
      }
      const submitBtn = document.getElementById('btn-submit-buscador-upload');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Substituindo base...';
      }
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('topic', activeBuscadorTopic);
      fetch('/api/buscador/upload', {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Substituir Base';
        }
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        showToast(data.message || 'Base substituída com sucesso!', 'success');
        const modal = document.getElementById('buscador-upload-modal');
        if (modal) modal.classList.remove('active');
        loadBuscadorTab();
      })
      .catch(err => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Substituir Base';
        }
        console.error('Erro no upload da base:', err);
        showToast('Erro ao processar o upload da base.', 'error');
      });
    });
  }
  const btnExport = document.getElementById('btn-buscador-export');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const searchVal = document.getElementById('buscador-search-input')?.value.trim() || '';
      const routeVal = document.getElementById('buscador-route-select')?.value.trim() || '';
      const exportUrl = `/api/buscador/export?topic=${activeBuscadorTopic}&search=${encodeURIComponent(searchVal)}&route=${encodeURIComponent(routeVal)}`;
      showToast(searchVal || routeVal ? 'Gerando planilha com os filtros de busca aplicados...' : 'Baixando planilha da base...', 'info');
      fetch(exportUrl)
        .then(res => {
          if (!res.ok) throw new Error('Falha ao gerar o arquivo de exportação');
          return res.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
          const searchSuffix = searchVal ? `_filtrado_${searchVal.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
          link.href = url;
          link.download = `Buscador_${activeBuscadorTopic}${searchSuffix}_${dateStr}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showToast('Base exportada com sucesso com os filtros aplicados!', 'success');
        })
        .catch(err => {
          console.error('Erro ao exportar base:', err);
          showToast('Erro ao exportar base.', 'error');
        });
    });
  }
  const btnWhatsapp = document.getElementById('btn-buscador-whatsapp');
  if (btnWhatsapp) {
    btnWhatsapp.addEventListener('click', () => {
      const searchVal = document.getElementById('buscador-search-input')?.value.trim() || '';
      const routeVal = document.getElementById('buscador-route-select')?.value.trim() || '';
      const records = currentBuscadorData.records || [];
      const columns = currentBuscadorData.columns || [];
      if (!records.length) {
        showToast('Nenhum resultado para enviar no WhatsApp.', 'error');
        return;
      }
      let msg = `🚨 *REDE EXTERNA - RELATÓRIO DE FALHAS (${activeBuscadorTopic})* 🚨\n`;
      if (searchVal) {
        msg += `🔍 *Filtro de Pesquisa:* ${searchVal}\n`;
      }
      if (routeVal) {
        msg += `🛣️ *Filtro de Rota:* ${routeVal}\n`;
      }
      msg += `📊 *Total Encontrado:* ${records.length} ocorrência(s)\n`;
      msg += `-------------------------------------------\n\n`;
      const limit = Math.min(records.length, 15);
      for (let i = 0; i < limit; i++) {
        const r = records[i];
        const desig = r[0] || '-';
        const num = r[1] || '-';
        const dta = r[2] || '-';
        const subc = r[3] || '-';
        const ocorr = r[4] || '-';
        const ender = r[5] || '-';
        msg += `*${i + 1}. ${desig}* (Nº: ${num})\n`;
        msg += `   • *Ocorrência:* ${ocorr}\n`;
        msg += `   • *Endereço:* ${ender}\n`;
        msg += `   • *SubCluster:* ${subc} | *Abertura:* ${dta}\n\n`;
      }
      if (records.length > limit) {
        msg += `... e mais *${records.length - limit}* ocorrências encontradas no painel.`;
      }
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    });
  }
  const editDistForm = document.getElementById('buscador-edit-distance-form');
  if (editDistForm) {
    editDistForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const recId = document.getElementById('buscador-edit-distance-rec-id')?.value;
      const distVal = document.getElementById('buscador-edit-distance-input')?.value.trim() || '';
      const refVal = document.getElementById('buscador-edit-ref-input')?.value.trim() || '';
      if (!recId) {
        showToast('ID de registro inválido.', 'error');
        return;
      }
      const submitBtn = document.getElementById('btn-submit-edit-distance');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvando...';
      }
      fetch(`/api/buscador/records/${recId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance: distVal, ref: refVal })
      })
      .then(res => res.json())
      .then(data => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar Alterações';
        }
        if (data.error) {
          showToast(`Erro: ${data.error}`, 'error');
          return;
        }
        showToast('Distância e REF salvas com sucesso!', 'success');
        const modal = document.getElementById('buscador-edit-distance-modal');
        if (modal) modal.classList.remove('active');
        loadBuscadorTab();
      })
      .catch(err => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar Alterações';
        }
        console.error('Erro ao atualizar registro:', err);
        showToast('Erro de conexão ao salvar alterações.', 'error');
      });
    });
  }
}
window.sendSingleRowWhatsapp = function(idx) {
  const records = currentBuscadorData.records || [];
  const cols = currentBuscadorData.columns || [];
  const r = records[idx];
  if (!r) return;
  let msg = `🚨 *ATENÇÃO TÉCNICO - OCORRÊNCIA DE REDE (${activeBuscadorTopic})* 🚨\n\n`;
  msg += `📍 *${cols[0] || 'Designação / Rota'}:* ${r[0] || '-'}\n`;
  msg += `🔢 *${cols[1] || 'Chamado / Ticket'}:* ${r[1] || '-'}\n`;
  msg += `*${cols[2] || 'Data Abertura'}:* ${r[2] || '-'}\n`;
  msg += `🌐 *${cols[3] || 'SubCluster'}:* ${r[3] || '-'}\n`;
  msg += `📏 *${cols[4] || 'Distância'}:* ${r[4] || '-'}\n`;
  msg += `🔖 *${cols[5] || 'REF'}:* ${r[5] || '-'}\n`;
  msg += `🏠 *${cols[6] || 'Endereço'}:* ${r[6] || '-'}\n`;
  msg += `🗓️ *${cols[7] || 'Mês'}:* ${r[7] || '-'}\n`;
  msg += `👤 *${cols[8] || 'Ofensor'}:* ${r[8] || '-'}\n`;
  msg += `⚠️ *${cols[9] || 'Ocorrência / Causa'}:* ${r[9] || '-'}\n`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
};
window.editBuscadorDistance = function(idx, recId) {
  if (!isSupervisorOrCoordenador()) {
    showToast('Você não tem permissão para isso', 'error', 3000);
    return;
  }
  const records = currentBuscadorData.records || [];
  const r = records[idx];
  if (!r) return;
  const codeVal = r[1] || r[0] || 'Registro';
  const currentDist = r[4] || '';
  const currentRef = r[5] || '';
  const modal = document.getElementById('buscador-edit-distance-modal');
  const title = document.getElementById('buscador-edit-distance-title');
  const recIdInput = document.getElementById('buscador-edit-distance-rec-id');
  const distInput = document.getElementById('buscador-edit-distance-input');
  const refInput = document.getElementById('buscador-edit-ref-input');
  if (title) title.textContent = `Editar Distância & REF: Código [${codeVal}] (${activeBuscadorTopic})`;
  if (recIdInput) recIdInput.value = recId;
  if (distInput) distInput.value = currentDist;
  if (refInput) refInput.value = currentRef;
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (distInput) {
        distInput.focus();
        distInput.select();
      }
    }, 100);
  }
};
function loadBuscadorTab() {
  const searchInput = document.getElementById('buscador-search-input');
  const searchVal = searchInput ? searchInput.value.trim() : '';
  const routeSelect = document.getElementById('buscador-route-select');
  const routeVal = routeSelect ? routeSelect.value.trim() : '';
  const updateInfo = document.getElementById('buscador-update-info');
  const recordCountInfo = document.getElementById('buscador-record-count');
  const tableHeader = document.getElementById('buscador-table-header');
  const tableBody = document.getElementById('buscador-table-body');
  const routeWrapper = document.getElementById('buscador-route-wrapper');
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 30px; color: var(--text-muted);">Carregando dados da base ${activeBuscadorTopic}...</td></tr>`;
  }
  fetch(`/api/buscador/records?topic=${activeBuscadorTopic}&search=${encodeURIComponent(searchVal)}&route=${encodeURIComponent(routeVal)}`)
    .then(res => res.json())
    .then(data => {
      currentBuscadorData = {
        columns: data.columns || [],
        records: data.records || []
      };
      if (routeSelect && data.routes) {
        const currentSelected = routeSelect.value;
        let html = '<option value="">Todas as Rotas</option>';
        data.routes.forEach(r => {
          const isSel = (r === currentSelected) ? 'selected' : '';
          html += `<option value="${escapeHtml(r)}" ${isSel}>${escapeHtml(r)}</option>`;
        });
        routeSelect.innerHTML = html;
        routeSelect.value = currentSelected;
      }
      if (routeWrapper) {
        if (activeBuscadorTopic === 'HFC' || (data.routes && data.routes.length > 0)) {
          routeWrapper.style.display = 'flex';
        } else {
          routeWrapper.style.display = 'none';
        }
      }
      if (updateInfo) {
        updateInfo.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #30d158;"></span> Atualizado ${data.last_updated || 'Não carregado'}`;
      }
      if (recordCountInfo) {
        recordCountInfo.textContent = `${data.record_count || 0} de ${data.total_records || 0} registros mostrados`;
      }
      if (tableHeader && data.columns) {
        tableHeader.innerHTML = data.columns.map(col => `<th style="text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.5px; white-space: nowrap;">${escapeHtml(col)}</th>`).join('') + `<th style="text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.5px; white-space: nowrap; text-align: center;">AÇÕES</th>`;
      }
      if (tableBody) {
        if (!data.records || !data.records.length) {
          tableBody.innerHTML = `<tr><td colspan="${data.columns ? data.columns.length + 1 : 11}" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum registro encontrado na base do ${escapeHtml(activeBuscadorTopic)}. ${data.record_count === 0 ? 'Use o botão "Carregar arquivo" para enviar a planilha.' : ''}</td></tr>`;
          return;
        }
        const cols = data.columns || [];
        const addressColIndices = new Set();
        cols.forEach((colName, cIdx) => {
          const upperCol = (colName || '').toUpperCase();
          if (upperCol.includes('ENDEREÇO') || upperCol.includes('ENDERECO') || upperCol.includes('LOGRADOURO') || upperCol.includes('LOCAL')) {
            addressColIndices.add(cIdx);
          }
        });
        if (addressColIndices.size === 0 && cols.length > 6) {
          addressColIndices.add(6);
        }
        data.records.sort((a, b) => {
          let aIsSemEnd = false;
          let bIsSemEnd = false;
          addressColIndices.forEach(cIdx => {
            if (a[cIdx] && a[cIdx].toString().toUpperCase().includes('SEM ENDERE')) aIsSemEnd = true;
            if (b[cIdx] && b[cIdx].toString().toUpperCase().includes('SEM ENDERE')) bIsSemEnd = true;
          });
          if (aIsSemEnd && !bIsSemEnd) return 1;
          if (!aIsSemEnd && bIsSemEnd) return -1;
          return 0;
        });
        tableBody.innerHTML = data.records.map((row, idx) => {
          const recId = row[10];
          const isEdited = row[11];
          const distStyle = isEdited ? 'white-space: nowrap; color: #ecc94b; font-weight: 700;' : 'white-space: nowrap;';
          const distBadge = isEdited ? ' ✏️' : '';
          const refStyle = isEdited ? 'white-space: nowrap; color: #ecc94b; font-weight: 700;' : 'white-space: nowrap;';
          let rowCellsHtml = '';
          cols.forEach((colName, cIdx) => {
            const rawVal = (row[cIdx] || '').toString().trim();
            const upperVal = rawVal.toUpperCase();
            const isAddressCell = addressColIndices.has(cIdx) || /^(estrada|rua|r\.|av\.|avenida|alameda|rodovia|praça|praca|travessa|servidão|servidao|est\b|res\s+\w+)/i.test(rawVal);
            let cellContent = escapeHtml(rawVal || '-');
            if (isAddressCell && rawVal && rawVal !== '-' && upperVal !== 'N/A') {
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawVal)}`;
              cellContent = `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" 
                                style="color: #38bdf8; font-weight: 600; text-decoration: none; transition: color 0.15s ease;" 
                                onmouseover="this.style.color='#7dd3fc'; this.style.textDecoration='underline';" 
                                onmouseout="this.style.color='#38bdf8'; this.style.textDecoration='none';" 
                                title="Clique para abrir '${escapeHtml(rawVal)}' no Google Maps">
                                ${escapeHtml(rawVal)}
                             </a>`;
            }
            if (cIdx === 0) {
              rowCellsHtml += `<td style="font-weight: 700; color: #ffffff; white-space: nowrap;">${cellContent}</td>`;
            } else if (cIdx === 4) {
              rowCellsHtml += `<td style="${distStyle}" title="${isEdited ? 'Distância editada manualmente' : ''}">${cellContent}${distBadge}</td>`;
            } else if (cIdx === 5) {
              rowCellsHtml += `<td style="${refStyle}" title="${isEdited ? 'REF editada manualmente' : ''}">${cellContent}</td>`;
            } else if (isAddressCell) {
              rowCellsHtml += `<td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(rawVal)}">${cellContent}</td>`;
            } else if (cIdx === 9) {
              rowCellsHtml += `<td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(rawVal)}">${cellContent}</td>`;
            } else {
              rowCellsHtml += `<td style="white-space: nowrap;">${cellContent}</td>`;
            }
          });
          return `<tr>
            ${rowCellsHtml}
            <td style="text-align: center; white-space: nowrap;">
              <div style="display: inline-flex; align-items: center; gap: 6px;">
                <button class="btn btn-icon" onclick="editBuscadorDistance(${idx}, ${recId})" title="Editar Distância & REF (${escapeHtml(activeBuscadorTopic)})" style="background: rgba(236, 201, 75, 0.12); border: 1px solid rgba(236, 201, 75, 0.4); color: #ecc94b; padding: 5px 8px; border-radius: 6px; cursor: pointer;">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 14px; height: 14px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                </button>
                <button class="btn btn-icon" onclick="sendSingleRowWhatsapp(${idx})" title="Encaminhar esta ocorrência via WhatsApp" style="background: rgba(37, 211, 102, 0.12); border: 1px solid rgba(37, 211, 102, 0.4); color: #25D366; padding: 5px 8px; border-radius: 6px; cursor: pointer;">
                  <svg fill="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('');
      }
    })
    .catch(err => {
      console.error('Erro ao carregar Buscador:', err);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 30px; color: var(--danger);">Erro ao carregar dados do ${activeBuscadorTopic}.</td></tr>`;
      }
    });
}
function initProjectDragAndDropAndPaste() {
  const dropzone = document.getElementById('projects-dropzone');
  const projectsTab = document.getElementById('projects-tab');
  if (!projectsTab) return;
  function uploadFilesToProject(files) {
    if (!files || files.length === 0) return;
    showToast(`Enviando ${files.length} arquivo(s)...`, 'info', 2500);
    let completed = 0;
    let errCount = 0;
    Array.from(files).forEach(file => {
      const formData = new FormData();
      const filename = file.name || 'Arquivo_Enviado';
      formData.append('name', filename);
      formData.append('description', 'Enviado via Arrastar/Colar');
      if (currentFolderId !== null && currentFolderId !== undefined) {
        formData.append('folder_id', currentFolderId);
      }
      const lowerName = filename.toLowerCase();
      if (lowerName.endsWith('.kmz') || lowerName.endsWith('.kml')) {
        formData.append('kmz_file', file);
      } else {
        formData.append('pdf_file', file);
      }
      fetch('/api/projects', {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        completed++;
        if (data.error) errCount++;
        if (completed === files.length) {
          if (errCount > 0) {
            showToast('Arquivos processados com alguns alertas.', 'warning');
          } else {
            showToast(`${files.length} arquivo(s) salvo(s) na pasta com sucesso!`, 'success');
          }
          loadFoldersAndProjects();
        }
      })
      .catch(err => {
        completed++;
        errCount++;
        console.error('Erro ao enviar arquivo:', err);
        if (completed === files.length) {
          showToast('Arquivos enviados.', 'info');
          loadFoldersAndProjects();
        }
      });
    });
  }
  ['dragenter', 'dragover'].forEach(eventName => {
    projectsTab.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzone) {
        dropzone.style.borderColor = 'var(--primary)';
        dropzone.style.background = 'rgba(236, 201, 75, 0.08)';
      }
    }, false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    projectsTab.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzone) {
        dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
        dropzone.style.background = 'rgba(255,255,255,0.01)';
      }
    }, false);
  });
  projectsTab.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      uploadFilesToProject(dt.files);
    }
  });
  if (dropzone) {
    dropzone.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          uploadFilesToProject(e.target.files);
        }
      };
      fileInput.click();
    });
  }
  window.addEventListener('paste', (e) => {
    const activeTab = document.getElementById('projects-tab');
    if (!activeTab || !activeTab.classList.contains('active')) return;
    const activeElem = document.activeElement;
    if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA' || activeElem.isContentEditable)) {
      return;
    }
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      uploadFilesToProject(e.clipboardData.files);
    }
  });
}
let currentEscalaActiveStatus = 'Folga';
let currentEscalaData = null;
let isMouseDownEscala = false;
let pendingEscalaBatchUpdates = {};
let escalaBatchTimeout = null;
function loadEscalaTab() {
  const monthInput = document.getElementById('escala-filter-month');
  if (monthInput && !monthInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${yyyy}-${mm}`;
  }
  loadEscalaAreas().then(() => {
    loadEscalaData();
  });
}
function loadEscalaAreas() {
  const areaSelect = document.getElementById('escala-filter-area');
  if (!areaSelect) return Promise.resolve();
  const savedArea = areaSelect.value;
  return fetch('/api/technicians')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        const set = new Set();
        data.forEach(t => {
          if (t.area && t.area.trim()) {
            const parts = t.area.split(',');
            parts.forEach(p => {
              const cleaned = p.trim();
              if (cleaned) set.add(cleaned);
            });
          }
        });
        const sortedAreas = Array.from(set).sort();
        areaSelect.innerHTML = `<option value="">-- Selecione a Área --</option>` +
          sortedAreas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
        if (savedArea && sortedAreas.includes(savedArea)) {
          areaSelect.value = savedArea;
        }
      }
    })
    .catch(err => console.error("Error loading escala areas:", err));
}
function loadEscalaData() {
  const monthInput = document.getElementById('escala-filter-month');
  const areaSelect = document.getElementById('escala-filter-area');
  const companySelect = document.getElementById('escala-filter-company');
  const searchInput = document.getElementById('escala-filter-search');
  const emptyNotice = document.getElementById('escala-empty-notice');
  const tableWrapper = document.getElementById('escala-table-wrapper');
  const painterBar = document.getElementById('escala-painter-bar');
  if (!areaSelect || !areaSelect.value) {
    if (emptyNotice) emptyNotice.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (painterBar) painterBar.style.display = 'none';
    return;
  }
  const month = monthInput ? monthInput.value : '';
  const area = areaSelect.value;
  const company = companySelect ? companySelect.value : 'Todas';
  const search = searchInput ? searchInput.value.trim() : '';
  const params = new URLSearchParams({
    month: month,
    area: area,
    company: company,
    search: search
  });
  fetch(`/api/schedules?${params.toString()}`)
    .then(res => {
      if (!res.ok) {
        return res.json().then(errData => {
          throw new Error(errData.error || `Erro HTTP ${res.status}`);
        }).catch(() => {
          throw new Error(`Erro no servidor (${res.status})`);
        });
      }
      return res.json();
    })
    .then(data => {
      if (data.error) {
        showToast(`Erro: ${data.error}`, 'error');
        return;
      }
      if (data.area_required) {
        if (emptyNotice) emptyNotice.style.display = 'block';
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (painterBar) painterBar.style.display = 'none';
        return;
      }
      if (emptyNotice) emptyNotice.style.display = 'none';
      if (tableWrapper) tableWrapper.style.display = 'block';
      if (painterBar) painterBar.style.display = 'flex';
      currentEscalaData = data;
      renderEscalaGrid(data);
    })
    .catch(err => {
      console.error("Error loading escala schedules:", err);
      showToast(`Falha ao carregar a escala: ${err.message}`, 'error');
    });
}
function renderEscalaGrid(data) {
  const daysHeader = document.getElementById('escala-table-header-days');
  const weekdaysHeader = document.getElementById('escala-table-header-weekdays');
  const tbody = document.getElementById('escala-table-body');
  if (!daysHeader || !weekdaysHeader || !tbody) return;
  const days = data.days_in_month || [];
  const techs = data.technicians || [];
  daysHeader.innerHTML = `
    <th style="position: sticky; left: 0; z-index: 20; background: rgba(22, 22, 26, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 14px; text-align: left; min-width: 220px; font-weight: 800; color: #ffffff;">
      Coordenador / Técnico
    </th>
    ` + days.map(d => {
      const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.05);' : 'background: rgba(255,255,255,0.02);';
      return `<th style="${bg} border-bottom: 1px solid rgba(255,255,255,0.05); border-left: 1px solid rgba(255,255,255,0.03); padding: 10px 6px; text-align: center; font-size: 0.8rem; font-weight: 800; color: #f8fafc; min-width: 90px;">
        ${d.day_label}
      </th>`;
    }).join('');
  weekdaysHeader.innerHTML = `
    <th style="position: sticky; left: 0; z-index: 20; background: rgba(22, 22, 26, 0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 6px 14px 12px 14px; text-align: left; font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase;">
      Turno / Função
    </th>
    ` + days.map(d => {
      const bg = d.is_weekend ? 'background: rgba(59, 130, 246, 0.08); color: #60a5fa;' : 'background: rgba(255,255,255,0.01); color: #94a3b8;';
      return `<th style="${bg} border-bottom: 1px solid rgba(255,255,255,0.05); border-left: 1px solid rgba(255,255,255,0.03); padding: 4px 6px 10px 6px; text-align: center; font-size: 0.72rem; font-weight: 700; text-transform: lowercase;">
        ${d.day_name}
      </th>`;
    }).join('');
  if (techs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${days.length + 1}" class="text-center text-muted" style="padding: 40px;">Nenhum colaborador localizado na área "${escapeHtml(data.area)}".</td></tr>`;
    return;
  }
  let html = '';
  techs.forEach(t => {
    const isCoord = (t.role || '').toUpperCase().includes('COORDENADOR') || (t.role || '').toUpperCase().includes('ADMIN');
    const badgeBg = isCoord ? 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);' : 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);';
    html += `<tr style="background: transparent;">`;
    html += `
      <td style="position: sticky; left: 0; z-index: 10; background: rgba(22, 22, 26, 0.95); backdrop-filter: blur(12px); border-right: 1px solid rgba(255,255,255,0.05); border-top: 1px solid rgba(255,255,255,0.05); padding: 12px 14px; vertical-align: middle;">
        <div style="font-weight: 800; color: #ffffff; font-size: 0.92rem; white-space: nowrap;">${escapeHtml(t.name)}</div>
        <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; ${badgeBg}">${escapeHtml(t.role)}</span>
          <span style="font-size: 0.7rem; color: #94a3b8;">${escapeHtml(t.company)}</span>
        </div>
      </td>
    `;
    days.forEach(d => {
      const sched = (t.schedules && t.schedules[d.date]) || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
      const statusStyle = getEscalaStatusStyle(sched.status);
      let textContent = sched.status;
      if (sched.status === 'Trabalho') {
        textContent = sched.work_hours || '08 às 17:48hs';
      }
      html += `
        <td class="escala-day-cell" data-tech-id="${t.id}" data-date="${d.date}" 
            style="border-left: 1px solid rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 6px; cursor: pointer; user-select: none; transition: transform 0.1s ease;"
            title="Clique para pintar como ${currentEscalaActiveStatus}">
          <div style="${statusStyle} border-radius: 8px; width: 100%; height: 100%; min-height: 38px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; padding: 4px;">
            ${escapeHtml(textContent)}
          </div>
        </td>
      `;
    });
    html += `</tr>`;
    html += `<tr style="background: transparent;">`;
    html += `
      <td style="position: sticky; left: 0; z-index: 10; background: rgba(18, 18, 22, 0.95); backdrop-filter: blur(12px); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px 14px 10px 14px; text-align: right; vertical-align: middle;">
        <span style="font-size: 0.74rem; font-weight: 700; color: #94a3b8; text-transform: lowercase;">sobreaviso</span>
      </td>
    `;
    days.forEach(d => {
      const sched = (t.schedules && t.schedules[d.date]) || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
      const onCallVal = sched.on_call || '0';
      const onCallBg = onCallVal !== '0' ? 'color: #38bdf8; font-weight: 800; background: rgba(56, 189, 248, 0.12); border-radius: 6px;' : 'color: #475569; font-weight: 600;';
      html += `
        <td class="escala-oncall-cell" data-tech-id="${t.id}" data-date="${d.date}"
            style="border-left: 1px solid rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 4px; cursor: pointer; user-select: none; font-size: 0.76rem; font-family: monospace;"
            title="Clique para alterar horas de sobreaviso (0 / 24 / 12)">
          <div style="${onCallBg} padding: 2px 4px; display: inline-block; min-width: 24px;">${escapeHtml(onCallVal)}</div>
        </td>
      `;
    });
    html += `</tr>`;
    html += `<tr><td style="padding: 3px;"></td></tr>`;
  });
  tbody.innerHTML = html;
  bindEscalaGridEvents();
}
function getEscalaStatusStyle(status) {
  switch (status) {
    case 'Folga':
      return 'background: rgba(239, 68, 68, 0.15); color: #fca5a5; font-weight: 700;';
    case 'Férias':
    case 'FÃ©rias':
    case 'F�rias':
      return 'background: rgba(234, 179, 8, 0.15); color: #fef08a; font-weight: 700; border: 1px solid rgba(234, 179, 8, 0.3);';
    case 'BH':
      return 'background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-weight: 700;';
    case 'Feriado':
      return 'background: rgba(16, 185, 129, 0.15); color: #86efac; font-weight: 700;';
    case 'Trabalho':
    default:
      return 'background: rgba(255, 255, 255, 0.05); color: #cbd5e1; font-weight: 700;';
  }
}
function bindEscalaGridEvents() {
  const dayCells = document.querySelectorAll('.escala-day-cell');
  const onCallCells = document.querySelectorAll('.escala-oncall-cell');
  dayCells.forEach(cell => {
    cell.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isMouseDownEscala = true;
      applyPaintToEscalaCell(cell);
    });
    cell.addEventListener('mouseenter', () => {
      if (isMouseDownEscala) {
        applyPaintToEscalaCell(cell);
      }
    });
  });
  onCallCells.forEach(cell => {
    cell.addEventListener('click', () => {
      toggleEscalaOnCallCell(cell);
    });
  });
}
document.addEventListener('mouseup', () => {
  if (isMouseDownEscala) {
    isMouseDownEscala = false;
    flushEscalaBatchUpdates();
  }
});
function applyPaintToEscalaCell(cellEl) {
  const techId = cellEl.getAttribute('data-tech-id');
  const dateStr = cellEl.getAttribute('data-date');
  if (!techId || !dateStr || !currentEscalaData) return;
  const workHoursInput = document.getElementById('escala-work-hours-input');
  const customWorkHours = workHoursInput ? workHoursInput.value.trim() : '08 às 17:48hs';
  const tech = (currentEscalaData.technicians || []).find(t => t.id === parseInt(techId));
  if (!tech) return;
  const currentSched = (tech.schedules && tech.schedules[dateStr]) || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
  currentSched.status = currentEscalaActiveStatus;
  if (currentEscalaActiveStatus === 'Trabalho') {
    currentSched.work_hours = customWorkHours;
  }
  if (!tech.schedules) tech.schedules = {};
  tech.schedules[dateStr] = currentSched;
  cellEl.style.cssText = 'border-left: 1px solid rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); text-align: center; vertical-align: middle; padding: 6px; cursor: pointer; user-select: none; transition: transform 0.1s ease;';
  const textVal = currentEscalaActiveStatus === 'Trabalho' ? (customWorkHours || '08 às 17:48hs') : currentEscalaActiveStatus;
  const statusStyle = getEscalaStatusStyle(currentEscalaActiveStatus);
  cellEl.innerHTML = `<div style="${statusStyle} border-radius: 8px; width: 100%; height: 100%; min-height: 38px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; padding: 4px;">
    ${escapeHtml(textVal)}
  </div>`;
  const key = `${techId}_${dateStr}`;
  pendingEscalaBatchUpdates[key] = {
    tech_id: parseInt(techId),
    date: dateStr,
    status: currentEscalaActiveStatus,
    work_hours: customWorkHours,
    on_call: currentSched.on_call || '0'
  };
  if (!isMouseDownEscala) {
    scheduleEscalaFlush();
  }
}
function toggleEscalaOnCallCell(cellEl) {
  const techId = cellEl.getAttribute('data-tech-id');
  const dateStr = cellEl.getAttribute('data-date');
  if (!techId || !dateStr || !currentEscalaData) return;
  const tech = (currentEscalaData.technicians || []).find(t => t.id === parseInt(techId));
  if (!tech) return;
  const currentSched = (tech.schedules && tech.schedules[dateStr]) || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
  let nextVal = '0';
  if (currentSched.on_call === '0') nextVal = '24';
  else if (currentSched.on_call === '24') nextVal = '12';
  else nextVal = '0';
  currentSched.on_call = nextVal;
  if (!tech.schedules) tech.schedules = {};
  tech.schedules[dateStr] = currentSched;
  cellEl.textContent = nextVal;
  if (nextVal !== '0') {
    cellEl.style.color = '#38bdf8';
    cellEl.style.fontWeight = '800';
    cellEl.style.background = 'rgba(56, 189, 248, 0.12)';
  } else {
    cellEl.style.color = '#64748b';
    cellEl.style.fontWeight = '600';
    cellEl.style.background = 'transparent';
  }
  const key = `${techId}_${dateStr}`;
  pendingEscalaBatchUpdates[key] = {
    tech_id: parseInt(techId),
    date: dateStr,
    status: currentSched.status || 'Trabalho',
    work_hours: currentSched.work_hours || '08 às 17:48hs',
    on_call: nextVal
  };
  scheduleEscalaFlush();
}
function scheduleEscalaFlush() {
  if (escalaBatchTimeout) clearTimeout(escalaBatchTimeout);
  escalaBatchTimeout = setTimeout(() => {
    flushEscalaBatchUpdates();
  }, 400);
}
function flushEscalaBatchUpdates() {
  const updates = Object.values(pendingEscalaBatchUpdates);
  if (updates.length === 0) return;
  pendingEscalaBatchUpdates = {};
  fetch('/api/schedules/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: updates })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(`Erro ao salvar escala: ${data.error}`, 'error');
    } else {
      showToast(`${data.updated} registro(s) da escala salvos!`, 'success', 2000);
    }
  })
  .catch(err => {
    console.error("Error flushing escala batch:", err);
    showToast("Erro na conexão ao salvar escala.", 'error');
  });
}
function initEscalaEvents() {
  const painterBtns = document.querySelectorAll('.escala-status-btn');
  painterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      painterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.border = '2px solid transparent';
        b.style.boxShadow = 'none';
      });
      btn.classList.add('active');
      btn.style.border = '2px solid #ffffff';
      currentEscalaActiveStatus = btn.getAttribute('data-status');
    });
  });
  const monthInput = document.getElementById('escala-filter-month');
  const areaSelect = document.getElementById('escala-filter-area');
  const companySelect = document.getElementById('escala-filter-company');
  const searchInput = document.getElementById('escala-filter-search');
  if (monthInput) monthInput.addEventListener('change', loadEscalaData);
  if (areaSelect) areaSelect.addEventListener('change', loadEscalaData);
  if (companySelect) companySelect.addEventListener('change', loadEscalaData);
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (escalaBatchTimeout) clearTimeout(escalaBatchTimeout);
      escalaBatchTimeout = setTimeout(loadEscalaData, 300);
    });
  }
  const btnExport = document.getElementById('btn-export-escala');
  if (btnExport) {
    btnExport.addEventListener('click', exportEscalaCsv);
  }
  const presetSelect = document.getElementById('escala-work-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const hoursInput = document.getElementById('escala-work-hours-input');
      if (presetSelect.value !== 'custom' && hoursInput) {
        hoursInput.value = presetSelect.value;
      }
    });
  }
}
function exportEscalaCsv() {
  if (!currentEscalaData || !currentEscalaData.technicians || currentEscalaData.technicians.length === 0) {
    showToast("Nenhum dado de escala disponível para exportar.", 'error');
    return;
  }
  const days = currentEscalaData.days_in_month || [];
  const techs = currentEscalaData.technicians || [];
  let csvContent = "Coordenador / Técnico;Empresa;Área;Função;";
  csvContent += days.map(d => `${d.day_label} (${d.day_name})`).join(';') + "\n";
  techs.forEach(t => {
    let line1 = `"${t.name}";"${t.company}";"${t.area}";"${t.role}";`;
    line1 += days.map(d => {
      const s = (t.schedules && t.schedules[d.date]) || {};
      const val = s.status === 'Trabalho' ? (s.work_hours || '08 às 17:48hs') : s.status;
      return `"${val || 'Trabalho'}"`;
    }).join(';');
    csvContent += line1 + "\n";
    let line2 = `"${t.name} (Sobreaviso)";"${t.company}";"${t.area}";"${t.role}";`;
    line2 += days.map(d => {
      const s = (t.schedules && t.schedules[d.date]) || {};
      return `"${s.on_call || '0'}"`;
    }).join(';');
    csvContent += line2 + "\n";
  });
  const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Escala_Trabalho_${currentEscalaData.area}_${currentEscalaData.month}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
let mapaSelectedEventTypes = ['CURTO CIRCUITO', 'REDE BAIXA', 'VANDALISMO'];
let mapaSelectedOrigem = ''; 
let mapaSelectedRegiao = ''; 
let mapaSelectedArea = '';   
let mapaSelectedYear = '';
let mapaSelectedMonth = '';
let leafletMapInstance = null;
let leafletMarkersGroup = null;
function initMapaEventos() {
  const mapElement = document.getElementById('mapa-eventos-leaflet');
  if (!mapElement) return;
  if (!leafletMapInstance && typeof L !== 'undefined') {
    leafletMapInstance = L.map('mapa-eventos-leaflet', {
      center: [-22.9068, -43.1729],
      zoom: 11,
      zoomControl: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(leafletMapInstance);
    leafletMarkersGroup = L.layerGroup().addTo(leafletMapInstance);
  }
  if (leafletMapInstance) {
    setTimeout(() => {
      leafletMapInstance.invalidateSize();
    }, 200);
  }
  loadMapaEventosData();
}
function loadMapaEventosData() {
  const params = new URLSearchParams();
  if (mapaSelectedOrigem) params.append('origin', mapaSelectedOrigem);
  if (mapaSelectedRegiao) params.append('region', mapaSelectedRegiao);
  if (mapaSelectedArea) params.append('area', mapaSelectedArea);
  if (mapaSelectedYear) params.append('year', mapaSelectedYear);
  if (mapaSelectedMonth) params.append('month', mapaSelectedMonth);
  if (mapaSelectedEventTypes.length > 0) params.append('event_types', mapaSelectedEventTypes.join(','));
  fetch(`/api/mapa-eventos/data?${params.toString()}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        console.error('Erro API mapa:', data.error);
        showToast('Erro ao carregar mapa: ' + data.error, 'error');
        return;
      }
      const totalEl = document.getElementById('mapa-total-eventos');
      if (totalEl) totalEl.textContent = data.total || 0;
      const updatedSpan = document.getElementById('mapa-last-updated');
      if (updatedSpan && data.last_updated) {
        updatedSpan.textContent = data.last_updated;
      }
      if (leafletMarkersGroup) {
        leafletMarkersGroup.clearLayers();
        const events = data.events || [];
        events.forEach(ev => {
          let color = '#ef4444'; 
          if (ev.event_type === 'REDE BAIXA') color = '#f59e0b';
          if (ev.event_type === 'CURTO CIRCUITO') color = '#3b82f6';
          const marker = L.circleMarker([ev.lat, ev.lng], {
            radius: 8,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85
          });
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.address)}`;
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 0.82rem; padding: 4px; color: #1e293b; max-width: 240px;">
              <div style="font-weight: 800; color: ${color}; font-size: 0.95rem; text-transform: uppercase; margin-bottom: 6px;">${escapeHtml(ev.event_type)}</div>
              <div><b>Designação:</b> ${escapeHtml(ev.designation)}</div>
              <div><b>Ticket:</b> ${escapeHtml(ev.ticket)}</div>
              <div><b>Causa:</b> ${escapeHtml(ev.cause)}</div>
              <div><b>SubCluster:</b> ${escapeHtml(ev.subcluster)}</div>
              <div><b>Endereço:</b> ${escapeHtml(ev.address)}</div>
              <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
                <a href="${mapsUrl}" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 700; text-decoration: none;">📍 Abrir no Google Maps</a>
              </div>
            </div>
          `);
          leafletMarkersGroup.addLayer(marker);
        });
      }
      renderMapaMonthlyChart(data.monthly_chart || []);
    })
    .catch(err => {
      console.error('Erro ao carregar dados do Mapa de Eventos:', err);
    });
}
function renderMapaMonthlyChart(chartData) {
  const container = document.getElementById('mapa-monthly-chart');
  if (!container) return;
  if (!chartData || chartData.length === 0) {
    container.innerHTML = '<span style="font-size: 0.7rem; color: #64748b;">Sem dados</span>';
    return;
  }
  const maxVal = Math.max(...chartData.map(d => d.count), 1);
  container.innerHTML = chartData.map(d => {
    const pct = Math.max((d.count / maxVal) * 100, 10);
    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1;">
        <span style="font-size: 0.65rem; font-weight: 800; color: #ffffff;">${d.count}</span>
        <div style="width: 100%; height: 36px; background: rgba(255,255,255,0.06); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden;">
          <div style="width: 100%; height: ${pct}%; background: linear-gradient(180deg, #60a5fa, #2563eb); border-radius: 3px;"></div>
        </div>
        <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700;">${d.month}</span>
      </div>
    `;
  }).join('');
}
let projCurrentView = 'mapa';
let projSelectedRegiao = '';
let projSelectedOrigem = 'RAL';
let projSelectedEventType = 'CURTO CIRCUITO';
const projChartInstances = {};
function switchMapaView(view) {
  projCurrentView = view;
  const mapaDiv = document.getElementById('mapa-view-mapa');
  const projDiv = document.getElementById('mapa-view-projecao');
  const btnMapa = document.getElementById('mapa-view-btn-mapa');
  const btnProj = document.getElementById('mapa-view-btn-projecao');
  if (view === 'mapa') {
    if (mapaDiv) mapaDiv.style.display = 'grid';
    if (projDiv) projDiv.style.display = 'none';
    if (btnMapa) { btnMapa.style.background = '#e11d48'; btnMapa.style.color = '#ffffff'; }
    if (btnProj) { btnProj.style.background = 'transparent'; btnProj.style.color = '#94a3b8'; }
    if (leafletMapInstance) {
      setTimeout(() => leafletMapInstance.invalidateSize(), 150);
    }
  } else {
    if (mapaDiv) mapaDiv.style.display = 'none';
    if (projDiv) projDiv.style.display = 'block';
    if (btnMapa) { btnMapa.style.background = 'transparent'; btnMapa.style.color = '#94a3b8'; }
    if (btnProj) { btnProj.style.background = '#e11d48'; btnProj.style.color = '#ffffff'; }
    loadProjecaoData();
  }
}
function initMapaEventosEvents() {
  const eventBtns = document.querySelectorAll('.mapa-event-type-btn');
  eventBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-event-type');
      if (mapaSelectedEventTypes.includes(type)) {
        if (mapaSelectedEventTypes.length === 1) return;
        mapaSelectedEventTypes = mapaSelectedEventTypes.filter(t => t !== type);
        btn.classList.remove('active');
        btn.style.opacity = '0.4';
      } else {
        mapaSelectedEventTypes.push(type);
        btn.classList.add('active');
        btn.style.opacity = '1';
      }
      loadMapaEventosData();
    });
  });
  const origemBtns = document.querySelectorAll('.mapa-origem-item');
  origemBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      origemBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.classList.add('active');
      btn.style.background = '#22222b';
      btn.style.color = '#ffffff';
      mapaSelectedOrigem = btn.getAttribute('data-origem');
      loadMapaEventosData();
    });
  });
  const regiaoBtns = document.querySelectorAll('.mapa-regiao-item');
  regiaoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      regiaoBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.classList.add('active');
      btn.style.background = '#22222b';
      btn.style.color = '#ffffff';
      mapaSelectedRegiao = btn.getAttribute('data-regiao');
      loadMapaEventosData();
    });
  });
  const areaBtns = document.querySelectorAll('.mapa-area-item');
  areaBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      areaBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.classList.add('active');
      btn.style.background = '#22222b';
      btn.style.color = '#ffffff';
      mapaSelectedArea = btn.getAttribute('data-area');
      loadMapaEventosData();
    });
  });
  const yearSelect = document.getElementById('mapa-filter-year');
  if (yearSelect) {
    yearSelect.addEventListener('change', () => {
      mapaSelectedYear = yearSelect.value;
      loadMapaEventosData();
      if (projCurrentView === 'projecao') loadProjecaoData();
    });
  }
  const monthSelect = document.getElementById('mapa-filter-month');
  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      mapaSelectedMonth = monthSelect.value;
      loadMapaEventosData();
      if (projCurrentView === 'projecao') loadProjecaoData();
    });
  }
  document.querySelectorAll('.proj-regiao-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.proj-regiao-btn').forEach(b => {
        b.style.background = 'transparent'; b.style.color = '#94a3b8';
        b.style.borderColor = 'rgba(255,255,255,0.08)'; b.classList.remove('active');
      });
      btn.style.background = '#ffffff'; btn.style.color = '#000000';
      btn.style.borderColor = 'rgba(255,255,255,0.15)'; btn.classList.add('active');
      projSelectedRegiao = btn.getAttribute('data-regiao');
      loadProjecaoData();
    });
  });
  document.querySelectorAll('.proj-origem-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.proj-origem-btn').forEach(b => {
        b.style.background = 'transparent'; b.style.color = '#94a3b8';
        b.style.borderColor = 'rgba(255,255,255,0.08)'; b.classList.remove('active');
      });
      btn.style.background = '#ffffff'; btn.style.color = '#000000';
      btn.style.borderColor = 'rgba(255,255,255,0.15)'; btn.classList.add('active');
      projSelectedOrigem = btn.getAttribute('data-origem');
      loadProjecaoData();
    });
  });
  document.querySelectorAll('.proj-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.proj-event-btn').forEach(b => {
        b.style.background = 'transparent'; b.style.color = '#94a3b8';
        b.style.borderColor = 'rgba(255,255,255,0.08)'; b.classList.remove('active');
      });
      btn.style.background = '#ffffff'; btn.style.color = '#000000';
      btn.style.borderColor = 'rgba(255,255,255,0.15)'; btn.classList.add('active');
      projSelectedEventType = btn.getAttribute('data-event-type');
      loadProjecaoData();
    });
  });
}
function loadProjecaoData() {
  const yearSelect = document.getElementById('mapa-filter-year');
  const monthSelect = document.getElementById('mapa-filter-month');
  const year = yearSelect ? yearSelect.value : new Date().getFullYear();
  const month = monthSelect ? monthSelect.value : (new Date().getMonth() + 1);
  const params = new URLSearchParams();
  if (projSelectedOrigem) params.append('origin', projSelectedOrigem);
  if (projSelectedRegiao) params.append('region', projSelectedRegiao);
  if (projSelectedEventType) params.append('event_type', projSelectedEventType);
  if (year) params.append('year', year);
  if (month) params.append('month', month);
  fetch(`/api/mapa-eventos/projection?${params.toString()}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) { showToast(data.error, 'error'); return; }
      const ml1 = document.getElementById('proj-month-label-1');
      const ml2 = document.getElementById('proj-month-label-2');
      if (ml1) ml1.textContent = data.current_month_label || 'mês';
      if (ml2) ml2.textContent = data.current_month_label || 'mês';
      renderProjStackedBar('proj-chart-area-month', data.area_month, 'label');
      renderProjStackedBar('proj-chart-subcluster-month', data.subcluster_month, 'label');
      renderProjHistoryChart('proj-chart-area-history', data.area_history, data.months_range, 'area');
      renderProjHistoryChart('proj-chart-subcluster-history', data.subcluster_history, data.months_range, 'subcluster');
    })
    .catch(err => console.error('Erro ao carregar projeção:', err));
}
/**
 * Renders a stacked bar chart: gray (projection on top), red (actual quantity).
 * Matches Power BI "Projeção e Qtde por Área/SubCluster" cards.
 */
function renderProjStackedBar(canvasId, items, labelKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !items) return;
  if (projChartInstances[canvasId]) {
    projChartInstances[canvasId].destroy();
  }
  const labels = items.map(d => d[labelKey] || d.label);
  const actuals = items.map(d => d.actual);
  const gaps = items.map(d => Math.max(0, d.projection - d.actual)); 
  projChartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Qtde Evento',
          data: actuals,
          backgroundColor: '#e11d48',
          borderRadius: 2,
          order: 1,
        },
        {
          label: 'Projeção (delta)',
          data: gaps,
          backgroundColor: '#d1d5db',
          borderRadius: 2,
          order: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => {
              if (ctx.datasetIndex === 0) return ` Qtde Evento: ${ctx.raw}`;
              const actual = actuals[ctx.dataIndex];
              const proj = actual + ctx.raw;
              return ` Projeção: ${proj}`;
            }
          }
        },
        datalabels: false,
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#374151', font: { weight: '700', size: 11 } }
        },
        y: {
          stacked: true,
          display: false,
          beginAtZero: true,
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    },
    plugins: [{
      id: 'projValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx, data } = chart;
        ctx.save();
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const actualVal = data.datasets[0].data[i];
          const projVal = actualVal + data.datasets[1].data[i];
          const x = bar.x;
          const topBar = chart.getDatasetMeta(1).data[i];
          ctx.fillStyle = '#6b7280';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(projVal, x, topBar.y - 4);
          ctx.fillStyle = '#e11d48';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(actualVal, x, bar.y + 13);
        });
        ctx.restore();
      }
    }]
  });
}
/**
 * Renders a grouped bar chart showing the last 3 months for each area or subcluster.
 * Matches Power BI "Últimos 3 meses por Área/SubCluster".
 */
function renderProjHistoryChart(canvasId, groupedData, monthLabels, groupKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !groupedData) return;
  if (projChartInstances[canvasId]) {
    projChartInstances[canvasId].destroy();
  }
  const redShades = ['#b91c1c', '#dc2626', '#f87171'];
  const months = monthLabels || ['mai', 'jun', 'jul'];
  const groupLabels = groupedData.map(g => g[groupKey] || g.area || g.subcluster);
  const datasets = months.map((month, mi) => ({
    label: month,
    data: groupedData.map(g => {
      const found = (g.months || []).find(m => m.month === month);
      return found ? found.count : 0;
    }),
    backgroundColor: redShades[mi] || '#e11d48',
    borderRadius: 2,
  }));
  projChartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels: groupLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#374151', font: { weight: '700', size: 10 }, boxWidth: 12, padding: 8 }
        },
        tooltip: { bodyColor: '#1e293b', titleColor: '#1e293b', backgroundColor: '#f8fafc' }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#374151', font: { weight: '700', size: 10 } }
        },
        y: {
          beginAtZero: true,
          display: false,
        }
      },
      animation: { duration: 700, easing: 'easeOutQuart' }
    },
    plugins: [{
      id: 'historyValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        chart.data.datasets.forEach((ds, di) => {
          chart.getDatasetMeta(di).data.forEach((bar, i) => {
            const val = ds.data[i];
            if (val > 0) {
              ctx.fillStyle = '#dc2626';
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(val, bar.x, bar.y - 3);
            }
          });
        });
        ctx.restore();
      }
    }]
  });
}
let currentUserTasks = [];
function initWorkspaceEvents() {
  const btnOpenModal = document.getElementById('btn-open-task-modal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => openTaskModal());
  }
  const searchInput = document.getElementById('task-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderUserTasks());
  }
  const filterPriority = document.getElementById('task-filter-priority');
  if (filterPriority) {
    filterPriority.addEventListener('change', () => renderUserTasks());
  }
  const filterStatus = document.getElementById('task-filter-status');
  if (filterStatus) {
    filterStatus.addEventListener('change', () => renderUserTasks());
  }
  const taskForm = document.getElementById('task-form');
  if (taskForm) {
    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveUserTask();
    });
  }
}
function loadUserTasks() {
  fetch('/api/user-tasks')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        currentUserTasks = data;
        renderUserTasks();
      }
    })
    .catch(err => console.error('Erro ao carregar tarefas do usuário:', err));
}
function renderUserTasks() {
  const wrapper = document.getElementById('task-list-wrapper');
  if (!wrapper) return;
  const searchVal = (document.getElementById('task-search-input')?.value || '').toLowerCase().trim();
  const priorityVal = document.getElementById('task-filter-priority')?.value || '';
  const statusVal = document.getElementById('task-filter-status')?.value || '';
  let filtered = currentUserTasks.filter(t => {
    if (priorityVal && t.priority !== priorityVal) return false;
    if (statusVal && t.status !== statusVal) return false;
    if (searchVal) {
      const titleMatch = (t.title || '').toLowerCase().includes(searchVal);
      const descMatch = (t.description || '').toLowerCase().includes(searchVal);
      const techMatch = (t.assigned_tech_name || '').toLowerCase().includes(searchVal);
      if (!titleMatch && !descMatch && !techMatch) return false;
    }
    return true;
  });
  const statTotal = document.getElementById('task-stat-total');
  const statPending = document.getElementById('task-stat-pending');
  const statProgress = document.getElementById('task-stat-progress');
  const statCompleted = document.getElementById('task-stat-completed');
  if (statTotal) statTotal.textContent = currentUserTasks.length;
  if (statPending) statPending.textContent = currentUserTasks.filter(t => t.status === 'Pendente').length;
  if (statProgress) statProgress.textContent = currentUserTasks.filter(t => t.status === 'Em Andamento').length;
  if (statCompleted) statCompleted.textContent = currentUserTasks.filter(t => t.status === 'Concluído').length;
  if (!filtered.length) {
    wrapper.innerHTML = `
      <div style="grid-column: 1 / -1; background: rgba(22, 22, 26, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 50px 20px; text-align: center;">
        <div style="width: 56px; height: 56px; background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h4 style="font-weight: 800; color: #ffffff; font-size: 1.1rem; margin-bottom: 6px;">Nenhuma atividade privativa cadastrada</h4>
        <p style="font-size: 0.85rem; color: #94a3b8; max-width: 400px; margin: 0 auto 16px auto;">Crie suas notas privativas ou acione um colaborador usando o botão "Nova Atividade / Nota".</p>
      </div>
    `;
    return;
  }
  let html = '';
  filtered.forEach(t => {
    let prioColor = '#f59e0b';
    let prioBg = 'rgba(245, 158, 11, 0.15)';
    if (t.priority === 'Alta') { prioColor = '#ef4444'; prioBg = 'rgba(239, 68, 68, 0.15)'; }
    if (t.priority === 'Baixa') { prioColor = '#10b981'; prioBg = 'rgba(16, 185, 129, 0.15)'; }
    let statusBg = 'rgba(239, 68, 68, 0.15)';
    let statusColor = '#fca5a5';
    if (t.status === 'Em Andamento') { statusBg = 'rgba(245, 158, 11, 0.15)'; statusColor = '#fcd34d'; }
    if (t.status === 'Concluído') { statusBg = 'rgba(16, 185, 129, 0.15)'; statusColor = '#6ee7b7'; }
    html += `
      <div style="background: rgba(22, 22, 26, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: 0.2s; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px;">
            <span style="font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; background: ${prioBg}; color: ${prioColor}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(t.priority)}</span>
            <span style="font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; background: ${statusBg}; color: ${statusColor};">${escapeHtml(t.status)}</span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 800; color: #ffffff; margin-bottom: 8px; line-height: 1.4;">${escapeHtml(t.title)}</h4>
          ${t.description ? `<p style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 12px; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(t.description)}</p>` : ''}
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
            ${t.assigned_tech_name ? `<div>👤 <strong>Colaborador Acionado:</strong> <span style="color: #60a5fa; font-weight: 700;">${escapeHtml(t.assigned_tech_name)}</span></div>` : ''}
            ${t.due_date ? `<div><strong>Data de Conclusão:</strong> <span style="color: #f8fafc;">${t.due_date}</span></div>` : ''}
            <div>🕒 <strong>Criado em:</strong> ${t.created_at}</div>
          </div>
        </div>
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <button onclick="toggleTaskStatus(${t.id})" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: 0.2s;">
            🔄 Alterar Status
          </button>
          <div style="display: flex; gap: 6px;">
            <button onclick="openTaskModal(${t.id})" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; padding: 6px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">Editar</button>
            <button onclick="deleteUserTask(${t.id})" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 6px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">Excluir</button>
          </div>
        </div>
      </div>
    `;
  });
  wrapper.innerHTML = html;
}
function openTaskModal(taskId = null) {
  const modal = document.getElementById('task-modal');
  const form = document.getElementById('task-form');
  const title = document.getElementById('task-modal-title');
  const techSelect = document.getElementById('task-assigned-tech');
  if (form) form.reset();
  document.getElementById('task-id').value = '';
  if (techSelect) {
    let techHtml = '<option value="">Nenhum colaborador acionado</option>';
    fetch('/api/technicians')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          window.allTechniciansData = data;
          data.forEach(tech => {
            techHtml += `<option value="${tech.id}" data-name="${escapeHtml(tech.name)}">${escapeHtml(tech.name)} (${escapeHtml(tech.company || 'Parceira')})</option>`;
          });
        }
        techSelect.innerHTML = techHtml;
        if (taskId) {
          const task = currentUserTasks.find(t => t.id === taskId);
          if (task && task.assigned_tech_id) {
            techSelect.value = task.assigned_tech_id;
          }
        }
      })
      .catch(err => console.error(err));
  }
  if (taskId) {
    const task = currentUserTasks.find(t => t.id === taskId);
    if (task) {
      if (title) title.textContent = 'Editar Atividade / Nota';
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-priority').value = task.priority;
      document.getElementById('task-due-date').value = task.due_date || '';
      document.getElementById('task-description').value = task.description || '';
      document.getElementById('task-status').value = task.status || 'Pendente';
    }
  } else {
    if (title) title.textContent = 'Nova Atividade / Nota Exclusiva';
  }
  if (modal) modal.classList.add('active');
}
function saveUserTask() {
  const id = document.getElementById('task-id').value;
  const title = document.getElementById('task-title').value.trim();
  const priority = document.getElementById('task-priority').value;
  const due_date = document.getElementById('task-due-date').value;
  const techSelect = document.getElementById('task-assigned-tech');
  const assigned_tech_id = techSelect && techSelect.value ? parseInt(techSelect.value) : null;
  const assigned_tech_name = (techSelect && techSelect.selectedOptions[0]) ? (techSelect.selectedOptions[0].getAttribute('data-name') || '') : '';
  const description = document.getElementById('task-description').value.trim();
  const status = document.getElementById('task-status').value;
  if (!title) {
    showToast('Informe o título da atividade.', 'error');
    return;
  }
  const payload = { title, priority, due_date, assigned_tech_id, assigned_tech_name, description, status };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/user-tasks/${id}` : '/api/user-tasks';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(data.message || 'Atividade salva com sucesso!', 'success');
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('active');
    loadUserTasks();
  })
  .catch(err => {
    console.error('Erro ao salvar tarefa:', err);
    showToast('Erro ao salvar atividade.', 'error');
  });
}
function toggleTaskStatus(taskId) {
  const task = currentUserTasks.find(t => t.id === taskId);
  if (!task) return;
  let nextStatus = 'Em Andamento';
  if (task.status === 'Pendente') nextStatus = 'Em Andamento';
  else if (task.status === 'Em Andamento') nextStatus = 'Concluído';
  else nextStatus = 'Pendente';
  fetch(`/api/user-tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: nextStatus })
  })
  .then(res => res.json())
  .then(data => {
    showToast(`Status alterado para ${nextStatus}!`, 'info');
    loadUserTasks();
  });
}
function deleteUserTask(taskId) {
  if (!confirm('Deseja realmente excluir esta atividade?')) return;
  fetch(`/api/user-tasks/${taskId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      showToast('Atividade excluída com sucesso!', 'success');
      loadUserTasks();
    });
}
let currentEvaluations = [];
function initEvaluationEvents() {
  const btnOpenModal = document.getElementById('btn-open-eval-modal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => openEvaluationModal());
  }
  const btnExport = document.getElementById('btn-export-evaluations');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      window.location.href = '/api/evaluations/export';
    });
  }
  const searchInput = document.getElementById('eval-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderEvaluations());
  }
  const filterCompany = document.getElementById('eval-filter-company');
  if (filterCompany) {
    filterCompany.addEventListener('change', () => renderEvaluations());
  }
  const evalForm = document.getElementById('evaluation-form');
  if (evalForm) {
    evalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEvaluation();
    });
  }
  ['eval-score-behavior', 'eval-score-productivity', 'eval-score-kpi', 'eval-score-process'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => updateEvalScorePreview());
    }
  });
}
function loadEvaluations() {
  fetch('/api/evaluations')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        currentEvaluations = data;
        renderEvaluations();
      }
    })
    .catch(err => console.error('Erro ao carregar avaliações:', err));
}
function updateEvalScorePreview() {
  const b = parseFloat(document.getElementById('eval-score-behavior')?.value || 10);
  const p = parseFloat(document.getElementById('eval-score-productivity')?.value || 10);
  const k = parseFloat(document.getElementById('eval-score-kpi')?.value || 10);
  const pr = parseFloat(document.getElementById('eval-score-process')?.value || 10);
  const avg = ((b + p + k + pr) / 4.0).toFixed(1);
  const calculatedSpan = document.getElementById('eval-calculated-score');
  if (calculatedSpan) {
    calculatedSpan.textContent = `${avg} / 10`;
  }
}
function renderEvaluations() {
  const tbody = document.getElementById('evaluation-table-body');
  if (!tbody) return;
  const searchVal = (document.getElementById('eval-search-input')?.value || '').toLowerCase().trim();
  const companyVal = document.getElementById('eval-filter-company')?.value || 'Todas';
  let filtered = currentEvaluations.filter(e => {
    if (companyVal !== 'Todas' && e.company !== companyVal) return false;
    if (searchVal) {
      const nameMatch = (e.technician_name || '').toLowerCase().includes(searchVal);
      const companyMatch = (e.company || '').toLowerCase().includes(searchVal);
      const commentsMatch = (e.comments || '').toLowerCase().includes(searchVal);
      if (!nameMatch && !companyMatch && !commentsMatch) return false;
    }
    return true;
  });
  const statTotal = document.getElementById('eval-stat-total');
  const statAvg = document.getElementById('eval-stat-avg');
  const statFFA = document.getElementById('eval-stat-ffa');
  const statProcisa = document.getElementById('eval-stat-procisa');
  if (statTotal) statTotal.textContent = currentEvaluations.length;
  if (currentEvaluations.length) {
    const totalSum = currentEvaluations.reduce((sum, item) => sum + item.overall_score, 0);
    if (statAvg) statAvg.textContent = (totalSum / currentEvaluations.length).toFixed(1);
    const ffaItems = currentEvaluations.filter(item => item.company === 'FFA');
    if (statFFA) statFFA.textContent = ffaItems.length ? (ffaItems.reduce((sum, item) => sum + item.overall_score, 0) / ffaItems.length).toFixed(1) : '0.0';
    const procisaItems = currentEvaluations.filter(item => item.company === 'Procisa');
    if (statProcisa) statProcisa.textContent = procisaItems.length ? (procisaItems.reduce((sum, item) => sum + item.overall_score, 0) / procisaItems.length).toFixed(1) : '0.0';
  } else {
    if (statAvg) statAvg.textContent = '0.0';
    if (statFFA) statFFA.textContent = '0.0';
    if (statProcisa) statProcisa.textContent = '0.0';
  }
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma avaliação técnica encontrada. Use o botão "Nova Avaliação Técnica" para registrar uma avaliação.</td></tr>`;
    return;
  }
  let html = '';
  filtered.forEach(e => {
    let scoreColor = '#f59e0b';
    if (e.overall_score >= 8.5) scoreColor = '#10b981';
    else if (e.overall_score < 6.0) scoreColor = '#ef4444';
    html += `
      <tr>
        <td style="font-weight: 800; color: #ffffff;">${escapeHtml(e.technician_name)}</td>
        <td><span style="font-weight: 700; padding: 4px 10px; border-radius: 12px; background: rgba(255,255,255,0.05); font-size: 0.8rem;">${escapeHtml(e.company || '-')}</span></td>
        <td style="font-size: 0.85rem; color: #cbd5e1;">${escapeHtml(e.role || '-')} ${e.area ? `(${escapeHtml(e.area)})` : ''}</td>
        <td style="text-align: center; font-weight: 700;">${e.behavior_score} / 10</td>
        <td style="text-align: center; font-weight: 700;">${e.productivity_score} / 10</td>
        <td style="text-align: center; font-weight: 700;">${e.technical_kpi_score} / 10</td>
        <td style="text-align: center; font-weight: 700;">${e.process_score} / 10</td>
        <td style="font-weight: 800; font-size: 1.1rem; color: ${scoreColor};">${e.overall_score.toFixed(1)} / 10</td>
        <td style="font-size: 0.85rem; color: #94a3b8;">${escapeHtml(e.evaluator_username || '-')}</td>
        <td style="font-size: 0.85rem; color: #94a3b8;">${e.created_at}</td>
        <td style="text-align: center;">
          <button onclick="deleteEvaluation(${e.id})" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">Excluir</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}
function openEvaluationModal() {
  const modal = document.getElementById('evaluation-modal');
  const form = document.getElementById('evaluation-form');
  const techSelect = document.getElementById('eval-tech-select');
  if (form) form.reset();
  updateEvalScorePreview();
  if (techSelect) {
    techSelect.innerHTML = '<option value="">Carregando colaboradores...</option>';
    fetch('/api/technicians')
      .then(res => res.json())
      .then(data => {
        let options = '<option value="">-- Selecione o Colaborador --</option>';
        if (Array.isArray(data)) {
          window.allTechniciansData = data;
          data.forEach(t => {
            options += `<option value="${t.id}">${escapeHtml(t.name)} - ${escapeHtml(t.company || 'Parceira')} (${escapeHtml(t.role || 'Técnico')})</option>`;
          });
        }
        techSelect.innerHTML = options;
      })
      .catch(err => console.error('Erro ao carregar técnicos para avaliação:', err));
  }
  if (modal) modal.classList.add('active');
}
function saveEvaluation() {
  const techSelect = document.getElementById('eval-tech-select');
  const technician_id = techSelect ? parseInt(techSelect.value) : null;
  const b_score = parseInt(document.getElementById('eval-score-behavior').value);
  const p_score = parseInt(document.getElementById('eval-score-productivity').value);
  const k_score = parseInt(document.getElementById('eval-score-kpi').value);
  const pr_score = parseInt(document.getElementById('eval-score-process').value);
  const comments = document.getElementById('eval-comments').value.trim();
  if (!technician_id) {
    showToast('Selecione um colaborador.', 'error');
    return;
  }
  const payload = {
    technician_id,
    behavior_score: b_score,
    productivity_score: p_score,
    technical_kpi_score: k_score,
    process_score: pr_score,
    comments
  };
  fetch('/api/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(`Avaliação salva com resultado ${data.overall_score}!`, 'success');
    const modal = document.getElementById('evaluation-modal');
    if (modal) modal.classList.remove('active');
    loadEvaluations();
  })
  .catch(err => {
    console.error('Erro ao salvar avaliação:', err);
    showToast('Erro ao salvar avaliação.', 'error');
  });
}
function deleteEvaluation(evalId) {
  if (!confirm('Deseja realmente excluir esta avaliação técnica?')) return;
  fetch(`/api/evaluations/${evalId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      showToast('Avaliação excluída com sucesso!', 'success');
      loadEvaluations();
    });
}
let currentRouteFolderId = null;
function loadRouteContents(routeId, folderId = null) {
  currentRouteFolderId = folderId;
  const container = document.getElementById('route-explorer-container');
  const breadcrumbsEl = document.getElementById('route-breadcrumbs');
  const foldersGrid = document.getElementById('route-folders-grid');
  const filesList = document.getElementById('route-files-list');
  if (!container || !foldersGrid || !filesList) return;
  const url = folderId 
    ? `/api/routes/${routeId}/contents?folder_id=${folderId}`
    : `/api/routes/${routeId}/contents`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      const folders = data.folders || [];
      const files = data.files || [];
      const breadcrumbs = data.breadcrumbs || [];
      container.style.display = 'block';
      let bcHTML = `<span style="cursor: pointer; color: #ee2c24; font-weight: 700;" onclick="loadRouteContents(${routeId}, null)">Raiz da Rota</span>`;
      breadcrumbs.forEach((bc, idx) => {
        bcHTML += ` <span style="color: #64748b;">/</span> <span style="cursor: pointer; color: ${idx === breadcrumbs.length - 1 ? '#ffffff' : '#38bdf8'}; font-weight: 600;" onclick="loadRouteContents(${routeId}, ${bc.id})">${escapeHtml(bc.name)}</span>`;
      });
      breadcrumbsEl.innerHTML = bcHTML;
      if (folders.length > 0) {
        foldersGrid.innerHTML = folders.map(f => `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s;" onclick="loadRouteContents(${routeId}, ${f.id})" ondragover="onRouteFolderDragOver(event)" ondragleave="onRouteFolderDragLeave(event)" ondrop="onRouteFolderDrop(event, ${f.id})">
            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" style="width: 22px; height: 22px; flex-shrink: 0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span style="color: #ffffff; font-size: 0.88rem; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(f.name)}</span>
            </div>
            <button onclick="event.stopPropagation(); deleteRouteFolder(${f.id})" style="background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 4px;" title="Excluir Pasta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `).join('');
      } else {
        foldersGrid.innerHTML = '';
      }
      if (files.length > 0) {
        filesList.innerHTML = files.map(fi => {
          const sizeKb = (fi.filesize / 1024).toFixed(1);
          return `
            <div draggable="true" ondragstart="onRouteFileDragStart(event, ${fi.id})" style="background: rgba(22, 22, 26, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; cursor: grab;">
              <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="width: 20px; height: 20px; flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <div style="overflow: hidden;">
                  <a href="/uploads/${fi.filepath}" target="_blank" style="color: #ffffff; font-size: 0.88rem; font-weight: 600; text-decoration: none;">${escapeHtml(fi.filename)}</a>
                  <div style="font-size: 0.75rem; color: #94a3b8;">${fi.uploaded_at} • ${sizeKb} KB por ${escapeHtml(fi.uploader_name || 'Usuário')}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <a href="/uploads/${fi.filepath}" download="${escapeHtml(fi.filename)}" class="btn btn-outline" style="padding: 4px 10px; font-size: 0.78rem;">Baixar</a>
                <button onclick="deleteRouteFile(${fi.id})" style="background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 4px;" title="Excluir Arquivo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');
      } else {
        filesList.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 0.84rem; border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px; background: rgba(255,255,255,0.01);">Nenhum arquivo gravado nesta localização. Utilize a área abaixo ou o botão "Carregar arquivo" acima para adicionar.</div>`;
      }
    })
    .catch(err => {
      console.error('Erro ao carregar arquivos da rota:', err);
    });
}
let currentDraggedRouteFileId = null;
window.onRouteFileDragStart = function(evt, fileId) {
  currentDraggedRouteFileId = fileId;
  evt.dataTransfer.setData('text/plain', fileId);
  evt.dataTransfer.effectAllowed = 'move';
};
window.onRouteFolderDragOver = function(evt) {
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'move';
  const target = evt.currentTarget;
  if (target) {
    target.style.borderColor = '#ee2c24';
    target.style.background = 'rgba(238, 44, 36, 0.15)';
  }
};
window.onRouteFolderDragLeave = function(evt) {
  evt.preventDefault();
  const target = evt.currentTarget;
  if (target) {
    target.style.borderColor = 'var(--border)';
    target.style.background = 'rgba(255,255,255,0.03)';
  }
};
window.onRouteFolderDrop = function(evt, targetFolderId) {
  evt.preventDefault();
  const target = evt.currentTarget;
  if (target) {
    target.style.borderColor = 'var(--border)';
    target.style.background = 'rgba(255,255,255,0.03)';
  }
  const fileId = currentDraggedRouteFileId || evt.dataTransfer.getData('text/plain');
  if (!fileId || !targetFolderId) return;
  fetch(`/api/routes/files/${fileId}/move`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: targetFolderId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('Arquivo movido para a pasta com sucesso!', 'success');
      loadRouteContents(currentActiveRouteId, currentRouteFolderId);
    }
  })
  .catch(err => {
    console.error('Erro ao mover arquivo:', err);
    showToast('Erro ao mover arquivo para a pasta.', 'error');
  })
  .finally(() => {
    currentDraggedRouteFileId = null;
  });
};
function uploadFilesToRoute(filesList) {
  if (!currentActiveRouteId || !filesList || filesList.length === 0) return;
  const formData = new FormData();
  if (currentRouteFolderId) {
    formData.append('folder_id', currentRouteFolderId);
  }
  for (let i = 0; i < filesList.length; i++) {
    formData.append('files', filesList[i]);
  }
  showToast('Enviando arquivo(s)...', 'info');
  fetch(`/api/routes/${currentActiveRouteId}/upload`, {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('Arquivo(s) salvo(s) com sucesso!', 'success');
      loadRouteContents(currentActiveRouteId, currentRouteFolderId);
    }
  })
  .catch(err => {
    console.error('Erro ao enviar arquivo:', err);
    showToast('Erro ao salvar arquivo na rota.', 'error');
  });
}
window.deleteRouteFile = function(fileId) {
  if (!confirm('Deseja realmente excluir este arquivo da rota?')) return;
  fetch(`/api/routes/files/${fileId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) showToast(data.error, 'error');
      else {
        showToast('Arquivo excluído com sucesso!', 'success');
        loadRouteContents(currentActiveRouteId, currentRouteFolderId);
      }
    });
};
window.deleteRouteFolder = function(folderId) {
  if (!confirm('Deseja realmente excluir esta pasta e todo o seu conteúdo?')) return;
  fetch(`/api/routes/folders/${folderId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) showToast(data.error, 'error');
      else {
        showToast('Pasta excluída com sucesso!', 'success');
        loadRouteContents(currentActiveRouteId, currentRouteFolderId);
      }
    });
};
window.openRouteFolderModal = function() {
  const modal = document.getElementById('route-folder-modal');
  const parentInput = document.getElementById('route-folder-parent-id');
  const nameInput = document.getElementById('route-folder-name');
  if (parentInput) parentInput.value = currentRouteFolderId || '';
  if (nameInput) nameInput.value = '';
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
};
window.closeRouteFolderModal = function() {
  const modal = document.getElementById('route-folder-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
};
function initRouteFolderEvents() {
  if (window.routeFolderEventsInitialized) return;
  window.routeFolderEventsInitialized = true;
  const btnCreateFolder = document.getElementById('btn-create-route-folder');
  const btnUploadFile = document.getElementById('btn-upload-route-file');
  const fileInput = document.getElementById('route-file-input');
  const dropzone = document.getElementById('route-dropzone');
  const folderForm = document.getElementById('route-folder-form');
  if (btnCreateFolder) {
    btnCreateFolder.addEventListener('click', () => {
      openRouteFolderModal();
    });
  }
  if (folderForm) {
    folderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (folderForm.dataset.submitting === 'true') return;
      const name = document.getElementById('route-folder-name').value.trim();
      const parentId = document.getElementById('route-folder-parent-id').value;
      if (!name || !currentActiveRouteId) return;
      folderForm.dataset.submitting = 'true';
      const submitBtn = folderForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Criando...';
      }
      fetch(`/api/routes/${currentActiveRouteId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parentId ? parseInt(parentId) : null })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Pasta criada com sucesso!', 'success');
          closeRouteFolderModal();
          loadRouteContents(currentActiveRouteId, currentRouteFolderId);
        }
      })
      .catch(err => {
        console.error('Erro ao criar pasta:', err);
        showToast('Erro ao criar pasta na rota.', 'error');
      })
      .finally(() => {
        folderForm.dataset.submitting = 'false';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Criar Pasta';
        }
      });
    });
  }
  if (btnUploadFile && fileInput) {
    btnUploadFile.addEventListener('click', () => {
      fileInput.click();
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        uploadFilesToRoute(fileInput.files);
        fileInput.value = '';
      }
    });
  }
  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#ee2c24';
      dropzone.style.background = 'rgba(238, 44, 36, 0.08)';
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      dropzone.style.background = 'rgba(22, 22, 26, 0.6)';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      dropzone.style.background = 'rgba(22, 22, 26, 0.6)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFilesToRoute(e.dataTransfer.files);
      }
    });
  }
  document.addEventListener('paste', (e) => {
    const subpageView = document.getElementById('route-detail-subpage');
    if (!subpageView || subpageView.style.display === 'none' || !currentActiveRouteId) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
    if (!items) return;
    const filesToUpload = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const blob = items[i].getAsFile();
        if (blob) {
          const ext = blob.type.split('/')[1] || 'png';
          const filename = blob.name || `colado_${new Date().getTime()}.${ext}`;
          const file = new File([blob], filename, { type: blob.type });
          filesToUpload.push(file);
        }
      }
    }
    if (filesToUpload.length > 0) {
      e.preventDefault();
      uploadFilesToRoute(filesToUpload);
    }
  });
}

let currentViewRouteId = null;
let currentViewRouteData = null;

window.openRouteViewModal = function(id) {
  const item = (globalRoutes || []).find(r => r.id === id);
  if (!item) return;
  currentViewRouteId = id;
  currentViewRouteData = item;
  
  const modal = document.getElementById('route-view-modal');
  const titleEl = document.getElementById('route-view-title');
  const badgeEl = document.getElementById('route-view-badge');
  const descEl = document.getElementById('route-view-description');
  const linesEl = document.getElementById('route-view-lines-count');
  
  if (titleEl) titleEl.textContent = item.name;
  if (badgeEl) {
    badgeEl.textContent = item.type;
    badgeEl.className = item.type === 'Empresarial' ? 'route-badge route-badge-empresarial' : 'route-badge route-badge-residencial';
  }
  const linesCount = item.lines_count || (item.lines ? item.lines.length : 0);
  if (linesEl) linesEl.textContent = `${linesCount} medição(ões) cadastrada(s)`;
  
  if (descEl) {
    descEl.textContent = item.description ? item.description.trim() : 'Nenhuma descrição detalhada informada para esta rota.';
  }
  
  if (modal) modal.classList.add('active');
};

window.closeRouteViewModal = function() {
  const modal = document.getElementById('route-view-modal');
  if (modal) modal.classList.remove('active');
};

window.copyRouteDescription = function() {
  if (!currentViewRouteData) return;
  const desc = currentViewRouteData.description || '';
  if (!desc) {
    showToast('Esta rota não possui descrição para copiar.', 'info');
    return;
  }
  const fullText = `*ROTA: ${currentViewRouteData.name}* (${currentViewRouteData.type})\n\n${desc}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(fullText).then(() => {
      showToast('Descrição da rota copiada!', 'success');
    }).catch(() => fallbackCopyText(fullText));
  } else {
    fallbackCopyText(fullText);
  }
};

window.openRouteFromViewModal = function() {
  if (!currentViewRouteId) return;
  closeRouteViewModal();
  openRouteSubpage(currentViewRouteId);
};


// ==============================================================================
// CONTROLE DE NOTIFICAÇÕES OPERACIONAIS (JAVASCRIPT)
// ==============================================================================
let globalNotifications = [];
let notifSearchTimeout = null;

function initNotificationsEvents() {
  const searchInput = document.getElementById('notif-search-input');
  const reasonFilter = document.getElementById('notif-reason-filter');
  const form = document.getElementById('notification-form');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(notifSearchTimeout);
      notifSearchTimeout = setTimeout(() => {
        loadNotifications();
      }, 250);
    });
  }

  if (reasonFilter) {
    reasonFilter.addEventListener('change', () => {
      loadNotifications();
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNotification();
    });
  }
}

function loadNotifications() {
  const searchInput = document.getElementById('notif-search-input');
  const reasonFilter = document.getElementById('notif-reason-filter');
  const tableBody = document.getElementById('notificacoes-table-body');
  if (!tableBody) return;

  const searchVal = searchInput ? searchInput.value.trim() : '';
  const reasonVal = reasonFilter ? reasonFilter.value.trim() : '';

  let params = new URLSearchParams();
  if (searchVal) params.append('search', searchVal);
  if (reasonVal) params.append('reason', reasonVal);

  fetch(`/api/notifications?${params.toString()}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-error" style="padding: 24px;">Erro ao carregar notificações: ${escapeHtml(data.error)}</td></tr>`;
        return;
      }
      globalNotifications = data || [];
      renderNotificationsTable(globalNotifications);
    })
    .catch(err => {
      console.error('Error loading notifications:', err);
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-error" style="padding: 24px;">Falha de comunicação ao carregar notificações.</td></tr>`;
    });
}

function renderNotificationsTable(list) {
  const tableBody = document.getElementById('notificacoes-table-body');
  if (!tableBody) return;

  if (!list || list.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.95rem;">
          Nenhuma notificação registrada.<br>
          Clique no botão <strong>"+ Incluir"</strong> acima para registrar a primeira ocorrência.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = list.map(n => {
    let reasonBadgeColor = 'background: rgba(255,255,255,0.06); color: #ffffff;';
    const rLower = (n.reason || '').toLowerCase();
    if (rLower.includes('férias') || rLower.includes('ferias')) {
      reasonBadgeColor = 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);';
    } else if (rLower.includes('infra')) {
      reasonBadgeColor = 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);';
    } else if (rLower.includes('material')) {
      reasonBadgeColor = 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);';
    }

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 14px 14px; font-weight: 700; color: #ffffff; font-size: 0.88rem; white-space: nowrap;">
          ${escapeHtml(n.date)}
        </td>
        <td style="padding: 14px 14px;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.78rem; ${reasonBadgeColor}">
            ${escapeHtml(n.reason)}
          </span>
        </td>
        <td style="padding: 14px 14px; color: #e2e8f0; font-size: 0.88rem; line-height: 1.55; font-weight: 500;">
          ${escapeHtml(n.description)}
        </td>
        <td style="padding: 14px 14px; color: #a1a1aa; font-weight: 700; font-size: 0.84rem; white-space: nowrap;">
          ${escapeHtml(n.count_label)}
        </td>
        <td style="padding: 14px 14px; color: #ffffff; font-weight: 700; font-size: 0.86rem;">
          ${escapeHtml(n.coordinator)}
        </td>
        <td style="padding: 14px 14px; text-align: center;">
          <div class="action-buttons" style="display: flex; gap: 6px; justify-content: center;">
            <button class="action-btn edit-btn" onclick="openEditNotificationModal(${n.id})" title="Editar Notificação">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteNotification(${n.id})" title="Excluir Notificação">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 15px; height: 15px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openNotificationModal = function() {
  const modal = document.getElementById('notification-modal');
  const title = document.getElementById('notification-modal-title');
  const form = document.getElementById('notification-form');
  
  if (title) title.textContent = 'Incluir Nova Notificação';
  if (form) form.reset();
  
  document.getElementById('notif-id').value = '';
  const dateInput = document.getElementById('notif-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
  
  if (modal) modal.classList.add('active');
};

window.openEditNotificationModal = function(id) {
  const item = (globalNotifications || []).find(n => n.id === id);
  if (!item) return;

  const modal = document.getElementById('notification-modal');
  const title = document.getElementById('notification-modal-title');
  if (title) title.textContent = 'Editar Notificação';

  document.getElementById('notif-id').value = item.id;
  document.getElementById('notif-date').value = item.date_iso || '';
  document.getElementById('notif-reason').value = item.reason || '';
  document.getElementById('notif-description').value = item.description || '';
  document.getElementById('notif-coordinator').value = item.coordinator || '';
  document.getElementById('notif-count-label').value = item.count_label || '';

  if (modal) modal.classList.add('active');
};

window.closeNotificationModal = function() {
  const modal = document.getElementById('notification-modal');
  if (modal) modal.classList.remove('active');
};

function saveNotification() {
  const id = document.getElementById('notif-id').value;
  const date = document.getElementById('notif-date').value;
  const reason = document.getElementById('notif-reason').value.trim();
  const description = document.getElementById('notif-description').value.trim();
  const coordinator = document.getElementById('notif-coordinator').value.trim();
  const count_label = document.getElementById('notif-count-label').value.trim();

  if (!reason || !description) {
    showToast('Preencha os campos obrigatórios (Porque e Descritivo).', 'error');
    return;
  }

  const payload = { date, reason, description, coordinator, count_label };
  const url = id ? `/api/notifications/${id}` : '/api/notifications';
  const method = id ? 'PUT' : 'POST';

  const saveBtn = document.getElementById('btn-save-notif');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
  }

  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Notificação';
    }
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    showToast(id ? 'Notificação atualizada com sucesso!' : 'Notificação incluída com sucesso!', 'success');
    closeNotificationModal();
    loadNotifications();
  })
  .catch(err => {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Notificação';
    }
    console.error('Error saving notification:', err);
    showToast('Erro ao salvar notificação.', 'error');
  });
}

window.deleteNotification = function(id) {
  if (!confirm('Deseja realmente excluir esta notificação?')) return;
  fetch(`/api/notifications/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      showToast('Notificação excluída com sucesso!', 'success');
      loadNotifications();
    })
    .catch(err => {
      console.error('Error deleting notification:', err);
      showToast('Erro ao excluir notificação.', 'error');
    });
};

window.exportNotificationsExcel = function() {
  window.location.href = '/api/notifications/export';
};
