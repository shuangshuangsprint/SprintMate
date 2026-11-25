// Consolidated Frontend Utilities: DOM, String/XSS, Avatar, Emoji, Image Paste, and Theme System
// 前端综合工具模块：DOM操作、字符串安全转义、头像生成、表情选择器、图片粘贴压缩、主题系统

import DOMPurify from 'dompurify';
import * as dicebearCore from '@dicebear/core';
import * as dicebearMicah from '@dicebear/micah';
import 'emoji-picker-element';

// ==================== 1. DOM Utilities ====================
export function $(selector, parent = document) {
	return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
	return parent.querySelectorAll(selector);
}

export function $id(id) {
	return document.getElementById(id);
}

export function createElement(tag, attrs = {}, content = '') {
	const el = document.createElement(tag);
	Object.entries(attrs).forEach(([key, value]) => {
		if (key === 'class' || key === 'className') {
			el.className = value;
		} else if (key === 'style' && typeof value === 'object') {
			Object.assign(el.style, value);
		} else if (key.startsWith('on') && typeof value === 'function') {
			el.addEventListener(key.slice(2).toLowerCase(), value);
		} else {
			el.setAttribute(key, value);
		}
	});
	if (typeof content === 'string') {
		el.innerHTML = content;
	} else if (content instanceof Element) {
		el.appendChild(content);
	}
	return el;
}

export function on(target, event, handler, options) {
	const el = typeof target === 'string' ? $(target) : target;
	if (el) el.addEventListener(event, handler, options);
}

export function off(target, event, handler) {
	const el = typeof target === 'string' ? $(target) : target;
	if (el) el.removeEventListener(event, handler);
}

export function addClass(el, ...classNames) {
	if (el) el.classList.add(...classNames);
}

export function removeClass(el, ...classNames) {
	if (el) el.classList.remove(...classNames);
}

export function toggleClass(el, className, force) {
	if (el) el.classList.toggle(className, force);
}

// ==================== 2. String & Sanitization ====================
export function escapeHTML(str) {
	if (typeof str !== 'string') return '';
	return str.replace(/[&<>"']/g, function(c) {
		return {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		}[c];
	});
}

export function textToHTML(text) {
	if (typeof text !== 'string') return '';
	const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const escaped = escapeHTML(normalized);
	// Preserve exact newlines, blank lines, and indentation (rendered via white-space: pre-wrap)
	return DOMPurify.sanitize(escaped, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: []
	});
}

// ==================== 3. DiceBear Avatar Generator ====================
const bgColors = ['f87171', 'fb923c', '09acf4', 'f472b6', 'a78bfa', '34d399'];

function pickColor(seed = '') {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
	return bgColors[Math.abs(hash) % bgColors.length];
}

export function createAvatarSVG(userName) {
	return dicebearCore.createAvatar(dicebearMicah, {
		seed: userName || 'Anonymous',
		baseColor: ['f7e1c3', 'f9c9b6', 'f2d6cb', 'f8ce8e', 'eac393'],
		backgroundColor: [pickColor(userName || '')]
	}).toString();
}

// ==================== 4. Emoji Picker ====================
const addEmojiPickerStyles = () => {
	if (document.querySelector('#emoji-picker-styles')) return;
	const style = document.createElement('style');
	style.id = 'emoji-picker-styles';
	style.textContent = `emoji-picker{--background:var(--surface,#fff);--border-color:var(--border,rgba(0,0,0,0.1));--border-radius:12px;--emoji-padding:0.4rem;--category-emoji-size:1.2rem;--font-family:var(--font);position:absolute;bottom:60px;left:10px;z-index:50;box-shadow:var(--shadow-3);display:none;opacity:0;transform:translateY(-10px) scale(0.95);transition:opacity 0.25s ease,transform 0.25s ease}emoji-picker.show{opacity:1;transform:translateY(0) scale(1)}`;
	document.head.appendChild(style);
};

