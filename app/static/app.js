let currentMediaData = null;
let currentMode = "video"; // "video" | "audio"
let currentScope = "single"; // "single" | "playlist"
let activeJobId = null;
let pollInterval = null;

const urlInput = document.getElementById("url-input");
const inspectBtn = document.getElementById("inspect-btn");
const inspectState = document.getElementById("inspect-state");
const inspectText = document.getElementById("inspect-text");
const errorBanner = document.getElementById("error-banner");

const mediaPreview = document.getElementById("media-preview");
const mediaThumb = document.getElementById("media-thumb");
const mediaTitle = document.getElementById("media-title");
const mediaChannel = document.getElementById("media-channel");
const mediaDuration = document.getElementById("media-duration");
const mediaBadge = document.getElementById("media-badge");

const configSection = document.getElementById("config-section");
const scopeSingleBtn = document.getElementById("scope-single-btn");
const scopePlaylistBtn = document.getElementById("scope-playlist-btn");
const playlistRangeField = document.getElementById("playlist-range-field");
const playlistRangeInput = document.getElementById("playlist-range-input");

const modeVideoBtn = document.getElementById("mode-video-btn");
const modeAudioBtn = document.getElementById("mode-audio-btn");
const variantLabel = document.getElementById("variant-label");
const variantSelect = document.getElementById("variant-select");

const saveDirInput = document.getElementById("save-dir-input");
const browseFolderBtn = document.getElementById("browse-folder-btn");
const openFolderNavBtn = document.getElementById("open-folder-nav-btn");
const openFolderInlineBtn = document.getElementById("open-folder-inline-btn");
const presetPills = document.querySelectorAll(".preset-pill");

const authToggle = document.getElementById("auth-toggle");
const authContent = document.getElementById("auth-content");
const cookiesPathInput = document.getElementById("cookies-path-input");

const downloadBtn = document.getElementById("download-btn");
const progressCard = document.getElementById("progress-card");
const progressState = document.getElementById("progress-state");
const progressNum = document.getElementById("progress-num");
const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");
const progressSpeed = document.getElementById("progress-speed");
const progressEta = document.getElementById("progress-eta");

const filesList = document.getElementById("files-list");
const refreshBtn = document.getElementById("refresh-btn");

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
    urlInput.setAttribute("aria-invalid", "true");
}

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
    urlInput.removeAttribute("aria-invalid");
}

function setSaveDirectory(dir) {
    if (!dir) return;
    saveDirInput.value = dir;
    localStorage.setItem("vget_save_dir", dir);

    presetPills.forEach(pill => {
        const isMatch = pill.getAttribute("data-path") === dir;
        if (isMatch) {
            pill.classList.add("active");
            pill.setAttribute("aria-pressed", "true");
        } else {
            pill.classList.remove("active");
            pill.setAttribute("aria-pressed", "false");
        }
    });

    loadRecentFiles();
}

function setScope(scope) {
    currentScope = scope;
    if (scope === "single") {
        scopeSingleBtn.classList.add("active");
        scopeSingleBtn.setAttribute("aria-checked", "true");
        scopePlaylistBtn.classList.remove("active");
        scopePlaylistBtn.setAttribute("aria-checked", "false");
        playlistRangeField.classList.add("hidden");
    } else {
        scopePlaylistBtn.classList.add("active");
        scopePlaylistBtn.setAttribute("aria-checked", "true");
        scopeSingleBtn.classList.remove("active");
        scopeSingleBtn.setAttribute("aria-checked", "false");
        playlistRangeField.classList.remove("hidden");
    }
}

function setMode(mode) {
    currentMode = mode;
    if (mode === "video") {
        modeVideoBtn.classList.add("active");
        modeVideoBtn.setAttribute("aria-checked", "true");
        modeAudioBtn.classList.remove("active");
        modeAudioBtn.setAttribute("aria-checked", "false");
        variantLabel.textContent = "Target Resolution";
        populateVariants(currentMediaData?.video_formats || []);
    } else {
        modeAudioBtn.classList.add("active");
        modeAudioBtn.setAttribute("aria-checked", "true");
        modeVideoBtn.classList.remove("active");
        modeVideoBtn.setAttribute("aria-checked", "false");
        variantLabel.textContent = "Target Audio Quality";
        populateVariants(currentMediaData?.audio_formats || []);
    }
}

