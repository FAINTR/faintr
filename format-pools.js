// Candidate indices are stored as bytes. 250 stays within the existing format.
function rankedPoolSize(key){return key==='all-1500'?250:150;}
module.exports={rankedPoolSize};
