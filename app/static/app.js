let currentMediaData = null;
let currentMode = "video"; // "video" | "audio"
let activeJobId = null;
let pollInterval = null;

const urlInput = document.getElementById("url-input");
const inspectBtn = document.getElementById("inspect-btn");
const inspectLoading = document.getElementById("inspect-loading");
const errorBanner = document.getElementById("error-banner");

const mediaPreview = document.getElementById("media-preview");
const mediaThumb = document.getElementById("media-thumb");
const mediaTitle = document.getElementById("media-title");
const mediaAuthor = document.getElementById("media-author");
const mediaDuration = document.getElementById("media-duration");
const mediaPlaylistTag = document.getElementById("media-playlist-tag");

const formatControls = document.getElementById("format-controls");
const modeVideoBtn = document.getElementById("mode-video");
const modeAudioBtn = document.getElementById("mode-audio");
const variantLabel = document.getElementById("variant-label");
const variantSelect = document.getElementById("variant-select");
const playlistContainer = document.getElementById("playlist-option-container");
const playlistCheckbox = document.getElementById("playlist-checkbox");

const advancedToggle = document.getElementById("advanced-toggle");
const advancedContent = document.getElementById("advanced-content");
const cookiesPathInput = document.getElementById("cookies-path");

const downloadBtn = document.getElementById("download-btn");
const progressContainer = document.getElementById("progress-container");
const progressStatus = document.getElementById("progress-status");
const progressPercent = document.getElementById("progress-percent");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressSpeed = document.getElementById("progress-speed");
const progressEta = document.getElementById("progress-eta");

const downloadsList = document.getElementById("downloads-list");
const refreshHistoryBtn = document.getElementById("refresh-history-btn");
const openFolderBtn = document.getElementById("open-folder-btn");

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
}

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
}

function setMode(mode) {
    currentMode = mode;
    if (mode === "video") {
        modeVideoBtn.classList.add("active");
        modeAudioBtn.classList.remove("active");
        variantLabel.textContent = "Select Video Resolution";
        populateVariants(currentMediaData?.video_formats || []);
    } else {
        modeAudioBtn.classList.add("active");
        modeVideoBtn.classList.remove("active");
        variantLabel.textContent = "Select Audio Variant";
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
        showError("Please paste or type a valid media link first.");
        return;
    }

    clearError();
    inspectLoading.classList.remove("hidden");
    mediaPreview.classList.add("hidden");
    formatControls.classList.add("hidden");
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
            throw new Error(json.detail || "Failed to inspect media URL");
        }

        currentMediaData = json.data;
        renderMediaPreview(currentMediaData);
        setMode(currentMode);
        formatControls.classList.remove("hidden");
    } catch (err) {
        showError(err.message);
    } finally {
        inspectLoading.classList.add("hidden");
        inspectBtn.disabled = false;
    }
}

function renderMediaPreview(data) {
    mediaTitle.textContent = data.title;
    mediaAuthor.textContent = data.channel || "";
    mediaDuration.textContent = data.duration ? `⏱ ${data.duration}` : "";
    if (data.thumbnail) {
        mediaThumb.src = data.thumbnail;
        mediaThumb.classList.remove("hidden");
    } else {
        mediaThumb.classList.add("hidden");
    }

    if (data.is_playlist) {
        mediaPlaylistTag.textContent = `Playlist (${data.playlist_count} videos)`;
        mediaPlaylistTag.classList.remove("hidden");
        playlistContainer.classList.remove("hidden");
        playlistCheckbox.checked = true;
    } else {
        mediaPlaylistTag.classList.add("hidden");
        playlistContainer.classList.add("hidden");
        playlistCheckbox.checked = false;
    }

    mediaPreview.classList.remove("hidden");
}

