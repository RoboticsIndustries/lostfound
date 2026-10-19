import React, { useEffect, useState } from 'react';
import { Platform, SafeAreaView, View, Text, TextInput, Pressable, FlatList, Image, ScrollView, Alert, StyleSheet, Switch, Modal, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { RecordModel } from 'pocketbase';
import { pb, initServer, saveServer, forgetServer, errMsg, photoUrl, CATEGORIES, Item, Report, Claim, Role, SchoolInfo } from './lib/pb';

// Alert pop-ups are a no-op on web; route them to window.alert so errors are visible.
if (Platform.OS === 'web') {
  Alert.alert = ((title: string, msg?: string) =>
    window.alert([title, msg].filter(Boolean).join('\n\n'))) as typeof Alert.alert;
}
const fail = (e: unknown) => Alert.alert(errMsg(e));

type Tab = 'browse' | 'lost' | 'log' | 'claims' | 'school';

export default function App() {
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [user, setUser] = useState<RecordModel | null>(null);

  const start = async () => {
    setReady(false);
    const ok = await initServer();
    setConnected(ok);
    if (ok) {
      pb.authStore.onChange(() => setUser(pb.authStore.record));
      try {
        setInfo(await pb.send('/api/lf/info', {}));
        // Pick up role changes made by an admin since last time.
        if (pb.authStore.isValid) await pb.collection('users').authRefresh().catch(() => pb.authStore.clear());
      } catch (e) { fail(e); }
      setUser(pb.authStore.record);
    }
    setReady(true);
  };
  useEffect(() => { start(); }, []);

  if (!ready) return <SafeAreaView style={[s.root, s.center]}><ActivityIndicator /></SafeAreaView>;
  if (!connected) return <Connect onDone={start} />;
  if (!info) return <SafeAreaView style={s.root}><Text style={s.title}>Lost & Found</Text><Btn label="Try again" onPress={start} /></SafeAreaView>;
  if (info.needsSetup) return <Setup onDone={start} />;
  if (!user) return <Auth info={info} onChangeServer={async () => { await forgetServer(); start(); }} />;
  return <Main key={user.id} user={user} info={info} />;
}

function Main({ user, info }: { user: RecordModel; info: SchoolInfo }) {
  const [tab, setTab] = useState<Tab>('browse');
  const role = user.role as Role;
  const staff = role === 'staff' || role === 'admin';
  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>{info.schoolName} Lost & Found</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 6 }} contentContainerStyle={s.tabs}>
        <TabBtn label="Browse" on={tab === 'browse'} onPress={() => setTab('browse')} />
        <TabBtn label="I lost something" on={tab === 'lost'} onPress={() => setTab('lost')} />
        {staff && <TabBtn label="Log item" on={tab === 'log'} onPress={() => setTab('log')} />}
        {staff && <TabBtn label="Claims" on={tab === 'claims'} onPress={() => setTab('claims')} />}
        {role === 'admin' && <TabBtn label="School" on={tab === 'school'} onPress={() => setTab('school')} />}
      </ScrollView>
      <View style={{ flex: 1, minHeight: 0 }}>
        {tab === 'browse' && <Browse />}
        {tab === 'lost' && <LostReport />}
        {tab === 'log' && staff && <LogItem />}
        {tab === 'claims' && staff && <Claims />}
        {tab === 'school' && role === 'admin' && <School info={info} me={user.id} />}
      </View>
      <Pressable onPress={() => pb.authStore.clear()} style={s.footer}><Text style={s.link}>Sign out ({user.email})</Text></Pressable>
    </SafeAreaView>
  );
}

// ---------- Getting connected ----------

