window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.Media = (function() {
    const State = window.MessengerApp.State;
    const Parser = window.MessengerApp.Parser; // wait, no direct dependency, just pass arguments

    function getMediaType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "image";
        if (["mp4", "webm", "ogg"].includes(extension)) return "video";
        if (["mp3", "wav", "aac", "ogg"].includes(extension)) return "audio";
        return "unknown";
    }

    function getMediaCandidateFiles(files) {
        return files.filter(file => !window.MessengerApp.Parser.isJsonFile(file) && getMediaType(file.name) !== "unknown");
    }

    function getMediaReferencePath(media) {
        return String(media?.uri || media?.filename || media?.path || media?.name || "");
    }

    function normalizeMediaPath(path) {
        return String(path || "").replace(/\\/g, "/").toLowerCase();
    }

    function getMediaBasename(path) {
        return normalizeMediaPath(path).split("/").pop() || "";
    }

    function addMediaToIndex(path, url, type) {
        const normalizedPath = normalizeMediaPath(path);
        const basename = getMediaBasename(path);
        const entry = url ? { url, type } : null;
        if (normalizedPath) {
            State.mediaPathIndex.add(normalizedPath);
            if (entry) State.mediaLookup.set(normalizedPath, entry);
        }
        if (basename) {
            State.mediaBasenameIndex.add(basename);
            if (entry && !State.mediaLookup.has(basename)) State.mediaLookup.set(basename, entry);
        }
    }

    function isMediaReferenceFound(path) {
        const normalizedPath = normalizeMediaPath(path);
        const basename = getMediaBasename(path);
        return (normalizedPath && State.mediaPathIndex.has(normalizedPath)) || (basename && State.mediaBasenameIndex.has(basename));
    }

    function findMediaFile(path) {
        const normalizedPath = normalizeMediaPath(path);
        const basename = getMediaBasename(path);
        return State.mediaLookup.get(normalizedPath) || State.mediaLookup.get(basename) || null;
    }

    function resetMedia() {
        Object.values(State.mediaFiles).forEach(url => URL.revokeObjectURL(url));
        State.mediaFiles = {};
        State.mediaTypes = {};
        State.mediaLookup = new Map();
        State.mediaPathIndex = new Set();
        State.mediaBasenameIndex = new Set();
    }

    async function processMediaFiles(files) {
        const BATCH_SIZE = 20;
        const fileArray = Array.from(files);
        
        resetMedia();
        
        for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
            const batch = fileArray.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(file => {
                return new Promise(resolve => {
                    const fileURL = URL.createObjectURL(file);
                    const relativePath = file.webkitRelativePath || file.name;
                    State.mediaFiles[relativePath] = fileURL;
                    State.mediaTypes[relativePath] = getMediaType(file.name);
                    addMediaToIndex(relativePath, fileURL, State.mediaTypes[relativePath]);
                    resolve();
                });
            }));
        }
        console.log("Media files processed:", Object.keys(State.mediaFiles).length);
    }

    function getMessageMediaItems(msg) {
        return [].concat(
            msg?.media || [],
            msg?.photos || [],
            msg?.videos || [],
            msg?.audio || [],
            msg?.audio_files || [],
            msg?.gifs || [],
            msg?.files || []
        );
    }

    function categorizeAttachment(path, preferredType) {
        const extension = String(path || "").split('.').pop().toLowerCase();
        const type = preferredType || getMediaType(path || "");
        if (type === "image") return extension === "gif" ? "gifs" : "photos";
        if (type === "video") return "videos";
        if (type === "audio") return "audio";
        if (extension === "gif") return "gifs";
        return "files";
    }

    function getMessageAttachmentReferences(msg) {
        const refs = [];
        (msg?.photos || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "photos" }));
        (msg?.videos || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "videos" }));
        (msg?.audio || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "audio" }));
        (msg?.audio_files || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "audio" }));
        (msg?.gifs || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "gifs" }));
        (msg?.files || []).forEach(item => refs.push({ path: getMediaReferencePath(item), category: "files" }));
        (msg?.media || []).forEach(item => {
            const path = getMediaReferencePath(item);
            refs.push({ path, category: categorizeAttachment(path) });
        });
        return refs;
    }

    return {
        getMediaType,
        getMediaCandidateFiles,
        getMediaReferencePath,
        isMediaReferenceFound,
        findMediaFile,
        resetMedia,
        processMediaFiles,
        getMessageMediaItems,
        getMessageAttachmentReferences
    };
})();
