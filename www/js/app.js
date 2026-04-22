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
            this.isChangingPin = false;
            this.showScreen('screen-set-pin');
            document.getElementById('btn-cancel-set').classList.add('hidden');
        } else {
            this.showScreen('screen-login');
        }
        
        document.addEventListener("offline", () => {
            this.isNetworkOffline = true;
            if (this.iabRef) this.iabRef.close();
            this.showScreen('screen-no-internet');
        }, false);
        
        document.addEventListener("online", () => {
            this.isNetworkOffline = false;
        }, false);
    },

    setupNumpads: function() {
        const createNumpad = (containerId, type) => {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            for (let i = 1; i <= 9; i++) {
                const btn = document.createElement('div');
                btn.className = 'num-btn';
                btn.innerText = i;
                btn.onclick = () => this.handlePinInput(i, type);
                container.appendChild(btn);
            }
            const empty = document.createElement('div');
            empty.className = 'num-btn empty';
            container.appendChild(empty);
            const zero = document.createElement('div');
            zero.className = 'num-btn';
            zero.innerText = '0';
            zero.onclick = () => this.handlePinInput(0, type);
            container.appendChild(zero);
            const del = document.createElement('div');
            del.className = 'num-btn';
            del.innerText = '⌫';
            del.onclick = () => this.handlePinInput('del', type);
            container.appendChild(del);
        };
        createNumpad('numpad-set', 'set');
        createNumpad('numpad-login', 'login');
    },

    handlePinInput: async function(val, type) {
        if (this.lockoutTimer > 0) return;

        if (val === 'del') {
            this.currentPin = this.currentPin.slice(0, -1);
        } else if (this.currentPin.length < 4) {
            this.currentPin += val;
        }

        this.updateDots(type);

        if (this.currentPin.length === 4) {
            if (type === 'set') {
                await this.handleSetPin();
            } else {
                await this.handleLogin();
            }
        }
    },

    updateDots: function(type) {
        const dots = document.querySelectorAll(`#screen-${type === 'set' ? 'set-pin' : 'login'} .pin-dot`);
        dots.forEach((dot, index) => {
            if (index < this.currentPin.length) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    },

    hashPin: async function(pin) {
        const msgUint8 = new TextEncoder().encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    handleSetPin: async function() {
        if (!this.tempPin) {
            this.tempPin = this.currentPin;
            this.currentPin = '';
            document.getElementById('set-pin-title').innerText = 'PINni tasdiqlang';
            document.getElementById('set-pin-subtitle').innerText = 'Kodni qaytadan kiriting';
            this.updateDots('set');
        } else {
            if (this.tempPin === this.currentPin) {
                const hash = await this.hashPin(this.currentPin);
                localStorage.setItem('pin_hash', hash);
                this.storedPinHash = hash;
                this.currentPin = '';
                this.tempPin = '';
                this.isChangingPin = false;
                alert('PIN muvaffaqiyatli o\'rnatildi!');
                this.openWebApp();
            } else {
                alert('PIN mos kelmadi. Qayta urinib ko\'ring.');
                this.currentPin = '';
                this.tempPin = '';
                document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating';
                document.getElementById('set-pin-subtitle').innerText = 'Ilovani himoya qilish uchun 4 xonali kod kiriting';
                this.updateDots('set');
            }
        }
    },

    handleLogin: async function() {
        const hash = await this.hashPin(this.currentPin);
        if (hash === this.storedPinHash) {
            this.failedAttempts = 0;
            this.currentPin = '';
            this.updateDots('login');
            this.openWebApp();
        } else {
            this.failedAttempts++;
            this.currentPin = '';
            this.updateDots('login');
            if (this.failedAttempts >= 5) {
                this.startLockout();
            } else {
                alert('Noto\'g\'ri PIN!');
            }
        }
    },

    startLockout: function() {
        this.lockoutTimer = 30;
        const msg = document.getElementById('lockout-timer');
        const val = document.getElementById('timer-val');
        msg.classList.remove('hidden');
        const interval = setInterval(() => {
            this.lockoutTimer--;
            val.innerText = this.lockoutTimer;
            if (this.lockoutTimer <= 0) {
                clearInterval(interval);
                msg.classList.add('hidden');
                this.failedAttempts = 0;
            }
        }, 1000);
    },

    showScreen: function(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');
    },

    checkNetwork: async function() {
        if (navigator.connection.type === Connection.NONE) {
            this.isNetworkOffline = true;
            this.showScreen('screen-no-internet');
            return false;
        }
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 5000);
            await fetch(this.url, { mode: 'no-cors', signal: controller.signal });
            this.isNetworkOffline = false;
            return true;
        } catch (e) {
            this.isNetworkOffline = true;
            this.showScreen('screen-no-internet');
            return false;
        }
    },

    retryConnection: async function() {
        if (await this.checkNetwork()) {
            this.showScreen(this.storedPinHash ? 'screen-login' : 'screen-set-pin');
        }
    },

    openWebApp: function() {
        if (this.isNetworkOffline) {
            this.showScreen('screen-no-internet');
            return;
        }
        const options = 'location=no,toolbar=no,zoom=no,hidden=no,hardwareback=yes,clearcache=no,clearsessioncache=no';
        this.iabRef = cordova.InAppBrowser.open(this.url, '_blank', options);
        this.iabRef.addEventListener('loadstop', () => {
            this.injectPullToRefresh();
            this.injectHistoryHandler();
        });
        this.iabRef.addEventListener('loaderror', () => {
            this.iabRef.close();
            this.showScreen('screen-no-internet');
        });
        this.iabRef.addEventListener('exit', () => {
            this.iabRef = null;
            if (!this.isNetworkOffline) this.showScreen('screen-login');
        });
    },

    injectPullToRefresh: function() {
        const script = `(function() {
            let startY = 0; let isRefreshing = false; const refreshThreshold = 150;
            const ptrDiv = document.createElement('div');
            ptrDiv.style.cssText = 'position:fixed;top:-60px;left:0;width:100%;height:60px;display:flex;align-items:center;justify-content:center;background:rgba(0,123,255,0.9);color:white;z-index:99999;transition:top 0.2s;font-family:sans-serif;';
            ptrDiv.innerHTML = '⬇️ Yangilash uchun torting';
            document.body.appendChild(ptrDiv);
            window.addEventListener('touchstart', (e) => { startY = (window.pageYOffset === 0) ? e.touches[0].pageY : -1; }, {passive: true});
            window.addEventListener('touchmove', (e) => {
                if (startY === -1 || isRefreshing) return;
                let diff = e.touches[0].pageY - startY;
                if (diff > 0) {
                    ptrDiv.style.top = Math.min(diff - 60, 0) + 'px';
                    ptrDiv.innerHTML = (diff > refreshThreshold) ? '🔄 Yangilash uchun qo\\u027vorni yuboring' : '⬇️ Yangilash uchun torting';
                }
            }, {passive: true});
            window.addEventListener('touchend', () => {
                if (startY === -1 || isRefreshing) return;
                if (parseInt(ptrDiv.style.top) >= -10) { isRefreshing = true; ptrDiv.innerHTML = '⌛ Yangilanmoqda...'; location.reload(); }
                else { ptrDiv.style.top = '-60px'; }
                startY = -1;
            });
        })();`;
        this.iabRef.executeScript({ code: script });
    },

    injectHistoryHandler: function() {
        this.iabRef.executeScript({ code: `window.addEventListener('pageshow', function(e) { if (e.persisted) location.reload(); });` });
    },

    onPause: function() {
        if (this.iabRef) this.iabRef.hide();
        this.lastActiveTime = Date.now();
    },

    onResume: function() {
        const autoLockMinutes = parseInt(localStorage.getItem('autolock_time') || '0');
        if (autoLockMinutes > 0) {
            if ((Date.now() - this.lastActiveTime) / 1000 / 60 >= autoLockMinutes) {
                if (this.iabRef) this.iabRef.close();
                this.showScreen('screen-login');
            } else if (this.iabRef) {
                this.iabRef.show();
            }
        } else if (this.iabRef) {
            this.iabRef.show();
        }
    },

    onBackKeyDown: function(e) {
        if (this.iabRef) return;
        if (!document.getElementById('modal-settings').classList.contains('hidden')) {
            this.hideSettings();
        } else if (!document.getElementById('screen-set-pin').classList.contains('hidden') && this.isChangingPin) {
            this.cancelPinSet();
        } else {
            navigator.app.exitApp();
        }
    },

    showSettings: function() {
        document.getElementById('modal-settings').classList.remove('hidden');
        document.getElementById('select-autolock').value = localStorage.getItem('autolock_time') || '0';
    },

    hideSettings: function() {
        document.getElementById('modal-settings').classList.add('hidden');
    },

    updateAutoLock: function() {
        localStorage.setItem('autolock_time', document.getElementById('select-autolock').value);
    },

    changePinInitiate: function() {
        this.hideSettings();
        this.isChangingPin = true;
        this.currentPin = '';
        this.tempPin = '';
        document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating';
        document.getElementById('set-pin-subtitle').innerText = 'Ilovani himoya qilish uchun 4 xonali kod kiriting';
        document.getElementById('btn-cancel-set').classList.remove('hidden');
        this.showScreen('screen-set-pin');
    },

    cancelPinSet: function() {
        this.isChangingPin = false;
        this.currentPin = '';
        this.tempPin = '';
        this.showScreen('screen-login');
    },

    clearCache: function() {
        if (confirm('Barcha kesh va ma\'lumotlar o\'chirilsinmi?')) {
            localStorage.clear();
            location.reload();
        }
    }
};
app.init();
