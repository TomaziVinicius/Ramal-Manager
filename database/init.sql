-- Schema de inicialização do MariaDB para o Gerenciador de Ramais
CREATE DATABASE IF NOT EXISTS `ramais_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ramais_db`;

-- Tabela de Usuários / Administradores
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'admin',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela Principal de Ramais
CREATE TABLE IF NOT EXISTS `ramais` (
    `id` VARCHAR(64) PRIMARY KEY,
    `ramal` VARCHAR(100) NOT NULL,
    `nome` VARCHAR(500) NULL,
    `nomeCompleto` TEXT NULL,
    `localizacao` VARCHAR(500) NULL,
    `andar` VARCHAR(100) NULL,
    `departamento` VARCHAR(500) NULL,
    `setor` VARCHAR(500) NULL,
    `email` VARCHAR(500) NULL,
    `telefone` VARCHAR(255) NULL,
    `status` VARCHAR(100) DEFAULT 'Ativo',
    `cargo` TEXT NULL,
    `empresa` VARCHAR(500) NULL,
    `dispositivo` TEXT NULL,
    `ip` VARCHAR(255) NULL,
    `mac` VARCHAR(255) NULL,
    `observacao` LONGTEXT NULL,
    `extras` LONGTEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_ramal` (`ramal`),
    INDEX `idx_nome` (`nome`(191)),
    INDEX `idx_localizacao` (`localizacao`(191)),
    INDEX `idx_departamento` (`departamento`(191)),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Configurações Gerais do Sistema
CREATE TABLE IF NOT EXISTS `system_config` (
    `config_key` VARCHAR(100) PRIMARY KEY,
    `config_value` LONGTEXT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed inicial de usuário admin padrão (Senha: admin)
INSERT IGNORE INTO `users` (`id`, `username`, `password_hash`, `role`)
VALUES (1, 'admin', '$2a$10$dFB7hRHtb6LGEGIHhuXvP.jZNLHUfd9u1fimnjXB4MsH/JLwGADpK', 'admin');

-- Seed inicial de configurações padrão
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`)
VALUES 
    ('logo', ''),
    ('theme', 'light'),
    ('columns', '["ramal","nome","localizacao","departamento","email","status"]'),
    ('models', '[]'),
    ('custom_fields', '[]'),
    ('ldap_url', 'ldap://10.250.220.200:389'),
    ('ldap_base_dn', 'DC=imi,DC=local'),
    ('ldap_bind_user', 'ramal.mngt@imi.local'),
    ('ldap_bind_password', 'Mudar@123'),
    ('ldap_group_dn', 'CN=GR_RAMAL_MNGT,OU=Grupos,OU=T.I,DC=imi,DC=local'),
    ('ldap_enabled', 'true');
