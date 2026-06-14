import { useEffect, useMemo, useState } from "react";
import type {
  AuthSessionResponse,
  ConnectionType,
  Interest,
  PatientProfile,
  ValidateInvitationResponse,
} from "@mindmatch/shared";
import { updatePatientProfileSchema } from "@mindmatch/shared";
import { DiscoveryDeck } from "./components/DiscoveryDeck";
import { ConnectionsList } from "./components/ConnectionsList";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { PulseDashboard } from "./components/PulseDashboard";
import { MissionsList } from "./components/MissionsList";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DEFAULT_CLINIC_SLUG =
  import.meta.env.VITE_DEFAULT_CLINIC_SLUG ?? "mindmatch-demo";

const connectionLabels: Record<ConnectionType, string> = {
  friendship: "amistad",
  group: "grupo",
  romantic: "romántica",
};

function readInvitationToken() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token");
  if (token) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  return token;
}

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] =
    useState<ValidateInvitationResponse["invitation"] | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loginClinicSlug, setLoginClinicSlug] = useState(DEFAULT_CLINIC_SLUG);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [tab, setTab] = useState<
    "descubrir" | "conexiones" | "pulso" | "misiones" | "perfil"
  >("descubrir");
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [form, setForm] = useState({
    displayName: "",
    city: "",
    bio: "",
    goals: "",
    connectionTypes: [] as ConnectionType[],
    avatarUrl: "/avatars/default.svg",
    interestIds: [] as string[],
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
    if (data.user.role !== "patient") {
      setMessage("Esta sesión pertenece al panel de la doctora.");
      return;
    }
    setAccessToken(data.accessToken);
    setCurrentUserId(data.user.userId);
  }

  async function validateInvitation(nextToken: string) {
    const response = await fetch(`${API_URL}/invitations/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: nextToken }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => undefined);
      setMessage(data?.message ?? "La invitación no es válida.");
      return;
    }
    const data = (await response.json()) as ValidateInvitationResponse;
    setInvitation(data.invitation);
    setForm((current) => ({
      ...current,
      displayName: data.invitation.patientName,
      connectionTypes: data.invitation.allowedConnectionTypes,
    }));
  }

  async function loadProfile(nextToken = accessToken) {
    if (!nextToken) return;
    const [profileResponse, interestsResponse] = await Promise.all([
      fetch(`${API_URL}/patient/profile`, {
        headers: { Authorization: `Bearer ${nextToken}` },
        credentials: "include",
      }),
      fetch(`${API_URL}/patient/interests`, {
        headers: { Authorization: `Bearer ${nextToken}` },
        credentials: "include",
      }),
    ]);

    if (interestsResponse.ok) {
      const data = (await interestsResponse.json()) as { interests: Interest[] };
      setInterests(data.interests);
    }

    if (profileResponse.ok) {
      const data = (await profileResponse.json()) as { profile: PatientProfile };
      setProfile(data.profile);
      setForm({
        displayName: data.profile.displayName,
        city: data.profile.city,
        bio: data.profile.bio,
        goals: data.profile.goals,
        connectionTypes: data.profile.connectionTypes,
        avatarUrl: data.profile.avatarUrl ?? "/avatars/default.svg",
        interestIds: data.profile.interests.map((interest) => interest.id),
      });
    }
  }

  useEffect(() => {
    const nextToken = readInvitationToken();
    if (nextToken) {
      setToken(nextToken);
      void validateInvitation(nextToken);
    } else {
      void refreshSession();
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [accessToken]);

  async function acceptInvitation(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage("");
    const response = await fetch(`${API_URL}/invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password, passwordConfirmation }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => undefined);
      setMessage(data?.message ?? "No se pudo aceptar la invitación.");
      return;
    }
    const data = (await response.json()) as AuthSessionResponse;
    setAccessToken(data.accessToken);
    setCurrentUserId(data.user.userId);
    setToken(null);
    setInvitation(null);
    await loadProfile(data.accessToken);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        clinicSlug: loginClinicSlug,
        email: loginEmail,
        password: loginPassword,
      }),
    });
    if (!response.ok) {
      setMessage("Correo o contraseña inválidos.");
      return;
    }
    const data = (await response.json()) as AuthSessionResponse;
    if (data.user.role !== "patient") {
      setMessage("Esta cuenta debe entrar desde el panel de la doctora.");
      return;
    }
    setLoginPassword("");
    setAccessToken(data.accessToken);
    setCurrentUserId(data.user.userId);
    await loadProfile(data.accessToken);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsed = updatePatientProfileSchema.safeParse(form);
    if (!parsed.success) {
      setMessage("Completa tu perfil social antes de continuar.");
      return;
    }
    const response = await fetch(`${API_URL}/patient/profile`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      setMessage("No se pudo guardar el perfil.");
      return;
    }
    const data = (await response.json()) as { profile: PatientProfile };
    setProfile(data.profile);
    setMessage("Perfil guardado.");
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
    setCurrentUserId(null);
    setProfile(null);
  }

  if (invitation && token && !accessToken) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-6 text-center text-5xl">🧠</div>
        <h1 className="text-2xl font-extrabold text-calma-600">
          Bienvenida a MindMatch
        </h1>
        <p className="mt-2 text-calma-600/80">
          Invitación para {invitation.patientName}. Crea tu contraseña para
          activar tu cuenta.
        </p>
        <form className="mt-6 space-y-4" onSubmit={acceptInvitation}>
          <input
            className="field"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Confirmar contraseña"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
          <button className="w-full rounded-xl bg-calma-600 px-4 py-3 font-bold text-white">
            Activar cuenta
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl">🧠</div>
        <h1 className="mt-5 text-3xl font-extrabold text-calma-600">
          MindMatch
        </h1>
        <p className="mt-2 text-calma-600/80">
          Inicia sesión o abre tu enlace de invitación para activar la cuenta.
        </p>
        <form className="mt-6 w-full space-y-4 text-left" onSubmit={login}>
          <label className="block text-sm font-medium text-calma-600">
            Clínica
            <input
              className="field mt-1"
              value={loginClinicSlug}
              onChange={(event) => setLoginClinicSlug(event.target.value)}
              placeholder="Clínica"
            />
          </label>
          <input
            className="field"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            placeholder="Correo"
          />
          <input
            className="field"
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            placeholder="Contraseña"
          />
          <button className="w-full rounded-xl bg-calma-600 px-4 py-3 font-bold text-white">
            Entrar
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </main>
    );
  }

  const allowedTypes = profile?.allowedConnectionTypes ?? form.connectionTypes;

  return (
    <main className="mx-auto min-h-full max-w-md px-6 py-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-calma-600">MindMatch</h1>
          <p className="text-sm text-calma-600/70">Tu espacio social seguro</p>
        </div>
        <button className="rounded-xl border border-calma-200 px-3 py-2 text-sm text-calma-600" onClick={logout}>
          Salir
        </button>
      </header>

      <nav
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
        aria-label="Secciones"
      >
        {(
          [
            ["descubrir", "Descubrir"],
            ["conexiones", "Conexiones"],
            ["pulso", "Pulso"],
            ["misiones", "Misiones"],
            ["perfil", "Perfil"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${
              tab === key ? "bg-calma-600 text-white" : "bg-calma-100 text-calma-600"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "descubrir" && accessToken && <DiscoveryDeck token={accessToken} />}
      {tab === "conexiones" && accessToken && currentUserId && (
        <>
          <ConnectionsList token={accessToken} />
          <div className="mt-5">
            <ChatWorkspace token={accessToken} userId={currentUserId} />
          </div>
        </>
      )}
      {tab === "pulso" && accessToken && <PulseDashboard token={accessToken} />}
      {tab === "misiones" && accessToken && <MissionsList token={accessToken} />}

      {tab === "perfil" && (
      <form className="space-y-4 rounded-card bg-white p-5 shadow-sm" onSubmit={saveProfile}>
        <input className="field" placeholder="Nombre visible" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        <input className="field" placeholder="Ciudad" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        <textarea className="field min-h-24" placeholder="Biografía social" value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        <textarea className="field min-h-24" placeholder="Metas personales" value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} />
        <select className="field" value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })}>
          <option value="/avatars/default.svg">Avatar verde</option>
          <option value="/avatars/blue.svg">Avatar azul</option>
          <option value="/avatars/sun.svg">Avatar sol</option>
        </select>

        <section>
          <p className="mb-2 text-sm font-bold text-calma-600">Conexiones</p>
          <div className="flex flex-wrap gap-2">
            {allowedTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-full px-3 py-2 text-sm ${form.connectionTypes.includes(type) ? "bg-calma-600 text-white" : "bg-calma-100 text-calma-600"}`}
                onClick={() => {
                  const selected = form.connectionTypes.includes(type);
                  const next = selected
                    ? form.connectionTypes.filter((item) => item !== type)
                    : [...form.connectionTypes, type];
                  setForm({ ...form, connectionTypes: next });
                }}
              >
                {connectionLabels[type]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-sm font-bold text-calma-600">Intereses</p>
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <button
                key={interest.id}
                type="button"
                className={`rounded-full px-3 py-2 text-sm ${form.interestIds.includes(interest.id) ? "bg-cielo-400 text-white" : "bg-cielo-200 text-slate-700"}`}
                onClick={() => {
                  const selected = form.interestIds.includes(interest.id);
                  const next = selected
                    ? form.interestIds.filter((id) => id !== interest.id)
                    : [...form.interestIds, interest.id];
                  setForm({ ...form, interestIds: next });
                }}
              >
                {interest.name}
              </button>
            ))}
          </div>
        </section>

        <button className="w-full rounded-xl bg-calma-600 px-4 py-3 font-bold text-white">
          Guardar perfil
        </button>
        {message && <p className="text-sm text-calma-600">{message}</p>}
      </form>
      )}
    </main>
  );
}
