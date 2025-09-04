require("dotenv").config();

// Importa as bibliotecas necessárias
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // Necessário para fazer requisições para o Flask
const cors = require('cors'); // Importe a biblioteca CORS

// Cria o aplicativo Express e o servidor HTTP
const app = express();
const server = http.createServer(app);


// Middleware cors para as requisições HTTP
app.use(cors());

// Inicializa o servidor WebSocket (Socket.IO)
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexões de qualquer origem
        methods: ["GET", "POST", "DELETE"]
    }
});

// Define a porta em que o servidor irá rodar
const port = process.env.PORT || 4000;

// Middleware para processar requisições com corpo em formato JSON
app.use(express.json());

// A URL do seu backend Flask
// No cPanel, você pode usar 'http://localhost:5000' se eles estiverem no mesmo servidor
const FLASK_API_URL = process.env.FLASK_API_URL;
const API_KEY_NODE_TO_FLASK = process.env.API_KEY_NODE_TO_FLASK;


// Rota para 'chamar' um cliente
// O atendente.js fará um POST para esta rota
app.post('/api/chamar/:ticket_id', async (req, res) => {
    const ticketId = req.params.ticket_id;
    const data = req.body;
    try {
        // 1. Faz a requisição para o backend Flask
        const response = await axios.post(`${FLASK_API_URL}/chamar/${ticketId}`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // 2. Emite o evento 'fila_atualizada' para todos os clientes conectados
        io.emit('fila_atualizada');
    
        // 3. Retorna uma resposta de sucesso para o frontend
        res.status(200).json(response.data);
    } catch (error) {
        console.error(`Erro ao chamar cliente ${ticketId}:`, error.message);
        res.status(500).json({ success: false, message: 'Falha ao chamar cliente' });
    }
});

// Rota para 'remover' um cliente
// O atendente.js fará um POST ou DELETE para esta rota
app.post('/api/remover/:ticket_id', async (req, res) => {
    const ticketId = req.params.ticket_id;
    try {
        
        // 1. Faz a requisição para o backend Flask
        await axios.post(`${FLASK_API_URL}/${ticketId}`, {}, {
            headers: {
                'X-API-Key': API_KEY_NODE_TO_FLASK
            }
        });

        console.log(ticketId);
        // 2. Emite o evento 'fila_atualizada' para todos os clientes conectados
        io.emit('fila_atualizada');
    
        // 3. Retorna uma resposta de sucesso para o frontend
        res.status(200).json({ success: true, message: 'Cliente removido com sucesso' });
    } catch (error) {
        console.error(`Erro ao remover cliente ${ticketId}:`, error.message);
        res.status(500).json({ success: false, message: 'Falha ao remover cliente' });
    }
});

// Criacao de uma nova senha via totem
app.post('/api/nova_senha', async (req, res) => {
    const {category} = req.body;
    try{
        const response = await axios.post(`${FLASK_API_URL}/nova_senha`, {category}, {
            headers: {
                'X-API-Key': API_KEY_NODE_TO_FLASK
            }
        });
        io.emit('fila_atualizada');

        res.status(200).json(response.data);

    } catch(error){
        console.error(`Erro ao criar uma nova senha: `, error.message);
        res.status(500).json({success: false, message: 'Falha ao criar uma nova senha'});
    }
});

// Eventos de conexão do WebSocket
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);
    socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    });
});

// Inicia o servidor
server.listen(port, () => {
    console.log(`Servidor WebSocket rodando na porta ${port}`);
});