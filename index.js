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
  let ended = false
  let esc = 0 // 1 after ESC, 2 inside CSI (ESC [), 3 inside SS3 (ESC O)
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
        let eof = !useRaw
        let eol = !useRaw
        let overflow = false

        sodium.sodium_mprotect_readwrite(userBuffer)
        try {
          for (let i = 0; i < nread; i++) {
            const b = buf[i]

            if (esc === 1) {
              esc = b === 0x5b ? 2 : b === 0x4f ? 3 : 0
              continue
            }

            if (esc === 2) {
              if (b >= 0x40 && b <= 0x7e) esc = 0
              continue
            }

            if (esc === 3) {
              esc = 0
              continue
            }

            if (b === 27) {
              esc = 1
              continue
            }

            if (b === 127 || b === 8) {
              // drop a whole utf-8 char: continuation bytes, then the lead byte
              while (end > 0) {
                if ((userBuffer[--end] & 0xc0) !== 0x80) break
              }
              continue
            }

            if (b >= 32) {
              if (end === userBuffer.byteLength) {
                overflow = true
                eof = true
                break
              }
              userBuffer[end++] = b
              continue
            }

            if (b === 13 || b === 10 || b === 3 || b === 4) {
              eol = (b === 13 || b === 10)
              eof = true
              break
            }
          }

          // a lone ESC keypress arrives in a read of its own
          if (esc === 1) esc = 0
        } finally {
          sodium.sodium_mprotect_noaccess(userBuffer)
          sodium.sodium_memzero(buf.subarray(0, nread))
        }

        if (overflow) done(false, new Error('Input too long'))
        else if (eof) done(eol)
        return !eof
      }
    }
  })

  sock.on('end', function () {
    ended = true
    if (userBuffer) done(false, new Error('Unexpected end of input'))
  })

  sock.pause()
  return doPrompt

  function doPrompt () {
    if (userBuffer) throw new Error('Only one prompt can be active')
    if (ended) return Promise.reject(new Error('Unexpected end of input'))

    return new Promise((resolve, reject) => {
      nextResolve = resolve
      nextReject = reject
      userBuffer = sodium.sodium_malloc(4096)
      end = 0
      esc = 0
      sodium.sodium_mprotect_readwrite(tmp)
      if (useRaw) tty.setRawMode(true)
      sock.resume()
    })
  }

  function done (success, err = null) {
    sodium.sodium_mprotect_noaccess(tmp)

    let result = null
    let error = err

    sodium.sodium_mprotect_readwrite(userBuffer)
    try {
      if (success) {
        if (end === 0) throw new Error('No input')
        result = sodium.sodium_malloc(end)
        result.set(userBuffer.subarray(0, end))
        sodium.sodium_mprotect_noaccess(result)
      }
    } catch (err) {
      if (result !== null) sodium.sodium_free(result)
      error = err
      result = null
    } finally {
      sodium.sodium_free(userBuffer)
      end = 0
      userBuffer = null
    }

    sock.pause()
    if (useRaw) tty.setRawMode(false)

    if (result) nextResolve(result)
    else nextReject(error || new Error('Prompt cancelled'))

    nextResolve = null
    nextReject = null

    return false
  }
}
