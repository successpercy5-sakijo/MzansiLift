import * as Location from "expo-location";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Camera,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Heart,
  HelpCircle,
  Home,
  Info,
  Layers,
  Lock,
  MessageCircle,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  Settings, Shield,
  Star,
  Trash2,
  User,
  X
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextProps,
  View,
} from "react-native";
import RNMap, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { supabase } from "../lib/supabase";

// ---------- Theme ----------
const C = {
  bg: "#0a0b14", card: "#12131f", secondary: "#1a1c2c", border: "#262a3d",
  primary: "#2563eb", fg: "#f1f5f9", muted: "#566078", danger: "#ef4444", green: "#4ade80",
};
const MONO = Platform.select({ ios: "Menlo", android: "monospace" });
// To use DM Sans / DM Mono: install expo-font + @expo-google-fonts/dm-sans, dm-mono and swap here.
const TOP = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

const T = ({ mono, style, ...p }: TextProps & { mono?: boolean }) => (
  <Text {...p} style={[{ color: C.fg, fontSize: 14 }, mono && { fontFamily: MONO }, style]} />
);
const Label = ({ children }: { children: string }) => (
  <T mono style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
    {children}
  </T>
);

// ---------- Data ----------
const PROVINCES = [
  { name: "Gauteng", desc: "Johannesburg · Pretoria · Soweto", available: true },
  { name: "Limpopo", desc: "Polokwane · Mokopane · Tzaneen", available: true },
  { name: "North West", desc: "Rustenburg · Mahikeng", available: false },
  { name: "Mpumalanga", desc: "Nelspruit · Witbank", available: false },
];
const ACCOUNT_MENU = [
  { icon: Settings, label: "Manage Account" }, { icon: Settings, label: "Settings" },
  { icon: Car, label: "Be a driver" }, { icon: Shield, label: "Safety" },
  { icon: HelpCircle, label: "Help" }, { icon: FileText, label: "Legal" },
  { icon: Heart, label: "Contact us" }, { icon: Info, label: "About us" },
];

// ---------- Live Google Map ----------
const PROVIDER = PROVIDER_GOOGLE; // set to undefined to use Apple Maps on iOS while testing
const DEFAULT_REGION: Region = { latitude: -26.2041, longitude: 28.0473, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0c0d1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#566078" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c0d1a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1c2c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1e3a8a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#080914" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];
type Pt = { latitude: number; longitude: number };

// Rider's live GPS position
function useMyLocation() {
  const [me, setMe] = useState<Pt | null>(null);
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        ({ coords }) => setMe({ latitude: coords.latitude, longitude: coords.longitude })
      );
    })();
    return () => sub?.remove();
  }, []);
  return me;
}

// Real drivers from the database (view `available_drivers` = online + seen in the last 2 minutes)
type AvailableRow = { id: string; full_name: string; vehicle: string; plate: string; price: number; rating: number; trips: number; latitude: number; longitude: number };
type LiveDriver = AvailableRow & { name: string; initials: string; eta: string; time: string; dist: number };

const distKm = (a: Pt, b: Pt) => {
  const r = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * r, dLon = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const fmtEta = (km: number) => {
  const m = Math.max(1, Math.round((km / 40) * 60)); // straight-line distance at ~40 km/h
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function useAvailableDrivers(active: boolean, me: Pt | null, myId?: string) {
  const [rows, setRows] = useState<AvailableRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      let q = supabase.from("available_drivers").select("*");
      if (myId) q = q.neq("id", myId); // don't show yourself to yourself
      const { data, error } = await q;
      if (!cancelled && !error && data) setRows(data as AvailableRow[]);
    };
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [active, myId]);

  const drivers = useMemo<LiveDriver[]>(
    () =>
      rows
        .map((r) => {
          const pt = { latitude: Number(r.latitude), longitude: Number(r.longitude) };
          const dist = me ? distKm(me, pt) : 0;
          return {
            ...r,
            ...pt,
            price: Number(r.price),
            rating: Number(r.rating),
            name: r.full_name,
            initials: r.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
            eta: me ? fmtEta(dist) : "—",
            time: "Now",
            dist,
          };
        })
        .sort((a, b) => a.dist - b.dist),
    [rows, me]
  );
  return { drivers, loading };
}

function MapView({ me, drivers }: { me: Pt | null; drivers: (Pt & { id: string })[] }) {
  const mapRef = React.useRef<RNMap>(null);
  const centered = React.useRef(false);

  // Move the camera to the rider once, when the first GPS fix arrives
  useEffect(() => {
    if (me && !centered.current) {
      centered.current = true;
      mapRef.current?.animateToRegion({ ...me, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
    }
  }, [me]);

  return (
    <RNMap
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER}
      customMapStyle={DARK_STYLE}
      initialRegion={DEFAULT_REGION}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {drivers.map((d) => (
        <Marker key={d.id} coordinate={d} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(37,99,235,0.25)", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#3b82f6" }} />
          </View>
        </Marker>
      ))}
    </RNMap>
  );
}

// ---------- Account: sign in + manage account ----------
type UserT = { id?: string; name: string; phone: string; email: string };
type BookingStart = { pickup?: string; dest?: string };
const AuthCtx = React.createContext<{
  user: UserT | null;
  setUser: (u: UserT | null) => void;
  openAuth: () => void;
  openDriver: () => void;
  startBooking: (p?: BookingStart) => void;
}>({ user: null, setUser: () => {}, openAuth: () => {}, openDriver: () => {}, startBooking: () => {} });

