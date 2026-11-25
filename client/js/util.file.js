// File & Long Video Transfer Engine — High-Speed Binary LAN/Hotspot P2P + Streaming WebSocket Fallback
// 大文件与长视频高速传输引擎 —— 局域网/热点原生二进制 P2P 直传（零Base64、事件驱动背压）+ Cloudflare 流式中继回退

import { deflate, inflate } from 'fflate';
import { $, createElement, on, addClass, removeClass } from './utils.js';
import { t } from './util.i18n.js';
import { roomsData, activeRoomIndex } from './room.js';

// ==================== File Upload Modal ====================
let uploadModal = null;
const selectedFiles = new Map();
let onSendCallback = null;

window.addEventListener('languageChange', () => {
	if (uploadModal) updateModalTexts();
});

function updateModalTexts() {
	if (!uploadModal) return;
	const modalTitle = uploadModal.querySelector('.file-upload-header h3');
	if (modalTitle) modalTitle.textContent = t('file.upload_files', 'Upload Files');
	const fileListTitle = uploadModal.querySelector('.file-list-title');
	if (fileListTitle) fileListTitle.textContent = t('file.selected_files', 'Selected Files');
	const clearAllBtn = uploadModal.querySelector('.file-clear-all-btn');
	if (clearAllBtn) clearAllBtn.textContent = t('file.clear_all', 'Clear All');
	const cancelBtn = uploadModal.querySelector('.file-upload-cancel-btn');
	if (cancelBtn) cancelBtn.textContent = t('file.cancel', 'Cancel');
	const sendBtn = uploadModal.querySelector('.file-upload-send-btn');
	if (sendBtn) sendBtn.textContent = t('file.send_files', 'Send Files');
	const dragDropText = uploadModal.querySelector('.file-drop-text');
	if (dragDropText) {
		dragDropText.innerHTML = `
			<p><strong>${t('file.drag_drop', 'Drag and drop files here')}</strong></p>
			<p>${t('file.or', 'or')} <button class="file-browse-btn" type="button">${t('file.browse_files', 'browse files')}</button></p>
		`;
		const browseBtn = dragDropText.querySelector('.file-browse-btn');
		const fileInput = $('#file-upload-input', uploadModal);
		if (browseBtn && fileInput) on(browseBtn, 'click', () => fileInput.click());
	}
	if (selectedFiles.size > 0) updateFileList();
}

function createUploadModal() {
	const chat = getActiveChat();
	const mode = chat && typeof chat.getTransportMode === 'function' ? chat.getTransportMode() : 'relay';
	const modeHint = mode === 'lan'
		? '⚡ 已检测到同局域网/手机热点，将启用原生二进制 P2P 高速直传（不走外网流量）'
		: (mode === 'p2p'
			? '⚡ 已建立 WebRTC P2P 二进制直连高速通道'
			: '🛡️ 当前使用 Cloudflare E2EE 流式加密中继（连入同一 Wi-Fi 或手机热点可自动提速直传）');

	return createElement('div', { class: 'file-upload-modal' }, `
		<div class="file-upload-overlay"></div>
		<div class="file-upload-container">
			<div class="file-upload-header">
				<h3>${t('file.upload_files', 'Upload Files')}</h3>
				<button class="file-upload-close">&times;</button>
			</div>
			<div class="file-upload-content">
				<div class="file-transfer-mode-hint ${mode !== 'relay' ? 'is-direct' : ''}">${modeHint}</div>
				<div class="file-drop-zone" id="file-drop-zone">
					<div class="file-drop-icon">📁</div>
					<div class="file-drop-text">
						<p><strong>${t('file.drag_drop', 'Drag and drop files here')}</strong></p>
						<p>${t('file.or', 'or')} <button class="file-browse-btn" type="button">${t('file.browse_files', 'browse files')}</button></p>
					</div>
					<input type="file" id="file-upload-input" multiple style="display: none;" accept="*/*">
				</div>
				<div class="file-list-container" id="file-list-container" style="display: none;">
					<div class="file-list-header">
						<span class="file-list-title">${t('file.selected_files', 'Selected Files')}</span>
						<button class="file-clear-all-btn" type="button">${t('file.clear_all', 'Clear All')}</button>
					</div>
					<div class="file-list" id="file-list"></div>
					<div class="file-list-summary" id="file-list-summary"></div>
				</div>
			</div>
			<div class="file-upload-footer">
				<button class="file-upload-cancel-btn" type="button">${t('file.cancel', 'Cancel')}</button>
				<button class="file-upload-send-btn" type="button" disabled>${t('file.send_files', 'Send Files')}</button>
			</div>
		</div>
	`);
}

export function showFileUploadModal(onSend) {
	if (uploadModal && uploadModal.parentNode) document.body.removeChild(uploadModal);
	onSendCallback = onSend;
	selectedFiles.clear();
	uploadModal = createUploadModal();
	document.body.appendChild(uploadModal);
	setupModalEvents();
	setTimeout(() => addClass(uploadModal, 'show'), 10);
}

function hideUploadModal() {
	if (!uploadModal) return;
	removeClass(uploadModal, 'show');
	setTimeout(() => {
		if (uploadModal && uploadModal.parentNode) document.body.removeChild(uploadModal);
		uploadModal = null;
		selectedFiles.clear();
		onSendCallback = null;
		window.dispatchEvent(new CustomEvent('fileUploadModalClosed'));
	}, 250);
}

