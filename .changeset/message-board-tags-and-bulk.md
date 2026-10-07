---
"@emdash-cms/admin": minor
"emdash": minor
---

Adds a message-board editor that creates and edits individual comments without changing the containing page. Set `admin.messageBoardCollection` to the collection used by the board. Public submissions to that collection require approval before appearing on the site; messages added by an editor publish immediately.

Adds multi-select custom values through `validation.allowCustom: true`. Existing fields keep their current validation until this option is enabled. Saving field settings preserves the option.

Adds bulk restoration and permanent deletion in content and comment trash views. Comment selections larger than 100 items are processed in bounded batches, and completed batches refresh even when a later request fails.

Adds the opt-in `publicPageSuffix: ".html"` setting for generated content URLs. Sites enabling it must also provide matching frontend routes and redirects for their old URLs.
