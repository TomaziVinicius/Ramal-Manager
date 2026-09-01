/**
 * Módulo de Visualização em Quadrados / Cards por Setor (CardsView)
 * Agrupamento Hierárquico: Estabelecimento (IMI, ICA, PUL, RIO) -> Andar -> Setores -> Ramais
 */
const CardsView = (function() {
    let _allRecords = [];
    let _activeEstablishment = 'all';

    /**
     * Renderiza a visão em cartões/quadrados a partir da lista de ramais e filtros.
     * @param {Array} records - Lista de ramais
     * @param {string} [searchQuery=''] - Termo de busca
     * @param {Object} [filters={}] - Filtros ativos (status, localizacao, setor, empresa)
     */
    function render(records, searchQuery = '', filters = {}) {
        _allRecords = Array.isArray(records) ? records : [];
        const container = document.getElementById('ramais-cards-container');
        const navContainer = document.getElementById('establishment-nav-bar');
        if (!container) return;

        // 1. Filtrar registros conforme busca e filtros selecionados (sem distinção de maiúsculas/minúsculas e acentos)
        let filtered = [..._allRecords];

        if (searchQuery) {
            const q = _cleanStr(searchQuery);
            filtered = filtered.filter(r => {
                return (
                    (r.ramal && _cleanStr(r.ramal).includes(q)) ||
                    (r.nome && _cleanStr(r.nome).includes(q)) ||
                    (r.localizacao && _cleanStr(r.localizacao).includes(q)) ||
                    (r.andar && _cleanStr(r.andar).includes(q)) ||
                    (r.setor && _cleanStr(r.setor).includes(q)) ||
                    (r.empresa && _cleanStr(r.empresa).includes(q)) ||
                    (r.email && _cleanStr(r.email).includes(q)) ||
                    (r.telefone && _cleanStr(r.telefone).includes(q)) ||
                    (r.cargo && _cleanStr(r.cargo).includes(q)) ||
                    (r.departamento && _cleanStr(r.departamento).includes(q)) ||
                    (r.nomeCompleto && _cleanStr(r.nomeCompleto).includes(q))
                );
            });
        }

        if (filters.status) {
            const fStatus = _cleanStr(filters.status);
            filtered = filtered.filter(r => _cleanStr(r.status) === fStatus);
        }
        if (filters.localizacao) {
            const fLoc = _cleanStr(filters.localizacao);
            filtered = filtered.filter(r => _cleanStr(r.localizacao) === fLoc);
        }
        if (filters.setor) {
            const fSetor = _cleanStr(filters.setor);
            filtered = filtered.filter(r => _cleanStr(r.setor) === fSetor);
        }
        if (filters.empresa) {
            const fEmp = _cleanStr(filters.empresa);
            filtered = filtered.filter(r => _cleanStr(r.empresa) === fEmp);
        }

        // 2. Extrair contagem por Estabelecimento para a Barra Superior de Navegação
        const establishmentCounts = {};
        _allRecords.forEach(r => {
            const est = _normalizeEstablishment(r.localizacao || r.empresa || 'Outros');
            establishmentCounts[est] = (establishmentCounts[est] || 0) + 1;
        });

        // Renderizar Barra de Navegação Superior
        if (navContainer) {
            _renderNavBar(navContainer, establishmentCounts, _allRecords.length);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="cards-empty-state">
                    <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                    <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); margin-bottom: 8px;">Nenhum ramal encontrado</h3>
                    <p class="text-muted">Tente ajustar o termo de pesquisa ou os filtros selecionados.</p>
                </div>
            `;
            return;
        }

        // 3. Agrupar registros: Estabelecimento -> Andar -> Setor -> Ramais
        const hierarchy = {};

        filtered.forEach(r => {
            const estName = _normalizeEstablishment(r.localizacao || r.empresa || 'Geral');
            const floorName = _normalizeFloor(r.andar);
            const sectorName = (r.setor || 'Geral').trim();

            if (!hierarchy[estName]) hierarchy[estName] = {};
            if (!hierarchy[estName][floorName]) hierarchy[estName][floorName] = {};
            if (!hierarchy[estName][floorName][sectorName]) hierarchy[estName][floorName][sectorName] = [];

            hierarchy[estName][floorName][sectorName].push(r);
        });

        // 4. Ordenar estabelecimentos conhecidos primeiro (IMI, ICA, RIO, IPU...)
        const sortedEstKeys = Object.keys(hierarchy).sort((a, b) => {
            const priority = ['IMI', 'ICA', 'RIO', 'IPU'];
            const idxA = priority.indexOf(a.toUpperCase());
            const idxB = priority.indexOf(b.toUpperCase());
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b, 'pt-BR');
        });

        // 5. Montar HTML Completo
        let html = '';
        const isAdmin = document.documentElement.getAttribute('data-role') === 'admin';

        sortedEstKeys.forEach(estKey => {
            const estSlug = _slugify(estKey);
            const floorsObj = hierarchy[estKey];
            let totalEstRamais = 0;
            Object.values(floorsObj).forEach(sectors => {
                Object.values(sectors).forEach(list => totalEstRamais += list.length);
            });

            const estColors = _getEstablishmentTheme(estKey);

            html += `
                <section class="establishment-section" id="est-${estSlug}" data-establishment="${_escapeHtml(estKey)}">
                    <!-- Banner do Estabelecimento -->
                    <div class="establishment-header" style="background: ${estColors.gradient};">
                        <div class="establishment-header__info">
                            <span class="establishment-header__icon">${estColors.icon}</span>
                            <div class="establishment-header__titles">
                                <h2 class="establishment-header__title">${_escapeHtml(estKey)}</h2>
                                <span class="establishment-header__subtitle">${_escapeHtml(estColors.fullName || 'Unidade de Atendimento')}</span>
                            </div>
                        </div>
                        <div class="establishment-header__stats">
                            <span class="establishment-count-badge">${totalEstRamais} ${totalEstRamais === 1 ? 'ramal' : 'ramais'}</span>
                        </div>
                    </div>

                    <!-- Conteúdo com Andares e Setores -->
                    <div class="establishment-content">
            `;

            // Ordenar Andares (2º Andar, 1º Andar, Térreo, Subsolo, Outros)
            const sortedFloors = Object.keys(floorsObj).sort(_compareFloors);

            sortedFloors.forEach(floorKey => {
                const sectorsObj = floorsObj[floorKey];
                const floorIcon = _getFloorIcon(floorKey);

                html += `
                    <div class="floor-group">
                        <div class="floor-divider">
                            <span class="floor-badge">
                                <span class="floor-badge__icon">${floorIcon}</span>
                                <span class="floor-badge__name">${_escapeHtml(floorKey)}</span>
                            </span>
                            <div class="floor-divider__line"></div>
                        </div>

                        <!-- Grid de Quadrados de Setores -->
                        <div class="sector-grid">
                `;

                // Ordenar Setores alfabeticamente
                const sortedSectors = Object.keys(sectorsObj).sort((a, b) => a.localeCompare(b, 'pt-BR'));

                sortedSectors.forEach(sectorKey => {
                    const ramaisList = sectorsObj[sectorKey];
                    // Ordenar ramais numericamente
                    ramaisList.sort((a, b) => {
                        const numA = parseInt(a.ramal, 10);
                        const numB = parseInt(b.ramal, 10);
                        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                        return (a.ramal || '').localeCompare(b.ramal || '');
                    });

                    const sectorIcon = _getSectorIcon(sectorKey);

                    html += `
                        <div class="sector-card" data-sector="${_escapeHtml(sectorKey)}">
                            <div class="sector-card__header">
                                <div class="sector-card__title">
                                    <span class="sector-card__icon">${sectorIcon}</span>
                                    <span class="sector-card__name" title="${_escapeHtml(sectorKey)}">${_escapeHtml(sectorKey)}</span>
                                </div>
                                <span class="sector-card__badge">${ramaisList.length}</span>
                            </div>
                            <div class="sector-card__body">
                                <div class="sector-ramal-list">
                    `;

                    ramaisList.forEach(r => {
                        const statusLower = (r.status || 'Ativo').toString().trim().toLowerCase();
                        let statusDotClass = 'status-dot--active';
                        let statusTitle = 'Ativo';

                        if (['inativo', 'inactive', 'desativado', 'disabled', '0', 'não', 'nao'].includes(statusLower) || statusLower.startsWith('inat')) {
                            statusDotClass = 'status-dot--inactive';
                            statusTitle = 'Inativo';
                        } else if (['pendente', 'pending', 'aguardando', 'em espera'].includes(statusLower) || statusLower.startsWith('pend')) {
                            statusDotClass = 'status-dot--pending';
                            statusTitle = 'Pendente';
                        } else {
                            statusDotClass = 'status-dot--active';
                            statusTitle = 'Ativo';
                        }

                        html += `
                            <div class="sector-ramal-item" data-id="${r._id}">
                                <div class="sector-ramal-item__left">
                                    <a href="tel:${_escapeHtml(r.ramal)}" class="btn-call-ramal" data-ramal="${_escapeHtml(r.ramal)}" title="Ligar para o ramal ${r.ramal} via 3CX">
                                        <span class="call-icon">📞</span>
                                        <span class="ramal-number-tag">${_escapeHtml(r.ramal)}</span>
                                    </a>
                                    <div class="sector-ramal-info">
                                        <div class="sector-ramal-name" title="${_escapeHtml(r.nome || 'Sem nome')}">
                                            <span class="status-dot ${statusDotClass}" title="${statusTitle}"></span>
                                            ${_escapeHtml(r.nome || 'Ramal Geral')}
                                        </div>
                                        ${r.email ? `<div class="sector-ramal-subtext" title="${_escapeHtml(r.email)}">✉️ ${_escapeHtml(r.email)}</div>` : ''}
                                        ${r.telefone ? `<div class="sector-ramal-subtext" title="${_escapeHtml(r.telefone)}">📱 ${_escapeHtml(r.telefone)}</div>` : ''}
                                    </div>
                                </div>

                                <div class="sector-ramal-actions-group">
                                    <button type="button" class="btn-copy-ramal-subtle" data-ramal="${_escapeHtml(r.ramal)}" title="Copiar ramal ${r.ramal}">📋</button>
                                    ${isAdmin ? `
                                        <button class="btn-sector-action btn-edit-ramal admin-only" data-id="${r._id}" title="Editar ramal ${r.ramal}">✏️</button>
                                        <button class="btn-sector-action btn-delete-ramal admin-only" data-id="${r._id}" title="Excluir ramal ${r.ramal}">🗑️</button>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    });

                    html += `
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </section>
            `;
        });

        container.innerHTML = html;

        // 6. Associar Eventos de Cópia, Scroll e Admin
        _bindCardEvents(container);
    }

    /**
     * Renderiza a Barra de Botões Superiores de Estabelecimento
     */
    function _renderNavBar(navContainer, counts, total) {
        const priority = ['IMI', 'ICA', 'RIO', 'IPU'];
        const allEsts = Object.keys(counts);

        // Garantir que IMI, ICA, RIO, IPU apareçam como opções padrão
        const combined = Array.from(new Set([...priority, ...allEsts]));

        let html = `
            <div class="establishment-nav-bar__scroll">
                <button type="button" class="establishment-nav-btn ${_activeEstablishment === 'all' ? 'active' : ''}" data-target="all">
                    <span class="nav-btn-icon">🌐</span>
                    <span class="nav-btn-label">Todos</span>
                    <span class="nav-btn-count">${total}</span>
                </button>
        `;

        combined.forEach(est => {
            const count = counts[est] || 0;
            const theme = _getEstablishmentTheme(est);
            const slug = _slugify(est);
            const isActive = _activeEstablishment === 'est-' + slug;

            html += `
                <button type="button" class="establishment-nav-btn ${isActive ? 'active' : ''}" data-target="est-${slug}" data-name="${_escapeHtml(est)}">
                    <span class="nav-btn-icon">${theme.icon}</span>
                    <span class="nav-btn-label">${_escapeHtml(est)}</span>
                    <span class="nav-btn-count">${count}</span>
                </button>
            `;
        });

        html += `</div>`;
        navContainer.innerHTML = html;

        // Eventos dos botões de navegação
        navContainer.querySelectorAll('.establishment-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                navContainer.querySelectorAll('.establishment-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (target === 'all') {
                    _activeEstablishment = 'all';
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    _activeEstablishment = target;
                    const sec = document.getElementById(target);
                    if (sec) {
                        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });
    }

    function _bindCardEvents(container) {
        // Cópia de Ramal com Toast (botão de cópia sutil)
        container.querySelectorAll('.btn-copy-ramal-subtle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const ramalNum = btn.dataset.ramal;
                if (!ramalNum) return;

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(ramalNum).then(() => {
                        UI.showNotification(`Ramal ${ramalNum} copiado para a área de transferência!`, 'success', 2500);
                    }).catch(() => {
                        _fallbackCopy(ramalNum);
                    });
                } else {
                    _fallbackCopy(ramalNum);
                }
            });
        });

        // Clique no Ramal para Chamada via 3CX (Compatível com Iframes do Nextcloud)
        container.querySelectorAll('.btn-call-ramal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const ramalNum = btn.dataset.ramal;
                if (ramalNum) {
                    UI.showNotification(`📞 Abrindo chamada para o ramal ${ramalNum} no 3CX...`, 'info', 3000);
                    _triggerPhoneCall(ramalNum);
                }
            });
        });

        // Eventos de Edição (Admin)
        container.querySelectorAll('.btn-edit-ramal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const record = _allRecords.find(r => r._id === id);
                if (record) {
                    const allFields = DataNormalizer.getAllFields();
                    UI.showAddModal(allFields, async (formData) => {
                        try {
                            await Api.updateRamal(id, formData);
                            UI.showNotification('Ramal atualizado com sucesso!', 'success');
                            if (typeof App !== 'undefined' && App.refreshAllData) {
                                await App.refreshAllData();
                            }
                        } catch (err) {
                            UI.showNotification('Erro ao atualizar: ' + err.message, 'error');
                        }
                    }, record);
                }
            });
        });

        // Eventos de Exclusão (Admin)
        container.querySelectorAll('.btn-delete-ramal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const record = _allRecords.find(r => r._id === id);
                const ramalDesc = record ? `o ramal ${record.ramal} (${record.nome || 'Geral'})` : 'este ramal';

                UI.showConfirm(`Deseja realmente excluir permanentemente ${ramalDesc}?`, async () => {
                    try {
                        await Api.deleteRamal(id);
                        UI.showNotification('Ramal excluído com sucesso.', 'info');
                        if (typeof App !== 'undefined' && App.refreshAllData) {
                            await App.refreshAllData();
                        }
                    } catch (err) {
                        UI.showNotification('Erro ao excluir: ' + err.message, 'error');
                    }
                });
            });
        });
    }

    /**
     * Dispara o protocolo tel: sem causar navegação da janela principal (evitando bloqueio em iframes)
     */
    function _triggerPhoneCall(number) {
        if (!number) return;
        const telUrl = `tel:${encodeURIComponent(number.toString().trim())}`;
        
        try {
            // Cria um iframe oculto temporário exclusivo para disparar o protocolo do sistema operacional (3CX)
            const frame = document.createElement('iframe');
            frame.style.display = 'none';
            frame.src = telUrl;
            document.body.appendChild(frame);
            
            // Remove o elemento após o sistema receber o sinal
            setTimeout(() => {
                if (frame.parentNode) {
                    frame.parentNode.removeChild(frame);
                }
            }, 3000);
        } catch (err) {
            // Fallback usando window.location caso iframe falhe
            window.location.href = telUrl;
        }
    }

    function _fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            UI.showNotification(`Ramal ${text} copiado!`, 'success', 2500);
        } catch (_) {
            UI.showNotification(`Número do ramal: ${text}`, 'info', 3000);
        }
        document.body.removeChild(textarea);
    }

    // ==========================================
    // Normalizadores e Formatadores
    // ==========================================

    function _normalizeEstablishment(raw) {
        if (!raw) return 'Geral / Matriz';
        const str = raw.toString().trim();
        const upper = str.toUpperCase();

        if (upper.includes('IMI') || upper.includes('MARINGA') || upper.includes('MARINGÁ') || upper.includes('INSTITUTO DE MEDICINA')) return 'IMI';
        if (upper.includes('ICA') || upper.includes('CARLOS AMERICO') || upper.includes('CARLOS AMÉRICO') || upper.includes('CIRURGIA')) return 'ICA';
        if (upper.includes('RIO') || upper.includes('RIO BRANCO') || upper.includes('RIO CLARO')) return 'RIO';
        if (upper.includes('IPU') || upper.includes('PUL') || upper.includes('PULM')) return 'IPU';

        return str;
    }

    function _normalizeFloor(raw) {
        if (!raw) return 'Geral / Térreo';
        const str = raw.toString().trim();
        const upper = str.toUpperCase();

        if (upper.includes('2') || upper.includes('SEGUNDO')) return '2º Andar';
        if (upper.includes('1') || upper.includes('PRIMEIRO')) return '1º Andar';
        if (upper.includes('3') || upper.includes('TERCEIRO')) return '3º Andar';
        if (upper.includes('4') || upper.includes('QUARTO')) return '4º Andar';
        if (upper.includes('TERREO') || upper.includes('TÉRREO') || upper.includes('PISO 0')) return 'Térreo';
        if (upper.includes('SUBSOLO') || upper.includes('GARAGEM') || upper.includes('-1')) return 'Subsolo';

        return str;
    }

    function _compareFloors(a, b) {
        const order = {
            '4º Andar': 1,
            '3º Andar': 2,
            '2º Andar': 3,
            '1º Andar': 4,
            'Térreo': 5,
            'Geral / Térreo': 6,
            'Subsolo': 7,
            'Geral / Outros': 8
        };
        const valA = order[a] || 99;
        const valB = order[b] || 99;
        if (valA !== valB) return valA - valB;
        return a.localeCompare(b, 'pt-BR');
    }

    function _getEstablishmentTheme(est) {
        const upper = est.toUpperCase();
        if (upper === 'IMI') {
            return {
                gradient: 'linear-gradient(135deg, #0077C8 0%, #00ACC1 100%)',
                icon: '🔵',
                fullName: 'Instituto Maringá de Imagem'
            };
        }
        if (upper === 'ICA') {
            return {
                gradient: 'linear-gradient(135deg, #E65100 0%, #D84315 100%)',
                icon: '🟠',
                fullName: 'Instituto Carlos Américo de Imagem'
            };
        }
        if (upper === 'RIO') {
            return {
                gradient: 'linear-gradient(135deg, #6A1B9A 0%, #8E24AA 100%)',
                icon: '🟣',
                fullName: 'Instituto Rio Branco de Imagem'
            };
        }
        if (upper === 'IPU' || upper === 'PUL') {
            return {
                gradient: 'linear-gradient(135deg, #00897B 0%, #43A047 100%)',
                icon: '🟢',
                fullName: 'Instituto do Pulmão'
            };
        }
        return {
            gradient: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
            icon: '🏢',
            fullName: 'Unidade Integrada'
        };
    }

    function _getFloorIcon(floor) {
        const upper = floor.toUpperCase();
        if (upper.includes('2')) return '2️⃣';
        if (upper.includes('1')) return '1️⃣';
        if (upper.includes('3')) return '3️⃣';
        if (upper.includes('4')) return '4️⃣';
        if (upper.includes('TERREO') || upper.includes('TÉRREO')) return '🚪';
        if (upper.includes('SUBSOLO')) return '🅿️';
        return '🏢';
    }

    function _getSectorIcon(sector) {
        const upper = sector.toUpperCase();
        if (upper.includes('TI') || upper.includes('TECNOLOGIA') || upper.includes('SISTEMA') || upper.includes('SUPORTE')) return '💻';
        if (upper.includes('GER') || upper.includes('DIRETORIA') || upper.includes('COORDENA')) return '👔';
        if (upper.includes('FAT') || upper.includes('FATURAMENTO') || upper.includes('CONTA')) return '📑';
        if (upper.includes('FIN') || upper.includes('FINANCEIRO') || upper.includes('TESOURARIA')) return '💰';
        if (upper.includes('COMPRA') || upper.includes('SUPRIMENTO') || upper.includes('ALMOXARIFADO')) return '📦';
        if (upper.includes('ESP') || upper.includes('MULHER') || upper.includes('DENSITO') || upper.includes('MAMO')) return '🌸';
        if (upper.includes('RECEP') || upper.includes('GUICH') || upper.includes('ATENDIMENTO')) return '🛎️';
        if (upper.includes('ENFERM') || upper.includes('POSTO') || upper.includes('TRIAGEM')) return '🩺';
        if (upper.includes('MEDIC') || upper.includes('LAUDO') || upper.includes('RESSONANCIA') || upper.includes('TOMO') || upper.includes('RAIO')) return '🔬';
        if (upper.includes('OUVIDORIA') || upper.includes('SAC') || upper.includes('QUALIDADE')) return '📢';
        if (upper.includes('TELE') || upper.includes('CALL') || upper.includes('CENTRAL')) return '🎧';
        if (upper.includes('RH') || upper.includes('PESSOAL')) return '👥';
        if (upper.includes('JURIDICO') || upper.includes('LEGAL')) return '⚖️';
        if (upper.includes('HIGIENE') || upper.includes('LIMPEZA') || upper.includes('MANUTENCAO')) return '🧹';
        return '📂';
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

    function _slugify(text) {
        return (text || '').toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
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
        render
    };
})();