const toUser = (u?: { id?: string; email?: string; user_metadata?: any } | null): UserT | null =>
  u ? { id: u.id, name: u.user_metadata?.full_name || (u.email ?? "").split("@")[0], phone: u.user_metadata?.phone ?? "", email: u.email ?? "" } : null;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const Field = (p: React.ComponentProps<typeof TextInput> & { label: string }) => {
  const [show, setShow] = useState(false);
  const isPassword = !!p.secureTextEntry;
  return (
    <View style={{ marginBottom: 12 }}>
      <T style={[s.muted, { marginBottom: 6 }]}>{p.label}</T>
      <View>
        <TextInput
          {...p}
          secureTextEntry={isPassword && !show}
          placeholderTextColor={C.muted}
          style={{
            backgroundColor: C.secondary,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 12,
            color: C.fg,
            paddingLeft: 14,
            paddingRight: isPassword ? 46 : 14,
            paddingVertical: 12,
            opacity: p.editable === false ? 0.55 : 1,
          }}
        />
        {isPassword && (
          <Pressable
            onPress={() => setShow((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={show ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
          >
            {show ? <EyeOff size={18} color={C.muted} /> : <Eye size={18} color={C.muted} />}
          </Pressable>
        )}
      </View>
    </View>
  );
};

// "082 123 4567" -> "+27821234567" (South African numbers by default)
const normalizePhone = (raw: string) => {
  const d = raw.replace(/[^\d+]/g, "");
  let p: string;
  if (d.startsWith("+")) p = d;
  else if (d.startsWith("00")) p = "+" + d.slice(2);
  else if (d.startsWith("0")) p = "+27" + d.slice(1);
  else if (d.startsWith("27")) p = "+" + d;
  else p = "+27" + d;
  return /^\+\d{10,15}$/.test(p) ? p : null;
};

// Log in with email + password. New accounts confirm their email and phone with one-time codes.
function AuthModal({ visible, onClose, initialMode = "signin" }: { visible: boolean; onClose: () => void; initialMode?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<"form" | "email-code" | "phone-code">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (visible) {
      setMode(initialMode); setStep("form");
      setName(""); setPhone(""); setEmail(""); setPassword(""); setCode(""); setError(""); setCooldown(0);
    }
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Sends (or re-sends) the email code
  const sendEmailCode = async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) return setError(error.message);
    setError(""); setCode(""); setStep("email-code"); setCooldown(60);
  };

  const signIn = async () => {
    setError("");
    if (!email.includes("@") || password.length < 6) return setError("Enter your email and password");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      // Account exists but the email was never confirmed: send a fresh code
      if (error.message.toLowerCase().includes("not confirmed")) await sendEmailCode();
      else setError(error.message);
      return setBusy(false);
    }
    setBusy(false);
    onClose();
  };

  const signUp = async () => {
    setError("");
    if (!name.trim()) return setError("Enter your full name");
    if (!email.includes("@")) return setError("Enter a valid email");
    const p = normalizePhone(phone);
    if (!p) return setError("Enter a valid phone number, e.g. 082 123 4567");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), phone: p } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.user && data.user.identities?.length === 0) return setError("An account with this email already exists. Log in instead.");
    if (data.session) return startPhoneVerification(); // email confirmation is switched off in Supabase
    setCode(""); setStep("email-code"); setCooldown(60);
  };

  // Step 1 for new accounts: prove the email is theirs
  const verifyEmail = async () => {
    setError("");
    if (code.trim().length < 6) return setError("Enter the code we sent you");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(error.message);
    if (normalizePhone(phone)) return startPhoneVerification();
    onClose();
  };

  // Step 2: prove the phone number is theirs (SMS code)
  const startPhoneVerification = async () => {
    const { error } = await supabase.auth.updateUser({ phone: normalizePhone(phone)! });
    if (error) {
      Alert.alert("Phone not verified", `${error.message}\n\nYour email is verified, but your phone number is not.`);
      return onClose();
    }
    setError(""); setCode(""); setStep("phone-code"); setCooldown(60);
  };

  const verifyPhone = async () => {
    setError("");
    if (code.trim().length < 6) return setError("Enter the code we sent you");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone)!, token: code.trim(), type: "phone_change" });
    setBusy(false);
    if (error) return setError(error.message);
    onClose();
  };

  const title = step === "email-code" ? "Verify your email" : step === "phone-code" ? "Verify your phone" : mode === "signin" ? "Log in" : "Create account";
  const action = step === "form" ? (mode === "signin" ? signIn : signUp) : step === "email-code" ? verifyEmail : verifyPhone;
  const actionLabel = step === "form" ? (mode === "signin" ? "Log in" : "Create account") : "Verify";
  const resend = step === "email-code" ? sendEmailCode : startPhoneVerification;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={[s.card, { borderRadius: 24, padding: 24 }]}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
            <T style={{ fontWeight: "600", fontSize: 18 }}>{title}</T>
            <Pressable onPress={onClose}><X size={18} color={C.muted} /></Pressable>
          </View>

          {step === "form" ? (
            <>
              {mode === "signup" && <Field label="Full name" value={name} onChangeText={setName} />}
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              {mode === "signup" && <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="082 123 4567" />}
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
            </>
          ) : (
            <>
              <T style={[s.muted, { fontSize: 14, lineHeight: 20, marginBottom: 16 }]}>
                {step === "email-code"
                  ? `We sent a code to ${email.trim()}. Enter it to confirm this email is yours.`
                  : `We sent an SMS to ${normalizePhone(phone)}. Enter the code to confirm this number is yours.`}
              </T>
              <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={10} autoFocus />
            </>
          )}

          {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}

          <Pressable onPress={action} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
            <T style={s.primaryTxt}>{busy ? "Please wait..." : actionLabel}</T>
          </Pressable>

          {step !== "form" && (
            <View style={[s.row, { justifyContent: "space-between", marginTop: 16 }]}>
              {step === "email-code" ? (
                <Pressable onPress={() => { setStep("form"); setError(""); }}><T style={{ color: C.muted }}>Back</T></Pressable>
              ) : (
                <Pressable onPress={onClose}><T style={{ color: C.muted }}>Skip for now</T></Pressable>
              )}
              <Pressable onPress={resend} disabled={cooldown > 0 || busy}>
                <T style={{ color: cooldown > 0 ? C.muted : C.primary }}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</T>
              </Pressable>
            </View>
          )}
          {step === "form" && (
            <Pressable onPress={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }} style={{ alignItems: "center", marginTop: 16 }}>
              <T style={{ color: C.primary }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Log in"}</T>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Manage account page: nothing changes until you tap Update, then Save changes
function ManageAccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = React.useContext(AuthCtx);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [notif, setNotif] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => {
    const [f, ...rest] = (user?.name ?? "").split(" ");
    setFirst(f ?? ""); setLast(rest.join(" "));
  };
  useEffect(() => { if (visible) { load(); setEditing(false); setSaved(false); } }, [visible]);

  const save = async () => {
    if (!first.trim()) return Alert.alert("First name is required");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: `${first.trim()} ${last.trim()}`.trim(), phone: user?.phone ?? "" },
    });
    setBusy(false);
    if (error) return Alert.alert("Could not save", error.message);
    setEditing(false);
    setSaved(true);
  };
  const cancelEdit = () => { load(); setEditing(false); };

  // Deletes your login, driver profile and trips for real (see the delete_my_account SQL function)
  const confirmDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) { setBusy(false); return Alert.alert("Could not delete account", error.message); }
    await supabase.auth.signOut({ scope: "local" });
    setBusy(false);
    onClose();
  };
  const deleteAccount = () =>
    Alert.alert("Delete account?", "This permanently deletes your account, your trips and any driver profile. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: confirmDelete },
    ]);
  const soon = (what: string) => Alert.alert(what, "Coming soon");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Account info</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => soon("Change photo")} style={{ alignItems: "center", marginBottom: 24 }}>
              <View style={[s.avatar, { width: 88, height: 88, borderRadius: 44 }]}>
                <T style={{ color: C.primary, fontWeight: "600", fontSize: 32 }}>{first[0]?.toUpperCase() ?? "?"}</T>
              </View>
              <View style={[s.row, { marginTop: 8 }]}>
                <Camera size={13} color={C.primary} />
                <T style={{ color: C.primary, fontSize: 13, marginLeft: 6 }}>Change photo</T>
              </View>
            </Pressable>

            <Label>Personal info</Label>
            <Field label="First name" value={first} onChangeText={setFirst} editable={editing} />
            <Field label="Last name" value={last} onChangeText={setLast} editable={editing} />
            <Field label="Phone number (cannot be changed yet)" value={user?.phone ?? ""} editable={false} />
            <Field label="Email (cannot be changed yet)" value={user?.email ?? ""} editable={false} />

            {editing ? (
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                <Pressable onPress={cancelEdit} style={[s.modalBtn, { borderWidth: 1, borderColor: C.border }]}><T>Cancel</T></Pressable>
                <Pressable onPress={save} disabled={busy} style={[s.modalBtn, { backgroundColor: C.primary }, busy && { opacity: 0.6 }]}>
                  <T style={s.primaryTxt}>{busy ? "Saving..." : "Save changes"}</T>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setEditing(true); setSaved(false); }} style={[s.primaryBtn, { marginTop: 4 }]}>
                <T style={s.primaryTxt}>Update</T>
              </Pressable>
            )}
            {saved && <T style={{ color: C.green, textAlign: "center", marginTop: 10, fontSize: 13 }}>Saved</T>}

            <View style={{ height: 28 }} />
            <Label>Preferences</Label>
            <View style={[s.card, s.row, { justifyContent: "space-between" }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <T style={{ fontWeight: "500" }}>Trip notifications</T>
                <T style={[s.muted, { marginTop: 2 }]}>Ride updates and reminders</T>
              </View>
              <Switch value={notif} onValueChange={setNotif} trackColor={{ false: C.border, true: C.primary }} thumbColor="#fff" />
            </View>

            <View style={{ height: 28 }} />
            <Label>Security</Label>
            <Pressable onPress={() => soon("Change password")} style={[s.card, s.row]}>
              <Lock size={16} color={C.muted} />
              <T style={{ flex: 1, marginLeft: 12, fontWeight: "500" }}>Change password</T>
              <ChevronRight size={15} color={C.muted} />
            </Pressable>

            <Pressable onPress={deleteAccount} disabled={busy} style={[s.card, s.row, { marginTop: 32, borderColor: "rgba(239,68,68,0.3)" }]}>
              <Trash2 size={16} color={C.danger} />
              <T style={{ marginLeft: 12, color: C.danger, fontWeight: "500" }}>Delete account</T>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Be a driver ----------
type DriverRow = { id: string; full_name: string; phone: string; vehicle: string; plate: string; price: number; rating: number; trips: number; is_online: boolean };

function DriverModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = React.useContext(AuthCtx);
  const [uid, setUid] = useState<string | null>(null);
  const [row, setRow] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const fill = (r: DriverRow | null) => {
    setName(r?.full_name ?? user?.name ?? "");
    setPhone(r?.phone ?? user?.phone ?? "");
    setVehicle(r?.vehicle ?? ""); setPlate(r?.plate ?? ""); setPrice(r ? String(r.price) : "");
  };

  const load = async () => {
    setLoading(true); setError(""); setSaved(false);
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUid(id);
    if (id) {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, full_name, phone, vehicle, plate, price, rating, trips, is_online")
        .eq("id", id)
        .maybeSingle();
      if (error) setError(error.message);
      setRow(data as DriverRow | null);
      fill(data as DriverRow | null);
    }
    setLoading(false);
  };

  useEffect(() => { if (user && (visible || !row)) load(); }, [visible, user?.id]);
  useEffect(() => { if (!user) setRow(null); }, [user]);

  const edit = (setter: (t: string) => void) => (t: string) => { setter(t); setSaved(false); };

  const validate = () => {
    const p = parseInt(price, 10);
    if (!name.trim() || !phone.trim() || !vehicle.trim() || !plate.trim() || !(p > 0)) {
      setError("Please fill in every field. Price must be more than 0.");
      return null;
    }
    return { full_name: name.trim(), phone: phone.trim(), vehicle: vehicle.trim(), plate: plate.trim().toUpperCase(), price: p };
  };

  const register = async () => {
    setError("");
    const v = validate();
    if (!v || !uid) return;
    setBusy(true);
    const { error } = await supabase.from("drivers").insert({ id: uid, ...v });
    if (error) { setBusy(false); return setError(error.message); }
    await load();
    setBusy(false);
  };

  const saveEdits = async () => {
    setError("");
    const v = validate();
    if (!v || !row) return;
    setBusy(true);
    const { error } = await supabase.from("drivers").update(v).eq("id", row.id);
    setBusy(false);
    if (error) return setError(error.message);
    setRow({ ...row, ...v });
    setSaved(true);
  };

  // Sends the driver's current position. Riders only see drivers updated in the last 2 minutes.
  const pushLocation = async (goOnline = false) => {
    if (!row) return false;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { error } = await supabase
        .from("drivers")
        .update({
          ...(goOnline ? { is_online: true } : {}),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          last_seen: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) { setError(error.message); return false; }
      return true;
    } catch {
      setError("Could not get your location. Turn on GPS and try again.");
      return false;
    }
  };

  const toggleOnline = async (on: boolean) => {
    if (!row) return;
    setError("");
    if (on) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return Alert.alert("Location needed", "Allow location so riders can see you on the map.");
      if (!(await pushLocation(true))) return;
    } else {
      const { error } = await supabase.from("drivers").update({ is_online: false }).eq("id", row.id);
      if (error) return setError(error.message);
    }
    setRow({ ...row, is_online: on });
  };

  // While online, refresh location every 20 seconds (works on any tab, while the app is open)
  useEffect(() => {
    if (!row?.is_online) return;
    const t = setInterval(() => pushLocation(), 20000);
    return () => clearInterval(t);
  }, [row?.is_online, row?.id]);

  const form = (
    <>
      <Field label="Full name" value={name} onChangeText={edit(setName)} />
      <Field label="Phone number" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" />
      <Field label="Vehicle (e.g. Toyota Corolla)" value={vehicle} onChangeText={edit(setVehicle)} />
      <Field label="Number plate" value={plate} onChangeText={edit(setPlate)} autoCapitalize="characters" />
      <Field label="Price per trip (R)" value={price} onChangeText={edit(setPrice)} keyboardType="number-pad" />
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>{row ? "Driver dashboard" : "Be a driver"}</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <T style={s.muted}>Loading...</T>
            ) : !row ? (
              <>
                <T style={[s.muted, { fontSize: 14, marginBottom: 20, lineHeight: 20 }]}>
                  Tell us about you and your car. Once you go online, riders can see and book you.
                </T>
                {form}
                {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
                <Pressable onPress={register} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
                  <T style={s.primaryTxt}>{busy ? "Please wait..." : "Become a driver"}</T>
                </Pressable>
              </>
            ) : (
              <>
                <View style={[s.card, s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <T style={{ fontWeight: "600" }}>{row.is_online ? "You're online" : "You're offline"}</T>
                    <T style={[s.muted, { marginTop: 2 }]}>
                      {row.is_online ? "Riders can see you. Keep the app open." : "Turn on to appear to riders."}
                    </T>
                  </View>
                  <Switch value={row.is_online} onValueChange={toggleOnline} trackColor={{ false: C.border, true: C.primary }} thumbColor="#fff" />
                </View>
                <View style={[s.card, { flexDirection: "row", marginBottom: 24 }]}>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <T style={s.muted}>Rating</T>
                    <T mono style={{ fontWeight: "600", color: C.primary }}>{Number(row.rating).toFixed(1)}</T>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <T style={s.muted}>Trips</T>
                    <T mono style={{ fontWeight: "600" }}>{row.trips}</T>
                  </View>
                </View>
                <Label>Your details</Label>
                {form}
                {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
                <Pressable onPress={saveEdits} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
                  <T style={s.primaryTxt}>{busy ? "Please wait..." : "Save changes"}</T>
                </Pressable>
                {saved && <T style={{ color: C.green, textAlign: "center", marginTop: 10, fontSize: 13 }}>Saved</T>}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Welcome screen (shown first) ----------
function WelcomeScreen({ onLogin, onSignup, onGuest }: { onLogin: () => void; onSignup: () => void; onGuest: () => void }) {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Car size={40} color="#fff" />
        </View>
        <T style={{ fontSize: 32, fontWeight: "700" }}>Lyft<T style={{ fontSize: 32, fontWeight: "700", color: C.primary }}>Club</T></T>
        <T style={[s.muted, { fontSize: 14, marginTop: 8 }]}>Intercity rides, door to door</T>
      </View>
      <View style={{ gap: 12, paddingBottom: 16 }}>
        <Pressable onPress={onSignup} style={s.primaryBtn}>
          <T style={s.primaryTxt}>Create account</T>
        </Pressable>
        <Pressable onPress={onLogin} style={[s.primaryBtn, { backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border }]}>
          <T style={s.primaryTxt}>Log in</T>
        </Pressable>
        <Pressable onPress={onGuest} style={{ alignItems: "center", paddingVertical: 12 }}>
          <T style={{ color: C.muted }}>Continue as guest</T>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Screens ----------
type Prefill = { pickup: string; dest: string; n: number };

function HomeScreen({ onProfile, prefill, onPrefillUsed }: { onProfile: () => void; prefill: Prefill | null; onPrefillUsed: () => void }) {
  const { user, openAuth } = React.useContext(AuthCtx);
  const [state, setState] = useState<"idle" | "searching" | "results">("idle");
  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [chosen, setChosen] = useState<LiveDriver | null>(null);
  const [rideId, setRideId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const me = useMyLocation();
  const { drivers, loading } = useAvailableDrivers(state !== "idle" || !!rideId, me, user?.id);
  const selectedDriver = drivers.find((x) => x.id === selected) ?? null;
  const reset = () => { setRideId(null); setChosen(null); setState("idle"); setSelected(null); setPickup(""); setDest(""); };

  // Coming from Services ("Book a trip", a city) or Activity ("Rebook")
  useEffect(() => {
    if (!prefill) return;
    setPickup(prefill.pickup);
    setDest(prefill.dest);
    setState(prefill.dest.trim() ? "results" : "searching");
    onPrefillUsed();
  }, [prefill?.n]);

  const bookRide = async () => {
    if (!selectedDriver || booking) return;
    if (!user) {
      Alert.alert("Sign in to book", "Create an account or log in to book your ride.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => openAuth() },
      ]);
      return;
    }
    setBooking(true);
    const { data, error } = await supabase.rpc("book_ride", {
      p_driver: selectedDriver.id,
      p_pickup: pickup.trim() || "Current location",
      p_destination: dest.trim(),
    });
    setBooking(false);
    if (error) return Alert.alert("Could not book", error.message);
    const ride = Array.isArray(data) ? data[0] : data;
    setChosen(selectedDriver);
    setRideId((ride as { id: string }).id);
  };

  const cancelRide = async () => {
    if (rideId) {
      const { error } = await supabase.from("rides").update({ status: "cancelled" }).eq("id", rideId);
      if (error) return Alert.alert("Could not cancel", error.message);
    }
    reset();
  };

  if (rideId && chosen) {
    const d = drivers.find((x) => x.id === chosen.id) ?? chosen; // live position, falls back to the booked snapshot
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <MapView me={me} drivers={[d]} />
          <View style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
            <View style={s.card}>
              <View style={s.row}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 8 }} />
                <T mono style={{ fontSize: 11, color: C.green, letterSpacing: 1.5, textTransform: "uppercase" }}>Ride confirmed</T>
              </View>
              <View style={[s.row, { marginTop: 10 }]}>
                <View style={s.avatar}><T style={s.avatarTxt}>{d.initials}</T></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <T style={{ fontWeight: "500" }}>{d.name}</T>
                  <T style={s.muted}>{d.vehicle} · {d.plate}</T>
                </View>
                <Pressable style={s.roundBtn}><Phone size={14} color={C.primary} /></Pressable>
                <Pressable style={[s.roundBtn, { marginLeft: 8 }]}><MessageCircle size={14} color={C.primary} /></Pressable>
              </View>
              <View style={s.statsRow}>
                {[["ETA", d.eta, C.primary], ["Fare", `R${d.price}`, C.fg], ["Time", d.time, C.fg]].map(([l, v, col]) => (
                  <View key={l} style={{ flex: 1, alignItems: "center" }}>
                    <T style={s.muted}>{l}</T>
                    <T mono style={{ fontWeight: "600", color: col }}>{v}</T>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Pressable onPress={cancelRide} style={s.dangerOutline}>
            <T style={{ color: C.danger, fontWeight: "500" }}>Cancel ride</T>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, zIndex: 10 }}>
        {state === "idle" ? (
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
            <View>
              <T style={s.muted}>{getGreeting()}</T>
              <T style={{ fontWeight: "600", fontSize: 16 }}>Lyft<T style={{ fontWeight: "600", fontSize: 16, color: C.primary }}>Club</T></T>
            </View>
            <Pressable onPress={onProfile} style={s.roundBtn}><User size={16} color={C.muted} /></Pressable>
          </View>
        ) : (
          <View style={[s.row, { marginBottom: 16 }]}>
            <Pressable onPress={() => { setState("idle"); setPickup(""); setDest(""); }} style={[s.roundBtn, { marginRight: 12 }]}>
              <X size={16} color={C.fg} />
            </Pressable>
            <T style={{ fontWeight: "500" }}>Book your ride</T>
          </View>
        )}

        {state === "idle" ? (
          <Pressable onPress={() => setState("searching")} style={[s.row, s.search]}>
            <Search size={16} color={C.primary} />
            <T style={[s.muted, { fontSize: 14, marginLeft: 12 }]}>Where to?</T>
          </Pressable>
        ) : (
          <View style={[s.search, { padding: 0, overflow: "hidden" }]}>
            <View style={[s.row, s.inputRow, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
              <View style={[s.dot, { backgroundColor: C.primary }]} />
              <TextInput autoFocus value={pickup} onChangeText={setPickup} placeholder="Enter pickup location"
                placeholderTextColor={C.muted} style={s.input} />
              {!!pickup && <Pressable onPress={() => setPickup("")}><X size={13} color={C.muted} /></Pressable>}
            </View>
            <View style={[s.row, s.inputRow]}>
              <View style={[s.dot, { borderRadius: 2, backgroundColor: "rgba(241,245,249,0.4)" }]} />
              <TextInput value={dest} onChangeText={setDest} placeholder="Where to go" placeholderTextColor={C.muted}
                returnKeyType="search" onSubmitEditing={() => dest.trim() && setState("results")} style={s.input} />
              {!!dest && <Pressable onPress={() => setDest("")}><X size={13} color={C.muted} /></Pressable>}
            </View>
          </View>
        )}

        {state === "searching" && dest.trim().length > 0 && (
          <Pressable onPress={() => setState("results")} style={[s.primaryBtn, { marginTop: 12, flexDirection: "row" }]}>
            <T style={s.primaryTxt}>Find drivers </T>
            <ArrowRight size={15} color="#fff" />
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <MapView me={me} drivers={drivers} />
        {state === "results" && (
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={[s.row, { justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 }]}>
              <T style={{ fontWeight: "600" }}>Available rides</T>
              <T style={s.muted} numberOfLines={1}>{pickup || "Your location"} → {dest}</T>
            </View>
            <ScrollView style={{ maxHeight: 288 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
              {drivers.length === 0 && (
                <T style={[s.muted, { textAlign: "center", paddingVertical: 24 }]}>
                  {loading ? "Looking for drivers..." : "No drivers are online right now. We'll keep checking."}
                </T>
              )}
              {drivers.map((d) => {
                const on = selected === d.id;
                return (
                  <Pressable key={d.id} onPress={() => setSelected(on ? null : d.id)}
                    style={[s.driver, on && { borderColor: C.primary, backgroundColor: "rgba(37,99,235,0.05)" }]}>
                    <View style={[s.row, { marginBottom: 12 }]}>
                      <View style={s.avatar}><T style={s.avatarTxt}>{d.initials}</T></View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <T style={{ fontWeight: "500" }} numberOfLines={1}>{d.name}</T>
                        <T style={s.muted}>{d.vehicle}</T>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <T mono style={{ fontWeight: "600", color: C.primary }}>R{d.price}</T>
                        <View style={[s.row, { marginTop: 2 }]}>
                          <Star size={10} color={C.primary} fill={C.primary} />
                          <T style={[s.muted, { marginLeft: 4 }]}>{d.trips === 0 ? "New" : d.rating.toFixed(1)}</T>
                        </View>
                      </View>
                    </View>
                    <View style={s.row}>
                      <View style={[s.row, { marginRight: 16 }]}><Clock size={10} color={C.muted} /><T mono style={[s.muted, { marginLeft: 4 }]}>{d.time}</T></View>
                      <View style={[s.row, { marginRight: 16 }]}><Navigation size={10} color={C.muted} /><T mono style={[s.muted, { marginLeft: 4 }]}>{d.eta}</T></View>
                      <T mono style={[s.muted, s.plate]}>{d.plate}</T>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selectedDriver && (
              <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
                <Pressable onPress={bookRide} disabled={booking} style={[s.primaryBtn, booking && { opacity: 0.6 }]}>
                  <T style={s.primaryTxt}>{booking ? "Booking..." : `Book ride — R${selectedDriver.price}`}</T>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function ServicesScreen() {
  const { startBooking } = React.useContext(AuthCtx);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24 }}>
      <T mono style={[s.muted, { marginBottom: 4 }]}>Intercity</T>
      <T style={s.h2}>Services</T>
      <Pressable onPress={() => startBooking()} style={[s.row, s.bookTrip]}>
        <View style={s.tripIcon}><Car size={22} color="#fff" /></View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <T style={{ fontWeight: "600" }}>Book a trip</T>
          <T style={[s.muted, { marginTop: 2 }]}>Intercity rides, door to door</T>
        </View>
        <ChevronRight size={16} color={C.primary} />
      </Pressable>
      <Label>Available provinces</Label>
      {PROVINCES.map((p) => (
        <View key={p.name} style={{ marginBottom: 8 }}>
          <Pressable onPress={() => p.available && setExpanded(expanded === p.name ? null : p.name)}
            style={[s.row, s.province, !p.available && { opacity: 0.5, backgroundColor: C.secondary }]}>
            <View style={[s.dot, { backgroundColor: p.available ? C.primary : C.muted, marginRight: 12 }]} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: "500" }}>{p.name}</T>
              <T style={[s.muted, { marginTop: 2 }]}>{p.desc}</T>
            </View>
            {p.available ? (
              <View style={{ transform: [{ rotate: expanded === p.name ? "180deg" : "0deg" }] }}>
                <ChevronDown size={15} color={C.muted} />
              </View>
            ) : (
              <T style={[s.muted, s.soon]}>Soon</T>
            )}
          </Pressable>
          {expanded === p.name && (
            <View style={s.cities}>
              <T style={[s.muted, { marginBottom: 12 }]}>Cities covered · tap one to book a ride there</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {p.desc.split(" · ").map((c) => (
                  <Pressable key={c} onPress={() => startBooking({ dest: c })}><T style={s.chip}>{c}</T></Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}
      <View style={[s.row, s.notice]}>
        <AlertCircle size={16} color={C.primary} />
        <T style={[s.muted, { flex: 1, marginLeft: 12, lineHeight: 18 }]}>
          More provinces are coming soon. We are expanding across South Africa.
        </T>
      </View>
    </ScrollView>
  );
}

// ---------- Rides (upcoming + history) ----------
type RideRow = {
  id: string; driver_name: string; driver_vehicle: string | null; driver_plate: string | null;
  pickup: string; destination: string; price: number;
  status: "booked" | "completed" | "cancelled"; created_at: string;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`; };
const fmtTime = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function ActivityScreen() {
  const { user, openAuth, startBooking } = React.useContext(AuthCtx);
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = async () => {
    if (!user?.id) { setRides([]); return; }
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else { setError(""); setRides(data as RideRow[]); }
  };

  // Runs every time the Activity tab opens, so a ride booked a moment ago shows up immediately
  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [user?.id]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const setStatus = async (id: string, status: "completed" | "cancelled") => {
    const { error } = await supabase.from("rides").update({ status }).eq("id", id);
    if (error) return Alert.alert("Could not update ride", error.message);
    await load();
  };

  const upcoming = rides.filter((r) => r.status === "booked");
  const history = rides.filter((r) => r.status !== "booked");

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}
      >
        <T mono style={[s.muted, { marginBottom: 4 }]}>Your trips</T>
        <T style={s.h2}>Activity</T>

        {!user ? (
          <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
            <T style={{ fontWeight: "600", marginBottom: 6 }}>Sign in to see your trips</T>
            <T style={[s.muted, { textAlign: "center", marginBottom: 16 }]}>Your booked rides and trip history appear here.</T>
            <Pressable onPress={() => openAuth()} style={[s.primaryBtn, { paddingHorizontal: 32 }]}>
              <T style={s.primaryTxt}>Sign in</T>
            </Pressable>
          </View>
        ) : (
          <>
            {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}

            <Label>Upcoming rides</Label>
            {upcoming.length === 0 && (
              <T style={[s.muted, { marginBottom: 24 }]}>{loading ? "Loading..." : "No upcoming rides. Book one from Home or Services."}</T>
            )}
            {upcoming.map((r) => (
              <View key={r.id} style={[s.card, { marginBottom: 24 }]}>
                <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={[s.row, { marginBottom: 4 }]}>
                      <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{r.pickup}</T>
                      <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
                      <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{r.destination}</T>
                    </View>
                    <T mono style={s.muted}>{fmtDate(r.created_at)} · {fmtTime(r.created_at)} · R{r.price}</T>
                  </View>
                  <T style={s.booked}>Booked</T>
                </View>
                <View style={[s.row, s.cardFoot]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <T style={s.muted} numberOfLines={1}>
                      {r.driver_name}{r.driver_vehicle ? ` · ${r.driver_vehicle}` : ""}{r.driver_plate ? ` · ${r.driver_plate}` : ""}
                    </T>
                  </View>
                  <View style={[s.row, { gap: 8 }]}>
                    {/* Interim: the rider marks the trip done. Later the driver's app should do this. */}
                    <Pressable onPress={() => setStatus(r.id, "completed")} style={[s.cancelPill, { borderColor: "rgba(74,222,128,0.3)" }]}>
                      <T style={{ fontSize: 12, color: C.green }}>Complete</T>
                    </Pressable>
                    <Pressable onPress={() => setCancelId(r.id)} style={s.cancelPill}>
                      <T style={{ fontSize: 12, color: C.danger }}>Cancel</T>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

            <Label>History</Label>
            {history.length === 0 && <T style={s.muted}>{loading ? "" : "Completed and cancelled rides show up here."}</T>}
            {history.map((r) => (
              <View key={r.id} style={[s.card, { marginBottom: 12 }]}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                  <View style={[s.row, { flex: 1, paddingRight: 8 }]}>
                    {r.status === "completed" ? <CheckCircle size={14} color={C.primary} /> : <X size={14} color={C.muted} />}
                    <T style={{ fontWeight: "500", marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{r.pickup}</T>
                    <ArrowRight size={12} color={C.muted} style={{ marginHorizontal: 6 }} />
                    <T style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>{r.destination}</T>
                  </View>
                  <T mono style={{ fontWeight: "600", color: r.status === "completed" ? C.primary : C.muted }}>R{r.price}</T>
                </View>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <T mono style={s.muted}>
                    {fmtDate(r.created_at)} · {fmtTime(r.created_at)}{r.status === "cancelled" ? " · Cancelled" : ""}
                  </T>
                  <Pressable
                    onPress={() => startBooking({ pickup: r.pickup === "Current location" ? "" : r.pickup, dest: r.destination })}
                    style={s.row}
                  >
                    <RotateCcw size={11} color={C.primary} />
                    <T style={{ fontSize: 12, color: C.primary, marginLeft: 4 }}>Rebook</T>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={cancelId !== null} transparent animationType="slide" onRequestClose={() => setCancelId(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", padding: 16 }}>
          <View style={[s.card, { borderRadius: 24, padding: 24 }]}>
            <T style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Cancel this ride?</T>
            <T style={[s.muted, { fontSize: 14, marginBottom: 20 }]}>This action cannot be undone.</T>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => setCancelId(null)} style={[s.modalBtn, { borderWidth: 1, borderColor: C.border }]}>
                <T>Keep ride</T>
              </Pressable>
              <Pressable
                onPress={() => { const id = cancelId; setCancelId(null); if (id) setStatus(id, "cancelled"); }}
                style={[s.modalBtn, { backgroundColor: C.danger }]}
              >
                <T style={{ color: "#fff", fontWeight: "500" }}>Yes, cancel</T>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function AccountScreen() {
  const { user, setUser, openAuth, openDriver } = React.useContext(AuthCtx);
  const [manageOpen, setManageOpen] = useState(false);
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}>
      <Pressable onPress={user ? () => setManageOpen(true) : openAuth} style={[s.row, { paddingHorizontal: 16, marginBottom: 24 }]}>
        <View style={[s.avatar, { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: "rgba(37,99,235,0.3)" }]}>
          {user ? <T style={{ color: C.primary, fontWeight: "600", fontSize: 24 }}>{user.name[0]?.toUpperCase()}</T> : <User size={26} color={C.primary} />}
        </View>
        <View style={{ marginLeft: 16 }}>
          <T style={{ fontWeight: "600", fontSize: 16 }}>{user ? user.name : "Guest"}</T>
          <T style={[s.muted, { marginTop: 2 }]}>{user ? user.phone || user.email : "Tap to sign in"}</T>
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 16 }}>
        {ACCOUNT_MENU.map(({ icon: Icon, label }, i) => (
          <Pressable key={label + i} onPress={() => {
            if (label === "Manage Account") { user ? setManageOpen(true) : openAuth(); }
            if (label === "Be a driver") {
              user ? openDriver() : Alert.alert("Sign in to drive", "Create an account or log in to become a driver.", [
                { text: "Not now", style: "cancel" },
                { text: "Sign in", onPress: () => openAuth() },
              ]);
            }
          }} style={[s.row, s.menuItem, i === 2 && { marginTop: 16, borderTopWidth: 1, borderTopColor: C.border }]}>
            <View style={s.menuIcon}><Icon size={16} color={C.muted} /></View>
            <T style={{ flex: 1, fontWeight: "500", marginLeft: 16 }}>{label}</T>
            <ChevronRight size={15} color={C.muted} />
          </Pressable>
        ))}
      </View>
      <View style={[s.card, { backgroundColor: C.secondary, marginHorizontal: 16, marginTop: 24 }]}>
        <T style={[s.muted, { marginBottom: 12 }]}>Connect with us</T>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {["Website", "Social Media", "Email"].map((l) => (
            <Pressable key={l} style={s.connectBtn}><T style={[s.muted, { fontSize: 12 }]}>{l}</T></Pressable>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
        <Pressable onPress={user ? () => setUser(null) : openAuth} style={[s.dangerOutline, { borderRadius: 16 }]}>
          <T style={{ color: user ? C.danger : C.primary, fontWeight: "500" }}>{user ? "Sign out" : "Sign in"}</T>
        </Pressable>
      </View>
      <T mono style={[s.muted, { textAlign: "center", marginTop: 24 }]}>LyftClub v1.0.0 · South Africa</T>
      <ManageAccountModal visible={manageOpen} onClose={() => setManageOpen(false)} />
    </ScrollView>
  );
}

// ---------- Navigation ----------
const NAV = [
  { id: "home", icon: Home, label: "Home" },
  { id: "services", icon: Layers, label: "Services" },
  { id: "activity", icon: Activity, label: "Activity" },
  { id: "account", icon: User, label: "Account" },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [user, setUserState] = useState<UserT | null>(null);
  const [loading, setLoading] = useState(true); // checking for a saved sign-in
  const [guest, setGuest] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [driverOpen, setDriverOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserState(toUser(data.session?.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUserState(toUser(session?.user));
      if (session) setGuest(false);
      if (event === "SIGNED_OUT") { setGuest(false); setTab("home"); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const setUser = (u: UserT | null) => {
    if (!u) { supabase.auth.signOut(); return; }
    supabase.auth
      .updateUser({ data: { full_name: u.name, phone: u.phone } })
      .then(({ error }) => { if (error) Alert.alert("Could not save", error.message); });
  };
  const openAuth = (mode: "signin" | "signup" = "signin") => { setAuthMode(mode); setAuthOpen(true); };
  // Opens the Home tab ready to book (used by Services and by Rebook)
  const startBooking = (p?: BookingStart) => { setPrefill({ pickup: p?.pickup ?? "", dest: p?.dest ?? "", n: Date.now() }); setTab("home"); };

  const showWelcome = !loading && !user && !guest;

  return (
    <AuthCtx.Provider value={{ user, setUser, openAuth: () => openAuth("signin"), openDriver: () => setDriverOpen(true), startBooking }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <StatusBar barStyle="light-content" />
        {loading ? null : showWelcome ? (
          <WelcomeScreen onLogin={() => openAuth("signin")} onSignup={() => openAuth("signup")} onGuest={() => setGuest(true)} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === "home" && <HomeScreen onProfile={() => setTab("account")} prefill={prefill} onPrefillUsed={() => setPrefill(null)} />}
              {tab === "services" && <ServicesScreen />}
              {tab === "activity" && <ActivityScreen />}
              {tab === "account" && <AccountScreen />}
            </View>
            <View style={s.nav}>
              {NAV.map(({ id, icon: Icon, label }) => {
                const on = tab === id;
                return (
                  <Pressable key={id} onPress={() => setTab(id)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, gap: 4 }}>
                    <Icon size={20} color={on ? C.primary : C.muted} strokeWidth={on ? 2 : 1.5} />
                    <T mono style={{ fontSize: 10, letterSpacing: 0.5, color: on ? C.primary : C.muted }}>{label}</T>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <AuthModal visible={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
        <DriverModal visible={driverOpen} onClose={() => setDriverOpen(false)} />
      </SafeAreaView>
    </AuthCtx.Provider>
  );
}

// ---------- Styles ----------
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  muted: { fontSize: 12, color: C.muted },
  h2: { fontSize: 20, fontWeight: "600", marginBottom: 24 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  cardFoot: { justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(37,99,235,0.15)", alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: C.primary, fontWeight: "600" },
  roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  dangerOutline: { paddingVertical: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.5)", borderRadius: 12, alignItems: "center" },
  search: { backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  inputRow: { paddingHorizontal: 16, paddingVertical: 4 },
  input: { flex: 1, color: C.fg, fontSize: 14, paddingVertical: 8, marginLeft: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  primaryBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryTxt: { color: "#fff", fontWeight: "500" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 12, marginBottom: 8 },
  driver: { borderWidth: 1, borderColor: C.border, backgroundColor: C.secondary, borderRadius: 16, padding: 16 },
  plate: { backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  bookTrip: { backgroundColor: "rgba(37,99,235,0.1)", borderWidth: 1, borderColor: "rgba(37,99,235,0.3)", borderRadius: 16, padding: 16, marginBottom: 24 },
  tripIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  province: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  soon: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  cities: { marginHorizontal: 16, padding: 16, backgroundColor: C.secondary, borderWidth: 1, borderTopWidth: 0, borderColor: C.border, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  chip: { fontSize: 12, color: "rgba(241,245,249,0.8)", borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, overflow: "hidden" },
  notice: { marginTop: 24, padding: 16, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, borderRadius: 16 },
  booked: { fontSize: 12, color: C.primary, backgroundColor: "rgba(37,99,235,0.1)", borderWidth: 1, borderColor: "rgba(37,99,235,0.2)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  cancelPill: { borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: "center" },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  connectBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderWidth: 1, borderColor: C.border, borderRadius: 12 },
  nav: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
});
