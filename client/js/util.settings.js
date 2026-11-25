import {
	$,
	$$,
	$id,
	createElement,
	on,
	off,
	addClass,
	removeClass,
	THEMES,
	THEME_MODES,
	getCurrentTheme,
	getThemeMode,
	applyTheme,
	applyThemeMode
} from './utils.js';

// Import i18n utilities
// 导入国际化工具函数
import { t, setLanguage, getCurrentLanguage, initI18n } from './util.i18n.js';
// Default settings
// 默认设置
const DEFAULT_SETTINGS = {
	notify: false,
	sound: false,
	theme: 'theme1',
	themeMode: 'light',
	bubbleOpacity: 96,
	bubbleOpacityMe: 96,
	bubbleOpacityOther: 96
	// 注意：我们不设置默认语言，让系统自动检测浏览器语言
	// Note: We don't set a default language, let the system auto-detect browser language
};

// Load settings from localStorage
// 从 localStorage 加载设置
function loadSettings() {
	let s = localStorage.getItem('settings');
	try {
		s = s ? JSON.parse(s) : {}
	} catch {
		s = {}
	}
	return {
		...DEFAULT_SETTINGS,
		...s
	}
}

// Save settings to localStorage
// 保存设置到 localStorage
function saveSettings(settings) {
	const {
		notify,
		sound,
		theme,
		themeMode,
		language,
		bubbleOpacity,
		bubbleOpacityMe,
		bubbleOpacityOther
	} = settings;
	localStorage.setItem('settings', JSON.stringify({
		notify,
		sound,
		theme,
		themeMode,
		language,
		bubbleOpacity,
		bubbleOpacityMe,
		bubbleOpacityOther
	}))
}

// Apply settings to the document
// 应用设置到文档
function applySettings(settings) {
	// Initialize i18n with current language setting
	// 根据当前语言设置初始化国际化
	initI18n(settings);
	const legacyOpacity = typeof settings.bubbleOpacity === 'number' ? settings.bubbleOpacity : DEFAULT_SETTINGS.bubbleOpacity;
	const meOpacity = typeof settings.bubbleOpacityMe === 'number' ? settings.bubbleOpacityMe : legacyOpacity;
	const otherOpacity = typeof settings.bubbleOpacityOther === 'number' ? settings.bubbleOpacityOther : legacyOpacity;
	const normalizedMeOpacity = Math.min(100, Math.max(35, meOpacity)) / 100;
	const normalizedOtherOpacity = Math.min(100, Math.max(35, otherOpacity)) / 100;
	document.documentElement.style.setProperty('--chat-bubble-opacity', (legacyOpacity / 100).toFixed(2));
	document.documentElement.style.setProperty('--chat-bubble-opacity-me', normalizedMeOpacity.toFixed(2));
	document.documentElement.style.setProperty('--chat-bubble-opacity-other', normalizedOtherOpacity.toFixed(2));
}

// Ask for browser notification permission
// 请求浏览器通知权限
function askNotificationPermission(callback) {
	if (Notification.requestPermission.length === 0) {
		Notification.requestPermission().then(callback)
	} else {
		Notification.requestPermission(callback)
	}
}

