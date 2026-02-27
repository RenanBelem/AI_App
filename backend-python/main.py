import os
import json
import time
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai
import PyPDF2

# Carrega as variáveis de ambiente (seu .env)
load_dotenv()

# Configuração da IA
genai.configure(api_key=os.getenv("IA_API_KEY"))
embedding_model = "models/embedding-001"

app = FastAPI(title="API de Auditoria RAG")

# Configuração de CORS (Para o React conseguir conversar com o Python)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Ajuste depois para a URL do seu frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ARQUIVO_BANCO = 'banco_vetorial.json'

def carregar_cofre():
    if os.path.exists(ARQUIVO_BANCO):
        with open(ARQUIVO_BANCO, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def salvar_cofre(dados):
    with open(ARQUIVO_BANCO, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

# ==========================================
# O "Trator" de Processamento (Roda nos bastidores)
# ==========================================
def processar_pdf_background(caminho_arquivo: str, nome_original: str):
    print(f"🚜 Iniciando processamento em segundo plano de: {nome_original}")
    banco_de_conhecimento = carregar_cofre()
    
    try:
        texto_completo = ""
        # 1. Extração do PDF
        with open(caminho_arquivo, 'rb') as arquivo_pdf:
            leitor = PyPDF2.PdfReader(arquivo_pdf)
            for pagina in leitor.pages:
                texto_pagina = pagina.extract_text()
                if texto_pagina:
                    texto_completo += texto_pagina + "\n\n"
        
        # 2. Fatiamento simples (dividindo por parágrafos duplos)
        pedacos = [p.strip() for p in texto_completo.split('\n\n') if len(p.strip()) > 50]
        print(f"🔪 PDF fatiado em {len(pedacos)} partes.")

        # 3. Loop de processamento com trava inteligente
        for i, trecho in enumerate(pedacos):
            titulo_fatia = f"{nome_original} (Parte {i + 1})"
            
            # Trava anti-duplicação da fatia
            if any(doc.get('titulo') == titulo_fatia for doc in banco_de_conhecimento):
                print(f"⏩ Fatia {i + 1} já existe. Pulando...")
                continue
            
            print(f"⏳ Traduzindo fatia {i + 1}/{len(pedacos)} para IA...")
            
            try:
                # Chamada para a API do Gemini no Python
                result = genai.embed_content(
                    model=embedding_model,
                    content=trecho,
                    task_type="retrieval_document"
                )
                
                banco_de_conhecimento.append({
                    "id": int(time.time() * 1000) + i,
                    "titulo": titulo_fatia,
                    "texto": trecho,
                    "vetor": result['embedding']
                })
                
                # O Throttle (Espera 3 segundos)
                if i < len(pedacos) - 1:
                    time.sleep(3)
                    
            except Exception as e:
                print(f"❌ Erro na fatia {i + 1}: {e}")
                break # Para se atingir o limite de cota
                
        # Salva o resultado final e limpa o arquivo temporário
        salvar_cofre(banco_de_conhecimento)
        os.remove(caminho_arquivo)
        print(f"✅ Arquivo {nome_original} finalizado e salvo no disco.")

    except Exception as e:
        print(f"Erro geral ao processar o PDF: {e}")

# ==========================================
# ROTA: Recebimento do Upload
# ==========================================
@app.post("/api/upload-pdf")
async def upload_pdf(background_tasks: BackgroundTasks, documento: UploadFile = File(...)):
    banco_de_conhecimento = carregar_cofre()
    
    # Trava Anti-Duplicação do Arquivo Inteiro
    if any(documento.filename in doc.get('titulo', '') for doc in banco_de_conhecimento):
         raise HTTPException(status_code=400, detail=f"O documento '{documento.filename}' já existe no cofre!")

    # Salva o arquivo temporariamente no disco (Igual fizemos com o diskStorage)
    caminho_temp = f"temp_{documento.filename}"
    with open(caminho_temp, "wb") as buffer:
        buffer.write(await documento.read())
    
    # Manda a função pesada rodar nos bastidores
    background_tasks.add_task(processar_pdf_background, caminho_temp, documento.filename)
    
    # Responde imediatamente para o Frontend do React
    return {"mensagem": "⏳ Upload recebido com sucesso! O FastAPI está processando em segundo plano."}