export function setupEmojiPicker({
	btnSelector = '.chat-emoji-btn',
	inputSelector = '.input-message-input'
} = {}) {
	const btn = $(btnSelector);
	const input = $(inputSelector);
	if (!btn || !input) return;
	try {
		addEmojiPickerStyles();
		const oldPicker = $('emoji-picker', btn.parentNode);
		if (oldPicker) oldPicker.remove();
		const picker = document.createElement('emoji-picker');
		picker.style.display = 'none';
		btn.parentNode.style.position = 'relative';
		btn.parentNode.appendChild(picker);

		function showPickerWithAnimation() {
			picker.style.display = 'block';
			picker.offsetHeight;
			picker.classList.add('show');
		}

		function hidePickerWithAnimation() {
			picker.classList.remove('show');
			setTimeout(() => {
				picker.style.display = 'none';
			}, 250);
		}

		picker.addEventListener('emoji-click', event => {
			insertEmoji(input, event.detail.unicode);
			hidePickerWithAnimation();
		});

		on(btn, 'click', (ev) => {
			ev.stopPropagation();
			if (picker.style.display === 'none') {
				showPickerWithAnimation();
			} else {
				hidePickerWithAnimation();
			}
		});

		on(document, 'click', (ev) => {
			if (!picker.contains(ev.target) && ev.target !== btn) {
				hidePickerWithAnimation();
			}
		});
	} catch (error) {
		console.error('Failed to initialize emoji picker:', error);
	}
}

function insertEmoji(input, emoji) {
	input.focus();
	if (typeof input.value === 'string' && typeof input.selectionStart === 'number') {
		const start = input.selectionStart;
		const end = input.selectionEnd;
		input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
		const nextPos = start + emoji.length;
		input.setSelectionRange(nextPos, nextPos);
	} else if (document.getSelection && window.getSelection) {
		const sel = window.getSelection();
		if (!sel.rangeCount) return;
		const range = sel.getRangeAt(0);
		range.deleteContents();
		range.insertNode(document.createTextNode(emoji));
		range.collapse(false);
		sel.removeAllRanges();
		sel.addRange(range);
	} else {
		input.innerText += emoji;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ==================== 5. Image Paste & Compression ====================
export async function processImage(file, callback) {
	const img = new Image();
	img.onload = function() {
		const maxW = 1280, maxH = 1280;
		let w = img.naturalWidth, h = img.naturalHeight;
		if (w > maxW || h > maxH) {
			const scale = Math.min(maxW / w, maxH / h);
			w = Math.round(w * scale);
			h = Math.round(h * scale);
		}
		const canvas = createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, w, h);
		const dataUrl = canvas.toDataURL('image/webp', 0.90);
		callback(dataUrl);
	};
	const reader = new FileReader();
	reader.onload = function(e) {
		img.src = e.target.result;
	};
	reader.readAsDataURL(file);
}

function createImagePreview(dataUrl) {
	const preview = createElement('div', { class: 'input-image-preview' });
	const img = createElement('img', { src: dataUrl, class: 'input-image-preview-img' });
	const removeBtn = createElement('button', { class: 'input-image-remove-btn', type: 'button' }, '×');
	preview.appendChild(img);
	preview.appendChild(removeBtn);
	return { preview, removeBtn };
}

export function setupImagePaste(inputSelector) {
	const input = $(inputSelector);
	if (!input) return;

	let currentImageDatas = [];
	const imagePreviewContainer = createElement('div', { class: 'image-preview-container' });
	input.parentNode.insertBefore(imagePreviewContainer, input);

	function updatePlaceholderVisibility() {
		const placeholder = input.parentNode.querySelector('.input-field-placeholder');
		if (!placeholder) return;
		const raw = typeof input.value === 'string' ? input.value : (input.innerText || '');
		const hasText = raw.length > 0;
		const hasImages = currentImageDatas.length > 0;
		if (hasText || hasImages) {
			placeholder.style.opacity = '0';
			input.classList.remove('is-empty');
		} else {
			placeholder.style.opacity = '1';
			input.classList.add('is-empty');
		}
	}

	updatePlaceholderVisibility();
	on(input, 'input', updatePlaceholderVisibility);
	on(input, 'focus', updatePlaceholderVisibility);
	on(input, 'blur', () => setTimeout(updatePlaceholderVisibility, 100));

	on(input, 'paste', function(e) {
		if (!e.clipboardData) return;
		let imageProcessed = false;
		for (const item of e.clipboardData.items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (!file) continue;
				if (file.size > 8 * 1024 * 1024) {
					alert('Image is too large (over 8MB)');
					continue;
				}
				processImage(file, (dataUrl) => {
					const { preview, removeBtn } = createImagePreview(dataUrl);
					imagePreviewContainer.appendChild(preview);
					currentImageDatas.push({ dataUrl, previewElement: preview });
					on(removeBtn, 'click', () => {
						preview.remove();
						currentImageDatas = currentImageDatas.filter(img => img.dataUrl !== dataUrl);
						updatePlaceholderVisibility();
					});
					updatePlaceholderVisibility();
				});
				imageProcessed = true;
			}
		}
		if (imageProcessed) {
			e.preventDefault();
		}
	});

	return {
		getCurrentImages: () => currentImageDatas.map(img => img.dataUrl),
		clearImages: () => {
			imagePreviewContainer.innerHTML = '';
			currentImageDatas = [];
			updatePlaceholderVisibility();
		},
		refreshPlaceholder: updatePlaceholderVisibility
	};
}