function setupModalEvents() {
	if (!uploadModal) return;
	const overlay = $('.file-upload-overlay', uploadModal);
	const closeBtn = $('.file-upload-close', uploadModal);
	const cancelBtn = $('.file-upload-cancel-btn', uploadModal);
	const sendBtn = $('.file-upload-send-btn', uploadModal);
	const browseBtn = $('.file-browse-btn', uploadModal);
	const fileInput = $('#file-upload-input', uploadModal);
	const dropZone = $('#file-drop-zone', uploadModal);
	const clearAllBtn = $('.file-clear-all-btn', uploadModal);

	on(overlay, 'click', hideUploadModal);
	on(closeBtn, 'click', hideUploadModal);
	on(cancelBtn, 'click', hideUploadModal);
	on(browseBtn, 'click', () => fileInput.click());
	on(fileInput, 'change', (e) => {
		addFiles(Array.from(e.target.files));
		e.target.value = '';
	});
	on(dropZone, 'dragover', (e) => { e.preventDefault(); e.stopPropagation(); addClass(e.currentTarget, 'drag-over'); });
	on(dropZone, 'dragleave', (e) => { e.preventDefault(); e.stopPropagation(); removeClass(e.currentTarget, 'drag-over'); });
	on(dropZone, 'drop', (e) => {
		e.preventDefault();
		e.stopPropagation();
		removeClass(e.currentTarget, 'drag-over');
		addFiles(Array.from(e.dataTransfer.files));
	});
	on(clearAllBtn, 'click', () => { selectedFiles.clear(); updateFileList(); updateSendButton(); });
	on(sendBtn, 'click', async () => {
		if (selectedFiles.size === 0 || !onSendCallback) return;
		const files = Array.from(selectedFiles.values());
		const cb = onSendCallback;
		hideUploadModal();
		try {
			await cb(files);
		} catch (error) {
			if (window.addSystemMsg) window.addSystemMsg(`${t('system.file_send_failed', 'Failed to send files:')} ${error.message}`);
		}
	});
}

function addFiles(files) {
	files.forEach(file => selectedFiles.set('upload_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9), file));
	updateFileList();
	updateSendButton();
}

function updateFileList() {
	if (!uploadModal) return;
	const fileList = $('#file-list', uploadModal);
	const fileListContainer = $('#file-list-container', uploadModal);
	const fileListSummary = $('#file-list-summary', uploadModal);
	const dropZone = $('#file-drop-zone', uploadModal);
	if (selectedFiles.size === 0) {
		fileListContainer.style.display = 'none';
		dropZone.style.display = 'flex';
		dropZone.style.padding = '';
		return;
	}
	fileListContainer.style.display = 'block';
	dropZone.style.display = 'flex';
	dropZone.style.padding = '16px 14px';
	dropZone.style.marginBottom = '14px';
	fileList.innerHTML = '';
	for (const [id, file] of selectedFiles) {
		const fileItem = createElement('div', { class: 'file-item', 'data-file-id': id }, `
			<div class="file-item-info">
				<div class="file-item-name" title="${file.name}">${file.name}</div>
				<div class="file-item-size">${formatFileSize(file.size)}</div>
			</div>
			<button class="file-item-remove" type="button">&times;</button>
		`);
		fileList.appendChild(fileItem);
		on($('.file-item-remove', fileItem), 'click', (e) => {
			e.preventDefault();
			selectedFiles.delete(id);
			updateFileList();
			updateSendButton();
		});
	}
	const totalSize = Array.from(selectedFiles.values()).reduce((sum, f) => sum + f.size, 0);
	fileListSummary.innerHTML = t('file.files_selected', '{count} files selected, {size} total')
		.replace('{count}', selectedFiles.size)
		.replace('{size}', formatFileSize(totalSize));
}

function updateSendButton() {
	if (!uploadModal) return;
	const sendBtn = $('.file-upload-send-btn', uploadModal);
	if (sendBtn) sendBtn.disabled = selectedFiles.size === 0;
}

on(document, 'keydown', (e) => {
	if (uploadModal && e.key === 'Escape') hideUploadModal();
});

// ==================== Streaming Engine Constants ====================
const DEFAULT_WS_VOLUME_SIZE = 128 * 1024;  // 128KB for WebSocket Relay
const MAX_COMPRESS_FILE_SIZE = 4 * 1024 * 1024;
const MAX_WS_BUFFERED = 2.5 * 1024 * 1024;
const WS_WINDOW_CHUNKS = 36;
const ACK_EVERY_CHUNKS = 10;
const MAX_RESEND_ROUNDS = 5;

window.fileTransfers = new Map();

function arrayBufferToBase64(uint8) {
	const u8 = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < u8.length; i += chunkSize) {
		const chunk = u8.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, chunk);
	}
	return btoa(binary);
}

function base64ToUint8Array(base64) {
	const binary = atob(base64);
	const u8 = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		u8[i] = binary.charCodeAt(i);
	}
	return u8;
}

function generateFileId() {
	return 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

async function calculateHash(data) {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function guessMimeType(fileName = '', fallbackType = '') {
	if (fallbackType && fallbackType !== 'application/octet-stream') return fallbackType;
	const ext = (fileName.includes('.') ? fileName.split('.').pop() : '').toLowerCase();
	const map = {
		mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
		avi: 'video/x-msvideo', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
		ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
		jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
		webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', zip: 'application/zip'
	};
	return map[ext] || fallbackType || 'application/octet-stream';
}

export function getMediaCategory(fileName = '', mimeType = '') {
	const mime = guessMimeType(fileName, mimeType).toLowerCase();
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime.startsWith('image/')) return 'image';
	const ext = (fileName.includes('.') ? fileName.split('.').pop() : '').toLowerCase();
	if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive';
	return 'file';
}

function isIncompressible(file) {
	if (!file) return true;
	if (file.size > MAX_COMPRESS_FILE_SIZE) return true;
	const type = (file.type || '').toLowerCase();
	const name = (file.name || '').toLowerCase();
	if (type.startsWith('video/') || type.startsWith('audio/') || type.startsWith('image/')) return true;
	if (['application/zip', 'application/gzip', 'application/x-7z-compressed', 'application/x-rar', 'application/x-tar', 'application/pdf', 'application/octet-stream'].includes(type)) return true;
	const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
	return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'zip', 'rar', '7z', 'gz', 'bz2', 'xz', 'tar', 'pdf', 'docx', 'xlsx', 'pptx', 'exe', 'dmg', 'iso', 'apk'].includes(ext);
}

