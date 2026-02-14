const LANGUAGES = {
	en: {
		code: 'en',
		name: 'English',
		flag: '🇺🇸',
		translations: {
			// Meta tags for SEO
			'meta.description': 'SprintMate — E2EE chat where your device encrypts everything (AES-256-GCM). The relay only forwards ciphertext; no database and no message history.',
			'meta.keywords': 'end-to-end encryption, security, chat, WebSocket, Cloudflare Workers, JavaScript, E2EE, anonymous communication, AES, ECDH, RSA, ChaCha20, security, open source, SprintMate, shuaiplus',
			'meta.og_title': 'SprintMate - End-to-End Encrypted Chat System',
			'meta.og_description': 'SprintMate is an end-to-end encrypted chat system. Messages/files are encrypted per recipient with AES-256-GCM. Keys are established via ECDH and strengthened with the room password using HKDF-SHA256. A separate server-session key encrypts traffic to the relay, which never sees plaintext. No database, no history.',
			'meta.twitter_title': 'SprintMate - End-to-End Encrypted Chat System',
			'meta.twitter_description': 'SprintMate is an E2EE chat: your device encrypts messages/files (AES-256-GCM). The relay only forwards ciphertext. Keys use ECDH + HKDF with the room password; no database, no history.',
			
			// Login and main UI
			'ui.enter_node': 'Message in the Wind',
			'ui.username': 'Username',
			'ui.node_name': 'Huddle Room',
			'ui.node_password': 'Encipherment',
			'ui.optional': '(optional)',
			'ui.enter': 'ENTER',
			'ui.connecting': 'Connecting...',
			'ui.public_channel': 'Public Channel',
			'ui.public_channel_auto_join': 'Random username, room: public, no password, auto enter',
			'ui.node_exists': 'Huddle Room already exists',
			'ui.my_name': 'My Name',
			'ui.members': 'Members',
			'ui.message': 'Message',
			'ui.private_message_to': 'Private Message to',
			'ui.me': ' (me)',
			'ui.anonymous': 'Anonymous',
			'ui.start_private_chat': 'Select for private chat',
			'status.connected': 'Secured',
			'status.disconnected': 'Disconnected',
			
			// Settings panel
			'settings.title': 'Settings',
			'settings.notification': 'Notification Settings',
			'settings.theme': 'Theme Settings',
			'settings.chat_appearance': 'Chat Appearance',
			'settings.bubble_opacity': 'Bubble Opacity',
			'settings.my_bubble_opacity': 'My Bubble Opacity',
			'settings.other_bubble_opacity': 'Other Bubble Opacity',
			'settings.language': 'Language Settings',
			'settings.desktop_notifications': 'Desktop Notifications',
			'settings.sound_notifications': 'Sound Notifications',
			'settings.language_switch': 'Language',
			'settings.update_name': 'Update',
			'settings.chinese': 'Chinese',
			'settings.english': 'English',
			
			// File upload and transfer
			'file.selected_files': 'Selected Files',
			'file.clear_all': 'Clear All',
			'file.cancel': 'Cancel',
			'file.send_files': 'Send Files',			'file.sending': 'Sending',
			'file.receiving': 'Receiving',
			'file.files': 'files',
			'file.total': 'Total',
			'file.files_selected': '{count} files selected, {size} total',
			'file.upload_files': 'Upload Files',
			'file.attach_file': 'Attach file',
			'file.no_password_required': 'No password required',
			'file.drag_drop': 'Drag and drop files here',
			'file.or': 'or',
			'file.browse_files': 'browse files',
			
			// Notifications and messages
			'notification.enabled': 'Notifications enabled',
			'notification.alert_here': 'You will receive alerts here.',
			'notification.not_supported': 'Notifications are not supported by your browser.',
			'notification.allow_browser': 'Please allow notifications in your browser settings.',
			'notification.image': '[image]',
			'notification.private': '(Private)',
			
			// Actions and menu
			'action.share': 'Share',
			'action.exit': 'Exit',
			'action.emoji': 'Emoji',
			'action.settings': 'Settings',
			'action.back': 'Back',
			'action.copied': 'Copied to clipboard!',
			'action.share_copied': 'Share link copied!',
			'action.copy_failed': 'Copy failed, text:',
			'action.copy_url_failed': 'Copy failed, url:',
			'action.nothing_to_copy': 'Nothing to copy',
			'action.copy_not_supported': 'Copy not supported in this environment',
			'action.action_failed': 'Action failed. Please try again.',
			'action.cannot_share': 'Cannot share:',
					// System messages
			'system.security_warning': '⚠️ This link uses an old format. Room data is not encrypted.',
			'system.file_send_failed': 'Failed to send files:',
			'system.joined': 'joined the conversation',
			'system.left': 'left the conversation',
			'system.secured': 'connection secured',
			'system.reconnecting': 'Connection lost, reconnecting...',
			'system.resecured': 'Connection restored and secured again',
			'system.private_message_failed': 'Cannot send private message to',
			'system.private_file_failed': 'Cannot send private file to',
			'system.user_not_connected': 'User might not be fully connected.',
					// Help page
			'help.title': 'User Guide',
			'help.back_to_login': 'Back to Login',
			'help.usage_guide': 'User Guide',
			'help.what_is_sprintmate': '🔐 What is SprintMate?',			'help.what_is_sprintmate_desc': 'SprintMate is an E2EE chat system running on Cloudflare Workers Durable Objects. Audit conclusion: no obvious malicious backdoor, no hardcoded secret exfiltration path, and no hidden remote-control logic. It uses standard crypto libraries and protects message/file payloads with AES-256-GCM, with keys derived from ECDH + HKDF (room password).',
			'help.how_to_start': '🚀 Quick Start',
			'help.step_username': 'Enter Username',
			'help.step_username_desc': 'Pick a display name. It is only shared with peers over the encrypted channel and is not stored as an account.',
			'help.step_node_name': 'Set Node Name',
			'help.step_node_name_desc': 'The room identifier. The app uses a hash of it for joining and key context (no plaintext room list on the relay).',
			'help.step_password': 'Set Node Password',
			'help.step_password_desc': 'Never sent to the server. It strengthens key derivation (HKDF-SHA256) so identical room names with different passwords are isolated.',
			'help.step_join': 'Click "Join Room"',
			'help.step_join_desc': 'Your browser generates keys, establishes the server-session channel, then negotiates per-peer E2EE keys before messaging.',
			'help.security_features': '🔑 Security Features',			'help.e2e_encryption': '🛡️ End-to-End Encryption',
			'help.e2e_encryption_desc': 'Messages/files are encrypted per recipient with AES-256-GCM. Keys come from ECDH and are hardened with your room password via HKDF-SHA256. The relay only forwards ciphertext.',
			'help.password_enhanced_encryption': '🔐 Password Enhanced Encryption',
			'help.password_enhanced_encryption_desc': 'Your room password acts as a local strengthening factor in key derivation. It is not transmitted, and helps resist guessing/collision across rooms.',
			'help.no_history': '🚫 Zero History Records',
			'help.no_history_desc': 'The relay does not store chat history. If you refresh/leave, past messages are not retrievable and offline users cannot fetch them later.',
			'help.anonymous_communication': '🎭 Complete Anonymity',
			'help.anonymous_communication_desc': 'No registration. Your chosen nickname is shared only with peers via encrypted messages; the relay does not maintain an identity database.',
			'help.decentralized': '🌐 Decentralized',
			'help.decentralized_desc': 'The relay never decrypts content and can be self-hosted. Cloudflare/relay can still infer metadata like approximate packet size and routing channel.',			'help.usage_tips': '💡 Usage Tips',
			'help.important_note': '⚠️ Important Note',
			'help.room_isolation_note': 'Same room name + different password = different E2EE keys. They are fully isolated rooms and cannot communicate.',
			'help.tip_private_chat': 'Private Chat',
			'help.tip_private_chat_desc': 'Use private chat for one-to-one messaging. Verify the recipient, and use a strong room password if you share the same room with others.',
			'help.tip_group_chat': 'Group Chat',
			'help.tip_group_chat_desc': 'Share the room name and password out-of-band. Rotate the password if it may have leaked, as it influences key derivation.',
			'help.tip_security_reminder': 'Security Reminder',
			'help.tip_security_reminder_desc': 'When deployed behind Cloudflare with HTTPS/WSS, ISP can only see encrypted traffic to Cloudflare and cannot decrypt WebSocket payloads. Operational risk: the share-link password format is weak obfuscation (Base64 + character shift), not real encryption. Avoid sending password-bearing links over unsafe channels.',
			'help.tip_password_strategy': 'Password Strategy',
			'help.tip_password_strategy_desc': 'Use a long, unique passphrase. Room password is never sent to the server and is only used locally to strengthen E2EE key derivation. If leakage is suspected, rotate the room password immediately.',
		}
	},
	zh: {
		code: 'zh',
		name: '中文',
		flag: '🇨🇳',
		translations: {
			// Meta tags for SEO
			'meta.description': 'SprintMate - 端到端加密（E2EE）聊天：所有消息/文件在设备本地用 AES-256-GCM 加密，服务器仅转发密文；无数据库、无历史。',
			'meta.keywords': '端到端加密, 安全, 聊天, WebSocket, Cloudflare Workers, JavaScript, E2EE, 匿名通信, AES, ECDH, RSA, ChaCha20, 安全, 开源, SprintMate, shuaiplus',
			'meta.og_title': 'SprintMate - 端到端加密聊天系统',
			'meta.og_description': 'SprintMate 是端到端加密（E2EE）的聊天系统：消息/文件对每个接收者分别用 AES-256-GCM 加密；密钥由 ECDH 协商并通过房间密码使用 HKDF-SHA256 强化。客户端还会额外协商一把“到中继服务器的会话密钥”来加密传输，服务器只做密文转发、无法读取明文。无数据库、无历史。',
			'meta.twitter_title': 'SprintMate - 端到端加密聊天系统',
			'meta.twitter_description': 'SprintMate 端到端加密（E2EE）：消息/文件本地 AES-256-GCM 加密；密钥 ECDH + HKDF（房间密码参与）；服务器仅转发密文，无数据库、无历史。',
			
			// Login and main UI
			'ui.enter_node': 'E2EE',
			'ui.username': '用户名',
			'ui.node_name': '代号',
			'ui.node_password': '密码',
			'ui.optional': '（可选）',
			'ui.enter': '确定',
			'ui.connecting': '连接中...',
			'ui.public_channel': '公共频道',
			'ui.public_channel_auto_join': '随机用户名，房间 public，无密码，自动进入',
			'ui.node_exists': '此代号已存在',
			'ui.my_name': '我的名字',
			'ui.members': '在线成员',
			'ui.message': '消息',
			'ui.private_message_to': '私信给',
			'ui.me': '（我）',
			'ui.anonymous': '匿名用户',
			'ui.start_private_chat': '选择用户开始私信',
			'status.connected': '已加密连接',
			'status.disconnected': '连接中断',
			
			// Settings panel
			'settings.title': '设置',
			'settings.notification': '通知设置',
			'settings.theme': '主题设置',
			'settings.chat_appearance': '聊天外观',
			'settings.bubble_opacity': '气泡透明度',
			'settings.my_bubble_opacity': '我的气泡透明度',
			'settings.other_bubble_opacity': '对方气泡透明度',
			'settings.language': '语言设置',
			'settings.desktop_notifications': '桌面通知',
			'settings.sound_notifications': '声音通知',
			'settings.language_switch': '语言',
			'settings.update_name': '更新',
			'settings.chinese': '中文',
			'settings.english': 'English',
			
			// File upload and transfer
			'file.selected_files': '已选择的文件',
			'file.clear_all': '清空所有',
			'file.cancel': '取消',
			'file.send_files': '发送文件',			'file.sending': '发送中',
			'file.receiving': '接收中',
			'file.files': '个文件',
			'file.total': '总计',
			'file.files_selected': '选中 {count} 个文件，总计 {size}',
			'file.upload_files': '上传文件',
			'file.attach_file': '附加文件',
			'file.no_password_required': '无需密码',
			'file.drag_drop': '拖拽文件到此处',
			'file.or': '或',
			'file.browse_files': '浏览文件',
			
			// Notifications and messages
			'notification.enabled': '通知已启用',
			'notification.alert_here': '您将在此处收到通知。',
			'notification.not_supported': '您的浏览器不支持通知功能。',
			'notification.allow_browser': '请在浏览器设置中允许通知。',
			'notification.image': '[图片]',
			'notification.private': '（私信）',
			
			// Actions and menu
			'action.share': '分享',
			'action.exit': '退出',
			'action.emoji': '表情',
			'action.settings': '设置',
			'action.back': '返回',
			'action.copied': '已复制！',
			'action.share_copied': '分享链接已复制！',
			'action.copy_failed': '复制失败，文本：',
			'action.copy_url_failed': '复制失败，链接：',
			'action.nothing_to_copy': '没有内容可复制',
			'action.copy_not_supported': '此环境不支持复制功能',
			'action.action_failed': '操作失败，请重试。',
			'action.cannot_share': '无法分享：',
					// System messages
			'system.security_warning': '⚠️ 此链接使用旧格式，房间数据未加密。',
			'system.file_send_failed': '文件发送失败：',
			'system.joined': '加入了对话',
			'system.left': '离开了对话',
			'system.secured': '已建立端到端安全连接',
			'system.reconnecting': '连接已断开，正在重连...',
			'system.resecured': '连接已恢复并重新建立端到端安全连接',
			'system.private_message_failed': '无法发送私信给',
			'system.private_file_failed': '无法发送私密文件给',
			'system.user_not_connected': '用户可能未完全连接。',
			
			// Help page
			'help.title': '使用说明',
			'help.back_to_login': '返回登录',
			'help.usage_guide': '使用说明',
			'help.what_is_sprintmate': '🔐 什么是 SprintMate？',			'help.what_is_sprintmate_desc': 'SprintMate 是运行在 Cloudflare Workers Durable Objects 上的端到端加密聊天系统。安全审计结论：未发现明显恶意后门，未发现硬编码密钥外传路径，也未发现隐藏远程控制逻辑。使用 elliptic、js-sha256 等标准加密库；消息与文件采用 AES-256-GCM 加密，密钥由 ECDH 协商并结合房间密码通过 HKDF 派生。',
			'help.how_to_start': '🚀 快速开始',
			'help.step_username': '输入用户名',
			'help.step_username_desc': '选择显示昵称。该昵称通过加密消息分享给对端，不对应任何账户，也不由服务器保存。',
			'help.step_node_name': '设置代号',
			'help.step_node_name_desc': '房间标识。加入时使用其哈希参与房间定位与密钥上下文（服务器不会保存“明文房间列表”）。',
			'help.step_password': '设置节点密码',
			'help.step_password_desc': '密码不会发送给服务器。它会通过 HKDF-SHA256 参与密钥强化，使“同代号不同密码”的房间完全隔离。',
			'help.step_join': '点击"加入房间"',
			'help.step_join_desc': '浏览器会生成密钥，先建立到中继的会话加密通道，再为每个成员协商端到端密钥后开始通信。',
			'help.security_features': '🔑 安全特性',
			'help.e2e_encryption': '🛡️ 端到端加密',
			'help.e2e_encryption_desc': '消息/文件会针对每个接收者分别用 AES-256-GCM 加密；密钥由 ECDH 协商并结合房间密码通过 HKDF-SHA256 强化。服务器只能转发密文。',
			'help.password_enhanced_encryption': '🔐 密码增强加密',
			'help.password_enhanced_encryption_desc': '房间密码作为本地“密钥强化因子”参与派生过程，不会被传输，可提升抗猜测能力并隔离同名房间。',
			'help.no_history': '🚫 零历史记录',
			'help.no_history_desc': '中继服务器不保存聊天历史。刷新/离开后历史不可取回，离线用户也无法事后拉取消息。',
			'help.anonymous_communication': '🎭 完全匿名',
			'help.anonymous_communication_desc': '无需注册账号。昵称仅在端到端加密消息中向对端展示，服务器不维护身份数据库。',
			'help.decentralized': '🌐 去中心化',
			'help.decentralized_desc': '中继服务器不参与解密，只转发密文；但仍可看到路由信息与大致流量体积等元数据。',			'help.usage_tips': '💡 使用技巧',
			'help.important_note': '⚠️ 重要提示',
			'help.room_isolation_note': '相同代号 + 不同密码 = 不同端到端密钥；它们是完全隔离的房间，无法互通。',
			'help.tip_private_chat': '私人对话',
			'help.tip_private_chat_desc': '私聊是一对一加密发送。请确认对端身份；若同房间有多人，建议使用强密码避免“误入同房间”。',
			'help.tip_group_chat': '群聊',
			'help.tip_group_chat_desc': '通过可信渠道分享代号与密码。若怀疑泄露，请更换密码（它会影响密钥派生）。',
			'help.tip_security_reminder': '安全提醒',
			'help.tip_security_reminder_desc': '在 Cloudflare + HTTPS/WSS 场景下，运营商只能看到到 Cloudflare 的加密连接，无法解密 WebSocket 内容。操作风险提示：ui.js 的分享链接密码采用 simpleEncrypt（Base64 + 字符偏移），这不是强加密，仅是弱混淆。不要通过不安全渠道直接发送含密码链接，建议分渠道传递密码。',
			'help.tip_password_strategy': '密码策略',
			'help.tip_password_strategy_desc': '建议使用足够长且唯一的口令。房间密码仅在本地参与密钥派生，从不发送到服务器；若怀疑泄露，请立即更换房间密码。',
		}
	}
};

