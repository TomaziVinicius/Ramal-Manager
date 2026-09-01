# 📞 Portal Gerenciador de Ramais

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-v20_Alpine-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-11.4-003545?style=for-the-badge&logo=mariadb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

<p align="center">
  <b>Sistema corporativo moderno, responsivo e seguro para gestão centralizada, consulta e discagem de ramais telefônicos multiunidades.</b>
</p>

</div>

---

## 🌟 Principais Recursos

- 🏢 **Organização Multiunidades / Multisetores:** Agrupamento hierárquico inteligente por **Estabelecimento ➔ Andar ➔ Setor ➔ Ramais**.
- 🎛️ **Visualização Dupla Instantânea:**
  - **Modo Cartões por Setor (CardsView):** Grid responsivo em 4 colunas com altura uniforme (mínimo 3 ramais) e rolagem suave para setores com múltiplos números.
  - **Modo Tabela Interativa (TableView):** Ordenação dinâmica por colunas, paginação configurável (25, 50, 100 ou Todos) e seleção em lote (*Bulk Actions*).
- 📞 **Integração Click-to-Call (3CX / Softphone):**
  - Acionamento direto do discador telefônico nativo via protocolo `tel:`.
  - Botão de cópia rápida (📋) com notificações toast.
  - **Compatibilidade com Iframes e Plataformas Corporativas (Nextcloud, SharePoint, etc.):** Mecanismo assíncrono que impede travamentos e mensagens de bloqueio de segurança do navegador.
- 🔐 **Autenticação Dupla Corporativa:**
  - **Active Directory / LDAP:** Validação de login com restrição de acesso por Grupo de Segurança (`GR_RAMAL_MNGT`).
  - **Administrador Local:** Fallback seguro com senhas criptografadas via `bcryptjs`.
  - **Sessões JWT:** Tokens assinados com expiração configurável (padrão: 8 horas).
- 🔍 **Busca Inteligente Acentuação-Insensível:** Motor de busca em tempo real com normalização Unicode (`normalize('NFD')`), permitindo localizar termos sem distinção de acentos ou maiúsculas/minúsculas.
- 📊 **Gestão de Colaboradores & Auditoria:** Rastreamento de acessos corporativos com data de primeiro e último login, contagem de acessos e promoção de perfis com 1 clique.
- 📑 **Importação e Exportação CSV:**
  - Parser com detecção automática de delimitadores (`;`, `,`, `\t`).
  - Normalizador de campos e mapeamento flexível de colunas.
- 🎨 **Personalização Visual Completa:**
  - Suporte nativo a **Modo Escuro (Dark Mode)** e **Modo Claro (Light Mode)**.
  - Seletor de paletas pré-definidas ou personalizadas via *Color Picker*.
  - Upload de logotipo da instituição para a tela de autenticação e barra lateral.

---

## 🏗️ Arquitetura e Tecnologias

```text
├── Front-end:  HTML5 Semântico, CSS3 (Design Tokens, Custom Properties), Vanilla JS (Modular IIFE)
├── Back-end:   Node.js 20 (Alpine), Express.js, ldapjs, jsonwebtoken, bcryptjs
├── Banco:      MariaDB 11.4 com Pool de Conexões nativo e migrações automáticas
└── Deploy:     Docker & Docker Compose com persistência de volumes e reinicialização resiliente
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) e [Docker Compose](https://docs.docker.com/compose/) (Recomendado para produção)
- *Ou* [Node.js](https://nodejs.org/) v20+ e [MariaDB](https://mariadb.org/) 11+ instalados localmente.

---

### 1. Executando com Docker Compose (Modo Recomendado)

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/portal-ramais.git
   cd portal-ramais
   ```

2. **Configure o arquivo de variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```
   *Edite o arquivo `.env` e ajuste sua chave secreta JWT e credenciais caso necessário.*

3. **Inicie os containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Acesse no navegador:**
   - URL: `http://localhost:3000` ou `http://localhost`

---

### 2. Executando Localmente para Desenvolvimento

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o banco de dados MariaDB** e execute o script de inicialização:
   ```bash
   mariadb -u root -p < database/init.sql
   ```

3. **Inicie a aplicação:**
   ```bash
   npm start
   # ou para desenvolvimento com live-reload:
   npm run dev
   ```

---

## ⚙️ Variáveis de Ambiente (`.env`)

