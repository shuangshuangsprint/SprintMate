// SprintMate Main Entry Point — Binary P2P, Voice Messages, Newline-Preserving Text Input
// SprintMate 客户端主入口模块

import './SprintMate.js';
import {
	setupFileSend,
	handleFileMessage,
	handleBinaryFileChunk,
	downloadFile,
	cancelFileTransfer
} from './util.file.js';
import {
	setupImagePaste,
	setupEmojiPicker,
	initTheme,
	$,
	$id,
	removeClass
} from './utils.js';
import {
	openSettingsPanel,
	closeSettingsPanel,
	initSettings,
	notifyMessage
} from './util.settings.js';
import { t, updateStaticTexts } from './util.i18n.js';
import {
	roomsData,
	activeRoomIndex,
	joinRoom,
	exitRoom,
	updateCurrentUserName
} from './room.js';
import {
	addMsg,
	addOtherMsg,
	addSystemMsg,
	setupImagePreview,
	setupInputPlaceholder,
	autoGrowInput
} from './chat.js';
import {
	renderUserList,
	renderMainHeader,
	setupMoreBtnMenu,
	loginFormHandler,
	openLoginModal,
	setupTabs,
	autofillRoomPwd,
	initLoginForm,
	initLoginAccentWheel,
	initFlipCard
} from './ui.js';

const isApkRuntime = () => Boolean(window.__SPRINTMATE_APK__ && window.__SPRINTMATE_APK__.enabled);

function normalizeServerToWs(value) {
	if (typeof value !== 'string') return '';
	let trimmed = value.trim();
	if (!trimmed) return '';
	if (!/^[a-zA-Z]+:\/\//.test(trimmed)) {
		trimmed = (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost)/.test(trimmed) ? 'ws://' : 'wss://') + trimmed;
	}
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
		else if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
		if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return '';
		return parsed.toString().replace(/\/$/, '');
	} catch (_) {
		return '';
	}
}

window.config = {
	wsAddress: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
	debug: false
};

window.setSprintMateServerUrl = (rawUrl) => {
	const normalized = normalizeServerToWs(rawUrl);
	if (!normalized) return '';
	window.config.wsAddress = normalized;
	try { localStorage.setItem('SprintMate_wsAddress', normalized); } catch (_) {}
	return normalized;
};

try {
	const params = new URLSearchParams(window.location.search);
	const overrideWs = normalizeServerToWs(params.get('ws') || params.get('wsAddress'));
	const storedWs = normalizeServerToWs(localStorage.getItem('SprintMate_wsAddress'));
	let finalWs = overrideWs;

	if (isApkRuntime()) {
		if (!finalWs && storedWs) {
			finalWs = storedWs;
		}
		if (!finalWs && window.__SPRINTMATE_APK__.defaultServer) {
			finalWs = normalizeServerToWs(window.__SPRINTMATE_APK__.defaultServer);
		}
	} else if (!finalWs && storedWs) {
		let storedHost = '';
		try { storedHost = new URL(storedWs).host.toLowerCase(); } catch (_) { storedHost = ''; }
		const currentHost = window.location.host.toLowerCase();
		if (storedHost === currentHost) {
			finalWs = storedWs;
		} else {
			localStorage.removeItem('SprintMate_wsAddress');
		}
	}

	if (finalWs && typeof finalWs === 'string') {
		window.config.wsAddress = finalWs;
	}
	if (overrideWs) {
		localStorage.setItem('SprintMate_wsAddress', overrideWs);
	}
} catch (_) {}

// Mobile soft-keyboard dynamic viewport sync (only active on <= 768px; desktop untouched)
function setupMobileViewportSync() {
	const updateAppDvh = () => {
		if (window.innerWidth > 768) {
			document.documentElement.style.removeProperty('--app-dvh');
			return;
		}
		const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
		if (vh > 200) {
			document.documentElement.style.setProperty('--app-dvh', `${Math.round(vh)}px`);
		}
		const chatArea = document.getElementById('chat-area');
		if (chatArea && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('input-message-input')) {
			requestAnimationFrame(() => {
				chatArea.scrollTop = chatArea.scrollHeight;
			});
		}
	};
	updateAppDvh();
	window.addEventListener('resize', updateAppDvh, { passive: true });
	if (window.visualViewport) {
		window.visualViewport.addEventListener('resize', updateAppDvh, { passive: true });
		window.visualViewport.addEventListener('scroll', updateAppDvh, { passive: true });
	}
}
setupMobileViewportSync();

