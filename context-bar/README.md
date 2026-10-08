# context-bar

A Claude Code mod that puts a card above your prompt.

**On the left:** your session length, the weather, the model and its effort, what Claude is doing (thinking or working), and Rocky. Rocky is a cat or a dog who grows as your context fills up, naps when you're idle, types on a laptop while tools run, and reacts when you click him.

**On the right:** how full the context window is and what fills it, your 5-hour and weekly limits, how much the prompt cache saved you, what the session would cost at API prices, any subagents at work, and a fresh quote with every prompt.

**Limit Coach:** watches how fast your 5-hour window fills. If you'll run out before it resets, the 5H row says when ("⚠ full in ~25m") and a note at 80% and 95% suggests a lower `/effort` or a lighter model. When a full window resets, a **Continue** button on the card picks the work back up.

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

## Settings

Run `/plugin configure context-bar@renegaderocks` to change these:

- **Weather city:** Ludhiana by default. Leave it empty to use your approximate location from your IP address.
- **Temperature unit:** Celsius or Fahrenheit.
- **Pet:** cat or dog.

## Good to know

- The weather comes from [Open-Meteo](https://open-meteo.com), refreshed every 15 minutes.
- The API cost is what this session would cost at Anthropic's published API rates. It comes from Claude Code's own `/cost` total, split into input, output and cache.
- Below about 48 columns the card drops the left side and keeps the numbers.

Made by RenegadeRocks with Claude Code.
