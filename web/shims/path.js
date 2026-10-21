const join = (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/');
module.exports = { join, resolve: join, sep: '/', dirname: (p) => String(p).replace(/\/[^/]*$/, '') || '/', basename: (p) => String(p).split('/').pop(), extname: (p) => (/\.[^./]*$/.exec(p) || [''])[0] };
