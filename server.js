/**
 * Servidor Backend Node.js / Express para Gerenciador de Ramais
 * Conexão com MariaDB, Autenticação Unificada LDAP (Active Directory) + Local Admin com JWT
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const mariadb = require('mariadb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Client } = require('ldapts');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ramais_default_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// -----------------------------------------------------------------------------
// Middlewares Globais & Permissão para Incorporação em Iframe (Embed)
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors *;");
    res.removeHeader('X-Frame-Options');
    next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos da SPA
app.use(express.static(path.join(__dirname, 'public')));

// Suporte a serialização de BigInt no JSON
BigInt.prototype.toJSON = function () {
    return Number(this);
};

// -----------------------------------------------------------------------------
// 1. Configuração do Pool de Conexão com MariaDB
// -----------------------------------------------------------------------------
const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'ramais_user',
    password: process.env.DB_PASSWORD || 'ramais_secret_pass',
    database: process.env.DB_NAME || 'ramais_db',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    allowPublicKeyRetrieval: true,
    insertIdAsNumber: true,
    bigIntAsNumber: true,
    decimalAsNumber: true
});

// Inicialização do banco de dados e migrações
async function initDatabase(retries = 10, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        let conn;
        try {
            console.log(`[DB] Conectando ao MariaDB (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306})... Tentativa ${i + 1}/${retries}`);
            conn = await pool.getConnection();
            console.log('[DB] Conexão com MariaDB estabelecida com sucesso!');

            // Tabela de Usuários / Admins / Colaboradores
            await conn.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(100) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NULL,
                    display_name VARCHAR(255) NULL,
                    email VARCHAR(255) NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'colaborador',
                    auth_type VARCHAR(20) NOT NULL DEFAULT 'ldap',
                    first_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    login_count INT NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            // Migrações da tabela users
            const userMigrations = [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) NOT NULL DEFAULT 'ldap'",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 1",
                "ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL"
            ];

            for (const sql of userMigrations) {
                try { await conn.query(sql); } catch (_) {}
            }

            // Tabela Principal de Ramais
            await conn.query(`
                CREATE TABLE IF NOT EXISTS ramais (
                    id VARCHAR(64) PRIMARY KEY,
                    ramal VARCHAR(100) NOT NULL,
                    nome VARCHAR(500) NULL,
                    nomeCompleto TEXT NULL,
                    localizacao VARCHAR(500) NULL,
                    departamento VARCHAR(500) NULL,
                    setor VARCHAR(500) NULL,
                    email VARCHAR(500) NULL,
                    telefone VARCHAR(255) NULL,
                    status VARCHAR(100) DEFAULT 'Ativo',
                    cargo TEXT NULL,
                    empresa VARCHAR(500) NULL,
                    dispositivo TEXT NULL,
                    ip VARCHAR(255) NULL,
                    mac VARCHAR(255) NULL,
                    observacao LONGTEXT NULL,
                    extras LONGTEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_ramal (ramal),
                    INDEX idx_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            // Executar migrações de tamanho de colunas para bancos já criados
            const columnMigrations = [
                "ALTER TABLE ramais ADD COLUMN IF NOT EXISTS andar VARCHAR(100) NULL",
                "ALTER TABLE ramais MODIFY cargo TEXT NULL",
                "ALTER TABLE ramais MODIFY nome VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY nomeCompleto TEXT NULL",
                "ALTER TABLE ramais MODIFY localizacao VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY departamento VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY setor VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY email VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY telefone VARCHAR(255) NULL",
                "ALTER TABLE ramais MODIFY status VARCHAR(100) DEFAULT 'Ativo'",
                "ALTER TABLE ramais MODIFY empresa VARCHAR(500) NULL",
                "ALTER TABLE ramais MODIFY dispositivo TEXT NULL",
                "ALTER TABLE ramais MODIFY ip VARCHAR(255) NULL",
                "ALTER TABLE ramais MODIFY mac VARCHAR(255) NULL",
                "ALTER TABLE ramais MODIFY observacao LONGTEXT NULL",
                "ALTER TABLE ramais MODIFY extras LONGTEXT NULL"
            ];

            for (const sql of columnMigrations) {
                try { await conn.query(sql); } catch (_) {}
            }

            // Tabela de Configurações Gerais
            await conn.query(`
                CREATE TABLE IF NOT EXISTS system_config (
                    config_key VARCHAR(100) PRIMARY KEY,
                    config_value LONGTEXT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            // Garantir que o usuário admin exista
            const users = await conn.query('SELECT id FROM users WHERE username = ?', ['admin']);
            if (users.length === 0) {
                const defaultHash = await bcrypt.hash('admin', 10);
                await conn.query('INSERT INTO users (username, password_hash, role, auth_type, display_name) VALUES (?, ?, ?, ?, ?)', ['admin', defaultHash, 'admin', 'local', 'Administrador']);
                console.log('[DB] Usuário admin padrão criado com sucesso (Senha: admin).');
            }

            // Configurações padrão de sistema & LDAP
            const defaultConfigs = [
                ['logo', ''],
                ['theme', 'light'],
                ['theme_palette', 'imi'],
                ['custom_colors', '{}'],
                ['columns', '["ramal","nome","localizacao","setor","email","telefone","status","empresa"]'],
                ['models', '[]'],
                ['custom_fields', '[]'],
                ['ldap_url', 'ldap://10.250.220.200:389'],
                ['ldap_base_dn', 'DC=imi,DC=local'],
                ['ldap_bind_user', 'ramal.mngt@imi.local'],
                ['ldap_bind_password', 'Mudar@123'],
                ['ldap_group_dn', 'CN=GR_RAMAL_MNGT,OU=Grupos,OU=T.I,DC=imi,DC=local'],
                ['ldap_enabled', 'true']
            ];

            for (const [key, val] of defaultConfigs) {
                await conn.query('INSERT IGNORE INTO system_config (config_key, config_value) VALUES (?, ?)', [key, val]);
            }

            console.log('[DB] Tabelas e configurações verificadas com sucesso.');
            return;
        } catch (err) {
            console.error(`[DB Erro]: ${err.message}`);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            }
        } finally {
            if (conn) conn.release();
        }
    }
}

// -----------------------------------------------------------------------------
// 2. Serviço de Autenticação LDAP (Active Directory) e Processamento de Login
// -----------------------------------------------------------------------------

async function getLdapConfig() {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT config_key, config_value FROM system_config WHERE config_key LIKE 'ldap_%'");
        const config = {
            url: 'ldap://10.250.220.200:389',
            baseDn: 'DC=imi,DC=local',
            bindUser: 'ramal.mngt@imi.local',
            bindPassword: 'Mudar@123',
            groupDn: 'CN=GR_RAMAL_MNGT,OU=Grupos,OU=T.I,DC=imi,DC=local',
            enabled: true
        };

        rows.forEach(r => {
            if (r.config_key === 'ldap_url') config.url = r.config_value;
            if (r.config_key === 'ldap_base_dn') config.baseDn = r.config_value;
            if (r.config_key === 'ldap_bind_user') config.bindUser = r.config_value;
            if (r.config_key === 'ldap_bind_password') config.bindPassword = r.config_value;
            if (r.config_key === 'ldap_group_dn') config.groupDn = r.config_value;
            if (r.config_key === 'ldap_enabled') config.enabled = r.config_value === 'true';
        });

        return config;
    } catch (err) {
        console.error('[LDAP Config Erro]:', err);
        return null;
    } finally {
        if (conn) conn.release();
    }
}

async function authenticateLdapUser(username, password) {
    const config = await getLdapConfig();
    if (!config || !config.enabled) {
        return { success: false, error: 'A autenticação LDAP está desativada no sistema.' };
    }

    if (!username || !password) {
        return { success: false, error: 'Usuário e senha são obrigatórios.' };
    }

    const cleanUser = username.trim();
    const samAccount = cleanUser.includes('@') ? cleanUser.split('@')[0] : cleanUser;
    const userUpn = cleanUser.includes('@') ? cleanUser : `${cleanUser}@imi.local`;

    // 1. Localizar o usuário via Conta de Serviço
    const serviceClient = new Client({
        url: config.url,
        timeout: 5000,
        connectTimeout: 5000
    });

    let userEntry = null;

    try {
        await serviceClient.bind(config.bindUser, config.bindPassword);

        const searchFilter = `(|(sAMAccountName=${samAccount})(userPrincipalName=${userUpn})(userPrincipalName=${cleanUser}))`;
        const searchResult = await serviceClient.search(config.baseDn, {
            scope: 'sub',
            filter: searchFilter,
            attributes: ['displayName', 'givenName', 'sn', 'mail', 'sAMAccountName', 'userPrincipalName', 'memberOf', 'distinguishedName']
        });

        if (searchResult && searchResult.searchEntries && searchResult.searchEntries.length > 0) {
            userEntry = searchResult.searchEntries[0];
        }

        await serviceClient.unbind();
    } catch (svcErr) {
        try { await serviceClient.unbind(); } catch (_) {}
        console.error('[LDAP Service Search Erro]:', svcErr.message);
    }

    if (!userEntry) {
        return { success: false, error: 'Usuário não encontrado no domínio corporativo.' };
    }

    // 2. Autenticar com as credenciais do usuário
    const userClient = new Client({
        url: config.url,
        timeout: 5000,
        connectTimeout: 5000
    });

    const bindTarget = userEntry.userPrincipalName || userEntry.distinguishedName || userUpn;

    try {
        await userClient.bind(bindTarget, password);
        await userClient.unbind();
    } catch (bindErr) {
        try { await userClient.unbind(); } catch (_) {}
        console.warn(`[LDAP Bind Falha para ${samAccount}]:`, bindErr.message);
        return { success: false, error: 'Senha incorreta no domínio corporativo.' };
    }

    // 3. Validação de Associação ao Grupo GR_RAMAL_MNGT
    const userGroups = Array.isArray(userEntry.memberOf) ? userEntry.memberOf : (userEntry.memberOf ? [userEntry.memberOf] : []);
    const isServiceAccount = userEntry.sAMAccountName && userEntry.sAMAccountName.toLowerCase() === 'ramal.mngt';
    const isMember = isServiceAccount || userGroups.some(grp => String(grp).toLowerCase().includes('gr_ramal_mngt'));

    if (!isMember) {
        return {
            success: false,
            error: `Acesso negado: Seu usuário (${userEntry.sAMAccountName}) não possui permissão de acesso ao sistema (grupo GR_RAMAL_MNGT).`
        };
    }

    return {
        success: true,
        user: {
            username: userEntry.sAMAccountName || samAccount,
            displayName: userEntry.displayName || userEntry.givenName || samAccount,
            email: Array.isArray(userEntry.mail) ? userEntry.mail[0] : (userEntry.mail || userEntry.userPrincipalName || userUpn),
            dn: userEntry.distinguishedName,
            role: 'colaborador'
        }
    };
}

async function testLdapConnection(overrideConfig = null) {
    const config = overrideConfig || await getLdapConfig();
    const client = new Client({
        url: config.url,
        timeout: 5000,
        connectTimeout: 5000
    });

    try {
        await client.bind(config.bindUser, config.bindPassword);
        
        const groupSearch = await client.search(config.baseDn, {
            scope: 'sub',
            filter: `(|(distinguishedName=${config.groupDn})(sAMAccountName=GR_RAMAL_MNGT))`,
            attributes: ['cn', 'distinguishedName', 'member']
        });

        const groupFound = groupSearch.searchEntries.length > 0;
        await client.unbind();

        return {
            success: true,
            message: `Conexão com o Active Directory (${config.url}) estabelecida com sucesso!` + 
                     (groupFound ? ` Grupo GR_RAMAL_MNGT localizado.` : ` Atenção: Grupo GR_RAMAL_MNGT não foi localizado no Base DN.`)
        };
    } catch (err) {
        try { await client.unbind(); } catch (_) {}
        return { success: false, error: err.message };
    }
}

/**
 * Processador Unificado de Autenticação (Local Admin + Active Directory / LDAP)
 */
