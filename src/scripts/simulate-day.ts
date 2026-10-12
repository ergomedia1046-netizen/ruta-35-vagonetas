import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../db.js";

const seed = 350812;
const start = new Date("2026-01-15T08:00:00.000Z");
const end = new Date("2026-01-15T20:00:00.000Z");
const travelMinutes = 75;
const turnaroundMinutes = 30;
const directions = ["YACUIBA_TO_VILLAMONTES", "VILLAMONTES_TO_YACUIBA"] as const;
type Direction = typeof directions[number];
type Booking = { id: string; direction: Direction; passengers: number; kind: "ORDINARY" | "EXPRESS"; fare: number; requestAt: Date; road: boolean; roadRequestId?: number };
type TripRow = { seq: number; kind: string; direction: Direction; scheduled: Date; departed?: Date; arrived?: Date; plate?: string; passengers: number; roadPassengers: number; fare: number; wait?: number; requests?: number; status: string; error?: string };
type Vehicle = { id: string; plate: string; direction: Direction; availableAt: Date; busy: boolean };
const plus = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const fmt = (d?: Date) => d ? `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}` : "—";
const minutes = (n: number) => Math.floor(n);
function rng(initial: number) { let x = initial >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0x1_0000_0000; }; }
function assertSafeDatabase() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "test" || process.env.RUTA35_TEST_MODE !== "true" || !["localhost", "127.0.0.1", "::1"].includes(u.hostname))
    throw new Error("Refusing simulation: requires NODE_ENV=test, RUTA35_TEST_MODE=true, and loopback PostgreSQL");
}
function check(ok: unknown, msg: string): asserts ok { if (!ok) throw new Error(`Validation failed: ${msg}`); }