// Setup the settings panel UI
// 设置设置面板 UI
function setupSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const settingsContent = $id('settings-content');
	const settingsTitle = $id('settings-title');
	if (!settingsSidebar || !settingsContent) return;

	const settings = loadSettings();
	
	// Update settings title
	// 更新设置标题
	if (settingsTitle) {
		settingsTitle.textContent = t('settings.title', 'Settings');
	}// Create settings content HTML
	const currentDisplayedName = ((($id('sidebar-username') && $id('sidebar-username').textContent) || ($id('userName') && $id('userName').value) || '')).trim();
	settingsContent.innerHTML = `
		<div class="settings-section">
			<div class="settings-section-title">${t('ui.my_name', 'My Name')}</div>
			<div class="settings-item settings-item-column">
				<div class="settings-inline-actions">
					<input type="text" id="settings-username-input" class="settings-text-input" maxlength="15" placeholder="${t('ui.username', 'Username')}" value="${currentDisplayedName}">
					<button type="button" id="settings-username-save" class="settings-action-btn">${t('settings.update_name', 'Update')}</button>
				</div>
			</div>
		</div>

		<div class="settings-section">
			<div class="settings-section-title">${t('settings.notification', 'Notification Settings')}</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.desktop_notifications', 'Desktop Notifications')}</div>
				</div>
				<label class="switch">
					<input type="checkbox" id="settings-notify" ${settings.notify ? 'checked' : ''}>
					<span class="slider"></span>
				</label>
			</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.sound_notifications', 'Sound Notifications')}</div>
				</div>
				<label class="switch">
					<input type="checkbox" id="settings-sound" ${settings.sound ? 'checked' : ''}>
					<span class="slider"></span>
				</label>
			</div>
		</div>
				<div class="settings-section">
			<div class="settings-section-title">${t('settings.language', 'Language Settings')}</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.language_switch', 'Language')}</div>
				</div>
				<div class="language-selector">
					<select id="settings-language" class="language-select">
						<option value="en" ${settings.language === 'en' ? 'selected' : ''}>🇺🇸 English</option>
						<option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>🇨🇳 中文</option>
					</select>
				</div>
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.appearance', 'Appearance')}</div>
			<div class="theme-mode-selector" id="theme-mode-selector">
				${THEME_MODES.map(mode => {
					const icons = { light: '☀️', dark: '🌙', auto: '🖥️' };
					const labels = { light: t('settings.mode_light', 'Light'), dark: t('settings.mode_dark', 'Dark'), auto: t('settings.mode_auto', 'Auto') };
					return '<button type="button" class="theme-mode-item ' + (getThemeMode() === mode.id ? 'active' : '') + '" data-mode="' + mode.id + '"><span class="theme-mode-icon">' + (icons[mode.id] || '') + '</span><span class="theme-mode-label">' + (labels[mode.id] || mode.label) + '</span></button>';
				}).join('')}
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.chat_background', 'Chat Background')}</div>
			<div class="theme-selector" id="theme-selector">
				${THEMES.map(theme => `
					<div class="theme-item ${settings.theme === theme.id ? 'active' : ''}" data-theme-id="${theme.id}" style="background: ${theme.background}; background-size: cover; background-position: center;">
					</div>
				`).join('')}
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.chat_appearance', 'Chat Appearance')}</div>
			<div class="settings-item settings-item-column">
				<div class="settings-item-label settings-item-label-full">
					<div>${t('settings.my_bubble_opacity', 'My Bubble Opacity')}</div>
				</div>
				<div class="settings-range-wrap">
					<input type="range" id="settings-bubble-opacity-me" min="35" max="100" step="1" value="${typeof settings.bubbleOpacityMe === 'number' ? settings.bubbleOpacityMe : (typeof settings.bubbleOpacity === 'number' ? settings.bubbleOpacity : DEFAULT_SETTINGS.bubbleOpacityMe)}">
					<span id="settings-bubble-opacity-me-value">${typeof settings.bubbleOpacityMe === 'number' ? settings.bubbleOpacityMe : (typeof settings.bubbleOpacity === 'number' ? settings.bubbleOpacity : DEFAULT_SETTINGS.bubbleOpacityMe)}%</span>
				</div>
			</div>
			<div class="settings-item settings-item-column">
				<div class="settings-item-label settings-item-label-full">
					<div>${t('settings.other_bubble_opacity', 'Other Bubble Opacity')}</div>
				</div>
				<div class="settings-range-wrap">
					<input type="range" id="settings-bubble-opacity-other" min="35" max="100" step="1" value="${typeof settings.bubbleOpacityOther === 'number' ? settings.bubbleOpacityOther : (typeof settings.bubbleOpacity === 'number' ? settings.bubbleOpacity : DEFAULT_SETTINGS.bubbleOpacityOther)}">
					<span id="settings-bubble-opacity-other-value">${typeof settings.bubbleOpacityOther === 'number' ? settings.bubbleOpacityOther : (typeof settings.bubbleOpacity === 'number' ? settings.bubbleOpacity : DEFAULT_SETTINGS.bubbleOpacityOther)}%</span>
				</div>
			</div>
		</div>
	`; 	const notifyCheckbox = $('#settings-notify', settingsContent);
	const soundCheckbox = $('#settings-sound', settingsContent);
	const languageSelect = $('#settings-language', settingsContent);
	const usernameInput = $('#settings-username-input', settingsContent);
	const usernameSaveBtn = $('#settings-username-save', settingsContent);
	const bubbleOpacityMeSlider = $('#settings-bubble-opacity-me', settingsContent);
	const bubbleOpacityMeValue = $('#settings-bubble-opacity-me-value', settingsContent);
	const bubbleOpacityOtherSlider = $('#settings-bubble-opacity-other', settingsContent);
	const bubbleOpacityOtherValue = $('#settings-bubble-opacity-other-value', settingsContent);

	const submitUsernameUpdate = () => {
		if (!usernameInput || !usernameSaveBtn) return;
		const nextName = usernameInput.value.trim();
		const hasWhitespace = /\s/.test(nextName);
		if (!nextName || hasWhitespace) {
			usernameInput.style.borderColor = '#e74c3c';
			return;
		}
		usernameInput.style.borderColor = '';
		let updated = false;
		if (typeof window.updateCurrentUserName === 'function') {
			updated = window.updateCurrentUserName(nextName) === true;
		}
		const loginUsername = $id('userName');
		if (loginUsername) {
			loginUsername.value = nextName;
		}
		if (updated || !window.updateCurrentUserName) {
			usernameSaveBtn.classList.add('saved');
			setTimeout(() => usernameSaveBtn.classList.remove('saved'), 1000);
		}
	};

	if (usernameSaveBtn) {
		on(usernameSaveBtn, 'click', submitUsernameUpdate);
	}
	if (usernameInput) {
		on(usernameInput, 'keydown', e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submitUsernameUpdate();
			}
		});
	}

	if (bubbleOpacityMeSlider && bubbleOpacityMeValue) {
		on(bubbleOpacityMeSlider, 'input', e => {
			const value = parseInt(e.target.value, 10);
			if (Number.isNaN(value)) return;
			settings.bubbleOpacityMe = value;
			bubbleOpacityMeValue.textContent = `${value}%`;
			applySettings(settings);
			saveSettings(settings);
		});
	}

	if (bubbleOpacityOtherSlider && bubbleOpacityOtherValue) {
		on(bubbleOpacityOtherSlider, 'input', e => {
			const value = parseInt(e.target.value, 10);
			if (Number.isNaN(value)) return;
			settings.bubbleOpacityOther = value;
			bubbleOpacityOtherValue.textContent = `${value}%`;
			applySettings(settings);
			saveSettings(settings);
		});
	}
	
	// Language select event handler
	// 语言选择事件处理
	on(languageSelect, 'change', e => {
		const newLanguage = e.target.value;
		settings.language = newLanguage;
		
		// Set language immediately
		// 立即设置语言
		setLanguage(newLanguage);
		
		// Save settings
		// 保存设置
		saveSettings(settings);
		applySettings(settings);
		
		// Refresh the settings panel to show updated translations
		// 刷新设置面板以显示更新的翻译
		setTimeout(() => {
			setupSettingsPanel();
		}, 100);
	});
	
	on(notifyCheckbox, 'change', e => {
		const checked = e.target.checked;
		if (checked) {
			if (!('Notification' in window)) {
				alert('Notifications are not supported by your browser.');
				e.target.checked = false;
				return
			}
			askNotificationPermission(permission => {
				if (permission === 'granted') {
					settings.notify = true;
					settings.sound = false;
					if (soundCheckbox) soundCheckbox.checked = false;
					saveSettings(settings);
					applySettings(settings);					// 防止重复通知，添加一个标志位
					if (!settingsSidebar._notificationShown) {
						new Notification('Notifications enabled', {
							body: 'You will receive alerts here.'
						});
						settingsSidebar._notificationShown = true; // 设置标志位
					}
				} else {
					settings.notify = false;
					e.target.checked = false;
					saveSettings(settings);
					applySettings(settings);
					alert('Please allow notifications in your browser settings.')
				}
			})
		} else {
			settings.notify = false;
			saveSettings(settings);
			applySettings(settings);			// 重置标志位
			if (settingsSidebar._notificationShown) {
				settingsSidebar._notificationShown = false;
			}
		}
	});	on(soundCheckbox, 'change', e => {
		settings.sound = e.target.checked;
		if (settings.sound) {
			settings.notify = false;
			if (notifyCheckbox) notifyCheckbox.checked = false;
		}
		saveSettings(settings);
		applySettings(settings)
	});
	// Appearance mode event handlers
	// 明暗主题切换事件
	const themeModeSelector = $('#theme-mode-selector', settingsContent);
	if (themeModeSelector) {
		const modeItems = themeModeSelector.querySelectorAll('.theme-mode-item');
		modeItems.forEach(item => {
			on(item, 'click', () => {
				const mode = item.dataset.mode;
				if (!mode) return;
				settings.themeMode = mode;
				applyThemeMode(mode);
				saveSettings(settings);
				modeItems.forEach(mi => mi.classList.remove('active'));
				item.classList.add('active');
			});
		});
	}

	// Theme selection event handlers
	// 主题选择事件处理
	const themeSelector = $('#theme-selector', settingsContent);
	if (themeSelector) {
		// Custom scrolling functionality
		// 自定义滚动功能
		let isDragging = false;
		let startX = 0;
		let scrollLeft = 0;

		// Mouse wheel scrolling (vertical -> horizontal)
		// 鼠标滚轮滚动（垂直转水平）
		on(themeSelector, 'wheel', e => {
			e.preventDefault();
			const scrollAmount = e.deltaY * 0.5; // Adjust scroll sensitivity
			themeSelector.scrollLeft += scrollAmount;
		});
		// Mouse drag scrolling
		// 鼠标拖拽滚动
		let dragStartTime = 0;
		let hasDragged = false;
		
		on(themeSelector, 'mousedown', e => {
			isDragging = true;
			hasDragged = false;
			dragStartTime = Date.now();
			startX = e.pageX - themeSelector.offsetLeft;
			scrollLeft = themeSelector.scrollLeft;
			themeSelector.classList.add('dragging');
			e.preventDefault(); // Prevent text selection
		});
		on(document, 'mousemove', e => {
			if (!isDragging) return;
			e.preventDefault();
			const x = e.pageX - themeSelector.offsetLeft;
			const walk = (x - startX) * 2; // Scroll speed multiplier
			const moved = Math.abs(walk);
			
			// If moved more than 5px, consider it a drag
			if (moved > 5) {
				hasDragged = true;
			}
			
			themeSelector.scrollLeft = scrollLeft - walk;
		});

		on(document, 'mouseup', () => {
			if (isDragging) {
				isDragging = false;
				themeSelector.classList.remove('dragging');
			}
		});
		// Touch support for mobile
		// 移动端触摸支持
		let touchStartX = 0;
		let touchScrollLeft = 0;
		let touchStartTime = 0;
		let touchHasMoved = false;

		on(themeSelector, 'touchstart', e => {
			touchStartX = e.touches[0].clientX;
			touchScrollLeft = themeSelector.scrollLeft;
			touchStartTime = Date.now();
			touchHasMoved = false;
		});

		on(themeSelector, 'touchmove', e => {
			e.preventDefault();
			const touchX = e.touches[0].clientX;
			const walk = (touchStartX - touchX) * 1.5; // Touch scroll sensitivity
			
			// If moved more than 10px, consider it a swipe
			if (Math.abs(walk) > 10) {
				touchHasMoved = true;
			}
			
			themeSelector.scrollLeft = touchScrollLeft + walk;
		});

		// Handle touch end for theme selection
		// 处理触摸结束的主题选择
		on(themeSelector, 'touchend', e => {
			// If user swiped, don't trigger theme selection
			// 如果用户滑动过，不触发主题选择
			if (touchHasMoved) {
				touchHasMoved = false;
				return;
			}
			
			// Check if it was a quick tap
			// 检查是否是快速点击
			const tapDuration = Date.now() - touchStartTime;
			if (tapDuration > 300) {
				return;
			}
			
			const themeItem = e.target.closest('.theme-item');
			if (themeItem) {
				const themeId = themeItem.dataset.themeId;
				if (themeId && themeId !== settings.theme) {
					// Update active state
					$$('.theme-item', themeSelector).forEach(item => {
						item.classList.remove('active');
					});
					themeItem.classList.add('active');
					
					// Apply theme and save settings
					settings.theme = themeId;
					applyTheme(themeId);
					saveSettings(settings);
				}
			}
		});
		// Theme selection click handler
		// 主题选择点击处理器
		on(themeSelector, 'click', e => {
			// If user just dragged, don't trigger theme selection
			// 如果用户刚刚拖拽过，不触发主题选择
			if (hasDragged) {
				hasDragged = false;
				return;
			}
			
			// Also check if it was a quick click (less than 200ms and minimal movement)
			// 同时检查是否是快速点击（少于200ms且移动很少）
			const clickDuration = Date.now() - dragStartTime;
			if (clickDuration > 200) {
				return;
			}
			
			const themeItem = e.target.closest('.theme-item');
			if (themeItem) {
				const themeId = themeItem.dataset.themeId;
				if (themeId && themeId !== settings.theme) {
					// Update active state
					$$('.theme-item', themeSelector).forEach(item => {
						item.classList.remove('active');
					});
					themeItem.classList.add('active');
					
					// Apply theme and save settings
					settings.theme = themeId;
					applyTheme(themeId);
					saveSettings(settings);
				}
			}
		});
	}
}