function splitToUint8Volumes(uint8, volumeSize) {
	const volumes = [];
	for (let i = 0; i < uint8.length; i += volumeSize) {
		volumes.push(uint8.subarray(i, i + volumeSize));
	}
	if (volumes.length === 0) volumes.push(new Uint8Array(0));
	return volumes;
}

function combineUint8Chunks(chunks) {
	const totalLength = chunks.reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const data of chunks) {
		if (!data) continue;
		combined.set(data, offset);
		offset += data.length;
	}
	return combined;
}

function deflateAsync(data) {
	return new Promise((resolve, reject) => {
		deflate(data, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
	});
}

function inflateAsync(data) {
	return new Promise((resolve, reject) => {
		inflate(data, (err, out) => (err ? reject(err) : resolve(out)));
	});
}

async function prepareSingleFileTransfer(file, volumeSize) {
	const mimeType = guessMimeType(file.name, file.type);
	const skipCompress = isIncompressible(file);

	if (skipCompress) {
		const totalVolumes = Math.max(1, Math.ceil(file.size / volumeSize));
		return {
			sourceFile: file,
			outgoingUint8Volumes: null,
			volumeSize,
			totalVolumes,
			originalSize: file.size,
			compressedSize: file.size,
			originalHash: null,
			compressed: false,
			mimeType
		};
	}

	const arrayBuffer = await file.arrayBuffer();
	const data = new Uint8Array(arrayBuffer);
	const originalHash = await calculateHash(data);
	const compressed = await deflateAsync(data);
	const volumes = splitToUint8Volumes(compressed, volumeSize);
	return {
		sourceFile: file,
		outgoingUint8Volumes: volumes,
		volumeSize,
		totalVolumes: volumes.length,
		originalSize: data.length,
		compressedSize: compressed.length,
		originalHash,
		compressed: true,
		mimeType
	};
}

// Read a single volume as raw Uint8Array on-demand (zero memory accumulation & zero Base64 overhead on P2P!)
async function getOutgoingVolumeUint8(transfer, index) {
	if (transfer.outgoingUint8Volumes && transfer.outgoingUint8Volumes[index] !== undefined) {
		return transfer.outgoingUint8Volumes[index];
	}
	if (transfer.sourceFile) {
		const vSize = transfer.volumeSize || DEFAULT_WS_VOLUME_SIZE;
		const start = index * vSize;
		const end = Math.min(start + vSize, transfer.sourceFile.size);
		if (start >= transfer.sourceFile.size && index === 0) {
			return new Uint8Array(0);
		}
		const buf = await transfer.sourceFile.slice(start, end).arrayBuffer();
		return new Uint8Array(buf);
	}
	return new Uint8Array(0);
}

async function compressFilesToArchive(files, volumeSize) {
	const archiveData = [];
	const fileManifest = [];
	for (const file of files) {
		const fileBuffer = await file.arrayBuffer();
		const nameBytes = new TextEncoder().encode(file.name);
		fileManifest.push({ name: file.name, size: file.size, offset: 0 });
		const nameLengthBytes = new Uint8Array(4);
		new DataView(nameLengthBytes.buffer).setUint32(0, nameBytes.length, true);
		const fileSizeBytes = new Uint8Array(8);
		new DataView(fileSizeBytes.buffer).setBigUint64(0, BigInt(file.size), true);
		archiveData.push(nameLengthBytes, nameBytes, fileSizeBytes, new Uint8Array(fileBuffer));
	}
	const combinedData = combineUint8Chunks(archiveData);
	const archiveHash = await calculateHash(combinedData);
	const allIncompressible = files.every(f => isIncompressible(f));
	if (allIncompressible) {
		const volumes = splitToUint8Volumes(combinedData, volumeSize);
		return { volumes, originalSize: combinedData.length, compressedSize: combinedData.length, archiveHash, fileCount: files.length, fileManifest, compressed: false };
	}
	const compressed = await deflateAsync(combinedData);
	const volumes = splitToUint8Volumes(compressed, volumeSize);
	return { volumes, originalSize: combinedData.length, compressedSize: compressed.length, archiveHash, fileCount: files.length, fileManifest, compressed: true };
}

async function saveBlobViaAndroidBridge(blob, fileName) {
	const bridge = window.SprintMateAndroid;
	if (!bridge || typeof bridge.beginFileSave !== 'function') return false;
	const mime = blob.type || guessMimeType(fileName);
	const token = bridge.beginFileSave(fileName || 'download.bin', mime);
	if (!token) throw new Error('Android storage rejected file creation');
	try {
		const chunkSize = 256 * 1024;
		for (let offset = 0; offset < blob.size; offset += chunkSize) {
			const slice = blob.slice(offset, Math.min(blob.size, offset + chunkSize));
			const buf = await slice.arrayBuffer();
			const ok = bridge.appendFileChunk(token, arrayBufferToBase64(new Uint8Array(buf)));
			if (!ok) throw new Error('Failed writing file chunk');
		}
		const savedPath = bridge.finishFileSave(token);
		if (window.addSystemMsg) {
			window.addSystemMsg(`✓ 已保存到手机下载目录：${savedPath || fileName}`);
		}
		return true;
	} catch (err) {
		try { bridge.abortFileSave && bridge.abortFileSave(token); } catch (_) {}
		throw err;
	}
}

function triggerDownloadUrl(url, fileName) {
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

async function triggerDownloadBlob(blob, fileName) {
	if (window.SprintMateAndroid && typeof window.SprintMateAndroid.beginFileSave === 'function') {
		await saveBlobViaAndroidBridge(blob, fileName);
		return;
	}
	const url = URL.createObjectURL(blob);
	triggerDownloadUrl(url, fileName);
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function assembleReceivedBlob(transfer) {
	if (transfer.blob) return transfer.blob;
	const chunks = transfer.volumeChunks || [];
	const mimeType = guessMimeType(transfer.fileName, transfer.mimeType);
	if (transfer.compressed) {
		const combined = combineUint8Chunks(chunks);
		const decompressed = await inflateAsync(combined);
		if (transfer.originalHash) {
			const calculatedHash = await calculateHash(decompressed);
			if (calculatedHash !== transfer.originalHash) {
				throw new Error('File integrity check failed: hash mismatch');
			}
		}
		transfer.blob = new Blob([decompressed], { type: mimeType });
	} else {
		transfer.blob = new Blob(chunks, { type: mimeType });
	}
	if (!transfer.objectUrl && !transfer.isArchive) {
		transfer.objectUrl = URL.createObjectURL(transfer.blob);
	}
	transfer.volumeChunks = null;
	return transfer.blob;
}

async function decompressArchiveToFiles(transfer) {
	const chunks = transfer.volumeChunks || [];
	const combined = combineUint8Chunks(chunks);
	const decompressed = transfer.compressed ? await inflateAsync(combined) : combined;
	if (transfer.archiveHash) {
		const calculatedHash = await calculateHash(decompressed);
		if (calculatedHash !== transfer.archiveHash) throw new Error('Archive integrity check failed: hash mismatch');
	}
	let dataOffset = 0;
	const extractedFiles = [];
	for (const fileInfo of (transfer.fileManifest || [])) {
		const nameLength = new DataView(decompressed.slice(dataOffset, dataOffset + 4).buffer).getUint32(0, true);
		dataOffset += 4;
		const fileName = new TextDecoder().decode(decompressed.slice(dataOffset, dataOffset + nameLength));
		dataOffset += nameLength;
		const fileSize = Number(new DataView(decompressed.slice(dataOffset, dataOffset + 8).buffer).getBigUint64(0, true));
		dataOffset += 8;
		const fileData = decompressed.slice(dataOffset, dataOffset + fileSize);
		dataOffset += fileSize;
		triggerDownloadBlob(new Blob([fileData], { type: guessMimeType(fileName) }), fileName);
		extractedFiles.push(fileName);
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	return extractedFiles;
}

export function setupFileSend({ attachBtnSelector, onSend }) {
	const attachBtn = document.querySelector(attachBtnSelector);
	if (!attachBtn) return;

	attachBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		showFileUploadModal(async (files) => {
			const rd = roomsData && activeRoomIndex >= 0 ? roomsData[activeRoomIndex] : null;
			const userName = rd ? (rd.myUserName || '') : '';
			const targetClientId = rd ? (rd.privateChatTargetId || null) : null;
			await handleFilesUpload(files, (msg) => onSend({ ...msg, userName }), targetClientId);
		});
	});
}

async function handleFilesUpload(files, onSend, targetClientId = null) {
	if (!files || files.length === 0) return;

	const totalBatchSize = files.reduce((sum, f) => sum + f.size, 0);
	const hasMediaOrLarge = files.some(f => f.size > MAX_COMPRESS_FILE_SIZE || getMediaCategory(f.name, f.type) === 'video');

	if (files.length === 1 || totalBatchSize > 8 * 1024 * 1024 || hasMediaOrLarge) {
		for (const file of files) {
			await sendSingleFileStreaming(file, onSend, targetClientId);
		}
		return;
	}

	const chat = getActiveChat();
	const useP2PBinary = Boolean(chat && chat.canUseBinaryP2P(targetClientId));
	const volumeSize = useP2PBinary ? chat.getMaxP2PChunkSize(targetClientId) : DEFAULT_WS_VOLUME_SIZE;
	const fileId = generateFileId();
	try {
		const { volumes, originalSize, compressedSize, archiveHash, fileCount, fileManifest, compressed } = await compressFilesToArchive(files, volumeSize);
		const fileTransfer = {
			fileId,
			fileName: fileCount + ' files',
			originalSize,
			compressedSize,
			volumeSize,
			totalVolumes: volumes.length,
			sentVolumes: 0,
			ackedVolumes: 0,
			status: 'sending',
			startTime: Date.now(),
			lastUiUpdateAt: 0,
			speedBps: 0,
			archiveHash,
			fileCount,
			fileManifest,
			isArchive: true,
			compressed,
			outgoingUint8Volumes: volumes,
			targetClientId,
			isPrivate: Boolean(targetClientId),
			transportMode: chat ? chat.getTransportMode() : 'relay'
		};
		window.fileTransfers.set(fileId, fileTransfer);

		await onSend({
			type: 'file_start',
			fileId,
			fileName: fileCount + ' files',
			originalSize,
			compressedSize,
			volumeSize,
			totalVolumes: volumes.length,
			archiveHash,
			fileCount,
			fileManifest,
			isArchive: true,
			compressed
		});

		await sendVolumesStreaming(fileId, onSend);
	} catch (error) {
		console.error('File archive error:', error);
		if (window.addSystemMsg) {
			window.addSystemMsg(t('system.file_send_failed', 'Failed to send files:') + ' ' + error.message);
		}
	}
}

async function sendSingleFileStreaming(file, onSend, targetClientId = null) {
	const fileId = generateFileId();
	try {
		const chat = getActiveChat();
		const useP2PBinary = Boolean(chat && chat.canUseBinaryP2P(targetClientId));
		const volumeSize = useP2PBinary ? chat.getMaxP2PChunkSize(targetClientId) : DEFAULT_WS_VOLUME_SIZE;

		const prepared = await prepareSingleFileTransfer(file, volumeSize);
		const category = getMediaCategory(file.name, prepared.mimeType);
		let senderObjectUrl = null;
		if (category === 'video' || category === 'audio' || category === 'image') {
			try { senderObjectUrl = URL.createObjectURL(file); } catch (_) {}
		}

		const fileTransfer = {
			fileId,
			fileName: file.name,
			mimeType: prepared.mimeType,
			sourceFile: prepared.sourceFile,
			outgoingUint8Volumes: prepared.outgoingUint8Volumes,
			volumeSize: prepared.volumeSize,
			originalSize: prepared.originalSize,
			compressedSize: prepared.compressedSize,
			totalVolumes: prepared.totalVolumes,
			sentVolumes: 0,
			ackedVolumes: 0,
			status: 'sending',
			startTime: Date.now(),
			lastUiUpdateAt: 0,
			speedBps: 0,
			originalHash: prepared.originalHash,
			compressed: prepared.compressed,
			objectUrl: senderObjectUrl,
			targetClientId,
			isPrivate: Boolean(targetClientId),
			transportMode: chat ? chat.getTransportMode() : 'relay'
		};
		window.fileTransfers.set(fileId, fileTransfer);

		await onSend({
			type: 'file_start',
			fileId,
			fileName: file.name,
			mimeType: prepared.mimeType,
			volumeSize: prepared.volumeSize,
			originalSize: prepared.originalSize,
			compressedSize: prepared.compressedSize,
			totalVolumes: prepared.totalVolumes,
			originalHash: prepared.originalHash,
			compressed: prepared.compressed
		});

		await sendVolumesStreaming(fileId, onSend);
	} catch (error) {
		console.error('File streaming error:', error);
		if (window.addSystemMsg) {
			window.addSystemMsg(t('system.file_send_failed', 'Failed to send files:') + ' ' + error.message);
		}
	}
}

function getActiveChat() {
	const rd = roomsData && activeRoomIndex >= 0 ? roomsData[activeRoomIndex] : null;
	return (rd && rd.chat) ? rd.chat : null;
}

function waitForAckOrTimeout(transfer, timeoutMs = 900) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			if (transfer._ackResolver === done) transfer._ackResolver = null;
			resolve(false);
		}, timeoutMs);
		function done() {
			clearTimeout(timer);
			transfer._ackResolver = null;
			resolve(true);
		}
		transfer._ackResolver = done;
	});
}

