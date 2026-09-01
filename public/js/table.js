/**
 * Módulo de Tabela Interativa (Table)
 * Gerenciamento dinâmico de colunas, ordenação, busca, filtros, paginação e seleção.
 */
const Table = (function() {
    let _allRecords = [];
    let _filteredRecords = [];
    let _columns = [];
    let _sortField = 'ramal';
    let _sortDirection = 'asc';
    let _currentPage = 1;
    let _pageSize = 50;
    let _pageSizeAll = false;
    let _selectedIds = new Set();
    let _searchQuery = '';
    let _filters = { status: '', localizacao: '', setor: '', empresa: '' };

    const STORAGE_KEY_COLUMNS = 'ramais_visible_columns';
    const DEFAULT_VISIBLE_KEYS = ['ramal', 'nome', 'localizacao', 'andar', 'setor', 'email', 'telefone', 'status', 'empresa'];

    // Callbacks
    let onDataChange = null;
    let onEdit = null;
    let onSelectionChange = null;

    /**
     * Inicializa a configuração de colunas a partir dos campos do DataNormalizer e localStorage.
     */
    function initColumns() {
        const allFields = typeof DataNormalizer !== 'undefined' ? DataNormalizer.getAllFields() : [];
        
        let savedColumnConfig = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY_COLUMNS);
            if (raw) savedColumnConfig = JSON.parse(raw);
        } catch (_) {}

        if (savedColumnConfig && Array.isArray(savedColumnConfig) && savedColumnConfig.length > 0) {
            // Mapear campos existentes com os salvos
            _columns = allFields.map((field, idx) => {
                const saved = savedColumnConfig.find(c => c.key === field.key);
                return {
                    key: field.key,
                    label: field.label,
                    visible: saved ? !!saved.visible : DEFAULT_VISIBLE_KEYS.includes(field.key),
                    order: saved && saved.order !== undefined ? saved.order : idx
                };
            });
        } else {
            // Configuração padrão inicial
            _columns = allFields.map((field, idx) => ({
                key: field.key,
                label: field.label,
                visible: DEFAULT_VISIBLE_KEYS.includes(field.key),
                order: idx
            }));
        }

        // Ordenar pela ordem configurada
        _columns.sort((a, b) => a.order - b.order);
    }

    /**
     * Inicialização do módulo de tabela.
     */
    function init() {
        initColumns();
        _bindEvents();
    }

    /**
     * Salva as preferências de colunas visíveis no localStorage.
     */
    function _persistColumns() {
        try {
            localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(_columns));
        } catch (e) {
            console.warn('Erro ao salvar colunas no localStorage:', e);
        }
    }

    /**
     * Alterna a visibilidade de uma coluna específica e re-renderiza a tabela.
     * @param {string} key - Chave do campo
     * @param {boolean} isVisible - Novo estado de visibilidade
     */
    function toggleColumn(key, isVisible) {
        const col = _columns.find(c => c.key === key);
        if (col) {
            col.visible = !!isVisible;
            _persistColumns();
            render();
        }
    }

    /**
     * Atualiza todas as colunas de uma vez.
     * @param {Array} columnsList 
     */
    function setColumns(columnsList) {
        _columns = columnsList;
        _persistColumns();
        render();
    }

    function getColumns() {
        return _columns;
    }

    function getVisibleColumns() {
        return _columns.filter(c => c.visible);
    }

    /**
     * Define a lista de registros e atualiza os filtros.
     * @param {Array} records 
     */
    function setData(records) {
        _allRecords = Array.isArray(records) ? [...records] : [];
        _selectedIds.clear();
        _applySearchAndFilters();
        if (onSelectionChange) onSelectionChange(Array.from(_selectedIds));
    }

    function getData() {
        return _allRecords;
    }

    function getFilteredRecords() {
        return _filteredRecords;
    }

    /**
     * Define o tamanho de página da tabela.
     * @param {string|number} size 
     */
    function setPageSize(size) {
        if (size === 'all') {
            _pageSizeAll = true;
        } else {
            _pageSizeAll = false;
            _pageSize = parseInt(size, 10) || 50;
        }
        _currentPage = 1;
        render();
    }

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
     * Aplica busca textual e filtros selecionados.
     */
    function _applySearchAndFilters() {
        let result = [..._allRecords];

        // 1. Busca global (sem distinção de maiúsculas/minúsculas e acentos)
        if (_searchQuery) {
            const query = _cleanStr(_searchQuery);
            result = result.filter(record => {
                return Object.entries(record).some(([k, val]) => {
                    if (k === '_id' || k === '_extras') return false;
                    return val && _cleanStr(val).includes(query);
                }) || (record._extras && Object.values(record._extras).some(v => v && _cleanStr(v).includes(query)));
            });
        }

        // 2. Filtros Dropdowns
        if (_filters.status) {
            const fStatus = _cleanStr(_filters.status);
            result = result.filter(r => _cleanStr(r.status) === fStatus);
        }
        if (_filters.localizacao) {
            const fLoc = _cleanStr(_filters.localizacao);
            result = result.filter(r => _cleanStr(r.localizacao) === fLoc);
        }
        if (_filters.setor) {
            const fSetor = _cleanStr(_filters.setor);
            result = result.filter(r => _cleanStr(r.setor) === fSetor);
        }
        if (_filters.empresa) {
            const fEmp = _cleanStr(_filters.empresa);
            result = result.filter(r => _cleanStr(r.empresa) === fEmp);
        }

        // 3. Ordenação
        if (_sortField) {
            result.sort((a, b) => {
                let valA = a[_sortField] || '';
                let valB = b[_sortField] || '';

                if (_sortField === 'ramal') {
                    const numA = parseInt(valA, 10);
                    const numB = parseInt(valB, 10);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return _sortDirection === 'asc' ? numA - numB : numB - numA;
                    }
                }

                const cmp = valA.toString().localeCompare(valB.toString(), 'pt-BR', { sensitivity: 'base' });
                return _sortDirection === 'asc' ? cmp : -cmp;
            });
        }

        _filteredRecords = result;
        _currentPage = 1;
        render();
    }

    function setSearchQuery(query) {
        _searchQuery = query || '';
        _applySearchAndFilters();
    }

    function setFilter(filterName, value) {
        if (_filters.hasOwnProperty(filterName)) {
            _filters[filterName] = value || '';
            _applySearchAndFilters();
        }
    }

    function clearFilters() {
        _searchQuery = '';
        _filters = { status: '', localizacao: '', setor: '', empresa: '' };
        _applySearchAndFilters();
    }

    function sortBy(field) {
        if (_sortField === field) {
            _sortDirection = _sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            _sortField = field;
            _sortDirection = 'asc';
        }
        _applySearchAndFilters();
    }

    function setPage(page) {
        const totalPages = _pageSizeAll ? 1 : (Math.ceil(_filteredRecords.length / _pageSize) || 1);
        if (page >= 1 && page <= totalPages) {
            _currentPage = page;
            render();
        }
    }

    function getPaginatedRecords() {
        if (_pageSizeAll) return _filteredRecords;
        const start = (_currentPage - 1) * _pageSize;
        return _filteredRecords.slice(start, start + _pageSize);
    }

    // ==========================================
    // Renderização do DOM da Tabela
    // ==========================================

    function render() {
        const thead = document.getElementById('table-head');
        const tbody = document.getElementById('table-body');
        const emptyState = document.getElementById('table-empty');
        const paginationContainer = document.getElementById('pagination');

        if (!thead || !tbody) return;

        const visibleCols = getVisibleColumns();
        const recordsToRender = getPaginatedRecords();
        const isAdmin = document.documentElement.getAttribute('data-role') === 'admin';

        // 1. Renderizar Cabeçalho (thead)
        let headerHtml = '<tr>';
        if (isAdmin) {
            headerHtml += `<th class="checkbox-cell" style="width: 40px;"><input type="checkbox" id="table-select-all" aria-label="Selecionar todos"></th>`;
        }

        visibleCols.forEach(col => {
            const isSorted = _sortField === col.key;
            const sortIcon = isSorted ? (_sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
            headerHtml += `
                <th class="sortable" data-field="${col.key}">
                    ${col.label}
                    <span class="sort-indicator">${sortIcon}</span>
                </th>
            `;
        });

        if (isAdmin) {
            headerHtml += `<th class="actions-cell" style="width: 100px; text-align: center;">Ações</th>`;
        }
        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;

        // 2. Renderizar Corpo da Tabela (tbody)
        if (recordsToRender.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            if (emptyState) emptyState.classList.add('hidden');
            let bodyHtml = '';

            recordsToRender.forEach(r => {
                const isSelected = _selectedIds.has(r._id);
                bodyHtml += `<tr data-id="${r._id}" class="${isSelected ? 'selected' : ''}">`;

                if (isAdmin) {
                    bodyHtml += `
                        <td class="checkbox-cell">
                            <input type="checkbox" class="row-checkbox" data-id="${r._id}" ${isSelected ? 'checked' : ''}>
                        </td>
                    `;
                }

                visibleCols.forEach(col => {
                    const val = r[col.key] !== undefined && r[col.key] !== null ? r[col.key] : '';
                    let cellContent = _escapeHtml(val);

                    // Formatação especial para Status com Badge
                    if (col.key === 'status') {
                        const statusLower = (val || 'Ativo').toString().trim().toLowerCase();
                        let badgeClass = 'cell-badge--ativo';
                        let label = val || 'Ativo';
                        if (['inativo', 'inactive', 'desativado', 'disabled', '0', 'não', 'nao'].includes(statusLower) || statusLower.startsWith('inat')) {
                            badgeClass = 'cell-badge--inativo';
                            label = 'Inativo';
                        } else if (['pendente', 'pending', 'aguardando', 'em espera'].includes(statusLower) || statusLower.startsWith('pend')) {
                            badgeClass = 'cell-badge--warning';
                            label = 'Pendente';
                        } else {
                            badgeClass = 'cell-badge--ativo';
                            label = 'Ativo';
                        }
                        cellContent = `<span class="cell-badge ${badgeClass}">${_escapeHtml(label)}</span>`;
                    } else if (col.key === 'email' && val) {
                        cellContent = `<a href="mailto:${_escapeHtml(val)}" class="table-link">${_escapeHtml(val)}</a>`;
                    } else if (col.key === 'telefone' && val) {
                        cellContent = `<a href="tel:${_escapeHtml(val)}" class="table-link">${_escapeHtml(val)}</a>`;
                    }

                    bodyHtml += `<td data-field="${col.key}">${cellContent}</td>`;
                });

                if (isAdmin) {
                    bodyHtml += `
                        <td class="actions-cell" style="text-align: center;">
                            <button class="btn btn--ghost btn--icon btn-edit-row" data-id="${r._id}" title="Editar Ramal">✏️</button>
                            <button class="btn btn--ghost btn--icon btn-delete-row" data-id="${r._id}" title="Excluir Ramal" style="color:var(--color-danger);">🗑️</button>
                        </td>
                    `;
                }

                bodyHtml += '</tr>';
            });

            tbody.innerHTML = bodyHtml;
        }

        // 3. Atualizar Paginação
        _renderPagination(paginationContainer);

        // 4. Sincronizar Checkbox Select All
        const selectAllCheckbox = document.getElementById('table-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = recordsToRender.length > 0 && recordsToRender.every(r => _selectedIds.has(r._id));
        }
    }

    function _renderPagination(container) {
        if (!container) return;

        if (_pageSizeAll || _filteredRecords.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const totalRecords = _filteredRecords.length;
        const totalPages = Math.ceil(totalRecords / _pageSize) || 1;

        const info = document.getElementById('pagination-info');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

        if (info) {
            const start = (_currentPage - 1) * _pageSize + 1;
            const end = Math.min(_currentPage * _pageSize, totalRecords);
            info.textContent = `Mostrando ${start}-${end} de ${totalRecords} (Página ${_currentPage} de ${totalPages})`;
        }

        if (btnPrev) btnPrev.disabled = _currentPage <= 1;
        if (btnNext) btnNext.disabled = _currentPage >= totalPages;
    }

    function toggleSelectAll(checked) {
        const currentRecords = getPaginatedRecords();
        currentRecords.forEach(r => {
            if (checked) _selectedIds.add(r._id);
            else _selectedIds.delete(r._id);
        });
        render();
        if (onSelectionChange) onSelectionChange(Array.from(_selectedIds));
    }

    function toggleSelect(id) {
        if (_selectedIds.has(id)) _selectedIds.delete(id);
        else _selectedIds.add(id);
        render();
        if (onSelectionChange) onSelectionChange(Array.from(_selectedIds));
    }

    function clearSelection() {
        _selectedIds.clear();
        render();
        if (onSelectionChange) onSelectionChange([]);
    }

    function getSelectedIds() {
        return Array.from(_selectedIds);
    }

    function getFilterOptions() {
        const statuses = new Set();
        const locs = new Set();
        const setores = new Set();
        const empresas = new Set();

        _allRecords.forEach(r => {
            if (r.status) statuses.add(r.status);
            if (r.localizacao) locs.add(r.localizacao);
            if (r.setor) setores.add(r.setor);
            if (r.empresa) empresas.add(r.empresa);
        });

        return {
            status: Array.from(statuses).sort(),
            localizacao: Array.from(locs).sort(),
            setor: Array.from(setores).sort(),
            empresa: Array.from(empresas).sort()
        };
    }

    function _bindEvents() {
        const tableContainer = document.getElementById('data-table');
        if (tableContainer) {
            // Click no cabeçalho para ordenação
            tableContainer.addEventListener('click', (e) => {
                const th = e.target.closest('th.sortable');
                if (th && th.dataset.field) {
                    sortBy(th.dataset.field);
                    return;
                }

                // Checkbox Select All
                if (e.target.id === 'table-select-all') {
                    toggleSelectAll(e.target.checked);
                    return;
                }

                // Checkbox Row
                const rowCheck = e.target.closest('.row-checkbox');
                if (rowCheck && rowCheck.dataset.id) {
                    toggleSelect(rowCheck.dataset.id);
                    return;
                }

                // Interceptar links tel: para compatibilidade com Iframe
                const telLink = e.target.closest('a[href^="tel:"]');
                if (telLink) {
                    e.preventDefault();
                    const href = telLink.getAttribute('href');
                    const frame = document.createElement('iframe');
                    frame.style.display = 'none';
                    frame.src = href;
                    document.body.appendChild(frame);
                    setTimeout(() => { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 3000);
                    return;
                }

                // Botão Editar Linha
                const btnEdit = e.target.closest('.btn-edit-row');
                if (btnEdit && btnEdit.dataset.id) {
                    const record = _allRecords.find(r => r._id === btnEdit.dataset.id);
                    if (record && onEdit) onEdit(record);
                    return;
                }

                // Botão Excluir Linha
                const btnDelete = e.target.closest('.btn-delete-row');
                if (btnDelete && btnDelete.dataset.id) {
                    window.dispatchEvent(new CustomEvent('ramal:delete-request', { detail: { id: btnDelete.dataset.id } }));
                    return;
                }
            });
        }

        // Paginação Anterior / Próxima
        const btnPrev = document.getElementById('btn-prev-page');
        if (btnPrev) {
            btnPrev.addEventListener('click', () => setPage(_currentPage - 1));
        }

        const btnNext = document.getElementById('btn-next-page');
        if (btnNext) {
            btnNext.addEventListener('click', () => setPage(_currentPage + 1));
        }
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
        initColumns,
        setData,
        getData,
        getFilteredRecords,
        setSearchQuery,
        setFilter,
        clearFilters,
        sortBy,
        setPage,
        setPageSize,
        toggleColumn,
        setColumns,
        getColumns,
        getVisibleColumns,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        getSelectedIds,
        getFilterOptions,
        render,
        set onDataChange(fn) { onDataChange = fn; },
        set onEdit(fn) { onEdit = fn; },
        set onSelectionChange(fn) { onSelectionChange = fn; }
    };
})();
