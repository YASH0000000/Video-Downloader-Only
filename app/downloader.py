import os
import re
from typing import Dict, Any, Optional, Callable
import yt_dlp

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN_FFMPEG = os.path.join(BASE_DIR, "bin", "ffmpeg")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")

os.makedirs(DOWNLOADS_DIR, exist_ok=True)


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "Unknown"
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def get_base_ydl_opts(cookies_path: Optional[str] = None) -> Dict[str, Any]:
    opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": BIN_FFMPEG if os.path.exists(BIN_FFMPEG) else None,
    }
    if cookies_path and os.path.exists(cookies_path):
        opts["cookiefile"] = cookies_path
    return opts


def inspect_url(url: str, cookies_path: Optional[str] = None) -> Dict[str, Any]:
    opts = get_base_ydl_opts(cookies_path)
    opts.update({
        "skip_download": True,
        "extract_flat": "in_playlist",
    })

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info:
            raise ValueError("Could not retrieve media metadata for URL")

    is_playlist = info.get("_type") == "playlist" or "entries" in info

    if is_playlist:
        entries = list(info.get("entries") or [])
        first_entry = entries[0] if entries else {}
        return {
            "is_playlist": True,
            "title": info.get("title") or "Playlist",
            "playlist_count": len(entries),
            "channel": info.get("uploader") or info.get("channel") or "Unknown",
            "thumbnail": info.get("thumbnails", [{}])[-1].get("url") if info.get("thumbnails") else first_entry.get("thumbnail"),
            "video_formats": [
                {"id": "best", "label": "Best Available Quality (Auto-Select)"},
                {"id": "2160", "label": "4K Ultra HD (2160p)"},
                {"id": "1440", "label": "2K Quad HD (1440p)"},
                {"id": "1080", "label": "Full HD (1080p)"},
                {"id": "720", "label": "HD (720p)"},
                {"id": "480", "label": "Standard (480p)"},
                {"id": "360", "label": "Low (360p)"},
            ],
            "audio_formats": [
                {"id": "mp3_320", "label": "MP3 (320 kbps - Ultra High)"},
                {"id": "mp3_192", "label": "MP3 (192 kbps - Standard High)"},
                {"id": "m4a", "label": "M4A / AAC (Native Apple Quality)"},
                {"id": "flac", "label": "FLAC (Lossless Audio)"},
                {"id": "best_audio", "label": "Best Original Stream (No Transcode)"},
            ],
        }

    formats = info.get("formats", [])
    available_heights = set()
    has_premium_1080p = False

    for f in formats:
        height = f.get("height")
        if height and isinstance(height, int) and height >= 144:
            available_heights.add(height)
        format_note = str(f.get("format_note") or "")
        if "premium" in format_note.lower():
            has_premium_1080p = True

    sorted_heights = sorted(list(available_heights), reverse=True)

    video_options = [{"id": "best", "label": "Best Available (Highest Bitrate & Resolution)"}]
    if has_premium_1080p:
        video_options.append({"id": "1080p_premium", "label": "1080p Premium (Enhanced Bitrate)"})

    resolution_labels = {
        4320: "8K Ultra HD (4320p)",
        2160: "4K Ultra HD (2160p)",
        1440: "2K Quad HD (1440p)",
        1080: "Full HD (1080p)",
        720: "HD (720p)",
        480: "Standard (480p)",
        360: "Standard (360p)",
        240: "Low (240p)",
        144: "Mobile (144p)",
    }

    for h in sorted_heights:
        label = resolution_labels.get(h, f"{h}p")
        video_options.append({"id": str(h), "label": label})

    audio_options = [
        {"id": "mp3_320", "label": "MP3 (320 kbps - High Bitrate)"},
        {"id": "mp3_192", "label": "MP3 (192 kbps - High Quality)"},
        {"id": "m4a", "label": "M4A / AAC (Fast & Clean)"},
        {"id": "flac", "label": "FLAC (Lossless)"},
        {"id": "best_audio", "label": "Best Native Stream (Opus/AAC)"},
    ]

    return {
        "is_playlist": False,
        "title": info.get("title") or "Video",
        "duration": format_duration(info.get("duration")),
        "channel": info.get("uploader") or info.get("channel") or "Unknown",
        "thumbnail": info.get("thumbnail"),
        "video_formats": video_options,
        "audio_formats": audio_options,
    }


def download_media(
    url: str,
    mode: str,
    quality: str,
    is_playlist: bool = False,
    cookies_path: Optional[str] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    opts = get_base_ydl_opts(cookies_path)

    # Parallel fragment downloading for DASH / HLS streams
    opts["concurrent_fragment_downloads"] = 8
    opts["retries"] = 10
    opts["fragment_retries"] = 10
    opts["noplaylist"] = not is_playlist

    if is_playlist:
        opts["outtmpl"] = os.path.join(DOWNLOADS_DIR, "%(playlist_title)s", "%(playlist_index)02d - %(title)s.%(ext)s")
    else:
        opts["outtmpl"] = os.path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s")

    if mode == "audio":
        opts["format"] = "ba/b"
        if quality == "mp3_320":
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"},
                {"key": "FFmpegMetadata"},
            ]
        elif quality == "mp3_192":
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"},
                {"key": "FFmpegMetadata"},
            ]
        elif quality == "m4a":
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "m4a"},
                {"key": "FFmpegMetadata"},
            ]
        elif quality == "flac":
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "flac"},
                {"key": "FFmpegMetadata"},
            ]
        elif quality == "best_audio":
            opts["postprocessors"] = [{"key": "FFmpegMetadata"}]
    else:
        opts["merge_output_format"] = "mp4"
        if quality == "1080p_premium":
            opts["format"] = "bv*[format_note*=Premium]+ba/bv*[height<=1080]+ba/b"
        elif quality == "best":
            opts["format"] = "bv*+ba/b"
        else:
            try:
                target_height = int(quality)
                opts["format"] = f"bv*[height<={target_height}]+ba/b[height<={target_height}]"
            except ValueError:
                opts["format"] = "bv*+ba/b"

    def hook(d: Dict[str, Any]):
        if not progress_callback:
            return
        status = d.get("status")
        if status == "downloading":
            total_bytes = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            percent = (downloaded / total_bytes * 100) if total_bytes > 0 else 0
            speed = d.get("speed") or 0
            speed_str = f"{speed / (1024 * 1024):.2f} MB/s" if speed else "Calculating..."
            eta = d.get("eta")
            eta_str = f"{eta}s" if eta is not None else "Unknown"

            progress_callback({
                "status": "downloading",
                "percent": round(percent, 1),
                "speed": speed_str,
                "eta": eta_str,
                "filename": os.path.basename(str(d.get("filename", ""))),
            })
        elif status == "finished":
            progress_callback({
                "status": "muxing",
                "percent": 100.0,
                "speed": "Processing",
                "eta": "Finishing",
                "filename": os.path.basename(str(d.get("filename", ""))),
            })

    opts["progress_hooks"] = [hook]

    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(url, download=True)
        title = result.get("title") if result else "Media"

    if progress_callback:
        progress_callback({
            "status": "completed",
            "percent": 100.0,
            "speed": "Done",
            "eta": "0s",
            "title": title,
        })

    return {"status": "success", "title": title}
