import React, { useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../packages/mobile-core/src/api";
import { api, secureTokenStore } from "../../packages/mobile-core/src/native";
import { Button, Busy, Card, Field, Heading, Label, Notice, Page, colors } from "../../packages/mobile-core/src/ui";

const explain = (e: unknown) => e instanceof ApiError ? e.status === 0 ? "Sin conexión con el servidor. Comprueba internet y actualiza." : `${e.code} (${e.status})` : e instanceof Error ? e.message : "Ocurrió un error inesperado.";
const tripLabels: Record<string, string> = { ASSIGNED: "Viaje asignado", TO_PICKUP: "Yendo a recoger al pasajero", PICKED_UP: "Pasajero(s) recogido(s)", IN_TRANSIT: "En ruta al destino", ARRIVED: "Pasajero(s) entregado(s)", COMPLETED: "Viaje finalizado" };
const destinationName = (direction: string) => direction === "YACUIBA_TO_VILLAMONTES" ? "Villamontes" : "Yacuiba";
const queueCity = (direction: string) => direction === "YACUIBA_TO_VILLAMONTES" ? "Yacuiba" : "Villamontes";
export default function App() {
  const [session, setSession] = useState<{ id: string; role: string } | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [boardingCounts, setBoardingCounts] = useState<Record<string, string>>({});
  async function refresh() { setOverview(await api.driverOverview()); await api.driverPresence(); }
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => { if (AppState.currentState === "active") api.driverPresence().catch(() => undefined); }, 60_000);
    return () => clearInterval(timer);
  }, [session?.id]);
  useEffect(() => { (async () => { try { const config = await api.config(); setTestMode(config.testMode); if (!config.testMode) throw new Error("Entorno de pruebas no habilitado en el servidor; operaciones móviles bloqueadas."); const token = await secureTokenStore.get(); if (token) { const me = await api.me(); if (me.role === "DRIVER") { setSession(me); setOverview(await api.driverOverview()); } else { setError("Esta aplicación solo admite cuentas de chofer."); await api.logout(); } } } catch (e) { if (e instanceof ApiError && e.status === 401) await secureTokenStore.clear(); else if (!(e instanceof ApiError && e.status === 404)) setError(explain(e)); } finally { setLoading(false); } })(); }, []);
  async function login() { if (!testMode) { setError("La aplicación solo opera contra un backend con modo de pruebas habilitado."); return; } setWorking(true); setError(""); try { const me = await api.login(email.trim(), password); if (me.role !== "DRIVER") { await api.logout(); throw new Error("Tu cuenta no tiene permiso de chofer."); } setSession(me); await refresh(); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  async function act(fn: () => Promise<unknown>) { setWorking(true); setError(""); try { await fn(); await refresh(); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  async function logout() { setWorking(true); try { await api.logout(); setSession(null); setOverview(null); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  if (loading) return <Page><Busy /></Page>;
  if (!session) return <Page><Heading title="Ruta 35 · Choferes" subtitle="Acceso con cuenta creada por administración de pruebas" /><Card><Label>Correo</Label><Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="chofer@example.test" /><Label>Contraseña</Label><Field secureTextEntry value={password} onChangeText={setPassword} />{error ? <Notice error>{error}</Notice> : null}<Button title={working ? "Conectando…" : "Ingresar"} disabled={working || !testMode || !email || !password} onPress={login} /><Notice>Los choferes no pueden crear cuentas desde esta aplicación.</Notice>{!testMode ? <Notice error>Aplicación bloqueada: solo conecta con un backend separado que anuncie modo de pruebas.</Notice> : null}</Card></Page>;
  const vehicle = overview?.vehicle;
  const trip = overview?.currentTrip;
  const occupiedSeats = (overview?.bookings ?? []).reduce((sum: number, assignment: any) => sum + (assignment.booking?.passengers ?? 0), 0);
  const paymentAssignments = [...(overview?.bookings ?? []), ...(overview?.pendingPayments ?? [])];
  return <Page><ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
    <Heading title="Ruta 35 · Choferes" subtitle={`Sesión de chofer · ${email}`} />
    <Card><Text style={{ color: colors.red, fontWeight: "900" }}>CONDUCCIÓN SEGURA</Text><Notice>Realiza operaciones únicamente con el vehículo completamente detenido. No uses la aplicación mientras conduces.</Notice></Card>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ flexDirection: "row", gap: 8 }}><Button title="Actualizar" secondary onPress={() => act(refresh)} /><Button title="Salir" secondary onPress={logout} /></View>
    {!overview ? <Card><Notice>No hay turno activo disponible.</Notice><Button title="Volver a consultar" secondary onPress={() => act(refresh)} /></Card> : <>
      <Card><Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>Vehículo {vehicle?.plate}</Text><Notice>Estado del vehículo: {vehicle?.status} · Capacidad: {vehicle?.capacity}</Notice><Notice>Asientos reservados: {occupiedSeats} / {vehicle?.capacity}</Notice><Notice>Fila: {overview?.queue ? `${overview.queue.direction} · posición ${overview.queue.position}` : "Fuera de fila"}</Notice>
        <Notice>El estado del vehículo y el estado del viaje son independientes. Las acciones registran la hora y no alteran asientos reservados ni pagos.</Notice>
      </Card>
      {trip ? <Card><Text style={{ color: colors.ink, fontSize: 18, fontWeight: "900" }}>Flujo del viaje</Text><Notice>{tripLabels[trip.status] ?? trip.status} · {trip.direction === "YACUIBA_TO_VILLAMONTES" ? "Yacuiba → Villamontes" : "Villamontes → Yacuiba"}</Notice>
        {trip.assignments?.map((a: any) => <View key={a.bookingId} style={{ gap: 5, marginTop: 6 }}><Notice>Reserva {a.bookingId.slice(-6)} · {a.booking.kind} · {a.booking.passengers} asientos reservados · Bs {a.booking.totalBs}</Notice>{a.actualPassengers !== null ? <Notice>Pasajeros que subieron: {a.actualPassengers}</Notice> : null}{trip.status === "TO_PICKUP" ? <><Label>¿Cuántos subieron en esta reserva? (máx. {a.booking.passengers})</Label><Field keyboardType="number-pad" value={boardingCounts[a.bookingId] ?? ""} placeholder="Introduce la cantidad real" onChangeText={(value) => setBoardingCounts((old) => ({ ...old, [a.bookingId]: value.replace(/\D/g, "").slice(0, 1) }))} /></> : null}</View>)}
        {trip.events?.map((event: any) => <Notice key={event.id}>{event.action === "JOIN_DESTINATION_QUEUE" ? `Se unió a la fila de ${queueCity(event.details.direction)}` : tripLabels[event.toStatus] ?? event.toStatus} · {new Date(event.createdAt).toLocaleString("es-BO")}</Notice>)}
        {trip.status === "ASSIGNED" ? <Button title="Ir a recoger" disabled={working || vehicle?.status !== "QUEUED"} onPress={() => act(() => api.tripAction(trip.id, "GO_TO_PICKUP"))} /> : null}
        {trip.status === "TO_PICKUP" ? <Button title="Confirmar recogida" disabled={working || !trip.assignments?.length || trip.assignments.some((a: any) => !/^\d+$/.test(boardingCounts[a.bookingId] ?? "") || Number(boardingCounts[a.bookingId]) > a.booking.passengers)} onPress={() => act(() => api.tripAction(trip.id, "CONFIRM_PICKUP", Object.fromEntries(trip.assignments.map((a: any) => [a.bookingId, Number(boardingCounts[a.bookingId])]))))} /> : null}
        {trip.status === "PICKED_UP" ? <Button title="Iniciar viaje" disabled={working} onPress={() => act(() => api.tripAction(trip.id, "START_TRIP"))} /> : null}
        {trip.status === "IN_TRANSIT" ? <Button title="Confirmar llegada" disabled={working} onPress={() => act(() => api.tripAction(trip.id, "CONFIRM_ARRIVAL"))} /> : null}
        {trip.status === "ARRIVED" ? <Button title="Estoy disponible" secondary disabled={working} onPress={() => act(() => api.tripAction(trip.id, "MARK_AVAILABLE"))} /> : null}
        {trip.status === "COMPLETED" && vehicle?.status === "AVAILABLE" && !overview?.queue ? <Button title={`Unirme a la fila de ${destinationName(trip.direction)}`} secondary disabled={working} onPress={() => act(() => api.joinDestinationQueue(trip.id))} /> : null}
      </Card> : null}
      <Heading title="Solicitudes compatibles" />
      {(overview.requests ?? []).length ? overview.requests.map((b: any) => <Card key={b.id}><Text style={{ color: colors.ink, fontWeight: "900" }}>{b.origin} → {b.destination} · {b.kind}</Text><Notice>{b.passengers} pasajero(s) · Bs {b.totalBs} · {b.status}</Notice><Notice>Recogida: {b.pickupPoint} {b.pickupReference ?? ""}</Notice><Button title="Aceptar y asignar al vehículo" disabled={working || vehicle?.status !== "QUEUED"} onPress={() => act(() => api.assign(b.id, vehicle.id))} /></Card>) : <Card><Notice>Sin solicitudes compatibles por ahora.</Notice></Card>}
      <Heading title="Pasajeros y pagos" />
      {paymentAssignments.length ? paymentAssignments.map((assignment: any) => { const b = assignment.booking; const p = b.payment; return <Card key={b.id}><Text style={{ color: colors.ink, fontWeight: "900" }}>{b.origin} → {b.destination} · {b.passengers} plazas reservadas</Text><Notice>Reserva: {b.status} · Bs {b.totalBs}</Notice>{b.status === "COMPLETED" ? <Notice>Viaje terminado con pago pendiente. Esta reserva ya no ocupa asientos.</Notice> : null}<Notice>Pago: {p?.status ?? "SIN REGISTRO"} ({p?.method ?? b.paymentMethod})</Notice>{(p?.parts ?? []).map((part: any) => <View key={part.id} style={{ gap: 6 }}><Notice>{part.kind}: Bs {part.amountBs} · {part.status}{part.kind === "QR" ? " · requiere revisión administrativa" : ""}</Notice>{part.kind === "CASH" && part.status === "PENDING" ? <Button title="Registrar efectivo recibido" secondary disabled={working} onPress={() => act(() => api.cashReceived(p.id))} /> : null}</View>)}</Card>; }) : <Card><Notice>No hay pasajeros asignados ni pagos pendientes de viajes terminados.</Notice></Card>}
    </>}
  </ScrollView></Page>;
}
