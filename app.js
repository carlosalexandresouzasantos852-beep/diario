require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ──
app.use('/api/create-payment', require('./create-payment'));
app.use('/api/check',          require('./check'));
app.use('/api/webhook',        require('./webhook'));

// ── Serve index.html for all other routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Campeonato rodando na porta ${PORT}`));

module.exports = app;
