// Chat message rendering: Short L2R Messages, Newline-Preserving Long Text, Voice Notes, and High-Speed File/Video Cards
// 聊天消息渲染：短消息左对齐无名流式排布、保留换行格式长文本、加密语音条、长视频/大文件传输卡片

import {
	createAvatarSVG,
	escapeHTML,
	textToHTML,
	$,
	$id,
	createElement,
	on,
	off,
	addClass,
	removeClass
} from './utils.js';
import {
	roomsData,
	activeRoomIndex
} from './room.js';
import {
	formatFileSize,
	formatSpeed,
	getMediaCategory,
	getTransportBadgeLabel
} from './util.file.js';
import {
	t
} from './util.i18n.js';

// Requirement 3: Short text messages (<= 28 chars, single line) hide sender name and align left-to-right;
// Long text (> 28 chars or multi-line containing '\n') keeps original left/right + sender name logic.
function isShortTextMessage(text, msgType) {
	if (msgType !== 'text' && msgType !== 'text_private') return false;
	if (typeof text !== 'string') return false;
	const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	if (normalized.includes('\n')) return false;
	return normalized.trim().length <= 28;
}

export function renderChatArea() {
	const chatArea = $id('chat-area');
	if (!chatArea) return;
	if (activeRoomIndex < 0 || !roomsData[activeRoomIndex]) {
		chatArea.innerHTML = '';
		return;
	}
	chatArea.innerHTML = '';

	const welcomeCard = createElement('div', {
		class: 'e2ee-welcome-card'
	}, `
		<span class="e2ee-welcome-icon">🛡️</span>
		<div>${escapeHTML(t('ui.e2ee_room_notice', 'All messages, videos, and large files in this room are encrypted locally with AES-256-GCM.'))}</div>
	`);
	chatArea.appendChild(welcomeCard);

	roomsData[activeRoomIndex].messages.forEach(m => {
		if (m.type === 'me') addMsg(m.text, true, m.msgType || 'text', m.timestamp);
		else if (m.type === 'system') addSystemMsg(m.text, true, m.timestamp);
		else addOtherMsg(m.text, m.userName, m.avatar, true, m.msgType || 'text', m.timestamp);
	});
}

function renderImageContent(payload) {
	if (typeof payload === 'object' && payload.images && Array.isArray(payload.images)) {
		const messageText = payload.text ? textToHTML(payload.text) : '';
		const imageElements = payload.images.map(imgData => {
			const safeImgSrc = escapeHTML(imgData).replace(/javascript:/gi, '');
			return `<img src="${safeImgSrc}" alt="image" class="bubble-img">`;
		}).join('');
		if (messageText && imageElements) {
			return `<div class="mixed-content"><div class="message-text">${messageText}</div>${imageElements}</div>`;
		}
		return imageElements || messageText;
	}
	if (typeof payload === 'object' && payload.image) {
		const safeImgSrc = escapeHTML(payload.image).replace(/javascript:/gi, '');
		const messageText = payload.text ? textToHTML(payload.text) : '';
		if (messageText) {
			return `<div class="mixed-content"><div class="message-text">${messageText}</div><img src="${safeImgSrc}" alt="image" class="bubble-img"></div>`;
		}
		return `<img src="${safeImgSrc}" alt="image" class="bubble-img">`;
	}
	const safeImgSrc = escapeHTML(String(payload || '')).replace(/javascript:/gi, '');
	return `<img src="${safeImgSrc}" alt="image" class="bubble-img">`;
}

function formatVoiceDuration(seconds = 0) {
	const s = Math.max(1, Math.round(Number(seconds) || 0));
	const m = Math.floor(s / 60);
	const rem = (s % 60).toString().padStart(2, '0');
	return `${m}:${rem}`;
}