// ==================== 6. Theme & Appearance System ====================
export const THEMES = [
	{ id: 'theme1', name: 'Pure Slate', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' },
	{ id: 'theme2', name: 'Ocean Breeze', background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)' },
	{ id: 'theme3', name: 'Emerald Mist', background: 'linear-gradient(135deg, #d1fae5 0%, #ccfbf1 100%)' },
	{ id: 'theme4', name: 'Aurora Violet', background: 'linear-gradient(135deg, #ede9fe 0%, #fae8ff 100%)' },
	{ id: 'theme5', name: 'Warm Sand', background: 'linear-gradient(135deg, #fef3c7 0%, #ffedd5 100%)' },
	{ id: 'theme6', name: 'Rose Quartz', background: 'linear-gradient(135deg, #ffe4e6 0%, #fce7f3 100%)' },
	{ id: 'theme7', name: 'Deep Nord', background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)' }
];

export const THEME_MODES = [
	{ id: 'light', label: 'Light' },
	{ id: 'dark', label: 'Dark' },
	{ id: 'auto', label: 'Auto' }
];

export function getCurrentTheme() {
	try {
		const settings = JSON.parse(localStorage.getItem('settings') || '{}');
		if (!settings.theme) {
			settings.theme = 'theme1';
			localStorage.setItem('settings', JSON.stringify(settings));
			return THEMES[0];
		}
		return THEMES.find(theme => theme.id === settings.theme) || THEMES[0];
	} catch (_) {
		return THEMES[0];
	}
}

export function applyTheme(themeId) {
	const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
	document.documentElement.setAttribute('data-chat-theme', theme.id);
	const mainElement = document.querySelector('.main');
	if (mainElement) {
		mainElement.style.backgroundImage = '';
		mainElement.style.background = '';
		mainElement.setAttribute('data-chat-theme', theme.id);
	}
	return true;
}

export function getThemeMode() {
	try {
		const s = JSON.parse(localStorage.getItem('settings') || '{}');
		return (s.themeMode === 'light' || s.themeMode === 'dark' || s.themeMode === 'auto') ? s.themeMode : 'auto';
	} catch (_) {
		return 'auto';
	}
}

export function resolveThemeMode(mode) {
	if (mode === 'light' || mode === 'dark') return mode;
	try {
		return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
	} catch (_) {
		return 'light';
	}
}

export function applyThemeMode(mode) {
	const resolved = resolveThemeMode(mode);
	document.documentElement.setAttribute('data-theme', resolved);
	document.documentElement.setAttribute('data-theme-mode', mode || 'auto');
	return resolved;
}

export function initThemeMode() {
	const mode = getThemeMode();
	applyThemeMode(mode);
	try {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => {
			if (getThemeMode() === 'auto') applyThemeMode('auto');
		};
		if (mq && typeof mq.addEventListener === 'function') {
			mq.addEventListener('change', handler);
		} else if (mq && typeof mq.addListener === 'function') {
			mq.addListener(handler);
		}
	} catch (_) {}
}

export function initTheme() {
	initThemeMode();
	const currentTheme = getCurrentTheme();
	applyTheme(currentTheme.id);
}
