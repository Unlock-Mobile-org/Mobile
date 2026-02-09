// ===================================
// MOBILE APP.JS - WITH RECONNECTION
// ===================================

let SOCKET_URL = '';
let API_BASE_URL = '';

let sessionData = {
    vcipId: null,
    connectionId: null,
    sessionToken: null,
    permissions: { microphone: false, camera: false, location: false },
    location: { latitude: null, longitude: null }
};

let callTimer = null;
let callStartTime = null;
let isMuted = false;
let isVideoOff = false;
let keepAliveInterval = null;

// ✅ SESSION PERSISTENCE
const SESSION_STORAGE_KEY = 'digikhata_vkyc_session';

// ✅ Save session to localStorage
function saveSession() {
    if (sessionData.connectionId) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
            vcipId: sessionData.vcipId,
            connectionId: sessionData.connectionId,
            sessionToken: sessionData.sessionToken,
            timestamp: Date.now()
        }));
        console.log('💾 Session saved to localStorage');
    }
}

// ✅ Load session from localStorage
function loadSession() {
    try {
        const saved = localStorage.getItem(SESSION_STORAGE_KEY);
        if (saved) {
            const session = JSON.parse(saved);
            // Check if session is less than 2 hours old
            const twoHours = 2 * 60 * 60 * 1000;
            if (Date.now() - session.timestamp < twoHours) {
                sessionData.vcipId = session.vcipId;
                sessionData.connectionId = session.connectionId;
                sessionData.sessionToken = session.sessionToken;
                console.log('✅ Session restored from localStorage:', sessionData.connectionId);
                return true;
            } else {
                console.log('⏰ Session expired, clearing...');
                localStorage.removeItem(SESSION_STORAGE_KEY);
            }
        }
    } catch (error) {
        console.error('❌ Error loading session:', error);
    }
    return false;
}

// ✅ Clear session
function clearSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('🗑️ Session cleared');
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        SOCKET_URL = config.socketUrl;
        API_BASE_URL = window.location.origin;
        console.log('✅ Config loaded:', { SOCKET_URL, API_BASE_URL });
    } catch (error) {
        console.error('❌ Config failed:', error);
        alert('Failed to connect. Please refresh.');
    }
}

function showScreen(screenId) {
    console.log('📺 Switching to:', screenId);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

function showPermissionsScreen() { showScreen('permissionsScreen'); }

async function requestMicPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        sessionData.permissions.microphone = true;
        updatePermissionUI('mic', true);
        checkAllPermissions();
    } catch (error) {
        console.error('Mic denied:', error);
        alert('Microphone access denied');
    }
}

async function requestCameraPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        sessionData.permissions.camera = true;
        updatePermissionUI('camera', true);
        checkAllPermissions();
    } catch (error) {
        console.error('Camera denied:', error);
        alert('Camera access denied');
    }
}

async function requestLocationPermission() {
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, timeout: 10000
            });
        });
        sessionData.location.latitude = position.coords.latitude;
        sessionData.location.longitude = position.coords.longitude;
        sessionData.permissions.location = true;
        updatePermissionUI('location', true);
        checkAllPermissions();
    } catch (error) {
        console.error('Location denied:', error);
        alert('Location access denied');
    }
}

function updatePermissionUI(type, granted) {
    const status = document.getElementById(type + 'Status');
    const btn = document.getElementById(type + 'Btn');
    if (status) {
        status.textContent = granted ? 'Allowed' : 'Not Allowed';
        status.style.color = granted ? '#28a745' : '#dc3545';
    }
    if (btn && granted) {
        btn.textContent = 'Enabled';
        btn.classList.add('active');
        btn.disabled = true;
    }
}

function checkAllPermissions() {
    const allGranted = sessionData.permissions.microphone && 
                      sessionData.permissions.camera && 
                      sessionData.permissions.location;
    const btn = document.getElementById('continueBtn');
    if (btn) btn.disabled = !allGranted;
}

async function initializeSession() {
    try {
        console.log('🚀 Starting session...');
        
        // ✅ Check if we have an existing session
        if (loadSession()) {
            console.log('🔄 Reconnecting to existing session...');
            await reconnectToSession();
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}/api/customer/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName: 'Mobile User',
                clientName: 'DigiKhata',
                mobileNumber: '9999999999',
                latitude: sessionData.location.latitude,
                longitude: sessionData.location.longitude,
                deviceInfo: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform
                }
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message);

        sessionData.vcipId = data.data.vcipId;
        sessionData.connectionId = data.data.connectionId;
        sessionData.sessionToken = data.data.sessionToken;

        console.log('✅ Session created:', sessionData.vcipId, sessionData.connectionId);

        // ✅ Save session
        saveSession();

        // Setup connection
        await setupConnection();

    } catch (error) {
        console.error('❌ Init failed:', error);
        alert('Failed: ' + error.message);
        showScreen('permissionsScreen');
        stopKeepAlive();
    }
}