async function processLogin(username, password) {
    if (!username || !password) {
        return { status: 400, data: { error: 'Informe usuário e senha.' } };
    }

    const cleanUser = username.trim();

    // 1. Tentar autenticação como usuário local do banco de dados (ex: 'admin')
    let conn;
    try {
        conn = await pool.getConnection();
        const localUsers = await conn.query('SELECT * FROM users WHERE username = ?', [cleanUser]);

        if (localUsers.length > 0 && localUsers[0].password_hash && localUsers[0].password_hash.trim().length > 0) {
            const localUser = localUsers[0];
            const isLocalMatch = await bcrypt.compare(password, localUser.password_hash);
            if (isLocalMatch) {
                const token = jwt.sign(
                    {
                        id: localUser.id,
                        username: localUser.username,
                        displayName: localUser.display_name || 'Administrador Local',
                        role: localUser.role || 'admin'
                    },
                    JWT_SECRET,
                    { expiresIn: JWT_EXPIRES_IN }
                );

                return {
                    status: 200,
                    data: {
                        message: 'Autenticado com sucesso.',
                        token,
                        user: {
                            id: localUser.id,
                            username: localUser.username,
                            displayName: localUser.display_name || localUser.username,
                            role: localUser.role || 'admin'
                        }
                    }
                };
            }
        }
    } catch (dbErr) {
        console.error('[ProcessLogin DB Check Erro]:', dbErr);
    } finally {
        if (conn) conn.release();
    }

    // 2. Se não foi autenticado como local, autenticar via Active Directory (LDAP)
    const ldapResult = await authenticateLdapUser(cleanUser, password);
    if (!ldapResult.success) {
        return { status: 403, data: { error: ldapResult.error } };
    }

    const ldapUser = ldapResult.user;
    let userRole = 'colaborador';
    let userId = null;

    try {
        conn = await pool.getConnection();
        const existing = await conn.query('SELECT * FROM users WHERE username = ?', [ldapUser.username]);

        if (existing.length > 0) {
            userId = existing[0].id;
            userRole = existing[0].role || 'colaborador';

            await conn.query(`
                UPDATE users SET
                    display_name = ?,
                    email = ?,
                    last_login_at = NOW(),
                    login_count = login_count + 1
                WHERE id = ?
            `, [ldapUser.displayName, ldapUser.email, userId]);
        } else {
            const insRes = await conn.query(`
                INSERT INTO users (username, display_name, email, role, auth_type, login_count, first_login_at, last_login_at)
                VALUES (?, ?, ?, 'colaborador', 'ldap', 1, NOW(), NOW())
            `, [ldapUser.username, ldapUser.displayName, ldapUser.email]);
            userId = insRes.insertId;
            userRole = 'colaborador';
        }
    } catch (syncErr) {
        console.error('[User Sync DB Erro]:', syncErr);
    } finally {
        if (conn) conn.release();
    }

    const userPayload = {
        id: userId ? Number(userId) : ldapUser.username,
        username: ldapUser.username,
        displayName: ldapUser.displayName,
        email: ldapUser.email,
        role: userRole
    };

    const token = jwt.sign(
        userPayload,
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    return {
        status: 200,
        data: {
            message: 'Autenticado com sucesso.',
            token,
            user: userPayload
        }
    };
}

// -----------------------------------------------------------------------------
// 3. Middlewares de Autenticação JWT
// -----------------------------------------------------------------------------

function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: 'Autenticação necessária. Faça login para acessar o sistema.'
        });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            error: 'Formato do cabeçalho inválido. Use: Authorization: Bearer <token>'
        });
    }

    const token = parts[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Sessão expirada. Por favor, faça login novamente.' });
            }
            return res.status(403).json({ error: 'Token inválido ou sessão não autorizada.' });
        }

        req.user = decoded;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito ao perfil de Administrador.' });
    }
    next();
}

