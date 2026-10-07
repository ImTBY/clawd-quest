import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

// A project folder made of `files` (path -> text) for $.fs; every read is logged in `reads`.
// The engine hands the hooks absolute paths under its own folder: the first known path tells the root.
export function fakeFs(on: On, files: Record<string, string>, reads: string[] = []): void {
  const isDir = (p: string) => p === '' || Object.keys(files).some(f => f.startsWith(p + '/'))
  let root: string | undefined
  const norm = (p?: string) => {
    const s = (p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\.\/?/, '')
    // Absolute: a POSIX path or a Windows drive path (the Windows engine passes `C:\...`).
    if (!s.startsWith('/') && !/^[A-Za-z]:(\/|$)/.test(s)) return s
    if (root !== undefined) return s === root ? '' : s.startsWith(root + '/') ? s.slice(root.length + 1) : '\0'
    // parts[0] is '' for '/a/b' and 'C:' for 'C:/a/b'; either way the root search starts at index 1.
    const parts = s.split('/')
    for (let i = 1; i < parts.length; i++) {
      const r = parts.slice(i).join('/')
      if (r in files || isDir(r)) {
        root = parts.slice(0, i).join('/')
        return r
      }
    }
    root = s
    return ''
  }
  on('fs.list', (_$, e) => {
    const dir = norm(e.path)
    const names = [...new Set(Object.keys(files).filter(f => dir === '' || f.startsWith(dir + '/')).map(f => (dir ? f.slice(dir.length + 1) : f).split('/')[0]!))]
    return { value: names.map(name => {
      const full = dir ? `${dir}/${name}` : name
      return { name, kind: full in files ? 'file' : 'dir', size: files[full]?.length ?? 0, mtimeMs: 0, isLink: false }
    }) } as never
  })
  on('fs.exists', (_$, e) => ({ value: norm(e.path) in files || isDir(norm(e.path)) }) as never)
  on('fs.stat', (_$, e) => (norm(e.path) in files ? { value: { kind: 'file', size: files[norm(e.path)]!.length, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }) as never)
  on('fs.read', (_$, e) => {
    reads.push(norm(e.path))
    return (norm(e.path) in files ? { value: files[norm(e.path)] } : { deny: 'ENOENT' }) as never
  })
}
