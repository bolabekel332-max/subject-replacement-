/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TAHAP 6: CHAT TRIGGER SEMANTIC CONVERTER
 * Deterministic, offline dictionary-based converter for user directives.
 * Converts Indonesian directive phrases into weighted English prompt tokens
 * without calling any AI model or external API.
 */

// 1. Multi-word phrase mapping (sorted by descending phrase length to ensure greedy match)
const PHRASE_DICTIONARY: [string, string][] = [
  // Compound accessories & eyewear
  ["kacamata hitam aviator", "black aviator sunglasses"],
  ["kacamata aviator hitam", "black aviator sunglasses"],
  ["kacamata aviator", "aviator sunglasses"],
  ["kacamata hitam", "black sunglasses"],
  ["kacamata frame tebal", "thick-rimmed glasses"],
  ["kacamata bingkai tebal", "thick-rimmed glasses"],
  ["kacamata baca", "reading glasses"],
  ["kacamata renang", "swimming goggles"],
  ["kacamata bulat", "round glasses"],
  ["kacamata kotak", "square glasses"],
  ["jam tangan emas", "gold wristwatch"],
  ["jam tangan perak", "silver wristwatch"],
  ["jam tangan digital", "digital wristwatch"],
  ["jam tangan", "wristwatch"],
  ["topi baseball", "baseball cap"],
  ["topi kupluk", "beanie cap"],
  ["topi jerami", "straw hat"],
  ["topi fedora", "fedora hat"],
  ["ikat pinggang kulit", "leather belt"],
  ["ikat pinggang", "belt"],
  ["dasi kupu-kupu", "bow tie"],
  ["anting bulat", "hoop earrings"],
  ["kalung emas", "gold necklace"],
  ["kalung perak", "silver necklace"],
  ["cincin kawin", "wedding ring"],

  // Compound clothing & outerwear
  ["jaket kulit hitam", "black leather jacket"],
  ["jaket kulit cokelat", "brown leather jacket"],
  ["jaket kulit coklat", "brown leather jacket"],
  ["jaket kulit merah", "red leather jacket"],
  ["jaket kulit biru", "blue leather jacket"],
  ["jaket kulit putih", "white leather jacket"],
  ["jaket kulit", "leather jacket"],
  ["jaket denim hitam", "black denim jacket"],
  ["jaket denim biru", "blue denim jacket"],
  ["jaket denim", "denim jacket"],
  ["jaket jeans", "denim jacket"],
  ["jaket bomber", "bomber jacket"],
  ["jaket parasut", "windbreaker jacket"],
  ["celana jeans hitam", "black jeans"],
  ["celana jeans biru", "blue jeans"],
  ["celana jeans", "jeans"],
  ["celana panjang", "trousers"],
  ["celana pendek", "shorts"],
  ["celana chino", "chino pants"],
  ["celana kain", "dress pants"],
  ["kaos oblong", "t-shirt"],
  ["kaos polos", "plain t-shirt"],
  ["kaos hitam", "black t-shirt"],
  ["kaos putih", "white t-shirt"],
  ["kemeja flanel", "flannel shirt"],
  ["kemeja putih", "white shirt"],
  ["sepatu kets", "sneakers"],
  ["sepatu bot", "boots"],
  ["sepatu lari", "running shoes"],
  ["sepatu kulit", "leather shoes"],

  // Compound hair & grooming
  ["rambut sedikit berantakan", "slightly messy hair"],
  ["rambut berantakan", "messy hair"],
  ["rambut kuncir kuda", "ponytail hair"],
  ["rambut sebahu", "shoulder-length hair"],
  ["rambut pendek", "short hair"],
  ["rambut panjang", "long hair"],
  ["rambut ikal", "wavy hair"],
  ["rambut keriting", "curly hair"],
  ["rambut lurus", "straight hair"],
  ["rambut pirang", "blonde hair"],
  ["rambut hitam", "black hair"],
  ["rambut cokelat", "brown hair"],
  ["rambut coklat", "brown hair"],

  // Compound expression & pose
  ["senyum tipis", "subtle smile"],
  ["senyum lebar", "wide smile"],
  ["ekspresi santai", "relaxed expression"],
  ["ekspresi serius", "serious expression"],
  ["ekspresi bahagia", "happy expression"],
  ["ekspresi ceria", "cheerful expression"],
  ["ekspresi tenang", "calm expression"],
  ["ekspresi datar", "neutral expression"],
  ["tangan di saku", "hands in pockets"],
  ["melipat tangan", "arms crossed"],
  ["menatap kamera", "looking at camera"],
  ["melihat ke kamera", "looking at camera"],
  ["melihat kamera", "looking at camera"],
  ["melihat ke bawah", "looking down"],
  ["melihat ke samping", "looking sideways"],

  // Compound colors
  ["merah muda", "pink"],
  ["biru tua", "navy blue"],
  ["biru muda", "light blue"],
  ["hijau tua", "dark green"],
  ["hijau muda", "light green"],
  ["kuning cerah", "bright yellow"],
  ["abu-abu", "grey"],
  ["merah marun", "maroon"],

  // Directive verbs & subject qualifiers
  ["subjek memakai", "wearing"],
  ["subjek kenakan", "wearing"],
  ["subjek gunakan", "wearing"],
  ["subjek mengenakan", "wearing"],
  ["subjek menggunakan", "wearing"],
  ["sedikit berantakan", "slightly messy"],
  ["lebih rapi", "neater"],
  ["tanpa kacamata", "without glasses"]
];

