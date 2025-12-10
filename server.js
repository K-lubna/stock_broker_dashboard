const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const SUPPORTED_STOCKS = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'];
const HISTORY_LENGTH = 60; // Store 60 seconds of history for the graph

// --- Server State & Utility Functions ---

// In-memory price data
let currentPrices = SUPPORTED_STOCKS.reduce((acc, ticker) => {
    acc[ticker] = (Math.random() * 100) + 100; // Start between 100 and 200
    return acc;
}, {});

// In-memory price history (NEW)
let priceHistory = SUPPORTED_STOCKS.reduce((acc, ticker) => {
    // Populate history with initial prices for drawing
    acc[ticker] = new Array(HISTORY_LENGTH).fill(currentPrices[ticker]); 
    return acc;
}, {});

function loadUsers() {
    try {
        // Ensure the directory exists
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        const filePath = path.join(dataDir, 'users.json');
        
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '[]', 'utf8');
            return [];
        }

        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading users.json:", error.message);
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 4), 'utf8');
}

// --- Express Middleware & Routing ---

app.use(express.static('public')); 
app.use(express.json()); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// NEW: API Endpoint for Registration
app.post('/api/register', (req, res) => {
    const { email } = req.body;
    // NOTE: In a real app, you would handle the password here. 
    // Since the client doesn't send a password, we only check the email for uniqueness.
    
    const users = loadUsers();
    
    if (users.find(u => u.email === email)) {
        return res.status(409).json({ success: false, message: 'User already exists.' });
    }

    const token = 'token' + Math.random().toString(36).substring(2, 9); 
    const newUser = { email, token, subscribedStocks: [] };
    users.push(newUser);
    saveUsers(users);

    // After successful registration, log them in immediately and return token
    res.json({ success: true, token, email, subscribedStocks: newUser.subscribedStocks, message: "Registration successful. Logging you in..." });
});


// 1. API Endpoint for Login
app.post('/api/login', (req, res) => {
    const { email } = req.body;
    const users = loadUsers();
    
    let user = users.find(u => u.email === email);
    let token;

    if (user) {
        token = user.token;
    } else {
        // If the user doesn't exist, we send an error and ask them to register
        // NOTE: This logic changed slightly from the original to encourage registration
        return res.status(404).json({ success: false, message: 'User not found. Please register.' });
    }

    res.json({ success: true, token, email, subscribedStocks: user.subscribedStocks });
});

// 2. API Endpoint for Subscription
app.post('/api/subscribe', (req, res) => {
    const { token, ticker } = req.body;
    const users = loadUsers();
    let user = users.find(u => u.token === token);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!SUPPORTED_STOCKS.includes(ticker)) {
        return res.status(400).json({ success: false, message: 'Unsupported stock ticker.' });
    }

    if (!user.subscribedStocks.includes(ticker)) {
        user.subscribedStocks.push(ticker);
        saveUsers(users);
    }
    
    res.json({ success: true, message: `${ticker} subscribed.`, currentPrice: currentPrices[ticker] });
});

// NEW: API Endpoint for Unsubscribe (client requested this)
app.post('/api/unsubscribe', (req, res) => {
    const { token, ticker } = req.body;
    const users = loadUsers();
    let user = users.find(u => u.token === token);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const initialLength = user.subscribedStocks.length;
    user.subscribedStocks = user.subscribedStocks.filter(t => t !== ticker);

    if (user.subscribedStocks.length < initialLength) {
        saveUsers(users);
        res.json({ success: true, message: `${ticker} unsubscribed.` });
    } else {
        res.status(404).json({ success: false, message: 'Ticker not found in subscription list.' });
    }
});


// 3. API Endpoint for Initial History Fetch (NEW for Graphs)
app.get('/api/history/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    if (priceHistory[ticker]) {
        res.json({ success: true, history: priceHistory[ticker] });
    } else {
        res.status(404).json({ success: false, message: 'Ticker history not found.' });
    }
});

// NEW: Minimal Recommendation Logic (For Client Code)
app.get('/api/recommendations', (req, res) => {
    // In a real app, this would be based on real-time analysis.
    // Here, we provide a simple mock logic.
    const recs = [];
    const subscribed = loadUsers().find(u => u.token === req.query.token)?.subscribedStocks || [];
    const available = SUPPORTED_STOCKS.filter(t => !subscribed.includes(t));

    if (available.length > 0) {
        const recTicker = available[Math.floor(Math.random() * available.length)];
        recs.push({
            ticker: recTicker,
            signalType: 'BUY',
            reason: `Strong volume detected in ${recTicker}. Potential upward momentum.`
        });
    }

    res.json({ success: true, recommendations: recs });
});


// --- WebSocket (Real-time Engine) ---

const clientSubscriptions = new Map(); 

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');

    if (!token) {
        ws.close(1008, 'Token required for WebSocket connection.');
        return;
    }
    
    const users = loadUsers();
    const user = users.find(u => u.token === token);

    if (!user) {
        ws.close(1008, 'Invalid token.');
        return;
    }

    clientSubscriptions.set(ws, user.subscribedStocks);
    // console.log(`Client connected: ${user.email}. Subscribed to: ${user.subscribedStocks.join(', ')}`);

    ws.on('close', () => {
        clientSubscriptions.delete(ws);
        // console.log(`Client disconnected.`);
    });
});

// Price Update and Broadcast Function
function updateAndBroadcastPrices() {
    // 1. Update prices for all supported stocks
    for (const ticker of SUPPORTED_STOCKS) {
        let current = currentPrices[ticker];
        const changeFactor = (Math.random() - 0.5) * 0.03; 
        let newPrice = current * (1 + changeFactor);
        if (newPrice < 1) newPrice = 1; 
        
        currentPrices[ticker] = newPrice;
        
        // Update price history (NEW)
        if (priceHistory[ticker].length >= HISTORY_LENGTH) {
            priceHistory[ticker].shift(); // Remove oldest
        }
        priceHistory[ticker].push(newPrice); // Add newest

        const priceUpdateMessage = JSON.stringify({
            ticker: ticker,
            price: newPrice.toFixed(2)
        });

        // 2. Broadcast updated price only to clients who are subscribed
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const subscribedTickers = clientSubscriptions.get(client);
                
                if (subscribedTickers && subscribedTickers.includes(ticker)) {
                    client.send(priceUpdateMessage);
                }
            }
        });
    }
}

// Start the real-time engine
setInterval(updateAndBroadcastPrices, 1000); 


server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('---');
    console.log('API Endpoints Ready: /api/login, /api/register, /api/subscribe, /api/unsubscribe, /api/history/:ticker, /api/recommendations');
    console.log(`WebSocket Server Ready at ws://localhost:${PORT}`);
    console.log('---');
});
