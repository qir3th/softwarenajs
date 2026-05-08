const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));

const DATA_DIR   = path.join(__dirname, 'data');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(CARDS_FILE)) {
    fs.writeFileSync(CARDS_FILE, JSON.stringify({ cards: [], nextId: 1 }, null, 2));
}

if (!fs.existsSync(USERS_FILE)) {
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    fs.writeFileSync(USERS_FILE, JSON.stringify({
        users: [{ id: 1, login: adminLogin, password: adminPass, role: 'admin', createdAt: new Date().toISOString(), cardLimit: null, permissions: { canCreate: true, canEdit: true, canDelete: true } }],
        nextId: 2
    }, null, 2));
}

if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD) {
    try {
        const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const adminIdx = usersData.users.findIndex(u => u.role === 'admin');
        if (adminIdx !== -1) {
            usersData.users[adminIdx].login = process.env.ADMIN_LOGIN;
            usersData.users[adminIdx].password = process.env.ADMIN_PASSWORD;
            fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
        }
    } catch(e) {}
}

function getCards() { return JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8')); }
function saveCards(data) { fs.writeFileSync(CARDS_FILE, JSON.stringify(data, null, 2)); }
function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function saveUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); }
function defaultPermissions() { return { canCreate: true, canEdit: true, canDelete: true }; }

const sessions = {};
function createSession(userId, role) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { userId, role, createdAt: Date.now() };
    return token;
}
function getSession(token) {
    const s = sessions[token];
    if (!s) return null;
    if (Date.now() - s.createdAt > 86400000) { delete sessions[token]; return null; }
    return s;
}
function requireAuth(req, res, next) {
    const token = req.headers['x-session'] || req.body?.session;
    const s = getSession(token);
    if (!s) return res.status(401).json({ error: 'Nie zalogowany' });
    req.session = s; next();
}
function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.session.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
        next();
    });
}

app.use('/assets', express.static(path.join(__dirname, 'software/assets')));
app.use('/qrcode.jpeg', express.static(path.join(__dirname, 'software/qrcode.jpeg')));
app.use('/worker.js', express.static(path.join(__dirname, 'software/worker.js')));

