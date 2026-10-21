# project-links

A **Links** pane on the right of Claude Code with your project's artifacts and important links, so you never hunt for them in the chat history.

- Reads `dashboard/links.json` in the project you are working in and re-reads it every 30 seconds, so a link Claude adds shows up on its own.
- Each link is clickable; **copy** puts the URL on your clipboard.
- `/links` opens the pane and prints the list in the transcript.

## The links file

Put a `dashboard/links.json` in your project. Groups of items, each with a title, a URL and a short note:

```json
{
  "groups": [
    { "title": "Hub", "items": [
      { "title": "Command Center", "url": "https://claude.ai/artifact/...", "note": "private; today, to-do, calendar" }
    ]},
    { "title": "Repo", "items": [
      { "title": "GitHub", "url": "https://github.com/you/your-repo", "note": "private, branch main" }
    ]}
  ]
}
```

A project without the file shows "Could not read dashboard/links.json" and nothing else; add the file and the pane fills within half a minute.

## Install

```
/plugin install project-links --marketplace RenegadeRocks/claude-mods
```

Press `y` to add the marketplace the first time and pick the **user** scope. The pane opens at the start of every session on a wide enough terminal; `/links` opens it anywhere.
