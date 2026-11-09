import os
import re
from typing import Dict, Any, Optional, Callable
import yt_dlp

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN_FFMPEG = os.path.join(BASE_DIR, "bin", "ffmpeg")
DEFAULT_DOWNLOADS_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
FALLBACK_DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")

# Ensure default directory exists
os.makedirs(DEFAULT_DOWNLOADS_DIR, exist_ok=True)


def resolve_downloads_dir(custom_path: Optional[str] = None) -> str:
    if custom_path and custom_path.strip():
        expanded = os.path.abspath(os.path.expanduser(custom_path.strip()))
        os.makedirs(expanded, exist_ok=True)
        return expanded
    return DEFAULT_DOWNLOADS_DIR if os.path.exists(DEFAULT_DOWNLOADS_DIR) else FALLBACK_DOWNLOADS_DIR


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

    # Determine if link points directly to a playlist or contains a playlist parameter
    is_direct_playlist = info.get("_type") == "playlist" or "entries" in info
    has_list_param = "list=" in url.lower()

    playlist_count = 0
    playlist_title = None

    if is_direct_playlist:
        entries = list(info.get("entries") or [])
        playlist_count = len(entries)
        playlist_title = info.get("title") or "Playlist"
        first_entry = entries[0] if entries else {}
        thumbnail = info.get("thumbnails", [{}])[-1].get("url") if info.get("thumbnails") else first_entry.get("thumbnail")
        title = playlist_title
        author = info.get("uploader") or info.get("channel") or "Unknown"
        duration = None
    else:
        title = info.get("title") or "Video"
        author = info.get("uploader") or info.get("channel") or "Unknown"
        duration = format_duration(info.get("duration"))
        thumbnail = info.get("thumbnail")

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

    video_options = [{"id": "best", "label": "Best Available (Highest Bitrate)"}]
    if has_premium_1080p:
        video_options.append({"id": "1080p_premium", "label": "1080p Premium (Enhanced Bitrate)"})

    resolution_labels = {
        4320: "8K (4320p)",
        2160: "4K Ultra HD (2160p)",
        1440: "1440p Quad HD",
        1080: "1080p Full HD",
        720: "720p HD",
        480: "480p",
        360: "360p",
        240: "240p",
        144: "144p",
    }

    if sorted_heights:
        for h in sorted_heights:
            label = resolution_labels.get(h, f"{h}p")
            video_options.append({"id": str(h), "label": label})
    else:
        # Fallback preset options if format list is flat
        video_options.extend([
            {"id": "2160", "label": "4K Ultra HD (2160p)"},
            {"id": "1440", "label": "1440p Quad HD"},
            {"id": "1080", "label": "1080p Full HD"},
            {"id": "720", "label": "720p HD"},
            {"id": "480", "label": "480p"},
        ])

    audio_options = [
        {"id": "mp3_320", "label": "MP3 (320 kbps)"},
        {"id": "mp3_192", "label": "MP3 (192 kbps)"},
        {"id": "m4a", "label": "M4A / AAC"},
        {"id": "flac", "label": "FLAC (Lossless)"},
        {"id": "best_audio", "label": "Original Stream (No Transcode)"},
    ]

    return {
        "title": title,
        "author": author,
        "duration": duration,
        "thumbnail": thumbnail,
        "is_playlist": is_direct_playlist or has_list_param,
        "playlist_count": playlist_count,
        "playlist_title": playlist_title,
        "default_save_path": resolve_downloads_dir(),
        "video_formats": video_options,
        "audio_formats": audio_options,
    }


def download_media(
    url: str,
    mode: str,
    quality: str,
    download_type: str = "single",  # "single" or "playlist"
    playlist_range: Optional[str] = None,
    output_dir: Optional[str] = None,
    cookies_path: Optional[str] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    opts = get_base_ydl_opts(cookies_path)
    target_dir = resolve_downloads_dir(output_dir)

    is_playlist = (download_type == "playlist")
    opts["noplaylist"] = not is_playlist
    opts["concurrent_fragment_downloads"] = 8
    opts["retries"] = 10
    opts["fragment_retries"] = 10

    if is_playlist:
        opts["outtmpl"] = os.path.join(target_dir, "%(playlist_title)s", "%(playlist_index)02d - %(title)s.%(ext)s")
        if playlist_range and playlist_range.strip():
            opts["playlist_items"] = playlist_range.strip()
    else:
        opts["outtmpl"] = os.path.join(target_dir, "%(title)s.%(ext)s")

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
            speed_str = f"{speed / (1024 * 1024):.1f} MB/s" if speed else "Calculating..."
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
            "save_path": target_dir,
        })

    return {"status": "success", "title": title, "save_path": target_dir}
