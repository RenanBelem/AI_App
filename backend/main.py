import os
import time
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai 
from google.genai import types 
import fitz  
import glob
from pinecone import Pinecone # <-- A Nova Biblioteca da Nuvem
import unicodedata

load_dotenv()

# Inicialização do Google Gemini
client = genai.Client(api_key=os.getenv("IA_API_KEY"))
EMBEDDING_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-2.5-flash" # Atualizado para o modelo com cota liberada

# Inicialização do Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
INDEX_NAME = "ai-app"
index = pc.Index(INDEX_NAME)

app = FastAPI(title="Motor de Auditoria IA (Pinecone Edition)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PerguntaRequest(BaseModel):
    mensagem: str

# --- LÓGICA DE PDF EM LOTE (ENVIANDO PARA O PINECONE) ---
def processar_pdf_background(caminho_arquivo: str, nome_original: str, apagar_arquivo: bool = True):
    print(f"\n🚜 Iniciando a leitura de: {nome_original}")
    
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
            print(f"⚠️ Pulo de Segurança: O PDF '{nome_original}' não pôde ser lido. Erro: {e_pdf}")
            return

        if not texto_completo.strip():
             print(f"⚠️ O PDF '{nome_original}' parece ser uma imagem escaneada. Pulando...")
             return
             
        pedacos = [p.strip() for p in texto_completo.split('\n\n') if len(p.strip()) > 50]
        print(f"🔪 PDF fatiado em {len(pedacos)} partes. Iniciando extração e envio para a nuvem...")
        
        lote_para_pinecone = []
        
        for i, trecho in enumerate(pedacos):
            titulo_fatia = f"{nome_original} (Parte {i + 1})"
            # Criamos um ID único para cada fatia no Pinecone
            # Remove acentos e caracteres especiais APENAS para o ID do Pinecone
            id_limpo = ''.join(c for c in unicodedata.normalize('NFD', nome_original) if unicodedata.category(c) != 'Mn')
            id_fatia = f"{id_limpo}_p{i+1}".replace(" ", "_").replace(".pdf", "")
            
            print(f"⏳ Traduzindo fatia {i+1}/{len(pedacos)} para a IA...")
            
            sucesso = False
            tentativas = 0
            
            while not sucesso and tentativas < 5:
                try:
                    res = client.models.embed_content(model=EMBEDDING_MODEL, contents=trecho)
                    
                    # Prepara o pacote para o Pinecone
                    lote_para_pinecone.append({
                        "id": id_fatia,
                        "values": res.embeddings[0].values,
                        "metadata": {"titulo": titulo_fatia, "texto": trecho}
                    })
                    
                    print(f"✔️ Fatia {i+1} processada.")
                    sucesso = True
                    time.sleep(4) # Freio do Google mantido
                    
                except Exception as e:
                    erro_msg = str(e)
                    if "429" in erro_msg or "Quota exceeded" in erro_msg:
                        tentativas += 1
                        tempo_espera = 20 * tentativas 
                        print(f"⚠️ Google pediu calma. Pausando por {tempo_espera}s...")
                        time.sleep(tempo_espera)
                    else:
                        print(f"❌ Erro crítico na fatia {i+1}: {e}")
                        break 
            
            # Envia para a nuvem a cada 10 fatias (para não sobrecarregar a memória)
            if len(lote_para_pinecone) >= 10:
                index.upsert(vectors=lote_para_pinecone)
                lote_para_pinecone = []
                print("☁️ Lote de 10 fatias salvo no Pinecone!")
                
        # Salva o resto que sobrou
        if lote_para_pinecone:
            index.upsert(vectors=lote_para_pinecone)
            print("☁️ Últimas fatias salvas no Pinecone!")
            
        print(f"✅ SUCESSO! {nome_original} 100% integrado à nuvem.")
    
    finally:
        if apagar_arquivo and os.path.exists(caminho_arquivo):
            os.remove(caminho_arquivo)

def ler_pasta_background():
    PASTA = "meus_documentos"
    if not os.path.exists(PASTA):
        print(f"⚠️ Pasta '{PASTA}' não encontrada.")
        return

    arquivos = glob.glob(f"{PASTA}/*.pdf")
    if not arquivos:
        print(f"⚠️ Nenhum PDF encontrado na pasta '{PASTA}'.")
        return

    print(f"📚 Encontrados {len(arquivos)} documentos para processamento em lote.")
    for caminho in arquivos:
        nome_arquivo = os.path.basename(caminho)
        processar_pdf_background(caminho, nome_arquivo, apagar_arquivo=False)
        
    print("🏁 Processamento em lote finalizado!")


# --- ROTAS DA API ---

@app.get("/api/status")
def get_status():
    # Pergunta ao Pinecone quantas fatias existem no total
    status = index.describe_index_stats()
    total_vetores = status.total_vector_count
    
    # O Pinecone não lista documentos únicos facilmente, então usamos um truque visual
    return {
        "fatias_totais": total_vetores,
        "documentos_processados": ["Base Conectada à Nuvem"] if total_vetores > 0 else []
    }

@app.post("/api/ingestar-pasta")
def ingestar_pasta(background_tasks: BackgroundTasks):
    background_tasks.add_task(ler_pasta_background)
    return {"mensagem": "🚜 O trator foi ligado! Ele vai enviar os PDFs para o Pinecone."}

@app.post("/api/chat")
def chat_inteligente(request: PerguntaRequest):
    # 1. Vetoriza pergunta
    try:
        res_vetor = client.models.embed_content(model=EMBEDDING_MODEL, contents=request.mensagem)
        v_query = res_vetor.embeddings[0].values
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao processar a sua pergunta com o Gemini.")

    # 2. Busca Semântica na Nuvem (PINECONE)
    NOTA_DE_CORTE = 0.65 
    resultados = index.query(
        vector=v_query,
        top_k=4, # Traz as 4 melhores da nuvem
        include_metadata=True
    )

    scores = []
    for match in resultados['matches']:
        if match['score'] >= NOTA_DE_CORTE:
            scores.append({
                "texto": match['metadata']['texto'],
                "fonte": match['metadata']['titulo'],
                "sim": match['score']
            })
    
    if len(scores) == 0:
        return {
            "resposta": "Não encontrei nenhuma evidência na base do Pinecone para responder a esta pergunta com segurança.",
            "referencias": []
        }

    # Como já mandamos trazer só as 4 melhores, podemos usar todas que passaram na nota de corte
    texto_contexto = "\n\n".join([f"FONTE: {c['fonte']}\nTRECHO: {c['texto']}" for c in scores])

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
        if "429" in str(e):
            raise HTTPException(status_code=429, detail="Limite de consultas do Google atingido. Aguarde 1 minuto.")
        raise HTTPException(status_code=500, detail="Erro interno ao consultar a IA.")

    referencias_completas = [{"fonte": c['fonte'], "texto": c['texto']} for c in scores]

    return {
        "resposta": resposta_ia.text,
        "referencias": referencias_completas
    }

@app.delete("/api/reset")
def reset_banco():
    # Esvazia todo o banco de dados do Pinecone
    index.delete(delete_all=True)
    return {"mensagem": "Cofre do Pinecone esvaziado com sucesso!"}