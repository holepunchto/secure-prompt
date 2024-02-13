# secure-prompt

Securely prompt stdio using secure buffers

```
npm install secure-prompt
```

## Usage

``` js
const prompt = require('secure-prompt')
const buffer = await prompt() // user input in buffer

console.log(buffer) // will crash
sodium.sodium_mprotect_readonly(buffer)
console.log(buffer) // prints the buffer
```

## License

Apache-2.0