function populateVariants(options) {
    variantSelect.innerHTML = "";
    if (!options || options.length === 0) {
        const opt = document.createElement("option");
        opt.value = "best";
        opt.textContent = "Best Available Quality";
        variantSelect.appendChild(opt);
        return;
    }
    options.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.label;
        variantSelect.appendChild(opt);
    });
}

async function inspectUrl() {
    const url = urlInput.value.trim();
    if (!url) {
        showError("Paste a valid media link first.");
        return;
    }

    clearError();
    inspectState.classList.remove("hidden");
    mediaPreview.classList.add("hidden");
    configSection.classList.add("hidden");
    inspectBtn.disabled = true;

    try {
        const res = await fetch("/api/inspect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: url,
                cookies_path: cookiesPathInput.value.trim() || null,
            }),
        });

        const json = await res.json();
        if (!res.ok) {
            throw new Error(json.detail || "Failed to inspect URL");
        }

        currentMediaData = json.data;
        renderMediaData(currentMediaData);
        setMode(currentMode);
        configSection.classList.remove("hidden");
    } catch (err) {
        showError(err.message);
    } finally {
        inspectState.classList.add("hidden");
        inspectBtn.disabled = false;
    }
}

function renderMediaData(data) {
    mediaTitle.textContent = data.title;
    mediaChannel.textContent = data.author || "";
    mediaDuration.textContent = data.duration || "";
    
    if (data.thumbnail) {
        mediaThumb.src = data.thumbnail;
        mediaThumb.classList.remove("hidden");
    } else {
        mediaThumb.classList.add("hidden");
    }

    if (!saveDirInput.value.trim() && data.default_save_path) {
        setSaveDirectory(data.default_save_path);
    }

    if (data.is_playlist) {
        const count = data.playlist_count > 0 ? `Playlist (${data.playlist_count})` : "Playlist";
        mediaBadge.textContent = count;
        mediaBadge.classList.remove("hidden");
        setScope("playlist");
    } else {
        mediaBadge.classList.add("hidden");
        setScope("single");
    }

    mediaPreview.classList.remove("hidden");
}

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearError();
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Connecting to streams...";
    progressCard.classList.remove("hidden");

    try {
        const payload = {
            url: url,
            mode: currentMode,
            quality: variantSelect.value,
            download_type: currentScope,
            playlist_range: playlistRangeInput.value.trim() || null,
            output_dir: saveDirInput.value.trim() || null,
            cookies_path: cookiesPathInput.value.trim() || null,
        };

        const res = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) {
            throw new Error(json.detail || "Failed to dispatch download");
        }

        activeJobId = json.job_id;
        startPolling();
    } catch (err) {
        showError(err.message);
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Start Download";
        progressCard.classList.add("hidden");
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        if (!activeJobId) return;

        try {
            const res = await fetch(`/api/progress/${activeJobId}`);
            if (!res.ok) return;
            const data = await res.json();

            updateProgress(data);

            if (data.status === "completed") {
                clearInterval(pollInterval);
                pollInterval = null;
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Download Another";
                loadRecentFiles();
            } else if (data.status === "error") {
                clearInterval(pollInterval);
                pollInterval = null;
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Retry Download";
                showError(data.error || "Download encountered an error");
            }
        } catch (e) {
            console.error("Progress poll error:", e);
        }
    }, 500);
}

