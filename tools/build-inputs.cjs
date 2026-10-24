// Every calculation source must participate in precomputed-data invalidation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ENGINE_FILES}=require('../engine'),{rankingFile}=require('../formats');
function inputFiles(F){
 const cup=F.filesCup||F.cup;
 return [...ENGINE_FILES,'data/gamemaster.json',...['overall','leads','closers','switches'].map(category=>rankingFile(cup,category,F.cp)),`data/groups/${F.meta}.json`];
}
function inputHash(src,F,codeHash,read=fs.readFileSync){
 const hash=crypto.createHash('sha256').update(codeHash).update(F.key);
 for(const file of inputFiles(F)){
  hash.update('\0'+file+'\0');
  try{hash.update(read(path.join(src,file)));}catch(_){hash.update('missing');}
 }
 return hash.digest('hex');
}
module.exports={inputFiles,inputHash};
