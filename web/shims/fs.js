// The website has no file system: data comes from manifest.json files instead.
const no = () => { throw new Error('No file system on the website'); };
module.exports = { readFileSync: no, writeFileSync: no, existsSync: () => false, mkdirSync: no, readdirSync: () => [], statSync: no, rmSync: no, renameSync: no };
