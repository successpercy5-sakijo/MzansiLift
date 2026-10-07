import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Eye, EyeOff,
  FileText,
  Heart,
  HelpCircle,
  Home,
  Info,
  Layers,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Moon,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Settings, Shield,
  Smartphone,
  Star,
  Sun,
  Trash2,
  User,
  X,
  Globe,
  type LucideIcon,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  useColorScheme,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import { supabase } from "../lib/supabase";

// ---------- Theme (dark + light) ----------
const DARK = {
  bg: "#0a0b14", card: "#12131f", secondary: "#1a1c2c", border: "#262a3d", track: "#262a3d",
  primary: "#2563eb", fg: "#f1f5f9", fg2: "rgba(241,245,249,0.8)", fgSoft: "rgba(241,245,249,0.4)",
  muted: "#566078", danger: "#ef4444", green: "#4ade80", amber: "#f59e0b",
};
const LIGHT: typeof DARK = {
  bg: "#f4f6fb", card: "#ffffff", secondary: "#eceff6", border: "#d9deea", track: "#cbd5e1",
  primary: "#2563eb", fg: "#0f172a", fg2: "rgba(15,23,42,0.8)", fgSoft: "rgba(15,23,42,0.4)",
  muted: "#64748b", danger: "#dc2626", green: "#16a34a", amber: "#b45309",
};
// C and s (the styles) are updated in place when the theme changes, then the whole app re-renders (see App).
const C = { ...DARK };
let THEME: "dark" | "light" = "dark";
function applyTheme(name: "dark" | "light") {
  if (name === THEME) return;
  THEME = name;
  Object.assign(C, name === "light" ? LIGHT : DARK);
  Object.assign(s, makeStyles());
}
const MONO = Platform.select({ ios: "Menlo", android: "monospace" });
const TOP = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

const T = ({ mono, style, ...p }: TextProps & { mono?: boolean }) => (
  <Text {...p} style={[{ color: C.fg, fontSize: 14 }, mono && { fontFamily: MONO }, style]} />
);
const Label = ({ children }: { children: string }) => (
  <T mono style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
    {children}
  </T>
);

// ---------- Contact details  ----------
const SUPPORT_EMAIL = "successpercy5@gmail.com";
const SUPPORT_PHONE = "+27837627597";
const SUPPORT_WHATSAPP = "+27837627597"; // no + sign
const SUPPORT_WEBSITE = "https://www.mzanzilift.co.za";

// ---------- App settings (saved on the phone) ----------
type AppSettings = { mode: "rider" | "driver"; showLocation: boolean; theme: "system" | "light" | "dark" };
const DEFAULT_SETTINGS: AppSettings = { mode: "rider", showLocation: true, theme: "dark" };
const SettingsCtx = React.createContext<{ settings: AppSettings; update: (p: Partial<AppSettings>) => void }>({
  settings: DEFAULT_SETTINGS,
  update: () => { },
});

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

// ---------- Map (free OpenStreetMap-based tiles) ----------
type Pt = { latitude: number; longitude: number };

// Rider's live GPS position (centres the map on you). Pass false to switch it off.
function useMyLocation(enabled = true) {
  const [me, setMe] = useState<Pt | null>(null);
  useEffect(() => {
    if (!enabled) { setMe(null); return; }
    let cancelled = false;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      const s2 = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        ({ coords }) => setMe({ latitude: coords.latitude, longitude: coords.longitude })
      );
      if (cancelled) s2.remove(); else sub = s2;
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled]);
  return me;
}

