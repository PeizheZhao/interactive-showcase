export const FOLDER = 'application/vnd.google-apps.folder';
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export function folderId(value) {
  const v = String(value || '').trim();
  const match = v.match(/\/folders\/([\w-]+)/);
  const id = match ? match[1] : v;
  if (!/^[\w-]{10,}$/.test(id)) throw new Error('请填写有效的 Google Drive 文件夹链接或 ID。');
  return id;
}
export function normalizePath(base, href) {
  const out = [...base];
  for (const part of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) throw new Error('链接超出了已连接的资料目录。'); out.pop(); }
    else out.push(part);
  }
  return out;
}
export const compareNames = (a,b) => a.name.localeCompare(b.name,'en',{numeric:true,sensitivity:'base'});
export const isMarkdown = f => /\.md$/i.test(f.name) || f.mimeType === 'text/markdown';
export function readableName(name) {
  if (name === 'README.md') return '章节导航';
  return name.replace(/\.md$/i,'').replace(/_/g,' ').replace(/^00 Course Source Materials$/,'原始课程资料').replace(/^00 Course Standard$/,'笔记整理规范');
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Protect math before Markdown table parsing, while leaving code spans/fences untouched.
export function prepareMath(source) {
  let prefix = 'COURSESPACEMATH';
  while (source.includes(prefix)) prefix += 'X';
  const math = [];
  const re = /(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*$)|(`+)[\s\S]*?\3|(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<![\\$])\$(?!\$)[^\n$]+?(?<!\\)\$(?!\$)|\\\([^\n]*?\\\))/gm;
  const text = source.replace(re,(match,fence,fenceMark,codeMark,formula)=>{
    if (!formula) return match;
    const display = formula.startsWith('$$') || formula.startsWith('\\[');
    const tex = formula.startsWith('$$') ? formula.slice(2,-2) : formula.startsWith('\\') ? formula.slice(2,-2) : formula.slice(1,-1);
    const key = prefix + math.length + 'END';
    math.push({key,tex,display});
    return display ? '\n\n'+key+'\n\n' : key;
  });
  return {text,math};
}
export function renderMarkdown(source, {marked,DOMPurify,katex}) {
  const prepared = prepareMath(source); const errors = [];
  const fragment = DOMPurify.sanitize(marked.parse(prepared.text,{gfm:true,breaks:false}),{RETURN_DOM_FRAGMENT:true,ADD_ATTR:['target'],FORBID_TAGS:['iframe','script','style','form','input','object','embed'],FORBID_ATTR:['style']});
  const doc=fragment.ownerDocument;
  const walker=doc.createTreeWalker(fragment,4);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for (const {key,tex,display} of prepared.math) {
    let rendered;
    try { rendered = katex.renderToString(tex,{displayMode:display,throwOnError:true,trust:false,strict:'warn',maxExpand:1000}); }
    catch(error) { errors.push({tex,message:error.message}); rendered = '<span class="math-error" title="公式解析失败">公式待修正：'+escapeHtml(tex)+'</span>'; }
    for(const node of nodes) {
      if(!node.parentNode||!node.textContent.includes(key))continue;
      const pieces=node.textContent.split(key),replacement=doc.createDocumentFragment();
      for(let i=0;i<pieces.length;i++) {
        if(pieces[i])replacement.append(doc.createTextNode(pieces[i]));
        if(i<pieces.length-1){const wrapper=doc.createElement(display?'div':'span');if(display)wrapper.className='math-block';wrapper.innerHTML=rendered;replacement.append(wrapper);}
      }
      if(display&&node.parentNode.tagName==='P'&&node.parentNode.textContent.trim()===key)node.parentNode.replaceWith(replacement);
      else node.replaceWith(replacement);
      // Newly split text may contain another inline formula.
      const next=doc.createTreeWalker(fragment,4);nodes.length=0;while(next.nextNode())nodes.push(next.currentNode);
      break;
    }
  }
  const container=doc.createElement('div');container.append(fragment);
  const html=container.innerHTML;
  return {html,errors,formulaCount:prepared.math.length};
}
export class DriveSource {
  constructor(tokenProvider,root) { this.tokenProvider=tokenProvider;this.root=root;this.meta=new Map();this.folders=new Map(); }
  async request(path,params={},type='json') {
    const token=this.tokenProvider(); if(!token) throw new Error('登录已过期，请点击连接 Google Drive 重新授权。');
    const url=new URL('https://www.googleapis.com/drive/v3/'+path);
    for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
    const res=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if(!res.ok) {
      if(res.status===401) throw new Error('登录已过期，请重新连接 Google Drive。');
      let detail='';try {detail=(await res.json()).error?.message || '';}catch{}
      if(res.status===403) throw new Error('Google 拒绝读取：请确认 Drive API 已启用，且当前账号拥有文件权限。'+detail);
      if(res.status===404) throw new Error('文件不存在，或当前账号没有访问权限。');
      throw new Error('Drive 读取失败 ('+res.status+')。'+detail);
    }
    return type==='blob'?res.blob():type==='text'?res.text():res.json();
  }
  async metadata(id) {
    const f=await this.request('files/'+encodeURIComponent(id),{fields:'id,name,mimeType,modifiedTime,parents,webViewLink',supportsAllDrives:'true'});
    this.meta.set(id,{...this.meta.get(id),...f});return this.meta.get(id);
  }
  async list(id,path=[],force=false) {
    if(!force&&this.folders.has(id)) return this.folders.get(id);
    const files=[];let pageToken;
    do {
      const data=await this.request('files',{q:"'"+id+"' in parents and trashed = false",fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents)',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})});
      for(const f of data.files || []) { const item={...f,path:[...path,f.name]}; this.meta.set(f.id,item);files.push(item); }
      pageToken=data.nextPageToken;
    } while(pageToken);
    files.sort(compareNames);this.folders.set(id,files);return files;
  }
  text(id) { return this.request('files/'+encodeURIComponent(id),{alt:'media'},'text'); }
  blob(id) { return this.request('files/'+encodeURIComponent(id),{alt:'media'},'blob'); }
  async findPath(parts) {
    let id=this.root,path=[],item;
    for(const name of parts) {item=(await this.list(id,path)).find(f=>f.name===name);if(!item)throw new Error('相对链接没有找到对应文件：'+parts.join('/'));id=item.id;path.push(name);}
    return item;
  }
  async resolveId(id) {
    if(this.meta.get(id)?.path) return this.meta.get(id);
    let f=await this.metadata(id),cursor=f;const names=[f.name];const seen=new Set([id]);
    for(let depth=0;depth<40;depth++) {
      const parent=cursor.parents?.[0];if(parent===this.root){f.path=names.reverse();return f;}
      if(!parent||seen.has(parent))break;seen.add(parent);cursor=await this.metadata(parent);names.push(cursor.name);
    }
    throw new Error('这个链接在当前资料目录之外，请在 Google Drive 中打开原文件。');
  }
}
export class LocalSource {
  constructor(files) {
    this.root='local-root';this.meta=new Map();this.folders=new Map([[this.root,[]]]);this.raw=new Map();
    const paths=Array.from(files).map(f=>({file:f,parts:(f.webkitRelativePath||f.name).split('/')}));
    const strip=paths.every(p=>p.parts.length>1)&&new Set(paths.map(p=>p.parts[0])).size===1;
    this.rootName=strip?paths[0]?.parts[0]:'本地笔记';
    for(const {file,parts:original} of paths) {
      const parts=strip?original.slice(1):original;let parent=this.root;
      for(let i=0;i<parts.length;i++) {
        const path=parts.slice(0,i+1),id='local:'+path.join('/'),folder=i<parts.length-1;
        if(!this.meta.has(id)){const item={id,name:parts[i],path,mimeType:folder?FOLDER:file.type,modifiedTime:new Date(file.lastModified).toISOString()};this.meta.set(id,item);this.folders.get(parent).push(item);if(folder)this.folders.set(id,[]);}
        if(!folder)this.raw.set(id,file);parent=id;
      }
    }
    for(const children of this.folders.values()) children.sort(compareNames);
  }
  async list(id) { return this.folders.get(id)||[]; }
  async metadata(id) { return this.meta.get(id); }
  async text(id) { return this.raw.get(id).text(); }
  async blob(id) { return this.raw.get(id); }
  async findPath(parts) { const f=this.meta.get('local:'+parts.join('/'));if(!f)throw new Error('本地文件夹没有这个文件：'+parts.join('/'));return f; }
  async resolveId(id) {return this.meta.get(id);}
}
