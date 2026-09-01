/**
 * Módulo de Interface do Usuário (UI)
 * Gerenciamento de Sidebar, Views, Modais, Toasts, Drag & Drop e Seleção de Colunas.
 */
const UI = (function() {
    let currentView = 'ramais';

    function init() {
        initSidebarNavigation();
        initTheme();
        initModalEvents();
    }

    // ==========================================
    // 1. Navegação de Views (Sidebar Fixa)
    // ==========================================

    function initSidebarNavigation() {
        const navLinks = document.querySelectorAll('.nav-item[data-view]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.dataset.view;
                switchView(viewName);
            });
        });

        // Toggle Mobile Sidebar
        const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (btnToggleSidebar && sidebar) {
            btnToggleSidebar.addEventListener('click', () => {
                sidebar.classList.toggle('sidebar--open');
                if (overlay) overlay.classList.toggle('hidden');
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('sidebar--open');
                overlay.classList.add('hidden');
            });
        }
    }

    function switchView(viewName) {
        currentView = viewName;

        // Atualizar links ativos na sidebar
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Alternar containers de view
        document.querySelectorAll('.view-container').forEach(view => {
            if (view.id === `view-${viewName}`) {
                view.classList.remove('hidden');
            } else {
                view.classList.add('hidden');
            }
        });

        // Atualizar título da topbar
        const pageTitleEl = document.getElementById('page-title');
        if (pageTitleEl) {
            if (viewName === 'dashboard') pageTitleEl.textContent = 'Dashboard de Indicadores';
            else if (viewName === 'ramais') pageTitleEl.textContent = 'Lista Geral de Ramais';
            else if (viewName === 'colaboradores') pageTitleEl.textContent = 'Gestão de Colaboradores & Permissões';
            else if (viewName === 'configuracoes') pageTitleEl.textContent = 'Configurações do Sistema';
        }

        // Fechar sidebar mobile se aberta
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('sidebar--open');
        if (overlay) overlay.classList.add('hidden');

        // Notificar troca de view
        window.dispatchEvent(new CustomEvent('view:changed', { detail: { view: viewName } }));
    }

    function getCurrentView() {
        return currentView;
    }

    // ==========================================
    // 2. Gestão Dinâmica de Colunas (Modal / Popover)
    // ==========================================

    /**
     * Exibe o modal de configuração de colunas com checkboxes dinâmicos.
     */
    function showColumnConfigModal() {
        const columns = Table.getColumns();
        const listEl = document.getElementById('column-list');

        if (!listEl) return;

        let html = '';
        columns.forEach(col => {
            html += `
                <li class="column-item">
                    <label class="column-checkbox-label">
                        <input type="checkbox" class="column-toggle-checkbox" data-key="${col.key}" ${col.visible ? 'checked' : ''}>
                        <span class="column-name">${col.label}</span>
                    </label>
                </li>
            `;
        });

        listEl.innerHTML = html;

        // Ouvir mudanças nos checkboxes para aplicar instantaneamente
        listEl.querySelectorAll('.column-toggle-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                const isChecked = e.target.checked;
                Table.toggleColumn(key, isChecked);
            });
        });

        openModal('modal-columns');
    }

    // ==========================================
    // 3. Modais Genéricos e Eventos
    // ==========================================

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function initModalEvents() {
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.closeModal;
                if (target) closeModal(target);
            });
        });

        // Fechar ao clicar no backdrop
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.add('hidden');
                }
            });
        });
    }

    function showConfirm(message, onConfirm) {
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('btn-confirm-ok');
        const cancelBtn = document.getElementById('btn-confirm-cancel');

        if (msgEl) msgEl.textContent = message;

        const handleOk = () => {
            closeModal('modal-confirm');
            cleanup();
            if (onConfirm) onConfirm();
        };

        const handleCancel = () => {
            closeModal('modal-confirm');
            cleanup();
        };

        const cleanup = () => {
            if (okBtn) okBtn.removeEventListener('click', handleOk);
            if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
        };

        if (okBtn) okBtn.addEventListener('click', handleOk);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

        openModal('modal-confirm');
    }

    // ==========================================
    // 4. Notificações Toast
    // ==========================================

    function showNotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('notifications');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `notification notification--${type}`;

        const iconMap = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="notification__icon">${iconMap[type] || 'ℹ️'}</span>
            <span class="notification__message">${_escapeHtml(message)}</span>
            <button class="notification__close" aria-label="Fechar">&times;</button>
        `;

        toast.querySelector('.notification__close').addEventListener('click', () => {
            toast.remove();
        });

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('notification--fadeout');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    // ==========================================
    // 5. Renderização do Dashboard
    // ==========================================

    function updateDashboard(stats) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                const valEl = el.querySelector('.stat-card__value') || el;
                valEl.textContent = val !== undefined ? val : 0;
            }
        };

        setVal('stat-total', stats.total);
        setVal('stat-ativos', stats.ativos);
        setVal('stat-inativos', stats.inativos);
        setVal('stat-localizacoes', stats.localizacoes);
        setVal('stat-setores', stats.setores || stats.departamentos);

        // Lista de Setores no Dashboard
        const setorList = document.getElementById('dashboard-setor-list') || document.getElementById('dashboard-dept-list');
        const items = stats.porSetor || stats.porDepartamento;
        if (setorList && items) {
            if (items.length === 0) {
                setorList.innerHTML = '<p class="text-muted">Nenhum setor registrado.</p>';
            } else {
                let html = '<div class="dashboard-dist-grid">';
                items.forEach(d => {
                    const pct = stats.total > 0 ? Math.round((d.count / stats.total) * 100) : 0;
                    html += `
                        <div class="dist-card">
                            <div class="dist-card__header">
                                <span class="dist-card__name">${_escapeHtml(d.name)}</span>
                                <span class="dist-card__count">${d.count} ramais (${pct}%)</span>
                            </div>
                            <div class="dist-progress-bg">
                                <div class="dist-progress-bar" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                setorList.innerHTML = html;
            }
        }

        // Lista de Localizações no Dashboard
        const locList = document.getElementById('dashboard-loc-list');
        if (locList && stats.porLocalizacao) {
            if (stats.porLocalizacao.length === 0) {
                locList.innerHTML = '<p class="text-muted">Nenhuma localização registrada.</p>';
            } else {
                let html = '<div class="dashboard-dist-grid">';
                stats.porLocalizacao.forEach(l => {
                    const pct = stats.total > 0 ? Math.round((l.count / stats.total) * 100) : 0;
                    html += `
                        <div class="dist-card">
                            <div class="dist-card__header">
                                <span class="dist-card__name">${_escapeHtml(l.name)}</span>
                                <span class="dist-card__count">${l.count} ramais (${pct}%)</span>
                            </div>
                            <div class="dist-progress-bg">
                                <div class="dist-progress-bar dist-progress-bar--blue" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                locList.innerHTML = html;
            }
        }
    }

    // ==========================================
    // 6. Formulário de Adicionar / Editar Ramal
    // ==========================================

    function showAddModal(allFields, onSave, existingData = null) {
        const titleEl = document.getElementById('add-title');
        const container = document.getElementById('add-form-fields');
        const saveBtn = document.getElementById('btn-save-ramal');

        if (!container) return;

        if (titleEl) {
            titleEl.textContent = existingData ? 'Editar Ramal' : 'Cadastrar Novo Ramal';
        }

        let html = '<div class="form-grid">';
        allFields.forEach(field => {
            const currentVal = existingData && existingData[field.key] !== undefined ? existingData[field.key] : '';

            if (field.key === 'status') {
                const normVal = String(currentVal || 'Ativo').trim().toLowerCase();
                const isSelInativo = normVal === 'inativo' || normVal === 'inactive';
                const isSelPendente = normVal === 'pendente' || normVal === 'pending';
                const isSelAtivo = !isSelInativo && !isSelPendente;

                html += `
                    <div class="form-group">
                        <label class="form-label" for="form-field-${field.key}">${field.label}</label>
                        <select class="form-select" id="form-field-${field.key}">
                            <option value="Ativo" ${isSelAtivo ? 'selected' : ''}>Ativo</option>
                            <option value="Inativo" ${isSelInativo ? 'selected' : ''}>Inativo</option>
                            <option value="Pendente" ${isSelPendente ? 'selected' : ''}>Pendente</option>
                        </select>
                    </div>
                `;
            } else {
                html += `
                    <div class="form-group">
                        <label class="form-label" for="form-field-${field.key}">
                            ${field.label} ${field.required ? '<span style="color:var(--color-danger)">*</span>' : ''}
                        </label>
                        <input type="${field.type || 'text'}" class="form-input" id="form-field-${field.key}" value="${_escapeHtml(currentVal)}" ${field.required ? 'required' : ''}>
                    </div>
                `;
            }
        });
        html += '</div>';
        container.innerHTML = html;

        const handleSave = () => {
            const data = existingData ? { ...existingData } : {};
            let hasError = false;

            allFields.forEach(field => {
                const input = document.getElementById(`form-field-${field.key}`);
                if (input) {
                    const val = input.value.trim();
                    if (field.required && !val) {
                        input.classList.add('form-input--error');
                        hasError = true;
                    } else {
                        input.classList.remove('form-input--error');
                    }
                    data[field.key] = val;
                }
            });

            if (hasError) {
                showNotification('Por favor, preencha os campos obrigatórios.', 'warning');
                return;
            }

            closeModal('modal-add');
            cleanup();
            if (onSave) onSave(data);
        };

        const cleanup = () => {
            if (saveBtn) saveBtn.removeEventListener('click', handleSave);
        };

        if (saveBtn) {
            cleanup();
            saveBtn.addEventListener('click', handleSave);
        }

        openModal('modal-add');
    }

    // ==========================================
    // 7. Drag & Drop CSV
    // ==========================================

    function initDropZone(onFileLoaded) {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const btnSelect = document.getElementById('btn-select-csv');
        const btnNewImport = document.getElementById('btn-new-import');

        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, () => dropZone.classList.add('drop-zone--active'));
        });

        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, () => dropZone.classList.remove('drop-zone--active'));
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) _readFile(files[0], onFileLoaded);
        });

        if (btnSelect) {
            btnSelect.addEventListener('click', () => fileInput.click());
        }

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                _readFile(e.target.files[0], onFileLoaded);
                e.target.value = '';
            }
        });

        if (btnNewImport) {
            btnNewImport.addEventListener('click', () => fileInput.click());
        }
    }

    function _readFile(file, callback) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showNotification('Selecione um arquivo válido no formato .csv', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (callback) callback(e.target.result, file.name);
        };
        reader.onerror = () => {
            showNotification('Erro ao ler o arquivo CSV.', 'error');
        };
        reader.readAsText(file, 'UTF-8');
    }

    function showFileInfo(info) {
        const infoBox = document.getElementById('file-info');
        const dropContent = document.getElementById('drop-zone-content');

        if (infoBox) {
            document.getElementById('file-name').textContent = info.name || '—';
            document.getElementById('file-records').textContent = info.records || 0;
            document.getElementById('file-columns').textContent = info.columns || 0;
            infoBox.classList.remove('hidden');
        }
        if (dropContent) dropContent.classList.add('hidden');
    }

    function resetDropZone() {
        const infoBox = document.getElementById('file-info');
        const dropContent = document.getElementById('drop-zone-content');
        if (infoBox) infoBox.classList.add('hidden');
        if (dropContent) dropContent.classList.remove('hidden');
    }

    // ==========================================
    // 8. Tema & Paleta de Cores (ICA, IMI, Custom)
    // ==========================================

    function initTheme() {
        const savedTheme = localStorage.getItem('ramais_theme') || 'light';
        setTheme(savedTheme);

        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'light';
                const next = current === 'dark' ? 'light' : 'dark';
                setTheme(next);
            });
        }
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ramais_theme', theme);
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
            toggleBtn.setAttribute('title', theme === 'dark' ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro');
        }
    }

    /**
     * Aplica a paleta de cores (ICA, IMI ou Personalizada)
     * @param {string} paletteName - 'imi', 'ica', ou 'custom'
     * @param {Object} [customColors] - Objeto com cores personalizadas
     */
    function applyPalette(paletteName = 'imi', customColors = {}) {
        const root = document.documentElement;
        
        if (paletteName === 'ica') {
            root.setAttribute('data-palette', 'ica');
            _clearCustomColorOverrides();
        } else if (paletteName === 'custom' && customColors) {
            root.setAttribute('data-palette', 'custom');
            if (customColors.primary) {
                root.style.setProperty('--color-primary', customColors.primary);
                root.style.setProperty('--color-primary-light', customColors.primary + '22');
                root.style.setProperty('--color-primary-subtle', customColors.primary + '0d');
            }
            if (customColors.primaryHover) {
                root.style.setProperty('--color-primary-hover', customColors.primaryHover);
            }
            if (customColors.sidebar) {
                root.style.setProperty('--color-sidebar', customColors.sidebar);
            }
            if (customColors.accent) {
                root.style.setProperty('--color-brand-accent', customColors.accent);
                root.style.setProperty('--color-brand-gradient', `linear-gradient(135deg, ${customColors.accent} 0%, ${customColors.primary || '#0077C8'} 100%)`);
            }
        } else {
            root.setAttribute('data-palette', 'imi');
            _clearCustomColorOverrides();
        }

        _syncPaletteCardsUI(paletteName, customColors);
    }

    function _clearCustomColorOverrides() {
        const root = document.documentElement;
        root.style.removeProperty('--color-primary');
        root.style.removeProperty('--color-primary-hover');
        root.style.removeProperty('--color-primary-light');
        root.style.removeProperty('--color-primary-subtle');
        root.style.removeProperty('--color-sidebar');
        root.style.removeProperty('--color-brand-accent');
        root.style.removeProperty('--color-brand-gradient');
    }

    function _syncPaletteCardsUI(paletteName, customColors) {
        document.querySelectorAll('.palette-card[data-palette-choice]').forEach(card => {
            if (card.dataset.paletteChoice === paletteName) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        const customPanel = document.getElementById('custom-palette-panel');
        const btnResetCustom = document.getElementById('btn-reset-custom-palette');
        if (customPanel) {
            if (paletteName === 'custom') {
                customPanel.classList.remove('hidden');
                if (btnResetCustom) btnResetCustom.classList.remove('hidden');
            } else {
                customPanel.classList.add('hidden');
                if (btnResetCustom) btnResetCustom.classList.add('hidden');
            }
        }

        if (customColors && typeof customColors === 'object') {
            const pickPrimary = document.getElementById('picker-primary');
            const hexPrimary = document.getElementById('hex-primary');
            const pickHover = document.getElementById('picker-primary-hover');
            const hexHover = document.getElementById('hex-primary-hover');
            const pickSidebar = document.getElementById('picker-sidebar');
            const hexSidebar = document.getElementById('hex-sidebar');
            const pickAccent = document.getElementById('picker-accent');
            const hexAccent = document.getElementById('hex-accent');

            if (customColors.primary) {
                if (pickPrimary) pickPrimary.value = customColors.primary;
                if (hexPrimary) hexPrimary.value = customColors.primary;
                const swatchPrimary = document.getElementById('swatch-custom-primary');
                if (swatchPrimary) swatchPrimary.style.backgroundColor = customColors.primary;
            }
            if (customColors.primaryHover) {
                if (pickHover) pickHover.value = customColors.primaryHover;
                if (hexHover) hexHover.value = customColors.primaryHover;
            }
            if (customColors.sidebar) {
                if (pickSidebar) pickSidebar.value = customColors.sidebar;
                if (hexSidebar) hexSidebar.value = customColors.sidebar;
                const swatchSidebar = document.getElementById('swatch-custom-sidebar');
                if (swatchSidebar) swatchSidebar.style.backgroundColor = customColors.sidebar;
            }
            if (customColors.accent) {
                if (pickAccent) pickAccent.value = customColors.accent;
                if (hexAccent) hexAccent.value = customColors.accent;
                const swatchAccent = document.getElementById('swatch-custom-accent');
                if (swatchAccent) swatchAccent.style.backgroundColor = customColors.accent;
            }
        }
    }

    function updateFilters(options) {
        const populateSelect = (id, values) => {
            const select = document.getElementById(id);
            if (!select) return;
            const currentVal = select.value;
            let html = '<option value="">Todos</option>';
            values.forEach(v => {
                html += `<option value="${_escapeHtml(v)}" ${v === currentVal ? 'selected' : ''}>${_escapeHtml(v)}</option>`;
            });
            select.innerHTML = html;
        };

        populateSelect('filter-status', options.status || []);
        populateSelect('filter-localizacao', options.localizacao || []);
        populateSelect('filter-setor', options.setor || []);
        populateSelect('filter-empresa', options.empresa || []);
    }

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    return {
        init,
        switchView,
        getCurrentView,
        showColumnConfigModal,
        openModal,
        closeModal,
        showConfirm,
        showNotification,
        updateDashboard,
        showAddModal,
        initDropZone,
        showFileInfo,
        resetDropZone,
        updateFilters,
        setTheme,
        applyPalette
    };
})();
