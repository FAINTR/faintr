// Engine code runs in the worker's global scope on the website (see enginehost.js)
module.exports = { createContext: (o) => o, runInContext: (code) => (0, eval)(code) };
