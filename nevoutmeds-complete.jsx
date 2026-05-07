import { useState, useEffect } from "react";

// ================================================================
// NEVOUTMEDS — Full Platform v2
// Inventory · Customers · Financials · Suppliers · Staff · Reminders
// Role-based: Owner (full) | Staff (operational)
// Built for Liberian pharmacy pilots — phone as unique ID
// ================================================================

const FONT = "'Sora', system-ui, sans-serif";
const GREEN = "#10b981"; const DARK = "#020617"; const SLATE = "#0f172a";

// ── Liberia Geography ────────────────────────────────────────
const LR_COMMUNITIES = ["Sinkor","Congo Town","Paynesville","Duala Market","New Kru Town","Clara Town","Logan Town","New Georgia","Gardnersville","Brewerville","Caldwell","Virginia","Barnersville","Red Light","Broad Street","Waterside","Mamba Point","Kakata Town","Gbarnga","Buchanan","Harper","Voinjama","Sanniquellie","Zwedru","Tubmanburg"];
const LR_COUNTIES = ["Montserrado","Margibi","Grand Bassa","Nimba","Bong","Lofa","Grand Cape Mount","Sinoe","Maryland","River Cess","Gbarpolu","Grand Gedeh","River Gee","Bomi","Grand Kru"];

// ── Seed Data ────────────────────────────────────────────────
const USERS = {
  owner: { id:1, name:"John Kamara", role:"owner", pharmacy:"Monrovia Central Pharmacy" },
  staff: { id:2, name:"Fatu Williams", role:"staff", pharmacy:"Monrovia Central Pharmacy" },
};

const MEDICINES = [
  { id:1, name:"Paracetamol 500mg", brand:"Panadol", category:"Analgesics", stock:4, reorderPoint:10, maxStock:100, dailyVelocity:3.2, unitCost:0.25, sellingPrice:0.50, unit:"tablets", batchId:"PAR-2025-001", expiryDate:"2026-12-31", supplierId:1, isEssential:true, requiresPrescription:false, movements:[-3,-4,-2,-3,-5,-2,-3] },
  { id:2, name:"Amoxicillin 250mg", brand:"Amoxil", category:"Antibiotics", stock:45, reorderPoint:15, maxStock:80, dailyVelocity:1.8, unitCost:1.50, sellingPrice:3.00, unit:"capsules", batchId:"AMX-2025-002", expiryDate:"2026-08-31", supplierId:1, isEssential:true, requiresPrescription:true, movements:[-2,-1,-2,-2,-1,-3,-1] },
  { id:3, name:"Artemether 20mg", brand:"Coartem", category:"Antimalarials", stock:8, reorderPoint:20, maxStock:120, dailyVelocity:4.1, unitCost:2.80, sellingPrice:5.50, unit:"tablets", batchId:"ART-2025-003", expiryDate:"2025-05-15", supplierId:2, isEssential:true, requiresPrescription:true, movements:[-4,-5,-3,-4,-6,-4,-3] },
  { id:4, name:"Ibuprofen 400mg", brand:"Brufen", category:"Anti-inflammatory", stock:62, reorderPoint:12, maxStock:60, dailyVelocity:2.1, unitCost:0.75, sellingPrice:1.50, unit:"tablets", batchId:"IBU-2025-004", expiryDate:"2025-04-30", supplierId:1, isEssential:true, requiresPrescription:false, movements:[-2,-3,-1,-2,-2,-2,-3] },
  { id:5, name:"ORS Sachets", brand:"WHO-ORS", category:"Rehydration", stock:120, reorderPoint:30, maxStock:200, dailyVelocity:5.5, unitCost:0.15, sellingPrice:0.35, unit:"sachets", batchId:"ORS-2025-005", expiryDate:"2027-03-31", supplierId:2, isEssential:true, requiresPrescription:false, movements:[-6,-5,-7,-4,-6,-5,-6] },
  { id:6, name:"Metformin 500mg", brand:"Glucophage", category:"Diabetes", stock:28, reorderPoint:20, maxStock:80, dailyVelocity:2.8, unitCost:0.90, sellingPrice:1.80, unit:"tablets", batchId:"MET-2025-006", expiryDate:"2026-11-30", supplierId:1, isEssential:true, requiresPrescription:true, movements:[-3,-2,-3,-3,-2,-3,-3] },
  { id:7, name:"Zinc Sulfate 20mg", brand:"Zinc-ORS", category:"Supplements", stock:3, reorderPoint:15, maxStock:80, dailyVelocity:3.0, unitCost:0.20, sellingPrice:0.45, unit:"tablets", batchId:"ZNC-2025-007", expiryDate:"2026-06-30", supplierId:2, isEssential:true, requiresPrescription:false, movements:[-3,-3,-3,-2,-3,-3,-3] },
  { id:8, name:"Chloroquine 150mg", brand:"Nivaquine", category:"Antimalarials", stock:35, reorderPoint:25, maxStock:100, dailyVelocity:1.5, unitCost:0.60, sellingPrice:1.20, unit:"tablets", batchId:"CLQ-2025-008", expiryDate:"2026-09-30", supplierId:1, isEssential:true, requiresPrescription:true, movements:[-2,-1,-2,-1,-2,-1,-2] },
];

const SUPPLIER_DATA = [
  { id:1, name:"MedSupply West Africa", country:"Liberia", city:"Monrovia", phone:"+231-88-555-0001", whatsapp:"+231885550001", email:"orders@medsupplywa.com", leadDays:2, rating:4.8, reviews:47, onTimeRate:96, verified:true, minOrder:50, returnPolicy:"30 days", paymentTerms:"Net 14", deliveryZones:["Montserrado","Margibi","Grand Bassa"], catalogue:[
    { medicineId:1, price:0.22, stock:"In stock", moq:50 },
    { medicineId:2, price:1.40, stock:"In stock", moq:21 },
    { medicineId:4, price:0.68, stock:"In stock", moq:30 },
    { medicineId:6, price:0.82, stock:"In stock", moq:30 },
    { medicineId:8, price:0.55, stock:"In stock", moq:20 },
  ], orders:[
    { date:"2026-04-10", items:"Paracetamol x100, Amoxicillin x42", total:185, status:"delivered", deliveredIn:2 },
    { date:"2026-03-22", items:"Metformin x60, Chloroquine x40", total:116, status:"delivered", deliveredIn:1 },
    { date:"2026-03-05", items:"Ibuprofen x60", total:49, status:"delivered", deliveredIn:2 },
  ]},
  { id:2, name:"PharmaCorp International", country:"Sierra Leone", city:"Freetown", phone:"+232-76-555-0002", whatsapp:"+232765550002", email:"sales@pharmacorp.sl", leadDays:5, rating:4.3, reviews:29, onTimeRate:88, verified:true, minOrder:100, returnPolicy:"14 days", paymentTerms:"Net 7", deliveryZones:["Montserrado","Margibi"], catalogue:[
    { medicineId:1, price:0.26, stock:"In stock", moq:100 },
    { medicineId:3, price:2.60, stock:"In stock", moq:24 },
    { medicineId:5, price:0.13, stock:"In stock", moq:50 },
    { medicineId:7, price:0.18, stock:"In stock", moq:40 },
  ], orders:[
    { date:"2026-04-01", items:"Artemether x48, ORS x100", total:138, status:"delivered", deliveredIn:4 },
    { date:"2026-02-14", items:"Zinc x80, ORS x50", total:22, status:"delivered", deliveredIn:6 },
  ]},
  { id:3, name:"HealthBridge Distributors", country:"Ghana", city:"Accra", phone:"+233-30-555-0003", whatsapp:"+233305550003", email:"info@healthbridge.gh", leadDays:8, rating:4.6, reviews:18, onTimeRate:92, verified:true, minOrder:200, returnPolicy:"7 days", paymentTerms:"Prepaid", deliveryZones:["Montserrado"], catalogue:[
    { medicineId:2, price:1.30, stock:"Limited", moq:42 },
    { medicineId:3, price:2.45, stock:"In stock", moq:48 },
    { medicineId:6, price:0.78, stock:"In stock", moq:60 },
    { medicineId:7, price:0.16, stock:"In stock", moq:80 },
  ], orders:[]},
];

const CUSTOMERS_SEED = [
  { id:1, phone:"+231771234001", firstName:"Mary", lastName:"Johnson", dob:"1985-03-15", gender:"Female", community:"Old Road, Sinkor", landmark:"Opposite St. Teresa's Church", county:"Montserrado", altPhone:"+231881234001", altName:"Thomas Johnson (husband)", registeredAt:"2025-08-10", totalSpend:124.50, visitCount:18, lastVisit:"2026-04-20", creditBalance:12.00, creditLimit:50, conditions:["Hypertension","Diabetes"], allergies:["Penicillin"], notes:"Comes every 2 weeks for Metformin refill.", reminders:[{ medicine:"Metformin 500mg", dueDate:"2026-05-05", sent:false }], purchases:[{ date:"2026-04-20", items:"Metformin 500mg x30", amount:54.00, method:"Cash", staffId:2 },{ date:"2026-04-05", items:"Paracetamol x20, ORS x5", amount:11.75, method:"Mobile Money", staffId:2 },{ date:"2026-03-18", items:"Amoxicillin 250mg x21", amount:63.00, method:"Credit", staffId:1 }] },
  { id:2, phone:"+231881234002", firstName:"James", lastName:"Kollie", dob:"1992-07-22", gender:"Male", community:"Kakata Town", landmark:"Near the market junction", county:"Margibi", altPhone:"", altName:"", registeredAt:"2025-10-03", totalSpend:87.20, visitCount:9, lastVisit:"2026-04-18", creditBalance:0, creditLimit:30, conditions:["Malaria (recurring)"], allergies:[], notes:"Travels from Kakata. Buys in bulk.", reminders:[], purchases:[{ date:"2026-04-18", items:"Artemether 20mg x6", amount:33.00, method:"Mobile Money", staffId:2 },{ date:"2026-03-30", items:"Paracetamol x40", amount:20.00, method:"Cash", staffId:2 }] },
  { id:3, phone:"+231771234003", firstName:"Comfort", lastName:"Teah", dob:"1978-11-08", gender:"Female", community:"Congo Town", landmark:"Behind the Mandingo mosque", county:"Montserrado", altPhone:"+231551234003", altName:"Blessing Teah (daughter)", registeredAt:"2025-07-22", totalSpend:213.00, visitCount:31, lastVisit:"2026-04-21", creditBalance:35.50, creditLimit:80, conditions:["Asthma","Hypertension"], allergies:["Aspirin","Ibuprofen"], notes:"Severe Ibuprofen allergy — always verify NSAIDs.", reminders:[{ medicine:"Chloroquine 150mg", dueDate:"2026-04-28", sent:false }], purchases:[{ date:"2026-04-21", items:"Metformin x30, Chloroquine x20", amount:78.00, method:"Credit", staffId:1 },{ date:"2026-04-10", items:"ORS x10, Zinc x20", amount:12.50, method:"Cash", staffId:2 }] },
  { id:4, phone:"+231551234004", firstName:"David", lastName:"Sirleaf", dob:"2001-05-14", gender:"Male", community:"Paynesville", landmark:"Red Light, near Total gas station", county:"Montserrado", altPhone:"", altName:"", registeredAt:"2026-01-15", totalSpend:44.80, visitCount:5, lastVisit:"2026-04-15", creditBalance:0, creditLimit:20, conditions:[], allergies:[], notes:"", reminders:[], purchases:[{ date:"2026-04-15", items:"Paracetamol x20, Ibuprofen x10", amount:25.00, method:"Cash", staffId:2 }] },
  { id:5, phone:"+231881234005", firstName:"Agnes", lastName:"Freeman", dob:"1968-09-30", gender:"Female", community:"Broad Street", landmark:"Near old Executive Mansion gate", county:"Montserrado", altPhone:"+231771234005", altName:"Samuel Freeman (son)", registeredAt:"2025-06-01", totalSpend:356.00, visitCount:42, lastVisit:"2026-04-22", creditBalance:0, creditLimit:100, conditions:["Type 2 Diabetes","Hypertension","Arthritis"], allergies:[], notes:"Long-standing customer. Son sometimes collects.", reminders:[{ medicine:"Metformin 500mg", dueDate:"2026-04-27", sent:false }], purchases:[{ date:"2026-04-22", items:"Metformin x60, Ibuprofen x30", amount:99.00, method:"Mobile Money", staffId:1 },{ date:"2026-04-01", items:"Metformin x60", amount:108.00, method:"Cash", staffId:2 }] },
];

const STAFF_DATA = [
  { id:1, name:"John Kamara", role:"owner", phone:"+231771234100", since:"2024-01-01", sales:[240,210,195,265,230,188,310], transactions:[18,14,12,19,16,13,22], avgSale:[13.3,15.0,16.3,13.9,14.4,14.5,14.1] },
  { id:2, name:"Fatu Williams", role:"staff", phone:"+231881234101", since:"2024-06-15", sales:[185,200,175,195,210,165,220], transactions:[14,16,12,15,17,12,18], avgSale:[13.2,12.5,14.6,13.0,12.4,13.8,12.2] },
  { id:3, name:"Emmanuel Cooper", role:"staff", phone:"+231551234102", since:"2025-02-10", sales:[120,145,130,110,155,140,168], transactions:[9,11,10,8,12,10,13], avgSale:[13.3,13.2,13.0,13.8,12.9,14.0,12.9] },
];

const FINANCIALS = {
  revenue:{ mtd:4820, last30:[142,165,138,190,175,210,188,165,220,195,180,205,175,190,210,188,165,220,245,190,205,180,195,215,188,230,210,195,220,240], ytd:18640, lastYear:15200 },
  expenses:{ mtd:2140, categories:[{ name:"Supplier Payments", amount:1420, pct:66 },{ name:"Staff Wages", amount:380, pct:18 },{ name:"Rent & Utilities", amount:220, pct:10 },{ name:"Other", amount:120, pct:6 }] },
  debt:{ total:2800, breakdown:[
    { supplier:"MedSupply West Africa", amount:1800, dueDate:"2026-05-10", interest:0, status:"current", daysOverdue:0 },
    { supplier:"PharmaCorp International", amount:650, dueDate:"2026-04-28", interest:2.5, status:"due-soon", daysOverdue:0 },
    { supplier:"Local Distributor Ltd", amount:350, dueDate:"2026-04-15", interest:5.0, status:"overdue", daysOverdue:7 },
  ]},
  profit:{ mtd:2680, margin:55.6 },
  cashflow:{ current:3240, projected30:4100, weekly:[2100,2450,2800,3240], inflows:[{ label:"Sales (est.)", amount:4820 },{ label:"Credit Collections", amount:350 }], outflows:[{ label:"Supplier Debt Due", amount:650 },{ label:"Wages", amount:380 },{ label:"Rent", amount:220 },{ label:"Other", amount:120 }] },
};

// ── Utilities ────────────────────────────────────────────────
const daysUntilExpiry = d => Math.ceil((new Date(d)-new Date())/86400000);
const daysUntilStockout = (s,v) => v<=0?999:Math.floor(s/v);
const fmt = (n,d=2) => `$${Number(n).toFixed(d)}`;
const fmtK = n => n>=1000?`$${(n/1000).toFixed(1)}k`:fmt(n,0);

