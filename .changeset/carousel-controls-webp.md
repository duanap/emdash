---
"emdash": minor
"@emdash-cms/admin": minor
---

Adds a dedicated Homepage Carousel settings page with playback interval, blur, mask opacity, text position and size, and separate desktop and mobile heights. Existing slides remain available; a height of zero keeps the image's natural aspect ratio.

Admin image uploads now convert static JPEG, PNG, BMP, AVIF, and SVG files to WebP at 85% quality, with the longest side capped at 2560 pixels. Transparency is retained. Existing media and same-key original-image edits retain their format; GIF, animated PNG, and existing WebP uploads keep their original bytes so animation is not lost.
