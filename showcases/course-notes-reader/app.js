import {FOLDER,SCOPE,DriveSource,LocalSource,folderId,normalizePath,readableName,isMarkdown,renderMarkdown} from './core.js';
const $=id=>document.getElementById(id), defaults=window.COURSE_SPACE_CONFIG||{};
let savedConfig={};try{savedConfig=JSON.parse(localStorage.getItem('course-space-config')||'{}');}catch{}
const config={...defaults,...savedConfig};
let source,token='',expires=0,tokenClient,current=null,courseId='',view=0,generation=0,polling=false;
let expanded=new Set(),objectUrls=[];
const sessionHash=()=>new URLSearchParams(location.hash.slice(1));
function notice(message,error=false) { $('status').hidden=!message;$('status').textContent=message;$('status').classList.toggle('error',error); }
function connection(label,live=false) {$('connection').textContent=label;$('connection').classList.toggle('live',live);}
function errorMessage(error){notice(error.message||String(error),true);}
function releaseUrls(){for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[];}
function configured() {
 const client=$('clientId').value.trim();if(client&&!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client))throw new Error('Client ID 应以 apps.googleusercontent.com 结尾。');
 return {clientId:client,rootFolderId:folderId($('folderId').value)};
}
function settings(help=false){$('clientId').value=config.clientId||'';$('folderId').value=config.rootFolderId||'';$('origin').textContent=location.origin;$('instructions').open=help;$('dialog').showModal();}
function save(){Object.assign(config,configured());localStorage.setItem('course-space-config',JSON.stringify(config));}
function disconnect(){view++;generation++;token='';expires=0;source=null;current=null;releaseUrls();$('document').replaceChildren();$('document').hidden=true;$('welcome').hidden=false;$('docFooter').hidden=true;$('logout').hidden=true;$('tree').replaceChildren();$('course').replaceChildren(new Option('连接后选择课程',''));$('toc').innerHTML='<span class="eyebrow">ON THIS PAGE</span><p class="muted">打开笔记后显示页内目录。</p>';connection('已断开');notice('已清除当前页面中的笔记与登录令牌。');}
async function connect() {
 if(!config.clientId){settings(true);return;}
 if(!window.google?.accounts?.oauth2){notice('Google 登录组件尚未载入，请稍后重试；如果被网络阻止，可使用本地文件阅读。',true);return;}
 tokenClient=google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:SCOPE,include_granted_scopes:false,
 callback:async response=>{
  if(response.error){notice('Google 授权失败：'+response.error,true);return;}
  if(!google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){notice('没有获得 Drive 只读权限，无法读取笔记。',true);return;}
  token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000;
  source=new DriveSource(()=>Date.now()<expires?token:'',folderId(config.rootFolderId));expanded=new Set();current=null;view++;generation++;releaseUrls();$('document').replaceChildren();$('document').hidden=true;$('docFooter').hidden=true;$('welcome').hidden=false;$('logout').hidden=false;
  connection('Google Drive · 已连接',true);try{await spaces();notice('已连接。选择左侧笔记开始阅读。');}catch(e){errorMessage(e);}
 },error_callback:e=>notice(e.type==='popup_closed'?'登录窗口已关闭。':'无法打开登录窗口，请允许此网站弹出登录窗口。',true)});
 tokenClient.requestAccessToken({prompt:'select_account'});
}
async function spaces() {
 const root=source instanceof LocalSource?{id:source.root,name:source.rootName}:await source.metadata(source.root);
 const children=await source.list(source.root,[],true);const folders=children.filter(f=>f.mimeType===FOLDER);
 const isCourse=/^MPHY|^COMP|^Course/i.test(root.name)||folders.some(f=>/^\d\d_/.test(f.name));
 const options=isCourse||!folders.length?[{...root,path:[]}]:folders;
 $('course').replaceChildren(...options.map(f=>new Option(readableName(f.name),f.id)));
 const desired=sessionHash().get('course');courseId=options.some(f=>f.id===desired)?desired:options[0]?.id;
 if(!courseId){notice('这个文件夹为空。请上传课程笔记或检查根文件夹配置。',true);return;}
 $('course').value=courseId;await navigation();
 const file=sessionHash().get('file');if(file){try{await openFile(await source.resolveId(file));}catch(e){errorMessage(e);}}
}
async function navigation() {
 const seq=++generation;const selected=source.meta.get(courseId),path=courseId===source.root?[]:selected?.path||[];
 const files=await source.list(courseId,path,true);if(seq!==generation)return;
 $('tree').replaceChildren();for(const f of files)$('tree').append(entry(f,seq));
 $('breadcrumb').textContent=$('course').selectedOptions[0]?.textContent||'课程空间';
}
function entry(file,seq) {
 if(file.mimeType===FOLDER){
  const details=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');children.className='children';summary.textContent=readableName(file.name);details.append(summary,children);
  let loaded=false;details.addEventListener('toggle',async()=>{
   if(details.open){expanded.add(file.id);if(!loaded){children.textContent='读取中…';try{const items=await source.list(file.id,file.path,true);if(seq!==generation)return;children.replaceChildren(...items.map(f=>entry(f,seq)));loaded=true;if(!items.length)children.textContent='暂无文件';applySearch();}catch(e){children.textContent=e.message;}}}else expanded.delete(file.id);
  });if(expanded.has(file.id))details.open=true;return details;
 }
 const b=document.createElement('button');b.className='tree-file';b.dataset.id=file.id;b.dataset.name=file.name;
 const tag=document.createElement('span');tag.className='file-tag';tag.textContent=isMarkdown(file)?'MD':file.mimeType.startsWith('image/')?'IMG':file.name.split('.').pop().toUpperCase();
 b.append(tag,document.createTextNode(readableName(file.name)));b.title=file.name;b.classList.toggle('active',current?.file.id===file.id);b.onclick=()=>openFile(file).catch(errorMessage);return b;
}
function applySearch(){const q=$('search').value.trim().toLowerCase();for(const b of $('tree').querySelectorAll('.tree-file'))b.hidden=q&&!b.dataset.name.toLowerCase().includes(q);for(const d of [...$('tree').querySelectorAll('details')].reverse())d.hidden=!!q&&!d.querySelector('summary').textContent.toLowerCase().includes(q)&&!d.querySelector('.tree-file:not([hidden]),details:not([hidden])');}
async function fullSearch(){
 if(!source)return;const q=$('search').value.trim().toLowerCase();if(!q){await navigation();return;}
 const seq=++generation,found=[];notice('正在搜索当前课程的文件名…');
 const selected=source.meta.get(courseId);const queue=[{id:courseId,path:courseId===source.root?[]:selected?.path||[]}];
 while(queue.length){if(seq!==generation)return;const f=queue.shift();for(const item of await source.list(f.id,f.path)){if(item.mimeType===FOLDER)queue.push(item);else if(item.name.toLowerCase().includes(q)||item.path.join('/').toLowerCase().includes(q))found.push(item);}}
 if(seq!==generation)return;$('tree').replaceChildren(...found.map(f=>entry(f,seq)));notice(found.length?'找到 '+found.length+' 个文件。':'没有找到匹配的文件。');
}
function sectionToc() {
 $('toc').replaceChildren();const label=document.createElement('span');label.className='eyebrow';label.textContent='ON THIS PAGE';$('toc').append(label);
 let i=0;for(const h of $('document').querySelectorAll('h2,h3')){h.id='section-'+(++i);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;a.className='level'+h.tagName.slice(1);a.onclick=e=>{e.preventDefault();h.scrollIntoView({behavior:'smooth'});};$('toc').append(a);}
 if(!i){const p=document.createElement('p');p.className='muted';p.textContent='本文没有分节标题。';$('toc').append(p);}
}
async function linkTarget(href,file) {
 if(/^https?:/.test(href)){
  const url=new URL(href);if(!['drive.google.com','docs.google.com'].includes(url.hostname))return null;
  const match=url.pathname.match(/\/(?:d|folders)\/([\w-]+)/);return match?source.resolveId(match[1]):null;
 }
 return source.findPath(normalizePath(file.path.slice(0,-1),href));
}
async function showFolder(target) {
 const path=target.path||[];
 for(let i=1;i<=path.length;i++) {
  const ancestor=await source.findPath(path.slice(0,i));
  if([...$('course').options].some(option=>option.value===ancestor.id)){courseId=ancestor.id;$('course').value=courseId;}
  expanded.add(ancestor.id);
 }
 $('search').value='';await navigation();
 $('sidebar').classList.add('open');notice('已展开对应资料目录，请从左侧选择文件。');
}
async function decorate(file,seq) {
 for(const table of $('document').querySelectorAll('table')){const div=document.createElement('div');div.className='table-scroll';table.replaceWith(div);div.append(table);}
 for(const a of $('document').querySelectorAll('a[href]')){
  const href=a.getAttribute('href');if(href.startsWith('#'))continue;
  a.rel='noopener noreferrer';a.target='_blank';
  if(!/^https?:|^mailto:/.test(href)||/^https:\/\/(drive|docs)\.google\.com/.test(href))a.onclick=async e=>{
   e.preventDefault();try{const target=await linkTarget(href,file);if(target){if(target.mimeType===FOLDER)await showFolder(target);else await openFile(target);}}catch(err){notice(err.message+(href.startsWith('http')?' 可使用右键在新标签页打开原链接。':''),true);}
  };
 }
 for(const img of $('document').querySelectorAll('img')){
  const src=img.dataset.courseSrc;img.removeAttribute('data-course-src');img.loading='lazy';if(!src)continue;
  try{let target;if(/^https?:/.test(src)){const u=new URL(src);if(!['drive.google.com','docs.google.com'].includes(u.hostname)){img.removeAttribute('src');img.alt='外部图片：'+src;continue;}target=await linkTarget(src,file);}else target=await linkTarget(src,file);
   if(!target)continue;const url=URL.createObjectURL(await source.blob(target.id));if(seq!==view){URL.revokeObjectURL(url);return;}objectUrls.push(url);img.src=url;
  }catch(e){img.removeAttribute('src');img.alt='图片读取失败：'+e.message;}
 }
}
async function openFile(file,preserveScroll=false) {
 if(!file||!source)return;const seq=++view;const y=window.scrollY;notice('正在读取 '+file.name+'…');
 const meta=await source.metadata(file.id);file={...file,...meta};let text;
 if(isMarkdown(file)||file.mimeType==='text/plain')text=await source.text(file.id);
 if(seq!==view)return;releaseUrls();$('welcome').hidden=true;$('document').hidden=false;$('docFooter').hidden=false;$('document').replaceChildren();
 current={file,modified:file.modifiedTime};
 if(text!==undefined){
  if(!window.marked||!window.DOMPurify||!window.katex)throw new Error('排版组件加载失败，请检查网络后刷新。');
  const result=renderMarkdown(text,{marked,DOMPurify,katex});$('document').innerHTML=result.html;sectionToc();await decorate(file,seq);
  if(seq!==view)return;notice(result.errors.length?'发现 '+result.errors.length+' 处无法渲染的公式，已在正文中标出，请修正原笔记。':'',!!result.errors.length);
 } else {
  const h=document.createElement('h1');h.textContent=file.name;$('document').append(h);
  if(file.mimeType.startsWith('image/')){const img=document.createElement('img');const url=URL.createObjectURL(await source.blob(file.id));if(seq!==view){URL.revokeObjectURL(url);return;}objectUrls.push(url);img.src=url;img.alt=file.name;$('document').append(img);}
  else {const p=document.createElement('p');p.textContent='这是一份原始资料。点击下方按钮，在 Google Drive 查看 PDF 或课件。';$('document').append(p);}
  sectionToc();notice('');
 }
 $('breadcrumb').textContent=(file.path||[file.name]).map(readableName).join(' / ');
 $('docMeta').textContent='更新于 '+new Date(file.modifiedTime).toLocaleString('zh-CN')+' · '+(source instanceof LocalSource?'本地文件':'从 Google Drive 实时读取');
 $('original').hidden=source instanceof LocalSource;
 $('original').onclick=()=>file.webViewLink&&window.open(file.webViewLink,'_blank','noopener,noreferrer');
 for(const b of $('tree').querySelectorAll('.tree-file'))b.classList.toggle('active',b.dataset.id===file.id);
 if(source instanceof DriveSource)history.replaceState(null,'','#'+new URLSearchParams({course:courseId,file:file.id}));
 $('sidebar').classList.remove('open');if(preserveScroll)window.scrollTo(0,y);else window.scrollTo(0,0);
}
async function refresh(force=false){
 if(!source){if(force)settings();return;}if(polling)return;polling=true;
 try{if(source instanceof DriveSource){source.folders.clear();if(!$('search').value)await navigation();}else if(force)await navigation();if(current){const meta=await source.metadata(current.file.id);if(force||meta.modifiedTime!==current.modified)await openFile({...current.file,...meta},true);}if(force&&!current)notice('目录已刷新。');}
 catch(e){errorMessage(e);}finally{polling=false;}
}
$('settings').onclick=()=>settings();$('connect').onclick=connect;$('setupHelp').onclick=()=>settings(true);$('closeDialog').onclick=()=>$('dialog').close();
$('configForm').onsubmit=e=>{e.preventDefault();try{save();$('dialog').close();notice('配置已保存，点击连接我的 Google Drive 登录。');}catch(e){errorMessage(e);}};
$('saveConnect').onclick=()=>{try{save();$('dialog').close();connect();}catch(e){errorMessage(e);}};
$('logout').onclick=disconnect;$('refresh').onclick=()=>refresh(true);
$('course').onchange=async()=>{courseId=$('course').value;generation++;view++;current=null;releaseUrls();$('document').replaceChildren();$('document').hidden=true;$('docFooter').hidden=true;$('welcome').hidden=false;expanded=new Set();history.replaceState(null,'',location.pathname);$('search').value='';try{await navigation();const f=(await source.list(courseId,source.meta.get(courseId)?.path||[])).find(f=>f.name==='README.md');if(f)await openFile(f);}catch(e){errorMessage(e);}};
let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);applySearch();searchTimer=setTimeout(()=>fullSearch().catch(errorMessage),500);};
for(const id of ['local','localWelcome'])$(id).onclick=()=>$('folderUpload').click();
$('folderUpload').onchange=async e=>{if(!e.target.files.length)return;disconnect();history.replaceState(null,'',location.pathname);source=new LocalSource(e.target.files);connection('本地阅读',true);$('logout').hidden=false;try{await spaces();notice('已读取本地文件。修改后需重新选择文件夹。');}catch(e){errorMessage(e);}e.target.value='';};
$('openSidebar').onclick=()=>$('sidebar').classList.add('open');$('closeSidebar').onclick=()=>$('sidebar').classList.remove('open');
document.documentElement.dataset.theme=localStorage.getItem('course-space-theme')||'light';
$('theme').onclick=()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=value;localStorage.setItem('course-space-theme',value);};
let fontSize=Number(localStorage.getItem('course-space-font'))||17;
function font(delta){fontSize=Math.max(14,Math.min(24,fontSize+delta));document.documentElement.style.setProperty('--prose-size',fontSize+'px');localStorage.setItem('course-space-font',fontSize);}
font(0);$('fontDown').onclick=()=>font(-1);$('fontUp').onclick=()=>font(1);
setInterval(()=>{if(document.visibilityState==='visible'&&source instanceof DriveSource)refresh();},Math.max(30000,defaults.refreshIntervalMs||60000));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&source instanceof DriveSource)refresh(true);});
window.addEventListener('beforeunload',releaseUrls);
