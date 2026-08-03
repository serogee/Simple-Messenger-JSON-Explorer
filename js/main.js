window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Main = (function() {
    const State = window.MessengerApp.State;
    const Utils = window.MessengerApp.Utils;
    const Parser = window.MessengerApp.Parser;
    const Media = window.MessengerApp.Media;
    const UI = window.MessengerApp.UI;
    const Renderer = window.MessengerApp.Renderer;
    const Search = window.MessengerApp.Search;
    const Export = window.MessengerApp.Export;

    function getSelectedPerspective() {
        return (document.querySelector('input[name="choice"]:checked') || {}).value;
    }

    function setupRadioButtons(participants) {
        const radioForm = document.getElementById("radioForm");
        radioForm.innerHTML = "";
        const saved = (Utils.storageGet('selectedPerspective') || null);
        const isValidSaved = saved && participants.includes(saved);
        participants.forEach((participant, index) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            
            input.type = "radio";
            input.name = "choice";
            input.id = `option${index + 1}`;
            input.value = participant;
            if (isValidSaved && saved === participant) input.checked = true;
            else if (!isValidSaved && index === 0) input.checked = true;

            input.addEventListener('change', () => {
                try { Utils.storageSet('selectedPerspective', input.value); } catch(e){}
                if (State.currentChatData) Renderer.renderMessages(State.currentChatData, input.value);
            });

            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${participant}`));
            radioForm.appendChild(label);
        });
    }

    function setupCheckboxListeners() {
        const checkboxConfig = [
            { id: "showMyName", class: ".from-me .sender-name" },
            { id: "showTheirName", class: ".from-them .sender-name" },
            { id: "showReacts", class: ".reaction" }
        ];

        checkboxConfig.forEach(({ id, class: className }) => {
            const input = document.getElementById(id);
            if (!input) return;
            try {
                const saved = Utils.storageGet('ui_' + id);
                if (saved !== null) {
                    input.checked = saved === '1';
                }
            } catch(e) {}

            input.addEventListener("change", function() {
                const elements = document.querySelectorAll(className);
                elements.forEach(el => el.style.display = this.checked ? "block" : "none");
                try { Utils.storageSet('ui_' + id, this.checked ? '1' : '0'); } catch(e){}
            });
            input.dispatchEvent(new Event('change'));
        });

        const autoCollapseInput = document.getElementById('autoCollapseDateNav');
        if (autoCollapseInput && !autoCollapseInput.dataset.bound) {
            autoCollapseInput.dataset.bound = '1';
            const saved = Utils.storageGet('ui_autoCollapseDateNav');
            autoCollapseInput.checked = saved !== null ? saved === '1' : true;
            State.dateNavState.autoCollapse = autoCollapseInput.checked;
            State.dateNavState.collapsed = Utils.storageGet('dateNavCollapsed') === '1';
            Renderer.applyDateNavigatorCollapseMode();
            autoCollapseInput.addEventListener('change', function() {
                State.dateNavState.autoCollapse = this.checked;
                if (this.checked) State.dateNavState.collapsed = false;
                Utils.storageSet('ui_autoCollapseDateNav', this.checked ? '1' : '0');
                Renderer.applyDateNavigatorCollapseMode();
            });
        }
    }

    function setupChatInterface(data) {
        State.currentChatData = data;
        State.searchIndex = null;

        const participants = data.participants.map(p => (typeof p === 'string' ? p : p.name));
        const threadName = data.threadName || data.title || data.threadPath || "Untitled";

        document.getElementById("threadName").innerText = threadName;
        const infoTitle = document.getElementById("chatInfoTitle");
        if (infoTitle) infoTitle.innerText = threadName;
        
        Renderer.updateChatInfoPanel(data);
        setupRadioButtons(participants);

        let selectedValue = (document.querySelector('input[name="choice"]:checked') || {}).value;

        setupCheckboxListeners();
        Renderer.renderMessages(data, selectedValue);
    }

    async function handleFileUpload(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        const jsonFiles = Parser.getOrderedMessageFiles(files);
        if (!jsonFiles.length) {
            alert("No Messenger JSON files found in that selection.");
            event.target.value = "";
            return;
        }

        const selectionName = Parser.getJsonSelectionName(jsonFiles, files);
        const selectionSize = jsonFiles.reduce((sum, file) => sum + file.size, 0);
        const selectionModified = Math.max(...jsonFiles.map(file => file.lastModified || 0));
        
        if (State.currentJsonFileName && (State.currentJsonFileName !== selectionName || State.currentJsonFileSize !== selectionSize || State.currentJsonFileModified !== selectionModified)) {
            try { State.searchIndex = null; } catch(e){}
            try { const s = document.getElementById('searchInput'); if(s) s.value = ''; } catch(e){}
            try { const sr = document.getElementById('searchResults'); if(sr) sr.innerHTML = ''; } catch(e){}
            try {
                const sp = document.getElementById('searchProgress');
                if (sp) {
                    sp.querySelector('.fill').style.width = '0%';
                    sp.querySelector('.progress-text').innerText = 'Idle';
                    sp.style.display = 'none';
                }
            } catch(e){}
        }

        State.currentJsonFileName = selectionName;
        State.currentJsonFileSize = selectionSize;
        State.currentJsonFileModified = selectionModified;

        const options = document.getElementsByClassName("options")[0];
        const loading = document.getElementById("loading");
        const chatContainer = document.getElementById("chat");

        options.style.display = "block";
        loading.innerHTML = "Loading...";
        loading.style.display = "flex";
        chatContainer.scrollTop = 0;
        chatContainer.innerHTML = "";

        try {
            const data = await Parser.loadJsonFiles(jsonFiles);
            const mediaCandidates = Media.getMediaCandidateFiles(files);
            const isFolderSelection = files.some(file => file.webkitRelativePath);
            if (isFolderSelection || mediaCandidates.length) {
                loading.innerHTML = `Processing media (${mediaCandidates.length} files)...`;
                await Media.processMediaFiles(mediaCandidates);
            }
            setupChatInterface(data);
        } catch (error) {
            console.error(error);
            alert("Invalid JSON file! Error: " + (error.stack || error.message || error));
            loading.style.display = "none";
        }
    }

    function setupHelpTooltips() {
        const helpTexts = {
            perspective: {
                title: 'Góc nhìn (Perspective)',
                short: 'Chọn người mà giao diện sẽ hiển thị như thể bạn là người đó.',
                long: `Chọn một người tham gia để xem cuộc trò chuyện dưới góc nhìn của họ. Khi chọn, các tin nhắn của người đó sẽ được đánh dấu là "from-me" và tin nhắn còn lại là "from-them". Hữu ích khi bạn muốn đọc lại cuộc hội thoại như thể bạn đang ở vị trí một trong những người tham gia.`
            },
            customization: {
                title: 'Tùy chỉnh hiển thị',
                short: 'Bật/tắt tên, thời gian và biểu cảm (reactions).',
                long: `Sử dụng các checkbox để điều khiển việc hiển thị: tên người gửi, dấu thời gian và tóm tắt biểu cảm. "Hiện tên của tôi" sẽ hiển thị tên với các tin nhắn từ góc nhìn đã chọn; "Hiện tên họ" sẽ hiển thị tên người khác. "Hiện thời gian" và "Hiện biểu cảm" lần lượt bật/tắt thời gian và phần vòng biểu cảm.`
            },
            download: {
                title: 'Tải JSON từ Messenger',
                short: 'Cách xuất file JSON từ Facebook để mở bằng công cụ này.',
                long: `Để xuất cuộc trò chuyện, vào trang "Download Your Information" trên Facebook và chọn mục Messages trong phần dữ liệu cần tải. Sau khi Facebook hoàn tất, bạn sẽ nhận được file ZIP chứa JSON. Giải nén và chọn file JSON tương ứng để mở trong ứng dụng này. Lưu ý: một vài cuộc trò chuyện mã hoá đầu-cuối có thể yêu cầu thao tác đặc biệt.`
            }
        };

        const helpModal = document.getElementById('helpModal');
        const helpBody = document.getElementById('helpBody');
        const helpTitle = document.getElementById('helpTitle');
        const helpClose = document.getElementById('helpClose');

        function showHelpModal(key) {
            const info = helpTexts[key] || { title: 'Help', long: 'No help available.' };
            helpTitle.innerText = info.title;
            const short = info.short ? `<p style="font-weight:600;margin-bottom:8px;">${Utils.escapeHtml(info.short)}</p>` : '';
            const long = info.long ? `<p>${Utils.escapeHtml(info.long)}</p>` : '';
            helpBody.innerHTML = short + long + `<div class="help-actions"><button class="secondary" onclick="document.getElementById('helpModal').setAttribute('aria-hidden', 'true')">Đóng</button></div>`;
            if (helpModal) helpModal.setAttribute('aria-hidden', 'false');
        }

        function closeHelpModal() {
            if (helpModal) helpModal.setAttribute('aria-hidden', 'true');
        }

        helpClose?.addEventListener('click', closeHelpModal);
        helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) closeHelpModal(); });

        let tooltipEl = null;
        let longPressTimer = null;

        function createTooltip(text) {
            if (tooltipEl) tooltipEl.remove();
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'help-tooltip';
            tooltipEl.innerText = text;
            document.body.appendChild(tooltipEl);
        }

        function positionTooltip(target) {
            if (!tooltipEl) return;
            const rect = target.getBoundingClientRect();
            tooltipEl.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            tooltipEl.style.left = (rect.left + window.scrollX) + 'px';
        }

        document.querySelectorAll('.help-btn').forEach(btn => {
            const key = btn.dataset.help;
            const info = helpTexts[key];
            if (!info) return;

            btn.addEventListener('mouseenter', (e) => {
                createTooltip(info.short);
                positionTooltip(btn);
            });
            btn.addEventListener('mouseleave', () => { if (tooltipEl) tooltipEl.remove(); tooltipEl = null; clearTimeout(longPressTimer); });
            btn.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => { createTooltip(info.short); positionTooltip(btn); }, 600);
            }, { passive: true });
            btn.addEventListener('touchend', (e) => { clearTimeout(longPressTimer); if (tooltipEl) tooltipEl.remove(); tooltipEl = null; });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                showHelpModal(key);
            });
        });
    }

    function init() {
        UI.setupThemeAndSettings();
        UI.setupSidebarResize();
        UI.setupInfoPanelControls();
        UI.showTrustModalIfNeeded();
        setupHelpTooltips();
        Search.setupSearchListeners();
        Export.setupPdfListeners();

        document.getElementById("fileInput").addEventListener("change", handleFileUpload);

        const mediaFolderInput = document.getElementById("mediaFolder");
        if (mediaFolderInput) {
            mediaFolderInput.addEventListener("change", function(event) {
                const files = event.target.files;
                if (!files.length) return;

                const chatContainer = document.getElementById("chat");
                const loading = document.getElementById("loading");
                chatContainer.style.display = "none";
                loading.innerHTML = "Processing media...";
                loading.style.display = "flex";

                Media.processMediaFiles(files).then(() => {
                    if (State.currentChatData) {
                        Renderer.updateChatInfoPanel(State.currentChatData);
                        Renderer.renderMessages(State.currentChatData, getSelectedPerspective());
                    }
                    loading.style.display = "none";
                    chatContainer.style.display = "block";
                });
            });
        }

        // Date nav listeners that belong to window level
        document.querySelectorAll('[data-date-scale]').forEach(button => {
            button.addEventListener('click', () => {
                const scale = button.dataset.dateScale;
                if (!scale || scale === State.dateNavState.scale) return;
                State.dateNavState.scale = scale;
                State.dateNavState.activeKey = null;
                Renderer.renderDateNavigator();
                Renderer.updateActiveDateFromScroll();
            });
        });

        document.getElementById('chat')?.addEventListener('scroll', () => {
            clearTimeout(State.dateNavState.scrollTimer);
            State.dateNavState.scrollTimer = setTimeout(Renderer.updateActiveDateFromScroll, 80);
        });

        document.getElementById('dateNavPrev')?.addEventListener('click', () => Renderer.stepDateBucket(-1));
        document.getElementById('dateNavNext')?.addEventListener('click', () => Renderer.stepDateBucket(1));
        document.getElementById('dateNavToggle')?.addEventListener('click', () => {
            if (State.dateNavState.autoCollapse) return;
            State.dateNavState.collapsed = !State.dateNavState.collapsed;
            Utils.storageSet('dateNavCollapsed', State.dateNavState.collapsed ? '1' : '0');
            Renderer.applyDateNavigatorCollapseMode();
        });

        const chatHeader = document.querySelector('.chat-header');
        chatHeader?.addEventListener('mouseenter', () => { State.dateNavState.headerHover = true; });
        chatHeader?.addEventListener('mouseleave', () => { State.dateNavState.headerHover = false; });
        document.addEventListener('keydown', (event) => {
            const headerFocused = chatHeader?.contains(document.activeElement);
            if (!State.dateNavState.headerHover && !headerFocused) return;
            if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
                event.preventDefault();
                Renderer.stepDateBucket(-1);
            } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
                event.preventDefault();
                Renderer.stepDateBucket(1);
            }
        });

        window.addEventListener("beforeunload", () => {
            if (State.observer) State.observer.disconnect();
            Object.values(State.mediaFiles).forEach(url => URL.revokeObjectURL(url));
            State.renderedMessages.clear();
            try { if (State.pdfState.blobUrl) URL.revokeObjectURL(State.pdfState.blobUrl); } catch(e) {}
        });

        UI.setupReactionModal();
    }

    return {
        init
    };
})();

document.addEventListener("DOMContentLoaded", () => {
    window.MessengerApp.Main.init();
});
