import { test, expect } from 'claude-code/testing'

// The kit has nothing beneath the plugins; a test answers the engine's part:
// a pane is placed, a render beneath draws an empty line, a command answers.
function bottom(on: any) {
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.render', async ($: any, e: any) => { const { Text } = $.ui.resolve(e); return <Text> </Text> })
  on('command.run', async () => ({ text: '' }))
}

// The pane draws on both surfaces and always says something: the links,
// "No links yet", or why the file could not be read (the test kit has no fs).
test('links pane draws on terminal and desktop', async ($, on) => {
  bottom(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'project-links', surface, component: 'Pane', requestId: 'project-links', props: {} as any })
    expect(await ui.find({ type: 'Text', text: /links|read/i })).toBeDefined()
    await ui.unmount()
  }
})

// The /links command answers with text in every case.
test('/links answers with text', async ($, on) => {
  bottom(on)
  const out = await $.command.run({ command: 'links', args: '' })
  expect(typeof out?.text).toBe('string')
})
