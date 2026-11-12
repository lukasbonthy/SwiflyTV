# Player color and depth refinements

The user wants parts of the pixel ripples to follow movie-frame colors, richer skip/next prompts, subtler button feedback, and the background to zoom out behind movie details while the top navigation stays fixed. Their latest correction makes Play the ripple-burst trigger; source discovery must not trigger it.

Use the existing native canvas renderer. Sample a tiny frame a few times per second, blend six spatial color regions gradually, and retain green patches. A quick expanding pulse begins on a valid Play intent; normal rings continue afterward. Sampling must pause when hidden/offscreen/fullscreen, avoid reading unchanged paused frames, and stop retrying a source whose pixels are cross-origin protected. Playback attributes and source routing remain unchanged.

Make skip prompts a compact pale action with an arrow badge and a thin media-clock progress line; improve next-episode surfaces to match. Use short, monotonic entrance/exit motion. Replace the translated, bouncing button effect with a brief opacity press and smooth release, preserving native input and button geometry.

Scale the existing browse-scene wrapper to 97% while details open, around the current viewport center. Coordinate its CSS transition with the sheet, restore it during close, and keep the topbar outside the transformed subtree. Preserve scroll, dialog modality, history, interruption handling and reduced-motion behavior.

Considered a full-video ambient blur, but the requested pixel field already fits the site and costs much less. Reusing the browse wrapper avoids moving the body or creating a containing block for the fixed topbar. No new dependencies.
