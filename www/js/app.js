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
    currentUrl: '',
    backPressCount: 0,
    backPressTimer: null,

    init: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
        document.addEventListener('pause', this.onPause.bind(this), false);
        document.addEventListener('resume', this.onResume.bind(this), false);
        document.addEventListener('backbutton', this.onBackKeyDown.bind(this), false);
    },

    onDeviceReady: function() {
        this.storedPinHash = localStorage.getItem('pin_hash');
        this.setupNumpads();
        if (!this.storedPinHash) this.showScreen('screen-set-pin');
        else this.showScreen('screen-login');
        document.addEventListener("offline", () => {
            this.isNetworkOffline = true;
            if (this.iabRef) this.iabRef.close();
            this.showScreen('screen-no-internet');
        }, false);
    },

    showToast: function(msg) {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
    },

    showMessage: function(title, text, icon = '✔️') {
        document.getElementById('info-title').innerText = title;
        document.getElementById('info-text').innerText = text;
        document.getElementById('info-icon').innerText = icon;
        document.getElementById('modal-info').classList.remove('hidden');
    },

    closeInfoModal: function() { document.getElementById('modal-info').classList.add('hidden'); },

    setupNumpads: function() {
        const create = (id, type) => {
            const container = document.getElementById(id); container.innerHTML = '';
            for (let i = 1; i <= 9; i++) {
                const b = document.createElement('div'); b.className = 'num-btn'; b.innerText = i;
                b.onclick = () => this.handleInput(i, type); container.appendChild(b);
            }
            container.appendChild(Object.assign(document.createElement('div'), {className:'num-btn empty'}));
            const z = document.createElement('div'); z.className = 'num-btn'; z.innerText = '0';
            z.onclick = () => this.handleInput(0, type); container.appendChild(z);
            const d = document.createElement('div'); d.className = 'num-btn'; d.innerText = '⌫';
            d.onclick = () => this.handleInput('del', type); container.appendChild(d);
        };
        create('numpad-set', 'set'); create('numpad-login', 'login'); create('numpad-verify', 'verify');
    },

    handleInput: async function(val, type) {
        if (this.lockoutTimer > 0 && type === 'login') return;
        if (val === 'del') this.currentPin = this.currentPin.slice(0, -1);
        else if (this.currentPin.length < 4) this.currentPin += val;
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
            this.tempPin = this.currentPin; this.currentPin = '';
            document.getElementById('set-pin-title').innerText = 'PINni tasdiqlang'; this.updateDots('set');
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
                document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating'; this.updateDots('set');
            }
        }
    },

    handleLogin: async function() {
        const h = await this.hashPin(this.currentPin);
        if (h === this.storedPinHash) {
            this.failedAttempts = 0; this.currentPin = ''; this.updateDots('login');
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
            this.closeVerifyModal(); this.showSettingsModal();
        } else {
            this.currentPin = ''; this.updateDots('verify');
            this.showMessage('Xato', 'Noto\'g\'ri PIN kod', '❌');
        }
    },

    startLockout: function() {
        this.lockoutTimer = 30;
        const msg = document.getElementById('lockout-timer'); const val = document.getElementById('timer-val');
        msg.classList.remove('hidden');
        const interval = setInterval(() => {
            this.lockoutTimer--; val.innerText = this.lockoutTimer;
            if (this.lockoutTimer <= 0) { clearInterval(interval); msg.classList.add('hidden'); this.failedAttempts = 0; }
        }, 1000);
    },

    showScreen: function(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        if (id === 'screen-login') document.getElementById('settings-trigger').classList.remove('hidden');
        else document.getElementById('settings-trigger').classList.add('hidden');
    },

    openWebApp: function() {
        // hardwareback=no to intercept and handle double-press / refresh
        const opt = 'location=no,toolbar=no,zoom=no,hidden=no,hardwareback=no';
        this.iabRef = cordova.InAppBrowser.open(this.url, '_blank', opt);
        this.iabRef.addEventListener('loadstop', (e) => {
            this.currentUrl = e.url;
            this.injectAll();
        });
        this.iabRef.addEventListener('exit', () => { this.iabRef = null; this.showScreen('screen-login'); });
    },

    injectAll: function() {
        const ptrScript = `
            (function() {
                if (window.ptrInitialized) return; window.ptrInitialized = true;
                let startY = 0, diff = 0, isRefreshing = false;
                const threshold = 140;
                const ptr = document.createElement('div');
                ptr.id = 'custom-ptr';
                ptr.style.cssText = 'position:fixed;top:-100px;left:50%;transform:translateX(-50%);width:60px;height:60px;background:rgba(255,255,255,0.15);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.3);border-radius:50%;z-index:2147483647;display:flex;align-items:center;justify-content:center;transition:top 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.2s;';
                ptr.innerHTML = '<svg id="ptr-svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.1s linear;"><path d="M7 13l5 5 5-5M12 18V6"/></svg>';
                document.body.appendChild(ptr);
                const getScroll = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                window.addEventListener('touchstart', (e) => { if (getScroll() <= 5) startY = e.touches[0].pageY; else startY = -1; }, {passive: true});
                window.addEventListener('touchmove', (e) => {
                    if (startY === -1 || isRefreshing) return;
                    diff = e.touches[0].pageY - startY;
                    if (diff > 0 && getScroll() <= 5) {
                        let top = Math.min(diff / 2.2 - 80, 40); ptr.style.top = top + 'px';
                        let rotation = Math.min(diff * 2, 180);
                        document.getElementById('ptr-svg').style.transform = 'rotate(' + (diff > threshold ? 180 : rotation) + 'deg)';
                        ptr.style.background = diff > threshold ? 'rgba(0,123,255,0.6)' : 'rgba(255,255,255,0.15)';
                    }
                }, {passive: true});
                window.addEventListener('touchend', () => {
                    if (startY === -1 || isRefreshing) return;
                    if (parseInt(ptr.style.top) > 20 && diff > threshold) {
                        isRefreshing = true; ptr.style.top = '40px'; ptr.innerHTML = '<div class="ptr-loader"></div>';
                        const s = document.createElement('style'); s.innerHTML = '.ptr-loader{width:20px;height:20px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;animation:ptr-rot 0.6s linear infinite;} @keyframes ptr-rot{to{transform:rotate(360deg)}}';
                        document.head.appendChild(s); location.reload();
                    } else { ptr.style.top = '-100px'; }
                    startY = -1;
                });
                // Force refresh on history back
                window.onpopstate = function() { location.reload(); };
            })();
        `;
        this.iabRef.executeScript({ code: ptrScript });
    },

    onBackKeyDown: function() {
        const now = Date.now();
        
        // 1. PIN screens exit logic
        if (!document.getElementById('screen-login').classList.contains('hidden') || 
            !document.getElementById('screen-set-pin').classList.contains('hidden')) {
            this.handleDoubleBackExit();
            return;
        }

        // 2. IAB handling
        if (this.iabRef) {
            // Check if dashboard
            if (this.currentUrl.includes('dashboard.php')) {
                this.handleDoubleBackExit();
                return;
            }

            // Normal back with history
            this.iabRef.executeScript({ 
                code: `(function(){
                    if(window.history.length > 1) { 
                        window.history.back(); 
                        return 'BACK_OK'; 
                    } else { 
                        return 'DASHBOARD_OR_EMPTY'; 
                    }
                })()` 
            }, (res) => {
                if (res && res[0] === 'DASHBOARD_OR_EMPTY') {
                    this.handleDoubleBackExit();
                }
                // Reset counter on any successful back within history
                this.backPressCount = 0;
            });
            return;
        }

        // 3. Modals
        if (!document.getElementById('modal-settings').classList.contains('hidden')) this.hideSettings();
        else if (!document.getElementById('modal-verify').classList.contains('hidden')) this.closeVerifyModal();
        else this.handleDoubleBackExit();
    },

    handleDoubleBackExit: function() {
        this.backPressCount++;
        if (this.backPressCount === 1) {
            this.showToast('Chiqish uchun yana bir bor bosing');
            setTimeout(() => { this.backPressCount = 0; }, 2000);
        } else if (this.backPressCount >= 2) {
            if (this.iabRef) this.iabRef.close();
            navigator.app.exitApp();
        }
    },

    requestSettingsAccess: function() { this.currentPin = ''; this.updateDots('verify'); document.getElementById('modal-verify').classList.remove('hidden'); },
    closeVerifyModal: function() { document.getElementById('modal-verify').classList.add('hidden'); },
    showSettingsModal: function() { document.getElementById('modal-settings').classList.remove('hidden'); document.getElementById('select-autolock').value = localStorage.getItem('autolock_time') || '0'; },
    hideSettings: function() { document.getElementById('modal-settings').classList.add('hidden'); },
    updateAutoLock: function() { localStorage.setItem('autolock_time', document.getElementById('select-autolock').value); },
    changePinInitiate: function() { this.hideSettings(); this.isChangingPin = true; this.currentPin = ''; this.tempPin = ''; document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating'; document.getElementById('btn-cancel-set').classList.remove('hidden'); this.showScreen('screen-set-pin'); },
    cancelPinSet: function() { this.isChangingPin = false; this.currentPin = ''; this.showScreen('screen-login'); },
    clearCache: function() { if (confirm('Barcha kesh va ma\'lumotlar o\'chirilsinmi?')) { localStorage.clear(); location.reload(); } },
    onPause: function() { if (this.iabRef) this.iabRef.hide(); this.lastActiveTime = Date.now(); },
    onResume: function() {
        const auto = parseInt(localStorage.getItem('autolock_time') || '0');
        if (auto > 0 && (Date.now() - this.lastActiveTime) / 60000 >= auto) { if (this.iabRef) this.iabRef.close(); this.showScreen('screen-login'); } 
        else if (this.iabRef) this.iabRef.show();
    }
};
app.init();
