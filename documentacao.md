# 📖 Documentação Geral do Sistema — Portal Gerenciador de Ramais

Esta documentação consolida todas as especificações técnicas, arquitetura de software, infraestrutura, integrações (3CX e Nextcloud), segurança, modelo de dados, rotas de API e guias operacionais do **Portal Gerenciador de Ramais**.

---

## 📌 1. Visão Geral da Solução

O **Portal Gerenciador de Ramais** é uma aplicação web corporativa *Single Page Application* (SPA) de alta performance, desenvolvida para centralizar, organizar e disponibilizar a lista telefônica e de ramais das unidades da instituição com máxima agilidade, segurança e responsividade.

### 1.1 Informações de Acesso
- **URL de Produção Direta:** `http://10.250.220.244` (Portas `80` e `3000`)
- **Acesso Integrado (Nextcloud):** Embutido através do aplicativo *External Sites* do Nextcloud institucional.
- **Ambiente de Hospedagem:** Servidor Linux Debian 13 rodando containers Docker orquestrados via Docker Compose.

### 1.2 Pilha Tecnológica (Tech Stack)
- **Front-end:** HTML5 Semântico, CSS3 Moderno (Design Tokens, CSS Custom Properties, Grid/Flexbox Responsivo, Glassmorphism, Dark/Light Mode), Vanilla JavaScript Modular (padrão IIFE/Revealing Module, sem sobrecarga de frameworks).
- **Back-end:** Node.js (v20 Alpine), Express 4.x, Autenticação JWT (`jsonwebtoken`), Conexão LDAP/AD (`ldapjs`), Hash de Senhas (`bcryptjs`), Driver Nativo MariaDB (`mariadb`).
- **Banco de Dados:** MariaDB 11.4 com volume persistente Docker (`mariadb_data`).
- **Telefonia & PWA:** Integração com o softphone **3CX** via protocolo `tel:`.
- **Compatibilidade Iframe:** Configuração de headers CSP (`frame-ancestors *`) e gatilho assíncrono via `iframe` oculto para evitar travamentos em plataformas embutidas.

---

## 🔑 2. Credenciais e Configurações de Conexão

### 2.1 Servidor de Produção (Linux Host)
| Parâmetro | Valor |
| :--- | :--- |
| **IP do Servidor** | `10.250.220.244` |
| **Porta SSH** | `22` |
| **Usuário SSH** | `root` |
| **Autenticação SSH** | Chave pública/privada `ed25519` configurada (acesso sem senha) / Senha fallback: `Mudar@123` |
| **Diretório do Projeto** | `/opt/ramais` |
| **Containers Docker** | `ramais_app` (Node.js) e `ramais_mariadb` (MariaDB 11.4) |

### 2.2 Active Directory / LDAP (Autenticação Corporativa)
| Parâmetro | Valor |
| :--- | :--- |
| **Controlador de Domínio (DC)** | `10.250.220.200:389` (`SRV-IMI-PDC-01.imi.local`) |
| **Base DN** | `DC=imi,DC=local` |
| **Conta de Serviço (Bind User)** | `ramal.mngt@imi.local` (`CN=Ramal Manager,OU=Sistemas,OU=T.I,DC=imi,DC=local`) |
| **Senha da Conta de Serviço** | `Mudar@123` |
| **Grupo de Acesso Autorizado** | `CN=GR_RAMAL_MNGT,OU=Grupos,OU=T.I,DC=imi,DC=local` |
| **Regra de Validação** | Somente usuários pertencentes explicitamente ao grupo `GR_RAMAL_MNGT` recebem token de autorização. |

### 2.3 Banco de Dados (MariaDB)
| Parâmetro | Valor |
| :--- | :--- |
| **Host Interno (Docker Network)** | `db:3306` |
| **Host Externo (Rede Local)** | `10.250.220.244:3306` |
| **Nome do Banco (Database)** | `ramais_db` |
| **Usuário da Aplicação** | `ramais_user` |
| **Senha da Aplicação** | `ramais_secret_pass` |
| **Usuário Root do Banco** | `root` |
| **Senha Root do Banco** | `ramais_root_secret_pass` |
| **Volume de Persistência** | `mariadb_data` (gerenciado pelo Docker) |