// Check if device is mobile
function isMobile() {
	return window.innerWidth <= 768;
}

// Open the settings panel
// 打开设置面板
function openSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const sidebar = $id('sidebar');
	const sidebarMask = $id('mobile-sidebar-mask');
	
	if (!settingsSidebar || !sidebar) return;
	
	if (isMobile()) {
		// Mobile: hide main sidebar and show settings sidebar with mask
		sidebar.classList.remove('mobile-open');
		settingsSidebar.style.display = 'flex';
		// Force reflow then add animation class
		settingsSidebar.offsetHeight;
		settingsSidebar.classList.add('mobile-open');
		if (sidebarMask) {
			sidebarMask.classList.add('active');
		}	} else {
		// Desktop: show settings sidebar as overlay with slide animation
		settingsSidebar.style.display = 'flex';
		// Force reflow then slide in
		settingsSidebar.offsetHeight;
		settingsSidebar.classList.add('open');
		// Keep main sidebar visible - settings sidebar is an overlay
	}
	
	// Setup settings content
	setupSettingsPanel();
}

// Close the settings panel
// 关闭设置面板
function closeSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const sidebarMask = $id('mobile-sidebar-mask'); // mobile-sidebar-mask is used for settings on mobile

	if (!settingsSidebar) return;

	const animationEnded = () => {
		settingsSidebar.style.display = 'none';
		settingsSidebar.removeEventListener('transitionend', animationEnded);
	};

	if (isMobile()) {
		settingsSidebar.classList.remove('mobile-open');
		if (sidebarMask) {
			sidebarMask.classList.remove('active');
		}
		// Listen for transition end to set display none
		settingsSidebar.addEventListener('transitionend', animationEnded);
		// Fallback if transitionend doesn't fire (e.g., if no transition is defined or display:none is set too early by other means)
		setTimeout(() => {
			if (!settingsSidebar.classList.contains('mobile-open')) { // check if it wasn't reopened
				settingsSidebar.style.display = 'none';
			}
		}, 350); // Slightly longer than CSS transition
	} else {
		settingsSidebar.classList.remove('open');
		// Listen for transition end to set display none
		settingsSidebar.addEventListener('transitionend', animationEnded);
		// Fallback
		setTimeout(() => {
			if (!settingsSidebar.classList.contains('open')) { // check if it wasn't reopened
				settingsSidebar.style.display = 'none';
			}
		}, 350);
	}
}

