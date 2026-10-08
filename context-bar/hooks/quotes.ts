// A fresh one shows with every prompt.
export const QUOTES = [
  'Today is a great day to build something remarkable.',
  "You're one focused hour away from a breakthrough.",
  'Small steps, big momentum. Keep shipping!',
  'Done is powerful. Ship it, then make it better.',
  'Energy flows where focus goes. Lock in!',
  'Every line you write is a step toward the thing you imagined.',
  "You've solved harder problems than this one. Go get it!",
  'Progress, not perfection. Keep the streak alive.',
  "Be the builder you'd be proud to meet.",
  'The best time to start was yesterday. The second best is right now!',
  'Hard things become easy once you begin.',
  'Make it work, make it right, make it fast. In that order.',
  'Your future self is cheering for what you do right now.',
  'Focus is a superpower. Use it well!',
  "One more commit. One more win. Let's go!",
  'Great things are built one stubborn hour at a time.',
  'Curiosity is your edge. Ask the bold question.',
  "You don't need more time, just more momentum.",
  'Turn the idea into something real. Right now.',
  'Discipline today, freedom tomorrow. Keep pushing!',
  'Bugs are just puzzles in disguise. You love puzzles!',
  'Build boldly. Learn loudly. Repeat.',
  "The work you do when it's hard is the work that counts.",
  'Dream big, ship small, iterate fast.',
  "You are closer than you think. Don't stop now!",
  "Make today's version better than yesterday's. That's the whole game.",
  'Win the hour. The day takes care of itself.',
  "Believe in the next step. It's always enough.",
  'Create something that makes you proud. Then do it again!',
  'Fuel up on focus. The finish line is closer than it looks.',
]

/** Any quote but the one showing. */
export function nextQuote(shown: string): string {
  let next = shown
  while (next === shown) next = QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? ''
  return next
}
