/**
 * ConsentWise – Upload & Analyze Document Screen
 * POST /api/analyze-document  →  multipart/form-data with "file"
 * Returns: extracted_text, summary, key_points, risks, accessibility_hint, intent
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  Image,
  SafeAreaView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { API } from '@/constants/api';
import { CW } from '@/constants/theme';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AnalysisResult {
  extracted_text: string;
  summary: string;
  key_points: string[];
  risks: string[];
  accessibility_hint: string;
  intent: string;
}

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 20;

function humanSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function ShieldLogo() {
  return (
    <View style={styles.shieldWrap}>
      <Text style={styles.shieldEmoji}>🛡️</Text>
    </View>
  );
}

function SectionBlock({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, accent ? { color: accent } : {}]}>{label}</Text>
      {children}
    </View>
  );
}

function BulletList({ items, risk }: { items: string[]; risk?: boolean }) {
  if (!items.length)
    return (
      <Text style={styles.noItems}>
        {risk ? 'No notable risks found.' : 'None listed.'}
      </Text>
    );
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bullet, risk && styles.riskBullet]}>
            {risk ? '⚠' : '•'}
          </Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────────
export default function UploadScreen() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [showExtracted, setShowExtracted] = useState(false);

  // ── Pick from Files (PDF / Image) ───────────────────────────────────────────
  const pickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_TYPES,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const picked = res.assets[0];
      if (picked.size && picked.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File too large (max ${MAX_SIZE_MB} MB).`);
        return;
      }
      setFile({
        uri: picked.uri,
        name: picked.name,
        mimeType: picked.mimeType ?? 'application/octet-stream',
        size: picked.size,
      });
      setResult(null);
      setError('');
    } catch (e) {
      setError('Could not pick file. Please try again.');
    }
  }, []);

  // ── Pick from Camera / Gallery ──────────────────────────────────────────────
  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setFile({
      uri: asset.uri,
      name: `photo_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
    setResult(null);
    setError('');
  }, []);

  const pickFromGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Gallery permission is required.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setFile({
      uri: asset.uri,
      name: `image_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
    setResult(null);
    setError('');
  }, []);

  // ── Send to Backend ─────────────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        // On web, fetch the file as blob first
        const blob = await fetch(file.uri).then((r) => r.blob());
        formData.append('file', blob, file.name);
      } else {
        // React Native FormData accepts { uri, name, type }
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        } as unknown as Blob);
      }

      const response = await fetch(API.analyzeDocument, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type header — let the runtime set it with the boundary
      });

      if (!response.ok) {
        let detail = `Error ${response.status}`;
        try {
          const j = await response.json();
          detail = j.detail || detail;
        } catch (_) {}
        throw new Error(detail);
      }

      const data: AnalysisResult = await response.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Analysis failed. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [file]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setShowExtracted(false);
  };

  const isImage = file?.mimeType?.startsWith('image/');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <ShieldLogo />
            <View>
              <Text style={styles.eyebrow}>CONSENTWISE AI</Text>
              <Text style={styles.headerTitle}>Document Analyzer</Text>
            </View>
          </View>
          <View style={styles.pillBadge}>
            <Text style={styles.pillText}>Vision AI</Text>
          </View>
        </View>

        {/* ── Hero Upload Card ────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Upload a Document or Image</Text>
          <Text style={styles.heroDesc}>
            Drop a photo of a consent form, PDF agreement, or screenshot — our Vision AI will extract, summarize, and flag every risk for you.
          </Text>

          {/* ── Pick Buttons ─────────────────────────────────────────── */}
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickBtn} onPress={pickDocument} activeOpacity={0.8}>
              <Text style={styles.pickBtnIcon}>📄</Text>
              <Text style={styles.pickBtnLabel}>PDF / File</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pickBtn} onPress={pickFromGallery} activeOpacity={0.8}>
              <Text style={styles.pickBtnIcon}>🖼️</Text>
              <Text style={styles.pickBtnLabel}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pickBtn} onPress={pickFromCamera} activeOpacity={0.8}>
              <Text style={styles.pickBtnIcon}>📷</Text>
              <Text style={styles.pickBtnLabel}>Camera</Text>
            </TouchableOpacity>
          </View>

          {/* ── File Preview ─────────────────────────────────────────── */}
          {file && (
            <View style={styles.filePreview}>
              {isImage ? (
                <Image
                  source={{ uri: file.uri }}
                  style={styles.previewImg}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.pdfThumb}>
                  <Text style={styles.pdfIcon}>📋</Text>
                </View>
              )}
              <View style={styles.fileNameBar}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                {file.size ? (
                  <Text style={styles.fileSize}>{humanSize(file.size)}</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {/* ── Analyze Button ───────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.analyzeBtn, (!file || loading) && styles.analyzeBtnDisabled]}
            onPress={analyze}
            disabled={!file || loading}
            activeOpacity={0.85}>
            {loading ? (
              <View style={styles.analyzeBtnInner}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.analyzeBtnText}>Analyzing…</Text>
              </View>
            ) : (
              <Text style={styles.analyzeBtnText}>
                {file ? '🔍  Analyze Document' : 'Choose a File Above'}
              </Text>
            )}
          </TouchableOpacity>

          {loading && (
            <Text style={styles.loadingHint}>
              Sending to Vision AI — this may take a few seconds…
            </Text>
          )}
        </View>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && (
          <View style={styles.results}>
            {/* Summary */}
            <SectionBlock label="📝 Summary">
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>{result.summary || '—'}</Text>
              </View>
            </SectionBlock>

            {/* Intent */}
            <SectionBlock label="🎯 Document Intent">
              <View style={styles.intentBox}>
                <Text style={styles.intentText}>{result.intent || '—'}</Text>
              </View>
            </SectionBlock>

            {/* Key Points */}
            <SectionBlock label="🔑 Key Points">
              <BulletList items={result.key_points ?? []} />
            </SectionBlock>

            {/* Risks */}
            <SectionBlock label="⚠ Risks & Obligations" accent={CW.bad}>
              <BulletList items={result.risks ?? []} risk />
            </SectionBlock>

            {/* Accessibility Hint */}
            <SectionBlock label="💡 Plain Language Hint">
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>{result.accessibility_hint || '—'}</Text>
              </View>
            </SectionBlock>

            {/* Extracted Text (collapsible) */}
            <SectionBlock label="🔤 Extracted Text (Raw OCR)">
              <TouchableOpacity
                onPress={() => setShowExtracted((v) => !v)}
                style={styles.toggleBtn}
                activeOpacity={0.7}>
                <Text style={styles.toggleBtnText}>
                  {showExtracted ? 'Hide raw text ▴' : 'Show raw text ▾'}
                </Text>
              </TouchableOpacity>
              {showExtracted && (
                <View style={styles.extractedBox}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    <Text style={styles.extractedText}>
                      {result.extracted_text || '—'}
                    </Text>
                  </ScrollView>
                </View>
              )}
            </SectionBlock>

            {/* Reset */}
            <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.8}>
              <Text style={styles.resetBtnText}>↩  Analyze Another Document</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CW.bg,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shieldWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.18)',
  },
  shieldEmoji: { fontSize: 22 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: CW.accent,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: CW.text,
    marginTop: 1,
  },
  pillBadge: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: CW.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Hero Card
  heroCard: {
    backgroundColor: CW.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: CW.border,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
    gap: 14,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: CW.text,
    letterSpacing: -0.3,
  },
  heroDesc: {
    fontSize: 13.5,
    color: CW.muted,
    lineHeight: 20,
  },

  // Pick Buttons
  pickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(99,102,241,0.2)',
    borderStyle: 'dashed',
    gap: 6,
  },
  pickBtnIcon: { fontSize: 24 },
  pickBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CW.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // File Preview
  filePreview: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
    backgroundColor: '#f1f5f9',
  },
  previewImg: {
    width: '100%',
    height: 160,
    backgroundColor: '#e2e8f0',
  },
  pdfThumb: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  pdfIcon: { fontSize: 48 },
  fileNameBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: 'rgba(99,102,241,0.1)',
  },
  fileName: { flex: 1, fontSize: 12, fontWeight: '600', color: CW.muted },
  fileSize: { fontSize: 11, color: CW.muted, marginLeft: 8 },

  // Error
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 12.5, color: CW.bad, fontWeight: '600' },

  // Analyze Button (THE HERO CTA)
  analyzeBtn: {
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CW.accent,
    backgroundImage: undefined,
    // Gradient via shadow trick on native, override on web if needed
    shadowColor: CW.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 6,
  },
  analyzeBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  analyzeBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loadingHint: {
    fontSize: 11.5,
    color: CW.accent,
    textAlign: 'center',
    marginTop: -4,
  },

  // Results
  results: { gap: 14 },
  sectionBlock: {
    backgroundColor: CW.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: CW.border,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: CW.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  summaryText: { fontSize: 13.5, color: '#334155', lineHeight: 21 },
  intentBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 12,
  },
  intentText: { fontSize: 13, color: '#3730a3', fontWeight: '600', lineHeight: 19 },
  hintBox: {
    backgroundColor: '#fefce8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  hintText: { fontSize: 13, color: '#78350f', lineHeight: 20 },

  // Bullet list
  bulletList: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { fontSize: 14, color: CW.accent, marginTop: 1, width: 16 },
  riskBullet: { color: CW.bad },
  bulletText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 19 },
  noItems: { fontSize: 12.5, color: CW.muted, fontStyle: 'italic' },

  // Toggle / Extracted
  toggleBtn: { alignSelf: 'flex-start' },
  toggleBtnText: { fontSize: 12, fontWeight: '700', color: CW.accent },
  extractedBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: CW.border,
  },
  extractedText: { fontSize: 11.5, color: CW.muted, lineHeight: 18 },

  // Reset
  resetBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
  },
  resetBtnText: { fontSize: 13.5, fontWeight: '700', color: '#475569' },
});
