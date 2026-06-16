# 🍞 Fiops Devocional

Iniciativa independente de apoio e divulgação do universo devocional do Pão Diário, com encaminhamento para os canais oficiais de Ministérios Pão Diário Portugal.

🌐 **Domínio:** https://fiopsdevocional.pt

---

## ⚠️ Aviso institucional

Este projeto é uma **iniciativa independente de apoio e divulgação**. Não representa oficialmente os Ministérios Pão Diário.

Foi criado por um apoiante com o objetivo de ajudar na divulgação do conteúdo e facilitar o acesso de interessados em Portugal ao trabalho de [Ministérios Pão Diário Portugal](https://ministeriospaodiario.org/escritorios/portugal/).

---

## 🔗 Links importantes

- 🏛️ Escritório de Portugal: https://ministeriospaodiario.org/escritorios/portugal/
- 🎙️ Podcasts oficiais: https://ministeriospaodiario.org/podcasts/
- 🌐 Domínio do projeto: https://fiopsdevocional.pt
- 📁 GitHub Pages (fallback): https://fiopsptbr4780.github.io/ministerio-pao-diario/

---

## 🎯 Objetivo

Disponibilizar uma página simples, acessível e organizada para facilitar a descoberta de conteúdos devocionais e encaminhar visitantes para os canais oficiais de Ministérios Pão Diário quando aplicável.

---

## 📁 Estrutura

```
ministerio-pao-diario/
├── index.html        ← Página principal
├── mensagens.json    ← ✅ AQUI você adiciona novas mensagens
└── README.md
```

---

## ✏️ Como Adicionar uma Nova Mensagem

1. Abra o arquivo **`mensagens.json`** (clique no arquivo > ícone de lápis ✏️ no GitHub)
2. Copie o bloco abaixo e cole **antes do `]` final**, adicionando uma vírgula após o bloco anterior:

```json
  {
    "id": 6,
    "titulo": "Título da Mensagem",
    "mes": "Mês Ano",
    "icone": "✨",
    "ref": "Livro 00:00",
    "tema": "fe",
    "versiculoTexto": "Texto do versículo aqui.",
    "texto": "Parágrafo 1 da mensagem.\nParágrafo 2 da mensagem.",
    "oracao": "Texto da oração aqui. Amém.",
    "meditacao": "Pergunta ou reflexão para o leitor meditar."
  }
```

**Temas disponíveis:** `fe` · `esperanca` · `coragem` · `paciencia` · `reflexao` · `proposito` · `amor` · `humildade`

---

## ⚙️ Configuração GitHub Pages

Para publicar o site, aceda a **Settings → Pages → Deploy from a branch → main / root** e guarde.

Para o domínio personalizado, insira `fiopsdevocional.pt` no campo **Custom domain** e configure o DNS do seu registrador para apontar para o GitHub Pages.

---

## 📜 Nota final

Todo o conteúdo devocional pertence a **Ministérios Pão Diário**. Este repositório tem fins exclusivamente de divulgação e apoio, sem qualquer fins lucrativos.
