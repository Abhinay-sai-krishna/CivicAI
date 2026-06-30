import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "es" | "te" | "hi";

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "civicai_agent": "CivicAI Agent",
    "citizen_portal": "Citizen Portal",
    "municipal_dashboard": "Municipal Dashboard",
    "sign_out": "Sign Out",
    "connected": "Connected",
    "offline_mode": "Offline Mode",
    "active_investigations": "Active Investigations",
    "points": "points",
    "report_issue": "Report Civic Issue",
    "nearby_alerts": "Nearby Urgent Alerts",
    "verified_feed": "Verified Case Feed",
    "resolution_board": "Resolution Board",
    "honor_leaderboard": "Honor Leaderboard",
    "repair_visuals": "Repair Visualizations",
    "all_categories": "All Categories",
    "potholes": "Potholes",
    "garbage": "Garbage Dumping",
    "leakage": "Water Leakage",
    "streetlight": "Streetlights",
    "other": "Other Concerns",
    "unresolved_count": "Unresolved Issues",
    "resolved_count": "Resolved Issues",
    "live_satellite": "Live Satellite Tracking Grid",
    "interactive_map": "Interactive Geo-Spatial Heatmap",
    "dispatch_active": "GPS Dispatch Active",
    "welcome_back": "Welcome back",
    "citizen_rookie": "Citizen Rookie",
    "xp_points": "XP Points",
    "reports": "Reports",
    "upvotes": "Upvotes",
    "badge_count": "Badges",
    "slogan": "Decentralized AI-Led Municipal Resolution & Verification Corridor",
    "admin_corridor": "CivicAI Agent Corridor - Secured Full-Stack Sandbox Environment",
    "powered_by": "Powered by Google Gemini 2.5 Pro Vision Models & Firebase Cloud Systems • Natural Tones Edition",
    "select_category": "Select Category Filter",
    "pothole": "Pothole Damage",
    "waste": "Garbage & Waste",
    "water_leak": "Water Leakage",
    "street_lamp": "Streetlight Defect",
    "other_issue": "General Hazard",
    "loading": "Synchronizing Central Civic Intelligence...",
    "sub_bar_reported": "Case Reports Processed",
    "sub_bar_urgency": "Emergency Protocols Loaded",
    "sub_bar_sync": "Cloud Server Synced",
    "sub_bar_points": "Community XP Pool",
    "verify_assess": "Verify & Assess with Gemini Vision",
    "queue_offline": "Queue Issue Report Offline",
    "discard": "Discard",
    "lodge_report": "Lodge Report & Earn XP",
    "report_lodged": "Report Lodged! +100 XP"
  },
  es: {
    "civicai_agent": "Agente CivicAI",
    "citizen_portal": "Portal Ciudadano",
    "municipal_dashboard": "Tablero Municipal",
    "sign_out": "Cerrar Sesión",
    "connected": "Conectado",
    "offline_mode": "Modo Fuera de Línea",
    "active_investigations": "Investigaciones Activas",
    "points": "puntos",
    "report_issue": "Reportar Asunto Cívico",
    "nearby_alerts": "Alertas Urgentes Cercanas",
    "verified_feed": "Canal de Casos Verificados",
    "resolution_board": "Tablero de Resoluciones",
    "honor_leaderboard": "Tabla de Clasificación",
    "repair_visuals": "Visualizaciones de Reparación",
    "all_categories": "Todas las Categorías",
    "potholes": "Baches en Calles",
    "garbage": "Basura y Residuos",
    "leakage": "Fugas de Agua",
    "streetlight": "Alumbrado Público",
    "other": "Otras Preocupaciones",
    "unresolved_count": "Casos Pendientes",
    "resolved_count": "Casos Resueltos",
    "live_satellite": "Red de Rastreo Satelital",
    "interactive_map": "Mapa Interactivo de Calor",
    "dispatch_active": "Despacho GPS Activo",
    "welcome_back": "Bienvenido de nuevo",
    "citizen_rookie": "Novato Ciudadano",
    "xp_points": "Puntos de XP",
    "reports": "Reportes",
    "upvotes": "Votos",
    "badge_count": "Insignias",
    "slogan": "Corredor de Resolución y Verificación Municipal Descentralizado Guiado por IA",
    "admin_corridor": "Corredor del Agente CivicAI - Entorno de Pruebas Seguro",
    "powered_by": "Desarrollado por Google Gemini 2.5 Pro Vision & Firebase • Edición Tonos Naturales",
    "select_category": "Filtrar por Categoría",
    "pothole": "Daños por Baches",
    "waste": "Basura y Desechos",
    "water_leak": "Fuga de Agua",
    "street_lamp": "Defecto de Alumbrado",
    "other_issue": "Peligro General",
    "loading": "Sincronizando Inteligencia Cívica Central...",
    "sub_bar_reported": "Reportes de Casos Procesados",
    "sub_bar_urgency": "Protocolos de Emergencia Cargados",
    "sub_bar_sync": "Servidor en la Nube Sincronizado",
    "sub_bar_points": "Fondo de XP Comunitario",
    "verify_assess": "Verificar y Evaluar con Gemini Vision",
    "queue_offline": "Hacer Cola de Reporte Fuera de Línea",
    "discard": "Descartar",
    "lodge_report": "Presentar Reporte y Ganar XP",
    "report_lodged": "¡Reporte Presentado! +100 XP"
  },
  te: {
    "civicai_agent": "సివిక్AI ఏజెంట్",
    "citizen_portal": "పౌర పోర్టల్",
    "municipal_dashboard": "మునిసిపల్ డ్యాష్‌బోర్డ్",
    "sign_out": "సైన్ అవుట్",
    "connected": "కనెక్ట్ అయింది",
    "offline_mode": "ఆఫ్‌లైన్ మోడ్",
    "active_investigations": "క్రియాశీల విచారణలు",
    "points": "పాయింట్లు",
    "report_issue": "సమస్యను నివేదించండి",
    "nearby_alerts": "సమీప అత్యవసర హెచ్చరికలు",
    "verified_feed": "ధృవీకరించబడిన కేసు ఫీడ్",
    "resolution_board": "పరిష్కార బోర్డు",
    "honor_leaderboard": "గౌరవ లీడర్‌బోర్డ్",
    "repair_visuals": "మరమ్మతు విజువలైజేషన్స్",
    "all_categories": "అన్ని వర్గాలు",
    "potholes": "రోడ్డు గుంతలు",
    "garbage": "చెత్త కుప్పలు",
    "leakage": "నీటి లీకేజీలు",
    "streetlight": "వీధి దీపాలు",
    "other": "ఇతర సమస్యలు",
    "unresolved_count": "పరిష్కరించని సమస్యలు",
    "resolved_count": "పరిష్కరించబడిన సమస్యలు",
    "live_satellite": "శాటిలైట్ ట్రాకింగ్ గ్రిడ్",
    "interactive_map": "ఇంటరాక్టివ్ జియో-స్పేషియల్ మ్యాప్",
    "dispatch_active": "జీపీఎస్ డిస్పాచ్ యాక్టివ్",
    "welcome_back": "మళ్లీ స్వాగతం",
    "citizen_rookie": "సిటిజన్ రూకీ",
    "xp_points": "ఎక్స్‌పీ పాయింట్లు",
    "reports": "నివేదికలు",
    "upvotes": "ఓట్లు",
    "badge_count": "బ్యాడ్జీలు",
    "slogan": "వికేంద్రీకృత మునిసిపల్ సమస్యల పరిష్కార & ధృవీకరణ వేదిక",
    "admin_corridor": "సివిక్AI ఏజెంట్ కారిడార్ - సురక్షితమైన పూర్తి-స్టాక్ పర్యావరణం",
    "powered_by": "గూగుల్ జెమిని 2.5 ప్రో విజన్ మోడల్స్ మరియు ఫైర్‌బేస్ క్లౌడ్ ద్వారా నడపబడుతోంది",
    "select_category": "వర్గం ఫిల్టర్ ఎంచుకోండి",
    "pothole": "రోడ్డు గుంత",
    "waste": "చెత్త & వ్యర్థాలు",
    "water_leak": "నీటి లీకేజీ",
    "street_lamp": "వీధి దీపం సమస్య",
    "other_issue": "సాధారణ ప్రమాదం",
    "loading": "కేంద్ర పౌర సమాచారాన్ని సమకాలీకరిస్తోంది...",
    "sub_bar_reported": "ప్రక్రియ పూర్తి చేసిన నివేదికలు",
    "sub_bar_urgency": "అత్యవసర ప్రోటోకాల్స్ లోడ్ అయ్యాయి",
    "sub_bar_sync": "క్లౌడ్ సర్వర్ సమకాలీకరించబడింది",
    "sub_bar_points": "కమ్యూనిటీ ఎక్స్‌పీ పూల్",
    "verify_assess": "జెమిని విజన్‌తో తనిఖీ చేయండి",
    "queue_offline": "ఆఫ్‌లైన్‌లో నివేదికను క్యూ చేయండి",
    "discard": "తిరస్కరించు",
    "lodge_report": "రిపోర్ట్ సమర్పించి XP సంపాదించండి",
    "report_lodged": "రిపోర్ట్ సమర్పించబడింది! +100 XP"
  },
  hi: {
    "civicai_agent": "सिविकAI एजेंट",
    "citizen_portal": "नागरिक पोर्टल",
    "municipal_dashboard": "नगरपालिका डैशबोर्ड",
    "sign_out": "साइन आउट",
    "connected": "कनेक्टेड",
    "offline_mode": "ऑफ़लाइन मोड",
    "active_investigations": "सक्रिय जांच",
    "points": "अंक",
    "report_issue": "नागरिक समस्या रिपोर्ट करें",
    "nearby_alerts": "पास की आपातकालीन अलर्ट",
    "verified_feed": "सत्यापित मामले फ़ीड",
    "resolution_board": "समाधान बोर्ड",
    "honor_leaderboard": "सम्मान लीडरबोर्ड",
    "repair_visuals": "मरम्मत दृश्य",
    "all_categories": "सभी श्रेणियां",
    "potholes": "सड़क के गड्ढे",
    "garbage": "कचरा डंपिंग",
    "leakage": "पानी का रिसाव",
    "streetlight": "स्ट्रीट लाइट",
    "other": "अन्य चिंताएं",
    "unresolved_count": "अनसुलझे मुद्दे",
    "resolved_count": "सुलझाए गए मुद्दे",
    "live_satellite": "लाइव सैटेलाइट ट्रैकिंग ग्रिड",
    "interactive_map": "इंटरैक्टिव भू-स्थानिक मानचित्र",
    "dispatch_active": "जीपीएस प्रेषण सक्रिय",
    "welcome_back": "वापसी पर स्वागत है",
    "citizen_rookie": "नागरिक नवागंतुक",
    "xp_points": "एक्सपी अंक",
    "reports": "रिपोर्ट",
    "upvotes": "अपवोट",
    "badge_count": "बैज",
    "slogan": "विकेंद्रीकृत एआई-नेतृत्व वाली नगरपालिका समाधान और सत्यापन मंच",
    "admin_corridor": "सिविकAI एजेंट कॉरिडोर - सुरक्षित सैंडबॉक्स वातावरण",
    "powered_by": "गूगल जेमिनी 2.5 प्रो विज़न मॉडल और फ़ायरबेस क्लाउड द्वारा संचालित",
    "select_category": "श्रेणी फ़िल्टर चुनें",
    "pothole": "गड्ढे का नुकसान",
    "waste": "कचरा और अपशिष्ट",
    "water_leak": "पानी का रिसाव",
    "street_lamp": "स्ट्रीटलाइट दोष",
    "other_issue": "सामान्य खतरा",
    "loading": "केंद्रीय नागरिक सूचना को सिंक्रनाइज़ कर रहा है...",
    "sub_bar_reported": "मामला रिपोर्ट संसाधित",
    "sub_bar_urgency": "आपातकालीन प्रोटोकॉल लोड किया गया",
    "sub_bar_sync": "क्लाउड सर्वर सिंक किया गया",
    "sub_bar_points": "समुदाय एक्सपी पूल",
    "verify_assess": "जेमिनी विज़न के साथ सत्यापित करें",
    "queue_offline": "ऑफ़लाइन रिपोर्ट कतारबद्ध करें",
    "discard": "खारिज करें",
    "lodge_report": "रिपोर्ट दर्ज करें और XP अर्जित करें",
    "report_lodged": "रिपोर्ट दर्ज की गई! +100 XP"
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("civicai_language");
    return (saved as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("civicai_language", lang);
  };

  const t = (key: string, fallback?: string): string => {
    const translation = translations[language]?.[key];
    if (translation) return translation;
    const englishFallback = translations["en"]?.[key];
    return englishFallback || fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
};
