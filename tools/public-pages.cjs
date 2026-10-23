const fs=require('node:fs'),path=require('node:path');
const PAGES={
  '':'Free Pokémon GO PvP team tools: team builder, grader, battle simulator, roster and IV rankings.',
  supporters:'Help keep FAINTR free and meet the community supporting its Pokémon GO PvP tools.',
  privacy:'How FAINTR handles accounts, saved Pokémon, public team links and privacy choices.',
  terms:'Terms for using FAINTR’s free Pokémon GO PvP tools.',
  sources:'Where FAINTR’s battle simulation, game data and rankings come from.',
  licenses:'Software and font license notices for FAINTR.'
};
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
function publishPublicPages(root,options={}) {
  for(const [slug,description] of Object.entries(PAGES)) {
    const file=path.join(root,slug,'index.html');let html=fs.readFileSync(file,'utf8');
    const url='https://faintr.com/'+(slug?slug+'/':'');
    const title=html.match(/<title>(.*?)<\/title>/s)?.[1]||'FAINTR';let tags='';
    if(!html.includes('rel="canonical"'))tags+=`<link rel="canonical" href="${url}">`;
    if(!/<meta name="description"/.test(html))tags+=`<meta name="description" content="${esc(description)}">`;
    if(!html.includes('property="og:title"'))tags+=`<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:image" content="https://faintr.com/static/faintr-preview.png"><meta name="twitter:card" content="summary_large_image">`;
    if(!html.includes('property="og:url"'))tags+=`<meta property="og:url" content="${url}">`;
    if(slug&&options.analytics){tags+=`<script src="/static/config.js?v=${options.version}"></script><script defer src="/static/analytics.js?v=${options.version}"></script>`;html=html.replace('<body>',`<body data-analytics-page="${slug}">`);}
    fs.writeFileSync(file,html.replace('</head>',tags+'</head>'));
  }
  const urls=Object.keys(PAGES).map(slug=>'https://faintr.com/'+(slug?slug+'/':''));
  fs.writeFileSync(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${url}</loc></url>`).join('')+'</urlset>');
  fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://faintr.com/sitemap.xml\n');
  fs.writeFileSync(path.join(root,'404.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found — FAINTR</title><link rel="stylesheet" href="/static/app.css"></head><body><main><section class="panel" style="padding:24px"><h1>This page could not be found</h1><p>The address may be incomplete or the page may have moved.</p><a class="btn primary" href="/">Back to FAINTR</a></section></main></body></html>');
}
module.exports={publishPublicPages,PAGES};
