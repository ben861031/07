(async function initializeMailSystem(){
const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js");
const { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js");

const firebaseConfig={apiKey:"AIzaSyCzvPwTbxc_Lg7peKRgP0zUrlmI6kkE0b4",authDomain:"seal-management-68465.firebaseapp.com",projectId:"seal-management-68465",storageBucket:"seal-management-68465.firebasestorage.app",messagingSenderId:"933578260928",appId:"1:933578260928:web:4c5f41252fd786e1bf0825",measurementId:"G-7RKPNF7BK9"};
// 使用具名 Firebase App 隔離同網域其他系統的 Authentication 儲存空間。
// 郵件系統登入、未開通登出及手動登出只會影響此命名實例，不會改動發文平台的預設 Auth。
const MAIL_FIREBASE_APP_NAME="mail-receipt-management";
const app=initializeApp(firebaseConfig,MAIL_FIREBASE_APP_NAME); const db=getFirestore(app); const auth=getAuth(app); const provider=new GoogleAuthProvider();
await setPersistence(auth,browserLocalPersistence);
const DEFAULT_MAIL_TYPES=["掛號","限掛","平信","黑貓宅急便","其他"];
const GENERAL_OUTGOING_TYPE_ORDER=["平信","掛號","限掛","快捷郵件","其他"];
let currentRole="",currentUser="系統使用者",currentUserEmail="";
let mailRecords=[],generalOutgoingRecords=[],outgoingBatches=[],departmentList=[],mailTypeList=[],userList=[],auditLogs=[],loginLogs=[];
let currentPage=1,pageSize=10,auditCurrentPage=1,auditPageSize=25,loginCurrentPage=1,loginPageSize=10;
let selectedSheetRecords=[],sheetMode="normal",activeReprintBatchNo="",activeReprintLabel="";
let incomingSuggestionListSerial=0;
const HISTORY_LIST_PAGE_SIZE=10;
const historyListPages={print:1,general:1,bulk:1};
let excelImportWorkbook=null,excelImportRows=[],excelImportMapping={},excelImportBusy=false,excelImportCurrentSheet="";

function $(id){return document.getElementById(id)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function todayStr(){return new Date().toISOString().slice(0,10)}
function ymStr(d=new Date()){return d.toISOString().slice(0,7)}
function formatDate(v){if(!v)return "-"; if(v.seconds)return new Date(v.seconds*1000).toLocaleString("zh-TW"); if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v).replaceAll("-","/"); return new Date(v).toLocaleString("zh-TW")}
function getTime(v){if(!v)return 0;if(typeof v.toMillis==='function')return v.toMillis();if(v.seconds)return (v.seconds*1000)+Math.floor((v.nanoseconds||0)/1000000);return new Date(v).getTime()||0}
function canAdmin(){return currentRole==="admin"}
function blockUserAdminAction(){ if(canAdmin()) return false; alert("此功能僅限 Admin 使用"); return true; }
function mailLabel(r){return r.trackingNo||r.receiver||r.id||"郵件"}

async function writeAuditLog({action,category,targetId="",targetLabel="",before=null,after=null}){try{await addDoc(collection(db,"mailAuditLogs"),{actorName:currentUser,actorEmail:currentUserEmail,actorRole:currentRole,action,category,targetId,targetLabel,before:compact(before),after:compact(after),createdAt:new Date()})}catch(e){console.error("audit fail",e)}}
function compact(data){if(!data)return null;const out={};Object.entries(data).forEach(([k,v])=>{if(k==="id")return;if(v===null||["string","number","boolean"].includes(typeof v))out[k]=v});return out}

function applyRoleAccess(){document.querySelectorAll(".admin-only").forEach(el=>el.style.display=canAdmin()?"":"none");$("systemMenuTitle").style.display=canAdmin()?"":"none"}
function isMobileLayout(){return window.matchMedia("(max-width: 720px)").matches}
function syncSidebarToggle(){const sidebar=$("sidebar"),toggle=$("sidebarToggle");if(!sidebar||!toggle)return;toggle.setAttribute("aria-expanded",String(isMobileLayout()?sidebar.classList.contains("mobile-open"):!sidebar.classList.contains("collapsed")))}
function toggleSidebar(){const sidebar=$("sidebar");if(!sidebar)return;if(isMobileLayout()){sidebar.classList.remove("collapsed");sidebar.classList.toggle("mobile-open")}else{sidebar.classList.remove("mobile-open");sidebar.classList.toggle("collapsed")}syncSidebarToggle()}
window.toggleSidebar=toggleSidebar;
function showPage(pageId,el){const adminPages=["deptPage","mailTypePage","permissionPage","auditLogPage","loginLogPage"];if(!$(pageId)||(!canAdmin()&&adminPages.includes(pageId))){pageId="registerPage";el=document.querySelector('[onclick*=registerPage]')}document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$(pageId)?.classList.remove("hidden");document.querySelectorAll(".menu-item").forEach(i=>i.classList.remove("active"));if(el)el.classList.add("active");localStorage.setItem("mailLastPage",pageId);if(isMobileLayout())$("sidebar")?.classList.remove("mobile-open");syncSidebarToggle();window.scrollTo({top:0,left:0,behavior:"auto"});if(pageId==="deptPage"){loadDepartments().catch(error=>{console.error("部門重新載入失敗",error);renderDepartmentMaintenanceError(error);});}if(pageId==="mailTypePage")loadMailTypes();if(window.lucide)lucide.createIcons();}
window.showPage=showPage;
document.querySelectorAll(".menu-item").forEach(item=>{item.setAttribute("role","button");item.tabIndex=0;item.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();item.click()}})});
window.addEventListener("resize",()=>{const sidebar=$("sidebar");if(!sidebar)return;if(!isMobileLayout())sidebar.classList.remove("mobile-open");syncSidebarToggle()});
function restoreLastPage(){const last=localStorage.getItem("mailLastPage")||"registerPage",page=$(last)?last:"registerPage";const menu=page==="sheetPage"?document.querySelector('[onclick*=openSheetPage]'):document.querySelector(`[onclick*="${page}"]`);showPage(page,menu||document.querySelector('[onclick*=registerPage]'))}

function currentMailTypes(){return mailTypeList.length?mailTypeList.map(type=>type.name):DEFAULT_MAIL_TYPES}
function generalOutgoingTypes(){return [...new Set([...GENERAL_OUTGOING_TYPE_ORDER,...currentMailTypes()])]}
function renderDropdowns(){const types=currentMailTypes(),mailTypeValue=$("mailType")?.value||"",typeFilterValue=$("typeFilter")?.value||"",typeOptions=types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");if($("mailType")){$("mailType").innerHTML=typeOptions;$("mailType").value=types.includes(mailTypeValue)?mailTypeValue:(types[0]||"")}if($("typeFilter")){$("typeFilter").innerHTML=`<option value="">全部類型</option>`+typeOptions;$("typeFilter").value=types.includes(typeFilterValue)?typeFilterValue:""}const deptOptions=departmentList.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("");if($("department"))$("department").innerHTML=`<option value="">請選擇</option>`+deptOptions;if($("deptFilter"))$("deptFilter").innerHTML=`<option value="">全部部門</option>`+deptOptions}

async function loadDepartments(){
try{
const snap=await getDocs(collection(db,"departments"));
departmentList=[];
snap.forEach(s=>{
const data=s.data()||{};
const name=(data.name||"").trim();
if(name){
departmentList.push({id:s.id,...data,name,sortOrder:Number(data.sortOrder||999)});
}
});
departmentList.sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,"zh-Hant"));
window.mailDepartmentList=departmentList;
renderDropdowns();
renderDepartmentMaintenance();
return departmentList;
}catch(error){
console.error("讀取共用部門 departments 失敗",error);
renderDepartmentMaintenanceError(error);
throw error;
}
}
async function loadMailTypes(){
try{
const snap=await getDocs(collection(db,"mailTypes"));
mailTypeList=[];
snap.forEach(s=>{
const data=s.data()||{},name=(data.name||"").trim();
if(name)mailTypeList.push({id:s.id,...data,name,sortOrder:Number(data.sortOrder||999)});
});
mailTypeList.sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,"zh-Hant"));
if(!mailTypeList.length&&canAdmin()){
for(let i=0;i<DEFAULT_MAIL_TYPES.length;i++)await addDoc(collection(db,"mailTypes"),{name:DEFAULT_MAIL_TYPES[i],sortOrder:i+1});
return loadMailTypes();
}
renderDropdowns();
renderMailTypeMaintenance();
return mailTypeList;
}catch(error){
console.error("讀取郵件類型 mailTypes 失敗",error);
mailTypeList=[];
renderDropdowns();
renderMailTypeMaintenanceError(error);
return [];
}
}
async function loadUsers(){const snap=await getDocs(collection(db,"users"));userList=[];snap.forEach(s=>userList.push({id:s.id,...s.data()}));renderUserList()}
async function loadMailRecords(){const snap=await getDocs(collection(db,"mailRecords"));mailRecords=[];snap.forEach(s=>mailRecords.push({id:s.id,...s.data()}));mailRecords.sort((a,b)=>(getTime(b.createdTime)||Date.parse(b.receiveDate||0))-(getTime(a.createdTime)||Date.parse(a.receiveDate||0)));renderDashboard();renderMailTable();renderSheetPage();refreshAllIncomingReceiverSuggestions()}
async function loadOutgoingBatches(){const snap=await getDocs(collection(db,"outgoingMailBatches"));outgoingBatches=[];generalOutgoingRecords=[];snap.forEach(s=>{const record={id:s.id,...s.data()};if(record.sourceType==="general")generalOutgoingRecords.push(record);else outgoingBatches.push(record)});outgoingBatches.sort((a,b)=>(getTime(b.createdTime)||Date.parse(b.sendDate||0))-(getTime(a.createdTime)||Date.parse(a.sendDate||0)));generalOutgoingRecords.sort((a,b)=>(getTime(b.updatedTime)||getTime(b.createdTime)||Date.parse(b.sendDate||0))-(getTime(a.updatedTime)||getTime(a.createdTime)||Date.parse(a.sendDate||0)));renderOutgoingBatchList();renderGeneralOutgoingList();renderMailTable();}

function incomingRowHtml(item={}, index=0){
  const types = currentMailTypes();
  const receiverListId=`incomingReceiverOptions${++incomingSuggestionListSerial}`;
  const typeOpts = types.map((t,i)=>`<option value="${esc(t)}" ${item.mailType===t?'selected':''}>${i+1}. ${esc(t)}</option>`).join("");
  const typeHtml = item.mailType && !types.includes(item.mailType)
    ? `<option value="${esc(item.mailType)}" selected>${esc(item.mailType)} (歷史)</option>` + typeOpts
    : typeOpts;
  const deptOpts = departmentList.map((d,i)=>`<option value="${esc(d.name)}" ${item.department===d.name?'selected':''}>${i+1}. ${esc(d.name)}</option>`).join("");
  const deptHtml = `<option value="">請選擇</option>` + deptOpts;
  return `<tr class="outgoing-entry-row incoming-entry-row" data-id="${esc(item.id||'')}">
    <td class="incoming-seq" style="text-align:center">${index+1}</td>
    <td><select data-field="mailType" style="width:100%;border:1px solid #dbe4f0;border-radius:8px;padding:8px;font-size:14px;background:#fff">${typeHtml}</select></td>
    <td><input data-field="trackingNo" value="${esc(item.trackingNo||"")}" style="width:100%;padding:9px;border:1px solid #dbe4f0;border-radius:8px;"></td>
    <td><input data-field="sender" value="${esc(item.sender||"")}" style="width:100%;padding:9px;border:1px solid #dbe4f0;border-radius:8px;"></td>
    <td><select data-field="department" style="width:100%;border:1px solid #dbe4f0;border-radius:8px;padding:8px;font-size:14px;background:#fff">${deptHtml}</select></td>
    <td class="incoming-receiver-cell"><div class="receiver-combobox"><input data-field="receiver" value="${esc(item.receiver||"")}" list="${receiverListId}" autocomplete="off" aria-label="收件人，可輸入姓名或展開近期收件人"><button type="button" class="receiver-combobox-toggle" aria-label="展開近期收件人" onclick="openReceiverSuggestions(this)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></button><datalist id="${receiverListId}" class="receiver-suggestion-list"></datalist></div></td>
    <td class="incoming-row-actions"><input type="hidden" data-field="remark" value="${esc(item.remark||"")}">${item.id?'<span class="editing-row-note">編輯既有資料</span>':'<div class="row-action-group"><button type="button" class="btn btn-gray row-action-btn" title="複製上一列內容" onclick="copyPreviousIncomingRow(this)">複製</button><button type="button" class="btn btn-gray row-action-btn" title="在下方新增空白列" onclick="addBlankIncomingRow(this)">新增</button><button type="button" class="btn btn-red row-action-btn" title="刪除這一列" onclick="removeIncomingRow(this)">刪除</button></div>'}</td>
  </tr>`;
}
function renderIncomingRows(items=[]){
  const rows=[...items];
  if(rows.length===0) rows.push({mailType: currentMailTypes()[0]||"掛號"});
  $("incomingEntryRows").innerHTML=rows.map((item,i)=>incomingRowHtml(item,i)).join("");
  bindIncomingGrid();
  refreshAllIncomingReceiverSuggestions();
  refreshIncomingRows();
}
function refreshIncomingRows(){
  const rows=[...document.querySelectorAll(".incoming-entry-row")];
  let count=0;
  rows.forEach((row,i)=>{
    row.querySelector(".incoming-seq").textContent=i+1;
    const sender=row.querySelector('[data-field="sender"]').value.trim();
    const receiver=row.querySelector('[data-field="receiver"]').value.trim();
    const dept=row.querySelector('[data-field="department"]').value;
    const isComplete = sender && receiver && dept;
    row.classList.toggle("is-complete", Boolean(isComplete));
    if(isComplete) count++;
  });
  $("incomingItemCount").textContent=`有效資料 ${count} 件`;
}
function bindIncomingGrid(){
  const body=$("incomingEntryRows");
  body.oninput=refreshIncomingRows;
  body.onchange=event=>{
    if(event.target?.dataset?.field==="department")refreshIncomingReceiverSuggestions(event.target.closest("tr"));
    refreshIncomingRows();
  };
  body.onkeydown=event=>{
    if(event.target?.dataset?.field&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(event.key)){
      event.preventDefault();
      moveIncomingCell(event.target,event.key);
    }
  }
}
function moveIncomingCell(input,key){
  let rows=[...document.querySelectorAll(".incoming-entry-row")];
  const rowIndex=rows.indexOf(input.closest("tr"));
  const fields=["mailType","trackingNo","sender","department","receiver"];
  const fieldIndex=fields.indexOf(input.dataset.field);
  if(rowIndex<0||fieldIndex<0)return;
  let nextRow=rowIndex,nextField=fieldIndex;
  if(key==="ArrowUp")nextRow--;
  if(key==="ArrowDown"||key==="Enter")nextRow++;
  if(key==="ArrowLeft")nextField--;
  if(key==="ArrowRight")nextField++;
  if(nextField<0){nextRow--;nextField=fields.length-1}
  if(nextField>=fields.length){nextRow++;nextField=0}
  
  if(nextRow>=rows.length && (key==="ArrowDown"||key==="Enter"||key==="ArrowRight")){
    const lastRow = rows[rows.length-1];
    const prevType = lastRow.querySelector('[data-field="mailType"]').value;
    const prevDept = lastRow.querySelector('[data-field="department"]').value;
    $("incomingEntryRows").insertAdjacentHTML("beforeend", incomingRowHtml({
      mailType: prevType,
      department: prevDept
    }, rows.length));
    rows=[...document.querySelectorAll(".incoming-entry-row")];
    refreshIncomingReceiverSuggestions(rows[rows.length-1]);
    refreshIncomingRows();
  }
  
  if(nextRow<0||nextRow>=rows.length)return;
  const target=rows[nextRow].querySelector(`[data-field="${fields[nextField]}"]`);
  if(target){target.focus();if(target.select&&target.tagName!=="SELECT")target.select()}
}
function recentReceiversForDepartment(department,limit=20){if(!department)return[];const seen=new Set(),results=[];const ordered=[...mailRecords].sort((a,b)=>(getTime(b.createdTime)||Date.parse(b.receiveDate||0))-(getTime(a.createdTime)||Date.parse(a.receiveDate||0)));for(const record of ordered){const receiver=(record.receiver||"").trim();if(record.department===department&&receiver&&!seen.has(receiver)){seen.add(receiver);results.push(receiver);if(results.length>=limit)break}}return results}
function refreshIncomingReceiverSuggestions(row){if(!row)return;const department=row.querySelector('[data-field="department"]')?.value||"",list=row.querySelector(".receiver-suggestion-list");if(!list)return;const names=recentReceiversForDepartment(department);list.innerHTML=names.map(name=>`<option value="${esc(name)}"></option>`).join("")}
function refreshAllIncomingReceiverSuggestions(){document.querySelectorAll(".incoming-entry-row").forEach(refreshIncomingReceiverSuggestions)}
function openReceiverSuggestions(button){const input=button.closest(".receiver-combobox")?.querySelector('[data-field="receiver"]');if(!input)return;input.focus();try{if(typeof input.showPicker==="function")input.showPicker()}catch(error){console.debug("收件人建議選單需由瀏覽器自動展開",error)}} window.openReceiverSuggestions=openReceiverSuggestions;
function incomingRowValues(row){const value=name=>row.querySelector(`[data-field="${name}"]`)?.value||"";return {mailType:value("mailType"),trackingNo:value("trackingNo"),sender:value("sender"),department:value("department"),receiver:value("receiver"),remark:value("remark")}}
function copyPreviousIncomingRow(button){const row=button.closest("tr"),rows=[...document.querySelectorAll(".incoming-entry-row")],index=rows.indexOf(row);if(index<=0){alert("第一列沒有上一列可以複製");return}const values=incomingRowValues(rows[index-1]);Object.entries(values).forEach(([field,value])=>{const control=row.querySelector(`[data-field="${field}"]`);if(control)control.value=value});row.dataset.id="";refreshIncomingReceiverSuggestions(row);refreshIncomingRows();row.querySelector('[data-field="trackingNo"]').focus()} window.copyPreviousIncomingRow=copyPreviousIncomingRow;
function addBlankIncomingRow(button){const row=button.closest("tr"),index=[...document.querySelectorAll(".incoming-entry-row")].indexOf(row);row.insertAdjacentHTML("afterend",incomingRowHtml({mailType:currentMailTypes()[0]||"掛號"},index+1));const added=row.nextElementSibling;refreshIncomingReceiverSuggestions(added);refreshIncomingRows();added.querySelector('[data-field="mailType"]').focus()} window.addBlankIncomingRow=addBlankIncomingRow;
function removeIncomingRow(button){const row=button.closest("tr"),rows=[...document.querySelectorAll(".incoming-entry-row")];if(rows.length===1){renderIncomingRows([]);return}row.remove();refreshIncomingRows()} window.removeIncomingRow=removeIncomingRow;
function applyIncomingDefaults(){
  const rows=[...document.querySelectorAll(".incoming-entry-row")];
  const firstType=rows[0].querySelector('[data-field="mailType"]').value;
  const firstDept=rows[0].querySelector('[data-field="department"]').value;
  for(let i=1;i<rows.length;i++){
    rows[i].querySelector('[data-field="mailType"]').value=firstType;
    rows[i].querySelector('[data-field="department"]').value=firstDept;
    refreshIncomingReceiverSuggestions(rows[i]);
  }
  refreshIncomingRows();
} window.applyIncomingDefaults=applyIncomingDefaults;

