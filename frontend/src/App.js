import React, { useEffect, useState } from 'react';

function App() {
  const [mensagem, setMensagem] = useState("Carregando...");

  useEffect(() => {
    // No Codespaces, usamos o endereço local enquanto desenvolvemos
    fetch('http://localhost:5000/api/mensagem')
      .then(response => response.json())
      .then(data => setMensagem(data.texto))
      .catch(err => setMensagem("Erro ao conectar ao back"));
  }, []);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Meu Projeto Fullstack</h1>
      <div style={{ padding: '20px', border: '1px solid #ccc', display: 'inline-block' }}>
        <strong>Resposta do Backend:</strong>
        <p>{mensagem}</p>
      </div>
    </div>
  );
}

export default App;