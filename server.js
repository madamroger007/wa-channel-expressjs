const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const http = require('http');
const socketIO = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const sequelize = require('./config/database');
const Session = require('./models/Session');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static('public'));

const clients = {};

function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

function deleteLocalAuthFolder(sessionId) {
  const authPath = path.resolve(__dirname, `./.wwebjs_auth_${sessionId}`);
  if (fs.existsSync(authPath)) {
    fs.rmSync(authPath, { recursive: true, force: true });
    console.log(`🗑️ Deleted auth folder for sessionId ${sessionId}`);
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    await Session.sync();
    console.log('📡 Terhubung ke database!');
    await restoreSessions();
  } catch (err) {
    console.error('❌ Gagal koneksi ke DB:', err);
  }
})();

app.post('/create-session', (req, res) => {
  let sessionId;
  do {
    sessionId = crypto.randomBytes(8).toString('hex');
  } while (clients[sessionId]);
  res.json({ sessionId });
});

app.post('/start-session', async (req, res) => {
  const { sessionId } = req.body;
  if (!isValidSessionId(sessionId)) return res.status(400).json({ error: 'sessionId tidak valid' });

  if (clients[sessionId]) return res.json({ status: 'exists' });

  try {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: sessionId }),
      puppeteer: { headless: true, args: ['--no-sandbox'] }
    });

    clients[sessionId] = client;

    client.on('qr', async (qr) => {
      try {
        const qrImageUrl = await qrcode.toDataURL(qr);
        io.to(sessionId).emit('qr', qrImageUrl);

        await Session.upsert({ sessionId, qrData: qrImageUrl, isReady: false });
      } catch (err) {
        console.error('❌ Gagal generate QR:', err);
      }
    });

    client.on('ready', async () => {
      io.to(sessionId).emit('ready');
      await Session.upsert({ sessionId, isReady: true });
    });

    client.on('auth_failure', async () => {
      io.to(sessionId).emit('auth_failure');
      await client.destroy();
      delete clients[sessionId];
      await Session.destroy({ where: { sessionId } });
      deleteLocalAuthFolder(sessionId);
    });

    client.on('disconnected', async () => {
      io.to(sessionId).emit('disconnected');
      await client.destroy();
      delete clients[sessionId];
      await Session.update({ isReady: false }, { where: { sessionId } });
      deleteLocalAuthFolder(sessionId);
    });

    console.log(`⚙️ Initializing client ${sessionId}...`);
    await client.initialize();
    res.json({ status: 'starting' });
  } catch (err) {
    console.error(`❌ Gagal inisialisasi client ${sessionId}:`, err);
    res.status(500).json({ error: 'Gagal inisialisasi client' });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await Session.findAll({ order: [['updatedAt', 'DESC']] });
    res.json(sessions);
  } catch (err) {
    console.error('❌ Gagal ambil sessions:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/send-message', async (req, res) => {
  const { sessionId, number, message } = req.body;

  if (!sessionId || !number || !message) {
    return res.status(400).json({ error: 'sessionId, number, dan message wajib diisi' });
  }

  const client = clients[sessionId];
  if (!client) return res.status(400).json({ error: 'Session tidak ditemukan atau belum siap' });

  try {
    const formattedNumber = number.replace(/\D/g, '') + '@c.us';
    const isRegistered = await client.isRegisteredUser(formattedNumber);
    if (!isRegistered) {
      return res.status(400).json({ error: 'Nomor tidak terdaftar di WhatsApp' });
    }

    await client.sendMessage(formattedNumber, message);
    res.json({ status: 'success', message: 'Pesan berhasil dikirim' });
  } catch (err) {
    console.error('❌ Gagal kirim pesan:', err);
    res.status(500).json({ error: 'Gagal mengirim pesan' });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Session ID tidak valid' });
  }

  try {
    const client = clients[sessionId];
    if (client) {
      await client.destroy();
      delete clients[sessionId];
    }

    await Session.destroy({ where: { sessionId } });
    deleteLocalAuthFolder(sessionId);
    res.json({ status: 'success', message: `Session ${sessionId} berhasil dihapus` });
  } catch (err) {
    console.error(`❌ Gagal hapus session ${sessionId}:`, err);
    res.status(500).json({ error: 'Gagal menghapus session' });
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Socket terhubung:', socket.id);

  socket.on('join-session', (sessionId) => {
    if (isValidSessionId(sessionId)) {
      socket.join(sessionId);
      console.log(`🧩 Socket ${socket.id} join session ${sessionId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('⚠️ Socket disconnect:', socket.id);
  });
});

setInterval(async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  try {
    const expired = await Session.findAll({
      where: {
        isReady: false,
        updatedAt: { [Op.lt]: oneHourAgo }
      }
    });

    for (const sess of expired) {
      await Session.destroy({ where: { sessionId: sess.sessionId } });
      deleteLocalAuthFolder(sess.sessionId);
      console.log(`🧹 Session ${sess.sessionId} expired & dibersihkan`);
    }
  } catch (err) {
    console.error('❌ Gagal bersihkan session lama:', err);
  }
}, 10 * 60 * 1000);

async function restoreSessions() {
  try {
    const sessions = await Session.findAll({ where: { isReady: true } });

    for (const sess of sessions) {
      const sessionId = sess.sessionId;
      if (clients[sessionId]) continue;

      const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: { headless: true, args: ['--no-sandbox'] }
      });

      clients[sessionId] = client;

      client.on('ready', () => {
        console.log(`✅ Session ${sessionId} restored`);
      });

      client.on('auth_failure', async () => {
        console.log(`❌ Auth failure on restored session ${sessionId}`);
        await client.destroy();
        delete clients[sessionId];
        await Session.destroy({ where: { sessionId } });
        deleteLocalAuthFolder(sessionId);
      });

      client.on('disconnected', async () => {
        console.log(`⚠️ Restored session ${sessionId} disconnected`);
        await client.destroy();
        delete clients[sessionId];
        await Session.update({ isReady: false }, { where: { sessionId } });
        deleteLocalAuthFolder(sessionId);
      });

      await client.initialize();
      console.log(`🔄 Restoring client ${sessionId}`);
    }
  } catch (err) {
    console.error('❌ Gagal restore sessions:', err);
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});