import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LinkGroup } from '../types'

// A pane on the right listing the project's artifacts and important links.
// Source of truth: dashboard/links.json in the repo (Claude updates it when an
// artifact is created). The pane re-reads the file every 30 seconds.

const PANE = 'project-links'
const FILE = 'dashboard/links.json'

const groups = atom({ plugin: 'project-links', key: 'groups' } as const, [] as LinkGroup[])
const loadedAt = atom({ plugin: 'project-links', key: 'loadedAt' } as const, '')
const error = atom({ plugin: 'project-links', key: 'error' } as const, '')
const raw = atom({ plugin: 'project-links', key: 'raw' } as const, '')

// The file is read relative to the working directory; when a command has moved the shell into a
// sub-folder, walk up to four levels to find the project's own links file.
async function readLinks($: any): Promise<string> {
  let lastErr: any = null
  for (const prefix of ['', '../', '../../', '../../../', '../../../../']) {
    try { return await $.fs.read(prefix + FILE) } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function load($: any) {
  try {
    const text: string = await readLinks($)
    const before = await read($, raw)
    if (text === before) return
    const parsed = JSON.parse(text) as { groups?: LinkGroup[] }
    await update($, groups, () => Array.isArray(parsed.groups) ? parsed.groups : [])
    await update($, raw, () => text)
    await update($, loadedAt, () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    await update($, error, () => '')
  } catch (e: any) {
    await update($, error, () => 'Could not read ' + FILE + ': ' + (e && e.message ? e.message : String(e)))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'links', description: 'Open the project links pane and list the links' })
    await load($)
    void $.ui.open({ id: PANE, title: 'Links' })
    $.clock.every(30000, () => { void load($) })
    return next(e)
  })

  on('command.run', { command: 'links' }, async $ => {
    await load($)
    await $.ui.open({ id: PANE, title: 'Links' })
    const list = await read($, groups)
    const lines: string[] = []
    for (const g of list) {
      lines.push(g.title)
      for (const it of g.items) lines.push('  ' + it.title + ': ' + it.url)
    }
    return { text: lines.length ? lines.join('\n') : 'No links yet; dashboard/links.json is empty.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const list = await read($, groups)
    const when = await read($, loadedAt)
    const err = await read($, error)
    const wide = (e.viewport?.columns ?? 40) >= 60

    return (
      <Box flexDirection="column">
        {err !== '' && <Text color="red">{err}</Text>}
        {list.length === 0 && err === '' && <Text dimColor>No links yet.</Text>}
        {list.map(g => (
          <Box key={g.title} flexDirection="column" marginBottom={1}>
            <Text bold>{g.title}</Text>
            {g.items.map(it => (
              <Box key={it.url} flexDirection="column">
                <Box flexDirection="row">
                  <Link href={it.url} label={it.title} />
                  <Text> </Text>
                  <Button onPress={press => { void $.ui.copy({ text: it.url, surface: press.surface }); $.ui.toast('Copied: ' + it.title) }}>copy</Button>
                </Box>
                {wide && it.note ? <Text dimColor>  {it.note}</Text> : null}
              </Box>
            ))}
          </Box>
        ))}
        <Text dimColor>{when ? 'from dashboard/links.json · ' + when : ''} · /links to print</Text>
      </Box>
    )
  })
}
