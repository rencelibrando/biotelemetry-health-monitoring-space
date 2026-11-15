import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  demoCrew,
  fetchAlerts,
  fetchAstronauts,
  fetchLatestTelemetry,
  fetchTelemetryHistory,
  runDiagnostics,
  syncOfflineBatch,
} from '../services/api';
import { localDb } from '../db/localDb';
import { soundService } from '../services/sound';
import { sendQueuedTelemetry } from '../services/telemetryQueue';
import {
  connectBluetoothHr,
  isBluetoothHrSupported,
  type BluetoothConnectionStatus,
  type BluetoothHrReading,
  type BluetoothHrSession,
} from '../services/bluetoothHr';
import {
  computeOverallHealthScore,
  defaultSimulationConfig,
  evaluateLocalAlerts,
  getMissionZone,
  SHIELDING_OPTIONS,
  SOLAR_STORM_OPTIONS,
  type SimulationConfig,
} from '../services/simulationConfig';
import type { AlertItem, Astronaut, DiagnosticResult, VitalSigns } from '../types/telemetry';

export function simulatedVitals(
  id: string,
  anomaly = 'NONE',
  simConfig: SimulationConfig = defaultSimulationConfig(),
  kpIndex = 1.5,
): VitalSigns {
  const nowSec = Date.now() / 1000;
  const orbitWave = Math.sin((2 * Math.PI * (nowSec % 5560)) / 5560);
  const zone = getMissionZone(simConfig.missionZone);
  const shield = SHIELDING_OPTIONS.find(s => s.id === simConfig.shielding) ?? SHIELDING_OPTIONS[0];
  const storm = SOLAR_STORM_OPTIONS.find(s => s.id === simConfig.solarStorm) ?? SOLAR_STORM_OPTIONS[0];
  const effectiveKp = storm.kpOverride ?? kpIndex;
  const isEva = simConfig.shielding === 'UNSHIELDED_EVA' ? true : (simConfig.evaActive ?? id !== 'ASTRO-02');
  const day = Math.max(1, Math.min(1000, simConfig.missionDay));
  const durationFactor = Math.min(1, day / 365);
  const gravityRelief = zone.gravityG > 0 ? 0.55 : 1;

  const baseHr = id === 'ASTRO-02' ? 65 : id === 'ASTRO-03' ? 58 : 62;
  let hr = baseHr + (isEva ? 10 : 0) + 11 * durationFactor * gravityRelief + (zone.magnetosphereShielded ? 0 : 3.5) + orbitWave * 2.5;
  let spo2 = 98.5;
  let temp = 36.8 + (isEva ? 0.14 : 0) + orbitWave * 0.06;
  let hrv = Math.max(22, 56 - (isEva ? 6 : 0) - 14 * durationFactor * gravityRelief - orbitWave * 3);
  let sbp = 116 + (hr - 68) * 0.3 - (zone.gravityG === 0 ? 4 * durationFactor : 0);
  let dbp = 76 + (hr - 68) * 0.15;
  let resp = 14 + (hr - 68) * 0.11;

  const orbitalPhase = zone.id === 'LEO_ISS'
    ? (anomaly === 'SAA_TRANSIT' ? 'saa_transit' : orbitWave < -0.35 ? 'eclipsed' : 'daylight')
    : zone.phaseLabel;
  const baseRad = zone.id === 'LEO_ISS'
    ? 13.5 + (orbitalPhase === 'saa_transit' ? 20 : 0) + Math.max(0, effectiveKp - 4) * 5.5
    : zone.gcrBaselineUsvH;
  const stormRad = storm.radBonus * (zone.magnetosphereShielded && shield.id !== 'UNSHIELDED_EVA' ? 0.35 : 1);
  let rad = (baseRad + stormRad) * shield.factor * (isEva && shield.id === 'NOMINAL' ? 1.15 : 1);

  if (anomaly === 'EVA_HEAVY') {
    hr = Math.min(132, hr + 32);
    temp += 0.65;
    hrv = Math.max(20, hrv - 16);
    resp = Math.max(resp, 21.5);
  } else if (anomaly === 'HYPOXIA') {
    spo2 = 87.5;
    hr += 26;
    hrv = Math.max(18, hrv - 18);
    resp = 23.5;
  } else if (anomaly === 'HYPERCAPNIA') {
    resp = 26.2;
    hr += 22;
    spo2 = 92.6;
    sbp += 18;
    dbp += 10;
  } else if (anomaly === 'DCS_RISK') {
    spo2 = 92.1;
    hr += 24;
    resp = 23.8;
    hrv = Math.max(20, hrv - 16);
  } else if (anomaly === 'HEAT_STRESS') {
    temp = 38.65;
    hr = Math.max(126, hr + 36);
    sbp -= 14;
    hrv = Math.max(18, hrv - 18);
  } else if (anomaly === 'HYPOTHERMIA') {
    temp = 35.15;
    hr = 42.5;
    resp = 11.0;
  } else if (anomaly === 'TACHYCARDIA') {
    hr = 138;
    hrv = Math.max(18, hrv - 24);
  } else if (anomaly === 'BRADYCARDIA') {
    hr = 41.2;
    sbp -= 12;
  } else if (anomaly === 'ORTHOSTATIC') {
    sbp = 85;
    dbp = 56;
    hr = Math.max(110, hr + 32);
    hrv = Math.max(18, hrv - 16);
  } else if (anomaly === 'SLEEP_FATIGUE') {
    hrv = 23.5;
    hr += 12;
    sbp += 8;
  } else if (anomaly === 'DUST_EXPOSURE') {
    resp = 25.0;
    spo2 = 92.8;
    hr += 16;
  } else if (anomaly === 'RADIATION_SPIKE') {
    rad = Math.max(rad + 55, 72.5);
    hr += 8;
    hrv = Math.max(20, hrv - 14);
  } else if (anomaly === 'COMPOUND_CRISIS') {
    rad = Math.max(rad + 75, 98.4);
    temp = 38.75;
    spo2 = 88.4;
    hr = 140;
    hrv = 18.5;
    resp = 26.0;
  }

  let bloodGlucose = 88 + 4.5 * durationFactor - (isEva ? 6 : 0) + orbitWave * 4;
  let wbcKUl = 6.2 * (1 - 0.15 * durationFactor) - Math.min(0.8, Math.max(0, (rad - 20) * 0.008));
  let hydrationPct = 96.2 - (isEva ? 2.4 : 0) - 1.8 * durationFactor;

  if (anomaly === 'HYPOGLYCEMIA') {
    bloodGlucose = 58;
    hr += 18;
    hrv = Math.max(22, hrv - 12);
  } else if (anomaly === 'HYPERGLYCEMIA') {
    bloodGlucose = 208;
    hydrationPct = 82.5;
  } else if (anomaly === 'HEAT_STRESS' || anomaly === 'ORTHOSTATIC') {
    hydrationPct = 81.5;
    bloodGlucose += 12;
  } else if (anomaly === 'RADIATION_SPIKE') {
    wbcKUl = 3.5;
  } else if (anomaly === 'COMPOUND_CRISIS') {
    bloodGlucose = 60;
    wbcKUl = 3.4;
    hydrationPct = 80.0;
  }

  hr = Math.round(hr * 10) / 10;
  rad = Math.round(rad * 10) / 10;
  temp = Math.round(temp * 100) / 100;
  hrv = Math.round(hrv * 10) / 10;
  sbp = Math.round(Math.max(72, Math.min(185, sbp)));
  dbp = Math.round(Math.max(45, Math.min(115, dbp)));
  resp = Math.round(Math.max(10, Math.min(34, resp)) * 10) / 10;
  const cumulativeDose = Math.round((((zone.gcrBaselineUsvH * shield.factor * 24) / 1000) * day + Math.max(0, rad - zone.gcrBaselineUsvH) * 0.008) * 100) / 100;

  const partial: VitalSigns = {
    astronaut_id: id,
    timestamp: new Date().toISOString(),
    heart_rate: hr,
    spo2,
    core_temp: temp,
    radiation_rate: rad,
    hrv,
    systolic_bp: sbp,
    diastolic_bp: dbp,
    respiration_rate: resp,
    battery_level: 96.5,
    ecg_samples: [],
    telemetry_source: 'simulated',
    ecg_sample_rate_hz: 100,
    orbital_phase: orbitalPhase,
    calibration_basis: 'NASA OSDR + ISS Orbit offline baseline',
    mission_zone: zone.id,
    mission_day: day,
    distance_km: zone.distanceKm,
    comms_latency_sec: zone.commsLatencySec,
    gravity_g: zone.gravityG,
    shielding_mode: shield.id,
    cumulative_dose_msv: cumulativeDose,
    blood_glucose: Math.round(Math.max(35, Math.min(400, bloodGlucose)) * 10) / 10,
    wbc_k_ul: Math.round(Math.max(1.5, Math.min(20, wbcKUl)) * 100) / 100,
    hydration_pct: Math.round(Math.max(55, Math.min(100, hydrationPct)) * 10) / 10,
  };
  const { score, status } = computeOverallHealthScore(partial, simConfig, effectiveKp);
  partial.overall_health_score = score;
  partial.health_status = status;
  return partial;
}

