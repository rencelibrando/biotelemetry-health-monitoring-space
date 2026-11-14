export interface Astronaut {
  id: string;
  name: string;
  role: string;
  age: number;
  resting_hr: number;
  baseline_spo2: number;
  status: string;
  suit_id?: string;
}

export interface VitalSigns {
  astronaut_id: string;
  timestamp: string;
  heart_rate: number;
  spo2: number;
  core_temp: number;
  radiation_rate: number;
  hrv: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  respiration_rate?: number;
  battery_level?: number;
  ecg_samples?: number[];
  synced?: boolean;
}

export interface AlertItem {
  id: string;
  astronaut_id: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  alert_type: 'HYPOXIA' | 'TACHYCARDIA' | 'BRADYCARDIA' | 'RADIATION_SPIKE' | 'HEAT_STRESS';
  message: string;
  acknowledged: boolean;
}

export interface DiagnosticResult {
  astronaut_id: string;
  overall_health_score: number;
  cardiovascular_status: 'NOMINAL' | 'COMPROMISED' | 'CRITICAL';
  hypoxia_risk: 'LOW' | 'MODERATE' | 'SEVERE';
  radiation_risk: 'SAFE' | 'ELEVATED' | 'DANGEROUS';
  recommendations: string[];
  metrics_summary: Record<string, any>;
}

