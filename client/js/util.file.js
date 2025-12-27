// Import necessary modules
// 导入必要的模块
import { deflate, inflate } from 'fflate';
import { showFileUploadModal } from './util.fileUpload.js';
import { roomsData, activeRoomIndex } from './room.js';

// Derive an encryption key from a password using PBKDF2
async function deriveKeyFromPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Encrypt a data chunk using AES-GCM
async function encryptChunk(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV is recommended for GCM
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
    );
    return {
        encryptedData: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv)
    };
}

// Decrypt a data chunk using AES-GCM
async function decryptChunk(encryptedData, key, iv) {
    const encryptedBuffer = base64ToArrayBuffer(encryptedData);
    const ivBuffer = base64ToArrayBuffer(iv);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        encryptedBuffer
    );
    return new Uint8Array(decrypted);
}

// Generate unique file ID
// 生成唯一文件ID
function generateFileId() {
	return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Base64 encoding for binary data (more efficient than hex)
// Base64编码用于二进制数据（比十六进制更高效）
function arrayBufferToBase64(buffer) {
	const uint8Array = new Uint8Array(buffer);
	let binary = '';
	const chunkSize = 0x8000; // 32KB chunks to avoid call stack limits
	
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		const chunk = uint8Array.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, chunk);
	}
	
	return btoa(binary);
}

// Base64 decoding back to binary
// Base64解码回二进制数据
function base64ToArrayBuffer(base64) {
	const binary = atob(base64);
	const uint8Array = new Uint8Array(binary.length);
	
	for (let i = 0; i < binary.length; i++) {
		uint8Array[i] = binary.charCodeAt(i);
	}
	
	return uint8Array;
}

// Calculate SHA-256 hash for data integrity verification
// 计算SHA-256哈希值用于数据完整性验证
async function calculateHash(data) {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compress file into volumes with optimized compression
// 将文件压缩为分卷，优化压缩算法
async function compressAndEncryptFileToVolumes(file, password, volumeSize = DEFAULT_VOLUME_SIZE) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = new Uint8Array(e.target.result);
            
            try {
                // Calculate hash of original file for integrity
                const originalHash = await calculateHash(arrayBuffer);
                
                // Use single compression pass with balanced compression
                // 使用单次压缩，平衡压缩率和速度
                deflate(arrayBuffer, { 
                    level: 6, // 平衡压缩级别
                    mem: 8    // 合理内存使用
                }, async (err, compressed) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const encryptionKey = await deriveKeyFromPassword(password, salt);

                    // Split compressed data into volumes
                    const encryptedVolumes = [];
                    for (let i = 0; i < compressed.length; i += volumeSize) {
                        const volume = compressed.slice(i, i + volumeSize);
                        const encryptedVolume = await encryptChunk(volume, encryptionKey);
                        encryptedVolumes.push(encryptedVolume);
                    }
                    
                    resolve({
                        volumes: encryptedVolumes,
                        originalSize: file.size,
                        compressedSize: compressed.length,
                        originalHash,
                        salt: arrayBufferToBase64(salt)
                    });
                });
            } catch (hashError) {
                reject(hashError);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

// Compress multiple files into a single archive with volumes
// 将多个文件压缩为单个分卷归档
async function compressAndEncryptFilesToArchive(files, password, volumeSize = DEFAULT_VOLUME_SIZE) {
    try {
        // Create a simple archive format: [file1_size][file1_name_length][file1_name][file1_data][file2_size]...
        // 创建简单的归档格式
        const archiveData = [];
        const fileManifest = [];
        
        for (const file of files) {
            const fileBuffer = await readFileAsArrayBuffer(file);
            const nameBytes = new TextEncoder().encode(file.name);
            
            // Add file metadata to manifest
            fileManifest.push({
                name: file.name,
                size: file.size,
                offset: 0 // Will be calculated later
            });
            
            // File format: [name_length(4)][name][size(8)][data]
            // Use separate arrays to avoid alignment issues
            const nameLengthBytes = new Uint8Array(4);
            const nameLengthView = new DataView(nameLengthBytes.buffer);
            nameLengthView.setUint32(0, nameBytes.length, true); // little endian
            
            const fileSizeBytes = new Uint8Array(8);
            const fileSizeView = new DataView(fileSizeBytes.buffer);
            fileSizeView.setBigUint64(0, BigInt(file.size), true); // little endian
            
            archiveData.push(
                nameLengthBytes,
                nameBytes,
                fileSizeBytes,
                new Uint8Array(fileBuffer)
            );
        }
        
        // Combine all data
        const totalLength = archiveData.reduce((sum, part) => sum + part.length, 0);
        
        const combinedData = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const part of archiveData) {
            combinedData.set(part, offset);
            offset += part.length;
        }
        
        // Calculate hash of the entire archive
        const archiveHash = await calculateHash(combinedData);
        
        // Compress the archive
        return new Promise((resolve, reject) => {
            deflate(combinedData, { 
                level: 6,
                mem: 8
            }, async (err, compressed) => {
                if (err) {
                    reject(err);
                    return;
                }

                const salt = crypto.getRandomValues(new Uint8Array(16));
                const encryptionKey = await deriveKeyFromPassword(password, salt);
                
                // Split compressed data into volumes
                const encryptedVolumes = [];
                for (let i = 0; i < compressed.length; i += volumeSize) {
                    const volume = compressed.slice(i, i + volumeSize);
                    const encryptedVolume = await encryptChunk(volume, encryptionKey);
                    encryptedVolumes.push(encryptedVolume);
                }
                
                resolve({
                    volumes: encryptedVolumes,
                    originalSize: totalLength,
                    compressedSize: compressed.length,
                    archiveHash,
                    fileCount: files.length,
                    fileManifest,
                    salt: arrayBufferToBase64(salt)
                });
            });
        });
    } catch (error) {
        throw new Error(`Archive compression failed: ${error.message}`);
    }
}

