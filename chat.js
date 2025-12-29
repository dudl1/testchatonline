// Конфигурация
let CONFIG = {
    username: '',
    token: '',
    repo: '',
    owner: '',
    pollInterval: 3000, // Интервал опроса в мс
    gistId: null // Будет создан автоматически
};

let lastMessageId = 0;
let isConnected = false;
let pollTimer = null;

// Инициализация
function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const token = document.getElementById('tokenInput').value.trim();
    const repo = document.getElementById('repoInput').value.trim();

    if (!username) {
        alert('Введите имя пользователя');
        return;
    }

    CONFIG.username = username;
    CONFIG.token = token;

    if (repo) {
        const [owner, repoName] = repo.split('/');
        CONFIG.owner = owner;
        CONFIG.repo = repoName;
    }

    // Сохраняем в localStorage
    localStorage.setItem('chatConfig', JSON.stringify(CONFIG));

    document.getElementById('loginOverlay').style.display = 'none';
    initChat();
}

// Проверяем сохраненные данные
function checkSavedLogin() {
    const saved = localStorage.getItem('chatConfig');
    if (saved) {
        const config = JSON.parse(saved);
        if (config.username) {
            CONFIG = { ...CONFIG, ...config };
            document.getElementById('loginOverlay').style.display = 'none';
            initChat();
            return true;
        }
    }
    return false;
}

// Инициализация чата
async function initChat() {
    updateStatus(true);
    addSystemMessage(`${CONFIG.username} присоединился к чату`);
    
    // Загружаем историю сообщений
    await loadMessages();
    
    // Запускаем polling
    startPolling();
}

// Обновление статуса подключения
function updateStatus(connected) {
    isConnected = connected;
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (connected) {
        dot.classList.remove('offline');
        text.textContent = `Онлайн: ${CONFIG.username}`;
    } else {
        dot.classList.add('offline');
        text.textContent = 'Отключено';
    }
}

// Добавление системного сообщения
function addSystemMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const msgElement = document.createElement('div');
    msgElement.className = 'system-message';
    msgElement.textContent = text;
    messagesDiv.appendChild(msgElement);
    scrollToBottom();
}

// Добавление сообщения в чат
function addMessage(message, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    
    const msgElement = document.createElement('div');
    msgElement.className = `message ${isOwn ? 'own' : 'other'}`;
    msgElement.dataset.id = message.id;
    
    msgElement.innerHTML = `
        <div class="message-header">
            <span class="message-author">${escapeHtml(message.author)}</span>
            <span class="message-time">${formatTime(message.timestamp)}</span>
        </div>
        <div class="message-text">${escapeHtml(message.text)}</div>
    `;
    
    messagesDiv.appendChild(msgElement);
    scrollToBottom();
}

// Прокрутка вниз
function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Форматирование времени
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const message = {
        id: Date.now(),
        author: CONFIG.username,
        text: text,
        timestamp: new Date().toISOString()
    };
    
    // Сразу показываем сообщение
    addMessage(message, true);
    input.value = '';
    
    // Отправляем через GitHub
    await saveMessage(message);
}

// Обработка Enter
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Добавление эмодзи
function addEmoji() {
    const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '💯', '✨', '🚀', '💬'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
}

// ========== GitHub API Integration ==========

// Получение сообщений из GitHub Issues
async function loadMessages() {
    if (!CONFIG.token || !CONFIG.repo) {
        // Демо режим - локальное хранилище
        loadLocalMessages();
        return;
    }
    
    try {
        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues?labels=chat-message&state=open&per_page=50`,
            {
                headers: {
                    'Authorization': `token ${CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (response.ok) {
            const issues = await response.json();
            
            // Парсим сообщения из issues
            issues.reverse().forEach(issue => {
                try {
                    const message = JSON.parse(issue.body);
                    if (message.id > lastMessageId) {
                        addMessage(message, message.author === CONFIG.username);
                        lastMessageId = message.id;
                    }
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            });
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        loadLocalMessages();
    }
}

// Сохранение сообщения в GitHub Issue
async function saveMessage(message) {
    // Сохраняем локально
    saveLocalMessage(message);
    
    if (!CONFIG.token || !CONFIG.repo) {
        return;
    }
    
    try {
        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: `Chat: ${message.author} - ${new Date().toISOString()}`,
                    body: JSON.stringify(message),
                    labels: ['chat-message']
                })
            }
        );
        
        if (!response.ok) {
            console.error('Error saving message to GitHub');
        }
    } catch (error) {
        console.error('Error saving message:', error);
    }
}

