require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-extraction');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configuração da IA
const genAI = new GoogleGenerativeAI(process.env.IA_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// Caminhos dos arquivos
const ARQUIVO_BANCO = path.join(__dirname, 'banco_vetorial.json');
const PASTA_DOCUMENTOS = path.join(__dirname, 'meus_documentos');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para carregar o cofre existente
function carregarCofre() {
    if (fs.existsSync(ARQUIVO_BANCO)) {
        return JSON.parse(fs.readFileSync(ARQUIVO_BANCO, 'utf-8'));
    }
    return [];
}

async function iniciarIngestao() {
    console.log("🚜 Iniciando Trator de Ingestão de Dados...");
    
    // Verifica se a pasta existe
    if (!fs.existsSync(PASTA_DOCUMENTOS)) {
        console.log(`❌ A pasta '${PASTA_DOCUMENTOS}' não existe. Crie a pasta e coloque seus PDFs lá.`);
        return;
    }

    // Lê todos os arquivos dentro da pasta
    const arquivos = fs.readdirSync(PASTA_DOCUMENTOS).filter(file => file.endsWith('.pdf'));
    
    if (arquivos.length === 0) {
        console.log("⚠️ Nenhum PDF encontrado na pasta 'meus_documentos'.");
        return;
    }

    let bancoDeConhecimento = carregarCofre();
    console.log(`📚 Cofre atual tem ${bancoDeConhecimento.length} fatias.`);
    console.log(`📁 Encontrados ${arquivos.length} PDFs para processar.`);

    // Loop pelos arquivos (Foi essa parte que havia sumido)
    for (const nomeArquivo of arquivos) {
        console.log(`\n========================================`);
        console.log(`📖 Abrindo: ${nomeArquivo}`);
        
        const caminhoPDF = path.join(PASTA_DOCUMENTOS, nomeArquivo);
        
        try {
            // Lendo e fatiando o PDF atual
            const dataBuffer = fs.readFileSync(caminhoPDF);
            const data = await pdf(dataBuffer);
            const textoCompleto = data.text;

            const pedacos = textoCompleto.split('\n\n').filter(p => p.trim().length > 50);
            console.log(`🔪 Fatiado em ${pedacos.length} partes. Traduzindo para IA...`);

            // Loop das fatias
            for (let i = 0; i < pedacos.length; i++) {
                const trecho = pedacos[i].trim();
                const tituloFatia = `${nomeArquivo} (Parte ${i + 1})`; // O nome exato desta parte
                
                // NOVA TRAVA INTELIGENTE: Verifica se ESTA fatia específica já foi salva antes
                const fatiaJaExiste = bancoDeConhecimento.some(doc => doc.titulo === tituloFatia);
                
                if (fatiaJaExiste) {
                    process.stdout.write(`\r⏩ Fatia ${i + 1}/${pedacos.length} já existe no cofre. Pulando...`);
                    continue; // Pula o processamento do Google e vai para o próximo i
                }
                
                process.stdout.write(`\r⏳ Fatias processadas: ${i + 1}/${pedacos.length}`);
                
                try {
                    const result = await embeddingModel.embedContent(trecho);
                    
                    bancoDeConhecimento.push({
                        id: Date.now() + i,
                        titulo: tituloFatia,
                        texto: trecho,
                        vetor: result.embedding.values
                    });

                    if (i < pedacos.length - 1) await delay(3000); 

                } catch (err) {
                    console.log(`\n❌ Erro na fatia ${i+1}: ${err.message}`);
                    if (err.status === 429) {
                        console.log("\n⚠️ Limite da IA do Google atingido. Pausando este arquivo.");
                        break; 
                    }
                }
            }
            
            // Salva o progresso no JSON
            fs.writeFileSync(ARQUIVO_BANCO, JSON.stringify(bancoDeConhecimento, null, 2), 'utf-8');
            console.log(`\n✅ Arquivo '${nomeArquivo}' salvo/atualizado com sucesso!`);

        } catch (error) {
            console.log(`\n❌ Falha ao ler o PDF '${nomeArquivo}':`, error.message);
        }
    }

    console.log(`\n🎉 Ingestão finalizada! O cofre agora tem ${bancoDeConhecimento.length} fatias de conhecimento.`);
}

iniciarIngestao();