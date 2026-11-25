import crypto from 'node:crypto';

const CREATE_ROOM_PASSWORD = '10246';
const CREATE_ROOM_PASSWORD_HASH = crypto.createHash('sha256').update(CREATE_ROOM_PASSWORD).digest('hex');

const isValidCreatePassword = (token) => {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  return trimmed === CREATE_ROOM_PASSWORD || trimmed.toLowerCase() === CREATE_ROOM_PASSWORD_HASH;
};

const generateClientId = () => {
  try {
    return crypto.randomBytes(8).toString('hex');
  } catch (error) {
    logEvent('generateClientId', error, 'error');
    return null;
  }
};

const encryptMessage = (message, key) => {
  let encrypted = '';
  try {
    const messageBuffer = Buffer.from(JSON.stringify(message), 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(messageBuffer),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    encrypted = iv.toString('base64') + '|' + ciphertext.toString('base64') + '|' + tag.toString('base64');
  } catch (error) {
    logEvent('encryptMessage', error, 'error');
  }
  return encrypted;
};

const decryptMessage = (message, key) => {
  let decrypted = {};
  try {
    const parts = message.split('|');
    if (parts.length !== 3) {
      return decrypted;
    }
    const iv = Buffer.from(parts[0], 'base64');
    const ciphertext = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decryptedBuffer = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    decrypted = JSON.parse(decryptedBuffer.toString('utf8'));
  } catch (error) {
    logEvent('decryptMessage', error, 'error');
  }
  return decrypted;
};

const logEvent = (source, message, level) => {
  if (level === 'debug') {
    return;
  }
  const date = new Date(),
    dateString = date.getFullYear() + '-' +
    ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
    ('0' + date.getDate()).slice(-2) + ' ' +
    ('0' + date.getHours()).slice(-2) + ':' +
    ('0' + date.getMinutes()).slice(-2) + ':' +
    ('0' + date.getSeconds()).slice(-2);
  console.log('[' + dateString + ']', (level ? level.toUpperCase() : 'INFO'), source + (message ? ':' : ''), (message ? message : ''));
};

const getTime = () => new Date().getTime();
const isString = (value) => Boolean(value && Object.prototype.toString.call(value) === '[object String]');
const isArray = (value) => Boolean(value && Object.prototype.toString.call(value) === '[object Array]');
const isObject = (value) => Boolean(value && Object.prototype.toString.call(value) === '[object Object]');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理WebSocket请求
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader && upgradeHeader === 'websocket') {
      const id = env.CHAT_ROOM.idFromName('chat-room');
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // 处理API请求
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 其余全部交给 ASSETS 处理（自动支持 hash 文件名和 SPA fallback）
    return env.ASSETS.fetch(request);
  }
};

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.clients = {};
    this.channels = {};
    this.config = {
      seenTimeout: 45 * 1000,
      cleanupInterval: 15 * 1000,
      debug: false
    };
    this.initRSAKeyPair();
  }

  async initRSAKeyPair() {
    try {
      let stored = await this.state.storage.get('rsaKeyPair');
      if (!stored) {
        console.log('Generating new RSA keypair...');
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
          },
          true,
          ['sign', 'verify']
        );

        const [publicKeyBuffer, privateKeyBuffer] = await Promise.all([
          crypto.subtle.exportKey('spki', keyPair.publicKey),
          crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
        ]);

        stored = {
          rsaPublic: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
          rsaPrivateData: Array.from(new Uint8Array(privateKeyBuffer))
        };

        await this.state.storage.put('rsaKeyPair', stored);
        console.log('RSA key pair generated and stored');
      }

      if (stored.rsaPrivateData) {
        const privateKeyBuffer = new Uint8Array(stored.rsaPrivateData);
        stored.rsaPrivate = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyBuffer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256'
          },
          false,
          ['sign']
        );
      }
      this.keyPair = stored;
    } catch (error) {
      console.error('Error initializing RSA key pair:', error);
      throw error;
    }
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 });
    }

    if (!this.keyPair) {
      await this.initRSAKeyPair();
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(connection) {
    connection.accept();
    await this.cleanupOldConnections();

    const clientId = generateClientId();
    if (!clientId || this.clients[clientId]) {
      this.closeConnection(connection);
      return;
    }

    this.clients[clientId] = {
      connection: connection,
      seen: getTime(),
      key: null,
      shared: null,
      channel: null
    };

    await this.scheduleCleanupAlarm();

    try {
      this.sendMessage(connection, JSON.stringify({
        type: 'server-key',
        key: this.keyPair.rsaPublic
      }));
    } catch (error) {
      logEvent('sending-public-key', error, 'error');
    }

    connection.addEventListener('message', async (event) => {
      const message = event.data;
      if (!isString(message) || !this.clients[clientId]) {
        return;
      }

      this.clients[clientId].seen = getTime();

      if (message === 'ping') {
        this.sendMessage(connection, 'pong');
        return;
      }

      // Handle ECDH key exchange
      if (!this.clients[clientId].shared && message.length < 2048) {
        try {
          const keys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-384' },
            true,
            ['deriveBits', 'deriveKey']
          );

          const publicKeyBuffer = await crypto.subtle.exportKey('raw', keys.publicKey);
          const signature = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5' },
            this.keyPair.rsaPrivate,
            publicKeyBuffer
          );

          const clientPublicKeyHex = message;
          const clientPublicKeyBytes = new Uint8Array(clientPublicKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          const clientPublicKey = await crypto.subtle.importKey(
            'raw',
            clientPublicKeyBytes,
            { name: 'ECDH', namedCurve: 'P-384' },
            false,
            []
          );

          const sharedSecretBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: clientPublicKey },
            keys.privateKey,
            384
          );
          this.clients[clientId].shared = new Uint8Array(sharedSecretBits).slice(8, 40);

          const response = Array.from(new Uint8Array(publicKeyBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('') +
            '|' + btoa(String.fromCharCode(...new Uint8Array(signature)));

          this.sendMessage(connection, response);
        } catch (error) {
          logEvent('message-key', [clientId, error], 'error');
          this.closeConnection(connection);
        }
        return;
      }

      if (this.clients[clientId].shared && message.length <= (8 * 1024 * 1024)) {
        this.processEncryptedMessage(clientId, message);
      }
    });

    connection.addEventListener('close', async () => {
      await this.removeClient(clientId);
    });

    connection.addEventListener('error', async () => {
      await this.removeClient(clientId);
    });
  }

  async removeClient(clientId) {
    const clientObj = this.clients[clientId];
    if (!clientObj) {
      return;
    }

    const channel = clientObj.channel;
    delete this.clients[clientId];

    if (channel && this.channels[channel]) {
      const idx = this.channels[channel].indexOf(clientId);
      if (idx !== -1) {
        this.channels[channel].splice(idx, 1);
      }

      if (this.channels[channel].length === 0) {
        delete this.channels[channel];
      } else {
        this.broadcastMemberList(channel);
      }
    }

    try {
      if (Object.keys(this.clients).length === 0 && this.state && this.state.storage && typeof this.state.storage.deleteAlarm === 'function') {
        await this.state.storage.deleteAlarm();
      }
    } catch (_) {}
  }

  processEncryptedMessage(clientId, message) {
    let decrypted = null;
    try {
      decrypted = decryptMessage(message, this.clients[clientId].shared);
      if (!isObject(decrypted) || !isString(decrypted.a)) {
        return;
      }

      const action = decrypted.a;
      if (action === 'j') {
        this.handleJoinChannel(clientId, decrypted);
      } else if (action === 'c') {
        this.handleClientMessage(clientId, decrypted);
      } else if (action === 'w') {
        this.handleChannelMessage(clientId, decrypted);
      }
    } catch (error) {
      logEvent('process-encrypted-message', [clientId, error], 'error');
    } finally {
      decrypted = null;
    }
  }

  handleJoinChannel(clientId, decrypted) {
    if (!isString(decrypted.p) || !this.clients[clientId] || this.clients[clientId].channel) {
      return;
    }

    try {
      const client = this.clients[clientId];
      const channel = decrypted.p;
      const roomExists = Array.isArray(this.channels[channel]) && this.channels[channel].length > 0;

      // Room does not exist yet -> must provide valid room creation password (10246)
      if (!roomExists) {
        const providedToken = isString(decrypted.k) ? decrypted.k : '';
        if (!isValidCreatePassword(providedToken)) {
          const errCode = providedToken ? 'INVALID_CREATE_PASSWORD' : 'ROOM_NOT_EXIST_NEED_PWD';
          this.sendMessage(client.connection, encryptMessage({
            a: 'j_err',
            code: errCode
          }, client.shared));
          return;
        }
        this.channels[channel] = [clientId];
      } else {
        // Room already exists -> join directly without password
        this.channels[channel].push(clientId);
      }

      client.channel = channel;

      this.sendMessage(client.connection, encryptMessage({
        a: 'j_ok',
        p: channel
      }, client.shared));

      this.broadcastMemberList(channel);
    } catch (error) {
      logEvent('message-join', [clientId, error], 'error');
    }
  }

  handleClientMessage(clientId, decrypted) {
    if (!isString(decrypted.p) || !isString(decrypted.c) || !this.clients[clientId].channel) {
      return;
    }

    try {
      const channel = this.clients[clientId].channel;
      const targetClient = this.clients[decrypted.c];

      if (this.isClientInChannel(targetClient, channel)) {
        const messageObj = {
          a: 'c',
          p: decrypted.p,
          c: clientId
        };
        const encrypted = encryptMessage(messageObj, targetClient.shared);
        this.sendMessage(targetClient.connection, encrypted);
        messageObj.p = null;
      }
    } catch (error) {
      logEvent('message-client', [clientId, error], 'error');
    }
  }

  handleChannelMessage(clientId, decrypted) {
    if (!isObject(decrypted.p) || !this.clients[clientId].channel) {
      return;
    }

    try {
      const channel = this.clients[clientId].channel;
      const validMembers = Object.keys(decrypted.p).filter(member => {
        const targetClient = this.clients[member];
        return isString(decrypted.p[member]) && this.isClientInChannel(targetClient, channel);
      });

      for (const member of validMembers) {
        const targetClient = this.clients[member];
        const messageObj = {
          a: 'c',
          p: decrypted.p[member],
          c: clientId
        };
        const encrypted = encryptMessage(messageObj, targetClient.shared);
        this.sendMessage(targetClient.connection, encrypted);
        messageObj.p = null;
      }
    } catch (error) {
      logEvent('message-channel', [clientId, error], 'error');
    }
  }

  broadcastMemberList(channel) {
    try {
      const members = this.channels[channel];
      if (!Array.isArray(members)) return;

      for (const member of members) {
        const client = this.clients[member];
        if (this.isClientInChannel(client, channel)) {
          const messageObj = {
            a: 'l',
            p: members.filter((value) => value !== member)
          };
          const encrypted = encryptMessage(messageObj, client.shared);
          this.sendMessage(client.connection, encrypted);
          messageObj.p = null;
        }
      }
    } catch (error) {
      logEvent('broadcast-member-list', error, 'error');
    }
  }

  isClientInChannel(client, channel) {
    return Boolean(
      client &&
      client.connection &&
      client.shared &&
      client.channel &&
      client.channel === channel
    );
  }

  sendMessage(connection, message) {
    try {
      if (connection.readyState === 1) {
        connection.send(message);
      }
    } catch (error) {
      logEvent('sendMessage', error, 'error');
    }
  }

  closeConnection(connection) {
    try {
      connection.close();
    } catch (error) {
      logEvent('closeConnection', error, 'error');
    }
  }

  async cleanupOldConnections() {
    const seenThreshold = getTime() - this.config.seenTimeout;
    const clientsToRemove = [];

    for (const clientId in this.clients) {
      if (this.clients[clientId].seen <= seenThreshold) {
        clientsToRemove.push(clientId);
      }
    }

    for (const clientId of clientsToRemove) {
      try {
        const client = this.clients[clientId];
        if (client && client.connection) {
          this.closeConnection(client.connection);
        }
        await this.removeClient(clientId);
      } catch (error) {
        logEvent('connection-seen', error, 'error');
      }
    }

    return clientsToRemove.length;
  }

  async scheduleCleanupAlarm() {
    try {
      if (!this.state || !this.state.storage || typeof this.state.storage.setAlarm !== 'function') {
        return;
      }
      if (Object.keys(this.clients).length === 0) {
        return;
      }
      await this.state.storage.setAlarm(getTime() + this.config.cleanupInterval);
    } catch (_) {}
  }

  async alarm() {
    await this.cleanupOldConnections();
    if (Object.keys(this.clients).length > 0) {
      await this.scheduleCleanupAlarm();
      return;
    }
    try {
      if (this.state && this.state.storage && typeof this.state.storage.deleteAlarm === 'function') {
        await this.state.storage.deleteAlarm();
      }
    } catch (_) {}
  }
}