// Current language
// 当前语言
let currentLanguage = detectBrowserLanguage();

// Get translation for a key
// 获取翻译文本
export function t(key, fallback = key) {
	const lang = LANGUAGES[currentLanguage];
	if (lang && lang.translations && lang.translations[key]) {
		return lang.translations[key];
	}
	return fallback;
}

// Set current language
// 设置当前语言
export function setLanguage(langCode) {
	if (LANGUAGES[langCode]) {
		currentLanguage = langCode;
		// Update document language attribute
		// 更新文档语言属性
		document.documentElement.lang = langCode;
		
		// Update static HTML texts
		// 更新HTML中的静态文本
		updateStaticTexts();
		
		// Dispatch language change event for other components to listen
		// 派发语言变更事件供其他组件监听
		window.dispatchEvent(new CustomEvent('languageChange', { 
			detail: { language: langCode } 
		}));
	}
}

// Get current language
// 获取当前语言
export function getCurrentLanguage() {
	return currentLanguage;
}

// Get all available languages
// 获取所有可用语言
export function getAvailableLanguages() {
	return Object.keys(LANGUAGES).map(code => ({
		code,
		name: LANGUAGES[code].name,
		flag: LANGUAGES[code].flag
	}));
}

// Initialize i18n with settings
// 根据设置初始化国际化
export function initI18n(settings) {
	if (settings && settings.language && LANGUAGES[settings.language]) {
		setLanguage(settings.language);
	} else {
		// Auto-detect browser language
		// 自动检测浏览器语言
		const browserLang = detectBrowserLanguage();
		setLanguage(browserLang);
	}
}

