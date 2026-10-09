"use no memo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  Camera,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Eye, EyeOff,
  FileText,
  Globe,
  Heart,
  HelpCircle,
  Home,
  Info,
  Landmark,
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
  type LucideIcon,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Appearance,
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
let KEEP_SETTINGS_OPEN = false; // lets the Settings window reopen itself after a theme change remounts the app
// Logos for each theme (swap the two file names if they look the wrong way round)
const LOGO_DARK = require("../../assets/mzansilift-logo-dark.png");
const LOGO_LIGHT = require("../../assets/mzansilift-logo-light.png");
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
type PayMethod = "cash" | "card" | "eft";
type AppSettings = { mode: "rider" | "driver"; showLocation: boolean; theme: "system" | "light" | "dark"; payment: PayMethod };
const DEFAULT_SETTINGS: AppSettings = { mode: "rider", showLocation: true, theme: "dark", payment: "cash" };

// ---------- Payment options ----------
// Only cash works today. Card and Instant EFT show as "Coming soon" until a payment provider is connected
// (then set available: true and charge the rider when the driver accepts).
const PAYMENT_METHODS: { id: PayMethod; label: string; short: string; sub: string; icon: LucideIcon; available: boolean }[] = [
  { id: "cash", label: "Cash", short: "Cash", sub: "Pay the driver in cash when you travel", icon: Banknote, available: true },
  { id: "card", label: "Card", short: "Card", sub: "Pay in the app with your bank card", icon: CreditCard, available: false },
  { id: "eft", label: "Instant EFT", short: "EFT", sub: "Pay straight from your banking app", icon: Landmark, available: false },
];
const payName = (m?: string | null) => PAYMENT_METHODS.find((x) => x.id === m)?.label ?? "Cash";
const ONE_TRIP_TITLE = "You already have a trip posted";
const ONE_TRIP_MSG = "Finish your current trip before posting another. Once it is marked completed (or you cancel it) you can post a new one.";
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
  { icon: Settings, label: "Manage Account" }, { icon: CreditCard, label: "Payment methods" }, { icon: Settings, label: "Settings" },
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
  .lt .leaflet-control-attribution{background:rgba(255,255,255,.8)!important;color:#64748b!important}
  .lt .leaflet-control-attribution a{color:#64748b!important}
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
  var current = '__INIT__';
  layers[current].addTo(map);
  document.body.className = current === 'light' ? 'lt' : '';
  var meM = null, pinM = null, drvM = [], lastRecenter = 0, lastFit = 0;

  function post(o) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  map.on('click', function (e) { post({ type: 'pin', lat: e.latlng.lat, lng: e.latlng.lng }); });

  window.setState = function (d) {
    if (d.bg) { document.body.style.background = d.bg; document.getElementById('map').style.background = d.bg; }
    if (d.style && d.style !== current && layers[d.style]) {
      map.removeLayer(layers[current]); layers[d.style].addTo(map); current = d.style;
    }
    if (d.style) document.body.className = d.style === 'light' ? 'lt' : '';
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
    if (d.fitKey && d.fitKey !== lastFit) {
      lastFit = d.fitKey;
      var pts = drvM.map(function (m) { return m.getLatLng(); });
      if (pinM) pts.push(pinM.getLatLng());
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15 });
      else if (pts.length === 1) map.setView(pts[0], 13);
    }
  };
}
</script></body></html>`;

function MapView({ me, drivers = [], pin = null, dark = true, recenterKey = 0, fitKey = 0, onPin }: {
  me: Pt | null; drivers?: (Pt & { id: string })[]; pin?: Pt | null; dark?: boolean; recenterKey?: number; fitKey?: number; onPin?: (p: Pt) => void;
}) {
  const webRef = React.useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const html = React.useMemo(
    () => MAP_HTML.replace("background:#0a0b14", `background:${C.bg}`).replace("__INIT__", THEME),
    []
  );

  // Sends your position, the pin and the map style into the page whenever they change
  const payload = JSON.stringify({ me, drivers, pin, style: dark ? "dark" : "light", recenter: recenterKey, fitKey, bg: C.bg });
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
        source={{ html, baseUrl: "https://localhost" }}
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
type UserT = { id?: string; name: string; phone: string; email: string; avatar?: string };
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
  u ? { id: u.id, name: u.user_metadata?.full_name || (u.email ?? "").split("@")[0], phone: u.user_metadata?.phone ?? "", email: u.email ?? "", avatar: u.user_metadata?.avatar_url ?? "" } : null;

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
          keyboardAppearance={THEME}
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

// ---------- Photos: pick from camera/library and upload to Supabase Storage ----------
type Picked = { uri: string; mime: string; name?: string; b64?: string };
const extOf = (mime: string) => (mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg");

async function pickPhoto(opts?: { square?: boolean }): Promise<Picked | null> {
  const choice = await new Promise<"camera" | "library" | null>((resolve) =>
    Alert.alert("Add a photo", undefined, [
      { text: "Take photo", onPress: () => resolve("camera") },
      { text: "Choose from library", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) })
  );
  if (!choice) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: !!opts?.square,
    aspect: opts?.square ? [1, 1] : undefined,
    base64: true, // read the photo straight from the picker, no file reading needed
  };
  let res: ImagePicker.ImagePickerResult;
  if (choice === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access in your phone's settings to take a photo.");
      return null;
    }
    res = await ImagePicker.launchCameraAsync(options);
  } else {
    res = await ImagePicker.launchImageLibraryAsync(options);
  }
  const a = res.canceled ? null : res.assets?.[0];
  return a ? { uri: a.uri, mime: a.mimeType ?? "image/jpeg", b64: a.base64 ?? undefined } : null;
}

// Picks a PDF file (used for the driver's licence)
async function pickPdf(): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  const a = res.canceled ? null : res.assets?.[0];
  if (!a) return null;
  if (a.size && a.size > 10 * 1024 * 1024) {
    Alert.alert("File too large", "Choose a PDF smaller than 10 MB.");
    return null;
  }
  return { uri: a.uri, mime: "application/pdf", name: a.name };
}

// The licence can be a photo or a PDF
async function pickLicenseFile(): Promise<Picked | null> {
  const kind = await new Promise<"photo" | "pdf" | null>((resolve) =>
    Alert.alert("Driver's licence", "Upload a photo or a PDF.", [
      { text: "Photo", onPress: () => resolve("photo") },
      { text: "PDF file", onPress: () => resolve("pdf") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) })
  );
  if (kind === "photo") return pickPhoto();
  if (kind === "pdf") return pickPdf();
  return null;
}

const B64_TABLE: Record<string, number> = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").forEach((ch, i) => { B64_TABLE[ch] = i; });
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64_TABLE[clean[i]] << 18) | (B64_TABLE[clean[i + 1]] << 12) | ((B64_TABLE[clean[i + 2]] ?? 0) << 6) | (B64_TABLE[clean[i + 3]] ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// Reads a local file (used for PDFs). XHR works on file:// links where fetch may not.
function readFileBytes(uri: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as ArrayBuffer);
    xhr.onerror = () => reject(new Error("the phone could not open the file"));
    xhr.responseType = "arraybuffer";
    xhr.open("GET", uri);
    xhr.send();
  });
}

async function uploadPhoto(bucket: string, path: string, pic: Picked, upsert = false) {
  let body: Uint8Array | ArrayBuffer;
  try {
    body = pic.b64 ? b64ToBytes(pic.b64) : await readFileBytes(pic.uri);
  } catch (e: any) {
    throw new Error(`Could not read the file: ${e?.message ?? "unknown error"}`);
  }
  if (body.byteLength === 0) throw new Error("Could not read the file. Try a different one.");
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: pic.mime, upsert, cacheControl: "60" });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    throw new Error(`Upload failed: ${e?.message ?? "unknown error"}. Check your internet connection.`);
  }
}

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
  const [step, setStep] = useState<"form" | "email-code">("form");
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
    if (data.session) return onClose(); // email confirmation is switched off in Supabase
    setCode(""); setStep("email-code"); setCooldown(60);
  };

  // New accounts prove the email is theirs with a one-time code (the phone number is saved but not verified by SMS)
  const verifyEmail = async () => {
    setError("");
    if (code.trim().length < 6) return setError("Enter the code we sent you");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(error.message);
    onClose();
  };

  const title = step === "email-code" ? "Verify your email" : mode === "signin" ? "Log in" : "Create account";
  const action = step === "form" ? (mode === "signin" ? signIn : signUp) : verifyEmail;
  const actionLabel = step === "form" ? (mode === "signin" ? "Log in" : "Create account") : "Verify";
  const resend = sendEmailCode;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={[s.card, { borderRadius: 24, maxHeight: "90%" }]}>
          <ScrollView
            contentContainerStyle={{ padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
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
                  {`We sent a code to ${email.trim()}. Enter it to confirm this email is yours.`}
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
                <Pressable onPress={() => { setStep("form"); setError(""); }}><T style={{ color: C.muted }}>Back</T></Pressable>
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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Avatars: the storage bucket is the source of truth, updated_at is the cache-buster ----------
const avatarCache: Record<string, { url?: string; at: number }> = {};
const avatarListeners = new Set<() => void>();

// Call after uploading/removing a photo so every Avatar on screen reloads
function refreshAvatar(id: string) {
  delete avatarCache[id];
  avatarListeners.forEach((f) => f());
}

async function resolveAvatar(id: string): Promise<string | undefined> {
  const hit = avatarCache[id];
  if (hit && Date.now() - hit.at < 60_000) return hit.url;
  const { data, error } = await supabase.storage.from("avatars").list(id, { limit: 1, search: "avatar" });
  if (error) return hit?.url;
  const f: any = data?.[0];
  const url = f
    ? `${supabase.storage.from("avatars").getPublicUrl(`${id}/avatar`).data.publicUrl}?v=${new Date(f.updated_at ?? f.created_at ?? 0).getTime()}`
    : undefined; // file deleted -> show initials
  avatarCache[id] = { url, at: Date.now() };
  return url;
}

// Profile picture, falling back to the first letter if there is none or it can't load
function Avatar({ userId, initial, size, style }: { userId?: string; initial: string; size: number; style?: any }) {
  const [uri, setUri] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    avatarListeners.add(f);
    return () => { avatarListeners.delete(f); };
  }, []);
  useEffect(() => {
    let off = false;
    setFailed(false);
    if (!userId) { setUri(undefined); return; }
    resolveAvatar(userId).then((u) => { if (!off) setUri(u); });
    return () => { off = true; };
  }, [userId, tick]);
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, style]}>
      {uri && !failed
        ? <Image key={uri} source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setFailed(true)} />
        : <T style={{ color: C.primary, fontWeight: "600", fontSize: Math.round(size * 0.37) }}>{initial}</T>}
    </View>
  );
}

// Change password: checks the current password first, then saves the new one
function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = React.useContext(AuthCtx);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setCurrent(""); setNext(""); setAgain(""); setError(""); setBusy(false); } }, [visible]);

  const save = async () => {
    setError("");
    if (!user?.email) return setError("You need to be signed in.");
    if (!current) return setError("Enter your current password");
    if (next.length < 6) return setError("New password must be at least 6 characters");
    if (next === current) return setError("Choose a password different from your current one");
    if (next !== again) return setError("The new passwords don't match");
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (check.error) { setBusy(false); return setError("Your current password is wrong"); }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setError(error.message);
    Alert.alert("Password changed", "Use your new password next time you log in.", [{ text: "OK", onPress: onClose }]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Change password</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
            <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
            <Field label="Confirm new password" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" />
            {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
            <Pressable onPress={save} disabled={busy} style={[s.primaryBtn, busy && { opacity: 0.6 }]}>
              <T style={s.primaryTxt}>{busy ? "Please wait..." : "Change password"}</T>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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

  const [photoBusy, setPhotoBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  // Picks a photo, uploads it to the public "avatars" bucket and saves its link on the account
  const changePhoto = async () => {
    if (!user?.id) return;
    const pic = await pickPhoto({ square: true });
    if (!pic) return;
    setPhotoBusy(true);
    try {
      const path = `${user.id}/avatar`;
      await uploadPhoto("avatars", path, pic, true);
      const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (error) throw new Error(error.message);
      refreshAvatar(user.id);
      const check = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (check && !check.ok) {
        Alert.alert("Photo saved but can't be shown", "The avatars storage bucket is not public. In Supabase run setup_storage.sql again, or open Storage, then avatars, and make it public.");
      }
    } catch (e: any) {
      Alert.alert("Could not update photo", e?.message ?? "Please try again.");
    }
    setPhotoBusy(false);
  };

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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Account info</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Pressable onPress={changePhoto} disabled={photoBusy} style={{ alignItems: "center", marginBottom: 24 }}>
              <Avatar userId={user?.id} initial={first[0]?.toUpperCase() ?? "?"} size={88} />
              <View style={[s.row, { marginTop: 8 }]}>
                <Camera size={13} color={C.primary} />
                <T style={{ color: C.primary, fontSize: 13, marginLeft: 6 }}>{photoBusy ? "Uploading..." : "Change photo"}</T>
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
            <Pressable onPress={() => setPwOpen(true)} style={[s.card, s.row]}>
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
        <ChangePasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} />
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

// Pick how you pay. compact = a single row of chips (used inside the trip sheet)
function PaymentOptions({ value, onChange, compact }: { value: PayMethod; onChange: (m: PayMethod) => void; compact?: boolean }) {
  if (compact) {
    return (
      <View style={[s.row, { gap: 8 }]}>
        {PAYMENT_METHODS.map((m) => {
          const on = value === m.id;
          const Icon = m.icon;
          return (
            <Pressable key={m.id} disabled={!m.available} onPress={() => onChange(m.id)}
              style={[s.dateChip, { flex: 1, alignItems: "center", paddingVertical: 10 }, on && s.dateChipOn, !m.available && { opacity: 0.4 }]}>
              <Icon size={16} color={on ? "#fff" : C.muted} />
              <T style={[s.dateTxt, { marginTop: 4 }, on && { color: "#fff" }]}>{m.short}</T>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {PAYMENT_METHODS.map((m) => {
        const on = value === m.id;
        const Icon = m.icon;
        return (
          <Pressable key={m.id} disabled={!m.available} onPress={() => onChange(m.id)}
            style={[s.card, s.row, { padding: 14 }, on && { borderColor: C.primary }, !m.available && { opacity: 0.55 }]}>
            <View style={s.menuIcon}><Icon size={16} color={on ? C.primary : C.muted} /></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <T style={{ fontWeight: "500" }}>{m.label}</T>
              <T style={[s.muted, { fontSize: 12, marginTop: 2 }]}>{m.available ? m.sub : "Coming soon"}</T>
            </View>
            {on && <CheckCircle size={18} color={C.primary} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function PaymentModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, update } = React.useContext(SettingsCtx);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <View style={[s.row, { padding: 16 }]}>
          <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Payment methods</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Label>Default payment method</Label>
          <PaymentOptions value={settings.payment} onChange={(m) => update({ payment: m })} />
          <T style={[s.muted, { marginTop: 16, lineHeight: 18 }]}>
            Cash means you pay the driver directly when you travel. Card and Instant EFT are coming soon. You can choose a different method each time you request a seat.
          </T>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDriver, openDriver } = React.useContext(AuthCtx);
  const { settings, update } = React.useContext(SettingsCtx);
  const track = { false: C.track, true: C.primary };

  const confirmThemeChange = (newTheme: "system" | "light" | "dark") => {
    KEEP_SETTINGS_OPEN = true;
    setTimeout(() => { KEEP_SETTINGS_OPEN = false; }, 1500);
    update({ theme: newTheme });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
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
                <Pressable key={id} onPress={() => confirmThemeChange(id)} style={[s.dateChip, { flex: 1, alignItems: "center", paddingVertical: 12 }, on && s.dateChipOn]}>
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
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
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

// ---------- Rider <-> driver: chat and live "driver is coming" tracking ----------
// All of it runs through database functions (see chat_and_tracking.sql), so only the rider and the driver of a booking can use it.
type ChatMsg = { msg_id: string; body: string; created_at: string; mine: boolean; from_driver: boolean };

function ChatModal({ bookingId, title, onClose }: { bookingId: string | null; title: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = React.useRef<ScrollView>(null);

  const load = async () => {
    if (!bookingId) return;
    const { data, error } = await supabase.rpc("get_trip_messages", { p_booking: bookingId });
    if (error) { setError(error.message); return; }
    setError(""); setMsgs((data ?? []) as ChatMsg[]);
  };
  useEffect(() => {
    if (!bookingId) { setMsgs([]); setText(""); setError(""); return; }
    load();
    const t = setInterval(load, 4000); // new messages appear within a few seconds
    return () => clearInterval(t);
  }, [bookingId]);

  const send = async () => {
    const body = text.trim();
    if (!bookingId || !body || busy) return;
    setBusy(true); setError("");
    const { error } = await supabase.rpc("send_trip_message", { p_booking: bookingId, p_body: body });
    setBusy(false);
    if (error) return setError(error.message);
    setText("");
    await load();
  };

  return (
    <Modal visible={!!bookingId} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.row, { padding: 16 }]}>
            <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
            <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12, flex: 1 }} numberOfLines={1}>{title}</T>
          </View>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          >
            {msgs.length === 0 && !error && (
              <T style={[s.muted, { textAlign: "center", marginTop: 24, lineHeight: 18 }]}>
                No messages yet. Say hello and agree on where to meet.
              </T>
            )}
            {msgs.map((m) => (
              <View key={m.msg_id} style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
                <View style={{
                  maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
                  backgroundColor: m.mine ? C.primary : C.secondary,
                  borderWidth: m.mine ? 0 : 1, borderColor: C.border,
                }}>
                  <T style={{ color: m.mine ? "#fff" : C.fg, lineHeight: 19 }}>{m.body}</T>
                </View>
                <T mono style={[s.muted, { fontSize: 10, marginTop: 2 }]}>{two(new Date(m.created_at).getHours())}:{two(new Date(m.created_at).getMinutes())}</T>
              </View>
            ))}
          </ScrollView>
          {!!error && <T style={{ color: C.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>{error}</T>}
          <View style={[s.row, { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a message"
              placeholderTextColor={C.muted}
              keyboardAppearance={THEME}
              maxLength={1000}
              multiline
              style={{ flex: 1, maxHeight: 100, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border, borderRadius: 16, color: C.fg, paddingHorizontal: 14, paddingVertical: 10 }}
            />
            <Pressable onPress={send} disabled={busy || !text.trim()} style={[s.tripIcon, { width: 44, height: 44, borderRadius: 22 }, (busy || !text.trim()) && { opacity: 0.5 }]}>
              <ArrowRight size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// Driver side: sends the phone's position while "I'm on my way" is on.
// Works while the app is open (foreground only), so the driver should keep the screen on during the pickup.
function useShareLocation(tripId: string | null) {
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | undefined;
    let last = 0;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      const w = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 15 },
        ({ coords }) => {
          if (Date.now() - last < 5000) return;
          last = Date.now();
          supabase.rpc("update_driver_location", { p_trip: tripId, p_lat: coords.latitude, p_lng: coords.longitude }).then(() => { });
        }
      );
      if (cancelled) w.remove(); else sub = w;
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [tripId]);
}

const toRad = (d: number) => (d * Math.PI) / 180;
const distKm = (a: Pt, b: Pt) => {
  const dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const ageText = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
};
type DriverFix = { lat: number; lng: number; sharing: boolean; updated_at: string };

// Rider side: shows where the driver is, how far, and a rough arrival time
function TrackModal({ booking, onClose, onMessage }: { booking: MyBooking | null; onClose: () => void; onMessage: (b: MyBooking) => void }) {
  const [fix, setFix] = useState<DriverFix | null | undefined>(undefined); // undefined = still loading
  const [from, setFrom] = useState<Pt | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [error, setError] = useState("");
  const [, setTick] = useState(0);
  const fitted = React.useRef(false);
  const bid = booking?.booking_id;

  useEffect(() => {
    fitted.current = false;
    if (!bid || !booking) { setFix(undefined); setFrom(null); setError(""); return; }
    let off = false;
    geocodeTown(booking.origin).then((p) => { if (!off) setFrom(p); });
    const load = async () => {
      const { data, error } = await supabase.rpc("get_driver_location", { p_booking: bid });
      if (off) return;
      if (error) { setError(error.message); return; }
      setError("");
      setFix(((data ?? []) as DriverFix[])[0] ?? null);
      setTick((n) => n + 1);
    };
    load();
    const t = setInterval(load, 6000);
    return () => { off = true; clearInterval(t); };
  }, [bid]);

  const live = !!fix && fix.sharing && Date.now() - new Date(fix.updated_at).getTime() < 2 * 60 * 1000;
  const driverPt: Pt | null = fix ? { latitude: fix.lat, longitude: fix.lng } : null;
  const km = live && driverPt && from ? distKm(driverPt, from) : null;
  const mins = km == null ? null : Math.max(1, Math.round((km / 50) * 60)); // rough: 50 km/h average

  useEffect(() => {
    if (driverPt && from && !fitted.current) { fitted.current = true; setFitKey((k) => k + 1); }
  }, [fix, from]);

  return (
    <Modal visible={!!booking} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
        <View style={[s.row, { padding: 16 }]}>
          <Pressable onPress={onClose} style={s.roundBtn}><ChevronLeft size={18} color={C.fg} /></Pressable>
          <T style={{ fontWeight: "600", fontSize: 18, marginLeft: 12 }}>Your driver</T>
        </View>
        {booking && (
          <View style={{ flex: 1, padding: 16, paddingTop: 0 }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
              <MapView
                me={null}
                drivers={driverPt ? [{ id: "driver", ...driverPt }] : []}
                pin={from}
                dark={THEME === "dark"}
                fitKey={fitKey}
              />
            </View>

            <View style={[s.card, { marginBottom: 12 }]}>
              {fix === undefined ? (
                <T style={s.muted}>Checking where your driver is...</T>
              ) : !fix || !fix.sharing ? (
                <>
                  <T style={{ fontWeight: "600", marginBottom: 4 }}>Your driver hasn't set off yet</T>
                  <T style={[s.muted, { lineHeight: 18 }]}>
                    You'll see them on the map here once they tap "I'm on my way". Departure is {fmtWhen(booking.depart_at)}.
                  </T>
                </>
              ) : !live ? (
                <>
                  <T style={{ fontWeight: "600", marginBottom: 4 }}>Waiting for your driver's location</T>
                  <T style={[s.muted, { lineHeight: 18 }]}>
                    Last seen {ageText(fix.updated_at)}. Their phone may be offline or the app may be closed. Try messaging or calling them.
                  </T>
                </>
              ) : (
                <>
                  <View style={s.row}>
                    <Navigation size={16} color={C.green} />
                    <T style={{ fontWeight: "600", marginLeft: 8, color: C.green }}>
                      {km != null && km < 0.3 ? "Your driver is at the pickup" : "Your driver is on the way"}
                    </T>
                  </View>
                  {km != null && km >= 0.3 && (
                    <T mono style={{ fontWeight: "600", fontSize: 20, color: C.primary, marginTop: 8 }}>
                      {km < 10 ? km.toFixed(1) : Math.round(km)} km · about {mins! >= 60 ? `${Math.floor(mins! / 60)} h ${mins! % 60} min` : `${mins} min`}
                    </T>
                  )}
                  <T style={[s.muted, { marginTop: 6, lineHeight: 17 }]}>
                    Distance to {booking.origin}, the pickup town. Arrival time is a rough estimate. Updated {ageText(fix.updated_at)}.
                  </T>
                </>
              )}
              {!!error && <T style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>{error}</T>}
            </View>

            <T style={[s.muted, { marginBottom: 12 }]} numberOfLines={1}>{booking.driver_name} · {booking.vehicle} · {booking.plate}</T>
            <View style={[s.row, { gap: 8 }]}>
              <Pressable onPress={() => onMessage(booking)} style={[s.primaryBtn, { flex: 1, flexDirection: "row" }]}>
                <MessageCircle size={16} color="#fff" />
                <T style={[s.primaryTxt, { marginLeft: 8 }]}>Message</T>
              </Pressable>
              {!!booking.driver_phone && (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${booking.driver_phone}`)}
                  style={[s.primaryBtn, { flex: 1, flexDirection: "row", backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border }]}
                >
                  <Phone size={16} color={C.fg} />
                  <T style={[s.primaryTxt, { marginLeft: 8, color: C.fg }]}>Call</T>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Driver side ----------

