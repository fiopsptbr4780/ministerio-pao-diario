# 🍞 Ministério Pão Diário

> Iniciativa independente de apoio e divulgação de conteúdos devocionais, com encaminhamento para os canais oficiais de Ministérios Pão Diário Portugal.

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-ao%20vivo-brightgreen?style=for-the-badge)](https://fiopsptbr4780.github.io/ministerio-pao-diario/)

---

## 🌐 Site

**GitHub Pages:** [https://fiopsptbr4780.github.io/ministerio-pao-diario/](https://fiopsptbr4780.github.io/ministerio-pao-diario/)

---

## ⚠️ Aviso Institucional

Este projeto é uma **iniciativa independente de apoio e divulgação**. Não representa oficialmente os Ministérios Pão Diário.

Foi criado por um apoiante com o objetivo de ajudar na divulgação do conteúdo e facilitar o acesso de interessados em Portugal.

---

## 🔗 Links Oficiais

| Recurso | Link |
|---|---|
| 🏛️ Escritório de Portugal | [ministeriospaodiario.org/escritorios/portugal](https://ministeriospaodiario.org/escritorios/portugal/) |
| 🎙️ Podcasts Oficiais | [ministeriospaodiario.org/podcasts](https://ministeriospaodiario.org/podcasts/) |

---

## 📁 Estrutura do Repositório

```
ministerio-pao-diario/
├── index.html        ← Página principal do site
├── mensagens.json    ← Ficheiro com todas as mensagens devocionais
└── README.md         ← Este ficheiro
```

---

## ✏️ Como Adicionar uma Nova Mensagem

1. Abra o ficheiro **`mensagens.json`** (clique no ficheiro → ícone de lápis ✏️)
2. Cole o bloco abaixo **antes do `]` final**, adicionando uma vírgula após o bloco anterior:

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

## 📜 Nota Final

Todo o conteúdo devocional pertence a **Ministérios Pão Diário**. Este repositório tem fins exclusivamente de divulgação e apoio, sem qualquer fim lucrativo.