async function sendVolumesStreaming(fileId, onSend) {
	const fileTransfer = window.fileTransfers.get(fileId);
	if (!fileTransfer) return false;

	const total = fileTransfer.totalVolumes;
	const vSize = fileTransfer.volumeSize || DEFAULT_WS_VOLUME_SIZE;

	for (let i = 0; i < total; i++) {
		if (fileTransfer.status === 'cancelled' || fileTransfer.status === 'failed') {
			updateFileProgress(fileId);
			return false;
		}

		const chat = getActiveChat();
		const canBinaryP2P = Boolean(chat && chat.canUseBinaryP2P(fileTransfer.targetClientId));
		fileTransfer.transportMode = chat ? chat.getTransportMode() : 'relay';
		fileTransfer.usingP2P = canBinaryP2P;

		const rawUint8 = await getOutgoingVolumeUint8(fileTransfer, i);

		// FAST PATH: Direct LAN / Hotspot / P2P Native Binary AES-256-GCM (Zero Base64, Event-Driven Drain)
		let sentViaBinaryP2P = false;
		if (canBinaryP2P) {
			await chat.waitForPeerDrain(fileTransfer.targetClientId, 6 * 1024 * 1024);
			if (fileTransfer.status === 'cancelled') return false;
			sentViaBinaryP2P = await chat.sendBinaryFileChunk(
				fileId,
				i,
				rawUint8,
				Boolean(fileTransfer.isPrivate),
				fileTransfer.targetClientId
			);
		}

		// FALLBACK PATH: Cloudflare E2EE WebSocket Relay with Sliding-Window ACK Flow Control
		if (!sentViaBinaryP2P) {
			fileTransfer.usingP2P = false;
			if (chat && typeof chat.getBufferedAmount === 'function') {
				let guard = 0;
				while (chat.isOpen() && chat.getBufferedAmount(fileTransfer.targetClientId) > MAX_WS_BUFFERED) {
					if (fileTransfer.status === 'cancelled') return false;
					await new Promise(r => setTimeout(r, 15));
					if (++guard > 2000) break;
				}
			}

			if (i - fileTransfer.ackedVolumes >= WS_WINDOW_CHUNKS) {
				await waitForAckOrTimeout(fileTransfer, 900);
				if (i - fileTransfer.ackedVolumes >= WS_WINDOW_CHUNKS) {
					fileTransfer.ackedVolumes = Math.max(fileTransfer.ackedVolumes, i - Math.floor(WS_WINDOW_CHUNKS / 2));
				}
			}

			if (fileTransfer.status === 'cancelled') {
				updateFileProgress(fileId);
				return false;
			}

			const volumeData = arrayBufferToBase64(rawUint8);
			const result = await onSend({
				type: 'file_volume',
				fileId,
				volumeIndex: i,
				volumeData,
				isLast: i === total - 1
			});
			if (result === false) {
				fileTransfer.status = 'failed';
				updateFileProgress(fileId);
				return false;
			}
		}

		fileTransfer.sentVolumes = i + 1;
		const now = Date.now();
		if (now - (fileTransfer.lastUiUpdateAt || 0) >= 80 || i === total - 1) {
			fileTransfer.lastUiUpdateAt = now;
			const elapsedSec = Math.max(0.05, (now - fileTransfer.startTime) / 1000);
			const sentBytes = Math.min(fileTransfer.originalSize, fileTransfer.sentVolumes * vSize);
			fileTransfer.speedBps = sentBytes / elapsedSec;
			updateFileProgress(fileId);
		}
	}

	if (fileTransfer.status === 'cancelled') return false;

	// Wait for P2P buffer to flush before declaring completion
	const chat = getActiveChat();
	if (chat && fileTransfer.usingP2P) {
		await chat.waitForPeerDrain(fileTransfer.targetClientId, 512 * 1024);
	}

	await onSend({ type: 'file_complete', fileId });
	fileTransfer.status = 'completed';
	updateFileProgress(fileId);
	return true;
}

