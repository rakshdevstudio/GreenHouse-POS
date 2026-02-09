// electron/offline/sync.js
// Background sync manager for offline invoices

const axios = require('axios');

/**
 * Sync Manager
 * Syncs offline invoices to server when network is available
 */
class SyncManager {
    constructor(networkManager, storageManager) {
        this.network = networkManager;
        this.storage = storageManager;
        this.syncing = false;
        this.syncInterval = null;
        this.AUTO_SYNC_INTERVAL_MS = 60000; // Sync every 60 seconds when online
        this.MAX_RETRY_ATTEMPTS = 5;
        this.RETRY_BACKOFF_MS = [1000, 5000, 15000, 30000, 60000]; // Exponential backoff
    }

    /**
     * Initialize sync manager
     * @param {string} serverUrl - Backend API URL
     * @param {Object} sessionManager - Session manager for auth token
     */
    init(serverUrl, sessionManager) {
        this.serverUrl = serverUrl;
        this.session = sessionManager;

        console.log('🔄 Sync Manager: Initializing...');

        // Listen to network events
        this.network.onOnline(() => {
            console.log('🔄 Sync Manager: Network online, triggering sync');
            this.syncNow();
        });

        // Periodic sync when online
        this.syncInterval = setInterval(() => {
            if (this.network.isOnline() && !this.syncing) {
                this.syncNow();
            }
        }, this.AUTO_SYNC_INTERVAL_MS);

        console.log('✅ Sync Manager: Initialized');

        // Initial sync if online
        if (this.network.isOnline()) {
            setTimeout(() => this.syncNow(), 2000); // Wait 2s after init
        }
    }

    /**
     * Trigger immediate sync
     */
    async syncNow() {
        if (this.syncing) {
            console.log('⏳ Sync Manager: Already syncing, skipping...');
            return;
        }

        if (!this.network.isOnline()) {
            console.log('🔴 Sync Manager: Offline, cannot sync');
            return;
        }

        const pending = this.storage.getPendingInvoices();

        if (pending.length === 0) {
            console.log('✅ Sync Manager: No pending invoices');
            return;
        }

        console.log(`🔄 Sync Manager: Starting sync for ${pending.length} invoice(s)`);
        this.syncing = true;

        let successCount = 0;
        let failCount = 0;

        for (const offlineInvoice of pending) {
            try {
                await this.syncInvoice(offlineInvoice);
                successCount++;
            } catch (err) {
                failCount++;
                console.error(`❌ Sync failed for ${offlineInvoice.localId}:`, err.message);
            }
        }

        this.syncing = false;

        console.log(`✅ Sync Manager: Complete - ${successCount} synced, ${failCount} failed`);

        // Update last sync timestamp
        this.storage.data.lastSync = new Date().toISOString();
        this.storage.saveData();
    }

    /**
     * Sync a single invoice
     * @param {Object} offlineInvoice
     */
    async syncInvoice(offlineInvoice) {
        const { localId, invoice, terminalUuid, syncAttempts } = offlineInvoice;

        // Check retry limit
        if (syncAttempts >= this.MAX_RETRY_ATTEMPTS) {
            console.warn(`⚠️  Sync Manager: Max retries reached for ${localId}`);
            throw new Error('Max retry attempts exceeded');
        }

        // Apply backoff delay
        if (syncAttempts > 0) {
            const delay = this.RETRY_BACKOFF_MS[Math.min(syncAttempts - 1, this.RETRY_BACKOFF_MS.length - 1)];
            console.log(`⏳ Sync Manager: Waiting ${delay}ms before retry ${syncAttempts + 1}`);
            await this.sleep(delay);
        }

        try {
            console.log(`📤 Sync Manager: Syncing ${localId} (attempt ${syncAttempts + 1})`);

            // POST invoice to server
            // TODO: Replace with actual endpoint and payload structure
            const response = await axios.post(
                `${this.serverUrl}/invoices`,
                {
                    ...invoice,
                    terminal_uuid: terminalUuid,
                    offline_created: true,
                    offline_id: localId,
                },
                {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.session?.getSession()?.authToken || ''}`
                    }
                }
            );

            // Extract server-assigned invoice ID
            const serverId = response.data?.invoice?.id || response.data?.id || null;

            // Mark as synced
            this.storage.markInvoiceSynced(localId, serverId);

            console.log(`✅ Sync Manager: Synced ${localId} → server ID: ${serverId}`);
        } catch (err) {
            // Record failed attempt
            this.storage.recordSyncAttempt(localId, err);

            // Determine if we should retry
            if (err.response) {
                // Server responded with error
                const status = err.response.status;

                if (status >= 400 && status < 500) {
                    // Client error - don't retry (bad data)
                    console.error(`❌ Sync Manager: Client error ${status}, not retrying`);
                    throw new Error(`Client error: ${status}`);
                }
            } else if (err.code === 'ECONNABORTED') {
                // Timeout - retry
                console.warn(`⏱️  Sync Manager: Timeout, will retry`);
                throw err;
            } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
                // Network error - retry
                console.warn(`🌐 Sync Manager: Network error, will retry`);
                throw err;
            }

            // Unknown error - retry
            throw err;
        }
    }

    /**
     * Sleep utility
     * @param {number} ms
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get sync status
     * @returns {Object}
     */
    getStatus() {
        const stats = this.storage.getStats();

        return {
            syncing: this.syncing,
            online: this.network.isOnline(),
            pendingInvoices: stats.pending,
            syncedInvoices: stats.synced,
            lastSync: stats.lastSync,
        };
    }

    /**
     * Force sync for specific terminal
     * @param {string} terminalUuid
     */
    async syncTerminal(terminalUuid) {
        if (!this.network.isOnline()) {
            throw new Error('Cannot sync while offline');
        }

        const pending = this.storage.getPendingInvoices(terminalUuid);

        console.log(`🔄 Sync Manager: Force sync for terminal ${terminalUuid} (${pending.length} invoices)`);

        for (const offlineInvoice of pending) {
            await this.syncInvoice(offlineInvoice);
        }
    }

    /**
     * Cleanup on app shutdown
     */
    destroy() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        console.log('🔄 Sync Manager: Destroyed');
    }
}

// Factory function (requires network and storage instances)
module.exports = {
    create: (networkManager, storageManager) => {
        return new SyncManager(networkManager, storageManager);
    }
};

// TODO: Integration in main.js
// const network = require('./offline/network');
// const storage = require('./offline/storage');
// const syncModule = require('./offline/sync');
//
// network.init();
// storage.init();
//
// const sync = syncModule.create(network, storage);
// sync.init('https://your-backend-url.com');
//
// // Manual sync trigger:
// sync.syncNow();
//
// // Get status:
// const status = sync.getStatus();
