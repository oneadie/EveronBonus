let ws;
let chatroomId;
let codeWord = '';
let participants = new Set();
let userMessages = new Map();
let userColors = new Map();
let connected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let channel = 'everonn';
let responseTime = 30;
let winnerTimer = null;
let chatHistory = [];
const processedMessageIds = new Set();
let hasResponded = false;
let winner = null;
let winnerMessagesSinceVictory = [];

window.onload = () => {
    startChat();
};

async function startChat() {
    try {
        const response = await fetch(`https://kick.com/api/v2/channels/${channel}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Channel not found`);
        }
        const data = await response.json();
        chatroomId = data.chatroom?.id;
        if (!chatroomId) throw new Error('No chatroom ID found');
        connectWebSocket();
    } catch (error) {
        updateStatus(`Failed to connect to ${channel} chat. Retrying...`);
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(startChat, 3000 * reconnectAttempts);
        } else {
            updateStatus('Failed to connect after multiple attempts. Please refresh the page.');
        }
    }
}

function connectWebSocket() {
    if (connected && ws && ws.readyState === WebSocket.OPEN) {
        return;
    }
    if (ws) {
        ws.close();
    }
    const appKey = '32cbd69e4b950bf97679';
    const wsUrl = `wss://ws-us2.pusher.com/app/${appKey}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        connected = true;
        reconnectAttempts = 0;
        const subscribeMsg = {
            event: 'pusher:subscribe',
            data: {
                auth: '',
                channel: `chatrooms.${chatroomId}.v2`
            }
        };
        ws.send(JSON.stringify(subscribeMsg));
        updateStatus(`Connected to ${channel} chat`);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.event === 'pusher_internal:subscription_succeeded') {
                return;
            }
            if (msg.event !== 'App\\Events\\ChatMessageEvent') return;

            let chatData;
            try {
                chatData = JSON.parse(msg.data);
            } catch (e) {
                return;
            }

            const messageId = chatData.id;
            if (processedMessageIds.has(messageId)) return;
            processedMessageIds.add(messageId);

            const sender = chatData.sender?.username || 'Anonymous';
            const content = chatData.content || '';
            const color = chatData.sender?.identity?.color || '#ffffff';
            if (!content) return;

            const textWithoutEmotes = content.replace(/\[emote:\d+:[^\]]+\]/g, '').trim();
            if (!textWithoutEmotes) return;

            userColors.set(sender, color);
            chatHistory.push({ sender, content, color });
            displayChatMessage(sender, content, color);

            if (codeWord && content.toLowerCase() === codeWord.toLowerCase()) {
                if (!participants.has(sender)) {
                    participants.add(sender);
                    updateParticipantList();
                }
                if (!userMessages.has(sender)) {
                    userMessages.set(sender, []);
                }
                userMessages.get(sender).push(content);
            }

            if (winner && sender === winner) {
                winnerMessagesSinceVictory.push(content);
                addWinnerMessage(sender, content);
                if (winnerTimer) {
                    hasResponded = true;
                    updateWinnerResponseMessages();
                    updateWinnerTimerColor();
                    clearInterval(winnerTimer);
                    winnerTimer = null;
                    document.getElementById('winner-back-btn').style.display = 'block';
                } else {
                    updateWinnerResponseMessages();
                }
            }
        } catch (error) {}
    };

    ws.onclose = () => {
        connected = false;
        updateStatus('Disconnected. Retrying...');
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 3000 * reconnectAttempts);
        } else {
            updateStatus('Failed to connect after multiple attempts. Please refresh the page.');
        }
    };

    ws.onerror = () => {
        updateStatus('WebSocket error. Retrying...');
    };
}

function parseEmotes(content) {
    return content.replace(/\[emote:(\d+):([^\]]+)\]/g, (match, id, name) => name);
}

function updateStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.color = connected ? '#00ff00' : '#ff0000';
    status.style.display = message ? 'block' : 'none';
}

function displayChatMessage(sender, content, color) {
    const chatDiv = document.getElementById('chat');
    const msgElem = document.createElement('p');
    msgElem.innerHTML = `<span style="color: ${color}">${sender}</span>: ${parseEmotes(content)}`;
    chatDiv.appendChild(msgElem);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function updateParticipantList() {
    const list = document.getElementById('participant-list');
    list.innerHTML = '';
    document.getElementById('participant-count').textContent = participants.size;
    participants.forEach(user => {
        const div = document.createElement('div');
        div.className = 'participant';
        div.innerHTML = `<span style="color: ${userColors.get(user) || '#ffffff'}">${user}</span>
                        <span class="remove-btn" onclick="removeParticipant('${user}')">✖</span>`;
        list.appendChild(div);
    });
}

function removeParticipant(user) {
    participants.delete(user);
    userMessages.delete(user);
    updateParticipantList();
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    document.getElementById('main-content').classList.add('blur');
}

function saveSettings() {
    const newChannel = document.getElementById('settings-channel').value.trim();
    const newCodeWord = document.getElementById('settings-codeword').value.trim().toLowerCase();
    const newResponseTime = parseInt(document.getElementById('settings-response-time').value);
    
    if (!newChannel) {
        alert('Please enter a channel name.');
        return;
    }
    if (!newCodeWord) {
        alert('Please enter a code word.');
        return;
    }
    if (isNaN(newResponseTime) || newResponseTime < 1) {
        alert('Please enter a valid response time (at least 1 second).');
        return;
    }
    
    chatHistory = [];
    processedMessageIds.clear();
    participants.clear();
    userMessages.clear();
    userColors.clear();
    winnerMessagesSinceVictory = [];
    winner = null;
    document.getElementById('chat').innerHTML = '';
    document.getElementById('participant-list').innerHTML = '';
    document.getElementById('participant-count').textContent = '0';
    document.getElementById('winner').textContent = '';
    document.getElementById('winner-messages').innerHTML = '';
    
    channel = newChannel;
    codeWord = newCodeWord;
    responseTime = newResponseTime;
    document.getElementById('roulette-btn').disabled = false;
    document.getElementById('settings-modal').style.display = 'none';
    document.getElementById('main-content').classList.remove('blur');
    
    if (ws) {
        ws.close();
    }
    connected = false;
    reconnectAttempts = 0;
    startChat();
}

function startRoulette() {
    if (participants.size === 0) {
        alert('No participants yet.');
        return;
    }

    const participantArray = Array.from(participants);
    const rouletteList = document.getElementById('roulette-list');
    rouletteList.innerHTML = '';

    const repetitions = 15;
    for (let i = 0; i < repetitions; i++) {
        participantArray.forEach(user => {
            const li = document.createElement('li');
            li.style.color = userColors.get(user) || '#ffffff';
            li.textContent = user;
            rouletteList.appendChild(li);
        });
    }

    document.getElementById('roulette-modal').style.display = 'flex';
    document.getElementById('main-content').classList.add('blur');

    const itemHeight = 80;
    const totalItems = participantArray.length * repetitions;
    const selectedIndex = Math.floor(Math.random() * participantArray.length);
    const stopPosition = -(selectedIndex * itemHeight + (repetitions - 1) * participantArray.length * itemHeight);

    rouletteList.style.transition = 'none';
    rouletteList.style.top = '0px';
    rouletteList.offsetHeight;
    rouletteList.style.transition = 'top 6s cubic-bezier(0.25, 0.1, 0.25, 1)';

    requestAnimationFrame(() => {
        rouletteList.style.top = `${stopPosition}px`;
    });

    setTimeout(() => {
        winner = participantArray[selectedIndex];
        winnerMessagesSinceVictory = [];
        document.getElementById('roulette-modal').style.display = 'none';
        document.getElementById('main-content').classList.remove('blur');
        document.getElementById('winner').textContent = `Winner: ${winner}`;
        showWinnerMessages(winner);
        startWinnerResponseTimer(winner);
    }, 6500);
}

function updateWinnerTimerColor() {
    const timer = document.getElementById('winner-response-timer');
    timer.style.color = hasResponded ? '#00ff00' : '#ff0000';
}

function updateWinnerResponseMessages() {
    const responseDiv = document.getElementById('winner-response-message');
    responseDiv.innerHTML = `<h3>Messages from <span style="color: ${userColors.get(winner) || '#ffffff'}">${winner}</span> since victory:</h3>`;
    if (winnerMessagesSinceVictory.length > 0) {
        winnerMessagesSinceVictory.forEach(msg => {
            const p = document.createElement('p');
            p.innerHTML = parseEmotes(msg);
            responseDiv.appendChild(p);
        });
    } else {
        responseDiv.innerHTML += '<p>No messages since victory.</p>';
    }
    responseDiv.scrollTop = responseDiv.scrollHeight;
}

function startWinnerResponseTimer(winnerName) {
    hasResponded = false;
    document.getElementById('winner-name').textContent = winnerName;
    document.getElementById('winner-name').style.color = userColors.get(winnerName) || '#ffffff';
    document.getElementById('winner-response-timer').textContent = `Time left: ${responseTime}s`;
    updateWinnerResponseMessages();
    document.getElementById('winner-response-modal').style.display = 'flex';
    document.getElementById('main-content').classList.add('blur');

    let timeLeft = responseTime;
    winnerTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('winner-response-timer').textContent = `Time left: ${timeLeft}s`;
        updateWinnerTimerColor();
        if (timeLeft <= 0) {
            clearInterval(winnerTimer);
            winnerTimer = null;
            document.getElementById('winner-back-btn').style.display = 'block';
        }
    }, 1000);
}

function closeWinnerModal() {
    document.getElementById('winner-response-modal').style.display = 'none';
    document.getElementById('main-content').classList.remove('blur');
    if (winnerTimer) {
        clearInterval(winnerTimer);
        winnerTimer = null;
    }
}

function addWinnerMessage(sender, content) {
    const messagesDiv = document.getElementById('winner-messages');
    const p = document.createElement('p');
    p.innerHTML = parseEmotes(content);
    messagesDiv.appendChild(p);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showWinnerMessages(winnerName) {
    const messagesDiv = document.getElementById('winner-messages');
    messagesDiv.innerHTML = `<h2>Messages from <span style="color: ${userColors.get(winnerName) || '#ffffff'}">${winnerName}</span>:</h2>`;
    if (userMessages.has(winnerName)) {
        userMessages.get(winnerName).forEach(msg => {
            const p = document.createElement('p');
            p.innerHTML = parseEmotes(msg);
            messagesDiv.appendChild(p);
        });
    } else {
        messagesDiv.innerHTML += '<p>No messages recorded.</p>';
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function reset() {
    participants.clear();
    userMessages.clear();
    userColors.clear();
    winnerMessagesSinceVictory = [];
    chatHistory = [];
    processedMessageIds.clear();
    document.getElementById('participant-list').innerHTML = '';
    document.getElementById('participant-count').textContent = '0';
    document.getElementById('roulette-list').innerHTML = '';
    document.getElementById('winner').textContent = '';
    document.getElementById('winner-messages').innerHTML = '';
    document.getElementById('chat').innerHTML = '';
    document.getElementById('roulette-btn').disabled = true;
    codeWord = '';
    winner = null;
    document.getElementById('settings-codeword').value = '';
    document.getElementById('winner-response-modal').style.display = 'none';
    document.getElementById('main-content').classList.remove('blur');
    if (winnerTimer) {
        clearInterval(winnerTimer);
        winnerTimer = null;
    }
    if (ws && connected) {
        ws.close();
        startChat();
    }
}

function clearChat() {
    chatHistory = [];
    document.getElementById('chat').innerHTML = '';
}