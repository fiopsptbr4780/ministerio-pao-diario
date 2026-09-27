"""
gerar_mensagens_do_outlook.py
Adaptação do script analisar_pasta_ministerio.py para gerar novas mensagens
para o arquivo mensagens.json do Ministério Pão Diário.

Uso:
  py gerar_mensagens_do_outlook.py --account "thiago-leite@outlook.com.br" --limit 20
  py gerar_mensagens_do_outlook.py --account "thiago-leite@outlook.com.br" --limit 50 --dry-run
  py gerar_mensagens_do_outlook.py --account "thiago-leite@outlook.com.br" --stats
"""

import argparse
import json
import logging
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

import win32com.client

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("gerar_mensagens_do_outlook")

# Nome da pasta alvo no Outlook
TARGET_FOLDER_NAME = "MINISTÉRIO PÃO DIÁRIO"

# Caminhos dos arquivos do projeto
PROJECT_ROOT = Path(__file__).parent
MENSAGENS_JSON = PROJECT_ROOT / "mensagens.json"
HISTORICO_FILE = PROJECT_ROOT / "historico_de_alteracoes.txt"
BACKUP_DIR = PROJECT_ROOT / "backup"

# Temas válidos para mensagens
TEMAS_VALIDOS = [
    "fe", "esperanca", "coragem", "paciencia", 
    "reflexao", "proposito", "amor", "humildade"
]

# Ícones por tema (sugestão)
ICONE_POR_TEMA = {
    "fe": "✝️",
    "esperanca": "🌟",
    "coragem": "🦁",
    "paciencia": "⏳",
    "reflexao": "🤔",
    "proposito": "🎯",
    "amor": "❤️",
    "humildade": "🙏",
}


# ---------------------------------------------------------------------------
# UTILITÁRIOS DE ARQUIVO
# ---------------------------------------------------------------------------

def ensure_backup_dir():
    """Garante que o diretório de backup existe."""
    BACKUP_DIR.mkdir(exist_ok=True)


def create_backup():
    """Cria backup do mensagens.json com timestamp."""
    ensure_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"mensagens_backup_{timestamp}.json"
    shutil.copy2(MENSAGENS_JSON, backup_file)
    log.info("Backup criado: %s", backup_file)
    return backup_file