// ========== Альтернатива: GitHub Gist ==========

async function loadFromGist() {
    if (!CONFIG.token || !CONFIG.gistId) return [];
    
    try {
        const response = await fetch(
            `https://api.github.com/gists/${CONFIG.gistId}`,
            {
                headers: {
                    'Authorization': `token ${CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (response.ok) {
            const gist = await response.json();
            const content = gist.files['messages.json']?.content;
            return content ? JSON.parse(content) : [];
        }
    } catch (error) {
        console.error('Error loading from Gist:', error);
    }
    return [];
}

async function saveToGist(messages) {
    if (!CONFIG.token) return;
    
    const payload = {
        description: 'Chat Messages',
        public: false,
        files: {
            'messages.json': {
                content: JSON.stringify(messages, null, 2)
            }
        }
    };
    
    try {
        const url = CONFIG.gistId 
            ? `https://api.github.com/gists/${CONFIG.gistId}`
            : 'https://api.github.com/gists';
        
        const response = await fetch(url, {
            method: CONFIG.gistId ? 'PATCH' : 'POST',
            headers: {
                'Authorization': `token ${CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const gist = await response.json();
            CONFIG.gistId = gist.id;
            localStorage.setItem('chatConfig', JSON.stringify(CONFIG));
        }
    } catch (error) {
        console.error('Error saving to Gist:', error);
    }
}

// ========== Local Storage Fallback ==========

function loadLocalMessages() {
    const saved = localStorage.getItem('chatMessages');
    if (saved) {
        const messages = JSON.parse(saved);
        messages.forEach(msg => {
            if (msg.id > lastMessageId) {
                addMessage(msg, msg.author === CONFIG.username);
                lastMessageId = msg.id;
            }
        });
    }
}

function saveLocalMessage(message) {
    const saved = localStorage.getItem('chatMessages');
    const messages = saved ? JSON.parse(saved) : [];
    messages.push(message);
    
    // Храним только последние 100 сообщений
    if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
    }
    
    localStorage.setItem('chatMessages', JSON.stringify(messages));
}

// Polling для получения новых сообщений
function startPolling() {
    pollTimer = setInterval(async () => {
        await loadMessages();
    }, CONFIG.pollInterval);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ========== WebSocket-like через BroadcastChannel ==========

// Для синхронизации между вкладками одного браузера
const channel = new BroadcastChannel('github-chat');

channel.onmessage = (event) => {
    const message = event.data;
    if (message.author !== CONFIG.username) {
        addMessage(message, false);
    }
};

function broadcastMessage(message) {
    channel.postMessage(message);
}

// Модифицируем sendMessage для broadcast
const originalSendMessage = sendMessage;
sendMessage = async function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const message = {
        id: Date.now(),
        author: CONFIG.username,
        text: text,
        timestamp: new Date().toISOString()
    };
    
    addMessage(message, true);
    input.value = '';
    
    // Broadcast для других вкладок
    broadcastMessage(message);
    
    await saveMessage(message);
};

// ========== Инициализация при загрузке ==========

document.addEventListener('DOMContentLoaded', () => {
    checkSavedLogin();
});

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    stopPolling();
});

// Экспорт для отладки
window.ChatConfig = CONFIG;
window.clearChat = () => {
    localStorage.removeItem('chatMessages');
    localStorage.removeItem('chatConfig');
    location.reload();
};
