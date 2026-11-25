// Room management logic for SprintMate web client
// SprintMate 网页客户端的房间管理逻辑

import {
	createAvatarSVG,
	escapeHTML,
	$id,
	createElement
} from './utils.js';
import {
	renderChatArea,
	addSystemMsg,
	updateChatInputStyle
} from './chat.js';
import {
	renderMainHeader,
	renderUserList
} from './ui.js';
import { t } from './util.i18n.js';

let roomsData = [];
let activeRoomIndex = -1;

function emitConnectionStatus(status = '') {
	try {
		window.dispatchEvent(new CustomEvent('connectionStatusChange', {
			detail: { status }
		}));
	} catch (_) {}
}

function setRoomConnectionStatus(rd, status = '') {
	if (!rd) return;
	rd.connectionStatus = status;
	renderRooms(activeRoomIndex);
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex] === rd) {
		emitConnectionStatus(status);
	}
}

// Get a new room data object
export function getNewRoomData() {
	return {
		roomName: '',
		password: '',
		userList: [],
		userMap: {},
		myId: null,
		myUserName: '',
		chat: null,
		messages: [],
		prevUserList: [],
		knownUserIds: new Set(),
		unreadCount: 0,
		privateChatTargetId: null,
		privateChatTargetName: null,
		connectionStatus: '',
		hasSecuredOnce: false,
		isInitialized: false,
		joinedAt: Date.now(),
		awaitingReconnectNotice: false,
		lastDisconnectNoticeAt: 0,
		voiceCallState: { active: false, muted: false, remotePeers: [], remoteCount: 0 }
	};
}

// Switch to another room by index
export function switchRoom(index) {
	if (index < 0 || index >= roomsData.length) return;
	activeRoomIndex = index;
	const rd = roomsData[index];
	if (typeof rd.unreadCount === 'number') rd.unreadCount = 0;
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = rd.myUserName;
	setSidebarAvatar(rd.myUserName);
	renderRooms(index);
	renderMainHeader();
	renderUserList(false);
	renderChatArea();
	emitConnectionStatus(rd.connectionStatus || '');
	updateChatInputStyle();
	if (typeof window.renderVoiceCallBanner === 'function') {
		window.renderVoiceCallBanner(rd.voiceCallState || { active: false, muted: false, remotePeers: [], remoteCount: 0 });
	}
}

// Set the sidebar avatar
export function setSidebarAvatar(userName) {
	if (!userName) return;
	const svg = createAvatarSVG(userName);
	const el = $id('sidebar-user-avatar');
	if (el) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		el.innerHTML = cleanSvg;
	}
}

// Render the room list in the left sidebar
export function renderRooms(activeId = activeRoomIndex) {
	const roomList = $id('room-list');
	if (!roomList) return;
	roomList.innerHTML = '';
	roomsData.forEach((rd, i) => {
		const isActive = i === activeId;
		const div = createElement('div', {
			class: 'room' + (isActive ? ' active' : ''),
			onclick: () => switchRoom(i)
		});
		const safeRoomName = escapeHTML(rd.roomName);
		let onlineCount = rd.userList ? rd.userList.length : 0;
		if (!rd.userList || !rd.userList.some(u => u.clientId === rd.myId)) {
			onlineCount += 1;
		}
		const statusClass = rd.connectionStatus ? `status-${rd.connectionStatus}` : 'status-connecting';
		const hasPassword = Boolean(rd.password && rd.password.length > 0);
		let unreadHtml = '';
		if (rd.unreadCount && !isActive) {
			unreadHtml = `<span class="room-unread-badge">${rd.unreadCount > 99 ? '99+' : rd.unreadCount}</span>`;
		}
		div.innerHTML = `
			<div class="room-icon-wrap">
				<span class="room-hash">#</span>
				<span class="room-status-dot ${statusClass}"></span>
			</div>
			<div class="info">
				<div class="title-row">
					<span class="title">${safeRoomName}</span>
					${hasPassword ? '<span class="room-lock-icon" title="Password Protected E2EE">🔒</span>' : ''}
				</div>
				<div class="room-submeta">${onlineCount} ${t('ui.members', 'members')}</div>
			</div>
			${unreadHtml}
		`;
		roomList.appendChild(div);
	});
}

