const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ─── Ścieżki do danych ───────────────────────────────────────────────────────
const DATA_DIR   = path.join(__dirname, 'data');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(CARDS_FILE)) {
    fs.writeFileSync(CARDS_FILE, JSON.stringify({ cards: [], nextId: 1 }, null, 2));
}

if (!fs.existsSync(CONFIG_FILE)) {
    const adminToken = crypto.randomBytes(20).toString('hex');
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ adminToken }, null, 2));
    console.log('\n========================================');
    console.log('TWÓJ TOKEN ADMINA (zapisz go!):', adminToken);
    console.log('========================================\n');
}

// ─── Helpersy ────────────────────────────────────────────────────────────────
function getCards() {
    return JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
}

function saveCards(data) {
    fs.writeFileSync(CARDS_FILE, JSON.stringify(data, null, 2));
}

function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function isValidToken(token) {
    if (!token) return false;
    return token === getConfig().adminToken;
}

// ─── Pliki statyczne (CSS, JS, obrazki) ─────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, 'software/assets')));
app.use('/qrcode.jpeg', express.static(path.join(__dirname, 'software/qrcode.jpeg')));
app.use('/worker.js', express.static(path.join(__dirname, 'software/worker.js')));

// ─── Strony HTML ─────────────────────────────────────────────────────────────
const htmlPages = [
    'card', 'confirm', 'display', 'document', 'documents',
    'home', 'more', 'pesel', 'qr', 'scan', 'services',
    'share', 'shortcuts', 'show', 'demo'
];

htmlPages.forEach(page => {
    app.get('/' + page, (req, res) => {
        res.sendFile(path.join(__dirname, 'software', page + '.html'));
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'index.html'));
});

app.get('/id', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'id.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'admin.html'));
});

app.get('/generator', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'generator.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'software', 'login.html'));
});

// ─── API: Walidacja tokena ────────────────────────────────────────────────────
// status 4 = OK, status 2 = brak dostępu, status 3 = błąd
app.post('/validate', (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ status: 3 });
    if (isValidToken(token)) {
        return res.json({ status: 4 });
    }
    return res.json({ status: 2 });
});

// ─── API: Pobierz dane karty ──────────────────────────────────────────────────
// Używane przez bar.js: /get/card?card_token=X lub /get/card?token=X&id=X
app.get('/get/card', (req, res) => {
    const { card_token, token, id } = req.query;
    const { cards } = getCards();

    let card;
    if (card_token) {
        card = cards.find(c => c.token === card_token);
    } else if (token && id && isValidToken(token)) {
        card = cards.find(c => c.id === parseInt(id));
    }

    if (!card) return res.status(404).json({ error: 'Nie znaleziono' });

    // Zwróć dane bez obrazka (obrazek jest osobnym endpointem)
    const { image, ...cardData } = card.data;
    res.json(cardData);
});

// ─── API: Pobierz zdjęcie ─────────────────────────────────────────────────────
// Używane przez bar.js: /images?card_token=X lub /images?token=X&id=X
app.get('/images', (req, res) => {
    const { card_token, token, id } = req.query;
    const { cards } = getCards();

    let card;
    if (card_token) {
        card = cards.find(c => c.token === card_token);
    } else if (token && id && isValidToken(token)) {
        card = cards.find(c => c.id === parseInt(id));
    }

    if (!card || !card.data.image) return res.status(404).send('Brak zdjęcia');

    const base64 = card.data.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const mimeType = card.data.image.match(/data:([^;]+)/)?.[1] || 'image/jpeg';

    res.set('Content-Type', mimeType);
    res.send(buffer);
});

// ─── API: Lista plików do cache'owania ───────────────────────────────────────
app.get('/cache/files', (req, res) => {
    const assetsDir = path.join(__dirname, 'software/assets');
    const files = [];

    function walk(dir, base) {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const rel = path.join(base, item).replace(/\\/g, '/');
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath, rel);
            } else {
                files.push(rel);
            }
        });
    }

    walk(assetsDir, 'assets');
    res.json({ files });
});

// ─── API: Zapisz nowy dowód / edytuj istniejący ──────────────────────────────
// Używane przez generator.js: POST /submit { token, id, data }
app.post('/submit', (req, res) => {
    const { token, id, data } = req.body;

    if (!isValidToken(token)) return res.status(401).json({ error: 'Brak dostępu' });
    if (!data) return res.status(400).json({ error: 'Brak danych' });

    const cardsData = getCards();

    if (id && parseInt(id) !== 0) {
        // Edycja istniejącego
        const idx = cardsData.cards.findIndex(c => c.id === parseInt(id));
        if (idx !== -1) {
            cardsData.cards[idx].data = data;
            saveCards(cardsData);
            return res.status(200).json({ success: true });
        }
    }

    // Tworzenie nowego
    const cardToken = crypto.randomBytes(20).toString('hex');
    cardsData.cards.push({
        id: cardsData.nextId++,
        token: cardToken,
        data: data
    });
    saveCards(cardsData);

    res.status(200).json({ success: true, token: cardToken });
});

// ─── API: Panel - lista dowodów ──────────────────────────────────────────────
app.post('/panel/default', (req, res) => {
    const { token } = req.body;
    if (!isValidToken(token)) return res.status(401).json({ error: 'Brak dostępu' });

    const { cards } = getCards();
    const ids = cards.map(c => ({
        id: c.id,
        token: c.token,
        name: c.data.name || '',
        surname: c.data.surname || '',
        day: c.data.day || 1,
        month: c.data.month || 1,
        year: c.data.year || 2000
    }));

    res.json({ ids, limit: false, admin: true });
});

// ─── API: Panel admin ────────────────────────────────────────────────────────
app.post('/panel/admin', (req, res) => {
    const { token } = req.body;
    if (!isValidToken(token)) return res.status(401).json({ error: 'Brak dostępu' });

    const { cards } = getCards();
    const ids = cards.map(c => ({
        id: c.id,
        token: c.token,
        name: c.data.name || '',
        surname: c.data.surname || '',
        day: c.data.day || 1,
        month: c.data.month || 1,
        year: c.data.year || 2000
    }));

    res.json({ ids });
});

// ─── API: Usuń dowód ─────────────────────────────────────────────────────────
app.post('/panel/delete', (req, res) => {
    const { token, id } = req.body;
    if (!isValidToken(token)) return res.status(401).json({ error: 'Brak dostępu' });

    const cardsData = getCards();
    cardsData.cards = cardsData.cards.filter(c => c.id !== parseInt(id));
    saveCards(cardsData);

    res.json({ success: true });
});

// ─── Uruchomienie serwera ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const config = getConfig();
    console.log(`\n✅ Serwer działa na porcie ${PORT}`);
    console.log(`🔑 Token admina: ${config.adminToken}`);
    console.log(`🌐 Otwórz: http://localhost:${PORT}/login\n`);
});