// Initialize settings on page load
// 页面加载时初始化设置
function initSettings() {
	const settings = loadSettings();
	applySettings(settings);
	
	// Apply theme from settings
	// 从设置中应用主题
	if (settings.theme) {
		applyTheme(settings.theme);
	}
	// Apply light/dark appearance mode early (avoid flash)
	// 尽早应用明暗主题模式（避免闪烁）
	applyThemeMode(getThemeMode());
	
	// Listen for language change events to update UI
	// 监听语言变更事件以更新UI
	window.addEventListener('languageChange', () => {
		// Update settings title if settings panel is open
		// 如果设置面板已打开，更新设置标题
		const settingsTitle = $id('settings-title');
		if (settingsTitle) {
			settingsTitle.textContent = t('settings.title', 'Settings');
		}
	});
}

// Maximum notification text length
// 通知文本最大长度
const MAX_NOTIFY_TEXT_LEN = 100;

// Truncate text for notifications
// 截断通知文本
function truncateText(text) {
	const str = typeof text === 'string' ? text : '';
	return str.length > MAX_NOTIFY_TEXT_LEN ? str.slice(0, MAX_NOTIFY_TEXT_LEN) + '...' : str;
}

// Play sound notification
// 播放声音通知
function playSoundNotification() {
	try {
		const ctx = new(window.AudioContext || window.webkitAudioContext)();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = 1000;
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
		setTimeout(() => {
			osc.stop();
			ctx.close()
		}, 600)
	} catch (e) {
		console.error('Sound notification failed', e)
	}
}