// Join a room
export function joinRoom(userName, roomName, password, modal = null, onResult) {
	const prevRd = (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) ? roomsData[activeRoomIndex] : null;
	const newRd = getNewRoomData();
	newRd.roomName = roomName;
	newRd.myUserName = userName;
	newRd.password = password || '';
	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);

	let closed = false;
	let secured = false;
	let chatInst = null;
	let connectTimeout = null;
	setRoomConnectionStatus(newRd, 'connecting');

	const cleanupFailedInitialJoin = () => {
		setRoomConnectionStatus(newRd, 'disconnected');
		try {
			if (chatInst) chatInst.destruct();
		} catch (_) {}
		const removeIndex = roomsData.indexOf(newRd);
		if (removeIndex >= 0) {
			roomsData.splice(removeIndex, 1);
		}
		const prevIndex = prevRd ? roomsData.indexOf(prevRd) : -1;
		if (prevIndex >= 0) {
			switchRoom(prevIndex);
		} else if (roomsData.length > 0) {
			switchRoom(0);
		} else {
			activeRoomIndex = -1;
			emitConnectionStatus('');
			renderRooms(-1);
			renderMainHeader();
			renderUserList(false);
			renderChatArea();
		}
	};

	const callbacks = {
		onJoinError: (errCode) => {
			if (connectTimeout) {
				clearTimeout(connectTimeout);
				connectTimeout = null;
			}
			cleanupFailedInitialJoin();
			if (onResult && !closed) {
				closed = true;
				onResult(false, errCode);
			}
		},
		onServerClosed: () => {
			if (connectTimeout) {
				clearTimeout(connectTimeout);
				connectTimeout = null;
			}
			// Only remove the room if it NEVER connected even once
			if (!newRd.hasSecuredOnce) {
				cleanupFailedInitialJoin();
			} else {
				secured = false;
				setRoomConnectionStatus(newRd, 'reconnecting');
				newRd.awaitingReconnectNotice = true;
				newRd.userList = [];
				newRd.userMap = {};
				const now = Date.now();
				if (now - (newRd.lastDisconnectNoticeAt || 0) > 10000) {
					newRd.lastDisconnectNoticeAt = now;
					const msg = t('system.reconnecting', 'Connection lost, reconnecting...');
					newRd.messages.push({ type: 'system', text: msg, timestamp: now });
					if (roomsData.indexOf(newRd) === activeRoomIndex) {
						addSystemMsg(msg, true, now);
					}
				}
				if (roomsData.indexOf(newRd) === activeRoomIndex) {
					renderUserList(false);
					renderMainHeader();
				}
			}
			if (onResult && !closed) {
				closed = true;
				onResult(false);
			}
		},
		onServerSecured: () => {
			if (connectTimeout) {
				clearTimeout(connectTimeout);
				connectTimeout = null;
			}
			secured = true;
			const wasReconnecting = newRd.awaitingReconnectNotice && newRd.hasSecuredOnce;
			newRd.hasSecuredOnce = true;
			newRd.isSecured = true;
			newRd.awaitingReconnectNotice = false;
			newRd.lastDisconnectNoticeAt = 0;
			setRoomConnectionStatus(newRd, 'connected');

			// Mark room initialized after brief initial handshake window so existing members don't spam join notices
			setTimeout(() => {
				newRd.isInitialized = true;
			}, 1200);

			if (modal) {
				modal.remove();
			}
			const loginContainer = $id('login-container');
			if (loginContainer) loginContainer.style.display = 'none';
			const chatContainer = $id('chat-container');
			if (chatContainer) chatContainer.style.display = '';
			document.body.classList.remove('login-page');
			if (typeof window.stopHeroParticles === 'function') {
				window.stopHeroParticles();
			}

			if (wasReconnecting) {
				const now = Date.now();
				const msg = t('system.resecured', 'Connection restored and secured again');
				newRd.messages.push({ type: 'system', text: msg, timestamp: now });
				if (roomsData.indexOf(newRd) === activeRoomIndex) {
					addSystemMsg(msg, true, now);
				}
			}

			if (onResult && !closed) {
				closed = true;
				onResult(true);
			}
		},
		onClientSecured: (user) => {
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0) handleClientSecured(currentIdx, user);
		},
		onClientList: (list, selfId) => {
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0) handleClientList(currentIdx, list, selfId);
		},
		onClientLeft: (clientId) => {
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0) handleClientLeft(currentIdx, clientId);
		},
		onClientMessage: (msg) => {
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0) handleClientMessage(currentIdx, msg);
		},
		onBinaryFileChunk: (chunk) => {
			if (window.handleBinaryFileChunk) {
				window.handleBinaryFileChunk(chunk);
			}
		},
		onTransportChange: () => {
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0 && currentIdx === activeRoomIndex) {
				renderUserList(false);
				renderMainHeader();
			}
		},
		onVoiceCallUpdate: (state) => {
			newRd.voiceCallState = state;
			const currentIdx = roomsData.indexOf(newRd);
			if (currentIdx >= 0 && currentIdx === activeRoomIndex && typeof window.renderVoiceCallBanner === 'function') {
				window.renderVoiceCallBanner(state);
			}
		}
	};

	chatInst = new window.SprintMate(window.config, callbacks);
	chatInst.setCredentials(userName, roomName, password);
	chatInst.connect();

	connectTimeout = setTimeout(() => {
		if (secured || closed || newRd.hasSecuredOnce) return;
		cleanupFailedInitialJoin();
		if (onResult && !closed) {
			closed = true;
			onResult(false);
		}
	}, 12000);

	newRd.chat = chatInst;
}

