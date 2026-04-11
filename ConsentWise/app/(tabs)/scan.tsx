/**
 * ConsentWise – Text / Page Scan Screen
 * POST /api/extension/analyze  →  JSON { text, title, url, source }
 * Returns: danger_score, reputation_score, login_safety, summary, key_points,
 *          risk_signals, recommended_action, intent, reputation_summary, etc.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { API } from '@/constants/api';
import { CW } from '@/constants/theme';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface RiskSignal {
  label: string;
  severity: string;
  explanation: string;
}

interface ScanResult {
  danger_score: number;
  reputation_score: number;
  login_safety: string;
  login_guidance: string;
  reputation_summary: string;
  reputation_examples: string[];
  summary: string;
  key_points: string[];
  accessibility_hint: string;
  intent: string;
  risk_signals: RiskSignal[];
  recommended_action: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function dangerTheme(score: number) {
  if (score >= 75) return { label: 'High Danger', color: CW.bad, bg: '#fef2f2', border: '#fecaca' };
  if (score >= 40) return { label: 'Use Caution', color: CW.warn, bg: '#fffbeb', border: '#fde68a' };
  return { label: 'Lower Danger', color: CW.good, bg: '#f0fdf4', border: '#bbf7d0' };
}
function reputationTheme(score: number) {
  if (score >= 75) return { label: 'Strong', color: CW.good };
  if (score >= 40) return { label: 'Mixed', color: CW.warn };
  return { label: 'Poor', color: CW.bad };
}
function loginBadgeStyle(safety: string) {
  const s = safety.toLowerCase();
  if (s === 'safe') return { bg: '#dcfce7', border: '#bbf7d0', text: '#15803d', label: 'Safe ✓' };
  if (s === 'unsafe') return { bg: '#fee2e2', border: '#fecaca', text: '#b91c1c', label: 'Unsafe ✗' };
  return { bg: '#fef3c7', border: '#fde68a', text: '#b45309', label: 'Caution ⚠' };
}

function ScoreRing({ score, color, label }: { score: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <View style={[ringStyles.wrap]}>
      <View style={[ringStyles.outer, { borderColor: color }]}>
        <Text style={[ringStyles.value, { color }]}>{pct}</Text>
        <Text style={ringStyles.outOf}>/100</Text>
      </View>
      <Text style={[ringStyles.label, { color }]}>{label}</Text>
    </View>
  );
}
const ringStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, flex: 1 },
  outer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  outOf: { fontSize: 10, color: CW.muted, fontWeight: '600' },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={scanStyles.card}>
      <Text style={scanStyles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────────
export default function ScanScreen() {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const analyze = useCallback(async () => {
    const clean = text.trim();
    if (!clean) { setError('Paste some policy or consent text first.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(API.extensionAnalyze, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: clean,
          title: title.trim(),
          url: url.trim(),
          source: 'mobile-app',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setResult(data as ScanResult);
    } catch (e: any) {
      setError(e.message || 'Scan failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [text, title, url]);

  const reset = () => { setText(''); setTitle(''); setUrl(''); setResult(null); setError(''); };

  return (
    <SafeAreaView style={scanStyles.safe}>
      <ScrollView
        style={scanStyles.scroll}
        contentContainerStyle={scanStyles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={scanStyles.header}>
          <Text style={scanStyles.eyebrow}>CONSENTWISE AI</Text>
          <Text style={scanStyles.headerTitle}>🛡️ Page / Text Scanner</Text>
          <Text style={scanStyles.headerDesc}>
            Paste any privacy policy, terms of service, or consent text and get an instant AI danger score, reputation check, and login safety guidance.
          </Text>
        </View>

        {/* Input Card */}
        <View style={scanStyles.inputCard}>
          <Text style={scanStyles.inputLabel}>PASTE POLICY / CONSENT TEXT</Text>
          <TextInput
            style={scanStyles.textArea}
            multiline
            numberOfLines={8}
            value={text}
            onChangeText={setText}
            placeholder="Paste privacy policy, terms of service, or any consent text here…"
            placeholderTextColor={CW.muted}
            textAlignVertical="top"
          />
          <View style={scanStyles.metaRow}>
            <TextInput
              style={[scanStyles.metaInput, { flex: 1 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Page title (optional)"
              placeholderTextColor={CW.muted}
            />
            <TextInput
              style={[scanStyles.metaInput, { flex: 1 }]}
              value={url}
              onChangeText={setUrl}
              placeholder="URL (optional)"
              placeholderTextColor={CW.muted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
          {!!error && (
            <View style={scanStyles.errorBox}>
              <Text style={scanStyles.errorText}>⚠ {error}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[scanStyles.scanBtn, (!text.trim() || loading) && scanStyles.scanBtnDisabled]}
            onPress={analyze}
            disabled={!text.trim() || loading}
            activeOpacity={0.85}>
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={scanStyles.scanBtnText}>Scanning…</Text>
              </View>
            ) : (
              <Text style={scanStyles.scanBtnText}>🔍  Run AI Scan</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && (
          <View style={{ gap: 14 }}>
            {/* Score cards */}
            <SectionCard title="Risk Scores">
              <View style={scanStyles.scoreRow}>
                <ScoreRing
                  score={result.danger_score}
                  color={dangerTheme(result.danger_score).color}
                  label={dangerTheme(result.danger_score).label}
                />
                <View style={scanStyles.scoreDivider} />
                <ScoreRing
                  score={result.reputation_score}
                  color={reputationTheme(result.reputation_score).color}
                  label={reputationTheme(result.reputation_score).label + ' Rep'}
                />
              </View>
            </SectionCard>

            {/* Login Safety */}
            {(() => {
              const ls = loginBadgeStyle(result.login_safety);
              return (
                <SectionCard title="Login Safety">
                  <View style={[scanStyles.loginStrip, { backgroundColor: ls.bg, borderColor: ls.border }]}>
                    <Text style={[scanStyles.loginBadge, { color: ls.text }]}>{ls.label}</Text>
                    <Text style={scanStyles.loginGuidance}>{result.login_guidance}</Text>
                  </View>
                </SectionCard>
              );
            })()}

            {/* Summary */}
            <SectionCard title="📝 Summary">
              <Text style={scanStyles.bodyText}>{result.summary}</Text>
            </SectionCard>

            {/* Intent */}
            <SectionCard title="🎯 Intent">
              <View style={scanStyles.intentChip}>
                <Text style={scanStyles.intentChipText}>{result.intent}</Text>
              </View>
            </SectionCard>

            {/* Key Points */}
            <SectionCard title="🔑 Key Points">
              {(result.key_points ?? []).length === 0 ? (
                <Text style={scanStyles.mutedText}>No key points extracted.</Text>
              ) : (
                result.key_points.map((p, i) => (
                  <View key={i} style={scanStyles.bulletRow}>
                    <Text style={scanStyles.bullet}>•</Text>
                    <Text style={scanStyles.bulletText}>{p}</Text>
                  </View>
                ))
              )}
            </SectionCard>

            {/* Risk Signals */}
            {result.risk_signals?.length > 0 && (
              <SectionCard title="⚠ Risk Signals">
                {result.risk_signals.map((r, i) => (
                  <View key={i} style={scanStyles.riskSignal}>
                    <View style={scanStyles.riskHeader}>
                      <Text style={scanStyles.riskLabel}>{r.label}</Text>
                      <View style={[scanStyles.severityBadge,
                        r.severity === 'high' && { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
                        r.severity === 'medium' && { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
                        r.severity === 'low' && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
                      ]}>
                        <Text style={[scanStyles.severityText,
                          r.severity === 'high' && { color: CW.bad },
                          r.severity === 'medium' && { color: CW.warn },
                          r.severity === 'low' && { color: CW.good },
                        ]}>{r.severity?.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={scanStyles.riskExplanation}>{r.explanation}</Text>
                  </View>
                ))}
              </SectionCard>
            )}

            {/* Recommended Action */}
            {!!result.recommended_action && (
              <SectionCard title="✅ Recommended Action">
                <View style={scanStyles.actionBox}>
                  <Text style={scanStyles.actionText}>{result.recommended_action}</Text>
                </View>
              </SectionCard>
            )}

            {/* Reputation */}
            <SectionCard title="🌐 Site Reputation">
              <Text style={scanStyles.bodyText}>{result.reputation_summary}</Text>
              {result.reputation_examples?.map((ex, i) => (
                <View key={i} style={scanStyles.bulletRow}>
                  <Text style={[scanStyles.bullet, { color: CW.bad }]}>⚠</Text>
                  <Text style={scanStyles.bulletText}>{ex}</Text>
                </View>
              ))}
            </SectionCard>

            {/* Accessibility Hint */}
            <SectionCard title="💡 Plain Language Hint">
              <View style={scanStyles.hintBox}>
                <Text style={scanStyles.hintText}>{result.accessibility_hint}</Text>
              </View>
            </SectionCard>

            {/* Reset */}
            <TouchableOpacity style={scanStyles.resetBtn} onPress={reset} activeOpacity={0.8}>
              <Text style={scanStyles.resetBtnText}>↩  Scan Another Document</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const scanStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CW.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  header: { gap: 6 },
  eyebrow: { fontSize: 9, fontWeight: '800', color: CW.accent, letterSpacing: 1.2, textTransform: 'uppercase' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: CW.text, letterSpacing: -0.3 },
  headerDesc: { fontSize: 13, color: CW.muted, lineHeight: 19 },

  inputCard: {
    backgroundColor: CW.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: CW.border,
    gap: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  inputLabel: { fontSize: 10, fontWeight: '800', color: CW.accent, letterSpacing: 0.8, textTransform: 'uppercase' },
  textArea: {
    height: 160,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    fontSize: 13.5,
    color: CW.text,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
    lineHeight: 20,
  },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: CW.text,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.12)',
  },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { fontSize: 12.5, color: CW.bad, fontWeight: '600' },
  scanBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    backgroundColor: CW.accent,
    shadowColor: CW.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 5,
  },
  scanBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  card: {
    backgroundColor: CW.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: CW.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', color: CW.accent, textTransform: 'uppercase', letterSpacing: 0.8 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 },
  scoreDivider: { width: 1, height: 60, backgroundColor: CW.border },

  loginStrip: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  loginBadge: { fontSize: 15, fontWeight: '800' },
  loginGuidance: { fontSize: 13, color: '#374151', lineHeight: 18 },

  bodyText: { fontSize: 13.5, color: '#334155', lineHeight: 21 },
  intentChip: {
    backgroundColor: '#eef2ff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
  },
  intentChipText: { fontSize: 13.5, color: '#3730a3', fontWeight: '600' },

  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { fontSize: 14, color: CW.accent, marginTop: 1, width: 16 },
  bulletText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 19 },
  mutedText: { fontSize: 12.5, color: CW.muted, fontStyle: 'italic' },

  riskSignal: {
    backgroundColor: '#fef9f0',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 6,
  },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  riskLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: CW.text },
  severityBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, backgroundColor: '#f8fafc', borderColor: CW.border,
  },
  severityText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  riskExplanation: { fontSize: 12.5, color: '#6b5c3e', lineHeight: 18 },

  actionBox: {
    backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  actionText: { fontSize: 13.5, color: '#14532d', lineHeight: 20, fontWeight: '600' },

  hintBox: { backgroundColor: '#fefce8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fde68a' },
  hintText: { fontSize: 13, color: '#78350f', lineHeight: 20 },

  resetBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  resetBtnText: { fontSize: 13.5, fontWeight: '700', color: '#475569' },
});
