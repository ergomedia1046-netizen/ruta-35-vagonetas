import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError, routeNames, type BookingKind, type Direction, type PaymentMethod } from "../../packages/mobile-core/src/api";
import { api, bookingAttemptStore, secureTokenStore } from "../../packages/mobile-core/src/native";
import { Button, Busy, Card, Field, Heading, Label, Notice, Page, colors } from "../../packages/mobile-core/src/ui";

const message = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 0) return "No hay conexion con el servidor. Revisa internet y vuelve a intentar.";
    return `${error.code} (${error.status})`;
  }
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
};

const names: Record<string, string> = {
  YACUIBA_TO_VILLAMONTES: "Yacuiba a Villamontes",
  VILLAMONTES_TO_YACUIBA: "Villamontes a Yacuiba",
  ORDINARY: "Ordinario", EXPRESS: "Expreso", CASH: "Efectivo",
  QR: "QR manual", COMBINED: "Combinado"
};
const reservationStates: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", ASSIGNED: "Asignada", COMPLETED: "Completada", CANCELLED: "Cancelada" };
const tripStates: Record<string, string> = { ASSIGNED: "Viaje asignado", TO_PICKUP: "Yendo a recoger", PICKED_UP: "Pasajero(s) recogido(s)", IN_TRANSIT: "En ruta", ARRIVED: "Llegada confirmada", COMPLETED: "Viaje finalizado" };

function Options<T extends string>({ values, selected, onSelect }: {
  values: readonly T[]; selected: T; onSelect: (value: T) => void;
}) {
  return <View style={{ gap: 8 }}>{values.map((value) => <Button key={value}
    title={`${selected === value ? "✓ " : ""}${names[value] ?? value}`}
    secondary={selected !== value} onPress={() => onSelect(value)} />)}</View>;
}