// ✅ NEW: Reconnect to existing session
async function reconnectToSession() {
    try {
        console.log('🔄 Reconnecting with connectionId:', sessionData.connectionId);
        
        // Setup connection with existing session
        await setupConnection();
        
        console.log('✅ Reconnection successful');
    } catch (error) {
        console.error('❌ Reconnection failed:', error);
        clearSession();
        alert('Session expired. Please start a new call.');
        showScreen('permissionsScreen');
    }
}

// ✅ NEW: Setup connection (extracted from initializeSession)
async function setupConnection() {
    // Connect socket
    console.log('🔌 Connecting to socket:', SOCKET_URL);
    await socketService.connect(SOCKET_URL);
    console.log('✅ Socket connected');

    // Setup listeners
    console.log('🎧 Setting up listeners...');
    setupWebRTCListeners();
    console.log('✅ Listeners ready');

    // Join room
    console.log('🚪 Joining room:', sessionData.connectionId);
    socketService.joinRoom(sessionData.connectionId, 'customer');
    console.log('✅ Joined room');

    // Start keep-alive
    startKeepAlive();

    // Get media
    console.log('📹 Getting local stream...');
    const stream = await webrtcService.getLocalStream();
    console.log('✅ Got stream');

    // Create peer connection
    console.log('🔗 Creating peer...');
    webrtcService.createPeerConnection(socketService, sessionData.connectionId);
    console.log('✅ Peer created');

    // Update UI
    document.getElementById('vcipIdDisplay').textContent = sessionData.vcipId;
    document.getElementById('connectionIdDisplay').textContent = sessionData.connectionId;
    
    showScreen('waitingScreen');
    console.log('✅ Waiting for agent to join...');
}

function startKeepAlive() {
    console.log('💓 Starting keep-alive');
    keepAliveInterval = setInterval(() => {
        if (socketService.connected) {
            socketService.emit('ping', { connectionId: sessionData.connectionId });
            console.log('💓 Ping sent');
        }
    }, 5000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        console.log('💓 Keep-alive stopped');
    }
}

// ✅ All listeners in one place, called once
function setupWebRTCListeners() {
    console.log('📝 Registering ALL WebRTC listeners...');
    
    // ✅ Agent message listener - FIRST
    socketService.on('agent-message', (data) => {
        console.log('📨 ★★★★★ AGENT MESSAGE RECEIVED! ★★★★★');
        console.log('   Message:', data.message);
        console.log('   Timestamp:', data.timestamp);
        showAgentMessage(data.message);
    });
    console.log('✅ Agent message listener registered');
    
    // Agent joined event
    socketService.on('user-joined', async (data) => {
        console.log('🎯 ★★★ USER-JOINED EVENT RECEIVED! ★★★');
        console.log('   Data:', data);
        
        if (data.userType === 'agent') {
            console.log('✅ AGENT HAS JOINED! Starting video call...');
            stopKeepAlive();
            
            try {
                // Set local video
                const localVideo = document.getElementById('localVideo');
                if (localVideo && webrtcService.localStream) {
                    localVideo.srcObject = webrtcService.localStream;
                    await localVideo.play().catch(e => console.log('Local play:', e));
                }
                
                // Create offer
                console.log('📤 Creating offer...');
                const offer = await webrtcService.peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                await webrtcService.peerConnection.setLocalDescription(offer);
                console.log('✅ Local description set');
                
                // Send offer to agent
                socketService.emit('offer', {
                    offer: offer,
                    connectionId: sessionData.connectionId
                });
                console.log('📤 OFFER SENT TO AGENT!');
        
                showScreen('videoCallScreen');
                startCallTimer();
                console.log('✅ Switched to video call screen');
                
            } catch (error) {
                console.error('❌ Failed to create offer:', error);
                alert('Failed to connect: ' + error.message);
            }
        }
    });

    // Answer from agent
    socketService.on('answer', async (data) => {
        console.log('📨 ★★★ ANSWER RECEIVED FROM AGENT! ★★★');
        try {
            await webrtcService.peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.answer)
            );
            console.log('✅ Answer set - WebRTC connection should establish');
        } catch (error) {
            console.error('❌ Answer failed:', error);
        }
    });

    // ICE candidates
    socketService.on('ice-candidate', async (data) => {
        console.log('🧊 ICE candidate received');
        try {
            if (webrtcService.peerConnection) {
                await webrtcService.peerConnection.addIceCandidate(
                    new RTCIceCandidate(data.candidate)
                );
                console.log('✅ ICE candidate added');
            }
        } catch (error) {
            console.error('❌ ICE failed:', error);
        }
    });

    // Socket disconnect handler
    socketService.socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected! Reason:', reason);
        console.log('⚠️ Connection will auto-reconnect...');
    });

    // Socket reconnect
    socketService.socket.on('connect', () => {
        console.log('🔌 Socket reconnected!');
        if (sessionData.connectionId) {
            console.log('🚪 Re-joining room:', sessionData.connectionId);
            socketService.joinRoom(sessionData.connectionId, 'customer');
        }
    });

    // Call ended
    socketService.on('call-ended-by-agent', (data) => {
        console.log('📞 Call ended by agent:', data);
        stopKeepAlive();
        showCallEndedByAgentModal(data.reason || 'No reason provided');
    });
    
    console.log('✅ All listeners registered successfully');
}

