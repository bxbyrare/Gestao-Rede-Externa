import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Disc,
  Download,
  Eye,
  History,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, TirePositionInfo, Vehicle } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import VehiclePreview from '../components/VehiclePreview';
import { hasPermission, isCoordenador, useAuth } from '../state/AuthContext';
import { formatPersonName } from '../utils/formatName';

type FleetTab = 'veiculos' | 'checklists' | 'ocorrencias' | 'pneus' | 'manutencoes' | 'multas';

interface FleetInspection {
  id: number;
  vehicle_id: number;
  plate: string;
  vehicle_model?: string;
  area_rede?: string;
  base?: string;
  subclus?: string;
  inspection_type: 'entrega' | 'recebimento' | 'periodica';
  from_person_name: string;
  to_person_name: string;
  to_tech_id?: number | null;
  km: number;
  fuel_level: string;
  checklist_json: Record<string, string>;
  has_damage: boolean;
  damage_notes: string;
  observations: string;
  photo_front?: string;
  photo_back?: string;
  photo_left?: string;
  photo_right?: string;
  photo_extra?: string;
  signature_data?: string;
  photos_sha256: string;
  has_signature?: boolean;
  status: 'pendente' | 'aprovado' | 'reprovado';
  created_by_name: string;
  created_at_fmt: string;
  waiting_minutes?: number;
  approved_by_name?: string;
  approved_by_role?: string;
  approved_at_fmt?: string;
  review_notes?: string;
}

interface FleetDamage {
  id: number;
  vehicle_id: number;
  plate: string;
  vehicle_model?: string;
  area: string;
  occurrence_type: string;
  severity: string;
  affected_part: string;
  description: string;
  bo_number: string;
  reported_by_name: string;
  driver_name: string;
  km: number;
  photos_json: string[];
  status: 'Aberta' | 'Em Análise' | 'Em Oficina' | 'Concluída';
  resolution_notes: string;
  resolved_by_name: string;
  resolved_at_fmt?: string;
  inspection_id?: number | null;
  created_at_fmt: string;
  waiting_minutes?: number;
}

interface FleetMaintenance {
  id: number;
  vehicle_id: number;
  plate: string;
  vehicle_model?: string;
  area: string;
  maintenance_type: string;
  title: string;
  description: string;
  scheduled_date: string;
  target_km: number;
  workshop: string;
  cost: number;
  downtime_hours: string;
  status: 'Agendada' | 'Em Oficina' | 'Concluída' | 'Cancelada';
  voucher_photo?: string;
  completed_by_name?: string;
  completed_at_fmt?: string;
  completion_notes?: string;
  created_by_name: string;
  created_at_fmt: string;
}

interface FleetFine {
  id: number;
  vehicle_id: number;
  plate: string;
  vehicle_model?: string;
  area: string;
  auto_number: string;
  infraction_date: string;
  due_date: string;
  description: string;
  location: string;
  amount: number;
  discount_amount: number;
  driver_name: string;
  driver_response: string;
  driver_responded_at_fmt?: string;
  status: 'Aguardando Condutor' | 'Em Análise' | 'Concluída';
  company_decision: string;
  decided_by_name: string;
  decided_at_fmt?: string;
  attachment_photo?: string;
  created_at_fmt: string;
}

interface FleetAlert {
  id: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  plate: string;
  vehicle_id: number;
  area: string;
  title: string;
  description: string;
  target_tab: FleetTab;
}

const CHECKLIST_ITEMS = [
  { key: 'lataria', label: 'Lataria, Pintura e Para-choques' },
  { key: 'farois', label: 'Faróis, Lanternas e Setas' },
  { key: 'pneus', label: 'Pneus, Calotas e Rodas' },
  { key: 'estepe_macaco', label: 'Estepe, Macaco, Chave de Roda e Triângulo' },
  { key: 'vidros', label: 'Para-brisa, Vidros e Retrovisores' },
  { key: 'freios_mecanica', label: 'Freios, Embreagem, Motor e Painel' },
  { key: 'limpeza', label: 'Limpeza Interna, Bancos e Cintos' },
  { key: 'equipamentos_teto', label: 'Rack de Escada, Giroflex e Inversor' },
];

const TIRE_POSITIONS: Array<{ key: string; label: string; short: string }> = [
  { key: 'fl', label: 'Dianteiro Esquerdo (Motorista)', short: 'Diant. Esq.' },
  { key: 'fr', label: 'Dianteiro Direito (Passageiro)', short: 'Diant. Dir.' },
  { key: 'rl', label: 'Traseiro Esquerdo', short: 'Tras. Esq.' },
  { key: 'rr', label: 'Traseiro Direito', short: 'Tras. Dir.' },
  { key: 'spare', label: 'Estepe / Reserva', short: 'Estepe' },
];

const emptyForm = {
  plate: '',
  type: 'Utilitário',
  model: '',
  responsible_tech_id: '',
  has_rack: false,
  has_basket: false,
  has_giroflex: false,
  has_inverter: false,
  ticket_car: '',
  area_rede: '',
  base: '',
  setor: '',
  condutor_dia: '',
  condutor_tarde: '',
  condutor_madrugada: '',
  subclus: '',
  current_km: '0',
  crlv_number: '',
  crlv_expiration: '',
  insurance_company: '',
  insurance_expiration: '',
  rental_company: '',
  contract_number: '',
  operational_status: 'Operacional',
};

// Compress uploaded image into a clean Base64 JPEG Data URI so it is saved directly in PostgreSQL without risk of loss
function compressImageToDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.fillStyle = '#090C13';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getVehicleCompletenessScore(v: Vehicle): number {
  let score = 0;
  if (v.plate?.trim()) score += 2;
  if (v.model?.trim()) score += 2;
  if (v.responsible_name?.trim() || v.condutor_dia?.trim()) score += 4;
  if (v.subclus?.trim()) score += 2;
  if (v.base?.trim()) score += 2;
  if (v.setor?.trim()) score += 1;
  if (v.ticket_car?.trim()) score += 2;
  if (v.area_rede?.trim()) score += 1;
  if (v.condutor_tarde?.trim() || v.condutor_madrugada?.trim()) score += 1;
  if (v.has_rack || v.has_basket || v.has_giroflex || v.has_inverter) score += 1;
  return score;
}

function getNormalizedModel(v: Vehicle): string {
  const m = (v.model || '').trim().toUpperCase();
  const t = (v.type || '').trim().toUpperCase();

  if (m.includes('GOL')) return 'Volkswagen Gol';
  if (m.includes('FIORINO')) return 'Fiat Fiorino';
  if (m.includes('KWID')) return 'Renault Kwid';
  if (m.includes('DUCATO')) return 'Fiat Ducato';
  if (m.includes('STRADA')) return 'Fiat Strada';
  if (m.includes('SAVEIRO')) return 'Volkswagen Saveiro';
  if (m.includes('MASTER')) return 'Renault Master';
  if (m.includes('MOBI')) return 'Fiat Mobi';
  if (m.includes('ARGO')) return 'Fiat Argo';
  if (m.includes('ONIX')) return 'Chevrolet Onix';
  if (m.includes('S10') || m.includes('S-10')) return 'Chevrolet S10';
  if (m.includes('HILUX')) return 'Toyota Hilux';
  if (m.includes('TORO')) return 'Fiat Toro';
  if (m.includes('MONTANA')) return 'Chevrolet Montana';
  if (m.includes('OROCH')) return 'Renault Oroch';
  if (m.includes('RANGER')) return 'Ford Ranger';
  if (m.includes('AMAROK')) return 'Volkswagen Amarok';
  if (m.includes('MOTO') || t.includes('MOTO') || m.includes('CG')) return 'Motocicletas & Apoio';
  if (m.includes('CAMINH') || t.includes('CAMINH') || m.includes('HR') || m.includes('DAILY')) return 'Caminhões & VUCs';

  if (m) return m;
  if (t) return t;
  return 'Outros Veículos';
}

function getTireComputedState(info: TirePositionInfo | undefined, currentKm: number): 'ok' | 'warning' | 'critical' {
  if (!info) return 'ok';
  if (info.condition === 'critical') return 'critical';
  const nextKm = Number(info.next_check_km || 0);
  if (nextKm > 0 && currentKm >= nextKm) return 'critical';
  if (info.condition === 'warning') return 'warning';
  if (nextKm > 0 && currentKm >= nextKm - 1500) return 'warning';
  return 'ok';
}

