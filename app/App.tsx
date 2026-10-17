import React, { useEffect, useState } from 'react';
import { Platform, SafeAreaView, View, Text, TextInput, Pressable, FlatList, Image, ScrollView, Alert, StyleSheet, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Session } from '@supabase/supabase-js';
import { supabase, CATEGORIES, Item } from './lib/supabase';

// Alert pop-ups are a no-op on web; route them to window.alert so errors are visible.
if (Platform.OS === 'web') {
  Alert.alert = ((title: string, msg?: string) =>
    window.alert([title, msg].filter(Boolean).join('\n\n'))) as typeof Alert.alert;
}

type Tab = 'browse' | 'lost' | 'log';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState('member');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('browse');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('role, school_id').eq('id', session.user.id).single()
      .then(({ data }) => { if (data) { setRole(data.role); setSchoolId(data.school_id); } });
  }, [session]);

  if (!session) return <Auth />;
  const staff = role === 'staff' || role === 'admin';

  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>Lost & Found</Text>
      <View style={s.tabs}>
        <TabBtn label="Browse" on={tab === 'browse'} onPress={() => setTab('browse')} />
        <TabBtn label="I lost something" on={tab === 'lost'} onPress={() => setTab('lost')} />
        {staff && <TabBtn label="Log item" on={tab === 'log'} onPress={() => setTab('log')} />}
      </View>
      {tab === 'browse' && <Browse />}
      {tab === 'lost' && schoolId && <LostReport schoolId={schoolId} userId={session.user.id} />}
      {tab !== 'browse' && !schoolId && <Text style={s.muted}>Your account isn't linked to a school yet. Ask your school admin to add you.</Text>}
      {tab === 'log' && staff && schoolId && <LogItem schoolId={schoolId} userId={session.user.id} />}
      <Pressable onPress={() => supabase.auth.signOut()}><Text style={s.link}>Sign out</Text></Pressable>
    </SafeAreaView>
  );
}

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const go = async (signUp: boolean) => {
    const { error } = signUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert(error.message);
  };
  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>Lost & Found</Text>
      <TextInput style={s.input} placeholder="School email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Btn label="Sign in" onPress={() => go(false)} />
      <Btn label="Create account" onPress={() => go(true)} ghost />
    </SafeAreaView>
  );
}

function Browse() {
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const load = async () => {
    let q = supabase.from('items_public').select('*').eq('status', 'found').order('date_found', { ascending: false });
    if (cat) q = q.eq('category', cat);
    const { data, error } = await q;
    if (error) Alert.alert(error.message); else setItems(data as Item[]);
  };
  useEffect(() => { load(); }, [cat]);
  return (
    <View style={{ flex: 1 }}>
      <Chips value={cat} onChange={setCat} allowAll />
      <FlatList data={items} keyExtractor={(i) => i.id} onRefresh={load} refreshing={false}
        ListEmptyComponent={<Text style={s.muted}>No items yet.</Text>}
        renderItem={({ item }) => <ItemCard item={item} />} />
    </View>
  );
}

function ItemCard({ item }: { item: Item }) {
  const claim = () => Alert.prompt?.('Claim item', 'Describe a detail only the owner would know:', async (answer) => {
    if (!answer) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('claims').insert({ item_id: item.id, user_id: u.user!.id, verification_answer: answer });
    Alert.alert(error ? error.message : 'Claim sent! Staff will review it.');
  }) ?? Alert.alert('Ask the front office to claim this item.'); // Alert.prompt is iOS-only
  return (
    <View style={s.card}>
      {item.photo_url ? <Image source={{ uri: item.photo_url }} style={s.photo} /> : <View style={[s.photo, s.noPhoto]}><Text>🔒</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{item.color ? `${item.color} ` : ''}{item.category}</Text>
        <Text style={s.muted}>{item.description}</Text>
        <Text style={s.muted}>Found {item.date_found}{item.location_found ? ` · ${item.location_found}` : ''}</Text>
        <Pressable onPress={claim}><Text style={s.link}>This is mine</Text></Pressable>
      </View>
    </View>
  );
}

function LostReport({ schoolId, userId }: { schoolId: string; userId: string }) {
  const [cat, setCat] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [desc, setDesc] = useState('');
  const [matches, setMatches] = useState<Item[] | null>(null);
  const submit = async () => {
    if (!cat) return Alert.alert('Pick a category');
    const { data, error } = await supabase.from('reports').insert({
      school_id: schoolId, user_id: userId, category: cat, color: color || null, description: desc,
      date_lost: new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (error) return Alert.alert(error.message);
    const { data: m } = await supabase.rpc('match_report', { report: data.id });
    setMatches((m as Item[]) ?? []);
  };
  return (
    <ScrollView>
      <Chips value={cat} onChange={setCat} />
      <TextInput style={s.input} placeholder="Color (e.g. blue)" value={color} onChangeText={setColor} />
      <TextInput style={s.input} placeholder="Describe it" value={desc} onChangeText={setDesc} multiline />
      <Btn label="Report & find matches" onPress={submit} />
      {matches && (matches.length
        ? matches.map((m) => <ItemCard key={m.id} item={m} />)
        : <Text style={s.muted}>No matches yet — we'll keep looking.</Text>)}
    </ScrollView>
  );
}

function LogItem({ schoolId, userId }: { schoolId: string; userId: string }) {
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
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const save = async () => {
    if (!cat) return Alert.alert('Pick a category');
    setBusy(true);
    let photo_url: string | null = null;
    if (photo?.base64) {
      const path = `${schoolId}/${Date.now()}.jpg`;
      const up = await supabase.storage.from('item-photos').upload(path, decode(photo.base64), { contentType: 'image/jpeg' });
      if (!up.error) photo_url = supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from('items').insert({
      school_id: schoolId, logged_by: userId, category: cat, color: color || null,
      description: desc, location_found: loc, is_valuable: valuable, photo_url,
    });
    setBusy(false);
    if (error) return Alert.alert(error.message);
    Alert.alert('Logged!');
    setPhoto(null); setCat(null); setColor(''); setDesc(''); setLoc(''); setValuable(false);
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
      <View style={s.row}><Text>Valuable (hide details publicly)</Text><Switch value={valuable} onValueChange={setValuable} /></View>
      <Btn label={busy ? 'Saving…' : 'Save item'} onPress={save} />
    </ScrollView>
  );
}

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
const Btn = ({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) => (
  <Pressable onPress={onPress} style={[s.btn, ghost && s.btnGhost]}><Text style={{ color: ghost ? '#1f4ed8' : '#fff', fontWeight: '600' }}>{label}</Text></Pressable>
);

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#f7f7f5' },
  title: { fontSize: 26, fontWeight: '700', marginVertical: 12 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#e5e5e0' },
  tabOn: { backgroundColor: '#1f4ed8' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#e5e5e0', marginRight: 6 },
  chipOn: { backgroundColor: '#111' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: '#ddd' },
  btn: { backgroundColor: '#1f4ed8', padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 8 },
  btnGhost: { backgroundColor: 'transparent' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginVertical: 5 },
  cardTitle: { fontWeight: '600', fontSize: 16 },
  photo: { width: 80, height: 80, borderRadius: 8 },
  photoBig: { width: '100%', height: 200, borderRadius: 12 },
  noPhoto: { backgroundColor: '#e5e5e0', alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#666', marginTop: 2 },
  link: { color: '#1f4ed8', marginTop: 6, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
});
