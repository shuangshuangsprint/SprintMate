// UI logic for SprintMate web client
// SprintMate 网页客户端的 UI 逻辑

import {
	createAvatarSVG,
	escapeHTML,
	$id,
	applyThemeMode
} from './utils.js';
import {
	roomsData,
	activeRoomIndex,
	togglePrivateChat,
	exitRoom
} from './room.js';
import {
	closeSettingsPanel
} from './util.settings.js';
import {
	t,
	getCurrentLanguage,
	setLanguage
} from './util.i18n.js';
import {
	updateChatInputStyle
} from './chat.js';

// Simple encryption/decryption using base64 and character shifting for share URLs
function simpleEncrypt(text) {
	if (!text) return '';
	const base64 = btoa(unescape(encodeURIComponent(text)));
	return base64.split('').map(char => {
		const code = char.charCodeAt(0);
		return String.fromCharCode(code + 3);
	}).join('');
}

function simpleDecrypt(encrypted) {
	if (!encrypted) return '';
	try {
		const shifted = encrypted.split('').map(char => {
			const code = char.charCodeAt(0);
			return String.fromCharCode(code - 3);
		}).join('');
		return decodeURIComponent(escape(atob(shifted)));
	} catch (error) {
		console.warn('Failed to decrypt share link data:', error);
		return '';
	}
}

// Persist parsed share link parameters in memory so form re-renders (e.g. i18n language init) never lose them
let cachedShareParams = null;

function captureShareParamsFromUrl() {
	if (cachedShareParams) return cachedShareParams;
	const params = new URLSearchParams(window.location.search);
	const encryptedRoom = params.get('r');
	const encryptedPwd = params.get('p');
	const plaintextRoom = params.get('node');
	const plaintextPwd = params.get('pwd');

	let roomValue = '';
	let pwdValue = '';
	let isPlaintext = false;

	if (encryptedRoom) {
		roomValue = simpleDecrypt(decodeURIComponent(encryptedRoom));
		if (encryptedPwd) {
			pwdValue = simpleDecrypt(decodeURIComponent(encryptedPwd));
		}
	} else if (plaintextRoom) {
		roomValue = decodeURIComponent(plaintextRoom);
		if (plaintextPwd) {
			pwdValue = decodeURIComponent(plaintextPwd);
		}
		isPlaintext = true;
	}

	if (roomValue) {
		cachedShareParams = {
			roomName: roomValue,
			password: pwdValue || '',
			isPlaintext,
			locked: true
		};
		try {
			window.history.replaceState({}, '', location.pathname);
		} catch (_) {}
	}
	return cachedShareParams;
}

function validateRoomData(roomData) {
	if (!roomData) {
		return { valid: false, error: 'No room data available' };
	}
	if (!roomData.roomName || roomData.roomName.trim() === '') {
		return { valid: false, error: 'Room name is required' };
	}
	return { valid: true };
}

function copyToClipboard(text, successMessage = t('action.copied', 'Copied to clipboard!'), errorPrefix = t('action.copy_failed', 'Copy failed, url:')) {
	if (!text) {
		window.addSystemMsg && window.addSystemMsg(t('action.nothing_to_copy', 'Nothing to copy'));
		return;
	}
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(() => {
			window.addSystemMsg && window.addSystemMsg(successMessage);
		}).catch(() => {
			showFallbackCopy(text, errorPrefix);
		});
	} else {
		showFallbackCopy(text, errorPrefix);
	}
}

function showFallbackCopy(text, prefix) {
	if (typeof prompt === 'function') {
		prompt(prefix, text);
	} else {
		window.addSystemMsg && window.addSystemMsg(t('action.copy_not_supported', 'Copy not supported in this environment'));
	}
}

function executeMenuAction(action, closeMenuCallback) {
	try {
		switch (action) {
			case 'share':
				handleShareAction();
				break;
			case 'exit':
				handleExitAction();
				break;
			default:
				console.warn('Unknown menu action:', action);
		}
	} catch (error) {
		console.error('Menu action failed:', error);
		window.addSystemMsg && window.addSystemMsg(t('action.action_failed', 'Action failed. Please try again.'));
	} finally {
		closeMenuCallback && closeMenuCallback();
	}
}

export function handleShareAction() {
	const validation = validateRoomData(roomsData[activeRoomIndex]);
	if (!validation.valid) {
		window.addSystemMsg && window.addSystemMsg(`${t('action.cannot_share', 'Cannot share:')} ${validation.error}`);
		return;
	}

	const rd = roomsData[activeRoomIndex];
	const roomName = rd.roomName.trim();

	const encryptedRoom = simpleEncrypt(roomName);
	let baseUrl = `${location.origin}${location.pathname}`;
	if (isApkMode() && window.config && window.config.wsAddress) {
		baseUrl = window.config.wsAddress
			.replace(/^wss:/i, 'https:')
			.replace(/^ws:/i, 'http:')
			.replace(/\/$/, '') + '/';
	}
	const url = `${baseUrl}?r=${encodeURIComponent(encryptedRoom)}`;

	copyToClipboard(url, t('action.share_copied', 'Share link copied!'), t('action.copy_url_failed', 'Copy failed, url:'));
}

function handleExitAction() {
	try {
		const result = exitRoom();
		if (!result) {
			location.reload();
		}
	} catch (error) {
		console.error('Exit room failed:', error);
		location.reload();
	}
}

let currentConnectionStatus = '';

function connectionStatusText(status) {
	switch (status) {
		case 'connecting':
			return t('ui.connecting', 'Connecting...');
		case 'connected':
			return t('status.connected', 'E2EE Secured');
		case 'reconnecting':
			return t('system.reconnecting', 'Reconnecting...');
		case 'disconnected':
			return t('status.disconnected', 'Disconnected');
		default:
			return '';
	}
}

function ensureConnectionStatusBadge() {
	const headerFlex = document.querySelector('#main-header-center .main-header-flex') || document.getElementById('main-header-center');
	if (!headerFlex) return null;
	let badge = document.getElementById('connection-status-badge');
	if (!badge) {
		badge = document.createElement('span');
		badge.id = 'connection-status-badge';
		badge.className = 'connection-status-badge';
		headerFlex.appendChild(badge);
	}
	return badge;
}

function applyConnectionStatusBadge() {
	const badge = ensureConnectionStatusBadge();
	if (!badge) return;
	const rd = roomsData[activeRoomIndex];
	const mode = rd && rd.chat && typeof rd.chat.getTransportMode === 'function' ? rd.chat.getTransportMode() : 'relay';
	const text = connectionStatusText(currentConnectionStatus);
	if (!text) {
		badge.hidden = true;
		badge.textContent = '';
		badge.className = 'connection-status-badge';
		return;
	}
	badge.hidden = false;
	if (currentConnectionStatus === 'connected') {
		if (mode === 'lan') {
			badge.textContent = `${text} · ⚡ 热点/局域网直连`;
		} else if (mode === 'p2p') {
			badge.textContent = `${text} · ⚡ P2P 直连`;
		} else {
			badge.textContent = text;
		}
	} else {
		badge.textContent = text;
	}
	badge.className = `connection-status-badge is-${currentConnectionStatus}`;
}

export function setConnectionStatusBadge(status = '') {
	currentConnectionStatus = status || '';
	applyConnectionStatusBadge();
}

