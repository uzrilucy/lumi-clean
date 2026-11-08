// Container-level cleaning preserves encoded image data. Optional JPEG rotation uses the browser separately.
const ascii=(b,s,n)=>String.fromCharCode(...b.subarray(s,s+n));
const cat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const fail=()=>{throw new Error('손상되었거나 지원하지 않는 이미지 구조입니다.');};
export function orientation(b){
 try {let p=ascii(b,0,6)==='Exif\0\0'?6:0;const v=new DataView(b.buffer,b.byteOffset,b.byteLength);const le=ascii(b,p,2)==='II';if(!le&&ascii(b,p,2)!=='MM')return 1;if(v.getUint16(p+2,le)!==42)return 1;const a=p+v.getUint32(p+4,le),n=v.getUint16(a,le);if(n>2048)return 1;for(let i=0;i<n;i++){const q=a+2+12*i;if(v.getUint16(q,le)===274&&v.getUint16(q+2,le)===3&&v.getUint32(q+4,le)===1){const o=v.getUint16(q+8,le);return o>=1&&o<=8?o:1;}}}catch{}return 1;
}
function jpeg(b){
 const parts=[b.subarray(0,2)],removed=[];let p=2,orient=1,scan=false,hasScan=false,hasFrame=false;
 while(p<b.length){
  if(scan){const start=p;while(p<b.length){if(b[p]!==255){p++;continue;}let q=p+1;while(q<b.length&&b[q]===255)q++;if(q>=b.length)fail();if(b[q]===0||(b[q]>=208&&b[q]<=215)){p=q+1;continue;}break;}parts.push(b.subarray(start,p));scan=false;}
  if(p>=b.length||b[p]!==255)fail();const start=p;while(b[p]===255)p++;const marker=b[p++];if(marker===217){if(!hasScan||!hasFrame)fail();parts.push(b.subarray(start,p));if(p<b.length)removed.push('파일 뒤 추가 데이터');return{bytes:cat(parts),removed,orientation:orient,format:'JPEG',ext:'jpg',mime:'image/jpeg'};}
  if(marker===216||marker===0)fail();if(marker===1||(marker>=208&&marker<=215)){parts.push(b.subarray(start,p));continue;}
  if(p+2>b.length)fail();const len=b[p]*256+b[p+1];if(len<2||p+len>b.length)fail();const body=b.subarray(p+2,p+len);
  if((marker>=224&&marker<=239)||marker===254){
   // Adobe APP14 controls CMYK/YCCK interpretation; it contains no personal fields.
   if(marker===238&&body.length===12&&ascii(body,0,5)==='Adobe')parts.push(b.subarray(start,p+len));
   else {const name=marker===225?(ascii(body,0,6)==='Exif\0\0'?'EXIF · 위치/촬영 정보':'XMP · 확장 정보'):marker===226?'색상 프로필 / APP2':marker===237?'IPTC · 편집 정보':marker===254?'주석':`APP${marker-224} 부가 정보`;removed.push(name);if(marker===225&&ascii(body,0,6)==='Exif\0\0')orient=orientation(body);}
  }else parts.push(b.subarray(start,p+len));
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))hasFrame=true;
  p+=len;if(marker===218){scan=true;hasScan=true;}
 }fail();
}
function png(b){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),parts=[b.subarray(0,8)],removed=[];let p=8,orient=1,ihdr=false,idat=false;
 const allowed=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','acTL','fcTL','fdAT']);
 while(p+12<=b.length){const n=v.getUint32(p),end=p+12+n;if(end>b.length)fail();const type=ascii(b,p+4,4);if(v.getUint32(p+8+n)!==crc32(b.subarray(p+4,p+8+n)))fail();if(!ihdr&&type!=='IHDR')fail();if(type==='IHDR'){if(ihdr||n!==13)fail();ihdr=true;}if(type==='IDAT')idat=true;
  if(allowed.has(type))parts.push(b.subarray(p,end));else{if((b[p+4]&32)===0)throw new Error('이 PNG의 특수 이미지 구조는 지원하지 않습니다.');removed.push(type);if(type==='eXIf')orient=orientation(b.subarray(p+8,p+8+n));}
  p=end;if(type==='IEND'){if(n!==0||!idat)fail();if(p<b.length)removed.push('파일 뒤 추가 데이터');return{bytes:cat(parts),removed,orientation:orient,format:'PNG',ext:'png',mime:'image/png'};}
 }fail();
}
function webp(b){
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),limit=v.getUint32(4,true)+8;if(limit>b.length||limit<12)fail();let p=12,orient=1,hasImage=false;const parts=[],removed=[];const allowed=new Set(['VP8X','ANIM','ANMF','ALPH','VP8 ','VP8L']);
 while(p+8<=limit){const type=ascii(b,p,4),n=v.getUint32(p+4,true),end=p+8+n+(n%2);if(end>limit)fail();if(allowed.has(type)){let chunk=b.slice(p,end);if(type==='ANMF'){if(n<16)fail();let q=p+24;const frames=[b.subarray(p+8,p+24)];while(q+8<=p+8+n){const sub=ascii(b,q,4),sn=v.getUint32(q+4,true),se=q+8+sn+(sn%2);if(se>p+8+n)fail();if(['ALPH','VP8 ','VP8L'].includes(sub))frames.push(b.subarray(q,se));else removed.push('프레임 '+sub.trim());q=se;}if(q!==p+8+n)fail();const frame=cat(frames);chunk=new Uint8Array(8+frame.length+(frame.length%2));chunk.set(b.subarray(p,p+4));new DataView(chunk.buffer).setUint32(4,frame.length,true);chunk.set(frame,8);}if(type==='VP8X'){if(n!==10)fail();chunk[8]&=~(0x20|0x08|0x04);}if(['ANMF','VP8 ','VP8L'].includes(type))hasImage=true;parts.push(chunk);}else{removed.push(type.trim());if(type==='EXIF')orient=orientation(b.subarray(p+8,p+8+n));}p=end;
 }if(p!==limit||!hasImage)fail();if(limit<b.length)removed.push('파일 뒤 추가 데이터');const body=cat(parts),head=b.slice(0,12);new DataView(head.buffer).setUint32(4,body.length+4,true);return{bytes:cat([head,body]),removed,orientation:orient,format:'WebP',ext:'webp',mime:'image/webp'};
}
export function cleanImage(input){const b=input instanceof Uint8Array?input:new Uint8Array(input);if(b.length>=4&&b[0]===255&&b[1]===216)return jpeg(b);if(b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return png(b);if(b.length>=12&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP')return webp(b);throw new Error('JPG, PNG, WebP 파일을 선택해주세요. HEIC·GIF·SVG는 지원하지 않습니다.');}
let crcTable;
export function crc32(bytes){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
export function makeZip(files){const chunks=[],central=[];let offset=0;for(const f of files){const name=new TextEncoder().encode(f.name),data=f.bytes,crc=crc32(data);const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);chunks.push(h,data);const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=h.length+data.length;}const dir=cat(central),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,dir.length,true);e.setUint32(16,offset,true);return new Blob([...chunks,dir,end],{type:'application/zip'});}