### 2.4 Contas de Acesso Inicial do Sistema
| Usuário | Senha Inicial | Tipo de Conta | Nível de Privilégio |
| :--- | :--- | :--- | :--- |
| `admin` | `admin` (alterável via painel) | Local | Administrador Completo |
| `usuario.ad` | *Senha de rede do usuário* | LDAP / Active Directory | Colaborador (ou Administrador se promovido) |

---

## 🏢 3. Nomenclaturas Oficiais dos Estabelecimentos

O sistema detecta e classifica automaticamente os ramais nos 4 estabelecimentos oficiais da instituição, aplicando a identidade visual e filtros correspondentes:

| Sigla | Nome Oficial Completo | Identidade Visual / Cores | Ícone |
| :--- | :--- | :--- | :---: |
| **IMI** | Instituto Maringá de Imagem | 🔵 Azul Corporativo / Ciano | 🏢 |
| **ICA** | Instituto Carlos Américo de Imagem | 🟠 Laranja / Coral | 🏥 |
| **RIO** | Instituto Rio Branco de Imagem | 🟣 Roxo / Púrpura | 🏨 |
| **IPU** | Instituto do Pulmão | 🟢 Verde Esmeralda | 🫁 |

---

## 📞 4. Integração com 3CX e Incorporação em Iframe (Nextcloud)

### 4.1 Integração Click-to-Call (3CX)
- Todos os números de ramal na aplicação são interativos. Ao clicar, o sistema aciona o manipulador de protocolo `tel:NUMERO`.
- Se o usuário possuir o aplicativo **3CX PWA** ou Softphone instalado, o Windows abre diretamente a tela de discagem.
- Ao lado de cada ramal nos cartões, há um botão de cópia rápida (📋) que copia o número para a área de transferência com confirmação via Toast.

### 4.2 Solução para Bloqueio de Navegação em Iframe (Nextcloud)
Ao carregar a aplicação dentro do **Nextcloud (App External Sites)**, navegadores baseados em Chromium (Chrome/Edge) bloqueiam links `<a href="tel:...">` diretos, pois interpretam como tentativa de substituir o frame, exibindo a mensagem *"Este conteúdo está bloqueado"*.

