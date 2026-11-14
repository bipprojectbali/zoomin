/**
 * Semua teks landing page (Bahasa Indonesia) di satu tempat. Hanya klaim yang benar-benar ada di produk:
 * landing.copy.test.ts menolak kata yang menyiratkan fitur yang tidak ada.
 */

/** Tujuan CTA login: rute `/login` ditangani alur auth Google. */
export const LOGIN_HREF = "/login";

/** Id section yang menjadi target anchor nav/CTA. */
export const SECTION_IDS = {
  top: "top",
  main: "konten",
  features: "fitur",
  how: "cara-kerja",
  useCases: "kegunaan",
  faq: "faq",
} as const;

/** Meta SEO halaman `/`, dipasang oleh router. */
export const LANDING_META = {
  title: "zoomin — bandingkan banyak layar dalam satu meeting",
  description:
    "Ruang meeting video self-hosted: tiap peserta bisa membagikan beberapa layar sekaligus, host menata layout " +
    "panggung yang sama untuk semua.",
} as const;

export const NAV = {
  label: "Navigasi utama",
  links: [
    { href: `#${SECTION_IDS.features}`, label: "Fitur" },
    { href: `#${SECTION_IDS.how}`, label: "Cara kerja" },
    { href: `#${SECTION_IDS.useCases}`, label: "Kegunaan" },
    { href: `#${SECTION_IDS.faq}`, label: "FAQ" },
  ],
  login: "Masuk",
  skip: "Lewati ke konten",
} as const;

export const HERO = {
  eyebrow: "Meeting self-hosted untuk review berdampingan",
  titleLead: "Layar A, B, dan C.",
  titleRest: "Berdampingan, untuk semua peserta.",
  sub:
    "Setiap peserta bisa membagikan lebih dari satu layar. Host menata panggungnya — berdampingan, grid, atau " +
    "fokus — dan semua orang melihat susunan yang sama. Berjalan di server Anda sendiri.",
  ctaLogin: "Masuk dengan Google",
  ctaHow: "Lihat cara kerja",
  points: ["Banyak layar per peserta", "Layout diatur host", "Data di server sendiri"],
} as const;

/** Teks mockup panggung di hero (dekoratif, tetapi tombol template-nya bisa dicoba). */
export const MOCKUP = {
  label: "Contoh panggung zoomin dengan tiga layar dibagikan",
  room: "Review Desain Checkout",
  templatesLabel: "Coba template layout",
  templates: [
    { id: "side", label: "Berdampingan" },
    { id: "grid", label: "Grid" },
    { id: "focus", label: "Fokus" },
  ],
  hostNote: "Diatur host · sama untuk semua",
  screens: [
    { tag: "A", owner: "Rina · Layar 1", title: "Checkout v1" },
    { tag: "B", owner: "Rina · Layar 2", title: "Checkout v2" },
    { tag: "C", owner: "Dimas · Layar 1", title: "Checkout mobile" },
  ],
  cams: ["Rina", "Dimas", "Sari"],
} as const;

export const FEATURES = {
  title: "Dibuat untuk membandingkan, bukan sekadar presentasi",
  sub: "Fitur inti zoomin berpusat pada satu hal: melihat beberapa layar sekaligus tanpa bergantian.",
  items: [
    {
      icon: "screens",
      title: "Beberapa layar per peserta",
      body: "Bagikan dua jendela atau lebih sekaligus — versi lama dan baru, desktop dan mobile — tanpa berhenti dan mulai ulang.",
    },
    {
      icon: "layout",
      title: "Layout diatur host",
      body: "Host memilih template berdampingan, grid, atau fokus. Susunan yang sama tampil di layar semua peserta.",
    },
    {
      icon: "move",
      title: "Seret, ubah ukuran, perbesar",
      body: "Atur urutan tile dengan drag-drop dan ubah ukurannya. Peserta tetap bisa memperbesar tile di layarnya sendiri.",
    },
    {
      icon: "camera",
      title: "Kamera dan suara",
      body: "Wajah dan suara tetap hadir di strip kamera, terpisah dari panggung layar supaya fokus tidak terganggu.",
    },
    {
      icon: "invite",
      title: "Undangan per peran",
      body: "Kirim link undangan sebagai host, peserta, atau penonton. Penonton menyimak tanpa membagikan apa pun.",
    },
    {
      icon: "server",
      title: "Self-hosted",
      body: "Berjalan di server Anda sendiri di atas LiveKit. Room, akun, dan media meeting tetap di infrastruktur Anda.",
    },
  ],
} as const;

export const STEPS = {
  title: "Cara kerja",
  sub: "Dari login sampai komparasi layar dalam tiga langkah.",
  items: [
    { title: "Masuk dengan Google", body: "Login memakai akun Google. Admin membuat room dan menjadi host-nya." },
    { title: "Undang sesuai peran", body: "Bagikan link undangan untuk peserta yang presentasi atau penonton yang menyimak." },
    { title: "Bagikan dan tata", body: "Peserta membagikan beberapa layar; host menyusunnya untuk dibandingkan bersama." },
  ],
} as const;

export const USE_CASES = {
  title: "Dipakai untuk",
  items: [
    { tag: "A / B", title: "Review desain", body: "Tampilkan dua atau tiga varian berdampingan lalu putuskan bersama, tanpa bolak-balik berbagi layar." },
    { tag: "QA", title: "QA lintas perangkat", body: "Bandingkan tampilan desktop, tablet, dan mobile dari build yang sama dalam satu panggung." },
    { tag: "Kelas", title: "Training", body: "Instruktur menampilkan materi dan contoh praktik sekaligus; peserta mengikuti sebagai penonton." },
    { tag: "Demo", title: "Demo produk", body: "Perlihatkan dasbor admin dan tampilan pengguna bersebelahan agar alurnya mudah diikuti." },
  ],
} as const;

export const FAQ = {
  title: "Pertanyaan umum",
  items: [
    {
      q: "Berapa layar yang bisa dibagikan satu peserta?",
      a: "Lebih dari satu. Setiap layar tampil sebagai tile sendiri di panggung dan bisa diatur posisinya oleh host.",
    },
    {
      q: "Siapa yang mengatur layout?",
      a: "Host room. Pilihan template, urutan, dan ukuran tile berlaku untuk semua peserta. Memperbesar tile hanya mengubah tampilan di layar Anda sendiri.",
    },
    {
      q: "Apakah peserta perlu akun?",
      a: "Ya, semua orang masuk dengan akun Google, lalu bergabung ke room lewat link undangan sesuai perannya.",
    },
    {
      q: "Di mana data disimpan?",
      a: "Di server tempat zoomin dipasang. Media disalurkan lewat server LiveKit milik Anda sendiri.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Siap membandingkan layar bersama tim?",
  sub: "Masuk dengan akun Google untuk membuka lobby dan bergabung ke room Anda.",
  cta: "Masuk dengan Google",
} as const;

export const FOOTER = {
  label: "Tautan footer",
  rights: "zoomin. Meeting self-hosted di atas LiveKit.",
  top: "Kembali ke atas",
} as const;

/** Semua tautan yang dirender landing (dipakai test untuk memastikan tujuan valid). */
export const ALL_HREFS: readonly string[] = [
  ...NAV.links.map((l) => l.href),
  LOGIN_HREF,
  `#${SECTION_IDS.top}`,
  `#${SECTION_IDS.main}`,
];