function resetMailForm(){
  $("receiveDate").value=todayStr();
  renderIncomingRows([]);
} window.resetMailForm=resetMailForm;

function getIncomingItems(){
  return [...document.querySelectorAll(".incoming-entry-row")].map(row=>{
    const get=name=>row.querySelector(`[data-field="${name}"]`).value.trim();
    return {
      id: row.dataset.id||"",
      mailType: get("mailType"),
      trackingNo: get("trackingNo"),
      sender: get("sender"),
      department: get("department"),
      receiver: get("receiver"),
      remark: get("remark")
    }
  }).filter(item=>item.sender&&item.receiver&&item.department);
}

async function saveMailRecord(){
  const date=$("receiveDate").value;
  if(!date){alert("請填寫收件日期");return}
  const items=getIncomingItems();
  if(!items.length){alert("請至少完整填寫一筆郵件資料（需包含寄件人、收件部門、收件人）");return}
  
  try{
    let added=0, updated=0;
    let baseTime = Date.now();
    for(const item of items){
      const data={receiveDate:date, mailType:item.mailType, trackingNo:item.trackingNo, sender:item.sender, department:item.department, receiver:item.receiver, remark:item.remark};
      if(item.id){
        const before=mailRecords.find(r=>r.id===item.id);
        await updateDoc(doc(db,"mailRecords",item.id),data);
        await writeAuditLog({action:"update",category:"mailRecord",targetId:item.id,targetLabel:mailLabel(data),before,after:{...before,...data}});
        updated++;
      }else{
        baseTime += 1; // 保證每筆資料建立時間嚴格遞增，確保排序正確
        const ref=await addDoc(collection(db,"mailRecords"),{...data,printed:false,createdBy:currentUser,createdByEmail:currentUserEmail,createdTime:new Date(baseTime)});
        await writeAuditLog({action:"create",category:"mailRecord",targetId:ref.id,targetLabel:mailLabel(data),after:{...data,printed:false}});
        added++;
      }
    }
    alert(`儲存成功！共新增 ${added} 筆，更新 ${updated} 筆郵件。`);
    resetMailForm();
    await loadMailRecords();
  }catch(e){
    console.error(e);
    alert("儲存失敗：" + (e.message||e));
  }
} window.saveMailRecord=saveMailRecord;

function editMail(id){
  const r=mailRecords.find(x=>x.id===id);
  if(!r)return;
  showPage("registerPage",document.querySelector('[onclick*=registerPage]'));
  $("receiveDate").value=r.receiveDate||todayStr();
  renderIncomingRows([r]);
} window.editMail=editMail;
async function deleteMail(id){const r=mailRecords.find(x=>x.id===id);if(!confirm("確定刪除此筆郵件資料？"))return;await deleteDoc(doc(db,"mailRecords",id));await writeAuditLog({action:"delete",category:"mailRecord",targetId:id,targetLabel:mailLabel(r),before:r});await loadMailRecords();}
window.deleteMail=deleteMail;
async function togglePrinted(id,printed){const r=mailRecords.find(x=>x.id===id);await updateDoc(doc(db,"mailRecords",id),{printed:!printed,printedAt:!printed?new Date():null,printedBy:!printed?currentUser:""});await writeAuditLog({action:"update",category:"mailRecord",targetId:id,targetLabel:mailLabel(r),before:r,after:{...r,printed:!printed}});await loadMailRecords();}
window.togglePrinted=togglePrinted;

function requiresOutgoingTracking(mailType){return /掛號|快捷/.test(mailType||"")}
function generalOutgoingTrackingStatus(record){if((record.trackingNo||"").trim())return "completed";if(requiresOutgoingTracking(record.mailType))return "pending";return "not_required"}
function generalOutgoingStatusLabel(status){return {pending:"待補號碼",completed:"已有號碼",not_required:"無須單號"}[status]||"未分類"}
function generalOutgoingStatusBadge(record){const status=record.trackingStatus||generalOutgoingTrackingStatus(record),className=status==="pending"?"badge-yellow":status==="completed"?"badge-green":"badge-gray";return `<span class="badge ${className}">${generalOutgoingStatusLabel(status)}</span>`}
function generalOutgoingRecordLabel(record){return record.trackingNo||record.recordNo||record.receiverName||record.id||"一般寄件"}
function generalOutgoingTypeOptions(selected=""){return generalOutgoingTypes().map(type=>`<option value="${esc(type)}" ${type===selected?"selected":""}>${esc(type)}</option>`).join("")}
function generalOutgoingRowHtml(item={},index=0){const type=item.mailType||"平信";return `<tr class="general-outgoing-entry-row" data-id="${esc(item.id||"")}">
  <td class="general-outgoing-seq">${index+1}</td>
  <td><select data-field="mailType">${generalOutgoingTypeOptions(type)}</select></td>
  <td><input data-field="receiverName" value="${esc(item.receiverName||"")}" placeholder="姓名或單位"></td>
  <td><input data-field="address" value="${esc(item.address||"")}" placeholder="完整寄達地址"></td>
  <td><input data-field="trackingNo" value="${esc(item.trackingNo||"")}" placeholder="可稍後補登"></td>
  <td><input data-field="remark" value="${esc(item.remark||"")}" placeholder="選填"></td>
  <td class="incoming-row-actions"><div class="row-action-group"><button type="button" class="btn btn-gray row-action-btn" title="複製上一列內容" onclick="copyPreviousGeneralOutgoingRow(this)">複製</button><button type="button" class="btn btn-gray row-action-btn" title="在下方新增空白列" onclick="addBlankGeneralOutgoingRow(this)">新增</button><button type="button" class="btn btn-red row-action-btn" title="刪除這一列" onclick="removeGeneralOutgoingRow(this)">刪除</button></div></td>
</tr>`}
function generalOutgoingRowValues(row){const value=name=>row.querySelector(`[data-field="${name}"]`)?.value.trim()||"";return {id:row.dataset.id||"",mailType:value("mailType"),receiverName:value("receiverName"),address:value("address"),trackingNo:value("trackingNo"),remark:value("remark")}}
function generalOutgoingRawItems(){return [...document.querySelectorAll(".general-outgoing-entry-row")].map(generalOutgoingRowValues)}
function syncGeneralOutgoingTrackingInput(row){const type=row.querySelector('[data-field="mailType"]')?.value||"",input=row.querySelector('[data-field="trackingNo"]');if(!input)return;const required=requiresOutgoingTracking(type);input.placeholder=required?"可稍後補登":"此類型無須填寫";row.classList.toggle("tracking-pending",required&&!input.value.trim())}
function refreshGeneralOutgoingRows(){const rows=[...document.querySelectorAll(".general-outgoing-entry-row")];rows.forEach((row,index)=>{row.querySelector(".general-outgoing-seq").textContent=index+1;syncGeneralOutgoingTrackingInput(row)});const valid=rows.map(generalOutgoingRowValues).filter(item=>item.receiverName&&item.address).length;$("generalOutgoingItemCount").textContent=`有效資料 ${valid} 件`;if(window.lucide)lucide.createIcons()}
function moveGeneralOutgoingCell(control,key){const row=control.closest(".general-outgoing-entry-row"),rows=[...document.querySelectorAll(".general-outgoing-entry-row")],fields=["mailType","receiverName","address","trackingNo","remark"],rowIndex=rows.indexOf(row),fieldIndex=fields.indexOf(control.dataset.field);if(rowIndex<0||fieldIndex<0)return;let nextRow=rowIndex,nextField=fieldIndex;if(key==="ArrowUp")nextRow--;if(key==="ArrowDown"||key==="Enter")nextRow++;if(key==="ArrowLeft")nextField--;if(key==="ArrowRight")nextField++;if(nextField<0){nextRow--;nextField=fields.length-1}if(nextField>=fields.length){nextRow++;nextField=0}if(nextRow>=rows.length){rows[rows.length-1].insertAdjacentHTML("afterend",generalOutgoingRowHtml({mailType:control.dataset.field==="mailType"?control.value:"平信"},rows.length));bindGeneralOutgoingGrid();rows=[...document.querySelectorAll(".general-outgoing-entry-row")]}if(nextRow<0||nextRow>=rows.length)return;const target=rows[nextRow].querySelector(`[data-field="${fields[nextField]}"]`);if(target){target.focus();if(target.select&&target.tagName!=="SELECT")target.select()}}
function bindGeneralOutgoingGrid(){const body=$("generalOutgoingRows");if(!body)return;body.oninput=event=>{if(event.target.dataset.field==="trackingNo")syncGeneralOutgoingTrackingInput(event.target.closest("tr"));refreshGeneralOutgoingRows()};body.onchange=event=>{if(event.target.dataset.field==="mailType")syncGeneralOutgoingTrackingInput(event.target.closest("tr"));refreshGeneralOutgoingRows()};body.onkeydown=event=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(event.key)){event.preventDefault();moveGeneralOutgoingCell(event.target,event.key)}}}
function renderGeneralOutgoingRows(items=[]){const rows=items.length?items:[{mailType:"平信"},{mailType:"平信"}];$("generalOutgoingRows").innerHTML=rows.map(generalOutgoingRowHtml).join("");bindGeneralOutgoingGrid();refreshGeneralOutgoingRows()}
function prepareGeneralOutgoingPage(){if(!$("generalOutgoingDate").value)$("generalOutgoingDate").value=todayStr();if(!$("generalOutgoingRows").children.length)renderGeneralOutgoingRows();if(!$("generalOutgoingSender").value)$("generalOutgoingSender").value=localStorage.getItem("outgoingSenderName")||"";renderGeneralOutgoingList()} window.prepareGeneralOutgoingPage=prepareGeneralOutgoingPage;
function resetGeneralOutgoingForm(force=false){const hasInput=generalOutgoingRawItems().some(item=>item.receiverName||item.address||item.trackingNo||item.remark);if(!force&&hasInput&&!confirm("目前填寫的寄件資料將會清除，確定要清空重填嗎？"))return;$("generalOutgoingDate").value=todayStr();$("generalOutgoingSender").value=localStorage.getItem("outgoingSenderName")||"";renderGeneralOutgoingRows()} window.resetGeneralOutgoingForm=resetGeneralOutgoingForm;
function copyPreviousGeneralOutgoingRow(button){const row=button.closest("tr"),rows=[...document.querySelectorAll(".general-outgoing-entry-row")],index=rows.indexOf(row);if(index<=0){alert("第一列沒有上一列可以複製");return}const values=generalOutgoingRowValues(rows[index-1]);Object.entries(values).forEach(([field,value])=>{if(field==="id")return;const control=row.querySelector(`[data-field="${field}"]`);if(control)control.value=value});row.dataset.id="";refreshGeneralOutgoingRows();row.querySelector('[data-field="receiverName"]').focus()} window.copyPreviousGeneralOutgoingRow=copyPreviousGeneralOutgoingRow;
function addBlankGeneralOutgoingRow(button){const row=button.closest("tr"),index=[...document.querySelectorAll(".general-outgoing-entry-row")].indexOf(row);row.insertAdjacentHTML("afterend",generalOutgoingRowHtml({mailType:"平信"},index+1));bindGeneralOutgoingGrid();refreshGeneralOutgoingRows();row.nextElementSibling.querySelector('[data-field="mailType"]').focus()} window.addBlankGeneralOutgoingRow=addBlankGeneralOutgoingRow;
function removeGeneralOutgoingRow(button){const row=button.closest("tr"),rows=[...document.querySelectorAll(".general-outgoing-entry-row")];if(rows.length===1){renderGeneralOutgoingRows();return}row.remove();refreshGeneralOutgoingRows()} window.removeGeneralOutgoingRow=removeGeneralOutgoingRow;
async function saveGeneralOutgoingRecords(){
  const sendDate=$("generalOutgoingDate").value,senderName=$("generalOutgoingSender").value.trim();
  if(!sendDate){alert("請填寫交寄日期");return}
  if(!senderName){alert("請填寫寄件公司名稱");return}
  const raw=generalOutgoingRawItems(),incomplete=raw.filter(item=>Boolean(item.receiverName)!==Boolean(item.address));
  if(incomplete.length&&!confirm("有些列只填寫了收件人或地址，這些列不會建檔。是否繼續？"))return;
  const items=raw.filter(item=>item.receiverName&&item.address);
  if(!items.length){alert("請至少完整填寫一筆收件人與寄達地址");return}
  localStorage.setItem("outgoingSenderName",senderName);
  try{
    let added=0,updated=0,baseTime=Date.now();
    for(const [index,item] of items.entries()){
      const trackingStatus=generalOutgoingTrackingStatus(item);
      const data={sendDate,mailType:item.mailType,receiverName:item.receiverName,address:item.address,trackingNo:item.trackingNo,remark:item.remark,senderName,trackingStatus,sourceType:"general",entrySource:"manual"};
      if(item.id){
        const before=generalOutgoingRecords.find(record=>record.id===item.id);
        await updateDoc(doc(db,"outgoingMailBatches",item.id),{...data,updatedTime:new Date(),updatedBy:currentUser,updatedByEmail:currentUserEmail});
        await writeAuditLog({action:"update",category:"outgoingMailRecord",targetId:item.id,targetLabel:generalOutgoingRecordLabel({...before,...data}),before,after:{...before,...data}});
        updated++;
      }else{
        baseTime++;
        const recordNo=`OUT-${sendDate.replaceAll("-","")}-${baseTime.toString(36).toUpperCase()}-${index+1}`;
        const ref=await addDoc(collection(db,"outgoingMailBatches"),{...data,recordNo,createdTime:new Date(baseTime),createdBy:currentUser,createdByEmail:currentUserEmail});
        await writeAuditLog({action:"create",category:"outgoingMailRecord",targetId:ref.id,targetLabel:generalOutgoingRecordLabel({...data,recordNo}),after:{...data,recordNo}});
        added++;
      }
    }
    await loadOutgoingBatches();
    resetGeneralOutgoingForm(true);
    alert(`儲存成功！共新增 ${added} 筆，更新 ${updated} 筆一般寄件。`);
  }catch(error){console.error(error);alert("儲存失敗：" + (error?.message||error))}
} window.saveGeneralOutgoingRecords=saveGeneralOutgoingRecords;
function editGeneralOutgoingRecord(id,focusTracking=false){const record=generalOutgoingRecords.find(item=>item.id===id);if(!record)return;showPage("generalOutgoingPage",document.querySelector('[onclick*=generalOutgoingPage]'));$("generalOutgoingDate").value=record.sendDate||todayStr();$("generalOutgoingSender").value=record.senderName||"";renderGeneralOutgoingRows([record]);if(focusTracking)requestAnimationFrame(()=>{const input=$("generalOutgoingRows").querySelector('[data-field="trackingNo"]');input?.focus();input?.select()})} window.editGeneralOutgoingRecord=editGeneralOutgoingRecord;
async function deleteGeneralOutgoingRecord(id){const record=generalOutgoingRecords.find(item=>item.id===id);if(!record||!confirm(`確定刪除寄給「${record.receiverName||""}」的寄件紀錄？`))return;await deleteDoc(doc(db,"outgoingMailBatches",id));await writeAuditLog({action:"delete",category:"outgoingMailRecord",targetId:id,targetLabel:generalOutgoingRecordLabel(record),before:record});await loadOutgoingBatches()} window.deleteGeneralOutgoingRecord=deleteGeneralOutgoingRecord;
function updateHistorySelect(id,values,allLabel){
  const select=$(id);if(!select)return;
  const current=select.value;
  const options=[{value:"",label:allLabel},...values.filter(Boolean).sort((a,b)=>String(b).localeCompare(String(a),"zh-Hant")).map(value=>({value,label:id.includes("Date")?formatDate(value):value}))];
  setSelectOptions(select,options,current);
}
function renderHistoryListPager(kind,count){
  const ids={print:"printBatchHistoryPagination",general:"generalHistoryPagination",bulk:"bulkHistoryPagination"};
  const area=$(ids[kind]);if(!area)return;
  const total=Math.max(1,Math.ceil(count/HISTORY_LIST_PAGE_SIZE));
  historyListPages[kind]=Math.min(historyListPages[kind],total);
  if(total<=1){area.innerHTML="";return}
  renderCompactPagination(ids[kind],total,historyListPages[kind],page=>{
    historyListPages[kind]=page;
    ({print:renderPrintBatchHistory,general:renderGeneralOutgoingList,bulk:renderOutgoingBatchList})[kind]();
  });
}
function changeHistoryListFilter(kind){
  historyListPages[kind]=1;
  ({print:renderPrintBatchHistory,general:renderGeneralOutgoingList,bulk:renderOutgoingBatchList})[kind]();
} window.changeHistoryListFilter=changeHistoryListFilter;
function renderGeneralOutgoingList(){
  const area=$("generalOutgoingList");if(!area)return;
  const pending=generalOutgoingRecords.filter(record=>(record.trackingStatus||generalOutgoingTrackingStatus(record))==="pending");
  $("generalOutgoingPendingCount").textContent=pending.length;
  updateHistorySelect("generalHistoryDateFilter",[...new Set(generalOutgoingRecords.map(record=>record.sendDate))],"全部日期");
  updateHistorySelect("generalHistoryCompanyFilter",[...new Set(generalOutgoingRecords.map(record=>record.senderName))],"全部公司");
  const date=$("generalHistoryDateFilter").value,company=$("generalHistoryCompanyFilter").value;
  const ordered=generalOutgoingRecords.filter(record=>(!date||record.sendDate===date)&&(!company||record.senderName===company)).sort((a,b)=>{
    const ap=(a.trackingStatus||generalOutgoingTrackingStatus(a))==="pending"?0:1,bp=(b.trackingStatus||generalOutgoingTrackingStatus(b))==="pending"?0:1;
    return ap-bp||(getTime(b.updatedTime)||getTime(b.createdTime)||0)-(getTime(a.updatedTime)||getTime(a.createdTime)||0);
  });
  $("generalHistoryCount").textContent=`共 ${ordered.length} 筆`;
  renderHistoryListPager("general",ordered.length);
  const page=ordered.slice((historyListPages.general-1)*HISTORY_LIST_PAGE_SIZE,historyListPages.general*HISTORY_LIST_PAGE_SIZE);
  area.innerHTML=page.length?page.map(record=>{
    const status=record.trackingStatus||generalOutgoingTrackingStatus(record);
    const action=status==="pending"?`<button class="btn btn-yellow" onclick="editGeneralOutgoingRecord('${record.id}',true)">補登號碼</button>`:`<button class="btn btn-gray" onclick="editGeneralOutgoingRecord('${record.id}')">編輯</button>`;
    return `<div class="maintenance-item general-outgoing-record"><div><strong>${esc(record.receiverName||"-")}</strong> ${generalOutgoingStatusBadge(record)} ${record.entrySource==="excel"?'<span class="badge badge-blue">Excel 匯入</span>':""}<br><span>${esc(formatDate(record.sendDate))} · ${esc(record.mailType||"-")} · ${esc(record.address||"-")} · ${esc(record.senderName||"-")}</span></div><div class="maintenance-actions">${action}<button class="btn btn-red" onclick="deleteGeneralOutgoingRecord('${record.id}')">刪除</button></div></div>`;
  }).join(""):`<p class="page-desc">沒有符合篩選條件的一般寄件紀錄。</p>`;
  if(window.lucide)lucide.createIcons();
}
function openOutgoingHistory(){showPage("historyPage",document.querySelector('[onclick*=historyPage]'));$("directionFilter").value="outgoing";$("outgoingSourceFilter").value="general";currentPage=1;renderMailTable()} window.openOutgoingHistory=openOutgoingHistory;

