import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const catalog={coffee:{id:'coffee',name:'Coffee',emoji:'☕',category:'Beverage · Follow label storage instructions',mfg:'2026-10-15',exp:'2026-10-22'},yogurt:{id:'yogurt',name:'Yogurt',emoji:'🍓',category:'Dairy · Keep chilled',mfg:'2026-09-20',exp:'2026-10-11'},bread:{id:'bread',name:'Bread',emoji:'🍞',category:'Bakery · Store in a cool place',mfg:'2026-10-10',exp:'2026-10-16'},milk:{id:'milk',name:'Fresh Milk',emoji:'🥛',category:'Dairy · Keep chilled',mfg:'2026-09-25',exp:'2026-10-25'},burger:{id:'burger',name:'Hamburger',emoji:'🍔',category:'Prepared food · Keep chilled',mfg:'2026-10-14',exp:'2026-10-16'},broccoli:{id:'broccoli',name:'Broccoli',emoji:'🥦',category:'Vegetable · Keep chilled',mfg:'2026-10-14',exp:'2026-10-20'},beef:{id:'beef',name:'Beef',emoji:'🥩',category:'Raw meat · Keep refrigerated',mfg:'2026-10-14',exp:'2026-10-17'},sausage:{id:'sausage',name:'Sausage',emoji:'🌭',category:'Processed meat · Keep refrigerated',mfg:'2026-10-14',exp:'2026-10-22'},eggs:{id:'eggs',name:'Fresh Eggs',emoji:'🥚',category:'Eggs · Keep refrigerated',mfg:'2026-10-10',exp:'2026-10-24'}};
const $=id=>document.getElementById(id);
const configured=!!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let auth,db,user=null,unsubscribe=null,tracked=[],filter='all',current=null;
let qrScanner=null,scannerBusy=false,scannerDone=false,qrLibraryPromise=null;
const urlProduct=(new URLSearchParams(location.search).get('product')||'').toLowerCase().trim();
const validQrProduct=!!catalog[urlProduct];
function notice(msg){$('notice').hidden=!msg;$('notice').textContent=msg||''}
function daysLeft(exp){const d=new Date(exp+'T00:00:00');const n=new Date(),t=new Date(n.getFullYear(),n.getMonth(),n.getDate());return Math.round((d-t)/86400000)}
function state(p){const d=daysLeft(p.exp);return {d,type:d<0?'expired':d<=3?'soon':'fresh',label:d<0?'Expired':d<=3?'Expiring soon':'Fresh',days:d<0?`${-d} days ago`:d===0?'Expires today':`${d} days left`}}
function fmt(s){return new Date(s+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
function render(){const items=tracked.map(id=>catalog[id]).filter(Boolean);$('count').textContent=items.length;const counts={all:items.length,fresh:0,soon:0,expired:0};items.forEach(p=>counts[state(p).type]++);document.querySelectorAll('[data-filter]').forEach(b=>{const k=b.dataset.filter;b.textContent=`${k==='all'?'All':k==='soon'?'Soon':k[0].toUpperCase()+k.slice(1)} ${counts[k]}`;b.classList.toggle('selected',filter===k)});const expired=items.filter(p=>state(p).type==='expired');$('alert').hidden=!expired.length;$('alert').textContent=expired.length?`${expired.map(p=>p.name).join(', ')} expired. M5 alerts are not connected yet.`:'';const list=$('products');list.replaceChildren();const shown=items.filter(p=>filter==='all'||state(p).type===filter);if(!shown.length){list.innerHTML=items.length===0?'<div class="emptyState"><div class="emptyIcon">📦</div><h2>No products yet</h2><p>Scan a product QR code, then tap <strong>Add to My Products</strong>.</p></div>':'<p class="empty">No products in this category.</p>';return}shown.forEach(p=>{const s=state(p),row=document.createElement('div');row.className='item';const open=document.createElement('button');open.className='productOpen';open.innerHTML=`<div class="emoji">${p.emoji}</div><div><div class="name">${p.name}</div><div class="exp">EXP ${fmt(p.exp)}</div></div><div class="itemMeta"><span class="pill ${s.type}">${s.label}</span><div class="daysText">${s.days}</div></div>`;open.onclick=()=>showDetail(p.id);const del=document.createElement('button');del.className='remove';del.textContent='🗑';del.title=`Remove ${p.name}`;del.setAttribute('aria-label',del.title);del.onclick=async()=>{if(!confirm(`Remove ${p.name} from My Products?`))return;try{await deleteDoc(doc(db,'users',user.uid,'products',p.id))}catch(e){notice('Remove failed: '+e.message)}};row.append(open,del);list.append(row)})}
function showList(){closeScanner();current=null;$('listPage').hidden=false;$('detailPage').hidden=true;history.replaceState(null,'',location.pathname);$('scanDock').hidden=!user;render()}
function showDetail(id){const p=catalog[id];if(!p)return;closeScanner();$('scanDock').hidden=true;current=id;$('listPage').hidden=true;$('detailPage').hidden=false;$('detailEmoji').textContent=p.emoji;$('detailName').textContent=p.name;$('detailCategory').textContent=p.category;$('detailMfg').textContent=fmt(p.mfg);$('detailExp').textContent=fmt(p.exp);const s=state(p);$('detailDays').textContent=Math.abs(s.d);$('detailUnit').textContent=s.d<0?'days past expiry':s.d===0?'expires today':'days remaining';$('detailStatus').textContent=s.label.toUpperCase();$('detailStatus').className=`pill ${s.type}`;$('statusBox').style.background=s.type==='fresh'?'#e4f3e9':s.type==='soon'?'#fff2d4':'#fae5e3';$('addBtn').textContent=tracked.includes(id)?'Already Added ✓':'Add to My Products';$('addBtn').disabled=tracked.includes(id)}
$('addBtn').onclick=async()=>{if(!current||!user)return;const id=current,p=catalog[id];$('addBtn').disabled=true;try{await setDoc(doc(db,'users',user.uid,'products',id),{productId:id,name:p.name,emoji:p.emoji,mfg:p.mfg,exp:p.exp,addedAt:serverTimestamp()});showList()}catch(e){notice('Could not save product: '+e.message);$('addBtn').disabled=false}};
$('backBtn').onclick=showList;$('nav').onclick=showList;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});
function showAuth(){user=null;tracked=[];
$('loginHeading').textContent=validQrProduct?'Sign in to track '+catalog[urlProduct].name:'Welcome to SmartExpiry';
$('loginDescription').textContent=validQrProduct?'Your QR code is ready. Continue with Google to view the product and choose whether to add it.':'New here? Continue with Google to register automatically. Returning users can sign in with the same Google account.';
$('loginBtn').textContent='Continue with Google';$('loginPage').hidden=false;$('scanDock').hidden=true;$('listPage').hidden=true;$('detailPage').hidden=true;$('accountBar').hidden=true;$('count').textContent='0';$('nav').hidden=true}
function showSignedIn(u){user=u;$('loginPage').hidden=true;$('accountBar').hidden=false;$('accountName').textContent=u.displayName||u.email||'Signed in';$('nav').hidden=false;notice('');if(validQrProduct)showDetail(urlProduct);else showList();unsubscribe=onSnapshot(collection(db,'users',u.uid,'products'),snapshot=>{tracked=snapshot.docs.map(d=>d.id).filter(id=>catalog[id]);render();if(current)showDetail(current)},err=>notice('Cannot load your products: '+err.message))}

