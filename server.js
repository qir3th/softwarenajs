cat > /home/claude/mobywatel_v2/server.js << 'SERVEREOF'
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
        users: [{
            id: 1,
            login: adminLogin,
            password: adminPass,
            role: 'admin',
            createdAt: new Date().toISOString(),
            permissions: { canCreate: true, canEdit: true, canDelete: true },
            cardLimit: null
        }],
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
function getDefaultPermissions(role) {
    if (role === 'admin') return { canCreate: true, canEdit: true, canDelete: true };
    return { canCreate: true, canEdit: false, canDelete: false };
}

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
    req.session = s;
    next();
}
function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.session.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
        next();
    });
}

// Static files
app.use('/assets', express.static(path.join(__dirname, 'software/assets')));
app.use('/qrcode.jpeg', express.static(path.join(__dirname, 'software/qrcode.jpeg')));
app.use('/worker.js', express.static(path.join(__dirname, 'software/worker.js')));

function sendHtml(res, filePath) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
}

const htmlPages = ['card','confirm','display','document','documents','home','more','pesel','qr','scan','services','share','shortcuts','show','demo'];
htmlPages.forEach(page => {
    app.get('/' + page, (req, res) => sendHtml(res, path.join(__dirname, 'software', page + '.html')));
});
app.get('/', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'index.html')));
app.get('/id', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'id.html')));
app.get('/login', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'login.html')));
app.get('/dashboard', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'dashboard.html')));
app.get('/admin', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'admin.html')));
app.get('/generator', (req, res) => sendHtml(res, path.join(__dirname, 'software', 'generator.html')));

// Login
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
    const permissions = user ? (user.permissions || getDefaultPermissions(s.role)) : getDefaultPermissions(s.role);
    const cardLimit = user ? (user.cardLimit ?? null) : null;
    res.json({ ok: true, role: s.role, permissions, cardLimit });
});

// Cards
app.post('/api/cards', requireAuth, (req, res) => {
    const { cards } = getCards();
    const { users } = getUsers();
    const user = users.find(u => u.id === req.session.userId);
    const permissions = user ? (user.permissions || getDefaultPermissions(req.session.role)) : getDefaultPermissions(req.session.role);
    const cardLimit = user ? (user.cardLimit ?? null) : null;
    const isAdmin = req.session.role === 'admin';
    let list;
    if (isAdmin) {
        list = cards.map(c => ({
            id: c.id, token: c.token,
            name: c.data.name || '', surname: c.data.surname || '',
            day: c.data.day || 1, month: c.data.month || 1, year: c.data.year || 2000,
            ownerId: c.ownerId || null,
            ownerLogin: c.ownerId ? (users.find(u => u.id === c.ownerId)?.login || 'nieznany') : null
        }));
    } else {
        list = cards.filter(c => c.ownerId === req.session.userId).map(c => ({
            id: c.id, token: c.token,
            name: c.data.name || '', surname: c.data.surname || '',
            day: c.data.day || 1, month: c.data.month || 1, year: c.data.year || 2000
        }));
    }
    res.json({ ok: true, cards: list, isAdmin, permissions, cardLimit,
        userCardCount: cards.filter(c => c.ownerId === req.session.userId).length });
});

app.get('/get/card', (req, res) => {
    const { card_token, session, id } = req.query;
    const { cards } = getCards();
    let card;
    if (card_token) { card = cards.find(c => c.token === card_token); }
    else if (session && id) {
        const s = getSession(session);
        if (!s) return res.status(401).json({ error: 'Brak sesji' });
        card = cards.find(c => c.id === parseInt(id));
    }
    if (!card) return res.status(404).json({ error: 'Nie znaleziono' });
    const { image, ...cardData } = card.data;
    res.json(cardData);
});

app.get('/images', (req, res) => {
    const { card_token, session, id } = req.query;
    const { cards } = getCards();
    let card;
    if (card_token) { card = cards.find(c => c.token === card_token); }
    else if (session && id) {
        const s = getSession(session);
        if (!s) return res.status(401).send('Brak sesji');
        card = cards.find(c => c.id === parseInt(id));
    }
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
    const cardsData = getCards();
    const { users } = getUsers();
    const user = users.find(u => u.id === req.session.userId);
    const permissions = user ? (user.permissions || getDefaultPermissions(req.session.role)) : getDefaultPermissions(req.session.role);
    const isAdmin = req.session.role === 'admin';

    if (id && parseInt(id) !== 0) {
        if (!isAdmin && !permissions.canEdit) return res.status(403).json({ error: 'Brak uprawnień do edycji kart' });
        const idx = cardsData.cards.findIndex(c => c.id === parseInt(id));
        if (idx !== -1) {
            if (!isAdmin && cardsData.cards[idx].ownerId !== req.session.userId)
                return res.status(403).json({ error: 'Brak uprawnień do edycji tej karty' });
            cardsData.cards[idx].data = data;
            saveCards(cardsData);
            return res.json({ ok: true });
        }
    }

    if (!isAdmin && !permissions.canCreate) return res.status(403).json({ error: 'Brak uprawnień do tworzenia kart' });

    if (!isAdmin && user && user.cardLimit !== null && user.cardLimit !== undefined) {
        const userCardCount = cardsData.cards.filter(c => c.ownerId === req.session.userId).length;
        if (userCardCount >= user.cardLimit)
            return res.status(403).json({ error: `Osiągnięto limit kart (${user.cardLimit}). Skontaktuj się z administratorem.` });
    }

    const cardToken = crypto.randomBytes(20).toString('hex');
    cardsData.cards.push({ id: cardsData.nextId++, token: cardToken, ownerId: req.session.userId, data });
    saveCards(cardsData);
    res.json({ ok: true, token: cardToken });
});

