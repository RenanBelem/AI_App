const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

app.use(cors());

app.get('/api/mensagem', (req, res) => {
  res.json({ texto: "Olá! Este dado veio do seu Backend no Codespaces!" });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});