const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;            
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:5000';

// ===================================
// MIDDLEWARE
// ===================================

// CORS - Allow all origins for mobile
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// ===================================
// STATIC FILES
// ===================================
app.use(express.static(path.join(__dirname, 'public')));

// ===================================
// API ROUTES
// ===================================

// Configuration endpoint - for mobile app to get API URLs
app.get('/config', (req, res) => {
  const hostname = req.hostname;
  const protocol = req.protocol;
  
  // Determine if request is from localhost or network
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // Get the IP from the Host header if available
  const host = req.get('host');
  const ip = host ? host.split(':')[0] : hostname;
  
  const config = {
    apiUrl: `${MAIN_BACKEND_URL}/v1`,
    socketUrl: MAIN_BACKEND_URL,
    environment: process.env.NODE_ENV || 'development'
  };
  
  console.log('📡 Configuration requested from:', ip);
  console.log('📤 Sending config:', config);
  
  res.json(config);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mainBackend: MAIN_BACKEND_URL
  });
});

// ===================================
// PROXY CUSTOMER API TO MAIN BACKEND
// ===================================
app.post('/customer/initiate', async (req, res) => {
  try {
    console.log('📡 Proxying customer initiate to main backend');
    console.log('🔗 Target:', `${MAIN_BACKEND_URL}/v1/webrtc/customer/initiate`);
    console.log('📦 Body:', req.body);
    
    const response = await axios.post(
      `${MAIN_BACKEND_URL}/v1/webrtc/customer/initiate`,
      req.body,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log('✅ Main backend response:', response.data);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    
    if (error.response) {
      // Backend returned an error
      console.error('Backend error response:', error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.error('No response from backend');
      res.status(503).json({
        success: false,
        message: 'Cannot connect to backend server. Please check if the backend is running.'
      });
    } else {
      // Something else happened
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
});

// ===================================
// CATCH-ALL FOR SPA
// ===================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================
// ERROR HANDLER
// ===================================
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// ===================================
// START SERVER
// ===================================
const server = app.listen(PORT, '0.0.0.0', () => {
  const hostname = require('os').hostname();
  const networkInterfaces = require('os').networkInterfaces();
  
  // Get all network IPs
  const ips = [];
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    });
  });
  
  console.log('\n========================================');
  console.log('📱 Mobile App Backend Started');
  console.log('========================================');
  console.log(`🌍 Port: ${PORT}`);
  console.log(`🔗 Main Backend: ${MAIN_BACKEND_URL}`);
  console.log('\n🎯 Access URLs:');
  console.log(`   Local:        http://localhost:${PORT}`);
  console.log(`   Local:        http://127.0.0.1:${PORT}`);
  ips.forEach(ip => {
    console.log(`   Network:      http://${ip}:${PORT}`);
  });
  console.log('\n📡 Services Running:');
  console.log('   ✓ HTTP Server (Static Files)');
  console.log('   ✓ API Proxy (to Main Backend)');
  console.log(`   ✓ Socket.IO: ${MAIN_BACKEND_URL} (Shared with Agent)`);
  console.log('\n⚠️  Note: Customer connects to Main Backend Socket.IO');
  console.log('   Both Agent and Customer use the same Socket.IO server');
  console.log('========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});