const htmlPages = ['card','confirm','display','document','documents','home','more','pesel','qr','scan','services','share','shortcuts','show','demo'];
htmlPages.forEach(page => { app.get('/' + page, (req, res) => res.sendFile(path.join(__dirname, 'software', page + '.html'))); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'software', 'index.html')));
app.get('/id', (req, res) => res.sendFile(path.join(__dirname, 'software', 'id.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'software', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'software', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'software', 'admin.html')));
app.get('/generator', (req, res) => res.sendFile(path.join(__dirname, 'software', 'generator.html')));

app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.json({ ok: false, error: 'Podaj login i hasło' });
    const { users } = getUsers();
    const user = users.find(u => u.login === login && u.password === password);
    if (!user) return res.json({ ok: false, error: 'Zły login lub hasło' });
    const token = createSession(user.id, user.role);
    res.json({ ok: true, token, role: user.role });
});

app.post('/api/logout', (req, res) => {
    const { session } = req.body;
    if (session) delete sessions[session];
    res.json({ ok: true });
});

app.post('/api/me', (req, res) => {
    const { session } = req.body;
    const s = getSession(session);
    if (!s) return res.json({ ok: false });
    const { users } = getUsers();
    const user = users.find(u => u.id === s.userId);
    if (!user) return res.json({ ok: false });
    const perms = user.permissions || defaultPermissions();
    res.json({ ok: true, role: s.role, permissions: perms, cardLimit: user.cardLimit ?? null });
});

app.post('/api/cards', requireAuth, (req, res) => {
    const { cards } = getCards();
    const isAdmin = req.session.role === 'admin';
    const { users } = getUsers();
    const user = users.find(u => u.id === req.session.userId);
    const perms = user?.permissions || defaultPermissions();
    const cardLimit = user?.cardLimit ?? null;
    let list;
    if (isAdmin) {
        list = cards.map(c => ({ id: c.id, token: c.token, name: c.data.name||'', surname: c.data.surname||'', day: c.data.day||1, month: c.data.month||1, year: c.data.year||2000, createdBy: c.createdBy||null, createdByLogin: c.createdByLogin||null }));
    } else {
        list = cards.filter(c => c.createdBy === req.session.userId).map(c => ({ id: c.id, token: c.token, name: c.data.name||'', surname: c.data.surname||'', day: c.data.day||1, month: c.data.month||1, year: c.data.year||2000 }));
    }
    res.json({ ok: true, cards: list, isAdmin, permissions: perms, cardLimit, cardCount: list.length });
});

app.get('/get/card', (req, res) => {
    const { card_token, session, id } = req.query;
    const { cards } = getCards();
    let card;
    if (card_token) { card = cards.find(c => c.token === card_token); }
    else if (session && id) { const s = getSession(session); if (!s) return res.status(401).json({ error: 'Brak sesji' }); card = cards.find(c => c.id === parseInt(id)); }
    if (!card) return res.status(404).json({ error: 'Nie znaleziono' });
    const { image, ...cardData } = card.data;
    res.json(cardData);
});

app.get('/images', (req, res) => {
    const { card_token, session, id } = req.query;
    const { cards } = getCards();
    let card;
    if (card_token) { card = cards.find(c => c.token === card_token); }
    else if (session && id) { const s = getSession(session); if (!s) return res.status(401).send('Brak sesji'); card = cards.find(c => c.id === parseInt(id)); }
    if (!card || !card.data.image) return res.status(404).send('Brak zdjęcia');
    const base64 = card.data.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const mimeType = card.data.image.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    res.set('Content-Type', mimeType);
    res.send(buffer);
});

app.post('/api/submit', requireAuth, (req, res) => {
    const { id, data } = req.body;
    if (!data) return res.status(400).json({ error: 'Brak danych' });
    const isAdmin = req.session.role === 'admin';
    const { users } = getUsers();
    const user = users.find(u => u.id === req.session.userId);
    const perms = user?.permissions || defaultPermissions();
    const cardsData = getCards();
    if (id && parseInt(id) !== 0) {
        if (!isAdmin && !perms.canEdit) return res.json({ ok: false, error: 'Nie masz uprawnień do edytowania kart' });
        const idx = cardsData.cards.findIndex(c => c.id === parseInt(id));
        if (idx !== -1) {
            if (!isAdmin && cardsData.cards[idx].createdBy !== req.session.userId) return res.json({ ok: false, error: 'Nie masz dostępu do tej karty' });
            cardsData.cards[idx].data = data;
            saveCards(cardsData);
            return res.json({ ok: true });
        }
    }
    if (!isAdmin && !perms.canCreate) return res.json({ ok: false, error: 'Nie masz uprawnień do tworzenia kart' });
    if (!isAdmin && user?.cardLimit !== null && user?.cardLimit !== undefined) {
        const userCardCount = cardsData.cards.filter(c => c.createdBy === req.session.userId).length;
        if (userCardCount >= user.cardLimit) return res.json({ ok: false, error: `Osiągnąłeś limit ${user.cardLimit} kart` });
    }
    const cardToken = crypto.randomBytes(20).toString('hex');
    cardsData.cards.push({ id: cardsData.nextId++, token: cardToken, data, createdBy: req.session.userId, createdByLogin: user?.login || 'unknown', createdAt: new Date().toISOString() });
    saveCards(cardsData);
    res.json({ ok: true, token: cardToken });
});

app.post('/api/delete-card', requireAuth, (req, res) => {
    const { id } = req.body;
    const isAdmin = req.session.role === 'admin';
    const { users } = getUsers();
    const user = users.find(u => u.id === req.session.userId);
    const perms = user?.permissions || defaultPermissions();
    if (!isAdmin && !perms.canDelete) return res.json({ ok: false, error: 'Nie masz uprawnień do usuwania kart' });
    const cardsData = getCards();
    const card = cardsData.cards.find(c => c.id === parseInt(id));
    if (!card) return res.json({ ok: false, error: 'Karta nie istnieje' });
    if (!isAdmin && card.createdBy !== req.session.userId) return res.json({ ok: false, error: 'Nie masz dostępu do tej karty' });
    cardsData.cards = cardsData.cards.filter(c => c.id !== parseInt(id));
    saveCards(cardsData);
    res.json({ ok: true });
});

app.post('/api/users', requireAdmin, (req, res) => {
    const { users } = getUsers();
    const { cards } = getCards();
    const result = users.map(u => ({
        id: u.id, login: u.login, role: u.role, createdAt: u.createdAt,
        cardLimit: u.cardLimit ?? null,
        cardCount: cards.filter(c => c.createdBy === u.id).length,
        permissions: u.permissions || defaultPermissions()
    }));
    res.json({ ok: true, users: result });
});

app.post('/api/users/add', requireAdmin, (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.json({ ok: false, error: 'Podaj login i hasło' });
    const usersData = getUsers();
    if (usersData.users.find(u => u.login === login)) return res.json({ ok: false, error: 'Login zajęty' });
    usersData.users.push({ id: usersData.nextId++, login, password, role: 'user', createdAt: new Date().toISOString(), cardLimit: null, permissions: defaultPermissions() });
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/users/delete', requireAdmin, (req, res) => {
    const { id } = req.body;
    const usersData = getUsers();
    const user = usersData.users.find(u => u.id === parseInt(id));
    if (user?.role === 'admin') return res.json({ ok: false, error: 'Nie możesz usunąć admina' });
    usersData.users = usersData.users.filter(u => u.id !== parseInt(id));
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/users/password', requireAdmin, (req, res) => {
    const { id, password } = req.body;
    if (!password) return res.json({ ok: false, error: 'Podaj nowe hasło' });
    const usersData = getUsers();
    const idx = usersData.users.findIndex(u => u.id === parseInt(id));
    if (idx === -1) return res.json({ ok: false, error: 'Użytkownik nie istnieje' });
    usersData.users[idx].password = password;
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/users/permissions', requireAdmin, (req, res) => {
    const { id, permissions, cardLimit, role } = req.body;
    const usersData = getUsers();
    const idx = usersData.users.findIndex(u => u.id === parseInt(id));
    if (idx === -1) return res.json({ ok: false, error: 'Użytkownik nie istnieje' });
    if (usersData.users[idx].role === 'admin' && role === 'user') return res.json({ ok: false, error: 'Nie możesz zdegradować głównego admina' });
    if (permissions !== undefined) usersData.users[idx].permissions = permissions;
    if (cardLimit !== undefined) usersData.users[idx].cardLimit = (cardLimit === '' || cardLimit === null) ? null : parseInt(cardLimit);
    if (role) usersData.users[idx].role = role;
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/admin/cards', requireAdmin, (req, res) => {
    const { cards } = getCards();
    const list = cards.map(c => ({ id: c.id, token: c.token, name: c.data.name||'', surname: c.data.surname||'', day: c.data.day||1, month: c.data.month||1, year: c.data.year||2000, createdBy: c.createdBy||null, createdByLogin: c.createdByLogin||'unknown', createdAt: c.createdAt||null }));
    res.json({ ok: true, cards: list });
});

app.post('/validate', (req, res) => res.json({ status: 2 }));
app.post('/submit', (req, res) => res.status(401).json({ error: 'Użyj /api/submit' }));
app.post('/panel/default', (req, res) => res.status(401).json({ error: 'Użyj /api/cards' }));
app.post('/panel/admin', (req, res) => res.status(401).json({ error: 'Użyj /api/users' }));
app.post('/panel/delete', (req, res) => res.status(401).json({ error: 'Użyj /api/delete-card' }));

app.get('/cache/files', (req, res) => {
    const assetsDir = path.join(__dirname, 'software/assets');
    const files = [];
    function walk(dir, base) { fs.readdirSync(dir).forEach(item => { const fullPath = path.join(dir, item); const rel = path.join(base, item).replace(/\\/g, '/'); if (fs.statSync(fullPath).isDirectory()) walk(fullPath, rel); else files.push(rel); }); }
    walk(assetsDir, 'assets');
    res.json({ files });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`✅ Serwer na porcie ${PORT}`); });