export function formatSpeed(bps) {
	if (!bps || bps <= 0) return '';
	return formatFileSize(bps) + '/s';
}

export function getTransportBadgeLabel(mode) {
	if (mode === 'lan') return '⚡ 热点/局域网直连';
	if (mode === 'p2p') return '⚡ P2P 直连';
	return '🔒 E2EE 中继';
}

export function updateFileProgress(fileId) {
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer) return;
	const elements = document.querySelectorAll('[data-file-id="' + fileId + '"]');
	const isSender = !transfer.receivedVolumes;
	const vSize = transfer.volumeSize || DEFAULT_WS_VOLUME_SIZE;

	elements.forEach(element => {
		const progressContainer = element.querySelector('.file-progress-container');
		const progressBar = element.querySelector('.file-progress');
		const statusText = element.querySelector('.file-status');
		const speedText = element.querySelector('.file-speed');
		const percentText = element.querySelector('.file-percent');
		const downloadBtn = element.querySelector('.file-download-btn');
		const cancelBtn = element.querySelector('.file-cancel-btn');
		const badgeEl = element.querySelector('.file-transport-badge');
		const previewContainer = element.querySelector('.file-media-preview');

		if (badgeEl) {
			const mode = transfer.transportMode || (transfer.usingP2P ? 'p2p' : 'relay');
			badgeEl.textContent = getTransportBadgeLabel(mode);
			badgeEl.classList.toggle('is-p2p', mode === 'lan' || mode === 'p2p');
		}

		const hideDownload = () => {
			if (downloadBtn) {
				downloadBtn.classList.remove('show', 'animate-in');
				downloadBtn.style.display = 'none';
			}
		};

		if (transfer.status === 'sending') {
			const progress = transfer.totalVolumes ? Math.min(100, (transfer.sentVolumes / transfer.totalVolumes) * 100) : 100;
			const sentBytes = Math.min(transfer.originalSize, transfer.sentVolumes * vSize);
			if (progressContainer) { progressContainer.style.display = 'block'; progressContainer.classList.remove('fade-out'); }
			if (progressBar) progressBar.style.width = progress.toFixed(1) + '%';
			if (percentText) percentText.textContent = Math.round(progress) + '%';
			if (statusText) statusText.textContent = `${t('file.sending', 'Sending')} · ${formatFileSize(sentBytes)} / ${formatFileSize(transfer.originalSize)}`;
			if (speedText) speedText.textContent = formatSpeed(transfer.speedBps);
			if (cancelBtn) cancelBtn.style.display = 'inline-flex';
			hideDownload();
		} else if (transfer.status === 'receiving') {
			const received = transfer.receivedVolumes ? transfer.receivedVolumes.size : 0;
			const progress = transfer.totalVolumes ? Math.min(100, (received / transfer.totalVolumes) * 100) : 0;
			const recBytes = Math.min(transfer.originalSize, received * vSize);
			if (progressContainer) { progressContainer.style.display = 'block'; progressContainer.classList.remove('fade-out'); }
			if (progressBar) progressBar.style.width = progress.toFixed(1) + '%';
			if (percentText) percentText.textContent = Math.round(progress) + '%';
			if (statusText) statusText.textContent = `${t('file.receiving', 'Receiving')} · ${formatFileSize(recBytes)} / ${formatFileSize(transfer.originalSize)}`;
			if (speedText) speedText.textContent = formatSpeed(transfer.speedBps);
			if (cancelBtn) cancelBtn.style.display = 'inline-flex';
			hideDownload();
		} else if (transfer.status === 'cancelled') {
			if (progressContainer) { progressContainer.style.display = 'block'; progressContainer.classList.remove('fade-out'); }
			if (progressBar) progressBar.style.width = '0%';
			if (statusText) statusText.textContent = t('file.cancelled', 'Transfer cancelled');
			if (speedText) speedText.textContent = '';
			if (percentText) percentText.textContent = '';
			if (cancelBtn) cancelBtn.style.display = 'none';
			hideDownload();
		} else if (transfer.status === 'failed') {
			if (progressContainer) { progressContainer.style.display = 'block'; progressContainer.classList.remove('fade-out'); }
			if (statusText) statusText.textContent = t('file.failed', 'Transfer failed');
			if (speedText) speedText.textContent = '';
			if (cancelBtn) cancelBtn.style.display = 'none';
			hideDownload();
		} else if (transfer.status === 'completed') {
			if (cancelBtn) cancelBtn.style.display = 'none';
			if (progressBar) progressBar.style.width = '100%';
			if (percentText) percentText.textContent = '100%';
			if (speedText) speedText.textContent = formatSpeed(transfer.speedBps);
			if (statusText) {
				statusText.textContent = isSender
					? `✓ ${t('file.sent_complete', 'Sent successfully')}`
					: `✓ ${t('file.received_complete', 'Ready to play / download')}`;
			}
			if (progressContainer) {
				const barWrap = progressContainer.querySelector('.file-progress-bar');
				if (barWrap) barWrap.style.display = 'none';
			}
			if (downloadBtn) {
				downloadBtn.style.display = 'inline-flex';
				downloadBtn.classList.add('show');
				downloadBtn.disabled = false;
			}
			if (previewContainer && transfer.objectUrl && !previewContainer.dataset.rendered) {
				const category = getMediaCategory(transfer.fileName, transfer.mimeType);
				if (category === 'video') {
					previewContainer.dataset.rendered = '1';
					previewContainer.style.display = 'block';
					previewContainer.innerHTML = `<video class="file-inline-video" controls preload="metadata" playsinline src="${transfer.objectUrl}"></video>`;
				} else if (category === 'audio') {
					previewContainer.dataset.rendered = '1';
					previewContainer.style.display = 'block';
					previewContainer.innerHTML = `<audio class="file-inline-audio" controls preload="metadata" src="${transfer.objectUrl}"></audio>`;
				} else if (category === 'image') {
					previewContainer.dataset.rendered = '1';
					previewContainer.style.display = 'block';
					previewContainer.innerHTML = `<img class="file-inline-image bubble-img" src="${transfer.objectUrl}" alt="${transfer.fileName}" />`;
				}
			}
		}
	});
}

