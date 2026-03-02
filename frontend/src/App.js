import React, { useState } from 'react';

const bibliotecaPrompts = {
  livre: "Analise as informações dos documentos e responda:",
  licitacao_riscos: "Você é um auditor público. Analise os documentos e aponte riscos legais e anomalias.",
};

function App() {
  const [tipoAnalise, setTipoAnalise] = useState("livre");
  const [dadosEntrada, setDadosEntrada] = useState("");
  const [resposta, setResposta] = useState("");
  const [referencias, setReferencias] = useState([]); // Guarda os textos originais
  const [carregando, setCarregando] = useState(false);
  
  // Estados para o Modal de Evidência
  const [modalAberto, setModalAberto] = useState(false);
  const [evidenciaAtual, setEvidenciaAtual] = useState({ fonte: '', texto: '' });

  const [ficheiroPdf, setFicheiroPdf] = useState(null);
  const [statusPdf, setStatusPdf] = useState("");

  const API_URL = "https://musical-giggle-xg6gxw69442x66-5000.app.github.dev";

  const enviarPdf = async () => {
    if (!ficheiroPdf) return alert("Selecione um ficheiro PDF.");
    setStatusPdf("🚜 Trator em ação: Processando e fatiando o PDF...");
    const formData = new FormData();
    formData.append('documento', ficheiroPdf);

    try {
      const res = await fetch(`${API_URL}/api/upload-pdf`, { method: 'POST', body: formData });
      const data = await res.json();
      setStatusPdf(data.mensagem || "Documento enviado com sucesso!");
      setFicheiroPdf(null);
    } catch (error) {
      setStatusPdf("Erro ao enviar para o motor Python.");
    }
  };

  const enviarPergunta = async () => {
    if (!dadosEntrada.trim()) return alert("Insira a sua dúvida.");
    setCarregando(true);
    setResposta("Pesquisando evidências na base de conhecimento...");
    setReferencias([]); // Limpa referências antigas

    const promptFinal = `${bibliotecaPrompts[tipoAnalise]}\n\n${dadosEntrada}`;

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: promptFinal })
      });
      const data = await res.json();
      
      if (res.ok) {
        setResposta(data.resposta);
        setReferencias(data.referencias || []);
      } else {
        // Agora o React exibe a mensagem exata que o Python mandou (seja base vazia ou limite de cota)
        setResposta(data.detail || "Ocorreu um erro de comunicação com o servidor.");
      }
    } catch (error) {
      setResposta("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  };

  // Função Mágica que transforma texto em botões clicáveis
  const renderizarRespostaComLinks = (texto) => {
    // Procura exatamente pelo padrão [Fonte: Qualquer Coisa]
    const partes = texto.split(/(\[Fonte:.*?\])/g);
    
    return partes.map((parte, index) => {
      if (parte.startsWith('[Fonte:') && parte.endsWith(']')) {
        const nomeFonteLimpo = parte.replace('[Fonte: ', '').replace(']', '').trim();
        
        return (
          <span 
            key={index} 
            onClick={() => abrirEvidencia(nomeFonteLimpo)}
            style={{ 
              color: '#2980b9', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              backgroundColor: '#e8f4f8',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.9em',
              marginLeft: '4px'
            }}
            title="Clique para ver o documento original"
          >
            📎 {nomeFonteLimpo}
          </span>
        );
      }
      return <span key={index}>{parte}</span>;
    });
  };

  const abrirEvidencia = (nomeFonte) => {
    // Procura no array de referências o texto original correspondente
    const refEncontrada = referencias.find(r => r.fonte === nomeFonte);
    if (refEncontrada) {
      setEvidenciaAtual(refEncontrada);
      setModalAberto(true);
    } else {
      alert("Texto original não encontrado para esta fonte.");
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', maxWidth: '900px', margin: '0 auto', color: '#333' }}>
      
      {/* CABEÇALHO E UPLOAD (Mantidos idênticos) */}
      <header style={{ borderBottom: '2px solid #2c3e50', marginBottom: '30px' }}>
        <h1>Especialista de IA em Auditoria 🕵️‍♂️</h1>
        <p>Base de conhecimento alimentada por documentos oficiais.</p>
      </header>

      <section style={{ backgroundColor: '#f4f7f6', padding: '25px', borderRadius: '12px', marginBottom: '30px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>📂 Alimentar Base de Dados</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <input type="file" accept="application/pdf" onChange={(e) => setFicheiroPdf(e.target.files[0])} style={{ padding: '10px', backgroundColor: 'white', borderRadius: '5px', flex: 1 }} />
          <button onClick={enviarPdf} style={{ padding: '12px 25px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Processar Documento</button>
        </div>
        {statusPdf && <p style={{ marginTop: '15px', color: '#2980b9', fontSize: '14px' }}>{statusPdf}</p>}
      </section>

      {/* ÁREA DE CHAT */}
      <section>
        <h3>🔍 Consultar Conhecimento</h3>
        <select value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ccc' }}>
          <option value="livre">Pesquisa Geral na Base</option>
          <option value="licitacao_riscos">Análise de Riscos em Auditoria</option>
        </select>

        <textarea 
          value={dadosEntrada} onChange={(e) => setDadosEntrada(e.target.value)}
          placeholder="Olá! Como posso te ajudar hoje?"
          style={{ width: '100%', height: '120px', padding: '15px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '15px', boxSizing: 'border-box' }}
        />

        <button onClick={enviarPergunta} disabled={carregando} style={{ padding: '15px 30px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%' }}>
          {carregando ? 'Buscando evidências...' : 'Enviar Pergunta'}
        </button>

        {/* RESPOSTA RENDERIZADA COM LINKS */}
        {resposta && (
          <div style={{ marginTop: '30px', backgroundColor: '#fff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderLeft: '8px solid #27ae60', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
            {renderizarRespostaComLinks(resposta)}
          </div>
        )}
      </section>

      {/* JANELA MODAL DE EVIDÊNCIA */}
      {modalAberto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', maxWidth: '600px', width: '90%', position: 'relative' }}>
            <button 
              onClick={() => setModalAberto(false)} 
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#e74c3c' }}
            >
              ✖
            </button>
            <h3 style={{ color: '#2c3e50', marginTop: 0, borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
              📄 Documento Original
            </h3>
            <p style={{ fontWeight: 'bold', color: '#7f8c8d', fontSize: '14px' }}>Arquivo: {evidenciaAtual.fonte}</p>
            <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', fontSize: '15px', lineHeight: '1.5', maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', whiteSpace: 'pre-wrap' }}>
              {evidenciaAtual.texto}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;