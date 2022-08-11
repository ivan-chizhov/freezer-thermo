const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const rendererDir = 'renderer'
const distDir = 'dist'
const indexFile = 'index.html'

function copyIfDifferent(src, dest) {
  const srcStat = fs.statSync(src)

  try {
    const destStat = fs.statSync(dest)
    if (srcStat.size === destStat.size) {
      const srcBuffer = fs.readFileSync(src)
      const destBuffer = fs.readFileSync(dest)
      if (srcBuffer.equals(destBuffer)) {
        return
      }
    }
  } catch (_) {}

  fs.copyFileSync(src, dest)
}

console.log('Copying resources...')
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir)
}

copyIfDifferent(path.join(rendererDir, indexFile), path.join(distDir, indexFile))

console.log('Building main...')
esbuild.buildSync({
  entryPoints: ['main/index.js'],
  bundle: true,
  sourcemap: 'inline',
  platform: 'node',
  target: 'node16',
  external: ['electron', './node_modules/*'],
  outfile: path.join(distDir, 'main.js'),
  logLevel: 'info',
})

console.log()
console.log('Building renderer...')
esbuild.buildSync({
  entryPoints: ['renderer/index.js'],
  loader: { '.js': 'jsx' },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  external: ['electron'],
  outfile: path.join(distDir, 'renderer.js'),
  logLevel: 'info',
})