// Handle the client list update
export function handleClientList(idx, list, selfId) {
	const rd = roomsData[idx];
	if (!rd) return;
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set((list || []).map(u => u.clientId));
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId);
		}
	}
	rd.userList = list || [];
	rd.userMap = {};
	rd.userList.forEach(u => {
		rd.userMap[u.clientId] = u;
		if (!rd.isInitialized) {
			rd.knownUserIds.add(u.clientId);
		}
	});
	if (selfId) rd.myId = selfId;
	renderRooms(activeRoomIndex);
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader();
	}
}

// Handle client secured event
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd || !user) return;
	rd.userMap[user.clientId] = user;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === user.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(user);
	} else {
		rd.userList[existingUserIndex] = user;
	}
	renderRooms(activeRoomIndex);
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader();
	}
	const isNew = !rd.knownUserIds.has(user.clientId);
	rd.knownUserIds.add(user.clientId);
	if (!rd.isInitialized) {
		return;
	}
	if (isNew) {
		const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
		const msg = `${name} ${t('system.joined', 'joined the conversation')}`;
		const now = Date.now();
		rd.messages.push({
			type: 'system',
			text: msg,
			timestamp: now
		});
		if (activeRoomIndex === idx) addSystemMsg(msg, true, now);
		if (window.notifyMessage) {
			window.notifyMessage(rd.roomName, 'system', msg);
		}
	}
}

// Handle client left event
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	if (!rd.userMap[clientId] && !rd.userList.some(u => u.clientId === clientId)) {
		return;
	}
	if (rd.privateChatTargetId === clientId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
		if (activeRoomIndex === idx) {
			updateChatInputStyle();
		}
	}
	const user = rd.userMap[clientId];
	const name = user ? (user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous')) : t('ui.anonymous', 'Anonymous');
	rd.userList = rd.userList.filter(u => u.clientId !== clientId);
	delete rd.userMap[clientId];
	rd.knownUserIds.delete(clientId);

	const msg = `${name} ${t('system.left', 'left the conversation')}`;
	const now = Date.now();
	rd.messages.push({
		type: 'system',
		text: msg,
		timestamp: now
	});
	if (activeRoomIndex === idx) addSystemMsg(msg, true, now);
	renderRooms(activeRoomIndex);
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader();
	}
}