function renderVoiceMessage(voiceData) {
	const audioSrc = (voiceData && typeof voiceData.audio === 'string' && voiceData.audio.startsWith('data:audio/'))
		? escapeHTML(voiceData.audio)
		: '';
	const durText = formatVoiceDuration(voiceData && voiceData.duration ? voiceData.duration : 1);
	const bars = [10, 18, 14, 24, 16, 22, 12, 20, 15, 22, 11, 17]
		.map(h => `<span class="voice-bar" style="height:${h}px"></span>`)
		.join('');
	return `
		<div class="voice-message-card" data-playing="0">
			<button type="button" class="voice-play-btn" onclick="window.toggleVoiceBubblePlay(this)" aria-label="Play voice message">
				<span class="voice-play-icon">▶</span>
			</button>
			<div class="voice-wave-track">${bars}</div>
			<span class="voice-duration">${durText}</span>
			<audio class="voice-hidden-audio" preload="metadata" src="${audioSrc}"></audio>
		</div>
	`;
}

window.toggleVoiceBubblePlay = function(btn) {
	const card = btn && btn.closest('.voice-message-card');
	if (!card) return;
	const audio = card.querySelector('.voice-hidden-audio');
	const icon = btn.querySelector('.voice-play-icon');
	if (!audio) return;

	// Pause any other currently playing voice note
	document.querySelectorAll('.voice-message-card[data-playing="1"]').forEach((other) => {
		if (other !== card) {
			const otherAudio = other.querySelector('.voice-hidden-audio');
			const otherIcon = other.querySelector('.voice-play-icon');
			if (otherAudio) { otherAudio.pause(); otherAudio.currentTime = 0; }
			other.setAttribute('data-playing', '0');
			other.classList.remove('is-playing');
			if (otherIcon) otherIcon.textContent = '▶';
		}
	});

	if (audio.paused) {
		audio.play().then(() => {
			card.setAttribute('data-playing', '1');
			card.classList.add('is-playing');
			if (icon) icon.textContent = '❚❚';
		}).catch(() => {});
		audio.onended = () => {
			card.setAttribute('data-playing', '0');
			card.classList.remove('is-playing');
			if (icon) icon.textContent = '▶';
		};
	} else {
		audio.pause();
		card.setAttribute('data-playing', '0');
		card.classList.remove('is-playing');
		if (icon) icon.textContent = '▶';
	}
};

export function addMsg(text, isHistory = false, msgType = 'text', timestamp = null) {
	const ts = isHistory ? timestamp : (timestamp || Date.now());
	if (!ts) return;
	if (!isHistory && activeRoomIndex >= 0) {
		roomsData[activeRoomIndex].messages.push({
			type: 'me',
			text,
			msgType,
			timestamp: ts
		});
	}
	const chatArea = $id('chat-area');
	if (!chatArea) return;
	const isPrivate = msgType.includes('_private');
	const isShort = isShortTextMessage(text, msgType);
	let className = 'bubble me' + (isPrivate ? ' private-message' : '') + (isShort ? ' is-short-msg' : '');
	const date = new Date(ts);
	const time = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
	let contentHtml = '';

	if (msgType === 'image' || msgType === 'image_private') {
		contentHtml = renderImageContent(text);
	} else if (msgType === 'voice' || msgType === 'voice_private') {
		contentHtml = renderVoiceMessage(text);
		className += ' voice-bubble';
	} else if (msgType === 'file' || msgType === 'file_private') {
		contentHtml = renderFileMessage(text, true);
		className += ' file-bubble';
	} else {
		contentHtml = textToHTML(text);
	}

	const privateTagHtml = isPrivate
		? `<div class="bubble-private-tag">🔒 ${escapeHTML(t('ui.private_badge', 'Private'))}</div>`
		: '';

	const div = createElement('div', {
		class: className
	}, `${privateTagHtml}<span class="bubble-content">${contentHtml}</span><span class="bubble-meta">${time}</span>`);
	chatArea.appendChild(div);
	chatArea.scrollTop = chatArea.scrollHeight;
}