// Render the main header
export function renderMainHeader() {
	const headerEl = $id('main-header');
	if (!headerEl) return;
	const rd = roomsData[activeRoomIndex];
	const roomName = rd ? rd.roomName : 'Room';
	let onlineCount = rd && rd.userList ? rd.userList.length : 0;
	if (rd && (!rd.userList || !rd.userList.some(u => u.clientId === rd.myId))) {
		onlineCount += 1;
	}
	const safeRoomName = escapeHTML(roomName);

	headerEl.innerHTML = `
		<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle Rooms Sidebar" title="Toggle Rooms Sidebar">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
				<line x1="9" y1="3" x2="9" y2="21"/>
			</svg>
		</button>
		<div class="main-header-center" id="main-header-center">
			<div class="main-header-flex">
				<div class="group-title">#${safeRoomName}</div>
				<span class="main-header-members">${onlineCount} ${t('ui.members', 'members')}</span>
			</div>
		</div>
		<div class="main-header-actions">
			<button class="header-share-pill header-voice-btn ${rd && rd.voiceCallState && rd.voiceCallState.active ? 'is-calling' : ''}" id="header-voice-btn" type="button" title="实时语音通话">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
					<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
				</svg>
				<span>${rd && rd.voiceCallState && rd.voiceCallState.active ? '通话中' : '语音通话'}</span>
			</button>
			<button class="header-share-pill" id="header-share-btn" type="button" title="${t('action.share', 'Copy Invite Link')}">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
				</svg>
				<span>${t('action.share', 'Share')}</span>
			</button>
			<button class="mobile-info-btn" id="mobile-info-btn" aria-label="Toggle Members Panel" title="${t('ui.members', 'Members')}">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
					<circle cx="9" cy="7" r="4"/>
					<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
					<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
				</svg>
			</button>
			<button class="more-btn" id="more-btn" aria-label="More Options">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="1"/>
					<circle cx="12" cy="5" r="1"/>
					<circle cx="12" cy="19" r="1"/>
				</svg>
			</button>
			<div class="more-menu" id="more-menu">
				<div class="more-menu-item" data-action="share">🔗 ${t('action.share', 'Copy Invite Link')}</div>
				<div class="more-menu-item" data-action="exit">🚪 ${t('action.exit', 'Leave Room')}</div>
			</div>
		</div>
	`;

	const shareBtn = $id('header-share-btn');
	if (shareBtn) {
		shareBtn.onclick = (e) => {
			e.stopPropagation();
			handleShareAction();
		};
	}

	const voiceBtn = $id('header-voice-btn');
	if (voiceBtn) {
		voiceBtn.onclick = async (e) => {
			e.stopPropagation();
			const activeRd = roomsData[activeRoomIndex];
			if (!activeRd || !activeRd.chat) return;
			try {
				if (activeRd.chat.voiceCallActive) {
					await activeRd.chat.stopVoiceCall(true);
				} else {
					await activeRd.chat.startVoiceCall();
				}
			} catch (err) {
				if (window.addSystemMsg) {
					window.addSystemMsg('无法开启麦克风语音通话：请确认浏览器已授予麦克风权限并使用 HTTPS 访问（' + err.message + '）');
				}
			}
		};
	}

	applyConnectionStatusBadge();
	setupMoreBtnMenu();
	setupMobileUIHandlers();
}

let voiceCallTimerInterval = null;
let voiceCallStartedAt = 0;

