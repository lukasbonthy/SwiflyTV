"""Identify a short movie-audio sample. Input and output are bounded by Node."""
import asyncio
import json
import os
import sys


async def main():
    from shazamio import Shazam
    sample = sys.stdin.buffer.read(416045)
    if not 288044 <= len(sample) <= 416044:
        raise ValueError("Invalid sample length")
    shazam = Shazam(segment_duration_seconds=12)
    result = await asyncio.wait_for(shazam.recognize(sample, proxy=os.environ.get("HTTPS_PROXY") or None), timeout=28)
    track = result.get("track") or {}
    title, artist = track.get("title"), track.get("subtitle")
    print(json.dumps({"track": {"title": title, "artist": artist, "url": track.get("url", "")} if title and artist else None}))


try:
    asyncio.run(main())
except Exception:
    print(json.dumps({"error": "recognition_unavailable"}))
    sys.exit(1)