// Detect browser language and return supported language code
// 检测浏览器语言并返回支持的语言代码
function detectBrowserLanguage() {
	const navigatorLang = navigator.language || navigator.userLanguage || 'en';
	
	// Extract language code (e.g., 'zh-CN' -> 'zh', 'en-US' -> 'en')
	const langCode = navigatorLang.split('-')[0].toLowerCase();
	
	// Check if we support this language
	if (LANGUAGES[langCode]) {
		return langCode;
	}
	
	// Default fallback to English
	return 'en';
}

// Update static HTML text elements
// 更新HTML中的静态文本元素
export function updateStaticTexts() {
	// 如果DOM还没准备好，等待DOM准备好再更新
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => updateStaticTexts());
		return;
	}
	
	// Update login title
	const loginTitle = document.getElementById('login-title');
	if (loginTitle) {
		loginTitle.textContent = t('ui.enter_node', 'Enter a Node');
	}
		// Update login form content with new translations
	const loginFormContainer = document.getElementById('login-form');
	if (loginFormContainer) {
		// Use a custom event to trigger form regeneration instead of dynamic import
		// 使用自定义事件触发表单重新生成，而不是动态导入
		window.dispatchEvent(new CustomEvent('regenerateLoginForm'));
	}
	
	// Update sidebar username label
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) {
		// Use a custom event to update sidebar username instead of dynamic import
		// 使用自定义事件更新侧边栏用户名，而不是动态导入
		window.dispatchEvent(new CustomEvent('updateSidebarUsername'));
	}
		// Update "Enter a Node" text in sidebar
	const joinRoomText = document.getElementById('join-room-text');
	if (joinRoomText) {
		joinRoomText.textContent = t('ui.enter_node', 'Enter a Node');
	}
	
	// Update Members title in rightbar
	const membersTitle = document.getElementById('members-title');
	if (membersTitle) {
		membersTitle.textContent = t('ui.members', 'Members');
	}
	
	// Update settings title
	const settingsTitle = document.getElementById('settings-title');
	if (settingsTitle) {
		settingsTitle.textContent = t('settings.title', 'Settings');
	}
	
	// Update message placeholder
	const messagePlaceholder = document.querySelector('.input-field-placeholder');
	if (messagePlaceholder) {
		messagePlaceholder.textContent = t('ui.message', 'Message');
	}
	
	// Update attach button title
	const attachBtn = document.querySelector('.chat-attach-btn');
	if (attachBtn) {
		attachBtn.title = t('file.attach_file', 'Attach file');
	}
	
	// Update emoji button title
	const emojiBtn = document.querySelector('.chat-emoji-btn');
	if (emojiBtn) {
		emojiBtn.title = t('action.emoji', 'Emoji');
	}
		// Update settings button title
	const settingsBtn = document.getElementById('settings-btn');
	if (settingsBtn) {
		settingsBtn.title = t('action.settings', 'Settings');
		settingsBtn.setAttribute('aria-label', t('action.settings', 'Settings'));
	}
		// Update back button title
	const backBtn = document.getElementById('settings-back-btn');
	if (backBtn) {
		backBtn.title = t('action.back', 'Back');
		backBtn.setAttribute('aria-label', t('action.back', 'Back'));
	}
	
	// Update all elements with data-i18n attribute
	// 更新所有具有data-i18n属性的元素
	const i18nElements = document.querySelectorAll('[data-i18n]');
	i18nElements.forEach(element => {
		const key = element.getAttribute('data-i18n');
		if (key) {
			element.textContent = t(key, element.textContent || key);
		}
	});
	
	// Update all elements with data-i18n-title attribute
	// 更新所有具有data-i18n-title属性的元素
	const i18nTitleElements = document.querySelectorAll('[data-i18n-title]');
	i18nTitleElements.forEach(element => {
		const key = element.getAttribute('data-i18n-title');
		if (key) {
			element.title = t(key, element.title || key);
		}
	});
	
	// Update meta tags
	// 更新meta标签
	updateMetaTags();
}

