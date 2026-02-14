// SprintMate core cryptographic client for secure chat
// SprintMate 安全聊天的核心加密客户端

import {
	sha256
} from 'js-sha256';
import {
	ec as elliptic
} from 'elliptic';
import {
	Buffer
} from 'buffer';
window.Buffer = Buffer;

// Main SprintMate class for secure communication
// 用于安全通信的 SprintMate 主类
class SprintMate {
	// Initialize SprintMate instance
	// 初始化 SprintMate 实例
	constructor(config = {}, callbacks = {}) {
		this.config = {
			rsaPublic: config.rsaPublic || '',
			wsAddress: config.wsAddress || '',
			reconnectDelay: config.reconnectDelay || 3000,
			pingInterval: config.pingInterval || 2000,
			debug: config.debug || false,
		};
		this.callbacks = {
			onServerClosed: callbacks.onServerClosed || null,
			onServerSecured: callbacks.onServerSecured || null,
			onClientSecured: callbacks.onClientSecured || null,
			onClientList: callbacks.onClientList || null,
			onClientMessage: callbacks.onClientMessage || null,
			onServerKeyRotated: callbacks.onServerKeyRotated || null,
		};
		const hostKey = (typeof window !== 'undefined' && window.location && window.location.host) ? window.location.host : 'default';
		this.SERVER_KEY_STORAGE = `SprintMate_server_key:${hostKey}`;
		this.allowServerKeyRotation = (typeof config.allowServerKeyRotation === 'boolean') ? config.allowServerKeyRotation : true;
		try {
			this.clientEc = new elliptic('curve25519')
		} catch (error) {
			this.logEvent('constructor', error, 'error')
		}
		this.serverKeys = null;
		this.serverShared = null;
		this.credentials = null;
		this.connection = null;
		this.reconnect = null;
		this.ping = null;
		this.reconnectAttempts = 0;
		this.closeHandled = false;
		this.channel = {};
		this.setCredentials = this.setCredentials.bind(this);
		this.connect = this.connect.bind(this);
		this.destruct = this.destruct.bind(this);
		this.onOpen = this.onOpen.bind(this);
		this.onMessage = this.onMessage.bind(this);
		this.onError = this.onError.bind(this);
		this.onClose = this.onClose.bind(this);
		this.logEvent = this.logEvent.bind(this);
		this.isOpen = this.isOpen.bind(this);
		this.isClosed = this.isClosed.bind(this);
		this.startReconnect = this.startReconnect.bind(this);
		this.stopReconnect = this.stopReconnect.bind(this);
		this.startPing = this.startPing.bind(this);
		this.stopPing = this.stopPing.bind(this);
		this.disconnect = this.disconnect.bind(this);
		this.sendMessage = this.sendMessage.bind(this);
		this.sendChannelMessage = this.sendChannelMessage.bind(this);
		this.encryptServerMessage = this.encryptServerMessage.bind(this);
		this.decryptServerMessage = this.decryptServerMessage.bind(this);
		this.encryptClientMessage = this.encryptClientMessage.bind(this);
		this.decryptClientMessage = this.decryptClientMessage.bind(this)
	}

