import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError, routeNames, type BookingKind, type Direction, type PaymentMethod } from "@ruta35/mobile-core/src/api";
import { api, bookingAttemptStore, secureTokenStore } from "@ruta35/mobile-core/src/native";
import { Button, Busy, Card, Field, Heading, Label, Notice, Page, colors } from "@ruta35/mobile-core/src/ui";

const explain = (e: unknown) => e instanceof ApiError ? e.code === "connection_unavailable" || e.code === "connection_timeout" ? "No hay conexión con Ruta 35. Revisa internet y vuelve a intentar." : `${e.code} (${e.status})` : e instanceof Error ? e.message : "Ocurrió un error inesperado.";
const pretty: Record<string, string> = { YACUIBA_TO_VILLAMONTES: "Yacuiba → Villamontes", VILLAMONTES_TO_YACUIBA: "Villamontes → Yacuiba", ORDINARY: "Ordinario", EXPRESS: "Expreso", CASH: "Efectivo", QR: "QR manual", COMBINED: "Combinado" };
const choices = <T extends string>(all: readonly T[], current: T, set: (value: T) => void) => all.map((value) => <Button key={value} title={`${current === value ? "✓ " : ""}${pretty[value] ?? value}`} secondary={current !== value} onPress={() => set(value)} />);