export default function App() {
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<{ id: string; role: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [direction, setDirection] = useState<Direction>("YACUIBA_TO_VILLAMONTES");
  const [kind, setKind] = useState<BookingKind>("ORDINARY");
  const [passengerText, setPassengerText] = useState("1");
  const [pickup, setPickup] = useState("PRUEBA: Terminal local de salida");
  const [reference, setReference] = useState("PRUEBA: puerta principal");
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [quote, setQuote] = useState<{ totalBs: number; currency: string } | null>(null);
  const [bookings, setBookings] = useState<Array<Record<string, any>>>([]);
  const [attemptKey, setAttemptKey] = useState("");
  const [tab, setTab] = useState<"request" | "history">("request");
  const route = useMemo(() => routeNames(direction), [direction]);
  const passengerCount = Math.max(1, Math.min(7, Number(passengerText) || 1));

  async function loadBookings() { setBookings(await api.bookings()); }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const config = await api.config();
        if (!active) return;
        setTestMode(config.testMode);
        if (!config.testMode) throw new Error("El backend no anuncia modo de pruebas; acceso bloqueado.");
        const [token, savedAttempt] = await Promise.all([secureTokenStore.get(), bookingAttemptStore.get()]);
        if (savedAttempt) setAttemptKey(savedAttempt);
        if (token) {
          const me = await api.me();
          if (me.role === "PASSENGER") setSession(me);
          else { await api.logout(); throw new Error("Esta aplicacion requiere una cuenta de pasajero."); }
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) await secureTokenStore.clear();
        setError(message(cause));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setQuote(null);
    api.quote(passengerCount, kind).then((value) => { if (active) setQuote(value); })
      .catch((cause) => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [session, passengerCount, kind]);

  useEffect(() => {
    if (session && tab === "history") loadBookings().catch((cause) => setError(message(cause)));
  }, [session, tab]);

  async function authenticate() {
    setWorking(true); setError("");
    try {
      if (!testMode) throw new Error("Solo se permite conectar a un backend de pruebas.");
      if (registering) await api.register(email.trim(), password);
      const me = await api.login(email.trim(), password);
      if (me.role !== "PASSENGER") { await api.logout(); throw new Error("La cuenta no tiene permiso de pasajero."); }
      setSession(me);
    } catch (cause) { setError(message(cause)); }
    finally { setWorking(false); }
  }

  async function createBooking() {
    setWorking(true); setError("");
    const key = attemptKey || `rn-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
    try {
      if (!quote) throw new Error("Espera a que el servidor confirme la tarifa.");
      if (!pickup.trim().startsWith("PRUEBA:")) throw new Error("En el entorno de prueba, el punto debe comenzar por PRUEBA:.");
      await bookingAttemptStore.set(key);
      setAttemptKey(key);
      const total = quote.totalBs;
      const qrBs = payment === "QR" ? total : payment === "COMBINED" ? Math.floor(total / 2) : 0;
      await api.createBooking({ direction, ...route, pickupPoint: pickup.trim(), pickupReference: reference.trim() || undefined,
        passengers: passengerCount, kind, paymentMethod: payment, qrBs, cashBs: total - qrBs }, key);
      await bookingAttemptStore.clear();
      setAttemptKey("");
      setTab("history");
      await loadBookings();
    } catch (cause) { setError(message(cause)); }
    finally { setWorking(false); }
  }

  async function cancelBooking(id: string) {
    setWorking(true); setError("");
    try { await api.cancelBooking(id); await loadBookings(); }
    catch (cause) { setError(message(cause)); }
    finally { setWorking(false); }
  }

  async function logout() {
    setWorking(true); setError("");
    try { await api.logout(); setSession(null); setBookings([]); await bookingAttemptStore.clear(); setAttemptKey(""); }
    catch (cause) { setError(message(cause)); }
    finally { setWorking(false); }
  }

  if (loading) return <Page><Busy /></Page>;
  if (!session) return <Page><Heading title="Ruta 35 - Pasajeros" subtitle="Acceso para pasajeros de prueba" />
    <Card><Notice>ENTORNO DE PRUEBAS. No se procesan pagos ni viajes reales.</Notice>
      {!testMode ? <Notice error>Aplicacion bloqueada: el backend no esta en modo de pruebas.</Notice> : null}
      <Label>Correo ficticio terminado en .test</Label><Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="pasajero@example.test" />
      <Label>Contrasena</Label><Field value={password} onChangeText={setPassword} secureTextEntry placeholder="Minimo 14 caracteres" />
      {error ? <Notice error>{error}</Notice> : null}
      <Button title={working ? "Conectando..." : registering ? "Crear cuenta ficticia e ingresar" : "Ingresar"}
        disabled={working || !testMode || !email || !password} onPress={authenticate} />
      <Button title={registering ? "Ya tengo cuenta" : "Crear cuenta ficticia"} secondary disabled={!testMode}
        onPress={() => setRegistering(!registering)} />
    </Card></Page>;

  return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
    <Heading title="Ruta 35 - Pasajeros" subtitle={`Sesion de pasajero: ${email}`} />
    <Card><Text style={{ color: colors.red, fontWeight: "900" }}>ENTORNO DE PRUEBAS</Text><Notice>Pagos simulados; no se solicita transporte real.</Notice></Card>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Button title="Solicitar" secondary={tab !== "request"} onPress={() => setTab("request")} />
      <Button title="Historial" secondary={tab !== "history"} onPress={() => setTab("history")} />
      <Button title="Salir" secondary onPress={logout} />
    </View>
    {tab === "request" ? <Card>
      <Label>Sentido</Label><Options values={["YACUIBA_TO_VILLAMONTES", "VILLAMONTES_TO_YACUIBA"] as const} selected={direction} onSelect={setDirection} />
      <Notice>{route.origin} a {route.destination}</Notice>
      <Label>Tipo de viaje</Label><Options values={["ORDINARY", "EXPRESS"] as const} selected={kind} onSelect={(value) => { setKind(value); if (value === "EXPRESS") setPassengerText("7"); }} />
      {kind === "EXPRESS" ? <Notice>El expreso requiere las siete plazas, segun las reglas del backend.</Notice> : null}
      <Label>Pasajeros (maximo 7)</Label><Field keyboardType="number-pad" value={passengerText} onChangeText={(value) => setPassengerText(value.replace(/\D/g, "").slice(0, 1))} />
      <Label>Punto de recogida (prueba)</Label><Field value={pickup} onChangeText={setPickup} placeholder="PRUEBA: lugar" />
      <Label>Referencia</Label><Field value={reference} onChangeText={setReference} placeholder="PRUEBA: referencia opcional" />
      <Label>Tarifa consultada al servidor</Label><Text style={{ color: colors.ink, fontSize: 24, fontWeight: "900" }}>{quote ? `${quote.currency} ${quote.totalBs}` : "Consultando..."}</Text>
      <Label>Pago simulado</Label><Options values={["CASH", "QR", "COMBINED"] as const} selected={payment} onSelect={setPayment} />
      <Notice>QR manual y combinado son registros de prueba. No se genera QR bancario ni transferencia.</Notice>
      <Button title={working ? "Enviando..." : "Solicitar reserva"} disabled={working || !quote || !testMode} onPress={createBooking} />
      {attemptKey ? <Notice>Se conserva la clave de intento para que reintentar no duplique la reserva.</Notice> : null}
    </Card> : <>
      <Heading title="Historial de reservas" />
      <Button title={working ? "Actualizando..." : "Actualizar historial"} secondary disabled={working} onPress={() => { setWorking(true); loadBookings().catch((cause) => setError(message(cause))).finally(() => setWorking(false)); }} />
      {bookings.length ? bookings.map((booking) => <Card key={booking.id}>
        <Text style={{ color: colors.ink, fontWeight: "900" }}>{booking.origin} a {booking.destination} - {names[booking.kind] ?? booking.kind}</Text>
        <Notice>Reserva: {reservationStates[booking.status] ?? booking.status} | Asientos reservados: {booking.passengers} | Bs {booking.totalBs}</Notice>
        {booking.assignment?.vehicle?.plate ? <Notice>Vehículo asignado: {booking.assignment.vehicle.plate}</Notice> : null}
        {booking.assignment?.actualPassengers !== null && booking.assignment?.actualPassengers !== undefined ? <Notice>Pasajeros que abordaron: {booking.assignment.actualPassengers} (de {booking.passengers} asientos reservados)</Notice> : null}
        {booking.assignment?.trip ? <View style={{ gap: 5, marginTop: 4 }}><Label>Avance del viaje</Label>{booking.assignment.trip.events.map((event: any) => <Notice key={event.id}>{tripStates[event.toStatus] ?? event.toStatus} · {new Date(event.createdAt).toLocaleString("es-BO")}{booking.assignment.vehicle?.plate ? ` · ${booking.assignment.vehicle.plate}` : ""}</Notice>)}</View> : null}
        <Notice>Recogida: {booking.pickupPoint}{booking.pickupReference ? ` (${booking.pickupReference})` : ""}</Notice>
        <Notice>Pago: {names[booking.paymentMethod] ?? booking.paymentMethod} - {booking.payment?.status ?? "pendiente"}</Notice>
        {booking.status === "PENDING" ? <Button title="Cancelar reserva pendiente" secondary disabled={working} onPress={() => cancelBooking(booking.id)} /> : null}
      </Card>) : <Card><Notice>No hay reservas en el historial.</Notice></Card>}
    </>}
  </ScrollView></Page>;
}
