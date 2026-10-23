const {periodAt}=require('../formats');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Reserve the actual current control layout before the game engine downloads.
// Controls stay disabled until app.js has the data needed to handle selections.
function initialControls(html,schedule,formats){
 const live=periodAt(schedule,formats).now?.formats||[{label:'Great'},{label:'Ultra'},{label:'Master'}];
 return html.replace(/(<span[^>]*id="leagueSeg"[^>]*>)[\s\S]*?<\/span>/,'$1'+live.map(f=>`<button type="button" disabled>${esc(f.label)}</button>`).join('')+'</span>')
  .replace(/(<select id="cupSel"[^>]*)(>)[\s\S]*?<\/select>/,'$1 disabled$2<option>More leagues and cups ('+(formats.length-live.length)+')</option></select>')
  .replace(/(<span[^>]*id="fmtLabel"[^>]*>).*?<\/span>/,'$1'+(periodAt(schedule,formats).now?'Live now':'League')+'</span>');
}
module.exports={initialControls};
