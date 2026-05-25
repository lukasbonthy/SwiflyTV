# Strict media filter fix

The previous build falsely embedded site.webmanifest/php/xml/html/social/admin URLs because it allowed any file extension and treated the word manifest as HLS.

This build only embeds real media extensions, blocks social/admin/adult/nav junk, and keeps intermediate links only for extraction.
