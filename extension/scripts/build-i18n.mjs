/**
 * One-shot generator: merges translations for keys the redesigned popup uses
 * into src/config/i18n.js. Existing translations are preserved; new keys get
 * the translations defined below, falling back to English where a locale is
 * not yet covered. Re-runnable.
 *
 *   node scripts/build-i18n.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "..", "src", "config", "i18n.js");

const LOCALES = ["en-IN", "hi-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN"];

// key -> { locale: value }.  en-IN is required; missing locales fall back to en-IN.
const T = {
  // Tabs
  tabScan: { "en-IN": "Scan", "hi-IN": "स्कैन", "mr-IN": "स्कॅन", "ta-IN": "ஸ்கேன்", "te-IN": "స్కాన్", "bn-IN": "স্ক্যান", "gu-IN": "સ્કેન", "kn-IN": "ಸ್ಕ್ಯಾನ್", "ml-IN": "സ്കാൻ", "pa-IN": "ਸਕੈਨ" },
  tabChat: { "en-IN": "Chat", "hi-IN": "चैट", "mr-IN": "चॅट", "ta-IN": "அரட்டை", "te-IN": "చాట్", "bn-IN": "চ্যাট", "gu-IN": "ચેટ", "kn-IN": "ಚಾಟ್", "ml-IN": "ചാറ്റ്", "pa-IN": "ਚੈਟ" },
  tabQuiz: { "en-IN": "Quiz", "hi-IN": "क्विज़", "mr-IN": "प्रश्नमंजुषा", "ta-IN": "வினாடி வினா", "te-IN": "క్విజ్", "bn-IN": "কুইজ", "gu-IN": "ક્વિઝ", "kn-IN": "ಕ್ವಿಜ್", "ml-IN": "ക്വിസ്", "pa-IN": "ਕੁਇਜ਼" },
  tabDoc: { "en-IN": "Document", "hi-IN": "दस्तावेज़", "mr-IN": "दस्तऐवज", "ta-IN": "ஆவணம்", "te-IN": "పత్రం", "bn-IN": "নথি", "gu-IN": "દસ્તાવેજ", "kn-IN": "ದಾಖಲೆ", "ml-IN": "രേഖ", "pa-IN": "ਦਸਤਾਵੇਜ਼" },

  // Welcome / onboarding
  welcomeTitle: { "en-IN": "ConsentWise AI" },
  welcomeDesc: {
    "en-IN": "A calm, clear way to review terms and spot risky clauses before you agree.",
    "hi-IN": "सहमति देने से पहले शर्तें समझने और जोखिम भरे खंड पहचानने का सरल तरीका।",
    "mr-IN": "सहमती देण्यापूर्वी अटी समजून घेण्याचा आणि धोकादायक कलमे ओळखण्याचा सोपा मार्ग.",
    "ta-IN": "ஒப்புக்கொள்வதற்கு முன் விதிமுறைகளைப் புரிந்து ஆபத்தான பிரிவுகளைக் கண்டறியும் எளிய வழி.",
    "te-IN": "అంగీకరించే ముందు నిబంధనలను అర్థం చేసుకుని ప్రమాదకర భాగాలను గుర్తించే సులభ మార్గం.",
    "bn-IN": "সম্মতি দেওয়ার আগে শর্তাবলী বুঝে ঝুঁকিপূর্ণ ধারা চিহ্নিত করার সহজ উপায়।",
    "gu-IN": "સંમતિ આપતાં પહેલાં શરતો સમજવાની અને જોખમી કલમો ઓળખવાની સરળ રીત.",
    "kn-IN": "ಒಪ್ಪುವ ಮೊದಲು ಷರತ್ತುಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಂಡು ಅಪಾಯಕಾರಿ ಷರತ್ತುಗಳನ್ನು ಗುರುತಿಸುವ ಸುಲಭ ದಾರಿ.",
    "ml-IN": "സമ്മതിക്കുന്നതിന് മുമ്പ് വ്യവസ്ഥകൾ മനസ്സിലാക്കാനും അപകടകരമായ ഭാഗങ്ങൾ കണ്ടെത്താനുമുള്ള എളുപ്പവഴി.",
    "pa-IN": "ਸਹਿਮਤੀ ਦੇਣ ਤੋਂ ਪਹਿਲਾਂ ਸ਼ਰਤਾਂ ਸਮਝਣ ਅਤੇ ਜੋਖਮ ਵਾਲੀਆਂ ਧਾਰਾਵਾਂ ਪਛਾਣਨ ਦਾ ਸੌਖਾ ਤਰੀਕਾ।",
  },
  getStarted: { "en-IN": "Get started", "hi-IN": "शुरू करें", "mr-IN": "सुरू करा", "ta-IN": "தொடங்குக", "te-IN": "ప్రారంభించండి", "bn-IN": "শুরু করুন", "gu-IN": "શરૂ કરો", "kn-IN": "ಪ್ರಾರಂಭಿಸಿ", "ml-IN": "തുടങ്ങുക", "pa-IN": "ਸ਼ੁਰੂ ਕਰੋ" },

  // Verdict
  notScanned: { "en-IN": "Not scanned yet", "hi-IN": "अभी स्कैन नहीं हुआ", "mr-IN": "अद्याप स्कॅन केले नाही", "ta-IN": "இன்னும் ஸ்கேன் செய்யவில்லை", "te-IN": "ఇంకా స్కాన్ చేయలేదు", "bn-IN": "এখনও স্ক্যান হয়নি", "gu-IN": "હજી સ્કેન થયું નથી", "kn-IN": "ಇನ್ನೂ ಸ್ಕ್ಯಾನ್ ಆಗಿಲ್ಲ", "ml-IN": "ഇതുവരെ സ്കാൻ ചെയ്തിട്ടില്ല", "pa-IN": "ਹਾਲੇ ਸਕੈਨ ਨਹੀਂ ਹੋਇਆ" },
  notScannedHint: { "en-IN": "Run a scan to see the risk on this page." },
  verdictLow: { "en-IN": "Looks routine", "hi-IN": "सामान्य लगता है", "mr-IN": "सामान्य वाटते", "ta-IN": "வழக்கமானதாகத் தெரிகிறது", "te-IN": "సాధారణంగా ఉంది", "bn-IN": "স্বাভাবিক মনে হচ্ছে", "gu-IN": "સામાન્ય લાગે છે", "kn-IN": "ಸಾಮಾನ್ಯವಾಗಿದೆ", "ml-IN": "സാധാരണമായി തോന്നുന്നു", "pa-IN": "ਆਮ ਲੱਗਦਾ ਹੈ" },
  verdictMid: { "en-IN": "Review carefully", "hi-IN": "ध्यान से पढ़ें", "mr-IN": "काळजीपूर्वक वाचा", "ta-IN": "கவனமாகப் படியுங்கள்", "te-IN": "జాగ్రత్తగా చదవండి", "bn-IN": "মনোযোগ দিয়ে পড়ুন", "gu-IN": "ધ્યાનથી વાંચો", "kn-IN": "ಎಚ್ಚರಿಕೆಯಿಂದ ಓದಿ", "ml-IN": "ശ്രദ്ധയോടെ വായിക്കുക", "pa-IN": "ਧਿਆਨ ਨਾਲ ਪੜ੍ਹੋ" },
  verdictHigh: { "en-IN": "High risk", "hi-IN": "अधिक जोखिम", "mr-IN": "जास्त धोका", "ta-IN": "அதிக ஆபத்து", "te-IN": "అధిక ప్రమాదం", "bn-IN": "উচ্চ ঝুঁকি", "gu-IN": "ઊંચું જોખમ", "kn-IN": "ಹೆಚ್ಚಿನ ಅಪಾಯ", "ml-IN": "ഉയർന്ന അപകടം", "pa-IN": "ਵੱਧ ਜੋਖਮ" },
  verdictHint: { "en-IN": "Higher score means more risk.", "hi-IN": "ज़्यादा अंक यानी ज़्यादा जोखिम।", "mr-IN": "जास्त गुण म्हणजे जास्त धोका.", "ta-IN": "அதிக மதிப்பெண் என்றால் அதிக ஆபத்து.", "te-IN": "ఎక్కువ స్కోరు అంటే ఎక్కువ ప్రమాదం.", "bn-IN": "বেশি স্কোর মানে বেশি ঝুঁকি।", "gu-IN": "વધુ સ્કોર એટલે વધુ જોખમ.", "kn-IN": "ಹೆಚ್ಚು ಸ್ಕೋರ್ ಎಂದರೆ ಹೆಚ್ಚು ಅಪಾಯ.", "ml-IN": "കൂടുതൽ സ്കോർ എന്നാൽ കൂടുതൽ അപകടം.", "pa-IN": "ਵੱਧ ਸਕੋਰ ਦਾ ਮਤਲਬ ਵੱਧ ਜੋਖਮ।" },
  scanning: { "en-IN": "Scanning…", "hi-IN": "स्कैन हो रहा है…", "mr-IN": "स्कॅन होत आहे…", "ta-IN": "ஸ்கேன் செய்கிறது…", "te-IN": "స్కాన్ అవుతోంది…", "bn-IN": "স্ক্যান হচ্ছে…", "gu-IN": "સ્કેન થઈ રહ્યું છે…", "kn-IN": "ಸ್ಕ್ಯಾನ್ ಆಗುತ್ತಿದೆ…", "ml-IN": "സ്കാൻ ചെയ്യുന്നു…", "pa-IN": "ਸਕੈਨ ਹੋ ਰਿਹਾ ਹੈ…" },

  siteTrust: { "en-IN": "Site trust", "hi-IN": "साइट भरोसा", "mr-IN": "साइट विश्वास", "ta-IN": "தள நம்பகம்", "te-IN": "సైట్ నమ్మకం", "bn-IN": "সাইট আস্থা", "gu-IN": "સાઇટ ભરોસો", "kn-IN": "ಸೈಟ್ ನಂಬಿಕೆ", "ml-IN": "സൈറ്റ് വിശ്വാസം", "pa-IN": "ਸਾਈਟ ਭਰੋਸਾ" },
  trustStrong: { "en-IN": "Strong", "hi-IN": "मज़बूत", "mr-IN": "मजबूत", "ta-IN": "வலுவானது", "te-IN": "బలంగా", "bn-IN": "শক্তিশালী", "gu-IN": "મજબૂત", "kn-IN": "ಬಲವಾದ", "ml-IN": "ശക്തം", "pa-IN": "ਮਜ਼ਬੂਤ" },
  trustMixed: { "en-IN": "Mixed", "hi-IN": "मिला-जुला", "mr-IN": "संमिश्र", "ta-IN": "கலப்பு", "te-IN": "మిశ్రమం", "bn-IN": "মিশ্র", "gu-IN": "મિશ્ર", "kn-IN": "ಮಿಶ್ರ", "ml-IN": "സമ്മിശ്രം", "pa-IN": "ਮਿਲਿਆ-ਜੁਲਿਆ" },
  trustWeak: { "en-IN": "Weak", "hi-IN": "कमज़ोर", "mr-IN": "कमकुवत", "ta-IN": "பலவீனம்", "te-IN": "బలహీనం", "bn-IN": "দুর্বল", "gu-IN": "નબળું", "kn-IN": "ದುರ್ಬಲ", "ml-IN": "ദുർബലം", "pa-IN": "ਕਮਜ਼ੋਰ" },

  justNow: { "en-IN": "just now", "hi-IN": "अभी", "mr-IN": "आत्ताच", "ta-IN": "இப்போது", "te-IN": "ఇప్పుడే", "bn-IN": "এইমাত্র", "gu-IN": "હમણાં", "kn-IN": "ಈಗ", "ml-IN": "ഇപ്പോൾ", "pa-IN": "ਹੁਣੇ" },
  minAgo: { "en-IN": "min ago", "hi-IN": "मिनट पहले", "mr-IN": "मिनिटांपूर्वी", "ta-IN": "நிமிடம் முன்பு", "te-IN": "నిమిషాల క్రితం", "bn-IN": "মিনিট আগে", "gu-IN": "મિનિટ પહેલાં", "kn-IN": "ನಿಮಿಷ ಹಿಂದೆ", "ml-IN": "മിനിറ്റ് മുമ്പ്", "pa-IN": "ਮਿੰਟ ਪਹਿਲਾਂ" },
  hrAgo: { "en-IN": "hr ago", "hi-IN": "घंटे पहले", "mr-IN": "तासांपूर्वी", "ta-IN": "மணி முன்பு", "te-IN": "గంటల క్రితం", "bn-IN": "ঘণ্টা আগে", "gu-IN": "કલાક પહેલાં", "kn-IN": "ಗಂಟೆ ಹಿಂದೆ", "ml-IN": "മണിക്കൂർ മുമ്പ്", "pa-IN": "ਘੰਟੇ ਪਹਿਲਾਂ" },
  dayAgo: { "en-IN": "days ago", "hi-IN": "दिन पहले", "mr-IN": "दिवसांपूर्वी", "ta-IN": "நாட்கள் முன்பு", "te-IN": "రోజుల క్రితం", "bn-IN": "দিন আগে", "gu-IN": "દિવસ પહેલાં", "kn-IN": "ದಿನಗಳ ಹಿಂದೆ", "ml-IN": "ദിവസം മുമ്പ്", "pa-IN": "ਦਿਨ ਪਹਿਲਾਂ" },

  showMore: { "en-IN": "Show more", "hi-IN": "और दिखाएँ", "mr-IN": "अधिक दाखवा", "ta-IN": "மேலும் காட்டு", "te-IN": "మరిన్ని చూపు", "bn-IN": "আরও দেখুন", "gu-IN": "વધુ બતાવો", "kn-IN": "ಇನ್ನಷ್ಟು ತೋರಿಸು", "ml-IN": "കൂടുതൽ കാണിക്കുക", "pa-IN": "ਹੋਰ ਵੇਖੋ" },
  showLess: { "en-IN": "Show less", "hi-IN": "कम दिखाएँ", "mr-IN": "कमी दाखवा", "ta-IN": "குறைவாகக் காட்டு", "te-IN": "తక్కువ చూపు", "bn-IN": "কম দেখুন", "gu-IN": "ઓછું બતાવો", "kn-IN": "ಕಡಿಮೆ ತೋರಿಸು", "ml-IN": "കുറച്ച് കാണിക്കുക", "pa-IN": "ਘੱਟ ਵੇਖੋ" },
  whatWeFound: { "en-IN": "What we found", "hi-IN": "हमें क्या मिला", "mr-IN": "आम्हाला काय आढळले", "ta-IN": "நாங்கள் கண்டறிந்தது", "te-IN": "మేము కనుగొన్నది", "bn-IN": "আমরা যা পেয়েছি", "gu-IN": "અમને શું મળ્યું", "kn-IN": "ನಾವು ಕಂಡುದ್ದು", "ml-IN": "ഞങ്ങൾ കണ്ടെത്തിയത്", "pa-IN": "ਅਸੀਂ ਕੀ ਲੱਭਿਆ" },
  openFullReport: { "en-IN": "Open full report", "hi-IN": "पूरी रिपोर्ट खोलें", "mr-IN": "संपूर्ण अहवाल उघडा", "ta-IN": "முழு அறிக்கையைத் திற", "te-IN": "పూర్తి నివేదికను తెరవండి", "bn-IN": "সম্পূর্ণ রিপোর্ট খুলুন", "gu-IN": "સંપૂર્ણ અહેવાલ ખોલો", "kn-IN": "ಪೂರ್ಣ ವರದಿ ತೆರೆಯಿರಿ", "ml-IN": "പൂർണ്ണ റിപ്പോർട്ട് തുറക്കുക", "pa-IN": "ਪੂਰੀ ਰਿਪੋਰਟ ਖੋਲ੍ਹੋ" },
  analyzeBtn: { "en-IN": "Analyze this page", "hi-IN": "यह पृष्ठ जाँचें", "mr-IN": "हे पृष्ठ तपासा", "ta-IN": "இந்தப் பக்கத்தை பகுப்பாய்வு செய்", "te-IN": "ఈ పేజీని విశ్లేషించు", "bn-IN": "এই পৃষ্ঠা বিশ্লেষণ করুন", "gu-IN": "આ પૃષ્ઠ તપાસો", "kn-IN": "ಈ ಪುಟ ವಿಶ್ಲೇಷಿಸಿ", "ml-IN": "ഈ പേജ് പരിശോധിക്കുക", "pa-IN": "ਇਹ ਪੰਨਾ ਜਾਂਚੋ" },
  cancel: { "en-IN": "Cancel", "hi-IN": "रद्द करें", "mr-IN": "रद्द करा", "ta-IN": "ரத்து", "te-IN": "రద్దు", "bn-IN": "বাতিল", "gu-IN": "રદ કરો", "kn-IN": "ರದ್ದುಮಾಡಿ", "ml-IN": "റദ്ദാക്കുക", "pa-IN": "ਰੱਦ ਕਰੋ" },

  // Chat / quiz extras
  retry: { "en-IN": "Retry", "hi-IN": "पुनः प्रयास", "mr-IN": "पुन्हा प्रयत्न", "ta-IN": "மீண்டும் முயற்சி", "te-IN": "మళ్లీ ప్రయత్నించు", "bn-IN": "আবার চেষ্টা", "gu-IN": "ફરી પ્રયાસ", "kn-IN": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", "ml-IN": "വീണ്ടും ശ്രമിക്കുക", "pa-IN": "ਮੁੜ ਕੋਸ਼ਿਸ਼" },

  // Profile / settings
  profileTitle: { "en-IN": "Profile", "hi-IN": "प्रोफ़ाइल", "mr-IN": "प्रोफाइल", "ta-IN": "சுயவிவரம்", "te-IN": "ప్రొఫైల్", "bn-IN": "প্রোফাইল", "gu-IN": "પ્રોફાઇલ", "kn-IN": "ಪ್ರೊಫೈಲ್", "ml-IN": "പ്രൊഫൈൽ", "pa-IN": "ਪ੍ਰੋਫਾਈਲ" },
  personalDetails: { "en-IN": "Your details", "hi-IN": "आपका विवरण", "mr-IN": "तुमचा तपशील", "ta-IN": "உங்கள் விவரங்கள்", "te-IN": "మీ వివరాలు", "bn-IN": "আপনার তথ্য", "gu-IN": "તમારી વિગતો", "kn-IN": "ನಿಮ್ಮ ವಿವರಗಳು", "ml-IN": "നിങ്ങളുടെ വിവരങ്ങൾ", "pa-IN": "ਤੁਹਾਡਾ ਵੇਰਵਾ" },
  interestsLabel: { "en-IN": "What matters most to you", "hi-IN": "आपके लिए क्या ज़रूरी है", "mr-IN": "तुमच्यासाठी काय महत्त्वाचे आहे", "ta-IN": "உங்களுக்கு எது முக்கியம்", "te-IN": "మీకు ఏది ముఖ్యం", "bn-IN": "আপনার কাছে কী গুরুত্বপূর্ণ", "gu-IN": "તમારા માટે શું મહત્ત્વનું છે", "kn-IN": "ನಿಮಗೆ ಏನು ಮುಖ್ಯ", "ml-IN": "നിങ്ങൾക്ക് എന്ത് പ്രധാനം", "pa-IN": "ਤੁਹਾਡੇ ਲਈ ਕੀ ਜ਼ਰੂਰੀ ਹੈ" },
  settingsLabel: { "en-IN": "Settings", "hi-IN": "सेटिंग्स", "mr-IN": "सेटिंग्ज", "ta-IN": "அமைப்புகள்", "te-IN": "సెట్టింగ్‌లు", "bn-IN": "সেটিংস", "gu-IN": "સેટિંગ્સ", "kn-IN": "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", "ml-IN": "ക്രമീകരണങ്ങൾ", "pa-IN": "ਸੈਟਿੰਗਾਂ" },
  saveProfile: { "en-IN": "Save", "hi-IN": "सहेजें", "mr-IN": "जतन करा", "ta-IN": "சேமி", "te-IN": "సేవ్", "bn-IN": "সংরক্ষণ", "gu-IN": "સાચવો", "kn-IN": "ಉಳಿಸಿ", "ml-IN": "സംരക്ഷിക്കുക", "pa-IN": "ਸੰਭਾਲੋ" },
  logOut: { "en-IN": "Log out", "hi-IN": "लॉग आउट", "mr-IN": "लॉग आउट", "ta-IN": "வெளியேறு", "te-IN": "లాగ్ అవుట్", "bn-IN": "লগ আউট", "gu-IN": "લૉગ આઉટ", "kn-IN": "ಲಾಗ್ ಔಟ್", "ml-IN": "ലോഗ് ഔട്ട്", "pa-IN": "ਲੌਗ ਆਉਟ" },
  logoutConfirm: { "en-IN": "Log out and clear this device's saved data?" },
  namePlaceholder: { "en-IN": "Name", "hi-IN": "नाम", "mr-IN": "नाव", "ta-IN": "பெயர்", "te-IN": "పేరు", "bn-IN": "নাম", "gu-IN": "નામ", "kn-IN": "ಹೆಸರು", "ml-IN": "പേര്", "pa-IN": "ਨਾਮ" },
  emailPlaceholder: { "en-IN": "Email", "hi-IN": "ईमेल", "mr-IN": "ईमेल", "ta-IN": "மின்னஞ்சல்", "te-IN": "ఇమెయిల్", "bn-IN": "ইমেল", "gu-IN": "ઇમેઇલ", "kn-IN": "ಇಮೇಲ್", "ml-IN": "ഇമെയിൽ", "pa-IN": "ਈਮੇਲ" },
  langLabel: { "en-IN": "Language" },
  protectionRow: { "en-IN": "Protection", "hi-IN": "सुरक्षा", "mr-IN": "संरक्षण", "ta-IN": "பாதுகாப்பு", "te-IN": "రక్షణ", "bn-IN": "সুরক্ষা", "gu-IN": "સુરક્ષા", "kn-IN": "ರಕ್ಷಣೆ", "ml-IN": "സംരക്ഷണം", "pa-IN": "ਸੁਰੱਖਿਆ" },
  protectionOn: { "en-IN": "On", "hi-IN": "चालू", "mr-IN": "चालू", "ta-IN": "இயக்கத்தில்", "te-IN": "ఆన్", "bn-IN": "চালু", "gu-IN": "ચાલુ", "kn-IN": "ಆನ್", "ml-IN": "ഓൺ", "pa-IN": "ਚਾਲੂ" },
  protectionOff: { "en-IN": "Off", "hi-IN": "बंद", "mr-IN": "बंद", "ta-IN": "நிறுத்தப்பட்டது", "te-IN": "ఆఫ్", "bn-IN": "বন্ধ", "gu-IN": "બંધ", "kn-IN": "ಆಫ್", "ml-IN": "ഓഫ്", "pa-IN": "ਬੰਦ" },
  protected: { "en-IN": "Caught", "hi-IN": "रोके", "mr-IN": "अडवले", "ta-IN": "தடுத்தது", "te-IN": "అడ్డుకున్నవి", "bn-IN": "আটকানো", "gu-IN": "રોક્યાં", "kn-IN": "ತಡೆದವು", "ml-IN": "തടഞ്ഞവ", "pa-IN": "ਰੋਕੇ" },
  analyzed: { "en-IN": "Analyzed", "hi-IN": "जाँचे", "mr-IN": "तपासले", "ta-IN": "பகுப்பாய்வு", "te-IN": "విశ్లేషించినవి", "bn-IN": "বিশ্লেষিত", "gu-IN": "તપાસ્યાં", "kn-IN": "ವಿಶ್ಲೇಷಿಸಿದವು", "ml-IN": "പരിശോധിച്ചവ", "pa-IN": "ਜਾਂਚੇ" },

  // Your data
  yourData: { "en-IN": "Your data", "hi-IN": "आपका डेटा", "mr-IN": "तुमचा डेटा", "ta-IN": "உங்கள் தரவு", "te-IN": "మీ డేటా", "bn-IN": "আপনার ডেটা", "gu-IN": "તમારો ડેટા", "kn-IN": "ನಿಮ್ಮ ಡೇಟಾ", "ml-IN": "നിങ്ങളുടെ ഡാറ്റ", "pa-IN": "ਤੁਹਾਡਾ ਡਾਟਾ" },
  whatWeSend: {
    "en-IN": "When you analyze a page, its text, title and address are sent to the ConsentWise backend and read by an AI model.",
    "hi-IN": "जब आप कोई पृष्ठ जाँचते हैं, तो उसका टेक्स्ट, शीर्षक और पता ConsentWise बैकएंड को भेजा जाता है और एक AI मॉडल द्वारा पढ़ा जाता है।",
  },
  deviceId: { "en-IN": "Device ID", "hi-IN": "डिवाइस आईडी", "mr-IN": "डिव्हाइस आयडी", "ta-IN": "சாதன ஐடி", "te-IN": "పరికర ID", "bn-IN": "ডিভাইস আইডি", "gu-IN": "ડિવાઇસ ID", "kn-IN": "ಸಾಧನ ID", "ml-IN": "ഉപകരണ ID", "pa-IN": "ਡਿਵਾਈਸ ID" },
  copy: { "en-IN": "Copy", "hi-IN": "कॉपी", "mr-IN": "कॉपी", "ta-IN": "நகல்", "te-IN": "కాపీ", "bn-IN": "কপি", "gu-IN": "કૉપિ", "kn-IN": "ನಕಲಿಸಿ", "ml-IN": "പകർത്തുക", "pa-IN": "ਕਾਪੀ" },
  copied: { "en-IN": "Copied", "hi-IN": "कॉपी हो गया", "mr-IN": "कॉपी झाले", "ta-IN": "நகலெடுக்கப்பட்டது", "te-IN": "కాపీ అయింది", "bn-IN": "কপি হয়েছে", "gu-IN": "કૉપિ થયું", "kn-IN": "ನಕಲಿಸಲಾಗಿದೆ", "ml-IN": "പകർത്തി", "pa-IN": "ਕਾਪੀ ਹੋ ਗਿਆ" },
  resetId: { "en-IN": "Reset", "hi-IN": "रीसेट", "mr-IN": "रीसेट", "ta-IN": "மீட்டமை", "te-IN": "రీసెట్", "bn-IN": "রিসেট", "gu-IN": "રીસેટ", "kn-IN": "ಮರುಹೊಂದಿಸಿ", "ml-IN": "പുനഃസജ്ജമാക്കുക", "pa-IN": "ਰੀਸੈੱਟ" },
  resetIdConfirm: { "en-IN": "Get a fresh device ID? Your saved history stays with the old ID." },
  downloadData: { "en-IN": "Download my data", "hi-IN": "मेरा डेटा डाउनलोड करें", "mr-IN": "माझा डेटा डाउनलोड करा", "ta-IN": "எனது தரவைப் பதிவிறக்கு", "te-IN": "నా డేటాను డౌన్‌లోడ్ చేయి", "bn-IN": "আমার ডেটা ডাউনলোড করুন", "gu-IN": "મારો ડેટા ડાઉનલોડ કરો", "kn-IN": "ನನ್ನ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ", "ml-IN": "എന്റെ ഡാറ്റ ഡൗൺലോഡ് ചെയ്യുക", "pa-IN": "ਮੇਰਾ ਡਾਟਾ ਡਾਊਨਲੋਡ ਕਰੋ" },
  deleteData: { "en-IN": "Delete my data", "hi-IN": "मेरा डेटा हटाएँ", "mr-IN": "माझा डेटा हटवा", "ta-IN": "எனது தரவை நீக்கு", "te-IN": "నా డేటాను తొలగించు", "bn-IN": "আমার ডেটা মুছুন", "gu-IN": "મારો ડેટા કાઢી નાખો", "kn-IN": "ನನ್ನ ಡೇಟಾ ಅಳಿಸಿ", "ml-IN": "എന്റെ ഡാറ്റ ഇല്ലാതാക്കുക", "pa-IN": "ਮੇਰਾ ਡਾਟਾ ਮਿਟਾਓ" },
  deleteDataConfirm: { "en-IN": "Delete your profile and analysis history from the ConsentWise backend? This cannot be undone." },
  noServerData: { "en-IN": "No data stored on the backend for this device yet." },

  // Errors / status (banner)
  noTab: { "en-IN": "No active tab found." },
  restrictedPage: { "en-IN": "This browser page can't be scanned. Open a normal website first." },
  ownAppPage: { "en-IN": "ConsentWise's own pages are excluded. Open the site you want to review." },
  noText: { "en-IN": "No readable text was found on this page." },
  cannotRead: { "en-IN": "Could not read this page. Try refreshing it." },
  backendUnreachable: { "en-IN": "Could not reach the ConsentWise backend. Start the server and try again." },
  analysisFailed: { "en-IN": "Analysis failed", "hi-IN": "विश्लेषण विफल", "mr-IN": "विश्लेषण अयशस्वी", "ta-IN": "பகுப்பாய்வு தோல்வி", "te-IN": "విశ్లేషణ విఫలమైంది", "bn-IN": "বিশ্লেষণ ব্যর্থ", "gu-IN": "વિશ્લેષણ નિષ્ફળ", "kn-IN": "ವಿಶ್ಲೇಷಣೆ ವಿಫಲ", "ml-IN": "വിശകലനം പരാജയപ്പെട്ടു", "pa-IN": "ਵਿਸ਼ਲੇਸ਼ਣ ਅਸਫਲ" },
  ttsFailed: { "en-IN": "Couldn't load audio. Try again." },
  micDenied: { "en-IN": "Microphone access was denied. Allow it in the extension's site settings." },
  micNetwork: { "en-IN": "Couldn't reach the transcription server." },
  docBadType: { "en-IN": "Unsupported file. Use JPG, PNG, WEBP, HEIC or PDF." },
  docTooBig: { "en-IN": "File is too large (max 20 MB)." },
  docSending: { "en-IN": "Reading the document…" },
  docUnlocked: { "en-IN": "Chat and Quiz now use this document." },
  analyzeFirstHint: {
    "en-IN": "Analyze a page or a document first, then come back here.",
    "hi-IN": "पहले कोई पृष्ठ या दस्तावेज़ जाँचें, फिर यहाँ लौटें।",
    "mr-IN": "आधी एखादे पृष्ठ किंवा दस्तऐवज तपासा, मग इथे परत या.",
    "ta-IN": "முதலில் ஒரு பக்கத்தையோ ஆவணத்தையோ பகுப்பாய்வு செய்து, பிறகு இங்கே திரும்பவும்.",
    "te-IN": "ముందుగా ఒక పేజీ లేదా పత్రాన్ని విశ్లేషించి, ఆపై ఇక్కడికి తిరిగి రండి.",
    "bn-IN": "প্রথমে একটি পৃষ্ঠা বা নথি বিশ্লেষণ করুন, তারপর এখানে ফিরে আসুন।",
    "gu-IN": "પહેલાં કોઈ પૃષ્ઠ કે દસ્તાવેજ તપાસો, પછી અહીં પાછા આવો.",
    "kn-IN": "ಮೊದಲು ಒಂದು ಪುಟ ಅಥವಾ ದಾಖಲೆ ವಿಶ್ಲೇಷಿಸಿ, ನಂತರ ಇಲ್ಲಿಗೆ ಹಿಂತಿರುಗಿ.",
    "ml-IN": "ആദ്യം ഒരു പേജോ രേഖയോ പരിശോധിക്കുക, പിന്നെ ഇവിടെ തിരികെ വരൂ.",
    "pa-IN": "ਪਹਿਲਾਂ ਕੋਈ ਪੰਨਾ ਜਾਂ ਦਸਤਾਵੇਜ਼ ਜਾਂਚੋ, ਫਿਰ ਇੱਥੇ ਵਾਪਸ ਆਓ।",
  },
  showRaw: { "en-IN": "Show raw text", "hi-IN": "मूल टेक्स्ट दिखाएँ", "mr-IN": "मूळ मजकूर दाखवा", "ta-IN": "மூல உரையைக் காட்டு", "te-IN": "అసలు వచనం చూపు", "bn-IN": "মূল লেখা দেখান", "gu-IN": "મૂળ ટેક્સ્ટ બતાવો", "kn-IN": "ಮೂಲ ಪಠ್ಯ ತೋರಿಸು", "ml-IN": "യഥാർത്ഥ വാചകം കാണിക്കുക", "pa-IN": "ਮੂਲ ਟੈਕਸਟ ਵੇਖੋ" },
  hideRaw: { "en-IN": "Hide raw text", "hi-IN": "मूल टेक्स्ट छिपाएँ", "mr-IN": "मूळ मजकूर लपवा", "ta-IN": "மூல உரையை மறை", "te-IN": "అసలు వచనం దాచు", "bn-IN": "মূল লেখা লুকান", "gu-IN": "મૂળ ટેક્સ્ટ છુપાવો", "kn-IN": "ಮೂಲ ಪಠ್ಯ ಮರೆಮಾಡು", "ml-IN": "യഥാർത്ഥ വാചകം മറയ്ക്കുക", "pa-IN": "ਮੂਲ ਟੈਕਸਟ ਲੁਕਾਓ" },
  accessibilityHint: { "en-IN": "In plain words", "hi-IN": "आसान शब्दों में", "mr-IN": "सोप्या शब्दांत", "ta-IN": "எளிய சொற்களில்", "te-IN": "సరళ మాటల్లో", "bn-IN": "সহজ কথায়", "gu-IN": "સાદા શબ્દોમાં", "kn-IN": "ಸರಳ ಪದಗಳಲ್ಲಿ", "ml-IN": "ലളിതമായ വാക്കുകളിൽ", "pa-IN": "ਸੌਖੇ ਸ਼ਬਦਾਂ ਵਿੱਚ" },
  dropLabel: { "en-IN": "Drop an image or PDF", "hi-IN": "छवि या PDF यहाँ छोड़ें", "mr-IN": "प्रतिमा किंवा PDF इथे टाका", "ta-IN": "படம் அல்லது PDF ஐ இழுத்து விடு", "te-IN": "చిత్రం లేదా PDF ను ఇక్కడ వదలండి", "bn-IN": "ছবি বা PDF এখানে ছাড়ুন", "gu-IN": "છબી કે PDF અહીં મૂકો", "kn-IN": "ಚಿತ್ರ ಅಥವಾ PDF ಇಲ್ಲಿ ಬಿಡಿ", "ml-IN": "ചിത്രമോ PDF-ഓ ഇവിടെ ഇടുക", "pa-IN": "ਚਿੱਤਰ ਜਾਂ PDF ਇੱਥੇ ਸੁੱਟੋ" },
  dropHint: { "en-IN": "or click to choose a file", "hi-IN": "या फ़ाइल चुनने के लिए क्लिक करें", "mr-IN": "किंवा फाइल निवडण्यासाठी क्लिक करा", "ta-IN": "அல்லது கோப்பைத் தேர்வுசெய்யக் கிளிக் செய்யவும்", "te-IN": "లేదా ఫైల్ ఎంచుకోవడానికి క్లిక్ చేయండి", "bn-IN": "অথবা ফাইল বেছে নিতে ক্লিক করুন", "gu-IN": "અથવા ફાઇલ પસંદ કરવા ક્લિક કરો", "kn-IN": "ಅಥವಾ ಫೈಲ್ ಆಯ್ಕೆಗೆ ಕ್ಲಿಕ್ ಮಾಡಿ", "ml-IN": "അല്ലെങ്കിൽ ഫയൽ തിരഞ്ഞെടുക്കാൻ ക്ലിക്ക് ചെയ്യുക", "pa-IN": "ਜਾਂ ਫਾਈਲ ਚੁਣਨ ਲਈ ਕਲਿੱਕ ਕਰੋ" },
};

// Keys that legitimately stay English-only for now (transient errors / confirms
// and longer explainer copy). Nav + primary UI must not be listed here.
export const EN_ONLY = new Set([
  "notScannedHint", "welcomeTitle", "logoutConfirm", "langLabel",
  "resetIdConfirm", "deleteDataConfirm", "noServerData", "noTab",
  "restrictedPage", "ownAppPage", "noText", "cannotRead", "backendUnreachable",
  "ttsFailed", "micDenied", "micNetwork", "docBadType", "docTooBig",
  "docSending", "docUnlocked", "whatWeSend",
]);

function loadDicts() {
  const ctx = {};
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(FILE, "utf8"), ctx);
  return ctx.ConsentWiseI18n.dictionaries;
}

function main() {
  const dicts = loadDicts();
  const enKeys = new Set(Object.keys(dicts["en-IN"]));
  for (const key of Object.keys(T)) enKeys.add(key);

  const out = {};
  for (const locale of LOCALES) {
    const src = dicts[locale] || {};
    const merged = {};
    for (const key of enKeys) {
      if (T[key] && T[key][locale] != null) merged[key] = T[key][locale];
      else if (src[key] != null) merged[key] = src[key];
      else if (T[key] && T[key]["en-IN"] != null) merged[key] = T[key]["en-IN"];
      else merged[key] = dicts["en-IN"][key];
    }
    out[locale] = merged;
  }

  const header = `"use strict";

/**
 * ConsentWise AI — popup internationalisation
 * Generated / maintained via scripts/build-i18n.mjs — edit translations there.
 *
 *   ConsentWiseI18n.dictionaries        → { "en-IN": {...}, ... }
 *   ConsentWiseI18n.translate(lang,key) → string (falls back to en-IN, then key)
 *   ConsentWiseI18n.apply(lang)         → swap [data-i18n] / [data-i18n-placeholder]
 */
(function attachI18n(root) {

  const I18N = ${JSON.stringify(out, null, 2)};

  const FALLBACK_LANG = "en-IN";

  function translate(lang, key) {
    const dict = I18N[lang] || I18N[FALLBACK_LANG];
    return dict[key] || I18N[FALLBACK_LANG][key] || key;
  }

  function apply(lang) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.hasAttribute("data-i18n-on")) return;
      el.textContent = translate(lang, el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = translate(lang, el.getAttribute("data-i18n-placeholder"));
    });
  }

  root.ConsentWiseI18n = { dictionaries: I18N, translate, apply, FALLBACK_LANG };
})(typeof globalThis !== "undefined" ? globalThis : self);
`;

  fs.writeFileSync(FILE, header);
  console.log(`i18n.js rebuilt — ${enKeys.size} keys × ${LOCALES.length} locales`);
}

// Only rebuild when run directly (check-i18n.mjs imports EN_ONLY from here).
if (import.meta.url === `file://${process.argv[1]}`) main();