async function run() {
  assertSafeDatabase();
  const { app } = await import("../server.js");
  const tables = '"PaymentRestriction", "Incident", "Session", "AuditEvent", "PaymentPart", "Payment", "Assignment", "Booking", "QueueEntry", "DriverShift", "Vehicle", "User"';
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  const fixtureTag = createHash("sha256").update(String(seed)).digest("hex").slice(0, 10);
  const adminPass = `sim-admin-${fixtureTag}-password`;
  const admin = await prisma.user.create({ data: { email: `admin-${fixtureTag}@ruta35.test`, passwordHash: await argon2.hash(adminPass), role: "ADMIN" } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: admin.email, password: adminPass } });
  check(login.statusCode === 200, "admin login");
  const loginCookie=login.headers["set-cookie"];
  const cookieHeader=Array.isArray(loginCookie)?loginCookie[0]:loginCookie;
  check(typeof cookieHeader==="string","admin session cookie");
  const cookie = cookieHeader.split(";")[0]!;
  const api = async (method: "GET"|"POST", url: string, payload?: object, headers: Record<string,string> = {}) => {
    const r = await app.inject({ method, url, cookies: { ruta35_session: cookie.split("=")[1]! }, headers, payload });
    if (r.statusCode < 200 || r.statusCode >= 300) throw new Error(`${method} ${url} returned ${r.statusCode}: ${r.body.slice(0,160)}`);
    return r.body ? r.json<any>() : {};
  };
  const passenger = await api("POST", "/api/v1/auth/register", { email: `passenger-${fixtureTag}@ruta35.test`, password: `sim-passenger-${fixtureTag}-password` });
  const passengerLogin = await app.inject({ method:"POST", url:"/api/v1/auth/login", payload:{ email:`passenger-${fixtureTag}@ruta35.test`, password:`sim-passenger-${fixtureTag}-password` } });
  check(passengerLogin.statusCode === 200 && passenger.role === "PASSENGER", "fictional passenger account");
  const passengerSetCookie=passengerLogin.headers["set-cookie"];
  const passengerCookieHeader=Array.isArray(passengerSetCookie)?passengerSetCookie[0]:passengerSetCookie;
  check(typeof passengerCookieHeader==="string","passenger session cookie");
  const passengerCookie = passengerCookieHeader.split(";")[0]!.split("=")[1]!;
  const driverIds: string[] = [];
  for (let i=0;i<8;i++) driverIds.push((await api("POST","/api/v1/admin/users",{email:`driver${i+1}-${fixtureTag}@ruta35.test`,password:`sim-driver-${i+1}-${fixtureTag}-password`,role:"DRIVER"})).id);
  const vehicles: Vehicle[] = [];
  for (let i=0;i<8;i++) {
    const direction: Direction = i<4 ? directions[0] : directions[1];
    const v = await api("POST","/api/v1/admin/vehicles",{plate:`TEST-DAY-${String(i+1).padStart(2,"0")}`});
    await api("POST","/api/v1/admin/shifts",{userId:driverIds[i],vehicleId:v.id});
    await api("POST",`/api/v1/admin/vehicles/${v.id}/queue`,{direction});
    const q = await prisma.queueEntry.findFirst({where:{vehicleId:v.id,active:true}});
    if(q) await prisma.queueEntry.update({where:{id:q.id},data:{arrivedAt:plus(start,-8+i)}});
    vehicles.push({id:v.id,plate:v.plate,direction,availableAt:start,busy:false});
  }
  const random = rng(seed);
  const base: Array<{at:Date; direction:Direction; kind:"ORDINARY"|"EXPRESS"; seq:number}> = [];
  for (let i=0;i<20;i++) base.push({at:plus(start,i*36),direction:directions[i%2]!,kind:"ORDINARY",seq:i+1});
  for (const [i, minute] of [120,360,600].entries()) base.push({at:plus(start,minute),direction:directions[i%2]!,kind:"EXPRESS",seq:21+i});
  base.sort((a,b)=>a.at.getTime()-b.at.getTime());
  const roads = Array.from({length:10},(_,i)=>({id:i+1,at:plus(start,Math.floor(random()*690)),direction:directions[Math.floor(random()*2)]!,assigned:false})).sort((a,b)=>a.at.getTime()-b.at.getTime());
  const bookings = new Map<string,Booking>();
  const rows: TripRow[] = [];
  let attemptedDepartures=0, attemptedRoads=0, assignmentErrors=0, unservedRequests=0;
  const rejectedRoads: Array<{at:Date;direction:Direction;reason:string}> = [];
  const makeBooking=async (direction:Direction,kind:"ORDINARY"|"EXPRESS",passengers:number,at:Date,road:boolean,roadRequestId?:number):Promise<Booking>=>{
    const fare=kind==="EXPRESS"?245:35*passengers;
    const key=`${fixtureTag}-${String(bookings.size+1).padStart(3,"0")}`;
    const b=await app.inject({method:"POST",url:"/api/v1/bookings",cookies:{ruta35_session:passengerCookie},headers:{"idempotency-key":key},payload:{direction,origin:direction===directions[0]?"Yacuiba":"Villamontes",destination:direction===directions[0]?"Villamontes":"Yacuiba",pickupPoint:`PRUEBA:${road?"parada carretera":"terminal"}`,pickupReference:"PRUEBA: simulación semilla 350812",passengers,kind,paymentMethod:"CASH",cashBs:fare,qrBs:0}});
    check(b.statusCode===201,`booking creation (${kind},${passengers}) status ${b.statusCode}`);
    const booking=b.json() as {id:string};
    await api("POST",`/api/v1/admin/bookings/${booking.id}/confirm`);
    const simulatedAt=new Date(at.getTime()+bookings.size*1_000);
    const simulated=await prisma.booking.update({where:{id:booking.id},data:{createdAt:simulatedAt,confirmedAt:simulatedAt}});
    const out:Booking={id:simulated.id,direction,passengers,kind,fare,requestAt:at,road,roadRequestId}; bookings.set(out.id,out); return out;
  };
  for(const slot of base){
    attemptedDepartures++;
    const normalCount=slot.kind==="EXPRESS"?7:1+Math.floor(random()*4);
    const cohort:Booking[]=[];
    if(slot.kind==="ORDINARY") for(const r of roads) if(!r.assigned&&r.direction===slot.direction&&r.at<=slot.at){
      attemptedRoads++; r.assigned=true; cohort.push(await makeBooking(slot.direction,"ORDINARY",1,r.at,true,r.id));
    }
    cohort.push(await makeBooking(slot.direction,slot.kind,normalCount,slot.at,false));
    cohort.sort((a,b)=>a.requestAt.getTime()-b.requestAt.getTime());
    const row:TripRow={seq:slot.seq,kind:slot.kind,direction:slot.direction,scheduled:slot.at,passengers:0,roadPassengers:0,fare:0,status:"REJECTED"};
    rows.push(row);
    const queued: Array<{vehicle:Vehicle;arrivedAt:Date}> = [];
    for(const v of vehicles.filter(v=>v.direction===slot.direction&&!v.busy&&v.availableAt<=slot.at)) {
      const q=await prisma.queueEntry.findFirst({where:{vehicleId:v.id,direction:slot.direction,active:true}});
      if(q)queued.push({vehicle:v,arrivedAt:q.arrivedAt});
    }
    queued.sort((a,b)=>a.arrivedAt.getTime()-b.arrivedAt.getTime());
    const vehicle=queued[0]?.vehicle;
    if(!vehicle){row.error="sin vehículo disponible en origen a la hora planificada";unservedRequests+=cohort.length;for(const b of cohort.filter(x=>x.road))rejectedRoads.push({at:b.requestAt,direction:b.direction,reason:row.error});continue;}
    const tripBookings:Booking[]=[];
    for(const b of cohort){
      try {
        await api("POST","/api/v1/driver/assignments",{bookingId:b.id,vehicleId:vehicle.id});
        tripBookings.push(b);
      } catch(e) { assignmentErrors++;unservedRequests++; const reason=e instanceof Error?e.message:"asignación rechazada por reglas";if(b.road)rejectedRoads.push({at:b.requestAt,direction:b.direction,reason});if(!row.error) row.error=reason; }
    }
    if(!tripBookings.length)continue;
    const depart=plus(slot.at,5); const arrival=plus(depart,travelMinutes);
    row.departed=depart;row.arrived=arrival;row.plate=vehicle.plate;row.status=arrival>end?"IN_PROGRESS_AT_20:00":row.error?"COMPLETED_PARTIAL":"COMPLETED";
    row.passengers=tripBookings.reduce((n,b)=>n+b.passengers,0);row.roadPassengers=tripBookings.filter(b=>b.road).reduce((n,b)=>n+b.passengers,0);row.fare=tripBookings.reduce((n,b)=>n+b.fare,0);row.requests=tripBookings.length;row.wait=Math.round(tripBookings.reduce((n,b)=>n+(depart.getTime()-b.requestAt.getTime())/60_000,0)/tripBookings.length*10)/10;
    vehicle.busy=true;vehicle.direction=slot.direction===directions[0]?directions[1]:directions[0];vehicle.availableAt=plus(arrival,turnaroundMinutes);
    await api("POST",`/api/v1/driver/vehicles/${vehicle.id}/status`,{status:"ON_TRIP"});
    if(arrival<=end){
      for(const b of tripBookings)await prisma.booking.update({where:{id:b.id},data:{status:"COMPLETED"}});
      await api("POST",`/api/v1/driver/vehicles/${vehicle.id}/status`,{status:"AVAILABLE"});
      vehicle.busy=false;
      await api("POST",`/api/v1/admin/vehicles/${vehicle.id}/queue`,{direction:vehicle.direction});
      const q=await prisma.queueEntry.findFirst({where:{vehicleId:vehicle.id,active:true}});
      if(q)await prisma.queueEntry.update({where:{id:q.id},data:{arrivedAt:arrival}});
    }
  }
  for(const r of roads)if(!r.assigned){
    attemptedRoads++;
    await makeBooking(r.direction,"ORDINARY",1,r.at,true,r.id);
    rejectedRoads.push({at:r.at,direction:r.direction,reason:"reserva creada; no existe salida ordinaria compatible antes de las 20:00"});
    unservedRequests++;
  }
  const valid=rows.filter(x=>x.status==="COMPLETED"||x.status==="COMPLETED_PARTIAL");
  const departed=rows.filter(x=>x.departed);
  check(attemptedDepartures===23,"exactly 23 requested departures attempted");
  check(attemptedRoads===10,"exactly 10 roadside passenger requests attempted");
  check(base.filter(x=>x.kind==="ORDINARY"&&x.direction===directions[0]).length===10&&base.filter(x=>x.kind==="ORDINARY"&&x.direction===directions[1]).length===10,"ten ordinary departures per direction");
  check(new Set(bookings.keys()).size===bookings.size,"unique booking IDs");
  check(departed.every(x=>x.passengers<=7),"capacity <= 7");
  check(rows.filter(x=>x.kind==="EXPRESS").every(x=>x.status!=="COMPLETED"||x.passengers===7),"express uses seven seats");
  const waitCount=departed.reduce((n,x)=>n+(x.requests??0),0);
  const totals={completed:valid.length,inProgress:rows.filter(x=>x.status==="IN_PROGRESS_AT_20:00").length,rejected:rows.filter(x=>x.status==="REJECTED").length,partial:rows.filter(x=>x.status==="COMPLETED_PARTIAL").length,passengersDeparted:departed.reduce((n,x)=>n+x.passengers,0),passengersArrived:valid.reduce((n,x)=>n+x.passengers,0),roadDeparted:departed.reduce((n,x)=>n+x.roadPassengers,0),roadArrived:valid.reduce((n,x)=>n+x.roadPassengers,0),fare:departed.reduce((n,x)=>n+x.fare,0),meanWait:waitCount?departed.reduce((n,x)=>n+(x.wait??0)*(x.requests??0),0)/waitCount:0,assignmentErrors,unservedRequests};
  let report=`# Simulación reproducible del día completo\n\n**Entorno:** PostgreSQL 16 temporal de GitHub Actions · datos ficticios · pagos no cobrados · entorno de pruebas\n**Semilla:** ${seed} · **Fecha simulada:** 15-01-2026 · **Ventana solicitada:** 08:00–20:00 hora de Bolivia (reloj simulado) · **Viaje:** ${travelMinutes} min · **Abordaje:** 5 min · **Retorno a cola:** ${turnaroundMinutes} min\n\nLa simulación intenta 20 salidas ordinarias, 3 expresas y 10 solicitudes de pasajeros de carretera. Las reservas y asignaciones pasan por rutas HTTP de Fastify; el reloj y los cierres de viajes son simulados. Las salidas parciales, los rechazos y sus motivos se informan por separado. Tarifas representan importes simulados, no dinero recibido.\n\n## Resultado\n\n| Salidas intentadas | Completadas | Parciales | Rechazadas sin salida | En ruta a las 20:00 | Solicitudes carretera intentadas | Pasajeros salidos | Llegaron | Carretera abordaron | Carretera llegaron | Tarifa simulada (Bs) | Cobro real (Bs) | Espera media (min) | Errores HTTP de asignación | Solicitudes no servidas |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n| 23 | ${totals.completed} | ${totals.partial} | ${totals.rejected} | ${totals.inProgress} | ${attemptedRoads} | ${totals.passengersDeparted} | ${totals.passengersArrived} | ${totals.roadDeparted} | ${totals.roadArrived} | ${totals.fare} | 0 | ${totals.meanWait.toFixed(1)} | ${totals.assignmentErrors} | ${totals.unservedRequests} |\n\n## Detalle de salidas\n\n| # | Tipo | Dirección | Hora planificada | Salida | Llegada | Vehículo | Pasajeros | Carretera | Ocupación | Bs simulados | Espera | Estado / motivo |\n|---:|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|\n`;
  for(const r of rows)report+=`| ${r.seq} | ${r.kind} | ${r.direction===directions[0]?"Yacuiba–Villamontes":"Villamontes–Yacuiba"} | ${fmt(r.scheduled)} | ${fmt(r.departed)} | ${fmt(r.arrived)} | ${r.plate??"—"} | ${r.passengers} | ${r.roadPassengers} | ${r.passengers}/7 | ${r.fare} | ${r.wait??"—"} | ${r.error?`Rechazado: ${r.error.replaceAll("|","/")}`:r.status} |\n`;
  report+=`\n## Solicitudes de carretera rechazadas\n\n| Solicitada | Dirección | Motivo |\n|---|---|---|\n`;
  for(const r of rejectedRoads)report+=`| ${fmt(r.at)} | ${r.direction===directions[0]?"Yacuiba–Villamontes":"Villamontes–Yacuiba"} | ${r.reason} |\n`;
  report+=`\n## Comprobaciones\n\n- Salidas intentadas: ${attemptedDepartures}/23.\n- Solicitudes de carretera intentadas: ${attemptedRoads}/10; ${totals.roadArrived} pasajeros de carretera llegaron a destino.\n- Capacidad máxima en salidas: ${Math.max(0,...departed.map(x=>x.passengers))}/7.\n- Expresos con siete asientos asignados: ${departed.filter(x=>x.kind==="EXPRESS"&&x.passengers===7).length}/3.\n- Viajes completados: ${totals.completed}; viajes aún en ruta a las 20:00: ${totals.inProgress}.\n- Errores HTTP de asignación: ${totals.assignmentErrors}; solicitudes no servidas por capacidad, disponibilidad o cierre de ventana: ${totals.unservedRequests}.\n\n## Límites\n\nSin integración de ubicación ni eventos de paradas en el modelo actual, ubicación, recorrido y retorno se anotan en este reloj sintético. Los importes son tarifas simuladas de reservas salidas; cobro real: Bs 0. Pagos no se liquidan. No usar esta salida para operaciones reales.\n`;
  const path=resolve("docs/SIMULACION_DIA_COMPLETO.md"); await mkdir(resolve("docs"),{recursive:true}); await writeFile(path,report,"utf8");
  await app.close(); await prisma.$disconnect();
  return {report,totals,attemptedDepartures,attemptedRoads};
}

run().then(({report,totals,attemptedDepartures,attemptedRoads})=>{console.log("SIMULATION_REPORT_BEGIN");console.log(report);console.log("SIMULATION_REPORT_END");console.log(JSON.stringify({totals,attemptedDepartures,attemptedRoads}));}).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
