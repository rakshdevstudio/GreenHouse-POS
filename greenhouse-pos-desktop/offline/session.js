// electron/offline/session.js
// Cached login/session handling for offline mode

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

/**
 * Session Manager
 * Caches login credentials for offline authentication
 * 
 * Security Note: Uses basic obfuscation, not encryption.
 * For production, consider using keytar or similar for secure credential storage.
 */
class SessionManager {
    constructor() {
        this.sessionFile = null;
        this.session = null;
        this.ENCRYPTION_KEY = 'greenhouse-pos-offline-key'; // TODO: Use secure key management
    }

    /**
     * Initialize session manager
     */
    init() {
        try {
            const sessionDir = path.join(app.getPath('userData'), 'session');

            // Create directory if needed
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            this.sessionFile = path.join(sessionDir, 'cached-session.json');

            // Load existing session
            this.loadSession();

            console.log('✅ Session Manager: Initialized');
            if (this.session) {
                console.log(`👤 Cached session found for terminal: ${this.session.terminal_uuid}`);
            }
        } catch (err) {
            console.error('❌ Session Manager: Init failed:', err);
            throw err;
        }
    }

    /**
     * Simple obfuscation (NOT secure encryption)
     * @param {string} text
     * @returns {string}
     */
    obfuscate(text) {
        const cipher = crypto.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    /**
     * Deobfuscate
     * @param {string} encrypted
     * @returns {string}
     */
    deobfuscate(encrypted) {
        const decipher = crypto.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Save session data for offline login
     * @param {Object} sessionData
     * @param {string} sessionData.userId
     * @param {number} sessionData.storeId
     * @param {string} sessionData.terminal_uuid
     * @param {string} sessionData.authToken
     * @param {string} [sessionData.username]
     * @param {string} [sessionData.storeName]
     */
    saveSession(sessionData) {
        try {
            const { userId, storeId, terminal_uuid, authToken, username, storeName } = sessionData;

            if (!userId || !storeId || !terminal_uuid || !authToken) {
                throw new Error('Missing required session fields');
            }

            // Obfuscate sensitive data
            const obfuscatedSession = {
                userId,
                storeId,
                terminal_uuid,
                authToken: this.obfuscate(authToken),
                username: username || null,
                storeName: storeName || null,
                savedAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
            };

            fs.writeFileSync(
                this.sessionFile,
                JSON.stringify(obfuscatedSession, null, 2),
                'utf8'
            );

            this.session = sessionData; // Store unobfuscated in memory

            console.log(`💾 Session Manager: Saved session for ${terminal_uuid}`);
        } catch (err) {
            console.error('❌ Session Manager: Save failed:', err);
            throw err;
        }
    }

    /**
     * Load cached session from disk
     * @returns {Object|null}
     */
    loadSession() {
        try {
            if (!fs.existsSync(this.sessionFile)) {
                this.session = null;
                return null;
            }

            const raw = fs.readFileSync(this.sessionFile, 'utf8');
            const obfuscatedSession = JSON.parse(raw);

            // Deobfuscate token
            this.session = {
                ...obfuscatedSession,
                authToken: this.deobfuscate(obfuscatedSession.authToken),
            };

            // Update last used timestamp
            this.updateLastUsed();

            return this.session;
        } catch (err) {
            console.error('❌ Session Manager: Load failed:', err);
            this.session = null;
            return null;
        }
    }

    /**
     * Update last used timestamp
     */
    updateLastUsed() {
        try {
            if (this.session && fs.existsSync(this.sessionFile)) {
                const raw = fs.readFileSync(this.sessionFile, 'utf8');
                const data = JSON.parse(raw);
                data.lastUsed = new Date().toISOString();
                fs.writeFileSync(this.sessionFile, JSON.stringify(data, null, 2), 'utf8');
            }
        } catch (err) {
            console.error('❌ Session Manager: Update last used failed:', err);
        }
    }

    /**
     * Check if offline login is allowed
     * @returns {boolean}
     */
    isOfflineLoginAllowed() {
        if (!this.session) {
            console.log('🔒 Offline login: NOT ALLOWED (no cached session)');
            return false;
        }

        // Optional: Check if session is too old (e.g., 30 days)
        const savedAt = new Date(this.session.savedAt);
        const now = new Date();
        const daysSinceSaved = (now - savedAt) / (1000 * 60 * 60 * 24);

        const MAX_SESSION_AGE_DAYS = 30;

        if (daysSinceSaved > MAX_SESSION_AGE_DAYS) {
            console.log(`🔒 Offline login: NOT ALLOWED (session too old: ${daysSinceSaved.toFixed(0)} days)`);
            return false;
        }

        console.log('✅ Offline login: ALLOWED');
        return true;
    }

    /**
     * Get cached session
     * @returns {Object|null}
     */
    getSession() {
        return this.session;
    }

    /**
     * Validate offline login credentials
     * @param {string} username
     * @param {string} password
     * @returns {Object|null} - Session data if valid, null otherwise
     */
    validateOfflineLogin(username, password) {
        if (!this.isOfflineLoginAllowed()) {
            return null;
        }

        // For offline mode, we can't validate password against server
        // We only check if username matches cached session
        // This is a security tradeoff for offline functionality

        if (this.session.username && this.session.username === username) {
            console.log(`✅ Offline login: Validated for ${username}`);
            this.updateLastUsed();
            return this.session;
        }

        console.log(`❌ Offline login: Username mismatch`);
        return null;
    }

    /**
     * Clear cached session (logout)
     */
    clearSession() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                fs.unlinkSync(this.sessionFile);
            }
            this.session = null;
            console.log('🗑️  Session Manager: Cleared session');
        } catch (err) {
            console.error('❌ Session Manager: Clear failed:', err);
        }
    }

    /**
     * Get session info (safe for logging)
     * @returns {Object}
     */
    getSessionInfo() {
        if (!this.session) {
            return { cached: false };
        }

        return {
            cached: true,
            terminal_uuid: this.session.terminal_uuid,
            username: this.session.username,
            storeName: this.session.storeName,
            savedAt: this.session.savedAt,
            lastUsed: this.session.lastUsed,
            offlineLoginAllowed: this.isOfflineLoginAllowed(),
        };
    }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = {
    init: () => sessionManager.init(),
    saveSession: (sessionData) => sessionManager.saveSession(sessionData),
    loadSession: () => sessionManager.loadSession(),
    isOfflineLoginAllowed: () => sessionManager.isOfflineLoginAllowed(),
    getSession: () => sessionManager.getSession(),
    validateOfflineLogin: (username, password) => sessionManager.validateOfflineLogin(username, password),
    clearSession: () => sessionManager.clearSession(),
    getSessionInfo: () => sessionManager.getSessionInfo(),
};

// TODO: Integration in main.js
// const session = require('./offline/session');
// session.init();
//
// // After successful online login:
// session.saveSession({
//   userId: user.id,
//   storeId: user.store_id,
//   terminal_uuid: terminal.uuid,
//   authToken: response.token,
//   username: user.username,
//   storeName: store.name
// });
//
// // For offline login attempt:
// if (!network.isOnline()) {
//   const cachedSession = session.validateOfflineLogin(username, password);
//   if (cachedSession) {
//     // Allow login with cached credentials
//   }
// }
