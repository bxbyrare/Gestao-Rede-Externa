# 📡 Gestão Rede Externa

> Plataforma interna de gestão de campo para engenharia e operações de rede — pessoas, veículos, eventos, indicadores e projetos em um único painel.

---

### 📌 Sobre o projeto

**Gestão Rede Externa** é um sistema de gestão operacional construído para uma equipe de campo de telecom, cobrindo desde o cadastro de técnicos e veículos até o acompanhamento geográfico de eventos de rede em tempo real. O sistema nasceu como uma aplicação server-rendered e está em processo de modernização progressiva para uma **SPA em React**, servida pelo próprio backend Flask como um único serviço em produção.

O projeto lida com dados operacionais sensíveis de uma equipe real (técnicos, veículos, ocorrências de rede), então recebeu um endurecimento de segurança específico — CSP restritivo por tipo de recurso, sessão via cookie httpOnly, controle de acesso por papel (`Coordenador`/`Supervisor`/`Técnico`/`Auxiliar`) e rotas-isca para detectar tentativas de acesso indevido.

### 🛠️ Tecnologias utilizadas

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chart.js&logoColor=white)

### ✨ Funcionalidades

- 👷 Cadastro completo de técnicos e terceiros (documentos, uniformes, equipamentos, login TOA)
- 🚐 Gestão de frota de veículos (equipamentos embarcados, condutores por turno, responsável)
- 🗺️ Mapa de eventos de rede em tempo real (Leaflet), com filtros por área, tipo de evento, mês e ano
- ⭐ Favoritos com contagem de acessos para os sistemas e portais mais usados no dia a dia da operação
- 📊 Avaliação técnica de colaboradores (comportamento, produtividade, KPI técnico, processos)
- 📦 Controle de inventário físico por categoria
- 🔐 Gerenciamento de contas de acesso com papéis e permissões
- 🔍 Buscador de falhas (RAL/REC/HFC/GPON) com importação e exportação em massa
- 📁 Projetos, formulários dinâmicos, escalas de trabalho e rotas de campo com upload de arquivos
- 🛡️ CSP restritivo por tipo de recurso, autenticação por sessão, rotas-isca contra scanners automatizados

### 🎯 Objetivo

Substituir controles manuais e planilhas dispersas por um painel único onde a operação de campo — técnicos, supervisores e coordenadores — consegue cadastrar, consultar e acompanhar tudo o que envolve a rede externa, com um nível de acabamento visual e de segurança compatível com uma ferramenta corporativa de verdade, não uma planilha "remendada".

### 📚 Aprendizados

Durante o desenvolvimento foram aplicados conceitos como:

- Migração incremental de uma aplicação server-rendered (Flask + Jinja2) para uma SPA em React, mantendo os dois convivendo até a troca completa
- Hardening de Content-Security-Policy por tipo de recurso (script/estilo/fonte/imagem/conexão) em vez de uma política genérica
- Mapas interativos com grandes volumes de dados geográficos reais (~5 mil marcadores) usando React-Leaflet
- Controle de acesso por papel em múltiplos níveis (Coordenador, Supervisor, Técnico, Auxiliar)
- Depuração de encoding (mojibake) em dados legados armazenados incorretamente no banco
- Deploy de SPA + API como um único serviço, com fallback de rota no backend para o roteamento client-side

---

<div align="center">

Desenvolvido por **bxbyrare**.

</div>

---

## Documentação técnica

### Stack

- **Backend**: Python + Flask, `psycopg2` + PostgreSQL, autenticação por sessão (cookie httpOnly)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router v7, em `frontend/`
- Em produção, o Flask serve o build estático do React (`frontend/dist`) como um único serviço — sem deploy separado de frontend e backend

### Rodando localmente

Pré-requisitos: Python 3.10+, Node.js 20+ e um PostgreSQL acessível.

Backend:

```bash
pip install -r requirements.txt
python app.py   # http://localhost:5000
```

Frontend (build de produção servido pelo próprio Flask):

```bash
cd frontend
npm install
npm run build   # gera frontend/dist, servido pelo Flask em /
```

Para desenvolver o frontend com hot-reload, use o servidor de dev do Vite em paralelo (ele faz proxy de `/api` e `/uploads` para o Flask em `localhost:5000`):

```bash
cd frontend
npm run dev      # http://localhost:5173
```

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` / credenciais do PostgreSQL | sim | Conexão com o banco de dados |
| `SECRET_KEY` | sim (produção) | Chave de assinatura da sessão Flask |

### Estrutura do projeto

```
app.py                  # Flask: rotas de API, autenticação, SPA fallback
templates/, static/     # UI legada (Jinja2 + vanilla JS), em migração
frontend/               # SPA em React (Vite + TypeScript + Tailwind)
  src/
    api/                # cliente HTTP e tipos
    state/              # contexto de autenticação
    components/         # layout, modais, componentes de UI
    pages/              # um módulo por página (Favoritos, Pessoas, Mapa de Eventos, ...)
  dist/                 # build de produção, servido pelo Flask (gerado, não versionado)
```

### Módulos migrados para React

Favoritos, Pessoas, Veículos, Mapa de Eventos, Inventário, Gerenciamento (usuários) e Avaliação já rodam na nova SPA. Os módulos restantes (Área de Trabalho, Buscador, Financeiro, Escala, Projetos, Formulários, Rotas, Indicadores) ainda estão na interface legada e seguem em migração incremental.
