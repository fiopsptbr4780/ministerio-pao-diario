# 📖 Ministério Pão Diário

Aplicação web de mensagens devocionais com design elegante e navegação intuitiva.

🔗 **Acesso ao site:** https://fiopsptbr4780.github.io/ministerio-pao-diario/

---

## 📁 Estrutura

```
ministerio-pao-diario/
├── index.html        ← Página principal (não editar)
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
    "versiculoTexto": "Texto do versículo bíblico completo aqui.",
    "texto": "Primeiro parágrafo da mensagem.\n\nSegundo parágrafo da mensagem.",
    "oracao": "Texto da oração (opcional).",
    "meditacao": "Pergunta ou reflexão do dia (opcional)."
  }
```

3. Clique em **"Commit changes"** — a mensagem aparece automaticamente no site!

---

## 🎨 Temas Disponíveis (campo `tema`)

| Valor | Cor | Uso sugerido |
|-------|-----|--------------|
| `fe` | Amarelo | Fé, confiança |
| `esperanca` | Azul claro | Esperança, promessas |
| `coragem` | Vermelho suave | Coragem, perseverança |
| `paciencia` | Verde | Paciência, crescimento |
| `reflexao` | Roxo | Reflexão, meditação |
| `proposito` | Laranja | Propósito, chamado |
| `amor` | Rosa | Amor, relacionamentos |
| `humildade` | Verde escuro | Humildade, serviço |

---

## 🚀 Ativar GitHub Pages

1. Acesse **Settings** do repositório
2. Clique em **Pages** (menu lateral)
3. Em *Source*, selecione **Deploy from a branch**
4. Escolha branch **main** e pasta **/ (root)**
5. Clique **Save** — em 1-2 minutos o site estará online!