// Handle client message event
export function handleClientMessage(idx, msg) {
	const newRd = roomsData[idx];
	if (!newRd || !msg) return;

	const senderName = msg.userName || msg.username;
	if (msg.clientId === newRd.myId && senderName === newRd.myUserName && !msg.type.includes('_private')) {
		return;
	}

	let msgType = msg.type || 'text';

	// Handle file transfer messages (start, volume, ack, complete, resend_request, cancel)
	if (msgType.startsWith('file_')) {
		const isPrivateFile = msgType.includes('_private');
		const baseFileType = msgType.replace('_private', '');

		// Ensure payload has canonical type so handleFileMessage always dispatches properly
		const filePayload = (msg.data && typeof msg.data === 'object')
			? { ...msg.data, type: msg.data.type || baseFileType }
			: { type: baseFileType };

		if (baseFileType === 'file_start') {
			let realUserName = senderName || filePayload.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			const historyMsgType = isPrivateFile ? 'file_private' : 'file';
			const fileId = filePayload.fileId;
			if (fileId) {
				const messageAlreadyInHistory = newRd.messages.some(
					m => m.msgType === historyMsgType && m.text && m.text.fileId === fileId
				);
				if (!messageAlreadyInHistory) {
					newRd.messages.push({
						type: 'other',
						text: { ...filePayload, userName: realUserName },
						userName: realUserName,
						avatar: realUserName,
						msgType: historyMsgType,
						timestamp: filePayload.timestamp || Date.now()
					});
				}
			}

			const notificationMsgType = isPrivateFile ? 'private file' : 'file';
			if (window.notifyMessage && filePayload.fileName) {
				window.notifyMessage(newRd.roomName, notificationMsgType, `${filePayload.fileName}`, realUserName);
			}
		}

		if (window.handleFileMessage) {
			window.handleFileMessage(filePayload, isPrivateFile, msg.clientId);
		}

		if (activeRoomIndex !== idx && baseFileType === 'file_start') {
			newRd.unreadCount = (newRd.unreadCount || 0) + 1;
			renderRooms(activeRoomIndex);
		}
		return;
	}

	// Handle image messages
	if (msgType === 'image' || msgType === 'image_private') {
		// Already has correct type
	} else if (!msgType.includes('_private')) {
		if (msg.data && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
			msgType = 'image';
		} else if (msg.data && typeof msg.data === 'object' && msg.data.image) {
			msgType = 'image';
		}
	}

	let realUserName = senderName;
	if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
		realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
	}

	const now = Date.now();
	roomsData[idx].messages.push({
		type: 'other',
		text: msg.data,
		userName: realUserName,
		avatar: realUserName,
		msgType: msgType,
		timestamp: now
	});

	if (activeRoomIndex === idx) {
		if (window.addOtherMsg) {
			window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType, now);
		}
	} else {
		roomsData[idx].unreadCount = (roomsData[idx].unreadCount || 0) + 1;
		renderRooms(activeRoomIndex);
	}

	const notificationMsgType = msgType.includes('_private') ? `private ${msgType.split('_')[0]}` : msgType;
	if (window.notifyMessage) {
		window.notifyMessage(newRd.roomName, notificationMsgType, msg.data, realUserName);
	}
}

// Toggle private chat with a user
export function togglePrivateChat(targetId, targetName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	if (!targetId || rd.privateChatTargetId === targetId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
	} else {
		rd.privateChatTargetId = targetId;
		rd.privateChatTargetName = targetName;
	}
	renderUserList();
	updateChatInputStyle();
}

// Clear private chat target in current room
export function clearPrivateChat() {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	rd.privateChatTargetId = null;
	rd.privateChatTargetName = null;
	renderUserList();
	updateChatInputStyle();
}
window.clearPrivateChat = clearPrivateChat;

// Exit the current room
export function exitRoom() {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const chatInst = roomsData[activeRoomIndex].chat;
		if (chatInst && typeof chatInst.destruct === 'function') {
			chatInst.destruct();
		} else if (chatInst && typeof chatInst.disconnect === 'function') {
			chatInst.disconnect();
		}
		roomsData[activeRoomIndex].chat = null;
		roomsData.splice(activeRoomIndex, 1);
		if (roomsData.length > 0) {
			switchRoom(0);
			return true;
		} else {
			activeRoomIndex = -1;
			emitConnectionStatus('');
			return false;
		}
	}
	return false;
}

// Update current room username
export function updateCurrentUserName(nextName) {
	if (activeRoomIndex < 0 || !roomsData[activeRoomIndex]) {
		return false;
	}
	const normalizedName = (nextName || '').toString().trim();
	if (!normalizedName) {
		return false;
	}
	const rd = roomsData[activeRoomIndex];
	if (rd.myUserName === normalizedName) {
		return true;
	}
	rd.myUserName = normalizedName;
	if (rd.myId && rd.userMap[rd.myId]) {
		rd.userMap[rd.myId].userName = normalizedName;
		rd.userMap[rd.myId].username = normalizedName;
		rd.userMap[rd.myId].name = normalizedName;
	}
	const selfIndex = rd.userList.findIndex(u => u.clientId === rd.myId);
	if (selfIndex >= 0) {
		rd.userList[selfIndex].userName = normalizedName;
		rd.userList[selfIndex].username = normalizedName;
		rd.userList[selfIndex].name = normalizedName;
	}
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = normalizedName;
	setSidebarAvatar(normalizedName);
	renderUserList(false);
	renderMainHeader();
	if (rd.chat && typeof rd.chat.updateUsername === 'function') {
		rd.chat.updateUsername(normalizedName);
	}
	return true;
}

export { roomsData, activeRoomIndex };

window.addEventListener('updateSidebarUsername', () => {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];
		const sidebarUsername = document.getElementById('sidebar-username');
		if (sidebarUsername && rd.myUserName) {
			sidebarUsername.textContent = rd.myUserName;
		}
		if (rd.myUserName) {
			setSidebarAvatar(rd.myUserName);
		}
	}
});
