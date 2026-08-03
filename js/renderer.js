window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Renderer = (function() {
    const State = window.MessengerApp.State;
    const Utils = window.MessengerApp.Utils;
    const Parser = window.MessengerApp.Parser;
    const Media = window.MessengerApp.Media;

    function createAttachmentCounts() {
        return { photos: 0, videos: 0, audio: 0, gifs: 0, files: 0, total: 0 };
    }

    function incrementAttachmentCount(counts, category) {
        if (!counts[category]) counts[category] = 0;
        counts[category] += 1;
        counts.total += 1;
    }

    function getAttachmentCounts(messages) {
        const counts = createAttachmentCounts();
        messages.forEach(msg => {
            Media.getMessageAttachmentReferences(msg).forEach(ref => incrementAttachmentCount(counts, ref.category));
        });
        return counts;
    }

    function getFoundMediaCounts(messages) {
        const counts = createAttachmentCounts();
        const seen = new Set();
        messages.forEach(msg => {
            Media.getMessageAttachmentReferences(msg).forEach(ref => {
                if (!ref.path || !Media.isMediaReferenceFound(ref.path)) return;
                const key = `${ref.category}:${ref.path.toLowerCase()}`;
                if (seen.has(key)) return;
                seen.add(key);
                incrementAttachmentCount(counts, ref.category);
            });
        });
        return counts;
    }

    function formatAttachmentCount(found, reported) {
        return `<span class="attachment-count"><span class="attachment-found">${Utils.formatInfoNumber(found)}</span><span class="attachment-separator"> / </span><span>${Utils.formatInfoNumber(reported)}</span></span>`;
    }

    function isReactionNoticeMessage(msg) {
        const text = Parser.fixEncoding(msg?.text || msg?.content || "").trim();
        if (!text) return false;
        if (Media.getMessageMediaItems(msg).length) return false;
        return /^(?:.+?\s+)?reacted\s+.+?\s+to your message(?:[.:].*)?$/i.test(text);
    }

    function parseReactionNotice(msg) {
        if (!isReactionNoticeMessage(msg)) return null;
        const text = Parser.fixEncoding(msg?.text || msg?.content || "").trim();
        const match = text.match(/^(?:(.+?)\s+)?reacted\s+(.+?)\s+to your message(?:[.:].*)?$/i);
        if (!match) return null;
        return {
            actor: (match[1] || msg.senderName || msg.sender_name || "").trim(),
            reaction: (match[2] || "").trim(),
            timestamp: msg.timestamp || msg.timestamp_ms || 0
        };
    }

    function normalizeReactionValue(value) {
        return String(value || "")
            .normalize("NFC")
            .replace(/[\uFE0E\uFE0F]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getReactionTimestamp(reaction) {
        return reaction?.timestamp || reaction?.timestamp_ms || reaction?.__timestamp || 0;
    }

    function enrichReactionTimestamps(messages) {
        if (!Array.isArray(messages)) return;
        messages.forEach((msg, index) => {
            const notice = parseReactionNotice(msg);
            if (!notice || !notice.timestamp || !notice.reaction) return;
            for (let i = index - 1; i >= 0; i--) {
                const target = messages[i];
                if (!target || isReactionNoticeMessage(target) || !Array.isArray(target.reactions)) continue;
                const noticeActor = normalizeReactionValue(notice.actor);
                const noticeReaction = normalizeReactionValue(notice.reaction);
                const match = target.reactions.find(r => {
                    const sameActor = !noticeActor || normalizeReactionValue(r.actor) === noticeActor;
                    return sameActor && normalizeReactionValue(r.reaction) === noticeReaction && !getReactionTimestamp(r);
                }) || target.reactions.find(r => {
                    return normalizeReactionValue(r.reaction) === noticeReaction && !getReactionTimestamp(r);
                });
                if (match) {
                    match.__timestamp = notice.timestamp;
                    break;
                }
            }
        });
    }

    function formatReaction(reaction) {
        const actor = Utils.escapeHtml(reaction.actor || "");
        const value = Utils.escapeHtml(reaction.reaction || "");
        const timestamp = getReactionTimestamp(reaction);
        const timeText = timestamp ? new Date(timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
        const attrs = timeText ? ` title="${Utils.escapeHtml(timeText)}" data-reaction-time="${Utils.escapeHtml(timeText)}"` : "";
        return `<span class="reaction-item"${attrs}>${actor}: ${value}</span>`;
    }

    function findNextVisibleMessageIndex(messages, fromIndex) {
        for (let i = fromIndex + 1; i < messages.length; i++) {
            if (!isReactionNoticeMessage(messages[i])) return i;
        }
        return -1;
    }

    function updateChatInfoPanel(data) {
        const content = document.getElementById('chatInfoContent');
        if (!content) return;
        if (!data || !Array.isArray(data.messages)) {
            content.innerHTML = '<div class="info-empty">No conversation loaded</div>';
            return;
        }

        const participants = Parser.getParticipantNames(data);
        const visibleMessages = data.messages.filter(msg => !isReactionNoticeMessage(msg));
        const messageCount = visibleMessages.length;
        const timestamps = visibleMessages.map(Parser.getMessageTimestamp).filter(timestamp => timestamp !== null);
        const createdAt = timestamps.length ? Math.min(...timestamps) : null;
        const lastMessageAt = timestamps.length ? Math.max(...timestamps) : null;
        const reportedAttachmentCounts = getAttachmentCounts(visibleMessages);
        const foundAttachmentCounts = getFoundMediaCounts(visibleMessages);
        const memberCounts = new Map();

        participants.forEach(name => memberCounts.set(name, 0));
        visibleMessages.forEach(msg => {
            const sender = msg.senderName || msg.sender_name || 'Unknown';
            memberCounts.set(sender, (memberCounts.get(sender) || 0) + 1);
        });

        const memberStats = Array.from(memberCounts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, count]) => {
                const percent = messageCount ? (count / messageCount) * 100 : 0;
                return `
                    <div class="member-stat">
                        <div class="member-stat-name">${Utils.escapeHtml(name)}</div>
                        <div class="member-stat-meta">${Utils.formatInfoNumber(count)} (${percent.toFixed(1)}%)</div>
                        <div class="member-stat-bar"><span style="width:${Math.max(1, percent)}%"></span></div>
                    </div>
                `;
            })
            .join('');

        content.innerHTML = `
            <section class="info-section">
                <strong>Chat info</strong>
                <div class="info-stats">
                    <div class="info-metric"><span>Messages</span><strong>${Utils.formatInfoNumber(messageCount)}</strong></div>
                    <div class="info-metric"><span>Members</span><strong>${Utils.formatInfoNumber(participants.length)}</strong></div>
                    <div class="info-row"><span>Created at</span><span>${Utils.formatInfoDate(createdAt)}</span></div>
                    <div class="info-row"><span>Last message</span><span>${Utils.formatInfoDate(lastMessageAt)}</span></div>
                </div>
            </section>
            <section class="info-section">
                <strong>Attachments</strong>
                <div class="info-stats">
                    <div class="info-metric"><span>Total loaded</span><strong>${formatAttachmentCount(foundAttachmentCounts.total, reportedAttachmentCounts.total)}</strong></div>
                    <div class="info-row"><span>Photos</span><span>${formatAttachmentCount(foundAttachmentCounts.photos, reportedAttachmentCounts.photos)}</span></div>
                    <div class="info-row"><span>Videos</span><span>${formatAttachmentCount(foundAttachmentCounts.videos, reportedAttachmentCounts.videos)}</span></div>
                    <div class="info-row"><span>Audio</span><span>${formatAttachmentCount(foundAttachmentCounts.audio, reportedAttachmentCounts.audio)}</span></div>
                    <div class="info-row"><span>GIFs</span><span>${formatAttachmentCount(foundAttachmentCounts.gifs, reportedAttachmentCounts.gifs)}</span></div>
                    <div class="info-row"><span>Files</span><span>${formatAttachmentCount(foundAttachmentCounts.files, reportedAttachmentCounts.files)}</span></div>
                </div>
            </section>
            <section class="info-section">
                <strong>Messages Per Member</strong>
                <div class="info-list">${memberStats || '<div class="info-empty">No messages found</div>'}</div>
            </section>
            <section class="info-section">
                <strong>Members</strong>
                <div class="member-list">
                    ${participants.length ? participants.map(name => `<div class="member-chip">${Utils.escapeHtml(name)}</div>`).join('') : '<div class="info-empty">No members found</div>'}
                </div>
            </section>
        `;
    }

    function createMessageHTML(msg, highlightQuery, isFirstInClump = true) {
        const sender = msg.senderName || msg.sender_name || "Unknown";
        const rawText = Parser.fixEncoding(msg?.text || msg?.content || "").trim();
        // Fallback search highlight logic: search.js overrides this with actual highlight logic if present
        const text = (window.MessengerApp.Search && highlightQuery) 
            ? window.MessengerApp.Search.highlightText(String(rawText), highlightQuery) 
            : Utils.escapeHtml(String(rawText));
            
        const timestamp = msg.timestamp || msg.timestamp_ms || 0;
        const mediaItems = Media.getMessageMediaItems(msg);

        let reactionsHtml = "";
        if (msg.reactions && msg.reactions.length > 0) {
            const uniqueEmojis = Array.from(new Set(msg.reactions.map(r => r.reaction))).slice(0, 3);
            
            reactionsHtml = `
                <div class="reaction-bubble" title="Click to view reactions">
                    ${uniqueEmojis.map(emoji => `<span class="reaction-emoji-simple">${Utils.escapeHtml(emoji)}</span>`).join("")}
                    ${msg.reactions.length > 1 ? `<span class="reaction-count">${msg.reactions.length}</span>` : ""}
                    <div class="reaction-popover">
                        ${msg.reactions.slice(0, 5).map(r => {
                            const ts = getReactionTimestamp(r);
                            const timeText = ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
                            const actor = Utils.escapeHtml(r.actor || "");
                            const reaction = Utils.escapeHtml(r.reaction || "");
                            const cls = timeText ? "popover-actor has-time-info" : "popover-actor";
                            return `
                                <div class="reaction-popover-item" ${timeText ? `title="${Utils.escapeHtml(timeText)}"` : ""}>
                                    <span class="popover-emoji">${reaction}</span>
                                    <span class="${cls}">${actor}</span>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        }

        let contentHtml = '<div class="message-content">';
        if (text) contentHtml += `<span style="white-space: pre-wrap;">${text}</span>`;
        if (mediaItems.length) {
            contentHtml += mediaItems.map(media => {
                const mediaPath = Media.getMediaReferencePath(media);
                const mediaFile = Media.findMediaFile(mediaPath);
                const fileURL = mediaFile?.url || null;
                const extension = mediaPath.split('.').pop().toLowerCase();
                const mediaType = extension === "mp4" ? "video" : (mediaFile?.type || Media.getMediaType(mediaPath));

                if (mediaType === "image") {
                    return fileURL 
                        ? `<a href="${fileURL}" target="_blank" class="media-preview"><img src="${fileURL}" alt="Image" class="preview"></a>`
                        : `[ Image not found ]`;
                } else if (mediaType === "video") {
                    return fileURL
                        ? `<a href="${fileURL}" target="_blank" class="media-preview"><video controls class="preview-video"><source src="${fileURL}" type="video/mp4"></video></a>`
                        : `[ Video not found ]`;
                } else if (mediaType === "audio") {
                    return fileURL
                        ? `<audio controls><source src="${fileURL}" type="audio/mpeg"></audio>`
                        : `[ Audio not found ]`;
                }
                const filename = mediaPath.split('/').pop() || 'File attachment';
                return fileURL
                    ? `<a href="${fileURL}" target="_blank" class="media-file-link">📎 ${Utils.escapeHtml(filename)}</a>`
                    : `<span class="placeholder media-file-link">📎 [ ${Utils.escapeHtml(filename)} not found ]</span>`;
            }).join("");
        }
        if (reactionsHtml) contentHtml += reactionsHtml;
        contentHtml += `<div class="msg-timestamp">${new Date(timestamp).toLocaleString([], {dateStyle: 'short', timeStyle: 'short'})}</div></div>`;
        return contentHtml;
    }

    function findPreviousVisibleMessageIndex(messages, fromIndex) {
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (!isReactionNoticeMessage(messages[i])) return i;
        }
        return -1;
    }

    function estimateChunkHeight(messages, chunkIndex) {
        if (!Array.isArray(messages) || !messages.length) return 0;
        let visibleCount = 0;
        let mediaCount = 0;
        let separatorCount = 0;
        messages.forEach((msg, localIdx) => {
            if (isReactionNoticeMessage(msg)) return;
            visibleCount += 1;
            mediaCount += Media.getMessageMediaItems(msg).length;

            const globalIdx = chunkIndex * State.CHUNK_SIZE + localIdx;
            if (globalIdx === 0) {
                separatorCount += 1;
                return;
            }
            const prevIdx = findPreviousVisibleMessageIndex(State.currentChatData?.messages || [], globalIdx);
            const prevMsg = prevIdx >= 0 ? State.currentChatData.messages[prevIdx] : null;
            const prevTime = prevMsg ? (prevMsg.timestamp || prevMsg.timestamp_ms || 0) : 0;
            const currTime = msg.timestamp || msg.timestamp_ms || 0;
            if (!prevMsg || Math.abs(currTime - prevTime) > 10 * 60 * 1000) {
                separatorCount += 1;
            }
        });
        return Math.max(160, (visibleCount * State.CHUNK_ESTIMATED_MESSAGE_HEIGHT) + (mediaCount * State.CHUNK_ESTIMATED_MEDIA_HEIGHT) + (separatorCount * State.CHUNK_ESTIMATED_SEPARATOR_HEIGHT));
    }

    function renderChunk(chunkIndex, messages, selectedValue) {
        const chunkContainer = document.querySelector(`.message-chunk[data-chunk-index="${chunkIndex}"]`);
        if (!chunkContainer || State.renderedMessages.has(chunkIndex)) return;

        const chatContainer = document.getElementById('chat');
        const containerRect = chatContainer ? chatContainer.getBoundingClientRect() : null;
        const chunkRect = chunkContainer.getBoundingClientRect();
        const isAboveViewport = containerRect ? chunkRect.bottom < containerRect.top : false;
        const previousHeight = chunkContainer.offsetHeight;
        const previousScrollTop = chatContainer ? chatContainer.scrollTop : 0;

        const searchInput = document.getElementById('searchInput');
        const highlightQuery = (searchInput && searchInput.value) ? searchInput.value : '';

        messages.forEach((msg, localIdx) => {
            const globalIdx = chunkIndex * State.CHUNK_SIZE + localIdx;
            if (isReactionNoticeMessage(msg)) return;
            
            let showSeparator = false;
            if (globalIdx === 0) {
                showSeparator = true;
            } else {
                const prevIdx = findPreviousVisibleMessageIndex(State.currentChatData.messages, globalIdx);
                const prevMsg = prevIdx >= 0 ? State.currentChatData.messages[prevIdx] : null;
                const prevTime = prevMsg ? (prevMsg.timestamp || prevMsg.timestamp_ms || 0) : 0;
                const currTime = msg.timestamp || msg.timestamp_ms || 0;
                if (!prevMsg || Math.abs(currTime - prevTime) > 10 * 60 * 1000) {
                    showSeparator = true;
                }
            }
            if (showSeparator) {
                const currTime = msg.timestamp || msg.timestamp_ms || 0;
                const sep = document.createElement("div");
                sep.className = "time-separator";
                sep.innerText = new Date(currTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                chunkContainer.appendChild(sep);
            }

            const sender = msg.senderName || msg.sender_name || "Unknown";
            
            let isFirstInClump = true;
            let isLastInClump = true;

            if (globalIdx > 0 && !showSeparator) {
                const prevIdx = findPreviousVisibleMessageIndex(State.currentChatData.messages, globalIdx);
                const prevMsg = prevIdx >= 0 ? State.currentChatData.messages[prevIdx] : null;
                const prevSender = prevMsg ? (prevMsg.senderName || prevMsg.sender_name || "Unknown") : null;
                if (prevSender === sender) {
                    isFirstInClump = false;
                }
            }

            const nextIdx = findNextVisibleMessageIndex(State.currentChatData.messages, globalIdx);
            const nextMsg = nextIdx >= 0 ? State.currentChatData.messages[nextIdx] : null;
            if (nextMsg) {
                const currTime = msg.timestamp || msg.timestamp_ms || 0;
                const nextTime = nextMsg.timestamp || nextMsg.timestamp_ms || 0;
                const nextShowSeparator = Math.abs(nextTime - currTime) > 10 * 60 * 1000;
                const nextSender = nextMsg.senderName || nextMsg.sender_name || "Unknown";
                if (nextSender === sender && !nextShowSeparator) {
                    isLastInClump = false;
                }
            }

            const wrapper = document.createElement("div");
            wrapper.classList.add("message-wrapper");
            wrapper.classList.add(sender === selectedValue ? "from-me-wrapper" : "from-them-wrapper");

            const div = document.createElement("div");
            div.classList.add("message", sender === selectedValue ? "from-me" : "from-them");
            if (isFirstInClump) div.classList.add("clump-first");
            if (isLastInClump) div.classList.add("clump-last");
            if (msg.reactions && msg.reactions.length > 0) div.classList.add("has-reactions");

            div.dataset.msgIndex = globalIdx;
            try { div.__rawMessage = msg; } catch(e) { /* ignore */ }
            div.innerHTML = createMessageHTML(msg, highlightQuery, isFirstInClump);
            
            if (isFirstInClump && sender !== selectedValue) {
                const senderDiv = document.createElement("div");
                senderDiv.className = "sender-name";
                senderDiv.innerText = sender;
                wrapper.appendChild(senderDiv);
            }
            
            wrapper.appendChild(div);
            chunkContainer.appendChild(wrapper);
        });

        State.renderedMessages.set(chunkIndex, true);
        ["showMyName", "showTheirName", "showReacts"].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.dispatchEvent(new Event("change"));
        });

        chunkContainer.style.minHeight = '';

        if (chatContainer && isAboveViewport) {
            const heightDelta = chunkContainer.offsetHeight - previousHeight;
            if (heightDelta !== 0) {
                chatContainer.scrollTop = previousScrollTop + heightDelta;
            }
        }
    }

    // --- Date Navigator logic translated ---
    function getLocalDateKey(date) { return `${date.getFullYear()}-${Utils.padDatePart(date.getMonth() + 1)}-${Utils.padDatePart(date.getDate())}`; }
    function getLocalMonthKey(date) { return `${date.getFullYear()}-${Utils.padDatePart(date.getMonth() + 1)}`; }
    function getWeekStartDate(date) {
        const weekStart = new Date(date);
        weekStart.setHours(0, 0, 0, 0);
        const mondayOffset = (weekStart.getDay() + 6) % 7;
        weekStart.setDate(weekStart.getDate() - mondayOffset);
        return weekStart;
    }
    function getBucketLabel(scale, timestamp) {
        const date = new Date(timestamp);
        if (scale === 'month') return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
        if (scale === 'week') {
            const start = getWeekStartDate(date);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })}-${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    function getBucketKey(scale, timestamp) {
        const date = new Date(timestamp);
        if (scale === 'month') return getLocalMonthKey(date);
        if (scale === 'week') return getLocalDateKey(getWeekStartDate(date));
        return getLocalDateKey(date);
    }
    function buildDateBuckets(messages) {
        const bucketsByScale = { month: new Map(), week: new Map(), day: new Map() };
        messages.forEach((msg, index) => {
            if (isReactionNoticeMessage(msg)) return;
            const timestamp = Parser.getMessageTimestamp(msg);
            if (timestamp === null) return;
            ['month', 'week', 'day'].forEach(scale => {
                const key = getBucketKey(scale, timestamp);
                if (!bucketsByScale[scale].has(key)) {
                    bucketsByScale[scale].set(key, { key, index, timestamp, count: 0, label: getBucketLabel(scale, timestamp) });
                }
                bucketsByScale[scale].get(key).count += 1;
            });
        });
        return { month: Array.from(bucketsByScale.month.values()), week: Array.from(bucketsByScale.week.values()), day: Array.from(bucketsByScale.day.values()) };
    }

    function updateActiveDateFromScroll() {
        if (State.dateNavState.syncing) return;
        const chatContainer = document.getElementById('chat');
        if (!chatContainer || !State.currentChatData?.messages) return;
        const containerRect = chatContainer.getBoundingClientRect();
        const messages = Array.from(chatContainer.querySelectorAll('.message[data-msg-index]'));
        const activeLine = containerRect.top + Math.max(State.DATE_NAV_ACTIVE_LINE_MIN_PX, containerRect.height * State.DATE_NAV_ACTIVE_LINE_RATIO);
        const currentEl = messages.find(el => el.getBoundingClientRect().bottom >= activeLine) || messages[messages.length - 1];
        if (!currentEl) return;
        const msg = State.currentChatData.messages[Number(currentEl.dataset.msgIndex)];
        const timestamp = Parser.getMessageTimestamp(msg);
        if (timestamp === null) return;
        const scale = State.dateNavState.scale;
        const key = getBucketKey(scale, timestamp);
        const bucket = (State.dateNavState.bucketsByScale[scale] || []).find(item => item.key === key);
        if (bucket && bucket.key !== State.dateNavState.activeKey) {
            setActiveDateBucket(bucket.key, bucket.label);
        }
    }

    function applyDateNavigatorCollapseMode() {
        const header = document.querySelector('.chat-header');
        const toggle = document.getElementById('dateNavToggle');
        if (!header) return;
        header.classList.toggle('date-nav-auto', State.dateNavState.autoCollapse);
        header.classList.toggle('date-nav-collapsed', !State.dateNavState.autoCollapse && State.dateNavState.collapsed);
        if (toggle) {
            toggle.disabled = State.dateNavState.autoCollapse;
            toggle.setAttribute('aria-expanded', String(!State.dateNavState.collapsed || State.dateNavState.autoCollapse));
        }
    }

    function renderDateNavigator() {
        const controls = document.getElementById('dateNavControls');
        const track = document.getElementById('dateNavTrack');
        const current = document.getElementById('dateNavCurrent');
        if (!controls || !track || !current) return;
        const scale = State.dateNavState.scale;
        const buckets = State.dateNavState.bucketsByScale[scale] || [];
        const maxCount = Math.max(1, ...buckets.map(b => b.count));
        
        document.querySelectorAll('[data-date-scale]').forEach(btn => btn.classList.toggle('active', btn.dataset.dateScale === scale));
        track.innerHTML = '';
        track.classList.toggle('slider-mode', scale !== 'month');

        if (scale !== 'month') {
            renderDateSlider(track, buckets);
            if (!buckets.length) { current.innerText = ''; updateDateStepButtons(-1, 0); return; }
            const active = buckets.find(b => b.key === State.dateNavState.activeKey) || buckets[0];
            setActiveDateBucket(active.key, active.label);
            return;
        }

        buckets.forEach(bucket => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'date-nav-item';
            button.dataset.dateKey = bucket.key;
            button.dataset.msgIndex = bucket.index;
            button.title = `${bucket.label} - ${bucket.count} messages`;
            button.innerHTML = `<span class="date-nav-label">${Utils.escapeHtml(bucket.label)}</span><span class="date-nav-count">${bucket.count} msg${bucket.count === 1 ? '' : 's'}</span><span class="date-nav-density" aria-hidden="true"><span style="width:${Math.max(8, Math.round((bucket.count / maxCount) * 100))}%"></span></span>`;
            button.addEventListener('click', async () => {
                State.dateNavState.syncing = true;
                setActiveDateBucket(bucket.key, bucket.label);
                if (window.MessengerApp.Search) await window.MessengerApp.Search.jumpToMessage(bucket.index);
                setTimeout(() => { State.dateNavState.syncing = false; }, State.DATE_NAV_SYNC_LOCK_MS);
            });
            track.appendChild(button);
        });

        if (!buckets.length) { current.innerText = ''; updateDateStepButtons(-1, 0); return; }
        const active = buckets.find(b => b.key === State.dateNavState.activeKey) || buckets[0];
        setActiveDateBucket(active.key, active.label);
    }

    function renderDateSlider(track, buckets) {
        const selectedIndex = Math.max(0, buckets.findIndex(b => b.key === State.dateNavState.activeKey));
        const sliderIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const wrap = document.createElement('div');
        wrap.className = 'date-nav-slider-wrap';
        wrap.innerHTML = `<input id="dateNavSlider" class="date-nav-slider" type="range" min="0" max="${Math.max(0, buckets.length - 1)}" value="${sliderIndex}" step="1" ${buckets.length <= 1 ? 'disabled' : ''}><div class="date-nav-slider-labels"><span>${Utils.escapeHtml(buckets[0]?.label || '')}</span><span>${Utils.escapeHtml(buckets[buckets.length - 1]?.label || '')}</span></div><div id="dateNavSliderMeta" class="date-nav-slider-meta"></div>`;
        track.appendChild(wrap);
        const slider = wrap.querySelector('#dateNavSlider');
        slider.addEventListener('input', () => {
            const bucket = buckets[Number(slider.value)];
            if (!bucket) return;
            setActiveDateBucket(bucket.key, bucket.label);
            clearTimeout(State.dateNavState.sliderTimer);
            State.dateNavState.sliderTimer = setTimeout(async () => {
                State.dateNavState.syncing = true;
                if(window.MessengerApp.Search) await window.MessengerApp.Search.jumpToMessage(bucket.index);
                setTimeout(() => { State.dateNavState.syncing = false; }, State.DATE_NAV_SYNC_LOCK_MS);
            }, 120);
        });
    }

    function updateDateStepButtons(activeIndex, total) {
        const prev = document.getElementById('dateNavPrev');
        const next = document.getElementById('dateNavNext');
        if (prev) prev.disabled = activeIndex <= 0;
        if (next) next.disabled = activeIndex < 0 || activeIndex >= total - 1;
    }

    function setActiveDateBucket(key, label) {
        State.dateNavState.activeKey = key;
        const current = document.getElementById('dateNavCurrent');
        if (current) current.innerText = label || '';
        const scale = State.dateNavState.scale;
        const buckets = State.dateNavState.bucketsByScale[scale] || [];
        const activeBucket = buckets.find(b => b.key === key);
        const slider = document.getElementById('dateNavSlider');
        const sliderMeta = document.getElementById('dateNavSliderMeta');
        if (slider) slider.value = String(Math.max(0, buckets.findIndex(b => b.key === key)));
        if (sliderMeta && activeBucket) sliderMeta.innerText = `${activeBucket.count} message${activeBucket.count === 1 ? '' : 's'}`;
        updateDateStepButtons(buckets.findIndex(b => b.key === key), buckets.length);
        const track = document.getElementById('dateNavTrack');
        if (!track || scale !== 'month') return;
        track.querySelectorAll('.date-nav-item').forEach(item => {
            const active = item.dataset.dateKey === key;
            item.classList.toggle('active', active);
            if (active) item.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
    }

    async function stepDateBucket(direction) {
        const scale = State.dateNavState.scale;
        const buckets = State.dateNavState.bucketsByScale[scale] || [];
        if (!buckets.length) return;
        const currentIndex = buckets.findIndex(b => b.key === State.dateNavState.activeKey);
        const fallbackIndex = direction > 0 ? -1 : buckets.length;
        const nextIndex = Math.min(buckets.length - 1, Math.max(0, (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction));
        const bucket = buckets[nextIndex];
        if (!bucket) return;
        State.dateNavState.syncing = true;
        setActiveDateBucket(bucket.key, bucket.label);
        if(window.MessengerApp.Search) await window.MessengerApp.Search.jumpToMessage(bucket.index);
        setTimeout(() => { State.dateNavState.syncing = false; }, State.DATE_NAV_SYNC_LOCK_MS);
    }

    function setupDateNavigator(messages) {
        const controls = document.getElementById('dateNavControls');
        if (!controls) return;
        State.dateNavState.bucketsByScale = buildDateBuckets(messages || []);
        State.dateNavState.scale = 'month';
        State.dateNavState.activeKey = null;
        applyDateNavigatorCollapseMode();
        const hasDates = Object.values(State.dateNavState.bucketsByScale).some(b => b.length);
        controls.classList.toggle('active', hasDates);
        controls.setAttribute('aria-hidden', hasDates ? 'false' : 'true');
        renderDateNavigator();
    }

    function renderMessages(data, selectedValue) {
        const chatContainer = document.getElementById("chat");
        const loading = document.getElementById("loading");
        chatContainer.style.display = "none";
        loading.innerHTML = "Loading messages...";
        loading.style.display = "flex";
        
        if (State.observer) State.observer.disconnect();
        
        State.renderedMessages.clear();
        chatContainer.innerHTML = "";
        
        if (!data._reactionsEnriched) {
            enrichReactionTimestamps(data.messages);
            data._reactionsEnriched = true;
        }
        if (!data._dateNavBuilt) {
            setupDateNavigator(data.messages);
            data._dateNavBuilt = true;
        }
        
        if (!data.messages.length) {
            loading.innerHTML = "No messages";
            chatContainer.style.display = "block";
            return;
        }

        const messageChunks = Utils.chunkArray(data.messages, State.CHUNK_SIZE);
        if (!data._chunkHeights) {
            data._chunkHeights = messageChunks.map((chunk, index) => estimateChunkHeight(chunk, index));
        }

        messageChunks.forEach((chunk, index) => {
            const chunkContainer = document.createElement("div");
            chunkContainer.classList.add("message-chunk");
            chunkContainer.dataset.chunkIndex = index;
            chunkContainer.style.minHeight = `${data._chunkHeights[index]}px`;
            chatContainer.appendChild(chunkContainer);
        });

        State.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const chunkIndex = parseInt(entry.target.dataset.chunkIndex);
                    renderChunk(chunkIndex, messageChunks[chunkIndex], selectedValue);
                }
            });
        }, { root: chatContainer, threshold: 0.1, rootMargin: "200px" });

        document.querySelectorAll(".message-chunk").forEach(chunk => State.observer.observe(chunk));

        setTimeout(() => {
            loading.style.display = "none";
            chatContainer.style.display = "block";
            updateActiveDateFromScroll();
        }, 100);
    }

    return {
        updateChatInfoPanel,
        renderMessages,
        renderChunk,
        createMessageHTML,
        updateActiveDateFromScroll,
        applyDateNavigatorCollapseMode,
        renderDateNavigator,
        stepDateBucket,
        isReactionNoticeMessage
    };
})();