function updateProgress(data) {
    const pct = Math.min(100, Math.max(0, data.percent || 0));
    progressFill.style.width = `${pct}%`;
    progressNum.textContent = `${pct}%`;
    if (progressTrack) {
        progressTrack.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    if (data.status === "downloading") {
        progressState.textContent = data.filename ? `Downloading ${data.filename}` : "Downloading media chunks...";
        progressSpeed.textContent = `Speed: ${data.speed || "--"}`;
        progressEta.textContent = `ETA: ${data.eta || "--"}`;
    } else if (data.status === "muxing") {
        progressState.textContent = "Muxing and tagging output (FFmpeg)...";
        progressSpeed.textContent = "Speed: Max";
        progressEta.textContent = "Almost complete";
    } else if (data.status === "completed") {
        progressState.textContent = "Complete. Saved to disk.";
        progressSpeed.textContent = "Speed: --";
        progressEta.textContent = "Finished";
    } else if (data.status === "starting") {
        progressState.textContent = "Allocating streams...";
    }
}

async function loadRecentFiles() {
    const dir = saveDirInput.value.trim() || null;
    const query = dir ? `?dir=${encodeURIComponent(dir)}` : "";
    try {
        const res = await fetch(`/api/downloads${query}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.downloads_dir && !saveDirInput.value.trim()) {
            saveDirInput.value = data.downloads_dir;
        }

        if (!data.files || data.files.length === 0) {
            filesList.innerHTML = `<div class="empty-notice">No files downloaded in this folder yet.</div>`;
            return;
        }

        filesList.innerHTML = "";
        data.files.forEach(f => {
            const row = document.createElement("div");
            row.className = "file-row";
            row.innerHTML = `
                <span class="file-name" title="${f.name}">${f.name}</span>
                <span class="file-size">${f.size_mb} MB</span>
            `;
            filesList.appendChild(row);
        });
    } catch (err) {
        console.error("Failed to load files:", err);
    }
}

async function openSaveDirectory() {
    const targetPath = saveDirInput.value.trim() || null;
    try {
        await fetch("/api/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: targetPath }),
        });
    } catch (err) {
        console.error("Failed to open directory:", err);
    }
}

async function browseFolder() {
    browseFolderBtn.disabled = true;
    browseFolderBtn.textContent = "Selecting...";
    try {
        const res = await fetch("/api/browse-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_path: saveDirInput.value.trim() || null }),
        });
        const data = await res.json();
        if (data.success && data.selected_path) {
            setSaveDirectory(data.selected_path);
        }
    } catch (err) {
        console.error("Folder picker error:", err);
    } finally {
        browseFolderBtn.disabled = false;
        browseFolderBtn.textContent = "Change Folder...";
    }
}

// Preset pills
presetPills.forEach(pill => {
    pill.addEventListener("click", () => {
        const path = pill.getAttribute("data-path");
        setSaveDirectory(path);
    });
});

// Event bindings
scopeSingleBtn.addEventListener("click", () => setScope("single"));
scopePlaylistBtn.addEventListener("click", () => setScope("playlist"));
modeVideoBtn.addEventListener("click", () => setMode("video"));
modeAudioBtn.addEventListener("click", () => setMode("audio"));

inspectBtn.addEventListener("click", inspectUrl);
downloadBtn.addEventListener("click", startDownload);
refreshBtn.addEventListener("click", loadRecentFiles);
openFolderNavBtn.addEventListener("click", openSaveDirectory);
openFolderInlineBtn.addEventListener("click", openSaveDirectory);
browseFolderBtn.addEventListener("click", browseFolder);

saveDirInput.addEventListener("change", () => {
    setSaveDirectory(saveDirInput.value.trim());
});

authToggle.addEventListener("click", () => {
    const isExpanded = authToggle.getAttribute("aria-expanded") === "true";
    authToggle.setAttribute("aria-expanded", String(!isExpanded));
    authContent.classList.toggle("hidden");
});

urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        inspectUrl();
    }
});

let pasteTimeout = null;
urlInput.addEventListener("paste", () => {
    if (pasteTimeout) clearTimeout(pasteTimeout);
    pasteTimeout = setTimeout(() => {
        if (urlInput.value.trim().startsWith("http")) {
            inspectUrl();
        }
    }, 150);
});

// Boot: restore saved directory or default
const savedDir = localStorage.getItem("vget_save_dir");
if (savedDir) {
    setSaveDirectory(savedDir);
} else {
    loadRecentFiles();
}
