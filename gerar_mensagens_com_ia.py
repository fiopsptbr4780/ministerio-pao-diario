"""
gerar_mensagens_com_ia.py
Versão aprimorada que usa IA (OpenRouter, NVIDIA NIM, ou Ollama local)
para extrair e estruturar todos os campos do JSON a partir dos e-mails.

Uso:
  py gerar_mensagens_com_ia.py --account "thiago-leite@outlook.com.br" --limit 20 --dry-run
  py gerar_mensagens_com_ia.py --account "thiago-leite@outlook.com.br" --limit 20 --provider openrouter --model "nvidia/nemotron-3-ultra-550b-a55b:free"
  py gerar_mensagens_com_ia.py --account "thiago-leite@outlook.com.br" --limit 20 --provider ollama --model "qwen3:4b-instruct"
  py gerar_mensagens_com_ia.py --account "thiago-leite@outlook.com.br" --stats
"""

import argparse
import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List

import win32com.client

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("gerar_mensagens_com_ia")

TARGET_FOLDER_NAME = "MINISTÉRIO PÃO DIÁRIO"

PROJECT_ROOT = Path(__file__).parent
MENSAGENS_JSON = PROJECT_ROOT / "mensagens.json"
HISTORICO_FILE = PROJECT_ROOT / "historico_de_alteracoes.txt"
BACKUP_DIR = PROJECT_ROOT / "backup"

TEMAS_VALIDOS = [
    "fe", "esperanca", "coragem", "paciencia",
    "reflexao", "proposito", "amor", "humildade",
    "confianca", "salvacao", "sofrimento", "discipulado",
    "transformacao", "gratidao", "perseveranca", "contentamento",
    "sabedoria", "biblia", "oracao"
]

ICONE_POR_TEMA = {
    "fe": "✝️", "esperanca": "🌟", "coragem": "🦁", "paciencia": "⏳",
    "reflexao": "🤔", "proposito": "🎯", "amor": "❤️", "humildade": "🙏",
    "confianca": "🛡️", "salvacao": "🎁", "sofrimento": "💫", "discipulado": "🐑",
    "transformacao": "🌎", "gratidao": "🎉", "perseveranca": "💪", "contentamento": "🌟",
    "sabedoria": "💎", "biblia": "📚", "oracao": "🙏",
}

# Modelos recomendados por provedor
MODELOS_RECOMENDADOS = {
    "openrouter": [
        "nvidia/nemotron-3-ultra-550b-a55b:free",  # Melhor qualidade, 1M contexto
        "nvidia/nemotron-3-super-120b-a12b:free",   # Boa qualidade, 262K contexto
        "google/gemma-4-31b-it:free",               # Bom, 262K contexto
        "qwen/qwen3.8-27b:free",                    # Bom, 262K contexto
        "thinkingmachines/inkling:free",            # 1M contexto
        "stealth/space-bunny-alpha",                # 1M contexto
    ],
    "nim": [
        "nvidia/llama-3.1-nemotron-ultra-253b-v1",  # Melhor NIM
        "meta/llama-3.2-11b-vision-instruct",       # Multimodal
        "nvidia/llama-3.1-nemotron-70b-instruct",   # Boa alternativa
    ],
    "ollama": [
        "qwen3:4b-instruct",        # Rápido, bom para PT
        "qwen2.5:7b-instruct",      # Mais capaz
        "phi4-mini:latest",         # Muito rápido
        "qwen2.5-coder:7b",         # Bom para estruturação
    ]
}


# ---------------------------------------------------------------------------
# PROVEDORES DE IA
# ---------------------------------------------------------------------------

