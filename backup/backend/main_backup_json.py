
#ARQUIVO LEGADO, ANTIGA LÓGICA DE PDF EM LOTE, MANTIDO PARA REFERÊNCIA HISTÓRICA. A VERSÃO ATUAL ESTÁ EM main.py

import os
import json
import time
import math
from typing import List
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai 
from google.genai import types 
import fitz  
import numpy as np
import glob

load_dotenv()

client = genai.Client(api_key=os.getenv("IA_API_KEY"))
EMBEDDING_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-2.5-flash"
ARQUIVO_BANCO = 'banco_vetorial.json'

app = FastAPI(title="Motor de Auditoria IA (Python)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PerguntaRequest(BaseModel):
    mensagem: str

# --- UTILITÁRIOS DE DADOS ---
def carregar_cofre():
    if os.path.exists(ARQUIVO_BANCO):
        with open(ARQUIVO_BANCO, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def salvar_cofre(dados):
    with open(ARQUIVO_BANCO, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

def calcular_similaridade(v1, v2):
    vetor_a = np.array(v1)
    vetor_b = np.array(v2)
    
    dot_product = np.dot(vetor_a, vetor_b)
    norm_a = np.linalg.norm(vetor_a)
    norm_b = np.linalg.norm(vetor_b)
    
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot_product / (norm_a * norm_b)

# --- LÓGICA DE PDF EM LOTE ---
def processar_pdf_background(caminho_arquivo: str, nome_original: str, apagar_arquivo: bool = True):
    print(f"\n🚜 Iniciando a leitura de: {nome_original}")
    banco = carregar_cofre()
    
    try:
        texto_completo = ""
        try:
            doc = fitz.open(caminho_arquivo)
            for pagina in doc:
                texto = pagina.get_text()
                if texto:
                    texto_completo += texto + "\n\n"
            doc.close()
        except Exception as e_pdf:
            print(f"Pulo de Segurança: O PDF '{nome_original}' não pôde ser lido. Erro: {e_pdf}")
            return

        if not texto_completo.strip():
             print(f"O PDF '{nome_original}' parece ser uma imagem escaneada (sem texto). Pulando...")
             return
             
        pedacos = [p.strip() for p in texto_completo.split('\n\n') if len(p.strip()) > 50]
        print(f"🔪 PDF fatiado em {len(pedacos)} partes. Extraindo vetores...")
        
        novas_fatias = 0
        for i, trecho in enumerate(pedacos):
            titulo_fatia = f"{nome_original} (Parte {i + 1})"
            
            if any(doc.get('titulo') == titulo_fatia for doc in banco):
                print(f"Fatia {i+1}/{len(pedacos)} já existe. Pulando...")
                continue
            
            novas_fatias += 1
            print(f"Traduzindo fatia {i+1} de {len(pedacos)} para a IA...")
            
            sucesso = False
            tentativas = 0
            
            while not sucesso and tentativas < 5:
                try:
                    res = client.models.embed_content(model=EMBEDDING_MODEL, contents=trecho)
                    
                    banco.append({
                        "id": int(time.time() * 1000) + i,
                        "titulo": titulo_fatia,
                        "texto": trecho,
                        "vetor": res.embeddings[0].values
                    })
                    
                    print(f"✔️ Fatia {i+1} salva com sucesso.")
                    sucesso = True
                    time.sleep(5) 
                    
                except Exception as e:
                    erro_msg = str(e)
                    if "429" in erro_msg or "Quota exceeded" in erro_msg:
                        tentativas += 1
                        tempo_espera = 20 * tentativas 
                        print(f"Google pediu calma. O trator vai pausar por {tempo_espera}s...")
                        time.sleep(tempo_espera)
                    else:
                        print(f"Erro crítico na fatia {i+1}: {e}")
                        break 
            
        salvar_cofre(banco)
        if novas_fatias > 0:
            print(f"SUCESSO! {nome_original} integrado. {novas_fatias} fatias aprendidas.")
        else:
            print(f"{nome_original} já era totalmente conhecido pelo cofre.")
    
    finally:
        if apagar_arquivo and os.path.exists(caminho_arquivo):
            os.remove(caminho_arquivo)

def ler_pasta_background():
    PASTA = "meus_documentos"
    if not os.path.exists(PASTA):
        print(f"Pasta '{PASTA}' não encontrada. Crie a pasta e coloque os PDFs lá.")
        return

    arquivos = glob.glob(f"{PASTA}/*.pdf")
    if not arquivos:
        print(f"Nenhum PDF encontrado na pasta '{PASTA}'.")
        return

    print(f"Encontrados {len(arquivos)} documentos para processamento em lote.")
    for caminho in arquivos:
        nome_arquivo = os.path.basename(caminho)
        # O administrador comanda via terminal, os arquivos não são deletados
        processar_pdf_background(caminho, nome_arquivo, apagar_arquivo=False)
        
    print("Processamento em lote finalizado!")

# --- ROTAS DA API ---

@app.get("/api/status")
async def get_status():
    banco = carregar_cofre()
    documentos = list(set([doc['titulo'].split(' (Parte')[0] for doc in banco]))
    return {
        "fatias_totais": len(banco),
        "documentos_processados": documentos
    }

@app.post("/api/ingestar-pasta")
async def ingestar_pasta(background_tasks: BackgroundTasks):
    background_tasks.add_task(ler_pasta_background)
    return {"mensagem": "O trator foi ligado! Ele vai ler todos os PDFs da pasta 'meus_documentos' em segundo plano."}

@app.post("/api/chat")
async def chat_inteligente(request: PerguntaRequest):
    banco = carregar_cofre()
    if not banco:
        raise HTTPException(status_code=404, detail="A base de documentos está vazia. Avise o administrador.")

    res_vetor = client.models.embed_content(model=EMBEDDING_MODEL, contents=request.mensagem)
    v_query = res_vetor.embeddings[0].values

    scores = []
    NOTA_DE_CORTE = 0.65 

    for doc in banco:
        sim = float(calcular_similaridade(v_query, doc['vetor']))
        if sim >= NOTA_DE_CORTE:
            scores.append({"texto": doc['texto'], "fonte": doc['titulo'], "sim": sim})
    
    if len(scores) == 0:
        return {
            "resposta": "Não encontrei nenhuma evidência nos documentos carregados para responder a esta pergunta com segurança. Certifique-se de que o documento aborda este tema.",
            "referencias": []
        }

    top_contextos = sorted(scores, key=lambda x: x['sim'], reverse=True)[:4]
    texto_contexto = "\n\n".join([f"FONTE: {c['fonte']}\nTRECHO: {c['texto']}" for c in top_contextos])

    prompt_sistema = f"""Você é um Auditor IA altamente rigoroso. 
    Use APENAS o contexto abaixo para responder. 
    REGRA INEGOCIÁVEL: Toda afirmação, número ou regra que você escrever DEVE terminar com a citação exata da fonte usada, no formato exato: [Fonte: NOME_DA_FONTE].
    Exemplo de resposta correta: O município deve aplicar 25% na educação [Fonte: Lei_Diretrizes.pdf (Parte 4)].
    Se a informação não estiver no contexto, responda que não encontrou na base.

    CONTEXTO:
    {texto_contexto}
    """
    
    try:
        resposta_ia = client.models.generate_content(
            model=CHAT_MODEL,
            contents=request.mensagem,
            config=types.GenerateContentConfig(
                system_instruction=prompt_sistema,
            )
        )
    except Exception as e:
        # --- ADICIONE ESTA LINHA PARA O RAIO-X ---
        print(f"\n🚨 MENSAGEM CRUA DO GOOGLE:\n{repr(e)}\n") 
        
        if "429" in str(e):
            raise HTTPException(status_code=429, detail="Limite de consultas do Google atingido...")

    referencias_completas = [{"fonte": c['fonte'], "texto": c['texto']} for c in top_contextos]

    return {
        "resposta": resposta_ia.text,
        "referencias": referencias_completas
    }

@app.delete("/api/reset")
async def reset_banco():
    if os.path.exists(ARQUIVO_BANCO):
        os.remove(ARQUIVO_BANCO)
        return {"mensagem": "Cofre esvaziado com sucesso!"}
    return {"mensagem": "O cofre já estava vazio."}