/* RideGo local server — dependency-free so it runs on restricted networks.
   Swap the JSON repository in production for the Mongoose repositories described in README. */
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { URL } = require('url'), { Server: SocketIOServer } = require('socket.io');
const ENV_PATH=path.join(__dirname,'.env');
if(fs.existsSync(ENV_PATH))for(const rawLine of fs.readFileSync(ENV_PATH,'utf8').split(/\r?\n/)){const line=rawLine.trim();if(!line||line.startsWith('#'))continue;const separator=line.indexOf('=');if(separator<1)continue;const key=line.slice(0,separator).trim(),rawValue=line.slice(separator+1).trim(),value=(rawValue.startsWith('"')&&rawValue.endsWith('"'))||(rawValue.startsWith("'")&&rawValue.endsWith("'"))?rawValue.slice(1,-1):rawValue;if(process.env[key]===undefined)process.env[key]=value;}
const ROOT = __dirname, PUBLIC = path.join(ROOT, 'public'), DATA = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'data.json');
// DATA_FILE is deliberately kept as a test/offline override. In normal local use,
// MONGODB_URI makes MongoDB the persistence source of truth.
const MONGODB_URI = process.env.DATA_FILE ? '' : String(process.env.MONGODB_URI || '').trim();
let MongoClient;
if(MONGODB_URI){
  try{({MongoClient}=require('mongodb'));}
  catch{console.error('MongoDB mode requires the mongodb package. Run npm install or unset MONGODB_URI to use local JSON storage.');process.exit(1);}
}
const PORT = Number(process.env.PORT || 3000), SECRET = process.env.JWT_ACCESS_SECRET || 'ridego-local-development-secret-change-me', REFRESH_SECRET=process.env.JWT_REFRESH_SECRET||SECRET;
const categories = [
  {id:'bike',name:'Bike',icon:'🏍️',seats:1,base:25,perKm:8,perMin:1.2,min:35,eta:3,enabled:true},
  {id:'economy',name:'Economy',icon:'🚕',seats:4,base:45,perKm:12,perMin:1.6,min:65,eta:5,enabled:true},
  {id:'sedan',name:'Sedan',icon:'🚖',seats:4,base:70,perKm:16,perMin:2,min:95,eta:7,enabled:true},
  {id:'suv',name:'SUV',icon:'🚙',seats:6,base:110,perKm:22,perMin:2.6,min:145,eta:9,enabled:true}
];
const now = () => new Date().toISOString();
const id = (p) => p + '_' + crypto.randomBytes(5).toString('hex');
const hash = (v, salt=crypto.randomBytes(16).toString('hex')) => { const h=crypto.scryptSync(v,salt,64).toString('hex'); return salt+':'+h; };
const verify = (v, saved) => { const [s,h]=saved.split(':'); return crypto.timingSafeEqual(Buffer.from(h,'hex'),crypto.scryptSync(v,s,64)); };
const baseData = () => ({ users:[
  {id:'admin_demo',role:'admin',name:'RideGo Admin',email:'admin@ridego.local',phone:'9000000000',password:hash('Admin@123'),status:'active',createdAt:now()},
  {id:'customer_demo',role:'customer',name:'Aarav Sharma',email:'customer@ridego.local',phone:'9000000001',password:hash('Customer@123'),wallet:350,rating:5,totalRides:12,createdAt:now()},
  {id:'driver_bike',role:'driver',name:'Rahul Verma',email:'driver@ridego.local',phone:'9000000002',password:hash('Driver@123'),status:'approved',online:true,category:'bike',vehicle:'Honda Activa • DL 1S AB 3421',rating:4.9,wallet:1840,location:{lat:28.6139,lng:77.2090},createdAt:now()},
  {id:'driver_car',role:'driver',name:'Priya Singh',email:'car@ridego.local',phone:'9000000003',password:hash('Driver@123'),status:'approved',online:true,category:'economy',vehicle:'Maruti Dzire • DL 1R CE 7788',rating:4.8,wallet:2260,location:{lat:28.615,lng:77.212},createdAt:now()}
], rides:[], payments:[], walletTransactions:[], driverEarnings:[], withdrawals:[], refunds:[], supportTickets:[], adminLogs:[], notifications:[], ratings:[], safetyIncidents:[], refreshSessions:[], serviceZones:[{id:'zone_delhi',name:'Central Delhi',city:'Delhi',active:true,geometry:{type:'Polygon',coordinates:[[[77.10,28.50],[77.35,28.50],[77.35,28.75],[77.10,28.75],[77.10,28.50]]]}}], incentives:[{id:'inc_five',name:'5 Ride Boost',description:'Complete 5 rides and earn ₹150',targetRides:5,reward:150,active:true}], categories:categories.map(x=>({...x})), coupons:[{id:'coupon_welcome',code:'WELCOME50',kind:'percent',value:50,max:50,min:100,usageLimit:1000,used:0,active:true},{id:'coupon_ridego',code:'RIDEGO20',kind:'fixed',value:20,max:20,min:80,usageLimit:5000,used:0,active:true}], settings:{brand:'RideGo',support:'+91 1800 000 1234',commission:20,searchRadius:5,platformFee:5,taxPct:5,surge:1,minWithdrawal:500,maxDailyWithdrawal:5000,withdrawalFee:0}});
const mongoCollections=['users','rides','payments','walletTransactions','driverEarnings','withdrawals','refunds','supportTickets','adminLogs','notifications','ratings','safetyIncidents','refreshSessions','serviceZones','incentives','categories','coupons'];
let db, mongoClient, mongoDatabase, io, persistenceMode='local-json', saveQueue=Promise.resolve();
function normaliseDb(value){
  const data=value&&typeof value==='object'?value:baseData();
  for(const collection of ['payments','walletTransactions','driverEarnings','withdrawals','refunds','supportTickets','adminLogs','notifications','ratings','safetyIncidents','refreshSessions'])data[collection]=data[collection]||[];
  data.users=data.users||baseData().users; data.rides=data.rides||[]; data.coupons=data.coupons||baseData().coupons;
  data.categories=data.categories||categories.map(x=>({...x}));
  data.serviceZones=data.serviceZones||[{id:'zone_delhi',name:'Central Delhi',city:'Delhi',active:true,geometry:{type:'Polygon',coordinates:[[[77.10,28.50],[77.35,28.50],[77.35,28.75],[77.10,28.75],[77.10,28.50]]]}}];
  data.incentives=data.incentives||[{id:'inc_five',name:'5 Ride Boost',description:'Complete 5 rides and earn ₹150',targetRides:5,reward:150,active:true}];
  for(const user of data.users)if(user.role==='driver'&&validPoint(user.location)){user.location=storedPoint(user.location);user.locationGeo=geoPoint(user.location);}
  for(const coupon of data.coupons)if(!coupon.id)coupon.id=id('coupon');
  data.settings={minWithdrawal:500,maxDailyWithdrawal:5000,withdrawalFee:0,...data.settings};
  return data;
}
function readFileDb(){ try{return normaliseDb(JSON.parse(fs.readFileSync(DATA,'utf8')));}catch{const data=normaliseDb(baseData());fs.writeFileSync(DATA,JSON.stringify(data,null,2));return data;} }
async function writeMongo(snapshot){
  for(const collection of mongoCollections){const target=mongoDatabase.collection(collection),documents=snapshot[collection]||[];await target.deleteMany({});if(documents.length)await target.insertMany(documents);}
  await mongoDatabase.collection('settings').updateOne({_id:'app'},{$set:{value:snapshot.settings}},{upsert:true});
}
async function initialisePersistence(){
  const fileDb=readFileDb();
  if(!MONGODB_URI){db=fileDb;return;}
  mongoClient=new MongoClient(MONGODB_URI,{serverSelectionTimeoutMS:5000});
  await mongoClient.connect(); mongoDatabase=mongoClient.db();
  const userCount=await mongoDatabase.collection('users').countDocuments();
  if(!userCount){db=fileDb;await writeMongo(db);}else{
    db={}; for(const collection of mongoCollections)db[collection]=await mongoDatabase.collection(collection).find({},{projection:{_id:0}}).toArray();
    const settings=await mongoDatabase.collection('settings').findOne({_id:'app'},{projection:{_id:0,value:1}});db.settings=settings?.value;
    db=normaliseDb(db);
  }
  persistenceMode='mongo-local';
}
function save(){
  if(!mongoDatabase){fs.writeFileSync(DATA,JSON.stringify(db,null,2));return;}
  const snapshot=structuredClone(db); saveQueue=saveQueue.catch(()=>{}).then(()=>writeMongo(snapshot));
  saveQueue.catch(error=>console.error('MongoDB persistence failed:',error.message));
}
const IS_PROD=process.env.NODE_ENV==='production';
const cookieMap=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));
function token(user,type='access',jti=id('jti')){const ttl=type==='refresh'?30*86400:15*60,h={alg:'HS256',typ:'JWT'},p={sub:user.id,role:user.role,type,jti,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+ttl},e=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),v=e(h)+'.'+e(p),signingSecret=type==='refresh'?REFRESH_SECRET:SECRET;return v+'.'+crypto.createHmac('sha256',signingSecret).update(v).digest('base64url');}
function decodeToken(value,type){try{const [h,p,s]=String(value||'').split('.'),signingSecret=type==='refresh'?REFRESH_SECRET:SECRET,expected=crypto.createHmac('sha256',signingSecret).update(h+'.'+p).digest('base64url');if(!h||!p||!s||s.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(p,'base64url'));return data.exp*1000>Date.now()&&(!type||data.type===type)?data:null;}catch{return null;}}
const sessionDigest=value=>crypto.createHash('sha256').update(value).digest('hex');
function issueTokens(user){const accessToken=token(user,'access'),refreshToken=token(user,'refresh'),payload=decodeToken(refreshToken,'refresh');db.refreshSessions=db.refreshSessions.filter(s=>s.expiresAt>Date.now()&&!s.revoked);db.refreshSessions.push({id:payload.jti,userId:user.id,digest:sessionDigest(refreshToken),expiresAt:payload.exp*1000,createdAt:now(),revoked:false});return {accessToken,refreshToken};}
function auth(req){const cookies=cookieMap(req),value=(req.headers.authorization||'').replace(/^Bearer /,'')||cookies.ridego_access,payload=decodeToken(value,'access'),user=payload?db.users.find(u=>u.id===payload.sub):null;return user&&!['suspended','blocked'].includes(user.status)?user:null;}
const authCookies=(accessToken,refreshToken)=>[`ridego_access=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900${IS_PROD?'; Secure':''}`,`ridego_refresh=${encodeURIComponent(refreshToken)}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=2592000${IS_PROD?'; Secure':''}`];
const clearAuthCookies=()=>[`ridego_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${IS_PROD?'; Secure':''}`,`ridego_refresh=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0${IS_PROD?'; Secure':''}`];
const safe=u=> { const {password,...x}=u; return x; };
const encryptOtp=value=>{const iv=crypto.randomBytes(12),key=crypto.createHash('sha256').update(SECRET).digest(),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');};
const decryptOtp=value=>{try{const [i,t,e]=value.split('.'),key=crypto.createHash('sha256').update(SECRET).digest(),decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(i,'base64url'));decipher.setAuthTag(Buffer.from(t,'base64url'));return Buffer.concat([decipher.update(Buffer.from(e,'base64url')),decipher.final()]).toString('utf8');}catch{return null;}};
const safeRide=(r,viewer)=> { const {otpHash,otpEncrypted,requests,locationHistory,internalNotes,...x}=r; if(viewer?.role==='customer'&&r.customerId===viewer.id&&['driver_assigned','driver_arriving','driver_arrived'].includes(r.status)&&otpEncrypted)x.rideOtp=decryptOtp(otpEncrypted); return x; };
function send(res,status,body,headers={}){ res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',...headers}); res.end(JSON.stringify(body)); }
function body(req){ return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy();});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(new Error('Invalid JSON'));}});}); }
function pointOf(p){if(!p)return null;const lat=p.lat??p.latitude??p.coordinates?.[1],lng=p.lng??p.longitude??p.coordinates?.[0];if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return null;const point={lat:Number(lat),lng:Number(lng)};return Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180?point:null;}
const validPoint=p=>!!pointOf(p);
const publicPoint=p=>{const point=pointOf(p);return point?{lat:point.lat,lng:point.lng}:null;};
const storedPoint=p=>{const point=pointOf(p);return point?{lat:point.lat,lng:point.lng,latitude:point.lat,longitude:point.lng}:null;};
const geoPoint=p=>{const point=pointOf(p);return point?{type:'Point',coordinates:[point.lng,point.lat]}:null;};
function setUserLocation(user,point,heading=0){const location=storedPoint(point);if(!location)return null;user.location=location;user.locationGeo=geoPoint(location);user.lastLocationAt=now();user.heading=Number(heading)||0;return location;}
function distance(a,b){ const pa=pointOf(a),pb=pointOf(b),r=6371,d=x=>x*Math.PI/180, x=d(pb.lat-pa.lat),y=d(pb.lng-pa.lng),z=Math.sin(x/2)**2+Math.cos(d(pa.lat))*Math.cos(d(pb.lat))*Math.sin(y/2)**2; return 2*r*Math.asin(Math.sqrt(z)); }
function estimate(data){ const routeKm=validPoint(data.pickupLocation)&&validPoint(data.destinationLocation)?distance(data.pickupLocation,data.destinationLocation)*1.22:0,km=Math.max(1,Number(data.distance)||routeKm||5), mins=Math.max(5,Number(data.minutes)||Math.round(km*4)); return db.categories.filter(c=>c.enabled).map(c=>{ const subtotal=Math.max(c.min,c.base+c.perKm*km+c.perMin*mins); const fee=db.settings.platformFee, tax=Math.round((subtotal+fee)*db.settings.taxPct)/100, fare=Math.round((subtotal+fee+tax)*db.settings.surge); return {...c,distance:Number(km.toFixed(1)),minutes:mins,fare,breakdown:{base:c.base,distance:Math.round(c.perKm*km),time:Math.round(c.perMin*mins),platformFee:fee,tax, surge:db.settings.surge}}; }); }
function nearbyDrivers(category,pickup,excluded=[]){if(!validPoint(pickup))return [];const busy=new Set(db.rides.filter(r=>['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status)).map(r=>r.driverId));return db.users.filter(d=>d.role==='driver'&&d.status==='approved'&&d.online&&d.category===category&&validPoint(d.location)&&!busy.has(d.id)&&!excluded.includes(d.id)).map(d=>({...d,distanceToPickup:Number(distance(d.location,pickup).toFixed(2))})).filter(d=>d.distanceToPickup<=Number(db.settings.searchRadius||5)).sort((a,b)=>a.distanceToPickup-b.distanceToPickup);}
const RAZORPAY_KEY_ID=String(process.env.RAZORPAY_KEY_ID||'').trim(),PAYMENT_SECRET=process.env.RAZORPAY_KEY_SECRET||SECRET;
const paymentSignature=(orderId,paymentId)=>crypto.createHmac('sha256',PAYMENT_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
function razorpayOrder(amount,receipt){return new Promise((resolve,reject)=>{const payload=JSON.stringify({amount:Math.round(amount*100),currency:'INR',receipt,payment_capture:1}),req=https.request({hostname:'api.razorpay.com',path:'/v1/orders',method:'POST',auth:`${RAZORPAY_KEY_ID}:${PAYMENT_SECRET}`,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>{try{const data=JSON.parse(raw||'{}');res.statusCode>=200&&res.statusCode<300?resolve(data):reject(new Error(data.error?.description||'Razorpay order creation failed'));}catch(error){reject(error);}});});req.on('error',reject);req.write(payload);req.end();});}
function walletEntry(user,type,amount,reason,reference,details={}){const entry={id:id('wtx'),userId:user.id,wallet:user.role,type,amount:Number(amount),reason,reference,rideId:details.rideId||null,balanceAfter:user.wallet||0,createdAt:now(),...details};db.walletTransactions.unshift(entry);return entry;}
function earningForRide(ride){
  const gross=Math.round(Number(ride.finalFare)||0),commission=Math.round(gross*Number(db.settings.commission||0))/100,net=Math.round((gross-commission)*100)/100;
  return {gross,commission,net};
}
function recordDriverEarning(ride,driver){
  if(!driver||db.driverEarnings.some(x=>x.rideId===ride.id))return null;
  const amounts=earningForRide(ride),entry={id:id('earn'),rideId:ride.id,rideCode:ride.rideCode,driverId:driver.id,customerId:ride.customerId,category:ride.category,gross:amounts.gross,platformFee:amounts.commission,net:amounts.net,status:'credited',completedAt:ride.completedAt||now(),createdAt:now()};
  db.driverEarnings.unshift(entry);driver.wallet=(driver.wallet||0)+entry.net;walletEntry(driver,'credit',entry.net,'ride_earning',entry.id,{rideId:ride.id,gross:entry.gross,platformFee:entry.platformFee});return entry;
}
function safePayment(payment){const {expectedSignature,...clean}=payment;return clean;}
function completePayment(ride,payment){ride.paymentStatus='completed';ride.paymentId=payment.id;ride.paidAt=now();payment.status='captured';payment.capturedAt=ride.paidAt;notify(ride.customerId,'payment','Payment successful',`Payment of ₹${payment.amount} was completed.`,{rideId:ride.id,paymentId:payment.id});emitRide(ride,'payment:updated',{status:'completed',paymentId:payment.id,amount:payment.amount});}
function audit(admin,action,targetType,targetId,details={}){db.adminLogs.unshift({id:id('log'),adminId:admin.id,action,targetType,targetId,details,createdAt:now()});if(db.adminLogs.length>2000)db.adminLogs.length=2000;}
function notify(userId,type,title,message,data={}){const item={id:id('notification'),userId,type,title,message,data,read:false,createdAt:now()};db.notifications.unshift(item);if(db.notifications.length>5000)db.notifications.length=5000;emitTo(userId,'notification:new',item);return item;}
function pageOf(items,url){const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||20)),total=items.length;return {items:items.slice((page-1)*limit,page*limit),page,limit,total,pages:Math.max(1,Math.ceil(total/limit))};}
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
function csvResponse(res,filename,headers,rows){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'});res.end('\ufeff'+headers.map(csvCell).join(',')+'\n'+rows.map(row=>row.map(csvCell).join(',')).join('\n'));}
function pointInPolygon(point,polygon){let inside=false;const ring=polygon?.coordinates?.[0]||[];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j],cross=yi>point.lat!==yj>point.lat&&point.lng<(xj-xi)*(point.lat-yi)/(yj-yi)+xi;if(cross)inside=!inside;}return inside;}
const zoneForPoint=point=>db.serviceZones.find(zone=>zone.active&&pointInPolygon(point,zone.geometry));
function dispatchScheduledRides(){
  let changed=false;
  for(const ride of db.rides.filter(item=>item.status==='scheduled'&&new Date(item.scheduledAt).getTime()<=Date.now())){
    const candidates=nearbyDrivers(ride.category,ride.pickupLocation).slice(0,10),requestedAt=now();
    ride.status=candidates.length?'searching':'no_driver_found';
    ride.requestExpiresAt=new Date(Date.now()+45000).toISOString();
    ride.requests=candidates.map(driver=>({driverId:driver.id,status:'pending',distanceToPickup:driver.distanceToPickup,requestedAt}));
    ride.timeline.push({status:ride.status,at:requestedAt,reason:'scheduled_pickup_time'});
    notify(ride.customerId,'ride',candidates.length?'Finding your driver':'No drivers available',candidates.length?'Your scheduled ride is now looking for a driver.':'We could not find a nearby driver for your scheduled ride.',{rideId:ride.id});
    for(const driver of candidates)emitTo(driver.id,'ride:request',{rideId:ride.id,rideCode:ride.rideCode,pickup:ride.pickup,destination:ride.destination,expiresAt:ride.requestExpiresAt});
    emitTo(ride.customerId,candidates.length?'ride:request:active':'ride:no-driver',{rideId:ride.id});
    changed=true;
  }
  if(changed)save();
}
function createShareToken(ride){const payload=Buffer.from(JSON.stringify({rideId:ride.id,exp:Date.now()+6*60*60*1000})).toString('base64url'),signature=crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');return `${payload}.${signature}`;}
function readShareToken(value){try{const [payload,signature]=String(value).split('.'),expected=crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.exp>Date.now()?data:null;}catch{return null;}}
const staticFile=(req,res)=>{ let f=new URL(req.url,'http://x').pathname; f=f==='/'?'/index.html':decodeURIComponent(f); const target=path.resolve(PUBLIC,'.'+f); if(!target.startsWith(PUBLIC)||!fs.existsSync(target)) return false; const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}; res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'}); fs.createReadStream(target).pipe(res);return true; };
const loginRate=new Map();
const eventStreams=new Map();
function emitTo(userId,event,data){for(const res of eventStreams.get(userId)||[])try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{};io?.to(`user:${userId}`).emit(event,data);}
function emitRide(ride,event,data={}){const payload={rideId:ride.id,...data};emitTo(ride.customerId,event,payload);if(ride.driverId)emitTo(ride.driverId,event,payload);io?.to(`ride:${ride.id}`).emit(event,payload);}
function openEventStream(req,res,user){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`event: connected\ndata: ${JSON.stringify({userId:user.id,time:now()})}\n\n`);const streams=eventStreams.get(user.id)||new Set();streams.add(res);eventStreams.set(user.id,streams);const heartbeat=setInterval(()=>{try{res.write(`event: ping\ndata: ${Date.now()}\n\n`);}catch{}},25000);req.on('close',()=>{clearInterval(heartbeat);streams.delete(res);if(!streams.size)eventStreams.delete(user.id);});}
function locationPayload(ride,driver,location,heading=0){const point=pointOf(location);return {rideId:ride.id,driverId:driver.id,latitude:point.lat,longitude:point.lng,location:{lat:point.lat,lng:point.lng},heading:Number(heading)||0,status:ride.status,at:driver.lastLocationAt};}
function broadcastDriverLocation(ride,driver,location,heading=0){const payload=locationPayload(ride,driver,location,heading);emitRide(ride,'ride:location:update',payload);io?.to(`ride:${ride.id}`).emit('driverLocationUpdated',payload);return payload;}
function socketUser(socket){const raw=socket.handshake.auth?.token||String(socket.handshake.headers.authorization||'').replace(/^Bearer /,'')||cookieMap({headers:{cookie:socket.handshake.headers.cookie||''}}).ridego_access,payload=decodeToken(raw,'access'),user=payload?db.users.find(u=>u.id===payload.sub):null;return user&&!['suspended','blocked'].includes(user.status)?user:null;}
function setupSocketIO(server){
  io=new SocketIOServer(server,{cors:{origin:[...allowedOrigins],credentials:true}});
  io.use((socket,next)=>{const user=socketUser(socket);if(!user)return next(new Error('Sign in required'));socket.user=user;next();});
  io.on('connection',socket=>{
    const user=socket.user;
    socket.join(`user:${user.id}`);
    for(const ride of db.rides.filter(r=>r.customerId===user.id||r.driverId===user.id))socket.join(`ride:${ride.id}`);
    socket.emit('connected',{userId:user.id,time:now()});
    socket.on('joinRide',({rideId}={},ack=()=>{})=>{
      const ride=db.rides.find(r=>r.id===rideId);
      if(!ride||![ride.customerId,ride.driverId].includes(user.id))return ack({ok:false,error:'Ride not found'});
      socket.join(`ride:${ride.id}`);ack({ok:true});
    });
    socket.on('driverLocation',({rideId,latitude,longitude,lat,lng,heading}={},ack=()=>{})=>{
      try{
        if(user.role!=='driver'||user.status!=='approved')throw Object.assign(new Error('Approved driver account required'),{status:403});
        const ride=db.rides.find(r=>r.id===rideId&&r.driverId===user.id&&['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status));
        const location=storedPoint({latitude:latitude??lat,longitude:longitude??lng});
        if(!ride)throw Object.assign(new Error('Active assigned ride not found'),{status:404});
        if(!location)throw Object.assign(new Error('A valid latitude and longitude are required'),{status:400});
        setUserLocation(user,location,heading);
        ride.locationHistory=ride.locationHistory||[];ride.locationHistory.push({location:publicPoint(location),at:user.lastLocationAt,heading:Number(heading)||0});
        if(ride.locationHistory.length>120)ride.locationHistory=ride.locationHistory.slice(-120);
        save();ack({ok:true,...broadcastDriverLocation(ride,user,location,heading)});
      }catch(error){ack({ok:false,error:error.message});}
    });
  });
}
async function assignDriverToRide(ride,driver,request){
  const assignedAt=now(),otp=String(crypto.randomInt(1000,10000)),changes={driverId:driver.id,status:'driver_assigned',otpHash:hash(otp),otpEncrypted:encryptOtp(otp),acceptedAt:assignedAt};
  if(mongoDatabase){
    const result=await mongoDatabase.collection('rides').findOneAndUpdate({id:ride.id,status:'searching','requests.driverId':driver.id,'requests.status':'pending'},{$set:{...changes,'requests.$.status':'accepted','requests.$.respondedAt':assignedAt},$push:{timeline:{status:'driver_assigned',at:assignedAt,driverId:driver.id}}},{returnDocument:'after',projection:{_id:0}});
    if(!result)throw Object.assign(new Error('This request is no longer available'),{status:409});
  }
  request.status='accepted';request.respondedAt=assignedAt;Object.assign(ride,changes);ride.timeline.push({status:'driver_assigned',at:assignedAt,driverId:driver.id});
  for(const other of ride.requests)if(other.driverId!==driver.id&&other.status==='pending'){other.status='closed';other.respondedAt=assignedAt;emitTo(other.driverId,'ride:request:closed',{rideId:ride.id});}
  return ride;
}
async function api(req,res,url){ const method=req.method, p=url.pathname, user=auth(req), need=(role)=>{if(!user)throw Object.assign(new Error('Sign in required'),{status:401}); if(role&&user.role!==role)throw Object.assign(new Error('Permission denied'),{status:403});};
  if(method==='GET'&&p==='/api/health') return send(res,200,{ok:true,mode:persistenceMode,time:now()});
  if(method==='GET'&&p==='/api/events'){need();openEventStream(req,res,user);return;}
  if(method==='POST'&&p==='/api/auth/refresh'){
    const refreshToken=cookieMap(req).ridego_refresh||String((await body(req)).refreshToken||''),payload=decodeToken(refreshToken,'refresh'),session=payload&&db.refreshSessions.find(s=>s.id===payload.jti&&s.userId===payload.sub&&!s.revoked&&s.expiresAt>Date.now()&&s.digest===sessionDigest(refreshToken)),account=payload&&db.users.find(u=>u.id===payload.sub);
    if(!session||!account||['suspended','blocked'].includes(account.status))return send(res,401,{error:'Refresh session is invalid or expired'},{'Set-Cookie':clearAuthCookies()});
    session.revoked=true;session.revokedAt=now();const issued=issueTokens(account);save();return send(res,200,{token:issued.accessToken,user:safe(account)},{'Set-Cookie':authCookies(issued.accessToken,issued.refreshToken)});
  }
  if(method==='POST'&&p==='/api/auth/logout'){
    const refreshToken=cookieMap(req).ridego_refresh,payload=decodeToken(refreshToken,'refresh'),session=payload&&db.refreshSessions.find(s=>s.id===payload.jti);
    if(session){session.revoked=true;session.revokedAt=now();save();}
    return send(res,200,{ok:true},{'Set-Cookie':clearAuthCookies()});
  }
  if(method==='POST'&&p==='/api/auth/register'){ const b=await body(req); if(!['customer','driver'].includes(b.role)||!b.name||!b.password||!b.phone)throw Object.assign(new Error('Name, phone, password and valid role are required'),{status:400}); if(db.users.some(u=>u.phone===b.phone||b.email&&u.email===b.email))throw Object.assign(new Error('Phone or email already registered'),{status:409}); const driverFields=b.role==='driver'?{status:'submitted',category:b.vehicleType||b.category||'economy',vehicle:[b.vehicleModel,b.vehicleNumber].filter(Boolean).join(' • '),drivingLicence:String(b.drivingLicence||b.licenseNumber||'').slice(0,80),vehicleNumber:String(b.vehicleNumber||'').slice(0,40),vehicleType:String(b.vehicleType||b.category||'economy').slice(0,40),rcNumber:String(b.rcNumber||b.rc||'').slice(0,80),profilePhotoUrl:String(b.profilePhotoUrl||'').slice(0,300),documentsSubmittedAt:now()}: {status:'active'}; const u={id:id('usr'),role:b.role,name:b.name,email:b.email||'',phone:b.phone,password:hash(b.password),...driverFields,online:false,wallet:0,rating:5,totalRides:0,ratingCount:0,emergencyContacts:[],createdAt:now()},issued=issueTokens(u); db.users.push(u);save();return send(res,201,{token:issued.accessToken,user:safe(u),message:b.role==='driver'?'Application submitted for verification.':'Welcome to RideGo!'},{'Set-Cookie':authCookies(issued.accessToken,issued.refreshToken)}); }
  if(method==='POST'&&p==='/api/auth/login'){const b=await body(req), key=req.socket.remoteAddress, hits=loginRate.get(key)||[]; const recent=hits.filter(t=>Date.now()-t<60000); if(recent.length>=10)throw Object.assign(new Error('Too many attempts. Try again shortly.'),{status:429}); loginRate.set(key,[...recent,Date.now()]); const u=db.users.find(x=>(x.email===b.identity||x.phone===b.identity)&&verify(b.password||'',x.password)); if(!u)throw Object.assign(new Error('Invalid email/phone or password'),{status:401});if(['suspended','blocked'].includes(u.status))throw Object.assign(new Error(`This account is ${u.status}. Contact support.`),{status:403});const issued=issueTokens(u);save();return send(res,200,{token:issued.accessToken,user:safe(u)},{'Set-Cookie':authCookies(issued.accessToken,issued.refreshToken)});}
  if(method==='GET'&&p==='/api/me'){need();return send(res,200,{user:safe(user)});}
  if(method==='GET'&&p==='/api/config')return send(res,200,{categories:db.categories,settings:db.settings,coupons:db.coupons.filter(c=>c.active)});
  if(method==='POST'&&p==='/api/fares/estimate'){need('customer');const b=await body(req),options=estimate(b),pickup=validPoint(b.pickupLocation)?b.pickupLocation:{lat:28.6139,lng:77.209};return send(res,200,{options:options.map(o=>({...o,nearbyDrivers:nearbyDrivers(o.id,pickup).length}))});}
  if(method==='POST'&&p==='/api/rides'){
    need('customer');
    const b=await body(req),pickup=validPoint(b.pickupLocation)?{lat:Number(b.pickupLocation.lat),lng:Number(b.pickupLocation.lng)}:{lat:28.6139,lng:77.2090},destination=validPoint(b.destinationLocation)?{lat:Number(b.destinationLocation.lat),lng:Number(b.destinationLocation.lng)}:{lat:28.623,lng:77.219},option=estimate({...b,pickupLocation:pickup,destinationLocation:destination}).find(x=>x.id===b.category);
    const serviceZone=zoneForPoint(pickup);
    if(!serviceZone)throw Object.assign(new Error('Pickup is outside an active RideGo service zone'),{status:400});
    if(!option)throw Object.assign(new Error('Choose an available vehicle category'),{status:400});
    if(db.rides.some(r=>r.customerId===user.id&&['searching','driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status)))throw Object.assign(new Error('Complete or cancel your active ride first'),{status:409});
    let discount=0,coupon=null;
    if(b.coupon){coupon=db.coupons.find(c=>c.active&&c.code===String(b.coupon).toUpperCase()&&(c.used||0)<(c.usageLimit||Infinity));if(!coupon)throw Object.assign(new Error('Coupon is invalid, expired, or fully used'),{status:400});if(option.fare<coupon.min)throw Object.assign(new Error(`Coupon needs a ₹${coupon.min} fare`),{status:400});discount=Math.min(coupon.max,coupon.kind==='percent'?Math.round(option.fare*coupon.value/100):coupon.value);}
    const scheduledAt=b.scheduledAt?new Date(b.scheduledAt):null;
    if(scheduledAt&&(!Number.isFinite(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()+5*60*1000))throw Object.assign(new Error('Choose a pickup time at least 5 minutes from now'),{status:400});
    const isScheduled=!!scheduledAt,candidates=isScheduled?[]:nearbyDrivers(b.category,pickup).slice(0,10),requestedAt=now(),status=isScheduled?'scheduled':candidates.length?'searching':'no_driver_found';
    const ride={id:id('ride'),rideCode:'RG'+Date.now().toString().slice(-7),customerId:user.id,driverId:null,category:b.category,serviceZoneId:serviceZone.id,pickup:b.pickup||'Current location',destination:b.destination||'Destination',pickupLocation:pickup,destinationLocation:destination,estimatedDistance:option.distance,estimatedDuration:option.minutes,estimatedFare:option.fare,finalFare:option.fare-discount,paymentMethod:b.paymentMethod||'cash',paymentStatus:'pending',coupon:coupon?.code||null,discount,status,scheduledAt:isScheduled?scheduledAt.toISOString():null,requests:candidates.map(d=>({driverId:d.id,status:'pending',distanceToPickup:d.distanceToPickup,requestedAt})),requestExpiresAt:isScheduled?null:new Date(Date.now()+45000).toISOString(),timeline:[{status,at:requestedAt},...(!isScheduled&&!candidates.length?[{status:'no_driver_found',at:requestedAt}]:[])],createdAt:requestedAt};
    db.rides.unshift(ride);if(coupon)coupon.used=(coupon.used||0)+1;save();
    for(const candidate of candidates)emitTo(candidate.id,'ride:request',{rideId:ride.id,rideCode:ride.rideCode,pickup:ride.pickup,destination:ride.destination,expiresAt:ride.requestExpiresAt});
    return send(res,201,{ride:safeRide(ride,user),nearbyDrivers:candidates.length,message:isScheduled?`Ride scheduled for ${scheduledAt.toLocaleString('en-IN')}.`:candidates.length?`Request sent to ${candidates.length} nearby driver${candidates.length===1?'':'s'}.`:'No nearby drivers are available right now.'});
  }
  if(method==='GET'&&p==='/api/rides'){need();return send(res,200,{rides:db.rides.filter(r=>user.role==='admin'||r.customerId===user.id||r.driverId===user.id).map(r=>safeRide(r,user))});}
  const trackingMatch=p.match(/^\/api\/rides\/([^/]+)\/tracking$/);
  if(trackingMatch&&method==='GET'){
    need();
    const ride=db.rides.find(r=>r.id===trackingMatch[1]);
    if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});
    if(user.role!=='admin'&&ride.customerId!==user.id&&ride.driverId!==user.id)throw Object.assign(new Error('Permission denied'),{status:403});
    const driver=db.users.find(d=>d.id===ride.driverId),target=ride.status==='ride_started'?ride.destinationLocation:ride.pickupLocation,remaining=driver&&validPoint(driver.location)&&validPoint(target)?Number(distance(driver.location,target).toFixed(2)):null;
    return send(res,200,{ride:safeRide(ride,user),driver:driver?{id:driver.id,name:driver.name,phone:driver.phone,rating:driver.rating,vehicle:driver.vehicle,location:publicPoint(driver.location),lastLocationAt:driver.lastLocationAt}:null,remainingDistance:remaining,etaMinutes:remaining===null?null:Math.max(1,Math.round(remaining*4))});
  }
  if(method==='GET'&&p==='/api/drivers/requests'){
    need('driver');
    if(!user.online)return send(res,200,{requests:[]});
    let changed=false;
    for(const r of db.rides.filter(x=>x.status==='searching'&&new Date(x.requestExpiresAt).getTime()<=Date.now())){
      for(const request of r.requests||[])if(request.status==='pending'){request.status='expired';request.respondedAt=now();changed=true;}
      r.status='no_driver_found';r.timeline.push({status:'no_driver_found',at:now(),reason:'request_expired'});emitTo(r.customerId,'ride:no-driver',{rideId:r.id,reason:'request_expired'});changed=true;
    }
    if(changed)save();
    const requests=db.rides.filter(r=>r.status==='searching'&&(r.requests||[]).some(x=>x.driverId===user.id&&x.status==='pending')).map(r=>{const customer=db.users.find(x=>x.id===r.customerId),request=r.requests.find(x=>x.driverId===user.id);return {...safeRide(r,user),customer:customer?{name:customer.name,rating:customer.rating||5}:null,distanceToPickup:request.distanceToPickup,estimatedEarning:Math.round(r.finalFare*(100-db.settings.commission)/100)};});
    return send(res,200,{requests});
  }
  const responseMatch=p.match(/^\/api\/rides\/([^/]+)\/(accept|reject)$/);
  if(responseMatch&&method==='POST'){
    need('driver');
    const ride=db.rides.find(r=>r.id===responseMatch[1]),action=responseMatch[2];
    if(!ride)throw Object.assign(new Error('Ride request not found'),{status:404});
    const request=(ride.requests||[]).find(x=>x.driverId===user.id);
    if(!request||request.status!=='pending')throw Object.assign(new Error('This request is no longer available'),{status:409});
    if(ride.status!=='searching'||new Date(ride.requestExpiresAt).getTime()<=Date.now())throw Object.assign(new Error('This request has expired'),{status:409});
    if(action==='reject'){
      request.status='rejected';request.respondedAt=now();
      if(!ride.requests.some(x=>x.status==='pending')){ride.status='no_driver_found';ride.timeline.push({status:'no_driver_found',at:now(),reason:'all_rejected'});emitTo(ride.customerId,'ride:no-driver',{rideId:ride.id,reason:'all_rejected'});}
      save();return send(res,200,{message:'Ride request declined.'});
    }
    if(!user.online||user.status!=='approved')throw Object.assign(new Error('Go online with an approved account before accepting rides'),{status:403});
    if(db.rides.some(r=>r.driverId===user.id&&['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status)))throw Object.assign(new Error('Complete your active ride first'),{status:409});
    await assignDriverToRide(ride,user,request);
    notify(ride.customerId,'ride','Driver assigned',`${user.name} accepted your ride.`,{rideId:ride.id});save();emitRide(ride,'ride:driver:assigned',{status:ride.status,driver:{id:user.id,name:user.name,rating:user.rating,vehicle:user.vehicle,location:publicPoint(user.location)}});return send(res,200,{ride:safeRide(ride,user),message:'Ride accepted. Navigate to the pickup.'});
  }
  const rm=p.match(/^\/api\/rides\/([^/]+)(?:\/(arriving|arrive|start|complete|cancel))?$/);
  if(rm&&method==='POST'){
    need();
    const r=db.rides.find(x=>x.id===rm[1]);
    if(!r)throw Object.assign(new Error('Ride not found'),{status:404});
    const act=rm[2],b=await body(req);
    if(!act)return send(res,200,{ride:safeRide(r,user)});
    if(act==='cancel'&&![r.customerId,r.driverId].includes(user.id)&&user.role!=='admin')throw Object.assign(new Error('Only a ride participant or an admin can cancel'),{status:403});
    if(['arriving','arrive','start','complete'].includes(act)&&r.driverId!==user.id&&user.role!=='admin')throw Object.assign(new Error('Only the assigned driver can update this ride'),{status:403});
    const allowed={arriving:['driver_assigned'],arrive:['driver_arriving'],start:['driver_arrived'],complete:['ride_started'],cancel:['scheduled','searching','driver_assigned','driver_arriving','driver_arrived']};
    if(!allowed[act].includes(r.status))throw Object.assign(new Error(`Ride cannot ${act} while it is ${r.status.replaceAll('_',' ')}`),{status:409});
    if(act==='start'){
      if((r.otpAttempts||0)>=5)throw Object.assign(new Error('OTP attempts exceeded. Contact support.'),{status:429});
      if(!b.otp||!r.otpHash||!verify(b.otp,r.otpHash)){r.otpAttempts=(r.otpAttempts||0)+1;save();throw Object.assign(new Error(`Ride OTP is incorrect. ${Math.max(0,5-r.otpAttempts)} attempts left.`),{status:400});}
    }
    const at=now(),map={arriving:'driver_arriving',arrive:'driver_arrived',start:'ride_started',complete:'ride_completed',cancel:user.role==='admin'?'cancelled_by_admin':user.id===r.driverId?'cancelled_by_driver':'cancelled_by_customer'};
    r.status=map[act];r.timeline.push({status:r.status,at,by:user.id});
    if(act==='arriving')r.arrivingAt=at;
    if(act==='arrive')r.arrivalAt=at;
    if(act==='start'){r.startedAt=at;r.otpHash=null;r.otpEncrypted=null;}
    if(act==='cancel')for(const request of r.requests||[])if(request.status==='pending')request.status='closed';
    if(act==='complete'){r.completedAt=at;r.paymentStatus=r.paymentMethod==='cash'?'completed':'payment_pending';const d=db.users.find(x=>x.id===r.driverId),customer=db.users.find(x=>x.id===r.customerId);recordDriverEarning(r,d);if(customer)customer.totalRides=(customer.totalRides||0)+1;}
    const notices={arriving:['Driver arriving','Your driver is on the way to the pickup.'],arrive:['Driver arrived','Your driver is waiting at the pickup.'],start:['Ride started','Your trip is now in progress.'],complete:['Ride completed',`Your final fare is ₹${r.finalFare}.`],cancel:['Ride cancelled','This ride has been cancelled.']};
    if(act==='cancel'){if(r.driverId&&user.id!==r.driverId)notify(r.driverId,'ride',...notices.cancel,{rideId:r.id});if(user.id!==r.customerId)notify(r.customerId,'ride',...notices.cancel,{rideId:r.id});}else notify(r.customerId,'ride',...notices[act],{rideId:r.id});
    save();
    const events={arriving:'ride:driver:arriving',arrive:'ride:driver:arrived',start:'ride:started',complete:'ride:completed',cancel:'ride:cancelled'};
    emitRide(r,events[act],{status:r.status,at});
    return send(res,200,{ride:safeRide(r,user)});
  }
  if(method==='POST'&&p==='/api/drivers/online'){need('driver');if(user.status!=='approved')throw Object.assign(new Error('Your account is awaiting approval'),{status:403});const b=await body(req),wasOnline=!!user.online;user.online=!!b.online;if(user.online&&!wasOnline)user.lastOnlineAt=now();if(!user.online&&wasOnline)user.lastOfflineAt=now();if(b.location)setUserLocation(user,b.location,b.heading);save();return send(res,200,{user:safe(user)});}
  if(method==='POST'&&p==='/api/drivers/location'){need('driver');const b=await body(req),location=storedPoint(b.location||b);if(!location)throw Object.assign(new Error('A valid location is required'),{status:400});setUserLocation(user,location,b.heading);const active=db.rides.find(r=>r.driverId===user.id&&['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status));if(active){active.locationHistory=active.locationHistory||[];active.locationHistory.push({location:publicPoint(location),at:user.lastLocationAt,heading:Number(b.heading)||0});if(active.locationHistory.length>120)active.locationHistory=active.locationHistory.slice(-120);}save();if(active)broadcastDriverLocation(active,user,location,b.heading);return send(res,200,{ok:true,activeRideId:active?.id||null,location:publicPoint(location)});}
  if(method==='GET'&&p==='/api/wallets'){
    need();
    const pending=user.role==='driver'?db.withdrawals.filter(w=>w.driverId===user.id&&['requested','processing'].includes(w.status)).reduce((sum,w)=>sum+w.amount+w.fee,0):0;
    return send(res,200,{balance:user.wallet||0,pending,available:Math.max(0,(user.wallet||0)-pending),transactions:db.walletTransactions.filter(t=>t.userId===user.id).slice(0,100)});
  }
  if(method==='POST'&&p==='/api/wallets/topup'){
    need('customer');
    if(process.env.NODE_ENV==='production')throw Object.assign(new Error('Use the configured payment gateway for production wallet top-ups'),{status:503});
    const b=await body(req),amount=Math.round(Number(b.amount)),key=String(b.idempotencyKey||'');
    if(!key)throw Object.assign(new Error('Idempotency key is required'),{status:400});
    if(amount<10||amount>10000)throw Object.assign(new Error('Top-up amount must be between ₹10 and ₹10,000'),{status:400});
    const existing=db.payments.find(x=>x.idempotencyKey===key&&x.userId===user.id);
    if(existing)return send(res,200,{payment:safePayment(existing),balance:user.wallet});
    const payment={id:id('pay'),orderId:id('topup'),paymentId:id('local'),userId:user.id,type:'wallet_topup',amount,status:'captured',provider:'local_signed',idempotencyKey:key,createdAt:now(),capturedAt:now()};
    user.wallet=(user.wallet||0)+amount;db.payments.unshift(payment);walletEntry(user,'credit',amount,'wallet_topup',payment.id);notify(user.id,'payment','Wallet top-up successful',`₹${amount} was added to your RideGo Wallet.`,{paymentId:payment.id});save();return send(res,201,{payment:safePayment(payment),balance:user.wallet});
  }
  if(method==='GET'&&p==='/api/payments'){need();const payments=user.role==='admin'?db.payments:db.payments.filter(x=>x.userId===user.id||user.role==='driver'&&x.driverId===user.id);return send(res,200,{payments:payments.map(safePayment)});}
  if(method==='POST'&&p==='/api/payments/orders'){
    need('customer');
    const b=await body(req),ride=db.rides.find(r=>r.id===b.rideId&&r.customerId===user.id),key=String(b.idempotencyKey||'');
    if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});
    if(ride.status!=='ride_completed'||ride.paymentStatus==='completed')throw Object.assign(new Error('This ride is not awaiting online payment'),{status:409});
    if(!key)throw Object.assign(new Error('Idempotency key is required'),{status:400});
    const prior=db.payments.find(x=>x.idempotencyKey===key&&x.userId===user.id);
    if(prior)return send(res,200,{order:safePayment(prior),testPayment:prior.provider==='local_signed'?{paymentId:prior.testPaymentId,signature:prior.expectedSignature}:undefined});
    let orderId=id('order'),provider='local_signed',razorpay=null;
    if(RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET){razorpay=await razorpayOrder(ride.finalFare,ride.rideCode);orderId=razorpay.id;provider='razorpay';}
    const testPaymentId=id('payref'),payment={id:id('pay'),orderId,testPaymentId,userId:user.id,rideId:ride.id,type:'ride_payment',amount:ride.finalFare,currency:'INR',status:'created',provider,idempotencyKey:key,expectedSignature:paymentSignature(orderId,testPaymentId),createdAt:now()};
    db.payments.unshift(payment);save();return send(res,201,{order:{...safePayment(payment),keyId:provider==='razorpay'?RAZORPAY_KEY_ID:undefined,amountPaise:Math.round(ride.finalFare*100),razorpay},testPayment:provider==='local_signed'?{paymentId:testPaymentId,signature:payment.expectedSignature}:undefined});
  }
  if(method==='POST'&&p==='/api/payments/verify'){
    need('customer');
    const b=await body(req),payment=db.payments.find(x=>x.orderId===b.orderId&&x.userId===user.id);
    if(!payment)throw Object.assign(new Error('Payment order not found'),{status:404});
    if(payment.status==='captured')return send(res,200,{payment:safePayment(payment),message:'Payment was already verified.'});
    const signature=paymentSignature(payment.orderId,String(b.paymentId||'')),provided=String(b.signature||''),validSignature=provided.length===signature.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(provided));
    if(!validSignature)throw Object.assign(new Error('Payment signature verification failed'),{status:400});
    const ride=db.rides.find(r=>r.id===payment.rideId);
    if(!ride||ride.finalFare!==payment.amount)throw Object.assign(new Error('Server fare validation failed'),{status:409});
    payment.paymentId=String(b.paymentId);completePayment(ride,payment);save();return send(res,200,{payment:safePayment(payment),ride:safeRide(ride,user),message:'Payment successful.'});
  }
  if(method==='POST'&&p==='/api/payments/wallet'){
    need('customer');
    const b=await body(req),ride=db.rides.find(r=>r.id===b.rideId&&r.customerId===user.id);
    if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});
    if(ride.paymentStatus==='completed')return send(res,200,{ride:safeRide(ride,user),balance:user.wallet,message:'Payment was already completed.'});
    if(ride.status!=='ride_completed')throw Object.assign(new Error('Complete the ride before payment'),{status:409});
    if((user.wallet||0)<ride.finalFare)throw Object.assign(new Error('Insufficient wallet balance'),{status:409});
    user.wallet-=ride.finalFare;const payment={id:id('pay'),userId:user.id,rideId:ride.id,type:'ride_payment',amount:ride.finalFare,status:'captured',provider:'wallet',idempotencyKey:String(b.idempotencyKey||ride.id),createdAt:now()};db.payments.unshift(payment);walletEntry(user,'debit',ride.finalFare,'ride_payment',payment.id,{rideId:ride.id});completePayment(ride,payment);save();return send(res,200,{ride:safeRide(ride,user),balance:user.wallet,payment:safePayment(payment),message:'Paid from RideGo Wallet.'});
  }
  if(method==='GET'&&p==='/api/drivers/earnings'){
    need('driver');
    const today=new Date().toISOString().slice(0,10),items=db.driverEarnings.filter(e=>e.driverId===user.id),todayItems=items.filter(e=>String(e.completedAt||e.createdAt).startsWith(today)),onlineMinutes=Math.max(0,Math.round(((user.lastOfflineAt?new Date(user.lastOfflineAt).getTime():Date.now())-new Date(user.lastOnlineAt||now()).getTime())/60000));
    return send(res,200,{balance:user.wallet||0,total:items.reduce((sum,x)=>sum+x.net,0),today:{earnings:todayItems.reduce((sum,x)=>sum+x.net,0),trips:todayItems.length,onlineMinutes},rides:items.map(e=>({rideId:e.rideId,rideCode:e.rideCode,gross:e.gross,commission:e.platformFee,net:e.net,completedAt:e.completedAt}))});
  }
  if(method==='GET'&&p==='/api/withdrawals'){need();const withdrawals=user.role==='admin'?db.withdrawals:db.withdrawals.filter(w=>w.driverId===user.id);return send(res,200,{withdrawals});}
  if(method==='POST'&&p==='/api/withdrawals'){
    need('driver');
    const b=await body(req),amount=Math.round(Number(b.amount)),fee=Number(db.settings.withdrawalFee||0),pending=db.withdrawals.filter(w=>w.driverId===user.id&&['requested','processing'].includes(w.status)).reduce((sum,w)=>sum+w.amount+w.fee,0),today=new Date().toISOString().slice(0,10),todayTotal=db.withdrawals.filter(w=>w.driverId===user.id&&w.createdAt.startsWith(today)&&w.status!=='rejected').reduce((sum,w)=>sum+w.amount,0);
    if(amount<db.settings.minWithdrawal)throw Object.assign(new Error(`Minimum withdrawal is ₹${db.settings.minWithdrawal}`),{status:400});
    if(todayTotal+amount>db.settings.maxDailyWithdrawal)throw Object.assign(new Error(`Daily withdrawal limit is ₹${db.settings.maxDailyWithdrawal}`),{status:400});
    if(amount+fee>(user.wallet||0)-pending)throw Object.assign(new Error('Insufficient withdrawable balance'),{status:409});
    const withdrawal={id:id('wd'),driverId:user.id,amount,fee,method:b.method==='bank'?'bank':'upi',destination:String(b.destination||user.upiId||'Not provided').slice(-80),accountName:String(b.accountName||user.name||'').slice(0,80),bankName:String(b.bankName||'').slice(0,80),ifsc:String(b.ifsc||'').slice(0,20),status:'requested',createdAt:now()};db.withdrawals.unshift(withdrawal);notify(user.id,'payment','Withdrawal requested',`Withdrawal request for ₹${amount} is pending review.`,{withdrawalId:withdrawal.id});save();return send(res,201,{withdrawal,message:'Withdrawal request submitted.'});
  }
  const withdrawalAction=p.match(/^\/api\/admin\/withdrawals\/([^/]+)\/(approve|reject)$/);
  if(withdrawalAction&&method==='POST'){
    need('admin');
    const withdrawal=db.withdrawals.find(w=>w.id===withdrawalAction[1]);
    if(!withdrawal)throw Object.assign(new Error('Withdrawal not found'),{status:404});
    if(withdrawal.status!=='requested')throw Object.assign(new Error('Withdrawal was already processed'),{status:409});
    const driver=db.users.find(u=>u.id===withdrawal.driverId),action=withdrawalAction[2];
    if(action==='approve'){if(!driver||(driver.wallet||0)<withdrawal.amount+withdrawal.fee)throw Object.assign(new Error('Driver balance is insufficient'),{status:409});driver.wallet-=withdrawal.amount+withdrawal.fee;withdrawal.status='completed';withdrawal.processingAt=now();withdrawal.reference=id('payout');withdrawal.completedAt=now();walletEntry(driver,'debit',withdrawal.amount+withdrawal.fee,'driver_withdrawal',withdrawal.id);}else{withdrawal.status='rejected';withdrawal.rejectedAt=now();}
    notify(withdrawal.driverId,'payment',action==='approve'?'Withdrawal approved':'Withdrawal rejected',action==='approve'?`₹${withdrawal.amount} payout has been completed.`:'Your withdrawal request was rejected.',{withdrawalId:withdrawal.id});save();emitTo(withdrawal.driverId,'payment:updated',{type:'withdrawal',status:withdrawal.status,withdrawalId:withdrawal.id});return send(res,200,{withdrawal});
  }
  if(method==='POST'&&p==='/api/admin/refunds'){
    need('admin');
    const b=await body(req),payment=db.payments.find(x=>x.id===b.paymentId),key=String(b.idempotencyKey||'');
    if(!payment)throw Object.assign(new Error('Payment not found'),{status:404});
    const existing=db.refunds.find(r=>r.idempotencyKey===key&&key);
    if(existing)return send(res,200,{refund:existing});
    const already=db.refunds.filter(r=>r.paymentId===payment.id&&r.status==='completed').reduce((sum,r)=>sum+r.amount,0),amount=Math.round(Number(b.amount||payment.amount));
    if(amount<=0||already+amount>payment.amount)throw Object.assign(new Error('Refund amount exceeds the captured payment'),{status:400});
    const customer=db.users.find(u=>u.id===payment.userId),refund={id:id('refund'),paymentId:payment.id,userId:payment.userId,rideId:payment.rideId,amount,status:'completed',method:'wallet_credit',idempotencyKey:key||id('idem'),createdAt:now()};
    if(customer){customer.wallet=(customer.wallet||0)+amount;walletEntry(customer,'credit',amount,'refund',refund.id,{rideId:payment.rideId});}
    db.refunds.unshift(refund);if(already+amount===payment.amount)payment.status='refunded';const ride=db.rides.find(r=>r.id===payment.rideId);if(ride)ride.paymentStatus=already+amount===payment.amount?'refunded':'partially_refunded';notify(payment.userId,'refund','Refund processed',`₹${amount} was credited to your RideGo Wallet.`,{refundId:refund.id});save();emitTo(payment.userId,'payment:updated',{type:'refund',status:'completed',amount});return send(res,201,{refund});
  }
  if(method==='GET'&&p==='/api/notifications'){need();return send(res,200,pageOf(db.notifications.filter(n=>n.userId===user.id),url));}
  if(method==='POST'&&p==='/api/notifications/read'){need();const b=await body(req);for(const item of db.notifications)if(item.userId===user.id&&(b.all||item.id===b.id))item.read=true;save();return send(res,200,{ok:true});}
  if(method==='GET'&&p==='/api/ratings'){need();return send(res,200,{ratings:db.ratings.filter(r=>r.targetId===user.id)});}
  if(method==='POST'&&p==='/api/ratings'){
    need();
    const b=await body(req),ride=db.rides.find(r=>r.id===b.rideId),value=Math.round(Number(b.rating));
    if(!ride||ride.status!=='ride_completed')throw Object.assign(new Error('Only completed rides can be rated'),{status:409});
    if(value<1||value>5)throw Object.assign(new Error('Rating must be from 1 to 5'),{status:400});
    const isCustomer=ride.customerId===user.id,isDriver=ride.driverId===user.id;
    if(!isCustomer&&!isDriver)throw Object.assign(new Error('Permission denied'),{status:403});
    if(db.ratings.some(r=>r.rideId===ride.id&&r.raterId===user.id))throw Object.assign(new Error('You already rated this ride'),{status:409});
    const targetId=isCustomer?ride.driverId:ride.customerId,rating={id:id('rating'),rideId:ride.id,raterId:user.id,targetId,raterRole:user.role,rating:value,tags:Array.isArray(b.tags)?b.tags.slice(0,5).map(x=>String(x).slice(0,40)):[],review:String(b.review||'').slice(0,500),flagged:!!b.flagged,createdAt:now()};
    db.ratings.unshift(rating);if(isCustomer)ride.customerRating=value;else ride.driverRating=value;const target=db.users.find(u=>u.id===targetId),received=db.ratings.filter(r=>r.targetId===targetId);if(target){target.ratingCount=received.length;target.rating=Number((received.reduce((sum,r)=>sum+r.rating,0)/received.length).toFixed(2));}notify(targetId,'rating','New ride rating',`You received a ${value}-star rating.`,{rideId:ride.id});save();return send(res,201,{rating});
  }
  const shareCreate=p.match(/^\/api\/rides\/([^/]+)\/share$/);
  if(shareCreate&&method==='POST'){need('customer');const ride=db.rides.find(r=>r.id===shareCreate[1]&&r.customerId===user.id);if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});const shareToken=createShareToken(ride);return send(res,200,{token:shareToken,path:`/share.html?token=${encodeURIComponent(shareToken)}`,expiresIn:21600});}
  const shareView=p.match(/^\/api\/public\/rides\/share\/([^/]+)$/);
  if(shareView&&method==='GET'){const shared=readShareToken(decodeURIComponent(shareView[1]));if(!shared)throw Object.assign(new Error('Share link is invalid or expired'),{status:401});const ride=db.rides.find(r=>r.id===shared.rideId),driver=db.users.find(u=>u.id===ride?.driverId);if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});return send(res,200,{ride:{rideCode:ride.rideCode,status:ride.status,pickup:ride.pickup,destination:ride.destination,pickupLocation:ride.pickupLocation,destinationLocation:ride.destinationLocation,startedAt:ride.startedAt,completedAt:ride.completedAt},driver:driver?{name:driver.name,rating:driver.rating,vehicle:driver.vehicle,location:driver.location,lastLocationAt:driver.lastLocationAt}:null});}
  if(method==='GET'&&p==='/api/emergency-contacts'){need('customer');return send(res,200,{contacts:user.emergencyContacts||[]});}
  if(method==='POST'&&p==='/api/emergency-contacts'){
    need('customer');
    const b=await body(req),name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),relationship=String(b.relationship||'Trusted contact').trim();
    if(!name||!phone)throw Object.assign(new Error('Contact name and phone are required'),{status:400});
    user.emergencyContacts=user.emergencyContacts||[];
    let contact=b.id?user.emergencyContacts.find(c=>c.id===b.id):null;if(!contact){contact={id:id('contact')};user.emergencyContacts.push(contact);}
    Object.assign(contact,{name:name.slice(0,80),phone:phone.slice(0,20),relationship:relationship.slice(0,40),email:String(b.email||'').slice(0,120),updatedAt:now()});
    save();return send(res,200,{contact,contacts:user.emergencyContacts});
  }
  const contactDelete=p.match(/^\/api\/emergency-contacts\/([^/]+)$/);
  if(contactDelete&&method==='POST'){need('customer');user.emergencyContacts=(user.emergencyContacts||[]).filter(c=>c.id!==contactDelete[1]);save();return send(res,200,{contacts:user.emergencyContacts});}
  if(method==='POST'&&p==='/api/safety/sos'){
    need();
    const b=await body(req),ride=db.rides.find(r=>r.id===b.rideId&&[r.customerId,r.driverId].includes(user.id)&&['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status));
    if(!ride)throw Object.assign(new Error('No active ride found for SOS'),{status:404});
    const customer=db.users.find(u=>u.id===ride.customerId),contacts=customer?.emergencyContacts||[],incident={id:id('sos'),rideId:ride.id,rideCode:ride.rideCode,customerId:ride.customerId,driverId:ride.driverId,userId:user.id,userRole:user.role,location:validPoint(b.location)?publicPoint(b.location):null,message:String(b.message||'Emergency assistance requested').slice(0,500),status:'open',contactNotifications:contacts.map(c=>({contactId:c.id,name:c.name,phone:c.phone,status:'queued',createdAt:now()})),createdAt:now()};db.safetyIncidents.unshift(incident);for(const admin of db.users.filter(u=>u.role==='admin'))notify(admin.id,'sos','Emergency SOS',`${user.name} triggered SOS on ${ride.rideCode}.`,{incidentId:incident.id,rideId:ride.id});const other=ride.customerId===user.id?ride.driverId:ride.customerId;if(other)notify(other,'sos','Ride safety alert','Emergency assistance was requested for this ride.',{rideId:ride.id});for(const contact of contacts)notify(ride.customerId,'sos','Emergency contact notified',`${contact.name} has been queued for SOS notification.`,{incidentId:incident.id,contactId:contact.id});save();emitRide(ride,'notification:new',{type:'sos',incidentId:incident.id});return send(res,201,{incident,message:`SOS sent to RideGo emergency support${contacts.length?` and ${contacts.length} emergency contact${contacts.length===1?'':'s'}`:''}.`});
  }
  if(method==='GET'&&p==='/api/incentives'){
    need('driver');
    const completed=db.rides.filter(r=>r.driverId===user.id&&r.status==='ride_completed').length,claims=user.incentiveClaims||[];
    return send(res,200,{incentives:db.incentives.filter(i=>i.active).map(i=>({...i,progress:Math.min(completed,i.targetRides),completed:completed>=i.targetRides,claimed:claims.includes(i.id)}))});
  }
  const incentiveClaim=p.match(/^\/api\/incentives\/([^/]+)\/claim$/);
  if(incentiveClaim&&method==='POST'){need('driver');const incentive=db.incentives.find(i=>i.id===incentiveClaim[1]&&i.active),completed=db.rides.filter(r=>r.driverId===user.id&&r.status==='ride_completed').length;user.incentiveClaims=user.incentiveClaims||[];if(!incentive)throw Object.assign(new Error('Incentive not found'),{status:404});if(completed<incentive.targetRides)throw Object.assign(new Error('Incentive target is not complete'),{status:409});if(user.incentiveClaims.includes(incentive.id))throw Object.assign(new Error('Incentive was already claimed'),{status:409});user.incentiveClaims.push(incentive.id);user.wallet=(user.wallet||0)+incentive.reward;walletEntry(user,'credit',incentive.reward,`Incentive: ${incentive.name}`,incentive.id);save();return send(res,200,{balance:user.wallet,message:`₹${incentive.reward} incentive added to your wallet.`});}
  if(method==='GET'&&p==='/api/service-zones')return send(res,200,{zones:db.serviceZones.filter(z=>z.active)});
  if(method==='GET'&&p==='/api/admin/zones'){need('admin');return send(res,200,{zones:db.serviceZones});}
  if(method==='POST'&&p==='/api/admin/zones'){
    need('admin');
    const b=await body(req),coordinates=b.geometry?.coordinates;
    if(!Array.isArray(coordinates?.[0])||coordinates[0].length<4)throw Object.assign(new Error('A valid GeoJSON polygon is required'),{status:400});
    let zone=b.id?db.serviceZones.find(z=>z.id===b.id):null;if(!zone){zone={id:id('zone')};db.serviceZones.push(zone);}Object.assign(zone,{name:String(b.name||'Service zone').slice(0,80),city:String(b.city||'').slice(0,60),active:b.active!==false,geometry:{type:'Polygon',coordinates}});audit(user,'zone.save','serviceZone',zone.id,{name:zone.name});save();return send(res,200,{zone});
  }
  if(method==='GET'&&p==='/api/admin/incentives'){need('admin');return send(res,200,{incentives:db.incentives});}
  if(method==='POST'&&p==='/api/admin/incentives'){need('admin');const b=await body(req);let incentive=b.id?db.incentives.find(i=>i.id===b.id):null;if(!incentive){incentive={id:id('inc')};db.incentives.push(incentive);}Object.assign(incentive,{name:String(b.name||'Ride incentive').slice(0,80),description:String(b.description||'').slice(0,200),targetRides:Math.max(1,Math.round(Number(b.targetRides)||1)),reward:Math.max(1,Math.round(Number(b.reward)||1)),active:b.active!==false});audit(user,'incentive.save','incentive',incentive.id);save();return send(res,200,{incentive});}
  if(method==='GET'&&p==='/api/support'){
    need();
    const tickets=user.role==='admin'?db.supportTickets:db.supportTickets.filter(t=>t.userId===user.id);
    return send(res,200,{tickets:tickets.map(t=>({...t,messages:t.messages.filter(m=>!m.internal)}))});
  }
  if(method==='POST'&&p==='/api/support'){
    need();
    const b=await body(req),category=String(b.category||'general').slice(0,40),description=String(b.description||'').trim();
    if(description.length<10)throw Object.assign(new Error('Please describe the issue in at least 10 characters'),{status:400});
    const ticket={id:id('ticket'),ticketCode:'SUP'+Date.now().toString().slice(-7),userId:user.id,userRole:user.role,rideId:b.rideId||null,category,subject:String(b.subject||category).slice(0,100),description:description.slice(0,2000),priority:'medium',status:'open',messages:[],createdAt:now(),updatedAt:now()};
    db.supportTickets.unshift(ticket);save();return send(res,201,{ticket,message:'Support ticket created.'});
  }
  const ticketReply=p.match(/^\/api\/admin\/support\/([^/]+)\/reply$/);
  if(ticketReply&&method==='POST'){
    need('admin');
    const b=await body(req),ticket=db.supportTickets.find(t=>t.id===ticketReply[1]);
    if(!ticket)throw Object.assign(new Error('Ticket not found'),{status:404});
    if(b.message)ticket.messages.push({id:id('msg'),senderId:user.id,senderRole:'admin',text:String(b.message).slice(0,2000),internal:!!b.internal,createdAt:now()});
    if(['open','assigned','waiting_for_user','resolved','closed'].includes(b.status))ticket.status=b.status;
    if(['low','medium','high','urgent'].includes(b.priority))ticket.priority=b.priority;
    ticket.updatedAt=now();audit(user,'support.reply','supportTicket',ticket.id,{status:ticket.status,priority:ticket.priority});notify(ticket.userId,'support','Support ticket updated',`Ticket ${ticket.ticketCode} is now ${ticket.status.replaceAll('_',' ')}.`,{ticketId:ticket.id});save();return send(res,200,{ticket});
  }
  if(method==='GET'&&p==='/api/admin/customers'){
    need('admin');
    const q=String(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status');
    let items=db.users.filter(u=>u.role==='customer'&&(!q||[u.name,u.email,u.phone].some(v=>String(v||'').toLowerCase().includes(q)))&&(!status||(u.status||'active')===status)).map(u=>({...safe(u),status:u.status||'active',rideCount:db.rides.filter(r=>r.customerId===u.id).length,paymentTotal:db.payments.filter(p=>p.userId===u.id&&p.status==='captured').reduce((sum,p)=>sum+p.amount,0)}));
    return send(res,200,pageOf(items,url));
  }
  if(method==='GET'&&p==='/api/admin/drivers'){
    need('admin');
    const q=String(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status');
    let items=db.users.filter(u=>u.role==='driver'&&(!q||[u.name,u.email,u.phone,u.vehicle].some(v=>String(v||'').toLowerCase().includes(q)))&&(!status||u.status===status)).map(u=>({...safe(u),rideCount:db.rides.filter(r=>r.driverId===u.id).length,pendingWithdrawals:db.withdrawals.filter(w=>w.driverId===u.id&&w.status==='requested').length}));
    return send(res,200,pageOf(items,url));
  }
  const userStatus=p.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if(userStatus&&method==='POST'){
    need('admin');
    const b=await body(req),target=db.users.find(u=>u.id===userStatus[1]&&u.role!=='admin'),allowed=target?.role==='driver'?['profile_incomplete','submitted','under_review','approved','rejected','suspended','blocked']:['active','suspended','blocked'];
    if(!target)throw Object.assign(new Error('User not found'),{status:404});
    if(!allowed.includes(b.status))throw Object.assign(new Error('Invalid account status'),{status:400});
    const previous=target.status||'active';target.status=b.status;if(b.status!=='approved'&&target.role==='driver')target.online=false;audit(user,'user.status',target.role,target.id,{from:previous,to:b.status,reason:String(b.reason||'')});save();return send(res,200,{user:safe(target)});
  }
  const walletAdjust=p.match(/^\/api\/admin\/customers\/([^/]+)\/wallet$/);
  if(walletAdjust&&method==='POST'){
    need('admin');
    const b=await body(req),target=db.users.find(u=>u.id===walletAdjust[1]&&u.role==='customer'),amount=Math.round(Number(b.amount));
    if(!target)throw Object.assign(new Error('Customer not found'),{status:404});
    if(!amount||Math.abs(amount)>50000)throw Object.assign(new Error('Adjustment must be between -₹50,000 and ₹50,000'),{status:400});
    if((target.wallet||0)+amount<0)throw Object.assign(new Error('Adjustment would create a negative balance'),{status:409});
    target.wallet=(target.wallet||0)+amount;walletEntry(target,amount>0?'credit':'debit',Math.abs(amount),String(b.reason||'Admin adjustment').slice(0,120),user.id);audit(user,'wallet.adjust','customer',target.id,{amount,reason:b.reason});save();emitTo(target.id,'payment:updated',{type:'wallet_adjustment',amount,balance:target.wallet});return send(res,200,{balance:target.wallet});
  }
  if(method==='GET'&&p==='/api/admin/rides'){
    need('admin');
    const q=String(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status'),category=url.searchParams.get('category');
    let items=db.rides.filter(r=>(!q||[r.rideCode,r.pickup,r.destination].some(v=>String(v||'').toLowerCase().includes(q)))&&(!status||r.status===status)&&(!category||r.category===category)).map(r=>({...safeRide(r,user),internalNotes:r.internalNotes||[]}));
    return send(res,200,pageOf(items,url));
  }
  const rideNote=p.match(/^\/api\/admin\/rides\/([^/]+)\/note$/);
  if(rideNote&&method==='POST'){
    need('admin');
    const b=await body(req),ride=db.rides.find(r=>r.id===rideNote[1]),text=String(b.text||'').trim();
    if(!ride)throw Object.assign(new Error('Ride not found'),{status:404});
    if(!text)throw Object.assign(new Error('Note cannot be empty'),{status:400});
    ride.internalNotes=ride.internalNotes||[];ride.internalNotes.push({id:id('note'),adminId:user.id,text:text.slice(0,1000),createdAt:now()});audit(user,'ride.note','ride',ride.id);save();return send(res,201,{notes:ride.internalNotes});
  }
  if(method==='GET'&&p==='/api/admin/pricing'){need('admin');return send(res,200,{categories:db.categories,settings:db.settings});}
  if(method==='POST'&&p==='/api/admin/pricing'){
    need('admin');
    const b=await body(req),category=db.categories.find(c=>c.id===b.categoryId),allowedFields=['name','base','perKm','perMin','min','eta','seats','enabled'];
    if(!category)throw Object.assign(new Error('Ride category not found'),{status:404});
    for(const field of allowedFields)if(b[field]!==undefined)category[field]=field==='name'?String(b[field]).slice(0,40):field==='enabled'?!!b[field]:Number(b[field]);
    audit(user,'pricing.update','category',category.id,{fields:Object.keys(b)});save();return send(res,200,{category});
  }
  if(method==='GET'&&p==='/api/admin/coupons'){need('admin');return send(res,200,{coupons:db.coupons});}
  if(method==='POST'&&p==='/api/admin/coupons'){
    need('admin');
    const b=await body(req),code=String(b.code||'').trim().toUpperCase();
    if(!code||!/^[A-Z0-9_-]{3,20}$/.test(code))throw Object.assign(new Error('Coupon code must be 3–20 letters or numbers'),{status:400});
    let coupon=b.id?db.coupons.find(c=>c.id===b.id):db.coupons.find(c=>c.code===code);
    if(!coupon){coupon={id:id('coupon'),used:0};db.coupons.unshift(coupon);}
    Object.assign(coupon,{code,kind:b.kind==='fixed'?'fixed':'percent',value:Math.max(1,Number(b.value)||1),max:Math.max(1,Number(b.max)||Number(b.value)||1),min:Math.max(0,Number(b.min)||0),usageLimit:Math.max(1,Number(b.usageLimit)||1000),active:b.active!==false,updatedAt:now()});
    audit(user,'coupon.save','coupon',coupon.id,{code});save();return send(res,200,{coupon});
  }
  if(method==='GET'&&p==='/api/admin/logs'){need('admin');return send(res,200,pageOf(db.adminLogs,url));}
  const report=p.match(/^\/api\/admin\/reports\/(rides|customers|drivers|payments|withdrawals|support)$/);
  if(report&&method==='GET'){
    need('admin');
    const type=report[1],definitions={
      rides:{headers:['Ride ID','Customer','Driver','Category','Status','Fare','Payment','Created'],rows:db.rides.map(r=>[r.rideCode,r.customerId,r.driverId,r.category,r.status,r.finalFare,r.paymentStatus,r.createdAt])},
      customers:{headers:['ID','Name','Email','Phone','Status','Wallet','Joined'],rows:db.users.filter(u=>u.role==='customer').map(u=>[u.id,u.name,u.email,u.phone,u.status||'active',u.wallet||0,u.createdAt])},
      drivers:{headers:['ID','Name','Phone','Status','Category','Online','Wallet'],rows:db.users.filter(u=>u.role==='driver').map(u=>[u.id,u.name,u.phone,u.status,u.category,u.online,u.wallet||0])},
      payments:{headers:['ID','User','Ride','Type','Amount','Provider','Status','Created'],rows:db.payments.map(x=>[x.id,x.userId,x.rideId,x.type,x.amount,x.provider,x.status,x.createdAt])},
      withdrawals:{headers:['ID','Driver','Amount','Fee','Method','Status','Created'],rows:db.withdrawals.map(x=>[x.id,x.driverId,x.amount,x.fee,x.method,x.status,x.createdAt])},
      support:{headers:['Ticket','User','Role','Category','Priority','Status','Created'],rows:db.supportTickets.map(x=>[x.ticketCode,x.userId,x.userRole,x.category,x.priority,x.status,x.createdAt])}
    };
    const data=definitions[type];audit(user,'report.export','report',type,{rows:data.rows.length});save();return csvResponse(res,`ridego-${type}.csv`,data.headers,data.rows);
  }
  if(method==='GET'&&p==='/api/admin/dashboard'){need('admin');const today=new Date().toISOString().slice(0,10),customers=db.users.filter(u=>u.role==='customer'),drivers=db.users.filter(u=>u.role==='driver'),completed=db.rides.filter(r=>r.status==='ride_completed'),cancelled=db.rides.filter(r=>String(r.status).startsWith('cancelled')),todayRides=db.rides.filter(r=>String(r.createdAt).startsWith(today)),todayCompleted=completed.filter(r=>String(r.completedAt||r.createdAt).startsWith(today)),revenue=completed.reduce((n,r)=>n+r.finalFare*db.settings.commission/100,0),days=[...Array(7)].map((_,i)=>{const d=new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10),rides=db.rides.filter(r=>String(r.createdAt).startsWith(d)),done=completed.filter(r=>String(r.completedAt||r.createdAt).startsWith(d));return {date:d,rides:rides.length,revenue:done.reduce((n,r)=>n+r.finalFare*db.settings.commission/100,0)};}),categoryDistribution=db.categories.map(c=>({category:c.id,rides:db.rides.filter(r=>r.category===c.id).length}));return send(res,200,{metrics:{customers:customers.length,drivers:drivers.length,online:drivers.filter(d=>d.online).length,pending:drivers.filter(d=>d.status!=='approved').length,rides:db.rides.length,active:db.rides.filter(r=>['driver_assigned','driver_arriving','driver_arrived','ride_started'].includes(r.status)).length,completed:completed.length,cancelled:cancelled.length,todayRides:todayRides.length,todayCompleted:todayCompleted.length,todayRevenue:todayCompleted.reduce((n,r)=>n+r.finalFare*db.settings.commission/100,0),revenue,averageFare:completed.length?Math.round(completed.reduce((n,r)=>n+r.finalFare,0)/completed.length):0,averageRating:db.ratings.length?Number((db.ratings.reduce((n,r)=>n+r.rating,0)/db.ratings.length).toFixed(2)):0,cancellationRate:db.rides.length?Number((cancelled.length*100/db.rides.length).toFixed(1)):0},analytics:{ridesPerDay:days,revenuePerDay:days,categoryDistribution,driverVerification:{approved:drivers.filter(d=>d.status==='approved').length,pending:drivers.filter(d=>d.status!=='approved').length,rejected:drivers.filter(d=>d.status==='rejected').length}},activeSos:db.safetyIncidents.filter(i=>i.status==='open').slice(0,20),users:db.users.map(safe),rides:db.rides.map(r=>safeRide(r,user)),categories:db.categories,settings:db.settings});}
  if(method==='POST'&&p==='/api/admin/driver-status'){need('admin');const b=await body(req),d=db.users.find(u=>u.id===b.driverId&&u.role==='driver');if(!d)throw Object.assign(new Error('Driver not found'),{status:404});d.status=b.status;d.online=b.status==='approved'?d.online:false;audit(user,'driver.status','driver',d.id,{status:b.status});save();return send(res,200,{driver:safe(d)});}
  if(method==='POST'&&p==='/api/admin/settings'){need('admin');const b=await body(req);db.settings={...db.settings,...b};audit(user,'settings.update','app','settings',{fields:Object.keys(b)});save();return send(res,200,{settings:db.settings});}
  throw Object.assign(new Error('API route not found'),{status:404});
}
const allowedOrigins=new Set([process.env.CLIENT_URL,process.env.ADMIN_URL,`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`].filter(Boolean));
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),origin=req.headers.origin,requestId=crypto.randomUUID();
  res.setHeader('X-Request-Id',requestId);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.razorpay.com; connect-src 'self' https://*.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'none'");
  if(origin&&allowedOrigins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
  if(origin&&IS_PROD&&!allowedOrigins.has(origin)&&url.pathname.startsWith('/api/'))return send(res,403,{error:'Origin is not allowed',requestId});
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  try{if(url.pathname.startsWith('/api/'))await api(req,res,url);else if(!staticFile(req,res))staticFile({url:'/'},res);}catch(e){send(res,e.status||500,{error:e.message||'Unexpected server error',requestId});}
});
setupSocketIO(server);
const scheduledRideTimer=setInterval(dispatchScheduledRides,10000);
scheduledRideTimer.unref();
async function start(){try{await initialisePersistence();server.listen(PORT,()=>console.log(`RideGo running at http://localhost:${PORT} (${persistenceMode})`));}catch(error){console.error(`RideGo could not connect to MongoDB: ${error.message}`);process.exit(1);}}
start();
function shutdown(signal){console.log(`${signal} received, closing RideGo`);for(const streams of eventStreams.values())for(const response of streams)response.end();server.close(async()=>{await saveQueue;await mongoClient?.close();process.exit(0);});setTimeout(()=>process.exit(1),8000).unref();}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