function Connect({ onDone }: { onDone: () => void }) {
  const [addr, setAddr] = useState('');
  const go = async () => {
    try { await saveServer(addr); onDone(); } catch (e) { fail(e); }
  };
  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>Lost & Found</Text>
      <Text style={s.muted}>Enter your school's Lost & Found address. Your school admin can find it on the School tab.</Text>
      <TextInput style={s.input} placeholder="e.g. 192.168.1.20:8090" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={addr} onChangeText={setAddr} />
      <Btn label="Connect" onPress={go} />
    </SafeAreaView>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [school, setSchool] = useState('');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const go = async () => {
    try {
      await pb.send('/api/lf/setup', { method: 'POST', body: { schoolName: school, emailDomain: domain, email, password } });
      await pb.collection('users').authWithPassword(email, password);
      onDone();
    } catch (e) { fail(e); }
  };
  return (
    <SafeAreaView style={s.root}>
      <ScrollView>
        <Text style={s.title}>Set up Lost & Found</Text>
        <Text style={s.muted}>This is a new install. You'll be the admin.</Text>
        <TextInput style={s.input} placeholder="School or team name" value={school} onChangeText={setSchool} />
        <TextInput style={s.input} placeholder="School email domain, e.g. myschool.org (optional)" autoCapitalize="none" value={domain} onChangeText={setDomain} />
        <Text style={s.muted}>Anyone with an email at this domain can join as a student. Everyone else needs an invite code, which you'll get next.</Text>
        <TextInput style={s.input} placeholder="Your email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} />
        <Btn label="Create school" onPress={go} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Auth({ info, onChangeServer }: { info: SchoolInfo; onChangeServer: () => void }) {
  const [signUp, setSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const go = async () => {
    try {
      if (signUp) await pb.collection('users').create({ email, password, passwordConfirm: password, inviteCode: code });
      await pb.collection('users').authWithPassword(email, password);
    } catch (e) { fail(e); }
  };
  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>{info.schoolName} Lost & Found</Text>
      <TextInput style={s.input} placeholder={info.emailDomain ? `you@${info.emailDomain}` : 'Email'} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder={signUp ? 'Choose a password (8+ characters)' : 'Password'} secureTextEntry value={password} onChangeText={setPassword} />
      {signUp && <>
        <TextInput style={s.input} placeholder="Invite code" autoCapitalize="characters" value={code} onChangeText={setCode} />
        <Text style={s.muted}>{info.emailDomain
          ? `Not needed if you use your @${info.emailDomain} email. Staff: use the staff code.`
          : 'Ask your school admin for a code. Staff get a separate staff code.'}</Text>
      </>}
      <Btn label={signUp ? 'Create account' : 'Sign in'} onPress={go} />
      <Btn label={signUp ? 'I already have an account' : 'Create account'} onPress={() => setSignUp(!signUp)} ghost />
      {Platform.OS !== 'web' && <Pressable onPress={onChangeServer}><Text style={s.link}>Change school</Text></Pressable>}
    </SafeAreaView>
  );
}

// ---------- Everyone ----------

const fetchItems = (query: Record<string, string> = {}) => pb.send<Item[]>('/api/lf/items', { query });

function Browse() {
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setItems(await fetchItems(cat ? { category: cat } : {})); } catch (e) { fail(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [cat]);
  return (
    <View style={{ flex: 1 }}>
      <Chips value={cat} onChange={setCat} allowAll />
      <FlatList data={items} keyExtractor={(i) => i.id} onRefresh={load} refreshing={loading}
        ListEmptyComponent={<Text style={s.muted}>{loading ? 'Loading…' : 'No items yet.'}</Text>}
        renderItem={({ item }) => <ItemCard item={item} />} />
    </View>
  );
}

function ItemCard({ item }: { item: Item }) {
  const [claiming, setClaiming] = useState(false);
  const [answer, setAnswer] = useState('');
  const url = photoUrl(item);
  const send = async () => {
    if (!answer.trim()) return Alert.alert('Describe a detail only the owner would know.');
    try {
      await pb.collection('claims').create({ item: item.id, verification_answer: answer.trim() });
      setClaiming(false); setAnswer('');
      Alert.alert('Claim sent! Staff will check it and let you know.');
    } catch (e) { fail(e); }
  };
  return (
    <View style={s.card}>
      {url ? <Image source={{ uri: url }} style={s.photo} /> : <View style={[s.photo, s.noPhoto]}><Text>{item.is_valuable ? '🔒' : '📦'}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{item.color ? `${item.color} ` : ''}{item.category}</Text>
        <Text style={s.muted}>{item.description || (item.is_valuable ? 'Valuable item. Describe it to claim.' : '')}</Text>
        <Text style={s.muted}>Found {item.created.slice(0, 10)}{item.location_found ? ` · ${item.location_found}` : ''}</Text>
        <Pressable onPress={() => setClaiming(true)}><Text style={s.link}>This is mine</Text></Pressable>
      </View>
      <Modal visible={claiming} transparent animationType="fade" onRequestClose={() => setClaiming(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.cardTitle}>Claim this {item.category.toLowerCase()}</Text>
            <Text style={s.muted}>Describe a detail only the owner would know: a sticker, a name inside, what's on the lock screen.</Text>
            <TextInput style={s.input} value={answer} onChangeText={setAnswer} multiline autoFocus />
            <Btn label="Send claim" onPress={send} />
            <Btn label="Cancel" onPress={() => setClaiming(false)} ghost />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// When the item was lost → how far back to look for matching found items.
const WHEN = [['Today', 0], ['Yesterday', 1], ['This week', 7], ['Earlier', 30]] as const;
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function LostReport() {
  const [cat, setCat] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [desc, setDesc] = useState('');
  const [when, setWhen] = useState<number>(0);
  const [reports, setReports] = useState<Report[]>([]);
  const load = () => pb.collection('reports').getFullList<Report>({ filter: pb.filter("status = 'open' && user = {:u}", { u: pb.authStore.record!.id }), sort: '-created' })
    .then(setReports, fail);
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!cat) return Alert.alert('Pick a category');
    try {
      await pb.collection('reports').create({ category: cat, color: color.trim(), description: desc, date_lost: daysAgo(when) });
      setCat(null); setColor(''); setDesc(''); setWhen(0);
      load();
    } catch (e) { fail(e); }
  };
  const close = async (r: Report) => {
    try { await pb.collection('reports').update(r.id, { status: 'closed' }); load(); } catch (e) { fail(e); }
  };
  return (
    <ScrollView>
      <Chips value={cat} onChange={setCat} />
      <TextInput style={s.input} placeholder="Color (e.g. blue)" value={color} onChangeText={setColor} />
      <TextInput style={s.input} placeholder="Describe it" value={desc} onChangeText={setDesc} multiline />
      <Text style={s.label}>When did you lose it?</Text>
      <View style={s.wrap}>
        {WHEN.map(([label, n]) => (
          <Pressable key={label} onPress={() => setWhen(n)} style={[s.chip, when === n && s.chipOn]}>
            <Text style={when === n ? { color: '#fff' } : undefined}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Btn label="Report & find matches" onPress={submit} />
      {reports.map((r) => <ReportMatches key={r.id} report={r} onClose={() => close(r)} />)}
    </ScrollView>
  );
}

// Matches are looked up fresh every time, so items logged after the report show up too.
function ReportMatches({ report, onClose }: { report: Report; onClose: () => void }) {
  const [matches, setMatches] = useState<Item[] | null>(null);
  useEffect(() => {
    fetchItems({ category: report.category, color: report.color, since: report.date_lost.slice(0, 10) }).then(setMatches, fail);
  }, [report.id]);
  return (
    <View style={s.section}>
      <View style={s.row}>
        <Text style={s.cardTitle}>Your lost {report.color ? `${report.color} ` : ''}{report.category.toLowerCase()}</Text>
        <Pressable onPress={onClose}><Text style={s.link}>Got it back</Text></Pressable>
      </View>
      {matches === null ? <ActivityIndicator /> : matches.length
        ? matches.map((m) => <ItemCard key={m.id} item={m} />)
        : <Text style={s.muted}>No matches yet. Check back here: new items are matched as staff log them.</Text>}
    </View>
  );
}

// ---------- Staff ----------

function LogItem() {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [desc, setDesc] = useState('');
  const [loc, setLoc] = useState('');
  const [valuable, setValuable] = useState(false);
  const [busy, setBusy] = useState(false);

  const snap = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const save = async () => {
    if (busy) return;
    if (!cat) return Alert.alert('Pick a category');
    setBusy(true);
    const f = new FormData();
    f.append('category', cat);
    f.append('color', color.trim());
    f.append('description', desc);
    f.append('location_found', loc);
    f.append('is_valuable', String(valuable));
    // Web gives a File; phones upload by file URI.
    if (photo) f.append('photo', photo.file ?? ({ uri: photo.uri, name: photo.fileName ?? 'photo.jpg', type: photo.mimeType ?? 'image/jpeg' } as unknown as Blob));
    try {
      await pb.collection('items').create(f);
      Alert.alert('Logged!');
      setPhoto(null); setCat(null); setColor(''); setDesc(''); setLoc(''); setValuable(false);
    } catch (e) { fail(e); }
    setBusy(false);
  };

  return (
    <ScrollView>
      <Pressable onPress={snap} style={[s.photoBig, s.noPhoto]}>
        {photo ? <Image source={{ uri: photo.uri }} style={s.photoBig} /> : <Text>📷 Tap to take photo</Text>}
      </Pressable>
      <Chips value={cat} onChange={setCat} />
      <TextInput style={s.input} placeholder="Color" value={color} onChangeText={setColor} />
      <TextInput style={s.input} placeholder="Description" value={desc} onChangeText={setDesc} />
      <TextInput style={s.input} placeholder="Where found (e.g. Gym)" value={loc} onChangeText={setLoc} />
      <View style={s.row}><Text>Valuable (hide photo and details from students)</Text><Switch value={valuable} onValueChange={setValuable} /></View>
      <Btn label={busy ? 'Saving…' : 'Save item'} onPress={save} disabled={busy} />
    </ScrollView>
  );
}

function Claims() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const load = () => pb.collection('claims').getFullList<Claim>({ filter: "status = 'pending'", sort: 'created', expand: 'item,user' })
    .then(setClaims, fail);
  useEffect(() => { load(); }, []);
  const decide = async (c: Claim, status: 'approved' | 'rejected') => {
    try { await pb.collection('claims').update(c.id, { status }); load(); } catch (e) { fail(e); }
  };
  if (!claims) return <ActivityIndicator />;
  return (
    <FlatList data={claims} keyExtractor={(c) => c.id} onRefresh={load} refreshing={false}
      ListEmptyComponent={<Text style={s.muted}>No claims waiting.</Text>}
      renderItem={({ item: c }) => {
        const it = c.expand?.item;
        const url = it && photoUrl(it);
        return (
          <View style={s.section}>
            <View style={s.card}>
              {url ? <Image source={{ uri: url }} style={s.photo} /> : <View style={[s.photo, s.noPhoto]}><Text>📦</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{it ? `${it.color ? `${it.color} ` : ''}${it.category}` : 'Item'}</Text>
                {!!it?.description && <Text style={s.muted}>{it.description}</Text>}
                <Text style={s.muted}>Claimed by {c.expand?.user?.email ?? 'unknown'}</Text>
              </View>
            </View>
            <Text style={s.label}>Their answer</Text>
            <Text>{c.verification_answer}</Text>
            <View style={s.row}>
              <Btn label="Approve & hand over" onPress={() => decide(c, 'approved')} />
              <Btn label="Reject" onPress={() => decide(c, 'rejected')} ghost />
            </View>
          </View>
        );
      }} />
  );
}

// ---------- Admin ----------

type SchoolSettings = { schoolName: string; emailDomain: string; joinCode: string; staffCode: string };

function School({ info, me }: { info: SchoolInfo; me: string }) {
  const [st, setSt] = useState<SchoolSettings | null>(null);
  const [users, setUsers] = useState<RecordModel[]>([]);
  const load = () => {
    pb.send<SchoolSettings>('/api/lf/school', {}).then(setSt, fail);
    pb.collection('users').getFullList({ sort: 'email' }).then(setUsers, fail);
  };
  useEffect(() => { load(); }, []);
  const update = async (body: object) => {
    try { await pb.send('/api/lf/school', { method: 'POST', body }); load(); } catch (e) { fail(e); }
  };
  const setRole = async (u: RecordModel, role: Role) => {
    try { await pb.collection('users').update(u.id, { role }); load(); } catch (e) { fail(e); }
  };
  if (!st) return <ActivityIndicator />;
  return (
    <ScrollView>
      <View style={s.section}>
        <Text style={s.cardTitle}>Invite people</Text>
        <Text style={s.muted}>Share this address. It works for anyone on the same network as the server.</Text>
        <Text selectable style={s.code}>{info.address || (Platform.OS === 'web' ? window.location.origin : pb.baseURL)}</Text>
        <Text style={s.label}>Student code</Text>
        <View style={s.row}><Text selectable style={s.code}>{st.joinCode}</Text><Pressable onPress={() => update({ newJoinCode: true })}><Text style={s.link}>New code</Text></Pressable></View>
        <Text style={s.label}>Staff code</Text>
        <View style={s.row}><Text selectable style={s.code}>{st.staffCode}</Text><Pressable onPress={() => update({ newStaffCode: true })}><Text style={s.link}>New code</Text></Pressable></View>
        <Text style={s.muted}>Making a new code stops the old one working. It doesn't affect existing accounts.</Text>
      </View>
      <View style={s.section}>
        <Text style={s.cardTitle}>School</Text>
        <Text style={s.label}>Name</Text>
        <TextInput style={s.input} value={st.schoolName} onChangeText={(v) => setSt({ ...st, schoolName: v })} />
        <Text style={s.label}>Email domain (anyone with it can join as a student)</Text>
        <TextInput style={s.input} value={st.emailDomain} placeholder="e.g. myschool.org, or blank for invite codes only" autoCapitalize="none" onChangeText={(v) => setSt({ ...st, emailDomain: v })} />
        <Btn label="Save" onPress={() => update({ schoolName: st.schoolName, emailDomain: st.emailDomain })} />
      </View>
      <View style={s.section}>
        <Text style={s.cardTitle}>People ({users.length})</Text>
        {users.map((u) => (
          <View key={u.id} style={s.userRow}>
            <Text style={{ flex: 1 }} numberOfLines={1}>{u.email}</Text>
            {(['member', 'staff', 'admin'] as Role[]).map((r) => (
              <Pressable key={r} disabled={u.id === me} onPress={() => setRole(u, r)} style={[s.chip, u.role === r && s.chipOn]}>
                <Text style={u.role === r ? { color: '#fff' } : undefined}>{r === 'member' ? 'student' : r}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------- Shared bits ----------

function Chips({ value, onChange, allowAll }: { value: string | null; onChange: (v: string | null) => void; allowAll?: boolean }) {
  const opts = allowAll ? [null, ...CATEGORIES] : CATEGORIES;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8, flexGrow: 0 }}>
      {opts.map((c) => (
        <Pressable key={c ?? 'all'} onPress={() => onChange(c)} style={[s.chip, value === c && s.chipOn]}>
          <Text style={value === c ? { color: '#fff' } : undefined}>{c ?? 'All'}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const TabBtn = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[s.tab, on && s.tabOn]}><Text style={on ? { color: '#fff', fontWeight: '600' } : undefined}>{label}</Text></Pressable>
);
const Btn = ({ label, onPress, ghost, disabled }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, ghost && s.btnGhost, disabled && { opacity: 0.5 }]}><Text style={{ color: ghost ? '#1f4ed8' : '#fff', fontWeight: '600' }}>{label}</Text></Pressable>
);

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#f7f7f5' },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginVertical: 12 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#e5e5e0' },
  tabOn: { backgroundColor: '#1f4ed8' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#e5e5e0', marginRight: 6, marginBottom: 6 },
  chipOn: { backgroundColor: '#111' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: '#ddd' },
  label: { fontWeight: '600', marginTop: 10, marginBottom: 2 },
  btn: { backgroundColor: '#1f4ed8', padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 8 },
  btnGhost: { backgroundColor: 'transparent' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginVertical: 5 },
  cardTitle: { fontWeight: '600', fontSize: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginVertical: 6 },
  photo: { width: 80, height: 80, borderRadius: 8 },
  photoBig: { width: '100%', height: 200, borderRadius: 12 },
  noPhoto: { backgroundColor: '#e5e5e0', alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#666', marginTop: 2 },
  link: { color: '#1f4ed8', marginTop: 6, fontWeight: '600' },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 18, marginVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, gap: 8 },
  footer: { borderTopWidth: 1, borderTopColor: '#e5e5e0', paddingTop: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, padding: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