// Helper function to read file as array buffer
// 辅助函数：将文件读取为ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

// Decompress volumes back to file
// 将分卷解压回文件
async function decryptAndDecompressVolumesToFile(volumes, fileName, originalHash, salt, password) {
    try {
        const saltBuffer = base64ToArrayBuffer(salt);
        const key = await deriveKeyFromPassword(password, saltBuffer);
        const decryptedVolumes = await Promise.all(volumes.map(v => decryptChunk(v.encryptedData, key, v.iv)));

        const totalLength = decryptedVolumes.reduce((sum, arr) => sum + arr.length, 0);
        const compressed = new Uint8Array(totalLength);
        let offset = 0;

        for (const data of decryptedVolumes) {
            compressed.set(data, offset);
            offset += data.length;
        }
        
        // Decompress
        return new Promise((resolve, reject) => {
            inflate(compressed, async (err, decompressed) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Verify hash if provided
                if (originalHash) {
                    try {
                        const calculatedHash = await calculateHash(decompressed);
                        if (calculatedHash !== originalHash) {
                            reject(new Error('File integrity check failed: hash mismatch'));
                            return;
                        }
                    } catch (hashError) {
                        reject(new Error('File integrity check failed: ' + hashError.message));
                        return;
                    }
                }
                
                // Create blob and download
                const blob = new Blob([decompressed]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                resolve();
            });
        });
    } catch (error) {
        console.error('Decompression error:', error);
        throw error;
    }
}

