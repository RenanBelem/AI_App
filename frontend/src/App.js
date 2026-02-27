import React, { useState } from 'react';

const bibliotecaPrompts = {
  livre: "Responda à seguinte pergunta ou analise o texto abaixo de forma clara e objetiva:",
  licitacao_riscos: "Você é um auditor público. Analise o texto abaixo e aponte: riscos legais, indícios de sobrepreço ou cláusulas restritivas.",
  despesas_anomalias: "Você é um analista de contas. Analise os dados abaixo e indique possíveis anomalias."
};

function App() {
  const [tipoAnalise, setTipoAnalise] = useState("livre");
  const [dadosEntrada, setDadosEntrada] = useState("");
  const [resposta, setResposta] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Estados para o texto manual
  const [tituloDoc, setTituloDoc] = useState("");
  const [textoDoc, setTextoDoc] = useState("");
  const [statusDoc, setStatusDoc] = useState("");

  // Estado para o PDF
  const [ficheiroPdf, setFicheiroPdf] = useState(null);
  const [statusPdf, setStatusPdf] = useState("");

  const API_URL = "https://musical-giggle-xg6gxw69442x66-5000.app.github.dev";

  // Função Antiga: Aprender Texto Manual
  const ensinarIA = async () => {
    if (!tituloDoc || !textoDoc) return alert("Preencha o título e a regra.");
    setStatusDoc("A enviar para o cofre...");
    try {
      const res = await fetch(`${API_URL}/api/aprender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: tituloDoc, texto: textoDoc })
      });
      const data = await res.json();
      setStatusDoc(data.mensagem);
      setTituloDoc(""); setTextoDoc("");
    } catch (error) {
      setStatusDoc("Erro ao guardar no cofre.");
    }
  };

  // Nova Função: Enviar PDF
  const enviarPdf = async () => {
    if (!ficheiroPdf) return alert("Selecione um ficheiro PDF primeiro.");
    setStatusPdf("A processar e fatiar o PDF... Pode demorar alguns segundos.");
    
    // O FormData é necessário para enviar ficheiros via fetch
    const formData = new FormData();
    formData.append('documento', ficheiroPdf);

    try {
      const res = await fetch(`${API_URL}/api/upload-pdf`, {
        method: 'POST',
        body: formData // Não colocamos Content-Type, o navegador gere isso automaticamente para ficheiros
      });
      const data = await res.json();
      setStatusPdf(data.mensagem || data.erro);
      setFicheiroPdf(null); // Limpa o input
    } catch (error) {
      setStatusPdf("Erro de conexão ao enviar o PDF.");
    }
  };

  const enviarPergunta = async () => {
    if (!dadosEntrada.trim()) return alert("Insira a sua pergunta.");
    setCarregando(true);
    setResposta("A analisar e a pesquisar nos seus documentos...");

    const promptFinal = `${bibliotecaPrompts[tipoAnalise]}\n\n--- DÚVIDA / DADOS ---\n${dadosEntrada}`;

    try {
      const res = await fetch(`${API_URL}/api/perguntar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: promptFinal })
      });
      const data = await res.json();
      setResposta(data.resposta || data.erro);
    } catch (error) {
      setResposta("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ color: '#2c3e50' }}>Auditoria Pública com IA 🕵️‍♂️</h1>
      
      {/* PAINEL DE INGESTÃO (RAG) */}
      <div style={{ backgroundColor: '#e8f4f8', padding: '20px', borderRadius: '8px', marginBottom: '30px', display: 'flex', gap: '20px' }}>
        
        {/* Lado Esquerdo: Upload de PDF */}
        <div style={{ flex: 1, borderRight: '1px solid #bdc3c7', paddingRight: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>📄 Processar PDF</h3>
          <p style={{ fontSize: '13px', color: '#7f8c8d' }}>Envie editais ou leis completas.</p>
          <input 
            type="file" 
            accept="application/pdf"
            onChange={(e) => setFicheiroPdf(e.target.files[0])}
            style={{ marginBottom: '10px', width: '100%' }}
          />
          <button onClick={enviarPdf} style={{ padding: '8px 16px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '5px', width: '100%' }}>
            Extrair Conhecimento
          </button>
          {statusPdf && <p style={{ color: '#d35400', fontSize: '13px', marginTop: '10px', fontWeight: 'bold' }}>{statusPdf}</p>}
        </div>

        {/* Lado Direito: Texto Manual */}
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>✍️ Inserção Manual</h3>
          <input value={tituloDoc} onChange={(e) => setTituloDoc(e.target.value)} placeholder="Título (ex: Regra 1)" style={{ width: '100%', padding: '6px', marginBottom: '5px' }} />
          <textarea value={textoDoc} onChange={(e) => setTextoDoc(e.target.value)} placeholder="Cole um parágrafo importante..." style={{ width: '100%', height: '50px', padding: '6px', marginBottom: '5px' }} />
          <button onClick={ensinarIA} style={{ padding: '8px 16px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', width: '100%' }}>
            Guardar
          </button>
          {statusDoc && <p style={{ color: '#2980b9', fontSize: '13px', marginTop: '10px' }}>{statusDoc}</p>}
        </div>
      </div>

      {/* PAINEL DE CONSULTA */}
      <h3 style={{ color: '#2c3e50' }}>Executar Análise / Dúvida</h3>
      <select value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>
        <option value="livre">Pesquisa na Base de Conhecimento</option>
        <option value="licitacao_riscos">Auditoria de Licitações</option>
      </select>

      <textarea 
        value={dadosEntrada} onChange={(e) => setDadosEntrada(e.target.value)}
        placeholder="Faça a sua pergunta à IA baseada nos PDFs que enviou..."
        style={{ width: '100%', height: '100px', padding: '10px', marginBottom: '10px' }}
      />

      <button onClick={enviarPergunta} disabled={carregando} style={{ padding: '12px 24px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px' }}>
        {carregando ? 'A analisar...' : 'Consultar IA Especialista'}
      </button>

      {resposta && (
        <div style={{ marginTop: '20px', backgroundColor: '#f8f9fa', padding: '20px', borderLeft: '5px solid #27ae60', whiteSpace: 'pre-wrap' }}>
          {resposta}
        </div>
      )}
    </div>
  );
}

export default App;