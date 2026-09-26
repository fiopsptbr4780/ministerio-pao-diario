"""
analisar_pasta_ministerio.py
Analisa a pasta 'MINISTÉRIO PÃO DIÁRIO' do Outlook e extrai informações dos e-mails.

Uso:
  py src/analisar_pasta_ministerio.py --account "thiago-leite@outlook.com.br" --limit 20
  py src/analisar_pasta_ministerio.py --account "thiago-leite@outlook.com.br" --limit 50 --output resultados.csv
  py src/analisar_pasta_ministerio.py --account "thiago-leite@outlook.com.br" --stats
"""

import argparse
import csv
import logging
import os
import sys
from datetime import datetime

import win32com.client

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("analisar_pasta_ministerio")

# Nome da pasta alvo (pode ser subpasta da Caixa de Entrada ou pasta raiz)
TARGET_FOLDER_NAME = "MINISTÉRIO PÃO DIÁRIO"

# Colunas do CSV de saída
OUTPUT_COLUMNS = [
    "entry_id",
    "recebido",
    "remetente_nome",
    "remetente_email",
    "assunto",
    "corpo_texto",
    "tem_anexos",
    "anexos_nomes",
    "tamanho_bytes",
    "categorias",
    "nao_lido",
]


# ---------------------------------------------------------------------------
# OUTLOOK COM
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
    return ns.Folders.Item(1)  # Primeira conta como padrão


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
        # IDs e datas
        entry_id = item.EntryID
        try:
            recebido = item.ReceivedTime.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            recebido = ""
        
        # Remetente
        try:
            remetente_nome = item.SenderName or ""
        except Exception:
            remetente_nome = ""
        try:
            remetente_email = item.SenderEmailAddress or ""
        except Exception:
            remetente_email = ""
        
        # Assunto e corpo
        assunto = item.Subject or "(sem assunto)"
        corpo = item.Body or ""
        
        # Anexos
        tem_anexos = False
        anexos_nomes = []
        try:
            if item.Attachments.Count > 0:
                tem_anexos = True
                for att in item.Attachments:
                    anexos_nomes.append(att.FileName)
        except Exception:
            pass
        
        # Tamanho
        try:
            tamanho = item.Size
        except Exception:
            tamanho = 0
        
        # Categorias
        try:
            categorias = item.Categories or ""
        except Exception:
            categorias = ""
        
        # Não lido
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
            "corpo_texto": corpo[:5000],  # Limita a 5000 chars para CSV
            "tem_anexos": "Sim" if tem_anexos else "Não",
            "anexos_nomes": "; ".join(anexos_nomes) if anexos_nomes else "",
            "tamanho_bytes": tamanho,
            "categorias": categorias,
            "nao_lido": "Sim" if nao_lido else "Não",
        }
    except Exception as exc:
        log.error("Erro extraindo dados do e-mail: %s", exc)
        return None


def show_folder_stats(account_name: str | None):
    """Mostra estatísticas da pasta alvo."""
    ns = get_namespace()
    folder = find_target_folder(ns, account_name)
    
    total, unread = get_folder_stats(folder)
    
    # Obtém nome da conta/store de forma segura
    conta_nome = "N/A"
    try:
        if hasattr(folder, 'Store') and folder.Store:
            conta_nome = folder.Store.Name
    except Exception:
        pass
    
    print("\n" + "=" * 70)
    print(f"ESTATÍSTICAS DA PASTA: {TARGET_FOLDER_NAME}")
    print(f"Conta: {conta_nome}")
    print(f"Caminho: {get_folder_path(folder)}")
    print("=" * 70)
    print(f"Total de itens: {total}")
    print(f"Não lidos: {unread}")
    print("=" * 70)


def get_folder_path(folder):
    """Retorna o caminho completo da pasta."""
    path_parts = []
    current = folder
    while current:
        try:
            name = current.Name
            path_parts.append(name)
            # Para quando chega na store/raiz (pastas conhecidas)
            if name in ["Caixa de Entrada", "Inbox", "Top of Information Store", "Personal Folders"]:
                break
            current = current.Parent
        except Exception as e:
            log.debug("Erro ao obter nome do pai: %s", e)
            break
    return " > ".join(reversed(path_parts))


def analyze_emails(limit: int, account_name: str | None, output_file: str | None):
    """Analisa os e-mails da pasta e opcionalmente salva em CSV."""
    ns = get_namespace()
    folder = find_target_folder(ns, account_name)
    
    total, unread = get_folder_stats(folder)
    log.info("Pasta: %s | Total: %d | Não lidos: %d", folder.Name, total, unread)
    
    items = folder.Items
    items.Sort("[ReceivedTime]", True)  # Mais recentes primeiro
    
    rows = []
    processed = 0
    
    for item in items:
        if processed >= limit:
            break
        
        try:
            # Só processa itens de e-mail (Class 43 = MailItem)
            if item.Class != 43:
                continue
            
            data = extract_email_data(item)
            if data:
                rows.append(data)
                processed += 1
                
                if processed % 10 == 0:
                    log.info("Processados: %d/%d", processed, min(limit, total))
                    
        except Exception as exc:
            log.error("Erro processando item: %s", exc)
            continue
    
    log.info("Total processado: %d e-mails", len(rows))
    
    # Mostra resumo no console
    print("\n" + "=" * 80)
    print(f"RESUMO - {len(rows)} e-mails analisados da pasta '{TARGET_FOLDER_NAME}'")
    print("=" * 80)
    
    for i, row in enumerate(rows[:10], 1):  # Mostra primeiros 10
        print(f"\n{i}. {row['recebido']} | {row['remetente_nome']} <{row['remetente_email']}>")
        print(f"   Assunto: {row['assunto'][:80]}")
        print(f"   Anexo: {row['tem_anexos']} | Não lido: {row['nao_lido']}")
        print(f"   Corpo (início): {row['corpo_texto'][:200]}...")
    
    if len(rows) > 10:
        print(f"\n... e mais {len(rows) - 10} e-mails")
    
    # Salva CSV se solicitado
    if output_file:
        with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        log.info("Resultados salvos em: %s", output_file)
        print(f"\n✅ CSV salvo em: {output_file}")
    
    return rows


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=f"Analisa a pasta '{TARGET_FOLDER_NAME}' do Outlook.")
    parser.add_argument("--account", type=str, default=None, help="Nome da conta Outlook")
    parser.add_argument("--limit", type=int, default=20, help="Número máximo de e-mails para analisar (padrão: 20)")
    parser.add_argument("--output", type=str, default=None, help="Arquivo CSV para salvar resultados")
    parser.add_argument("--stats", action="store_true", help="Apenas mostra estatísticas da pasta")
    args = parser.parse_args()

    try:
        if args.stats:
            show_folder_stats(args.account)
        else:
            analyze_emails(args.limit, args.account, args.output)
    except ValueError as exc:
        log.critical("%s", exc)
        sys.exit(1)
    except Exception as exc:
        log.critical("Erro inesperado: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()