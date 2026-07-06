const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
 
const app = express();
 
// Configuration constants
const BOOMI_USERNAME = "dbiz-MV90UC.0YFZAO";
const BOOMI_PASSWORD = "6710d7c5-1f74-49c3-a026-9bb4fc88d2e6";
const BOOMI_ENDPOINT = "https://c01-aus.integrate-test.boomi.com/ws/rest/southerncross/chatbot";
const BOOMI_SESSION_ENDPOINT = "https://c01-aus.integrate-test.boomi.com/ws/rest/southerncross/session";
const SESSION_GET_TIMEOUT = 60000; // 60 seconds
const AGENT_TIMEOUT = 120000; // 120 seconds
const SESSION_SAVE_TIMEOUT = 60000; // 60 seconds
const MAX_HISTORY_CHARS = 12000;
const HISTORY_CACHE_TTL_SECONDS = 900; // 15 minutes
const LATENCY_LOG_FILE = path.join(__dirname, 'latency_logs.jsonl');
 
// Keep-alive configuration
const KEEP_ALIVE_ENABLED = process.env.ENABLE_KEEP_ALIVE === 'true';
const APP_URL = process.env.APP_URL || '';
 
// In-memory cache for session history
const historyCache = new Map();
 
// Create auth header
const authString = Buffer.from(`${BOOMI_USERNAME}:${BOOMI_PASSWORD}`).toString('base64');
const HEADERS = {
    'Authorization': `Basic ${authString}`,
    'Content-Type': 'application/json'
};
 
// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
 
// Logging function for latencies
function logLatency(event) {
    try {
        const logEntry = JSON.stringify(event) + '\n';
        fs.appendFileSync(LATENCY_LOG_FILE, logEntry);
    } catch (error) {
        console.warn('Failed to log latency:', error.message);
    }
}
 
// Utility functions
function extractHistory(payload) {
    if (!payload) return "";
 
    if (typeof payload === 'string') {
        const xmlMatch = payload.match(/<History__c>(.*?)<\/History__c>/s);
        if (xmlMatch) {
            return xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
        }
        return payload.trim();
    }
 
    if (typeof payload === 'object' && payload !== null) {
        if (Array.isArray(payload)) {
            for (const item of payload) {
                const found = extractHistory(item);
                if (found) return found;
            }
        } else {
            // Check specific keys first
            const keys = ['History__c', 'history', 'History', 'conversationHistory'];
            for (const key of keys) {
                if (typeof payload[key] === 'string') {
                    return payload[key];
                }
            }
            // Check all values
            for (const value of Object.values(payload)) {
                const found = extractHistory(value);
                if (found) return found;
            }
        }
    }
 
    return "";
}
 
function normalizeHistory(history) {
    if (!history) return "";
 
    let normalized = history.trim();
    for (let i = 0; i < 3; i++) {
        const xmlMatch = normalized.match(/<History__c>(.*?)<\/History__c>/s);
        if (!xmlMatch) break;
        normalized = xmlMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
    }
 
    return normalized;
}
 
function trimHistory(history) {
    if (!history || history.length <= MAX_HISTORY_CHARS) {
        return history || "";
    }
    return history.slice(-MAX_HISTORY_CHARS);
}
 
function buildAgentMessage(existingHistory, userMessage) {
    if (existingHistory && existingHistory.trim()) {
        return `${existingHistory.trim()}\nUser: ${userMessage} Continue the conversation naturally`;
    }
    return `User: ${userMessage} Continue the conversation naturally`;
}
 
function appendHistory(existingHistory, userMessage, agentMessage) {
    const current = `User: ${userMessage}\nAgent: ${agentMessage}`;
    if (existingHistory && existingHistory.trim()) {
        return `${existingHistory.trim()}\n${current}`;
    }
    return current;
}
 
function getCachedHistory(sessionId) {
    const entry = historyCache.get(sessionId);
    if (!entry) return null;
 
    const [history, expiresAt] = entry;
    if (Date.now() > expiresAt) {
        historyCache.delete(sessionId);
        return null;
    }
 
    return history;
}
 
function setCachedHistory(sessionId, history) {
    const expiresAt = Date.now() + (HISTORY_CACHE_TTL_SECONDS * 1000);
    historyCache.set(sessionId, [history, expiresAt]);
}
 
// Async function to save history to Boomi
async function saveHistoryToBoomi(sessionId, history) {
    try {
        await axios.post(BOOMI_SESSION_ENDPOINT, {
            action: 'SAVE',
            sessionId: sessionId,
            history: history
        }, {
            headers: HEADERS,
            timeout: SESSION_SAVE_TIMEOUT
        });
    } catch (error) {
        console.warn(`[WARN] Async SAVE failed for session ${sessionId}:`, error.message);
    }
}
 
