// SprintMate Core Cryptographic Client — Binary LAN/Hotspot P2P Accelerator + Live WebRTC Voice Call + E2EE Relay
// SprintMate 核心加密客户端（支持热点/局域网高速二进制 P2P 直传、WebRTC 实时语音通话与 Cloudflare E2EE 中继）

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

const RTC_ICE_SERVERS = [
	{ urls: 'stun:stun.cloudflare.com:3478' },
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' }
];

// Maximum single WebSocket frame size before splitting multi-recipient broadcasts into individual frames
const MAX_COMBINED_WS_FRAME = 384 * 1024;

// Binary P2P file chunk magic header: "SMBF"
const BINARY_MAGIC_0 = 0x53; // S
const BINARY_MAGIC_1 = 0x4D; // M
const BINARY_MAGIC_2 = 0x42; // B
const BINARY_MAGIC_3 = 0x46; // F

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class SprintMate {
	constructor(config = {}, callbacks = {}) {
		this.config = {
			rsaPublic: config.rsaPublic || '',
			wsAddress: config.wsAddress || '',
			reconnectDelay: config.reconnectDelay || 2500,
			pingInterval: config.pingInterval || 10000,
			debug: config.debug || false,
			enableP2P: config.enableP2P !== false
		};
		this.callbacks = {
			onServerClosed: callbacks.onServerClosed || null,
			onServerSecured: callbacks.onServerSecured || null,
			onJoinError: callbacks.onJoinError || null,
			onClientSecured: callbacks.onClientSecured || null,
			onClientList: callbacks.onClientList || null,
			onClientLeft: callbacks.onClientLeft || null,
			onClientMessage: callbacks.onClientMessage || null,
			onBinaryFileChunk: callbacks.onBinaryFileChunk || null,
			onServerKeyRotated: callbacks.onServerKeyRotated || null,
			onTransportChange: callbacks.onTransportChange || null,
			onVoiceCallUpdate: callbacks.onVoiceCallUpdate || null
		};
		const hostKey = (typeof window !== 'undefined' && window.location && window.location.host) ? window.location.host : 'default';
		this.SERVER_KEY_STORAGE = `SprintMate_server_key:${hostKey}`;
		this.allowServerKeyRotation = (typeof config.allowServerKeyRotation === 'boolean') ? config.allowServerKeyRotation : true;
		try {
			this.clientEc = new elliptic('curve25519');
		} catch (error) {
			this.logEvent('constructor', error, 'error');
		}
		this.serverKeys = null;
		this.serverShared = null;
		this._latestServerKey = null;
		this.credentials = null;
		this.connection = null;
		this.reconnect = null;
		this.ping = null;
		this.reconnectAttempts = 0;
		this.closeHandled = false;
		this._channelJoined = false;
		this.channel = {};
		this._msgQueue = Promise.resolve();

		// Live WebRTC Voice Call state
		this.voiceCallActive = false;
		this.voiceMuted = false;
		this.localAudioStream = null;
		this.remoteVoicePeers = new Set();

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
		this.sendClientMessage = this.sendClientMessage.bind(this);
		this.encryptServerMessage = this.encryptServerMessage.bind(this);
		this.decryptServerMessage = this.decryptServerMessage.bind(this);
		this.encryptClientMessage = this.encryptClientMessage.bind(this);
		this.decryptClientMessage = this.decryptClientMessage.bind(this);

		if (typeof document !== 'undefined') {
			this._onVisibilityChange = () => {
				if (!document.hidden && this.credentials) {
					if (this.isOpen()) {
						this.sendMessage('ping');
					} else if (this.isClosed() && !this.closeHandled) {
						this.startReconnect(100);
					}
				}
			};
			document.addEventListener('visibilitychange', this._onVisibilityChange);
		}
	}

	async getAesGcmKey(rawKey) {
		if (!rawKey) return null;
		if (!this._aesKeyCache) this._aesKeyCache = new Map();
		const cacheKey = Buffer.isBuffer(rawKey) ? rawKey.toString('base64') : Buffer.from(rawKey).toString('base64');
		if (this._aesKeyCache.has(cacheKey)) return this._aesKeyCache.get(cacheKey);
		const keyBytes = new Uint8Array(rawKey);
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			keyBytes,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);
		this._aesKeyCache.set(cacheKey, cryptoKey);
		return cryptoKey;
	}

	async encryptAesGcm(messageObj, key) {
		let encrypted = '';
		try {
			const messageBuffer = textEncoder.encode(JSON.stringify(messageObj));
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const cryptoKey = await this.getAesGcmKey(key);
			if (!cryptoKey) return '';
			const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv },
				cryptoKey,
				messageBuffer
			));
			const tagLength = 16;
			const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.length - tagLength);
			const tag = encryptedWithTag.slice(encryptedWithTag.length - tagLength);
			encrypted = Buffer.from(iv).toString('base64') + '|' + Buffer.from(ciphertext).toString('base64') + '|' + Buffer.from(tag).toString('base64');
		} catch (error) {
			this.logEvent('encryptAesGcm', error, 'error');
		}
		return encrypted;
	}

	async decryptAesGcm(message, key) {
		let decrypted = {};
		try {
			if (typeof message !== 'string') return decrypted;
			const parts = message.split('|');
			if (parts.length !== 3) return decrypted;
			const iv = new Uint8Array(Buffer.from(parts[0], 'base64'));
			const ciphertext = new Uint8Array(Buffer.from(parts[1], 'base64'));
			const tag = new Uint8Array(Buffer.from(parts[2], 'base64'));
			const combined = new Uint8Array(ciphertext.length + tag.length);
			combined.set(ciphertext, 0);
			combined.set(tag, ciphertext.length);
			const cryptoKey = await this.getAesGcmKey(key);
			if (!cryptoKey) return decrypted;
			const decryptedBuffer = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv },
				cryptoKey,
				combined
			);
			decrypted = JSON.parse(textDecoder.decode(decryptedBuffer));
		} catch (error) {
			this.logEvent('decryptAesGcm', error, 'error');
		}
		return decrypted;
	}

	// Zero-Base64, Zero-JSON hardware-accelerated binary AES-256-GCM framing for P2P LAN/Hotspot speed
	async _packBinaryFileChunk(fileId, volumeIndex, rawUint8, isPrivate, key) {
		const cryptoKey = await this.getAesGcmKey(key);
		if (!cryptoKey) return null;
		const fileIdBytes = textEncoder.encode(fileId);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			cryptoKey,
			rawUint8
		));
		const headerLen = 4 + 1 + 1 + fileIdBytes.length + 4 + 12;
		const frame = new Uint8Array(headerLen + encryptedWithTag.length);
		frame[0] = BINARY_MAGIC_0;
		frame[1] = BINARY_MAGIC_1;
		frame[2] = BINARY_MAGIC_2;
		frame[3] = BINARY_MAGIC_3;
		frame[4] = isPrivate ? 1 : 0;
		frame[5] = fileIdBytes.length;
		frame.set(fileIdBytes, 6);
		const view = new DataView(frame.buffer);
		view.setUint32(6 + fileIdBytes.length, volumeIndex, true);
		frame.set(iv, 10 + fileIdBytes.length);
		frame.set(encryptedWithTag, headerLen);
		return frame.buffer;
	}

	async _unpackBinaryFileChunk(arrayBuffer, key) {
		const frame = new Uint8Array(arrayBuffer);
		if (frame.length < 26) return null;
		if (frame[0] !== BINARY_MAGIC_0 || frame[1] !== BINARY_MAGIC_1 || frame[2] !== BINARY_MAGIC_2 || frame[3] !== BINARY_MAGIC_3) {
			return null;
		}
		const isPrivate = frame[4] === 1;
		const fileIdLen = frame[5];
		const headerLen = 6 + fileIdLen + 4 + 12;
		if (frame.length < headerLen + 16) return null;
		const fileId = textDecoder.decode(frame.subarray(6, 6 + fileIdLen));
		const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
		const volumeIndex = view.getUint32(6 + fileIdLen, true);
		const iv = frame.subarray(10 + fileIdLen, headerLen);
		const ciphertextWithTag = frame.subarray(headerLen);
		const cryptoKey = await this.getAesGcmKey(key);
		if (!cryptoKey) return null;
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			cryptoKey,
			ciphertextWithTag
		);
		return {
			fileId,
			volumeIndex,
			isPrivate,
			data: new Uint8Array(decrypted)
		};
	}

	setCredentials(username, channel, password) {
		this.logEvent('setCredentials');
		try {
			const rawPwd = (password || '').toString().trim();
			const channelHash = sha256(channel);
			this.credentials = {
				username: username,
				channel: channelHash,
				createToken: rawPwd ? sha256(rawPwd) : '',
				password: sha256(channelHash + ':sprintmate-e2ee')
			};
		} catch (error) {
			this.logEvent('setCredentials', error, 'error');
			return false;
		}
		return true;
	}

	async updateUsername(username) {
		if (!this.credentials) return false;
		const nextName = (username || '').toString().trim();
		if (!nextName) return false;
		this.credentials.username = nextName;
		if (!this.serverShared) return true;
		const targets = Object.keys(this.channel || {}).filter(clientId => this.channel[clientId] && this.channel[clientId].shared);
		for (const clientId of targets) {
			try {
				await this._sendRawClientPayload(clientId, { a: 'u', p: nextName });
			} catch (error) {
				this.logEvent('updateUsername', error, 'error');
			}
		}
		return true;
	}

	connect() {
		if (!this.credentials) return false;
		this.logEvent('connect', this.config.wsAddress);
		this.stopReconnect();
		this.stopPing();
		this._cleanupAllPeers();
		this.closeHandled = false;
		this.serverKeys = null;
		this.serverShared = null;
		this._channelJoined = false;
		this.channel = {};
		this._msgQueue = Promise.resolve();
		try {
			if (this.connection) {
				try {
					this.connection.onopen = null;
					this.connection.onmessage = null;
					this.connection.onerror = null;
					this.connection.onclose = null;
					this.connection.close();
				} catch (_) {}
			}
			this.connection = new WebSocket(this.config.wsAddress);
			this.connection.onopen = this.onOpen;
			this.connection.onmessage = this.onMessage;
			this.connection.onerror = this.onError;
			this.connection.onclose = this.onClose;
		} catch (error) {
			this.logEvent('connect', error, 'error');
			return false;
		}
		return true;
	}

	_cleanupPeerVoiceRTC(clientId) {
		const peer = this.channel && this.channel[clientId];
		if (!peer) return;
		if (peer.voicePc) {
			try {
				peer.voicePc.onicecandidate = null;
				peer.voicePc.ontrack = null;
				peer.voicePc.onconnectionstatechange = null;
				peer.voicePc.close();
			} catch (_) {}
			peer.voicePc = null;
		}
		if (peer.voiceAudioEl) {
			try {
				peer.voiceAudioEl.pause();
				peer.voiceAudioEl.srcObject = null;
				peer.voiceAudioEl.remove();
			} catch (_) {}
			peer.voiceAudioEl = null;
		}
		peer.voiceIceQueue = [];
	}

	_cleanupPeerRTC(clientId) {
		const peer = this.channel && this.channel[clientId];
		if (!peer) return;
		if (peer.dc) {
			try {
				peer.dc.onopen = null;
				peer.dc.onclose = null;
				peer.dc.onerror = null;
				peer.dc.onmessage = null;
				peer.dc.close();
			} catch (_) {}
			peer.dc = null;
		}
		if (peer.pc) {
			try {
				peer.pc.onicecandidate = null;
				peer.pc.ondatachannel = null;
				peer.pc.onconnectionstatechange = null;
				peer.pc.close();
			} catch (_) {}
			peer.pc = null;
		}
		peer.p2pReady = false;
		peer.p2pMode = null;
		this._cleanupPeerVoiceRTC(clientId);
		this.remoteVoicePeers.delete(clientId);
	}

	_cleanupAllPeers() {
		if (!this.channel) return;
		for (const clientId of Object.keys(this.channel)) {
			this._cleanupPeerRTC(clientId);
		}
		this.remoteVoicePeers.clear();
	}

	destruct() {
		this.logEvent('destruct');
		this.stopVoiceCall(false);
		if (typeof document !== 'undefined' && this._onVisibilityChange) {
			document.removeEventListener('visibilitychange', this._onVisibilityChange);
			this._onVisibilityChange = null;
		}
		this.stopReconnect();
		this.stopPing();
		this._cleanupAllPeers();
		this.reconnect = null;
		this.ping = null;
		Object.keys(this.callbacks).forEach(k => { this.callbacks[k] = null; });
		this.clientEc = null;
		this.serverKeys = null;
		this.serverShared = null;
		this.credentials = null;
		if (this.connection) {
			this.connection.onopen = null;
			this.connection.onmessage = null;
			this.connection.onerror = null;
			this.connection.onclose = null;
			try { this.connection.close(); } catch (_) {}
			this.connection = null;
		}
		this.channel = {};
		return true;
	}

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
			const rawPub = await crypto.subtle.exportKey('raw', this.serverKeys.publicKey);
			this.sendMessage(Buffer.from(rawPub).toString('hex'));
		} catch (error) {
			this.logEvent('onOpen', error, 'error');
		}
	}

	onMessage(event) {
		if (!event || !this.isString(event.data)) return;
		if (event.data === 'pong') return;
		const rawData = event.data;
		this._msgQueue = this._msgQueue
			.then(() => this._processMessageSequential(rawData))
			.catch((err) => this.logEvent('onMessage-queue', err, 'error'));
	}

	async _verifyServerSignature(rsaPubBase64, signatureBase64, pubKeyHex) {
		if (!rsaPubBase64) return false;
		try {
			const verifyKey = await crypto.subtle.importKey(
				'spki',
				Buffer.from(rsaPubBase64, 'base64'),
				{ name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
				false,
				['verify']
			);
			return await crypto.subtle.verify(
				{ name: 'RSASSA-PKCS1-v1_5' },
				verifyKey,
				Buffer.from(signatureBase64, 'base64'),
				Buffer.from(pubKeyHex, 'hex')
			);
		} catch (_) {
			return false;
		}
	}

	async _processMessageSequential(rawData) {
		try {
			if (rawData.startsWith('{')) {
				const data = JSON.parse(rawData);
				if (data && data.type === 'server-key' && data.key) {
					this._latestServerKey = data.key;
					await this.handleServerKey(data.key);
					return;
				}
			}
		} catch (_) {}

		if (!this.serverShared) {
			const parts = rawData.split('|');
			if (!parts[0] || !parts[1] || parts.length !== 2) return;
			try {
				let verified = await this._verifyServerSignature(this.config.rsaPublic, parts[1], parts[0]);
				if (!verified && this._latestServerKey && this._latestServerKey !== this.config.rsaPublic && this.allowServerKeyRotation) {
					this.config.rsaPublic = this._latestServerKey;
					try { localStorage.setItem(this.SERVER_KEY_STORAGE, this._latestServerKey); } catch (_) {}
					verified = await this._verifyServerSignature(this.config.rsaPublic, parts[1], parts[0]);
				}

				if (verified) {
					const serverPubKey = await crypto.subtle.importKey(
						'raw',
						Buffer.from(parts[0], 'hex'),
						{ name: 'ECDH', namedCurve: 'P-384' },
						true,
						[]
					);
					const bits = await crypto.subtle.deriveBits(
						{ name: 'ECDH', namedCurve: 'P-384', public: serverPubKey },
						this.serverKeys.privateKey,
						384
					);
					this.serverShared = Buffer.from(bits).slice(8, 40);

					this.sendMessage(await this.encryptServerMessage({
						a: 'j',
						p: this.credentials.channel,
						k: this.credentials.createToken || ''
					}, this.serverShared));
				} else {
					this.logEvent('onMessage-verify-failed', 'RSA signature verification failed', 'error');
				}
			} catch (error) {
				this.logEvent('onMessage-handshake', error, 'error');
			}
			return;
		}

		const serverDecrypted = await this.decryptServerMessage(rawData, this.serverShared);
		if (!this.isObject(serverDecrypted) || !this.isString(serverDecrypted.a)) return;

		if (serverDecrypted.a === 'j_ok') {
			if (!this._channelJoined) {
				this._channelJoined = true;
				if (this.callbacks.onServerSecured) {
					try { this.callbacks.onServerSecured(); } catch (error) {
						this.logEvent('onMessage-server-secured-callback', error, 'error');
					}
				}
			}
			return;
		}

		if (serverDecrypted.a === 'j_err') {
			const errCode = this.isString(serverDecrypted.code) ? serverDecrypted.code : 'JOIN_DENIED';
			this.disconnect();
			if (this.callbacks.onJoinError) {
				try { this.callbacks.onJoinError(errCode); } catch (error) {
					this.logEvent('onMessage-join-error-callback', error, 'error');
				}
			}
			return;
		}

		if (serverDecrypted.a === 'l' && this.isArray(serverDecrypted.p)) {
			if (!this._channelJoined) {
				this._channelJoined = true;
				if (this.callbacks.onServerSecured) {
					try { this.callbacks.onServerSecured(); } catch (_) {}
				}
			}
			try {
				for (const clientId in this.channel) {
					if (serverDecrypted.p.indexOf(clientId) < 0) {
						const wasInVoice = this.remoteVoicePeers.has(clientId);
						this._cleanupPeerRTC(clientId);
						delete this.channel[clientId];
						if (wasInVoice) this._emitVoiceCallUpdate();
						if (this.callbacks.onClientLeft) {
							try { this.callbacks.onClientLeft(clientId); } catch (_) {}
						}
					}
				}
				const payloads = {};
				for (const clientId of serverDecrypted.p) {
					if (!this.channel[clientId]) {
						const keyPair = this.clientEc.genKeyPair();
						const myPubHex = keyPair.getPublic('hex');
						this.channel[clientId] = {
							username: null,
							keys: keyPair,
							myPubHex,
							peerPubHex: null,
							shared: null,
							pc: null,
							dc: null,
							p2pReady: false,
							p2pMode: null,
							iceCandidateQueue: [],
							voicePc: null,
							voiceAudioEl: null,
							voiceIceQueue: []
						};
						payloads[clientId] = myPubHex;
					}
				}
				if (Object.keys(payloads).length > 0) {
					this.sendMessage(await this.encryptServerMessage({
						a: 'w',
						p: payloads,
					}, this.serverShared));
				}
			} catch (error) {
				this.logEvent('onMessage-list', error, 'error');
			}
			this._emitClientList();
			return;
		}

		if (!this.isString(serverDecrypted.p) || !this.isString(serverDecrypted.c)) return;

		const peerId = serverDecrypted.c;
		const payloadStr = serverDecrypted.p;
		const isPubKeyExchange = !payloadStr.includes('|') && /^[0-9a-fA-F]{60,68}$/.test(payloadStr);

		if (serverDecrypted.a === 'c' && isPubKeyExchange) {
			try {
				let isNewPeerEntry = false;
				if (!this.channel[peerId]) {
					isNewPeerEntry = true;
					const keyPair = this.clientEc.genKeyPair();
					const myPubHex = keyPair.getPublic('hex');
					this.channel[peerId] = {
						username: null,
						keys: keyPair,
						myPubHex,
						peerPubHex: null,
						shared: null,
						pc: null,
						dc: null,
						p2pReady: false,
						p2pMode: null,
						iceCandidateQueue: [],
						voicePc: null,
						voiceAudioEl: null,
						voiceIceQueue: []
					};
				}

				const peer = this.channel[peerId];
				if (isNewPeerEntry) {
					this.sendMessage(await this.encryptServerMessage({
						a: 'c',
						p: peer.myPubHex,
						c: peerId
					}, this.serverShared));
				}

				peer.peerPubHex = payloadStr;
				const derivedSecretHex = peer.keys
					.derive(this.clientEc.keyFromPublic(payloadStr, 'hex').getPublic())
					.toString('hex');
				peer.shared = Buffer.from(await this.deriveClientSharedKey(derivedSecretHex), 'hex');

				await this._sendRawClientPayload(peerId, {
					a: 'u',
					p: this.credentials.username
				});
			} catch (error) {
				this.logEvent('onMessage-client-key', error, 'error');
			}
			return;
		}

		if (serverDecrypted.a === 'c' && this.channel[peerId] && this.channel[peerId].shared) {
			await this._handleEncryptedPeerPayload(peerId, payloadStr);
		}
	}

	async _handleBinaryPeerChunk(peerId, arrayBuffer) {
		const peer = this.channel && this.channel[peerId];
		if (!peer || !peer.shared) return;
		try {
			const unpacked = await this._unpackBinaryFileChunk(arrayBuffer, peer.shared);
			if (unpacked && this.callbacks.onBinaryFileChunk) {
				this.callbacks.onBinaryFileChunk({
					clientId: peerId,
					username: peer.username,
					fileId: unpacked.fileId,
					volumeIndex: unpacked.volumeIndex,
					isPrivate: unpacked.isPrivate,
					chunkData: unpacked.data
				});
			}
		} catch (error) {
			this.logEvent('_handleBinaryPeerChunk', error, 'error');
		}
	}

	async _handleEncryptedPeerPayload(peerId, encryptedPayload) {
		const peer = this.channel[peerId];
		if (!peer || !peer.shared) return;

		const clientDecrypted = await this.decryptClientMessage(encryptedPayload, peer.shared);
		if (!this.isObject(clientDecrypted) || !this.isString(clientDecrypted.a)) return;

		if ((clientDecrypted.a === 'u' || clientDecrypted.a === 'u_ack') && this.isString(clientDecrypted.p) && clientDecrypted.p.match(/\S+/)) {
			const nextName = clientDecrypted.p.trim();
			const wasUnsecured = !peer.username;
			const changed = peer.username !== nextName;
			peer.username = nextName;

			if (clientDecrypted.a === 'u') {
				try {
					await this._sendRawClientPayload(peerId, {
						a: 'u_ack',
						p: this.credentials.username
					});
				} catch (_) {}
			}

			if (wasUnsecured || changed) {
				if (this.callbacks.onClientSecured) {
					try {
						this.callbacks.onClientSecured({
							clientId: peerId,
							username: nextName,
							userName: nextName
						});
					} catch (error) {
						this.logEvent('onMessage-client-secured-callback', error, 'error');
					}
				}
				this._emitClientList();
			}

			if (this.config.enableP2P && wasUnsecured && peer.myPubHex && peer.peerPubHex && peer.myPubHex > peer.peerPubHex) {
				this._initPeerRTC(peerId, true);
			}

			// If we are currently in an active voice call, announce our voice call presence to the newly joined peer
			if (wasUnsecured && this.voiceCallActive) {
				this._sendRawClientPayload(peerId, { a: 'vcall', d: { type: 'join' } }).catch(() => {});
			}
			return;
		}

		// WebRTC DataChannel signaling
		if (clientDecrypted.a === 'rtc' && this.isObject(clientDecrypted.d)) {
			await this._handlePeerRTCSignal(peerId, clientDecrypted.d);
			return;
		}

		// Live WebRTC Voice Call signaling
		if (clientDecrypted.a === 'vcall' && this.isObject(clientDecrypted.d)) {
			await this._handleVoiceCallSignal(peerId, clientDecrypted.d);
			return;
		}

		if (!peer.username) return;

		if (clientDecrypted.a === 'm' && this.isString(clientDecrypted.t) && (this.isString(clientDecrypted.d) || this.isObject(clientDecrypted.d))) {
			if (this.callbacks.onClientMessage) {
				try {
					this.callbacks.onClientMessage({
						clientId: peerId,
						username: peer.username,
						userName: peer.username,
						type: clientDecrypted.t,
						data: clientDecrypted.d
					});
				} catch (error) {
					this.logEvent('onMessage-client-message-callback', error, 'error');
				}
			}
		}
	}

	_emitClientList() {
		if (!this.callbacks.onClientList) return;
		const clients = [];
		for (const clientId in this.channel) {
			if (this.channel[clientId].shared && this.channel[clientId].username) {
				clients.push({
					clientId: clientId,
					username: this.channel[clientId].username,
					userName: this.channel[clientId].username,
					p2p: Boolean(this.channel[clientId].p2pReady),
					p2pMode: this.channel[clientId].p2pMode || null
				});
			}
		}
		try {
			this.callbacks.onClientList(clients);
		} catch (error) {
			this.logEvent('onMessage-client-list-callback', error, 'error');
		}
	}

	async _sendRawClientPayload(targetClientId, innerPayloadObj) {
		const peer = this.channel && this.channel[targetClientId];
		if (!peer || !peer.shared || !this.serverShared || !this.isOpen()) return false;
		const encryptedClientPayload = await this.encryptClientMessage(innerPayloadObj, peer.shared);
		if (!encryptedClientPayload) return false;
		const encryptedServerPayload = await this.encryptServerMessage({
			a: 'c',
			p: encryptedClientPayload,
			c: targetClientId
		}, this.serverShared);
		if (!encryptedServerPayload) return false;
		return this.sendMessage(encryptedServerPayload);
	}

	// Detect whether active ICE candidate pair is direct LAN/Hotspot (host <-> host) or WAN P2P
	async _detectP2PMode(peerId) {
		const peer = this.channel && this.channel[peerId];
		if (!peer || !peer.pc || typeof peer.pc.getStats !== 'function') return;
		try {
			const stats = await peer.pc.getStats();
			let selectedPair = null;
			const localCandidates = new Map();
			const remoteCandidates = new Map();

			stats.forEach((report) => {
				if (report.type === 'local-candidate') localCandidates.set(report.id, report);
				else if (report.type === 'remote-candidate') remoteCandidates.set(report.id, report);
				else if (report.type === 'candidate-pair' && (report.nominated || report.state === 'succeeded')) {
					if (!selectedPair || report.nominated) selectedPair = report;
				}
			});

			if (selectedPair) {
				const lc = localCandidates.get(selectedPair.localCandidateId);
				const rc = remoteCandidates.get(selectedPair.remoteCandidateId);
				const lt = lc && lc.candidateType;
				const rt = rc && rc.candidateType;
				const nextMode = (lt === 'host' && (rt === 'host' || rt === 'prflx')) ? 'lan' : 'p2p';
				if (peer.p2pMode !== nextMode) {
					peer.p2pMode = nextMode;
					this._notifyTransportChange();
				}
			}
		} catch (_) {}
	}

	_initPeerRTC(peerId, isInitiator = false) {
		if (typeof RTCPeerConnection === 'undefined') return null;
		const peer = this.channel[peerId];
		if (!peer || !peer.shared) return null;
		if (peer.pc) return peer.pc;

		try {
			const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
			peer.pc = pc;
			peer.iceCandidateQueue = [];

			pc.onicecandidate = (event) => {
				if (event.candidate && this.channel[peerId] && this.channel[peerId].shared) {
					this._sendRawClientPayload(peerId, {
						a: 'rtc',
						d: { type: 'candidate', candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate }
					}).catch(() => {});
				}
			};

			pc.onconnectionstatechange = () => {
				if (!this.channel[peerId]) return;
				const state = pc.connectionState;
				if (state === 'connected') {
					this._detectP2PMode(peerId);
					setTimeout(() => this._detectP2PMode(peerId), 800);
				} else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
					if (peer.p2pReady) {
						peer.p2pReady = false;
						peer.p2pMode = null;
						this._notifyTransportChange();
					}
				}
			};

			const setupDataChannel = (dc) => {
				peer.dc = dc;
				dc.binaryType = 'arraybuffer';
				dc.bufferedAmountLowThreshold = 2 * 1024 * 1024;
				dc.onopen = () => {
					if (!this.channel[peerId]) return;
					peer.p2pReady = true;
					peer.p2pMode = peer.p2pMode || 'p2p';
					this._detectP2PMode(peerId);
					setTimeout(() => this._detectP2PMode(peerId), 700);
					this._notifyTransportChange();
				};
				dc.onclose = () => {
					if (!this.channel[peerId]) return;
					peer.p2pReady = false;
					peer.p2pMode = null;
					this._notifyTransportChange();
				};
				dc.onerror = () => {
					if (!this.channel[peerId]) return;
					peer.p2pReady = false;
					peer.p2pMode = null;
					this._notifyTransportChange();
				};
				dc.onmessage = (ev) => {
					if (!ev) return;
					if (ev.data instanceof ArrayBuffer) {
						this._msgQueue = this._msgQueue
							.then(() => this._handleBinaryPeerChunk(peerId, ev.data))
							.catch((err) => this.logEvent('dc-binary-onmessage', err, 'error'));
						return;
					}
					if (typeof ev.data === 'string') {
						this._msgQueue = this._msgQueue
							.then(() => this._handleEncryptedPeerPayload(peerId, ev.data))
							.catch((err) => this.logEvent('dc-onmessage', err, 'error'));
					}
				};
			};

			if (isInitiator) {
				const dc = pc.createDataChannel('sprintmate-e2ee', { ordered: true });
				setupDataChannel(dc);
				pc.createOffer()
					.then((offer) => pc.setLocalDescription(offer))
					.then(() => {
						return this._sendRawClientPayload(peerId, {
							a: 'rtc',
							d: { type: 'offer', sdp: pc.localDescription }
						});
					})
					.catch((err) => this.logEvent('rtc-offer', err, 'error'));
			} else {
				pc.ondatachannel = (event) => {
					if (event.channel) setupDataChannel(event.channel);
				};
			}

			return pc;
		} catch (error) {
			this.logEvent('_initPeerRTC', error, 'error');
			return null;
		}
	}

	async _handlePeerRTCSignal(peerId, signal) {
		if (!this.config.enableP2P || typeof RTCPeerConnection === 'undefined') return;
		const peer = this.channel[peerId];
		if (!peer || !peer.shared || !signal) return;

		try {
			if (signal.type === 'offer' && signal.sdp) {
				if (peer.dc) {
					try { peer.dc.close(); } catch (_) {}
					peer.dc = null;
				}
				if (peer.pc) {
					try { peer.pc.close(); } catch (_) {}
					peer.pc = null;
				}
				const pc = this._initPeerRTC(peerId, false);
				if (!pc) return;
				await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
				while (peer.iceCandidateQueue && peer.iceCandidateQueue.length > 0) {
					const cand = peer.iceCandidateQueue.shift();
					await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
				}
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				await this._sendRawClientPayload(peerId, {
					a: 'rtc',
					d: { type: 'answer', sdp: pc.localDescription }
				});
			} else if (signal.type === 'answer' && signal.sdp) {
				if (!peer.pc) return;
				await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
				while (peer.iceCandidateQueue && peer.iceCandidateQueue.length > 0) {
					const cand = peer.iceCandidateQueue.shift();
					await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
				}
			} else if (signal.type === 'candidate' && signal.candidate) {
				if (!peer.pc) return;
				if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
					await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
				} else {
					peer.iceCandidateQueue.push(signal.candidate);
				}
			}
		} catch (error) {
			this.logEvent('_handlePeerRTCSignal', error, 'error');
		}
	}

	// ==================== Live WebRTC Voice Call ====================
	_emitVoiceCallUpdate() {
		if (typeof this.callbacks.onVoiceCallUpdate === 'function') {
			const remoteNames = [];
			this.remoteVoicePeers.forEach((cid) => {
				const p = this.channel && this.channel[cid];
				if (p && p.username) remoteNames.push(p.username);
			});
			try {
				this.callbacks.onVoiceCallUpdate({
					active: this.voiceCallActive,
					muted: this.voiceMuted,
					remotePeers: remoteNames,
					remoteCount: this.remoteVoicePeers.size
				});
			} catch (_) {}
		}
	}

	async startVoiceCall() {
		if (this.voiceCallActive) return true;
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			throw new Error('Browser does not support microphone access (HTTPS required)');
		}
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true
			},
			video: false
		});
		this.localAudioStream = stream;
		this.voiceCallActive = true;
		this.voiceMuted = false;

		const peerIds = Object.keys(this.channel || {}).filter(cid => this.channel[cid] && this.channel[cid].shared && this.channel[cid].username);
		for (const cid of peerIds) {
			const peer = this.channel[cid];
			await this._sendRawClientPayload(cid, { a: 'vcall', d: { type: 'join' } });
			if (this.remoteVoicePeers.has(cid) && peer.myPubHex > peer.peerPubHex) {
				await this._connectVoicePeer(cid, true);
			}
		}
		this._emitVoiceCallUpdate();
		return true;
	}

	async stopVoiceCall(notifyPeers = true) {
		const wasActive = this.voiceCallActive;
		this.voiceCallActive = false;
		this.voiceMuted = false;

		if (this.localAudioStream) {
			try {
				this.localAudioStream.getTracks().forEach(t => t.stop());
			} catch (_) {}
			this.localAudioStream = null;
		}

		for (const cid of Object.keys(this.channel || {})) {
			this._cleanupPeerVoiceRTC(cid);
			if (notifyPeers && wasActive && this.channel[cid] && this.channel[cid].shared) {
				this._sendRawClientPayload(cid, { a: 'vcall', d: { type: 'leave' } }).catch(() => {});
			}
		}
		this._emitVoiceCallUpdate();
	}

	toggleVoiceMute() {
		if (!this.voiceCallActive || !this.localAudioStream) return false;
		this.voiceMuted = !this.voiceMuted;
		this.localAudioStream.getAudioTracks().forEach(track => {
			track.enabled = !this.voiceMuted;
		});
		this._emitVoiceCallUpdate();
		return this.voiceMuted;
	}

	async _connectVoicePeer(peerId, createOfferNow = false) {
		if (!this.voiceCallActive || !this.localAudioStream || typeof RTCPeerConnection === 'undefined') return null;
		const peer = this.channel && this.channel[peerId];
		if (!peer || !peer.shared) return null;

		this._cleanupPeerVoiceRTC(peerId);
		const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
		peer.voicePc = pc;
		peer.voiceIceQueue = [];

		this.localAudioStream.getAudioTracks().forEach(track => {
			pc.addTrack(track, this.localAudioStream);
		});

		pc.onicecandidate = (ev) => {
			if (ev.candidate && this.channel[peerId] && this.channel[peerId].shared) {
				this._sendRawClientPayload(peerId, {
					a: 'vcall',
					d: { type: 'candidate', candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }
				}).catch(() => {});
			}
		};

		pc.ontrack = (ev) => {
			const remoteStream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
			if (!peer.voiceAudioEl) {
				const audio = document.createElement('audio');
				audio.autoplay = true;
				audio.playsInline = true;
				audio.style.display = 'none';
				document.body.appendChild(audio);
				peer.voiceAudioEl = audio;
			}
			peer.voiceAudioEl.srcObject = remoteStream;
			peer.voiceAudioEl.play().catch(() => {});
		};

		if (createOfferNow) {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			await this._sendRawClientPayload(peerId, {
				a: 'vcall',
				d: { type: 'offer', sdp: pc.localDescription }
			});
		}
		return pc;
	}

	async _handleVoiceCallSignal(peerId, signal) {
		const peer = this.channel && this.channel[peerId];
		if (!peer || !peer.shared || !signal) return;
		try {
			if (signal.type === 'join') {
				this.remoteVoicePeers.add(peerId);
				this._emitVoiceCallUpdate();
				if (this.voiceCallActive && peer.myPubHex > peer.peerPubHex) {
					await this._connectVoicePeer(peerId, true);
				}
			} else if (signal.type === 'leave') {
				this.remoteVoicePeers.delete(peerId);
				this._cleanupPeerVoiceRTC(peerId);
				this._emitVoiceCallUpdate();
			} else if (signal.type === 'offer' && signal.sdp) {
				this.remoteVoicePeers.add(peerId);
				this._emitVoiceCallUpdate();
				if (!this.voiceCallActive) return;
				const pc = await this._connectVoicePeer(peerId, false);
				if (!pc) return;
				await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
				while (peer.voiceIceQueue.length > 0) {
					const c = peer.voiceIceQueue.shift();
					await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
				}
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				await this._sendRawClientPayload(peerId, {
					a: 'vcall',
					d: { type: 'answer', sdp: pc.localDescription }
				});
			} else if (signal.type === 'answer' && signal.sdp) {
				if (!peer.voicePc) return;
				await peer.voicePc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
				while (peer.voiceIceQueue.length > 0) {
					const c = peer.voiceIceQueue.shift();
					await peer.voicePc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
				}
			} else if (signal.type === 'candidate' && signal.candidate) {
				if (!peer.voicePc) return;
				if (peer.voicePc.remoteDescription && peer.voicePc.remoteDescription.type) {
					await peer.voicePc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
				} else {
					peer.voiceIceQueue.push(signal.candidate);
				}
			}
		} catch (error) {
			this.logEvent('_handleVoiceCallSignal', error, 'error');
		}
	}

	_notifyTransportChange() {
		this._emitClientList();
		if (typeof this.callbacks.onTransportChange === 'function') {
			try {
				this.callbacks.onTransportChange(this.getTransportMode());
			} catch (_) {}
		}
	}

	isPeerP2P(clientId) {
		const peer = this.channel && this.channel[clientId];
		return Boolean(peer && peer.p2pReady && peer.dc && peer.dc.readyState === 'open');
	}

	getPeerP2PMode(clientId) {
		if (!this.isPeerP2P(clientId)) return null;
		return this.channel[clientId].p2pMode || 'p2p';
	}

	hasAnyP2P() {
		if (!this.channel) return false;
		for (const clientId in this.channel) {
			if (this.isPeerP2P(clientId)) return true;
		}
		return false;
	}

	getTransportMode() {
		if (!this.channel) return 'relay';
		let hasP2P = false;
		for (const clientId in this.channel) {
			if (this.isPeerP2P(clientId)) {
				if (this.channel[clientId].p2pMode === 'lan') return 'lan';
				hasP2P = true;
			}
		}
		return hasP2P ? 'p2p' : 'relay';
	}

	canUseBinaryP2P(targetClientId = null) {
		if (targetClientId) {
			return this.isPeerP2P(targetClientId);
		}
		const peerIds = Object.keys(this.channel || {}).filter(
			cid => this.channel[cid] && this.channel[cid].shared && this.channel[cid].username
		);
		if (peerIds.length === 0) return false;
		return peerIds.every(cid => this.isPeerP2P(cid));
	}

	getMaxP2PChunkSize(targetClientId = null) {
		const targets = targetClientId
			? [targetClientId]
			: Object.keys(this.channel || {}).filter(cid => this.isPeerP2P(cid));
		let safeLimit = 192 * 1024; // 192KB default for ultra-fast LAN/Hotspot transfer
		for (const cid of targets) {
			const peer = this.channel[cid];
			const sctpMax = peer && peer.pc && peer.pc.sctp && peer.pc.sctp.maxMessageSize;
			if (typeof sctpMax === 'number' && sctpMax > 0) {
				// Leave 2KB headroom for binary header + GCM tag
				const usable = Math.max(16 * 1024, Math.min(192 * 1024, Math.floor((sctpMax - 2048) / 1024) * 1024));
				if (usable < safeLimit) safeLimit = usable;
			}
		}
		return safeLimit;
	}

	// Event-driven high-throughput drain wait for P2P DataChannel (zero 25ms polling delay!)
	async waitForPeerDrain(targetClientId = null, highWaterMark = 6 * 1024 * 1024) {
		const targets = targetClientId
			? [targetClientId]
			: Object.keys(this.channel || {}).filter(cid => this.isPeerP2P(cid));

		for (const cid of targets) {
			const peer = this.channel[cid];
			if (!peer || !peer.dc || peer.dc.readyState !== 'open') continue;
			if (peer.dc.bufferedAmount >= highWaterMark) {
				await new Promise((resolve) => {
					const dc = peer.dc;
					let done = false;
					const finish = () => {
						if (done) return;
						done = true;
						clearTimeout(timer);
						dc.removeEventListener('bufferedamountlow', finish);
						resolve();
					};
					const timer = setTimeout(finish, 1500);
					dc.addEventListener('bufferedamountlow', finish, { once: true });
					if (dc.bufferedAmount < dc.bufferedAmountLowThreshold) finish();
				});
			}
		}
	}

	// Send raw binary AES-256-GCM encrypted file chunk over P2P DataChannel (15–60+ MB/s on LAN/Hotspot!)
	async sendBinaryFileChunk(fileId, volumeIndex, rawUint8, isPrivate = false, targetClientId = null) {
		const targets = targetClientId
			? [targetClientId]
			: Object.keys(this.channel || {}).filter(
				cid => this.channel[cid] && this.channel[cid].shared && this.channel[cid].username
			);
		if (targets.length === 0) return true;

		for (const cid of targets) {
			const peer = this.channel[cid];
			if (!peer || !peer.shared || !this.isPeerP2P(cid)) {
				return false;
			}
			const frameBuffer = await this._packBinaryFileChunk(fileId, volumeIndex, rawUint8, isPrivate, peer.shared);
			if (!frameBuffer) return false;
			try {
				peer.dc.send(frameBuffer);
			} catch (_) {
				peer.p2pReady = false;
				peer.p2pMode = null;
				this._notifyTransportChange();
				return false;
			}
		}
		return true;
	}

	getBufferedAmount(targetClientId = null) {
		if (targetClientId && this.isPeerP2P(targetClientId)) {
			return this.channel[targetClientId].dc.bufferedAmount || 0;
		}
		let maxBuffered = (this.connection && typeof this.connection.bufferedAmount === 'number')
			? this.connection.bufferedAmount
			: 0;
		if (!targetClientId && this.channel) {
			for (const cid in this.channel) {
				if (this.isPeerP2P(cid)) {
					const b = this.channel[cid].dc.bufferedAmount || 0;
					if (b > maxBuffered) maxBuffered = b;
				}
			}
		}
		return maxBuffered;
	}

	async onError(event) {
		this.logEvent('onError', event && event.type ? event.type : 'ws-error', 'error');
	}

	async onClose(event) {
		let details = null;
		try {
			details = {
				wsAddress: this.config ? this.config.wsAddress : null,
				code: event && typeof event.code === 'number' ? event.code : null,
				reason: event && typeof event.reason === 'string' ? event.reason : null
			};
		} catch (_) {}
		if (this.closeHandled) return;
		this.closeHandled = true;
		this.stopPing();
		this._cleanupAllPeers();
		this.serverKeys = null;
		this.serverShared = null;
		this._channelJoined = false;
		this.channel = {};
		if (this.credentials) this.startReconnect();
		if (this.callbacks.onServerClosed) {
			try { this.callbacks.onServerClosed(details || event); } catch (_) {}
		}
	}

	logEvent(source, message, level) {
		if (this.config.debug && level === 'error') {
			console.log('[SprintMate]', source, message || '');
		}
	}

	isOpen() {
		return Boolean(this.connection && this.connection.readyState === WebSocket.OPEN);
	}

	isClosed() {
		return Boolean(!this.connection || this.connection.readyState === WebSocket.CLOSED);
	}

	startReconnect(overrideDelay = null) {
		this.stopReconnect();
		const attempt = this.reconnectAttempts + 1;
		const baseDelay = this.config.reconnectDelay || 2500;
		const cappedDelay = Math.min(baseDelay * Math.pow(1.5, this.reconnectAttempts), 15000);
		const delay = typeof overrideDelay === 'number' ? overrideDelay : Math.floor(cappedDelay + Math.random() * 400);
		this.reconnectAttempts = attempt;
		this.reconnect = setTimeout(() => {
			this.reconnect = null;
			this.connect();
		}, delay);
	}

	stopReconnect() {
		if (this.reconnect) {
			clearTimeout(this.reconnect);
			this.reconnect = null;
		}
	}

	startPing() {
		this.stopPing();
		this.ping = setInterval(() => {
			this.sendMessage('ping');
		}, this.config.pingInterval);
	}

	stopPing() {
		if (this.ping) {
			clearInterval(this.ping);
			this.ping = null;
		}
	}

	disconnect() {
		this.stopReconnect();
		this.stopPing();
		this.stopVoiceCall(false);
		this._cleanupAllPeers();
		this.closeHandled = true;
		if (!this.isClosed()) {
			try { this.connection.close(); } catch (_) {}
		}
	}

	sendMessage(message) {
		try {
			if (this.isOpen()) {
				this.connection.send(message);
				return true;
			}
		} catch (error) {
			this.logEvent('sendMessage', error, 'error');
		}
		return false;
	}

	// Send an E2EE message to a single peer (prefers P2P DataChannel for ALL messages when open!)
	async sendClientMessage(targetClientId, type, data) {
		try {
			const peer = this.channel && this.channel[targetClientId];
			if (!peer || !peer.shared) return false;

			const encryptedClientPayload = await this.encryptClientMessage({
				a: 'm',
				t: type,
				d: data
			}, peer.shared);
			if (!encryptedClientPayload) return false;

			if (this.isPeerP2P(targetClientId)) {
				try {
					peer.dc.send(encryptedClientPayload);
					return true;
				} catch (_) {
					peer.p2pReady = false;
					peer.p2pMode = null;
					this._notifyTransportChange();
				}
			}

			if (!this.serverShared || !this.isOpen()) return false;
			const encryptedServerPayload = await this.encryptServerMessage({
				a: 'c',
				p: encryptedClientPayload,
				c: targetClientId
			}, this.serverShared);
			if (!encryptedServerPayload || encryptedServerPayload.length > (8 * 1024 * 1024)) return false;
			return this.sendMessage(encryptedServerPayload);
		} catch (error) {
			this.logEvent('sendClientMessage', error, 'error');
			return false;
		}
	}

	sendChannelMessage(type, data) {
		if (this.serverShared) {
			try {
				return this.sendChannelMessageAsync(type, data);
			} catch (error) {
				this.logEvent('sendChannelMessage', error, 'error');
			}
		}
		return Promise.resolve(false);
	}

	async sendChannelMessageAsync(type, data) {
		try {
			const peerIds = Object.keys(this.channel).filter(
				cid => this.channel[cid] && this.channel[cid].shared && this.channel[cid].username
			);
			if (peerIds.length === 0) return true;

			const isBulkChunk = typeof type === 'string' && type.startsWith('file_volume');
			const wsPayloads = {};
			let totalWsLength = 0;

			for (const clientId of peerIds) {
				const peer = this.channel[clientId];
				const encryptedClientPayload = await this.encryptClientMessage({
					a: 'm',
					t: type,
					d: data
				}, peer.shared);
				if (!encryptedClientPayload) return false;

				// Prefer direct P2P DataChannel for ALL messages when open (zero Cloudflare latency!)
				if (this.isPeerP2P(clientId)) {
					try {
						peer.dc.send(encryptedClientPayload);
						continue;
					} catch (_) {
						peer.p2pReady = false;
						peer.p2pMode = null;
						this._notifyTransportChange();
					}
				}

				wsPayloads[clientId] = encryptedClientPayload;
				totalWsLength += encryptedClientPayload.length;
			}

			const wsTargets = Object.keys(wsPayloads);
			if (wsTargets.length === 0) return true;

			if (isBulkChunk || totalWsLength > MAX_COMBINED_WS_FRAME || wsTargets.length > 2) {
				for (const clientId of wsTargets) {
					if (!this.isOpen()) return false;
					const singleServerPayload = await this.encryptServerMessage({
						a: 'c',
						p: wsPayloads[clientId],
						c: clientId
					}, this.serverShared);
					if (!singleServerPayload || !this.sendMessage(singleServerPayload)) return false;
				}
				return true;
			}

			const combinedPayload = await this.encryptServerMessage({
				a: 'w',
				p: wsPayloads,
			}, this.serverShared);
			if (!this.isOpen() || !combinedPayload || combinedPayload.length > (8 * 1024 * 1024)) return false;
			return this.sendMessage(combinedPayload);
		} catch (error) {
			this.logEvent('sendChannelMessageAsync', error, 'error');
		}
		return false;
	}

	async encryptServerMessage(message, key) { return await this.encryptAesGcm(message, key); }
	async decryptServerMessage(message, key) { return await this.decryptAesGcm(message, key); }
	async encryptClientMessage(message, key) { return await this.encryptAesGcm(message, key); }
	async decryptClientMessage(message, key) { return await this.decryptAesGcm(message, key); }

	xorHex(a, b) {
		let result = '', hexLength = Math.min(a.length, b.length);
		for (let i = 0; i < hexLength; ++i) {
			result += (parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16)).toString(16);
		}
		return result;
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
						{ name: 'HKDF', hash: 'SHA-256', salt, info },
						keyMaterial,
						256
					);
					return Buffer.from(new Uint8Array(bits)).toString('hex');
				} catch (_) {}
			}
			return this.xorHex(ecdhSecretHex.padEnd(64, '8').substr(0, 64), this.credentials.password);
		} catch (error) {
			return this.xorHex(ecdhSecretHex.padEnd(64, '8').substr(0, 64), this.credentials.password);
		}
	}

	isString(value) { return Boolean(value && Object.prototype.toString.call(value) === '[object String]'); }
	isArray(value) { return Boolean(value && Object.prototype.toString.call(value) === '[object Array]'); }
	isObject(value) { return Boolean(value && Object.prototype.toString.call(value) === '[object Object]'); }

	async handleServerKey(serverKey) {
		let pinned = null;
		try { pinned = localStorage.getItem(this.SERVER_KEY_STORAGE); } catch (_) {}
		if (!pinned) { try { pinned = sessionStorage.getItem(this.SERVER_KEY_STORAGE); } catch (_) {} }
		if (!pinned && this._pinnedServerKey) pinned = this._pinnedServerKey;
		if (pinned && pinned !== serverKey) {
			if (this.allowServerKeyRotation) {
				try { localStorage.removeItem(this.SERVER_KEY_STORAGE); } catch (_) {}
				try { sessionStorage.removeItem(this.SERVER_KEY_STORAGE); } catch (_) {}
				try { localStorage.setItem(this.SERVER_KEY_STORAGE, serverKey); } catch (_) {}
				this._pinnedServerKey = serverKey;
				this.config.rsaPublic = serverKey;
				try { if (typeof this.callbacks.onServerKeyRotated === 'function') this.callbacks.onServerKeyRotated(); } catch (_) {}
				return true;
			}
			this.disconnect();
			return false;
		}
		if (!pinned) {
			try { localStorage.setItem(this.SERVER_KEY_STORAGE, serverKey); } catch (_) {}
			this._pinnedServerKey = serverKey;
			pinned = serverKey;
		}
		this.config.rsaPublic = pinned;
		return true;
	}
}

if (typeof window !== 'undefined') {
	window.SprintMate = SprintMate;
}
