# Media Downloader

A minimalist, high-speed media downloader for Linux. Built to download videos, playlists, audio streams, and YouTube Premium formats across YouTube, TikTok, Twitter/X, Instagram, Vimeo, and 1,800+ supported sites.

## Features
- **Minimalist Web UI**: Single-screen, clean dark design.
- **Dynamic Format Discovery**: Automatically inspects streams for resolution variants (4K, 1440p, 1080p Premium, 1080p, 720p, etc.) and audio variants (MP3 320k, MP3 192k, M4A, FLAC, Native Opus).
- **Playlist Support**: Toggle to download individual videos or entire playlists.
- **Parallel Chunk Streams**: Uses 8 concurrent fragment connections for DASH/HLS streams.
- **Embedded FFmpeg**: Uses local static FFmpeg for high-speed lossless muxing and tagging.
- **One-Click Launch**: Double-click `launch.sh` or the application launcher to boot the server and open your browser automatically.

## Quick Launch
Run the launcher from terminal or double-click `launch.sh` in your file manager:
```bash
./launch.sh
```
Or open the application from your desktop launcher menu as **Media Downloader**.
