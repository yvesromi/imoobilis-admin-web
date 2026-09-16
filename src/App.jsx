import React, { useState, useMemo, useEffect } from "react";
import {
  Lock, LogOut, Wifi, BatteryFull, Settings, ShieldCheck, Users, User,
  DollarSign, Tag, Package, AlertTriangle, Check, ChevronRight, PlusCircle,
  Search, X, ArrowLeft,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════════════════════════
// SUPABASE — même base que ImoobilisApp.jsx (voir sql/README.md).
// Intégration progressive : pour l'instant, seul le module "Code Promo"
// est réellement connecté ici (création/activation/suppression). Le reste
// (annonceurs, biens, signalements, commissions...) continue d'utiliser
// les données de démonstration locales (voir buildDemoData plus bas), en
// attendant les prochaines passes.
// ══════════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://bueuoolgnjkwiwoqjgom.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZXVvb2xnbmprd2l3b3FqZ29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODM2OTgsImV4cCI6MjA5OTQ1OTY5OH0.h-KSQHmm66nFqjAy5HnI8z1FPjM2uA2sSVXuk_mD9bw";

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${options.method || "GET"} /${path} → ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ══════════════════════════════════════════════════════════════════
// ADMINISTRATION IMOOBILIS — application web autonome, entièrement
// détachée de l'application clients/annonceurs (ImoobilisApp.jsx).
//
// Dans une vraie mise en production, cette application et l'app
// clients/annonceurs sont deux déploiements séparés (domaines/URLs
// distincts, équipes d'accès distinctes) qui communiquent tous les deux
// avec le MÊME backend/API — c'est ce backend partagé qui fait qu'une
// action ici (suspension, résolution d'un signalement, partage d'un code
// promo) se répercute réellement côté client/annonceur.
//
// Cette démo n'a pas de backend : il n'y a donc plus de store partagé
// entre les deux fichiers. Ce fichier contient son propre jeu de données
// de démonstration (ADMIN_DEMO_DATA plus bas), indépendant de celui de
// ImoobilisApp.jsx. Les actions faites ici restent locales à cette
// application et ne se répercutent pas dans l'autre onglet/fichier —
// exactement le compromis attendu d'une séparation réelle sans backend
// commun pour l'instant.
// ══════════════════════════════════════════════════════════════════

const ZONES_COMMUNES = {
  nord:   { label: "Abidjan Nord",   communes: ["Yopougon", "Songon"] },
  ouest:  { label: "Abidjan Ouest",  communes: ["Abobo", "Anyama"] },
  centre: { label: "Abidjan Centre", communes: ["Plateau", "Adjamé", "Attécoubé"] },
  est:    { label: "Abidjan Est",    communes: ["Cocody", "Bingerville"] },
  sud:    { label: "Abidjan Sud",    communes: ["Treichville", "Marcory", "Koumassi", "Port-Bouët"] },
};

const REPORT_REASONS = [
  { id: "unavailable", emoji: "🚫", label: "Bien déjà vendu / loué", hint: "Le bien n'est plus disponible mais figure toujours sur la plateforme" },
  { id: "incorrect", emoji: "⚠️", label: "Informations incorrectes", hint: "Prix, photos ou détails ne correspondent pas au bien réel" },
  { id: "unreachable", emoji: "📵", label: "Annonceur injoignable", hint: "Impossible de contacter l'annonceur malgré plusieurs tentatives" },
  { id: "fraud", emoji: "🚩", label: "Annonce frauduleuse", hint: "Arnaque suspectée ou contenu trompeur" },
  { id: "other", emoji: "💬", label: "Autre problème", hint: "Précisez ci-dessous" },
];

// Formate une date ISO en "05/07/2026 · 14:32" (fuseau local de l'appareil).
function formatTxDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

// Détermine une icône et un libellé de catégorie lisibles pour une
// transaction CPS client (même convention que côté client/annonceur).
function getCpTxMeta(tx) {
  if (tx.type === "credit") return { icon: "💳", category: "Rechargement" };
  if (tx.type === "refund") return { icon: "↩️", category: "Remboursement" };
  if (tx.label.startsWith("Explorations cumulées")) return { icon: "🗺️", category: "Exploration" };
  if (tx.label.startsWith("Contact annonceur")) return { icon: "📞", category: "Contact annonceur" };
  if (tx.label.startsWith("Création d'alerte")) return { icon: "🔔", category: "Alerte" };
  if (tx.label.startsWith("Vidéo aérienne")) return { icon: "🚁", category: "Vidéo aérienne" };
  return { icon: "🪙", category: "Autre" };
}

// Génère un code promo de 6 caractères mêlant majuscules, minuscules,
// chiffres et un symbole (au moins un de chaque catégorie, positions
// mélangées). I/l/O/0/1 exclus pour éviter toute confusion visuelle.
function generatePromoCode() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "-_#*";
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const pool = upper + lower + digits;
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols), pick(pool), pick(pool)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ── Jeu de données de démonstration ───────────────────────────────
// Indépendant de celui de ImoobilisApp.jsx (voir note en tête de fichier).
function buildDemoData() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

  const publishedProperties = [
    { id: "p1", title: "Villa 5 pièces piscine", advertiserName: "Konan Yao", advertiserPhone: "+225 07 07 12 34 56", advertiserType: "particular", transaction: "vente", price: 185000000, zone: "est", district: "Cocody Riviera", views: 142, explorations: 38, contacts: 9, isSuspended: false },
    { id: "p2", title: "Appartement 3 pièces meublé", advertiserName: "Konan Yao", advertiserPhone: "+225 07 07 12 34 56", advertiserType: "particular", transaction: "location", price: 350000, zone: "est", district: "Cocody Angré", views: 96, explorations: 21, contacts: 6, isSuspended: false },
    { id: "p3", title: "Terrain 500 m²", advertiserName: "Immo Excellence CI", advertiserPhone: "+225 05 55 22 11 00", advertiserType: "agency", transaction: "vente", price: 65000000, zone: "est", district: "Angré", views: 74, explorations: 15, contacts: 4, isSuspended: false },
    { id: "p4", title: "Duplex 4 pièces", advertiserName: "Immo Excellence CI", advertiserPhone: "+225 05 55 22 11 00", advertiserType: "agency", transaction: "location", price: 450000, zone: "sud", district: "Marcory", views: 51, explorations: 9, contacts: 2, isSuspended: true },
    { id: "p5", title: "Studio meublé", advertiserName: "Aïcha Traoré", advertiserPhone: "+225 01 02 03 04 05", advertiserType: "particular", transaction: "location", price: 120000, zone: "sud", district: "Treichville", views: 33, explorations: 5, contacts: 1, isSuspended: false },
    { id: "p6", title: "Terrain 1000 m²", advertiserName: "Aïcha Traoré", advertiserPhone: "+225 01 02 03 04 05", advertiserType: "particular", transaction: "vente", price: 120000000, zone: "nord", district: "Yopougon", views: 28, explorations: 6, contacts: 1, isSuspended: false },
  ];

  const propertyReports = [
    { id: "rep-1", propertyId: "p4", propertyTitle: "Duplex 4 pièces", advertiserPhone: "+225 05 55 22 11 00", reasonId: "unavailable", comment: "Le duplex a déjà été loué la semaine dernière.", refundRequested: true, refundedCp: 12, reportedAt: daysAgo(2), resolved: false },
    { id: "rep-2", propertyId: "p5", propertyTitle: "Studio meublé", advertiserPhone: "+225 01 02 03 04 05", reasonId: "unreachable", comment: "", refundRequested: false, refundedCp: 0, reportedAt: daysAgo(9), resolved: true },
  ];

  const commissionPayments = [
    { id: "com-1", propertyTitle: "Villa 5 pièces piscine", advertiserName: "Konan Yao", advertiserPhone: "+225 07 07 12 34 56", transaction: "vente", zone: "est", commissionAmount: 1387500, paidAt: daysAgo(5) },
    { id: "com-2", propertyTitle: "Terrain 500 m²", advertiserName: "Immo Excellence CI", advertiserPhone: "+225 05 55 22 11 00", transaction: "vente", zone: "est", commissionAmount: 650000, paidAt: daysAgo(12) },
    { id: "com-3", propertyTitle: "Appartement 3 pièces meublé", advertiserName: "Konan Yao", advertiserPhone: "+225 07 07 12 34 56", transaction: "location", zone: "est", commissionAmount: 35000, paidAt: daysAgo(20) },
    { id: "com-4", propertyTitle: "Terrain 1000 m²", advertiserName: "Aïcha Traoré", advertiserPhone: "+225 01 02 03 04 05", transaction: "vente", zone: "nord", commissionAmount: 1200000, paidAt: daysAgo(30) },
  ];

  const promoCodes = [
    { id: "promo-1", code: "B1N-V9", type: "cps_bonus", value: 10, maxUses: null, usesCount: 3, active: true, createdAt: daysAgo(10) },
    { id: "promo-2", code: "R9d-4K", type: "discount_topup", value: 15, maxUses: 50, usesCount: 12, active: true, createdAt: daysAgo(3) },
  ];

  const adminUsers = [
    { id: "adm-1", name: "Admin Principal", username: "admin", role: "Super admin", createdAt: daysAgo(60) },
  ];

  // Client — démo mono-client, comme côté ImoobilisApp.jsx.
  const myInfo = { nom: "Yao", prenom: "Konan", contact: "+225 07 07 12 34 56", localisation: "Cocody, Abidjan", email: "konan.yao@email.com" };
  const clientCpTransactions = [
    { id: "cp-1", type: "credit", label: "Rechargement 10 000 F", cp: 100, bonus: 5, date: daysAgo(1) },
    { id: "cp-2", type: "debit", label: "Contact annonceur — Villa 5 pièces piscine", cp: 18, date: daysAgo(1) },
    { id: "cp-3", type: "debit", label: "Explorations cumulées (carte/POI/trajet)", cp: 6, date: daysAgo(2) },
  ];

  return {
    publishedProperties, propertyReports, commissionPayments, promoCodes, adminUsers,
    myInfo, clientSuspended: false, clientCpBalance: 42, clientCpBonus: 8,
    clientCpTransactions, pendingExplorationCP: 0,
  };
}