function formatWaitingTime(minutes?: number): string {
  const m = Math.max(0, Number(minutes || 0));
  if (m < 1) return 'Agora mesmo';
  if (m < 60) return `${m}min`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (hours < 24) {
    return rem > 0 ? `${hours}h ${rem}min` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function getVehicleUrgencyRank(v: Vehicle): number {
  const pendingCount = Number(v.pending_inspections_count || 0);
  const openDmgCount = Number(v.open_damages_count || 0);
  const waitMin = Number(v.oldest_pending_minutes || 0);
  let score = 0;
  if (pendingCount > 0) score += 1000 + Math.min(waitMin, 500);
  if (v.pending_has_damage) score += 600;
  if (openDmgCount > 0) score += 500 + openDmgCount * 100;
  return score;
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'veiculos.create');
  const canEdit = hasPermission(user, 'veiculos.edit');
  const canDelete = hasPermission(user, 'veiculos.delete');
  const isSupervisorOrCoord =
    isCoordenador(user) ||
    canEdit ||
    ['supervisor', 'coordenador', 'administrador', 'admin'].includes((user?.role || '').trim().toLowerCase());

  const [activeTab, setActiveTab] = useState<FleetTab>('veiculos');
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('Todas');
  const [selectedModel, setSelectedModel] = useState('Todos');

  // Fleet Overview data
  const [inspections, setInspections] = useState<FleetInspection[]>([]);
  const [damages, setDamages] = useState<FleetDamage[]>([]);
  const [maintenances, setMaintenances] = useState<FleetMaintenance[]>([]);
  const [fines, setFines] = useState<FleetFine[]>([]);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [canReviewServer, setCanReviewServer] = useState(false);

  // Vehicle CRUD Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 1) Vistoria Digital (4 Lados + Assinatura + Aprovação Supervisor) Modal
  const [inspModalOpen, setInspModalOpen] = useState(false);
  const [inspVehicleId, setInspVehicleId] = useState('');
  const [inspType, setInspType] = useState<'entrega' | 'recebimento' | 'periodica'>('entrega');
  const [inspFromPerson, setInspFromPerson] = useState('');
  const [inspToPerson, setInspToPerson] = useState('');
  const [inspToTechId, setInspToTechId] = useState('');
  const [inspKm, setInspKm] = useState('');
  const [inspFuel, setInspFuel] = useState('1/2');
  const [inspChecklist, setInspChecklist] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, 'Conforme']))
  );
  const [inspHasDamage, setInspHasDamage] = useState(false);
  const [inspDamageNotes, setInspDamageNotes] = useState('');
  const [inspObservations, setInspObservations] = useState('');
  const [photoFront, setPhotoFront] = useState('');
  const [photoBack, setPhotoBack] = useState('');
  const [photoLeft, setPhotoLeft] = useState('');
  const [photoRight, setPhotoRight] = useState('');
  const [photoExtra, setPhotoExtra] = useState('');
  const [inspError, setInspError] = useState<string | null>(null);
  const [inspSubmitting, setInspSubmitting] = useState(false);
  const [inspStatusFilter, setInspStatusFilter] = useState<'todos' | 'pendente' | 'aprovado' | 'reprovado'>('todos');

  // Signature Pad refs
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [hasDrawnSig, setHasDrawnSig] = useState(false);

  // View / Review Inspection Detail Modal
  const [viewingInsp, setViewingInsp] = useState<FleetInspection | null>(null);
  const [loadingInspDetail, setLoadingInspDetail] = useState(false);
  const [reviewNotesInput, setReviewNotesInput] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // 2) Vehicle Complete History / Dossier Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<{
    vehicle: Vehicle;
    inspections: FleetInspection[];
    damages: FleetDamage[];
    maintenances: FleetMaintenance[];
    fines: FleetFine[];
  } | null>(null);

  // 3) Report Damage / Occurrence Modal
  const [dmgModalOpen, setDmgModalOpen] = useState(false);
  const [dmgVehicleId, setDmgVehicleId] = useState('');
  const [dmgType, setDmgType] = useState('Avaria / Quebrado');
  const [dmgSeverity, setDmgSeverity] = useState('Média');
  const [dmgPart, setDmgPart] = useState('');
  const [dmgDriver, setDmgDriver] = useState('');
  const [dmgKm, setDmgKm] = useState('');
  const [dmgBo, setDmgBo] = useState('');
  const [dmgDesc, setDmgDesc] = useState('');
  const [dmgPhotos, setDmgPhotos] = useState<string[]>([]);
  const [dmgSubmitting, setDmgSubmitting] = useState(false);
  const [dmgError, setDmgError] = useState<string | null>(null);

  // Resolve / Update Damage Modal
  const [updatingDmg, setUpdatingDmg] = useState<FleetDamage | null>(null);
  const [dmgNewStatus, setDmgNewStatus] = useState<'Aberta' | 'Em Análise' | 'Em Oficina' | 'Concluída'>('Em Análise');
  const [dmgResolutionNotes, setDmgResolutionNotes] = useState('');
  const [dmgUpdating, setDmgUpdating] = useState(false);

  // 4) Tires Preventive Control state
  const [selectedTireVehicleId, setSelectedTireVehicleId] = useState<number | null>(null);
  const [tireDrafts, setTireDrafts] = useState<Record<string, TirePositionInfo>>({});
  const [tireKmDraft, setTireKmDraft] = useState('');
  const [savingTires, setSavingTires] = useState(false);
  const [tireSavedToast, setTireSavedToast] = useState(false);

  // 5) Maintenance Modal & View
  const [maintViewMode, setMaintViewMode] = useState<'agenda' | 'historico'>('agenda');
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [maintVehicleId, setMaintVehicleId] = useState('');
  const [maintType, setMaintType] = useState('Preventiva');
  const [maintTitle, setMaintTitle] = useState('');
  const [maintDate, setMaintDate] = useState('');
  const [maintKm, setMaintKm] = useState('');
  const [maintWorkshop, setMaintWorkshop] = useState('');
  const [maintCost, setMaintCost] = useState('');
  const [maintDowntime, setMaintDowntime] = useState('');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintVoucher, setMaintVoucher] = useState('');
  const [maintSubmitting, setMaintSubmitting] = useState(false);

  // 6) Fines Modal & Response/Decision Modals
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineVehicleId, setFineVehicleId] = useState('');
  const [fineAuto, setFineAuto] = useState('');
  const [fineDate, setFineDate] = useState('');
  const [fineDueDate, setFineDueDate] = useState('');
  const [fineDriver, setFineDriver] = useState('');
  const [fineLocation, setFineLocation] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [fineDiscount, setFineDiscount] = useState('');
  const [fineDesc, setFineDesc] = useState('');
  const [finePhoto, setFinePhoto] = useState('');
  const [fineSubmitting, setFineSubmitting] = useState(false);

  const [respondingFine, setRespondingFine] = useState<FleetFine | null>(null);
  const [fineDriverInput, setFineDriverInput] = useState('');
  const [fineResponseText, setFineResponseText] = useState('');
  const [decidingFine, setDecidingFine] = useState<FleetFine | null>(null);
  const [fineDecisionText, setFineDecisionText] = useState('');

  const canReview = isSupervisorOrCoord || canReviewServer;

  function loadAll() {
    api
      .get<Vehicle[]>('/api/vehicles')
      .then((list) => {
        setVehicles(list);
        if (list.length > 0 && !selectedTireVehicleId) {
          setSelectedTireVehicleId(list[0].id);
        }
      })
      .catch(() => setVehicles([]));

    api
      .get<{
        inspections: FleetInspection[];
        damages: FleetDamage[];
        maintenances: FleetMaintenance[];
        fines: FleetFine[];
        alerts: FleetAlert[];
        can_review: boolean;
      }>('/api/fleet/overview')
      .then((res) => {
        setInspections(res.inspections || []);
        setDamages(res.damages || []);
        setMaintenances(res.maintenances || []);
        setFines(res.fines || []);
        setAlerts(res.alerts || []);
        setCanReviewServer(Boolean(res.can_review));
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadAll();
    api
      .get<Technician[]>('/api/technicians')
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, []);

  // Sync tire editor when selectedTireVehicleId changes
  const selectedTireVehicle = useMemo(
    () => (vehicles || []).find((v) => v.id === selectedTireVehicleId) || null,
    [vehicles, selectedTireVehicleId]
  );

  useEffect(() => {
    if (selectedTireVehicle) {
      setTireDrafts(selectedTireVehicle.tires_json || {});
      setTireKmDraft(String(selectedTireVehicle.current_km || 0));
    }
  }, [selectedTireVehicle]);

  const techAreaById = useMemo(() => {
    const map = new Map<number, string>();
    technicians.forEach((t) => {
      if (t.id && t.area?.trim()) {
        map.set(t.id, t.area.trim());
      }
    });
    return map;
  }, [technicians]);

  function getVehicleAreaTokens(v: Vehicle): string[] {
    const rawValues = [
      v.area_rede,
      v.subclus,
      v.base,
      v.responsible_tech_id ? techAreaById.get(Number(v.responsible_tech_id)) : '',
    ];
    const tokens = new Set<string>();
    rawValues.forEach((raw) => {
      if (!raw) return;
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((item) => tokens.add(item));
    });
    return Array.from(tokens);
  }

  const availableAreas = useMemo(() => {
    if (!vehicles) return ['Todas'];
    const setA = new Set<string>();
    vehicles.forEach((v) => {
      getVehicleAreaTokens(v).forEach((a) => setA.add(a));
    });
    return ['Todas', ...Array.from(setA).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [vehicles, techAreaById]);

  const groupedVehicles = useMemo(() => {
    if (!vehicles) return [];
    const q = search.trim().toLowerCase();

    const filtered = vehicles.filter((v) => {
      if (selectedArea !== 'Todas') {
        const vAreas = getVehicleAreaTokens(v);
        if (!vAreas.some((a) => a.toLowerCase() === selectedArea.toLowerCase())) {
          return false;
        }
      }
      if (!q) return true;
      return (
        v.plate.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        (v.model || '').toLowerCase().includes(q) ||
        (v.responsible_name || '').toLowerCase().includes(q) ||
        (v.condutor_dia || '').toLowerCase().includes(q) ||
        (v.area_rede || '').toLowerCase().includes(q) ||
        (v.base || '').toLowerCase().includes(q) ||
        (v.subclus || '').toLowerCase().includes(q) ||
        (v.ticket_car || '').toLowerCase().includes(q)
      );
    });

    const groupsMap = new Map<string, Vehicle[]>();
    filtered.forEach((v) => {
      const modelGroup = getNormalizedModel(v);
      if (!groupsMap.has(modelGroup)) {
        groupsMap.set(modelGroup, []);
      }
      groupsMap.get(modelGroup)!.push(v);
    });

    const groups: { model: string; vehicles: Vehicle[]; total: number; maxUrgency: number }[] = [];
    groupsMap.forEach((vList, modelName) => {
      vList.sort((a, b) => {
        const urgDiff = getVehicleUrgencyRank(b) - getVehicleUrgencyRank(a);
        if (urgDiff !== 0) return urgDiff;
        return getVehicleCompletenessScore(b) - getVehicleCompletenessScore(a);
      });
      const maxUrgency = Math.max(0, ...vList.map(getVehicleUrgencyRank));
      groups.push({
        model: modelName,
        vehicles: vList,
        total: vList.length,
        maxUrgency,
      });
    });

    const priorityOrder = [
      'Volkswagen Gol',
      'Fiat Fiorino',
      'Renault Kwid',
      'Fiat Ducato',
      'Fiat Strada',
      'Volkswagen Saveiro',
      'Renault Master',
      'Fiat Mobi',
      'Fiat Argo',
      'Chevrolet Onix',
      'Chevrolet S10',
      'Toyota Hilux',
      'Fiat Toro',
    ];

    groups.sort((a, b) => {
      if (b.maxUrgency !== a.maxUrgency) return b.maxUrgency - a.maxUrgency;
      const idxA = priorityOrder.indexOf(a.model);
      const idxB = priorityOrder.indexOf(b.model);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return b.total - a.total;
    });

    if (selectedModel !== 'Todos') {
      return groups.filter((g) => g.model === selectedModel);
    }

    return groups;
  }, [vehicles, search, selectedArea, selectedModel, techAreaById]);

  const availableModels = useMemo(() => {
    if (!vehicles) return ['Todos'];
    const setM = new Set<string>();
    vehicles.forEach((v) => setM.add(getNormalizedModel(v)));
    return ['Todos', ...Array.from(setM)];
  }, [vehicles]);

  const stats = useMemo(() => {
    const total = vehicles?.length || 0;
    const pendingInsp = inspections.filter((i) => i.status === 'pendente').length;
    const openDamages = damages.filter((d) => d.status !== 'Concluída').length;
    const activeMaint = maintenances.filter((m) => m.status === 'Agendada' || m.status === 'Em Oficina').length;
    const pendingFines = fines.filter((f) => f.status !== 'Concluída').length;
    return { total, pendingInsp, openDamages, activeMaint, pendingFines, totalAlerts: alerts.length };
  }, [vehicles, inspections, damages, maintenances, fines, alerts]);

  // --- Signature Canvas Handlers ---
  function initSignatureCanvas() {
    setTimeout(() => {
      const canvas = sigCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#090C13';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setHasDrawnSig(false);
    }, 60);
  }

  function getCanvasCoords(e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) {
    const canvas = sigCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDrawingSig(e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawingSig(true);
    setHasDrawnSig(true);
  }

  function drawSig(e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) {
    if (!isDrawingSig) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawingSig() {
    setIsDrawingSig(false);
  }

  // --- Open Modals ---
  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      plate: v.plate,
      type: v.type || 'Utilitário',
      model: v.model || '',
      responsible_tech_id: v.responsible_tech_id ? String(v.responsible_tech_id) : '',
      has_rack: Boolean(v.has_rack),
      has_basket: Boolean(v.has_basket),
      has_giroflex: Boolean(v.has_giroflex),
      has_inverter: Boolean(v.has_inverter),
      ticket_car: v.ticket_car || '',
      area_rede: v.area_rede || '',
      base: v.base || '',
      setor: v.setor || '',
      condutor_dia: v.condutor_dia || '',
      condutor_tarde: v.condutor_tarde || '',
      condutor_madrugada: v.condutor_madrugada || '',
      subclus: v.subclus || '',
      current_km: String(v.current_km || 0),
      crlv_number: v.crlv_number || '',
      crlv_expiration: v.crlv_expiration || '',
      insurance_company: v.insurance_company || '',
      insurance_expiration: v.insurance_expiration || '',
      rental_company: v.rental_company || '',
      contract_number: v.contract_number || '',
      operational_status: v.operational_status || 'Operacional',
    });
    setError(null);
    setModalOpen(true);
  }

  function openInspectionModal(vehicle?: Vehicle) {
    setInspVehicleId(vehicle ? String(vehicle.id) : vehicles?.[0]?.id ? String(vehicles[0].id) : '');
    setInspType('entrega');
    setInspFromPerson(
      vehicle?.responsible_name ||
        vehicle?.condutor_dia ||
        formatPersonName(user?.name || user?.username || '')
    );
    setInspToPerson('');
    setInspToTechId('');
    setInspKm(vehicle?.current_km ? String(vehicle.current_km) : '');
    setInspFuel('1/2');
    setInspChecklist(Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, 'Conforme'])));
    setInspHasDamage(false);
    setInspDamageNotes('');
    setInspObservations('');
    setPhotoFront('');
    setPhotoBack('');
    setPhotoLeft('');
    setPhotoRight('');
    setPhotoExtra('');
    setInspError(null);
    setInspModalOpen(true);
    initSignatureCanvas();
  }

  function openDamageModal(vehicle?: Vehicle) {
    setDmgVehicleId(vehicle ? String(vehicle.id) : vehicles?.[0]?.id ? String(vehicles[0].id) : '');
    setDmgType('Avaria / Quebrado');
    setDmgSeverity('Média');
    setDmgPart('');
    setDmgDriver(
      vehicle?.responsible_name ||
        vehicle?.condutor_dia ||
        formatPersonName(user?.name || user?.username || '')
    );
    setDmgKm(vehicle?.current_km ? String(vehicle.current_km) : '');
    setDmgBo('');
    setDmgDesc('');
    setDmgPhotos([]);
    setDmgError(null);
    setDmgModalOpen(true);
  }

  async function openVehicleHistory(v: Vehicle) {
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await api.get<{
        vehicle: Vehicle;
        inspections: FleetInspection[];
        damages: FleetDamage[];
        maintenances: FleetMaintenance[];
        fines: FleetFine[];
      }>(`/api/fleet/vehicles/${v.id}/history`);
      setHistoryData(res);
    } catch {
      setHistoryModalOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openInspectionDetail(inspId: number) {
    setLoadingInspDetail(true);
    setReviewNotesInput('');
    try {
      const res = await api.get<FleetInspection>(`/api/fleet/inspections/${inspId}`);
      setViewingInsp(res);
    } catch {
      alert('Erro ao carregar as fotos e comprovante da vistoria.');
    } finally {
      setLoadingInspDetail(false);
    }
  }

  // --- Submit Handlers ---
  async function handleSubmitVehicle() {
    setError(null);
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        responsible_tech_id: form.responsible_tech_id || null,
        current_km: Number(form.current_km || 0),
      };
      if (editing) {
        await api.put(`/api/vehicles/${editing.id}`, payload);
      } else {
        await api.post('/api/vehicles', payload);
      }
      setModalOpen(false);
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!confirm(`Excluir o veículo de placa "${v.plate}"?`)) return;
    await api.delete(`/api/vehicles/${v.id}`);
    loadAll();
  }

  async function handleSubmitInspection() {
    setInspError(null);
    if (!inspVehicleId) {
      setInspError('Selecione o veículo.');
      return;
    }
    if (!inspFromPerson.trim() || !inspToPerson.trim()) {
      setInspError('Informe obrigatoriamente de qual pessoa está saindo e para qual pessoa está indo o veículo.');
      return;
    }
    if (!photoFront || !photoBack || !photoLeft || !photoRight) {
      setInspError('É obrigatório anexar as fotos dos 4 lados do veículo (Frente, Traseira, Lateral Esquerda e Lateral Direita).');
      return;
    }
    if (!hasDrawnSig || !sigCanvasRef.current) {
      setInspError('Assine na caixa de assinatura digital antes de enviar o formulário.');
      return;
    }

    const signatureData = sigCanvasRef.current.toDataURL('image/png');
    const anyChecklistDamage = Object.values(inspChecklist).some((v) => v !== 'Conforme');

    setInspSubmitting(true);
    try {
      await api.post('/api/fleet/inspections', {
        vehicle_id: Number(inspVehicleId),
        inspection_type: inspType,
        from_person_name: inspFromPerson.trim(),
        to_person_name: inspToPerson.trim(),
        to_tech_id: inspToTechId ? Number(inspToTechId) : null,
        km: Number(inspKm || 0),
        fuel_level: inspFuel,
        checklist: inspChecklist,
        has_damage: inspHasDamage || anyChecklistDamage,
        damage_notes: inspDamageNotes.trim(),
        observations: inspObservations.trim(),
        photo_front: photoFront,
        photo_back: photoBack,
        photo_left: photoLeft,
        photo_right: photoRight,
        photo_extra: photoExtra,
        signature_data: signatureData,
      });
      setInspModalOpen(false);
      setActiveTab('checklists');
      loadAll();
    } catch (err) {
      setInspError(err instanceof ApiError ? err.message : 'Erro ao salvar vistoria veicular.');
    } finally {
      setInspSubmitting(false);
    }
  }

  async function handleReviewInspection(action: 'aprovar' | 'reprovar') {
    if (!viewingInsp) return;
    setReviewSubmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        status: 'aprovado' | 'reprovado';
        approved_by_name: string;
        approved_by_role: string;
        approved_at_fmt: string;
        review_notes: string;
      }>(`/api/fleet/inspections/${viewingInsp.id}/review`, {
        action,
        review_notes: reviewNotesInput.trim(),
      });
      setViewingInsp((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              approved_by_name: res.approved_by_name,
              approved_by_role: res.approved_by_role,
              approved_at_fmt: res.approved_at_fmt,
              review_notes: res.review_notes,
            }
          : null
      );
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Falha ao revisar vistoria.');
    } finally {
      setReviewSubmitting(false);
    }
  }

  function printInspectionReceipt(insp: FleetInspection) {
    const win = window.open('', '_blank', 'width=920,height=800');
    if (!win) return;
    const statusLabel =
      insp.status === 'aprovado'
        ? `APROVADO E REVISADO POR ${insp.approved_by_name || 'SUPERVISOR'} (${insp.approved_by_role || 'Coordenação'}) EM ${insp.approved_at_fmt || ''}`
        : insp.status === 'reprovado'
        ? `REPROVADO POR ${insp.approved_by_name || 'SUPERVISOR'} EM ${insp.approved_at_fmt || ''}`
        : 'PENDENTE DE REVISÃO E APROVAÇÃO DO SUPERVISOR';

    const checklistHtml = CHECKLIST_ITEMS.map(
      (item) =>
        `<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;">${item.label}</td><td style="padding:6px 10px;border:1px solid #cbd5e1;font-weight:bold;">${
          insp.checklist_json?.[item.key] || 'Conforme'
        }</td></tr>`
    ).join('');

    win.document.write(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Comprovante de Vistoria Veicular #${insp.id} - ${insp.plate}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; max-width: 860px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e20613; padding-bottom: 12px; margin-bottom: 16px; }
          .badge { background: ${insp.status === 'aprovado' ? '#dcfce7' : '#fef3c7'}; color: ${
      insp.status === 'aprovado' ? '#166534' : '#92400e'
    }; padding: 10px 14px; border-radius: 8px; font-weight: bold; font-size: 13px; margin-bottom: 16px; border: 1px solid #cbd5e1; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; font-size: 13px; }
          .box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
          .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
          .photo-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; text-align: center; }
          .photo-card img { width: 100%; max-height: 220px; object-fit: cover; border-radius: 6px; }
          .sig { margin-top: 16px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; text-align: center; background: #090c13; color: #fff; }
          .sig img { max-height: 90px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h2 style="margin:0;">CLARO BRASIL · GESTÃO DE FROTA REDE EXTERNA</h2>
            <p style="margin:4px 0 0;font-size:12px;color:#475569;">Comprovante Oficial de Vistoria & Repasse Veicular (#${insp.id})</p>
          </div>
          <div style="text-align:right;font-size:12px;">
            <strong>Placa: ${insp.plate}</strong><br/>
            Registrado em: ${insp.created_at_fmt}
          </div>
        </div>
        <div class="badge">${statusLabel}</div>
        <div class="grid">
          <div class="box"><strong>De (Entregando):</strong><br/>${insp.from_person_name}</div>
          <div class="box"><strong>Para (Recebendo):</strong><br/>${insp.to_person_name}</div>
          <div class="box"><strong>Quilometragem (KM):</strong> ${insp.km.toLocaleString('pt-BR')} km | <strong>Combustível:</strong> ${insp.fuel_level}</div>
          <div class="box"><strong>Operação:</strong> ${insp.inspection_type.toUpperCase()} | <strong>Hash SHA-256:</strong> <span style="font-family:monospace;font-size:10px;">${(insp.photos_sha256 || '').slice(0, 20)}...</span></div>
        </div>
        ${insp.damage_notes ? `<div class="box" style="margin-bottom:14px;border-color:#f87171;"><strong>Relato de Avaria:</strong> ${insp.damage_notes}</div>` : ''}
        ${insp.review_notes ? `<div class="box" style="margin-bottom:14px;"><strong>Parecer do Supervisor:</strong> ${insp.review_notes}</div>` : ''}
        <table>
          <thead><tr><th style="text-align:left;padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Item Verificado</th><th style="text-align:left;padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Estado</th></tr></thead>
          <tbody>${checklistHtml}</tbody>
        </table>
        <h3 style="font-size:14px;margin-bottom:6px;">Registro Fotográfico Obrigatório dos 4 Lados</h3>
        <div class="photos">
          <div class="photo-card"><strong>1. Frente (Dianteira)</strong><br/><img src="${insp.photo_front || ''}" /></div>
          <div class="photo-card"><strong>2. Traseira</strong><br/><img src="${insp.photo_back || ''}" /></div>
          <div class="photo-card"><strong>3. Lateral Esquerda</strong><br/><img src="${insp.photo_left || ''}" /></div>
          <div class="photo-card"><strong>4. Lateral Direita</strong><br/><img src="${insp.photo_right || ''}" /></div>
        </div>
        ${
          insp.signature_data
            ? `<div class="sig"><div>Assinatura Digital do Condutor (${insp.to_person_name})</div><img src="${insp.signature_data}" /></div>`
            : ''
        }
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>
    `);
    win.document.close();
  }

  async function handleSubmitDamage() {
    setDmgError(null);
    if (!dmgVehicleId || !dmgDesc.trim()) {
      setDmgError('Selecione o veículo e descreva o problema ou avaria.');
      return;
    }
    setDmgSubmitting(true);
    try {
      await api.post('/api/fleet/damages', {
        vehicle_id: Number(dmgVehicleId),
        occurrence_type: dmgType,
        severity: dmgSeverity,
        affected_part: dmgPart.trim(),
        driver_name: dmgDriver.trim(),
        km: Number(dmgKm || 0),
        bo_number: dmgBo.trim(),
        description: dmgDesc.trim(),
        photos: dmgPhotos,
      });
      setDmgModalOpen(false);
      setActiveTab('ocorrencias');
      loadAll();
    } catch (err) {
      setDmgError(err instanceof ApiError ? err.message : 'Erro ao registrar avaria.');
    } finally {
      setDmgSubmitting(false);
    }
  }

  async function handleUpdateDamageStatus() {
    if (!updatingDmg) return;
    setDmgUpdating(true);
    try {
      await api.put(`/api/fleet/damages/${updatingDmg.id}`, {
        status: dmgNewStatus,
        resolution_notes: dmgResolutionNotes.trim(),
      });
      setUpdatingDmg(null);
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao atualizar avaria.');
    } finally {
      setDmgUpdating(false);
    }
  }

  async function handleSaveTires() {
    if (!selectedTireVehicle) return;
    setSavingTires(true);
    try {
      await api.put(`/api/fleet/vehicles/${selectedTireVehicle.id}/tires`, {
        tires: tireDrafts,
        current_km: Number(tireKmDraft || 0),
      });
      setTireSavedToast(true);
      setTimeout(() => setTireSavedToast(false), 2500);
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao salvar pneus.');
    } finally {
      setSavingTires(false);
    }
  }

  async function handleSubmitMaintenance() {
    if (!maintVehicleId || !maintTitle.trim() || !maintDate) {
      alert('Preencha o veículo, descrição/título e a data agendada.');
      return;
    }
    setMaintSubmitting(true);
    try {
      await api.post('/api/fleet/maintenances', {
        vehicle_id: Number(maintVehicleId),
        maintenance_type: maintType,
        title: maintTitle.trim(),
        scheduled_date: maintDate,
        target_km: Number(maintKm || 0),
        workshop: maintWorkshop.trim(),
        cost: Number(maintCost || 0),
        downtime_hours: maintDowntime.trim(),
        description: maintDesc.trim(),
        voucher_photo: maintVoucher,
      });
      setMaintModalOpen(false);
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao agendar manutenção.');
    } finally {
      setMaintSubmitting(false);
    }
  }

  async function handleCompleteMaintenance(m: FleetMaintenance) {
    const notes = prompt('Observações da conclusão da manutenção (opcional):', m.completion_notes || '');
    if (notes === null) return;
    await api.put(`/api/fleet/maintenances/${m.id}`, {
      status: 'Concluída',
      completion_notes: notes,
    });
    loadAll();
  }

  async function handleSubmitFine() {
    if (!fineVehicleId || !fineAuto.trim() || !fineDesc.trim()) {
      alert('Informe o veículo, número do auto e descrição da infração.');
      return;
    }
    setFineSubmitting(true);
    try {
      await api.post('/api/fleet/fines', {
        vehicle_id: Number(fineVehicleId),
        auto_number: fineAuto.trim(),
        infraction_date: fineDate,
        due_date: fineDueDate,
        driver_name: fineDriver.trim(),
        location: fineLocation.trim(),
        amount: Number(fineAmount || 0),
        discount_amount: Number(fineDiscount || 0),
        description: fineDesc.trim(),
        attachment_photo: finePhoto,
      });
      setFineModalOpen(false);
      loadAll();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao cadastrar multa.');
    } finally {
      setFineSubmitting(false);
    }
  }

  async function handleSendFineResponse() {
    if (!respondingFine || !fineResponseText.trim()) return;
    await api.put(`/api/fleet/fines/${respondingFine.id}/respond`, {
      driver_name: fineDriverInput.trim(),
      driver_response: fineResponseText.trim(),
    });
    setRespondingFine(null);
    loadAll();
  }

  async function handleSendFineDecision() {
    if (!decidingFine || !fineDecisionText.trim()) return;
    await api.put(`/api/fleet/fines/${decidingFine.id}/decide`, {
      company_decision: fineDecisionText.trim(),
      status: 'Concluída',
    });
    setDecidingFine(null);
    loadAll();
  }

  function sendWhatsapp(v: Vehicle) {
    const text =
      `🚗 *FICHA DE VEÍCULO — CLARO REDE EXTERNA*\n\n` +
      `*Placa:* ${v.plate || 'N/A'}\n` +
      `*Modelo:* ${v.model || v.type || 'N/A'}\n` +
      `*KM Atual:* ${(v.current_km || 0).toLocaleString('pt-BR')} km\n` +
      `*Responsável:* ${v.responsible_name || v.condutor_dia || 'Não atribuído'}\n` +
      `*Subcluster:* ${v.subclus || 'N/A'}\n` +
      `*Base / Área:* ${v.base || ''} ${v.area_rede || ''}\n` +
      `*Ticket Car:* ${v.ticket_car || 'N/A'}\n` +
      `*Equipamentos:* ${
        [
          v.has_rack ? 'Rack de Escada' : null,
          v.has_basket ? 'Cesto Aéreo' : null,
          v.has_giroflex ? 'Giroflex' : null,
          v.has_inverter ? 'Inversor 220V' : null,
        ]
          .filter(Boolean)
          .join(', ') || 'Padrão'
      }`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  const totalFilteredCount = groupedVehicles.reduce((acc, g) => acc + g.vehicles.length, 0);

  const [queueFilter, setQueueFilter] = useState<'todos' | 'repasses' | 'avarias'>('todos');

  const priorityWaitingQueue = useMemo(() => {
    type QueueItem = {
      uid: string;
      kind: 'repasse' | 'avaria';
      tier: 1 | 2 | 3; // 1 = Crítico, 2 = Urgente, 3 = Fila normal
      tierLabel: string;
      waitingMinutes: number;
      createdAtFmt: string;
      plate: string;
      vehicleModel: string;
      area: string;
      title: string;
      subtitle: string;
      detail?: string;
      inspection?: FleetInspection;
      damage?: FleetDamage;
    };

    const items: QueueItem[] = [];

    // 1. Vistorias Pendentes de Entrega / Recebimento
    inspections
      .filter((i) => i.status === 'pendente')
      .forEach((i) => {
        const wait = Number(i.waiting_minutes || 0);
        let tier: 1 | 2 | 3 = 3;
        let tierLabel = 'AGUARDANDO REVISÃO';
        if (i.has_damage) {
          tier = 1;
          tierLabel = 'CRÍTICO · REPASSE COM AVARIA';
        } else if (wait >= 120) {
          tier = 1;
          tierLabel = 'CRÍTICO · ESPERA > 2H';
        } else if (wait >= 30) {
          tier = 2;
          tierLabel = 'URGENTE · AGUARDANDO SUPERVISOR';
        }

        const opLabel =
          i.inspection_type === 'entrega'
            ? 'Entrega / Repasse'
            : i.inspection_type === 'recebimento'
            ? 'Recebimento / Devolução'
            : 'Vistoria Periódica';

        items.push({
          uid: `insp-${i.id}`,
          kind: 'repasse',
          tier,
          tierLabel,
          waitingMinutes: wait,
          createdAtFmt: i.created_at_fmt,
          plate: i.plate,
          vehicleModel: i.vehicle_model || 'Veículo da Frota',
          area: i.area_rede || i.base || i.subclus || 'Geral',
          title: `${opLabel}: ${i.from_person_name} ➔ ${i.to_person_name}`,
          subtitle: `KM: ${i.km.toLocaleString('pt-BR')} km · Combustível: ${i.fuel_level} · 4 Fotos + Assinatura`,
          detail: i.damage_notes ? `Avaria apontada: ${i.damage_notes}` : i.observations || undefined,
          inspection: i,
        });
      });

    // 2. Avarias / Quebrados Abertos (que não sejam duplicados da mesma vistoria pendente)
    const pendingInspIds = new Set(inspections.filter((i) => i.status === 'pendente').map((i) => i.id));
    damages
      .filter((d) => d.status !== 'Concluída' && (!d.inspection_id || !pendingInspIds.has(d.inspection_id)))
      .forEach((d) => {
        const wait = Number(d.waiting_minutes || 0);
        const isHigh = d.severity.includes('Crítica') || d.severity === 'Alta';
        let tier: 1 | 2 | 3 = isHigh ? 1 : d.severity === 'Média' ? 2 : 3;
        if (wait >= 240 && tier > 1) tier = 1;
        const tierLabel =
          d.severity.includes('Crítica')
            ? 'CRÍTICO · VEÍCULO PARADO'
            : tier === 1
            ? `CRÍTICO · AVARIA ${d.severity.toUpperCase()}`
            : tier === 2
            ? `URGENTE · ${d.status.toUpperCase()}`
            : `EM ACOMPANHAMENTO · ${d.status.toUpperCase()}`;

        items.push({
          uid: `dmg-${d.id}`,
          kind: 'avaria',
          tier,
          tierLabel,
          waitingMinutes: wait,
          createdAtFmt: d.created_at_fmt,
          plate: d.plate,
          vehicleModel: d.vehicle_model || 'Veículo da Frota',
          area: d.area || 'Geral',
          title: `${d.occurrence_type}${d.affected_part ? ` — ${d.affected_part}` : ''}`,
          subtitle: `Reportado por ${d.reported_by_name}${d.driver_name ? ` · Condutor: ${d.driver_name}` : ''}`,
          detail: d.description,
          damage: d,
        });
      });

    // Filtra por área se o filtro de área estiver ativo
    const areaFiltered = items.filter((item) => {
      if (queueFilter === 'repasses' && item.kind !== 'repasse') return false;
      if (queueFilter === 'avarias' && item.kind !== 'avaria') return false;
      if (selectedArea !== 'Todas') {
        return item.area.toLowerCase().includes(selectedArea.toLowerCase());
      }
      return true;
    });

    // Ordena: 1º Mais Crítico (tier 1 -> 2 -> 3), 2º Entrega/Repasse antes de Avaria no mesmo tier, 3º Maior tempo de espera (waitingMinutes DESC)
    areaFiltered.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.kind !== b.kind) return a.kind === 'repasse' ? -1 : 1;
      return b.waitingMinutes - a.waitingMinutes;
    });

    return areaFiltered;
  }, [inspections, damages, queueFilter, selectedArea]);

  const filteredInspections = useMemo(() => {
    return inspections.filter((i) => {
      if (inspStatusFilter !== 'todos' && i.status !== inspStatusFilter) return false;
      if (selectedArea !== 'Todas') {
        const areaStr = `${i.area_rede || ''} ${i.base || ''} ${i.subclus || ''}`.toLowerCase();
        if (!areaStr.includes(selectedArea.toLowerCase())) return false;
      }
      return true;
    });
  }, [inspections, inspStatusFilter, selectedArea]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Gestão Completa de Frotas & Vistoria Veicular"
        subtitle="Controle de repasse com 4 fotos obrigatórias, assinatura digital, aprovação de supervisor, avarias, pneus por KM, manutenções e multas"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => openInspectionModal()}
              className="border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/15"
            >
              <Camera className="w-4 h-4" /> Passar / Receber Veículo (4 Fotos)
            </Button>
            <Button
              variant="outline"
              onClick={() => openDamageModal()}
              className="border-amber-500/35 text-amber-300 hover:bg-amber-500/15"
            >
              <AlertTriangle className="w-4 h-4" /> Reportar Avaria
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/api/vehicles/export';
              }}
            >
              <Download className="w-4 h-4" /> Exportar Frota
            </Button>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" /> Cadastrar Veículo
              </Button>
            )}
          </div>
        }
      />

      {/* ===================================================================== */}
      {/* LISTA DE ESPERA ESPECIAL NO TOPO (ORDENADA POR CRITICIDADE & TEMPO)    */}
      {/* ===================================================================== */}
      <Card className="p-5 border border-amber-500/35 bg-gradient-to-b from-[#161118]/95 via-[#0c0f17]/95 to-[#090C13] shadow-[0_16px_45px_rgba(0,0,0,0.75)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Fila Especial de Espera & Revisão de Supervisão
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/20 text-red-200 border border-red-500/40">
                {priorityWaitingQueue.length} pendente{priorityWaitingQueue.length === 1 ? '' : 's'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
              Veículos Pendentes de Revisão (Entrega / Recebimento & Avarias Críticas)
            </h2>
            <p className="text-xs text-slate-400">
              Ordenados automaticamente pela <strong>gravidade/criticidade</strong> e pelo <strong>tempo de espera na fila</strong> para aprovação rápida do supervisor/coordenador.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'todos', label: 'Toda a Fila Prioritária' },
                { id: 'repasses', label: `Entrega / Recebimento (${stats.pendingInsp})` },
                { id: 'avarias', label: `Avarias / Quebrados (${stats.openDamages})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setQueueFilter(f.id)}
                className={`h-8 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  queueFilter === f.id
                    ? 'bg-white text-black shadow'
                    : 'bg-white/[0.04] text-slate-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {priorityWaitingQueue.length === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-400 font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Nenhum veículo aguardando revisão de entrega/recebimento ou avaria aberta neste momento!</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
            {priorityWaitingQueue.map((item, idx) => {
              const isCritical = item.tier === 1;
              const isUrgent = item.tier === 2;

              return (
                <div
                  key={item.uid}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition ${
                    isCritical
                      ? 'bg-red-950/25 border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.12)]'
                      : isUrgent
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-white/[0.03] border-white/15'
                  }`}
                >
                  <div className="space-y-2">
                    {/* Top Row: Queue Position + Criticality + Waiting Time */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-mono text-[11px] font-black">
                          #{idx + 1}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#003399] text-white font-mono text-xs font-black tracking-wider">
                          {item.plate}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            isCritical
                              ? 'bg-red-500/25 text-red-200 border-red-400/50'
                              : isUrgent
                              ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
                              : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                          }`}
                        >
                          {item.tierLabel}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold border ${
                          isCritical
                            ? 'bg-red-500/20 text-red-200 border-red-500/40'
                            : 'bg-black/40 text-amber-300 border-white/10'
                        }`}
                        title={`Registrado em ${item.createdAtFmt}`}
                      >
                        ⏱ Espera: {formatWaitingTime(item.waitingMinutes)}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div>
                      <div className="text-sm font-extrabold text-white">{item.title}</div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        {item.vehicleModel} · Área: <strong className="text-white">{item.area}</strong> · {item.subtitle}
                      </div>
                    </div>

                    {item.detail && (
                      <div className="p-2.5 rounded-xl bg-black/35 border border-white/10 text-xs text-amber-200 line-clamp-2">
                        {item.detail}
                      </div>
                    )}
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Enviado em {item.createdAtFmt}
                    </span>
                    {item.kind === 'repasse' && item.inspection ? (
                      <Button
                        onClick={() => openInspectionDetail(item.inspection!.id)}
                        className="h-9 px-3.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Eye className="w-3.5 h-3.5" /> Revisar 4 Fotos & Aprovar Repasse
                      </Button>
                    ) : item.damage ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const v = (vehicles || []).find((veh) => veh.id === item.damage!.vehicle_id);
                            if (v) openVehicleHistory(v);
                          }}
                          className="h-8 px-3 text-xs"
                        >
                          Histórico
                        </Button>
                        {canReview && (
                          <Button
                            onClick={() => {
                              setUpdatingDmg(item.damage!);
                              setDmgNewStatus(
                                item.damage!.status === 'Aberta' ? 'Em Análise' : item.damage!.status
                              );
                              setDmgResolutionNotes(item.damage!.resolution_notes || '');
                            }}
                            className="h-8 px-3 text-xs"
                          >
                            <Wrench className="w-3.5 h-3.5" /> Tratar Avaria
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* PAINEL DE INDICADORES OPERACIONAIS DA FROTA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('veiculos')}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/5 hover:border-white/20 text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Frota Total
            </p>
            <p className="text-base font-extrabold text-white mono">{stats.total}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('checklists');
            setInspStatusFilter('pendente');
          }}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/[0.07] hover:border-white/[0.16] text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Repasses Pendentes
            </p>
            <p className="text-base font-extrabold text-white mono flex items-center gap-1.5">
              <span>{stats.pendingInsp}</span>
              {stats.pendingInsp > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ocorrencias')}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/[0.07] hover:border-white/[0.16] text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Avarias em Aberto
            </p>
            <p className="text-base font-extrabold text-white mono flex items-center gap-1.5">
              <span>{stats.openDamages}</span>
              {stats.openDamages > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pneus')}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/[0.07] hover:border-white/[0.16] text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <Disc className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Pneus por KM
            </p>
            <p className="text-xs font-bold text-neutral-200 mt-0.5">Monitorado</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manutencoes')}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/[0.07] hover:border-white/[0.16] text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <Wrench className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Manutenções
            </p>
            <p className="text-base font-extrabold text-white mono">{stats.activeMaint}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('multas')}
          className="p-3.5 rounded-2xl glass flex items-center gap-3 border border-white/[0.07] hover:border-white/[0.16] text-left transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-neutral-300 flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 truncate">
              Alertas & Multas
            </p>
            <p className="text-base font-extrabold text-white mono">{stats.totalAlerts}</p>
          </div>
        </button>
      </div>

      {/* BARRA DE NAVEGAÇÃO DOS 6 MÓDULOS DE FROTA */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-white/10">
        {(
          [
            { id: 'veiculos', label: 'Veículos & Documentos', icon: Car },
            { id: 'checklists', label: `Vistoria 4 Lados & Repasse (${inspections.length})`, icon: ClipboardCheck, badge: stats.pendingInsp },
            { id: 'ocorrencias', label: `Avarias & Ocorrências (${damages.length})`, icon: AlertTriangle, badge: stats.openDamages },
            { id: 'pneus', label: 'Pneus por Quilometragem', icon: Disc },
            { id: 'manutencoes', label: `Manutenções (${maintenances.length})`, icon: Wrench },
            { id: 'multas', label: `Multas & Alertas (${alerts.length})`, icon: BellRing, badge: stats.pendingFines },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                active
                  ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-[var(--color-text-muted)] border border-white/10'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {'badge' in tab && tab.badge ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-black/30 text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: VEÍCULOS & DOCUMENTOS                                          */}
      {/* ===================================================================== */}
      {activeTab === 'veiculos' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por placa, modelo, condutor, área..."
                  className="pl-11 rounded-full"
                />
              </div>

              <div className="w-full sm:w-64">
                <Select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  aria-label="Filtrar veículos por área"
                  className="rounded-full"
                >
                  {availableAreas.map((a) => (
                    <option key={a} value={a}>
                      {a === 'Todas' ? 'Todas as Áreas / Bases' : `Área: ${a}`}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {availableModels.map((m) => {
                const active = selectedModel === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedModel(m)}
                    className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] text-[var(--color-text-muted)] border border-white/10'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {vehicles === null ? (
            <div className="py-16 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              <span>Carregando frota de veículos...</span>
            </div>
          ) : totalFilteredCount === 0 ? (
            <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
              Nenhum veículo encontrado com os filtros atuais.
            </Card>
          ) : (
            <div className="space-y-10">
              {groupedVehicles.map((group) => {
                const withTechCount = group.vehicles.filter((v) => v.responsible_name || v.condutor_dia).length;
                const withRackCount = group.vehicles.filter((v) => v.has_rack).length;

                return (
                  <section key={group.model} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-white/[0.08]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 font-bold">
                          <Car className="w-4 h-4" />
                        </div>
                        <div>
                          <h2 className="text-base font-extrabold text-white tracking-[-0.02em]">{group.model}</h2>
                          <p className="text-xs text-neutral-500">
                            {group.total} veículo{group.total > 1 ? 's' : ''} · {withTechCount} com condutor
                            {withRackCount > 0 ? ` · ${withRackCount} com rack` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.vehicles.map((v) => {
                        const hasTech = Boolean(v.responsible_name || v.condutor_dia);
                        const openDmgCount = Number(v.open_damages_count || 0);
                        const pendingInspCount = Number(v.pending_inspections_count || 0);

                        return (
                          <Card
                            key={v.id}
                            className="p-4 flex flex-col gap-3 rounded-2xl bg-[#090C13]/92 border border-white/[0.08] hover:border-white/[0.16] transition-all duration-200 group"
                          >
                            {/* PLACA MERCOSUL & STATUS MINIMALISTA */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center rounded-md overflow-hidden border border-white/20 bg-white text-black font-bold shrink-0">
                                <div className="bg-[#003399] text-white text-[8px] px-1.5 py-1 flex items-center font-black tracking-wider">
                                  BR
                                </div>
                                <div className="px-2 py-0.5 text-xs font-mono font-black tracking-widest text-slate-900 bg-white">
                                  {v.plate}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 min-w-0">
                                {v.subclus && (
                                  <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[110px]">
                                    {v.subclus}
                                  </span>
                                )}
                                <span
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 shrink-0"
                                  title={
                                    openDmgCount > 0
                                      ? `${openDmgCount} avaria(s) em aberto`
                                      : pendingInspCount > 0
                                      ? 'Repasse pendente de aprovação'
                                      : v.operational_status || 'Operacional'
                                  }
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      openDmgCount > 0
                                        ? 'bg-red-400'
                                        : pendingInspCount > 0
                                        ? 'bg-amber-400'
                                        : 'bg-emerald-400'
                                    }`}
                                  />
                                  <span>
                                    {openDmgCount > 0
                                      ? `${openDmgCount} avaria${openDmgCount > 1 ? 's' : ''}`
                                      : pendingInspCount > 0
                                      ? 'Pendente'
                                      : v.operational_status || 'Operacional'}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <VehiclePreview
                              type={v.type}
                              model={v.model || v.type}
                              hasRack={v.has_rack}
                              hasBasket={v.has_basket}
                              hasGiroflex={v.has_giroflex}
                              hasInverter={v.has_inverter}
                              plate={v.plate}
                            />

                            {/* CONDUTOR & ESPECIFICAÇÕES EM BLOCO UNIFICADO */}
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider block">
                                      Condutor
                                    </span>
                                    <p className={`text-xs font-bold truncate ${hasTech ? 'text-white' : 'text-neutral-500'}`}>
                                      {v.responsible_name || v.condutor_dia || 'Sem condutor'}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[11px] font-mono font-semibold text-neutral-400 shrink-0">
                                  {(v.current_km || 0).toLocaleString('pt-BR')} km
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-white/[0.05] text-[11px]">
                                <div className="min-w-0">
                                  <span className="text-[9px] uppercase font-bold text-neutral-500 block">Base / Área</span>
                                  <span className="font-medium text-neutral-200 truncate block">
                                    {[v.base, v.area_rede].filter(Boolean).join(' · ') || '-'}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[9px] uppercase font-bold text-neutral-500 block">Ticket Car</span>
                                  <span className="font-mono font-medium text-neutral-200 truncate block">{v.ticket_car || '-'}</span>
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[9px] uppercase font-bold text-neutral-500 block">Frota</span>
                                  <span className="font-medium text-neutral-300 truncate block">
                                    {v.rental_company || v.insurance_company || 'Frota Claro'}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[9px] uppercase font-bold text-neutral-500 block">CRLV</span>
                                  <span className="font-mono font-medium text-neutral-300 truncate block">
                                    {v.crlv_expiration || 'Em dia'}
                                  </span>
                                </div>
                              </div>

                              {v.last_approved_by_name && (
                                <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-neutral-400">
                                  <span className="truncate">
                                    Aprovado por <strong className="text-neutral-200">{v.last_approved_by_name}</strong>
                                  </span>
                                  <span className="font-mono shrink-0 ml-1">{v.last_approved_at}</span>
                                </div>
                              )}
                            </div>

                            {/* BARRA DE AÇÕES MINIMALISTA (2 BOTÕES LIMPOS + ATALHOS DISCRETOS) */}
                            <div className="mt-auto flex items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => openInspectionModal(v)}
                                className="flex-1 h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                title="Passar ou receber veículo com 4 fotos obrigatórias"
                              >
                                <Camera className="w-3.5 h-3.5 shrink-0" />
                                <span>Repasse</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openVehicleHistory(v)}
                                className="flex-1 h-9 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                title="Consultar histórico completo do veículo"
                              >
                                <History className="w-3.5 h-3.5 shrink-0" />
                                <span>Histórico</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openDamageModal(v)}
                                className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-amber-300 transition cursor-pointer"
                                title="Reportar avaria ou quebrado"
                                aria-label="Reportar avaria"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTireVehicleId(v.id);
                                  setActiveTab('pneus');
                                }}
                                className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-white transition cursor-pointer"
                                title="Pneus por KM"
                                aria-label="Pneus por KM"
                              >
                                <Disc className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => sendWhatsapp(v)}
                                className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-emerald-400 transition cursor-pointer"
                                title="Enviar resumo no WhatsApp"
                                aria-label="WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(v)}
                                  className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-white transition cursor-pointer"
                                  title="Editar veículo"
                                  aria-label="Editar veículo"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(v)}
                                  aria-label="Excluir veículo"
                                  title="Excluir veículo"
                                  className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.03] hover:bg-red-500/15 border border-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-red-400 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: VISTORIAS 4 LADOS, ASSINATURA & APROVAÇÃO DE SUPERVISOR         */}
      {/* ===================================================================== */}
      {activeTab === 'checklists' && (
        <div className="space-y-5">
          <Card className="p-5 border border-emerald-500/25 bg-gradient-to-r from-[#090C13] via-[#0d1520] to-[#090C13]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Vistoria Digital com 4 Fotos Obrigatórias, Assinatura e Revisão de Supervisor</span>
                </div>
                <h2 className="text-lg font-extrabold text-white">
                  Entrega e Recebimento de Veículo com Rastreabilidade Total
                </h2>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Todo repasse ou devolução exige fotos nítidas dos <strong>4 lados do veículo</strong> (Frente, Traseira, Lateral Esquerda e Lateral Direita), quilometragem, assinatura digital na tela e aprovação de um Supervisor ou Coordenador, gravando permanentemente no banco de dados quem aprovou, em qual data e hora, e de qual pessoa para qual pessoa.
                </p>
              </div>
              <Button onClick={() => openInspectionModal()} className="shrink-0">
                <Camera className="w-4 h-4" /> Novo Formulário de Entrega / Recebimento
              </Button>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { id: 'todos', label: `Todas (${inspections.length})` },
                  { id: 'pendente', label: `Pendentes de Supervisor (${stats.pendingInsp})` },
                  { id: 'aprovado', label: 'Aprovadas' },
                  { id: 'reprovado', label: 'Reprovadas' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setInspStatusFilter(st.id)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    inspStatusFilter === st.id
                      ? 'bg-white text-black shadow'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {filteredInspections.length === 0 ? (
            <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
              Nenhum formulário veicular registrado neste filtro. Clique em <strong>Novo Formulário de Entrega / Recebimento</strong> para iniciar.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInspections.map((insp) => (
                <Card key={insp.id} className="p-5 flex flex-col justify-between gap-4 border border-white/10">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-[#003399] text-white font-mono text-xs font-black tracking-wider">
                          {insp.plate}
                        </span>
                        <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200">
                          {insp.inspection_type === 'entrega'
                            ? 'Entrega / Repasse'
                            : insp.inspection_type === 'recebimento'
                            ? 'Recebimento / Devolução'
                            : 'Vistoria Periódica'}
                        </span>
                        {insp.has_damage && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300">
                            Com Apontamento de Avaria
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          insp.status === 'aprovado'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                            : insp.status === 'reprovado'
                            ? 'bg-red-500/15 text-red-300 border border-red-500/35'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                        }`}
                      >
                        {insp.status === 'aprovado'
                          ? '✓ Aprovado pelo Supervisor'
                          : insp.status === 'reprovado'
                          ? '✕ Reprovado'
                          : '⏳ Aguardando Aprovação'}
                      </span>
                    </div>

                    {/* DE QUEM PARA QUEM */}
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 block font-bold">Entregando (De)</span>
                        <strong className="text-white text-sm">{insp.from_person_name}</strong>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[var(--color-primary)] hidden sm:block shrink-0" />
                      <div className="sm:text-right">
                        <span className="text-[10px] uppercase text-slate-400 block font-bold">Recebendo (Para)</span>
                        <strong className="text-emerald-300 text-sm">{insp.to_person_name}</strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>
                        KM: <strong className="text-white font-mono">{insp.km.toLocaleString('pt-BR')} km</strong> · Combustível:{' '}
                        <strong className="text-white">{insp.fuel_level}</strong>
                      </span>
                      <span>
                        Enviado em <strong className="text-slate-200">{insp.created_at_fmt}</strong>
                      </span>
                    </div>

                    {/* SELO DE REVISÃO DO SUPERVISOR */}
                    {insp.approved_by_name && (
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          insp.status === 'aprovado'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-red-500/10 border-red-500/30 text-red-200'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between gap-2">
                          <span>
                            {insp.status === 'aprovado' ? 'Aprovado e revisado por:' : 'Revisado por:'}{' '}
                            {insp.approved_by_name} ({insp.approved_by_role || 'Supervisor'})
                          </span>
                          <span className="font-mono text-[11px]">{insp.approved_at_fmt}</span>
                        </div>
                        <div className="text-[11px] opacity-90">
                          Repasse de <strong>{insp.from_person_name}</strong> para <strong>{insp.to_person_name}</strong>
                        </div>
                        {insp.review_notes && (
                          <div className="text-[11px] pt-1 border-t border-white/10">
                            <strong>Observação da supervisão:</strong> {insp.review_notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <span className="text-[10px] font-mono text-slate-500">
                      4 Fotos + Assinatura no BD · SHA256: {(insp.photos_sha256 || '').slice(0, 10)}...
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => openInspectionDetail(insp.id)}
                      className="h-9 px-3.5 text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {insp.status === 'pendente' && canReview
                        ? 'Revisar Fotos & Aprovar'
                        : 'Ver 4 Fotos & Comprovante'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: AVARIAS & OCORRÊNCIAS (HISTÓRICO IMUTÁVEL DO CARRO)            */}
      {/* ===================================================================== */}
      {activeTab === 'ocorrencias' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">
                Ocorrências & Avarias — Do Registro à Conclusão
              </h2>
              <p className="text-xs text-slate-400">
                Qualquer quebrado, batida ou defeito reportado fica gravado permanentemente no histórico do veículo com fotos no banco de dados.
              </p>
            </div>
            <Button onClick={() => openDamageModal()}>
              <Plus className="w-4 h-4" /> Reportar Avaria / Quebrado
            </Button>
          </div>

          {damages.length === 0 ? (
            <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
              Nenhuma avaria ou ocorrência registrada até o momento.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {damages.map((dmg) => (
                <Card key={dmg.id} className="p-5 flex flex-col justify-between gap-4 border border-white/10">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-[#003399] text-white font-mono text-xs font-black">
                          {dmg.plate}
                        </span>
                        <span className="text-xs font-bold text-white">{dmg.occurrence_type}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            dmg.severity.includes('Crítica') || dmg.severity === 'Alta'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          Gravidade: {dmg.severity}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          dmg.status === 'Concluída'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : dmg.status === 'Em Oficina'
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'bg-red-500/15 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {dmg.status}
                      </span>
                    </div>

                    {dmg.affected_part && (
                      <div className="text-xs font-semibold text-amber-300">
                        Parte afetada: {dmg.affected_part}
                      </div>
                    )}

                    <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      {dmg.description}
                    </p>

                    {Array.isArray(dmg.photos_json) && dmg.photos_json.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {dmg.photos_json.map((src, idx) => (
                          <a
                            key={idx}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-xl overflow-hidden border border-white/15 h-24 bg-black"
                          >
                            <img src={src} alt={`Evidência ${idx + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                      <span>
                        Reportado por <strong className="text-slate-200">{dmg.reported_by_name}</strong> em{' '}
                        {dmg.created_at_fmt}
                      </span>
                      {dmg.bo_number && <span className="font-mono text-amber-300">BO: {dmg.bo_number}</span>}
                    </div>

                    {dmg.resolution_notes && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200">
                        <strong>Tratativa / Conclusão ({dmg.resolved_by_name || 'Supervisão'}):</strong>{' '}
                        {dmg.resolution_notes}
                        {dmg.resolved_at_fmt && <span className="block text-[10px] opacity-80 mt-0.5">Concluído em {dmg.resolved_at_fmt}</span>}
                      </div>
                    )}
                  </div>

                  {canReview && (
                    <div className="flex justify-end pt-2 border-t border-white/10">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setUpdatingDmg(dmg);
                          setDmgNewStatus(dmg.status === 'Aberta' ? 'Em Análise' : dmg.status);
                          setDmgResolutionNotes(dmg.resolution_notes || '');
                        }}
                        className="h-9 px-3.5 text-xs"
                      >
                        <Wrench className="w-3.5 h-3.5" /> Tratar / Atualizar Status
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: PNEUS ACOMPANHADOS POR QUILOMETRAGEM                           */}
      {/* ===================================================================== */}
      {activeTab === 'pneus' && (
        <div className="space-y-6">
          <Card className="p-5 border border-white/10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Cuidado Preventivo — Pneus Acompanhados por Quilometragem
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  O diagrama abaixo mostra a posição e o estado de cada pneu. As cores mudam conforme a aproximação da verificação, do rodízio ou da troca.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={selectedTireVehicleId ? String(selectedTireVehicleId) : ''}
                  onChange={(e) => setSelectedTireVehicleId(Number(e.target.value))}
                  className="w-64"
                >
                  {(vehicles || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.model || v.type} ({(v.current_km || 0).toLocaleString('pt-BR')} km)
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          {selectedTireVehicle && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* DIAGRAMA VISUAL DO CHASSI & 5 PNEUS */}
              <Card className="lg:col-span-5 p-6 flex flex-col items-center justify-center space-y-5">
                <div className="w-full flex items-center justify-between text-xs">
                  <span className="font-bold text-white">
                    {selectedTireVehicle.plate} · {selectedTireVehicle.model || selectedTireVehicle.type}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">KM Atual:</span>
                    <input
                      type="number"
                      value={tireKmDraft}
                      onChange={(e) => setTireKmDraft(e.target.value)}
                      className="w-28 px-2.5 py-1 rounded-lg bg-white/5 border border-white/15 font-mono text-xs text-white text-right"
                    />
                  </div>
                </div>

                {/* Desenho Esquemático do Veículo */}
                <div className="relative w-64 h-80 rounded-[40px] border-2 border-white/15 bg-[#0d111a] flex flex-col items-center justify-between py-8 px-6 shadow-inner">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Frente</div>

                  {/* Eixo Dianteiro */}
                  <div className="w-full flex items-center justify-between">
                    {(['fl', 'fr'] as const).map((pos) => {
                      const st = getTireComputedState(tireDrafts[pos], Number(tireKmDraft || 0));
                      const tone =
                        st === 'critical'
                          ? 'bg-red-500/30 border-red-400 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                          : st === 'warning'
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          : 'bg-emerald-500/25 border-emerald-400 text-emerald-200';
                      return (
                        <div
                          key={pos}
                          className={`w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center text-center p-1 transition ${tone}`}
                        >
                          <span className="text-[9px] font-black uppercase">{pos === 'fl' ? 'D. ESQ' : 'D. DIR'}</span>
                          <span className="text-[10px] font-mono font-bold mt-1">
                            {tireDrafts[pos]?.tread_mm ? `${tireDrafts[pos]?.tread_mm}mm` : st.toUpperCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Eixo Central Chassis */}
                  <div className="w-1 h-16 bg-white/10 rounded-full" />

                  {/* Eixo Traseiro */}
                  <div className="w-full flex items-center justify-between">
                    {(['rl', 'rr'] as const).map((pos) => {
                      const st = getTireComputedState(tireDrafts[pos], Number(tireKmDraft || 0));
                      const tone =
                        st === 'critical'
                          ? 'bg-red-500/30 border-red-400 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                          : st === 'warning'
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          : 'bg-emerald-500/25 border-emerald-400 text-emerald-200';
                      return (
                        <div
                          key={pos}
                          className={`w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center text-center p-1 transition ${tone}`}
                        >
                          <span className="text-[9px] font-black uppercase">{pos === 'rl' ? 'T. ESQ' : 'T. DIR'}</span>
                          <span className="text-[10px] font-mono font-bold mt-1">
                            {tireDrafts[pos]?.tread_mm ? `${tireDrafts[pos]?.tread_mm}mm` : st.toUpperCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Estepe */}
                  {(() => {
                    const st = getTireComputedState(tireDrafts.spare, Number(tireKmDraft || 0));
                    const tone =
                      st === 'critical'
                        ? 'bg-red-500/30 border-red-400 text-red-200'
                        : st === 'warning'
                        ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                        : 'bg-emerald-500/25 border-emerald-400 text-emerald-200';
                    return (
                      <div className={`px-4 py-1.5 rounded-full border text-[10px] font-bold ${tone}`}>
                        ESTEPE: {st === 'ok' ? 'EM DIA' : st === 'warning' ? 'ATENÇÃO' : 'TROCAR'}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Em dia
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Rodízio Próximo
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Troca / Crítico
                  </span>
                </div>
              </Card>

              {/* TABELA DE EDIÇÃO DOS 5 PNEUS POR KM */}
              <Card className="lg:col-span-7 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Parâmetros por Posição do Pneu</h3>
                  {tireSavedToast && (
                    <span className="text-xs font-bold text-emerald-400 inline-flex items-center gap-1">
                      <Check className="w-4 h-4" /> Dados de pneus salvos no banco!
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {TIRE_POSITIONS.map((pos) => {
                    const info = tireDrafts[pos.key] || {};
                    return (
                      <div
                        key={pos.key}
                        className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end"
                      >
                        <div className="sm:col-span-1">
                          <span className="text-xs font-bold text-white block">{pos.short}</span>
                          <span className="text-[10px] text-slate-400">{pos.label}</span>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Marca / Medida</label>
                          <input
                            type="text"
                            value={info.brand || ''}
                            onChange={(e) =>
                              setTireDrafts((prev) => ({
                                ...prev,
                                [pos.key]: { ...prev[pos.key], brand: e.target.value },
                              }))
                            }
                            placeholder="Ex: Pirelli 175/70"
                            className="w-full h-9 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">KM Próx. Revisão/Troca</label>
                          <input
                            type="number"
                            value={info.next_check_km || ''}
                            onChange={(e) =>
                              setTireDrafts((prev) => ({
                                ...prev,
                                [pos.key]: { ...prev[pos.key], next_check_km: Number(e.target.value || 0) },
                              }))
                            }
                            placeholder="Ex: 65000"
                            className="w-full h-9 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Sulco (mm)</label>
                          <input
                            type="text"
                            value={info.tread_mm || ''}
                            onChange={(e) =>
                              setTireDrafts((prev) => ({
                                ...prev,
                                [pos.key]: { ...prev[pos.key], tread_mm: e.target.value },
                              }))
                            }
                            placeholder="Ex: 4.5"
                            className="w-full h-9 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Estado</label>
                          <select
                            value={info.condition || 'ok'}
                            onChange={(e) =>
                              setTireDrafts((prev) => ({
                                ...prev,
                                [pos.key]: {
                                  ...prev[pos.key],
                                  condition: e.target.value as 'ok' | 'warning' | 'critical',
                                },
                              }))
                            }
                            className="w-full h-9 px-2 rounded-lg bg-[#090C13] border border-white/10 text-xs text-white"
                          >
                            <option value="ok">Em dia (Verde)</option>
                            <option value="warning">Rodízio / Atenção (Âmbar)</option>
                            <option value="critical">Trocar / Crítico (Vermelho)</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveTires} disabled={savingTires}>
                    {savingTires ? 'Salvando...' : 'Salvar Quilometragem & Pneus'}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: MANUTENÇÕES (AGENDA ATUAL & HISTÓRICO SEPARADOS)               */}
      {/* ===================================================================== */}
      {activeTab === 'manutencoes' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMaintViewMode('agenda')}
                className={`h-10 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
                  maintViewMode === 'agenda'
                    ? 'bg-white text-black shadow'
                    : 'bg-white/[0.04] text-slate-300 border border-white/10'
                }`}
              >
                Agenda Atual ({maintenances.filter((m) => m.status !== 'Concluída').length})
              </button>
              <button
                type="button"
                onClick={() => setMaintViewMode('historico')}
                className={`h-10 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
                  maintViewMode === 'historico'
                    ? 'bg-white text-black shadow'
                    : 'bg-white/[0.04] text-slate-300 border border-white/10'
                }`}
              >
                Histórico Concluído ({maintenances.filter((m) => m.status === 'Concluída').length})
              </button>
            </div>

            <Button
              onClick={() => {
                setMaintVehicleId(vehicles?.[0]?.id ? String(vehicles[0].id) : '');
                setMaintTitle('');
                setMaintDate(new Date().toISOString().slice(0, 10));
                setMaintKm('');
                setMaintWorkshop('');
                setMaintCost('');
                setMaintDowntime('');
                setMaintDesc('');
                setMaintVoucher('');
                setMaintModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4" /> Agendar Manutenção
            </Button>
          </div>

          {(() => {
            const list = maintenances.filter((m) =>
              maintViewMode === 'agenda' ? m.status !== 'Concluída' : m.status === 'Concluída'
            );
            if (list.length === 0) {
              return (
                <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
                  {maintViewMode === 'agenda'
                    ? 'Nenhuma manutenção agendada ou em oficina no momento.'
                    : 'Nenhuma manutenção concluída no histórico.'}
                </Card>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {list.map((m) => (
                  <Card key={m.id} className="p-5 flex flex-col justify-between gap-3 border border-white/10">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-[#003399] text-white font-mono text-xs font-black">
                            {m.plate}
                          </span>
                          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            {m.maintenance_type}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-amber-300 font-bold">
                          Data: {m.scheduled_date}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white">{m.title}</h3>
                      {m.description && <p className="text-xs text-slate-300">{m.description}</p>}

                      <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] text-slate-400">
                        <div>
                          Oficina: <strong className="text-white block truncate">{m.workshop || '-'}</strong>
                        </div>
                        <div>
                          Custo: <strong className="text-emerald-300 block">R$ {Number(m.cost || 0).toFixed(2)}</strong>
                        </div>
                        <div>
                          Tempo Parado: <strong className="text-white block">{m.downtime_hours || '-'}</strong>
                        </div>
                      </div>

                      {m.completion_notes && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200">
                          <strong>Conclusão ({m.completed_by_name}):</strong> {m.completion_notes} ({m.completed_at_fmt})
                        </div>
                      )}
                    </div>

                    {m.status !== 'Concluída' && (
                      <div className="flex justify-end pt-2 border-t border-white/10">
                        <Button variant="outline" onClick={() => handleCompleteMaintenance(m)} className="h-8 px-3 text-xs">
                          <Check className="w-3.5 h-3.5" /> Marcar como Concluída
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: MULTAS & ALERTAS ACIONÁVEIS POR ÁREA                           */}
      {/* ===================================================================== */}
      {activeTab === 'multas' && (
        <div className="space-y-6">
          {/* PAINEL DE ALERTAS ACIONÁVEIS */}
          <Card className="p-5 space-y-4 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-[var(--color-primary)]" />
                  Alertas Acionáveis por Área ({alerts.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Notificações direcionadas para supervisores resolverem pendências de repasse, avarias, pneus, CRLV e multas.
                </p>
              </div>
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-emerald-400 py-4 text-center font-semibold">
                ✓ Nenhum alerta pendente na frota! Todos os veículos estão em conformidade.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                      al.severity === 'critical'
                        ? 'bg-red-500/10 border-red-500/35 text-red-200'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-black/30">
                          {al.category}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/10">
                          Área: {al.area}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white">{al.title}</div>
                      <p className="text-[11px] opacity-90">{al.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab(al.target_tab)}
                      className="px-2.5 py-1.5 rounded-lg bg-white text-black text-[11px] font-bold shrink-0 cursor-pointer"
                    >
                      Resolver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* GESTÃO DE MULTAS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">Multas — Indicação de Condutor & Tratativas</h2>
              <p className="text-xs text-slate-400">
                Ao responder, a multa entra em análise. Depois da decisão da empresa, o condutor consulta a conclusão e observação registrada.
              </p>
            </div>
            {canReview && (
              <Button
                onClick={() => {
                  setFineVehicleId(vehicles?.[0]?.id ? String(vehicles[0].id) : '');
                  setFineAuto('');
                  setFineDate(new Date().toISOString().slice(0, 10));
                  setFineDueDate('');
                  setFineDriver('');
                  setFineLocation('');
                  setFineAmount('');
                  setFineDiscount('');
                  setFineDesc('');
                  setFinePhoto('');
                  setFineModalOpen(true);
                }}
              >
                <Plus className="w-4 h-4" /> Registrar Multa
              </Button>
            )}
          </div>

          {fines.length === 0 ? (
            <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
              Nenhuma multa registrada na frota.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fines.map((fn) => (
                <Card key={fn.id} className="p-5 flex flex-col justify-between gap-3 border border-white/10">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-[#003399] text-white font-mono text-xs font-black">
                          {fn.plate}
                        </span>
                        <span className="text-xs font-mono font-bold text-white">Auto: {fn.auto_number}</span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          fn.status === 'Concluída'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : fn.status === 'Em Análise'
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {fn.status}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-white">{fn.description}</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                      <div>
                        Condutor: <strong className="text-white block truncate">{fn.driver_name || 'A indicar'}</strong>
                      </div>
                      <div>
                        Valor: <strong className="text-white block">R$ {Number(fn.amount || 0).toFixed(2)}</strong>
                      </div>
                      <div>
                        Vencimento: <strong className="text-amber-300 block">{fn.due_date || fn.infraction_date}</strong>
                      </div>
                    </div>

                    {fn.driver_response && (
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-200">
                        <strong> Manifestação do Condutor ({fn.driver_responded_at_fmt}):</strong> {fn.driver_response}
                      </div>
                    )}

                    {fn.company_decision && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                        <strong>Decisão da Empresa ({fn.decided_by_name} · {fn.decided_at_fmt}):</strong>{' '}
                        {fn.company_decision}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    {fn.status !== 'Concluída' && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRespondingFine(fn);
                          setFineDriverInput(fn.driver_name || formatPersonName(user?.name || user?.username || ''));
                          setFineResponseText(fn.driver_response || '');
                        }}
                        className="h-8 px-3 text-xs"
                      >
                        Responder / Indicar Condutor
                      </Button>
                    )}
                    {canReview && (
                      <Button
                        onClick={() => {
                          setDecidingFine(fn);
                          setFineDecisionText(fn.company_decision || '');
                        }}
                        className="h-8 px-3 text-xs"
                      >
                        Registrar Decisão
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: FORMULÁRIO VEICULAR (4 FOTOS OBRIGATÓRIAS + ASSINATURA)       */}
      {/* ===================================================================== */}
      <Modal
        open={inspModalOpen}
        onClose={() => setInspModalOpen(false)}
        title="Formulário Veicular — Entrega & Recebimento (4 Fotos Obrigatórias)"
        maxWidth="max-w-4xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInspModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitInspection} disabled={inspSubmitting}>
              {inspSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Salvando no Banco de Dados...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Enviar Vistoria para Aprovação de Supervisor
                </>
              )}
            </Button>
          </>
        }
      >
        {inspError && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs text-red-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
            <span>{inspError}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Dados da Transferência (De Quem -> Para Quem) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Veículo (Placa)">
              <Select
                value={inspVehicleId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setInspVehicleId(vid);
                  const found = (vehicles || []).find((v) => String(v.id) === vid);
                  if (found) {
                    setInspKm(String(found.current_km || 0));
                    if (found.responsible_name || found.condutor_dia) {
                      setInspFromPerson(found.responsible_name || found.condutor_dia || '');
                    }
                  }
                }}
              >
                <option value="">Selecione o veículo...</option>
                {(vehicles || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.model || v.type}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tipo de Operação">
              <Select
                value={inspType}
                onChange={(e) => setInspType(e.target.value as 'entrega' | 'recebimento' | 'periodica')}
              >
                <option value="entrega">Entrega / Repasse de Veículo</option>
                <option value="recebimento">Recebimento / Devolução de Veículo</option>
                <option value="periodica">Vistoria Periódica de Frota</option>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="KM Atual">
                <Input
                  type="number"
                  value={inspKm}
                  onChange={(e) => setInspKm(e.target.value)}
                  placeholder="Ex: 54200"
                  className="font-mono"
                />
              </Field>
              <Field label="Combustível">
                <Select value={inspFuel} onChange={(e) => setInspFuel(e.target.value)}>
                  {['Reserva', '1/4', '1/2', '3/4', 'Cheio'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                Entregando o Veículo (De qual pessoa) *
              </label>
              <Input
                list="fleet-tech-names-from"
                value={inspFromPerson}
                onChange={(e) => setInspFromPerson(e.target.value)}
                placeholder="Nome de quem está entregando o carro..."
              />
              <datalist id="fleet-tech-names-from">
                {technicians.map((t) => (
                  <option key={t.id} value={formatPersonName(t.name)} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-300 mb-1.5">
                Recebendo o Veículo (Para qual pessoa) *
              </label>
              <Input
                list="fleet-tech-names-to"
                value={inspToPerson}
                onChange={(e) => {
                  const val = e.target.value;
                  setInspToPerson(val);
                  const matched = technicians.find(
                    (t) => formatPersonName(t.name).toLowerCase() === val.trim().toLowerCase()
                  );
                  setInspToTechId(matched ? String(matched.id) : '');
                }}
                placeholder="Nome de quem está assumindo o carro..."
              />
              <datalist id="fleet-tech-names-to">
                {technicians.map((t) => (
                  <option key={t.id} value={formatPersonName(t.name)} />
                ))}
              </datalist>
            </div>
          </div>

          {/* FOTOS OBRIGATÓRIAS DOS 4 LADOS DO VEÍCULO */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--color-primary)]" />
                Fotos Obrigatórias dos 4 Lados do Veículo (Salvas no Banco de Dados) *
              </h4>
              <span className="text-[11px] text-emerald-400 font-semibold">
                {[photoFront, photoBack, photoLeft, photoRight].filter(Boolean).length} de 4 lados fotografados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  { id: 'front', label: '1. Frente (Dianteira) *', val: photoFront, set: setPhotoFront },
                  { id: 'back', label: '2. Traseira *', val: photoBack, set: setPhotoBack },
                  { id: 'left', label: '3. Lateral Esquerda *', val: photoLeft, set: setPhotoLeft },
                  { id: 'right', label: '4. Lateral Direita *', val: photoRight, set: setPhotoRight },
                ] as const
              ).map((side) => (
                <div
                  key={side.id}
                  className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 ${
                    side.val ? 'bg-emerald-500/[0.06] border-emerald-500/40' : 'bg-white/[0.02] border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{side.label}</span>
                    {side.val && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </div>

                  {side.val ? (
                    <div className="relative rounded-xl overflow-hidden h-32 bg-black border border-white/10">
                      <img src={side.val} alt={side.label} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => side.set('')}
                        className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/75 text-white hover:text-red-400"
                        title="Trocar foto"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-32 rounded-xl border border-dashed border-white/15 flex flex-col items-center justify-center text-center p-2 text-slate-400">
                      <Camera className="w-6 h-6 mb-1 opacity-60" />
                      <span className="text-[11px]">Foto obrigatória</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition">
                      <Camera className="w-3 h-3" /> Câmera
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const dataUrl = await compressImageToDataUrl(file);
                            side.set(dataUrl);
                          }
                        }}
                      />
                    </label>
                    <label className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition">
                      <ImageIcon className="w-3 h-3" /> Galeria
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const dataUrl = await compressImageToDataUrl(file);
                            side.set(dataUrl);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CHECKLIST DE CONDIÇÕES & APONTAMENTO DE AVARIA */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
              Checklist de Verificação Técnica
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CHECKLIST_ITEMS.map((item) => {
                const val = inspChecklist[item.key] || 'Conforme';
                return (
                  <div
                    key={item.key}
                    className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-white">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(['Conforme', 'Avaria'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setInspChecklist((prev) => ({ ...prev, [item.key]: opt }));
                            if (opt === 'Avaria') setInspHasDamage(true);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            val === opt
                              ? opt === 'Conforme'
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-red-500 text-white'
                              : 'bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RELATO DE AVARIA NO REPASSE */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
            <label className="flex items-center gap-2.5 text-xs font-bold text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={inspHasDamage}
                onChange={(e) => setInspHasDamage(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--color-primary)]"
              />
              <span>Possui alguma avaria, arranhão, amassado ou quebrado? (Ficará marcado no histórico do carro)</span>
            </label>
            {inspHasDamage && (
              <Textarea
                rows={2}
                value={inspDamageNotes}
                onChange={(e) => setInspDamageNotes(e.target.value)}
                placeholder="Descreva detalhadamente a avaria encontrada no veículo..."
              />
            )}
          </div>

          {/* ASSINATURA DIGITAL NA TELA */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Assinatura Digital na Tela (Condutor Responsável) *
              </label>
              <button
                type="button"
                onClick={initSignatureCanvas}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Limpar Assinatura
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/20 bg-[#090C13]">
              <canvas
                ref={sigCanvasRef}
                width={680}
                height={150}
                onMouseDown={startDrawingSig}
                onMouseMove={drawSig}
                onMouseUp={stopDrawingSig}
                onMouseLeave={stopDrawingSig}
                onTouchStart={startDrawingSig}
                onTouchMove={drawSig}
                onTouchEnd={stopDrawingSig}
                className="w-full h-36 cursor-crosshair touch-none block"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: VISUALIZAÇÃO DAS 4 FOTOS, COMPROVANTE & REVISÃO SUPERVISOR    */}
      {/* ===================================================================== */}
      <Modal
        open={Boolean(viewingInsp) || loadingInspDetail}
        onClose={() => setViewingInsp(null)}
        title={viewingInsp ? `Vistoria Veicular #${viewingInsp.id} — Placa ${viewingInsp.plate}` : 'Carregando Vistoria...'}
        maxWidth="max-w-4xl"
        footer={
          viewingInsp ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <Button variant="outline" onClick={() => printInspectionReceipt(viewingInsp)}>
                <Printer className="w-4 h-4" /> Imprimir / Salvar Comprovante (PDF)
              </Button>
              <div className="flex items-center gap-2">
                {canReview && viewingInsp.status === 'pendente' && (
                  <>
                    <Button
                      variant="danger"
                      disabled={reviewSubmitting}
                      onClick={() => handleReviewInspection('reprovar')}
                    >
                      Reprovar Vistoria
                    </Button>
                    <Button
                      disabled={reviewSubmitting}
                      onClick={() => handleReviewInspection('aprovar')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprovar e Confirmar Repasse
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setViewingInsp(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {loadingInspDetail || !viewingInsp ? (
          <div className="py-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando fotos de alta definição do banco de dados...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Selo de Aprovação do Supervisor */}
            <div
              className={`p-4 rounded-2xl border ${
                viewingInsp.status === 'aprovado'
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
                  : viewingInsp.status === 'reprovado'
                  ? 'bg-red-500/12 border-red-500/35 text-red-200'
                  : 'bg-amber-500/12 border-amber-500/35 text-amber-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="font-extrabold text-sm">
                  {viewingInsp.status === 'aprovado'
                    ? `✓ FORMULÁRIO APROVADO E REVISADO POR ${viewingInsp.approved_by_name?.toUpperCase()} (${viewingInsp.approved_by_role})`
                    : viewingInsp.status === 'reprovado'
                    ? `✕ FORMULÁRIO REPROVADO POR ${viewingInsp.approved_by_name?.toUpperCase()}`
                    : '⏳ FORMULÁRIO AGUARDANDO REVISÃO E APROVAÇÃO DE SUPERVISOR / COORDENADOR'}
                </div>
                {viewingInsp.approved_at_fmt && (
                  <span className="font-mono text-xs font-bold">{viewingInsp.approved_at_fmt}</span>
                )}
              </div>
              <div className="text-xs mt-1">
                Transferência registrada de <strong>{viewingInsp.from_person_name}</strong> para{' '}
                <strong>{viewingInsp.to_person_name}</strong> em <strong>{viewingInsp.created_at_fmt}</strong> · KM:{' '}
                <strong>{viewingInsp.km.toLocaleString('pt-BR')} km</strong>
              </div>
            </div>

            {/* Fotos dos 4 Lados */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                Fotos Obrigatórias dos 4 Lados do Veículo (Armazenadas no PostgreSQL)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    { label: '1. Frente (Dianteira)', src: viewingInsp.photo_front },
                    { label: '2. Traseira', src: viewingInsp.photo_back },
                    { label: '3. Lateral Esquerda (Motorista)', src: viewingInsp.photo_left },
                    { label: '4. Lateral Direita (Passageiro)', src: viewingInsp.photo_right },
                  ] as const
                ).map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-1.5">
                    <div className="text-xs font-bold text-white">{p.label}</div>
                    {p.src ? (
                      <a href={p.src} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden bg-black h-48">
                        <img src={p.src} alt={p.label} className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-xs text-slate-500">Sem imagem</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {viewingInsp.damage_notes && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                <strong>Avaria apontada nesta vistoria:</strong> {viewingInsp.damage_notes}
              </div>
            )}

            {/* Assinatura Digital */}
            {viewingInsp.signature_data && (
              <div className="p-3.5 rounded-2xl bg-[#090C13] border border-white/15 text-center space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Assinatura Digital na Tela ({viewingInsp.to_person_name})
                </div>
                <img src={viewingInsp.signature_data} alt="Assinatura" className="max-h-24 mx-auto object-contain" />
              </div>
            )}

            {/* Campo de parecer para Supervisor aprovar/reprovar */}
            {canReview && viewingInsp.status === 'pendente' && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-emerald-500/30 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Parecer da Supervisão / Coordenação (Opcional)
                </label>
                <Input
                  value={reviewNotesInput}
                  onChange={(e) => setReviewNotesInput(e.target.value)}
                  placeholder="Ex: Fotos dos 4 lados conferidas e repasse autorizado..."
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 3: DOSSIÊ & HISTÓRICO COMPLETO DO VEÍCULO                       */}
      {/* ===================================================================== */}
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={historyData ? `Dossiê & Histórico Completo — ${historyData.vehicle.plate}` : 'Carregando Histórico...'}
        maxWidth="max-w-4xl"
        footer={
          <Button variant="ghost" onClick={() => setHistoryModalOpen(false)}>
            Fechar Histórico
          </Button>
        }
      >
        {historyLoading || !historyData ? (
          <div className="py-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando histórico completo do veículo...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resumo Cadastral */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Placa / Modelo</span>
                <strong className="text-white">{historyData.vehicle.plate} · {historyData.vehicle.model || historyData.vehicle.type}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Condutor Atual</span>
                <strong className="text-emerald-300">{historyData.vehicle.responsible_name || historyData.vehicle.condutor_dia || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Quilometragem</span>
                <strong className="text-white font-mono">{(historyData.vehicle.current_km || 0).toLocaleString('pt-BR')} km</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Status</span>
                <strong className="text-white">{historyData.vehicle.operational_status || 'Operacional'}</strong>
              </div>
            </div>

            {/* Histórico de Repasses e Vistorias */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5">
                Histórico de Entregas, Recebimentos e Aprovações de Supervisor ({historyData.inspections.length})
              </h4>
              {historyData.inspections.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma vistoria registrada para este veículo.</p>
              ) : (
                <div className="space-y-2.5">
                  {historyData.inspections.map((i) => (
                    <div key={i.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="font-bold text-white">
                          {i.from_person_name} ➔ {i.to_person_name} ({i.km.toLocaleString('pt-BR')} km)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Data da vistoria: {i.created_at_fmt} · Combustível: {i.fuel_level}
                        </div>
                        {i.approved_by_name && (
                          <div className="text-[11px] text-emerald-300 font-semibold">
                            ✓ Revisado por {i.approved_by_name} ({i.approved_by_role}) em {i.approved_at_fmt}
                          </div>
                        )}
                      </div>
                      <Button variant="outline" onClick={() => openInspectionDetail(i.id)} className="h-8 px-3 text-xs shrink-0">
                        Ver 4 Fotos & Comprovante
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Histórico de Avarias */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2.5">
                Histórico de Avarias e Quebrados no Veículo ({historyData.damages.length})
              </h4>
              {historyData.damages.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma avaria reportada para este veículo.</p>
              ) : (
                <div className="space-y-2.5">
                  {historyData.damages.map((d) => (
                    <div key={d.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <strong className="text-white">
                          {d.occurrence_type} — {d.affected_part || 'Geral'} ({d.severity})
                        </strong>
                        <span className="text-[11px] font-bold text-amber-300">{d.status}</span>
                      </div>
                      <p className="text-slate-300">{d.description}</p>
                      <div className="text-[11px] text-slate-400">
                        Reportado por {d.reported_by_name} em {d.created_at_fmt}
                        {d.resolved_by_name ? ` · Solucionado por ${d.resolved_by_name} em ${d.resolved_at_fmt}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 4: REPORTAR AVARIA / OCORRÊNCIA                                 */}
      {/* ===================================================================== */}
      <Modal
        open={dmgModalOpen}
        onClose={() => setDmgModalOpen(false)}
        title="Reportar Avaria, Quebrado ou Ocorrência Veicular"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDmgModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitDamage} disabled={dmgSubmitting}>
              {dmgSubmitting ? 'Salvando no Histórico...' : 'Registrar Avaria no Histórico'}
            </Button>
          </>
        }
      >
        {dmgError && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs text-red-200">
            {dmgError}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Veículo">
            <Select value={dmgVehicleId} onChange={(e) => setDmgVehicleId(e.target.value)}>
              <option value="">Selecione...</option>
              {(vehicles || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model || v.type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de Ocorrência">
            <Select value={dmgType} onChange={(e) => setDmgType(e.target.value)}>
              {['Avaria / Quebrado', 'Sinistro / Colisão', 'Pane Mecânica / Elétrica', 'Pneu / Roda Danificada', 'Equipamento / Rack'].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                )
              )}
            </Select>
          </Field>
          <Field label="Gravidade">
            <Select value={dmgSeverity} onChange={(e) => setDmgSeverity(e.target.value)}>
              {['Baixa', 'Média', 'Alta', 'Crítica (Veículo Parado)'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parte Afetada">
            <Input
              value={dmgPart}
              onChange={(e) => setDmgPart(e.target.value)}
              placeholder="Ex: Para-choque dianteiro, Retrovisor..."
            />
          </Field>
          <Field label="Condutor no Momento">
            <Input value={dmgDriver} onChange={(e) => setDmgDriver(e.target.value)} placeholder="Nome do condutor" />
          </Field>
          <Field label="Número do B.O. (Se houver)">
            <Input value={dmgBo} onChange={(e) => setDmgBo(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <Field label="Descrição Detalhada do Problema / Avaria *">
          <Textarea
            rows={3}
            value={dmgDesc}
            onChange={(e) => setDmgDesc(e.target.value)}
            placeholder="Relate o que aconteceu e o estado da peça..."
          />
        </Field>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
            Fotos da Avaria (Salvas diretamente no Banco de Dados)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="py-2 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer">
              <Camera className="w-4 h-4" /> Adicionar Foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const dataUrl = await compressImageToDataUrl(file);
                    setDmgPhotos((prev) => [...prev.slice(0, 5), dataUrl]);
                  }
                }}
              />
            </label>
            <span className="text-xs text-slate-400">{dmgPhotos.length} foto(s) anexada(s)</span>
          </div>
          {dmgPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {dmgPhotos.map((src, i) => (
                <div key={i} className="relative h-24 rounded-xl overflow-hidden border border-white/15">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setDmgPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 p-1 rounded bg-black/75 text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 5: ATUALIZAR / CONCLUIR AVARIA (SUPERVISOR) */}
      <Modal
        open={Boolean(updatingDmg)}
        onClose={() => setUpdatingDmg(null)}
        title={updatingDmg ? `Tratar Avaria — ${updatingDmg.plate}` : 'Tratar Avaria'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUpdatingDmg(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateDamageStatus} disabled={dmgUpdating}>
              {dmgUpdating ? 'Salvando...' : 'Salvar Tratativa'}
            </Button>
          </>
        }
      >
        <Field label="Status da Ocorrência">
          <Select
            value={dmgNewStatus}
            onChange={(e) => setDmgNewStatus(e.target.value as 'Aberta' | 'Em Análise' | 'Em Oficina' | 'Concluída')}
          >
            {['Aberta', 'Em Análise', 'Em Oficina', 'Concluída'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações da Solução / Tratativa da Supervisão">
          <Textarea
            rows={3}
            value={dmgResolutionNotes}
            onChange={(e) => setDmgResolutionNotes(e.target.value)}
            placeholder="Descreva o reparo realizado, oficina ou decisão da supervisão..."
          />
        </Field>
      </Modal>

      {/* MODAL 6: AGENDAR MANUTENÇÃO */}
      <Modal
        open={maintModalOpen}
        onClose={() => setMaintModalOpen(false)}
        title="Agendar Manutenção Preventiva / Corretiva"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMaintModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitMaintenance} disabled={maintSubmitting}>
              {maintSubmitting ? 'Salvando...' : 'Salvar Manutenção'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Veículo">
            <Select value={maintVehicleId} onChange={(e) => setMaintVehicleId(e.target.value)}>
              <option value="">Selecione...</option>
              {(vehicles || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model || v.type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={maintType} onChange={(e) => setMaintType(e.target.value)}>
              {['Preventiva', 'Corretiva', 'Revisão de KM', 'Troca de Óleo / Filtros', 'Pneus / Alinhamento'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Título do Serviço">
            <Input
              value={maintTitle}
              onChange={(e) => setMaintTitle(e.target.value)}
              placeholder="Ex: Revisão de 60.000 km + Troca de óleo"
            />
          </Field>
          <Field label="Data Agendada">
            <Input type="date" value={maintDate} onChange={(e) => setMaintDate(e.target.value)} />
          </Field>
          <Field label="Oficina / Fornecedor">
            <Input value={maintWorkshop} onChange={(e) => setMaintWorkshop(e.target.value)} placeholder="Nome da oficina" />
          </Field>
          <Field label="Custo Estimado (R$)">
            <Input type="number" step="0.01" value={maintCost} onChange={(e) => setMaintCost(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Tempo Parado Previsto">
            <Input value={maintDowntime} onChange={(e) => setMaintDowntime(e.target.value)} placeholder="Ex: 4 horas / 2 dias" />
          </Field>
          <Field label="KM Previsto">
            <Input type="number" value={maintKm} onChange={(e) => setMaintKm(e.target.value)} placeholder="Ex: 60000" />
          </Field>
        </div>
        <Field label="Descrição / Itens">
          <Textarea rows={2} value={maintDesc} onChange={(e) => setMaintDesc(e.target.value)} />
        </Field>
      </Modal>

      {/* MODAL 7: CADASTRAR MULTA & RESPONDER / DECIDIR */}
      <Modal
        open={fineModalOpen}
        onClose={() => setFineModalOpen(false)}
        title="Registrar Auto de Infração (Multa)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFineModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitFine} disabled={fineSubmitting}>
              {fineSubmitting ? 'Salvando...' : 'Registrar Multa'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Veículo">
            <Select value={fineVehicleId} onChange={(e) => setFineVehicleId(e.target.value)}>
              <option value="">Selecione...</option>
              {(vehicles || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model || v.type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Número do Auto de Infração">
            <Input value={fineAuto} onChange={(e) => setFineAuto(e.target.value)} placeholder="Ex: E02938471" />
          </Field>
          <Field label="Data da Infração">
            <Input type="date" value={fineDate} onChange={(e) => setFineDate(e.target.value)} />
          </Field>
          <Field label="Data de Vencimento">
            <Input type="date" value={fineDueDate} onChange={(e) => setFineDueDate(e.target.value)} />
          </Field>
          <Field label="Condutor Indicado">
            <Input value={fineDriver} onChange={(e) => setFineDriver(e.target.value)} placeholder="Nome do condutor" />
          </Field>
          <Field label="Valor (R$)">
            <Input type="number" step="0.01" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} placeholder="195.23" />
          </Field>
        </div>
        <Field label="Descrição da Infração / Local">
          <Textarea rows={2} value={fineDesc} onChange={(e) => setFineDesc(e.target.value)} placeholder="Ex: Excesso de velocidade na Av. Brasil..." />
        </Field>
      </Modal>

      <Modal
        open={Boolean(respondingFine)}
        onClose={() => setRespondingFine(null)}
        title={respondingFine ? `Responder Multa ${respondingFine.auto_number} (${respondingFine.plate})` : 'Responder Multa'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRespondingFine(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSendFineResponse}>Enviar Resposta para Análise</Button>
          </>
        }
      >
        <Field label="Condutor Responsável">
          <Input value={fineDriverInput} onChange={(e) => setFineDriverInput(e.target.value)} />
        </Field>
        <Field label="Resposta / Justificativa do Condutor">
          <Textarea
            rows={3}
            value={fineResponseText}
            onChange={(e) => setFineResponseText(e.target.value)}
            placeholder="Confirme a ciência ou informe o contexto do atendimento em campo..."
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(decidingFine)}
        onClose={() => setDecidingFine(null)}
        title={decidingFine ? `Decisão da Empresa — Multa ${decidingFine.auto_number}` : 'Decisão'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecidingFine(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSendFineDecision}>Concluir e Registrar Decisão</Button>
          </>
        }
      >
        <Field label="Decisão e Observação da Empresa">
          <Textarea
            rows={3}
            value={fineDecisionText}
            onChange={(e) => setFineDecisionText(e.target.value)}
            placeholder="Informe a conclusão da análise (ex: Pagamento com desconto / Indicação concluída)..."
          />
        </Field>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 8: CADASTRO / EDIÇÃO DE VEÍCULO E DOCUMENTOS                    */}
      {/* ===================================================================== */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Veículo & Documentos' : 'Novo Veículo da Operação'}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitVehicle} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Veículo'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">
          <Field label="Placa (Mercosul)">
            <Input
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
              placeholder="Ex: ABC1D23"
              className="font-mono uppercase font-bold"
            />
          </Field>
          <Field label="Tipo de Veículo">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {['Utilitário', 'Passeio', 'Van', 'Moto', 'Caminhão'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quilometragem Atual (KM)">
            <Input
              type="number"
              value={form.current_km}
              onChange={(e) => setForm((f) => ({ ...f, current_km: e.target.value }))}
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label="Modelo">
            <Input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="Ex: Fiat Fiorino 1.4 Flex"
            />
          </Field>
          <Field label="Técnico Responsável">
            <Select
              value={form.responsible_tech_id}
              onChange={(e) => setForm((f) => ({ ...f, responsible_tech_id: e.target.value }))}
            >
              <option value="">Sem responsável atribuído</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4">
          <Field label="Área de Rede">
            <Input
              value={form.area_rede}
              onChange={(e) => setForm((f) => ({ ...f, area_rede: e.target.value }))}
              placeholder="Ex: Norte 1"
            />
          </Field>
          <Field label="Base Operacional">
            <Input
              value={form.base}
              onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}
              placeholder="Ex: Base Central"
            />
          </Field>
          <Field label="Setor">
            <Input
              value={form.setor}
              onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}
              placeholder="Ex: Infraestrutura"
            />
          </Field>
          <Field label="Subcluster">
            <Input
              value={form.subclus}
              onChange={(e) => setForm((f) => ({ ...f, subclus: e.target.value }))}
              placeholder="Ex: RIO CAPITAL"
            />
          </Field>
          <Field label="Condutor (Dia)">
            <Input value={form.condutor_dia} onChange={(e) => setForm((f) => ({ ...f, condutor_dia: e.target.value }))} />
          </Field>
          <Field label="Condutor (Tarde)">
            <Input value={form.condutor_tarde} onChange={(e) => setForm((f) => ({ ...f, condutor_tarde: e.target.value }))} />
          </Field>
          <Field label="Condutor (Madrugada)">
            <Input
              value={form.condutor_madrugada}
              onChange={(e) => setForm((f) => ({ ...f, condutor_madrugada: e.target.value }))}
            />
          </Field>
          <Field label="Ticket do Carro">
            <Input
              value={form.ticket_car}
              onChange={(e) => setForm((f) => ({ ...f, ticket_car: e.target.value }))}
              placeholder="Ex: 88921"
            />
          </Field>
        </div>

        {/* DOCUMENTOS, CRLV, SEGURO & LOCADORA */}
        <div className="pt-2 border-t border-white/10">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Documentos, CRLV, Seguro e Contrato
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">
            <Field label="Número CRLV">
              <Input value={form.crlv_number} onChange={(e) => setForm((f) => ({ ...f, crlv_number: e.target.value }))} />
            </Field>
            <Field label="Vencimento CRLV">
              <Input
                type="date"
                value={form.crlv_expiration}
                onChange={(e) => setForm((f) => ({ ...f, crlv_expiration: e.target.value }))}
              />
            </Field>
            <Field label="Locadora / Proprietária">
              <Input
                value={form.rental_company}
                onChange={(e) => setForm((f) => ({ ...f, rental_company: e.target.value }))}
                placeholder="Ex: Localiza / Movida / Claro"
              />
            </Field>
            <Field label="Seguradora">
              <Input
                value={form.insurance_company}
                onChange={(e) => setForm((f) => ({ ...f, insurance_company: e.target.value }))}
                placeholder="Ex: Porto Seguro"
              />
            </Field>
            <Field label="Vencimento Seguro">
              <Input
                type="date"
                value={form.insurance_expiration}
                onChange={(e) => setForm((f) => ({ ...f, insurance_expiration: e.target.value }))}
              />
            </Field>
            <Field label="Status Operacional">
              <Select
                value={form.operational_status}
                onChange={(e) => setForm((f) => ({ ...f, operational_status: e.target.value }))}
              >
                {['Operacional', 'Com Avaria', 'Em Manutenção', 'Reserva'].map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* ACESSÓRIOS E EQUIPAMENTOS */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Acessórios & Equipamentos Acoplados
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { key: 'has_rack', label: 'Possui Rack de Escada' },
              { key: 'has_basket', label: 'Possui Cesto Aéreo' },
              { key: 'has_giroflex', label: 'Possui Giroflex de Alerta' },
              { key: 'has_inverter', label: 'Possui Inversor 220V' },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 text-xs font-medium text-white/80 cursor-pointer select-none transition-colors"
              >
                <input
                  type="checkbox"
                  checked={(form as Record<string, boolean | string>)[key] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[var(--color-primary)]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
