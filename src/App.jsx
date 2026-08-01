import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Menu, Bell, Search, SlidersHorizontal, Filter,
  Radar, BellPlus, Home, Heart,
  BedDouble, Bath, Maximize2, ChevronRight,
  ChevronLeft, Plus, Minus,
  LocateFixed, Building2, Trees, Briefcase,
  X, Newspaper, User, Trash2,
  LogOut, Wifi, BatteryFull, ToggleRight,
  ToggleLeft, Check, Phone,
  Share2, Car, Footprints,
  CalendarDays, MapPin, Navigation, Clock,
  ShoppingCart, GraduationCap, Cross, Coffee,
  Utensils, Dumbbell, Bus, ChevronDown, Star,
  CheckCircle2, AlertCircle, Sofa, Users, Image as ImageIcon, MessageCircle, Send,
  Lock, BadgeCheck, Crown, Mail, Eye, EyeOff, HelpCircle, LifeBuoy, ChevronUp, Wallet,
  BarChart2, TrendingUp, Package, PlusCircle, Edit2, Camera, FileText, Bell as BellIcon,
  ArrowLeft, Upload, Tag, DollarSign, MapPinned, Layers, ClipboardList, Activity,
  Megaphone, Target, Rocket, Sparkles, AlertTriangle, Settings, ShieldCheck,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════════════════════════
// SUPABASE — backend partagé avec ImoobilisAdmin.jsx (voir sql/README.md).
// Intégration volontairement progressive : pour l'instant, seule la table
// "properties" est branchée (voir SharedStoreProvider plus bas). Le reste
// de l'app (portefeuille CPS, codes promo, visites...) continue de
// fonctionner en mémoire, comme avant, en attendant les prochaines passes.
//
// La clé "anon" ci-dessous est volontairement publique (conçue pour être
// utilisée côté navigateur) — la vraie sécurité viendra des politiques RLS
// posées sur les tables, pas du secret de cette clé.
// ══════════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://bueuoolgnjkwiwoqjgom.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZXVvb2xnbmprd2l3b3FqZ29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODM2OTgsImV4cCI6MjA5OTQ1OTY5OH0.h-KSQHmm66nFqjAy5HnI8z1FPjM2uA2sSVXuk_mD9bw";

// Appel générique à l'API REST auto-générée par Supabase (PostgREST) —
// pas de SDK à importer, un simple fetch() suffit et fonctionne dans
// n'importe quel environnement, y compris cet aperçu d'artefact.
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

// Identifiant unique compatible avec la colonne UUID de Postgres — les
// biens créés dans l'app doivent utiliser le même id en local et en base,
// pour ne jamais avoir à réconcilier deux identifiants différents après
// coup (voir handleAdd côté AdvertiserApp).
function newId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Trouve ou crée un client par numéro de téléphone (upsert), renvoie son
// UUID réel en base — même logique que upsertAdvertiserByPhone ci-dessous,
// utilisée pour synchroniser le portefeuille CPS (voir SharedStoreProvider).
async function upsertClientByPhone({ phone, nom, prenom, email, localisation }) {
  if (!phone) return null;
  const rows = await supabaseFetch(`clients?on_conflict=phone&select=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ phone, nom, prenom, email, localisation }]),
  });
  return rows?.[0]?.id || null;
}

// Trouve ou crée un annonceur par numéro de téléphone (upsert), renvoie
// son UUID réel en base. Nécessaire car properties.advertiser_id référence
// la table advertisers, alors que la connexion annonceur de cette démo se
// contente d'un numéro/nom saisis (aucun compte persistant créé au
// préalable) — voir LoginScreen.
async function upsertAdvertiserByPhone({ phone, name, type }) {
  if (!phone) return null;
  // select=id : sans ça, Supabase tente de renvoyer TOUTES les colonnes
  // après l'upsert, y compris pin_hash — qui n'est justement plus lisible
  // par la clé publique (voir 012_enable_rls.sql) et fait alors échouer
  // toute la requête avec une erreur 42501 (insufficient_privilege).
  const rows = await supabaseFetch(`advertisers?on_conflict=phone&select=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ phone, name, type: type || "particular" }]),
  });
  return rows?.[0]?.id || null;
}

// Convertit une ligne Supabase (avec l'annonceur imbriqué via
// select=*,advertisers(...)) vers le format attendu par le reste de l'app
// (mêmes noms de champs que les biens créés localement).
function dbRowToProperty(row) {
  const adv = row.advertisers || {};
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    transaction: row.transaction,
    description: row.description || "",
    zone: row.zone || null,
    commune: row.commune || null,
    district: row.district,
    price: row.price,
    priceMode: row.price_mode || null,
    area: row.area,
    beds: row.beds,
    baths: row.baths,
    amenities: row.amenities || [],
    images: row.images || [],
    videoUrl: row.video_url || null,
    topoReference: row.topo_reference || "",
    topoPoints: row.topo_points || [],
    topoAreaM2: row.topo_area_m2 || null,
    isSuspended: !!row.is_suspended,
    suspendedAt: row.suspended_at || null,
    publishedAt: row.published_at,
    lastConfirmedAt: row.last_confirmed_at,
    views: row.views || 0,
    explorations: row.explorations || 0,
    contacts: row.contacts || 0,
    commissionRate: row.commission_rate != null ? parseFloat(row.commission_rate) : 0,
    commissionAmount: row.commission_amount || 0,
    advertiserId: row.advertiser_id,
    // distance et mapPin n'existent pas en base (ce sont des valeurs
    // d'affichage calculées côté client dans cette démo, pas de vraies
    // colonnes) — sans repli ici, tout bien venant de Supabase plantait
    // l'app dès qu'un écran tentait de les afficher (voir formatDistance
    // et pinToLatLng).
    distance: row.distance ?? (0.5 + Math.random() * 3),
    mapPin: row.map_pin || { top: 20 + Math.random() * 60, left: 20 + Math.random() * 60 },
    advertiserName: adv.name || row.advertiser_name || "—",
    advertiserPhone: adv.phone || row.advertiser_phone || "",
    advertiserType: adv.type || "particular",
  };
}

// Écrit (création ou mise à jour) un bien dans Supabase, en tâche de fond —
// n'est jamais attendu par l'interface (voir publishProperty) : l'app
// reste immédiate/optimiste, la persistance suit derrière. Les erreurs
// réseau sont journalisées en console sans jamais bloquer l'usage local.
async function syncPropertyToSupabase(prop) {
  const advertiserId = prop.advertiserId || await upsertAdvertiserByPhone({
    phone: prop.advertiserPhone, name: prop.advertiserName, type: prop.advertiserType,
  });
  if (!advertiserId) return;
  const row = {
    id: prop.id,
    advertiser_id: advertiserId,
    title: prop.title,
    category: prop.category,
    transaction: prop.transaction,
    description: prop.description || "",
    zone: prop.zone || null,
    commune: prop.commune || null,
    district: prop.district,
    price: prop.price,
    price_mode: prop.priceMode || null,
    area: prop.area,
    beds: prop.beds ?? null,
    baths: prop.baths ?? null,
    amenities: prop.amenities || [],
    images: prop.images || [],
    video_url: prop.videoUrl || null,
    topo_reference: prop.topoReference || null,
    topo_points: (prop.topoPoints && prop.topoPoints.length) ? prop.topoPoints : null,
    topo_area_m2: prop.topoAreaM2 || null,
    is_suspended: !!prop.isSuspended,
    suspended_at: prop.suspendedAt || null,
    published_at: prop.publishedAt,
    last_confirmed_at: prop.lastConfirmedAt,
    views: prop.views || 0,
    explorations: prop.explorations || 0,
    contacts: prop.contacts || 0,
    commission_rate: prop.commissionRate,
    commission_amount: prop.commissionAmount,
  };
  await supabaseFetch(`properties?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
}

const LOGO_SRC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAA7ANUDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKRm2ivmr9vf9u6D9mTR4tK0M2d94pvgcxM2fsaY4dsd89Aa2w+HnXqKnTWrMq1aFKHPN6HsnxW+P3hH4KWIn8S67ZaaGICo75kbPoo5rw3xL/wVu+GGga3NaQ/2tqMcRwJ4IRsk+mea/Mzxl431X4h69Pqes6jc6he3Ls7vM5bqc4HoPpWSY1HevtcPwtRiv8AaG2/I+Wr8Q1L2pJJH6d/8Phfhrj/AI8te/78j/Gj/h8L8Nc/8eWvf9+R/jX5h+UuPvfX3pdi+tdX+rGDS6/eYLPcVa+n3H6dH/gsN8NP+fLXv+/I/wAaUf8ABYb4aH/ly17/AL8D/GvzEMa/3qTy1/vUf6sYNLW/3jWe4lvS1vQ/Tsf8Fh/hr/z5a9/34H+NA/4LC/DX/nz13/vyP8a/MXy1/vUbF/vfpVLhjBdU/vJ/t7Fd19x+nX/D4X4aj/ly13/vyP8AGgf8Fhfhqf8Aly17/vyv+NfmL5a/3qTYv96pfDGDXf7xrPsU9rfcfp2f+Cwvw1P/AC5a/wD9+F/xrgfGX/Bwb8GvA/iW60u707xS1xaFQ5S2XHKhvX0Ir4D2L/er5U/aLIHxn1v/AHov/RSV4meZRh8LQVSje7dtz1MpzKtiKrhU6K/4n7Kf8RHPwS/6Bniz/wABV/xo/wCIjn4Jf9AzxZ/4Cr/jX4a7h6Ubh6V8qfQn7lf8RHPwS/6Bniz/AMBV/wAaP+Ijn4Jf9AzxZ/4Cr/jX4a7h6Ubh6UAfuV/xEc/BL/oGeLP/AAFX/Gj/AIiOfgl/0DPFn/gKv+NfhruHpRuHpQB+5X/ERz8Ev+gZ4s/8BV/xo/4iOfgl/wBAzxZ/4Cr/AI1+Gu4elG4elAH7lD/g44+CLMB/ZviwZOM/ZV4/WvoP4M/8FQvgf8dLtLXRfHelJeNCsxgu3+zsu7+HLYBIJ6V/NluA7UJIYm3ISpznIOD+fagD+sq2u4ry3SWKRJYpBuV0YMrD1BFSV+A//BOf/gsp42/ZH1vTfD3ia6n8SeAHuP8ASIbhjJc2SNgFo3POB1xX7qfCb4s6B8b/AADp3ibwzqNvqmjapEJYJ4myCD2PoR3FAHSUUUUAY/xA8Ww+A/BWqazcFBFpts9wdzBQdqkgZPrX4mfGD4k3nxd+JWseIr+QvcancNL1+6uflX8BX6z/APBQBHk/ZG8ZhAxb7Hn5Rz94V+OQXOMV9pwrTioTrPfY+X4hnJuNNbHXfADwtY+N/jr4O0bU4ftOnarrFtaXUW4r5kbyAMMggjIPUGvsH/gpN+xh8N/2fv2eYNe8J+H/AOy9VfWba0MxvZ5sxushZdruw52jt2r5L/ZUf/jKD4e/9jFZj8PNWv0F/wCCyAx+yRa/9jDZ/wDoEtd+b1qizDDxhJ2f+Zy5bShLDVnJXaX6M5r9jT9g34TfFT9lrwp4m8S+GxdapqNo0l3ctqFxEHbzXXOFkCjgDoK+e/25/wBkXTvhR+1n4b8LeE7F7HR/GEdqLGDzHl8uRpfJlG5yWPOG5PG6vqv4G6nNof8AwSUS9tmK3Fl4YvbiEjs6NKy/qBXf3/wxsv2mPFHwV+JkPktDoUUmqN6yLPagoB/uy7T+BrwVmFahi51JybjeStf1selHB06uEjTjFczSf5XMi2/4JhfBBAsJ8JeZIirvJ1S63H3IEnfBr4E+An7I1x+0n+1FrvhHTJDpWhaLf3TXt1gyG0tUnZERc/edsBVz6EnpX6SfAD4k/wDCxfjj8XESQva6Bq1rpEIzwpitlMmP+2jv+VeC/wDBKdLUfFb45H5Ptv8Ab/H97yvOuP03ZqcJjMTRhWnKTbUVv0vb/MvE4XD1HTjGKScmvuv/AJHS+Mf2fP2Xf2T9MsNO8Y2GgR3V6u6J9XaW9u7kDguQoJVc9wqrmuf/AGg/+CZPw++Lvwvk8S/CgQaXqTWxvLFLO5abTtWXGdgBJ2E9FKkAHqOtfNv/AAVXe6P7aev/AGjf5a6fYi13dPK8ofd9t+/8c19j/wDBJFrpv2NNL+1GQxjU7wWu/PEXm8bfbdu/Wtaka+HwkMfGq+Z2uumpnGVGriZYOVNcq/Q+DP2Mf2TL/wDay+LD6KZ5dL0nSY/tGr3WzMkKbtoiQHjzGII56bWPOMH7e8Y/An9lj9lm3sNI8Xaf4dt728TfEdWMt7dzL03tjcVUnPOFXg4qt/wTLTTU+Jfx6+x+VkeL5NuzH+p3SbPw3b6+R/8Agp09037bfi37Zv4jtRb7u0P2dNuPbO78c131atbH4/6u5uMVFPTTon+pzUqNPCYV1VFSldrX1t+h9M/tOf8ABMXwN8QPhdN4q+FKJp+oR2pvra2tblp7DV49u7amSdjEfdKnbnAI5yPkj/glR+w18L/20fjX8Zh8SfDP/CQf8I++lixBvri1Nv5sMnmf6mRM52L97OMV+gv/AASrN037FXhn7V5mPPuxb78/6n7Q+3Ht1xXzn/wRaS3T9sH9qgWm37KNcshDt6bM3OMe2K8XFVqvsquGqS5lB6N/M9GhTg508RBcvMtbGt44/wCCfH7A3wz+JsXgzxFB4Q0PxXM0KppV94wvILpjNjyvka5B+fIx65r51/4LJf8ABHf4dfsxfs/y/FD4ZLf6DHpN5Bbano1xePdW00UziMSRNITIjq5XK7iGBPQjn7C/ay/ag/Y++D37ULWvxY07wkvxJsUtLltQ1DwpJezQLgNA5uRCwAUYI+b5cdq4j/gvd8CPGXx0/Y3m8VeGPF//ABSPhGOPW9R8PJbr5WrxDn7UJwdxMavuEZ+UjJ+8BXz037nMe3H4+U8m/wCCPP8AwS7+B37VH7EGjeMfHXgr+2/EV1qd/by3X9qXlvuSKdlQbIpVUYUAdK+Zf+CY37IXw9/aH/4KW+OPh94v0D+1vCOjrrJs7H7XPD5P2e8WOL95G6udqEjlue+a/Rv/AIN+18v/AIJreHh/1GNT/wDSlq+Lf+CLh/43K/Ez/rn4g/8ATgtdDS9vbyf5GGvsr+a/M4j/AILsfsZfDf8AYw+J/wAPdN+G/h7/AIR6z1zS7u4vY/ttxc+dIkqKpzM7kYBPTHWvg67kMVpKy8FUJB/Cv1C/4OeRu+NXwoP/AFBL7/0fHX5eX/8Ax4zf9c2/lWNF3b9ToqJaeh+1HxZ/4JLfADwz/wAE4dX8fWXgTyfFdr4BOtxXv9r3rbbv7CJfM2GbZ9/nG3HtXyh/wRK/4Je+Gv25rzxD4w+ID3Vz4R8L3MdhDpdtO0H9qXTIJH82RcOsaKycKQWL9cDB/T347fL/AMEf9f8A+yWE/wDlNFflj/wRi/bW+In7IOq6xbab8L/GnxG+H/imeJ70aDpk089jcxjZ5sLBTG52nDRkjO1cEEYNR/jSS7K3rdmf/LqLff8ARH2R4c0T9gjxV+1df/AQfCzSLDxjaTy6aJLzSJbeG5niUl447kv5m7CnDHAbHyse/wAR/wDBZT/gnx4Q/Yl+Jegan8PdVjuPCPi0TKNMe+F1Po9zFtLIGyXMTq2VL5IKsMniv058K/th/smf8FEfEMfhTV4PDGpeK7x2tBovizQ/seqCZNwMStKgPmLhhiNyQenNfA3/AAWz/wCCU/hL9jPR9F+Inw4W607wzrWo/wBl6ho007Tpp87q0kTwu5LiNgjAoxOCBg84Gc7qzZcdW0j88Qf8+tfqr/wbe/tWXVt4i8Q/CfUJ1NjNGdU03fIB5cg4dFB5ORzivyrc4+nb619Yf8ESYXl/4KO+BSgdghmZgvOF8s8mtCT+h6iiigDM8Z+GofGXhPUdKuP9TqNu9u5xnAYEZr8T/jn8Kr74K/FbWfDl+jCXTrhkRj0kjzlWH1GK/cI8ivm39vn9hn/hqfSrTUdHnt7LxJpgKKZVxHdxn+Fj1yOxr3chzKOFrctR+5Lc8nN8C8RSvD4kfml+z54isfBfx48G6xqdwLTTdJ1i2urudlJEMayAsxABJwB2BNfY3/BS39sH4bfHn9nSDQvCfii21jVV1i2ujbx280Z8tFkDNl0UcFh3718WfEz4R+IfhH4huNM8RaXdafcROUzKhCS4OMqehFc2E2N6Hp719tVwVHFVqeJ5vh2tbU+VpYqphoTo2+I+8vhn+198ONB/4Jtt4GvPE9tD4qbw5eWI0828xbz38zam4Js53DnOOetb37CX7f3w/wDhj+yzpOgeLvEUWna54e8+3itXt5neaEMWiwyoV5DbevavzvKDOcUjJurlqcP0KvOm370uY2p5rVg4cqXuq35f5H3J/wAE2v2yvBXwv0r4g3njzxJBo+peJdfbVEWWCWQyK65Y5RWHUkV4j+z3+18/7Nf7UOveKbON9V8O67fXS39vGdrXNq9wzpKm7HzrkMM4yCQcZrwoLhNvb0o8rHRfb8K6Y5RQVWdSWqmkmvQyeY1XCMP5Xe/9ep+ofjn4t/su/teWen6n4q1fw3PdWSBY/wC0rmTTbyBT8xiY5QsuT0yy5zisb4+f8FH/AIb/AAF+FB8M/CuSy1TU4bU2mnpp8RXT9KBBAkZ8AOVzkKudx6kc1+aoXFIYh6c4xXBHhqimrzk4r7N9Dred1LNxglJ9T2f9iX9ru6/ZT+Ls2s3EU+p6Lry+Rq9ujDzZBu3CZM8b1Yk4PUMw4619u+PPiX+yz+1r9h1rxRrHhe5vbVBGjX91Lpt2i9fKcZRmAJPByOuK/LwIFHH4e1GMnmuvFZNTr1VWjJwltdHPhszqUoOm0pRfRn6Q/tJ/8FJvh/8ACD4VTeE/hVNa6nqi2n2GyewhKafo6EFd4bADso5VVzzgk+vyJ/wSd/bY+F/7Hvxr+NLfErxfa+F/7fk0trE3FvPMboxwyeYf3SNjG5c5x1rxjyge1fK37RkIb4za52+aMf8AkJK8LOMupYLB8sNXKWre70Z62W4yeKxN56KK0S2P2X+KX7Xv/BPf44fEdvF/i7U/h94k8SlIg2oX+g3s0rLEMRg5gwQo4AIryL/gqf8A8FtPhj8Sf2YfEPw0+E8174gvvFdv/Zl1qJsZLSx0+zOPM8vzArO7KNgAXC5JJ4AP5Iqu0df4dtDJu9OOnNfGON1y9D6dOzufr/8A8Ebf+CmPwO/Zo/YZ0Twl47+INh4f8R22p380tlLZ3UrIkk7Mh3RxMvKkHrXzD/wS8/au+HvwC/4Kb+O/Hni/xLbaL4S1ZNZFpqMkE0iT+feCSLCojONyc8qPfFfDscQixjsc9acvy+lacz5+fysRyrl5T92fjv8At0fsFftPanp178QfEfgnxbdaVE9vZy6jo19K1ujkMyqfJ4BIB/Cvjf8A4KneLf2MfEH7J91bfAW28Ex+Pm1O1KHStKuba4+zZbzvnkjVcYxkZ5r87PL+UDI45FOC4PUVFi09T9rfi5/wVR+AHiL/AIJrax4GsviRp0/iu5+H50aLTxY3Yd7v7CI/J3GLZnf8ud2Pevmf/giD/wAFVvC/7HvhrVfhv8Srm40vwpqF2dU0rV44Xmj06dwqzRTKgL+W+0MGAOG3AjBBH50lNw6in7yB/D0xT+05dxW91R7H7WXHg39gQftLr8bh8SPCcXiGDURr32SLxJ/oRvQd3n/ZB8/mb/n2jjdzt7V8nf8ABbL/AIKo+Hf21X0LwJ8PTdXPg3w/enUrvVZ4Wg/ta6CMkflIwDCJFdzuYAsW6ADJ+ACgVe3/ANep7SwuNauhHbQTXMp+6kMZdjzjoKVtEuiGtHchY4b/AD+tfrR/wbgfsmXdkfEPxa1KJooJkOl6WjL/AK3oXkGR9ACK8Z/4Jwf8EPfFv7Quq6X4q+ItvL4a8Fxz73sZlMd7qKrggBf4UPSv228CeBNJ+GXhKx0LQrC30zSdNhWC2toECpGoGBTEa9FFFABSEZpaKAMDx58LPDvxP077Lr+j2GqwAghbiINgj0PWvGvEv/BMX4S+JtamvW0Wa0aY5MVtcFI1+g7V9CUVvSxVal/Dk18zKpQp1PjimfNn/Dqb4RY/5Buo/wDgY1H/AA6l+Ef/AEDdR/8AAxq+k6K6P7Uxf/Px/eY/UMN/IvuPmw/8EpfhH/0DdS/8DGpD/wAEpPhH/wBA3Uf/AAMavpSij+1MX/z8f3h9Qw38i+4+bB/wSl+EQ/5hupf+BjUD/glN8Ix/zDdR/wDAxq+k6KX9p4v/AJ+P7w+oYf8AkR82H/glL8Iz/wAw3Uf/AAMaj/h1N8I8f8g3Uf8AwLavpOij+08X/wA/H94fUMN/Ij5r/wCHUvwj/wCgbqH/AIFtXG+Kf+CFvwC8Y69cale6Nqz3VyQZCuoMAcAKP0Ar7GorKtjK9ZctWbaNKWGpUnenGx8U/wDDgj9nf/oCax/4MXo/4cEfs7/9ATWP/Bi9fa1FcxufFP8Aw4I/Z3/6Amsf+DF6P+HBH7O//QE1j/wYvX2tRQB8U/8ADgj9nf8A6Amsf+DF6P8AhwR+zv8A9ATWP/Bi9fa1FAHxT/w4I/Z3/wCgJrH/AIMXo/4cEfs7/wDQE1j/AMGL19rUUAfFS/8ABAn9nhWB/sPV+DnnUHr334S/sOfCf4HzLL4a8C+H7C4EKwGf7MryOq9Mls8+9esUUAIqBFAAAA4AA6UtFFABRRRQB//Z";

const CATEGORY_META = {
  Villa: { icon: Home, gradient: "from-green-600 to-green-800" },
  Maison: { icon: Home, gradient: "from-green-600 to-green-800" },
  Duplex: { icon: Home, gradient: "from-green-600 to-green-800" },
  Appartement: { icon: Building2, gradient: "from-orange-400 to-orange-600" },
  Studio: { icon: Building2, gradient: "from-orange-400 to-orange-600" },
  Terrain: { icon: Trees, gradient: "from-lime-600 to-green-700" },
  Bureau: { icon: Briefcase, gradient: "from-slate-500 to-slate-700" },
};

const AMENITY_POOL = ["Piscine", "Garage", "Jardin", "Climatisation", "Sécurité 24/7", "Meublé"];

// ── Communes en zone premium (forte demande locative) ──
// Dans ces communes, le tarif des plans "Location" est plus élevé.
const PREMIUM_DISTRICTS = ["Treichville", "Marcory", "Koumassi", "Cocody"];
function isPremiumDistrict(district) { return PREMIUM_DISTRICTS.includes(district); }

// ══════════════════════════════════════════════════════════════════
// SYSTÈME CLIENT — 100% CRÉDIT-POINTS, SANS ABONNEMENT NI ZONE
// ══════════════════════════════════════════════════════════════════
// Plus de plans zonaux ni de durée d'activation : tous les biens
// d'Abidjan sont visibles librement par tous les clients, sans filtre
// payant. Seules les actions à coût réel pour Imoobilis (contacter un
// annonceur, programmer une visite, ouvrir un pin sur la carte GPS)
// sont facturées en CPS, à l'usage, au moment où elles sont effectuées.
// Le compte client n'expire jamais : il reste actif tant qu'il existe,
// et chaque action est simplement bloquée ponctuellement si le solde
// CPS est insuffisant — incitant à recharger plutôt qu'à attendre.

// (Paiement unique : contacter l'annonceur débloque à la fois le contact
// ET la programmation de visite, qui devient gratuite ensuite — voir
// contactAdvertiserWithCP et ContactAdvertiserSheet.)

// ── Forfait unique à l'ouverture d'un bien (stratégie "pin unique") ──
// Un bien affiché dans les résultats est déjà le fruit d'une chaîne de
// services Google engagés en amont (recherche d'adresse, géocodage) —
// cliquer dessus pour voir sa fiche complète revient donc à "cliquer sur
// son pin". Plutôt que facturer séparément l'ouverture d'un pin sur la
// carte ET l'affichage des services à proximité, un seul débit à
// l'ouverture de la fiche couvre le forfait complet : carte, POI à
// proximité, street view, trajet — accès permanent au bien ensuite,
// comme le contact. Le parcours de recherche (autocomplétion, liste,
// carte en mode aperçu) reste 100% gratuit ; seul le passage à la fiche
// complète d'un bien déclenche le débit. La vidéo aérienne 3D reste
// hors forfait (service distinct, tarif propre — voir plus bas).
//
// Le coût suit désormais une grille indexée sur le prix (même logique
// que le contact), plutôt qu'un tarif unique : un bien plus qualifié
// mobilise davantage la chaîne Maps/services associée.
// LOCATION — Calibrage : ≤ 250 000 F → 1 CPS (inchangé) ; 250 001–500 000 F → 1,5 CPS.
const CP_GRID_EXPLORATION_LOCATION = [
  { max: 250000,     cp: 1 },
  { max: 500000,     cp: 1.5 },
  { max: 1000000,    cp: 2 },
  { max: 2000000,    cp: 2.5 },
  { max: Infinity,   cp: 3 },
];
// VENTE — Calibrage : ≤ 50 000 000 F → 1 CPS. Paliers suivants extrapolés
// selon la même progression que LOCATION (+0,5 CPS à chaque doublement du
// prix) faute d'autre repère donné — à confirmer/ajuster si besoin.
const CP_GRID_EXPLORATION_VENTE = [
  { max: 50000000,    cp: 1 },
  { max: 100000000,   cp: 1.5 },
  { max: 250000000,   cp: 2 },
  { max: 500000000,   cp: 2.5 },
  { max: Infinity,    cp: 3 },
];
// Coût flat de secours si le type de transaction ou le prix est inconnu.
const PROPERTY_SERVICES_BUNDLE_CP = 1;
const MAP_WELCOME_FREE = 5;  // ouvertures gratuites à la création du compte
// Alias conservé pour compatibilité de lecture avec le code existant
const CP_MAP_OPEN = PROPERTY_SERVICES_BUNDLE_CP;

// Calcule le coût CPS d'ouverture de la fiche complète d'un bien
// (forfait carte/POI/street view/trajet). Indexé sur le prix, avec une
// grille dédiée par type de transaction (LOCATION ou VENTE) ; coût flat
// de secours si le prix est absent.
function computeExplorationCP(property) {
  if (!property || !property.price) return PROPERTY_SERVICES_BUNDLE_CP;
  const grid = property.transaction === "vente" ? CP_GRID_EXPLORATION_VENTE : CP_GRID_EXPLORATION_LOCATION;
  return computeCPCost(property.price, grid);
}

// ── Coût CPS des autres services facturés à l'usage ──
// Chaque service Imoobilis a un coût en CPS, proportionnel à la charge
// qu'il représente (notification récurrente, mobilisation de l'annonceur,
// appel à une API tierce, etc.) — jamais d'abonnement, uniquement du CPS.

// Création d'alerte : coût flat, indépendant du prix recherché — l'alerte
// déclenche un service de veille/notification continu, pas une action
// ponctuelle liée à un bien précis. Aligné sur le coût d'un pin carte (1 CPS)
// pour rester accessible tout en couvrant le coût de la veille automatisée.
const ALERT_CREATE_CP = 1;

// Programmation de visite : incluse gratuitement dans le paiement unique du
// contact (contactAdvertiserWithCP) — un seul débit CPS côté client couvre
// à la fois la mise en relation et la coordination de la visite, quel que
// soit le nombre de créneaux pris ensuite.

// ── Services basés sur Google Maps Platform — modèle "forfait unique" ──
// Autocomplétion et recherche restent 100% gratuites (favorise
// l'exploration). Dès qu'un client ouvre la fiche complète d'un bien
// (openDetail), TOUT le reste de la chaîne Maps est débité en une seule
// fois via PROPERTY_SERVICES_BUNDLE_CP, accès permanent ensuite. Seule la
// vidéo aérienne 3D (Aerial View) reste hors forfait, en service distinct
// à la demande — rendu lourd, réservé aux biens haut de gamme.
//
// • Places API — Autocomplete (recherche adresse)..... gratuit, à tout moment
// • Maps SDK (affichage carte + pins, aperçu)......... gratuit, à tout moment
// • Geocoding API (adresse → coordonnées GPS)......... inclus, côté annonceur à la publication
// • Place Details / Maps SDK (fiche complète)......... voir CP_GRID_EXPLORATION_LOCATION, à l'ouverture
// • Street View Static API (immersion 360°)........... inclus dans le forfait ci-dessus
// • Distance Matrix / Routes API (trajet, itinéraire).. inclus dans le forfait ci-dessus
// • Places API — Nearby Search (POI à proximité)...... inclus dans le forfait ci-dessus
// • Advanced Markers (prix affiché sur le pin)......... inclus, améliore la lisibilité de la carte
// • Aerial View API (vidéo drone 3D, biens de prestige). computeAerialViewCP(price) CPS, à la demande

// Vidéo aérienne 3D : rendu Aerial View coûteux (appel API lourd, traitement
// asynchrone côté Google) → facturé à la demande, réservé aux catégories de
// biens qui justifient l'effet "prestige" (Villa, Duplex, Maison haut de
// gamme). Un même bien ne débite les CPS qu'à la première génération.
// Coût indexé sur le prix plutôt que fixe : un tarif plat de 6 CPS devenait
// dérisoire face au coût du simple contact sur les biens > 60M F (jusqu'à
// 35 CPS) — incohérent pour une fonctionnalité positionnée "prestige". Le
// palier supérieur (100M F+) reflète mieux la valeur perçue sur le très
// haut de gamme, où la sensibilité au prix du service est la plus faible.
const AERIAL_VIEW_CATEGORIES = ["Villa", "Duplex"];
const AERIAL_VIEW_MIN_PRICE = 40000000; // sinon le rendu drone n'apporte pas assez de valeur
const AERIAL_VIEW_HIGH_TIER_PRICE = 100000000;
const AERIAL_VIEW_CP = 6;            // 40M–100M F
const AERIAL_VIEW_CP_HIGH_TIER = 10; // ≥ 100M F

function computeAerialViewCP(price) {
  return (price || 0) >= AERIAL_VIEW_HIGH_TIER_PRICE ? AERIAL_VIEW_CP_HIGH_TIER : AERIAL_VIEW_CP;
}

function isAerialViewEligible(property) {
  if (!property) return false;
  if (!AERIAL_VIEW_CATEGORIES.includes(property.category)) return false;
  return (property.price || 0) >= AERIAL_VIEW_MIN_PRICE;
}

// ── Montants de rechargement Mobile Money proposés par défaut ──
const TOPUP_PRESETS = [2500, 5000, 10000, 25000, 50000];

// Bonus de rechargement : un pourcentage du montant rechargé est crédité
// en plus, sur un solde "bonus" dépensé en priorité lors des achats.
function computeTopUpBonus(amount) {
  if (amount >= 25000) return Math.round(amount * 0.08); // +8%
  if (amount >= 10000) return Math.round(amount * 0.05); // +5%
  return 0;
}

// ══════════════════════════════════════════════════════════════════
// SYSTÈME DE CRÉDIT-POINTS (CPS)
// 1 CPS = 100 FCFA rechargés. Les CPS ne s'expirent jamais.
// ══════════════════════════════════════════════════════════════════

// Coût CPS pour le CLIENT : contact de l'annonceur.
// Ce service n'est PAS un appel API Google (contrairement au forfait
// carte/POI/trajet ci-dessus) — c'est la mise en relation avec
// l'annonceur (contact + visite incluse), la valeur centrale d'Imoobilis.
//
// LOCATION — le coût de contact n'est plus une grille indépendante : il
// est directement dérivé du coût d'exploration du même bien (voir
// CP_GRID_EXPLORATION_LOCATION), multiplié par CONTACT_TO_EXPLORATION_MULTIPLIER.
// Calibrage : pour tout loyer ≤ 250 000 F, l'exploration coûte 1 CPS et
// le contact reste fixé à 20 CPS → multiplicateur = 20.
// • Loyer ≤ 250 000 F              → exploration 1 CPS   → contact 20 CPS
// • Loyer 250 001–500 000 F        → exploration 1,5 CPS → contact 30 CPS
// • Loyer 500 001–1 000 000 F      → exploration 2 CPS   → contact 40 CPS
// • Loyer 1 000 001–2 000 000 F    → exploration 2,5 CPS → contact 50 CPS
// • Loyer > 2 000 000 F            → exploration 3 CPS   → contact 60 CPS
const CONTACT_TO_EXPLORATION_MULTIPLIER = 20;

// VENTE — même principe que LOCATION : le contact est dérivé du coût
// d'exploration du même bien (CP_GRID_EXPLORATION_VENTE), multiplié par
// CONTACT_TO_EXPLORATION_MULTIPLIER_VENTE. Calibrage : pour toute vente
// ≤ 50 000 000 F, l'exploration coûte 1 CPS et le contact 35 CPS →
// multiplicateur = 35.
// • Vente ≤ 50M F         → exploration 1 CPS   → contact 35 CPS
// • Vente 50M–100M F      → exploration 1,5 CPS → contact 53 CPS
// • Vente 100M–250M F     → exploration 2 CPS   → contact 70 CPS
// • Vente 250M–500M F     → exploration 2,5 CPS → contact 88 CPS
// • Vente > 500M F        → exploration 3 CPS   → contact 105 CPS
// (Paliers au-delà de 50M extrapolés comme pour LOCATION, faute d'autre
// repère donné — à confirmer/ajuster si besoin.)
const CONTACT_TO_EXPLORATION_MULTIPLIER_VENTE = 35;

// Calcule le coût CPS pour CONTACTER l'annonceur d'un bien (mise en
// relation + visite incluse). LOCATION et VENTE sont toutes deux dérivées
// du coût d'exploration du même bien, chacune avec son propre multiplicateur.
function computeContactCP(property) {
  if (!property) return 0;
  const multiplier = property.transaction === "vente"
    ? CONTACT_TO_EXPLORATION_MULTIPLIER_VENTE
    : CONTACT_TO_EXPLORATION_MULTIPLIER;
  return Math.round(computeExplorationCP(property) * multiplier);
}


// Paliers de rechargement en CPS (annonceur et client)
// 1 CPS = 100 FCFA → ex. 10 000 F = 100 CPS
const TOPUP_CP_PRESETS_ADVERTISER = [
  { fcfa: 2500,   cp: 25,   bonus: 0   },
  { fcfa: 5000,   cp: 50,   bonus: 0   },
  { fcfa: 10000,  cp: 100,  bonus: 5   }, // +5%
  { fcfa: 25000,  cp: 250,  bonus: 20  }, // +8%
  { fcfa: 50000,  cp: 500,  bonus: 50  }, // +10%
  { fcfa: 100000, cp: 1000, bonus: 120 }, // +12%
];

const TOPUP_CP_PRESETS_CLIENT = [
  { fcfa: 2500,   cp: 25,   bonus: 0   },
  { fcfa: 5000,   cp: 50,   bonus: 0   },
  { fcfa: 10000,  cp: 100,  bonus: 5   },
  { fcfa: 25000,  cp: 250,  bonus: 20  },
  { fcfa: 50000,  cp: 500,  bonus: 50  },
  { fcfa: 100000, cp: 1000, bonus: 120 },
];

// Calcule le coût en CPS pour un bien donné selon une grille
function computeCPCost(price, grid) {
  for (const tier of grid) {
    if (price <= tier.max) return tier.cp;
  }
  return grid[grid.length - 1].cp;
}

// ── Commission Imoobilis ──────────────────────────────────────────
// Due par l'annonceur une fois le bien loué, vendu, ou retiré (non
// facturée à la publication, qui est désormais entièrement gratuite).
// - Location : 10% du loyer (mensuel)
// - Vente    : 1% en dessous de 100 000 000 FCFA,
//              0,75% de 100 000 000 à 1 000 000 000 FCFA,
//              0,5% au-delà de 1 000 000 000 FCFA
const COMMISSION_VENTE_TIERS = [
  { max: 100_000_000,     rate: 0.01   },
  { max: 1_000_000_000,   rate: 0.0075 },
  { max: Infinity,        rate: 0.005  },
];
const COMMISSION_LOCATION_RATE = 0.10;

function computeCommissionRate(price, transaction) {
  if (transaction === "location") return COMMISSION_LOCATION_RATE;
  for (const tier of COMMISSION_VENTE_TIERS) {
    if (price <= tier.max) return tier.rate;
  }
  return COMMISSION_VENTE_TIERS[COMMISSION_VENTE_TIERS.length - 1].rate;
}

function computeCommission(price, transaction) {
  const rate = computeCommissionRate(price, transaction);
  return Math.round(price * rate);
}

// Convertit un montant FCFA en CPS (1 CPS = 100 F) + bonus selon les paliers
function fcfaToCP(fcfa, presets) {
  // Trouve le palier le plus proche (au-dessous ou égal)
  let best = { cp: Math.floor(fcfa / 100), bonus: 0 };
  for (const p of presets) {
    if (fcfa >= p.fcfa) best = { cp: p.cp, bonus: p.bonus };
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// CAMPAGNES PUBLICITAIRES (ciblage façon Facebook Ads) — côté annonceur
// Boost optionnel, séparé du coût de publication : améliore le classement
// d'une annonce dans le flux "Pertinence" côté client et la met en avant
// auprès des profils qui correspondent au ciblage choisi (commune, tranche
// d'âge, profession, centres d'intérêt). Facturé en CPS, avec une durée
// propre indépendante de la durée de publication (illimitée). Aucune incidence sur
// le coût ou la durée de publication.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// DISPONIBILITÉ DES BIENS PAYANTS — confirmation hebdomadaire + suspension
// ══════════════════════════════════════════════════════════════════
// Les biens payants restent en ligne indéfiniment (expiresAt: null) —
// aucune limite de 30 jours. En contrepartie, pour que les biens affichés
// sur la plateforme restent crédibles aux yeux des clients (i.e. réellement
// disponibles), l'annonceur doit confirmer CHAQUE SEMAINE que son bien n'a
// pas été vendu/loué (ou le retirer lui-même s'il ne l'est plus). Sans
// réaction dans le délai de grâce qui suit le rappel, le bien est
// automatiquement SUSPENDU (badge "Suspendu" affiché côté client, aperçu
// limité) jusqu'à ce que l'annonceur confirme sa disponibilité ou retire
// l'annonce. S'il reste suspendu sans réaction pendant
// AVAILABILITY_AUTO_DELETE_DAYS jours supplémentaires, le bien est
// automatiquement supprimé — aucune pénalité financière à aucune étape,
// l'objectif est uniquement de garder un catalogue crédible. Ne concerne
// que les biens payants : les biens gratuits ont déjà un cycle de vie court
// (7 jours) qui joue ce rôle.
const AVAILABILITY_CONFIRM_INTERVAL_DAYS = 7; // rappel hebdomadaire
const AVAILABILITY_GRACE_DAYS = 3;            // tolérance avant suspension automatique
const AVAILABILITY_AUTO_DELETE_DAYS = 3;      // tolérance, une fois suspendu, avant suppression automatique

// La commission Imoobilis devient obligatoire (via CinetPay) avant de
// pouvoir retirer/supprimer un bien dès que L'UNE des deux conditions
// suivantes est atteinte (voir requestDelete) :
//  1. p.explorations (voir incrementPropertyExplorations, incrémenté dès
//     qu'un client débloque le forfait carte/POI/trajet — payé en CPS ou
//     couvert par les crédits de bienvenue gratuits, jamais pour une
//     simple ouverture de fiche) atteint COMMISSION_MIN_EXPLORATIONS_THRESHOLD ;
//  2. OU p.contacts (voir incrementPropertyContacts, incrémenté dès qu'un
//     client débloque le numéro de l'annonceur) atteint
//     COMMISSION_MIN_CONTACTS_THRESHOLD.
// Sous ces deux seuils (aucune exploration NI aucun contact), la
// suppression reste immédiate et gratuite.
const COMMISSION_MIN_EXPLORATIONS_THRESHOLD = 1;
const COMMISSION_MIN_CONTACTS_THRESHOLD = 1;

function daysSinceAvailabilityConfirmation(property) {
  const ref = property.lastConfirmedAt || property.publishedAt;
  if (!ref) return 0;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
}

// "À confirmer" : le rappel hebdomadaire est dépassé, mais on est encore
// dans le délai de grâce — simple rappel, le bien reste visible/actif.
function isAvailabilityConfirmDue(property) {
  if (!property) return false;
  return daysSinceAvailabilityConfirmation(property) >= AVAILABILITY_CONFIRM_INTERVAL_DAYS;
}

// Délai de grâce dépassé sans réaction de l'annonceur : le bien doit être
// suspendu (ou vient de l'être).
function isAvailabilitySuspendDue(property) {
  if (!property) return false;
  return daysSinceAvailabilityConfirmation(property) >= AVAILABILITY_CONFIRM_INTERVAL_DAYS + AVAILABILITY_GRACE_DAYS;
}

// Bien suspendu depuis trop longtemps sans réaction de l'annonceur : à
// supprimer automatiquement pour ne pas laisser traîner un bien probablement
// vendu/loué dans le catalogue.
function isAvailabilityAutoDeleteDue(property) {
  if (!property || !property.isSuspended || !property.suspendedAt) return false;
  const daysSuspended = Math.floor((Date.now() - new Date(property.suspendedAt).getTime()) / 86400000);
  return daysSuspended >= AVAILABILITY_AUTO_DELETE_DAYS;
}

const AGE_BRACKETS = ["18-25", "26-35", "36-50", "50+"];

const PROFESSIONS = [
  "Salarié(e) / Cadre", "Entrepreneur / Commerçant", "Fonctionnaire",
  "Profession libérale", "Étudiant(e)", "Diaspora (résident à l'étranger)", "Retraité(e)",
];

const INTEREST_TAGS = [
  { key: "invest",    label: "Investissement locatif" },
  { key: "primary",   label: "Achat résidence principale" },
  { key: "relocate",  label: "Déménagement professionnel" },
  { key: "family",    label: "Vie de famille" },
  { key: "luxury",    label: "Luxe & prestige" },
  { key: "diaspora",  label: "Diaspora / Expatriation" },
  { key: "student",   label: "Étudiant / Colocation" },
  { key: "shortstay", label: "Courte durée / Airbnb" },
];

const CAMPAIGN_TIERS = [
  { id: "standard", label: "Standard", subtitle: "Visibilité renforcée",      cpPerDay: 3, scoreWeight: 1,   reachFactor: 1   },
  { id: "avance",   label: "Avancé",   subtitle: "Mise en avant prioritaire", cpPerDay: 5, scoreWeight: 2,   reachFactor: 1.8 },
  { id: "maximum",  label: "Maximum",  subtitle: "Portée élargie maximale",   cpPerDay: 8, scoreWeight: 3.5, reachFactor: 3   },
];

// Durées de campagne proposées, indépendantes du palier de boost — comme
// sur Facebook Ads, on choisit d'abord l'intensité (palier) puis combien
// de temps elle tourne. Le coût total est simplement cpPerDay × durée.
const CAMPAIGN_DURATION_OPTIONS = [3, 7, 14, 30];

// Poids indicatif par commune (densité de population + bassin de clients
// actifs sur l'app) — sert uniquement à l'estimateur de portée, ce ne sont
// pas des statistiques démographiques officielles.
const COMMUNE_REACH_WEIGHT = {
  "Yopougon": 1400, "Songon": 180, "Abobo": 1200, "Anyama": 260,
  "Plateau": 320, "Adjamé": 520, "Attécoubé": 380, "Cocody": 980,
  "Bingerville": 240, "Treichville": 420, "Marcory": 540, "Koumassi": 600,
  "Port-Bouët": 460,
};

// Parts de couverture indicatives par dimension de ciblage (estimations,
// pas de vraies statistiques) — utilisées uniquement par l'estimateur de
// portée pour simuler le rétrécissement d'audience à mesure que le
// ciblage se précise, comme dans un véritable gestionnaire de campagnes.
const AGE_BRACKET_SHARE = { "18-25": 0.28, "26-35": 0.34, "36-50": 0.24, "50+": 0.14 };
const PROFESSION_SHARE = {
  "Salarié(e) / Cadre": 0.32, "Entrepreneur / Commerçant": 0.22, "Fonctionnaire": 0.15,
  "Profession libérale": 0.08, "Étudiant(e)": 0.12, "Diaspora (résident à l'étranger)": 0.06, "Retraité(e)": 0.05,
};
const INTEREST_SHARE = {
  invest: 0.22, primary: 0.30, relocate: 0.18, family: 0.35,
  luxury: 0.12, diaspora: 0.15, student: 0.16, shortstay: 0.10,
};

// Additionne les parts de couverture d'une liste de valeurs sélectionnées
// dans une dimension de ciblage donnée (vide = aucune restriction → 1).
function coverageShare(selected, shareMap) {
  if (!selected || selected.length === 0) return 1;
  return Math.min(1, selected.reduce((s, v) => s + (shareMap[v] || 0.15), 0));
}

// Estime la portée quotidienne d'une campagne selon les communes, la
// tranche d'âge, la profession et les centres d'intérêt ciblés, modulée
// par le palier de boost choisi. Plus le ciblage est précis, plus la
// portée estimée se rétrécit — comme dans un vrai gestionnaire de pub.
function estimateCampaignReach(communes, ageBrackets, professions, interests, tier) {
  const base = (communes.length ? communes : Object.keys(COMMUNE_REACH_WEIGHT))
    .reduce((s, c) => s + (COMMUNE_REACH_WEIGHT[c] || 200), 0);
  const ageShare    = coverageShare(ageBrackets, AGE_BRACKET_SHARE);
  const profShare   = coverageShare(professions, PROFESSION_SHARE);
  const interestShare = coverageShare(interests, INTEREST_SHARE);
  const mid = Math.round(base * ageShare * profShare * interestShare * tier.reachFactor * 0.06);
  return { min: Math.max(5, Math.round(mid * 0.7)), max: Math.max(10, Math.round(mid * 1.3)) };
}

// Coût CPS d'une campagne : cpPerDay du palier choisi × durée sélectionnée,
// +1 CPS par commune ciblée au-delà de 3 (un ciblage géographique plus
// large coûte un peu plus cher). Affiner le ciblage par âge/profession/
// intérêt ne change pas le prix — comme sur Facebook Ads, cela ne fait
// que préciser l'audience touchée par le même budget.
function computeCampaignCost(tier, communeCount, days) {
  return tier.cpPerDay * days + Math.max(0, communeCount - 3);
}

// Une campagne est active si elle existe, n'a pas été désactivée
// manuellement, et que sa date d'expiration n'est pas dépassée.
function isCampaignActive(campaign) {
  return !!campaign && campaign.active && new Date(campaign.expiresAt).getTime() > Date.now();
}

// Vérifie si un client correspond à une dimension de ciblage à valeur
// unique (commune, âge, profession). Renvoie si la dimension est ciblée
// et, si oui, si elle correspond au profil du client.
function matchSingleDim(targetArr, clientValue) {
  const targeted = !!targetArr && targetArr.length > 0;
  return { targeted, matched: targeted && targetArr.includes(clientValue) };
}
// Idem pour une dimension à valeurs multiples (centres d'intérêt) :
// correspond dès qu'au moins un intérêt du client recoupe le ciblage.
function matchOverlapDim(targetArr, clientArr) {
  const targeted = !!targetArr && targetArr.length > 0;
  const matched = targeted && (clientArr || []).some((v) => targetArr.includes(v));
  return { targeted, matched };
}

// Score de boost d'une annonce pour le tri "Pertinence" côté client :
// pondéré par le palier choisi, et amplifié selon la proportion de
// dimensions de ciblage actives (commune, âge, profession, intérêts) qui
// correspondent au profil du client courant — c'est ce qui simule la
// "diffusion" auprès de l'audience visée par la campagne.
function computeBoostScore(campaign, client) {
  if (!isCampaignActive(campaign)) return 0;
  const dims = [
    matchSingleDim(campaign.communes, client.commune),
    matchSingleDim(campaign.ageBrackets, client.ageBracket),
    matchSingleDim(campaign.professions, client.profession),
    matchOverlapDim(campaign.interests, client.interests),
  ];
  const targetedDims = dims.filter((d) => d.targeted);
  const matchRatio = targetedDims.length === 0
    ? 1
    : targetedDims.filter((d) => d.matched).length / targetedDims.length;
  return (campaign.scoreWeight || 1) * (1 + matchRatio);
}
// ══════════════════════════════════════════════════════════════════

// Codes promo : créditent un montant fixe au portefeuille (client ou
// annonceur). Chaque code n'est utilisable qu'une seule fois par compte.
// La validation des codes promo se fait désormais contre store.promoCodes
// (créés depuis le module "Code Promo" de l'administration — voir
// ImoobilisAdmin.jsx, application désormais détachée)
// plutôt que contre une liste figée : voir handleRedeemPromoCode dans
// ImoobilisApp (client) et AdvertiserApp.
//
// Applique un code promo administré : vérifie qu'il existe, est actif, non
// épuisé (maxUses) et non déjà réclamé par ce compte, puis délègue le
// crédit réel au callback fourni (cps_bonus : CPS immédiats ; discount_topup
// : pourcentage à appliquer au prochain rechargement, via onDiscount).
// Génère un code promo de 6 caractères mêlant majuscules, minuscules,
// chiffres et un symbole (au moins un de chaque catégorie, positions
// mélangées) — utilisé par le bouton "Générer" du module Code Promo de
// l'administration. I/l/O/0/1 exclus pour éviter toute confusion visuelle.
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

async function applyPromoCode(rawCode, { promoCodes, clientId, redeemedPromoCodes, setRedeemedPromoCodes, incrementPromoCodeUses, onCpsBonus, onDiscount, showToast }) {
  // Comparaison exacte (sensible à la casse) : les codes peuvent mélanger
  // minuscules et majuscules (voir generatePromoCode), donc forcer la casse
  // ici romprait le rapprochement avec store.promoCodes.
  const code = rawCode.trim();
  if (!code) return;
  const promo = promoCodes.find(p => p.code === code);
  if (!promo || !promo.active) { showToast("Code promo invalide"); return; }
  if (promo.maxUses != null && (promo.usesCount || 0) >= promo.maxUses) { showToast("Ce code promo a atteint sa limite d'utilisation"); return; }
  if (redeemedPromoCodes.has(code)) { showToast("Ce code promo a déjà été utilisé"); return; }
  // Enregistre l'utilisation en base AVANT de créditer quoi que ce soit :
  // la contrainte UNIQUE(promo_code_id, client_id) sur promo_code_redemptions
  // (voir sql/007_promo_codes.sql) rejette toute seconde tentative pour ce
  // même client, même depuis un autre appareil/session — bien plus fiable
  // que l'ancien Set local, qui ne survivait pas à une reconnexion.
  if (clientId) {
    try {
      await supabaseFetch(`promo_code_redemptions`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([{ promo_code_id: promo.id, client_id: clientId }]),
      });
    } catch (err) {
      showToast("Ce code promo a déjà été utilisé");
      return;
    }
  }
  setRedeemedPromoCodes(prev => new Set(prev).add(code));
  incrementPromoCodeUses(promo.id);
  if (promo.type === "cps_bonus") {
    onCpsBonus(promo.value);
    showToast(`Code promo validé — +${promo.value} CPS offerts`);
  } else {
    onDiscount(promo.value);
    showToast(`Code promo validé — ${promo.value}% de remise appliquée à votre prochain rechargement`);
  }
}

// ── Détail d'un code promo reçu dans la messagerie Imoobilis (poussé
// depuis le module Code Promo de l'administration, voir ImoobilisAdmin.jsx,
// application désormais détachée) ──
function PromoMessageSheet({ message, onClose, onCopy, onUseNow }) {
  return (
    <div className="absolute inset-0 z-[220] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div className="bg-white rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">🎁 Code promo Imoobilis</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center mb-4">
          <p className="font-extrabold text-slate-800 text-[22px] tracking-widest">{message.promoCode}</p>
          <p className="text-[12px] text-amber-700 font-semibold mt-1">{message.promoDescription}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onCopy(message.promoCode)} className="flex-1 border border-gray-200 text-slate-700 font-bold text-[13px] py-3 rounded-xl">
            Copier le code
          </button>
          <button onClick={() => onUseNow(message.promoCode)} className="flex-1 bg-green-700 text-white font-bold text-[13px] py-3 rounded-xl">
            Utiliser maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modale de saisie d'un code promo (réutilisée côté client et annonceur) ──
function PromoCodeSheet({ onClose, onRedeem }) {
  const [code, setCode] = useState("");
  return (
    <div className="absolute inset-0 z-[210] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl p-5 pb-8 overflow-y-auto" style={{ maxHeight: "80%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">🎁 Code promo</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">Entrez votre code pour créditer votre portefeuille.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 6))}
          placeholder="Ex. A3b-9K"
          maxLength={6}
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-green-600 mb-4 tracking-wide"
        />
        <button
          onClick={() => { onRedeem(code); setCode(""); }}
          disabled={!code.trim()}
          className="w-full bg-green-700 disabled:bg-gray-300 text-white font-bold text-[14px] py-3.5 rounded-xl"
        >
          Valider le code
        </button>
      </div>
    </div>
  );
}

// Nombre de segments de l'anneau circulaire de progression de la recherche.
// La progression avance segment par segment (pas de glissement continu).
const SCAN_RING_SEGMENTS = 16;

const DISTRICTS = [
  "Cocody", "Riviera 2", "Riviera 3", "Angré", "Plateau", "Marcory",
  "Treichville", "Koumassi", "Port-Bouët", "Yopougon", "Bingerville", "Abobo",
];

// ── Tranches de rayon de recherche (boutons à choix unique) ──
const RADIUS_BANDS = [
  { id: "r1", label: "0 - 500 m",  max: 0.5 },
  { id: "r2", label: "0 - 1 km",   max: 1 },
  { id: "r3", label: "0 - 2 km",   max: 2 },
  { id: "r4", label: "0 - 5 km",   max: 5 },
  { id: "r5", label: "0 - 10 km",  max: 10 },
  { id: "r6", label: "10 km +",    max: Infinity },
];

function formatRadiusLabel(radius) {
  if (radius === Infinity) return "10 km et plus";
  if (radius < 1) return `jusqu'à ${Math.round(radius * 1000)} m`;
  return `jusqu'à ${radius} km`;
}

// Calcule et formate la date de renouvellement d'un abonnement
// à partir de sa date de début et de sa durée en jours.
function formatRenewalDate(startDate, durationDays) {
  if (!startDate) return "";
  const d = new Date(startDate);
  d.setDate(d.getDate() + durationDays);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Formate le temps restant avant expiration du compte (jours/heures), pour
// le compteur affiché dans l'en-tête à côté du solde. `now` peut être fourni
// pour rester synchronisé avec l'horloge interne du composant (sinon Date.now()).
function formatRemainingTime(startDate, durationDays, now = Date.now()) {
  if (!startDate) return null;
  const end = new Date(startDate).getTime() + durationDays * 24 * 60 * 60 * 1000;
  const remainingMs = end - now;
  if (remainingMs <= 0) return null;
  const totalHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (totalHours >= 24) return `${Math.ceil(totalHours / 24)} j`;
  return `${totalHours} h`;
}

// ── Quartiers d'Abidjan, par commune (les 13 communes du District autonome)
const ABIDJAN_PLACES = [
  // Cocody
  { id: "ab-1",  name: "Cocody Centre",    subtitle: "Cocody, Abidjan",      distanceKm: 0.6, type: "quartier" },
  { id: "ab-2",  name: "Riviera 1",        subtitle: "Cocody, Abidjan",      distanceKm: 1.1, type: "quartier" },
  { id: "ab-3",  name: "Riviera 2",        subtitle: "Cocody, Abidjan",      distanceKm: 1.8, type: "quartier" },
  { id: "ab-4",  name: "Riviera 3",        subtitle: "Cocody, Abidjan",      distanceKm: 2.3, type: "quartier" },
  { id: "ab-5",  name: "Riviera Golf",     subtitle: "Cocody, Abidjan",      distanceKm: 2.9, type: "quartier" },
  { id: "ab-6",  name: "II Plateaux",      subtitle: "Cocody, Abidjan",      distanceKm: 1.4, type: "quartier" },
  { id: "ab-7",  name: "Angré",            subtitle: "Cocody, Abidjan",      distanceKm: 3.4, type: "quartier" },
  { id: "ab-8",  name: "Danga",            subtitle: "Cocody, Abidjan",      distanceKm: 4.1, type: "quartier" },
  { id: "ab-9",  name: "M'Badon",          subtitle: "Cocody, Abidjan",      distanceKm: 4.8, type: "quartier" },
  { id: "ab-10", name: "Mermoz",           subtitle: "Cocody, Abidjan",      distanceKm: 2.0, type: "quartier" },
  { id: "ab-11", name: "Faya",             subtitle: "Cocody, Abidjan",      distanceKm: 5.2, type: "quartier" },
  // Plateau
  { id: "ab-12", name: "Plateau Centre",   subtitle: "Plateau, Abidjan",     distanceKm: 5.6, type: "quartier" },
  { id: "ab-13", name: "Cité Administrative", subtitle: "Plateau, Abidjan",  distanceKm: 5.9, type: "quartier" },
  { id: "ab-14", name: "Indénié",          subtitle: "Plateau, Abidjan",     distanceKm: 6.2, type: "quartier" },
  // Marcory
  { id: "ab-15", name: "Marcory Résidentiel", subtitle: "Marcory, Abidjan", distanceKm: 7.4, type: "quartier" },
  { id: "ab-16", name: "Zone 4",           subtitle: "Marcory, Abidjan",     distanceKm: 7.9, type: "quartier" },
  { id: "ab-17", name: "Biétry",           subtitle: "Marcory, Abidjan",     distanceKm: 8.3, type: "quartier" },
  { id: "ab-18", name: "Anoumabo",         subtitle: "Marcory, Abidjan",     distanceKm: 8.7, type: "quartier" },
  // Treichville
  { id: "ab-19", name: "Treichville Centre", subtitle: "Treichville, Abidjan", distanceKm: 6.8, type: "quartier" },
  { id: "ab-20", name: "Arras",            subtitle: "Treichville, Abidjan", distanceKm: 7.1, type: "quartier" },
  // Koumassi
  { id: "ab-21", name: "Koumassi Grand-Marché", subtitle: "Koumassi, Abidjan", distanceKm: 9.6, type: "quartier" },
  { id: "ab-22", name: "Koumassi Remblais", subtitle: "Koumassi, Abidjan",  distanceKm: 10.1, type: "quartier" },
  { id: "ab-23", name: "Koumassi Sicogi",  subtitle: "Koumassi, Abidjan",    distanceKm: 10.5, type: "quartier" },
  // Port-Bouët
  { id: "ab-24", name: "Vridi",            subtitle: "Port-Bouët, Abidjan",  distanceKm: 11.8, type: "quartier" },
  { id: "ab-25", name: "Gonzagueville",    subtitle: "Port-Bouët, Abidjan",  distanceKm: 13.0, type: "quartier" },
  { id: "ab-26", name: "Aéroport FHB",     subtitle: "Port-Bouët, Abidjan",  distanceKm: 12.4, type: "quartier" },
  // Yopougon
  { id: "ab-27", name: "Yopougon Sicogi",  subtitle: "Yopougon, Abidjan",    distanceKm: 12.1, type: "quartier" },
  { id: "ab-28", name: "Niangon",          subtitle: "Yopougon, Abidjan",    distanceKm: 12.9, type: "quartier" },
  { id: "ab-29", name: "Andokoi",          subtitle: "Yopougon, Abidjan",    distanceKm: 13.6, type: "quartier" },
  { id: "ab-30", name: "Selmer",           subtitle: "Yopougon, Abidjan",    distanceKm: 14.0, type: "quartier" },
  { id: "ab-31", name: "Maroc",            subtitle: "Yopougon, Abidjan",    distanceKm: 14.5, type: "quartier" },
  { id: "ab-32", name: "Toits Rouges",     subtitle: "Yopougon, Abidjan",    distanceKm: 15.1, type: "quartier" },
  // Abobo
  { id: "ab-33", name: "Abobo Gare",       subtitle: "Abobo, Abidjan",       distanceKm: 14.2, type: "quartier" },
  { id: "ab-34", name: "Abobo Sagbé",      subtitle: "Abobo, Abidjan",       distanceKm: 15.0, type: "quartier" },
  { id: "ab-35", name: "Avocatier",        subtitle: "Abobo, Abidjan",       distanceKm: 15.7, type: "quartier" },
  // Adjamé
  { id: "ab-36", name: "Adjamé Liberté",   subtitle: "Adjamé, Abidjan",      distanceKm: 8.0, type: "quartier" },
  { id: "ab-37", name: "220 Logements",    subtitle: "Adjamé, Abidjan",      distanceKm: 8.4, type: "quartier" },
  { id: "ab-38", name: "Williamsville",    subtitle: "Adjamé, Abidjan",      distanceKm: 8.8, type: "quartier" },
  // Attécoubé
  { id: "ab-39", name: "Locodjro",         subtitle: "Attécoubé, Abidjan",   distanceKm: 9.9, type: "quartier" },
  { id: "ab-40", name: "Attécoubé Centre", subtitle: "Attécoubé, Abidjan",   distanceKm: 9.3, type: "quartier" },
  // Bingerville / Songon / Anyama
  { id: "ab-41", name: "Bingerville Centre", subtitle: "Bingerville, Abidjan", distanceKm: 12.3, type: "quartier" },
  { id: "ab-42", name: "Songon Centre",    subtitle: "Songon, Abidjan",      distanceKm: 22.5, type: "quartier" },
  { id: "ab-43", name: "Anyama Centre",    subtitle: "Anyama, Abidjan",      distanceKm: 18.6, type: "quartier" },
  { id: "ab-44", name: "Anyama N'Dotré",   subtitle: "Anyama, Abidjan",      distanceKm: 19.2, type: "quartier" },
];

// ── Communes et villes principales de Côte d'Ivoire, par région
// (31 régions + grandes villes/communes connues — couverture nationale)
const NATIONAL_PLACES = [
  // Agnéby-Tiassa
  { id: "vi-1",  name: "Agboville",      subtitle: "Agnéby-Tiassa",      type: "commune" },
  { id: "vi-2",  name: "Sikensi",        subtitle: "Agnéby-Tiassa",      type: "commune" },
  { id: "vi-3",  name: "Tiassalé",       subtitle: "Agnéby-Tiassa",      type: "commune" },
  // Bafing
  { id: "vi-4",  name: "Touba",          subtitle: "Bafing",             type: "commune" },
  // Bagoué
  { id: "vi-5",  name: "Boundiali",      subtitle: "Bagoué",             type: "commune" },
  { id: "vi-6",  name: "Tingréla",       subtitle: "Bagoué",             type: "commune" },
  // Bélier
  { id: "vi-7",  name: "Toumodi",        subtitle: "Bélier",             type: "commune" },
  { id: "vi-8",  name: "Tiébissou",      subtitle: "Bélier",             type: "commune" },
  // Béré
  { id: "vi-9",  name: "Mankono",        subtitle: "Béré",                type: "commune" },
  // Bounkani
  { id: "vi-10", name: "Bouna",          subtitle: "Bounkani",           type: "commune" },
  // Cavally
  { id: "vi-11", name: "Guiglo",         subtitle: "Cavally",            type: "commune" },
  { id: "vi-12", name: "Toulépleu",      subtitle: "Cavally",            type: "commune" },
  // Folon
  { id: "vi-13", name: "Minignan",       subtitle: "Folon",               type: "commune" },
  // Gbêkê
  { id: "vi-14", name: "Bouaké",         subtitle: "Gbêkê",               type: "ville" },
  { id: "vi-15", name: "Sakassou",       subtitle: "Gbêkê",               type: "commune" },
  { id: "vi-16", name: "Béoumi",         subtitle: "Gbêkê",               type: "commune" },
  // Gboklé
  { id: "vi-17", name: "Sassandra",      subtitle: "Gboklé",              type: "commune" },
  // Gôh
  { id: "vi-18", name: "Gagnoa",         subtitle: "Gôh",                 type: "ville" },
  { id: "vi-19", name: "Oumé",           subtitle: "Gôh",                 type: "commune" },
  // Gontougo
  { id: "vi-20", name: "Bondoukou",      subtitle: "Gontougo",           type: "commune" },
  { id: "vi-21", name: "Tanda",          subtitle: "Gontougo",           type: "commune" },
  // Grands-Ponts
  { id: "vi-22", name: "Dabou",          subtitle: "Grands-Ponts",       type: "commune" },
  { id: "vi-23", name: "Grand-Lahou",    subtitle: "Grands-Ponts",       type: "commune" },
  { id: "vi-24", name: "Jacqueville",    subtitle: "Grands-Ponts",       type: "commune" },
  // Guémon
  { id: "vi-25", name: "Duékoué",        subtitle: "Guémon",              type: "commune" },
  { id: "vi-26", name: "Bangolo",        subtitle: "Guémon",              type: "commune" },
  // Hambol
  { id: "vi-27", name: "Katiola",        subtitle: "Hambol",              type: "commune" },
  { id: "vi-28", name: "Niakaramandougou", subtitle: "Hambol",            type: "commune" },
  // Haut-Sassandra
  { id: "vi-29", name: "Daloa",          subtitle: "Haut-Sassandra",     type: "ville" },
  { id: "vi-30", name: "Vavoua",         subtitle: "Haut-Sassandra",     type: "commune" },
  { id: "vi-31", name: "Issia",          subtitle: "Haut-Sassandra",     type: "commune" },
  // Iffou
  { id: "vi-32", name: "Daoukro",        subtitle: "Iffou",               type: "commune" },
  { id: "vi-33", name: "Bocanda",        subtitle: "Iffou",               type: "commune" },
  // Indénié-Djuablin
  { id: "vi-34", name: "Abengourou",     subtitle: "Indénié-Djuablin",   type: "ville" },
  { id: "vi-35", name: "Agnibilékrou",   subtitle: "Indénié-Djuablin",   type: "commune" },
  // Kabadougou
  { id: "vi-36", name: "Odienné",        subtitle: "Kabadougou",         type: "commune" },
  // La Mé
  { id: "vi-37", name: "Adzopé",         subtitle: "La Mé",               type: "commune" },
  { id: "vi-38", name: "Akoupé",         subtitle: "La Mé",               type: "commune" },
  { id: "vi-39", name: "Alépé",          subtitle: "La Mé",               type: "commune" },
  // Lôh-Djiboua
  { id: "vi-40", name: "Divo",           subtitle: "Lôh-Djiboua",        type: "ville" },
  { id: "vi-41", name: "Lakota",         subtitle: "Lôh-Djiboua",        type: "commune" },
  { id: "vi-42", name: "Guitry",         subtitle: "Lôh-Djiboua",        type: "commune" },
  // Marahoué
  { id: "vi-43", name: "Bouaflé",        subtitle: "Marahoué",            type: "commune" },
  { id: "vi-44", name: "Zuénoula",       subtitle: "Marahoué",            type: "commune" },
  { id: "vi-45", name: "Sinfra",         subtitle: "Marahoué",            type: "commune" },
  // Moronou
  { id: "vi-46", name: "Bongouanou",     subtitle: "Moronou",             type: "commune" },
  { id: "vi-47", name: "Arrah",          subtitle: "Moronou",             type: "commune" },
  // Nawa
  { id: "vi-48", name: "Soubré",         subtitle: "Nawa",                 type: "ville" },
  { id: "vi-49", name: "Méagui",         subtitle: "Nawa",                 type: "commune" },
  // N'Zi
  { id: "vi-50", name: "Dimbokro",       subtitle: "N'Zi",                 type: "commune" },
  { id: "vi-51", name: "M'Bahiakro",     subtitle: "N'Zi",                 type: "commune" },
  // Poro
  { id: "vi-52", name: "Korhogo",        subtitle: "Poro",                 type: "ville" },
  { id: "vi-53", name: "Sinématiali",    subtitle: "Poro",                 type: "commune" },
  // San-Pédro
  { id: "vi-54", name: "San-Pédro",      subtitle: "San-Pédro",           type: "ville" },
  { id: "vi-55", name: "Tabou",          subtitle: "San-Pédro",           type: "commune" },
  // Sud-Comoé
  { id: "vi-56", name: "Aboisso",        subtitle: "Sud-Comoé",           type: "commune" },
  { id: "vi-57", name: "Adiaké",         subtitle: "Sud-Comoé",           type: "commune" },
  { id: "vi-58", name: "Grand-Bassam",   subtitle: "Sud-Comoé",           type: "ville" },
  // Tchologo
  { id: "vi-59", name: "Ferkessédougou", subtitle: "Tchologo",            type: "commune" },
  // Tonkpi
  { id: "vi-60", name: "Man",            subtitle: "Tonkpi",              type: "ville" },
  { id: "vi-61", name: "Danané",         subtitle: "Tonkpi",              type: "commune" },
  { id: "vi-62", name: "Biankouma",      subtitle: "Tonkpi",              type: "commune" },
  // Worodougou
  { id: "vi-63", name: "Séguéla",        subtitle: "Worodougou",          type: "commune" },
  // Districts autonomes
  { id: "vi-64", name: "Yamoussoukro",   subtitle: "District autonome de Yamoussoukro", type: "ville" },
  { id: "vi-65", name: "Abidjan",        subtitle: "District autonome d'Abidjan",       type: "ville" },
];

// ── Address suggestions for the location search overlay (couverture nationale)
const ADDRESS_SUGGESTIONS = [...ABIDJAN_PLACES, ...NATIONAL_PLACES];

const NEWS = [
  { id: 1, tag: "Marché",        imgId: 1029, title: "Les prix au m² progressent à Cocody",          excerpt: "La demande pour les logements modernes continue de soutenir les prix dans les quartiers résidentiels prisés de la ville.", date: "12 juin 2026" },
  { id: 2, tag: "Conseil",       imgId: 210,  title: "5 questions à poser avant de signer un bail",   excerpt: "Un guide pratique pour sécuriser votre prochaine location à Abidjan et éviter les mauvaises surprises.", date: "8 juin 2026" },
  { id: 3, tag: "Infrastructure",imgId: 325,  title: "Nouvel axe routier prévu vers Angré",            excerpt: "Le projet devrait améliorer la desserte de plusieurs quartiers situés au nord-est de la ville.", date: "3 juin 2026" },
  { id: 4, tag: "Investissement",imgId: 15,   title: "Pourquoi le foncier reste recherché à Bingerville", excerpt: "Les terrains constructibles attirent de plus en plus d'investisseurs en périphérie d'Abidjan.", date: "29 mai 2026" },
  { id: 5, tag: "Marché",        imgId: 90,   title: "La location meublée en hausse à Marcory",        excerpt: "Les studios et appartements meublés séduisent une clientèle d'expatriés et de jeunes actifs.", date: "22 mai 2026" },
];

// ── Nearby services database per district
const NEARBY_SERVICES = {
  default: [
    { id: "s1", type: "supermarche", name: "Sococé Supermarché", distance: 0.4, icon: ShoppingCart, color: "text-green-600", bg: "bg-green-50" },
    { id: "s2", type: "ecole", name: "École Internationale Riviera", distance: 0.7, icon: GraduationCap, color: "text-purple-600", bg: "bg-purple-50" },
    { id: "s3", type: "sante", name: "Clinique Sainte Marie", distance: 0.9, icon: Cross, color: "text-red-500", bg: "bg-red-50" },
    { id: "s4", type: "restaurant", name: "Restaurant Le Quorum", distance: 0.5, icon: Utensils, color: "text-orange-500", bg: "bg-orange-50" },
    { id: "s5", type: "cafe", name: "Café des Artistes", distance: 0.3, icon: Coffee, color: "text-amber-600", bg: "bg-amber-50" },
    { id: "s6", type: "sport", name: "Planet Fitness Club", distance: 1.1, icon: Dumbbell, color: "text-green-600", bg: "bg-green-50" },
    { id: "s7", type: "transport", name: "Arrêt Gbaka – Carrefour", distance: 0.2, icon: Bus, color: "text-slate-600", bg: "bg-slate-50" },
    { id: "s8", type: "supermarche", name: "City Dia Express", distance: 1.3, icon: ShoppingCart, color: "text-green-600", bg: "bg-green-50" },
    { id: "s9", type: "sante", name: "Pharmacie Riviera 2", distance: 0.6, icon: Cross, color: "text-red-500", bg: "bg-red-50" },
    { id: "s10", type: "ecole", name: "Lycée Technique d'Abidjan", distance: 1.5, icon: GraduationCap, color: "text-purple-600", bg: "bg-purple-50" },
  ],
};

const SERVICE_TYPES = [
  { key: "tous", label: "Tous" },
  { key: "supermarche", label: "Commerces" },
  { key: "ecole", label: "Écoles" },
  { key: "sante", label: "Santé" },
  { key: "restaurant", label: "Restos" },
  { key: "sport", label: "Sport" },
  { key: "transport", label: "Transport" },
];

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

function getNextDays(n) {
  const days = [];
  const today = new Date();
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const monthNames = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];
  for (let i = 1; i <= n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d,
      label: dayNames[d.getDay()],
      day: d.getDate(),
      month: monthNames[d.getMonth()],
      iso: d.toISOString().split("T")[0],
    });
  }
  return days;
}

function formatPrice(p) {
  const amount = p.price.toLocaleString("fr-FR");
  return p.transaction === "location" ? `${amount} FCFA/mois` : `${amount} FCFA`;
}
function formatPinPrice(price) { return `${Math.round(price / 1000000)}M FCFA`; }
function formatDistance(d) { return (d ?? 0).toString().replace(".", ","); }
function formatDistanceShort(km) {
  if (km < 1) return `${(km * 1000).toFixed(1)} m`;
  return `${km.toFixed(1)} km`;
}

// Génère une référence courte et stable ("IMB-XXXXXX") à partir de l'id
// technique de chaque bien publié — valable pour tous les biens (démo ou
// publiés par un annonceur), pour que le client puisse identifier un bien
// précis facilement (support, signalement...) sans exposer l'id interne.
function getPropertyReference(property) {
  if (!property?.id) return "IMB-000000";
  let hash = 0;
  for (let i = 0; i < property.id.length; i++) {
    hash = (hash * 31 + property.id.charCodeAt(i)) >>> 0;
  }
  const code = 100000 + (hash % 900000); // toujours 6 chiffres
  return `IMB-${code}`;
}

// ── Real address API (OpenStreetMap / Nominatim — free, no API key needed) ──
// Docs: https://nominatim.org/release-docs/latest/api/Search/
// Usage policy: max ~1 req/s, light client-side use is fine for this kind of
// in-app search. For high-traffic production use, swap NOMINATIM_BASE for a
// paid provider (Google Places, Mapbox, HERE…) with the same response shape.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

function splitDisplayName(displayName) {
  const parts = displayName.split(",").map((p) => p.trim()).filter(Boolean);
  return {
    name: parts[0] || displayName,
    subtitle: parts.slice(1, 4).join(", ") || "Côte d'Ivoire",
  };
}

// ── Garde-fou anti-abus sur la recherche d'adresse (Autocomplete/Geocoding) ──
// La recherche reste 100% gratuite pour l'utilisateur — aucune facturation
// CPS sur cette étape, volontairement, pour ne jamais décourager
// l'exploration. Le seul risque réel n'est pas l'usage normal mais l'abus
// technique (bot, scraping, boucle qui spamme la recherche) : au-delà d'un
// certain rythme, ça épuise le quota partagé de l'API de géocodage pour
// tout le monde et peut faire bannir l'IP de la plateforme entière. La
// limite ci-dessous (fenêtre glissante, 20 requêtes/minute) est largement
// au-dessus de ce qu'une personne tape normalement en cherchant une
// adresse — elle ne devient visible que pour un usage anormal, jamais pour
// un utilisateur légitime.
const GEOCODE_RATE_LIMIT_MAX = 20;
const GEOCODE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
let geocodeCallTimestamps = [];

class RateLimitError extends Error {
  constructor() { super("Trop de recherches — patientez quelques secondes"); this.name = "RateLimitError"; }
}

function checkGeocodeRateLimit() {
  const now = Date.now();
  geocodeCallTimestamps = geocodeCallTimestamps.filter(t => now - t < GEOCODE_RATE_LIMIT_WINDOW_MS);
  if (geocodeCallTimestamps.length >= GEOCODE_RATE_LIMIT_MAX) throw new RateLimitError();
  geocodeCallTimestamps.push(now);
}

async function geocodeAddressCI(query, { signal } = {}) {
  checkGeocodeRateLimit();
  const url = `${NOMINATIM_BASE}/search?` + new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "ci",
    "accept-language": "fr",
    limit: "8",
  });
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data = await res.json();
  return data.map((item) => {
    const { name, subtitle } = splitDisplayName(item.display_name);
    return {
      id: `osm-${item.place_id}`,
      name,
      subtitle,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type || item.class || "lieu",
      source: "api",
    };
  });
}

async function reverseGeocodeCI(lat, lon, { signal } = {}) {
  const url = `${NOMINATIM_BASE}/reverse?` + new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "fr",
  });
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data = await res.json();
  if (!data?.display_name) return null;
  const { name, subtitle } = splitDisplayName(data.display_name);
  return { name, subtitle, lat, lon };
}

// ══════════════════════════════════════════════════════════════════
// GOOGLE PLACES API (NEW) — Nearby Search (Search Nearby)
// Détecte les commerces, écoles, santé, restaurants, transports etc.
// autour d'un bien, triés par distance. Utilise la version "New" de
// l'API (searchNearby) avec un masque de champs strict pour limiter la
// facturation au strict nécessaire (nom, position, type, note).
// Docs : https://developers.google.com/maps/documentation/places/web-service/nearby-search
// ══════════════════════════════════════════════════════════════════

// Clé API — à renseigner en production (variable d'environnement /
// configuration serveur). Tant qu'elle est vide, l'app bascule
// automatiquement sur le jeu de données de démonstration (NEARBY_SERVICES)
// pour rester pleinement fonctionnelle sans clé Google facturable.
const GOOGLE_PLACES_API_KEY =
  (typeof window !== "undefined" && window.GOOGLE_PLACES_API_KEY) || "";

// Correspondance entre nos catégories internes (SERVICE_TYPES) et les
// types "New Places API" officiels, avec l'icône/couleur déjà utilisées
// dans l'UI existante (NEARBY_SERVICES) pour un rendu cohérent.
const PLACE_TYPE_CONFIG = {
  supermarche: { googleTypes: ["supermarket", "grocery_store"], icon: ShoppingCart, color: "text-green-600", bg: "bg-green-50" },
  ecole:       { googleTypes: ["school", "primary_school", "secondary_school"], icon: GraduationCap, color: "text-purple-600", bg: "bg-purple-50" },
  sante:       { googleTypes: ["pharmacy", "hospital"], icon: Cross, color: "text-red-500", bg: "bg-red-50" },
  restaurant:  { googleTypes: ["restaurant"], icon: Utensils, color: "text-orange-500", bg: "bg-orange-50" },
  sport:       { googleTypes: ["gym"], icon: Dumbbell, color: "text-green-600", bg: "bg-green-50" },
  transport:   { googleTypes: ["bus_station", "transit_station"], icon: Bus, color: "text-slate-600", bg: "bg-slate-50" },
};

// Distance orthodromique (Haversine) en km entre deux coordonnées GPS —
// nécessaire pour classer les résultats Places API par proximité réelle.
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Interroge Places API (New) — méthode Search Nearby — autour d'un point
// GPS, pour un ou plusieurs de nos types internes (SERVICE_TYPES). Le
// masque de champs (X-Goog-FieldMask) ne demande que les données
// affichées dans l'UI (nom, position, note, type) afin de rester sur le
// palier de facturation "Nearby Search Pro" le moins coûteux.
// Renvoie null si aucune clé n'est configurée ou en cas d'échec — auquel
// cas l'appelant doit basculer sur les données de démonstration.
async function searchNearbyPlaces(lat, lng, filterKey = "tous", { signal, radiusMeters = 1500 } = {}) {
  if (!GOOGLE_PLACES_API_KEY) return null;
  const typeConfigs = filterKey === "tous"
    ? Object.values(PLACE_TYPE_CONFIG)
    : [PLACE_TYPE_CONFIG[filterKey]].filter(Boolean);
  const includedTypes = [...new Set(typeConfigs.flatMap(c => c.googleTypes))];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        // Masque de champs strict — réduit le coût de chaque requête en ne
        // récupérant que ce qui est réellement affiché dans l'app.
        "X-Goog-FieldMask": [
          "places.displayName",
          "places.location",
          "places.primaryType",
          "places.rating",
          "places.id",
        ].join(","),
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
        },
      }),
    });
    if (!res.ok) throw new Error(`Places API error ${res.status}`);
    const data = await res.json();
    const places = data.places || [];

    // Reconstitue notre format interne (type/icône/couleur/distance) à
    // partir de la réponse Google, triée par proximité réelle (Haversine).
    return places
      .map((p, i) => {
        const cfgEntry = Object.entries(PLACE_TYPE_CONFIG)
          .find(([, cfg]) => cfg.googleTypes.includes(p.primaryType)) || ["autre", { icon: MapPin, color: "text-slate-500", bg: "bg-slate-50" }];
        const [type, cfg] = cfgEntry;
        const placeLat = p.location?.latitude, placeLng = p.location?.longitude;
        const distance = (placeLat != null && placeLng != null)
          ? Math.round(haversineDistanceKm(lat, lng, placeLat, placeLng) * 10) / 10
          : null;
        return {
          id: p.id || `gp-${i}`,
          type,
          name: p.displayName?.text || "Lieu à proximité",
          distance: distance ?? 0.5,
          rating: p.rating || null,
          icon: cfg.icon, color: cfg.color, bg: cfg.bg,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch (e) {
    return null; // basculement silencieux vers les données de démonstration
  }
}

function getTravelTimes(distanceKm) {
  const carMinutes = Math.round((distanceKm / 25) * 60);
  const walkMinutes = Math.round((distanceKm / 5) * 60);
  const fmt = (mins) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  };
  return { car: fmt(carMinutes), walk: fmt(walkMinutes) };
}

function getDescription(p) {
  if (p.category === "Terrain") return `Terrain plat de ${p.area} m², viabilisé et facilement accessible, situé dans le quartier de ${p.district}. Idéal pour un projet de construction résidentiel ou commercial.`;
  if (p.category === "Bureau") return `Espace professionnel de ${p.area} m² réparti sur plusieurs pièces, idéal pour une équipe en croissance. Situé à ${p.district}, à proximité des grands axes d'Abidjan.`;
  if (p.transaction === "location") return `Cet espace de ${p.area} m² comprend ${p.beds} chambre(s) et ${p.baths} salle(s) de bains. Situé à ${p.district}, proche des commerces, écoles et transports.`;
  return `Cette propriété offre ${p.beds} chambres et ${p.baths} salles de bain sur ${p.area} m² habitables. Idéalement située à ${p.district}, elle bénéficie d'un accès rapide aux axes principaux d'Abidjan.`;
}

// ── Coordonnées de l'annonceur (généré de façon déterministe par bien) ────
const ADVERTISER_NAMES = [
  "Konan Yao", "Aminata Diabaté", "Jean-Baptiste Koffi", "Fatou Cissé",
  "Hervé N'Guessan", "Mariam Touré", "Désiré Bamba", "Awa Kouassi",
  "Sékou Traoré", "Adjoua Brou", "Ibrahim Ouattara", "Christelle Gnaoré",
];
const ADVERTISER_PHONE_PREFIXES = ["01", "05", "07", "27"];

function getAdvertiser(property) {
  // Si le bien a été publié par un vrai annonceur, utiliser ses vraies coordonnées
  if (property.advertiserName && property.advertiserPhone) {
    const phoneDial = property.advertiserPhone.replace(/\s/g, "");
    return {
      name: property.advertiserName,
      isAgency: property.advertiserType === "agency",
      statusLabel: property.advertiserType === "agency" ? "Agence immobilière vérifiée" : "Propriétaire particulier",
      phone: property.advertiserPhone,
      phoneDial,
    };
  }
  // Sinon générer des données fictives pour les biens de démonstration
  const idSeed = (property.id.charCodeAt(0) || 1) * 13 + (property.id.charCodeAt(property.id.length - 1) || 7) * 5 + property.id.length * 31;
  const isAgency = idSeed % 3 === 0;
  const name = ADVERTISER_NAMES[idSeed % ADVERTISER_NAMES.length];
  const prefix = ADVERTISER_PHONE_PREFIXES[idSeed % ADVERTISER_PHONE_PREFIXES.length];
  const raw = String(10000000 + ((idSeed * 9301 + 49297) % 90000000));
  const groups = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6), raw.slice(6, 8)];
  const phone = `+225 ${prefix} ${groups.join(" ")}`;
  const phoneDial = `+225${prefix}${groups.join("")}`;
  return {
    name,
    isAgency,
    statusLabel: isAgency ? "Agence immobilière vérifiée" : "Propriétaire particulier",
    phone,
    phoneDial,
  };
}

function buildFillerProperties() {
  const categoriesCycle = ["Appartement", "Villa", "Studio", "Bureau", "Terrain", "Duplex", "Maison"];
  const list = [];
  for (let i = 0; i < 26; i++) {
    const category = categoriesCycle[i % categoriesCycle.length];
    const district = DISTRICTS[i % DISTRICTS.length];
    let transaction = "vente";
    if (category === "Appartement" || category === "Studio" || category === "Bureau") {
      transaction = i % 2 === 0 ? "location" : "vente";
    }
    let price, beds, baths, area;
    if (category === "Terrain") { price = 18000000 + i * 2800000; beds = null; baths = null; area = 280 + i * 35; }
    else if (transaction === "location") { price = 140000 + i * 18000; beds = category === "Studio" ? 1 : 2 + (i % 3); baths = 1 + (i % 2); area = 38 + i * 6; }
    else { price = 38000000 + i * 5200000; beds = 3 + (i % 4); baths = 2 + (i % 3); area = 150 + i * 18; }
    const distance = +(2.8 + i * 0.35).toFixed(1);
    const amenities = [AMENITY_POOL[i % AMENITY_POOL.length], AMENITY_POOL[(i + 3) % AMENITY_POOL.length]];
    let title;
    if (category === "Terrain") title = `Terrain ${area} m²`;
    else if (category === "Studio") title = "Studio meublé";
    else if (category === "Bureau") title = `Bureau ${beds} pièces`;
    else title = `${category} ${beds} pièces`;
    const mapPin = { top: 6 + ((i * 7) % 86), left: 8 + ((i * 13) % 84) };
    list.push({ id: `f${i}`, title, category, district, transaction, price, beds, baths, area, distance, amenities, mapPin });
  }
  return list;
}

function paginationItems(total, current) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, "…", total];
  if (current >= total - 2) return [1, "…", total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

const BASE_PROPERTIES = [
  { id: "p1", title: "Villa duplex 6 pièces", category: "Villa", district: "Riviera 3", transaction: "vente", price: 120000000, beds: 5, baths: 4, area: 300, distance: 0.8, amenities: ["Piscine", "Jardin"], mapPin: { top: 27, left: 30 }, isSuspended: true, suspendedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: "p2", title: "Appartement 3 pièces", category: "Appartement", district: "Cocody", transaction: "location", price: 350000, beds: 3, baths: 2, area: 120, distance: 1.2, amenities: ["Climatisation", "Sécurité 24/7"] },
  { id: "p3", title: "Terrain 500 m²", category: "Terrain", district: "Angré", transaction: "vente", price: 65000000, beds: null, baths: null, area: 500, distance: 1.6, amenities: [], mapPin: { top: 67, left: 57 },
    topoReference: "TF 48219 IVC",
    topoAreaM2: 502,
    topoPoints: [
      { lat: 5.38300, lng: -3.98100 },
      { lat: 5.38300, lng: -3.98077 },
      { lat: 5.38318, lng: -3.98077 },
      { lat: 5.38318, lng: -3.98100 },
    ] },
  { id: "p4", title: "Bureau 4 pièces", category: "Bureau", district: "Plateau", transaction: "location", price: 350000, beds: 4, baths: 2, area: 150, distance: 2.3, amenities: ["Climatisation", "Garage"] },
  { id: "s1", title: "Villa 5 pièces", category: "Villa", district: "Cocody", transaction: "vente", price: 85000000, beds: 5, baths: 3, area: 280, distance: 2.6, amenities: ["Jardin", "Garage"], mapPin: { top: 8, left: 57 } },
  { id: "s2", title: "Villa contemporaine", category: "Villa", district: "Riviera Golf", transaction: "vente", price: 70000000, beds: 4, baths: 3, area: 250, distance: 3.1, amenities: ["Piscine"], mapPin: { top: 14, left: 81 } },
  { id: "s3", title: "Villa 7 pièces", category: "Villa", district: "Plateau", transaction: "vente", price: 160000000, beds: 7, baths: 5, area: 420, distance: 3.4, amenities: ["Piscine", "Garage", "Sécurité 24/7"], mapPin: { top: 44, left: 19 } },
  { id: "s4", title: "Villa 6 pièces", category: "Villa", district: "Angré", transaction: "vente", price: 95000000, beds: 6, baths: 4, area: 320, distance: 3.0, amenities: ["Jardin"], mapPin: { top: 45, left: 58 } },
  { id: "s5", title: "Maison 4 pièces", category: "Maison", district: "Angré 8e Tranche", transaction: "vente", price: 50000000, beds: 4, baths: 2, area: 200, distance: 3.8, amenities: ["Garage"], mapPin: { top: 63, left: 80 } },
  { id: "s6", title: "Duplex 5 pièces", category: "Duplex", district: "Treichville", transaction: "vente", price: 75000000, beds: 5, baths: 3, area: 260, distance: 3.5, amenities: ["Climatisation"], mapPin: { top: 70, left: 36 } },
];

const ALL_PROPERTIES = [...BASE_PROPERTIES, ...buildFillerProperties()];
const MAP_BOUNDS = { north: 5.395, south: 5.280, west: -3.995, east: -3.900 };

// Affiche l'heure réelle de l'appareil (mise à jour chaque seconde), à la
// place du "9:41" figé habituel des maquettes de téléphone — utilisée dans
// la barre de statut simulée en haut de chaque écran (login, client,
// annonceur).
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>;
}

function pinToLatLng(pin) {
  const lat = MAP_BOUNDS.north - (pin.top / 100) * (MAP_BOUNDS.north - MAP_BOUNDS.south);
  const lng = MAP_BOUNDS.west + (pin.left / 100) * (MAP_BOUNDS.east - MAP_BOUNDS.west);
  return { lat, lng };
}

// Calcule l'aire exacte (m²) d'un polygone défini par des coordonnées GPS
// (bornes d'un extrait topographique) : projection équirectangulaire
// locale centrée sur le premier point (précise pour l'échelle d'une
// parcelle, largement suffisante à ce niveau de zoom), puis formule du
// lacet (shoelace) sur les coordonnées projetées en mètres.
function computePolygonAreaM2(points) {
  if (!points || points.length < 3) return 0;
  const R = 6378137; // rayon terrestre moyen (m)
  const lat0 = points[0].lat * Math.PI / 180;
  const toXY = (p) => ({
    x: R * (p.lng * Math.PI / 180) * Math.cos(lat0),
    y: R * (p.lat * Math.PI / 180),
  });
  const xy = points.map(toXY);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    area += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return Math.abs(area / 2);
}

// ── Picsum Photos IDs par categorie (gratuit, fiable, pas de cle API)
const PICSUM_IDS = {
  Villa:       [1029, 1076, 164, 462, 534, 584, 614, 667, 725, 760],
  Maison:      [87,  186, 259, 375, 403, 445, 491, 520, 563, 610],
  Duplex:      [188, 302, 396, 481, 533, 566, 607, 648, 701, 744],
  Appartement: [90,  171, 280, 327, 414, 460, 505, 553, 599, 643],
  Studio:      [96,  160, 256, 317, 408, 450, 497, 543, 587, 634],
  Terrain:     [15,  75,  145, 218, 310, 382, 432, 477, 524, 570],
  Bureau:      [0,   42,  110, 200, 288, 360, 420, 467, 512, 558],
};

function getPicsumUrl(category, seed, w, h) {
  const ids = PICSUM_IDS[category] || PICSUM_IDS.Villa;
  const id = ids[Math.abs(seed || 0) % ids.length];
  return "https://picsum.photos/id/" + id + "/" + w + "/" + h;
}

// Room photo IDs - different sets per room type
const ROOM_PICSUM = {
  "Exterieur":        [1029, 534, 462, 667, 725],
  "Salon":            [210, 305, 399, 433, 478],
  "Cuisine":          [292, 389, 430, 475, 521],
  "Chambre":          [13, 106, 201, 297, 392],
  "Salle de bain":    [50, 147, 244, 338, 435],
  "Vue d_ensemble":   [15, 75, 145, 218, 310],
  "Acces":            [325, 425, 526, 623, 720],
  "Environs":         [190, 285, 382, 476, 573],
  "Facade":           [110, 207, 303, 400, 497],
  "Espace de travail":[0, 42, 137, 231, 326],
  "Salle de reunion": [20, 116, 212, 308, 404],
};

function getRoomUrl(label, propSeed, w, h) {
  var normalized = label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/'/g, "_").trim();
  var ids = ROOM_PICSUM[normalized] || [100, 200, 300, 400, 500];
  var id = ids[Math.abs(propSeed || 0) % ids.length];
  return "https://picsum.photos/id/" + id + "/" + w + "/" + h;
}

// ── Lightbox plein écran ──────────────────────────────────────────
function ImageLightbox({ src, label, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const touchStartRef = useRef(null);
  const [imgError, setImgError] = useState(false);

  // Réinitialise l'état d'erreur chaque fois qu'on change de photo
  useEffect(() => {
    setImgError(false);
  }, [src]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev && onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext && onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // Navigation par glissement tactile (swipe) — essentiel sur mobile
  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Ignore les gestes trop courts ou trop verticaux (éviter conflit avec un scroll vertical)
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && hasNext) onNext && onNext();      // glisse vers la gauche → photo suivante
    else if (dx > 0 && hasPrev) onPrev && onPrev();  // glisse vers la droite → photo précédente
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white z-10"
      >
        <X size={20} />
      </button>
      {label && (
        <span className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[12px] font-semibold px-3 py-1 rounded-full">
          {label}
        </span>
      )}
      {imgError ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[80vw] max-w-md aspect-[4/3] rounded-2xl bg-slate-800 flex flex-col items-center justify-center gap-2"
        >
          <ImageIcon size={32} className="text-slate-500" />
          <span className="text-slate-400 text-[12px] font-medium">Image indisponible</span>
        </div>
      ) : (
        <img
          src={src}
          alt={label || "photo"}
          onClick={(e) => e.stopPropagation()}
          onError={() => setImgError(true)}
          className="max-w-full object-contain select-none"
          style={{ maxWidth: "100%", maxHeight: "85%" }}
        />
      )}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev && onPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext && onNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}

// ── Vignette de propriété ─────────────────────────────────────────
function PropertyImage({ category, className, seed, onClick }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.Villa;
  const Icon = meta.icon;
  const [imgError, setImgError] = useState(false);
  const s = seed != null ? seed : 0;
  const imgUrl = getPicsumUrl(category, s, 300, 300);

  if (imgError) {
    return (
      <div
        className={"bg-gradient-to-br " + meta.gradient + " flex items-center justify-center " + (className || "")}
        onClick={onClick}
      >
        <Icon className="text-white/85" size={28} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className={"relative overflow-hidden " + (className || "")} onClick={onClick}>
      <img
        src={imgUrl}
        alt={category}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}

// ── Room sets par catégorie ───────────────────────────────────────
const ROOM_SETS = {
  habitation:  ["Extérieur", "Salon", "Cuisine", "Chambre", "Salle de bain"],
  appartement: ["Salon", "Cuisine", "Chambre", "Salle de bain"],
  terrain:     ["Vue d'ensemble", "Accès", "Environs"],
  bureau:      ["Façade", "Espace de travail", "Salle de réunion"],
};

function getPropertyImages(category) {
  let rooms;
  if (["Villa","Maison","Duplex"].includes(category)) rooms = ROOM_SETS.habitation;
  else if (["Appartement","Studio"].includes(category)) rooms = ROOM_SETS.appartement;
  else if (category === "Terrain") rooms = ROOM_SETS.terrain;
  else if (category === "Bureau")  rooms = ROOM_SETS.bureau;
  else rooms = ROOM_SETS.habitation;
  return rooms.map(label => ({ label }));
}

function GallerySlide({ label, propSeed, onOpenLightbox }) {
  const [err, setErr] = useState(false);
  const url = getRoomUrl(label, propSeed, 800, 500);
  return (
    <div
      className="relative flex-shrink-0 w-full h-full cursor-zoom-in"
      style={{ scrollSnapAlign: "center" }}
      onClick={onOpenLightbox}
    >
      {err ? (
        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
          <ImageIcon size={28} className="text-slate-400" />
        </div>
      ) : (
        <img src={url} alt={label} onError={() => setErr(true)}
          className="w-full h-full object-cover" loading="lazy" />
      )}
      <span className="absolute bottom-8 left-3 bg-black/40 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
        {label}
      </span>
    </div>
  );
}

// ── Gallery with lightbox ──────────────────────────────────────────
function PropertyImageGallery({ property, className }) {
  const images = getPropertyImages(property.category);
  const scrollRef = useRef(null);
  const [index, setIndex]     = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // seed per property
  const propSeed = (property.id.charCodeAt(0) || 1) * 7 + (property.id.charCodeAt(1) || 3) * 3;

  useEffect(() => {
    setIndex(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [property.id]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.min(images.length - 1, Math.max(0, i)));
  }

  function goTo(i) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function openAt(i) { setIndex(i); setLightbox(true); }
  function lightboxPrev() { const ni = index - 1; setIndex(ni); goTo(ni); }
  function lightboxNext() { const ni = index + 1; setIndex(ni); goTo(ni); }

  const currentUrl = getRoomUrl(images[index]?.label || "", propSeed, 1200, 800);

  return (
    <>
      <div className={"relative " + (className || "")}>
        <div ref={scrollRef} onScroll={handleScroll}
          className="flex h-full w-full overflow-x-auto"
          style={{ scrollSnapType: "x mandatory", touchAction: "pan-x", scrollbarWidth: "none" }}>
          {images.map((img, i) => (
            <GallerySlide key={i} label={img.label} propSeed={propSeed + i * 17}
              onOpenLightbox={() => openAt(i)} />
          ))}
        </div>

        {images.length > 1 && (
          <>
            {index > 0 && (
              <button onClick={() => goTo(index - 1)}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/30 rounded-full p-1 z-10">
                <ChevronLeft size={14} className="text-white" />
              </button>
            )}
            {index < images.length - 1 && (
              <button onClick={() => goTo(index + 1)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/30 rounded-full p-1 z-10">
                <ChevronRight size={14} className="text-white" />
              </button>
            )}
            <span className="absolute top-3 right-3 bg-black/40 text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
              {index + 1}/{images.length}
            </span>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
              {images.map((_, i) => (
                <span key={i} className={"h-1.5 rounded-full transition-all " + (i === index ? "w-4 bg-white" : "w-1.5 bg-white/50")} />
              ))}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <ImageLightbox
          src={currentUrl}
          label={images[index]?.label}
          onClose={() => setLightbox(false)}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
          hasPrev={index > 0}
          hasNext={index < images.length - 1}
        />
      )}
    </>
  );
}

function TravelTimeBadge({ distance }) {
  const { car, walk } = getTravelTimes(distance);
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="flex items-center gap-0.5 text-[9px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-1.5 py-0.5">
        <Car size={9} className="text-slate-300" />
        <span>{car}</span>
      </span>
      <span className="flex items-center gap-0.5 text-[9px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-1.5 py-0.5">
        <Footprints size={9} className="text-slate-300" />
        <span>{walk}</span>
      </span>
    </div>
  );
}

function PropertyCard({ p, isFav, onToggleFav, onOpen, isReported }) {
  const [lightboxIndex, setLightboxIndex] = useState(null); // null = fermé, sinon index
  const seed = (p.id.charCodeAt(0) || 1) + (p.id.charCodeAt(1) || 2);

  // Toutes les images du bien (même logique que dans PropertyImageGallery)
  const images = getPropertyImages(p.category);
  const propSeed = (p.id.charCodeAt(0) || 1) * 7 + (p.id.charCodeAt(1) || 3) * 3;

  function openLightbox(e) {
    e.stopPropagation();
    setLightboxIndex(0);
  }
  function closeLightbox() { setLightboxIndex(null); }
  function prevImage() { setLightboxIndex((i) => Math.max(0, i - 1)); }
  function nextImage() { setLightboxIndex((i) => Math.min(images.length - 1, i + 1)); }

  const currentLightboxUrl = lightboxIndex !== null
    ? getRoomUrl(images[lightboxIndex]?.label || "", propSeed + lightboxIndex * 17, 1200, 800)
    : null;

  return (
    <div
      className="flex gap-3 p-3 bg-white rounded-2xl border border-gray-100 shadow-sm cursor-pointer active:bg-slate-50 transition-colors"
      onClick={() => onOpen(p)}
    >
      {/* Thumbnail */}
      <div
        className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden cursor-zoom-in"
        onClick={openLightbox}
      >
        <PropertyImage category={p.category} className={`w-full h-full ${p.isSuspended ? "opacity-50" : ""}`} seed={seed} />
        <span className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${p.transaction === "vente" ? "bg-green-700" : "bg-orange-500"}`}>
          {p.transaction === "vente" ? "Vente" : "Location"}
        </span>
        <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
          {p.isSuspended ? (
            <span className="bg-rose-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              ⛔ Suspendu
            </span>
          ) : isCampaignActive(p.campaign) && (
            <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Rocket size={8}/>Sponsorisé
            </span>
          )}
          {isReported && (
            <span className="bg-slate-900 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              🚩 Signalé
            </span>
          )}
        </div>
        {/* Indicateur nombre de photos */}
        {images.length > 1 && (
          <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[8px] font-bold px-1 py-0.5 rounded-full leading-none">
            {images.length} 📷
          </span>
        )}
      </div>

      {/* Contenu principal */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        {/* Ligne 1 : titre | distance + cœur */}
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-bold text-[12px] text-slate-800 leading-tight line-clamp-2 flex-1 min-w-0">{p.title}</h3>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1 mt-0.5">
            <span className="text-green-700 font-bold text-[10px]">{formatDistance(p.distance)} km</span>
            <button onClick={(e) => { e.stopPropagation(); onToggleFav(p.id); }}>
              <Heart size={15} className={isFav ? "fill-rose-500 text-rose-500" : "text-gray-300"} />
            </button>
          </div>
        </div>

        {/* Ligne 1b : localisation + temps de trajet à droite */}
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[10px] text-gray-400 truncate flex-1 min-w-0">{p.district}, Abidjan</p>
          <TravelTimeBadge distance={p.distance} />
        </div>

        {/* Référence du bien — identification facile (support, signalement) */}
        <p className="text-[9px] text-gray-400 font-semibold tracking-wide mt-0.5">Réf. {getPropertyReference(p)}</p>

        {/* Ligne 2 : catégorie + pièces + surface */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span className="text-[10px] font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">{p.category}</span>
          {p.beds != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
              <BedDouble size={11} />{p.beds} ch.
            </span>
          )}
          {p.baths != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
              <Bath size={11} />{p.baths} sdb
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
            <Maximize2 size={11} />{p.area} m²
          </span>
        </div>

        {/* Ligne 3 : prix + coût CPS d'EXPLORATION. Ce montant n'est pas
            débité à l'ouverture : il s'accumule (pendingExplorationCP) et
            n'est réglé qu'au moment où le client contacte un annonceur —
            ce badge ne doit donc jamais refléter le coût du contact
            lui-même, qui s'ajoute séparément à ce moment-là. */}
        <div className="mt-1 flex items-center justify-between gap-1">
          <p className={`text-[12px] font-extrabold ${p.transaction === "vente" ? "text-green-700" : "text-orange-500"}`}>{formatPrice(p)}</p>
          <span className="flex items-center gap-0.5 bg-amber-50 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
            🪙 {computeExplorationCP(p)} CPS
          </span>
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          src={currentLightboxUrl}
          label={`${images[lightboxIndex]?.label} — ${p.title} (${lightboxIndex + 1}/${images.length})`}
          onClose={closeLightbox}
          onPrev={prevImage}
          onNext={nextImage}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < images.length - 1}
        />
      )}
    </div>
  );
}

// ── Social Share Sheet ────────────────────────────────────────────
function ShareSheet({ property, onClose }) {
  const title = property.title;
  const price = formatPrice(property);
  const cat = property.category;
  const district = property.district;

  // Lien deep link : https://imoobilis.ci/bien/ID?title=...&price=...&cat=...
  // → Si l'app est installée, elle s'ouvre directement sur la fiche du bien
  // → Sinon, la page de redirection propose de télécharger l'app
  const qs = new URLSearchParams({
    title: title,
    price: price,
    cat: cat,
    district: district,
    tx: property.transaction,
  }).toString();
  const deepLink = `https://imoobilis.ci/bien/${property.id}?${qs}`;
  const encodedLink = encodeURIComponent(deepLink);
  const msgText = `🏠 ${title} — ${cat} à ${district}\n💰 ${price}\nVoir ce bien sur Imoobilis :`;
  const msg = encodeURIComponent(msgText);

  const SOCIALS = [
    {
      name: "WhatsApp",
      emoji: "💬",
      bg: "bg-green-500",
      href: `https://wa.me/?text=${msg}%20${encodedLink}`,
    },
    {
      name: "Facebook",
      emoji: "📘",
      bg: "bg-blue-600",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
    },
    {
      name: "X / Twitter",
      emoji: "🐦",
      bg: "bg-slate-800",
      href: `https://twitter.com/intent/tweet?text=${msg}&url=${encodedLink}`,
    },
    {
      name: "Telegram",
      emoji: "✈️",
      bg: "bg-sky-500",
      href: `https://t.me/share/url?url=${encodedLink}&text=${msg}`,
    },
    {
      name: "LinkedIn",
      emoji: "💼",
      bg: "bg-blue-700",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}`,
    },
    {
      name: "Instagram",
      emoji: "📸",
      bg: "bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400",
      action: () => {
        navigator.clipboard?.writeText(`${msgText}\n${deepLink}`).catch(() => {});
      },
      note: "Copie le texte",
    },
  ];

  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard?.writeText(deepLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="absolute inset-0 z-[60] flex flex-col justify-end">
      <div className="flex-1 bg-black/40" onClick={onClose} />
 <div className="bg-white rounded-t-3xl px-5 pt-4 pb-8 overflow-y-auto" style={{ maxHeight: "80%" }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Partager ce bien</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Aperçu du bien */}
        <div className="bg-slate-50 rounded-2xl px-4 py-3 mb-4 border border-slate-100">
          <p className="font-bold text-slate-800 text-[13px]">{title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{cat} · {district}, Abidjan</p>
          <p className={`text-[13px] font-extrabold mt-1 ${property.transaction === "vente" ? "text-green-700" : "text-orange-500"}`}>{price}</p>
          <p className="text-[10px] text-green-700 mt-1.5 font-mono truncate">{deepLink}</p>
        </div>

        {/* Info deep link */}
        <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
          <span className="text-[14px] mt-0.5">📲</span>
          <p className="text-[11px] text-green-800 leading-snug">
            Le destinataire sera redirigé vers l'app Imoobilis. Si elle n'est pas installée, il sera invité à la télécharger.
          </p>
        </div>

        {/* Réseaux sociaux */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {SOCIALS.map((s) => (
            <button
              key={s.name}
              onClick={() => {
                if (s.action) { s.action(); }
                else { window.open(s.href, "_blank", "noopener"); }
                onClose();
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <div className={`w-14 h-14 rounded-2xl ${s.bg} flex items-center justify-center text-[26px] shadow-sm`}>
                {s.emoji}
              </div>
              <span className="text-[10px] text-slate-600 font-medium text-center leading-tight">{s.note || s.name}</span>
            </button>
          ))}
        </div>

        {/* Copier le lien */}
        <button
          onClick={copyLink}
          className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-2xl py-3.5 text-[13px] font-semibold text-slate-700"
        >
          {copied ? <CheckCircle2 size={16} className="text-green-600" /> : <Share2 size={16} />}
          {copied ? "Lien copié !" : "Copier le lien"}
        </button>
      </div>
    </div>
  );
}

// ── Signalement d'un bien par le client ─────────────────────────────
// Permet au client de prévenir l'administration Imoobilis qu'un bien
// affiché sur la plateforme n'est en réalité plus disponible (déjà vendu
// ou loué), ou pose un autre problème (infos incorrectes, annonce
// frauduleuse...). N'agit pas directement sur le bien (pas de retrait
// automatique) — le signalement est simplement transmis pour modération,
// pour éviter les abus (un client malintentionné ne peut pas faire
// disparaître l'annonce d'un concurrent de l'annonceur).
const REPORT_REASONS = [
  { id: "unavailable", emoji: "🚫", label: "Bien déjà vendu / loué", hint: "Le bien n'est plus disponible mais figure toujours sur la plateforme" },
  { id: "incorrect", emoji: "⚠️", label: "Informations incorrectes", hint: "Prix, photos ou détails ne correspondent pas au bien réel" },
  { id: "unreachable", emoji: "📵", label: "Annonceur injoignable", hint: "Impossible de contacter l'annonceur malgré plusieurs tentatives" },
  { id: "fraud", emoji: "🚩", label: "Annonce frauduleuse", hint: "Arnaque suspectée ou contenu trompeur" },
  { id: "other", emoji: "💬", label: "Autre problème", hint: "Précisez ci-dessous" },
];

// Délai minimum entre la date/heure de la visite programmée et la demande
// de remboursement : le remboursement (et la suspension du bien) ne peuvent
// être déclenchés qu'une fois ce délai écoulé, pour laisser le temps à la
// visite d'avoir effectivement lieu avant de valider le signalement.
const REFUND_MIN_HOURS_AFTER_VISIT = 24;

// Reconstitue le Date JS d'une visite programmée à partir de son jour
// ({ iso, ... }, voir getNextDays) et de son créneau horaire ("14:30").
function getVisitDateTime(visit) {
  if (!visit?.day?.iso || !visit?.time) return null;
  const d = new Date(`${visit.day.iso}T${visit.time}:00`);
  return isNaN(d.getTime()) ? null : d;
}

function ReportPropertySheet({ property, onClose, onSubmit, cpTransactions = [], bookedVisits = [] }) {
  const [reasonId, setReasonId] = useState(null);
  const [comment, setComment] = useState("");
  const [requestRefund, setRequestRefund] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Preuve de prélèvement : historique des CPS débités sur CE bien précis
  // (contact annonceur, carte/POI/trajet, vidéo aérienne 3D...), net des
  // remboursements déjà effectués — sert de justificatif si le client
  // demande le remboursement dans le cadre du signalement.
  const propertyDebits = cpTransactions.filter(tx => tx.propertyId === property.id && tx.type === "debit");
  const propertyRefunds = cpTransactions.filter(tx => tx.propertyId === property.id && tx.type === "refund");
  const totalDebited = propertyDebits.reduce((sum, tx) => sum + tx.cp, 0);
  const totalRefunded = propertyRefunds.reduce((sum, tx) => sum + tx.cp, 0);
  const refundableCp = Math.max(0, totalDebited - totalRefunded);

  // Le remboursement (et la suspension du bien) exigent, en plus de la
  // preuve de prélèvement CPS : une visite programmée sur ce bien, dont la
  // date et l'heure sont passées depuis au moins REFUND_MIN_HOURS_AFTER_VISIT.
  // On retient la visite programmée la plus ancienne pour ce bien (celle qui
  // a eu le plus de chances d'avoir eu lieu).
  const propertyVisits = bookedVisits
    .filter(v => v.propertyId === property.id)
    .map(v => ({ ...v, dateTime: getVisitDateTime(v) }))
    .filter(v => v.dateTime)
    .sort((a, b) => a.dateTime - b.dateTime);
  const referenceVisit = propertyVisits[0] || null;
  const hoursSinceVisit = referenceVisit ? (Date.now() - referenceVisit.dateTime.getTime()) / 3600000 : null;
  const visitElapsed = hoursSinceVisit !== null && hoursSinceVisit >= REFUND_MIN_HOURS_AFTER_VISIT;
  const hoursRemaining = hoursSinceVisit !== null ? Math.max(0, Math.ceil(REFUND_MIN_HOURS_AFTER_VISIT - hoursSinceVisit)) : null;
  const refundEligible = refundableCp > 0 && !!referenceVisit && visitElapsed;

  function handleSubmit() {
    if (!reasonId) return;
    onSubmit({
      reasonId,
      comment: comment.trim(),
      refundRequested: requestRefund && refundEligible,
      refundAmount: requestRefund && refundEligible ? refundableCp : 0,
      proofTransactionIds: propertyDebits.map(tx => tx.id),
      visitProofId: referenceVisit?.id || null,
    });
    setSubmitted(true);
  }

  return (
    <div className="absolute inset-0 z-[300] flex flex-col justify-end isolate" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="relative bg-white rounded-t-3xl flex flex-col overflow-hidden"
        style={{ maxHeight: "85%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header — fixed in place, never scrolls, never gets clipped */}
        <div className="flex-shrink-0 bg-white rounded-t-3xl px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          {!submitted && (
            <>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-extrabold text-slate-800 text-[16px]">Signaler ce bien</h3>
                <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
              </div>
              <p className="text-[11px] text-gray-400">{property.title} · {property.district}, Abidjan · Réf. {getPropertyReference(property)}</p>
            </>
          )}
        </div>

        {submitted ? (
          <div className="py-8 px-5 flex flex-col items-center gap-3 text-center overflow-y-auto">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <p className="font-bold text-slate-800 text-[14px]">Signalement envoyé</p>
            <p className="text-[11px] text-gray-500 max-w-[260px] leading-snug">
              {requestRefund && refundEligible
                ? `Merci — le bien a été suspendu et ${refundableCp} CPS ont été crédités sur votre solde, sur la base de votre visite du ${referenceVisit?.day?.day} ${referenceVisit?.day?.month} à ${referenceVisit?.time}.`
                : "Merci — l'équipe Imoobilis va examiner ce bien. Vous pouvez continuer à explorer la plateforme."}
            </p>
            <button onClick={onClose} className="mt-2 bg-slate-100 text-slate-700 rounded-xl px-5 py-2.5 text-[12px] font-semibold">Fermer</button>
          </div>
        ) : (
          <>
            {/* scrollable middle — only the reason list + comment scrolls */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3">
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setReasonId(r.id)}
                    className={`w-full flex items-start gap-3 rounded-2xl p-3.5 border text-left ${reasonId === r.id ? "border-rose-400 bg-rose-50" : "border-gray-100 bg-white"}`}
                  >
                    <span className="text-[16px] mt-0.5">{r.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <p className={`text-[12.5px] font-bold ${reasonId === r.id ? "text-rose-700" : "text-slate-800"}`}>{r.label}</p>
                      <p className="text-[10.5px] text-gray-400 mt-0.5 leading-snug">{r.hint}</p>
                    </span>
                    {reasonId === r.id && <CheckCircle2 size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>

              {/* Preuve de prélèvement CPS liée à ce bien — toujours visible,
                  y compris quand aucun CPS n'a encore été dépensé sur ce
                  bien, pour que le justificatif soit repérable dans le flux
                  de signalement. */}
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                <p className="text-[11.5px] font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                  🧾 Preuve de prélèvement CPS sur ce bien
                </p>
                {propertyDebits.length === 0 && propertyRefunds.length === 0 ? (
                  <p className="text-[10.5px] text-amber-600 leading-snug">
                    Aucun CPS n'a été débité sur ce bien pour l'instant — rien à rembourser.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5 mb-2">
                      {propertyDebits.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] text-amber-700 leading-snug">
                            {tx.label}
                            <span className="block text-[9.5px] text-amber-500">
                              {new Date(tx.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </span>
                          <span className="text-[11px] font-bold text-amber-800 flex-shrink-0">−{tx.cp} CPS</span>
                        </div>
                      ))}
                      {propertyRefunds.length > 0 && propertyRefunds.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] text-green-700 leading-snug">{tx.label}</span>
                          <span className="text-[11px] font-bold text-green-700 flex-shrink-0">+{tx.cp} CPS</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-amber-200 mb-2.5">
                      <span className="text-[11px] font-bold text-amber-900">Total remboursable</span>
                      <span className="text-[13px] font-extrabold text-amber-900">{refundableCp} CPS</span>
                    </div>
                  </>
                )}
                {refundableCp > 0 && (
                  refundEligible ? (
                    <button
                      type="button"
                      onClick={() => setRequestRefund(v => !v)}
                      className={`w-full flex items-start gap-2.5 rounded-xl p-2.5 border text-left ${requestRefund ? "border-green-400 bg-green-50" : "border-amber-200 bg-white"}`}
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${requestRefund ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                        {requestRefund && <CheckCircle2 size={12} className="text-white" />}
                      </span>
                      <span className="text-[10.5px] leading-snug">
                        <span className={`font-bold ${requestRefund ? "text-green-700" : "text-slate-700"}`}>
                          Demander le remboursement des {refundableCp} CPS débités sur ce bien
                        </span>
                        <span className="block text-gray-400 mt-0.5">
                          Basé sur votre visite du {referenceVisit?.day?.day} {referenceVisit?.day?.month} à {referenceVisit?.time} · le bien sera suspendu et les CPS crédités dès l'envoi.
                        </span>
                      </span>
                    </button>
                  ) : (
                    <div className="w-full rounded-xl p-2.5 border border-gray-200 bg-gray-50">
                      <span className="text-[10.5px] leading-snug text-gray-500 block">
                        {!referenceVisit
                          ? "Le remboursement n'est possible qu'après une visite programmée sur ce bien : programmez une visite depuis la fiche du bien pour pouvoir demander un remboursement."
                          : `Remboursement disponible ${REFUND_MIN_HOURS_AFTER_VISIT}h après la visite programmée (${referenceVisit.day?.day} ${referenceVisit.day?.month} à ${referenceVisit.time}) — encore ${hoursRemaining}h avant de pouvoir en faire la demande.`}
                      </span>
                    </div>
                  )
                )}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Précisions (optionnel)…"
                rows={3}
                className="w-full border border-gray-200 rounded-2xl p-3 text-[12.5px] text-slate-700 mb-3 resize-none"
              />
            </div>

            {/* footer — fixed in place, always visible, never scrolls away */}
            <div className="flex-shrink-0 bg-white px-5 pt-2 pb-8">
              <button
                onClick={handleSubmit}
                disabled={!reasonId}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl py-3.5 font-bold text-[13px]"
              >
                <AlertTriangle size={15} />Envoyer le signalement
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                {requestRefund && refundEligible
                  ? `Signalement transmis à l'équipe Imoobilis — ${refundableCp} CPS seront crédités et le bien suspendu à l'envoi, sur la base de la preuve de paiement et de la visite programmée.`
                  : "Signalement transmis à l'équipe Imoobilis pour vérification — l'annonce n'est pas retirée automatiquement."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Rechargement du portefeuille via Mobile Money ───────────────────
// Simule un paiement Mobile Money (Orange Money, MTN MoMo, Moov Money,
// Wave) qui crédite le solde Imoobilis. Un bonus est appliqué pour les
// rechargements importants, et un code promo peut ajouter un bonus fixe.
// Détermine une icône et un libellé de catégorie lisibles pour une
// transaction CPS client, à partir de son type et du texte de son label
// (voir les appels à deductClientCP/topUpClientCP/refundClientCP).
function getCpTxMeta(tx) {
  if (tx.type === "credit") return { icon: "💳", category: "Rechargement" };
  if (tx.type === "refund") return { icon: "↩️", category: "Remboursement" };
  if (tx.label.startsWith("Explorations cumulées")) return { icon: "🗺️", category: "Exploration" };
  if (tx.label.startsWith("Contact annonceur")) return { icon: "📞", category: "Contact annonceur" };
  if (tx.label.startsWith("Création d'alerte")) return { icon: "🔔", category: "Alerte" };
  if (tx.label.startsWith("Vidéo aérienne")) return { icon: "🚁", category: "Vidéo aérienne" };
  return { icon: "🪙", category: "Autre" };
}

// Copie fiable dans le presse-papiers, avec repli pour les contextes où
// l'API Clipboard moderne est bloquée (iframes sandboxées, aperçus
// d'artéfacts) : sans ce repli, navigator.clipboard.writeText échoue
// silencieusement et un toast "Copié !" mentait sur le résultat réel.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("clipboard API unavailable");
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

// Formate une date ISO en "05/07/2026 · 14:32" (fuseau local de l'appareil).
function formatTxDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

// ── Historique complet des transactions CPS du client ────────────────
// Liste chaque exploration débitée, contact d'annonceur débité, création
// d'alerte, vidéo aérienne, rechargement et remboursement, avec date et
// heure précises — accessible depuis "Mon compte" (aperçu limité à 3
// lignes en dehors de cette fiche complète).
function CpHistorySheet({ transactions, onClose }) {
  return (
    <div className="absolute inset-0 z-[210] flex flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
        <h3 className="font-extrabold text-slate-800 text-[16px]">Historique des transactions</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {transactions.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10">Aucune transaction pour le moment.</div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const { icon, category } = getCpTxMeta(tx);
              const isCredit = tx.type === "credit" || tx.type === "refund";
              return (
                <div key={tx.id} className="flex items-center gap-3 bg-slate-50 border border-gray-100 rounded-2xl p-3">
                  <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 text-[16px]">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{category}</p>
                    <p className="text-[12px] font-semibold text-slate-700 truncate">{tx.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatTxDateTime(tx.date)}</p>
                  </div>
                  <span className={`font-bold text-[13px] flex-shrink-0 ${isCredit ? "text-green-700" : "text-amber-600"}`}>
                    {isCredit ? "+" : "-"}{tx.cp} CPS
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TopUpSheet({ pendingAmount, pendingLabel, onClose, onConfirm, onBackToPlan }) {
  const [amount, setAmount] = useState(pendingAmount ? String(pendingAmount) : "5000");
  const [operator, setOperator] = useState("orange");
  const [step, setStep] = useState("form"); // "form" | "processing" | "done"

  const numericAmount = parseInt(amount, 10) || 0;
  const bonusPreview = computeTopUpBonus(numericAmount);
  const operators = [
    { id: "orange", label: "Orange Money" },
    { id: "mtn", label: "MTN MoMo" },
    { id: "moov", label: "Moov Money" },
    { id: "wave", label: "Wave" },
  ];

  function handleConfirm() {
    if (numericAmount < 100) return;
    setStep("processing");
    // Simulation du délai de validation Mobile Money
    setTimeout(() => {
      setStep("done");
      onConfirm(numericAmount);
      setTimeout(onClose, 1200);
    }, 1400);
  }

  return (
    <div className="absolute inset-0 z-[210] flex flex-col justify-end" style={{ zIndex: 210 }} onClick={step === "form" ? onClose : undefined}>
      <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl pb-7 flex flex-col" style={{ maxHeight: "85%" }} onClick={(e) => e.stopPropagation()}>
        {step === "form" && (
          <>
            <div className="flex items-center justify-between px-5 pt-6 pb-4 sticky top-0 bg-white rounded-t-3xl flex-shrink-0">
              <h3 className="font-extrabold text-slate-800 text-[16px]">Recharger mon compte</h3>
              <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="px-5 overflow-y-auto">
            {pendingAmount && (
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-3.5 py-2.5 mb-4">
                <p className="text-[11px] text-orange-700 font-semibold mb-2">
                  {pendingLabel
                    ? `Solde insuffisant — ${pendingLabel}. Montant minimum pré-rempli ci-dessous.`
                    : "Solde insuffisant pour cet achat — un montant minimum a été pré-rempli."}
                </p>
                {onBackToPlan && (
                  <button
                    onClick={onBackToPlan}
                    className="flex items-center gap-1 text-[11px] font-bold text-orange-700 underline underline-offset-2"
                  >
                    <ChevronLeft size={13} />Retour au plan d'abonnement
                  </button>
                )}
              </div>
            )}

            <p className="text-[11px] font-bold text-slate-600 mb-1">Montant à recharger</p>
            <p className="text-[10px] text-gray-400 mb-2">1 CPS = 100 FCFA — les bonus augmentent avec le montant rechargé</p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {TOPUP_CP_PRESETS_CLIENT.map((p) => (
                <button
                  key={p.fcfa}
                  onClick={() => setAmount(String(p.fcfa))}
                  className={`min-h-[58px] rounded-lg py-1.5 px-1 text-center border flex flex-col items-center justify-center gap-0 ${numericAmount === p.fcfa ? "bg-green-700 border-green-700 text-white" : "bg-white border-gray-200 text-slate-700"}`}
                >
                  <span className="text-[10px] font-extrabold leading-tight text-center">{p.fcfa.toLocaleString("fr-FR")} FCFA</span>
                  <span className={`text-[9.5px] font-bold leading-tight whitespace-nowrap ${numericAmount === p.fcfa ? "text-white" : "text-amber-600"}`}>
                    🪙 {p.cp} CPS
                  </span>
                  {p.bonus > 0 && (
                    <span className={`text-[8px] font-semibold leading-tight ${numericAmount === p.fcfa ? "text-green-100" : "text-green-600"}`}>
                      +{p.bonus} bonus
                    </span>
                  )}
                </button>
              ))}
              <div className="rounded-xl border border-gray-200 flex flex-col justify-center px-2 py-1">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Autre"
                  className="w-full text-[12px] font-bold text-slate-700 outline-none py-1"
                />
                {/* Correspondance CPS affichée en direct dès la saisie — même
                    conversion (fcfaToCP) que celle réellement créditée au
                    moment de la confirmation, jamais une estimation à part. */}
                {numericAmount >= 100 && (
                  <span className="text-[9.5px] font-bold text-amber-600 leading-tight">
                    🪙 {fcfaToCP(numericAmount, TOPUP_CP_PRESETS_CLIENT).cp} CPS
                  </span>
                )}
              </div>
            </div>

            {bonusPreview > 0 && (
              <p className="text-[11px] text-green-700 font-semibold mb-3 flex items-center gap-1.5">
                <Check size={13} />Bonus de {bonusPreview.toLocaleString("fr-FR")} F inclus pour ce montant
              </p>
            )}

            <p className="text-[11px] font-bold text-slate-600 mb-2">Opérateur Mobile Money</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {operators.map((op) => (
                <button
                  key={op.id}
                  onClick={() => setOperator(op.id)}
                  className={`rounded-xl py-2.5 text-center border text-[12px] font-semibold ${operator === op.id ? "bg-green-50 border-green-700 text-green-700" : "bg-white border-gray-200 text-slate-600"}`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleConfirm}
              disabled={numericAmount < 100}
              className="w-full flex items-center justify-center gap-2 bg-green-700 disabled:bg-gray-300 text-white rounded-2xl py-3.5 font-bold text-[14px]"
            >
              Recharger {numericAmount.toLocaleString("fr-FR")} F par {operators.find((o) => o.id === operator)?.label}
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2 pb-1">Montant minimum : 100 FCFA (1 CPS)</p>
            </div>
          </>
        )}

        {step === "processing" && (
          <div className="py-10 px-5 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] font-semibold text-slate-600">Validation du paiement Mobile Money…</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-10 px-5 flex flex-col items-center gap-3">
            <CheckCircle2 size={36} className="text-green-700" />
            <p className="text-[13px] font-bold text-slate-800">Paiement confirmé</p>
            <p className="text-[11px] text-gray-500">Votre compte Imoobilis a été crédité.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fiche de contact de l'annonceur ─────────────────────────────────
// Paiement unique : un seul débit en CPS au moment où le client débloque
// le contact de l'annonceur. Ce débit donne accès à la fois au numéro de
// l'annonceur ET à la programmation de visite (gratuite ensuite, quel
// que soit le nombre de créneaux pris).
function ContactAdvertiserSheet({ property, bookedVisits, onClose, onScheduleVisit }) {
  const advertiser = getAdvertiser(property);
  const propertyVisits = bookedVisits.filter((v) => v.propertyId === property.id);
  const alreadyBooked = propertyVisits.length > 0;

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
 className="bg-white rounded-t-3xl p-5 pb-7 overflow-y-auto" style={{ maxHeight: "80%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Contacter l'annonceur</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Aperçu du bien */}
        <div className="bg-slate-50 rounded-2xl px-4 py-3 mb-4 border border-slate-100">
          <p className="font-bold text-slate-800 text-[13px]">{property.title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{property.category} · {property.district}, Abidjan</p>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
            <User size={22} className="text-green-700" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-[14px] truncate">{advertiser.name}</p>
            <p className="flex items-center gap-1 text-[11px] text-green-700 font-semibold">
              <BadgeCheck size={13} />{advertiser.statusLabel}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {/* ── Contact direct : le paiement en CPS a déjà eu lieu au clic
              sur "Contacter l'annonceur" depuis la fiche du bien — le
              numéro et la programmation de visite sont donc immédiatement
              accessibles ici, sans étape intermédiaire ── */}
          <button onClick={() => { window.location.href = `tel:${advertiser.phoneDial}`; }}
            className="w-full flex items-center gap-4 bg-green-50 border border-green-100 rounded-2xl p-4 active:bg-green-100">
            <div className="w-12 h-12 bg-green-700 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-green-300">
              <Phone size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-[16px] font-extrabold text-slate-800 tracking-wide">{advertiser.phone}</p>
              <p className="text-[11px] text-green-600 font-semibold mt-0.5">📞 Toucher pour appeler</p>
            </div>
          </button>

          {/* ── Message WhatsApp direct — ouvre une conversation pré-remplie
              avec le nom du bien, pour éviter à l'annonceur de deviner de
              quelle annonce il s'agit ── */}
          <button onClick={() => {
              const text = encodeURIComponent(`Bonjour, je suis intéressé(e) par votre bien "${property.title}" (${property.category} · ${property.district}, Abidjan) sur Imoobilis.`);
              window.open(`https://wa.me/${advertiser.phoneDial.replace(/[^\d]/g, "")}?text=${text}`, "_blank");
            }}
            className="w-full flex items-center gap-4 bg-[#25D366]/10 border border-[#25D366]/30 rounded-2xl p-4 active:bg-[#25D366]/20">
            <div className="w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#25D366]/40">
              <MessageCircle size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-[14px] font-extrabold text-slate-800">Envoyer un message WhatsApp</p>
              <p className="text-[11px] text-[#128C4A] font-semibold mt-0.5">💬 Message pré-rempli avec le bien</p>
            </div>
          </button>

          {/* ── Programmer une visite : incluse dans le paiement du contact ci-dessus ── */}
          {alreadyBooked ? (
            <div>
              <p className="text-[11px] font-bold text-slate-700 mb-1.5 mt-1">Vos visites planifiées</p>
              {propertyVisits.map((v, i) => (
                <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-2.5 mb-1.5">
                  <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CalendarDays size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-800">{v.day.label} {v.day.day} {v.day.month} à {v.time}</p>
                    <p className="text-[10px] text-green-700">{v.type === "presentiel" ? "🏠 En présentiel" : "📱 Visite virtuelle"}</p>
                  </div>
                </div>
              ))}
              <p className="text-center text-[10px] text-gray-400 mt-1.5">Pour modifier votre visite, rendez-vous dans l'onglet Programme.</p>
            </div>
          ) : (
            <button onClick={onScheduleVisit}
              className="w-full flex items-center gap-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 shadow-lg shadow-orange-500/30">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <CalendarDays size={18} className="text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-[14px] text-white">Programmer une visite</p>
                <p className="text-[11px] text-orange-100">Choisissez une date et un créneau</p>
              </div>
              <span className="bg-white/20 rounded-full px-2 py-1 text-[10px] font-bold text-white flex-shrink-0">Inclus</span>
            </button>
          )}
        </div>

        {alreadyBooked && (
          <p className="text-[10px] text-slate-400 leading-snug bg-slate-50 rounded-xl p-3 mt-3">
            L'annonceur a reçu votre demande de visite avec vos coordonnées et pourra vous contacter directement.
          </p>
        )}
      </div>
    </div>
  );
}

// ── "Mes informations" ──
// Coordonnées du client : nom, prénom, contact, localisation, e-mail.
// (Pas de champs liés à des annonces : l'utilisateur ne publie pas de biens,
// il est uniquement à la recherche d'un bien immobilier.)
function MyInfoSheet({ info, onSave, onClose }) {
  const [form, setForm] = useState(info);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const FIELDS = [
    { key: "prenom", label: "Prénom", icon: User, type: "text" },
    { key: "nom", label: "Nom", icon: User, type: "text" },
    { key: "contact", label: "Contact (téléphone)", icon: Phone, type: "tel" },
    { key: "localisation", label: "Localisation", icon: MapPin, type: "text" },
    { key: "email", label: "E-mail", icon: Mail, type: "email" },
  ];

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl p-5 pb-7 overflow-y-auto" style={{ maxHeight: "80%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Mes informations</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="space-y-3">
          {FIELDS.map(({ key, label, icon: Icon, type }) => (
            <div key={key}>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                <Icon size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="bg-transparent outline-none text-[13px] text-slate-800 w-full"
                />
              </div>
            </div>
          ))}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Tranche d'âge</label>
            <p className="text-[10px] text-gray-400 mb-1.5">Utilisée pour vous proposer des annonces ciblées par les annonceurs</p>
            <div className="flex flex-wrap gap-1.5">
              {AGE_BRACKETS.map(a => (
                <button key={a} type="button" onClick={() => update("ageBracket", a)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${form.ageBracket === a ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {a} ans
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Profession</label>
            <div className="flex flex-wrap gap-1.5">
              {PROFESSIONS.map(p => (
                <button key={p} type="button" onClick={() => update("profession", p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${form.profession === p ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Centres d'intérêt</label>
            <p className="text-[10px] text-gray-400 mb-1.5">Aide les annonceurs à vous proposer des biens plus pertinents</p>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_TAGS.map(i => {
                const selected = (form.interests || []).includes(i.key);
                return (
                  <button key={i.key} type="button"
                    onClick={() => update("interests", selected ? (form.interests || []).filter(x => x !== i.key) : [...(form.interests || []), i.key])}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${selected ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                    {i.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <button
          onClick={() => onSave(form)}
          className="w-full flex items-center justify-center gap-2 bg-green-700 text-white rounded-2xl py-3.5 font-semibold text-[14px] mt-5"
        >
          Enregistrer les modifications
        </button>
      </div>
    </div>
  );
}

// ── "Sécurité" ──
// Affiche le mot de passe masqué et permet de le modifier
// (mot de passe actuel + nouveau mot de passe + confirmation).
function SecuritySheet({ onSave, onClose }) {
  const [editing, setEditing] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!current) return setError("Veuillez saisir votre mot de passe actuel.");
    if (next.length < 6) return setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
    if (next !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setError("");
    onSave();
  }

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl p-5 pb-7 overflow-y-auto" style={{ maxHeight: "80%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Sécurité</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {!editing ? (
          <>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                <Lock size={16} className="text-slate-400" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Mot de passe</p>
                <p className="font-bold text-slate-800 text-[14px] tracking-widest">••••••••</p>
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="w-full flex items-center justify-center gap-2 bg-green-700 text-white rounded-2xl py-3.5 font-semibold text-[14px] mt-4"
            >
              Modifier mon mot de passe
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Mot de passe actuel</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <Lock size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="bg-transparent outline-none text-[13px] text-slate-800 w-full"
                  />
                  <button onClick={() => setShowCurrent((v) => !v)}>
                    {showCurrent ? <EyeOff size={15} className="text-gray-400" /> : <Eye size={15} className="text-gray-400" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Nouveau mot de passe</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <Lock size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type={showNew ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="bg-transparent outline-none text-[13px] text-slate-800 w-full"
                  />
                  <button onClick={() => setShowNew((v) => !v)}>
                    {showNew ? <EyeOff size={15} className="text-gray-400" /> : <Eye size={15} className="text-gray-400" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">6 caractères minimum.</p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Confirmer le nouveau mot de passe</label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <Lock size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type={showNew ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="bg-transparent outline-none text-[13px] text-slate-800 w-full"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 mt-3">
                <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
                <p className="text-[11px] text-rose-600">{error}</p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(false)} className="flex-1 border border-gray-200 rounded-2xl py-3 font-semibold text-[13px] text-slate-600">
                Annuler
              </button>
              <button onClick={submit} className="flex-1 bg-green-700 text-white rounded-2xl py-3 font-semibold text-[13px]">
                Confirmer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── "Aide & support" ──
// FAQ adaptée à un client en recherche de bien (abonnement, contact des
// annonceurs, visites, sécurité), plus les canaux pour joindre le support.
const HELP_FAQ = [
  {
    q: "Comment contacter un annonceur ?",
    a: "Ouvrez la fiche du bien qui vous intéresse, puis touchez « Contacter l'annonceur ». Le numéro de l'annonceur s'affiche si votre abonnement est actif, et vous pouvez l'appeler directement depuis l'application.",
  },
  {
    q: "Pourquoi dois-je m'abonner pour voir le numéro de l'annonceur ?",
    a: "L'abonnement Premium permet de vérifier les annonceurs et de limiter les abus. Il vous donne un accès illimité aux coordonnées et aux visites sans restriction.",
  },
  {
    q: "Comment programmer une visite ?",
    a: "La programmation de visite est incluse dans le paiement effectué pour contacter l'annonceur : une fois le contact débloqué, touchez « Programmer une visite » depuis la fiche du bien, choisissez une date et un créneau disponible — aucun CPS supplémentaire n'est débité. Vous recevrez une confirmation et retrouverez la visite dans l'onglet « Mon compte ». Modifier une visite déjà programmée reste gratuit.",
  },
  {
    q: "Comment fonctionnent les alertes ?",
    a: `Créez une alerte avec vos critères (zone, type de bien, budget) dans l'onglet Alertes pour ${ALERT_CREATE_CP} CPS, payés une seule fois à l'activation. La surveillance et les notifications sont ensuite illimitées et gratuites. Vous serez notifié dès qu'un bien correspondant est publié.`,
  },
  {
    q: "Comment modifier mes informations personnelles ?",
    a: "Allez dans Mon compte → Mes informations pour modifier votre nom, votre contact, votre localisation ou votre e-mail.",
  },
  {
    q: "Comment résilier mon abonnement ?",
    a: "Rendez-vous dans Mon compte, puis touchez « Gérer » sur la carte d'abonnement pour consulter les options de résiliation ou de changement de formule.",
  },
];

function HelpSupportSheet({ onClose }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl p-5 pb-7 overflow-y-auto" style={{ maxHeight: "80%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 text-[16px]">Aide & support</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Canaux de contact du support */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <a href="tel:+2252720000000" className="flex flex-col items-center gap-1.5 bg-green-50 border border-green-100 rounded-2xl py-4">
            <Phone size={18} className="text-green-700" />
            <span className="text-[11px] font-semibold text-green-700">Appeler le support</span>
          </a>
          <a href="mailto:support@imoobilis.ci" className="flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-2xl py-4">
            <Mail size={18} className="text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Écrire un e-mail</span>
          </a>
        </div>

        {/* FAQ */}
        <p className="text-[12px] font-bold text-slate-700 mb-2">Questions fréquentes</p>
        <div className="space-y-2">
          {HELP_FAQ.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="text-[12.5px] font-semibold text-slate-800">{item.q}</span>
                  {open ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
                </button>
                {open && (
                  <div className="px-4 pb-3">
                    <p className="text-[11.5px] text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 mt-4">
          <LifeBuoy size={16} className="text-orange-600 flex-shrink-0" />
          <p className="text-[11px] text-orange-700 leading-snug">
            Besoin d'aide supplémentaire ? Notre équipe répond en moyenne en moins de 2 heures, du lundi au samedi.
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsCard({ n }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="w-full h-36 bg-slate-100 overflow-hidden">
        {!imgErr ? (
          <img
            src={"https://picsum.photos/id/" + n.imgId + "/600/200"}
            alt={n.title}
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-slate-200 flex items-center justify-center">
            <ImageIcon size={28} className="text-slate-400" />
          </div>
        )}
      </div>
      <div className="p-3.5">
        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">{n.tag}</span>
        <p className="font-bold text-[13px] text-slate-800 mt-1">{n.title}</p>
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">{n.excerpt}</p>
        <p className="text-[10px] text-gray-400 mt-2">{n.date}</p>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { key: "explorer", label: "Explorer", icon: Search },
  { key: "alertes", label: "Alertes", icon: Bell },
  { key: "programme", label: "Programme", icon: ClipboardList },
  { key: "visites", label: "Visites", icon: CalendarDays },
  { key: "profil", label: "Mon compte", icon: User },
];

// Notifications statiques de démo affichées dans le panneau de messages (en-tête)
const INBOX_NOTIFICATIONS = [
  {
    id: "n-price",
    type: "price_drop",
    text: "Baisse de prix : Villa duplex 6 pièces, Riviera 3",
    propertyId: "p1",
  },
  {
    id: "n-msg",
    type: "message",
    text: "Un agent a répondu à votre message",
    agentName: "Aya Kouadio",
    agentRole: "Agent immobilier — Imoobilis",
    propertyId: "p1",
    propertyTitle: "Villa duplex 6 pièces",
    time: "Aujourd'hui, 10:42",
    body: "Bonjour, merci de l'intérêt que vous portez à cette villa à Riviera 3. Elle est toujours disponible et je peux organiser une visite cette semaine si vous le souhaitez. N'hésitez pas à me dire vos disponibilités.",
  },
];

function GoogleMapWithPins({ pins, activePin, onPinClick, onMapClick, scanning, locating, userLocation, sorted, onRecenter, onZoom, mapHighlight, onViewDetail }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const CENTER = { lat: 5.345, lng: -3.948 };

  useEffect(() => {
    if (window.google && window.google.maps) { setMapReady(true); return; }
    if (document.getElementById("gmap-script")) {
      const check = setInterval(() => { if (window.google && window.google.maps) { setMapReady(true); clearInterval(check); } }, 100);
      return () => clearInterval(check);
    }
    const script = document.createElement("script");
    script.id = "gmap-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyD9tSrke72PouQMnMXa7eZSW0jkFMBWY&libraries=marker`;
    script.async = true; script.defer = true;
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    if (mapRef.current) return;
    const map = new window.google.maps.Map(mapContainerRef.current, {
      center: CENTER, zoom: 13, mapTypeId: "roadmap", disableDefaultUI: true, gestureHandling: "greedy",
      // mapId obligatoire pour utiliser AdvancedMarkerElement (marqueurs
      // ci-dessous) — sans lui, la création du moindre marqueur lève une
      // erreur qui, non interceptée, fait planter toute l'app (voir
      // ErrorBoundary). "DEMO_MAP_ID" est l'identifiant de démonstration
      // officiel de Google pour tester sans en créer un dans la Google
      // Cloud Console.
      mapId: "DEMO_MAP_ID",
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
      ],
    });
    mapRef.current = map;
    map.addListener("click", () => onMapClick());
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    pins.forEach((p) => {
      try {
        const { lat, lng } = pinToLatLng(p.mapPin);
        const pinEl = document.createElement("div");
        pinEl.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));`;
        pinEl.innerHTML = `
          <div style="width:32px;height:32px;border-radius:50%;background:white;border:2.5px solid #15803d;display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div style="margin-top:-4px;background:#14532d;color:white;font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;white-space:nowrap;font-family:sans-serif;">${formatPinPrice(p.price)}</div>`;
        const marker = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current, position: { lat, lng }, content: pinEl, title: p.title });
        marker.addListener("click", (e) => { e.domEvent?.stopPropagation?.(); onPinClick(p); });
        markersRef.current.push(marker);
      } catch (err) {
        // Un marqueur en échec ne doit jamais faire planter toute la carte
        // (ni l'app entière — voir ErrorBoundary) : on le saute simplement.
        console.error("Marqueur carte non créé pour", p.id, err);
      }
    });
  }, [mapReady, pins]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
    if (userLocation) {
      try {
        const el = document.createElement("div");
        el.style.cssText = `position:relative;display:flex;align-items:center;justify-content:center;`;
        el.innerHTML = `
          <div style="position:absolute;width:40px;height:40px;background:rgba(59,130,246,0.2);border-radius:50%;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="width:14px;height:14px;background:#3b82f6;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);position:relative;z-index:1;"></div>`;
        const style = document.createElement("style");
        style.textContent = `@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`;
        document.head.appendChild(style);
        const marker = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current, position: userLocation, content: el });
        userMarkerRef.current = marker;
      } catch (err) {
        console.error("Marqueur de position utilisateur non créé :", err);
      }
    }
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null; }
    if (!mapRef.current || !activePin) return;
    const pin = pins.find(p => p.id === activePin);
    if (!pin) return;
    const { lat, lng } = pinToLatLng(pin.mapPin);
    const times = getTravelTimes(pin.distance);
    const iw = new window.google.maps.InfoWindow({
      content: `
        <div style="font-family:sans-serif;min-width:160px;padding:4px 2px;">
          <p style="font-weight:700;font-size:12px;color:#1e293b;margin:0 0 2px;">${pin.title}</p>
          <p style="font-size:10px;color:#6b7280;margin:0 0 4px;">${pin.district}, Abidjan</p>
          <p style="font-weight:800;font-size:12px;color:#15803d;margin:0 0 6px;">${formatPrice(pin)}</p>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <span style="font-size:10px;color:#475569;background:#f1f5f9;padding:2px 7px;border-radius:99px;">🚗 ${times.car}</span>
            <span style="font-size:10px;color:#475569;background:#f1f5f9;padding:2px 7px;border-radius:99px;">🚶 ${times.walk}</span>
          </div>
          <button onclick="window._imoobilisViewDetail('${pin.id}')" style="width:100%;background:#15803d;color:white;border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;">Voir détails</button>
        </div>`,
      position: { lat, lng },
    });
    window._imoobilisViewDetail = (id) => { const p = pins.find(x => x.id === id); if (p) onViewDetail(p); };
    iw.open(mapRef.current);
    infoWindowRef.current = iw;
    iw.addListener("closeclick", () => onMapClick());
  }, [activePin, mapReady]);

  const handleRecenter = (e) => {
    e.stopPropagation();
    if (mapRef.current && userLocation) { mapRef.current.panTo(userLocation); mapRef.current.setZoom(14); }
    onRecenter();
  };
  const handleZoom = (e, dir) => { e.stopPropagation(); if (mapRef.current) { mapRef.current.setZoom(mapRef.current.getZoom() + dir); } };

  return (
    <div className={`relative mt-3 mx-4 rounded-2xl overflow-hidden border transition-all duration-300 ${mapHighlight ? "border-green-600 ring-4 ring-green-600/30" : "border-gray-200"}`} style={{ height: 480 }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      {!mapReady && (
        <div className="absolute inset-0" style={{ background: "#e8ede9" }}>
          <svg width="100%" height="100%" viewBox="0 0 400 480" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="480" fill="#e8ede9"/>
            <path d="M220 290 Q280 270 340 290 Q390 305 400 340 L400 480 L180 480 Q200 440 210 400 Q215 350 220 290Z" fill="#a9d3ef"/>
            <path d="M0 390 Q40 370 90 380 Q130 388 150 410 Q160 440 140 480 L0 480Z" fill="#a9d3ef"/>
            <path d="M150 430 Q190 420 230 435 Q250 445 240 480 L130 480Z" fill="#a9d3ef"/>
            <path d="M310 440 Q360 430 400 445 L400 480 L295 480Z" fill="#a9d3ef"/>
            <path d="M120 110 Q200 108 290 115" stroke="#f6cf6b" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            <path d="M310 30 Q355 60 390 55" stroke="#f6cf6b" strokeWidth="3" fill="none" strokeLinecap="round"/>
            <path d="M290 115 Q340 140 370 185" stroke="#f6cf6b" strokeWidth="3" fill="none" strokeLinecap="round"/>
            <path d="M80 130 Q130 155 175 210 Q190 230 195 270" stroke="#f6cf6b" strokeWidth="3" fill="none" strokeLinecap="round"/>
            <rect x="60" y="50" width="200" height="120" rx="8" fill="#d6dbd2" opacity="0.4"/>
            <rect x="280" y="60" width="110" height="100" rx="8" fill="#d6dbd2" opacity="0.35"/>
            <rect x="20" y="270" width="140" height="130" rx="8" fill="#d6dbd2" opacity="0.35"/>
            <rect x="160" y="270" width="160" height="110" rx="8" fill="#d6dbd2" opacity="0.3"/>
            <text x="168" y="45" fontSize="11" fontWeight="700" fill="#6b7280" fontFamily="sans-serif" letterSpacing="1">COCODY</text>
            <text x="290" y="195" fontSize="11" fontWeight="700" fill="#6b7280" fontFamily="sans-serif" letterSpacing="1">ANGRÉ</text>
            <text x="22" y="310" fontSize="10" fontWeight="700" fill="#6b7280" fontFamily="sans-serif" letterSpacing="0.5">LE PLATEAU</text>
            <text x="175" y="305" fontSize="10" fontWeight="700" fill="#6b7280" fontFamily="sans-serif" letterSpacing="0.5">MARCORY</text>
            {[["A1",185,115],["A16",350,50],["A202",355,175],["A100",38,302],["A3",38,327]].map(([name,x,y])=>(
              <g key={name}>
                <rect x={x-10} y={y-10} width={name.length*7+4} height={16} rx="3" fill="white" stroke="#15803d" strokeWidth="1"/>
                <text x={x-8} y={y+3} fontSize="8" fontWeight="700" fill="#15803d" fontFamily="sans-serif">{name}</text>
              </g>
            ))}
            {[[185,58,"160M FCFA"],[310,72,"75M FCFA"],[118,148,"120M FCFA"],[75,230,"150M FCFA"],[230,240,"35M FCFA"],[315,330,"50M FCFA"],[240,370,"70M FCFA"],[103,385,"70M FCFA"]].map(([px,py,label],i)=>(
              <g key={i} transform={`translate(${px},${py})`}>
                <circle cx="0" cy="-18" r="14" fill="white" stroke="#15803d" strokeWidth="2"/>
                <path d="M-5,-23 Q-5,-30 0,-33 Q5,-30 5,-23 L5,-13 L-5,-13Z M-3,-20 L3,-20 L3,-14 L-3,-14Z M-1,-22 L1,-22 L1,-20 L-1,-20Z" fill="#15803d"/>
                <rect x={-label.length*3.2} y="-10" width={label.length*6.4} height="13" rx="6" fill="#14532d"/>
                <text x="0" y="0" fontSize="8" fontWeight="700" fill="white" fontFamily="sans-serif" textAnchor="middle">{label}</text>
              </g>
            ))}
            <circle cx="196" cy="185" r="28" fill="#3b82f6" opacity="0.15"/>
            <circle cx="196" cy="185" r="20" fill="#3b82f6" opacity="0.2"/>
            <circle cx="196" cy="185" r="7" fill="#3b82f6" stroke="white" strokeWidth="2.5"/>
          </svg>
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow text-[10px] text-slate-500 font-medium">
            <div className="w-3 h-3 border-2 border-green-700 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 2 }}></div>
            Chargement de la carte…
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
        <div className="bg-white rounded-full shadow px-3 py-1.5 text-[11px] font-semibold text-slate-700 pointer-events-auto">
          {sorted.length} biens trouvés dans cette zone
        </div>
        <div className={`flex items-center gap-1.5 rounded-full shadow px-2.5 py-1.5 text-[10px] font-semibold pointer-events-auto ${locating ? "bg-white text-slate-500" : userLocation ? "bg-green-600 text-white" : "bg-white text-rose-500"}`}>
          <LocateFixed size={12} className={locating ? "animate-spin" : ""} />
          {locating ? "Localisation…" : userLocation ? "Position activée" : "Position indisponible"}
        </div>
      </div>
      <div className="absolute bottom-3 right-2 flex flex-col gap-2">
        <button onClick={handleRecenter} disabled={locating} className="w-9 h-9 bg-white rounded-full shadow flex items-center justify-center text-slate-600 disabled:opacity-60">
          <LocateFixed size={16} className={locating ? "animate-spin" : ""} />
        </button>
        <div className="bg-white rounded-full shadow flex flex-col">
          <button onClick={(e) => handleZoom(e, 1)} className="w-9 h-9 flex items-center justify-center text-slate-600 border-b border-gray-100"><Plus size={15} /></button>
          <button onClick={(e) => handleZoom(e, -1)} className="w-9 h-9 flex items-center justify-center text-slate-600"><Minus size={15} /></button>
        </div>
      </div>
      {scanning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-32 h-32 bg-blue-400/20 rounded-full animate-ping"></div>
        </div>
      )}
      {userLocation && (
        <div className="absolute bottom-3 left-2 bg-white/95 rounded-lg shadow px-2.5 py-1.5 text-[9.5px] text-slate-500 font-mono">
          {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
        </div>
      )}
    </div>
  );
}

// ── Limites du terrain (extrait topographique) ────────────────────────
// Plan schématique auto-tracé en SVG à partir des bornes GPS réelles
// fournies par l'annonceur (voir PropertyFormSheet, section "Extrait
// topographique") — volontairement indépendant de l'API Google Maps
// (contrairement au reste du catalogue, voir GoogleMapWithPins) : un plan
// topographique doit être lisible même si la carte externe ne charge pas.
// Projection équirectangulaire locale (même logique que
// computePolygonAreaM2) : les coordonnées GPS sont converties en mètres
// relatifs, ce qui donne une forme et des proportions exactes.
function TerrainBoundaryMap({ property, onClose }) {
  const points = property.topoPoints || [];

  const plan = useMemo(() => {
    if (points.length < 3) return null;
    const R = 6378137;
    const lat0 = points[0].lat * Math.PI / 180;
    const toXY = (p) => ({
      x: R * (p.lng * Math.PI / 180) * Math.cos(lat0),
      y: -(R * (p.lat * Math.PI / 180)), // inversé : le nord doit pointer vers le haut en SVG
    });
    const origin = toXY(points[0]);
    const xy = points.map(p => { const c = toXY(p); return { x: c.x - origin.x, y: c.y - origin.y }; });
    const minX = Math.min(...xy.map(p => p.x)), maxX = Math.max(...xy.map(p => p.x));
    const minY = Math.min(...xy.map(p => p.y)), maxY = Math.max(...xy.map(p => p.y));
    const w = maxX - minX, h = maxY - minY;
    const pad = Math.max(w, h, 5) * 0.3;
    const viewBox = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`;
    const strokeW = Math.max(w, h, 10) / 120;
    const sides = xy.map((p, i) => {
      const q = xy[(i + 1) % xy.length];
      return { mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, dist: Math.round(Math.hypot(q.x - p.x, q.y - p.y)) };
    });
    // Barre d'échelle : plus grande puissance de 10 (ou 5×10^n) ≤ 20% de la largeur visible
    const rawScale = (w + pad * 2) * 0.2;
    const pow = Math.pow(10, Math.floor(Math.log10(rawScale || 1)));
    const scaleLen = [1, 2, 5, 10].map(m => m * pow).reduce((best, v) => (v <= rawScale ? v : best), pow);
    // Centroïde du polygone (moyenne des sommets — suffisant pour des
    // formes convexes/simples comme un terrain) : sert à placer la
    // superficie exacte directement à l'intérieur de la parcelle.
    const centroid = {
      x: xy.reduce((s, p) => s + p.x, 0) / xy.length,
      y: xy.reduce((s, p) => s + p.y, 0) / xy.length,
    };
    return { xy, viewBox, strokeW, sides, scaleLen, centroid, fontSize: Math.max(w, h, 10) / 26 };
  }, [points]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-slate-900">
      {/* Plan en plein écran. Pas de portail ici : le vrai responsable du
          résidu visuel (barre Détails/Proximité visible par-dessus) est le
          bug de composition WebView déjà documenté plus bas sur les
          éléments `sticky` — voir le commentaire sur le conteneur de la
          fiche détail, corrigé en masquant cette fiche (hidden) tant
          qu'une sous-vue plein écran comme celle-ci est ouverte. */}
      <div className="absolute inset-0">
        {plan ? (
          <svg viewBox={plan.viewBox} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
            <defs>
              <pattern id="terrainGrid" width={Math.max(plan.strokeW * 20, 1)} height={Math.max(plan.strokeW * 20, 1)} patternUnits="userSpaceOnUse">
                <path d={`M ${Math.max(plan.strokeW * 20, 1)} 0 L 0 0 0 ${Math.max(plan.strokeW * 20, 1)}`} fill="none" stroke="#334155" strokeWidth={plan.strokeW * 0.15} />
              </pattern>
            </defs>
            <rect x="-100000" y="-100000" width="200000" height="200000" fill="#1e293b" />
            <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#terrainGrid)" />
            <polygon
              points={plan.xy.map(p => `${p.x},${p.y}`).join(" ")}
              fill="#f59e0b" fillOpacity="0.28" stroke="#f59e0b" strokeWidth={plan.strokeW}
            />
            {plan.sides.map((s, i) => (
              <text key={i} x={s.mid.x} y={s.mid.y} fontSize={plan.fontSize * 0.75} fill="#fde68a" textAnchor="middle" dy={-plan.strokeW}>
                {s.dist} m
              </text>
            ))}
            {plan.xy.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={plan.strokeW * 2.2} fill="#f59e0b" stroke="white" strokeWidth={plan.strokeW * 0.6} />
                <text x={p.x} y={p.y - plan.strokeW * 3.4} fontSize={plan.fontSize} fontWeight="700" fill="white" textAnchor="middle">
                  B{i + 1}
                </text>
              </g>
            ))}
            {/* Superficie exacte affichée directement à l'intérieur du terrain */}
            <text x={plan.centroid.x} y={plan.centroid.y} fontSize={plan.fontSize * 1.5} fontWeight="800" fill="white" textAnchor="middle" dominantBaseline="middle" stroke="#78350f" strokeWidth={plan.strokeW * 0.35} paintOrder="stroke">
              {(property.topoAreaM2 ?? property.area ?? 0).toLocaleString("fr-FR")} m²
            </text>
          </svg>
        ) : (
          <div className="flex items-center justify-center h-full px-6 text-center text-white/60 text-[13px]">
            Bornes topographiques insuffisantes pour tracer les limites.
          </div>
        )}
      </div>

      {/* Bouton fermer — icône seule, aucune barre de texte par-dessus la carte */}
      <button onClick={onClose} className="absolute top-6 left-5 z-10 w-9 h-9 bg-white/15 backdrop-blur rounded-full flex items-center justify-center">
        <ArrowLeft size={16} className="text-white"/>
      </button>

      {/* Échelle graphique, flottante en bas à gauche */}
      {plan && (
        <div className="absolute bottom-4 left-4 flex flex-col items-start gap-1">
          <svg width={90} height={14}>
            <line x1={4} y1={7} x2={86} y2={7} stroke="white" strokeWidth={2} />
            <line x1={4} y1={2} x2={4} y2={12} stroke="white" strokeWidth={2} />
            <line x1={86} y1={2} x2={86} y2={12} stroke="white" strokeWidth={2} />
          </svg>
          <span className="text-white/80 text-[9px] font-semibold">{plan.scaleLen} m</span>
        </div>
      )}
    </div>
  );
}

// ── Visit Scheduler Component ─────────────────────────────────────
function VisitScheduler({ property, advertiserSchedule, onClose, onConfirm, defaultName = "", defaultPhone = "", editMode = false, existingVisit = null, cpCost = 0, availableCP = 0, bookedSlots = [] }) {
  const allDays = getNextDays(14);
  const DAY_NAMES_SHORT = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

  // Filtrer les jours selon le programme de l'annonceur
  const availableDays = advertiserSchedule
    ? allDays.filter(d => advertiserSchedule.days.includes(DAY_NAMES_SHORT[d.date.getDay()]))
    : allDays;

  // Filtrer les créneaux selon le programme de l'annonceur
  const availableSlots = advertiserSchedule ? advertiserSchedule.slots : TIME_SLOTS;

  // Créneaux déjà programmés par d'autres clients sur ce bien — affichés
  // pour éviter que deux clients ne réservent la même date/heure. Un
  // créneau est "pris" dès qu'une visite existe pour ce jour + cette
  // heure, quel que soit le client qui l'a programmée.
  const isSlotTaken = (dayIso, time) => bookedSlots.some(s => s.day === dayIso && s.time === time);
  const takenCountByDay = (dayIso) => bookedSlots.filter(s => s.day === dayIso).length;

  const [selectedDay, setSelectedDay] = useState(editMode && existingVisit ? existingVisit.day : null);
  const [selectedTime, setSelectedTime] = useState(editMode && existingVisit ? existingVisit.time : null);
  const [visitType, setVisitType] = useState(editMode && existingVisit ? existingVisit.type : "presentiel");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [confirmed, setConfirmed] = useState(false);

  const hasEnoughCP = editMode || availableCP >= cpCost;
  const canConfirm = selectedDay && selectedTime && name.trim() && hasEnoughCP && !isSlotTaken(selectedDay.iso, selectedTime);

  function handleConfirm() {
    if (!canConfirm) return;
    setConfirmed(true);
    setTimeout(() => { onConfirm({ day: selectedDay, time: selectedTime, type: visitType, name, phone }); }, 1800);
  }

  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-[16px] mb-1">{editMode ? "Visite mise à jour !" : "Visite confirmée !"}</h3>
        <p className="text-[13px] text-gray-500 mb-1">{selectedDay.label} {selectedDay.day} {selectedDay.month} à {selectedTime}</p>
        <p className="text-[12px] text-gray-400">{visitType === "presentiel" ? "Visite en présentiel" : "Visite virtuelle"} · {property.district}, Abidjan</p>
        {!editMode && <p className="text-[11px] text-green-700 font-semibold mt-3">Un SMS de confirmation vous sera envoyé</p>}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-slate-800 text-[15px]">{editMode ? "Modifier la visite" : "Programmer une visite"}</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>

      {/* Bannière mode édition */}
      {editMode && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
          <Edit2 size={13} className="text-orange-500 flex-shrink-0"/>
          <p className="text-[11px] text-orange-700">Modification sans frais — sélectionnez un nouveau créneau ci-dessous.</p>
        </div>
      )}

      {/* Message si programme annonceur défini */}
      {advertiserSchedule && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
          <CalendarDays size={13} className="text-green-600 flex-shrink-0"/>
          <p className="text-[11px] text-green-700">Disponibilités de l'annonceur : <strong>{advertiserSchedule.days.join(", ")}</strong></p>
        </div>
      )}

      {/* Visit type */}
      <div className="flex gap-2 mb-4">
        {[["presentiel", "En présentiel", "🏠"], ["virtuel", "Virtuelle", "📱"]].map(([val, label, emoji]) => (
          <button key={val} onClick={() => setVisitType(val)}
            className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold border flex items-center justify-center gap-1.5 ${visitType === val ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
            <span>{emoji}</span>{label}
          </button>
        ))}
      </div>

      {/* Day picker — jours filtrés */}
      <p className="text-[11px] font-bold text-slate-700 mb-2">
        Choisissez une date {advertiserSchedule ? <span className="text-gray-400 font-normal">(selon disponibilités)</span> : ""}
      </p>
      {availableDays.length === 0 ? (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-center">
          <p className="text-[12px] text-orange-700">Aucun créneau disponible dans les 14 prochains jours</p>
          <p className="text-[11px] text-orange-500 mt-1">Contactez directement l'annonceur par téléphone</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {availableDays.map((d) => {
            const takenHere = takenCountByDay(d.iso);
            const fullyBooked = takenHere > 0 && takenHere >= availableSlots.length;
            return (
              <button key={d.iso} onClick={() => { setSelectedDay(d); setSelectedTime(null); }}
                className={`relative flex-shrink-0 flex flex-col items-center px-3 py-2.5 rounded-xl border text-center min-w-[52px] transition-all ${selectedDay?.iso === d.iso ? "bg-green-700 text-white border-green-700" : fullyBooked ? "border-gray-100 text-gray-300" : "border-gray-200 text-slate-600"}`}>
                <span className={`text-[10px] font-semibold ${selectedDay?.iso === d.iso ? "text-green-100" : "text-gray-400"}`}>{d.label}</span>
                <span className="text-[16px] font-extrabold leading-tight">{d.day}</span>
                <span className={`text-[10px] ${selectedDay?.iso === d.iso ? "text-green-100" : "text-gray-400"}`}>{d.month}</span>
                {takenHere > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 rounded-full leading-none ${fullyBooked ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}`}>
                    {fullyBooked ? "Complet" : takenHere}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Time slots filtrés */}
      {selectedDay && availableSlots.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-slate-700 mb-2">
            Créneau horaire {bookedSlots.length > 0 ? <span className="text-gray-400 font-normal">(🔒 = déjà pris par un autre client)</span> : ""}
          </p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {availableSlots.map((t) => {
              const taken = isSlotTaken(selectedDay.iso, t);
              return (
                <button key={t} disabled={taken} onClick={() => !taken && setSelectedTime(t)}
                  title={taken ? "Ce créneau est déjà réservé par un autre client" : undefined}
                  className={`py-2 rounded-xl text-[12px] font-semibold border flex items-center justify-center gap-1 ${
                    taken
                      ? "bg-gray-50 text-gray-300 border-gray-100 line-through cursor-not-allowed"
                      : selectedTime === t ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"
                  }`}>
                  {taken && <span className="text-[9px] not-italic no-underline">🔒</span>}{t}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Contact info — masqué en mode édition (infos déjà enregistrées) */}
      {!editMode && (
        <>
          <p className="text-[11px] font-bold text-slate-700 mb-2">Vos coordonnées</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom complet *"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] mb-2 outline-none focus:border-green-500" />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone (optionnel)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] mb-4 outline-none focus:border-green-500" />
        </>
      )}

      {/* Visite incluse gratuitement dans le paiement du contact déjà
          effectué (cpCost=0) : aucun débit CPS supplémentaire ici, en
          première prise de rendez-vous comme en modification. */}
      {!editMode && cpCost > 0 && (
        <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 mb-4 ${hasEnoughCP ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[16px]">🪙</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-700">Coût de la programmation</p>
              <p className="text-[9px] text-gray-400">Indexé sur le prix du bien</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-[13px] font-extrabold ${hasEnoughCP ? "text-amber-700" : "text-rose-600"}`}>{cpCost} CPS</p>
            {!hasEnoughCP && <p className="text-[9px] text-rose-500 font-semibold">Solde insuffisant ({availableCP} CPS)</p>}
          </div>
        </div>
      )}
      {!editMode && cpCost === 0 && (
        <p className="text-[10px] text-green-600 bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-center font-semibold">
          ✅ Visite incluse — déjà couverte par votre contact avec l'annonceur
        </p>
      )}

      <button onClick={handleConfirm} disabled={!canConfirm}
        className={`w-full py-3 rounded-xl font-semibold text-[13px] transition-all ${canConfirm ? "bg-green-700 text-white" : "bg-orange-50 text-gray-400"}`}>
        {!hasEnoughCP
          ? "🪙 Solde CPS insuffisant"
          : canConfirm
          ? editMode
            ? `Confirmer la modification — ${selectedDay?.day} ${selectedDay?.month} à ${selectedTime}`
            : `Confirmer la visite — ${selectedDay?.day} ${selectedDay?.month} à ${selectedTime}`
          : "Sélectionnez une date et un créneau"}
      </button>
    </div>
  );
}

// ── Nearby Services Component ─────────────────────────────────────
function NearbyServices({ property, userLocation }) {
  const [activeFilter, setActiveFilter] = useState("tous");
  const [selectedService, setSelectedService] = useState(null);
  const [places, setPlaces] = useState(NEARBY_SERVICES.default);
  const [loading, setLoading] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);

  const { lat, lng } = property.mapPin ? pinToLatLng(property.mapPin) : { lat: 5.345, lng: -3.948 };

  // Interroge Places API (New) — Search Nearby — autour du bien à chaque
  // changement de filtre. Si aucune clé n'est configurée ou en cas
  // d'échec réseau, on reste silencieusement sur le jeu de démonstration
  // (NEARBY_SERVICES) pour que l'écran reste toujours utilisable.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    searchNearbyPlaces(lat, lng, activeFilter, { signal: controller.signal }).then(result => {
      if (cancelled) return;
      if (result && result.length > 0) {
        setPlaces(result);
        setIsLiveData(true);
      } else {
        setPlaces(activeFilter === "tous" ? NEARBY_SERVICES.default : NEARBY_SERVICES.default.filter(s => s.type === activeFilter));
        setIsLiveData(false);
      }
      setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [lat, lng, activeFilter]);

  const filtered = isLiveData
    ? places // déjà filtré côté API par type demandé
    : (activeFilter === "tous" ? places : places.filter(s => s.type === activeFilter));

  function openItinerary(service) {
    const destLat = lat + (service.distance * 0.008);
    const destLng = lng + (service.distance * 0.006);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destLat},${destLng}&travelmode=driving`;
    window.open(url, "_blank");
  }


  return (
    <div>
      {/* Service filters */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12px] font-bold text-slate-700">Services à proximité</p>
        {!loading && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isLiveData ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
            {isLiveData ? "🟢 Données en direct" : "Aperçu"}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {SERVICE_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveFilter(t.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${activeFilter === t.key ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Service list */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-[60px] rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
      <div className="space-y-2">
        {filtered.map(s => {
          const Icon = s.icon;
          const times = getTravelTimes(s.distance);
          const isSelected = selectedService?.id === s.id;
          return (
            <div key={s.id}>
              <button onClick={() => setSelectedService(isSelected ? null : s)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected ? "border-green-500 bg-green-50" : "border-orange-50 bg-white"}`}>
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={s.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-slate-800 truncate">{s.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-green-700 font-semibold">{formatDistance(s.distance)} km</span>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500"><Car size={9} />{times.car}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500"><Footprints size={9} />{times.walk}</span>
                    {s.rating && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-semibold"><Star size={9} className="fill-amber-400"/>{s.rating}</span>
                      </>
                    )}
                  </div>
                </div>
                <Navigation size={13} className={isSelected ? "text-green-600" : "text-gray-300"} />
              </button>
              {isSelected && (
                <div className="flex gap-2 px-1 pt-1.5 pb-1">
                  <button onClick={() => openItinerary(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 text-white rounded-xl py-2 text-[11px] font-semibold">
                    <Navigation size={11} /> Itinéraire
                  </button>
                  <button onClick={() => setSelectedService(null)}
                    className="px-3 border border-gray-200 text-slate-500 rounded-xl py-2 text-[11px] font-semibold">
                    Fermer
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-6">Aucun lieu trouvé à proximité pour ce filtre.</p>
        )}
      </div>
      )}
    </div>
  );
}

// ── Property Score Component ──────────────────────────────────────
function PropertyScore({ property }) {
  const scores = [
    { label: "Localisation", value: Math.min(10, Math.round(10 - property.distance * 1.2)), color: "bg-green-500" },
    { label: "Accessibilité", value: Math.min(10, Math.round(8 + Math.random() * 2)), color: "bg-green-500" },
    { label: "Services proches", value: Math.round(6 + Math.random() * 3), color: "bg-purple-500" },
    { label: "Qualité estimée", value: Math.round(7 + Math.random() * 2.5), color: "bg-orange-500" },
  ];
  const avg = Math.round(scores.reduce((s, x) => s + x.value, 0) / scores.length * 10) / 10;

  return (
    <div className="bg-slate-50 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-bold text-slate-700">Score du bien</p>
        <div className="flex items-center gap-1">
          <Star size={13} className="text-amber-400 fill-amber-400" />
          <span className="text-[13px] font-extrabold text-slate-800">{avg}/10</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {scores.map(s => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-600">{s.label}</span>
              <span className="text-[11px] font-bold text-slate-700">{s.value}/10</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${s.value * 10}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Location Search Overlay (full-screen, like the screenshot reference) ──
function LocationSearchOverlay({ value, onChange, onClose, onSelectPlace, onUseMyLocation, locating, alertEditMode }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const query = value.trim().toLowerCase();
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = norm(query);

  let nearby = [];   // Abidjan, proche, avec distance
  let national = []; // reste de la Côte d'Ivoire (et Abidjan hors correspondance directe)

  if (!q) {
    // Pas de recherche : on suggère les lieux les plus proches (Abidjan)
    nearby = [...ABIDJAN_PLACES].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 8);
  } else {
    const matches = ADDRESS_SUGGESTIONS.filter(
      (s) => norm(s.name).includes(q) || norm(s.subtitle).includes(q)
    );
    nearby = matches.filter((s) => s.distanceKm !== undefined).sort((a, b) => a.distanceKm - b.distanceKm);
    national = matches
      .filter((s) => s.distanceKm === undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }

  const [apiResults, setApiResults] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    if (q.length < 2) { setApiResults([]); setApiError(null); setApiLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setApiLoading(true);
      setApiError(null);
      try {
        const found = await geocodeAddressCI(value.trim(), { signal: controller.signal });
        setApiResults(found);
      } catch (err) {
        if (err.name === "AbortError") { /* recherche annulée, rien à afficher */ }
        else if (err.name === "RateLimitError") setApiError(err.message);
        else setApiError("Recherche d'adresses indisponible pour le moment");
      } finally {
        setApiLoading(false);
      }
    }, 450); // debounce — respecte la limite d'1 requête/s de Nominatim
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, value]);

  const localEmpty = !nearby.length && !national.length;
  const noResults = q.length < 2 ? localEmpty : (localEmpty && !apiLoading && !apiError && apiResults.length === 0);

  function highlightMatch(text) {
    if (!query) return <span className="text-blue-600">{text}</span>;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return <span className="text-slate-800">{text}</span>;
    return (
      <>
        <span className="text-blue-600">{text.slice(0, idx + query.length)}</span>
        <span className="text-slate-800">{text.slice(idx + query.length)}</span>
      </>
    );
  }

  return (
    <div className="absolute inset-0 z-[250] bg-white flex flex-col overflow-hidden">
      {/* drag handle */}
      <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* search bar */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2.5 flex-1 min-w-0">
            <Search size={17} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ville, quartier, adresse, mot-clé…"
              className="bg-transparent outline-none text-[14px] flex-1 min-w-0 text-slate-700 placeholder:text-gray-400"
            />
            {value && (
              <button onClick={() => onChange("")}>
                <X size={15} className="text-gray-400" />
              </button>
            )}
          </div>
          {alertEditMode ? (
            <button onClick={onClose} className="flex items-center gap-0.5 text-green-700 text-[12px] font-semibold flex-shrink-0 px-1 whitespace-nowrap">
              <ChevronLeft size={15} />Alerte
            </button>
          ) : (
            <button onClick={onClose} className="text-green-700 text-[13px] font-semibold flex-shrink-0 px-1">Carte</button>
          )}
        </div>
      </div>

      {/* results list */}
      <div className="overflow-y-auto flex-1">
        <button onClick={onUseMyLocation} className="w-full flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 text-left">
          <Navigation size={18} className="text-slate-700 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-slate-800 text-[14px]">Votre position</p>
            <p className="text-[12px] text-gray-400 leading-snug">
              {locating ? "Localisation en cours…" : "Prise en charge à l'emplacement indiqué par les données GPS"}
            </p>
          </div>
        </button>

        {noResults && (
          <div className="text-center py-10 text-gray-400 text-[13px]">Aucun résultat</div>
        )}

        {nearby.length > 0 && (
          <>
            {q && <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">À proximité</p>}
            {nearby.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectPlace(r)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate">{highlightMatch(r.name)}</p>
                  <p className="text-[12px] text-gray-400 truncate">{r.subtitle}</p>
                </div>
                <span className="text-[12px] text-gray-400 flex-shrink-0">{formatDistanceShort(r.distanceKm)}</span>
              </button>
            ))}
          </>
        )}

        {national.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Côte d'Ivoire</p>
            {national.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectPlace(r)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate">{highlightMatch(r.name)}</p>
                  <p className="text-[12px] text-gray-400 truncate">{r.subtitle}</p>
                </div>
                <span className="text-[11px] text-gray-300 flex-shrink-0 capitalize">{r.type}</span>
              </button>
            ))}
          </>
        )}

        {q.length >= 2 && (
          <>
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
              Adresses (OpenStreetMap)
              {apiLoading && <span className="w-3 h-3 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />}
            </p>

            {apiError && (
              <div className="px-4 py-3 text-[12px] text-amber-600">{apiError}</div>
            )}

            {!apiError && !apiLoading && apiResults.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-gray-400">Aucune adresse trouvée</div>
            )}

            {apiResults.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectPlace(r)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate">{highlightMatch(r.name)}</p>
                  <p className="text-[12px] text-gray-400 truncate">{r.subtitle}</p>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// NOTIFICATION POPUP — fenêtre de notification avec 2 bips sonores
// Utilisée côté client (annonceur les a contactés) et côté annonceur
// (nouvelle demande de visite reçue d'un client).
// ══════════════════════════════════════════════════════════════════

// Double bip global — 2 bips courts identiques, utilisable partout dans l'app
function playDoubleBeepGlobal() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [0, 0.38].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1046.5; // Do6
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.32, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    });
  } catch { /* Audio indisponible */ }
}


// ══════════════════════════════════════════════════════════════════
// BANDEAU DÉFILANT UNIQUE — TickerBanner
// ══════════════════════════════════════════════════════════════════
// Config par défaut (peut être surchargée par l'admin)
const DEFAULT_BANNER_CONFIG = {
  welcomeMessage: "Bienvenue sur Imoobilis — trouvez votre bien idéal à Abidjan !",
  welcomeDurationSec: 30,  // durée phase "Bienvenue" en secondes
  newsDurationSec: 60,     // durée phase "Actualités" en secondes
};

function TickerBanner({ adminBannerConfig, welcomeMapsLeft, welcomeValid }) {
  const cfg = { ...DEFAULT_BANNER_CONFIG, ...(adminBannerConfig || {}) };
  // Phase : "welcome" pendant welcomeDurationSec, puis "news" pendant newsDurationSec, cycle infini
  const cycleSec = cfg.welcomeDurationSec + cfg.newsDurationSec;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const posInCycle = elapsed % cycleSec;
  const phase = posInCycle < cfg.welcomeDurationSec ? "welcome" : "news";

  // Vitesse de défilement : adaptée à la longueur du contenu
  const welcomeSpeed = Math.max(40, Math.round(cfg.welcomeMessage.length * 0.8));
  const newsSpeed = 180;

  return (
    <div className="overflow-hidden bg-black flex items-stretch mt-3" style={{ height: 34 }}>
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .ticker-welcome { animation: tickerScroll ${welcomeSpeed}s linear infinite; white-space: nowrap; }
        .ticker-news    { animation: tickerScroll ${newsSpeed}s linear infinite; white-space: nowrap; }
      `}</style>

      {/* Label fixe à gauche */}
      <div className="flex-shrink-0 flex items-center px-3 border-r border-gray-700 bg-black">
        {phase === "welcome" ? (
          <span className="text-white text-[11px] font-extrabold tracking-wide">Bienvenue</span>
        ) : (
          <span className="text-orange-400 text-[11px] font-extrabold tracking-wide">Actualités</span>
        )}
      </div>

      {/* Zone défilante */}
      <div className="flex-1 overflow-hidden flex items-center relative">
        {phase === "welcome" && (
          <div className={`ticker-welcome flex items-center gap-8`}>
            {[0, 1, 2].map(i => (
              <span key={i} className="flex items-center gap-3 text-white text-[11px] font-semibold">
                <span>🎁</span>
                <span>{cfg.welcomeMessage}</span>
                {welcomeValid && welcomeMapsLeft > 0 && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span>🗺 <strong>{welcomeMapsLeft}</strong> carte{welcomeMapsLeft > 1 ? "s" : ""} restante{welcomeMapsLeft > 1 ? "s" : ""}</span>
                  </>
                )}
              </span>
            ))}
          </div>
        )}
        {phase === "news" && (
          <div className={`ticker-news flex items-center gap-8`}>
            {[0, 1].map(loop => (
              <span key={loop} className="flex items-center gap-8">
                {NEWS.map(n => (
                  <span key={n.id} className="flex items-center gap-2 text-white text-[11px] font-medium">
                    <Newspaper size={11} className="text-gray-500 flex-shrink-0" />
                    <span className="text-orange-400 font-bold">{n.tag}</span>
                    <span>{n.title}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-400">{n.date}</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Durée d'affichage de la popup de notification, volontairement longue (en ms).
// L'utilisateur garde toujours la possibilité de la fermer lui-même avant
// son expiration grâce au bouton ✕.
const NOTIFICATION_POPUP_DURATION = 14000;

function NotificationPopup({ notification, onClose, onView }) {
  // Auto-fermeture après une durée généreuse — l'utilisateur peut aussi
  // fermer la popup lui-même à tout moment via le bouton ✕.
  useEffect(() => {
    const t = setTimeout(onClose, NOTIFICATION_POPUP_DURATION);
    return () => clearTimeout(t);
  }, [onClose]);

  // 2 bips au montage
  useEffect(() => { playDoubleBeepGlobal(); }, []);

  if (!notification) return null;

  const isVisitRequest  = notification.type === "visit_request";   // côté annonceur
  const isAdvertiserMsg = notification.type === "advertiser_msg";  // côté client
  const isPromo         = notification.type === "promo";           // côté client — code promo partagé par l'admin
  const canView = typeof onView === "function";

  const popup = (
    <div
      className="fixed inset-x-0 top-0 z-[9000] flex items-start justify-center px-4 pt-3 pointer-events-none"
      style={{ zIndex: 9000 }}
    >
      <div
        className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto"
        style={{ animation: "slideDownFade 0.35s ease-out" }}
      >
        {/* Barre de progression */}
        <div className="h-1 bg-gray-100 overflow-hidden">
          <div
            className={`h-full ${isVisitRequest ? "bg-orange-500" : isPromo ? "bg-amber-500" : "bg-green-600"}`}
            style={{ animation: `shrinkBar ${NOTIFICATION_POPUP_DURATION / 1000}s linear forwards` }}
          />
        </div>

        <div
          className={`flex items-start gap-3 px-4 py-3.5 ${canView ? "cursor-pointer active:bg-gray-50" : ""}`}
          onClick={canView ? () => { onView(); onClose(); } : undefined}
          role={canView ? "button" : undefined}
        >
          {/* Icône */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
            isVisitRequest ? "bg-orange-500" : isPromo ? "bg-amber-500" : "bg-green-700"
          }`}>
            {isVisitRequest
              ? <CalendarDays size={18} className="text-white" />
              : isPromo
              ? <span className="text-[18px]">🎁</span>
              : <Phone size={18} className="text-white" />
            }
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-extrabold text-slate-800 leading-tight">
              {isVisitRequest ? "Nouvelle demande de visite" : isPromo ? "🎁 Code promo Imoobilis" : "L'annonceur vous a contacté"}
            </p>
            {isPromo ? (
              <p className="text-[11px] text-amber-700 font-semibold mt-0.5 truncate">
                {notification.promoCode} — {notification.promoDescription}
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                {notification.propertyTitle}
              </p>
            )}
            {isVisitRequest && notification.clientName && (
              <p className="text-[11px] text-orange-600 font-semibold mt-0.5">
                👤 {notification.clientName} · {notification.day?.label} {notification.day?.day} {notification.day?.month} à {notification.time}
              </p>
            )}
            {isAdvertiserMsg && notification.advertiserName && (
              <p className="text-[11px] text-green-700 font-semibold mt-0.5">
                📞 {notification.advertiserName} — son contact est maintenant disponible
              </p>
            )}
            {canView && (
              <p className={`text-[10px] font-bold mt-1 ${isVisitRequest ? "text-orange-500" : isPromo ? "text-amber-600" : "text-green-600"}`}>
                {isPromo ? "Toucher pour voir le code →" : "Toucher pour voir le bien →"}
              </p>
            )}
          </div>

          {/* Fermer — l'utilisateur peut toujours fermer lui-même la popup */}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="flex-shrink-0 mt-0.5">
            <X size={16} className="text-gray-300" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideDownFade {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes shrinkBar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );

  // Remarque : cette popup est rendue une seule fois, au niveau de
  // DualScreenApp, en dehors des écrans Client/Annonceur (qui restent tous
  // les deux montés en permanence mais cachés via opacity:0 quand inactifs —
  // voir DualScreenApp). Si on la rendait à l'intérieur d'un de ces écrans,
  // elle hériterait de cette opacité 0 dès qu'elle se déclenche côté écran
  // inactif et resterait invisible tout le temps de son affichage — c'est ce
  // qui empêchait la notification "L'annonceur vous a contacté" d'apparaître
  // côté client.
  return popup;
}

// ══════════════════════════════════════════════════════════════════
// STORE PARTAGÉ — données communes aux deux espaces
// ══════════════════════════════════════════════════════════════════
const SharedStoreContext = React.createContext(null);

function SharedStoreProvider({ children }) {
  // ── Portefeuille CPS du client — délibérément stocké ici (et non dans
  // ImoobilisApp/ClientApp) car ce composant, lui, ne démonte JAMAIS en
  // mode mobile lors d'une déconnexion (voir DualScreenApp : mobileScreen
  // passe à "login", ce qui démonte ImoobilisApp et réinitialiserait tout
  // état local). Le client peut donc explorer plusieurs biens un jour,
  // se déconnecter, revenir des jours plus tard continuer d'explorer, puis
  // décider de contacter un annonceur : le débit couvrira alors bien le
  // total cumulé de TOUTES les explorations effectuées depuis le dernier
  // contact payé, pas seulement celles de la session en cours.
  const [clientCpBalance, setClientCpBalance] = useState(0);
  const [clientCpBonus, setClientCpBonus] = useState(0);
  const [clientCpTransactions, setClientCpTransactions] = useState([]);
  const [pendingExplorationCP, setPendingExplorationCP] = useState(0);
  const [unlockedNearbyServices, setUnlockedNearbyServices] = useState(new Set());
  const [unlockedContacts, setUnlockedContacts] = useState(new Set());
  const [unlockedAerialViews, setUnlockedAerialViews] = useState(new Set());
  const WELCOME_EXPIRY_DAYS = 30;
  const [welcomeState, setWelcomeState] = useState({
    activatedAt: new Date().toISOString(),
    mapsLeft: 5,
  });
  // Identité du client — stockée ici (comme le portefeuille CPS ci-dessus)
  // pour survivre à une déconnexion/reconnexion, et pour être visible côté
  // module Clients de l'administration (voir ImoobilisAdmin.jsx, application
  // désormais détachée).
  const [myInfo, setMyInfo] = useState({
    nom: "Yao",
    prenom: "Konan",
    contact: "+225 07 07 12 34 56",
    localisation: "Cocody, Abidjan",
    email: "konan.yao@email.com",
    ageBracket: "26-35",
    profession: "Salarié(e) / Cadre",
    interests: [],
  });
  // Compte client suspendu par l'administration (fraude suspectée, litige…)
  // — bloque l'accès à l'espace client tant qu'il n'est pas réactivé.
  const [clientSuspended, setClientSuspended] = useState(false);

  // ── Synchronisation Supabase du portefeuille CPS client ──
  // Même principe que pour "properties" (voir plus haut) : mise à jour
  // locale toujours immédiate, la persistance suit derrière sans jamais
  // bloquer l'interface. Démo mono-client : l'identité utilisée est
  // myInfo.contact (aucune vraie authentification pour l'instant — voir
  // sql/012_enable_rls.sql pour la limite déjà documentée côté sécurité).
  const clientDbIdRef = useRef(null);
  const clientTxSyncedCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await upsertClientByPhone({
          phone: myInfo.contact, nom: myInfo.nom, prenom: myInfo.prenom,
          email: myInfo.email, localisation: myInfo.localisation,
        });
        if (cancelled || !id) return;
        clientDbIdRef.current = id;
        // Restaure le solde et l'historique déjà en base (reconnexion,
        // nouvel appareil...) — fusionnés avec l'état local en cours.
        const row = await supabaseFetch(`clients?id=eq.${id}&select=cp_balance,cp_bonus,pending_exploration_cp`);
        if (row?.[0]) {
          setClientCpBalance(row[0].cp_balance || 0);
          setClientCpBonus(row[0].cp_bonus || 0);
          setPendingExplorationCP(row[0].pending_exploration_cp || 0);
        }
        const txRows = await supabaseFetch(`cp_transactions?account_type=eq.client&account_id=eq.${id}&order=created_at.desc&select=id,type,label,cp,bonus,property_id,created_at`);
        if (txRows?.length) {
          setClientCpTransactions(txRows.map(t => ({
            id: t.id, type: t.type, label: t.label, cp: t.cp, bonus: t.bonus,
            propertyId: t.property_id, date: t.created_at,
          })));
          clientTxSyncedCountRef.current = txRows.length;
        }
      } catch (err) {
        console.error("Chargement Supabase (portefeuille client) échoué — l'app continue en local :", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Réception des codes promo partagés depuis l'administration ──
  // ImoobilisAdmin.jsx (application détachée) écrit directement dans
  // client_messages (voir handleSharePromo côté admin) : ce fichier n'a
  // aucun moyen d'être notifié en direct (pas de websocket/Realtime
  // configuré), donc on interroge Supabase toutes les 8 secondes tant que
  // l'app est ouverte. Les messages "advertiser_contact" (créés localement
  // par contactClient côté AdvertiserApp, dans cette même app) ne sont pas
  // concernés — uniquement les codes promo, qui viennent de l'extérieur.
  useEffect(() => {
    let cancelled = false;
    async function pollPromoMessages() {
      if (!clientDbIdRef.current) return;
      try {
        const rows = await supabaseFetch(
          `client_messages?client_id=eq.${clientDbIdRef.current}&type=eq.promo&select=id,is_read,created_at,promo_codes(code,type,value)&order=created_at.desc`
        );
        if (cancelled || !rows) return;
        setAdvertiserMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const fresh = rows
            .filter(r => !existingIds.has(r.id) && r.promo_codes)
            .map(r => ({
              id: r.id,
              type: "promo",
              promoCode: r.promo_codes.code,
              promoDescription: r.promo_codes.type === "cps_bonus"
                ? `${r.promo_codes.value} CPS offerts`
                : `${r.promo_codes.value}% de remise au prochain rechargement`,
              time: new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              read: r.is_read,
            }));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      } catch (err) {
        console.error("Vérification Supabase (codes promo partagés) échouée :", err);
      }
    }
    pollPromoMessages();
    const id = setInterval(pollPromoMessages, 8000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Solde : synchronisé à chaque changement (débit/crédit/remboursement).
  useEffect(() => {
    if (!clientDbIdRef.current) return;
    supabaseFetch(`clients?id=eq.${clientDbIdRef.current}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        cp_balance: clientCpBalance, cp_bonus: clientCpBonus,
        pending_exploration_cp: pendingExplorationCP,
      }),
    }).catch(err => console.error("Synchronisation Supabase (solde client) échouée :", err));
  }, [clientCpBalance, clientCpBonus, pendingExplorationCP]);

  // Historique : seules les transactions pas encore envoyées sont
  // poussées (celles déjà restaurées depuis Supabase au démarrage, ou déjà
  // synchronisées dans cette session, ne sont jamais renvoyées en double).
  useEffect(() => {
    if (!clientDbIdRef.current) return;
    const alreadySynced = clientTxSyncedCountRef.current;
    if (clientCpTransactions.length <= alreadySynced) return;
    const newOnes = clientCpTransactions.slice(0, clientCpTransactions.length - alreadySynced);
    clientTxSyncedCountRef.current = clientCpTransactions.length;
    const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    supabaseFetch(`cp_transactions`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(newOnes.map(tx => ({
        // Pas de champ "id" ici : laisse Postgres générer l'UUID par défaut.
        account_type: "client", account_id: clientDbIdRef.current,
        type: tx.type, label: tx.label, cp: tx.cp, bonus: tx.bonus || 0,
        // property_id doit être un vrai UUID Supabase (contrainte de clé
        // étrangère) — les biens de démo du catalogue local n'y sont pas
        // synchronisés, donc on l'omet plutôt que de faire échouer tout
        // l'envoi pour une seule ligne invalide.
        property_id: isUuid(tx.propertyId) ? tx.propertyId : null,
      }))),
    }).catch(err => console.error("Synchronisation Supabase (historique client) échouée :", err));
  }, [clientCpTransactions]);

  const [publishedProperties, setPublishedProperties] = useState(() => {
    const now = Date.now();
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
    return [
      // 🧪 DÉMO — bien dont la confirmation hebdomadaire de disponibilité
      // est en retard (7 jours dépassés, encore dans le délai de grâce) :
      // affiche la relance "🔔 Ce bien est-il toujours disponible ?" côté
      // annonceur, sans encore être suspendu. À retirer avant mise en prod.
      {
        id: "demo-confirm-due", title: "Duplex 4 pièces", category: "Duplex", district: "Riviera Palmeraie",
        transaction: "vente", price: 68000000, beds: 4, baths: 3, area: 240, distance: 1.4, amenities: ["Jardin"],
        advertiserName: "Konan Yao", advertiserPhone: "+225 07 00 00 00 00", advertiserType: "particular",
        publishedAt: daysAgo(8), lastConfirmedAt: daysAgo(8),
        isSuspended: false, suspendedAt: null, views: 12, contacts: 1,
      },
      // 🧪 DÉMO — bien déjà suspendu depuis 1 jour (confirmation en retard
      // de plus de 7+3 jours) : affiche la relance "⛔ Ce bien est suspendu"
      // avec le compte à rebours avant suppression automatique. À retirer
      // avant mise en prod.
      {
        id: "demo-suspended", title: "Studio meublé", category: "Studio", district: "Marcory",
        transaction: "location", price: 180000, beds: 1, baths: 1, area: 35, distance: 2.1, amenities: ["Climatisation"],
        advertiserName: "Konan Yao", advertiserPhone: "+225 07 00 00 00 00", advertiserType: "particular",
        publishedAt: daysAgo(11), lastConfirmedAt: daysAgo(11),
        isSuspended: true, suspendedAt: daysAgo(1), views: 34, contacts: 3,
      },
      // 🧪 DÉMO — bien publié normalement (aucune confirmation en retard,
      // aucune suspension), déjà exploré (avec CPS réellement payé pour
      // carte/POI/trajet — explorations) par au moins un client : permet
      // de tester directement le flux "Supprimer" → paiement de la
      // commission Imoobilis via CinetPay avant suppression effective (voir
      // requestDelete / CommissionPaymentSheet). À retirer avant mise en prod.
      {
        id: "demo-explored", title: "Appartement 3 pièces meublé", category: "Appartement", district: "Cocody Angré",
        transaction: "location", price: 350000, beds: 2, baths: 1, area: 85, distance: 0.9, amenities: ["Piscine", "Sécurité"],
        advertiserName: "Konan Yao", advertiserPhone: "+225 07 00 00 00 00", advertiserType: "particular",
        publishedAt: daysAgo(3), lastConfirmedAt: daysAgo(0),
        isSuspended: false, suspendedAt: null, views: 27, contacts: 4, explorations: 3,
        commissionRate: computeCommissionRate(350000, "location"),
        commissionAmount: computeCommission(350000, "location"),
      },
    ];
  });
  // Demandes de visite envoyées par les clients : reçues par l'annonceur
  // dans son module "Visites" (avec le contact du client).
  const [visitRequests, setVisitRequests] = useState([]);
  // Messages envoyés par l'annonceur vers la messagerie du client, une fois
  // que l'annonceur a "Contacté le client" (et donc révélé son propre contact).
  const [advertiserMessages, setAdvertiserMessages] = useState([]);
  // Programme de visites par annonceur : { [advertiserPhone]: { days: string[], slots: string[] } }
  const [visitSchedules, setVisitSchedules] = useState({});
  // Signalements envoyés par les clients (bien indisponible/vendu/loué,
  // infos incorrectes, annonce frauduleuse...) — transmis à l'équipe
  // Imoobilis pour modération. La résolution de ces signalements se fait
  // désormais depuis l'application d'administration, entièrement détachée
  // de ce fichier (voir ImoobilisAdmin.jsx) ; en production, les deux
  // partageraient le même backend, donc un signalement créé ici serait
  // bien visible et traitable côté admin.
  const [propertyReports, setPropertyReports] = useState([]);
  function reportProperty(report) { setPropertyReports(prev => [report, ...prev]); }

  // Historique des commissions Imoobilis réglées via CinetPay (voir
  // CommissionPaymentSheet) — journalisé ICI, séparément de
  // publishedProperties, car le bien est retiré du catalogue juste après
  // paiement (voir handleDelete) : sans ce log, toute trace du montant, de
  // la zone et du type de transaction serait perdue. Alimente le tableau
  // "Historique des commissions" de l'annonceur (par type de transaction,
  // zone géographique, etc.).
  const [commissionPayments, setCommissionPayments] = useState([]);
  function addCommissionPayment(payment) { setCommissionPayments(prev => [payment, ...prev]); }

  // ── Codes promo (module "Code Promo") ──
  // Deux types : bonus de CPS offerts directement au client (cps_bonus),
  // ou remise en % sur le prochain rechargement (discount_topup, appliquée
  // côté TopUpSheet). usesCount suit l'usage réel (redeemPromoCode), maxUses
  // = null → illimité. Les codes eux-mêmes sont créés depuis
  // l'administration (ImoobilisAdmin.jsx, application détachée) — ce
  // fichier se contente de les lire depuis Supabase et de suivre leur
  // utilisation.
  const [promoCodes, setPromoCodes] = useState([]);
  useEffect(() => {
    supabaseFetch(`promo_codes?select=id,code,type,value,max_uses,uses_count,active`)
      .then(rows => {
        if (!rows) return;
        setPromoCodes(rows.map(r => ({
          id: r.id, code: r.code, type: r.type, value: r.value,
          maxUses: r.max_uses, usesCount: r.uses_count, active: r.active,
        })));
      })
      .catch(err => console.error("Chargement Supabase (codes promo) échoué :", err));
  }, []);
  function addPromoCode(promo) {
    setPromoCodes(prev => [{ id: `promo-${Date.now()}`, usesCount: 0, active: true, createdAt: new Date().toISOString(), ...promo }, ...prev]);
  }
  function togglePromoCode(id) {
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  }
  function deletePromoCode(id) { setPromoCodes(prev => prev.filter(p => p.id !== id)); }
  function incrementPromoCodeUses(id) {
    setPromoCodes(prev => {
      const next = prev.map(p => p.id === id ? { ...p, usesCount: (p.usesCount || 0) + 1 } : p);
      const promo = next.find(p => p.id === id);
      if (promo) {
        supabaseFetch(`promo_codes?id=eq.${id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ uses_count: promo.usesCount }),
        }).catch(err => console.error("Synchronisation Supabase (usage code promo) échouée :", err));
      }
      return next;
    });
  }
  // Un code ne peut être réclamé qu'une seule fois par client — appliqué
  // désormais via la contrainte réelle de la base (promo_code_redemptions,
  // voir sql/007_promo_codes.sql) plutôt qu'un Set local qui ne survivait
  // pas à une reconnexion. redeemedPromoCodes reste utilisé comme cache
  // local pour un retour instantané dans l'interface.
  const [redeemedPromoCodes, setRedeemedPromoCodes] = useState(new Set());

  // ── Popups de notification (visite reçue / client contacté) ──
  // Ces popups sont déclenchées depuis l'intérieur des écrans Client et
  // Annonceur (ImoobilisApp / AdvertiserApp), mais doivent être RENDUES par
  // DualScreenApp, en dehors des conteneurs à opacité variable utilisés pour
  // afficher/masquer l'écran inactif en mode mobile. Sans cela, une popup
  // déclenchée pendant que son écran est inactif hérite de l'opacité 0 du
  // conteneur parent et reste invisible pendant toute sa durée d'affichage.
  const [clientNotif, setClientNotif] = useState(null);       // popup affichée côté client
  const [advertiserNotif, setAdvertiserNotif] = useState(null); // popup affichée côté annonceur
  // Demande de navigation ("afficher le bien") émise au clic sur une popup,
  // consommée par un useEffect dans le composant concerné (qui possède l'état
  // de navigation local : detailProperty, activeTab, etc.)
  const [pendingClientView, setPendingClientView] = useState(null);       // { propertyId }
  const [pendingAdvertiserView, setPendingAdvertiserView] = useState(null); // { propertyId, visitId }

  // Charge les biens déjà en base au démarrage — fusionnés avec les biens
  // de démonstration codés en dur ci-dessus (seed initial de useState),
  // pour ne rien perdre pendant cette intégration progressive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await supabaseFetch(`properties?select=*,advertisers(name,phone,type)&order=published_at.desc`);
        if (cancelled || !rows) return;
        const dbProps = rows.map(dbRowToProperty);
        setPublishedProperties(prev => {
          const localOnly = prev.filter(p => !dbProps.some(d => d.id === p.id));
          return [...dbProps, ...localOnly];
        });
      } catch (err) {
        console.error("Chargement Supabase (properties) échoué — l'app continue avec les données locales :", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function publishProperty(prop) {
    setPublishedProperties(prev => {
      const exists = prev.find(p => p.id === prop.id);
      return exists ? prev.map(p => p.id === prop.id ? prop : p) : [prop, ...prev];
    });
    // Persistance Supabase en tâche de fond (voir syncPropertyToSupabase) —
    // ne bloque jamais l'interface locale (mise à jour ci-dessus déjà
    // faite), mais la promesse est renvoyée pour que l'appelant puisse
    // afficher un retour honnête à l'écran (voir handleAdd) — sans ça,
    // impossible de diagnostiquer un souci de synchronisation sur mobile,
    // où la console développeur n'est pas accessible.
    return syncPropertyToSupabase(prop);
  }
  function unpublishProperty(id) {
    setPublishedProperties(prev => prev.filter(p => p.id !== id));
    supabaseFetch(`properties?id=eq.${id}`, { method: "DELETE" })
      .catch(err => console.error("Suppression Supabase (properties) échouée :", err));
  }
  // Crée ou met à jour la campagne de ciblage (boost) d'une annonce publiée.
  function setPropertyCampaign(id, campaign) {
    setPublishedProperties(prev => prev.map(p => p.id === id ? { ...p, campaign } : p));
  }
  // Désactive la campagne d'une annonce (sans la supprimer, pour garder l'historique).
  function clearPropertyCampaign(id) {
    setPublishedProperties(prev => prev.map(p => p.id === id ? { ...p, campaign: p.campaign ? { ...p.campaign, active: false } : null } : p));
  }
  function addVisitRequest(req) { setVisitRequests(prev => [req, ...prev]); }
  function markVisitContacted(id) {
    setVisitRequests(prev => prev.map(v => v.id === id ? { ...v, advertiserContacted: true } : v));
  }
  // Compteurs de performance réels d'un bien, incrémentés uniquement au
  // moment où l'événement se produit côté client (ouverture de la fiche,
  // déverrouillage du contact) — jamais estimés ni simulés, pour que les
  // chiffres montrés à l'annonceur (notamment sur ses annonces gratuites,
  // comme argument concret pour passer en payant) reflètent une activité
  // réelle plutôt qu'une approximation plausible.
  function incrementPropertyViews(id) {
    setPublishedProperties(prev => prev.map(p => p.id === id ? { ...p, views: (p.views || 0) + 1 } : p));
  }
  function incrementPropertyContacts(id) {
    setPublishedProperties(prev => prev.map(p => p.id === id ? { ...p, contacts: (p.contacts || 0) + 1 } : p));
  }
  // Compteur distinct de "views" : ne s'incrémente QUE lorsqu'un client
  // débloque réellement le forfait carte/POI/trajet du bien (que ce
  // déblocage soit couvert par les crédits de bienvenue gratuits ou
  // simplement ajouté à l'ardoise pendingExplorationCP — voir
  // unlockPropertyServicesIfNeeded), jamais pour une simple ouverture de
  // fiche. Une seule exploration, payée ou non, suffit (avec ou sans
  // contact) à faire exiger le règlement de la commission Imoobilis avant
  // retrait/suppression (voir COMMISSION_MIN_EXPLORATIONS_THRESHOLD /
  // COMMISSION_MIN_CONTACTS_THRESHOLD / requestDelete).
  function incrementPropertyExplorations(id) {
    setPublishedProperties(prev => prev.map(p => p.id === id ? { ...p, explorations: (p.explorations || 0) + 1 } : p));
  }
  // Mise à jour d'une demande de visite existante (modification par le client, sans refacturation)
  function updateVisitRequest(propertyId, updates) {
    setVisitRequests(prev => prev.map(v =>
      v.propertyId === propertyId ? { ...v, ...updates } : v
    ));
  }
  function addAdvertiserMessage(msg) { setAdvertiserMessages(prev => [msg, ...prev]); }
  function markAdvertiserMessageRead(id) {
    setAdvertiserMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    // Les messages "promo" viennent de Supabase (voir le sondage plus haut)
    // et ont un vrai UUID ; les messages "advertiser_contact" sont créés
    // localement (id du style "am-...") et n'existent pas en base.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      supabaseFetch(`client_messages?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_read: true }),
      }).catch(err => console.error("Synchronisation Supabase (message lu) échouée :", err));
    }
  }
  function setVisitSchedule(advertiserPhone, schedule) {
    setVisitSchedules(prev => ({ ...prev, [advertiserPhone]: schedule }));
  }

  return (
    <SharedStoreContext.Provider value={{
      publishedProperties, publishProperty, unpublishProperty,
      setPropertyCampaign, clearPropertyCampaign,
      incrementPropertyViews, incrementPropertyContacts, incrementPropertyExplorations,
      visitRequests, addVisitRequest, markVisitContacted, updateVisitRequest,
      advertiserMessages, addAdvertiserMessage, markAdvertiserMessageRead,
      visitSchedules, setVisitSchedule,
      propertyReports, reportProperty,
      commissionPayments, addCommissionPayment,
      promoCodes, addPromoCode, togglePromoCode, deletePromoCode, incrementPromoCodeUses,
      redeemedPromoCodes, setRedeemedPromoCodes,
      clientNotif, setClientNotif, advertiserNotif, setAdvertiserNotif,
      pendingClientView, setPendingClientView, pendingAdvertiserView, setPendingAdvertiserView,
      clientCpBalance, setClientCpBalance, clientCpBonus, setClientCpBonus,
      clientCpTransactions, setClientCpTransactions,
      clientDbIdRef,
      pendingExplorationCP, setPendingExplorationCP,
      unlockedNearbyServices, setUnlockedNearbyServices,
      unlockedContacts, setUnlockedContacts,
      unlockedAerialViews, setUnlockedAerialViews,
      welcomeState, setWelcomeState, WELCOME_EXPIRY_DAYS,
      myInfo, setMyInfo, clientSuspended, setClientSuspended,
    }}>
      {children}
    </SharedStoreContext.Provider>
  );
}
function useSharedStore() { return React.useContext(SharedStoreContext); }

// ══════════════════════════════════════════════════════════════════
// APP ANNONCEUR
// ══════════════════════════════════════════════════════════════════
// ── Système annonceur — 100% Crédit-Points, sans abonnement ──────────
// Publier un bien est entièrement gratuit et sans restriction (voir
// handleAdd) : une commission Imoobilis (computeCommission) est due une
// seule fois, à la conclusion effective de la transaction (bien loué,
// vendu, ou retiré) — jamais à la publication. Le seul service facturé en
// CPS côté annonceur est le boost/ciblage optionnel d'une annonce
// (handleBoost, voir CampaignSheet). Le compte annonceur n'est jamais
// désactivé et les annonces restent en ligne indéfiniment — à charge pour
// l'annonceur de confirmer chaque semaine leur disponibilité (voir
// AVAILABILITY_CONFIRM_INTERVAL_DAYS), sous peine de suspension
// automatique, pour garder le catalogue crédible aux yeux des clients.
const PROP_CATEGORIES = ["Villa","Maison","Duplex","Appartement","Studio","Terrain","Bureau"];

// Commodités alignées sur les filtres de recherche client
const AMENITIES_LIST = [
  { key: "parking",    label: "Parking",          icon: "🚗" },
  { key: "pool",       label: "Piscine",           icon: "🏊" },
  { key: "garden",     label: "Jardin",            icon: "🌿" },
  { key: "generator",  label: "Groupe électrogène",icon: "⚡" },
  { key: "security",   label: "Gardien/Sécurité",  icon: "🔒" },
  { key: "ac",         label: "Climatisation",     icon: "❄️" },
  { key: "furnished",  label: "Meublé",            icon: "🛋️" },
  { key: "balcony",    label: "Balcon/Terrasse",   icon: "🏗️" },
  { key: "water",      label: "Eau courante",      icon: "💧" },
  { key: "internet",   label: "Internet/Fibre",    icon: "📶" },
];

// Commodités spécifiques à un TERRAIN : avantages de la zone/parcelle
// elle-même (viabilisation, accès, statut foncier...), sans rapport avec
// les équipements d'une maison (piscine, climatisation, meublé...) qui
// n'ont pas de sens pour un terrain nu. Voir AMENITIES_LIST ci-dessus pour
// les biens bâtis (location/vente de maison, appartement...).
const TERRAIN_AMENITIES_LIST = [
  { key: "titled",       label: "Titre foncier disponible", icon: "📜" },
  { key: "serviced",     label: "Terrain viabilisé",         icon: "🚧" },
  { key: "fenced",       label: "Terrain clôturé",           icon: "🧱" },
  { key: "paved_access",  label: "Accès bitumé",              icon: "🛣️" },
  { key: "flat",         label: "Terrain plat",              icon: "📐" },
  { key: "electricity",  label: "Électricité à proximité",   icon: "⚡" },
  { key: "water_nearby", label: "Eau à proximité",           icon: "💧" },
  { key: "main_road",    label: "Proche axe principal",      icon: "🛤️" },
  { key: "residential",  label: "Zone résidentielle calme",  icon: "🏘️" },
  { key: "open_view",    label: "Vue dégagée",               icon: "🌄" },
];

// Quartiers regroupés par commune (pour faciliter la recherche)
const ZONES_COMMUNES = {
  nord:   { label: "Abidjan Nord",   communes: ["Yopougon", "Songon"] },
  ouest:  { label: "Abidjan Ouest",  communes: ["Abobo", "Anyama"] },
  centre: { label: "Abidjan Centre", communes: ["Plateau", "Adjamé", "Attécoubé"] },
  est:    { label: "Abidjan Est",    communes: ["Cocody", "Bingerville"] },
  sud:    { label: "Abidjan Sud",    communes: ["Treichville", "Marcory", "Koumassi", "Port-Bouët"] },
};

const DISTRICTS_BY_COMMUNE = {
  "Yopougon":    ["Yopougon Centre","Yopougon Selmer","Yopougon Niangon","Yopougon Wassakara","Yopougon Gesco"],
  "Songon":      ["Songon Agban","Songon Kassemble"],
  "Abobo":       ["Abobo Centre","Abobo Baoulé","Abobo Avocatier","Abobo Sogefia","Abobo Dokui"],
  "Anyama":      ["Anyama Centre","Anyama Adjamé-Bingerville"],
  "Plateau":     ["Plateau Centre","Plateau Dokui","Zone 4C"],
  "Adjamé":      ["Adjamé 220 Logements","Adjamé Liberté","Adjamé Williamsville"],
  "Attécoubé":   ["Attécoubé Centre","Attécoubé Anono"],
  "Cocody":      ["Cocody Riviera","Cocody II","Cocody Angré","Cocody Danga","Cocody Bonoumin","Cocody 2 Plateaux"],
  "Bingerville": ["Bingerville Centre","Bingerville Résidentiel"],
  "Treichville": ["Treichville Centre","Treichville Zone 3"],
  "Marcory":     ["Marcory Résidentiel","Marcory Zone 4","Marcory Anoumabo"],
  "Koumassi":    ["Koumassi Centre","Koumassi Remblai","Koumassi Campement"],
  "Port-Bouët":  ["Port-Bouët Vridi","Port-Bouët Aéroport","Port-Bouët Gonzagueville"],
};

// Coordonnées GPS approximatives par commune pour la détection automatique
const COMMUNE_COORDS = {
  "Yopougon":    { lat: 5.3364, lng: -4.0833 },
  "Songon":      { lat: 5.3500, lng: -4.1700 },
  "Abobo":       { lat: 5.4167, lng: -4.0167 },
  "Anyama":      { lat: 5.4833, lng: -4.0333 },
  "Plateau":     { lat: 5.3167, lng: -4.0167 },
  "Adjamé":      { lat: 5.3500, lng: -4.0333 },
  "Attécoubé":   { lat: 5.3333, lng: -4.0500 },
  "Cocody":      { lat: 5.3500, lng: -3.9833 },
  "Bingerville": { lat: 5.3500, lng: -3.8833 },
  "Treichville": { lat: 5.2833, lng: -4.0000 },
  "Marcory":     { lat: 5.2833, lng: -3.9833 },
  "Koumassi":    { lat: 5.2833, lng: -3.9500 },
  "Port-Bouët":  { lat: 5.2500, lng: -3.9333 },
};

function detectZoneFromCommune(commune) {
  return Object.entries(ZONES_COMMUNES).find(([, z]) => z.communes.includes(commune))?.[0] || null;
}

function detectNearestCommune(lat, lng) {
  let closest = null, minDist = Infinity;
  Object.entries(COMMUNE_COORDS).forEach(([name, coords]) => {
    const d = Math.sqrt(Math.pow(lat - coords.lat, 2) + Math.pow(lng - coords.lng, 2));
    if (d < minDist) { minDist = d; closest = name; }
  });
  return closest;
}

function detectNearestDistrict(commune, lat, lng) {
  const list = DISTRICTS_BY_COMMUNE[commune];
  if (!list || list.length === 0) return "";
  // Dérive un index stable à partir des coordonnées GPS pour estimer
  // le quartier le plus proche au sein de la commune détectée.
  const idx = Math.floor(Math.abs(lat * 1000 + lng * 1000)) % list.length;
  return list[idx];
}


// ══════════════════════════════════════════════════════════════════
// SMART TEXTAREA — Correction + suggestion IA (Claude)
// ══════════════════════════════════════════════════════════════════
function SmartTextarea({ value, onChange, placeholder, rows = 4, className = "", context = "" }) {
  const [status, setStatus]         = useState("idle");   // idle | checking | corrected | suggesting
  const [suggestion, setSuggestion] = useState(null);     // texte suggéré par l'IA
  const [corrected, setCorrected]   = useState(null);     // texte corrigé par l'IA
  const [showDiff, setShowDiff]     = useState(false);
  const debounceRef = useRef(null);
  const prevValue   = useRef(value);

  // Déclenche la correction 1,2 s après la fin de frappe
  useEffect(() => {
    if (!value || value === prevValue.current) return;
    prevValue.current = value;
    setSuggestion(null);
    setCorrected(null);
    setShowDiff(false);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 15) { setStatus("idle"); return; }
    debounceRef.current = setTimeout(() => correctText(value), 1200);
    return () => clearTimeout(debounceRef.current);
  }, [value]);

  async function correctText(text) {
    setStatus("checking");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Tu es un assistant de rédaction immobilière spécialisé en Côte d'Ivoire (Abidjan).
Contexte du formulaire : ${context || "Description d'un bien immobilier"}.

Texte saisi par l'annonceur :
"""
${text}
"""

Tâche :
1. Corrige les fautes d'orthographe, de grammaire et de syntaxe.
2. Si le texte est trop court ou imprécis, propose une version améliorée et plus complète tout en respectant le sens original.
3. Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication, avec exactement ces deux clés :
{
  "corrected": "texte corrigé (identique si pas d'erreur)",
  "improved": "version améliorée et enrichie du texte"
}`
          }]
        })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const isSame = parsed.corrected.trim() === text.trim();
      setCorrected(isSame ? null : parsed.corrected);
      setSuggestion(parsed.improved !== parsed.corrected ? parsed.improved : null);
      setStatus(isSame ? "idle" : "corrected");
    } catch {
      setStatus("idle");
    }
  }

  function applyCorrected() {
    onChange(corrected);
    setCorrected(null);
    setStatus("idle");
    setShowDiff(false);
  }

  function applySuggestion() {
    onChange(suggestion);
    setSuggestion(null);
    setCorrected(null);
    setStatus("idle");
    setShowDiff(false);
  }

  const borderClass = !value.trim() ? "border-orange-300"
    : corrected ? "border-blue-400"
    : "border-gray-200";

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full border rounded-xl px-4 py-3 text-[13px] outline-none focus:border-orange-500 resize-none ${borderClass} ${className}`}
      />

      {/* Indicateur de traitement IA */}
      {status === "checking" && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] text-blue-600 font-semibold">IA…</span>
        </div>
      )}

      {/* Correction disponible */}
      {corrected && (
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-extrabold text-blue-700">✏️ Correction détectée</span>
            <button onClick={() => setShowDiff(v => !v)} className="ml-auto text-[10px] text-blue-500 underline">{showDiff ? "Masquer" : "Voir"}</button>
          </div>
          {showDiff && (
            <p className="text-[11px] text-blue-800 bg-blue-100 rounded-lg px-2 py-1.5 leading-snug whitespace-pre-wrap">{corrected}</p>
          )}
          <div className="flex gap-2">
            <button onClick={applyCorrected}
              className="flex-1 bg-blue-600 text-white text-[11px] font-bold py-2 rounded-lg">
              ✅ Appliquer la correction
            </button>
            <button onClick={() => { setCorrected(null); setStatus("idle"); }}
              className="px-3 bg-white border border-gray-200 text-gray-500 text-[11px] rounded-lg">
              Ignorer
            </button>
          </div>
        </div>
      )}

      {/* Suggestion améliorée */}
      {suggestion && (
        <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-extrabold text-orange-700">💡 Suggestion IA — version enrichie</p>
          <p className="text-[11px] text-orange-800 leading-snug whitespace-pre-wrap line-clamp-4">{suggestion}</p>
          <div className="flex gap-2">
            <button onClick={applySuggestion}
              className="flex-1 bg-orange-500 text-white text-[11px] font-bold py-2 rounded-lg">
              ✨ Utiliser cette version
            </button>
            <button onClick={() => setSuggestion(null)}
              className="px-3 bg-white border border-gray-200 text-gray-500 text-[11px] rounded-lg">
              Non merci
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyFormSheet({ initial, existingSchedule, onSubmit, onClose }) {
  const [step, setStep] = useState(1); // 6 étapes
  const [form, setForm] = useState({
    // Étape 1 — Identification
    transaction: initial?.transaction || "location",
    category:    initial?.category    || "Appartement",
    title:       initial?.title       || "",
    // Étape 2 — Localisation & Prix
    commune:     initial?.commune     || "",
    zone:        initial?.zone        || "",
    district:    initial?.district    || "",
    price:       initial?.price       ? String(initial.price) : "",
    // Étape 3 — Caractéristiques
    area:        initial?.area        ? String(initial.area)  : "",
    beds:        initial?.beds        ? String(initial.beds)  : "",
    baths:       initial?.baths       ? String(initial.baths) : "",
    amenities:   initial?.amenities   || [],
    description: initial?.description || "",
    images:      initial?.images      || [], // base64 strings
    videoUrl:    initial?.videoUrl    || "", // blob URL de la vidéo uploadée
    videoFile:   initial?.videoFile   || null,  // nom du fichier
    videoDuration: initial?.videoDuration || null, // durée en secondes
    videoError:  "",
    // Extrait topographique — uniquement pertinent pour la vente de
    // terrains (voir step3, section dédiée). topoPoints définit le
    // polygone des bornes du terrain (coordonnées GPS), à partir duquel
    // topoAreaM2 est calculée automatiquement (voir computePolygonAreaM2).
    topoReference: initial?.topoReference || "",
    topoFileName:  initial?.topoFileName  || null,
    topoFileData:  initial?.topoFileData  || null,
    topoPoints:    initial?.topoPoints    || [],
    // Vente de terrain : lequel des deux champs prix l'annonceur préfère
    // saisir directement ("m2" ou "total") — voir step3, l'autre champ
    // reste un calcul en lecture seule (jamais désynchronisé).
    priceMode: initial?.priceMode || "total",
    // Étape 5 — Programme de visite (disponibilités de l'annonceur)
    visitDays:   existingSchedule?.days  || [],
    visitSlots:  existingSchedule?.slots || [],
  });

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })); }
  // Liste de commodités pertinente selon la catégorie — un terrain nu n'a
  // pas les mêmes atouts qu'une maison (voir AMENITIES_LIST vs
  // TERRAIN_AMENITIES_LIST) ; utilisée aussi bien pour la grille de
  // sélection que pour les récapitulatifs des étapes suivantes.
  const amenitiesList = form.category === "Terrain" ? TERRAIN_AMENITIES_LIST : AMENITIES_LIST;
  function toggleAmenity(key) {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(key)
        ? f.amenities.filter(a => a !== key)
        : [...f.amenities, key],
    }));
  }
  function toggleVisitDay(d) { setForm(f => ({ ...f, visitDays: f.visitDays.includes(d) ? f.visitDays.filter(x => x !== d) : [...f.visitDays, d] })); }
  function toggleVisitSlot(s) { setForm(f => ({ ...f, visitSlots: f.visitSlots.includes(s) ? f.visitSlots.filter(x => x !== s) : [...f.visitSlots, s] })); }

  // ── Bornes de l'extrait topographique (terrains en vente uniquement) ──
  function addTopoPoint() { setForm(f => ({ ...f, topoPoints: [...f.topoPoints, { lat: "", lng: "" }] })); }
  function updateTopoPoint(i, key, value) {
    setForm(f => ({ ...f, topoPoints: f.topoPoints.map((p, j) => j === i ? { ...p, [key]: value } : p) }));
  }
  function removeTopoPoint(i) { setForm(f => ({ ...f, topoPoints: f.topoPoints.filter((_, j) => j !== i) })); }
  const validTopoPoints = form.topoPoints
    .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const topoAreaM2 = validTopoPoints.length >= 3 ? Math.round(computePolygonAreaM2(validTopoPoints)) : null;

  const isTerrainSale = form.category === "Terrain" && form.transaction === "vente";
  // Vente de terrain : surface + prix (au m² ou total) se saisissent
  // désormais dès l'étape 1, avec la transaction et la catégorie — plus
  // besoin d'attendre les étapes 2/3 pour ces informations essentielles.
  const step1OK = form.transaction && form.category && (!isTerrainSale || (form.area && form.price));
  const step2OK = form.zone && form.commune && form.district && (isTerrainSale || form.price);
  const step3OK = form.area && (form.category === "Terrain" || form.beds) && (!isTerrainSale || form.price) && form.description.trim();
  const step5OK = form.visitDays.length > 0 && form.visitSlots.length > 0;
  const canSubmit = step1OK && step2OK && step3OK && step5OK;

  // Publication 100% gratuite, sans restriction : toutes les photos, la
  // vidéo, tous les services client et une durée illimitée sont disponibles
  // quel que soit le bien. Aucun coût CPS n'est prélevé à la publication —
  // seule une commission Imoobilis (étape 6) sera due une fois le bien
  // loué, vendu, ou retiré.
  const maxImages = 10;

  // Commission Imoobilis due à la conclusion (location/vente/retrait) —
  // calculée à titre indicatif dès que le prix est connu, affichée en
  // détail à l'étape 6.
  const commissionRate = form.price ? computeCommissionRate(parseInt(form.price) || 0, form.transaction) : null;
  const commissionAmount = form.price ? computeCommission(parseInt(form.price) || 0, form.transaction) : null;

  // Titre automatique : "Catégorie Npièces" — ex: "Villa 3 Pièces", "Studio", "Terrain 500 m²"
  // Généré à la volée depuis catégorie + chambres (step 1+3). Pas saisie manuelle.
  function buildAutoTitle(cat, beds, area) {
    if (!cat) return "";
    if (cat === "Terrain") return area ? `Terrain ${area} m²` : "Terrain";
    if (cat === "Studio") return "Studio";
    if (cat === "Bureau") return beds ? `Bureau ${beds} Pièce${parseInt(beds) > 1 ? "s" : ""}` : "Bureau";
    if (beds) return `${cat} ${beds} Pièce${parseInt(beds) > 1 ? "s" : ""}`;
    return cat;
  }
  const autoTitle = buildAutoTitle(form.category, form.beds, form.area);

  const STEPS = ["Identification", "Localisation & Prix", "Caractéristiques", "Photos & Vidéo", "Programme de visite", "Commission Imoobilis"];

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div className="bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "85%" }} onClick={e => e.stopPropagation()}>

        {/* Header sticky */}
        <div className="flex-shrink-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-extrabold text-slate-800 text-[16px] truncate">{initial ? "Modifier l'annonce" : "Publier un bien"}</h3>
              <span className="flex-shrink-0 bg-green-100 text-green-700 text-[9px] font-bold px-2 py-1 rounded-full whitespace-nowrap">
                🎁 100% gratuit
              </span>
            </div>
            <button onClick={onClose} className="flex-shrink-0"><X size={18} className="text-gray-400" /></button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <button onClick={() => i < step - 1 && setStep(i + 1)}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${step === i + 1 ? "bg-orange-500 text-white" : i < step - 1 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {i < step - 1 ? <Check size={10}/> : <span>{i + 1}</span>}
                  <span className="hidden sm:inline">{s}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded ${i < step - 1 ? "bg-green-400" : "bg-gray-200"}`}/>}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4 pb-8">

          {/* ── ÉTAPE 1 : Identification ── */}
          {step === 1 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 <strong>Conseil :</strong> Un titre précis et une catégorie correcte améliorent votre visibilité dans les recherches clients.</p>
              </div>

              {/* Transaction */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Type de transaction *</label>
                <div className="flex gap-2">
                  {[["location","📋 Location"],["vente","🏷️ Vente"]].map(([v,l]) => (
                    <button key={v} onClick={() => upd("transaction", v)}
                      className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold border ${form.transaction === v ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Catégorie */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Catégorie du bien *</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROP_CATEGORIES.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, category: c, amenities: [], ...(c === "Terrain" ? { beds: "", baths: "" } : {}) }))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${form.category === c ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>{c}</button>
                  ))}
                </div>
              </div>

              {/* Surface + Prix (au m² ou total, au choix) — vente de
                  terrain uniquement : ces informations sont essentielles
                  dès le départ pour ce type de bien, donc regroupées ici
                  plutôt qu'éclatées entre les étapes 2 et 3. */}
              {isTerrainSale && (
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Surface (m²) *</label>
                    <input type="number" value={form.area} onChange={e => upd("area", e.target.value)} placeholder="500"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-orange-500" />
                  </div>

                  {form.area && (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Je préfère saisir…</label>
                        <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
                          {[["m2","Prix au m²"],["total","Prix total"]].map(([mode,label]) => (
                            <button key={mode} onClick={() => upd("priceMode", mode)}
                              className={`flex-1 text-[11.5px] font-bold py-2 rounded-lg ${(form.priceMode || "total") === mode ? "bg-white text-orange-600 shadow-sm" : "text-gray-500"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(form.priceMode || "total") === "m2" ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Prix au m² (FCFA) *</label>
                            <input type="number"
                              value={form.price ? Math.round(parseInt(form.price) / parseInt(form.area)) : ""}
                              onChange={e => upd("price", String(Math.round((parseFloat(e.target.value) || 0) * parseInt(form.area))))}
                              placeholder="130000"
                              className="w-full border border-orange-300 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-orange-500"/>
                          </div>
                          <div className="flex-1 text-right">
                            <p className="text-[11px] font-semibold text-gray-500 mb-1">Prix total (calculé)</p>
                            <p className="text-[15px] font-extrabold text-green-700">{form.price ? `${parseInt(form.price).toLocaleString("fr-FR")} F` : "—"}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Prix total (FCFA) *</label>
                            <input type="number" value={form.price} onChange={e => upd("price", e.target.value)} placeholder="65000000"
                              className="w-full border border-orange-300 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-orange-500"/>
                          </div>
                          <div className="flex-1 text-right">
                            <p className="text-[11px] font-semibold text-gray-500 mb-1">Prix au m² (calculé)</p>
                            <p className="text-[15px] font-extrabold text-green-700">{form.price ? `${Math.round(parseInt(form.price) / parseInt(form.area)).toLocaleString("fr-FR")} F` : "—"}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Titre automatique — aperçu */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Titre de l'annonce <span className="font-normal text-gray-400">(généré automatiquement)</span></label>
                <div className={`w-full border rounded-xl px-4 py-3 text-[13px] ${autoTitle ? "border-green-400 bg-green-50 text-green-800 font-semibold" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                  {autoTitle || "Sera généré depuis la catégorie et le nombre de pièces"}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Le nombre de pièces est saisi à l'étape 3 (Caractéristiques)</p>
              </div>

              <button onClick={() => setStep(2)} disabled={!step1OK}
                className={`w-full py-3 rounded-xl font-bold text-[13px] ${step1OK ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                Suivant — Localisation & Prix →
              </button>
            </>
          )}

          {/* ── ÉTAPE 2 : Localisation & Prix ── */}
          {step === 2 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 Localisez votre bien — les clients filtrent par zone et commune.</p>
              </div>

              {/* Géolocalisation GPS */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">Localisation GPS</label>
                <button
                  onClick={() => {
                    upd("locating", true);
                    navigator.geolocation?.getCurrentPosition(
                      pos => {
                        const { latitude: lat, longitude: lng } = pos.coords;
                        upd("lat", parseFloat(lat.toFixed(6)));
                        upd("lng", parseFloat(lng.toFixed(6)));
                        upd("locating", false);
                        const nearestCommune = detectNearestCommune(lat, lng);
                        if (nearestCommune) {
                          upd("commune", nearestCommune);
                          upd("zone", detectZoneFromCommune(nearestCommune));
                          upd("district", detectNearestDistrict(nearestCommune, lat, lng));
                        }
                      },
                      () => upd("locating", false),
                      { enableHighAccuracy: true, timeout: 8000 }
                    );
                  }}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-orange-300 bg-orange-50 text-orange-600 rounded-xl py-2.5 font-semibold text-[13px] mb-2"
                >
                  {form.locating ? (
                    <><Clock size={15} className="animate-spin"/>Localisation…</>
                  ) : form.lat ? (
                    <><CheckCircle2 size={15} className="text-green-600"/><span className="text-green-700 text-[12px]">{form.commune ? `${form.commune}${form.district ? " — " + form.district : ""}` : `GPS : ${form.lat}, ${form.lng}`}</span></>
                  ) : (
                    <><LocateFixed size={15}/>Me localiser automatiquement</>
                  )}
                </button>
              </div>

              {/* Sélection de zone */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">
                  Zone *
                  {form.zone && <span className="ml-1 text-green-600 font-normal">— {ZONES_COMMUNES[form.zone]?.label}</span>}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(ZONES_COMMUNES).map(([key, z]) => (
                    <button key={key}
                      onClick={() => { upd("zone", key); upd("commune", ""); upd("district", ""); }}
                      className={`py-2.5 px-3 rounded-xl text-left border ${form.zone === key ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>
                      <p className={`text-[11px] font-bold ${form.zone === key ? "text-white" : "text-slate-700"}`}>{z.label}</p>
                      <p className={`text-[9px] mt-0.5 ${form.zone === key ? "text-orange-100" : "text-gray-400"}`}>{z.communes.join(", ")}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Communes de la zone sélectionnée */}
              {form.zone && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">
                    Commune *
                    {form.commune && <span className="ml-1 text-green-600 font-normal">— {form.commune}</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ZONES_COMMUNES[form.zone].communes.map(c => (
                      <button key={c} onClick={() => { upd("commune", c); upd("district", ""); }}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${form.commune === c ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quartier */}
              {form.commune && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                    Quartier précis *
                    {form.district && form.lat && <span className="ml-1 text-green-600 font-normal">— détecté automatiquement, modifiable</span>}
                  </label>
                  <select value={form.district} onChange={e => upd("district", e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-[13px] outline-none focus:border-orange-500 bg-white ${!form.district ? "border-orange-300" : "border-gray-200"}`}>
                    <option value="">— Sélectionner un quartier (obligatoire) —</option>
                    {(DISTRICTS_BY_COMMUNE[form.commune] || []).map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Prix — masqué pour une vente de terrain : surface + prix
                  sont désormais saisis dès l'étape 1 (Identification). */}
              {!isTerrainSale && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                    Prix {form.transaction === "location" ? "(FCFA / mois)" : "(FCFA total)"} *
                  </label>
                  <input type="number" value={form.price} onChange={e => upd("price", e.target.value)} placeholder="350000"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[13px] outline-none focus:border-orange-500"/>
                  {form.price && (
                    <p className="text-[11px] text-green-700 font-semibold mt-1">
                      {parseInt(form.price).toLocaleString("fr-FR")} FCFA{form.transaction === "location" ? "/mois" : ""}
                    </p>
                  )}
                </div>
              )}

              {isTerrainSale && (
                <div className="rounded-xl p-3 border bg-blue-50 border-blue-100 flex items-center gap-2">
                  <span className="text-[16px]">📐</span>
                  <p className="text-[11px] text-blue-700 leading-snug">
                    Surface {form.area ? `${form.area} m²` : "—"} · Prix {form.price ? `${parseInt(form.price).toLocaleString("fr-FR")} F` : "—"} déjà renseignés à l'étape 1.
                  </p>
                </div>
              )}

              {/* Publication gratuite — aucun coût à la publication. La
                  commission Imoobilis (due seulement une fois le bien conclu)
                  sera détaillée à l'étape 6. */}
              {form.price && (
                <div className="rounded-xl p-3 border bg-green-50 border-green-200 flex items-center gap-2">
                  <span className="text-[16px]">🎁</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-green-700">Publication 100% gratuite</p>
                    <p className="text-[9px] text-green-600">Aucun coût à la publication — toutes les photos, la vidéo et tous les services client sont inclus, sans restriction ni durée limitée.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl font-semibold text-[13px] border border-gray-200 text-slate-600">← Retour</button>
                <button onClick={() => setStep(3)} disabled={!step2OK}
                  className={`flex-1 py-3 rounded-xl font-bold text-[13px] ${step2OK ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  Suivant →
                </button>
              </div>
            </>
          )}

          {/* ── ÉTAPE 3 : Caractéristiques ── */}
          {step === 3 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 <strong>Conseil :</strong> Plus vous renseignez de caractéristiques, plus votre bien ressort dans les filtres avancés des clients.</p>
              </div>

              {/* Surface (+ Chambres/SDB, non pertinents pour un terrain) —
                  pour une vente de terrain, ces champs sont déjà saisis à
                  l'étape 1 (Identification) : simple récapitulatif ici. */}
              {isTerrainSale ? (
                <div className="rounded-xl p-3 border bg-blue-50 border-blue-100 flex items-center gap-2">
                  <span className="text-[16px]">📐</span>
                  <p className="text-[11px] text-blue-700 leading-snug">
                    Surface {form.area ? `${form.area} m²` : "—"} · Prix {form.price ? `${parseInt(form.price).toLocaleString("fr-FR")} F` : "—"} déjà renseignés à l'étape 1.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[["area","Surface (m²) *","80"],["beds","Chambres *","3"],["baths","Salles de bain","2"]].map(([k,l,ph]) => (
                    <div key={k}>
                      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{l}</label>
                      <input type="number" value={form[k]} onChange={e => upd(k, e.target.value)} placeholder={ph}
                        className={`w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-orange-500 ${k === "beds" && !form.beds ? "border-orange-300" : "border-gray-200"}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Extrait topographique — uniquement pour la vente de terrains :
                  permet à l'annonceur de fournir les bornes GPS réelles de la
                  parcelle (issues de l'extrait topo), à partir desquelles on
                  calcule automatiquement la superficie exacte (voir
                  computePolygonAreaM2) et on affichera les limites du terrain
                  sur la carte côté client (voir TerrainBoundaryMap). */}
              {isTerrainSale && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3">
                  <div>
                    <p className="text-[12px] font-bold text-emerald-800 flex items-center gap-1.5">📐 Extrait topographique</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">Renseignez les bornes GPS du terrain pour que ses limites exactes soient visibles par les clients sur la carte, avec la superficie calculée automatiquement.</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Référence de l'extrait topo (optionnel)</label>
                    <input value={form.topoReference} onChange={e => upd("topoReference", e.target.value)} placeholder="Ex. TF 12345 IVC"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500 bg-white"/>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Document de l'extrait topo (image ou PDF)</label>
                    {form.topoFileName ? (
                      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                        <span className="text-[12px] text-slate-700 truncate flex items-center gap-1.5"><FileText size={14} className="text-emerald-600 flex-shrink-0"/>{form.topoFileName}</span>
                        <button onClick={() => { upd("topoFileName", null); upd("topoFileData", null); }} className="text-rose-500 flex-shrink-0"><Trash2 size={14}/></button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-emerald-300 bg-white rounded-xl px-3 py-3 cursor-pointer">
                        <Upload size={15} className="text-emerald-500"/>
                        <span className="text-[12px] text-emerald-600 font-semibold">Importer le document</span>
                        <input type="file" accept="image/*,.pdf" className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            upd("topoFileName", file.name);
                            if (file.type.startsWith("image/")) {
                              const reader = new FileReader();
                              reader.onload = ev => upd("topoFileData", ev.target.result);
                              reader.readAsDataURL(file);
                            } else {
                              upd("topoFileData", null); // PDF : nom conservé, pas d'aperçu image
                            }
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-gray-500">Bornes du terrain (coordonnées GPS)</label>
                      <span className="text-[10px] text-gray-400">{validTopoPoints.length} / {form.topoPoints.length} valide{form.topoPoints.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-1.5">
                      {form.topoPoints.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 w-10 flex-shrink-0">B{i + 1}</span>
                          <input value={p.lat} onChange={e => updateTopoPoint(i, "lat", e.target.value)} inputMode="decimal" placeholder="Latitude"
                            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] outline-none focus:border-emerald-500 bg-white"/>
                          <input value={p.lng} onChange={e => updateTopoPoint(i, "lng", e.target.value)} inputMode="decimal" placeholder="Longitude"
                            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-[12px] outline-none focus:border-emerald-500 bg-white"/>
                          <button onClick={() => removeTopoPoint(i)} className="text-rose-500 flex-shrink-0"><X size={15}/></button>
                        </div>
                      ))}
                    </div>
                    <button onClick={addTopoPoint} className="w-full flex items-center justify-center gap-1.5 border border-dashed border-emerald-300 text-emerald-600 text-[11px] font-semibold py-2 rounded-lg mt-1.5">
                      <PlusCircle size={13}/>Ajouter une borne
                    </button>
                    <p className="text-[9.5px] text-gray-400 mt-1">Au moins 3 bornes sont nécessaires pour délimiter le terrain.</p>
                  </div>

                  {topoAreaM2 != null && (
                    <div className="bg-white border border-emerald-300 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-emerald-700 font-semibold">Superficie exacte calculée (topo)</p>
                        <p className="text-[18px] font-extrabold text-emerald-800">{topoAreaM2.toLocaleString("fr-FR")} m²</p>
                      </div>
                      <button onClick={() => upd("area", String(topoAreaM2))} className="bg-emerald-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg whitespace-nowrap">
                        Utiliser cette valeur
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Commodités */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">
                  {form.category === "Terrain" ? "Avantages de la zone" : "Commodités"} <span className="text-gray-400 font-normal">(les clients filtrent par ces critères)</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {amenitiesList.map(a => {
                    const active = form.amenities.includes(a.key);
                    return (
                      <button key={a.key} onClick={() => toggleAmenity(a.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold border text-left ${active ? "bg-orange-50 border-orange-400 text-orange-700" : "border-gray-200 text-slate-600"}`}>
                        <span>{a.icon}</span>{a.label}
                        {active && <Check size={11} className="ml-auto text-orange-500"/>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                  Description *
                  <span className="ml-1 text-blue-500 font-normal text-[10px]">🤖 Correction & suggestion IA automatique</span>
                </label>
                <SmartTextarea
                  value={form.description}
                  onChange={v => upd("description", v)}
                  rows={4}
                  placeholder="Décrivez votre bien en détail : état, étage, orientation, proximité des écoles, transports, marchés..."
                  context={`Bien immobilier de type ${form.category || "résidentiel"}, ${form.transaction === "location" ? "en location" : "en vente"}, situé à ${form.commune || "Abidjan"}${form.district ? " — " + form.district : ""}`}
                />
                <p className="text-[10px] text-gray-400 mt-1">Une description complète augmente la confiance et les contacts reçus.</p>
              </div>

              {/* Récapitulatif */}
              {canSubmit && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1">
                  <p className="text-[11px] font-bold text-green-700 mb-1.5">✅ Récapitulatif de votre annonce</p>
                  <p className="text-[11px] text-green-700">📋 {form.transaction === "location" ? "Location" : "Vente"} · {form.category}</p>
                  <p className="text-[11px] text-green-700">📍 {form.commune}{form.district ? ` — ${form.district}` : ""}</p>
                  <p className="text-[11px] text-green-700">💰 {parseInt(form.price).toLocaleString("fr-FR")} FCFA{form.transaction === "location" ? "/mois" : ""}</p>
                  {form.area && <p className="text-[11px] text-green-700">📐 {form.area} m²{form.beds ? ` · ${form.beds} chambre${form.beds > 1 ? "s" : ""}` : ""}{form.baths ? ` · ${form.baths} SDB` : ""}</p>}
                  {form.amenities.length > 0 && <p className="text-[11px] text-green-700">✨ {form.amenities.map(k => amenitiesList.find(a => a.key === k)?.label).join(", ")}</p>}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl font-semibold text-[13px] border border-gray-200 text-slate-600">← Retour</button>
                <button onClick={() => setStep(4)} disabled={!step3OK}
                  className={`flex-1 py-3 rounded-xl font-bold text-[13px] ${step3OK ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  Suivant →
                </button>
              </div>
            </>
          )}

          {/* ── ÉTAPE 4 : Photos & Vidéo ── */}
          {step === 4 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 Les annonces avec photos reçoivent <strong>3× plus de contacts</strong>. Ajoutez jusqu'à {maxImages} photo{maxImages > 1 ? "s" : ""}{maxImages === 10 ? " et 1 lien vidéo" : ""}.</p>
              </div>

              {/* Upload photos */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1.5 block">
                  Photos <span className="text-gray-400 font-normal">({form.images.length}/{maxImages})</span>
                </label>

                {/* Grille photos */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                      <img src={img} alt="" className="w-full h-full object-cover"/>
                      <button
                        onClick={() => upd("images", form.images.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                        <X size={10} className="text-white"/>
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">Photo principale</span>
                      )}
                    </div>
                  ))}

                  {/* Bouton ajouter photo */}
                  {form.images.length < maxImages && (
                    <label className="aspect-square rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 flex flex-col items-center justify-center cursor-pointer gap-1">
                      <Camera size={20} className="text-orange-400"/>
                      <span className="text-[9px] text-orange-400 font-semibold">Ajouter</span>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          const remaining = maxImages - form.images.length;
                          files.slice(0, remaining).forEach(file => {
                            const reader = new FileReader();
                            reader.onload = ev => {
                              setForm(f => ({ ...f, images: [...f.images, ev.target.result] }));
                            };
                            reader.readAsDataURL(file);
                          });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>

                {form.images.length === 0 && (
                  <p className="text-[10px] text-gray-400 text-center">Appuyez sur le bouton + pour ajouter vos photos</p>
                )}
                {form.images.length > 0 && (
                  <p className="text-[10px] text-gray-400">La première photo sera la photo principale de l'annonce</p>
                )}
              </div>

              {/* Vidéo réelle — upload direct, 30 secondes maximum. */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                  Vidéo de visite <span className="text-gray-400 font-normal">(30 sec. max · MP4, MOV, WebM)</span>
                </label>

                {form.videoUrl ? (
                  /* Prévisualisation de la vidéo uploadée */
                  <div className="rounded-2xl overflow-hidden border border-green-200 bg-black relative">
                    <video
                      src={form.videoUrl}
                      controls
                      className="w-full max-h-48 object-contain"
                      style={{ display: "block" }}
                    />
                    <button
                      onClick={() => { upd("videoUrl", ""); upd("videoFile", null); upd("videoDuration", null); }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
                    >
                      <X size={14} />
                    </button>
                    {form.videoDuration && (
                      <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {Math.round(form.videoDuration)}s
                      </span>
                    )}
                  </div>
                ) : (
                  <label className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-200 bg-orange-50 rounded-2xl py-5 cursor-pointer active:bg-orange-100">
                    <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                      <Upload size={18} className="text-white" />
                    </div>
                    <p className="text-[12px] font-semibold text-orange-600">Importer une vidéo</p>
                    <p className="text-[10px] text-gray-400">30 secondes maximum · MP4, MOV, WebM</p>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Vérifier la durée via un élément <video> temporaire
                        const objectUrl = URL.createObjectURL(file);
                        const tmpVideo = document.createElement("video");
                        tmpVideo.preload = "metadata";
                        tmpVideo.src = objectUrl;
                        tmpVideo.onloadedmetadata = () => {
                          const dur = tmpVideo.duration;
                          URL.revokeObjectURL(objectUrl);
                          if (dur > 30) {
                            // Durée dépassée : refus propre
                            upd("videoUrl", "");
                            upd("videoFile", null);
                            upd("videoDuration", null);
                            // On affiche l'erreur via un toast simulé sur le form
                            upd("videoError", `Vidéo trop longue (${Math.round(dur)}s). Maximum : 30 secondes.`);
                            setTimeout(() => upd("videoError", ""), 3500);
                          } else {
                            const blobUrl = URL.createObjectURL(file);
                            upd("videoUrl", blobUrl);
                            upd("videoFile", file.name);
                            upd("videoDuration", dur);
                            upd("videoError", "");
                          }
                        };
                        tmpVideo.onerror = () => {
                          URL.revokeObjectURL(objectUrl);
                          upd("videoError", "Fichier vidéo non reconnu. Essayez un fichier MP4 ou MOV.");
                          setTimeout(() => upd("videoError", ""), 3000);
                        };
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}

                {form.videoError && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {form.videoError}
                  </p>
                )}
                {form.videoUrl && !form.videoError && (
                  <p className="text-[10px] text-green-600 font-semibold mt-1">✓ Vidéo prête · {Math.round(form.videoDuration || 0)}s</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">Une courte vidéo réelle multiplie vos chances de contact</p>
              </div>

              {/* Récapitulatif */}
              {canSubmit && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1">
                  <p className="text-[11px] font-bold text-green-700 mb-1">✅ Récapitulatif</p>
                  <p className="text-[11px] text-green-700">📋 {form.transaction === "location" ? "Location" : "Vente"} · {form.category}</p>
                  <p className="text-[11px] text-green-700">📍 {form.zone ? ZONES_COMMUNES[form.zone]?.label : ""} · {form.commune}{form.district ? ` — ${form.district}` : ""}</p>
                  <p className="text-[11px] text-green-700">💰 {parseInt(form.price).toLocaleString("fr-FR")} FCFA{form.transaction === "location" ? "/mois" : ""}</p>
                  {form.area && <p className="text-[11px] text-green-700">📐 {form.area} m²{form.beds ? ` · ${form.beds} ch.` : ""}{form.baths ? ` · ${form.baths} SDB` : ""}</p>}
                  {form.images.length > 0 && <p className="text-[11px] text-green-700">📷 {form.images.length} photo{form.images.length > 1 ? "s" : ""}{form.videoUrl ? " + vidéo" : ""}</p>}
                  {form.amenities.length > 0 && <p className="text-[11px] text-green-700">✨ {form.amenities.map(k => amenitiesList.find(a => a.key === k)?.label).join(", ")}</p>}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl font-semibold text-[13px] border border-gray-200 text-slate-600">← Retour</button>
                <button onClick={() => setStep(5)}
                  className="flex-1 py-3 rounded-xl font-bold text-[13px] bg-orange-500 text-white">
                  Suivant — Programme de visite →
                </button>
              </div>
            </>
          )}

          {/* ── ÉTAPE 5 : Programme de visite ── */}
          {step === 5 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 Indiquez vos disponibilités : les clients programment leur visite directement sur ces créneaux.</p>
              </div>

              {/* Jours disponibles */}
              <div>
                <p className="text-[12px] font-extrabold text-slate-700 mb-2">📅 Jours disponibles</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map(d => (
                    <button key={d} onClick={() => toggleVisitDay(d)}
                      className={`px-4 py-2 rounded-xl text-[12px] font-bold border ${form.visitDays.includes(d) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {d}
                    </button>
                  ))}
                </div>
                {form.visitDays.length === 0 && <p className="text-[10px] text-orange-500 mt-1">Sélectionnez au moins un jour</p>}
              </div>

              {/* Créneaux horaires */}
              <div>
                <p className="text-[12px] font-extrabold text-slate-700 mb-2">🕐 Créneaux horaires disponibles</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {ALL_TIME_SLOTS.map(s => (
                    <button key={s} onClick={() => toggleVisitSlot(s)}
                      className={`py-2 rounded-xl text-[11px] font-semibold border ${form.visitSlots.includes(s) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {s}
                    </button>
                  ))}
                </div>
                {form.visitSlots.length === 0 && <p className="text-[10px] text-orange-500 mt-1">Sélectionnez au moins un créneau</p>}
              </div>

              {/* Résumé global de l'annonce + du programme */}
              {canSubmit && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1">
                  <p className="text-[11px] font-bold text-green-700 mb-1">✅ Récapitulatif</p>
                  <p className="text-[11px] text-green-700">📋 {form.transaction === "location" ? "Location" : "Vente"} · {form.category}</p>
                  <p className="text-[11px] text-green-700">📍 {form.zone ? ZONES_COMMUNES[form.zone]?.label : ""} · {form.commune}{form.district ? ` — ${form.district}` : ""}</p>
                  <p className="text-[11px] text-green-700">💰 {parseInt(form.price).toLocaleString("fr-FR")} FCFA{form.transaction === "location" ? "/mois" : ""}</p>
                  {form.area && <p className="text-[11px] text-green-700">📐 {form.area} m²{form.beds ? ` · ${form.beds} ch.` : ""}{form.baths ? ` · ${form.baths} SDB` : ""}</p>}
                  {form.images.length > 0 && <p className="text-[11px] text-green-700">📷 {form.images.length} photo{form.images.length > 1 ? "s" : ""}{form.videoUrl ? " + vidéo" : ""}</p>}
                  {form.amenities.length > 0 && <p className="text-[11px] text-green-700">✨ {form.amenities.map(k => amenitiesList.find(a => a.key === k)?.label).join(", ")}</p>}
                  <p className="text-[11px] text-green-700">📅 {form.visitDays.join(", ")} · 🕐 {form.visitSlots.length} créneau{form.visitSlots.length > 1 ? "x" : ""}</p>
                  <p className="text-[10px] text-green-600 mt-1">Ce programme s'applique à toutes vos annonces : les clients verront ces créneaux pour programmer leurs visites.</p>
                  <p className="text-[11px] font-bold pt-1.5 mt-1.5 border-t border-green-100 text-green-700">🎁 Publication gratuite — 0 FCFA, sans restriction</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(4)} className="flex-1 py-3 rounded-xl font-semibold text-[13px] border border-gray-200 text-slate-600">← Retour</button>
                <button onClick={() => canSubmit && setStep(6)} disabled={!canSubmit}
                  className={`flex-1 py-3 rounded-xl font-bold text-[13px] ${canSubmit ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  Suivant — Commission Imoobilis →
                </button>
              </div>
            </>
          )}

          {/* ── ÉTAPE 6 : Commission Imoobilis ── */}
          {step === 6 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 leading-snug">💡 La publication est entièrement gratuite. Une commission Imoobilis n'est due qu'une fois ce bien loué, vendu, ou retiré de la plateforme.</p>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-[12px] font-extrabold text-orange-800 mb-1">
                  {form.transaction === "location" ? "🏠 Commission à la location" : "🏷️ Commission à la vente"}
                </p>
                <p className="text-[10.5px] text-orange-700 leading-snug mb-3">
                  {form.transaction === "location"
                    ? "10% du loyer mensuel TTC, prélevés une seule fois lorsque le bien est effectivement loué."
                    : "Barème dégressif selon le prix de vente, prélevé une seule fois lorsque le bien est effectivement vendu."}
                </p>

                {form.price ? (
                  <div className="bg-white rounded-xl p-3 border border-orange-100">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span>{form.transaction === "location" ? "Montant du loyer" : "Prix de vente"}</span>
                      <span className="font-semibold text-slate-700">{parseInt(form.price).toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                      <span>Taux commission</span>
                      <span className="font-semibold text-slate-700">{(commissionRate * 100).toLocaleString("fr-FR")}%</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-orange-100">
                      <span className="text-[12px] font-bold text-orange-800">Commission estimée</span>
                      <span className="text-[16px] font-extrabold text-orange-800">
                        {commissionAmount.toLocaleString("fr-FR")} FCFA{form.transaction === "location" ? " TTC" : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10.5px] text-orange-500 italic">Renseignez le prix à l'étape 2 pour estimer la commission.</p>
                )}
              </div>

              {form.transaction === "vente" && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[10.5px] font-bold text-slate-600 mb-1.5">Barème commission vente</p>
                  <ul className="text-[10px] text-gray-500 space-y-1">
                    <li>• Moins de 100 000 000 FCFA — <span className="font-semibold text-slate-600">1%</span></li>
                    <li>• De 100 000 000 à 1 000 000 000 FCFA — <span className="font-semibold text-slate-600">0,75%</span></li>
                    <li>• Au-delà de 1 000 000 000 FCFA — <span className="font-semibold text-slate-600">0,5%</span></li>
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-green-100 bg-green-50 p-3">
                <p className="text-[10.5px] text-green-700 leading-snug">✅ Rien à payer aujourd'hui — la commission n'est due qu'à la conclusion effective de la transaction (bien loué, vendu, ou retiré). Elle sera rappelée dans votre tableau de bord "Mes annonces".</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(5)} className="flex-1 py-3 rounded-xl font-semibold text-[13px] border border-gray-200 text-slate-600">← Retour</button>
                <button
                  onClick={() => canSubmit && onSubmit({
                    ...form,
                    id: initial?.id,
                    title: buildAutoTitle(form.category, form.beds, form.area) || form.category,
                    price: parseInt(form.price),
                    beds:  form.beds  ? parseInt(form.beds)  : null,
                    baths: form.baths ? parseInt(form.baths) : null,
                    area:  parseInt(form.area),
                    lat:   form.lat   || null,
                    lng:   form.lng   || null,
                    district: form.district || form.commune,
                    // Publication toujours gratuite et sans restriction —
                    // seule une commission Imoobilis (calculée ci-dessus)
                    // reste due à la conclusion de la transaction.
                    commissionRate,
                    commissionAmount,
                  })}
                  disabled={!canSubmit}
                  className={`flex-1 py-3 rounded-xl font-bold text-[13px] ${canSubmit ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {initial ? "💾 Enregistrer" : "🚀 Publier gratuitement"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CAMPAGNE DE CIBLAGE (Boost) — façon Facebook Ads, côté annonceur
// Ciblage géographique (communes) + tranche d'âge + niveau de boost,
// avec estimation de portée en temps réel. Facturé en CPS, distinct du
// coût de publication, sur une durée propre (3 / 7 / 14 jours).
// ══════════════════════════════════════════════════════════════════
function CampaignSheet({ property, availableCP, onSubmit, onClear, onClose }) {
  const existing = property.campaign;
  const wasActive = isCampaignActive(existing);
  const [communes, setCommunes] = useState(existing?.communes || (property.commune ? [property.commune] : []));
  const [ageBrackets, setAgeBrackets] = useState(existing?.ageBrackets || []);
  const [professions, setProfessions] = useState(existing?.professions || []);
  const [interests, setInterests] = useState(existing?.interests || []);
  const [tierId, setTierId] = useState(existing?.tierId || "standard");
  const [durationDays, setDurationDays] = useState(existing?.durationDays || 7);

  const tier = CAMPAIGN_TIERS.find(t => t.id === tierId);
  const cpCost = computeCampaignCost(tier, communes.length, durationDays);
  const hasEnoughCP = availableCP >= cpCost;
  const reach = estimateCampaignReach(communes, ageBrackets, professions, interests, tier);
  const narrowAudience = reach.max < 40;

  function toggleCommune(c) { setCommunes(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]); }
  function toggleAge(a) { setAgeBrackets(as => as.includes(a) ? as.filter(x => x !== a) : [...as, a]); }
  function toggleProfession(p) { setProfessions(ps => ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p]); }
  function toggleInterest(k) { setInterests(is => is.includes(k) ? is.filter(x => x !== k) : [...is, k]); }

  function submit() {
    if (!hasEnoughCP) return;
    const now = Date.now();
    onSubmit({
      active: true,
      communes, ageBrackets, professions, interests, tierId: tier.id, scoreWeight: tier.scoreWeight,
      durationDays,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      cpCost, reach,
    });
  }

  return (
    <div className="absolute inset-0 z-[210] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div className="bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "85%" }} onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-extrabold text-slate-800 text-[16px] flex items-center gap-1.5"><Rocket size={16} className="text-orange-500"/>Booster l'annonce</h3>
            <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
          </div>
          <p className="text-[11px] text-gray-400 truncate">{property.title} · {property.district}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {wasActive && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-[11px] text-green-700 flex items-center gap-2">
              <Sparkles size={13} className="flex-shrink-0"/>Campagne active jusqu'au {new Date(existing.expiresAt).toLocaleDateString("fr-FR")} — modifiez les réglages ci-dessous pour la relancer.
            </div>
          )}

          {/* Ciblage géographique */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1"><MapPinned size={13}/>Ciblage géographique</p>
            <p className="text-[10px] text-gray-400 mb-2">Aucune sélection = toutes les communes</p>
            {Object.values(ZONES_COMMUNES).map(zone => (
              <div key={zone.label} className="mb-2">
                <p className="text-[10px] font-bold text-gray-400 mb-1">{zone.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {zone.communes.map(c => (
                    <button key={c} onClick={() => toggleCommune(c)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${communes.includes(c) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tranche d'âge */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1"><Users size={13}/>Tranche d'âge ciblée</p>
            <p className="text-[10px] text-gray-400 mb-2">Aucune sélection = tous les âges</p>
            <div className="flex flex-wrap gap-1.5">
              {AGE_BRACKETS.map(a => (
                <button key={a} onClick={() => toggleAge(a)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${ageBrackets.includes(a) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {a} ans
                </button>
              ))}
            </div>
          </div>

          {/* Profession */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1"><Briefcase size={13}/>Profession ciblée</p>
            <p className="text-[10px] text-gray-400 mb-2">Aucune sélection = toutes les professions</p>
            <div className="flex flex-wrap gap-1.5">
              {PROFESSIONS.map(p => (
                <button key={p} onClick={() => toggleProfession(p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${professions.includes(p) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Centres d'intérêt */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1"><Sparkles size={13}/>Centres d'intérêt</p>
            <p className="text-[10px] text-gray-400 mb-2">Aucune sélection = tous les profils</p>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_TAGS.map(i => (
                <button key={i.key} onClick={() => toggleInterest(i.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${interests.includes(i.key) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          {/* Niveau de boost */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-2"><Megaphone size={13}/>Niveau de boost</p>
            <div className="space-y-2">
              {CAMPAIGN_TIERS.map(t => {
                const selected = tierId === t.id;
                return (
                  <button key={t.id} onClick={() => setTierId(t.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 ${selected ? "border-orange-500 bg-orange-50" : "border-gray-200"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-extrabold text-slate-800">{t.label} <span className="font-normal text-gray-400">· {t.subtitle}</span></p>
                    </div>
                    <span className={`text-[12px] font-extrabold flex-shrink-0 ${selected ? "text-orange-600" : "text-slate-500"}`}>🪙 {t.cpPerDay} CPS/jour</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Durée de la campagne */}
          <div>
            <p className="text-[12px] font-extrabold text-slate-700 flex items-center gap-1.5 mb-1"><CalendarDays size={13}/>Durée de la campagne</p>
            <p className="text-[10px] text-gray-400 mb-2">La mise en avant démarre immédiatement pour la durée choisie</p>
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_DURATION_OPTIONS.map(d => (
                <button key={d} onClick={() => setDurationDays(d)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold border ${durationDays === d ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>
                  {d} jours
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Se termine le {new Date(Date.now() + durationDays * 86400000).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>
          </div>

          {/* Portée estimée */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0"><Target size={16}/></div>
            <div>
              <p className="text-[10px] text-gray-400 font-semibold">Portée estimée / jour</p>
              <p className="text-[14px] font-extrabold text-slate-800">{reach.min.toLocaleString("fr-FR")} – {reach.max.toLocaleString("fr-FR")} personnes</p>
            </div>
          </div>
          {narrowAudience && (
            <p className="text-[10px] text-amber-600 -mt-3 flex items-center gap-1"><AlertCircle size={11}/>Ciblage très précis — votre audience est restreinte, élargissez un critère pour plus de portée.</p>
          )}
        </div>

        <div className="flex-shrink-0 px-5 pt-3 pb-6 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-gray-500">Coût du boost</span>
            <span className="font-extrabold text-slate-800">🪙 {cpCost} CPS</span>
          </div>
          <button onClick={submit} disabled={!hasEnoughCP}
            className="w-full bg-orange-500 disabled:bg-gray-300 text-white font-bold text-[14px] py-3.5 rounded-xl flex items-center justify-center gap-1.5">
            <Rocket size={15}/>{hasEnoughCP ? `Lancer la campagne (${cpCost} CPS)` : "🪙 Solde CPS insuffisant"}
          </button>
          {wasActive && (
            <button onClick={onClear} className="w-full text-rose-500 font-semibold text-[12px] py-2">
              Mettre en pause la campagne en cours
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ALL_DAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const ALL_TIME_SLOTS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30",
  "11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30",
  "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30",
];

function VisitScheduleConfig({ profile, onClose }) {
  const store = useSharedStore();
  const existing = store.visitSchedules[profile.phone] || { days: [], slots: [] };
  const [days, setDays] = useState(existing.days);
  const [slots, setSlots] = useState(existing.slots);
  const [saved, setSaved] = useState(false);

  function toggleDay(d) { setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); }
  function toggleSlot(s) { setSlots(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]); }

  function handleSave() {
    store.setVisitSchedule(profile.phone, { days, slots });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1500);
  }

  return (
    <div className="absolute inset-0 z-[300] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40"/>
      <div className="bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "85%" }} onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-slate-800 text-[16px]">Programme de visites</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Définissez vos disponibilités pour les visites</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400"/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 pb-8">
          {saved ? (
            <div className="flex flex-col items-center justify-center py-10">
              <CheckCircle2 size={40} className="text-green-600 mb-3"/>
              <p className="font-extrabold text-slate-800 text-[15px]">Programme enregistré !</p>
              <p className="text-[12px] text-gray-400 mt-1">Les clients verront vos créneaux disponibles</p>
            </div>
          ) : (
            <>
              {/* Jours disponibles */}
              <div>
                <p className="text-[12px] font-extrabold text-slate-700 mb-2">📅 Jours disponibles</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map(d => (
                    <button key={d} onClick={() => toggleDay(d)}
                      className={`px-4 py-2 rounded-xl text-[12px] font-bold border ${days.includes(d) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {d}
                    </button>
                  ))}
                </div>
                {days.length === 0 && <p className="text-[10px] text-orange-500 mt-1">Sélectionnez au moins un jour</p>}
              </div>

              {/* Créneaux horaires */}
              <div>
                <p className="text-[12px] font-extrabold text-slate-700 mb-2">🕐 Créneaux horaires disponibles</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {ALL_TIME_SLOTS.map(s => (
                    <button key={s} onClick={() => toggleSlot(s)}
                      className={`py-2 rounded-xl text-[11px] font-semibold border ${slots.includes(s) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {s}
                    </button>
                  ))}
                </div>
                {slots.length === 0 && <p className="text-[10px] text-orange-500 mt-1">Sélectionnez au moins un créneau</p>}
              </div>

              {/* Résumé */}
              {days.length > 0 && slots.length > 0 && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-green-700 mb-1">✅ Votre programme</p>
                  <p className="text-[11px] text-green-700">📅 {days.join(", ")}</p>
                  <p className="text-[11px] text-green-700 mt-0.5">🕐 {slots.length} créneau{slots.length > 1 ? "x" : ""} : {slots[0]} → {slots[slots.length-1]}</p>
                  <p className="text-[10px] text-green-600 mt-1">Les clients verront ces créneaux pour programmer leurs visites</p>
                </div>
              )}

              <button onClick={handleSave} disabled={days.length === 0 || slots.length === 0}
                className={`w-full py-3.5 rounded-xl font-bold text-[14px] ${days.length > 0 && slots.length > 0 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                Enregistrer le programme
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Paiement de la commission Imoobilis via CinetPay ────────────────
// Un bien ne peut être retiré ou supprimé qu'après règlement, via
// l'agrégateur CinetPay (Mobile Money ou carte bancaire), de la commission
// Imoobilis due sur ce bien — calculée une fois pour toutes à la
// publication (computeCommission). Tant que le paiement n'est pas confirmé,
// le bien reste publié.
const CINETPAY_METHODS = [
  { id: "orange", label: "Orange Money" },
  { id: "mtn", label: "MTN MoMo" },
  { id: "moov", label: "Moov Money" },
  { id: "wave", label: "Wave" },
  { id: "carte", label: "Carte bancaire" },
];

function CommissionPaymentSheet({ property, onClose, onPaid }) {
  const [method, setMethod] = useState("orange");
  const [step, setStep] = useState("form"); // "form" | "processing" | "done"

  const commissionAmount = property.commissionAmount ?? computeCommission(property.price || 0, property.transaction);
  const commissionRate = property.commissionRate ?? computeCommissionRate(property.price || 0, property.transaction);

  function handlePay() {
    setStep("processing");
    // Simulation du paiement via l'agrégateur CinetPay (Mobile Money / carte).
    setTimeout(() => {
      setStep("done");
      setTimeout(() => { onPaid(); onClose(); }, 1200);
    }, 1600);
  }

  return (
    <div className="absolute inset-0 z-[220] flex flex-col justify-end" onClick={step === "form" ? onClose : undefined}>
      <div className="flex-1 bg-black/40" />
      <div className="bg-white rounded-t-3xl pb-7 flex flex-col" style={{ maxHeight: "85%" }} onClick={(e) => e.stopPropagation()}>
        {step === "form" && (
          <>
            <div className="flex items-center justify-between px-5 pt-6 pb-1 flex-shrink-0">
              <h3 className="font-extrabold text-slate-800 text-[16px] flex items-center gap-1.5"><Wallet size={16} className="text-orange-500"/>Régler la commission</h3>
              <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-[11px] text-gray-400 px-5 pb-3 truncate">{property.title} · Réf. {getPropertyReference(property)}</p>

            <div className="px-5 overflow-y-auto">
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-3.5 py-3 mb-4">
                <p className="text-[11px] text-orange-700 leading-snug">
                  Pour retirer ou supprimer ce bien, la commission Imoobilis due ({(commissionRate * 100).toLocaleString("fr-FR")}%{property.transaction === "location" ? " du loyer mensuel TTC" : ""}) doit d'abord être réglée via CinetPay. Le bien reste publié tant que le paiement n'est pas confirmé.
                </p>
              </div>

              <div className="bg-white rounded-xl p-3 border border-gray-100 flex items-center justify-between mb-4">
                <span className="text-[12px] font-bold text-slate-700">Commission à régler</span>
                <span className="text-[17px] font-extrabold text-orange-700">
                  {commissionAmount.toLocaleString("fr-FR")} FCFA{property.transaction === "location" ? " TTC" : ""}
                </span>
              </div>

              <p className="text-[11px] font-bold text-slate-600 mb-2">Moyen de paiement CinetPay</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {CINETPAY_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`rounded-xl py-2.5 text-center border text-[12px] font-semibold ${method === m.id ? "bg-green-50 border-green-700 text-green-700" : "bg-white border-gray-200 text-slate-600"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handlePay}
                className="w-full flex items-center justify-center gap-2 bg-green-700 text-white rounded-2xl py-3.5 font-bold text-[14px]"
              >
                Payer {commissionAmount.toLocaleString("fr-FR")} FCFA via CinetPay
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2 pb-1">Paiement sécurisé — le bien sera automatiquement retiré une fois la commission confirmée.</p>
            </div>
          </>
        )}

        {step === "processing" && (
          <div className="py-10 px-5 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] font-semibold text-slate-600">Validation du paiement CinetPay…</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-10 px-5 flex flex-col items-center gap-3">
            <CheckCircle2 size={36} className="text-green-700" />
            <p className="text-[13px] font-bold text-slate-800">Commission réglée</p>
            <p className="text-[11px] text-gray-500 text-center">Le bien a été retiré de la plateforme.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tableau de bord analytique de l'annonceur ─────────────────────────
// Vue d'ensemble de l'activité RÉELLE des clients sur les biens de
// l'annonceur : vues (chaque ouverture de fiche), explorations (déblocage
// effectif carte/POI/trajet — engagement plus fort qu'une simple vue,
// puisqu'il coûte des CPS au client) et contacts (numéro débloqué).
// Aucune donnée simulée : tout provient des compteurs réels incrémentés
// côté client (incrementPropertyViews/Explorations/Contacts).
// ── Historique des commissions Imoobilis versées par l'annonceur ─────
// Alimenté par commissionPayments (voir SharedStoreProvider / handleDelete)
// — journalisé au moment exact du règlement CinetPay, puisque le bien
// lui-même disparaît du catalogue juste après (retrait effectif). Analytique
// par type de transaction (location/vente) et par zone géographique, en
// plus de la liste chronologique complète.
function CommissionHistorySheet({ payments, onClose }) {
  const total = payments.reduce((s, p) => s + (p.commissionAmount || 0), 0);
  const avg = payments.length > 0 ? Math.round(total / payments.length) : 0;

  const byType = useMemo(() => {
    const map = { location: { count: 0, total: 0 }, vente: { count: 0, total: 0 } };
    for (const p of payments) {
      const key = p.transaction === "vente" ? "vente" : "location";
      map[key].count += 1;
      map[key].total += p.commissionAmount || 0;
    }
    return map;
  }, [payments]);

  const byZone = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const label = p.zone ? (ZONES_COMMUNES[p.zone]?.label || p.zone) : (p.commune || p.district || "Zone inconnue");
      if (!map.has(label)) map.set(label, { count: 0, total: 0 });
      const z = map.get(label);
      z.count += 1;
      z.total += p.commissionAmount || 0;
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [payments]);

  return (
    <div className="absolute inset-0 z-[210] flex flex-col bg-slate-50">
      <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
        <h3 className="font-extrabold text-slate-800 text-[16px]">Historique des commissions</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Total versé</p>
            <p className="text-[18px] font-extrabold text-green-700">{total.toLocaleString("fr-FR")} F</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Paiements</p>
            <p className="text-[18px] font-extrabold text-slate-700">{payments.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 col-span-2">
            <p className="text-[10px] text-gray-400 font-semibold">Moyenne par commission</p>
            <p className="text-[18px] font-extrabold text-amber-600">{avg.toLocaleString("fr-FR")} F</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-slate-700 mb-2">Par type de transaction</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              <p className="text-[10px] text-blue-600 font-bold">Location</p>
              <p className="text-[16px] font-extrabold text-slate-800">{byType.location.total.toLocaleString("fr-FR")} F</p>
              <p className="text-[9.5px] text-gray-400">{byType.location.count} paiement{byType.location.count !== 1 ? "s" : ""}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              <p className="text-[10px] text-orange-500 font-bold">Vente</p>
              <p className="text-[16px] font-extrabold text-slate-800">{byType.vente.total.toLocaleString("fr-FR")} F</p>
              <p className="text-[9.5px] text-gray-400">{byType.vente.count} paiement{byType.vente.count !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {byZone.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Par zone géographique</p>
            <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-2">
              <div style={{ width: "100%", height: Math.max(120, byZone.length * 38) }}>
                <ResponsiveContainer>
                  <BarChart data={byZone} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                    <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v) => `${v.toLocaleString("fr-FR")} F`} />
                    <Bar dataKey="total" fill="#15803d" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-1.5">
              {byZone.map(z => (
                <div key={z.name} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-700">{z.name}</p>
                  <p className="text-[11px] text-gray-500">{z.count} · <span className="font-bold text-green-700">{z.total.toLocaleString("fr-FR")} F</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-bold text-slate-700 mb-2">Historique chronologique</p>
          {payments.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Aucune commission versée pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-bold text-slate-800 truncate flex-1 pr-2">{p.propertyTitle}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.transaction === "location" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                      {p.transaction === "location" ? "Location" : "Vente"}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-gray-400 mb-1.5">
                    {p.zone ? (ZONES_COMMUNES[p.zone]?.label || p.zone) : (p.commune || p.district || "Zone inconnue")} · {formatTxDateTime(p.paidAt)}
                  </p>
                  <p className="text-[13px] font-extrabold text-green-700">{(p.commissionAmount || 0).toLocaleString("fr-FR")} FCFA</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdvertiserAnalyticsSheet({ rows, totalViews, totalExplorations, totalContacts, onClose }) {
  const chartData = rows.slice(0, 8).map(r => ({ name: r.name, Vues: r.vues, Explorations: r.explorations, Contacts: r.contacts }));
  const conversionRate = totalViews > 0 ? Math.round((totalContacts / totalViews) * 100) : 0;
  return (
    <div className="absolute inset-0 z-[210] flex flex-col bg-slate-50">
      <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
        <h3 className="font-extrabold text-slate-800 text-[16px]">Statistiques détaillées</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Vues totales</p>
            <p className="text-[22px] font-extrabold text-blue-600">{totalViews}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Explorations totales</p>
            <p className="text-[22px] font-extrabold text-amber-600">{totalExplorations}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Contacts totaux</p>
            <p className="text-[22px] font-extrabold text-green-700">{totalContacts}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[10px] text-gray-400 font-semibold">Taux de conversion</p>
            <p className="text-[22px] font-extrabold text-slate-700">{conversionRate}%</p>
            <p className="text-[9px] text-gray-400">Contacts / Vues</p>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-[11px] font-bold text-slate-700 mb-2">Vues, explorations & contacts par bien</p>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip wrapperStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Vues" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Explorations" fill="#d97706" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Contacts" fill="#15803d" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-bold text-slate-700 mb-2">Classement par bien (le plus exploré en premier)</p>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const rowConv = r.vues > 0 ? Math.round((r.contacts / r.vues) * 100) : 0;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-bold text-slate-800 truncate flex-1 pr-2">{i + 1}. {r.fullTitle}</p>
                    <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">{rowConv}% conv.</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1"><Activity size={11}/>{r.vues} vues</span>
                    <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1"><MapPinned size={11}/>{r.explorations} expl.</span>
                    <span className="text-[11px] text-green-700 font-semibold flex items-center gap-1"><Phone size={11}/>{r.contacts} contacts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdvertiserApp({ profile, onLogout }) {
  const store = useSharedStore();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [campaignFor, setCampaignFor] = useState(null); // bien en cours de boost (CampaignSheet)
  const [pendingCommissionFor, setPendingCommissionFor] = useState(null); // bien à retirer/supprimer, en attente de règlement de la commission (CommissionPaymentSheet)
  const [showTopUp, setShowTopUp] = useState(false);
  const [promoDiscountPercent, setPromoDiscountPercent] = useState(0); // remise % à appliquer au prochain rechargement (code promo discount_topup)
  const [showPromoSheet, setShowPromoSheet] = useState(false);
  const [topUpAmt, setTopUpAmt] = useState("");
  const [showVisitConfig, setShowVisitConfig] = useState(false);
  const [openContactId, setOpenContactId] = useState(null);
  const [advertPropPreview, setAdvertPropPreview] = useState(null); // bien affiché en prévisualisation depuis "Visites"
  const [nowTick, setNowTick] = useState(Date.now());

  // Dès que l'annonceur ouvre l'aperçu d'une demande de visite, son contact
  // client est révélé gratuitement (déjà payé côté client à la programmation).
  useEffect(() => {
    if (advertPropPreview?.visit && !advertPropPreview.visit.advertiserContacted) {
      contactClient(advertPropPreview.visit);
      setAdvertPropPreview(prev => prev ? { ...prev, visit: { ...prev.visit, advertiserContacted: true } } : null);
    }
  }, [advertPropPreview?.visit?.id]);

  // ── Système CPS Annonceur ──
  // cpBalance : solde en Crédit-Points (1 CPS = 100 FCFA rechargés)
  // cpBonus : CPS bonus offerts (rechargements importants, promos) — dépensés en priorité
  const [cpBalance, setCpBalance] = useState(0);
  const [cpBonus, setCpBonus] = useState(0);
  const [cpTransactions, setCpTransactions] = useState([]);
  const totalCP = cpBalance + cpBonus;

  function topUpCP_Adv(fcfa) {
    const { cp, bonus } = fcfaToCP(fcfa, TOPUP_CP_PRESETS_ADVERTISER);
    const discountBonus = promoDiscountPercent > 0 ? Math.round(cp * promoDiscountPercent / 100) : 0;
    setCpBalance(prev => prev + cp);
    if (bonus + discountBonus > 0) setCpBonus(prev => prev + bonus + discountBonus);
    setCpTransactions(prev => [
      { id: `cp-${Date.now()}`, type: "credit", label: `Rechargement ${fcfa.toLocaleString("fr-FR")} F`, cp, bonus: bonus + discountBonus, date: new Date().toISOString() },
      ...prev,
    ]);
    showToast(bonus + discountBonus > 0 ? `+${cp} CPS crédités + ${bonus + discountBonus} CPS bonus` : `+${cp} CPS crédités`);
    if (promoDiscountPercent > 0) setPromoDiscountPercent(0);
  }

  function deductCP_Adv(cp, label) {
    const fromBonus = Math.min(cpBonus, cp);
    const fromBalance = cp - fromBonus;
    if (fromBalance > cpBalance) return false;
    setCpBonus(prev => prev - fromBonus);
    setCpBalance(prev => prev - fromBalance);
    setCpTransactions(prev => [
      { id: `cp-${Date.now()}`, type: "debit", label, cp, date: new Date().toISOString() },
      ...prev,
    ]);
    return true;
  }

  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 60000); return () => clearInterval(id); }, []);

  // Détecte une nouvelle demande de visite sur les annonces de l'annonceur
  // et affiche la popup de notification avec 2 bips. La popup elle-même est
  // rendue par DualScreenApp (voir store.advertiserNotif) pour rester visible
  // même quand cet écran n'est pas l'onglet actif en mode mobile.
  const prevVisitCount = useRef(0);
  // Filtre les visites reçues pour CET annonceur :
  // - soit le bien est dans ses annonces publiées (store.publishedProperties)
  // - soit la demande porte directement son numéro (biens de démo avec advertiserPhone)
  const myVisitsForNotif = store.visitRequests.filter(v =>
    v.advertiserPhone === profile.phone ||
    store.publishedProperties.some(p => p.id === v.propertyId && p.advertiserPhone === profile.phone)
  );
  useEffect(() => {
    const curr = myVisitsForNotif.length;
    if (curr > prevVisitCount.current && curr > 0) {
      const newest = myVisitsForNotif[0];
      store.setAdvertiserNotif({
        type: "visit_request",
        propertyTitle: newest.propertyTitle,
        propertyId: newest.propertyId,
        visitId: newest.id,
        clientName: newest.clientName,
        day: newest.day,
        time: newest.time,
      });
      playDoubleBeepGlobal();
    }
    prevVisitCount.current = curr;
  }, [myVisitsForNotif.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consomme une demande de navigation émise par un clic sur la popup de
  // notification (rendue au niveau de DualScreenApp) : ouvre le bien
  // concerné + sa demande de visite dans l'onglet "Visites".
  useEffect(() => {
    if (!store.pendingAdvertiserView) return;
    const { propertyId, visitId } = store.pendingAdvertiserView;
    const prop = myProperties.find(p => p.id === propertyId) || store.publishedProperties.find(p => p.id === propertyId);
    const visit = myVisits.find(v => v.id === visitId);
    setActiveTab("contacts");
    if (prop) {
      setAdvertPropPreview({ prop, visit: visit || null });
    } else if (visit) {
      setOpenContactId(visit.id);
    }
    store.setPendingAdvertiserView(null);
  }, [store.pendingAdvertiserView]); // eslint-disable-line react-hooks/exhaustive-deps
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2800); }

  // "Mes annonces" est désormais dérivé directement du store partagé
  // (filtré par numéro d'annonceur) plutôt que d'une copie locale : ainsi,
  // une déconnexion/reconnexion ne fait plus perdre le lien avec les
  // annonces déjà publiées, et les nouvelles demandes de visite des
  // clients restent visibles dans le tableau de bord.
  const myProperties = store.publishedProperties.filter(p => p.advertiserPhone === profile.phone);
  // Biens dont la disponibilité doit être (re)confirmée chaque semaine —
  // durée de publication illimitée en échange de cette obligation, pour que
  // le catalogue affiché aux clients reste crédible (pas de biens déjà
  // vendus/loués qui traînent). Inclut aussi bien le simple rappel que
  // l'état "déjà suspendu".
  const listingsNeedingConfirmation = myProperties.filter(p => isAvailabilityConfirmDue(p));

  // Publication 100% gratuite et sans restriction — plus aucun coût CPS ni
  // quota mensuel à la publication. Seule une commission Imoobilis (voir
  // computeCommission, calculée et affichée à l'étape 6 du formulaire) reste
  // due par l'annonceur une fois le bien loué, vendu, ou retiré.
  function handleAdd(form) {
    const now = new Date();
    const validTopoPoints = (form.topoPoints || [])
      .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const prop = { ...form, id: newId(), advertiserName: profile.name, advertiserPhone: profile.phone,
      advertiserType: profile.type,
      images: form.images,
      publishedAt: now.toISOString(),
      // Point de départ du cycle de confirmation de disponibilité.
      lastConfirmedAt: now.toISOString(),
      isSuspended: false, suspendedAt: null,
      views: 0, contacts: 0, distance: 1.2 + Math.random(),
      mapPin: { top: 25 + Math.random() * 50, left: 25 + Math.random() * 50 },
      amenities: form.amenities || [],
      // Bornes topographiques normalisées (nombres) + superficie exacte
      // recalculée à la publication — voir computePolygonAreaM2 et le
      // formulaire (PropertyFormSheet, section "Extrait topographique").
      topoPoints: validTopoPoints,
      topoAreaM2: validTopoPoints.length >= 3 ? Math.round(computePolygonAreaM2(validTopoPoints)) : null,
      commissionRate: form.commissionRate ?? computeCommissionRate(parseInt(form.price) || 0, form.transaction),
      commissionAmount: form.commissionAmount ?? computeCommission(parseInt(form.price) || 0, form.transaction) };
    store.setVisitSchedule(profile.phone, { days: form.visitDays, slots: form.visitSlots });
    setShowAdd(false);
    showToast(`✅ Bien publié gratuitement — commission Imoobilis de ${prop.commissionAmount.toLocaleString("fr-FR")} FCFA due seulement une fois le bien loué/vendu`);
    // Diagnostic visible de la synchronisation Supabase — affiché après le
    // toast ci-dessus (délai), car pas de console développeur accessible
    // sur mobile pour voir une éventuelle erreur silencieuse.
    store.publishProperty(prop).then(
      () => setTimeout(() => showToast("✅ Synchronisé avec Supabase"), 3200),
      (err) => setTimeout(() => showToast(`❌ Supabase : ${err.message}`.slice(0, 140)), 3200)
    );
  }

  function handleEdit(form) {
    const validTopoPoints = (form.topoPoints || [])
      .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const updated = {
      ...myProperties.find(p => p.id === form.id),
      ...form,
      topoPoints: validTopoPoints,
      topoAreaM2: validTopoPoints.length >= 3 ? Math.round(computePolygonAreaM2(validTopoPoints)) : null,
    };
    store.publishProperty(updated);
    store.setVisitSchedule(profile.phone, { days: form.visitDays, slots: form.visitSlots });
    setEditing(null);
    showToast("Annonce mise à jour !");
  }

  // La suppression effective n'intervient qu'après confirmation du paiement
  // de la commission Imoobilis due sur ce bien lorsque celle-ci est
  // exigée (voir requestDelete / CommissionPaymentSheet). Le bien étant
  // retiré du catalogue juste après, on journalise d'abord l'essentiel de
  // son instantané (prix, type de transaction, zone, montant réglé) dans
  // commissionPayments — sinon toute trace de ce paiement serait perdue.
  function handleDelete(id, { viaCommission = false } = {}) {
    if (viaCommission) {
      const p = store.publishedProperties.find(pr => pr.id === id);
      if (p) {
        store.addCommissionPayment({
          id: `com-${Date.now()}`,
          propertyId: p.id,
          propertyTitle: p.title || p.category,
          advertiserPhone: p.advertiserPhone,
          transaction: p.transaction,
          price: p.price || 0,
          zone: p.zone || null,
          commune: p.commune || null,
          district: p.district || null,
          commissionRate: p.commissionRate ?? computeCommissionRate(p.price || 0, p.transaction),
          commissionAmount: p.commissionAmount ?? computeCommission(p.price || 0, p.transaction),
          paidAt: new Date().toISOString(),
        });
      }
    }
    store.unpublishProperty(id);
    showToast(viaCommission ? "Commission réglée — annonce retirée" : "Annonce supprimée — aucun client n'a exploré ni contacté ce bien, aucune commission due");
  }

  // Ouvre le paiement CinetPay de la commission due dès que l'une des deux
  // conditions ci-dessous est atteinte — voir COMMISSION_MIN_EXPLORATIONS_THRESHOLD
  // / COMMISSION_MIN_CONTACTS_THRESHOLD : au moins une exploration (carte/
  // POI/trajet débloqué, payée en CPS ou couverte par les crédits de
  // bienvenue) OU au moins un contact (numéro de l'annonceur débloqué) —
  // que ce déblocage ait été payé ou non change rien : une seule
  // exploration ou un seul contact suffit à déclencher la commission. Sans
  // aucune des deux, le bien peut être retiré/supprimé directement, sans
  // commission à régler.
  function requestDelete(p) {
    if ((p.explorations || 0) >= COMMISSION_MIN_EXPLORATIONS_THRESHOLD || (p.contacts || 0) >= COMMISSION_MIN_CONTACTS_THRESHOLD) {
      setPendingCommissionFor(p);
    } else {
      handleDelete(p.id);
    }
  }

  // Confirme qu'un bien payant est toujours disponible — relance le cycle
  // de AVAILABILITY_CONFIRM_INTERVAL_DAYS jours et lève une éventuelle
  // suspension. C'est l'action attendue chaque semaine pour qu'un bien vendu
  // ou loué ne reste pas indéfiniment affiché comme disponible aux clients.
  function handleConfirmAvailable(p) {
    store.publishProperty({ ...p, lastConfirmedAt: new Date().toISOString(), isSuspended: false, suspendedAt: null });
    showToast(p.isSuspended ? `✅ "${p.title}" republié — bien confirmé disponible` : `✅ "${p.title}" confirmé disponible`);
  }

  // 🧪 OUTIL DEV — bascule manuellement l'état "Suspendu" d'un bien, sans
  // attendre les AVAILABILITY_CONFIRM_INTERVAL_DAYS + AVAILABILITY_GRACE_DAYS
  // réels. Permet de vérifier rapidement le rendu côté client (badge ⛔,
  // aperçu limité, contact bloqué) pendant les tests. À retirer avant mise
  // en production.
  function handleDevToggleSuspend(p) {
    const nowSuspended = !p.isSuspended;
    store.publishProperty({
      ...p,
      isSuspended: nowSuspended,
      suspendedAt: nowSuspended ? new Date().toISOString() : null,
    });
    showToast(nowSuspended ? `🧪 "${p.title}" suspendu (test dev)` : `🧪 "${p.title}" republié (test dev)`);
  }

  // Vérifie tous les biens payants de l'annonceur et SUSPEND ceux dont la
  // disponibilité n'a pas été confirmée dans le délai de grâce
  // (AVAILABILITY_GRACE_DAYS après le rappel hebdomadaire). Le bien reste
  // suspendu (badge "Suspendu" côté client, aperçu limité) jusqu'à ce que
  // l'annonceur confirme sa disponibilité ou retire l'annonce — aucune
  // pénalité financière, juste une mise en pause pour garder le catalogue
  // crédible. Si le bien reste suspendu sans réaction pendant
  // AVAILABILITY_AUTO_DELETE_DAYS jours de plus, il est supprimé
  // automatiquement. Se déclenche à l'ouverture de l'espace annonceur et à
  // chaque évolution du catalogue publié.
  useEffect(() => {
    store.publishedProperties
      .filter(p => p.advertiserPhone === profile.phone && !p.isSuspended && isAvailabilitySuspendDue(p))
      .forEach(p => {
        store.publishProperty({ ...p, isSuspended: true, suspendedAt: new Date().toISOString() });
        showToast(`⛔ "${p.title}" suspendu — confirmez sa disponibilité pour le republier`);
      });
    store.publishedProperties
      .filter(p => p.advertiserPhone === profile.phone && isAvailabilityAutoDeleteDue(p))
      .forEach(p => {
        store.unpublishProperty(p.id);
        showToast(`🗑️ "${p.title}" supprimé automatiquement — suspendu depuis ${AVAILABILITY_AUTO_DELETE_DAYS} jours sans réaction`);
      });
  }, [store.publishedProperties]);

  // Lance ou met à jour la campagne de ciblage (boost) d'une annonce :
  // déduit les CPS du palier choisi puis enregistre le ciblage dans le store.
  function handleBoost(campaign) {
    if (!campaignFor) return;
    if (!deductCP_Adv(campaign.cpCost, `Boost "${campaignFor.title}" — ${campaign.tierId}, ${Math.round((new Date(campaign.expiresAt) - new Date(campaign.startedAt)) / 86400000)}j`)) {
      showToast(`CPS insuffisants — il faut ${campaign.cpCost} CPS pour ce boost (solde : ${totalCP} CPS)`);
      setShowTopUp(true);
      return;
    }
    store.setPropertyCampaign(campaignFor.id, campaign);
    setCampaignFor(null);
    showToast(`🚀 Campagne lancée — ${campaign.cpCost} CPS déduits`);
  }

  function handleClearBoost() {
    if (!campaignFor) return;
    store.clearPropertyCampaign(campaignFor.id);
    setCampaignFor(null);
    showToast("Campagne mise en pause");
  }

  // Visites reçues : inclut les biens publiés ET les biens de démo avec advertiserPhone direct
  const myVisits = store.visitRequests.filter(v =>
    v.advertiserPhone === profile.phone ||
    myProperties.some(p => p.id === v.propertyId)
  );
  const unread = myVisits.filter(v => !v.advertiserContacted).length;
  const totalViews = myProperties.reduce((s, p) => s + (p.views || 0), 0);
  const totalExplorations = myProperties.reduce((s, p) => s + (p.explorations || 0), 0);
  const totalContacts = myProperties.reduce((s, p) => s + (p.contacts || 0), 0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCommissionHistory, setShowCommissionHistory] = useState(false);
  const myCommissionPayments = store.commissionPayments.filter(p => p.advertiserPhone === profile.phone);
  // Détail par bien pour le tableau de bord analytique — trié par nombre
  // d'explorations (l'indicateur d'intérêt réel le plus fort, puisqu'il
  // nécessite un déblocage effectif carte/POI/trajet côté client, contrairement
  // à une simple vue qui ne coûte rien à qui que ce soit).
  const analyticsRows = [...myProperties]
    .map(p => ({
      id: p.id,
      name: p.title?.length > 18 ? p.title.slice(0, 17) + "…" : (p.title || p.category),
      fullTitle: p.title || p.category,
      vues: p.views || 0,
      explorations: p.explorations || 0,
      contacts: p.contacts || 0,
    }))
    .sort((a, b) => b.explorations - a.explorations || b.vues - a.vues);

  // Marque une demande de visite comme consultée par l'annonceur : révèle
  // le contact du client (déjà transmis gratuitement, car la programmation
  // de visite a été payée en CPS par le client) et pousse le contact de
  // l'annonceur dans la messagerie du client. Aucun coût CPS côté annonceur.
  function contactClient(visit) {
    store.markVisitContacted(visit.id);
    store.addAdvertiserMessage({
      id: `am-${Date.now()}`,
      propertyId: visit.propertyId,
      propertyTitle: visit.propertyTitle,
      advertiserName: profile.name,
      advertiserPhone: profile.phone,
      advertiserType: profile.type,
      clientName: visit.clientName,
      clientPhone: visit.clientPhone,
      visitDay: visit.day,
      visitTime: visit.time,
      visitType: visit.type,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      read: false,
    });
    return true;
  }

  const NAV = [
    { key: "dashboard", label: "Tableau de bord", icon: BarChart2 },
    { key: "annonces",  label: "Mes annonces",    icon: Package },
    { key: "contacts",  label: "Visites",          icon: CalendarDays },
    { key: "compte",    label: "Mon compte",       icon: User },
  ];

  return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col relative border-x border-slate-200 font-sans">
      <div className="flex items-center justify-end px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0">
        <LiveClock />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src={LOGO_SRC} alt="Imoobilis" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTopUp(true)} className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-200">
            <span className="text-[10px]">🪙</span>{totalCP.toLocaleString("fr-FR")} CPS
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && (
          <div className="px-4 py-5 space-y-4">
            <div>
              <p className="text-[11px] text-gray-400">Bonjour,</p>
              <p className="text-[18px] font-extrabold text-slate-800">{profile.name} 👋</p>
              <p className="text-[11px] text-gray-400">{profile.type === "agency" ? "Agence immobilière" : "Propriétaire particulier"}</p>
            </div>
            <div className="rounded-2xl p-4 bg-gradient-to-br from-green-700 to-green-800">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px]">🪙</span>
                <p className="text-white font-extrabold text-[13px]">Solde : {totalCP.toLocaleString("fr-FR")} CPS</p>
              </div>
              <p className="text-white/80 text-[11px]">Booster une annonce coûte des CPS, indexés sur le palier choisi. Publier reste 100% gratuit.</p>
              <div className="flex items-center justify-between mt-3">
                <p className="text-white/70 text-[10px]">1 CPS = 100 FCFA · ne s'expire jamais</p>
                <button onClick={() => setShowTopUp(true)} className="bg-white/20 text-white text-[11px] font-semibold px-3 py-1 rounded-full">Recharger</button>
              </div>
            </div>
            {listingsNeedingConfirmation.length > 0 && (
              <button onClick={() => setActiveTab("annonces")}
                className="w-full flex items-center gap-2.5 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-3 text-left">
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[14px]">🔔</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-rose-700">
                    {listingsNeedingConfirmation.length === 1 ? "1 bien à confirmer disponible" : `${listingsNeedingConfirmation.length} biens à confirmer disponibles`}
                  </p>
                  <p className="text-[10px] text-rose-600">Vos annonces payantes sont illimitées — confirmez-les chaque semaine ou retirez-les si vendues/louées, sinon elles seront suspendues automatiquement</p>
                </div>
                <ChevronRight size={16} className="text-rose-500 flex-shrink-0"/>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[{label:"Annonces",val:myProperties.length,icon:Package,color:"text-green-700"},
                {label:"Vues",val:totalViews,icon:Activity,color:"text-blue-600"},
                {label:"Explorations",val:totalExplorations,icon:MapPinned,color:"text-amber-600"},
                {label:"Visites",val:myVisits.length,icon:CalendarDays,color:"text-orange-500"}].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 py-3 px-2 text-center">
                  <s.icon size={16} className={`${s.color} mx-auto mb-1`}/>
                  <p className={`font-extrabold text-[20px] ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
            {myProperties.length > 0 && (
              <button onClick={() => setShowAnalytics(true)}
                className="w-full flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl px-3.5 py-3 text-left">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <BarChart2 size={16} className="text-green-700"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-slate-800">Statistiques détaillées</p>
                  <p className="text-[10px] text-gray-400">Vues et explorations par bien, taux de conversion</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0"/>
              </button>
            )}
            {myVisits.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold text-slate-700">Visites reçues</p>
                  <button onClick={() => setActiveTab("contacts")} className="text-[11px] text-orange-500 font-semibold flex items-center gap-0.5">Voir tout<ChevronRight size={13}/></button>
                </div>
                {myVisits.slice(0,3).map(v => (
                  <div key={v.id} className={`flex items-center gap-3 rounded-2xl p-3 border mb-2 ${v.advertiserContacted ? "bg-white border-gray-100" : "bg-orange-50 border-orange-200"}`}>
                    <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0"><CalendarDays size={13} className="text-white"/></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800 truncate">{v.clientName}</p>
                      <p className="text-[10px] text-gray-400">{v.propertyTitle} · {v.day?.label} {v.day?.day} {v.day?.month} à {v.time}</p>
                    </div>
                    {!v.advertiserContacted && <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"/>}
                  </div>
                ))}
              </div>
            )}
            {myProperties.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-bold text-slate-700">Mes annonces</p>
                  <button onClick={() => setActiveTab("annonces")} className="text-[11px] text-orange-500 font-semibold flex items-center gap-0.5">Voir tout<ChevronRight size={13}/></button>
                </div>
                {myProperties.slice(0,2).map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                      <img src={`https://picsum.photos/seed/${p.id}/96/96`} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"}/>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800 truncate">{p.title}</p>
                      <p className="text-[11px] text-gray-500">{p.district} · {p.price?.toLocaleString("fr-FR")} F</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${p.transaction === "location" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                      {p.transaction === "location" ? "Location" : "Vente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {myProperties.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
                <Package size={32} className="text-gray-300 mx-auto mb-2"/>
                <p className="text-[13px] font-semibold text-gray-400">Aucune annonce publiée</p>
                <button onClick={() => setShowAdd(true)}
                  className="mt-3 bg-orange-500 text-white text-[12px] font-semibold px-4 py-2 rounded-full">Publier un bien</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "annonces" && (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-slate-800 text-[16px]">Mes annonces</h2>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-orange-500 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full">
                <PlusCircle size={13}/>Publier
              </button>
            </div>
            {myProperties.length === 0 ? (
              <div className="text-center py-16"><Package size={40} className="mx-auto mb-3 text-gray-200"/><p className="text-[13px] text-gray-400">Aucune annonce</p></div>
            ) : (
              <div className="space-y-3">
                {myProperties.map(p => {
                  const confirmDue = isAvailabilityConfirmDue(p);
                  const suspended = !!p.isSuspended;
                  return (
                  <div key={p.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${suspended ? "border-rose-300" : confirmDue ? "border-amber-300" : "border-gray-100"}`}>
                    <div className="flex gap-3 p-3">
                      <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                        <img src={`https://picsum.photos/seed/${p.id}/128/128`} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display="none"}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[13px] text-slate-800 truncate">{p.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.district} · {p.price?.toLocaleString("fr-FR")} F{p.transaction === "location" ? "/mois" : ""}</p>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Activity size={10}/>{p.views || 0} vues</span>
                          {(p.contacts || 0) > 0 && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Phone size={10}/>{p.contacts} contact{p.contacts > 1 ? "s" : ""}</span>
                          )}
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><CalendarDays size={10}/>{store.visitRequests.filter(v => v.propertyId === p.id).length} visite{store.visitRequests.filter(v => v.propertyId === p.id).length > 1 ? "s" : ""}</span>
                          {isCampaignActive(p.campaign) && (
                            <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Rocket size={9}/>Boostée · {Math.max(0, Math.ceil((new Date(p.campaign.expiresAt) - Date.now()) / 86400000))}j
                            </span>
                          )}
                          {(suspended || confirmDue) && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${suspended ? "text-rose-600 bg-rose-50" : "text-amber-700 bg-amber-50"}`}>
                              {suspended ? "⛔ Suspendu" : "🔔 À confirmer disponible"}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full h-fit flex-shrink-0 ${p.transaction === "location" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                        {p.transaction === "location" ? "Location" : "Vente"}
                      </span>
                    </div>

                    {/* Confirmation de disponibilité — rappel hebdomadaire simple
                        tant qu'on est dans le délai de grâce, puis alerte rouge
                        une fois le bien suspendu. Le bouton "Toujours disponible"
                        est le seul moyen de lever la suspension sans retirer
                        l'annonce. */}
                    {(confirmDue || suspended) && (
                      <div className={`border-t px-3 py-2.5 ${suspended ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"}`}>
                        <p className={`text-[11px] font-bold ${suspended ? "text-rose-700" : "text-amber-700"}`}>
                          {suspended
                            ? "⛔ Ce bien est suspendu — est-il encore disponible ?"
                            : "🔔 Ce bien est-il toujours disponible ?"}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${suspended ? "text-rose-600" : "text-amber-600"}`}>
                          {suspended
                            ? (() => {
                                const daysSuspended = p.suspendedAt ? Math.floor((Date.now() - new Date(p.suspendedAt).getTime()) / 86400000) : 0;
                                const daysLeftBeforeDelete = Math.max(0, AVAILABILITY_AUTO_DELETE_DAYS - daysSuspended);
                                return `Il n'est plus visible normalement par les clients (badge "Suspendu", aperçu limité). Sans réaction, il sera supprimé automatiquement dans ${daysLeftBeforeDelete} jour${daysLeftBeforeDelete > 1 ? "s" : ""}.`;
                              })()
                            : "Confirmez pour rassurer les clients, ou retirez l'annonce si le bien est déjà vendu/loué. Sans réaction, le bien sera suspendu automatiquement."}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleConfirmAvailable(p)}
                            className="flex-1 flex items-center justify-center gap-1 bg-green-700 text-white text-[11px] font-bold py-2 rounded-lg">
                            <Check size={12}/>{suspended ? "Republier — toujours disponible" : "Toujours disponible"}
                          </button>
                          <button onClick={() => requestDelete(p)}
                            className="flex-1 flex items-center justify-center gap-1 border border-rose-300 text-rose-600 text-[11px] font-bold py-2 rounded-lg">
                            <Trash2 size={12}/>Vendu / loué — retirer
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex border-t border-gray-50">
                      <button onClick={() => setEditing(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-slate-600"><Edit2 size={13}/>Modifier</button>
                      <div className="w-px bg-gray-50"/>
                      <button onClick={() => setCampaignFor(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-orange-500"><Rocket size={13}/>{isCampaignActive(p.campaign) ? "Gérer" : "Booster"}</button>
                      <div className="w-px bg-gray-50"/>
                      <button onClick={() => requestDelete(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-rose-500"><Trash2 size={13}/>Supprimer</button>
                    </div>
                    {/* 🧪 Outil dev — teste rapidement l'état "Suspendu" sans
                        attendre le délai réel. À retirer avant prod. */}
                    <button onClick={() => handleDevToggleSuspend(p)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold text-slate-400 border-t border-dashed border-gray-200 bg-slate-50">
                      🧪 {suspended ? "Dev : republier ce bien" : "Dev : simuler la suspension"}
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="px-4 py-4">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Visites reçues</h2>
            <p className="text-[11px] text-gray-400 mb-4">Les demandes de visite envoyées par vos clients intéressés.</p>
            {myVisits.length === 0 ? (
              <div className="text-center py-16">
                <CalendarDays size={40} className="mx-auto mb-3 text-gray-200"/>
                <p className="text-[13px] text-gray-400">Aucune visite programmée</p>
                <p className="text-[11px] text-gray-300 mt-1">Les clients qui programment une visite apparaîtront ici</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myVisits.map(v => {
                  const prop = myProperties.find(p => p.id === v.propertyId);
                  const seed = v.propertyId ? ((v.propertyId.charCodeAt(0) || 1) + (v.propertyId.charCodeAt(1) || 2)) : 1;
                  const cat = prop?.category || "Appartement";
                  return (
                    <div key={v.id}>
                      <button onClick={() => {
                        const opening = openContactId !== v.id;
                        setOpenContactId(opening ? v.id : null);
                        if (opening && !v.advertiserContacted) contactClient(v);
                      }}
                        className={`w-full flex items-start gap-3 rounded-2xl p-3.5 border text-left ${v.advertiserContacted ? "bg-white border-gray-100" : "bg-orange-50 border-orange-200"}`}>

                        {/* Vignette du bien — cliquable pour prévisualiser */}
                        <div
                          className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 relative"
                          onClick={(e) => { e.stopPropagation(); if (prop) setAdvertPropPreview({ prop, visit: v }); }}
                        >
                          {prop
                            ? <PropertyImage category={cat} seed={seed} className="w-full h-full" />
                            : <div className="w-full h-full bg-orange-100 flex items-center justify-center"><CalendarDays size={18} className="text-orange-400"/></div>
                          }
                          {/* Indicateur "Nouveau" */}
                          {!v.advertiserContacted && (
                            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-orange-500 rounded-full border border-white"/>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Titre du bien — cliquable pour prévisualiser */}
                          <div className="flex items-start justify-between">
                            <button
                              className="text-left flex-1 min-w-0"
                              onClick={(e) => { e.stopPropagation(); if (prop) setAdvertPropPreview({ prop, visit: v }); }}
                            >
                              <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{v.propertyTitle}</p>
                              {prop && <p className="text-[10px] text-orange-500 font-semibold mt-0.5">Voir le bien →</p>}
                            </button>
                            {!v.advertiserContacted && <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-1.5 ml-1"/>}
                          </div>
                          <p className="text-[12px] font-semibold text-slate-700 mt-1">{v.clientName}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">📅 {v.day?.label} {v.day?.day} {v.day?.month} à {v.time} · {v.type === "presentiel" ? "Présentiel" : "Virtuelle"}</p>
                        </div>
                        <ChevronDown size={14} className={`text-gray-300 flex-shrink-0 mt-1 transition-transform ${openContactId === v.id ? "rotate-180" : ""}`}/>
                      </button>
                      {openContactId === v.id && (
                        <div className="mx-1 bg-slate-50 rounded-b-2xl border border-t-0 border-gray-100 p-3.5">
                          <p className="text-[11px] font-bold text-slate-700 mb-2">Coordonnées du client</p>
                          <button onClick={() => { window.location.href = `tel:${v.clientPhone}`; }} className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 text-left">
                            <Phone size={16} className="text-green-700"/>
                            <div>
                              <p className="text-[13px] font-bold text-slate-800">{v.clientPhone}</p>
                              <p className="text-[10px] text-gray-400">📞 Toucher pour appeler</p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "compte" && (
          <div className="px-4 py-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
                {profile.name.slice(0,2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-extrabold text-slate-800 text-[15px]">{profile.name}</p>
                  {totalCP > 0 && <span className="flex items-center gap-0.5 bg-amber-50 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">🪙 {totalCP} CPS</span>}
                </div>
                <p className="text-[11px] text-gray-400">{profile.type === "agency" ? "Agence immobilière" : "Propriétaire particulier"}</p>
                <p className="text-[11px] text-gray-400">{profile.phone}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-semibold">Solde Imoobilis</p>
              {/* Solde CPS annonceur */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[18px]">🪙</span>
                <span className="text-[22px] font-extrabold text-amber-700">{totalCP.toLocaleString("fr-FR")}</span>
                <span className="text-[13px] font-bold text-gray-400">CPS</span>
              </div>
              {cpBonus > 0 && <p className="text-[10px] text-orange-500 font-bold mt-0.5">dont {cpBonus} CPS bonus</p>}
              <p className="text-[9px] text-gray-400 mt-0.5 mb-2">Les CPS servent à publier vos annonces</p>
              <button onClick={() => setShowTopUp(true)} className="mt-1 w-full bg-green-700 text-white font-bold text-[13px] py-2.5 rounded-xl flex items-center justify-center gap-1.5">
                <Plus size={15}/>Recharger mon compte
              </button>
            </div>
            {/* Programme de visites */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800 text-[13px]">Programme de visites</p>
                  {store.visitSchedules[profile.phone] ? (
                    <p className="text-[11px] text-green-600 mt-0.5">
                      ✓ {store.visitSchedules[profile.phone].days.length} jour{store.visitSchedules[profile.phone].days.length > 1 ? "s" : ""} · {store.visitSchedules[profile.phone].slots.length} créneau{store.visitSchedules[profile.phone].slots.length > 1 ? "x" : ""} configuré{store.visitSchedules[profile.phone].slots.length > 1 ? "s" : ""}
                    </p>
                  ) : (
                    <p className="text-[11px] text-orange-500 mt-0.5">Non configuré — les clients ne peuvent pas programmer de visites</p>
                  )}
                </div>
                <button onClick={() => setShowVisitConfig(true)}
                  className="flex items-center gap-1.5 bg-orange-500 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
                  <CalendarDays size={12}/>{store.visitSchedules[profile.phone] ? "Modifier" : "Configurer"}
                </button>
              </div>
            </div>

            <button onClick={() => setShowCommissionHistory(true)}
              className="w-full flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl px-3.5 py-3 text-left">
              <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                <FileText size={15} className="text-green-700"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-800">Historique des commissions</p>
                <p className="text-[10px] text-gray-400">
                  {myCommissionPayments.length > 0
                    ? `${myCommissionPayments.reduce((s, p) => s + (p.commissionAmount || 0), 0).toLocaleString("fr-FR")} F versés · ${myCommissionPayments.length} paiement${myCommissionPayments.length > 1 ? "s" : ""}`
                    : "Aucune commission versée pour le moment"}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0"/>
            </button>

            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-rose-500 font-semibold text-[13px] py-2.5">
              <LogOut size={15}/>Se déconnecter
            </button>
          </div>
        )}
      </div>

      {/* Sheet programme de visites */}
      {showVisitConfig && <VisitScheduleConfig profile={profile} onClose={() => setShowVisitConfig(false)}/>}

      {/* Prévisualisation d'un bien depuis le module Visites
          Structure flex-column : header fixe + zone scrollable indépendante */}
      {advertPropPreview && (() => {
        const { prop: ap, visit: av } = advertPropPreview;
        return (
          <div
            className="absolute inset-0 z-[200] flex flex-col justify-end"
            onClick={() => setAdvertPropPreview(null)}
          >
            {/* Fond semi-transparent */}
            <div className="flex-1 bg-black/50" />

            {/* Fiche — flex-col pour que le scroll soit sur le contenu uniquement */}
            <div
              className="bg-white rounded-t-3xl flex flex-col"
              style={{ maxHeight: "85%" }}
              onClick={e => e.stopPropagation()}
            >
              {/* ── En-tête fixe (flex-shrink-0) ── */}
              <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-100 rounded-t-3xl">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div className="w-9" />
                  <p className="font-extrabold text-slate-800 text-[15px] truncate flex-1 text-center px-2">
                    {ap.title}
                  </p>
                  <button
                    onClick={() => setAdvertPropPreview(null)}
                    className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    <X size={16} className="text-slate-600" />
                  </button>
                </div>
              </div>

              {/* ── Zone scrollable ── */}
              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* Galerie photos */}
                <div className="relative h-44 mx-4 mt-3 rounded-2xl overflow-hidden">
                  <PropertyImageGallery property={ap} className="w-full h-full" />
                  <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full text-white pointer-events-none ${ap.transaction === "vente" ? "bg-green-700" : "bg-orange-500"}`}>
                    {ap.transaction === "vente" ? "À vendre" : "À louer"}
                  </span>
                </div>

                {/* Infos bien */}
                <div className="px-4 pt-3 space-y-3">
                  <div>
                    <p className="font-extrabold text-slate-800 text-[17px]">{ap.title}</p>
                    <p className="flex items-center gap-1 text-[12px] text-gray-500 mt-0.5">
                      <MapPin size={11} className="text-gray-400" />{ap.district}, Abidjan
                    </p>
                    <p className={`text-[20px] font-extrabold mt-1 ${ap.transaction === "vente" ? "text-green-700" : "text-orange-500"}`}>
                      {formatPrice(ap)}
                    </p>
                  </div>

                  {/* Caractéristiques */}
                  <div className="flex items-center gap-4 text-[13px] text-slate-600 border border-gray-100 rounded-2xl py-3 px-4">
                    {ap.beds != null && (
                      <span className="flex items-center gap-1.5"><BedDouble size={16} className="text-gray-400" />{ap.beds} ch.</span>
                    )}
                    {ap.baths != null && (
                      <span className="flex items-center gap-1.5"><Bath size={16} className="text-gray-400" />{ap.baths} sdb</span>
                    )}
                    <span className="flex items-center gap-1.5"><Maximize2 size={16} className="text-gray-400" />{ap.area} m²</span>
                  </div>

                  {/* Description */}
                  <p className="text-[12px] text-gray-500 leading-relaxed">{getDescription(ap)}</p>
                </div>

                {/* ── Demande de visite + contact client ── */}
                {av && (
                  <div className="px-4 pt-3 pb-10 space-y-3">

                    {/* Bloc demande de visite */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Demande de visite</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                          <CalendarDays size={16} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-slate-800 truncate">{av.clientName}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            📅 {av.day?.label} {av.day?.day} {av.day?.month} à {av.time}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {av.type === "presentiel" ? "🏠 Présentiel" : "📱 Virtuelle"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Contact client — révélé gratuitement dès l'ouverture de la demande */}
                    <div>
                      <p className="text-[12px] font-bold text-slate-700 mb-2">Coordonnées du client</p>
                      <button
                        onClick={() => { window.location.href = `tel:${av.clientPhone}`; }}
                        className="w-full flex items-center gap-4 bg-green-50 border border-green-100 rounded-2xl p-4 active:bg-green-100 text-left"
                      >
                        <div className="w-12 h-12 bg-green-700 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-green-300">
                          <Phone size={20} className="text-white" />
                        </div>
                        <div>
                          <p className="text-[16px] font-extrabold text-slate-800 tracking-wide">{av.clientPhone}</p>
                          <p className="text-[11px] text-green-600 font-semibold mt-0.5">📞 Toucher pour appeler</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Pas de visite liée */}
                {!av && (
                  <div className="px-4 pb-10 pt-3">
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3.5 flex items-start gap-3">
                      <Lock size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-orange-700 leading-snug">
                        Aucune demande de visite liée à ce bien. Le contact du client sera révélé
                        depuis l'onglet Visites une fois que vous aurez souscrit un abonnement.
                      </p>
                    </div>
                  </div>
                )}
              </div>{/* fin zone scrollable */}
            </div>
          </div>
        );
      })()}

      <div className="flex-shrink-0 border-t border-gray-100 bg-white flex items-stretch">
        {NAV.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5">
              <span className="relative">
                <Icon size={20} className={active ? "text-orange-500" : "text-gray-400"}/>
                {tab.key === "contacts" && unread > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-orange-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{unread}</span>
                )}
              </span>
              <span className={`text-[10px] font-semibold ${active ? "text-orange-500" : "text-gray-400"}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[12px] font-medium px-4 py-2 rounded-full shadow-xl z-[999] whitespace-nowrap">{toast}</div>}
      {(showAdd || editing) && <PropertyFormSheet initial={editing} existingSchedule={store.visitSchedules[profile.phone]} onSubmit={editing ? handleEdit : handleAdd} onClose={() => { setShowAdd(false); setEditing(null); }} />}
      {campaignFor && <CampaignSheet property={campaignFor} availableCP={totalCP} onSubmit={handleBoost} onClear={handleClearBoost} onClose={() => setCampaignFor(null)}/>}
      {showAnalytics && (
        <AdvertiserAnalyticsSheet
          rows={analyticsRows}
          totalViews={totalViews}
          totalExplorations={totalExplorations}
          totalContacts={totalContacts}
          onClose={() => setShowAnalytics(false)}
        />
      )}
      {showCommissionHistory && (
        <CommissionHistorySheet
          payments={myCommissionPayments}
          onClose={() => setShowCommissionHistory(false)}
        />
      )}
      {pendingCommissionFor && (
        <CommissionPaymentSheet
          property={pendingCommissionFor}
          onClose={() => setPendingCommissionFor(null)}
          onPaid={() => handleDelete(pendingCommissionFor.id, { viaCommission: true })}
        />
      )}

      {showTopUp && (
        <div className="absolute inset-0 z-[999] flex flex-col justify-end" style={{ isolation: "isolate" }} onClick={() => setShowTopUp(false)}>
          <div className="absolute inset-0 bg-black/50"/>
 <div className="relative bg-white rounded-t-3xl p-5 pb-8 overflow-y-auto overscroll-contain" style={{ maxHeight: "80%" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-800 text-[16px]">Recharger mon compte</h3>
              <button onClick={() => setShowTopUp(false)}><X size={18} className="text-gray-400"/></button>
            </div>
            <p className="text-[10px] text-gray-400 mb-2">1 CPS = 100 FCFA — les bonus augmentent avec le montant rechargé</p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {TOPUP_CP_PRESETS_ADVERTISER.map(p => (
                <button key={p.fcfa} onClick={() => setTopUpAmt(String(p.fcfa))}
                  className={`min-h-[58px] py-1.5 px-1 rounded-lg border flex flex-col items-center justify-center gap-0 ${topUpAmt === String(p.fcfa) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-700"}`}>
                  <span className="text-[10px] font-extrabold leading-tight text-center">{p.fcfa.toLocaleString("fr-FR")} FCFA</span>
                  <span className={`text-[9.5px] font-bold leading-tight whitespace-nowrap ${topUpAmt === String(p.fcfa) ? "text-white" : "text-amber-600"}`}>
                    🪙 {p.cp} CPS
                  </span>
                  {p.bonus > 0 && (
                    <span className={`text-[8px] font-semibold leading-tight ${topUpAmt === String(p.fcfa) ? "text-green-100" : "text-green-600"}`}>
                      +{p.bonus} bonus
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input value={topUpAmt} onChange={e => setTopUpAmt(e.target.value.replace(/\D/g,""))} placeholder="Autre montant (FCFA)"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-green-600"/>
            {/* Correspondance CPS en direct — même conversion (fcfaToCP) que
                celle réellement créditée à la confirmation. */}
            {parseInt(topUpAmt) >= 100 && (
              <p className="text-[11px] font-bold text-amber-600 mt-1.5 mb-2.5">
                🪙 {fcfaToCP(parseInt(topUpAmt), TOPUP_CP_PRESETS_ADVERTISER).cp} CPS
                {fcfaToCP(parseInt(topUpAmt), TOPUP_CP_PRESETS_ADVERTISER).bonus > 0 && ` + ${fcfaToCP(parseInt(topUpAmt), TOPUP_CP_PRESETS_ADVERTISER).bonus} bonus`}
              </p>
            )}
            {!(parseInt(topUpAmt) >= 100) && <div className="mb-4"/>}
            <button onClick={() => { const amt = parseInt(topUpAmt); if (!amt || amt < 100) return; topUpCP_Adv(amt); setTopUpAmt(""); setShowTopUp(false); }}
              className="w-full bg-green-700 text-white font-bold text-[14px] py-3.5 rounded-xl">
              Confirmer le rechargement
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">Montant minimum : 100 FCFA (1 CPS)</p>
            <button onClick={() => { setShowTopUp(false); setShowPromoSheet(true); }}
              className="w-full text-orange-600 font-bold text-[12px] py-2.5 mt-1">
              🎁 J'ai un code promo
            </button>
          </div>
        </div>
      )}

      {showPromoSheet && (
        <PromoCodeSheet
          onClose={() => setShowPromoSheet(false)}
          onRedeem={(code) => {
            applyPromoCode(code, {
              promoCodes: store.promoCodes,
              redeemedPromoCodes: store.redeemedPromoCodes,
              setRedeemedPromoCodes: store.setRedeemedPromoCodes,
              incrementPromoCodeUses: store.incrementPromoCodeUses,
              onCpsBonus: (value) => {
                setCpBonus(prev => prev + value);
                setCpTransactions(prev => [
                  { id: `cp-${Date.now()}`, type: "credit", label: `Code promo ${code.trim()}`, cp: value, bonus: value, date: new Date().toISOString() },
                  ...prev,
                ]);
              },
              onDiscount: (percent) => setPromoDiscountPercent(percent),
              showToast,
            });
            setShowPromoSheet(false);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ÉCRAN DE CONNEXION
// ══════════════════════════════════════════════════════════════════
function LoginScreen({ onLoginClient, onLoginAdvertiser }) {
  const [mode, setMode]   = useState(null);
  const [phone, setPhone] = useState("");
  const [pin, setPin]     = useState("");
  const [advType, setAdvType] = useState("particular");
  const [advName, setAdvName] = useState("");
  const [advPhone, setAdvPhone] = useState("+225 07 00 00 00 00");
  const [showPin, setShowPin] = useState(false);
  const [advLocation, setAdvLocation] = useState(null);
  const [advLocating, setAdvLocating] = useState(false);
  const [advRccm, setAdvRccm] = useState("");
  // ── Informations optionnelles côté client (proposées à l'inscription,
  // modifiables plus tard dans Mon compte → Mes informations) ──
  const [showOptionalInfo, setShowOptionalInfo] = useState(false);
  const [clientAgeBracket, setClientAgeBracket] = useState(null);
  const [clientProfession, setClientProfession] = useState(null);
  const [clientInterests, setClientInterests] = useState([]);
  function toggleClientInterest(k) { setClientInterests(is => is.includes(k) ? is.filter(x => x !== k) : [...is, k]); }

  function locateAgency() {
    setAdvLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const commune = detectNearestCommune(lat, lng);
        setAdvLocation({ lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)), commune });
        setAdvLocating(false);
      },
      () => setAdvLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  if (!mode) return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col border-x border-slate-200 font-sans">
      <div className="flex items-center justify-end px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0">
        <LiveClock />
      </div>
      <div className="flex-1 flex flex-col justify-center px-8 pb-8">
        <div className="flex justify-center mb-8"><img src={LOGO_SRC} alt="Imoobilis" className="h-16 w-auto object-contain"/></div>
        <h1 className="text-[20px] font-extrabold text-slate-800 text-center mb-1">Bienvenue sur Imoobilis</h1>
        <p className="text-[13px] text-gray-400 text-center mb-10">Vous êtes…</p>
        <div className="space-y-3">
          <button onClick={() => setMode("client")} className="w-full flex items-center gap-4 bg-green-700 text-white rounded-2xl p-5 text-left">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0"><Search size={22} className="text-white"/></div>
            <div><p className="font-extrabold text-[15px]">Je cherche un bien</p><p className="text-[12px] text-green-100 mt-0.5">Explorer, alertes, favoris</p></div>
            <ChevronRight size={18} className="ml-auto text-white/60"/>
          </button>
          <button onClick={() => setMode("advertiser")} className="w-full flex items-center gap-4 bg-orange-500 text-white rounded-2xl p-5 text-left">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0"><Package size={22} className="text-white"/></div>
            <div><p className="font-extrabold text-[15px]">Je suis annonceur</p><p className="text-[12px] text-orange-100 mt-0.5">Publier et gérer mes biens</p></div>
            <ChevronRight size={18} className="ml-auto text-white/60"/>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col border-x border-slate-200 font-sans">
      <div className="flex items-center justify-end px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0">
        <LiveClock />
      </div>
      <div className="flex-1 flex flex-col px-8 pt-6 overflow-y-auto pb-8">
        <button onClick={() => setMode(null)} className="flex items-center gap-1.5 text-[13px] text-gray-400 font-semibold mb-6 self-start">
          <ArrowLeft size={16}/>Retour
        </button>
        <div className="flex justify-center mb-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${mode === "client" ? "bg-green-700" : "bg-orange-500"}`}>
            {mode === "client" ? <Search size={24} className="text-white"/> : <Package size={24} className="text-white"/>}
          </div>
        </div>
        <h1 className="text-[18px] font-extrabold text-slate-800 text-center mb-1">{mode === "client" ? "Espace client" : "Espace annonceur"}</h1>
        <p className="text-[13px] text-gray-400 text-center mb-7">Connectez-vous pour accéder</p>
        <div className="space-y-4">
          {mode === "advertiser" && (
            <>
              <div>
                <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Type de compte</label>
                <div className="flex gap-2">
                  {[["particular","Particulier"],["agency","Agence"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAdvType(v)}
                      className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold border ${advType === v ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">{advType === "agency" ? "Nom de l'agence" : "Votre nom complet"}</label>
                <input value={advName} onChange={e => setAdvName(e.target.value)} placeholder={advType === "agency" ? "Agence ABC" : "Konan Yao"}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-orange-500 text-slate-800"/>
              </div>
              {advType === "agency" && (
                <>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Localisation</label>
                    <button
                      onClick={locateAgency}
                      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-orange-300 bg-orange-50 text-orange-600 rounded-xl py-3 font-semibold text-[13px]"
                    >
                      {advLocating ? (
                        <><Clock size={15} className="animate-spin"/>Localisation…</>
                      ) : advLocation ? (
                        <><CheckCircle2 size={15} className="text-green-600"/><span className="text-green-700 text-[12px]">{advLocation.commune || `${advLocation.lat}, ${advLocation.lng}`}</span></>
                      ) : (
                        <><LocateFixed size={15}/>Me localiser automatiquement</>
                      )}
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1.5">Géolocalisation automatique de votre agence à Abidjan</p>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">RCCM</label>
                    <input value={advRccm} onChange={e => setAdvRccm(e.target.value)} placeholder="CI-ABJ-2024-B-00123"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-orange-500 text-slate-800"/>
                    <p className="text-[10px] text-gray-400 mt-1.5">N° du registre de commerce et du crédit mobilier</p>
                  </div>
                </>
              )}
            </>
          )}
          <div>
            <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Téléphone</label>
            <input type="tel" value={mode === "advertiser" ? advPhone : phone}
              onChange={e => mode === "advertiser" ? setAdvPhone(e.target.value) : setPhone(e.target.value)}
              placeholder="07 00 00 00 00"
              className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] outline-none ${mode === "client" ? "focus:border-green-600" : "focus:border-orange-500"} text-slate-800`}/>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Mot de passe</label>
            <div className="relative">
              <input type={showPin ? "text" : "password"} maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••"
                className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-[20px] tracking-[12px] text-center outline-none ${mode === "client" ? "focus:border-green-600" : "focus:border-orange-500"} text-slate-800`}/>
              <button onClick={() => setShowPin(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPin ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          {mode === "client" && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button onClick={() => setShowOptionalInfo(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50">
                <span className="text-[12px] font-semibold text-slate-600 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-green-700"/>Personnaliser mes annonces <span className="text-gray-400 font-normal">(optionnel)</span>
                </span>
                {showOptionalInfo ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
              </button>
              {showOptionalInfo && (
                <div className="px-4 py-3 space-y-3 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400">Ces informations nous aident à vous montrer des biens plus pertinents. Vous pourrez les renseigner ou les modifier à tout moment dans Mon compte.</p>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Tranche d'âge</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AGE_BRACKETS.map(a => (
                        <button key={a} type="button" onClick={() => setClientAgeBracket(v => v === a ? null : a)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${clientAgeBracket === a ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                          {a} ans
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Profession</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PROFESSIONS.map(p => (
                        <button key={p} type="button" onClick={() => setClientProfession(v => v === p ? null : p)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${clientProfession === p ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Centres d'intérêt</p>
                    <div className="flex flex-wrap gap-1.5">
                      {INTEREST_TAGS.map(i => (
                        <button key={i.key} type="button" onClick={() => toggleClientInterest(i.key)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${clientInterests.includes(i.key) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                          {i.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => mode === "client"
              ? onLoginClient({ ageBracket: clientAgeBracket, profession: clientProfession, interests: clientInterests })
              : onLoginAdvertiser({ name: advName || "Annonceur", phone: advPhone || "+225 00 00 00 00", type: advType, location: advType === "agency" ? advLocation : null, rccm: advType === "agency" ? advRccm : "" })}
            className={`w-full font-semibold py-3.5 rounded-xl text-[14px] mt-2 text-white ${mode === "client" ? "bg-green-700" : "bg-orange-500"}`}>
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Application principale : deux appareils côte à côte ─────────────
// Le client (gauche) et l'annonceur (droite) sont montés simultanément
// et partagent le même SharedStore — c'est ce qui permet à l'annonceur
// de recevoir instantanément la notification quand le client programme
// une visite, exactement comme sur deux vrais téléphones.
const DEFAULT_ADVERTISER_PROFILE = {
  name: "Konan Yao",
  phone: "+225 07 00 00 00 00",
  type: "particular",
  location: null,
  rccm: "",
};

// ── Filet de sécurité contre les écrans blancs ─────────────────────
// Sans ceci, la moindre erreur JavaScript non interceptée pendant le rendu
// (ex. API externe indisponible, donnée inattendue) fait disparaître toute
// l'app côté navigateur, sans aucun message — impossible à diagnostiquer
// sans accès à la console développeur. Ce composant capture l'erreur et
// l'affiche directement à l'écran à la place, avec un bouton pour
// recharger.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Erreur applicative interceptée :", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="w-full max-w-[430px] bg-white rounded-2xl p-5 text-left">
            <p className="font-extrabold text-rose-600 text-[15px] mb-2">⚠️ Une erreur est survenue</p>
            <p className="text-[12px] text-slate-600 mb-3">Copie ce message et envoie-le pour diagnostic :</p>
            <pre className="text-[10.5px] text-slate-700 bg-slate-50 border border-gray-200 rounded-xl p-3 whitespace-pre-wrap break-words max-h-[45vh] overflow-y-auto">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <button onClick={() => window.location.reload()}
              className="w-full bg-slate-800 text-white font-bold text-[13px] py-3 rounded-xl mt-4">
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SharedStoreProvider>
        <DualScreenApp />
      </SharedStoreProvider>
    </ErrorBoundary>
  );
}

// L'administration Imoobilis (gestion des annonceurs, clients, biens,
// signalements, commissions, codes promo) est désormais une application
// web entièrement séparée — voir ImoobilisAdmin.jsx — et n'est plus
// intégrée ici.
function DualScreenApp() {
  const store = useSharedStore();
  const [activeDevice, setActiveDevice] = useState("client");
  const [mobileScreen, setMobileScreen] = useState("login"); // "login" | "client" | "advertiser"
  const [advertiserProfile, setAdvertiserProfile] = useState(DEFAULT_ADVERTISER_PROFILE);
  const [clientOnboarding, setClientOnboarding] = useState(null); // âge/profession/intérêts renseignés à la connexion (optionnel)

  // Le passage en "Suspendu" n'est normalement écrit dans le store que
  // lorsque l'annonceur concerné ouvre son propre espace (voir l'effet dans
  // AdvertiserApp, scopé à profile.phone). Problème : côté client, un bien
  // dont le délai de confirmation est dépassé restait donc affiché comme
  // parfaitement actif (prix, contact payant, visite) tant que son
  // annonceur n'avait pas rouvert l'app pour déclencher le flag. On calcule
  // donc ici, à la lecture, l'état de suspension effectif pour TOUS les
  // biens publiés — indépendamment de qui est connecté — afin que le
  // client voie toujours le bon état (badge ⛔ Suspendu, contact bloqué)
  // sans attendre que l'annonceur se reconnecte.
  const clientVisibleProperties = useMemo(
    () => store.publishedProperties.map((p) =>
      !p.isSuspended && isAvailabilitySuspendDue(p)
        ? { ...p, isSuspended: true, suspendedAt: p.suspendedAt || new Date().toISOString() }
        : p
    ),
    [store.publishedProperties]
  );

  return (
    <>
      {/* ════════════════════════════════════════════
          MODE MOBILE : LoginScreen → Client ou Annonceur
          ════════════════════════════════════════════ */}
      <div className="lg:hidden" style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#f1f5f9" }}>
        {mobileScreen === "login" && (
          <LoginScreen
            onLoginClient={(profileInfo) => { setClientOnboarding(profileInfo); setMobileScreen("client"); }}
            onLoginAdvertiser={(p) => { setAdvertiserProfile(p); setMobileScreen("advertiser"); }}
          />
        )}
        {mobileScreen === "client" && (
          <ImoobilisApp
            onLogout={() => setMobileScreen("login")}
            extraProperties={clientVisibleProperties}
            demoAdvertiserPhone={advertiserProfile.phone}
            initialProfile={clientOnboarding}
          />
        )}
        {mobileScreen === "advertiser" && (
          <AdvertiserApp
            profile={advertiserProfile}
            onLogout={() => setMobileScreen("login")}
          />
        )}
      </div>

      {/* ════════════════════════════════════════════
          MODE DESKTOP : deux téléphones côte à côte
          ════════════════════════════════════════════ */}
      <div className="hidden lg:flex min-h-screen bg-slate-200 items-start justify-center gap-6 py-8 px-6">
        {/* Client */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-bold text-slate-500 tracking-widest uppercase">📱 Client</span>
          <div className="rounded-[2.5rem] border-[6px] border-slate-700 shadow-2xl overflow-hidden" style={{ width: 390, height: 844 }}>
            <ImoobilisApp
              onLogout={() => {}}
              extraProperties={clientVisibleProperties}
              demoAdvertiserPhone={DEFAULT_ADVERTISER_PROFILE.phone}
            />
          </div>
        </div>

        {/* Séparateur */}
        <div className="self-stretch flex flex-col items-center justify-center gap-3 flex-shrink-0 mt-8">
          <div className="w-px flex-1 bg-slate-300" />
          <span className="text-xl">↔️</span>
          <div className="w-px flex-1 bg-slate-300" />
        </div>

        {/* Annonceur */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-bold text-orange-500 tracking-widest uppercase">📱 Annonceur</span>
          <div className="rounded-[2.5rem] border-[6px] border-slate-700 shadow-2xl overflow-hidden" style={{ width: 390, height: 844 }}>
            <AdvertiserApp
              profile={DEFAULT_ADVERTISER_PROFILE}
              onLogout={() => {}}
            />
          </div>
        </div>
      </div>

      {/* Popups de notification */}
      {store.clientNotif && (
        <NotificationPopup
          notification={store.clientNotif}
          onClose={() => store.setClientNotif(null)}
          onView={() => {
            // setActiveDevice ne fait effet qu'en mode bureau (deux écrans
            // côte à côte) ; en mode mobile (un seul écran à la fois, voir
            // mobileScreen), c'est ce dernier qu'il faut également basculer
            // sinon ImoobilisApp n'est pas monté et ne peut pas consommer
            // pendingClientView — la fiche ne s'ouvrait jamais.
            setActiveDevice("client");
            setMobileScreen("client");
            if (store.clientNotif.type === "promo") {
              store.setPendingClientView({ promoMessageId: store.clientNotif.messageId });
            } else {
              store.setPendingClientView({ propertyId: store.clientNotif.propertyId });
            }
          }}
        />
      )}
      {store.advertiserNotif && (
        <NotificationPopup
          notification={store.advertiserNotif}
          onClose={() => store.setAdvertiserNotif(null)}
          onView={() => {
            setActiveDevice("advertiser");
            setMobileScreen("advertiser");
            store.setPendingAdvertiserView({ propertyId: store.advertiserNotif.propertyId, visitId: store.advertiserNotif.visitId });
          }}
        />
      )}
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────────
function ImoobilisApp({ onLogout, extraProperties = [], demoAdvertiserPhone = null, initialProfile = null }) {
  const store = useSharedStore();
  // Demande d'activation du GPS affichée à l'ouverture de l'application,
  // avant tout accès au contenu : null = pas encore répondu, true = autorisé, false = refusé (app fermée)
  const [gpsConsent, setGpsConsent] = useState(null);
  const [activeTab, setActiveTab] = useState("explorer");
  const [search, setSearch] = useState("");
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [drawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(3);
  const [openMessage, setOpenMessage] = useState(null); // message d'agent actuellement ouvert (contenu détaillé)
  const [openPromoMessage, setOpenPromoMessage] = useState(null); // code promo Imoobilis actuellement ouvert
  const [showTerrainBoundary, setShowTerrainBoundary] = useState(false); // limites GPS du terrain (extrait topo)
  const [conversations, setConversations] = useState(() => {
    const seed = INBOX_NOTIFICATIONS.find((n) => n.type === "message");
    return seed ? { [seed.id]: [{ id: "m1", from: "agent", text: seed.body, time: seed.time }] } : {};
  });
  const [replyDraft, setReplyDraft] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  // Ouvre un message réel envoyé par un annonceur (suite à "Contacter le
  // client" depuis son module Visites) : amorce la conversation avec son
  // contact révélé, et marque le message comme lu.
  function openAdvertiserMessage(m) {
    store.markAdvertiserMessageRead(m.id);
    setConversations((prev) => prev[m.id] ? prev : ({
      ...prev,
      [m.id]: [{
        id: "m1", from: "agent",
        text: `Bonjour, je vous contacte au sujet de votre demande de visite pour « ${m.propertyTitle} ». Vous pouvez me joindre directement au ${m.advertiserPhone}.`,
        time: m.time,
      }],
    }));
    setShowReplyBox(false);
    setReplyDraft("");
    setOpenMessage({
      id: m.id,
      agentName: m.advertiserName,
      agentRole: m.advertiserType === "agency" ? "Agence immobilière" : "Propriétaire particulier",
      propertyId: m.propertyId,
      propertyTitle: m.propertyTitle,
    });
  }
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [advancedSheetOpen, setAdvancedSheetOpen] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [alertEditMode, setAlertEditMode] = useState(false); // true quand l'overlay de localisation est ouvert depuis l'assistant "Créer Alerte" (étape 1)
  // ── Sheet "Lancer la recherche" ──
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("geo"); // "geo" | "commune"
  const [searchGeoRadius, setSearchGeoRadius] = useState(5);
  const [searchGeoSearch, setSearchGeoSearch] = useState("");       // texte saisi
  const [searchGeoPlace, setSearchGeoPlace] = useState(null);       // { name, lat, lon }
  const [searchGeoLocating, setSearchGeoLocating] = useState(false);
  const [searchGeoShowList, setSearchGeoShowList] = useState(false); // affiche la liste de suggestions
  const [searchTransaction, setSearchTransaction] = useState("tous");
  const [searchCategory, setSearchCategory] = useState(null);
  const [searchZone, setSearchZone] = useState(null);
  const [searchCommune, setSearchCommune] = useState(null);
  const [searchQuartier, setSearchQuartier] = useState(null);
  const [searchBudget, setSearchBudget] = useState("");
  const [searchSuperficie, setSearchSuperficie] = useState("");
  const [searchMinBeds, setSearchMinBeds] = useState(0);
  useEffect(() => {
    document.body.style.overflow = searchSheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [searchSheetOpen]);
  const [detailProperty, setDetailProperty] = useState(null);
  const [detailTab, setDetailTab] = useState("info");
  const [activePin, setActivePin] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState(0); // segment actif (0 = aucun, 1..SCAN_RING_SEGMENTS = allumé)
  const [scanFoundCount, setScanFoundCount] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const scanIntervalRef = useRef(null);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const [properties, setProperties] = useState(ALL_PROPERTIES);

  // Injecter les biens publiés par les annonceurs dans la liste d'exploration
  // — TOUJOURS visibles pour le client, que le compte de l'annonceur soit
  // "Actif" ou non. Le statut "Compte Actif" reste utile côté annonceur
  // (tableau de bord, mise en avant, etc.) mais ne conditionne plus
  // l'apparition du bien côté client : seul le solde CPS du CLIENT continue
  // de conditionner l'accès aux services approfondis (carte/POI, contact
  // annonceur, vidéo aérienne...), comme avant.
  useEffect(() => {
    setProperties([...extraProperties, ...ALL_PROPERTIES]);
  }, [extraProperties]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = useState({ transaction: "tous", categories: new Set(), minBeds: 0, minBaths: 0 });
  const [advanced, setAdvanced] = useState({ minArea: 0, maxArea: 1000, radius: 10, amenities: new Set(), sortBy: "pertinence" });
  const [draftFrequency, setDraftFrequency] = useState("Quotidien");
  // ── Assistant de création d'alerte (Créer Alerte), en 6 étapes ──
  // 1) Localisation (overlay plein écran) · 2) Rayon · 3) Transaction & catégorie ·
  // 4) Zone & commune · 5) Récapitulatif (nom auto + budget + superficie) · 6) Fréquence
  const [alertWizardStep, setAlertWizardStep] = useState(2); // 1 = overlay localisation (géré hors du sheet)
  const [draftAlertSearch, setDraftAlertSearch] = useState("");       // texte saisi dans l'overlay de localisation
  const [draftAlertPlace, setDraftAlertPlace] = useState(null);       // { name, lat, lon } lieu choisi pour l'alerte
  const [draftAlertLocating, setDraftAlertLocating] = useState(false);
  const [draftAlertRadius, setDraftAlertRadius] = useState(5);        // km, 0 - 10
  const [draftAlertTransaction, setDraftAlertTransaction] = useState("tous");
  const [draftAlertCategory, setDraftAlertCategory] = useState(null);
  const [draftAlertZone, setDraftAlertZone] = useState(null);         // clé de zone (nord/ouest/centre/est/sud)
  const [draftAlertCommune, setDraftAlertCommune] = useState(null);
  const [draftAlertBudget, setDraftAlertBudget] = useState("");
  const [draftAlertSuperficie, setDraftAlertSuperficie] = useState("");
  const [alerts, setAlerts] = useState([
    { id: "a1", name: "Villas à Riviera < 150M FCFA", criteria: "Villa · Riviera · Vente · ≤ 150 000 000 FCFA", frequency: "Quotidien", active: true, location: "Riviera", radius: 5, transaction: "vente", category: "Villa", zone: "est", commune: "Cocody", budget: 150000000, superficie: null },
    { id: "a2", name: "Appartements à louer à Cocody", criteria: "Appartement · Cocody · Location", frequency: "Hebdomadaire", active: true, location: "Cocody", radius: 10, transaction: "location", category: "Appartement", zone: "est", commune: "Cocody", budget: null, superficie: null },
  ]);
  const [alertNotifications, setAlertNotifications] = useState([]); // biens publiés par un annonceur qui correspondent à une alerte
  const [showVisitScheduler, setShowVisitScheduler] = useState(false);
  const [bookedVisits, setBookedVisits] = useState([]);
  const [editingVisitIndex, setEditingVisitIndex] = useState(null); // index dans bookedVisits de la visite en cours de modification
  // Config bandeau défilant — programmable par l'administrateur
  const [adminBannerConfig, setAdminBannerConfig] = useState(null); // null = utilise DEFAULT_BANNER_CONFIG
  const [showShare, setShowShare] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  // Biens déjà signalés par ce client durant sa session — évite les doubles
  // envois et permet d'afficher "Déjà signalé" au lieu du bouton.
  const [reportedPropertyIds, setReportedPropertyIds] = useState(new Set());
  // ── Portefeuille Imoobilis (solde Mobile Money) ──
  // walletBalance : solde principal, crédité lors d'un rechargement Mobile
  // Money et débité à chaque achat de plan. walletBonus : solde bonus
  // (rechargements importants, codes promo) toujours dépensé en priorité.
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletBonus, setWalletBonus] = useState(0);
  const [promoDiscountPercent, setPromoDiscountPercent] = useState(0); // remise % à appliquer au prochain rechargement (code promo discount_topup)
  const [showPromoSheet, setShowPromoSheet] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]); // { id, type: "credit"|"debit", label, amount, bonus, date }
  const [showTopUpSheet, setShowTopUpSheet] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState(null); // achat en attente après un rechargement

  // ── Système 100% CPS : plus d'abonnement zonal ni de durée d'activation. ──
  // Tous les biens sont visibles et la recherche reste gratuite. Deux
  // actions sont payantes en CPS : ouvrir la fiche complète d'un bien
  // (PROPERTY_SERVICES_BUNDLE_CP, forfait carte/POI/trajet) et contacter
  // un annonceur (computeContactCP, indexé sur le prix et le type du bien).
  const hasWalletFunds = (walletBalance + walletBonus) > 0;

  // Horloge "vivante" : conservée pour les autres compteurs vivants de l'app (offre bienvenue, etc.)
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Réinitialise le quota d'ouvertures de carte chaque nouveau jour
  useEffect(() => {
    const today = new Date().toDateString();
    if (mapOpensDate !== today) {
      setMapOpensToday(0);
      setMapOpensDate(today);
    }
  }, [nowTick]);

  // Crédite le portefeuille (paiement Mobile Money) + les CPS équivalents
  function topUpWallet(amount) {
    const bonus = computeTopUpBonus(amount);
    setWalletBalance((prev) => prev + amount);
    if (bonus > 0) setWalletBonus((prev) => prev + bonus);
    setWalletTransactions((prev) => [
      { id: `tx-${Date.now()}`, type: "credit", label: "Rechargement Mobile Money", amount, bonus, date: new Date().toISOString() },
      ...prev,
    ]);
    // Crédit CPS simultané
    topUpClientCP(amount);
    showToast(bonus > 0 ? `Compte crédité de ${amount.toLocaleString("fr-FR")} F + ${bonus.toLocaleString("fr-FR")} F de bonus` : `Compte crédité de ${amount.toLocaleString("fr-FR")} F`);
  }

  // Débite le portefeuille pour un achat (bonus dépensé en priorité).
  // Retourne false si le solde est insuffisant (et ouvre le rechargement).
  function debitWallet(amount, label, plan, source) {
    const total = walletBalance + walletBonus;
    if (total < amount) {
      setPendingPurchase({ plan, source });
      setShowTopUpSheet(true);
      showToast("Solde insuffisant — rechargez votre compte pour continuer");
      return false;
    }
    const fromBonus = Math.min(walletBonus, amount);
    const fromBalance = amount - fromBonus;
    setWalletBonus((prev) => prev - fromBonus);
    setWalletBalance((prev) => prev - fromBalance);
    setWalletTransactions((prev) => [
      { id: `tx-${Date.now()}`, type: "debit", label, amount, date: new Date().toISOString() },
      ...prev,
    ]);
    return true;
  }

  const [showContactSheet, setShowContactSheet] = useState(false);
  // Biens pour lesquels le contact annonceur a déjà été débloqué, la vidéo
  // aérienne déjà générée, et les services à proximité déjà payés — tout
  // comme le portefeuille CPS lui-même (voir plus bas), ces trois Set sont
  // désormais stockés dans le store partagé (SharedStoreProvider) pour
  // survivre à une déconnexion/reconnexion côté client (accès permanent
  // une fois débloqué, comme prévu).
  const { unlockedContacts, setUnlockedContacts, unlockedAerialViews, setUnlockedAerialViews, unlockedNearbyServices, setUnlockedNearbyServices } = store;
  const [generatingAerialFor, setGeneratingAerialFor] = useState(null); // id du bien en cours de génération (état de chargement simulé)
  // Bien source mémorisé pendant le tunnel d'activation — on y revient automatiquement après achat
  const [pendingContactProperty, setPendingContactProperty] = useState(null);
  const [mapOpensToday, setMapOpensToday] = useState(0);
  const [mapOpensDate, setMapOpensDate] = useState(new Date().toDateString());

  // ── Système CPS Client ──
  // cpBalance : solde en Crédit-Points  |  cpBonus : CPS bonus offerts (promos, rechargements importants)
  // Portefeuille et historique stockés dans le store partagé (voir
  // SharedStoreProvider) pour survivre à une déconnexion/reconnexion.
  const { clientCpBalance, setClientCpBalance, clientCpBonus, setClientCpBonus, clientCpTransactions, setClientCpTransactions } = store;
  const totalClientCP = clientCpBalance + clientCpBonus;

  // Applique un code promo (saisi manuellement via PromoCodeSheet, ou reçu
  // dans la messagerie Imoobilis puis "utilisé maintenant" — voir
  // PromoMessageSheet) : délègue à applyPromoCode contre store.promoCodes.
  function handleRedeemPromo(code) {
    applyPromoCode(code, {
      promoCodes: store.promoCodes,
      clientId: store.clientDbIdRef.current,
      redeemedPromoCodes: store.redeemedPromoCodes,
      setRedeemedPromoCodes: store.setRedeemedPromoCodes,
      incrementPromoCodeUses: store.incrementPromoCodeUses,
      onCpsBonus: (value) => {
        setClientCpBonus(prev => prev + value);
        setClientCpTransactions(prev => [
          { id: `cp-${Date.now()}`, type: "credit", label: `Code promo ${code.trim()}`, cp: value, bonus: value, date: new Date().toISOString() },
          ...prev,
        ]);
      },
      onDiscount: (percent) => setPromoDiscountPercent(percent),
      showToast,
    });
  }

  function topUpClientCP(fcfa) {
    const { cp, bonus } = fcfaToCP(fcfa, TOPUP_CP_PRESETS_CLIENT);
    const discountBonus = promoDiscountPercent > 0 ? Math.round(cp * promoDiscountPercent / 100) : 0;
    setClientCpBalance(prev => prev + cp);
    if (bonus + discountBonus > 0) setClientCpBonus(prev => prev + bonus + discountBonus);
    setClientCpTransactions(prev => [
      { id: `cp-${Date.now()}`, type: "credit", label: `Rechargement ${fcfa.toLocaleString("fr-FR")} F`, cp, bonus: bonus + discountBonus, date: new Date().toISOString() },
      ...prev,
    ]);
    if (promoDiscountPercent > 0) setPromoDiscountPercent(0);
  }

  function deductClientCP(cp, label, propertyId = null) {
    const fromBonus = Math.min(clientCpBonus, cp);
    const fromBalance = cp - fromBonus;
    if (fromBalance > clientCpBalance) return false;
    setClientCpBonus(prev => prev - fromBonus);
    setClientCpBalance(prev => prev - fromBalance);
    setClientCpTransactions(prev => [
      { id: `cp-${Date.now()}`, type: "debit", label, cp, date: new Date().toISOString(), propertyId },
      ...prev,
    ]);
    return true;
  }

  // Rembourse au client des CPS déjà débités sur un bien précis — utilisé
  // notamment lorsqu'un signalement de bien (annonce frauduleuse, bien déjà
  // vendu, annonceur injoignable...) est confirmé fondé : les CPS remboursés
  // sont recrédités sur le solde principal et une transaction de type
  // "refund" est ajoutée à l'historique, servant de preuve du remboursement
  // (visible dans le portefeuille du client, en regard des débits d'origine).
  function refundClientCP(cp, label, propertyId = null) {
    if (cp <= 0) return;
    setClientCpBalance(prev => prev + cp);
    setClientCpTransactions(prev => [
      { id: `cp-${Date.now()}`, type: "refund", label, cp, date: new Date().toISOString(), propertyId },
      ...prev,
    ]);
  }

  // Suspend un bien suite à un signalement dont le remboursement a été
  // validé (preuve de paiement CPS + visite programmée depuis au moins 24h,
  // voir ReportPropertySheet). Met à jour la liste locale et le bien affiché
  // en détail, et synchronise le store partagé si le bien provient d'un
  // annonceur publié (pour que son propre espace reflète la suspension).
  function suspendProperty(property) {
    if (!property || property.isSuspended) return;
    const suspendedAt = new Date().toISOString();
    setProperties(prev => prev.map(p => p.id === property.id ? { ...p, isSuspended: true, suspendedAt } : p));
    setDetailProperty(prev => (prev && prev.id === property.id) ? { ...prev, isSuspended: true, suspendedAt } : prev);
    if (store.publishedProperties.some(p => p.id === property.id)) {
      store.publishProperty({ ...property, isSuspended: true, suspendedAt });
    }
  }

  // Génère (simule) la vidéo aérienne 3D d'un bien de prestige : débite
  // computeAerialViewCP(price) une seule fois par bien, puis débloque
  // l'accès de façon permanente (comme le contact annonceur). Un court état
  // "génération en cours" simule le traitement asynchrone réel de l'Aerial
  // View API.
  function handleGenerateAerialView(property) {
    if (!property || unlockedAerialViews.has(property.id)) return;
    const aerialCp = computeAerialViewCP(property.price);
    const debited = deductClientCP(aerialCp, `Vidéo aérienne 3D — ${property.title}`, property.id);
    if (!debited) {
      showToast(`CPS insuffisants — il faut ${aerialCp} CPS pour générer la vidéo aérienne (solde : ${totalClientCP} CPS)`);
      return;
    }
    setGeneratingAerialFor(property.id);
    setTimeout(() => {
      setUnlockedAerialViews(prev => new Set(prev).add(property.id));
      setGeneratingAerialFor(null);
    }, 2200);
  }

  // ── Offre de bienvenue (1 mois, non cumulable) — cartes uniquement, les
  // visites sont désormais strictement soumises à l'abonnement zone actif.
  // Stockée dans le store partagé pour survivre à une déconnexion.
  const { welcomeState, setWelcomeState, WELCOME_EXPIRY_DAYS } = store;
  const welcomeValid = (nowTick - new Date(welcomeState.activatedAt).getTime()) < WELCOME_EXPIRY_DAYS * 86400000;
  const welcomeMapsLeft   = welcomeValid ? welcomeState.mapsLeft   : 0;

  // Coût cumulé des explorations (carte/POI/trajet) effectuées depuis le
  // dernier contact payé : l'exploration elle-même reste immédiate et non
  // bloquante (jamais de vérification de solde à l'ouverture d'une fiche),
  // mais son coût n'est débité qu'au moment où le client choisit vraiment
  // de contacter un annonceur — débit unique couvrant alors le total des
  // explorations accumulées ET le contact lui-même (voir contactAdvertiserWithCP).
  // Stocké dans le store partagé pour survivre à une déconnexion/reconnexion :
  // un client peut explorer des biens un jour, se déconnecter, revenir des
  // jours plus tard explorer d'autres biens, puis contacter un annonceur —
  // le débit couvrira alors bien la totalité de l'ardoise accumulée depuis
  // le dernier contact payé, pas seulement la session en cours.
  const { pendingExplorationCP, setPendingExplorationCP } = store;

  // Débloque le contact d'un annonceur : débite en une seule fois le coût
  // du contact (grille indexée sur le prix du bien) ET le total des
  // explorations accumulées depuis le dernier contact payé (pendingExplorationCP
  // — voir unlockPropertyServicesIfNeeded). L'exploration n'est donc jamais
  // payée isolément : elle se règle au moment où le client passe enfin à
  // l'action sur un bien. Retourne true si le contact a bien été débloqué.
  function contactAdvertiserWithCP(property) {
    if (!property) return false;
    if (unlockedContacts.has(property.id)) return true; // déjà débloqué, accès permanent
    const contactCp = computeContactCP(property);
    const totalCp = contactCp + pendingExplorationCP;
    if (totalClientCP < totalCp) {
      setPendingContactProperty(property);
      setShowTopUpSheet(true);
      showToast(pendingExplorationCP > 0
        ? `CPS insuffisants — il faut ${totalCp} CPS (${contactCp} contact + ${pendingExplorationCP} explorations cumulées) — solde : ${totalClientCP} CPS`
        : `CPS insuffisants — il faut ${contactCp} CPS pour contacter cet annonceur (solde : ${totalClientCP} CPS)`);
      return false;
    }
    if (pendingExplorationCP > 0) {
      deductClientCP(pendingExplorationCP, "Explorations cumulées (carte/POI/trajet)", property.id);
    }
    deductClientCP(contactCp, `Contact annonceur — ${property.title}`, property.id);
    setUnlockedContacts(prev => new Set(prev).add(property.id));
    store.incrementPropertyContacts(property.id);
    showToast(pendingExplorationCP > 0
      ? `Contact débloqué — ${totalCp} CPS déduits (${contactCp} contact + ${pendingExplorationCP} explorations cumulées)`
      : `Contact débloqué — ${contactCp} CPS déduits`);
    setPendingExplorationCP(0);
    return true;
  }
  // Panneaux de la section "Mon compte"
  const [showMyInfoSheet, setShowMyInfoSheet] = useState(false);
  const [showCpHistorySheet, setShowCpHistorySheet] = useState(false);
  const [showSecuritySheet, setShowSecuritySheet] = useState(false);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  // Informations personnelles du client (modifiables dans "Mes informations")
  // Identité et suspension stockées dans le store partagé (voir
  // SharedStoreProvider) pour survivre à une déconnexion et rester visibles
  // dans le module Clients de l'administration.
  const { myInfo, setMyInfo, clientSuspended } = store;
  useEffect(() => {
    if (initialProfile) {
      setMyInfo(prev => ({
        ...prev,
        ageBracket: initialProfile.ageBracket || prev.ageBracket,
        profession: initialProfile.profession || prev.profession,
        interests: initialProfile.interests?.length ? initialProfile.interests : prev.interests,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapSectionRef = useRef(null);
  const searchSheetBodyRef = useRef(null);
  const scanCounter = useRef(0);
  const hasSearchedOnce = useRef(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [mapHighlight, setMapHighlight] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null); // {name, subtitle, lat, lon} — depuis l'API d'adresses

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  }

  function openDetailItinerary(property) {
    const origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : "Ma+position";
    const { lat, lng } = property.mapPin ? pinToLatLng(property.mapPin) : { lat: 5.345, lng: -3.948 };
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  }

  function generateNearbyProperties() {
    return [
      { id: "auto0", title: "Villa 5 pièces", category: "Villa", district: "Riviera 2", transaction: "vente", price: 92000000, beds: 5, baths: 3, area: 290, distance: 0.3, amenities: ["Piscine", "Jardin"], mapPin: { top: 32, left: 52 } },
      { id: "auto1", title: "Appartement 3 pièces", category: "Appartement", district: "Riviera 3", transaction: "location", price: 280000, beds: 3, baths: 2, area: 110, distance: 0.6, amenities: ["Climatisation"], mapPin: { top: 28, left: 44 } },
      { id: "auto2", title: "Studio meublé", category: "Studio", district: "Cocody", transaction: "location", price: 145000, beds: 1, baths: 1, area: 42, distance: 0.9, amenities: ["Meublé", "Climatisation"], mapPin: { top: 18, left: 48 } },
      { id: "auto3", title: "Duplex 4 pièces", category: "Duplex", district: "Riviera Golf", transaction: "vente", price: 68000000, beds: 4, baths: 3, area: 210, distance: 1.1, amenities: ["Garage"], mapPin: { top: 22, left: 60 } },
      { id: "auto4", title: "Maison 4 pièces", category: "Maison", district: "Angré", transaction: "vente", price: 55000000, beds: 4, baths: 2, area: 185, distance: 1.4, amenities: ["Jardin", "Garage"], mapPin: { top: 40, left: 62 } },
    ];
  }

  function recenterOnUser() {
    if (!("geolocation" in navigator)) { showToast("Géolocalisation non disponible"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); showToast("Position recentrée"); },
      () => { setLocating(false); showToast("Impossible d'accéder à votre position"); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function handleUseMyLocationInSearch() {
    setSearchOverlayOpen(false);
    if (!("geolocation" in navigator)) { showToast("Géolocalisation non disponible"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        try {
          // Géocodage inverse réel (OpenStreetMap/Nominatim) pour afficher l'adresse exacte
          const place = await reverseGeocodeCI(latitude, longitude);
          if (place) {
            setSearch(place.name);
            setSelectedPlace({ ...place, lat: latitude, lon: longitude });
            showToast(`Position : ${place.name}`);
          } else {
            setSearch("");
            showToast("Position recentrée");
          }
        } catch {
          setSearch("");
          showToast("Position recentrée");
        } finally {
          setLocating(false);
        }
        setMapHighlight(true);
        setTimeout(() => setMapHighlight(false), 1500);
        scrollToMap();
      },
      () => { setLocating(false); showToast("Impossible d'accéder à votre position"); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function handleSelectPlace(place) {
    setSearch(place.name);
    setSearchOverlayOpen(false);
    setSelectedPlace(place.lat && place.lon ? place : null);
    setMapHighlight(true);
    setTimeout(() => setMapHighlight(false), 1500);
    showToast(`Recherche autour de « ${place.name} »`);
  }

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }, [toast]);

  // Détecte l'arrivée de nouveaux messages (contact annonceur OU code promo
  // partagé par l'administration — voir handleSharePromo côté ImoobilisAdmin.jsx,
  // application désormais détachée) →
  // déclenche la popup de notification avec 2 bips + badge sur l'onglet
  // "Visites". Le contenu de la popup DOIT refléter le type réel du
  // dernier message : un code promo ne doit jamais afficher un texte
  // générique "L'annonceur vous a contacté". La popup elle-même est rendue
  // par DualScreenApp (voir store.clientNotif) pour rester visible même
  // quand cet écran n'est pas l'onglet actif en mode mobile.
  const prevAdvMsgCount = useRef(store.advertiserMessages.length);
  useEffect(() => {
    const curr = store.advertiserMessages.length;
    if (curr > prevAdvMsgCount.current) {
      const newest = store.advertiserMessages[0];
      if (newest?.type === "promo") {
        store.setClientNotif({
          type: "promo",
          messageId: newest.id,
          promoCode: newest.promoCode,
          promoDescription: newest.promoDescription,
        });
      } else {
        store.setClientNotif({
          type: "advertiser_msg",
          propertyTitle: newest?.propertyTitle || "Bien immobilier",
          propertyId: newest?.propertyId,
          advertiserName: newest?.advertiserName || "L'annonceur",
        });
      }
      prevAdvMsgCount.current = curr;
    }
  }, [store.advertiserMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consomme une demande de navigation émise par un clic sur la popup de
  // notification (rendue au niveau de DualScreenApp) : ouvre la fiche du
  // bien, ou le code promo reçu selon le type de notification.
  useEffect(() => {
    if (!store.pendingClientView) return;
    if (store.pendingClientView.promoMessageId) {
      const msg = store.advertiserMessages.find(m => m.id === store.pendingClientView.promoMessageId);
      if (msg) { store.markAdvertiserMessageRead(msg.id); setOpenPromoMessage(msg); }
    } else {
      const prop = properties.find(p => p.id === store.pendingClientView.propertyId);
      if (prop) openDetail(prop);
    }
    store.setPendingClientView(null);
  }, [store.pendingClientView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [search, filters, advanced]);

  // Anime la progression de recherche segment par segment :
  // le 1er segment s'allume, puis le 2e, puis le 3e… jusqu'au 16e (100 %).
  // Chaque segment met un peu plus de temps à s'allumer que le précédent (ralentissement progressif).
  function runScanProgress(targetTotal, onComplete) {
    if (scanIntervalRef.current) clearTimeout(scanIntervalRef.current);
    setScanProgress(0);
    setScanStep(0);
    setScanFoundCount(0);
    setScanDone(false);

    const steps = SCAN_RING_SEGMENTS; // 16 segments
    let i = 0;

    const tick = () => {
      i += 1;
      const pct = i >= steps ? 100 : Math.round((i / steps) * 100);
      const found = Math.min(targetTotal, Math.round((pct / 100) * targetTotal));
      setScanStep(i);
      setScanProgress(pct);
      setScanFoundCount(found);

      if (i >= steps) {
        scanIntervalRef.current = null;
        setScanStep(steps);
        setScanProgress(100);
        setScanFoundCount(targetTotal);
        setScanDone(true);
        if (onComplete) onComplete();
        setTimeout(() => setScanDone(false), 2200);
        return;
      }
      const delay = 240 + i * 28;
      scanIntervalRef.current = setTimeout(tick, delay);
    };

    scanIntervalRef.current = setTimeout(tick, 300);
  }

  useEffect(() => () => { if (scanIntervalRef.current) clearTimeout(scanIntervalRef.current); }, []);

  function matchesFilters(p) {
    // ── Plus de restriction de zone payante : tous les biens sont visibles.
    // L'accès est désormais régulé uniquement par les CPS (carte GPS + contact annonceur).
    const q = search.trim().toLowerCase();
    if (q && !`${p.title} ${p.district} ${p.category}`.toLowerCase().includes(q)) return false;
    if (filters.transaction !== "tous" && p.transaction !== filters.transaction) return false;
    if (filters.categories.size > 0 && !filters.categories.has(p.category)) return false;
    if (filters.minBeds > 0 && (p.beds || 0) < filters.minBeds) return false;
    if (filters.minBaths > 0 && (p.baths || 0) < filters.minBaths) return false;
    if (p.area < advanced.minArea || p.area > advanced.maxArea) return false;
    if (p.distance > advanced.radius) return false;
    for (const a of advanced.amenities) { if (!p.amenities.includes(a)) return false; }
    return true;
  }

  const filtered = properties.filter(matchesFilters);
  // Profil de ciblage du client courant, utilisé pour faire correspondre
  // les campagnes actives (commune de recherche en priorité, sinon commune
  // déduite de "Localisation" ; profession et centres d'intérêt déclarés
  // dans "Mes informations").
  const clientCommuneForBoost = searchCommune || (myInfo.localisation || "").split(",")[0].trim();
  const boostClient = { commune: clientCommuneForBoost, ageBracket: myInfo.ageBracket, profession: myInfo.profession, interests: myInfo.interests || [] };
  const sorted = [...filtered].sort((a, b) => {
    if (advanced.sortBy === "prix-asc") return a.price - b.price;
    if (advanced.sortBy === "prix-desc") return b.price - a.price;
    if (advanced.sortBy === "proche") return a.distance - b.distance;
    // Tri par défaut ("Pertinence") : les annonces avec une campagne de
    // ciblage active remontent en tête, davantage si leur ciblage (commune,
    // âge, profession, intérêts) correspond au profil du client.
    const boostA = computeBoostScore(a.campaign, boostClient);
    const boostB = computeBoostScore(b.campaign, boostClient);
    return boostB - boostA;
  });
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const mapPins = sorted.filter((p) => p.mapPin);

  function toggleFavorite(id) { setFavorites((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleCategoryFilter(cat) { setFilters((prev) => { const next = new Set(prev.categories); if (next.has(cat)) next.delete(cat); else next.add(cat); return { ...prev, categories: next }; }); }
  function toggleAmenityFilter(am) { setAdvanced((prev) => { const next = new Set(prev.amenities); if (next.has(am)) next.delete(am); else next.add(am); return { ...prev, amenities: next }; }); }

  // Réponse à la demande d'activation du GPS affichée à l'ouverture de l'app.
  // "Oui" : dès la position obtenue, les biens à proximité s'affichent
  // automatiquement par défaut (tri "proche"), sans action supplémentaire
  // du client — la recherche manuelle (bouton Scanner) reste disponible
  // ensuite pour découvrir de nouveaux biens.
  // "Non" : l'application se ferme (aucune recherche n'est possible sans position).
  function handleGpsConsent(allow) {
    if (!allow) { setGpsConsent(false); return; }
    setGpsConsent(true);
    setLocating(true);
    // Applique la position obtenue et affiche immédiatement les biens à
    // proximité, triés du plus proche au plus loin — reprend la logique de
    // découverte initiale normalement déclenchée par le bouton Scanner.
    const applyDefaultNearby = (loc) => {
      setUserLocation(loc);
      setLocating(false);
      if (!hasSearchedOnce.current) {
        hasSearchedOnce.current = true;
        const nearby = generateNearbyProperties();
        setProperties((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...nearby.filter((p) => !ids.has(p.id)), ...prev];
        });
        setAdvanced((prev) => ({ ...prev, sortBy: "proche" }));
      }
    };
    const fallback = () => applyDefaultNearby({ lat: 5.345, lng: -3.948 });
    if (!("geolocation" in navigator)) { fallback(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyDefaultNearby({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      fallback,
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  }

  function handleScan() {
    if (scanning) return;
    setScanning(true);
    showToast("Analyse de votre zone en cours…");

    if (!hasSearchedOnce.current) {
      // Première recherche : on découvre les biens proches de la position de l'utilisateur
      hasSearchedOnce.current = true;
      const nearby = generateNearbyProperties();
      const merged = (() => {
        const ids = new Set(properties.map((p) => p.id));
        return [...nearby.filter((p) => !ids.has(p.id)), ...properties];
      })();
      const targetTotal = merged.filter(matchesFilters).length;
      runScanProgress(targetTotal, () => {
        setProperties((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...nearby.filter((p) => !ids.has(p.id)), ...prev]; });
        setAdvanced((prev) => ({ ...prev, sortBy: "proche" }));
        setScanning(false);
        showToast(`${targetTotal} bien${targetTotal > 1 ? "s" : ""} trouvé${targetTotal > 1 ? "s" : ""} près de vous`);
      });
      return;
    }

    scanCounter.current += 1;
    const n = scanCounter.current;
    const newProp = { id: `new${n}`, title: "Villa 4 pièces neuve", category: "Villa", district: "Riviera", transaction: "vente", price: 78000000 + n * 1500000, beds: 4, baths: 3, area: 220 + n * 10, distance: +(0.5 + n * 0.2).toFixed(1), amenities: ["Piscine"], mapPin: { top: 35 + (n % 3) * 4, left: 50 + (n % 4) * 3 } };
    const targetTotal = properties.filter(matchesFilters).length + (matchesFilters(newProp) ? 1 : 0);
    runScanProgress(targetTotal, () => {
      setProperties((prev) => [newProp, ...prev]);
      setAdvanced((prev) => ({ ...prev, sortBy: "proche" }));
      setScanning(false);
      showToast(`${targetTotal} bien${targetTotal > 1 ? "s" : ""} trouvé${targetTotal > 1 ? "s" : ""} près de vous`);
    });
  }

  // ── Lancer la recherche depuis le sheet ──
  function handleSearchLaunch() {
    setSearchSheetOpen(false);
    // Appliquer les filtres sélectionnés dans le formulaire
    setFilters((prev) => ({
      ...prev,
      transaction: searchTransaction,
      categories: searchCategory ? new Set([searchCategory]) : new Set(),
      minBeds: searchMinBeds,
    }));
    setAdvanced((prev) => ({
      ...prev,
      maxArea: searchSuperficie ? Number(searchSuperficie) : 1000,
    }));
    // Toast résumé
    const parts = [];
    if (searchMode === "geo") parts.push(`Rayon ${searchGeoRadius} km`);
    if (searchMode === "commune" && searchCommune) parts.push(searchCommune);
    if (searchMode === "commune" && searchQuartier) parts.push(searchQuartier);
    if (searchTransaction !== "tous") parts.push(searchTransaction === "vente" ? "Vente" : "Location");
    if (searchCategory) parts.push(searchCategory);
    if (searchBudget) parts.push(`≤ ${Number(searchBudget).toLocaleString("fr-FR")} FCFA`);
    showToast(parts.length ? `Recherche : ${parts.join(" · ")}` : "Recherche en cours…");
    // Déclencher le scan après fermeture du sheet
    setTimeout(() => handleScan(), 300);
  }

  const SORT_LABELS = { "prix-asc": "Prix croissant", "prix-desc": "Prix décroissant", "proche": "Plus proche" };

  // Nom de l'alerte = "Catégorie à Commune" (ex. « Villa à Cocody »). Si aucune
  // catégorie/commune n'a encore été choisie, on retombe sur des libellés neutres.
  function buildDraftAlertName() {
    const cat = draftAlertCategory || "Bien";
    const commune = draftAlertCommune || draftAlertPlace?.name || draftAlertSearch.trim() || "Abidjan";
    return `${cat} à ${commune}`;
  }

  function buildDraftAlertCriteriaParts() {
    const parts = [];
    if (draftAlertPlace?.name || draftAlertSearch.trim()) parts.push(draftAlertPlace?.name || draftAlertSearch.trim());
    parts.push(`Rayon ${formatRadiusLabel(draftAlertRadius)}`);
    if (draftAlertTransaction !== "tous") parts.push(draftAlertTransaction === "vente" ? "Vente" : "Location");
    if (draftAlertCategory) parts.push(draftAlertCategory);
    if (draftAlertZone) parts.push(ZONES_COMMUNES[draftAlertZone]?.label || draftAlertZone);
    if (draftAlertCommune) parts.push(draftAlertCommune);
    if (draftAlertBudget) parts.push(`≤ ${Number(draftAlertBudget).toLocaleString("fr-FR")} FCFA`);
    if (draftAlertSuperficie) parts.push(`≤ ${draftAlertSuperficie} m²`);
    return parts;
  }

  // Transforme les champs structurés d'une alerte en lignes (icône + texte) pour
  // un affichage clair dans le module Alertes — une ligne par groupe de critère.
  function getAlertDetailRows(a) {
    const rows = [];
    if (a.location || a.radius != null) {
      const locText = a.location || "Votre position";
      rows.push({ icon: Navigation, text: a.radius != null ? `${locText} · Rayon ${formatRadiusLabel(a.radius)}` : locText });
    }
    const typeParts = [];
    if (a.transaction && a.transaction !== "tous") typeParts.push(a.transaction === "vente" ? "Vente" : "Location");
    if (a.category) typeParts.push(a.category);
    if (typeParts.length) rows.push({ icon: Tag, text: typeParts.join(" · ") });
    const zoneParts = [];
    if (a.zone && ZONES_COMMUNES[a.zone]) zoneParts.push(ZONES_COMMUNES[a.zone].label);
    if (a.commune) zoneParts.push(a.commune);
    if (zoneParts.length) rows.push({ icon: MapPinned, text: zoneParts.join(" · ") });
    if (a.budget) rows.push({ icon: DollarSign, text: `≤ ${a.budget.toLocaleString("fr-FR")} FCFA` });
    if (a.superficie) rows.push({ icon: Maximize2, text: `≤ ${a.superficie} m²` });
    if (rows.length === 0 && a.criteria) rows.push({ icon: Tag, text: a.criteria });
    return rows;
  }

  // Réinitialise puis ouvre l'assistant de création d'alerte à l'étape 1 (localisation)
  function startAlertWizard() {
    setDraftAlertSearch("");
    setDraftAlertPlace(null);
    setDraftAlertRadius(5);
    setDraftAlertTransaction("tous");
    setDraftAlertCategory(null);
    setDraftAlertZone(null);
    setDraftAlertCommune(null);
    setDraftAlertBudget("");
    setDraftAlertSuperficie("");
    setDraftFrequency("Quotidien");
    setAlertWizardStep(2);
    setAlertSheetOpen(false);
    setAlertEditMode(true);
    setSearchOverlayOpen(true);
  }

  // Création d'alerte : coût flat ALERT_CREATE_CP, déduit à la création.
  // Au-delà (modification, activation/désactivation, suppression), aucun
  // frais supplémentaire — seule la création initiale est facturée.
  function handleCreateAlert() {
    if (totalClientCP < ALERT_CREATE_CP) {
      setAlertSheetOpen(false);
      setShowTopUpSheet(true);
      showToast(`CPS insuffisants — il faut ${ALERT_CREATE_CP} CPS pour créer une alerte (solde : ${totalClientCP} CPS)`);
      return;
    }
    deductClientCP(ALERT_CREATE_CP, `Création d'alerte — ${buildDraftAlertName()}`);
    const name = buildDraftAlertName();
    const criteria = buildDraftAlertCriteriaParts().join(" · ");
    const newAlert = {
      id: `a-${Date.now()}`,
      name,
      criteria,
      frequency: draftFrequency,
      active: true,
      // Détail structuré (affiché sous forme de lignes à icônes dans le module Alertes)
      location: draftAlertPlace?.name || draftAlertSearch.trim() || null,
      radius: draftAlertRadius,
      transaction: draftAlertTransaction,
      category: draftAlertCategory,
      zone: draftAlertZone,
      commune: draftAlertCommune,
      budget: draftAlertBudget ? Number(draftAlertBudget) : null,
      superficie: draftAlertSuperficie ? Number(draftAlertSuperficie) : null,
    };
    setAlerts((prev) => [newAlert, ...prev]);
    setAlertSheetOpen(false);
    showToast(`Alerte créée — ${ALERT_CREATE_CP} CPS déduits — vous serez notifié dès qu'un bien correspondant est publié`);
    // Dès qu'un annonceur publie un bien correspondant, l'utilisateur est notifié (ici simulé pour la démo)
    setTimeout(() => simulateAlertMatch(newAlert), 4000);
  }

  function toggleAlertActive(id) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
  }
  function deleteAlert(id) { setAlerts((prev) => prev.filter((a) => a.id !== id)); showToast("Alerte supprimée"); }

  // Joue un signal sonore court (deux notes) pour accompagner une notification (alerte ou message)
  function playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [880, 1318.51].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.15;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.42);
      });
    } catch {
      // Lecture audio indisponible sur cet appareil/navigateur — on ignore silencieusement
    }
  }

  // Double bip — signal distinct (deux bips courts identiques) émis quand un annonceur
  // prend contact avec le client depuis son module "Visites".
  function playDoubleBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [0, 0.38].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 1046.5; // Do6 — bip net, clairement distinct du chime d'alerte
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.30, now + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.25);
      });
    } catch {
      // Audio indisponible — on ignore silencieusement
    }
  }

  // Notifie l'utilisateur qu'un bien publié par un annonceur correspond à son alerte :
  // notification dans l'onglet Alertes + badge + push sonore
  function notifyAlertMatch(alert, property) {
    const note = {
      id: `an-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alertId: alert.id,
      alertName: alert.name,
      propertyId: property.id,
      propertyTitle: property.title,
      read: false,
    };
    setAlertNotifications((prev) => [note, ...prev]);
    setNotifCount((c) => c + 1);
    playNotificationChime();
    showToast(`🔔 Nouveau bien pour « ${alert.name} »`);
  }

  function markAlertNotificationRead(id) {
    setAlertNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  // Envoie la réponse de l'utilisateur au destinataire (l'agent) : ajoutée au fil de discussion,
  // puis l'agent la « reçoit » et y répond à son tour (simulé pour la démo) avec notification + son
  function sendReply(conversationId) {
    const text = replyDraft.trim();
    if (!text) return;
    const userMsg = { id: `u-${Date.now()}`, from: "user", text, time: "À l'instant" };
    setConversations((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] || []), userMsg] }));
    setReplyDraft("");
    setShowReplyBox(false);
    showToast("Message envoyé à l'agent");
    setTimeout(() => simulateAgentReply(conversationId), 3000);
  }

  function simulateAgentReply(conversationId) {
    const agentMsg = {
      id: `a-${Date.now()}`,
      from: "agent",
      text: "Merci pour votre message, je reviens vers vous très vite avec plus de détails.",
      time: "À l'instant",
    };
    setConversations((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] || []), agentMsg] }));
    setNotifCount((c) => c + 1);
    playNotificationChime();
    showToast("Nouvelle réponse de l'agent");
  }

  // Un bien correspond à une alerte si tous les critères renseignés par le
  // client (catégorie, transaction, commune, budget, superficie) sont
  // satisfaits. Un critère laissé vide ("tous", null) n'est pas filtrant.
  function propertyMatchesAlert(property, alert) {
    if (alert.category && property.category !== alert.category) return false;
    if (alert.transaction && alert.transaction !== "tous" && property.transaction !== alert.transaction) return false;
    if (alert.commune) {
      const propCommune = property.commune || property.district || "";
      if (propCommune !== alert.commune && !propCommune.includes(alert.commune)) return false;
    }
    if (alert.budget && property.price > alert.budget) return false;
    if (alert.superficie && property.area && property.area > alert.superficie) return false;
    return true;
  }

  // Démo : simule la publication d'un bien correspondant réellement aux
  // critères de l'alerte (catégorie, commune, transaction, budget…), parmi
  // le catalogue actuel + les biens publiés en direct. S'il n'existe aucun
  // bien correspondant pour l'instant, la notification n'est pas envoyée —
  // mieux vaut ne rien notifier qu'un faux positif hors critères.
  function simulateAlertMatch(alert) {
    if (!alert || alert.active === false) return;
    const candidates = properties.filter((p) => propertyMatchesAlert(p, alert));
    if (candidates.length === 0) {
      showToast(`Aucun bien correspondant à « ${alert.name} » pour le moment`);
      return;
    }
    const property = candidates[Math.floor(Math.random() * candidates.length)];
    notifyAlertMatch(alert, property);
  }

  // Referme l'overlay de localisation sans sélection et revient à l'assistant d'alerte (étape Rayon)
  function returnToAlertSheet() {
    setSearchOverlayOpen(false);
    setAlertEditMode(false);
    setAlertWizardStep(2);
    setAlertSheetOpen(true);
  }

  // Lieu choisi pour l'alerte (étape 1 → 2) : tente de déduire automatiquement
  // la commune/zone correspondante quand des coordonnées sont disponibles.
  function handleSelectAlertPlace(place) {
    setDraftAlertSearch(place.name);
    setDraftAlertPlace(place.lat && place.lon ? place : { name: place.name });
    if (place.lat && place.lon) {
      const commune = detectNearestCommune(place.lat, place.lon);
      if (commune) { setDraftAlertCommune(commune); setDraftAlertZone(detectZoneFromCommune(commune)); }
    }
    setSearchOverlayOpen(false);
    setAlertEditMode(false);
    setAlertWizardStep(2);
    setAlertSheetOpen(true);
    showToast(`Localisation de l'alerte : ${place.name}`);
  }

  // « Votre position » pour l'alerte (étape 1 → 2) : géolocalisation + géocodage inverse réel
  function handleUseMyLocationForAlert() {
    if (!("geolocation" in navigator)) { showToast("Géolocalisation non disponible"); return; }
    setDraftAlertLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const place = await reverseGeocodeCI(latitude, longitude);
          const name = place ? place.name : "Votre position";
          setDraftAlertSearch(name);
          setDraftAlertPlace({ name, lat: latitude, lon: longitude });
          const commune = detectNearestCommune(latitude, longitude);
          if (commune) { setDraftAlertCommune(commune); setDraftAlertZone(detectZoneFromCommune(commune)); }
          showToast(`Position : ${name}`);
        } catch {
          setDraftAlertSearch("Votre position");
          setDraftAlertPlace({ name: "Votre position", lat: latitude, lon: longitude });
        } finally {
          setDraftAlertLocating(false);
          setSearchOverlayOpen(false);
          setAlertEditMode(false);
          setAlertWizardStep(2);
          setAlertSheetOpen(true);
        }
      },
      () => { setDraftAlertLocating(false); showToast("Impossible d'accéder à votre position"); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // Depuis l'étape 2 (Rayon), "Retour" rouvre l'overlay de localisation (étape 1)
  function goBackToAlertLocationStep() {
    setAlertSheetOpen(false);
    setAlertEditMode(true);
    setSearchOverlayOpen(true);
  }

  // Avance à l'étape suivante de l'assistant d'alerte, avec validation minimale
  // (catégorie requise avant l'étape 4, commune requise avant l'étape 5 — toutes
  // deux nécessaires pour composer le nom de l'alerte "Catégorie à Commune").
  function handleAlertWizardNext() {
    if (alertWizardStep === 3 && !draftAlertCategory) { showToast("Choisissez une catégorie de bien"); return; }
    if (alertWizardStep === 4 && !draftAlertCommune) { showToast("Choisissez une commune"); return; }
    setAlertWizardStep((s) => s + 1);
  }

  function scrollToMap() {
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMapHighlight(true);
    setTimeout(() => setMapHighlight(false), 1200);
  }

  // Débloque le forfait carte/POI/street view/trajet pour un bien : accès
  // immédiat et jamais bloquant (pas de vérification de solde à l'ouverture
  // de la fiche). L'offre de bienvenue est consommée en priorité (gratuite,
  // ne s'ajoute pas à l'ardoise) ; sinon, le coût de cette exploration
  // s'ajoute à pendingExplorationCP et ne sera débité qu'au moment où le
  // client contactera effectivement un annonceur (voir contactAdvertiserWithCP).
  function unlockPropertyServicesIfNeeded(property) {
    if (!property) return;
    if (unlockedNearbyServices.has(property.id)) return;
    if (welcomeMapsLeft > 0) {
      setWelcomeState(w => ({ ...w, mapsLeft: Math.max(0, w.mapsLeft - 1) }));
      setUnlockedNearbyServices(prev => new Set(prev).add(property.id));
      // Une exploration couverte par les crédits de bienvenue gratuits
      // compte quand même : une seule exploration, payée ou non, suffit à
      // déclencher la commission Imoobilis (voir COMMISSION_MIN_EXPLORATIONS_THRESHOLD).
      store.incrementPropertyExplorations(property.id);
      return;
    }
    setPendingExplorationCP(prev => prev + computeExplorationCP(property));
    setUnlockedNearbyServices(prev => new Set(prev).add(property.id));
    store.incrementPropertyExplorations(property.id);
  }

  function openDetail(p) {
    setDetailProperty(p);
    setDetailTab("info");
    setShowVisitScheduler(false);
    setShowShare(false);
    setShowContactSheet(false);
    setShowReportSheet(false);
    // Vue réelle, comptabilisée une seule fois par ouverture — sert
    // notamment à montrer à l'annonceur une activité concrète sur ses
    // annonces gratuites (argument tangible pour passer en payant).
    if (p?.id) store.incrementPropertyViews(p.id);
    // Forfait unique carte/POI/trajet — voir PROPERTY_SERVICES_BUNDLE_CP.
    unlockPropertyServicesIfNeeded(p);
  }

  // Constantes pour l'anneau circulaire segmenté de la barre de progression de recherche
  const SCAN_RING_RADIUS = 45;
  const SCAN_RING_CIRCUMFERENCE = 2 * Math.PI * SCAN_RING_RADIUS;
  const SCAN_RING_SLOT = SCAN_RING_CIRCUMFERENCE / SCAN_RING_SEGMENTS;
  const SCAN_RING_DASH = SCAN_RING_SLOT * 0.62;
  const SCAN_RING_GAP = SCAN_RING_SLOT * 0.38;

  const favoriteProperties = properties.filter((p) => favorites.has(p.id));
  const hasActiveFilters = filters.categories.size > 0 || filters.transaction !== "tous" || filters.minBeds > 0 || filters.minBaths > 0;
  const unreadAlertCount = alertNotifications.filter((n) => !n.read).length;

  const DETAIL_TABS = [
    { key: "info", label: "Détails" },
    { key: "services", label: "Proximité" },
  ];

  // ── Étape 1 : demande d'activation du GPS, affichée à l'ouverture de l'app ──
  if (gpsConsent === null) {
    return (
      <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col relative border-x border-slate-200 font-sans items-center justify-center px-6">
        <div className="w-full bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 text-center">
          <div className="w-16 h-16 mx-auto bg-green-50 rounded-full flex items-center justify-center mb-4">
            <LocateFixed size={28} className="text-green-700" />
          </div>
          <h2 className="font-extrabold text-slate-800 text-[17px] mb-2">Veuillez activer votre position GPS</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            Imoobilis a besoin de votre position pour vous proposer les biens les plus proches de chez vous.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleGpsConsent(false)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-slate-600 font-semibold text-[14px]"
            >
              Non
            </button>
            <button
              onClick={() => handleGpsConsent(true)}
              className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold text-[14px]"
            >
              Oui
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 2 (si refus) : l'application se ferme ──
  if (gpsConsent === false) {
    return (
      <div className="w-full max-w-[430px] mx-auto h-full bg-slate-900 shadow-xl overflow-hidden flex flex-col items-center justify-center relative border-x border-slate-200 font-sans px-6 text-center">
        <button
          onClick={onLogout}
          aria-label="Fermer et revenir à la connexion"
          className="w-16 h-16 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center mb-4 transition-colors"
        >
          <X size={28} className="text-white" />
        </button>
        <h2 className="font-extrabold text-white text-[16px] mb-2">Application fermée</h2>
        <p className="text-[13px] text-slate-400 leading-relaxed mb-1">
          La position GPS est nécessaire pour utiliser Imoobilis. L'application a été fermée.
        </p>
        <p className="text-[12px] text-slate-500">Touchez la croix pour revenir à l'écran de connexion.</p>
      </div>
    );
  }

  // Compte suspendu par l'équipe Imoobilis (voir module Clients de
  // l'administration) — bloque tout accès jusqu'à réactivation.
  if (clientSuspended) {
    return (
      <div className="w-full max-w-[430px] mx-auto h-full bg-slate-900 shadow-xl overflow-hidden flex flex-col items-center justify-center relative border-x border-slate-200 font-sans px-6 text-center">
        <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4">
          <Lock size={28} className="text-rose-400" />
        </div>
        <h2 className="font-extrabold text-white text-[16px] mb-2">Compte suspendu</h2>
        <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
          Votre compte a été temporairement suspendu par l'équipe Imoobilis. Contactez le support pour en savoir plus.
        </p>
        <button onClick={onLogout} className="bg-white/10 text-white font-semibold text-[13px] px-5 py-2.5 rounded-xl">
          Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto h-full bg-white shadow-xl overflow-hidden flex flex-col relative border-x border-slate-200 font-sans">
      {/* status bar — horloge réelle + icône de localisation à droite,
          affichée uniquement quand la position GPS réelle de l'appareil
          est effectivement obtenue (userLocation, voir handleGpsConsent /
          navigator.geolocation.getCurrentPosition) : aucune icône factice. */}
      <div className="flex items-center justify-end gap-1.5 px-5 pt-3 pb-1 text-[13px] font-semibold text-slate-900 flex-shrink-0">
        {userLocation && (
          <LocateFixed size={14} className="text-green-600" aria-label="Position GPS active" />
        )}
        <LiveClock />
      </div>

      {/* header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0 relative">
        <button onClick={() => setActiveTab("explorer")}>
          <img src={LOGO_SRC} alt="Imoobilis" className="h-9 w-auto object-contain" />
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => { setNotifOpen((o) => !o); setNotifCount(0); }} className="relative p-1.5 text-slate-700">
            <MessageCircle size={23} />
            {(notifCount + store.advertiserMessages.filter((m) => !m.read).length) > 0 && (
              <span className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {notifCount + store.advertiserMessages.filter((m) => !m.read).length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab("favoris")} className="relative p-1.5 text-slate-700">
            <Heart size={22} className={favorites.size > 0 ? "fill-rose-500 text-rose-500" : ""} />
            {favorites.size > 0 && (
              <span className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {favorites.size}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1.5 -mr-1.5">
          <button
            onClick={() => { setPendingPurchase(null); setShowTopUpSheet(true); }}
            className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] font-bold px-2 py-1 rounded-full border border-amber-200"
          >
            <span className="text-[10px]">🪙</span>{totalClientCP.toLocaleString("fr-FR")} CPS
          </button>
        </div>
        {notifOpen && (
          <div className="absolute top-full right-2 mt-1 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 z-40 max-h-80 overflow-y-auto">
            <p className="text-xs font-bold text-slate-700 px-2 py-1">Notifications</p>
            {store.advertiserMessages.map((m) => (
              <button
                key={m.id}
                onClick={() => { setNotifOpen(false); if (m.type === "promo") { store.markAdvertiserMessageRead(m.id); setOpenPromoMessage(m); } else { openAdvertiserMessage(m); } }}
                className="w-full text-left flex items-start gap-2 px-2 py-2 border-t border-gray-50"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.read ? "bg-transparent" : "bg-orange-500"}`}></span>
                {m.type === "promo" ? (
                  <span className="text-[11px] text-slate-600 leading-snug">
                    🎁 <strong>Imoobilis</strong> vous offre un code promo : <strong>{m.promoCode}</strong>
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-600 leading-snug">
                    <strong>{m.advertiserName}</strong> vous a contacté au sujet de « {m.propertyTitle} »
                  </span>
                )}
              </button>
            ))}
            {alertNotifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  markAlertNotificationRead(n.id);
                  setNotifOpen(false);
                  const p = ALL_PROPERTIES.find((pr) => pr.id === n.propertyId);
                  if (p) openDetail(p);
                }}
                className="w-full text-left flex items-start gap-2 px-2 py-2 border-t border-gray-50"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.read ? "bg-transparent" : "bg-orange-500"}`}></span>
                <span className="text-[11px] text-slate-600 leading-snug">Nouveau bien correspond à l'alerte « {n.alertName} » — {n.propertyTitle}</span>
              </button>
            ))}
            {INBOX_NOTIFICATIONS.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setNotifOpen(false);
                  if (n.type === "message") {
                    setShowReplyBox(false);
                    setReplyDraft("");
                    setOpenMessage(n);
                  } else {
                    const p = ALL_PROPERTIES.find((pr) => pr.id === n.propertyId);
                    if (p) openDetail(p);
                  }
                }}
                className="w-full text-left flex items-start gap-2 px-2 py-2 border-t border-gray-50"
              >
                <span className="text-[11px] text-slate-600 leading-snug">{n.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* main scroll area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "explorer" && (
          <>
            {/* ── Bandeau défilant unique (noir) ── */}
            {!searchSheetOpen && !alertSheetOpen && !searchOverlayOpen && <TickerBanner adminBannerConfig={adminBannerConfig} welcomeMapsLeft={welcomeMapsLeft} welcomeValid={welcomeValid} />}

            <div className="px-4 pt-3 pb-3 space-y-2">
              <div className="flex items-stretch gap-2">
                <button onClick={() => setSearchSheetOpen(true)} className="flex-1 flex items-center justify-center gap-2 bg-green-700 rounded-xl py-3 text-[13px] font-semibold text-white whitespace-nowrap">
                  <Radar size={17} />
                  Lancer la recherche
                </button>
                <button onClick={startAlertWizard} className="flex-1 flex items-center justify-center gap-1.5 bg-orange-500 rounded-xl py-3 text-[13px] font-semibold text-white whitespace-nowrap">
                  <BellPlus size={15} />Créer Alerte
                </button>
              </div>

            </div>

            <div ref={mapSectionRef} style={searchSheetOpen ? { visibility: "hidden" } : {}}>
              {/* La carte et l'aperçu des pins sont désormais gratuits — seule
                  l'ouverture de la fiche complète d'un bien (openDetail)
                  déclenche le forfait unique (voir PROPERTY_SERVICES_BUNDLE_CP). */}
              <GoogleMapWithPins
                      pins={mapPins} activePin={activePin}
                      onPinClick={(p) => setActivePin(activePin === p.id ? null : p.id)}
                      onMapClick={() => setActivePin(null)}
                      scanning={scanning} locating={locating} userLocation={userLocation}
                      sorted={sorted} onRecenter={recenterOnUser} onZoom={() => {}}
                      mapHighlight={mapHighlight}
                      onViewDetail={(p) => { openDetail(p); setActivePin(null); }}
                    />
            </div>

            <div className="flex items-center justify-between px-4 mt-4">
              <h2 className="font-extrabold text-slate-800 text-[15px]">Biens à proximité</h2>
              <button onClick={scrollToMap} className="text-green-700 text-[12px] font-semibold flex items-center gap-0.5">Voir sur la carte<ChevronRight size={14} /></button>
            </div>
            <div className="px-4 mt-2 space-y-2.5 pb-3">
              {pageItems.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Aucun bien ne correspond à votre recherche.</div>}
              {pageItems.map((p) => <PropertyCard key={p.id} p={p} isFav={favorites.has(p.id)} onToggleFav={toggleFavorite} onOpen={openDetail} isReported={reportedPropertyIds.has(p.id)} />)}
            </div>
            <div className="flex items-center justify-center gap-1.5 px-4 pb-6 flex-wrap">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-400 disabled:opacity-50 flex items-center gap-1"><ChevronLeft size={13} />Précédent</button>
              {paginationItems(totalPages, currentPage).map((it, idx) =>
                it === "…" ? <span key={idx} className="text-gray-400 text-[12px] px-1">…</span>
                : <button key={idx} onClick={() => setPage(it)} className={`w-8 h-8 rounded-lg text-[12px] font-semibold ${it === currentPage ? "bg-green-700 text-white" : "border border-gray-200 text-slate-600"}`}>{it}</button>
              )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-slate-600 disabled:opacity-50 flex items-center gap-1">Suivant<ChevronRight size={13} /></button>
            </div>
          </>
        )}

        {activeTab === "alertes" && (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-800 text-[16px]">Mes alertes</h2>
              <button onClick={startAlertWizard} className="bg-orange-500 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"><BellPlus size={13} />Créer</button>
            </div>
            <p className="text-[11px] text-gray-400 -mt-2 flex items-center gap-1">
              <span className="text-[12px]">🪙</span>
              {ALERT_CREATE_CP} CPS à la création, surveillance illimitée ensuite — {alerts.filter((a) => a.active).length} alerte{alerts.filter((a) => a.active).length > 1 ? "s" : ""} active{alerts.filter((a) => a.active).length > 1 ? "s" : ""}
            </p>

            {alertNotifications.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Alertes reçues</p>
                {alertNotifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markAlertNotificationRead(n.id);
                      const p = ALL_PROPERTIES.find((pr) => pr.id === n.propertyId);
                      if (p) openDetail(p);
                    }}
                    className={`w-full text-left flex items-center gap-3 rounded-2xl p-3 border ${n.read ? "bg-white border-gray-100" : "bg-orange-50 border-orange-200"}`}
                  >
                    <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <BellPlus size={16} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800 truncate">{n.propertyTitle}</p>
                      <p className="text-[11px] text-gray-500 truncate">Correspond à « {n.alertName} »</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></span>}
                  </button>
                ))}
              </div>
            )}

            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Alertes créées</p>
            {alerts.length === 0 && <div className="text-center text-gray-400 text-sm py-10">Aucune alerte pour le moment.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[13px] text-slate-800">{a.name}</p>
                    <div className="mt-1.5 space-y-1">
                      {getAlertDetailRows(a).map((row, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          <row.icon size={12} className="text-gray-400 flex-shrink-0" />{row.text}
                        </p>
                      ))}
                    </div>
                    <p className="flex items-center gap-1 text-[10px] text-green-700 font-semibold mt-1.5"><Bell size={11} />Fréquence : {a.frequency}</p>
                  </div>
                  <button onClick={() => toggleAlertActive(a.id)} className="flex-shrink-0">
                    {a.active ? <ToggleRight size={26} className="text-green-700" /> : <ToggleLeft size={26} className="text-gray-300" />}
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => deleteAlert(a.id)} className="text-[11px] text-rose-500 font-semibold flex items-center gap-1"><Trash2 size={12} />Supprimer</button>
                  <button onClick={() => simulateAlertMatch(a)} className="text-[11px] text-green-700 font-semibold flex items-center gap-1 ml-auto"><Bell size={12} />Simuler une publication</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "visites" && (
          <div className="px-4 py-4 space-y-2.5">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Mes visites</h2>
            <p className="text-[12px] text-gray-400 -mt-2 mb-3">Les annonceurs qui vous ont contacté apparaissent ici.</p>

            {store.advertiserMessages.filter(m => m.type === "promo").length > 0 && (
              <div className="space-y-2 mb-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-0.5">Offres Imoobilis</p>
                {store.advertiserMessages.filter(m => m.type === "promo").map(m => (
                  <button key={m.id} onClick={() => { store.markAdvertiserMessageRead(m.id); setOpenPromoMessage(m); }}
                    className={`w-full text-left flex items-center gap-3 rounded-2xl p-3 border ${m.read ? "bg-white border-gray-100" : "bg-amber-50 border-amber-200"}`}>
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-[17px]">🎁</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800">Code promo Imoobilis</p>
                      <p className="text-[11px] text-gray-500 truncate">{m.promoCode} — {m.promoDescription}</p>
                    </div>
                    {!m.read && <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0"/>}
                  </button>
                ))}
              </div>
            )}

            {store.advertiserMessages.filter(m => m.type !== "promo").length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center gap-2">
                <Phone size={32} className="text-gray-200" />
                <p>Aucun annonceur ne vous a encore contacté.</p>
                <p className="text-[11px] text-gray-300 mt-0.5">Programmez une visite — l'annonceur vous contactera ici.</p>
                <button onClick={() => setActiveTab("explorer")} className="mt-3 bg-green-700 text-white text-[12px] font-semibold px-4 py-2 rounded-full">Explorer les biens</button>
              </div>
            ) : (
              <div className="space-y-3">
                {store.advertiserMessages.filter(m => m.type !== "promo").map((m) => {
                  const prop = properties.find((p) => p.id === m.propertyId);
                  const seed = m.propertyId ? ((m.propertyId.charCodeAt(0) || 1) + (m.propertyId.charCodeAt(1) || 2)) : 1;
                  const cat = prop?.category || "Villa";
                  return (
                    <div key={m.id}
                      className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer active:bg-orange-50 transition-colors ${m.read ? "bg-white border-gray-100" : "bg-orange-50 border-orange-200"}`}
                      onClick={() => { openAdvertiserMessage(m); store.markAdvertiserMessageRead(m.id); }}
                    >
                      {/* Vignette du bien — cliquable pour ouvrir le détail */}
                      <div
                        className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (prop) openDetail(prop);
                        }}
                      >
                        <PropertyImage category={cat} seed={seed} className="w-full h-full" />
                        {!m.read && (
                          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-orange-500 rounded-full border border-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Titre de l'annonce — cliquable */}
                        <button
                          className="text-left w-full"
                          onClick={(e) => { e.stopPropagation(); if (prop) openDetail(prop); }}
                        >
                          <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{m.propertyTitle}</p>
                        </button>
                        <p className="text-[11px] text-orange-600 font-semibold mt-0.5 flex items-center gap-1">
                          <Phone size={11} />{m.advertiserName} vous a contacté
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{m.time}</p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "favoris" && (
          <div className="px-4 py-4 space-y-2.5">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Mes favoris</h2>
            {favoriteProperties.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center gap-2">
                <Heart size={32} className="text-gray-200" />
                <p>Vous n'avez pas encore de favoris.</p>
                <button onClick={() => setActiveTab("explorer")} className="mt-2 bg-green-700 text-white text-[12px] font-semibold px-4 py-2 rounded-full">Explorer les biens</button>
              </div>
            ) : favoriteProperties.map((p) => <PropertyCard key={p.id} p={p} isFav={true} onToggleFav={toggleFavorite} onOpen={openDetail} isReported={reportedPropertyIds.has(p.id)} />)}
          </div>
        )}

        {activeTab === "programme" && (
          <div className="px-4 py-4 space-y-2.5">
            <h2 className="font-extrabold text-slate-800 text-[16px] mb-1">Programme de visites</h2>
            <p className="text-[12px] text-gray-400 -mt-2 mb-2">Vos rendez-vous de visite programmés.</p>
            {bookedVisits.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center gap-2">
                <CalendarDays size={32} className="text-gray-200" />
                <p>Vous n'avez pas encore de visite programmée.</p>
                <button onClick={() => setActiveTab("explorer")} className="mt-2 bg-green-700 text-white text-[12px] font-semibold px-4 py-2 rounded-full">Explorer les biens</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {bookedVisits.map((v, i) => {
                  const prop = properties.find((p) => p.id === v.propertyId);
                  const seed = v.propertyId ? ((v.propertyId.charCodeAt(0) || 1) + (v.propertyId.charCodeAt(1) || 2)) : 1;
                  return (
                    <div key={i}
                      className="flex items-center gap-3 bg-white rounded-2xl border border-green-100 p-3 shadow-sm cursor-pointer active:bg-green-50"
                      onClick={() => setEditingVisitIndex(i)}
                    >
                      <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 relative">
                        {prop
                          ? <PropertyImage category={prop.category} seed={seed} className="w-full h-full" />
                          : <div className="w-full h-full bg-green-100 flex items-center justify-center"><CalendarDays size={18} className="text-green-500" /></div>
                        }
                        <span className="absolute bottom-0.5 right-0.5 bg-green-700 rounded-full p-0.5">
                          <CalendarDays size={8} className="text-white" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-bold text-slate-800 truncate">{v.propertyTitle}</p>
                        <p className="text-[11px] text-green-700 font-semibold mt-0.5">
                          📅 {v.day.label} {v.day.day} {v.day.month} à {v.time}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {v.type === "presentiel" ? "🏠 En présentiel" : "📱 Visite virtuelle"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-orange-500 font-semibold flex items-center gap-0.5"><Edit2 size={10} />Modifier</span>
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "profil" && (
          <div className="px-4 py-5">
            {/* En-tête du compte */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-green-700 text-white flex items-center justify-center font-bold text-lg">KY</div>
              <div className="min-w-0">
                <p className="font-extrabold text-slate-800 text-[15px]">{myInfo.prenom} {myInfo.nom}</p>
                <p className="text-[11px] text-gray-500">{myInfo.email}</p>
              </div>
              {totalClientCP > 0 && (
                <span className="ml-auto flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                  🪙 {totalClientCP} CPS
                </span>
              )}
            </div>

            {/* Statistiques d'activité du client (recherche de biens) */}
            {/* Offre bienvenue dans Mon compte */}
            {welcomeValid && (
              <div className={`mt-3 rounded-2xl px-4 py-3 border ${welcomeMapsLeft > 0 ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>🎁</span>
                  <p className={`text-[12px] font-extrabold ${welcomeMapsLeft > 0 ? "text-green-700" : "text-gray-400"}`}>
                    Offre de bienvenue — 1 mois
                  </p>
                  <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${welcomeMapsLeft > 0 ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-400"}`}>
                    {welcomeMapsLeft > 0 ? "Actif" : "Épuisé"}
                  </span>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className={`font-extrabold text-[18px] ${welcomeMapsLeft > 0 ? "text-green-700" : "text-gray-300"}`}>{welcomeMapsLeft}</p>
                    <p className="text-[10px] text-gray-400">🗺 Cartes restantes</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Non cumulable · Valable 30 jours dès la création du compte</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={() => setActiveTab("favoris")} className="bg-white rounded-xl border border-gray-100 py-3 text-center">
                <p className="font-extrabold text-green-700 text-[16px]">{favorites.size}</p>
                <p className="text-[10px] text-gray-500">Favoris</p>
              </button>
              <button onClick={() => setActiveTab("alertes")} className="bg-white rounded-xl border border-gray-100 py-3 text-center">
                <p className="font-extrabold text-green-700 text-[16px]">{alerts.length}</p>
                <p className="text-[10px] text-gray-500">Alertes</p>
              </button>
              <button onClick={() => setActiveTab("visites")} className="bg-white rounded-xl border border-gray-100 py-3 text-center">
                <p className="font-extrabold text-green-700 text-[16px]">{bookedVisits.length}</p>
                <p className="text-[10px] text-gray-500">Visites</p>
              </button>
            </div>

            {/* ── Carte Portefeuille & CPS (solde Imoobilis) ──
                Système 100% CPS : pas d'abonnement zonal ni de durée
                d'activation. Le rechargement Mobile Money crédite
                automatiquement le compte CPS. Les CPS servent à payer
                deux actions à l'usage : ouvrir un pin sur la carte GPS
                et contacter un annonceur. */}
            <div className="mt-4 rounded-2xl p-4 border bg-white border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-400 font-semibold">Solde Imoobilis</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[18px]">🪙</span>
                    <span className="text-[22px] font-extrabold text-amber-700">{totalClientCP.toLocaleString("fr-FR")}</span>
                    <span className="text-[13px] font-bold text-gray-400">CPS</span>
                  </div>
                  {clientCpBonus > 0 && (
                    <p className="text-[10px] text-orange-500 font-bold mt-0.5">dont {clientCpBonus} CPS bonus</p>
                  )}
                  {pendingExplorationCP > 0 && (
                    <p className="text-[10px] text-amber-600 font-bold mt-0.5">🧾 {pendingExplorationCP} CPS d'explorations en attente — réglés au prochain contact</p>
                  )}
                  <p className="text-[9px] text-gray-400 mt-0.5">Les CPS servent à ouvrir la carte et contacter les annonceurs</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => { setPendingPurchase(null); setShowTopUpSheet(true); }}
                    className="bg-green-700 text-white text-[12px] font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5"
                  >
                    <Plus size={14} />Recharger
                  </button>
                  <button
                    onClick={() => setShowPromoSheet(true)}
                    className="text-orange-600 text-[11px] font-bold px-4 py-1 rounded-xl flex items-center gap-1"
                  >
                    🎁 Code promo
                  </button>
                </div>
              </div>
            </div>

            {clientCpTransactions.length > 0 && (
              <div className="mt-4 rounded-2xl p-4 bg-white border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Dernières opérations CPS</p>
                  <button onClick={() => setShowCpHistorySheet(true)} className="text-[10px] font-bold text-green-700">Voir tout</button>
                </div>
                <div className="space-y-2">
                  {clientCpTransactions.slice(0, 3).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between text-[11px] gap-2">
                      <div className="min-w-0">
                        <p className="text-gray-500 truncate">{tx.label}</p>
                        <p className="text-[9px] text-gray-400">{formatTxDateTime(tx.date)}</p>
                      </div>
                      <span className={`font-bold flex-shrink-0 ${tx.type === "credit" || tx.type === "refund" ? "text-green-700" : "text-amber-600"}`}>
                        {tx.type === "credit" || tx.type === "refund" ? "+" : "-"}{tx.cp} CPS
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Réglages du compte — uniquement ce qui concerne un client en
                recherche de bien (pas d'espace "Mes annonces", l'utilisateur
                ne publie pas ; pas de "Notifications", déjà gérées via
                l'onglet Alertes et le panneau de messages dans l'en-tête). */}
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              <button onClick={() => setShowMyInfoSheet(true)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-[13px] text-slate-700">Mes informations</span>
                <ChevronRight size={15} className="text-gray-300" />
              </button>
              <button onClick={() => setShowSecuritySheet(true)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-[13px] text-slate-700">Sécurité</span>
                <ChevronRight size={15} className="text-gray-300" />
              </button>
              <button onClick={() => setShowHelpSheet(true)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-[13px] text-slate-700">Aide & support</span>
                <ChevronRight size={15} className="text-gray-300" />
              </button>
              <button onClick={() => showToast("Fonctionnalité à venir")} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-[13px] text-slate-700">Conditions d'utilisation</span>
                <ChevronRight size={15} className="text-gray-300" />
              </button>
            </div>
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 mt-4 text-rose-500 font-semibold text-[13px] py-2.5">
              <LogOut size={15} /> Se déconnecter
            </button>

            {showMyInfoSheet && (
              <MyInfoSheet
                info={myInfo}
                onSave={(updated) => { setMyInfo(updated); setShowMyInfoSheet(false); showToast("Informations mises à jour !"); }}
                onClose={() => setShowMyInfoSheet(false)}
              />
            )}
            {showCpHistorySheet && (
              <CpHistorySheet
                transactions={clientCpTransactions}
                onClose={() => setShowCpHistorySheet(false)}
              />
            )}
            {showSecuritySheet && (
              <SecuritySheet
                onSave={() => { setShowSecuritySheet(false); showToast("Mot de passe modifié !"); }}
                onClose={() => setShowSecuritySheet(false)}
              />
            )}
            {showHelpSheet && (
              <HelpSupportSheet onClose={() => setShowHelpSheet(false)} />
            )}
          </div>
        )}
      </div>

      {/* bottom nav */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white flex items-stretch">
        {NAV_ITEMS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          const unreadAdvMsg = store.advertiserMessages.filter((m) => !m.read).length;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5">
              <span className="relative">
                <Icon size={20} className={active ? "text-green-700" : "text-gray-400"} />
                {tab.key === "alertes" && unreadAlertCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-orange-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{unreadAlertCount}</span>
                )}
                {tab.key === "visites" && unreadAdvMsg > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-orange-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{unreadAdvMsg}</span>
                )}
                {tab.key === "programme" && bookedVisits.length > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-green-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{bookedVisits.length}</span>
                )}
              </span>
              <span className={`text-[10px] font-semibold ${active ? "text-green-700" : "text-gray-400"}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[12px] font-medium px-4 py-2 rounded-full shadow-xl z-[999] whitespace-nowrap">{toast}</div>
      )}

      {/* ── Éditeur de modification de visite (module Programme) ──
          Accessible uniquement depuis l'onglet "Programme" en cliquant sur
          le billet d'une visite existante. Ne déclenche aucune nouvelle
          facturation — la visite a déjà été payée lors de la 1ère programmation. */}
      {editingVisitIndex !== null && (() => {
        const visit = bookedVisits[editingVisitIndex];
        const prop = visit ? properties.find((p) => p.id === visit.propertyId) : null;
        const advertiserSchedule = prop?.advertiserPhone ? store?.visitSchedules?.[prop.advertiserPhone] : null;
        if (!visit) { setEditingVisitIndex(null); return null; }
        // Créneaux déjà pris par d'AUTRES clients sur ce même bien — on
        // exclut la visite en cours de modification elle-même (son propre
        // créneau actuel ne doit pas s'afficher comme "pris").
        const bookedSlots = store.visitRequests
          .filter(v => v.propertyId === visit.propertyId)
          .filter(v => !(v.clientPhone === visit.phone && v.day?.iso === visit.day?.iso && v.time === visit.time))
          .map(v => ({ day: v.day?.iso, time: v.time }));
        return (
          <div className="absolute inset-0 z-[200] flex flex-col justify-end" style={{ zIndex: 200 }} onClick={() => setEditingVisitIndex(null)}>
            <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl overflow-y-auto" style={{ maxHeight: "85%" }} onClick={(e) => e.stopPropagation()}>
              <VisitScheduler
                  property={prop || { id: visit.propertyId, title: visit.propertyTitle, district: "" }}
                  advertiserSchedule={advertiserSchedule}
                  bookedSlots={bookedSlots}
                  defaultName={visit.name || `${myInfo.prenom} ${myInfo.nom}`.trim()}
                  defaultPhone={visit.phone || myInfo.contact}
                  editMode={true}
                  existingVisit={visit}
                  onClose={() => setEditingVisitIndex(null)}
                  onConfirm={(updatedVisit) => {
                    // Mise à jour de la visite sans facturation
                    setBookedVisits(prev => prev.map((v, idx) =>
                      idx === editingVisitIndex
                        ? { ...v, day: updatedVisit.day, time: updatedVisit.time, type: updatedVisit.type }
                        : v
                    ));
                    // Mettre à jour la demande côté annonceur dans le store
                    if (prop?.advertiserPhone) {
                      store.updateVisitRequest(visit.propertyId, {
                        day: updatedVisit.day,
                        time: updatedVisit.time,
                        type: updatedVisit.type,
                      });
                    }
                    showToast("Visite mise à jour !");
                    setTimeout(() => setEditingVisitIndex(null), 2000);
                  }}
                />
            </div>
          </div>
        );
      })()}

      {/* Rechargement Mobile Money (accessible depuis n'importe quel onglet) */}
      {showTopUpSheet && (
        <TopUpSheet
          pendingAmount={pendingContactProperty
            ? (computeContactCP(pendingContactProperty) + pendingExplorationCP) * 100
            : (pendingPurchase?.plan?.price ?? null)}
          pendingLabel={pendingContactProperty
            ? (pendingExplorationCP > 0
                ? `il faut régler vos explorations en cours (${pendingExplorationCP} CPS) + le contact de « ${pendingContactProperty.title} » (${computeContactCP(pendingContactProperty)} CPS)`
                : `il faut ${computeContactCP(pendingContactProperty)} CPS pour contacter l'annonceur de « ${pendingContactProperty.title} »`)
            : null}
          onClose={() => { setShowTopUpSheet(false); setPendingPurchase(null); setPendingContactProperty(null); }}
          onConfirm={(amount) => topUpWallet(amount)}
          onBackToPlan={pendingPurchase ? () => {
            setShowTopUpSheet(false);
            setPendingPurchase(null);
            setPendingContactProperty(null);
            setShowContactSheet(false);
            setActiveTab("profil");
            if (pendingPurchase.source === "location" && pendingPurchase.plan?.zone) {
              setSelectedPlanZone(pendingPurchase.plan.zone);
            }
          } : null}
        />
      )}

      {showPromoSheet && (
        <PromoCodeSheet
          onClose={() => setShowPromoSheet(false)}
          onRedeem={(code) => { handleRedeemPromo(code); setShowPromoSheet(false); }}
        />
      )}

      {openPromoMessage && (
        <PromoMessageSheet
          message={openPromoMessage}
          onClose={() => setOpenPromoMessage(null)}
          onCopy={async (code) => {
            const ok = await copyToClipboard(code);
            showToast(ok ? "Code copié !" : "Copie impossible ici — sélectionnez le code et copiez-le manuellement");
          }}
          onUseNow={(code) => { handleRedeemPromo(code); setOpenPromoMessage(null); }}
        />
      )}

      {/* location search overlay (full screen) — réutilisé tel quel comme étape 1 de l'assistant d'alerte */}
      {searchOverlayOpen && (
        <LocationSearchOverlay
          value={alertEditMode ? draftAlertSearch : search}
          onChange={alertEditMode ? setDraftAlertSearch : setSearch}
          onClose={() => (alertEditMode ? returnToAlertSheet() : setSearchOverlayOpen(false))}
          onSelectPlace={alertEditMode ? handleSelectAlertPlace : handleSelectPlace}
          onUseMyLocation={alertEditMode ? handleUseMyLocationForAlert : handleUseMyLocationInSearch}
          locating={alertEditMode ? draftAlertLocating : locating}
          alertEditMode={alertEditMode}
        />
      )}

      {/* drawer */}
      {/* filter sheet */}
      {filterSheetOpen && (
        <div className="absolute inset-0 z-[100] flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setFilterSheetOpen(false)}></div>
 <div className="bg-white rounded-t-3xl p-4 overflow-y-auto" style={{ maxHeight: "80%" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-slate-800 text-[15px]">Filtres</h3>
              <button onClick={() => setFilterSheetOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Transaction</p>
            <div className="flex gap-2 mb-4">
              {["tous", "vente", "location"].map((t) => (
                <button key={t} onClick={() => setFilters((f) => ({ ...f, transaction: t }))} className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border ${filters.transaction === t ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {t === "tous" ? "Tous" : t === "vente" ? "Vente" : "Location"}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Type de bien</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.keys(CATEGORY_META).map((cat) => (
                <button key={cat} onClick={() => toggleCategoryFilter(cat)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${filters.categories.has(cat) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>{cat}</button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Chambres minimum</p>
            <div className="flex gap-2 mb-5">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setFilters((f) => ({ ...f, minBeds: n }))} className={`w-9 h-9 rounded-full text-[12px] font-semibold border ${filters.minBeds === n ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {n === 0 ? "Tous" : n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Salle d'eau</p>
            <div className="flex gap-2 mb-5">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setFilters((f) => ({ ...f, minBaths: n }))} className={`w-9 h-9 rounded-full text-[12px] font-semibold border ${filters.minBaths === n ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {n === 0 ? "Tous" : n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFilters({ transaction: "tous", categories: new Set(), minBeds: 0, minBaths: 0 })} className="flex-1 py-3 rounded-xl border border-gray-200 text-slate-600 font-semibold text-[13px]">Réinitialiser</button>
              <button onClick={() => setFilterSheetOpen(false)} className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold text-[13px]">Appliquer</button>
            </div>
          </div>
        </div>
      )}

      {/* advanced sheet */}
      {advancedSheetOpen && (
        <div className="absolute inset-0 z-[100] flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setAdvancedSheetOpen(false)}></div>
 <div className="bg-white rounded-t-3xl p-4 overflow-y-auto" style={{ maxHeight: "85%" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-slate-800 text-[15px]">Recherche avancée</h3>
              <button onClick={() => setAdvancedSheetOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Surface (m²)</p>
            <div className="flex items-center gap-2 mb-4">
              <input type="number" value={advanced.minArea || ""} onChange={(e) => setAdvanced((a) => ({ ...a, minArea: +e.target.value || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-normal" placeholder="Min" />
              <span className="text-gray-400">—</span>
              <input type="number" value={advanced.maxArea === 1000 ? "" : advanced.maxArea} onChange={(e) => setAdvanced((a) => ({ ...a, maxArea: +e.target.value || 0 }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-normal" placeholder="Max" />
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Rayon de recherche : <span className="font-normal text-gray-500">{formatRadiusLabel(advanced.radius)}</span></p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {RADIUS_BANDS.map((band) => (
                <button
                  key={band.id}
                  onClick={() => setAdvanced((a) => ({ ...a, radius: band.max }))}
                  className={`px-3 py-2.5 rounded-xl text-[12px] font-normal border text-center transition-colors ${
                    advanced.radius === band.max
                      ? "bg-green-700 text-white border-green-700"
                      : "border-gray-200 text-slate-600"
                  }`}
                >
                  {band.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Équipements</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {AMENITY_POOL.map((am) => (
                <button key={am} onClick={() => toggleAmenityFilter(am)} className={`px-3 py-1.5 rounded-full text-[12px] font-normal border flex items-center gap-1 ${advanced.amenities.has(am) ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                  {advanced.amenities.has(am) && <Check size={11} />}{am}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 mb-2">Trier par</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {[["pertinence", "Pertinence"], ["prix-asc", "Prix croissant"], ["prix-desc", "Prix décroissant"], ["proche", "Plus proche"]].map(([val, label]) => (
                <button key={val} onClick={() => setAdvanced((a) => ({ ...a, sortBy: val }))} className={`px-3 py-1.5 rounded-full text-[12px] font-normal border ${advanced.sortBy === val ? "bg-green-800 text-white border-green-800" : "border-gray-200 text-slate-600"}`}>{label}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdvanced({ minArea: 0, maxArea: 1000, radius: 10, amenities: new Set(), sortBy: "pertinence" })} className="flex-1 py-3 rounded-xl border border-gray-200 text-slate-600 font-semibold text-[13px]">Réinitialiser</button>
              <button onClick={() => setAdvancedSheetOpen(false)} className="flex-1 py-3 rounded-xl bg-green-800 text-white font-semibold text-[13px]">Appliquer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sheet "Lancer la recherche" ── */}
      {searchSheetOpen && (
        <div className="absolute inset-0 z-[150] flex flex-col justify-end" style={{ isolation: "isolate" }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setSearchSheetOpen(false)} />
          <div className="relative rounded-t-3xl flex flex-col overflow-hidden" style={{ maxHeight: "85%", zIndex: 1, backgroundColor: "#ffffff" }}>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-extrabold text-slate-800 text-[16px] flex items-center gap-2">
                  <Radar size={18} className="text-green-700" /> Lancer la recherche
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Définissez vos critères pour trouver le bien idéal</p>
              </div>
              <button onClick={() => setSearchSheetOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="px-5 mb-4 flex-shrink-0">
              <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
                <button
                  onClick={() => { setSearchMode("geo"); if (searchSheetBodyRef.current) searchSheetBodyRef.current.scrollTop = 0; }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all ${searchMode === "geo" ? "bg-green-700 text-white shadow-sm" : "text-slate-500"}`}
                >
                  <LocateFixed size={14} />Géolocalisation
                </button>
                <button
                  onClick={() => { setSearchMode("commune"); if (searchSheetBodyRef.current) searchSheetBodyRef.current.scrollTop = 0; }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all ${searchMode === "commune" ? "bg-orange-500 text-white shadow-sm" : "text-slate-500"}`}
                >
                  <MapPinned size={14} />Par commune
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div ref={searchSheetBodyRef} className="overflow-y-auto flex-1 px-5 pb-6 space-y-5">

              {/* ── Mode Géolocalisation ── */}
              {searchMode === "geo" && (
                <div className="space-y-3">
                  {/* Champ adresse */}
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-700 mb-2 uppercase tracking-wide">Localisation</p>
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      {/* Barre de recherche adresse */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                        <Search size={16} className="text-gray-400 flex-shrink-0" />
                        <input
                          value={searchGeoSearch}
                          onChange={(e) => { setSearchGeoSearch(e.target.value); setSearchGeoPlace(null); setSearchGeoShowList(true); }}
                          onFocus={() => setSearchGeoShowList(true)}
                          placeholder="Ville, quartier, adresse…"
                          className="flex-1 bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-gray-400"
                        />
                        {searchGeoSearch ? (
                          <button onClick={() => { setSearchGeoSearch(""); setSearchGeoPlace(null); setSearchGeoShowList(false); }}>
                            <X size={14} className="text-gray-400" />
                          </button>
                        ) : null}
                      </div>

                      {/* Suggestions adresse */}
                      {searchGeoShowList && (() => {
                        const q = searchGeoSearch.trim().toLowerCase();
                        const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const qn = norm(q);
                        const suggestions = q.length === 0
                          ? [...ABIDJAN_PLACES].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 6)
                          : ADDRESS_SUGGESTIONS.filter(s => norm(s.name).includes(qn) || norm(s.subtitle).includes(qn)).slice(0, 8);
                        return (
                          <>
                            {/* Votre position — toujours en tête de liste */}
                            <button
                              onClick={() => {
                                setSearchGeoLocating(true);
                                navigator.geolocation?.getCurrentPosition(
                                  ({ coords }) => {
                                    setSearchGeoLocating(false);
                                    setSearchGeoSearch("Votre position");
                                    setSearchGeoPlace({ name: "Votre position", lat: coords.latitude, lon: coords.longitude });
                                    setSearchGeoShowList(false);
                                  },
                                  () => { setSearchGeoLocating(false); showToast("Impossible d'accéder à votre position"); }
                                );
                              }}
                              className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 text-left"
                            >
                              <Navigation size={17} className="text-slate-700 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-bold text-slate-800 text-[13px]">Votre position</p>
                                <p className="text-[11px] text-gray-400 leading-snug">
                                  {searchGeoLocating ? "Localisation en cours…" : "Prise en charge à l'emplacement indiqué par les données GPS"}
                                </p>
                              </div>
                            </button>
                            {suggestions.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => {
                                  setSearchGeoSearch(r.name);
                                  setSearchGeoPlace(r);
                                  setSearchGeoShowList(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left"
                              >
                                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <MapPin size={14} className="text-slate-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-medium text-slate-800 truncate">{r.name}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{r.subtitle}</p>
                                </div>
                                {r.distanceKm !== undefined && (
                                  <span className="text-[11px] text-gray-400 flex-shrink-0">{r.distanceKm < 1 ? `${Math.round(r.distanceKm * 1000)} m` : `${r.distanceKm.toFixed(1)} km`}</span>
                                )}
                              </button>
                            ))}
                          </>
                        );
                      })()}

                      {/* Lieu sélectionné */}
                      {searchGeoPlace && !searchGeoShowList && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50">
                          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                          <span className="text-[12px] font-semibold text-green-800">{searchGeoPlace.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rayon */}
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-800">
                        <LocateFixed size={14} />
                        <span className="text-[12px] font-bold">Rayon de recherche</span>
                      </div>
                      <span className="text-[13px] font-extrabold text-green-700">{searchGeoRadius === 0 ? "< 500 m" : `${searchGeoRadius} km`}</span>
                    </div>
                    <input
                      type="range" min={0} max={20} step={0.5}
                      value={searchGeoRadius}
                      onChange={(e) => setSearchGeoRadius(+e.target.value)}
                      className="w-full accent-green-700"
                    />
                    <div className="flex justify-between text-[10px] text-green-600 font-medium">
                      <span>500 m</span><span>10 km</span><span>20 km</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Mode Par commune ── */}
              {searchMode === "commune" && (
                <div className="space-y-4">
                  {/* Zone */}
                  <div>
                    <p className="text-[11px] font-extrabold text-orange-600 mb-2 uppercase tracking-wide">Zone géographique</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(ZONES_COMMUNES).map(([key, z]) => (
                        <button
                          key={key}
                          onClick={() => {
                            if (searchZone === key) { setSearchZone(null); setSearchCommune(null); setSearchQuartier(null); return; }
                            setSearchZone(key);
                            setSearchCommune(null);
                            setSearchQuartier(null);
                          }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold border text-left transition-all ${searchZone === key ? "bg-orange-500 text-white border-orange-500" : "border-orange-100 text-slate-600 bg-orange-50"}`}
                        >
                          <MapPinned size={13} className="flex-shrink-0" />{z.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Commune */}
                  {searchZone && (
                    <div>
                      <p className="text-[11px] font-extrabold text-orange-600 mb-2 uppercase tracking-wide">Commune</p>
                      <div className="flex flex-wrap gap-2">
                        {ZONES_COMMUNES[searchZone].communes.map((c) => (
                          <button
                            key={c}
                            onClick={() => { setSearchCommune(c === searchCommune ? null : c); setSearchQuartier(null); }}
                            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${searchCommune === c ? "bg-orange-500 text-white border-orange-500" : "border-orange-200 text-orange-700 bg-orange-50"}`}
                          >{c}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quartier */}
                  {searchCommune && DISTRICTS_BY_COMMUNE[searchCommune] && (
                    <div>
                      <p className="text-[11px] font-extrabold text-orange-600 mb-2 uppercase tracking-wide">Quartier</p>
                      <div className="flex flex-wrap gap-2">
                        {DISTRICTS_BY_COMMUNE[searchCommune].map((q) => (
                          <button
                            key={q}
                            onClick={() => setSearchQuartier(q === searchQuartier ? null : q)}
                            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${searchQuartier === q ? "bg-orange-500 text-white border-orange-500" : "border-orange-200 text-orange-700 bg-orange-50"}`}
                          >{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Séparateur ── */}
              <div className="h-px bg-gray-100" />

              {/* ── Transaction ── */}
              <div>
                <p className={`text-[11px] font-extrabold mb-2 uppercase tracking-wide ${searchMode === "commune" ? "text-orange-600" : "text-slate-700"}`}>Type de transaction</p>
                <div className="flex gap-2">
                  {[["tous", "Tous"], ["vente", "Vente"], ["location", "Location"]].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSearchTransaction(val)}
                      className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-all ${
                        searchTransaction === val
                          ? searchMode === "commune"
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-green-700 text-white border-green-700"
                          : "border-gray-200 text-slate-600 bg-white"
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* ── Catégorie ── */}
              <div>
                <p className="text-[11px] font-extrabold text-slate-700 mb-2 uppercase tracking-wide">Catégorie de bien</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(CATEGORY_META).map((cat) => {
                    const Icon = CATEGORY_META[cat].icon;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSearchCategory(searchCategory === cat ? null : cat)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${searchCategory === cat ? (searchMode === "commune" ? "bg-orange-500 text-white border-orange-500" : "bg-green-700 text-white border-green-700") : "border-gray-200 text-slate-600 bg-white"}`}
                      >
                        <Icon size={12} />{cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Chambres minimum ── */}
              <div>
                <p className={`text-[11px] font-extrabold mb-2 uppercase tracking-wide ${searchMode === "geo" ? "text-green-700" : "text-slate-700"}`}>Chambres minimum</p>
                <div className="flex gap-2">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSearchMinBeds(n)}
                      className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${searchMinBeds === n ? searchMode === "commune" ? "bg-orange-500 text-white border-orange-500" : "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600 bg-white"}`}
                    >{n === 0 ? "Tous" : `${n}+`}</button>
                  ))}
                </div>
              </div>

              {/* ── Budget & Superficie ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-extrabold text-slate-700 mb-1.5 uppercase tracking-wide">Budget max (FCFA)</p>
                  <div className="relative">
                    <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      value={searchBudget}
                      onChange={(e) => setSearchBudget(e.target.value)}
                      placeholder="Ex. 50 000 000"
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-[12px] outline-none focus:border-green-600 bg-white"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-slate-700 mb-1.5 uppercase tracking-wide">Superficie max (m²)</p>
                  <div className="relative">
                    <Maximize2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      value={searchSuperficie}
                      onChange={(e) => setSearchSuperficie(e.target.value)}
                      placeholder="Ex. 300"
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-[12px] outline-none focus:border-green-600 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* ── Récap tags ── */}
              {(searchMode === "commune" ? [searchZone && ZONES_COMMUNES[searchZone]?.label, searchCommune, searchQuartier] : [`Rayon ${searchGeoRadius} km`])
                .concat([
                  searchTransaction !== "tous" && (searchTransaction === "vente" ? "Vente" : "Location"),
                  searchCategory,
                  searchMinBeds > 0 && `${searchMinBeds}+ chambre${searchMinBeds > 1 ? "s" : ""}`,
                  searchBudget && `≤ ${Number(searchBudget).toLocaleString("fr-FR")} FCFA`,
                  searchSuperficie && `≤ ${searchSuperficie} m²`,
                ])
                .filter(Boolean).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wide">Critères sélectionnés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(searchMode === "commune"
                      ? [searchZone && ZONES_COMMUNES[searchZone]?.label, searchCommune, searchQuartier]
                      : [`Rayon ${searchGeoRadius} km`]
                    ).concat([
                      searchTransaction !== "tous" && (searchTransaction === "vente" ? "Vente" : "Location"),
                      searchCategory,
                      searchMinBeds > 0 && `${searchMinBeds}+ chambre${searchMinBeds > 1 ? "s" : ""}`,
                      searchBudget && `≤ ${Number(searchBudget).toLocaleString("fr-FR")} FCFA`,
                      searchSuperficie && `≤ ${searchSuperficie} m²`,
                    ]).filter(Boolean).map((tag, i) => (
                      <span key={i} className="text-[11px] bg-orange-50 text-orange-700 border border-orange-100 rounded-full px-2.5 py-1 font-semibold">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
              <button
                onClick={() => {
                  setSearchMode("geo"); setSearchGeoRadius(5); setSearchTransaction("tous");
                  setSearchCategory(null); setSearchZone(null); setSearchCommune(null);
                  setSearchQuartier(null); setSearchBudget(""); setSearchSuperficie(""); setSearchMinBeds(0);
                }}
                className="flex-none px-4 py-3 rounded-xl border border-gray-200 text-slate-500 font-semibold text-[12px]"
              >
                Réinitialiser
              </button>
              <button
                onClick={handleSearchLaunch}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[14px] shadow-sm text-white transition-all ${searchMode === "commune" ? "bg-orange-500" : "bg-green-700"}`}
              >
                <Radar size={16} />Lancer la recherche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* alert sheet — assistant en plusieurs étapes (étape 1 = overlay de localisation, géré séparément) */}
      {alertSheetOpen && (
        <div className="absolute inset-0 z-[150] flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setAlertSheetOpen(false)}></div>
 <div className="bg-white rounded-t-3xl p-4 overflow-y-auto" style={{ maxHeight: "70%" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-extrabold text-slate-800 text-[15px]">
                  {alertWizardStep === 2 && "Rayon du bien"}
                  {alertWizardStep === 3 && "Type de transaction"}
                  {alertWizardStep === 4 && "Zone & commune"}
                  {alertWizardStep === 5 && "Récapitulatif"}
                  {alertWizardStep === 6 && "Fréquence de notification"}
                </h3>
                <p className="text-[10px] text-gray-400 font-semibold">Étape {alertWizardStep - 1} sur 5</p>
              </div>
              <button onClick={() => setAlertSheetOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex gap-1 mb-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i <= alertWizardStep - 2 ? "bg-orange-500" : "bg-gray-100"}`} />
              ))}
            </div>

            {/* Étape 2 — Rayon du bien */}
            {alertWizardStep === 2 && (
              <>
                <p className="text-[11px] text-gray-500 mb-3">
                  Autour de <span className="font-bold text-slate-700">{draftAlertPlace?.name || draftAlertSearch || "votre position"}</span>
                </p>
                <p className="text-[11px] font-bold text-slate-700 mb-2">
                  Rayon : <span className="font-normal text-gray-500">{formatRadiusLabel(draftAlertRadius)}</span>
                </p>
                <input
                  type="range" min={0} max={10} step={0.5}
                  value={draftAlertRadius}
                  onChange={(e) => setDraftAlertRadius(+e.target.value)}
                  className="w-full mb-1 accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mb-3">
                  <span>0 km</span><span>10 km</span>
                </div>
              </>
            )}

            {/* Étape 3 — Type de transaction (+ catégorie, nécessaire au nom de l'alerte) */}
            {alertWizardStep === 3 && (
              <>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Transaction</p>
                <div className="flex gap-2 mb-4">
                  {["tous", "vente", "location"].map((t) => (
                    <button key={t} onClick={() => setDraftAlertTransaction(t)} className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border ${draftAlertTransaction === t ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>
                      {t === "tous" ? "Tous" : t === "vente" ? "Vente" : "Location"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Catégorie du bien</p>
                <div className="flex flex-wrap gap-2 mb-1">
                  {Object.keys(CATEGORY_META).map((cat) => (
                    <button key={cat} onClick={() => setDraftAlertCategory(cat)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${draftAlertCategory === cat ? "bg-green-700 text-white border-green-700" : "border-gray-200 text-slate-600"}`}>{cat}</button>
                  ))}
                </div>
              </>
            )}

            {/* Étape 4 — Zones (clic sur une zone → affiche ses communes) */}
            {alertWizardStep === 4 && (
              <>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Zone géographique</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {Object.entries(ZONES_COMMUNES).map(([key, z]) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (draftAlertZone === key) { setDraftAlertZone(null); return; }
                        setDraftAlertZone(key);
                        if (!z.communes.includes(draftAlertCommune)) setDraftAlertCommune(null);
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold border text-left ${draftAlertZone === key ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}
                    >
                      <MapPinned size={14} className="flex-shrink-0" />{z.label}
                    </button>
                  ))}
                </div>
                {draftAlertZone ? (
                  <>
                    <p className="text-[11px] font-bold text-slate-700 mb-2">Commune</p>
                    <div className="flex flex-wrap gap-2 mb-1">
                      {ZONES_COMMUNES[draftAlertZone].communes.map((c) => (
                        <button key={c} onClick={() => setDraftAlertCommune(c)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${draftAlertCommune === c ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>{c}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 mb-1">Choisissez une zone pour afficher ses communes.</p>
                )}
              </>
            )}

            {/* Étape 5 — Récapitulatif : nom auto ("Catégorie à Commune") + budget + superficie */}
            {alertWizardStep === 5 && (
              <>
                <p className="text-[11px] font-bold text-slate-700 mb-1">Nom de l'alerte</p>
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
                  <BellPlus size={15} className="text-green-700 flex-shrink-0" />
                  <span className="text-[14px] font-bold text-green-800">{buildDraftAlertName()}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-700 mb-1">Budget maximum (FCFA)</p>
                <input type="number" value={draftAlertBudget} onChange={(e) => setDraftAlertBudget(e.target.value)} placeholder="Ex. 50 000 000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] mb-4" />
                <p className="text-[11px] font-bold text-slate-700 mb-1">Superficie maximum (m²)</p>
                <input type="number" value={draftAlertSuperficie} onChange={(e) => setDraftAlertSuperficie(e.target.value)} placeholder="Ex. 300" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] mb-1" />
              </>
            )}

            {/* Étape 6 — Fréquence de notification + récap des critères */}
            {alertWizardStep === 6 && (
              <>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Fréquence de notification</p>
                <div className="flex gap-2 mb-4">
                  {["Quotidien", "Hebdomadaire", "Instantané"].map((f) => (
                    <button key={f} onClick={() => setDraftFrequency(f)} className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border ${draftFrequency === f ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-slate-600"}`}>{f}</button>
                  ))}
                </div>
                <p className="text-[11px] font-bold text-slate-700 mb-2">Récapitulatif</p>
                <div className="flex flex-wrap gap-1.5 bg-green-50 rounded-xl px-3 py-2.5 mb-1">
                  {buildDraftAlertCriteriaParts().map((part, i) => (
                    <span key={i} className="text-[11px] text-green-800 bg-white border border-green-200 rounded-full px-2 py-1 font-semibold">{part}</span>
                  ))}
                </div>

                {/* Coût CPS de création — flat, payé une seule fois à l'activation */}
                <div className={`mt-3 rounded-xl p-3 border flex items-center justify-between gap-2 ${totalClientCP >= ALERT_CREATE_CP ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[16px]">🪙</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-700">Coût d'activation</p>
                      <p className="text-[9px] text-gray-400">Frais unique — surveillance illimitée ensuite</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-[13px] font-extrabold ${totalClientCP >= ALERT_CREATE_CP ? "text-amber-700" : "text-rose-600"}`}>{ALERT_CREATE_CP} CPS</p>
                    {totalClientCP < ALERT_CREATE_CP && <p className="text-[9px] text-rose-500 font-semibold">Solde insuffisant ({totalClientCP} CPS)</p>}
                  </div>
                </div>

                {/* Rechargement sans perdre la progression du formulaire d'alerte */}
                {totalClientCP < ALERT_CREATE_CP && (
                  <button
                    onClick={() => setShowTopUpSheet(true)}
                    className="w-full flex items-center gap-2.5 bg-rose-500 text-white rounded-xl px-3 py-2.5 mt-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Plus size={14} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[12px] font-bold">Recharger mon compte</p>
                      <p className="text-[9px] text-rose-100">Vos critères d'alerte restent enregistrés</p>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                )}
              </>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => (alertWizardStep === 2 ? goBackToAlertLocationStep() : setAlertWizardStep((s) => s - 1))}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-slate-600 font-semibold text-[13px]"
              >
                Retour
              </button>
              {alertWizardStep < 6 ? (
                <button onClick={handleAlertWizardNext} className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-semibold text-[13px]">Suivant</button>
              ) : (
                <button onClick={handleCreateAlert} disabled={totalClientCP < ALERT_CREATE_CP}
                  className={`flex-1 py-3 rounded-xl font-semibold text-[13px] ${totalClientCP >= ALERT_CREATE_CP ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {totalClientCP >= ALERT_CREATE_CP ? `Enregistrer l'alerte (${ALERT_CREATE_CP} CPS)` : "🪙 Solde CPS insuffisant"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* message detail sheet — ouvre le contenu du message au clic dans le panneau de notifications */}
      {openMessage && (
        <div className="absolute inset-0 z-[150] flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => { setOpenMessage(null); setShowReplyBox(false); }}></div>
 <div className="bg-white rounded-t-3xl p-4 flex flex-col" style={{ maxHeight: "85%" }}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="font-extrabold text-slate-800 text-[15px]">Message</h3>
              <button onClick={() => { setOpenMessage(null); setShowReplyBox(false); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex items-center gap-3 mb-3 flex-shrink-0">
              <div className="w-11 h-11 rounded-full bg-green-700 text-white flex items-center justify-center font-bold text-[14px] flex-shrink-0">
                {openMessage.agentName.split(" ").map((w) => w[0]).join("")}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[13px] text-slate-800 truncate">{openMessage.agentName}</p>
                <p className="text-[11px] text-gray-500 truncate">{openMessage.agentRole}</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 font-semibold mb-2 flex-shrink-0">À propos de : {openMessage.propertyTitle}</p>

            <div className="overflow-y-auto mb-3 space-y-2 pr-0.5">
              {(conversations[openMessage.id] || []).map((m) => (
                <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${m.from === "user" ? "bg-green-700 text-white rounded-br-sm" : "bg-gray-50 text-slate-700 rounded-bl-sm"}`}>
                    <p className="text-[13px] leading-relaxed">{m.text}</p>
                    <p className={`text-[9px] mt-1 ${m.from === "user" ? "text-green-100" : "text-gray-400"}`}>{m.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-shrink-0">
              {showReplyBox ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendReply(openMessage.id); }}
                    placeholder="Écrivez votre réponse…"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none"
                  />
                  <button
                    onClick={() => sendReply(openMessage.id)}
                    disabled={!replyDraft.trim()}
                    className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-green-700 disabled:bg-gray-200 rounded-xl text-white"
                  >
                    <Send size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const p = ALL_PROPERTIES.find((pr) => pr.id === openMessage.propertyId);
                      setOpenMessage(null);
                      if (p) openDetail(p);
                    }}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-slate-600 font-semibold text-[13px]"
                  >
                    Voir le bien
                  </button>
                  <button
                    onClick={() => setShowReplyBox(true)}
                    className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold text-[13px]"
                  >
                    Répondre
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ENHANCED DETAIL SHEET ────────────────────────────────── */}
      {detailProperty && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => { setDetailProperty(null); setShowVisitScheduler(false); setShowShare(false); setShowContactSheet(false); setShowReportSheet(false); }}></div>

          {/* single scrollable sheet — everything scrolls together */}
          {/* Masqué (display:none) tant qu'une sous-fiche (signalement, contact,
              partage, visite) est ouverte : sur certains WebView Android, un
              élément `sticky` (ex. la barre Détails/Proximité) peut se
              retrouver composité au-dessus d'un overlay même avec un z-index
              plus élevé. Le rendu complet est donc coupé pour éviter tout
              résidu visuel, plutôt que de compter uniquement sur le z-index. */}
          <div
            className={`bg-white rounded-t-3xl overflow-y-auto ${(showReportSheet || showContactSheet || showVisitScheduler || showShare || showTerrainBoundary) ? "hidden" : ""}`}
            style={{ maxHeight: "85%", WebkitOverflowScrolling: "touch" }}
          >

            {/* sticky close + drag handle */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm pt-2 pb-1 px-4 flex items-center justify-between rounded-t-3xl">
              <div className="mx-auto w-10 h-1 bg-gray-200 rounded-full absolute left-1/2 -translate-x-1/2 top-2" />
              <div className="w-8" />
              <button onClick={() => { setDetailProperty(null); setShowVisitScheduler(false); setShowContactSheet(false); setShowReportSheet(false); }}
                className="ml-auto bg-slate-100 rounded-full p-1.5 mt-1">
                <X size={16} className="text-slate-600" />
              </button>
            </div>

            {/* Property image gallery — swipe or tap the arrows to browse photos */}
            <div className="relative h-44 mx-4 rounded-2xl overflow-hidden">
              <PropertyImageGallery key={detailProperty.id} property={detailProperty} className={`w-full h-full ${detailProperty.isSuspended ? "opacity-50" : ""}`} />
              <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full text-white pointer-events-none ${detailProperty.transaction === "vente" ? "bg-green-700" : "bg-orange-500"}`}>
                {detailProperty.transaction === "vente" ? "À vendre" : "À louer"}
              </span>
              {detailProperty.isSuspended ? (
                <span className="absolute top-3 right-3 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-full pointer-events-none">
                  ⛔ Suspendu
                </span>
              ) : (
                <div className="absolute bottom-3 left-3 bg-white/95 rounded-full px-2.5 py-1 flex items-center gap-1 shadow pointer-events-none">
                  <Star size={11} className="text-amber-400 fill-amber-400" />
                  <span className="text-[11px] font-bold text-slate-800">8.4/10</span>
                </div>
              )}
            </div>

            {/* Title & price */}
            <div className="px-4 pt-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-extrabold text-slate-800 text-[17px] leading-tight">{detailProperty.title}</h2>
                    {detailProperty.isSuspended && (
                      <span className="bg-rose-100 text-rose-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                        ⛔ Suspendu
                      </span>
                    )}
                    {isCampaignActive(detailProperty.campaign) && (
                      <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
                        <Rocket size={8}/>Sponsorisé
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                    <p className="text-[12px] text-gray-500 truncate">{detailProperty.district}, Abidjan</p>
                    <span className="text-gray-300">·</span>
                    <span className="text-green-700 font-bold text-[12px]">{formatDistance(detailProperty.distance)} km</span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-semibold tracking-wide mt-0.5">Réf. {getPropertyReference(detailProperty)}</p>
                </div>
                <button onClick={() => toggleFavorite(detailProperty.id)} className="flex-shrink-0 mt-0.5">
                  <Heart size={22} className={favorites.has(detailProperty.id) ? "fill-rose-500 text-rose-500" : "text-gray-300"} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className={`text-[20px] font-extrabold ${detailProperty.transaction === "vente" ? "text-green-700" : "text-orange-500"}`}>{formatPrice(detailProperty)}</p>
                <button onClick={() => openDetailItinerary(detailProperty)} aria-label="Itinéraire vers ce bien"
                  className="flex-shrink-0 bg-green-700 text-white rounded-full p-2.5 shadow-md">
                  <Navigation size={18} />
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mt-3">
                {detailProperty.isSuspended ? (
                  <button disabled
                    className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 rounded-xl py-3.5 font-semibold text-[14px] whitespace-nowrap cursor-not-allowed">
                    <Phone size={15} />Bien suspendu — indisponible
                  </button>
                ) : reportedPropertyIds.has(detailProperty.id) ? (
                  <button disabled title="Contact désactivé — ce bien a été signalé et est en cours de vérification"
                    className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 rounded-xl py-3.5 font-semibold text-[14px] whitespace-nowrap cursor-not-allowed">
                    <Phone size={15} />Bien signalé — contact désactivé
                  </button>
                ) : (
                  <button onClick={() => { if (contactAdvertiserWithCP(detailProperty)) setShowContactSheet(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 text-white rounded-xl py-3.5 font-semibold text-[14px] whitespace-nowrap">
                    <Phone size={15} />Contacter l'annonceur
                    {!unlockedContacts.has(detailProperty.id) && (
                      <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5 text-[11px] font-bold flex-shrink-0">
                        🪙 {computeContactCP(detailProperty) + pendingExplorationCP} CPS
                      </span>
                    )}
                  </button>
                )}
                <button onClick={() => setShowShare(true)}
                  className="w-11 flex items-center justify-center border border-gray-200 text-slate-700 rounded-xl">
                  <Share2 size={14} />
                </button>
                <button
                  onClick={() => { if (!reportedPropertyIds.has(detailProperty.id)) setShowReportSheet(true); }}
                  disabled={reportedPropertyIds.has(detailProperty.id)}
                  title={reportedPropertyIds.has(detailProperty.id) ? "Déjà signalé" : "Signaler ce bien"}
                  className={`w-11 flex items-center justify-center rounded-xl ${reportedPropertyIds.has(detailProperty.id) ? "border border-rose-200 text-rose-400 bg-rose-50" : "bg-rose-600 text-white shadow-sm shadow-rose-600/30"}`}
                >
                  {reportedPropertyIds.has(detailProperty.id) ? <CheckCircle2 size={14} /> : <AlertTriangle size={15} />}
                </button>
              </div>

              {/* Bien suspendu : aperçu limité — l'annonceur n'ayant pas
                  confirmé sa disponibilité, les infos ci-dessous peuvent ne
                  plus être à jour. On l'indique clairement plutôt que de
                  masquer la fiche entièrement, pour rester transparent. */}
              {detailProperty.isSuspended && (
                <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                  <span className="text-[14px] mt-0.5">🔍</span>
                  <p className="text-[11px] text-rose-700 leading-snug">
                    <span className="font-bold">Aperçu limité</span> — cette annonce est suspendue en attendant confirmation de l'annonceur. Les informations affichées peuvent ne plus être à jour ; le contact et les services sont désactivés.
                  </p>
                </div>
              )}
            </div>

            {/* sticky tab bar */}
            <div className="sticky top-10 z-10 bg-white px-4 pt-3 pb-2">
              <div className="flex bg-slate-100 rounded-full p-1 gap-1">
                {DETAIL_TABS.map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)}
                    className={`flex-1 py-2 rounded-full text-[14px] font-bold transition-all ${detailTab === t.key ? "bg-white text-green-700 shadow-sm" : "text-slate-600"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* tab content — NOT its own scroll, flows naturally in the sheet */}
            <div className="px-4 pt-4 pb-10">

              {/* INFO TAB */}
              {detailTab === "info" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-[13px] text-slate-600 border border-gray-100 rounded-2xl py-3 px-4">
                    {detailProperty.beds != null && <span className="flex items-center gap-1.5"><BedDouble size={16} />{detailProperty.beds} ch.</span>}
                    {detailProperty.baths != null && <span className="flex items-center gap-1.5"><Bath size={16} />{detailProperty.baths} sdb</span>}
                    <span className="flex items-center gap-1.5"><Maximize2 size={16} />{detailProperty.area} m²</span>
                  </div>

                  {/* Extrait topographique — uniquement affiché si l'annonceur
                      a renseigné au moins 3 bornes GPS valides (voir
                      PropertyFormSheet / handleAdd). Superficie certifiée
                      calculée à partir du polygone réel, distincte de la
                      surface déclarée ci-dessus qui peut être approximative. */}
                  {detailProperty.category === "Terrain" && (detailProperty.topoPoints?.length || 0) >= 3 && (
                    <button onClick={() => setShowTerrainBoundary(true)}
                      className="w-full flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-3 text-left">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[16px]">📐</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-emerald-800">Superficie topographique certifiée : {(detailProperty.topoAreaM2 ?? detailProperty.area).toLocaleString("fr-FR")} m²</p>
                        <p className="text-[10.5px] text-emerald-600">Voir les limites exactes du terrain sur la carte</p>
                      </div>
                      <ChevronRight size={16} className="text-emerald-500 flex-shrink-0"/>
                    </button>
                  )}

                  <div className="flex gap-2">
                    {(() => { const { car, walk } = getTravelTimes(detailProperty.distance); return (
                      <>
                        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <Car size={15} className="text-slate-500 flex-shrink-0" />
                          <div>
                            <p className="text-[11px] text-slate-400">En voiture</p>
                            <p className="text-[13px] font-normal text-slate-600">{car}</p>
                          </div>
                        </div>
                        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          <Footprints size={15} className="text-slate-500 flex-shrink-0" />
                          <div>
                            <p className="text-[11px] text-slate-400">À pied</p>
                            <p className="text-[13px] font-normal text-slate-600">{walk}</p>
                          </div>
                        </div>
                      </>
                    ); })()}
                  </div>

                  {/* Street View 360° — inclus, désactivé sur les biens suspendus (aperçu limité) */}
                  {detailProperty.isSuspended ? (
                    <div className="w-full flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-3 opacity-60">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0"><Lock size={14} className="text-slate-400"/></div>
                      <div className="flex-1 text-left">
                        <p className="text-[12.5px] font-bold text-slate-400">Vue immersive 360°</p>
                        <p className="text-[10px] text-slate-400">Indisponible — annonce suspendue</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const { lat, lng } = detailProperty.mapPin ? pinToLatLng(detailProperty.mapPin) : { lat: 5.345, lng: -3.948 };
                        window.open(`https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}`, "_blank");
                      }}
                      className="w-full flex items-center gap-3 bg-slate-800 text-white rounded-xl px-3.5 py-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0"><Navigation size={15}/></div>
                      <div className="flex-1 text-left">
                        <p className="text-[12.5px] font-bold">Vue immersive 360°</p>
                        <p className="text-[10px] text-white/60">Découvrez la rue avant de vous déplacer</p>
                      </div>
                      <span className="text-[9px] font-bold bg-white/15 px-1.5 py-0.5 rounded-full">Inclus</span>
                    </button>
                  )}

                  {/* Vidéo aérienne 3D — premium, biens de prestige uniquement, masquée en aperçu suspendu */}
                  {isAerialViewEligible(detailProperty) && !detailProperty.isSuspended && (
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-3.5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0"><Sparkles size={15} className="text-amber-600"/></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-bold text-slate-800">Vidéo aérienne 3D</p>
                          <p className="text-[10px] text-slate-500">Survol cinématique du bien et du quartier</p>
                        </div>
                      </div>
                      {unlockedAerialViews.has(detailProperty.id) ? (
                        <div className="mt-2.5 rounded-lg bg-slate-900 aspect-video flex items-center justify-center">
                          <p className="text-white/70 text-[11px] flex items-center gap-1.5"><CheckCircle2 size={13} className="text-green-400"/>Vidéo prête — lecture simulée</p>
                        </div>
                      ) : generatingAerialFor === detailProperty.id ? (
                        <div className="mt-2.5 rounded-lg bg-slate-900 aspect-video flex items-center justify-center">
                          <p className="text-white/70 text-[11px] flex items-center gap-1.5"><Clock size={13} className="animate-spin"/>Génération du survol en cours…</p>
                        </div>
                      ) : (
                        <button onClick={() => handleGenerateAerialView(detailProperty)}
                          className="w-full mt-2.5 flex items-center justify-center gap-1.5 bg-amber-500 text-white rounded-lg py-2.5 text-[12px] font-bold">
                          <Rocket size={13}/>Générer la vidéo — 🪙 {computeAerialViewCP(detailProperty.price)} CPS
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold text-slate-800 text-[13px] mb-1.5">Description</h3>
                    <p className="text-[12.5px] text-orange-400 leading-relaxed">{getDescription(detailProperty)}</p>
                  </div>

                  {detailProperty.amenities.length > 0 && !detailProperty.isSuspended && (
                    <div>
                      <h3 className="font-bold text-slate-800 text-[13px] mb-2">Équipements</h3>
                      <div className="flex flex-wrap gap-2">
                        {detailProperty.amenities.map((a) => <span key={a} className="text-[11px] bg-orange-50 text-slate-600 px-2.5 py-1 rounded-full">{a}</span>)}
                      </div>
                    </div>
                  )}

                  <PropertyScore property={detailProperty} />

                  {!detailProperty.isSuspended && (
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-3.5">
                      <p className="text-[11px] font-bold text-green-800 mb-1">💡 Estimation du marché</p>
                      <p className="text-[11px] text-green-700 leading-snug">
                        {detailProperty.transaction === "vente"
                          ? `Le prix au m² est de ${Math.round(detailProperty.price / detailProperty.area).toLocaleString("fr-FR")} FCFA/m², dans la moyenne du quartier ${detailProperty.district}.`
                          : `Le loyer représente ${Math.round(detailProperty.price / detailProperty.area).toLocaleString("fr-FR")} FCFA/m², cohérent avec le marché locatif de ${detailProperty.district}.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SERVICES TAB */}
              {detailTab === "services" && (
                detailProperty.isSuspended ? (
                  <div className="flex flex-col items-center text-center py-10 px-4">
                    <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mb-3">
                      <Lock size={22} className="text-rose-400" />
                    </div>
                    <p className="font-bold text-slate-500 text-[14px] mb-1">Services indisponibles</p>
                    <p className="text-[11px] text-gray-400 max-w-[240px]">⛔ Annonce suspendue — en attendant confirmation de l'annonceur, seul un aperçu limité de ce bien est proposé.</p>
                  </div>
                ) : (
                  <NearbyServices property={detailProperty} userLocation={userLocation} />
                )
              )}
            </div>
          </div>
          {showShare && (
            <ShareSheet property={detailProperty} onClose={() => setShowShare(false)} />
          )}
          {showReportSheet && (
            <ReportPropertySheet
              property={detailProperty}
              cpTransactions={clientCpTransactions}
              bookedVisits={bookedVisits}
              onClose={() => setShowReportSheet(false)}
              onSubmit={({ reasonId, comment, refundRequested, refundAmount, proofTransactionIds, visitProofId }) => {
                if (refundRequested && refundAmount > 0) {
                  refundClientCP(refundAmount, `Remboursement signalement — ${detailProperty.title}`, detailProperty.id);
                  // Le remboursement n'est validé qu'à partir de la preuve de
                  // paiement CPS et d'une visite programmée vieille d'au moins
                  // 24h (voir ReportPropertySheet) — dans ce cas, le bien est
                  // suspendu dès l'envoi du signalement, le temps qu'Imoobilis
                  // vérifie la situation.
                  suspendProperty(detailProperty);
                }
                store.reportProperty({
                  id: `report-${Date.now()}`,
                  propertyId: detailProperty.id,
                  propertyTitle: detailProperty.title,
                  advertiserPhone: detailProperty.advertiserPhone || demoAdvertiserPhone,
                  reasonId,
                  comment,
                  refundRequested: !!refundRequested,
                  refundedCp: refundRequested ? refundAmount : 0,
                  proofTransactionIds: proofTransactionIds || [],
                  visitProofId: visitProofId || null,
                  reportedAt: new Date().toISOString(),
                });
                setReportedPropertyIds(prev => new Set(prev).add(detailProperty.id));
              }}
            />
          )}
          {showContactSheet && !detailProperty.isSuspended && !reportedPropertyIds.has(detailProperty.id) && (
            <ContactAdvertiserSheet
              property={detailProperty}
              bookedVisits={bookedVisits}
              onClose={() => setShowContactSheet(false)}
              onScheduleVisit={() => { setShowContactSheet(false); setShowVisitScheduler(true); }}
            />
          )}
          {showTerrainBoundary && (
            <TerrainBoundaryMap property={detailProperty} onClose={() => setShowTerrainBoundary(false)} />
          )}
          {showVisitScheduler && (
            // La prise de rendez-vous (visite) est accessible uniquement une
            // fois le contact débloqué (unlockedContacts) : elle est incluse
            // gratuitement dans le paiement unique effectué via "Contacter
            // l'annonceur" — aucun CPS supplémentaire n'est débité ici.
            <div className="absolute inset-0 z-[200] flex flex-col justify-end" style={{ zIndex: 200 }} onClick={() => setShowVisitScheduler(false)}>
              <div className="flex-1 bg-black/40" />
 <div className="bg-white rounded-t-3xl overflow-y-auto" style={{ maxHeight: "80%" }} onClick={(e) => e.stopPropagation()}>
                <VisitScheduler
                  property={detailProperty}
                  advertiserSchedule={detailProperty?.advertiserPhone ? store?.visitSchedules?.[detailProperty.advertiserPhone] : null}
                  bookedSlots={store.visitRequests
                    .filter(v => v.propertyId === detailProperty.id)
                    .map(v => ({ day: v.day?.iso, time: v.time }))}
                  defaultName={`${myInfo.prenom} ${myInfo.nom}`.trim()}
                  defaultPhone={myInfo.contact}
                  cpCost={0}
                  availableCP={totalClientCP}
                  onClose={() => setShowVisitScheduler(false)}
                  onConfirm={(visit) => {
                    // Visite incluse dans le paiement du contact déjà effectué :
                    // aucune déduction CPS supplémentaire ici.
                    setBookedVisits(prev => [...prev, { ...visit, propertyTitle: detailProperty.title, propertyId: detailProperty.id }]);
                    // Notifie l'annonceur : la demande de visite est toujours
                    // ajoutée au store partagé, qu'il s'agisse d'un bien publié
                    // par un annonceur ou d'un bien de démo.
                    // Pour les biens de démo (sans advertiserPhone), on utilise
                    // demoAdvertiserPhone pour que la notification arrive bien
                    // à l'annonceur affiché en face.
                    const advertiserPhone = detailProperty?.advertiserPhone || demoAdvertiserPhone || `demo-${detailProperty.id}`;
                    store.addVisitRequest({
                      id: `v-${Date.now()}`,
                      propertyId: detailProperty.id,
                      propertyTitle: detailProperty.title,
                      advertiserPhone,
                      clientName: `${myInfo.prenom} ${myInfo.nom}`.trim(),
                      clientPhone: myInfo.contact,
                      day: visit.day,
                      time: visit.time,
                      type: visit.type,
                      advertiserContacted: false,
                    });
                    showToast(`Visite programmée — incluse dans votre contact, aucun CPS déduit`);
                    setTimeout(() => { setShowVisitScheduler(false); }, 2500);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {(scanning || scanDone) && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl px-6 py-7 flex flex-col items-center w-60">
              <div className="flex items-center gap-1.5 mb-3">
                {scanDone
                  ? <CheckCircle2 size={16} className="text-green-700" />
                  : <Radar size={16} className="text-green-700 animate-spin" />}
                <span className="text-[13px] font-semibold text-slate-700">
                  {scanDone ? "Recherche terminée" : "Recherche en cours…"}
                </span>
              </div>
              {/* anneau circulaire : 16 segments indépendants, chacun s'allume entièrement l'un après l'autre */}
              {(() => {
                const slotAngle = 360 / SCAN_RING_SEGMENTS;
                const gapAngle = slotAngle * 0.18;
                const toRad = (deg) => (deg * Math.PI) / 180;
                const cx = 50, cy = 50, r = SCAN_RING_RADIUS;
                const segments = Array.from({ length: SCAN_RING_SEGMENTS }, (_, idx) => {
                  const startAngle = idx * slotAngle - 90 + gapAngle / 2;
                  const endAngle = startAngle + slotAngle - gapAngle;
                  const x1 = cx + r * Math.cos(toRad(startAngle));
                  const y1 = cy + r * Math.sin(toRad(startAngle));
                  const x2 = cx + r * Math.cos(toRad(endAngle));
                  const y2 = cy + r * Math.sin(toRad(endAngle));
                  const arcSpan = slotAngle - gapAngle;
                  const largeArc = arcSpan >= 180 ? 1 : 0;
                  const isLit = idx < scanStep;
                  return (
                    <path
                      key={idx}
                      d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                      fill="none"
                      stroke={isLit ? (scanDone ? "#16a34a" : "#15803d") : "#e5e7eb"}
                      strokeWidth="8"
                      strokeLinecap="round"
                      style={{ transition: isLit ? "stroke 0.15s ease" : "none" }}
                    />
                  );
                });
                return (
                  <div className="relative w-36 h-36">
                    <svg className="w-36 h-36" viewBox="0 0 100 100">
                      {segments}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {scanDone && <CheckCircle2 size={18} className="text-green-600 mb-0.5" />}
                      <span className="text-[28px] font-extrabold text-slate-800 leading-none">{scanFoundCount}</span>
                      <span className="text-[10px] text-gray-400 font-medium mt-1 text-center leading-tight">
                        {scanFoundCount !== 1 ? "biens" : "bien"}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium text-center leading-tight">
                        {scanFoundCount !== 1 ? "trouvés" : "trouvé"}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <span className={`text-[12px] font-bold mt-3 ${scanDone ? "text-green-700" : "text-slate-600"}`}>
                {scanProgress}%
              </span>
              {scanDone && <p className="text-[11px] text-gray-400 mt-1 text-center">Classés du plus proche au plus éloigné</p>}
            </div>
          </div>
      )}

    </div>
  );
}
