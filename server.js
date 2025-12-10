// --- Updated server.js (Copy/Paste Ready) ---
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // <--- 1. REQUIRE CORS HERE

// --- CRITICAL CONFIGURATION FOR CLOUD DEPLOYMENT ---
// 1. Dynamic Port: Use the port assigned by Render, or default to 3000 locally.
const PORT = process.env.PORT || 3000;
// 2. Data File Paths: Ensure the data directory exists and define the file path.
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// --- HELPER FUNCTIONS ---
// ... (loadUsers and saveUsers functions remain the same)
function loadUsers() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Data directory created at: ${DATA_DIR}`);
    }
    if (fs.existsSync(USERS_FILE)) {
        try {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error('Error reading or parsing users.json:', e);
            return {};
        }
    }
    return {};
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving users.json:', e);
    }
}

let users = loadUsers();

// 🛑 CRITICAL FIX (from previous step): ENSURE DEFAULT TEST USER EXISTS IN MEMORY
const DEFAULT_TEST_EMAIL = "your_login_email@example.com"; // <--- REMEMBER TO CHANGE THIS!

if (!users[DEFAULT_TEST_EMAIL]) {
    console.log(`[BOOTSTRAP] Creating default test user with stocks: ${DEFAULT_TEST_EMAIL}`);
    const defaultToken = Buffer.from(DEFAULT_TEST_EMAIL).toString('base64');
    
    users[DEFAULT_TEST_EMAIL] = {
        token: defaultToken,
        subscribedStocks: ['GOOG', 'TSLA', 'AMZN', 'MSFT'], 
        history: {}
    };
    saveUsers(users); 
}
// ----------------------------------------------------------------------


// --- EXPRESS SERVER SETUP ---
const app = express();
const server = http.createServer(app); 

// 3. Trust Proxy: Essential for secure cloud deployment (WSS -> WS conversion)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cors()); // <--- 2. USE CORS MIDDLEWARE HERE (Allows all origins)

// Serve static files from the 'public' directory
app.use(express.static('public'));

// ... (The rest of your API routes and WebSocket logic is UNCHANGED) ...
// (All the /api/register, /api/login, /api/history, wss.on('connection'), etc., go here)

// --- API ROUTES ---
// Helper function to get a user token (simplified)
function generateToken(email) {
    return Buffer.from(email).toString('base64');
}

// 1. Registration Route
app.post('/api/register', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required.' });

    if (users[email]) {
        return res.json({ success: false, message: 'User already exists. Please log in.' });
    }

    // Create new user
    const token = generateToken(email);
    users[email] = {
        token: token,
        subscribedStocks: ['GOOG', 'TSLA'], // Default subscriptions for new registrations
        history: {}
    };
    saveUsers(users);

    res.json({ success: true, token, message: 'Registration successful. Logging in...' });
});

// 2. Login/Authentication Route (Also used to fetch subscriptions)
app.post('/api/login', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required.' });

    const user = users[email];
    if (!user) {
        // If user not found, they must register first.
        return res.json({ success: false, message: 'User not found. Please register.' });
    }

    // Generate a fresh token and send subscriptions
    const token = generateToken(email);
    user.token = token;
    saveUsers(users);

    res.json({ 
        success: true, 
        token: user.token,
        subscribedStocks: user.subscribedStocks // This list is now guaranteed to have stocks (from the fix above)
    });
});

// 3. Subscription Route
app.post('/api/subscribe', (req, res) => {
    const { token, ticker } = req.body;
    const user = Object.values(users).find(u => u.token === token);

    if (!user || !ticker) return res.status(401).json({ success: false, message: 'Invalid credentials or missing ticker.' });
    if (user.subscribedStocks.includes(ticker)) return res.json({ success: false, message: `${ticker} is already subscribed.` });

    user.subscribedStocks.push(ticker);
    saveUsers(users);
    res.json({ success: true, message: `${ticker} added.` });
});

// 4. Unsubscribe Route
// --- In server.js ---

// 4. Unsubscribe Route
app.post('/api/unsubscribe', (req, res) => {
    // 1. Destructure the email from the body
    const { token, ticker, email } = req.body; 
    
    // 2. FIND USER BY EMAIL (the reliable way)
    const user = users[email]; 

    // 3. Check for valid user and ticker
    if (!user || !ticker) return res.status(401).json({ success: false, message: 'Invalid credentials or missing ticker.' });

    // (The rest of the logic remains the same)
    const index = user.subscribedStocks.indexOf(ticker);
    if (index > -1) {
        user.subscribedStocks.splice(index, 1);
        saveUsers(users);
        res.json({ success: true, message: `${ticker} removed.` });
    } else {
        // This is the error message you were getting! 
        // It happens when the lookup by token (the old way) failed, 
        // but let's leave the message in case the array is manipulated manually.
        res.json({ success: false, message: `${ticker} was not found in your subscriptions.` });
    }
});
// 5. Initial History Data Route (Used for chart creation)
app.get('/api/history/:ticker', (req, res) => {
    const { ticker } = req.params;
    // Simulate initial historical data (60 points)
    const history = Array.from({ length: 60 }, () => parseFloat((Math.random() * 100).toFixed(2)));
    res.json({ success: true, ticker, history });
});

// 6. Recommendation Route (Simulated smart signals)
app.get('/api/recommendations', (req, res) => {
    const signals = ['BUY', 'DIP', 'HOLD', 'SELL'];
    const tickers = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA', 'SPOT', 'ADBE'];
    
    // Select 1 to 3 random signals
    const numSignals = Math.floor(Math.random() * 3) + 1;
    const recommendations = [];

    for (let i = 0; i < numSignals; i++) {
        const signalType = signals[Math.floor(Math.random() * signals.length)];
        const ticker = tickers[Math.floor(Math.random() * tickers.length)];
        
        recommendations.push({
            ticker,
            signalType,
            reason: `Market indicator suggests a ${signalType.toLowerCase()} opportunity in ${ticker}.`
        });
    }

    res.json({ success: true, recommendations });
});


// --- WEB SOCKET SERVER SETUP ---
const wss = new WebSocket.Server({ server });
const connectedClients = new Map(); 

// Token authentication helper for WS connections
function authenticateToken(token) {
    return Object.values(users).find(u => u.token === token);
}

wss.on('connection', (ws, req) => {
    // 1. Authenticate connection via URL token
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');
    
    const user = authenticateToken(token);
    if (!user) {
        ws.close(1008, 'Authentication failed');
        return;
    }

    // 2. Map the token to the WebSocket connection
    connectedClients.set(token, ws);
    console.log(`Client connected: ${user.token}. Total clients: ${connectedClients.size}`);

    // 3. Handle disconnection
    ws.on('close', () => {
        connectedClients.delete(token);
        console.log(`Client disconnected: ${user.token}. Remaining: ${connectedClients.size}`);
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket Error for client ${user.token}:`, error);
    });
});


// --- REAL-TIME DATA STREAM (SIMULATED) ---
const priceData = {
    GOOG: 140.00, TSLA: 250.00, AMZN: 180.00, META: 400.00, NVDA: 900.00, SPOT: 120.00, ADBE: 550.00
};

// Start a data stream interval (e.g., every second)
setInterval(() => {
    // 1. Update simulated prices randomly
    for (const ticker in priceData) {
        const change = (Math.random() * 2 - 1) * 0.5; // +/- 0.5% change max
        priceData[ticker] = parseFloat((priceData[ticker] + change).toFixed(2));
    }

    // 2. Broadcast updated prices to subscribed clients
    connectedClients.forEach((ws, token) => {
        const user = authenticateToken(token);
        if (!user || ws.readyState !== WebSocket.OPEN) return;

        user.subscribedStocks.forEach(ticker => {
            if (priceData[ticker] !== undefined) {
                const message = JSON.stringify({ 
                    ticker: ticker, 
                    price: priceData[ticker] 
                });
                ws.send(message);
            }
        });
    });
}, 1000); // 1000ms = 1 second interval


// --- START THE SERVER ---
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