function getStockStatus(m) {
  const exp=daysUntilExpiry(m.expiryDate);
  if(m.stock<=m.reorderPoint*0.4) return "critical";
  if(exp<=14) return "expiring";
  if(m.stock<=m.reorderPoint) return "low";
  if(m.stock>m.maxStock*0.9) return "overstock";
  return "healthy";
}
const STATUS={critical:{label:"Critical",color:"#ef4444",bg:"#fef2f2",border:"#fecaca",priority:0},expiring:{label:"Expiring",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",priority:1},low:{label:"Low Stock",color:"#f97316",bg:"#fff7ed",border:"#fed7aa",priority:2},overstock:{label:"Overstock",color:"#8b5cf6",bg:"#f5f3ff",border:"#ddd6fe",priority:3},healthy:{label:"Healthy",color:"#10b981",bg:"#f0fdf4",border:"#bbf7d0",priority:4}};

// ── Mini Components ──────────────────────────────────────────
function Avatar({name,size=32,bg=GREEN}){const i=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();return(<div style={{width:size,height:size,borderRadius:"50%",background:bg,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.36,fontWeight:800,flexShrink:0,fontFamily:FONT}}>{i}</div>);}
function Badge({status}){const s=STATUS[status];return(<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:99,background:s.bg,border:`1px solid ${s.border}`,color:s.color,fontSize:11,fontWeight:700,fontFamily:FONT}}><span style={{width:5,height:5,borderRadius:"50%",background:s.color}}/>{s.label}</span>);}
function BarChart({data,color=GREEN,height=48}){const max=Math.max(...data);return(<div style={{display:"flex",alignItems:"flex-end",gap:2,height}}>{data.map((v,i)=>(<div key={i} style={{flex:1,background:i===data.length-1?color:`${color}50`,borderRadius:"3px 3px 0 0",height:`${(v/max)*100}%`,minHeight:3}}/>))}</div>);}
function Sparkline({data,color,h=28,w=60}){const max=Math.max(...data),min=Math.min(...data),r=max-min||1,p=2;const pts=data.map((v,i)=>{const x=p+(i/(data.length-1))*(w-p*2),y=h-p-((v-min)/r)*(h-p*2);return`${x},${y}`;}).join(" ");return(<svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>{data.map((v,i)=>{const x=p+(i/(data.length-1))*(w-p*2),y=h-p-((v-min)/r)*(h-p*2);return <circle key={i} cx={x} cy={y} r={i===data.length-1?2.5:1.5} fill={color} opacity={i===data.length-1?1:0.4}/>;})}</svg>);}
function StockBar({stock,reorderPoint,maxStock,status}){const pct=Math.min((stock/maxStock)*100,100),rp=(reorderPoint/maxStock)*100;return(<div style={{position:"relative",height:5,background:"#f1f5f9",borderRadius:99,overflow:"visible"}}><div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,background:STATUS[status].color,borderRadius:99}}/><div style={{position:"absolute",top:-3,height:11,width:2,background:"#94a3b8",borderRadius:1,left:`${rp}%`,transform:"translateX(-50%)"}}/></div>);}

