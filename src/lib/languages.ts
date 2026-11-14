/** Learn a language (a welcome-screen habit pill): the languages, phrase ideas, and what's approximate. */

export const DEFAULT_LANGUAGES = [
  "Italian",
  "Russian",
  "German",
  "Natick Algonquin",
  "Hebrew",
  "Phoenician",
  "Portuguese",
  "Spanish",
  "French",
  "Japanese",
  "Mandarin Chinese",
  "Classical Chinese (5th–7th century)",
  "Arabic",
  "Greek",
  "Hindi",
];

/** For the + (autocomplete). */
export const MORE_LANGUAGES = [
  "Amharic", "Ancient Greek", "Armenian", "Bengali", "Cantonese", "Catalan", "Cherokee", "Czech", "Danish", "Dutch", "Esperanto", "Finnish", "Georgian", "Hawaiian", "Hungarian", "Icelandic", "Indonesian", "Irish", "Korean", "Lakota", "Latin", "Navajo", "Norwegian", "Persian", "Polish", "Quechua", "Romanian", "Sanskrit", "Scottish Gaelic", "Swahili", "Swedish", "Tagalog", "Thai", "Tibetan", "Turkish", "Ukrainian", "Urdu", "Vietnamese", "Welsh", "Wampanoag", "Yiddish", "Yoruba", "Zulu",
];

/** Reconstructed or sparsely attested: their lines are best guesses, and say so. */
export const APPROXIMATE: Record<string, string> = {
  "natick algonquin": "Reconstructed from 17th-century sources (Eliot's Bible) and today's Wôpanâak revival: approximate.",
  wampanoag: "Being revived from 17th-century sources: approximate.",
  phoenician: "Known only from inscriptions: a reconstruction, approximate.",
  "ancient greek": "Pronunciation is reconstructed.",
  latin: "Classical pronunciation is reconstructed.",
  "classical chinese (5th–7th century)": "Written in its own characters; the pronunciation line is a reconstruction of Middle Chinese: approximate.",
  sanskrit: "",
};
export const approxNote = (lang: string) => APPROXIMATE[lang.toLowerCase()] || "";

export const PHRASE_IDEAS = ["Hello", "Thank you", "How are you?", "Nice to meet you", "Where is the bathroom?", "Peace be with you"];

export type Translation = { language: string; text: string; say?: string; approx?: string };
