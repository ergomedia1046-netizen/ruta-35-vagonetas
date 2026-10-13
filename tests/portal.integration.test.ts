import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";

const suite = describe.skipIf(!process.env.DATABASE_URL);
suite("web passenger to admin to Android driver portal workflow", () => {
  let app: typeof import("../src/server.js").app;
  const emails: string[] = [];
  const bookingIds: string[] = [];
  const vehicleIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.RUTA35_TEST_MODE = "true";
    ({ app } = await import("../src/server.js"));
    await app.ready();
  });

  afterEach(async () => {
    const users = emails.length ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } }) : [];
    const userIds = users.map(user => user.id);
    const bookings = bookingIds.splice(0);
    const vehicles = vehicleIds.splice(0);
    if (bookings.length) {
      await prisma.auditEvent.deleteMany({ where: { entityId: { in: bookings } } });
      await prisma.assignment.deleteMany({ where: { bookingId: { in: bookings } } });
      await prisma.paymentPart.deleteMany({ where: { payment: { bookingId: { in: bookings } } } });
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookings } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookings } } });
    }
    if (vehicles.length) {
      await prisma.queueEntry.deleteMany({ where: { vehicleId: { in: vehicles } } });
      await prisma.driverShift.deleteMany({ where: { vehicleId: { in: vehicles } } });
      await prisma.assignment.deleteMany({ where: { vehicleId: { in: vehicles } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicles } } });
    }
    if (userIds.length) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.driverShift.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    emails.splice(0);
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("creates, confirms, offers, assigns and displays a Bs 245 Villamontes express ride", async () => {
    const suffix = randomUUID();
    const password = "Only-for-portal-integration-2026!";
    const passengerEmail = `portal-passenger-${suffix}@example.test`;
    const adminEmail = `portal-admin-${suffix}@example.test`;
    const driverEmail = `portal-driver-${suffix}@example.test`;
    emails.push(passengerEmail, adminEmail, driverEmail);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [passenger, admin, driver] = await Promise.all([
      prisma.user.create({ data: { email: passengerEmail, passwordHash, role: "PASSENGER" } }),
      prisma.user.create({ data: { email: adminEmail, passwordHash, role: "ADMIN" } }),
      prisma.user.create({ data: { email: driverEmail, passwordHash, role: "DRIVER" } })
    ]);
    const vehicle = await prisma.vehicle.create({ data: { plate: `TEST-${suffix.slice(0, 8)}`, capacity: 7 } });
    vehicleIds.push(vehicle.id);
    await prisma.driverShift.create({ data: { userId: driver.id, vehicleId: vehicle.id, startsAt: new Date() } });
    await prisma.queueEntry.create({ data: { vehicleId: vehicle.id, direction: "VILLAMONTES_TO_YACUIBA", position: 1 } });
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: "QUEUED" } });

    const passengerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: passengerEmail, password } });
    expect(passengerLogin.statusCode).toBe(200);
    const passengerCookie = String(passengerLogin.headers["set-cookie"]).split(";")[0];
    const created = await app.inject({
      method: "POST", url: "/api/v1/bookings", headers: { cookie: passengerCookie, "idempotency-key": `portal-${suffix}` },
      payload: { direction: "VILLAMONTES_TO_YACUIBA", origin: "Villamontes", destination: "Yacuiba",
        pickupPoint: "PRUEBA: Plaza ficticia", passengers: 7, kind: "EXPRESS", paymentMethod: "CASH", cashBs: 245, qrBs: 0 }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: "PENDING", totalBs: 245, passengers: 7, kind: "EXPRESS" });
    const bookingId = created.json().id as string;
    bookingIds.push(bookingId);

    const adminLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: adminEmail, password } });
    const adminCookie = String(adminLogin.headers["set-cookie"]).split(";")[0];
    expect((await app.inject({ method: "POST", url: `/api/v1/admin/bookings/${bookingId}/confirm`, headers: { cookie: adminCookie } })).statusCode).toBe(200);
    const dashboard = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: adminCookie } });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().bookings).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId, status: "CONFIRMED" })]));

    const driverLogin = await app.inject({ method: "POST", url: "/api/v1/auth/native/login", payload: { email: driverEmail, password } });
    const driverHeaders = { authorization: `Bearer ${driverLogin.json().accessToken}` };
    const overview = await app.inject({ method: "GET", url: "/api/v1/driver/overview", headers: driverHeaders });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().queue).toMatchObject({ direction: "VILLAMONTES_TO_YACUIBA", position: 1 });
    expect(overview.json().requests).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId, totalBs: 245, kind: "EXPRESS" })]));
    const assigned = await app.inject({
      method: "POST", url: "/api/v1/driver/assignments", headers: driverHeaders,
      payload: { bookingId, vehicleId: vehicle.id }
    });
    expect(assigned.statusCode).toBe(200);

    const passengerBookings = await app.inject({ method: "GET", url: "/api/v1/bookings", headers: { cookie: passengerCookie } });
    expect(passengerBookings.statusCode).toBe(200);
    expect(passengerBookings.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      id: bookingId, status: "ASSIGNED", totalBs: 245, assignment: expect.objectContaining({ vehicle: expect.objectContaining({ plate: vehicle.plate }) })
    })]));
  });

  it("allows only explicit admin test dispatch to bypass queue priority and exposes assignment to passenger and selected driver", async () => {
    process.env.RUTA35_TEST_TARGET = "ruta35-android-pruebas";
    process.env.RUTA35_TEST_MANUAL_DISPATCH = "true";
    const suffix = randomUUID();
    const password = "Only-for-manual-dispatch-2026!";
    const passengerEmail = `manual-passenger-${suffix}@example.test`;
    const adminEmail = `manual-admin-${suffix}@example.test`;
    const firstDriverEmail = `manual-first-${suffix}@example.test`;
    const chosenDriverEmail = `manual-chosen-${suffix}@example.test`;
    emails.push(passengerEmail, adminEmail, firstDriverEmail, chosenDriverEmail);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [passenger, admin, firstDriver, chosenDriver] = await Promise.all([
      prisma.user.create({ data: { email: passengerEmail, passwordHash, role: "PASSENGER" } }),
      prisma.user.create({ data: { email: adminEmail, passwordHash, role: "ADMIN" } }),
      prisma.user.create({ data: { email: firstDriverEmail, passwordHash, role: "DRIVER" } }),
      prisma.user.create({ data: { email: chosenDriverEmail, passwordHash, role: "DRIVER" } })
    ]);
    const [firstVehicle, chosenVehicle] = await Promise.all([
      prisma.vehicle.create({ data: { plate: `TEST-${suffix.slice(0, 6)}-A`, capacity: 7, status: "QUEUED" } }),
      prisma.vehicle.create({ data: { plate: `TEST-${suffix.slice(0, 6)}-B`, capacity: 7, status: "QUEUED" } })
    ]);
    vehicleIds.push(firstVehicle.id, chosenVehicle.id);
    await prisma.driverShift.createMany({ data: [
      { userId: firstDriver.id, vehicleId: firstVehicle.id, startsAt: new Date(Date.now() - 60_000) },
      { userId: chosenDriver.id, vehicleId: chosenVehicle.id, startsAt: new Date(Date.now() - 60_000) }
    ] });
    await prisma.queueEntry.createMany({ data: [
      { vehicleId: firstVehicle.id, direction: "VILLAMONTES_TO_YACUIBA", position: 1, arrivedAt: new Date(Date.now() - 60_000) },
      { vehicleId: chosenVehicle.id, direction: "VILLAMONTES_TO_YACUIBA", position: 2, arrivedAt: new Date() }
    ] });

    const passengerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: passengerEmail, password } });
    const passengerCookie = String(passengerLogin.headers["set-cookie"]).split(";")[0];
    const created = await app.inject({ method: "POST", url: "/api/v1/bookings", headers: { cookie: passengerCookie, "idempotency-key": `manual-${suffix}` },
      payload: { direction: "VILLAMONTES_TO_YACUIBA", origin: "Villamontes", destination: "Yacuiba", pickupPoint: "PRUEBA: parada ficticia", passengers: 7, kind: "EXPRESS", paymentMethod: "CASH", cashBs: 245, qrBs: 0 } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: "PENDING", totalBs: 245 });
    const bookingId = created.json().id as string;
    bookingIds.push(bookingId);
    const adminLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: adminEmail, password } });
    const adminCookie = String(adminLogin.headers["set-cookie"]).split(";")[0];
    const driverLogin = await app.inject({ method: "POST", url: "/api/v1/auth/native/login", payload: { email: chosenDriverEmail, password } });
    const driverHeaders = { authorization: `Bearer ${driverLogin.json().accessToken}` };

    process.env.RUTA35_TEST_TARGET = "ruta35-pruebas";
    expect((await app.inject({ method: "GET", url: "/api/v1/config" })).json()).toMatchObject({ testMode: true, manualDispatchEnabled: false });
    expect((await app.inject({ method: "POST", url: `/api/v1/admin/test-dispatch/${bookingId}/assign`, headers: { cookie: adminCookie }, payload: { vehicleId: chosenVehicle.id, justification: "Validar la asignación visible en APK de pruebas" } })).statusCode).toBe(404);
    process.env.RUTA35_TEST_TARGET = "ruta35-android-pruebas";
    expect((await app.inject({ method: "GET", url: "/api/v1/config" })).json()).toMatchObject({ testMode: true, manualDispatchEnabled: true });
    expect((await app.inject({ method: "GET", url: `/api/v1/admin/test-dispatch/${bookingId}/candidates`, headers: { cookie: passengerCookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/admin/test-dispatch/${bookingId}/assign`, headers: driverHeaders, payload: { vehicleId: chosenVehicle.id, justification: "Test queue exception" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/admin/bookings/${bookingId}/confirm`, headers: { cookie: adminCookie } })).statusCode).toBe(200);
    const candidates = await app.inject({ method: "GET", url: `/api/v1/admin/test-dispatch/${bookingId}/candidates`, headers: { cookie: adminCookie } });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().candidates).toEqual(expect.arrayContaining([expect.objectContaining({ id: chosenVehicle.id, queuePosition: 2, compatible: true, available: true })]));
    const ordinary = await app.inject({ method: "POST", url: "/api/v1/driver/assignments", headers: driverHeaders, payload: { bookingId, vehicleId: chosenVehicle.id } });
    expect(ordinary.statusCode).toBe(409);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CONFIRMED");
    expect((await app.inject({ method: "POST", url: "/api/v1/driver/presence", headers: driverHeaders })).statusCode).toBe(200);
    const manual = await app.inject({ method: "POST", url: `/api/v1/admin/test-dispatch/${bookingId}/assign`, headers: { cookie: adminCookie }, payload: {
      vehicleId: chosenVehicle.id, justification: "Validar la asignación visible en APK de pruebas" } });
    expect(manual.statusCode).toBe(200);
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: bookingId, action: "TEST_MANUAL_BOOKING_ASSIGNED" } });
    expect(audit?.details).toMatchObject({ vehicleId: chosenVehicle.id, bypassedQueuePriority: true, queuePosition: 2, justification: "Validar la asignación visible en APK de pruebas" });
    const driverOverview = await app.inject({ method: "GET", url: "/api/v1/driver/overview", headers: driverHeaders });
    expect(driverOverview.json().bookings).toEqual(expect.arrayContaining([expect.objectContaining({ booking: expect.objectContaining({ id: bookingId, status: "ASSIGNED" }) })]));
    const passengerBookings = await app.inject({ method: "GET", url: "/api/v1/bookings", headers: { cookie: passengerCookie } });
    expect(passengerBookings.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId, status: "ASSIGNED", assignment: expect.objectContaining({ vehicle: expect.objectContaining({ plate: chosenVehicle.plate }) }) })]));
    const dashboard = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: adminCookie } });
    expect(dashboard.json().vehicles).toEqual(expect.arrayContaining([expect.objectContaining({ id: chosenVehicle.id, connectedRecently: true, available: false })]));
    await prisma.driverPresence.update({ where: { userId: chosenDriver.id }, data: { lastSeenAt: new Date(Date.now() - 121_000) } });
    const expiredDashboard = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard", headers: { cookie: adminCookie } });
    expect(expiredDashboard.json().vehicles).toEqual(expect.arrayContaining([expect.objectContaining({ id: chosenVehicle.id, connectedRecently: false })]));
  });
});