class AIProvider:
    """Classe base para provedores de IA."""
    
    def __init__(self, model: str):
        self.model = model
    
    def parse_email(self, email_data: Dict) -> Optional[Dict]:
        raise NotImplementedError
    
    def _build_prompt(self, email_data: Dict) -> str:
        """Constrói o prompt para o LLM."""
        return f"""
Você é um especialista em transformar e-mails devocionais do "Ministério Pão Diário" em JSON estruturado.

E-MAIL ORIGINAL:
Assunto: {email_data['assunto']}
Data: {email_data['recebido']}
Remetente: {email_data['remetente_nome']} <{email_data['remetente_email']}>
Corpo:
{email_data['corpo_texto'][:8000]}

TAREFA: Extraia e estruture TODOS os campos abaixo em JSON válido.

CAMPOS OBRIGATÓRIOS:
{{
  "titulo": "Título curto e impactante (máx 100 chars)",
  "data": "YYYY-MM-DD",
  "mes": "Mês Ano (ex: Julho 2026)",
  "icone": "Emoji adequado ao tema",
  "ref": "Referência bíblica completa (ex: João 3:16)",
  "tema": "Um de: {', '.join(TEMAS_VALIDOS)}",
  "versiculoTexto": "Texto completo do versículo citado",
  "texto": "Texto devocional completo, bem formatado com parágrafos",
  "oracao": "Oração final (se houver no e-mail, senão gere uma apropriada)",
  "meditacao": "Pergunta reflexiva para meditação pessoal"
}}

REGRAS:
1. Se não houver referência bíblica clara, use a principal do texto
2. O tema DEVE ser um dos válidos listados acima
3. O ícone deve combinar com o tema (use a tabela: {json.dumps(ICONE_POR_TEMA, ensure_ascii=False)})
4. Mantenha o texto original do devocional, apenas formate melhor
5. Se houver oração no e-mail, use ela; senão crie uma coerente
6. A meditação deve ser uma pergunta profunda e pessoal
7. Retorne APENAS o JSON, sem markdown, sem explicações
"""


class OpenRouterProvider(AIProvider):
    """Provedor OpenRouter (requer OPENROUTER_API_KEY)."""
    
    def __init__(self, model: str, api_key: Optional[str] = None):
        super().__init__(model)
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY não configurada")
        try:
            import requests
            self.requests = requests
        except ImportError:
            raise ImportError("Instale requests: pip install requests")
    
    def parse_email(self, email_data: Dict) -> Optional[Dict]:
        prompt = self._build_prompt(email_data)
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/ministerio-pao-diario",
            "X-Title": "Ministério Pão Diário - Gerador de Mensagens"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "Você é um especialista em conteúdo devocional cristão. Responda APENAS com JSON válido."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 4000,
        }
        
        try:
            response = self.requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()
            
            # Limpa possíveis markdown
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            return json.loads(content.strip())
        except Exception as e:
            log.error(f"Erro OpenRouter ({self.model}): {e}")
            return None


class NIMProvider(AIProvider):
    """Provedor NVIDIA NIM (requer NVIDIA_API_KEY)."""
    
    def __init__(self, model: str, api_key: Optional[str] = None):
        super().__init__(model)
        self.api_key = api_key or os.environ.get("NVIDIA_API_KEY")
        if not self.api_key:
            raise ValueError("NVIDIA_API_KEY não configurada")
        try:
            import requests
            self.requests = requests
        except ImportError:
            raise ImportError("Instale requests: pip install requests")
    
    def parse_email(self, email_data: Dict) -> Optional[Dict]:
        prompt = self._build_prompt(email_data)
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "Você é um especialista em conteúdo devocional cristão. Responda APENAS com JSON válido."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 4000,
        }
        
        try:
            response = self.requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()
            
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            return json.loads(content.strip())
        except Exception as e:
            log.error(f"Erro NIM ({self.model}): {e}")
            return None


class OllamaProvider(AIProvider):
    """Provedor Ollama local (não requer API key)."""
    
    def __init__(self, model: str, base_url: str = "http://localhost:11434"):
        super().__init__(model)
        self.base_url = base_url
        try:
            import requests
            self.requests = requests
        except ImportError:
            raise ImportError("Instale requests: pip install requests")
    
    def parse_email(self, email_data: Dict) -> Optional[Dict]:
        prompt = self._build_prompt(email_data)
        
        payload = {
            "model": self.model,
            "prompt": f"<|system|>Você é um especialista em conteúdo devocional cristão. Responda APENAS com JSON válido.<|end|><|user|>{prompt}<|end|><|assistant|>",
            "stream": False,
            "options": {
                "temperature": 0.3,
                "num_predict": 4000,
            }
        }
        
        try:
            response = self.requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            result = response.json()
            content = result.get("response", "").strip()
            
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            return json.loads(content.strip())
        except Exception as e:
            log.error(f"Erro Ollama ({self.model}): {e}")
            return None


