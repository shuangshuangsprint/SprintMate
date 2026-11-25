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
			'ui.enter_node': 'Next-gen E2EE workspace, ready for liftoff',
			'ui.join_new_room': 'Join / Create Room',
			'ui.login_subtitle': 'Zero server storage · AES-256-GCM · LAN & P2P streaming',
			'ui.try_title': 'Create Encrypted Room',
			'ui.try_subtitle': 'Enter creation password to launch a new E2EE room',
			'ui.try_submit': 'Create & Enter',
			'ui.join_title': 'Join Encrypted Room',
			'ui.join_subtitle': 'Enter an existing room code — no password required',
			'ui.join_submit': 'Join Room',
			'ui.tab_try': 'Try · Create',
			'ui.tab_join': 'Join · Enter',
			'ui.switch_to_join': 'Already have a room code? Join directly →',
			'ui.switch_to_try': 'Room not created yet? Switch to Try →',
			'ui.err_pwd_required': 'Please enter the room creation password.',
			'ui.username': 'Username',
			'ui.username_placeholder': 'Enter your display nickname',
			'ui.node_name': 'Room Code',
			'ui.node_name_placeholder': 'e.g. sprint2026',
			'ui.node_password': 'Creation Password',
			'ui.node_password_placeholder': 'Enter room creation password',
			'ui.optional': '(required)',
			'ui.err_room_not_exist_need_pwd': 'Room does not exist yet. Switch to Try with creation password.',
			'ui.err_invalid_create_pwd': 'Invalid room creation password. Cannot create room.',
			'ui.enter': 'Enter Secure Room',
			'ui.connecting': 'Establishing E2EE...',
			'ui.public_channel': 'Quick Public Room',
			'ui.public_channel_auto_join': 'Random username, room: public, no password, auto enter',
			'ui.node_exists': 'You are already in this room',
			'ui.my_name': 'My Name',
			'ui.members': 'Online Members',
			'ui.rooms_header': 'Active Rooms',
			'ui.message': 'Write an encrypted message... (Enter to send, Shift+Enter for newline)',
			'ui.private_message_to': 'Private encrypted message to',
			'ui.private_banner_prefix': 'Private E2EE chat with',
			'ui.exit_private_chat': 'Back to Public Room',
			'ui.private_badge': 'Private',
			'ui.me': ' (me)',
			'ui.anonymous': 'Anonymous',
			'ui.start_private_chat': 'Click any member below to toggle 1-on-1 private chat',
			'ui.random_name': 'Randomize nickname',
			'ui.shared_room_locked': 'Room autofilled from invite link',
			'ui.unlock_room': 'Edit',
			'ui.e2ee_room_notice': 'All messages, long videos, and large files are end-to-end encrypted locally (AES-256-GCM + HKDF). Cloudflare Workers only relays ciphertext with zero storage.',
			'status.connected': 'E2EE Secured',
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
			'settings.update_name': 'Save',
			'settings.chinese': 'Chinese',
			'settings.english': 'English',
			'settings.appearance': 'Theme Mode',
			'settings.mode_light': 'Light',
			'settings.mode_dark': 'Dark',
			'settings.mode_auto': 'Auto',
			'settings.chat_background': 'Canvas Accent',
			
			// File upload and transfer
			'file.selected_files': 'Selected Files',
			'file.clear_all': 'Clear All',
			'file.cancel': 'Cancel',
			'file.send_files': 'Start Encrypted Transfer',
			'file.sending': 'Sending',
			'file.receiving': 'Receiving',
			'file.sent_complete': 'Sent successfully',
			'file.received_complete': 'Ready to play / download',
			'file.cancelled': 'Transfer cancelled',
			'file.failed': 'Transfer failed',
			'file.download': 'Download',
			'file.files': ' files',
			'file.total': 'Total',
			'file.files_selected': '{count} files selected · {size} total',
			'file.upload_files': 'Send Files & Long Videos',
			'file.attach_file': 'Send files or videos',
			'file.no_password_required': 'No password set',
			'file.drag_drop': 'Drag & drop files or long videos here',
			'file.or': 'or',
			'file.browse_files': 'browse local files',
			
			// Notifications and messages
			'notification.enabled': 'Notifications enabled',
			'notification.alert_here': 'You will receive alerts here.',
			'notification.not_supported': 'Notifications are not supported by your browser.',
			'notification.allow_browser': 'Please allow notifications in your browser settings.',
			'notification.image': '[image]',
			'notification.private': '(Private)',
			
			// Actions and menu
			'action.share': 'Copy Invite Link',
			'action.exit': 'Leave Room',
			'action.emoji': 'Emoji',
			'action.settings': 'Settings',
			'action.back': 'Back',
			'action.copied': 'Copied to clipboard!',
			'action.share_copied': 'Encrypted room invite link copied!',
			'action.copy_failed': 'Copy failed, text:',
			'action.copy_url_failed': 'Copy failed, url:',
			'action.nothing_to_copy': 'Nothing to copy',
			'action.copy_not_supported': 'Copy not supported in this environment',
			'action.action_failed': 'Action failed. Please try again.',
			'action.cannot_share': 'Cannot share:',

			// System messages
			'system.security_warning': '⚠️ This link uses an old format. Room data is not encrypted.',
			'system.file_send_failed': 'Failed to send files:',
			'system.joined': 'joined the encrypted room',
			'system.left': 'left the room',
			'system.secured': 'connection secured',
			'system.reconnecting': 'Connection interrupted, auto-reconnecting...',
			'system.resecured': 'Connection restored and E2EE re-established',
			'system.private_message_failed': 'Cannot send private message to',
			'system.private_file_failed': 'Cannot send private file to',
			'system.user_not_connected': 'User might not be fully connected.',

			// Help page
			'help.title': 'Security & Guide',
			'help.back_to_login': 'Back to Login',
			'help.usage_guide': 'Security & Usage Guide',
			'help.what_is_sprintmate': '🔐 What is SprintMate?',
			'help.what_is_sprintmate_desc': 'SprintMate is a serverless end-to-end encrypted communication and large-file streaming platform running on Cloudflare Workers Durable Objects. All messages, videos, and files are encrypted locally with AES-256-GCM using keys derived from ECDH + HKDF (room password).',
			'help.how_to_start': '🚀 Quick Start',
			'help.step_username': 'Choose a Nickname',
			'help.step_username_desc': 'Shared only with room peers inside the encrypted tunnel. No registration required.',
			'help.step_node_name': 'Enter Room Code',
			'help.step_node_name_desc': 'Only the SHA-256 hash of the room code is used for routing.',
			'help.step_password': 'Set Room Password',
			'help.step_password_desc': 'Never leaves your device. Used via HKDF-SHA256 to derive peer keys so rooms with different passwords cannot decrypt each other.',
			'help.step_join': 'Enter & Stream',
			'help.step_join_desc': 'Chat, paste screenshots, or stream large files and long videos with automatic chunked flow control and P2P acceleration.',
			'help.security_features': '🔑 Core Capabilities',
			'help.e2e_encryption': '🛡️ Zero-Knowledge E2EE',
			'help.e2e_encryption_desc': 'Every message and file chunk is encrypted with AES-256-GCM per recipient.',
			'help.password_enhanced_encryption': '🎬 Large File & Long Video Streaming',
			'help.password_enhanced_encryption_desc': 'On-demand 64KB slice streaming with sliding-window ACK flow control and WebRTC P2P acceleration transfers large videos without memory spikes.',
			'help.no_history': '🚫 Zero Server Storage',
			'help.no_history_desc': 'No database and no chat logs. Closing the room leaves zero trace on the server.',
			'help.anonymous_communication': '🎭 Ephemeral & Anonymous',
			'help.anonymous_communication_desc': 'No account, phone number, or email required.',
			'help.decentralized': '🌐 Serverless Architecture',
			'help.decentralized_desc': 'Powered entirely by Cloudflare Workers + WebRTC P2P without physical backend servers.',
			'help.usage_tips': '💡 Best Practices',
			'help.important_note': '⚠️ Isolation Guarantee',
			'help.room_isolation_note': 'Same room code + different password = completely isolated cryptographic keys.',
			'help.tip_private_chat': '1-on-1 Private Mode',
			'help.tip_private_chat_desc': 'Click any member in the right panel to send private messages or files exclusively to them.',
			'help.tip_group_chat': 'Multi-Room Switching',
			'help.tip_group_chat_desc': 'Join multiple rooms simultaneously from the left sidebar and switch seamlessly.',
			'help.tip_security_reminder': 'Invite Link Safety',
			'help.tip_security_reminder_desc': 'For maximum security, share the room password through a separate channel rather than embedding it in public links.',
			'help.tip_password_strategy': 'Strong Passphrases',
			'help.tip_password_strategy_desc': 'Use a unique passphrase for sensitive file transfers.'
		}
	},
	zh: {
		code: 'zh',
		name: '中文',
		flag: '🇨🇳',
		translations: {
			// Meta tags for SEO
			'meta.description': 'SprintMate - 端到端加密（E2EE）通信与大文件直传：所有消息、长视频与文件在本地使用 AES-256-GCM 加密，服务器仅转发密文，无数据库、无历史记录。',
			'meta.keywords': '端到端加密, 安全, 聊天, WebSocket, Cloudflare Workers, JavaScript, E2EE, 匿名通信, AES, ECDH, RSA, 大文件传输, SprintMate',
			'meta.og_title': 'SprintMate - 端到端加密通信与大文件传输系统',
			'meta.og_description': 'SprintMate 是基于 Cloudflare Workers 的无服务器端到端加密通信系统：消息与长视频按需分片加密传输，支持 WebRTC P2P 直连加速与滑动窗口流控。',
			'meta.twitter_title': 'SprintMate - 端到端加密通信系统',
			'meta.twitter_description': 'SprintMate 端到端加密（E2EE）：本地 AES-256-GCM 加密，支持长视频与大文件流式直传，无物理服务器、无历史留存。',
			
			// Login and main UI
			'ui.enter_node': '新一代加密通信平台，助你全速启航',
			'ui.join_new_room': '加入 / 创建新房间',
			'ui.login_subtitle': '无物理服务器 · AES-256-GCM · 热点/局域网高速直传',
			'ui.try_title': '创建加密房间',
			'ui.try_subtitle': '创建新房间需输入创建密码，建好后他人可免密 Join 加入',
			'ui.try_submit': '创建并进入',
			'ui.join_title': '加入已有房间',
			'ui.join_subtitle': '输入已有房间代号即可免密码直接加入',
			'ui.join_submit': '进入加密房间',
			'ui.tab_try': 'Try · 创建房间',
			'ui.tab_join': 'Join · 加入房间',
			'ui.switch_to_join': '已有房间号？直接 Join 免密加入 →',
			'ui.switch_to_try': '房间尚未创建？切换到 Try 创建 →',
			'ui.err_pwd_required': '请输入创建房间密码',
			'ui.username': '您的昵称',
			'ui.username_placeholder': '输入您的显示昵称',
			'ui.node_name': '房间代号',
			'ui.node_name_placeholder': '输入房间代号，如 team888',
			'ui.node_password': '创建房间密码',
			'ui.node_password_placeholder': '请输入创建房间密码',
			'ui.optional': '（必填）',
			'ui.err_room_not_exist_need_pwd': '该房间尚未创建，请切换到 Try 并输入创建密码创建',
			'ui.err_invalid_create_pwd': '创建房间密码错误，无权创建新房间',
			'ui.enter': '进入加密房间',
			'ui.connecting': '正在建立加密链路...',
			'ui.public_channel': '快速体验公共频道',
			'ui.public_channel_auto_join': '随机生成昵称并直接进入 public 公共房间',
			'ui.node_exists': '您已加入该房间代号',
			'ui.my_name': '我的昵称',
			'ui.members': '在线成员',
			'ui.rooms_header': '已连接房间',
			'ui.message': '输入加密消息... (Enter 发送，Shift + Enter 换行，支持粘贴图片或拖拽大文件)',
			'ui.private_message_to': '发送一对一私密消息给',
			'ui.private_banner_prefix': '正在与以下成员一对一私密通信：',
			'ui.exit_private_chat': '返回公共频道',
			'ui.private_badge': '私信',
			'ui.me': '（我）',
			'ui.anonymous': '匿名用户',
			'ui.start_private_chat': '点击下方任意成员即可开启/关闭一对一私密对话',
			'ui.random_name': '随机生成昵称',
			'ui.shared_room_locked': '已从邀请链接自动填入房间信息',
			'ui.unlock_room': '修改',
			'ui.e2ee_room_notice': '当前房间所有消息、长视频与大文件均在本地完成 AES-256-GCM 端到端加密。Cloudflare 边缘节点仅作密文流转，零数据留存。',
			'status.connected': '已加密连接',
			'status.disconnected': '连接已断开',
			
			// Settings panel
			'settings.title': '系统设置',
			'settings.notification': '消息提醒',
			'settings.theme': '主题设置',
			'settings.chat_appearance': '气泡透明度',
			'settings.bubble_opacity': '气泡不透明度',
			'settings.my_bubble_opacity': '我方气泡不透明度',
			'settings.other_bubble_opacity': '对方气泡不透明度',
			'settings.language': '界面语言',
			'settings.desktop_notifications': '桌面弹窗通知',
			'settings.sound_notifications': '新消息提示音',
			'settings.language_switch': '选择语言',
			'settings.update_name': '保存',
			'settings.chinese': '中文',
			'settings.english': 'English',
			'settings.appearance': '明暗外观模式',
			'settings.mode_light': '浅色模式',
			'settings.mode_dark': '深色模式',
			'settings.mode_auto': '跟随系统',
			'settings.chat_background': '聊天画布色调',
			
			// File upload and transfer
			'file.selected_files': '待发送文件列表',
			'file.clear_all': '清空全部',
			'file.cancel': '取消',
			'file.send_files': '开始加密传输',
			'file.sending': '正在发送',
			'file.receiving': '正在接收',
			'file.sent_complete': '已加密发送完成',
			'file.received_complete': '接收完成 · 可直接播放或保存',
			'file.cancelled': '传输已取消',
			'file.failed': '传输中断',
			'file.download': '保存文件',
			'file.files': ' 个文件',
			'file.total': '总大小',
			'file.files_selected': '已选择 {count} 个文件 · 共 {size}',
			'file.upload_files': '发送长视频 / 大文件',
			'file.attach_file': '发送文件或长视频',
			'file.no_password_required': '未设口令',
			'file.drag_drop': '拖拽长视频或任意大文件到此处',
			'file.or': '或者',
			'file.browse_files': '点击选择本地文件',
			
			// Notifications and messages
			'notification.enabled': '通知已启用',
			'notification.alert_here': '您将在此处收到新消息提醒。',
			'notification.not_supported': '您的浏览器不支持桌面通知。',
			'notification.allow_browser': '请在浏览器设置中允许通知权限。',
			'notification.image': '[图片]',
			'notification.private': '（私信）',
			
			// Actions and menu
			'action.share': '复制邀请链接',
			'action.exit': '退出当前房间',
			'action.emoji': '插入表情',
			'action.settings': '打开设置',
			'action.back': '返回',
			'action.copied': '已复制到剪贴板！',
			'action.share_copied': '房间加密邀请链接已复制！',
			'action.copy_failed': '复制失败，文本：',
			'action.copy_url_failed': '复制失败，请手动复制链接：',
			'action.nothing_to_copy': '没有可复制的内容',
			'action.copy_not_supported': '当前环境不支持自动复制',
			'action.action_failed': '操作失败，请重试。',
			'action.cannot_share': '无法分享：',

			// System messages
			'system.security_warning': '⚠️ 此链接使用旧版明文格式，建议重新生成加密分享链接。',
			'system.file_send_failed': '文件发送失败：',
			'system.joined': '已加入加密房间',
			'system.left': '已离开房间',
			'system.secured': '已建立端到端安全连接',
			'system.reconnecting': '网络波动，正在自动重连加密节点...',
			'system.resecured': '连接已恢复，端到端加密通道重新就绪',
			'system.private_message_failed': '无法发送私信给',
			'system.private_file_failed': '无法发送私密文件给',
			'system.user_not_connected': '对方可能尚未完成密钥协商。',
			
			// Help page
			'help.title': '安全架构与使用指南',
			'help.back_to_login': '返回登录',
			'help.usage_guide': '安全架构与使用说明',
			'help.what_is_sprintmate': '🔐 什么是 SprintMate？',
			'help.what_is_sprintmate_desc': 'SprintMate 是运行在 Cloudflare Workers Durable Objects 上的无服务器（Serverless）端到端加密通信与大文件流式传输系统。所有文本、图片、长视频与大文件均在浏览器本地使用 AES-256-GCM 加密，密钥由 ECDH 椭圆曲线协商并结合房间口令通过 HKDF-SHA256 派生。',
			'help.how_to_start': '🚀 快速上手',
			'help.step_username': '填写显示昵称',
			'help.step_username_desc': '昵称仅在端到端加密隧道内向房间成员展示，无需注册账号。',
			'help.step_node_name': '输入房间代号',
			'help.step_node_name_desc': '相同代号的成员进入同一路由通道，服务器仅知晓代号的 SHA-256 哈希值。',
			'help.step_password': '设置加密口令',
			'help.step_password_desc': '口令绝不发送给服务器！仅在本地通过 HKDF-SHA256 强化会话密钥，不同口令完全无法互解。',
			'help.step_join': '进入房间并传文件',
			'help.step_join_desc': '支持群聊、一对一私信、剪贴板粘贴截图，以及长视频/大文件的流式切片直传与在线预览。',
			'help.security_features': '🔑 核心技术亮点',
			'help.e2e_encryption': '🛡️ 零知识端到端加密',
			'help.e2e_encryption_desc': '采用 ECDH (P-384 / Curve25519) + HKDF-SHA256 + AES-256-GCM，每个分片均带独立认证标签。',
			'help.password_enhanced_encryption': '🎬 长视频与大文件流式直传',
			'help.password_enhanced_encryption_desc': '采用按需磁盘切片（64KB/片，零内存堆积）+ 滑动窗口 ACK 流控 + WebRTC P2P 直连加速，轻松传输长视频与超大文件，接收端支持直接在线播放。',
			'help.no_history': '🚫 零数据留存',
			'help.no_history_desc': '无物理服务器、无数据库、不保存任何聊天记录或文件副本，退出即焚。',
			'help.anonymous_communication': '🎭 纯粹匿名体验',
			'help.anonymous_communication_desc': '无需手机号或邮箱，支持一键随机昵称与多房间并发在线。',
			'help.decentralized': '🌐 Cloudflare + P2P 混合架构',
			'help.decentralized_desc': 'NAT 环境允许时自动升级 WebRTC P2P 直连通道；复杂网络下无缝回退 Cloudflare 边缘加密中继。',
			'help.usage_tips': '💡 实用技巧',
			'help.important_note': '⚠️ 房间隔离机制',
			'help.room_isolation_note': '相同房间代号 + 不同加密口令 = 完全不同的端到端密钥，彼此彻底隔离。',
			'help.tip_private_chat': '一对一私密通信',
			'help.tip_private_chat_desc': '在右侧成员列表中点击任意成员，即可向其发送仅对方可解密的私密消息或大文件。',
			'help.tip_group_chat': '多房间同时在线',
			'help.tip_group_chat_desc': '点击左侧「加入 / 创建新房间」可同时连接多个加密房间并随时切换。',
			'help.tip_security_reminder': '安全分享建议',
			'help.tip_security_reminder_desc': '传递高机密信息时，建议仅分享房间代号，并通过另一渠道口头告知加密口令。',
			'help.tip_password_strategy': '口令强度建议',
			'help.tip_password_strategy_desc': '建议使用高强度口令以获得最大抗碰撞与抗暴力破解能力。'
		}
	}
};

