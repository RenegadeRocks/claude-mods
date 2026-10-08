# soundtrack

Soft sounds for what Claude Code is doing:

- **Start:** two notes rising, when Claude starts on your prompt.
- **Tool:** a quiet tick while tools run, at most one every 3 seconds.
- **Done:** a bell-like chime when the turn finishes.
- **Oops:** two low notes when a turn is interrupted or fails.

A subagent's work stays silent, so a busy session doesn't turn into noise.

## Commands

| Command | What it does |
|---|---|
| `/soundtrack test` | Plays all four sounds |
| `/soundtrack off` | Silence, in every session until you turn it back on |
| `/soundtrack on` | Sounds back on |

Run `/plugin configure soundtrack@renegaderocks` to turn the tool ticks off and keep the rest.

## Good to know

Claude Code's own sound player only works on macOS, so on Windows the mod plays each sound through PowerShell. Linux plays nothing yet.
