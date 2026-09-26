"""
testar_todos_openrouter.py
Testa TODOS os modelos OpenRouter disponíveis na sua chave.
Pula para o próximo se não responder em X segundos (timeout configurável).

Uso:
  py testar_todos_openrouter.py --timeout 30
  py testar_todos_openrouter.py --timeout 15 --only-free
  py testar_todos_openrouter.py --timeout 20 --limit 10
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime

import requests

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYS_FILE = os.path.join(BASE_DIR, "ia_keys.local.json")

# ---------------------------------------------------------------------------
# GESTÃO DE CHAVES
# ---------------------------------------------------------------------------

def _load_local_keys() -> dict:
    if not os.path.exists(KEYS_FILE):
        return {}
    try:
        with open(KEYS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_local_key(env_var: str, key: str):
    data = _load_local_keys()
    data[env_var] = key
    with open(KEYS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    try:
        os.chmod(KEYS_FILE, 0o600)
    except Exception:
        pass


def get_openrouter_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        return key
    local = _load_local_keys()
    if "OPENROUTER_API_KEY" in local and local["OPENROUTER_API_KEY"]:
        return local["OPENROUTER_API_KEY"]
    print("\nChave OPENROUTER_API_KEY não encontrada.")
    key = input("Cole aqui a chave de API do OpenRouter: ").strip()
    if not key:
        print("Chave não fornecida. Encerrando.")
        sys.exit(1)
    _save_local_key("OPENROUTER_API_KEY", key)
    print(f"Chave salva em {KEYS_FILE}\n")
    return key


def is_free_openrouter(model: dict) -> bool:
    model_id = model.get("id", "")
    pricing = model.get("pricing", {}) or {}
    try:
        gratis_por_preco = float(pricing.get("prompt", "1")) == 0.0 and float(pricing.get("completion", "1")) == 0.0
    except (TypeError, ValueError):
        gratis_por_preco = False
    return gratis_por_preco or model_id.endswith(":free")


# ---------------------------------------------------------------------------
# FUNÇÕES DE TESTE
# ---------------------------------------------------------------------------

def fetch_all_models(key: str) -> list:
    """Busca todos os modelos disponíveis na chave OpenRouter."""
    headers = {"Authorization": f"Bearer {key}"}
    resp = requests.get(OPENROUTER_MODELS_URL, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json().get("data", [])


def test_model(model_id: str, key: str, timeout: int) -> dict:
    """Testa um modelo específico com timeout."""
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/ministerio-pao-diario",
        "X-Title": "Ministério Pão Diário - Teste Modelos"
    }
    
    # Prompt simples e rápido
    payload = {
        "model": model_id,
        "messages": [
            {"role": "user", "content": "Responda apenas: OK"}
        ],
        "temperature": 0.0,
        "max_tokens": 10,
    }
    
    start = time.time()
    try:
        resp = requests.post(OPENROUTER_CHAT_URL, headers=headers, json=payload, timeout=timeout)
        elapsed = time.time() - start
        
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return {
                "model_id": model_id,
                "status": "OK",
                "latency_s": round(elapsed, 2),
                "response": content[:100],
                "error": "",
                "is_free": "",
                "context_length": "",
                "modality": ""
            }
        elif resp.status_code == 404:
            return {
                "model_id": model_id,
                "status": "NOT_FOUND_404",
                "latency_s": round(elapsed, 2),
                "response": "",
                "error": f"HTTP 404: Modelo não encontrado",
                "is_free": "",
                "context_length": "",
                "modality": ""
            }
        elif resp.status_code == 429:
            return {
                "model_id": model_id,
                "status": "RATE_LIMITED_429",
                "latency_s": round(elapsed, 2),
                "response": "",
                "error": "Rate limited",
                "is_free": "",
                "context_length": "",
                "modality": ""
            }
        else:
            return {
                "model_id": model_id,
                "status": f"HTTP_{resp.status_code}",
                "latency_s": round(elapsed, 2),
                "response": "",
                "error": resp.text[:200],
                "is_free": "",
                "context_length": "",
                "modality": ""
            }
    except requests.exceptions.Timeout:
        elapsed = time.time() - start
        return {
            "model_id": model_id,
            "status": "TIMEOUT",
            "latency_s": round(elapsed, 2),
            "response": "",
            "error": f"Timeout após {timeout}s",
            "is_free": "",
            "context_length": "",
            "modality": ""
        }
    except requests.exceptions.ConnectionError as e:
        elapsed = time.time() - start
        return {
            "model_id": model_id,
            "status": "CONNECTION_ERROR",
            "latency_s": round(elapsed, 2),
            "response": "",
            "error": str(e)[:200],
            "is_free": "",
            "context_length": "",
            "modality": ""
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "model_id": model_id,
            "status": "ERROR",
            "latency_s": round(elapsed, 2),
            "response": "",
            "error": str(e)[:200],
            "is_free": "",
            "context_length": "",
            "modality": ""
        }


def main():
    parser = argparse.ArgumentParser(description="Testa todos os modelos OpenRouter disponíveis com timeout.")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout em segundos por modelo (padrão: 30)")
    parser.add_argument("--limit", type=int, default=0, help="Limite de modelos para testar (0 = todos)")
    parser.add_argument("--only-free", action="store_true", help="Testa apenas modelos gratuitos")
    parser.add_argument("--search", type=str, default=None, help="Filtra modelos que contenham este texto")
    parser.add_argument("--output", type=str, default=None, help="Arquivo CSV de saída (padrão: auto)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay entre testes em segundos (padrão: 1.0)")
    args = parser.parse_args()

    print("=" * 70)
    print("TESTE DE TODOS OS MODELOS OPENROUTER")
    print("=" * 70)
    print(f"Timeout por modelo: {args.timeout}s")
    print(f"Delay entre testes: {args.delay}s")
    if args.limit:
        print(f"Limite: {args.limit} modelos")
    if args.only_free:
        print("Filtro: apenas modelos GRATUITOS")
    if args.search:
        print(f"Busca: '{args.search}'")
    print("=" * 70)

    # Obtém chave
    key = get_openrouter_key()

    # Busca modelos
    print("\n📡 Buscando modelos disponíveis...")
    try:
        all_models = fetch_all_models(key)
        print(f"   Total de modelos na chave: {len(all_models)}")
    except Exception as e:
        print(f"❌ Erro ao buscar modelos: {e}")
        sys.exit(1)

    # Filtra modelos
    models_to_test = []
    for m in all_models:
        model_id = m.get("id", "")
        if args.search and args.search.lower() not in model_id.lower():
            continue
        if args.only_free and not is_free_openrouter(m):
            continue
        models_to_test.append({
            "id": model_id,
            "is_free": "SIM" if is_free_openrouter(m) else "NÃO",
            "context_length": m.get("context_length", ""),
            "modality": (m.get("architecture", {}) or {}).get("modality", "")
        })

    if args.limit:
        models_to_test = models_to_test[:args.limit]

    print(f"   Modelos a testar: {len(models_to_test)}")
    print("-" * 70)

    # Arquivo de saída
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = args.output or f"openrouter_test_results_{timestamp}.csv"

    # Testa cada modelo
    results = []
    ok_count = 0
    timeout_count = 0
    error_count = 0

    for i, model_info in enumerate(models_to_test, 1):
        model_id = model_info["id"]
        print(f"[{i}/{len(models_to_test)}] Testando: {model_id:<55} ", end="", flush=True)
        
        result = test_model(model_id, key, args.timeout)
        result["is_free"] = model_info["is_free"]
        result["context_length"] = model_info["context_length"]
        result["modality"] = model_info["modality"]
        results.append(result)

        # Status visual
        if result["status"] == "OK":
            free_mark = " 🆓" if result["is_free"] == "SIM" else ""
            print(f"✅ OK ({result['latency_s']}s){free_mark}")
            ok_count += 1
        elif result["status"] == "TIMEOUT":
            print(f"⏱️  TIMEOUT ({args.timeout}s)")
            timeout_count += 1
        elif result["status"] == "NOT_FOUND_404":
            print(f"❌ 404 Not Found")
            error_count += 1
        elif result["status"] == "RATE_LIMITED_429":
            print(f"⚠️  Rate Limited (429)")
            error_count += 1
        else:
            print(f"❌ {result['status']}")
            error_count += 1

        # Salva progresso a cada 5 modelos
        if i % 5 == 0:
            with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=["model_id", "status", "latency_s", "response", "error", "is_free", "context_length", "modality"], delimiter=";")
                writer.writeheader()
                writer.writerows(results)

        # Delay entre testes
        if i < len(models_to_test):
            time.sleep(args.delay)

    # Salva resultado final
    with open(output_file, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["model_id", "status", "latency_s", "response", "error", "is_free", "context_length", "modality"], delimiter=";")
        writer.writeheader()
        writer.writerows(results)

    # Resumo
    print("\n" + "=" * 70)
    print("RESUMO FINAL")
    print("=" * 70)
    print(f"Total testados: {len(results)}")
    print(f"✅ Funcionando (OK):     {ok_count}")
    print(f"⏱️  Timeout:             {timeout_count}")
    print(f"❌ Erros (404/outros):   {error_count}")
    print(f"\n📁 Resultados salvos em: {output_file}")

    # Lista modelos funcionando
    working = [r for r in results if r["status"] == "OK"]
    if working:
        print("\n✅ MODELOS FUNCIONANDO:")
        for r in working:
            free_mark = " 🆓" if r["is_free"] == "SIM" else ""
            ctx = f" | ctx: {r['context_length']}" if r['context_length'] else ""
            mod = f" | {r['modality']}" if r['modality'] else ""
            print(f"   - {r['model_id']:<55} ({r['latency_s']}s){free_mark}{ctx}{mod}")

    # Lista timeouts
    timeouts = [r for r in results if r["status"] == "TIMEOUT"]
    if timeouts:
        print(f"\n⏱️  TIMEOUTS ({len(timeouts)}):")
        for r in timeouts[:15]:
            free_mark = " 🆓" if r["is_free"] == "SIM" else ""
            print(f"   - {r['model_id']}{free_mark}")
        if len(timeouts) > 15:
            print(f"   ... e mais {len(timeouts) - 15}")

    # Lista 404s
    not_found = [r for r in results if r["status"] == "NOT_FOUND_404"]
    if not_found:
        print(f"\n❌ NÃO ENCONTRADOS (404) ({len(not_found)}):")
        for r in not_found[:15]:
            print(f"   - {r['model_id']}")
        if len(not_found) > 15:
            print(f"   ... e mais {len(not_found) - 15}")

    # Estatísticas por gratuidade
    free_working = [r for r in working if r["is_free"] == "SIM"]
    paid_working = [r for r in working if r["is_free"] == "NÃO"]
    print(f"\n📊 ESTATÍSTICAS:")
    print(f"   Gratuitos funcionando: {len(free_working)}")
    print(f"   Pagos funcionando:     {len(paid_working)}")


if __name__ == "__main__":
    main()