import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
const leroyLogo = "/logos/leroy_merlin_logo.png";
import { useAuth } from "@/lib/auth";
import { BrandLogos, BrandText } from "@/components/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PUDO & Leroy Merlin · Locker Network" },
      { name: "description", content: "Mapa interactivo de la red de lockers PUDO & Leroy Merlin en Portugal." },
      { property: "og:title", content: "PUDO & Leroy Merlin · Locker Network" },
      { property: "og:description", content: "Mapa interactivo de la red de lockers PUDO & Leroy Merlin en Portugal." },
    ],
  }),
  component: Index,
});

type Locker = {
  nombre: string;
  numero: number;
  configuracion: string;
  mensalidade_eur: number;
  TC: number; A1: number; A3: number; D7: number; HT12: number; BL: number; BL_LM: number;
  photo_file?: string | null;
  config_file?: string | null;
};
type Location = {
  id: string;
  tienda_oficial: string;
  direccion: string;
  ciudad: string;
  codigo_postal: string;
  lat: number;
  lng: number;
  lockers: Locker[];
};

const MODULE_LABELS: Record<string, string> = {
  TC: "TC · Pantalla táctil",
  A1: "A1 · Pequeño",
  A3: "A3 · Mediano",
  D7: "D7 · Grande",
  HT12: "HT12 · XL",
  BL: "BL · Palet",
  BL_LM: "BL LM · Palet LM",
};

function lockerIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/><circle cx="7.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="16.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="7.5" cy="16.5" r="0.5" fill="currentColor"/><circle cx="16.5" cy="16.5" r="0.5" fill="currentColor"/></svg>`;
}

function Index() {
  const { email, logout } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedLocker, setSelectedLocker] = useState<{ locker: Locker; location: Location } | null>(null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<"dark" | "light">("dark");

  // Load data
  useEffect(() => {
    fetch("/pudo_lockers_geo.json")
      .then((r) => r.json())
      .then((d: Location[]) => setLocations(d))
      .catch((e) => console.error("Failed to load lockers", e));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    const map = L.map(mapRef.current, {
      center: [39.5, -8.0],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
    });
    tileLayerRef.current = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);
    mapInst.current = map;
  }, []);

  // Switch tile theme
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const url =
      mapTheme === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    tileLayerRef.current.setUrl(url);
  }, [mapTheme]);

  // Render markers
  useEffect(() => {
    const map = mapInst.current;
    if (!map || locations.length === 0) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const icon = L.divIcon({
      className: "",
      html: `<div class="pudo-marker"><img src="${leroyLogo}" alt="Leroy Merlin" /></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    locations.forEach((loc) => {
      const m = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
      m.bindPopup(
        `<div class="pudo-popup">
          <div class="pudo-popup-title">${loc.tienda_oficial}</div>
          <div class="pudo-popup-address">${loc.direccion}</div>
          <div class="pudo-popup-count">${loc.lockers.length} locker${loc.lockers.length > 1 ? "s" : ""}</div>
        </div>`,
        { closeButton: false }
      );
      m.on("click", () => handleLocationClick(loc));
      markersRef.current.set(loc.id, m);
    });
  }, [locations]);

  const handleLocationClick = (loc: Location) => {
    if (loc.lockers.length === 1) {
      setSelectedLocker({ locker: loc.lockers[0], location: loc });
      setSelectedLocation(null);
    } else {
      setSelectedLocation(loc);
      setSelectedLocker(null);
    }
  };

  const flyTo = (loc: Location) => {
    mapInst.current?.flyTo([loc.lat, loc.lng], 15, { duration: 0.8 });
    markersRef.current.get(loc.id)?.openPopup();
    setSidebarOpen(false);
  };

  const totalLockers = useMemo(
    () => locations.reduce((s, l) => s + l.lockers.length, 0),
    [locations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) =>
        l.ciudad.toLowerCase().includes(q) ||
        l.tienda_oficial.toLowerCase().includes(q)
    );
  }, [locations, search]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="z-[1000] flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3 md:gap-5">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded-md border border-border bg-surface p-2 text-primary hover:bg-surface-elevated md:hidden"
            aria-label="Mostrar ubicaciones"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex">
              <BrandLogos size={26} gap={10} />
            </div>
            <BrandText className="font-display text-lg font-bold tracking-tight md:text-xl" />
            <span className="hidden text-sm font-medium text-muted-foreground lg:inline">/ Red de Lockers</span>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <Stat label="Ubicaciones" value={locations.length} />
          <div className="h-6 w-px bg-border" />
          <Stat label="Lockers" value={totalLockers} />
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            {email && (
              <span className="hidden text-xs text-muted-foreground lg:inline" title={email}>
                {email}
              </span>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-elevated hover:text-primary"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`absolute inset-y-0 left-0 z-[900] w-80 max-w-[85vw] flex-col border-r border-border bg-surface transition-transform md:relative md:translate-x-0 md:flex ${
            sidebarOpen ? "translate-x-0 flex" : "-translate-x-full"
          }`}
        >
          <div className="border-b border-border p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Buscar ubicación
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ciudad o nombre de tienda…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((loc) => (
              <button
                key={loc.id}
                onClick={() => flyTo(loc)}
                className="block w-full border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">{loc.tienda_oficial}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{loc.ciudad}</div>
                  </div>
                  <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    {loc.lockers.length}
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No se encontraron ubicaciones.</div>
            )}
          </div>
        </aside>

        {/* Map */}
        <main className={`relative flex-1 ${mapTheme === "light" ? "map-theme-light" : ""}`}>
          <div ref={mapRef} className="h-full w-full" />
          {/* Theme toggle */}
          <div className="absolute top-3 right-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg">
            <button
              onClick={() => setMapTheme("dark")}
              className={`flex items-center justify-center px-2.5 py-2 transition-colors ${
                mapTheme === "dark"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Modo oscuro"
              title="Modo oscuro"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
            <div className="w-px bg-border" />
            <button
              onClick={() => setMapTheme("light")}
              className={`flex items-center justify-center px-2.5 py-2 transition-colors ${
                mapTheme === "light"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Modo claro"
              title="Modo claro"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            </button>
          </div>
        </main>
      </div>

      {/* Locker selection modal */}
      {selectedLocation && (
        <Overlay onClose={() => setSelectedLocation(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-elevated p-6 shadow-2xl">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Elige un locker</div>
              <h2 className="mt-1 font-display text-xl font-bold">{selectedLocation.tienda_oficial}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selectedLocation.direccion}</p>
            </div>
            <div className="space-y-2">
              {selectedLocation.lockers.map((lk) => (
                <button
                  key={lk.numero}
                  onClick={() => {
                    setSelectedLocker({ locker: lk, location: selectedLocation });
                    setSelectedLocation(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-background"
                >
                  <div>
                    <div className="text-sm font-semibold">{lk.nombre}</div>
                    <div className="text-xs text-muted-foreground">Locker #{lk.numero}</div>
                  </div>
                  <span className="text-primary">→</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectedLocation(null)}
              className="mt-4 w-full rounded-md border border-border py-2 text-sm text-muted-foreground hover:bg-surface"
            >
              Cerrar
            </button>
          </div>
        </Overlay>
      )}

      {/* Locker detail panel */}
      {selectedLocker && (
        <Overlay onClose={() => setSelectedLocker(null)}>
          <LockerPanel
            locker={selectedLocker.locker}
            location={selectedLocker.location}
            onClose={() => setSelectedLocker(null)}
            onImageClick={(src) => setLightboxImage(src)}
          />
        </Overlay>
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="font-display text-lg font-bold text-primary md:text-xl">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:w-auto">
        {children}
      </div>
    </div>
  );
}

function LockerPanel({
  locker,
  location,
  onClose,
  onImageClick,
}: {
  locker: Locker;
  location: Location;
  onClose: () => void;
  onImageClick?: (src: string) => void;
}) {
  const modules = (["TC", "A1", "A3", "D7", "HT12", "BL", "BL_LM"] as const)
    .map((k) => ({ k, v: locker[k] }))
    .filter((m) => m.v > 0);

  return (
    <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface-elevated shadow-2xl sm:rounded-xl">
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-0.5 font-display text-sm font-bold text-primary-foreground">
              #{locker.numero}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Locker
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold leading-tight">{locker.nombre}</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-border p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Cerrar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <Section title="Imágenes del locker">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LockerImage
              title="Foto de instalación"
              src={locker.photo_file ? `/locker_photos/${locker.photo_file}` : null}
              alt={`Foto de ${locker.nombre}`}
              onClick={onImageClick}
            />
            <LockerImage
              title="Configuración"
              src={locker.config_file ? `/locker_configs/${locker.config_file}` : null}
              alt={`Configuración de ${locker.nombre}`}
              onClick={onImageClick}
            />
          </div>
        </Section>

        <Section title="Ubicación">
          <div className="text-sm font-medium">{location.tienda_oficial}</div>
          <div className="mt-1 text-sm text-muted-foreground">{location.direccion}</div>
          <div className="text-sm text-muted-foreground">
            {location.codigo_postal} · {location.ciudad}
          </div>
        </Section>

        <Section title="Configuración">
          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed text-primary">
            {locker.configuracion}
          </pre>
        </Section>

        <Section title="Desglose de módulos">
          <div className="grid grid-cols-2 gap-2">
            {modules.map(({ k, v }) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">{MODULE_LABELS[k]}</span>
                <span className="font-display text-sm font-bold text-primary">{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Cuota mensual">
          <div className="flex items-baseline gap-2 rounded-md border border-primary/30 bg-primary/10 p-4">
            <span className="font-display text-3xl font-bold text-primary">
              {locker.mensalidade_eur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-lg text-primary">€</span>
            <span className="ml-auto text-xs text-muted-foreground">al mes</span>
          </div>
        </Section>
      </div>

      <div className="border-t border-border p-4">
        <button
          onClick={onClose}
          className="w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-accent"
        >
          Volver al mapa
        </button>
      </div>
    </div>
  );
}

function LockerImage({ title, src, alt, onClick }: { title: string; src: string | null; alt: string; onClick?: (src: string) => void }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div
        className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-background ${onClick && src ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (onClick && src) onClick(src);
        }}
      >
        {src && !errored ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="px-3 text-center text-xs text-muted-foreground">
            Sin imagen disponible
          </div>
        )}
      </div>
    </div>
  );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]">
        <img
          src={src}
          alt="Imagen ampliada"
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="Cerrar"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
