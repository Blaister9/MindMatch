import { useEffect, useMemo, useState } from "react";
import type {
  AuthSessionResponse,
  ConnectionType,
  CreateInvitationResponse,
  DoctorInvitation,
  ListInvitationsResponse,
} from "@mindmatch/shared";
import { CONNECTION_TYPES, createInvitationSchema } from "@mindmatch/shared";
import { PendingMatches } from "./components/PendingMatches";
import { ChatOversight } from "./components/ChatOversight";
import { PulseAlerts } from "./components/PulseAlerts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DEFAULT_CLINIC_SLUG =
  import.meta.env.VITE_DEFAULT_CLINIC_SLUG ?? "mindmatch-demo";

const connectionLabels: Record<ConnectionType, string> = {
  friendship: "Amistad",
  group: "Grupo",
  romantic: "Romántica",
};

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [clinicSlug, setClinicSlug] = useState(DEFAULT_CLINIC_SLUG);
  const [email, setEmail] = useState("doctora@demo.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [invitations, setInvitations] = useState<DoctorInvitation[]>([]);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [form, setForm] = useState({
    patientName: "",
    email: "",
    birthDate: "",
    expiresDate: addDays(7),
    restrictions: "",
    allowedConnectionTypes: ["friendship"] as ConnectionType[],
  });

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }, [accessToken]);

  async function refreshSession() {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return;
    const data = (await response.json()) as AuthSessionResponse;
    if (data.user.role !== "doctor") {
      setMessage("Esta sesión pertenece a la app del paciente.");
      setAccessToken(null);
      setUserRole(data.user.role);
      return;
    }
    setAccessToken(data.accessToken);
    setUserRole(data.user.role);
  }

  async function loadInvitations(token = accessToken) {
    if (!token) return;
    const response = await fetch(`${API_URL}/doctor/invitations`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (response.ok) {
      const data = (await response.json()) as ListInvitationsResponse;
      setInvitations(data.invitations);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [accessToken]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ clinicSlug, email, password }),
    });
    if (!response.ok) {
      setMessage("Correo o contraseña inválidos.");
      return;
    }
    const data = (await response.json()) as AuthSessionResponse;
    if (data.user.role !== "doctor") {
      setMessage("Esta cuenta debe entrar desde la app del paciente.");
      return;
    }
    setAccessToken(data.accessToken);
    setUserRole(data.user.role);
    await loadInvitations(data.accessToken);
  }

  async function logout() {
    if (accessToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
      });
    }
    setAccessToken(null);
    setUserRole(null);
    setInvitations([]);
  }

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    let restrictionsJson: Record<string, unknown> = {};
    if (form.restrictions.trim()) {
      restrictionsJson = { nota: form.restrictions.trim() };
    }

    const input = {
      patientName: form.patientName,
      email: form.email,
      birthDate: form.birthDate,
      allowedConnectionTypes: form.allowedConnectionTypes,
      restrictionsJson,
      expiresAt: new Date(`${form.expiresDate}T23:59:00-05:00`).toISOString(),
    };

    const parsed = createInvitationSchema.safeParse(input);
    if (!parsed.success) {
      setMessage("Revisa la invitación: edad, correo, tipos y expiración.");
      return;
    }

    const response = await fetch(`${API_URL}/doctor/invitations`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      setMessage("No se pudo crear la invitación.");
      return;
    }
    const data = (await response.json()) as CreateInvitationResponse;
    setLastInviteUrl(data.inviteUrl);
    setForm({
      patientName: "",
      email: "",
      birthDate: "",
      expiresDate: addDays(7),
      restrictions: "",
      allowedConnectionTypes: ["friendship"],
    });
    await loadInvitations();
  }

  async function revokeInvitation(id: string) {
    const response = await fetch(`${API_URL}/doctor/invitations/${id}/revoke`, {
      method: "POST",
      headers: authHeaders,
      credentials: "include",
    });
    if (!response.ok) {
      setMessage("No se pudo revocar la invitación.");
      return;
    }
    await loadInvitations();
  }

  if (!accessToken) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-8 py-10">
        <h1 className="text-2xl font-bold text-brand-600">MindMatch</h1>
        <p className="mt-1 text-slate-500">Panel de la doctora</p>
        <form className="mt-8 space-y-4" onSubmit={login}>
          <label className="block text-sm font-medium text-slate-600">
            Clínica
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
              value={clinicSlug}
              onChange={(event) => setClinicSlug(event.target.value)}
              placeholder="Clínica"
            />
          </label>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Correo"
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Contraseña"
            type="password"
          />
          <button className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white">
            Entrar
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
        {userRole === "patient" && (
          <a className="mt-4 text-sm text-brand-600" href="http://localhost:5173">
            Ir a la app del paciente
          </a>
        )}
      </main>
    );
  }

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
        <div>
          <h1 className="text-lg font-bold text-brand-600">
            MindMatch · Panel de la doctora
          </h1>
          <p className="text-sm text-slate-500">Invitaciones de pacientes</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={logout}>
          Salir
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-8 py-8">
        {accessToken && <PulseAlerts token={accessToken} />}
        {accessToken && <ChatOversight token={accessToken} />}
        {accessToken && <PendingMatches token={accessToken} />}
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-800">Crear invitación</h2>
          <form className="mt-5 space-y-4" onSubmit={createInvitation}>
            <input className="field" placeholder="Nombre del paciente" value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} />
            <input className="field" placeholder="Correo" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <label className="block text-sm font-medium text-slate-600">
              Fecha de nacimiento
              <input className="field mt-1" type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} />
            </label>
            <label className="block text-sm font-medium text-slate-600">
              Expira
              <input className="field mt-1" type="date" value={form.expiresDate} onChange={(event) => setForm({ ...form, expiresDate: event.target.value })} />
            </label>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">Conexiones autorizadas</p>
              {CONNECTION_TYPES.map((type) => (
                <label key={type} className="mr-3 inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowedConnectionTypes.includes(type)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...form.allowedConnectionTypes, type]
                        : form.allowedConnectionTypes.filter((item) => item !== type);
                      setForm({ ...form, allowedConnectionTypes: next });
                    }}
                  />
                  {connectionLabels[type]}
                </label>
              ))}
            </div>
            <textarea className="field min-h-20" placeholder="Restricciones para el demo" value={form.restrictions} onChange={(event) => setForm({ ...form, restrictions: event.target.value })} />
            <button className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white">
              Crear invitación
            </button>
          </form>
          {lastInviteUrl && (
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Enlace local</p>
              <input className="field mt-2" readOnly value={lastInviteUrl} />
              <button className="mt-2 rounded-lg border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(lastInviteUrl)}>
                Copiar
              </button>
            </div>
          )}
          {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-800">Invitaciones</h2>
          <div className="mt-4 divide-y">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold text-slate-800">{invitation.patientName}</p>
                  <p className="text-sm text-slate-500">{invitation.email}</p>
                  <p className="text-xs text-slate-400">
                    {invitation.status} · expira {new Date(invitation.expiresAt).toLocaleDateString("es-CO")}
                  </p>
                </div>
                {invitation.status === "pending" && (
                  <button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700" onClick={() => void revokeInvitation(invitation.id)}>
                    Revocar
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
