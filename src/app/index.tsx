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
  X,

} from "lucide-react-native";
import React, { useEffect, useState, useMemo } from "react";

import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextProps,
  View,
  ActivityIndicator
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
const DRIVERS = [
  { id: 1, name: "David Mokoena", rating: 4.9, trips: 1240, vehicle: "Toyota Corolla", plate: "GP 42-18 LR", eta: "5 min", price: 280, time: "08:45", initials: "DM" },
  { id: 2, name: "Sipho Dlamini", rating: 4.8, trips: 987, vehicle: "VW Polo", plate: "LIM 34-22 KP", eta: "8 min", price: 240, time: "09:00", initials: "SD" },
  { id: 3, name: "Thabo Nkosi", rating: 5.0, trips: 2103, vehicle: "Ford Fiesta", plate: "GP 91-07 MN", eta: "12 min", price: 310, time: "09:30", initials: "TN" },
];
const UPCOMING = [{ id: 1, from: "Tambisa", to: "Griyani", date: "27 May", time: "09:00", driver: "David Mokoena", price: 280 }];
const HISTORY = [
  { id: 1, from: "Polokwane", to: "Tambisa", date: "09 Mar", time: "10:00", price: 280 },
  { id: 2, from: "Gauteng", to: "Polokwane", date: "12 Jan", time: "07:30", price: 420 },
  { id: 3, from: "Limpopo", to: "Gauteng", date: "05 Dec", time: "06:00", price: 390 },
];
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

function MapView({ active }: { active: boolean }) {
  const mapRef = React.useRef<RNMap>(null);
  const [me, setMe] = useState<Pt | null>(null);
  const [drivers, setDrivers] = useState<(Pt & { id: number })[]>([]);

  // Live user location
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let first = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        ({ coords }) => {
          const p = { latitude: coords.latitude, longitude: coords.longitude };
          setMe(p);
          if (first) {
            first = false;
            mapRef.current?.animateToRegion({ ...p, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
          }
        }
      );
    })();
    return () => sub?.remove();
  }, []);

  // Nearby drivers (simulated: replace with your backend / websocket feed)
  useEffect(() => {
    if (!active || !me) { setDrivers([]); return; }
    const seed = [[0.012, -0.01], [-0.008, 0.014], [0.005, 0.02]];
    const make = (j: number) =>
      seed.map(([a, b], i) => ({
        id: i,
        latitude: me.latitude + a + (Math.random() - 0.5) * j,
        longitude: me.longitude + b + (Math.random() - 0.5) * j,
      }));
    setDrivers(make(0));
    const t = setInterval(() => setDrivers(make(0.004)), 3000);
    return () => clearInterval(t);
  }, [active, me?.latitude, me?.longitude]);

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
type UserT = { name: string; phone: string; email: string };
const AuthCtx = React.createContext<{
  user: UserT | null;
  setUser: (u: UserT | null) => void;
  openAuth: () => void;
}>({ user: null, setUser: () => { }, openAuth: () => { } });

const toUser = (u?: { email?: string; user_metadata?: any } | null): UserT | null =>
  u ? { name: u.user_metadata?.full_name || (u.email ?? "").split("@")[0], phone: u.user_metadata?.phone ?? "", email: u.email ?? "" } : null;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const Field = (p: React.ComponentProps<typeof TextInput> & { label: string }) => (
  <View style={{ marginBottom: 12 }}>
    <T style={[s.muted, { marginBottom: 6 }]}>{p.label}</T>
    <TextInput
      {...p}
      placeholderTextColor={C.muted}
      style={{ backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.fg, paddingHorizontal: 14, paddingVertical: 12 }}
    />
  </View>
);

