# Dockerfile otimizado para produção Node.js
FROM node:20-alpine

# Definir diretório de trabalho
WORKDIR /app

# Copiar manifestos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm install --omit=dev --no-audit --no-fund

# Copiar todo o código-fonte da aplicação
COPY . .

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Expor a porta da aplicação
EXPOSE 3000

# Comando de inicialização
CMD ["node", "server.js"]