export default function App() {
  const [session, setSession] = useState<{ id: string; role: string } | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [direction, setDirection] = useState<Direction>("YACUIBA_TO_VILLAMONTES");
  const [kind, setKind] = useState<BookingKind>("ORDINARY");
  const [passengers, setPassengers] = useState("1");
  const [pickup, setPickup] = useState("PRUEBA: Terminal local de salida");
  const [pickupReference, setPickupReference] = useState("PRUEBA: puerta principal");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [quote, setQuote] = useState<{ totalBs: number; currency: string } | null>(null);
  const [history, setHistory] = useState<Array<Record<string, any>>>([]);
  const [attemptKey, setAttemptKey] = useState("");
  const [tab, setTab] = useState<"Solicitar" | "Historial">("Solicitar");
  const route = useMemo(() => routeNames(direction), [direction]);

  async function refreshHistory() { setHistory(await api.bookings()); }
  useEffect(() => {
    (async () => {
      try { const config = await api.config(); setTestMode(config.testMode); if (!config.testMode) throw new Error("Entorno de pruebas no habilitado en el servidor; operaciones móviles bloqueadas."); const token = await secureTokenStore.get(); if (token) setSession(await api.me()); setAttemptKey(await bookingAttemptStore.get() ?? ""); }
      catch (e) { if (e instanceof ApiError && e.status === 401) await secureTokenStore.clear(); else setError(explain(e)); }
      finally { setLoading(false); }
    })();
  }, []);
  useEffect(() => { if (session && session.role !== "PASSENGER") setError("Esta aplicación solo admite cuentas de pasajero."); }, [session]);
  useEffect(() => {
    if (!session || session.role !== "PASSENGER") return;
    setQuote(null);
    let active = true;
    api.quote(Math.max(1, Math.min(7, Number(passengers) || 1)), kind).then((result) => { if (active) setQuote(result); }).catch((e) => { if (active) setError(explain(e)); });
    return () => { active = false; };
  }, [session, passengers, kind]);
  useEffect(() => { if (session && tab === "Historial") refreshHistory().catch((e) => setError(explain(e))); }, [session, tab]);

  async function authenticate() {
    if (!testMode) { setError("La aplicación solo opera contra un backend con modo de pruebas habilitado."); return; }
    setWorking(true); setError("");
    try {
      if (isRegister) await api.register(email.trim(), password);
      const me = await api.login(email.trim(), password);
      if (me.role !== "PASSENGER") { await api.logout(); throw new Error("Esta cuenta no tiene permiso de pasajero."); }
      setSession(me);
    } catch (e) { setError(explain(e)); }
    finally { setWorking(false); }
  }
  async function submitBooking() {
    setWorking(true); setError("");
    const n = Math.max(1, Math.min(7, Number(passengers) || 1));
    const key = attemptKey || `rn-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
    setAttemptKey(key);
    await bookingAttemptStore.set(key);
    try {
      const total = quote?.totalBs ?? 0;
      const qrBs = method === "QR" ? total : method === "COMBINED" ? Math.floor(total / 2) : 0;
      await api.createBooking({ direction, ...route, pickupPoint: pickup, pickupReference: pickupReference.trim() || undefined, passengers: n, kind, paymentMethod: method, qrBs, cashBs: total - qrBs }, key);
      setAttemptKey(""); await bookingAttemptStore.clear(); setTab("Historial"); await refreshHistory();
    } catch (e) { setError(explain(e)); }
    finally { setWorking(false); }
  }
  async function cancel(id: string) { setWorking(true); setError(""); try { await api.cancelBooking(id); await refreshHistory(); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }
  async function logout() { setWorking(true); try { await api.logout(); await bookingAttemptStore.clear(); setAttemptKey(""); setSession(null); setHistory([]); } catch (e) { setError(explain(e)); } finally { setWorking(false); } }

  if (loading) return <Page><Busy /></Page>;
  if (!session || session.role !== "PASSENGER") return <Page><Heading title="Ruta 35 · Pasajeros" subtitle="Acceso de prueba para pasajeros" />{testMode ? <Notice>ENTORNO DE PRUEBAS · pagos simulados, sin transporte real</Notice> : <Notice error>Aplicación bloqueada: solo conecta con un backend separado que anuncie modo de pruebas.</Notice>}<Card><Label>Correo ficticio (.test)</Label><Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="pasajero@example.test" /><Label>Contraseña</Label><Field secureTextEntry value={password} onChangeText={setPassword} placeholder="Mínimo 14 caracteres" />{error ? <Notice error>{error}</Notice> : null}<Button title={working ? "Conectando…" : isRegister ? "Crear cuenta ficticia e ingresar" : "Ingresar"} disabled={working || !testMode || !email || !password} onPress={authenticate} /><Button title={isRegister ? "Ya tengo cuenta" : "Crear cuenta ficticia"} secondary disabled={!testMode} onPress={() => setIsRegister(!isRegister)} /></Card></Page>;

  return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
    <Heading title="Ruta 35 · Pasajeros" subtitle={`Conectado · ${email}`} />
    {testMode ? <Card><Text style={{ color: colors.red, fontWeight: "900" }}>ENTORNO DE PRUEBAS · pagos simulados</Text><Notice>No se procesan pagos QR reales ni solicitudes reales de transporte.</Notice></Card> : null}
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ flexDirection: "row", gap: 8 }}><Button title="Solicitar" secondary={tab !== "Solicitar"} onPress={() => setTab("Solicitar")} /><Button title="Historial" secondary={tab !== "Historial"} onPress={() => setTab("Historial")} /><Button title="Salir" secondary onPress={logout} /></View>
    {tab === "Solicitar" ? <>
      <Card><Label>Sentido</Label>{choices(["YACUIBA_TO_VILLAMONTES", "VILLAMONTES_TO_YACUIBA"] as const, direction, setDirection)}<Notice>{route.origin} → {route.destination}</Notice>
        <Label>Modalidad</Label>{choices(["ORDINARY", "EXPRESS"] as const, kind, setKind)}<Label>Pasajeros (máximo 7)</Label><Field keyboardType="number-pad" value={passengers} onChangeText={(v) => setPassengers(v.replace(/\D/g, "").slice(0, 1))} />
        <Label>Ubicación / punto de recogida</Label><Field value={pickup} onChangeText={setPickup} placeholder="PRUEBA: ..." /><Label>Referencia opcional</Label><Field value={pickupReference} onChangeText={setPickupReference} placeholder="PRUEBA: ..." />
        <Label>Precio cotizado</Label><Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>{quote ? `Bs ${quote.totalBs}` : "Consultando…"}</Text>
        <Label>Pago simulado</Label>{choices(["CASH", "QR", "COMBINED"] as const, method, setMethod)}{method === "COMBINED" ? <Notice>Pago combinado ficticio: 50% QR manual + efectivo. El QR requiere verificación administrativa.</Notice> : null}
        <Button title={working ? "Enviando…" : "Solicitar viaje de prueba"} disabled={working || !testMode || !quote || !pickup.trim() || !/^PRUEBA:/i.test(pickup.trim())} onPress={submitBooking} />
      </Card>
    </> : <>
      <Button title="Actualizar historial" secondary onPress={() => refreshHistory().catch((e) => setError(explain(e)))} />
      {history.length ? history.map((b) => <Card key={b.id}><Text style={{ color: colors.ink, fontWeight: "900" }}>{b.origin} → {b.destination} · {b.kind}</Text><Notice>{b.passengers} pasajero(s) · Bs {b.totalBs} · {b.status}</Notice><Notice>Pago simulado: {b.payment?.status ?? "PENDING"} · {b.paymentMethod}</Notice><Notice>Recogida: {b.pickupPoint}</Notice>{b.status === "PENDING" ? <Button title="Cancelar reserva pendiente" secondary disabled={working} onPress={() => cancel(b.id)} /> : null}</Card>) : <Card><Notice>No hay reservas todavía.</Notice></Card>}
    </>}
  </ScrollView></Page>;
}
