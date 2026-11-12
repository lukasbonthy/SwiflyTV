# Quiet featured controls and one entry dissolve

The user dislikes the separate pause/play icon and the loading sequence. Remove that separate Home control. Keep the five existing progress bars, swipe, arrows and automatic rotation. The active progress bar also pauses/resumes rotation, with an explicit accessible name and tooltip; inactive bars still select movies. Keyboard pause, reduced motion, TV/manual behavior and finite dwell timers remain supported. This is my implementation choice based on the existing controls, not a new preference attributed to the user.

The entry gate currently waits for DOMContentLoaded (after deferred scripts), can release its safety deadline first, then scans and hides already visible artwork. At reveal it also starts asset opacity fades at the same time as the black curtain, creating two fades. Start the initial scan when parsing reaches interactive, use one idempotent boot shared with DOMContentLoaded, preserve visible initial assets if the deadline/Escape already released the curtain, and let the curtain own the initial dissolve. Later inserted/decoded artwork still fades normally.

Alternatives considered: restyling the unwanted icon leaves the clutter; removing all pause mechanisms loses control of autoplay; replacing the loader wholesale discards working navigation/status and accessibility handling. Use the existing controllers with the focused lifecycle changes above. Preserve Studio choices, native scrolling, seven desktop posters, optical material, original renderer and original backup. No dependency, playback, API-provider or deployment-setting changes.

Authorization: prior GitHub/Render publishing and opt-out of repeated approvals persist. Validate delayed scripts, late assets, Escape/history, keyboard controls, reduced motion and mobile layout. Publish the tested commit through main and verify Render files.

The delayed-script preview also demonstrated a decoded logo switching in after the black dissolve because catalog.js alone applied hasLogo. The entry gate now presents its owned decoded title art before revealing the initial scene; failed art retains text and replaced/detached logos cannot alter the title.

User steering: also use the supplied 1254x1254 PNG as the site favicon and the supplied transparent SVG bird from SwiflyTV-navbar-logo-assets.zip in place of the top navigation wordmark. Preserve both files exactly, retain the existing accessible Home link, and use the icon on desktop/mobile. Favicon assets remain public alongside existing public styles/images and appear on the access page too.