let currentLanguage = detectBrowserLanguage();

export function t(key, fallback = key) {
	const lang = LANGUAGES[currentLanguage];
	if (lang && lang.translations && lang.translations[key]) {
		return lang.translations[key];
	}
	return fallback;
}

export function setLanguage(langCode) {
	if (LANGUAGES[langCode]) {
		currentLanguage = langCode;
		document.documentElement.lang = langCode;
		updateStaticTexts();
		window.dispatchEvent(new CustomEvent('languageChange', { 
			detail: { language: langCode } 
		}));
	}
}

export function getCurrentLanguage() {
	return currentLanguage;
}

export function getAvailableLanguages() {
	return Object.keys(LANGUAGES).map(code => ({
		code,
		name: LANGUAGES[code].name,
		flag: LANGUAGES[code].flag
	}));
}

export function initI18n(settings) {
	if (settings && settings.language && LANGUAGES[settings.language]) {
		setLanguage(settings.language);
	} else {
		const browserLang = detectBrowserLanguage();
		setLanguage(browserLang);
	}
}

function detectBrowserLanguage() {
	const navigatorLang = navigator.language || navigator.userLanguage || 'zh';
	const langCode = navigatorLang.split('-')[0].toLowerCase();
	if (LANGUAGES[langCode]) {
		return langCode;
	}
	return 'zh';
}

