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

    // === NAVIGATION HISTORY (Cordova tomonida boshqariladi) ===
    navHistory: [],
    backPressCount: 0,

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

    // === TOAST ===
    showToast: function(msg) {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
    },

    // === CUSTOM MESSAGE DIALOG ===
    showMessage: function(title, text, icon) {
        icon = icon || '✔️';
        document.getElementById('info-title').innerText = title;
        document.getElementById('info-text').innerText = text;
        document.getElementById('info-icon').innerText = icon;
        document.getElementById('modal-info').classList.remove('hidden');
    },
    closeInfoModal: function() { document.getElementById('modal-info').classList.add('hidden'); },

    // === NUMPAD ===
    setupNumpads: function() {
        var self = this;
        var create = function(id, type) {
            var container = document.getElementById(id); container.innerHTML = '';
            for (var i = 1; i <= 9; i++) {
                (function(num) {
                    var b = document.createElement('div'); b.className = 'num-btn'; b.innerText = num;
                    b.onclick = function() { self.handleInput(num, type); }; container.appendChild(b);
                })(i);
            }
            var empty = document.createElement('div'); empty.className = 'num-btn empty'; container.appendChild(empty);
            var z = document.createElement('div'); z.className = 'num-btn'; z.innerText = '0';
            z.onclick = function() { self.handleInput(0, type); }; container.appendChild(z);
            var d = document.createElement('div'); d.className = 'num-btn'; d.innerText = '⌫';
            d.onclick = function() { self.handleInput('del', type); }; container.appendChild(d);
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
        var sel = type === 'verify' ? '#modal-verify .pin-dot' : '#screen-' + (type === 'set' ? 'set-pin' : 'login') + ' .pin-dot';
        var dots = document.querySelectorAll(sel);
        for (var i = 0; i < dots.length; i++) {
            if (i < this.currentPin.length) dots[i].classList.add('active');
            else dots[i].classList.remove('active');
        }
    },

    hashPin: async function(pin) {
        var msgUint8 = new TextEncoder().encode(pin);
        var hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
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
        var h = await this.hashPin(this.currentPin);
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
        var h = await this.hashPin(this.currentPin);
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
        var msg = document.getElementById('lockout-timer');
        var val = document.getElementById('timer-val');
        msg.classList.remove('hidden');
        var self = this;
        var interval = setInterval(function() {
            self.lockoutTimer--; val.innerText = self.lockoutTimer;
            if (self.lockoutTimer <= 0) { clearInterval(interval); msg.classList.add('hidden'); self.failedAttempts = 0; }
        }, 1000);
    },

    showScreen: function(id) {
        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.add('hidden');
        document.getElementById(id).classList.remove('hidden');
        if (id === 'screen-login') document.getElementById('settings-trigger').classList.remove('hidden');
        else document.getElementById('settings-trigger').classList.add('hidden');
    },

    // ======================================================================
    // === ASOSIY YECHIM: hardwareback=no + Cordova tomonida tarix yuritish ===
    // ======================================================================
    openWebApp: function() {
        this.navHistory = []; // Tarixni tozalaymiz
        this.backPressCount = 0;

        // hardwareback=no — Orqaga tugmasi HECH QACHON InAppBrowser tomonidan boshqarilmaydi.
        // Barcha back press'lar Cordova'ning 'backbutton' eventiga tushadi.
        var opt = 'location=no,toolbar=no,zoom=no,hidden=no,hardwareback=no';
        this.iabRef = cordova.InAppBrowser.open(this.url, '_blank', opt);

        var self = this;
        this.iabRef.addEventListener('loadstop', function(e) {
            var newUrl = e.url;

            // Dublikatlarni oldini olish (reload qilinganda bir xil URL qayta qo'shilmasin)
            if (self.navHistory.length === 0 || self.navHistory[self.navHistory.length - 1] !== newUrl) {
                self.navHistory.push(newUrl);
            }

            // Reset back press counter chunki yangi sahifa ochildi
            self.backPressCount = 0;

            self.injectPullToRefresh();
        });

        this.iabRef.addEventListener('exit', function() {
            self.iabRef = null;
            self.navHistory = [];
            self.showScreen('screen-login');
        });
    },

    injectPullToRefresh: function() {
        var ptrScript = '(function() {' +
            'if (window.ptrInitialized) return; window.ptrInitialized = true;' +
            'var startY = 0, diff = 0, isRefreshing = false;' +
            'var threshold = 140;' +
            'var ptr = document.createElement("div");' +
            'ptr.style.cssText = "position:fixed;top:-100px;left:50%;transform:translateX(-50%);width:60px;height:60px;background:rgba(255,255,255,0.15);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.3);border-radius:50%;z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:top 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.2s;";' +
            'ptr.innerHTML = \'<svg id="ptr-svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.1s linear;"><path d="M7 13l5 5 5-5M12 18V6"/></svg>\';' +
            'document.body.appendChild(ptr);' +
            'var getScroll = function() { return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0; };' +
            'window.addEventListener("touchstart", function(e) { if (getScroll() <= 5) startY = e.touches[0].pageY; else startY = -1; }, {passive: true});' +
            'window.addEventListener("touchmove", function(e) {' +
            '    if (startY === -1 || isRefreshing) return;' +
            '    diff = e.touches[0].pageY - startY;' +
            '    if (diff > 0 && getScroll() <= 5) {' +
            '        var top = Math.min(diff / 2.2 - 80, 40); ptr.style.top = top + "px";' +
            '        var rotation = Math.min(diff * 2, 180);' +
            '        var svg = document.getElementById("ptr-svg");' +
            '        if(svg) svg.style.transform = "rotate(" + (diff > threshold ? 180 : rotation) + "deg)";' +
            '        ptr.style.background = diff > threshold ? "rgba(0,123,255,0.6)" : "rgba(255,255,255,0.15)";' +
            '    }' +
            '}, {passive: true});' +
            'window.addEventListener("touchend", function() {' +
            '    if (startY === -1 || isRefreshing) return;' +
            '    if (parseInt(ptr.style.top) > 20 && diff > threshold) {' +
            '        isRefreshing = true; ptr.style.top = "40px";' +
            '        ptr.innerHTML = "<div style=\\"width:20px;height:20px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;animation:ptr-rot 0.6s linear infinite;\\"></div>";' +
            '        var s = document.createElement("style"); s.innerHTML = "@keyframes ptr-rot{to{transform:rotate(360deg)}}";' +
            '        document.head.appendChild(s); location.reload();' +
            '    } else { ptr.style.top = "-100px"; }' +
            '    startY = -1;' +
            '});' +
            '})();';
        this.iabRef.executeScript({ code: ptrScript });
    },

    // ======================================================================
    // === ORQAGA QAYTISH TUGMASI — Yagona boshqaruv markazi ===
    // ======================================================================
    onBackKeyDown: function() {
        var self = this;

        // 1. Modallar ochiq bo'lsa — yopish
        if (!document.getElementById('modal-info').classList.contains('hidden')) {
            this.closeInfoModal(); return;
        }
        if (!document.getElementById('modal-settings').classList.contains('hidden')) {
            this.hideSettings(); return;
        }
        if (!document.getElementById('modal-verify').classList.contains('hidden')) {
            this.closeVerifyModal(); return;
        }

        // 2. InAppBrowser ochiq bo'lsa — tarixni boshqarish
        if (this.iabRef) {
            // Tarixda oldingi sahifa bormi?
            if (this.navHistory.length > 1) {
                // Joriy sahifani o'chirish
                this.navHistory.pop();
                // Oldingi sahifaga o'tish
                var prevUrl = this.navHistory[this.navHistory.length - 1];
                this.iabRef.executeScript({ code: 'window.location.href = "' + prevUrl + '";' });
                this.backPressCount = 0;
            } else {
                // Tarixda faqat bitta sahifa qoldi (dashboard yoki login)
                // Double back exit
                this.backPressCount++;
                if (this.backPressCount === 1) {
                    // InAppBrowser ichida toast ko'rsatish
                    this.iabRef.executeScript({ code:
                        'var t = document.createElement("div");' +
                        't.innerText = "Chiqish uchun yana bir bor bosing";' +
                        't.style.cssText = "position:fixed;bottom:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:white;padding:12px 24px;border-radius:25px;z-index:2147483647;font-family:sans-serif;font-size:14px;";' +
                        'document.body.appendChild(t);' +
                        'setTimeout(function(){ t.style.opacity = "0"; t.style.transition = "opacity 0.3s"; setTimeout(function(){ t.remove(); }, 300); }, 2000);'
                    });
                    setTimeout(function() { self.backPressCount = 0; }, 2000);
                } else if (this.backPressCount >= 2) {
                    this.iabRef.close();
                    navigator.app.exitApp();
                }
            }
            return;
        }

        // 3. PIN ekranida — Double back exit
        if (!document.getElementById('screen-login').classList.contains('hidden') ||
            !document.getElementById('screen-set-pin').classList.contains('hidden')) {
            this.backPressCount++;
            if (this.backPressCount === 1) {
                this.showToast('Chiqish uchun yana bir bor bosing');
                setTimeout(function() { self.backPressCount = 0; }, 2000);
            } else if (this.backPressCount >= 2) {
                navigator.app.exitApp();
            }
            return;
        }
    },

    // === SETTINGS ===
    requestSettingsAccess: function() { this.currentPin = ''; this.updateDots('verify'); document.getElementById('modal-verify').classList.remove('hidden'); },
    closeVerifyModal: function() { document.getElementById('modal-verify').classList.add('hidden'); },
    showSettingsModal: function() { document.getElementById('modal-settings').classList.remove('hidden'); document.getElementById('select-autolock').value = localStorage.getItem('autolock_time') || '0'; },
    hideSettings: function() { document.getElementById('modal-settings').classList.add('hidden'); },
    updateAutoLock: function() { localStorage.setItem('autolock_time', document.getElementById('select-autolock').value); },
    changePinInitiate: function() { this.hideSettings(); this.isChangingPin = true; this.currentPin = ''; this.tempPin = ''; document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating'; document.getElementById('btn-cancel-set').classList.remove('hidden'); this.showScreen('screen-set-pin'); },
    cancelPinSet: function() { this.isChangingPin = false; this.currentPin = ''; this.showScreen('screen-login'); },
    clearCache: function() { if (confirm('Barcha kesh va ma\'lumotlar o\'chirilsinmi?')) { localStorage.clear(); location.reload(); } },
    retryConnection: async function() {
        if (navigator.connection.type !== Connection.NONE) {
            this.isNetworkOffline = false;
            this.showScreen(this.storedPinHash ? 'screen-login' : 'screen-set-pin');
        }
    },
    onPause: function() { if (this.iabRef) this.iabRef.hide(); this.lastActiveTime = Date.now(); },
    onResume: function() {
        var auto = parseInt(localStorage.getItem('autolock_time') || '0');
        if (auto > 0 && (Date.now() - this.lastActiveTime) / 60000 >= auto) { if (this.iabRef) this.iabRef.close(); this.showScreen('screen-login'); }
        else if (this.iabRef) this.iabRef.show();
    }
};
app.init();