export function cancelFileTransfer(fileId) {
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer) return;
	if (transfer.status !== 'sending' && transfer.status !== 'receiving') return;
	transfer.status = 'cancelled';
	transfer.volumeChunks = null;
	transfer.outgoingUint8Volumes = null;
	if (transfer._ackResolver) transfer._ackResolver();
	updateFileProgress(fileId);

	const chat = getActiveChat();
	if (chat) {
		const payload = { type: 'file_cancel', fileId };
		if (transfer.senderClientId) chat.sendClientMessage(transfer.senderClientId, 'file_cancel', payload);
		else if (transfer.targetClientId) chat.sendClientMessage(transfer.targetClientId, 'file_cancel', payload);
		else chat.sendChannelMessage('file_cancel', payload);
	}
}
window.cancelFileTransfer = cancelFileTransfer;

// Direct zero-copy handler for incoming Binary P2P chunks
export function handleBinaryFileChunk({ clientId, fileId, volumeIndex, chunkData }) {
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer || transfer.status === 'cancelled' || transfer.status === 'completed') return;
	if (clientId && !transfer.senderClientId) transfer.senderClientId = clientId;
	if (transfer.receivedVolumes.has(volumeIndex)) return;

	transfer.volumeChunks[volumeIndex] = chunkData;
	transfer.receivedVolumes.add(volumeIndex);

	const chat = getActiveChat();
	if (chat && transfer.senderClientId) {
		transfer.transportMode = chat.getPeerP2PMode(transfer.senderClientId) || 'p2p';
		transfer.usingP2P = true;
	}

	const receivedCount = transfer.receivedVolumes.size;
	const now = Date.now();
	if (now - (transfer.lastUiUpdateAt || 0) >= 80 || receivedCount === transfer.totalVolumes) {
		transfer.lastUiUpdateAt = now;
		const vSize = transfer.volumeSize || DEFAULT_WS_VOLUME_SIZE;
		const elapsedSec = Math.max(0.05, (now - transfer.startTime) / 1000);
		const recBytes = Math.min(transfer.originalSize, receivedCount * vSize);
		transfer.speedBps = recBytes / elapsedSec;
		updateFileProgress(fileId);
	}

	if (transfer.completeReceived && receivedCount === transfer.totalVolumes) {
		finalizeReceivedTransfer(fileId, transfer);
	}
}