// ── Store admin local (démo, sans backend) ────────────────────────
const AdminStoreContext = React.createContext(null);
function useAdminStore() { return React.useContext(AdminStoreContext); }

function AdminStoreProvider({ children }) {
  const seed = useMemo(() => buildDemoData(), []);
  const [publishedProperties, setPublishedProperties] = useState(seed.publishedProperties);
  const [propertyReports, setPropertyReports] = useState(seed.propertyReports);
  const [commissionPayments] = useState(seed.commissionPayments);
  const [promoCodes, setPromoCodes] = useState(seed.promoCodes);
  useEffect(() => {
    supabaseFetch(`promo_codes?select=id,code,type,value,max_uses,uses_count,active,created_at&order=created_at.desc`)
      .then(rows => {
        if (!rows) return;
        setPromoCodes(rows.map(r => ({
          id: r.id, code: r.code, type: r.type, value: r.value,
          maxUses: r.max_uses, usesCount: r.uses_count, active: r.active,
          createdAt: r.created_at,
        })));
      })
      .catch(err => console.error("Chargement Supabase (codes promo) échoué — données de démo conservées :", err));
  }, []);
  const [adminUsers, setAdminUsers] = useState(seed.adminUsers);
  const [myInfo] = useState(seed.myInfo);
  const [clientSuspended, setClientSuspended] = useState(seed.clientSuspended);
  const [clientCpBalance] = useState(seed.clientCpBalance);
  const [clientCpBonus] = useState(seed.clientCpBonus);
  const [clientCpTransactions] = useState(seed.clientCpTransactions);
  const [pendingExplorationCP] = useState(seed.pendingExplorationCP);
  const [redeemedPromoCodes, setRedeemedPromoCodes] = useState(new Set());

  function publishProperty(prop) {
    setPublishedProperties(prev => {
      const exists = prev.find(p => p.id === prop.id);
      return exists ? prev.map(p => p.id === prop.id ? prop : p) : [prop, ...prev];
    });
  }
  function unpublishProperty(id) { setPublishedProperties(prev => prev.filter(p => p.id !== id)); }
  function resolveReport(id, resolutionNote = "") {
    setPropertyReports(prev => prev.map(r => r.id === id ? { ...r, resolved: true, resolvedAt: new Date().toISOString(), resolutionNote } : r));
  }
  function suspendAdvertiserProperties(advertiserPhone) {
    setPublishedProperties(prev => prev.map(p => p.advertiserPhone === advertiserPhone ? { ...p, isSuspended: true } : p));
  }
  function reactivateAdvertiserProperties(advertiserPhone) {
    setPublishedProperties(prev => prev.map(p => p.advertiserPhone === advertiserPhone ? { ...p, isSuspended: false } : p));
  }
  function addAdminUser(user) { setAdminUsers(prev => [...prev, { id: `adm-${Date.now()}`, createdAt: new Date().toISOString(), ...user }]); }
  function removeAdminUser(id) { setAdminUsers(prev => prev.filter(u => u.id !== id)); }
  function addPromoCode(promo) {
    const tempId = `promo-${Date.now()}`;
    setPromoCodes(prev => [{ id: tempId, usesCount: 0, active: true, createdAt: new Date().toISOString(), ...promo }, ...prev]);
    return supabaseFetch(`promo_codes?select=id`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{
        code: promo.code, type: promo.type, value: promo.value,
        max_uses: promo.maxUses ?? null,
      }]),
    }).then(rows => {
      // Réconcilie l'id local temporaire avec le vrai UUID renvoyé par
      // Supabase, sinon les actions suivantes (activer/désactiver/
      // supprimer) cibleraient un id qui n'existe pas en base.
      const realId = rows?.[0]?.id;
      if (!realId) { setPromoCodes(prev => prev.filter(p => p.id !== tempId)); return false; }
      setPromoCodes(prev => prev.map(p => p.id === tempId ? { ...p, id: realId } : p));
      return true;
    }).catch(err => {
      // Échec réel (doublon de code rejeté par la contrainte UNIQUE, RLS,
      // réseau...) : on retire la ligne optimiste plutôt que de la laisser
      // affichée avec un id fictif qui ne se réconciliera jamais.
      console.error("Création Supabase (code promo) échouée :", err);
      setPromoCodes(prev => prev.filter(p => p.id !== tempId));
      return false;
    });
  }
  function togglePromoCode(id) {
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
    const promo = promoCodes.find(p => p.id === id);
    supabaseFetch(`promo_codes?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ active: !(promo?.active) }),
    }).catch(err => console.error("Mise à jour Supabase (code promo) échouée :", err));
  }
  function deletePromoCode(id) {
    setPromoCodes(prev => prev.filter(p => p.id !== id));
    supabaseFetch(`promo_codes?id=eq.${id}`, { method: "DELETE" })
      .catch(err => console.error("Suppression Supabase (code promo) échouée :", err));
  }
  function incrementPromoCodeUses(id) { setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, usesCount: (p.usesCount || 0) + 1 } : p)); }

  return (
    <AdminStoreContext.Provider value={{
      publishedProperties, publishProperty, unpublishProperty,
      propertyReports, resolveReport,
      suspendAdvertiserProperties, reactivateAdvertiserProperties,
      commissionPayments,
      adminUsers, addAdminUser, removeAdminUser,
      promoCodes, addPromoCode, togglePromoCode, deletePromoCode, incrementPromoCodeUses,
      redeemedPromoCodes, setRedeemedPromoCodes,
      myInfo, clientSuspended, setClientSuspended,
      clientCpBalance, clientCpBonus, clientCpTransactions, pendingExplorationCP,
    }}>
      {children}
    </AdminStoreContext.Provider>
  );
}

// ── Tableau générique réutilisé par tous les modules de l'administration ──
function AdminTable({ columns, rows, emptyLabel = "Aucune donnée." }) {
  if (rows.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-10 bg-white rounded-2xl border border-gray-100">{emptyLabel}</p>;
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-[10.5px] whitespace-nowrap">
        <thead>
          <tr className="bg-slate-50">
            {columns.map(c => (
              <th key={c.key} className={`px-2.5 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row._key ?? i} className="border-t border-gray-50">
              {columns.map(c => (
                <td key={c.key} className={`px-2.5 py-2 text-slate-700 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sélection des destinataires avant partage d'un code promo ──
function PromoRecipientSheet({ promo, clients, selected, onToggle, onSelectAll, onClose, onSend }) {
  const allSelected = clients.length > 0 && clients.every(c => selected.has(c.id));
  return (
    <div className="absolute inset-0 z-[220] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div className="bg-white rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85%" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Partager {promo.code}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">Choisissez les clients qui recevront ce code dans leur messagerie Imoobilis.</p>

        <button onClick={() => onSelectAll(!allSelected)} className="text-[11px] font-bold text-slate-800 mb-2">
          {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
        </button>

        <div className="space-y-1.5 mb-4 overflow-y-auto" style={{ maxHeight: "40vh" }}>
          {clients.map(c => (
            <button key={c.id} onClick={() => onToggle(c.id)}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left ${selected.has(c.id) ? "bg-green-50 border-green-200" : "bg-white border-gray-100"}`}>
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${selected.has(c.id) ? "bg-green-700 border-green-700" : "border-gray-300"}`}>
                {selected.has(c.id) && <Check size={13} className="text-white"/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-slate-800 truncate">{c.name}</p>
                <p className="text-[10.5px] text-gray-400">{c.contact}</p>
              </div>
            </button>
          ))}
          {clients.length === 0 && <p className="text-center text-gray-400 text-sm py-6">Aucun client disponible.</p>}
        </div>

        <button onClick={onSend} disabled={selected.size === 0}
          className="w-full bg-green-700 disabled:bg-gray-300 text-white font-bold text-[14px] py-3.5 rounded-xl">
          Envoyer à {selected.size} client{selected.size > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function AdminApp({ admin, onLogout }) {
  const store = useAdminStore();
  const [activeTab, setActiveTab] = useState("administrateur");
  const [advertiserView, setAdvertiserView] = useState("comptes"); // "comptes" | "biens" | "signalements"
  const [propertySearch, setPropertySearch] = useState("");
  const [toast, setToast] = useState(null);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }

  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("Modérateur");

  const [showAddPromo, setShowAddPromo] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoType, setNewPromoType] = useState("cps_bonus");
  const [newPromoValue, setNewPromoValue] = useState("");
  const [newPromoMaxUses, setNewPromoMaxUses] = useState("");

  const [sharePromoTarget, setSharePromoTarget] = useState(null);
  const [shareSelectedClients, setShareSelectedClients] = useState(new Set(["client-demo"]));
  const shareableClients = [
    { id: "client-demo", name: `${store.myInfo?.prenom || ""} ${store.myInfo?.nom || ""}`.trim() || "Client démo", contact: store.myInfo?.contact },
  ];

  const properties = store.publishedProperties;

  const advertisers = useMemo(() => {
    const map = new Map();
    for (const p of properties) {
      const key = p.advertiserPhone || "—";
      if (!map.has(key)) {
        map.set(key, { phone: key, name: p.advertiserName || "—", type: p.advertiserType || "particular", properties: [], views: 0, explorations: 0, contacts: 0, suspended: 0 });
      }
      const a = map.get(key);
      a.properties.push(p);
      a.views += p.views || 0;
      a.explorations += p.explorations || 0;
      a.contacts += p.contacts || 0;
      if (p.isSuspended) a.suspended += 1;
    }
    return [...map.values()].sort((a, b) => b.properties.length - a.properties.length);
  }, [properties]);

  const pendingReports = store.propertyReports.filter(r => !r.resolved);
  const clientTotalCP = (store.clientCpBalance || 0) + (store.clientCpBonus || 0);

  const filteredProperties = properties.filter(p => {
    if (!propertySearch.trim()) return true;
    const q = propertySearch.trim().toLowerCase();
    return p.title?.toLowerCase().includes(q) || p.advertiserName?.toLowerCase().includes(q) || p.district?.toLowerCase().includes(q);
  });

  const commissionTotal = store.commissionPayments.reduce((s, p) => s + (p.commissionAmount || 0), 0);
  const commissionByType = useMemo(() => {
    const map = { location: { count: 0, total: 0 }, vente: { count: 0, total: 0 } };
    for (const p of store.commissionPayments) {
      const key = p.transaction === "vente" ? "vente" : "location";
      map[key].count += 1;
      map[key].total += p.commissionAmount || 0;
    }
    return map;
  }, [store.commissionPayments]);
  const commissionByZone = useMemo(() => {
    const map = new Map();
    for (const p of store.commissionPayments) {
      const label = p.zone ? (ZONES_COMMUNES[p.zone]?.label || p.zone) : (p.commune || p.district || "Zone inconnue");
      if (!map.has(label)) map.set(label, { count: 0, total: 0 });
      const z = map.get(label);
      z.count += 1;
      z.total += p.commissionAmount || 0;
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [store.commissionPayments]);
  const commissionByAdvertiser = useMemo(() => {
    const map = new Map();
    for (const p of store.commissionPayments) {
      const key = p.advertiserPhone || "—";
      if (!map.has(key)) map.set(key, { phone: key, name: advertisers.find(a => a.phone === key)?.name || key, count: 0, total: 0 });
      const a = map.get(key);
      a.count += 1;
      a.total += p.commissionAmount || 0;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [store.commissionPayments, advertisers]);

  function handleToggleSuspend(p) {
    store.publishProperty({ ...p, isSuspended: !p.isSuspended });
    showToast(!p.isSuspended ? `⛔ "${p.title}" suspendu par l'administration` : `✅ "${p.title}" réactivé`);
  }
  function handleRemoveProperty(p) {
    store.unpublishProperty(p.id);
    showToast(`🗑️ "${p.title}" retiré de la plateforme`);
  }
  function handleToggleAdvertiser(a) {
    if (a.suspended === a.properties.length) {
      store.reactivateAdvertiserProperties(a.phone);
      showToast(`✅ Tous les biens de ${a.name} réactivés`);
    } else {
      store.suspendAdvertiserProperties(a.phone);
      showToast(`⛔ Tous les biens de ${a.name} suspendus`);
    }
  }
  function handleToggleClientSuspend() {
    store.setClientSuspended(prev => !prev);
    showToast(store.clientSuspended ? "✅ Compte client réactivé" : "⛔ Compte client suspendu");
  }
  function handleAddAdmin() {
    if (!newAdminName.trim() || !newAdminUsername.trim()) return;
    store.addAdminUser({ name: newAdminName.trim(), username: newAdminUsername.trim(), role: newAdminRole });
    showToast(`✅ ${newAdminName.trim()} ajouté comme ${newAdminRole}`);
    setNewAdminName(""); setNewAdminUsername(""); setNewAdminRole("Modérateur"); setShowAddAdmin(false);
  }
  function handleRemoveAdmin(u) {
    store.removeAdminUser(u.id);
    showToast(`${u.name} retiré de l'équipe`);
  }
  function handleAddPromo() {
    const value = parseInt(newPromoValue) || 0;
    const code = newPromoCode.trim();
    if (code.length !== 6) { showToast("Le code doit faire exactement 6 caractères"); return; }
    if (value <= 0) return;
    if (store.promoCodes.some(p => p.code === code)) {
      showToast(`Le code ${code} existe déjà — clique sur 🎲 Générer pour en obtenir un autre`);
      return;
    }
    store.addPromoCode({ code, type: newPromoType, value, maxUses: newPromoMaxUses ? parseInt(newPromoMaxUses) : null, expiresAt: null })
      .then(ok => showToast(ok ? `✅ Code ${code} créé` : `❌ La création de ${code} a échoué (déjà utilisé en base ou erreur réseau)`));
    setNewPromoCode(""); setNewPromoValue(""); setNewPromoMaxUses(""); setShowAddPromo(false);
  }
  function handleSharePromo(promo, clientIds) {
    if (clientIds.length === 0) { showToast("Sélectionnez au moins un client"); return; }
    // Démo mono-client : le seul id possible est "client-demo", résolu ici
    // vers le vrai UUID Supabase du client (créé par ImoobilisApp.jsx dès
    // sa première connexion) via son numéro de téléphone — voir
    // store.myInfo. Sans client existant en base (app cliente jamais
    // ouverte), le partage échoue proprement avec un message clair plutôt
    // que silencieusement.
    (async () => {
      try {
        const phone = store.myInfo?.contact;
        const rows = await supabaseFetch(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
        const realClientId = rows?.[0]?.id;
        if (!realClientId) {
          showToast("Client introuvable en base — ouvrez d'abord l'app cliente au moins une fois");
          return;
        }
        await supabaseFetch(`client_messages`, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify([{ client_id: realClientId, type: "promo", promo_code_id: promo.id, is_read: false }]),
        });
        showToast(clientIds.length === 1 ? `Code ${promo.code} envoyé à 1 client` : `Code ${promo.code} envoyé à ${clientIds.length} clients`);
      } catch (err) {
        console.error("Partage Supabase (code promo) échoué :", err);
        showToast(`❌ Échec du partage : ${err.message}`.slice(0, 140));
      }
    })();
  }

  const TABS = [
    { key: "administrateur", label: "Administrateur", icon: ShieldCheck },
    { key: "annonceur", label: "Annonceur", icon: Users },
    { key: "client", label: "Client", icon: User },
    { key: "commission", label: "Commission", icon: DollarSign },
    { key: "promo", label: "Code Promo", icon: Tag },
  ];

  return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-slate-50 shadow-xl overflow-hidden flex flex-col relative border-x border-slate-200 font-sans">
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0 bg-white">
        <span>9:41</span><div className="flex items-center gap-1.5"><Wifi size={14}/><BatteryFull size={18}/></div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTab("moncompte")} aria-label="Mon compte"
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${activeTab === "moncompte" ? "bg-slate-800" : "bg-slate-100"}`}>
            <Settings size={14} className={activeTab === "moncompte" ? "text-white" : "text-slate-500"}/>
          </button>
          <div>
            <p className="font-extrabold text-slate-800 text-[13px] leading-tight">Administration Imoobilis</p>
            <p className="text-[10px] text-gray-400 leading-tight">{admin?.name || "admin"}</p>
          </div>
        </div>
        {pendingReports.length > 0 && (
          <button onClick={() => { setActiveTab("annonceur"); setAdvertiserView("signalements"); }} className="flex items-center gap-1 bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-1 rounded-full">
            <AlertTriangle size={11}/>{pendingReports.length}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "administrateur" && (
          <div className="px-4 py-5 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-[10.5px] text-blue-700 leading-snug">🔌 Application détachée — données de démonstration indépendantes de l'app clients/annonceurs. En production, les deux partageraient le même backend.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Annonceurs", val: advertisers.length, icon: Users, color: "text-slate-700" },
                { label: "Biens", val: properties.length, icon: Package, color: "text-green-700" },
                { label: "Signalements", val: pendingReports.length, icon: AlertTriangle, color: "text-rose-600" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 py-3 px-2 text-center">
                  <s.icon size={16} className={`${s.color} mx-auto mb-1`}/>
                  <p className={`font-extrabold text-[18px] ${s.color}`}>{s.val}</p>
                  <p className="text-[9.5px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-800 text-[15px]">Équipe Imoobilis ({store.adminUsers.length})</h2>
              <button onClick={() => setShowAddAdmin(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-white border border-gray-200 px-2.5 py-1.5 rounded-full">
                <PlusCircle size={13}/>Ajouter
              </button>
            </div>

            {showAddAdmin && (
              <div className="bg-white rounded-2xl border border-gray-100 p-3.5 space-y-2.5">
                <input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="Nom complet"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800"/>
                <input value={newAdminUsername} onChange={e => setNewAdminUsername(e.target.value)} placeholder="Identifiant de connexion"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800"/>
                <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800 bg-white">
                  <option>Super admin</option>
                  <option>Modérateur</option>
                  <option>Support</option>
                </select>
                <button onClick={handleAddAdmin} className="w-full bg-slate-800 text-white font-bold text-[12.5px] py-2.5 rounded-xl">
                  Ajouter à l'équipe
                </button>
              </div>
            )}

            <AdminTable
              columns={[
                { key: "name", label: "Nom" },
                { key: "username", label: "Identifiant" },
                { key: "role", label: "Rôle" },
                { key: "action", label: "", align: "right" },
              ]}
              rows={store.adminUsers.map(u => ({
                _key: u.id,
                name: <span className="font-bold">{u.name}</span>,
                username: `@${u.username}`,
                role: u.role,
                action: store.adminUsers.length > 1 ? (
                  <button onClick={() => handleRemoveAdmin(u)} className="text-rose-500"><X size={14}/></button>
                ) : null,
              }))}
              emptyLabel="Aucun administrateur pour le moment."
            />
          </div>
        )}

        {activeTab === "client" && (
          <div className="px-4 py-5 space-y-3">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Clients (1)</h2>
            <p className="text-[10px] text-gray-400 -mt-2 mb-2">Démo mono-client : un seul compte client simulé pour le moment.</p>

            <AdminTable
              columns={[
                { key: "nom", label: "Nom" },
                { key: "contact", label: "Contact" },
                { key: "solde", label: "Solde CPS", align: "right" },
                { key: "attente", label: "En attente", align: "right" },
                { key: "tx", label: "Transactions", align: "right" },
                { key: "statut", label: "Statut" },
                { key: "action", label: "", align: "right" },
              ]}
              rows={[{
                _key: "client-demo",
                nom: <span className="font-bold">{store.myInfo?.prenom} {store.myInfo?.nom}</span>,
                contact: <span>{store.myInfo?.contact}<br/><span className="text-gray-400">{store.myInfo?.localisation}</span></span>,
                solde: <span className="font-bold text-green-700">{clientTotalCP}</span>,
                attente: (store.pendingExplorationCP || 0) > 0 ? <span className="font-bold text-amber-600">{store.pendingExplorationCP}</span> : "—",
                tx: (store.clientCpTransactions || []).length,
                statut: store.clientSuspended
                  ? <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">Suspendu</span>
                  : <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">Actif</span>,
                action: (
                  <button onClick={handleToggleClientSuspend}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg ${store.clientSuspended ? "bg-green-700 text-white" : "bg-rose-600 text-white"}`}>
                    {store.clientSuspended ? "Réactiver" : "Suspendre"}
                  </button>
                ),
              }]}
            />

            <p className="text-[11px] font-bold text-slate-700 pt-1">Dernières transactions</p>
            <AdminTable
              columns={[
                { key: "cat", label: "Catégorie" },
                { key: "label", label: "Détail" },
                { key: "date", label: "Date" },
                { key: "montant", label: "Montant", align: "right" },
              ]}
              rows={(store.clientCpTransactions || []).slice(0, 8).map(tx => {
                const { icon, category } = getCpTxMeta(tx);
                const isCredit = tx.type === "credit" || tx.type === "refund";
                return {
                  _key: tx.id,
                  cat: <span>{icon} {category}</span>,
                  label: tx.label,
                  date: formatTxDateTime(tx.date),
                  montant: <span className={`font-bold ${isCredit ? "text-green-700" : "text-amber-600"}`}>{isCredit ? "+" : "-"}{tx.cp} CPS</span>,
                };
              })}
              emptyLabel="Aucune transaction pour le moment."
            />
          </div>
        )}

        {activeTab === "annonceur" && (
          <div className="px-4 py-5 space-y-3">
            <h2 className="font-extrabold text-slate-800 text-[16px]">Annonceur</h2>
            <div className="flex gap-1.5 bg-white border border-gray-100 rounded-xl p-1">
              {[
                { key: "comptes", label: "Comptes" },
                { key: "biens", label: "Biens" },
                { key: "signalements", label: `Signalements${pendingReports.length > 0 ? ` (${pendingReports.length})` : ""}` },
              ].map(v => (
                <button key={v.key} onClick={() => setAdvertiserView(v.key)}
                  className={`flex-1 text-[11px] font-bold py-2 rounded-lg ${advertiserView === v.key ? "bg-slate-800 text-white" : "text-gray-400"}`}>
                  {v.label}
                </button>
              ))}
            </div>

            {advertiserView === "comptes" && (
              <AdminTable
                columns={[
                  { key: "name", label: "Annonceur" },
                  { key: "type", label: "Type" },
                  { key: "biens", label: "Biens", align: "right" },
                  { key: "vues", label: "Vues", align: "right" },
                  { key: "expl", label: "Expl.", align: "right" },
                  { key: "contacts", label: "Contacts", align: "right" },
                  { key: "action", label: "", align: "right" },
                ]}
                rows={advertisers.map(a => {
                  const allSuspended = a.suspended === a.properties.length;
                  return {
                    _key: a.phone,
                    name: <span><span className="font-bold">{a.name}</span><br/><span className="text-gray-400">{a.phone}</span></span>,
                    type: a.type === "agency" ? "Agence" : "Particulier",
                    biens: <span>{a.properties.length}{a.suspended > 0 ? <span className="text-rose-500"> ({a.suspended} susp.)</span> : null}</span>,
                    vues: a.views,
                    expl: a.explorations,
                    contacts: a.contacts,
                    action: (
                      <button onClick={() => handleToggleAdvertiser(a)}
                        className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap ${allSuspended ? "bg-green-700 text-white" : "bg-rose-600 text-white"}`}>
                        {allSuspended ? "Réactiver" : "Suspendre"}
                      </button>
                    ),
                  };
                })}
                emptyLabel="Aucun annonceur pour le moment."
              />
            )}

            {advertiserView === "biens" && (
              <div className="space-y-2">
                <div className="relative mb-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"/>
                  <input value={propertySearch} onChange={e => setPropertySearch(e.target.value)} placeholder="Rechercher un bien, un annonceur…"
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-[12.5px] outline-none focus:border-slate-800"/>
                </div>
                <AdminTable
                  columns={[
                    { key: "titre", label: "Bien" },
                    { key: "type", label: "Type" },
                    { key: "vues", label: "Vues", align: "right" },
                    { key: "expl", label: "Expl.", align: "right" },
                    { key: "contacts", label: "Contacts", align: "right" },
                    { key: "statut", label: "Statut" },
                    { key: "action", label: "", align: "right" },
                  ]}
                  rows={filteredProperties.map(p => ({
                    _key: p.id,
                    titre: <span><span className="font-bold">{p.title}</span><br/><span className="text-gray-400">{p.advertiserName} · {p.district}</span></span>,
                    type: <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.transaction === "location" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{p.transaction === "location" ? "Location" : "Vente"}</span>,
                    vues: p.views || 0,
                    expl: p.explorations || 0,
                    contacts: p.contacts || 0,
                    statut: p.isSuspended ? <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">Suspendu</span> : <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">Actif</span>,
                    action: (
                      <div className="flex flex-col gap-1 items-end">
                        <button onClick={() => handleToggleSuspend(p)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${p.isSuspended ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                          {p.isSuspended ? "Réactiver" : "Suspendre"}
                        </button>
                        <button onClick={() => handleRemoveProperty(p)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-50 text-rose-600 whitespace-nowrap">
                          Retirer
                        </button>
                      </div>
                    ),
                  }))}
                  emptyLabel="Aucun bien ne correspond."
                />
              </div>
            )}

            {advertiserView === "signalements" && (
              <AdminTable
                columns={[
                  { key: "raison", label: "Raison" },
                  { key: "bien", label: "Bien / Annonceur" },
                  { key: "date", label: "Date" },
                  { key: "statut", label: "Statut" },
                  { key: "action", label: "", align: "right" },
                ]}
                rows={store.propertyReports.map(r => {
                  const reason = REPORT_REASONS.find(x => x.id === r.reasonId);
                  return {
                    _key: r.id,
                    raison: <span>{reason?.emoji} {reason?.label || r.reasonId}{r.refundRequested ? <span className="block text-amber-600 text-[9.5px]">💸 {r.refundedCp} CPS demandés</span> : null}</span>,
                    bien: <span>{r.propertyTitle}<br/><span className="text-gray-400">{r.advertiserPhone}</span></span>,
                    date: formatTxDateTime(r.reportedAt),
                    statut: r.resolved
                      ? <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">Traité</span>
                      : <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">En attente</span>,
                    action: !r.resolved ? (
                      <button onClick={() => { store.resolveReport(r.id); showToast("Signalement marqué comme traité"); }}
                        className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 text-white whitespace-nowrap">
                        Traiter
                      </button>
                    ) : null,
                  };
                })}
                emptyLabel="Aucun signalement pour le moment."
              />
            )}
          </div>
        )}

        {activeTab === "commission" && (
          <div className="px-4 py-5 space-y-5">
            <h2 className="font-extrabold text-slate-800 text-[16px]">Commission</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-2xl border border-gray-100 p-3">
                <p className="text-[10px] text-gray-400 font-semibold">Total versé</p>
                <p className="text-[17px] font-extrabold text-green-700">{commissionTotal.toLocaleString("fr-FR")} F</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-3">
                <p className="text-[10px] text-gray-400 font-semibold">Paiements</p>
                <p className="text-[17px] font-extrabold text-slate-700">{store.commissionPayments.length}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-700 mb-2">Par type de transaction</p>
              <AdminTable
                columns={[
                  { key: "type", label: "Type" },
                  { key: "count", label: "Paiements", align: "right" },
                  { key: "total", label: "Total", align: "right" },
                ]}
                rows={[
                  { _key: "location", type: <span className="font-bold text-blue-600">Location</span>, count: commissionByType.location.count, total: <span className="font-bold">{commissionByType.location.total.toLocaleString("fr-FR")} F</span> },
                  { _key: "vente", type: <span className="font-bold text-orange-500">Vente</span>, count: commissionByType.vente.count, total: <span className="font-bold">{commissionByType.vente.total.toLocaleString("fr-FR")} F</span> },
                ]}
              />
            </div>

            {commissionByZone.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Par zone géographique</p>
                <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-2">
                  <div style={{ width: "100%", height: Math.max(120, commissionByZone.length * 38) }}>
                    <ResponsiveContainer>
                      <BarChart data={commissionByZone} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                        <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v) => `${v.toLocaleString("fr-FR")} F`} />
                        <Bar dataKey="total" fill="#15803d" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <AdminTable
                  columns={[
                    { key: "zone", label: "Zone" },
                    { key: "count", label: "Paiements", align: "right" },
                    { key: "total", label: "Total", align: "right" },
                  ]}
                  rows={commissionByZone.map(z => ({ _key: z.name, zone: z.name, count: z.count, total: <span className="font-bold text-green-700">{z.total.toLocaleString("fr-FR")} F</span> }))}
                />
              </div>
            )}

            {commissionByAdvertiser.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Par annonceur</p>
                <AdminTable
                  columns={[
                    { key: "name", label: "Annonceur" },
                    { key: "count", label: "Paiements", align: "right" },
                    { key: "total", label: "Total", align: "right" },
                  ]}
                  rows={commissionByAdvertiser.map(a => ({ _key: a.phone, name: a.name, count: a.count, total: <span className="font-bold text-green-700">{a.total.toLocaleString("fr-FR")} F</span> }))}
                />
              </div>
            )}

            <div>
              <p className="text-[11px] font-bold text-slate-700 mb-2">Historique chronologique</p>
              <AdminTable
                columns={[
                  { key: "bien", label: "Bien" },
                  { key: "type", label: "Type" },
                  { key: "zone", label: "Zone" },
                  { key: "date", label: "Date" },
                  { key: "montant", label: "Montant", align: "right" },
                ]}
                rows={store.commissionPayments.map(p => ({
                  _key: p.id,
                  bien: <span><span className="font-bold">{p.propertyTitle}</span><br/><span className="text-gray-400">{p.advertiserName || p.advertiserPhone}</span></span>,
                  type: <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.transaction === "location" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{p.transaction === "location" ? "Location" : "Vente"}</span>,
                  zone: p.zone ? (ZONES_COMMUNES[p.zone]?.label || p.zone) : (p.commune || p.district || "Zone inconnue"),
                  date: formatTxDateTime(p.paidAt),
                  montant: <span className="font-bold text-green-700">{(p.commissionAmount || 0).toLocaleString("fr-FR")} F</span>,
                }))}
                emptyLabel="Aucune commission versée pour le moment."
              />
            </div>
          </div>
        )}

        {activeTab === "promo" && (
          <div className="px-4 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-800 text-[16px]">Code Promo ({store.promoCodes.length})</h2>
              <button onClick={() => setShowAddPromo(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-white border border-gray-200 px-2.5 py-1.5 rounded-full">
                <PlusCircle size={13}/>Créer
              </button>
            </div>

            {showAddPromo && (
              <div className="bg-white rounded-2xl border border-gray-100 p-3.5 space-y-2.5">
                <div className="flex gap-2">
                  <input value={newPromoCode} onChange={e => setNewPromoCode(e.target.value.slice(0, 6))} placeholder="Ex : A3b-9K" maxLength={6}
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800 tracking-wide"/>
                  <button onClick={() => {
                      let candidate;
                      do { candidate = generatePromoCode(); } while (store.promoCodes.some(p => p.code === candidate));
                      setNewPromoCode(candidate);
                    }}
                    className="flex items-center gap-1 border border-gray-200 text-slate-700 font-bold text-[11px] px-3 rounded-xl whitespace-nowrap">
                    🎲 Générer
                  </button>
                </div>
                <select value={newPromoType} onChange={e => setNewPromoType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800 bg-white">
                  <option value="cps_bonus">Bonus CPS offert au client</option>
                  <option value="discount_topup">Remise % sur le prochain rechargement</option>
                </select>
                <input value={newPromoValue} onChange={e => setNewPromoValue(e.target.value)} inputMode="numeric" placeholder={newPromoType === "cps_bonus" ? "Nombre de CPS offerts" : "Pourcentage de remise (ex : 10)"}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800"/>
                <input value={newPromoMaxUses} onChange={e => setNewPromoMaxUses(e.target.value)} inputMode="numeric" placeholder="Nombre d'utilisations max (vide = illimité)"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none focus:border-slate-800"/>
                <button onClick={handleAddPromo} className="w-full bg-slate-800 text-white font-bold text-[12.5px] py-2.5 rounded-xl">
                  Créer le code
                </button>
              </div>
            )}

            <AdminTable
              columns={[
                { key: "code", label: "Code" },
                { key: "avantage", label: "Avantage" },
                { key: "usage", label: "Utilisations", align: "right" },
                { key: "statut", label: "Statut" },
                { key: "action", label: "", align: "right" },
              ]}
              rows={store.promoCodes.map(promo => ({
                _key: promo.id,
                code: <span className="font-extrabold tracking-wide">{promo.code}</span>,
                avantage: promo.type === "cps_bonus" ? `🎁 ${promo.value} CPS` : `💸 ${promo.value}% remise`,
                usage: `${promo.usesCount || 0}${promo.maxUses ? ` / ${promo.maxUses}` : " (illimité)"}`,
                statut: promo.active
                  ? <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">Actif</span>
                  : <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">Désactivé</span>,
                action: (
                  <div className="flex flex-col gap-1 items-end">
                    <button onClick={() => { setSharePromoTarget(promo); setShareSelectedClients(new Set(["client-demo"])); }}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-600 whitespace-nowrap">
                      Partager
                    </button>
                    <button onClick={() => store.togglePromoCode(promo.id)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${promo.active ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                      {promo.active ? "Désactiver" : "Réactiver"}
                    </button>
                    <button onClick={() => { store.deletePromoCode(promo.id); showToast(`Code ${promo.code} supprimé`); }}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-50 text-rose-600 whitespace-nowrap">
                      Supprimer
                    </button>
                  </div>
                ),
              }))}
              emptyLabel="Aucun code promo pour le moment."
            />
          </div>
        )}

        {activeTab === "moncompte" && (
          <div className="px-4 py-5 space-y-3">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Mon compte</h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 text-[16px] font-bold text-white">
                  {(admin?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-800 truncate">{admin?.name || "Administrateur"}</p>
                  <p className="text-[11px] text-gray-400">{store.adminUsers.find(u => u.name === admin?.name)?.role || "Administrateur"}</p>
                </div>
              </div>
            </div>
            <button className="w-full flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl px-3.5 py-3 text-left">
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0"><Lock size={15} className="text-slate-600"/></div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-800">Changer le mot de passe</p>
                <p className="text-[10px] text-gray-400">Sécurité du compte administrateur</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0"/>
            </button>
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 mt-4 text-rose-500 font-semibold text-[13px] py-2.5">
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 bg-white flex-shrink-0">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative ${activeTab === tab.key ? "text-slate-800" : "text-gray-400"}`}>
            <tab.icon size={17}/>
            <span className="text-[8px] font-semibold text-center leading-none">{tab.label}</span>
            {tab.key === "annonceur" && pendingReports.length > 0 && (
              <span className="absolute top-1 right-[24%] w-2 h-2 bg-rose-500 rounded-full"/>
            )}
          </button>
        ))}
      </div>

      {sharePromoTarget && (
        <PromoRecipientSheet
          promo={sharePromoTarget}
          clients={shareableClients}
          selected={shareSelectedClients}
          onToggle={(id) => setShareSelectedClients(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onSelectAll={(selectAll) => setShareSelectedClients(selectAll ? new Set(shareableClients.map(c => c.id)) : new Set())}
          onClose={() => setSharePromoTarget(null)}
          onSend={() => {
            handleSharePromo(sharePromoTarget, [...shareSelectedClients]);
            setSharePromoTarget(null);
          }}
        />
      )}

      {toast && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[12px] font-semibold px-4 py-2.5 rounded-full shadow-lg z-[300] whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Écran de connexion (application autonome) ─────────────────────
function AdminLoginScreen({ onLoginAdmin }) {
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col border-x border-slate-200 font-sans">
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0">
        <span>9:41</span><div className="flex items-center gap-1.5"><Wifi size={14}/><BatteryFull size={18}/></div>
      </div>
      <div className="flex-1 flex flex-col px-8 pt-10 pb-8">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-800">
            <Lock size={24} className="text-white"/>
          </div>
        </div>
        <h1 className="text-[18px] font-extrabold text-slate-800 text-center mb-1">Administration Imoobilis</h1>
        <p className="text-[13px] text-gray-400 text-center mb-7">Application détachée — accès réservé à l'équipe Imoobilis</p>
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Identifiant</label>
            <input value={adminUser} onChange={e => setAdminUser(e.target.value)} placeholder="admin"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-slate-800 text-slate-800"/>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Mot de passe</label>
            <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-slate-800 text-slate-800"/>
          </div>
          <button
            disabled={!adminUser.trim() || !adminPass.trim()}
            onClick={() => onLoginAdmin({ name: adminUser.trim() })}
            className={`w-full font-bold text-[14px] py-3.5 rounded-xl mt-2 ${adminUser.trim() && adminPass.trim() ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-400"}`}
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Racine de l'application ────────────────────────────────────────
function AdminRoot() {
  const [adminProfile, setAdminProfile] = useState(null);
  return (
    <div className="w-full h-screen bg-slate-900 flex items-center justify-center">
      {!adminProfile ? (
        <AdminLoginScreen onLoginAdmin={setAdminProfile} />
      ) : (
        <AdminApp admin={adminProfile} onLogout={() => setAdminProfile(null)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AdminStoreProvider>
      <AdminRoot />
    </AdminStoreProvider>
  );
}
