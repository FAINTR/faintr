// The desktop server is loopback-only but browser pages can still send it requests.
function requestError(req){
 const host=req.headers.host||'';
 if(!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host))return {code:403,message:'Open FAINTR using its local address.'};
 const api=new URL(req.url,'http://localhost').pathname.startsWith('/api/');
 if(!api)return null;
 if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!=='http://'+host))return {code:403,message:'Open FAINTR directly to use its local tools.'};
 if(!['GET','POST'].includes(req.method))return {code:405,message:'Use GET or POST.'};
 if(req.method==='POST'&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return {code:415,message:'Send changes as JSON.'};
 return null;
}
module.exports={requestError};