function formatCallDuration(sec) {
	const m = Math.floor(sec / 60).toString().padStart(2, '0');
	const s = (sec % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

export function renderVoiceCallBanner(state = { active: false, muted: false, remotePeers: [], remoteCount: 0 }) {
	const bar = $id('voice-call-bar');
	const headerBtn = $id('header-voice-btn');
	if (headerBtn) {
		headerBtn.classList.toggle('is-calling', Boolean(state && state.active));
		const span = headerBtn.querySelector('span');
		if (span) span.textContent = state && state.active ? '通话中' : '语音通话';
	}
	if (!bar) return;

	if (!state || (!state.active && (!state.remoteCount || state.remoteCount === 0))) {
		bar.style.display = 'none';
		bar.innerHTML = '';
		if (voiceCallTimerInterval) {
			clearInterval(voiceCallTimerInterval);
			voiceCallTimerInterval = null;
		}
		voiceCallStartedAt = 0;
		return;
	}

	const namesText = (state.remotePeers && state.remotePeers.length > 0)
		? escapeHTML(state.remotePeers.join('、'))
		: '';

	if (state.active) {
		if (!voiceCallStartedAt) voiceCallStartedAt = Date.now();
		const elapsed = Math.floor((Date.now() - voiceCallStartedAt) / 1000);
		bar.style.display = 'flex';
		bar.className = 'voice-call-bar is-active';
		bar.innerHTML = `
			<div class="voice-call-info">
				<span class="voice-call-dot"></span>
				<strong>🎙️ 加密语音通话中</strong>
				<span class="voice-call-timer" id="voice-call-timer">${formatCallDuration(elapsed)}</span>
				${namesText ? `<span class="voice-call-peers">· 已连线: ${namesText}</span>` : '<span class="voice-call-peers">· 等待房间成员加入...</span>'}
			</div>
			<div class="voice-call-controls">
				<button type="button" class="voice-ctrl-btn ${state.muted ? 'is-muted' : ''}" id="voice-mute-btn">${state.muted ? '🔇 已静音' : '🎤 麦克风开'}</button>
				<button type="button" class="voice-ctrl-btn is-hangup" id="voice-hangup-btn">挂断</button>
			</div>
		`;
		if (!voiceCallTimerInterval) {
			voiceCallTimerInterval = setInterval(() => {
				const timerEl = $id('voice-call-timer');
				if (timerEl && voiceCallStartedAt) {
					timerEl.textContent = formatCallDuration(Math.floor((Date.now() - voiceCallStartedAt) / 1000));
				}
			}, 1000);
		}
		const muteBtn = $id('voice-mute-btn');
		if (muteBtn) {
			muteBtn.onclick = () => {
				const rd = roomsData[activeRoomIndex];
				if (rd && rd.chat) rd.chat.toggleVoiceMute();
			};
		}
		const hangupBtn = $id('voice-hangup-btn');
		if (hangupBtn) {
			hangupBtn.onclick = () => {
				const rd = roomsData[activeRoomIndex];
				if (rd && rd.chat) rd.chat.stopVoiceCall(true);
			};
		}
	} else {
		if (voiceCallTimerInterval) {
			clearInterval(voiceCallTimerInterval);
			voiceCallTimerInterval = null;
		}
		voiceCallStartedAt = 0;
		bar.style.display = 'flex';
		bar.className = 'voice-call-bar is-ringing';
		bar.innerHTML = `
			<div class="voice-call-info">
				<span class="voice-call-dot"></span>
				<strong>📞 ${namesText || '房间成员'} 正在进行加密语音通话</strong>
			</div>
			<div class="voice-call-controls">
				<button type="button" class="voice-ctrl-btn is-join" id="voice-join-btn">加入通话</button>
			</div>
		`;
		const joinBtn = $id('voice-join-btn');
		if (joinBtn) {
			joinBtn.onclick = async () => {
				const rd = roomsData[activeRoomIndex];
				if (rd && rd.chat) {
					try {
						await rd.chat.startVoiceCall();
					} catch (err) {
						if (window.addSystemMsg) window.addSystemMsg('无法加入语音通话：' + err.message);
					}
				}
			};
		}
	}
}
window.renderVoiceCallBanner = renderVoiceCallBanner;

let globalDocClickBound = false;

export function setupMobileUIHandlers() {
	const sidebar = document.getElementById('sidebar');
	const rightbar = document.getElementById('rightbar');
	const settingsSidebar = document.getElementById('settings-sidebar');
	const mobileMenuBtn = document.getElementById('mobile-menu-btn');
	const mobileInfoBtn = document.getElementById('mobile-info-btn');
	const sidebarMask = document.getElementById('mobile-sidebar-mask');
	const rightbarMask = document.getElementById('mobile-rightbar-mask');

	function isMobile() {
		return window.innerWidth <= 768;
	}

	function updateMobileBtnDisplay() {
		if (isMobile()) {
			document.body.classList.remove('desktop-hide-left');
			document.body.classList.remove('desktop-hide-right');
		} else {
			if (sidebar) sidebar.classList.remove('mobile-open');
			if (rightbar) rightbar.classList.remove('mobile-open');
			if (sidebarMask) sidebarMask.classList.remove('active');
			if (rightbarMask) rightbarMask.classList.remove('active');
		}
	}
	updateMobileBtnDisplay();

	if (mobileMenuBtn && sidebar && sidebarMask) {
		mobileMenuBtn.onclick = function(e) {
			e.stopPropagation();
			if (isMobile()) {
				sidebar.classList.add('mobile-open');
				sidebarMask.classList.add('active');
			} else {
				document.body.classList.toggle('desktop-hide-left');
			}
		};
		sidebarMask.onclick = function() {
			if (settingsSidebar && settingsSidebar.classList.contains('mobile-open')) {
				closeSettingsPanel();
			} else {
				sidebar.classList.remove('mobile-open');
				sidebarMask.classList.remove('active');
			}
		};
	}

	if (mobileInfoBtn && rightbar && rightbarMask) {
		mobileInfoBtn.onclick = function(e) {
			e.stopPropagation();
			if (isMobile()) {
				rightbar.classList.add('mobile-open');
				rightbarMask.classList.add('active');
			} else {
				document.body.classList.toggle('desktop-hide-right');
			}
		};
		rightbarMask.onclick = function() {
			rightbar.classList.remove('mobile-open');
			rightbarMask.classList.remove('active');
		};
	}

	if (!globalDocClickBound) {
		globalDocClickBound = true;
		window.addEventListener('resize', updateMobileBtnDisplay);
		document.addEventListener('click', function(ev) {
			const settingsBtn = $id('settings-btn');
			const sSidebar = $id('settings-sidebar');
			const lSidebar = $id('sidebar');
			const rSidebar = $id('rightbar');
			const lMask = $id('mobile-sidebar-mask');
			const rMask = $id('mobile-rightbar-mask');
			const mMenuBtn = $id('mobile-menu-btn');
			const mInfoBtn = $id('mobile-info-btn');

			const isSettingsButtonClick = settingsBtn && settingsBtn.contains(ev.target);
			const isSettingsBackButtonClick = $id('settings-back-btn') && $id('settings-back-btn').contains(ev.target);

			if (sSidebar && (sSidebar.classList.contains('open') || sSidebar.classList.contains('mobile-open'))) {
				if (!sSidebar.contains(ev.target) && !isSettingsButtonClick && !isSettingsBackButtonClick) {
					closeSettingsPanel();
				}
			}

			if (window.innerWidth <= 768) {
				if (lSidebar && lSidebar.classList.contains('mobile-open')) {
					if (!lSidebar.contains(ev.target) && (!mMenuBtn || !mMenuBtn.contains(ev.target))) {
						lSidebar.classList.remove('mobile-open');
						if (lMask) lMask.classList.remove('active');
					}
				}
				if (rSidebar && rSidebar.classList.contains('mobile-open')) {
					if (!rSidebar.contains(ev.target) && (!mInfoBtn || !mInfoBtn.contains(ev.target))) {
						rSidebar.classList.remove('mobile-open');
						if (rMask) rMask.classList.remove('active');
					}
				}
			}
		});
	}
}

// Render the user/member list
export function renderUserList(updateHeader = false) {
	const userListEl = $id('member-list');
	if (!userListEl) return;
	userListEl.innerHTML = '';
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;

	const me = rd.userList.find(u => u.clientId === rd.myId) || {
		clientId: rd.myId || 'me',
		userName: rd.myUserName
	};
	const others = rd.userList.filter(u => u.clientId !== rd.myId);

	const groupDesc = $id('rightbar-group-desc');
	if (groupDesc) {
		groupDesc.textContent = `${others.length + 1} ${t('ui.members', 'members')} · AES-256-GCM`;
	}

	if (others.length > 0) {
		const tip = document.createElement('div');
		tip.className = 'member-tip';
		tip.textContent = t('ui.start_private_chat', 'Click any member below to toggle 1-on-1 private chat');
		userListEl.appendChild(tip);
	}

	if (me && me.userName) {
		userListEl.appendChild(createUserItem(me, true));
	}
	others.forEach(u => userListEl.appendChild(createUserItem(u, false)));

	if (updateHeader) {
		renderMainHeader();
	}
}

export function createUserItem(user, isMe) {
	const div = document.createElement('div');
	const rd = roomsData[activeRoomIndex];
	const isPrivateTarget = !isMe && rd && user.clientId === rd.privateChatTargetId;
	const peerMode = !isMe && rd && rd.chat && typeof rd.chat.getPeerP2PMode === 'function' ? rd.chat.getPeerP2PMode(user.clientId) : null;
	const isP2P = Boolean(peerMode);

	div.className = 'member' + (isMe ? ' me' : '') + (isPrivateTarget ? ' private-chat-active' : '');
	const rawName = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
	const safeUserName = escapeHTML(rawName);

	const p2pBadgeText = peerMode === 'lan' ? '⚡ 局域网直连' : '⚡ P2P';
	const badgesHtml = isMe
		? ''
		: `${isPrivateTarget ? `<span class="member-private-pill">🔒 ${t('ui.private_badge', 'Private')}</span>` : (isP2P ? `<span class="member-p2p-pill">${p2pBadgeText}</span>` : '')}`;

	const subText = isMe
		? `🔒 ${t('status.connected', 'E2EE Secured')}`
		: (peerMode === 'lan' ? '⚡ 热点/局域网高速直传' : (isP2P ? '⚡ WebRTC P2P 直连' : '🛡️ Cloudflare E2EE 中继'));

	div.innerHTML = `
		<span class="avatar"></span>
		<div class="member-info">
			<div class="member-name-row">
				<div class="member-name">${safeUserName}${isMe ? t('ui.me', ' (me)') : ''}</div>
				${badgesHtml}
			</div>
			<div class="member-sub">${subText}</div>
		</div>
	`;

	const avatarEl = div.querySelector('.avatar');
	if (avatarEl) {
		const svg = createAvatarSVG(rawName);
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		avatarEl.innerHTML = cleanSvg;
	}

	if (!isMe) {
		div.onclick = () => togglePrivateChat(user.clientId, safeUserName);
	}
	return div;
}

export function setupMoreBtnMenu() {
	const btn = $id('more-btn');
	const menu = $id('more-menu');
	if (!btn || !menu) return;

	function openMenu() {
		menu.style.display = 'block';
		menu.classList.remove('close');
		menu.offsetHeight;
		menu.classList.add('open');
	}

	function closeMenu() {
		menu.classList.remove('open');
		menu.classList.add('close');
		setTimeout(() => {
			if (menu.classList.contains('close')) menu.style.display = 'none';
		}, 200);
	}

	btn.onclick = function(e) {
		e.stopPropagation();
		if (menu.classList.contains('open')) {
			closeMenu();
		} else {
			openMenu();
		}
	};

	menu.onclick = function(e) {
		const item = e.target.closest('.more-menu-item');
		if (item) {
			const action = item.dataset.action;
			executeMenuAction(action, closeMenu);
		}
	};

	if (!window._moreMenuDocBound) {
		window._moreMenuDocBound = true;
		document.addEventListener('click', function(ev) {
			const currentMenu = $id('more-menu');
			const currentBtn = $id('more-btn');
			if (currentMenu && currentMenu.classList.contains('open')) {
				if (!currentMenu.contains(ev.target) && (!currentBtn || !currentBtn.contains(ev.target))) {
					currentMenu.classList.remove('open');
					currentMenu.classList.add('close');
					setTimeout(() => {
						if (currentMenu.classList.contains('close')) currentMenu.style.display = 'none';
					}, 200);
				}
			}
		});
	}
}

export function preventSpaceInput(input) {
	if (!input || input.dataset.spacePreventBound === '1') return;
	input.dataset.spacePreventBound = '1';
	let composing = false;
	const sanitize = () => {
		input.value = input.value.replace(/[\s\p{P}\p{S}]/gu, function(match) {
			return (match === "'" || match === '-' || match === '_') ? match : '';
		});
	};
	input.addEventListener('compositionstart', function() {
		composing = true;
	});
	input.addEventListener('compositionend', function() {
		composing = false;
		sanitize();
	});
	input.addEventListener('keydown', function(e) {
		if (composing || e.isComposing || e.keyCode === 229) return;
		if (e.key === ' ') {
			e.preventDefault();
		}
	});
	input.addEventListener('input', function(e) {
		if (composing || e.isComposing) return;
		sanitize();
	});
}

function randomNickname() {
	const prefixes = ['Nova', 'Cipher', 'Aegis', 'Pulse', 'Orbit', 'Apex', 'Echo', 'Zero', 'Vortex', 'Lynx'];
	const pick = prefixes[Math.floor(Math.random() * prefixes.length)];
	return `${pick}${Math.floor(Math.random() * 900) + 100}`;
}

function isApkMode() {
	return Boolean(window.__SPRINTMATE_APK__ && window.__SPRINTMATE_APK__.enabled);
}

function getApkBuiltInPassword() {
	return (window.__SPRINTMATE_APK__ && window.__SPRINTMATE_APK__.createPassword) || '';
}

function getDisplayServerUrl() {
	const ws = (window.config && window.config.wsAddress) || '';
	return ws.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function randomRoomCode() {
	const words = ['orbit', 'pulse', 'nova', 'aegis', 'swift', 'drift', 'spark', 'prism'];
	const w = words[Math.floor(Math.random() * words.length)];
	return `${w}${Math.floor(Math.random() * 900) + 100}`;
}

let activeEntryModal = null;
let activeEntryMode = 'join';

export function loginFormHandler(modal, mode = 'join') {
	return function(e) {
		e.preventDefault();
		const idSuffix = modal ? '-modal' : '';
		const userInput = document.getElementById('userName' + idSuffix);
		const roomInput = document.getElementById('roomName' + idSuffix);
		const pwdInput = document.getElementById('password' + idSuffix);
		const serverInput = document.getElementById('serverUrl' + idSuffix);
		const btn = modal ? modal.querySelector('.login-btn') : document.querySelector('#login-form .login-btn');

		if (!userInput || !roomInput) return;

		if (isApkMode() && serverInput && serverInput.value.trim()) {
			const serverGroup = serverInput.closest('.input-group');
			if (serverGroup) {
				const oldTip = serverGroup.querySelector('.field-error-tip');
				if (oldTip) oldTip.remove();
			}
			const okUrl = window.setSprintMateServerUrl ? window.setSprintMateServerUrl(serverInput.value.trim()) : '';
			if (!okUrl) {
				if (serverGroup) {
					const errTip = document.createElement('div');
					errTip.className = 'field-error-tip';
					errTip.textContent = '请输入有效的服务器地址（如 https://xxx.workers.dev）';
					serverGroup.appendChild(errTip);
				}
				serverInput.focus();
				return;
			}
			updateApkTopbarServerLabel();
		}

		let userName = userInput.value.trim();
		let roomName = roomInput.value.trim();
		const apkTryBuiltIn = isApkMode() && mode === 'try';
		const password = apkTryBuiltIn
			? getApkBuiltInPassword()
			: ((mode === 'try' && pwdInput) ? pwdInput.value.trim() : '');

		if (!userName) {
			userName = randomNickname();
			userInput.value = userName;
		}
		if (apkTryBuiltIn && !roomName) {
			roomName = randomRoomCode();
			roomInput.value = roomName;
		}

		const roomGroup = roomInput.closest('.input-group');
		const pwdGroup = pwdInput ? pwdInput.closest('.input-group') : null;
		if (roomGroup) {
			const oldTip = roomGroup.querySelector('.field-error-tip');
			if (oldTip) oldTip.remove();
		}
		if (pwdGroup) {
			const oldPwdTip = pwdGroup.querySelector('.field-error-tip');
			if (oldPwdTip) oldPwdTip.remove();
		}

		if (!roomName) {
			roomInput.focus();
			return;
		}

		if (mode === 'try' && !apkTryBuiltIn && !password) {
			if (pwdGroup) {
				const errTip = document.createElement('div');
				errTip.className = 'field-error-tip';
				errTip.textContent = t('ui.err_pwd_required', '请输入创建房间密码');
				pwdGroup.appendChild(errTip);
			}
			if (pwdInput) pwdInput.focus();
			return;
		}

		const exists = roomsData.some(rd => rd.roomName && rd.roomName.toLowerCase() === roomName.toLowerCase());
		if (exists) {
			if (roomGroup) {
				const warnTip = document.createElement('div');
				warnTip.className = 'field-error-tip';
				warnTip.textContent = t('ui.node_exists', 'You are already in this room');
				roomGroup.appendChild(warnTip);
				roomInput.focus();
			}
			return;
		}

		const submitLabel = apkTryBuiltIn
			? '随机创建并进入'
			: (mode === 'try' ? t('ui.try_submit', '创建并进入') : t('ui.join_submit', '进入加密房间'));

		if (btn) {
			btn.disabled = true;
			btn.innerText = t('ui.connecting', 'Establishing E2EE...');
		}

		window.joinRoom(userName, roomName, password, modal, function(success, errCode) {
			if (success && cachedShareParams && cachedShareParams.roomName === roomName) {
				cachedShareParams = null;
			}
			if (success && modal === activeEntryModal) {
				activeEntryModal = null;
			}
			if (!success) {
				if (btn) {
					btn.disabled = false;
					btn.innerText = submitLabel;
				}
				if (errCode === 'ROOM_NOT_EXIST_NEED_PWD') {
					const targetGroup = mode === 'try' && pwdGroup ? pwdGroup : roomGroup;
					if (targetGroup) {
						const oldTip = targetGroup.querySelector('.field-error-tip');
						if (oldTip) oldTip.remove();
						const errTip = document.createElement('div');
						errTip.className = 'field-error-tip';
						errTip.innerHTML = `<span>${escapeHTML(t('ui.err_room_not_exist_need_pwd', '该房间尚未创建，请切换到 Try 并输入创建密码创建'))}</span>`;
						if (mode === 'join' && modal) {
							const jumpBtn = document.createElement('button');
							jumpBtn.type = 'button';
							jumpBtn.className = 'field-inline-switch-btn';
							jumpBtn.textContent = '切换到 Try';
							jumpBtn.onclick = () => {
								renderRoomEntryModalContent(modal, 'try', { userName, roomName });
							};
							errTip.appendChild(jumpBtn);
						}
						targetGroup.appendChild(errTip);
					}
					if (mode === 'try' && pwdInput) {
						pwdInput.readOnly = false;
						pwdInput.focus();
					} else {
						roomInput.focus();
					}
				} else if (errCode === 'INVALID_CREATE_PASSWORD') {
					const targetGroup = pwdGroup || roomGroup;
					if (targetGroup) {
						const oldPwdTip = targetGroup.querySelector('.field-error-tip');
						if (oldPwdTip) oldPwdTip.remove();
						const errTip = document.createElement('div');
						errTip.className = 'field-error-tip';
						errTip.textContent = t('ui.err_invalid_create_pwd', '创建房间密码错误，无权创建新房间');
						targetGroup.appendChild(errTip);
					}
					if (pwdInput) {
						pwdInput.readOnly = false;
						pwdInput.focus();
					}
				} else if (isApkMode() && roomGroup) {
					const oldTip = roomGroup.querySelector('.field-error-tip');
					if (oldTip) oldTip.remove();
					const errTip = document.createElement('div');
					errTip.className = 'field-error-tip';
					errTip.textContent = '连接节点失败，请检查下方节点地址或网络是否畅通';
					roomGroup.appendChild(errTip);
				}
			}
		});
	};
}

export function generateLoginForm(isModal = true, mode = 'join') {
	const idSuffix = isModal ? '-modal' : '';
	const isTry = mode === 'try';
	const apk = isApkMode();
	const apkTry = apk && isTry;
	const submitText = apkTry
		? '🎲 随机创建并进入'
		: (isTry ? t('ui.try_submit', '创建并进入') : t('ui.join_submit', '进入加密房间'));

	return `
		<div class="shared-room-banner" id="shared-room-banner${idSuffix}" style="display:none;">
			<span>🔒 ${t('ui.shared_room_locked', 'Room autofilled from invite link')}</span>
			<button type="button" class="shared-unlock-btn" id="shared-unlock-btn${idSuffix}">${t('ui.unlock_room', 'Edit')}</button>
		</div>

		${apkTry ? `
		<div class="ag-apk-pwd-badge">
			<span>🔑 APK 已内置建房密码 · 已自动生成随机房间号</span>
		</div>` : ''}

		<div class="input-group">
			<div class="field-label-row">
				<label for="userName${idSuffix}" class="field-label">${t('ui.username', 'Username')}</label>
			</div>
			<div class="field-input-wrap">
				<input id="userName${idSuffix}" type="text" autocomplete="username" required minlength="1" maxlength="15" placeholder="${t('ui.username_placeholder', 'Enter your display nickname')}">
				<button type="button" class="field-action-btn" id="random-name-btn${idSuffix}" title="${t('ui.random_name', 'Randomize nickname')}">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
						<circle cx="8.5" cy="8.5" r="1.5"/>
						<circle cx="15.5" cy="8.5" r="1.5"/>
						<circle cx="15.5" cy="15.5" r="1.5"/>
						<circle cx="8.5" cy="15.5" r="1.5"/>
					</svg>
				</button>
			</div>
		</div>

		<div class="input-group">
			<div class="field-label-row">
				<label for="roomName${idSuffix}" class="field-label">${t('ui.node_name', 'Room Code')}</label>
			</div>
			<div class="field-input-wrap" id="roomName-wrap${idSuffix}">
				<input id="roomName${idSuffix}" type="text" autocomplete="off" required minlength="1" maxlength="15" placeholder="${t('ui.node_name_placeholder', 'e.g. sprint2026')}">
				${isTry ? `
				<button type="button" class="field-action-btn" id="random-room-btn${idSuffix}" title="随机生成房间代号">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="16 3 21 3 21 8"/>
						<line x1="4" y1="20" x2="21" y2="3"/>
						<polyline points="21 16 21 21 16 21"/>
						<line x1="15" y1="15" x2="21" y2="21"/>
						<line x1="4" y1="4" x2="9" y2="9"/>
					</svg>
				</button>` : ''}
			</div>
		</div>

		${(isTry && !apk) ? `
		<div class="input-group">
			<div class="field-label-row">
				<label for="password${idSuffix}" class="field-label">${t('ui.node_password', 'Creation Password')}<span class="optional">${t('ui.optional', '(required)')}</span></label>
			</div>
			<div class="field-input-wrap" id="password-wrap${idSuffix}">
				<input id="password${idSuffix}" type="password" autocomplete="off" required minlength="1" maxlength="15" placeholder="${t('ui.node_password_placeholder', 'Enter room creation password')}">
				<button type="button" class="field-action-btn" id="toggle-pwd-btn${idSuffix}" title="Toggle Password Visibility">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
						<circle cx="12" cy="12" r="3"/>
					</svg>
				</button>
			</div>
		</div>` : ''}

		${apk ? `
		<div class="input-group ag-apk-server-group">
			<div class="field-label-row">
				<label for="serverUrl${idSuffix}" class="field-label">Workers 节点地址</label>
			</div>
			<div class="field-input-wrap">
				<input id="serverUrl${idSuffix}" type="url" autocomplete="off" value="${escapeHTML(getDisplayServerUrl())}" placeholder="https://your-app.workers.dev">
			</div>
		</div>` : ''}

		<button type="submit" class="login-btn ag-modal-submit">${submitText}</button>
	`;
}

function bindFormEnhancements(isModal = true, prefill = {}, mode = 'join') {
	const idSuffix = isModal ? '-modal' : '';
	const userInput = document.getElementById('userName' + idSuffix);
	const roomInput = document.getElementById('roomName' + idSuffix);
	const pwdInput = document.getElementById('password' + idSuffix);
	const randomBtn = document.getElementById('random-name-btn' + idSuffix);
	const randomRoomBtn = document.getElementById('random-room-btn' + idSuffix);
	const togglePwdBtn = document.getElementById('toggle-pwd-btn' + idSuffix);

	preventSpaceInput(userInput);
	preventSpaceInput(roomInput);
	if (pwdInput) preventSpaceInput(pwdInput);

	if (userInput) {
		if (prefill.userName) {
			userInput.value = prefill.userName;
		} else if (!userInput.value && activeRoomIndex >= 0 && roomsData[activeRoomIndex] && roomsData[activeRoomIndex].myUserName) {
			userInput.value = roomsData[activeRoomIndex].myUserName;
		} else if (isApkMode() && mode === 'try' && !userInput.value) {
			userInput.value = randomNickname();
		}
	}
	if (roomInput) {
		if (prefill.roomName) {
			roomInput.value = prefill.roomName;
		} else if (isApkMode() && mode === 'try' && !roomInput.value) {
			roomInput.value = randomRoomCode();
		}
	}

	if (randomBtn && userInput) {
		randomBtn.onclick = () => {
			userInput.value = randomNickname();
			userInput.focus();
		};
	}

	if (randomRoomBtn && roomInput) {
		randomRoomBtn.onclick = () => {
			roomInput.readOnly = false;
			roomInput.value = randomRoomCode();
			roomInput.focus();
		};
	}

	if (togglePwdBtn && pwdInput) {
		togglePwdBtn.onclick = () => {
			pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
		};
	}

	autofillRoomPwd(idSuffix);
}

function renderRoomEntryModalContent(modal, mode = 'join', prefill = {}) {
	activeEntryMode = mode === 'try' ? 'try' : 'join';
	const isTry = activeEntryMode === 'try';
	const apkTry = isApkMode() && isTry;
	const titleText = apkTry
		? '一键随机创建房间'
		: (isTry ? t('ui.try_title', '创建加密房间') : t('ui.join_title', '加入已有房间'));
	const subtitleText = apkTry
		? '已内置创建密码并生成随机代号，点击即可建房，好友用 Join 免密加入'
		: (isTry
			? t('ui.try_subtitle', '创建新房间需输入创建密码，建好后他人可免密 Join 加入')
			: t('ui.join_subtitle', '输入已有房间代号即可免密码直接加入'));
	const switchHint = isTry
		? t('ui.switch_to_join', '已有房间号？直接 Join 免密加入 →')
		: t('ui.switch_to_try', '房间尚未创建？切换到 Try 创建 →');

	const card = modal.querySelector('.login-modal-card');
	if (!card) return;
	card.innerHTML = `
		<button class="login-modal-close" type="button" aria-label="Close">&times;</button>
		<div class="ag-mode-tabs" role="tablist">
			<button type="button" class="ag-mode-tab ${isTry ? 'active' : ''}" data-mode="try" role="tab" aria-selected="${isTry}">${t('ui.tab_try', 'Try · 创建房间')}</button>
			<button type="button" class="ag-mode-tab ${!isTry ? 'active' : ''}" data-mode="join" role="tab" aria-selected="${!isTry}">${t('ui.tab_join', 'Join · 加入房间')}</button>
		</div>
		<div class="ag-modal-heading">
			<h1 id="entry-modal-title">${titleText}</h1>
			<p class="ag-modal-subtitle">${subtitleText}</p>
		</div>
		<form id="login-form-modal" novalidate>${generateLoginForm(true, activeEntryMode)}</form>
		<div class="ag-modal-footer-switch">
			<button type="button" class="ag-text-switch-btn" id="entry-mode-switch-btn">${switchHint}</button>
		</div>
	`;

	const closeModal = () => {
		if (activeEntryModal === modal) activeEntryModal = null;
		modal.remove();
	};
	const closeBtn = card.querySelector('.login-modal-close');
	if (closeBtn) closeBtn.onclick = closeModal;

	card.querySelectorAll('.ag-mode-tab').forEach(tab => {
		tab.onclick = () => {
			const nextMode = tab.dataset.mode;
			if (!nextMode || nextMode === activeEntryMode) return;
			const curUser = (document.getElementById('userName-modal') || {}).value || '';
			const curRoom = (document.getElementById('roomName-modal') || {}).value || '';
			renderRoomEntryModalContent(modal, nextMode, { userName: curUser, roomName: curRoom });
		};
	});

	const switchBtn = card.querySelector('#entry-mode-switch-btn');
	if (switchBtn) {
		switchBtn.onclick = () => {
			const nextMode = isTry ? 'join' : 'try';
			const curUser = (document.getElementById('userName-modal') || {}).value || '';
			const curRoom = (document.getElementById('roomName-modal') || {}).value || '';
			renderRoomEntryModalContent(modal, nextMode, { userName: curUser, roomName: curRoom });
		};
	}

	bindFormEnhancements(true, prefill, activeEntryMode);
	const form = card.querySelector('#login-form-modal');
	if (form) {
		form.addEventListener('submit', loginFormHandler(modal, activeEntryMode));
	}

	// Smart initial focus (skip forced focus on APK Try so soft keyboard doesn't pop over the ready-to-tap random room!)
	if (!apkTry) {
		const userEl = document.getElementById('userName-modal');
		const roomEl = document.getElementById('roomName-modal');
		const pwdEl = document.getElementById('password-modal');
		setTimeout(() => {
			if (isTry && prefill.roomName && pwdEl) pwdEl.focus();
			else if (userEl && !userEl.value) userEl.focus();
			else if (roomEl && !roomEl.readOnly && !roomEl.value) roomEl.focus();
			else if (pwdEl) pwdEl.focus();
		}, 40);
	}
}

export function openRoomEntryModal(mode = 'join', prefill = {}) {
	if (activeEntryModal && activeEntryModal.parentNode) {
		renderRoomEntryModalContent(activeEntryModal, mode, prefill);
		return activeEntryModal;
	}
	const modal = document.createElement('div');
	modal.className = 'login-modal ag-entry-modal';
	modal.innerHTML = `
		<div class="login-modal-bg"></div>
		<div class="login-modal-card"></div>
	`;
	document.body.appendChild(modal);
	activeEntryModal = modal;

	const closeModal = () => {
		if (activeEntryModal === modal) activeEntryModal = null;
		modal.remove();
	};
	modal.querySelector('.login-modal-bg').onclick = closeModal;

	const onEsc = (ev) => {
		if (ev.key === 'Escape' && document.body.contains(modal)) {
			closeModal();
			document.removeEventListener('keydown', onEsc);
		}
	};
	document.addEventListener('keydown', onEsc);

	renderRoomEntryModalContent(modal, mode, prefill);
	return modal;
}

export function openLoginModal(mode = 'join') {
	const resolvedMode = typeof mode === 'string' ? mode : 'join';
	return openRoomEntryModal(resolvedMode);
}

export function setupTabs() {
	const tabsEl = document.getElementById('member-tabs');
	if (!tabsEl) return;
	const tabs = tabsEl.children;
	for (let i = 0; i < tabs.length; i++) {
		tabs[i].onclick = function() {
			for (let j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
			this.classList.add('active');
		};
	}
}

// Autofill room and password from share link
export function autofillRoomPwd(idSuffix = '') {
	const share = captureShareParamsFromUrl();
	if (!share || !share.roomName) return;

	const roomInput = document.getElementById('roomName' + idSuffix);
	const pwdInput = document.getElementById('password' + idSuffix);
	const roomWrap = document.getElementById('roomName-wrap' + idSuffix);
	const pwdWrap = document.getElementById('password-wrap' + idSuffix);
	const banner = document.getElementById('shared-room-banner' + idSuffix);
	const unlockBtn = document.getElementById('shared-unlock-btn' + idSuffix);

	if (share.isPlaintext && window.addSystemMsg && !share._warned) {
		share._warned = true;
		window.addSystemMsg(t('system.security_warning', '⚠️ This link uses an old format. Room data is not encrypted.'), true);
	}

	if (roomInput) {
		roomInput.value = share.roomName;
		roomInput.readOnly = Boolean(share.locked);
		if (roomWrap) roomWrap.classList.toggle('is-locked', Boolean(share.locked));
	}

	if (pwdInput) {
		pwdInput.value = share.password || '';
		pwdInput.readOnly = false;
		if (pwdWrap) pwdWrap.classList.remove('is-locked');
	}

	if (banner) {
		banner.style.display = share.locked ? 'flex' : 'none';
	}

	if (unlockBtn) {
		unlockBtn.onclick = () => {
			share.locked = false;
			if (roomInput) roomInput.readOnly = false;
			if (pwdInput) {
				pwdInput.readOnly = false;
				pwdInput.placeholder = t('ui.node_password_placeholder', 'Enter room creation password');
			}
			if (roomWrap) roomWrap.classList.remove('is-locked');
			if (pwdWrap) pwdWrap.classList.remove('is-locked');
			if (banner) banner.style.display = 'none';
			if (roomInput) roomInput.focus();
		};
	}
}

// ==================== Antigravity Interactive Radial Rainbow Particle Field ====================
let particleRafId = null;

export function stopHeroParticles() {
	if (particleRafId) {
		cancelAnimationFrame(particleRafId);
		particleRafId = null;
	}
}
window.stopHeroParticles = stopHeroParticles;

export function initHeroParticles() {
	const canvas = $id('antigravity-particles');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	stopHeroParticles();

	let width = window.innerWidth;
	let height = window.innerHeight;
	let dpr = Math.min(window.devicePixelRatio || 1, 2);

	const pointer = { x: width * 0.44, y: height * 0.50, active: false };
	const haloCenter = { x: width * 0.44, y: height * 0.50 };

	// Angular rainbow spectrum matching https://antigravity.google/
	function colorForAngle(angle) {
		// Normalize [0, 2PI): 0 = right, PI/2 = bottom, PI = left, 3PI/2 = top
		let a = angle % (Math.PI * 2);
		if (a < 0) a += Math.PI * 2;
		const deg = (a * 180) / Math.PI;
		if (deg < 55 || deg >= 305) {
			// Vibrant right-arc cobalt & royal blues
			const blues = ['#2563eb', '#3279f9', '#1d4ed8', '#3b82f6', '#4f46e5'];
			return blues[Math.floor((deg * 7) % blues.length)];
		}
		if (deg >= 55 && deg < 115) {
			// Lower-right blue -> indigo -> rose transition
			const mix = ['#3279f9', '#6366f1', '#ec4899', '#e11d48'];
			return mix[Math.floor(((deg - 55) / 60) * mix.length) % mix.length];
		}
		if (deg >= 115 && deg < 185) {
			// Bottom-left crimson, rose & violet
			const warmViolet = ['#e11d48', '#db2777', '#9333ea', '#7c3aed', '#be185d'];
			return warmViolet[Math.floor((deg * 5) % warmViolet.length)];
		}
		if (deg >= 185 && deg < 245) {
			// Upper-left violet -> magenta -> warm coral
			const plumCoral = ['#7c3aed', '#a855f7', '#e11d48', '#f97316', '#f43f5e'];
			return plumCoral[Math.floor((deg * 5) % plumCoral.length)];
		}
		// Top arc: warm amber, coral, gold -> soft blue transition
		const amberGold = ['#f97316', '#f59e0b', '#eab308', '#ef4444', '#6366f1'];
		return amberGold[Math.floor((deg * 3) % amberGold.length)];
	}

	let ringParticles = [];
	let dustParticles = [];

	function seedParticles() {
		const minDim = Math.min(width, height);
		const baseR = Math.max(210, minDim * 0.44);
		const count = width < 768 ? 170 : 290;
		ringParticles = [];

		for (let i = 0; i < count; i++) {
			const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
			// Distribute in a sweeping annular band leaving a clean quiet central void
			const band = Math.pow(Math.random(), 0.72);
			const radiusFactor = 0.62 + band * 0.88;
			ringParticles.push({
				angle,
				baseRadius: baseR * radiusFactor,
				stretchX: width > height ? 1.18 : 1.0,
				stretchY: width > height ? 0.96 : 1.08,
				len: 3.2 + Math.random() * 4.4,
				thick: 1.5 + Math.random() * 1.15,
				phase: Math.random() * Math.PI * 2,
				speed: 0.45 + Math.random() * 0.75,
				drift: (Math.random() - 0.5) * 0.00055,
				color: colorForAngle(angle),
				alpha: 0.42 + (1 - Math.abs(band - 0.45)) * 0.52,
				isDot: Math.random() < 0.24
			});
		}

		const dustCount = width < 768 ? 65 : 130;
		dustParticles = [];
		for (let i = 0; i < dustCount; i++) {
			dustParticles.push({
				x: Math.random() * width,
				y: Math.random() * height,
				r: 0.8 + Math.random() * 1.15,
				alpha: 0.12 + Math.random() * 0.22,
				vx: (Math.random() - 0.5) * 0.12,
				vy: (Math.random() - 0.5) * 0.12
			});
		}
	}

	function resize() {
		width = window.innerWidth;
		height = window.innerHeight;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (!pointer.active) {
			pointer.x = width * 0.44;
			pointer.y = height * 0.50;
		}
		seedParticles();
	}

	const onPointerMove = (e) => {
		pointer.active = true;
		// Subtle gentle attraction around the hero center
		pointer.x = width * 0.46 + (e.clientX - width * 0.5) * 0.18;
		pointer.y = height * 0.50 + (e.clientY - height * 0.5) * 0.16;
	};
	const onPointerLeave = () => {
		pointer.active = false;
		pointer.x = width * 0.44;
		pointer.y = height * 0.50;
	};

	if (!canvas.dataset.eventsBound) {
		canvas.dataset.eventsBound = '1';
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', onPointerMove, { passive: true });
		window.addEventListener('mouseleave', onPointerLeave, { passive: true });
		window.addEventListener('touchmove', (e) => {
			if (e.touches && e.touches[0]) {
				onPointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
			}
		}, { passive: true });
		window.addEventListener('touchend', onPointerLeave, { passive: true });
	}

	resize();

	const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const startTime = performance.now();

	function draw(now) {
		const loginContainer = $id('login-container');
		if (!loginContainer || loginContainer.style.display === 'none') {
			particleRafId = null;
			return;
		}

		const tSec = (now - startTime) * 0.001;
		haloCenter.x += (pointer.x - haloCenter.x) * 0.05;
		haloCenter.y += (pointer.y - haloCenter.y) * 0.05;

		ctx.clearRect(0, 0, width, height);

		const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
		const dustFill = isDark ? '186, 200, 232' : '110, 120, 140';

		// Peripheral ambient specks
		for (let i = 0; i < dustParticles.length; i++) {
			const d = dustParticles[i];
			if (!prefersReduced) {
				d.x += d.vx;
				d.y += d.vy;
				if (d.x < 0) d.x = width;
				if (d.x > width) d.x = 0;
				if (d.y < 0) d.y = height;
				if (d.y > height) d.y = 0;
			}
			ctx.fillStyle = `rgba(${dustFill}, ${d.alpha})`;
			ctx.beginPath();
			ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
			ctx.fill();
		}

		// Sweeping radial rainbow dash halo
		ctx.lineCap = 'round';
		for (let i = 0; i < ringParticles.length; i++) {
			const p = ringParticles[i];
			if (!prefersReduced) {
				p.angle += p.drift;
			}
			const pulse = prefersReduced ? 0 : Math.sin(tSec * p.speed + p.phase) * 12;
			const r = p.baseRadius + pulse;
			const px = haloCenter.x + Math.cos(p.angle) * r * p.stretchX;
			const py = haloCenter.y + Math.sin(p.angle) * r * p.stretchY;

			// Soft fade if too close to viewport center headline void
			const dxCenter = (px - width * 0.5) / Math.max(240, width * 0.25);
			const dyCenter = (py - height * 0.5) / Math.max(130, height * 0.22);
			const voidDist = Math.hypot(dxCenter, dyCenter);
			if (voidDist < 0.78) continue;

			const voidFade = Math.min(1, (voidDist - 0.78) / 0.35);
			ctx.globalAlpha = p.alpha * voidFade * (isDark ? 0.88 : 0.92);

			if (p.isDot) {
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(px, py, p.thick * 0.72, 0, Math.PI * 2);
				ctx.fill();
			} else {
				const tangentAngle = p.angle + 0.14 * Math.sin(tSec * 0.8 + p.phase);
				const half = p.len * 0.5;
				const cx = Math.cos(tangentAngle) * half;
				const cy = Math.sin(tangentAngle) * half;
				ctx.strokeStyle = p.color;
				ctx.lineWidth = p.thick;
				ctx.beginPath();
				ctx.moveTo(px - cx, py - cy);
				ctx.lineTo(px + cx, py + cy);
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;

		if (!prefersReduced) {
			particleRafId = requestAnimationFrame(draw);
		}
	}

	particleRafId = requestAnimationFrame(draw);
}

function updateApkTopbarServerLabel() {
	const btn = $id('apk-server-pill');
	if (!btn) return;
	const display = getDisplayServerUrl().replace(/^https?:\/\//i, '');
	btn.textContent = `🌐 ${display || '配置节点'}`;
}

function initApkTopbarServerPill() {
	if (!isApkMode()) return;
	const topbar = document.querySelector('.ag-topbar');
	if (!topbar || $id('apk-server-pill')) return;
	topbar.style.justifyContent = 'space-between';
	const pill = document.createElement('button');
	pill.type = 'button';
	pill.id = 'apk-server-pill';
	pill.className = 'ag-nav-pill ag-server-pill';
	pill.title = '配置 Cloudflare Workers 节点地址';
	pill.onclick = () => {
		const cur = getDisplayServerUrl();
		const next = window.prompt('输入 Cloudflare Workers 或局域网服务地址（如 https://sprintmate.xxx.workers.dev 或 http://192.168.10.8:8787）：', cur);
		if (next && next.trim() && window.setSprintMateServerUrl) {
			const ok = window.setSprintMateServerUrl(next.trim());
			if (ok) updateApkTopbarServerLabel();
		}
	};
	topbar.insertBefore(pill, topbar.firstChild);
	updateApkTopbarServerLabel();
}

export function initLoginForm() {
	const share = captureShareParamsFromUrl();

	const tryBtn = $id('hero-try-btn');
	const joinBtn = $id('hero-join-btn');

	if (tryBtn && tryBtn.dataset.bound !== '1') {
		tryBtn.dataset.bound = '1';
		tryBtn.addEventListener('click', () => openRoomEntryModal('try'));
	}
	if (joinBtn && joinBtn.dataset.bound !== '1') {
		joinBtn.dataset.bound = '1';
		joinBtn.addEventListener('click', () => openRoomEntryModal('join'));
	}

	initLoginTopbarActions();
	initApkTopbarServerPill();
	initHeroParticles();
	document.body.classList.add('login-page');

	// If user arrived via a shared invite link, open Join modal automatically
	if (share && share.roomName) {
		openRoomEntryModal('join');
	}
}

// Android hardware/gesture back button bridge
window.handleAndroidBackPress = function() {
	if (activeEntryModal && document.body.contains(activeEntryModal)) {
		activeEntryModal.remove();
		activeEntryModal = null;
		return true;
	}
	const helpModal = $id('help-modal');
	if (helpModal && helpModal.style.display !== 'none') {
		helpModal.style.display = 'none';
		return true;
	}
	const imgModal = document.querySelector('.img-modal-bg');
	if (imgModal) {
		imgModal.remove();
		return true;
	}
	const uploadClose = document.querySelector('.file-upload-modal .file-upload-close');
	if (uploadClose) {
		uploadClose.click();
		return true;
	}
	const settingsSidebar = $id('settings-sidebar');
	if (settingsSidebar && (settingsSidebar.classList.contains('mobile-open') || settingsSidebar.classList.contains('open'))) {
		closeSettingsPanel();
		return true;
	}
	const sidebar = $id('sidebar');
	const rightbar = $id('rightbar');
	const lMask = $id('mobile-sidebar-mask');
	const rMask = $id('mobile-rightbar-mask');
	if (sidebar && sidebar.classList.contains('mobile-open')) {
		sidebar.classList.remove('mobile-open');
		if (lMask) lMask.classList.remove('active');
		return true;
	}
	if (rightbar && rightbar.classList.contains('mobile-open')) {
		rightbar.classList.remove('mobile-open');
		if (rMask) rMask.classList.remove('active');
		return true;
	}
	return false;
};

function initLoginTopbarActions() {
	const langBtn = $id('login-lang-toggle');
	const themeBtn = $id('login-theme-toggle');

	if (langBtn && langBtn.dataset.bound !== '1') {
		langBtn.dataset.bound = '1';
		langBtn.addEventListener('click', () => {
			const nextLang = getCurrentLanguage() === 'zh' ? 'en' : 'zh';
			setLanguage(nextLang);
			try {
				const s = JSON.parse(localStorage.getItem('settings') || '{}');
				s.language = nextLang;
				localStorage.setItem('settings', JSON.stringify(s));
			} catch (_) {}
		});
	}

	if (themeBtn && themeBtn.dataset.bound !== '1') {
		themeBtn.dataset.bound = '1';
		themeBtn.addEventListener('click', () => {
			const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
			const next = current === 'dark' ? 'light' : 'dark';
			applyThemeMode(next);
			try {
				const s = JSON.parse(localStorage.getItem('settings') || '{}');
				s.themeMode = next;
				localStorage.setItem('settings', JSON.stringify(s));
			} catch (_) {}
		});
	}
}

// Keep export for backward compatibility with main.js
export function initLoginAccentWheel() {
	initLoginTopbarActions();
}

window.addEventListener('languageChange', () => {
	renderMainHeader();
	renderUserList(false);
	updateChatInputStyle();
	if (activeEntryModal && document.body.contains(activeEntryModal)) {
		const curUser = (document.getElementById('userName-modal') || {}).value || '';
		const curRoom = (document.getElementById('roomName-modal') || {}).value || '';
		renderRoomEntryModalContent(activeEntryModal, activeEntryMode, { userName: curUser, roomName: curRoom });
	}
});

export function initFlipCard() {
	const helpModal = $id('help-modal');
	const helpBg = $id('help-modal-bg');
	const helpBtn = $id('help-btn');
	const backBtn = $id('back-btn');

	if (!helpModal || !helpBtn) return;

	const openHelp = () => {
		helpModal.style.display = 'flex';
	};
	const closeHelp = () => {
		helpModal.style.display = 'none';
	};

	if (helpBtn.dataset.bound !== '1') {
		helpBtn.dataset.bound = '1';
		helpBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			openHelp();
		});
	}
	if (backBtn && backBtn.dataset.bound !== '1') {
		backBtn.dataset.bound = '1';
		backBtn.addEventListener('click', closeHelp);
	}
	if (helpBg && helpBg.dataset.bound !== '1') {
		helpBg.dataset.bound = '1';
		helpBg.addEventListener('click', closeHelp);
	}
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && helpModal.style.display !== 'none') {
			closeHelp();
		}
	});
}

window.addEventListener('connectionStatusChange', (event) => {
	const status = event && event.detail && typeof event.detail.status === 'string' ? event.detail.status : '';
	setConnectionStatusBadge(status);
});