export function useTelemetry() {
  const [crew, setCrew] = useState<Astronaut[]>(demoCrew);
  const [crewDemo, setCrewDemo] = useState(true);
  const [activeId, setActiveId] = useState('ASTRO-01');
  const [simConfig, setSimConfigState] = useState<SimulationConfig>(() => defaultSimulationConfig());
  const [vitals, setVitals] = useState<VitalSigns>(() => simulatedVitals('ASTRO-01', 'NONE', defaultSimulationConfig()));
  const [telemetryHistory, setTelemetryHistory] = useState<VitalSigns[]>(() => [simulatedVitals('ASTRO-01', 'NONE', defaultSimulationConfig())]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [los, setLos] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [gateway, setGateway] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sound, setSound] = useState(false);

  const [bleStatus, setBleStatus] = useState<BluetoothConnectionStatus>(() =>
    isBluetoothHrSupported() ? 'disconnected' : 'unsupported',
  );
  const [bleDeviceName, setBleDeviceName] = useState('');
  const [bleError, setBleError] = useState('');
  const bleSessionRef = useRef<BluetoothHrSession | null>(null);
  const bleReadingRef = useRef<BluetoothHrReading | null>(null);

  const syncingRef = useRef(false);
  const offline = los || !online;
  const anomaly = simConfig.anomaly;

  const setAnomaly = useCallback((mode: string) => {
    setSimConfigState(prev => ({ ...prev, anomaly: mode }));
  }, []);

  const setSimConfig = useCallback((next: SimulationConfig | ((prev: SimulationConfig) => SimulationConfig)) => {
    setSimConfigState(prev => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const applyBleOverlay = useCallback((record: VitalSigns): VitalSigns => {
    const ble = bleReadingRef.current;
    if (!ble) return record;
    const ageMs = Date.now() - new Date(ble.timestamp).getTime();
    if (ageMs > 10000) return record;
    return {
      ...record,
      heart_rate: ble.heartRate,
      hrv: ble.rmssdMs ?? record.hrv,
      telemetry_source: 'measured',
      calibration_basis: 'Bluetooth Heart Rate Sensor (0x180D)',
    };
  }, []);

  useEffect(() => { soundService.enabled = sound; }, [sound]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let alive = true;
    fetchAstronauts().then(data => { if (alive && data.length) { setCrew(data); setCrewDemo(false); setActiveId(data[0].id); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return () => {
      bleSessionRef.current?.disconnect();
      bleSessionRef.current = null;
    };
  }, []);

  const connectBle = useCallback(async () => {
    if (!isBluetoothHrSupported()) {
      setBleStatus('unsupported');
      setBleError('Web Bluetooth requires Chrome or Edge over HTTPS or localhost.');
      return;
    }
    setBleError('');
    setBleStatus('connecting');
    try {
      const session = await connectBluetoothHr(
        reading => {
          bleReadingRef.current = reading;
          setVitals(prev => ({
            ...prev,
            heart_rate: reading.heartRate,
            hrv: reading.rmssdMs ?? prev.hrv,
            telemetry_source: 'measured',
            calibration_basis: 'Bluetooth Heart Rate Sensor (0x180D)',
          }));
        },
        () => {
          bleSessionRef.current = null;
          bleReadingRef.current = null;
          setBleDeviceName('');
          setBleStatus('disconnected');
        },
      );
      bleSessionRef.current = session;
      setBleDeviceName(session.deviceName);
      setBleStatus('connected');
    } catch (cause) {
      bleSessionRef.current = null;
      bleReadingRef.current = null;
      setBleStatus('disconnected');
      const msg = cause instanceof Error ? cause.message : 'Could not connect Bluetooth sensor.';
      if (!/cancel/i.test(msg)) {
        setBleError(msg);
      }
    }
  }, []);

  const disconnectBle = useCallback(() => {
    bleSessionRef.current?.disconnect();
    bleSessionRef.current = null;
    bleReadingRef.current = null;
    setBleDeviceName('');
    setBleError('');
    setBleStatus(isBluetoothHrSupported() ? 'disconnected' : 'unsupported');
  }, []);

  const updatePending = useCallback(async () => {
    // IndexedDB does not index booleans. Filter legacy records without changing schema.
    try { setPending(await localDb.vitalsQueue.filter(item => !item.syncedToCloud).count()); }
    catch { setError('Local storage is unavailable. Telemetry cannot be buffered.'); }
  }, []);
  useEffect(() => { void updatePending(); }, [updatePending]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setVitals(applyBleOverlay(simulatedVitals(activeId, anomaly, simConfig)));
    setAlerts([]);
    setGateway(false);
    const savedObservations = localDb.alertsStore.where('astronaut_id').equals(activeId).toArray().catch(() => [] as AlertItem[]);
    // Keep active alerts synced to real-time hazards: drop cleared dangers and preserve seen state for unbroken episodes.
    const reconcileActiveAlerts = (previous: AlertItem[], incoming: AlertItem[]) => {
      const incomingForCrew = incoming.filter(item => item.astronaut_id === activeId);
      const prevByType = new Map<string, AlertItem>();
      for (const item of previous) {
        if (item.astronaut_id === activeId) prevByType.set(item.alert_type, item);
      }
      const nextByType = new Map<string, AlertItem>();
      for (const item of incomingForCrew) {
        const existing = prevByType.get(item.alert_type);
        const escalated = existing !== undefined && existing.severity !== 'CRITICAL' && item.severity === 'CRITICAL';
        const seen = !item.acknowledged && existing?.acknowledged && !escalated ? true : item.acknowledged;
        const candidate = seen === item.acknowledged ? item : { ...item, acknowledged: true };
        const current = nextByType.get(item.alert_type);
        if (!current || candidate.timestamp >= current.timestamp) {
          nextByType.set(item.alert_type, candidate);
        }
      }
      return [...nextByType.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    };

    const mergeLocalSimAlerts = (record: VitalSigns) => {
      const localObs = evaluateLocalAlerts(record, SOLAR_STORM_OPTIONS.find(s => s.id === simConfig.solarStorm)?.kpOverride ?? 1.5);
      setAlerts(previous => reconcileActiveAlerts(previous, localObs));
    };

    async function tick() {
      try {
        if (offline) {
          const record = applyBleOverlay(simulatedVitals(activeId, anomaly, simConfig));
          if (!alive) return;
          setVitals(record);
          setTelemetryHistory(prev => [...(prev[0]?.astronaut_id === activeId ? prev : []), record].slice(-36));
          setGateway(false);
          mergeLocalSimAlerts(record);
          await localDb.vitalsQueue.add({ ...record, syncedToCloud: false });
          if (alive) await updatePending();
        } else {
          try {
            const record = applyBleOverlay(await fetchLatestTelemetry(activeId, anomaly, simConfig));
            if (!alive) return;
            setVitals(record);
            setTelemetryHistory(prev => [...(prev[0]?.astronaut_id === activeId ? prev : []), record].slice(-36));
            setGateway(true);
            soundService.playBlip();
            try {
              const observations = await fetchAlerts();
              if (!alive) return;
              setAlerts(previous => reconcileActiveAlerts(previous, observations));
              const activeObs = observations.filter(a => a.astronaut_id === activeId);
              if (activeObs.length) {
                void localDb.alertsStore.bulkPut(activeObs).catch(() => {});
              }
              if (activeObs.some(a => a.severity === 'CRITICAL' && !a.acknowledged)) soundService.playEmergencyAlarm();
            } catch { if (alive) setError('Observation feed is unavailable. Previously received observations are retained.'); }
          } catch {
            if (!alive) return;
            const fallback = applyBleOverlay(simulatedVitals(activeId, anomaly, simConfig));
            setGateway(false);
            setVitals(fallback);
            setTelemetryHistory(prev => [...(prev[0]?.astronaut_id === activeId ? prev : []), fallback].slice(-36));
            mergeLocalSimAlerts(fallback);
          }
        }
      } catch { if (alive) setError('Local telemetry buffering failed. Check browser storage availability.'); }
      finally { if (alive) timer = setTimeout(tick, 1200); }
    }
    setTelemetryHistory(prev => (prev[0]?.astronaut_id === activeId ? prev : [simulatedVitals(activeId, anomaly, simConfig)]));
    void savedObservations.then(saved => {
      if (alive) {
        // Seed only today's acknowledged decisions while waiting for live tick evaluation.
        const initialAcked = saved.filter(a => a.acknowledged);
        if (initialAcked.length) setAlerts(initialAcked);
        if (!offline) {
          void fetchTelemetryHistory(activeId, 24)
            .then(hist => { if (alive && hist.length > 0) setTelemetryHistory(hist.slice(-36)); })
            .catch(() => {});
        }
        void tick();
      }
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [activeId, anomaly, simConfig, offline, updatePending, applyBleOverlay]);

  const acknowledge = useCallback(async (id: string) => {
    const target = alerts.find(a => a.id === id);
    const matchesTarget = (a: AlertItem) =>
      a.id === id || (target !== undefined && a.astronaut_id === activeId && a.alert_type === target.alert_type);

    setAlerts(items => items.map(a => (matchesTarget(a) ? { ...a, acknowledged: true } : a)));
    const matchingIds = alerts.filter(a => matchesTarget(a) && !a.id.startsWith('local-')).map(a => a.id);
    if (matchingIds.length) {
      void Promise.all(matchingIds.map(mid => localDb.alertsStore.update(mid, { acknowledged: true }).catch(() => {})));
    }
    if (offline || !gateway || id.startsWith('local-')) return;

    try {
      await acknowledgeAlert(id, { astronaut_id: activeId, alert_type: target?.alert_type });
      setError('');
    } catch {
      setAlerts(items => items.map(a => (matchesTarget(a) ? { ...a, acknowledged: false } : a)));
      setError('The server did not confirm acknowledgement. Please retry when connected.');
    }
  }, [alerts, activeId, offline, gateway]);

  const acknowledgeAll = useCallback(async () => {
    const open = alerts.filter(a => !a.acknowledged);
    if (!open.length) return;
    setAlerts(items => items.map(a => (a.astronaut_id === activeId ? { ...a, acknowledged: true } : a)));
    if (!offline && gateway) {
      await acknowledgeAllAlerts(activeId).catch(() => {});
    }
    await Promise.allSettled(
      open.filter(a => !a.id.startsWith('local-')).map(a => localDb.alertsStore.update(a.id, { acknowledged: true }).catch(() => {})),
    );
  }, [alerts, activeId, offline, gateway]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable]')) return;
      const member = crew[Number(event.key) - 1];
      if (member) setActiveId(member.id);
      if (event.key === ' ') { const alert = alerts.find(a => !a.acknowledged); if (alert) { event.preventDefault(); void acknowledge(alert.id); } }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [alerts, crew, acknowledge]);

  async function sync() {
    if (syncingRef.current || offline) return;
    syncingRef.current = true; setSyncing(true); setNotice('');
    try {
      setNotice(await sendQueuedTelemetry(activeId, syncOfflineBatch));
      await updatePending();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sync failed. Local records were retained.'); }
    finally { syncingRef.current = false; setSyncing(false); }
  }

  async function diagnose() {
    setDiagnosing(true);
    try { setDiagnostic(await runDiagnostics(activeId, simConfig)); }
    catch { setError('Diagnostics require the FastAPI connection. Please retry when the gateway is available.'); }
    finally { setDiagnosing(false); }
  }

  return {
    crew, crewDemo, activeId, setActiveId, vitals, telemetryHistory, alerts, anomaly, setAnomaly,
    simConfig, setSimConfig, acknowledgeAll,
    los, setLos, online, offline, gateway, pending, syncing, sync, diagnosing,
    diagnose, diagnostic, setDiagnostic, acknowledge, error, setError, notice,
    sound, setSound, bleStatus, bleDeviceName, bleError, connectBle, disconnectBle,
  };
}
