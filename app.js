// IndexedDB Database Manager
class DatabaseManager {
    constructor() {
        this.dbName = 'NexusDashboardDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('mexc')) {
                    db.createObjectStore('mexc', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('emails')) {
                    db.createObjectStore('emails', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(storeName, id, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ ...data, id });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Main Application
class DashboardApp {
    constructor() {
        this.db = new DatabaseManager();
        this.currentData = {
            users: [],
            mexc: [],
            emails: []
        };
        this.config = {
            scriptUrl: localStorage.getItem('googleScriptUrl') || '',
            apiKey: localStorage.getItem('apiKey') || '',
            showPasswords: localStorage.getItem('showPasswords') === 'true' // New setting
        };
    }

    async init() {
        await this.db.init();
        await this.loadAllData();
        this.setupEventListeners();
        this.updateDashboard();
        this.renderAllTables();
        this.updateConnectionStatus();
        this.updatePasswordVisibilityButton();
    }

    async loadAllData() {
        this.currentData.users = await this.db.getAll('users');
        this.currentData.mexc = await this.db.getAll('mexc');
        this.currentData.emails = await this.db.getAll('emails');
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        // Add buttons
        document.getElementById('addUserBtn')?.addEventListener('click', () => this.showModal('user'));
        document.getElementById('addMexcBtn')?.addEventListener('click', () => this.showModal('mexc'));
        document.getElementById('addEmailBtn')?.addEventListener('click', () => this.showModal('email'));

        // Sync buttons
        document.querySelectorAll('.sync-sheet-btn').forEach(btn => {
            btn.addEventListener('click', () => this.pushToSheets(btn.dataset.sheet));
        });

        document.querySelectorAll('.fetch-sheet-btn').forEach(btn => {
            btn.addEventListener('click', () => this.fetchFromSheets(btn.dataset.sheet));
        });

        // Config
        document.getElementById('saveConfigBtn')?.addEventListener('click', () => this.saveConfig());
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.testConnection());
        
        // Password visibility toggle button
        this.addPasswordToggleButton();

        // Modal close
        document.querySelector('.close-modal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modalCancelBtn')?.addEventListener('click', () => this.closeModal());
    }

    addPasswordToggleButton() {
        // Add a button in the top bar to toggle password visibility
        const topBar = document.querySelector('.top-bar');
        if (topBar && !document.getElementById('togglePasswordsBtn')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'togglePasswordsBtn';
            toggleBtn.className = 'btn-outline';
            toggleBtn.style.marginLeft = '10px';
            toggleBtn.style.padding = '8px 16px';
            toggleBtn.innerHTML = this.config.showPasswords ? '<i class="fas fa-eye-slash"></i> Hide Passwords' : '<i class="fas fa-eye"></i> Show Passwords';
            toggleBtn.addEventListener('click', () => this.togglePasswordVisibility());
            topBar.appendChild(toggleBtn);
        }
    }

    togglePasswordVisibility() {
        this.config.showPasswords = !this.config.showPasswords;
        localStorage.setItem('showPasswords', this.config.showPasswords);
        this.updatePasswordVisibilityButton();
        this.renderAllTables(); // Re-render tables to show/hide passwords
    }

    updatePasswordVisibilityButton() {
        const btn = document.getElementById('togglePasswordsBtn');
        if (btn) {
            btn.innerHTML = this.config.showPasswords ? '<i class="fas fa-eye-slash"></i> Hide Passwords' : '<i class="fas fa-eye"></i> Show Passwords';
        }
    }

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
        document.getElementById(`${tabId}Tab`).classList.add('active-tab');
        
        const titles = { dashboard: 'Quantum Dashboard', users: 'Users Vault', mexc: 'MEXC Nexus', emails: 'Email Core', settings: 'Sheets Configuration' };
        document.getElementById('pageTitle').textContent = titles[tabId] || 'Dashboard';
    }

    showModal(type, data = null) {
        const modal = document.getElementById('genericModal');
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        
        let html = '';
        if (type === 'user') {
            modalTitle.textContent = data ? 'Edit User' : 'Add New User';
            html = `
                <div class="input-group"><label>Full Name</label><input id="userName" value="${this.escapeHtml(data?.name || '')}"></div>
                <div class="input-group"><label>ID Number</label><input id="userIdNum" value="${this.escapeHtml(data?.idNumber || '')}"></div>
                <div class="input-group"><label>Date of Birth</label><input type="date" id="userDob" value="${data?.dob || ''}"></div>
            `;
        } else if (type === 'mexc') {
            modalTitle.textContent = data ? 'Edit MEXC Account' : 'Add MEXC Account';
            html = `
                <div class="input-group"><label>Name</label><input id="mexcName" value="${this.escapeHtml(data?.name || '')}"></div>
                <div class="input-group"><label>Email Account</label><input id="mexcEmail" value="${this.escapeHtml(data?.emailAccount || '')}"></div>
                <div class="input-group"><label>Password</label><input type="${this.config.showPasswords ? 'text' : 'password'}" id="mexcPass" value="${this.escapeHtml(data?.password || '')}"></div>
                <div class="input-group"><label>Wallet</label><input id="mexcWallet" value="${this.escapeHtml(data?.wallet || '')}"></div>
                <div class="input-group"><label>Wealthreel Account</label><input id="wealthAccount" value="${this.escapeHtml(data?.wealthreelAccount || '')}"></div>
                <div class="input-group"><label>Wealthreel Password</label><input type="${this.config.showPasswords ? 'text' : 'password'}" id="wealthPass" value="${this.escapeHtml(data?.wealthreelPass || '')}"></div>
            `;
        } else if (type === 'email') {
            modalTitle.textContent = data ? 'Edit Email' : 'Add Email Credential';
            html = `
                <div class="input-group"><label>Email Address</label><input id="emailAddr" value="${this.escapeHtml(data?.email || '')}"></div>
                <div class="input-group"><label>Password</label><input type="${this.config.showPasswords ? 'text' : 'password'}" id="emailPass" value="${this.escapeHtml(data?.password || '')}"></div>
            `;
        }
        
        modalBody.innerHTML = html;
        modal.style.display = 'flex';
        
        const saveBtn = document.getElementById('modalSaveBtn');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', async () => {
            if (type === 'user') {
                const newData = { name: document.getElementById('userName').value, idNumber: document.getElementById('userIdNum').value, dob: document.getElementById('userDob').value };
                if (data) await this.db.update('users', data.id, newData);
                else await this.db.add('users', newData);
            } else if (type === 'mexc') {
                const newData = {
                    name: document.getElementById('mexcName').value,
                    emailAccount: document.getElementById('mexcEmail').value,
                    password: document.getElementById('mexcPass').value,
                    wallet: document.getElementById('mexcWallet').value,
                    wealthreelAccount: document.getElementById('wealthAccount').value,
                    wealthreelPass: document.getElementById('wealthPass').value
                };
                if (data) await this.db.update('mexc', data.id, newData);
                else await this.db.add('mexc', newData);
            } else if (type === 'email') {
                const newData = { email: document.getElementById('emailAddr').value, password: document.getElementById('emailPass').value };
                if (data) await this.db.update('emails', data.id, newData);
                else await this.db.add('emails', newData);
            }
            await this.loadAllData();
            this.renderAllTables();
            this.updateDashboard();
            this.closeModal();
        });
    }

    closeModal() {
        document.getElementById('genericModal').style.display = 'none';
    }

    async deleteRecord(type, id) {
        if (confirm('Delete this record?')) {
            await this.db.delete(type, id);
            await this.loadAllData();
            this.renderAllTables();
            this.updateDashboard();
        }
    }

    renderAllTables() {
        this.renderUsersTable();
        this.renderMexcTable();
        this.renderEmailsTable();
        this.updatePreview();
    }

    renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        tbody.innerHTML = this.currentData.users.map(user => `
            <tr>
                <td>${this.escapeHtml(user.name)}</td>
                <td>${this.escapeHtml(user.idNumber)}</td>
                <td>${user.dob || ''}</td>
                <td>
                    <button class="edit-btn" onclick="app.editRecord('user', ${user.id})"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" onclick="app.deleteRecord('users', ${user.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    renderMexcTable() {
        const tbody = document.getElementById('mexcTableBody');
        if (!tbody) return;
        tbody.innerHTML = this.currentData.mexc.map(acc => `
            <tr>
                <td>${this.escapeHtml(acc.name)}</td>
                <td>${this.escapeHtml(acc.emailAccount)}</td>
                <td>${this.config.showPasswords ? this.escapeHtml(acc.password) : '••••••'}</td>
                <td>${this.escapeHtml(acc.wallet)}</td>
                <td>${this.escapeHtml(acc.wealthreelAccount)}</td>
                <td>${this.config.showPasswords ? this.escapeHtml(acc.wealthreelPass) : '••••••'}</td>
                <td>
                    <button class="edit-btn" onclick="app.editRecord('mexc', ${acc.id})"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" onclick="app.deleteRecord('mexc', ${acc.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    renderEmailsTable() {
        const tbody = document.getElementById('emailsTableBody');
        if (!tbody) return;
        tbody.innerHTML = this.currentData.emails.map(email => `
            <tr>
                <td>${this.escapeHtml(email.email)}</td>
                <td>${this.config.showPasswords ? this.escapeHtml(email.password) : '••••••'}</td>
                <td>
                    <button class="edit-btn" onclick="app.editRecord('email', ${email.id})"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" onclick="app.deleteRecord('emails', ${email.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    editRecord(type, id) {
        let data;
        if (type === 'user') data = this.currentData.users.find(u => u.id === id);
        else if (type === 'mexc') data = this.currentData.mexc.find(m => m.id === id);
        else if (type === 'email') data = this.currentData.emails.find(e => e.id === id);
        if (data) this.showModal(type, data);
    }

    updateDashboard() {
        document.getElementById('totalUsers').textContent = this.currentData.users.length;
        document.getElementById('totalMexc').textContent = this.currentData.mexc.length;
        document.getElementById('totalEmails').textContent = this.currentData.emails.length;
    }

    updatePreview() {
        const previewUsers = document.getElementById('previewUsersList');
        const previewMexc = document.getElementById('previewMexcList');
        if (previewUsers) previewUsers.innerHTML = this.currentData.users.slice(0, 3).map(u => `👤 ${u.name}`).join('<br>') || 'No users';
        if (previewMexc) previewMexc.innerHTML = this.currentData.mexc.slice(0, 3).map(m => `⚡ ${m.name || m.emailAccount}`).join('<br>') || 'No accounts';
    }

    // Push to Sheets - PASSWORDS VISIBLE (not masked)
    async pushToSheets(sheetName) {
        if (!this.config.scriptUrl) {
            alert('⚠️ Please configure Google Sheets URL first in Settings tab');
            return;
        }
        
        const data = this.currentData[sheetName];
        if (!data || data.length === 0) {
            alert(`⚠️ No data to push to ${sheetName} sheet. Add some records first.`);
            return;
        }
        
        const syncBtn = document.querySelector(`.sync-sheet-btn[data-sheet="${sheetName}"]`);
        const originalText = syncBtn.innerHTML;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Syncing...';
        syncBtn.disabled = true;
        
        try {
            console.log(`Pushing ${data.length} records to ${sheetName}...`);
            
            // Create a copy of data with unmasked passwords for Google Sheets
            const unmaskedData = data.map(item => {
                const newItem = { ...item };
                // Keep original passwords (don't mask them)
                return newItem;
            });
            
            const jsonData = JSON.stringify(unmaskedData);
            const encodedData = encodeURIComponent(jsonData);
            const url = `${this.config.scriptUrl}?action=push&sheet=${sheetName}&data=${encodedData}&t=${Date.now()}`;
            
            const response = await fetch(url);
            const result = await response.json();
            
            console.log('Server response:', result);
            
            if (result.success) {
                alert(`✅ Success! Pushed ${data.length} records to ${sheetName} sheet.`);
                document.getElementById('syncStatus').textContent = 'Synced';
                setTimeout(() => {
                    document.getElementById('syncStatus').textContent = '--';
                }, 2000);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (err) {
            console.error('Push error:', err);
            alert(`❌ Failed to push to ${sheetName} sheet:\n\n${err.message}`);
        } finally {
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        }
    }

    async fetchFromSheets(sheetName) {
        if (!this.config.scriptUrl) {
            alert('⚠️ Please configure Google Sheets URL first in Settings tab');
            return;
        }
        
        const fetchBtn = document.querySelector(`.fetch-sheet-btn[data-sheet="${sheetName}"]`);
        const originalText = fetchBtn.innerHTML;
        fetchBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Fetching...';
        fetchBtn.disabled = true;
        
        try {
            console.log(`Fetching data from ${sheetName}...`);
            
            const url = `${this.config.scriptUrl}?action=fetch&sheet=${sheetName}&t=${Date.now()}`;
            const response = await fetch(url);
            const result = await response.json();
            
            console.log('Fetch response:', result);
            
            if (result.success && result.data) {
                if (result.data.length > 0) {
                    await this.db.clear(sheetName);
                    
                    for (const item of result.data) {
                        await this.db.add(sheetName, item);
                    }
                    
                    await this.loadAllData();
                    this.renderAllTables();
                    this.updateDashboard();
                    
                    alert(`✅ Success! Fetched ${result.data.length} records from ${sheetName} sheet.`);
                } else {
                    alert(`ℹ️ No data found in ${sheetName} sheet.`);
                }
            } else {
                throw new Error(result.error || 'Failed to fetch data');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            alert(`❌ Failed to fetch from ${sheetName} sheet:\n${err.message}`);
        } finally {
            fetchBtn.innerHTML = originalText;
            fetchBtn.disabled = false;
        }
    }

    async testConnection() {
        if (!this.config.scriptUrl) {
            alert('⚠️ Please enter your Google Apps Script Web App URL first');
            return;
        }
        
        const testBtn = document.getElementById('testConnectionBtn');
        const originalText = testBtn.innerHTML;
        testBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Testing...';
        testBtn.disabled = true;
        
        try {
            const url = `${this.config.scriptUrl}?test=true&t=${Date.now()}`;
            const response = await fetch(url);
            const result = await response.json();
            
            console.log('Test response:', result);
            
            if (result.success) {
                alert(`✅ Connection successful!\n\nSpreadsheet: ${result.spreadsheet || 'Connected'}\n\nReady to sync data.`);
                this.updateConnectionStatus(true);
            } else {
                throw new Error(result.error || 'Connection failed');
            }
        } catch (err) {
            console.error('Test error:', err);
            alert(`❌ Connection failed:\n${err.message}`);
            this.updateConnectionStatus(false);
        } finally {
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
        }
    }

    saveConfig() {
        const url = document.getElementById('googleScriptUrl').value.trim();
        const key = document.getElementById('apiKey').value.trim();
        
        this.config.scriptUrl = url;
        this.config.apiKey = key;
        
        localStorage.setItem('googleScriptUrl', url);
        localStorage.setItem('apiKey', key);
        
        alert('✅ Configuration saved successfully!');
        this.updateConnectionStatus();
    }

    updateConnectionStatus(isConnected = null) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            if (this.config.scriptUrl) {
                statusEl.innerHTML = '<i class="fas fa-link"></i> <span>Sheets Ready</span>';
                statusEl.style.borderColor = '#00ff9d';
            } else {
                statusEl.innerHTML = '<i class="fas fa-plug"></i> <span>Disconnected</span>';
                statusEl.style.borderColor = 'rgba(0, 243, 255, 0.2)';
            }
        }
        
        const urlInput = document.getElementById('googleScriptUrl');
        const keyInput = document.getElementById('apiKey');
        if (urlInput) urlInput.value = this.config.scriptUrl;
        if (keyInput) keyInput.value = this.config.apiKey;
    }

    escapeHtml(str) { 
        if (!str) return ''; 
        return String(str).replace(/[&<>]/g, function(m) { 
            if (m === '&') return '&amp;'; 
            if (m === '<') return '&lt;'; 
            if (m === '>') return '&gt;'; 
            return m; 
        }); 
    }
}

// Initialize the app
let app;
window.addEventListener('DOMContentLoaded', async () => {
    app = new DashboardApp();
    await app.init();
    window.app = app;
    console.log('Dashboard initialized successfully!');
});
