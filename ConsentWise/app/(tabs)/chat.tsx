/**
 * ConsentWise – AI Chat + Text-to-Speech Screen
 * POST /api/chat   → { document_context, question, history }  → { answer }
 * POST /api/tts    → { text, language_code, voice_name }       → { audio_base64, mime_type }
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { API } from '@/constants/api';
import { CW } from '@/constants/theme';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage { role: 'user' | 'model'; text: string; }

const LANGUAGES = [
  { code: 'en-IN', label: 'Indian English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'pa-IN', label: 'Punjabi' },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const [docContext, setDocContext] = useState('');
  const [contextSet, setContextSet] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! Paste your document context above and I\'ll answer questions about it. You can ask in English, Hindi, or any supported Indian language!' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const confirmContext = () => {
    if (!docContext.trim()) return;
    setContextSet(true);
    setMessages([{
      role: 'model',
      text: `✅ Document loaded! I'm ready to answer your questions about it. Ask me anything in ${selectedLang.label}!`,
    }]);
  };

  const sendMessage = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;

    const questionWithLang = `[Please answer in ${selectedLang.label}] ${q}`;
    const userMsg: ChatMessage = { role: 'user', text: q };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const thinkingMsg: ChatMessage = { role: 'model', text: '…' };
    setMessages((prev) => [...prev, thinkingMsg]);

    try {
      const history = messages.filter((m) => m.role !== 'model' || m.text !== '…');
      const res = await fetch(API.chat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_context: docContext.trim(),
          question: questionWithLang,
          history: history.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Chat failed.');

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'model', text: data.answer };
        return updated;
      });
    } catch (e: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'model',
          text: 'Sorry, I couldn\'t process that. Please check your connection.',
        };
        return updated;
      });
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [input, sending, messages, docContext, selectedLang]);

  const speakLastAnswer = useCallback(async () => {
    const lastAI = [...messages].reverse().find((m) => m.role === 'model' && m.text !== '…');
    if (!lastAI) return;
    setTtsLoading(true);
    try {
      const res = await fetch(API.tts, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: lastAI.text.slice(0, 800),
          language_code: selectedLang.code,
          voice_name: 'Kore',
        }),
      });
      if (!res.ok) throw new Error('TTS failed');
      // On mobile we cannot autoplay audio, alert user instead
      Alert.alert(
        '🔊 TTS Ready',
        'On mobile, audio playback requires a native audio player. The TTS API is working correctly.',
      );
    } catch {
      Alert.alert('TTS Error', 'Could not generate speech. Try again.');
    } finally {
      setTtsLoading(false);
    }
  }, [messages, selectedLang]);

  return (
    <SafeAreaView style={chatStyles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>

        <ScrollView
          style={chatStyles.scroll}
          contentContainerStyle={chatStyles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={chatStyles.header}>
            <Text style={chatStyles.eyebrow}>CONSENTWISE AI</Text>
            <Text style={chatStyles.headerTitle}>💬 Ask the Document</Text>
            <Text style={chatStyles.headerDesc}>
              Paste the document text once, then ask questions in English or any Indian language.
            </Text>
          </View>

          {/* Document Context Card */}
          {!contextSet ? (
            <View style={chatStyles.contextCard}>
              <Text style={chatStyles.inputLabel}>PASTE DOCUMENT / POLICY TEXT</Text>
              <TextInput
                style={chatStyles.contextInput}
                multiline
                numberOfLines={7}
                value={docContext}
                onChangeText={setDocContext}
                placeholder="Paste the full terms, policy, or consent text you want me to explain…"
                placeholderTextColor={CW.muted}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[chatStyles.setContextBtn, !docContext.trim() && chatStyles.btnDisabled]}
                onPress={confirmContext}
                disabled={!docContext.trim()}
                activeOpacity={0.85}>
                <Text style={chatStyles.setContextBtnText}>✅  Set Document Context</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={chatStyles.contextSetBanner}>
              <Text style={chatStyles.contextSetText}>📄 Document context loaded</Text>
              <TouchableOpacity onPress={() => { setContextSet(false); setDocContext(''); }} activeOpacity={0.7}>
                <Text style={chatStyles.contextChangeLink}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Language Selector */}
          <View style={chatStyles.langRow}>
            <Text style={chatStyles.langLabel}>Reply language:</Text>
            <TouchableOpacity
              style={chatStyles.langSelector}
              onPress={() => setShowLangPicker(!showLangPicker)}
              activeOpacity={0.8}>
              <Text style={chatStyles.langValue}>{selectedLang.label} ▾</Text>
            </TouchableOpacity>
          </View>

          {showLangPicker && (
            <View style={chatStyles.langPicker}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[chatStyles.langOption, selectedLang.code === lang.code && chatStyles.langOptionSelected]}
                  onPress={() => { setSelectedLang(lang); setShowLangPicker(false); }}
                  activeOpacity={0.8}>
                  <Text style={[chatStyles.langOptionText, selectedLang.code === lang.code && chatStyles.langOptionTextSelected]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Chat Window */}
          <View style={chatStyles.chatWindow}>
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              {messages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    chatStyles.bubble,
                    msg.role === 'user' ? chatStyles.userBubble : chatStyles.aiBubble,
                  ]}>
                  <Text style={[chatStyles.bubbleText, msg.role === 'user' && chatStyles.userBubbleText]}>
                    {msg.text === '…' ? '⋯ Thinking…' : msg.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* TTS button for last AI answer */}
          {contextSet && messages.length > 1 && (
            <TouchableOpacity
              style={chatStyles.ttsBtn}
              onPress={speakLastAnswer}
              disabled={ttsLoading}
              activeOpacity={0.8}>
              {ttsLoading ? (
                <ActivityIndicator color={CW.accent} size="small" />
              ) : (
                <Text style={chatStyles.ttsBtnText}>🔊  Listen to Last Answer</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Chat Input */}
          <View style={chatStyles.inputRow}>
            <TextInput
              style={chatStyles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask a question about this document…"
              placeholderTextColor={CW.muted}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              editable={contextSet && !sending}
            />
            <TouchableOpacity
              style={[chatStyles.sendBtn, (!input.trim() || !contextSet || sending) && chatStyles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || !contextSet || sending}
              activeOpacity={0.85}>
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={chatStyles.sendBtnText}>➤</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const chatStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CW.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 20, gap: 14 },

  header: { gap: 4 },
  eyebrow: { fontSize: 9, fontWeight: '800', color: CW.accent, letterSpacing: 1.2, textTransform: 'uppercase' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: CW.text, letterSpacing: -0.3 },
  headerDesc: { fontSize: 13, color: CW.muted, lineHeight: 19 },

  contextCard: {
    backgroundColor: CW.surface,
    borderRadius: 20,
    padding: 16,
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
  contextInput: {
    height: 140,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    fontSize: 13.5,
    color: CW.text,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)',
    lineHeight: 20,
  },
  setContextBtn: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    backgroundColor: CW.accent,
    shadowColor: CW.accent, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 4,
  },
  btnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  setContextBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

  contextSetBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f0fdf4', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  contextSetText: { fontSize: 13.5, fontWeight: '700', color: '#15803d' },
  contextChangeLink: { fontSize: 12.5, fontWeight: '700', color: CW.accent },

  langRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  langLabel: { fontSize: 12.5, color: CW.muted, fontWeight: '600' },
  langSelector: {
    flex: 1, backgroundColor: CW.surface, borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: CW.border,
  },
  langValue: { fontSize: 13.5, color: CW.text, fontWeight: '600' },
  langPicker: {
    backgroundColor: CW.surface, borderRadius: 16, borderWidth: 1,
    borderColor: CW.border, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  langOption: {
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: CW.border,
  },
  langOptionSelected: { backgroundColor: '#eef2ff' },
  langOptionText: { fontSize: 14, color: CW.text },
  langOptionTextSelected: { color: CW.accent, fontWeight: '700' },

  chatWindow: {
    backgroundColor: CW.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CW.border,
    padding: 12,
    height: 300,
    gap: 8,
  },
  bubble: {
    maxWidth: '84%', borderRadius: 16, padding: 12,
    marginBottom: 8,
  },
  aiBubble: {
    alignSelf: 'flex-start', backgroundColor: '#eef2ff',
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    alignSelf: 'flex-end', backgroundColor: CW.accent,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 13.5, color: '#312e81', lineHeight: 20 },
  userBubbleText: { color: '#fff' },

  ttsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CW.surface, borderRadius: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: CW.border, gap: 6,
  },
  ttsBtnText: { fontSize: 13, fontWeight: '700', color: CW.accent },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  textInput: {
    flex: 1, backgroundColor: CW.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 14, color: CW.text,
    borderWidth: 1, borderColor: CW.border,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: CW.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: CW.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