// -----------------------------------------------------------------------------
// 4. Rotas de Autenticação (Unificadas)
// -----------------------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
    const { username = 'admin', password } = req.body;
    const result = await processLogin(username, password);
    return res.status(result.status).json(result.data);
});

app.post('/api/auth/ldap-login', async (req, res) => {
    const { username, password } = req.body;
    const result = await processLogin(username, password);
    return res.status(result.status).json(result.data);
});

app.get('/api/auth/me', authenticateJWT, (req, res) => {
    return res.json({ user: req.user });
});

app.post('/api/auth/change-password', authenticateJWT, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 3) {
        return res.status(400).json({ error: 'A nova senha deve ter no mínimo 3 caracteres.' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const newHash = await bcrypt.hash(newPassword.trim(), 10);
        await conn.query('UPDATE users SET password_hash = ? WHERE username = ?', [newHash, 'admin']);

        return res.json({ message: 'Senha de administrador alterada com sucesso.' });
    } catch (err) {
        console.error('[Change Password Erro]:', err);
        return res.status(500).json({ error: 'Erro ao atualizar senha.' });
    } finally {
        if (conn) conn.release();
    }
});

// -----------------------------------------------------------------------------
// 5. Rotas de Gestão de Colaboradores (Admin)
// -----------------------------------------------------------------------------

