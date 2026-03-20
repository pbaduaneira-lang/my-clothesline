# My Clothesline - Guia de Setup Local

Este guia ajudará você a rodar o projeto no seu computador e acessá-lo pelo celular.

## 1. Pré-requisitos
- **Node.js**: v18 ou superior.
- **PostgreSQL**: Instalado e rodando.

## 2. Configuração do Banco de Dados
1. Crie um banco de dados chamado `clothesline`.
2. Configure seu usuário e senha.

## 3. Configuração do Ambiente
1. Copie `.env.example` para um novo arquivo `.env`.
2. Preencha os campos com suas credenciais do PostgreSQL e Supabase.

## 4. Instalação e Execução
Na raiz do projeto:
```bash
npm install
npm run install-server
npm start
```
Acesse em: `http://localhost:3000`

## 5. Como acessar no Celular
1. Conecte o PC e o Celular no mesmo Wi-Fi.
2. Descubra seu IP (terminal: `ipconfig`).
3. No celular, acesse: `http://SEU_IP_AQUI:3000`