type DriverProfile = { id: string; full_name: string; phone: string; vehicle: string; plate: string; car_seats: number; rating: number; trips: number };
type TripBooking = { id: string; rider_name: string; rider_phone: string | null; seats: number; payment_method?: string | null; status: "pending" | "accepted" | "declined" | "cancelled" };
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

// ---------- Driver documents: submit once, then locked ----------
type DriverDocs = { license_path: string; car_photo_path: string; status: "pending" | "approved" | "rejected"; submitted_at: string };
const DOC_STATUS = {
  pending: { label: "Under review", pill: "Waiting for driver" },
  approved: { label: "Approved", pill: "Confirmed" },
  rejected: { label: "Rejected", pill: "Declined" },
} as const;

const PhotoSlot = ({ label, pic, url, pdf, hint, onPress }: { label: string; pic?: Picked | null; url?: string; pdf?: boolean; hint?: string; onPress?: () => void }) => {
  const isPdf = pdf || pic?.mime === "application/pdf";
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
      <T style={[s.muted, { marginBottom: 6 }]}>{label}</T>
      <View style={[s.card, { height: 110, padding: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" }]}>
        {isPdf ? (
          <>
            <FileText size={26} color={C.primary} />
            <T style={[s.muted, { marginTop: 6, paddingHorizontal: 8, textAlign: "center" }]} numberOfLines={2}>{pic?.name ?? "PDF document"}</T>
            {!pic && !!url && <T style={{ fontSize: 12, color: C.primary, marginTop: 4 }}>Tap to open</T>}
          </>
        ) : pic || url ? (
          <Image source={{ uri: pic?.uri ?? url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <>
            <Camera size={20} color={C.muted} />
            <T style={[s.muted, { marginTop: 6, textAlign: "center" }]}>{hint ?? "Tap to add"}</T>
          </>
        )}
      </View>
    </Pressable>
  );
};

// The driver's licence and a photo of the car. Once submitted they can't be changed or replaced
// (the database only allows an insert, see setup_storage.sql).
function DriverDocuments({ driverId }: { driverId: string }) {
  const [docs, setDocs] = useState<DriverDocs | null>(null);
  const [urls, setUrls] = useState<{ license?: string; car?: string }>({});
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState<Picked | null>(null);
  const [car, setCar] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("driver_documents").select("license_path, car_photo_path, status, submitted_at").eq("driver_id", driverId).maybeSingle();
    if (error) { setError(error.message); setLoading(false); return; }
    setDocs(data as DriverDocs | null);
    if (data) {
      const [l, c] = await Promise.all([
        supabase.storage.from("driver-docs").createSignedUrl(data.license_path, 3600),
        supabase.storage.from("driver-docs").createSignedUrl(data.car_photo_path, 3600),
      ]);
      setUrls({ license: l.data?.signedUrl, car: c.data?.signedUrl });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [driverId]);

  const send = async () => {
    if (!license || !car) return;
    setBusy(true); setError("");
    try {
      const stamp = Date.now();
      const lp = `${driverId}/license-${stamp}.${extOf(license.mime)}`;
      const cp = `${driverId}/car-${stamp}.${extOf(car.mime)}`;
      await uploadPhoto("driver-docs", lp, license);
      await uploadPhoto("driver-docs", cp, car);
      try { await uploadPhoto("car-photos", cp, car); } catch { /* the app copies it across later if this fails */ }
      const { error } = await supabase.from("driver_documents").insert({ driver_id: driverId, license_path: lp, car_photo_path: cp });
      if (error) throw new Error(error.message);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not submit your documents. Try again.");
    }
    setBusy(false);
  };

  const submit = () =>
    Alert.alert("Submit documents?", "You can't change or replace them after you submit. Check that both photos are clear and readable.", [
      { text: "Go back", style: "cancel" },
      { text: "Submit", onPress: send },
    ]);

  const pick = (set: (p: Picked) => void) => async () => { const p = await pickPhoto(); if (p) set(p); };

  return (
    <View>
      <Label>Verification documents</Label>
      {loading ? (
        <T style={s.muted}>Loading...</T>
      ) : docs ? (
        <View style={s.card}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
            <View style={s.row}>
              <Lock size={14} color={C.muted} />
              <T style={[s.muted, { marginLeft: 8 }]}>Submitted {fmtWhen(docs.submitted_at)}</T>
            </View>
            <T style={[s.booked, pillStyle(DOC_STATUS[docs.status].pill)]}>{DOC_STATUS[docs.status].label}</T>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <PhotoSlot label="Driver's licence" url={urls.license} pdf={docs.license_path.endsWith(".pdf")}
              onPress={docs.license_path.endsWith(".pdf") && urls.license ? () => Linking.openURL(urls.license!) : undefined} />
            <PhotoSlot label="Car photo" url={urls.car} />
          </View>
          <T style={[s.muted, { marginTop: 12, lineHeight: 17 }]}>
            Submitted documents can't be changed. {docs.status === "rejected" ? "Email" : "If something is wrong, email"} {SUPPORT_EMAIL}.
          </T>
        </View>
      ) : (
        <>
          <T style={[s.muted, { fontSize: 13, lineHeight: 19, marginBottom: 12 }]}>
            Upload a photo or PDF of your driver's licence and a clear photo of your car. You can only submit once, and they can't be changed afterwards.
          </T>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            <PhotoSlot label="Driver's licence" pic={license} hint="Tap to add photo or PDF" onPress={async () => { const p = await pickLicenseFile(); if (p) setLicense(p); }} />
            <PhotoSlot label="Car photo" pic={car} onPress={pick(setCar)} />
          </View>
          {!!error && <T style={{ color: C.danger, fontSize: 12, marginBottom: 12 }}>{error}</T>}
          <Pressable onPress={submit} disabled={busy || !license || !car} style={[s.primaryBtn, (busy || !license || !car) && { opacity: 0.5 }]}>
            <T style={s.primaryTxt}>{busy ? "Uploading..." : "Submit documents"}</T>
          </Pressable>
        </>
      )}
      {loading || !docs ? null : !!error && <T style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>{error}</T>}
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

  const fill = (r: DriverProfile | null) => {
    setName(r?.full_name ?? user?.name ?? "");
    setPhone(r?.phone ?? user?.phone ?? "");
    setVehicle(r?.vehicle ?? ""); setPlate(r?.plate ?? ""); setCarSeats(r?.car_seats ?? 3);
  };

  const load = async () => {
    setLoading(true); setError("");
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

  const edit = (setter: (t: string) => void) => setter;
  const locked = !!row; // details can't be changed once the driver has registered

  const validate = () => {
    if (!name.trim() || !phone.trim() || !vehicle.trim() || !plate.trim()) {
      setError("Please fill in every field.");
      return null;
    }
    return { full_name: name.trim(), phone: phone.trim(), vehicle: vehicle.trim(), plate: plate.trim().toUpperCase(), car_seats: carSeats };
  };

  // Asks the driver to double-check, because registered details can't be edited
  const register = () => {
    setError("");
    if (!validate()) return;
    Alert.alert("Confirm your details", "Your name, phone, vehicle, number plate and seats can't be changed after you register. Check that they are correct.", [
      { text: "Go back", style: "cancel" },
      { text: "Register", onPress: doRegister },
    ]);
  };

  const doRegister = async () => {
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

  const form = (
    <>
      <Field label="Full name" value={name} onChangeText={edit(setName)} editable={!locked} />
      <Field label="Phone number (riders see it once you accept them)" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" editable={!locked} />
      <Field label="Vehicle (e.g. Toyota Corolla)" value={vehicle} onChangeText={edit(setVehicle)} editable={!locked} />
      <Field label="Number plate" value={plate} onChangeText={edit(setPlate)} autoCapitalize="characters" editable={!locked} />
      <T style={[s.muted, { marginBottom: 8 }]}>Passenger seats in your car (max 3)</T>
      <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
        {[1, 2, 3].map((n) => (
          <Pressable key={n} disabled={locked} onPress={() => setCarSeats(n)} style={[s.dateChip, carSeats === n && s.dateChipOn, locked && carSeats !== n && { opacity: 0.4 }]}>
            <T style={[s.dateTxt, carSeats === n && { color: "#fff" }]}>{plural(n, "seat")}</T>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle={THEME === "dark" ? "light-content" : "dark-content"} />
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
                <View style={s.row}>
                  <Lock size={13} color={C.muted} />
                  <T style={[s.muted, { flex: 1, marginLeft: 8, lineHeight: 17 }]}>
                    Your details are locked and can't be changed. To correct a mistake, email {SUPPORT_EMAIL}.
                  </T>
                </View>
                <View style={{ height: 28 }} />
                <DriverDocuments driverId={row.id} />
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
  const [docStatus, setDocStatus] = useState<"none" | "pending" | "approved" | "rejected" | null>(null); // null = still checking

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
  const [chat, setChat] = useState<{ id: string; title: string } | null>(null);
  const [sharingTrip, setSharingTrip] = useState<string | null>(null); // the trip whose location is being shared
  useShareLocation(sharingTrip);

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id;
    if (!id) return;
    const [p, t, r, dd] = await Promise.all([
      supabase.from("drivers").select(DRIVER_COLS).eq("id", id).maybeSingle(),
      supabase.from("trips").select("*, bookings(*)").eq("driver_id", id).order("depart_at", { ascending: true }),
      supabase.from("trip_requests").select("id, origin, destination, travel_date, seats, rider_name")
        .eq("status", "open").neq("rider_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("driver_documents").select("status, car_photo_path").eq("driver_id", id).maybeSingle(),
    ]);
    if (!dd.error) setDocStatus(dd.data ? (dd.data.status as "pending" | "approved" | "rejected") : "none");
    if (dd.data?.car_photo_path) healCarPhoto(dd.data.car_photo_path);
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

  const approved = docStatus === "approved";
  const notApprovedMsg = docStatus === "pending" ? "Your documents are still under review. You can post trips once they are approved."
    : docStatus === "rejected" ? `Your documents were rejected, so you can't post trips. Email ${SUPPORT_EMAIL} for help.`
    : docStatus === "none" ? "Submit your driver's licence and car photo (Account → Be a driver). You can post trips once they are approved."
    : "Checking your approval status. Try again in a moment.";

  const openPost = (req?: TripRequest) => {
    if (!approved) return Alert.alert("Approval needed", notApprovedMsg);
    if (hasOpenTrip) return Alert.alert(ONE_TRIP_TITLE, ONE_TRIP_MSG);
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
    if (!approved) return setFormError(notApprovedMsg);
    if (hasOpenTrip) return setFormError(ONE_TRIP_MSG);
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

  // Stop sharing automatically once the trip is completed or cancelled
  useEffect(() => {
    if (sharingTrip && !trips.some((t) => t.id === sharingTrip && t.status === "open")) setSharingTrip(null);
  }, [trips]);

  const startSharing = async (t: MyTrip) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return Alert.alert("Location needed", "Allow location access in your phone's settings so riders can see you coming.");
    setSharingTrip(t.id);
    Alert.alert("Riders can see you now", "Keep the app open and your screen on while you drive to the pickup. Tap Stop when you've picked everyone up.");
  };
  const stopSharing = async (t: MyTrip) => {
    setSharingTrip(null);
    await supabase.rpc("stop_sharing_location", { p_trip: t.id });
  };

  const openTrips = trips.filter((t) => t.status === "open");
  const hasOpenTrip = openTrips.length > 0; // one trip at a time: finish or cancel it before posting another
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
                <T style={{ fontSize: 12, color: C.muted }}>Details</T>
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

          {!approved && (
            <View style={[s.row, s.notice, { marginTop: 0, marginBottom: 16, borderColor: "rgba(245,158,11,0.35)", alignItems: "flex-start" }]}>
              <AlertCircle size={16} color={C.amber} style={{ marginTop: 2 }} />
              <T style={{ flex: 1, marginLeft: 12, lineHeight: 19 }}>{notApprovedMsg}</T>
            </View>
          )}
          <Pressable onPress={() => openPost()} style={[s.primaryBtn, { flexDirection: "row", marginBottom: hasOpenTrip ? 8 : 24 }, (hasOpenTrip || !approved) && { opacity: 0.45 }]}>
            <Plus size={16} color="#fff" />
            <T style={[s.primaryTxt, { marginLeft: 8 }]}>Post a trip</T>
          </Pressable>
          {hasOpenTrip && (
            <T style={[s.muted, { fontSize: 12, lineHeight: 17, marginBottom: 24 }]}>
              You have a trip open. Mark it completed (or cancel it) to post another.
            </T>
          )}

          {requests.length > 0 && (
            <>
              <Label>Riders are asking for</Label>
              {requests.map((r) => (
                <View key={r.id} style={[s.card, s.row, { marginBottom: 8, justifyContent: "space-between" }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <T style={{ fontWeight: "500" }} numberOfLines={1}>{r.origin || "Anywhere"} → {r.destination}</T>
                    <T style={s.muted}>{requestWhen(r)} · {plural(r.seats, "seat")}</T>
                  </View>
                  <Pressable onPress={() => openPost(r)} style={[s.cancelPill, { borderColor: "rgba(37,99,235,0.4)" }, (hasOpenTrip || !approved) && { opacity: 0.4 }]}>
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
                          {plural(b.seats, "seat")} · {payName(b.payment_method)}{b.status === "accepted" && b.rider_phone ? ` · ${b.rider_phone}` : ""}
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
                        <View style={[s.row, { gap: 8 }]}>
                          <Pressable onPress={() => setChat({ id: b.id, title: b.rider_name })} style={s.roundBtn}>
                            <MessageCircle size={16} color={C.primary} />
                          </Pressable>
                          <T style={[s.booked, { color: C.green, backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" }]}>Confirmed</T>
                        </View>
                      )}
                    </View>
                  );
                })}

                {reqs.some((b) => b.status === "accepted") && (
                  sharingTrip === t.id ? (
                    <View style={[s.row, { justifyContent: "space-between", marginTop: 12 }]}>
                      <View style={[s.row, { flex: 1, paddingRight: 8 }]}>
                        <Navigation size={14} color={C.green} />
                        <T style={{ color: C.green, marginLeft: 8, flexShrink: 1 }}>Riders can see you coming</T>
                      </View>
                      <Pressable onPress={() => stopSharing(t)} style={s.cancelPill}>
                        <T style={{ fontSize: 12, color: C.danger }}>Stop</T>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => startSharing(t)} style={[s.primaryBtn, { flexDirection: "row", marginTop: 12, paddingVertical: 10 }]}>
                      <Navigation size={14} color="#fff" />
                      <T style={[s.primaryTxt, { marginLeft: 8 }]}>I'm on my way</T>
                    </Pressable>
                  )
                )}

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
      <ChatModal bookingId={chat?.id ?? null} title={chat?.title ?? ""} onClose={() => setChat(null)} />
    </ScrollView>
  );
}

// ---------- Welcome screen (shown first) ----------
function WelcomeScreen({ onLogin, onSignup, onGuest }: { onLogin: () => void; onSignup: () => void; onGuest: () => void }) {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Image
          source={THEME === "dark" ? LOGO_DARK : LOGO_LIGHT}
          style={{ width: 150, height: 150 }}
          resizeMode="contain"
        />

        <T style={[s.muted, { fontSize: 14, marginTop: 8 }]}> ride sharing platform, door to door</T>
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
  car_photo_path?: string | null; car_photo_url?: string | null; // car photo of an approved driver
};

// A driver's profile photo lives in the public "avatars" bucket at <id>/avatar (see resolveAvatar / Avatar above)

// Car photos for riders live in their own PUBLIC bucket "car-photos", separate from the private "driver-docs" bucket that holds licences.
// Which car photo belongs to which APPROVED driver (separate view, so the main trips list never depends on it)
const carPathCache: Record<string, string | null> = {};
async function loadCarPaths(driverIds: string[]) {
  const need = driverIds.filter((id) => !(id in carPathCache));
  if (!need.length) return;
  try {
    const { data, error } = await supabase.from("approved_car_photos").select("driver_id, car_photo_path").in("driver_id", need);
    if (error) return;
    need.forEach((id) => { carPathCache[id] = null; });
    (data ?? []).forEach((r: any) => { carPathCache[r.driver_id] = r.car_photo_path; });
  } catch { /* photos are optional, the list still works without them */ }
}
const carPhotoUrl = (path?: string | null) => (path ? supabase.storage.from("car-photos").getPublicUrl(path).data.publicUrl : null);

// Drivers who submitted before the public bucket existed: copy their car photo across once (the driver's own phone does it).
const carHealed = new Set<string>();
async function healCarPhoto(path: string) {
  if (carHealed.has(path)) return;
  carHealed.add(path);
  try {
    const url = carPhotoUrl(path)!;
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return;
    const { data } = await supabase.storage.from("driver-docs").createSignedUrl(path, 120);
    if (!data?.signedUrl) return;
    const bytes = await (await fetch(data.signedUrl)).arrayBuffer();
    await supabase.storage.from("car-photos").upload(path, bytes, { contentType: path.endsWith(".png") ? "image/png" : "image/jpeg" });
  } catch { carHealed.delete(path); }
}

// Small rounded-square car picture (falls back to a car icon)
function CarThumb({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  return (
    <View style={s.carThumb}>
      {uri && !failed
        ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onError={() => setFailed(true)} />
        : <Car size={22} color={C.muted} />}
    </View>
  );
}

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
        car_photo_url: carPhotoUrl(carPathCache[r.driver_id]),
      }));
      // Trips with free seats first, then by departure time
      rows.sort((a, b) => (b.seats_left > 0 ? 1 : 0) - (a.seats_left > 0 ? 1 : 0) || new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
      setTrips(rows);
      // Photos load after the list is already on screen; a failure here never hides trips
      loadCarPaths(Array.from(new Set(rows.map((r) => r.driver_id)))).then(() => {
        if (!cancelled) setTrips((cur) => cur.map((r) => ({ ...r, car_photo_url: carPhotoUrl(carPathCache[r.driver_id]) })));
      });
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
  const { settings } = React.useContext(SettingsCtx);
  const [seats, setSeats] = useState(1);
  const [pay, setPay] = useState<PayMethod>(settings.payment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const left = trip?.seats_left ?? 0;

  useEffect(() => { setSeats(1); setError(""); setPay(settings.payment); }, [trip?.id]);
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
    if (error) { setBusy(false); return setError(error.message); }
    await supabase.rpc("set_booking_payment", { p_trip: trip.id, p_method: pay }); // saves how you plan to pay (cash by default)
    setBusy(false);
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
              <Avatar userId={trip.driver_id} initial={initialsOf(trip.driver_name)[0] ?? "?"} size={52} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <T style={{ fontWeight: "500" }} numberOfLines={1}>{trip.driver_name}</T>
                <View style={[s.row, { marginTop: 2 }]}>
                  <Star size={10} color={C.primary} fill={C.primary} />
                  <T style={[s.muted, { marginLeft: 4 }]}>{trip.driver_trips === 0 ? "New driver" : `${trip.rating.toFixed(1)} · ${plural(trip.driver_trips, "trip")}`}</T>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <CarThumb uri={trip.car_photo_url} />
                <T mono style={[s.muted, s.plate]}>{trip.plate}</T>
              </View>
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

            {left > 0 && (
              <View style={{ marginTop: 16 }}>
                <T style={[s.muted, { marginBottom: 8 }]}>Pay with</T>
                <PaymentOptions compact value={pay} onChange={setPay} />
                <T style={[s.muted, { fontSize: 12, marginTop: 8 }]}>
                  {pay === "cash" ? "You pay the driver in cash when you travel. Card and EFT are coming soon." : "Online payment is coming soon."}
                </T>
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
        <CarThumb uri={t.car_photo_url} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={s.row}>
            <Avatar userId={t.driver_id} initial={initialsOf(t.driver_name)[0] ?? "?"} size={24} />
            <T style={{ fontWeight: "500", marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{t.driver_name}</T>
          </View>
          <View style={[s.row, { marginTop: 4 }]}>
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
      origin: from.trim() ? canon(from) : null, // same spelling drivers use, so a posted trip can match it
      destination: canon(to),
      travel_date: day ? `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}` : null,
      seats: reqSeats,
    });
    setReqBusy(false);
    if (error) return Alert.alert("Could not send request", error.message);
    Alert.alert("Request saved", "It's in your Activity tab under Upcoming. You'll see an update there as soon as a driver posts this trip.", [
      { text: "Stay here", style: "cancel" },
      { text: "View Activity", onPress: onRequested },
    ]);
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
              <TextInput keyboardAppearance={THEME} value={from} onChangeText={setFrom} onFocus={() => setFocus("from")} placeholder="Leaving from (optional)"
                placeholderTextColor={C.muted} style={s.input} />
              {!!from && <Pressable onPress={() => setFrom("")}><X size={13} color={C.muted} /></Pressable>}
            </View>
            <View style={[s.row, s.inputRow]}>
              <View style={[s.dot, { borderRadius: 2, backgroundColor: C.fgSoft }]} />
              <TextInput keyboardAppearance={THEME} autoFocus value={to} onChangeText={setTo} onFocus={() => setFocus("to")} placeholder="Where are you going?"
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

// A trip the rider asked for. It waits in Upcoming until a driver posts it, then becomes an update.
type MyRequest = {
  id: string; origin: string | null; destination: string; travel_date: string | null; seats: number;
  status: "open" | "fulfilled" | "cancelled"; created_at: string; fulfilled_at: string | null; seen_at: string | null;
  depart_at: string | null; price: number | null; driver_name: string | null; vehicle: string | null;
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
  const [chat, setChat] = useState<{ id: string; title: string } | null>(null);
  const [track, setTrack] = useState<MyBooking | null>(null);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [pays, setPays] = useState<Record<string, string>>({});
  const knownUpdates = React.useRef<Set<string> | null>(null);

  const load = async () => {
    if (!user?.id) { setBookings([]); setRequests([]); return; }
    const [b, r, p] = await Promise.all([
      supabase.from("rider_bookings").select("*").order("depart_at", { ascending: true }),
      supabase.from("my_trip_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("bookings").select("id, payment_method"),
    ]);
    if (b.error) setError(b.error.message);
    else { setError(""); setBookings((b.data ?? []) as MyBooking[]); }
    if (!r.error) {
      const rows = (r.data ?? []) as MyRequest[];
      setRequests(rows);
      // Tell the rider the moment a driver posts a trip they asked for
      const fresh = rows.filter((x) => x.status === "fulfilled" && !x.seen_at);
      if (knownUpdates.current) {
        const added = fresh.filter((x) => !knownUpdates.current!.has(x.id));
        if (added.length > 0) Alert.alert("A driver posted your trip", `${added[0].origin || "Anywhere"} → ${added[0].destination}`);
      }
      knownUpdates.current = new Set(fresh.map((x) => x.id));
    }
    if (!p.error) setPays(Object.fromEntries(((p.data ?? []) as { id: string; payment_method: string }[]).map((x) => [x.id, x.payment_method])));
  };

  const dismissUpdate = async (id: string) => {
    await supabase.rpc("mark_request_seen", { p_request: id });
    await load();
  };
  const cancelRequest = (id: string) =>
    Alert.alert("Cancel this request?", "Drivers will no longer see it.", [
      { text: "Keep request", style: "cancel" },
      {
        text: "Cancel request", style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("cancel_trip_request", { p_request: id });
          if (error) Alert.alert("Could not cancel", error.message);
          await load();
        },
      },
    ]);

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
  const openRequests = requests.filter((r) => r.status === "open");
  const updates = requests.filter((r) => r.status === "fulfilled" && !r.seen_at);
  const pastRequests = requests.filter((r) => r.status === "cancelled" || (r.status === "fulfilled" && !!r.seen_at));

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

            {updates.length > 0 && (
              <>
                <Label>Updates</Label>
                {updates.map((r) => (
                  <View key={r.id} style={[s.card, { marginBottom: 12, borderColor: "rgba(74,222,128,0.35)" }]}>
                    <View style={[s.row, { marginBottom: 6 }]}>
                      <CheckCircle size={14} color={C.green} />
                      <T style={{ fontWeight: "600", marginLeft: 8 }}>A driver posted your trip</T>
                    </View>
                    <T style={{ fontWeight: "500" }} numberOfLines={1}>{r.origin || "Anywhere"} → {r.destination}</T>
                    <T mono style={[s.muted, { marginTop: 2 }]}>
                      {r.depart_at ? fmtWhen(r.depart_at) : requestWhen(r)}{r.price != null ? ` · R${r.price} per seat` : ""}
                    </T>
                    <View style={[s.row, s.cardFoot, { marginTop: 12 }]}>
                      <Pressable onPress={() => dismissUpdate(r.id)} style={s.cancelPill}>
                        <T style={{ fontSize: 12, color: C.muted }}>Dismiss</T>
                      </Pressable>
                      <Pressable
                        onPress={() => { dismissUpdate(r.id); startBooking({ pickup: r.origin ?? "", dest: r.destination }); }}
                        style={[s.cancelPill, { borderColor: "rgba(37,99,235,0.4)" }]}
                      >
                        <T style={{ fontSize: 12, color: C.primary }}>Book a seat</T>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View style={{ height: 12 }} />
              </>
            )}

            <Label>Upcoming rides</Label>
            {upcoming.length === 0 && openRequests.length === 0 && (
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
                      <T mono style={[s.muted, { marginTop: 2 }]}>{plural(b.seats, "seat")} · {money(b.price, b.seats)}{pays[b.booking_id] ? ` · ${payName(pays[b.booking_id])}` : ""}</T>
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
                  {b.status === "accepted" && (
                    <View style={[s.row, { gap: 8, marginTop: 12 }]}>
                      <Pressable onPress={() => setTrack(b)} style={[s.primaryBtn, { flex: 1, flexDirection: "row", paddingVertical: 10 }]}>
                        <Navigation size={14} color="#fff" />
                        <T style={[s.primaryTxt, { marginLeft: 6 }]}>Track driver</T>
                      </Pressable>
                      <Pressable
                        onPress={() => setChat({ id: b.booking_id, title: b.driver_name })}
                        style={[s.primaryBtn, { flex: 1, flexDirection: "row", paddingVertical: 10, backgroundColor: C.secondary, borderWidth: 1, borderColor: C.border }]}
                      >
                        <MessageCircle size={14} color={C.fg} />
                        <T style={[s.primaryTxt, { marginLeft: 6, color: C.fg }]}>Message</T>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {openRequests.map((r) => (
              <View key={r.id} style={[s.card, { marginBottom: 12 }]}>
                <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={[s.row, { marginBottom: 4 }]}>
                      <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{r.origin || "Anywhere"}</T>
                      <ArrowRight size={13} color={C.primary} style={{ marginHorizontal: 8 }} />
                      <T style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{r.destination}</T>
                    </View>
                    <T mono style={s.muted}>{requestWhen(r)} · {plural(r.seats, "seat")}</T>
                  </View>
                  <T style={[s.booked, pillStyle("Waiting for driver")]}>Request sent</T>
                </View>
                <View style={[s.row, s.cardFoot]}>
                  <T style={[s.muted, { flex: 1, paddingRight: 8, lineHeight: 17 }]}>Waiting for a driver to post this trip. We'll update you here.</T>
                  <Pressable onPress={() => cancelRequest(r.id)} style={s.cancelPill}>
                    <T style={{ fontSize: 12, color: C.danger }}>Cancel</T>
                  </Pressable>
                </View>
              </View>
            ))}

            <Label>History</Label>
            {history.length === 0 && pastRequests.length === 0 && <T style={s.muted}>{loading ? "" : "Completed, declined and cancelled rides show up here."}</T>}
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
            {pastRequests.map((r) => (
              <View key={r.id} style={[s.card, { marginBottom: 12 }]}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                  <View style={[s.row, { flex: 1, paddingRight: 8 }]}>
                    {r.status === "fulfilled" ? <CheckCircle size={14} color={C.primary} /> : <X size={14} color={C.muted} />}
                    <T style={{ fontWeight: "500", marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{r.origin || "Anywhere"}</T>
                    <ArrowRight size={12} color={C.muted} style={{ marginHorizontal: 6 }} />
                    <T style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>{r.destination}</T>
                  </View>
                </View>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <T mono style={s.muted}>{requestWhen(r)} · {r.status === "fulfilled" ? "Driver posted this trip" : "Request cancelled"}</T>
                  {r.status === "fulfilled" && (
                    <Pressable onPress={() => startBooking({ pickup: r.origin ?? "", dest: r.destination })} style={s.row}>
                      <RotateCcw size={11} color={C.primary} />
                      <T style={{ fontSize: 12, color: C.primary, marginLeft: 4 }}>Find rides</T>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <TrackModal
        booking={track}
        onClose={() => setTrack(null)}
        onMessage={(b) => { setTrack(null); setTimeout(() => setChat({ id: b.booking_id, title: b.driver_name }), 400); }}
      />
      <ChatModal bookingId={chat?.id ?? null} title={chat?.title ?? ""} onClose={() => setChat(null)} />
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
  const [settingsOpen, setSettingsOpen] = useState(() => KEEP_SETTINGS_OPEN);
  const [payOpen, setPayOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const INFO_PAGES = ["Safety", "Help", "Legal", "Contact us", "About us"];
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}>
      <Pressable onPress={user ? () => setManageOpen(true) : openAuth} style={[s.row, { paddingHorizontal: 16, marginBottom: 24 }]}>
        {user ? (
          <Avatar userId={user.id} initial={user.name[0]?.toUpperCase() ?? "?"} size={64} />
        ) : (
          <View style={[s.avatar, { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: "rgba(37,99,235,0.3)" }]}>
            <User size={26} color={C.primary} />
          </View>
        )}
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
            if (label === "Payment methods") setPayOpen(true);
            if (INFO_PAGES.includes(label)) setInfo(label);
            if (label === "Be a driver") {
              user ? openDriver() : Alert.alert("Sign in to drive", "Create an account or log in to become a driver.", [
                { text: "Not now", style: "cancel" },
                { text: "Sign in", onPress: () => openAuth() },
              ]);
            }
          }} style={[s.row, s.menuItem, label === "Be a driver" && { marginTop: 16, borderTopWidth: 1, borderTopColor: C.border }]}>
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
      <PaymentModal visible={payOpen} onClose={() => setPayOpen(false)} />
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
  useEffect(() => {
    // Makes native alerts, the keyboard and system dialogs follow the in-app choice
    Appearance.setColorScheme(settings.theme === "system" ? "unspecified" : settings.theme);
  }, [settings.theme]);
  
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
        <SafeAreaView key={themeName} style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP }}>
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
  carThumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
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