app.get('/api/colaboradores', authenticateJWT, requireAdmin, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT id, username, display_name, email, role, auth_type,
                   first_login_at, last_login_at, login_count, created_at
            FROM users
            ORDER BY (role = 'admin') DESC, last_login_at DESC, id ASC
        `);
        return res.json(rows);
    } catch (err) {
        console.error('[GET /api/colaboradores Erro]:', err);
        return res.status(500).json({ error: 'Erro ao buscar lista de colaboradores.' });
    } finally {
        if (conn) conn.release();
    }
});

app.put('/api/colaboradores/:id/role', authenticateJWT, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'colaborador'].includes(role)) {
        return res.status(400).json({ error: 'Papel inválido. Deve ser "admin" ou "colaborador".' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const users = await conn.query('SELECT * FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Colaborador não encontrado.' });
        }

        const targetUser = users[0];

        if (targetUser.username === 'admin' && role !== 'admin') {
            return res.status(400).json({ error: 'A conta de administrador padrão não pode ser rebaixada.' });
        }

        await conn.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);

        return res.json({
            message: `Papel do usuário "${targetUser.username}" alterado para ${role === 'admin' ? 'Administrador' : 'Colaborador'}.`,
            user: { ...targetUser, role }
        });
    } catch (err) {
        console.error('[PUT /api/colaboradores/:id/role Erro]:', err);
        return res.status(500).json({ error: 'Erro ao atualizar papel do colaborador.' });
    } finally {
        if (conn) conn.release();
    }
});

// -----------------------------------------------------------------------------
// 6. Rotas de Configurações LDAP (Admin)
// -----------------------------------------------------------------------------

app.get('/api/config/ldap', authenticateJWT, requireAdmin, async (req, res) => {
    const config = await getLdapConfig();
    if (!config) return res.status(500).json({ error: 'Erro ao carregar configurações LDAP.' });

    const safeConfig = {
        ...config,
        bindPassword: config.bindPassword ? '********' : ''
    };
    return res.json(safeConfig);
});

app.post('/api/config/ldap', authenticateJWT, requireAdmin, async (req, res) => {
    const { url, baseDn, bindUser, bindPassword, groupDn, enabled } = req.body;

    let conn;
    try {
        conn = await pool.getConnection();

        const updates = [
            ['ldap_url', url || 'ldap://10.250.220.200:389'],
            ['ldap_base_dn', baseDn || 'DC=imi,DC=local'],
            ['ldap_bind_user', bindUser || 'ramal.mngt@imi.local'],
            ['ldap_group_dn', groupDn || 'CN=GR_RAMAL_MNGT,OU=Grupos,OU=T.I,DC=imi,DC=local'],
            ['ldap_enabled', enabled !== undefined ? String(enabled) : 'true']
        ];

        if (bindPassword && bindPassword !== '********') {
            updates.push(['ldap_bind_password', bindPassword]);
        }

        for (const [key, val] of updates) {
            await conn.query(`
                INSERT INTO system_config (config_key, config_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
            `, [key, val]);
        }

        return res.json({ message: 'Configurações do Active Directory / LDAP salvas com sucesso.' });
    } catch (err) {
        console.error('[Save LDAP Config Erro]:', err);
        return res.status(500).json({ error: 'Erro ao salvar configurações LDAP.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/config/test-ldap', authenticateJWT, requireAdmin, async (req, res) => {
    const bodyConfig = req.body;
    let configToTest = null;

    if (bodyConfig && bodyConfig.url) {
        configToTest = {
            url: bodyConfig.url,
            baseDn: bodyConfig.baseDn,
            bindUser: bodyConfig.bindUser,
            bindPassword: bodyConfig.bindPassword && bodyConfig.bindPassword !== '********' 
                ? bodyConfig.bindPassword 
                : (await getLdapConfig()).bindPassword,
            groupDn: bodyConfig.groupDn
        };
    }

    const testResult = await testLdapConnection(configToTest);
    if (!testResult.success) {
        return res.status(400).json({ error: testResult.error });
    }
    return res.json({ message: testResult.message });
});

// -----------------------------------------------------------------------------
// 7. Rotas de Dados (Protegidas por Autenticação JWT)
// -----------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT config_key, config_value FROM system_config WHERE config_key IN ('logo', 'theme', 'columns', 'theme_palette', 'custom_colors')");
        const config = {};
        rows.forEach(r => {
            try { config[r.config_key] = JSON.parse(r.config_value); }
            catch (_) { config[r.config_key] = r.config_value; }
        });
        return res.json(config);
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao carregar configurações.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/ramais', authenticateJWT, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT * FROM ramais ORDER BY CAST(ramal AS UNSIGNED), ramal ASC');
        
        const records = rows.map(r => {
            let extrasObj = {};
            if (r.extras) {
                try { extrasObj = JSON.parse(r.extras); } catch (_) {}
            }
            return {
                _id: r.id,
                ramal: r.ramal || '',
                nome: r.nome || '',
                nomeCompleto: r.nomeCompleto || '',
                localizacao: r.localizacao || '',
                andar: r.andar || '',
                departamento: r.departamento || '',
                setor: r.setor || '',
                email: r.email || '',
                telefone: r.telefone || '',
                status: r.status || 'Ativo',
                cargo: r.cargo || '',
                empresa: r.empresa || '',
                dispositivo: r.dispositivo || '',
                ip: r.ip || '',
                mac: r.mac || '',
                observacao: r.observacao || '',
                _extras: extrasObj
            };
        });

        return res.json(records);
    } catch (err) {
        console.error('[GET /api/ramais Erro]:', err);
        return res.status(500).json({ error: 'Erro ao buscar lista de ramais.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/stats', authenticateJWT, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const totalRows = await conn.query('SELECT COUNT(*) as total FROM ramais');
        const ativosRows = await conn.query("SELECT COUNT(*) as total FROM ramais WHERE LOWER(status) IN ('ativo', 'active', 'enabled', '1', 'sim')");
        const inativosRows = await conn.query("SELECT COUNT(*) as total FROM ramais WHERE LOWER(status) IN ('inativo', 'inactive', 'disabled', '0', 'não', 'nao')");
        const locRows = await conn.query("SELECT COUNT(DISTINCT localizacao) as total FROM ramais WHERE localizacao IS NOT NULL AND localizacao != ''");
        const setorRows = await conn.query("SELECT COUNT(DISTINCT setor) as total FROM ramais WHERE setor IS NOT NULL AND setor != ''");
        
        const porSetor = await conn.query(`
            SELECT setor as name, COUNT(*) as count 
            FROM ramais 
            WHERE setor IS NOT NULL AND setor != '' 
            GROUP BY setor 
            ORDER BY count DESC 
            LIMIT 10
        `);

        const porLocalizacao = await conn.query(`
            SELECT localizacao as name, COUNT(*) as count 
            FROM ramais 
            WHERE localizacao IS NOT NULL AND localizacao != '' 
            GROUP BY localizacao 
            ORDER BY count DESC 
            LIMIT 10
        `);

        return res.json({
            total: parseInt(totalRows[0].total, 10) || 0,
            ativos: parseInt(ativosRows[0].total, 10) || 0,
            inativos: parseInt(inativosRows[0].total, 10) || 0,
            localizacoes: parseInt(locRows[0].total, 10) || 0,
            setores: parseInt(setorRows[0].total, 10) || 0,
            porSetor: porSetor.map(d => ({ name: d.name, count: Number(d.count) })),
            porLocalizacao: porLocalizacao.map(l => ({ name: l.name, count: Number(l.count) }))
        });
    } catch (err) {
        console.error('[GET /api/stats Erro]:', err);
        return res.status(500).json({ error: 'Erro ao calcular estatísticas.' });
    } finally {
        if (conn) conn.release();
    }
});

// Operações Administrativas de Ramais
app.post('/api/ramais', authenticateJWT, requireAdmin, async (req, res) => {
    const data = req.body;
    if (!data.ramal || !data.ramal.toString().trim()) {
        return res.status(400).json({ error: 'O número do ramal é obrigatório.' });
    }

    const id = data._id || data.id || ('id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    const extrasStr = JSON.stringify(data._extras || data.extras || {});

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(`
            INSERT INTO ramais (
                id, ramal, nome, nomeCompleto, localizacao, andar, departamento, setor,
                email, telefone, status, cargo, empresa, dispositivo, ip, mac, observacao, extras
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            data.ramal.toString().trim(),
            data.nome || '',
            data.nomeCompleto || '',
            data.localizacao || '',
            data.andar || '',
            data.departamento || '',
            data.setor || '',
            data.email || '',
            data.telefone || '',
            data.status || 'Ativo',
            data.cargo || '',
            data.empresa || '',
            data.dispositivo || '',
            data.ip || '',
            data.mac || '',
            data.observacao || '',
            extrasStr
        ]);

        return res.status(201).json({ message: 'Ramal cadastrado com sucesso.', ramal: { ...data, _id: id } });
    } catch (err) {
        console.error('[POST /api/ramais Erro]:', err);
        return res.status(500).json({ error: 'Erro ao salvar ramal no banco de dados.' });
    } finally {
        if (conn) conn.release();
    }
});

