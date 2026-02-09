// electron/offline/network.js
// Network status detection for Electron main process

const { net } = require('electron');
const dns = require('dns');

/**
 * Network Status Manager
 * Detects online/offline state reliably in Electron main process
 */
class NetworkManager {
    constructor() {
        this.online = true;
        this.onlineCallbacks = [];
        this.offlineCallbacks = [];
        this.checkInterval = null;
        this.CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
    }

    /**
     * Initialize network monitoring
     * @param {string} serverUrl - Backend API URL
     */
    init(serverUrl) {
        console.log('🌐 Network Manager: Initializing with', serverUrl);
        this.serverUrl = serverUrl;

        // Initial check
        this.checkConnection();

        // Periodic checks
        this.checkInterval = setInterval(() => {
            this.checkConnection();
        }, this.CHECK_INTERVAL_MS);

        console.log('✅ Network Manager: Initialized');
    }

    /**
     * Check internet connectivity using DNS lookup
     * More reliable than just checking network interface
     */
    async checkConnection() {
        if (!this.serverUrl) {
            // Fallback if init didn't provide URL
            this.setOnline(true);
            return;
        }

        try {
            const request = net.request({
                method: 'GET',
                url: `${this.serverUrl}/health`,
                useSessionCookies: false
            });

            request.on('response', (response) => {
                // Any response (200, 404, 500) means we reached the server
                this.setOnline(true);
            });

            request.on('error', (error) => {
                console.warn('⚠️ Network Check Failed:', error.message);
                this.setOnline(false);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (!request.finished) {
                    request.abort();
                }
            }, 5000);

            request.end();
        } catch (err) {
            console.error('Network check error:', err);
            this.setOnline(false);
        }
    }

    /**
     * Update online status and trigger callbacks
     */
    setOnline(status) {
        const wasOnline = this.online;
        this.online = status;

        // Only trigger callbacks if status changed
        if (wasOnline !== status) {
            if (status) {
                console.log('🟢 Network: ONLINE');
                this.onlineCallbacks.forEach(cb => {
                    try {
                        cb();
                    } catch (err) {
                        console.error('Network callback error:', err);
                    }
                });
            } else {
                console.log('🔴 Network: OFFLINE');
                this.offlineCallbacks.forEach(cb => {
                    try {
                        cb();
                    } catch (err) {
                        console.error('Network callback error:', err);
                    }
                });
            }
        }
    }

    /**
     * Get current online status
     * @returns {boolean}
     */
    isOnline() {
        return this.online;
    }

    /**
     * Register callback for when network comes online
     * @param {Function} callback
     */
    onOnline(callback) {
        if (typeof callback === 'function') {
            this.onlineCallbacks.push(callback);
        }
    }

    /**
     * Register callback for when network goes offline
     * @param {Function} callback
     */
    onOffline(callback) {
        if (typeof callback === 'function') {
            this.offlineCallbacks.push(callback);
        }
    }

    /**
     * Cleanup on app shutdown
     */
    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.onlineCallbacks = [];
        this.offlineCallbacks = [];
        console.log('🌐 Network Manager: Destroyed');
    }
}

// Singleton instance
const networkManager = new NetworkManager();

module.exports = {
    init: () => networkManager.init(),
    isOnline: () => networkManager.isOnline(),
    onOnline: (cb) => networkManager.onOnline(cb),
    onOffline: (cb) => networkManager.onOffline(cb),
    destroy: () => networkManager.destroy(),
};

// TODO: Integration in main.js
// const network = require('./offline/network');
// network.init();
// network.onOnline(() => { /* trigger sync */ });
// network.onOffline(() => { /* show offline indicator */ });
