/**
 * Aplicação Principal (App) - SPA Full-Stack
 * Gate de Autenticação Obrigatória LDAP / Active Directory + Local Admin
 */
const App = (function() {
    let _records = [];
    let _pendingCsvData = null;
    let _isInitialized = false;
    let _viewMode = 'cards';
    let _currentSearch = '';
    let _currentFilters = { status: '', localizacao: '', setor: '', empresa: '' };
    let _activePalette = 'imi';
    let _customColors = {
        primary: '#0077C8',
        primaryHover: '#005A9E',
        sidebar: '#0F1E2E',
        accent: '#00ACC1'
    };

    /**
     * Inicialização da aplicação.
     */
    async function init() {
        if (_isInitialized) return;

        try {
            Table.init();
            UI.init();
            _bindEvents();

            // 1. Carregar configurações públicas iniciais (Logo e Tema)
            await _loadPublicConfig();

            // 2. Verificar se já possui sessão ativa
            if (Api.isAuthenticated()) {
                const userMe = await Api.checkAuth().catch(() => null);
                if (userMe && userMe.user) {
                    await _unlockApplication();
                } else {
                    _showLoginGate();
                }
            } else {
                _showLoginGate();
            }

            _isInitialized = true;
        } catch (err) {
            console.error('Erro ao inicializar aplicativo:', err);
            _showLoginGate();
        }
    }

    /**
     * Exibe a tela de login inicial e bloqueia o layout do sistema.
     */
    function _showLoginGate() {
        const loginGate = document.getElementById('login-gate-screen');
        const appLayout = document.getElementById('app-layout');
        if (loginGate) loginGate.classList.remove('hidden');
        if (appLayout) appLayout.classList.add('hidden');
    }

    /**
     * Desbloqueia e inicializa o layout principal após autenticação válida.
     */
    async function _unlockApplication() {
        const loginGate = document.getElementById('login-gate-screen');
        const appLayout = document.getElementById('app-layout');
        if (loginGate) loginGate.classList.add('hidden');
        if (appLayout) appLayout.classList.remove('hidden');

        _applyAuthMode();

        const currentUser = Api.getCurrentUser();
        if (!currentUser || currentUser.role !== 'admin') {
            UI.switchView('ramais');
        }

        await refreshAllData();

        // Se for admin, carregar parâmetros LDAP no formulário
        if (currentUser && currentUser.role === 'admin') {
            await _loadLdapFormConfig();
        }
    }

    /**
     * Atualiza o estado da interface com base no status do usuário logado.
     */
    function _applyAuthMode() {
        const isAuth = Api.isAuthenticated();
        const user = Api.getCurrentUser();

        const roleBadge = document.getElementById('user-role-badge');
        const btnTopbarLogin = document.getElementById('btn-topbar-login');

        if (isAuth && user) {
            if (user.role === 'admin') {
                document.documentElement.setAttribute('data-role', 'admin');
                if (roleBadge) {
                    roleBadge.textContent = `Admin (${user.username})`;
                    roleBadge.className = 'role-badge role-badge--admin';
                }
                if (btnTopbarLogin) btnTopbarLogin.classList.add('hidden');
            } else {
                document.documentElement.removeAttribute('data-role');
                if (roleBadge) {
                    roleBadge.textContent = `Colaborador: ${user.displayName || user.username}`;
                    roleBadge.className = 'role-badge role-badge--colab';
                }
                if (btnTopbarLogin) btnTopbarLogin.classList.remove('hidden');
            }
        } else {
            document.documentElement.removeAttribute('data-role');
        }

        Table.render();
    }

    async function _loadPublicConfig() {
        try {
            const config = await Api.getConfig();
            _applyConfig(config);
        } catch (_) {}
    }

    function _applyConfig(config) {
        if (!config) return;

        const logoEl = document.getElementById('app-logo');
        const previewEl = document.getElementById('logo-preview');
        const loginLogoEl = document.getElementById('login-logo');
        const loginLogoPlaceholder = document.getElementById('login-logo-placeholder');

        if (config.logo) {
            if (logoEl) { logoEl.src = config.logo; logoEl.style.display = ''; }
            if (previewEl) { previewEl.src = config.logo; previewEl.style.display = ''; }
            if (loginLogoEl) { loginLogoEl.src = config.logo; loginLogoEl.style.display = ''; }
            if (loginLogoPlaceholder) loginLogoPlaceholder.style.display = 'none';
        } else {
            if (logoEl) { logoEl.src = ''; logoEl.style.display = 'none'; }
            if (previewEl) { previewEl.src = ''; previewEl.style.display = 'none'; }
            if (loginLogoEl) { loginLogoEl.src = ''; loginLogoEl.style.display = 'none'; }
            if (loginLogoPlaceholder) loginLogoPlaceholder.style.display = '';
        }

        // Paleta de Cores (ICA, IMI, Custom)
        if (config.theme_palette) {
            _activePalette = config.theme_palette;
            if (config.custom_colors && typeof config.custom_colors === 'object') {
                _customColors = { ..._customColors, ...config.custom_colors };
            }
            UI.applyPalette(_activePalette, _customColors);
        }
    }

    async function _loadLdapFormConfig() {
        try {
            const ldapCfg = await Api.getLdapConfig();
            if (ldapCfg) {
                const urlEl = document.getElementById('cfg-ldap-url');
                const baseDnEl = document.getElementById('cfg-ldap-base-dn');
                const bindUserEl = document.getElementById('cfg-ldap-bind-user');
                const bindPassEl = document.getElementById('cfg-ldap-bind-pass');
                const groupDnEl = document.getElementById('cfg-ldap-group-dn');

                if (urlEl) urlEl.value = ldapCfg.url || '';
                if (baseDnEl) baseDnEl.value = ldapCfg.baseDn || '';
                if (bindUserEl) bindUserEl.value = ldapCfg.bindUser || '';
                if (bindPassEl) bindPassEl.value = ldapCfg.bindPassword || '********';
                if (groupDnEl) groupDnEl.value = ldapCfg.groupDn || '';
            }
        } catch (e) {
            console.warn('Não foi possível carregar config LDAP:', e);
        }
    }

    let _colaboradoresList = [];

    function _cleanStr(str) {
        if (str === null || str === undefined) return '';
        return str
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    /**
     * Carrega e renderiza a lista de colaboradores (Admin).
     */
    async function _loadColaboradores(filterText = '') {
        const tbody = document.getElementById('colaboradores-table-body');
        const countEl = document.getElementById('colaboradores-count');
        if (!tbody) return;

        try {
            if (!filterText) {
                _colaboradoresList = await Api.getColaboradores();
            }

            let filtered = _colaboradoresList;
            if (filterText) {
                const q = _cleanStr(filterText);
                filtered = _colaboradoresList.filter(u =>
                    (u.username && _cleanStr(u.username).includes(q)) ||
                    (u.display_name && _cleanStr(u.display_name).includes(q)) ||
                    (u.email && _cleanStr(u.email).includes(q))
                );
                if (countEl) {
                    countEl.textContent = `${filtered.length} colaborador(es) encontrado(s)`;
                }
            } else {
                filtered = _colaboradoresList.slice(0, 5);
                if (countEl) {
                    countEl.textContent = `Exibindo os 5 acessos mais recentes (${_colaboradoresList.length} total)`;
                }
            }

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px;" class="text-muted">Nenhum colaborador encontrado.</td></tr>`;
                return;
            }

            const formatDate = (dStr) => {
                if (!dStr) return '-';
                try {
                    const d = new Date(dStr);
                    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                } catch (_) {
                    return dStr;
                }
            };

            const html = filtered.map(u => {
                const isAdmin = u.role === 'admin';
                const isDefaultAdmin = u.username === 'admin';

                let actionHtml = '';
                if (isDefaultAdmin) {
                    actionHtml = `<span class="badge badge--neutral" style="font-size: 0.75rem;">Admin Padrão</span>`;
                } else if (isAdmin) {
                    actionHtml = `<button class="btn btn--secondary btn--sm btn-toggle-user-role" data-id="${u.id}" data-role="colaborador" title="Rebaixar para Colaborador">Rebaixar para Colaborador</button>`;
                } else {
                    actionHtml = `<button class="btn btn--primary btn--sm btn-toggle-user-role" data-id="${u.id}" data-role="admin" title="Promover a Administrador">⭐ Tornar Administrador</button>`;
                }

                return `
                    <tr>
                        <td><strong>${u.username}</strong></td>
                        <td>${u.display_name || '-'}</td>
                        <td>${u.email || '-'}</td>
                        <td style="font-size: 0.8rem; color: var(--color-text-secondary);">${formatDate(u.first_login_at || u.created_at)}</td>
                        <td style="font-size: 0.8rem; color: var(--color-text-secondary);">${formatDate(u.last_login_at)}</td>
                        <td style="text-align: center;"><span class="cell-badge">${u.login_count || 1}</span></td>
                        <td>
                            <span class="role-badge ${isAdmin ? 'role-badge--admin' : 'role-badge--colab'}">
                                ${isAdmin ? '👑 Administrador' : '👤 Colaborador'}
                            </span>
                        </td>
                        <td style="text-align: right;">${actionHtml}</td>
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = html;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--color-danger);">Erro ao carregar colaboradores: ${err.message}</td></tr>`;
        }
    }

    /**
     * Busca os dados mais recentes da API REST (Ramais e Estatísticas).
     */
    async function refreshAllData() {
        if (!Api.isAuthenticated()) return;
        try {
            // 1. Buscar Lista de Ramais
            _records = await Api.getRamais();
            Table.setData(_records);
            UI.updateFilters(Table.getFilterOptions());
            _renderRamais();

            // 2. Buscar Estatísticas do Dashboard (se admin)
            if (Api.getCurrentUser()?.role === 'admin') {
                const stats = await Api.getStats().catch(() => null);
                if (stats) UI.updateDashboard(stats);
            }
        } catch (err) {
            console.error('Erro ao sincronizar dados:', err);
            if (err.message && (err.message.includes('401') || err.message.includes('Sessão expirada'))) {
                _showLoginGate();
            }
        }
    }

    /**
     * Renderiza os ramais conforme o modo de visualização ativo (Cards por Setores vs Tabela).
     */
    function _renderRamais() {
        const cardsContainer = document.getElementById('ramais-cards-container');
        const tableWrapper = document.getElementById('ramais-table-wrapper');
        const btnCols = document.getElementById('btn-config-columns');
        const pageSize = document.getElementById('page-size-select');
        const modeIcon = document.getElementById('view-mode-icon');
        const modeLabel = document.getElementById('view-mode-label');

        if (_viewMode === 'cards') {
            if (cardsContainer) cardsContainer.classList.remove('hidden');
            if (tableWrapper) tableWrapper.classList.add('hidden');
            if (btnCols) btnCols.classList.add('hidden');
            if (pageSize) pageSize.classList.add('hidden');
            if (modeIcon) modeIcon.textContent = '📋';
            if (modeLabel) modeLabel.textContent = 'Modo Tabela';

            if (typeof CardsView !== 'undefined') {
                CardsView.render(_records, _currentSearch, _currentFilters);
            }
        } else {
            if (cardsContainer) cardsContainer.classList.add('hidden');
            if (tableWrapper) tableWrapper.classList.remove('hidden');
            if (btnCols) btnCols.classList.remove('hidden');
            if (pageSize) pageSize.classList.remove('hidden');
            if (modeIcon) modeIcon.textContent = '🔲';
            if (modeLabel) modeLabel.textContent = 'Modo Quadrados';

            Table.render();
        }
    }

    /**
     * Vinculação de eventos DOM.
     */
    function _bindEvents() {
        // Expiração de Token
        window.addEventListener('auth:expired', () => {
            _showLoginGate();
            UI.showNotification('Sessão expirada. Faça login novamente.', 'warning');
        });

        // Troca de View na Sidebar
        window.addEventListener('view:changed', async (e) => {
            if (e.detail.view === 'dashboard' && Api.isAuthenticated()) {
                const stats = await Api.getStats();
                UI.updateDashboard(stats);
            } else if (e.detail.view === 'colaboradores' && Api.isAuthenticated()) {
                await _loadColaboradores();
            }
        });

        // ==========================================
        // 1. Login Gate Unificado (LDAP / Local)
        // ==========================================
        const formLogin = document.getElementById('form-login');
        const btnDoLogin = document.getElementById('btn-do-login');

        const handleLogin = async () => {
            const userEl = document.getElementById('login-username');
            const passEl = document.getElementById('login-password');
            const username = userEl ? userEl.value.trim() : '';
            const password = passEl ? passEl.value : '';

            if (!username || !password) {
                UI.showNotification('Informe usuário e senha.', 'warning');
                return;
            }

            if (btnDoLogin) {
                btnDoLogin.disabled = true;
                btnDoLogin.textContent = 'Autenticando...';
            }

            try {
                const res = await Api.ldapLogin(username, password);
                if (passEl) passEl.value = '';
                await _unlockApplication();
                const displayName = res.user?.displayName || res.user?.username || username;
                UI.showNotification(`Bem-vindo, ${displayName}!`, 'success');
            } catch (err) {
                UI.showNotification(err.message, 'error', 6000);
            } finally {
                if (btnDoLogin) {
                    btnDoLogin.disabled = false;
                    btnDoLogin.textContent = 'Entrar no Sistema';
                }
            }
        };

        if (formLogin) formLogin.addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });
        if (btnDoLogin) btnDoLogin.addEventListener('click', handleLogin);

        // ==========================================
        // 2. Topbar Login (Elevação para Admin) & Logout
        // ==========================================
        const btnTopbarLogin = document.getElementById('btn-topbar-login');
        if (btnTopbarLogin) {
            btnTopbarLogin.addEventListener('click', () => {
                // Abrir prompt ou modal simples para elevação de admin local
                const pw = prompt('Digite a senha de Administrador Local para habilitar funções de edição:');
                if (pw) {
                    Api.login(pw).then(async res => {
                        _applyAuthMode();
                        await _loadLdapFormConfig();
                        UI.showNotification('Modo de Administrador ativado!', 'success');
                    }).catch(err => {
                        UI.showNotification('Senha incorreta: ' + err.message, 'error');
                    });
                }
            });
        }

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                Api.clearAuth();
                _applyAuthMode();
                _showLoginGate();
                UI.showNotification('Sessão encerrada.', 'info');
            });
        }

        // ==========================================
        // 3. Configurações LDAP no Painel Admin
        // ==========================================
        const btnSaveLdap = document.getElementById('btn-save-ldap-config');
        if (btnSaveLdap) {
            btnSaveLdap.addEventListener('click', async () => {
                const url = document.getElementById('cfg-ldap-url')?.value.trim();
                const baseDn = document.getElementById('cfg-ldap-base-dn')?.value.trim();
                const bindUser = document.getElementById('cfg-ldap-bind-user')?.value.trim();
                const bindPassword = document.getElementById('cfg-ldap-bind-pass')?.value;
                const groupDn = document.getElementById('cfg-ldap-group-dn')?.value.trim();

                try {
                    await Api.saveLdapConfig({ url, baseDn, bindUser, bindPassword, groupDn, enabled: true });
                    UI.showNotification('Parâmetros do Active Directory salvos com sucesso!', 'success');
                } catch (err) {
                    UI.showNotification('Erro ao salvar: ' + err.message, 'error');
                }
            });
        }

        const btnTestLdap = document.getElementById('btn-test-ldap-config');
        if (btnTestLdap) {
            btnTestLdap.addEventListener('click', async () => {
                const url = document.getElementById('cfg-ldap-url')?.value.trim();
                const baseDn = document.getElementById('cfg-ldap-base-dn')?.value.trim();
                const bindUser = document.getElementById('cfg-ldap-bind-user')?.value.trim();
                const bindPassword = document.getElementById('cfg-ldap-bind-pass')?.value;
                const groupDn = document.getElementById('cfg-ldap-group-dn')?.value.trim();

                btnTestLdap.disabled = true;
                btnTestLdap.textContent = 'Testando...';

                try {
                    const res = await Api.testLdap({ url, baseDn, bindUser, bindPassword, groupDn });
                    UI.showNotification(res.message, 'success', 6000);
                } catch (err) {
                    UI.showNotification('Falha no teste LDAP: ' + err.message, 'error', 6000);
                } finally {
                    btnTestLdap.disabled = false;
                    btnTestLdap.textContent = '🔌 Testar Conexão AD';
                }
            });
        }

        // ==========================================
        // 4. Gestão de Colaboradores (Admin)
        // ==========================================
        const btnRefreshColab = document.getElementById('btn-refresh-colaboradores');
        if (btnRefreshColab) {
            btnRefreshColab.addEventListener('click', async () => {
                await _loadColaboradores();
                UI.showNotification('Lista de colaboradores atualizada.', 'info');
            });
        }

        const searchColab = document.getElementById('search-colaboradores');
        if (searchColab) {
            let colabTimer;
            searchColab.addEventListener('input', (e) => {
                clearTimeout(colabTimer);
                colabTimer = setTimeout(() => {
                    _loadColaboradores(e.target.value.trim());
                }, 250);
            });
        }

        const colabTbody = document.getElementById('colaboradores-table-body');
        if (colabTbody) {
            colabTbody.addEventListener('click', async (e) => {
                const btn = e.target.closest('.btn-toggle-user-role');
                if (!btn) return;

                const userId = btn.dataset.id;
                const newRole = btn.dataset.role;
                const roleLabel = newRole === 'admin' ? 'Administrador' : 'Colaborador';

                UI.showConfirm(`Deseja alterar o perfil deste usuário para ${roleLabel}?`, async () => {
                    try {
                        const res = await Api.updateColaboradorRole(userId, newRole);
                        UI.showNotification(res.message, 'success');
                        await _loadColaboradores();
                    } catch (err) {
                        UI.showNotification('Erro ao alterar perfil: ' + err.message, 'error');
                    }
                });
            });
        }

        // ==========================================
        // 5. Ações de Ramais e Tabela
        // ==========================================
        Table.onEdit = (record) => {
            if (Api.getCurrentUser()?.role !== 'admin') return;
            const allFields = DataNormalizer.getAllFields();
            UI.showAddModal(allFields, async (updatedData) => {
                try {
                    await Api.updateRamal(record._id, updatedData);
                    UI.showNotification('Ramal atualizado com sucesso!', 'success');
                    await refreshAllData();
                } catch (err) {
                    UI.showNotification('Erro ao atualizar: ' + err.message, 'error');
                }
            }, record);
        };

        window.addEventListener('ramal:delete-request', (e) => {
            if (Api.getCurrentUser()?.role !== 'admin') return;
            const id = e.detail.id;
            UI.showConfirm('Tem certeza que deseja excluir este ramal?', async () => {
                try {
                    await Api.deleteRamal(id);
                    UI.showNotification('Ramal excluído com sucesso.', 'success');
                    await refreshAllData();
                } catch (err) {
                    UI.showNotification('Erro ao excluir: ' + err.message, 'error');
                }
            });
        });

        Table.onSelectionChange = (selectedIds) => {
            const bulkBar = document.getElementById('bulk-actions');
            const bulkCount = document.getElementById('bulk-count');
            if (bulkBar && bulkCount) {
                if (selectedIds.length > 0 && Api.getCurrentUser()?.role === 'admin') {
                    bulkCount.textContent = `${selectedIds.length} selecionado(s)`;
                    bulkBar.classList.remove('hidden');
                } else {
                    bulkBar.classList.add('hidden');
                }
            }
        };

        const btnDeleteSelected = document.getElementById('btn-delete-selected');
        if (btnDeleteSelected) {
            btnDeleteSelected.addEventListener('click', () => {
                const ids = Table.getSelectedIds();
                if (ids.length === 0) return;
                UI.showConfirm(`Deseja realmente excluir os ${ids.length} ramais selecionados?`, async () => {
                    try {
                        await Api.bulkDeleteRamais(ids);
                        Table.clearSelection();
                        UI.showNotification(`${ids.length} ramais excluídos com sucesso.`, 'success');
                        await refreshAllData();
                    } catch (err) {
                        UI.showNotification('Erro: ' + err.message, 'error');
                    }
                });
            });
        }

        const btnClearSelection = document.getElementById('btn-clear-selection');
        if (btnClearSelection) {
            btnClearSelection.addEventListener('click', () => Table.clearSelection());
        }

        // Alternar Modo de Visualização (Cards vs Tabela)
        const btnToggleViewMode = document.getElementById('btn-toggle-view-mode');
        if (btnToggleViewMode) {
            btnToggleViewMode.addEventListener('click', () => {
                _viewMode = _viewMode === 'cards' ? 'table' : 'cards';
                _renderRamais();
            });
        }

        // Busca
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            let timer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    _currentSearch = e.target.value;
                    Table.setSearchQuery(_currentSearch);
                    if (_viewMode === 'cards' && typeof CardsView !== 'undefined') {
                        CardsView.render(_records, _currentSearch, _currentFilters);
                    }
                }, 200);
            });
        }

        // Filtros
        ['filter-status', 'filter-localizacao', 'filter-setor', 'filter-empresa'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const filterKey = id.replace('filter-', '');
                el.addEventListener('change', (e) => {
                    _currentFilters[filterKey] = e.target.value;
                    Table.setFilter(filterKey, e.target.value);
                    if (_viewMode === 'cards' && typeof CardsView !== 'undefined') {
                        CardsView.render(_records, _currentSearch, _currentFilters);
                    }
                });
            }
        });

        // Paginação
        const pageSizeSelect = document.getElementById('page-size-select');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => Table.setPageSize(pageSizeSelect.value));
        }

        // Gestão de Colunas
        const btnConfigColumns = document.getElementById('btn-config-columns');
        if (btnConfigColumns) {
            btnConfigColumns.addEventListener('click', () => UI.showColumnConfigModal());
        }

        const btnSelectAllCols = document.getElementById('btn-select-all-columns');
        if (btnSelectAllCols) {
            btnSelectAllCols.addEventListener('click', () => {
                const cols = Table.getColumns().map(c => ({ ...c, visible: true }));
                Table.setColumns(cols);
                UI.showColumnConfigModal();
            });
        }

        const btnResetCols = document.getElementById('btn-reset-columns');
        if (btnResetCols) {
            btnResetCols.addEventListener('click', () => {
                localStorage.removeItem('ramais_visible_columns');
                Table.initColumns();
                Table.render();
                UI.showColumnConfigModal();
            });
        }

        // Alterar Senha Local
        const btnChangePw = document.getElementById('btn-change-password');
        if (btnChangePw) {
            btnChangePw.addEventListener('click', async () => {
                const valNew = document.getElementById('new-admin-password')?.value.trim();
                const valConfirm = document.getElementById('confirm-admin-password')?.value.trim();

                if (!valNew || valNew !== valConfirm) {
                    UI.showNotification('As senhas não coincidem ou estão vazias.', 'warning');
                    return;
                }

                try {
                    await Api.changePassword(valNew);
                    document.getElementById('new-admin-password').value = '';
                    document.getElementById('confirm-admin-password').value = '';
                    UI.showNotification('Senha de administrador alterada!', 'success');
                } catch (err) {
                    UI.showNotification('Erro: ' + err.message, 'error');
                }
            });
        }

        // Adicionar Ramal
        const btnAddRamal = document.getElementById('btn-add-ramal');
        if (btnAddRamal) {
            btnAddRamal.addEventListener('click', () => {
                if (Api.getCurrentUser()?.role !== 'admin') return;
                const allFields = DataNormalizer.getAllFields();
                UI.showAddModal(allFields, async (formData) => {
                    try {
                        await Api.createRamal(formData);
                        UI.showNotification('Novo ramal cadastrado com sucesso!', 'success');
                        await refreshAllData();
                    } catch (err) {
                        UI.showNotification('Erro ao cadastrar: ' + err.message, 'error');
                    }
                });
            });
        }

        // Importação e Exportação CSV
        UI.initDropZone((text, fileName) => onFileLoaded(text, fileName));

        const btnConfirmMapping = document.getElementById('btn-confirm-mapping');
        if (btnConfirmMapping) {
            btnConfirmMapping.addEventListener('click', () => processImport());
        }

        const btnExportCsv = document.getElementById('btn-export-csv');
        if (btnExportCsv) {
            btnExportCsv.addEventListener('click', () => UI.openModal('modal-export'));
        }

        const btnDoExport = document.getElementById('btn-do-export');
        if (btnDoExport) {
            btnDoExport.addEventListener('click', () => {
                _exportCsv();
                UI.closeModal('modal-export');
            });
        }

        // Logo
        const btnUploadLogo = document.getElementById('btn-upload-logo');
        const logoFileInput = document.getElementById('logo-file-input');
        if (btnUploadLogo && logoFileInput) {
            btnUploadLogo.addEventListener('click', () => logoFileInput.click());
            logoFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64Data = ev.target.result;
                    try {
                        await Api.saveConfig({ logo: base64Data });
                        _applyConfig({ logo: base64Data });
                        UI.showNotification('Logo atualizada com sucesso!', 'success');
                    } catch (err) {
                        UI.showNotification('Erro ao salvar logo: ' + err.message, 'error');
                    }
                };
                reader.readAsDataURL(file);
                e.target.value = '';
            });
        }

        const btnRemoveLogo = document.getElementById('btn-remove-logo');
        if (btnRemoveLogo) {
            btnRemoveLogo.addEventListener('click', async () => {
                try {
                    await Api.saveConfig({ logo: '' });
                    _applyConfig({ logo: '' });
                    UI.showNotification('Logo removida.', 'info');
                } catch (err) {
                    UI.showNotification('Erro: ' + err.message, 'error');
                }
            });
        }

        // ==========================================
        // 6. Paleta de Cores e Identidade Visual (ICA, IMI, Custom)
        // ==========================================
        document.querySelectorAll('.palette-card[data-palette-choice]').forEach(card => {
            card.addEventListener('click', () => {
                _activePalette = card.dataset.paletteChoice;
                UI.applyPalette(_activePalette, _customColors);
            });
        });

        // Sincronização e Live Preview dos controles customizados
        const setupColorControl = (pickerId, hexId, key, swatchId) => {
            const picker = document.getElementById(pickerId);
            const hex = document.getElementById(hexId);
            const swatch = swatchId ? document.getElementById(swatchId) : null;

            if (picker && hex) {
                picker.addEventListener('input', (e) => {
                    hex.value = e.target.value;
                    _customColors[key] = e.target.value;
                    if (swatch) swatch.style.backgroundColor = e.target.value;
                    if (_activePalette === 'custom') {
                        UI.applyPalette('custom', _customColors);
                    }
                });

                hex.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        picker.value = val;
                        _customColors[key] = val;
                        if (swatch) swatch.style.backgroundColor = val;
                        if (_activePalette === 'custom') {
                            UI.applyPalette('custom', _customColors);
                        }
                    }
                });
            }
        };

        setupColorControl('picker-primary', 'hex-primary', 'primary', 'swatch-custom-primary');
        setupColorControl('picker-primary-hover', 'hex-primary-hover', 'primaryHover');
        setupColorControl('picker-sidebar', 'hex-sidebar', 'sidebar', 'swatch-custom-sidebar');
        setupColorControl('picker-accent', 'hex-accent', 'accent', 'swatch-custom-accent');

        const btnSavePalette = document.getElementById('btn-save-palette');
        if (btnSavePalette) {
            btnSavePalette.addEventListener('click', async () => {
                try {
                    await Api.saveConfig({
                        theme_palette: _activePalette,
                        custom_colors: _customColors
                    });
                    UI.showNotification('Paleta de cores salva com sucesso!', 'success');
                } catch (err) {
                    UI.showNotification('Erro ao salvar paleta: ' + err.message, 'error');
                }
            });
        }

        const btnResetCustomPalette = document.getElementById('btn-reset-custom-palette');
        if (btnResetCustomPalette) {
            btnResetCustomPalette.addEventListener('click', () => {
                _customColors = {
                    primary: '#0077C8',
                    primaryHover: '#005A9E',
                    sidebar: '#0F1E2E',
                    accent: '#00ACC1'
                };
                UI.applyPalette(_activePalette, _customColors);
                UI.showNotification('Cores restauradas para os valores padrão.', 'info');
            });
        }

        // Alteração de Senha do Administrador Local
        const btnChangePass = document.getElementById('btn-change-password');
        if (btnChangePass) {
            btnChangePass.addEventListener('click', async () => {
                const newPassEl = document.getElementById('new-admin-password');
                const confirmPassEl = document.getElementById('confirm-admin-password');
                const newPass = newPassEl ? newPassEl.value : '';
                const confirmPass = confirmPassEl ? confirmPassEl.value : '';

                if (!newPass) {
                    UI.showNotification('Digite a nova senha.', 'warning');
                    return;
                }
                if (newPass !== confirmPass) {
                    UI.showNotification('As senhas digitadas não coincidem.', 'warning');
                    return;
                }
                if (newPass.length < 3) {
                    UI.showNotification('A senha deve ter no mínimo 3 caracteres.', 'warning');
                    return;
                }

                try {
                    await Api.changePassword(newPass);
                    UI.showNotification('Senha do administrador local atualizada com sucesso!', 'success');
                    if (newPassEl) newPassEl.value = '';
                    if (confirmPassEl) confirmPassEl.value = '';
                } catch (err) {
                    UI.showNotification('Erro ao alterar senha: ' + err.message, 'error');
                }
            });
        }

        // Exemplo e Limpeza
        const btnLoadExample = document.getElementById('btn-load-example');
        if (btnLoadExample) {
            btnLoadExample.addEventListener('click', () => {
                UI.showConfirm('Deseja carregar a lista de dados de exemplo?', async () => {
                    try {
                        const exampleData = DataNormalizer.getExampleData();
                        await Api.importRamais(exampleData, true);
                        UI.showNotification('Dados de exemplo carregados!', 'success');
                        await refreshAllData();
                    } catch (err) {
                        UI.showNotification('Erro: ' + err.message, 'error');
                    }
                });
            });
        }

        const btnClearData = document.getElementById('btn-clear-data');
        if (btnClearData) {
            btnClearData.addEventListener('click', () => {
                UI.showConfirm('ATENÇÃO: Deseja realmente excluir todos os ramais?', async () => {
                    try {
                        await Api.clearRamais();
                        UI.showNotification('Todos os ramais foram removidos.', 'info');
                        await refreshAllData();
                    } catch (err) {
                        UI.showNotification('Erro: ' + err.message, 'error');
                    }
                });
            });
        }
    }

    function onFileLoaded(text, fileName) {
        try {
            const parsed = CsvParser.parse(text);
            if (!parsed || parsed.rows.length === 0) {
                throw new Error('Arquivo vazio ou formato inválido.');
            }
            _pendingCsvData = { ...parsed, fileName };
            UI.showFileInfo({ name: fileName, records: parsed.rowCount, columns: parsed.colCount });
            const autoMap = DataNormalizer.autoDetectMapping(parsed.headers);
            _openMappingModal(parsed.headers, autoMap.mapping);
        } catch (err) {
            UI.showNotification('Erro ao processar CSV: ' + err.message, 'error');
        }
    }

    function _openMappingModal(headers, autoMapping) {
        const rowsContainer = document.getElementById('mapping-rows');
        const allFields = DataNormalizer.getAllFields();
        if (!rowsContainer) return;

        let html = '';
        allFields.forEach(field => {
            const selectedHeader = autoMapping[field.key] || '';
            html += `
                <div class="mapping-row">
                    <span class="mapping-row__field">${field.label} ${field.required ? '<span style="color:var(--color-danger)">*</span>' : ''}</span>
                    <select class="form-select mapping-row__select" data-field="${field.key}">
                        <option value="">— Não mapear —</option>
                        ${headers.map(h => `<option value="${h}" ${h === selectedHeader ? 'selected' : ''}>${h}</option>`).join('')}
                    </select>
                </div>
            `;
        });
        rowsContainer.innerHTML = html;
        UI.openModal('modal-mapping');
    }

    async function processImport() {
        if (!_pendingCsvData) return;
        const mapping = {};
        document.querySelectorAll('.mapping-row__select').forEach(select => {
            const field = select.dataset.field;
            const val = select.value;
            if (val) mapping[field] = val;
        });

        if (!mapping.ramal) {
            UI.showNotification('O campo "Ramal" precisa ser mapeado.', 'warning');
            return;
        }

        try {
            const normalized = DataNormalizer.normalize(_pendingCsvData.rows, mapping);
            await Api.importRamais(normalized, true);
            UI.closeModal('modal-mapping');
            UI.showNotification(`Importação concluída! ${normalized.length} ramais inseridos.`, 'success');
            _pendingCsvData = null;
            await refreshAllData();
        } catch (err) {
            UI.showNotification('Erro ao importar: ' + err.message, 'error');
        }
    }

    function _exportCsv() {
        const records = Table.getFilteredRecords();
        if (records.length === 0) {
            UI.showNotification('Nenhum registro para exportar.', 'warning');
            return;
        }

        const visibleCols = Table.getVisibleColumns();
        const headers = visibleCols.map(c => c.label);
        const rows = records.map(r => {
            const rowObj = {};
            visibleCols.forEach(col => {
                rowObj[col.label] = r[col.key] !== undefined ? r[col.key] : '';
            });
            return rowObj;
        });

        const separatorEl = document.getElementById('export-separator');
        const sep = separatorEl ? separatorEl.value : ';';

        const csvContent = CsvParser.generateCsv(headers, rows, sep);
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ramais_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        UI.showNotification('Arquivo CSV exportado com sucesso.', 'success');
    }

    return {
        init,
        refreshAllData
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
