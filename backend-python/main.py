import os
import json
import time
import math
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai 
from google.genai import types 
import PyPDF2
import numpy as np

# Carrega as configurações
load_dotenv()

# Inicialização da IA
client = genai.Client(api_key=os.getenv("IA_API_KEY"))
EMBEDDING_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-2.0-flash"
ARQUIVO_BANCO = 'banco_vetorial.json'

app = FastAPI(title="Motor de Auditoria IA (Python)")

# Configuração de CORS para o React
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
    # O NumPy transforma as listas de números em matrizes hiper-rápidas
    vetor_a = np.array(v1)
    vetor_b = np.array(v2)
    
    # Cálculo de Similaridade de Cosseno ultrarrápido
    dot_product = np.dot(vetor_a, vetor_b)
    norm_a = np.linalg.norm(vetor_a)
    norm_b = np.linalg.norm(vetor_b)
    
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot_product / (norm_a * norm_b)

# --- LÓGICA DO TRATOR DE PDF ---
def processar_pdf_background(caminho_arquivo: str, nome_original: str):
    print(f"🚜 Processando: {nome_original}")
    banco = carregar_cofre()
    
    try:
        texto_completo = ""
        with open(caminho_arquivo, 'rb') as f:
            leitor = PyPDF2.PdfReader(f)
            for pagina in leitor.pages:
                texto_completo += (pagina.extract_text() or "") + "\n\n"
        
        pedacos = [p.strip() for p in texto_completo.split('\n\n') if len(p.strip()) > 50]
        
        for i, trecho in enumerate(pedacos):
            titulo_fatia = f"{nome_original} (Parte {i + 1})"
            
            # Trava inteligente (pula se já existir)
            if any(doc.get('titulo') == titulo_fatia for doc in banco):
                continue
            
            try:
                res = client.models.embed_content(model=EMBEDDING_MODEL, contents=trecho)
                banco.append({
                    "id": int(time.time() * 1000) + i,
                    "titulo": titulo_fatia,
                    "texto": trecho,
                    "vetor": res.embeddings[0].values
                })
                # Respeita o limite de cota da API gratuita
                time.sleep(2) 
            except Exception as e:
                print(f"❌ Erro na fatia {i}: {e}")
                break
        
        salvar_cofre(banco)
        print(f"✅ {nome_original} integrado ao cofre.")
    finally:
        if os.path.exists(caminho_arquivo):
            os.remove(caminho_arquivo)

# --- ROTAS DA API ---

@app.get("/api/status")
async def get_status():
    banco = carregar_cofre()
    documentos = list(set([doc['titulo'].split(' (Parte')[0] for doc in banco]))
    return {
        "fatias_totais": len(banco),
        "documentos_processados": documentos
    }

@app.post("/api/upload-pdf")
async def upload_pdf(background_tasks: BackgroundTasks, documento: UploadFile = File(...)):
    caminho_temp = f"temp_{documento.filename}"
    with open(caminho_temp, "wb") as buffer:
        buffer.write(await documento.read())
    
    background_tasks.add_task(processar_pdf_background, caminho_temp, documento.filename)
    return {"mensagem": f"🚜 O trator iniciou a leitura de {documento.filename} em segundo plano."}

@app.post("/api/chat")
async def chat_inteligente(request: PerguntaRequest):
    banco = carregar_cofre()
    if not banco:
        raise HTTPException(status_code=404, detail="Cofre vazio.")

    # 1. Vetoriza pergunta
    res_vetor = client.models.embed_content(model=EMBEDDING_MODEL, contents=request.mensagem)
    v_query = res_vetor.embeddings[0].values

    # 2. Busca Semântica de Alta Precisão
    scores = []
    NOTA_DE_CORTE = 0.65 # Ajuste isso: 0.60 (mais brando) a 0.75 (super rigoroso)

    for doc in banco:
        sim = float(calcular_similaridade(v_query, doc['vetor']))
        
        # A TRAVA DE ALUCINAÇÃO: Só entra se for realmente relevante
        if sim >= NOTA_DE_CORTE:
            scores.append({"texto": doc['texto'], "fonte": doc['titulo'], "sim": sim})
    
    # Se nenhum parágrafo do documento atingiu a nota de corte
    if len(scores) == 0:
        return {
            "resposta": "Não encontrei nenhuma evidência nos documentos carregados para responder a esta pergunta com segurança. Certifique-se de que o documento aborda este tema.",
            "referencias": []
        }

    # Pega os 4 melhores que PASSARAM na nota de corte
    top_contextos = sorted(scores, key=lambda x: x['sim'], reverse=True)[:4]
    texto_contexto = "\n\n".join([f"FONTE: {c['fonte']}\nTRECHO: {c['texto']}" for c in top_contextos])

    # 3. O Prompt de Ferro (Rastreabilidade)
    prompt_sistema = f"""Você é um Auditor IA altamente rigoroso. 
    Use APENAS o contexto abaixo para responder. 
    REGRA INEGOCIÁVEL: Toda afirmação, número ou regra que você escrever DEVE terminar com a citação exata da fonte usada, no formato exato: [Fonte: NOME_DA_FONTE].
    Exemplo de resposta correta: O município deve aplicar 25% na educação [Fonte: Lei_Diretrizes.pdf (Parte 4)].
    Se a informação não estiver no contexto, responda que não encontrou na base.

    CONTEXTO:
    {texto_contexto}
    """
    
    # 4. Gera a resposta final fundamentada
    try:
        resposta_ia = client.models.generate_content(
            model=CHAT_MODEL,
            contents=request.mensagem,
            config=types.GenerateContentConfig(
                system_instruction=prompt_sistema,
            )
        )
    except Exception as e:
        # Se for erro 429 (Cota excedida), avisamos o React
        if "429" in str(e):
            raise HTTPException(status_code=429, detail="Limite de consultas do Google atingido. Por favor, aguarde 1 minuto e tente novamente.")
        # Se for outro erro, mostramos no terminal e damos erro genérico
        print(f"Erro na IA: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao consultar a IA.")

    # 4. Retorna a resposta E os textos originais completos
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