function excelImportMatrix(sheetName){
  const sheet=excelImportWorkbook?.Sheets[sheetName];
  if(!sheet)return [];
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:true,dateNF:"yyyy/mm/dd"});
  const firstRow=sheet["!ref"]?XLSX.utils.decode_range(sheet["!ref"]).s.r:0;
  return firstRow?[...Array.from({length:firstRow},()=>[]),...matrix]:matrix;
}
function excelImportColumns(matrix,headerRow){
  return Math.min(60,Math.max(0,...matrix.slice(0,Math.min(matrix.length,50)).map(row=>row?.length||0),headerRow>=0?(matrix[headerRow]?.length||0):0));
}
async function openExcelImportPreview(file){
  if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error("檔案超過 10 MB，請先拆分或精簡工作表");
    if(!window.XLSX)throw new Error("Excel 讀取元件尚未載入，請重新整理網頁後再試");
    excelImportWorkbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
    if(!excelImportWorkbook.SheetNames.length)throw new Error("檔案中沒有工作表");
    const ranked=excelImportWorkbook.SheetNames.map(name=>{
      const matrix=excelImportMatrix(name),headerRow=MailExcelImport.findHeaderRow(matrix),mapping=MailExcelImport.guessColumns(matrix[headerRow]||[]);
      return {name,headerRow,score:["trackingNo","receiverName","address"].filter(key=>mapping[key]>=0).length,matrix};
    }).sort((a,b)=>b.score-a.score||b.matrix.length-a.matrix.length);
    const choice=ranked[0];
    $("excelImportFilename").textContent=file.name;
    $("excelImportSheet").innerHTML=excelImportWorkbook.SheetNames.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
    $("excelImportSheet").value=choice.name;
    excelImportCurrentSheet=choice.name;
    setExcelImportHeaderOptions(choice.matrix,choice.headerRow);
    rebuildExcelImportPreview();
    const dialog=$("excelImportDialog");
    if(!dialog.open)dialog.showModal();
  }catch(error){
    console.error("Excel 檔案讀取失敗",error);
    excelImportWorkbook=null;
    alert("Excel 讀取失敗："+(error?.message||error));
  }finally{$("generalImportFile").value=""}
} window.openExcelImportPreview=openExcelImportPreview;
function setExcelImportHeaderOptions(matrix,selected){
  const options=['<option value="-1">沒有欄名，從第 1 列開始</option>'];
  for(let index=0;index<Math.min(30,matrix.length);index++){
    const label=(matrix[index]||[]).slice(0,4).map(value=>String(value??"").trim()).filter(Boolean).join("、").slice(0,45);
    options.push(`<option value="${index}">第 ${index+1} 列${label?`：${esc(label)}`:""}</option>`);
  }
  $("excelImportHeaderRow").innerHTML=options.join("");
  $("excelImportHeaderRow").value=String(selected);
}
function changeExcelImportSource(){
  const sheetName=$("excelImportSheet").value,matrix=excelImportMatrix(sheetName);
  if(!matrix.length){$("excelImportRows").innerHTML="";$("excelImportSummary").textContent="這個工作表沒有資料";$("confirmExcelImportButton").disabled=true;return}
  const selected=Number($("excelImportHeaderRow").value);
  if(sheetName!==excelImportCurrentSheet){excelImportCurrentSheet=sheetName;setExcelImportHeaderOptions(matrix,MailExcelImport.findHeaderRow(matrix))}
  else if(!Number.isInteger(selected)||selected>=matrix.length)setExcelImportHeaderOptions(matrix,MailExcelImport.findHeaderRow(matrix));
  else if($("excelImportHeaderRow").options.length!==Math.min(30,matrix.length)+1)setExcelImportHeaderOptions(matrix,MailExcelImport.findHeaderRow(matrix));
  rebuildExcelImportPreview();
} window.changeExcelImportSource=changeExcelImportSource;
function renderExcelImportMapping(matrix,headerRow){
  const headers=headerRow>=0?(matrix[headerRow]||[]):[];
  const count=excelImportColumns(matrix,headerRow);
  $("excelImportMappingFields").innerHTML=MailExcelImport.fields.map(field=>{
    const options=['<option value="-1">未對應／使用頁面預設</option>'];
    for(let index=0;index<count;index++)options.push(`<option value="${index}">${MailExcelImport.excelColumn(index)} · ${esc(String(headers[index]||`第 ${index+1} 欄`).slice(0,35))}</option>`);
    return `<label>${field.label}<select data-field="${field.key}" onchange="changeExcelImportMapping(this)">${options.join("")}</select></label>`;
  }).join("");
  for(const select of $("excelImportMappingFields").querySelectorAll("select"))select.value=String(excelImportMapping[select.dataset.field]??-1);
}
function rebuildExcelImportPreview(){
  const matrix=excelImportMatrix($("excelImportSheet").value),headerRow=Number($("excelImportHeaderRow").value);
  excelImportMapping=headerRow>=0?MailExcelImport.guessColumns(matrix[headerRow]||[]):Object.fromEntries(MailExcelImport.fields.map(field=>[field.key,-1]));
  renderExcelImportMapping(matrix,headerRow);
  createExcelImportDraft(matrix,headerRow);
}
function changeExcelImportMapping(select){
  excelImportMapping[select.dataset.field]=Number(select.value);
  const matrix=excelImportMatrix($("excelImportSheet").value);
  createExcelImportDraft(matrix,Number($("excelImportHeaderRow").value));
} window.changeExcelImportMapping=changeExcelImportMapping;
function createExcelImportDraft(matrix,headerRow){
  excelImportRows=MailExcelImport.makeDraftRows(matrix,headerRow,excelImportMapping,{
    sendDate:$("generalOutgoingDate").value||todayStr(),senderName:$("generalOutgoingSender").value.trim()||localStorage.getItem("outgoingSenderName")||"",mailType:"掛號"
  });
  const trackingColumn=excelImportMapping.trackingNo;
  const sheet=excelImportWorkbook?.Sheets[$("excelImportSheet").value];
  if(trackingColumn>=0&&sheet)for(const row of excelImportRows){
    const cell=sheet[`${MailExcelImport.excelColumn(trackingColumn)}${row.sourceRow}`];
    row.unsafeTracking=cell?.t==="n"&&String(cell.v??"").replace(/\D/g,"").length>=15;
    row.originalTracking=row.trackingNo;
  }
  if(excelImportRows.length>1000){
    excelImportRows=[];
    $("excelImportRows").innerHTML="";
    $("excelImportSummary").textContent="此檔超過單次 1,000 筆上限，請拆成較小檔案後再匯入。";
    $("excelImportErrors").textContent="";
    $("confirmExcelImportButton").disabled=true;
    return;
  }
  renderExcelImportRows();
}
function renderExcelImportRows(){
  const types=[...new Set([...generalOutgoingTypes(),...excelImportRows.map(row=>row.mailType).filter(Boolean)])];
  $("excelImportRows").innerHTML=excelImportRows.map((row,index)=>`<tr id="excelImportRow${index}">
    <td><input type="checkbox" aria-label="匯入第 ${row.sourceRow} 列" ${row.excluded?"":"checked"} ${row.imported?"disabled":""} onchange="toggleExcelImportRow(${index},this.checked)"></td>
    <td>${row.sourceRow}</td>
    <td><input type="date" value="${esc(row.sendDate)}" oninput="updateExcelImportCell(${index},'sendDate',this.value)"></td>
    <td><select onchange="updateExcelImportCell(${index},'mailType',this.value)">${types.map(type=>`<option value="${esc(type)}" ${type===row.mailType?"selected":""}>${esc(type)}</option>`).join("")}</select></td>
    <td><input type="text" value="${esc(row.trackingNo)}" oninput="updateExcelImportCell(${index},'trackingNo',this.value)"></td>
    <td><input type="text" value="${esc(row.receiverName)}" oninput="updateExcelImportCell(${index},'receiverName',this.value)"></td>
    <td><input type="text" value="${esc(row.address)}" oninput="updateExcelImportCell(${index},'address',this.value)"></td>
    <td><input type="text" value="${esc(row.senderName)}" oninput="updateExcelImportCell(${index},'senderName',this.value)"></td>
    <td><input type="text" value="${esc(row.remark)}" oninput="updateExcelImportCell(${index},'remark',this.value)"></td>
    <td id="excelImportStatus${index}"></td>
  </tr>`).join("");
  refreshExcelImportValidation();
}
function updateExcelImportCell(index,field,value){
  if(!excelImportRows[index]||excelImportRows[index].imported)return;
  excelImportRows[index][field]=value.trim();
  refreshExcelImportValidation();
} window.updateExcelImportCell=updateExcelImportCell;
function toggleExcelImportRow(index,included){
  if(!excelImportRows[index]||excelImportRows[index].imported)return;
  excelImportRows[index].excluded=!included;
  refreshExcelImportValidation();
} window.toggleExcelImportRow=toggleExcelImportRow;
function existingOutgoingTrackingKeys(){
  return new Set([...generalOutgoingRecords.map(record=>record.trackingNo),...outgoingBatches.flatMap(batch=>(batch.items||[]).map(item=>item.trackingNo))].map(MailExcelImport.trackingKey).filter(Boolean));
}
function validateExcelImportRows(){
  const existing=existingOutgoingTrackingKeys(),seen=new Set();
  return excelImportRows.map(row=>{
    if(row.imported)return ["已匯入"];
    if(row.excluded)return [];
    const errors=[];
    if(!row.sendDate)errors.push("缺交寄日期");
    if(!row.mailType)errors.push("缺郵件種類");
    if(!row.trackingNo)errors.push("缺掛號編號");
    if(!row.receiverName)errors.push("缺收件人");
    if(!row.address)errors.push("缺寄達地址");
    if(!row.senderName)errors.push("缺寄件公司");
    const key=MailExcelImport.trackingKey(row.trackingNo);
    if(key){
      if(/^\d+(?:\.\d+)?E[+-]?\d+$/i.test(row.trackingNo))errors.push("編號為科學記號，請核對原始號碼");
      if(row.unsafeTracking&&row.trackingNo===row.originalTracking)errors.push("Excel 數字超過 15 位，請依原始單據重新輸入");
      if(existing.has(key))errors.push("系統已有相同掛號編號");
      if(seen.has(key))errors.push("檔案內掛號編號重複");
      seen.add(key);
    }
    return errors;
  });
}
function refreshExcelImportValidation(){
  const checks=validateExcelImportRows();
  const active=excelImportRows.filter(row=>!row.excluded&&!row.imported).length;
  const invalid=checks.filter((errors,index)=>!excelImportRows[index].excluded&&!excelImportRows[index].imported&&errors.length).length;
  const excluded=excelImportRows.filter(row=>row.excluded).length,imported=excelImportRows.filter(row=>row.imported).length;
  $("excelImportSummary").innerHTML=`<span>讀取成功 ${excelImportRows.length} 筆</span><span class="ready">即將匯入 ${Math.max(0,active-invalid)} 筆</span><span class="${invalid?"invalid":""}">需修正 ${invalid} 筆</span><span>略過 ${excluded} 筆</span>${imported?`<span>已匯入 ${imported} 筆</span>`:""}`;
  $("excelImportErrors").textContent=invalid?"請修正紅色資料列，或取消勾選不匯入的列。掛號編號也會與系統既有寄件紀錄比對。":"";
  for(let index=0;index<checks.length;index++){
    const row=$("excelImportRow"+index),status=$("excelImportStatus"+index),record=excelImportRows[index];
    if(!row||!status)continue;
    row.classList.toggle("has-error",!record.excluded&&!record.imported&&checks[index].length>0);
    row.classList.toggle("is-excluded",record.excluded||record.imported);
    status.className=checks[index].length&&!record.excluded&&!record.imported?"row-error":"row-ready";
    status.textContent=record.imported?"已匯入":record.excluded?"略過":checks[index].length?checks[index].join("、"):"可匯入";
  }
  $("confirmExcelImportButton").disabled=excelImportBusy||active===0||invalid>0;
  $("confirmExcelImportButton").textContent=excelImportBusy?"匯入中…":`確定匯入 ${Math.max(0,active-invalid)} 筆`;
  const lockSource=excelImportBusy||imported>0;
  $("excelImportSheet").disabled=lockSource;
  $("excelImportHeaderRow").disabled=lockSource;
  $("excelImportMappingFields").querySelectorAll("select").forEach(select=>select.disabled=lockSource);
  $("excelImportDialog").querySelectorAll(".excel-import-close,.excel-import-footer .btn-gray").forEach(button=>button.disabled=excelImportBusy);
  return {active,invalid};
}
function closeExcelImportDialog(){if(excelImportBusy)return;$("excelImportDialog").close();excelImportWorkbook=null;excelImportRows=[]} window.closeExcelImportDialog=closeExcelImportDialog;
$("excelImportDialog").addEventListener("cancel",event=>{if(excelImportBusy)event.preventDefault();else{excelImportWorkbook=null;excelImportRows=[]}});
async function confirmExcelImport(){
  const {active,invalid}=refreshExcelImportValidation();
  if(excelImportBusy||invalid||!active)return;
  excelImportBusy=true;refreshExcelImportValidation();
  const rows=excelImportRows.filter(row=>!row.excluded&&!row.imported),sourceFile=$("excelImportFilename").textContent;
  let saved=0;
  try{
    for(let offset=0;offset<rows.length;offset+=400){
      const chunk=rows.slice(offset,offset+400),batch=writeBatch(db),baseTime=Date.now()+offset;
      for(const [index,row] of chunk.entries()){
        const ref=doc(collection(db,"outgoingMailBatches"));
        const recordNo=`OUT-${row.sendDate.replaceAll("-","")}-${(baseTime+index).toString(36).toUpperCase()}-${index+1}`;
        batch.set(ref,{sendDate:row.sendDate,mailType:row.mailType,receiverName:row.receiverName,address:row.address,trackingNo:row.trackingNo,remark:row.remark,senderName:row.senderName,trackingStatus:generalOutgoingTrackingStatus(row),sourceType:"general",entrySource:"excel",importFileName:sourceFile,importRow:row.sourceRow,recordNo,createdTime:new Date(baseTime+index),createdBy:currentUser,createdByEmail:currentUserEmail});
      }
      await batch.commit();
      chunk.forEach(row=>row.imported=true);
      saved+=chunk.length;
      renderExcelImportRows();
    }
    await writeAuditLog({action:"create",category:"outgoingMailImport",targetLabel:sourceFile,after:{count:saved,source:"excel"}});
    await loadOutgoingBatches();
    excelImportBusy=false;
    closeExcelImportDialog();
    alert(`匯入完成，共新增 ${saved} 筆寄件紀錄。`);
  }catch(error){
    console.error("Excel 匯入失敗",error);
    try{await loadOutgoingBatches()}catch(reloadError){console.error("匯入後重新載入失敗",reloadError)}
    excelImportBusy=false;
    renderExcelImportRows();
    alert(saved?`已匯入 ${saved} 筆，但後續寫入失敗。未完成的資料仍在預覽中，請確認後重試。\n${error?.message||error}`:`匯入失敗，尚未寫入資料：${error?.message||error}`);
  }
} window.confirmExcelImport=confirmExcelImport;