app.put('/api/ramais/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    if (!data.ramal || !data.ramal.toString().trim()) {
        return res.status(400).json({ error: 'O número do ramal é obrigatório.' });
    }

    const extrasStr = JSON.stringify(data._extras || data.extras || {});

    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(`
            UPDATE ramais SET
                ramal = ?, nome = ?, nomeCompleto = ?, localizacao = ?, andar = ?, departamento = ?,
                setor = ?, email = ?, telefone = ?, status = ?, cargo = ?, empresa = ?,
                dispositivo = ?, ip = ?, mac = ?, observacao = ?, extras = ?
            WHERE id = ?
        `, [
            data.ramal.toString().trim(),
            data.nome || '',
            data.nomeCompleto || '',
            data.localizacao || '',
            data.andar || '',
            data.departamento || '',
            data.setor || '',
            data.email || '',
            data.telefone || '',
            data.status || 'Ativo',
            data.cargo || '',
            data.empresa || '',
            data.dispositivo || '',
            data.ip || '',
            data.mac || '',
            data.observacao || '',
            extrasStr,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ramal não encontrado.' });
        }

        return res.json({ message: 'Ramal atualizado com sucesso.', ramal: { ...data, _id: id } });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao atualizar ramal.' });
    } finally {
        if (conn) conn.release();
    }
});