// ✅ Show agent message on screen
function showAgentMessage(message) {
    console.log('📢 ★★★ DISPLAYING AGENT MESSAGE ★★★');
    console.log('   Message:', message);
    
    const messageBox = document.getElementById('messageBox');
    const messageText = document.getElementById('agentMessage');
    
    if (messageBox && messageText) {
        messageText.textContent = message;
        messageBox.style.display = 'block';
        messageBox.style.position = 'fixed';
        messageBox.style.bottom = '140px';
        messageBox.style.left = '50%';
        messageBox.style.transform = 'translateX(-50%)';
        messageBox.style.background = 'rgba(28, 67, 166, 0.95)';
        messageBox.style.color = 'white';
        messageBox.style.padding = '16px 24px';
        messageBox.style.borderRadius = '12px';
        messageBox.style.zIndex = '100';
        messageBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        messageBox.style.maxWidth = '80%';
        
        console.log('✅ Message displayed in message box');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, 5000);
    } else {
        console.error('❌ Message box elements not found!');
        alert('Agent says: ' + message);
    }
}

function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timerElement = document.getElementById('callTimer');
        if (timerElement) {
            timerElement.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }
    }, 1000);
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

function toggleMute() {
    isMuted = !isMuted;
    webrtcService.toggleAudio();
    const btn = document.getElementById('muteBtn');
    if (btn) {
        btn.classList.toggle('muted', isMuted);
        const label = btn.querySelector('.label');
        if (label) label.textContent = isMuted ? 'Unmute' : 'Mute';
    }
}

function toggleVideo() {
    isVideoOff = !isVideoOff;
    const enabled = webrtcService.toggleVideo();
    const btn = document.getElementById('videoBtn');
    if (btn) {
        btn.classList.toggle('muted', isVideoOff);
        const label = btn.querySelector('.label');
        if (label) label.textContent = isVideoOff ? 'Start Video' : 'Stop Video';
    }
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.style.display = enabled ? 'block' : 'none';
}

function showCallEndedByAgentModal(reason) {
    if (callTimer) clearInterval(callTimer);
    stopKeepAlive();
    
    const reasonEl = document.getElementById('endCallReason');
    if (reasonEl) reasonEl.textContent = reason;
    
    const modal = document.getElementById('callEndedByAgentModal');
    if (modal) modal.classList.add('active');
    
    webrtcService.close();
}

function handleCallEndedOkay() {
    const modal = document.getElementById('callEndedByAgentModal');
    if (modal) modal.classList.remove('active');
    
    // ✅ Clear session
    clearSession();
    
    socketService.disconnect();
    setTimeout(() => location.reload(), 300);
}

window.addEventListener('load', async () => {
    console.log('📱 Mobile App Loading...');
    await loadConfig();
    
    // ✅ Check if we have a saved session
    if (loadSession()) {
        console.log('🔄 Found existing session');
        showScreen('permissionsScreen');
    } else {
        showScreen('homeScreen');
    }
    
    console.log('✅ Ready');
});

window.addEventListener('beforeunload', (e) => {
    if (sessionData.connectionId && webrtcService.peerConnection) {
        // Don't prevent unload, just clean up keep-alive
        stopKeepAlive();
        // Keep session saved so we can reconnect
        console.log('🔄 Page refreshing, session will be restored');
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionData.connectionId) {
        console.log('📱 App resumed - checking connection');
        if (!socketService.connected) {
            console.log('⚠️ Socket disconnected, reconnecting...');
            setupConnection().catch(error => {
                console.error('❌ Reconnection failed:', error);
            });
        }
    }
});

console.log('✅ Mobile app.js loaded - WITH RECONNECTION');