function renderDashboard(){const today=todayStr(),month=ymStr();$("kpiToday").textContent=mailRecords.filter(r=>r.receiveDate===today).length;$("kpiPendingPrint").textContent=mailRecords.filter(r=>!r.printed).length;$("kpiMonth").textContent=mailRecords.filter(r=>(r.receiveDate||"").startsWith(month)).length;$("kpiRegistered").textContent=mailRecords.filter(r=>(r.receiveDate||"").startsWith(month)&&["掛號","限掛"].includes(r.mailType)).length;}
function openPendingPrint(){const menu=document.querySelector('[onclick*=openSheetPage]');showPage("sheetPage",menu);setSheetMode("normal");clearSheetPreview();$("sheetOnlyUnprinted").checked=true;$("sheetDate").value="";renderSheetPage()} window.openPendingPrint=openPendingPrint;
function groupCount(list,key){const m={};list.forEach(r=>{const k=r[key]||"未分類";m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function renderSummary(id,rows){$(id).innerHTML=rows.length?rows.map(([k,v])=>`<div class="summary-item"><strong>${esc(k)}</strong><span>${v} 件</span></div>`).join(""):`<div class="summary-item"><strong>目前無資料</strong><span>0 件</span></div>`}

function getFilteredRecords(){const kw=($("searchInput")?.value||"").toLowerCase();const type=$("typeFilter")?.value||"";const dept=$("deptFilter")?.value||"";const printed=$("printedFilter")?.value||"";const start=$("dateStart")?.value||"";const end=$("dateEnd")?.value||"";return mailRecords.filter(r=>{const text=[r.trackingNo,r.sender,r.department,r.receiver,r.remark,r.mailType].join(" ").toLowerCase();return (!kw||text.includes(kw))&&(!type||r.mailType===type)&&(!dept||r.department===dept)&&(!printed||(printed==="printed"?r.printed:!r.printed))&&(!start||r.receiveDate>=start)&&(!end||r.receiveDate<=end)})}
function normalizedOutgoingRecords(){const general=generalOutgoingRecords.map(record=>({...record,sourceType:"general",sourceLabel:record.entrySource==="excel"?"Excel 匯入":"一般寄件",trackingStatus:record.trackingStatus||generalOutgoingTrackingStatus(record),senderDisplay:record.senderName||""}));const bulk=outgoingBatches.flatMap(batch=>(batch.items||[]).map((item,index)=>({...item,sourceType:"bulk",sourceLabel:"大宗寄件",batchId:batch.id,batchNo:batch.batchNo||batch.id,sendDate:batch.sendDate,mailType:batch.mailType,senderName:batch.senderName,senderDisplay:batch.senderName||"",trackingStatus:item.trackingNo?"completed":"pending",itemNo:index+1})));return [...general,...bulk]}
function getFilteredOutgoingRecords(){const kw=($("searchInput")?.value||"").toLowerCase(),type=$("typeFilter")?.value||"",source=$("outgoingSourceFilter")?.value||"",status=$("printedFilter")?.value||"",start=$("dateStart")?.value||"",end=$("dateEnd")?.value||"";return normalizedOutgoingRecords().filter(record=>{const text=[record.trackingNo,record.receiverName,record.address,record.senderName,record.batchNo,record.recordNo,record.remark,record.mailType,record.sourceLabel].join(" ").toLowerCase();return (!kw||text.includes(kw))&&(!type||record.mailType===type)&&(!source||record.sourceType===source)&&(!status||record.trackingStatus===status)&&(!start||record.sendDate>=start)&&(!end||record.sendDate<=end)}).sort((a,b)=>(getTime(b.updatedTime)||getTime(b.createdTime)||Date.parse(b.sendDate||0))-(getTime(a.updatedTime)||getTime(a.createdTime)||Date.parse(a.sendDate||0)))}
function setSelectOptions(select,options,current){select.innerHTML=options.map(option=>`<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("");select.value=options.some(option=>option.value===current)?current:""}
function syncHistoryFilterMode(outgoing){const deptCard=$("deptFilter").closest(".filter-card"),statusSelect=$("printedFilter"),sourceCard=document.querySelector(".outgoing-source-filter"),typeSelect=$("typeFilter"),currentType=typeSelect.value,currentStatus=statusSelect.value;deptCard.style.display=outgoing?"none":"";sourceCard.hidden=!outgoing;sourceCard.style.display=outgoing?"": "none";const types=outgoing?[...new Set([...generalOutgoingTypes(),"掛號函件","限時掛號","快捷郵件"])]:currentMailTypes();setSelectOptions(typeSelect,[{value:"",label:"全部類型"},...types.map(type=>({value:type,label:type}))],currentType);const statuses=outgoing?[{value:"",label:"全部寄件狀態"},{value:"pending",label:"待補掛號號碼"},{value:"completed",label:"已有掛號號碼"},{value:"not_required",label:"無須掛號號碼"}]:[{value:"",label:"全部列印狀態"},{value:"unprinted",label:"未列印"},{value:"printed",label:"已列印"}];setSelectOptions(statusSelect,statuses,currentStatus);$("dateStartLabel").textContent=outgoing?"交寄日期起":"收件日期起";$("dateEndLabel").textContent=outgoing?"交寄日期迄":"收件日期迄"}
function outgoingQueryStatusBadge(record){const className=record.trackingStatus==="pending"?"badge-yellow":record.trackingStatus==="completed"?"badge-green":"badge-gray";return `<span class="badge ${className}">${generalOutgoingStatusLabel(record.trackingStatus)}</span>`}
function renderMailTable(){const table=$("mailTable");if(!table)return;const outgoing=$("directionFilter")?.value==="outgoing";syncHistoryFilterMode(outgoing);const filtered=outgoing?getFilteredOutgoingRecords():getFilteredRecords();$("recordCount").textContent=filtered.length;if($("paginationRecordCount"))$("paginationRecordCount").textContent=filtered.length;const total=Math.ceil(filtered.length/pageSize)||1;if(currentPage>total)currentPage=1;const pageRows=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize),head=table.closest("table").querySelector("thead");if(outgoing){head.innerHTML="<tr><th>交寄日期</th><th>類型</th><th>掛號號碼</th><th>收件人</th><th>寄達地址</th><th>寄件公司</th><th>來源</th><th>狀態</th><th>操作</th></tr>";table.innerHTML=pageRows.length?pageRows.map(record=>{const action=record.sourceType==="general"?`<button class="btn ${record.trackingStatus==="pending"?"btn-yellow":"btn-gray"}" onclick="editGeneralOutgoingRecord('${record.id}',${record.trackingStatus==="pending"})">${record.trackingStatus==="pending"?"補登號碼":"編輯"}</button>`:`<button class="btn btn-gray" onclick="editOutgoingBatch('${record.batchId}')">開啟批次</button>`;return `<tr><td>${esc(formatDate(record.sendDate))}</td><td>${esc(record.mailType)}</td><td>${esc(record.trackingNo||"-")}</td><td>${esc(record.receiverName)}</td><td class="outgoing-address-cell">${esc(record.address)}</td><td>${esc(record.senderDisplay||"-")}</td><td><span class="badge badge-gray">${esc(record.sourceLabel)}</span></td><td>${outgoingQueryStatusBadge(record)}</td><td>${action}</td></tr>`}).join(""):`<tr><td colspan="9">目前沒有符合條件的寄件資料</td></tr>`}else{head.innerHTML="<tr><th>收件日期</th><th>類型</th><th>掛號 / 單號</th><th>寄件人</th><th>部門</th><th>收件人</th><th>狀態</th><th>操作</th></tr>";table.innerHTML=pageRows.length?pageRows.map(r=>`<tr><td>${esc(formatDate(r.receiveDate))}</td><td>${esc(r.mailType)}</td><td>${esc(r.trackingNo||"-")}</td><td>${esc(r.sender)}</td><td>${esc(r.department)}</td><td>${esc(r.receiver)}</td><td>${r.printed?'<span class="badge badge-green">已列印</span>':'<span class="badge badge-yellow">未列印</span>'}</td><td><button class="btn btn-gray" onclick="editMail('${r.id}')">編輯</button> <button class="btn btn-gray" onclick="togglePrinted('${r.id}',${!!r.printed})">${r.printed?'改未列印':'標記列印'}</button> <button class="btn btn-red" onclick="deleteMail('${r.id}')">刪除</button></td></tr>`).join(""):`<tr><td colspan="8">目前沒有符合條件的郵件資料</td></tr>`}renderPagination(total)}
function renderCompactPagination(id,total,current,onChange){const area=$(id);if(!area)return;area.innerHTML="";area.className="compact-pagination select-pagination";const createButton=(label,page,ariaLabel)=>{const button=document.createElement("button");button.type="button";button.className="btn pagination-btn pagination-nav";button.textContent=label;button.setAttribute("aria-label",ariaLabel);button.disabled=page===current;button.onclick=()=>{if(page!==current)onChange(page)};return button};area.appendChild(createButton("上一頁",Math.max(1,current-1),"上一頁"));const label=document.createElement("label");label.className="pagination-jump";const hidden=document.createElement("span");hidden.className="sr-only";hidden.textContent="選擇頁面";const select=document.createElement("select");select.className="pagination-page-select";select.setAttribute("aria-label",`選擇頁面，共 ${total} 頁`);for(let page=1;page<=total;page++){const option=document.createElement("option");option.value=String(page);option.textContent=`第 ${page} / ${total} 頁`;option.selected=page===current;select.appendChild(option)}select.onchange=()=>onChange(Number(select.value));label.append(hidden,select);area.appendChild(label);area.appendChild(createButton("下一頁",Math.min(total,current+1),"下一頁"))}
function renderPagination(total){renderCompactPagination("paginationArea",total,currentPage,page=>{currentPage=page;renderMailTable()})}
function changePageSize(){pageSize=parseInt($("pageSizeSelect").value);currentPage=1;renderMailTable()} window.changePageSize=changePageSize;
function resetHistoryFilter(){["searchInput","typeFilter","outgoingSourceFilter","deptFilter","printedFilter","dateStart","dateEnd"].forEach(id=>$(id).value="");const panel=$("advancedFilter"),button=$("advancedFilterButton");panel.classList.remove("show");button.classList.remove("is-active");button.setAttribute("aria-expanded","false");$("filterToggleText").textContent="進階篩選";currentPage=1;renderMailTable()} window.resetHistoryFilter=resetHistoryFilter;
function toggleAdvancedFilter(){const panel=$("advancedFilter"),button=$("advancedFilterButton"),opened=panel.classList.toggle("show");button.classList.toggle("is-active",opened);button.setAttribute("aria-expanded",String(opened));$("filterToggleText").textContent=opened?"收合篩選":"進階篩選"} window.toggleAdvancedFilter=toggleAdvancedFilter;
function exportExcel(){const outgoing=$("directionFilter")?.value==="outgoing";const data=outgoing?getFilteredOutgoingRecords().map(record=>({交寄日期:formatDate(record.sendDate),郵件類型:record.mailType,掛號號碼:record.trackingNo||"",收件人:record.receiverName,寄達地址:record.address,寄件公司名稱:record.senderName||"",來源:record.sourceLabel,狀態:generalOutgoingStatusLabel(record.trackingStatus),備註:record.remark||"",批次編號:record.batchNo||record.recordNo||""})):getFilteredRecords().map(r=>({收件日期:formatDate(r.receiveDate),郵件類型:r.mailType,掛號單號:r.trackingNo||"",寄件人:r.sender,收件部門:r.department,收件人:r.receiver,備註:r.remark||"",列印狀態:r.printed?"已列印":"未列印",登錄人:r.createdBy||""}));const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,outgoing?"寄件紀錄":"郵件簽收紀錄");XLSX.writeFile(wb,outgoing?"寄件紀錄.xlsx":"郵件簽收紀錄.xlsx")} window.exportExcel=exportExcel;

function printSnapshotOf(record){return {receiveDate:record.receiveDate||"",mailType:record.mailType||"",trackingNo:record.trackingNo||"",sender:record.sender||"",department:record.department||"",receiver:record.receiver||"",remark:record.remark||""}}
function originalPrintRecord(record){return record.printSnapshot?{...record,...record.printSnapshot,id:record.id}:record}
function setSheetMode(mode,{batchNo="",label=""}={}){sheetMode=mode;activeReprintBatchNo=batchNo;activeReprintLabel=label;const notice=$("sheetModeNotice"),markButton=$("markSheetPrintedButton");if(mode==="reprint"){notice.hidden=false;notice.innerHTML=`<strong>補印模式</strong><span>${esc(label||"已列印郵件")}；不會變更首次列印時間與列印人員。</span>`;markButton.hidden=true}else{notice.hidden=true;notice.innerHTML="";markButton.hidden=false}}
function clearSheetPreview(){selectedSheetRecords=[];const preview=$("signSheetPreview");preview.classList.add("empty-preview");preview.innerHTML="請先勾選部門並產生簽收單。"}
function openSheetPage(menu){showPage("sheetPage",menu);setSheetMode("normal");clearSheetPreview();renderSheetPage()} window.openSheetPage=openSheetPage;
function prepareReprint(records,{batchNo="",label=""}={}){if(!records.length){alert("找不到可補印的郵件資料");return}const dates=[...new Set(records.map(r=>(r.printSnapshot?.receiveDate||r.receiveDate||"")).filter(Boolean))];if(dates.length!==1){alert("補印資料包含不同收件日期，無法合併在同一張簽收單。請先依日期篩選後再選取。");return}const menu=document.querySelector('[onclick*=openSheetPage]');showPage("sheetPage",menu);$("sheetDate").value=dates[0];$("sheetOnlyUnprinted").checked=false;renderSheetPage();selectedSheetRecords=records.map(originalPrintRecord).sort((a,b)=>(getTime(a.createdTime)||0)-(getTime(b.createdTime)||0));setSheetMode("reprint",{batchNo,label});const preview=$("signSheetPreview");preview.classList.remove("empty-preview");preview.innerHTML=buildSignSheetHtml(selectedSheetRecords,dates[0]);preview.scrollIntoView({behavior:"smooth",block:"start"});if(window.lucide)lucide.createIcons()}
function renderSheetPage(){if(!$("sheetDeptList"))return;if(!$("sheetDate").value)$("sheetDate").value=todayStr();const date=$("sheetDate").value,only=$("sheetOnlyUnprinted").checked,allRows=mailRecords.filter(r=>!date||r.receiveDate===date),pendingRows=allRows.filter(r=>!r.printed),rows=only?pendingRows:allRows,grouped=groupCount(rows,"department");if($("sheetPendingCount"))$("sheetPendingCount").textContent=`${pendingRows.length} 件`;if($("sheetAllCount"))$("sheetAllCount").textContent=`${allRows.length} 件`;document.querySelectorAll('input[name="sheetScope"]').forEach(input=>input.checked=input.value===(only?"unprinted":"all"));$("sheetDeptList").innerHTML=grouped.length?grouped.map(([dept,count])=>`<label class="dept-check-card"><div><strong>${esc(dept)}</strong><br><span>${count} 件郵件</span></div><input type="checkbox" class="sheet-dept-check" value="${esc(dept)}" onchange="updateSheetGenerateButton()"></label>`).join(""):`<div class="sheet-empty-state"><i data-lucide="inbox"></i><div><strong>${only?'此日期沒有待列印郵件':'此日期沒有郵件資料'}</strong><span>${only&&allRows.length?'可選擇上方「全部郵件」查看已列印資料。':'請更換收件日期後再試一次。'}</span></div><b>0 件</b></div>`;updateSheetGenerateButton();clearSheetPreview();renderPrintBatchHistory();if(window.lucide)lucide.createIcons()}
window.renderSheetPage=renderSheetPage;
function setSheetScope(value){$("sheetOnlyUnprinted").checked=value!=="all";renderSheetPage()} window.setSheetScope=setSheetScope;
function updateSheetGenerateButton(){const button=$("sheetGenerateButton");if(button)button.disabled=!document.querySelector(".sheet-dept-check:checked")} window.updateSheetGenerateButton=updateSheetGenerateButton;
function selectAllSheetDepartments(flag){document.querySelectorAll(".sheet-dept-check").forEach(c=>c.checked=flag);updateSheetGenerateButton()} window.selectAllSheetDepartments=selectAllSheetDepartments;
function generateSignSheet(){const depts=[...document.querySelectorAll(".sheet-dept-check:checked")].map(c=>c.value);if(!depts.length){alert("請先選擇至少一個部門");return}const date=$("sheetDate").value;const only=$("sheetOnlyUnprinted").checked;selectedSheetRecords=mailRecords.filter(r=>(!date||r.receiveDate===date)&&depts.includes(r.department)&&(!only||!r.printed));if(!selectedSheetRecords.length){alert("選取部門沒有可列印郵件");return}selectedSheetRecords.sort((a,b)=>(getTime(a.createdTime)||Date.parse(a.receiveDate||0))-(getTime(b.createdTime)||Date.parse(b.receiveDate||0)));setSheetMode("normal");$("signSheetPreview").classList.remove("empty-preview");$("signSheetPreview").innerHTML=buildSignSheetHtml(selectedSheetRecords,date);$("signSheetPreview").scrollIntoView({behavior:"smooth",block:"start"})}
window.generateSignSheet=generateSignSheet;
function formatTrackingNo(type, no){
  if(!no) return "";
  if(type && (type.includes("掛號") || type.includes("限掛") || type.includes("快捷"))) {
    return no.substring(0, 6);
  }
  return no;
}
function buildSignSheetHtml(rows,date){const departments=[...new Set(rows.map(row=>row.department).filter(Boolean))],parts=(date||todayStr()).split("-").map(Number),rocDateText=`${parts[0]-1911}年${String(parts[1]).padStart(2,"0")}月${String(parts[2]).padStart(2,"0")}日`,body=rows.map(row=>`<tr><td>${esc(formatTrackingNo(row.mailType, row.trackingNo)||row.mailType||"")}</td><td>${esc(row.sender||"")}</td><td>${esc(row.receiver||"")}</td><td></td></tr>`).join("");return `<div class="company-sign-doc"><div class="company-sign-logo"><img src="./公司Logo.png" alt="環興科技股份有限公司"></div><h1>信件簽收單</h1><div class="company-sign-meta"><span>部門：${esc(departments.join("、"))}</span><span>${esc(rocDateText)}</span></div><table class="company-sign-table"><thead><tr><th>掛號編號</th><th>寄件者</th><th>收件者</th><th>簽收</th></tr></thead><tbody>${body}</tbody></table></div>`}
function setCompanySignSheetHeader(paragraph,departmentText,dateText,rightTabPosition="9776"){const xmlDoc=paragraph.ownerDocument,pPr=[...paragraph.children].find(node=>node.localName==="pPr")||paragraph.insertBefore(xmlDoc.createElementNS(WORD_NS,"w:pPr"),paragraph.firstChild),oldTabs=[...pPr.children].find(node=>node.localName==="tabs");if(oldTabs)oldTabs.remove();const tabs=xmlDoc.createElementNS(WORD_NS,"w:tabs"),tab=xmlDoc.createElementNS(WORD_NS,"w:tab");tab.setAttributeNS(WORD_NS,"w:val","right");tab.setAttributeNS(WORD_NS,"w:pos",String(rightTabPosition||"9776"));tabs.appendChild(tab);pPr.appendChild(tabs);[...paragraph.children].filter(node=>node.localName!=="pPr").forEach(node=>node.remove());const addRun=value=>{const run=xmlDoc.createElementNS(WORD_NS,"w:r"),rPr=xmlDoc.createElementNS(WORD_NS,"w:rPr"),fonts=xmlDoc.createElementNS(WORD_NS,"w:rFonts"),size=xmlDoc.createElementNS(WORD_NS,"w:sz"),sizeCs=xmlDoc.createElementNS(WORD_NS,"w:szCs"),text=xmlDoc.createElementNS(WORD_NS,"w:t");["ascii","hAnsi","eastAsia","cs"].forEach(name=>fonts.setAttributeNS(WORD_NS,`w:${name}`,"標楷體"));size.setAttributeNS(WORD_NS,"w:val","32");sizeCs.setAttributeNS(WORD_NS,"w:val","32");rPr.append(fonts,size,sizeCs);run.appendChild(rPr);if(value===null){run.appendChild(xmlDoc.createElementNS(WORD_NS,"w:tab"))}else{text.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");text.textContent=value;run.appendChild(text)}paragraph.appendChild(run)};addRun(departmentText);addRun(null);addRun(dateText)}
function wordVisualLength(value){return [...String(value||"")].reduce((total,char)=>total+(/[\x00-\xff]/.test(char)?.55:1),0)}
function fillCompanySignSheetXml(xmlText,rows,date){const xmlDoc=new DOMParser().parseFromString(xmlText,"application/xml");if(xmlDoc.getElementsByTagName("parsererror").length)throw new Error("公司簽收單範本 XML 解析失敗");const table=xmlDoc.getElementsByTagNameNS(WORD_NS,"tbl")[0];if(!table)throw new Error("公司簽收單範本找不到明細表格");const paragraphs=[...xmlDoc.getElementsByTagNameNS(WORD_NS,"p")].filter(p=>!p.getElementsByTagNameNS(WORD_NS,"p").length),header=paragraphs.find(p=>{const text=wordTextNodes(p).map(node=>node.textContent).join("");return text.includes("部門：")&&text.includes("年")&&text.includes("月")&&text.includes("日")});if(!header)throw new Error("公司簽收單範本找不到部門與日期欄位");const tableWidth=[...table.getElementsByTagNameNS(WORD_NS,"tblW")][0]?.getAttributeNS(WORD_NS,"w")||"9776",departments=[...new Set(rows.map(row=>row.department).filter(Boolean))],parts=(date||todayStr()).split("-").map(Number);setCompanySignSheetHeader(header,`部門：${departments.join("、")}`,`${parts[0]-1911}年${String(parts[1]).padStart(2,"0")}月${String(parts[2]).padStart(2,"0")}日`,tableWidth);const tableRows=[...table.children].filter(node=>node.localName==="tr");if(tableRows.length<2)throw new Error("公司簽收單範本缺少資料列");const templateRow=tableRows[1].cloneNode(true);tableRows.slice(1).forEach(row=>row.remove());rows.forEach(record=>{const row=templateRow.cloneNode(true),cells=[...row.children].filter(node=>node.localName==="tc"),values=[formatTrackingNo(record.mailType, record.trackingNo)||record.mailType||"",record.sender||"",record.receiver||"",""];const senderLength=wordVisualLength(record.sender),fontSizes=[32,senderLength>20?28:senderLength>15?30:32,32,32];values.forEach((value,index)=>{if(cells[index])setWordCellText(cells[index],value,fontSizes[index])});table.appendChild(row)});return new XMLSerializer().serializeToString(xmlDoc)}
async function logReprint(method){if(sheetMode!=="reprint")return;await writeAuditLog({action:"reprint",category:"signSheet",targetLabel:activeReprintBatchNo||activeReprintLabel||"補印",after:{count:selectedSheetRecords.length,departments:[...new Set(selectedSheetRecords.map(r=>r.department))].join(","),receiveDate:$("sheetDate").value||"",method,sourceBatchNo:activeReprintBatchNo||""}})}
async function printCompanySignSheet(){if(!selectedSheetRecords.length){alert("請先產生簽收單");return}await logReprint("列印預覽");window.print()} window.printCompanySignSheet=printCompanySignSheet;
async function downloadCompanySignSheet(){if(!selectedSheetRecords.length){alert("請先勾選部門並產生簽收單");return}if(!window.JSZip){alert("Word 套表元件尚未載入，請確認網路連線後重新整理");return}try{const date=$("sheetDate").value||todayStr(),templateUrl=`./公司信件簽收單_原始範本.docx?refresh=${Date.now()}`,response=await fetch(templateUrl,{cache:"no-store"});if(!response.ok)throw new Error(`無法讀取公司簽收單範本（${response.status}）`);const zip=await JSZip.loadAsync(await response.arrayBuffer()),documentFile=zip.file("word/document.xml");if(!documentFile)throw new Error("公司簽收單範本缺少 document.xml");zip.file("word/document.xml",fillCompanySignSheetXml(await documentFile.async("string"),selectedSheetRecords,date));const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",compression:"DEFLATE"}),url=URL.createObjectURL(blob),link=document.createElement("a"),departments=[...new Set(selectedSheetRecords.map(row=>row.department))].join("_");link.href=url;link.download=`${sheetMode==="reprint"?"補印_":""}信件簽收單_${date}_${departments}.docx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);await logReprint("下載 Word")}catch(error){console.error(error);alert("產生公司版簽收單失敗：" + (error?.message||error))}} window.downloadCompanySignSheet=downloadCompanySignSheet;
async function markSelectedAsPrinted(){if(sheetMode==="reprint"){alert("補印模式不會變更首次列印資料");return}if(!selectedSheetRecords.length){alert("請先產生簽收單");return}if(!confirm(`確定將 ${selectedSheetRecords.length} 筆郵件標記為已列印？`))return;const batchNo=`MAIL-${Date.now()}`;for(const r of selectedSheetRecords){await updateDoc(doc(db,"mailRecords",r.id),{printed:true,printBatchNo:batchNo,printedAt:new Date(),printedBy:currentUser,printSnapshot:printSnapshotOf(r)})}await writeAuditLog({action:"print",category:"signSheet",targetLabel:batchNo,after:{count:selectedSheetRecords.length,departments:[...new Set(selectedSheetRecords.map(r=>r.department))].join(",")}});alert("已標記為已列印");selectedSheetRecords=[];setSheetMode("normal");await loadMailRecords();}
window.markSelectedAsPrinted=markSelectedAsPrinted;

function printBatchGroups(){const groups=new Map();mailRecords.filter(r=>r.printed&&r.printBatchNo).forEach(r=>{if(!groups.has(r.printBatchNo))groups.set(r.printBatchNo,[]);groups.get(r.printBatchNo).push(r)});return [...groups.entries()].map(([batchNo,records])=>({batchNo,records,printedAt:records.reduce((latest,r)=>getTime(r.printedAt)>getTime(latest)?r.printedAt:latest,null),printedBy:records.find(r=>r.printedBy)?.printedBy||"-",exact:records.every(r=>r.printSnapshot),dates:[...new Set(records.map(r=>r.printSnapshot?.receiveDate||r.receiveDate).filter(Boolean))],departments:[...new Set(records.map(r=>r.printSnapshot?.department||r.department).filter(Boolean))].join("、")})).sort((a,b)=>getTime(b.printedAt)-getTime(a.printedAt))}
function renderPrintBatchHistory(){
  const area=$("printBatchHistory");if(!area)return;
  const groups=printBatchGroups();
  const departments=[...new Set(groups.flatMap(group=>group.records.map(record=>record.printSnapshot?.department||record.department).filter(Boolean)))];
  updateHistorySelect("printBatchDateFilter",[...new Set(groups.flatMap(group=>group.dates))],"全部日期");
  updateHistorySelect("printBatchDepartmentFilter",departments,"全部部門");
  const date=$("printBatchDateFilter").value,department=$("printBatchDepartmentFilter").value;
  const filtered=groups.filter(group=>(!date||group.dates.includes(date))&&(!department||group.records.some(record=>(record.printSnapshot?.department||record.department)===department)));
  $("printBatchHistoryCount").textContent=`共 ${filtered.length} 筆`;
  renderHistoryListPager("print",filtered.length);
  const page=filtered.slice((historyListPages.print-1)*HISTORY_LIST_PAGE_SIZE,historyListPages.print*HISTORY_LIST_PAGE_SIZE);
  area.innerHTML=page.length?page.map(group=>`<div class="maintenance-item print-batch-item"><div><strong>${esc(formatDate(group.printedAt))} · ${esc(group.departments||"未分類")}</strong><br><span>${esc(group.dates.map(formatDate).join("、")||"-")} · ${group.records.length} 件 · ${esc(group.printedBy)}</span><div class="print-batch-meta"><span class="badge ${group.exact?'badge-green':'badge-yellow'}">${group.exact?'保留原始快照':'舊批次／依目前資料重建'}</span><code>${esc(group.batchNo)}</code></div></div><div class="maintenance-actions"><button class="btn btn-primary" onclick="openPrintBatch('${group.batchNo}')">開啟補印</button></div></div>`).join(""):`<p class="page-desc">沒有符合篩選條件的列印批次。</p>`;
}
function openPrintBatch(batchNo){const records=mailRecords.filter(r=>r.printed&&r.printBatchNo===batchNo);prepareReprint(records,{batchNo,label:`原列印批次 ${batchNo}`})} window.openPrintBatch=openPrintBatch;

function outgoingRowHtml(item={}){return `<tr class="outgoing-entry-row"><td class="outgoing-seq"></td><td><input data-field="trackingNo" value="${esc(item.trackingNo||"")}"></td><td><input data-field="receiverName" value="${esc(item.receiverName||"")}"></td><td><input data-field="address" value="${esc(item.address||"")}"></td><td class="outgoing-advanced-col"><input type="checkbox" data-field="returnReceipt" ${item.returnReceipt?"checked":""}></td><td class="outgoing-advanced-col"><input type="checkbox" data-field="printedMatter" ${item.printedMatter?"checked":""}></td><td class="outgoing-advanced-col"><input data-field="weight" value="${esc(item.weight||"")}"></td><td class="outgoing-advanced-col"><input data-field="postage" value="${esc(item.postage||"")}"></td><td class="outgoing-advanced-col"><input data-field="contents" value="${esc(item.contents||"")}"></td></tr>`}
function outgoingRawItems(){return [...document.querySelectorAll("#outgoingEntryRows .outgoing-entry-row")].map((row,index)=>{const get=name=>row.querySelector(`[data-field="${name}"]`);return {row:index+1,trackingNo:get("trackingNo").value.trim(),receiverName:get("receiverName").value.trim(),address:get("address").value.trim(),returnReceipt:get("returnReceipt").checked,printedMatter:get("printedMatter").checked,weight:get("weight").value.trim(),postage:get("postage").value.trim(),contents:get("contents").value.trim()}})}
function refreshOutgoingRows(){const rows=[...document.querySelectorAll("#outgoingEntryRows .outgoing-entry-row")];rows.forEach((row,index)=>{row.querySelector(".outgoing-seq").textContent=index+1;const receiver=row.querySelector('[data-field="receiverName"]').value.trim(),address=row.querySelector('[data-field="address"]').value.trim();row.classList.toggle("is-complete",Boolean(receiver&&address));row.classList.toggle("is-incomplete",Boolean(receiver)!==Boolean(address))});$("outgoingItemCount").textContent=`有效資料 ${rows.filter(row=>row.classList.contains("is-complete")).length} 件／共 20 列`}
function nextTrackingNo(value){const text=String(value||"").trim();if(!/^\d+$/.test(text))return "";return String(BigInt(text)+1n).padStart(text.length,"0")}
function fillOutgoingTrackingFrom(source){const rows=[...document.querySelectorAll("#outgoingEntryRows .outgoing-entry-row")],start=rows.indexOf(source.closest("tr"));let previous=source.value.trim();delete source.dataset.autoTracking;for(let index=start+1;index<rows.length;index++){const input=rows[index].querySelector('[data-field="trackingNo"]');if(input.value.trim()&&!input.dataset.autoTracking){previous=input.value.trim();continue}const next=nextTrackingNo(previous);input.value=next;if(next)input.dataset.autoTracking="true";else delete input.dataset.autoTracking;previous=next}}
function outgoingGridFields(){return $("outgoingEntryRows").closest("table").classList.contains("show-advanced")?["trackingNo","receiverName","address","returnReceipt","printedMatter","weight","postage","contents"]:["trackingNo","receiverName","address"]}
function moveOutgoingCell(input,key){const rows=[...document.querySelectorAll("#outgoingEntryRows .outgoing-entry-row")],rowIndex=rows.indexOf(input.closest("tr")),fields=outgoingGridFields(),fieldIndex=fields.indexOf(input.dataset.field);if(rowIndex<0||fieldIndex<0)return;let nextRow=rowIndex,nextField=fieldIndex;if(key==="ArrowUp")nextRow--;if(key==="ArrowDown"||key==="Enter")nextRow++;if(key==="ArrowLeft")nextField--;if(key==="ArrowRight")nextField++;if(nextField<0){nextRow--;nextField=fields.length-1}if(nextField>=fields.length){nextRow++;nextField=0}if(nextRow<0||nextRow>=rows.length)return;const target=rows[nextRow].querySelector(`[data-field="${fields[nextField]}"]`);if(target){target.focus();if(target.select&&target.type!=="checkbox")target.select()}}
function bindOutgoingGrid(){const body=$("outgoingEntryRows");body.oninput=event=>{if(event.target.dataset.field==="trackingNo")fillOutgoingTrackingFrom(event.target);refreshOutgoingRows()};body.onchange=refreshOutgoingRows;body.onkeydown=event=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(event.key)){event.preventDefault();moveOutgoingCell(event.target,event.key)}}}
function toggleOutgoingAdvanced(){const table=$("outgoingEntryRows").closest("table"),show=table.classList.toggle("show-advanced");$("outgoingAdvancedToggle").textContent=show?"隱藏進階欄位":"顯示進階欄位"} window.toggleOutgoingAdvanced=toggleOutgoingAdvanced;
function getOutgoingItems(){return outgoingRawItems().filter(item=>item.receiverName&&item.address).map(({row,...item})=>item)}
const OUTGOING_SENDER_PROFILES_KEY="mailOutgoingSenderProfiles";
function outgoingSenderProfiles(){try{const profiles=JSON.parse(localStorage.getItem(OUTGOING_SENDER_PROFILES_KEY)||"[]");return Array.isArray(profiles)?profiles:[]}catch(error){console.error("寄件人範本讀取失敗",error);return[]}}
function renderOutgoingSenderProfiles(selectedId=$("outgoingSenderProfile")?.value||""){const select=$("outgoingSenderProfile");if(!select)return;const profiles=outgoingSenderProfiles();select.innerHTML='<option value="">選擇寄件人範本</option>'+profiles.map(profile=>`<option value="${esc(profile.id)}">${esc(profile.label)}</option>`).join("");select.value=profiles.some(profile=>profile.id===selectedId)?selectedId:"";$("deleteSenderProfileButton").disabled=!select.value}
function applyOutgoingSenderProfile(id){const profile=outgoingSenderProfiles().find(item=>item.id===id);$("deleteSenderProfileButton").disabled=!profile;if(!profile)return;$("outgoingSenderName").value=profile.senderName||"";$("outgoingRepresentative").value=profile.representative||"";$("outgoingSenderAddress").value=profile.senderAddress||"";$("outgoingSenderPhone").value=profile.senderPhone||""} window.applyOutgoingSenderProfile=applyOutgoingSenderProfile;
function saveOutgoingSenderProfile(){const senderName=$("outgoingSenderName").value.trim(),representative=$("outgoingRepresentative").value.trim(),senderAddress=$("outgoingSenderAddress").value.trim(),senderPhone=$("outgoingSenderPhone").value.trim();if(!senderName){alert("請先填寫公司名稱");return}const label=prompt("請輸入這組寄件人範本名稱",representative?`${senderName}－${representative}`:senderName)?.trim();if(!label)return;const profiles=outgoingSenderProfiles(),existing=profiles.find(profile=>profile.label===label),profile={id:existing?.id||`sender-${Date.now()}`,label,senderName,representative,senderAddress,senderPhone};if(existing)profiles[profiles.indexOf(existing)]=profile;else profiles.push(profile);localStorage.setItem(OUTGOING_SENDER_PROFILES_KEY,JSON.stringify(profiles));renderOutgoingSenderProfiles(profile.id);alert(existing?"寄件人範本已更新":"寄件人範本已建立")} window.saveOutgoingSenderProfile=saveOutgoingSenderProfile;
function deleteOutgoingSenderProfile(){const id=$("outgoingSenderProfile").value,profiles=outgoingSenderProfiles(),profile=profiles.find(item=>item.id===id);if(!profile)return;if(!confirm(`確定刪除寄件人範本「${profile.label}」？`))return;localStorage.setItem(OUTGOING_SENDER_PROFILES_KEY,JSON.stringify(profiles.filter(item=>item.id!==id)));renderOutgoingSenderProfiles()} window.deleteOutgoingSenderProfile=deleteOutgoingSenderProfile;
function prepareOutgoingPage(){renderOutgoingSenderProfiles();if(!$("outgoingDate").value||!$("outgoingEntryRows").children.length)resetOutgoingForm();else refreshOutgoingRows();renderOutgoingBatchList()}
window.prepareOutgoingPage=prepareOutgoingPage;
function startNewOutgoingForm(){const hasInput=outgoingRawItems().some(item=>item.trackingNo||item.receiverName||item.address||item.weight||item.postage||item.contents);if(hasInput&&!confirm("目前填寫的寄件明細將會清除，確定要清空重填嗎？"))return;resetOutgoingForm()} window.startNewOutgoingForm=startNewOutgoingForm;
function renderOutgoingRows(items=[]){const rows=items.slice(0,20);while(rows.length<20)rows.push({});$("outgoingEntryRows").innerHTML=rows.map(outgoingRowHtml).join("");bindOutgoingGrid();refreshOutgoingRows()}
function resetOutgoingForm(){["outgoingBatchId","outgoingRepresentative","outgoingSenderAddress","outgoingSenderPhone"].forEach(id=>$(id).value="");$("outgoingDate").value=todayStr();$("outgoingType").value="掛號函件";$("outgoingSenderName").value=localStorage.getItem("outgoingSenderName")||"";$("outgoingRepresentative").value=localStorage.getItem("outgoingRepresentative")||"";$("outgoingSenderAddress").value=localStorage.getItem("outgoingSenderAddress")||"";$("outgoingSenderPhone").value=localStorage.getItem("outgoingSenderPhone")||"";renderOutgoingRows()} window.resetOutgoingForm=resetOutgoingForm;
function outgoingFormData(){return {sendDate:$("outgoingDate").value,mailType:$("outgoingType").value,senderName:$("outgoingSenderName").value.trim(),representative:$("outgoingRepresentative").value.trim(),senderAddress:$("outgoingSenderAddress").value.trim(),senderPhone:$("outgoingSenderPhone").value.trim(),items:getOutgoingItems()}}
function validateOutgoing(data){if(!data.sendDate||!data.senderName){alert("請填寫交寄日期與公司名稱");return false}const incomplete=outgoingRawItems().filter(item=>Boolean(item.receiverName)!==Boolean(item.address));if(incomplete.length&&!confirm(`第 ${incomplete.map(item=>item.row).join("、")} 列只填寫了收件人或寄達地名，這些列不會建檔。是否繼續？`))return false;if(!data.items.length){alert("請至少完整填寫一筆收件人姓名與寄達地名");return false}if(!data.items[0].trackingNo){alert("請填寫第一筆有效資料的掛號編號，系統會用它建立寄件紀錄編號");return false}return true}
function makeOutgoingBatchNo(data){return `OUT-${data.sendDate.replaceAll("-","")}-${data.items[0].trackingNo}`}
async function saveOutgoingBatch(){const id=$("outgoingBatchId").value,data=outgoingFormData();if(!validateOutgoing(data))return;["outgoingSenderName","outgoingRepresentative","outgoingSenderAddress","outgoingSenderPhone"].forEach(id=>localStorage.setItem(id,$(id).value.trim()));try{if(id){const before=outgoingBatches.find(b=>b.id===id);await updateDoc(doc(db,"outgoingMailBatches",id),{...data,updatedTime:new Date(),updatedBy:currentUser});await writeAuditLog({action:"update",category:"outgoingMailBatch",targetId:id,targetLabel:before?.batchNo||id,before,after:data})}else{const batchNo=makeOutgoingBatchNo(data);if(outgoingBatches.some(batch=>batch.batchNo===batchNo)){alert(`寄件紀錄編號 ${batchNo} 已存在，請確認交寄日期或第一筆掛號號碼`);return}const ref=await addDoc(collection(db,"outgoingMailBatches"),{...data,batchNo,createdTime:new Date(),createdBy:currentUser,createdByEmail:currentUserEmail});$("outgoingBatchId").value=ref.id;await writeAuditLog({action:"create",category:"outgoingMailBatch",targetId:ref.id,targetLabel:batchNo,after:{...data,batchNo,itemCount:data.items.length}})}await loadOutgoingBatches();alert(id?"寄件資料已更新":"寄件資料已儲存")}catch(error){console.error(error);alert("儲存失敗：" + (error?.message||error))}} window.saveOutgoingBatch=saveOutgoingBatch;
function editOutgoingBatch(id){const batch=outgoingBatches.find(b=>b.id===id);if(!batch)return;showPage("outgoingPage",document.querySelector('[onclick*=outgoingPage]'));$("outgoingBatchId").value=batch.id;$("outgoingDate").value=batch.sendDate||todayStr();$("outgoingType").value=batch.mailType||"掛號函件";$("outgoingSenderName").value=batch.senderName||"";$("outgoingRepresentative").value=batch.representative||"";$("outgoingSenderAddress").value=batch.senderAddress||"";$("outgoingSenderPhone").value=batch.senderPhone||"";renderOutgoingRows(batch.items||[])} window.editOutgoingBatch=editOutgoingBatch;
async function deleteOutgoingBatch(id){const batch=outgoingBatches.find(b=>b.id===id);if(!confirm(`確定刪除寄件批次 ${batch?.batchNo||""}？`))return;await deleteDoc(doc(db,"outgoingMailBatches",id));await writeAuditLog({action:"delete",category:"outgoingMailBatch",targetId:id,targetLabel:batch?.batchNo||id,before:batch});if($("outgoingBatchId").value===id)resetOutgoingForm();await loadOutgoingBatches()} window.deleteOutgoingBatch=deleteOutgoingBatch;
function renderOutgoingBatchList(){
  const area=$("outgoingBatchList");if(!area)return;
  updateHistorySelect("bulkHistoryDateFilter",[...new Set(outgoingBatches.map(batch=>batch.sendDate))],"全部日期");
  updateHistorySelect("bulkHistoryCompanyFilter",[...new Set(outgoingBatches.map(batch=>batch.senderName))],"全部公司");
  const date=$("bulkHistoryDateFilter").value,company=$("bulkHistoryCompanyFilter").value;
  const filtered=outgoingBatches.filter(batch=>(!date||batch.sendDate===date)&&(!company||batch.senderName===company));
  $("bulkHistoryCount").textContent=`共 ${filtered.length} 筆`;
  renderHistoryListPager("bulk",filtered.length);
  const page=filtered.slice((historyListPages.bulk-1)*HISTORY_LIST_PAGE_SIZE,historyListPages.bulk*HISTORY_LIST_PAGE_SIZE);
  area.innerHTML=page.length?page.map(batch=>`<div class="maintenance-item"><div><strong>${esc(batch.batchNo||batch.id)}</strong><br><span>${esc(formatDate(batch.sendDate))} · ${esc(batch.mailType)} · ${batch.items?.length||0} 件 · ${esc(batch.senderName||"-")}</span></div><div class="maintenance-actions"><button class="btn btn-gray" onclick="editOutgoingBatch('${batch.id}')">開啟</button><button class="btn btn-red" onclick="deleteOutgoingBatch('${batch.id}')">刪除</button></div></div>`).join(""):`<p class="page-desc">沒有符合篩選條件的大宗寄件紀錄。</p>`;
}
function rocDate(date){const [y,m,d]=(date||todayStr()).split("-").map(Number);return `中華民國 ${y-1911} 年 ${m} 月 ${d} 日`}
function buildOutgoingPrintHtml(data){const rows=[...data.items];while(rows.length<20)rows.push({});const body=rows.map((item,index)=>`<tr><td>${index+1}</td><td>${esc(item.trackingNo||"")}</td><td>${esc(item.receiverName||"")}</td><td>${esc(item.address||"")}</td><td>${item.returnReceipt?"✓":""}</td><td>${item.printedMatter?"✓":""}</td><td>${esc(item.weight||"")}</td><td>${esc(item.postage||"")}</td><td>${esc(item.contents||"")}</td></tr>`).join("");return `<div class="postal-form"><div class="postal-code-box">□□□□□□　□□<br><small>收寄局碼　郵件種類碼（由收寄局填寫）</small></div><div class="postal-stamp">郵局郵戳</div><div class="postal-title">中 華 民 國 郵 政<h1>交寄大宗 ${esc(data.mailType)} 執據</h1></div><div class="postal-date">${rocDate(data.sendDate)}</div><div class="postal-sender"><div>寄件人名稱：${esc(data.senderName)}</div><div>寄件人代表：${esc(data.representative)}</div><div>詳細地址：${esc(data.senderAddress)}</div><div>電話號碼：${esc(data.senderPhone)}</div></div><table class="postal-table"><thead><tr><th rowspan="2">順序<br>號碼</th><th rowspan="2">掛號號碼</th><th colspan="2">收件人</th><th rowspan="2">是否<br>回執</th><th rowspan="2">是否<br>印刷物</th><th rowspan="2">重量</th><th rowspan="2">郵資</th><th rowspan="2">內裝物品名稱</th></tr><tr><th>姓名</th><th>寄達地名（或地址）</th></tr></thead><tbody>${body}</tbody></table><div class="postal-footer"><div>上開 ${esc(data.mailType)} 共 ${data.items.length} 件照收無誤</div><div>郵資共計 __________ 元　　經辦員簽署 __________________</div><div>寄件人簽章：__________________</div></div><div class="postal-note">本表依「交寄大宗限時掛號及掛號函件執據存根2聯單」欄位製作；列印 2 份作為執據及存根。</div></div>`}
function printOutgoingForm(){const data=outgoingFormData();if(!validateOutgoing(data))return;$("outgoingPrintArea").innerHTML=buildOutgoingPrintHtml(data)+buildOutgoingPrintHtml(data);document.body.classList.add("printing-outgoing");window.print();setTimeout(()=>document.body.classList.remove("printing-outgoing"),500)} window.printOutgoingForm=printOutgoingForm;
const WORD_NS="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function wordTextNodes(parent){return [...parent.getElementsByTagNameNS(WORD_NS,"t")]}
function setWordParagraphText(paragraph,text){const nodes=wordTextNodes(paragraph);if(nodes.length){nodes[0].textContent=text;nodes[0].setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");nodes.slice(1).forEach(node=>node.textContent="");return}const run=paragraph.ownerDocument.createElementNS(WORD_NS,"w:r"),textNode=paragraph.ownerDocument.createElementNS(WORD_NS,"w:t");textNode.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");textNode.textContent=text;run.appendChild(textNode);paragraph.appendChild(run)}
function setWordCellText(cell,text,fontSizeHalfPoints){const paragraph=cell.getElementsByTagNameNS(WORD_NS,"p")[0];if(!paragraph)return;setWordParagraphText(paragraph,text);if(!fontSizeHalfPoints)return;[...paragraph.getElementsByTagNameNS(WORD_NS,"r")].forEach(run=>{let rPr=[...run.children].find(node=>node.localName==="rPr");if(!rPr){rPr=paragraph.ownerDocument.createElementNS(WORD_NS,"w:rPr");run.insertBefore(rPr,run.firstChild)};["sz","szCs"].forEach(name=>{let size=[...rPr.children].find(node=>node.localName===name);if(!size){size=paragraph.ownerDocument.createElementNS(WORD_NS,`w:${name}`);rPr.appendChild(size)}size.setAttributeNS(WORD_NS,"w:val",String(fontSizeHalfPoints))})})}
function fillWordHeader(xmlDoc,data){const paragraphs=[...xmlDoc.getElementsByTagNameNS(WORD_NS,"p")].filter(p=>!p.getElementsByTagNameNS(WORD_NS,"p").length);const dateParts=(data.sendDate||todayStr()).split("-").map(Number),rocYear=dateParts[0]-1911;const allTexts=wordTextNodes(xmlDoc);for(let i=0;i<allTexts.length-6;i++){if(allTexts[i].textContent==="中華民國"&&allTexts[i+2]?.textContent==="年"&&allTexts[i+4]?.textContent==="月"){allTexts[i+1].textContent=` ${rocYear} `;allTexts[i+3].textContent=` ${dateParts[1]} `;allTexts[i+5].textContent=` ${dateParts[2]} `;break}}const nameParagraph=paragraphs.find(p=>wordTextNodes(p).map(n=>n.textContent).join("").includes("名稱："));if(nameParagraph)setWordParagraphText(nameParagraph,`　　　　　名稱：${data.senderName}`);const detailParagraph=paragraphs.find(p=>{const text=wordTextNodes(p).map(n=>n.textContent).join("");return text.includes("寄件人代表")&&text.includes("詳細地址")&&text.includes("電話號碼")});if(detailParagraph)setWordParagraphText(detailParagraph,`寄件人代表　${data.representative||""}　　　詳細地址：${data.senderAddress||""}　　　電話號碼：${data.senderPhone||""}`)}
function fillWordItems(xmlDoc,items){const table=xmlDoc.getElementsByTagNameNS(WORD_NS,"tbl")[0];if(!table)throw new Error("原始 Word 找不到明細表格");const rows=[...table.getElementsByTagNameNS(WORD_NS,"tr")];for(let index=0;index<20;index++){const row=rows[index+2],item=items[index]||{};if(!row)continue;const cells=[...row.getElementsByTagNameNS(WORD_NS,"tc")];const values=[String(index+1),item.trackingNo||"",item.receiverName||"",item.address||"",item.returnReceipt?"✓":"",item.printedMatter?"✓":"",item.weight||"",item.postage||"",item.contents||""];values.forEach((value,cellIndex)=>{if(cells[cellIndex])setWordCellText(cells[cellIndex],value)})}}
function updateWordCount(xmlDoc,data){const paragraphs=[...xmlDoc.getElementsByTagNameNS(WORD_NS,"p")].filter(p=>!p.getElementsByTagNameNS(WORD_NS,"p").length);paragraphs.forEach(p=>{const text=wordTextNodes(p).map(n=>n.textContent).join("");if(text.includes("件照收無誤")&&text.includes("共"))setWordParagraphText(p,`     ${data.mailType} / 共 ${data.items.length} 件照收無誤`)})}
async function downloadOutgoingWord(){const data=outgoingFormData();if(!validateOutgoing(data))return;if(!window.JSZip){alert("Word 套表元件尚未載入，請確認網路連線後重新整理");return}try{const templateUrl=`./交寄大宗限時掛號及掛號函件執據存根2聯單_原始範本.docx?refresh=${Date.now()}`,response=await fetch(templateUrl,{cache:"no-store"});if(!response.ok)throw new Error(`無法讀取 Word 範本（${response.status}）`);const zip=await JSZip.loadAsync(await response.arrayBuffer()),documentFile=zip.file("word/document.xml");if(!documentFile)throw new Error("Word 範本缺少 document.xml");const parser=new DOMParser(),xmlDoc=parser.parseFromString(await documentFile.async("string"),"application/xml");if(xmlDoc.getElementsByTagName("parsererror").length)throw new Error("Word 範本 XML 解析失敗");fillWordHeader(xmlDoc,data);fillWordItems(xmlDoc,data.items);updateWordCount(xmlDoc,data);zip.file("word/document.xml",new XMLSerializer().serializeToString(xmlDoc));const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",compression:"DEFLATE"}),url=URL.createObjectURL(blob),link=document.createElement("a"),generatedAt=new Date().toLocaleTimeString("zh-TW",{hour12:false}).replaceAll(":","");link.href=url;link.download=`大宗掛號執據_${data.sendDate}_${generatedAt}.docx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){console.error(error);alert("產生原版 Word 失敗：" + (error?.message||error))}} window.downloadOutgoingWord=downloadOutgoingWord;
const EXCEL_NS="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function getExcelCell(xmlDoc,ref){return [...xmlDoc.getElementsByTagNameNS(EXCEL_NS,"c")].find(cell=>cell.getAttribute("r")===ref)}
function clearExcelCellValue(cell){[...cell.children].filter(node=>["f","v","is"].includes(node.localName)).forEach(node=>node.remove())}
function setExcelCellText(xmlDoc,ref,value){const cell=getExcelCell(xmlDoc,ref);if(!cell)throw new Error(`Excel 範本缺少儲存格 ${ref}`);clearExcelCellValue(cell);cell.setAttribute("t","inlineStr");const inline=xmlDoc.createElementNS(EXCEL_NS,"is"),text=xmlDoc.createElementNS(EXCEL_NS,"t");text.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");text.textContent=String(value??"");inline.appendChild(text);cell.appendChild(inline)}
function setExcelCellNumber(xmlDoc,ref,value){const cell=getExcelCell(xmlDoc,ref);if(!cell)throw new Error(`Excel 範本缺少儲存格 ${ref}`);clearExcelCellValue(cell);cell.removeAttribute("t");const node=xmlDoc.createElementNS(EXCEL_NS,"v");node.textContent=String(value);cell.appendChild(node)}
function fillOutgoingExcelSheet(xmlText,data){const xmlDoc=new DOMParser().parseFromString(xmlText,"application/xml");if(xmlDoc.getElementsByTagName("parsererror").length)throw new Error("Excel 工作表 XML 解析失敗");const [year,month,day]=data.sendDate.split("-").map(Number),rocYear=year-1911;[["D3",rocYear],["G3",month],["J3",day],["D41",rocYear],["G41",month],["J41",day]].forEach(([ref,value])=>setExcelCellNumber(xmlDoc,ref,value));[["H5",data.senderName],["E6",data.representative],["R6",data.senderAddress],["AH6",data.senderPhone],["H43",data.senderName],["E44",data.representative],["R44",data.senderAddress],["AH44",data.senderPhone]].forEach(([ref,value])=>setExcelCellText(xmlDoc,ref,value));for(let index=0;index<20;index++){const item=data.items[index]||{};for(const row of [10+index,48+index]){setExcelCellText(xmlDoc,`C${row}`,item.trackingNo||"");setExcelCellText(xmlDoc,`H${row}`,item.receiverName||"");setExcelCellText(xmlDoc,`O${row}`,item.address||"");setExcelCellText(xmlDoc,`AC${row}`,item.returnReceipt?"ˇ":"");setExcelCellText(xmlDoc,`AE${row}`,"");setExcelCellText(xmlDoc,`AG${row}`,item.printedMatter?"ˇ":"");setExcelCellText(xmlDoc,`AI${row}`,item.weight||"");setExcelCellText(xmlDoc,`AL${row}`,item.postage||"");setExcelCellText(xmlDoc,`AO${row}`,item.contents||"")}}return new XMLSerializer().serializeToString(xmlDoc)}
async function removeExcelCalcChain(zip){const relPath="xl/_rels/workbook.xml.rels",typePath="[Content_Types].xml",relsFile=zip.file(relPath),typesFile=zip.file(typePath);if(relsFile){const rels=new DOMParser().parseFromString(await relsFile.async("string"),"application/xml");[...rels.documentElement.children].filter(node=>(node.getAttribute("Type")||"").endsWith("/calcChain")).forEach(node=>node.remove());zip.file(relPath,new XMLSerializer().serializeToString(rels))}if(typesFile){const types=new DOMParser().parseFromString(await typesFile.async("string"),"application/xml");[...types.documentElement.children].filter(node=>node.getAttribute("PartName")==="/xl/calcChain.xml").forEach(node=>node.remove());zip.file(typePath,new XMLSerializer().serializeToString(types))}zip.remove("xl/calcChain.xml")}
async function downloadOutgoingExcel(){const data=outgoingFormData();if(!validateOutgoing(data))return;if(!window.JSZip){alert("Excel 套表元件尚未載入，請確認網路連線後重新整理");return}try{const templateUrl=`./交寄大宗限時掛號及掛號函件執據存根_原始範本.xlsx?refresh=${Date.now()}`,response=await fetch(templateUrl,{cache:"no-store"});if(!response.ok)throw new Error(`無法讀取 Excel 範本（${response.status}）`);const zip=await JSZip.loadAsync(await response.arrayBuffer());for(const sheetPath of ["xl/worksheets/sheet2.xml","xl/worksheets/sheet3.xml","xl/worksheets/sheet4.xml"]){const sheet=zip.file(sheetPath);if(!sheet)throw new Error(`Excel 範本缺少 ${sheetPath}`);zip.file(sheetPath,fillOutgoingExcelSheet(await sheet.async("string"),data))}await removeExcelCalcChain(zip);const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",compression:"DEFLATE"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`大宗掛號執據_${data.sendDate}_${data.items[0].trackingNo}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){console.error(error);alert("產生原版 Excel 失敗：" + (error?.message||error))}} window.downloadOutgoingExcel=downloadOutgoingExcel;

function renderDepartmentMaintenance(){
const area=$("deptListArea");
if(!area)return;
if(!departmentList.length){
area.innerHTML="<p class='page-desc'>目前共用部門主檔 departments 尚無資料，或尚未成功載入。</p>";
return;
}
area.innerHTML=`<div class="dept-sync-note">目前讀取共用主檔：<b>departments</b>，共 <b>${departmentList.length}</b> 個部門。</div>`+
departmentList.map(d=>`<div class="maintenance-item"><div><strong>${esc(d.name)}</strong><br><span>排序：${esc(d.sortOrder)}</span></div><div class="maintenance-actions"><button class="btn btn-gray" onclick="moveDept('${d.id}',-1)">上移</button><button class="btn btn-gray" onclick="moveDept('${d.id}',1)">下移</button><button class="btn btn-red" onclick="deleteDepartment('${d.id}')">刪除</button></div></div>`).join("");
}
function renderDepartmentMaintenanceError(error){
const area=$("deptListArea");
if(!area)return;
area.innerHTML=`<div class="error-box"><b>部門讀取失敗</b><br>${esc(error?.message||error||"未知錯誤")}<br><span>請確認 Firestore Rules 已允許 departments 讀取。</span></div>`;
}
async function addDepartment(){if(blockUserAdminAction())return;const name=$("newDept").value.trim(),sortOrder=parseInt($("newDeptOrder").value||departmentList.length+1);if(!name){alert("請輸入部門名稱");return}const ref=await addDoc(collection(db,"departments"),{name,sortOrder});await writeAuditLog({action:"create",category:"department",targetId:ref.id,targetLabel:name,after:{name,sortOrder}});$("newDept").value="";$("newDeptOrder").value="";await loadDepartments()} window.addDepartment=addDepartment;
async function deleteDepartment(id){if(blockUserAdminAction())return;const d=departmentList.find(x=>x.id===id);if(!confirm(`確定刪除部門 ${d?.name||""}？`))return;await deleteDoc(doc(db,"departments",id));await writeAuditLog({action:"delete",category:"department",targetId:id,targetLabel:d?.name||id,before:d});await loadDepartments()} window.deleteDepartment=deleteDepartment;
async function moveDept(id,dir){if(blockUserAdminAction())return;const idx=departmentList.findIndex(d=>d.id===id);const ni=idx+dir;if(idx<0||ni<0||ni>=departmentList.length)return;[departmentList[idx],departmentList[ni]]=[departmentList[ni],departmentList[idx]];for(let i=0;i<departmentList.length;i++){await updateDoc(doc(db,"departments",departmentList[i].id),{sortOrder:i+1})}await loadDepartments()} window.moveDept=moveDept;

function renderMailTypeMaintenance(){
const area=$("mailTypeListArea");
if(!area)return;
const list=mailTypeList.length?mailTypeList:DEFAULT_MAIL_TYPES.map((name,index)=>({name,sortOrder:index+1,fallback:true}));
area.innerHTML=list.map(type=>`<div class="maintenance-item"><div><strong>${esc(type.name)}</strong><br><span>排序：${esc(type.sortOrder)}</span></div><div class="maintenance-actions">${type.fallback?"<span class='badge badge-yellow'>預設備援</span>":`<button class="btn btn-gray" onclick="renameMailType('${type.id}')">改名</button><button class="btn btn-gray" onclick="moveMailType('${type.id}',-1)">上移</button><button class="btn btn-gray" onclick="moveMailType('${type.id}',1)">下移</button><button class="btn btn-red" onclick="deleteMailType('${type.id}')">刪除</button>`}</div></div>`).join("");
}
function renderMailTypeMaintenanceError(error){
const area=$("mailTypeListArea");
if(!area)return;
area.innerHTML=`<div class="error-box"><b>郵件類型主檔讀取失敗</b><br>${esc(error?.message||error||"未知錯誤")}<br><span>目前仍使用程式內建類型。請確認 Firestore Rules 已允許 mailTypes 讀寫。</span></div>`;
}
async function addMailType(){if(blockUserAdminAction())return;const name=$("newMailType").value.trim(),sortOrder=parseInt($("newMailTypeOrder").value||mailTypeList.length+1);if(!name){alert("請輸入郵件類型名稱");return}if(currentMailTypes().some(type=>type.toLowerCase()===name.toLowerCase())){alert("此郵件類型已存在");return}const ref=await addDoc(collection(db,"mailTypes"),{name,sortOrder});await writeAuditLog({action:"create",category:"mailType",targetId:ref.id,targetLabel:name,after:{name,sortOrder}});$("newMailType").value="";$("newMailTypeOrder").value="";await loadMailTypes()} window.addMailType=addMailType;
async function renameMailType(id){if(blockUserAdminAction())return;const type=mailTypeList.find(item=>item.id===id);if(!type)return;const name=prompt("請輸入新的郵件類型名稱",type.name)?.trim();if(!name||name===type.name)return;if(mailTypeList.some(item=>item.id!==id&&item.name.toLowerCase()===name.toLowerCase())){alert("此郵件類型已存在");return}await updateDoc(doc(db,"mailTypes",id),{name});await writeAuditLog({action:"update",category:"mailType",targetId:id,targetLabel:name,before:type,after:{...type,name}});await loadMailTypes()} window.renameMailType=renameMailType;
async function deleteMailType(id){if(blockUserAdminAction())return;const type=mailTypeList.find(item=>item.id===id);if(!type)return;const usedCount=mailRecords.filter(record=>record.mailType===type.name).length;if(!confirm(usedCount?`已有 ${usedCount} 筆歷史郵件使用「${type.name}」。刪除後歷史資料仍會保留，但新登錄無法再選擇。確定刪除？`:`確定刪除郵件類型「${type.name}」？`))return;await deleteDoc(doc(db,"mailTypes",id));await writeAuditLog({action:"delete",category:"mailType",targetId:id,targetLabel:type.name,before:type});await loadMailTypes()} window.deleteMailType=deleteMailType;
async function moveMailType(id,dir){if(blockUserAdminAction())return;const idx=mailTypeList.findIndex(type=>type.id===id),nextIndex=idx+dir;if(idx<0||nextIndex<0||nextIndex>=mailTypeList.length)return;[mailTypeList[idx],mailTypeList[nextIndex]]=[mailTypeList[nextIndex],mailTypeList[idx]];for(let i=0;i<mailTypeList.length;i++)await updateDoc(doc(db,"mailTypes",mailTypeList[i].id),{sortOrder:i+1});await loadMailTypes()} window.moveMailType=moveMailType;

function renderUserList(){const area=$("userListArea");if(!area)return;area.innerHTML=userList.map(u=>`<div class="maintenance-item"><div><strong>${esc(u.email)}</strong><div style="margin-top:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><span>角色：</span><select onchange="changeRole('${u.id}',this.value)"><option value="admin" ${u.role==="admin"?"selected":""}>Admin</option><option value="user" ${u.role==="user"?"selected":""}>User</option></select>${u.enabled?'<span class="badge badge-green">啟用</span>':'<span class="badge badge-red">停用</span>'}</div></div><div class="maintenance-actions"><button class="btn btn-gray" onclick="toggleUser('${u.id}',${!!u.enabled})">${u.enabled?'停用':'啟用'}</button><button class="btn btn-red" onclick="deleteUser('${u.id}')">刪除</button></div></div>`).join("")}
async function addWhitelistUser(){if(blockUserAdminAction())return;const email=$("newUserEmail").value.trim();if(!email){alert("請輸入 Email");return}const ref=await addDoc(collection(db,"users"),{email,role:"user",enabled:true});await writeAuditLog({action:"permission",category:"user",targetId:ref.id,targetLabel:email,after:{email,role:"user",enabled:true}});$("newUserEmail").value="";await loadUsers()} window.addWhitelistUser=addWhitelistUser;
async function changeRole(id,role){if(blockUserAdminAction())return;const u=userList.find(x=>x.id===id);await updateDoc(doc(db,"users",id),{role});await writeAuditLog({action:"permission",category:"user",targetId:id,targetLabel:u?.email,before:u,after:{...u,role}});await loadUsers()} window.changeRole=changeRole;
async function toggleUser(id,enabled){if(blockUserAdminAction())return;const u=userList.find(x=>x.id===id);await updateDoc(doc(db,"users",id),{enabled:!enabled});await writeAuditLog({action:"permission",category:"user",targetId:id,targetLabel:u?.email,before:u,after:{...u,enabled:!enabled}});await loadUsers()} window.toggleUser=toggleUser;
async function deleteUser(id){if(blockUserAdminAction())return;const u=userList.find(x=>x.id===id);if(u?.role==="admin"){alert("管理員不可刪除");return}if(!confirm("確定刪除使用者？"))return;await deleteDoc(doc(db,"users",id));await writeAuditLog({action:"permission",category:"user",targetId:id,targetLabel:u?.email,before:u,after:{deleted:true}});await loadUsers()} window.deleteUser=deleteUser;

async function loadAuditLogs(){if(!canAdmin())return;const snap=await getDocs(collection(db,"mailAuditLogs"));auditLogs=[];snap.forEach(s=>auditLogs.push({id:s.id,...s.data()}));auditLogs.sort((a,b)=>getTime(b.createdAt)-getTime(a.createdAt));renderAuditLogs()} window.loadAuditLogs=loadAuditLogs;
function renderAuditLogs(){const kw=($("auditSearch")?.value||"").toLowerCase(),act=$("auditActionFilter")?.value||"";const rows=auditLogs.filter(l=>(!act||l.action===act)&&(!kw||[l.actorName,l.actorEmail,l.targetLabel,JSON.stringify(l.after||{}),JSON.stringify(l.before||{})].join(" ").toLowerCase().includes(kw)));$("auditCount").textContent=`(${rows.length}筆)`;if($("auditPaginationCount"))$("auditPaginationCount").textContent=rows.length;const total=Math.ceil(rows.length/auditPageSize)||1;if(auditCurrentPage>total)auditCurrentPage=1;const page=rows.slice((auditCurrentPage-1)*auditPageSize,auditCurrentPage*auditPageSize);$("auditLogTable").innerHTML=page.length?page.map(l=>`<tr><td>${esc(formatDate(l.createdAt))}</td><td>${esc(l.actorName||"-")}<div style="font-size:11px;color:#94a3b8">${esc(l.actorEmail||"")}</div></td><td>${esc(l.actorRole||"-")}</td><td><span class="badge badge-blue">${esc(actionLabel(l.action))}</span></td><td>${esc(categoryLabel(l.category))}</td><td>${esc(l.targetLabel||l.targetId||"-")}</td><td class="audit-detail">${esc(auditSummary(l))}</td></tr>`).join(""):`<tr><td colspan="7">目前沒有操作紀錄</td></tr>`;renderSimplePagination("auditPagination",total,auditCurrentPage,p=>{auditCurrentPage=p;renderAuditLogs()})}
function actionLabel(a){return {create:"新增",update:"修改",delete:"刪除",print:"列印",reprint:"補印",permission:"權限異動",login:"登入"}[a]||a||"-"}function categoryLabel(c){return {mailRecord:"收件資料",outgoingMailRecord:"一般寄件",outgoingMailBatch:"大宗寄件",department:"部門",mailType:"郵件類型",user:"使用者權限",signSheet:"簽收單"}[c]||c||"-"}function auditSummary(l){const o=l.after||l.before||{};return Object.entries(o).filter(([k])=>!["createdTime","printedAt","items"].includes(k)).map(([k,v])=>`${k}:${v}`).join("；")||"-"}
function changeAuditPageSize(){auditPageSize=parseInt($("auditPageSize").value);auditCurrentPage=1;renderAuditLogs()} window.changeAuditPageSize=changeAuditPageSize;function resetAuditFilter(){$("auditSearch").value="";$("auditActionFilter").value="";auditCurrentPage=1;renderAuditLogs()} window.resetAuditFilter=resetAuditFilter;
async function loadLoginLogs(){if(!canAdmin())return;const snap=await getDocs(collection(db,"mailLoginLogs"));loginLogs=[];snap.forEach(s=>loginLogs.push({id:s.id,...s.data()}));loginLogs.sort((a,b)=>getTime(b.loginTime)-getTime(a.loginTime));renderLoginLogs()} window.loadLoginLogs=loadLoginLogs;
function renderLoginLogs(){const total=Math.ceil(loginLogs.length/loginPageSize)||1;if(loginCurrentPage>total)loginCurrentPage=1;const page=loginLogs.slice((loginCurrentPage-1)*loginPageSize,loginCurrentPage*loginPageSize);$("loginCount").textContent=`(${loginLogs.length}筆)`;if($("loginPaginationCount"))$("loginPaginationCount").textContent=loginLogs.length;$("loginLogTable").innerHTML=page.length?page.map(l=>`<tr><td>${esc(formatDate(l.loginTime))}</td><td>${esc(l.name||"-")}</td><td>${esc(l.email||"-")}</td><td>${esc(l.role||"-")}</td></tr>`).join(""):`<tr><td colspan="4">目前沒有登入紀錄</td></tr>`;renderSimplePagination("loginPagination",total,loginCurrentPage,p=>{loginCurrentPage=p;renderLoginLogs()})}
function changeLoginPageSize(){loginPageSize=parseInt($("loginPageSize").value);loginCurrentPage=1;renderLoginLogs()} window.changeLoginPageSize=changeLoginPageSize;
function renderSimplePagination(id,total,current,cb){renderCompactPagination(id,total,current,cb)}

["searchInput","typeFilter","outgoingSourceFilter","deptFilter","printedFilter","dateStart","dateEnd"].forEach(id=>document.addEventListener("input",e=>{if(e.target?.id===id){currentPage=1;renderMailTable()}}));document.addEventListener("change",e=>{if(e.target?.id==="directionFilter"){["typeFilter","outgoingSourceFilter","deptFilter","printedFilter"].forEach(id=>$(id).value="")}if(["directionFilter","typeFilter","outgoingSourceFilter","deptFilter","printedFilter","dateStart","dateEnd"].includes(e.target?.id)){currentPage=1;renderMailTable()}if(["auditSearch","auditActionFilter"].includes(e.target?.id)){auditCurrentPage=1;renderAuditLogs()}});
async function googleLogin(){try{await signInWithPopup(auth,provider)}catch(e){alert(e.message)}} window.googleLogin=googleLogin;
async function logout(){sessionStorage.removeItem("mailLoginLogged");localStorage.removeItem("mailUserRole");localStorage.removeItem("mailUserEmail");localStorage.removeItem("mailUserName");await signOut(auth)} window.logout=logout;

onAuthStateChanged(auth,async(user)=>{if(!user){$("loginPage").style.display="flex";$("systemArea").style.display="none";return}const snap=await getDocs(collection(db,"users"));let allow=false,found=null;snap.forEach(s=>{const d=s.data();if(d.email===user.email&&d.enabled===true){allow=true;found=d}});if(!allow){alert("此帳號未開通");await signOut(auth);return}currentRole=found.role||"user";currentUser=user.displayName||user.email;currentUserEmail=user.email;localStorage.setItem("mailUserRole",currentRole);localStorage.setItem("mailUserEmail",user.email);localStorage.setItem("mailUserName",currentUser);if(!sessionStorage.getItem("mailLoginLogged")){await addDoc(collection(db,"mailLoginLogs"),{name:currentUser,email:user.email,role:currentRole,loginTime:new Date()});sessionStorage.setItem("mailLoginLogged","true")}$("sidebarUserName").textContent=currentUser;$("sidebarUserEmail").textContent=user.email;$("loginPage").style.display="none";try{await Promise.all([loadDepartments(),loadMailTypes()]);await Promise.all([loadUsers(),loadMailRecords(),loadOutgoingBatches(),loadLoginLogs()]);}catch(error){console.error("系統初始化部分資料載入失敗",error);alert("系統資料載入失敗：" + (error?.message || error));}applyRoleAccess();restoreLastPage();$("systemArea").style.display="block";requestAnimationFrame(()=>$("systemArea").style.opacity="1");resetMailForm();prepareGeneralOutgoingPage();prepareOutgoingPage();if(window.lucide)lucide.createIcons();});
})();