app.post('/api/delete-card', requireAuth, (req, res) => {
    const { id } = req.body;
    const cardsData = getCards();
    const isAdmin = req.session.role === 'admin';
    if (!isAdmin) {
        const { users } = getUsers();
        const user = users.find(u => u.id === req.session.userId);
        const permissions = user ? (user.permissions || getDefaultPermissions(req.session.role)) : getDefaultPermissions(req.session.role);
        if (!permissions.canDelete) return res.status(403).json({ error: 'Brak uprawnień do usuwania kart' });
        const card = cardsData.cards.find(c => c.id === parseInt(id));
        if (card && card.ownerId !== req.session.userId) return res.status(403).json({ error: 'Brak uprawnień do usunięcia tej karty' });
    }
    cardsData.cards = cardsData.cards.filter(c => c.id !== parseInt(id));
    saveCards(cardsData);
    res.json({ ok: true });
});

// Admin user management
app.post('/api/users', requireAdmin, (req, res) => {
    const { users } = getUsers();
    const { cards } = getCards();
    res.json({ ok: true, users: users.map(u => ({
        id: u.id, login: u.login, role: u.role, createdAt: u.createdAt,
        permissions: u.permissions || getDefaultPermissions(u.role),
        cardLimit: u.cardLimit ?? null,
        cardCount: cards.filter(c => c.ownerId === u.id).length
    })) });
});

app.post('/api/users/add', requireAdmin, (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.json({ ok: false, error: 'Podaj login i hasło' });
    const usersData = getUsers();
    if (usersData.users.find(u => u.login === login)) return res.json({ ok: false, error: 'Login zajęty' });
    usersData.users.push({ id: usersData.nextId++, login, password, role: 'user',
        createdAt: new Date().toISOString(),
        permissions: getDefaultPermissions('user'), cardLimit: null });
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
    const { id, permissions } = req.body;
    if (!permissions) return res.json({ ok: false, error: 'Brak danych uprawnień' });
    const usersData = getUsers();
    const idx = usersData.users.findIndex(u => u.id === parseInt(id));
    if (idx === -1) return res.json({ ok: false, error: 'Użytkownik nie istnieje' });
    if (usersData.users[idx].role === 'admin') return res.json({ ok: false, error: 'Nie możesz zmieniać uprawnień admina' });
    usersData.users[idx].permissions = {
        canCreate: !!permissions.canCreate,
        canEdit: !!permissions.canEdit,
        canDelete: !!permissions.canDelete
    };
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/users/limit', requireAdmin, (req, res) => {
    const { id, limit } = req.body;
    const usersData = getUsers();
    const idx = usersData.users.findIndex(u => u.id === parseInt(id));
    if (idx === -1) return res.json({ ok: false, error: 'Użytkownik nie istnieje' });
    if (usersData.users[idx].role === 'admin') return res.json({ ok: false, error: 'Admin nie ma limitu kart' });
    usersData.users[idx].cardLimit = (limit === null || limit === '' || limit === undefined) ? null : parseInt(limit);
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/users/role', requireAdmin, (req, res) => {
    const { id, role } = req.body;
    if (!['admin', 'user'].includes(role)) return res.json({ ok: false, error: 'Nieprawidłowa rola' });
    const usersData = getUsers();
    const idx = usersData.users.findIndex(u => u.id === parseInt(id));
    if (idx === -1) return res.json({ ok: false, error: 'Użytkownik nie istnieje' });
    if (usersData.users[idx].role === 'admin' && role === 'user') {
        const adminCount = usersData.users.filter(u => u.role === 'admin').length;
        if (adminCount <= 1) return res.json({ ok: false, error: 'Nie możesz zdegradować ostatniego admina' });
    }
    usersData.users[idx].role = role;
    if (role === 'admin') usersData.users[idx].permissions = getDefaultPermissions('admin');
    saveUsers(usersData);
    res.json({ ok: true });
});

app.post('/api/admin/cards', requireAdmin, (req, res) => {
    const { cards } = getCards();
    const { users } = getUsers();
    const list = cards.map(c => ({
        id: c.id, token: c.token,
        name: c.data.name || '', surname: c.data.surname || '',
        day: c.data.day || 1, month: c.data.month || 1, year: c.data.year || 2000,
        ownerId: c.ownerId || null,
        ownerLogin: c.ownerId ? (users.find(u => u.id === c.ownerId)?.login || 'nieznany') : 'brak właściciela'
    }));
    res.json({ ok: true, cards: list });
});

// Legacy
app.post('/validate', (req, res) => res.json({ status: 2 }));
app.post('/submit', (req, res) => res.status(401).json({ error: 'Użyj /api/submit' }));
app.post('/panel/default', (req, res) => res.status(401).json({ error: 'Użyj /api/cards' }));
app.post('/panel/admin', (req, res) => res.status(401).json({ error: 'Użyj /api/users' }));
app.post('/panel/delete', (req, res) => res.status(401).json({ error: 'Użyj /api/delete-card' }));

app.get('/cache/files', (req, res) => {
    const assetsDir = path.join(__dirname, 'software/assets');
    const files = [];
    function walk(dir, base) {
        fs.readdirSync(dir).forEach(item => {
            const fullPath = path.join(dir, item);
            const rel = path.join(base, item).replace(/\\/g, '/');
            if (fs.statSync(fullPath).isDirectory()) walk(fullPath, rel);
            else files.push(rel);
        });
    }
    walk(assetsDir, 'assets');
    res.json({ files });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Serwer działa na porcie ${PORT}`);
    console.log(`🌐 Panel: http://localhost:${PORT}/login\n`);
});
SERVEREOF
echo "server.js done"