window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Search = (function() {
    const State = window.MessengerApp.State;
    const Utils = window.MessengerApp.Utils;
    const Parser = window.MessengerApp.Parser;
    const Renderer = window.MessengerApp.Renderer;

    function normalizeForSearch(str) {
        if (!str) return '';
        const normalized = str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
        return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function buildNormalizedMap(original) {
        const mapping = [];
        let normalized = '';
        for (let i = 0; i < original.length; i++) {
            const ch = original[i];
            const n = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '');
            for (let k = 0; k < n.length; k++) {
                mapping.push(i);
                normalized += n[k];
            }
        }
        return { normalized: normalized.toLowerCase(), mapping };
    }

    function findRangesForToken(original, tokenNorm) {
        const { normalized, mapping } = buildNormalizedMap(original);
        const token = tokenNorm;
        const ranges = [];
        let start = 0;
        while (true) {
            const idx = normalized.indexOf(token, start);
            if (idx === -1) break;
            const origStart = mapping[idx];
            const origEnd = mapping[idx + token.length - 1] + 1;
            ranges.push([origStart, origEnd]);
            start = idx + token.length;
        }
        return ranges;
    }

    function mergeRanges(ranges) {
        if (!ranges.length) return [];
        ranges.sort((a,b)=>a[0]-b[0]);
        const out = [ranges[0].slice()];
        for (let i = 1; i < ranges.length; i++) {
            const cur = ranges[i];
            const last = out[out.length-1];
            if (cur[0] <= last[1]) {
                last[1] = Math.max(last[1], cur[1]);
            } else out.push(cur.slice());
        }
        return out;
    }

    function highlightText(original, query) {
        if (!query || !original) return Utils.escapeHtml(original);
        const qNorm = normalizeForSearch(query);
        if (!qNorm) return Utils.escapeHtml(original);
        const allRanges = findRangesForToken(original, qNorm);
        if (!allRanges.length) return Utils.escapeHtml(original);
        const merged = mergeRanges(allRanges);
        let out = '';
        let lastIdx = 0;
        for (const [s,e] of merged) {
            out += Utils.escapeHtml(original.slice(lastIdx, s));
            out += '<span class="search-highlight">' + Utils.escapeHtml(original.slice(s, e)) + '</span>';
            lastIdx = e;
        }
        out += Utils.escapeHtml(original.slice(lastIdx));
        return out;
    }

    function getMessageText(msg) {
        let text = Parser.fixEncoding(msg?.text || msg?.content || "").trim();
        const mediaItems = [].concat(msg.media || [], msg.photos || [], msg.videos || [], msg.audio || [], msg.audio_files || [], msg.gifs || [], msg.files || []);
        mediaItems.forEach(mi => {
            if (mi && mi.uri) {
                const filename = String(mi.uri).split('/').pop();
                text += (text ? " " : "") + filename;
            }
        });
        return text;
    }

    function buildSearchIndex(messages) {
        const idx = [];
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (Renderer.isReactionNoticeMessage(m)) continue;
            
            const text = getMessageText(m);
            idx.push({ text, normalized: normalizeForSearch(text), sender: m.senderName || m.sender_name || 'Unknown', timestamp: m.timestamp || m.timestamp_ms || 0, idx: i });
        }
        return idx;
    }

    async function performSearch(query, index, onProgress) {
        const results = [];
        const normalizedQuery = normalizeForSearch(query);
        if (!normalizedQuery) return results;

        const BATCH = 500;
        for (let i = 0; i < index.length; i += BATCH) {
            const batch = index.slice(i, i + BATCH);
            for (const item of batch) {
                if (item.normalized.includes(normalizedQuery)) results.push({ item });
            }
            if (onProgress) onProgress(Math.min(100, Math.round(((i + BATCH) / index.length) * 100)));
            await new Promise(r => setTimeout(r, 0));
        }
        return results;
    }

    function scrollIntoViewWithPadding(container, element, padding = 60) {
        const containerRect = container.getBoundingClientRect();
        const elRect = element.getBoundingClientRect();
        const offset = (elRect.top - containerRect.top) - padding;
        container.scrollTop += offset;
    }

    async function scrollAndHighlight(el) {
        const chatContainer = document.getElementById('chat');
        scrollIntoViewWithPadding(chatContainer, el, 120);
        el.classList.add('highlight-target');
        el.classList.add('temporary-highlight');
        setTimeout(() => { el.classList.remove('temporary-highlight'); }, 2200);
        await new Promise(r => setTimeout(r, 300));
        scrollIntoViewWithPadding(chatContainer, el, 120);
    }

    async function jumpToMessage(messageIndex) {
        const chatContainer = document.getElementById('chat');
        const chunkIndex = Math.floor(messageIndex / State.CHUNK_SIZE);
        const chunkContainer = document.querySelector(`.message-chunk[data-chunk-index="${chunkIndex}"]`);
        
        if (chunkContainer && !State.renderedMessages.has(chunkIndex)) {
            const start = chunkIndex * State.CHUNK_SIZE;
            const msgs = State.currentChatData.messages.slice(start, start + State.CHUNK_SIZE);
            // Must get selected perspective
            const selectedValue = (document.querySelector('input[name="choice"]:checked') || {}).value;
            Renderer.renderChunk(chunkIndex, msgs, selectedValue);
        }
        await new Promise(r => setTimeout(r, 20));
        const msgEl = document.querySelector(`.message[data-msg-index="${messageIndex}"]`);
        if (!msgEl) {
            const chunk = document.querySelector(`.message-chunk[data-chunk-index="${chunkIndex}"]`);
            if (chunk) {
                const children = Array.from(chunk.querySelectorAll('.message'));
                const localIdx = messageIndex - chunkIndex * State.CHUNK_SIZE;
                const candidate = children[localIdx] || children[Math.max(0, localIdx-1)];
                if (candidate) {
                    await scrollAndHighlight(candidate);
                    return;
                }
            }
            return;
        }
        await scrollAndHighlight(msgEl);
    }

    function updateHighlightsAcrossDOM(query) {
        const chatContainer = document.getElementById('chat');
        const scrollTop = chatContainer ? chatContainer.scrollTop : 0;
        const previousOverflowAnchor = chatContainer ? chatContainer.style.overflowAnchor : '';
        if (chatContainer) chatContainer.style.overflowAnchor = 'none';
        
        const msgEls = document.querySelectorAll('.message');
        const q = query || '';
        msgEls.forEach(el => {
            const contentEl = el.querySelector('.message-content');
            if (!contentEl) return;
            const clone = contentEl.cloneNode(true);
            const mediaEls = clone.querySelectorAll('.media-preview, audio, .preview, .reaction, .msg-timestamp');
            mediaEls.forEach(n => n.remove());
            const highlights = clone.querySelectorAll('.search-highlight');
            highlights.forEach(s => {
                const txt = document.createTextNode(s.textContent);
                s.parentNode.replaceChild(txt, s);
            });
            const plain = clone.textContent || '';
            const newHTML = highlightText(plain, q);
            const originalContent = contentEl;
            const extras = [];
            const seen = new Set();
            originalContent.querySelectorAll('.media-preview, audio, .reaction, .msg-timestamp').forEach(n => {
                const html = n.outerHTML;
                if (!seen.has(html)) {
                    seen.add(html);
                    extras.push(html);
                }
            });
            originalContent.innerHTML = newHTML + extras.join('');
        });
        
        if (chatContainer) {
            const restoreScroll = () => { chatContainer.scrollTop = scrollTop; };
            restoreScroll();
            requestAnimationFrame(() => {
                restoreScroll();
                requestAnimationFrame(() => {
                    restoreScroll();
                    chatContainer.style.overflowAnchor = previousOverflowAnchor;
                });
            });
        }
    }

    async function startSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchProgress = document.getElementById('searchProgress');
        const searchResultsEl = document.getElementById('searchResults');
        
        const q = searchInput.value || '';
        if (!State.currentChatData || !State.currentChatData.messages) return;

        if (!State.searchIndex) {
            if(searchProgress) {
                searchProgress.style.display = 'flex';
                searchProgress.querySelector('.progress-text').innerText = 'Indexing...';
            }
            await new Promise(r => setTimeout(r, 0));
            State.searchIndex = buildSearchIndex(State.currentChatData.messages);
        }

        if(searchProgress) {
            searchProgress.style.display = 'flex';
            searchProgress.querySelector('.fill').style.width = '0%';
            searchProgress.querySelector('.progress-text').innerText = 'Searching...';
        }
        
        if(searchResultsEl) {
            searchResultsEl.innerHTML = '';
            searchResultsEl.style.display = 'block';
        }

        const results = await performSearch(q, State.searchIndex, (p) => {
            if(searchProgress) {
                searchProgress.querySelector('.fill').style.width = p + '%';
                searchProgress.querySelector('.progress-text').innerText = `Searching ${p}%`;
            }
        });

        if(searchProgress) {
            searchProgress.querySelector('.fill').style.width = '100%';
            searchProgress.querySelector('.progress-text').innerText = `Found ${results.length} matches`;
            setTimeout(()=>{ searchProgress.style.display = 'none'; }, 800);
        }

        if (!results.length) {
            if(searchResultsEl) searchResultsEl.innerHTML = '<div class="search-result-item">No results</div>';
            return;
        }

        const maxResults = Math.min(50, results.length);
        const frag = document.createDocumentFragment();
        for (let i = 0; i < maxResults; i++) {
            const r = results[i];
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.dataset.idx = r.item.idx;
            const time = new Date(r.item.timestamp).toLocaleString();
            const originalMsg = (State.currentChatData && State.currentChatData.messages && State.currentChatData.messages[r.item.idx]) || null;
            const rawText = originalMsg ? getMessageText(originalMsg) : (r.item.text || '');
            const rawSnippet = String(rawText).slice(0, 240);
            const highlightedSnippet = highlightText(rawSnippet, q);
            el.innerHTML = `<div class="snippet">${highlightedSnippet}</div><div class="meta">${Utils.escapeHtml(r.item.sender)} • ${time}</div>`;
            el.addEventListener('click', () => jumpToMessage(r.item.idx));
            frag.appendChild(el);
        }
        if(searchResultsEl) searchResultsEl.appendChild(frag);

        updateHighlightsAcrossDOM(q);
    }

    function clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResultsEl = document.getElementById('searchResults');
        const searchProgress = document.getElementById('searchProgress');

        if (searchInput) searchInput.value = '';
        if (searchResultsEl) {
            searchResultsEl.innerHTML = '';
            searchResultsEl.style.display = 'none';
        }
        if (searchProgress) {
            searchProgress.querySelector('.fill').style.width = '0%';
            searchProgress.querySelector('.progress-text').innerText = 'Idle';
            searchProgress.style.display = 'none';
        }
        updateHighlightsAcrossDOM('');
    }

    function setupSearchListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const searchResultsEl = document.getElementById('searchResults');

        if (searchResultsEl) searchResultsEl.style.display = 'none';
        searchBtn?.addEventListener('click', startSearch);
        searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') startSearch(); });
        clearSearchBtn?.addEventListener('click', clearSearch);

        let _highlightTimeout = null;
        searchInput?.addEventListener('input', () => {
            clearTimeout(_highlightTimeout);
            _highlightTimeout = setTimeout(() => {
                const q = (searchInput.value || '').trim();
                if (!q) {
                    if (searchResultsEl) searchResultsEl.style.display = 'none';
                }
            }, 250);
        });
    }

    return {
        highlightText,
        jumpToMessage,
        setupSearchListeners,
        clearSearch
    };
})();
