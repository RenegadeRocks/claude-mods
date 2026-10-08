# context-bar

A Claude Code mod that puts a card above your prompt.

**On the left:** your session length, the weather, the model and its effort, what Claude is doing (thinking or working), and Rocky. Rocky is a cat or a dog who grows as your context fills up, naps when you're idle, types on a laptop while tools run, and reacts when you click him.

**On the right:** how full the context window is and what fills it, your 5-hour and weekly limits, how much the prompt cache saved you, what the session would cost at API prices, any subagents at work, and a fresh quote with every prompt.

**Limit Coach:** watches how fast your 5-hour window fills. If you'll run out before it resets, the 5H row says when ("⚠ full in ~25m") and a note at 80% and 95% suggests a lower `/effort` or a lighter model. When a full window resets, a **Continue** button on the card picks the work back up.

**Buttons:** one click sends a prompt you'd otherwise type: **Recap** (what are we doing, what's done, what's next), **Update memory**, **Keep going**, and **Team update** (a short status to paste to your team). **Compact** appears once the context passes 60% and runs `/compact`.

**Why is the pet peach or pink?** Its colour follows how full the context is: peach from 65%, pink from 85%. Click it then and it tells you ("I'm 88% full!", "Compact helps"); hover shows the share.

**Click to change model and effort:** click a cell of the effort meter under the weather to set that effort. Click the model name for a picker (Sonnet · Opus · Fable · Haiku).

**Newest output:** the newest image or video saved under your project this session, with **Open** and **Folder** buttons.

**Render watch:** while the GPU works (NVIDIA cards), a line shows its load, memory and how long it has been busy. When a job of a minute or more finishes, you get a note and the pet celebrates.

**Wellness nudges:** after 20 minutes of active work the pet closes its eyes and asks you to rest yours; after 60 it asks for a water break. Click the pet when you've done it. The pet chimes when a nudge or a finished GPU job needs you, and again every 5 minutes until you click; after a GPU job it keeps celebrating until then. `/context-bar sounds off` keeps it quiet. Time away counts as a break, so sessions that run for days don't matter. Change the minutes in `/plugin configure`, or turn them off with `/context-bar nudges off`.

**The desk** (wide windows, about 165 columns and up): a cozy night desk drawn in pixels beside the numbers, with a moonlit window, a wall clock showing the real time, books, a plant, a steaming mug and a lamp. Click the lamp to switch it off and on.

- **Notebook:** click the paper strip and type this project's goal; it's there again next time you open the project.
- **Focus timer:** click "start a 25-min focus" for a Pomodoro: 25 minutes of focus, a bell, then a 5-minute break. The dots count your rounds.
- **Ambient sound:** click the sound on the right to step through rain, fireplace, deep focus and off. Rain falls on the window and the lamp flickers by the fire. Your choice carries over to the next session.

## Install

In Claude Code, type:

```
/plugin install context-bar --marketplace RenegadeRocks/claude-mods
```

Press `y` to add the marketplace, then pick the **user** scope so it shows in every session. It works right away.

## Commands

| Command | What it does |
|---|---|
| `/context-bar off` | Hides the card in every session until you turn it back on |
| `/context-bar on` | Shows it again |
| `/context-bar pet dog` | Rocky becomes a dog (remembered) |
| `/context-bar pet cat` | Rocky becomes a cat (remembered) |
| `/context-bar sounds off` | The pet stops chiming (remembered); `sounds on` brings it back |
| `/context-bar nudges off` | No more eye and water nudges (remembered); `nudges on` brings them back |

## Settings

Run `/plugin configure context-bar@renegaderocks` to change these:

- **Weather city:** Ludhiana by default. Leave it empty to use your approximate location from your IP address.
- **Temperature unit:** Celsius or Fahrenheit.
- **Pet:** cat or dog.
- **Rest-your-eyes reminder** and **Water reminder:** minutes of active work between nudges; 0 turns one off.

## Good to know

- The weather comes from [Open-Meteo](https://open-meteo.com), refreshed every 15 minutes.
- The API cost is what this session would cost at Anthropic's published API rates. It comes from Claude Code's own `/cost` total, split into input, output and cache.
- Below about 48 columns the card drops the left side and keeps the numbers.

Made by RenegadeRocks with Claude Code.
