export type SchoolStage = 'primary' | 'secondary';
export type CurriculumSubject = { name: string; category: string };

export const SCHOOL_STAGES: {
  value: SchoolStage;
  label: string;
  curriculum: string;
}[] = [
  {
    value: 'primary',
    label: 'Sekolah Rendah',
    curriculum: 'KSSR (Semakan 2017)',
  },
  { value: 'secondary', label: 'Sekolah Menengah', curriculum: 'KSSM' },
];

export const SCHOOL_YEARS: Record<SchoolStage, string[]> = {
  primary: ['Tahun 1', 'Tahun 2', 'Tahun 3', 'Tahun 4', 'Tahun 5', 'Tahun 6'],
  secondary: [
    'Tingkatan 1',
    'Tingkatan 2',
    'Tingkatan 3',
    'Tingkatan 4',
    'Tingkatan 5',
  ],
};

const items = (category: string, names: string[]): CurriculumSubject[] =>
  names.map((name) => ({ name, category }));

const primaryCore = [
  ...items('Bahasa', ['Bahasa Melayu', 'Bahasa Inggeris']),
  ...items('Teras', ['Matematik', 'Sains']),
  ...items('Agama dan nilai', ['Pendidikan Islam', 'Pendidikan Moral']),
  ...items('Kesihatan', ['Pendidikan Jasmani dan Pendidikan Kesihatan']),
  ...items('Kesenian', ['Pendidikan Seni Visual', 'Pendidikan Muzik']),
];
const primaryLanguages = items('Bahasa tambahan / vernakular', [
  'Bahasa Cina',
  'Bahasa Tamil',
  'Bahasa Arab',
  'Bahasa Iban',
  'Bahasa Kadazandusun',
  'Bahasa Semai',
]);
const lowerSecondary = [
  ...items('Bahasa', ['Bahasa Melayu', 'Bahasa Inggeris']),
  ...items('Teras', ['Matematik', 'Sains']),
  ...items('Kemanusiaan', ['Sejarah', 'Geografi']),
  ...items('Agama dan nilai', ['Pendidikan Islam', 'Pendidikan Moral']),
  ...items('Kesihatan dan kesenian', [
    'Pendidikan Jasmani dan Pendidikan Kesihatan',
    'Pendidikan Seni Visual',
    'Pendidikan Muzik',
  ]),
  ...items('Teknologi', ['Reka Bentuk dan Teknologi', 'Asas Sains Komputer']),
  ...items('Bahasa tambahan', [
    'Bahasa Arab',
    'Bahasa Cina',
    'Bahasa Tamil',
    'Bahasa Iban',
    'Bahasa Kadazandusun',
    'Bahasa Semai',
  ]),
  ...items('Bahasa antarabangsa', [
    'Bahasa Perancis',
    'Bahasa Jerman',
    'Bahasa Jepun',
    'Bahasa Korea',
  ]),
  ...items('Kurikulum Bersepadu Dini', [
    'Maharat Al-Quran',
    'Usul Al-Din',
    'Al-Syariah',
    "Al-Lughah Al-'Arabiah Al-Mu'asirah",
  ]),
];
const upperSecondary = [
  ...items('Teras', [
    'Bahasa Melayu',
    'Bahasa Inggeris',
    'Matematik',
    'Sains',
    'Sejarah',
    'Pendidikan Islam',
    'Pendidikan Moral',
    'Pendidikan Jasmani dan Pendidikan Kesihatan',
  ]),
  ...items('STEM', [
    'Matematik Tambahan',
    'Fizik',
    'Kimia',
    'Biologi',
    'Sains Komputer',
  ]),
  ...items('STEM gunaan dan teknologi', [
    'Grafik Komunikasi Teknikal',
    'Asas Kelestarian',
    'Pertanian',
    'Sains Rumah Tangga',
    'Reka Cipta',
    'Sains Sukan',
  ]),
  ...items('Kemanusiaan dan sastera', [
    'Geografi',
    'Ekonomi',
    'Perniagaan',
    'Prinsip Perakaunan',
    'Pendidikan Seni Visual',
  ]),
  ...items('Kesusasteraan', [
    'Kesusasteraan Melayu Komunikatif',
    'Kesusasteraan Inggeris',
    'Kesusasteraan Cina',
    'Kesusasteraan Tamil',
  ]),
  ...items('Bahasa tambahan', [
    'Bahasa Arab',
    'Bahasa Cina',
    'Bahasa Tamil',
    'Bahasa Iban',
    'Bahasa Kadazandusun',
    'Bahasa Semai',
  ]),
  ...items('Bahasa antarabangsa', [
    'Bahasa Perancis',
    'Bahasa Jerman',
    'Bahasa Jepun',
    'Bahasa Korea',
  ]),
  ...items('Pengajian Islam', [
    'Pendidikan Al-Quran dan Al-Sunnah',
    'Pendidikan Syariah Islamiah',
    'Tasawwur Islam',
    'Hifz Al-Quran',
    'Maharat Al-Quran',
    'Turath Al-Quran dan Al-Sunnah',
    'Turath Dirasat Islamiah',
    'Turath Bahasa Arab',
    'Usul Al-Din',
    'Al-Syariah',
    "Al-Lughah Al-'Arabiah Al-Mu'asirah",
    'Manahij Al-Ulum Al-Islamiah',
    'Al-Adab Wa Al-Balaghah',
  ]),
  ...items('Elektif teknikal', [
    'Pengajian Kejuruteraan Awam',
    'Pengajian Kejuruteraan Elektrik dan Elektronik',
    'Pengajian Kejuruteraan Mekanikal',
    'Lukisan Kejuruteraan',
    'Pengajian Keusahawanan',
  ]),
  ...items('Mata pelajaran vokasional', [
    'Pembinaan Domestik',
    'Kerja Paip Domestik',
    'Pendawaian Domestik',
    'Kimpalan Arka dan Gas',
    'Menservis Automobil',
    'Menservis Motosikal',
    'Menservis Peralatan Penyejukan dan Penyamanan Udara',
    'Menservis Peralatan Elektrik Domestik',
    'Pembuatan Perabot',
    'Rekaan dan Jahitan Pakaian',
    'Katering dan Penyajian',
    'Pemprosesan Makanan',
    'Asuhan dan Pendidikan Awal Kanak-Kanak',
    'Penjagaan Muka dan Penggayaan Rambut',
    'Gerontologi Asas dan Geriatrik',
    'Landskap dan Nurseri',
    'Akuakultur dan Haiwan Rekreasi',
    'Tanaman Makanan',
    'Produksi Multimedia',
    'Produksi Reka Tanda',
    'Hiasan Dalaman',
  ]),
  ...items('Sekolah Seni Malaysia', [
    'Lukisan',
    'Sejarah dan Pengurusan Seni',
    'Seni Halus 2D',
    'Seni Halus 3D',
    'Reka Bentuk Grafik',
    'Multimedia Kreatif',
    'Reka Bentuk Kraf',
    'Reka Bentuk Industri',
    'Produksi Seni Persembahan',
    'Alat Muzik Utama',
    'Muzik Komputer',
    'Aural dan Teori Muzik',
    'Tarian',
    'Koreografi Tari',
    'Apresiasi Tari',
    'Lakonan',
    'Penulisan Skrip',
    'Sinografi',
  ]),
];

