document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Variables
    const userEmail = localStorage.getItem('userEmail');
    const userToken = localStorage.getItem('userToken');
    const emailDisplay = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const stockContainer = document.getElementById('stock-container');
    const subscribeForm = document.getElementById('subscribe-form');
    const subscribeStatus = document.getElementById('subscribe-status');
    const noStocksMessage = document.getElementById('no-stocks-message');
    const recList = document.getElementById('recommendation-list'); // NEW Element for suggestions
    
    const historyData = {}; 

    // 1. Authentication Check & Logout
    if (!userToken || !userEmail) {
        window.location.href = '/login.html';
        return;
    }

    emailDisplay.textContent = userEmail;
    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/login.html';
    });
    
    // =========================================================================
    // 2. NEW: Unsubscribe Logic (Must be global for inline 'onclick')
    // =========================================================================

    async function unsubscribeStock(ticker) {
        const token = localStorage.getItem('userToken');
        if (!token) {
            alert("Session expired. Please log in again.");
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, ticker: ticker })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`${ticker} successfully removed.`);
                
                const stockElement = document.getElementById(`stock-${ticker}`);
                if (stockElement) {
                    stockElement.remove();
                }
                
                const container = document.getElementById('stock-container');
                const message = document.getElementById('no-stocks-message');
                if (container && container.children.length === 0 && message) {
                    message.style.display = 'block';
                }
                
                // IMPORTANT: Reload recommendations when watchlist changes
                loadRecommendations(); 
                
            } else {
                alert(`Failed to remove ${ticker}: ${result.message}`);
            }
        } catch (error) {
            console.error('Error during unsubscribe:', error);
            alert('A network error occurred while trying to unsubscribe.');
        }
    }
    
    window.unsubscribeStock = unsubscribeStock;

    
    // =========================================================================
    // 3. Subscription & Data Load Functions
    // =========================================================================

    async function loadSubscriptions() {
        try {
            // Using the /api/login endpoint as per your current code structure
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail })
            });

            const data = await response.json();
            if (data.success) {
                stockContainer.innerHTML = '';
                
                data.subscribedStocks.forEach(ticker => {
                    createStockCard(ticker);
                    fetchInitialHistory(ticker); 
                });
                
                if (data.subscribedStocks.length > 0) {
                    noStocksMessage.style.display = 'none';
                } else {
                    noStocksMessage.style.display = 'block';
                }
                
                connectWebSocket(userToken); 
            }
        } catch (error) {
            console.error('Initial load error:', error);
        }
    }

    async function fetchInitialHistory(ticker) {
        try {
            const response = await fetch(`http://localhost:3000/api/history/${ticker}`);
            const data = await response.json();
            if (data.success && data.history.length > 0) {
                drawMiniChart(ticker, data.history);
            }
        } catch (error) {
            console.error(`Error fetching history for ${ticker}:`, error);
        }
    }

    // 4. Stock Card DOM Manipulation (UNMODIFIED)
    function createStockCard(ticker) {
        if (document.getElementById(`stock-${ticker}`)) return;

        const card = document.createElement('div');
        card.className = 'stock-card';
        card.id = `stock-${ticker}`;
        
        card.innerHTML = `
            <div class="ticker-info">
                <div class="ticker">${ticker}</div>
                <div class="price-box">
                    <span class="currency">$</span>
                    <span class="price" id="price-${ticker}">--.--</span>
                </div>
            </div>
            <div class="chart-area">
                <canvas id="chart-${ticker}" width="150" height="50"></canvas>
            </div>
            <div class="controls">
                <div class="change" id="change-${ticker}">N/A</div>
                <button class="remove-btn" onclick="unsubscribeStock('${ticker}')">Remove</button>
            </div>
        `;
        stockContainer.appendChild(card);
        noStocksMessage.style.display = 'none';
    }

    // 5. Canvas Drawing Function (UNMODIFIED)
    function drawMiniChart(ticker, history) {
        historyData[ticker] = history; 
        
        const canvas = document.getElementById(`chart-${ticker}`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);

        if (history.length < 2) return;

        const max = Math.max(...history);
        const min = Math.min(...history);
        const range = max === min ? 1 : max - min; 
        
        const color = history[history.length - 1] >= history[0] ? '#28a745' : '#dc3545';
        
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        
        const pointWidth = width / (history.length - 1 || 1); 

        history.forEach((price, index) => {
            const normalizedY = (price - min) / range;
            const yPos = (height - 5) - (normalizedY * (height - 10)) + 5; 
            const xPos = index * pointWidth;

            if (index === 0) {
                ctx.moveTo(xPos, yPos);
            } else {
                ctx.lineTo(xPos, yPos);
            }
        });

        ctx.stroke();
    }

    // 6. Update Price Logic (UNMODIFIED)
    function updateStockPrice(ticker, newPrice) {
        const priceElement = document.getElementById(`price-${ticker}`);
        const changeElement = document.getElementById(`change-${ticker}`);

        if (priceElement && changeElement) {
            const currentPrice = parseFloat(priceElement.textContent || newPrice); 
            const price = parseFloat(newPrice);
            const change = price - currentPrice;
            
            // Visual Cues
            if (change > 0) {
                priceElement.className = 'price price-up';
                changeElement.textContent = `+${change.toFixed(2)}`;
            } else if (change < 0) {
                priceElement.className = 'price price-down';
                changeElement.textContent = change.toFixed(2);
            } else {
                 priceElement.className = 'price';
                 changeElement.textContent = '0.00';
            }
            
            priceElement.textContent = price.toFixed(2);

            // Flash effect cleanup
            setTimeout(() => {
                if (priceElement) priceElement.className = 'price';
            }, 500);

            // Chart Update Logic
            if (historyData[ticker]) {
                if (historyData[ticker].length >= 60) {
                    historyData[ticker].shift();
                }
                historyData[ticker].push(price);
                
                drawMiniChart(ticker, historyData[ticker]);
            }
        }
    }


    // 7. WebSocket Connection (UNMODIFIED)
    function connectWebSocket(token) {
        const ws = new WebSocket(`ws://localhost:3000?token=${token}`);

        ws.onopen = () => console.log('WebSocket connection established.');
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                updateStockPrice(data.ticker, data.price);
            } catch (error) {
                console.error('Error parsing WebSocket message:', event.data, error);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed. Attempting to reconnect in 5 seconds...');
            setTimeout(() => connectWebSocket(token), 5000);
        };

        ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    // 8. Subscription Handler (UNMODIFIED)
    subscribeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticker = document.getElementById('ticker-select').value;
        
        if (!ticker) return;

        try {
            const response = await fetch('http://localhost:3000/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: userToken, ticker })
            });
            
            const data = await response.json();

            if (data.success) {
                loadSubscriptions(); 
                subscribeStatus.textContent = `${ticker} subscribed successfully!`;
                subscribeStatus.style.color = 'green';
            } else {
                subscribeStatus.textContent = `Subscription failed: ${data.message}`;
                subscribeStatus.style.color = 'red';
            }
        } catch (error) {
            subscribeStatus.textContent = 'Error communicating with server.';
            subscribeStatus.style.color = 'red';
            console.error('Subscription API error:', error);
        }
        
        setTimeout(() => subscribeStatus.textContent = '', 3000);
    });
    
    
    // =========================================================================
    // 9. NEW: Stock Recommendation Logic
    // =========================================================================

    /**
     * Fetches real-time stock recommendations and updates the suggestions list.
     */
    async function loadRecommendations() {
        if (!recList) return;
        
        // Show a loading message while fetching
        recList.innerHTML = '<p id="no-recommendations">Analyzing market movement...</p>';

        try {
            // NOTE: Fetching from a new endpoint '/api/recommendations'
            const response = await fetch(`http://localhost:3000/api/recommendations?token=${userToken}`); 
            const data = await response.json();

            if (data.success && data.recommendations && data.recommendations.length > 0) {
                recList.innerHTML = ''; // Clear loading message
                data.recommendations.forEach(rec => {
                    const item = document.createElement('div');
                    item.className = 'recommendation-item';
                    
                    // Display Ticker, Signal Type, and Rationale (No buttons)
                    item.innerHTML = `
                        <span class="rec-ticker">${rec.ticker}</span>
                        <span class="rec-signal signal-${rec.signalType.toLowerCase()}">${rec.signalType}</span>
                        <p class="rec-reason">${rec.reason}</p>
                    `; 
                    recList.appendChild(item);
                });
                
            } else {
                recList.innerHTML = `<p id="no-recommendations">No strong signals detected this moment.</p>`;
            }
        } catch (error) {
            recList.innerHTML = `<p class="error-text">Failed to load suggestions.</p>`;
        }
    }
    
    // 10. Start the application
    loadSubscriptions(); 
    loadRecommendations();
    
    // Refresh recommendations every 5 seconds for real-time signaling
    setInterval(loadRecommendations, 5000); 
});
