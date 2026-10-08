# project-colors

Each project folder keeps its own prompt-bar colour and a session name, so you can tell your Claude Code windows apart at a glance.

- **A new project** gets a colour picked from its folder name, the same one every time.
- **A new session** is named after the project, using the name you gave it before or else the folder's. A resumed or already-named session keeps its name.
- **Your own choices win.** Type `/color pink` or `/rename Fairy mocap` and that project remembers it from then on.

## Commands

| Command | What it does |
|---|---|
| `/project-colors` | Shows this project's colour and name |
| `/project-colors reset` | Forgets them; the next session picks fresh ones |
| `/project-colors off` | Stops colouring and naming, in every session until you turn it back on; the bar goes back to the default colour |
| `/project-colors on` | Turns it back on, with your saved colours and names |

Each session starts with a short "Session color set to: …" line. That's this mod at work.