export function handleFileMessage(message, isPrivate = false, senderClientId = null) {
	if (!message || typeof message.type !== 'string') return;
	switch (message.type) {
		case 'file_start': handleFileStart(message, isPrivate, senderClientId); break;
		case 'file_volume': handleFileVolume(message, senderClientId); break;
		case 'file_ack': handleFileAck(message); break;
		case 'file_complete': handleFileComplete(message, senderClientId); break;
		case 'file_resend_request': handleFileResendRequest(message, senderClientId); break;
		case 'file_cancel': handleFileCancel(message); break;
	}
}

function handleFileStart(message, isPrivate, senderClientId) {
	const {
		fileId, fileName, mimeType, volumeSize, originalSize, compressedSize,
		totalVolumes, originalHash, archiveHash, fileCount, fileManifest,
		isArchive, compressed, userName
	} = message;

	const chat = getActiveChat();
	const peerMode = (chat && senderClientId) ? (chat.getPeerP2PMode(senderClientId) || 'relay') : 'relay';

	const fileTransfer = {
		fileId,
		fileName,
		mimeType: guessMimeType(fileName, mimeType),
		volumeSize: volumeSize || DEFAULT_WS_VOLUME_SIZE,
		originalSize,
		compressedSize,
		totalVolumes,
		receivedVolumes: new Set(),
		volumeChunks: new Array(totalVolumes),
		status: 'receiving',
		startTime: Date.now(),
		lastUiUpdateAt: 0,
		speedBps: 0,
		originalHash,
		archiveHash,
		fileCount,
		fileManifest,
		isArchive,
		compressed: Boolean(compressed),
		resendRounds: 0,
		userName,
		senderClientId,
		transportMode: peerMode,
		usingP2P: peerMode !== 'relay'
	};
	window.fileTransfers.set(fileId, fileTransfer);

	if (window.addOtherMsg) {
		const displayData = isArchive
			? { type: 'file', fileId, fileName: fileCount + ' files', originalSize, totalVolumes, fileCount, isArchive: true, userName }
			: { type: 'file', fileId, fileName, mimeType: fileTransfer.mimeType, originalSize, totalVolumes, userName };
		window.addOtherMsg(displayData, userName, userName, false, isPrivate ? 'file_private' : 'file');
	}
}

function handleFileVolume(message, senderClientId) {
	const { fileId, volumeIndex, volumeData } = message;
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer || transfer.status === 'cancelled' || transfer.status === 'completed') return;
	if (senderClientId && !transfer.senderClientId) transfer.senderClientId = senderClientId;
	if (transfer.receivedVolumes.has(volumeIndex)) return;

	try {
		transfer.volumeChunks[volumeIndex] = base64ToUint8Array(volumeData);
		transfer.receivedVolumes.add(volumeIndex);
	} catch (err) {
		console.error('Failed to decode volume chunk:', err);
		return;
	}

	const chat = getActiveChat();
	const receivedCount = transfer.receivedVolumes.size;
	const now = Date.now();
	if (now - (transfer.lastUiUpdateAt || 0) >= 80 || receivedCount === transfer.totalVolumes) {
		transfer.lastUiUpdateAt = now;
		const vSize = transfer.volumeSize || DEFAULT_WS_VOLUME_SIZE;
		const elapsedSec = Math.max(0.05, (now - transfer.startTime) / 1000);
		const recBytes = Math.min(transfer.originalSize, receivedCount * vSize);
		transfer.speedBps = recBytes / elapsedSec;
		updateFileProgress(fileId);
	}

	if (chat && (receivedCount % ACK_EVERY_CHUNKS === 0 || receivedCount === transfer.totalVolumes)) {
		const ackPayload = { type: 'file_ack', fileId, receivedCount, lastIndex: volumeIndex };
		if (transfer.senderClientId) chat.sendClientMessage(transfer.senderClientId, 'file_ack', ackPayload);
		else chat.sendChannelMessage('file_ack', ackPayload);
	}

	if (transfer.completeReceived && receivedCount === transfer.totalVolumes) {
		finalizeReceivedTransfer(fileId, transfer);
	}
}

