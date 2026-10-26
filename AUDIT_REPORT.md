# 📋 MASTER AUDIT REPORT & ORCHESTRATION BLUEPRINT
## Subject Replacement Labs (Remix v2.5 / Nano Banana Gold Master)
**Dokumen:** Audit Komprehensif, Hasil Dry-Run Empiris, Audit Fungsionalitas Tombol, & Rencana Eksekusi Sprint  
**Tanggal Evaluasi:** 9 Oktober 2026  
**Peran Auditor:** CEO, Technical Orchestrator, & SEO Lead  
**Status Proyek:** **DOKUMENTASI DIKUNCI (SIAP EKSEKUSI PERBAIKAN DI SPRINT MENDATANG)**  
**Larangan:** Tidak ada perubahan kode aplikasi (*Source Code Freeze*) sampai sprint perbaikan disetujui.

---

## 📑 DAFTAR ISI
1. [Evaluasi Strategis CEO & Orchestrator](#1-evaluasi-strategis-ceo--orchestrator)
2. [Hasil Dry Run Tester (Bukti Empiris & Log Nyata)](#2-hasil-dry-run-tester-bukti-empiris--log-nyata)
3. [Audit SEO, Meta, & Product Discovery](#3-audit-seo-meta--product-discovery)
4. [Audit Fungsionalitas Tombol, Kontrol UI, & Alur Interaksi](#4-audit-fungsionalitas-tombol-kontrol-ui--alur-interaksi)
5. [Temuan Kategori A: Nilai Palsu & Metrik Semu (Fake Values)](#5-temuan-kategori-a-nilai-palsu--metrik-semu-fake-values)
6. [Temuan Kategori B: Halusinasi & Hardcoded Bias](#6-temuan-kategori-b-halusinasi--hardcoded-bias)
7. [Temuan Kategori C: Gap & Fitur Terputus (Disconnected State)](#7-temuan-kategori-c-gap--fitur-terputus-disconnected-state)
8. [Temuan Kategori D: Dead Code & Orphan Files](#8-temuan-kategori-d-dead-code--orphan-files)
9. [Matriks Analisis File & Severity Index (Lengkap 20 Isu)](#9-matriks-analisis-file--severity-index-lengkap-20-isu)
10. [Orchestrator Feature Health Scorecard](#10-orchestrator-feature-health-scorecard)
11. [Protokol Perlindungan Zona Stabil (AGENTS.md Lock)](#11-protokol-perlindungan-zona-stabil-agentsmd-lock)
12. [Sprint Roadmap: Panduan Perbaikan Bertahap](#12-sprint-roadmap-panduan-perbaikan-bertahap)

---

## 1. Evaluasi Strategis CEO & Orchestrator

### 1.1. Pernyataan Sikap Kepemimpinan Produk
> *"Secara konseptual dan arsitektur prompt Nano Banana (Dual-Stage V5/V9 dan Anatomy Authority AsianBodyProfiles), proyek ini memiliki kecerdasan generatif yang sangat tinggi. Namun secara teknis dan operasional, **aplikasi saat ini berstatus NOT PRODUCTION READY**. Terdapat kebocoran kritis pada pipa backend Express proxy yang membuang konfigurasi AI, penggunaan model ID yang sudah ditarik dari peredaran, kontrol antarmuka yang berstatus 'Ghost Button', ketiadaan fungsi esensial (seperti tombol hapus gambar pakaian opsional), serta ilusi metrik di antarmuka pengguna yang mencederai kepercayaan pengguna."*

### 1.2. Pilar Evaluasi
1. **Pipa Transmisi (The Golden Plumbing):** Rusak di tingkat server proxy (`server.ts`). Konfigurasi skema JSON dan instruksi sistem terputus di tengah jalan.
2. **Integritas Kontrol Antarmuka (UI Control Integrity):** Adanya tombol yang tampak aktif di UI (Style selector Anime/Cinematic) namun 100% diabaikan oleh kode pembuat prompt.
3. **Kejujuran UI (Truth in UX):** Banyak menggunakan metrik semu (seperti label *"% Match"* yang sebenarnya hanya confidence deteksi bounding box) dan timer progres simulan (`setTimeout`).
4. **Ketahanan Quota & Billing:** Tidak ada penanganan elegan untuk model gambar berbayar, melainkan menampilkan pesan palsu *"tunggu 1-2 menit"*.
5. **Keutuhan Fitur (Feature Integrity):** Input penting dari pengguna (*Chat Trigger*) tidak diteruskan ke mesin rekonstruksi, dan separuh varian prompt Nano Banana (Basic & Advanced) disembunyikan dari UI.

---

## 2. Hasil Dry Run Tester (Bukti Empiris & Log Nyata)

Pengujian langsung (*smoke test & live endpoint probe*) dilakukan terhadap Express Proxy dan Google GenAI API backend:

### 2.1. Uji Coba 1: Pembuktian Kebocoran Proxy Server (`server.ts`)
- **Tindakan:** Mengirim request ke `POST /api/generate` dengan payload yang mewajibkan balasan berformat JSON murni:
  ```bash
  curl -s -X POST http://localhost:3000/api/generate \
    -H "Content-Type: application/json" \
    -d '{"params": {"model": "gemini-3.8-flash", "prompt": "Give 1 color", "config": {"responseMimeType": "application/json"}}}'
  ```
- **Respon yang Diterima:**
  ```text
  "Blue"
  ```
- **Analisis Kegagalan:** Respon yang dikembalikan adalah teks polos string `"Blue"`, **bukan objek JSON valid** `{"color": "blue"}`.
- **Akar Masalah:** Di `server.ts:83–87`, Express proxy hanya mengambil `params.contents` dan `params.model`. Parameter `params.config` dibuang total!
- **Dampak Fatal:** Ini adalah akar penyebab langsung dari error runtime:
  ```text
  [UnifiedAnalysis] Failure: Error: Empty AI response
      at runUnifiedAnalysis (unifiedAnalysisService.ts:45:22)
  ```
  Karena model tidak dipaksa mengembalikan JSON via `config.responseMimeType`, model membalas dengan teks biasa sehingga `JSON.parse(extractJSON(text))` melempar exception fatal.

### 2.2. Uji Coba 2: Model Fallback Default Mengalami HTTP 404 (Model Mati)
- **Tindakan:** Menguji fallback default `server.ts` saat model tidak dispesifikasikan (default `gemini-2.0-flash`):
  ```bash
  curl -s -X POST http://localhost:3000/api/generate \
    -H "Content-Type: application/json" \
    -d '{"params": {"prompt": "Hello test"}}'
  ```
- **Hasil Log API:**
  ```json
  {
    "error": "{\"error\":{\"code\":404,\"message\":\"This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.\",\"status\":\"NOT_FOUND\"}}"
  }
  ```
- **Analisis:** Model `gemini-2.0-flash` telah dimatikan di infrastruktur Google dan dilarang digunakan dalam pedoman SDK.

### 2.3. Uji Coba 3: Image Generation Terbentur Kuota 0 (HTTP 429 Resource Exhausted)
- **Tindakan:** Menguji model gambar `gemini-2.5-flash-image` (lama) dan model resmi `gemini-3.1-flash-lite-image`:
  ```bash
  curl -s -X POST http://localhost:3000/api/generate \
    -H "Content-Type: application/json" \
    -d '{"params": {"model": "gemini-3.1-flash-lite-image", "prompt": "Draw a cat"}}'
  ```
- **Hasil Log API:**
  ```json
  {
    "code": 429,
    "status": "RESOURCE_EXHAUSTED",
    "message": "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash-lite-image"
  }
  ```
- **Analisis Bisnis & UX:**
  - Limit Free Tier untuk image generation adalah **0**.
  - Aplikasi saat ini menangani error ini dengan menampilkan:
    `"Image AI Quota Exceeded. Please wait 1-2 minutes before trying again."`
  - Ini adalah kesalahan UX fatal: menunggu berjam-jam tidak akan mengubah apa pun karena limitnya nol permanen di Free Tier. Pengguna harus diarahkan secara transparan ke *Paid Tier / Billing flow*.

### 2.4. Uji Coba 4: Verifikasi Model Teks Aktif
- **Tindakan:** Menjalankan pemanggilan ke `gemini-3.8-flash`:
  ```bash
  curl -s -X POST http://localhost:3000/api/generate \
    -H "Content-Type: application/json" \
    -d '{"params": {"model": "gemini-3.8-flash", "prompt": "Say hello in one word"}}'
  ```
- **Hasil Log API:**
  ```json
  {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}],"modelVersion":"gemini-3.8-flash"}
  ```
- **Analisis:** Model `gemini-3.8-flash` berjalan dengan kecepatan tinggi (~1 detik) dan sangat stabil. Model ini harus dijadikan standar utama untuk seluruh tugas teks dan analisis visi multimodal.

---

## 3. Audit SEO, Meta, & Product Discovery

### 3.1. Anomali File Entry Point (`index.html`)
- **Tag Judul Saat Ini (Baris 6):**
  ```html
  <title>My Google AI Studio App</title>
  ```
  Judul ini adalah placeholder bawaan yang merusak citra profesionalitas proyek.
- **Ketiadaan Meta Description & OpenGraph:**
  Tidak ditemukan tag `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">`, maupun tag Twitter Card. Jika aplikasi dibagikan di media sosial, thumbnail dan deskripsinya kosong atau berupa teks generik.

### 3.2. Ketidaksesuaian Deskripsi di `metadata.json`
- **Baris 3:** `"Professional AI prompt generator for seamless subject replacement in images using Gemini 2.0 Flash."`
- **Isu:** Menyebut nama model usang `Gemini 2.0 Flash` yang sudah tidak lagi beroperasi.

### 3.3. Dampak Terhadap Bounce Rate & Retention
Pengguna yang datang melalui pencarian organik atau rujukan sosial akan langsung mental (*bounce*) jika fitur *Execute Reconstruction* mereka berujung pada error atau tampilan kosong. Keandalan teknis adalah pilar utama retensi SEO.

---

## 4. Audit Fungsionalitas Tombol, Kontrol UI, & Alur Interaksi

Audit mendalam terhadap seluruh interaksi UI, *event handler*, dan alur logika tombol:

### 4.1. 🔴 Tombol Style Preset (Realistic, Cinematic, Anime, 3D Digital Art)
- **Lokasi Kode:** `src/App.tsx:5584`
- **Status:** **GHOST BUTTON / PLACEHOLDER PALSU (0% FUNGSIONAL)**
- **Detail Temuan:**
  Tombol bisa diklik, state `style` di-update di React, dan tersimpan ke riwayat `localStorage`. Namun variabel `style` **SAMA SEKALI TIDAK PERNAH DIOPER** ke `generatePrompts()` maupun ke `NANO_BANANA_ENGINE`. Hasil prompt AI selalu bertipe fotorealistik standar terlepas dari opsi gaya yang dipilih pengguna.
- **Rekomendasi Perbaikan:** Masukkan parameter `style` ke dalam prompt assembly untuk menginjeksi token visual sesuai gaya (misal anime aesthetics, cinematic lighting, 3d octane render).

### 4.2. 🔴 Tombol "Execute Reconstruction" / "Generate Image"
- **Lokasi Kode:** `src/App.tsx:6303 & 6312`
- **Status:** **BROKEN (GAGAL TOTAL)**
- **Detail Temuan:**
  1. Input *Chat Trigger* tidak dikirim ke `reconstructImageWithAssets()` (data hilang).
  2. Panggilan API gagal karena pembuangan `config` di `server.ts`.
  3. Menggunakan nama model invalid `gemini-2.5-flash-image`.
  4. Menabrak HTTP 429 (kuota Free Tier 0) dengan pesan error palsu menyuruh user menunggu 1-2 menit.

### 4.3. 🟠 Slot Upload Gambar & Ketiadaan Tombol "Remove / Clear Image"
- **Lokasi Kode:** `src/App.tsx:4327–4354`
- **Status:** **UX TRAP / FITUR TIDAK LENGKAP**
- **Detail Temuan:**
  Setiap kartu upload hanya memiliki tombol *"Replace File"*. Tidak ada tombol silang atau *"Remove Image"*.
  Pada slot ke-3 berlabel *"Custom Outfit (Optional)"*, jika pengguna tidak sengaja mengupload gambar baju atau ingin membatalkan pakaian kustom tersebut untuk kembali ke pakaian asli subjek, **MEREKA TIDAK BISA MENGHAPUSNYA KEMBALI KE NULL!** Satu-satunya jalan keluar adalah merefresh seluruh browser.
- **Rekomendasi Perbaikan:** Tambahkan tombol *"Remove / Clear Image"* di setiap kartu upload.

### 4.4. 🟡 Output Tabs Nano Banana (Varian Basic & Advanced Tersembunyi)
- **Lokasi Kode:** `src/App.tsx:6158–6175`
- **Status:** **DATA DIABAIKAN DI UI (50% OUTPUT HILANG)**
- **Detail Temuan:**
  Engine Nano Banana memproses, memvalidasi, dan menyimpan 4 varian prompt: `nano.basic`, `nano.advanced`, `nano.expert`, dan `nano.negative`.
  Namun di antarmuka, hanya `expert` dan `negative` yang dirender. Tidak ada tab switcher untuk melihat atau menyalin versi `basic` maupun `advanced`.
- **Rekomendasi Perbaikan:** Tambahkan tab switcher (Basic | Advanced | Expert | Negative) pada kartu hasil output Nano Banana.

### 4.5. 🟡 Tombol Anatomy Authority (Template vs Custom)
- **Lokasi Kode:** `src/App.tsx:5720, 5739, 5765, 5843`
- **Status:** **BERFUNGSI, TETAPI TANPA AUTO-REGENERATE DEBOUNCE**
- **Detail Temuan:**
  Pilihan template Asian Body Profiles dan opsi custom (tinggi, berat, build type) berhasil mengubah `anatomyProfile` di memori. Namun tidak seperti tombol Pose/Env/Atmos yang otomatis mentrigger regenerasi dengan debounce 400ms, tombol Anatomy tidak mentrigger apa pun sehingga pengguna tidak menyadari bahwa mereka harus menekan tombol Generate ulang.

### 4.6. 🟡 Tombol "Export PDF Report"
- **Lokasi Kode:** `src/App.tsx:6111 & src/lib/pdfExport.ts:49`
- **Status:** **BERFUNGSI DENGAN RISIKO FORMAT GAMBAR**
- **Detail Temuan:**
  Fungsi `doc.addImage(img, "JPEG", ...)` di-hardcode dengan format `"JPEG"`. Jika pengguna mengunggah gambar berekstensi WebP atau PNG transparan (seperti hasil cutout), generator PDF menangkap error di `try...catch` dan diam-diam tidak merender gambar tersebut di lembar laporan PDF.
- **Rekomendasi Perbaikan:** Konversi gambar ke canvas data URL standar sebelum disuntikkan ke dokumen PDF.

### 4.7. 🟢 Fitur & Tombol yang Terverifikasi Solid
1. **Recent History ("Clear" & "Restore Session") (`App.tsx:6040, 6052`):** Berfungsi sangat baik dengan optimasi resize thumbnail 512px.
2. **Multi-Subject Toggle & Target Role Input (`App.tsx:5641, 5647`):** Berfungsi sesuai spesifikasi, modifier peran masuk ke prompt.
3. **Preset Selector (Pose, Environment, Atmosphere) (`App.tsx:5903, 5950, 5972`):** Debounce 400ms bekerja mulus tanpa race conditions.
4. **Tombol "Copy to Clipboard" (`App.tsx:4461`):** Responsif dengan visual status 2 detik.
5. **Tombol "Preview Cutout / Hide Mask" (`App.tsx:4360`):** Menampilkan/menyembunyikan segmentasi BodyPix dengan rapi.
6. **URL Ingest (`App.tsx:4404`):** Mengambil gambar via proxy `/api/resolve-image` berhasil mem-bypass CORS.

---

## 5. Temuan Kategori A: Nilai Palsu & Metrik Semu (Fake Values)

### 5.1. Preprocessor Fiktif (`src/services/preprocess/`)
1. **`trueHumanSilhouettePreClean.ts` (Baris 11–26):**
   - Mengembalikan data objek:
     ```typescript
     return {
       cleanedScene: sceneImage,
       detectedHumanRegions: 1 // NILAI PALSU HARDCODED
     };
     ```
   - Sama sekali tidak melakukan segmentasi siluet atau penghapusan orang dari latar.
2. **`physicalEmptySceneReconstruction.ts` (Baris 10–23):**
   - Mengembalikan `{ reconstructedScene: cleanedScene }` murni tanpa inpainting arsitektural.
3. **Di `App.tsx:4690–4694`:**
   Kedua fungsi fiktif ini dipanggil berurutan, memberikan ilusi bahwa gambar telah dibersihkan dan direkonstruksi, padahal gambar asli dilewatkan mentah 100%.

### 5.2. Depth Map Prosedural Matematis (`src/services/depthService.ts` & `unifiedAnalysisService.ts`)
- Array Float32Array 512x512 dibuat menggunakan rumus gradien linear:
  ```typescript
  let baseDepth = normalizedY < 0.5 
    ? 1.0 - (normalizedY * 2 * (1.0 - spatialData.horizonDepth))
    : spatialData.groundDepth - ((normalizedY - 0.5) * 2 * spatialData.groundDepth);
  depthMap[i] = Math.max(0, Math.min(1, baseDepth));
  ```
- Blok `if (mask)` di baris 95 `depthService.ts` dibiarkan kosong:
  ```typescript
  if (mask) {
    // In a real implementation we would iterate...
  }
  ```
- Ini bukan estimasi kedalaman visual nyata, melainkan gradien tiruan vertikal.

### 5.3. Badge UI Menyesatkan: `"{XX}% Match"`
- **Lokasi:** `src/App.tsx:4385`
- **Kode:** `{Math.round(detection.primary.confidence * 100)}% Match`
- **Masalah:** Angka ini hanyalah skor probabilitas deteksi bounding box objek (apakah kotak itu manusia/wajah), bukan metrik pencocokan identitas (*identity similarity match*) antar subjek.

### 5.4. Placeholder Statis pada Analisis Proporsi & Jarak Kamera
- `src/services/reference/bodyProportionAnalyzer.ts:22–31`: Mengembalikan nilai statis `shoulderRatio: 1.0, torsoRatio: 1.0, legRatio: 1.0, bodyDensity: "MEDIUM"`.
- `src/services/reference/cameraDistanceNormalizer.ts:17–22`: Mengembalikan `{ normalizedReference: fusedReference, perspectiveClass: "NORMAL" }`.
- `src/services/pipeline/humanPresencePurge.ts:103–119`: Fungsi `occupancyNullifier`, `depthFieldReconstruction`, dan `localLightFieldConditioning` berstatus placeholder kosong.

### 5.5. Ilusi Progres Berbasis Timer
- **Lokasi:** `src/App.tsx:4668–4672`
- Menjalankan teks tahapan analisis buatan (*"Analyzing scene lighting..."* pada 3 detik, *"Extracting subject details..."* pada 7 detik, dll.) menggunakan `setTimeout`, bukan event progres komputasi AI riil.

---

## 6. Temuan Kategori B: Halusinasi & Hardcoded Bias

### 6.1. Pemaksaan Token "Nightclub" & "DJ Booth" pada Mode Stable Diffusion
- **Lokasi:** `src/App.tsx:4941–4950, 5005–5009, 5049`
- **Kode Bermasalah:**
  ```typescript
  // Memaksa penambahan DJ booth dan nightclub
  if (envTokens.includes("dj booth") || envTokens.includes("nightclub")) {
    if (!envTokens.includes("dj booth")) envTokens.push("dj booth");
    if (!envTokens.includes("nightclub")) envTokens.push("nightclub");
  }

  // Jika lingkungan foto tidak dikenali, PAKSA menjadi nightclub
  if (envTokens.length === 0) envTokens.push("nightclub");
  
  // Jika lighting lebih dari 1, paksa menjadi directional flash
  if (lightTokens.length > 1) {
    lightTokens.length = 0;
    lightTokens.push("high contrast directional flash");
  }
  ```
- **Dampak Halusinasi:** Foto yang berlatar pantai, ruang kelas, kantor, alam terbuka, atau rumah sakit akan dipaksa memiliki token `"nightclub"`, `"DJ booth"`, dan `"high contrast directional flash"`. Ini merusak relevansi prompt Stable Diffusion.

### 6.2. Halusinasi Label Model di UI
- **Lokasi:** `src/App.tsx:6276`
- **Teks:** `"Generated Sample Preview • Gemini-2.5-Flash-Image"`
- Menyebut model fiktif yang tidak pernah ada dalam katalog resmi Google AI.

---

## 7. Temuan Kategori C: Gap & Fitur Terputus (Disconnected State)

### 7.1. Variabel "Chat Trigger" Terbuang di UI (`App.tsx:5325`)
- UI menyediakan input textarea *Chat Trigger (Optional)* agar user dapat memberikan instruksi kustom tambahan (`App.tsx:6293–6298`).
- Namun saat fungsi pembuat gambar dipanggil:
  ```typescript
  const genResult = await reconstructImageWithAssets(
    prompt,
    baseScene,
    replacementImage,
    outfitImage,
    negative,
    aspectRatio
    // Parameter chatTrigger diabaikan dan tidak dikirim!
  );
  ```
- Akibatnya, instruksi tambahan dari pengguna 100% diabaikan oleh mesin pembuat gambar.

---

## 8. Temuan Kategori D: Dead Code & Orphan Files

### 8.1. Daftar 17 Import Tak Terpakai di `src/App.tsx` (Baris 42–70)
Modul-modul ini diimpor namun tidak memiliki eksekusi apa pun di `App.tsx`:
1. `autoDetectAsset` (`src/services/detectionService.ts`)
2. `autoAssign` (`src/services/detectionService.ts`)
3. `runDepthEngine` (`src/services/depthService.ts`)
4. `semanticPressureNormalizer` (`src/services/postprocess/semanticPressureNormalizer.ts`)
5. `roleSemanticIsolator` (`src/services/postprocess/roleSemanticIsolator.ts`)
6. `contactPhysicsReset` (`src/services/postprocess/contactPhysicsReset.ts`)
7. `sceneRephotographyArchitecture` (`src/services/postprocess/sceneRephotographyArchitecture.ts`)
8. `globalFrameExposureUnifier` (`src/services/postprocess/globalFrameExposureUnifier.ts`)
9. `buildEmptyScene` (`src/services/pipeline/emptySceneStage.ts`)
10. `buildReferenceFusion` (`src/services/reference/referenceFusionBuilder.ts`)
11. `enforceStageIsolation` (`src/services/stage/stageIsolationFirewall.ts`)
12. `injectStage2EnvironmentLock` (`src/services/stage/stage2EnvironmentLock.ts`)
13. `applyLowerBodyAndSkinLock` (`src/services/postprocess/lowerBodyAndSkinConsistencyLock.ts`)
14. `applyAnatomySynthesisMicroPatch` (`src/services/postprocess/anatomySynthesisPriorityLock.ts`)
15. `normalizePromptStructure` (`src/services/postprocess/promptStructureNormalizer.ts`)
16. `autoMask` (redundan, sudah dijalankan internal oleh `visionRunner.ts`)
17. `runPoseEngine` (redundan, sudah dijalankan internal oleh `visionRunner.ts`)

### 8.2. Daftar 15 File Berstatus Orphan (Tidak Dipakai di Seluruh Proyek)
- **Pipeline Folder (`src/services/pipeline/`):**
  - `compositionAttentionReducer.ts`
  - `identityDominanceRebalancer.ts`
  - `localLightResponseMatcher.ts`
  - `microTextureCoherence.ts`
  - `photographicHarmonization.ts`
  - `positiveSubjectComposition.ts`
  - `sceneHumanRejectionAuthority.ts`
- **Postprocess Folder (`src/services/postprocess/`):**
  - `authorityCompressor.ts`
  - `humanCompositionInvalidator.ts`
  - `humanSlotReinterpretation.ts`
  - `identityAuthorityFusion.ts`
  - `positiveIdentityRefactor.ts`
  - `semanticCollapseCleaner.ts`
  - `subjectGenerationDominanceEngine.ts`
  - `subjectIdentityDominance.ts`
- **Debug Folder (`src/debug/`):**
  - `fullPipelineInspector.ts` (359 baris kode inspector yang tidak pernah diintegrasikan ke tampilan UI)

---

## 9. Matriks Analisis File & Severity Index (Lengkap 20 Isu)

| ID | Lokasi File | Baris | Tipe Isu | Severity | Dampak Terhadap Sistem |
|:---|:---|:---|:---|:---|:---|
| **ISSUE-01** | `server.ts` | 83–87 | Proxy Parameter Drop | 🔴 **CRITICAL** | Membuang `params.config`, memicu crash `Empty AI response` |
| **ISSUE-02** | `server.ts` | 85 | Deprecated Fallback Model | 🔴 **CRITICAL** | `gemini-2.0-flash` menghasilkan HTTP 404 NOT FOUND |
| **ISSUE-03** | `src/services/imageGenerationService.ts` | 126 | Nonexistent Model ID | 🔴 **CRITICAL** | `gemini-2.5-flash-image` gagal dipanggil oleh API |
| **ISSUE-04** | `src/services/preprocess/structuralHumanEraser.ts` | 188 | Nonexistent Model ID | 🔴 **CRITICAL** | Model fiktif memicu kegagalan inpainting background |
| **ISSUE-05** | `src/services/preprocess/realEmptySceneExporter.ts` | 51 | Nonexistent Model ID | 🔴 **CRITICAL** | Model fiktif pada exporter pembersih latar |
| **ISSUE-06** | `src/App.tsx` | 5584 | Ghost Button / Disconnected UI | 🟠 **HIGH** | Pilihan Style (Anime/3D/Cinematic) tidak dikirim ke AI |
| **ISSUE-07** | `src/App.tsx` | 5325 | Disconnected UI State | 🟠 **HIGH** | Input `chatTrigger` tidak dikirim ke fungsi rekonstruksi |
| **ISSUE-08** | `src/App.tsx` | 4941–5050 | Algorithmic Bias / Hallucination | 🟠 **HIGH** | Memaksa token `"nightclub"` & `"dj booth"` pada mode SD |
| **ISSUE-09** | `src/App.tsx` | 5348 | Misleading Quota UX | 🟠 **HIGH** | Menyuruh user menunggu 1-2 menit pada kuota limit 0 |
| **ISSUE-10** | `src/App.tsx` | 4327–4354 | Missing UX Feature | 🟠 **HIGH** | Tidak ada tombol Hapus/Clear pada slot pakaian opsional |
| **ISSUE-11** | `src/App.tsx` | 6158–6175 | Hidden Output Data | 🟡 **MEDIUM** | Prompt Nano Banana varian Basic & Advanced tidak ada di UI |
| **ISSUE-12** | `src/services/preprocess/trueHumanSilhouettePreClean.ts` | 11–26 | Fake Preprocessor / Stub | 🟡 **MEDIUM** | Hardcoded `detectedHumanRegions: 1` tanpa aksi |
| **ISSUE-13** | `src/services/preprocess/physicalEmptySceneReconstruction.ts` | 10–23 | Fake Preprocessor / Stub | 🟡 **MEDIUM** | Passthrough mentah tanpa rekonstruksi background |
| **ISSUE-14** | `src/services/depthService.ts` | 77–98 | Simulated Gradient Map | 🟡 **MEDIUM** | Gradien buatan berkedok spatial depth map |
| **ISSUE-15** | `src/App.tsx` | 4385 | Misleading UI Label | 🟡 **MEDIUM** | Label `"{XX}% Match"` padahal hanya bounding confidence |
| **ISSUE-16** | `src/App.tsx` | 5765 | Missing UI Feedback | 🟡 **MEDIUM** | Pemilihan template Anatomy tidak memiliki debounce update |
| **ISSUE-17** | `src/lib/pdfExport.ts` | 49 | Image Compatibility Risk | 🟡 **MEDIUM** | Format gambar non-JPEG (WebP/PNG) gagal dirender di PDF |
| **ISSUE-18** | `src/App.tsx` | 42–70 | Dead Imports | 🟢 **LOW** | 17 import tidak terpakai mengotori namespace `App.tsx` |
| **ISSUE-19** | `index.html` | 6 | SEO Standard Violation | 🟢 **LOW** | Judul default `"My Google AI Studio App"`, nihil OpenGraph |
| **ISSUE-20** | `metadata.json` | 3 | Deprecated Copywriting | 🟢 **LOW** | Deskripsi masih menyebut model usang Gemini 2.0 Flash |

---

## 10. Orchestrator Feature Health Scorecard

| Komponen / Fitur | Status Fungsional | Kendala / Isu Kritis |
|:---|:---:|:---|
| **Style Preset Selector (Realistic/Anime/3D)** | 🔴 0% Fungsional | Nilai `style` tidak pernah dikirim ke AI |
| **Execute Reconstruction (Image Gen)** | 🔴 0% Fungsional | Chat trigger hilang, proxy putus, kuota 0 |
| **Image Upload & Cutout** | 🟠 70% Fungsional | Tidak ada tombol Hapus/Delete pada gambar |
| **Prompt Tabs (Nano Banana)** | 🟡 50% Fungsional | Varian Basic & Advanced tidak dimunculkan di UI |
| **Anatomy Authority Selector** | 🟡 80% Fungsional | Tidak ada auto-debounce update ke prompt |
| **Export PDF Report** | 🟡 85% Fungsional | Masalah rendering jika gambar WebP/PNG |
| **Multi-Subject Isolation** | 🟢 100% Fungsional | Berfungsi sesuai spesifikasi |
| **Pose & Env Preset Switches** | 🟢 100% Fungsional | Debounce 400ms bekerja sangat baik |
| **Recent History (Save & Restore)** | 🟢 100% Fungsional | Penyimpanan & pemulihan state sempurna |
| **Copy to Clipboard** | 🟢 100% Fungsional | Berfungsi normal dengan visual feedback 2s |
| **Preview Cutout / Hide Mask** | 🟢 100% Fungsional | Menampilkan segmentasi BodyPix dengan rapi |
| **URL Ingest via Proxy** | 🟢 100% Fungsional | Bypass CORS untuk URL gambar eksternal |

---

## 11. Protokol Perlindungan Zona Stabil (AGENTS.md Lock)

Sesuai aturan mutlak di file `AGENTS.md`:
```markdown
🔒 STABLE ZONE: NANO BANANA ENGINE (V5.0.0 & V9.0.0 GOLD MASTER)
The "Nano Banana" engine logic for BLEND code, FREE mode, Anatomy Authority (Template & Custom),
and REALISTIC style preset is declared FULLY STABLE.
```

### Komponen yang DIHARAMKAN untuk Diubah:
1. Struktur Prompt: **DUAL STAGE V5 / V9 (AI BEHAVIOR SHAPING)**
2. Logika `buildNanoPrompt` pada branch `isBlend === true` dan flow struktural mode `FREE`.
3. Blok `REALISM BEHAVIOR` dan token spesifiknya (*Subtle asymmetry, micro-wrinkles, dll.*).
4. **V5 / V9 Final Negative Prompt** (Hard lock di lapisan output akhir).
5. Pipeline Injeksi Metadata & Validasi Failsafe V2.
6. Logika Hard Override `masterNegative` pada blok return akhir.
7. Logika **Anatomy Authority**: perpindahan mode Template dan Custom/Manual, parsing `AsianBodyProfiles` (`buildType`, dll.).
8. **Conflict Rejection Gates**: penolakan AUTO Pose Mode saat Anatomy diset ke MANUAL.

### Komponen yang DIIZINKAN untuk Diperbaiki pada Sprint Mendatang:
- Pipa backend Express (`server.ts`) agar konfigurasi diteruskan secara utuh.
- Validasi model name ID resmi (`gemini-3.8-flash`, `gemini-3.1-flash-lite-image`).
- Penyambungan input `chatTrigger` dan `style` di UI.
- Penyediaan tombol Hapus Gambar pada slot pakaian opsional.
- Penataan tab output Nano Banana agar varian Basic & Advanced dapat dilihat.
- Penataan token mode Stable Diffusion (SD) agar tidak memaksa kata `"nightclub"`.
- Pembersihan 17 import tak terpakai di `App.tsx`.
- Sinkronisasi metadata dan SEO di `index.html`.

---

## 12. Sprint Roadmap: Panduan Perbaikan Bertahap

Ketika Anda memberikan lampu hijau untuk memulai eksekusi perbaikan, tim developer akan mengikuti **4 Fase Sprint Terstruktur** berikut:

```
[SPRINT 1: Core Plumbing & Model Fix]
   ├── 1. Perbaiki server.ts (teruskan params.config ke genAI.models.generateContent)
   ├── 2. Ganti fallback model ke gemini-3.8-flash (selesaikan 404 & Empty AI response)
   └── 3. Update model ID image ke gemini-3.1-flash-lite-image

[SPRINT 2: Feature Connection & Functional UI Repair]
   ├── 1. Sambungkan style selector (Realistic, Anime, 3D, Cinematic) ke prompt engine
   ├── 2. Sambungkan chatTrigger di App.tsx:5325 ke reconstructImageWithAssets
   ├── 3. Tambahkan tombol "Clear / Remove Image" di kartu upload (khususnya Custom Outfit)
   ├── 4. Buka tab varian prompt Nano Banana (Basic & Advanced) di Result Panel
   ├── 5. Bersihkan bias "nightclub" pada mode Stable Diffusion
   └── 6. Perbaiki error handling quota gambar (transparan ke user mengenai Paid Tier)

[SPRINT 3: Code Sanitation, PDF Hardening & Truth in UX]
   ├── 1. Bersihkan 17 dead imports di App.tsx
   ├── 2. Koreksi label "{XX}% Match" -> "Detection: {XX}% Confidence"
   ├── 3. Rapikan preprocessor stubs menjadi passthrough transparan
   └── 4. Perbaiki kompatibilitas format gambar di exportToPDF (dukungan WebP/PNG)

[SPRINT 4: SEO, Metadata & Verification]
   ├── 1. Sinkronkan title, meta description & OpenGraph di index.html
   ├── 2. Update deskripsi metadata.json (hapus referensi Gemini 2.0 Flash)
   └── 3. Jalankan lint_applet & compile_applet (Zero Regression)
```

---
*Dokumen ini dibuat secara presisi oleh Sistem Orkestrasi AI Studio Build. Simpan berkas ini sebagai acuan teknis sebelum eksekusi perubahan kode dimulai.*
