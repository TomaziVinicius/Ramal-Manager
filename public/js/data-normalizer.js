/**
 * Normalizador de dados para mapeamento, validação e padronização de dados CSV.
 */
const DataNormalizer = (function() {
    const STANDARD_FIELDS = [
        { key: 'ramal', label: 'Ramal', type: 'text', required: true },
        { key: 'nome', label: 'Nome', type: 'text', required: false },
        { key: 'localizacao', label: 'Estabelecimento / Localização', type: 'text', required: false },
        { key: 'andar', label: 'Andar / Pavimento', type: 'text', required: false },
        { key: 'setor', label: 'Setor', type: 'text', required: false },
        { key: 'email', label: 'E-mail', type: 'email', required: false },
        { key: 'telefone', label: 'Telefone', type: 'text', required: false },
        { key: 'status', label: 'Status', type: 'text', required: false },
        { key: 'empresa', label: 'Empresa', type: 'text', required: false }
    ];

    const FIELD_ALIASES = {
        ramal: ['extension', 'ext', 'extension number', 'extensionnumber', 'ramais', 'ramal', 'numero', 'número', 'number', 'ext number', 'phone extension', 'extension_number'],
        nome: ['name', 'display name', 'displayname', 'user', 'nome', 'first name', 'firstname', 'primeiro nome', 'given name'],
        nomeCompleto: ['full name', 'fullname', 'nome completo', 'complete name', 'display_name'],
        localizacao: ['location', 'localização', 'localizacao', 'site', 'office', 'branch', 'filial', 'unidade', 'unit', 'sede', 'estabelecimento', 'unidade de atendimento'],
        andar: ['andar', 'floor', 'pavimento', 'piso', 'nivel', 'nível', 'storey', 'level'],
        departamento: ['department', 'departamento', 'dept', 'area', 'área', 'division', 'divisão'],
        setor: ['sector', 'setor', 'section', 'seção'],
        email: ['email', 'e-mail', 'mail', 'email address', 'emailaddress', 'e-mail address', 'correio', 'endereço de email'],
        telefone: ['phone', 'telephone', 'telefone', 'tel', 'mobile', 'celular', 'phone number', 'phonenumber'],
        status: ['status', 'enabled', 'active', 'ativo', 'situacao', 'situação', 'state', 'estado'],
        cargo: ['title', 'job title', 'cargo', 'position', 'posição', 'função', 'role'],
        empresa: ['company', 'empresa', 'organization', 'organização', 'org', 'firma'],
        dispositivo: ['device', 'dispositivo', 'equipment', 'equipamento', 'modelo', 'model'],
        ip: ['ip', 'ip address', 'ipaddress', 'endereço ip', 'ip_address'],
        mac: ['mac', 'mac address', 'macaddress', 'endereço mac', 'mac_address', 'physical address'],
        observacao: ['notes', 'note', 'observação', 'observacao', 'obs', 'comments', 'comment', 'comentário', 'description', 'descrição', 'descricao']
    };

    function generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    function autoDetectMapping(headers) {
        const mapping = {};
        const _unmapped = [];
        const usedKeys = new Set();

        headers.forEach(header => {
            const cleanHeader = header.trim().toLowerCase();
            let matched = false;

            for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
                if (aliases.includes(cleanHeader) && !usedKeys.has(key)) {
                    mapping[key] = header;
                    usedKeys.add(key);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                _unmapped.push(header);
            }
        });

        return { mapping, _unmapped };
    }

    function detectModel(headers) {
        const models = getModels();
        if (!models || models.length === 0) return null;

        let bestMatch = null;
        let highestConfidence = 0;

        models.forEach(model => {
            const mappedHeaders = Object.values(model.mapping || {});
            if (mappedHeaders.length === 0) return;
            let matchCount = 0;

            mappedHeaders.forEach(mh => {
                if (headers.includes(mh)) {
                    matchCount++;
                }
            });

            const confidence = matchCount / mappedHeaders.length;
            if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestMatch = model;
            }
        });

        if (highestConfidence > 0.7) {
            return { model: bestMatch, confidence: highestConfidence };
        }
        return null;
    }

    function normalize(rows, mapping, customFields = []) {
        const allFields = getAllFields(customFields);
        const mappedHeaders = Object.values(mapping);

        return rows.map(row => {
            const record = {
                _id: generateId(),
                _extras: {}
            };

            allFields.forEach(field => {
                record[field.key] = '';
            });

            for (const [key, header] of Object.entries(mapping)) {
                if (row[header] !== undefined) {
                    record[key] = row[header];
                }
            }

            for (const [header, value] of Object.entries(row)) {
                if (!mappedHeaders.includes(header)) {
                    record._extras[header] = value;
                }
            }

            return record;
        });
    }

    function validate(records) {
        const errors = [];
        const warnings = [];
        
        const emptyRamalIndices = [];
        const noNameIndices = [];
        const ramalCounts = {};

        records.forEach((record, index) => {
            const ramal = record.ramal ? record.ramal.toString().trim() : '';
            const nome = record.nome ? record.nome.toString().trim() : '';

            if (!ramal) {
                emptyRamalIndices.push(index);
            } else {
                if (!ramalCounts[ramal]) {
                    ramalCounts[ramal] = [];
                }
                ramalCounts[ramal].push(index);
            }

            if (!nome) {
                noNameIndices.push(index);
            }
        });

        if (emptyRamalIndices.length > 0) {
            errors.push({
                type: 'empty_ramal',
                indices: emptyRamalIndices,
                message: `Encontrados ${emptyRamalIndices.length} registro(s) sem número de ramal.`
            });
        }

        const duplicateRamalIndices = [];
        for (const [ramal, indices] of Object.entries(ramalCounts)) {
            if (indices.length > 1) {
                duplicateRamalIndices.push(...indices);
            }
        }

        if (duplicateRamalIndices.length > 0) {
            errors.push({
                type: 'duplicate_ramal',
                indices: duplicateRamalIndices,
                message: `Encontrados ramais duplicados na lista.`
            });
        }

        if (noNameIndices.length > 0) {
            warnings.push({
                type: 'no_name',
                indices: noNameIndices,
                message: `Encontrados ${noNameIndices.length} registro(s) sem nome definido.`
            });
        }

        return {
            errors,
            warnings,
            isValid: errors.length === 0
        };
    }

    function findDuplicates(records) {
        const map = {};
        records.forEach(record => {
            const ramal = record.ramal ? record.ramal.toString().trim() : '';
            if (!ramal) return;
            if (!map[ramal]) {
                map[ramal] = [];
            }
            map[ramal].push(record);
        });

        const duplicates = [];
        for (const [ramal, group] of Object.entries(map)) {
            if (group.length > 1) {
                duplicates.push({ ramal, records: group });
            }
        }
        return duplicates;
    }

    function getModels() {
        try {
            const models = localStorage.getItem('ramais_models');
            return models ? JSON.parse(models) : [];
        } catch (e) {
            return [];
        }
    }

    function saveModel(name, mapping) {
        const models = getModels();
        const existingIndex = models.findIndex(m => m.name === name);
        const model = {
            name,
            mapping,
            createdAt: Date.now()
        };

        if (existingIndex >= 0) {
            models[existingIndex] = model;
        } else {
            models.push(model);
        }
        localStorage.setItem('ramais_models', JSON.stringify(models));
    }

    function deleteModel(name) {
        let models = getModels();
        models = models.filter(m => m.name !== name);
        localStorage.setItem('ramais_models', JSON.stringify(models));
    }

    function getCustomFields() {
        try {
            const fields = localStorage.getItem('ramais_custom_fields');
            return fields ? JSON.parse(fields) : [];
        } catch (e) {
            return [];
        }
    }

    function saveCustomField(field) {
        const fields = getCustomFields();
        if (!field.key) {
            field.key = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }
        const existingIndex = fields.findIndex(f => f.key === field.key);
        if (existingIndex >= 0) {
            fields[existingIndex] = field;
        } else {
            fields.push(field);
        }
        localStorage.setItem('ramais_custom_fields', JSON.stringify(fields));
    }

    function deleteCustomField(key) {
        let fields = getCustomFields();
        fields = fields.filter(f => f.key !== key);
        localStorage.setItem('ramais_custom_fields', JSON.stringify(fields));
    }

    function getAllFields(customFields = getCustomFields()) {
        return [...STANDARD_FIELDS, ...customFields];
    }

    function getExampleData() {
        const examples = [
            { ramal: '1001', nome: 'João Silva', localizacao: 'Matriz', departamento: 'TI', email: 'joao@empresa.com', telefone: '(11) 3000-1001', status: 'Ativo', cargo: 'Analista de Sistemas', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1002', nome: 'Maria Souza', localizacao: 'Matriz', departamento: 'RH', email: 'maria@empresa.com', telefone: '(11) 3000-1002', status: 'Ativo', cargo: 'Coordenadora de RH', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1003', nome: 'Carlos Lima', localizacao: 'Filial 1', departamento: 'Financeiro', email: 'carlos@empresa.com', telefone: '(21) 3000-1003', status: 'Inativo', cargo: 'Analista Financeiro', empresa: 'Empresa ABC', observacao: 'Transferido' },
            { ramal: '1004', nome: 'Ana Oliveira', localizacao: 'Filial 1', departamento: 'Comercial', email: 'ana@empresa.com', telefone: '(21) 3000-1004', status: 'Ativo', cargo: 'Gerente Comercial', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1005', nome: 'Pedro Santos', localizacao: 'Filial 2', departamento: 'TI', email: 'pedro@empresa.com', telefone: '(31) 3000-1005', status: 'Ativo', cargo: 'Suporte Técnico', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1006', nome: 'Fernanda Costa', localizacao: 'Matriz', departamento: 'Diretoria', email: 'fernanda@empresa.com', telefone: '(11) 3000-1006', status: 'Ativo', cargo: 'Diretora Administrativa', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1007', nome: 'Ricardo Mendes', localizacao: 'Filial 2', departamento: 'Logística', email: 'ricardo@empresa.com', telefone: '(31) 3000-1007', status: 'Ativo', cargo: 'Coordenador de Logística', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1008', nome: 'Juliana Alves', localizacao: 'Matriz', departamento: 'Marketing', email: 'juliana@empresa.com', telefone: '(11) 3000-1008', status: 'Inativo', cargo: 'Analista de Marketing', empresa: 'Empresa ABC', observacao: 'Licença maternidade' },
            { ramal: '1009', nome: 'Bruno Ferreira', localizacao: 'Filial 1', departamento: 'TI', email: 'bruno@empresa.com', telefone: '(21) 3000-1009', status: 'Ativo', cargo: 'Desenvolvedor', empresa: 'Empresa ABC', observacao: '' },
            { ramal: '1010', nome: 'Camila Rocha', localizacao: 'Matriz', departamento: 'RH', email: 'camila@empresa.com', telefone: '(11) 3000-1010', status: 'Ativo', cargo: 'Assistente de RH', empresa: 'Empresa ABC', observacao: '' }
        ];

        const allFields = getAllFields();
        return examples.map(ex => {
            const record = { _id: generateId(), _extras: {} };
            allFields.forEach(field => {
                record[field.key] = ex[field.key] !== undefined ? ex[field.key] : '';
            });
            return record;
        });
    }

    return {
        STANDARD_FIELDS,
        FIELD_ALIASES,
        autoDetectMapping,
        detectModel,
        normalize,
        validate,
        findDuplicates,
        getModels,
        saveModel,
        deleteModel,
        getCustomFields,
        saveCustomField,
        deleteCustomField,
        getAllFields,
        getExampleData
    };
})();
