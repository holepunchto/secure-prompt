// just for testing

import prompt from './index.js'
import sodium from 'sodium-native'

console.log('Prompting:')

const buffer = await prompt()
sodium.sodium_mprotect_readonly(buffer)
console.log(buffer)

console.log('Prompting again:')

const buffer2 = await prompt()
sodium.sodium_mprotect_readonly(buffer2)
console.log(buffer2)