export function updateStaticTexts() {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => updateStaticTexts());
		return;
	}
	
	const loginTitle = document.getElementById('login-title');
	if (loginTitle) {
		loginTitle.textContent = t('ui.enter_node', 'Secure E2EE Room');
	}

	const loginSubtitle = document.getElementById('login-subtitle');
	if (loginSubtitle) {
		loginSubtitle.textContent = t('ui.login_subtitle', '');
	}

	const loginFormContainer = document.getElementById('login-form');
	if (loginFormContainer) {
		window.dispatchEvent(new CustomEvent('regenerateLoginForm'));
	}
	
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) {
		window.dispatchEvent(new CustomEvent('updateSidebarUsername'));
	}

	const joinRoomText = document.getElementById('join-room-text');
	if (joinRoomText) {
		joinRoomText.textContent = t('ui.join_new_room', 'Join / Create Room');
	}

	const roomsHeaderText = document.getElementById('rooms-section-title');
	if (roomsHeaderText) {
		roomsHeaderText.textContent = t('ui.rooms_header', 'Active Rooms');
	}
	
	const membersTitle = document.getElementById('members-title');
	if (membersTitle) {
		membersTitle.textContent = t('ui.members', 'Online Members');
	}
	
	const settingsTitle = document.getElementById('settings-title');
	if (settingsTitle) {
		settingsTitle.textContent = t('settings.title', 'Settings');
	}
	
	const messagePlaceholder = document.querySelector('.input-field-placeholder');
	if (messagePlaceholder) {
		messagePlaceholder.textContent = t('ui.message', 'Message');
	}
	
	const attachBtn = document.querySelector('.chat-attach-btn');
	if (attachBtn) {
		attachBtn.title = t('file.attach_file', 'Attach file');
	}
	
	const emojiBtn = document.querySelector('.chat-emoji-btn');
	if (emojiBtn) {
		emojiBtn.title = t('action.emoji', 'Emoji');
	}

	const settingsBtn = document.getElementById('settings-btn');
	if (settingsBtn) {
		settingsBtn.title = t('action.settings', 'Settings');
		settingsBtn.setAttribute('aria-label', t('action.settings', 'Settings'));
	}

	const backBtn = document.getElementById('settings-back-btn');
	if (backBtn) {
		backBtn.title = t('action.back', 'Back');
		backBtn.setAttribute('aria-label', t('action.back', 'Back'));
	}

	const langBtnLabel = document.getElementById('login-lang-label');
	if (langBtnLabel) {
		langBtnLabel.textContent = currentLanguage === 'zh' ? 'EN' : '中文';
	}
	
	const i18nElements = document.querySelectorAll('[data-i18n]');
	i18nElements.forEach(element => {
		const key = element.getAttribute('data-i18n');
		if (key) {
			element.textContent = t(key, element.textContent || key);
		}
	});
	
	const i18nTitleElements = document.querySelectorAll('[data-i18n-title]');
	i18nTitleElements.forEach(element => {
		const key = element.getAttribute('data-i18n-title');
		if (key) {
			element.title = t(key, element.title || key);
		}
	});
	
	updateMetaTags();
}

function updateMetaTags() {
	const metaDescription = document.querySelector('meta[name="description"]');
	if (metaDescription) {
		metaDescription.content = t('meta.description', metaDescription.content);
	}
	const metaKeywords = document.querySelector('meta[name="keywords"]');
	if (metaKeywords) {
		metaKeywords.content = t('meta.keywords', metaKeywords.content);
	}
	const metaOgTitle = document.querySelector('meta[property="og:title"]');
	if (metaOgTitle) {
		metaOgTitle.content = t('meta.og_title', metaOgTitle.content);
	}
	const metaOgDescription = document.querySelector('meta[property="og:description"]');
	if (metaOgDescription) {
		metaOgDescription.content = t('meta.og_description', metaOgDescription.content);
	}
	const metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
	if (metaTwitterTitle) {
		metaTwitterTitle.content = t('meta.twitter_title', metaTwitterTitle.content);
	}
	const metaTwitterDescription = document.querySelector('meta[name="twitter:description"]');
	if (metaTwitterDescription) {
		metaTwitterDescription.content = t('meta.twitter_description', metaTwitterDescription.content);
	}
}