function Modal({open,onClose,children,maxW=500}){if(!open)return null;return(<div style={{position:"fixed",inset:0,background:"rgba(2,8,23,0.65)",backdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}><div style={{background:"#fff",borderRadius:20,padding:32,width:"100%",maxWidth:maxW,boxShadow:"0 32px 80px #00000030",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{children}</div></div>);}
function Toast({toast}){if(!toast)return null;const c={success:"#065f46",error:"#7f1d1d",info:"#1e3a5f",warning:"#78350f"};return(<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:c[toast.type]||c.success,color:"#fff",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:600,zIndex:300,whiteSpace:"nowrap",boxShadow:"0 8px 32px #00000030",display:"flex",alignItems:"center",gap:8,fontFamily:FONT,animation:"slideUp 0.3s ease"}}>{toast.type==="success"?"✓":toast.type==="error"?"✕":"ℹ"} {toast.msg}</div>);}

function Field({label,children,full}){return(<div style={full?{gridColumn:"1/-1"}:{}}><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>{label}</label>{children}</div>);}
function Input({value,onChange,placeholder,type="text",style={}}){return(<input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box",...style}}/>);}
function SectionHead({label}){return(<div style={{fontSize:11,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,marginTop:6,paddingBottom:6,borderBottom:"1px solid #f0fdf4"}}>{label}</div>);}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen({onLogin}){
  const [role,setRole]=useState("owner");
  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg, ${DARK} 0%, #0c1a2e 50%, #064e3b 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:FONT,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 50%, #10b98115 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f615 0%, transparent 50%)",pointerEvents:"none"}}/>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#10b981,#059669)",boxShadow:"0 8px 24px #10b98140",marginBottom:16}}><span style={{fontSize:26,fontWeight:900,color:"#fff"}}>N</span></div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-0.03em"}}>Nevoutmeds</div>
          <div style={{fontSize:13,color:"#6ee7b7",marginTop:4,fontWeight:500}}>Never out of stock. Always ready.</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:18,padding:28,backdropFilter:"blur(10px)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:16}}>Monrovia Central Pharmacy</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
            {["owner","staff"].map(r=>(<button key={r} onClick={()=>setRole(r)} style={{padding:"12px",borderRadius:10,border:`1.5px solid ${role===r?"#10b981":"rgba(255,255,255,0.15)"}`,background:role===r?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.04)",color:role===r?"#6ee7b7":"#94a3b8",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,transition:"all 0.2s"}}>{r==="owner"?"👤 Owner":"🏥 Staff"}</button>))}
          </div>
          <div style={{fontSize:11,color:"#475569",textAlign:"center",marginBottom:18}}>{role==="owner"?"Full access including financials & staff data":"Operational access — inventory, customers, suppliers"}</div>
          <button onClick={()=>onLogin(USERS[role])} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:FONT,boxShadow:"0 4px 16px #10b98140"}}>Sign In →</button>
        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#334155"}}>Liberia Pilot v2.0 · Secured & Encrypted</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function DashboardScreen({user,medicines,customers,onNavigate,onShowToast}){
  const enriched=medicines.map(m=>({...m,status:getStockStatus(m)}));
  const alerts=enriched.filter(m=>["critical","low","expiring"].includes(m.status));
  const totalValue=enriched.reduce((s,m)=>s+m.stock*m.unitCost,0);
  const creditOut=customers.reduce((s,c)=>s+c.creditBalance,0);
  const dueReminders=customers.filter(c=>c.reminders.some(r=>!r.sent));
  const overdueDebt=FINANCIALS.debt.breakdown.filter(d=>d.status==="overdue");
  const cashShortfall=FINANCIALS.cashflow.inflows.reduce((s,i)=>s+i.amount,0)-FINANCIALS.cashflow.outflows.reduce((s,o)=>s+o.amount,0);
  const hour=new Date().getHours();
  const greeting=hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";

  // Daily WhatsApp summary preview
  const waSummary=`*Nevoutmeds Daily Report — ${user.pharmacy}*\n📅 Wed 22 April 2026\n\n💰 Sales today: $240\n📦 Items dispensed: 47\n👥 Customers: 31 (4 new)\n⚠ Low stock: ${alerts.filter(a=>a.status!=="expiring").length} items\n💳 Credit outstanding: ${fmt(creditOut)}\n🔔 Reminders due: ${dueReminders.length} patients\n\n_Reply REPORT for full details_`;

  const kpis=[
    {label:"Today's Revenue",value:"$240",sub:"↑ 12% vs yesterday",color:"#10b981",icon:"💰",screen:null},
    {label:"Stock Alerts",value:alerts.length,sub:`${alerts.filter(a=>a.status==="critical").length} critical`,color:alerts.length>0?"#ef4444":"#10b981",icon:"📦",screen:"inventory"},
    {label:"Reminders Due",value:dueReminders.length,sub:"patients need refills",color:dueReminders.length>0?"#f59e0b":"#10b981",icon:"🔔",screen:"reminders"},
    {label:"Credit Out",value:fmt(creditOut),sub:`${customers.filter(c=>c.creditBalance>0).length} customers`,color:creditOut>50?"#f97316":"#10b981",icon:"💳",screen:"customers"},
    ...(user.role==="owner"?[
      {label:"Monthly Revenue",value:fmtK(FINANCIALS.revenue.mtd),sub:"↑ 22% vs last year",color:"#10b981",icon:"📈",screen:"financials"},
      {label:"Debt Warning",value:overdueDebt.length>0?"OVERDUE":"On Track",sub:overdueDebt.length>0?`${fmt(overdueDebt.reduce((s,d)=>s+d.amount,0))} overdue`:"All payments current",color:overdueDebt.length>0?"#ef4444":"#10b981",icon:"🏦",screen:"financials"},
    ]:[]),
  ];

  return(
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:24,fontWeight:800,color:SLATE,letterSpacing:"-0.03em"}}>{greeting}, {user.name.split(" ")[0]} 👋</div>
        <div style={{fontSize:13,color:"#64748b",marginTop:3}}>Wednesday, 22 April 2026 · Here's what matters today</div>
      </div>

      {/* KPI Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:14,marginBottom:24}}>
        {kpis.map((k,i)=>(<div key={i} onClick={()=>k.screen&&onNavigate(k.screen)} style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid #e2e8f0",boxShadow:"0 1px 3px #0000000a",cursor:k.screen?"pointer":"default",transition:"all 0.15s",position:"relative",overflow:"hidden",animation:`fadeUp 0.4s ${i*0.05}s both"}`}} onMouseEnter={e=>{if(k.screen)e.currentTarget.style.boxShadow="0 4px 16px #0000001a";}} onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px #0000000a";}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:k.color,borderRadius:"14px 14px 0 0"}}/>
          <div style={{fontSize:20,marginBottom:6}}>{k.icon}</div>
          <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{k.label}</div>
          <div style={{fontSize:24,fontWeight:900,color:k.color,letterSpacing:"-0.04em",lineHeight:1}}>{k.value}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{k.sub}</div>
        </div>))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:user.role==="owner"?"1fr 1fr":"1fr",gap:20,marginBottom:20}}>
        {/* Priority Actions */}
        <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px"}}>
          <div style={{fontSize:14,fontWeight:800,color:SLATE,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>Priority Actions {alerts.length>0&&<span style={{background:"#fef2f2",color:"#ef4444",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{alerts.length}</span>}</div>
          {alerts.length===0?(<div style={{textAlign:"center",padding:"20px",color:"#94a3b8"}}><div style={{fontSize:20,marginBottom:6}}>✓</div><div style={{fontSize:13,fontWeight:600}}>All stock levels healthy</div></div>):alerts.slice(0,4).map(item=>(<div key={item.id} onClick={()=>onNavigate("inventory")} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #f1f5f9",cursor:"pointer"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:STATUS[item.status].color,flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{item.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{item.status==="expiring"?`Expires in ${daysUntilExpiry(item.expiryDate)} days`:`${item.stock} units · ${daysUntilStockout(item.stock,item.dailyVelocity)}d left`}</div></div>
            <Badge status={item.status}/>
          </div>))}
          {alerts.length>4&&<button onClick={()=>onNavigate("inventory")} style={{width:"100%",marginTop:10,padding:"9px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>View all {alerts.length} alerts →</button>}
        </div>

        {/* Revenue Chart */}
        {user.role==="owner"&&(<div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:800,color:SLATE}}>Revenue — Last 30 Days</div>
            <div style={{fontSize:18,fontWeight:900,color:GREEN}}>{fmtK(FINANCIALS.revenue.mtd)}</div>
          </div>
          <BarChart data={FINANCIALS.revenue.last30} color={GREEN} height={68}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:14}}>
            {[{l:"Profit",v:fmtK(FINANCIALS.profit.mtd),c:"#10b981"},{l:"Margin",v:`${FINANCIALS.profit.margin}%`,c:"#3b82f6"},{l:"Expenses",v:fmtK(FINANCIALS.expenses.mtd),c:"#f97316"}].map((s,i)=>(<div key={i} style={{textAlign:"center",padding:"9px",background:"#f8fafc",borderRadius:9}}>
              <div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:600,textTransform:"uppercase"}}>{s.l}</div>
            </div>))}
          </div>
        </div>)}
      </div>

      {/* Reminders Due + WhatsApp Summary (side by side) */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:800,color:SLATE}}>🔔 Refill Reminders Due</div>
            <button onClick={()=>onNavigate("reminders")} style={{fontSize:12,fontWeight:700,color:GREEN,background:"none",border:"none",cursor:"pointer",fontFamily:FONT}}>View all →</button>
          </div>
          {dueReminders.length===0?(<div style={{fontSize:13,color:"#94a3b8",textAlign:"center",padding:"16px"}}>No reminders due this week ✓</div>):dueReminders.slice(0,3).map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
            <Avatar name={`${c.firstName} ${c.lastName}`} size={32} bg={`hsl(${c.id*60},60%,50%)`}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{c.firstName} {c.lastName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{c.reminders[0]?.medicine} · Due {c.reminders[0]?.dueDate}</div></div>
            <span style={{fontSize:10,fontWeight:700,color:"#25D366",background:"#f0fdf4",padding:"3px 8px",borderRadius:99}}>WhatsApp</span>
          </div>))}
        </div>

        <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px"}}>
          <div style={{fontSize:14,fontWeight:800,color:SLATE,marginBottom:14}}>📲 Daily WhatsApp Summary</div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"12px 14px",border:"1px solid #bbf7d0",fontFamily:"monospace",fontSize:11,color:"#065f46",lineHeight:1.8,marginBottom:14,whiteSpace:"pre-line"}}>{waSummary}</div>
          <button onClick={()=>onShowToast("Daily summary sent to +231771234100 ✓","success")} style={{width:"100%",padding:"10px",borderRadius:9,border:"none",background:"#25D366",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Send Now via WhatsApp</button>
        </div>
      </div>

      {/* Cash Flow Warning (owner only) */}
      {user.role==="owner"&&(<div style={{background:cashShortfall<0?"#fef2f2":"#f0fdf4",border:`1px solid ${cashShortfall<0?"#fecaca":"#bbf7d0"}`,borderRadius:14,padding:"18px 22px",display:"flex",alignItems:"center",gap:16}}>
        <div style={{fontSize:28}}>{cashShortfall<0?"⚠️":"✓"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:800,color:cashShortfall<0?"#7f1d1d":"#065f46"}}>Cash Flow {cashShortfall<0?"Warning":"Healthy"}</div>
          <div style={{fontSize:12,color:cashShortfall<0?"#b45309":"#047857",marginTop:2}}>
            {cashShortfall<0?`Projected shortfall of ${fmt(Math.abs(cashShortfall))} in next 30 days. Collect credit from 3 customers to bridge the gap.`:`Projected surplus of ${fmt(cashShortfall)} in next 30 days. You're on track.`}
          </div>
        </div>
        {cashShortfall<0&&<button onClick={()=>onNavigate("financials")} style={{padding:"8px 16px",borderRadius:8,border:"1.5px solid #fca5a5",background:"#fff",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>View Details</button>}
      </div>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// INVENTORY (condensed but complete)
// ═══════════════════════════════════════════════════════════
function InventoryScreen({medicines,setMedicines,onShowToast}){
  const [search,setSearch]=useState("");const [filter,setFilter]=useState("all");const [sort,setSort]=useState("priority");const [adjustItem,setAdjustItem]=useState(null);const [reorderItem,setReorderItem]=useState(null);const [adjustQty,setAdjustQty]=useState(0);const [adjustNote,setAdjustNote]=useState("");
  const enriched=medicines.map(m=>({...m,status:getStockStatus(m),expDays:daysUntilExpiry(m.expiryDate),stockDays:daysUntilStockout(m.stock,m.dailyVelocity)}));
  const alerts=enriched.filter(m=>["critical","low","expiring"].includes(m.status));
  const filtered=enriched.filter(m=>{const q=search.toLowerCase();return(!q||m.name.toLowerCase().includes(q)||m.brand.toLowerCase().includes(q))&&(filter==="all"||m.status===filter||(filter==="alerts"&&["critical","low","expiring"].includes(m.status)));}).sort((a,b)=>sort==="priority"?STATUS[a.status].priority-STATUS[b.status].priority:sort==="name"?a.name.localeCompare(b.name):sort==="stock"?a.stock-b.stock:a.expDays-b.expDays);
  const commitAdjust=()=>{setMedicines(prev=>prev.map(m=>m.id===adjustItem.id?{...m,stock:Math.max(0,m.stock+adjustQty)}:m));onShowToast(`${adjustItem.name} updated — now ${Math.max(0,adjustItem.stock+adjustQty)} units`,"success");setAdjustItem(null);};
  return(
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{marginBottom:20}}><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Smart Inventory</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>{medicines.length} products · {alerts.length} need attention</div></div>
      {alerts.length>0&&<div style={{background:"linear-gradient(135deg,#fef2f2,#fff7ed)",border:"1px solid #fecaca",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:"#ef4444",boxShadow:"0 0 0 3px #fecaca",animation:"pulse 2s infinite",flexShrink:0}}/>
        <div style={{flex:1,fontSize:13,fontWeight:700,color:"#7f1d1d"}}>{alerts.filter(a=>a.status==="critical").length} critical · {alerts.filter(a=>a.status==="low").length} low stock · {alerts.filter(a=>a.status==="expiring").length} expiring</div>
        <button onClick={()=>setFilter("alerts")} style={{padding:"5px 12px",borderRadius:7,border:"1.5px solid #fca5a5",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Filter</button>
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        <div style={{flex:1,minWidth:160,position:"relative"}}>
          <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search medicines…" style={{width:"100%",padding:"9px 12px 9px 30px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box",background:"#fff"}}/>
        </div>
        {["all","alerts","critical","low","expiring","healthy"].map(f=>(<button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 12px",borderRadius:8,border:`1.5px solid ${filter===f?"#10b981":"#e2e8f0"}`,background:filter===f?"#f0fdf4":"#fff",color:filter===f?"#047857":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{f==="all"?"All":f==="alerts"?`⚠ (${alerts.length})`:f.charAt(0).toUpperCase()+f.slice(1)}</button>))}
        <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:"7px 11px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#fff",fontSize:12,fontFamily:FONT,color:"#64748b",outline:"none"}}><option value="priority">Priority</option><option value="name">Name</option><option value="stock">Stock</option><option value="expiry">Expiry</option></select>
        <button style={{padding:"8px 14px",borderRadius:8,border:"none",background:GREEN,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>+ Add Product</button>
      </div>
      <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 0.9fr 1.3fr 0.8fr 0.7fr 0.9fr auto",padding:"10px 18px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",alignItems:"center",gap:6}}>
          <span>Medicine</span><span>Status</span><span>Stock</span><span>Days Left</span><span>Velocity</span><span>Expiry</span><span>Action</span>
        </div>
        {filtered.map((item,idx)=>{const sc=STATUS[item.status];return(
          <div key={item.id} style={{display:"grid",gridTemplateColumns:"2fr 0.9fr 1.3fr 0.8fr 0.7fr 0.9fr auto",padding:"12px 18px",borderBottom:"1px solid #f8fafc",alignItems:"center",gap:6,animation:`fadeUp 0.3s ${idx*0.03}s both`}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
            <div><div style={{fontSize:13,fontWeight:700,color:SLATE,display:"flex",alignItems:"center",gap:6}}>{item.isEssential&&<span style={{width:5,height:5,borderRadius:"50%",background:GREEN,flexShrink:0}}/>}{item.name}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{item.brand} · {item.category}</div></div>
            <div><Badge status={item.status}/></div>
            <div><div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:4}}><span style={{fontSize:17,fontWeight:900,color:sc.color}}>{item.stock}</span><span style={{fontSize:10,color:"#94a3b8"}}>{item.unit}</span></div><StockBar stock={item.stock} reorderPoint={item.reorderPoint} maxStock={item.maxStock} status={item.status}/><div style={{fontSize:9,color:"#cbd5e1",marginTop:2}}>reorder @ {item.reorderPoint}</div></div>
            <div><div style={{fontSize:14,fontWeight:800,color:item.stockDays<=3?"#ef4444":item.stockDays<=7?"#f97316":GREEN}}>{item.stockDays>90?"90+":item.stockDays}d</div><div style={{fontSize:9,color:"#94a3b8"}}>to stockout</div></div>
            <div><Sparkline data={item.movements.map(Math.abs)} color={sc.color} h={26} w={54}/><div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>{item.dailyVelocity}/day</div></div>
            <div><div style={{fontSize:12,fontWeight:700,color:item.expDays<=14?"#f59e0b":item.expDays<=30?"#f97316":"#64748b"}}>{item.expDays<=0?"EXPIRED":item.expDays<=30?`${item.expDays}d`:new Date(item.expiryDate).toLocaleDateString("en-US",{month:"short",year:"2-digit"})}</div><div style={{fontSize:9,color:"#94a3b8"}}>{item.batchId}</div></div>
            <div style={{display:"flex",gap:5}} onClick={e=>e.stopPropagation()}>
              {["critical","low"].includes(item.status)&&<button onClick={()=>setReorderItem(item)} style={{padding:"5px 10px",borderRadius:7,border:"none",background:item.status==="critical"?"#ef4444":"#f97316",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Reorder</button>}
              <button onClick={()=>{setAdjustItem(item);setAdjustQty(0);setAdjustNote("");}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",fontSize:12}}>✎</button>
            </div>
          </div>);
        })}
      </div>
      <Modal open={!!adjustItem} onClose={()=>setAdjustItem(null)}>
        {adjustItem&&<><div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Adjust Stock</div><div style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>{adjustItem.name} · {adjustItem.stock} {adjustItem.unit} currently</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:12}}>{[-10,-5,-1,+1,+5,+10].map(v=>(<button key={v} onClick={()=>setAdjustQty(v)} style={{padding:"9px 0",borderRadius:7,border:`1.5px solid ${adjustQty===v?"#10b981":"#e2e8f0"}`,background:adjustQty===v?"#f0fdf4":"#f8fafc",color:adjustQty===v?"#047857":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>{v>0?`+${v}`:v}</button>))}</div>
        <input type="number" value={adjustQty} onChange={e=>setAdjustQty(parseInt(e.target.value)||0)} style={{width:"100%",padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:20,fontWeight:800,textAlign:"center",fontFamily:FONT,outline:"none",marginBottom:12,boxSizing:"border-box"}}/>
        <div style={{padding:"11px 13px",borderRadius:9,background:adjustQty>=0?"#f0fdf4":"#fff7ed",border:`1px solid ${adjustQty>=0?"#bbf7d0":"#fed7aa"}`,marginBottom:12,fontSize:13,fontWeight:600,color:adjustQty>=0?"#065f46":"#9a3412"}}>New level: <strong>{Math.max(0,adjustItem.stock+adjustQty)} {adjustItem.unit}</strong></div>
        <textarea value={adjustNote} onChange={e=>setAdjustNote(e.target.value)} placeholder="Note: shipment received, stock count, expired removed…" style={{width:"100%",padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12,fontFamily:FONT,height:56,resize:"none",outline:"none",marginBottom:16,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setAdjustItem(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={commitAdjust} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Confirm Update</button></div></>}
      </Modal>
      <Modal open={!!reorderItem} onClose={()=>setReorderItem(null)}>
        {reorderItem&&(()=>{const qty=Math.max(0,reorderItem.maxStock-reorderItem.stock),cost=qty*reorderItem.unitCost,sup=SUPPLIER_DATA.find(s=>s.id===reorderItem.supplierId);return(<><div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Reorder {reorderItem.name}</div><div style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>via WhatsApp to {sup?.name}</div>
        <div style={{background:"#f8fafc",borderRadius:11,padding:16,marginBottom:16,border:"1px solid #e2e8f0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[["Supplier",sup?.name],["Lead Time",`${sup?.leadDays} days`],["Order Qty",`${qty} units`],["Total Cost",fmt(cost)]].map(([l,v],i)=>(<div key={i}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{v}</div></div>))}</div>
        <div style={{background:"#f0fdf4",borderRadius:9,padding:"11px 13px",marginBottom:18,border:"1px solid #bbf7d0",fontSize:12,color:"#047857",lineHeight:1.6}}><strong>WhatsApp:</strong><br/><em>"Hi {sup?.name}, please supply {qty} units of {reorderItem.name} ({reorderItem.brand}). Confirm ETA. — Monrovia Central"</em></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setReorderItem(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={()=>{onShowToast(`Reorder sent to ${sup?.name} ✓`,"success");setReorderItem(null);}} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:"#25D366",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Send via WhatsApp</button></div></>);})()} 
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUPPLIER MARKETPLACE
// ═══════════════════════════════════════════════════════════
function SuppliersScreen({medicines,onShowToast}){
  const [view,setView]=useState("compare"); // compare | suppliers | orders
  const [selectedMed,setSelectedMed]=useState(medicines[0]);
  const [selectedSup,setSelectedSup]=useState(null);
  const [orderModal,setOrderModal]=useState(null);
  const [orderQty,setOrderQty]=useState(50);

  // Build price comparison for selected medicine
  const priceData=SUPPLIER_DATA.map(s=>{
    const listing=s.catalogue.find(c=>c.medicineId===selectedMed.id);
    return listing?{...s,price:listing.price,stock:listing.stock,moq:listing.moq,saving:((selectedMed.unitCost-listing.price)/selectedMed.unitCost*100).toFixed(0)}:null;
  }).filter(Boolean).sort((a,b)=>a.price-b.price);

  const cheapest=priceData[0];
  const totalSaving=cheapest?((selectedMed.unitCost-cheapest.price)*(selectedMed.maxStock-selectedMed.stock)).toFixed(2):0;

  return(
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{marginBottom:20}}><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Supplier Marketplace</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>Compare prices · Place orders · Track deliveries</div></div>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:4,marginBottom:22,background:"#f1f5f9",borderRadius:11,padding:4,width:"fit-content"}}>
        {[["compare","💰 Price Compare"],["suppliers","🏢 Suppliers"],["orders","📋 Order History"]].map(([v,l])=>(<button key={v} onClick={()=>setView(v)} style={{padding:"8px 18px",borderRadius:8,border:"none",background:view===v?"#fff":"transparent",color:view===v?SLATE:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,boxShadow:view===v?"0 1px 4px #0000001a":"none",transition:"all 0.15s"}}>{l}</button>))}
      </div>

      {/* PRICE COMPARE TAB */}
      {view==="compare"&&(<div>
        {/* Medicine selector */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Select Medicine to Compare</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {medicines.map(m=>(<button key={m.id} onClick={()=>setSelectedMed(m)} style={{padding:"8px 14px",borderRadius:9,border:`1.5px solid ${selectedMed.id===m.id?"#10b981":"#e2e8f0"}`,background:selectedMed.id===m.id?"#f0fdf4":"#fff",color:selectedMed.id===m.id?"#047857":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,whiteSpace:"nowrap"}}>{m.name}</button>))}
          </div>
        </div>

        {/* Current price card */}
        <div style={{background:"linear-gradient(135deg,#020617,#0c1a2e)",borderRadius:14,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:20}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6ee7b7",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>You Currently Pay</div>
            <div style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-0.04em"}}>{fmt(selectedMed.unitCost)}<span style={{fontSize:14,fontWeight:500,color:"#94a3b8"}}> / {selectedMed.unit.replace(/s$/,"")}</span></div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>from your default supplier · {selectedMed.name}</div>
          </div>
          {cheapest&&<div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6ee7b7",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Best Available Price</div>
            <div style={{fontSize:28,fontWeight:900,color:"#10b981"}}>{fmt(cheapest.price)}</div>
            <div style={{fontSize:12,color:"#6ee7b7",marginTop:4}}>Save {fmt(totalSaving)} on next reorder</div>
          </div>}
        </div>

        {/* Price comparison cards */}
        {priceData.length===0?(<div style={{background:"#fff",borderRadius:14,padding:"32px",textAlign:"center",color:"#94a3b8",border:"1px solid #e2e8f0"}}><div style={{fontSize:20,marginBottom:8}}>🔍</div><div style={{fontSize:14,fontWeight:600}}>No suppliers carry this medicine yet</div></div>):
        priceData.map((sup,i)=>(<div key={sup.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${i===0?"#10b981":"#e2e8f0"}`,padding:"20px",marginBottom:12,display:"flex",alignItems:"center",gap:16,boxShadow:i===0?"0 4px 16px #10b98115":"0 1px 3px #0000000a",position:"relative",overflow:"hidden"}}>
          {i===0&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#10b981,#059669)"}}/>}
          {i===0&&<div style={{position:"absolute",top:10,right:14,fontSize:10,fontWeight:800,color:"#10b981",background:"#f0fdf4",padding:"2px 8px",borderRadius:99,border:"1px solid #bbf7d0"}}>BEST PRICE</div>}
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{fontSize:15,fontWeight:800,color:SLATE}}>{sup.name}</div>
              {sup.verified&&<span style={{fontSize:10,fontWeight:700,color:"#3b82f6",background:"#eff6ff",padding:"2px 7px",borderRadius:99}}>✓ Verified</span>}
            </div>
            <div style={{display:"flex",gap:16,fontSize:12,color:"#64748b"}}>
              <span>📍 {sup.city}, {sup.country}</span>
              <span>🚚 {sup.leadDays}d delivery</span>
              <span>⭐ {sup.rating} ({sup.reviews} reviews)</span>
              <span>Min order: {sup.moq} units</span>
            </div>
            <div style={{marginTop:8}}>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99,background:sup.stock==="In stock"?"#f0fdf4":"#fffbeb",color:sup.stock==="In stock"?"#047857":"#b45309"}}>{sup.stock}</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:24,fontWeight:900,color:i===0?GREEN:SLATE}}>{fmt(sup.price)}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>per {selectedMed.unit.replace(/s$/,"")}</div>
            {parseFloat(sup.saving)>0&&<div style={{fontSize:12,fontWeight:700,color:"#10b981",marginTop:2}}>Save {sup.saving}%</div>}
            {parseFloat(sup.saving)<0&&<div style={{fontSize:12,fontWeight:700,color:"#f97316",marginTop:2}}>{Math.abs(sup.saving)}% more expensive</div>}
          </div>
          <button onClick={()=>{setOrderModal(sup);setOrderQty(Math.max(sup.moq,selectedMed.maxStock-selectedMed.stock));}} style={{padding:"10px 18px",borderRadius:9,border:"none",background:i===0?GREEN:"#f8fafc",color:i===0?"#fff":"#475569",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,border:i===0?"none":"1.5px solid #e2e8f0",whiteSpace:"nowrap"}}>Order Now</button>
        </div>))}
      </div>)}

      {/* SUPPLIERS TAB */}
      {view==="suppliers"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
        {SUPPLIER_DATA.map((s,i)=>(<div key={s.id} style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px",boxShadow:"0 1px 3px #0000000a",animation:`fadeUp 0.3s ${i*0.06}s both`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div><div style={{fontSize:15,fontWeight:800,color:SLATE}}>{s.name}</div><div style={{fontSize:12,color:"#64748b",marginTop:2}}>{s.city}, {s.country}</div></div>
            {s.verified&&<span style={{fontSize:10,fontWeight:700,color:"#3b82f6",background:"#eff6ff",padding:"3px 8px",borderRadius:99}}>✓ Verified</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[{l:"Rating",v:`⭐ ${s.rating}`,c:"#f59e0b"},{l:"On-Time Rate",v:`${s.onTimeRate}%`,c:s.onTimeRate>=95?GREEN:"#f97316"},{l:"Lead Time",v:`${s.leadDays} days`,c:"#3b82f6"},{l:"Min Order",v:fmt(s.minOrder,0),c:"#8b5cf6"}].map((stat,j)=>(<div key={j} style={{background:"#f8fafc",borderRadius:9,padding:"10px 12px"}}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:3}}>{stat.l}</div><div style={{fontSize:15,fontWeight:800,color:stat.c}}>{stat.v}</div></div>))}
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
            <div><strong>Payment:</strong> {s.paymentTerms} · <strong>Returns:</strong> {s.returnPolicy}</div>
            <div style={{marginTop:4}}><strong>Delivers to:</strong> {s.deliveryZones.join(", ")}</div>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Catalogue ({s.catalogue.length} items)</div>
          {s.catalogue.slice(0,3).map((c,j)=>{const med=medicines.find(m=>m.id===c.medicineId);return med?(<div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#334155",fontWeight:600}}>{med.name}</span><span style={{fontWeight:800,color:c.price<med.unitCost?GREEN:"#f97316"}}>{fmt(c.price)}</span></div>):null;})}
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button onClick={()=>onShowToast(`WhatsApp opened for ${s.name}`,"success")} style={{flex:1,padding:"9px",borderRadius:8,border:"none",background:"#25D366",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>WhatsApp</button>
            <button onClick={()=>setView("compare")} style={{flex:1,padding:"9px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Compare Prices</button>
          </div>
        </div>))}
      </div>)}

      {/* ORDERS TAB */}
      {view==="orders"&&(<div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{padding:"16px 22px",borderBottom:"1px solid #e2e8f0",fontSize:14,fontWeight:800,color:SLATE}}>Order History</div>
        {SUPPLIER_DATA.flatMap(s=>s.orders.map(o=>({...o,supplierName:s.name}))).sort((a,b)=>new Date(b.date)-new Date(a.date)).map((o,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 22px",borderBottom:"1px solid #f8fafc"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:GREEN,flexShrink:0}}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{o.items}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{o.supplierName} · {o.date} · Delivered in {o.deliveredIn} days</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:800,color:SLATE}}>{fmt(o.total,0)}</div><span style={{fontSize:10,fontWeight:700,color:GREEN,background:"#f0fdf4",padding:"2px 8px",borderRadius:99}}>✓ Delivered</span></div>
        </div>))}
      </div>)}

      {/* Order Modal */}
      <Modal open={!!orderModal} onClose={()=>setOrderModal(null)}>
        {orderModal&&<><div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Place Order</div>
        <div style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>{orderModal.name} · {selectedMed.name}</div>
        <div style={{background:"#f8fafc",borderRadius:11,padding:16,marginBottom:16,border:"1px solid #e2e8f0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["Unit Price",fmt(orderModal.price)],["Lead Time",`${orderModal.leadDays} days`],["Min Order",`${orderModal.moq} units`],["Payment",orderModal.paymentTerms]].map(([l,v],i)=>(<div key={i}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{v}</div></div>))}
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Order Quantity (min {orderModal.moq})</label>
          <input type="number" value={orderQty} onChange={e=>setOrderQty(Math.max(orderModal.moq,parseInt(e.target.value)||orderModal.moq))} style={{width:"100%",padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:20,fontWeight:800,textAlign:"center",fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:"#f0fdf4",borderRadius:9,padding:"12px 14px",marginBottom:18,border:"1px solid #bbf7d0"}}>
          <div style={{fontSize:15,fontWeight:800,color:"#065f46"}}>Total: {fmt(orderQty*orderModal.price)}</div>
          <div style={{fontSize:11,color:"#047857",marginTop:2}}>vs {fmt(orderQty*selectedMed.unitCost)} at current price · You save {fmt(orderQty*(selectedMed.unitCost-orderModal.price))}</div>
        </div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setOrderModal(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={()=>{onShowToast(`Order of ${orderQty} units sent to ${orderModal.name} ✓`,"success");setOrderModal(null);}} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:"#25D366",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Send Order via WhatsApp</button></div></>}
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRESCRIPTION REMINDERS
// ═══════════════════════════════════════════════════════════
function RemindersScreen({customers,setCustomers,medicines,onShowToast}){
  const [addModal,setAddModal]=useState(null);
  const [form,setForm]=useState({medicine:"",dueDate:"",note:""});
  const allReminders=customers.flatMap(c=>c.reminders.map(r=>({...r,customer:c}))).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const due=allReminders.filter(r=>!r.sent&&new Date(r.dueDate)<=new Date(Date.now()+7*86400000));
  const upcoming=allReminders.filter(r=>!r.sent&&new Date(r.dueDate)>new Date(Date.now()+7*86400000));
  const sent=allReminders.filter(r=>r.sent);

  const sendReminder=(c,r)=>{
    setCustomers(prev=>prev.map(cu=>cu.id===c.id?{...cu,reminders:cu.reminders.map(re=>re.medicine===r.medicine&&re.dueDate===r.dueDate?{...re,sent:true}:re)}:cu));
    onShowToast(`Reminder sent to ${c.firstName} via WhatsApp ✓`,"success");
  };

  const sendAll=()=>{
    setCustomers(prev=>prev.map(c=>({...c,reminders:c.reminders.map(r=>due.some(d=>d.customer.id===c.id&&d.medicine===r.medicine)?{...r,sent:true}:r)})));
    onShowToast(`${due.length} reminders sent via WhatsApp ✓`,"success");
  };

  const addReminder=()=>{
    if(!addModal||!form.medicine||!form.dueDate)return;
    setCustomers(prev=>prev.map(c=>c.id===addModal.id?{...c,reminders:[...c.reminders,{medicine:form.medicine,dueDate:form.dueDate,note:form.note,sent:false}]}:c));
    onShowToast(`Reminder set for ${addModal.firstName}`,"success");
    setAddModal(null);setForm({medicine:"",dueDate:"",note:""});
  };

  const ReminderCard=({r,showSend=true})=>(<div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #f8fafc"}}>
    <Avatar name={`${r.customer.firstName} ${r.customer.lastName}`} size={36} bg={`hsl(${r.customer.id*60},60%,50%)`}/>
    <div style={{flex:1}}>
      <div style={{fontSize:13,fontWeight:700,color:SLATE}}>{r.customer.firstName} {r.customer.lastName}</div>
      <div style={{fontSize:12,color:"#64748b"}}>{r.medicine} · Due {r.dueDate}</div>
      <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>📞 {r.customer.phone}</div>
    </div>
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      {r.sent?<span style={{fontSize:10,fontWeight:700,color:GREEN,background:"#f0fdf4",padding:"3px 8px",borderRadius:99}}>✓ Sent</span>:showSend&&<button onClick={()=>sendReminder(r.customer,r)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#25D366",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Send WhatsApp</button>}
    </div>
  </div>);

  return(
    <div style={{padding:"28px 24px",maxWidth:1000,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Prescription Reminders</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>Proactive refill alerts keep patients returning</div></div>
        {due.length>0&&<button onClick={sendAll} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"#25D366",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>📲 Send All {due.length} Due Now</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        {[{l:"Due This Week",v:due.length,c:"#f59e0b",bg:"#fffbeb"},{l:"Upcoming",v:upcoming.length,c:"#3b82f6",bg:"#eff6ff"},{l:"Sent",v:sent.length,c:GREEN,bg:"#f0fdf4"}].map((s,i)=>(<div key={i} style={{background:s.bg,borderRadius:13,padding:"16px 18px",border:`1px solid ${s.c}30`}}><div style={{fontSize:10,fontWeight:700,color:s.c,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.l}</div><div style={{fontSize:26,fontWeight:900,color:s.c}}>{s.v}</div></div>))}
      </div>

      {due.length>0&&<div style={{background:"#fff",borderRadius:14,border:"1.5px solid #fde68a",padding:"18px 22px",marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:800,color:"#78350f",marginBottom:12}}>🔔 Due This Week — {due.length} patients</div>
        {due.map((r,i)=><ReminderCard key={i} r={r}/>)}
      </div>}

      {upcoming.length>0&&<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:"18px 22px",marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:12}}>📅 Upcoming Reminders</div>
        {upcoming.map((r,i)=><ReminderCard key={i} r={r} showSend={false}/>)}
      </div>}

      <div style={{background:"#f8fafc",borderRadius:14,border:"1px solid #e2e8f0",padding:"18px 22px"}}>
        <div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:12}}>Add Reminder for a Patient</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {customers.map(c=>(<button key={c.id} onClick={()=>setAddModal(c)} style={{padding:"8px 14px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:7}}><Avatar name={`${c.firstName} ${c.lastName}`} size={20} bg={`hsl(${c.id*60},60%,50%)`}/>{c.firstName} {c.lastName}</button>))}
        </div>
      </div>

      <Modal open={!!addModal} onClose={()=>setAddModal(null)}>
        {addModal&&<><div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Set Reminder</div>
        <div style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>{addModal.firstName} {addModal.lastName} · {addModal.phone}</div>
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Medicine</label>
          <select value={form.medicine} onChange={e=>setForm(p=>({...p,medicine:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",background:"#fff"}}>
            <option value="">Select…</option>{medicines.map(m=><option key={m.id}>{m.name}</option>)}
          </select></div>
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Reminder Date</label><input type="date" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/></div>
        <div style={{marginBottom:18}}><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>WhatsApp Message (optional)</label><textarea value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} placeholder={`Hi ${addModal.firstName}, your refill is due soon. Come in anytime — we have it in stock.`} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",resize:"none",height:64,boxSizing:"border-box"}}/></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setAddModal(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={addReminder} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Set Reminder</button></div></>}
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STAFF PERFORMANCE
// ═══════════════════════════════════════════════════════════
function StaffScreen({onShowToast}){
  const [selected,setSelected]=useState(null);
  const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const totSales=STAFF_DATA.reduce((s,st)=>s+st.sales.reduce((a,b)=>a+b,0),0);

  return(
    <div style={{padding:"28px 24px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{marginBottom:22}}><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Staff Performance</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>Last 7 days · Know your team from anywhere</div></div>

      {/* Team Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        {[{l:"Team Revenue (7d)",v:fmtK(totSales),c:GREEN},{l:"Total Transactions",v:STAFF_DATA.reduce((s,st)=>s+st.transactions.reduce((a,b)=>a+b,0),0),c:"#3b82f6"},{l:"Active Staff",v:STAFF_DATA.length,c:"#8b5cf6"}].map((s,i)=>(<div key={i} style={{background:"#fff",borderRadius:13,padding:"18px",border:"1px solid #e2e8f0"}}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.l}</div><div style={{fontSize:24,fontWeight:900,color:s.c}}>{s.v}</div></div>))}
      </div>

      {/* Staff Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16,marginBottom:20}}>
        {STAFF_DATA.map((st,i)=>{
          const weekTotal=st.sales.reduce((a,b)=>a+b,0);
          const weekTx=st.transactions.reduce((a,b)=>a+b,0);
          const pct=Math.round((weekTotal/totSales)*100);
          return(<div key={st.id} onClick={()=>setSelected(selected?.id===st.id?null:st)} style={{background:"#fff",borderRadius:16,border:`1.5px solid ${selected?.id===st.id?"#10b981":"#e2e8f0"}`,padding:"20px",cursor:"pointer",transition:"all 0.15s",boxShadow:selected?.id===st.id?"0 4px 16px #10b98115":"0 1px 3px #0000000a",animation:`fadeUp 0.3s ${i*0.08}s both`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <Avatar name={st.name} size={44} bg={i===0?"#10b981":i===1?"#3b82f6":"#8b5cf6"}/>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:800,color:SLATE}}>{st.name}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{st.role.charAt(0).toUpperCase()+st.role.slice(1)} · Since {st.since}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:900,color:GREEN}}>{fmtK(weekTotal)}</div><div style={{fontSize:10,color:"#94a3b8"}}>{pct}% of team</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {[{l:"Transactions",v:weekTx,c:"#3b82f6"},{l:"Avg Sale",v:fmt(weekTotal/weekTx),c:"#8b5cf6"},{l:"Daily Avg",v:fmtK(weekTotal/7),c:GREEN}].map((s,j)=>(<div key={j} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",textAlign:"center"}}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:2}}>{s.l}</div><div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div></div>))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Daily Sales (this week)</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:40}}>
              {st.sales.map((v,j)=>{const max=Math.max(...st.sales);return(<div key={j} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><div style={{width:"100%",background:j===6?(i===0?GREEN:i===1?"#3b82f6":"#8b5cf6"):`${i===0?GREEN:i===1?"#3b82f6":"#8b5cf6"}50`,borderRadius:"3px 3px 0 0",height:`${(v/max)*36}px`,minHeight:4}}/><span style={{fontSize:8,color:"#94a3b8"}}>{days[j]}</span></div>);})};
            </div>
            {selected?.id===st.id&&(<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Daily Breakdown</div>
              {st.sales.map((v,j)=>(<div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:12}}><span style={{color:"#64748b"}}>{days[j]}</span><span style={{fontWeight:700,color:SLATE}}>{fmt(v,0)}</span><span style={{color:"#94a3b8"}}>{st.transactions[j]} sales</span><span style={{color:"#64748b"}}>avg {fmt(st.avgSale[j])}</span></div>))}
            </div>)}
          </div>);
        })}
      </div>

      {/* Shift Report */}
      <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",padding:"22px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:800,color:SLATE}}>End of Day Report — Today</div>
          <button onClick={()=>onShowToast("Shift report sent to John Kamara ✓","success")} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#25D366",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>📲 Send to Owner</button>
        </div>
        <div style={{background:"#f8fafc",borderRadius:10,padding:"14px",fontFamily:"monospace",fontSize:12,color:"#334155",lineHeight:1.9,border:"1px solid #e2e8f0"}}>
          <div style={{fontWeight:800,color:SLATE,marginBottom:4}}>*Nevoutmeds Shift Report — Wed 22 Apr*</div>
          {STAFF_DATA.map((st,i)=><div key={i}>• {st.name}: {fmt(st.sales[6],0)} · {st.transactions[6]} transactions</div>)}
          <div style={{marginTop:4,color:"#10b981",fontWeight:700}}>✓ Team total: {fmt(STAFF_DATA.reduce((s,st)=>s+st.sales[6],0),0)}</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CUSTOMERS (condensed)
// ═══════════════════════════════════════════════════════════
function CustomersScreen({customers,setCustomers,medicines,onShowToast}){
  const [search,setSearch]=useState("");const [selected,setSelected]=useState(null);const [addPurchase,setAddPurchase]=useState(null);const [newCustomer,setNewCustomer]=useState(false);const [purchaseForm,setPurchaseForm]=useState({medicine:"",qty:1,method:"Cash"});const [customerForm,setCustomerForm]=useState({firstName:"",lastName:"",phone:"",altPhone:"",altName:"",dob:"",gender:"Female",community:"",landmark:"",county:"Montserrado",conditions:"",allergies:"",notes:""});const [phoneError,setPhoneError]=useState("");
  const filtered=customers.filter(c=>{const q=search.toLowerCase();return!q||c.firstName.toLowerCase().includes(q)||c.lastName.toLowerCase().includes(q)||c.phone.includes(q)||c.community.toLowerCase().includes(q);});
  const totalCredit=customers.reduce((s,c)=>s+c.creditBalance,0);
  const commitPurchase=()=>{if(!purchaseForm.medicine)return;const med=medicines.find(m=>m.id===parseInt(purchaseForm.medicine));if(!med)return;const amount=med.sellingPrice*purchaseForm.qty;setCustomers(prev=>prev.map(c=>c.id===addPurchase.id?{...c,totalSpend:c.totalSpend+amount,visitCount:c.visitCount+1,lastVisit:new Date().toISOString().split("T")[0],creditBalance:purchaseForm.method==="Credit"?c.creditBalance+amount:c.creditBalance,purchases:[{date:new Date().toISOString().split("T")[0],items:`${med.name} x${purchaseForm.qty}`,amount,method:purchaseForm.method,staffId:1},...c.purchases]}:c));onShowToast(`Purchase recorded — ${fmt(amount)}`,"success");setAddPurchase(null);setPurchaseForm({medicine:"",qty:1,method:"Cash"});};
  const commitNew=()=>{const cp=customerForm.phone.replace(/\s/g,"");if(!cp){setPhoneError("Phone number required");return;}if(customers.find(c=>c.phone.replace(/\s/g,"")=== cp)){setPhoneError("Phone already registered");return;}if(!customerForm.firstName||!customerForm.lastName)return;setPhoneError("");const newId=Math.max(...customers.map(c=>c.id))+1;setCustomers(prev=>[...prev,{id:newId,phone:cp,firstName:customerForm.firstName,lastName:customerForm.lastName,dob:customerForm.dob,gender:customerForm.gender,community:customerForm.community,landmark:customerForm.landmark,county:customerForm.county,altPhone:customerForm.altPhone,altName:customerForm.altName,registeredAt:new Date().toISOString().split("T")[0],totalSpend:0,visitCount:0,lastVisit:new Date().toISOString().split("T")[0],creditBalance:0,creditLimit:30,conditions:customerForm.conditions?customerForm.conditions.split(",").map(s=>s.trim()).filter(Boolean):[],allergies:customerForm.allergies?customerForm.allergies.split(",").map(s=>s.trim()).filter(Boolean):[],notes:customerForm.notes,reminders:[],purchases:[]}]);onShowToast(`${customerForm.firstName} registered`,"success");setNewCustomer(false);setCustomerForm({firstName:"",lastName:"",phone:"",altPhone:"",altName:"",dob:"",gender:"Female",community:"",landmark:"",county:"Montserrado",conditions:"",allergies:"",notes:""});};
  return(
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}><div><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Customer Profiles</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>{customers.length} registered · {fmt(totalCredit)} credit out</div></div><button onClick={()=>setNewCustomer(true)} style={{padding:"10px 16px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>+ Register Patient</button></div>
      <div style={{position:"relative",marginBottom:16}}><svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, phone, or community…" style={{width:"100%",padding:"10px 12px 10px 32px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box",background:"#fff"}}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
        {filtered.map((c,idx)=>(<div key={c.id} onClick={()=>setSelected(selected?.id===c.id?null:c)} style={{background:"#fff",borderRadius:16,border:`1.5px solid ${selected?.id===c.id?"#10b981":"#e2e8f0"}`,padding:"18px",cursor:"pointer",transition:"all 0.15s",boxShadow:selected?.id===c.id?"0 4px 16px #10b98115":"0 1px 3px #0000000a",animation:`fadeUp 0.3s ${idx*0.04}s both`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><Avatar name={`${c.firstName} ${c.lastName}`} size={38} bg={`hsl(${c.id*60},60%,50%)`}/><div><div style={{fontSize:14,fontWeight:800,color:SLATE}}>{c.firstName} {c.lastName}</div><div style={{fontSize:12,color:GREEN,fontWeight:700}}>📞 {c.phone}</div></div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:15,fontWeight:900,color:SLATE}}>{fmt(c.totalSpend)}</div><div style={{fontSize:10,color:"#94a3b8"}}>{c.visitCount} visits</div></div>
          </div>
          <div style={{display:"flex",alignItems:"flex-start",gap:5,marginBottom:8,padding:"6px 9px",background:"#f8fafc",borderRadius:7}}><span style={{fontSize:11,marginTop:1}}>📍</span><div><div style={{fontSize:12,fontWeight:600,color:"#334155"}}>{c.community}{c.county?`, ${c.county}`:""}</div>{c.landmark&&<div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{c.landmark}</div>}</div></div>
          {c.conditions.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>{c.conditions.map((co,i)=>(<span key={i} style={{padding:"2px 7px",borderRadius:99,background:"#eff6ff",color:"#2563eb",fontSize:10,fontWeight:700}}>{co}</span>))}</div>}
          {c.allergies.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:6}}>{c.allergies.map((a,i)=>(<span key={i} style={{padding:"2px 7px",borderRadius:99,background:"#fef2f2",color:"#ef4444",fontSize:10,fontWeight:700}}>⚠ {a}</span>))}</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:"1px solid #f1f5f9",marginTop:4}}>
            <div style={{fontSize:11,color:"#64748b"}}>Last: {c.lastVisit}</div>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {c.creditBalance>0&&<span style={{fontSize:10,fontWeight:700,color:"#f97316",background:"#fff7ed",padding:"2px 7px",borderRadius:99}}>{fmt(c.creditBalance)} credit</span>}
              <button onClick={e=>{e.stopPropagation();setAddPurchase(c);}} style={{padding:"5px 10px",borderRadius:7,border:"none",background:GREEN,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>+ Sale</button>
            </div>
          </div>
          {selected?.id===c.id&&(<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #e2e8f0"}}>
            {c.altPhone&&<div style={{fontSize:12,color:"#64748b",marginBottom:6}}>👤 {c.altName||"Alt"} · {c.altPhone}</div>}
            {c.notes&&<div style={{padding:"7px 9px",background:"#fffbeb",borderRadius:7,border:"1px solid #fde68a",fontSize:11,color:"#78350f",marginBottom:8,lineHeight:1.5}}>📝 {c.notes}</div>}
            <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Purchase History</div>
            {c.purchases.slice(0,3).map((p,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><div><div style={{fontWeight:600,color:"#334155"}}>{p.items}</div><div style={{color:"#94a3b8",fontSize:10}}>{p.date} · {p.method}</div></div><div style={{fontWeight:700,color:p.method==="Credit"?"#f97316":SLATE}}>{fmt(p.amount)}</div></div>))}
          </div>)}
        </div>))}
      </div>
      <Modal open={!!addPurchase} onClose={()=>setAddPurchase(null)}>
        {addPurchase&&<><div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Record Purchase</div><div style={{fontSize:13,color:"#94a3b8",marginBottom:addPurchase.allergies.length>0?10:18}}>{addPurchase.firstName} {addPurchase.lastName} · 📞 {addPurchase.phone}</div>
        {addPurchase.allergies.length>0&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"9px 12px",marginBottom:14,fontSize:12,color:"#dc2626",fontWeight:600}}>⚠ Allergy alert: {addPurchase.allergies.join(", ")}</div>}
        <div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Medicine</label><select value={purchaseForm.medicine} onChange={e=>setPurchaseForm(p=>({...p,medicine:e.target.value}))} style={{width:"100%",padding:"10px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",background:"#fff"}}><option value="">Select…</option>{medicines.map(m=><option key={m.id} value={m.id}>{m.name} — {fmt(m.sellingPrice)}/{m.unit.replace(/s$/,"")}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Qty</label><input type="number" min={1} value={purchaseForm.qty} onChange={e=>setPurchaseForm(p=>({...p,qty:parseInt(e.target.value)||1}))} style={{width:"100%",padding:"10px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/></div>
          <div><label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Payment</label><select value={purchaseForm.method} onChange={e=>setPurchaseForm(p=>({...p,method:e.target.value}))} style={{width:"100%",padding:"10px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",background:"#fff"}}>{["Cash","Mobile Money","Credit","Diaspora Pay","Insurance"].map(m=><option key={m}>{m}</option>)}</select></div>
        </div>
        {purchaseForm.medicine&&<div style={{background:"#f0fdf4",borderRadius:9,padding:"11px 13px",marginBottom:16,border:"1px solid #bbf7d0",fontSize:13,fontWeight:700,color:"#065f46"}}>Total: {fmt((medicines.find(m=>m.id===parseInt(purchaseForm.medicine))?.sellingPrice||0)*purchaseForm.qty)}{purchaseForm.method==="Credit"&&<span style={{fontSize:11,color:"#f97316",fontWeight:600,display:"block",marginTop:3}}>⚠ Adds to credit balance</span>}</div>}
        <div style={{display:"flex",gap:8}}><button onClick={()=>setAddPurchase(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={commitPurchase} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Record Purchase</button></div></>}
      </Modal>
      <Modal open={newCustomer} onClose={()=>setNewCustomer(false)} maxW={540}>
        <div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Register New Patient</div>
        <div style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>Phone number is the unique identifier</div>
        <SectionHead label="Identity"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <Field label="First Name *"><Input value={customerForm.firstName} onChange={e=>setCustomerForm(p=>({...p,firstName:e.target.value}))}/></Field>
          <Field label="Last Name *"><Input value={customerForm.lastName} onChange={e=>setCustomerForm(p=>({...p,lastName:e.target.value}))}/></Field>
          <Field label="Date of Birth"><Input type="date" value={customerForm.dob} onChange={e=>setCustomerForm(p=>({...p,dob:e.target.value}))}/></Field>
          <Field label="Gender"><div style={{display:"flex",gap:6}}>{["Female","Male","Other"].map(g=>(<button key={g} onClick={()=>setCustomerForm(p=>({...p,gender:g}))} style={{flex:1,padding:"9px 0",borderRadius:8,border:`1.5px solid ${customerForm.gender===g?"#10b981":"#e2e8f0"}`,background:customerForm.gender===g?"#f0fdf4":"#fff",color:customerForm.gender===g?"#047857":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>{g}</button>))}</div></Field>
        </div>
        <SectionHead label="Contact — Phone is the Unique ID"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <Field label="Phone Number *" full><input value={customerForm.phone} onChange={e=>{setCustomerForm(p=>({...p,phone:e.target.value}));setPhoneError("");}} placeholder="+231 77 000 0000" style={{width:"100%",padding:"11px 12px",border:`1.5px solid ${phoneError?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:15,fontFamily:FONT,outline:"none",boxSizing:"border-box",fontWeight:700}}/>{phoneError&&<div style={{fontSize:11,color:"#ef4444",marginTop:4,fontWeight:600}}>⚠ {phoneError}</div>}</Field>
          <Field label="Alt Phone"><Input value={customerForm.altPhone} onChange={e=>setCustomerForm(p=>({...p,altPhone:e.target.value}))} placeholder="+231 88…"/></Field>
          <Field label="Alt Contact Name"><Input value={customerForm.altName} onChange={e=>setCustomerForm(p=>({...p,altName:e.target.value}))} placeholder="e.g. daughter, husband"/></Field>
        </div>
        <SectionHead label="Location — Community & Landmark"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <Field label="Community / Area"><input list="cl" value={customerForm.community} onChange={e=>setCustomerForm(p=>({...p,community:e.target.value}))} placeholder="Sinkor, Congo Town…" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/><datalist id="cl">{LR_COMMUNITIES.map(c=><option key={c} value={c}/>)}</datalist></Field>
          <Field label="County"><select value={customerForm.county} onChange={e=>setCustomerForm(p=>({...p,county:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",background:"#fff"}}>{LR_COUNTIES.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Nearest Landmark" full><Input value={customerForm.landmark} onChange={e=>setCustomerForm(p=>({...p,landmark:e.target.value}))} placeholder="Near Total station, behind mosque, opp. church…"/></Field>
        </div>
        <SectionHead label="Medical (optional)"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          <Field label="Conditions"><Input value={customerForm.conditions} onChange={e=>setCustomerForm(p=>({...p,conditions:e.target.value}))} placeholder="Diabetes, Hypertension…"/></Field>
          <Field label="Allergies ⚠"><Input value={customerForm.allergies} onChange={e=>setCustomerForm(p=>({...p,allergies:e.target.value}))} placeholder="Penicillin, Aspirin…" style={{borderColor:customerForm.allergies?"#fde68a":"#e2e8f0"}}/></Field>
          <Field label="Staff Notes" full><textarea value={customerForm.notes} onChange={e=>setCustomerForm(p=>({...p,notes:e.target.value}))} placeholder="Refill schedule, payment habits, special instructions…" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",resize:"none",height:56,boxSizing:"border-box"}}/></Field>
        </div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>{setNewCustomer(false);setPhoneError("");}} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button><button onClick={commitNew} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Register Patient</button></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FINANCIALS (condensed but complete)
// ═══════════════════════════════════════════════════════════
function FinancialsScreen({customers}){
  const [tab,setTab]=useState("overview");
  const creditTotal=customers.reduce((s,c)=>s+c.creditBalance,0);
  const cashIn=FINANCIALS.cashflow.inflows.reduce((s,i)=>s+i.amount,0);
  const cashOut=FINANCIALS.cashflow.outflows.reduce((s,o)=>s+o.amount,0);
  const shortfall=cashIn-cashOut;
  return(
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{marginBottom:20}}><div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Financial Intelligence</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>April 2026 · Monrovia Central Pharmacy</div></div>
      <div style={{display:"flex",gap:4,marginBottom:22,background:"#f1f5f9",borderRadius:11,padding:4,width:"fit-content"}}>
        {["overview","cashflow","debt","expenses","credit"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{padding:"8px 16px",borderRadius:8,border:"none",background:tab===t?"#fff":"transparent",color:tab===t?SLATE:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT,boxShadow:tab===t?"0 1px 4px #0000001a":"none",transition:"all 0.15s"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}
      </div>
      {tab==="overview"&&(<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:22}}>
          {[{l:"Monthly Revenue",v:fmtK(FINANCIALS.revenue.mtd),s:"↑ 22% YoY",c:GREEN},{l:"Monthly Expenses",v:fmtK(FINANCIALS.expenses.mtd),s:"of revenue",c:"#f97316"},{l:"Net Profit",v:fmtK(FINANCIALS.profit.mtd),s:`${FINANCIALS.profit.margin}% margin`,c:"#3b82f6"},{l:"Cash on Hand",v:fmtK(FINANCIALS.cashflow.current),s:"available now",c:"#8b5cf6"},{l:"YTD Revenue",v:fmtK(FINANCIALS.revenue.ytd),s:"Jan–Apr 2026",c:GREEN},{l:"Debt Outstanding",v:fmtK(FINANCIALS.debt.total),s:`${FINANCIALS.debt.breakdown.filter(d=>d.status==="overdue").length} overdue`,c:FINANCIALS.debt.breakdown.some(d=>d.status==="overdue")?"#ef4444":"#f59e0b"}].map((k,i)=>(<div key={i} style={{background:"#fff",borderRadius:14,padding:"18px",border:"1px solid #e2e8f0",boxShadow:"0 1px 3px #0000000a"}}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{k.l}</div><div style={{fontSize:24,fontWeight:900,color:k.c,letterSpacing:"-0.04em"}}>{k.v}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{k.s}</div></div>))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18}}>
          <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{fontSize:13,fontWeight:800,color:SLATE}}>Daily Revenue — 30 Days</div><div style={{fontSize:17,fontWeight:900,color:GREEN}}>{fmtK(FINANCIALS.revenue.mtd)}</div></div><BarChart data={FINANCIALS.revenue.last30} color={GREEN} height={72}/></div>
          <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:14}}>P&L This Month</div>{[{l:"Revenue",v:FINANCIALS.revenue.mtd,c:GREEN,pct:100},{l:"Expenses",v:FINANCIALS.expenses.mtd,c:"#f97316",pct:(FINANCIALS.expenses.mtd/FINANCIALS.revenue.mtd)*100},{l:"Profit",v:FINANCIALS.profit.mtd,c:"#3b82f6",pct:(FINANCIALS.profit.mtd/FINANCIALS.revenue.mtd)*100}].map((r,i)=>(<div key={i} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:"#475569"}}>{r.l}</span><span style={{fontSize:14,fontWeight:800,color:r.c}}>{fmt(r.v,0)}</span></div><div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:"100%",width:`${r.pct}%`,background:r.c,borderRadius:99}}/></div></div>))}</div>
        </div>
      </div>)}
      {tab==="cashflow"&&(<div>
        <div style={{background:shortfall<0?"#fef2f2":"#f0fdf4",border:`1px solid ${shortfall<0?"#fecaca":"#bbf7d0"}`,borderRadius:14,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:32}}>{shortfall<0?"⚠️":"✓"}</div>
          <div style={{flex:1}}><div style={{fontSize:16,fontWeight:800,color:shortfall<0?"#7f1d1d":"#065f46"}}>30-Day Cash Flow {shortfall<0?"Warning":"Surplus"}</div><div style={{fontSize:13,color:shortfall<0?"#b45309":"#047857",marginTop:3}}>{shortfall<0?`You are projected ${fmt(Math.abs(shortfall))} short. Prioritise collecting ${fmt(Math.abs(shortfall))} in credit payments this week.`:`You have a projected surplus of ${fmt(shortfall)}. You can safely pay all upcoming supplier debts.`}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:26,fontWeight:900,color:shortfall<0?"#ef4444":GREEN}}>{shortfall<0?"-":"+"}{ fmt(Math.abs(shortfall),0)}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
          <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:14}}>Expected Inflows</div>{FINANCIALS.cashflow.inflows.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f8fafc",fontSize:13}}><span style={{color:"#334155",fontWeight:600}}>{f.label}</span><span style={{fontWeight:800,color:GREEN}}>{fmt(f.amount,0)}</span></div>))}<div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",fontSize:14,fontWeight:800}}><span style={{color:SLATE}}>Total In</span><span style={{color:GREEN}}>{fmt(cashIn,0)}</span></div></div>
          <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:14}}>Expected Outflows</div>{FINANCIALS.cashflow.outflows.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f8fafc",fontSize:13}}><span style={{color:"#334155",fontWeight:600}}>{f.label}</span><span style={{fontWeight:800,color:"#f97316"}}>{fmt(f.amount,0)}</span></div>))}<div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",fontSize:14,fontWeight:800}}><span style={{color:SLATE}}>Total Out</span><span style={{color:"#ef4444"}}>{fmt(cashOut,0)}</span></div></div>
        </div>
      </div>)}
      {tab==="debt"&&(<div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}><div style={{padding:"16px 22px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,fontWeight:800,color:SLATE}}>Supplier Debt</div><div style={{fontSize:18,fontWeight:900,color:"#f97316"}}>{fmt(FINANCIALS.debt.total,0)} total</div></div>{FINANCIALS.debt.breakdown.map((d,i)=>(<div key={i} style={{padding:"16px 22px",borderBottom:"1px solid #f8fafc",display:"flex",alignItems:"center",gap:14}}><div style={{width:9,height:9,borderRadius:"50%",background:d.status==="overdue"?"#ef4444":d.status==="due-soon"?"#f59e0b":GREEN,flexShrink:0,boxShadow:d.status==="overdue"?"0 0 0 3px #fecaca":"none"}}/><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:SLATE}}>{d.supplier}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>Due: {d.dueDate} · Interest: {d.interest}%{d.daysOverdue>0?` · ${d.daysOverdue} days OVERDUE`:""}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:17,fontWeight:900,color:d.status==="overdue"?"#ef4444":d.status==="due-soon"?"#f59e0b":SLATE}}>{fmt(d.amount,0)}</div><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:d.status==="overdue"?"#fef2f2":d.status==="due-soon"?"#fffbeb":"#f0fdf4",color:d.status==="overdue"?"#ef4444":d.status==="due-soon"?"#f59e0b":GREEN}}>{d.status==="overdue"?"OVERDUE":d.status==="due-soon"?"DUE SOON":"CURRENT"}</span></div></div>))}
      {FINANCIALS.debt.breakdown.some(d=>d.status==="overdue")&&<div style={{padding:"12px 22px",background:"#fef2f2",borderTop:"1px solid #fecaca",fontSize:12,fontWeight:600,color:"#dc2626"}}>⚠ Overdue debt accruing interest daily. Contact supplier immediately to avoid supply suspension.</div>}</div>)}
      {tab==="expenses"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}><div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:16}}>Expense Breakdown</div>{FINANCIALS.expenses.categories.map((cat,i)=>(<div key={i} style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,fontWeight:600,color:"#334155"}}>{cat.name}</span><div><span style={{fontSize:14,fontWeight:800,color:SLATE}}>{fmt(cat.amount,0)}</span><span style={{fontSize:11,color:"#94a3b8",marginLeft:6}}>{cat.pct}%</span></div></div><div style={{height:7,background:"#f1f5f9",borderRadius:99}}><div style={{height:"100%",width:`${cat.pct}%`,background:[GREEN,"#3b82f6","#f97316","#8b5cf6"][i],borderRadius:99}}/></div></div>))}</div><div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:14}}>Monthly P&L</div>{[{l:"Revenue",v:FINANCIALS.revenue.mtd,c:GREEN,s:"+"},{l:"Expenses",v:FINANCIALS.expenses.mtd,c:"#ef4444",s:"−"},{l:"Net Profit",v:FINANCIALS.profit.mtd,c:"#3b82f6",s:"="}].map((r,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<2?"1px solid #f1f5f9":"2px solid #e2e8f0"}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:22,height:22,borderRadius:5,background:`${r.c}20`,color:r.c,fontSize:12,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{r.s}</span><span style={{fontSize:13,fontWeight:600,color:"#334155"}}>{r.l}</span></div><span style={{fontSize:17,fontWeight:900,color:r.c}}>{fmt(r.v,0)}</span></div>))}<div style={{marginTop:14,padding:"12px",background:"#f0fdf4",borderRadius:9,border:"1px solid #bbf7d0",fontSize:12,color:"#065f46",fontWeight:600}}>✓ {FINANCIALS.profit.margin}% margin — above the 45% regional average.</div></div></div>)}
      {tab==="credit"&&(<div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>{[{l:"Credit Outstanding",v:fmt(creditTotal),c:"#f97316"},{l:"Patients with Credit",v:customers.filter(c=>c.creditBalance>0).length,c:"#8b5cf6"},{l:"Avg Balance",v:fmt(creditTotal/Math.max(customers.filter(c=>c.creditBalance>0).length,1)),c:"#3b82f6"}].map((s,i)=>(<div key={i} style={{background:"#fff",borderRadius:13,padding:"16px",border:"1px solid #e2e8f0"}}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.l}</div><div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.v}</div></div>))}</div>
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden"}}><div style={{padding:"14px 22px",borderBottom:"1px solid #e2e8f0",fontSize:13,fontWeight:800,color:SLATE}}>Credit Balances</div>{customers.filter(c=>c.creditBalance>0).map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 22px",borderBottom:"1px solid #f8fafc"}}><Avatar name={`${c.firstName} ${c.lastName}`} size={34} bg={`hsl(${c.id*60},60%,50%)`}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:SLATE}}>{c.firstName} {c.lastName} · {c.phone}</div><div style={{height:4,background:"#f1f5f9",borderRadius:99,marginTop:5,width:120}}><div style={{height:"100%",width:`${Math.min((c.creditBalance/c.creditLimit)*100,100)}%`,background:(c.creditBalance/c.creditLimit)>0.8?"#ef4444":"#f97316",borderRadius:99}}/></div></div><div style={{textAlign:"right"}}><div style={{fontSize:17,fontWeight:900,color:"#f97316"}}>{fmt(c.creditBalance)}</div><div style={{fontSize:10,color:"#94a3b8"}}>{((c.creditBalance/c.creditLimit)*100).toFixed(0)}% of limit</div></div><button style={{padding:"6px 12px",borderRadius:7,border:"none",background:GREEN,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Collect</button></div>))}{customers.filter(c=>c.creditBalance>0).length===0&&<div style={{padding:"28px",textAlign:"center",color:"#94a3b8",fontSize:13}}>No outstanding credit ✓</div>}</div></div>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════
const DOC_CATEGORIES = [
  { id:"registration", label:"Business Registration", icon:"🏛", color:"#3b82f6", bg:"#eff6ff", desc:"Licenses, permits, regulatory filings" },
  { id:"audit", label:"Audit & Compliance", icon:"✅", color:"#10b981", bg:"#f0fdf4", desc:"Audit trails, inspection reports, compliance docs" },
  { id:"supplier", label:"Supplier Agreements", icon:"🤝", color:"#8b5cf6", bg:"#f5f3ff", desc:"Contracts, invoices, delivery notes" },
  { id:"financial", label:"Financial Records", icon:"📊", color:"#f97316", bg:"#fff7ed", desc:"Tax filings, bank statements, receipts" },
  { id:"staff", label:"Staff Documents", icon:"👤", color:"#06b6d4", bg:"#ecfeff", desc:"Employment contracts, certifications" },
  { id:"other", label:"Other", icon:"📎", color:"#94a3b8", bg:"#f8fafc", desc:"Miscellaneous documents" },
];

const SEED_DOCS = [
  { id:1, name:"Pharmacy Operating License 2025.pdf", category:"registration", size:245000, uploadedAt:"2026-01-15", uploadedBy:"John Kamara", expiryDate:"2026-12-31", status:"active", note:"Annual renewal due Dec 31", tags:["license","LMHRA"] },
  { id:2, name:"Business Registration Certificate.pdf", category:"registration", size:180000, uploadedAt:"2025-09-10", uploadedBy:"John Kamara", expiryDate:"2027-09-09", status:"active", note:"", tags:["registration","MCI"] },
  { id:3, name:"Q1 2026 Audit Report.pdf", category:"audit", size:512000, uploadedAt:"2026-04-05", uploadedBy:"John Kamara", expiryDate:null, status:"active", note:"Clean audit — no findings", tags:["audit","Q1-2026"] },
  { id:4, name:"MedSupply West Africa Contract.pdf", category:"supplier", size:320000, uploadedAt:"2025-11-01", uploadedBy:"John Kamara", expiryDate:"2026-10-31", status:"active", note:"Auto-renew unless cancelled 30 days prior", tags:["MedSupply","contract"] },
  { id:5, name:"PharmaCorp Supply Agreement.pdf", category:"supplier", size:290000, uploadedAt:"2025-11-15", uploadedBy:"John Kamara", expiryDate:"2026-11-14", status:"active", note:"", tags:["PharmaCorp","contract"] },
  { id:6, name:"April 2026 Purchase Invoices.pdf", category:"financial", size:156000, uploadedAt:"2026-04-22", uploadedBy:"John Kamara", expiryDate:null, status:"active", note:"", tags:["invoices","April-2026"] },
  { id:7, name:"2025 Annual Tax Filing.pdf", category:"financial", size:420000, uploadedAt:"2026-03-15", uploadedBy:"John Kamara", expiryDate:null, status:"active", note:"Filed with LRA on March 15", tags:["tax","2025"] },
  { id:8, name:"Fatu Williams — Employment Contract.pdf", category:"staff", size:125000, uploadedAt:"2024-06-15", uploadedBy:"John Kamara", expiryDate:null, status:"active", note:"", tags:["staff","employment"] },
  { id:9, name:"LMHRA Inspection Report Jan 2026.pdf", category:"audit", size:380000, uploadedAt:"2026-01-28", uploadedBy:"John Kamara", expiryDate:null, status:"active", note:"Passed. Minor recommendations noted.", tags:["LMHRA","inspection"] },
  { id:10, name:"Cold Chain Compliance Certificate.pdf", category:"registration", size:210000, uploadedAt:"2025-12-01", uploadedBy:"John Kamara", expiryDate:"2026-11-30", status:"active", note:"", tags:["cold-chain","compliance"] },
];

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" });
}

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

export function DocumentsScreen({ onShowToast }) {
  const [docs, setDocs] = useState(SEED_DOCS);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [uploadModal, setUploadModal] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name:"", category:"registration", note:"", tags:"", expiryDate:"" });
  const fileRef = useRef(null);

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchCat = activeCategory === "all" || d.category === activeCategory;
    const matchSearch = !q || d.name.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q)) || d.note.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const expiringSoon = docs.filter(d => d.expiryDate && daysUntil(d.expiryDate) !== null && daysUntil(d.expiryDate) <= 60 && daysUntil(d.expiryDate) > 0);
  const expired = docs.filter(d => d.expiryDate && daysUntil(d.expiryDate) !== null && daysUntil(d.expiryDate) <= 0);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) { setUploadForm(p => ({...p, name: files[0].name})); setUploadModal(true); }
  };

  const commitUpload = () => {
    if (!uploadForm.name || !uploadForm.category) return;
    const newDoc = {
      id: Math.max(...docs.map(d=>d.id)) + 1,
      name: uploadForm.name,
      category: uploadForm.category,
      size: Math.floor(Math.random() * 400000) + 100000,
      uploadedAt: new Date().toISOString().split("T")[0],
      uploadedBy: "John Kamara",
      expiryDate: uploadForm.expiryDate || null,
      status: "active",
      note: uploadForm.note,
      tags: uploadForm.tags ? uploadForm.tags.split(",").map(t=>t.trim()).filter(Boolean) : [],
    };
    setDocs(prev => [newDoc, ...prev]);
    onShowToast(`${uploadForm.name} uploaded successfully`, "success");
    setUploadModal(false);
    setUploadForm({ name:"", category:"registration", note:"", tags:"", expiryDate:"" });
  };

  const downloadDoc = (doc) => {
    // In production: fetch from Supabase Storage and trigger download
    // For demo: create a text blob with doc metadata
    const content = `NEVOUTMEDS — Document Export\n\nFile: ${doc.name}\nCategory: ${DOC_CATEGORIES.find(c=>c.id===doc.category)?.label}\nUploaded: ${fmtDate(doc.uploadedAt)}\nUploaded by: ${doc.uploadedBy}\n${doc.expiryDate ? `Expiry: ${fmtDate(doc.expiryDate)}` : ""}\n${doc.note ? `Note: ${doc.note}` : ""}\nTags: ${doc.tags.join(", ")}\n\n[In production, the actual file would download from secure cloud storage]`;
    const blob = new Blob([content], {type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = doc.name; a.click();
    URL.revokeObjectURL(url);
    onShowToast(`Downloading ${doc.name}`, "success");
  };

  const exportIndex = () => {
    const headers = ["Name","Category","Size","Uploaded","Expiry","Tags","Note"];
    const rows = docs.map(d => [d.name, DOC_CATEGORIES.find(c=>c.id===d.category)?.label, fmtBytes(d.size), fmtDate(d.uploadedAt), fmtDate(d.expiryDate), d.tags.join(";"), d.note]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "nevoutmeds_documents.csv"; a.click();
    URL.revokeObjectURL(url);
    onShowToast("Document index exported as CSV", "success");
  };

  const FileIcon = ({category}) => {
    const cat = DOC_CATEGORIES.find(c=>c.id===category);
    return <div style={{width:40,height:40,borderRadius:10,background:cat?.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat?.icon}</div>;
  };

  return (
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto",fontFamily:FONT}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Document Center</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{docs.length} documents · Audit-ready · Always accessible</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportIndex} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>⬇ Export Index</button>
          <button onClick={()=>setUploadModal(true)} style={{padding:"9px 16px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>⬆ Upload Document</button>
        </div>
      </div>

      {/* Expiry warnings */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div style={{marginBottom:20,display:"flex",flexDirection:"column",gap:8}}>
          {expired.length > 0 && (
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:16}}>🚨</span>
              <div style={{flex:1,fontSize:13,fontWeight:700,color:"#7f1d1d"}}>{expired.length} document{expired.length>1?"s":""} expired: {expired.map(d=>d.name.split(".")[0]).join(", ")}</div>
              <button onClick={()=>setActiveCategory("registration")} style={{padding:"5px 12px",borderRadius:7,border:"1.5px solid #fca5a5",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Review</button>
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:16}}>⚠️</span>
              <div style={{flex:1,fontSize:13,fontWeight:600,color:"#78350f"}}>{expiringSoon.length} document{expiringSoon.length>1?"s":""} expiring soon: {expiringSoon.map(d=>`${d.name.split(".")[0]} (${daysUntil(d.expiryDate)}d)`).join(", ")}</div>
            </div>
          )}
        </div>
      )}

      {/* Category grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:22}}>
        <button onClick={()=>setActiveCategory("all")} style={{padding:"14px 12px",borderRadius:12,border:`1.5px solid ${activeCategory==="all"?GREEN:"#e2e8f0"}`,background:activeCategory==="all"?"#f0fdf4":"#fff",cursor:"pointer",fontFamily:FONT,textAlign:"left",transition:"all 0.15s"}}>
          <div style={{fontSize:18,marginBottom:4}}>📁</div>
          <div style={{fontSize:12,fontWeight:700,color:activeCategory==="all"?"#047857":SLATE}}>All Documents</div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{docs.length} files</div>
        </button>
        {DOC_CATEGORIES.map(cat => {
          const count = docs.filter(d=>d.category===cat.id).length;
          const active = activeCategory === cat.id;
          return(
            <button key={cat.id} onClick={()=>setActiveCategory(cat.id)} style={{padding:"14px 12px",borderRadius:12,border:`1.5px solid ${active?cat.color:"#e2e8f0"}`,background:active?cat.bg:"#fff",cursor:"pointer",fontFamily:FONT,textAlign:"left",transition:"all 0.15s"}}>
              <div style={{fontSize:18,marginBottom:4}}>{cat.icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:active?cat.color:SLATE}}>{cat.label}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{count} file{count!==1?"s":""}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{position:"relative",marginBottom:16}}>
        <svg style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents, tags…" style={{width:"100%",padding:"10px 12px 10px 32px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box",background:"#fff"}}/>
      </div>

      {/* Drop zone + document list */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
        style={{border:`2px dashed ${dragOver?GREEN:"#e2e8f0"}`,borderRadius:14,background:dragOver?"#f0fdf4":"transparent",padding:dragOver?"20px":"0",marginBottom:dragOver?"16px":"0",transition:"all 0.2s",textAlign:"center"}}
      >
        {dragOver && <div style={{fontSize:13,fontWeight:700,color:"#047857",padding:"8px"}}>Drop to upload</div>}
      </div>

      <div style={{background:"#fff",borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{padding:"12px 20px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"grid",gridTemplateColumns:"2.5fr 1fr 0.8fr 0.8fr auto",gap:8,fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",alignItems:"center"}}>
          <span>Document</span><span>Category</span><span>Size / Date</span><span>Expiry</span><span>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{padding:"48px",textAlign:"center",color:"#94a3b8"}}>
            <div style={{fontSize:28,marginBottom:10}}>📭</div>
            <div style={{fontSize:14,fontWeight:700,color:"#334155"}}>No documents found</div>
            <div style={{fontSize:12,marginTop:4}}>Upload your first document or adjust the filter</div>
          </div>
        ) : filtered.map((doc, i) => {
          const expDays = daysUntil(doc.expiryDate);
          const expColor = expDays !== null ? (expDays <= 0 ? "#ef4444" : expDays <= 30 ? "#f59e0b" : expDays <= 60 ? "#f97316" : "#10b981") : "#94a3b8";
          return (
            <div key={doc.id} style={{display:"grid",gridTemplateColumns:"2.5fr 1fr 0.8fr 0.8fr auto",gap:8,padding:"14px 20px",borderBottom:"1px solid #f8fafc",alignItems:"center",animation:`fadeUp 0.3s ${i*0.03}s both`}}
              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}
            >
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <FileIcon category={doc.category}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:SLATE,lineHeight:1.3}}>{doc.name}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                    {doc.tags.map((t,j)=><span key={j} style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"#f1f5f9",color:"#64748b"}}>{t}</span>)}
                  </div>
                  {doc.note && <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>📝 {doc.note}</div>}
                </div>
              </div>
              <div>
                {(() => { const cat = DOC_CATEGORIES.find(c=>c.id===doc.category); return <span style={{padding:"3px 9px",borderRadius:99,background:cat?.bg,color:cat?.color,fontSize:11,fontWeight:700}}>{cat?.icon} {cat?.label}</span>; })()}
              </div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#334155"}}>{fmtBytes(doc.size)}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>{fmtDate(doc.uploadedAt)}</div>
              </div>
              <div>
                {doc.expiryDate ? (
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:expColor}}>{expDays <= 0 ? "EXPIRED" : expDays <= 30 ? `${expDays}d left` : fmtDate(doc.expiryDate)}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>Expiry</div>
                  </div>
                ) : <span style={{fontSize:11,color:"#cbd5e1"}}>No expiry</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setViewDoc(doc)} style={{width:30,height:30,borderRadius:7,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}} title="View">👁</button>
                <button onClick={()=>downloadDoc(doc)} style={{width:30,height:30,borderRadius:7,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}} title="Download">⬇</button>
                <button onClick={()=>{setDocs(prev=>prev.filter(d=>d.id!==doc.id));onShowToast("Document deleted","info");}} style={{width:30,height:30,borderRadius:7,border:"1.5px solid #fecaca",background:"#fef2f2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#ef4444"}} title="Delete">✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      <Modal open={uploadModal} onClose={()=>setUploadModal(false)}>
        <div style={{fontSize:17,fontWeight:800,color:SLATE,marginBottom:4}}>Upload Document</div>
        <div style={{fontSize:13,color:"#94a3b8",marginBottom:20}}>Stored securely · Accessible anytime · Audit-ready</div>

        {/* Drop zone */}
        <div onClick={()=>fileRef.current?.click()} style={{border:"2px dashed #e2e8f0",borderRadius:12,padding:"28px",textAlign:"center",cursor:"pointer",marginBottom:18,background:"#f8fafc",transition:"all 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=GREEN}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}
        >
          <div style={{fontSize:28,marginBottom:8}}>📄</div>
          <div style={{fontSize:13,fontWeight:700,color:"#334155"}}>Click to select or drag & drop</div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>PDF, JPG, PNG, DOC, XLSX — max 10MB</div>
          <input ref={fileRef} type="file" style={{display:"none"}} onChange={e=>{if(e.target.files[0])setUploadForm(p=>({...p,name:e.target.files[0].name}));}}/>
        </div>

        {uploadForm.name && <div style={{background:"#f0fdf4",borderRadius:9,padding:"10px 14px",marginBottom:14,border:"1px solid #bbf7d0",fontSize:13,fontWeight:600,color:"#065f46"}}>✓ {uploadForm.name}</div>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>File Name (or rename)</label>
            <input value={uploadForm.name} onChange={e=>setUploadForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Pharmacy License 2026.pdf" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Category</label>
            <select value={uploadForm.category} onChange={e=>setUploadForm(p=>({...p,category:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",background:"#fff"}}>
              {DOC_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Expiry Date (if any)</label>
            <input type="date" value={uploadForm.expiryDate} onChange={e=>setUploadForm(p=>({...p,expiryDate:e.target.value}))} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Tags (comma separated)</label>
            <input value={uploadForm.tags} onChange={e=>setUploadForm(p=>({...p,tags:e.target.value}))} placeholder="e.g. LMHRA, license, 2026" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>Note</label>
            <textarea value={uploadForm.note} onChange={e=>setUploadForm(p=>({...p,note:e.target.value}))} placeholder="Any important notes about this document…" style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,fontFamily:FONT,outline:"none",resize:"none",height:56,boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setUploadModal(false)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Cancel</button>
          <button onClick={commitUpload} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Upload Document</button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewDoc} onClose={()=>setViewDoc(null)} maxW={520}>
        {viewDoc && (() => {
          const cat = DOC_CATEGORIES.find(c=>c.id===viewDoc.category);
          const expDays = daysUntil(viewDoc.expiryDate);
          return <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:48,height:48,borderRadius:12,background:cat?.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{cat?.icon}</div>
              <div style={{flex:1}}><div style={{fontSize:16,fontWeight:800,color:SLATE,lineHeight:1.3}}>{viewDoc.name}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{cat?.label}</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
              {[["Uploaded",fmtDate(viewDoc.uploadedAt)],["Uploaded By",viewDoc.uploadedBy],["File Size",fmtBytes(viewDoc.size)],["Expiry",viewDoc.expiryDate?fmtDate(viewDoc.expiryDate):"No expiry"]].map(([l,v],i)=>(
                <div key={i} style={{background:"#f8fafc",borderRadius:9,padding:"12px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:expDays!==null&&l==="Expiry"?(expDays<=0?"#ef4444":expDays<=30?"#f59e0b":"#334155"):"#334155"}}>{v}</div>
                </div>
              ))}
            </div>
            {viewDoc.tags.length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>{viewDoc.tags.map((t,i)=><span key={i} style={{padding:"4px 10px",borderRadius:99,background:"#f1f5f9",color:"#475569",fontSize:11,fontWeight:700}}>{t}</span>)}</div>}
            {viewDoc.note && <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13,color:"#78350f"}}>📝 {viewDoc.note}</div>}
            {expDays !== null && expDays <= 60 && (
              <div style={{background:expDays<=0?"#fef2f2":"#fffbeb",border:`1px solid ${expDays<=0?"#fecaca":"#fde68a"}`,borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13,fontWeight:600,color:expDays<=0?"#dc2626":"#b45309"}}>
                {expDays<=0?"⚠ This document has expired. Please renew and re-upload.":`⚠ This document expires in ${expDays} days. Schedule renewal now.`}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setViewDoc(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Close</button>
              <button onClick={()=>{downloadDoc(viewDoc);setViewDoc(null);}} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>⬇ Download</button>
            </div>
          </>;
        })()}
      </Modal>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// ADVANCED ANALYTICS
// ════════════════════════════════════════════════════════════

// Analytics uses medicines + customers + financials to derive
// real operational insights and recommendations
// "These are the nitty gritty of your operations.
//  This is how it affects your financials.
//  My recommendation is to take these actions."

const INSIGHT_TYPES = {
  critical: { color:"#ef4444", bg:"#fef2f2", border:"#fecaca", icon:"🚨", label:"Critical" },
  warning:  { color:"#f59e0b", bg:"#fffbeb", border:"#fde68a", icon:"⚠️", label:"Warning"  },
  opportunity: { color:"#10b981", bg:"#f0fdf4", border:"#bbf7d0", icon:"💡", label:"Opportunity" },
  info:     { color:"#3b82f6", bg:"#eff6ff", border:"#bfdbfe", icon:"📊", label:"Insight" },
};

function generateInsights(medicines, customers) {
  const insights = [];

  // ── Inventory Intelligence ───────────────────────────────
  const criticalStock = medicines.filter(m => m.stock <= m.reorderPoint * 0.4);
  const expiringStock = medicines.filter(m => {
    const days = Math.ceil((new Date(m.expiryDate) - new Date()) / 86400000);
    return days > 0 && days <= 30;
  });
  const overstocked = medicines.filter(m => m.stock > m.maxStock * 0.9);
  const slowMovers = medicines.filter(m => m.dailyVelocity < 1.0);
  const atRiskValue = expiringStock.reduce((s,m) => s + m.stock * m.unitCost, 0);

  if (criticalStock.length > 0) insights.push({
    type: "critical",
    category: "Inventory",
    title: `${criticalStock.length} medicines at critical stock levels`,
    detail: `${criticalStock.map(m=>m.name).join(", ")} will run out within ${Math.min(...criticalStock.map(m=>Math.floor(m.stock/m.dailyVelocity)))} days at current sales rate. These are essential medicines — a stockout means turning patients away.`,
    financial: `Estimated lost revenue from stockouts: ${fmt(criticalStock.reduce((s,m)=>s+(m.reorderPoint*1.5*m.sellingPrice),0))} if not restocked within 48 hours.`,
    recommendation: `Place emergency reorder today for ${criticalStock.map(m=>m.name).join(" and ")}. Use MedSupply West Africa — 2-day delivery. Consider increasing reorder points by 20% for fast-moving essentials.`,
    priority: 1,
  });

  if (expiringStock.length > 0) insights.push({
    type: "warning",
    category: "Inventory",
    title: `${fmt(atRiskValue)} in stock value at expiry risk`,
    detail: `${expiringStock.map(m=>`${m.name} (${Math.ceil((new Date(m.expiryDate)-new Date())/86400000)}d)`).join(", ")} expire soon. At current velocity you will sell ${expiringStock.map(m=>Math.min(m.stock, Math.floor(m.dailyVelocity*30))).reduce((a,b)=>a+b,0)} units but ${expiringStock.map(m=>Math.max(0,m.stock - Math.floor(m.dailyVelocity*30))).reduce((a,b)=>a+b,0)} units may expire.`,
    financial: `If unsold, you lose ${fmt(atRiskValue)} in inventory value. A 15% discount promotion now would recover ${fmt(atRiskValue * 0.85)} and clear stock before expiry.`,
    recommendation: `Run a 15% discount on ${expiringStock.map(m=>m.name).join(" and ")} this week. Notify loyal customers via WhatsApp. Adjust future order quantities to match 45-day velocity rather than maximum stock.`,
    priority: 2,
  });

  if (overstocked.length > 0) {
    const tiedCapital = overstocked.reduce((s,m)=>s+(m.stock-m.maxStock*0.7)*m.unitCost,0);
    insights.push({
      type: "warning",
      category: "Inventory",
      title: `${fmt(tiedCapital)} in capital tied up in overstock`,
      detail: `${overstocked.map(m=>m.name).join(", ")} are above 90% of max stock. This capital is sitting on your shelves instead of generating returns or paying down supplier debt.`,
      financial: `If you redirected ${fmt(tiedCapital)} from overstock purchases to clearing your overdue debt at 5% interest, you would save ${fmt(tiedCapital*0.05)} in monthly interest charges.`,
      recommendation: `Reduce next order quantities for ${overstocked.map(m=>m.name).join(" and ")} by 40%. Use freed capital to pay down the overdue Local Distributor debt and eliminate interest charges.`,
      priority: 3,
    });
  }

  // ── Customer Intelligence ────────────────────────────────
  const creditCustomers = customers.filter(c => c.creditBalance > 0);
  const totalCredit = creditCustomers.reduce((s,c)=>s+c.creditBalance,0);
  const highCreditRisk = creditCustomers.filter(c => c.creditBalance/c.creditLimit > 0.7);

  if (totalCredit > 0) insights.push({
    type: "warning",
    category: "Customers",
    title: `${fmt(totalCredit)} in customer credit outstanding`,
    detail: `${creditCustomers.length} customers owe credit. ${highCreditRisk.length > 0 ? `${highCreditRisk.map(c=>`${c.firstName} ${c.lastName}`).join(", ")} are at over 70% of their credit limit — high collection risk.` : "Most are within safe limits."} Credit extended without collection timelines becomes bad debt.`,
    financial: `If you collect ${fmt(totalCredit)} this month, you can fully cover the overdue supplier debt of $350 and eliminate the 5% monthly interest charge — saving ${fmt(350*0.05)} monthly going forward.`,
    recommendation: `Contact ${highCreditRisk.map(c=>c.firstName).join(" and ")} by WhatsApp this week for payment. Set a firm 30-day collection rule going forward. Consider requiring mobile money deposit for first-time credit customers.`,
    priority: 2,
  });

  const topCustomers = [...customers].sort((a,b)=>b.totalSpend-a.totalSpend).slice(0,3);
  const topSpend = topCustomers.reduce((s,c)=>s+c.totalSpend,0);
  const totalSpend = customers.reduce((s,c)=>s+c.totalSpend,0);
  insights.push({
    type: "opportunity",
    category: "Customers",
    title: `Top 3 customers represent ${((topSpend/totalSpend)*100).toFixed(0)}% of lifetime revenue`,
    detail: `${topCustomers.map(c=>`${c.firstName} ${c.lastName} (${fmt(c.totalSpend)})`).join(", ")} are your most valuable patients. They have chronic conditions requiring regular refills — predictable revenue you can plan around.`,
    financial: `If each top customer visits just once more per month, that's an estimated ${fmt(topCustomers.length * topCustomers.reduce((s,c)=>s+c.totalSpend/c.visitCount,0)/topCustomers.length * 1)} in additional monthly revenue.`,
    recommendation: `Set up recurring refill reminders for all 3. Agnes Freeman's Metformin and Mary Johnson's Metformin are monthly purchases — automate reminders 5 days before expected refill. Consider a loyalty discount of 5% for 10+ visit customers.`,
    priority: 3,
  });

  // ── Financial Intelligence ───────────────────────────────
  insights.push({
    type: "opportunity",
    category: "Financials",
    title: "Supplier price gap is costing you ~15% on procurement",
    detail: `You paid $2.80/unit for Artemether from PharmaCorp. HealthBridge Distributors offers the same product at $2.45 — an 12.5% saving. Across your full monthly procurement of ~$1,420, similar gaps likely exist on multiple products.`,
    financial: `A 12% average saving across $1,420 monthly procurement = ${fmt(1420*0.12)} saved per month = ${fmt(1420*0.12*12)} per year. That's nearly 2 months of rent recovered annually just by comparing prices.`,
    recommendation: `Before every reorder, check the Supplier Marketplace tab. Set a rule: always compare at least 2 suppliers for orders above $50. For Artemether specifically, switch to HealthBridge on next order. Track savings in the financials tab monthly.`,
    priority: 2,
  });

  insights.push({
    type: "info",
    category: "Financials",
    title: "Margin is healthy but cash flow timing creates risk",
    detail: `Your 55.6% gross margin is above the 45% regional average — well managed. However, your overdue debt ($350) and credit outstanding (${fmt(totalCredit)}) create a cash flow timing mismatch. Inflows are spread across the month but supplier payments cluster at specific dates.`,
    financial: `Current cash on hand: $3,240. Upcoming outflows: $1,370. Comfortable — but the overdue $350 is accruing 5% monthly interest ($17.50/month). Over a year that's ${fmt(350*0.05*12)} in unnecessary charges.`,
    recommendation: `Pay the $350 overdue balance to Local Distributor immediately — it's the highest-priority debt. Then build a 7-day cash reserve rule: never let cash on hand drop below 1 week of estimated expenses ($500). This prevents future late payment situations.`,
    priority: 2,
  });

  // ── Operational Intelligence ─────────────────────────────
  const malariaMeds = medicines.filter(m => m.category === "Antimalarials");
  insights.push({
    type: "opportunity",
    category: "Operations",
    title: "Malaria season approaching — prepare inventory now",
    detail: `Artemether and Chloroquine are your antimalarials. Malaria season in Liberia peaks May–October. Artemether is already critically low (8 units) with a velocity of 4.1/day. Historical patterns suggest demand increases 60-80% during peak season.`,
    financial: `At 60% increased demand, Artemether velocity rises to ~6.6/day. To cover 30 days you need 200 units. Current stock covers 2 days. Lost malaria sales during stockout = estimated ${fmt(6.6*30*5.50)} in missed revenue.`,
    recommendation: `Order 200 units of Artemether immediately. Stock up on Chloroquine before May. Consider negotiating a seasonal forward order with HealthBridge for antimalarials at locked pricing — this protects against price spikes during peak season.`,
    priority: 1,
  });

  return insights.sort((a,b) => a.priority - b.priority);
}

function BarChartSimple({data,color,height=48}){const max=Math.max(...data);return(<div style={{display:"flex",alignItems:"flex-end",gap:2,height}}>{data.map((v,i)=>(<div key={i} style={{flex:1,background:i===data.length-1?color:`${color}50`,borderRadius:"3px 3px 0 0",height:`${(v/max)*100}%`,minHeight:3}}/>))}</div>);}

export function AnalyticsScreen({ medicines, customers }) {
  const [activeSection, setActiveSection] = useState("insights");
  const [expandedInsight, setExpandedInsight] = useState(null);
  const insights = generateInsights(medicines, customers);

  const exportReport = () => {
    const date = new Date().toLocaleDateString("en-US", {day:"numeric",month:"long",year:"numeric"});
    const lines = [
      `NEVOUTMEDS — ANALYTICS REPORT`,
      `Monrovia Central Pharmacy`,
      `Generated: ${date}`,
      ``,
      `═══════════════════════════════════════`,
      `EXECUTIVE SUMMARY`,
      `═══════════════════════════════════════`,
      `Monthly Revenue: $4,820 (↑22% YoY)`,
      `Net Profit: $2,680 (55.6% margin)`,
      `Cash on Hand: $3,240`,
      `Total Inventory Value: $${medicines.reduce((s,m)=>s+m.stock*m.unitCost,0).toFixed(2)}`,
      `Active Customers: ${customers.length}`,
      `Outstanding Credit: $${customers.reduce((s,c)=>s+c.creditBalance,0).toFixed(2)}`,
      ``,
      `═══════════════════════════════════════`,
      `INSIGHTS & RECOMMENDATIONS (${insights.length} total)`,
      `═══════════════════════════════════════`,
      ...insights.map((ins, i) => [
        ``,
        `[${ins.type.toUpperCase()}] ${i+1}. ${ins.title}`,
        `Category: ${ins.category}`,
        ``,
        `WHAT IS HAPPENING:`,
        ins.detail,
        ``,
        `HOW IT AFFECTS YOUR FINANCIALS:`,
        ins.financial,
        ``,
        `RECOMMENDED ACTION:`,
        ins.recommendation,
        `───────────────────────────────────────`,
      ].join("\n")),
      ``,
      `═══════════════════════════════════════`,
      `INVENTORY STATUS`,
      `═══════════════════════════════════════`,
      ...medicines.map(m => `${m.name}: ${m.stock} units · ${m.dailyVelocity}/day · Expires ${m.expiryDate}`),
      ``,
      `═══════════════════════════════════════`,
      `CUSTOMER CREDIT SUMMARY`,
      `═══════════════════════════════════════`,
      ...customers.filter(c=>c.creditBalance>0).map(c=>`${c.firstName} ${c.lastName} (${c.phone}): $${c.creditBalance.toFixed(2)} outstanding`),
      ``,
      `─────────────────────────────────────────`,
      `Report generated by Nevoutmeds Platform`,
      `Never Out of Stock · nevoutmeds.com`,
    ];
    const content = lines.join("\n");
    const blob = new Blob([content], {type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `nevoutmeds_analytics_${new Date().toISOString().split("T")[0]}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const rows = [
      ["Metric","Value","Notes"],
      ["Monthly Revenue","$4,820","April 2026"],
      ["Net Profit","$2,680","55.6% margin"],
      ["Cash on Hand","$3,240",""],
      ["Outstanding Debt","$2,800","$350 overdue"],
      ["Customer Credit Out","$"+customers.reduce((s,c)=>s+c.creditBalance,0).toFixed(2),""],
      ...medicines.map(m=>["Stock: "+m.name,m.stock+" units",m.dailyVelocity+"/day velocity"]),
    ];
    const csv = rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="nevoutmeds_data.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const totalStockValue = medicines.reduce((s,m)=>s+m.stock*m.unitCost,0);
  const totalCredit = customers.reduce((s,c)=>s+c.creditBalance,0);
  const criticalCount = insights.filter(i=>i.type==="critical").length;
  const opportunityCount = insights.filter(i=>i.type==="opportunity").length;

  return (
    <div style={{padding:"28px 24px",maxWidth:1200,margin:"0 auto",fontFamily:FONT}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:SLATE,letterSpacing:"-0.02em"}}>Advanced Analytics</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:2}}>What's really happening · How it affects you · What to do next</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportCSV} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>⬇ Export CSV</button>
          <button onClick={exportReport} style={{padding:"9px 16px",borderRadius:9,border:"none",background:GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,display:"flex",alignItems:"center",gap:6}}>📄 Download Full Report</button>
        </div>
      </div>

      {/* High-level scorecard */}
      <div style={{background:"linear-gradient(135deg,#020617,#0c1a2e,#064e3b)",borderRadius:16,padding:"24px",marginBottom:24,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:20}}>
        {[
          {l:"Revenue MTD",v:"$4,820",s:"↑22% YoY",c:"#6ee7b7"},
          {l:"Net Margin",v:"55.6%",s:"Above regional avg",c:"#6ee7b7"},
          {l:"Cash Flow",v:"$3,240",s:"30d projected: $4,100",c:"#93c5fd"},
          {l:"Inventory",v:fmtK(totalStockValue),s:"at cost",c:"#c4b5fd"},
          {l:"Credit Risk",v:fmt(totalCredit),s:`${customers.filter(c=>c.creditBalance>0).length} customers`,c:"#fcd34d"},
          {l:"Alerts",v:criticalCount,s:`${opportunityCount} opportunities`,c:criticalCount>0?"#fca5a5":"#6ee7b7"},
        ].map((s,i)=>(
          <div key={i}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:22,fontWeight:900,color:s.c,letterSpacing:"-0.04em"}}>{s.v}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:3}}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{display:"flex",gap:4,marginBottom:22,background:"#f1f5f9",borderRadius:11,padding:4,width:"fit-content"}}>
        {[["insights","🧠 Insights & Actions"],["performance","📈 Performance"],["products","💊 Product Analytics"],["customers","👥 Customer Analytics"]].map(([v,l])=>(<button key={v} onClick={()=>setActiveSection(v)} style={{padding:"8px 16px",borderRadius:8,border:"none",background:activeSection===v?"#fff":"transparent",color:activeSection===v?SLATE:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT,boxShadow:activeSection===v?"0 1px 4px #0000001a":"none",transition:"all 0.15s",whiteSpace:"nowrap"}}>{l}</button>))}
      </div>

      {/* ── INSIGHTS TAB ── */}
      {activeSection==="insights"&&(
        <div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:18,padding:"14px 18px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0",lineHeight:1.6}}>
            <strong style={{color:SLATE}}>How to read these insights:</strong> Each insight tells you what's happening in your business, how it directly affects your money, and exactly what action to take. Prioritised by urgency — start at the top.
          </div>

          {insights.map((ins, i) => {
            const cfg = INSIGHT_TYPES[ins.type];
            const expanded = expandedInsight === i;
            return (
              <div key={i} onClick={()=>setExpandedInsight(expanded?null:i)} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${expanded?cfg.color:"#e2e8f0"}`,marginBottom:12,overflow:"hidden",cursor:"pointer",transition:"all 0.2s",boxShadow:expanded?`0 4px 20px ${cfg.color}20`:"0 1px 3px #0000000a",animation:`fadeUp 0.3s ${i*0.05}s both`}}>
                {/* Header */}
                <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:40,height:40,borderRadius:10,background:cfg.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cfg.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:cfg.bg,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.06em"}}>{cfg.label}</span>
                      <span style={{fontSize:10,fontWeight:600,color:"#94a3b8",background:"#f1f5f9",padding:"2px 8px",borderRadius:99}}>{ins.category}</span>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:SLATE,lineHeight:1.3}}>{ins.title}</div>
                  </div>
                  <div style={{fontSize:18,color:"#94a3b8",transition:"transform 0.2s",transform:expanded?"rotate(180deg)":"none"}}>⌄</div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{borderTop:`1px solid ${cfg.border}`,background:cfg.bg}}>
                    {/* What is happening */}
                    <div style={{padding:"16px 20px",borderBottom:`1px solid ${cfg.border}`}}>
                      <div style={{fontSize:10,fontWeight:700,color:cfg.color,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>📋 What is happening</div>
                      <div style={{fontSize:13,color:"#334155",lineHeight:1.7}}>{ins.detail}</div>
                    </div>
                    {/* Financial impact */}
                    <div style={{padding:"16px 20px",borderBottom:`1px solid ${cfg.border}`,background:"#fff"}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#f97316",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>💰 How this affects your finances</div>
                      <div style={{fontSize:13,color:"#334155",lineHeight:1.7}}>{ins.financial}</div>
                    </div>
                    {/* Recommendation */}
                    <div style={{padding:"16px 20px",background:cfg.bg}}>
                      <div style={{fontSize:10,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>✅ Recommended action</div>
                      <div style={{fontSize:13,color:"#334155",lineHeight:1.7,fontWeight:500}}>{ins.recommendation}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PERFORMANCE TAB ── */}
      {activeSection==="performance"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
            <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:SLATE}}>Daily Revenue — Last 30 Days</div>
                <div style={{fontSize:16,fontWeight:900,color:GREEN}}>$4,820</div>
              </div>
              <BarChartSimple data={[142,165,138,190,175,210,188,165,220,195,180,205,175,190,210,188,165,220,245,190,205,180,195,215,188,230,210,195,220,240]} color={GREEN} height={80}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#94a3b8",marginTop:6}}><span>Apr 1</span><span>Apr 22</span></div>
            </div>
            <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:13,fontWeight:800,color:SLATE,marginBottom:14}}>Revenue vs Expenses Trend</div>
              {[{l:"Revenue",v:4820,max:5000,c:GREEN},{l:"Expenses",v:2140,max:5000,c:"#f97316"},{l:"Profit",v:2680,max:5000,c:"#3b82f6"}].map((r,i)=>(<div key={i} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,fontWeight:600,color:"#475569"}}>{r.l}</span><span style={{fontSize:14,fontWeight:800,color:r.c}}>{fmt(r.v,0)}</span></div>
                <div style={{height:8,background:"#f1f5f9",borderRadius:99}}><div style={{height:"100%",width:`${(r.v/r.max)*100}%`,background:r.c,borderRadius:99,transition:"width 0.6s"}}/></div>
              </div>))}
              <div style={{padding:"10px 12px",background:"#f0fdf4",borderRadius:9,border:"1px solid #bbf7d0",fontSize:12,fontWeight:600,color:"#065f46",marginTop:6}}>✓ 55.6% margin · 10.6% above regional average</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
            {[
              {l:"Best Day",v:"Sunday",s:"$310 avg",c:"#10b981",icon:"🏆"},
              {l:"Slowest Day",v:"Tuesday",s:"$165 avg",c:"#f97316",icon:"📉"},
              {l:"Avg Transaction",v:"$13.80",s:"per customer",c:"#3b82f6",icon:"💳"},
              {l:"Customers / Day",v:"~31",s:"weekday average",c:"#8b5cf6",icon:"👥"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:13,padding:"16px 18px",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:20,marginBottom:6}}>{s.icon}</div>
                <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{s.s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {activeSection==="products"&&(
        <div>
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:18}}>
            <div style={{padding:"14px 20px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"grid",gridTemplateColumns:"2fr 0.8fr 0.8fr 0.8fr 1fr 1fr",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",gap:8}}>
              <span>Medicine</span><span>Stock</span><span>Velocity</span><span>Margin</span><span>Monthly Revenue</span><span>Performance</span>
            </div>
            {medicines.map((m,i)=>{
              const margin = ((m.sellingPrice-m.unitCost)/m.sellingPrice*100).toFixed(0);
              const monthlyRev = m.dailyVelocity * 30 * m.sellingPrice;
              const score = margin > 50 && m.dailyVelocity > 2 ? "Star" : margin < 30 ? "Low Margin" : m.dailyVelocity < 1 ? "Slow Mover" : "Steady";
              const scoreColor = score==="Star"?GREEN:score==="Low Margin"?"#ef4444":score==="Slow Mover"?"#f59e0b":"#3b82f6";
              return(
                <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 0.8fr 0.8fr 0.8fr 1fr 1fr",padding:"12px 20px",borderBottom:"1px solid #f8fafc",alignItems:"center",gap:8}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}
                >

// ═══════════════════════════════════════════════════════════
// ROOT APP — Complete Platform v3
// All 9 screens · Role-based · Full navigation
// ═══════════════════════════════════════════════════════════
export default function NevoutmedsApp(){
  const [user,setUser]=useState(null);
  const [screen,setScreen]=useState("dashboard");
  const [medicines,setMedicines]=useState(MEDICINES);
  const [customers,setCustomers]=useState(CUSTOMERS_SEED);
  const [toast,setToast]=useState(null);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3200);};

  if(!user)return <LoginScreen onLogin={u=>{setUser(u);setScreen("dashboard");}}/>;

  const alerts=medicines.map(m=>({...m,status:getStockStatus(m)})).filter(m=>["critical","low","expiring"].includes(m.status));
  const dueReminders=customers.filter(c=>c.reminders.some(r=>!r.sent));

  const navItems=[
    {id:"dashboard",  label:"Dashboard",  icon:"⬡"},
    {id:"inventory",  label:"Inventory",  icon:"📦", badge:alerts.length},
    {id:"customers",  label:"Customers",  icon:"👥"},
    {id:"suppliers",  label:"Suppliers",  icon:"🏢"},
    {id:"reminders",  label:"Reminders",  icon:"🔔", badge:dueReminders.length},
    ...(user.role==="owner"?[
      {id:"staff",      label:"Staff",      icon:"👤"},
      {id:"financials", label:"Financials", icon:"📊"},
      {id:"analytics",  label:"Analytics",  icon:"🧠"},
      {id:"documents",  label:"Documents",  icon:"📁"},
    ]:[]),
  ];

  const ownerOnly=["staff","financials","analytics","documents"];

  return(
    <div style={{fontFamily:FONT,background:"#f8fafc",minHeight:"100vh",display:"flex"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 3px #fecaca}50%{opacity:.6;box-shadow:0 0 0 6px #fecaca20}}
        input:focus,select:focus,textarea:focus{border-color:#10b981!important;box-shadow:0 0 0 3px #10b98115!important;outline:none!important;}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
        button:active{transform:scale(0.98)}
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{width:214,background:DARK,display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.04)"}}>
        {/* Logo */}
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#fff",flexShrink:0,boxShadow:"0 2px 10px #10b98140"}}>N</div>
            <div>
              <div style={{fontSize:15,fontWeight:900,color:"#fff",letterSpacing:"-0.02em"}}>Nevoutmeds</div>
              <div style={{fontSize:9,color:"#10b981",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:1}}>Never Out of Stock</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
          {/* Section label for owner-only items */}
          <div style={{fontSize:9,fontWeight:700,color:"#334155",textTransform:"uppercase",letterSpacing:"0.1em",padding:"6px 12px 4px"}}>Operations</div>
          {navItems.filter(i=>!["staff","financials","analytics","documents"].includes(i.id)).map(item=>(
            <button key={item.id} onClick={()=>setScreen(item.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:9,border:"none",background:screen===item.id?"rgba(16,185,129,0.15)":"transparent",color:screen===item.id?"#6ee7b7":"#64748b",fontSize:13,fontWeight:screen===item.id?700:500,cursor:"pointer",fontFamily:FONT,marginBottom:1,textAlign:"left",transition:"all 0.15s"}}>
              <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
              <span style={{flex:1}}>{item.label}</span>
              {item.badge>0&&<span style={{width:18,height:18,borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{item.badge}</span>}
            </button>
          ))}

          {user.role==="owner"&&<>
            <div style={{fontSize:9,fontWeight:700,color:"#334155",textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 12px 4px",marginTop:4}}>Owner Only</div>
            {navItems.filter(i=>["staff","financials","analytics","documents"].includes(i.id)).map(item=>(
              <button key={item.id} onClick={()=>setScreen(item.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:9,border:"none",background:screen===item.id?"rgba(16,185,129,0.15)":"transparent",color:screen===item.id?"#6ee7b7":"#64748b",fontSize:13,fontWeight:screen===item.id?700:500,cursor:"pointer",fontFamily:FONT,marginBottom:1,textAlign:"left",transition:"all 0.15s"}}>
                <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
                <span style={{flex:1}}>{item.label}</span>
              </button>
            ))}
          </>}
        </nav>

        {/* User footer */}
        <div style={{padding:"12px 8px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:9,background:"rgba(255,255,255,0.04)"}}>
            <Avatar name={user.name} size={28} bg={GREEN}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div>
              <div style={{fontSize:9,color:GREEN,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{user.role}</div>
            </div>
            <button onClick={()=>setUser(null)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:"3px 4px",borderRadius:5,transition:"color 0.15s"}} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{flex:1,overflowY:"auto",minHeight:"100vh"}}>
        {screen==="dashboard"   && <DashboardScreen  user={user} medicines={medicines} customers={customers} onNavigate={setScreen} onShowToast={showToast}/>}
        {screen==="inventory"   && <InventoryScreen  medicines={medicines} setMedicines={setMedicines} onShowToast={showToast}/>}
        {screen==="customers"   && <CustomersScreen  customers={customers} setCustomers={setCustomers} medicines={medicines} onShowToast={showToast}/>}
        {screen==="suppliers"   && <SuppliersScreen  medicines={medicines} onShowToast={showToast}/>}
        {screen==="reminders"   && <RemindersScreen  customers={customers} setCustomers={setCustomers} medicines={medicines} onShowToast={showToast}/>}
        {screen==="staff"       && user.role==="owner" && <StaffScreen      onShowToast={showToast}/>}
        {screen==="financials"  && user.role==="owner" && <FinancialsScreen customers={customers}/>}
        {screen==="analytics"   && user.role==="owner" && <AnalyticsScreen  medicines={medicines} customers={customers}/>}
        {screen==="documents"   && user.role==="owner" && <DocumentsScreen  onShowToast={showToast}/>}
        {ownerOnly.includes(screen) && user.role!=="owner" && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",flexDirection:"column",gap:12}}>
            <div style={{fontSize:32}}>🔒</div>
            <div style={{fontSize:15,fontWeight:700,color:"#334155"}}>Restricted to pharmacy owners</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>Contact John Kamara to request access</div>
          </div>
        )}
      </main>

      <Toast toast={toast}/>
    </div>
  );
}
