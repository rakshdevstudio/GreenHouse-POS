// electron/offline/storage.js
// Local offline database for invoice persistence

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * Offline Storage Manager
 * Persists invoices locally when offline using JSON file storage
 * 
 * TODO: Upgrade to SQLite for better performance with large datasets
 * For now, using JSON for simplicity and zero dependencies
 */
class OfflineStorage {
    constructor() {
        this.storageDir = null;
        this.storageFile = null;
        this.data = {
            invoices: [],
            lastSync: null,
        };
    }

    /**
     * Initialize storage
     * Creates storage directory and loads existing data
     */
    init() {
        try {
            // Use userData directory for persistent storage
            this.storageDir = path.join(app.getPath('userData'), 'offline-data');
            this.storageFile = path.join(this.storageDir, 'invoices.json');

            // Create directory if it doesn't exist
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
                console.log('📁 Offline Storage: Created directory:', this.storageDir);
            }

            // Load existing data
            this.loadData();

            console.log('✅ Offline Storage: Initialized');
            console.log(`📊 Pending invoices: ${this.data.invoices.length}`);
        } catch (err) {
            console.error('❌ Offline Storage: Init failed:', err);
            throw err;
        }
    }

    /**
     * Load data from disk
     */
    loadData() {
        try {
            if (fs.existsSync(this.storageFile)) {
                const raw = fs.readFileSync(this.storageFile, 'utf8');
                this.data = JSON.parse(raw);
                console.log('📖 Offline Storage: Loaded existing data');
            } else {
                console.log('📄 Offline Storage: No existing data, starting fresh');
            }
        } catch (err) {
            console.error('❌ Offline Storage: Load failed:', err);
            // Reset to default if corrupted
            this.data = { invoices: [], lastSync: null };
        }
    }

    /**
     * Save data to disk
     */
    saveData() {
        try {
            fs.writeFileSync(
                this.storageFile,
                JSON.stringify(this.data, null, 2),
                'utf8'
            );
        } catch (err) {
            console.error('❌ Offline Storage: Save failed:', err);
            throw err;
        }
    }

    /**
     * Save an invoice for later sync
     * @param {Object} invoice - Invoice object with all details
     * @param {string} terminalUuid - Terminal UUID for this invoice
     * @returns {string} - Local invoice ID
     */
    saveInvoice(invoice, terminalUuid) {
        try {
            const localId = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const offlineInvoice = {
                localId,
                terminalUuid,
                invoice,
                createdAt: new Date().toISOString(),
                synced: false,
                syncAttempts: 0,
                lastSyncAttempt: null,
                syncError: null,
            };

            this.data.invoices.push(offlineInvoice);
            this.saveData();

            console.log(`💾 Offline Storage: Saved invoice ${localId} for terminal ${terminalUuid}`);
            return localId;
        } catch (err) {
            console.error('❌ Offline Storage: Save invoice failed:', err);
            throw err;
        }
    }

    /**
     * Get all pending (unsynced) invoices
     * @param {string} [terminalUuid] - Optional: filter by terminal
     * @returns {Array} - Array of pending invoices
     */
    getPendingInvoices(terminalUuid = null) {
        let pending = this.data.invoices.filter(inv => !inv.synced);

        if (terminalUuid) {
            pending = pending.filter(inv => inv.terminalUuid === terminalUuid);
        }

        return pending;
    }

    /**
     * Mark an invoice as successfully synced
     * @param {string} localId - Local invoice ID
     * @param {Object} [serverData] - Server response data (id, invoice_no, etc)
     */
    markInvoiceSynced(localId, serverData = null) {
        try {
            const invoice = this.data.invoices.find(inv => inv.localId === localId);

            if (invoice) {
                invoice.synced = true;
                invoice.syncedAt = new Date().toISOString();
                invoice.syncedAt = new Date().toISOString();

                if (serverData) {
                    if (serverData.id) invoice.serverId = serverData.id;

                    // Update the actual invoice object with server details (e.g. real invoice_no)
                    if (invoice.invoice) {
                        if (serverData.id) invoice.invoice.id = serverData.id;
                        if (serverData.invoice_no) invoice.invoice.invoice_no = serverData.invoice_no;
                        if (serverData.created_at) invoice.invoice.created_at = serverData.created_at;
                    }
                }

                this.saveData();
                console.log(`✅ Offline Storage: Marked ${localId} as synced`);
            } else {
                console.warn(`⚠️  Offline Storage: Invoice ${localId} not found`);
            }
        } catch (err) {
            console.error('❌ Offline Storage: Mark synced failed:', err);
            throw err;
        }
    }

    /**
     * Record a sync attempt (for retry logic)
     * @param {string} localId
     * @param {Error} [error]
     */
    recordSyncAttempt(localId, error = null) {
        try {
            const invoice = this.data.invoices.find(inv => inv.localId === localId);

            if (invoice) {
                invoice.syncAttempts++;
                invoice.lastSyncAttempt = new Date().toISOString();
                if (error) {
                    invoice.syncError = error.message;
                }

                this.saveData();
            }
        } catch (err) {
            console.error('❌ Offline Storage: Record attempt failed:', err);
        }
    }

    /**
     * Clean up old synced invoices (optional maintenance)
     * @param {number} daysOld - Remove synced invoices older than this many days
     */
    cleanupSyncedInvoices(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const before = this.data.invoices.length;

            this.data.invoices = this.data.invoices.filter(inv => {
                if (!inv.synced) return true; // Keep unsynced
                if (!inv.syncedAt) return true; // Keep if no sync date

                const syncDate = new Date(inv.syncedAt);
                return syncDate > cutoffDate;
            });

            const removed = before - this.data.invoices.length;

            if (removed > 0) {
                this.saveData();
                console.log(`🧹 Offline Storage: Cleaned up ${removed} old synced invoices`);
            }
        } catch (err) {
            console.error('❌ Offline Storage: Cleanup failed:', err);
        }
    }

    /**
     * Get storage statistics
     * @returns {Object}
     */
    getStats() {
        const pending = this.data.invoices.filter(inv => !inv.synced);
        const synced = this.data.invoices.filter(inv => inv.synced);

        return {
            total: this.data.invoices.length,
            pending: pending.length,
            synced: synced.length,
            lastSync: this.data.lastSync,
            storageFile: this.storageFile,
        };
    }
}

// Singleton instance
const storage = new OfflineStorage();

module.exports = {
    init: () => storage.init(),
    saveInvoice: (invoice, terminalUuid) => storage.saveInvoice(invoice, terminalUuid),
    getPendingInvoices: (terminalUuid) => storage.getPendingInvoices(terminalUuid),
    markInvoiceSynced: (localId, serverId) => storage.markInvoiceSynced(localId, serverId),
    recordSyncAttempt: (localId, error) => storage.recordSyncAttempt(localId, error),
    cleanupSyncedInvoices: (daysOld) => storage.cleanupSyncedInvoices(daysOld),
    getStats: () => storage.getStats(),
};

// TODO: Integration in main.js
// const storage = require('./offline/storage');
// storage.init();
// 
// // When creating invoice offline:
// const localId = storage.saveInvoice(invoiceData, terminalUuid);
//
// // After successful sync:
// storage.markInvoiceSynced(localId, serverInvoiceId);
