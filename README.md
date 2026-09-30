# NEXXATI-Chamados - Ativos - Usuários

Código-fonte para uma instalação nova, sem dados de usuários, inventário, chamados, anexos ou credenciais da instalação original. Inclui frontend React/Vite, API Express/Prisma e código-fonte do agente Windows opcional.

## Requisitos

- Node.js 22 e npm.
- PostgreSQL instalado, com um banco vazio chamado `nexxati` e usuário com permissão para criar tabelas nesse banco.
- PowerShell para os exemplos abaixo. Execute os comandos na pasta extraída.

## 1. Configurar o ambiente

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Edite `backend/.env`:

- `DATABASE_URL`: usuário, senha, servidor e banco PostgreSQL. Caracteres especiais da senha devem ser codificados para URL.
- `JWT_SECRET`, `VAULT_ENCRYPTION_KEY` e `REMOTE_AGENT_TOKEN`: três valores diferentes, gerados localmente. Para gerar cada um, execute:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Não publique os valores gerados. Guarde a chave do cofre com segurança: perder essa chave impede recuperar as senhas criptografadas. Deixe `PASSWORD_RECOVERY_CODE` vazio para manter a recuperação por código desativada. Não há código universal de recuperação neste pacote.

## 2. Instalar a API e criar as tabelas

```powershell
Set-Location backend
npm ci
npx prisma generate
npx prisma migrate deploy
```

Use um banco vazio e exclusivo para esta instalação. Se uma migração falhar, resolva o erro antes de continuar; não execute comandos de reset contra um banco com dados importantes.

## 3. Criar o primeiro administrador

Ainda em `backend`, preencha estas variáveis no seu `.env`:

```dotenv
INITIAL_ADMIN_NAME="Seu nome"
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_EMAIL="seu-email@exemplo.com"
INITIAL_ADMIN_PASSWORD="SUA_SENHA_FORTE_ESCOLHIDA_LOCALMENTE"
```

Substitua os exemplos pelos seus dados. A senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo. O nome de usuário aceita de 3 a 50 caracteres: letras minúsculas, números, ponto, hífen e sublinhado.

```powershell
npm run prisma:bootstrap-admin
npm run dev
```

O script carrega o `.env`, grava a senha com hash e cria um administrador que deverá trocar a senha no primeiro login. Se já existir um administrador, não o substitui. Depois da criação, remova as quatro variáveis `INITIAL_ADMIN_*` do `.env`.

**Não existe login/senha padrão.** Entre usando o usuário ou e-mail escolhido e a senha que você definiu.

## 4. Iniciar a interface

Em outro terminal, a partir da pasta raiz extraída:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Abra http://localhost:5173 e faça o primeiro login. A API usa http://localhost:3333/api; a interface encaminha as requisições automaticamente. Mantenha os dois terminais abertos.

## Verificações e produção

Frontend: `npm run build`. Backend: `npm run check` e `npm run build`, executados nas respectivas pastas.

Os passos anteriores são para uso local. Para produção, configure HTTPS, proxy reverso para `/api` e `/uploads`, publique `frontend/dist`, inicie a API com `npm start` após o build e ajuste `NODE_ENV=production` e `FRONTEND_URL` para a origem pública real. Não use o servidor de desenvolvimento como hospedagem pública.

O agente remoto é opcional: consulte `remote-agent/README.md`, compile seu executável localmente e configure o endereço da sua API e seu próprio token. Nenhum executável ou agente previamente configurado acompanha o pacote.

## Publicar no GitHub

Extraia este ZIP e publique o conteúdo da pasta `nexxati-github-clean`, incluindo o `.gitignore`, e não arquivos da instalação original.

```powershell
git init
git add .
git status --short
```

Confira os arquivos preparados antes do commit: `.env`, `agent.config.json`, uploads, backups, bancos e executáveis não devem aparecer. Depois:

```powershell
git commit -m "Versão inicial do NEXXATI"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

O `.gitignore` evita novos arquivos sensíveis, mas não remove segredos já presentes em históricos Git anteriores. Este pacote não inclui histórico Git. Confira direitos de distribuição e defina uma licença antes de abrir o repositório ao público.

## Sobre esta cópia

Foram excluídos ambientes reais, dados operacionais, backups, uploads, logs, exportações CSV, dependências, builds, histórico Git, configurações pessoais e instaladores configurados. Os modelos `.env.example` contêm somente instruções e valores substituíveis. As credenciais fictícias dos testes não são credenciais de acesso.

Esta cópia desativa a recuperação por código quando não configurada, remove a chave fixa legada do cofre, carrega o ambiente no bootstrap e usa a identidade NEXXATI no lugar de imagens da empresa original. Essas mudanças são específicas do pacote; a instalação em uso não foi alterada.