def get_ai_provider(provider: str, model: str) -> AIProvider:
    """Factory para criar provedor de IA."""
    provider = provider.lower()
    
    if provider == "openrouter":
        return OpenRouterProvider(model)
    elif provider == "nim":
        return NIMProvider(model)
    elif provider == "ollama":
        return OllamaProvider(model)
    else:
        raise ValueError(f"Provedor desconhecido: {provider}. Use: openrouter, nim, ollama")


# ---------------------------------------------------------------------------
# UTILITÁRIOS DE ARQUIVO
# ---------------------------------------------------------------------------

def ensure_backup_dir():
    BACKUP_DIR.mkdir(exist_ok=True)


def create_backup():
    ensure_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"mensagens_backup_{timestamp}.json"
    shutil.copy2(MENSAGENS_JSON, backup_file)
    log.info("Backup criado: %s", backup_file)
    return backup_file


def log_change(message: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(HISTORICO_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {message}\n")


def load_mensagens():
    if not MENSAGENS_JSON.exists():
        log.warning("Arquivo mensagens.json não encontrado, criando novo.")
        return []
    with open(MENSAGENS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mensagens(mensagens):
    with open(MENSAGENS_JSON, "w", encoding="utf-8") as f:
        json.dump(mensagens, f, ensure_ascii=False, indent=2)
    log.info("mensagens.json atualizado com %d mensagens", len(mensagens))


def get_next_id(mensagens):
    if not mensagens:
        return 1
    return max(m.get("id", 0) for m in mensagens) + 1


def validate_message(msg: Dict, next_id: int) -> Dict:
    """Valida e corrige mensagem gerada pela IA."""
    # Garante ID
    msg["id"] = next_id
    
    # Valida tema
    if msg.get("tema") not in TEMAS_VALIDOS:
        log.warning(f"Tema inválido '{msg.get('tema')}', usando 'reflexao'")
        msg["tema"] = "reflexao"
    
    # Garante ícone compatível
    msg["icone"] = ICONE_POR_TEMA.get(msg["tema"], "📖")
    
    # Garante campos obrigatórios
    for campo in ["titulo", "data", "mes", "ref", "versiculoTexto", "texto", "oracao", "meditacao"]:
        if not msg.get(campo):
            msg[campo] = f"[{campo} não preenchido]"
    
    return msg


# ---------------------------------------------------------------------------
# OUTLOOK COM
# ---------------------------------------------------------------------------

def get_namespace():
    outlook = win32com.client.Dispatch("Outlook.Application")
    return outlook.GetNamespace("MAPI")


def get_account_store(ns, account_name: str | None = None):
    if account_name:
        for store in ns.Folders:
            if store.Name == account_name:
                return store
        available = [s.Name for s in ns.Folders]
        raise ValueError(f"Conta '{account_name}' não encontrada. Disponíveis: {available}")
    return ns.Folders.Item(1)


def find_folder_recursive(folder, target_name: str):
    if folder.Name.lower() == target_name.lower():
        return folder
    for subfolder in folder.Folders:
        result = find_folder_recursive(subfolder, target_name)
        if result:
            return result
    return None


def find_target_folder(ns, account_name: str | None = None):
    store = get_account_store(ns, account_name)
    
    try:
        inbox = store.Folders("Caixa de Entrada")
    except Exception:
        try:
            inbox = store.Folders("Inbox")
        except Exception:
            inbox = None
    
    if inbox:
        folder = find_folder_recursive(inbox, TARGET_FOLDER_NAME)
        if folder:
            log.info("Pasta encontrada na Caixa de Entrada: %s", folder.Name)
            return folder
    
    folder = find_folder_recursive(store, TARGET_FOLDER_NAME)
    if folder:
        log.info("Pasta encontrada na raiz da conta: %s", folder.Name)
        return folder
    
    raise ValueError(f"Pasta '{TARGET_FOLDER_NAME}' não encontrada na conta '{store.Name}'")


def get_folder_stats(folder):
    try:
        total = folder.Items.Count
    except Exception:
        total = -1
    try:
        unread = folder.UnReadItemCount
    except Exception:
        unread = -1
    return total, unread


def extract_email_data(item):
    try:
        entry_id = item.EntryID
        try:
            recebido = item.ReceivedTime.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            recebido = ""
        
        try:
            remetente_nome = item.SenderName or ""
        except Exception:
            remetente_nome = ""
        try:
            remetente_email = item.SenderEmailAddress or ""
        except Exception:
            remetente_email = ""
        
        assunto = item.Subject or "(sem assunto)"
        corpo = item.Body or ""
        
        tem_anexos = False
        anexos_nomes = []
        try:
            if item.Attachments.Count > 0:
                tem_anexos = True
                for att in item.Attachments:
                    anexos_nomes.append(att.FileName)
        except Exception:
            pass
        
        try:
            tamanho = item.Size
        except Exception:
            tamanho = 0
        
        try:
            categorias = item.Categories or ""
        except Exception:
            categorias = ""
        
        try:
            nao_lido = item.UnRead
        except Exception:
            nao_lido = False
        
        return {
            "entry_id": entry_id,
            "recebido": recebido,
            "remetente_nome": remetente_nome,
            "remetente_email": remetente_email,
            "assunto": assunto,
            "corpo_texto": corpo,
            "tem_anexos": tem_anexos,
            "anexos_nomes": anexos_nomes,
            "tamanho_bytes": tamanho,
            "categorias": categorias,
            "nao_lido": nao_lido,
        }
    except Exception as exc:
        log.error("Erro extraindo dados do e-mail: %s", exc)
        return None


# ---------------------------------------------------------------------------
# PROCESSAMENTO PRINCIPAL
# ---------------------------------------------------------------------------

def processar_com_ia(limit: int, account_name: str | None, provider_name: str, model: str, dry_run: bool = False):
    ns = get_namespace()
    folder = find_target_folder(ns, account_name)
    
    total, unread = get_folder_stats(folder)
    log.info("Pasta: %s | Total: %d | Não lidos: %d", folder.Name, total, unread)
    
    # Inicializa provedor de IA
    try:
        ai_provider = get_ai_provider(provider_name, model)
        log.info("Provedor IA: %s | Modelo: %s", provider_name, model)
    except Exception as e:
        log.error("Falha ao inicializar provedor IA: %s", e)
        log.info("Continuando sem IA (extração básica)...")
        ai_provider = None
    
    items = folder.Items
    items.Sort("[ReceivedTime]", True)
    
    mensagens_existentes = load_mensagens()
    next_id = get_next_id(mensagens_existentes)
    
    # NOVO: Determinar a próxima data sequencial baseada na última mensagem existente
    ultima_data = None
    if mensagens_existentes:
        # Ordena por data para encontrar a mais recente
        mensagens_ordenadas = sorted(mensagens_existentes, key=lambda m: m.get("data", ""))
        ultima_data_str = mensagens_ordenadas[-1].get("data", "")
        try:
            ultima_data = datetime.strptime(ultima_data_str, "%Y-%m-%d")
            log.info("Última data no JSON: %s", ultima_data_str)
        except Exception:
            ultima_data = datetime.now()
            log.warning("Não foi possível parsear última data, usando hoje: %s", ultima_data.strftime("%Y-%m-%d"))
    else:
        ultima_data = datetime.now()
        log.info("JSON vazio, iniciando datas a partir de hoje: %s", ultima_data.strftime("%Y-%m-%d"))
    
    # Chaves para evitar duplicatas
    chaves_existentes = set()
    for m in mensagens_existentes:
        chave = f"{m.get('titulo', '')}_{m.get('data', '')}"
        chaves_existentes.add(chave)
    
    novas_mensagens = []
    processados = 0
    ignorados = 0
    erros_ia = 0
    
    for item in items:
        if processados >= limit:
            break
        
        try:
            if item.Class != 43:
                continue
            
            data = extract_email_data(item)
            if not data:
                continue
            
            chave = f"{data['assunto']}_{data['recebido'][:10]}"
            if chave in chaves_existentes:
                ignorados += 1
                continue
            
            # Tenta processar com IA
            mensagem_ia = None
            if ai_provider:
                log.info("Processando com IA: %s...", data['assunto'][:50])
                mensagem_ia = ai_provider.parse_email(data)
                if mensagem_ia:
                    mensagem_ia = validate_message(mensagem_ia, next_id)
                else:
                    erros_ia += 1
                    log.warning("IA falhou, usando extração básica")
            
            # Fallback: extração básica
            if not mensagem_ia:
                mensagem_ia = gerar_mensagem_basica(data, next_id)
            
            # NOVO: Atribuir data sequencial (última data + 1 dia por mensagem)
            ultima_data += timedelta(days=1)
            mensagem_ia["data"] = ultima_data.strftime("%Y-%m-%d")
            mensagem_ia["mes"] = ultima_data.strftime("%B %Y").capitalize()
            # Atualizar ícone baseado no tema (já feito no validate_message, mas garantindo)
            mensagem_ia["icone"] = ICONE_POR_TEMA.get(mensagem_ia.get("tema", "reflexao"), "📖")
            
            novas_mensagens.append(mensagem_ia)
            next_id += 1
            processados += 1
            
            # Rate limiting amigável
            if ai_provider and processados % 3 == 0:
                time.sleep(1)
                
        except Exception as exc:
            log.error("Erro processando item: %s", exc)
            continue
    
    log.info("Novas mensagens: %d | Ignoradas: %d | Erros IA: %d", len(novas_mensagens), ignorados, erros_ia)
    
    if not novas_mensagens:
        print("\n⚠️  Nenhuma nova mensagem para adicionar.")
        return
    
    # Preview
    print("\n" + "=" * 80)
    print(f"PREVIEW - {len(novas_mensagens)} novas mensagens geradas")
    print("=" * 80)
    
    for i, msg in enumerate(novas_mensagens[:5], 1):
        print(f"\n{i}. ID: {msg['id']} | {msg['data']} | {msg['icone']} {msg['titulo'][:60]}")
        print(f"   Tema: {msg['tema']} | Ref: {msg['ref'][:50]}")
        print(f"   Versículo: {msg['versiculoTexto'][:80]}...")
        print(f"   Texto: {msg['texto'][:150]}...")
        print(f"   Oração: {msg['oracao'][:80]}...")
        print(f"   Meditação: {msg['meditacao'][:80]}...")
    
    if len(novas_mensagens) > 5:
        print(f"\n... e mais {len(novas_mensagens) - 5} mensagens")
    
    if dry_run:
        print("\n🔍 MODO DRY-RUN: Nenhuma alteração salva.")
        return
    
    confirm = input(f"\n❓ Adicionar {len(novas_mensagens)} mensagens ao mensagens.json? (s/N): ")
    if confirm.lower() != 's':
        print("Operação cancelada.")
        return
    
    backup_file = create_backup()
    # Combinar e ordenar cronologicamente (antigo → novo)
    mensagens_atualizadas = mensagens_existentes + novas_mensagens
    mensagens_atualizadas.sort(key=lambda m: m.get("data", ""))
    save_mensagens(mensagens_atualizadas)
    
    log_msg = f"Adicionadas {len(novas_mensagens)} mensagens via IA ({provider_name}/{model}) - backup: {backup_file.name}"
    log_change(log_msg)
    
    print(f"\n✅ {len(novas_mensagens)} mensagens adicionadas!")
    print(f"📁 Backup: {backup_file}")
    print(f"📝 Histórico: {HISTORICO_FILE}")


def gerar_mensagem_basica(email_data: dict, next_id: int) -> dict:
    """Fallback: extração básica sem IA (código original)."""
    assunto = email_data["assunto"]
    corpo = email_data["corpo_texto"]
    recebido = email_data["recebido"]
    
    try:
        data_obj = datetime.strptime(recebido[:10], "%Y-%m-%d")
        data_str = data_obj.strftime("%Y-%m-%d")
        mes_str = data_obj.strftime("%B %Y").capitalize()
    except Exception:
        data_str = datetime.now().strftime("%Y-%m-%d")
        mes_str = datetime.now().strftime("%B %Y").capitalize()
    
    # Detecção simples de tema
    tema = "reflexao"
    texto_lower = (assunto + " " + corpo).lower()
    for t in TEMAS_VALIDOS:
        if t in texto_lower:
            tema = t
            break
    
    icone = ICONE_POR_TEMA.get(tema, "📖")
    
    # Extração simples de referência
    import re
    ref_match = re.search(r'\b\d?\s?[A-Za-zÀ-ÿ]+\s+\d+:\d+(?:-\d+)?\b', assunto + " " + corpo)
    ref = ref_match.group(0).strip() if ref_match else "Referência não identificada"
    
    return {
        "id": next_id,
        "titulo": assunto[:100],
        "data": data_str,
        "mes": mes_str,
        "icone": icone,
        "ref": ref,
        "tema": tema,
        "versiculoTexto": "Versículo não identificado automaticamente - revisar manualmente",
        "texto": corpo[:3000],
        "oracao": f"Senhor, ajuda-me a viver a mensagem de '{assunto}'. Amém.",
        "meditacao": f"Como aplicar '{assunto}' na minha vida hoje?"
    }


def show_folder_stats(account_name: str | None):
    ns = get_namespace()
    folder = find_target_folder(ns, account_name)
    total, unread = get_folder_stats(folder)
    
    conta_nome = "N/A"
    try:
        if hasattr(folder, 'Store') and folder.Store:
            conta_nome = folder.Store.Name
    except Exception:
        pass
    
    print("\n" + "=" * 70)
    print(f"ESTATÍSTICAS DA PASTA: {TARGET_FOLDER_NAME}")
    print(f"Conta: {conta_nome}")
    print("=" * 70)
    print(f"Total de itens: {total}")
    print(f"Não lidos: {unread}")
    print("=" * 70)


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=f"Gera mensagens devocionais para mensagens.json usando IA."
    )
    parser.add_argument("--account", type=str, default=None, help="Nome da conta Outlook")
    parser.add_argument("--limit", type=int, default=20, help="Máx e-mails para processar (padrão: 20)")
    parser.add_argument("--provider", type=str, default="ollama", 
                        choices=["openrouter", "nim", "ollama", "none"],
                        help="Provedor de IA (padrão: ollama)")
    parser.add_argument("--model", type=str, default=None, help="Modelo específico (padrão: melhor do provedor)")
    parser.add_argument("--dry-run", action="store_true", help="Apenas preview, não salva")
    parser.add_argument("--stats", action="store_true", help="Apenas estatísticas da pasta")
    parser.add_argument("--list-models", action="store_true", help="Lista modelos recomendados")
    args = parser.parse_args()
    
    if args.list_models:
        print("\n📋 MODELOS RECOMENDADOS POR PROVEDOR:\n")
        for prov, modelos in MODELOS_RECOMENDADOS.items():
            print(f"  {prov.upper()}:")
            for m in modelos:
                print(f"    - {m}")
            print()
        return
    
    # Define modelo padrão se não especificado
    if not args.model and args.provider != "none":
        args.model = MODELOS_RECOMENDADOS.get(args.provider, [""])[0]
        log.info("Usando modelo padrão: %s", args.model)
    
    try:
        if args.stats:
            show_folder_stats(args.account)
        elif args.provider == "none":
            # Modo sem IA - usa script original
            from gerar_mensagens_do_outlook import processar_emails_para_mensagens
            processar_emails_para_mensagens(args.limit, args.account, args.dry_run)
        else:
            processar_com_ia(args.limit, args.account, args.provider, args.model, args.dry_run)
    except ValueError as exc:
        log.critical("%s", exc)
        sys.exit(1)
    except Exception as exc:
        log.critical("Erro inesperado: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()