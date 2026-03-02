import React, { useState, useEffect } from 'react';

const bibliotecaPrompts = {
  livre: "Analise as informações dos documentos e responda:",
  licitacao_riscos: "Você é um auditor público. Analise os documentos e aponte riscos legais e anomalias.",
};

function App() {
  const [tipoAnalise, setTipoAnalise] = useState("livre");
  const [dadosEntrada, setDadosEntrada] = useState("");
  const [resposta, setResposta] = useState("");
  const [referencias, setReferencias] = useState([]); 
  const [carregando, setCarregando] = useState(false);
  
  // Estado para guardar o status do Banco de Dados
  const [statusBanco, setStatusBanco] = useState({ fatias_totais: 0, documentos_processados: [] });

  const [modalAberto, setModalAberto] = useState(false);
  const [evidenciaAtual, setEvidenciaAtual] = useState({ fonte: '', texto: '' });

  const API_URL = "https://musical-giggle-xg6gxw69442x66-5000.app.github.dev";

  // Função que busca o status no servidor Python
  const buscarStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setStatusBanco(data);
      }
    } catch (error) {
      console.error("Erro ao conectar com o motor de auditoria para buscar o status.");
    }
  };

  // Dispara a busca de status assim que o site carrega
  useEffect(() => {
    buscarStatus();
  }, []);

  const enviarPergunta = async () => {
    if (!dadosEntrada.trim()) return alert("Insira a sua dúvida.");
    setCarregando(true);
    setResposta("Pesquisando evidências na base de conhecimento...");
    setReferencias([]); 

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
        setResposta(data.detail || "Ocorreu um erro de comunicação com o servidor.");
      }
    } catch (error) {
      setResposta("Erro de conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  };

  const renderizarRespostaComLinks = (texto) => {
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
      
      <header style={{ borderBottom: '2px solid #2c3e50', marginBottom: '30px', paddingBottom: '20px' }}>
        <h1 style={{ color: '#2c3e50', margin: '0 0 10px 0' }}>Especialista de IA em Auditoria 🕵️‍♂️</h1>
        <p style={{ color: '#7f8c8d', margin: '0 0 15px 0' }}>Terminal de Consulta Rápida aos Assuntos da Etapa de Planejamento de Auditorias Públicas.</p>
        
        {/* MEDIDOR DE CONHECIMENTO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ backgroundColor: '#e8f4f8', color: '#2980b9', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', border: '1px solid #bdc3c7' }}>
            📚 {statusBanco.documentos_processados.length} Documentos Carregados
          </span>
          <span style={{ backgroundColor: '#e8f4f8', color: '#2980b9', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', border: '1px solid #bdc3c7' }}>
            🧩 {statusBanco.fatias_totais} Fatias de Conhecimento
          </span>
          <button 
            onClick={buscarStatus} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '5px' }} 
            title="Atualizar Status"
          >
            🔄
          </button>
        </div>
      </header>

      {/* ÁREA DE CHAT FOCADA */}
      <section>
        <select value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '15px' }}>
          <option value="livre">Pesquisa Geral na Base</option>
          <option value="licitacao_riscos">Análise de Riscos em Auditoria</option>
        </select>

        <textarea 
          value={dadosEntrada} onChange={(e) => setDadosEntrada(e.target.value)}
          placeholder="Descreva o cenário ou faça sua pergunta baseada nos documentos já carregados pelo sistema..."
          style={{ width: '100%', height: '150px', padding: '15px', borderRadius: '8px', border: '1px solid #ccc', marginBottom: '15px', boxSizing: 'border-box', fontSize: '15px', resize: 'vertical' }}
        />

        <button onClick={enviarPergunta} disabled={carregando} style={{ padding: '15px 30px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%', transition: 'background 0.3s' }}>
          {carregando ? 'Buscando e processando evidências...' : 'Executar Análise de IA'}
        </button>

        {resposta && (
          <div style={{ marginTop: '30px', backgroundColor: '#fff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderLeft: '8px solid #27ae60', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '15px' }}>
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
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', maxWidth: '650px', width: '90%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <button 
              onClick={() => setModalAberto(false)} 
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#e74c3c' }}
            >
              ✖
            </button>
            <h3 style={{ color: '#2c3e50', marginTop: 0, borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
              📄 Evidência Documental
            </h3>
            <p style={{ fontWeight: 'bold', color: '#7f8c8d', fontSize: '14px', backgroundColor: '#f4f7f6', padding: '10px', borderRadius: '6px' }}>
              Fonte: {evidenciaAtual.fonte}
            </p>
            <div style={{ padding: '15px', borderRadius: '8px', fontSize: '15px', lineHeight: '1.6', maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', whiteSpace: 'pre-wrap', color: '#34495e' }}>
              {evidenciaAtual.texto}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;