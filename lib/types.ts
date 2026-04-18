export type Role = "admin" | "member";

export type Session = {
  username: string;
  role: Role;
  memberName?: string;
};

export type DailyWork = {
  id?: number;
  date: string;
  name: string;
  platform: string;
  activity: string;
  status: "done" | "progress" | "pending";
  notes: string;
};

export type ReportItem = {
  id?: number;
  date: string;
  name: string;
  platform: string;
  type: "post" | "komentar";
  desc: string;
  links: string[];
  image: string;
  notes: string;
};

export type IrData = {
  id?: number;
  date: string;
  sosmed: string;
  tim: string;
  color: string;
  anggota: string;
  periode: string;
  bulan: string;
  realisasi: number;
  realisasi_label: string;
  output: number;
  output_label: string;
  issue: string;
  level: string;
  status: string;
  izin: string;
};

export type SocAccount = {
  id?: number;
  owner: string;
  platform: string;
  username: string;
  email: string;
  password: string;
  notes: string;
};

export type Asset = {
  id?: number;
  title: string;
  type: "foto" | "video";
  caption: string;
  link: string;
  image: string;
  date: string;
  provider: string;
  notes: string;
  status: "available" | "used";
};

export type Platform = {
  id?: number;
  name: string;
  icon: string;
  color: string;
  followers: number;
  following: number;
  posts: number;
  eng: number;
  growth: number;
  growth_pct: number;
  hex: string;
};

export type TeamMember = {
  id?: number;
  name: string;
  role: string;
  color: string;
  platform: string;
  status: string;
  phone: string;
  code: string;
  username: string;
  password: string;
  group: string;
};

export type ActivityLog = {
  id?: number;
  who: string;
  action: string;
  detail: string;
  created_at?: string;
};