export function subjectsFor(
  stage: SchoolStage,
  year: string,
): CurriculumSubject[] {
  if (stage === 'secondary')
    return ['Tingkatan 4', 'Tingkatan 5'].includes(year)
      ? upperSecondary
      : lowerSecondary;
  const subjects = [...primaryCore, ...primaryLanguages];
  if (Number(year.replace(/\D/g, '')) >= 4)
    subjects.push(
      ...items('Kemanusiaan dan teknologi', [
        'Sejarah',
        'Reka Bentuk dan Teknologi',
      ]),
    );
  return subjects;
}

export function curriculumFor(stage: SchoolStage) {
  return SCHOOL_STAGES.find((item) => item.value === stage)?.curriculum ?? '';
}

const SUBJECT_ALIASES: Record<string, string> = {
  mathematics: 'Matematik',
  math: 'Matematik',
  physics: 'Fizik',
  chemistry: 'Kimia',
  biology: 'Biologi',
  science: 'Sains',
  history: 'Sejarah',
  geography: 'Geografi',
  economics: 'Ekonomi',
  business: 'Perniagaan',
  accounting: 'Prinsip Perakaunan',
};

export function resolveCurriculumSelection(classroom: {
  subject?: string;
  subjectName?: string;
  schoolStage?: SchoolStage;
  schoolYear?: string;
}) {
  const rawSubject = (classroom.subjectName || classroom.subject || '').split('·')[0].trim();
  const mappedSubject = SUBJECT_ALIASES[rawSubject.toLowerCase()] || rawSubject;
  const rawLabel = `${classroom.subject || ''} ${classroom.schoolYear || ''}`;
  const formMatch = rawLabel.match(/(?:Form|Tingkatan)\s*([1-5])/i);
  const yearMatch = rawLabel.match(/(?:Year|Tahun)\s*([1-6])/i);
  const stage: SchoolStage = classroom.schoolStage || (formMatch ? 'secondary' : 'primary');
  const fallbackYear = SCHOOL_YEARS[stage][0];
  const schoolYear = classroom.schoolYear || (formMatch ? `Tingkatan ${formMatch[1]}` : yearMatch ? `Tahun ${yearMatch[1]}` : fallbackYear);
  const validSubjects = subjectsFor(stage, schoolYear).map((subject) => subject.name);
  return {
    stage,
    schoolYear,
    subject: validSubjects.includes(mappedSubject) ? mappedSubject : '',
    legacySubject: validSubjects.includes(mappedSubject) ? '' : rawSubject,
  };
}
