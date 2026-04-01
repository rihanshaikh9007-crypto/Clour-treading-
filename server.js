const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 🤖 TELEGRAM BOTS
const paymentBot = new TelegramBot('8682208798:AAF1cmaUVNiyy4P9yKP7NOq66g2Sa8VeXYk', { polling: true });
const predictionBot = new TelegramBot('8329309258:AAFdLQ3HFmx8AQ3s4aBZ8yYkCpepM1EHOkE', { polling: false });

// 👇 AAPKA ADMIN ID YAHAN UPDATE HO GAYA HAI 👇
const ADMIN_CHAT_ID = '1484173564'; 

// 💾 DATABASE & HISTORY
let users = { 'demo_user': { balance: 100 } }; // Starting balance
let pendingTxns = {};
let currentBets = {}; 
let gameHistory = []; 

// 🔄 1-MINUTE GAME LOOP
let gameData = { period: 20260401001, timeLeft: 60, status: 'betting', result: null };

setInterval(() => {
    gameData.timeLeft--;

    if (gameData.timeLeft === 55) {
        const colors = ['Red', 'Green', 'Violet'];
        const sizes = ['Big', 'Small'];
        gameData.result = { 
            color: colors[Math.floor(Math.random() * colors.length)], 
            number: Math.floor(Math.random() * 10), 
            size: sizes[Math.floor(Math.random() * sizes.length)] 
        };
        try { predictionBot.sendMessage(ADMIN_CHAT_ID, `🎯 Period: ${gameData.period}\n🔮 Upcoming: ${gameData.result.color} | Num: ${gameData.result.number} (${gameData.result.size})`); } catch(e) {}
    }

    if (gameData.timeLeft === 0) {
        let winAmount = 0;
        let isWin = false;

        if (currentBets.amount > 0 && currentBets.color === gameData.result.color) {
            isWin = true;
            winAmount = currentBets.color === 'Violet' ? currentBets.amount * 4.5 : currentBets.amount * 2;
            users['demo_user'].balance += winAmount; 
        }

        gameHistory.unshift({ period: gameData.period, number: gameData.result.number, size: gameData.result.size, color: gameData.result.color });
        if(gameHistory.length > 15) gameHistory.pop(); 

        io.emit('gameResult', { period: gameData.period, result: gameData.result, isWin, winAmount, betColor: currentBets.color });
        io.emit('historyUpdate', gameHistory); 
        
        gameData.period++;
        gameData.timeLeft = 60;
        currentBets = {}; 
    }

    io.emit('timerUpdate', { timeLeft: gameData.timeLeft, period: gameData.period, balance: users['demo_user'].balance });
}, 1000);

// 💰 API ROUTES
app.post('/api/bet', (req, res) => {
    const { color, amount } = req.body;
    if (users['demo_user'].balance < amount) return res.json({ success: false, msg: 'Insufficient Balance!' });
    users['demo_user'].balance -= amount; 
    currentBets = { color, amount };
    res.json({ success: true, balance: users['demo_user'].balance });
});

app.post('/api/deposit', (req, res) => {
    const { amount, utr } = req.body;
    const txnId = 'TXN_' + Math.floor(Math.random() * 1000);
    pendingTxns[txnId] = { amount: parseInt(amount), utr };
    const opts = { reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_${txnId}` }, { text: '❌ Reject', callback_data: `reject_${txnId}` }]] } };
    paymentBot.sendMessage(ADMIN_CHAT_ID, `🔔 New Deposit Request!\n💰 Amt: ₹${amount}\n🧾 UTR: ${utr}\n🆔 ${txnId}`, opts);
    res.json({ success: true });
});

paymentBot.on('callback_query', (q) => {
    const [action, txnId] = q.data.split('_');
    const txn = pendingTxns[txnId];
    if (txn && action === 'approve') {
        users['demo_user'].balance += txn.amount;
        paymentBot.editMessageText(`✅ Approved ₹${txn.amount} for UTR: ${txn.utr}`, { chat_id: q.message.chat.id, message_id: q.message.message_id });
    }
    paymentBot.answerCallbackQuery(q.id);
});

server.listen(process.env.PORT || 3000, () => console.log(`✅ Pro Server running`));
