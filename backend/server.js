require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // Novo: Para lidar com uploads
const pdf = require('pdf-extraction'); // Novo: Para ler PDFs
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Cria uma pasta temporária para arquivos grandes
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configura o Multer para salvar no disco, aguentando arquivos de até 50MB
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    cb(null, 'temp-' + Date.now() + '.pdf')
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // Trava de segurança: 50 Megabytes
});

const genAI = new GoogleGenerativeAI(process.env.IA_API_KEY);
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// ==========================================
// CONFIGURAÇÃO DO BANCO FÍSICO (O COFRE)
// ==========================================
const ARQUIVO_BANCO = path.join(__dirname, 'banco_vetorial.json');
let bancoDeConhecimento = [];

// Função para fazer o código "dormir" por X milissegundos
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function inicializarBanco() {
  if (fs.existsSync(ARQUIVO_BANCO)) {
    const dadosRaw = fs.readFileSync(ARQUIVO_BANCO, 'utf-8');
    bancoDeConhecimento = JSON.parse(dadosRaw);
    console.log(`✅ Cofre carregado. Total de fatias de conhecimento: ${bancoDeConhecimento.length}`);
  } else {
    console.log("⚠️ Nenhum cofre encontrado. Começando com uma base vazia.");
  }
}

function salvarNoDisco() {
  fs.writeFileSync(ARQUIVO_BANCO, JSON.stringify(bancoDeConhecimento, null, 2), 'utf-8');
  console.log("💾 Banco de conhecimento atualizado no disco.");
}

inicializarBanco();

function calcularSimilaridade(vecA, vecB) {
  let produtoEscalar = 0, normaA = 0, normaB = 0;
  for (let i = 0; i < vecA.length; i++) {
    produtoEscalar += vecA[i] * vecB[i];
    normaA += vecA[i] * vecA[i];
    normaB += vecB[i] * vecB[i];
  }
  return produtoEscalar / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

// ==========================================
// ROTA 1: INGESTÃO MANUAL (Texto)
// ==========================================
app.post('/api/aprender', async (req, res) => {
  try {
    const { texto, titulo } = req.body;
    const result = await embeddingModel.embedContent(texto);
    
    bancoDeConhecimento.push({
      id: Date.now(),
      titulo: titulo,
      texto: texto,
      vetor: result.embedding.values
    });
    salvarNoDisco();
    res.json({ mensagem: `Documento '${titulo}' aprendido com sucesso!` });
  } catch (error) {
    res.status(500).json({ erro: "Falha ao processar o texto." });
  }
});

// ==========================================
// ROTA 2: A ESTEIRA DE PDFs (Em Segundo Plano)
// ==========================================
app.post('/api/upload-pdf', upload.single('documento'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: "Nenhum ficheiro enviado." });

    // Trava Anti-Duplicação
    const arquivoJaExiste = bancoDeConhecimento.some(doc => doc.titulo.includes(req.file.originalname));
    if (arquivoJaExiste) {
      console.log(`⚠️ Tentativa de duplicação bloqueada: ${req.file.originalname}`);
      return res.status(400).json({ erro: `O documento '${req.file.originalname}' já existe no cofre!` });
    }

    // 🌟 O PULO DO GATO: Responde ao site IMEDIATAMENTE para evitar o Timeout de 2 minutos
    res.json({ mensagem: `⏳ Upload recebido com sucesso! O servidor está fatiando e processando o PDF em segundo plano. Acompanhe o terminal para saber quando terminar.` });

    // --- DAQUI PARA BAIXO, O NODE.JS TRABALHA SOZINHO NOS BASTIDORES ---
    
    // 1. Extrai o texto lendo o arquivo que foi salvo no disco
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdf(dataBuffer);
    const textoCompleto = data.text;

    // Apaga o arquivo temporário do disco imediatamente após ler o texto para economizar espaço
    fs.unlinkSync(req.file.path);

    // 2. Fatiamento
    const pedacos = textoCompleto.split('\n\n').filter(p => p.trim().length > 50);
    let fatiasGuardadas = 0;

    console.log(`📄 PDF recebido e fatiado em ${pedacos.length} partes. Iniciando extração vetorial...`);
    
    // 3. Loop com trava de velocidade (Throttle)
    for (let i = 0; i < pedacos.length; i++) {
      const trecho = pedacos[i].trim();
      console.log(`⏳ Traduzindo fatia ${i + 1} de ${pedacos.length} para a IA...`);
      
      try {
        const result = await embeddingModel.embedContent(trecho);
        
        bancoDeConhecimento.push({
          id: Date.now() + i,
          titulo: `${req.file.originalname} (Parte ${i + 1})`,
          texto: trecho,
          vetor: result.embedding.values
        });
        fatiasGuardadas++;

        // Atraso de 3 segundos
        if (i < pedacos.length - 1) {
          await delay(3000); 
        }

      } catch (err) {
        console.error(`❌ Erro ao processar a fatia ${i + 1}. Detalhe:`, err.message);
        if (err.status === 429) {
          console.log("⚠️ Limite atingido! Salvando o que já foi lido.");
          break; 
        }
      }
    }

    salvarNoDisco();
    console.log(`✅ SUCESSO! PDF '${req.file.originalname}' finalizado e salvo no disco.`);

  } catch (error) {
    console.error("Erro no PDF:", error);
    // Como a resposta já foi enviada ao site, logamos o erro apenas no terminal
  }
});

// ==========================================
// ROTA 3: CONSULTA E AUDITORIA (RAG)
// ==========================================
app.post('/api/perguntar', async (req, res) => {
  try {
    const { pergunta } = req.body;
    let contextoParaIA = "";

    if (bancoDeConhecimento.length > 0) {
      const resultBusca = await embeddingModel.embedContent(pergunta);
      const vetorPergunta = resultBusca.embedding.values;

      const resultadosComScore = bancoDeConhecimento.map(doc => ({
        ...doc,
        score: calcularSimilaridade(vetorPergunta, doc.vetor)
      }));

      // Pega nos 3 trechos mais relevantes (para ter mais contexto do PDF)
      resultadosComScore.sort((a, b) => b.score - a.score);
      const melhoresDocs = resultadosComScore.slice(0, 3);

      if (melhoresDocs[0].score > 0.4) {
        contextoParaIA = "\n\n[INFORMAÇÕES RECUPERADAS DOS SEUS DOCUMENTOS OFICIAIS]:\n";
        melhoresDocs.forEach((doc, index) => {
            if(doc.score > 0.4) {
                contextoParaIA += `\nTrecho ${index + 1} (${doc.titulo}):\n${doc.texto}\n`;
            }
        });
        contextoParaIA += "\nResponda considerando estritamente as regras e informações dos trechos acima como verdade absoluta.";
      }
    }

    const promptFinal = `${pergunta}${contextoParaIA}`;
    const result = await chatModel.generateContent(promptFinal);
    const response = await result.response;
    
    res.json({ resposta: response.text() });
  } catch (error) {
    console.error("Erro na IA:", error);
    res.status(500).json({ erro: "Erro ao consultar a IA." });
  }
});

app.listen(5000, () => console.log("Backend RAG rodando na porta 5000"));