window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.UI = (function() {
    const Utils = window.MessengerApp.Utils;
    const State = window.MessengerApp.State;

    function clampSidebarWidth(width) {
        const viewportWidth = window.innerWidth || 1200;
        const min = 260;
        const max = Math.min(640, Math.max(min, viewportWidth * 0.55));
        return Math.min(max, Math.max(min, width));
    }

    function setSidebarWidth(width, persist = false) {
        const clamped = clampSidebarWidth(width);
        State.currentSidebarWidth = clamped;
        document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
        if (persist) Utils.storageSet('sidebarWidth', String(Math.round(clamped)));
    }

    function getResizeGhostLine() {
        let line = document.getElementById('resizeGhostLine');
        if (!line) {
            line = document.createElement('div');
            line.id = 'resizeGhostLine';
            line.className = 'resize-ghost-line';
            document.body.appendChild(line);
        }
        return line;
    }

    function showResizeGhostLine(x) {
        const line = getResizeGhostLine();
        line.style.left = `${Math.round(x)}px`;
        line.classList.add('active');
    }

    function hideResizeGhostLine() {
        document.getElementById('resizeGhostLine')?.classList.remove('active');
    }

    function setupSidebarResize() {
        const handle = document.getElementById('sidebarResizeHandle');
        const container = document.querySelector('.container');
        if (!handle || !container || handle.dataset.bound) return;
        handle.dataset.bound = '1';

        const savedWidth = Number(Utils.storageGet('sidebarWidth'));
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
            setSidebarWidth(savedWidth);
        } else {
            State.currentSidebarWidth = clampSidebarWidth(handle.getBoundingClientRect().left - container.getBoundingClientRect().left);
        }

        let resizing = false;
        let dragOffset = 0;
        let pendingWidth = null;

        const stopResize = () => {
            if (!resizing) return;
            resizing = false;
            container.classList.remove('resizing');
            hideResizeGhostLine();
            if (Number.isFinite(pendingWidth)) setSidebarWidth(pendingWidth, true);
            pendingWidth = null;
        };

        handle.addEventListener('pointerdown', event => {
            resizing = true;
            const handleRect = handle.getBoundingClientRect();
            dragOffset = event.clientX - (handleRect.left + handleRect.width / 2);
            pendingWidth = State.currentSidebarWidth;
            showResizeGhostLine(handleRect.left + handleRect.width / 2);
            container.classList.add('resizing');
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!resizing) return;
            const handleCenter = event.clientX - dragOffset;
            pendingWidth = clampSidebarWidth(handleCenter - container.getBoundingClientRect().left - handle.offsetWidth / 2);
            showResizeGhostLine(container.getBoundingClientRect().left + pendingWidth + handle.offsetWidth / 2);
        });

        handle.addEventListener('pointerup', stopResize);
        handle.addEventListener('pointercancel', stopResize);

        handle.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const current = Number.isFinite(State.currentSidebarWidth) ? State.currentSidebarWidth : clampSidebarWidth(handle.getBoundingClientRect().left - container.getBoundingClientRect().left);
            const delta = event.key === 'ArrowRight' ? 20 : -20;
            setSidebarWidth(current + delta, true);
        });

        window.addEventListener('resize', () => {
            if (Number.isFinite(State.currentSidebarWidth)) setSidebarWidth(State.currentSidebarWidth);
        });
    }

    function clampInfoPanelWidth(width) {
        const viewportWidth = window.innerWidth || 1200;
        const min = 340;
        const max = Math.min(520, Math.max(min, viewportWidth * 0.45));
        return Math.min(max, Math.max(min, width));
    }

    function setInfoPanelWidth(width, persist = false) {
        const clamped = clampInfoPanelWidth(width);
        State.currentInfoPanelWidth = clamped;
        document.documentElement.style.setProperty('--info-panel-width', `${clamped}px`);
        if (persist) Utils.storageSet('infoPanelWidth', String(Math.round(clamped)));
    }

    function setupInfoPanelControls() {
        const container = document.querySelector('.container');
        const toggle = document.getElementById('chatInfoToggle');
        const panel = document.getElementById('chatInfoPanel');
        const handle = document.getElementById('infoResizeHandle');
        if (!container || !toggle || !panel || !handle || toggle.dataset.bound) return;
        toggle.dataset.bound = '1';

        const savedOpen = Utils.storageGet('infoPanelOpen') === '1';
        const savedWidth = Number(Utils.storageGet('infoPanelWidth'));
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
            setInfoPanelWidth(savedWidth);
        }

        const setOpen = (open) => {
            container.classList.toggle('info-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            panel.setAttribute('aria-hidden', open ? 'false' : 'true');
            Utils.storageSet('infoPanelOpen', open ? '1' : '0');
        };

        setOpen(savedOpen);
        toggle.addEventListener('click', () => setOpen(!container.classList.contains('info-open')));

        let resizing = false;
        let dragOffset = 0;
        let pendingWidth = null;

        const stopResize = () => {
            if (!resizing) return;
            resizing = false;
            container.classList.remove('resizing');
            hideResizeGhostLine();
            if (Number.isFinite(pendingWidth)) setInfoPanelWidth(pendingWidth, true);
            pendingWidth = null;
        };

        handle.addEventListener('pointerdown', event => {
            resizing = true;
            const handleRect = handle.getBoundingClientRect();
            dragOffset = event.clientX - (handleRect.left + handleRect.width / 2);
            pendingWidth = State.currentInfoPanelWidth;
            showResizeGhostLine(handleRect.left + handleRect.width / 2);
            container.classList.add('resizing');
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!resizing) return;
            const containerRect = container.getBoundingClientRect();
            const handleCenter = event.clientX - dragOffset;
            pendingWidth = clampInfoPanelWidth(containerRect.right - handleCenter - handle.offsetWidth / 2 - 20);
            showResizeGhostLine(containerRect.right - pendingWidth - handle.offsetWidth / 2 - 20);
        });

        handle.addEventListener('pointerup', stopResize);
        handle.addEventListener('pointercancel', stopResize);

        handle.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const current = Number.isFinite(State.currentInfoPanelWidth) ? State.currentInfoPanelWidth : clampInfoPanelWidth(panel.getBoundingClientRect().width);
            const delta = event.key === 'ArrowLeft' ? 20 : -20;
            setInfoPanelWidth(current + delta, true);
        });

        window.addEventListener('resize', () => {
            if (Number.isFinite(State.currentInfoPanelWidth)) setInfoPanelWidth(State.currentInfoPanelWidth);
        });
    }

    function setDarkMode(enabled, persist = true) {
        if (enabled) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        if (persist) Utils.storageSet('darkMode', enabled ? '1' : '0');
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) darkModeToggle.checked = !!enabled;
    }

    function setupThemeAndSettings() {
        const globalSettingsBtn = document.getElementById('globalSettingsBtn');
        const globalSettingsMenu = document.getElementById('globalSettingsMenu');
        const darkModeToggle = document.getElementById('darkModeToggle');

        globalSettingsBtn?.addEventListener('click', (e) => {
            const isOpen = globalSettingsMenu && globalSettingsMenu.getAttribute('aria-hidden') === 'false';
            if (globalSettingsMenu) globalSettingsMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
            if (globalSettingsBtn) globalSettingsBtn.classList.toggle('open', !isOpen);
            if (!isOpen) { globalSettingsBtn.setAttribute('aria-expanded', 'true'); }
            else { globalSettingsBtn.setAttribute('aria-expanded', 'false'); }
        });

        darkModeToggle?.addEventListener('change', (e) => { setDarkMode(e.target.checked, true); });

        try {
            const pref = Utils.storageGet('darkMode');
            if (pref === '1') setDarkMode(true, false);
            else if (pref === '0') setDarkMode(false, false);
            else setDarkMode(true, false); // Default to dark
        } catch(e) {}
    }

    function showTrustModalIfNeeded() {
        const trustModal = document.getElementById('trustModal');
        const trustClose = document.getElementById('trustClose');
        const trustCloseAlt = document.getElementById('trustCloseAlt');
        const dontShowAgain = document.getElementById('dontShowAgain');
        const trustBackdrop = document.querySelector('.trust-backdrop');
        
        const closeTrustModal = () => {
            if (!trustModal) return;
            if (dontShowAgain && dontShowAgain.checked) {
                try { Utils.storageSet('dontShowTrustModal', '1'); } catch(e){}
            }
            trustModal.setAttribute('aria-hidden', 'true');
        };

        trustClose?.addEventListener('click', closeTrustModal);
        trustCloseAlt?.addEventListener('click', closeTrustModal);
        trustBackdrop?.addEventListener('click', closeTrustModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && trustModal && trustModal.getAttribute('aria-hidden') === 'false') {
                closeTrustModal();
            }
        });

        try {
            const skip = Utils.storageGet('dontShowTrustModal');
            if (skip === '1') return;
        } catch(e) {}
        
        if (!trustModal) return;
        trustModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => { try { trustClose.focus(); } catch(e){} }, 60);
    }

    function setupReactionModal() {
        const chatContainer = document.getElementById('chat');
        const modal = document.getElementById('reactionModal');
        const closeBtn = document.getElementById('reactionModalClose');
        const tabsContainer = document.getElementById('reactionModalTabs');
        const listContainer = document.getElementById('reactionModalList');
        
        if (!chatContainer || !modal || !closeBtn || !tabsContainer || !listContainer) return;
        
        const closeModal = () => {
            modal.setAttribute('aria-hidden', 'true');
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
        });

        chatContainer.addEventListener('click', (e) => {
            const bubble = e.target.closest('.reaction-bubble');
            if (!bubble) return;
            const messageEl = bubble.closest('.message');
            if (!messageEl) return;
            const rawMessage = messageEl.__rawMessage;
            if (!rawMessage || !rawMessage.reactions || !rawMessage.reactions.length) return;
            
            renderReactionModalContent(rawMessage.reactions);
            modal.setAttribute('aria-hidden', 'false');
        });

        function renderReactionModalContent(reactions, activeTab = 'All') {
            const counts = {};
            const uniqueEmojis = new Set();
            reactions.forEach(r => {
                counts[r.reaction] = (counts[r.reaction] || 0) + 1;
                uniqueEmojis.add(r.reaction);
            });
            const emojis = Array.from(uniqueEmojis);
            
            let tabsHtml = `<button class="reaction-tab ${activeTab === 'All' ? 'active' : ''}" data-tab="All">All ${reactions.length}</button>`;
            emojis.forEach(emoji => {
                tabsHtml += `<button class="reaction-tab ${activeTab === emoji ? 'active' : ''}" data-tab="${Utils.escapeHtml(emoji)}">${Utils.escapeHtml(emoji)} ${counts[emoji]}</button>`;
            });
            tabsContainer.innerHTML = tabsHtml;
            
            tabsContainer.querySelectorAll('.reaction-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    renderReactionModalContent(reactions, btn.dataset.tab);
                });
            });
            
            const filteredReactions = activeTab === 'All' ? reactions : reactions.filter(r => r.reaction === activeTab);
            let listHtml = '';
            filteredReactions.forEach(r => {
                const ts = r.timestamp || r.timestamp_ms || r.__timestamp || 0;
                const timeText = ts ? new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
                listHtml += `
                    <div class="reaction-modal-item">
                        <span class="modal-emoji">${Utils.escapeHtml(r.reaction)}</span>
                        <div class="modal-actor-info">
                            <span class="modal-actor">${Utils.escapeHtml(r.actor)}</span>
                            ${timeText ? `<span class="modal-time">${Utils.escapeHtml(timeText)}</span>` : ''}
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = listHtml;
        }
    }

    return {
        setupSidebarResize,
        setupInfoPanelControls,
        setupThemeAndSettings,
        showTrustModalIfNeeded,
        setupReactionModal
    };
})();