initSettings();
updateStaticTexts();

window.roomsData = roomsData;
Object.defineProperty(window, 'activeRoomIndex', {
	get: () => activeRoomIndex,
	configurable: true
});
window.addSystemMsg = addSystemMsg;
window.addOtherMsg = addOtherMsg;
window.joinRoom = joinRoom;
window.updateCurrentUserName = updateCurrentUserName;
window.notifyMessage = notifyMessage;
window.setupEmojiPicker = setupEmojiPicker;
window.handleFileMessage = handleFileMessage;
window.handleBinaryFileChunk = handleBinaryFileChunk;
window.downloadFile = downloadFile;
window.cancelFileTransfer = cancelFileTransfer;

// Requirement 4: Extract multi-line text while preserving exact line breaks, blank lines & indentation
function extractFormattedInputText(el) {
	if (!el) return '';
	const raw = typeof el.value === 'string' ? el.value : (el.innerText || '');
	return raw
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
}

// Setup encrypted voice message recorder
function setupVoiceRecording() {
	const voiceBtn = $id('chat-voice-btn');
	const recBar = $id('voice-recording-bar');
	const composerRow = $id('message-composer-row');
	const timerEl = $id('voice-rec-timer');
	const cancelBtn = $id('voice-rec-cancel');
	const sendBtn = $id('voice-rec-send');
	if (!voiceBtn || !recBar || !composerRow) return;

	let mediaRecorder = null;
	let audioStream = null;
	let audioChunks = [];
	let recStartTime = 0;
	let recTimerInterval = null;
	let shouldSendOnStop = false;

	const stopStreamTracks = () => {
		if (audioStream) {
			try { audioStream.getTracks().forEach(tr => tr.stop()); } catch (_) {}
			audioStream = null;
		}
	};

	const resetUI = () => {
		if (recTimerInterval) {
			clearInterval(recTimerInterval);
			recTimerInterval = null;
		}
		recBar.style.display = 'none';
		composerRow.style.display = 'flex';
		if (timerEl) timerEl.textContent = '00:00';
	};

	const pickAudioMime = () => {
		if (typeof MediaRecorder === 'undefined') return '';
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
		for (const mime of candidates) {
			if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) return mime;
		}
		return '';
	};

	const sendRecordedVoice = async (blob, durationSec) => {
		const rd = roomsData[activeRoomIndex];
		if (!rd || !rd.chat) return;
		const reader = new FileReader();
		reader.onloadend = async () => {
			const dataUrl = reader.result;
			if (!dataUrl || typeof dataUrl !== 'string') return;
			const voicePayload = {
				audio: dataUrl,
				duration: Math.max(1, Math.round(durationSec))
			};
			if (rd.privateChatTargetId) {
				const sent = await rd.chat.sendClientMessage(rd.privateChatTargetId, 'voice_private', voicePayload);
				if (sent) {
					addMsg(voicePayload, false, 'voice_private');
				} else {
					addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}.`);
				}
			} else {
				await rd.chat.sendChannelMessage('voice', voicePayload);
				addMsg(voicePayload, false, 'voice');
			}
		};
		reader.readAsDataURL(blob);
	};

	const finishRecording = (sendFlag) => {
		shouldSendOnStop = sendFlag;
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			try { mediaRecorder.stop(); } catch (_) { stopStreamTracks(); resetUI(); }
		} else {
			stopStreamTracks();
			resetUI();
		}
	};

	voiceBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
			addSystemMsg('当前浏览器不支持录音功能（请确认已使用 HTTPS 访问并授予麦克风权限）。');
			return;
		}
		try {
			audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			audioChunks = [];
			shouldSendOnStop = false;
			const mime = pickAudioMime();
			mediaRecorder = mime ? new MediaRecorder(audioStream, { mimeType: mime }) : new MediaRecorder(audioStream);

			mediaRecorder.ondataavailable = (ev) => {
				if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
			};

			mediaRecorder.onstop = () => {
				const durationSec = (Date.now() - recStartTime) / 1000;
				const finalMime = (mediaRecorder && mediaRecorder.mimeType) || mime || 'audio/webm';
				const blob = new Blob(audioChunks, { type: finalMime });
				stopStreamTracks();
				resetUI();
				if (shouldSendOnStop && blob.size > 0) {
					sendRecordedVoice(blob, durationSec);
				}
				audioChunks = [];
				mediaRecorder = null;
			};

			recStartTime = Date.now();
			mediaRecorder.start(200);
			composerRow.style.display = 'none';
			recBar.style.display = 'flex';
			if (timerEl) timerEl.textContent = '00:00';
			recTimerInterval = setInterval(() => {
				const sec = Math.floor((Date.now() - recStartTime) / 1000);
				if (timerEl) {
					const m = Math.floor(sec / 60).toString().padStart(2, '0');
					const s = (sec % 60).toString().padStart(2, '0');
					timerEl.textContent = `${m}:${s}`;
				}
				if (sec >= 120) {
					finishRecording(true);
				}
			}, 300);
		} catch (err) {
			stopStreamTracks();
			resetUI();
			addSystemMsg('无法启动麦克风录音：' + (err && err.message ? err.message : '权限被拒绝'));
		}
	});

	if (cancelBtn) cancelBtn.addEventListener('click', () => finishRecording(false));
	if (sendBtn) sendBtn.addEventListener('click', () => finishRecording(true));
}

window.addEventListener('DOMContentLoaded', () => {
	setTimeout(() => {
		document.body.classList.remove('preload');
	}, 250);

	initLoginForm();
	initLoginAccentWheel();

	const joinBtn = $('.join-room');
	if (joinBtn) {
		joinBtn.onclick = () => openLoginModal('join');
	}

	initFlipCard();
	autofillRoomPwd();
	setupInputPlaceholder();
	setupMoreBtnMenu();
	setupImagePreview();
	setupEmojiPicker();
	setupVoiceRecording();
	initTheme();

	const settingsBtn = $id('settings-btn');
	if (settingsBtn) {
		settingsBtn.onclick = (e) => {
			e.stopPropagation();
			openSettingsPanel();
		};
	}

	const settingsBackBtn = $id('settings-back-btn');
	if (settingsBackBtn) {
		settingsBackBtn.onclick = (e) => {
			e.stopPropagation();
			closeSettingsPanel();
		};
	}

	const input = document.querySelector('.input-message-input');
	const imagePasteHandler = setupImagePaste('.input-message-input');

	let lastEnterSendAt = 0;

	if (input) {
		input.addEventListener('keydown', (e) => {
			if (e.isComposing || e.keyCode === 229) return;
			const isMobileScreen = window.innerWidth <= 768;
			if (e.key === 'Enter' && !e.shiftKey && !isMobileScreen) {
				e.preventDefault();
				lastEnterSendAt = Date.now();
				sendMessage();
			}
		});
		input.addEventListener('keypress', (e) => {
			if (e.isComposing || e.keyCode === 229) return;
			const isMobileScreen = window.innerWidth <= 768;
			if (e.key === 'Enter' && !e.shiftKey && !isMobileScreen) {
				e.preventDefault();
			}
		});
		input.addEventListener('beforeinput', (e) => {
			if (e.inputType === 'insertLineBreak' && Date.now() - lastEnterSendAt < 150) {
				e.preventDefault();
			}
		});
	}

	async function sendMessage() {
		const rawText = extractFormattedInputText(input);
		const hasText = rawText.trim().length > 0;
		const images = imagePasteHandler ? imagePasteHandler.getCurrentImages() : [];

		if (!hasText && images.length === 0) return;
		const rd = roomsData[activeRoomIndex];

		if (rd && rd.chat) {
			// Clear input synchronously so fast typing or stray key events never leak into the next message
			if (input) {
				if (typeof input.value === 'string') input.value = '';
				else input.innerHTML = '';
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}
			if (imagePasteHandler && typeof imagePasteHandler.refreshPlaceholder === 'function') {
				imagePasteHandler.refreshPlaceholder();
			}
			autoGrowInput();

			if (images.length > 0) {
				const messageContent = {
					text: hasText ? rawText : '',
					images: images
				};

				if (rd.privateChatTargetId) {
					const sent = await rd.chat.sendClientMessage(rd.privateChatTargetId, 'image_private', messageContent);
					if (sent) {
						addMsg(messageContent, false, 'image_private');
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`);
					}
				} else {
					await rd.chat.sendChannelMessage('image', messageContent);
					addMsg(messageContent, false, 'image');
				}
				imagePasteHandler.clearImages();
			} else if (hasText) {
				if (rd.privateChatTargetId) {
					const sent = await rd.chat.sendClientMessage(rd.privateChatTargetId, 'text_private', rawText);
					if (sent) {
						addMsg(rawText, false, 'text_private');
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`);
					}
				} else {
					await rd.chat.sendChannelMessage('text', rawText);
					addMsg(rawText);
				}
			}
		}
	}

	const sendButton = document.querySelector('.send-message-btn');
	if (sendButton) {
		sendButton.addEventListener('click', sendMessage);
	}

	setupFileSend({
		inputSelector: '.input-message-input',
		attachBtnSelector: '.chat-attach-btn',
		fileInputSelector: '.new-message-wrapper input[type="file"]',
		onSend: async (message) => {
			const rd = roomsData[activeRoomIndex];
			if (!rd || !rd.chat) return false;
			const userName = rd.myUserName || '';
			const msgWithUser = { ...message, userName };

			if (rd.privateChatTargetId) {
				const sent = await rd.chat.sendClientMessage(
					rd.privateChatTargetId,
					msgWithUser.type + '_private',
					msgWithUser
				);
				if (sent) {
					if (msgWithUser.type === 'file_start') {
						addMsg(msgWithUser, false, 'file_private');
					}
					return true;
				} else {
					if (msgWithUser.type === 'file_start') {
						addSystemMsg(`${t('system.private_file_failed', 'Cannot send private file to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`);
					}
					return false;
				}
			} else {
				const sent = await rd.chat.sendChannelMessage(msgWithUser.type, msgWithUser);
				if (msgWithUser.type === 'file_start' && sent !== false) {
					addMsg(msgWithUser, false, 'file');
				}
				return sent !== false;
			}
		}
	});

	const isMobile = () => window.innerWidth <= 768;

	renderMainHeader();
	renderUserList();
	setupTabs();

	const roomList = $id('room-list');
	const sidebar = $id('sidebar');
	const rightbar = $id('rightbar');
	const sidebarMask = $id('mobile-sidebar-mask');
	const rightbarMask = $id('mobile-rightbar-mask');

	if (roomList) {
		roomList.addEventListener('click', () => {
			if (isMobile()) {
				sidebar?.classList.remove('mobile-open');
				sidebarMask?.classList.remove('active');
			}
		});
	}

	const memberTabs = $id('member-tabs');
	if (memberTabs) {
		memberTabs.addEventListener('click', () => {
			if (isMobile()) {
				removeClass(rightbar, 'mobile-open');
				removeClass(rightbarMask, 'active');
			}
		});
	}

	let backgroundTimer = null;
	const backgroundTimeoutMs = 30 * 60 * 1000;
	const clearBackgroundTimer = () => {
		if (backgroundTimer) {
			clearTimeout(backgroundTimer);
			backgroundTimer = null;
		}
	};
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			if (!backgroundTimer) {
				backgroundTimer = setTimeout(() => {
					try {
						while (exitRoom()) {}
					} catch (_) {
					} finally {
						backgroundTimer = null;
					}
				}, backgroundTimeoutMs);
			}
		} else {
			clearBackgroundTimer();
		}
	});
});

window.addEventListener('languageChange', () => {
	updateStaticTexts();
});

let dragCounter = 0;
let hasTriggeredAttach = false;

window.addEventListener('fileUploadModalClosed', () => {
	hasTriggeredAttach = false;
});

document.addEventListener('dragenter', (e) => {
	dragCounter++;
	if (!hasTriggeredAttach && e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
		for (const item of e.dataTransfer.items) {
			if (item.kind === 'file') {
				const chatContainer = $id('chat-container');
				if (chatContainer && chatContainer.style.display !== 'none') {
					const attachBtn = document.querySelector('.chat-attach-btn');
					if (attachBtn) {
						attachBtn.click();
						hasTriggeredAttach = true;
					}
				}
				break;
			}
		}
	}
});

document.addEventListener('dragleave', () => {
	dragCounter = Math.max(0, dragCounter - 1);
	if (dragCounter === 0) {
		hasTriggeredAttach = false;
	}
});

document.addEventListener('dragover', (e) => {
	e.preventDefault();
});

document.addEventListener('drop', (e) => {
	e.preventDefault();
	dragCounter = 0;
	hasTriggeredAttach = false;
});