| Variável | Descrição | Valor Padrão |
| :--- | :--- | :--- |
| `PORT` | Porta onde o servidor Express irá escutar | `3000` |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT | *string aleatória segura* |
| `JWT_EXPIRES_IN` | Tempo de validade da sessão do usuário | `8h` |
| `DB_HOST` | Host do banco de dados MariaDB | `db` (ou `localhost`) |
| `DB_PORT` | Porta do MariaDB | `3306` |
| `DB_USER` | Usuário do banco de dados | `ramais_user` |
| `DB_PASSWORD` | Senha do banco de dados | `sua_senha_segura` |
| `DB_NAME` | Nome da base de dados | `ramais_db` |

---

## 🔒 Credenciais de Primeiro Acesso

Na primeira execução, o sistema cria automaticamente o usuário administrador local:

- **Usuário:** `admin`
- **Senha Inicial:** `admin` *(Recomenda-se alterar imediatamente através do painel de Configurações)*

---

## 🔌 Visão Geral da API RESTful

Todas as requisições protegidas exigem o cabeçalho `Authorization: Bearer <TOKEN_JWT>`.

| Método | Endpoint | Protegido? | Perfil | Descrição |
| :--- | :--- | :---: | :---: | :--- |
| `POST` | `/api/auth/login` | Não | Público | Autenticação do administrador local. |
| `POST` | `/api/auth/ldap-login` | Não | Público | Autenticação de colaboradores via Active Directory / LDAP. |
| `GET` | `/api/auth/me` | Sim | Todos | Retorna informações do usuário autenticado. |
| `POST` | `/api/auth/change-password` | Sim | Admin | Altera a senha do administrador local. |
| `GET` | `/api/users` | Sim | Admin | Lista usuários com histórico de acesso e contagem de logins. |
| `PATCH` | `/api/users/:id/role` | Sim | Admin | Promove ou altera a permissão de um usuário (`admin` / `colaborador`). |
| `GET` | `/api/ramais` | Sim | Todos | Retorna a lista de ramais cadastrados. |
| `POST` | `/api/ramais` | Sim | Admin | Cadastra um novo ramal. |
| `PUT` | `/api/ramais/:id` | Sim | Admin | Atualiza os dados de um ramal. |
| `DELETE` | `/api/ramais/:id` | Sim | Admin | Exclui um ramal permanentemente. |
| `POST` | `/api/ramais/bulk` | Sim | Admin | Importação em lote de ramais. |
| `POST` | `/api/ramais/delete-batch` | Sim | Admin | Exclusão em massa de ramais por lista de IDs. |
| `GET` | `/api/config` | Não | Público | Retorna tema, paleta de cores e preferências visuais. |
| `POST` | `/api/config` | Sim | Admin | Salva configurações de interface e colunas. |
| `GET` | `/api/config/ldap` | Sim | Admin | Consulta parâmetros de configuração do LDAP. |
| `POST` | `/api/config/ldap` | Sim | Admin | Atualiza credenciais e parâmetros do LDAP. |
| `POST` | `/api/config/ldap/test` | Sim | Admin | Testa a conectividade e autenticação com o servidor LDAP. |

---

## 📁 Estrutura de Pastas do Projeto

```text
portal-ramais/
├── Dockerfile                  # Imagem Docker Node.js Alpine
├── docker-compose.yml          # Orquestração do App + MariaDB
├── package.json                # Manifesto de dependências e scripts Node.js
├── server.js                   # Servidor Express, endpoints da API e migrações
├── .env.example                # Modelo de variáveis de ambiente
├── README.md                   # Documentação pública para o GitHub
├── database/
│   └── init.sql                # Estrutura inicial das tabelas
└── public/                     # Single Page Application (SPA)
    ├── index.html              # Estrutura HTML principal e modais
    ├── css/
    │   └── style.css           # Design System, variáveis CSS e responsividade
    └── js/
        ├── api.js              # Cliente HTTP e manipulação de JWT
        ├── app.js              # Orquestrador da aplicação e controle de estado
        ├── cards-view.js       # Renderizador da visualização em cartões por setor
        ├── table.js            # Renderizador da visualização em tabela
        ├── ui.js               # Gerenciador de interface, modais e toasts
        ├── data-normalizer.js  # Normalizador de dados e schema de importação
        └── csv-parser.js       # Parser de CSV com detecção de delimitadores
```

---

## 🤝 Contribuições

Contribuições são muito bem-vindas! Siga os passos abaixo:

1. Faça um **Fork** do projeto.
2. Crie uma branch para a sua feature (`git checkout -b feature/minha-feature`).
3. Faça commit das suas alterações (`git commit -m 'feat: Adiciona nova funcionalidade'`).
4. Envie para a branch principal (`git push origin feature/minha-feature`).
5. Abra um **Pull Request**.