app.delete('/api/ramais/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM ramais WHERE id = ?', [id]);
        return res.json({ message: 'Ramal excluído com sucesso.' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao excluir ramal.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/ramais/bulk-delete', authenticateJWT, requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Lista de IDs vazia.' });

    let conn;
    try {
        conn = await pool.getConnection();
        const placeholders = ids.map(() => '?').join(',');
        const result = await conn.query(`DELETE FROM ramais WHERE id IN (${placeholders})`, ids);
        return res.json({ message: `${result.affectedRows} ramais excluídos.`, deletedCount: result.affectedRows });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao excluir ramais.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/ramais/import', authenticateJWT, requireAdmin, async (req, res) => {
    const { records = [], replaceAll = true } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro para importar.' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (replaceAll) {
            await conn.query('DELETE FROM ramais');
        }

        const insertQuery = `
            INSERT INTO ramais (
                id, ramal, nome, nomeCompleto, localizacao, andar, departamento, setor,
                email, telefone, status, cargo, empresa, dispositivo, ip, mac, observacao, extras
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (const r of records) {
            const id = r._id || r.id || ('id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
            const extrasStr = JSON.stringify(r._extras || r.extras || {});

            await conn.query(insertQuery, [
                id,
                (r.ramal || '').toString().trim(),
                r.nome || '',
                r.nomeCompleto || '',
                r.localizacao || '',
                r.andar || '',
                r.departamento || '',
                r.setor || '',
                r.email || '',
                r.telefone || '',
                r.status || 'Ativo',
                r.cargo || '',
                r.empresa || '',
                r.dispositivo || '',
                r.ip || '',
                r.mac || '',
                r.observacao || '',
                extrasStr
            ]);
        }

        await conn.commit();
        return res.json({ message: `Importação concluída! ${records.length} ramais inseridos.`, count: records.length });
    } catch (err) {
        if (conn) await conn.rollback();
        return res.status(500).json({ error: 'Erro na importação: ' + err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/ramais/clear', authenticateJWT, requireAdmin, async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM ramais');
        return res.json({ message: 'Todos os ramais foram removidos.' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao limpar dados.' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/config', authenticateJWT, requireAdmin, async (req, res) => {
    const configs = req.body;
    if (!configs || typeof configs !== 'object') return res.status(400).json({ error: 'Objeto de configuração inválido.' });

    let conn;
    try {
        conn = await pool.getConnection();
        for (const [key, value] of Object.entries(configs)) {
            const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            await conn.query(`
                INSERT INTO system_config (config_key, config_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
            `, [key, valStr]);
        }
        return res.json({ message: 'Configurações atualizadas com sucesso.' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao salvar configurações.' });
    } finally {
        if (conn) conn.release();
    }
});

// Fallback SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar Servidor
async function startServer() {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`=======================================================`);
        console.log(`🚀 Servidor Gerenciador de Ramais iniciado com sucesso!`);
        console.log(`🌐 Porta: ${PORT} | Autenticação: Unificada (LDAP/AD + Local)`);
        console.log(`=======================================================`);
    });
}

startServer();
