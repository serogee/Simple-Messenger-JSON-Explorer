window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Parser = (function() {
    const State = window.MessengerApp.State;
    const Utils = window.MessengerApp.Utils;

    function isJsonFile(file) {
        return /\.json$/i.test(file.name);
    }

    function getMessageFileNumber(file) {
        const path = file.webkitRelativePath || file.name;
        const match = path.match(/(?:^|[\\\/])message_(\d+)\.json$/i);
        return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    }

    function getOrderedMessageFiles(files) {
        const jsonFiles = files.filter(isJsonFile);
        const messageFiles = jsonFiles.filter(file => Number.isFinite(getMessageFileNumber(file)));
        const selected = messageFiles.length ? messageFiles : jsonFiles;
        return selected.sort((a, b) => {
            const numberA = getMessageFileNumber(a);
            const numberB = getMessageFileNumber(b);
            if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
                return numberB - numberA;
            }
            return (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true });
        });
    }

    function getJsonSelectionName(jsonFiles, allFiles = jsonFiles) {
        const firstPath = (allFiles[0]?.webkitRelativePath || jsonFiles[0]?.webkitRelativePath || "").split(/[\\\/]/)[0];
        if (firstPath && allFiles.length > 1) return `${firstPath} (${jsonFiles.length} JSON files)`;
        if (jsonFiles.length === 1) return jsonFiles[0].name;
        return firstPath ? `${firstPath} (${jsonFiles.length} JSON files)` : `${jsonFiles.length} JSON files`;
    }

    function looksMisencoded(value) {
        return /(?:\u00c3.|\u00c2.|\u00e2[\u0080-\u00bf]{1,2}|\u00f0[\u0080-\u00bf])/.test(value);
    }

    function fixEncoding(value) {
        const text = String(value || "");
        if (!looksMisencoded(text)) return text;
        try {
            return decodeURIComponent(escape(text));
        } catch(e) {
            return text;
        }
    }

    function decodeLegacyMessengerJsonContent(content) {
        const replaced = content.replace(/\\u00([a-f0-9]{2})|\\u([a-f0-9]{4})/gi, (match, p1, p2) => {
            const code = p1 ? parseInt(p1, 16) : parseInt(p2, 16);
            return String.fromCharCode(code);
        });
        return decodeURIComponent(escape(replaced));
    }

    function normalizeDisplayEncoding(data) {
        if (!data || typeof data !== "object") return data;

        ["threadName", "title", "threadPath"].forEach(key => {
            if (typeof data[key] === "string") data[key] = fixEncoding(data[key]);
        });

        if (Array.isArray(data.participants)) {
            data.participants = data.participants.map(participant => {
                if (typeof participant === "string") return fixEncoding(participant);
                if (!participant || typeof participant !== "object") return participant;
                return { ...participant, name: fixEncoding(participant.name) };
            });
        }

        if (Array.isArray(data.messages)) {
            data.messages.forEach(msg => {
                if (!msg || typeof msg !== "object") return;
                if (typeof msg.senderName === "string") msg.senderName = fixEncoding(msg.senderName);
                if (typeof msg.sender_name === "string") msg.sender_name = fixEncoding(msg.sender_name);
                if (Array.isArray(msg.reactions)) {
                    msg.reactions.forEach(reaction => {
                        if (!reaction || typeof reaction !== "object") return;
                        if (typeof reaction.actor === "string") reaction.actor = fixEncoding(reaction.actor);
                        if (typeof reaction.reaction === "string") reaction.reaction = fixEncoding(reaction.reaction);
                    });
                }
            });
        }
        return data;
    }

    function parseMessengerJsonContent(content) {
        let data;
        try {
            data = JSON.parse(content);
        } catch(e) {
            data = JSON.parse(decodeLegacyMessengerJsonContent(content));
        }
        if (content.includes('"thread_path"')) {
            data.messages = (data.messages || []).reverse();
        }
        return normalizeDisplayEncoding(data);
    }

    function mergeMessengerData(dataFiles) {
        const base = { ...dataFiles[0] };
        base.messages = dataFiles.flatMap(data => Array.isArray(data.messages) ? data.messages : []);

        const participantMap = new Map();
        dataFiles.forEach(data => {
            (data.participants || []).forEach(participant => {
                const name = typeof participant === 'string' ? participant : participant.name;
                if (name && !participantMap.has(name)) participantMap.set(name, participant);
            });
        });
        base.participants = Array.from(participantMap.values());
        return base;
    }

    function getMessageTimestamp(msg) {
        const timestamp = Number(msg?.timestamp_ms ?? msg?.timestamp ?? 0);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
    }

    function normalizeMessengerData(data) {
        if (!Array.isArray(data.messages)) {
            data.messages = [];
            return data;
        }
        data.messages = data.messages
            .map((msg, index) => ({ msg, index, timestamp: getMessageTimestamp(msg) }))
            .sort((a, b) => {
                if (a.timestamp === null && b.timestamp === null) return a.index - b.index;
                if (a.timestamp === null) return 1;
                if (b.timestamp === null) return -1;
                return (a.timestamp - b.timestamp) || (a.index - b.index);
            })
            .map(item => item.msg);
        return data;
    }

    async function loadJsonFiles(files) {
        const orderedFiles = getOrderedMessageFiles(files);
        if (!orderedFiles.length) throw new Error("No JSON files found");

        const parsedFiles = [];
        for (const file of orderedFiles) {
            parsedFiles.push(parseMessengerJsonContent(await file.text()));
        }
        return normalizeMessengerData(mergeMessengerData(parsedFiles));
    }

    function getParticipantNames(data) {
        return (data?.participants || [])
            .map(participant => typeof participant === 'string' ? participant : participant?.name)
            .filter(Boolean);
    }

    function sanitizeFileName(name) {
        return String(name || 'conversation')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140) || 'conversation';
    }

    return {
        isJsonFile,
        getOrderedMessageFiles,
        getJsonSelectionName,
        fixEncoding,
        loadJsonFiles,
        getParticipantNames,
        sanitizeFileName,
        getMessageTimestamp
    };
})();