function nowMs() {
    return performance.now();
}
 
// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const requestId = `req_${uuidv4().substring(0, 12)}`;
    const requestStartMs = nowMs();
 
    console.log(`🔵 Chat request ${requestId}: ${req.ip}`);
 
    const metrics = {
        request_id: requestId,
        event: "chat_request",
        cache_hit: false,
        session_get_ms: 0,
        agent_ms: 0,
        save_enqueue_ms: 0,
        history_len: 0,
        prompt_len: 0
    };
 
    try {
        const { session_id: sessionId, message } = req.body;
       
        console.log(`📝 Message from session ${sessionId || 'new'}: ${message}`);
 
        if (!message) {
            const totalMs = Math.round(nowMs() - requestStartMs);
            logLatency({
                ...metrics,
                status: 400,
                error: "missing_input",
                total_ms: totalMs,
                session_id: sessionId || ""
            });
            return res.status(400).json({
                error: 'Missing message',
                request_id: requestId
            });
        }
 
        // 1) Fetch existing session history (cache-first)
        let existingHistory = "";
        if (sessionId) {
            existingHistory = getCachedHistory(sessionId);
            metrics.cache_hit = existingHistory !== null;
        }
 
        if (sessionId && existingHistory === null) {
            try {
                const getStartMs = nowMs();
                const sessionGetResponse = await axios.post(BOOMI_SESSION_ENDPOINT, {
                    action: 'GET',
                    sessionId: sessionId
                }, {
                    headers: HEADERS,
                    timeout: SESSION_GET_TIMEOUT
                });
                metrics.session_get_ms = Math.round(nowMs() - getStartMs);
 
                const sessionData = sessionGetResponse.data;
                existingHistory = trimHistory(normalizeHistory(extractHistory(sessionData)));
                setCachedHistory(sessionId, existingHistory);
            } catch (error) {
                const totalMs = Math.round(nowMs() - requestStartMs);
                const errorType = error.code === 'ECONNABORTED' ? 'session_get_timeout' : 'session_get_failed';
                const statusCode = error.code === 'ECONNABORTED' ? 504 : (error.response?.status || 500);
 
                logLatency({
                    ...metrics,
                    status: statusCode,
                    error: errorType,
                    total_ms: totalMs,
                    session_id: sessionId
                });
 
                return res.status(statusCode).json({
                    error: error.code === 'ECONNABORTED'
                        ? `Session GET timed out after ${SESSION_GET_TIMEOUT / 1000}s`
                        : `Session GET failed: ${error.response?.status || error.message}`,
                    request_id: requestId
                });
            }
        }
 
        metrics.history_len = (existingHistory || "").length;
 
        // 2) Build context-aware prompt for agent
        const prompt = buildAgentMessage(existingHistory, message);
        metrics.prompt_len = prompt.length;
 
        // 3) Send to Boomi agent
        let agentResponse;
        try {
            const agentStartMs = nowMs();
            const agentPayload = { message: prompt };
            if (sessionId) {
                agentPayload.session_id = sessionId;
            }
 
            agentResponse = await axios.post(BOOMI_ENDPOINT, agentPayload, {
                headers: HEADERS,
                timeout: AGENT_TIMEOUT
            });
            metrics.agent_ms = Math.round(nowMs() - agentStartMs);
        } catch (error) {
            const totalMs = Math.round(nowMs() - requestStartMs);
            const errorType = error.code === 'ECONNABORTED' ? 'agent_timeout' : 'agent_failed';
            const statusCode = error.code === 'ECONNABORTED' ? 504 : (error.response?.status || 500);
 
            logLatency({
                ...metrics,
                status: statusCode,
                error: errorType,
                total_ms: totalMs,
                session_id: sessionId
            });
 
            return res.status(statusCode).json({
                error: error.code === 'ECONNABORTED'
                    ? `Boomi agent timed out after ${AGENT_TIMEOUT / 1000}s`
                    : `Boomi agent failed: ${error.response?.status || error.message}`,
                request_id: requestId
            });
        }
 
        // Parse agent response
        const agentData = agentResponse.data;
        let responseText, updatedSessionId;
 
        if (typeof agentData === 'object' && agentData !== null) {
            responseText = agentData.response || agentData.message || "Sorry, I didn't get that.";
            updatedSessionId = agentData.session_id || sessionId || "";
        } else if (typeof agentData === 'string' && agentData.trim()) {
            responseText = agentData;
            updatedSessionId = sessionId || "";
        } else {
            responseText = "Sorry, I didn't get that.";
            updatedSessionId = sessionId || "";
        }
 
        // 4) Update cache + save updated history in background
        const updatedHistory = trimHistory(appendHistory(existingHistory, message, responseText));
        if (updatedSessionId) {
            setCachedHistory(updatedSessionId, updatedHistory);
            const saveEnqueueStartMs = nowMs();
            // Fire and forget - save in background
            saveHistoryToBoomi(updatedSessionId, updatedHistory);
            metrics.save_enqueue_ms = Math.round(nowMs() - saveEnqueueStartMs);
        }
 
        const totalMs = Math.round(nowMs() - requestStartMs);
        logLatency({
            ...metrics,
            status: 200,
            error: "",
            total_ms: totalMs,
            session_id: updatedSessionId
        });
 
        res.json({
            response: responseText,
            session_id: updatedSessionId,
            request_id: requestId
        });
 
    } catch (error) {
        const totalMs = Math.round(nowMs() - requestStartMs);
        logLatency({
            ...metrics,
            status: 500,
            error: "unhandled_exception",
            total_ms: totalMs,
            session_id: "",
            exception: error.message
        });
 
        res.status(500).json({
            error: error.message,
            request_id: requestId
        });
    }
});
 
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now()
    });
});
 