async function startDownload() {
    const url = urlInput.value.trim();
    if (!url) return;

    clearError();
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Initializing...";
    progressContainer.classList.remove("hidden");

    try {
        const payload = {
            url: url,
            mode: currentMode,
            quality: variantSelect.value,
            is_playlist: playlistCheckbox.checked,
            cookies_path: cookiesPathInput.value.trim() || null,
        };

        const res = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) {
            throw new Error(json.detail || "Failed to start download job");
        }

        activeJobId = json.job_id;
        startPollingProgress();
    } catch (err) {
        showError(err.message);
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Start Download";
        progressContainer.classList.add("hidden");
    }
}

function startPollingProgress() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        if (!activeJobId) return;

        try {
            const res = await fetch(`/api/progress/${activeJobId}`);
            if (!res.ok) return;
            const data = await res.json();

            updateProgressUI(data);

            if (data.status === "completed") {
                clearInterval(pollInterval);
                pollInterval = null;
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Download Another";
                loadDownloads();
            } else if (data.status === "error") {
                clearInterval(pollInterval);
                pollInterval = null;
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Retry Download";
                showError("Download failed: " + (data.error || "Unknown error"));
            }
        } catch (e) {
            console.error("Progress poll error:", e);
        }
    }, 500);
}

function updateProgressUI(data) {
    const percent = Math.min(100, Math.max(0, data.percent || 0));
    progressBarFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;

    if (data.status === "downloading") {
        progressStatus.textContent = `Downloading ${data.filename || ""}...`;
        progressSpeed.textContent = `Speed: ${data.speed || "--"}`;
        progressEta.textContent = `ETA: ${data.eta || "--"}`;
    } else if (data.status === "muxing") {
        progressStatus.textContent = "Muxing & finalizing with FFmpeg...";
        progressSpeed.textContent = "Speed: Max";
        progressEta.textContent = "Almost ready...";
    } else if (data.status === "completed") {
        progressStatus.textContent = "Completed Successfully!";
        progressSpeed.textContent = "Finished";
        progressEta.textContent = "Saved to downloads";
    } else if (data.status === "starting") {
        progressStatus.textContent = "Allocating streams...";
    }
}

async function loadDownloads() {
    try {
        const res = await fetch("/api/downloads");
        if (!res.ok) return;
        const data = await res.json();

        if (!data.files || data.files.length === 0) {
            downloadsList.innerHTML = `<div class="empty-state">No downloads yet. Downloaded files will appear here.</div>`;
            return;
        }

        downloadsList.innerHTML = "";
        data.files.forEach(f => {
            const item = document.createElement("div");
            item.className = "download-item";
            item.innerHTML = `
                <div class="file-info">
                    <span class="file-icon">${f.name.endsWith(".mp3") || f.name.endsWith(".m4a") || f.name.endsWith(".flac") ? "🎵" : "🎬"}</span>
                    <span class="file-name" title="${f.name}">${f.name}</span>
                </div>
                <span class="file-size">${f.size_mb} MB</span>
            `;
            downloadsList.appendChild(item);
        });
    } catch (err) {
        console.error("Failed to load downloads:", err);
    }
}

async function openDownloadsFolder() {
    try {
        await fetch("/api/open-downloads", { method: "POST" });
    } catch (err) {
        console.error("Failed to open folder:", err);
    }
}

// Event Listeners
modeVideoBtn.addEventListener("click", () => setMode("video"));
modeAudioBtn.addEventListener("click", () => setMode("audio"));
inspectBtn.addEventListener("click", inspectUrl);
downloadBtn.addEventListener("click", startDownload);
refreshHistoryBtn.addEventListener("click", loadDownloads);
openFolderBtn.addEventListener("click", openDownloadsFolder);

advancedToggle.addEventListener("click", () => {
    advancedContent.classList.toggle("hidden");
    const arrow = advancedToggle.querySelector("span");
    arrow.textContent = advancedContent.classList.contains("hidden") ? "▶" : "▼";
});

// Auto-inspect on paste or Enter key
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

// Initial load
loadDownloads();
