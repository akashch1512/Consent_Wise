/**
 * ConsentWise – Interactive Quiz Screen
 * POST /api/generate-quiz  →  { document_context }
 * Returns: { questions: [{ question, option_a, option_b, correct_option, explanation }] }
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
interface QuizQuestion {
  question: string;
  option_a: string;
  option_b: string;
  correct_option: 'A' | 'B';
  explanation: string;
}

type AnswerMap = Record<number, 'A' | 'B' | null>;

// ─── Main Screen ─────────────────────────────────────────────────────────────────
export default function QuizScreen() {
  const [docContext, setDocContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const [score, setScore] = useState<number | null>(null);

  const generateQuiz = useCallback(async () => {
    const clean = docContext.trim();
    if (!clean) { setError('Paste document text first.'); return; }
    setLoading(true);
    setError('');
    setQuestions([]);
    setAnswers({});
    setRevealed({});
    setScore(null);
    try {
      const res = await fetch(API.quiz, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_context: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Quiz generation failed.');
      setQuestions(data.questions ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to generate quiz. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [docContext]);

  const handleAnswer = (qIdx: number, option: 'A' | 'B') => {
    if (revealed[qIdx]) return; // already revealed
    setAnswers((prev) => ({ ...prev, [qIdx]: option }));
  };

  const revealAnswer = (qIdx: number) => {
    if (answers[qIdx] == null) return;
    setRevealed((prev) => ({ ...prev, [qIdx]: true }));
  };

  const submitAll = () => {
    const newRevealed: Record<number, boolean> = {};
    questions.forEach((_, i) => { if (answers[i] != null) newRevealed[i] = true; });
    setRevealed(newRevealed);
    const correct = questions.filter((q, i) => answers[i] === q.correct_option).length;
    setScore(correct);
  };

  const reset = () => {
    setDocContext('');
    setQuestions([]);
    setAnswers({});
    setRevealed({});
    setScore(null);
    setError('');
  };

  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] != null);

  return (
    <SafeAreaView style={quizStyles.safe}>
      <ScrollView
        style={quizStyles.scroll}
        contentContainerStyle={quizStyles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={quizStyles.header}>
          <Text style={quizStyles.eyebrow}>CONSENTWISE AI</Text>
          <Text style={quizStyles.headerTitle}>🧠 Understanding Quiz</Text>
          <Text style={quizStyles.headerDesc}>
            Paste a document and let AI generate a comprehension quiz to test whether you've understood the key terms and risks.
          </Text>
        </View>

        {/* Input Card */}
        {questions.length === 0 && (
          <View style={quizStyles.inputCard}>
            <Text style={quizStyles.inputLabel}>PASTE DOCUMENT / POLICY TEXT</Text>
            <TextInput
              style={quizStyles.textArea}
              multiline
              numberOfLines={7}
              value={docContext}
              onChangeText={setDocContext}
              placeholder="Paste the full terms, policy or consent text to generate a quiz from…"
              placeholderTextColor={CW.muted}
              textAlignVertical="top"
            />
            {!!error && (
              <View style={quizStyles.errorBox}>
                <Text style={quizStyles.errorText}>⚠ {error}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[quizStyles.generateBtn, (!docContext.trim() || loading) && quizStyles.btnDisabled]}
              onPress={generateQuiz}
              disabled={!docContext.trim() || loading}
              activeOpacity={0.85}>
              {loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={quizStyles.generateBtnText}>Generating Quiz…</Text>
                </View>
              ) : (
                <Text style={quizStyles.generateBtnText}>🧩  Generate Quiz</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Score Banner */}
        {score !== null && (
          <View style={[quizStyles.scoreBanner,
            score === questions.length ? quizStyles.scorePerfect :
            score >= questions.length / 2 ? quizStyles.scoreGood : quizStyles.scoreBad,
          ]}>
            <Text style={quizStyles.scoreName}>
              {score === questions.length ? '🏆 Perfect Score!' :
               score >= questions.length / 2 ? '👍 Good Job!' : '📖 Keep Reviewing!'}
            </Text>
            <Text style={quizStyles.scoreValue}>{score} / {questions.length} correct</Text>
          </View>
        )}

        {/* Questions */}
        {questions.map((q, i) => {
          const userAnswer = answers[i];
          const isRevealed = revealed[i];
          const isCorrect = userAnswer === q.correct_option;

          return (
            <View key={i} style={quizStyles.questionCard}>
              {/* Question Header */}
              <View style={quizStyles.questionHeader}>
                <View style={quizStyles.questionNumBadge}>
                  <Text style={quizStyles.questionNum}>Q{i + 1}</Text>
                </View>
                <Text style={quizStyles.questionText}>{q.question}</Text>
              </View>

              {/* Options */}
              <View style={quizStyles.optionsRow}>
                {(['A', 'B'] as const).map((opt) => {
                  const optText = opt === 'A' ? q.option_a : q.option_b;
                  const isSelected = userAnswer === opt;
                  const isThisCorrect = q.correct_option === opt;

                  let optStyle = [quizStyles.optionBtn];
                  let optTextStyle = [quizStyles.optionTextStyle];

                  if (isRevealed) {
                    if (isThisCorrect) {
                      optStyle.push(quizStyles.optionCorrect as any);
                      optTextStyle.push(quizStyles.optionTextCorrect as any);
                    } else if (isSelected && !isThisCorrect) {
                      optStyle.push(quizStyles.optionWrong as any);
                      optTextStyle.push(quizStyles.optionTextWrong as any);
                    }
                  } else if (isSelected) {
                    optStyle.push(quizStyles.optionSelected as any);
                    optTextStyle.push(quizStyles.optionTextSelected as any);
                  }

                  return (
                    <TouchableOpacity
                      key={opt}
                      style={optStyle}
                      onPress={() => handleAnswer(i, opt)}
                      disabled={isRevealed}
                      activeOpacity={0.8}>
                      <View style={quizStyles.optionLetter}>
                        <Text style={[quizStyles.optionLetterText, isSelected && !isRevealed && { color: CW.accent }]}>
                          {opt}
                        </Text>
                      </View>
                      <Text style={optTextStyle}>{optText}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reveal / Result */}
              {!isRevealed && userAnswer != null && (
                <TouchableOpacity
                  style={quizStyles.revealBtn}
                  onPress={() => revealAnswer(i)}
                  activeOpacity={0.8}>
                  <Text style={quizStyles.revealBtnText}>Check Answer</Text>
                </TouchableOpacity>
              )}

              {isRevealed && (
                <View style={[quizStyles.resultBox, isCorrect ? quizStyles.resultCorrect : quizStyles.resultWrong]}>
                  <Text style={[quizStyles.resultIcon]}>{isCorrect ? '✅ Correct!' : '❌ Incorrect'}</Text>
                  <Text style={quizStyles.explanationText}>{q.explanation}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Submit All / Reset */}
        {questions.length > 0 && score === null && (
          <TouchableOpacity
            style={[quizStyles.submitBtn, !allAnswered && quizStyles.btnDisabled]}
            onPress={submitAll}
            disabled={!allAnswered}
            activeOpacity={0.85}>
            <Text style={quizStyles.submitBtnText}>Submit All Answers</Text>
          </TouchableOpacity>
        )}

        {questions.length > 0 && (
          <TouchableOpacity style={quizStyles.resetBtn} onPress={reset} activeOpacity={0.8}>
            <Text style={quizStyles.resetBtnText}>↩  New Quiz</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const quizStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CW.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  header: { gap: 4 },
  eyebrow: { fontSize: 9, fontWeight: '800', color: CW.accent, letterSpacing: 1.2, textTransform: 'uppercase' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: CW.text, letterSpacing: -0.3 },
  headerDesc: { fontSize: 13, color: CW.muted, lineHeight: 19 },

  inputCard: {
    backgroundColor: CW.surface, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: CW.border, gap: 12,
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 2,
  },
  inputLabel: { fontSize: 10, fontWeight: '800', color: CW.accent, letterSpacing: 0.8, textTransform: 'uppercase' },
  textArea: {
    height: 140, backgroundColor: '#f8fafc', borderRadius: 14, padding: 14,
    fontSize: 13.5, color: CW.text, borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)', lineHeight: 20,
  },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { fontSize: 12.5, color: CW.bad, fontWeight: '600' },
  generateBtn: {
    borderRadius: 16, paddingVertical: 17, alignItems: 'center',
    backgroundColor: CW.accent,
    shadowColor: CW.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 16, elevation: 5,
  },
  btnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  scoreBanner: {
    borderRadius: 18, padding: 18, alignItems: 'center', gap: 4,
    borderWidth: 1,
  },
  scorePerfect: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  scoreGood: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  scoreBad: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  scoreName: { fontSize: 20, fontWeight: '800', color: CW.text },
  scoreValue: { fontSize: 14, fontWeight: '700', color: CW.muted },

  questionCard: {
    backgroundColor: CW.surface, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: CW.border, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 1,
  },
  questionHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  questionNumBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', flexShrink: 0,
  },
  questionNum: { fontSize: 12, fontWeight: '800', color: CW.accent },
  questionText: { flex: 1, fontSize: 15, fontWeight: '700', color: CW.text, lineHeight: 22 },

  optionsRow: { gap: 10 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.12)',
  },
  optionSelected: { backgroundColor: '#eef2ff', borderColor: CW.accent },
  optionCorrect: { backgroundColor: '#f0fdf4', borderColor: CW.good },
  optionWrong: { backgroundColor: '#fef2f2', borderColor: CW.bad },
  optionLetter: {
    width: 24, height: 24, borderRadius: 8, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionLetterText: { fontSize: 12, fontWeight: '800', color: CW.muted },
  optionTextStyle: { flex: 1, fontSize: 13.5, color: CW.text, lineHeight: 19 },
  optionTextSelected: { color: CW.accent, fontWeight: '600' },
  optionTextCorrect: { color: CW.good, fontWeight: '700' },
  optionTextWrong: { color: CW.bad, fontWeight: '700' },

  revealBtn: {
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    backgroundColor: CW.accent,
    shadowColor: CW.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  revealBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },

  resultBox: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  resultCorrect: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  resultWrong: { backgroundColor: '#fef9f0', borderColor: '#fde68a' },
  resultIcon: { fontSize: 14, fontWeight: '800', color: CW.text },
  explanationText: { fontSize: 13, color: '#374151', lineHeight: 19 },

  submitBtn: {
    borderRadius: 16, paddingVertical: 17, alignItems: 'center',
    backgroundColor: CW.accent,
    shadowColor: CW.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 16, elevation: 5,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  resetBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  resetBtnText: { fontSize: 13.5, fontWeight: '700', color: '#475569' },
});
