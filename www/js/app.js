var app = {
    url: 'https://dropbox.page.gd/',
    iabRef: null,
    currentPin: '',
    storedPinHash: '',
    tempPin: '',
    lockoutTimer: 0,
    failedAttempts: 0,
    lastActiveTime: Date.now(),
    isNetworkOffline: false,
    currentUrl: '',
    backPressCount: 0,
    pendingExit: false,

    init: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
    },

    onDeviceReady: function() {
        // MUHIM: backbutton faqat deviceready dan KEYIN ro'yxatga olinishi kerak
        this._boundBack = this.onBackKeyDown.bind(this);
        document.addEventListener('backbutton', this._boundBack, false);
        document.addEventListener('pause', this.onPause.bind(this), false);
        document.addEventListener('resume', this.onResume.bind(this), false);
        document.addEventListener('offline', function() {
            app.isNetworkOffline = true;
            if (app.iabRef) app.iabRef.close();
            app.showScreen('screen-no-internet');
        }, false);

        this.storedPinHash = localStorage.getItem('pin_hash');
        this.setupNumpads();
        if (!this.storedPinHash) this.showScreen('screen-set-pin');
        else this.showScreen('screen-login');
    },

    showToast: function(msg) {
        var t = document.getElementById('toast');
        t.innerText = msg;
        t.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(function() { t.classList.add('hidden'); }, 2000);
    },

    showMessage: function(title, text, icon) {
        document.getElementById('info-title').innerText = title;
        document.getElementById('info-text').innerText = text;
        document.getElementById('info-icon').innerText = icon || '✔️';
        document.getElementById('modal-info').classList.remove('hidden');
    },

    closeInfoModal: function() { document.getElementById('modal-info').classList.add('hidden'); },

    setupNumpads: function() {
        var self = this;
        function create(id, type) {
            var c = document.getElementById(id); c.innerHTML = '';
            for (var i = 1; i <= 9; i++) {
                (function(n) {
                    var b = document.createElement('div'); b.className = 'num-btn'; b.innerText = n;
                    b.onclick = function() { self.handleInput(n, type); }; c.appendChild(b);
                })(i);
            }
            var e = document.createElement('div'); e.className = 'num-btn empty'; c.appendChild(e);
            var z = document.createElement('div'); z.className = 'num-btn'; z.innerText = '0';
            z.onclick = function() { self.handleInput(0, type); }; c.appendChild(z);
            var d = document.createElement('div'); d.className = 'num-btn'; d.innerText = '⌫';
            d.onclick = function() { self.handleInput('del', type); }; c.appendChild(d);
        }
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
        var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
        return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    },

    handleSetPin: async function() {
        if (!this.tempPin) {
            this.tempPin = this.currentPin; this.currentPin = '';
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
                this.showMessage('Xato', 'PIN mos kelmadi', '❌');
                this.currentPin = ''; this.tempPin = '';
                document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating';
                this.updateDots('set');
            }
        }
    },

    handleLogin: async function() {
        var h = await this.hashPin(this.currentPin);
        if (h === this.storedPinHash) {
            this.failedAttempts = 0; this.currentPin = ''; this.updateDots('login');
            this.pendingExit = false; this.backPressCount = 0;
            this.openWebApp();
        } else {
            this.failedAttempts++; this.currentPin = ''; this.updateDots('login');
            if (this.failedAttempts >= 5) this.startLockout();
            else this.showMessage('Xato', 'Noto\'g\'ri PIN kod', '❌');
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

    // === WEB APP ===
    openWebApp: function() {
        this.pendingExit = false;
        this.backPressCount = 0;
        var opt = 'location=no,toolbar=no,zoom=no,hidden=no,hardwareback=yes';
        this.iabRef = cordova.InAppBrowser.open(this.url, '_blank', opt);
        var self = this;

        this.iabRef.addEventListener('loadstop', function(e) {
            self.currentUrl = e.url;
            self.injectPTR();
        });

        this.iabRef.addEventListener('exit', function() {
            self.iabRef = null;
            var url = self.currentUrl || '';
            // Dashboard yoki login da IAB yopildi = chiqish so'rash
            if (url.indexOf('dashboard.php') !== -1 || url.indexOf('login.php') !== -1) {
                self.pendingExit = true;
                self.showScreen('screen-login');
                self.showToast('Chiqish uchun yana bir bor bosing');
                self.exitTimer = setTimeout(function() { self.pendingExit = false; }, 3000);
            } else {
                self.showScreen('screen-login');
            }
        });
    },

    injectPTR: function() {
        if (!this.iabRef) return;
        this.iabRef.executeScript({ code:
            '(function(){if(window._ptr)return;window._ptr=1;' +
            'var sY=0,d=0,r=0,th=140;' +
            'var p=document.createElement("div");' +
            'p.style.cssText="position:fixed;top:-100px;left:50%;transform:translateX(-50%);width:60px;height:60px;background:rgba(255,255,255,.15);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.3);border-radius:50%;z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:top .2s cubic-bezier(.175,.885,.32,1.275);";' +
            'p.innerHTML=\'<svg id="ps" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .1s"><path d="M7 13l5 5 5-5M12 18V6"/></svg>\';' +
            'document.body.appendChild(p);' +
            'var gs=function(){return window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0};' +
            'window.addEventListener("touchstart",function(e){sY=gs()<=5?e.touches[0].pageY:-1},{passive:1});' +
            'window.addEventListener("touchmove",function(e){if(sY<0||r)return;d=e.touches[0].pageY-sY;if(d>0&&gs()<=5){p.style.top=Math.min(d/2.2-80,40)+"px";var s=document.getElementById("ps");if(s)s.style.transform="rotate("+(d>th?180:Math.min(d*2,180))+"deg)";p.style.background=d>th?"rgba(0,123,255,.6)":"rgba(255,255,255,.15)"}},{passive:1});' +
            'window.addEventListener("touchend",function(){if(sY<0||r)return;if(parseInt(p.style.top)>20&&d>th){r=1;p.style.top="40px";p.innerHTML="<div style=\\"width:20px;height:20px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;animation:pr .6s linear infinite\\"></div>";var s=document.createElement("style");s.innerHTML="@keyframes pr{to{transform:rotate(360deg)}}";document.head.appendChild(s);location.reload()}else{p.style.top="-100px"}sY=-1});' +
            '})()'
        });
    },

    // === ILOVADAN CHIQISH ===
    forceExit: function() {
        // Yangi qo'shilgan cordova-plugin-exit orqali kafolatlangan chiqish
        try { if (window.cordova && cordova.plugins && cordova.plugins.exit) cordova.plugins.exit(); } catch(e) {}
        
        // Standart Cordova chiqish metodlari
        try { navigator.app.exitApp(); } catch(e) {}
        try { navigator.device.exitApp(); } catch(e) {}
        
        // Eng so'nggi chora: browser tarixidan orqaga qaytish (Android'da ilovani yopishga olib keladi)
        try { window.history.back(); } catch(e) {}
    },

    // === BACK BUTTON (faqat Cordova ekranlarida ishlaydi, IAB o'zi boshqaradi) ===
    onBackKeyDown: function(e) {
        e.preventDefault();

        // 1. Agar dashboard dan kelgan bo'lsa — darhol chiqish
        if (this.pendingExit) {
            clearTimeout(this.exitTimer);
            this.pendingExit = false;
            this.forceExit();
            return;
        }

        // 2. Modallar
        if (!document.getElementById('modal-info').classList.contains('hidden')) { this.closeInfoModal(); return; }
        if (!document.getElementById('modal-settings').classList.contains('hidden')) { this.hideSettings(); return; }
        if (!document.getElementById('modal-verify').classList.contains('hidden')) { this.closeVerifyModal(); return; }

        // 3. PIN ekranida — double back exit
        var self = this;
        this.backPressCount++;
        if (this.backPressCount === 1) {
            this.showToast('Chiqish uchun yana bir bor bosing');
            setTimeout(function() { self.backPressCount = 0; }, 2000);
        } else {
            this.forceExit();
        }
    },

    // === SETTINGS ===
    requestSettingsAccess: function() { this.currentPin = ''; this.updateDots('verify'); document.getElementById('modal-verify').classList.remove('hidden'); },
    closeVerifyModal: function() { document.getElementById('modal-verify').classList.add('hidden'); },
    showSettingsModal: function() { document.getElementById('modal-settings').classList.remove('hidden'); document.getElementById('select-autolock').value = localStorage.getItem('autolock_time') || '0'; },
    hideSettings: function() { document.getElementById('modal-settings').classList.add('hidden'); },
    updateAutoLock: function() { localStorage.setItem('autolock_time', document.getElementById('select-autolock').value); },
    changePinInitiate: function() { this.hideSettings(); this.currentPin = ''; this.tempPin = ''; document.getElementById('set-pin-title').innerText = 'Yangi PIN o\'rnating'; document.getElementById('btn-cancel-set').classList.remove('hidden'); this.showScreen('screen-set-pin'); },
    cancelPinSet: function() { this.currentPin = ''; this.showScreen('screen-login'); },
    clearCache: function() { if (confirm('Barcha kesh o\'chirilsinmi?')) { localStorage.clear(); location.reload(); } },
    retryConnection: function() { if (navigator.connection.type !== Connection.NONE) { this.isNetworkOffline = false; this.showScreen(this.storedPinHash ? 'screen-login' : 'screen-set-pin'); } },
    onPause: function() { if (this.iabRef) this.iabRef.hide(); this.lastActiveTime = Date.now(); },
    onResume: function() {
        var auto = parseInt(localStorage.getItem('autolock_time') || '0');
        if (auto > 0 && (Date.now() - this.lastActiveTime) / 60000 >= auto) { if (this.iabRef) this.iabRef.close(); this.showScreen('screen-login'); }
        else if (this.iabRef) this.iabRef.show();
    }
};
app.init();
