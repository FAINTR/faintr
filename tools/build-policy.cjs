const STANDARD=['all-1500','all-2500','all-10000'];
function wantedFormat(key,live,only,fetch){return only.length?only.includes(key):!fetch||new Set([...STANDARD,...live]).has(key);}
function verifiedSeed(record,hash){return !!record&&record.hash===hash;}
function publishable({hasData,hash,record,state,preview}){return hasData&&(preview||['built','seeded'].includes(state)||record?.hash===hash);}
module.exports={wantedFormat,verifiedSeed,publishable};