// Camera scanner runs inside My Products. QR is only a product link; saving requires Add.
function loadQrLibrary(){
 if(!qrLibraryPromise)qrLibraryPromise=new Promise((resolve,reject)=>{
  if(window.Html5Qrcode){resolve(window.Html5Qrcode);return}
  const script=document.createElement('script');script.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  script.onload=()=>window.Html5Qrcode?resolve(window.Html5Qrcode):reject(new Error('QR scanner library unavailable'));
  script.onerror=()=>reject(new Error('Could not load QR scanner. Check internet connection.'));
  document.head.append(script);
 }).catch(err=>{qrLibraryPromise=null;throw err});
 return qrLibraryPromise;
}
function qrProduct(text){
 try{
  const url=new URL(text.trim());
  const isOurs=url.origin===location.origin && url.pathname.replace(/\/+$/,'')===location.pathname.replace(/\/+$/,'');
  const id=(url.searchParams.get('product')||'').toLowerCase().trim();
  return isOurs && catalog[id]?id:null;
 }catch{return null}
}
async function closeScanner(){
 $('scannerOverlay').hidden=true;scannerDone=true;
 if(qrScanner){const scanner=qrScanner;qrScanner=null;try{await scanner.stop()}catch{}try{scanner.clear()}catch{}}
 $('qrReader').replaceChildren();scannerBusy=false;
}
async function startScanner(){
 if(!user||scannerBusy)return;
 scannerBusy=true;scannerDone=false;$('scannerOverlay').hidden=false;
 $('scanStatus').textContent='Preparing camera…';$('retryScanner').hidden=true;
 try{
  if(!window.isSecureContext)throw new Error('Camera requires HTTPS. Open the GitHub Pages website.');
  const Scanner=await loadQrLibrary();if(scannerDone)return;
  qrScanner=new Scanner('qrReader');
  await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>{const n=Math.min(250,w-20,h-20);return {width:Math.max(100,n),height:Math.max(100,n)}}},async decoded=>{
   if(scannerDone)return;
   const id=qrProduct(decoded);
   if(!id){$('scanStatus').textContent='This is not a recognized SmartExpiry product QR code. Try another code.';return}
   scannerDone=true;await closeScanner();showDetail(id);
  },()=>{});
  if(!scannerDone)$('scanStatus').textContent='Align the QR code inside the camera frame.';
 }catch(e){$('scanStatus').textContent='Cannot open camera: '+(e?.message||e)+' You can still scan using your phone camera.';$('retryScanner').hidden=false;if(qrScanner){try{await qrScanner.stop()}catch{}qrScanner=null}}
 finally{scannerBusy=false}
}
$('scanBtn').onclick=startScanner;
$('closeScanner').onclick=closeScanner;
$('retryScanner').onclick=startScanner;

$('loginBtn').onclick=async()=>{if(!configured){notice('First configure firebase-config.js with your Firebase Web app settings.');return}try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){notice('Google sign-in failed: '+e.message)}};
$('logoutBtn').onclick=async()=>{try{await signOut(auth)}catch(e){notice(e.message)}};
showAuth();$('loginHeading').textContent='Checking your account…';$('loginBtn').disabled=true;if(!configured){$('loginHeading').textContent='Welcome to SmartExpiry';$('loginBtn').disabled=false;notice('Setup needed: edit firebase-config.js, then enable Google Sign-in and Firestore in Firebase Console.')}else{try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);onAuthStateChanged(auth,u=>{ $('loginBtn').disabled=false;if(unsubscribe){unsubscribe();unsubscribe=null}if(u)showSignedIn(u);else showAuth()},e=>{showAuth();notice('Authentication error: '+e.message)})}catch(e){notice('Firebase setup error: '+e.message)}}