// Update meta tags with current language
// 使用当前语言更新meta标签
function updateMetaTags() {
	// Update description meta tag
	const metaDescription = document.querySelector('meta[name="description"]');
	if (metaDescription) {
		metaDescription.content = t('meta.description', metaDescription.content);
	}
	
	// Update keywords meta tag
	const metaKeywords = document.querySelector('meta[name="keywords"]');
	if (metaKeywords) {
		metaKeywords.content = t('meta.keywords', metaKeywords.content);
	}
	
	// Update og:title meta tag
	const metaOgTitle = document.querySelector('meta[property="og:title"]');
	if (metaOgTitle) {
		metaOgTitle.content = t('meta.og_title', metaOgTitle.content);
	}
	
	// Update og:description meta tag
	const metaOgDescription = document.querySelector('meta[property="og:description"]');
	if (metaOgDescription) {
		metaOgDescription.content = t('meta.og_description', metaOgDescription.content);
	}
	
	// Update twitter:title meta tag
	const metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
	if (metaTwitterTitle) {
		metaTwitterTitle.content = t('meta.twitter_title', metaTwitterTitle.content);
	}
	
	// Update twitter:description meta tag
	const metaTwitterDescription = document.querySelector('meta[name="twitter:description"]');
	if (metaTwitterDescription) {
		metaTwitterDescription.content = t('meta.twitter_description', metaTwitterDescription.content);
	}
}
