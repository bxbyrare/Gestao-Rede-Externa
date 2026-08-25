export interface User {
  id: number;
  username: string;
  role: string;
  company: string | null;
}

export interface Favorite {
  id: number;
  title: string;
  link: string;
  color: string;
  access_count: number;
  created_at: string;
}

export interface Technician {
  id: number;
  name: string;
  cpf: string | null;
  phone: string | null;
  identity: string | null;
  dob: string | null;
  role: string;
  area: string | null;
  team_type: string | null;
  shirt_size: string | null;
  boot_size: string | null;
  pants_size: string | null;
  jacket_size: string | null;
  team: string | null;
  company: string | null;
  registration_claro: string | null;
  registration_third: string | null;
  toa_login: string | null;
  phone_model: string | null;
  imei_1: string | null;
  imei_2: string | null;
  email: string | null;
  created_at: string | null;
}

export interface Vehicle {
  id: number;
  plate: string;
  type: string;
  model: string | null;
  responsible_tech_id: number | null;
  responsible_name: string | null;
  has_rack: boolean;
  has_basket: boolean;
  has_giroflex: boolean;
  has_inverter: boolean;
  ticket_car: string | null;
  area_rede: string | null;
  base: string | null;
  setor: string | null;
  condutor_dia: string | null;
  condutor_tarde: string | null;
  condutor_madrugada: string | null;
  subclus: string | null;
}

export interface InventoryItem {
  id: number;
  category: string;
  name: string;
  quantity: number;
  serial_number: string | null;
  description: string | null;
  created_at: string;
}

export interface ManagedUser {
  id: number;
  username: string;
  role: string;
  tech_id: number | null;
  tech_name: string | null;
  created_at: string;
}

export interface Evaluation {
  id: number;
  technician_id: number;
  technician_name: string;
  company: string;
  role: string;
  area: string;
  behavior_score: number;
  productivity_score: number;
  technical_kpi_score: number;
  process_score: number;
  overall_score: number;
  comments: string;
  evaluator_username: string;
  created_at: string;
}

export interface UserTask {
  id: number;
  title: string;
  priority: string;
  due_date: string | null;
  assigned_tech_id: number | null;
  assigned_tech_name: string;
  description: string;
  status: string;
  created_at: string;
}

export interface TeamFinanceRecord {
  id: number;
  tech1_id: number;
  tech2_id: number;
  tech1_name: string;
  tech2_name: string;
  area: string;
  amount: number;
  reference_month: string;
  created_at: string;
}

export interface ConsumableFinanceRecord {
  id: number;
  description: string;
  area: string;
  amount: number;
  reference_month: string;
  created_at: string;
}

export interface ProjectFolder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  file_count: number;
  folder_count: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
  folder_id: number | null;
  kmz_path: string | null;
  pdf_path: string | null;
  created_at: string;
}

export interface RouteItem {
  id: number;
  name: string;
  type: string;
  description: string | null;
  created_at: string;
  created_at_fmt: string;
  lines_count: number;
}

export interface RouteLine {
  id: number;
  route_id: number;
  stretch_name: string;
  pop_box: string | null;
  cable_type: string | null;
  notes: string | null;
  address: string | null;
  created_at: string;
}

export interface RouteFolder {
  id: number;
  route_id: number;
  parent_id: number | null;
  name: string;
  created_at: string;
  creator_name: string | null;
}

export interface RouteFile {
  id: number;
  route_id: number;
  folder_id: number | null;
  filename: string;
  filepath: string;
  filesize: number;
  filetype: string;
  uploaded_at: string;
  uploader_name: string | null;
}

export interface MapaEvento {
  id: number;
  lat: number;
  lng: number;
  type: string;
  area?: string;
  date?: string;
  description?: string;
}