// Decompress archive volumes to multiple files
// 将归档分卷解压为多个文件
async function decryptAndDecompressArchiveToFiles(volumes, fileManifest, archiveHash, salt, password) {
    try {
        const saltBuffer = base64ToArrayBuffer(salt);
        const key = await deriveKeyFromPassword(password, saltBuffer);
        const decryptedVolumes = await Promise.all(volumes.map(v => decryptChunk(v.encryptedData, key, v.iv)));

        const totalLength = decryptedVolumes.reduce((sum, arr) => sum + arr.length, 0);
        const compressed = new Uint8Array(totalLength);
        let offset = 0;

        for (const data of decryptedVolumes) {
            compressed.set(data, offset);
            offset += data.length;
        }
        
        // Decompress archive
        return new Promise((resolve, reject) => {
            inflate(compressed, async (err, decompressed) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Verify archive hash if provided
                if (archiveHash) {
                    try {
                        const calculatedHash = await calculateHash(decompressed);
                        if (calculatedHash !== archiveHash) {
                            reject(new Error('Archive integrity check failed: hash mismatch'));
                            return;
                        }
                    } catch (hashError) {
                        reject(new Error('Archive integrity check failed: ' + hashError.message));
                        return;
                    }
                }
                
                // Extract files from archive
                let dataOffset = 0;
                const extractedFiles = [];
                
                for (const fileInfo of fileManifest) {
                    // Read file metadata: [name_length(4)][name][size(8)][data]
                    const nameLengthBytes = decompressed.slice(dataOffset, dataOffset + 4);
                    const nameLengthView = new DataView(nameLengthBytes.buffer);
                    const nameLength = nameLengthView.getUint32(0, true); // little endian
                    dataOffset += 4;
                    
                    const nameBytes = decompressed.slice(dataOffset, dataOffset + nameLength);
                    const fileName = new TextDecoder().decode(nameBytes);
                    dataOffset += nameLength;
                    
                    // Use DataView to read BigUint64 safely
                    const fileSizeBytes = decompressed.slice(dataOffset, dataOffset + 8);
                    const fileSizeView = new DataView(fileSizeBytes.buffer);
                    const fileSize = Number(fileSizeView.getBigUint64(0, true)); // little endian
                    dataOffset += 8;
                    
                    const fileData = decompressed.slice(dataOffset, dataOffset + fileSize);
                    dataOffset += fileSize;
                    
                    // Create and download file
                    const blob = new Blob([fileData]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    extractedFiles.push(fileName);
                    
                    // Add small delay between downloads to avoid overwhelming the browser
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                resolve(extractedFiles);
            });
        });
    } catch (error) {
        console.error('Archive decompression error:', error);
        throw error;
    }
}

// Setup file sending functionality
// 设置文件发送功能
export function setupFileSend({
    inputSelector,
    attachBtnSelector,
    fileInputSelector,
    onSend
}) {
    const attachBtn = document.querySelector(attachBtnSelector);
    
    if (attachBtn) {
        // 点击附件按钮显示文件上传模态框
        // Click attach button to show file upload modal
        attachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            showFileUploadModal(async (files) => {
                // 传递 userName 给 onSend
                const userName = window.roomsData && window.activeRoomIndex >= 0
                    ? (window.roomsData[window.activeRoomIndex]?.myUserName || '')
                    : '';
                await handleFilesUpload(files, (msg) => {
                    // 合并 userName 字段
                    onSend({ ...msg, userName });
                });
            });
        });
    }
}

