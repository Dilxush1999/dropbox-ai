const app = {
    url: 'https://dropbox.page.gd/',
    iabRef: null,
    currentPin: '',
    storedPinHash: '',
    tempPin: '',
    isChangingPin: false,
    lockoutTimer: 0,
    failedAttempts: 0,
    lastActiveTime: Date.now(),
    isNetworkOffline: false,
    verifyPurpose: '', // 'settings' yoki bo'sh

    init: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
        document.addEventListener('pause', this.onPause.bind(this), false);
        document.addEventListener('resume', this.onResume.bind(this), false);
        document.addEventListener('backbutton', this.onBackKeyDown.bind(this), false);
    },

    onDeviceReady: function() {
        console.log('Device ready');
        this.storedPinHash = localStorage.getItem('pin_hash');
        this.setupNumpads();
        this.checkNetwork();

        if (!this.storedPinHash) {
            this.showScreen('screen-set-pin');
        } else {
            this.showScreen('screen-login');
            document.getElementById('settings-trigger').classList.remove('hidden');
        }
        
        document.addEventListener("offline", () => {
            this.isNetworkOffline = true;
            if (this.iabRef) this.iabRef.close();
            this.showScreen('screen-no-internet');
        }, false);
    },

    // --- CUSTOM MESSAGES (Replace Alert) ---
    showMessage: function(title, text, icon = '✔️') {
        document.getElementById('info-title').innerText = title;
        document.getElementById('info-text').innerText = text;
        document.getElementById('info-icon').innerText = icon;
        document.getElementById('modal-info').classList.remove('hidden');
    },

    closeInfoModal: function() {
        document.getElementById('modal-info').classList.add('hidden');
    },

    // --- NUMPAD LOGIC ---
    setupNumpads: function() {
        const create = (id, type) => {
            const container = document.getElementById(id);
            container.innerHTML = '';
            for (let i = 1; i <= 9; i++) {
                const b = document.createElement('div');
                b.className = 'num-btn'; b.innerText = i;
                b.onclick = () => this.handleInput(i, type);
                container.appendChild(b);
            }
            container.appendChild(Object.assign(document.createElement('div'), {className:'num-btn empty'}));
            const z = document.createElement('div');
            z.className = 'num-btn'; z.innerText = '0';
            z.onclick = () => this.handleInput(0, type);
            container.appendChild(z);
            const d = document.createElement('div');
            d.className = 'num-btn'; d.innerText = '⌫';
            d.onclick = () => this.handleInput('del', type);
            container.appendChild(d);
        };
        create('numpad-set', 'set');
        create('numpad-login', 'login');
        create('numpad-verify', 'verify');
    },

    handleInput: async function(val, type) {
        if (this.lockoutTimer > 0 && type === 'login') return;

        if (val === 'del') {
            this.currentPin = this.currentPin.slice(0, -1);
        } else if (this.currentPin.length < 4) {
            this.currentPin += val;
        }

        this.updateDots(type);

        if (this.currentPin.length === 4) {
            if (type === 'set') await this.handleSetPin();
            else if (type === 'verify') await this.handleVerifyPin();
            else await this.handleLogin();
        }
    },

    updateDots: function(type) {
        const sel = type === 'verify' ? '#modal-verify .pin-dot' : `#screen-${type === 'set' ? 'set-pin' : 'login'} .pin-dot`;
        const dots = document.querySelectorAll(sel);
        dots.forEach((d, i) => i < this.currentPin.length ? d.classList.add('active') : d.classList.remove('active'));
    },

    hashPin: async function(pin) {
        const msgUint8 = new TextEncoder().encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    handleSetPin: async function() {
        if (!this.tempPin) {
            this.tempPin = this.currentPin;
            this.currentPin = '';
            document.getElementById('set-pin-title').innerText = 'PINni tasdiqlang';
            this.updateDots('set');
        } else {
            if (this.tempPin === this.currentPin) {
                this.storedPinHash = await this.hashPin(this.currentPin);
                localStorage.setItem('pin_hash', this.storedPinHash);
                this.currentPin = ''; this.tempPin = '';
                this.showMessage('Muvaffaqiyatli', 'Yangi PIN kod o\'rnatildi!');
                this.openWebApp();
            } else {
                this.showMessage('Xato', 'PIN mos kelmadi, qayta urinib ko\'ring', '❌');
                this.currentPin = ''; this.tempPin = '';
                document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating';
                this.updateDots('set');
            }
        }
    },

    handleLogin: async function() {
        const h = await this.hashPin(this.currentPin);
        if (h === this.storedPinHash) {
            this.failedAttempts = 0; this.currentPin = '';
            this.updateDots('login');
            this.openWebApp();
        } else {
            this.failedAttempts++; this.currentPin = ''; this.updateDots('login');
            if (this.failedAttempts >= 5) this.startLockout();
            else this.showMessage('Xato', 'Noto\'g\'ri PIN kod kiritildi', '❌');
        }
    },

    handleVerifyPin: async function() {
        const h = await this.hashPin(this.currentPin);
        if (h === this.storedPinHash) {
            this.currentPin = ''; this.updateDots('verify');
            this.closeVerifyModal();
            this.showSettingsModal();
        } else {
            this.currentPin = ''; this.updateDots('verify');
            this.showMessage('Xato', 'Noto\'g\'ri PIN kod', '❌');
        }
    },

    startLockout: function() {
        this.lockoutTimer = 30;
        const msg = document.getElementById('lockout-timer');
        const val = document.getElementById('timer-val');
        msg.classList.remove('hidden');
        const interval = setInterval(() => {
            this.lockoutTimer--; val.innerText = this.lockoutTimer;
            if (this.lockoutTimer <= 0) { clearInterval(interval); msg.classList.add('hidden'); this.failedAttempts = 0; }
        }, 1000);
    },

    // --- APP FLOW ---
    showScreen: function(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        if (id !== 'screen-login') document.getElementById('settings-trigger').classList.add('hidden');
        else document.getElementById('settings-trigger').classList.remove('hidden');
    },

    openWebApp: function() {
        if (this.isNetworkOffline) { this.showScreen('screen-no-internet'); return; }
        document.getElementById('settings-trigger').classList.remove('hidden');
        const opt = 'location=no,toolbar=no,zoom=no,hidden=no,hardwareback=yes';
        this.iabRef = cordova.InAppBrowser.open(this.url, '_blank', opt);
        this.iabRef.addEventListener('loadstop', () => this.injectAll());
        this.iabRef.addEventListener('loaderror', () => { this.iabRef.close(); this.showScreen('screen-no-internet'); });
        this.iabRef.addEventListener('exit', () => { this.iabRef = null; if (!this.isNetworkOffline) this.showScreen('screen-login'); });
    },

    injectAll: function() {
        // Aggressive Pull-To-Refresh Injection
        const ptrScript = `
            (function() {
                if (window.ptrInitialized) return;
                window.ptrInitialized = true;
                let startY = 0, diff = 0, isRefreshing = false;
                const threshold = 160;
                const ptr = document.createElement('div');
                ptr.style.cssText = 'position:fixed;top:-80px;left:5%;width:90%;height:70px;background:rgba(255,255,255,0.1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:20px;z-index:2147483647;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;font-weight:bold;transition:top 0.2s cubic-bezier(0,0,0.2,1);box-shadow:0 10px 30px rgba(0,0,0,0.5);';
                ptr.innerHTML = '⬇️ Yangilash uchun torting';
                document.body.appendChild(ptr);

                const getScroll = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

                window.addEventListener('touchstart', (e) => {
                    if (getScroll() <= 5) startY = e.touches[0].pageY;
                    else startY = -1;
                }, {passive: true});

                window.addEventListener('touchmove', (e) => {
                    if (startY === -1 || isRefreshing) return;
                    diff = e.touches[0].pageY - startY;
                    if (diff > 0 && getScroll() <= 5) {
                        let top = Math.min(diff / 2.5 - 80, 15);
                        ptr.style.top = top + 'px';
                        ptr.innerHTML = (diff > threshold) ? '🔄 Yangilash uchun qo\\u027vorni yuboring' : '⬇️ Yangilash uchun torting';
                    }
                }, {passive: true});

                window.addEventListener('touchend', () => {
                    if (startY === -1 || isRefreshing) return;
                    if (parseInt(ptr.style.top) > 0) {
                        isRefreshing = true; ptr.style.top = '15px'; ptr.innerHTML = '⌛ Yangilanmoqda...';
                        location.reload();
                    } else { ptr.style.top = '-80px'; }
                    startY = -1;
                });
                
                // Extra: Auto reload on stale pages
                window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
            })();
        `;
        this.iabRef.executeScript({ code: ptrScript });
    },

    // --- SETTINGS ACCESS ---
    requestSettingsAccess: function() {
        this.currentPin = '';
        this.updateDots('verify');
        document.getElementById('modal-verify').classList.remove('hidden');
    },

    closeVerifyModal: function() {
        document.getElementById('modal-verify').classList.add('hidden');
    },

    showSettingsModal: function() {
        document.getElementById('modal-settings').classList.remove('hidden');
        document.getElementById('select-autolock').value = localStorage.getItem('autolock_time') || '0';
    },

    hideSettings: function() {
        document.getElementById('modal-settings').classList.add('hidden');
    },

    updateAutoLock: function() { localStorage.setItem('autolock_time', document.getElementById('select-autolock').value); },

    changePinInitiate: function() {
        this.hideSettings(); this.isChangingPin = true; this.currentPin = ''; this.tempPin = '';
        document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating';
        document.getElementById('btn-cancel-set').classList.remove('hidden');
        this.showScreen('screen-set-pin');
    },

    cancelPinSet: function() { this.isChangingPin = false; this.currentPin = ''; this.showScreen('screen-login'); },

    clearCache: function() {
        if (confirm('Barcha kesh va ma\'lumotlar o\'chirilsinmi?')) { localStorage.clear(); location.reload(); }
    },

    checkNetwork: async function() {
        if (navigator.connection.type === Connection.NONE) { this.isNetworkOffline = true; this.showScreen('screen-no-internet'); return false; }
        return true;
    },

    retryConnection: async function() { if (await this.checkNetwork()) this.showScreen(this.storedPinHash ? 'screen-login' : 'screen-set-pin'); },

    onPause: function() { if (this.iabRef) this.iabRef.hide(); this.lastActiveTime = Date.now(); },

    onResume: function() {
        const auto = parseInt(localStorage.getItem('autolock_time') || '0');
        if (auto > 0 && (Date.now() - this.lastActiveTime) / 60000 >= auto) {
            if (this.iabRef) this.iabRef.close();
            this.showScreen('screen-login');
        } else if (this.iabRef) this.iabRef.show();
    },

    onBackKeyDown: function() {
        if (this.iabRef) return;
        if (!document.getElementById('modal-settings').classList.contains('hidden')) this.hideSettings();
        else navigator.app.exitApp();
    }
};
app.init();
