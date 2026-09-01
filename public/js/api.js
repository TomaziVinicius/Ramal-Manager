/**
 * Módulo de Integração com a API RESTful e Gerenciamento de Autenticação JWT (LDAP / Local)
 */
const Api = (function() {
    const TOKEN_KEY = 'ramais_jwt_token';
    const USER_KEY = 'ramais_user_info';
    const BASE_URL = '/api';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setAuth(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    }

    function clearAuth() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function isAuthenticated() {
        return !!getToken();
    }

    function getCurrentUser() {
        const userStr = localStorage.getItem(USER_KEY);
        try {
            return userStr ? JSON.parse(userStr) : null;
        } catch (_) {
            return null;
        }
    }

    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    if (token && endpoint !== '/auth/login' && endpoint !== '/auth/ldap-login') {
                        clearAuth();
                        window.dispatchEvent(new CustomEvent('auth:expired'));
                    }
                }
                const errorMsg = data.error || data.message || `Erro na requisição (${response.status})`;
                throw new Error(errorMsg);
            }

            return data;
        } catch (err) {
            console.error(`[API Fetch Erro em ${endpoint}]:`, err);
            throw err;
        }
    }

    return {
        getToken,
        setAuth,
        clearAuth,
        isAuthenticated,
        getCurrentUser,

        // Autenticação LDAP (Active Directory)
        ldapLogin: async (username, password) => {
            const res = await request('/auth/ldap-login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            if (res.token) {
                setAuth(res.token, res.user);
            }
            return res;
        },

        // Autenticação Administrador Local
        login: async (password, username = 'admin') => {
            const res = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            if (res.token) {
                setAuth(res.token, res.user);
            }
            return res;
        },

        checkAuth: async () => {
            if (!getToken()) return null;
            return await request('/auth/me', { method: 'GET' });
        },

        changePassword: async (newPassword) => {
            return await request('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });
        },

        // Configurações LDAP
        getLdapConfig: async () => {
            return await request('/config/ldap', { method: 'GET' });
        },

        saveLdapConfig: async (ldapData) => {
            return await request('/config/ldap', {
                method: 'POST',
                body: JSON.stringify(ldapData)
            });
        },

        testLdap: async (ldapData) => {
            return await request('/config/test-ldap', {
                method: 'POST',
                body: JSON.stringify(ldapData || {})
            });
        },

        // Gestão de Colaboradores (Admin)
        getColaboradores: async () => {
            return await request('/colaboradores', { method: 'GET' });
        },

        updateColaboradorRole: async (id, role) => {
            return await request(`/colaboradores/${id}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role })
            });
        },

        // Ramais (Leitura e Escrita)
        getRamais: async () => {
            return await request('/ramais', { method: 'GET' });
        },

        getStats: async () => {
            return await request('/stats', { method: 'GET' });
        },

        getConfig: async () => {
            return await request('/config', { method: 'GET' });
        },

        createRamal: async (ramalData) => {
            return await request('/ramais', {
                method: 'POST',
                body: JSON.stringify(ramalData)
            });
        },

        updateRamal: async (id, ramalData) => {
            return await request(`/ramais/${id}`, {
                method: 'PUT',
                body: JSON.stringify(ramalData)
            });
        },

        deleteRamal: async (id) => {
            return await request(`/ramais/${id}`, {
                method: 'DELETE'
            });
        },

        bulkDeleteRamais: async (ids) => {
            return await request('/ramais/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ids })
            });
        },

        importRamais: async (records, replaceAll = true) => {
            return await request('/ramais/import', {
                method: 'POST',
                body: JSON.stringify({ records, replaceAll })
            });
        },

        clearRamais: async () => {
            return await request('/ramais/clear', {
                method: 'POST'
            });
        },

        saveConfig: async (configs) => {
            return await request('/config', {
                method: 'POST',
                body: JSON.stringify(configs)
            });
        }
    };
})();