const MAP_HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<style>
  html,body,#map{height:100%;margin:0;background:#0a0b14}
  .leaflet-control-attribution{background:rgba(10,11,20,.7)!important;color:#566078!important;font-size:9px}
  .leaflet-control-attribution a{color:#566078!important}
  .me{width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.3)}
  .pin{width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 6px rgba(239,68,68,.3)}
  .drv{width:24px;height:24px;border-radius:50%;background:rgba(37,99,235,.25);display:flex;align-items:center;justify-content:center}
  .drv i{width:10px;height:10px;border-radius:50%;background:#3b82f6}
</style></head>
<body><div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
if (typeof L === 'undefined') {
  document.body.innerHTML = '<p style="color:#8b95b0;font:14px sans-serif;padding:24px">Map failed to load. Check your internet connection.</p>';
} else {
  var map = L.map('map', { zoomControl: false }).setView([-26.2041, 28.0473], 12);
  var KEY = '?key=cb1_4c90_1_2bdf15610a91e2313c7fba19';
  var layers = {
    dark: L.tileLayer('https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png' + KEY, { maxZoom: 19 }),
    light: L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png' + KEY, { maxZoom: 19 })
  };
  var current = 'dark';
  layers.dark.addTo(map);
  var meM = null, pinM = null, drvM = [], lastRecenter = 0;

  function post(o) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  map.on('click', function (e) { post({ type: 'pin', lat: e.latlng.lat, lng: e.latlng.lng }); });

  window.setState = function (d) {
    if (d.bg) { document.body.style.background = d.bg; document.getElementById('map').style.background = d.bg; }
    if (d.style && d.style !== current && layers[d.style]) {
      map.removeLayer(layers[current]); layers[d.style].addTo(map); current = d.style;
    }
    if (d.me) {
      var ll = [d.me.latitude, d.me.longitude];
      if (!meM) {
        meM = L.marker(ll, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
        map.setView(ll, 13);
      } else { meM.setLatLng(ll); }
    } else if (meM) { map.removeLayer(meM); meM = null; }
    if (d.recenter && d.recenter !== lastRecenter) {
      lastRecenter = d.recenter;
      if (meM) map.setView(meM.getLatLng(), 14);
    }
    if (d.pin) {
      var pl = [d.pin.latitude, d.pin.longitude];
      if (!pinM) {
        pinM = L.marker(pl, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
      } else { pinM.setLatLng(pl); }
    } else if (pinM) { map.removeLayer(pinM); pinM = null; }
    drvM.forEach(function (m) { map.removeLayer(m); });
    drvM = (d.drivers || []).map(function (p) {
      return L.marker([p.latitude, p.longitude], { icon: L.divIcon({ className: '', html: '<div class="drv"><i></i></div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);
    });
  };
}
</script></body></html>`;

function MapView({ me, drivers = [], pin = null, dark = true, recenterKey = 0, onPin }: {
  me: Pt | null; drivers?: (Pt & { id: string })[]; pin?: Pt | null; dark?: boolean; recenterKey?: number; onPin?: (p: Pt) => void;
}) {
  const webRef = React.useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Sends your position, the pin and the map style into the page whenever they change
  const payload = JSON.stringify({ me, drivers, pin, style: dark ? "dark" : "light", recenter: recenterKey, bg: C.bg });
  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(`window.setState && window.setState(${payload}); true;`);
  }, [ready, payload]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webRef}
        style={{ flex: 1, backgroundColor: C.bg }}
        originWhitelist={["*"]}
        source={{ html: MAP_HTML, baseUrl: "https://localhost" }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onLoadEnd={() => setReady(true)}
        onError={() => setFailed(true)}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === "pin") onPin?.({ latitude: m.lat, longitude: m.lng });
          } catch { }
        }}
      />
      {failed && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: C.bg }]}>
          <T style={s.muted}>Map unavailable. Check your internet connection.</T>
        </View>
      )}
    </View>
  );
}

// ---------- Trips: shared helpers ----------
const CITIES = PROVINCES.filter((p) => p.available).flatMap((p) => p.desc.split(" · ")).map((c) => c.trim());
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();
const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`);
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]} · ${two(d.getHours())}:${two(d.getMinutes())}`;
};
// Accepts 07:30, 7:30, 0730, 730, 19h30
const parseTime = (t: string) => {
  const m = t.trim().match(/^([01]?\d|2[0-3])[:h.]?([0-5]\d)$/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const clean = (t: string) => t.trim().replace(/[%_\\]/g, " ");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Gauteng and Limpopo are fully supported: every town in them
const SUPPORTED_PROVINCES = PROVINCES.filter((p) => p.available).map((p) => p.name);

type PinPlace = { name: string; province: string };
const tidyPlace = (n: string) => n.replace(/^City of /i, "").replace(/ (Metropolitan|Local|District) Municipality$/i, "").trim();

// Finds the town and province for a tapped spot (free OpenStreetMap lookup, no key needed)
async function lookupPlace(p: Pt): Promise<PinPlace | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&addressdetails=1&accept-language=en&lat=${p.latitude}&lon=${p.longitude}`,
    { headers: { "User-Agent": `MzansiLift/1.0 (${SUPPORT_EMAIL})` } }
  );
  if (!res.ok) throw new Error("lookup failed");
  const a = (await res.json()).address ?? {};
  const name = a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? a.county;
  return name && a.state ? { name: tidyPlace(String(name)), province: String(a.state) } : null;
}

// Finds a typed town on the map (free OpenStreetMap search). Only used the first time the server meets a new town.
const geoCache: Record<string, Pt> = {};
let lastGeo = 0;
async function geocodeTown(name: string): Promise<Pt | null> {
  const key = name.trim().toLowerCase();
  if (geoCache[key]) return geoCache[key];
  try {
    const wait = lastGeo + 1100 - Date.now(); // the free lookup allows about one request a second
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeo = Date.now();
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&accept-language=en&q=${encodeURIComponent(name.trim() + ", South Africa")}`,
      { headers: { "User-Agent": `MzansiLift/1.0 (${SUPPORT_EMAIL})` } }
    );
    if (!res.ok) return null;
    const hit = (await res.json())?.[0];
    if (!hit) return null;
    return (geoCache[key] = { latitude: Number(hit.lat), longitude: Number(hit.lon) });
  } catch { return null; }
}

// The server works the fare out from the distance. It already knows many towns; for a town it has never seen,
// we send that town's map position once and the server remembers it.
async function quoteFare(o: string, d: string): Promise<{ fare?: number; error?: string; o?: Pt | null; d?: Pt | null }> {
  const sent: { o: Pt | null; d: Pt | null } = { o: null, d: null };
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase.rpc("trip_fare", {
      p_origin: o, p_destination: d,
      p_o_lat: sent.o?.latitude ?? null, p_o_lng: sent.o?.longitude ?? null,
      p_d_lat: sent.d?.latitude ?? null, p_d_lng: sent.d?.longitude ?? null,
    });
    if (!error) return { fare: Number(data), ...sent };
    if (error.hint !== "unknown_town") return { error: error.message };
    const which = norm(error.details ?? "") === norm(o) ? "o" : "d";
    const town = which === "o" ? o : d;
    const pt = await geocodeTown(town);
    if (!pt) return { error: `We couldn't find "${town}" on the map. Check the spelling.` };
    sent[which] = pt;
  }
  return { error: "We couldn't work out a fare for this route. Try again." };
}

// Canonical spelling for the towns we list as shortcuts; anything else is kept as typed
const canon = (t: string) => CITIES.find((c) => c.toLowerCase() === t.trim().toLowerCase()) ?? t.trim();
const requestWhen = (r: { travel_date: string | null }) => {
  if (!r.travel_date) return "Any date";
  const [y, m, d] = r.travel_date.split("-").map(Number);
  return `${DAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
};

// Scrollable list of the next 30 days (plan ahead). allowAny adds an "Any date" chip for searching.
function DateChips({ value, onChange, allowAny }: { value: Date | null; onChange: (d: Date | null) => void; allowAny?: boolean }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {allowAny && (
        <Pressable onPress={() => onChange(null)} style={[s.dateChip, !value && s.dateChipOn]}>
          <T style={[s.dateTxt, !value && { color: "#fff" }]}>Any date</T>
        </Pressable>
      )}
      {days.map((d, i) => {
        const on = sameDay(value, d);
        return (
          <Pressable key={i} onPress={() => onChange(d)} style={[s.dateChip, on && s.dateChipOn]}>
            <T style={[s.dateTxt, on && { color: "#fff" }]}>{dayLabel(d, i)}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Tap-to-fill town suggestions (shortcuts only; any town can be typed)
function CityChips({ text, onPick }: { text: string; onPick: (c: string) => void }) {
  const q = text.trim().toLowerCase();
  const list = CITIES.filter((c) => c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q))).slice(0, 8);
  if (list.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
      {list.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)}><T style={s.chip}>{c}</T></Pressable>
      ))}
    </ScrollView>
  );
}

// One icon per seat: green = free, grey = taken
function SeatIcons({ total, left }: { total: number; left: number }) {
  return (
    <View style={[s.row, { gap: 6 }]}>
      {Array.from({ length: total }, (_, i) => {
        const free = i < left;
        return (
          <View key={i} style={[s.seatDot, free ? { borderColor: C.green, backgroundColor: "rgba(74,222,128,0.12)" } : { borderColor: C.border, backgroundColor: C.secondary }]}>
            <User size={14} color={free ? C.green : C.muted} />
          </View>
        );
      })}
    </View>
  );
}

function SeatsBadge({ left, total }: { left: number; total: number }) {
  const full = left <= 0;
  return (
    <T style={[s.booked, full
      ? { color: C.danger, backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.25)" }
      : { color: C.green, backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" }]}>
      {full ? "Full" : `${left} of ${total} seat${total === 1 ? "" : "s"} left`}
    </T>
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
  isDriver: boolean;
}>({ user: null, setUser: () => { }, openAuth: () => { }, openDriver: () => { }, startBooking: () => { }, isDriver: false });

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
              <Switch value={notif} onValueChange={setNotif} trackColor={{ false: C.track, true: C.primary }} thumbColor="#fff" />
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

// ---------- Settings (mode switch, map options) ----------
const SettingRow = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <View style={[s.card, s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
    <View style={{ flex: 1, paddingRight: 12 }}>
      <T style={{ fontWeight: "500" }}>{title}</T>
      {!!sub && <T style={[s.muted, { marginTop: 2, lineHeight: 17 }]}>{sub}</T>}
    </View>
    {children}
  </View>
);

function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDriver, openDriver } = React.useContext(AuthCtx);
  const { settings, update } = React.useContext(SettingsCtx);
  const track = { false: C.track, true: C.primary };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <View style={[s.row, { padding: 16 }]}>
          <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Settings</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Label>Appearance</Label>
          <View style={[s.row, { gap: 8, marginBottom: 8 }]}>
            {([["system", "System", Smartphone], ["light", "Light", Sun], ["dark", "Dark", Moon]] as const).map(([id, name, Icon]) => {
              const on = settings.theme === id;
              return (
                <Pressable key={id} onPress={() => update({ theme: id })} style={[s.dateChip, { flex: 1, alignItems: "center", paddingVertical: 12 }, on && s.dateChipOn]}>
                  <Icon size={18} color={on ? "#fff" : C.muted} />
                  <T style={[s.dateTxt, { marginTop: 6 }, on && { color: "#fff" }]}>{name}</T>
                </Pressable>
              );
            })}
          </View>
          <T style={[s.muted, { marginBottom: 24, lineHeight: 17 }]}>System follows your phone's setting. The map matches the theme.</T>

          <Label>Mode</Label>
          <SettingRow
            title="Driver mode"
            sub={isDriver
              ? "On: post trips and answer seat requests. Off: find and book rides. The other mode's tabs are switched off."
              : "Register as a driver to unlock this."}
          >
            <Switch
              value={isDriver && settings.mode === "driver"}
              onValueChange={(v) => update({ mode: v ? "driver" : "rider" })}
              disabled={!isDriver}
              trackColor={track}
              thumbColor="#fff"
            />
          </SettingRow>
          {!isDriver && (
            <Pressable onPress={() => { onClose(); openDriver(); }} style={[s.primaryBtn, { marginBottom: 12 }]}>
              <T style={s.primaryTxt}>Become a driver</T>
            </Pressable>
          )}

          <View style={{ height: 16 }} />
          <Label>Map</Label>
          <SettingRow title="Show my location" sub="Shows where you are on the map. Your location is only used while the app is open.">
            <Switch value={settings.showLocation} onValueChange={(v) => update({ showLocation: v })} trackColor={track} thumbColor="#fff" />
          </SettingRow>

          <View style={{ height: 16 }} />
          <Label>Phone</Label>
          <Pressable onPress={() => Linking.openSettings()} style={[s.card, s.row]}>
            <Settings size={16} color={C.muted} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <T style={{ fontWeight: "500" }}>App permissions</T>
              <T style={[s.muted, { marginTop: 2 }]}>Change location access in your phone's settings</T>
            </View>
            <ChevronRight size={15} color={C.muted} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Safety, Help, Legal, Contact us, About us ----------
const Head = ({ children }: { children: string }) => (
  <T style={{ fontWeight: "600", fontSize: 15, marginTop: 8, marginBottom: 8 }}>{children}</T>
);
const Para = ({ children }: { children: React.ReactNode }) => (
  <T style={{ color: C.fg2, lineHeight: 21, marginBottom: 12 }}>{children}</T>
);
const Bullets = ({ items }: { items: string[] }) => (
  <View style={{ marginBottom: 12 }}>
    {items.map((t) => (
      <View key={t} style={{ flexDirection: "row", marginBottom: 8 }}>
        <T style={{ color: C.primary, marginRight: 8 }}>•</T>
        <T style={{ flex: 1, color: C.fg2, lineHeight: 21 }}>{t}</T>
      </View>
    ))}
  </View>
);
const ActionRow = ({ icon: Icon, label, sub, onPress }: { icon: LucideIcon; label: string; sub?: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[s.card, s.row, { marginBottom: 12 }]}>
    <Icon size={16} color={C.primary} />
    <View style={{ flex: 1, marginLeft: 12 }}>
      <T style={{ fontWeight: "500" }}>{label}</T>
      {!!sub && <T style={s.muted}>{sub}</T>}
    </View>
    <ChevronRight size={15} color={C.muted} />
  </Pressable>
);

const FAQ = [
  { q: "How do I find a ride?", a: "On Home, tap \"Where are you going?\", type a town or tap the map to drop a pin, then pick a trip a driver has posted." },
  { q: "What happens after I request a seat?", a: "The driver confirms your request. You can follow it in Activity. Once the driver accepts, their phone number appears there." },
  { q: "What if no rides are posted for my route?", a: "Tap \"Request this trip\". Drivers can see what riders are asking for and may post a trip. You can also change your date or town." },
  { q: "How is the fare worked out?", a: "MzansiLift works out the fare per seat from the distance between the two towns. You see it before you request a seat, and drivers can't change it." },
  { q: "Can I cancel a booking?", a: "Yes. Open Activity, find your upcoming ride and tap Cancel. Your seat is released for other riders." },
  { q: "How do I become a driver?", a: "Go to Account, then Be a driver, and fill in your vehicle details. Then use Settings to switch to Driver mode and post your trips." },
  { q: "Which towns are covered?", a: "Every town in Gauteng and Limpopo. Type any town name, or tap the map to drop a pin." },
];

function InfoModal({ kind, onClose }: { kind: string | null; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setOpen(null); }, [kind]);
  const call = (n: string) => Linking.openURL(`tel:${n.replace(/\s/g, "")}`);

  let body: React.ReactNode = null;
  if (kind === "Safety") body = (
    <>
      <Para>Your safety comes first, whether you're riding or driving.</Para>
      <Head>Before you travel</Head>
      <Bullets items={[
        "Check that the driver's name, vehicle and number plate match what the app shows before you get in.",
        "Share your trip details (route, time, driver and plate) with someone you trust.",
        "Wait for the driver to confirm your seat. Their phone number appears once they accept.",
      ]} />
      <Head>During the trip</Head>
      <Bullets items={[
        "Wear your seatbelt.",
        "If something feels wrong, ask to be dropped at a busy, well-lit place.",
        "Don't travel with a driver who seems tired or unwell, or who is driving unsafely.",
      ]} />
      <Head>For drivers</Head>
      <Bullets items={[
        "Only carry riders whose seats you have confirmed, and never more than your car's seats.",
        "Keep your vehicle roadworthy and licensed.",
        "Take rest breaks on long trips and don't drive tired.",
      ]} />
      <Head>Emergency numbers</Head>
      <ActionRow icon={Phone} label="Police" sub="10111" onPress={() => call("10111")} />
      <ActionRow icon={Phone} label="Emergency from a cellphone" sub="112" onPress={() => call("112")} />
      <ActionRow icon={Phone} label="GBV Command Centre (free, 24 hours)" sub="0800 428 428" onPress={() => call("0800428428")} />
    </>
  );
  if (kind === "Help") body = (
    <>
      <Para>Answers to common questions. Tap a question to open it.</Para>
      {FAQ.map((f, i) => (
        <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)} style={[s.card, { marginBottom: 10 }]}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <T style={{ fontWeight: "500", flex: 1, paddingRight: 8 }}>{f.q}</T>
            <View style={{ transform: [{ rotate: open === i ? "180deg" : "0deg" }] }}><ChevronDown size={15} color={C.muted} /></View>
          </View>
          {open === i && <T style={{ color: C.fg2, lineHeight: 21, marginTop: 10 }}>{f.a}</T>}
        </Pressable>
      ))}
      <Head>Still need help?</Head>
      <Para>Open Contact us from your Account page and we'll get back to you.</Para>
    </>
  );
  if (kind === "Legal") body = (
    <>
      <Para>Last updated: October 2026</Para>
      <Head>Terms of use (summary)</Head>
      <Bullets items={[
        "MzansiLift helps riders and drivers travelling between towns find each other and share a trip. Drivers are independent and are responsible for their vehicles and driving.",
        "Give correct information, treat others with respect, and follow South African law and the rules of the road.",
        "The fare per seat is set by MzansiLift and shown before you request a seat. A driver confirms each request.",
        "Riders can cancel upcoming bookings in Activity. Drivers can cancel trips they posted. We may suspend accounts that put others at risk or break these rules.",
      ]} />
      <Head>Privacy (summary)</Head>
      <Bullets items={[
        "We collect your name, email and phone number, your trip activity and, if you allow it, your location while the app is open.",
        "We use this to run the service: showing you on the map, matching riders and drivers, and sending verification codes.",
        "Spots you pin on the map are sent to OpenStreetMap to find the town.",
        "Drivers see a rider's name, and their phone number once the seat is accepted. Riders see the driver's name, vehicle and plate, and their phone number once accepted.",
        "We don't sell your personal information.",
        "You can edit your details or delete your account in Account, then Manage Account. Deleting removes your account, trips and driver profile.",
      ]} />
      <Para>Questions about your information? Email {SUPPORT_EMAIL}.</Para>
    </>
  );
  if (kind === "Contact us") body = (
    <>
      <Para>We're here to help with bookings, driver questions and safety concerns.</Para>
      <ActionRow icon={Mail} label="Email us" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=MzansiLift%20support`)} />
      <ActionRow icon={Phone} label="Call us" sub={SUPPORT_PHONE} onPress={() => call(SUPPORT_PHONE)} />
      <ActionRow icon={MessageCircle} label="WhatsApp" sub="Message us" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)} />
      <ActionRow
        icon={Globe}
        label="Visit our website"
        sub="www.mzansilift.co.za"
        onPress={() =>
          Linking.openURL(SUPPORT_WEBSITE).catch(() => Alert.alert("Could not open website", "Please check your internet connection and try again."))
        }
      />
      <Para>In an emergency, call 10111 or 112 first.</Para>
    </>
  );
  if (kind === "About us") body = (
    <>
      <Para>MzansiLift connects people travelling between South African towns with drivers who have seats to share, so long trips are easier and cheaper.</Para>
      <Para>Drivers post their trips ahead of time. Riders pick a driver going their way, request a seat and travel together. We set the fare per seat so it's the same for everyone.</Para>
      <Para>We're starting in Gauteng and Limpopo and growing across the country.</Para>
      <T mono style={[s.muted, { marginTop: 8 }]}>MzansiLift v1.0.0 · South Africa</T>
    </>
  );

  return (
    <Modal visible={!!kind} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <View style={[s.row, { padding: 16 }]}>
          <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>{kind}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>{body}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Driver side ----------
type DriverProfile = { id: string; full_name: string; phone: string; vehicle: string; plate: string; car_seats: number; rating: number; trips: number };
type TripBooking = { id: string; rider_name: string; rider_phone: string | null; seats: number; status: "pending" | "accepted" | "declined" | "cancelled" };
type MyTrip = {
  id: string; origin: string; destination: string; depart_at: string; price: number | null; seats_total: number;
  notes: string | null; status: "open" | "cancelled" | "completed"; bookings: TripBooking[];
};
type TripRequest = { id: string; origin: string | null; destination: string; travel_date: string | null; seats: number; rider_name: string | null };
const takenSeats = (t: MyTrip) => t.bookings.filter((b) => b.status === "accepted").reduce((n, b) => n + b.seats, 0);
const DRIVER_COLS = "id, full_name, phone, vehicle, plate, car_seats, rating, trips";

// Town input: type any town, or tap a shortcut
function TownInput({ label, value, onChange, exclude }: { label: string; value: string; onChange: (c: string) => void; exclude?: string }) {
  const ex = (exclude ?? "").trim().toLowerCase();
  return (
    <View style={{ marginBottom: 8 }}>
      <Field label={label} value={value} onChangeText={onChange} placeholder="Type any town, or tap one below" autoCapitalize="words" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {CITIES.filter((c) => c.toLowerCase() !== ex).map((c) => (
          <Pressable key={c} onPress={() => onChange(c)} style={[s.dateChip, value.trim() === c && s.dateChipOn]}>
            <T style={[s.dateTxt, value.trim() === c && { color: "#fff" }]}>{c}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Become a driver / edit your details (opened from Account). There is no price here: MzansiLift sets every fare.
function DriverProfileModal({ visible, onClose, onRegistered }: { visible: boolean; onClose: () => void; onRegistered: () => void }) {
  const { user } = React.useContext(AuthCtx);
  const [row, setRow] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [carSeats, setCarSeats] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const fill = (r: DriverProfile | null) => {
    setName(r?.full_name ?? user?.name ?? "");
    setPhone(r?.phone ?? user?.phone ?? "");
    setVehicle(r?.vehicle ?? ""); setPlate(r?.plate ?? ""); setCarSeats(r?.car_seats ?? 3);
  };

  const load = async () => {
    setLoading(true); setError(""); setSaved(false);
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data, error } = await supabase.from("drivers").select(DRIVER_COLS).eq("id", auth.user.id).maybeSingle();
      if (error) setError(error.message);
      setRow(data as DriverProfile | null);
      fill(data as DriverProfile | null);
    }
    setLoading(false);
  };
  useEffect(() => { if (visible && user) load(); }, [visible]);

  const edit = (setter: (t: string) => void) => (t: string) => { setter(t); setSaved(false); };

  const validate = () => {
    if (!name.trim() || !phone.trim() || !vehicle.trim() || !plate.trim()) {
      setError("Please fill in every field.");
      return null;
    }
    return { full_name: name.trim(), phone: phone.trim(), vehicle: vehicle.trim(), plate: plate.trim().toUpperCase(), car_seats: carSeats };
  };

  const register = async () => {
    setError("");
    const v = validate();
    const { data: auth } = await supabase.auth.getUser();
    if (!v || !auth.user) return;
    setBusy(true);
    const { error } = await supabase.from("drivers").insert({ id: auth.user.id, ...v });
    setBusy(false);
    if (error) return setError(error.message);
    onClose();
    onRegistered();
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

  const form = (
    <>
      <Field label="Full name" value={name} onChangeText={edit(setName)} />
      <Field label="Phone number (riders see it once you accept them)" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" />
      <Field label="Vehicle (e.g. Toyota Corolla)" value={vehicle} onChangeText={edit(setVehicle)} />
      <Field label="Number plate" value={plate} onChangeText={edit(setPlate)} autoCapitalize="characters" />
      <T style={[s.muted, { marginBottom: 8 }]}>Passenger seats in your car (max 3)</T>
      <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
        {[1, 2, 3].map((n) => (
          <Pressable key={n} onPress={() => { setCarSeats(n); setSaved(false); }} style={[s.dateChip, carSeats === n && s.dateChipOn]}>
            <T style={[s.dateTxt, carSeats === n && { color: "#fff" }]}>{plural(n, "seat")}</T>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>{row ? "Driver profile" : "Be a driver"}</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <T style={s.muted}>Loading...</T>
            ) : !row ? (
              <>
                <T style={[s.muted, { fontSize: 14, marginBottom: 20, lineHeight: 20 }]}>
                  Share long-distance trips and fill the seats in your car. You choose where you're going and how many seats to offer.
                  MzansiLift sets the fare for every trip, so you don't set a price.
                </T>
                {form}
                {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
                <Pressable onPress={register} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
                  <T style={s.primaryTxt}>{busy ? "Please wait..." : "Become a driver"}</T>
                </Pressable>
              </>
            ) : (
              <>
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

// The Drive tab. Only drivers in driver mode see it. Post trips, then accept or decline the riders who ask for seats.
function DriverScreen({ onEditProfile, refreshKey }: { onEditProfile: () => void; refreshKey: number }) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [trips, setTrips] = useState<MyTrip[]>([]);
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "post">("home");

  // "Post a trip" form
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState("");
  const [seats, setSeats] = useState(1);
  const [notes, setNotes] = useState("");
  const [fare, setFare] = useState<number | null>(null);
  const [fareBusy, setFareBusy] = useState(false);
  const [fareErr, setFareErr] = useState("");
  const [quote, setQuote] = useState<{ o: Pt | null; d: Pt | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id;
    if (!id) return;
    const [p, t, r] = await Promise.all([
      supabase.from("drivers").select(DRIVER_COLS).eq("id", id).maybeSingle(),
      supabase.from("trips").select("*, bookings(*)").eq("driver_id", id).order("depart_at", { ascending: true }),
      supabase.from("trip_requests").select("id, origin, destination, travel_date, seats, rider_name")
        .eq("status", "open").neq("rider_id", id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (p.error) return setError(p.error.message);
    if (t.error) return setError(t.error.message);
    setError("");
    setProfile(p.data as DriverProfile | null);
    setTrips((t.data ?? []) as MyTrip[]);
    if (!r.error) setRequests((r.data ?? []) as TripRequest[]); // stays empty until the trip_requests table exists
  };

  // Loads when the tab opens, then every 10s so new seat requests appear on their own
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [refreshKey]);

  // The fare is worked out from the distance between the two towns. The driver only sees it.
  useEffect(() => {
    setFare(null); setFareErr(""); setQuote(null); setFareBusy(false);
    const o = canon(origin), d = canon(destination);
    if (!o || !d || o.toLowerCase() === d.toLowerCase()) return;
    let off = false;
    const timer = setTimeout(async () => {
      setFareBusy(true);
      const r = await quoteFare(o, d);
      if (off) return;
      setFareBusy(false);
      if (r.error) setFareErr(r.error);
      else { setFare(r.fare ?? null); setQuote({ o: r.o ?? null, d: r.d ?? null }); }
    }, 600);
    return () => { off = true; clearTimeout(timer); };
  }, [origin, destination]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openPost = (req?: TripRequest) => {
    setOrigin(req?.origin ?? ""); setDestination(req?.destination ?? "");
    let d: Date | null = null;
    if (req?.travel_date) {
      const [y, m, dd] = req.travel_date.split("-").map(Number);
      const x = new Date(y, m - 1, dd);
      if (x.getTime() >= new Date().setHours(0, 0, 0, 0)) d = x;
    }
    setDay(d); setTime(""); setNotes(""); setFormError("");
    setSeats(profile?.car_seats ?? 1);
    setView("post");
  };

  const postTrip = async () => {
    setFormError("");
    const o = canon(origin), d = canon(destination);
    const t = parseTime(time);
    if (!o || !d) return setFormError("Enter where you're leaving from and where you're going.");
    if (o.toLowerCase() === d.toLowerCase()) return setFormError("Leaving from and going to must be different towns.");
    if (!day) return setFormError("Choose the travel date.");
    if (!t) return setFormError("Enter a departure time like 07:30.");
    if (fare === null) return setFormError(fareErr || "Working out the fare. Try again in a moment.");
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.h, t.m);
    if (when.getTime() <= Date.now()) return setFormError("The departure must be in the future.");
    setBusy(true);
    const { error } = await supabase.rpc("post_trip", {
      p_origin: o,
      p_destination: d,
      p_depart_at: when.toISOString(),
      p_seats: seats,
      p_notes: notes.trim() || null,
      p_o_lat: quote?.o?.latitude ?? null, p_o_lng: quote?.o?.longitude ?? null,
      p_d_lat: quote?.d?.latitude ?? null, p_d_lng: quote?.d?.longitude ?? null,
    });
    setBusy(false);
    if (error) return setFormError(error.message);
    await load();
    setView("home");
  };

  const respond = async (bookingId: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_booking", { p_booking: bookingId, p_accept: accept });
    if (error) Alert.alert("Could not update", error.message);
    await load();
  };

  const cancelTrip = (t: MyTrip) =>
    Alert.alert("Cancel this trip?", "Riders who asked for or booked a seat will see that it was cancelled.", [
      { text: "Keep trip", style: "cancel" },
      {
        text: "Cancel trip", style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("cancel_trip", { p_trip: t.id });
          if (error) Alert.alert("Could not cancel", error.message);
          await load();
        },
      },
    ]);

  const completeTrip = async (t: MyTrip) => {
    const { error } = await supabase.rpc("complete_trip", { p_trip: t.id });
    if (error) Alert.alert("Could not update", error.message);
    await load();
  };

  const openTrips = trips.filter((t) => t.status === "open");
  const pastTrips = trips.filter((t) => t.status !== "open").reverse().slice(0, 10);
  const pending = openTrips.reduce((n, t) => n + t.bookings.filter((b) => b.status === "pending").length, 0);

  // ----- Post a trip -----
  if (view === "post") {
    const maxSeats = profile?.car_seats ?? 1;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[s.row, { padding: 16 }]}>
          <Pressable onPress={() => setView("home")} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Post a trip</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TownInput label="Leaving from" value={origin} onChange={setOrigin} exclude={destination} />
          <TownInput label="Going to" value={destination} onChange={setDestination} exclude={origin} />

          <Label>When</Label>
          <DateChips value={day} onChange={setDay} />
          <View style={{ height: 12 }} />
          <Field label="Departure time (24h, e.g. 07:30)" value={time} onChangeText={setTime} placeholder="07:30" keyboardType="numbers-and-punctuation" />

          <T style={[s.muted, { marginBottom: 8 }]}>Seats you're offering (your car takes up to {maxSeats})</T>
          <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
            {Array.from({ length: maxSeats }, (_, i) => i + 1).map((n) => (
              <Pressable key={n} onPress={() => setSeats(n)} style={[s.dateChip, seats === n && s.dateChipOn]}>
                <T style={[s.dateTxt, seats === n && { color: "#fff" }]}>{plural(n, "seat")}</T>
              </Pressable>
            ))}
          </View>

          <View style={[s.card, { marginBottom: 16 }]}>
            <T style={s.muted}>Fare per seat</T>
            {fare !== null ? (
              <T mono style={{ fontWeight: "600", fontSize: 24, color: C.primary, marginTop: 4 }}>R{fare}</T>
            ) : fareBusy ? (
              <T style={[s.muted, { fontSize: 13, marginTop: 4 }]}>Working out the fare...</T>
            ) : fareErr ? (
              <T style={{ color: C.danger, fontSize: 13, marginTop: 4 }}>{fareErr}</T>
            ) : (
              <T style={[s.muted, { fontSize: 13, marginTop: 4 }]}>Enter where you're leaving from and going to.</T>
            )}
            <T style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>Worked out from the distance between the two towns. Drivers can't change it.</T>
          </View>

          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Luggage space, pickup spots, stops..." />
          {!!formError && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{formError}</T>}
          <Pressable onPress={postTrip} disabled={busy || fare === null} style={[s.primaryBtn, (busy || fare === null) && { opacity: 0.5 }]}>
            <T style={s.primaryTxt}>{busy ? "Posting..." : "Post trip"}</T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ----- Dashboard -----
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}
    >
      <T mono style={[s.muted, { marginBottom: 4 }]}>Driver</T>
      <T style={s.h2}>Your trips</T>

      {loading && !profile ? (
        <T style={s.muted}>Loading...</T>
      ) : !profile ? (
        <T style={s.muted}>{error || "We couldn't find your driver profile. Open Account → Be a driver."}</T>
      ) : (
        <>
          <View style={[s.card, { marginBottom: 16 }]}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <T style={{ fontWeight: "600" }} numberOfLines={1}>{profile.vehicle}</T>
                <T mono style={[s.muted, { marginTop: 2 }]}>{profile.plate} · {plural(profile.car_seats, "seat")}</T>
              </View>
              <Pressable onPress={onEditProfile} style={[s.cancelPill, { borderColor: C.border }]}>
                <T style={{ fontSize: 12, color: C.muted }}>Edit</T>
              </Pressable>
            </View>
            <View style={s.statsRow}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <T style={s.muted}>Rating</T>
                <T mono style={{ fontWeight: "600", color: C.primary }}>{profile.trips === 0 ? "New" : Number(profile.rating).toFixed(1)}</T>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <T style={s.muted}>Trips done</T>
                <T mono style={{ fontWeight: "600" }}>{profile.trips}</T>
              </View>
            </View>
          </View>

          {pending > 0 && (
            <View style={[s.row, s.notice, { marginTop: 0, marginBottom: 16, borderColor: "rgba(245,158,11,0.35)" }]}>
              <AlertCircle size={16} color={C.amber} />
              <T style={{ flex: 1, marginLeft: 12 }}>{plural(pending, "rider")} waiting for your answer</T>
            </View>
          )}
          {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}

          <Pressable onPress={() => openPost()} style={[s.primaryBtn, { flexDirection: "row", marginBottom: 24 }]}>
            <Plus size={16} color="#fff" />
            <T style={[s.primaryTxt, { marginLeft: 8 }]}>Post a trip</T>
          </Pressable>

          {requests.length > 0 && (
            <>
              <Label>Riders are asking for</Label>
              {requests.map((r) => (
                <View key={r.id} style={[s.card, s.row, { marginBottom: 8, justifyContent: "space-between" }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <T style={{ fontWeight: "500" }} numberOfLines={1}>{r.origin || "Anywhere"} → {r.destination}</T>
                    <T style={s.muted}>{requestWhen(r)} · {plural(r.seats, "seat")}</T>
                  </View>
                  <Pressable onPress={() => openPost(r)} style={[s.cancelPill, { borderColor: "rgba(37,99,235,0.4)" }]}>
                    <T style={{ fontSize: 12, color: C.primary }}>Post trip</T>
                  </Pressable>
                </View>
              ))}
              <View style={{ height: 16 }} />
            </>
          )}

          <Label>Upcoming trips</Label>
          {openTrips.length === 0 && (
            <T style={[s.muted, { fontSize: 13, lineHeight: 19, marginBottom: 24 }]}>
              No trips yet. Post where you're going and riders can ask for a seat.
            </T>
          )}
          {openTrips.map((t) => {
            const left = t.seats_total - takenSeats(t);
            const reqs = t.bookings
              .filter((b) => b.status === "pending" || b.status === "accepted")
              .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
            return (
              <View key={t.id} style={[s.card, { marginBottom: 16 }]}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 6 }]}>
                  <View style={[s.row, { flex: 1, paddingRight: 8 }]}>
                    <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{t.origin}</T>
                    <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
                    <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{t.destination}</T>
                  </View>
                  {t.price == null
                    ? <T style={[s.booked, pillStyle("Waiting for driver")]}>Fare pending</T>
                    : <T mono style={{ fontWeight: "600", color: C.primary }}>R{t.price}</T>}
                </View>
                <T mono style={[s.muted, { marginBottom: 12 }]}>{fmtWhen(t.depart_at)}{t.price == null ? " · riders can book once the fare is set" : " · per seat"}</T>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <SeatIcons total={t.seats_total} left={left} />
                  <SeatsBadge left={left} total={t.seats_total} />
                </View>

                {reqs.map((b) => {
                  const fits = b.seats <= left;
                  return (
                    <View key={b.id} style={s.reqRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <T style={{ fontWeight: "500" }} numberOfLines={1}>{b.rider_name}</T>
                        <T style={s.muted}>
                          {plural(b.seats, "seat")}{b.status === "accepted" && b.rider_phone ? ` · ${b.rider_phone}` : ""}
                        </T>
                      </View>
                      {b.status === "pending" ? (
                        <View style={[s.row, { gap: 8 }]}>
                          <Pressable onPress={() => respond(b.id, false)} style={s.cancelPill}>
                            <T style={{ fontSize: 12, color: C.danger }}>Decline</T>
                          </Pressable>
                          <Pressable
                            onPress={() => respond(b.id, true)}
                            disabled={!fits}
                            style={[s.cancelPill, { borderColor: "rgba(74,222,128,0.3)" }, !fits && { opacity: 0.35 }]}
                          >
                            <T style={{ fontSize: 12, color: C.green }}>{fits ? "Accept" : "No room"}</T>
                          </Pressable>
                        </View>
                      ) : (
                        <T style={[s.booked, { color: C.green, backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" }]}>Confirmed</T>
                      )}
                    </View>
                  );
                })}

                <View style={[s.row, s.cardFoot, { marginTop: 12 }]}>
                  <Pressable onPress={() => completeTrip(t)} style={[s.cancelPill, { borderColor: "rgba(74,222,128,0.3)" }]}>
                    <T style={{ fontSize: 12, color: C.green }}>Mark completed</T>
                  </Pressable>
                  <Pressable onPress={() => cancelTrip(t)} style={s.cancelPill}>
                    <T style={{ fontSize: 12, color: C.danger }}>Cancel trip</T>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {pastTrips.length > 0 && (
            <>
              <Label>Past trips</Label>
              {pastTrips.map((t) => (
                <View key={t.id} style={[s.card, { marginBottom: 8, paddingVertical: 12 }]}>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <T style={{ flex: 1, paddingRight: 8 }} numberOfLines={1}>{t.origin} → {t.destination}</T>
                    <T style={s.muted}>{t.status === "completed" ? "Completed" : "Cancelled"}</T>
                  </View>
                  <T mono style={[s.muted, { marginTop: 2 }]}>{fmtWhen(t.depart_at)}</T>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ---------- Welcome screen (shown first) ----------
function WelcomeScreen({ onLogin, onSignup, onGuest }: { onLogin: () => void; onSignup: () => void; onGuest: () => void }) {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Image
          source={require("../../assets/mzansilift-logo.png")}
          style={{ width: 150, height: 150 }}
          resizeMode="contain"
        />

        <T style={[s.muted, { fontSize: 14, marginTop: 8 }]}> rides, door to door</T>
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

// A trip a driver has posted (from the `open_trips` view)
type OpenTrip = {
  id: string; driver_id: string; driver_name: string; vehicle: string; plate: string;
  rating: number; driver_trips: number; origin: string; destination: string;
  depart_at: string; price: number; seats_total: number; seats_left: number; notes: string | null;
};

// Finds posted trips that match the rider's route (and date, if chosen). Refreshes every 10s so seats stay current.
function useTripSearch(active: boolean, from: string, to: string, day: Date | null, myId?: string) {
  const [trips, setTrips] = useState<OpenTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const key = `${from}|${to}|${day ? day.getTime() : ""}|${myId ?? ""}`;

  useEffect(() => {
    if (!active) { setTrips([]); setErr(""); return; }
    let cancelled = false;
    const load = async () => {
      let q = supabase.from("open_trips").select("*").not("price", "is", null); // trips wait for a fare before riders see them
      const f = clean(from), t = clean(to);
      if (t) q = q.ilike("destination", `%${t}%`);
      if (f) q = q.ilike("origin", `%${f}%`);
      if (day) q = q.gte("depart_at", day.toISOString()).lt("depart_at", addDays(day, 1).toISOString());
      if (myId) q = q.neq("driver_id", myId); // don't list your own trips to yourself
      const { data, error } = await q.order("depart_at", { ascending: true }).limit(50);
      if (cancelled) return;
      if (error) { setErr(error.message); return; }
      setErr("");
      const rows = ((data ?? []) as OpenTrip[]).map((r) => ({
        ...r,
        price: Number(r.price), rating: Number(r.rating), seats_total: Number(r.seats_total),
        seats_left: Number(r.seats_left), driver_trips: Number(r.driver_trips),
      }));
      // Trips with free seats first, then by departure time
      rows.sort((a, b) => (b.seats_left > 0 ? 1 : 0) - (a.seats_left > 0 ? 1 : 0) || new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
      setTrips(rows);
    };
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active, key]);

  return { trips, loading, err };
}

// Trip details + "request seats" sheet
function TripModal({ trip, onClose, onRequested }: { trip: OpenTrip | null; onClose: () => void; onRequested: () => void }) {
  const { user, openAuth } = React.useContext(AuthCtx);
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const left = trip?.seats_left ?? 0;

  useEffect(() => { setSeats(1); setError(""); }, [trip?.id]);
  useEffect(() => { if (seats > left) setSeats(Math.max(1, left)); }, [left]);

  const request = async () => {
    if (!trip) return;
    if (!user) {
      Alert.alert("Sign in to book", "Create an account or log in to request a seat.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => { onClose(); openAuth(); } },
      ]);
      return;
    }
    setBusy(true); setError("");
    const { error } = await supabase.rpc("request_seat", { p_trip: trip.id, p_seats: seats });
    setBusy(false);
    if (error) return setError(error.message);
    onRequested();
  };

  return (
    <Modal visible={!!trip} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        {trip && (
          <View style={[s.card, { borderRadius: 24, padding: 24 }]}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
              <T style={{ fontWeight: "600", fontSize: 18 }}>Trip details</T>
              <Pressable onPress={onClose}><X size={18} color={C.muted} /></Pressable>
            </View>

            <View style={[s.row, { marginBottom: 16 }]}>
              <View style={s.avatar}><T style={s.avatarTxt}>{initialsOf(trip.driver_name)}</T></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <T style={{ fontWeight: "500" }} numberOfLines={1}>{trip.driver_name}</T>
                <View style={[s.row, { marginTop: 2 }]}>
                  <Star size={10} color={C.primary} fill={C.primary} />
                  <T style={[s.muted, { marginLeft: 4 }]}>{trip.driver_trips === 0 ? "New driver" : `${trip.rating.toFixed(1)} · ${plural(trip.driver_trips, "trip")}`}</T>
                </View>
              </View>
              <T mono style={[s.muted, s.plate]}>{trip.plate}</T>
            </View>

            <View style={[s.row, { marginBottom: 4 }]}>
              <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{trip.origin}</T>
              <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
              <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{trip.destination}</T>
            </View>
            <T mono style={s.muted}>{fmtWhen(trip.depart_at)} · {trip.vehicle}</T>
            {!!trip.notes && <T style={[s.muted, { fontSize: 13, marginTop: 10, lineHeight: 18 }]}>{trip.notes}</T>}

            <View style={[s.row, s.cardFoot, { marginTop: 16 }]}>
              <View>
                <T style={[s.muted, { marginBottom: 8 }]}>Seats</T>
                <SeatIcons total={trip.seats_total} left={left} />
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <T mono style={{ fontWeight: "600", fontSize: 18, color: C.primary }}>R{trip.price}</T>
                <T style={s.muted}>per seat</T>
              </View>
            </View>
            <View style={{ alignItems: "flex-start", marginTop: 12 }}><SeatsBadge left={left} total={trip.seats_total} /></View>

            {left > 0 && (
              <View style={[s.row, { justifyContent: "space-between", marginTop: 16 }]}>
                <T style={{ fontWeight: "500" }}>Seats to book</T>
                <View style={[s.row, { gap: 16 }]}>
                  <Pressable onPress={() => setSeats(Math.max(1, seats - 1))} style={s.roundBtn}><Minus size={14} color={C.fg} /></Pressable>
                  <T mono style={{ fontWeight: "600", minWidth: 16, textAlign: "center" }}>{seats}</T>
                  <Pressable onPress={() => setSeats(Math.min(left, seats + 1))} style={s.roundBtn}><Plus size={14} color={C.fg} /></Pressable>
                </View>
              </View>
            )}

            {!!error && <T style={{ color: C.danger, fontSize: 12, marginTop: 12 }}>{error}</T>}
            <Pressable onPress={request} disabled={busy || left <= 0} style={[s.primaryBtn, { marginTop: 16 }, (busy || left <= 0) && { opacity: 0.5 }]}>
              <T style={s.primaryTxt}>
                {left <= 0 ? "This trip is full" : busy ? "Sending..." : `Request ${plural(seats, "seat")} — R${trip.price * seats}`}
              </T>
            </Pressable>
            {left > 0 && <T style={[s.muted, { textAlign: "center", marginTop: 10 }]}>The driver confirms your request before your seat is booked.</T>}
          </View>
        )}
      </View>
    </Modal>
  );
}

// One posted trip, used in the quick-access list and in the results
function TripCard({ t, onPress }: { t: OpenTrip; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.driver, t.seats_left <= 0 && { opacity: 0.6 }]}>
      <View style={[s.row, { marginBottom: 12 }]}>
        <View style={s.avatar}><T style={s.avatarTxt}>{initialsOf(t.driver_name)}</T></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <T style={{ fontWeight: "500" }} numberOfLines={1}>{t.driver_name}</T>
          <View style={[s.row, { marginTop: 2 }]}>
            <Star size={10} color={C.primary} fill={C.primary} />
            <T style={[s.muted, { marginLeft: 4 }]}>{t.driver_trips === 0 ? "New" : t.rating.toFixed(1)}</T>
            <T style={[s.muted, { marginLeft: 8, flexShrink: 1 }]} numberOfLines={1}>{t.vehicle}</T>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T mono style={{ fontWeight: "600", color: C.primary }}>R{t.price}</T>
          <T style={s.muted}>per seat</T>
        </View>
      </View>
      <View style={[s.row, { marginBottom: 12 }]}>
        <T style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>{t.origin}</T>
        <ArrowRight size={12} color={C.primary} style={{ marginHorizontal: 6 }} />
        <T style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>{t.destination}</T>
      </View>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View style={s.row}><Clock size={10} color={C.muted} /><T mono style={[s.muted, { marginLeft: 4 }]}>{fmtWhen(t.depart_at)}</T></View>
        <SeatsBadge left={t.seats_left} total={t.seats_total} />
      </View>
    </Pressable>
  );
}

function HomeScreen({ onProfile, prefill, onPrefillUsed, onRequested }: {
  onProfile: () => void; prefill: Prefill | null; onPrefillUsed: () => void; onRequested: () => void;
}) {
  const { user, openAuth } = React.useContext(AuthCtx);
  const { settings } = React.useContext(SettingsCtx);
  const [state, setState] = useState<"idle" | "searching" | "results">("idle");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [day, setDay] = useState<Date | null>(null);
  const [focus, setFocus] = useState<"from" | "to">("to");
  const [openTrip, setOpenTrip] = useState<OpenTrip | null>(null);
  const [pin, setPin] = useState<Pt | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [reqSeats, setReqSeats] = useState(1);
  const [reqBusy, setReqBusy] = useState(false);
  const me = useMyLocation(settings.showLocation);
  // Runs while searching too, so posted trips show up as soon as "Where are you going?" is tapped
  const { trips, loading, err } = useTripSearch(state !== "idle", from, to, day, user?.id);
  const live = openTrip ? trips.find((t) => t.id === openTrip.id) ?? openTrip : null; // keeps seats current while the sheet is open

  // The town for a pinned spot
  const [place, setPlace] = useState<PinPlace | null>(null);
  const [placeStatus, setPlaceStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [lookupTry, setLookupTry] = useState(0);
  const supported = !!place && SUPPORTED_PROVINCES.includes(place.province);

  // Looks up the pinned spot half a second after the last tap
  useEffect(() => {
    if (!pin) return;
    let off = false;
    setPlace(null); setPlaceStatus("loading");
    const timer = setTimeout(() => {
      lookupPlace(pin)
        .then((pl) => { if (!off) { setPlace(pl); setPlaceStatus("ready"); } })
        .catch(() => { if (!off) setPlaceStatus("failed"); });
    }, 500);
    return () => { off = true; clearTimeout(timer); };
  }, [pin?.latitude, pin?.longitude, lookupTry]);

  const reset = () => { setState("idle"); setFrom(""); setTo(""); setDay(null); setOpenTrip(null); setPin(null); setReqSeats(1); };

  // Coming from Services (Book a trip / a city) or Activity (Rebook)
  useEffect(() => {
    if (!prefill) return;
    setFrom(prefill.pickup);
    setTo(prefill.dest);
    setDay(null);
    setFocus("to");
    setState(prefill.dest.trim() ? "results" : "searching");
    onPrefillUsed();
  }, [prefill?.n]);

  // Asks drivers for a trip nobody has posted yet
  const requestTrip = async () => {
    if (!user?.id) {
      Alert.alert("Sign in to request a trip", "Create an account or log in so drivers can see your request.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => openAuth() },
      ]);
      return;
    }
    setReqBusy(true);
    const { error } = await supabase.from("trip_requests").insert({
      rider_id: user.id,
      rider_name: user.name,
      origin: from.trim() || null,
      destination: to.trim(),
      travel_date: day ? `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}` : null,
      seats: reqSeats,
    });
    setReqBusy(false);
    if (error) return Alert.alert("Could not send request", error.message);
    Alert.alert("Request sent", "Drivers going your way can see it and post a trip. Check back soon, or change your search.");
  };

  const tripSheet = (
    <TripModal
      trip={live}
      onClose={() => setOpenTrip(null)}
      onRequested={() => {
        setOpenTrip(null);
        Alert.alert("Request sent", "The driver will confirm your seat. You can follow it in the Activity tab.", [
          { text: "Stay here", style: "cancel" },
          { text: "View Activity", onPress: onRequested },
        ]);
      }}
    />
  );

  // ----- Results: rides drivers have posted that match the search -----
  if (state === "results") {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
          <View style={s.row}>
            <Pressable onPress={() => setState("searching")} style={[s.roundBtn, { marginRight: 12 }]}><ChevronLeft size={16} color={C.fg} /></Pressable>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: "600" }} numberOfLines={1}>{from.trim() || "Anywhere"} → {to.trim()}</T>
              <T style={s.muted}>
                {day ? `${DAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}` : "Any date"} · {loading && trips.length === 0 ? "Searching..." : plural(trips.length, "ride")}
              </T>
            </View>
            <Pressable onPress={reset} style={s.roundBtn}><X size={16} color={C.fg} /></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32, gap: 12 }}>
          {!!err && <T style={{ color: C.danger, fontSize: 12 }}>Could not load rides: {err}</T>}
          {!loading && !err && trips.length === 0 && (
            <View style={[s.card, { paddingVertical: 24 }]}>
              <T style={{ fontWeight: "600", marginBottom: 6, textAlign: "center" }}>No rides posted for this route yet</T>
              <T style={[s.muted, { textAlign: "center", lineHeight: 18, marginBottom: 16 }]}>
                You can ask for this trip. Drivers going your way will see your request and can post a trip.
              </T>
              <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
                <T style={{ fontWeight: "500" }}>Seats needed</T>
                <View style={[s.row, { gap: 16 }]}>
                  <Pressable onPress={() => setReqSeats(Math.max(1, reqSeats - 1))} style={s.roundBtn}><Minus size={14} color={C.fg} /></Pressable>
                  <T mono style={{ fontWeight: "600", minWidth: 16, textAlign: "center" }}>{reqSeats}</T>
                  <Pressable onPress={() => setReqSeats(Math.min(3, reqSeats + 1))} style={s.roundBtn}><Plus size={14} color={C.fg} /></Pressable>
                </View>
              </View>
              <Pressable onPress={requestTrip} disabled={reqBusy} style={[s.primaryBtn, reqBusy && { opacity: 0.6 }]}>
                <T style={s.primaryTxt}>{reqBusy ? "Sending..." : "Request this trip"}</T>
              </Pressable>
              <Pressable onPress={() => setState("searching")} style={[s.primaryBtn, { marginTop: 12, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border }]}>
                <T style={s.primaryTxt}>Change search</T>
              </Pressable>
            </View>
          )}
          {trips.map((t) => <TripCard key={t.id} t={t} onPress={() => setOpenTrip(t)} />)}
        </ScrollView>
        {tripSheet}
      </View>
    );
  }

  // ----- Search form, with posted trips for quick access -----
  if (state === "searching") {
    return (
      <View style={{ flex: 1 }}>
        <View style={[s.row, { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }]}>
          <Pressable onPress={reset} style={[s.roundBtn, { marginRight: 12 }]}><X size={16} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "500" }}>Find a ride</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={[s.search, { padding: 0, overflow: "hidden" }]}>
            <View style={[s.row, s.inputRow, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
              <View style={[s.dot, { backgroundColor: C.primary }]} />
              <TextInput value={from} onChangeText={setFrom} onFocus={() => setFocus("from")} placeholder="Leaving from (optional)"
                placeholderTextColor={C.muted} style={s.input} />
              {!!from && <Pressable onPress={() => setFrom("")}><X size={13} color={C.muted} /></Pressable>}
            </View>
            <View style={[s.row, s.inputRow]}>
              <View style={[s.dot, { borderRadius: 2, backgroundColor: C.fgSoft }]} />
              <TextInput autoFocus value={to} onChangeText={setTo} onFocus={() => setFocus("to")} placeholder="Where are you going?"
                placeholderTextColor={C.muted} returnKeyType="search" onSubmitEditing={() => to.trim() && setState("results")} style={s.input} />
              {!!to && <Pressable onPress={() => setTo("")}><X size={13} color={C.muted} /></Pressable>}
            </View>
          </View>
          <CityChips text={focus === "from" ? from : to} onPick={(c) => (focus === "from" ? setFrom(c) : setTo(c))} />

          <View style={{ height: 8 }} />
          <Label>When are you travelling?</Label>
          <DateChips value={day} onChange={setDay} allowAny />

          <Pressable
            onPress={() => setState("results")}
            disabled={!to.trim()}
            style={[s.primaryBtn, { marginTop: 20, flexDirection: "row" }, !to.trim() && { opacity: 0.5 }]}
          >
            <T style={s.primaryTxt}>Find rides </T>
            <ArrowRight size={15} color="#fff" />
          </Pressable>

          <View style={{ height: 28 }} />
          <Label>Available rides</Label>
          {!!err && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>Could not load rides: {err}</T>}
          {loading && trips.length === 0 && <T style={s.muted}>Loading rides...</T>}
          {!loading && !err && trips.length === 0 && (
            <T style={[s.muted, { lineHeight: 18 }]}>No rides match yet. Tap "Find rides" and you can request this trip.</T>
          )}
          <View style={{ gap: 12 }}>
            {trips.map((t) => <TripCard key={t.id} t={t} onPress={() => setOpenTrip(t)} />)}
          </View>
        </ScrollView>
        {tripSheet}
      </View>
    );
  }

  // ----- Home: map you can tap to drop a pin -----
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, zIndex: 10 }}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
          <View>
            <T style={s.muted}>{getGreeting()}</T>
            <T style={{ fontWeight: "600", fontSize: 16 }}>Mzansi<T style={{ fontWeight: "600", fontSize: 16, color: C.primary }}>Lift</T></T>
          </View>
          <Pressable onPress={onProfile} style={s.roundBtn}><User size={16} color={C.muted} /></Pressable>
        </View>
        <Pressable onPress={() => setState("searching")} style={[s.row, s.search]}>
          <Search size={16} color={C.primary} />
          <T style={[s.muted, { fontSize: 14, marginLeft: 12 }]}>Where are you going?</T>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <MapView me={me} pin={pin} dark={THEME === "dark"} recenterKey={recenter} onPin={setPin} />
        <Pressable onPress={() => setRecenter((n) => n + 1)} style={[s.roundBtn, { position: "absolute", right: 16, top: 12 }]}>
          <Navigation size={16} color={C.primary} />
        </Pressable>

        {pin ? (
          <View style={[s.card, { position: "absolute", left: 16, right: 16, bottom: 16 }]}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <View style={[s.row, { flex: 1 }]}>
                <MapPin size={16} color={C.danger} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <T style={{ fontWeight: "600" }}>{place ? place.name : "Pinned location"}</T>
                  <T style={s.muted}>
                    {placeStatus === "loading" ? "Finding the town..."
                      : placeStatus === "failed" ? "Couldn't look this up. Check your connection."
                        : !place ? "No town found here. Try another spot."
                          : supported ? place.province
                            : `${place.province} is not covered yet`}
                  </T>
                </View>
              </View>
              <Pressable onPress={() => setPin(null)} hitSlop={10}><X size={16} color={C.muted} /></Pressable>
            </View>
            {placeStatus === "failed" && (
              <Pressable onPress={() => setLookupTry((n) => n + 1)} style={[s.modalBtn, { borderWidth: 1, borderColor: C.border, marginTop: 12 }]}>
                <T>Try again</T>
              </Pressable>
            )}
            {supported && place && (
              <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                <Pressable
                  onPress={() => { setTo(place.name); setPin(null); setState("results"); }}
                  style={[s.modalBtn, { backgroundColor: C.primary }]}
                >
                  <T style={s.primaryTxt} numberOfLines={1}>Going to {place.name}</T>
                </Pressable>
                <Pressable
                  onPress={() => { setFrom(place.name); setPin(null); setFocus("to"); setState("searching"); }}
                  style={[s.modalBtn, { borderWidth: 1, borderColor: C.border }]}
                >
                  <T>Leaving from</T>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View pointerEvents="none" style={{ position: "absolute", bottom: 16, left: 0, right: 0, alignItems: "center" }}>
            <T style={[s.chip, { backgroundColor: C.card }]}>Tap the map to pin where you're going</T>
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
      <T mono style={[s.muted, { marginBottom: 4 }]}>MzansiLift</T>
      <T style={s.h2}>Services</T>
      <Pressable onPress={() => startBooking()} style={[s.row, s.bookTrip]}>
        <View style={s.tripIcon}><Car size={22} color="#fff" /></View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <T style={{ fontWeight: "600" }}>Book a trip</T>
          <T style={[s.muted, { marginTop: 2 }]}>Find a driver heading your way</T>
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
              <T style={[s.muted, { marginBottom: 12 }]}>Popular towns · tap one to find rides there</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {p.desc.split(" · ").map((c) => (
                  <Pressable key={c} onPress={() => startBooking({ dest: c.trim() })}><T style={s.chip}>{c.trim()}</T></Pressable>
                ))}
              </View>
              <T style={[s.muted, { marginTop: 12, lineHeight: 17 }]}>Every other town in {p.name} is covered too. Type it in the search.</T>
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

// ---------- My bookings (upcoming + history) ----------
type MyBooking = {
  booking_id: string; trip_id: string; seats: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  trip_status: "open" | "cancelled" | "completed";
  origin: string; destination: string; depart_at: string; price: number | null;
  driver_name: string; vehicle: string; plate: string; driver_phone: string | null;
};

const money = (price: number | null | undefined, seats = 1) => (price == null ? "Fare TBC" : `R${price * seats}`);
const bookingLabel = (b: MyBooking) => {
  if (b.trip_status === "cancelled") return "Trip cancelled";
  if (b.status === "declined") return "Declined";
  if (b.status === "cancelled") return "Cancelled";
  if (b.trip_status === "completed") return b.status === "accepted" ? "Completed" : "Expired";
  return b.status === "accepted" ? "Confirmed" : "Waiting for driver";
};
const pillStyle = (label: string) => {
  if (label === "Confirmed" || label === "Completed") return { color: C.green, backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" };
  if (label === "Waiting for driver") return { color: C.amber, backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)" };
  if (label === "Expired") return { color: C.muted, backgroundColor: "rgba(86,96,120,0.1)", borderColor: "rgba(86,96,120,0.25)" };
  return { color: C.danger, backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.25)" };
};

function ActivityScreen() {
  const { user, openAuth, startBooking } = React.useContext(AuthCtx);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = async () => {
    if (!user?.id) { setBookings([]); return; }
    const { data, error } = await supabase.from("rider_bookings").select("*").order("depart_at", { ascending: true });
    if (error) setError(error.message);
    else { setError(""); setBookings((data ?? []) as MyBooking[]); }
  };

  // Loads when the tab opens, then every 15s so a driver's answer shows up without leaving the screen
  useEffect(() => {
    if (!user?.id) { setBookings([]); return; }
    setLoading(true);
    load().finally(() => setLoading(false));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user?.id]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cancelBooking = async (id: string) => {
    const { error } = await supabase.rpc("cancel_booking", { p_booking: id });
    if (error) Alert.alert("Could not cancel", error.message);
    await load();
  };

  const isUpcoming = (b: MyBooking) => (b.status === "pending" || b.status === "accepted") && b.trip_status === "open";
  const upcoming = bookings.filter(isUpcoming);
  const history = bookings.filter((b) => !isUpcoming(b)).sort((a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime());

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
            <T style={[s.muted, { textAlign: "center", marginBottom: 16 }]}>Your seat requests and trip history appear here.</T>
            <Pressable onPress={() => openAuth()} style={[s.primaryBtn, { paddingHorizontal: 32 }]}>
              <T style={s.primaryTxt}>Sign in</T>
            </Pressable>
          </View>
        ) : (
          <>
            {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}

            <Label>Upcoming rides</Label>
            {upcoming.length === 0 && (
              <T style={[s.muted, { marginBottom: 24 }]}>{loading ? "Loading..." : "No upcoming rides. Find a driver going your way from Home or Services."}</T>
            )}
            {upcoming.map((b) => {
              const label = bookingLabel(b);
              return (
                <View key={b.booking_id} style={[s.card, { marginBottom: 24 }]}>
                  <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={[s.row, { marginBottom: 4 }]}>
                        <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{b.origin}</T>
                        <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
                        <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{b.destination}</T>
                      </View>
                      <T mono style={s.muted}>{fmtWhen(b.depart_at)}</T>
                      <T mono style={[s.muted, { marginTop: 2 }]}>{plural(b.seats, "seat")} · {money(b.price, b.seats)}</T>
                    </View>
                    <T style={[s.booked, pillStyle(label)]}>{label}</T>
                  </View>
                  <View style={[s.row, s.cardFoot]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <T style={s.muted} numberOfLines={1}>{b.driver_name} · {b.vehicle} · {b.plate}</T>
                      {b.status === "accepted" && !!b.driver_phone && (
                        <Pressable onPress={() => Linking.openURL(`tel:${b.driver_phone}`)} style={[s.row, { marginTop: 6 }]}>
                          <Phone size={12} color={C.primary} />
                          <T style={{ fontSize: 12, color: C.primary, marginLeft: 6 }}>{b.driver_phone}</T>
                        </Pressable>
                      )}
                    </View>
                    <Pressable onPress={() => setCancelId(b.booking_id)} style={s.cancelPill}>
                      <T style={{ fontSize: 12, color: C.danger }}>Cancel</T>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <Label>History</Label>
            {history.length === 0 && <T style={s.muted}>{loading ? "" : "Completed, declined and cancelled rides show up here."}</T>}
            {history.map((b) => {
              const label = bookingLabel(b);
              return (
                <View key={b.booking_id} style={[s.card, { marginBottom: 12 }]}>
                  <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                    <View style={[s.row, { flex: 1, paddingRight: 8 }]}>
                      {label === "Completed" ? <CheckCircle size={14} color={C.primary} /> : <X size={14} color={C.muted} />}
                      <T style={{ fontWeight: "500", marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{b.origin}</T>
                      <ArrowRight size={12} color={C.muted} style={{ marginHorizontal: 6 }} />
                      <T style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>{b.destination}</T>
                    </View>
                    <T mono style={{ fontWeight: "600", color: label === "Completed" ? C.primary : C.muted }}>{money(b.price, b.seats)}</T>
                  </View>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <T mono style={s.muted}>{fmtWhen(b.depart_at)} · {label}</T>
                    <Pressable onPress={() => startBooking({ pickup: b.origin, dest: b.destination })} style={s.row}>
                      <RotateCcw size={11} color={C.primary} />
                      <T style={{ fontSize: 12, color: C.primary, marginLeft: 4 }}>Rebook</T>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={cancelId !== null} transparent animationType="slide" onRequestClose={() => setCancelId(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", padding: 16 }}>
          <View style={[s.card, { borderRadius: 24, padding: 24 }]}>
            <T style={{ fontWeight: "600", fontSize: 16, marginBottom: 8 }}>Cancel this booking?</T>
            <T style={[s.muted, { fontSize: 14, marginBottom: 20 }]}>Your seat will be released for other riders.</T>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => setCancelId(null)} style={[s.modalBtn, { borderWidth: 1, borderColor: C.border }]}>
                <T>Keep booking</T>
              </Pressable>
              <Pressable
                onPress={() => { const id = cancelId; setCancelId(null); if (id) cancelBooking(id); }}
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
  const { user, setUser, openAuth, openDriver, isDriver } = React.useContext(AuthCtx);
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const INFO_PAGES = ["Safety", "Help", "Legal", "Contact us", "About us"];
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
            if (label === "Settings") setSettingsOpen(true);
            if (INFO_PAGES.includes(label)) setInfo(label);
            if (label === "Be a driver") {
              user ? openDriver() : Alert.alert("Sign in to drive", "Create an account or log in to become a driver.", [
                { text: "Not now", style: "cancel" },
                { text: "Sign in", onPress: () => openAuth() },
              ]);
            }
          }} style={[s.row, s.menuItem, i === 2 && { marginTop: 16, borderTopWidth: 1, borderTopColor: C.border }]}>
            <View style={s.menuIcon}><Icon size={16} color={C.muted} /></View>
            <T style={{ flex: 1, fontWeight: "500", marginLeft: 16 }}>{label === "Be a driver" && isDriver ? "Driver profile" : label}</T>
            <ChevronRight size={15} color={C.muted} />
          </Pressable>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
        <Pressable onPress={user ? () => setUser(null) : openAuth} style={[s.dangerOutline, { borderRadius: 16 }]}>
          <T style={{ color: user ? C.danger : C.primary, fontWeight: "500" }}>{user ? "Sign out" : "Sign in"}</T>
        </Pressable>
      </View>
      <T mono style={[s.muted, { textAlign: "center", marginTop: 24 }]}>MzansiLift v1.0.0 · South Africa</T>
      <ManageAccountModal visible={manageOpen} onClose={() => setManageOpen(false)} />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <InfoModal kind={info} onClose={() => setInfo(null)} />
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
const RIDER_TABS = ["home", "services", "activity"];

export default function App() {
  const [tab, setTab] = useState("home");
  const [user, setUserState] = useState<UserT | null>(null);
  const [loading, setLoading] = useState(true); // checking for a saved sign-in
  const [guest, setGuest] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [driverOpen, setDriverOpen] = useState(false);
  const [driverRev, setDriverRev] = useState(0); // bumps when the driver profile changes so the Drive tab reloads
  const [isDriver, setIsDriver] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const systemScheme = useColorScheme();
  const themeName: "dark" | "light" = settings.theme === "system" ? (systemScheme === "light" ? "light" : "dark") : settings.theme;
  applyTheme(themeName); // switches the shared colours and styles before the screens below render

  // Saved settings (mode, map options)
  useEffect(() => {
    AsyncStorage.getItem("mzl.settings")
      .then((v) => { if (v) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(v) }); })
      .catch(() => { })
      .finally(() => setSettingsLoaded(true)); // wait for the saved theme so there is no dark flash
  }, []);
  const update = (p: Partial<AppSettings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    AsyncStorage.setItem("mzl.settings", JSON.stringify(next)).catch(() => { });
  };

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

  // Only registered drivers get the Drive tab
  const checkDriver = async (id?: string) => {
    if (!id) { setIsDriver(false); return; }
    const { data } = await supabase.from("drivers").select("id").eq("id", id).maybeSingle();
    setIsDriver(!!data);
  };
  useEffect(() => { checkDriver(user?.id); }, [user?.id]);

  const setUser = (u: UserT | null) => {
    if (!u) { supabase.auth.signOut(); return; }
    supabase.auth
      .updateUser({ data: { full_name: u.name, phone: u.phone } })
      .then(({ error }) => { if (error) Alert.alert("Could not save", error.message); });
  };
  const openAuth = (m: "signin" | "signup" = "signin") => { setAuthMode(m); setAuthOpen(true); };
  // Opens the Home tab ready to book (used by Services and by Rebook)
  const startBooking = (p?: BookingStart) => { setPrefill({ pickup: p?.pickup ?? "", dest: p?.dest ?? "", n: Date.now() }); setTab("home"); };

  // Only registered drivers can be in driver mode
  const mode: "rider" | "driver" = isDriver ? settings.mode : "rider";

  // Keep the open tab consistent with the mode
  useEffect(() => {
    if (mode === "driver" && RIDER_TABS.includes(tab)) setTab("drive");
    else if (mode === "rider" && tab === "drive") setTab("home");
  }, [mode, tab]);

  // Tabs for the other mode are switched off; tapping one offers to switch
  const isOff = (id: string) => isDriver && (mode === "driver" ? RIDER_TABS.includes(id) : id === "drive");
  const pressTab = (id: string) => {
    if (!isOff(id)) return setTab(id);
    if (mode === "driver") {
      Alert.alert("You're in driver mode", "Switch to rider mode to find and book rides.", [
        { text: "Not now", style: "cancel" },
        { text: "Switch to rider mode", onPress: () => update({ mode: "rider" }) },
      ]);
    } else {
      Alert.alert("You're in rider mode", "Switch to driver mode to post trips and answer seat requests.", [
        { text: "Not now", style: "cancel" },
        { text: "Switch to driver mode", onPress: () => update({ mode: "driver" }) },
      ]);
    }
  };

  const showWelcome = !loading && !user && !guest;
  const navItems = isDriver ? [NAV[0], NAV[1], NAV[2], { id: "drive", icon: Car, label: "Drive" }, NAV[3]] : NAV;

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      <AuthCtx.Provider value={{ user, setUser, openAuth: () => openAuth("signin"), openDriver: () => setDriverOpen(true), startBooking, isDriver }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
          <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
          {loading || !settingsLoaded ? null : showWelcome ? (
            <WelcomeScreen onLogin={() => openAuth("signin")} onSignup={() => openAuth("signup")} onGuest={() => setGuest(true)} />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                {mode === "rider" && tab === "home" && <HomeScreen onProfile={() => setTab("account")} prefill={prefill} onPrefillUsed={() => setPrefill(null)} onRequested={() => setTab("activity")} />}
                {mode === "rider" && tab === "services" && <ServicesScreen />}
                {mode === "rider" && tab === "activity" && <ActivityScreen />}
                {mode === "driver" && tab === "drive" && <DriverScreen onEditProfile={() => setDriverOpen(true)} refreshKey={driverRev} />}
                {tab === "account" && <AccountScreen />}
              </View>
              <View style={s.nav}>
                {navItems.map(({ id, icon: Icon, label }) => {
                  const on = tab === id;
                  const off = isOff(id);
                  return (
                    <Pressable key={id} onPress={() => pressTab(id)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, gap: 4, opacity: off ? 0.3 : 1 }}>
                      <Icon size={20} color={on ? C.primary : C.muted} strokeWidth={on ? 2 : 1.5} />
                      <T mono style={{ fontSize: 10, letterSpacing: 0.5, color: on ? C.primary : C.muted }}>{label}</T>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <AuthModal visible={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
          <DriverProfileModal
            visible={driverOpen}
            onClose={() => { setDriverOpen(false); setDriverRev((r) => r + 1); }}
            onRegistered={async () => { await checkDriver(user?.id); update({ mode: "driver" }); setTab("drive"); }}
          />
        </SafeAreaView>
      </AuthCtx.Provider>
    </SettingsCtx.Provider>
  );
}

// ---------- Styles ----------
const makeStyles = () => StyleSheet.create({
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
  chip: { fontSize: 12, color: C.fg2, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, overflow: "hidden" },
  notice: { marginTop: 24, padding: 16, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, borderRadius: 16 },
  booked: { fontSize: 12, color: C.primary, backgroundColor: "rgba(37,99,235,0.1)", borderWidth: 1, borderColor: "rgba(37,99,235,0.2)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  cancelPill: { borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: "center" },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  connectBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderWidth: 1, borderColor: C.border, borderRadius: 12 },
  nav: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  dateChip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.secondary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  dateChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  dateTxt: { fontSize: 12 },
  seatDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  reqRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
});
const s = makeStyles();