export function addOtherMsg(msg, userName = '', avatar = '', isHistory = false, msgType = 'text', timestamp = null) {
	if (!userName && activeRoomIndex >= 0) {
		const rd = roomsData[activeRoomIndex];
		if (msg && msg.userName) {
			userName = msg.userName;
		} else if (rd && msg && msg.clientId && rd.userMap[msg.clientId]) {
			userName = rd.userMap[msg.clientId].userName || rd.userMap[msg.clientId].username || rd.userMap[msg.clientId].name || t('ui.anonymous', 'Anonymous');
		}
	}
	userName = userName || t('ui.anonymous', 'Anonymous');
	const ts = isHistory ? timestamp : (timestamp || Date.now());
	if (!ts) return;
	const chatArea = $id('chat-area');
	if (!chatArea) return;

	const isShort = isShortTextMessage(msg, msgType);
	const bubbleWrap = createElement('div', {
		class: 'bubble-other-wrap' + (isShort ? ' is-short-msg' : '')
	});
	let contentHtml = '';
	if (msgType === 'image' || msgType === 'image_private') {
		contentHtml = renderImageContent(msg);
	} else if (msgType === 'voice' || msgType === 'voice_private') {
		contentHtml = renderVoiceMessage(msg);
	} else if (msgType === 'file' || msgType === 'file_private') {
		contentHtml = renderFileMessage(msg, false);
	} else {
		contentHtml = textToHTML(msg);
	}

	const safeUserName = escapeHTML(userName);
	const date = new Date(ts);
	const time = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
	const isPrivate = Boolean(msgType && msgType.includes('_private'));
	let bubbleClasses = 'bubble other' + (isShort ? ' is-short-msg' : '');
	if (isPrivate) bubbleClasses += ' private-message';
	if (msgType === 'file' || msgType === 'file_private') bubbleClasses += ' file-bubble';
	if (msgType === 'voice' || msgType === 'voice_private') bubbleClasses += ' voice-bubble';

	const privateTagHtml = isPrivate
		? `<div class="bubble-private-tag">🔒 ${escapeHTML(t('ui.private_badge', 'Private'))}</div>`
		: '';

	// Requirement 3: Do NOT show sender name on short messages; keep sender name on long/media messages
	const senderNameHtml = isShort ? '' : `<div class="bubble-other-name">${safeUserName}</div>`;

	bubbleWrap.innerHTML = `
		<span class="avatar"></span>
		<div class="bubble-other-main">
			<div class="${bubbleClasses}">
				${senderNameHtml}
				${privateTagHtml}
				<span class="bubble-content">${contentHtml}</span>
				<span class="bubble-meta">${time}</span>
			</div>
		</div>
	`;
	const svg = createAvatarSVG(userName);
	const avatarEl = $('.avatar', bubbleWrap);
	if (avatarEl) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		avatarEl.innerHTML = cleanSvg;
	}
	chatArea.appendChild(bubbleWrap);
	chatArea.scrollTop = chatArea.scrollHeight;
}

export function addSystemMsg(text, isHistory = false, timestamp = null) {
	if (!isHistory && activeRoomIndex >= 0) {
		const ts = timestamp || Date.now();
		roomsData[activeRoomIndex].messages.push({
			type: 'system',
			text,
			timestamp: ts
		});
	}
	const chatArea = $id('chat-area');
	if (!chatArea) return;
	const safeText = textToHTML(text);
	const div = createElement('div', {
		class: 'bubble system'
	}, `<span class="bubble-content">${safeText}</span>`);
	chatArea.appendChild(div);
	chatArea.scrollTop = chatArea.scrollHeight;
}