// Handle files upload
// 处理文件上传
async function handleFilesUpload(files, onSend) {
    if (!files || files.length === 0) return;
    
    const fileId = generateFileId();
    
    try {
        // Show compression progress
        let progressElement = null;
        
        function showProgress(message) {
            // 删除系统提示
        }
        
        function updateProgress(message) {
            // 删除系统提示
        }
        
        if (files.length === 1) {
            // Single file upload
            const file = files[0];
            const password = roomsData[activeRoomIndex].password;
            showProgress();
            
            const { volumes, originalSize, compressedSize, originalHash, salt } = await compressAndEncryptFileToVolumes(file, password);
            
            updateProgress();
            
            // Create file transfer state
            const fileTransfer = {
                fileId,
                fileName: file.name,
                originalSize,
                compressedSize,
                totalVolumes: volumes.length,
                sentVolumes: 0,
                status: 'sending',
                originalHash,
                salt
            };
            
            window.fileTransfers.set(fileId, fileTransfer);
            
            // Send file start message
            onSend({
                type: 'file_start',
                fileId,
                fileName: file.name,
                originalSize,
                compressedSize,
                totalVolumes: volumes.length,
                originalHash,
                salt
            });
            
            // Send volumes
            await sendVolumes(fileId, volumes, onSend, updateProgress, file.name);
            
        } else {
            // Multiple files upload - create archive
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            const password = roomsData[activeRoomIndex].password;
            showProgress();
            
            const { volumes, originalSize, compressedSize, archiveHash, fileCount, fileManifest, salt } = await compressAndEncryptFilesToArchive(files, password);
            
            updateProgress();
            
            // Create file transfer state for archive
            const fileTransfer = {
                fileId,
                fileName: `${files.length} files.zip`, // Virtual archive name
                originalSize,
                compressedSize,
                totalVolumes: volumes.length,
                sentVolumes: 0,
                status: 'sending',
                archiveHash,
                fileCount,
                fileManifest,
                isArchive: true,
                salt
            };
            
            window.fileTransfers.set(fileId, fileTransfer);
            
            // Send archive start message
            onSend({
                type: 'file_start',
                fileId,
                fileName: `${files.length} files`,
                originalSize,
                compressedSize,
                totalVolumes: volumes.length,
                archiveHash,
                fileCount,
                fileManifest,
                isArchive: true,
                salt
            });
            
            // Send volumes
            await sendVolumes(fileId, volumes, onSend, updateProgress, `${files.length} files`);
        }
        
    } catch (error) {
        console.error('File compression error:', error);
        if (window.addSystemMsg) {
            window.addSystemMsg(`Failed to compress files: ${error.message}`);
        }
    }
}

// Handle file start message
// 处理文件开始消息
function handleFileStart(message, isPrivate) {
    const { fileId, fileName, originalSize, compressedSize, totalVolumes, originalHash, archiveHash, fileCount, fileManifest, isArchive, userName, salt } = message;
    
    const fileTransfer = {
        fileId,
        fileName,
        originalSize,
        compressedSize,
        totalVolumes,
        receivedVolumes: new Set(),
        volumeData: new Array(totalVolumes),
        status: 'receiving',
        originalHash,
        archiveHash,
        fileCount,
        fileManifest,
        isArchive,
        userName, // 记录发送者名字
        salt
    };
    
    window.fileTransfers.set(fileId, fileTransfer);
    
    // 添加文件消息到聊天
    if (window.addOtherMsg) {
        let displayData;
        if (isArchive) {
            displayData = {
                type: 'file',
                fileId,
                fileName: `${fileCount} files`,
                originalSize,
                totalVolumes,
                fileCount,
                isArchive: true,
                userName
            };
        } else {
            displayData = {
                type: 'file',
                fileId,
                fileName,
                originalSize,
                totalVolumes,
                userName
            };
        }
        
        window.addOtherMsg(displayData, userName, userName, false, isPrivate ? 'file_private' : 'file');
    }
}

// Download file from volumes
// 从分卷下载文件
export async function downloadFile(fileId) {
    const transfer = window.fileTransfers.get(fileId);
    if (!transfer || transfer.status !== 'completed') return;
    
    try {
        const room = roomsData.find(r => r.userList.some(u => u.clientId === transfer.clientId));
        const password = room ? room.password : prompt('Enter password to download file:');
        if (!password) return;

        if (transfer.isArchive) {
            // Download archive as multiple files
            await decryptAndDecompressArchiveToFiles(transfer.volumeData, transfer.fileManifest, transfer.archiveHash, transfer.salt, password);
        } else {
            // Download single file
            await decryptAndDecompressVolumesToFile(transfer.volumeData, transfer.fileName, transfer.originalHash, transfer.salt, password);
        }
    } catch (error) {
        console.error('Download error:', error);
        window.addSystemMsg(`Failed to download: ${error.message}`);
    }
}

// Legacy image send function for backward compatibility
// 向后兼容的图片发送函数
export function setupImageSend(config) {
    setupFileSend(config);
}
