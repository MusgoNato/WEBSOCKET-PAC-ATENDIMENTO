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


// Impressoras conectadas ao meu servidor
let impressorasConectadas = {};

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
        const response = await axios.post(`${FLASK_API_URL}chamar/${ticketId}`, data, {
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

    // Se não existem impressoras conectadas, não há impressao
    if(Object.keys(impressorasConectadas).length == 0){
        console.warn(`Tentativa de criar senha. ABORTADA: Impressora Offline.`);
        return res.status(503).json({
            success: false,
            message: 'O serviço de impressão (Worker) está indisponível.'
        });
    }

    try{
        const response = await axios.post(`${FLASK_API_URL}nova_senha`, {category}, {
            headers: {
                'X-API-Key': API_KEY_NODE_TO_FLASK
            }
        });

        // Creation data contem as informacoes da senha (numero, tipo, codigo ZPL para envio da impressora, etc)
        const creationData = response.data;
        
        // Caso exista impressora conectada, inicio a impressao
        io.emit('iniciar_impressao', creationData);
        console.log(`Senha criada e ZPL enviado para impressao`);

        try{
            // Faz uma nova requisicao para o Flask gravar essa senha gerada no banco apos a impressao da mesma
            const response_criacao_senha_banco = await axios.post(`${FLASK_API_URL}wr_senha_bd`, creationData, {
                headers: {
                    'X-API-Key': API_KEY_NODE_TO_FLASK
                }
            });  

            // Numero do ticket em especifico, retornado do banco ao gravar o mesmo
            const numero_ticket = response_criacao_senha_banco.data.ticket_number;
            
            // Atualizo a fila, no caso o painel
            io.emit('fila_atualizada');
            
            // Tudo deu certo, retorna status true, senha foi gerada e fila atualizada. Assim sendo devolve a senha para que o front end à sirva
            res.status(200).json({success: true, ticket_number: numero_ticket});
        
        } catch(error){
            console.error(`Nao foi possivel gravar no banco a senha criada!`);
            res.status(500).json({success: false, message: 'Falha ao gravar a senha no banco de dados!'});
        }


    } catch(error){
        console.error(`Erro CRITICO Falha na transacao do Flask (Criacao/Geracao ZPL): `, error);
        res.status(500).json({success: false, message: 'Falha ao criar uma nova senha (Erro de sistema).'});
    }
});

// Retorno da fila de atendimento para o painel
app.post('/api/painel', async (req, res) => {
    try{
        // Necessario passar o data do axios vazio
        const response = await axios.post(`${FLASK_API_URL}painel`, {}, {
            headers: {
                'X-API-Key': '012345'
            }
        });

        res.status(200).json(response.data);
    }catch (error){
        console.error(`Erro ao criar a chamada para retorno da fila de atendimento para o painel : `, error.message);
        res.status(200).json({success: false, message: 'Falha ao criar a chamada para retorno da fila de atendimento para o painel'})
    }
});

// Eventos de conexão do WebSocket
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    // Identifica o raspberry conectado
    socket.on('identificar_cliente', (data) => {
        console.log(`Tentativa de identificação recebida : `, data);
        if(data.tipo == 'impressora'){
            impressorasConectadas[socket.id] = data;
            console.log(`Impressora conectada : ${data.nome} (${socket.id})`);
        }
    });

    // Capta a emissao do evento quando a impressora estiver ativa
    socket.on('impressao_concluida', (data) =>{
        if (data.status !== 'false'){
            console.log("Impressora ativa e impressao concluida com sucesso!");
        }else{
            console.log("Impressora offline");
        }
    });
    
    // Clientes desconectados
    socket.on('disconnect', () => {
        if(impressorasConectadas[socket.id]){
            console.log(`Impressora desconectada: ${impressorasConectadas[socket.id]}`);
            delete impressorasConectadas[socket.id];
            console.log(`Impressoras ativas : ${Object.keys(impressorasConectadas)}`);
        }
        console.log(`Cliente desconectado: ${socket.id}`);
    });
    
});

// Inicia o servidor
server.listen(port, () => {
    console.log(`Servidor WebSocket rodando na porta ${port}`);
});