// Test endpoint
app.get('/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Test endpoint is working',
        boomi_endpoints: {
            chat: BOOMI_ENDPOINT,
            session: BOOMI_SESSION_ENDPOINT
        },
        environment: {
            keep_alive: KEEP_ALIVE_ENABLED,
            app_url: APP_URL
        }
    });
});
 
// Self-ping function for keep alive
async function selfPing() {
    if (!APP_URL) return;
 
    try {
        const response = await axios.get(`${APP_URL.replace(/\/$/, '')}/health`, { timeout: 30000 });
        if (response.status === 200) {
            console.log(`✅ Self-ping successful at ${new Date().toISOString()}`);
        } else {
            console.log(`⚠️ Self-ping returned ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ Self-ping failed: ${error.message}`);
    }
}
 
// Start keep-alive mechanism
function startKeepAlive() {
    if (!KEEP_ALIVE_ENABLED || !APP_URL) return;
 
    // Ping every 10 minutes
    schedule.scheduleJob('*/10 * * * *', selfPing);
    console.log(`🟢 Keep-alive enabled for ${APP_URL}`);
}
 
// Serve chat widget
app.get('/chat', (req, res) => {
    try {
        const htmlPath = path.join(__dirname, 'public', 'scc_chat_widget.html');
        if (fs.existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            res.status(404).send('Chat widget not found');
        }
    } catch (error) {
        res.status(500).send('Error loading chat widget');
    }
});
 
// Root endpoint
app.get('/', (req, res) => {
    res.type('html').send(`
    <html>
    <head><title>SCC Chatbot Proxy</title></head>
    <body>
        <h1>🤖 Southern Cross Care Chatbot Proxy Server</h1>
        <p><strong>Server Status:</strong> ✅ Running</p>
        <h2>Available Endpoints:</h2>
        <ul>
            <li><code>POST /api/chat</code> - Chat API endpoint</li>
            <li><code>GET /health</code> - Health check</li>
            <li><code>GET /test</code> - Test endpoint for debugging</li>
            <li><code>GET /chat</code> - <a href="/chat">Chat Widget Interface</a></li>
        </ul>
        <h2>Quick Access:</h2>
        <p><a href="/chat" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">🚀 Open Chat Widget</a></p>
        <p>The chat widget now dynamically connects to the correct API endpoint</p>
    </body>
    </html>
    `);
});
 
// D-ID Proxy Endpoint to avoid CORS
app.all('/api/d-id-proxy/*', async (req, res) => {
    try {
        const didPath = req.params[0]; // Get the path after /api/d-id-proxy/
        const didUrl = `https://api.d-id.com/${didPath}`;
       
        console.log(`🔄 Proxying D-ID request: ${req.method} ${didUrl}`);
       
        // Forward the request to D-ID
        const response = await axios({
            method: req.method,
            url: didUrl,
            headers: {
                ...req.headers,
                'host': 'api.d-id.com', // Override host header
            },
            data: req.body,
            validateStatus: () => true // Don't throw on any status
        });
       
        // Set CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', '*');
       
        // Forward response
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('D-ID proxy error:', error.message);
        res.status(500).json({ error: 'Proxy error', details: error.message });
    }
});
 
// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
 
// Initialize keep-alive
if (KEEP_ALIVE_ENABLED && APP_URL) {
    startKeepAlive();
}
 
app.listen(PORT, HOST, () => {
    console.log(`🚀 Starting SCC Chatbot on ${HOST}:${PORT}`);
    console.log(`📱 Chat widget available at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/chat`);
    console.log(`🔍 Health check at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`);
});