// Sign in / create account window
function AuthModal({ visible, onClose, initialMode = "signin" }: { visible: boolean; onClose: () => void; initialMode?: "signin" | "signup" }) {
  const { setUser } = React.useContext(AuthCtx);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setMode(initialMode); setName(""); setPhone(""); setEmail(""); setPassword(""); setError(""); }
  }, [visible]);

  const submit = async () => {
    setError("");
    if (!email.includes("@") || password.length < 6) return setError("Enter a valid email and a password of 6+ characters");
    if (mode === "signup" && (!name.trim() || !phone.trim())) return setError("Please fill in all fields");
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) return setError(error.message);
      onClose();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: phone.trim() } },
      });
      setBusy(false);
      if (error) return setError(error.message);
      if (!data.session) Alert.alert("Check your email", "We sent you a link to confirm your account, then sign in.");
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={[s.card, { borderRadius: 24, padding: 24 }]}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
            <T style={{ fontWeight: "600", fontSize: 18 }}>{mode === "signin" ? "Sign in" : "Create account"}</T>
            <Pressable onPress={onClose}><X size={18} color={C.muted} /></Pressable>
          </View>
          {mode === "signup" && <Field label="Full name" value={name} onChangeText={setName} />}
          {mode === "signup" && <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
          <Pressable onPress={submit} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
            <T style={s.primaryTxt}>{busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}</T>
          </Pressable>
          <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ alignItems: "center", marginTop: 16 }}>
            <T style={{ color: C.primary }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</T>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Manage account page
function ManageAccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, setUser } = React.useContext(AuthCtx);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notif, setNotif] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (visible && user) {
      const [f, ...rest] = user.name.split(" ");
      setFirst(f ?? ""); setLast(rest.join(" ")); setPhone(user.phone); setEmail(user.email); setSaved(false);
    }
  }, [visible]);

  const edit = (setter: (t: string) => void) => (t: string) => { setter(t); setSaved(false); };
  const save = () => {
    if (!first.trim()) return Alert.alert("First name is required");
    if (!email.includes("@")) return Alert.alert("Enter a valid email");
    setUser({ name: `${first.trim()} ${last.trim()}`.trim(), phone: phone.trim(), email: email.trim() });
    setSaved(true);
  };
  const deleteAccount = () =>
    Alert.alert("Delete account?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { setUser(null); onClose(); } },
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
            <Field label="First name" value={first} onChangeText={edit(setFirst)} />
            <Field label="Last name" value={last} onChangeText={edit(setLast)} />
            <Field label="Phone number" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" />
            <Field label="Email (cannot be changed yet)" value={email} editable={false} />
            <Pressable onPress={save} style={[s.primaryBtn, { marginTop: 4 }]}>
              <T style={s.primaryTxt}>Save changes</T>
            </Pressable>
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

            <Pressable onPress={deleteAccount} style={[s.card, s.row, { marginTop: 24, borderColor: "rgba(239,68,68,0.3)" }]}>
              <Trash2 size={16} color={C.danger} />
              <T style={{ marginLeft: 12, color: C.danger, fontWeight: "500" }}>Delete account</T>
            </Pressable>
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
function HomeScreen({ onProfile }: { onProfile: () => void }) {
  const { user, openAuth } = React.useContext(AuthCtx);
  const [state, setState] = useState<"idle" | "searching" | "results">("idle");
  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState(false);
  const reset = () => { setBooked(false); setState("idle"); setSelected(null); setPickup(""); setDest(""); };

  if (booked && selected !== null) {
    const d = DRIVERS.find((x) => x.id === selected)!;
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <MapView active />
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
          <Pressable onPress={reset} style={s.dangerOutline}>
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
        <MapView active={state !== "idle"} />
        {state === "results" && (
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={[s.row, { justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 }]}>
              <T style={{ fontWeight: "600" }}>Available rides</T>
              <T style={s.muted} numberOfLines={1}>{pickup || "Your location"} → {dest}</T>
            </View>
            <ScrollView style={{ maxHeight: 288 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
              {DRIVERS.map((d) => {
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
                          <T style={[s.muted, { marginLeft: 4 }]}>{d.rating}</T>
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
            {selected !== null && (
              <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
                <Pressable
                  onPress={() =>
                    user
                      ? setBooked(true)
                      : Alert.alert("Sign in to book", "Create an account or log in to book your ride.", [
                        { text: "Not now", style: "cancel" },
                        { text: "Sign in", onPress: () => openAuth() },
                      ])
                  }
                  style={s.primaryBtn}
                >
                  <T style={s.primaryTxt}>Book ride — R{DRIVERS.find((d) => d.id === selected)?.price}</T>
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
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24 }}>
      <T mono style={[s.muted, { marginBottom: 4 }]}>Intercity</T>
      <T style={s.h2}>Services</T>
      <Pressable style={[s.row, s.bookTrip]}>
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
              <T style={[s.muted, { marginBottom: 12 }]}>Cities covered</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {p.desc.split(" · ").map((c) => <T key={c} style={s.chip}>{c}</T>)}
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




function ActivityScreen() {
  const [cancelId, setCancelId] = useState<number | null>(null);
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24 }}>
        <T mono style={[s.muted, { marginBottom: 4 }]}>Your trips</T>
        <T style={s.h2}>Activity</T>
        <Label>Upcoming rides</Label>
        {UPCOMING.map((r) => (
          <View key={r.id} style={[s.card, { marginBottom: 24 }]}>
            <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }]}>
              <View>
                <View style={[s.row, { marginBottom: 4 }]}>
                  <T style={{ fontWeight: "600" }}>{r.from}</T>
                  <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
                  <T style={{ fontWeight: "600" }}>{r.to}</T>
                </View>
                <T mono style={s.muted}>{r.date} · {r.time}</T>
              </View>
              <T style={s.booked}>Booked</T>
            </View>
            <View style={[s.row, s.cardFoot]}>
              <T style={s.muted}>{r.driver}</T>
              <Pressable onPress={() => setCancelId(r.id)} style={s.cancelPill}>
                <T style={{ fontSize: 12, color: C.danger }}>Cancel</T>
              </Pressable>
            </View>
          </View>
        ))}
        <Label>History</Label>
        {HISTORY.map((r) => (
          <View key={r.id} style={[s.card, { marginBottom: 12 }]}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
              <View style={s.row}>
                <CheckCircle size={14} color={C.primary} />
                <T style={{ fontWeight: "500", marginLeft: 8 }}>{r.from}</T>
                <ArrowRight size={12} color={C.muted} style={{ marginHorizontal: 6 }} />
                <T style={{ fontWeight: "500" }}>{r.to}</T>
              </View>
              <T mono style={{ fontWeight: "600", color: C.primary }}>R{r.price}</T>
            </View>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <T mono style={s.muted}>{r.date} · {r.time}</T>
              <Pressable style={s.row}>
                <RotateCcw size={11} color={C.primary} />
                <T style={{ fontSize: 12, color: C.primary, marginLeft: 4 }}>Rebook</T>
              </Pressable>
            </View>
          </View>
        ))}
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
              <Pressable onPress={() => setCancelId(null)} style={[s.modalBtn, { backgroundColor: C.danger }]}>
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
  const { user, setUser, openAuth } = React.useContext(AuthCtx);
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
          <Pressable key={label + i} onPress={() => { if (label === "Manage Account") { user ? setManageOpen(true) : openAuth(); } }} style={[s.row, s.menuItem, i === 2 && { marginTop: 16, borderTopWidth: 1, borderTopColor: C.border }]}>
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

  const showWelcome = !loading && !user && !guest;

  return (
    <AuthCtx.Provider value={{ user, setUser, openAuth: () => openAuth("signin") }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <StatusBar barStyle="light-content" />
        {loading ? null : showWelcome ? (
          <WelcomeScreen onLogin={() => openAuth("signin")} onSignup={() => openAuth("signup")} onGuest={() => setGuest(true)} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === "home" && <HomeScreen onProfile={() => setTab("account")} />}
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