**Arquitetura implementada para contornar o bloqueio:**
1. **Interceptação de Evento (`e.preventDefault()`):** Os cliques em botões e links telefônicos são capturados no JavaScript ([cards-view.js](file:///c:/Projetos/ramais/public/js/cards-view.js) e [table.js](file:///c:/Projetos/ramais/public/js/table.js)).
2. **Disparo com Iframe Oculto Temporário (`_triggerPhoneCall`):**
   ```javascript
   function _triggerPhoneCall(number) {
       const telUrl = `tel:${encodeURIComponent(number)}`;
       const frame = document.createElement('iframe');
       frame.style.display = 'none';
       frame.src = telUrl;
       document.body.appendChild(frame);
       setTimeout(() => { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 3000);
   }
   ```
3. **Liberação de Cabeçalhos no Servidor ([server.js](file:///c:/Projetos/ramais/server.js)):**
   - Configurado `Content-Security-Policy: frame-ancestors *;`
   - Removido cabeçalho `X-Frame-Options` para permitir a renderização fluida dentro do Nextcloud.

---

## 🎨 5. Módulos de Interface e Experiência do Usuário (UI/UX)

### 5.1 Tela de Autenticação Obrigatória (Login Gate)
- Bloqueia a visualização de qualquer dado antes da autenticação.
- O campo de usuário aceita tanto o login simples (`joao.silva`) quanto formatos completos (`joao.silva@imi.local` ou `IMI\joao.silva`), normalizando automaticamente.
- Sessão persistida em LocalStorage com token JWT válido por 8 horas.

### 5.2 Visualização em Quadrados por Setor (CardsView)
- **Hierarquia Visual:** `Estabelecimento` ➔ `Andar` ➔ `Setores` ➔ `Cartão de Ramais`.
- **Barra de Navegação Rápida Superior:** Botões com contadores em tempo real (`🌐 Todos`, `🔵 IMI`, `🟠 ICA`, `🟣 RIO`, `🟢 IPU`) com rolagem suave (*smooth scroll*).
- **Grid Responsivo:** Exibe até 4 colunas de setores por linha no Desktop, adaptando-se para 3, 2 e 1 coluna em telas menores.
- **Altura Uniforme com Scroll Interno:** Todo cartão possui altura mínima padrão para comportar 3 ramais uniformemente. Setores com 4 ou mais ramais ativam uma barra de rolagem vertical fina personalizada.

### 5.3 Visualização em Tabela Interativa (TableView)
- **Ordenação Dinâmica:** Clique no cabeçalho de qualquer coluna para ordenar (Ascendente / Descendente).
- **Filtros Combinados:** Filtros dinâmicos por Status, Localização, Setor e Empresa.
- **Paginação Configurável:** Opções para 25, 50, 100 registros por página ou exibir Todos.
- **Ações em Massa (Bulk Actions):** Checkbox geral e seleção individual de linhas para exclusão de múltiplos ramais em lote (exclusivo para Administradores).

### 5.4 Motor de Busca Acentuação-Insensível
- O mecanismo de busca em tempo real utiliza normalização Unicode:
  ```javascript
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  ```
- Buscas por termos como `andre`, `maringa`, `recepcao`, `clinica` encontram perfeitamente `André`, `Maringá`, `Recepção`, `Clínica`.

### 5.5 Indicadores de Status Padronizados
- 🟢 **Ativo** (`#10b981` / Verde Esmeralda)
- 🔴 **Inativo** (`#ef4444` / Vermelho Rubi)
- 🟡 **Pendente** (`#f59e0b` / Âmbar)

### 5.6 Personalização da Identidade Visual (Temas)
- **Paletas Pré-definidas:** IMI (Azul Corporativo) e ICA (Laranja/Coral).
- **Modo Personalizado:** Seletor de cores nativo (*Color Picker*) para Cor Primária, Hover e Menu Lateral.
- **Dark / Light Mode:** Alternador de modo escuro e claro com persistência no banco e LocalStorage.
- **Upload de Logotipo:** Suporte a upload de imagem para exibição na Sidebar e no Login Gate.

---

## 🔒 6. Controle de Acesso e Perfis de Usuário

| Funcionalidade / Tela | Perfil Colaborador | Perfil Administrador |
| :--- | :---: | :---: |
| Visualizar Ramais (Cards e Tabela) | ✅ Sim | ✅ Sim |
| Buscar e Filtrar Ramais | ✅ Sim | ✅ Sim |
| Discar via 3CX e Copiar Ramal | ✅ Sim | ✅ Sim |
| Alternar Modo Escuro / Claro | ✅ Sim | ✅ Sim |
| Adicionar / Editar / Excluir Ramal | ❌ Oculto | ✅ Sim |
| Exclusão em Massa (Bulk Delete) | ❌ Oculto | ✅ Sim |
| Importar e Exportar CSV | ❌ Oculto | ✅ Sim |
| Configurar Parâmetros LDAP / AD | ❌ Oculto | ✅ Sim |
| Personalizar Cores e Logotipo | ❌ Oculto | ✅ Sim |
| Gerenciar Perfis de Colaboradores | ❌ Oculto | ✅ Sim |
| Alterar Senha de Admin Local | ❌ Oculto | ✅ Sim |

### Painel de Gestão de Colaboradores
O sistema rastreia automaticamente cada login corporativo efetuado via Active Directory. O Administrador pode:
- Visualizar todos os colaboradores que já acessaram a plataforma.
- Consultar a data/hora do primeiro e do último login, além da contagem total de acessos.
- Promover qualquer colaborador a **Administrador** ou rebaixar para **Colaborador** com apenas 1 clique.

---

## 🔌 7. Especificação Completa da API RESTful

Todas as rotas da API possuem o prefixo `/api` e utilizam o cabeçalho `Authorization: Bearer <TOKEN_JWT>`.

### 7.1 Autenticação e Usuários
| Método | Endpoint | Protegido? | Perfil | Descrição |
| :--- | :--- | :---: | :---: | :--- |
| `POST` | `/api/auth/ldap-login` | Não | Público | Autentica usuário no Active Directory (valida grupo `GR_RAMAL_MNGT`). |
| `POST` | `/api/auth/login` | Não | Público | Autentica o usuário administrador local (`admin`). |
| `GET` | `/api/auth/me` | Sim | Todos | Retorna dados do usuário autenticado a partir do token JWT. |
| `POST` | `/api/auth/change-password` | Sim | Admin | Altera a senha do usuário administrador local. |
| `GET` | `/api/users` | Sim | Admin | Lista todos os usuários registrados no sistema com histórico de login. |
| `PATCH` | `/api/users/:id/role` | Sim | Admin | Atualiza a função do usuário (`admin` ou `colaborador`). |

### 7.2 Gerenciamento de Ramais
| Método | Endpoint | Protegido? | Perfil | Descrição |
| :--- | :--- | :---: | :---: | :--- |
| `GET` | `/api/ramais` | Sim | Todos | Retorna a lista completa de ramais cadastrados. |
| `POST` | `/api/ramais` | Sim | Admin | Cria um novo registro de ramal. |
| `PUT` | `/api/ramais/:id` | Sim | Admin | Atualiza os dados de um ramal existente. |
| `DELETE` | `/api/ramais/:id` | Sim | Admin | Exclui permanentemente um ramal. |
| `POST` | `/api/ramais/bulk` | Sim | Admin | Importação em massa de ramais via JSON/CSV. |
| `POST` | `/api/ramais/delete-batch` | Sim | Admin | Exclusão em lote de múltiplos ramais por array de IDs. |

### 7.3 Configurações do Sistema
| Método | Endpoint | Protegido? | Perfil | Descrição |
| :--- | :--- | :---: | :---: | :--- |
| `GET` | `/api/config` | Não | Público | Retorna as configurações públicas (tema, paleta, logo, colunas). |
| `POST` | `/api/config` | Sim | Admin | Salva parâmetros de configuração visual e de layout. |
| `POST` | `/api/config/logo` | Sim | Admin | Faz upload do logotipo da empresa (Base64). |
| `DELETE` | `/api/config/logo` | Sim | Admin | Remove o logotipo cadastrado. |
| `GET` | `/api/config/ldap` | Sim | Admin | Retorna as credenciais e parâmetros atuais do LDAP/AD. |
| `POST` | `/api/config/ldap` | Sim | Admin | Atualiza as configurações de conexão do LDAP/AD. |
| `POST` | `/api/config/ldap/test` | Sim | Admin | Realiza teste de conexão e bind com o Active Directory. |

---

## 🗄️ 8. Modelo de Dados (Estrutura do MariaDB)

### 8.1 Tabela `ramais`
```sql
CREATE TABLE IF NOT EXISTS ramais (
    id VARCHAR(36) PRIMARY KEY,
    ramal VARCHAR(20) NOT NULL,
    nome VARCHAR(255),
    nomeCompleto VARCHAR(255),
    localizacao VARCHAR(100),
    andar VARCHAR(100),
    departamento VARCHAR(100),
    setor VARCHAR(100),
    email VARCHAR(255),
    telefone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Ativo',
    cargo TEXT,
    empresa VARCHAR(100),
    dispositivo LONGTEXT,
    ip LONGTEXT,
    mac LONGTEXT,
    observacao LONGTEXT,
    extras LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ramal (ramal),
    INDEX idx_localizacao (localizacao),
    INDEX idx_setor (setor),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 8.2 Tabela `users`
```sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NULL,
    display_name VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    role ENUM('admin', 'colaborador') DEFAULT 'colaborador',
    auth_type ENUM('local', 'ldap') DEFAULT 'ldap',
    login_count INT DEFAULT 0,
    first_login_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 8.3 Tabela `system_config`
```sql
CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
*Chaves armazenadas:* `logo`, `theme`, `theme_palette`, `custom_colors`, `columns`, `ldap_url`, `ldap_base_dn`, `ldap_bind_user`, `ldap_bind_password`, `ldap_group_dn`, `ldap_enabled`.

---

## 📁 9. Estrutura de Arquivos do Repositório

```text
/opt/ramais/ (C:\Projetos\ramais\)
├── Dockerfile                  # Imagem Docker Node.js 20 Alpine
├── docker-compose.yml          # Definição dos serviços App (Node) + DB (MariaDB 11.4)
├── package.json                # Dependências do Node.js
├── server.js                   # Backend Express, rotas da API, LDAP e migrações
├── .env                        # Variáveis de ambiente
├── documentacao.md             # Esta documentação técnica
├── sync.ps1 / sync.bat         # Script para sincronização completa com o servidor
├── sync-watch.ps1 / .bat       # Script para monitoramento e sincronização em tempo real (Watch)
├── database/
│   └── init.sql                # Script de inicialização do banco de dados
└── public/                     # Arquivos estáticos do Front-end (SPA)
    ├── index.html              # HTML principal (Login Gate, Topbar, Sidebar, Views, Modais)
    ├── css/
    │   └── style.css           # Design System, variáveis CSS, temas, grid e responsividade
    └── js/
        ├── api.js              # Cliente HTTP REST e gerenciamento de token JWT
        ├── app.js              # Inicializador da aplicação, controle de sessão e eventos
        ├── cards-view.js       # Renderizador da visualização em quadrados por setor e seções
        ├── table.js            # Renderizador da visualização em tabela interativa
        ├── ui.js               # Gerenciador de modais, notificações toast e temas
        ├── data-normalizer.js  # Normalizador de dados e mapeamento de campos CSV
        └── csv-parser.js       # Parser de CSV com detecção de delimitadores
```

---

## 🛠️ 10. Guia de Operação, Sincronização e Manutenção

### 10.1 Sincronização do Código (Ambiente Local ➔ Servidor de Produção)
Para editar os arquivos no seu ambiente de desenvolvimento e sincronizar automaticamente com o servidor Linux:

- **Sincronização em Tempo Real (Recomendado):**
  ```powershell
  # No terminal do Windows / VS Code / Antigravity:
  .\sync-watch.bat
  ```
  *Qualquer arquivo salvo localmente (`Ctrl + S`) é transferido instantaneamente via SCP em milissegundos.*

- **Sincronização Manual Completa:**
  ```powershell
  .\sync.bat
  ```

- **Sincronizar e Reiniciar o Container Node.js:**
  ```powershell
  .\sync.ps1 -RestartApp
  ```

---

### 10.2 Acesso SSH ao Servidor
```bash
ssh root@10.250.220.244
```
*(Chave SSH configurada para autenticação direta sem digitação de senha).*

---

### 10.3 Comandos Docker de Produção
No servidor (`/opt/ramais`):

```bash
# Navegar até o diretório do projeto
cd /opt/ramais

# Verificar o estado e integridade dos containers
docker compose ps

# Visualizar logs da aplicação em tempo real
docker logs -f ramais_app

# Reiniciar a aplicação Node.js
docker compose restart app

# Reiniciar todos os serviços (App + Banco)
docker compose restart

# Parar os containers com segurança
docker compose down

# Subir os containers em segundo plano (Daemon)
docker compose up -d

# Reconstruir a imagem da aplicação após alterações no Dockerfile/package.json
docker compose up -d --build app
```

---

### 10.4 Backup e Restauração do Banco de Dados

#### Exportar Backup Completo:
```bash
docker exec ramais_mariadb mariadb-dump -u ramais_user -pramais_secret_pass ramais_db > /opt/ramais/backup_ramais_$(date +%Y%m%d_%H%M%S).sql
```

#### Restaurar Backup:
```bash
docker exec -i ramais_mariadb mariadb -u ramais_user -pramais_secret_pass ramais_db < /opt/ramais/backup_ramais_NOME_DO_ARQUIVO.sql
```

#### Acessar o Console Interativo do MariaDB:
```bash
docker exec -it ramais_mariadb mariadb -u ramais_user -pramais_secret_pass ramais_db
```

---

## 📋 11. Histórico de Versões e Atualizações

- **v1.0.0:** Lançamento inicial da aplicação com visualização em tabela e banco de dados SQLite.
- **v2.0.0:** Migração da arquitetura para Docker + MariaDB 11.4 em servidor Linux Debian.
- **v2.1.0:** Implementação do Gate de Autenticação LDAP/Active Directory com validação do grupo `GR_RAMAL_MNGT` e emissão de tokens JWT de 8h.
- **v2.2.0:** Criação da visualização em Quadrados por Setor (**CardsView**) com agrupamento hierárquico (Estabelecimento ➔ Andar ➔ Setor).
- **v2.3.0:** Adicionado painel administrativo de **Gestão de Colaboradores** com promoção de permissões e métricas de login.
- **v2.4.0:** Uniformização da altura dos cartões para no mínimo 3 ramais e ativação de scroll fino para setores com 4 ou mais ramais.
- **v2.5.0:** Integração de telefonia 3CX adaptada para **Nextcloud (Iframe)**, com gatilho assíncrono via `iframe` oculto para eliminação do erro *"Este conteúdo está bloqueado"*.
