window.MessengerApp = window.MessengerApp || {};

window.MessengerApp.State = (function() {
    return {
        currentJsonFileName: null,
        currentJsonFileSize: null,
        currentJsonFileModified: null,
        CHUNK_SIZE: 50,
        currentSidebarWidth: null,
        currentInfoPanelWidth: null,
        DATE_NAV_SYNC_LOCK_MS: 900,
        DATE_NAV_ACTIVE_LINE_MIN_PX: 120,
        DATE_NAV_ACTIVE_LINE_RATIO: 0.25,
        CHUNK_ESTIMATED_MESSAGE_HEIGHT: 58,
        CHUNK_ESTIMATED_MEDIA_HEIGHT: 150,
        CHUNK_ESTIMATED_SEPARATOR_HEIGHT: 34,
        renderedMessages: new Map(),
        observer: null,
        
        pdfState: {
            running: false,
            cancel: false,
            blobUrl: null,
            fileName: null
        },
        
        dateNavState: {
            bucketsByScale: { month: [], week: [], day: [] },
            scale: 'month',
            activeKey: null,
            scrollTimer: null,
            sliderTimer: null,
            headerHover: false,
            autoCollapse: true,
            collapsed: false,
            syncing: false
        },

        searchIndex: null,
        currentChatData: null,
        
        mediaFiles: {},
        mediaTypes: {},
        mediaLookup: new Map(),
        mediaPathIndex: new Set(),
        mediaBasenameIndex: new Set()
    };
})();
