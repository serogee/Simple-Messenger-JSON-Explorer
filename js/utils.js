window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Utils = (function() {
    const STORAGE_PREFIX = 'fmjv_' + (window.location.hostname || 'local') + '_';

    function setCookie(name, value, days = 365) {
        try {
            const expires = new Date(Date.now() + days * 864e5).toUTCString();
            document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
        } catch(e) {}
    }

    function getCookie(name) {
        try {
            const cookies = document.cookie ? document.cookie.split('; ') : [];
            for (let c of cookies) {
                const [k,v] = c.split('=');
                if (decodeURIComponent(k) === name) return decodeURIComponent(v || '');
            }
        } catch(e) {}
        return null;
    }

    function storageSet(key, value) {
        const k = STORAGE_PREFIX + key;
        try { localStorage.setItem(k, String(value)); return; } catch(e) {}
        try { setCookie(k, String(value)); } catch(e) {}
    }

    function storageGet(key) {
        const k = STORAGE_PREFIX + key;
        try { const v = localStorage.getItem(k); if (v !== null) return v; } catch(e) {}
        try { const v = getCookie(k); if (v !== null) return v; } catch(e) {}
        return null;
    }

    function storageRemove(key) {
        const k = STORAGE_PREFIX + key;
        try { localStorage.removeItem(k); } catch(e) {}
        try { setCookie(k, '', -1); } catch(e) {}
    }

    function escapeHtml(s) { 
        return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]); 
    }

    function chunkArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    function formatInfoNumber(value) {
        return Number(value || 0).toLocaleString();
    }

    function formatInfoDate(timestamp) {
        return timestamp ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
    }

    function padDatePart(value) {
        return String(value).padStart(2, '0');
    }

    return {
        setCookie,
        getCookie,
        storageSet,
        storageGet,
        storageRemove,
        escapeHtml,
        chunkArray,
        formatInfoNumber,
        formatInfoDate,
        padDatePart
    };
})();