// Show desktop notification
// 显示桌面通知
function showDesktopNotification(roomName, text, msgType, sender) {
	if (!('Notification' in window) || Notification.permission !== 'granted') return;
	let body;
	const senderPrefix = sender ? `${sender}:` : '';
	if (msgType === 'image' || msgType === 'private image') {
		body = `${senderPrefix}${t('notification.image', '[image]')}`;
		if (msgType === 'private image') {
			body = `${t('notification.private', '(Private)')}${body}`;
		}
	} else if (msgType === 'voice' || msgType === 'private voice') {
		const dur = (text && typeof text === 'object' && text.duration) ? ` ${Math.max(1, Math.round(text.duration))}s` : '';
		body = `${senderPrefix}[语音消息${dur}]`;
		if (msgType === 'private voice') {
			body = `${t('notification.private', '(Private)')}${body}`;
		}
	} else if (msgType === 'file' || msgType === 'private file') {
		body = `${senderPrefix}[文件] ${truncateText(text)}`;
		if (msgType === 'private file') {
			body = `${t('notification.private', '(Private)')}${body}`;
		}
	} else if (msgType === 'text' || msgType === 'private text') {
		body = `${senderPrefix}${truncateText(text)}`;
		if (msgType === 'private text') {
			body = `${t('notification.private', '(Private)')}${body}`;
		}
	} else {
		body = truncateText(text);
	}
	new Notification(`#${roomName}`, {
		body
	});
}

// Notify message entry point
// 通知消息主入口
export function notifyMessage(roomName, msgType, text, sender) {
	const settings = loadSettings();
	if (settings.notify) {
		showDesktopNotification(roomName, text, msgType, sender)
	} else if (settings.sound) {
		playSoundNotification()
	}
}
export {
	openSettingsPanel,
	closeSettingsPanel,
	initSettings
};