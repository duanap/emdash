---
"emdash": minor
"@emdash-cms/admin": minor
---

Adds optional `heroSlides` site settings with image uploads, destination links, descriptions, and ordering in General Settings. Themes can render these settings without extra content queries.

Adds an administrator action to generate and check the sitemap against published, indexable content and record its last update time. Sitemap responses now require cache revalidation so updated content can appear immediately; installations needing the previous one-hour response cache can set that policy in their reverse proxy.
