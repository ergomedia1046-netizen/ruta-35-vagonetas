import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../packages/mobile-core/src/api";
import { api, secureTokenStore } from "../../packages/mobile-core/src/native";
import { Button, Busy, Card, Field, Heading, Label, Notice, Page, colors } from "../../packages/mobile-core/src/ui";

const explain = (e: unknown) => e instanceof ApiError ? e.status === 0 ? "Sin conexión con el servidor. Comprueba internet y actualiza." : `${e.code} (${e.status})` : e instanceof Error ? e.message : "Ocurrió un error inesperado.";
export default function App() {
  const [session, setSession] = useState<{ id: string; role: string } | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  async function refresh() { setOverview(await api.driverOverview()); }
  useEffect(() => { (async () => { try { const config = await api.config(); setTestMode(config.testMode); if (!config.testMode) throw new Error("Entorno de pruebas no habilitado en el servidor; operaciones móviles bloqueadas."); const token = await secureTokenStore.get(); if (token) { const me = await api.me(); if (me.role === "DRIVER") { setSession(me); setOverview(await api.driverOverview()); } else { setError("Esta aplicación solo admite cuentas de chofer."); await api.logout(); } } } catch (e) { if (e instanceof ApiError && e.status === 401) await secureTokenStore.clear(); else if (!(e instanceof ApiError && e.status === 404)) setError(explain(e)); } finally { setLoading(false); } })(); }, []);
  async function login() { if (!testMode) { setError("La aplicación solo opera contra un backend con modo de pruebas habilitado."); return; } setWorking(true); setError(""); try { const me = await api.login(email.trim(), password); if (me.role !== "DRIVER") { await api.logout(); throw new Error("Tu cuenta no tiene permiso de chofer."); } setSession(me); await refresh(); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  async function act(fn: () => Promise<unknown>) { setWorking(true); setError(""); try { await fn(); await refresh(); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  async function logout() { setWorking(true); try { await api.logout(); setSession(null); setOverview(null); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  if (loading) return <Page><Busy /></Page>;
  if (!session) return <Page><Heading title="Ruta 35 · Choferes" subtitle="Acceso con cuenta creada por administración de pruebas" /><Card><Label>Correo</Label><Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="chofer@example.test" /><Label>Contraseña</Label><Field secureTextEntry value={password} onChangeText={setPassword} />{error ? <Notice error>{error}</Notice> : null}<Button title={working ? "Conectando…" : "Ingresar"} disabled={working || !testMode || !email || !password} onPress={login} /><Notice>Los choferes no pueden crear cuentas desde esta aplicación.</Notice>{!testMode ? <Notice error>Aplicación bloqueada: solo conecta con un backend separado que anuncie modo de pruebas.</Notice> : null}</Card></Page>;
  const vehicle = overview?.vehicle;
  const occupiedSeats = (overview?.bookings ?? []).reduce((sum: number, assignment: any) => sum + (assignment.booking?.passengers ?? 0), 0);
  return <Page><ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
    <Heading title="Ruta 35 · Choferes" subtitle={`Sesión de chofer · ${email}`} />
    <Card><Text style={{ color: colors.red, fontWeight: "900" }}>CONDUCCIÓN SEGURA</Text><Notice>Realiza operaciones únicamente con el vehículo completamente detenido. No uses la aplicación mientras conduces.</Notice></Card>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ flexDirection: "row", gap: 8 }}><Button title="Actualizar" secondary onPress={() => act(refresh)} /><Button title="Salir" secondary onPress={logout} /></View>
    {!overview ? <Card><Notice>No hay turno activo disponible.</Notice><Button title="Volver a consultar" secondary onPress={() => act(refresh)} /></Card> : <>
      <Card><Text style={{ color: colors.ink, fontSize: 20, fontWeight: "900" }}>Vehículo {vehicle?.plate}</Text><Notice>Estado: {vehicle?.status} · Capacidad: {vehicle?.capacity}</Notice><Notice>Asientos ocupados: {occupiedSeats} / {vehicle?.capacity}</Notice><Notice>Cola de salida: {vehicle?.queueEntries?.filter((q: any) => q.active).length ?? 0}</Notice>
        {vehicle?.status === "QUEUED" ? <Button title="Registrar salida (cambiar estado)" disabled={working} onPress={() => act(() => api.setVehicleStatus(vehicle.id, "ON_TRIP"))} /> : null}
        {vehicle?.status === "ON_TRIP" ? <Button title="Liberar vehículo al terminar" secondary disabled={working} onPress={() => act(() => api.setVehicleStatus(vehicle.id, "AVAILABLE"))} /> : null}
        <Notice>El backend solo registra el estado del vehículo; no registra hora de abordaje ni llegada.</Notice>
      </Card>
      <Heading title="Solicitudes compatibles" />
      {(overview.requests ?? []).length ? overview.requests.map((b: any) => <Card key={b.id}><Text style={{ color: colors.ink, fontWeight: "900" }}>{b.origin} → {b.destination} · {b.kind}</Text><Notice>{b.passengers} pasajero(s) · Bs {b.totalBs} · {b.status}</Notice><Notice>Recogida: {b.pickupPoint} {b.pickupReference ?? ""}</Notice><Button title="Aceptar y asignar al vehículo" disabled={working || vehicle?.status !== "QUEUED"} onPress={() => act(() => api.assign(b.id, vehicle.id))} /></Card>) : <Card><Notice>Sin solicitudes compatibles por ahora.</Notice></Card>}
      <Heading title="Pasajeros y pagos" />
      {(overview.bookings ?? []).length ? overview.bookings.map((assignment: any) => { const b = assignment.booking; const p = b.payment; return <Card key={b.id}><Text style={{ color: colors.ink, fontWeight: "900" }}>{b.origin} → {b.destination} · {b.passengers} pasajero(s)</Text><Notice>Reserva: {b.status} · Asientos ocupados: {b.passengers} · Bs {b.totalBs}</Notice><Notice>Pago: {p?.status ?? "SIN REGISTRO"} ({p?.method ?? b.paymentMethod})</Notice>{(p?.parts ?? []).map((part: any) => <View key={part.id} style={{ gap: 6 }}><Notice>{part.kind}: Bs {part.amountBs} · {part.status}{part.kind === "QR" ? " · requiere revisión administrativa" : ""}</Notice>{part.kind === "CASH" && part.status === "PENDING" ? <Button title="Registrar efectivo recibido" secondary disabled={working} onPress={() => act(() => api.cashReceived(p.id))} /> : null}</View>)}</Card>; }) : <Card><Notice>Todavía no hay pasajeros asignados a este vehículo.</Notice></Card>}
    </>}
  </ScrollView></Page>;
}
