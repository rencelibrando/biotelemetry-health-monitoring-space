import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileImage,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  SELF_EXAM_GUIDES,
  buildObservationSpeechText,
  generateReferenceScanDataUrl,
  resizeImageFileToDataUrl,
  runAndSaveSelfExam,
} from '../services/selfExams';
import {
  isSpeechSynthesisSupported,
  isTtsPlaybackSupported,
  preloadSpeechVoices,
  primeAudioPlayback,
  speakAssistantReply,
  stopSpeaking,
} from '../services/voiceAssistant';
import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';

const OBSERVATION_PLACEHOLDERS: Record<SelfExamType, string> = {
  ocular_ultrasound: 'e.g., Right eye ONSD check on Day 45, mild brow pressure',
  dermal_radiation: 'e.g., Left forearm cuff check post-EVA, mild warmth',
  glucometer_nutrition: 'e.g., Fasting capillary glucose check prior to shift',
};

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
  const [cameraStarting, setCameraStarting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [latestResult, setLatestResult] = useState<ImageAssessmentRecord | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRequestRef = useRef(0);
  const analyzeSessionRef = useRef(0);
  const mountedRef = useRef(true);

  function stopCamera() {
    cameraRequestRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStarting(false);
    setVideoReady(false);
    setCameraOpen(false);
  }

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  useEffect(() => {
    mountedRef.current = true;
    setTtsSupported(isTtsPlaybackSupported());
    if (isSpeechSynthesisSupported()) preloadSpeechVoices();
    return () => {
      mountedRef.current = false;
      analyzeSessionRef.current++;
      stopCamera();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    analyzeSessionRef.current++;
    stopCamera();
    stopSpeaking();
    setDataUrl('');
    setNotes('');
    setError('');
    setTtsError('');
    setSpeaking(false);
    setTtsLoading(false);
    setLatestResult(null);
  }, [astronautId]);

  async function openCamera() {
    if (cameraOpen) {
      stopCamera();
      return;
    }
    if (cameraStarting) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture is unavailable in this browser. Upload an image file or load a sample frame instead.');
      return;
    }
    const token = ++cameraRequestRef.current;
    setCameraStarting(true);
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (token !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      if (token === cameraRequestRef.current) {
        setError('Camera permission was denied or no camera was detected. You can upload an image or load a reference scan.');
      }
    } finally {
      if (token === cameraRequestRef.current) {
        setCameraStarting(false);
      }
    }
  }

  function captureVideoFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Wait a moment for the live camera stream to load a frame before capturing.');
      return;
    }
    const width = Math.min(640, video.videoWidth);
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
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

  function triggerImageUpload() {
    setError('');
    stopCamera();
    fileRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    stopCamera();
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('Image exceeds 6 MB limit. Please select a smaller image.');
      return;
    }
    try {
      const resized = await resizeImageFileToDataUrl(file);
      stopCamera();
      setDataUrl(resized.dataUrl);
      setMimeType(resized.mimeType);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process image file.');
    }
  }

  function clearAttachedImage() {
    stopSpeaking();
    setSpeaking(false);
    setTtsLoading(false);
    setTtsError('');
    setDataUrl('');
    setLatestResult(null);
    setError('');
  }

  function speakObservation(record: ImageAssessmentRecord) {
    const speechText = buildObservationSpeechText(record);
    if (!speechText) return;
    setTtsError('');
    setSpeaking(false);
    const started = speakAssistantReply(speechText, {
      preferServerAudio: true,
      onStart: () => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(true);
      },
      onEnd: () => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(false);
      },
      onError: message => {
        if (!mountedRef.current) return;
        setTtsLoading(false);
        setSpeaking(false);
        if (message) setTtsError(message);
      },
    });
    setTtsLoading(started);
  }

  function toggleSpeakLatest() {
    if (speaking || ttsLoading) {
      stopSpeaking();
      setTtsLoading(false);
      setSpeaking(false);
      return;
    }
    if (!latestResult) return;
    speakObservation(latestResult);
  }

  function loadReferenceFrame() {
    setError('');
    setTtsError('');
    stopCamera();
    const refUrl = generateReferenceScanDataUrl(examType);
    setDataUrl(refUrl);
    setMimeType('image/png');
  }

  async function handleAnalyze() {
    if (cameraOpen) {
      setError('Live camera preview is active. Click Capture Frame to snapshot a photo first, or Stop Camera for checklist-only analysis.');
      return;
    }
    const token = ++analyzeSessionRef.current;
    stopSpeaking();
    setTtsLoading(false);
    setSpeaking(false);
    setError('');
    setTtsError('');
    const shouldAutoSpeak = autoRead && isTtsPlaybackSupported();
    if (shouldAutoSpeak) {
      // Unlock audio element inside the Analyze button click before awaiting backend vision.
      primeAudioPlayback();
    }
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
      if (!mountedRef.current || token !== analyzeSessionRef.current) return;
      setLatestResult(record);
      onAssessmentSaved(record);
      if (shouldAutoSpeak) {
        speakObservation(record);
      }
    } catch (cause) {
      if (!mountedRef.current || token !== analyzeSessionRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Assessment could not be completed.');
    } finally {
      if (mountedRef.current && token === analyzeSessionRef.current) {
        setSubmitting(false);
      }
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
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {ttsSupported ? (
            <button
              type="button"
              className="button secondary compact-btn"
              aria-pressed={autoRead}
              onClick={() => {
                const next = !autoRead;
                setAutoRead(next);
                setTtsError('');
                if (next) {
                  preloadSpeechVoices();
                  primeAudioPlayback();
                } else {
                  stopSpeaking();
                  setTtsLoading(false);
                  setSpeaking(false);
                }
              }}
            >
              {autoRead ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
              Auto-read {autoRead ? 'on' : 'off'}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={() => {
                analyzeSessionRef.current++;
                stopCamera();
                stopSpeaking();
                onClose();
              }}
            >
              <X size={14} aria-hidden="true" />
              Hide Capture
            </button>
          ) : null}
        </div>
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
              stopSpeaking();
              setSpeaking(false);
              setTtsError('');
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
              hidden
              onChange={handleFileChange}
            />
            <button type="button" className="button secondary compact-btn" onClick={triggerImageUpload}>
              <Upload size={14} aria-hidden="true" />
              Upload Image / Scan
            </button>
            <button
              type="button"
              className={`button ${cameraOpen ? 'primary' : 'secondary'} compact-btn`}
              onClick={openCamera}
              disabled={cameraStarting}
              aria-pressed={cameraOpen}
            >
              <Camera size={14} aria-hidden="true" />
              {cameraStarting ? 'Opening Camera...' : cameraOpen ? 'Stop Camera' : 'Live Camera'}
            </button>
            <button type="button" className="button secondary compact-btn" onClick={loadReferenceFrame}>
              <FileImage size={14} aria-hidden="true" />
              Load Sample Scan
            </button>
          </div>

          {cameraOpen ? (
            <>
              <div className="self-exam-preview">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  onPlaying={() => setVideoReady(true)}
                />
              </div>
              <div className="self-exam-camera-actions">
                <button
                  type="button"
                  className="button primary compact-btn"
                  disabled={!videoReady}
                  onClick={captureVideoFrame}
                >
                  Capture Frame
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  {videoReady ? 'Live viewfinder active — capture when ready, or upload an image.' : 'Starting camera stream...'}
                </span>
              </div>
            </>
          ) : dataUrl ? (
            <>
              <div className="self-exam-preview">
                <img src={dataUrl} alt={`${guide.label} captured frame`} />
              </div>
              <div className="self-exam-camera-actions">
                <span className="muted" style={{ fontSize: 12 }}>
                  Image attached and ready for analysis.
                </span>
                <button type="button" className="button secondary compact-btn" onClick={clearAttachedImage}>
                  Clear Image
                </button>
              </div>
            </>
          ) : (
            <p className="helper">Attach a B-mode ultrasound image, cabin skin photograph, or glucometer snapshot (optional: can also log checklist observation directly).</p>
          )}

          <label className="form-field self-exam-notes">
            <span>Observation notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={OBSERVATION_PLACEHOLDERS[examType]}
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
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>Assessment Result ({latestResult.analysisSource})</strong>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="pill">{latestResult.severity.toUpperCase()} · {latestResult.imageQuality}</span>
              {ttsSupported ? (
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={toggleSpeakLatest}
                  aria-label={speaking ? 'Stop observation readout' : ttsLoading ? 'Cancel voice synthesis' : 'Read observation aloud'}
                >
                  {speaking || ttsLoading ? <Square size={12} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
                  {speaking ? 'Stop' : ttsLoading ? 'Synthesizing...' : 'Read Aloud'}
                </button>
              ) : null}
            </div>
          </div>
          <p>{latestResult.findings}</p>
          <ul className="self-exam-actions-list">
            {latestResult.recommendedActions.map(action => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          {ttsError ? <small className="warning-text">{ttsError}</small> : null}
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