def log_change(message: str):
    """Registra alteração no histórico."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(HISTORICO_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {message}\n")


def load_mensagens():
    """Carrega mensagens existentes do JSON."""
    if not MENSAGENS_JSON.exists():
        log.warning("Arquivo mensagens.json não encontrado, criando novo.")
        return []
    
    with open(MENSAGENS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mensagens(mensagens):
    """Salva mensagens no JSON com formatação bonita."""
    with open(MENSAGENS_JSON, "w", encoding="utf-8") as f:
        json.dump(mensagens, f, ensure_ascii=False, indent=2)
    log.info("mensagens.json atualizado com %d mensagens", len(mensagens))


def get_next_id(mensagens):
    """Retorna o próximo ID disponível."""
    if not mensagens:
        return 1
    return max(m.get("id", 0) for m in mensagens) + 1


# ---------------------------------------------------------------------------
# OUTLOOK COM (adaptado do script original)
# ---------------------------------------------------------------------------

def get_namespace():
    outlook = win32com.client.Dispatch("Outlook.Application")
    return outlook.GetNamespace("MAPI")


def get_account_store(ns, account_name: str | None = None):
    """Retorna o store (armazenamento) da conta especificada."""
    if account_name:
        for store in ns.Folders:
            if store.Name == account_name:
                return store
        available = [s.Name for s in ns.Folders]
        raise ValueError(f"Conta '{account_name}' não encontrada. Disponíveis: {available}")
    return ns.Folders.Item(1)


def find_folder_recursive(folder, target_name: str):
    """Busca recursivamente uma pasta pelo nome."""
    if folder.Name.lower() == target_name.lower():
        return folder
    
    for subfolder in folder.Folders:
        result = find_folder_recursive(subfolder, target_name)
        if result:
            return result
    return None


def find_target_folder(ns, account_name: str | None = None):
    """Encontra a pasta MINISTÉRIO PÃO DIÁRIO na conta."""
    store = get_account_store(ns, account_name)
    
    # Primeiro tenta na Caixa de Entrada
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
    
    # Se não achou, busca em toda a store
    folder = find_folder_recursive(store, TARGET_FOLDER_NAME)
    if folder:
        log.info("Pasta encontrada na raiz da conta: %s", folder.Name)
        return folder
    
    raise ValueError(f"Pasta '{TARGET_FOLDER_NAME}' não encontrada na conta '{store.Name}'")


def get_folder_stats(folder):
    """Retorna estatísticas da pasta."""
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
    """Extrai dados relevantes de um item de e-mail."""
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
# TRANSFORMAÇÃO DE E-MAIL PARA MENSAGEM DEVOCIONAL
# ---------------------------------------------------------------------------

def detectar_tema(assunto: str, corpo: str) -> str:
    """Tenta detectar o tema baseado no assunto e corpo do e-mail."""
    texto = (assunto + " " + corpo).lower()
    
    palavras_chave = {
        "fe": ["fé", "crer", "acreditar", "confiar", "fidelidade"],
        "esperanca": ["esperança", "esperar", "futuro", "promessa", "céu"],
        "coragem": ["coragem", "valente", "forte", "guerreiro", "batalha"],
        "paciencia": ["paciência", "esperar", "tempo", "perseverar", "aguardar"],
        "reflexao": ["refletir", "meditar", "pensar", "considerar", "entender"],
        "proposito": ["propósito", "missão", "chamado", "vocação", "plano de deus"],
        "amor": ["amor", "amar", "caridade", "compaixão", "bondade"],
        "humildade": ["humildade", "humilde", "servo", "pequeno", "baixo"],
    }
    
    for tema, palavras in palavras_chave.items():
        for palavra in palavras:
            if palavra in texto:
                return tema
    
    return "reflexao"  # padrão


def extrair_referencia_biblica(texto: str) -> str:
    """Tenta extrair uma referência bíblica do texto."""
    import re
    
    # Padrões comuns de referências bíblicas
    padroes = [
        r'\b\d?\s?[A-Za-zÀ-ÿ]+\s+\d+:\d+(?:-\d+)?\b',  # Ex: João 3:16, 1 Coríntios 13:4-7
        r'\b[A-Za-zÀ-ÿ]+\s+\d+:\d+\b',  # Ex: Romanos 1:14
    ]
    
    for padrao in padroes:
        matches = re.findall(padrao, texto)
        if matches:
            return matches[0].strip()
    
    return ""


def extrair_versiculo(corpo: str, ref: str) -> str:
    """Tenta extrair o texto do versículo do corpo do e-mail."""
    if not ref:
        return ""
    
    # Procura o versículo após a referência
    import re
    # Tenta encontrar o versículo logo após a referência
    padrao = re.escape(ref) + r'[.:]\s*([^.]{20,300})'
    match = re.search(padrao, corpo, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    # Se não achar, tenta pegar as primeiras frases que parecem versículo
    frases = corpo.split('.')
    for frase in frases[:5]:
        if len(frase) > 30 and any(p in frase.lower() for p in ['deus', 'senhor', 'jesus', 'cristo', 'espírito', 'palavra']):
            return frase.strip() + "."
    
    return ""


def gerar_mensagem_do_email(email_data: dict, next_id: int) -> dict | None:
    """Transforma dados de e-mail em estrutura de mensagem devocional."""
    assunto = email_data["assunto"]
    corpo = email_data["corpo_texto"]
    recebido = email_data["recebido"]
    
    # Tenta extrair data do recebido
    try:
        data_obj = datetime.strptime(recebido[:10], "%Y-%m-%d")
        data_str = data_obj.strftime("%Y-%m-%d")
        mes_str = data_obj.strftime("%B %Y").capitalize()
    except Exception:
        data_str = datetime.now().strftime("%Y-%m-%d")
        mes_str = datetime.now().strftime("%B %Y").capitalize()
    
    # Detecta tema
    tema = detectar_tema(assunto, corpo)
    icone = ICONE_POR_TEMA.get(tema, "📖")
    
    # Extrai referência bíblica
    ref = extrair_referencia_biblica(assunto + " " + corpo)
    if not ref:
        ref = "Referência não identificada"
    
    # Extrai versículo
    versiculo_texto = extrair_versiculo(corpo, ref)
    if not versiculo_texto:
        versiculo_texto = "Versículo não identificado automaticamente."
    
    # Usa o corpo do e-mail como texto principal (limitado)
    texto_principal = corpo[:2000] if len(corpo) > 2000 else corpo
    
    # Gera meditação baseada no assunto
    meditacao = f"Como o tema '{assunto}' pode impactar sua caminhada com Deus hoje?"
    
    # Tenta extrair oração se houver
    oracao = ""
    if "oração" in corpo.lower() or "oracao" in corpo.lower() or "amém" in corpo.lower() or "amem" in corpo.lower():
        # Tenta pegar a última parte que parece oração
        partes = corpo.split("\n")
        for parte in reversed(partes):
            if any(p in parte.lower() for p in ["senhor", "deus", "pai", "amém", "amem", "oração", "oracao"]):
                oracao = parte.strip()
                break
    
    if not oracao:
        oracao = f"Senhor, ajuda-me a aplicar a mensagem de '{assunto}' em minha vida. Amém."
    
    return {
        "id": next_id,
        "titulo": assunto[:100],  # Limita título
        "data": data_str,
        "mes": mes_str,
        "icone": icone,
        "ref": ref,
        "tema": tema,
        "versiculoTexto": versiculo_texto,
        "texto": texto_principal,
        "genealogia": [],
        "oracao": oracao,
        "meditacao": meditacao,
        "aplicacao": f"De que maneiras você pode viver a mensagem de '{assunto}' no seu dia a dia?"
    }


# ---------------------------------------------------------------------------
# FUNÇÕES PRINCIPAIS
# ---------------------------------------------------------------------------

def show_folder_stats(account_name: str | None):
    """Mostra estatísticas da pasta alvo."""
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


def processar_emails_para_mensagens(limit: int, account_name: str | None, dry_run: bool = False):
    """Processa e-mails e gera mensagens para o mensagens.json."""
    ns = get_namespace()
    folder = find_target_folder(ns, account_name)
    
    total, unread = get_folder_stats(folder)
    log.info("Pasta: %s | Total: %d | Não lidos: %d", folder.Name, total, unread)
    
    items = folder.Items
    items.Sort("[ReceivedTime]", True)  # Mais recentes primeiro
    
    # Carrega mensagens existentes
    mensagens_existentes = load_mensagens()
    next_id = get_next_id(mensagens_existentes)
    
    # IDs já existentes para evitar duplicatas (baseado no entry_id do Outlook)
    ids_existentes = set()
    for m in mensagens_existentes:
        # Se houver campo entry_id nas mensagens existentes, usa ele
        # Por enquanto, vamos usar título + data como chave aproximada
        chave = f"{m.get('titulo', '')}_{m.get('data', '')}"
        ids_existentes.add(chave)
    
    novas_mensagens = []
    processados = 0
    ignorados = 0
    
    for item in items:
        if processados >= limit:
            break
        
        try:
            if item.Class != 43:  # Só MailItem
                continue
            
            data = extract_email_data(item)
            if not data:
                continue
            
            # Verifica se já existe (chave aproximada)
            chave = f"{data['assunto']}_{data['recebido'][:10]}"
            if chave in ids_existentes:
                ignorados += 1
                continue
            
            mensagem = gerar_mensagem_do_email(data, next_id)
            if mensagem:
                novas_mensagens.append(mensagem)
                next_id += 1
                processados += 1
                
                if processados % 5 == 0:
                    log.info("Processados: %d/%d", processados, limit)
                    
        except Exception as exc:
            log.error("Erro processando item: %s", exc)
            continue
    
    log.info("Novas mensagens geradas: %d | Ignoradas (duplicatas): %d", len(novas_mensagens), ignorados)
    
    if not novas_mensagens:
        print("\n⚠️  Nenhuma nova mensagem para adicionar.")
        return
    
    # Mostra preview
    print("\n" + "=" * 80)
    print(f"PREVIEW - {len(novas_mensagens)} novas mensagens geradas")
    print("=" * 80)
    
    for i, msg in enumerate(novas_mensagens[:5], 1):
        print(f"\n{i}. ID: {msg['id']} | {msg['data']} | {msg['icone']} {msg['titulo'][:60]}")
        print(f"   Tema: {msg['tema']} | Ref: {msg['ref'][:50]}")
        print(f"   Texto: {msg['texto'][:150]}...")
        if msg.get('aplicacao'):
            print(f"   Aplicação: {msg['aplicacao'][:80]}...")
    
    if len(novas_mensagens) > 5:
        print(f"\n... e mais {len(novas_mensagens) - 5} mensagens")
    
    if dry_run:
        print("\n🔍 MODO DRY-RUN: Nenhuma alteração foi salva.")
        return
    
    # Confirmação
    confirm = input(f"\n❓ Deseja adicionar {len(novas_mensagens)} mensagens ao mensagens.json? (s/N): ")
    if confirm.lower() != 's':
        print("Operação cancelada.")
        return
    
    # Cria backup
    backup_file = create_backup()
    
    # Adiciona novas mensagens (no início para aparecerem primeiro)
    mensagens_atualizadas = novas_mensagens + mensagens_existentes
    
    # Salva
    save_mensagens(mensagens_atualizadas)
    
    # Log no histórico
    log_msg = f"Adicionadas {len(novas_mensagens)} novas mensagens do Outlook (backup: {backup_file.name})"
    log_change(log_msg)
    
    print(f"\n✅ {len(novas_mensagens)} mensagens adicionadas com sucesso!")
    print(f"📁 Backup salvo em: {backup_file}")
    print(f"📝 Histórico atualizado: {HISTORICO_FILE}")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=f"Gera mensagens devocionais para mensagens.json a partir da pasta '{TARGET_FOLDER_NAME}' do Outlook."
    )
    parser.add_argument("--account", type=str, default=None, help="Nome da conta Outlook")
    parser.add_argument("--limit", type=int, default=20, help="Número máximo de e-mails para processar (padrão: 20)")
    parser.add_argument("--dry-run", action="store_true", help="Apenas mostra o que seria feito, sem salvar")
    parser.add_argument("--stats", action="store_true", help="Apenas mostra estatísticas da pasta")
    args = parser.parse_args()

    try:
        if args.stats:
            show_folder_stats(args.account)
        else:
            processar_emails_para_mensagens(args.limit, args.account, args.dry_run)
    except ValueError as exc:
        log.critical("%s", exc)
        sys.exit(1)
    except Exception as exc:
        log.critical("Erro inesperado: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()