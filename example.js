// just for testing

const prompt = require('./')
const sodium = require('sodium-native')

prompt().then(buffer => {
  sodium.sodium_mprotect_readonly(buffer)
  console.log(buffer)
})