export function updateChatInputStyle() {
	const rd = roomsData[activeRoomIndex];
	const chatInputArea = $('.chat-input-area');
	const placeholder = $('.input-field-placeholder');
	const inputMessageInput = $('.input-message-input');
	const privateBanner = $id('private-chat-banner');
	const privateLabel = $id('private-banner-label');
	const privateTarget = $id('private-banner-target');
	const privateExitText = $id('private-banner-exit-text');
	const privateCloseBtn = $id('private-banner-close');

	if (privateCloseBtn && privateCloseBtn.dataset.bound !== '1') {
		privateCloseBtn.dataset.bound = '1';
		privateCloseBtn.onclick = () => {
			if (typeof window.clearPrivateChat === 'function') {
				window.clearPrivateChat();
			}
		};
	}

	if (!chatInputArea || !placeholder || !inputMessageInput) return;

	if (rd && rd.privateChatTargetId) {
		addClass(chatInputArea, 'private-mode');
		addClass(inputMessageInput, 'private-mode');
		placeholder.textContent = `🔒 ${t('ui.private_message_to', 'Private Message to')} ${rd.privateChatTargetName}`;
		if (privateBanner) {
			privateBanner.style.display = 'flex';
			if (privateLabel) privateLabel.textContent = t('ui.private_banner_prefix', 'Private E2EE chat with:');
			if (privateTarget) privateTarget.textContent = rd.privateChatTargetName || '';
			if (privateExitText) privateExitText.textContent = t('ui.exit_private_chat', 'Back to Public');
		}
	} else {
		removeClass(chatInputArea, 'private-mode');
		removeClass(inputMessageInput, 'private-mode');
		placeholder.textContent = t('ui.message', 'Message');
		if (privateBanner) {
			privateBanner.style.display = 'none';
		}
	}

	const rawText = (typeof inputMessageInput.value === 'string' ? inputMessageInput.value : inputMessageInput.textContent) || '';
	placeholder.style.opacity = (rawText.replace(/\u200B/g, '') === '') ? '1' : '0';
}

export function setupImagePreview() {
	on($id('chat-area'), 'click', function(e) {
		const target = e.target;
		if (target.tagName === 'IMG' && target.closest('.bubble-content')) {
			showImageModal(target.src);
		}
	});
}

export function showImageModal(src) {
	const modal = createElement('div', {
		class: 'img-modal-bg'
	}, `<div class="img-modal-blur"></div><div class="img-modal-content img-modal-content-overflow"><img src="${src}" class="img-modal-img"/><span class="img-modal-close">&times;</span></div>`);
	document.body.appendChild(modal);
	on($('.img-modal-close', modal), 'click', () => modal.remove());
	on(modal, 'click', (e) => {
		if (e.target === modal) modal.remove();
	});
	const img = $('img', modal);
	let scale = 1, isDragging = false, lastX = 0, lastY = 0, offsetX = 0, offsetY = 0;
	img.ondragstart = (e) => e.preventDefault();
	on(img, 'wheel', function(ev) {
		ev.preventDefault();
		scale += ev.deltaY < 0 ? 0.12 : -0.12;
		scale = Math.max(0.25, Math.min(5, scale));
		if (scale === 1) { offsetX = 0; offsetY = 0; }
		updateTransform();
	});
	function updateTransform() {
		img.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
		img.style.cursor = scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';
	}
	on(img, 'mousedown', function(ev) {
		if (scale <= 1) return;
		isDragging = true;
		lastX = ev.clientX;
		lastY = ev.clientY;
		img.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	});
	function onMouseMove(ev) {
		if (!isDragging) return;
		offsetX += ev.clientX - lastX;
		offsetY += ev.clientY - lastY;
		lastX = ev.clientX;
		lastY = ev.clientY;
		updateTransform();
	}
	function onMouseUp() {
		if (isDragging) {
			isDragging = false;
			img.style.cursor = 'grab';
			document.body.style.userSelect = '';
		}
	}
	on(window, 'mousemove', onMouseMove);
	on(window, 'mouseup', onMouseUp);
	on(img, 'dblclick', function() { scale = 1; offsetX = 0; offsetY = 0; updateTransform(); });
	const cleanup = () => {
		off(window, 'mousemove', onMouseMove);
		off(window, 'mouseup', onMouseUp);
		document.body.style.userSelect = '';
	};
	on(modal, 'remove', cleanup);
	on($('.img-modal-close', modal), 'click', cleanup);
	updateTransform();
}