// 2. Single word dictionary
const WORD_DICTIONARY: Record<string, string> = {
  // Directives & prepositions
  "subjek": "subject",
  "memakai": "wearing",
  "kenakan": "wearing",
  "mengenakan": "wearing",
  "menggunakan": "wearing",
  "pakai": "wearing",
  "gunakan": "using",
  "dengan": "with",
  "tanpa": "without",
  "dan": "and",
  "warna": "color",
  "buat": "",
  "buatlah": "",
  "tolong": "",
  "tambahkan": "",
  "berikan": "",
  "jadikan": "",

  // Accessories
  "kacamata": "glasses",
  "topi": "hat",
  "kupluk": "beanie",
  "sepatu": "shoes",
  "sandal": "sandals",
  "sabuk": "belt",
  "gesper": "belt",
  "syal": "scarf",
  "selendang": "scarf",
  "dasi": "tie",
  "tas": "bag",
  "ransel": "backpack",
  "kalung": "necklace",
  "anting": "earrings",
  "cincin": "ring",
  "gelang": "bracelet",
  "masker": "face mask",
  "sarung": "gloves",

  // Clothing
  "jaket": "jacket",
  "kaos": "t-shirt",
  "baju": "shirt",
  "kemeja": "shirt",
  "pakaian": "outfit",
  "celana": "pants",
  "rok": "skirt",
  "gaun": "dress",
  "jas": "suit",
  "blazer": "blazer",
  "hoodie": "hoodie",
  "sweater": "sweater",
  "rompi": "vest",

  // Hair & face
  "rambut": "hair",
  "kumis": "mustache",
  "jenggot": "beard",
  "cambang": "sideburns",
  "tato": "tattoo",

  // Colors
  "hitam": "black",
  "putih": "white",
  "merah": "red",
  "biru": "blue",
  "hijau": "green",
  "kuning": "yellow",
  "cokelat": "brown",
  "coklat": "brown",
  "ungu": "purple",
  "pink": "pink",
  "oranye": "orange",
  "jingga": "orange",
  "kelabu": "grey",
  "emas": "gold",
  "perak": "silver",
  "gelap": "dark",
  "terang": "bright",

  // Actions & expressions
  "tersenyum": "smiling",
  "senyum": "smile",
  "tertawa": "laughing",
  "berdiri": "standing",
  "duduk": "sitting",
  "berjalan": "walking",
  "bersandar": "leaning",
  "menoleh": "turning head",
  "santai": "relaxed",
  "serius": "serious",
  "ceria": "cheerful",
  "bahagia": "happy",
  "sedih": "sad",
  "marah": "angry"
};

/**
 * Normalizes input text and applies multi-word and single-word mappings.
 * Words already in English or not in the dictionary are preserved as-is.
 */
export function translateChatTrigger(triggerText: string): string[] {
  if (!triggerText || typeof triggerText !== 'string' || !triggerText.trim()) {
    return [];
  }

  // Pre-clean: lower-case, collapse spaces
  let text = triggerText.toLowerCase().trim();

  // Remove leading/trailing filler punctuation
  text = text.replace(/^[.,:;!?\s]+|[.,:;!?\s]+$/g, "");

  // 1. Multi-word phrase substitution
  for (const [idPhrase, enPhrase] of PHRASE_DICTIONARY) {
    const regex = new RegExp(`\\b${escapeRegExp(idPhrase)}\\b`, 'gi');
    text = text.replace(regex, enPhrase);
  }

  // 2. Single word substitution
  const words = text.split(/\s+/).filter(Boolean);
  const translatedWords = words.map(word => {
    // Strip trailing punctuation from word for lookup
    const cleanWord = word.replace(/[^a-zA-Z0-9-]/g, "");
    if (WORD_DICTIONARY[cleanWord] !== undefined) {
      const mapped = WORD_DICTIONARY[cleanWord];
      return word.replace(cleanWord, mapped);
    }
    return word; // Fallback: leave word as-is
  });

  // Re-join and clean up punctuation/redundant spaces
  let reconstructed = translatedWords
    .filter(w => w.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*/g, "; ")
    .trim();

  // Clean redundant artifacts like "wearing wearing" or leading/trailing commas
  reconstructed = reconstructed
    .replace(/\b(wearing)\s+\1\b/gi, "$1")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();

  if (!reconstructed) return [];

  // Split into discrete token segments if commas or 'and' are used as separators
  const rawSegments = reconstructed
    .split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  // If there are segments separated by comma, return each; otherwise single token
  return rawSegments.length > 0 ? rawSegments : [reconstructed];
}

/**
 * Formats translated trigger tokens with engine-specific emphasis and structure.
 * 
 * - SD: Weighted tokens in parentheses, e.g. `(black aviator sunglasses:1.2)`
 * - MJ: Natural descriptive phrases placed early in descriptive body, e.g. `wearing black aviator sunglasses`
 * - Nano: Natural language attribute clause in subject descriptor, e.g. `wearing black aviator sunglasses`
 */
export function formatChatTriggerForEngine(
  triggerText: string,
  engine: 'nano' = 'nano'
): string {
  const tokens = translateChatTrigger(triggerText);
  if (tokens.length === 0) return "";

  // In Nano, format as a natural language clause
  return tokens.join(", ");
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
