import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import mineflayer from 'mineflayer';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)));
const mc = config.minecraft;
const token = process.env.BRIDGE_TOKEN || config.web.token;
if (!token || token === 'CHANGE_ME') throw new Error('Set a strong BRIDGE_TOKEN before starting.');

const origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).concat(config.web.allowedOrigins || []);
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: origins, methods: ['GET','POST'] } });
io.use((socket, next) => next(socket.handshake.auth.token === token ? undefined : new Error('Invalid bridge token')));

app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.get('/health', (_, res) => res.json({ ok: true }));

let bot, retry, afk, stopping = false;
let state = {
    status: 'disconnected',
    host: process.env.MC_HOST || mc.host,
    port: Number(process.env.MC_PORT || mc.port),
    username: process.env.MC_USERNAME || mc.username,
    players: [],
    antiAfk: true
};
const history = [];

// Commands erlaubt vom Web-Chat
const allowedCommands = [
    '/list', '/tps', '/spawn', '/help', '/ping',
    '/homes', '/home', '/sethome', '/delhome',
    '/register', '/login', '/changepassword',
    '/friends', '/friend', '/dm',
    '/points', '/balance', '/pay'
];

function publish(patch) { state = { ...state, ...patch }; io.emit('state', state); }
function addMessage(message) {
    const item = { ...message, id: crypto.randomUUID(), time: new Date().toISOString() };
    history.push(item);
    if (history.length > 200) history.shift();
    io.emit('message', item);
    return item;
}

function connect() {
    clearTimeout(retry);
    clearInterval(afk);
    if (bot) { const old = bot; bot = null; old.quit('Reconnecting'); }
    publish({ status: 'connecting', players: [] });

    const auth = process.env.MC_AUTH || mc.auth;
    const current = mineflayer.createBot({
        host: state.host,
        port: state.port,
        username: state.username,
        auth: auth === 'online' ? 'microsoft' : auth,
        profilesFolder: process.env.AUTH_FOLDER || '.auth'
    });
    bot = current;

    current.once('spawn', () => {
        if (bot !== current) return;
        publish({ status: 'connected', username: current.username, players: Object.keys(current.players) });
        afk = setInterval(() => {
            if (bot === current && current.entity) {
                current.setControlState('jump', true);
                setTimeout(() => { if (bot === current) current.setControlState('jump', false); }, 400);
            }
        }, 45000);
    });

    const players = () => { if (bot === current) publish({ players: Object.keys(current.players) }); };
    current.on('playerJoined', players);
    current.on('playerLeft', players);

    current.on('chat', (username, text) => {
        if (bot === current && username !== current.username) addMessage({ kind: 'player', username, text });
    });

    current.on('kicked', reason => {
        console.warn('Kicked:', reason);
        if (bot === current) publish({ status: 'disconnected', players: [] });
    });

    current.on('error', error => console.error('Minecraft:', error.message));

    current.on('end', () => {
        if (bot !== current) return;
        bot = null;
        clearInterval(afk);
        publish({ status: 'disconnected', players: [] });
        if (!stopping) retry = setTimeout(connect, 5000);
    });
}

io.on('connection', socket => {
    socket.emit('state', state);
    socket.emit('history', history);

    let lastMessage = 0, lastReconnect = 0;

    socket.on('send_message', (payload, ack = () => {}) => {
        const text = typeof payload?.text === 'string' ? payload.text.trim() : '';

        if (!text || text.length > 256 || /[\r\n]/.test(text)) {
            return ack({ error: 'Use 1-256 characters, single line.' });
        }

        if (text.startsWith('/') && !allowedCommands.some(cmd => text.toLowerCase().startsWith(cmd))) {
            return ack({ error: 'Command not allowed from web chat.' });
        }

        if (state.status !== 'connected' || !bot) return ack({ error: 'PeanutBot is not connected to Minecraft.' });
        if (Date.now() - lastMessage < 1000) return ack({ error: 'Please wait a second between messages.' });
        lastMessage = Date.now();

        try {
            bot.chat(text);
            const message = addMessage({ kind: 'web', username: bot.username, text });
            ack({ ok: true, id: message.id });
        } catch (error) {
            ack({ error: error.message });
        }
    });

    socket.on('reconnect_bot', (ack = () => {}) => {
        if (Date.now() - lastReconnect < 10000) return ack({ error: 'Please wait 10 seconds before reconnecting again.' });
        lastReconnect = Date.now();
        connect();
        ack({ ok: true });
    });
});

server.listen(Number(process.env.PORT || config.web.port), '0.0.0.0', () => {
    console.log('PeanutBot web bridge started');
    connect();
});

function shutdown() {
    stopping = true;
    clearTimeout(retry);
    clearInterval(afk);
    bot?.quit('Shutting down');
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);