function renderFileMessage(fileData, isSender) {
	const { fileId, fileName, mimeType, originalSize, fileCount, isArchive } = fileData || {};

	let displayName, displayMeta;
	if (isArchive && fileCount) {
		displayName = `${fileCount}${t('file.files', ' files')}`;
		displayMeta = `${t('file.total', 'Total')}: ${formatFileSize(originalSize)}`;
	} else {
		displayName = fileName || 'File';
		displayMeta = formatFileSize(originalSize || 0);
	}

	const safeDisplayName = escapeHTML(displayName);
	const transfer = window.fileTransfers ? window.fileTransfers.get(fileId) : null;
	const category = isArchive ? 'archive' : getMediaCategory(displayName, mimeType || (transfer && transfer.mimeType));
	const iconMap = { video: '🎬', audio: '🎵', image: '🖼️', archive: '📦', file: '📄' };
	const fileIcon = iconMap[category] || '📄';

	let statusText = '';
	let speedText = '';
	let percentText = '0%';
	let progressWidth = '0%';
	let showProgressBar = true;
	let showCancel = false;
	let showDownload = false;
	const mode = (transfer && transfer.transportMode) || (transfer && transfer.usingP2P ? 'p2p' : 'relay');
	const isDirect = mode === 'lan' || mode === 'p2p';
	const vSize = (transfer && transfer.volumeSize) || 128 * 1024;

	if (transfer) {
		if (transfer.status === 'sending') {
			const progress = transfer.totalVolumes ? Math.min(100, (transfer.sentVolumes / transfer.totalVolumes) * 100) : 100;
			const sentBytes = Math.min(transfer.originalSize, transfer.sentVolumes * vSize);
			progressWidth = `${progress.toFixed(1)}%`;
			percentText = `${Math.round(progress)}%`;
			statusText = `${t('file.sending', 'Sending')} · ${formatFileSize(sentBytes)} / ${formatFileSize(transfer.originalSize)}`;
			speedText = formatSpeed(transfer.speedBps);
			showCancel = true;
		} else if (transfer.status === 'receiving') {
			const recCount = transfer.receivedVolumes ? transfer.receivedVolumes.size : 0;
			const progress = transfer.totalVolumes ? Math.min(100, (recCount / transfer.totalVolumes) * 100) : 0;
			const recBytes = Math.min(transfer.originalSize, recCount * vSize);
			progressWidth = `${progress.toFixed(1)}%`;
			percentText = `${Math.round(progress)}%`;
			statusText = `${t('file.receiving', 'Receiving')} · ${formatFileSize(recBytes)} / ${formatFileSize(transfer.originalSize)}`;
			speedText = formatSpeed(transfer.speedBps);
			showCancel = true;
		} else if (transfer.status === 'cancelled') {
			showProgressBar = false;
			percentText = '';
			statusText = t('file.cancelled', 'Transfer cancelled');
		} else if (transfer.status === 'failed') {
			showProgressBar = false;
			percentText = '';
			statusText = t('file.failed', 'Transfer failed');
		} else if (transfer.status === 'completed') {
			showProgressBar = false;
			percentText = '100%';
			speedText = formatSpeed(transfer.speedBps);
			statusText = isSender
				? `✓ ${t('file.sent_complete', 'Sent successfully')}`
				: `✓ ${t('file.received_complete', 'Ready to play / download')}`;
			showDownload = true;
		}
	} else {
		showProgressBar = false;
		percentText = '';
		statusText = isSender
			? `✓ ${t('file.sent_complete', 'Sent successfully')}`
			: `✓ ${t('file.received_complete', 'Ready to play / download')}`;
		showDownload = !isSender;
	}

	let mediaPreviewHtml = '';
	let mediaPreviewRenderedAttr = '';
	let mediaPreviewDisplay = 'display: none;';

	if (transfer && transfer.status === 'completed' && transfer.objectUrl) {
		if (category === 'video') {
			mediaPreviewHtml = `<video class="file-inline-video" controls preload="metadata" playsinline src="${transfer.objectUrl}"></video>`;
			mediaPreviewRenderedAttr = 'data-rendered="1"';
			mediaPreviewDisplay = 'display: block;';
		} else if (category === 'audio') {
			mediaPreviewHtml = `<audio class="file-inline-audio" controls preload="metadata" src="${transfer.objectUrl}"></audio>`;
			mediaPreviewRenderedAttr = 'data-rendered="1"';
			mediaPreviewDisplay = 'display: block;';
		} else if (category === 'image') {
			mediaPreviewHtml = `<img class="file-inline-image bubble-img" src="${transfer.objectUrl}" alt="${safeDisplayName}" />`;
			mediaPreviewRenderedAttr = 'data-rendered="1"';
			mediaPreviewDisplay = 'display: block;';
		}
	}

	return `
		<div class="file-message" data-file-id="${fileId}">
			<div class="file-main-content">
				<div class="file-info">
					<div class="file-icon">${fileIcon}</div>
					<div class="file-details">
						<div class="file-name" title="${safeDisplayName}">${safeDisplayName}</div>
						<div class="file-meta-row">
							<span class="file-meta">${displayMeta}</span>
							<span class="file-transport-badge ${isDirect ? 'is-p2p' : ''}">${getTransportBadgeLabel(mode)}</span>
						</div>
					</div>
				</div>
				<div class="file-actions">
					<button type="button" class="file-cancel-btn" style="${showCancel ? 'display: inline-flex;' : 'display: none;'}" onclick="window.cancelFileTransfer('${fileId}')" title="${t('file.cancel', 'Cancel')}">&times;</button>
					<button type="button" class="file-download-btn ${showDownload ? 'show' : ''}" style="${showDownload ? 'display: inline-flex;' : 'display: none;'}" onclick="window.downloadFile('${fileId}')">
						<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>${t('file.download', 'Download')}</span>
					</button>
				</div>
			</div>

			<div class="file-media-preview" style="${mediaPreviewDisplay}" ${mediaPreviewRenderedAttr}>${mediaPreviewHtml}</div>

			<div class="file-progress-container">
				<div class="file-progress-bar" style="${showProgressBar ? '' : 'display: none;'}">
					<div class="file-progress" style="width: ${progressWidth}"></div>
				</div>
				<div class="file-status-row">
					<div class="file-status">${statusText}</div>
					<div class="file-speed-wrap">
						<span class="file-speed">${speedText}</span>
						<span class="file-percent">${percentText}</span>
					</div>
				</div>
			</div>
		</div>
	`;
}

