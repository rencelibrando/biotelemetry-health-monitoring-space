import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileImage, Sparkles, Upload, X } from 'lucide-react';
import {
  SELF_EXAM_GUIDES,
  generateReferenceScanDataUrl,
  resizeImageFileToDataUrl,
  runAndSaveSelfExam,
} from '../services/selfExams';
import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';

export function SelfExamCapture({
  astronautId,
  vitals,
  kpIndex,
  offline,
  examType,
  onExamTypeChange,
  assessments,
  onAssessmentSaved,
  onClose,
}: {
  astronautId: string;
  vitals: VitalSigns;
  kpIndex: number;
  offline: boolean;
  examType: SelfExamType;
  onExamTypeChange: (next: SelfExamType) => void;
  assessments: ImageAssessmentRecord[];
  onAssessmentSaved: (record: ImageAssessmentRecord) => void;
  onClose?: () => void;
}) {
  const guide = SELF_EXAM_GUIDES[examType];
  const [dataUrl, setDataUrl] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [notes, setNotes] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [latestResult, setLatestResult] = useState<ImageAssessmentRecord | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  useEffect(() => () => stopCamera(), []);

  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture is unavailable in this browser. Upload an image file or load a sample frame instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 30);
    } catch {
      setError('Camera permission was denied or no camera was detected. You can upload an image or load a reference scan.');
    }
  }

  function captureVideoFrame() {
    const video = videoRef.current;
    if (!video) return;
    const width = Math.min(640, video.videoWidth || 480);
    const height = Math.round(((video.videoHeight || 360) / (video.videoWidth || 480)) * width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    setDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    setMimeType('image/jpeg');
    stopCamera();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('Image exceeds 6 MB limit. Please select a smaller image.');
      return;
    }
    try {
      const resized = await resizeImageFileToDataUrl(file);
      setDataUrl(resized.dataUrl);
      setMimeType(resized.mimeType);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process image file.');
    }
  }

  function loadReferenceFrame() {
    setError('');
    stopCamera();
    const refUrl = generateReferenceScanDataUrl(examType);
    setDataUrl(refUrl);
    setMimeType('image/png');
  }

  async function handleAnalyze() {
    setError('');
    setSubmitting(true);
    try {
      const record = await runAndSaveSelfExam({
        astronautId,
        examType,
        dataUrl,
        mimeType,
        notes: notes.trim(),
        vitals,
        kpIndex,
        offline,
      });
      setLatestResult(record);
      onAssessmentSaved(record);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assessment could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel self-exam-panel" aria-labelledby="self-exam-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MULTIMODAL CLINICAL CAPTURE</span>
          <h2 id="self-exam-heading">
            <Camera size={18} aria-hidden="true" />
            Camera, Ultrasound &amp; Exam Capture
          </h2>
        </div>
        {onClose ? (
          <button type="button" className="button secondary compact-btn" onClick={() => { stopCamera(); onClose(); }}>
            <X size={14} aria-hidden="true" />
            Hide Capture
          </button>
        ) : null}
      </div>

      <div className="segmented exam-type-tabs" role="tablist" aria-label="Self-exam protocol">
        {(Object.keys(SELF_EXAM_GUIDES) as SelfExamType[]).map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={examType === key}
            aria-pressed={examType === key}
            onClick={() => {
              onExamTypeChange(key);
              setLatestResult(null);
            }}
          >
            {SELF_EXAM_GUIDES[key].label}
          </button>
        ))}
      </div>

      <div className="self-exam-grid">
        <div className="self-exam-guide">
          <h3>{guide.label}</h3>
          <p className="muted">{guide.subtitle}</p>
          <ol className="self-exam-steps">
            {guide.steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="self-exam-ref">
            <small><strong>Expected baseline:</strong> {guide.normalReference}</small>
            <small><strong>Escalate if:</strong> {guide.escalateTrigger}</small>
          </div>
        </div>

        <div className="self-exam-capture-box">
          <div className="self-exam-controls">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleFileChange}
            />
            <button type="button" className="button secondary compact-btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              Upload Image / Scan
            </button>
            {!cameraOpen ? (
              <button type="button" className="button secondary compact-btn" onClick={openCamera}>
                <Camera size={14} aria-hidden="true" />
                Live Camera
              </button>
            ) : (
              <button type="button" className="button primary compact-btn" onClick={captureVideoFrame}>
                Capture Frame
              </button>
            )}
            <button type="button" className="button secondary compact-btn" onClick={loadReferenceFrame}>
              <FileImage size={14} aria-hidden="true" />
              Load Sample Scan
            </button>
          </div>

          {cameraOpen ? (
            <div className="self-exam-preview">
              <video ref={videoRef} autoPlay playsInline muted />
            </div>
          ) : dataUrl ? (
            <div className="self-exam-preview">
              <img src={dataUrl} alt={`${guide.label} captured frame`} />
            </div>
          ) : (
            <p className="helper">Attach a B-mode ultrasound image, cabin skin photograph, or glucometer snapshot (optional: can also log checklist observation directly).</p>
          )}

          <label className="form-field self-exam-notes">
            <span>Observation notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., Right eye check on Day 45, mild brow pressure"
            />
          </label>

          {error ? <div className="error-box" role="alert">{error}</div> : null}

          <button
            type="button"
            className="button primary"
            disabled={submitting}
            onClick={handleAnalyze}
          >
            <Sparkles size={15} aria-hidden="true" />
            {submitting ? 'Analyzing frame & saving...' : 'Analyze & Save Exam'}
          </button>
        </div>
      </div>

      {latestResult ? (
        <div className={`observation-alert ${latestResult.severity === 'critical' ? 'critical' : latestResult.severity === 'nominal' ? 'info' : ''}`} role="status">
          <div className="row">
            <strong>Assessment Result ({latestResult.analysisSource})</strong>
            <span className="pill">{latestResult.severity.toUpperCase()} · {latestResult.imageQuality}</span>
          </div>
          <p>{latestResult.findings}</p>
          <ul className="self-exam-actions-list">
            {latestResult.recommendedActions.map(action => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          {latestResult.groundConsultRequired ? (
            <small className="warning-text">Ground Flight Surgeon review recommended at next comms pass.</small>
          ) : (
            <small className="success-text"><CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" /> Recorded cleanly on device history.</small>
          )}
        </div>
      ) : null}

      {assessments.length > 0 ? (
        <details className="disclosure">
          <summary>Recent Self-Exam History ({assessments.length})</summary>
          <div className="disclosure-content">
            <ul className="observation-list">
              {assessments.slice(0, 4).map(item => (
                <li key={item.id}>
                  <div className="row">
                    <strong>{SELF_EXAM_GUIDES[item.examType]?.label ?? item.examType}</strong>
                    <span className="pill">{item.severity}</span>
                  </div>
                  <p>{item.findings}</p>
                  <small>{new Date(item.recordedAt).toLocaleString()} · {item.analysisSource}</small>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </section>
  );
}
