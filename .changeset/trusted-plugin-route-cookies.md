---
"emdash": minor
---

Trusted plugins can now set cookies and redirect off-origin from `response: "raw"` routes.

Previously every raw plugin response had non-allowlisted headers stripped and public raw routes were pinned to the site origin, so a plugin could not implement a cookie session or an OAuth redirect (a QQ, GitHub or Google login callback, for example). Trusted (in-process) plugins now keep `Set-Cookie` headers — one header per cookie, so a login and a cookie-clearing header can be sent together — and may return an off-origin `Location`.

Sandboxed plugins are unchanged: they still cannot set cookies or redirect off-origin, because their code is untrusted and a plugin-supplied cookie could shadow host session cookies.

Existing plugins need no changes: a raw route that returns neither header behaves exactly as before.
