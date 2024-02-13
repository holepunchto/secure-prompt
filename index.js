const net = require('net')
const { TTY } = process.binding('tty_wrap')
const sodium = require('sodium-native')

let doPrompt = null

module.exports = function prompt () {
  if (doPrompt === null) doPrompt = init()
  return doPrompt()
}

function init () {
  const fd = 0
  const ctx = {}
  const tty = new TTY(fd, ctx)
  const tmp = sodium.sodium_malloc(4096)

  let end = 0
  let nextResolve = null
  let nextReject = null
  let userBuffer = null

  sodium.sodium_mprotect_noaccess(tmp)

  const sock = new net.Socket({
    handle: tty,
    manualStart: true,
    onread: {
      buffer: tmp,
      callback (nread, buf) {
        sodium.sodium_mprotect_readwrite(userBuffer)
        let eof = false
        let eol = false

        for (let i = 0; i < nread; i++) {
          const b = buf[i]
          if (b === 127) {
            end = Math.max(0, end - 1)
            continue
          }

          if (b >= 32) {
            userBuffer[end++] = b
            continue
          }

          eol = (b === 13 || b === 10)
          eof = true
          break
        }

        sodium.sodium_mprotect_noaccess(userBuffer)
        sodium.sodium_memzero(buf.subarray(0, nread))

        if (eof) done(eol)
        return !eof
      }
    }
  })

  sock.pause()
  return doPrompt

  function doPrompt () {
    userBuffer = sodium.sodium_malloc(4096)
    sodium.sodium_mprotect_readwrite(tmp)
    tty.setRawMode(true)
    sock.resume()
    return new Promise((resolve, reject) => {
      end = 0
      nextResolve = resolve
      nextReject = reject
    })
  }

  function done (success) {
    sodium.sodium_mprotect_noaccess(tmp)

    if (!success) sodium.sodium_free(userBuffer)
    else sodium.sodium_mprotect_noaccess(userBuffer)

    const result = success ? userBuffer.subarray(0, end) : null
    end = 0
    userBuffer = null

    tty.setRawMode(false)
    sock.pause()

    if (result) nextResolve(result)
    else nextReject(new Error('Prompt cancelled'))

    nextResolve = null
    nextReject = null

    return false
  }
}