	async getAesGcmKey(rawKey) {
		if (!rawKey) {
			return null;
		}
		if (!this._aesKeyCache) {
			this._aesKeyCache = new Map();
		}
		const cacheKey = Buffer.isBuffer(rawKey) ? rawKey.toString('base64') : Buffer.from(rawKey).toString('base64');
		if (this._aesKeyCache.has(cacheKey)) {
			return this._aesKeyCache.get(cacheKey);
		}
		const keyBytes = Buffer.isBuffer(rawKey) ? new Uint8Array(rawKey) : new Uint8Array(rawKey);
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			keyBytes,
			{
				name: 'AES-GCM'
			},
			false,
			['encrypt', 'decrypt']
		);
		this._aesKeyCache.set(cacheKey, cryptoKey);
		return cryptoKey;
	}

	async encryptAesGcm(messageObj, key) {
		let encrypted = '';
		try {
			const messageBuffer = Buffer.from(JSON.stringify(messageObj), 'utf8');
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const cryptoKey = await this.getAesGcmKey(key);
			if (!cryptoKey) {
				return '';
			}
			const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv
				},
				cryptoKey,
				new Uint8Array(messageBuffer)
			));
			const tagLength = 16;
			const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.length - tagLength);
			const tag = encryptedWithTag.slice(encryptedWithTag.length - tagLength);
			encrypted = Buffer.from(iv).toString('base64') + '|' + Buffer.from(ciphertext).toString('base64') + '|' + Buffer.from(tag).toString('base64');
		} catch (error) {
			this.logEvent('encryptAesGcm', error, 'error')
		}
		return (encrypted)
	}

	async decryptAesGcm(message, key) {
		let decrypted = {};
		try {
			const parts = message.split('|');
			if (parts.length !== 3) {
				return (decrypted)
			}
			const iv = new Uint8Array(Buffer.from(parts[0], 'base64'));
			const ciphertext = new Uint8Array(Buffer.from(parts[1], 'base64'));
			const tag = new Uint8Array(Buffer.from(parts[2], 'base64'));
			const combined = new Uint8Array(ciphertext.length + tag.length);
			combined.set(ciphertext, 0);
			combined.set(tag, ciphertext.length);
			const cryptoKey = await this.getAesGcmKey(key);
			if (!cryptoKey) {
				return (decrypted)
			}
			const decryptedBuffer = new Uint8Array(await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv
				},
				cryptoKey,
				combined
			));
			decrypted = JSON.parse(Buffer.from(decryptedBuffer).toString('utf8'));
		} catch (error) {
			this.logEvent('decryptAesGcm', error, 'error')
		}
		return (decrypted)
	}

	// Set user credentials (username, channel, password)
	// 设置用户凭证（用户名、频道、密码）
	setCredentials(username, channel, password) {
		this.logEvent('setCredentials');
		try {
			this.credentials = {
				username: username,
				channel: sha256(channel),
				password: sha256(password)
			}
		} catch (error) {
			this.logEvent('setCredentials', error, 'error');
			return (false)
		}
		return (true)
	}

	// Update username and broadcast to connected peers
	// 更新用户名并广播给已连接的对端
	async updateUsername(username) {
		if (!this.credentials) {
			return false;
		}
		const nextName = (username || '').toString().trim();
		if (!nextName) {
			return false;
		}
		this.credentials.username = nextName;
		if (!this.serverShared) {
			return true;
		}
		const targets = Object.keys(this.channel || {}).filter(clientId => this.channel[clientId] && this.channel[clientId].shared);
		for (const clientId of targets) {
			try {
				const encryptedClientPayload = await this.encryptClientMessage({
					a: 'u',
					p: nextName
				}, this.channel[clientId].shared);
				const encryptedServerPayload = await this.encryptServerMessage({
					a: 'c',
					p: encryptedClientPayload,
					c: clientId
				}, this.serverShared);
				this.sendMessage(encryptedServerPayload);
			} catch (error) {
				this.logEvent('updateUsername', error, 'error');
			}
		}
		return true;
	}

	// Connect to the server
	// 连接到服务器
	connect() {
		if (!this.credentials) {
			return (false)
		}
		this.logEvent('connect', this.config.wsAddress);
		this.stopReconnect();
		this.stopPing();
		this.closeHandled = false;
		this.serverKeys = null;
		this.serverShared = null;
		this.channel = {};
		try {
			this.connection = new WebSocket(this.config.wsAddress);
			this.connection.onopen = this.onOpen;
			this.connection.onmessage = this.onMessage;
			this.connection.onerror = this.onError;
			this.connection.onclose = this.onClose
		} catch (error) {
			this.logEvent('connect', error, 'error');
			return (false)
		}
		return (true)
	}

	// Clean up and disconnect
	// 清理并断开连接
	destruct() {
		this.logEvent('destruct');
		this.stopReconnect();
		this.stopPing();
		this.reconnect = null;
		this.ping = null;
		this.config = {
			rsaPublic: '',
			wsAddress: '',
			reconnectDelay: 3000,
			pingInterval: 15000,
			debug: false,
		};
		this.callbacks.onServerClosed = null;
		this.callbacks.onServerSecured = null;
		this.callbacks.onClientSecured = null;
		this.callbacks.onClientList = null;
		this.callbacks.onClientMessage = null;
		this.clientEc = null;
		this.serverKeys = null;
		this.serverShared = null;
		this.credentials = null;
		this.connection.onopen = null;
		this.connection.onmessage = null;
		this.connection.onerror = null;
		this.connection.onclose = null;
		try {
			this.connection.removeAllListeners()
		} catch (error) {
			this.logEvent('destruct', error, 'error')
		}
		try {
			this.connection.close()
		} catch (error) {
			this.logEvent('destruct', error, 'error')
		}
		this.connection = null;
		this.channel = {};
		return (true)
	}

	// WebSocket open event handler
	// WebSocket 连接打开事件处理
	async onOpen() {
		this.logEvent('onOpen');
		this.closeHandled = false;
		this.reconnectAttempts = 0;
		this.startPing();
		try {
			this.serverKeys = await crypto.subtle.generateKey({
				name: 'ECDH',
				namedCurve: 'P-384'
			}, false, ['deriveKey', 'deriveBits']);
			this.serverShared = null;
			this.sendMessage(Buffer.from(await crypto.subtle.exportKey('raw', this.serverKeys.publicKey)).toString('hex'))
		} catch (error) {
			this.logEvent('onOpen', error, 'error')
		}
	}

	// WebSocket message event handler
	// WebSocket 消息事件处理
	async onMessage(event) {
		if (!event || !this.isString(event.data)) {
			return
		}
		if (event.data === 'pong') {
			return
		}
		this.logEvent('onMessage', event.data);
		try {
			const data = JSON.parse(event.data);
			if (data.type === 'server-key') {
				const result = await this.handleServerKey(data.key);
				if (!result) {
					return
				}
			}
		} catch (e) {}
		if (!this.serverShared) {
			const parts = event.data.split('|');
			if (!parts[0] || !parts[1]) {
				return
			}
			try {
				if (await crypto.subtle.verify({
						name: 'RSASSA-PKCS1-v1_5'
					}, await crypto.subtle.importKey('spki', Buffer.from(this.config.rsaPublic, 'base64'), {
						name: 'RSASSA-PKCS1-v1_5',
						hash: {
							name: 'SHA-256'
						}
					}, false, ['verify']), Buffer.from(parts[1], 'base64'), Buffer.from(parts[0], 'hex')) === true) {
					this.serverShared = Buffer.from(await crypto.subtle.deriveBits({
						name: 'ECDH',
						namedCurve: 'P-384',
						public: await crypto.subtle.importKey('raw', Buffer.from(parts[0], 'hex'), {
							name: 'ECDH',
							namedCurve: 'P-384'
						}, true, [])
					}, this.serverKeys.privateKey, 384)).slice(8, 40);
					this.sendMessage(await this.encryptServerMessage({
						a: 'j',
						p: this.credentials.channel
					}, this.serverShared));
					if (this.callbacks.onServerSecured) {
						try {
							this.callbacks.onServerSecured()
						} catch (error) {
							this.logEvent('onMessage-server-secured-callback', error, 'error')
						}
					}
				}
			} catch (error) {
				this.logEvent('onMessage', error, 'error')
			}
			return
		}
		const serverDecrypted = await this.decryptServerMessage(event.data, this.serverShared);
		this.logEvent('onMessage-server-decrypted', serverDecrypted);
		if (!this.isObject(serverDecrypted) || !this.isString(serverDecrypted.a)) {
			return
		}
		if (serverDecrypted.a === 'l' && this.isArray(serverDecrypted.p)) {
			try {
				for (const clientId in this.channel) {
					if (serverDecrypted.p.indexOf(clientId) < 0) {
						delete(this.channel[clientId])
					}
				}
				let payloads = {};
				for (const clientId of serverDecrypted.p) {
					if (!this.channel[clientId]) {
						this.channel[clientId] = {
							username: null,
							keys: this.clientEc.genKeyPair(),
							shared: null,
						};
						payloads[clientId] = this.channel[clientId].keys.getPublic('hex')
					}
				}
				if (Object.keys(payloads).length > 0) {
					this.sendMessage(await this.encryptServerMessage({
						a: 'w',
						p: payloads,
					}, this.serverShared))
				}
			} catch (error) {
				this.logEvent('onMessage-list', error, 'error')
			}
			if (this.callbacks.onClientList) {
				let clients = [];
				for (const clientId in this.channel) {
					if (this.channel[clientId].shared && this.channel[clientId].username) {
						clients.push({
							clientId: clientId,
							username: this.channel[clientId].username
						})
					}
				}
				try {
					this.callbacks.onClientList(clients)
				} catch (error) {
					this.logEvent('onMessage-client-list-callback', error, 'error')
				}
			}
			return
		}
		if (!this.isString(serverDecrypted.p) || !this.isString(serverDecrypted.c)) {
			return
		}
		if (serverDecrypted.a === 'c' && (!this.channel[serverDecrypted.c] || !this.channel[serverDecrypted.c].shared)) {
			try {
				if (!this.channel[serverDecrypted.c]) {
					this.channel[serverDecrypted.c] = {
						username: null,
						keys: this.clientEc.genKeyPair(),
						shared: null,
					};
					this.sendMessage(await this.encryptServerMessage({
						a: 'c',
						p: this.channel[serverDecrypted.c].keys.getPublic('hex'),
						c: serverDecrypted.c
					}, this.serverShared))
				}
				{
					const derivedSecretHex = this.channel[serverDecrypted.c].keys
						.derive(this.clientEc.keyFromPublic(serverDecrypted.p, 'hex').getPublic())
						.toString('hex');
					this.channel[serverDecrypted.c].shared = Buffer.from(await this.deriveClientSharedKey(derivedSecretHex), 'hex');
				}
				this.sendMessage(await this.encryptServerMessage({
					a: 'c',
					p: await this.encryptClientMessage({
						a: 'u',
						p: this.credentials.username
					}, this.channel[serverDecrypted.c].shared),
					c: serverDecrypted.c
				}, this.serverShared))
			} catch (error) {
				this.logEvent('onMessage-client', error, 'error')
			}
			return
		}
		if (serverDecrypted.a === 'c' && this.channel[serverDecrypted.c] && this.channel[serverDecrypted.c].shared) {
			const clientDecrypted = await this.decryptClientMessage(serverDecrypted.p, this.channel[serverDecrypted.c].shared);
			this.logEvent('onMessage-client-decrypted', clientDecrypted);
			if (!this.isObject(clientDecrypted) || !this.isString(clientDecrypted.a)) {
				return
			}
			if (clientDecrypted.a === 'u' && this.isString(clientDecrypted.p) && clientDecrypted.p.match(/\S+/)) {
				const nextName = clientDecrypted.p.replace(/^\s+/, '').replace(/\s+$/, '');
				if (this.channel[serverDecrypted.c].username === nextName) {
					return;
				}
				this.channel[serverDecrypted.c].username = nextName;
				if (this.callbacks.onClientSecured) {
					try {
						this.callbacks.onClientSecured({
							clientId: serverDecrypted.c,
							username: nextName
						})
					} catch (error) {
						this.logEvent('onMessage-client-secured-callback', error, 'error')
					}
				}
				return
			}			if (!this.channel[serverDecrypted.c].username) {
				return
			}
			if (clientDecrypted.a === 'm' && this.isString(clientDecrypted.t) && (this.isString(clientDecrypted.d) || this.isObject(clientDecrypted.d))) {
				if (this.callbacks.onClientMessage) {
					try {
						this.callbacks.onClientMessage({
							clientId: serverDecrypted.c,
							username: this.channel[serverDecrypted.c].username,
							type: clientDecrypted.t,
							data: clientDecrypted.d
						})
					} catch (error) {
						this.logEvent('onMessage-client-message-callback', error, 'error')
					}
				}
				return
			}
		}
	}

	// WebSocket error event handler
	// WebSocket 错误事件处理
	async onError(event) {
		let details = null;
		try {
			details = {
				wsAddress: this.config ? this.config.wsAddress : null,
				readyState: this.connection ? this.connection.readyState : null,
				eventType: event && event.type ? event.type : null
			};
		} catch (_) {
		}
		this.logEvent('onError', details || event, 'error');
		try {
			if (this.connection && this.connection.readyState === WebSocket.OPEN) {
				this.connection.close();
			}
		} catch (error) {
			this.logEvent('onError-close', error, 'error')
		}
	}

	// WebSocket close event handler
	// WebSocket 关闭事件处理
	async onClose(event) {
		let details = null;
		try {
			details = {
				wsAddress: this.config ? this.config.wsAddress : null,
				readyState: this.connection ? this.connection.readyState : null,
				code: event && typeof event.code === 'number' ? event.code : null,
				reason: event && typeof event.reason === 'string' ? event.reason : null,
				wasClean: event && typeof event.wasClean === 'boolean' ? event.wasClean : null
			};
		} catch (_) {
		}
		this.logEvent('onClose', details || event);
		if (this.closeHandled) {
			return;
		}
		this.closeHandled = true;
		this.stopPing();
		this.serverKeys = null;
		this.serverShared = null;
		this.channel = {};
		if (this.credentials) {
			this.startReconnect()
		}
		if (this.callbacks.onServerClosed) {
			try {
				this.callbacks.onServerClosed(details || event)
			} catch (error) {
				this.logEvent('onClose-server-closed-callback', error, 'error')
			}
		}
	}

	// Log events for debugging
	// 记录事件日志用于调试
	logEvent(source, message, level) {
		if (this.config.debug) {
			const date = new Date(),
				dateString = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2) + ' ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ':' + ('0' + date.getSeconds()).slice(-2);
			console.log('[' + dateString + ']', (level ? level.toUpperCase() : 'INFO'), source + (message ? ':' : ''), (message ? message : ''))
		}
	}

	// Check if connection is open
	// 检查连接是否已打开
	isOpen() {
		return (this.connection && this.connection.readyState && this.connection.readyState === WebSocket.OPEN ? true : false)
	}

	// Check if connection is closed
	// 检查连接是否已关闭
	isClosed() {
		return (!this.connection || !this.connection.readyState || this.connection.readyState === WebSocket.CLOSED ? true : false)
	}

	// Start reconnect timer
	// 启动重连定时器
	startReconnect() {
		this.stopReconnect();
		const attempt = this.reconnectAttempts + 1;
		const baseDelay = this.config.reconnectDelay || 3000;
		const cappedDelay = Math.min(baseDelay * Math.pow(1.8, this.reconnectAttempts), 30000);
		const jitter = Math.floor(Math.random() * 500);
		const delay = Math.floor(cappedDelay + jitter);
		this.reconnectAttempts = attempt;
		this.logEvent('startReconnect', {
			attempt,
			delay
		});
		this.reconnect = setTimeout(() => {
			this.reconnect = null;
			this.connect()
		}, delay)
	}

	// Stop reconnect timer
	// 停止重连定时器
	stopReconnect() {
		if (this.reconnect) {
			this.logEvent('stopReconnect');
			clearTimeout(this.reconnect);
			this.reconnect = null
		}
	}

	// Start ping timer
	// 启动心跳定时器
	startPing() {
		this.stopPing();
		this.logEvent('startPing');
		this.ping = setInterval(() => {
			this.sendMessage('ping')
		}, this.config.pingInterval)
	}

	// Stop ping timer
	// 停止心跳定时器
	stopPing() {
		if (this.ping) {
			this.logEvent('stopPing');
			clearInterval(this.ping);
			this.ping = null
		}
	}

	// Disconnect from server
	// 从服务器断开连接
	disconnect() {
		this.stopReconnect();
		this.stopPing();
		this.closeHandled = true;
		if (!this.isClosed()) {
			try {
				this.logEvent('disconnect');
				this.connection.close()
			} catch (error) {
				this.logEvent('disconnect', error, 'error')
			}
		}
	}

	// Send a message to the server
	// 向服务器发送消息
	sendMessage(message) {
		try {
			if (this.isOpen()) {
				this.connection.send(message);
				return (true)
			}
		} catch (error) {
			this.logEvent('sendMessage', error, 'error')
		}
		return (false)
	}

	// Send a message to all channels
	// 向所有频道发送消息
	sendChannelMessage(type, data) {
		if (this.serverShared) {
			try {
				this.sendChannelMessageAsync(type, data);
				return (true)
			} catch (error) {
				this.logEvent('sendChannelMessage', error, 'error')
			}
		}
		return (false)
	}

	async sendChannelMessageAsync(type, data) {
		try {
			let payloads = {};
			for (const clientId in this.channel) {
				if (this.channel[clientId].shared && this.channel[clientId].username) {
					payloads[clientId] = await this.encryptClientMessage({
						a: 'm',
						t: type,
						d: data
					}, this.channel[clientId].shared);
					if (payloads[clientId].length === 0) {
						return (false)
					}
				}
			}
			if (Object.keys(payloads).length > 0) {
				const payload = await this.encryptServerMessage({
					a: 'w',
					p: payloads,
				}, this.serverShared);
				if (!this.isOpen() || payload.length === 0 || payload.length > (8 * 1024 * 1024)) {
					return (false)
				}
				this.connection.send(payload)
			}
			return (true)
		} catch (error) {
			this.logEvent('sendChannelMessageAsync', error, 'error')
		}
		return (false)
	}

	// Encrypt a message for the server
	// 加密发送给服务器的消息
	async encryptServerMessage(message, key) {
		return (await this.encryptAesGcm(message, key))
	}

	// Decrypt a message from the server
	// 解密来自服务器的消息
	async decryptServerMessage(message, key) {
		return (await this.decryptAesGcm(message, key))
	}

	// Encrypt a message for a client
	// 加密发送给客户端的消息
	async encryptClientMessage(message, key) {
		return (await this.encryptAesGcm(message, key))
	}

	// Decrypt a message from a client
	// 解密来自客户端的消息
	async decryptClientMessage(message, key) {
		return (await this.decryptAesGcm(message, key))
	}

	// XOR two hex strings
	// 对两个十六进制字符串进行异或
	xorHex(a, b) {
		let result = '',
			hexLength = Math.min(a.length, b.length);
		for (let i = 0; i < hexLength; ++i) {
			result += (parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16)).toString(16)
		}
		return (result)
	}

	async deriveClientSharedKey(ecdhSecretHex) {
		try {
			if (crypto?.subtle?.deriveBits) {
				try {
					const ikm = new Uint8Array(Buffer.from(ecdhSecretHex, 'hex'));
					const salt = new Uint8Array(Buffer.from(this.credentials.password, 'hex'));
					const info = new Uint8Array(Buffer.from(this.credentials.channel, 'hex'));
					const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
					const bits = await crypto.subtle.deriveBits(
						{
							name: 'HKDF',
							hash: 'SHA-256',
							salt,
							info
						},
						keyMaterial,
						256
					);
					return Buffer.from(new Uint8Array(bits)).toString('hex');
				} catch (_) {
				}
			}
			return this.xorHex(ecdhSecretHex.padEnd(64, '8').substr(0, 64), this.credentials.password);
		} catch (error) {
			this.logEvent('deriveClientSharedKey', error, 'error');
			return this.xorHex(ecdhSecretHex.padEnd(64, '8').substr(0, 64), this.credentials.password);
		}
	}

	// Check if value is a string
	// 检查值是否为字符串
	isString(value) {
		return (value && Object.prototype.toString.call(value) === '[object String]' ? true : false)
	}

	// Check if value is an array
	// 检查值是否为数组
	isArray(value) {
		return (value && Object.prototype.toString.call(value) === '[object Array]' ? true : false)
	}

	// Check if value is an object
	// 检查值是否为对象
	isObject(value) {
		return (value && Object.prototype.toString.call(value) === '[object Object]' ? true : false)
	}

	// Handle server public key
	// 处理服务器公钥
	async handleServerKey(serverKey) {
		this.logEvent('handleServerKey', 'Received server key');
		let pinned = null;
		try {
			pinned = localStorage.getItem(this.SERVER_KEY_STORAGE);
		} catch (_) {
		}
		if (!pinned) {
			try {
				pinned = sessionStorage.getItem(this.SERVER_KEY_STORAGE);
			} catch (_) {
			}
		}
		if (!pinned && this._pinnedServerKey) {
			pinned = this._pinnedServerKey;
		}
		if (pinned && pinned !== serverKey) {
			this.logEvent('handleServerKey', 'Server key mismatch', 'error');
			if (this.allowServerKeyRotation) {
				try {
					localStorage.removeItem(this.SERVER_KEY_STORAGE);
				} catch (_) {
				}
				try {
					sessionStorage.removeItem(this.SERVER_KEY_STORAGE);
				} catch (_) {
				}
				let persisted = false;
				try {
					localStorage.setItem(this.SERVER_KEY_STORAGE, serverKey);
					persisted = true;
				} catch (_) {
				}
				if (!persisted) {
					try {
						sessionStorage.setItem(this.SERVER_KEY_STORAGE, serverKey);
						persisted = true;
					} catch (_) {
					}
				}
				this._pinnedServerKey = serverKey;
				this.config.rsaPublic = serverKey;
				try {
					if (typeof this.callbacks.onServerKeyRotated === 'function') {
						this.callbacks.onServerKeyRotated();
					}
				} catch (_) {
				}
				return true;
			}
			this.disconnect();
			return false;
		}
		if (!pinned) {
			let persisted = false;
			try {
				localStorage.setItem(this.SERVER_KEY_STORAGE, serverKey);
				persisted = true;
			} catch (_) {
			}
			if (!persisted) {
				try {
					sessionStorage.setItem(this.SERVER_KEY_STORAGE, serverKey);
					persisted = true;
				} catch (_) {
				}
			}
			this._pinnedServerKey = serverKey;
			pinned = serverKey;
		}
		this.config.rsaPublic = pinned;
		return true;
	}
};

if (typeof window !== 'undefined') {
	window.SprintMate = SprintMate
}