export function autoGrowInput() {
	const input = $('.input-message-input');
	if (!input) return;
	input.style.height = 'auto';
	input.style.height = Math.min(160, input.scrollHeight) + 'px';
}

// Requirement 4: Insert plain text preserving exact newlines, blank lines, and indentation
function insertPlainTextAtCaret(element, rawText) {
	const text = (rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const selection = window.getSelection();
	if (selection && selection.rangeCount > 0) {
		const range = selection.getRangeAt(0);
		if (element.contains(range.commonAncestorContainer) || range.commonAncestorContainer === element) {
			range.deleteContents();
			const textNode = document.createTextNode(text);
			range.insertNode(textNode);
			range.setStartAfter(textNode);
			range.setEndAfter(textNode);
			selection.removeAllRanges();
			selection.addRange(range);
			element.dispatchEvent(new Event('input', { bubbles: true }));
			return;
		}
	}
	element.appendChild(document.createTextNode(text));
	element.dispatchEvent(new Event('input', { bubbles: true }));
}

function handlePasteAsPlainText(element) {
	if (!element) return;
	on(element, 'paste', function(e) {
		if (e.clipboardData && e.clipboardData.items) {
			for (const item of e.clipboardData.items) {
				if (item.type && item.type.startsWith('image/')) {
					return;
				}
			}
		}
		e.preventDefault();
		let text = '';
		if (e.clipboardData || window.clipboardData) {
			text = (e.clipboardData || window.clipboardData).getData('text/plain');
		}
		insertPlainTextAtCaret(element, text);
	});
}

export function setupInputPlaceholder() {
	const input = $('.input-message-input');
	const placeholder = $('.input-field-placeholder');
	if (!input || !placeholder) return;

	function checkEmpty() {
		const raw = (typeof input.value === 'string' ? input.value : (input.innerText || '')).replace(/\u200B/g, '');
		const hasContent = raw.length > 0;
		placeholder.style.opacity = hasContent ? '0' : '1';
		input.classList.toggle('is-empty', !hasContent);
		autoGrowInput();
	}
	on(input, 'input', checkEmpty);
	on(input, 'blur', checkEmpty);
	on(input, 'focus', checkEmpty);
	if (typeof input.value !== 'string') {
		handlePasteAsPlainText(input);
	}
	checkEmpty();
	autoGrowInput();
	updateChatInputStyle();
}