function handleFileAck(message) {
	const { fileId, receivedCount } = message;
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer) return;
	if (typeof receivedCount === 'number' && receivedCount > (transfer.ackedVolumes || 0)) {
		transfer.ackedVolumes = receivedCount;
	}
	if (transfer._ackResolver) transfer._ackResolver();
}

async function finalizeReceivedTransfer(fileId, transfer) {
	if (transfer.status === 'completed') return;
	try {
		if (!transfer.isArchive) await assembleReceivedBlob(transfer);
		transfer.status = 'completed';
		updateFileProgress(fileId);
	} catch (error) {
		console.error('Failed to assemble received file:', error);
		transfer.status = 'failed';
		updateFileProgress(fileId);
	}
}

function handleFileComplete(message, senderClientId) {
	const { fileId } = message;
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer || transfer.status === 'cancelled') return;
	if (senderClientId && !transfer.senderClientId) transfer.senderClientId = senderClientId;
	transfer.completeReceived = true;

	if (transfer.receivedVolumes.size === transfer.totalVolumes) {
		finalizeReceivedTransfer(fileId, transfer);
	} else {
		transfer.status = 'receiving';
		updateFileProgress(fileId);
		requestMissingVolumes(fileId, transfer);
	}
}

function handleFileCancel(message) {
	const { fileId } = message;
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer) return;
	transfer.status = 'cancelled';
	transfer.volumeChunks = null;
	transfer.outgoingUint8Volumes = null;
	if (transfer._ackResolver) transfer._ackResolver();
	updateFileProgress(fileId);
}

function requestMissingVolumes(fileId, transfer) {
	if (transfer.status === 'completed' || transfer.status === 'cancelled') return;
	if (transfer.resendRounds >= MAX_RESEND_ROUNDS) {
		transfer.status = 'failed';
		updateFileProgress(fileId);
		return;
	}
	transfer.resendRounds++;
	const missing = [];
	for (let i = 0; i < transfer.totalVolumes; i++) {
		if (!transfer.receivedVolumes.has(i)) {
			missing.push(i);
			if (missing.length >= 32) break;
		}
	}
	if (missing.length === 0) {
		finalizeReceivedTransfer(fileId, transfer);
		return;
	}
	const chat = getActiveChat();
	if (!chat) return;
	const reqPayload = { type: 'file_resend_request', fileId, missingVolumes: missing };
	if (transfer.senderClientId) chat.sendClientMessage(transfer.senderClientId, 'file_resend_request', reqPayload);
	else chat.sendChannelMessage('file_resend_request', reqPayload);

	setTimeout(() => {
		const tObj = window.fileTransfers.get(fileId);
		if (tObj && tObj.status === 'receiving' && tObj.receivedVolumes.size < tObj.totalVolumes) {
			requestMissingVolumes(fileId, tObj);
		}
	}, 2500);
}

async function handleFileResendRequest(message, requesterClientId) {
	const { fileId, missingVolumes } = message;
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer || (!transfer.outgoingUint8Volumes && !transfer.sourceFile)) return;
	const chat = getActiveChat();
	if (!chat) return;

	for (const idx of (missingVolumes || [])) {
		if (idx >= 0 && idx < transfer.totalVolumes) {
			const rawUint8 = await getOutgoingVolumeUint8(transfer, idx);
			const sentBin = requesterClientId && chat.isPeerP2P(requesterClientId)
				? await chat.sendBinaryFileChunk(fileId, idx, rawUint8, Boolean(transfer.isPrivate), requesterClientId)
				: false;
			if (!sentBin) {
				const volPayload = {
					type: 'file_volume',
					fileId,
					volumeIndex: idx,
					volumeData: arrayBufferToBase64(rawUint8),
					isLast: idx === transfer.totalVolumes - 1
				};
				if (requesterClientId) await chat.sendClientMessage(requesterClientId, 'file_volume', volPayload);
				else await chat.sendChannelMessage('file_volume', volPayload);
			}
		}
	}
}

export async function downloadFile(fileId) {
	const transfer = window.fileTransfers.get(fileId);
	if (!transfer || transfer.status !== 'completed') return;
	try {
		if (transfer.isArchive) {
			await decompressArchiveToFiles(transfer);
		} else if (window.SprintMateAndroid && typeof window.SprintMateAndroid.beginFileSave === 'function') {
			const blob = transfer.blob || transfer.sourceFile || await assembleReceivedBlob(transfer);
			await triggerDownloadBlob(blob, transfer.fileName);
		} else if (transfer.objectUrl) {
			triggerDownloadUrl(transfer.objectUrl, transfer.fileName);
		} else if (transfer.sourceFile) {
			await triggerDownloadBlob(transfer.sourceFile, transfer.fileName);
		} else {
			const blob = await assembleReceivedBlob(transfer);
			await triggerDownloadBlob(blob, transfer.fileName);
		}
	} catch (error) {
		console.error('Download error:', error);
		if (window.addSystemMsg) window.addSystemMsg('Failed to download: ' + error.message);
	}
}

export function formatFileSize(bytes) {
	if (!bytes || bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function setupImageSend(config) {
	setupFileSend(config);
}
