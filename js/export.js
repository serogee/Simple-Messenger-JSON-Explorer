window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Export = (function() {
    const State = window.MessengerApp.State;
    const Utils = window.MessengerApp.Utils;
    const Parser = window.MessengerApp.Parser;
    const Renderer = window.MessengerApp.Renderer;

    async function yieldToUi() {
        await new Promise(r => setTimeout(r, 0));
    }

    function pdfSetProgress(percent, text) {
        try {
            const pdfProgressFill = document.getElementById('pdfProgressFill');
            const pdfStatus = document.getElementById('pdfStatus');
            if (typeof percent === 'number' && pdfProgressFill) pdfProgressFill.style.width = Math.max(0, Math.min(100, percent)) + '%';
            if (pdfStatus && text) pdfStatus.innerText = text;
        } catch(e) {}
    }

    function pdfResetUi() {
        State.pdfState.cancel = false;
        State.pdfState.running = false;
        
        const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
        const pdfCancelBtn = document.getElementById('pdfCancelBtn');
        const pdfCloseBtn = document.getElementById('pdfCloseBtn');
        const pdfPreview = document.getElementById('pdfPreview');
        const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');

        if (pdfDownloadBtn) pdfDownloadBtn.disabled = true;
        if (pdfCancelBtn) pdfCancelBtn.disabled = false;
        if (pdfCloseBtn) pdfCloseBtn.disabled = false;
        if (pdfPreview) pdfPreview.setAttribute('aria-hidden', 'true');
        if (pdfPreviewFrame) pdfPreviewFrame.removeAttribute('src');
        try { if (State.pdfState.blobUrl) URL.revokeObjectURL(State.pdfState.blobUrl); } catch(e) {}
        State.pdfState.blobUrl = null;
        State.pdfState.fileName = null;
        pdfSetProgress(0, 'Preparing...');
    }

    function pdfSetBusyState(isBusy, statusText) {
        try {
            const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
            const pdfCancelBtn = document.getElementById('pdfCancelBtn');
            const pdfCloseBtn = document.getElementById('pdfCloseBtn');
            if (pdfCancelBtn) pdfCancelBtn.disabled = !isBusy;
            if (pdfCloseBtn) pdfCloseBtn.disabled = false;
            if (pdfDownloadBtn) pdfDownloadBtn.disabled = true;
            if (statusText) pdfSetProgress(undefined, statusText);
        } catch(e) {}
    }

    function pdfSetReadyState() {
        try {
            const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
            const pdfCancelBtn = document.getElementById('pdfCancelBtn');
            const pdfCloseBtn = document.getElementById('pdfCloseBtn');
            if (pdfCancelBtn) pdfCancelBtn.disabled = true;
            if (pdfCloseBtn) pdfCloseBtn.disabled = false;
            if (pdfDownloadBtn) pdfDownloadBtn.disabled = false;
        } catch(e) {}
    }

    function openPdfModal() {
        const pdfModal = document.getElementById('pdfModal');
        if (!pdfModal) return;
        pdfModal.setAttribute('aria-hidden', 'false');
    }

    function closePdfModal() {
        const pdfModal = document.getElementById('pdfModal');
        if (!pdfModal) return;
        if (State.pdfState.running) {
            State.pdfState.cancel = true;
            pdfSetProgress(0, 'Cancelling...');
            return;
        }
        pdfModal.setAttribute('aria-hidden', 'true');
        pdfResetUi();
    }

    async function buildChatPdf(data, selectedPerspective) {
        const jspdfNs = window.jspdf;
        const JsPdfCtor = jspdfNs && jspdfNs.jsPDF;
        if (!JsPdfCtor) throw new Error('jsPDF not loaded');

        const h2c = window.html2canvas;
        if (!h2c) throw new Error('html2canvas not loaded');

        const threadName = data.threadName || data.title || data.threadPath || 'Untitled';
        const messages = (Array.isArray(data.messages) ? data.messages : []).filter(msg => !Renderer.isReactionNoticeMessage(msg));

        const chatEl = document.getElementById('chat');
        const chatContainerEl = document.querySelector('.chat-container');

        const chatWidthPx = Math.max(680, Math.min(980, (chatEl && chatEl.clientWidth) ? chatEl.clientWidth : 860));
        const a4Ratio = 297 / 210;

        const pagePaddingPx = 10;
        const pageWidthPx = chatWidthPx;
        const pageHeightPx = Math.round(pageWidthPx * a4Ratio);
        const viewportHeightPx = pageHeightPx;

        const bg = (() => {
            try {
                const c = chatContainerEl ? getComputedStyle(chatContainerEl).backgroundColor : '';
                return c || '#ffffff';
            } catch(e) { return '#ffffff'; }
        })();

        const offscreen = document.createElement('div');
        offscreen.style.position = 'fixed';
        offscreen.style.left = '-10000px';
        offscreen.style.top = '0';
        offscreen.style.width = pageWidthPx + 'px';
        offscreen.style.zIndex = '-1';
        offscreen.style.background = bg;
        offscreen.style.color = 'inherit';

        const content = document.createElement('div');
        content.style.boxSizing = 'border-box';
        content.style.width = '100%';
        content.style.padding = pagePaddingPx + 'px';
        content.style.background = bg;

        const header = document.createElement('div');
        header.style.boxSizing = 'border-box';
        header.style.width = '100%';
        header.style.fontSize = '14px';
        header.style.color = 'rgba(0,0,0,0.55)';
        try {
            const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted');
            if (muted) header.style.color = muted.trim();
        } catch(e) {}
        header.style.marginBottom = '8px';
        header.textContent = `${threadName} — Exported ${new Date().toLocaleString()}`;
        content.appendChild(header);

        const messagesHost = document.createElement('div');
        messagesHost.style.boxSizing = 'border-box';
        messagesHost.style.width = '100%';
        content.appendChild(messagesHost);

        offscreen.appendChild(content);
        document.body.appendChild(offscreen);

        const showMyName = !!document.getElementById('showMyName')?.checked;
        const showTheirName = !!document.getElementById('showTheirName')?.checked;
        const showReacts = !!document.getElementById('showReacts')?.checked;

        const total = messages.length;
        const BUILD_BATCH = 200;
        pdfSetProgress(0, 'Preparing DOM...');
        await yieldToUi();

        for (let i = 0; i < total; i++) {
            if (State.pdfState.cancel) {
                try { offscreen.remove(); } catch(e) {}
                throw new Error('cancelled');
            }

            const msg = messages[i];
            const sender = msg.senderName || msg.sender_name || 'Unknown';
            const fromMe = sender === selectedPerspective;

            const div = document.createElement('div');
            div.classList.add('message', fromMe ? 'from-me' : 'from-them');
            div.innerHTML = Renderer.createMessageHTML(msg, '');
            messagesHost.appendChild(div);

            try {
                if (!showReacts) div.querySelectorAll('.reaction').forEach(el => (el.style.display = 'none'));
                if (fromMe && !showMyName) div.querySelectorAll('.sender-name').forEach(el => (el.style.display = 'none'));
                if (!fromMe && !showTheirName) div.querySelectorAll('.sender-name').forEach(el => (el.style.display = 'none'));
            } catch(e) {}

            if ((i + 1) % BUILD_BATCH === 0) {
                const p = Math.round(((i + 1) / total) * 30);
                pdfSetProgress(p, `Preparing DOM ${i + 1}/${total}...`);
                await yieldToUi();
            }
        }

        await yieldToUi();

        try {
            messagesHost.querySelectorAll('audio').forEach(a => {
                const ph = document.createElement('div');
                ph.className = 'placeholder';
                ph.textContent = '[Audio]';
                a.replaceWith(ph);
            });

            messagesHost.querySelectorAll('video').forEach(v => {
                const poster = v.getAttribute('poster');
                if (poster) {
                    const img = document.createElement('img');
                    img.className = 'preview';
                    img.src = poster;
                    img.alt = 'Video thumbnail';
                    v.replaceWith(img);
                } else {
                    const ph = document.createElement('div');
                    ph.className = 'placeholder';
                    ph.textContent = '[Video]';
                    v.replaceWith(ph);
                }
            });
        } catch(e) {}

        try {
            const imgs = Array.from(messagesHost.querySelectorAll('img'));
            const waits = imgs.map(img => new Promise(resolve => {
                if (img.complete) return resolve();
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                setTimeout(done, 2500);
            }));
            await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 2600))]);
        } catch(e) {}

        await yieldToUi();

        const scrollHeight = Math.ceil(content.scrollHeight);

        const messageEls = Array.from(messagesHost.querySelectorAll('.message'));
        const breaks = [0];
        let startY = 0;
        const maxPages = 500;
        for (let guard = 0; guard < maxPages && startY < scrollHeight - 2; guard++) {
            const limit = startY + viewportHeightPx;
            let best = null;
            for (const el of messageEls) {
                const top = (messagesHost.offsetTop || 0) + el.offsetTop;
                const bottom = top + el.offsetHeight;
                if (bottom <= limit && top >= startY) {
                    best = bottom;
                }
                if (top > limit) break;
            }
            if (best === null || best <= startY + 60) {
                best = Math.min(limit, scrollHeight);
            }
            if (best >= scrollHeight) {
                breaks.push(scrollHeight);
                break;
            }
            const nextStart = Math.min(best, scrollHeight);
            breaks.push(nextStart);
            startY = nextStart;
        }

        const pageCount = Math.max(1, breaks.length - 1);

        const doc = new JsPdfCtor({ unit: 'pt', format: 'a4' });
        const pageWidthPt = doc.internal.pageSize.getWidth();
        const pageHeightPt = doc.internal.pageSize.getHeight();
        const marginPt = 10;
        const targetWidthPt = pageWidthPt - marginPt * 2;
        const targetHeightPt = pageHeightPt - marginPt * 2;

        for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
            if (State.pdfState.cancel) {
                try { offscreen.remove(); } catch(e) {}
                throw new Error('cancelled');
            }

            const sliceStart = breaks[pageIdx];

            const slice = document.createElement('div');
            slice.style.width = pageWidthPx + 'px';
            slice.style.height = viewportHeightPx + 'px';
            slice.style.overflow = 'hidden';
            slice.style.background = bg;

            const inner = content.cloneNode(true);
            inner.style.transform = `translateY(-${sliceStart}px)`;
            inner.style.transformOrigin = 'top left';
            slice.appendChild(inner);
            offscreen.appendChild(slice);

            const canvas = await h2c(slice, {
                backgroundColor: bg,
                scale: Math.min(2, window.devicePixelRatio || 1),
                useCORS: true,
                logging: false
            });

            try { slice.remove(); } catch(e) {}

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgW = targetWidthPt;
            const imgH = Math.min(targetHeightPt, (canvas.height * imgW) / canvas.width);

            if (pageIdx > 0) doc.addPage();
            doc.addImage(imgData, 'JPEG', marginPt, marginPt, imgW, imgH, undefined, 'FAST');

            const p = 30 + Math.round(((pageIdx + 1) / pageCount) * 70);
            pdfSetProgress(p, `Rendering page ${pageIdx + 1}/${pageCount}...`);
            await yieldToUi();
        }

        try { offscreen.remove(); } catch(e) {}

        pdfSetProgress(100, 'Finalizing...');
        await yieldToUi();

        const blob = doc.output('blob');
        const fileName = Parser.sanitizeFileName(threadName) + '.pdf';
        return { blob, fileName };
    }

    async function startPdfExport() {
        if (State.pdfState.running) return;
        if (!State.currentChatData || !State.currentChatData.messages) return;

        const total = (State.currentChatData.messages || []).length;
        if (!total) return;

        if (total > 12000) {
            alert('This conversation is too large to export in "exact" mode safely. Please narrow down the data and try again.');
            return;
        }
        if (total > 4000) {
            const ok = confirm(`This export will include ${total} messages and may take a long time / use a lot of memory. Continue?`);
            if (!ok) return;
        }

        openPdfModal();
        pdfResetUi();
        State.pdfState.running = true;

        try {
            pdfSetBusyState(true, 'Preparing...');
            pdfSetProgress(0, 'Preparing...');
            await yieldToUi();

            const selectedPerspective = (document.querySelector('input[name="choice"]:checked') || {}).value;
            const { blob, fileName } = await buildChatPdf(State.currentChatData, selectedPerspective);
            if (State.pdfState.cancel) throw new Error('cancelled');

            const url = URL.createObjectURL(blob);
            State.pdfState.blobUrl = url;
            State.pdfState.fileName = fileName;

            const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
            const pdfPreview = document.getElementById('pdfPreview');
            
            if (pdfPreviewFrame) pdfPreviewFrame.src = url;
            if (pdfPreview) pdfPreview.setAttribute('aria-hidden', 'false');
            pdfSetReadyState();
            pdfSetProgress(100, 'Ready. Preview below.');
        } catch (e) {
            if (String(e && e.message) === 'cancelled') {
                pdfSetProgress(0, 'Cancelled.');
            } else {
                pdfSetProgress(0, 'Failed to export PDF.');
            }
        } finally {
            State.pdfState.running = false;
            State.pdfState.cancel = false;
        }
    }

    function downloadPdf() {
        if (!State.pdfState.blobUrl || !State.pdfState.fileName) return;
        const a = document.createElement('a');
        a.href = State.pdfState.blobUrl;
        a.download = State.pdfState.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function setupPdfListeners() {
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const pdfCancelBtn = document.getElementById('pdfCancelBtn');
        const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
        const pdfCloseBtn = document.getElementById('pdfCloseBtn');
        const pdfBackdrop = document.querySelector('.pdf-backdrop');
        const pdfModal = document.getElementById('pdfModal');

        exportPdfBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            startPdfExport();
        });

        pdfCancelBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (State.pdfState.running) {
                State.pdfState.cancel = true;
                try { if (pdfCancelBtn) pdfCancelBtn.disabled = true; } catch(e) {}
                pdfSetProgress(0, 'Cancelling...');
            }
        });

        pdfDownloadBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            downloadPdf();
        });

        pdfCloseBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            closePdfModal();
        });

        pdfBackdrop?.addEventListener('click', (e) => {
            closePdfModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && pdfModal && pdfModal.getAttribute('aria-hidden') === 'false') {
                closePdfModal();
            }
        });
    }

    return {
        setupPdfListeners
    };
})();
