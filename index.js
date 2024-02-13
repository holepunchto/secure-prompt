const net = require('net')
const { TTY, isTTY } = process.binding('tty_wrap')
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
  const useRaw = isTTY(fd)

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

        let eof = !useRaw
        let eol = !useRaw

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
    if (userBuffer) throw new Error('Only one prompt can be active')

    return new Promise((resolve, reject) => {
      nextResolve = resolve
      nextReject = reject
      userBuffer = sodium.sodium_malloc(4096)
      end = 0
      sodium.sodium_mprotect_readwrite(tmp)
      if (useRaw) tty.setRawMode(true)
      sock.resume()
    })
  }

  function done (success) {
    sodium.sodium_mprotect_noaccess(tmp)

    if (!success) {
      sodium.sodium_mprotect_readwrite(userBuffer)
      sodium.sodium_free(userBuffer)
    }

    const result = success ? userBuffer.subarray(0, end) : null

    end = 0
    userBuffer = null

    sock.pause()
    if (useRaw) tty.setRawMode(false)

    if (result) {
      sodium.sodium_mprotect_noaccess(result)
      nextResolve(result)
    } else {
      nextReject(new Error('Prompt cancelled'))
    }

    nextResolve = null
    nextReject = null

    return false
  }
}
